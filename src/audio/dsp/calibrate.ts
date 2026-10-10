import { aWeightedDb } from './analysis';
import type { EngineVoiceParams } from './params';
import { renderSteady } from './synthFactory';

/** Every bike is brought to this A-weighted level (dB re full scale) at 65 % redline, wide-open throttle. */
export const CALIB_TARGET_A_DB = -22;
/** …but never louder than this RMS level at the top of the rev range (headroom for the soft clipper). */
export const CALIB_RMS_CAP_DB = -9;

export interface LoudnessMeasure {
  /** A-weighted level at the reference condition. */
  aDb: number;
  /** Unweighted RMS at 95 % redline. */
  rmsPeakDb: number;
}

function mono(l: Float32Array, r: Float32Array, from: number): Float32Array {
  const out = new Float32Array(l.length - from);
  for (let i = 0; i < out.length; i++) out[i] = (l[i + from] + r[i + from]) * 0.5;
  return out;
}

function rmsDb(x: Float32Array): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return 10 * Math.log10(s / Math.max(1, x.length) + 1e-14);
}

/** Render the reference conditions offline (unclipped, uncalibrated) and measure the voice. */
export function measureLoudness(params: EngineVoiceParams, engine: { redline: number; idle: number }, sampleRate = 48000): LoudnessMeasure {
  const electric = params.kind === 'electric';
  const ref = renderSteady(params, engine.redline * 0.65, 1, 1.6, sampleRate, 'high', { measure: true, speed: 30 });
  const top = renderSteady(params, engine.redline * (electric ? 0.9 : 0.95), 1, 1.2, sampleRate, 'high', { measure: true, speed: 45 });
  const a = mono(ref.left, ref.right, Math.round(sampleRate * 0.5));
  const t = mono(top.left, top.right, Math.round(sampleRate * 0.4));
  return { aDb: aWeightedDb(a, sampleRate), rmsPeakDb: rmsDb(t) };
}
