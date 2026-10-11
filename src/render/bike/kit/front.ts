import * as THREE from 'three';
import { RX, RZ, T, mul, type KitContext } from '../context';
import { MeshData, bolt, extrude, lathe, rod, roundBox, smooth2, tube, type P2, type P3 } from '../mesh';
import { F, hard, Micro, tint, vary, type Finish } from '../sink';
import { brakeLine, placeCaliper } from './brakes';

/**
 * Front suspension in steering-local coordinates: Y runs up the steering axis
 * (0 = top of the fork tubes), fork tubes sit at z = −offset, x = ±spacing/2.
 */
export interface ForkLayout {
  half: number;
  z: number;
  outerR: number;
  innerR: number;
  /** Top of the top clamp (local y). */
  topClampY: number;
  topClampT: number;
  bottomClampY: number;
  bottomClampT: number;
  /** Bottom of the upper (outer on USD, stanchion on RWU) tube. */
  upperBottomY: number;
  /** Axle (local y). */
  axleY: number;
}

export function forkLayout(ctx: KitContext): ForkLayout {
  const f = ctx.bp.fork;
  const fl = ctx.hp.forkLen;
  const above = f.aboveClamp ?? 0.012;
  const gap = f.clampGap ?? 0.2;
  const usd = f.type === 'usd';
  const outerR = usd ? f.stanchion / 2 + 0.0085 : f.stanchion / 2;
  return {
    half: f.spacing / 2,
    z: -ctx.hp.offset,
    outerR,
    innerR: f.stanchion / 2,
    topClampY: -above,
    topClampT: 0.028,
    bottomClampY: -above - gap,
    bottomClampT: 0.045,
    upperBottomY: usd ? -Math.min(fl - 0.22, gap + 0.3) : -(fl - 0.33),
    axleY: -fl,
  };
}

export function buildFork(ctx: KitContext): ForkLayout {
  const L = forkLayout(ctx);
  const f = ctx.bp.fork;
  const usd = f.type === 'usd';
  const seg = ctx.seg(28, 10);
  const outerFin: Finish = vary(tint(F.gunmetal, f.outerColor), { metal: 0.85, rough: 0.28, coat: 0.6, micro: Micro.anodised });
  const innerFin: Finish = usd ? vary(tint(F.chrome, f.innerColor), { rough: 0.12 }) : vary(F.chrome, { color: tint(F.chrome, f.innerColor).color });
  const footFin: Finish = vary(tint(F.castAlu, f.footColor), { micro: Micro.cast, coat: 0.3 });
  const capFin: Finish = vary(tint(F.brushedAlu, f.capColor), { micro: Micro.anodised });
  const adjFin: Finish = vary(tint(F.goldAnod, f.adjusterColor ?? '#c99a2c'), { micro: Micro.knurl });
  const lower = (m: MeshData, fin: Finish) => ctx.addSteer('forkLower', m, fin);
  const upper = (m: MeshData, fin: Finish) => ctx.addSteer('steer', m, fin);
  for (const s of [-1, 1]) {
    const x = s * L.half;
    const at = (y: number): P3 => [x, y, L.z];
    if (usd) {
      // Outer tube: top cap → clamps → long anodised tube → seal-holder band.
      const rr = L.outerR;
      const prof: P2[] = [
        [0, 0.004],
        [rr - 0.003, 0.004],
        [rr - 0.001, 0],
        [rr - 0.001, L.topClampY - 0.004],
        [rr, L.topClampY - 0.006],
        [rr, L.upperBottomY + 0.07],
        [rr + 0.0035, L.upperBottomY + 0.062],
        [rr + 0.0035, L.upperBottomY + 0.008],
        [rr + 0.001, L.upperBottomY],
        [L.innerR + 0.0015, L.upperBottomY],
      ];
      upper(lathe(prof.reverse(), { segs: seg, axis: 'y', sharp: [4, 6, 8] }).transform(T(...at(0))), outerFin);
      // Dust seal
      upper(lathe([[L.innerR + 0.0005, L.upperBottomY - 0.009], [rr - 0.002, L.upperBottomY - 0.006], [rr - 0.001, L.upperBottomY + 0.001], [L.innerR + 0.0005, L.upperBottomY + 0.001]], { segs: seg, axis: 'y' }).transform(T(x, 0, L.z)), F.rubber);
      // Fork cap: hex nut + preload adjuster (+ rebound screw)
      upper(lathe([[0, 0], [rr - 0.004, 0], [rr - 0.004, 0.011], [0, 0.011]], { segs: 6, axis: 'y', sharp: true }).transform(T(x, 0.003, L.z)), capFin);
      upper(lathe([[0, 0], [0.012, 0], [0.012, 0.008], [0, 0.008]], { segs: ctx.micro ? 18 : 8, axis: 'y', sharp: true }).transform(T(x, 0.014, L.z)), adjFin);
      if (ctx.micro) upper(lathe([[0, 0], [0.005, 0], [0.005, 0.006], [0, 0.006]], { segs: 10, axis: 'y', sharp: true }).transform(T(x, 0.022, L.z)), capFin);
      // Stanchion (slides inside the outer tube)
      const top = L.upperBottomY + 0.06;
      const bot = L.axleY + 0.07;
      lower(rod(at(top), at(bot), L.innerR, L.innerR, seg, false), innerFin);
      // Axle bracket: fork foot with caliper lugs and axle pinch boss
      buildAxleBracket(ctx, s, L, footFin, lower);
      if (f.label && ctx.q.micro) {
        const r = ctx.label(f.label, { color: f.labelColor ?? '#1a1a1a', weight: '900', italic: true }, 56);
        const h = 0.012;
        const y = L.upperBottomY + 0.12;
        // Front-facing label wrapped around the tube; built in steer-local then mapped.
        const p = ctx.fromSteer([x + s * rr * 0.35, y, L.z - rr * 0.92]);
        const n = ctx.fromSteer([x + s * rr * 0.35, y, L.z - rr * 0.92 - 1]);
        const up = ctx.fromSteer([x, y + 1, L.z]);
        const o = ctx.fromSteer([x, y, L.z]);
        ctx.decal('steer', r, h, p, [n[0] - p[0], n[1] - p[1], n[2] - p[2]], [up[0] - o[0], up[1] - o[1], up[2] - o[2]], { bendR: rr });
      }
    } else {
      // Right-way-up: chrome stanchions in the clamps, alloy sliders below.
      upper(lathe(([[0, 0.006], [L.innerR - 0.002, 0.006], [L.innerR, 0.002], [L.innerR, L.upperBottomY - 0.06], [0, L.upperBottomY - 0.06]] as P2[]).reverse(), { segs: seg, axis: 'y', sharp: [1] }).transform(T(...at(0))), innerFin);
      const sr = L.innerR + 0.011;
      const slider: P2[] = [
        [0, L.axleY - 0.04],
        [sr * 0.9, L.axleY - 0.04],
        [sr, L.axleY - 0.02],
        [sr, L.upperBottomY - 0.01],
        [sr - 0.002, L.upperBottomY],
        [L.innerR + 0.004, L.upperBottomY + 0.004],
      ];
      lower(lathe(slider, { segs: seg, axis: 'y', sharp: [3] }).transform(T(x, 0, L.z)), footFin);
      if (f.gaiters) {
        const g: P2[] = [];
        const y0 = L.upperBottomY + 0.004, y1 = L.upperBottomY + 0.2;
        const folds = 10;
        for (let i = 0; i <= folds * 2; i++) g.push([L.innerR + (i % 2 ? 0.012 : 0.006), y0 + ((y1 - y0) * i) / (folds * 2)]);
        lower(lathe(g, { segs: seg, axis: 'y' }).transform(T(x, 0, L.z)), F.rubber);
      } else {
        lower(lathe([[L.innerR + 0.0005, L.upperBottomY - 0.004], [sr - 0.002, L.upperBottomY], [L.innerR + 0.003, L.upperBottomY + 0.01]], { segs: seg, axis: 'y' }).transform(T(x, 0, L.z)), F.rubber);
      }
      // Axle lug
      lower(lathe([[0, -0.02], [0.022, -0.02], [0.022, 0.02], [0, 0.02]], { segs: 18, axis: 'x', sharp: true }).transform(T(x + s * 0.004, L.axleY, L.z)), footFin);
      upper(lathe([[0, 0], [L.innerR - 0.002, 0], [L.innerR - 0.002, 0.01], [0, 0.01]], { segs: 6, axis: 'y', sharp: true }).transform(T(x, 0.004, L.z)), capFin);
      // Caliper lug on the slider
      lower(roundBox(0.024, 0.07, 0.035, 0.008).transform(T(x, L.axleY + 0.05, L.z + sr + 0.012)), footFin);
    }
  }
  if (!usd) {
    // Fork brace / fender bridge (RWU)
    const y = L.upperBottomY - 0.05;
    lower(roundBox(L.half * 2 - 0.03, 0.022, 0.03, 0.008).transform(T(0, y, L.z + 0.005)), footFin);
  }
  if (f.type === 'telelever') buildTelelever(ctx, L);
  buildClamps(ctx, L);
  return L;
}

function buildAxleBracket(ctx: KitContext, s: number, L: ForkLayout, fin: Finish, add: (m: MeshData, f: Finish) => void): void {
  const x = s * L.half;
  const r = L.innerR + 0.008;
  const seg = ctx.seg(24, 10);
  // Round sleeve into which the stanchion is pressed
  add(lathe(([[r - 0.002, L.axleY + 0.085], [r, L.axleY + 0.078], [r + 0.001, L.axleY + 0.01], [0, L.axleY + 0.01]] as P2[]).reverse(), { segs: seg, axis: 'y', sharp: [1] }).transform(T(x, 0, L.z)), fin);
  // Side profile of the foot: sleeve → axle boss → caliper lugs at the back (local +z).
  const zc = L.z;
  const prof: P2[] = smooth2(
    [
      [zc - r, L.axleY + 0.04],
      [zc - r * 0.9, L.axleY - 0.012],
      [zc - 0.006, L.axleY - 0.032],
      [zc + 0.02, L.axleY - 0.03],
      [zc + 0.05, L.axleY - 0.005],
      [zc + 0.062, L.axleY + 0.03],
      [zc + 0.064, L.axleY + 0.105],
      [zc + 0.05, L.axleY + 0.118],
      [zc + 0.035, L.axleY + 0.1],
      [zc + r * 0.8, L.axleY + 0.07],
    ],
    ctx.micro ? 4 : 2,
    true,
  );
  const w = 0.03;
  add(extrude(prof, w, { plane: 'zy', bevel: 0.006, bevelSegs: ctx.micro ? 2 : 1, center: x + s * 0.002, curveSegs: 1 }), fin);
  // Axle pinch boss + bolts
  add(lathe([[0, -0.024], [0.021, -0.024], [0.021, 0.024], [0, 0.024]], { segs: 20, axis: 'x', sharp: true }).transform(T(x + s * 0.002, L.axleY, L.z)), fin);
  if (ctx.micro) {
    for (const dy of [-0.013, 0.013]) {
      add(bolt(0.0045, 0.006).transform(mul(T(x + s * 0.002, L.axleY - 0.026, L.z + dy * 0.6 + 0.012), RX(Math.PI))), F.steel);
    }
    // Compression adjuster at the bottom of the leg (USD)
    add(lathe([[0, 0], [0.008, 0], [0.008, 0.007], [0, 0.007]], { segs: 12, axis: 'y', sharp: true }).transform(T(x, L.axleY - 0.03, L.z - 0.006)), F.goldAnod);
  }
}

/** Top & bottom triple clamps, steering stem nut, key/ignition barrel. */
function buildClamps(ctx: KitContext, L: ForkLayout): void {
  const c = ctx.bp.cockpit;
  const cast = c.topClamp === 'cast';
  const R1 = L.outerR + 0.011;
  const ctrl = (r1: number, back: number): P2[] => [
    [L.half + r1, L.z],
    [L.half + r1 * 0.7, L.z + r1 * 0.75],
    [L.half * 0.45, back * 0.75],
    [0.04, back],
    [0, back + 0.004],
    [-0.04, back],
    [-L.half * 0.45, back * 0.75],
    [-L.half - r1 * 0.7, L.z + r1 * 0.75],
    [-L.half - r1, L.z],
    [-L.half - r1 * 0.7, L.z - r1 * 0.72],
    [-L.half * 0.45, L.z - r1 * 0.92],
    [0, L.z - r1 * 0.86],
    [L.half * 0.45, L.z - r1 * 0.92],
    [L.half + r1 * 0.7, L.z - r1 * 0.72],
  ];
  const holes = (r: number, stem: number): P2[][] => {
    const h: P2[][] = [];
    for (const s of [-1, 1]) {
      const pts: P2[] = [];
      for (let i = 0; i < 28; i++) {
        const a = -(i / 28) * Math.PI * 2;
        pts.push([s * L.half + Math.cos(a) * r, L.z + Math.sin(a) * r]);
      }
      h.push(pts);
    }
    if (stem > 0) {
      const pts: P2[] = [];
      for (let i = 0; i < 20; i++) {
        const a = -(i / 20) * Math.PI * 2;
        pts.push([Math.cos(a) * stem, Math.sin(a) * stem]);
      }
      h.push(pts);
    }
    return h;
  };
  const topFin: Finish = cast ? vary(F.castAlu, { color: tint(F.castAlu, '#2a2c30').color }) : vary(F.brushedAlu, { color: tint(F.brushedAlu, ctx.bp.frame.type === 'monocoque' ? '#2b2d31' : '#b9bdc2').color, rough: 0.26 });
  const top = extrude(smooth2(ctrl(R1, 0.055), ctx.micro ? 6 : 3, true), L.topClampT, {
    plane: 'xz',
    holes: holes(L.outerR + 0.0006, 0.011),
    bevel: 0.004,
    bevelSegs: ctx.micro ? 2 : 1,
    center: L.topClampY - L.topClampT / 2,
    curveSegs: 2,
  });
  ctx.addSteer('steer', top, topFin);
  // Machined pockets on milled clamps: inset dark recesses read as milling.
  if (c.topClamp === 'milled' && ctx.micro) {
    for (const s of [-1, 1]) {
      const pk = smooth2([[s * 0.022, 0.012], [s * (L.half - R1 * 0.9), L.z + R1 * 0.95], [s * (L.half - R1 * 0.95), L.z + R1 * 1.25], [s * 0.03, 0.036]], 4, true);
      const pocket = extrude(pk, 0.002, { plane: 'xz', center: L.topClampY + 0.0005 });
      ctx.addSteer('steer', pocket, vary(topFin, { rough: 0.5 }));
    }
  }
  const bot = extrude(smooth2(ctrl(L.outerR + 0.016, 0.07), ctx.micro ? 6 : 3, true), L.bottomClampT, {
    plane: 'xz',
    holes: holes(L.outerR + 0.0006, 0),
    bevel: 0.006,
    bevelSegs: ctx.micro ? 2 : 1,
    center: L.bottomClampY - L.bottomClampT / 2,
    curveSegs: 2,
  });
  ctx.addSteer('steer', bot, vary(F.castAlu, { color: tint(F.castAlu, '#3a3d42').color }));
  // Steering stem between the clamps + big stem nut on top
  ctx.addSteer('steer', rod([0, L.bottomClampY - 0.02, 0], [0, L.topClampY, 0], 0.016, 0.016, 16), F.steel);
  ctx.addSteer('steer', lathe([[0, 0], [0.022, 0], [0.022, 0.012], [0.018, 0.016], [0, 0.016]], { segs: ctx.micro ? 6 : 6, axis: 'y', sharp: true }).transform(T(0, L.topClampY, 0)), vary(F.brushedAlu, { rough: 0.2 }));
  if (ctx.micro) {
    ctx.addSteer('steer', lathe([[0, 0], [0.008, 0], [0.008, 0.004], [0, 0.004]], { segs: 16, axis: 'y', sharp: true }).transform(T(0, L.topClampY + 0.016, 0)), F.black);
    // Pinch bolts behind the fork tubes on both clamps
    for (const s of [-1, 1]) {
      for (const [y, rr] of [[L.topClampY - L.topClampT / 2, R1], [L.bottomClampY - 0.012, L.outerR + 0.016], [L.bottomClampY - 0.032, L.outerR + 0.016]] as const) {
        ctx.addSteer('steer', bolt(0.005, 0.006, false, 8).transform(mul(T(s * (L.half + rr * 0.62), y, L.z + rr * 0.72), RZ(s > 0 ? -Math.PI / 2 : Math.PI / 2))), F.steel);
      }
    }
  }
}

/** BMW Telelever: A-arm from the engine to the lower fork bridge, central strut. */
function buildTelelever(ctx: KitContext, L: ForkLayout): void {
  const hp = ctx.hp;
  // Fork bridge (forkLower) carrying the ball joint
  const bridgeY = L.upperBottomY - 0.06;
  ctx.addSteer('forkLower', roundBox(L.half * 2 + 0.04, 0.05, 0.07, 0.018).transform(T(0, bridgeY, L.z + 0.03)), F.castAlu);
  // A-arm pivots on the engine front (chassis), ends at the bridge ball joint.
  const ball = ctx.fromSteer([0, bridgeY - hp.forkLen * 0 + 0.0, L.z + 0.06]);
  const eng = ctx.bp.engine.crank;
  const pivL: P3 = [-0.13, eng[1] + 0.12, eng[2] - 0.2];
  const pivR: P3 = [0.13, eng[1] + 0.12, eng[2] - 0.2];
  for (const p of [pivL, pivR]) ctx.add('chassis', tube([p, [p[0] * 0.6, (p[1] + ball[1]) / 2 + 0.02, (p[2] + ball[2]) / 2], [0, ball[1], ball[2] + 0.05]], 0.016, 12, 6), F.castAlu);
  // Central shock from the A-arm to the frame
  const sTop: P3 = [0, ball[1] + 0.32, ball[2] + 0.28];
  const sBot: P3 = [0, ball[1] + 0.02, ball[2] + 0.12];
  ctx.add('chassis', rod(sBot, sTop, 0.022, 0.022, 14), F.black);
  ctx.add('chassis', new MeshData().append(coilBetween(sBot, sTop, 0.03, 0.006, 7)), hard('#2b5fae', 0.3, 0.4, 0.8));
}

function coilBetween(a: P3, b: P3, R: number, wire: number, turns: number): MeshData {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = d.length();
  const pts: P3[] = [];
  const n = turns * 14;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const ang = t * turns * Math.PI * 2;
    pts.push([Math.cos(ang) * R, t * len * 0.8 + len * 0.1, Math.sin(ang) * R]);
  }
  const m = tube(pts, wire, 6, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m.transform(new THREE.Matrix4().compose(new THREE.Vector3(...a), q, new THREE.Vector3(1, 1, 1)));
}

/** Front calipers on the axle brackets + brake lines via a splitter on the bottom clamp. */
export function buildFrontBrakes(ctx: KitContext, L: ForkLayout, mcPort: P3 | null): void {
  const b = ctx.bp.frontBrake;
  if (b.caliper === 'drum' || b.discs === 0) return;
  const hp = ctx.hp;
  const angle = ((b.caliperAngleDeg ?? 78) * Math.PI) / 180 + hp.rake * 0.0;
  const sides = b.discs === 2 ? [-1, 1] : [-1];
  const hubHalf = 0.062;
  const ports: P3[] = [];
  for (const s of sides) {
    const x = s * (hubHalf + 0.008);
    ports.push(placeCaliper(ctx, 'forkLower', b, true, hp.frontAxle, x, angle));
  }
  // Splitter behind the bottom clamp (steer group); lines down the legs (forkLower).
  const split = ctx.fromSteer([0, L.bottomClampY - 0.03, 0.05]);
  const splitLow = ctx.fromSteer([0, L.bottomClampY - 0.06, L.z + 0.06]);
  if (mcPort) {
    const mid: P3 = [mcPort[0] * 0.6, (mcPort[1] + split[1]) / 2 + 0.03, (mcPort[2] + split[2]) / 2 - 0.05];
    brakeLine(ctx, 'steer', [mcPort, mid, split]);
  }
  ctx.add('steer', roundBox(0.03, 0.02, 0.02, 0.005), F.polishedAlu, T(split[0], split[1] - 0.005, split[2]));
  for (const p of ports) {
    const legTop = ctx.fromSteer([Math.sign(p[0]) * (L.half - 0.0), L.upperBottomY - 0.02, L.z + L.outerR + 0.018]);
    const legMid = ctx.fromSteer([Math.sign(p[0]) * (L.half - 0.0), L.axleY + 0.2, L.z + L.innerR + 0.02]);
    brakeLine(ctx, 'forkLower', [splitLow, [legTop[0] * 0.7, legTop[1], legTop[2]], legMid, p]);
  }
}


