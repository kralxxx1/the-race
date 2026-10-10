import * as THREE from 'three';
import { RX, RZ, T, mul, type KitContext } from '../context';
import { MeshData, alongY, bolt, coil, extrude, lathe, rod, roundBox, roundRect, smooth2, sweep, tube, type P2, type P3 } from '../mesh';
import { F, hard, Micro, tint, vary, type Finish } from '../sink';
import { brakeLine, placeCaliper } from './brakes';
import { beam } from './frame';
import { sprocketPitchR } from './wheel';
import { rearLayout, type RearLayout } from './layout';

export function swingarmFinish(ctx: KitContext): Finish {
  const s = ctx.bp.swingarm;
  return hard(s.color, s.metal, s.rough, s.metal < 0.5 ? 0.9 : 0.25, s.metal > 0.5 ? Micro.cast : Micro.plain);
}

export function buildRear(ctx: KitContext): void {
  const R = rearLayout(ctx);
  buildSwingarm(ctx, R);
  buildShock(ctx, R);
  buildDrive(ctx, R);
  buildRearBrake(ctx, R);
  buildFootrests(ctx);
  buildKickstand(ctx);
}

function buildSwingarm(ctx: KitContext, R: RearLayout): void {
  const bp = ctx.bp;
  const hp = ctx.hp;
  const pv = hp.pivot;
  const fin = swingarmFinish(ctx);
  const Rr = hp.Rr;
  const seg = ctx.seg(10, 4);
  const type = bp.swingarm.type;
  // Pivot tube across the frame
  ctx.add('swingarm', rod([-R.pivotX - 0.03, pv[1], pv[2]], [R.pivotX + 0.03, pv[1], pv[2]], 0.026, 0.026, ctx.seg(20, 10)), fin);
  if (type === 'scooter') {
    // Engine/CVT unit doubles as the swingarm on the left.
    ctx.add('swingarm', roundBox(0.1, 0.16, -pv[2] + 0.06, 0.04, 2), vary(F.castAlu, { color: tint(F.castAlu, '#4a4d52').color }), T(-R.tyreHalf - 0.06, Rr + 0.03, pv[2] / 2));
    return;
  }
  const arm = (s: number, h0: number, h1: number, w: number, curve: number) => {
    const x0 = s * R.pivotX;
    const x1 = s * R.armX;
    const path: P3[] = [
      [x0, pv[1], pv[2] + 0.02],
      [x0 + (x1 - x0) * 0.6, pv[1] + (Rr - pv[1]) * 0.3 + curve, pv[2] * 0.62],
      [x1, Rr + (pv[1] - Rr) * 0.25 + curve * 0.5, pv[2] * 0.25],
      [x1, Rr, 0.035],
    ];
    ctx.add('swingarm', beam(path, h0, w, [1, 0.88, 0.75, h1 / h0], seg, 0.01), fin);
  };
  if (type === 'singleSided' || type === 'shaft') {
    const s = R.ss || -1;
    // Front yoke spanning both pivot lugs
    ctx.add('swingarm', beam([[-R.pivotX, pv[1], pv[2] + 0.02], [0, pv[1] + 0.01, pv[2] + 0.08], [R.pivotX, pv[1], pv[2] + 0.02]], 0.1, 0.06, null, seg, 0.015), fin);
    if (type === 'shaft') {
      // Paralever: round tube housing the shaft, bevel box at the hub, torque strut below.
      const x = s * R.armX;
      ctx.add('swingarm', tube([[s * R.pivotX, pv[1], pv[2] + 0.04], [x, pv[1] - 0.02, pv[2] * 0.5], [x, Rr, -0.06]], 0.035, ctx.seg(18, 8), 8), fin);
      ctx.add('swingarm', lathe([[0, -0.05], [0.07, -0.045], [0.085, -0.01], [0.08, 0.035], [0.05, 0.05], [0, 0.05]], { segs: ctx.seg(28, 10), axis: 'x' }), fin, T(x, Rr, 0));
      ctx.add('swingarm', rod([x * 0.9, Rr - 0.07, -0.02], [s * R.pivotX, pv[1] - 0.12, pv[2] + 0.05], 0.014, 0.014, 10), F.black);
      return;
    }
    const x0 = s * R.pivotX, x1 = s * R.armX;
    // Big cast arm sweeping out to the hub carrier
    ctx.add('swingarm', beam([[x0, pv[1] + 0.005, pv[2] + 0.06], [x0 + (x1 - x0) * 0.8, pv[1] - 0.015, pv[2] * 0.55], [x1, Rr + 0.02, pv[2] * 0.18], [x1, Rr, -0.02]], 0.13, 0.055, [1, 0.92, 0.85, 0.95], seg, 0.02), fin);
    // Lower brace (truss) under the arm
    ctx.add('swingarm', beam([[x0, pv[1] - 0.05, pv[2] + 0.1], [x1, pv[1] - 0.09, pv[2] * 0.55], [x1, Rr - 0.06, pv[2] * 0.15]], 0.04, 0.035, [1, 0.9, 1.1], seg, 0.01), fin);
    // Eccentric hub housing
    ctx.add('swingarm', lathe([[0.04, -0.035], [0.085, -0.035], [0.092, -0.025], [0.092, 0.025], [0.085, 0.035], [0.04, 0.035]], { segs: ctx.seg(36, 12), axis: 'x', sharp: [1, 4] }), fin, T(x1, Rr, 0));
    if (ctx.micro) {
      ctx.add('swingarm', lathe([[0.0, 0.0], [0.04, 0], [0.04, 0.012], [0, 0.012]], { segs: 12, axis: 'x', sharp: true }), F.steel, mul(T(x1 + s * 0.035, Rr, 0), s > 0 ? new THREE.Matrix4() : new THREE.Matrix4().makeScale(-1, 1, 1)));
      for (let i = 0; i < 2; i++) ctx.add('swingarm', bolt(0.007, 0.01), F.steel, mul(T(x1, Rr + 0.07, -0.03 + i * 0.06), RZ(s > 0 ? -Math.PI / 2 : Math.PI / 2), T(0, 0.03, 0)));
    }
    return;
  }
  const banana = type === 'banana';
  for (const s of [-1, 1]) {
    arm(s, type === 'tubular' ? 0.05 : 0.11, type === 'tubular' ? 0.04 : 0.058, type === 'tubular' ? 0.04 : 0.045, banana && s > 0 ? 0.05 : 0);
    if (type === 'braced') {
      // Underslung truss + uprights
      const lowA: P3 = [s * R.pivotX, pv[1] - 0.06, pv[2] + 0.1];
      const lowB: P3 = [s * R.armX, Rr - 0.04, pv[2] * 0.42];
      ctx.add('swingarm', beam([lowA, [s * (R.pivotX + R.armX) / 2, (lowA[1] + lowB[1]) / 2 - 0.03, (lowA[2] + lowB[2]) / 2], lowB, [s * R.armX, Rr - 0.005, pv[2] * 0.2]], 0.034, 0.03, null, seg, 0.008), fin);
    }
    // Chain adjuster block + axle end
    ctx.add('swingarm', roundBox(0.02, 0.045, 0.07, 0.006), vary(F.brushedAlu, { micro: Micro.brushed }), T(s * (R.armX + 0.024), Rr, 0.01));
    if (ctx.micro) {
      ctx.add('swingarm', rod([s * (R.armX + 0.02), Rr, 0.055], [s * (R.armX + 0.02), Rr, 0.085], 0.004, 0.004, 6), F.steel);
      ctx.add('swingarm', lathe([[0, 0], [0.0075, 0], [0.0075, 0.006], [0, 0.006]], { segs: 6, axis: 'z', sharp: true }), F.steel, T(s * (R.armX + 0.02), Rr, 0.085));
    }
  }
  // Cross member in front of the tyre
  ctx.add('swingarm', beam([[-R.pivotX + 0.01, pv[1] + 0.005, pv[2] + 0.11], [R.pivotX - 0.01, pv[1] + 0.005, pv[2] + 0.11]], 0.07, 0.05, null, 2, 0.012), fin);
  // Chain slider on the chain-side arm
  const cs = R.chainSide;
  ctx.add('swingarm', roundBox(0.012, 0.03, 0.16, 0.005), F.texturedBlack, T(cs * (R.armX - 0.03), pv[1] + 0.05, pv[2] + 0.12));
  // Hugger / chain guard handled by the body (see kit/body hugger()).
}

function buildShock(ctx: KitContext, R: RearLayout): void {
  const bp = ctx.bp;
  const hp = ctx.hp;
  const pv = hp.pivot;
  const sh = bp.shock;
  if (sh.layout === 'none') return;
  const springFin = hard(sh.springColor, 0.35, 0.35, 0.9);
  const bodyFin = vary(tint(F.castAlu, sh.bodyColor), { micro: Micro.anodised });
  const shock = (a: P3, b: P3, r: number, reservoir: boolean) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const m = alongY(a, b);
    const body = new MeshData();
    body.append(lathe([[0, 0], [0.012, 0], [0.012, 0.02], [r * 0.55, 0.03], [r * 0.55, len * 0.55], [r * 0.62, len * 0.58], [r * 0.62, len - 0.03], [0.014, len - 0.02], [0.014, len], [0, len]], { segs: ctx.seg(20, 8), axis: 'y', sharp: [3, 5, 7] }));
    ctx.add('chassis', body, bodyFin, m);
    // Damper rod (chrome) visible at the bottom
    ctx.add('chassis', rod([0, 0.02, 0], [0, len * 0.5, 0], 0.007, 0.007, 10), F.chrome, m);
    const spring = coil(r, r * 0.16, len * 0.62, 7, ctx.seg(18, 8), ctx.micro ? 8 : 5);
    ctx.add('chassis', spring, springFin, mul(m, T(0, len * 0.18, 0)));
    // Preload collar
    ctx.add('chassis', lathe([[r * 0.6, 0], [r * 1.18, 0], [r * 1.18, 0.012], [r * 0.6, 0.012]], { segs: ctx.seg(20, 8), axis: 'y', sharp: true }), bodyFin, mul(m, T(0, len * 0.8, 0)));
    if (reservoir) {
      const resA = new THREE.Vector3(...a).lerp(new THREE.Vector3(...b), 0.85).add(new THREE.Vector3(0.05, 0, 0.02));
      const resB = resA.clone().add(new THREE.Vector3(0.0, -0.12, -0.02));
      ctx.add('chassis', rod([resA.x, resA.y, resA.z], [resB.x, resB.y, resB.z], 0.021, 0.021, ctx.seg(18, 8)), bodyFin);
      ctx.add('chassis', lathe([[0, 0], [0.013, 0], [0.013, 0.01], [0, 0.01]], { segs: 14, axis: 'y', sharp: true }), F.goldAnod, T(resB.x, resB.y - 0.01, resB.z));
    }
  };
  if (sh.layout === 'twin') {
    for (const s of [-1, 1]) {
      const a: P3 = [s * (R.armX + 0.03), hp.Rr + 0.07, -0.05];
      const b: P3 = [s * (R.armX + 0.01), hp.seatY - 0.07, hp.seatBack - 0.14];
      shock(a, b, 0.032, sh.reservoir);
    }
    return;
  }
  const x = sh.layout === 'monoSide' ? (bp.swingarm.side === 'right' ? 0.07 : -0.07) : 0;
  const top: P3 = [x, pv[1] + 0.3, pv[2] + 0.0];
  const bot: P3 = [x * 0.6, pv[1] - 0.04, pv[2] + 0.16];
  shock(bot, top, 0.034, sh.reservoir);
  // Linkage: rocker + dog-bones to the swingarm
  if (ctx.micro) {
    const rocker: P3 = [0, pv[1] - 0.09, pv[2] + 0.12];
    ctx.add('chassis', roundBox(0.06, 0.03, 0.08, 0.01), F.castAlu, T(...rocker));
    for (const s of [-1, 1]) ctx.add('chassis', rod([s * 0.03, rocker[1], rocker[2] - 0.03], [s * 0.03, pv[1] - 0.06, pv[2] - 0.04], 0.008, 0.008, 8), F.castAlu);
  }
}

/**
 * Chain loop (z, y) around two sprockets: top run c1 → c2, wrap round the far
 * side of c2, bottom run back, wrap round the front of c1. Outer tangent normals
 * satisfy n·(c2 − c1) = r1 − r2.
 */
export function chainLoop(c1: P2, r1: number, c2: P2, r2: number, n: number): P2[] {
  const dz = c2[0] - c1[0], dy = c2[1] - c1[1];
  const d = Math.hypot(dz, dy);
  const th = Math.atan2(dy, dz);
  const k = Math.acos(Math.max(-1, Math.min(1, (r1 - r2) / d)));
  const nTop = th + k;
  const nBot = th - k;
  const pts: P2[] = [];
  const arc = (c: P2, r: number, a0: number, a1: number) => {
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      pts.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]);
    }
  };
  arc(c2, r2, nTop, nBot);
  arc(c1, r1, nBot, nTop - Math.PI * 2);
  return pts;
}

function buildDrive(ctx: KitContext, R: RearLayout): void {
  const bp = ctx.bp;
  const hp = ctx.hp;
  const pv = hp.pivot;
  const d = bp.drive;
  if (d.type === 'none' || d.type === 'shaft') return;
  const side = R.chainSide;
  const x = side * R.chainX;
  const pitch = d.pitch ?? 0.015875;
  const r1 = d.type === 'belt' ? (d.frontTeeth * 0.014) / (Math.PI * 2) : sprocketPitchR(d.frontTeeth, pitch);
  const r2 = d.type === 'belt' ? (d.rearTeeth * 0.014) / (Math.PI * 2) : sprocketPitchR(d.rearTeeth, pitch);
  const c1: P2 = [pv[2] - 0.075, pv[1] - 0.03];
  const c2: P2 = [0, hp.Rr];
  // Front sprocket + cover on the engine (chassis)
  const fs = lathe([[0.02, -0.006], [r1 + 0.004, -0.006], [r1 + 0.004, 0.006], [0.02, 0.006]], { segs: Math.max(8, d.frontTeeth * (ctx.micro ? 2 : 1)), axis: 'x', sharp: [1, 2] });
  ctx.add('chassis', fs, F.steel, T(x, c1[1], c1[0]));
  ctx.add('chassis', lathe([[0, -0.012], [r1 + 0.03, -0.012], [r1 + 0.035, 0.0], [r1 + 0.02, 0.016], [0, 0.018]], { segs: ctx.seg(28, 10), axis: 'x' }).transform(side > 0 ? new THREE.Matrix4() : new THREE.Matrix4().makeScale(-1, 1, 1)), vary(F.engineBlack, {}), T(x + side * 0.02, c1[1], c1[0]));
  // Loop in the swingarm frame (chain follows the arm when it moves).
  const loop = chainLoop(c1, r1 + 0.004, c2, r2 + 0.004, ctx.seg(16, 6));
  const loop3: P3[] = loop.map(([z, y]) => [x, y, z] as P3);
  if (d.type === 'belt') {
    const prof = roundRect(0.008, 0.028, 0.002, 1);
    ctx.add('swingarm', sweep(dense(loop3, 0.01), prof, { closedPath: true, up: [1, 0, 0] }), F.rubber);
    return;
  }
  const chainFin: Finish = d.chainColor ? hard(d.chainColor, 1, 0.35, 0, Micro.brushed) : vary(F.steel, { rough: 0.45 });
  if (ctx.q.chainLinks) {
    const pts = dense(loop3, 0.002);
    // Cumulative arc length
    const cum: number[] = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
    const total = cum[cum.length - 1];
    const count = Math.floor(total / pitch);
    const inner = linkPlate(pitch, 0.0115, 0.0013);
    const outer = linkPlate(pitch, 0.0118, 0.0014);
    const roller = lathe([[0.0, -0.0062], [0.0051, -0.0062], [0.0051, 0.0062], [0, 0.0062]], { segs: 8, axis: 'x', sharp: true });
    const pin = lathe([[0.0, -0.0115], [0.0026, -0.0115], [0.0026, 0.0115], [0, 0.0115]], { segs: 6, axis: 'x', sharp: true });
    const links = new MeshData();
    const rollers = new MeshData();
    let j = 0;
    for (let i = 0; i < count; i++) {
      const s0 = i * pitch;
      while (j < cum.length - 2 && cum[j + 1] < s0) j++;
      const t = (s0 - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
      const p = pts[j], q = pts[j + 1];
      const pos = new THREE.Vector3(p[0], p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t);
      const ang = Math.atan2(q[1] - p[1], q[2] - p[2]);
      // Link frame: plate long axis along the chain (z), centred half a pitch ahead.
      const m = mul(T(pos.x, pos.y, pos.z), RX(-ang), T(0, 0, pitch / 2));
      const plate = i % 2 === 0 ? inner : outer;
      const off = i % 2 === 0 ? 0.0055 : 0.0072;
      links.append(plate.clone().transform(mul(m, T(off, 0, 0))));
      links.append(plate.clone().transform(mul(m, T(-off, 0, 0))));
      rollers.append(roller.clone().transform(mul(T(pos.x, pos.y, pos.z))));
      if (i % 2 === 1) rollers.append(pin.clone().transform(T(pos.x, pos.y, pos.z)));
    }
    ctx.add('swingarm', links, chainFin);
    ctx.add('swingarm', rollers, vary(F.steel, { rough: 0.3, color: tint(F.steel, '#8a8e94').color }));
  } else {
    const prof = roundRect(0.0115, 0.02, 0.003, 1);
    ctx.add('swingarm', sweep(dense(loop3, 0.01), prof, { closedPath: true, up: [1, 0, 0] }), chainFin);
  }
  // Chain guard over the top run near the sprocket
  ctx.add('swingarm', roundBox(0.006, 0.035, 0.22, 0.004), F.texturedBlack, T(x + side * 0.016, hp.Rr + r2 + 0.025, -0.16));
}

/** Resample a closed polyline to ~step spacing. */
function dense(pts: readonly P3[], step: number): P3[] {
  const out: P3[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const n = Math.max(1, Math.ceil(l / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
  }
  return out;
}

/** "Figure-8" chain side plate in the YZ plane, thickness along X. */
function linkPlate(pitch: number, h: number, thick: number): MeshData {
  const r = h / 2;
  const pts: P2[] = [];
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI;
    pts.push([pitch / 2 + Math.cos(a) * r, Math.sin(a) * r]);
  }
  pts.push([0, r * 0.72]);
  for (let i = 0; i <= n; i++) {
    const a = Math.PI / 2 + (i / n) * Math.PI;
    pts.push([-pitch / 2 + Math.cos(a) * r, Math.sin(a) * r]);
  }
  pts.push([0, -r * 0.72]);
  return extrude(pts, thick, { plane: 'zy', bevel: 0 });
}

function buildRearBrake(ctx: KitContext, R: RearLayout): void {
  const bp = ctx.bp;
  const b = bp.rearBrake;
  if (b.caliper === 'drum' || b.discs === 0) return;
  const discSide = R.ss ? R.ss : (-R.chainSide as 1 | -1);
  const x = discSide * (R.ss ? R.discX : R.discX);
  const angle = ((b.caliperAngleDeg ?? 205) * Math.PI) / 180;
  const port = placeCaliper(ctx, 'swingarm', b, false, ctx.hp.rearAxle, x, angle);
  // Caliper hanger / torque arm
  const hb = new THREE.Vector3(x + discSide * 0.035, ctx.hp.Rr + Math.cos(angle) * (b.discDia / 2 - 0.01), Math.sin(angle) * (b.discDia / 2 - 0.01));
  ctx.add('swingarm', rod([hb.x, hb.y, hb.z], [discSide * R.armX, ctx.hp.Rr - 0.02, ctx.hp.pivot[2] * 0.35], 0.008, 0.008, 8), F.castAlu);
  // Rear master cylinder near the right footrest + line
  const peg = bp.rider.peg;
  const mc: P3 = [Math.abs(peg[0]) - 0.02, peg[1] - 0.06, peg[2] + 0.04];
  ctx.add('chassis', rod(mc, [mc[0], mc[1] - 0.07, mc[2] + 0.01], 0.011, 0.011, 12), F.castAlu);
  ctx.add('chassis', lathe([[0, 0], [0.015, 0], [0.015, 0.035], [0, 0.035]], { segs: 14, axis: 'y', sharp: [1, 2] }), hard('#2a2a28', 0, 0.2, 1), T(mc[0], mc[1] + 0.06, mc[2] + 0.02));
  if (ctx.micro) brakeLine(ctx, 'swingarm', [[mc[0], mc[1] - 0.07, mc[2] + 0.01], [discSide * (R.armX + 0.01), ctx.hp.pivot[1] - 0.05, ctx.hp.pivot[2] * 0.6], port], true);
}

/** Rearsets (machined hangers, knurled pegs, heel guards, pedals) or plain pegs / floorboards. */
function buildFootrests(ctx: KitContext): void {
  const bp = ctx.bp;
  const hp = ctx.hp;
  const peg = bp.rider.peg;
  const type = bp.footrests;
  if (type === 'scooter') return;
  for (const s of [-1, 1]) {
    const P: P3 = [s * Math.abs(peg[0]), peg[1], peg[2]];
    if (type === 'floorboard') {
      const board = roundBox(0.11, 0.025, 0.3, 0.01, 2);
      ctx.add('chassis', board, F.chrome, T(P[0] + s * 0.04, P[1] - 0.015, P[2] - 0.05));
      ctx.add('chassis', roundBox(0.1, 0.012, 0.28, 0.005), F.rubber, T(P[0] + s * 0.04, P[1] + 0.002, P[2] - 0.05));
      ctx.add('chassis', rod([s * 0.13, P[1] - 0.02, P[2] - 0.05], [P[0], P[1] - 0.02, P[2] - 0.05], 0.012, 0.012, 10), F.chrome);
      continue;
    }
    // Hanger plate from the frame to the peg
    const plateFin = type === 'rearset' ? vary(tint(F.brushedAlu, '#26282c'), { micro: Micro.anodised }) : F.castAlu;
    const pv = hp.pivot;
    const hx = s * (Math.abs(peg[0]) - 0.03);
    const outline = smooth2(
      [
        [P[2] + 0.03, P[1] + 0.02],
        [pv[2] - 0.02, pv[1] + 0.06],
        [pv[2] + 0.05, pv[1] + 0.02],
        [P[2] + 0.07, P[1] - 0.035],
        [P[2] - 0.01, P[1] - 0.03],
      ],
      ctx.micro ? 4 : 2,
      true,
    );
    ctx.add('chassis', extrude(outline, 0.008, { plane: 'zy', bevel: 0.002, center: hx }), plateFin);
    // Heel guard
    if (type === 'rearset') {
      const hg = smooth2([[P[2] + 0.02, P[1] + 0.01], [P[2] + 0.09, P[1] + 0.11], [P[2] + 0.13, P[1] + 0.1], [P[2] + 0.07, P[1] - 0.01]], 3, true);
      ctx.add('chassis', extrude(hg, 0.004, { plane: 'zy', center: hx + s * 0.007 }), plateFin);
    }
    // Knurled peg
    const pegLen = 0.075;
    const pegFin = vary(F.knurled, { color: tint(F.knurled, type === 'rearset' ? '#2c2e33' : '#9ea3a9').color });
    ctx.add('chassis', lathe([[0, 0], [0.011, 0], [0.012, 0.004], [0.012, pegLen - 0.006], [0.01, pegLen], [0, pegLen]], { segs: ctx.seg(16, 8), axis: 'y', sharp: [1] }), pegFin, mul(T(hx, P[1], P[2]), RZ(s > 0 ? -Math.PI / 2 : Math.PI / 2)));
    // Pedal: gear lever (left) / brake pedal (right)
    const pivot: P3 = [hx + s * 0.01, P[1] - 0.005, P[2] + 0.01];
    const toe: P3 = [hx + s * 0.035, P[1] - 0.005, P[2] - 0.17];
    const lev = tube([pivot, [pivot[0], pivot[1] - 0.012, pivot[2] - 0.08], toe], 0.0065, ctx.seg(10, 6), 6);
    ctx.add('chassis', lev, plateFin);
    ctx.add('chassis', lathe([[0, 0], [0.008, 0], [0.008, 0.04], [0, 0.04]], { segs: 12, axis: 'y', sharp: true }), pegFin, mul(T(toe[0], toe[1], toe[2]), RZ(s > 0 ? -Math.PI / 2 : Math.PI / 2)));
    if (s < 0) {
      // Gear linkage rod up to the shift shaft (+ quickshifter body on sporty bikes)
      const shaft: P3 = [s * 0.13, P[1] + 0.03, pv[2] - 0.18];
      ctx.add('chassis', rod([hx + s * 0.012, P[1] + 0.02, P[2] - 0.06], shaft, 0.004, 0.004, 8), F.steel);
      if (ctx.spec.quickshifter) ctx.add('chassis', rod([hx + s * 0.012, P[1] + 0.02, P[2] - 0.04], [hx + s * 0.012, P[1] + 0.025, P[2] - 0.1], 0.0085, 0.0085, 10), F.black);
    }
    // Pillion pegs
    if (bp.seat.pillion === 'seat' && type !== 'peg') {
      const pp: P3 = [s * (Math.abs(peg[0]) + 0.02), peg[1] + 0.08, peg[2] + 0.25];
      ctx.add('chassis', rod([s * 0.1, pp[1] + 0.05, pp[2] - 0.03], [pp[0], pp[1], pp[2]], 0.008, 0.008, 8), F.castAlu);
      ctx.add('chassis', lathe([[0, 0], [0.01, 0], [0.01, 0.06], [0, 0.06]], { segs: 10, axis: 'y', sharp: true }), F.rubber, mul(T(...pp), RZ(s > 0 ? -Math.PI / 2 : Math.PI / 2)));
    }
  }
}

function buildKickstand(ctx: KitContext): void {
  if (ctx.bp.footrests === 'scooter') return;
  const pv = ctx.hp.pivot;
  const peg = ctx.bp.rider.peg;
  const a: P3 = [-Math.abs(peg[0]) + 0.02, 0.24, pv[2] - 0.12];
  const b: P3 = [-Math.abs(peg[0]) - 0.025, 0.21, pv[2] + 0.2];
  ctx.add('chassis', tube([a, [(a[0] + b[0]) / 2, 0.215, (a[2] + b[2]) / 2], b], 0.0095, ctx.seg(10, 5), 4), F.black);
  ctx.add('chassis', roundBox(0.03, 0.008, 0.05, 0.003), F.black, T(b[0], b[1] - 0.004, b[2]));
}

/** Plate hanger with Turkish plate, plate light and stalk indicators. */
export function plateHanger(ctx: KitContext, opts: { fromZ?: number; fromY?: number } = {}): void {
  const bp = ctx.bp;
  const p = bp.plate;
  const tilt = (p.tiltDeg * Math.PI) / 180;
  const W = 0.15, H = 0.12;
  const group = p.mount === 'swingarm' ? 'swingarm' : 'chassis';
  const m = mul(T(...p.pos), RX(tilt));
  // Plate (own slot so it can use the plate texture)
  const quad = new MeshData();
  quad.v(-W / 2, -H / 2, 0.002, 0, 0, 1, 0, 0);
  quad.v(W / 2, -H / 2, 0.002, 0, 0, 1, 1, 0);
  quad.v(W / 2, H / 2, 0.002, 0, 0, 1, 1, 1);
  quad.v(-W / 2, H / 2, 0.002, 0, 0, 1, 0, 1);
  quad.t(0, 1, 2);
  quad.t(0, 2, 3);
  ctx.add(group, quad.orient(), F.plate, m);
  ctx.add(group, roundBox(W + 0.012, H + 0.012, 0.006, 0.004), F.texturedBlack, mul(m, T(0, 0, -0.002)));
  if (p.mount === 'fender' || p.mount === 'body') return;
  // Hanger arm from under the tail to the plate
  const fromZ = opts.fromZ ?? bp.seat.back - 0.05;
  const fromY = opts.fromY ?? bp.seat.height - 0.08;
  const top = new THREE.Vector3(0, H / 2 + 0.01, -0.01).applyMatrix4(m);
  const arm = smooth2([[fromZ - 0.08, fromY], [fromZ + 0.02, fromY + 0.01], [top.z + 0.02, top.y + 0.02], [top.z - 0.03, top.y], [fromZ - 0.06, fromY - 0.05]], ctx.micro ? 3 : 2, true);
  ctx.add(group, extrude(arm, 0.12, { plane: 'zy', bevel: 0.006 }), F.texturedBlack);
  // Plate light
  ctx.add(group, roundBox(0.04, 0.012, 0.02, 0.004), F.lens, mul(m, T(0, H / 2 + 0.012, 0.012)));
  // Stalk indicators
  if (bp.lights.rearIndicators === 'stalk') {
    for (const s of [-1, 1]) {
      const base = new THREE.Vector3(s * 0.06, H / 2 + 0.005, -0.01).applyMatrix4(m);
      const tip: P3 = [base.x + s * 0.09, base.y + 0.008, base.z + 0.01];
      ctx.add(group, rod([base.x, base.y, base.z], tip, 0.0055, 0.0045, 8), F.texturedBlack);
      const pod = lathe([[0, -0.012], [0.009, -0.01], [0.011, 0.004], [0.009, 0.012], [0, 0.014]], { segs: ctx.seg(14, 8), axis: 'x' });
      ctx.add(group, pod, F.texturedBlack, T(tip[0], tip[1], tip[2]));
      ctx.add(group, lathe([[0, 0.0], [0.009, 0.0], [0.007, 0.006], [0, 0.007]], { segs: ctx.seg(14, 8), axis: 'z' }), F.indicator, T(tip[0], tip[1], tip[2] + 0.004));
    }
  }
}

/** Rear hugger over the front-top of the tyre (swingarm-mounted) — shared by many bodies. */
export function hugger(ctx: KitContext, fin: Finish, from = -0.2, to = 1.15): void {
  const R = rearLayout(ctx);
  const hp = ctx.hp;
  const r = hp.Rr + 0.028;
  const w = R.tyreHalf + 0.018;
  // Profile [radial, lateral]: outer skin left → right, inner skin back.
  const prof: P2[] = [];
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const x = -w + (2 * w * i) / n;
    prof.push([-0.045 * Math.pow(Math.abs(x) / w, 3), x]);
  }
  for (let i = n; i >= 0; i--) {
    const x = (-w + (2 * w * i) / n) * 0.985;
    prof.push([-0.045 * Math.pow(Math.abs(x) / w, 3) - 0.003, x]);
  }
  const path: P3[] = [];
  const steps = ctx.seg(18, 6);
  for (let i = 0; i <= steps; i++) {
    const b = from + ((to - from) * i) / steps;
    path.push([0, hp.Rr + Math.cos(b) * r, -Math.sin(b) * r]);
  }
  ctx.add('swingarm', sweep(path, prof, { up: [0, 1, 0], capStart: true, capEnd: true }), fin);
}
