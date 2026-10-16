import * as THREE from 'three';
import type { KitContext } from '../context';
import { bodyQ, shell } from '../kit/body';
import { lamp, ledStrip, type LampKind, type LampOpts } from '../kit/lights';
import { outlineLoft, type OutlineBody } from '../kit/shape';
import { MeshData, extrude, lathe, rod, roundBox, smooth2, sweep, type P2, type P3 } from '../mesh';
import { F, hard, type Finish, type GroupName } from '../sink';
import { cut, type Field } from '../surface';

/**
 * Shared helpers for the European naked-bike blueprints of family "eu-naked-1"
 * (Ducati Streetfighter V4 S and Monster, KTM 1290 Super Duke R and 390 Duke, Aprilia
 * Tuono V4 Factory). Pure additions on top of the kit: nothing else depends on them.
 *
 * Naked bikes carry their headlight, number board and indicators on the fork, so much of
 * the face is authored in the steering-local frame (origin at the top of the fork tubes on
 * the steering axis, +Y up the axis, −Z forward, fork tubes at z = −offset) and added to
 * the `steer` group, which turns with the bars.
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

export interface PartOpts {
  /** Folded-edge depth of the shell (thickness read at the cut edges). */
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
export function loftPart(ctx: KitContext, ob: OutlineBody, f: Finish, o: PartOpts = {}): MeshData {
  let m = outlineLoft(ob, { ...bodyQ(ctx, o.q ?? 1), creases: o.creases, capFront: o.capFront, capBack: o.capBack });
  if (o.region) m = cut(m, o.region);
  if (o.steer) m.transform(ctx.steerM);
  shell(ctx, o.group ?? (o.steer ? 'steer' : 'chassis'), m, f, o.depth ?? 0.008);
  return m;
}

/**
 * A pair of side panels (radiator shrouds, side covers): the outline body describes the
 * right-hand panel only (sections from its top edge down its outer face); it is mirrored
 * to the left.
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

/**
 * A lamp authored in the steering-local frame: outline in local XY as seen from the front
 * (x = bike right), lens facing local −Z (forwards along the fork-parallel face).
 */
export function steerLamp(ctx: KitContext, outline: readonly P2[], at: P3, o: LampOpts, tiltX = 0, rollZ = 0): void {
  const m = new THREE.Matrix4().makeTranslation(at[0], at[1], at[2]);
  m.multiply(new THREE.Matrix4().makeRotationY(Math.PI));
  if (tiltX) m.multiply(new THREE.Matrix4().makeRotationX(tiltX));
  if (rollZ) m.multiply(new THREE.Matrix4().makeRotationZ(rollZ));
  // Rotating by π about Y mirrors local x: flip the outline so it reads as authored from the front.
  lamp(ctx, 'steer', outline.map(([x, y]) => [-x, y] as P2).reverse(), steerMat(ctx, m), o);
}

/** LED light guide authored in the steering-local frame, its face pointing along local `up`. */
export function steerStrip(ctx: KitContext, path: readonly P3[], width: number, thick: number, kind: LampKind = 'drl', up: P3 = [0, 0, -1]): void {
  ledStrip(ctx, 'steer', path.map((p) => ctx.fromSteer(p)), width, thick, kind, steerDir(ctx, up));
}

/** Flat brackets from both fork tubes (steering-local heights `ys`) forward to a fork-mounted part. */
export function forkBrackets(ctx: KitContext, ys: readonly number[], toZ: number, toHalf: number, f: Finish = F.texturedBlack): void {
  const half = ctx.bp.fork.spacing / 2;
  const z0 = -ctx.hp.offset;
  const outer = ctx.bp.fork.type === 'usd' ? ctx.bp.fork.stanchion / 2 + 0.0085 : ctx.bp.fork.stanchion / 2;
  for (const s of [-1, 1]) {
    for (const y of ys) {
      const a = ctx.fromSteer([s * (half - 0.004), y, z0 - outer]);
      const b = ctx.fromSteer([s * toHalf, y - 0.004, toZ]);
      ctx.add('steer', rod(a, b, 0.0075, 0.0065, ctx.seg(10, 6)), f);
      ctx.add('steer', roundBox(0.016, 0.018, 0.012, 0.004), f, steerMat(ctx, new THREE.Matrix4().makeTranslation(s * half, y, z0 - outer - 0.004)));
    }
  }
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

/** Flat side cover (zy outline) at |x|, mirrored. */
export function sideCovers(ctx: KitContext, outline: readonly P2[], x: number, f: Finish = F.texturedBlack, thick = 0.012): void {
  for (const s of [-1, 1]) ctx.add('chassis', extrude(smooth2(outline, 3, true), thick, { plane: 'zy', bevel: 0.004, center: s * x, curveSegs: 1 }), f);
}

/**
 * Thin aerofoil blade along x (span) at a side-view chord outline, centred at |x| = xc.
 * Mirrored to the left side. Used for winglets and louvres.
 */
export function blade(ctx: KitContext, chord: readonly P2[], xc: number, span: number, f: Finish, group: GroupName = 'chassis'): void {
  for (const s of [-1, 1]) ctx.add(group, extrude(smooth2(chord, 3, true), span, { plane: 'zy', bevel: 0.0015, center: s * xc }), f);
}

/**
 * Biplane winglet (Ducati style): two aerofoil blades joined by an outer end plate,
 * standing off the shroud at |x| = x0 → x1. Side-view chords given for the right side.
 */
export function biplaneWing(ctx: KitContext, upper: readonly P2[], lower: readonly P2[], x0: number, x1: number, f: Finish): void {
  const span = x1 - x0;
  blade(ctx, upper, x0 + span / 2, span, f);
  blade(ctx, lower, x0 + span / 2, span, f);
  // End plate: hull of both chords.
  const all = [...upper, ...lower];
  let z0 = Infinity, z1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [z, y] of all) {
    z0 = Math.min(z0, z);
    z1 = Math.max(z1, z);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  const plate = smooth2([[z0 + 0.01, y1 + 0.004], [z1 - 0.004, y1 - 0.004], [z1, y0 + 0.008], [z0 + 0.03, y0 - 0.004], [z0, (y0 + y1) / 2]], 3, true);
  for (const s of [-1, 1]) ctx.add('chassis', extrude(plate, 0.004, { plane: 'zy', bevel: 0.0012, center: s * (x1 + 0.001) }), f);
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

/** Tube along bike-space control points (frame braces, brackets, hoses). */
export function tubeAlong(ctx: KitContext, group: GroupName, pts: readonly P3[], r: number, f: Finish): void {
  ctx.add(group, sweep(pts.length > 2 ? smoothPath(pts, ctx.seg(6, 3)) : pts, roundSection(r, ctx.seg(12, 6)), { capStart: true, capEnd: true }), f);
}

function roundSection(r: number, n: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out;
}

function smoothPath(pts: readonly P3[], per: number): P3[] {
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

export { lamp, type LampOpts };

/**
 * Exhaust ports of a V / L engine, computed exactly as kit/engine.ts (`buildVee`) places them,
 * for blueprints that route their own headers (`exhaust.route = 'none'`). Front bank first.
 */
export function veePorts(ctx: KitContext): { pos: P3; dir: P3; front: boolean }[] {
  const e = ctx.bp.engine;
  const k = Math.cbrt(Math.max(120, e.cc) / 1000);
  const gamma = e.layout === 'V2_45' ? 45 : e.layout === 'V2_60' ? 60 : e.layout === 'V2_75' ? 75 : e.layout === 'V4A' ? 65 : 90;
  const phiF = (e.tiltDeg * Math.PI) / 180;
  const phiR = phiF + (gamma * Math.PI) / 180;
  const four = e.layout === 'V4' || e.layout === 'V4A';
  const perBank = four ? 2 : 1;
  const bore = four ? 0.081 * k : 0.1 * k;
  const len = four ? 0.2 * k : 0.25 * k;
  const r = bore / 2 + 0.012;
  const c = new THREE.Vector3(...e.crank);
  const out: { pos: P3; dir: P3; front: boolean }[] = [];
  for (const [phi, shift] of [[phiF, four ? -0.02 : 0], [phiR, four ? 0.02 : 0]] as const) {
    const d = new THREE.Vector3(0, Math.sin(phi), -Math.cos(phi));
    const front = phi === phiF;
    for (let j = 0; j < perBank; j++) {
      const x = perBank === 1 ? (front ? -0.02 : 0.02) : (j - 0.5) * (bore + 0.022) + shift;
      const top = c.clone().add(new THREE.Vector3(x, 0, 0)).addScaledVector(d, 0.08 * k + len);
      let pd = new THREE.Vector3(0, -Math.cos(phi), -Math.sin(phi));
      if (!front) {
        pd.negate();
        if (pd.z < 0) pd.negate();
      }
      const pp = top.clone().addScaledVector(pd, r + 0.01);
      if (front) pd = pd.addScaledVector(d, 0.2).normalize();
      out.push({ pos: [pp.x, pp.y, pp.z], dir: [pd.x, pd.y, pd.z], front });
    }
  }
  return out;
}

/** Elliptical (rx × ry) silencer body swept from a to b, capped, with an optional taper. */
export function ovalCan(ctx: KitContext, a: P3, b: P3, rx: number, ry: number, f: Finish, taper = 1): MeshData {
  const n = ctx.seg(8, 3);
  const path: P3[] = [];
  const scale: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    path.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    scale.push((1 + (taper - 1) * t) * (t < 0.08 ? 0.86 + (t / 0.08) * 0.14 : t > 0.94 ? 1 - (t - 0.94) * 1.6 : 1));
  }
  const m = sweep(path, ellipse(rx, ry, ctx.seg(28, 12)), { up: [0, 1, 0], scale, capStart: true, capEnd: true });
  ctx.add('chassis', m, f);
  return m;
}

function ellipse(rx: number, ry: number, n: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    out.push([Math.cos(t) * rx, Math.sin(t) * ry]);
  }
  return out;
}

/** Short round tail pipe with a sooty inside between a and b. */
export function tailPipe(ctx: KitContext, a: P3, b: P3, r: number, f: Finish = F.steel): void {
  ctx.add('chassis', rod(a, b, r, r, ctx.seg(20, 8)), f);
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
  const m = new THREE.Matrix4().compose(new THREE.Vector3(b[0] + d.x * 0.0005, b[1] + d.y * 0.0005, b[2] + d.z * 0.0005), q, new THREE.Vector3(1, 1, 1));
  ctx.add('chassis', lathe([[0, -0.002], [r * 0.82, -0.002], [r * 0.82, 0.0005], [0, 0.0005]], { segs: ctx.seg(20, 8), axis: 'y' }), hard('#090909', 0, 0.9), m);
}
