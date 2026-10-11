import * as THREE from 'three';
import type { KitContext } from '../context';
import { bodyQ, shell } from '../kit/body';
import { lamp, ledStrip, type LampOpts } from '../kit/lights';
import { outlineLoft, type OutlineBody } from '../kit/shape';
import { MeshData, extrude, rod, roundBox, smooth2, sweep, type P2, type P3 } from '../mesh';
import { F, hard, type Finish, type GroupName } from '../sink';
import { cut, type Field } from '../surface';

/**
 * Shared helpers for the Japanese naked-bike blueprints (CB500 Hornet, MT-09, MT-07,
 * Z900, SV650, 800NK). Pure additions on top of the kit: nothing else depends on them.
 *
 * Naked bikes carry their headlight, flyscreen and indicators on the fork, so much of the
 * face is authored in the steering-local frame (origin at the top of the fork tubes,
 * +Y up the steering axis, −Z forward, fork tubes at z = −offset) and added to the
 * `steer` group, which turns with the bars.
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

/** Steering-local points → bike space. */
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

/** A pair of right-hand side panels (shrouds, side covers) mirrored to the left. */
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
export function steerLamp(ctx: KitContext, outline: readonly P2[], at: P3, o: LampOpts, tiltX = 0, rollZ = 0): void {
  const m = new THREE.Matrix4().makeTranslation(at[0], at[1], at[2]);
  m.multiply(new THREE.Matrix4().makeRotationY(Math.PI));
  if (tiltX) m.multiply(new THREE.Matrix4().makeRotationX(tiltX));
  if (rollZ) m.multiply(new THREE.Matrix4().makeRotationZ(rollZ));
  lamp(ctx, 'steer', outline, steerMat(ctx, m), o);
}

/** LED light guide authored in the steering-local frame, facing local `up` (default forwards). */
export function steerStrip(ctx: KitContext, path: readonly P3[], width: number, thick: number, kind: 'drl' | 'head' | 'indicator' = 'drl', up: P3 = [0, 0, -1]): void {
  ledStrip(ctx, 'steer', fromSteerAll(ctx, path), width, thick, kind, steerDir(ctx, up));
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
    }
    // Clamp band around the fork tube.
    for (const y of ys) {
      const c = ctx.fromSteer([s * half, y, z0]);
      ctx.add('steer', roundBox(0.012, 0.016, 0.012, 0.004), f, steerMat(ctx, new THREE.Matrix4().makeTranslation(s * half, y, z0 - ctx.bp.fork.stanchion * 0.5 - 0.012)));
      void c;
    }
  }
}

/** Small LED indicator blade (front indicators on the shrouds / headlight sides), bike space. */
export function bladeIndicator(ctx: KitContext, group: GroupName, a: P3, b: P3, r = 0.008): void {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = d.length();
  const prof: P2[] = smooth2([[-r, -r * 0.6], [r, -r * 0.6], [r * 1.1, r * 0.5], [-r * 1.1, r * 0.5]], 2, true);
  const path: P3[] = [a, [a[0] + d.x * 0.5, a[1] + d.y * 0.5, a[2] + d.z * 0.5], b];
  ctx.add(group, sweep(path, prof, { up: [0, 1, 0], capStart: true, capEnd: true }), F.texturedBlack);
  const tipA: P3 = [a[0] + (d.x * 0.62), a[1] + d.y * 0.62, a[2] + d.z * 0.62];
  const tipB: P3 = [b[0] + (d.x / len) * 0.002, b[1] + (d.y / len) * 0.002, b[2] + (d.z / len) * 0.002];
  ctx.add(group, sweep([tipA, tipB], prof.map(([x, y]) => [x * 1.06, y * 1.06] as P2), { up: [0, 1, 0], capStart: true, capEnd: true }), F.indicator);
}

/** Flat black side cover under the seat (zy outline), mirrored. */
export function sideCovers(ctx: KitContext, outline: readonly P2[], x: number, f: Finish = F.texturedBlack, thick = 0.012): void {
  for (const s of [-1, 1]) ctx.add('chassis', extrude(smooth2(outline, 3, true), thick, { plane: 'zy', bevel: 0.004, center: s * x, curveSegs: 1 }), f);
}

/** Radiator side guard / grille slats in front of a radiator (bike space, both sides of x = 0). */
export function grille(ctx: KitContext, z: number, y0: number, y1: number, half: number, slats: number, tiltDeg: number, f: Finish = hard('#141517', 0.2, 0.5)): void {
  const t = (tiltDeg * Math.PI) / 180;
  for (let i = 0; i < slats; i++) {
    const y = y0 + ((y1 - y0) * (i + 0.5)) / slats;
    const zz = z - (y - (y0 + y1) / 2) * Math.tan(t);
    ctx.add('chassis', roundBox(half * 2, 0.004, 0.022, 0.0015, 1), f, new THREE.Matrix4().makeRotationX(-0.5).setPosition(0, y, zz));
  }
}
