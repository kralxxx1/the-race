import * as THREE from 'three';
import { RX, RZ, T, mul, type KitContext } from '../context';
import { MeshData, alongY, bolt, catmull, circle, extrude, lathe, rod, roundBox, smooth2, sweep, torusX, tube, type P2, type P3 } from '../mesh';
import { F, hard, Micro, vary, type Finish } from '../sink';
import type { EngineVisual } from '../types';

export interface Port {
  pos: P3;
  dir: P3;
  /** Cylinder index in firing order (for header grouping). */
  cyl: number;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const P = (v: THREE.Vector3): P3 => [v.x, v.y, v.z];

interface EngineFin {
  caseF: Finish;
  coverF: Finish;
  headF: Finish;
  camF: Finish;
  finF: Finish;
}

function finishes(e: EngineVisual, chrome: boolean): EngineFin {
  const cast = (hex: string, m = 0.55) => hard(hex, m, 0.48, 0.25, Micro.cast);
  return {
    caseF: cast(e.caseColor),
    coverF: chrome ? F.chrome : hard(e.coverColor, 0.6, 0.38, 0.6, Micro.cast),
    headF: cast(e.headColor),
    camF: chrome ? F.chrome : hard(e.camCoverColor, 0.45, 0.35, 0.8, Micro.cast),
    finF: chrome ? vary(F.polishedAlu, { rough: 0.2 }) : cast(e.headColor, 0.7),
  };
}

/** Engine scale factor from displacement. */
function scaleOf(cc: number): number {
  return Math.cbrt(Math.max(120, cc) / 1000);
}

export function buildEngine(ctx: KitContext): Port[] {
  const e = ctx.bp.engine;
  const chrome = (ctx.bp.features ?? []).includes('chromeEngine');
  const fin = finishes(e, chrome);
  const k = scaleOf(e.cc);
  const c = V(...e.crank);
  const ports: Port[] = [];
  if (e.layout === 'ELECTRIC') {
    buildElectric(ctx, c, fin);
    return ports;
  }
  const layout = e.layout;
  const width = e.width ?? defaultWidth(layout, k);
  buildCrankcase(ctx, c, k, width, fin, layout);
  switch (layout) {
    case 'BOXER':
      buildBoxer(ctx, c, k, fin, ports);
      break;
    case 'F6':
      buildFlatSix(ctx, c, k, fin, ports);
      break;
    case 'V4':
    case 'V4A':
    case 'L2':
    case 'V2_45':
    case 'V2_60':
    case 'V2_75':
      buildVee(ctx, c, k, fin, ports);
      break;
    default:
      buildInline(ctx, c, k, fin, ports);
  }
  if (e.liquidCooled) buildRadiator(ctx, c, k);
  if (e.supercharger) buildSupercharger(ctx, c, k);
  return ports;
}

function defaultWidth(layout: string, k: number): number {
  switch (layout) {
    case 'I6':
      return 0.5;
    case 'I4':
    case 'I4CP':
      return 0.4 * k;
    case 'I3':
      return 0.34 * k;
    case 'V4':
    case 'V4A':
      return 0.34 * k;
    case 'BOXER':
    case 'F6':
      return 0.26;
    case 'SINGLE':
      return 0.24 * k + 0.02;
    default:
      return 0.28 * k + 0.02;
  }
}

/** Main cases: rounded crankcase + gearbox, sump, side covers, oil filter. */
function buildCrankcase(ctx: KitContext, c: THREE.Vector3, k: number, width: number, fin: EngineFin, layout: string): void {
  const zf = c.z - 0.13 * k;
  const zr = c.z + 0.27 * k;
  const yb = c.y - 0.13 * k;
  const boxer = layout === 'BOXER' || layout === 'F6';
  const outline = smooth2(
    [
      [zf, c.y + 0.06 * k],
      [zf - 0.012, c.y - 0.05 * k],
      [zf + 0.04, yb],
      [c.z + 0.12 * k, yb - 0.01],
      [zr - 0.02, yb + 0.03],
      [zr, c.y + 0.03 * k],
      [zr - 0.05 * k, c.y + 0.13 * k],
      [c.z + 0.1 * k, c.y + 0.12 * k],
    ],
    ctx.micro ? 5 : 3,
    true,
  );
  const w = boxer ? width : width * 0.92;
  ctx.add('chassis', extrude(outline, w, { plane: 'zy', bevel: 0.03, bevelSegs: ctx.micro ? 3 : 2, curveSegs: 1 }), fin.caseF);
  // Sump with cooling fins
  const sump = smooth2([[zf + 0.05, yb + 0.02], [c.z + 0.18 * k, yb + 0.02], [c.z + 0.16 * k, yb - 0.06 * k], [zf + 0.08, yb - 0.055 * k]], 3, true);
  ctx.add('chassis', extrude(sump, w * 0.72, { plane: 'zy', bevel: 0.015, curveSegs: 1 }), fin.caseF);
  if (ctx.micro) {
    for (let i = 0; i < 6; i++) {
      const z = zf + 0.08 + i * 0.03 * k;
      ctx.add('chassis', roundBox(w * 0.74, 0.012, 0.005, 0.002), fin.caseF, T(0, yb - 0.045 * k, z));
    }
    // Drain plug
    ctx.add('chassis', bolt(0.008, 0.01), F.steel, mul(T(0.03, yb - 0.065 * k, c.z + 0.05), RX(Math.PI)));
  }
  // Oil filter (front, angled down)
  const ofA = V(0.06 * k, c.y - 0.06 * k, zf - 0.005);
  const ofB = ofA.clone().add(V(0.0, -0.045, -0.06));
  ctx.add('chassis', lathe([[0, 0], [0.036, 0], [0.038, 0.006], [0.038, 0.07], [0.034, 0.078], [0, 0.08]], { segs: ctx.seg(24, 10), axis: 'y', sharp: [1, 3] }), hard(boxer ? '#1b1c1f' : '#1d3b8a', 0.2, 0.3, 0.8), alongY(P(ofA), P(ofB)));
  if (boxer) return;
  // Side covers: clutch (right), alternator + sprocket (left)
  const cover = (x: number, y: number, z: number, r: number, depth: number, side: number, f: Finish) => {
    const prof: P2[] = [[0, depth], [r * 0.4, depth], [r * 0.8, depth * 0.85], [r * 0.98, depth * 0.45], [r, 0], [r * 1.03, -0.004]];
    const m = lathe(prof.slice().reverse() as P2[], { segs: ctx.seg(36, 12), axis: 'x' });
    ctx.add('chassis', m, f, mul(T(x, y, z), side > 0 ? new THREE.Matrix4() : new THREE.Matrix4().makeScale(-1, 1, 1)));
    if (ctx.micro) {
      const n = Math.max(6, Math.round(r * 90));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        ctx.add('chassis', bolt(0.0042, 0.005, true), F.steel, mul(T(x + side * depth * 0.2, y + Math.cos(a) * r * 0.93, z + Math.sin(a) * r * 0.93), RZ(side > 0 ? -Math.PI / 2 : Math.PI / 2)));
      }
    }
  };
  cover(w / 2 + 0.01, c.y + 0.0, c.z + 0.14 * k, 0.1 * k, 0.035, 1, fin.coverF);
  cover(-w / 2 - 0.01, c.y, c.z - 0.01, 0.082 * k, 0.03, -1, fin.coverF);
  // Gear shift shaft
  ctx.add('chassis', rod([-w / 2 - 0.01, c.y - 0.02, c.z + 0.2 * k], [-w / 2 - 0.05, c.y - 0.02, c.z + 0.2 * k], 0.007, 0.007, 8), F.steel);
}

/** Inline 1–6 cylinders tilted forward. */
function buildInline(ctx: KitContext, c: THREE.Vector3, k: number, fin: EngineFin, ports: Port[]): void {
  const e = ctx.bp.engine;
  const n = e.layout === 'SINGLE' ? 1 : e.layout === 'I3' ? 3 : e.layout === 'I6' ? 6 : e.layout.startsWith('P2') ? 2 : 4;
  const t = (e.tiltDeg * Math.PI) / 180;
  const cyl = V(0, Math.cos(t), -Math.sin(t));
  const fwd = V(0, -Math.sin(t), -Math.cos(t));
  const pitch = (n === 1 ? 0.1 : n === 2 ? 0.095 : 0.078) * k + (n === 6 ? 0.0 : 0.006);
  const W = n * pitch + 0.04;
  const rot = RX(-t);
  const at = (d: number, f = 0) => c.clone().addScaledVector(cyl, d * k).addScaledVector(fwd, f * k);
  const finned = e.finned;
  // Cylinder block
  const blk = at(0.2);
  ctx.add('chassis', roundBox(W, 0.2 * k, 0.17 * k, 0.02, 2), fin.caseF, mul(T(blk.x, blk.y, blk.z), rot));
  if (finned) {
    const nf = ctx.micro ? 9 : 4;
    for (let i = 0; i < nf; i++) {
      const p = at(0.12 + i * (0.18 / nf));
      ctx.add('chassis', roundBox(W + 0.05, 0.004, 0.23 * k, 0.0018, 1), fin.finF, mul(T(p.x, p.y, p.z), rot));
    }
  } else if (ctx.micro) {
    // Water jacket ribs on the block face
    for (let i = 0; i < n; i++) {
      const p = at(0.2, 0.087);
      const x = (i - (n - 1) / 2) * pitch;
      ctx.add('chassis', roundBox(0.012, 0.15 * k, 0.006, 0.003), fin.caseF, mul(T(x + pitch / 2, p.y, p.z), rot));
    }
  }
  // Head
  const hd = at(0.335);
  ctx.add('chassis', roundBox(W + 0.012, 0.085 * k, 0.2 * k, 0.018, 2), fin.headF, mul(T(hd.x, hd.y, hd.z), rot));
  if (finned) {
    const nf = ctx.micro ? 4 : 2;
    for (let i = 0; i < nf; i++) {
      const p = at(0.305 + i * 0.02);
      ctx.add('chassis', roundBox(W + 0.06, 0.004, 0.25 * k, 0.0018, 1), fin.finF, mul(T(p.x, p.y, p.z), rot));
    }
  }
  // Cam cover
  const cc = at(0.395);
  const cam = roundBox(W - 0.004, 0.05 * k, 0.18 * k, 0.022, ctx.micro ? 3 : 2);
  ctx.add('chassis', cam, fin.camF, mul(T(cc.x, cc.y, cc.z), rot));
  // Coil caps / spark plug covers along the top
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * pitch;
    const p = at(0.42);
    ctx.add('chassis', lathe([[0, 0], [0.016, 0], [0.016, 0.018], [0.012, 0.022], [0, 0.022]], { segs: ctx.seg(14, 6), axis: 'y', sharp: [1, 2] }), F.texturedBlack, mul(T(x, p.y, p.z), rot));
    // Exhaust port on the front face of the head
    const pp = at(0.33, 0.1);
    const d = fwd.clone().multiplyScalar(0.85).addScaledVector(cyl, -0.45).normalize();
    ports.push({ pos: [x, pp.y, pp.z], dir: P(d), cyl: i });
  }
  if (e.camCoverText && ctx.micro) {
    const r = ctx.label(e.camCoverText, { color: '#d9dadc', weight: '900', italic: true }, 56);
    for (const s of [-1, 1]) {
      const p = at(0.395, 0.0).add(V(s * (W / 2 + 0.0), 0, 0));
      ctx.decal('chassis', r, 0.022 * k, [p.x, p.y, p.z], [s, 0, 0], P(cyl));
    }
  }
  // Throttle bodies / intake trumpets behind the head (mostly hidden by the tank)
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * pitch;
    const a = at(0.33, -0.1);
    const b = a.clone().addScaledVector(fwd, -0.08).addScaledVector(cyl, 0.04);
    ctx.add('chassis', rod([x, a.y, a.z], [x, b.y, b.z], 0.022, 0.026, ctx.seg(12, 6)), F.castAlu);
  }
}

/** V-twins and V4s: two banks with per-cylinder barrels and heads. */
function buildVee(ctx: KitContext, c: THREE.Vector3, k: number, fin: EngineFin, ports: Port[]): void {
  const e = ctx.bp.engine;
  const gamma = e.layout === 'V2_45' ? 45 : e.layout === 'V2_60' ? 60 : e.layout === 'V2_75' ? 75 : e.layout === 'V4A' ? 65 : 90;
  const phiF = (e.tiltDeg * Math.PI) / 180;
  const phiR = phiF + (gamma * Math.PI) / 180;
  const dirOf = (phi: number) => V(0, Math.sin(phi), -Math.cos(phi));
  const four = e.layout === 'V4' || e.layout === 'V4A';
  const perBank = four ? 2 : 1;
  const bore = four ? 0.081 * k : 0.1 * k;
  const len = four ? 0.2 * k : 0.25 * k;
  const harley = e.layout === 'V2_45';
  const banks: [number, number][] = [
    [phiF, four ? -0.02 : 0],
    [phiR, four ? 0.02 : 0.0],
  ];
  let ci = 0;
  for (const [phi, shift] of banks) {
    const d = dirOf(phi);
    const front = phi === phiF;
    for (let j = 0; j < perBank; j++) {
      const x = perBank === 1 ? (harley ? (front ? -0.012 : 0.012) : front ? -0.02 : 0.02) : (j - 0.5) * (bore + 0.022) + shift;
      const base = c.clone().add(V(x, 0, 0)).addScaledVector(d, 0.08 * k);
      const top = base.clone().addScaledVector(d, len);
      // Barrel (finned when air-cooled)
      const r = bore / 2 + 0.012;
      if (e.finned) {
        const prof: P2[] = [[r, 0]];
        const nf = ctx.micro ? 12 : 5;
        for (let i = 0; i < nf; i++) {
          const a0 = ((i + 0.15) / nf) * len, a1 = ((i + 0.55) / nf) * len;
          prof.push([r, a0], [r + 0.03 * k, a0 + 0.002], [r + 0.03 * k, a1 - 0.002], [r, a1]);
        }
        prof.push([r, len]);
        ctx.add('chassis', lathe(prof, { segs: ctx.seg(28, 10), axis: 'y', sharp: true }), fin.finF, alongY(P(base), P(top)));
      } else {
        ctx.add('chassis', roundBox(r * 2 + 0.01, len, r * 2 + 0.02, 0.012, 2), fin.caseF, mul(alongY(P(base), P(top)), T(0, len / 2, 0)));
      }
      // Head + cover
      const hb = top.clone();
      const ht = top.clone().addScaledVector(d, 0.09 * k);
      ctx.add('chassis', roundBox(r * 2 + 0.04, 0.09 * k, r * 2 + 0.07, 0.02, 2), fin.headF, mul(alongY(P(hb), P(ht)), T(0, 0.045 * k, 0)));
      if (e.finned) {
        for (let i = 0; i < (ctx.micro ? 4 : 2); i++) ctx.add('chassis', roundBox(r * 2 + 0.08, 0.004, r * 2 + 0.1, 0.0015, 1), fin.finF, mul(alongY(P(hb), P(ht)), T(0, 0.012 + i * 0.018 * k, 0)));
      }
      const cv = ht.clone();
      ctx.add('chassis', roundBox(r * 2 + 0.024, 0.045 * k, r * 2 + 0.05, 0.02, 2), fin.camF, mul(alongY(P(cv), P(cv.clone().addScaledVector(d, 0.05))), T(0, 0.02 * k, 0)));
      // Exhaust port
      let pd: THREE.Vector3;
      let pp: THREE.Vector3;
      if (harley) {
        pp = top.clone().add(V(0.05, -0.01, front ? -0.03 : 0.02));
        pd = V(0.7, -0.4, front ? -0.55 : 0.35).normalize();
      } else if (front) {
        pd = V(0, -Math.cos(phi), -Math.sin(phi));
        pp = top.clone().addScaledVector(pd, r + 0.01);
        pd.addScaledVector(d, 0.2).normalize();
      } else {
        pd = V(0, -Math.cos(phi), -Math.sin(phi)).negate();
        if (pd.z < 0) pd.negate();
        pp = top.clone().addScaledVector(pd, r + 0.01);
      }
      ports.push({ pos: P(pp), dir: P(pd), cyl: ci++ });
    }
  }
  if (harley) {
    // Pushrod tubes, chrome air cleaner (right), primary cover (left), cam cover.
    for (const s of [-0.01, 0.01]) ctx.add('chassis', rod([0.03 + s, c.y + 0.02, c.z + 0.02], [0.05 + s, c.y + 0.27, c.z + (s > 0 ? 0.1 : -0.1)], 0.0085, 0.0085, 10), F.chrome);
    ctx.add('chassis', lathe([[0, 0], [0.11, 0], [0.12, 0.012], [0.12, 0.045], [0.1, 0.06], [0, 0.065]], { segs: ctx.seg(40, 14), axis: 'x' }), F.chrome, T(0.11, c.y + 0.26, c.z + 0.01));
    ctx.add('chassis', lathe([[0, 0], [0.09, 0], [0.095, 0.02], [0.08, 0.04], [0, 0.045]], { segs: ctx.seg(32, 12), axis: 'x' }), F.chrome, T(0.13, c.y - 0.01, c.z + 0.09));
    const prim = smooth2([[c.z - 0.08, c.y + 0.03], [c.z + 0.45, c.y + 0.02], [c.z + 0.5, c.y - 0.08], [c.z + 0.3, c.y - 0.13], [c.z - 0.06, c.y - 0.1]], 4, true);
    ctx.add('chassis', extrude(prim, 0.06, { plane: 'zy', bevel: 0.025, center: -0.17, curveSegs: 1 }), F.chrome);
  } else {
    // Covers on both sides of the cases (generator / clutch)
    ctx.add('chassis', roundBox(0.06, 0.16 * k, 0.24 * k, 0.03, 2), fin.coverF, T(0.0, c.y - 0.01, c.z + 0.12 * k));
  }
}

/** BMW-style boxer: horizontally opposed cylinders sticking out of both sides. */
function buildBoxer(ctx: KitContext, c: THREE.Vector3, k: number, fin: EngineFin, ports: Port[]): void {
  const e = ctx.bp.engine;
  for (const s of [-1, 1]) {
    const base = V(s * 0.12, c.y + 0.05, c.z + (s > 0 ? 0.03 : -0.03));
    const d = V(s, 0.12, -0.03).normalize();
    const len = 0.18 * k;
    const top = base.clone().addScaledVector(d, len);
    const r = 0.055 * k + 0.012;
    if (e.finned) {
      const prof: P2[] = [[r, 0]];
      for (let i = 0; i < (ctx.micro ? 10 : 4); i++) {
        const a0 = (i + 0.2) * (len / 10), a1 = (i + 0.6) * (len / 10);
        prof.push([r, a0], [r + 0.022, a0 + 0.002], [r + 0.022, a1 - 0.002], [r, a1]);
      }
      prof.push([r, len]);
      ctx.add('chassis', lathe(prof, { segs: ctx.seg(28, 10), axis: 'y', sharp: true }), fin.finF, alongY(P(base), P(top)));
    } else {
      ctx.add('chassis', lathe([[r, 0], [r, len]], { segs: ctx.seg(28, 10), axis: 'y' }), fin.caseF, alongY(P(base), P(top)));
      // Water-cooled heads with fins on the barrel faces (ShiftCam look)
      if (ctx.micro) for (let i = 0; i < 5; i++) ctx.add('chassis', torusX(r + 0.002, 0.004, ctx.seg(28, 10), 6), fin.caseF, mul(alongY(P(base), P(top)), T(0, len * (0.2 + i * 0.15), 0), RZ(Math.PI / 2)));
    }
    // Big head with protruding valve cover
    const h0 = top.clone();
    const h1 = top.clone().addScaledVector(d, 0.1);
    ctx.add('chassis', roundBox(0.19, 0.1, 0.2, 0.03, 2), fin.headF, mul(alongY(P(h0), P(h1)), T(0, 0.05, 0)));
    const v0 = h1.clone();
    const v1 = h1.clone().addScaledVector(d, 0.05);
    ctx.add('chassis', roundBox(0.17, 0.05, 0.16, 0.024, 3), fin.camF, mul(alongY(P(v0), P(v1)), T(0, 0.024, 0)));
    if (ctx.micro) {
      // Valve cover protector / badge plate
      ctx.add('chassis', roundBox(0.1, 0.012, 0.11, 0.006, 2), F.texturedBlack, mul(alongY(P(v0), P(v1)), T(0, 0.052, 0)));
      for (let i = 0; i < 4; i++) ctx.add('chassis', bolt(0.005, 0.006), F.steel, mul(alongY(P(v0), P(v1)), T(i < 2 ? -0.065 : 0.065, 0.05, i % 2 ? -0.06 : 0.06)));
    }
    // Exhaust port under the head, pointing down and forward
    const pp = h0.clone().add(V(0, -0.07, -0.03));
    ports.push({ pos: P(pp), dir: P(V(-s * 0.1, -0.8, -0.6).normalize()), cyl: s > 0 ? 1 : 0 });
  }
  // Central case top / alternator cover at the front
  ctx.add('chassis', lathe([[0, 0], [0.09, 0], [0.095, 0.03], [0.08, 0.05], [0, 0.055]], { segs: ctx.seg(32, 12), axis: 'z' }).transform(new THREE.Matrix4().makeScale(1, 1, -1)), fin.coverF, T(0, c.y + 0.02, c.z - 0.16));
}

function buildFlatSix(ctx: KitContext, c: THREE.Vector3, k: number, fin: EngineFin, ports: Port[]): void {
  for (const s of [-1, 1]) {
    const base = V(s * 0.12, c.y + 0.06, c.z);
    const end = base.clone().add(V(s * 0.16, 0, 0));
    ctx.add('chassis', roundBox(0.16, 0.16, 0.42 * k, 0.04, 2), fin.headF, T((base.x + end.x) / 2, base.y, base.z));
    ctx.add('chassis', roundBox(0.03, 0.13, 0.38 * k, 0.012, 2), fin.camF, T(end.x + s * 0.01, base.y, base.z));
    for (let i = 0; i < 3; i++) ports.push({ pos: [s * 0.2, base.y - 0.08, base.z - 0.14 + i * 0.14], dir: [0, -1, -0.2], cyl: i * 2 + (s > 0 ? 1 : 0) });
  }
  void k;
}

function buildElectric(ctx: KitContext, c: THREE.Vector3, fin: EngineFin): void {
  // Battery pack (finned cast housing) + motor below it.
  ctx.add('chassis', roundBox(0.3, 0.3, 0.52, 0.04, 2), hard('#2a2c30', 0.6, 0.45, 0.4, Micro.cast), T(c.x, c.y + 0.2, c.z - 0.02));
  if (ctx.micro) for (let i = 0; i < 9; i++) ctx.add('chassis', roundBox(0.32, 0.006, 0.48, 0.002), fin.finF, T(c.x, c.y + 0.08 + i * 0.028, c.z - 0.02));
  ctx.add('chassis', lathe([[0, -0.13], [0.1, -0.13], [0.11, -0.11], [0.11, 0.11], [0.1, 0.13], [0, 0.13]], { segs: ctx.seg(36, 12), axis: 'x', sharp: [1, 4] }), fin.coverF, T(c.x, c.y - 0.06, c.z + 0.12));
}

/** Radiator core (textured), side tanks, fan, hoses. */
function buildRadiator(ctx: KitContext, c: THREE.Vector3, k: number): void {
  const e = ctx.bp.engine;
  const hp = ctx.hp;
  const r = e.radiator ?? { w: 0.36 * k + 0.08, h: 0.3, z: hp.head[2] + 0.24, y: c.y + 0.26, tiltDeg: 12 };
  const tilt = (r.tiltDeg * Math.PI) / 180;
  const sides = r.side ? [-1, 1] : [0];
  for (const s of sides) {
    const w = r.side ? r.w : r.w;
    const m = r.side
      ? mul(T(s * 0.2, r.y, r.z), new THREE.Matrix4().makeRotationY(s * 1.2), RX(-tilt))
      : mul(T(0, r.y, r.z), RX(-tilt));
    const segX = r.curved ? ctx.seg(10, 4) : 1;
    const core = new MeshData();
    const depth = 0.035;
    // Front/back faces with core texture UVs, slightly curved around the wheel when requested.
    for (const face of [-1, 1]) {
      const base = core.vcount;
      for (let i = 0; i <= segX; i++) {
        const u = i / segX;
        const x = (u - 0.5) * w;
        const bend = r.curved ? -(x * x) * 0.35 : 0;
        for (const v of [0, 1]) {
          const y = (v - 0.5) * r.h;
          const nz = face < 0 ? -1 : 1;
          core.v(x, y, bend + (face * depth) / 2, r.curved ? x * 0.7 * -nz : 0, 0, nz, u * (w / 0.1), v * (r.h / 0.1));
        }
      }
      for (let i = 0; i < segX; i++) {
        const a = base + i * 2;
        if (face > 0) {
          core.t(a, a + 2, a + 1);
          core.t(a + 1, a + 2, a + 3);
        } else {
          core.t(a, a + 1, a + 2);
          core.t(a + 1, a + 3, a + 2);
        }
      }
    }
    ctx.add('chassis', core, F.radiator, m);
    // Frame: top/bottom rails and side tanks
    const tank = roundBox(0.03, r.h + 0.02, depth + 0.012, 0.008, 2);
    for (const sx of [-1, 1]) {
      const bend = r.curved ? -((w / 2) ** 2) * 0.35 : 0;
      ctx.add('chassis', tank, F.texturedBlack, mul(m, T(sx * (w / 2 + 0.012), 0, bend)));
    }
    ctx.add('chassis', roundBox(w + 0.03, 0.016, depth + 0.006, 0.005, 1), F.texturedBlack, mul(m, T(0, r.h / 2 + 0.007, r.curved ? -0.004 : 0)));
    ctx.add('chassis', roundBox(w + 0.03, 0.016, depth + 0.006, 0.005, 1), F.texturedBlack, mul(m, T(0, -r.h / 2 - 0.007, r.curved ? -0.004 : 0)));
    // Fan behind the core
    const fr = Math.min(r.w, r.h) * 0.36;
    ctx.add('chassis', lathe([[fr * 0.3, 0], [fr + 0.008, 0], [fr + 0.008, 0.03], [fr * 0.3, 0.03]], { segs: ctx.seg(32, 10), axis: 'z', sharp: true }), F.texturedBlack, mul(m, T(r.w * 0.18, 0, depth / 2)));
    if (ctx.micro) {
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        ctx.add('chassis', roundBox(0.03, fr * 0.9, 0.003, 0.002, 1), F.texturedBlack, mul(m, T(r.w * 0.18, 0, depth / 2 + 0.015), RZ(a), T(0, fr * 0.5, 0), new THREE.Matrix4().makeRotationY(0.5)));
      }
    }
    if (s !== 0) continue;
    // Hoses: top to the thermostat on the head, bottom to the water pump.
    const top = new THREE.Vector3(r.w * 0.35, r.h / 2 + 0.01, depth / 2).applyMatrix4(m);
    const bot = new THREE.Vector3(-r.w * 0.38, -r.h / 2 - 0.01, depth / 2).applyMatrix4(m);
    const head = V(0.06, c.y + 0.36 * k, c.z - 0.12);
    const pump = V(-0.16 * k, c.y - 0.04, c.z - 0.06);
    ctx.add('chassis', tube([P(top), P(top.clone().add(V(0.02, 0.04, 0.05))), P(head)], 0.016, ctx.seg(14, 8), 8), F.hose);
    ctx.add('chassis', tube([P(bot), P(bot.clone().add(V(-0.03, -0.05, 0.06))), P(pump)], 0.016, ctx.seg(14, 8), 8), F.hose);
  }
}

/** Kawasaki H2: centrifugal supercharger on the left with its ram-air duct. */
function buildSupercharger(ctx: KitContext, c: THREE.Vector3, k: number): void {
  const at = V(-0.17, c.y + 0.24 * k, c.z + 0.08);
  ctx.add('chassis', lathe([[0, -0.05], [0.09, -0.05], [0.1, -0.02], [0.1, 0.02], [0.085, 0.05], [0.03, 0.06], [0, 0.06]], { segs: ctx.seg(40, 14), axis: 'x' }), vary(F.castAlu, { rough: 0.3 }), T(at.x, at.y, at.z));
  ctx.add('chassis', lathe([[0, 0], [0.035, 0], [0.04, 0.05], [0, 0.05]], { segs: ctx.seg(24, 8), axis: 'x' }).transform(new THREE.Matrix4().makeScale(-1, 1, 1)), F.polishedAlu, T(at.x - 0.06, at.y, at.z));
  const hp = ctx.hp;
  const duct = [P(at.clone().add(V(-0.07, 0.02, -0.02))), [-0.2, at.y + 0.1, at.z - 0.25] as P3, [-0.16, hp.head[1] - 0.02, hp.head[2] - 0.12] as P3, [-0.1, hp.head[1] - 0.05, hp.head[2] - 0.3] as P3];
  ctx.add('chassis', sweep(tubePath(duct, ctx), circle(0.055, ctx.seg(20, 10)), { scale: undefined, capStart: false, capEnd: false }), F.carbon);
  ctx.anchor('superchargerInlet', duct[3]);
}

function tubePath(pts: P3[], ctx: KitContext): P3[] {
  return catmull(pts, ctx.seg(8, 4)).map((q) => [q[0], q[1], q[2]] as P3);
}
