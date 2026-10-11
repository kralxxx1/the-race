import { aWeightedDb, cycleProfile, envelope, spectralFeatures } from './analysis';
import type { EngineVoiceParams } from './params';
import { renderOffline, type Rendered } from './synthFactory';

/**
 * Acoustic fingerprint of a bike voice, used by the distinctness test and the lab tool.
 * Measured on offline renders at fixed fractions of the rev range (so a 14k superbike and a
 * 6k cruiser are compared at "idle / mid / high"), on and off throttle.
 */
export interface ConditionFeatures {
  /** Spectrum shape: third-octave band levels (dB) minus their mean — independent of overall loudness. */
  shape: number[];
  /** Peak-to-median level (dB) in 1.2–6 kHz: whines and tones stand out from noise. */
  tonality: number;
  /** A-weighted level (dB). */
  level: number;
  /** log2 spectral centroid. */
  centroid: number;
  /** Rhythm: envelope folded on the 720° cycle, 24 bins, zero-mean, unit peak. */
  rhythm: number[];
}

export interface BikeFeatures {
  id: string;
  idle: ConditionFeatures;
  mid: ConditionFeatures;
  high: ConditionFeatures;
  /** Off-throttle at 60 % of the rev range (overrun): burble and engine-braking character. */
  overrun: ConditionFeatures;
}

export interface EngineRange {
  idle: number;
  redline: number;
}

function monoOf(r: Rendered, from: number): Float32Array {
  const n = r.left.length - from;
  const m = new Float32Array(n);
  for (let i = 0; i < n; i++) m[i] = (r.left[i + from] + r.right[i + from]) * 0.5;
  return m;
}

function condition(params: EngineVoiceParams, rpm: number, thr: number, speed: number, sr: number, seconds: number): ConditionFeatures {
  const r = renderOffline(params, { seconds, rpm: () => rpm, throttle: () => thr, load: () => (thr > 0.5 ? 0.9 : thr * 0.4), speed: () => speed }, sr, 'medium', { measure: true });
  const skip = Math.round(sr * 0.5);
  const m = monoOf(r, skip);
  const sf = spectralFeatures(m, sr);
  const mean = sf.thirdDb.reduce((a, c) => a + c, 0) / sf.thirdDb.length;
  const env = envelope(m, sr, Math.max(300, (rpm / 60) * 4), 8);
  const rhythm = params.kind === 'electric' ? new Float64Array(24) : cycleProfile(env, sr / 8, Math.max(rpm, 300), 24);
  // Level as the player hears it: raw level plus the loudness calibration and the voice's own trim.
  const level = aWeightedDb(m, sr) + 20 * Math.log10(params.calib * Math.pow(10, params.loudness / 20));
  return { shape: sf.thirdDb.map((b) => b - mean), tonality: sf.tonality, level, centroid: sf.centroidLog2, rhythm: Array.from(rhythm) };
}

export function bikeFeatures(params: EngineVoiceParams, range: EngineRange, sr = 32000, seconds = 1.5): BikeFeatures {
  const at = (f: number): number => range.idle + (range.redline - range.idle) * f;
  const electric = params.kind === 'electric';
  return {
    id: params.id,
    idle: condition(params, electric ? range.redline * 0.12 : range.idle, 0, 3, sr, seconds),
    mid: condition(params, at(0.45), 0.85, 25, sr, seconds),
    high: condition(params, at(0.88), 1, 45, sr, seconds),
    overrun: condition(params, at(0.6), 0, 30, sr, seconds + 0.5),
  };
}

function condDistance(a: ConditionFeatures, b: ConditionFeatures): number {
  let shape = 0;
  for (let i = 0; i < a.shape.length; i++) shape += ((a.shape[i] - b.shape[i]) / 6) ** 2;
  shape = Math.sqrt(shape / a.shape.length) * 2.2;
  const tonal = Math.abs(a.tonality - b.tonality) / 9;
  const level = Math.abs(a.level - b.level) / 6;
  const centroid = Math.abs(a.centroid - b.centroid) * 1.4;
  let rhythm = 0;
  for (let i = 0; i < a.rhythm.length; i++) rhythm += (a.rhythm[i] - b.rhythm[i]) ** 2;
  rhythm = Math.sqrt(rhythm / a.rhythm.length) * 2.4;
  return Math.sqrt(shape * shape + level * level + centroid * centroid + rhythm * rhythm + tonal * tonal);
}

const WEIGHTS = { idle: 1, mid: 1, high: 1, overrun: 0.6 } as const;

/** Perceptual-ish distance between two bikes (0 = identical sounding). Roughly "number of clearly audible differences". */
export function bikeDistance(a: BikeFeatures, b: BikeFeatures): number {
  let sum = 0;
  let w = 0;
  for (const k of Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]) {
    const d = condDistance(a[k], b[k]);
    sum += WEIGHTS[k] * d * d;
    w += WEIGHTS[k];
  }
  return Math.sqrt(sum / w);
}
