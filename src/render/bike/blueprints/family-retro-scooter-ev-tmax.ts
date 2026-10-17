import * as THREE from 'three';
import type { BikeSpec, Livery } from '../../../data/bikes';
import { RX, RZ, T, mul, type KitContext } from '../context';
import { PAINT, bodyQ, frontFender, shell } from '../kit/body';
import { placeCaliper } from '../kit/brakes';
import { indicatorPod, lamp, ledStrip } from '../kit/lights';
import { plateHanger } from '../kit/rear';
import { archProfile, castTint, keys, lensProfile, onSurface, pipeAlong, spine, spineLoft } from '../kit/retro-scooter-ev-body';
import { curve, outlineLoft, stationsBetween, surfaceAt, type OutlineBody } from '../kit/shape';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv, type Pen } from '../livery';
import { circle, extrude, lathe, rod, roundBox, smooth2, sweep, type P2, type P3 } from '../mesh';
import { F, Micro, fin, hard, tint, vary } from '../sink';
import { cut, fAnd } from '../surface';
import type { BikeBlueprint } from '../types';

/**
 * Yamaha TMAX 560 (2024): the sporty maxi-scooter.
 * Spec sheet: wheelbase 1575 mm, seat 800 mm, 120/70R15 + 160/60R15 on cast 15" wheels, 41 mm telescopic fork,
 * twin 267 mm front discs, swinging 562 cc parallel-twin unit with a belt final drive on the left and
 * the exhaust on the right.
 * Design cues: pointed V-nose fairing with twin slim LED headlights, adjustable screen, fairing-top mirrors with
 * integrated indicators, step-through floor with a high centre tunnel, stepped dual seat, sharp angular tail
 * with a boomerang LED lamp and an integrated pillion grab bar.
 */


// ───────────────────────────── steering-mounted fairing ─────────────────────────────

function fairing(ctx: KitContext): void {
  const z0 = -1.75, z1 = -1.02;
  const ob: OutlineBody = {
    zs: stationsBetween(z0, z1, 18, 0.4),
    top: curve([[z0, 0.74], [-1.73, 0.84], [-1.69, 0.93], [-1.64, 0.99], [-1.57, 1.03], [-1.42, 1.07], [-1.26, 1.095], [-1.1, 1.085], [z1, 1.0]]),
    bottom: curve([[z0, 0.66], [-1.7, 0.66], [-1.6, 0.7], [-1.45, 0.78], [-1.25, 0.9], [-1.1, 0.96], [z1, 0.97]]),
    half: curve([[z0, 0.03], [-1.75, 0.09], [-1.7, 0.19], [-1.62, 0.25], [-1.5, 0.295], [-1.3, 0.3], [-1.1, 0.27], [z1, 0.2]]),
    sections: [
      { z: z0, pts: [[0, 1], [0.3, 0.9], [0.62, 0.8], [0.9, 0.58], [1, 0.3], [0.8, 0.1], [0.5, 0]] },
      { z: -1.55, pts: [[0, 1], [0.62, 0.985], [0.95, 0.9], [1, 0.62], [0.99, 0.35], [0.94, 0.1], [0.8, 0]] },
      { z: -1.3, pts: [[0, 1], [0.62, 0.985], [0.95, 0.9], [1, 0.62], [0.99, 0.35], [0.94, 0.1], [0.8, 0]] },
    ],
  };
  const master = outlineLoft(ob, { ...bodyQ(ctx, 1.15), creases: [2], capFront: true, capBack: true });
  // Dash opening in the top of the cowl behind the screen
  const dash = ctx.bp.cockpit.dashPos;
  const [dw, dh] = ctx.bp.cockpit.dashSize;
  const hole = (x: number, y: number, z: number): number => Math.max(Math.abs(x) - (dw / 2 + 0.014), Math.abs(z - dash[2]) - (dh / 2 + 0.03), 1.0 - y);
  const body = cut(master, fAnd(hole));
  shell(ctx, 'steer', body, PAINT, 0.012);
  // Twin slim LED headlights on the near-vertical face, each with a swept DRL blade above it.
  for (const s of [-1, 1]) {
    const z = -1.665;
    const sp = surfaceAt(ob, z, s * 0.105);
    const n: P3 = [sp.n[0] * 0.5, sp.n[1] * 0.6, -Math.abs(sp.n[2]) - 0.3];
    const outline: P2[] = smooth2([[-0.07, -0.01], [0.06, -0.022], [0.082, -0.008], [0.06, 0.012], [-0.06, 0.02], [-0.078, 0.006]], 3, true);
    const m = onSurface([sp.p[0], sp.p[1], sp.p[2] - 0.004], n, -s * 0.32);
    lamp(ctx, 'steer', outline, m, { kind: 'head', inner: 'led', count: 2, depth: 0.06, rim: 0.005, housing: F.glossBlack });
    const arc: P3[] = [];
    for (let i = 0; i <= 8; i++) {
      const u = i / 8;
      const x = s * (0.035 + u * 0.17);
      const sp2 = surfaceAt(ob, -1.665 + u * 0.05, x);
      arc.push([sp2.p[0], sp2.p[1] + 0.012 - u * 0.012, sp2.p[2] - 0.003]);
    }
    ledStrip(ctx, 'steer', arc, 0.008, 0.005, 'drl', [0, 1, 0]);
  }
  // Chin: dark splitter under the nose with intake slots
  ctx.add('steer', roundBox(0.2, 0.014, 0.16, 0.006, 1), F.texturedBlack, mul(T(0, 0.665, -1.69), RX(0.1)));
  for (const s of [-1, 1]) ctx.add('steer', roundBox(0.05, 0.02, 0.006, 0.002, 1), F.texturedBlack, mul(T(s * 0.06, 0.735, -1.762), RX(-0.5)));
  // Windscreen: thin tinted arched sheet rising from the cowl
  const path = spine([[0, 1.045, -1.36], [0, 1.15, -1.28], [0, 1.27, -1.19], [0, 1.37, -1.1], [0, 1.41, -1.06]], ctx.seg(6, 3));
  const hw = keys([[0, 0.17], [0.5, 0.2], [1, 0.19]]);
  ctx.add('steer', spineLoft(path, (t) => archProfile(hw(t), 0.035 + 0.01 * t, 0.006, 14), { capStart: true, capEnd: true }), tint(F.screen, '#3b4652'));
  // Screen mounting posts
  for (const s of [-1, 1]) pipeAlong(ctx, 'steer', [[s * 0.16, 1.075, -1.3], [s * 0.18, 1.13, -1.26], [s * 0.185, 1.2, -1.2]], 0.008, F.texturedBlack);
}

/** Side air-intake vents on the fairing flanks and the front indicators. */
function fairingDetails(ctx: KitContext): void {
  for (const s of [-1, 1]) {
    // Vents: three slanted dark slots low on the flank
    for (let i = 0; i < 3; i++) {
      const z = -1.38 + i * 0.045;
      ctx.add('steer', roundBox(0.004, 0.05, 0.02, 0.002, 1), F.texturedBlack, mul(T(s * 0.292, 0.93, z), RX(-0.35)));
    }
    indicatorPod(ctx, 'steer', [s * 0.255, 0.99, -1.545], [s * 0.285, 0.985, -1.56], 0.011);
  }
}

// ───────────────────────────── body in the chassis ─────────────────────────────

const SH_SPINE: P3[] = [[0, 0.27, -1.12], [0, 0.52, -1.14], [0, 0.78, -1.13], [0, 0.97, -1.08]];

function legShield(ctx: KitContext): void {
  const path = spine(SH_SPINE, ctx.seg(8, 3));
  const hw = keys([[0, 0.265], [0.4, 0.26], [0.8, 0.22], [1, 0.19]]);
  const fr = keys([[0, 0.09], [0.5, 0.075], [1, 0.06]]);
  const bk = keys([[0, 0.05], [0.5, 0.04], [1, 0.04]]);
  ctx.add('chassis', spineLoft(path, (t) => lensProfile(hw(t), fr(t), bk(t), ctx.seg(48, 20), 0.7, 1.2, 0.5), { capStart: true, capEnd: true }), vary(PAINT, {}));
}

function floorAndTunnel(ctx: KitContext): void {
  // Footboards
  const fb: OutlineBody = {
    zs: stationsBetween(-1.12, -0.62, 9, 0.35),
    top: curve([[-1.12, 0.3], [-0.62, 0.312]]),
    bottom: curve([[-1.12, 0.24], [-0.62, 0.23]]),
    half: curve([[-1.12, 0.26], [-0.9, 0.285], [-0.62, 0.275]]),
    sections: [{ z: -1.12, pts: [[0, 1], [0.6, 0.995], [0.92, 0.97], [1, 0.75], [1, 0.4], [0.95, 0.1], [0.8, 0]] }],
  };
  ctx.add('chassis', outlineLoft(fb, { ...bodyQ(ctx, 0.9), capFront: true, capBack: true }), PAINT);
  for (const s of [-1, 1]) {
    ctx.add('chassis', roundBox(0.14, 0.012, 0.4, 0.005, 2), F.rubber, T(s * 0.185, 0.314, -0.88));
    if (ctx.micro) for (let i = 0; i < 12; i++) ctx.add('chassis', roundBox(0.12, 0.004, 0.008, 0.002, 1), tint(F.rubber, '#232325'), T(s * 0.185, 0.32, -1.06 + i * 0.03));
    ctx.add('chassis', roundBox(0.012, 0.01, 0.44, 0.004, 1), vary(F.brushedAlu, { micro: Micro.brushed }), T(s * 0.262, 0.31, -0.88));
  }
  // Centre tunnel rising to the seat
  const tn: OutlineBody = {
    zs: stationsBetween(-1.1, -0.64, 10, 0.4),
    top: curve([[-1.1, 0.7], [-1.0, 0.7], [-0.85, 0.68], [-0.72, 0.7], [-0.64, 0.72]]),
    bottom: curve([[-1.1, 0.28], [-0.64, 0.3]]),
    half: curve([[-1.1, 0.12], [-1.0, 0.125], [-0.85, 0.135], [-0.64, 0.17]]),
    sections: [{ z: -1.1, pts: [[0, 1], [0.55, 0.985], [0.9, 0.93], [1, 0.75], [1, 0.4], [0.96, 0.08], [0.85, 0]] }],
  };
  shell(ctx, 'chassis', outlineLoft(tn, { ...bodyQ(ctx, 0.9), capFront: true, capBack: true }), PAINT, 0.01);
}

function rearBody(ctx: KitContext): void {
  const hp = ctx.hp;
  const z0 = -0.8, z1 = 0.34;
  const ob: OutlineBody = {
    zs: stationsBetween(z0, z1, 16, 0.4),
    top: curve([[z0, 0.58], [-0.76, 0.66], [-0.7, 0.7], [-0.4, 0.71], [-0.1, 0.71], [0.12, 0.72], [0.26, 0.75], [z1, 0.78]]),
    bottom: curve([[z0, 0.36], [-0.74, 0.3], [-0.6, 0.33], [-0.45, 0.4], [-0.2, 0.45], [0.1, 0.49], [0.25, 0.54], [z1, 0.6]]),
    half: curve([[z0, 0.08], [-0.76, 0.16], [-0.62, 0.21], [-0.35, 0.225], [-0.1, 0.22], [0.15, 0.2], [0.28, 0.16], [z1, 0.1]]),
    sections: [
      { z: z0, pts: [[0, 1], [0.6, 0.985], [0.94, 0.9], [1, 0.62], [0.99, 0.35], [0.95, 0.1], [0.8, 0.0], [0.4, 0], [0, 0]] },
      { z: -0.3, pts: [[0, 1], [0.62, 0.985], [0.95, 0.9], [1, 0.62], [0.99, 0.35], [0.95, 0.1], [0.8, 0.0], [0.4, 0], [0, 0]] },
    ],
  };
  const master = outlineLoft(ob, { ...bodyQ(ctx, 1.15), creases: [2], capFront: true, capBack: true });
  const arch = (x: number, y: number, z: number): number => Math.min(0.31 - Math.hypot(z, y - hp.Rr), 0.07 - Math.abs(x));
  const body = cut(master, (x, y, z) => -arch(x, y, z));
  shell(ctx, 'chassis', body, PAINT, 0.012);
  // Panel line along the shoulder (dark gap) and the air-vent slits on the flank
  for (const s of [-1, 1]) {
    const pts: P3[] = [];
    for (let i = 0; i <= 14; i++) {
      const z = -0.56 + (i / 14) * 0.62;
      pts.push([s * (ob.half(z) * 0.985 + 0.0006), ob.bottom(z) + (ob.top(z) - ob.bottom(z)) * 0.62, z]);
    }
    pipeAlong(ctx, 'chassis', pts, 0.0022, F.texturedBlack);
  }
}

function seat(ctx: KitContext): void {
  const z0 = -0.72, z1 = 0.26;
  const ob: OutlineBody = {
    zs: stationsBetween(z0, z1, 14, 0.5),
    top: curve([[z0, 0.795], [-0.62, 0.808], [-0.45, 0.8], [-0.28, 0.79], [-0.12, 0.835], [0.02, 0.85], [0.18, 0.84], [z1, 0.81]]),
    bottom: curve([[z0, 0.72], [-0.4, 0.7], [0.0, 0.72], [z1, 0.72]]),
    half: curve([[z0, 0.11], [-0.64, 0.165], [-0.42, 0.19], [-0.2, 0.18], [0.0, 0.17], [0.16, 0.15], [z1, 0.1]]),
    sections: [{ z: z0, pts: [[0, 1], [0.55, 0.975], [0.9, 0.86], [1, 0.55], [0.96, 0.15], [0.9, 0]] }],
  };
  const m = outlineLoft(ob, { ...bodyQ(ctx, 1.0), capFront: true, capBack: true });
  ctx.add('chassis', m, fin('seat', ctx.livery.seat, 0, 0.62, 0, Micro.grain));
  if (ctx.micro) {
    for (const s of [-1, 1]) {
      const pts: P3[] = [];
      for (let i = 1; i < 26; i++) {
        const z = z0 + ((z1 - z0) * i) / 26;
        const sp = surfaceAt(ob, z, s * ob.half(z) * 0.78);
        pts.push([sp.p[0] + sp.n[0] * 0.0008, sp.p[1] + sp.n[1] * 0.0008, z]);
      }
      pipeAlong(ctx, 'chassis', pts, 0.0012, tint(F.rubber, '#55575c'));
    }
  }
}

function tailAndGrab(ctx: KitContext): void {
  // Boomerang LED tail lamp across the tail tip
  const path: P3[] = [[-0.17, 0.745, 0.215], [-0.13, 0.765, 0.31], [-0.06, 0.775, 0.348], [0.06, 0.775, 0.348], [0.13, 0.765, 0.31], [0.17, 0.745, 0.215]];
  ledStrip(ctx, 'chassis', path, 0.026, 0.01, 'tail', [0, 1, 0]);
  // Black pillion grab bar behind the seat
  pipeAlong(ctx, 'chassis', [[-0.15, 0.835, 0.12], [-0.17, 0.87, 0.2], [-0.12, 0.88, 0.285], [0.12, 0.88, 0.285], [0.17, 0.87, 0.2], [0.15, 0.835, 0.12]], 0.011, hard('#222427', 0.6, 0.4, 0.5, Micro.cast));
  for (const s of [-1, 1]) indicatorPod(ctx, 'chassis', [s * 0.15, 0.62, 0.3], [s * 0.185, 0.625, 0.335], 0.012);
}

// ───────────────────────────── front fender + swinging unit ─────────────────────────────

function frontEnd(ctx: KitContext): void {
  frontFender(ctx, { from: -0.8, to: 0.95, gap: 0.028, width: 0.175, f: PAINT });
}

function swingUnit(ctx: KitContext): void {
  const hp = ctx.hp;
  const pv = hp.pivot;
  const Rr = hp.Rr;
  const cast = castTint('#3d4146', 0.8, 0.42);
  const darkcast = castTint('#2a2c30', 0.55, 0.5);
  const arm = (s: number, w: number, color: typeof cast) => {
    const outline = smooth2([[pv[2] - 0.04, pv[1] + 0.09], [pv[2] + 0.12, Rr + 0.11], [0.04, Rr + 0.09], [0.06, Rr - 0.08], [pv[2] + 0.2, Rr - 0.1], [pv[2] - 0.04, pv[1] - 0.08]], ctx.micro ? 4 : 2, true);
    ctx.add('swingarm', extrude(outline, w, { plane: 'zy', bevel: 0.02, bevelSegs: 2, center: s * (hp.rear.width / 2 + 0.045 + w / 2), curveSegs: 1 }), color);
  };
  // Belt-drive arm (left): ribbed cast cover with the big pulley cap; right arm: forged aluminium
  arm(-1, 0.07, cast);
  arm(1, 0.05, castTint('#3b3e43', 0.8, 0.4));
  const cap = lathe([[0, 0], [0.105, 0], [0.11, 0.004], [0.104, 0.022], [0.07, 0.026], [0, 0.028]].map(([r, a]) => [r, a] as P2), { segs: ctx.seg(40, 16), axis: 'x', sharp: [1] });
  ctx.add('swingarm', cap, vary(cast, { rough: 0.5 }), mul(T(-hp.rear.width / 2 - 0.115, Rr, 0), new THREE.Matrix4().makeScale(-1, 1, 1)));
  if (ctx.micro) for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.add('swingarm', lathe([[0, 0], [0.006, 0], [0.006, 0.006], [0, 0.006]], { segs: 6, axis: 'x', sharp: true }), F.steel, mul(T(-hp.rear.width / 2 - 0.12, Rr + Math.cos(a) * 0.088, Math.sin(a) * 0.088), RZ(Math.PI / 2)));
  }
  for (let i = 0; i < 6; i++) ctx.add('swingarm', roundBox(0.012, 0.012, 0.09, 0.004, 1), cast, T(-hp.rear.width / 2 - 0.108, Rr + 0.116 + 0.002 * i, pv[2] + 0.18 + i * 0.045));
  // Pivot rod and engine casing between the arms (crankcase, clutch covers)
  ctx.add('swingarm', rod([-0.2, pv[1], pv[2]], [0.2, pv[1], pv[2]], 0.022, 0.022, ctx.seg(18, 8)), F.steel);
  ctx.add('swingarm', roundBox(0.34, 0.2, 0.3, 0.05, 2), darkcast, T(0, pv[1] + 0.03, pv[2] + 0.12));
  // Right-hand rear shock
  const sb: P3 = [0.17, Rr + 0.02, 0.1];
  const st: P3 = [0.16, Rr + 0.3, -0.1];
  ctx.add('swingarm', rod(sb, st, 0.016, 0.016, ctx.seg(14, 6)), F.black);
  ctx.add('swingarm', rod(sb, [sb[0], sb[1] + 0.08, sb[2] - 0.035], 0.026, 0.026, ctx.seg(14, 6)), hard('#1c1d20', 0.4, 0.5, 0.4));
  // Exhaust (right): header under the crankcase into a big oval black silencer with a brushed end cap
  pipeAlong(ctx, 'swingarm', [[0.08, 0.32, -0.62], [0.13, 0.2, -0.55], [0.17, 0.17, -0.42]], 0.02, F.titanium);
  const muf = spine([[0.185, 0.17, -0.42], [0.19, 0.2, -0.1], [0.19, 0.255, 0.24]], 6);
  ctx.add('swingarm', sweep(muf, circle(0.055, ctx.seg(24, 10), 0.047), { capStart: true, capEnd: true, scale: muf.map((_, i) => 0.9 + 0.12 * Math.sin((i / (muf.length - 1)) * Math.PI)) }), hard('#18191b', 0.5, 0.35, 0.8));
  const shield = muf.slice(1, muf.length - 2);
  const prof: P2[] = [];
  const nn = ctx.seg(16, 8);
  for (let k = 0; k <= nn; k++) {
    const a = 0.1 + (k / nn) * 1.7;
    prof.push([Math.cos(a) * 0.06, Math.sin(a) * 0.052]);
  }
  for (let k = nn; k >= 0; k--) {
    const a = 0.1 + (k / nn) * 1.7;
    prof.push([Math.cos(a) * 0.057, Math.sin(a) * 0.049]);
  }
  ctx.add('swingarm', sweep(shield, prof, { capStart: true, capEnd: true }), hard('#2a2c30', 0.7, 0.4, 0.4, Micro.grain));
  const tip = muf[muf.length - 1];
  ctx.add('swingarm', lathe([[0.04, 0], [0.047, 0.014], [0.043, 0.04], [0.04, 0.04]], { segs: ctx.seg(20, 8), axis: 'z', sharp: true }), vary(F.brushedAlu, { rough: 0.35 }), mul(T(tip[0], tip[1], tip[2] - 0.004)));
  ctx.anchor('exhaustOutlet', [tip[0], tip[1], tip[2] + 0.04]);
  // Rear brake caliper (right disc)
  placeCaliper(ctx, 'swingarm', ctx.bp.rearBrake, false, hp.rearAxle, 0.082, 3.5);
}

function body(ctx: KitContext): void {
  fairing(ctx);
  fairingDetails(ctx);
  legShield(ctx);
  floorAndTunnel(ctx);
  rearBody(ctx);
  seat(ctx);
  tailAndGrab(ctx);
  frontEnd(ctx);
  swingUnit(ctx);
  plateHanger(ctx, { fromZ: 0.2, fromY: 0.6 });
}

// ───────────────────────────── livery ─────────────────────────────

function camo(p: Pen, base: string, tones: string[]): void {
  // Deterministic angular "Tech Kamo" blobs across the flanks
  let seed = 7;
  const rnd = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 70; i++) {
    const cx = -1.9 + rnd() * 2.4, cy = 0.25 + rnd() * 0.95;
    const r = 0.04 + rnd() * 0.1;
    const pts: P2[] = [];
    const n = 5 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rnd() * 0.5;
      pts.push([cx + Math.cos(a) * r * (0.6 + rnd() * 0.8) * 1.7, cy + Math.sin(a) * r * (0.6 + rnd() * 0.8)]);
    }
    p.poly(pts, tones[Math.floor(rnd() * tones.length)], 'matte');
  }
  void base;
}

function livery(c: LiveryCanvas, lv: Livery, env: LiveryEnv): void {
  const kamo = env.index === 1;
  c.views(ALL_VIEWS, (p) => {
    if (kamo) {
      p.fill('#3a413a', 'matte');
      if (p.view === 'right' || p.view === 'left') camo(p, '#3a413a', ['#4a5446', '#2c322d', '#555a52', '#252a26']);
    } else {
      p.fill(lv.primary, 'metallic');
    }
    if (p.view === 'right' || p.view === 'left') {
      // Black lower body and sill line, the way the factory two-tones the TMAX
      p.rect(-0.9, -1, 0.5, 0.36, '#17181b', 'satin');
      p.poly([[-1.14, 0.3], [-1.0, 0.8], [-0.95, 0.8], [-1.0, 0.3]], '#17181b', 'satin');
      p.text('TMAX', -0.3, 0.52, { color: kamo ? '#e7e9e4' : '#f4f6fa', size: 0.05, weight: '900', spacing: 0.12, italic: true, finish: 'gloss' });
      p.rect(-0.82, 0.585, 0.2, 0.592, kamo ? '#f26a1b' : '#c0c4c9', 'gloss');
    }
    if (p.view === 'front') p.text('TMAX', 0, 0.62, { color: '#e9ecf0', size: 0.04, weight: '900', spacing: 0.12, finish: 'chrome' });
    if (p.view === 'rear') p.text('TMAX', 0, 0.66, { color: '#e9ecf0', size: 0.03, weight: '900', spacing: 0.12, finish: 'chrome' });
  });
}

export function tmaxBlueprint(spec: BikeSpec): BikeBlueprint {
  const black = '#16171a';
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.2, 0.765, 1.42],
    wheelbase: 1.575,
    rakeDeg: 26,
    trail: 0.09,
    forkLength: 0.8,
    front: { tyre: '120/70R15', rimWidthIn: 3.5, tyreLabel: 'Maxi Touring', tread: 'scooter', crown: 1.0 },
    rear: { tyre: '160/60R15', rimWidthIn: 5.0, tyreLabel: 'Maxi Touring', tread: 'scooter', crown: 1.05 },
    frontWheel: { type: 'cast', spokes: 5, shape: 'y', color: '#1c1d20', liveryColor: true, machinedLip: false },
    rearWheel: { type: 'cast', spokes: 5, shape: 'y', color: '#1c1d20', liveryColor: true },
    fork: { type: 'rwu', stanchion: 0.041, spacing: 0.21, outerColor: black, innerColor: '#2b2d31', footColor: '#2a2c30', capColor: '#2b2d31', aboveClamp: 0.01, clampGap: 0.2 },
    frontBrake: { discs: 2, discDia: 0.267, disc: 'floating', carrierColor: '#2b2d31', caliper: 'radial4', caliperColor: '#1c1d20', caliperAngleDeg: 100 },
    rearBrake: { discs: 1, discDia: 0.267, disc: 'fixed', carrierColor: '#2b2d31', caliper: 'axial2', caliperColor: '#1c1d20', caliperAngleDeg: 200 },
    frame: { type: 'scooter', color: black, metal: 0.3, rough: 0.5, subframe: 'integrated', subframeColor: black, width: 0.4 },
    swingarm: { type: 'scooter', length: 0.5, angleDeg: 8, color: '#6f7378', metal: 0.8, rough: 0.4 },
    shock: { layout: 'none', springColor: black, bodyColor: black, reservoir: false },
    drive: { type: 'none', side: 'left', frontTeeth: 0, rearTeeth: 0, sprocketColor: black },
    engine: { layout: 'P2_360', cc: 562, crank: [0, 0.38, -0.5], tiltDeg: 75, caseColor: '#2a2c30', coverColor: '#2a2c30', headColor: '#17181a', camCoverColor: '#17181a', finned: false, liquidCooled: true },
    exhaust: { route: 'none', side: 'right', can: 'oval', canLength: 0.5, canDia: 0.11, canFinish: 'black', headerFinish: 'steel' },
    cockpit: {
      bars: 'scooter',
      grip: [0.35, 1.0, -1.13],
      barDia: 0.022,
      dash: 'tft',
      dashPos: [0, 1.075, -1.13],
      dashSize: [0.17, 0.085],
      dashTiltDeg: 38,
      dashMount: 'bars',
      mirrors: 'bar',
      mirrorPos: [0.375, 1.12, -1.3],
      mirrorSize: [0.12, 0.07],
      mirrorIndicators: true,
      mirrorShape: 'rect',
      mirrorColor: '#16171a',
      topClamp: 'cast',
      steeringDamper: 'none',
      leverColor: '#2a2c30',
      reservoirs: true,
      clutch: 'cable',
      ignition: 'tank',
      switchColor: '#151618',
      gripColor: '#121212',
      barEndColor: '#2a2c30',
    },
    lights: { head: 'angular', tail: 'bar', rearIndicators: 'integrated' },
    seat: { height: 0.8, front: -0.72, back: 0.26, pillion: 'seat', color: '#161618' },
    rider: { hip: [0, 0.885, -0.42], peg: [0.2, 0.33, -0.86], torsoPitch: 0.1 },
    footrests: 'scooter',
    plate: { mount: 'hanger', pos: [0, 0.5, 0.4], tiltDeg: -10 },
    body,
    livery,
    groundClearance: 0.125,
    features: ['skip:frame', 'skip:engine', 'skip:exhaust', 'skip:rear'],
    zones: { splitY: 0.36, decal: [-0.3, 0.52] },
  };
}
