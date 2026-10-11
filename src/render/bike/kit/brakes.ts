import * as THREE from 'three';
import { RX, RZ, S, T, mul, type KitContext } from '../context';
import { MeshData, bolt, extrude, lathe, rod, roundBox, tube, type P2, type P3 } from '../mesh';
import { F, hard, Micro, type Finish } from '../sink';
import type { BrakeSpec } from '../types';
import type { GroupName } from '../sink';

/**
 * Brake caliper in caliper-local space: X = wheel axis (0 at the disc mid-plane,
 * +X = outboard), Y = radial (disc centre at the origin), Z = tangential.
 * Radial monoblocs get the deep two-piece-free body, piston bulges, radial
 * mounting lugs, pad pins and the brand lettering.
 */
export function caliperMeshes(ctx: KitContext, b: BrakeSpec, front: boolean): { body: MeshData; detail: MeshData; steel: MeshData; textAt: { y: number; z: number; x: number; w: number } } {
  const Rd = b.discDia / 2;
  const band = front ? 0.034 : 0.026;
  const radial = b.caliper === 'radialMono4' || b.caliper === 'radial4';
  const big = b.caliper === 'radialMono4' || b.caliper === 'radial4' || b.caliper === 'axial2';
  const span = (big ? (front ? 0.058 : 0.04) : 0.035) / Rd; // half angle
  const rIn = Rd - band - 0.01;
  const rOut = Rd + 0.006;
  const halfT = front ? 0.0185 : 0.016;
  const n = ctx.seg(12, 5);
  // Side outline (z, y) of one caliper half: annular sector with rounded ends.
  const outline: P2[] = [];
  const rm = (rIn + rOut) / 2;
  const endR = (rOut - rIn) / 2;
  const cap = (a0: number, sgn: number) => {
    const rh: P2 = [Math.sin(a0), Math.cos(a0)];
    const th: P2 = [Math.cos(a0), -Math.sin(a0)];
    const c: P2 = [rh[0] * rm, rh[1] * rm];
    for (let i = 1; i < n; i++) {
      const t = (i / n) * Math.PI;
      const k = sgn * Math.cos(t), j = sgn * Math.sin(t);
      outline.push([c[0] + endR * (rh[0] * k + th[0] * j), c[1] + endR * (rh[1] * k + th[1] * j)]);
    }
  };
  for (let i = 0; i <= n; i++) {
    const a = -span + (2 * span * i) / n;
    outline.push([Math.sin(a) * rOut, Math.cos(a) * rOut]);
  }
  cap(span, 1);
  for (let i = n; i >= 0; i--) {
    const a = -span + (2 * span * i) / n;
    outline.push([Math.sin(a) * rIn, Math.cos(a) * rIn]);
  }
  cap(-span, -1);
  const body = new MeshData();
  const halfDepth = big ? 0.02 : 0.016;
  // Outer half
  body.append(extrude(outline, halfDepth, { plane: 'zy', bevel: 0.004, bevelSegs: ctx.micro ? 3 : 1, center: halfT + halfDepth / 2, curveSegs: 2 }));
  // Inner half
  body.append(extrude(outline, halfDepth * 0.85, { plane: 'zy', bevel: 0.0035, bevelSegs: ctx.micro ? 3 : 1, center: -halfT - halfDepth * 0.42, curveSegs: 2 }));
  // Bridge over the disc edge
  const bridge: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = -span * 0.82 + (1.64 * span * i) / n;
    bridge.push([Math.sin(a) * (rOut + 0.012), Math.cos(a) * (rOut + 0.012)]);
  }
  for (let i = n; i >= 0; i--) {
    const a = -span * 0.82 + (1.64 * span * i) / n;
    bridge.push([Math.sin(a) * (Rd - 0.004), Math.cos(a) * (Rd - 0.004)]);
  }
  body.append(extrude(bridge, halfT * 2 + halfDepth * 1.6, { plane: 'zy', bevel: 0.004, bevelSegs: ctx.micro ? 2 : 1, curveSegs: 1 }));
  const detail = new MeshData();
  const steel = new MeshData();
  // Piston bulges on the outer face (2 per side on 4-pots, staggered sizes).
  const pistons = b.caliper === 'axial1' ? 1 : 2;
  const rp = (Rd - band / 2) * 0.995;
  for (let i = 0; i < pistons; i++) {
    const a = pistons === 1 ? 0 : (i === 0 ? -0.5 : 0.5) * span * 1.05;
    const pr = (big ? 0.0155 : 0.014) * (i === 0 ? 0.94 : 1.02);
    const bulge = lathe([[0, 0], [pr, 0], [pr * 0.96, 0.004], [pr * 0.75, 0.0065], [0, 0.0075]], { segs: ctx.seg(20, 10), axis: 'x' });
    body.append(bulge.translate(halfT + halfDepth - 0.001, Math.cos(a) * rp, Math.sin(a) * rp));
  }
  // Radial mounting lugs at both ends (bolts run parallel to the fork leg = local Y at the caliper ends).
  if (radial) {
    for (const s of [-1, 1]) {
      const a = s * span * 1.02;
      const lugC: P3 = [-halfT * 0.2, Math.cos(a) * (rOut + 0.004), Math.sin(a) * (rOut + 0.004) + s * 0.006];
      body.append(roundBox(0.022, 0.026, 0.02, 0.006, 2).transform(mul(T(...lugC), RX(a))));
      steel.append(bolt(0.0055, 0.008, true).transform(mul(T(lugC[0], lugC[1] + Math.cos(a) * 0.013, lugC[2] + Math.sin(a) * 0.013), RX(a))));
    }
  }
  if (ctx.micro) {
    // Pad pin with R-clip and the anti-rattle spring across the bridge.
    steel.append(rod([-halfT - halfDepth * 0.8, Rd + 0.012, 0], [halfT + halfDepth + 0.004, Rd + 0.012, 0], 0.0022, 0.0022, 8));
    steel.append(roundBox(halfT * 2 + 0.01, 0.002, 0.03, 0.0008, 1).transform(T(0, rOut + 0.0125, 0)));
    // Bleed nipple
    steel.append(rod([halfT + 0.004, rOut + 0.004, -Math.sin(span) * rOut * 0.6], [halfT + 0.012, rOut + 0.016, -Math.sin(span) * rOut * 0.6], 0.003, 0.0025, 8));
    detail.append(lathe([[0, 0], [0.0042, 0], [0.0042, 0.006], [0, 0.006]], { segs: 8, axis: 'y', sharp: true }).transform(T(halfT + 0.012, rOut + 0.016, -Math.sin(span) * rOut * 0.6)));
    // Banjo fitting
    steel.append(lathe([[0, 0], [0.008, 0], [0.008, 0.012], [0, 0.012]], { segs: 6, axis: 'x', sharp: true }).transform(T(halfT + halfDepth * 0.4, rOut + 0.006, Math.sin(span) * rOut * 0.7)));
  }
  return { body, detail, steel, textAt: { x: halfT + halfDepth + 0.0004, y: rp, z: 0, w: 2 * Math.sin(span) * rp * 0.9 } };
}

/**
 * Place a caliper on a disc. `group` is the non-rotating part it bolts to,
 * `axle` the disc axle (bike space), `x` the disc mid-plane offset, `angle`
 * the caliper position on the disc (radians from up, positive to the rear).
 */
export function placeCaliper(ctx: KitContext, group: GroupName, b: BrakeSpec, front: boolean, axle: P3, x: number, angle: number): P3 {
  const m = caliperMeshes(ctx, b, front);
  const mirror = x < 0;
  const base = mul(T(axle[0] + x, axle[1], axle[2]), RX(angle), mirror ? S(-1, 1, 1) : new THREE.Matrix4());
  const fin: Finish = hard(b.caliperColor, b.caliperColor.toLowerCase() === '#b3121b' || b.caliperColor.startsWith('#c') ? 0.25 : 0.45, 0.35, 0.9, Micro.cast);
  ctx.add(group, m.body, fin, base);
  if (m.steel.tcount) ctx.add(group, m.steel, F.steel, base);
  if (m.detail.tcount) ctx.add(group, m.detail, F.black, base);
  if (b.caliperText && ctx.q.micro) {
    const r = ctx.label(b.caliperText, { color: b.caliperTextColor ?? '#f2f2f2', italic: false, weight: '900', font: '"Arial Black", Arial, sans-serif' }, 64);
    // Text on the outer face, reading along the tangential direction.
    const p = new THREE.Vector3(m.textAt.x, m.textAt.y - 0.004, m.textAt.z).applyMatrix4(base);
    const nrm = new THREE.Vector3(mirror ? -1 : 1, 0, 0);
    // Upright text: "up" points away from the axle (radial).
    const up = new THREE.Vector3(0, Math.cos(angle), Math.sin(angle));
    const h = Math.min(0.016, m.textAt.w / Math.max(1, r.aspect));
    ctx.decal(group, r, h, [p.x + nrm.x * 0.0072, p.y, p.z], [nrm.x, nrm.y, nrm.z], [up.x, up.y, up.z]);
  }
  const port = new THREE.Vector3(0.02, (b.discDia / 2) + 0.012, 0.03).applyMatrix4(base);
  return [port.x, port.y, port.z];
}

/** Braided brake hose with crimped ends between two bike-space points. */
export function brakeLine(ctx: KitContext, group: GroupName, pts: readonly P3[], dark = false): void {
  if (pts.length < 2) return;
  const r = 0.0042;
  const m = tube(pts, r, ctx.micro ? 8 : 5, ctx.micro ? 10 : 5);
  ctx.add(group, m, dark ? F.hose : { ...F.steel, rough: 0.5, micro: Micro.knurl });
  if (ctx.micro) {
    for (const [a, bb] of [
      [pts[0], pts[1]],
      [pts[pts.length - 1], pts[pts.length - 2]],
    ] as const) {
      const d = new THREE.Vector3(bb[0] - a[0], bb[1] - a[1], bb[2] - a[2]).normalize().multiplyScalar(0.02);
      ctx.add(group, rod(a, [a[0] + d.x, a[1] + d.y, a[2] + d.z], 0.0055, 0.0055, 8), F.polishedAlu);
    }
  }
}

/** Radial / axial master cylinder with remote reservoir. Returns the hose port. */
export function masterCylinder(
  ctx: KitContext,
  group: GroupName,
  at: P3,
  bar: THREE.Vector3,
  fwd: THREE.Vector3,
  up: THREE.Vector3,
  radial: boolean,
  body: Finish,
  reservoir: boolean,
): P3 {
  const o = new THREE.Vector3(...at);
  const m = new THREE.Matrix4().makeBasis(bar, up, fwd.clone().negate());
  m.setPosition(o);
  const mc = new MeshData();
  if (radial) {
    // Cylinder runs forward, perpendicular to the bar.
    mc.append(rod([0, 0, 0], [0, 0, -0.07], 0.0135, 0.012, ctx.seg(18, 8)));
    mc.append(roundBox(0.03, 0.034, 0.03, 0.007).transform(T(0, 0, -0.008)));
  } else {
    mc.append(rod([-0.03, 0.005, -0.012], [0.03, 0.005, -0.012], 0.012, 0.012, ctx.seg(16, 8)));
    mc.append(roundBox(0.06, 0.03, 0.04, 0.008).transform(T(0, 0.012, -0.004)));
  }
  // Bar clamp
  mc.append(lathe([[0.016, -0.012], [0.019, -0.012], [0.019, 0.012], [0.016, 0.012]], { segs: ctx.seg(18, 8), axis: 'x', sharp: true }));
  ctx.add(group, mc, body, m);
  if (reservoir) {
    const res = new MeshData();
    res.append(lathe([[0, 0], [0.019, 0], [0.019, 0.045], [0.017, 0.05], [0, 0.05]], { segs: ctx.seg(20, 8), axis: 'y', sharp: [1, 2] }).transform(T(radial ? -0.004 : 0.01, 0.045, radial ? -0.04 : -0.01)));
    ctx.add(group, res, hard('#2a2a28', 0.0, 0.18, 1), m);
    ctx.add(group, lathe([[0, 0], [0.021, 0], [0.021, 0.012], [0.018, 0.016], [0, 0.016]], { segs: ctx.seg(20, 8), axis: 'y', sharp: true }).transform(T(radial ? -0.004 : 0.01, 0.095, radial ? -0.04 : -0.01)), body, m);
    // Stalk
    ctx.add(group, rod([0, 0.012, radial ? -0.03 : -0.01], [radial ? -0.004 : 0.01, 0.046, radial ? -0.04 : -0.01], 0.004, 0.004, 6), F.black, m);
  }
  const port = new THREE.Vector3(0, -0.012, radial ? -0.07 : -0.02).applyMatrix4(m);
  return [port.x, port.y, port.z];
}

/** Brake / clutch lever blade with adjuster. */
export function lever(ctx: KitContext, group: GroupName, pivot: P3, bar: THREE.Vector3, fwd: THREE.Vector3, up: THREE.Vector3, len: number, f: Finish): void {
  const m = new THREE.Matrix4().makeBasis(bar, up, fwd.clone().negate());
  m.setPosition(new THREE.Vector3(...pivot));
  const pts: P3[] = [];
  const n = ctx.seg(12, 5);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // Out along the bar, forward of the grip, gentle dog-leg and a slight curl at the tip.
    pts.push([t * len, -0.004 - Math.sin(t * Math.PI) * 0.006, -0.012 - 0.03 * Math.min(1, t * 4) + t * t * 0.012]);
  }
  const prof: P2[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    prof.push([Math.cos(a) * 0.0045, Math.sin(a) * 0.0095]);
  }
  const scale = pts.map((_, i) => 1 - (i / n) * 0.35);
  const sw = sweepFlat(pts, prof, scale);
  ctx.add(group, sw, f, m);
  // Tip ball + pivot block + adjuster wheel
  const tip = pts[pts.length - 1];
  ctx.add(group, lathe([[0, -0.006], [0.006, -0.004], [0.0065, 0], [0.006, 0.004], [0, 0.006]], { segs: 10, axis: 'x' }).transform(T(tip[0], tip[1], tip[2])), f, m);
  ctx.add(group, roundBox(0.02, 0.018, 0.026, 0.004).transform(T(0.004, -0.004, -0.018)), f, m);
  if (ctx.micro) {
    const adj = lathe([[0, 0], [0.0085, 0], [0.0085, 0.009], [0, 0.009]], { segs: 14, axis: 'y', sharp: true });
    ctx.add(group, adj.transform(T(-0.004, 0.004, -0.03)), { ...F.knurled, color: f.color }, m);
    ctx.add(group, bolt(0.004, 0.005).transform(mul(T(0.004, 0.006, -0.012), RZ(0))), F.steel, m);
  }
}

/** Sweep that keeps the profile's X axis aligned with local up (flat lever blades). */
function sweepFlat(pts: readonly P3[], prof: readonly P2[], scale: readonly number[]): MeshData {
  const base = new MeshData();
  const P = pts.length, K = prof.length;
  for (let i = 0; i < P; i++) {
    const p = pts[i];
    const nx = i < P - 1 ? pts[i + 1] : pts[i];
    const pv = i > 0 ? pts[i - 1] : pts[i];
    const t = new THREE.Vector3(nx[0] - pv[0], nx[1] - pv[1], nx[2] - pv[2]).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(t, up).normalize();
    const u2 = new THREE.Vector3().crossVectors(side, t).normalize();
    for (let k = 0; k <= K; k++) {
      const q = prof[k % K];
      const s = scale[i];
      const px = q[0] * s, py = q[1] * s;
      const pos = new THREE.Vector3(p[0], p[1], p[2]).addScaledVector(u2, px).addScaledVector(side, py);
      const n = u2.clone().multiplyScalar(px / (0.0045 * 0.0045)).addScaledVector(side, py / (0.0095 * 0.0095)).normalize();
      base.v(pos.x, pos.y, pos.z, n.x, n.y, n.z, k / K, i / (P - 1));
    }
  }
  for (let i = 0; i < P - 1; i++) {
    for (let k = 0; k < K; k++) {
      const a = i * (K + 1) + k, b = a + 1, c = a + K + 1, d = c + 1;
      base.t(a, c, b);
      base.t(b, c, d);
    }
  }
  return base.orient();
}
