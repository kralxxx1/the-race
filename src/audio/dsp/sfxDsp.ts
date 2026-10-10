import { BQ_STRIDE, Biquad, Noise, bandpass, setBandpass, TWO_PI } from './util';

/**
 * Procedural one-shot sound effects, rendered offline into plain Float32Array buffers (mono).
 * Impacts are built from physical ingredients — a body thump, broadband impact noise, a cloud of
 * struck inharmonic modes (metal), pings of random pitch (glass), bandpassed cracks (plastic) —
 * and randomised per call so no two crashes are identical.
 */

const METAL_MODES = [210, 338, 556, 913, 1446, 2310, 3720, 5610];

function alloc(sr: number, seconds: number): Float32Array {
  return new Float32Array(Math.max(1, Math.round(sr * seconds)));
}

export function normalize(buf: Float32Array, peak = 0.9): Float32Array {
  let m = 0;
  for (let i = 0; i < buf.length; i++) m = Math.max(m, Math.abs(buf[i]));
  if (m > 0) {
    const g = peak / m;
    for (let i = 0; i < buf.length; i++) buf[i] *= g;
  }
  return buf;
}

/** Exponentially decaying sine added at time t0. */
function ping(buf: Float32Array, sr: number, t0: number, hz: number, decay: number, amp: number, endHz = hz): void {
  const i0 = Math.round(t0 * sr);
  const n = Math.min(buf.length - i0, Math.round(decay * 7 * sr));
  if (n <= 0) return;
  let phase = 0;
  const k = Math.exp(-1 / (decay * sr));
  let env = amp;
  for (let i = 0; i < n; i++) {
    const f = hz + (endHz - hz) * (i / n);
    phase += f / sr;
    buf[i0 + i] += Math.sin(TWO_PI * phase) * env;
    env *= k;
  }
}

/** Band-limited noise burst with exponential decay. */
function burst(buf: Float32Array, sr: number, rng: Noise, t0: number, dur: number, amp: number, lo: number, hi: number, attack = 0.0006): void {
  const i0 = Math.round(t0 * sr);
  const n = Math.min(buf.length - i0, Math.round(dur * sr));
  if (n <= 0) return;
  const hp = new Biquad().highpass(Math.max(20, lo), 0.7, sr);
  const lp = new Biquad().lowpass(Math.min(sr * 0.45, hi), 0.7, sr);
  const tau = dur / 4.6;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = (1 - Math.exp(-t / attack)) * Math.exp(-t / tau);
    buf[i0 + i] += lp.process(hp.process(rng.white())) * env * amp;
  }
}

function thump(buf: Float32Array, sr: number, t0: number, hz: number, decay: number, amp: number): void {
  ping(buf, sr, t0, hz * 1.8, decay, amp, hz * 0.5);
}

/** Metal crumpling: thump + impact noise + a cloud of struck metal modes. */
export function metalCrunch(sr: number, seed: number, intensity = 1): Float32Array {
  const rng = new Noise(seed * 7 + 11);
  const b = alloc(sr, 1.6);
  thump(b, sr, 0, 90, 0.11, 0.9 * intensity);
  burst(b, sr, rng, 0, 0.09, 0.9 * intensity, 120, 4500);
  const hits = Math.round(10 + 26 * intensity);
  for (let h = 0; h < hits; h++) {
    // Impacts cluster early (the crumple zone collapses) then thin out.
    const t = Math.pow(rng.next(), 2.2) * 0.55;
    const a = (0.12 + 0.3 * rng.next()) * intensity * (1 - t * 0.9);
    const mode = METAL_MODES[(rng.next() * METAL_MODES.length) | 0] * (0.93 + 0.14 * rng.next());
    ping(b, sr, t, mode, 0.05 + 0.4 * rng.next(), a);
    if (rng.next() < 0.5) ping(b, sr, t, mode * (1.5 + rng.next() * 0.6), 0.03 + 0.15 * rng.next(), a * 0.5);
    burst(b, sr, rng, t, 0.01 + 0.02 * rng.next(), a * 0.9, 1200, 7000);
  }
  // Grinding tail.
  const rngG = new Noise(seed * 13 + 5);
  const bp = new Biquad().highpass(900, 0.8, sr);
  const lp = new Biquad().lowpass(3600, 0.8, sr);
  const stick = new Biquad().lowpass(38, 0.7, sr);
  const n = Math.round(0.9 * sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const flutter = Math.max(0, 0.35 + 3 * stick.process(rngG.white()));
    b[Math.round(0.05 * sr) + i] += lp.process(bp.process(rngG.white())) * Math.exp(-t / 0.28) * flutter * 0.28 * intensity;
  }
  return normalize(b);
}

/** Plastic fairing / bodywork cracking: short bandpassed snaps. */
export function plasticCrack(sr: number, seed: number, intensity = 1): Float32Array {
  const rng = new Noise(seed * 5 + 3);
  const b = alloc(sr, 0.75);
  const n = Math.round(5 + 9 * intensity);
  for (let i = 0; i < n; i++) {
    const t = Math.pow(rng.next(), 1.6) * 0.4;
    const f = 700 + rng.next() * 2600;
    burst(b, sr, rng, t, 0.012 + rng.next() * 0.03, (0.3 + 0.7 * rng.next()) * intensity, f * 0.6, f * 1.6);
    ping(b, sr, t, f * 0.45, 0.012 + 0.02 * rng.next(), 0.15 * intensity);
  }
  thump(b, sr, 0, 160, 0.05, 0.5 * intensity);
  return normalize(b, 0.8);
}

/** Glass shattering: sharp crack, then a shower of high pings. */
export function glassShatter(sr: number, seed: number, intensity = 1): Float32Array {
  const rng = new Noise(seed * 3 + 17);
  const b = alloc(sr, 1.9);
  burst(b, sr, rng, 0, 0.03, 1, 2500, 12000, 0.0002);
  burst(b, sr, rng, 0.004, 0.2, 0.55, 3500, 14000, 0.001);
  const shards = Math.round(40 + 80 * intensity);
  for (let i = 0; i < shards; i++) {
    const t = 0.006 + -Math.log(1 - rng.next() * 0.995) * 0.22;
    const hz = 2200 + Math.pow(rng.next(), 0.7) * 8200;
    const a = (0.1 + 0.4 * rng.next()) * Math.exp(-t * 1.6) * intensity;
    ping(b, sr, t, hz, 0.006 + 0.07 * rng.next(), a);
    if (rng.next() < 0.25) burst(b, sr, rng, t, 0.004, a * 0.5, 4000, 12000);
  }
  return normalize(b, 0.85);
}

/** Body / helmet / leather hitting tarmac or a car: low thump + slap. */
export function bodyThud(sr: number, seed: number, intensity = 1): Float32Array {
  const rng = new Noise(seed * 9 + 29);
  const b = alloc(sr, 0.7);
  thump(b, sr, 0, 62 + 22 * rng.next(), 0.1, 1 * intensity);
  burst(b, sr, rng, 0, 0.05, 0.55 * intensity, 180, 1100);
  burst(b, sr, rng, 0.012, 0.14, 0.3 * intensity, 80, 520);
  return normalize(b);
}

/** A bike cartwheeling: heavy bounces of shrinking energy and shortening interval, with metal/plastic clatter. */
export function bikeTumble(sr: number, seed: number): Float32Array {
  const rng = new Noise(seed * 31 + 7);
  const b = alloc(sr, 3.6);
  let t = 0.05;
  let amp = 1;
  let gap = 0.42;
  for (let k = 0; k < 9 && t < 3.3; k++) {
    thump(b, sr, t, 70 + 40 * rng.next(), 0.09, 0.8 * amp);
    burst(b, sr, rng, t, 0.06, 0.6 * amp, 200, 2600);
    for (let m = 0; m < 4; m++) {
      const mode = METAL_MODES[(rng.next() * METAL_MODES.length) | 0] * (0.9 + 0.2 * rng.next());
      ping(b, sr, t + rng.next() * 0.04, mode, 0.04 + 0.25 * rng.next(), 0.22 * amp * rng.next());
    }
    if (rng.next() < 0.5) burst(b, sr, rng, t + 0.01, 0.03, 0.4 * amp, 900, 3600);
    t += gap * (0.8 + 0.4 * rng.next());
    gap *= 0.8;
    amp *= 0.72;
  }
  return normalize(b);
}

/** Pressure-wave "whoosh" of a vehicle passing close by; `heavy` = truck/bus (deeper, longer, with a thump). */
export function whoosh(sr: number, seed: number, heavy: boolean): Float32Array {
  const rng = new Noise(seed * 17 + 1);
  const dur = heavy ? 1.2 : 0.75;
  const b = alloc(sr, dur);
  const bank = new Float64Array(BQ_STRIDE * 2);
  const f0 = heavy ? 650 : 1900;
  const f1 = heavy ? 120 : 320;
  const lp = new Biquad().lowpass(heavy ? 1600 : 4200, 0.7, sr);
  const n = b.length;
  for (let i = 0; i < n; i++) {
    const x = i / n;
    if (i % 48 === 0) {
      const f = f0 * Math.pow(f1 / f0, Math.pow(x, 0.8));
      setBandpass(bank, 0, f, 0.8, sr);
      setBandpass(bank, 1, f * 1.9, 1.2, sr);
    }
    const w = rng.white();
    // Fast rise as the vehicle's pressure front arrives, slower fall as it recedes.
    const env = Math.pow(Math.sin(Math.PI * Math.pow(x, 0.55)), 1.6);
    b[i] = lp.process(bandpass(bank, 0, w) * 1.6 + bandpass(bank, 1, w) * 0.6) * env;
  }
  if (heavy) thump(b, sr, dur * 0.2, 55, 0.25, 0.35);
  return normalize(b, 0.8);
}

/** Thunder: a sharp crack followed by long, rolling, low-pass-darkening rumbles. */
export function thunder(sr: number, seed: number, seconds = 7.5): Float32Array {
  const rng = new Noise(seed * 23 + 13);
  const b = alloc(sr, seconds);
  burst(b, sr, rng, 0, 0.12, 0.55, 500, 9000, 0.0008);
  // Rolling pulses (discharge branches).
  const pulses: [number, number, number][] = [];
  const n = 5 + ((rng.next() * 5) | 0);
  for (let i = 0; i < n; i++) pulses.push([0.05 + rng.next() * seconds * 0.45, 0.25 + 0.75 * rng.next(), 0.6 + 1.6 * rng.next()]);
  const lpA = new Biquad().lowpass(320, 0.7, sr);
  const lpB = new Biquad().lowpass(110, 0.7, sr);
  for (let i = 0; i < b.length; i++) {
    const t = i / sr;
    let env = 0.55 * Math.exp(-t / 1.1);
    for (const [t0, a, tau] of pulses) {
      const dt = t - t0;
      if (dt > 0) env += a * (1 - Math.exp(-dt / 0.06)) * Math.exp(-dt / tau);
    }
    const w = rng.white();
    // Darkens over time: more of the 110 Hz rumble, less of the 320 Hz band.
    const mix = Math.min(1, t / (seconds * 0.7));
    b[i] += (lpA.process(w) * (1 - 0.8 * mix) * 2.4 + lpB.process(w) * (0.8 + 1.6 * mix) * 4.2) * env * 0.5;
  }
  const fade = Math.round(sr * 0.9);
  for (let i = 0; i < fade; i++) b[b.length - 1 - i] *= i / fade;
  return normalize(b, 0.85);
}

export type HornKind = 'car' | 'taxi' | 'truck' | 'bus' | 'moto' | 'player';

const HORN_CHORDS: Record<HornKind, { hz: number[]; harmonics: number; slope: number; noise: number; len: number; bell: number }> = {
  car: { hz: [415, 523], harmonics: 14, slope: 0.95, noise: 0.015, len: 1.4, bell: 1300 },
  taxi: { hz: [440, 554], harmonics: 14, slope: 0.9, noise: 0.015, len: 1.4, bell: 1500 },
  truck: { hz: [196, 247, 294], harmonics: 22, slope: 0.85, noise: 0.05, len: 2.2, bell: 700 },
  bus: { hz: [262, 330], harmonics: 18, slope: 0.85, noise: 0.04, len: 2, bell: 900 },
  moto: { hz: [466, 587], harmonics: 10, slope: 1.1, noise: 0.012, len: 1.2, bell: 1700 },
  player: { hz: [440, 554], harmonics: 10, slope: 1.05, noise: 0.012, len: 1.2, bell: 1600 },
};

/** Electro-pneumatic / air horn: stacked harmonic series of a chord with diaphragm buzz and a little breath noise. */
export function horn(sr: number, kind: HornKind, seed = 1): Float32Array {
  const h = HORN_CHORDS[kind];
  const rng = new Noise(seed * 41 + 3);
  const b = alloc(sr, h.len);
  const bell = new Biquad().peaking(h.bell, 0.9, 7, sr);
  const lp = new Biquad().lowpass(5200, 0.7, sr);
  const phases = h.hz.map(() => rng.next());
  const detune = h.hz.map(() => 1 + (rng.next() - 0.5) * 0.004);
  for (let i = 0; i < b.length; i++) {
    const t = i / sr;
    let s = 0;
    for (let c = 0; c < h.hz.length; c++) {
      const wob = 1 + 0.0035 * Math.sin(TWO_PI * 5.2 * t + c);
      const f = h.hz[c] * detune[c] * wob;
      phases[c] += f / sr;
      for (let k = 1; k <= h.harmonics; k++) {
        if (f * k > sr * 0.42) break;
        s += Math.sin(TWO_PI * phases[c] * k) / Math.pow(k, h.slope);
      }
    }
    s = s / h.hz.length + rng.white() * h.noise;
    // Quick attack, tiny release baked in; GameAudio shapes the sustain length.
    const env = Math.min(1, t / 0.018) * Math.min(1, (h.len - t) / 0.05);
    b[i] = lp.process(bell.process(s)) * env;
  }
  return normalize(b, 0.7);
}

/** All one-shot buffers needed by the in-run soundscape, keyed by name (variants for crashes). */
export interface SfxSet {
  metal: Float32Array[];
  plastic: Float32Array[];
  glass: Float32Array[];
  body: Float32Array[];
  tumble: Float32Array[];
  whooshLight: Float32Array[];
  whooshHeavy: Float32Array[];
}

export function renderSfxSet(sr: number): SfxSet {
  return {
    metal: [metalCrunch(sr, 1, 1), metalCrunch(sr, 2, 0.6), metalCrunch(sr, 3, 1)],
    plastic: [plasticCrack(sr, 1), plasticCrack(sr, 2, 0.7)],
    glass: [glassShatter(sr, 1), glassShatter(sr, 2, 0.7)],
    body: [bodyThud(sr, 1), bodyThud(sr, 2, 0.8), bodyThud(sr, 3, 1)],
    tumble: [bikeTumble(sr, 1), bikeTumble(sr, 2)],
    whooshLight: [whoosh(sr, 1, false), whoosh(sr, 2, false)],
    whooshHeavy: [whoosh(sr, 3, true)],
  };
}
