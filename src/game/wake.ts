import { clamp, smoothstep } from '../core/math';

/**
 * Aerodynamic wake of passing vehicles, deterministic and a pure function of road-space positions.
 * A big vehicle shoves the rider away at its nose (bow wave), pushes lightly along its flank and
 * sucks the bike towards it in the slipstream behind it. Oncoming traffic gives one sharp
 * shove as it goes by. The result is a lateral velocity (m/s, + = towards larger d) the session
 * adds to the bike, and a 0..1 turbulence level for the camera.
 */
export interface WakeCar {
  s: number;
  d: number;
  /** Speed along its own travel direction (m/s, ≥ 0). */
  v: number;
  dir: 1 | -1;
  length: number;
  width: number;
  arch: { heavy: boolean };
}

export interface WakeResult {
  push: number;
  turbulence: number;
}

/** Largest lateral shove (m/s): a noticeable nudge, never a crash by itself. */
export const MAX_WAKE_PUSH = 0.85;

export function computeWake(bikeS: number, bikeD: number, bikeV: number, cars: readonly WakeCar[], out: WakeResult): WakeResult {
  let push = 0;
  let turb = 0;
  for (const c of cars) {
    const ds = bikeS - c.s;
    const half = c.length / 2;
    if (ds > half + 9 || ds < -half - 9) continue;
    const off = bikeD - c.d;
    const gap = Math.abs(off) - c.width / 2;
    if (gap > 3.4 || gap < -0.6) continue;
    const away = off >= 0 ? 1 : -1;
    const lat = smoothstep(3.4, 0.25, gap);
    const rel = c.dir === 1 ? Math.abs(bikeV - c.v) : bikeV + c.v;
    const size = c.arch.heavy ? 1 : 0.3;
    let profile: number;
    let strength: number;
    if (c.dir === 1) {
      // Bow wave ahead of the nose, light pressure on the flank, suction in the lee.
      const front = smoothstep(half - 2, half + 1.5, ds) * smoothstep(half + 9, half + 4, ds);
      const flank = smoothstep(-half, -half + 2, ds) * smoothstep(half, half - 2, ds) * 0.3;
      const lee = smoothstep(-half - 9, -half - 3, ds) * smoothstep(-half + 0.5, -half - 1.5, ds);
      profile = (front + flank) - lee * 0.7;
      strength = Math.abs(profile);
    } else {
      // Head-on pass: a single sharp shove as the nose goes by.
      const t = smoothstep(half + 6, 0, Math.abs(ds));
      profile = t;
      strength = t;
    }
    const k = size * clamp(rel / 28, 0.15, 1.6) * lat;
    push += away * profile * k;
    turb += strength * k;
  }
  out.push = clamp(push * 0.8, -MAX_WAKE_PUSH, MAX_WAKE_PUSH);
  out.turbulence = clamp(turb, 0, 1);
  return out;
}
