import type { EngineLayout, ExhaustVoice } from '../data/bikes';
import { FIRING_ANGLES } from '../data/bikes';
import { Rng, clamp } from '../core/math';

/**
 * Offline synthesis of one seamless loop of an engine's exhaust note.
 *
 * Every combustion event is rendered as a damped pressure pulse placed at the
 * exact crank angle given by the engine's firing order. That timing pattern is
 * what makes an inline-four scream, a cross-plane R1 growl, a Ducati V4 "twin
 * pulse" bark and a 45° Harley go "potato-potato" — so each layout gets its
 * real rhythm rather than a generic tone.
 */
export interface EngineLoopOptions {
  sampleRate: number;
  /** rpm at which the loop is rendered (playbackRate = rpm / baseRpm). */
  baseRpm: number;
  layout: EngineLayout;
  voice: ExhaustVoice;
  /** Displacement per cylinder (cc) — bigger cylinders, deeper thump. */
  ccPerCylinder: number;
  /** Approximate loop length (seconds); actual length is a whole number of cycles. */
  seconds?: number;
  seed?: number;
}

export interface EngineLoop {
  data: Float32Array;
  baseRpm: number;
  cycles: number;
  samplesPerCycle: number;
}

/** Duration in seconds of one four-stroke cycle (720° of crank rotation). */
export function cycleSeconds(rpm: number): number {
  return 120 / rpm;
}

export function renderEngineLoop(o: EngineLoopOptions): EngineLoop {
  const angles = FIRING_ANGLES[o.layout];
  const sr = o.sampleRate;
  const spc = cycleSeconds(o.baseRpm) * sr;
  const cycles = Math.max(4, Math.round((o.seconds ?? 0.9) / cycleSeconds(o.baseRpm)));
  const total = Math.round(spc * cycles);
  const out = new Float32Array(total);
  if (angles.length === 0 || total === 0) return { data: out, baseRpm: o.baseRpm, cycles, samplesPerCycle: spc };

  const rng = new Rng(o.seed ?? 1234);
  const v = o.voice;
  const cyl = angles.length;
  // Mean interval between firings in seconds; pulses decay within ~ that window.
  const interval = cycleSeconds(o.baseRpm) / cyl;
  const bigBore = clamp(o.ccPerCylinder / 450, 0.4, 2.2);
  const res = v.resonance * Math.pow(o.baseRpm / 3000, 0.32);
  const low = clamp(55 + 40 / bigBore, 40, 120) * Math.pow(o.baseRpm / 2000, 0.25);
  const tauRes = clamp(interval * (0.35 + 0.25 * (1 - v.brightness)), 0.0012, 0.03);
  const tauLow = clamp(interval * (0.55 + 0.25 * bigBore), 0.002, 0.06);
  const tauNoise = clamp(interval * 0.18, 0.0007, 0.012);
  const noiseAmt = 0.12 + 0.35 * v.brightness;
  const lowAmt = 0.45 + 0.35 * bigBore * (1 - v.brightness * 0.5);

  // Per-cylinder character (slightly different runner lengths / combustion).
  const cylGain = angles.map(() => 1 + (rng.float() - 0.5) * 0.5 * v.roughness);
  const cylPhase = angles.map(() => rng.float() * Math.PI * 2);
  const pulseLen = Math.min(total, Math.ceil(Math.max(tauRes, tauLow, tauNoise) * 6 * sr));

  for (let k = 0; k < cycles; k++) {
    for (let c = 0; c < cyl; c++) {
      const jitter = (rng.float() - 0.5) * 0.012 * v.roughness * spc;
      const start = (k + angles[c] / 720) * spc + jitter;
      const amp = cylGain[c] * (1 + (rng.float() - 0.5) * 0.18 * (0.3 + v.roughness));
      const i0 = Math.floor(start);
      const frac = start - i0;
      for (let n = 0; n < pulseLen; n++) {
        const t = (n - frac) / sr;
        if (t < 0) continue;
        const eRes = Math.exp(-t / tauRes);
        const eLow = Math.exp(-t / tauLow);
        const eN = Math.exp(-t / tauNoise);
        if (eRes < 1e-4 && eLow < 1e-4) break;
        const s =
          amp *
          (eRes * Math.sin(2 * Math.PI * res * t + cylPhase[c]) * 0.8 +
            lowAmt * eLow * Math.sin(2 * Math.PI * low * t) +
            noiseAmt * eN * (rng.float() * 2 - 1));
        // Wrap around so the loop is seamless.
        out[(i0 + n) % total] += s;
      }
    }
  }

  // Gentle one-pole low-pass shaped by brightness, then DC removal and normalisation.
  const cutoff = 1800 + 7000 * v.brightness;
  const a = Math.exp((-2 * Math.PI * cutoff) / sr);
  // Run twice around the loop so the filter state is periodic too.
  let y = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < total; i++) {
      y = (1 - a) * out[i] + a * y;
      if (pass === 1) out[i] = y;
    }
  }
  let mean = 0;
  for (let i = 0; i < total; i++) mean += out[i];
  mean /= total;
  let peak = 1e-9;
  for (let i = 0; i < total; i++) {
    out[i] -= mean;
    peak = Math.max(peak, Math.abs(out[i]));
  }
  const g = 0.9 / peak;
  for (let i = 0; i < total; i++) out[i] *= g;
  return { data: out, baseRpm: o.baseRpm, cycles, samplesPerCycle: spc };
}

/** rpm points at which loops are rendered for a given engine (crossfaded at runtime). */
export function layerRpms(idle: number, redline: number): number[] {
  const lo = Math.max(idle, 750);
  return [lo * 1.05, Math.max(lo * 1.8, redline * 0.36), redline * 0.62, redline * 0.92];
}

/** Equal-power crossfade weights for `rpm` across the layer rpms (log-spaced). */
export function layerWeights(rpm: number, layers: readonly number[]): number[] {
  const w = layers.map(() => 0);
  if (rpm <= layers[0]) {
    w[0] = 1;
    return w;
  }
  const last = layers.length - 1;
  if (rpm >= layers[last]) {
    w[last] = 1;
    return w;
  }
  for (let i = 0; i < last; i++) {
    if (rpm >= layers[i] && rpm <= layers[i + 1]) {
      const t = Math.log(rpm / layers[i]) / Math.log(layers[i + 1] / layers[i]);
      w[i] = Math.cos((t * Math.PI) / 2);
      w[i + 1] = Math.sin((t * Math.PI) / 2);
      break;
    }
  }
  return w;
}

/** Firing intervals (degrees) between consecutive combustion events, for display/tests. */
export function firingIntervals(layout: EngineLayout): number[] {
  const a = [...FIRING_ANGLES[layout]].sort((x, y) => x - y);
  return a.map((v, i) => (i + 1 < a.length ? a[i + 1] - v : 720 - v + a[0]));
}
