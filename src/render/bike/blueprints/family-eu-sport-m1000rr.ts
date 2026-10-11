import * as THREE from 'three';
import type { BikeSpec, Livery } from '../../../data/bikes';
import { RX, T, mul, type KitContext } from '../context';
import { addPanel, bodyQ, buildSeat, buildTank, frontFender, screen, PAINT, seatFinish } from '../kit/body';
import { aerofoil, skinX } from '../kit/eu-sport-parts';
import { fasteners, innerCowl, undertray } from '../kit/jp-sport-parts';
import { lamp, ledStrip } from '../kit/lights';
import { hugger, plateHanger } from '../kit/rear';
import { curve, outlineLoft, sideAt, stationsBetween, type OutlineBody } from '../kit/shape';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv, type Pen } from '../livery';
import { extrude, smooth2, type P2, type P3 } from '../mesh';
import { F, tint } from '../sink';
import { cut, fAnd, fNot, frontRegion, fOr, planRegion, sideRegion, type Field } from '../surface';
import type { BikeBlueprint } from '../types';

/**
 * BMW M 1000 RR (2023+), the M homologation special of the S 1000 RR.
 * Spec sheet: wheelbase 1457 mm, rake 23.6°, trail 99 mm, seat 832 mm, 192 kg,
 * 120/70ZR17 + 200/55ZR17 on M Carbon wheels (3.50 / 6.00 in), 45 mm USD fork,
 * 2 × 320 mm discs with the blue M brake calipers, aluminium bridge frame,
 * under-braced swingarm, 999 cc ShiftCam inline four with titanium internals and a
 * full titanium exhaust ending in the short underslung silencer on the right.
 * Design cues: the S 1000 RR face (symmetric LED headlights with sickle DRLs either
 * side of the ram-air intake) and three gills, plus the big carbon "M Winglets 2.0"
 * standing out of the cowl, carbon mudguard / hugger, tall racing screen and the
 * Light White / M Motorsport colours.
 */

const NOSE = -1.705;
const SCREEN_BASE = -1.56;
const SCREEN_TOP_Z = -1.18;

const SIDE_EDGE: P2[] = [
  [-1.21, 0.985],
  [-1.12, 0.955],
  [-1.03, 0.9],
  [-0.92, 0.82],
  [-0.82, 0.66],
  [-0.75, 0.5],
  [-0.69, 0.37],
  [-0.62, 0.27],
  [-0.54, 0.2],
  [-0.48, 0.17],
];

function fairing(): OutlineBody {
  const zs = [NOSE, -1.7, -1.69, -1.675, -1.655, -1.625, -1.585, -1.535, -1.475, -1.405, -1.325, -1.24, -1.15, -1.05, -0.95, -0.85, -0.75, -0.65, -0.56, -0.48];
  const face: P2[] = [[0, 1], [0.32, 0.955], [0.64, 0.85], [0.87, 0.67], [0.98, 0.45], [0.9, 0.21], [0.56, 0.045], [0, 0]];
  const cowl: P2[] = [[0, 1], [0.35, 0.985], [0.65, 0.935], [0.83, 0.8], [0.96, 0.6], [1, 0.38], [0.95, 0.12], [0.76, 0]];
  const side: P2[] = [[0, 1], [0.38, 0.99], [0.68, 0.95], [0.86, 0.82], [0.97, 0.6], [1, 0.36], [0.93, 0.1], [0.6, 0]];
  const back: P2[] = [[0, 1], [0.42, 0.99], [0.72, 0.95], [0.9, 0.82], [0.98, 0.6], [1, 0.36], [0.92, 0.1], [0.5, 0]];
  return {
    zs,
    top: curve([[NOSE, 0.79], [-1.68, 0.815], [-1.62, 0.848], [-1.53, 0.884], [-1.43, 0.916], [-1.32, 0.945], [-1.2, 0.965], [-1.06, 0.955], [-0.88, 0.905], [-0.68, 0.83], [-0.48, 0.74]]),
    bottom: curve([[NOSE, 0.77], [-1.698, 0.72], [-1.68, 0.678], [-1.645, 0.648], [-1.59, 0.626], [-1.52, 0.612], [-1.44, 0.598], [-1.36, 0.51], [-1.24, 0.34], [-1.1, 0.215], [-0.95, 0.16], [-0.75, 0.15], [-0.6, 0.16], [-0.48, 0.19]]),
    half: curve([[NOSE, 0.012], [-1.698, 0.065], [-1.68, 0.12], [-1.64, 0.165], [-1.57, 0.208], [-1.47, 0.245], [-1.36, 0.273], [-1.22, 0.293], [-1.06, 0.3], [-0.9, 0.29], [-0.7, 0.26], [-0.48, 0.205]]),
    sections: [
      { z: NOSE, pts: face },
      { z: -1.62, pts: face },
      { z: -1.4, pts: cowl },
      { z: -1.02, pts: side },
      { z: -0.48, pts: back },
    ],
  };
}

function tail(): OutlineBody {
  return {
    zs: stationsBetween(-0.69, 0.1, 14, 0.5),
    top: curve([[-0.69, 0.825], [-0.5, 0.835], [-0.33, 0.86], [-0.28, 0.925], [-0.12, 0.975], [0.02, 1.025], [0.1, 1.06]]),
    bottom: curve([[-0.69, 0.68], [-0.42, 0.71], [-0.18, 0.78], [-0.02, 0.89], [0.07, 0.99], [0.1, 1.02]]),
    half: curve([[-0.69, 0.155], [-0.48, 0.145], [-0.26, 0.122], [-0.05, 0.09], [0.1, 0.035]]),
    sections: [
      { z: -0.69, pts: [[0, 1], [0.6, 0.98], [0.95, 0.84], [1, 0.55], [0.93, 0.22], [0.6, 0.02], [0, 0]] },
      { z: 0.1, pts: [[0, 1], [0.72, 0.97], [1, 0.74], [0.98, 0.46], [0.84, 0.2], [0.42, 0.02], [0, 0]] },
    ],
  };
}

/** Symmetric headlight outline (front view, right side, centred on the lamp). */
const HEAD: P2[] = smooth2([[-0.045, -0.018], [0.03, -0.028], [0.05, -0.012], [0.045, 0.018], [0.0, 0.03], [-0.05, 0.012]], 3, true);

/**
 * M Winglets 2.0: per side a carbon box of three stacked cambered blades between an inner
 * root plate on the cowl and a tall outer end plate, raked back like the race bike's.
 */
function mWinglets(ctx: KitContext, ob: OutlineBody): void {
  const span = 0.075;
  for (const s of [-1, 1]) {
    const root = skinX(ob, -1.35, 0.66) - 0.012;
    const blades: [number, number, number][] = [[0.715, -1.43, -1.29], [0.672, -1.44, -1.3], [0.629, -1.45, -1.31]];
    for (const [y, z0, z1] of blades) {
      const xr = skinX(ob, (z0 + z1) / 2, y) - 0.012;
      const b = aerofoil(z0, z1, y, xr, root + span, 0.013, 0.007, 0.012);
      ctx.add('chassis', s > 0 ? b : b.mirrored(), F.carbon);
    }
    const plate: P2[] = smooth2([[-1.455, 0.612], [-1.31, 0.618], [-1.285, 0.645], [-1.29, 0.73], [-1.39, 0.728], [-1.445, 0.69]], 2, true);
    ctx.add('chassis', extrude(plate, 0.004, { plane: 'zy', center: s * (root + span + 0.002), bevel: 0.0015 }), F.carbon);
    // Root fairing plate where the box meets the cowl.
    const rp = sideAt(ob, -1.36, 0.67, s);
    ctx.add('chassis', extrude(smooth2([[-1.45, 0.61], [-1.29, 0.62], [-1.29, 0.73], [-1.43, 0.725]], 2, true), 0.004, { plane: 'zy', center: rp.p[0] + s * 0.001, bevel: 0.0015 }), F.carbon);
  }
}

function body(ctx: KitContext): void {
  const ob = fairing();
  const q = bodyQ(ctx, 1.7);
  const master = outlineLoft(ob, { su: q.su, sv: q.sv, creases: [2], capFront: true });
  const A = ctx.hp.frontAxle;
  const open = sideRegion([[-1.21, 2], ...SIDE_EDGE, [-0.3, 0.1], [-0.3, 2]]);
  const arch = (_x: number, y: number, z: number) => 0.36 - Math.hypot(z - A[2], y - A[1]);
  const underScreen = fAnd(planRegion([[SCREEN_BASE + 0.08, -1], [-1.06, -1], [-1.06, 0.15], [-1.36, 0.165], [SCREEN_BASE + 0.08, 0.11]]), (_x, y) => y - 0.86);
  const lampAt = (s: number): P2 => [s * 0.085, 0.732];
  const headHole = (s: number): Field => frontRegion(HEAD.map(([x, y]) => [lampAt(s)[0] + x * s * 1.05, lampAt(s)[1] + y * 1.08] as P2), false);
  const intake = frontRegion(smooth2([[0, 0.69], [0.03, 0.692], [0.048, 0.675], [0.04, 0.646], [0.0, 0.638]], 3, true));
  const faceHole = fAnd(fOr(headHole(1), headHole(-1), intake), (_x, _y, z) => -1.6 - z);
  const bodyCut = cut(master, fAnd(fNot(open), fNot(arch), fNot(underScreen), fNot(faceHole)));
  const cowl = sideRegion([[-2, 2], [-1.37, 2], [-1.37, 0.94], [-1.4, 0.78], [-1.45, 0.66], [-1.51, 0.6], [-2, 0.58]]);
  const belly = sideRegion([[-1.15, 0.33], [-0.95, 0.31], [-0.7, 0.3], [-0.4, 0.3], [-0.4, -1], [-1.15, -1]]);
  const gills: P2[][] = [0, 1, 2].map((i) => {
    const z0 = -1.2 + i * 0.075, y0 = 0.53 + i * 0.03;
    return [[z0, y0], [z0 + 0.05, y0 + 0.13], [z0 + 0.075, y0 + 0.13], [z0 + 0.025, y0]];
  });
  const gill = fOr(...gills.map((g) => sideRegion(g)));
  addPanel(ctx, 'chassis', bodyCut, cowl, PAINT, 0.003, 0.014);
  addPanel(ctx, 'chassis', bodyCut, fAnd(fNot(cowl), fNot(belly), fNot(gill)), PAINT, 0.003, 0.014);
  // The M's lower fairing / belly pan is carbon.
  addPanel(ctx, 'chassis', bodyCut, fAnd(belly, fNot(cowl)), F.carbon, 0.003, 0.012);
  for (const s of [-1, 1]) {
    const p = sideAt(ob, -1.1, 0.6, s);
    ctx.add('chassis', extrude([[-1.22, 0.52], [-0.98, 0.58], [-0.94, 0.75], [-1.17, 0.68]], 0.006, { plane: 'zy', center: p.p[0] - s * 0.035 }), F.texturedBlack);
  }
  mWinglets(ctx, ob);
  innerCowl(ctx, { z0: SCREEN_BASE + 0.06, z1: -1.2, yTop0: 0.87, yTop1: 0.93, yBot0: 0.75, yBot1: 0.8, w0: 0.15, w1: 0.24 });
  // Headlights: LED reflector units with a sickle DRL guide around the outer/upper edge.
  for (const s of [-1, 1]) {
    const c = lampAt(s);
    const m = mul(T(c[0], c[1], -1.622), new THREE.Matrix4().makeRotationY(Math.PI), RX(0.3));
    lamp(ctx, 'chassis', HEAD.map(([x, y]) => [x * -s, y] as P2), m, { kind: 'head', inner: 'led', count: 2, depth: 0.05, rim: 0.003 });
    const pts: P3[] = [];
    for (let i = 0; i <= 6; i++) {
      const a = -0.4 + (i / 6) * 2.0;
      pts.push([c[0] + s * Math.cos(a) * 0.056, c[1] + Math.sin(a) * 0.036, -1.625 + i * 0.002]);
    }
    ledStrip(ctx, 'chassis', pts, 0.006, 0.0035, 'drl', [0, 0, -1]);
  }
  ctx.add('chassis', extrude(smooth2([[-0.04, 0.646], [0, 0.638], [0.04, 0.646], [0.048, 0.675], [0.03, 0.692], [-0.03, 0.692], [-0.048, 0.675]], 3, true), 0.16, { plane: 'xy', center: -1.56 }), F.texturedBlack);
  // Taller M racing screen.
  screen(ctx, 'chassis', {
    zs: stationsBetween(SCREEN_BASE, SCREEN_TOP_Z, 8, 0.35),
    top: curve([[SCREEN_BASE, 0.886], [-1.47, 0.945], [-1.37, 1.045], [-1.28, 1.13], [-1.21, 1.165], [SCREEN_TOP_Z, 1.17]]),
    bottom: curve([[SCREEN_BASE, 0.874], [-1.36, 0.92], [SCREEN_TOP_Z, 0.96]]),
    half: curve([[SCREEN_BASE, 0.15], [-1.42, 0.185], [-1.3, 0.172], [SCREEN_TOP_Z, 0.128]]),
    sections: [{ z: 0, pts: [[0, 1], [0.45, 0.985], [0.8, 0.93], [0.95, 0.8], [1, 0.55], [1, 0.25], [0.98, 0]] }],
  }, tint(F.screen, '#3a424c'));
  buildTank(ctx, {
    front: -1.2,
    back: -0.62,
    top: 1.065,
    bottomFront: 0.9,
    bottomBack: 0.8,
    width: 0.45,
    style: 'sport',
    knee: 0.16,
    capZ: -0.93,
    topLine: [[-1.2, 0.962], [-1.11, 0.995], [-1.0, 1.04], [-0.9, 1.063], [-0.8, 1.058], [-0.71, 1.015], [-0.65, 0.95], [-0.62, 0.89]],
    bottomLine: [[-1.2, 0.9], [-1.0, 0.865], [-0.8, 0.825], [-0.62, 0.8]],
    halfLine: [[-1.2, 0.12], [-1.1, 0.185], [-0.97, 0.222], [-0.84, 0.218], [-0.72, 0.185], [-0.62, 0.12]],
  });
  // M seat (single, grippy) and the passenger seat cover.
  buildSeat(ctx, { front: -0.66, back: -0.29, yFront: 0.828, y: 0.832, yBack: 0.865, width: 0.28, thick: 0.07, frontWidth: 0.18 }, tint(seatFinish(ctx), '#18191c'));
  const tb = tail();
  const tm = outlineLoft(tb, { su: ctx.seg(12, 4), sv: ctx.seg(6, 2), capBack: true });
  const seatHole: Field = fAnd(sideRegion([[-0.85, 0.81], [-0.282, 0.81], [-0.282, 1.4], [-0.85, 1.4]]), planRegion([[-0.85, -0.01], [-0.27, -0.01], [-0.27, 0.145], [-0.85, 0.145]]));
  const tailVent = sideRegion(smooth2([[-0.22, 0.8], [-0.05, 0.87], [0.04, 0.92], [0.01, 0.88], [-0.15, 0.79]], 3, true));
  addPanel(ctx, 'chassis', tm, fAnd(fNot(seatHole), fNot(tailVent)), PAINT, 0.0025, 0.012);
  undertray(ctx, { z0: -0.46, z1: 0.08, top0: 0.73, top1: 0.99, bot0: 0.68, botMid: 0.75, bot1: 0.95, w0: 0.135, w1: 0.035 });
  const tl: P2[] = smooth2([[-0.05, -0.004], [0.05, -0.004], [0.055, 0.004], [-0.055, 0.004]], 3, true);
  lamp(ctx, 'chassis', tl, mul(T(0, 0.985, 0.085), RX(-0.62)), { kind: 'tail', inner: 'led', count: 1, depth: 0.02, rim: 0.002, lensSmoked: true });
  frontFender(ctx, { from: -0.64, to: 0.8, gap: 0.02, width: 0.155, f: F.carbon });
  hugger(ctx, F.carbon);
  plateHanger(ctx, { fromZ: -0.05, fromY: 0.79 });
  fasteners(ctx, ob, [[-1.3, 0.87], [-1.05, 0.82], [-0.82, 0.55], [-1.0, 0.34], [-0.62, 0.3]]);
}

// ───────────────────────────── livery ─────────────────────────────

const M_LIGHT = '#2b8be0';
const M_DARK = '#2a2f7a';
const M_RED = '#d1001f';
const RACING_BLUE = '#1c4fa8';

/** M Motorsport stripes: light blue, dark blue/violet and red bands. */
function mStripes(p: Pen, pts: readonly P2[], w: number): void {
  p.line(pts, M_LIGHT, w);
  p.line(pts.map(([a, b]) => [a + w * 0.2, b - w * 1.05] as P2), M_DARK, w);
  p.line(pts.map(([a, b]) => [a + w * 0.4, b - w * 2.1] as P2), M_RED, w);
}

function lettering(p: Pen, color: string): void {
  if (p.view !== 'right' && p.view !== 'left') return;
  p.text('M 1000 RR', -0.16, 0.865, { color, size: 0.022, weight: '900', italic: true });
  p.text('M', -0.9, 0.62, { color, size: 0.09, weight: '900', italic: true, stretch: 1.1 });
}

function livery(c: LiveryCanvas, _lv: Livery, env: LiveryEnv): void {
  const black = env.index === 1;
  c.views(ALL_VIEWS, (p) => {
    if (black) {
      // Blackstorm Metallic with the M Motorsport stripes over the cowl and tail.
      p.fill('#17181b', 'metallic');
      if (p.view === 'right' || p.view === 'left') {
        mStripes(p, [[-1.66, 0.72], [-1.32, 0.63], [-1.02, 0.52], [-0.74, 0.44]], 0.018);
        mStripes(p, [[-0.6, 0.79], [-0.25, 0.86], [0.1, 1.01]], 0.012);
        lettering(p, '#c9ced6');
      } else if (p.view === 'top') {
        for (const [x, col] of [[-0.045, M_LIGHT], [0, M_DARK], [0.045, M_RED]] as const) p.rect(-1.0, x - 0.016, -0.66, x + 0.016, col);
      }
      return;
    }
    // Light White over Racing Blue, the M stripes sweeping up the side and the tail.
    p.fill('#f2f3f4', 'pearl');
    if (p.view === 'right' || p.view === 'left') {
      p.poly([[-1.75, 0.6], [-1.42, 0.56], [-1.1, 0.44], [-0.8, 0.36], [-0.45, 0.33], [-0.45, -0.1], [-1.75, -0.1]], RACING_BLUE, 'metallic');
      mStripes(p, [[-1.64, 0.71], [-1.3, 0.62], [-1.0, 0.51], [-0.72, 0.44]], 0.02);
      p.poly([[-0.62, 0.66], [0.15, 0.95], [0.15, 0.6], [-0.62, 0.6]], RACING_BLUE, 'metallic');
      mStripes(p, [[-0.6, 0.78], [-0.24, 0.85], [0.1, 1.0]], 0.012);
      lettering(p, '#1b1d22');
    } else if (p.view === 'top') {
      for (const [x, col] of [[-0.05, M_LIGHT], [0, M_DARK], [0.05, M_RED]] as const) p.rect(-1.0, x - 0.018, -0.66, x + 0.018, col);
    } else if (p.view === 'front') {
      p.rect(-1, -1, 1, 0.6, RACING_BLUE, 'metallic');
    }
  });
}

export function m1000rrBlueprint(spec: BikeSpec): BikeBlueprint {
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.085, 0.848, 1.215],
    wheelbase: 1.457,
    rakeDeg: 23.6,
    trail: 0.099,
    forkLength: 0.735,
    front: { tyre: '120/70ZR17', rimWidthIn: 3.5, crown: 0.8, tread: 'slickish', tyreLabel: 'Racetec RR' },
    rear: { tyre: '200/55ZR17', rimWidthIn: 6.0, crown: 0.9, tread: 'slickish', tyreLabel: 'Racetec RR' },
    // M Carbon wheels: dark clear-coated rims with the M stripe on the rim edge.
    frontWheel: { type: 'forged', spokes: 5, shape: 'straight', color: '#141517', stripe: '#2b8be0' },
    rearWheel: { type: 'forged', spokes: 5, shape: 'straight', color: '#141517', stripe: '#2b8be0' },
    fork: { type: 'usd', stanchion: 0.045, spacing: 0.214, outerColor: '#1c1d20', innerColor: '#3d4046', footColor: '#1c1d20', capColor: '#2a2c30', adjusterColor: '#1c4fa8', aboveClamp: 0.012, clampGap: 0.205 },
    frontBrake: { discs: 2, discDia: 0.32, disc: 'floating', carrierColor: '#2a2c30', caliper: 'radialMono4', caliperColor: '#1d5bd0', caliperText: 'M', caliperTextColor: '#f2f2f2', caliperAngleDeg: 76 },
    rearBrake: { discs: 1, discDia: 0.22, disc: 'fixed', carrierColor: '#2a2c30', caliper: 'axial1', caliperColor: '#2a2c30', caliperAngleDeg: 200 },
    frame: { type: 'twinSpar', color: '#25272b', metal: 0.75, rough: 0.4, subframe: 'cast', subframeColor: '#25272b', width: 0.37 },
    swingarm: { type: 'braced', length: 0.6, angleDeg: 10, color: '#25272b', metal: 0.75, rough: 0.4 },
    shock: { layout: 'mono', springColor: '#1d1e21', bodyColor: '#3a3d42', reservoir: true },
    drive: { type: 'chain', side: 'left', frontTeeth: 17, rearTeeth: 46, pitch: 0.015875, sprocketColor: '#1c4fa8' },
    engine: {
      layout: 'I4',
      cc: 999,
      crank: [0, 0.4, -0.82],
      tiltDeg: 32,
      caseColor: '#232428',
      coverColor: '#3a3d42',
      headColor: '#2a2c30',
      camCoverColor: '#1d1e21',
      camCoverText: 'M',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.44, h: 0.34, z: -1.27, y: 0.6, tiltDeg: 14, curved: true },
      width: 0.42,
    },
    exhaust: { route: 'underslung', side: 'right', can: 'box', canLength: 0.22, canDia: 0.115, canFinish: 'titanium', headerFinish: 'titanium' },
    cockpit: {
      bars: 'clipon',
      grip: [0.34, 0.905, -1.0],
      barDia: 0.022,
      dash: 'tftBmw',
      dashPos: [0, 1.035, -1.14],
      dashSize: [0.125, 0.072],
      dashTiltDeg: 50,
      dashMount: 'fairing',
      mirrors: 'fairing',
      mirrorPos: [0.335, 1.0, -1.28],
      mirrorSize: [0.15, 0.06],
      mirrorIndicators: false,
      mirrorShape: 'sport',
      mirrorColor: '#111214',
      topClamp: 'milled',
      steeringDamper: 'side',
      leverColor: '#1c4fa8',
      reservoirs: true,
      clutch: 'cable',
      ignition: 'keyless',
      switchColor: '#151618',
      gripColor: '#121212',
      barEndColor: '#1c4fa8',
    },
    lights: { head: 'sportTwin', tail: 'strip', rearIndicators: 'stalk' },
    seat: { height: 0.832, front: -0.66, back: -0.29, pillion: 'cowl', color: '#18191c' },
    rider: { hip: [0, 0.92, -0.44], peg: [0.19, 0.41, -0.42], torsoPitch: 0.8 },
    footrests: 'rearset',
    plate: { mount: 'hanger', pos: [0, 0.6, 0.36], tiltDeg: -14 },
    body,
    livery,
    groundClearance: 0.13,
    features: ['winglets'],
    zones: { splitY: 0.4, decal: [-0.9, 0.62] },
  };
}
