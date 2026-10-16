import * as THREE from 'three';
import type { KitContext } from '../context';
import type { Hardpoints } from '../hardpoints';
import { bodyQ, shell } from '../kit/body';
import { lamp, ledStrip, type LampOpts } from '../kit/lights';
import { outlineLoft, type OutlineBody } from '../kit/shape';
import { MeshData, extrude, rod, roundBox, smooth2, sweep, type P2, type P3 } from '../mesh';
import { F, type Finish, type GroupName } from '../sink';
import { cut, type Field } from '../surface';

/**
 * Shared helpers for the European naked-bike blueprints of this family (Speed Triple,
 * Street Triple, Brutale 1000 RR, Svartpilen 401). Pure additions on top of the kit.
 *
 * Naked bikes carry their headlight, flyscreen and dash on the fork, so the face is
 * authored in the steering-local frame (origin = top of the fork tubes on the steering
 * axis, +Y up the axis, −Z forward, fork tubes at z = −offset) and added to the `steer`
 * group, which turns with the bars.
 */

/** Steering-local → bike-space matrix (optionally composed with a local transform). */
export function steerMat(ctx: KitContext, local?: THREE.Matrix4): THREE.Matrix4 {
  return local ? ctx.steerM.clone().multiply(local) : ctx.steerM.clone();
}

/** Steering-local direction → bike space. */
export function steerDir(ctx: KitContext, v: P3): P3 {
  const d = new THREE.Vector3(...v).transformDirection(ctx.steerM);
  return [d.x, d.y, d.z];
}

export function fromSteerAll(ctx: KitContext, pts: readonly P3[]): P3[] {
  return pts.map((p) => ctx.fromSteer(p));
}

export interface LoftPartOpts {
  /** Folded-edge depth of the shell. */
  depth?: number;
  /** Loft resolution multiplier (bodyQ base). */
  q?: number;
  /** Keep only the part of the surface where this field is ≥ 0 (authoring frame). */
  region?: Field;
  creases?: readonly number[];
  capFront?: boolean;
  capBack?: boolean;
  group?: GroupName;
  /** The outline body is authored in the steering-local frame. */
  steer?: boolean;
}

/** A symmetric lofted part (mirrored about x = 0) with folded edges. */
export function loftPart(ctx: KitContext, ob: OutlineBody, f: Finish, o: LoftPartOpts = {}): MeshData {
  let m = outlineLoft(ob, { ...bodyQ(ctx, o.q ?? 1), creases: o.creases, capFront: o.capFront, capBack: o.capBack });
  if (o.region) m = cut(m, o.region);
  if (o.steer) m.transform(ctx.steerM);
  shell(ctx, o.group ?? (o.steer ? 'steer' : 'chassis'), m, f, o.depth ?? 0.008);
  return m;
}

/** A pair of right-hand panels (shrouds, side covers) mirrored to the left. */
export function panelPair(ctx: KitContext, ob: OutlineBody, f: Finish, o: LoftPartOpts = {}): MeshData {
  let m = outlineLoft(ob, { ...bodyQ(ctx, o.q ?? 1.2), mirror: false, creases: o.creases, capFront: o.capFront, capBack: o.capBack });
  if (o.region) m = cut(m, o.region);
  if (o.steer) m.transform(ctx.steerM);
  const g = o.group ?? (o.steer ? 'steer' : 'chassis');
  shell(ctx, g, m, f, o.depth ?? 0.008);
  shell(ctx, g, m.mirrored(), f, o.depth ?? 0.008);
  return m;
}

/** A lamp authored in the steering-local frame (outline in local XY, facing local −Z). */
export function steerLamp(ctx: KitContext, outline: readonly P2[], at: P3, o: LampOpts, tiltX = 0, rollZ = 0, yaw = 0): void {
  const m = new THREE.Matrix4().makeTranslation(at[0], at[1], at[2]);
  m.multiply(new THREE.Matrix4().makeRotationY(Math.PI + yaw));
  if (tiltX) m.multiply(new THREE.Matrix4().makeRotationX(tiltX));
  if (rollZ) m.multiply(new THREE.Matrix4().makeRotationZ(rollZ));
  lamp(ctx, 'steer', outline, steerMat(ctx, m), o);
}

/** LED light guide authored in the steering-local frame, facing local `up` (default forwards). */
export function steerStrip(ctx: KitContext, path: readonly P3[], width: number, thick: number, kind: 'drl' | 'head' | 'indicator' = 'drl', up: P3 = [0, 0, -1]): void {
  ledStrip(ctx, 'steer', fromSteerAll(ctx, path), width, thick, kind, steerDir(ctx, up));
}

/** Rounded super-ellipse outline (w × h) centred on the origin; `n` > 2 squares it off. */
export function squircle(w: number, h: number, n = 2.6, pts = 28): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < pts; i++) {
    const a = (i / pts) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    out.push([Math.sign(c) * Math.pow(Math.abs(c), 2 / n) * w / 2, Math.sign(s) * Math.pow(Math.abs(s), 2 / n) * h / 2]);
  }
  return out;
}

/** Pair of flat brackets from the fork tubes (steering-local y) forward to a fork-mounted part. */
export function forkBrackets(ctx: KitContext, ys: readonly number[], toZ: number, toHalf: number, f: Finish = F.texturedBlack): void {
  const half = ctx.bp.fork.spacing / 2;
  const z0 = -ctx.hp.offset;
  for (const s of [-1, 1]) {
    for (const y of ys) {
      const a = ctx.fromSteer([s * (half - 0.004), y, z0 - 0.02]);
      const b = ctx.fromSteer([s * toHalf, y - 0.004, toZ]);
      ctx.add('steer', rod(a, b, 0.0075, 0.0065, ctx.seg(10, 6)), f);
      // Clamp band around the fork tube.
      ctx.add('steer', roundBox(0.012, 0.016, 0.012, 0.004), f, steerMat(ctx, new THREE.Matrix4().makeTranslation(s * half, y, z0 - ctx.bp.fork.stanchion * 0.5 - 0.012)));
    }
  }
}

/** Small LED indicator blade (front indicators on shrouds / lamp sides), bike space. */
export function bladeIndicator(ctx: KitContext, group: GroupName, a: P3, b: P3, r = 0.008): void {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = d.length();
  const prof: P2[] = smooth2([[-r, -r * 0.6], [r, -r * 0.6], [r * 1.1, r * 0.5], [-r * 1.1, r * 0.5]], 2, true);
  const path: P3[] = [a, [a[0] + d.x * 0.5, a[1] + d.y * 0.5, a[2] + d.z * 0.5], b];
  ctx.add(group, sweep(path, prof, { up: [0, 1, 0], capStart: true, capEnd: true }), F.texturedBlack);
  const tipA: P3 = [a[0] + d.x * 0.62, a[1] + d.y * 0.62, a[2] + d.z * 0.62];
  const tipB: P3 = [b[0] + (d.x / len) * 0.002, b[1] + (d.y / len) * 0.002, b[2] + (d.z / len) * 0.002];
  ctx.add(group, sweep([tipA, tipB], prof.map(([x, y]) => [x * 1.06, y * 1.06] as P2), { up: [0, 1, 0], capStart: true, capEnd: true }), F.indicator);
}

/** Flat side cover under the seat (zy outline), mirrored. */
export function sideCovers(ctx: KitContext, outline: readonly P2[], x: number, f: Finish = F.texturedBlack, thick = 0.012): void {
  for (const s of [-1, 1]) ctx.add('chassis', extrude(smooth2(outline, 3, true), thick, { plane: 'zy', bevel: 0.004, center: s * x, curveSegs: 1 }), f);
}

/** Steering-local point → bike space for a given set of hardpoints (rest pose). */
export function steerToBike(hp: Hardpoints, p: P3): [number, number, number] {
  const c = Math.cos(hp.rake), s = Math.sin(hp.rake);
  return [hp.head[0] + p[0], hp.head[1] + p[1] * c - p[2] * s, hp.head[2] + p[1] * s + p[2] * c];
}

/** The same outline mirrored about x = 0 with its winding kept counter-clockwise. */
export function mirrorOutline(pts: readonly P2[]): P2[] {
  return pts.map(([x, y]) => [-x, y] as P2).reverse();
}

/**
 * Arc of a LED light guide in a steering-local plane facing forward (−z): centre (cx, cy), radius r,
 * from angle a0 to a1 (radians, 0 = +x, counter-clockwise seen from the front-right ... i.e. +y up).
 */
export function drlArc(ctx: KitContext, cx: number, cy: number, z: number, r: number, a0: number, a1: number, width: number, thick = 0.004, kind: 'drl' | 'head' | 'indicator' = 'drl', ry = r): void {
  const path: P3[] = [];
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    path.push([cx + Math.cos(a) * r, cy + Math.sin(a) * ry, z]);
  }
  steerStrip(ctx, path, width, thick, kind);
}
