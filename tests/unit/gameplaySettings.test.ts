import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MODE_BY_ID, MODES, CAREER_MODE } from '../../src/data/modes';
import { GAMEPLAY_SETTINGS, applyTrafficSettings, autoThrottleActive } from '../../src/game/gameplaySettings';
import { SETTINGS } from '../../src/settings';

const SRC = join(__dirname, '..', '..', 'src');
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.(ts|css)$/.test(f)) out.push(p);
  }
  return out;
}

describe('gameplay settings', () => {
  it('are registered with sane defaults, Turkish labels and valid options', () => {
    expect(GAMEPLAY_SETTINGS.length).toBeGreaterThanOrEqual(8);
    for (const d of GAMEPLAY_SETTINGS) {
      expect(SETTINGS.get(d.key), d.key).toBe(d);
      expect(d.label.length).toBeGreaterThan(3);
      if (d.type === 'select') {
        expect(d.options.map((o) => o.value), d.key).toContain(d.default);
        expect(new Set(d.options.map((o) => o.value)).size).toBe(d.options.length);
      }
    }
    const defaults = SETTINGS.defaults('high');
    expect(defaults['play.trafficDensity']).toBe('normal');
    expect(defaults['play.difficulty']).toBe('normal');
    expect(defaults['play.autoThrottle']).toBe('off');
    expect(defaults['hud.missionPanel']).toBe(true);
  });

  it('every option is actually used by the game (no dead settings)', () => {
    const files = sourceFiles(SRC).filter((f) => !f.endsWith('gameplaySettings.ts'));
    const text = files.map((f) => readFileSync(f, 'utf8')).join('\n');
    for (const d of GAMEPLAY_SETTINGS) {
      if (d.key === 'play.autoShift') continue; // owned by the original controls
      expect(text.includes(`'${d.key}'`), `${d.key} is read somewhere`).toBe(true);
    }
  });

  it('rejects invalid stored values and falls back to the default', () => {
    const s = SETTINGS.sanitize({ 'play.trafficDensity': 'insane', 'play.difficulty': 'hard', 'play.autoThrottle': 3, 'hud.missionPanel': 'maybe' });
    expect(s['play.trafficDensity']).toBe('normal');
    expect(s['play.difficulty']).toBe('hard');
    expect(s['play.autoThrottle']).toBe('off');
    expect(s['hud.missionPanel']).toBe(true);
  });
});

describe('traffic settings', () => {
  const endless = MODE_BY_ID.get('endless')!;

  it('density scales the free modes', () => {
    const low = applyTrafficSettings(endless, 'low', 'normal').traffic;
    const normal = applyTrafficSettings(endless, 'normal', 'normal').traffic;
    const high = applyTrafficSettings(endless, 'high', 'normal').traffic;
    const extreme = applyTrafficSettings(endless, 'extreme', 'normal').traffic;
    expect(normal.baseDensity).toBe(endless.traffic.baseDensity);
    expect(low.baseDensity).toBeLessThan(normal.baseDensity);
    expect(high.baseDensity).toBeGreaterThan(normal.baseDensity);
    expect(extreme.baseDensity).toBeGreaterThan(high.baseDensity);
    expect(extreme.maxDensity).toBeGreaterThan(high.maxDensity);
    expect(low.maxDensity).toBeLessThan(normal.maxDensity);
  });

  it('difficulty changes how aggressively drivers change lanes, never above 1', () => {
    const easy = applyTrafficSettings(endless, 'normal', 'easy').traffic.aggression;
    const normal = applyTrafficSettings(endless, 'normal', 'normal').traffic.aggression;
    const hard = applyTrafficSettings(endless, 'normal', 'hard').traffic.aggression;
    expect(easy).toBeLessThan(normal);
    expect(hard).toBeGreaterThan(normal);
    for (const m of [...MODES, CAREER_MODE]) {
      for (const dif of ['easy', 'normal', 'hard']) expect(applyTrafficSettings(m, 'extreme', dif).traffic.aggression).toBeLessThanOrEqual(1);
    }
  });

  it('career missions keep their own traffic density but obey the difficulty', () => {
    const base = applyTrafficSettings(CAREER_MODE, 'normal', 'normal').traffic;
    const dense = applyTrafficSettings(CAREER_MODE, 'extreme', 'normal').traffic;
    expect(dense.baseDensity).toBe(base.baseDensity);
    expect(dense.maxDensity).toBe(base.maxDensity);
    expect(applyTrafficSettings(CAREER_MODE, 'normal', 'hard').traffic.aggression).toBeGreaterThan(base.aggression);
  });

  it('unknown values fall back to the normal behaviour and the input mode is never mutated', () => {
    const before = JSON.stringify(endless);
    const t = applyTrafficSettings(endless, 'wat', 'huh').traffic;
    expect(t.baseDensity).toBe(endless.traffic.baseDensity);
    expect(t.aggression).toBeCloseTo(endless.traffic.aggression, 6);
    expect(JSON.stringify(endless)).toBe(before);
  });
});

describe('auto-throttle setting', () => {
  it('is off, always on, or only on touch devices', () => {
    expect(autoThrottleActive('off', true)).toBe(false);
    expect(autoThrottleActive('off', false)).toBe(false);
    expect(autoThrottleActive('always', false)).toBe(true);
    expect(autoThrottleActive('always', true)).toBe(true);
    expect(autoThrottleActive('touch', true)).toBe(true);
    expect(autoThrottleActive('touch', false)).toBe(false);
    expect(autoThrottleActive('garbage', true)).toBe(false);
  });
});
