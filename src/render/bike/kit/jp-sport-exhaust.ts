import * as THREE from 'three';
import { T, type KitContext } from '../context';
import { catmull, circle, lathe, rod, roundBox, sweep, type MeshData, type P2, type P3 } from '../mesh';
import { F, hard, Micro, vary, type Finish } from '../sink';
import { cut } from '../surface';

/**
 * Exhaust systems of the Japanese sport bikes that the generic route table cannot
 * express: the CBR650R's exposed four-header "waterfall", the GSX-R1000's triangular
 * side silencer and the Hayabusa's twin cans. Blueprints using these set
 * `exhaust.route = 'none'` and call `jpExhaust` from their body builder.
 */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const P = (v: THREE.Vector3): P3 => [v.x, v.y, v.z];

export type Heat = 'titanium' | 'steel' | 'chrome' | 'black';

function heatColour(kind: Heat, t: number): [number, number, number] {
  const stops: Record<Heat, [number, string][]> = {
    titanium: [[0, '#c9a65e'], [0.14, '#b48a4c'], [0.28, '#8c6e70'], [0.4, '#5f6d8c'], [0.54, '#878e98'], [0.75, '#a39e95'], [1, '#a29d93']],
    steel: [[0, '#b39a6a'], [0.15, '#8f7356'], [0.3, '#5d5a6e'], [0.45, '#62666c'], [1, '#6a6e74']],
    chrome: [[0, '#d8c8a0'], [0.12, '#c8c0d8'], [0.3, '#f2f4f7'], [1, '#f2f4f7']],
    black: [[0, '#2a2622'], [1, '#18191b']],
  };
  const s = stops[kind];
  let i = 0;
  while (i < s.length - 2 && s[i + 1][0] < t) i++;
  const [t0, c0] = s[i];
  const [t1, c1] = s[i + 1];
  const k = Math.max(0, Math.min(1, (t - t0) / Math.max(1e-6, t1 - t0)));
  const a = new THREE.Color(c0);
  a.lerp(new THREE.Color(c1), k);
  return [a.r, a.g, a.b];
}

function pipeFinish(kind: Heat): Finish {
  if (kind === 'chrome') return hard('#ffffff', 1, 0.06);
  if (kind === 'black') return hard('#ffffff', 0.3, 0.6, 0, Micro.grain);
  return hard('#ffffff', 1, kind === 'titanium' ? 0.3 : 0.34, 0, Micro.brushed);
}

/** Pipe through control points with an arc-length heat-tint gradient from t0 to t1. */
export function heatPipe(ctx: KitContext, ctrl: readonly P3[], r: number, heat: Heat, t0 = 0, t1 = 1): void {
  const path = catmull(ctrl, ctx.seg(10, 4)).map((q) => [q[0], q[1], q[2]] as P3);
  const m = sweep(path, circle(r, ctx.seg(16, 8)), {});
  let total = 0;
  for (let i = 1; i < path.length; i++) total += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1], path[i][2] - path[i - 1][2]);
  m.tintBy((_x, _y, _z, i) => heatColour(heat, t0 + (t1 - t0) * (m.uv[i * 2 + 1] / Math.max(1e-6, total))));
  ctx.add('chassis', m, pipeFinish(heat));
}

/** Exhaust ports of an inline engine, computed exactly as kit/engine.ts places them. */
export function inlinePorts(ctx: KitContext): { pos: P3; dir: P3 }[] {
  const e = ctx.bp.engine;
  const n = e.layout === 'SINGLE' ? 1 : e.layout === 'I3' ? 3 : e.layout === 'I6' ? 6 : e.layout.startsWith('P2') ? 2 : 4;
  const k = Math.cbrt(Math.max(120, e.cc) / 1000);
  const t = (e.tiltDeg * Math.PI) / 180;
  const cyl = V(0, Math.cos(t), -Math.sin(t));
  const fwd = V(0, -Math.sin(t), -Math.cos(t));
  const pitch = (n === 1 ? 0.1 : n === 2 ? 0.095 : 0.078) * k + (n === 6 ? 0.0 : 0.006);
  const c = V(...e.crank);
  const pp = c.clone().addScaledVector(cyl, 0.33 * k).addScaledVector(fwd, 0.1 * k);
  const d = fwd.clone().multiplyScalar(0.85).addScaledVector(cyl, -0.45).normalize();
  const out: { pos: P3; dir: P3 }[] = [];
  for (let i = 0; i < n; i++) out.push({ pos: [(i - (n - 1) / 2) * pitch, pp.y, pp.z], dir: P(d) });
  return out;
}

export type CanShape = 'round' | 'tri' | 'cone' | 'oval';

export interface CanSpec {
  /** Inlet / outlet centres (bike space). */
  a: P3;
  b: P3;
  shape: CanShape;
  /** Radius at the inlet and at the outlet end. */
  r0: number;
  r1: number;
  finish: Finish;
  /** End cap finish (carbon, black, chrome…). */
  cap: Finish;
  /** Oblique cut of the end (0 = square, 1 ≈ 45°) — the cap follows it. */
  slash?: number;
  /** Roll of the profile around the can axis (radians). */
  roll?: number;
  /** Outlet pipe radius (default 0.4 r1). */
  outletR?: number;
}

function canProfile(shape: CanShape, r: number, n: number, roll: number): P2[] {
  const pts: P2[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    let rr = r;
    let ry = r;
    if (shape === 'tri') {
      // Rounded triangle, one corner pointing down/out.
      rr = r * (0.86 + 0.14 * Math.cos(3 * (t + roll)));
      ry = rr;
    } else if (shape === 'oval') ry = r * 0.78;
    pts.push([Math.cos(t) * rr, Math.sin(t) * ry]);
  }
  return pts;
}

/** A silencer between a and b with a tapered body, end cap and outlet. */
export function can(ctx: KitContext, c: CanSpec): void {
  const A = V(...c.a), B = V(...c.b);
  const d = B.clone().sub(A).normalize();
  const n = ctx.seg(14, 6);
  const path: P3[] = [];
  for (let i = 0; i <= n; i++) path.push(P(A.clone().lerp(B, i / n)));
  const radial = ctx.seg(30, 12);
  const prof = canProfile(c.shape, 1, radial, c.roll ?? 0);
  const scale: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    let r = c.r0 + (c.r1 - c.r0) * (c.shape === 'cone' ? Math.pow(t, 0.8) : t);
    if (t < 0.06) r *= 0.82 + (t / 0.06) * 0.18;
    scale.push(r);
  }
  let body: MeshData = sweep(path, prof, { scale, capStart: true, capEnd: true, up: [0, 1, 0] });
  const slash = c.slash ?? 0;
  const nrm = d.clone().add(V(0, slash, 0)).normalize();
  if (slash > 0) {
    const pc = B.clone().addScaledVector(d, -c.r1 * slash * 0.9);
    body = cut(body, (x, y, z) => -((x - pc.x) * nrm.x + (y - pc.y) * nrm.y + (z - pc.z) * nrm.z));
  }
  ctx.add('chassis', body, c.finish);
  // End cap: a short dished plug following the (possibly oblique) end plane.
  const capC = slash > 0 ? B.clone().addScaledVector(d, -c.r1 * slash * 0.9) : B.clone().addScaledVector(d, -0.003);
  const capQ = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), nrm);
  const capK = c.shape === 'oval' ? 0.78 : 1;
  const cr = c.r1 * (c.shape === 'tri' ? 0.84 : 0.97) / Math.max(0.6, nrm.dot(d));
  const capM = new THREE.Matrix4().compose(capC, capQ, V(1, 1, capK));
  ctx.add('chassis', lathe([[0, -0.01], [cr * 0.98, -0.01], [cr, 0], [cr * 0.96, 0.008], [cr * 0.6, 0.014], [0, 0.016]], { segs: radial, axis: 'y' }), c.cap, capM);
  // Outlet pipe with a sooty inside.
  const or = c.outletR ?? c.r1 * 0.4;
  const o0 = capC.clone().addScaledVector(d, -0.02);
  const o1 = capC.clone().addScaledVector(d, 0.03);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d);
  const om = new THREE.Matrix4().compose(o0, q, V(1, o1.distanceTo(o0), 1));
  ctx.add('chassis', lathe([[or - 0.002, 0], [or, 0], [or, 1], [or - 0.002, 1]], { segs: ctx.seg(20, 8), axis: 'y' }), vary(F.steel, { rough: 0.35 }), om);
  ctx.add('chassis', lathe([[or - 0.0025, 1], [or - 0.0025, 0], [0, 0.4]], { segs: ctx.seg(20, 8), axis: 'y' }), hard('#0b0b0b', 0, 0.9), om);
  // Inlet clamp band.
  const band = A.clone().lerp(B, 0.1);
  const r = c.r0 + (c.r1 - c.r0) * 0.1;
  ctx.add('chassis', lathe([[r * 1.0, 0], [r * 1.05, 0.004], [r * 1.05, 0.018], [r * 1.0, 0.022]], { segs: radial, axis: 'y' }), F.polishedAlu, new THREE.Matrix4().compose(band, q, V(1, 1, 1)));
}

export interface HeaderPlan {
  /** Control points after the port (port and a short straight are prepended), per port index. */
  route: (i: number, port: { pos: P3; dir: P3 }, rank: number) => P3[];
  r: number;
  heat: Heat;
  /** Fraction of the heat gradient reached at the end of the headers. */
  tEnd?: number;
}

/** Headers from every port along authored routes (rank = order from the rightmost cylinder). */
export function headers(ctx: KitContext, plan: HeaderPlan): void {
  const ports = inlinePorts(ctx);
  const order = ports.map((p, i) => ({ p, i })).sort((a, b) => b.p.pos[0] - a.p.pos[0]);
  order.forEach(({ p, i }, rank) => {
    const a = V(...p.pos);
    const dir = V(...p.dir);
    const pts: P3[] = [P(a), P(a.clone().addScaledVector(dir, 0.045)), ...plan.route(i, p, rank)];
    heatPipe(ctx, pts, plan.r, plan.heat, 0, plan.tEnd ?? 0.7);
    if (ctx.micro) {
      const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir);
      ctx.add('chassis', roundBox(plan.r * 3.4, 0.008, plan.r * 2.4, 0.003, 1), F.steel, new THREE.Matrix4().compose(a.clone().addScaledVector(dir, 0.006), q, V(1, 1, 1)));
    }
  });
}

/** Collector / pre-chamber drum (lathe along z) with a heat tint. */
export function collector(ctx: KitContext, at: P3, r: number, len: number, heat: Heat, t = 0.6): void {
  ctx.add('chassis', lathe([[0, -len / 2], [r * 0.8, -len / 2], [r, -len / 2 + 0.03], [r, len / 2 - 0.03], [r * 0.7, len / 2], [0, len / 2]], { segs: ctx.seg(20, 8), axis: 'z' }), vary(pipeFinish(heat), { color: heatColour(heat, t) }), T(...at));
}

/** Hanger strap from a can to the rear-set / subframe. */
export function canHanger(ctx: KitContext, from: P3, to: P3, f: Finish = F.castAlu): void {
  ctx.add('chassis', rod(from, to, 0.007, 0.007, 8), f);
}
