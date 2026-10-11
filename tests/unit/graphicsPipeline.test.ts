import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GRAPHICS_SETTINGS } from '../../src/render/graphicsSettings';
import { profileFromSettings, type QualityProfile } from '../../src/render/quality';
import { GTAO_LAYOUT, AO_SAMPLES, estimateCost, hasPass, passSpec, planPipeline, PASS_ORDER, type PassId } from '../../src/render/postfx/plan';
import { QUALITY_PRESETS, SETTINGS, SettingsReader, type QualityPreset, type SettingValue } from '../../src/settings';

const profileOf = (preset: QualityPreset, patch: Record<string, SettingValue> = {}): QualityProfile =>
  profileFromSettings(new SettingsReader(SETTINGS, { ...SETTINGS.defaults(preset), ...patch }));

const ids = (p: QualityProfile, w = 1920, h = 1080) => planPipeline(p, w, h).passes.map((s) => s.id);

describe('graphics settings → pipeline plan', () => {
  it('low keeps the simple forward path (one scene draw, no post chain)', () => {
    const p = profileOf('low');
    expect(p.postFx).toBe(false);
    const plan = planPipeline(p, 1280, 720);
    expect(plan.mode).toBe('forward');
    expect(plan.passes.map((s) => s.id)).toEqual(['scene']);
    expect(plan.width).toBe(1280);
  });

  it('medium is a light chain: bloom + FXAA, no AO/SSR/TAA/volumetrics', () => {
    const list = ids(profileOf('medium'));
    expect(list).toEqual(expect.arrayContaining(['scene', 'bloom', 'composite', 'fxaa', 'output']));
    for (const forbidden of ['ao', 'ssr', 'taa', 'volumetrics', 'smaa', 'motionBlur'] as PassId[]) expect(list).not.toContain(forbidden);
  });

  it('high adds SAO, SSR, volumetrics and SMAA; ultra switches to GTAO and TAA', () => {
    const high = profileOf('high');
    expect(high.ao).toBe('sao');
    expect(ids(high)).toEqual(expect.arrayContaining(['ao', 'ssr', 'volumetrics', 'bloom', 'smaa']));
    const ultra = profileOf('ultra');
    expect(ultra.ao).toBe('gtao');
    expect(ultra.aa).toBe('taa');
    expect(ids(ultra)).toEqual(expect.arrayContaining(['ao', 'ssr', 'volumetrics', 'taa', 'bloom', 'dof', 'motionBlur']));
  });

  it('extreme maxes everything: 200 % scale, 4×8192 cascades, GTAO ultra, SSR ultra, TAA, 8× MSAA, per-frame probe', () => {
    const p = profileOf('extreme');
    expect(p.renderScale).toBe(2);
    expect(p.shadowMapSize).toBe(8192);
    expect(p.shadowCascades).toBe(4);
    expect(p.ao).toBe('gtao');
    expect(p.aoQuality).toBe('ultra');
    expect(p.ssr).toBe('ultra');
    expect(p.aa).toBe('taa');
    expect(p.msaa).toBe(8);
    expect(p.envProbeInterval).toBe(1);
    expect(p.textures).toBe('4k');
    expect(p.anisotropy).toBe(16);
    const plan = planPipeline(p, 1920, 1080);
    expect(plan.width).toBe(3840);
    expect(plan.height).toBe(2160);
    expect(plan.msaa).toBe(8);
    for (const id of ['ao', 'ssr', 'volumetrics', 'taa', 'bloom', 'dof', 'motionBlur', 'composite', 'output'] as PassId[]) expect(hasPass(plan, id)).toBe(true);
    expect(passSpec(plan, 'ssr')!.samples).toBe(96);
    expect(passSpec(plan, 'ao')!.samples).toBe(AO_SAMPLES.gtao.ultra);
  });

  it('passes always run in the documented order', () => {
    for (const preset of QUALITY_PRESETS) {
      const order = ids(profileOf(preset)).map((id) => PASS_ORDER.indexOf(id));
      expect(order).toEqual([...order].sort((a, b) => a - b));
      expect(order.every((i) => i >= 0)).toBe(true);
    }
  });

  it('GTAO slice × step layout matches its sample budget', () => {
    for (const q of ['low', 'medium', 'high', 'ultra'] as const) expect(GTAO_LAYOUT[q][0] * GTAO_LAYOUT[q][1]).toBe(AO_SAMPLES.gtao[q]);
  });

  it('render cost grows with every step of the preset ladder and extreme is many times heavier than low', () => {
    const cost = QUALITY_PRESETS.map((preset) => {
      const p = profileOf(preset);
      return estimateCost(planPipeline(p, 1920, 1080), p.shadowCascades, p.shadowMapSize, p.shadows);
    });
    for (let i = 1; i < cost.length; i++) expect(cost[i]).toBeGreaterThan(cost[i - 1]);
    expect(cost[4] / cost[0]).toBeGreaterThan(12);
  });

  it('dynamic resolution only changes sizes, never the structure (no shader recompiles while riding)', () => {
    const p = profileOf('ultra');
    const full = planPipeline(p, 1920, 1080, 1);
    const scaled = planPipeline(p, 1920, 1080, 0.7);
    expect(scaled.key).toBe(full.key);
    expect(scaled.width).toBeLessThan(full.width);
    expect(passSpec(scaled, 'ao')!.width).toBeLessThan(passSpec(full, 'ao')!.width);
    expect(passSpec(scaled, 'output')!.width).toBe(1920);
  });

  it('toggling an effect changes the plan key', () => {
    const base = planPipeline(profileOf('high'), 1280, 720).key;
    expect(planPipeline(profileOf('high', { 'gfx.ao': 'off' }), 1280, 720).key).not.toBe(base);
    expect(planPipeline(profileOf('high', { 'fx.bloom': false }), 1280, 720).key).not.toBe(base);
    expect(planPipeline(profileOf('high', { 'gfx.aa': 'taa' }), 1280, 720).key).not.toBe(base);
    expect(planPipeline(profileOf('high', { 'gfx.msaa': '8' }), 1280, 720).key).not.toBe(base);
  });

  it('render scale below 100 % shrinks the internal target; the forward path caps it at 1×', () => {
    expect(planPipeline(profileOf('high', { 'gfx.renderScale': 50 }), 2000, 1000).width).toBe(1000);
    expect(planPipeline(profileOf('low', { 'gfx.renderScale': 200 }), 2000, 1000).width).toBe(2000);
  });
});

describe('every graphics option is wired', () => {
  const sourceFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? sourceFiles(p) : p.endsWith('.ts') ? [p] : [];
    });
  const consumers = sourceFiles('src')
    .filter((f) => !/render[\\/](quality|graphicsSettings)\.ts$/.test(f) && !/settings[\\/]/.test(f))
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');

  it('changing any option changes the render profile', () => {
    const base = SETTINGS.defaults('high');
    const baseProfile = JSON.stringify(profileFromSettings(new SettingsReader(SETTINGS, base)));
    const untouched: string[] = [];
    for (const def of GRAPHICS_SETTINGS) {
      if (def.key === 'gfx.preset') continue;
      const alts: SettingValue[] = def.type === 'toggle' ? [!base[def.key]] : def.type === 'select' ? def.options.map((o) => o.value) : [def.min, def.max];
      const changes = alts.some((v) => v !== base[def.key] && JSON.stringify(profileFromSettings(new SettingsReader(SETTINGS, { ...base, [def.key]: v }))) !== baseProfile);
      if (!changes) untouched.push(def.key);
    }
    expect(untouched).toEqual([]);
  });

  it('every profile field is consumed by the renderer, sky, world or pipeline code', () => {
    const profile = profileOf('high') as unknown as Record<string, unknown>;
    // Fields consumed only through the plan/overlay helpers are listed by the identifier used there.
    const unused = Object.keys(profile).filter((k) => !new RegExp(`[.\\s{,]${k}\\b`).test(consumers));
    expect(unused).toEqual([]);
  });

  it('has 50–70 options across graphics, effects and world', () => {
    const n = GRAPHICS_SETTINGS.length;
    expect(n).toBeGreaterThanOrEqual(50);
    expect(n).toBeLessThanOrEqual(70);
    expect(new Set(GRAPHICS_SETTINGS.map((d) => d.category))).toEqual(new Set(['graphics', 'effects', 'world']));
  });
});
