import { ElectricDSP } from './electricDsp';
import { EngineDSP, type EngineControls, type EngineEvent, type EngineSynthesizer } from './engineDsp';
import type { EngineQuality, EngineVoiceParams } from './params';

export interface SynthOptions {
  seed?: number;
  /** Unclipped, uncalibrated output (offline analysis / calibration). */
  measure?: boolean;
}

/** Create the right synthesiser for a voice (combustion crank-angle model or electric drivetrain). */
export function createSynth(params: EngineVoiceParams, sampleRate: number, quality: EngineQuality, opts: SynthOptions = {}): EngineSynthesizer & { snapControls(): void } {
  return params.kind === 'electric' ? new ElectricDSP(params, sampleRate, quality, opts) : new EngineDSP(params, sampleRate, quality, opts);
}

/** One control keyframe stream used by offline renders. */
export interface RenderPlan {
  seconds: number;
  rpm: (t: number) => number;
  throttle: (t: number) => number;
  load?: (t: number) => number;
  speed?: (t: number) => number;
  events?: { t: number; e: EngineEvent; value?: number }[];
  /** Starter motor runs while this returns true. */
  starter?: (t: number) => boolean;
}

export interface Rendered {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
}

/**
 * Render a plan offline in 128-frame quanta exactly like the AudioWorklet does
 * (controls are updated once per `controlEvery` quanta, ≈ 60 Hz game updates).
 */
export function renderOffline(
  params: EngineVoiceParams,
  plan: RenderPlan,
  sampleRate = 48000,
  quality: EngineQuality = 'high',
  opts: SynthOptions & { controlEvery?: number } = {},
): Rendered {
  const synth = createSynth(params, sampleRate, quality, opts);
  const total = Math.round(plan.seconds * sampleRate);
  const left = new Float32Array(total);
  const right = new Float32Array(total);
  const Q = 128;
  const every = opts.controlEvery ?? 8;
  const events = plan.events ? [...plan.events].sort((a, b) => a.t - b.t) : [];
  let ei = 0;
  let wasStarter = false;
  const ctl: EngineControls = { rpm: 0, throttle: 0, load: 0, speed: 0 };
  let first = true;
  for (let pos = 0, q = 0; pos < total; pos += Q, q++) {
    const t = pos / sampleRate;
    if (q % every === 0) {
      ctl.rpm = plan.rpm(t);
      ctl.throttle = plan.throttle(t);
      ctl.load = plan.load ? plan.load(t) : ctl.throttle;
      ctl.speed = plan.speed ? plan.speed(t) : 0;
      synth.setControls(ctl);
      if (first) {
        synth.snapControls();
        first = false;
      }
      const st = plan.starter ? plan.starter(t) : false;
      if (st !== wasStarter) {
        synth.setStarter(st);
        wasStarter = st;
      }
    }
    while (ei < events.length && events[ei].t <= t) {
      synth.trigger(events[ei].e, events[ei].value);
      ei++;
    }
    const n = Math.min(Q, total - pos);
    synth.process(left, right, pos, n);
  }
  return { left, right, sampleRate };
}

/** Steady-state render at fixed controls (tests and analysis). */
export function renderSteady(
  params: EngineVoiceParams,
  rpm: number,
  throttle: number,
  seconds: number,
  sampleRate = 48000,
  quality: EngineQuality = 'high',
  opts: SynthOptions & { speed?: number; load?: number } = {},
): Rendered {
  return renderOffline(
    params,
    { seconds, rpm: () => rpm, throttle: () => throttle, load: () => opts.load ?? throttle, speed: () => opts.speed ?? 0 },
    sampleRate,
    quality,
    opts,
  );
}
