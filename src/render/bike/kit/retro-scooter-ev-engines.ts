import * as THREE from 'three';
import { RZ, T, mul, type KitContext } from '../context';
import { alongY, bolt, extrude, lathe, rod, roundBox, smooth2, type P2, type P3 } from '../mesh';
import { F, Micro, hard, vary, type Finish } from '../sink';
import type { Port } from './engine';

/**
 * Air-cooled engines for the retro / scooter family: vertical parallel twin (Bonneville, Interceptor), single
 * (Royal Enfield J-series), 90° L-twin (Ducati Scrambler) and 60° liquid-cooled V-twin (Indian FTR).
 * They replace the generic kit engine (blueprints list `skip:engine` and call these from `body`).
 *
 * Bike space: +Y up, −Z forward, +X right.
 */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const P = (v: THREE.Vector3): P3 => [v.x, v.y, v.z];

export interface EngineFinishes {
  /** Crankcase and gearbox. */
  case: Finish;
  /** Barrel and head castings. */
  block: Finish;
  /** Fin edges / polished highlights. */
  edge?: Finish;
  /** Side covers (clutch, alternator). */
  cover: Finish;
  /** Cam / rocker cover. */
  cam: Finish;
  /** Chrome / brushed trim (caps, bolts rings). */
  trim: Finish;
}

export function castFinish(hex: string, metal = 0.55, rough = 0.5): Finish {
  return hard(hex, metal, rough, 0.2, Micro.cast);
}

// ───────────────────────────── cylinder frame helpers ─────────────────────────────

/** Local frame of a cylinder: y along the bore (up the barrel), x lateral, z "behind" (towards the rider). */
export interface CylFrame {
  c: THREE.Vector3;
  axis: THREE.Vector3;
  back: THREE.Vector3;
  rot: THREE.Matrix4;
  /** Point at distance `d` along the bore, `b` behind it and `x` to the right. */
  at: (d: number, b?: number, x?: number) => THREE.Vector3;
  /** Matrix placing a part in this frame at (d, b, x). */
  m: (d: number, b?: number, x?: number) => THREE.Matrix4;
}

/** `tiltDeg` = lean of the bore from vertical, positive towards the front of the bike. */
export function cylFrame(crank: P3, tiltDeg: number): CylFrame {
  const t = (tiltDeg * Math.PI) / 180;
  const c = V(...crank);
  const axis = V(0, Math.cos(t), -Math.sin(t));
  const back = V(0, Math.sin(t), Math.cos(t));
  const rot = new THREE.Matrix4().makeRotationX(-t);
  const at = (d: number, b = 0, x = 0): THREE.Vector3 => c.clone().addScaledVector(axis, d).addScaledVector(back, b).add(V(x, 0, 0));
  return { c, axis, back, rot, at, m: (d, b = 0, x = 0) => mul(T(...P(at(d, b, x))), rot) };
}

/** A block of cooling fins stacked along the bore from `d0` to `d1`, around a solid core. */
export function finStack(ctx: KitContext, fr: CylFrame, o: { d0: number; d1: number; w: number; depth: number; n: number; finT: number; fin: Finish; core: Finish; coreK?: number; b?: number; x?: number; r?: number; edge?: Finish }): void {
  const h = o.d1 - o.d0;
  const coreK = o.coreK ?? 0.84;
  ctx.add('chassis', roundBox(o.w * coreK, h, o.depth * coreK, Math.min(o.w, o.depth) * 0.1, 1), o.core, fr.m(o.d0 + h / 2, o.b ?? 0, o.x ?? 0));
  const n = Math.max(2, ctx.micro ? o.n : Math.ceil(o.n * 0.6));
  for (let i = 0; i < n; i++) {
    const d = o.d0 + o.finT / 2 + ((h - o.finT) * i) / (n - 1);
    ctx.add('chassis', roundBox(o.w, o.finT, o.depth, o.r ?? Math.min(o.w, o.depth) * 0.12, 1), o.fin, fr.m(d, o.b ?? 0, o.x ?? 0));
    if (o.edge && ctx.micro) ctx.add('chassis', roundBox(o.w + 0.0006, o.finT * 0.45, o.depth + 0.0006, o.r ?? Math.min(o.w, o.depth) * 0.12, 1), o.edge, fr.m(d, o.b ?? 0, o.x ?? 0));
  }
}

/** Round side cover with a machined centre cap and a ring of bolts. Axis along X, `side` = +1 right, −1 left. */
export function roundCover(ctx: KitContext, p: P3, r: number, depth: number, side: 1 | -1, f: Finish, trim: Finish, o: { bolts?: number; cap?: number } = {}): void {
  const prof: P2[] = [[0, depth], [r * 0.3, depth], [r * 0.36, depth * 0.94], [r * 0.8, depth * 0.9], [r * 0.9, depth * 0.72], [r * 0.97, depth * 0.3], [r, 0], [r * 1.03, -0.004]];
  const m = lathe(prof.slice().reverse() as P2[], { segs: ctx.seg(40, 14), axis: 'x', sharp: [4, 6] });
  const mirror = side > 0 ? new THREE.Matrix4() : new THREE.Matrix4().makeScale(-1, 1, 1);
  ctx.add('chassis', m, f, mul(T(p[0], p[1], p[2]), mirror));
  const cap = o.cap ?? r * 0.3;
  ctx.add('chassis', lathe([[0, 0], [cap, 0], [cap * 1.04, 0.003], [cap * 0.9, 0.008], [0, 0.009]], { segs: ctx.seg(28, 10), axis: 'x', sharp: [1] }), vary(trim, { rough: 0.3 }), mul(T(p[0] + side * depth * 0.92, p[1], p[2]), mirror));
  if (ctx.micro) {
    const n = o.bolts ?? Math.max(6, Math.round(r * 90));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      ctx.add('chassis', bolt(0.0042, 0.005, true), F.steel, mul(T(p[0] + side * depth * 0.2, p[1] + Math.cos(a) * r * 0.93, p[2] + Math.sin(a) * r * 0.93), RZ(side > 0 ? -Math.PI / 2 : Math.PI / 2)));
    }
  }
}

function crankcase(ctx: KitContext, c: THREE.Vector3, o: { zf: number; zr: number; width: number; top: number; bottom: number; f: Finish }): void {
  const outline: P2[] = smooth2(
    [
      [o.zf, c.y + o.top * 0.7],
      [o.zf - 0.012, c.y - o.bottom * 0.3],
      [o.zf + 0.04, c.y - o.bottom],
      [c.z + 0.1, c.y - o.bottom - 0.012],
      [o.zr - 0.03, c.y - o.bottom * 0.85],
      [o.zr + 0.005, c.y - o.bottom * 0.2],
      [o.zr - 0.03, c.y + o.top * 0.7],
      [c.z + 0.06, c.y + o.top],
    ],
    ctx.micro ? 5 : 3,
    true,
  );
  ctx.add('chassis', extrude(outline, o.width, { plane: 'zy', bevel: 0.03, bevelSegs: ctx.micro ? 3 : 2, curveSegs: 1 }), o.f);
  // Sump / gearbox bottom with drain plug
  ctx.add('chassis', roundBox(o.width * 0.7, 0.045, (o.zr - o.zf) * 0.6, 0.02, 2), o.f, T(0, c.y - o.bottom - 0.03, (o.zf + o.zr) / 2 - 0.02));
  if (ctx.micro) ctx.add('chassis', bolt(0.008, 0.01), F.steel, mul(T(0.03, c.y - o.bottom - 0.052, c.z + 0.05), new THREE.Matrix4().makeRotationX(Math.PI)));
}

// ───────────────────────────── vertical parallel twin ─────────────────────────────

export interface AirTwinOpts {
  crank: P3;
  tiltDeg: number;
  /** Cylinder spacing (m). */
  pitch: number;
  /** Width of one bore's finned block (m). */
  bore: number;
  barrelH: number;
  headH: number;
  fins: number;
  fin: EngineFinishes;
  camText?: string;
  /** Front-to-back depth of the barrel block (m). */
  depth?: number;
  /** 'triumph': mock carbs + brushed alloy cam covers; 'enfield': plain rocker cover with ribs. */
  style: 'triumph' | 'enfield';
}

export function buildAirTwin(ctx: KitContext, o: AirTwinOpts): Port[] {
  const fr = cylFrame(o.crank, o.tiltDeg);
  const c = fr.c;
  const f = o.fin;
  const ports: Port[] = [];
  const W = o.pitch + o.bore;
  const depth = o.depth ?? (o.style === 'triumph' ? 0.1 : 0.09);
  crankcase(ctx, c, { zf: c.z - 0.12, zr: c.z + 0.3, width: 0.2, top: 0.075, bottom: 0.125, f: f.case });
  // Barrel block (two bores, one set of fins) and head
  const b0 = 0.07, b1 = b0 + o.barrelH, h1 = b1 + o.headH;
  finStack(ctx, fr, { d0: b0, d1: b1, w: W, depth, n: o.fins, finT: 0.0034, fin: f.block, core: f.block, edge: f.edge });
  finStack(ctx, fr, { d0: b1, d1: h1, w: W + 0.012, depth: depth + 0.022, n: Math.round(o.fins * 0.6), finT: 0.004, fin: f.block, core: f.block, edge: f.edge });
  // Cam / rocker cover: long flat-topped box with a raised centre ridge
  const cam = roundBox(W + 0.016, 0.042, depth + 0.026, 0.016, 2);
  ctx.add('chassis', cam, f.cam, fr.m(h1 + 0.02));
  ctx.add('chassis', roundBox(W - 0.02, 0.012, depth - 0.02, 0.006, 1), vary(f.cam, { rough: 0.3 }), fr.m(h1 + 0.047));
  if (o.camText && ctx.micro) {
    const r = ctx.label(o.camText, { color: '#e6e7e9', weight: '800', italic: false }, 56);
    for (const s of [-1, 1]) {
      const p = fr.at(h1 + 0.02, 0, s * (W / 2 + 0.0085));
      ctx.decal('chassis', r, 0.02, P(p), [s, 0, 0], P(fr.axis));
    }
  }
  // Plug caps
  for (let i = 0; i < 2; i++) {
    const x = (i - 0.5) * o.pitch;
    const p = fr.at(h1 + 0.05, 0, x);
    ctx.add('chassis', lathe([[0, 0], [0.015, 0], [0.015, 0.03], [0.011, 0.036], [0, 0.036]], { segs: ctx.seg(14, 6), axis: 'y', sharp: [1, 2] }), F.texturedBlack, mul(T(...P(p)), fr.rot));
  }
  // Exhaust ports on the front of the head, finned header nuts; intake on the back
  for (let i = 0; i < 2; i++) {
    const x = (i - 0.5) * o.pitch;
    const pp = fr.at(b1 + o.headH * 0.38, -(depth / 2 + 0.03), x);
    const dir = fr.back.clone().multiplyScalar(-0.86).addScaledVector(fr.axis, -0.5).normalize();
    ports.push({ pos: P(pp), dir: P(dir), cyl: i });
    ctx.add('chassis', lathe([[0.02, 0], [0.034, 0.0], [0.034, 0.012], [0.02, 0.012]], { segs: ctx.seg(20, 8), axis: 'z', sharp: true }), vary(F.steel, { rough: 0.35 }), mul(T(...P(pp)), fr.rot));
    if (o.style === 'triumph') {
      // Mock carburettor bodies behind the head: chrome-trimmed cylinders with the throttle-cable rose
      const q = fr.at(b1 + o.headH * 0.4, depth / 2 + 0.02, x);
      const a: P3 = P(q);
      const bpt: P3 = [a[0], a[1] - 0.012, a[2] + 0.1];
      ctx.add('chassis', rod(a, bpt, 0.027, 0.027, ctx.seg(20, 8)), hard('#1b1c1f', 0.4, 0.4, 0.6, Micro.cast));
      ctx.add('chassis', lathe([[0.027, 0], [0.032, 0.002], [0.032, 0.012], [0.027, 0.014]], { segs: ctx.seg(20, 8), axis: 'y', sharp: true }), f.trim, alongY(a, bpt));
    }
  }
  // Side covers: alternator (left), clutch (right) + final-drive sprocket cover
  roundCover(ctx, [-0.1 - 0.012, c.y + 0.005, c.z - 0.02], 0.07, 0.03, -1, f.cover, f.trim);
  roundCover(ctx, [0.1 + 0.012, c.y - 0.005, c.z + 0.15], o.style === 'enfield' ? 0.105 : 0.098, 0.034, 1, f.cover, f.trim);
  ctx.add('chassis', roundBox(0.03, 0.1, 0.13, 0.014, 2), f.case, T(-0.115, c.y - 0.04, c.z + 0.2));
  // Shift shaft + oil filter
  ctx.add('chassis', lathe([[0, 0], [0.007, 0], [0.007, 0.07], [0, 0.07]], { segs: 8, axis: 'x', sharp: true }), F.steel, T(-0.13, c.y - 0.04, c.z + 0.22));
  ctx.add('chassis', lathe([[0, 0], [0.034, 0], [0.036, 0.006], [0.036, 0.07], [0.032, 0.078], [0, 0.08]], { segs: ctx.seg(22, 10), axis: 'y', sharp: [1, 3] }), hard('#18191c', 0.3, 0.3, 0.8), alongY([0.05, c.y - 0.1, c.z - 0.1], [0.05, c.y - 0.13, c.z - 0.17]));
  return ports;
}

// ───────────────────────────── single (Royal Enfield J-series) ─────────────────────────────

export interface SingleOpts {
  crank: P3;
  tiltDeg: number;
  barrelH: number;
  headH: number;
  fins: number;
  fin: EngineFinishes;
  camText?: string;
}

export function buildSingle(ctx: KitContext, o: SingleOpts): Port[] {
  const fr = cylFrame(o.crank, o.tiltDeg);
  const c = fr.c;
  const f = o.fin;
  const ports: Port[] = [];
  crankcase(ctx, c, { zf: c.z - 0.13, zr: c.z + 0.3, width: 0.19, top: 0.08, bottom: 0.13, f: f.case });
  const b0 = 0.07, b1 = b0 + o.barrelH, h1 = b1 + o.headH;
  // Round-ish finned barrel (square fins with rounded corners) and a slightly larger head
  finStack(ctx, fr, { d0: b0, d1: b1, w: 0.108, depth: 0.108, n: o.fins, finT: 0.0034, fin: f.block, core: f.block, edge: f.edge, r: 0.026 });
  finStack(ctx, fr, { d0: b1, d1: h1, w: 0.118, depth: 0.128, n: Math.round(o.fins * 0.55), finT: 0.004, fin: f.block, core: f.block, edge: f.edge, r: 0.03 });
  // Rocker cover: domed, polished edges
  ctx.add('chassis', roundBox(0.122, 0.044, 0.126, 0.03, 2), f.cam, fr.m(h1 + 0.02));
  ctx.add('chassis', roundBox(0.1, 0.012, 0.1, 0.03, 1), vary(f.cam, { rough: 0.3 }), fr.m(h1 + 0.045));
  if (o.camText && ctx.micro) {
    const r = ctx.label(o.camText, { color: '#e6e7e9', weight: '800' }, 48);
    for (const s of [-1, 1]) ctx.decal('chassis', r, 0.016, P(fr.at(h1 + 0.02, 0, s * 0.0615)), [s, 0, 0], P(fr.axis));
  }
  // Plug cap on top, exhaust port on the front, intake behind
  ctx.add('chassis', lathe([[0, 0], [0.015, 0], [0.015, 0.032], [0.011, 0.038], [0, 0.038]], { segs: ctx.seg(14, 6), axis: 'y', sharp: [1, 2] }), F.texturedBlack, mul(T(...P(fr.at(h1 + 0.05, -0.02))), fr.rot));
  const pp = fr.at(b1 + o.headH * 0.4, -0.075);
  const dir = fr.back.clone().multiplyScalar(-0.86).addScaledVector(fr.axis, -0.5).normalize();
  ports.push({ pos: P(pp), dir: P(dir), cyl: 0 });
  ctx.add('chassis', lathe([[0.024, 0], [0.038, 0], [0.038, 0.012], [0.024, 0.012]], { segs: ctx.seg(20, 8), axis: 'z', sharp: true }), vary(F.chrome, { rough: 0.2 }), mul(T(...P(pp)), fr.rot));
  const ip = fr.at(b1 + o.headH * 0.45, 0.075);
  ctx.add('chassis', rod(P(ip), [ip.x, ip.y + 0.03, ip.z + 0.13], 0.026, 0.026, ctx.seg(18, 8)), hard('#1b1c1f', 0.35, 0.5, 0.4, Micro.cast));
  // Side covers: round alternator (left), the big clutch / oil-window cover (right)
  roundCover(ctx, [-0.095 - 0.012, c.y + 0.01, c.z - 0.02], 0.075, 0.03, -1, f.cover, f.trim);
  roundCover(ctx, [0.095 + 0.012, c.y, c.z + 0.14], 0.1, 0.036, 1, f.cover, f.trim);
  ctx.add('chassis', roundBox(0.03, 0.1, 0.13, 0.014, 2), f.case, T(-0.11, c.y - 0.04, c.z + 0.2));
  ctx.add('chassis', lathe([[0, 0], [0.007, 0], [0.007, 0.07], [0, 0.07]], { segs: 8, axis: 'x', sharp: true }), F.steel, T(-0.12, c.y - 0.04, c.z + 0.22));
  return ports;
}

// ───────────────────────────── 90° L-twin (Ducati Scrambler) ─────────────────────────────

export interface LTwinOpts {
  crank: P3;
  /** Front cylinder lean from vertical (forward), rear cylinder = front − 90°. */
  frontDeg: number;
  barrelH: number;
  headH: number;
  fins: number;
  fin: EngineFinishes;
}

export function buildLTwin(ctx: KitContext, o: LTwinOpts): Port[] {
  const f = o.fin;
  const ports: Port[] = [];
  const c = V(...o.crank);
  crankcase(ctx, c, { zf: c.z - 0.14, zr: c.z + 0.28, width: 0.2, top: 0.07, bottom: 0.12, f: f.case });
  const rearDeg = o.frontDeg - 90;
  for (const [deg, front] of [[o.frontDeg, true], [rearDeg, false]] as const) {
    const fr = cylFrame(o.crank, deg);
    const b0 = 0.07, b1 = b0 + o.barrelH, h1 = b1 + o.headH;
    finStack(ctx, fr, { d0: b0, d1: b1, w: 0.112, depth: 0.1, n: o.fins, finT: 0.0034, fin: f.block, core: f.block, edge: f.edge, r: 0.012 });
    finStack(ctx, fr, { d0: b1, d1: h1, w: 0.126, depth: 0.122, n: Math.round(o.fins * 0.6), finT: 0.004, fin: f.block, core: f.block, edge: f.edge, r: 0.014 });
    ctx.add('chassis', roundBox(0.13, 0.04, 0.124, 0.016, 2), f.cam, fr.m(h1 + 0.019));
    ctx.add('chassis', roundBox(0.1, 0.01, 0.09, 0.005, 1), vary(f.cam, { rough: 0.3 }), fr.m(h1 + 0.04));
    // Vertical belt covers on the left of each head (Desmo timing belts)
    ctx.add('chassis', roundBox(0.022, o.barrelH + o.headH, 0.052, 0.008, 1), vary(f.cover, { micro: Micro.grain }), fr.m(b0 + (o.barrelH + o.headH) / 2, 0, -0.07));
    // Exhaust port: front cylinder at its front face, rear cylinder at its rear face
    const sign = front ? -1 : 1;
    const pp = fr.at(b1 + o.headH * 0.35, sign * 0.076);
    const dir = fr.back.clone().multiplyScalar(sign).addScaledVector(fr.axis, -0.35).normalize();
    ports.push({ pos: P(pp), dir: P(dir), cyl: front ? 0 : 1 });
    ctx.add('chassis', lathe([[0.02, 0], [0.034, 0], [0.034, 0.012], [0.02, 0.012]], { segs: ctx.seg(20, 8), axis: 'z', sharp: true }), vary(F.steel, { rough: 0.35 }), mul(T(...P(pp)), fr.rot));
    // Plug caps
    ctx.add('chassis', lathe([[0, 0], [0.014, 0], [0.014, 0.03], [0.01, 0.035], [0, 0.035]], { segs: ctx.seg(14, 6), axis: 'y', sharp: [1, 2] }), F.texturedBlack, mul(T(...P(fr.at(h1 + 0.04, 0, 0.02))), fr.rot));
  }
  // Intake / airbox hump between the cylinders and the clutch cover
  ctx.add('chassis', roundBox(0.12, 0.09, 0.14, 0.03, 2), hard('#17181b', 0.3, 0.5, 0.2), T(0, c.y + 0.2, c.z - 0.03));
  roundCover(ctx, [-0.1 - 0.012, c.y + 0.0, c.z + 0.02], 0.07, 0.03, -1, f.cover, f.trim);
  roundCover(ctx, [0.1 + 0.012, c.y - 0.005, c.z + 0.13], 0.1, 0.034, 1, f.cover, f.trim);
  ctx.add('chassis', lathe([[0, 0], [0.007, 0], [0.007, 0.07], [0, 0.07]], { segs: 8, axis: 'x', sharp: true }), F.steel, T(-0.13, c.y - 0.04, c.z + 0.2));
  ctx.add('chassis', lathe([[0, 0], [0.036, 0], [0.038, 0.006], [0.038, 0.07], [0.034, 0.078], [0, 0.08]], { segs: ctx.seg(22, 10), axis: 'y', sharp: [1, 3] }), hard('#18191c', 0.3, 0.3, 0.8), alongY([0.0, c.y - 0.1, c.z - 0.14], [0.0, c.y - 0.13, c.z - 0.21]));
  return ports;
}

// ───────────────────────────── 60° liquid-cooled V-twin (Indian FTR) ─────────────────────────────

export interface VTwin60Opts {
  crank: P3;
  /** Front cylinder lean from vertical (forward); rear = front − 60°. */
  frontDeg: number;
  barrelH: number;
  headH: number;
  fins: number;
  fin: EngineFinishes;
  camText?: string;
}

export function buildVTwin60(ctx: KitContext, o: VTwin60Opts): Port[] {
  const f = o.fin;
  const ports: Port[] = [];
  const c = V(...o.crank);
  crankcase(ctx, c, { zf: c.z - 0.16, zr: c.z + 0.3, width: 0.21, top: 0.07, bottom: 0.13, f: f.case });
  const rearDeg = o.frontDeg - 60;
  for (const [deg, front] of [[o.frontDeg, true], [rearDeg, false]] as const) {
    const fr = cylFrame(o.crank, deg);
    const b0 = 0.07, b1 = b0 + o.barrelH, h1 = b1 + o.headH;
    // Liquid-cooled: cleaner barrel with shallow ribs, bolted heads with a big painted cam cover
    finStack(ctx, fr, { d0: b0, d1: b1, w: 0.118, depth: 0.112, n: o.fins, finT: 0.003, fin: f.block, core: f.block, edge: f.edge, r: 0.02, coreK: 0.93 });
    ctx.add('chassis', roundBox(0.132, o.headH, 0.138, 0.024, 2), f.block, fr.m(b1 + o.headH / 2));
    ctx.add('chassis', roundBox(0.14, 0.05, 0.146, 0.022, 2), f.cam, fr.m(h1 + 0.018));
    ctx.add('chassis', roundBox(0.112, 0.012, 0.108, 0.006, 1), vary(f.cam, { rough: 0.3 }), fr.m(h1 + 0.045));
    if (o.camText && ctx.micro) {
      const r = ctx.label(o.camText, { color: '#e6e7e9', weight: '800' }, 48);
      for (const s of [-1, 1]) ctx.decal('chassis', r, 0.017, P(fr.at(h1 + 0.018, 0, s * 0.0705)), [s, 0, 0], P(fr.axis));
    }
    const sign = front ? -1 : 1;
    const pp = fr.at(b1 + o.headH * 0.35, sign * 0.082);
    const dir = fr.back.clone().multiplyScalar(sign).addScaledVector(fr.axis, -0.3).normalize();
    ports.push({ pos: P(pp), dir: P(dir), cyl: front ? 0 : 1 });
    ctx.add('chassis', lathe([[0.02, 0], [0.036, 0], [0.036, 0.012], [0.02, 0.012]], { segs: ctx.seg(20, 8), axis: 'z', sharp: true }), vary(F.steel, { rough: 0.35 }), mul(T(...P(pp)), fr.rot));
    // Plug coils on top
    ctx.add('chassis', lathe([[0, 0], [0.016, 0], [0.016, 0.036], [0.012, 0.042], [0, 0.042]], { segs: ctx.seg(14, 6), axis: 'y', sharp: [1, 2] }), F.texturedBlack, mul(T(...P(fr.at(h1 + 0.055))), fr.rot));
  }
  // Throttle bodies in the V and the clutch / alternator covers
  ctx.add('chassis', roundBox(0.12, 0.08, 0.12, 0.03, 2), hard('#1a1b1e', 0.3, 0.5, 0.2), T(0, c.y + 0.22, c.z - 0.04));
  roundCover(ctx, [-0.105 - 0.012, c.y + 0.0, c.z + 0.03], 0.072, 0.03, -1, f.cover, f.trim);
  roundCover(ctx, [0.105 + 0.012, c.y - 0.005, c.z + 0.15], 0.1, 0.034, 1, f.cover, f.trim);
  ctx.add('chassis', lathe([[0, 0], [0.007, 0], [0.007, 0.07], [0, 0.07]], { segs: 8, axis: 'x', sharp: true }), F.steel, T(-0.135, c.y - 0.04, c.z + 0.22));
  ctx.add('chassis', lathe([[0, 0], [0.038, 0], [0.04, 0.006], [0.04, 0.07], [0.036, 0.078], [0, 0.08]], { segs: ctx.seg(22, 10), axis: 'y', sharp: [1, 3] }), hard('#18191c', 0.3, 0.3, 0.8), alongY([0.05, c.y - 0.1, c.z - 0.16], [0.05, c.y - 0.13, c.z - 0.23]));
  return ports;
}

