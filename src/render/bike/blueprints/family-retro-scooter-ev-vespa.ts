import * as THREE from 'three';
import type { BikeSpec, Livery } from '../../../data/bikes';
import { RX, T, mul, type KitContext } from '../context';
import { PAINT, bodyQ, frontFender, shell } from '../kit/body';
import { placeCaliper } from '../kit/brakes';
import { buildCockpit } from '../kit/cockpit';
import { buildFrontBrakes, forkLayout } from '../kit/front';
import { lamp, indicatorPod, roundHeadlight } from '../kit/lights';
import { plateHanger } from '../kit/rear';
import { curve, outlineLoft, SECTIONS, stationsBetween, type OutlineBody } from '../kit/shape';
import { bezelRing, castTint, keys, lensProfile, pipeAlong, spine, spineFrames, spineLoft } from '../kit/retro-scooter-ev-body';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv, type Pen } from '../livery';
import { MeshData, circle, extrude, lathe, rod, roundBox, smooth2, sweep, type P2, type P3 } from '../mesh';
import { F, Micro, fin, hard, tint, vary } from '../sink';
import { cut, fAnd, fNot } from '../surface';
import type { BikeBlueprint } from '../types';

/**
 * Vespa GTS 300 HPE (2024): the steel-monocoque scooter.
 * Spec sheet: wheelbase 1380 mm, seat 790 mm, 120/70-12 front + 130/70-12 rear on cast 12" wheels,
 * single-sided trailing-link front suspension (arm on the left), swinging engine/CVT unit on the right
 * with the rear wheel on its left, 220 mm discs, 278 cc single, black ribbed muffler on the right.
 * Design cues: round headlight in the handlebar cover (cowl), chrome-ribbed horn cover on the leg shield,
 * round speedometer on top of the cowl, bulging rounded flanks, flat step-through floor, long dual seat,
 * rounded tail with the horizontal LED lamp.
 */

const CHROME = F.chrome;

// ───────────────────────────── body in the chassis ─────────────────────────────

/** Leg shield + steering-column cover: a slanted, flattened, closed loft (fixed to the frame). */
const SHIELD_SPINE: P3[] = [[0, 0.25, -1.11], [0, 0.46, -1.09], [0, 0.68, -1.04], [0, 0.88, -0.995], [0, 0.97, -0.975]];
const shieldHw = keys([[0, 0.225], [0.3, 0.225], [0.65, 0.18], [1, 0.12]]);
const shieldFront = keys([[0, 0.1], [0.5, 0.08], [1, 0.05]]);
const shieldBack = keys([[0, 0.05], [0.5, 0.034], [1, 0.03]]);

/** Point on the leg shield's front surface at height fraction t (+ lateral x), with the outward normal. */
function shieldFrontAt(ctx: KitContext, t: number, x = 0): { p: P3; n: P3 } {
  const path = spine(SHIELD_SPINE, ctx.seg(8, 3));
  const fr = spineFrames(path);
  const f = fr[Math.max(0, Math.min(fr.length - 1, Math.round(t * (fr.length - 1))))];
  const d = shieldFront(t);
  // Front surface is the superellipse's +y side: depth drops off towards the sides.
  const k = Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(x) / shieldHw(t)), 2 / 0.55)), 0.35);
  const off = d * k;
  return { p: [f.o.x + f.y.x * off, f.o.y + f.y.y * off, f.o.z + f.y.z * off], n: [f.y.x, f.y.y, f.y.z] };
}

function legShield(ctx: KitContext): void {
  const path = spine(SHIELD_SPINE, ctx.seg(8, 3));
  const m = spineLoft(path, (t) => lensProfile(shieldHw(t), shieldFront(t), shieldBack(t), ctx.seg(48, 20), 0.7, 1.3, 0.55), { capStart: true, capEnd: true });
  ctx.add('chassis', m, PAINT);
}

/** Flat floor with rolled side rails and a ribbed rubber mat. */
function floor(ctx: KitContext): void {
  const ob: OutlineBody = {
    zs: stationsBetween(-1.08, -0.6, 9, 0.35),
    top: curve([[-1.08, 0.29], [-0.9, 0.292], [-0.6, 0.3]]),
    bottom: curve([[-1.08, 0.23], [-0.6, 0.21]]),
    half: curve([[-1.08, 0.185], [-0.9, 0.21], [-0.7, 0.215], [-0.6, 0.2]]),
    sections: [{ z: -1.08, pts: [[0, 1], [0.6, 0.995], [0.9, 0.97], [1, 0.8], [1, 0.45], [0.94, 0.1], [0.82, 0]] }],
  };
  const m = outlineLoft(ob, { ...bodyQ(ctx, 1.1), capFront: true, capBack: true });
  ctx.add('chassis', m, PAINT);
  // Rubber mat with transverse ribs
  ctx.add('chassis', roundBox(0.34, 0.012, 0.42, 0.005, 2), F.rubber, T(0, 0.3, -0.84));
  if (ctx.micro) for (let i = 0; i < 14; i++) ctx.add('chassis', roundBox(0.3, 0.004, 0.01, 0.002, 1), tint(F.rubber, '#202022'), T(0, 0.307, -1.02 + i * 0.03));
  // Chrome kick plate at the toe line + scuff strips along the edges
  ctx.add('chassis', roundBox(0.3, 0.006, 0.016, 0.003, 1), vary(F.brushedAlu, { micro: Micro.brushed }), T(0, 0.302, -1.035));
  for (const s of [-1, 1]) ctx.add('chassis', roundBox(0.012, 0.008, 0.46, 0.004, 1), vary(F.brushedAlu, { micro: Micro.brushed }), T(s * 0.205, 0.292, -0.84));
}

/** Rear monocoque: bulging flanks under the seat, rounded tail. */
function rearBody(ctx: KitContext): void {
  const hp = ctx.hp;
  const z0 = -0.7, z1 = 0.29;
  const ob: OutlineBody = {
    zs: stationsBetween(z0, z1, 15, 0.45),
    top: curve([[z0, 0.54], [-0.69, 0.6], [-0.66, 0.66], [-0.58, 0.69], [-0.3, 0.7], [0.0, 0.7], [0.18, 0.685], [0.27, 0.64], [z1, 0.58]]),
    bottom: curve([[z0, 0.38], [-0.69, 0.34], [-0.55, 0.28], [-0.2, 0.3], [0.1, 0.33], [0.25, 0.38], [z1, 0.4]]),
    half: curve([[z0, 0.04], [-0.69, 0.1], [-0.67, 0.165], [-0.55, 0.205], [-0.25, 0.225], [0.0, 0.22], [0.18, 0.2], [0.27, 0.16], [z1, 0.11]]),
    sections: [
      { z: z0, pts: [[0, 1], [0.5, 0.975], [0.82, 0.9], [0.98, 0.72], [1, 0.5], [0.94, 0.24], [0.78, 0.04], [0.4, 0.0], [0, 0]] },
      { z: -0.3, pts: [[0, 1], [0.45, 0.985], [0.78, 0.93], [0.97, 0.78], [1, 0.52], [0.95, 0.24], [0.82, 0.04], [0.42, 0.0], [0, 0]] },
    ],
  };
  const master = outlineLoft(ob, { ...bodyQ(ctx, 1.5), creases: [], capFront: true, capBack: true });
  // Rear wheel arch: the flank sits over the tyre but leaves it visible below the sill.
  const arch = (_x: number, y: number, z: number): number => 0.262 - Math.hypot(z - 0, y - hp.Rr) - 0.0;
  const body = cut(master, fNot((x, y, z) => Math.min(arch(x, y, z), 0.06 - Math.abs(x))));
  shell(ctx, 'chassis', body, PAINT, 0.012);
  // Rear grab handle (flush strap) and the little step in the tail.
  const strap: P3[] = [[-0.13, 0.69, 0.14], [-0.14, 0.7, 0.2], [0, 0.705, 0.26], [0.14, 0.7, 0.2], [0.13, 0.69, 0.14]];
  pipeAlong(ctx, 'chassis', strap, 0.006, F.texturedBlack);
}

function seat(ctx: KitContext): void {
  const o = { front: -0.64, back: 0.25 };
  const L = o.back - o.front;
  const ob: OutlineBody = {
    zs: stationsBetween(o.front, o.back, 12, 0.5),
    top: curve([[o.front, 0.735], [-0.56, 0.775], [-0.35, 0.785], [-0.15, 0.78], [0.0, 0.8], [0.15, 0.805], [0.23, 0.77], [o.back, 0.72]]),
    bottom: curve([[o.front, 0.67], [-0.5, 0.67], [0.0, 0.69], [o.back, 0.66]]),
    half: curve([[o.front, 0.1], [-0.58, 0.155], [-0.4, 0.17], [-0.1, 0.18], [0.1, 0.175], [0.2, 0.15], [o.back, 0.1]]),
    sections: [{ z: o.front, pts: SECTIONS.seat }],
  };
  void L;
  const m = outlineLoft(ob, { ...bodyQ(ctx, 1.2), capFront: true, capBack: true });
  ctx.add('chassis', m, fin('seat', ctx.livery.seat, 0, 0.62, 0, Micro.grain));
  // Chrome seat trim line along the base
  if (ctx.micro) {
    const edge: P3[] = [];
    for (let i = 0; i <= 18; i++) {
      const z = o.front + 0.02 + ((L - 0.04) * i) / 18;
      const hw = ob.half(z) * 0.985;
      edge.push([hw, ob.bottom(z) + 0.012, z]);
    }
    for (const s of [-1, 1]) pipeAlong(ctx, 'chassis', edge.map((p) => [s * p[0], p[1], p[2]] as P3), 0.0035, F.brushedAlu);
  }
}

// ───────────────────────────── handlebar cowl (steers) ─────────────────────────────

function cowl(ctx: KitContext): void {
  const path = spine([[0, 1.0, -1.2], [0, 1.02, -1.11], [0, 1.04, -1.0], [0, 1.05, -0.92], [0, 1.045, -0.84]], ctx.seg(8, 3));
  const hw = keys([[0, 0.1], [0.12, 0.145], [0.35, 0.172], [0.75, 0.18], [1, 0.15]]);
  const up = keys([[0, 0.058], [0.4, 0.072], [1, 0.05]]);
  const dn = keys([[0, 0.06], [0.4, 0.075], [1, 0.055]]);
  const prof = (t: number): P2[] => lensProfile(hw(t), up(t), dn(t), ctx.seg(56, 24), 0.6, 0.85, 0.5);
  const master = spineLoft(path, prof, { capStart: true, capEnd: true });
  // Headlight opening (front) and speedometer opening (top, rear)
  const hl: P3 = [0, 1.0, -1.2];
  const dash = ctx.bp.cockpit.dashPos;
  const tilt = (ctx.bp.cockpit.dashTiltDeg * Math.PI) / 180;
  const holeHl = (x: number, y: number, z: number): number => Math.max(Math.hypot(x, y - hl[1]) - 0.071, z + 1.13);
  const holeDash = (x: number, y: number, z: number): number => Math.max(Math.hypot(x - dash[0], z - dash[2]) - 0.056, 1.04 - y);
  const body = cut(master, fAnd(holeHl, holeDash));
  shell(ctx, 'steer', body, PAINT, 0.012);
  // Headlight: round LED lamp with chrome bezel set in the front of the cowl, facing forward and slightly down.
  roundHeadlight(ctx, 'steer', [0, hl[1] + 0.001, hl[2] + 0.025], 0.064, [0, -0.05, -1], { led: true, chrome: true });
  bezelRing(ctx, 'steer', [0, hl[1], hl[2] + 0.017], [0, -0.05, -1], 0.072, 0.0055);
  // Chrome bezel around the speedometer
  bezelRing(ctx, 'steer', [dash[0], dash[1] + 0.002, dash[2]], [0, Math.sin(tilt), Math.cos(tilt)], 0.056, 0.0048);
  // Front indicators: small amber lenses at the cowl corners
  for (const s of [-1, 1]) indicatorPod(ctx, 'steer', [s * 0.15, 0.995, -1.11], [s * 0.18, 0.995, -1.14], 0.014);
}

/** Chrome-ribbed horn cover on the front of the leg shield, plus the chrome shield badge strip. */
function hornCover(ctx: KitContext): void {
  const n = 6;
  const ang = -Math.atan2(0.2, 1);
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * 0.024;
    const s = shieldFrontAt(ctx, 0.5, x);
    ctx.add('chassis', roundBox(0.01, 0.2, 0.012, 0.004, 1), vary(CHROME, { rough: 0.08 }), mul(T(s.p[0], s.p[1], s.p[2] - 0.003), RX(ang)));
  }
  for (const t of [0.32, 0.68]) {
    const s = shieldFrontAt(ctx, t, 0);
    ctx.add('chassis', roundBox(0.18, 0.012, 0.014, 0.005, 1), CHROME, mul(T(s.p[0], s.p[1], s.p[2] - 0.004), RX(ang)));
  }
}

// ───────────────────────────── front suspension arm (left) ─────────────────────────────

function frontArm(ctx: KitContext): void {
  const hp = ctx.hp;
  const fl = hp.forkLen;
  const off = hp.offset;
  const x = -0.098;
  // Hub boss on both sides of the front wheel + the cast arm up the left side
  for (const s of [-1, 1]) {
    ctx.addSteer('forkLower', lathe([[0, 0], [0.036, 0], [0.04, 0.006], [0.036, 0.016], [0, 0.018]], { segs: ctx.seg(28, 10), axis: 'x', sharp: [1] }), vary(F.castAlu, { color: tint(F.castAlu, '#9a9ea4').color }), mul(T(s * 0.068, -fl, -off), s > 0 ? new THREE.Matrix4() : new THREE.Matrix4().makeScale(-1, 1, 1)));
  }
  ctx.addSteer('forkLower', lathe([[0, 0], [0.012, 0], [0.012, 0.008], [0, 0.008]], { segs: 12, axis: 'x', sharp: true }), F.steel, T(0.0, -fl, -off));
  // Cast arm: tapered leg from the axle boss to the apron
  const arm = new MeshData();
  arm.append(lathe([[0, 0], [0.026, 0], [0.024, 0.2], [0.021, 0.42], [0, 0.42]], { segs: ctx.seg(24, 10), axis: 'y', sharp: [1] }));
  ctx.addSteer('forkLower', arm, vary(F.castAlu, { color: tint(F.castAlu, '#8c9096').color }), T(x, -fl, -off));
  ctx.addSteer('forkLower', roundBox(0.06, 0.07, 0.06, 0.02, 2), vary(F.castAlu, { color: tint(F.castAlu, '#8c9096').color }), T(x * 0.9, -fl + 0.005, -off));
  // Coil-over damper in front of the arm: black body, chrome rod, dark spring
  const a = ctx.fromSteer([x - 0.012, -fl + 0.1, -off - 0.045]);
  const b = ctx.fromSteer([x - 0.012, -fl + 0.4, -off - 0.052]);
  ctx.add('forkLower', rod(a, b, 0.012, 0.012, ctx.seg(14, 6)), F.black);
  ctx.add('forkLower', rod(a, [a[0], a[1] + (b[1] - a[1]) * 0.35, a[2] + (b[2] - a[2]) * 0.35], 0.007, 0.007, 8), F.chrome);
  // Fender
  frontFender(ctx, { from: -0.7, to: 1.05, gap: 0.024, width: 0.17, f: PAINT });
  // Brake caliper on the arm side is placed by buildFrontBrakes (left disc).
}

// ───────────────────────────── swinging engine unit + exhaust ─────────────────────────────

function swingUnit(ctx: KitContext): void {
  const hp = ctx.hp;
  const pv = hp.pivot;
  const Rr = hp.Rr;
  const cast = castTint('#5d6168', 0.8, 0.45);
  // Pivot rod
  ctx.add('swingarm', rod([-0.14, pv[1], pv[2]], [0.24, pv[1], pv[2]], 0.02, 0.02, ctx.seg(18, 8)), F.steel);
  // Right-hand engine / CVT casing, tucked under the side panel (only its lower edge shows)
  const casing = smooth2([[-0.46, 0.34], [-0.42, 0.4], [-0.22, 0.43], [0.0, 0.41], [0.09, 0.34], [0.07, 0.25], [-0.1, 0.2], [-0.34, 0.22], [-0.44, 0.27]], ctx.micro ? 4 : 2, true);
  ctx.add('swingarm', extrude(casing, 0.1, { plane: 'zy', bevel: 0.025, bevelSegs: 2, center: 0.15, curveSegs: 1 }), cast);
  // Cooling / casting ribs along the lower edge of the casing and the bolt bosses
  for (let i = 0; i < 5; i++) ctx.add('swingarm', roundBox(0.012, 0.012, 0.05, 0.004, 1), cast, T(0.205, 0.235, -0.38 + i * 0.07));
  // Rear hub housing at the axle (right) and the chrome axle cap on the left
  ctx.add('swingarm', lathe([[0, 0], [0.07, 0], [0.074, 0.01], [0.066, 0.05], [0, 0.056]], { segs: ctx.seg(32, 12), axis: 'x' }), cast, T(0.075, Rr, 0));
  ctx.add('swingarm', lathe([[0, 0], [0.034, 0], [0.036, 0.004], [0.03, 0.012], [0, 0.014]], { segs: ctx.seg(24, 10), axis: 'x', sharp: [1] }), F.chrome, mul(T(-0.084, Rr, 0), new THREE.Matrix4().makeScale(-1, 1, 1)));
  // Rear shock (right): black spring over a damper, slanted from the unit up into the monocoque
  const sb: P3 = [0.16, Rr + 0.03, 0.14];
  const st: P3 = [0.15, Rr + 0.26, -0.06];
  ctx.add('swingarm', rod(sb, st, 0.015, 0.015, ctx.seg(14, 6)), F.black);
  ctx.add('swingarm', rod(sb, [sb[0], sb[1] + 0.07, sb[2] - 0.03], 0.024, 0.024, ctx.seg(14, 6)), F.satinBlack);
  // Exhaust: header drops under the unit into a ribbed black muffler on the right, chrome tip behind the axle
  pipeAlong(ctx, 'swingarm', [[0.17, 0.26, -0.46], [0.2, 0.19, -0.44], [0.21, 0.15, -0.34]], 0.014, F.titanium);
  const muf = spine([[0.21, 0.15, -0.3], [0.215, 0.17, -0.04], [0.215, 0.215, 0.22]], 6);
  ctx.add('swingarm', sweep(muf, circle(0.05, ctx.seg(22, 10), 0.044), { capStart: true, capEnd: true, scale: muf.map((_, i) => 0.9 + 0.12 * Math.sin((i / (muf.length - 1)) * Math.PI)) }), hard('#17181a', 0.5, 0.35, 0.7));
  const shield = muf.slice(2, muf.length - 2);
  const prof: P2[] = [];
  const nn = ctx.seg(16, 8);
  for (let k = 0; k <= nn; k++) {
    const a = 0.2 + (k / nn) * 1.5;
    prof.push([Math.cos(a) * 0.056, Math.sin(a) * 0.05]);
  }
  for (let k = nn; k >= 0; k--) {
    const a = 0.2 + (k / nn) * 1.5;
    prof.push([Math.cos(a) * 0.0535, Math.sin(a) * 0.0475]);
  }
  ctx.add('swingarm', sweep(shield, prof, { capStart: true, capEnd: true }), vary(F.brushedAlu, { rough: 0.35 }));
  const tip = muf[muf.length - 1];
  ctx.add('swingarm', lathe([[0.034, 0], [0.04, 0.012], [0.036, 0.03], [0.034, 0.03]], { segs: ctx.seg(20, 8), axis: 'z', sharp: true }), F.chrome, T(tip[0], tip[1], tip[2] - 0.004));
  ctx.anchor('exhaustOutlet', [tip[0], tip[1], tip[2] + 0.03]);
}

// ───────────────────────────── lights, plate, misc ─────────────────────────────

function tailAndRear(ctx: KitContext): void {
  // Rounded rear panel carrying the lamp unit and the plate
  ctx.add('chassis', roundBox(0.25, 0.2, 0.034, 0.06, 3), PAINT, T(0, 0.49, 0.292));
  // Horizontal LED tail lamp in a black bezel
  const outline: P2[] = smooth2([[-0.1, -0.02], [0.1, -0.02], [0.108, 0], [0.1, 0.02], [-0.1, 0.02], [-0.108, 0]], 3, true);
  lamp(ctx, 'chassis', outline, mul(T(0, 0.555, 0.31), RX(-0.06)), { kind: 'tail', inner: 'led', count: 3, depth: 0.03, housing: F.glossBlack, lensSmoked: false });
  for (const s of [-1, 1]) indicatorPod(ctx, 'chassis', [s * 0.118, 0.5, 0.29], [s * 0.145, 0.5, 0.302], 0.012);
  // Chrome rear trim strip above the lamp
  ctx.add('chassis', roundBox(0.22, 0.006, 0.01, 0.003, 1), CHROME, T(0, 0.585, 0.306));
}

function body(ctx: KitContext): void {
  const hp = ctx.hp;
  legShield(ctx);
  hornCover(ctx);
  floor(ctx);
  rearBody(ctx);
  seat(ctx);
  cowl(ctx);
  frontArm(ctx);
  swingUnit(ctx);
  tailAndRear(ctx);
  plateHanger(ctx);
  // Cockpit: bars (hidden under the cowl), grips, levers, mirrors, speedometer. The generic fork stage is skipped (single-sided arm).
  const L = forkLayout(ctx);
  const ck = buildCockpit(ctx, L);
  buildFrontBrakes(ctx, L, ck.frontMcPort);
  // Rear brake caliper (left disc)
  const b = ctx.bp.rearBrake;
  placeCaliper(ctx, 'swingarm', b, false, hp.rearAxle, -0.082, 3.55);
}

// ───────────────────────────── livery ─────────────────────────────

function lettering(p: Pen, lv: Livery): void {
  const dark = lv.primary === '#e9e3d1';
  const c = dark ? '#2a2b2e' : '#f3efe3';
  if (p.view === 'right' || p.view === 'left') {
    p.text('Vespa', -0.2, 0.52, { color: c, size: 0.06, weight: '700', italic: true, font: '"Brush Script MT", "Segoe Script", cursive', finish: 'gloss' });
    p.text('GTS', 0.08, 0.5, { color: c, size: 0.034, weight: '800', spacing: 0.15, finish: 'gloss' });
  }
  if (p.view === 'front') p.text('Vespa', 0, 0.8, { color: '#e9ecef', size: 0.05, weight: '700', italic: true, font: '"Brush Script MT", "Segoe Script", cursive', finish: 'chrome' });
  if (p.view === 'rear') p.text('GTS 300', 0, 0.56, { color: c, size: 0.03, weight: '800', spacing: 0.12, finish: 'gloss' });
}

function livery(c: LiveryCanvas, lv: Livery, _env: LiveryEnv): void {
  c.views(ALL_VIEWS, (p) => {
    p.fill(lv.primary, 'metallic');
    lettering(p, lv);
  });
}

export function vespaGtsBlueprint(spec: BikeSpec): BikeBlueprint {
  const black = '#16171a';
  return {
    id: spec.id,
    source: 'authored',
    overall: [1.95, 0.76, 1.32],
    wheelbase: 1.38,
    rakeDeg: 26,
    trail: 0.09,
    forkLength: 0.78,
    front: { tyre: '120/70-12', rimWidthIn: 3.0, tyreLabel: 'City', tread: 'scooter', crown: 1.1 },
    rear: { tyre: '130/70-12', rimWidthIn: 3.5, tyreLabel: 'City', tread: 'scooter', crown: 1.1 },
    frontWheel: { type: 'cast', spokes: 5, shape: 'curved', color: '#c4c8cd', liveryColor: true },
    rearWheel: { type: 'cast', spokes: 5, shape: 'curved', color: '#c4c8cd', liveryColor: true },
    fork: { type: 'rwu', stanchion: 0.03, spacing: 0.12, outerColor: black, innerColor: '#8c9096', footColor: '#8c9096', capColor: '#2b2d31' },
    frontBrake: { discs: 1, discDia: 0.22, disc: 'fixed', carrierColor: '#2b2d31', caliper: 'axial2', caliperColor: '#8c9096', caliperAngleDeg: 130 },
    rearBrake: { discs: 1, discDia: 0.22, disc: 'fixed', carrierColor: '#2b2d31', caliper: 'axial1', caliperColor: '#8c9096', caliperAngleDeg: 205 },
    frame: { type: 'scooter', color: black, metal: 0.3, rough: 0.5, subframe: 'integrated', subframeColor: black, width: 0.34 },
    swingarm: { type: 'scooter', length: 0.44, angleDeg: 14, color: '#8d9197', metal: 0.8, rough: 0.4 },
    shock: { layout: 'none', springColor: black, bodyColor: black, reservoir: false },
    drive: { type: 'none', side: 'right', frontTeeth: 0, rearTeeth: 0, sprocketColor: black },
    engine: { layout: 'SINGLE', cc: 278, crank: [0.12, 0.3, -0.3], tiltDeg: 80, caseColor: '#8d9197', coverColor: '#8d9197', headColor: '#17181a', camCoverColor: '#17181a', finned: true, liquidCooled: true },
    exhaust: { route: 'none', side: 'right', can: 'oval', canLength: 0.4, canDia: 0.1, canFinish: 'black', headerFinish: 'steel' },
    cockpit: {
      bars: 'scooter',
      grip: [0.31, 1.0, -0.99],
      barDia: 0.022,
      dash: 'analog',
      dashPos: [0, 1.093, -0.93],
      dashSize: [0.088, 0.088],
      dashTiltDeg: 50,
      dashMount: 'bars',
      mirrors: 'bar',
      mirrorPos: [0.3, 1.17, -1.04],
      mirrorSize: [0.1, 0.075],
      mirrorShape: 'round',
      mirrorColor: '#cfd2d6',
      topClamp: 'cast',
      steeringDamper: 'none',
      leverColor: '#2a2c30',
      reservoirs: false,
      clutch: 'cable',
      ignition: 'tank',
      switchColor: '#151618',
      gripColor: '#121212',
      barEndColor: '#c8ccd2',
    },
    lights: { head: 'round', tail: 'scooter', rearIndicators: 'integrated' },
    seat: { height: 0.79, front: -0.62, back: 0.25, pillion: 'seat', color: '#3a2a1e' },
    rider: { hip: [0, 0.87, -0.36], peg: [0.2, 0.31, -0.78], torsoPitch: 0.06 },
    footrests: 'scooter',
    plate: { mount: 'body', pos: [0, 0.448, 0.311], tiltDeg: 0 },
    body,
    livery,
    groundClearance: 0.17,
    features: ['skip:fork', 'skip:engine', 'skip:exhaust', 'skip:rear'],
    zones: { splitY: 0.3, decal: [-0.2, 0.52] },
  };
}
