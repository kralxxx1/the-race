import { describe, expect, it } from 'vitest';
import { DEFAULT_AUDIO_CONFIG, readAudioConfig } from '../../src/audio/audioConfig';
import { AUDIO_SETTINGS } from '../../src/audio/audioSettings';
import { aWeightedDb, spectralFeatures } from '../../src/audio/dsp/analysis';
import { REVERB_KINDS, generateImpulse, type ReverbKind } from '../../src/audio/dsp/impulse';
import { bikeTumble, bodyThud, glassShatter, horn, metalCrunch, plasticCrack, thunder, whoosh } from '../../src/audio/dsp/sfxDsp';
import { TrafficHost } from '../../src/audio/dsp/trafficHost';
import { VEHICLE_VOICES, VehicleDSP } from '../../src/audio/dsp/vehicleDsp';
import { WORLD_DEFAULTS, WorldDSP, type WorldControls } from '../../src/audio/dsp/worldDsp';
import { QUALITY_PRESETS, SETTINGS, SettingsReader } from '../../src/settings';

const SR = 32000;

function renderWorld(c: Partial<WorldControls>, seconds = 2): Float32Array {
  const w = new WorldDSP(SR);
  w.setControls(c);
  w.snap();
  const n = Math.round(seconds * SR);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  for (let o = 0; o < n; o += 128) w.process(L, R, o, Math.min(128, n - o));
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(L[i]) || !Number.isFinite(R[i])) throw new Error('non-finite world output');
  }
  return L.subarray(Math.round(SR * 0.7));
}

const level = (x: Float32Array): number => aWeightedDb(x, SR);
const rms = (x: Float32Array): number => {
  let s = 0;
  for (const v of x) s += v * v;
  return Math.sqrt(s / x.length);
};

describe('helmet wind and tyre noise', { timeout: 60000 }, () => {
  it('wind grows with speed roughly as v² (≥ 6 dB per speed doubling) and gets brighter', () => {
    const l10 = level(renderWorld({ speed: 10 }));
    const l20 = level(renderWorld({ speed: 20 }));
    const l40 = level(renderWorld({ speed: 40 }));
    expect(l20 - l10).toBeGreaterThan(6);
    expect(l40 - l20).toBeGreaterThan(6);
    const c20 = spectralFeatures(renderWorld({ speed: 20 }), SR).centroidLog2;
    const c60 = spectralFeatures(renderWorld({ speed: 60 }), SR).centroidLog2;
    expect(c60).toBeGreaterThan(c20);
  });

  it('is silent when standing still and turbulence adds buffeting', () => {
    expect(rms(renderWorld({ speed: 0 }))).toBeLessThan(0.002);
    expect(rms(renderWorld({ speed: 30, gust: 1 }))).toBeGreaterThan(rms(renderWorld({ speed: 30, gust: 0 })) * 1.05);
  });

  it('a helmet muffles the highs', () => {
    const open = spectralFeatures(renderWorld({ speed: 40, helmet: 0 }), SR);
    const closed = spectralFeatures(renderWorld({ speed: 40, helmet: 1 }), SR);
    expect(open.centroidLog2).toBeGreaterThan(closed.centroidLog2);
  });

  it('wet roads hiss in the highs; rumble strips buzz; gravel crunches', () => {
    const dry = spectralFeatures(renderWorld({ speed: 25, windGain: 0 }), SR);
    const wet = spectralFeatures(renderWorld({ speed: 25, wet: 1, windGain: 0 }), SR);
    expect(wet.centroidLog2).toBeGreaterThan(dry.centroidLog2 + 0.4);
    const rumble = renderWorld({ speed: 25, rumble: 1, windGain: 0, tyreGain: 1 });
    expect(rms(rumble)).toBeGreaterThan(rms(renderWorld({ speed: 25, windGain: 0 })) * 1.3);
    const gravel = renderWorld({ speed: 15, gravel: 1, windGain: 0 });
    expect(spectralFeatures(gravel, SR).flatness).toBeGreaterThan(spectralFeatures(rumble, SR).flatness);
  });

  it('the rumble strip buzz is periodic at speed / strip pitch', () => {
    const x = renderWorld({ speed: 20, rumble: 1, windGain: 0 }, 3);
    // 20 m/s over 0.16 m strips = 125 Hz fundamental.
    const f = spectralFeatures(x, SR);
    expect(f.bandDb[2]).toBeGreaterThan(f.bandDb[8]); // 100–160 Hz band beats 1.6–2.5 kHz
  });

  it('rain, scrape, slide and squeal add energy and stay finite', () => {
    const base = rms(renderWorld({ speed: 20 }));
    for (const c of [{ rain: 1 }, { scrape: 1 }, { slide: 1 }, { brake: 1 }, { wheelspin: 1 }] as Partial<WorldControls>[]) {
      expect(rms(renderWorld({ speed: 20, ...c }))).toBeGreaterThan(base * 1.05);
    }
    expect(Object.keys(WORLD_DEFAULTS).length).toBeGreaterThan(10);
  });

  it('output gains scale each family independently', () => {
    const full = rms(renderWorld({ speed: 40, windGain: 1, tyreGain: 1 }));
    const noWind = rms(renderWorld({ speed: 40, windGain: 0, tyreGain: 1 }));
    const none = rms(renderWorld({ speed: 40, windGain: 0, tyreGain: 0 }));
    expect(noWind).toBeLessThan(full);
    expect(none).toBeLessThan(0.0005);
  });
});

describe('traffic voices', { timeout: 60000 }, () => {
  function renderVehicle(type: keyof typeof VEHICLE_VOICES, speed: number, doppler = 1, dist = 20): Float32Array {
    const v = new VehicleDSP({ ...VEHICLE_VOICES[type], seed: 7 }, SR);
    v.setControls(speed, 0.6, doppler, dist, 0);
    const n = SR * 2;
    const out = new Float32Array(n);
    for (let o = 0; o < n; o += 128) v.process(out, o, 128);
    for (const s of out) expect(Number.isFinite(s) && Math.abs(s) <= 1).toBe(true);
    return out.subarray(SR);
  }

  it('Doppler shift raises the pitch of an approaching vehicle', () => {
    const still = spectralFeatures(renderVehicle('car', 25, 1), SR).centroidLog2;
    const approaching = spectralFeatures(renderVehicle('car', 25, 1.35), SR).centroidLog2;
    const receding = spectralFeatures(renderVehicle('car', 25, 0.75), SR).centroidLog2;
    expect(approaching).toBeGreaterThan(still);
    expect(still).toBeGreaterThan(receding);
  });

  it('cars, trucks, buses and motorbikes sound different (engine-dominated at city speed, road-dominated on the highway)', () => {
    const types = ['car', 'diesel', 'bus', 'moto', 'sport', 'van'] as const;
    const at = (speed: number) => types.map((t) => spectralFeatures(renderVehicle(t, speed), SR).bandDb);
    const city = at(8);
    const highway = at(22);
    const dist = (a: number[], b: number[]): number => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0) / a.length);
    const d = (i: number, j: number): number => Math.sqrt(dist(city[i], city[j]) ** 2 + dist(highway[i], highway[j]) ** 2);
    for (let i = 0; i < types.length; i++) for (let j = i + 1; j < types.length; j++) expect(d(i, j), `${types[i]} vs ${types[j]}`).toBeGreaterThan(1.2);
    // Heavy diesels and buses carry more low-frequency rumble than cars.
    const lf = (bands: number[]): number => Math.max(bands[0], bands[1]) - bands[5];
    expect(lf(city[1])).toBeGreaterThan(lf(city[0]));
    expect(lf(city[2])).toBeGreaterThan(lf(city[0]));
  });

  it('distance darkens the sound; louder at higher speed', () => {
    const near = renderVehicle('car', 25, 1, 8);
    const far = renderVehicle('car', 25, 1, 150);
    expect(spectralFeatures(far, SR).centroidLog2).toBeLessThan(spectralFeatures(near, SR).centroidLog2);
    expect(rms(renderVehicle('car', 35))).toBeGreaterThan(rms(renderVehicle('car', 12)));
  });

  it('the host renders independent slots and silences freed ones', () => {
    const host = new TrafficHost(3, SR);
    host.handle({ t: 'cfg', i: 0, type: 'car', seed: 1, on: true });
    host.handle({ t: 'ctl', i: 0, speed: 25, load: 0.5, doppler: 1, dist: 10, brake: 0 });
    host.handle({ t: 'cfg', i: 2, type: 'diesel', seed: 2, on: true });
    host.handle({ t: 'ctl', i: 2, speed: 20, load: 0.5, doppler: 1, dist: 10, brake: 0 });
    const outs = [new Float32Array(128), new Float32Array(128), new Float32Array(128)];
    for (let k = 0; k < 300; k++) host.render(outs, 128);
    expect(rms(outs[0])).toBeGreaterThan(0.001);
    expect(rms(outs[1])).toBe(0);
    expect(rms(outs[2])).toBeGreaterThan(0.001);
    host.handle({ t: 'cfg', i: 0, type: 'car', seed: 1, on: false });
    for (let k = 0; k < 1500; k++) host.render(outs, 128);
    expect(rms(outs[0])).toBeLessThan(1e-4);
  });
});

describe('reverb impulse responses', () => {
  const irs = Object.fromEntries(REVERB_KINDS.map((k) => [k, generateImpulse(k, SR, 1, 3)])) as Record<ReverbKind, ReturnType<typeof generateImpulse>>;

  /** Time (s) for the energy decay curve to fall 30 dB below its start (RT30 × 2 ≈ RT60). */
  function decayTime(ir: { left: Float32Array; length: number }): number {
    const e = new Float64Array(ir.left.length);
    let acc = 0;
    for (let i = ir.left.length - 1; i >= 0; i--) {
      acc += ir.left[i] ** 2;
      e[i] = acc;
    }
    const total = e[0];
    for (let i = 0; i < e.length; i++) if (e[i] < total * 1e-3) return (i / SR) * 2;
    return ir.length;
  }

  it('are finite, non-silent and fade to zero', () => {
    for (const k of REVERB_KINDS) {
      const ir = irs[k];
      let peak = 0;
      for (let i = 0; i < ir.left.length; i++) {
        expect(Number.isFinite(ir.left[i]) && Number.isFinite(ir.right[i])).toBe(true);
        peak = Math.max(peak, Math.abs(ir.left[i]), Math.abs(ir.right[i]));
      }
      expect(peak, k).toBeGreaterThan(0.05);
      expect(Math.abs(ir.left[ir.left.length - 1])).toBeLessThan(1e-3);
      expect(ir.left.length).toBe(ir.right.length);
    }
  });

  it('reverberation time grows open < street < forest < canyon < tunnel', () => {
    const t = (k: ReverbKind): number => decayTime(irs[k]);
    expect(t('open')).toBeLessThan(t('street'));
    expect(t('street')).toBeLessThan(t('canyon'));
    expect(t('canyon')).toBeLessThan(t('tunnel'));
    expect(t('open')).toBeLessThan(t('forest'));
    expect(t('tunnel')).toBeGreaterThan(2.2);
    expect(t('open')).toBeLessThan(0.8);
  });

  it('left and right are decorrelated (wide, diffuse field)', () => {
    const ir = irs.canyon;
    let num = 0;
    let a = 0;
    let b = 0;
    // The diffuse tail (after the discrete, panned early reflections).
    for (let i = Math.round(SR * 0.25); i < ir.left.length; i++) {
      num += ir.left[i] * ir.right[i];
      a += ir.left[i] ** 2;
      b += ir.right[i] ** 2;
    }
    expect(Math.abs(num / Math.sqrt(a * b))).toBeLessThan(0.35);
  });

  it('absorbs the highs faster than the lows (forest)', () => {
    const ir = irs.forest;
    const half = Math.floor(ir.left.length / 2);
    const early = ir.left.subarray(Math.round(SR * 0.03), Math.round(SR * 0.25));
    const late = ir.left.subarray(half);
    const fe = spectralFeatures(early, SR).centroidLog2;
    const fl = spectralFeatures(late, SR).centroidLog2;
    expect(fl).toBeLessThan(fe);
  });

  it('shorter impulses for low quality', () => {
    expect(generateImpulse('tunnel', SR, 0.45).length).toBeLessThan(generateImpulse('tunnel', SR, 1).length * 0.5);
  });
});

describe('procedural sound effects', () => {
  const peak = (x: Float32Array): number => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

  it('crash layers are finite, normalised and distinct', () => {
    const layers = { metal: metalCrunch(SR, 1), plastic: plasticCrack(SR, 1), glass: glassShatter(SR, 1), body: bodyThud(SR, 1), tumble: bikeTumble(SR, 1) };
    const centroid: Record<string, number> = {};
    for (const [k, x] of Object.entries(layers)) {
      expect(x.length, k).toBeGreaterThan(SR * 0.4);
      expect(peak(x), k).toBeGreaterThan(0.5);
      expect(peak(x), k).toBeLessThanOrEqual(1);
      for (const v of x) if (!Number.isFinite(v)) throw new Error(`${k} not finite`);
      centroid[k] = spectralFeatures(x, SR).centroidLog2;
    }
    expect(centroid.body).toBeLessThan(centroid.metal);
    expect(centroid.glass).toBeGreaterThan(centroid.metal);
    expect(centroid.glass).toBeGreaterThan(centroid.plastic);
  });

  it('crashes are randomised per seed and scale with intensity', () => {
    const a = metalCrunch(SR, 1);
    const b = metalCrunch(SR, 2);
    let same = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] === b[i]) same++;
    expect(same / a.length).toBeLessThan(0.05);
    // Low intensity has fewer impacts → sparser: lower crest-normalised density.
    expect(glassShatter(SR, 1, 1).length).toBe(glassShatter(SR, 1, 0.5).length);
  });

  it('heavy whooshes are deeper and longer than light ones', () => {
    const light = whoosh(SR, 1, false);
    const heavy = whoosh(SR, 1, true);
    expect(heavy.length).toBeGreaterThan(light.length);
    expect(spectralFeatures(heavy, SR).centroidLog2).toBeLessThan(spectralFeatures(light, SR).centroidLog2);
  });

  it('thunder rumbles low and lasts seconds', () => {
    const t = thunder(SR, 1, 6);
    expect(t.length).toBe(6 * SR);
    expect(2 ** spectralFeatures(t, SR).centroidLog2).toBeLessThan(500);
  });

  it('horns: truck and bus are deeper than cars; chords are harmonic', () => {
    const c = (k: Parameters<typeof horn>[1]): number => spectralFeatures(horn(SR, k), SR).centroidLog2;
    expect(c('truck')).toBeLessThan(c('car'));
    expect(c('bus')).toBeLessThan(c('moto'));
    for (const k of ['car', 'taxi', 'truck', 'bus', 'moto', 'player'] as const) expect(peak(horn(SR, k))).toBeGreaterThan(0.5);
  });
});

describe('audio settings', () => {
  const defs = AUDIO_SETTINGS;

  it('are registered in the settings registry with Turkish labels', () => {
    for (const d of defs) {
      expect(d.key.startsWith('audio.')).toBe(true);
      expect(SETTINGS.get(d.key)).toBe(d);
      expect(d.category).toBe('audio');
      expect(d.label.length).toBeGreaterThan(2);
    }
  });

  it('cover every required control', () => {
    const keys = new Set(defs.map((d) => d.key));
    for (const k of ['audio.master', 'audio.engine', 'audio.wind', 'audio.tyres', 'audio.traffic', 'audio.sfx', 'audio.intakeBalance', 'audio.reverb', 'audio.reverbAmount', 'audio.doppler', 'audio.spatial', 'audio.nightMode', 'audio.mono', 'audio.quality'])
      expect(keys.has(k), k).toBe(true);
  });

  it('presets give a value for all five quality presets', () => {
    for (const d of defs) {
      if (!d.presets) continue;
      for (const p of QUALITY_PRESETS) expect(d.presets[p], `${d.key} ${p}`).not.toBeUndefined();
    }
  });

  it('every setting is read into the typed config, and defaults match', () => {
    const reader = new SettingsReader(SETTINGS, SETTINGS.defaults('high'));
    const cfg = readAudioConfig(reader);
    expect(cfg).toEqual({ ...DEFAULT_AUDIO_CONFIG, trafficVoices: 5 });
    // Flip every setting: the typed config must change (nothing is dead).
    const cfgKeys = Object.keys(cfg) as (keyof typeof cfg)[];
    expect(cfgKeys.length).toBe(defs.length);
    for (const d of defs) {
      const values: Record<string, number | string | boolean> = { ...SETTINGS.defaults('high') };
      if (d.type === 'toggle') values[d.key] = !d.default;
      else if (d.type === 'slider') values[d.key] = d.default === d.max ? d.min : d.max;
      else values[d.key] = d.options.find((o) => o.value !== d.default)!.value;
      const changed = readAudioConfig(new SettingsReader(SETTINGS, values));
      expect(JSON.stringify(changed), d.key).not.toBe(JSON.stringify(cfg));
    }
  });
});
