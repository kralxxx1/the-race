import * as THREE from 'three';
import { T, mul, type KitContext } from '../context';
import { indicatorPod, lamp, ledStrip, type LampKind } from '../kit/lights';
import { bodyQ, PAINT, shell, tankBody, type TankOpts } from '../kit/body';
import { curve, outlineLoft, stationPts, stationsBetween, surfaceAt, type OutlineBody } from '../kit/shape';
import { MeshData, catmull, circle, extrude, flat, lathe, rod, roundBox, smooth2, sweep, type P2, type P3 } from '../mesh';
import { F, hard, tint, vary, type Finish, type GroupName } from '../sink';

/**
 * Shared helpers of the cruiser family (Rebel 500, VMAX, R 18, Rocket 3 R, Fat Boy, Chief). Pure
 * additions on top of the kit: nothing else depends on them.
 *
 * Bike space: +Y up, −Z forward, +X right, rear axle at z = 0.
 */

// ───────────────────────────── fenders ─────────────────────────────

export interface FenderOpts {
  group: GroupName;
  /** Wheel centre (z, y). */
  cz: number;
  cy: number;
  /** Crown radius (tyre outer radius + gap). */
  r: number;
  /** Arc start / end, radians from vertical; + = rearwards. */
  a0: number;
  a1: number;
  /** Half width of the crown (m). */
  half: number;
  /** How far the edges drop towards the wheel axis (valance depth, m). */
  drop: number;
  /** Edge falloff exponent (larger = flatter crown, steeper valance). */
  power?: number;
  thick?: number;
  f?: Finish;
  /** Lateral scale at the start / end of the arc (tapered tails). */
  taper?: [number, number];
  /** Additional radial lift along the arc: (t 0..1) → metres (kicked-up tails). */
  lift?: (t: number) => number;
}

/** Wheel-hugging fender: a swept shell with a valanced section. Returns the centre line (bike space). */
export function fenderArc(ctx: KitContext, o: FenderOpts): P3[] {
  const w = o.half;
  const pw = o.power ?? 2.6;
  const th = o.thick ?? 0.004;
  const n = 14;
  const prof: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const x = -w + (2 * w * i) / n;
    prof.push([-o.drop * Math.pow(Math.abs(x) / w, pw), x]);
  }
  for (let i = n; i >= 0; i--) {
    const x = (-w + (2 * w * i) / n) * 0.985;
    prof.push([-o.drop * Math.pow(Math.abs(x) / w, pw) - th, x]);
  }
  const steps = ctx.seg(28, 10);
  const path: P3[] = [];
  const scale: P2[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const b = o.a0 + (o.a1 - o.a0) * t;
    const r = o.r + (o.lift ? o.lift(t) : 0);
    path.push([0, o.cy + Math.cos(b) * r, o.cz + Math.sin(b) * r]);
    const k = o.taper ? o.taper[0] + (o.taper[1] - o.taper[0]) * t : 1;
    scale.push([1, k]);
  }
  ctx.add(o.group, sweep(path, prof, { up: [0, 1, 0], scale, capStart: true, capEnd: true }), o.f ?? F.paint);
  return path;
}

// ───────────────────────────── lamps ─────────────────────────────

/** Small round tail lamp (lens facing +Z) at `at`, radius r. */
export function roundTailLamp(ctx: KitContext, at: P3, r: number, tiltX = 0, group: GroupName = 'chassis', housing: Finish = F.chrome): void {
  const outline: P2[] = circle(r, ctx.seg(28, 12)).map(([x, y]) => [x, y] as P2);
  const m = mul(T(...at), new THREE.Matrix4().makeRotationX(tiltX));
  lamp(ctx, group, outline, m, { kind: 'tail', inner: 'led', count: 1, depth: 0.03, housing, lensSmoked: false });
}

/** Rear stalk indicator pair. */
export function rearIndicators(ctx: KitContext, y: number, z: number, x0: number, x1: number, r = 0.014, group: GroupName = 'chassis'): void {
  for (const s of [-1, 1]) indicatorPod(ctx, group, [s * x0, y, z], [s * x1, y + 0.004, z + 0.012], r);
}

export { ledStrip, indicatorPod };
export type { LampKind };

// ───────────────────────────── generic shapes ─────────────────────────────

/** Tube through bike-space control points (Catmull–Rom), round section. */
export function tubeAlong(ctx: KitContext, group: GroupName, pts: readonly P3[], r: number, f: Finish, caps = true): P3[] {
  const path = pts.length > 2 ? catmull(pts, ctx.seg(8, 3)).map((q) => [q[0], q[1], q[2]] as P3) : pts.slice();
  ctx.add(group, sweep(path, circle(r, ctx.seg(14, 6)), { capStart: caps, capEnd: caps }), f);
  return path;
}

/** Thin raised line (pinstripe, trim bead, seam) along a bike-space path. */
export function bead(ctx: KitContext, group: GroupName, pts: readonly P3[], r: number, f: Finish): void {
  const path = pts.length > 2 ? catmull(pts, ctx.seg(6, 3)).map((q) => [q[0], q[1], q[2]] as P3) : pts.slice();
  ctx.add(group, sweep(path, smooth2([[r, 0], [0, r * 0.7], [-r, 0], [0, -r * 0.7]], 2, true), { capStart: true, capEnd: true }), f);
}

/** Flat cap closing one end of an outline body at station z (faces −Z or +Z). */
export function capMeshOf(ob: OutlineBody, z: number, back: boolean): MeshData {
  const pts = stationPts(ob, z);
  const dx = ob.xOff ? ob.xOff(z) : 0;
  const poly: P2[] = pts.map(([x, y]) => [x + dx, y] as P2);
  for (let i = pts.length - 1; i >= 0; i--) if (Math.abs(pts[i][0]) > 1e-6) poly.push([-pts[i][0] + dx, pts[i][1]]);
  return flat(poly, 'xy', z, back ? 1 : -1);
}

/** Lofted symmetric part with folded edges and optional end caps (uses the cruiser cap helper). */
export function loft(ctx: KitContext, ob: OutlineBody, f: Finish, o: { group?: GroupName; q?: number; creases?: readonly number[]; capFront?: boolean; capBack?: boolean; depth?: number; steer?: boolean } = {}): MeshData {
  let m = outlineLoft(ob, { ...bodyQ(ctx, o.q ?? 1), creases: o.creases });
  if (o.steer) m.transform(ctx.steerM);
  const g = o.group ?? (o.steer ? 'steer' : 'chassis');
  shell(ctx, g, m, f, o.depth ?? 0.008);
  const zs = ob.zs;
  for (const [on, z, back] of [[o.capFront, zs[0], false], [o.capBack, zs[zs.length - 1], true]] as const) {
    if (!on) continue;
    const cap = capMeshOf(ob, z, back);
    if (o.steer) cap.transform(ctx.steerM);
    ctx.add(g, cap, f);
  }
  return m;
}

/** Plain cylinder along the X axis (axle caps, hub nuts, pivot bolts) centred at p. */
export function xCylinder(ctx: KitContext, group: GroupName, p: P3, r: number, len: number, f: Finish, segs = 16): void {
  ctx.add(group, lathe([[0, -len / 2], [r, -len / 2], [r, len / 2], [0, len / 2]], { segs: ctx.seg(segs, 8), axis: 'x', sharp: [1, 2] }), f, T(...p));
}

/** Box-style cover plate in the zy plane (side covers, badges), mirrored when `both`. */
export function sidePlate(ctx: KitContext, outline: readonly P2[], x: number, thick: number, f: Finish, both = true, group: GroupName = 'chassis'): void {
  for (const s of both ? [-1, 1] : [1]) {
    ctx.add(group, extrude(smooth2(outline, 3, true), thick, { plane: 'zy', bevel: Math.min(0.006, thick * 0.45), curveSegs: 1, center: s * x }), f);
  }
}

export { curve, stationsBetween, roundBox, rod, tint, vary, hard };

// ───────────────────────────── tank ─────────────────────────────

export interface CruiserTankOpts extends TankOpts {
  /** Filler cap: lateral position / station / radius (the kit tank always puts a cap on the centre line). */
  cap?: { x: number; z: number; r: number; f?: Finish; flip?: boolean };
  /** Folded-edge depth of the shell. */
  depth?: number;
  q?: number;
}

/** Painted tank (no centre cap) with an optional offset filler cap. Returns the outline body for attachments. */
export function cruiserTank(ctx: KitContext, o: CruiserTankOpts, f: Finish = PAINT): OutlineBody {
  const ob = tankBody(o);
  const m = outlineLoft(ob, { ...bodyQ(ctx, o.q ?? 1), capFront: false });
  shell(ctx, 'chassis', m, f, o.depth ?? 0.02);
  if (o.cap) {
    const c = o.cap;
    const sp = surfaceAt(ob, c.z, c.x);
    const n = new THREE.Vector3(sp.n[0], sp.n[1], sp.n[2]).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    const mat = new THREE.Matrix4().compose(new THREE.Vector3(sp.p[0], sp.p[1] - 0.001, sp.p[2]), q, new THREE.Vector3(1, 1, 1));
    const cf = c.f ?? F.chrome;
    ctx.add('chassis', lathe([[c.r, 0.0], [c.r * 0.96, 0.007], [c.r * 0.6, 0.009], [0, 0.009]].map(([r, a]) => [r, a] as P2), { segs: ctx.seg(32, 12), axis: 'y', sharp: [1] }), cf, mat);
    ctx.add('chassis', lathe([[c.r * 1.12, -0.003], [c.r * 1.12, 0.002], [c.r, 0.002]].map(([r, a]) => [r, a] as P2), { segs: ctx.seg(32, 12), axis: 'y' }), F.texturedBlack, mat);
    if (ctx.micro) ctx.add('chassis', roundBox(c.r * 0.9, 0.004, c.r * 0.26, 0.002, 1), F.texturedBlack, mul(mat, T(0, 0.0105, 0)));
  }
  return ob;
}

// ───────────────────────────── radiator ─────────────────────────────

/** Radiator block (textured core, black tanks and frame) facing forward, tilted back by `tiltDeg`. */
export function radiatorBlock(ctx: KitContext, o: { cx: number; cy: number; cz: number; w: number; h: number; tiltDeg: number; depth?: number }): void {
  const depth = o.depth ?? 0.04;
  const m = mul(T(o.cx, o.cy, o.cz), new THREE.Matrix4().makeRotationX((-o.tiltDeg * Math.PI) / 180));
  const core = new MeshData();
  for (const face of [-1, 1]) {
    const base = core.vcount;
    const nz = face < 0 ? -1 : 1;
    for (const x of [-0.5, 0.5]) {
      for (const y of [-0.5, 0.5]) core.v(x * o.w, y * o.h, (face * depth) / 2, 0, 0, nz, (x + 0.5) * (o.w / 0.1), (y + 0.5) * (o.h / 0.1));
    }
    if (face > 0) {
      core.t(base, base + 2, base + 1);
      core.t(base + 1, base + 2, base + 3);
    } else {
      core.t(base, base + 1, base + 2);
      core.t(base + 1, base + 3, base + 2);
    }
  }
  ctx.add('chassis', core, F.radiator, m);
  for (const sx of [-1, 1]) ctx.add('chassis', roundBox(0.03, o.h + 0.02, depth + 0.012, 0.008, 2), F.texturedBlack, mul(m, T(sx * (o.w / 2 + 0.012), 0, 0)));
  for (const sy of [-1, 1]) ctx.add('chassis', roundBox(o.w + 0.03, 0.016, depth + 0.006, 0.005, 1), F.texturedBlack, mul(m, T(0, sy * (o.h / 2 + 0.007), 0)));
}

// ───────────────────────────── rear frame ─────────────────────────────

export interface RearLoopOpts {
  /** Half width of the loop at the pivot and at the seat. */
  w: number;
  /** Seat support: the tube runs along z ∈ [front, back] at height y. */
  front: number;
  back: number;
  y: number;
  /** Tube radius. */
  r?: number;
  f: Finish;
  /** Fender mounting stays down to the fender at the given wheel radius (0 = none). */
  fenderR?: number;
}

/** Visible rear frame rails: pivot plate → seat rail → down to the rear axle, plus a cross tube under the seat. */
export function rearFrameLoop(ctx: KitContext, o: RearLoopOpts): void {
  const pv = ctx.hp.pivot;
  const r = o.r ?? 0.016;
  for (const s of [-1, 1]) {
    const up: P3[] = [[s * (o.w - 0.01), pv[1] - 0.02, pv[2] - 0.02], [s * o.w, pv[1] + 0.1, pv[2] + 0.05], [s * o.w, o.y - 0.03, o.front + 0.08], [s * o.w, o.y, o.front + 0.28], [s * (o.w - 0.01), o.y + 0.005, o.back - 0.06]];
    tubeAlong(ctx, 'chassis', up, r, o.f);
    // Down-tube to the axle area (fender strut line)
    const down: P3[] = [[s * (o.w - 0.01), o.y + 0.004, o.back - 0.06], [s * (o.w + 0.03), o.y - 0.08, o.back + 0.02], [s * (o.w + 0.05), ctx.hp.Rr + 0.12, 0.08]];
    tubeAlong(ctx, 'chassis', down, r * 0.8, o.f);
  }
  // Cross tube + seat pan
  tubeAlong(ctx, 'chassis', [[-o.w, o.y - 0.01, o.front + 0.26], [0, o.y - 0.012, o.front + 0.25], [o.w, o.y - 0.01, o.front + 0.26]], r * 0.8, o.f);
  tubeAlong(ctx, 'chassis', [[-o.w + 0.01, o.y, o.back - 0.06], [0, o.y + 0.003, o.back - 0.065], [o.w - 0.01, o.y, o.back - 0.06]], r * 0.8, o.f);
}
