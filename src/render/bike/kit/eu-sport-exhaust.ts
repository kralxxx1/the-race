import * as THREE from 'three';
import { T, type KitContext } from '../context';
import { lathe, rod, roundBox, sweep, circle, type P2, type P3 } from '../mesh';
import { F, hard, vary, type Finish } from '../sink';

/**
 * Exhaust helpers for the European sport-bike blueprints (Panigale V2, RSV4, RS 660,
 * F3 RR, M 1000 RR) whose silencers the generic route table cannot express: the
 * Panigale V2's twin-barrel under-engine silencer and the F3's three stacked "organ
 * pipe" outlets. Pure additions — nothing in the shared kit depends on this module.
 */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const P = (v: THREE.Vector3): P3 => [v.x, v.y, v.z];

/**
 * Exhaust ports of a V / L engine, computed exactly as kit/engine.ts (buildVee) places
 * them: one per cylinder, `front` for the front bank (port under the head, facing down
 * and forward) and the rear bank (port facing rearwards).
 */
export function veePorts(ctx: KitContext): { pos: P3; dir: P3; front: boolean }[] {
  const e = ctx.bp.engine;
  const gamma = e.layout === 'V2_45' ? 45 : e.layout === 'V2_60' ? 60 : e.layout === 'V2_75' ? 75 : e.layout === 'V4A' ? 65 : 90;
  const k = Math.cbrt(Math.max(120, e.cc) / 1000);
  const phiF = (e.tiltDeg * Math.PI) / 180;
  const phiR = phiF + (gamma * Math.PI) / 180;
  const four = e.layout === 'V4' || e.layout === 'V4A';
  const perBank = four ? 2 : 1;
  const bore = four ? 0.081 * k : 0.1 * k;
  const len = four ? 0.2 * k : 0.25 * k;
  const c = V(...e.crank);
  const out: { pos: P3; dir: P3; front: boolean }[] = [];
  for (const [phi, shift] of [[phiF, four ? -0.02 : 0], [phiR, four ? 0.02 : 0]] as const) {
    const front = phi === phiF;
    const d = V(0, Math.sin(phi), -Math.cos(phi));
    for (let j = 0; j < perBank; j++) {
      const x = perBank === 1 ? (front ? -0.02 : 0.02) : (j - 0.5) * (bore + 0.022) + shift;
      const top = c.clone().add(V(x, 0, 0)).addScaledVector(d, 0.08 * k + len);
      const r = bore / 2 + 0.012;
      let pd: THREE.Vector3;
      if (front) {
        pd = V(0, -Math.cos(phi), -Math.sin(phi));
        const pp = top.clone().addScaledVector(pd, r + 0.01);
        pd.addScaledVector(d, 0.2).normalize();
        out.push({ pos: P(pp), dir: P(pd), front });
      } else {
        pd = V(0, Math.cos(phi), Math.sin(phi));
        if (pd.z < 0) pd.negate();
        out.push({ pos: P(top.clone().addScaledVector(pd, r + 0.01)), dir: P(pd), front });
      }
    }
  }
  return out;
}

/** Straight round barrel between a and b (closed), optional taper; returns its axis. */
function barrel(ctx: KitContext, a: P3, b: P3, r0: number, r1: number, f: Finish, flat = 1): void {
  const A = V(...a), B = V(...b);
  const n = ctx.seg(8, 3);
  const path: P3[] = [];
  const scale: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    path.push(P(A.clone().lerp(B, t)));
    let r = r0 + (r1 - r0) * t;
    if (t < 0.08) r *= 0.86 + (t / 0.08) * 0.14;
    scale.push(r);
  }
  const prof: P2[] = circle(1, ctx.seg(24, 10), flat);
  ctx.add('chassis', sweep(path, prof, { scale, capStart: true, capEnd: true, up: [0, 1, 0] }), f);
}

/** Outlet tip at b on axis a→b: a short steel sleeve with a sooty bore and a machined lip. */
export function outletTip(ctx: KitContext, a: P3, b: P3, r: number, len = 0.03, f: Finish = vary(F.steel, { rough: 0.3 })): void {
  const A = V(...a), B = V(...b);
  const d = B.clone().sub(A).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d);
  const o0 = B.clone().addScaledVector(d, -len);
  const m = new THREE.Matrix4().compose(o0, q, V(1, 1, 1));
  const seg = ctx.seg(22, 10);
  ctx.add('chassis', lathe([[r - 0.0025, 0], [r, 0], [r, len], [r + 0.0015, len + 0.001], [r - 0.0025, len + 0.002]], { segs: seg, axis: 'y' }), f, m);
  ctx.add('chassis', lathe([[r - 0.003, len], [r - 0.003, len * 0.2], [0, 0]], { segs: seg, axis: 'y' }), hard('#0a0a0a', 0, 0.92), m);
}

/**
 * Panigale V2 (959-derived) twin-barrel silencer: two short, slightly flattened
 * cylinders stacked one above the other on the right, under a satin-black heat shield,
 * fed by the pre-silencer box under the engine.
 */
export function twinBarrelSilencer(ctx: KitContext, o: { a: P3; b: P3; r: number; gap: number; finish: Finish; shield: Finish }): void {
  const A = V(...o.a), B = V(...o.b);
  const d = B.clone().sub(A).normalize();
  const up = V(0, 1, 0).sub(d.clone().multiplyScalar(d.y)).normalize();
  const lo = (v: THREE.Vector3, k: number) => P(v.clone().addScaledVector(up, k));
  for (const k of [-o.gap / 2, o.gap / 2]) {
    barrel(ctx, lo(A, k), lo(B, k), o.r, o.r * 0.97, o.finish, 0.92);
    // Contrasting end cap and the outlet sleeve.
    const capA = lo(B.clone().addScaledVector(d, -0.012), k);
    const capB = lo(B.clone().addScaledVector(d, 0.004), k);
    ctx.add('chassis', rod(capA, capB, o.r * 0.99, o.r * 0.93, ctx.seg(22, 10)), F.texturedBlack);
    outletTip(ctx, lo(A, k), lo(B.clone().addScaledVector(d, 0.02), k), o.r * 0.45, 0.032);
  }
  // Heat shield: a curved satin plate over the upper barrel, with a slot pattern.
  const shieldLen = A.distanceTo(B) * 0.78;
  const c0 = A.clone().lerp(B, 0.42).addScaledVector(up, o.gap / 2 + o.r * 0.55);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), d);
  const m = new THREE.Matrix4().compose(c0, q, V(1, 1, 1));
  const arc: P2[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = -0.2 + (i / 8) * (Math.PI * 0.75);
    arc.push([Math.cos(t) * o.r * 1.18, Math.sin(t) * o.r * 0.9]);
  }
  const prof: P2[] = [...arc, ...arc.slice().reverse().map(([x, y]) => [x * 0.93, y * 0.9] as P2)];
  const path: P3[] = [[0, 0, -shieldLen / 2], [0, 0, shieldLen / 2]];
  ctx.add('chassis', sweep(path, prof, { capStart: true, capEnd: true }).transform(m), o.shield);
}

/**
 * MV Agusta F3 "organ pipe" silencer: a compact body under the right footpeg feeding
 * three parallel outlet tubes stacked vertically and fanned slightly outwards, each
 * cut obliquely and staggered so the three tips form the signature diagonal.
 */
export function organPipes(ctx: KitContext, o: { body0: P3; body1: P3; bodyR: number; tips: readonly P3[]; dir: P3; pipeR: number; len: number; finish: Finish; body: Finish; shield?: Finish }): void {
  barrel(ctx, o.body0, o.body1, o.bodyR * 0.85, o.bodyR, o.body, 0.8);
  const d = V(...o.dir).normalize();
  const B1 = V(...o.body1);
  o.tips.forEach((tip, i) => {
    const T1 = V(...tip);
    const T0 = T1.clone().addScaledVector(d, -o.len);
    // Short bend from the body's end into each pipe.
    const from = B1.clone().add(V(0, (i - 1) * o.bodyR * 0.55, 0));
    const ctrl: P3[] = [P(from.clone().addScaledVector(d, -0.03)), P(from), P(T0.clone().addScaledVector(d, -0.04)), P(T0)];
    ctx.add('chassis', sweep(catmullPath(ctrl, ctx.seg(10, 4)), circle(o.pipeR, ctx.seg(18, 8)), {}), o.finish);
    barrel(ctx, P(T0), P(T1), o.pipeR, o.pipeR, o.finish);
    outletTip(ctx, P(T0), P(T1.clone().addScaledVector(d, 0.005)), o.pipeR * 0.78, 0.02, vary(F.steel, { rough: 0.22 }));
  });
  if (o.shield) {
    // Perforated-look guard over the inboard side of the three pipes.
    const mid = V(...o.tips[1]).addScaledVector(d, -o.len * 0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), d);
    ctx.add('chassis', roundBox(0.012, o.pipeR * 7.4, o.len * 0.7, 0.005, 2), o.shield, new THREE.Matrix4().compose(mid.add(V(-o.pipeR * 1.6, 0, 0)), q, V(1, 1, 1)));
  }
}

function catmullPath(ctrl: readonly P3[], n: number): P3[] {
  const out: P3[] = [];
  const pts = ctrl.map((p) => V(...p));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  for (let i = 0; i <= n * (pts.length - 1); i++) out.push(P(curve.getPoint(i / (n * (pts.length - 1)))));
  return out;
}

/** Rectangular-section silencer body (RSV4 / M 1000 RR style) between a and b. */
export function boxCan(ctx: KitContext, o: { a: P3; b: P3; w: number; h: number; r: number; taper?: number; finish: Finish; at?: THREE.Matrix4 }): void {
  const A = V(...o.a), B = V(...o.b);
  const len = A.distanceTo(B);
  const d = B.clone().sub(A).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d);
  const m = new THREE.Matrix4().compose(A.clone().lerp(B, 0.5), q, V(1, 1, 1));
  ctx.add('chassis', roundBox(o.w, len, o.h, o.r, ctx.micro ? 3 : 2), o.finish, m);
}

/** Pre-silencer / catalyst box under the engine (rounded, heat-tinted titanium-grey). */
export function underBox(ctx: KitContext, at: P3, size: [number, number, number], f?: Finish): void {
  ctx.add('chassis', roundBox(size[0], size[1], size[2], Math.min(size[1] * 0.45, 0.045), ctx.micro ? 3 : 2), f ?? vary(F.titanium, { color: new THREE.Color('#8f8a80').toArray() as [number, number, number], rough: 0.4 }), T(...at));
  ctx.add('chassis', roundBox(size[0] + 0.01, 0.018, size[2] - 0.02, 0.007, 2), F.texturedBlack, T(at[0], at[1] + size[1] / 2 + 0.006, at[2]));
}
