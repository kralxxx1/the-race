import type { BikeSpec, Livery } from '../../../data/bikes';
import { T, type KitContext } from '../context';
import { addPanel, bodyQ, buildSeat, buildTank, frontFender, PAINT, screen, seatFinish } from '../kit/body';
import { can, canHanger, collector, headers, heatPipe } from '../kit/jp-sport-exhaust';
import { bladeSlats, ductLiner, ductWall, faceLamps, fasteners, frontHit, innerCowl, tailLamp, undertray } from '../kit/jp-sport-parts';
import { ledStrip } from '../kit/lights';
import { hugger, plateHanger } from '../kit/rear';
import { curve, outlineLoft, stationsBetween, type OutlineBody } from '../kit/shape';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv, type Pen } from '../livery';
import { roundBox, smooth2, type P2, type P3 } from '../mesh';
import { F, hard, tint, vary } from '../sink';
import { cut, fAnd, fNot, frontRegion, fOr, planRegion, sideRegion, type Field } from '../surface';
import type { BikeBlueprint } from '../types';

/**
 * Suzuki GSX-R1000R (2017+).
 * Spec sheet: wheelbase 1420 mm, caster 23°20', trail 95 mm, seat 825 mm,
 * L×W×H 2075 × 705 × 1145 mm, ground clearance 130 mm, 120/70ZR17 + 190/55ZR17 on
 * 3.50/6.00 rims, Showa BFF 43 mm fork with the external damper chambers at the feet,
 * Brembo monoblock calipers on 320 mm T-drive discs, aluminium twin-spar frame,
 * braced aluminium swingarm, 999 cc inline four with variable valve timing.
 * Design cues: long pointed nose with one LED headlight in its centre, twin ram-air
 * intakes below it either side of the beak, slim LED position lights along the upper
 * edges of the nose, a big side air exit, MotoGP-style Triton Blue livery, and the
 * short triangular-section silencer angled up on the right.
 */

const NOSE = -1.675;
const SCREEN_BASE = -1.53;
const SCREEN_TOP_Z = -1.16;

const SIDE_EDGE: P2[] = [
  [-1.18, 0.98],
  [-1.09, 0.95],
  [-1.0, 0.895],
  [-0.89, 0.815],
  [-0.79, 0.66],
  [-0.72, 0.5],
  [-0.66, 0.37],
  [-0.59, 0.27],
  [-0.51, 0.2],
  [-0.45, 0.17],
];

function fairing(): OutlineBody {
  const zs = [NOSE, -1.67, -1.66, -1.645, -1.625, -1.595, -1.555, -1.505, -1.445, -1.375, -1.295, -1.21, -1.12, -1.02, -0.92, -0.82, -0.72, -0.62, -0.53, -0.45];
  const face: P2[] = [[0, 1], [0.3, 0.955], [0.62, 0.85], [0.86, 0.67], [0.98, 0.45], [0.9, 0.21], [0.56, 0.045], [0, 0]];
  const cowl: P2[] = [[0, 1], [0.35, 0.985], [0.65, 0.935], [0.83, 0.8], [0.96, 0.6], [1, 0.38], [0.95, 0.12], [0.76, 0]];
  const side: P2[] = [[0, 1], [0.38, 0.99], [0.68, 0.95], [0.86, 0.82], [0.97, 0.6], [1, 0.36], [0.93, 0.1], [0.6, 0]];
  const back: P2[] = [[0, 1], [0.42, 0.99], [0.72, 0.95], [0.9, 0.82], [0.98, 0.6], [1, 0.36], [0.92, 0.1], [0.5, 0]];
  return {
    zs,
    top: curve([[NOSE, 0.785], [-1.65, 0.812], [-1.59, 0.842], [-1.5, 0.877], [-1.4, 0.91], [-1.29, 0.94], [-1.17, 0.962], [-1.03, 0.955], [-0.85, 0.905], [-0.65, 0.83], [-0.45, 0.74]]),
    bottom: curve([[NOSE, 0.768], [-1.668, 0.72], [-1.65, 0.678], [-1.615, 0.645], [-1.56, 0.622], [-1.49, 0.608], [-1.41, 0.595], [-1.33, 0.505], [-1.21, 0.34], [-1.07, 0.212], [-0.92, 0.155], [-0.72, 0.145], [-0.57, 0.155], [-0.45, 0.185]]),
    half: curve([[NOSE, 0.012], [-1.668, 0.062], [-1.65, 0.112], [-1.61, 0.156], [-1.54, 0.2], [-1.44, 0.238], [-1.33, 0.266], [-1.19, 0.286], [-1.03, 0.292], [-0.87, 0.283], [-0.67, 0.252], [-0.45, 0.2]]),
    sections: [
      { z: NOSE, pts: face },
      { z: -1.59, pts: face },
      { z: -1.37, pts: cowl },
      { z: -0.99, pts: side },
      { z: -0.45, pts: back },
    ],
  };
}

function tail(): OutlineBody {
  return {
    zs: stationsBetween(-0.67, 0.1, 14, 0.5),
    top: curve([[-0.67, 0.825], [-0.48, 0.833], [-0.31, 0.856], [-0.25, 0.92], [-0.1, 0.968], [0.03, 1.008], [0.1, 1.035]]),
    bottom: curve([[-0.67, 0.68], [-0.4, 0.71], [-0.16, 0.78], [0.0, 0.885], [0.07, 0.975], [0.1, 1.0]]),
    half: curve([[-0.67, 0.152], [-0.46, 0.142], [-0.24, 0.12], [-0.03, 0.088], [0.1, 0.03]]),
    sections: [
      { z: -0.67, pts: [[0, 1], [0.6, 0.98], [0.95, 0.84], [1, 0.55], [0.93, 0.22], [0.6, 0.02], [0, 0]] },
      { z: 0.1, pts: [[0, 1], [0.72, 0.97], [1, 0.74], [0.98, 0.46], [0.84, 0.2], [0.42, 0.02], [0, 0]] },
    ],
  };
}

/** Centre headlight (front view): an inverted shield on the centre line, under the beak. */
const HEAD: P2[] = smooth2([[-0.062, 0.752], [0.062, 0.752], [0.068, 0.74], [0.038, 0.712], [0.0, 0.703], [-0.038, 0.712], [-0.068, 0.74]], 2, true);
/** Right ram-air intake below and beside the headlight. */
const INTAKE: P2[] = [[0.072, 0.712], [0.1, 0.728], [0.136, 0.738], [0.152, 0.724], [0.146, 0.69], [0.112, 0.672], [0.078, 0.676]];
/** Side air exit behind the front wheel. */
const EXIT: P2[] = [[-1.215, 0.6], [-1.06, 0.665], [-0.95, 0.652], [-0.975, 0.565], [-1.12, 0.52], [-1.2, 0.54]];

function body(ctx: KitContext): void {
  const ob = fairing();
  const q = bodyQ(ctx, 1.7);
  const master = outlineLoft(ob, { su: q.su, sv: q.sv, creases: [2], capFront: true });
  const blackGloss = hard('#0b0c0e', 0.15, 0.2, 1);
  const A = ctx.hp.frontAxle;
  const open = sideRegion([[-1.18, 2], ...SIDE_EDGE, [-0.3, 0.1], [-0.3, 2]]);
  const arch = (_x: number, y: number, z: number) => 0.36 - Math.hypot(z - A[2], y - A[1]);
  const underScreen = fAnd(planRegion([[SCREEN_BASE + 0.08, -1], [-1.03, -1], [-1.03, 0.15], [-1.33, 0.165], [SCREEN_BASE + 0.08, 0.11]]), (_x, y) => y - 0.86);
  // The centre headlight is one unit spanning the centre line: place it as a single lamp.
  const head = faceLamps(ob, { outline: HEAD, at: [0, 0.73], single: true, inset: 0.018, square: 0.5, opts: { kind: 'head', inner: 'led', count: 1, depth: 0.04, rim: 0.004 } });
  const intakeF = fAnd(frontRegion(smooth2(INTAKE, 3, true)), (_x, _y, z) => -1.55 - z);
  const exit = sideRegion(smooth2(EXIT, 3, true));
  const bodyCut = cut(master, fAnd(fNot(open), fNot(arch), fNot(underScreen), fNot(fOr(head.hole, intakeF)), fNot(exit)));
  const cowl = sideRegion([[-2, 2], [-1.33, 2], [-1.33, 0.94], [-1.37, 0.79], [-1.42, 0.67], [-1.49, 0.6], [-2, 0.58]]);
  const belly = sideRegion([[-1.13, 0.33], [-0.93, 0.31], [-0.68, 0.3], [-0.4, 0.3], [-0.4, -1], [-1.13, -1]]);
  addPanel(ctx, 'chassis', bodyCut, cowl, PAINT, 0.003, 0.014);
  addPanel(ctx, 'chassis', bodyCut, fAnd(fNot(cowl), fNot(belly)), PAINT, 0.003, 0.014);
  addPanel(ctx, 'chassis', bodyCut, fAnd(belly, fNot(cowl)), PAINT, 0.003, 0.014);
  // Side exit: dark wall and two slanted louvres.
  ductWall(ctx, ob, EXIT.map(([z, y]) => [z + (z < -1.08 ? -0.01 : 0.01), y + (y > 0.59 ? 0.01 : -0.01)] as P2), -1.08, 0.59, 0.04);
  for (let i = 0; i < 2; i++) {
    const z0 = -1.15 + i * 0.075;
    bladeSlats(ctx, ob, [[[z0, 0.535], [z0 + 0.05, 0.645], [z0 + 0.062, 0.645], [z0 + 0.012, 0.535]]], 0.006, 0.025, F.satinBlack);
  }
  // Twin ram-air intakes: deep black ducts.
  for (const s of [1, -1]) ductLiner(ctx, ob, INTAKE.map(([x, y]) => [s * x, y] as P2), -1.48, 0.8);
  if (ctx.micro) for (const s of [-1, 1]) ctx.add('chassis', roundBox(0.06, 0.004, 0.004, 0.001), F.texturedBlack, T(s * 0.112, 0.705, -1.53));
  // Centre LED headlight with a chrome reflector band.
  head.add(ctx, 'chassis');
  // LED position lights: slim strips following the upper edges of the nose.
  for (const s of [-1, 1]) {
    const pts: P3[] = [];
    let nrm: P3 = [0, 0, -1];
    for (const [x, y] of [[0.07, 0.76], [0.1, 0.772], [0.132, 0.78], [0.16, 0.776]] as P2[]) {
      const h = frontHit(ob, s * x, y);
      if (h) {
        pts.push([h.p[0] + h.n[0] * 0.0015, h.p[1] + h.n[1] * 0.0015, h.p[2] + h.n[2] * 0.0015]);
        nrm = h.n;
      }
    }
    if (pts.length >= 3) ledStrip(ctx, 'chassis', pts, 0.006, 0.003, 'drl', nrm);
  }
  innerCowl(ctx, { z0: SCREEN_BASE + 0.06, z1: -1.16, yTop0: 0.87, yTop1: 0.93, yBot0: 0.75, yBot1: 0.8, w0: 0.15, w1: 0.24 });
  screen(ctx, 'chassis', {
    zs: stationsBetween(SCREEN_BASE, SCREEN_TOP_Z, 8, 0.35),
    top: curve([[SCREEN_BASE, 0.89], [-1.44, 0.945], [-1.34, 1.035], [-1.25, 1.11], [-1.19, 1.14], [SCREEN_TOP_Z, 1.145]]),
    bottom: curve([[SCREEN_BASE, 0.878], [-1.33, 0.925], [SCREEN_TOP_Z, 0.962]]),
    half: curve([[SCREEN_BASE, 0.15], [-1.39, 0.186], [-1.27, 0.172], [SCREEN_TOP_Z, 0.127]]),
    sections: [{ z: 0, pts: [[0, 1], [0.45, 0.985], [0.8, 0.93], [0.95, 0.8], [1, 0.55], [1, 0.25], [0.98, 0]] }],
  }, tint(F.screen, '#3c4651'));
  buildTank(ctx, {
    front: -1.17,
    back: -0.6,
    top: 1.06,
    bottomFront: 0.9,
    bottomBack: 0.8,
    width: 0.44,
    style: 'sport',
    knee: 0.16,
    capZ: -0.9,
    topLine: [[-1.17, 0.962], [-1.08, 0.995], [-0.97, 1.04], [-0.87, 1.061], [-0.77, 1.054], [-0.69, 1.01], [-0.63, 0.945], [-0.6, 0.9]],
    bottomLine: [[-1.17, 0.9], [-0.98, 0.865], [-0.78, 0.825], [-0.6, 0.8]],
    halfLine: [[-1.17, 0.12], [-1.07, 0.184], [-0.94, 0.22], [-0.81, 0.215], [-0.7, 0.182], [-0.6, 0.12]],
  });
  buildSeat(ctx, { front: -0.64, back: -0.28, yFront: 0.822, y: 0.825, yBack: 0.858, width: 0.275, thick: 0.07, frontWidth: 0.17 });
  buildSeat(ctx, { front: -0.265, back: -0.02, yFront: 0.915, y: 0.928, yBack: 0.95, width: 0.185, thick: 0.045, frontWidth: 0.145 }, tint(seatFinish(ctx), '#161616'));
  const tm = outlineLoft(tail(), { su: ctx.seg(12, 4), sv: ctx.seg(6, 2), capBack: true });
  const seatHole: Field = fAnd(
    fOr(sideRegion([[-0.85, 0.8], [-0.272, 0.8], [-0.272, 1.4], [-0.85, 1.4]]), sideRegion([[-0.262, 0.895], [-0.01, 0.895], [-0.01, 1.4], [-0.262, 1.4]])),
    planRegion([[-0.85, -0.01], [0.0, -0.01], [0.0, 0.098], [-0.26, 0.098], [-0.27, 0.142], [-0.85, 0.142]]),
  );
  addPanel(ctx, 'chassis', tm, fNot(seatHole), PAINT, 0.0025, 0.012);
  undertray(ctx, { z0: -0.45, z1: 0.08, top0: 0.73, top1: 0.99, bot0: 0.68, botMid: 0.745, bot1: 0.95, w0: 0.135, w1: 0.034 });
  // LED tail light: a wedge across the tail tip.
  tailLamp(ctx, smooth2([[-0.075, -0.008], [0.075, -0.008], [0.085, 0.006], [0.0, 0.012], [-0.085, 0.006]], 4, true), [0, 0.985, 0.085], -0.75, { depth: 0.035 });
  frontFender(ctx, { from: -0.62, to: 0.82, gap: 0.02, width: 0.155 });
  hugger(ctx, blackGloss);
  plateHanger(ctx, { fromZ: -0.03, fromY: 0.79 });
  fasteners(ctx, ob, [[-1.28, 0.87], [-1.03, 0.82], [-0.8, 0.55], [-0.98, 0.34], [-0.6, 0.3]]);
  exhaust(ctx);
}

/** 4-2-1 headers into the under-engine collector, link pipe and the triangular can. */
function exhaust(ctx: KitContext): void {
  const c = ctx.bp.engine.crank;
  const lowY = 0.17;
  const col: P3 = [0.02, lowY + 0.03, c[2] + 0.06];
  headers(ctx, {
    r: 0.018,
    heat: 'titanium',
    route: (_i, p) => [
      [p.pos[0] * 1.05, c[1] + 0.02, c[2] - 0.2],
      [p.pos[0] * 0.7 + 0.01, lowY + 0.05, c[2] - 0.08],
      [col[0] + p.pos[0] * 0.2, col[1], col[2] - 0.06],
    ],
  });
  collector(ctx, col, 0.05, 0.16, 'titanium', 0.6);
  const a: P3 = [0.155, 0.34, -0.43];
  const b: P3 = [0.185, 0.525, -0.1];
  heatPipe(ctx, [[col[0], col[1], col[2] + 0.08], [0.08, lowY + 0.03, c[2] + 0.28], [0.14, 0.27, -0.5], a], 0.026, 'titanium', 0.6, 0.9);
  can(ctx, { a, b, shape: 'tri', r0: 0.072, r1: 0.062, finish: vary(F.titanium, { rough: 0.26 }), cap: F.texturedBlack, slash: 0.35, roll: Math.PI / 6 });
  canHanger(ctx, [0.15, 0.48, -0.22], [0.11, 0.66, -0.3]);
  ctx.anchor('exhaustOutlet', b);
}

// ───────────────────────────── livery ─────────────────────────────

const TRITON = '#1747a6';
const SILVER = '#c3c7cd';

function lettering(p: Pen, main: string, accent: string): void {
  if (p.view !== 'right' && p.view !== 'left') return;
  p.text('GSX-R', -0.925, 0.445, { color: main, size: 0.068, italic: true, weight: '900', stretch: 1.05 });
  p.text('SUZUKI', -1.42, 0.79, { color: main, size: 0.032, italic: true, weight: '900', spacing: 0.04 });
  p.text('1000R', -0.08, 0.89, { color: accent, size: 0.024, italic: true, weight: '800' });
}

function livery(c: LiveryCanvas, lv: Livery, env: LiveryEnv): void {
  const black = env.index === 1;
  c.views(ALL_VIEWS, (p) => {
    if (black) {
      // Glass Sparkle Black: metallic black with red pinstripes and grey lettering.
      p.fill(lv.primary, 'metallic');
      if (p.view === 'right' || p.view === 'left') {
        p.line([[-1.66, 0.7], [-1.35, 0.62], [-1.0, 0.5], [-0.72, 0.43]], '#c8102e', 0.008);
        p.line([[-0.6, 0.74], [-0.2, 0.83], [0.1, 0.97]], '#c8102e', 0.006);
        lettering(p, '#8a8f97', '#c8102e');
      }
      return;
    }
    // Metallic Triton Blue MotoGP colours: blue body, silver wedge over the lower flank,
    // black belly, white lettering.
    p.fill(TRITON, 'metallic');
    if (p.view === 'right' || p.view === 'left') {
      p.poly([[-1.7, 0.66], [-1.4, 0.6], [-1.1, 0.5], [-0.8, 0.42], [-0.6, 0.35], [-0.45, 0.33], [-0.45, 0.28], [-1.7, 0.28]], SILVER, 'metallic');
      p.poly([[-1.2, 0.3], [-0.45, 0.3], [-0.45, -0.1], [-1.2, -0.1]], '#101114', 'gloss');
      p.line([[-1.7, 0.672], [-1.4, 0.612], [-1.1, 0.512], [-0.8, 0.432], [-0.6, 0.362]], '#0e1f4d', 0.008);
      p.poly([[-0.62, 0.7], [0.15, 0.95], [0.15, 0.88], [-0.62, 0.66]], SILVER, 'metallic');
      lettering(p, '#ffffff', '#ffffff');
    } else if (p.view === 'front') {
      p.rect(-1, -1, 1, 0.66, SILVER, 'metallic');
    } else if (p.view === 'top') {
      p.rect(-0.95, -0.02, -0.62, 0.02, SILVER, 'metallic');
    }
  });
}

export function gsxrBlueprint(spec: BikeSpec): BikeBlueprint {
  const lv = spec.liveries[0];
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.075, 0.705, 1.145],
    wheelbase: 1.42,
    rakeDeg: 23.33,
    trail: 0.095,
    forkLength: 0.72,
    front: { tyre: '120/70ZR17', rimWidthIn: 3.5, crown: 0.82, tread: 'sport', tyreLabel: 'Sport Radial RR' },
    rear: { tyre: '190/55ZR17', rimWidthIn: 6.0, crown: 0.92, tread: 'sport', tyreLabel: 'Sport Radial RR' },
    frontWheel: { type: 'cast', spokes: 6, shape: 'straight', color: lv.wheel },
    rearWheel: { type: 'cast', spokes: 6, shape: 'straight', color: lv.wheel },
    fork: { type: 'usd', stanchion: 0.043, spacing: 0.21, outerColor: '#c39a3a', innerColor: '#2a2b2f', footColor: '#1c1d20', capColor: '#2a2c30', adjusterColor: '#c99a2c', aboveClamp: 0.012, clampGap: 0.2 },
    frontBrake: { discs: 2, discDia: 0.32, disc: 'floating', carrierColor: '#2b2d31', caliper: 'radialMono4', caliperColor: '#56595f', caliperText: 'brembo', caliperTextColor: '#d4202a', caliperAngleDeg: 76 },
    rearBrake: { discs: 1, discDia: 0.22, disc: 'fixed', carrierColor: '#2b2d31', caliper: 'axial1', caliperColor: '#2b2d31', caliperAngleDeg: 200 },
    frame: { type: 'twinSpar', color: '#4a4e55', metal: 0.85, rough: 0.36, subframe: 'cast', subframeColor: '#232428', width: 0.36 },
    swingarm: { type: 'braced', length: 0.577, angleDeg: 10, color: '#4a4e55', metal: 0.85, rough: 0.36 },
    shock: { layout: 'mono', springColor: '#2a2c30', bodyColor: '#c9a028', reservoir: true },
    drive: { type: 'chain', side: 'left', frontTeeth: 17, rearTeeth: 43, pitch: 0.015875, sprocketColor: '#1e1f22' },
    engine: {
      layout: 'I4',
      cc: 999,
      crank: [0, 0.4, -0.8],
      tiltDeg: 32,
      caseColor: '#232428',
      coverColor: '#3a3d42',
      headColor: '#2a2c30',
      camCoverColor: '#1a1b1e',
      camCoverText: 'SUZUKI',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.44, h: 0.34, z: -1.24, y: 0.6, tiltDeg: 14, curved: true },
      width: 0.4,
    },
    // Custom triangular can (see `exhaust` in the body builder).
    exhaust: { route: 'none', side: 'right', can: 'tri', canLength: 0.36, canDia: 0.14, canFinish: 'titanium', headerFinish: 'titanium' },
    cockpit: {
      bars: 'clipon',
      grip: [0.335, 0.9, -0.95],
      barDia: 0.022,
      dash: 'lcd',
      dashPos: [0, 1.03, -1.11],
      dashSize: [0.13, 0.07],
      dashTiltDeg: 48,
      dashMount: 'fairing',
      mirrors: 'fairing',
      mirrorPos: [0.33, 1.0, -1.22],
      mirrorSize: [0.14, 0.06],
      mirrorIndicators: true,
      mirrorColor: '#0d0e10',
      mirrorShape: 'sport',
      topClamp: 'milled',
      steeringDamper: 'side',
      leverColor: '#1e1f22',
      reservoirs: true,
      clutch: 'cable',
      ignition: 'clamp',
      switchColor: '#151618',
      gripColor: '#121212',
      barEndColor: '#1d1e21',
    },
    lights: { head: 'beak', tail: 'compact', rearIndicators: 'stalk' },
    seat: { height: 0.825, front: -0.64, back: -0.28, pillion: 'seat', color: '#151515' },
    rider: { hip: [0, 0.91, -0.44], peg: [0.19, 0.4, -0.41], torsoPitch: 0.76 },
    footrests: 'rearset',
    plate: { mount: 'hanger', pos: [0, 0.6, 0.37], tiltDeg: -14 },
    body,
    livery,
    groundClearance: 0.13,
    features: [],
    zones: { splitY: 0.4, decal: [-0.925, 0.445] },
  };
}
