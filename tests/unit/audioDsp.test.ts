import { describe, expect, it } from 'vitest';
import { BIKES, FIRING_ANGLES, type BikeSpec, type EngineLayout } from '../../src/data/bikes';
import { autocorr, cycleProfile, envelope } from '../../src/audio/dsp/analysis';
import { EngineDSP } from '../../src/audio/dsp/engineDsp';
import { EngineHost } from '../../src/audio/dsp/engineHost';
import type { ExhaustNetwork } from '../../src/audio/dsp/params';
import { renderOffline, renderSteady } from '../../src/audio/dsp/synthFactory';
import { WaveguideNetwork } from '../../src/audio/dsp/waveguide';
import { BIKE_VOICES, voiceParams } from '../../src/audio/voices';

const SR = 32000;
const bikeOf = (layout: EngineLayout): BikeSpec => BIKES.find((b) => b.engine.layout === layout)!;

function mono(l: Float32Array, r: Float32Array, from = 0): Float32Array {
  const m = new Float32Array(l.length - from);
  for (let i = 0; i < m.length; i++) m[i] = (l[i + from] + r[i + from]) * 0.5;
  return m;
}

/** Gaussian bump template of a firing pattern on the 720° cycle (bins of 10°). */
function template(angles: readonly number[], bins = 72, sigmaDeg = 14): Float64Array {
  const t = new Float64Array(bins);
  for (let b = 0; b < bins; b++) {
    for (const a of angles) {
      let d = Math.abs(((b + 0.5) * 720) / bins - a);
      d = Math.min(d, 720 - d);
      t[b] += Math.exp(-0.5 * (d / sigmaDeg) ** 2);
    }
  }
  return t;
}

/** Best circular normalised correlation between the measured rhythm and `tpl` over every rotation. */
function bestCorrelation(profile: Float64Array, tpl: Float64Array): number {
  const n = profile.length;
  const mean = (a: Float64Array): number => a.reduce((s, v) => s + v, 0) / n;
  const mp = mean(profile);
  const mt = mean(tpl);
  let best = -1;
  for (let sft = 0; sft < n; sft++) {
    let num = 0;
    let dp = 0;
    let dt = 0;
    for (let i = 0; i < n; i++) {
      const a = profile[i] - mp;
      const b = tpl[(i + sft) % n] - mt;
      num += a * b;
      dp += a * a;
      dt += b * b;
    }
    if (dp > 0 && dt > 0) best = Math.max(best, num / Math.sqrt(dp * dt));
  }
  return best;
}

describe('crank-angle firing', { timeout: 120000 }, () => {
  // One bike per layout that has a distinctive rhythm (single-cylinder layouts are trivially periodic).
  const layouts: EngineLayout[] = ['I4CP', 'V4', 'V4A', 'L2', 'V2_45', 'V2_60', 'V2_75', 'P2_270', 'I3', 'BOXER', 'I6', 'F6', 'P2_180'];

  it('every cylinder fires once per 720° at the catalogue angle', () => {
    for (const b of BIKES) {
      if (b.engine.layout === 'ELECTRIC') continue;
      const p = voiceParams(b);
      // A voice may override the generic layout angles when the real engine differs (Indian's 49° V-twin).
      expect(p.firing).toEqual(BIKE_VOICES[b.id]?.firing ?? FIRING_ANGLES[b.engine.layout]);
      const synth = new EngineDSP(p, SR, 'medium', { measure: true });
      synth.logFires = true;
      synth.setControls({ rpm: 3000, throttle: 0.6, load: 0.6, speed: 0 });
      synth.snapControls();
      const L = new Float32Array(SR);
      const R = new Float32Array(SR);
      for (let o = 0; o < SR; o += 128) synth.process(L, R, o, Math.min(128, SR - o));
      // 3000 rpm = 25 cycles per second; each cylinder fires once per cycle.
      const per = new Map<number, number>();
      for (const a of synth.fireLog) per.set(a, (per.get(a) ?? 0) + 1);
      for (const a of p.firing) expect(Math.abs((per.get(a) ?? 0) - 25 * p.firing.filter((x) => x === a).length)).toBeLessThanOrEqual(2);
    }
  });

  it('the audio rhythm follows each layout’s own firing pattern (onset correlation on the 720° cycle)', () => {
    const rpm = 2400;
    for (const layout of layouts) {
      const b = bikeOf(layout);
      const p = voiceParams(b);
      // Isolate the exhaust pulses: no mechanical or intake clutter, no cycle-to-cycle jitter.
      const clean = { ...p, roughness: 0, idleLope: 0, mech: { ...p.mech, tick: 0, desmo: 0, camWhine: 0, gearWhine: 0, clutchRattle: 0, driveWhine: 0 }, intake: { ...p.intake, gain: 0, roar: 0, ramAir: 0 } };
      const r = renderSteady(clean, rpm, 0.8, 3, SR, 'medium', { measure: true });
      const m = mono(r.left, r.right, Math.round(SR * 0.6));
      const env = envelope(m, SR, 600, 4);
      const prof = cycleProfile(env, SR / 4, rpm, 72);
      const own = bestCorrelation(prof, template(FIRING_ANGLES[layout]));
      expect(own, `${layout} own correlation`).toBeGreaterThan(0.3);
      // Every layout with a genuinely different rhythm must match its own template better.
      for (const other of layouts) {
        const a = FIRING_ANGLES[other];
        const same = a.length === FIRING_ANGLES[layout].length && a.every((v, i) => v === FIRING_ANGLES[layout][i]);
        if (same) continue;
        const rotated = a.length === FIRING_ANGLES[layout].length;
        const score = bestCorrelation(prof, template(a));
        // Patterns that are just rotations/mirrors of each other (V4 vs V4A) are allowed to tie closely.
        expect(own, `${layout} vs ${other}`).toBeGreaterThan(score - (rotated ? 0.12 : 0.02));
      }
    }
  });

  it('even-firing engines repeat each firing interval, uneven ones only each full cycle', () => {
    const rep = (layout: EngineLayout, fraction: number): number => {
      const b = bikeOf(layout);
      const rpm = 2400;
      const clean = voiceParams(b);
      const r = renderSteady({ ...clean, roughness: 0 }, rpm, 0.8, 3, SR, 'medium', { measure: true });
      const env = envelope(mono(r.left, r.right, Math.round(SR * 0.6)), SR, 600, 4);
      const cycle = (120 / rpm) * (SR / 4);
      return autocorr(env, Math.round(cycle * fraction));
    };
    expect(rep('I4', 0.25)).toBeGreaterThan(0.8);
    expect(rep('I3', 1 / 3)).toBeGreaterThan(0.8);
    expect(rep('BOXER', 0.5)).toBeGreaterThan(0.8);
    for (const [layout, n] of [['V2_45', 2], ['L2', 2], ['I4CP', 4], ['V4', 4]] as const) {
      expect(rep(layout, 1), `${layout} full cycle`).toBeGreaterThan(0.8);
      expect(rep(layout, 1 / n), `${layout} one interval`).toBeLessThan(rep(layout, 1) - 0.2);
    }
  });
});

describe('continuity and numerical health', { timeout: 120000 }, () => {
  const sweepBikes = ['yamaha-r1', 'harley-fat-boy', 'kawasaki-h2r', 'ducati-panigale-v4s', 'bmw-r1250gs', 're-classic-350'];

  it('fast rpm sweeps produce no NaN/Infinity, stay bounded and show no block-boundary clicks', () => {
    for (const id of sweepBikes) {
      const b = BIKES.find((x) => x.id === id)!;
      const p = voiceParams(b);
      const e = b.engine;
      const T = 3;
      const r = renderOffline(
        p,
        {
          seconds: T,
          // idle → limiter in 0.35 s, hold, drop back in 0.25 s: far faster than any real engine.
          rpm: (t) => (t < 0.3 ? e.idle : t < 0.65 ? e.idle + ((e.limiter - e.idle) * (t - 0.3)) / 0.35 : t < 1.6 ? e.limiter : t < 1.85 ? e.limiter - ((e.limiter - e.idle) * (t - 1.6)) / 0.25 : e.idle),
          throttle: (t) => (t > 0.3 && t < 1.6 ? 1 : 0),
          speed: (t) => 40 * Math.min(1, t / 1.5),
          events: [
            { t: 0.9, e: 'shiftCut', v: 0.06 },
            { t: 1.2, e: 'limiterCut' },
            { t: 1.7, e: 'pop', v: 1 },
          ],
        },
        SR,
        'high',
        { controlEvery: 1 },
      );
      const x = mono(r.left, r.right);
      let peak = 0;
      let maxDelta = 0;
      let edge = 0;
      let inner = 0;
      let nEdge = 0;
      let nInner = 0;
      for (let i = 1; i < x.length; i++) {
        expect(Number.isFinite(x[i])).toBe(true);
        peak = Math.max(peak, Math.abs(x[i]));
        const d = Math.abs(x[i] - x[i - 1]);
        maxDelta = Math.max(maxDelta, d);
        if (i % 128 === 0) {
          edge += d;
          nEdge++;
        } else {
          inner += d;
          nInner++;
        }
      }
      expect(peak, `${id} peak`).toBeLessThanOrEqual(1.0001);
      expect(maxDelta, `${id} max sample delta`).toBeLessThan(1.2);
      // Quantum boundaries (where control updates land) must not be special: no zipper clicks.
      expect(edge / nEdge, `${id} boundary vs interior mean delta`).toBeLessThan((inner / nInner) * 2.5 + 1e-4);
    }
  });

  it('keeps all internal state free of denormals after a long run', () => {
    for (const id of ['yamaha-r1', 'harley-fat-boy', 'livewire-one']) {
      const b = BIKES.find((x) => x.id === id)!;
      const p = voiceParams(b);
      const synth = new (b.engine.layout === 'ELECTRIC' ? EngineHost : EngineHost)({ params: p, quality: 'extreme', sampleRate: SR }).synth as unknown as { stateArrays(): ArrayLike<number>[]; setControls(c: object): void; process(l: Float32Array, r: Float32Array, o: number, n: number): void };
      const L = new Float32Array(128);
      const R = new Float32Array(128);
      for (let k = 0; k < 600; k++) {
        const hi = k % 200 < 100;
        synth.setControls({ rpm: hi ? b.engine.redline * 0.9 : 0, throttle: hi ? 1 : 0, load: hi ? 1 : 0, speed: 20 });
        synth.process(L, R, 0, 128);
      }
      for (const arr of synth.stateArrays()) {
        for (let i = 0; i < arr.length; i++) {
          const v = Math.abs(arr[i]);
          expect(v === 0 || v > 1e-30, `${id} state[${i}]=${v}`).toBe(true);
          expect(Number.isFinite(v)).toBe(true);
        }
      }
    }
  });

  it('garbage control input cannot poison the synthesiser', () => {
    const b = bikeOf('I4');
    const host = new EngineHost({ params: voiceParams(b), quality: 'high', sampleRate: SR });
    const L = new Float32Array(128);
    const R = new Float32Array(128);
    host.handle({ t: 'ctl', rpm: NaN, thr: Infinity, load: -5, speed: NaN });
    for (let i = 0; i < 20; i++) host.render(L, R, 0, 128);
    host.handle({ t: 'ctl', rpm: 1e9, thr: 7, load: 9, speed: 1e6 });
    for (let i = 0; i < 40; i++) host.render(L, R, 0, 128);
    for (let i = 0; i < 128; i++) {
      expect(Number.isFinite(L[i]) && Number.isFinite(R[i])).toBe(true);
      expect(Math.abs(L[i])).toBeLessThanOrEqual(4.0001);
    }
  });
});

describe('overrun pops and combustion events', { timeout: 120000 }, () => {
  it('crackles appear only off-throttle, never under power', () => {
    const b = BIKES.find((x) => x.id === 'yamaha-r1')!;
    const p = voiceParams(b);
    const run = (thr: number, seconds: number): number => {
      const s = new EngineDSP(p, SR, 'medium', { seed: 5 });
      s.setControls({ rpm: b.engine.redline * 0.62, throttle: thr, load: thr, speed: 30 });
      s.snapControls();
      const L = new Float32Array(SR);
      const R = new Float32Array(SR);
      for (let k = 0; k < seconds; k++) for (let o = 0; o < SR; o += 128) s.process(L, R, o, Math.min(128, SR - o));
      return s.popCount;
    };
    expect(run(0, 8)).toBeGreaterThan(0);
    expect(run(1, 8)).toBe(0);
    expect(run(0.5, 8)).toBe(0);
  });

  it('a race exhaust crackles more than the stock one', () => {
    const b = BIKES.find((x) => x.id === 'kawasaki-zx10r')!;
    const count = (mod: 'stock' | 'race'): number => {
      const p = voiceParams(b, { exhaustMod: mod });
      let total = 0;
      for (let seed = 1; seed <= 4; seed++) {
        const s = new EngineDSP(p, SR, 'medium', { seed });
        s.setControls({ rpm: b.engine.redline * 0.6, throttle: 0, load: 0, speed: 25 });
        s.snapControls();
        const L = new Float32Array(SR);
        const R = new Float32Array(SR);
        for (let k = 0; k < 6; k++) for (let o = 0; o < SR; o += 128) s.process(L, R, o, Math.min(128, SR - o));
        total += s.popCount;
      }
      return total;
    };
    expect(count('race')).toBeGreaterThan(count('stock'));
  });

  it('a quickshifter cut silences combustion briefly, then the engine relights', () => {
    const b = bikeOf('I4');
    const p = voiceParams(b);
    // Exhaust only: the intake and mechanical noise legitimately keep going while the ignition is cut.
    const clean = { ...p, mech: { ...p.mech, tick: 0, desmo: 0, camWhine: 0, gearWhine: 0, clutchRattle: 0, driveWhine: 0 }, intake: { ...p.intake, gain: 0, roar: 0, ramAir: 0 } };
    const r = renderOffline(clean, { seconds: 1.5, rpm: () => 9000, throttle: () => 1, events: [{ t: 0.8, e: 'shiftCut', v: 0.08 }] }, SR, 'medium', { measure: true });
    const m = mono(r.left, r.right);
    const rms = (a: number, b2: number): number => {
      let s = 0;
      for (let i = Math.round(a * SR); i < Math.round(b2 * SR); i++) s += m[i] * m[i];
      return Math.sqrt(s / ((b2 - a) * SR));
    };
    const before = rms(0.6, 0.78);
    const during = rms(0.84, 0.88);
    const after = rms(1.1, 1.4);
    expect(during).toBeLessThan(before * 0.5);
    expect(after).toBeGreaterThan(before * 0.7);
  });
});

describe('electric drivetrain', { timeout: 120000 }, () => {
  it('has no combustion periodicity and responds to rpm', () => {
    const b = bikeOf('ELECTRIC');
    const p = voiceParams(b);
    expect(p.kind).toBe('electric');
    expect(p.firing).toEqual([]);
    const rpm = 4000;
    const r = renderSteady(p, rpm, 0.8, 2.5, SR, 'high', { measure: true, speed: 25 });
    const m = mono(r.left, r.right, Math.round(SR * 0.6));
    const contrast = (x: Float32Array, rp: number): number => {
      const env = envelope(x, SR, 400, 4);
      const period = (120 / rp) * (SR / 4);
      const bins = new Float64Array(24);
      const cnt = new Float64Array(24);
      let mean = 0;
      for (let i = 0; i < env.length; i++) {
        const b = Math.min(23, Math.floor(((i / period) % 1) * 24));
        bins[b] += env[i];
        cnt[b]++;
        mean += env[i];
      }
      mean /= env.length;
      const folded = Array.from(bins, (v, i) => v / cnt[i]);
      return (Math.max(...folded) - Math.min(...folded)) / mean;
    };
    // Folded on the 720° cycle an electric motor is flat; a combustion engine is strongly modulated.
    const rc = renderSteady(voiceParams(bikeOf('I4CP')), 4000, 0.8, 2.5, SR, 'high', { measure: true });
    const electric = contrast(m, rpm);
    const combustion = contrast(mono(rc.left, rc.right, Math.round(SR * 0.6)), 4000);
    // (Motor orders are locked to shaft speed, so some residual beating is physical; combustion is far stronger.)
    expect(electric).toBeLessThan(0.7);
    expect(combustion).toBeGreaterThan(electric * 2.5);
    // Whine rises with rpm: more energy above 1.5 kHz at 9000 than at 2000 rpm.
    const hi = (rp: number): number => {
      const q = renderSteady(p, rp, 0.8, 1.5, SR, 'high', { measure: true, speed: 20 });
      let s = 0;
      let prev = 0;
      for (let i = Math.round(SR * 0.5); i < q.left.length; i++) {
        const d = q.left[i] - prev; // crude high-pass
        prev = q.left[i];
        s += d * d;
      }
      return s;
    };
    expect(hi(9000)).toBeGreaterThan(hi(2000) * 2);
  });

  it('ignores ignition events', () => {
    const b = bikeOf('ELECTRIC');
    const r = renderOffline(voiceParams(b), { seconds: 0.6, rpm: () => 3000, throttle: () => 0, events: [{ t: 0.2, e: 'pop' }, { t: 0.25, e: 'backfire' }, { t: 0.3, e: 'limiterCut' }] }, SR, 'high');
    for (const v of r.left) expect(Number.isFinite(v)).toBe(true);
  });
});

describe('exhaust waveguide network', { timeout: 120000 }, () => {
  const net: ExhaustNetwork = {
    nodes: [{ k: 'port', cyl: 0, refl: 0.5 }, { k: 'junction' }, { k: 'open', out: 0, refl: 0.9, reflHz: 2000 }],
    pipes: [
      { a: 0, b: 1, len: 1.0, area: 1, lossHz: 9000, lossGain: 0.99 },
      { a: 1, b: 2, len: 0.5, area: 2, lossHz: 9000, lossGain: 0.99 },
    ],
    outlets: [{ pan: 0, gain: 1, hpHz: 60 }],
  };

  it('delays a pulse by the pipe length at the gas sound speed', () => {
    const sr = 48000;
    const w = new WaveguideNetwork(net, 1, sr, 500);
    w.inject[0] = 1;
    let first = -1;
    for (let i = 0; i < 400; i++) {
      w.step();
      w.inject[0] = 0;
      if (first < 0 && Math.abs(w.out[0]) > 1e-4) first = i;
    }
    // 1.5 m at 500 m/s = 3 ms = 144 samples.
    expect(first).toBeGreaterThan(140);
    expect(first).toBeLessThan(152);
  });

  it('is passive: a single pulse rings down to nothing', () => {
    const w = new WaveguideNetwork(net, 1, 48000, 500);
    w.inject[0] = 1;
    let e0 = 0;
    let e1 = 0;
    for (let i = 0; i < 48000; i++) {
      w.step();
      w.inject[0] = 0;
      const v = w.out[0];
      expect(Number.isFinite(v)).toBe(true);
      if (i < 4800) e0 += v * v;
      else if (i > 43200) e1 += v * v;
    }
    expect(e1).toBeLessThan(e0 * 1e-3);
  });
});

describe('engine host messaging', { timeout: 120000 }, () => {
  it('applies gain changes smoothly and reports peaks', () => {
    const b = bikeOf('I4');
    const host = new EngineHost({ params: voiceParams(b), quality: 'medium', sampleRate: SR });
    const L = new Float32Array(128);
    const R = new Float32Array(128);
    host.handle({ t: 'ctl', rpm: 7000, thr: 1, load: 1, speed: 20 });
    for (let i = 0; i < 100; i++) host.render(L, R, 0, 128);
    const loud = host.takePeak();
    expect(loud).toBeGreaterThan(0.01);
    host.handle({ t: 'gain', g: 0 });
    for (let i = 0; i < 200; i++) host.render(L, R, 0, 128);
    host.takePeak();
    host.render(L, R, 0, 128);
    expect(host.takePeak()).toBeLessThan(loud * 0.02);
  });
});
