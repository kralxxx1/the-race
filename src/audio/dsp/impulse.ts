import { Biquad, Noise } from './util';

/** Acoustic environments for the convolution reverb. */
export type ReverbKind = 'open' | 'street' | 'canyon' | 'forest' | 'tunnel' | 'industrial';
export const REVERB_KINDS: readonly ReverbKind[] = ['open', 'street', 'canyon', 'forest', 'tunnel', 'industrial'];

interface IrSpec {
  /** Seconds before the first reflection reaches the ear. */
  preDelay: number;
  /** Reverberation time (s) for low / mid / high frequency bands (time to −60 dB). */
  rt: [number, number, number];
  /** Early reflection taps: delay (s), gain, pan (−1..1). */
  taps: [number, number, number][];
  /** Overall wet level relative to the direct sound. */
  level: number;
  /** Diffusion build-up time of the tail (s). */
  build: number;
  /** Low-cut of the tail (Hz): outdoor spaces carry little bass energy. */
  lowCut: number;
}

/**
 * Environment descriptions. Numbers are rough RT60 / reflection geometry of the real spaces:
 * an open highway has only a ground bounce and distant slap-back, a street canyon has strong
 * flutter between facades, a forest scatters diffusely and absorbs highs, a tunnel rings for
 * seconds with a bright, strongly periodic tail.
 */
const SPECS: Record<ReverbKind, IrSpec> = {
  open: { preDelay: 0.004, rt: [0.35, 0.28, 0.14], taps: [[0.006, 0.55, -0.2], [0.011, 0.3, 0.3], [0.19, 0.09, 0.7]], level: 0.45, build: 0.02, lowCut: 120 },
  street: { preDelay: 0.006, rt: [0.7, 0.55, 0.3], taps: [[0.009, 0.7, -0.6], [0.013, 0.65, 0.6], [0.027, 0.45, -0.3], [0.045, 0.4, 0.4], [0.081, 0.3, -0.7]], level: 0.7, build: 0.03, lowCut: 90 },
  canyon: { preDelay: 0.008, rt: [1.5, 1.25, 0.7], taps: [[0.012, 0.85, -0.8], [0.017, 0.8, 0.8], [0.034, 0.65, -0.7], [0.052, 0.6, 0.7], [0.071, 0.5, -0.5], [0.097, 0.45, 0.5], [0.13, 0.35, -0.6], [0.165, 0.3, 0.6]], level: 0.95, build: 0.04, lowCut: 80 },
  forest: { preDelay: 0.007, rt: [0.9, 0.7, 0.28], taps: [[0.012, 0.35, -0.5], [0.021, 0.3, 0.5], [0.038, 0.28, -0.3], [0.06, 0.24, 0.4], [0.09, 0.2, -0.2]], level: 0.55, build: 0.05, lowCut: 100 },
  tunnel: { preDelay: 0.005, rt: [3.4, 2.9, 1.7], taps: [[0.006, 0.95, -0.4], [0.011, 0.9, 0.4], [0.018, 0.8, -0.3], [0.026, 0.75, 0.3], [0.037, 0.7, -0.2], [0.05, 0.6, 0.2], [0.07, 0.55, -0.1], [0.095, 0.5, 0.1]], level: 1.25, build: 0.03, lowCut: 60 },
  industrial: { preDelay: 0.01, rt: [1.7, 1.3, 0.55], taps: [[0.014, 0.7, -0.7], [0.022, 0.65, 0.7], [0.041, 0.55, -0.4], [0.067, 0.5, 0.5], [0.108, 0.4, -0.5], [0.15, 0.3, 0.6]], level: 0.85, build: 0.05, lowCut: 90 },
};

export interface ImpulseResponse {
  left: Float32Array;
  right: Float32Array;
  /** Seconds. */
  length: number;
}

/** Reverberation time (s) used when generating `kind`, scaled by `quality`. */
export function reverbTime(kind: ReverbKind): number {
  return SPECS[kind].rt[1];
}

/**
 * Procedurally generate a stereo impulse response: discrete early reflections followed by a diffuse
 * tail made of three noise bands (low/mid/high) that decay at their own rates, so high frequencies
 * die first like in real air and absorbent walls. Length is capped at ~1.15 × the longest RT60
 * (scaled by `lengthScale` for cheaper convolution on slow devices).
 */
export function generateImpulse(kind: ReverbKind, sampleRate: number, lengthScale = 1, seed = 7): ImpulseResponse {
  const s = SPECS[kind];
  const seconds = Math.max(0.15, Math.max(...s.rt) * 1.05 * lengthScale);
  const n = Math.round(seconds * sampleRate);
  const out = [new Float32Array(n), new Float32Array(n)];
  const pre = Math.round(s.preDelay * sampleRate);
  const rng = new Noise(seed * 7919 + kind.length * 131);
  // Early reflections.
  for (const [delay, gain, pan] of s.taps) {
    const i = pre + Math.round(delay * sampleRate);
    if (i >= n - 2) continue;
    const g = gain * s.level;
    const l = g * Math.sqrt(0.5 * (1 - pan));
    const r = g * Math.sqrt(0.5 * (1 + pan));
    // Slightly smeared taps (a reflection is never a single sample).
    for (let k = 0; k < 3; k++) {
      const sign = k === 1 ? -0.5 : 0.7;
      out[0][i + k] += l * sign;
      out[1][i + k] += r * sign;
    }
  }
  // Diffuse tail: three decorrelated noise bands per channel.
  const lo = Math.max(60, s.lowCut);
  const edges = [380, 3400];
  for (let ch = 0; ch < 2; ch++) {
    const data = out[ch];
    const lp1 = new Biquad().lowpass(edges[0], 0.7, sampleRate);
    const lp2 = new Biquad().lowpass(edges[1], 0.7, sampleRate);
    const hp = new Biquad().highpass(lo, 0.7, sampleRate);
    const decay = s.rt.map((rt) => Math.exp((-6.9078 / (rt * lengthScale)) / sampleRate));
    const env = [1, 1, 1];
    for (let i = 0; i < n; i++) {
      const w = rng.white();
      const l1 = lp1.process(w);
      const l2 = lp2.process(w);
      const low = l1;
      const mid = l2 - l1;
      const high = w - l2;
      const t = i / sampleRate - s.preDelay;
      if (t < 0) continue;
      // Echo density builds up over `build` seconds.
      const ramp = Math.min(1, t / s.build);
      const x = hp.process(low * env[0] * 1.6 + mid * env[1] * 1.3 + high * env[2] * 0.9) * ramp * 0.045 * s.level;
      data[i] += x;
      env[0] *= decay[0];
      env[1] *= decay[1];
      env[2] *= decay[2];
    }
    // Fade the very end to zero so the convolver never clicks.
    const fade = Math.min(n, Math.round(0.03 * sampleRate));
    for (let i = 0; i < fade; i++) data[n - 1 - i] *= i / fade;
  }
  return { left: out[0], right: out[1], length: seconds };
}
