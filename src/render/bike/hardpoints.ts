import type { BikeBlueprint } from './types';
import type { P3 } from './mesh';
import { parseTyre, type TyreSize } from './tyre';

const DEG = Math.PI / 180;

/**
 * Derived chassis geometry. The steering axis is defined by rake and trail
 * exactly as on a spec sheet: it meets the ground `trail` ahead of the front
 * contact patch; the fork tubes run parallel to it, offset forward by the
 * triple-clamp offset that the rake/trail/tyre radius imply.
 */
export interface Hardpoints {
  L: number;
  Rf: number;
  Rr: number;
  front: TyreSize;
  rear: TyreSize;
  /** Rake (radians). */
  rake: number;
  trail: number;
  /** Fork offset: perpendicular axle → steering axis distance (m). */
  offset: number;
  frontAxle: P3;
  rearAxle: P3;
  /** Steering axis direction (unit, pointing up/back). */
  axisDir: P3;
  /** Forward unit vector perpendicular to the steering axis (towards the fork tubes). */
  axisFwd: P3;
  /** Steering axis point level with the top of the fork tubes (steer group origin). */
  head: P3;
  /** Axle → top of fork tube along the fork axis. */
  forkLen: number;
  /** Swingarm pivot. */
  pivot: P3;
  swingLen: number;
  seatY: number;
  seatFront: number;
  seatBack: number;
  hip: P3;
  peg: P3;
  /** Right grip (bike space). */
  grip: P3;
  torsoPitch: number;
}

export function computeHardpoints(bp: BikeBlueprint): Hardpoints {
  const front = parseTyre(bp.front.tyre);
  const rear = parseTyre(bp.rear.tyre);
  if (!front || !rear) throw new Error(`${bp.id}: bad tyre size ${bp.front.tyre} / ${bp.rear.tyre}`);
  const L = bp.wheelbase;
  const Rf = front.R;
  const Rr = rear.R;
  const e = bp.rakeDeg * DEG;
  const t = bp.trail;
  const offset = Rf * Math.sin(e) - t * Math.cos(e);
  const d: P3 = [0, Math.cos(e), Math.sin(e)];
  const fwd: P3 = [0, Math.sin(e), -Math.cos(e)];
  const A: P3 = [0, Rf, -L];
  const fl = bp.forkLength;
  const head: P3 = [0, A[1] + fl * d[1] - offset * fwd[1], A[2] + fl * d[2] - offset * fwd[2]];
  const a = bp.swingarm.angleDeg * DEG;
  const sl = bp.swingarm.length;
  const pivot: P3 = [0, Rr + sl * Math.sin(a), -sl * Math.cos(a)];
  return {
    L,
    Rf,
    Rr,
    front,
    rear,
    rake: e,
    trail: t,
    offset,
    frontAxle: A,
    rearAxle: [0, Rr, 0],
    axisDir: d,
    axisFwd: fwd,
    head,
    forkLen: fl,
    pivot,
    swingLen: sl,
    seatY: bp.seat.height,
    seatFront: bp.seat.front,
    seatBack: bp.seat.back,
    hip: bp.rider.hip,
    peg: bp.rider.peg,
    grip: bp.cockpit.grip,
    torsoPitch: bp.rider.torsoPitch,
  };
}

/** Trail recomputed from the derived geometry (used by tests to check consistency). */
export function measuredTrail(h: Hardpoints): number {
  // Steering axis passes through head with direction axisDir; find its ground intersection.
  const s = -h.head[1] / h.axisDir[1];
  const gz = h.head[2] + s * h.axisDir[2];
  return -h.L - gz;
}
