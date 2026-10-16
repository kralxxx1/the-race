import * as THREE from 'three';
import { T, mul, type KitContext } from '../context';
import type { Hardpoints } from '../hardpoints';
import { bodyQ, shell } from '../kit/body';
import { lamp, ledStrip, offsetOutline, type LampOpts } from '../kit/lights';
import { outlineLoft, type OutlineBody } from '../kit/shape';
import { MeshData, extrude, flat, lathe, rod, roundBox, smooth2, sweep, type P2, type P3 } from '../mesh';
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

// ───────────────────────────── LED lamps & bug-eye faces ─────────────────────────────

export interface LedLampOpts {
  /** Housing depth behind the lens (m). */
  depth?: number;
  /** Housing rim around the lens (m). */
  rim?: number;
  housing?: Finish;
  /** Projector discs in lamp-local XY: [x, y, radius]. */
  projectors: ReadonlyArray<readonly [number, number, number]>;
  /** LED light-guide path in lamp-local XY (z-less), e.g. an eyebrow along the lamp edge. */
  drl?: readonly P2[];
  drlWidth?: number;
  /** Interior floor finish (default dark satin: LED units read as dark with bright cores). */
  floor?: Finish;
}

/**
 * LED headlight authored in lamp-local XY facing +Z: black housing, dark floor, chrome
 * projector bowls with small emissive cores, optional light-guide DRL and a clear lens.
 * Unlike `lamp()` the interior is dark, so the lens does not wash out into a white disc.
 */
export function ledLamp(ctx: KitContext, group: GroupName, outline: readonly P2[], m: THREE.Matrix4, o: LedLampOpts): void {
  const depth = o.depth ?? 0.05;
  const rim = o.rim ?? 0.005;
  ctx.add(group, extrude(offsetOutline(outline, rim), depth, { bevel: Math.min(rim * 0.8, 0.003), plane: 'xy', center: -depth / 2, curveSegs: 1 }), o.housing ?? F.texturedBlack, m);
  ctx.add(group, flat(outline, 'xy', 0.0012, 1), o.floor ?? hardDark(), m);
  const seg = ctx.seg(22, 10);
  for (const [x, y, r] of o.projectors) {
    const bowl = lathe([[0, -0.016], [r * 1.18, -0.01], [r * 1.34, 0.0015]], { segs: seg, axis: 'z' });
    ctx.add(group, bowl, F.chrome, mul(m, T(x, y, 0)));
    // Bezel ring around the projector lens.
    ctx.add(group, lathe([[r * 0.86, 0.0018], [r * 1.12, 0.0018], [r * 1.12, 0.0042], [r * 0.86, 0.0042]], { segs: seg, axis: 'z', sharp: true }), F.glossBlack, mul(m, T(x, y, 0)));
    const lens = lathe(([[0, r * 0.3], [r * 0.55, r * 0.22], [r * 0.82, 0.0]] as P2[]).reverse(), { segs: seg, axis: 'z' });
    ctx.add(group, lens, F.head, mul(m, T(x, y, 0.0032)));
  }
  ctx.add(group, flat(outline, 'xy', 0.006, 1), F.lens, m);
  if (o.drl && o.drl.length > 1) {
    const pts = o.drl.map(([x, y]) => new THREE.Vector3(x, y, 0.0045).applyMatrix4(m));
    const up = new THREE.Vector3(0, 0, 1).transformDirection(m);
    ledStrip(ctx, group, pts.map((v) => [v.x, v.y, v.z] as P3), o.drlWidth ?? 0.0055, 0.0035, 'drl', [up.x, up.y, up.z]);
  }
}

function hardDark(): Finish {
  return { ...F.glossBlack, rough: 0.35 };
}

/** The part of a closed outline between fractions t0 → t1 of its loop, pulled towards the centroid by `inset`. */
export function outlineArc(outline: readonly P2[], t0: number, t1: number, inset: number): P2[] {
  const n = outline.length;
  let cx = 0, cy = 0;
  for (const [x, y] of outline) {
    cx += x / n;
    cy += y / n;
  }
  const out: P2[] = [];
  const steps = Math.max(2, Math.round(Math.abs(t1 - t0) * n));
  for (let i = 0; i <= steps; i++) {
    const t = t0 + ((t1 - t0) * i) / steps;
    const f = (((t % 1) + 1) % 1) * n;
    const a = Math.floor(f) % n, b = (a + 1) % n, u = f - Math.floor(f);
    const x = outline[a][0] + (outline[b][0] - outline[a][0]) * u;
    const y = outline[a][1] + (outline[b][1] - outline[a][1]) * u;
    const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1;
    out.push([x - (dx / d) * inset, y - (dy / d) * inset]);
  }
  return out;
}

/** A lamp authored in the steering-local frame (outline in local XY, facing local −Z). */
export function steerLedLamp(ctx: KitContext, outline: readonly P2[], at: P3, o: LedLampOpts, tiltX = 0, yaw = 0): void {
  const m = new THREE.Matrix4().makeTranslation(at[0], at[1], at[2]);
  m.multiply(new THREE.Matrix4().makeRotationY(Math.PI + yaw));
  if (tiltX) m.multiply(new THREE.Matrix4().makeRotationX(tiltX));
  ledLamp(ctx, 'steer', outline, steerMat(ctx, m), o);
}

export interface BugEyeOpts {
  /** Right-hand lamp outline (bike-x orientation, relative to its centre, counter-clockwise from the outer point). */
  outline: readonly P2[];
  /** Right lamp centre in steering-local coordinates (mirrored for the left lamp). */
  x: number;
  y: number;
  z: number;
  /** Toe-in (rad) and nose-down tilt (rad). */
  yaw?: number;
  tilt?: number;
  depth: number;
  projectors: ReadonlyArray<readonly [number, number, number]>;
  /** DRL eyebrow: loop fractions of the outline, inset and strip width. */
  drl?: { t0: number; t1: number; inset: number; width: number };
  /** Black mask shell between the lamps (steering-local outline body). */
  mask?: OutlineBody;
  /** Flyscreen (steering-local outline body). */
  visor?: OutlineBody;
  visorTint?: Finish;
  /** Fork brackets behind the face. */
  brackets?: { ys: readonly number[]; toZ: number; toHalf: number };
  /** Right front indicator blade, steering-local (mirrored). */
  indicator?: { a: P3; b: P3; r?: number };
}

/** Twin "bug-eye" LED headlights with a mask, DRL eyebrows, flyscreen and indicators, on the fork. */
export function bugEyeFace(ctx: KitContext, o: BugEyeOpts): void {
  if (o.mask) loftPart(ctx, o.mask, hardBlack(), { steer: true, capFront: true, capBack: true, depth: 0.006 });
  for (const s of [-1, 1]) {
    const local = s > 0 ? mirrorOutline(o.outline) : o.outline.map(([x, y]) => [x, y] as P2);
    const drl = o.drl ? outlineArc(o.outline, o.drl.t0, o.drl.t1, o.drl.inset).map(([x, y]) => [-s * x, y] as P2) : undefined;
    steerLedLamp(ctx, local, [s * o.x, o.y, o.z], { depth: o.depth, rim: 0.0055, projectors: o.projectors.map(([x, y, r]) => [-s * x, y, r] as const), drl, drlWidth: o.drl?.width }, o.tilt ?? 0, s * -(o.yaw ?? 0));
    if (o.indicator) bladeIndicator(ctx, 'steer', ctx.fromSteer([s * o.indicator.a[0], o.indicator.a[1], o.indicator.a[2]]), ctx.fromSteer([s * o.indicator.b[0], o.indicator.b[1], o.indicator.b[2]]), o.indicator.r ?? 0.0075);
  }
  if (o.brackets) forkBrackets(ctx, o.brackets.ys, o.brackets.toZ, o.brackets.toHalf);
  if (o.visor) {
    const vm = outlineLoft(o.visor, { su: ctx.seg(8, 3), sv: ctx.seg(4, 2) });
    vm.transform(ctx.steerM);
    ctx.add('steer', vm, o.visorTint ?? F.screen);
  }
}

function hardBlack(): Finish {
  return { ...F.satinBlack, rough: 0.5 };
}
