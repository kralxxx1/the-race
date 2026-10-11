import { clamp, lerp, smoothstep } from '../../core/math';

/**
 * Directing of the crash sequence (pure maths, testable): which camera shows when, how
 * slow time runs and when the run may end.
 *
 *  - 'fpv':       ride the helmet through the tumble.
 *  - 'cinematic': external orbit camera on the live crash.
 *  - 'both':      helmet tumble, then a cinematic replay of the same crash (deterministic re-run).
 *    Modes that respawn the rider (free ride) cannot afford the replay and use the helmet only.
 */
export type CrashCameraMode = 'fpv' | 'cinematic' | 'both';
export type CrashPhase = 'fpv' | 'cine' | 'replay';

export interface CrashPlan {
  first: 'fpv' | 'cine';
  /** Real seconds at which the first phase ends (replay starts there when `replay`). */
  firstEnd: number;
  replay: boolean;
  /** Real seconds until the run ends (non-respawn modes). */
  total: number;
}

export function planCrash(mode: CrashCameraMode, respawn: boolean): CrashPlan {
  if (mode === 'cinematic') return { first: 'cine', firstEnd: 3.6, replay: false, total: 3.6 };
  if (mode === 'both' && !respawn) return { first: 'fpv', firstEnd: 2.8, replay: true, total: 6.0 };
  return { first: 'fpv', firstEnd: 3.6, replay: false, total: 3.6 };
}

export function crashPhase(plan: CrashPlan, t: number): CrashPhase {
  if (plan.replay && t >= plan.firstEnd) return 'replay';
  return plan.first === 'fpv' ? 'fpv' : 'cine';
}

/** Simulation time scale `t` real seconds after the impact. `slowmo` 0..1 is the user's strength. */
export function crashTimeScale(plan: CrashPlan, t: number, slowmo: number): number {
  const s = clamp(slowmo, 0, 1);
  if (plan.replay && t >= plan.firstEnd) {
    const tr = t - plan.firstEnd;
    return lerp(1 - 0.45 * s, 1, smoothstep(1.4, 2.4, tr));
  }
  return lerp(1 - 0.78 * s, 1, smoothstep(0.9, 2.2, t));
}
