import * as THREE from 'three';
import type { BikeSpec, Livery } from '../../../data/bikes';
import { RX, T, mul, type KitContext } from '../context';
import { addPanel, bodyQ, buildSeat, buildTank, frontFender, PAINT, screen, seatFinish } from '../kit/body';
import { lamp, ledStrip } from '../kit/lights';
import { hugger, plateHanger } from '../kit/rear';
import { curve, outlineLoft, sideAt, stationsBetween, type OutlineBody } from '../kit/shape';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv, type Pen } from '../livery';
import { extrude, lathe, smooth2, type P2, type P3 } from '../mesh';
import { F, hard, tint } from '../sink';
import { cut, fAnd, fNot, frontRegion, fOr, planRegion, sideRegion, type Field } from '../surface';
import type { BikeBlueprint } from '../types';

/**
 * BMW S 1000 RR (2023+).
 * Spec sheet: wheelbase 1457 mm, rake 23.6°, trail ~98 mm, seat 832 mm,
 * 120/70ZR17 + 200/55ZR17, 45 mm USD fork, aluminium bridge frame with the engine
 * as a stressed member, under-braced swingarm, 999 cc ShiftCam inline four,
 * short underslung silencer on the right.
 * Design cues: symmetric LED headlights with sickle-shaped DRL guides either side of
 * the central ram-air intake, M winglets on the side fairing, three side gills,
 * slim tail with the rear lights in the indicators, M Motorsport colours.
 */

const NOSE = -1.705;
const SCREEN_BASE = -1.56;
const SCREEN_TOP_Z = -1.19;

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
  // The face template closes under the chin (intakes are cut into it explicitly).
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

function body(ctx: KitContext): void {
  const ob = fairing();
  const q = bodyQ(ctx, 1.7);
  const master = outlineLoft(ob, { su: q.su, sv: q.sv, creases: [2], capFront: true });
  const blackGloss = hard('#0b0c0e', 0.15, 0.2, 1);
  const A = ctx.hp.frontAxle;
  const open = sideRegion([[-1.21, 2], ...SIDE_EDGE, [-0.3, 0.1], [-0.3, 2]]);
  const arch = (_x: number, y: number, z: number) => 0.36 - Math.hypot(z - A[2], y - A[1]);
  const underScreen = fAnd(planRegion([[SCREEN_BASE + 0.08, -1], [-1.06, -1], [-1.06, 0.15], [-1.36, 0.165], [SCREEN_BASE + 0.08, 0.11]]), (_x, y) => y - 0.86);
  // Headlight openings either side, central ram-air intake below the beak.
  const lampAt = (s: number): P2 => [s * 0.085, 0.732];
  const headHole = (s: number): Field => frontRegion(HEAD.map(([x, y]) => [lampAt(s)[0] + x * s * 1.05, lampAt(s)[1] + y * 1.08] as P2), false);
  const intake = frontRegion(smooth2([[0, 0.69], [0.03, 0.692], [0.048, 0.675], [0.04, 0.646], [0.0, 0.638]], 3, true));
  const face = fAnd(fOr(headHole(1), headHole(-1), intake), (_x, _y, z) => -1.6 - z);
  const bodyCut = cut(master, fAnd(fNot(open), fNot(arch), fNot(underScreen), fNot(face)));
  const cowl = sideRegion([[-2, 2], [-1.37, 2], [-1.37, 0.94], [-1.4, 0.78], [-1.45, 0.66], [-1.51, 0.6], [-2, 0.58]]);
  const belly = sideRegion([[-1.15, 0.33], [-0.95, 0.31], [-0.7, 0.3], [-0.4, 0.3], [-0.4, -1], [-1.15, -1]]);
  // Three angled gills on the side panel.
  const gills: P2[][] = [0, 1, 2].map((i) => {
    const z0 = -1.2 + i * 0.075, y0 = 0.53 + i * 0.03;
    return [[z0, y0], [z0 + 0.05, y0 + 0.13], [z0 + 0.075, y0 + 0.13], [z0 + 0.025, y0]];
  });
  const gill = fOr(...gills.map((g) => sideRegion(g)));
  addPanel(ctx, 'chassis', bodyCut, cowl, PAINT, 0.003, 0.014);
  addPanel(ctx, 'chassis', bodyCut, fAnd(fNot(cowl), fNot(belly), fNot(gill)), PAINT, 0.003, 0.014);
  addPanel(ctx, 'chassis', bodyCut, fAnd(belly, fNot(cowl)), PAINT, 0.003, 0.014);
  for (const s of [-1, 1]) {
    // Dark wall behind the gills
    const p = sideAt(ob, -1.1, 0.6, s);
    ctx.add('chassis', extrude([[-1.22, 0.52], [-0.98, 0.58], [-0.94, 0.75], [-1.17, 0.68]], 0.006, { plane: 'zy', center: p.p[0] - s * 0.035 }), F.texturedBlack);
    // M winglet: a short carbon blade standing out of the side fairing ahead of the gills.
    const w = sideAt(ob, -1.32, 0.66, s);
    const blade: P2[] = [[-1.42, 0.664], [-1.3, 0.676], [-1.26, 0.668], [-1.4, 0.652]];
    ctx.add('chassis', extrude(blade, 0.06, { plane: 'zy', center: w.p[0] + s * 0.024, bevel: 0.002 }), F.carbon);
    ctx.add('chassis', extrude([[-1.42, 0.62], [-1.3, 0.63], [-1.27, 0.7], [-1.4, 0.69]], 0.003, { plane: 'zy', center: w.p[0] + s * 0.054 }), F.carbon);
  }
  // Inner panel under the screen.
  ctx.add('chassis', outlineLoft(
    {
      zs: stationsBetween(SCREEN_BASE + 0.06, -1.2, 6, 0.3),
      top: curve([[SCREEN_BASE + 0.06, 0.87], [-1.36, 0.9], [-1.2, 0.93]]),
      bottom: curve([[SCREEN_BASE + 0.06, 0.75], [-1.2, 0.8]]),
      half: curve([[SCREEN_BASE + 0.06, 0.15], [-1.36, 0.2], [-1.2, 0.24]]),
      sections: [{ z: 0, pts: [[0, 1], [0.5, 0.98], [0.86, 0.88], [0.98, 0.65], [1, 0.4], [0.97, 0.15], [0.9, 0]] }],
    },
    { su: ctx.seg(6, 2), sv: ctx.seg(4, 2) },
  ), F.texturedBlack);
  // Headlights: LED reflector units with a sickle DRL guide around the outer/upper edge.
  for (const s of [-1, 1]) {
    const c = lampAt(s);
    const m = mul(T(c[0], c[1], -1.622), new THREE.Matrix4().makeRotationY(Math.PI), RX(0.3));
    const outline = HEAD.map(([x, y]) => [x * -s, y] as P2);
    lamp(ctx, 'chassis', outline, m, { kind: 'head', inner: 'projector', count: 1, depth: 0.05, rim: 0.003 });
    const pts: P3[] = [];
    for (let i = 0; i <= 6; i++) {
      const a = -0.4 + (i / 6) * 2.0;
      pts.push([c[0] + s * Math.cos(a) * 0.056, c[1] + Math.sin(a) * 0.036, -1.625 + i * 0.002]);
    }
    ledStrip(ctx, 'chassis', pts, 0.006, 0.0035, 'drl', [0, 0, -1]);
  }
  // Ram-air throat
  ctx.add('chassis', extrude(smooth2([[-0.04, 0.646], [0, 0.638], [0.04, 0.646], [0.048, 0.675], [0.03, 0.692], [-0.03, 0.692], [-0.048, 0.675]], 3, true), 0.16, { plane: 'xy', center: -1.56 }), F.texturedBlack);
  screen(ctx, 'chassis', {
    zs: stationsBetween(SCREEN_BASE, SCREEN_TOP_Z, 8, 0.35),
    top: curve([[SCREEN_BASE, 0.886], [-1.47, 0.94], [-1.37, 1.03], [-1.28, 1.11], [-1.22, 1.14], [SCREEN_TOP_Z, 1.145]]),
    bottom: curve([[SCREEN_BASE, 0.874], [-1.36, 0.92], [SCREEN_TOP_Z, 0.96]]),
    half: curve([[SCREEN_BASE, 0.15], [-1.42, 0.185], [-1.3, 0.17], [SCREEN_TOP_Z, 0.125]]),
    sections: [{ z: 0, pts: [[0, 1], [0.45, 0.985], [0.8, 0.93], [0.95, 0.8], [1, 0.55], [1, 0.25], [0.98, 0]] }],
  }, tint(F.screen, '#3f4750'));
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
  buildSeat(ctx, { front: -0.66, back: -0.29, yFront: 0.828, y: 0.832, yBack: 0.865, width: 0.28, thick: 0.07, frontWidth: 0.18 });
  buildSeat(ctx, { front: -0.27, back: -0.04, yFront: 0.92, y: 0.935, yBack: 0.955, width: 0.19, thick: 0.045, frontWidth: 0.15 }, tint(seatFinish(ctx), '#161616'));
  const tb = tail();
  const tm = outlineLoft(tb, { su: ctx.seg(12, 4), sv: ctx.seg(6, 2), capBack: true });
  const seatHole: Field = fAnd(
    fOr(sideRegion([[-0.85, 0.81], [-0.282, 0.81], [-0.282, 1.4], [-0.85, 1.4]]), sideRegion([[-0.272, 0.905], [-0.03, 0.905], [-0.03, 1.4], [-0.272, 1.4]])),
    planRegion([[-0.85, -0.01], [-0.02, -0.01], [-0.02, 0.1], [-0.27, 0.1], [-0.28, 0.145], [-0.85, 0.145]]),
  );
  const tailVent = sideRegion(smooth2([[-0.22, 0.8], [-0.05, 0.87], [0.04, 0.92], [0.01, 0.88], [-0.15, 0.79]], 3, true));
  addPanel(ctx, 'chassis', tm, fAnd(fNot(seatHole), fNot(tailVent)), PAINT, 0.0025, 0.012);
  const ut: OutlineBody = {
    zs: stationsBetween(-0.46, 0.08, 7, 0.4),
    top: curve([[-0.46, 0.73], [0.08, 0.99]]),
    bottom: curve([[-0.46, 0.68], [-0.1, 0.75], [0.08, 0.95]]),
    half: curve([[-0.46, 0.135], [0.08, 0.035]]),
    sections: [{ z: 0, pts: [[0, 1], [0.6, 0.95], [0.95, 0.7], [1, 0.45], [0.9, 0.2], [0.5, 0.02], [0, 0]] }],
  };
  ctx.add('chassis', outlineLoft(ut, { su: ctx.seg(5, 2), sv: ctx.seg(3, 2) }), F.texturedBlack);
  // Slim LED light strip under the tail tip (the indicators carry the stop/tail function too).
  const tl: P2[] = smooth2([[-0.05, -0.004], [0.05, -0.004], [0.055, 0.004], [-0.055, 0.004]], 3, true);
  lamp(ctx, 'chassis', tl, mul(T(0, 0.985, 0.085), RX(-0.62)), { kind: 'tail', inner: 'led', count: 1, depth: 0.02, rim: 0.002, lensSmoked: true });
  frontFender(ctx, { from: -0.64, to: 0.8, gap: 0.02, width: 0.155 });
  hugger(ctx, blackGloss);
  plateHanger(ctx, { fromZ: -0.05, fromY: 0.79 });
  if (ctx.micro) {
    for (const s of [-1, 1]) {
      for (const [z, y] of [[-1.3, 0.87], [-1.05, 0.82], [-0.82, 0.55], [-1.0, 0.34], [-0.62, 0.3]] as const) {
        const sp = sideAt(ob, z, y, s);
        const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), new THREE.Vector3(...sp.n).negate(), new THREE.Vector3(0, 1, 0));
        m.setPosition(sp.p[0] + sp.n[0] * 0.001, sp.p[1], sp.p[2]);
        ctx.add('chassis', lathe([[0, 0], [0.0055, 0], [0.005, 0.0025], [0, 0.003]], { segs: 10, axis: 'z' }), F.texturedBlack, m);
      }
    }
  }
}

const M_BLUE = '#1c69d4';
const M_DARK = '#2a2f7a';
const M_RED = '#d1001f';

function lettering(p: Pen, color: string): void {
  if (p.view !== 'right' && p.view !== 'left') return;
  p.text('S 1000 RR', -0.2, 0.86, { color, size: 0.024, weight: '800', italic: true });
  p.text('RR', -0.88, 0.47, { color, size: 0.085, weight: '900', italic: true, stretch: 1.1 });
}

/** M Motorsport stripes: three parallel bands (light blue, dark blue, red). */
function mStripes(p: Pen, pts: readonly P2[], w: number): void {
  p.line(pts, M_BLUE, w);
  p.line(pts.map(([a, b]) => [a + w * 0.2, b - w * 1.05] as P2), M_DARK, w);
  p.line(pts.map(([a, b]) => [a + w * 0.4, b - w * 2.1] as P2), M_RED, w);
}

function livery(c: LiveryCanvas, lv: Livery, env: LiveryEnv): void {
  const black = env.index === 1;
  c.views(ALL_VIEWS, (p) => {
    if (black) {
      p.fill(lv.primary, 'metallic');
      if (p.view === 'right' || p.view === 'left') {
        p.line([[-1.7, 0.73], [-1.3, 0.62], [-0.9, 0.42]], M_BLUE, 0.008);
        lettering(p, '#c9ced6');
      }
      return;
    }
    // Light White with Racing Blue lower fairing and the M stripes sweeping up the side.
    p.fill('#f2f3f4', 'pearl');
    if (p.view === 'right' || p.view === 'left') {
      p.poly([[-1.75, 0.6], [-1.42, 0.56], [-1.1, 0.44], [-0.8, 0.36], [-0.45, 0.33], [-0.45, -0.1], [-1.75, -0.1]], M_BLUE, 'metallic');
      mStripes(p, [[-1.62, 0.7], [-1.3, 0.61], [-1.0, 0.5], [-0.72, 0.43]], 0.02);
      p.poly([[-0.62, 0.66], [0.15, 0.95], [0.15, 0.6], [-0.62, 0.6]], M_BLUE, 'metallic');
      p.line([[-0.6, 0.75], [-0.2, 0.84], [0.12, 0.98]], M_RED, 0.012);
      lettering(p, '#ffffff');
    } else if (p.view === 'top') {
      for (const [x, col] of [[-0.05, M_BLUE], [0, M_DARK], [0.05, M_RED]] as const) p.rect(-1.0, x - 0.018, -0.66, x + 0.018, col);
    } else if (p.view === 'front') {
      p.rect(-1, -1, 1, 0.6, M_BLUE, 'metallic');
    }
  });
}

export function s1000rrBlueprint(spec: BikeSpec): BikeBlueprint {
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.073, 0.848, 1.205],
    wheelbase: 1.457,
    rakeDeg: 23.6,
    trail: 0.098,
    forkLength: 0.735,
    front: { tyre: '120/70ZR17', rimWidthIn: 3.5, crown: 0.82, tread: 'sport', tyreLabel: 'Racetec RR' },
    rear: { tyre: '200/55ZR17', rimWidthIn: 6.0, crown: 0.92, tread: 'sport', tyreLabel: 'Racetec RR' },
    frontWheel: { type: 'forged', spokes: 7, shape: 'straight', color: spec.liveries[0].wheel === '#1c69d4' ? '#1c4fa8' : '#1d1e21', machinedLip: false },
    rearWheel: { type: 'forged', spokes: 7, shape: 'straight', color: spec.liveries[0].wheel === '#1c69d4' ? '#1c4fa8' : '#1d1e21', machinedLip: false },
    fork: { type: 'usd', stanchion: 0.045, spacing: 0.214, outerColor: '#1c1d20', innerColor: '#c9ccd2', footColor: '#1c1d20', capColor: '#2a2c30', adjusterColor: '#c99a2c', aboveClamp: 0.012, clampGap: 0.205 },
    frontBrake: { discs: 2, discDia: 0.32, disc: 'floating', carrierColor: '#2a2c30', caliper: 'radialMono4', caliperColor: '#1c4fa8', caliperText: 'BMW', caliperTextColor: '#f2f2f2', caliperAngleDeg: 76 },
    rearBrake: { discs: 1, discDia: 0.22, disc: 'fixed', carrierColor: '#2a2c30', caliper: 'axial1', caliperColor: '#2a2c30', caliperAngleDeg: 200 },
    frame: { type: 'twinSpar', color: '#8e949b', metal: 0.85, rough: 0.38, subframe: 'cast', subframeColor: '#2a2c30', width: 0.37 },
    swingarm: { type: 'braced', length: 0.6, angleDeg: 10, color: '#8e949b', metal: 0.85, rough: 0.38 },
    shock: { layout: 'mono', springColor: '#c9a028', bodyColor: '#2a2c30', reservoir: true },
    drive: { type: 'chain', side: 'left', frontTeeth: 17, rearTeeth: 45, pitch: 0.015875, sprocketColor: '#1d1e21' },
    engine: {
      layout: 'I4',
      cc: 999,
      crank: [0, 0.4, -0.82],
      tiltDeg: 32,
      caseColor: '#232428',
      coverColor: '#3a3d42',
      headColor: '#2a2c30',
      camCoverColor: '#1d1e21',
      camCoverText: 'BMW',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.44, h: 0.34, z: -1.27, y: 0.6, tiltDeg: 14, curved: true },
      width: 0.42,
    },
    exhaust: { route: 'underslung', side: 'right', can: 'box', canLength: 0.24, canDia: 0.12, canFinish: 'steel', headerFinish: 'steel' },
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
      leverColor: '#1e1f22',
      reservoirs: true,
      clutch: 'cable',
      ignition: 'keyless',
      switchColor: '#151618',
      gripColor: '#121212',
      barEndColor: '#1d1e21',
    },
    lights: { head: 'sportTwin', tail: 'strip', rearIndicators: 'stalk' },
    seat: { height: 0.832, front: -0.66, back: -0.29, pillion: 'seat', color: '#141414' },
    rider: { hip: [0, 0.92, -0.44], peg: [0.19, 0.4, -0.42], torsoPitch: 0.76 },
    footrests: 'rearset',
    plate: { mount: 'hanger', pos: [0, 0.6, 0.36], tiltDeg: -14 },
    body,
    livery,
    groundClearance: 0.13,
    features: ['winglets'],
    zones: { splitY: 0.4, decal: [-0.88, 0.47] },
  };
}
