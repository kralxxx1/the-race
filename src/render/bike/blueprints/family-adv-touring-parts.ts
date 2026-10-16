import * as THREE from 'three';
import type { KitContext } from '../context';
import { T, mul } from '../context';
import { bodyQ, shell } from '../kit/body';
import { lamp, ledStrip, type LampKind, type LampOpts } from '../kit/lights';
import { outlineLoft, stationPts, stationsBetween, curve, type OutlineBody } from '../kit/shape';
import { MeshData, extrude, flat, lathe, rod, roundBox, smooth2, sweep, type P2, type P3 } from '../mesh';
import { F, hard, tint, type Finish, type GroupName } from '../sink';
import { cut, type Field } from '../surface';

/**
 * Shared helpers for the adventure / touring blueprints (Africa Twin, Gold Wing, V-Strom 650,
 * Multistrada V4, K 1600 GT, 890 Adventure R, Pan America, TRK 502 X). Pure additions on top of
 * the kit: nothing else depends on them.
 *
 * Bike space: +Y up, −Z forward, +X right, rear axle at z = 0. "Steering-local" is the frame of the
 * steer group (origin at the top of the fork tubes on the steering axis, +Y up the axis).
 */

// ───────────────────────────── frames & transforms ─────────────────────────────

/** Steering-local → bike-space matrix (optionally composed with a local transform). */
export function steerMat(ctx: KitContext, local?: THREE.Matrix4): THREE.Matrix4 {
  return local ? ctx.steerM.clone().multiply(local) : ctx.steerM.clone();
}

/** Steering-local direction → bike space. */
export function steerDir(ctx: KitContext, v: P3): P3 {
  const d = new THREE.Vector3(...v).transformDirection(ctx.steerM);
  return [d.x, d.y, d.z];
}

/** Rotation about X by `a` placed at (x, y, z): the usual "tilted flat part" matrix. */
export function tiltAt(x: number, y: number, z: number, rx = 0, ry = 0): THREE.Matrix4 {
  const m = new THREE.Matrix4().makeTranslation(x, y, z);
  if (ry) m.multiply(new THREE.Matrix4().makeRotationY(ry));
  if (rx) m.multiply(new THREE.Matrix4().makeRotationX(rx));
  return m;
}

// ───────────────────────────── lofted parts ─────────────────────────────

export interface PartOpts {
  /** Folded-edge depth of the shell (thickness read at the cut edges). */
  depth?: number;
  /** Loft resolution multiplier (bodyQ base). */
  q?: number;
  /** Keep only the part of the surface where this field is ≥ 0. */
  region?: Field;
  creases?: readonly number[];
  capFront?: boolean;
  capBack?: boolean;
  group?: GroupName;
  /** The outline body is authored in the steering-local frame. */
  steer?: boolean;
}

/**
 * Flat cap closing one end of an outline body at station z, facing along +Z (`back`) or −Z. Built
 * from the section polygon with the normal-driven winding of `flat`, so it shades correctly on both
 * ends (the loft's own caps are wound the wrong way round on the rear end).
 */
export function capMesh(ob: OutlineBody, z: number, back: boolean): MeshData {
  const pts = stationPts(ob, z);
  const dx = ob.xOff ? ob.xOff(z) : 0;
  const poly: P2[] = pts.map(([x, y]) => [x + dx, y] as P2);
  for (let i = pts.length - 1; i >= 0; i--) if (Math.abs(pts[i][0]) > 1e-6) poly.push([-pts[i][0] + dx, pts[i][1]]);
  return flat(poly, 'xy', z, back ? 1 : -1);
}

/** A symmetric lofted part (mirrored about x = 0) with folded edges. */
export function loftPart(ctx: KitContext, ob: OutlineBody, f: Finish, o: PartOpts = {}): MeshData {
  let m = outlineLoft(ob, { ...bodyQ(ctx, o.q ?? 1), creases: o.creases });
  if (o.region) m = cut(m, o.region);
  if (o.steer) m.transform(ctx.steerM);
  const g = o.group ?? (o.steer ? 'steer' : 'chassis');
  shell(ctx, g, m, f, o.depth ?? 0.008);
  const zs = ob.zs;
  for (const [on, z, back] of [[o.capFront, zs[0], false], [o.capBack, zs[zs.length - 1], true]] as const) {
    if (!on) continue;
    const cap = capMesh(ob, z, back);
    if (o.steer) cap.transform(ctx.steerM);
    ctx.add(g, cap, f);
  }
  return m;
}

/**
 * A pair of side panels (shrouds, side covers): the outline body describes the right-hand panel
 * only (sections run from its top edge down its outer face); it is mirrored to the left.
 */
export function panelPair(ctx: KitContext, ob: OutlineBody, f: Finish, o: PartOpts = {}): MeshData {
  let m = outlineLoft(ob, { ...bodyQ(ctx, o.q ?? 1.2), mirror: false, creases: o.creases, capFront: o.capFront, capBack: o.capBack });
  if (o.region) m = cut(m, o.region);
  if (o.steer) m.transform(ctx.steerM);
  const g = o.group ?? (o.steer ? 'steer' : 'chassis');
  shell(ctx, g, m, f, o.depth ?? 0.008);
  shell(ctx, g, m.mirrored(), f, o.depth ?? 0.008);
  return m;
}

/** Closed rounded-box style section (top centre → down the outer side → bottom edge). */
export const BOXY: readonly P2[] = [[0, 1], [0.7, 0.99], [0.96, 0.92], [1, 0.6], [0.98, 0.15], [0.85, 0.01], [0, 0]];
/** Softly rounded body section (7 points, ends on the bottom centre). */
export const SOFT: readonly P2[] = [[0, 1], [0.55, 0.985], [0.88, 0.9], [1, 0.62], [0.96, 0.25], [0.74, 0.04], [0, 0]];

// ───────────────────────────── lamps ─────────────────────────────

/** A lamp authored in bike space facing −Z (front lamps): outline as seen from the front (x = bike right). */
export function frontLamp(ctx: KitContext, group: GroupName, outline: readonly P2[], at: P3, o: LampOpts, tiltX = 0): void {
  const m = new THREE.Matrix4().makeTranslation(at[0], at[1], at[2]);
  m.multiply(new THREE.Matrix4().makeRotationY(Math.PI));
  if (tiltX) m.multiply(new THREE.Matrix4().makeRotationX(tiltX));
  // Rotating by π about Y mirrors local x: flip the outline so it reads as authored from the front.
  lamp(ctx, group, outline.map(([x, y]) => [-x, y] as P2).reverse(), m, o);
}

/** A lamp authored in bike space facing +Z (tail lights): outline as seen from behind (x = bike right). */
export function rearLamp(ctx: KitContext, group: GroupName, outline: readonly P2[], at: P3, o: LampOpts, tiltX = 0): void {
  const m = new THREE.Matrix4().makeTranslation(at[0], at[1], at[2]);
  if (tiltX) m.multiply(new THREE.Matrix4().makeRotationX(tiltX));
  lamp(ctx, group, outline, m, o);
}

/** LED light guide in bike space. */
export function strip(ctx: KitContext, group: GroupName, path: readonly P3[], width: number, thick: number, kind: LampKind = 'drl', up: P3 = [0, 1, 0]): void {
  ledStrip(ctx, group, path, width, thick, kind, up);
}

/** Small LED indicator blade between bike-space points a (mount) and b (tip). */
export function bladeIndicator(ctx: KitContext, group: GroupName, a: P3, b: P3, r = 0.008): void {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = d.length();
  const prof: P2[] = smooth2([[-r, -r * 0.6], [r, -r * 0.6], [r * 1.1, r * 0.5], [-r * 1.1, r * 0.5]], 2, true);
  const mid: P3 = [a[0] + d.x * 0.5, a[1] + d.y * 0.5, a[2] + d.z * 0.5];
  ctx.add(group, sweep([a, mid, b], prof, { up: [0, 1, 0], capStart: true, capEnd: true }), F.texturedBlack);
  const tipA: P3 = [a[0] + d.x * 0.62, a[1] + d.y * 0.62, a[2] + d.z * 0.62];
  const tipB: P3 = [b[0] + (d.x / len) * 0.002, b[1] + (d.y / len) * 0.002, b[2] + (d.z / len) * 0.002];
  ctx.add(group, sweep([tipA, tipB], prof.map(([x, y]) => [x * 1.06, y * 1.06] as P2), { up: [0, 1, 0], capStart: true, capEnd: true }), F.indicator);
}

// ───────────────────────────── paths & tubes ─────────────────────────────

export function smoothPath(pts: readonly P3[], per: number): P3[] {
  const out: P3[] = [];
  const n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      const c = (j: number) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
      out.push([c(0), c(1), c(2)]);
    }
  }
  out.push(pts[n - 1]);
  return out;
}

function roundSection(r: number, n: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out;
}

function ellipseSection(rx: number, ry: number, n: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    out.push([Math.cos(t) * rx, Math.sin(t) * ry]);
  }
  return out;
}

/** Tube along bike-space control points (frame braces, rails, brackets, hoses). */
export function tubeAlong(ctx: KitContext, group: GroupName, pts: readonly P3[], r: number, f: Finish): void {
  ctx.add(group, sweep(pts.length > 2 ? smoothPath(pts, ctx.seg(6, 3)) : pts, roundSection(r, ctx.seg(12, 6)), { capStart: true, capEnd: true }), f);
}

/** Tube with an elliptical section (flat guard rails, oval mounts). */
export function ovalTubeAlong(ctx: KitContext, group: GroupName, pts: readonly P3[], rx: number, ry: number, f: Finish): void {
  ctx.add(group, sweep(pts.length > 2 ? smoothPath(pts, ctx.seg(6, 3)) : pts, ellipseSection(rx, ry, ctx.seg(14, 6)), { capStart: true, capEnd: true, up: [0, 1, 0] }), f);
}

/** Elliptical (rx × ry) silencer body swept from a to b, capped, with an optional taper. */
export function ovalCan(ctx: KitContext, a: P3, b: P3, rx: number, ry: number, f: Finish, taper = 1, group: GroupName = 'chassis'): MeshData {
  const n = ctx.seg(8, 3);
  const path: P3[] = [];
  const scale: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    path.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    scale.push((1 + (taper - 1) * t) * (t < 0.08 ? 0.86 + (t / 0.08) * 0.14 : t > 0.94 ? 1 - (t - 0.94) * 1.6 : 1));
  }
  const m = sweep(path, ellipseSection(rx, ry, ctx.seg(28, 12)), { up: [0, 1, 0], scale, capStart: true, capEnd: true });
  ctx.add(group, m, f);
  return m;
}

/** Short round tail pipe with a sooty inside between a and b. */
export function tailPipe(ctx: KitContext, a: P3, b: P3, r: number, f: Finish = F.steel, group: GroupName = 'chassis'): void {
  ctx.add(group, rod(a, b, r, r, ctx.seg(20, 8)), f);
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
  const m = new THREE.Matrix4().compose(new THREE.Vector3(b[0] + d.x * 0.0005, b[1] + d.y * 0.0005, b[2] + d.z * 0.0005), q, new THREE.Vector3(1, 1, 1));
  ctx.add(group, lathe([[0, -0.002], [r * 0.82, -0.002], [r * 0.82, 0.0005], [0, 0.0005]], { segs: ctx.seg(20, 8), axis: 'y' }), hard('#090909', 0, 0.9), m);
}

// ───────────────────────────── adventure accessories ─────────────────────────────

export interface HandGuardOpts {
  color: Finish;
  /** Extra length past the bar end (m). */
  outer?: number;
  /** Starting distance inboard of the grip centre (m). */
  inner?: number;
  /** Height (m) of the shield. */
  h?: number;
}

/** Wrap-around hand guards (steering group): a curved shield in front of the grip and lever. */
export function handGuards(ctx: KitContext, o: HandGuardOpts): void {
  const g = ctx.hp.grip;
  const hh = (o.h ?? 0.085) / 2;
  const prof = smooth2([[0.0, -hh], [0.012, -hh * 0.9], [0.016, 0.0], [0.012, hh * 0.9], [0.0, hh], [-0.004, 0.0]], 2, true);
  for (const s of [-1, 1]) {
    const gx = Math.abs(g[0]);
    const path: P3[] = [
      [s * (gx - (o.inner ?? 0.13)), g[1] + 0.02, g[2] - 0.02],
      [s * (gx - 0.04), g[1] + 0.035, g[2] - 0.09],
      [s * (gx + (o.outer ?? 0.06)), g[1] + 0.01, g[2] - 0.06],
      [s * (gx + (o.outer ?? 0.06) + 0.015), g[1] - 0.01, g[2]],
    ];
    ctx.add('steer', sweep(path, prof, { up: [0, 1, 0], capStart: true, capEnd: true }), o.color);
    // Aluminium bar-end mount struts.
    ctx.add('steer', rod([s * (gx + 0.03), g[1] + 0.01, g[2] - 0.01], [s * (gx + (o.outer ?? 0.06) - 0.005), g[1] + 0.005, g[2] - 0.055], 0.004, 0.004, 8), F.darkAlu);
  }
}

/** Flat skid plate (zy outline) spanning |x| ≤ half, with rounded edges. */
export function skidPlate(ctx: KitContext, outline: readonly P2[], half: number, f: Finish = F.darkAlu, thick = 0.014): void {
  const m = extrude(smooth2(outline, 3, true), half * 2, { plane: 'zy', bevel: Math.min(0.006, thick), curveSegs: 1, center: 0 });
  ctx.add('chassis', m, f);
}

/** Flat side cover (zy outline) at |x|, mirrored. */
export function sideCovers(ctx: KitContext, outline: readonly P2[], x: number, f: Finish = F.texturedBlack, thick = 0.012): void {
  for (const s of [-1, 1]) ctx.add('chassis', extrude(smooth2(outline, 3, true), thick, { plane: 'zy', bevel: 0.004, center: s * x, curveSegs: 1 }), f);
}

/** Radiator side guard slats in front of a radiator core (bike space, spanning ±half). */
export function grille(ctx: KitContext, z: number, y0: number, y1: number, half: number, slats: number, tiltDeg: number, f: Finish): void {
  const t = (tiltDeg * Math.PI) / 180;
  for (let i = 0; i < slats; i++) {
    const y = y0 + ((y1 - y0) * (i + 0.5)) / slats;
    const zz = z - (y - (y0 + y1) / 2) * Math.tan(t);
    ctx.add('chassis', roundBox(half * 2, 0.004, 0.022, 0.0015, 1), f, new THREE.Matrix4().makeRotationX(-0.5).setPosition(0, y, zz));
  }
}

// ───────────────────────────── luggage ─────────────────────────────

export interface CaseOpts {
  /** z extent of the case (front → back). */
  front: number;
  back: number;
  /** Lateral centre of the case (|x|; 0 for a top case). */
  x: number;
  /** Half width at the widest. */
  half: number;
  /** Side-view top and bottom lines (z, y), front → back. */
  top: readonly P2[];
  bottom: readonly P2[];
  /** Plan-view half-width line as multiples of `half` (z, k). */
  plan?: readonly P2[];
  /** Body finish (paint / black plastic / aluminium). */
  f: Finish;
  /** Lid / trim band finish. */
  trim?: Finish;
  /** Where the lid seam sits (fraction of the height below the top, 0..1). */
  seam?: number;
  /** Section template (default BOXY). */
  section?: readonly P2[];
  /** Latches on the outer face. */
  latches?: number;
}

/** A hard luggage case (pannier / top case): lofted shell, lid seam band, latches. One side or centre. */
export function luggageCase(ctx: KitContext, o: CaseOpts, side: 1 | -1 | 0 = 1): void {
  const xc = side * o.x;
  const plan = o.plan ?? [[o.front, 0.55], [o.front + (o.back - o.front) * 0.15, 0.95], [o.back - (o.back - o.front) * 0.15, 1], [o.back, 0.7]];
  const ob: OutlineBody = {
    zs: stationsBetween(o.front, o.back, 10, 0.5),
    top: curve(o.top),
    bottom: curve(o.bottom),
    half: curve(plan.map(([z, k]) => [z, k * o.half] as P2)),
    sections: [{ z: o.front, pts: o.section ?? BOXY }],
    xOff: () => xc,
  };
  const m = outlineLoft(ob, { ...bodyQ(ctx, 1.1) });
  shell(ctx, 'chassis', m, o.f, 0.008);
  ctx.add('chassis', capMesh(ob, o.front, false), o.f);
  ctx.add('chassis', capMesh(ob, o.back, true), o.f);
  const trim = o.trim ?? F.texturedBlack;
  // Lid seam: a dark groove-and-band wrapped round the case.
  const k = o.seam ?? 0.28;
  const ring: P3[] = [];
  const nz = 14;
  const at = (z: number, side2: number) => {
    const t = ob.top(z), b = ob.bottom(z);
    return [xc + side2 * (ob.half(z) + 0.001), t - (t - b) * k, z] as P3;
  };
  for (let i = 0; i <= nz; i++) ring.push(at(o.front + 0.02 + ((o.back - o.front - 0.04) * i) / nz, 1));
  const seamProf = smooth2([[0.004, 0], [0, 0.004], [-0.003, 0], [0, -0.004]], 2, true);
  ctx.add('chassis', sweep(ring, seamProf, { capStart: true, capEnd: true }), trim);
  if (side === 0) {
    const ring2: P3[] = ring.map((p) => [-p[0], p[1], p[2]] as P3);
    ctx.add('chassis', sweep(ring2, seamProf, { capStart: true, capEnd: true }), trim);
  }
  const n = o.latches ?? 2;
  for (let i = 0; i < n; i++) {
    const z = o.front + (o.back - o.front) * ((i + 1) / (n + 1));
    const p = at(z, side === 0 ? 1 : side);
    ctx.add('chassis', roundBox(0.012, 0.045, 0.05, 0.005), trim, T(p[0] + (side === 0 ? 1 : side) * 0.004, p[1], p[2]));
  }
}

// ───────────────────────────── misc ─────────────────────────────

/** Re-export so blueprints need only one import. */
export { lamp, tint, mul, T };
export type { LampOpts };

// ───────────────────────────── livery helpers ─────────────────────────────

/** Annular sector (arc band) polygon around (cz, cy) between radii r0 and r1 and angles a0..a1 (radians from +Z, CCW towards +Y). */
export function arcBand(cz: number, cy: number, r0: number, r1: number, a0: number, a1: number, n = 16): P2[] {
  const out: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cz + Math.cos(a) * r1, cy + Math.sin(a) * r1]);
  }
  for (let i = n; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cz + Math.cos(a) * r0, cy + Math.sin(a) * r0]);
  }
  return out;
}
