import type { BikeSpec, Livery } from '../../../data/bikes';
import type { KitContext } from '../context';
import { addPanel, bodyQ, buildSeat, buildTank, frontFender, PAINT, screen, seatFinish } from '../kit/body';
import { organPipes } from '../kit/eu-sport-exhaust';
import { aerofoil, noseStrip, skinX } from '../kit/eu-sport-parts';
import { collector, headers, heatPipe } from '../kit/jp-sport-exhaust';
import { bladeSlats, ductLiner, ductWall, faceLamps, fasteners, innerCowl, tailLamp, undertray } from '../kit/jp-sport-parts';
import { hugger, plateHanger } from '../kit/rear';
import { curve, outlineLoft, stationsBetween, type OutlineBody } from '../kit/shape';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv, type Pen } from '../livery';
import { extrude, smooth2, type P2, type P3 } from '../mesh';
import { F, hard, tint, vary } from '../sink';
import { cut, fAnd, fNot, frontRegion, fOr, planRegion, sideRegion, type Field } from '../surface';
import type { BikeBlueprint } from '../types';

/**
 * MV Agusta F3 RR (2022+).
 * Spec sheet: wheelbase 1380 mm, rake 23.5°, trail 100.4 mm, seat 832 mm,
 * 120/70ZR17 + 180/55ZR17 on 3.50 / 5.50 in wheels, Marzocchi 43 mm USD fork, Sachs
 * shock, 2 × 320 mm discs with Brembo Stylema calipers, ALS steel tubular trellis with
 * aluminium side plates, single-sided aluminium swingarm on the left, 798 cc inline
 * triple with the counter-rotating crank.
 * Design cues: the long, pointed, curvy nose with one central LED headlight between two
 * ram-air scoops, carbon winglets on the cowl sides, a short tank, a very slim high tail,
 * and the three stacked "organ pipe" outlets rising on the right under the tail; Ago Red
 * over Ago Silver.
 */

const NOSE = -1.695;
const SCREEN_BASE = -1.6;
const SCREEN_TOP_Z = -1.2;

const SIDE_EDGE: P2[] = [
  [-1.19, 0.965],
  [-1.08, 0.94],
  [-0.98, 0.89],
  [-0.89, 0.79],
  [-0.82, 0.64],
  [-0.77, 0.5],
  [-0.71, 0.39],
  [-0.64, 0.31],
  [-0.57, 0.26],
  [-0.52, 0.245],
];

function fairing(): OutlineBody {
  const zs = [NOSE, -1.69, -1.68, -1.665, -1.645, -1.615, -1.575, -1.525, -1.465, -1.395, -1.315, -1.225, -1.125, -1.025, -0.925, -0.825, -0.725, -0.625, -0.52];
  // Curvy, softly rounded sections: the F3 has hardly any crease, its shoulder is a smooth roll.
  const face: P2[] = [[0, 1], [0.2, 0.92], [0.46, 0.79], [0.74, 0.6], [0.92, 0.42], [0.9, 0.2], [0.56, 0.05], [0, 0]];
  const cowl: P2[] = [[0, 1], [0.3, 0.965], [0.6, 0.89], [0.82, 0.77], [0.95, 0.59], [1, 0.38], [0.95, 0.12], [0.76, 0]];
  const side: P2[] = [[0, 1], [0.42, 0.99], [0.72, 0.95], [0.88, 0.83], [0.97, 0.62], [1, 0.38], [0.93, 0.1], [0.6, 0]];
  const back: P2[] = [[0, 1], [0.45, 0.99], [0.75, 0.95], [0.9, 0.82], [0.98, 0.6], [1, 0.36], [0.92, 0.1], [0.5, 0]];
  return {
    zs,
    top: curve([[NOSE, 0.744], [-1.665, 0.772], [-1.61, 0.806], [-1.53, 0.844], [-1.43, 0.88], [-1.33, 0.908], [-1.22, 0.93], [-1.09, 0.938], [-0.92, 0.905], [-0.72, 0.828], [-0.52, 0.745]]),
    bottom: curve([[NOSE, 0.736], [-1.688, 0.702], [-1.67, 0.668], [-1.64, 0.64], [-1.59, 0.62], [-1.52, 0.605], [-1.45, 0.592], [-1.37, 0.515], [-1.26, 0.37], [-1.14, 0.262], [-1.0, 0.215], [-0.8, 0.21], [-0.62, 0.23], [-0.52, 0.25]]),
    half: curve([[NOSE, 0.008], [-1.688, 0.042], [-1.668, 0.08], [-1.635, 0.116], [-1.58, 0.152], [-1.5, 0.19], [-1.4, 0.226], [-1.28, 0.26], [-1.12, 0.272], [-0.95, 0.266], [-0.75, 0.238], [-0.52, 0.195]]),
    sections: [
      { z: NOSE, pts: face },
      { z: -1.6, pts: face },
      { z: -1.38, pts: cowl },
      { z: -1.0, pts: side },
      { z: -0.52, pts: back },
    ],
  };
}

function tail(): OutlineBody {
  return {
    zs: stationsBetween(-0.7, 0.045, 14, 0.5),
    top: curve([[-0.7, 0.825], [-0.52, 0.835], [-0.36, 0.86], [-0.3, 0.915], [-0.16, 0.962], [-0.04, 1.0], [0.045, 1.03]]),
    bottom: curve([[-0.7, 0.68], [-0.44, 0.712], [-0.2, 0.8], [-0.05, 0.9], [0.025, 0.975], [0.045, 1.0]]),
    // Very slim: the F3's tail is barely wider than the seat.
    half: curve([[-0.7, 0.14], [-0.5, 0.128], [-0.3, 0.108], [-0.1, 0.08], [0.0, 0.058], [0.045, 0.04]]),
    sections: [
      { z: -0.7, pts: [[0, 1], [0.62, 0.98], [0.96, 0.84], [1, 0.55], [0.92, 0.22], [0.6, 0.02], [0, 0]] },
      { z: 0.045, pts: [[0, 1], [0.72, 0.97], [1, 0.75], [0.98, 0.47], [0.84, 0.2], [0.44, 0.02], [0, 0]] },
    ],
  };
}

/** Central LED headlight: a pointed drop in the nose tip (front view, spans the centre line). */
const HEAD: P2[] = smooth2([[-0.064, 0.72], [-0.032, 0.735], [0, 0.739], [0.032, 0.735], [0.064, 0.72], [0.046, 0.703], [0, 0.692], [-0.046, 0.703]], 3, true);
/** Right ram-air scoop beside and below the headlight. */
const SCOOP: P2[] = [[0.072, 0.694], [0.112, 0.708], [0.142, 0.704], [0.15, 0.682], [0.128, 0.661], [0.09, 0.659], [0.072, 0.672]];
/** Side air outlet behind the front wheel. */
const OUTLET: P2[] = [[-1.165, 0.612], [-1.09, 0.65], [-0.985, 0.652], [-0.93, 0.604], [-0.958, 0.548], [-1.05, 0.535], [-1.125, 0.555]];

function body(ctx: KitContext): void {
  const ob = fairing();
  const q = bodyQ(ctx, 1.7);
  const master = outlineLoft(ob, { su: q.su, sv: q.sv, creases: [], capFront: true });
  const blackGloss = hard('#0b0c0e', 0.15, 0.2, 1);
  const A = ctx.hp.frontAxle;
  const open = sideRegion([[-1.19, 2], ...SIDE_EDGE, [-0.3, 0.1], [-0.3, 2]]);
  const arch = (_x: number, y: number, z: number) => 0.355 - Math.hypot(z - A[2], y - A[1]);
  const underScreen = fAnd(planRegion([[SCREEN_BASE + 0.07, -1], [-1.04, -1], [-1.04, 0.145], [-1.34, 0.158], [-1.46, 0.135], [SCREEN_BASE + 0.07, 0.085]]), (_x, y) => y - 0.845);
  const head = faceLamps(ob, { outline: HEAD, at: [0, 0.715], single: true, inset: 0.012, square: 0.5, opts: { kind: 'head', inner: 'projector', count: 2, depth: 0.04, rim: 0.004 } });
  const scoop = fAnd(frontRegion(smooth2(SCOOP, 3, true)), (_x, _y, z) => -1.58 - z);
  const outlet = sideRegion(smooth2(OUTLET, 3, true));
  const bodyCut = cut(master, fAnd(fNot(open), fNot(arch), fNot(underScreen), fNot(fOr(head.hole, scoop)), fNot(outlet)));
  const cowl = sideRegion([[-2, 2], [-1.34, 2], [-1.34, 0.93], [-1.36, 0.8], [-1.4, 0.69], [-1.46, 0.61], [-2, 0.59]]);
  const belly = sideRegion([[-1.15, 0.37], [-0.95, 0.35], [-0.7, 0.345], [-0.35, 0.35], [-0.35, -1], [-1.15, -1]]);
  addPanel(ctx, 'chassis', bodyCut, cowl, PAINT, 0.003, 0.014);
  addPanel(ctx, 'chassis', bodyCut, fAnd(fNot(cowl), fNot(belly)), PAINT, 0.003, 0.014);
  addPanel(ctx, 'chassis', bodyCut, fAnd(belly, fNot(cowl)), PAINT, 0.003, 0.014);
  ductWall(ctx, ob, OUTLET.map(([z, y]) => [z + (z < -1.04 ? -0.01 : 0.01), y + (y > 0.595 ? 0.01 : -0.01)] as P2), -1.04, 0.595, 0.035);
  for (let i = 0; i < 3; i++) {
    const z0 = -1.105 + i * 0.056;
    bladeSlats(ctx, ob, [[[z0, 0.545], [z0 + 0.038, 0.638], [z0 + 0.05, 0.638], [z0 + 0.012, 0.545]]], 0.006, 0.024, F.satinBlack);
  }
  // Ram-air scoops, headlight and its LED position-light brow.
  for (const s of [1, -1]) ductLiner(ctx, ob, SCOOP.map(([x, y]) => [s * x, y] as P2), -1.5, 0.8);
  head.add(ctx, 'chassis');
  noseStrip(ctx, ob, [[0.0, 0.746], [0.036, 0.742], [0.068, 0.727], [0.08, 0.712]], 0.006, 'drl', 0.002);
  // Carbon winglets: two stacked blades with an end plate on each cowl flank.
  for (const s of [-1, 1]) {
    for (const [y, z0, z1] of [[0.662, -1.42, -1.27], [0.618, -1.4, -1.26]] as const) {
      const x0 = skinX(ob, (z0 + z1) / 2, y) - 0.01;
      const blade = aerofoil(z0, z1, y, x0, x0 + 0.055, 0.012, 0.006, 0.01);
      ctx.add('chassis', s > 0 ? blade : blade.mirrored(), F.carbon);
    }
    const xe = skinX(ob, -1.34, 0.64) + 0.045;
    ctx.add('chassis', extrude(smooth2([[-1.4, 0.608], [-1.27, 0.612], [-1.255, 0.64], [-1.275, 0.68], [-1.41, 0.676], [-1.42, 0.64]], 2, true), 0.003, { plane: 'zy', center: s * xe, bevel: 0.001 }), F.carbon);
  }
  innerCowl(ctx, { z0: SCREEN_BASE + 0.06, z1: -1.2, yTop0: 0.79, yTop1: 0.86, yBot0: 0.72, yBot1: 0.77, w0: 0.08, w1: 0.15 });
  screen(ctx, 'chassis', {
    zs: stationsBetween(SCREEN_BASE, SCREEN_TOP_Z, 8, 0.35),
    top: curve([[SCREEN_BASE, 0.836], [-1.52, 0.892], [-1.42, 0.975], [-1.32, 1.045], [-1.24, 1.078], [SCREEN_TOP_Z, 1.083]]),
    bottom: curve([[SCREEN_BASE, 0.824], [-1.4, 0.89], [SCREEN_TOP_Z, 0.945]]),
    half: curve([[SCREEN_BASE, 0.122], [-1.46, 0.168], [-1.31, 0.162], [SCREEN_TOP_Z, 0.118]]),
    sections: [{ z: 0, pts: [[0, 1], [0.45, 0.985], [0.8, 0.93], [0.95, 0.8], [1, 0.55], [1, 0.25], [0.98, 0]] }],
  }, tint(F.screen, '#454b52'));
  buildTank(ctx, {
    front: -1.18,
    back: -0.62,
    top: 1.04,
    bottomFront: 0.89,
    bottomBack: 0.8,
    width: 0.42,
    style: 'sport',
    knee: 0.16,
    capZ: -0.92,
    topLine: [[-1.18, 0.95], [-1.09, 0.982], [-0.99, 1.02], [-0.89, 1.04], [-0.8, 1.034], [-0.71, 1.0], [-0.65, 0.94], [-0.62, 0.88]],
    bottomLine: [[-1.18, 0.89], [-0.99, 0.858], [-0.8, 0.825], [-0.62, 0.8]],
    halfLine: [[-1.18, 0.112], [-1.08, 0.172], [-0.95, 0.205], [-0.82, 0.2], [-0.71, 0.17], [-0.62, 0.11]],
  });
  buildSeat(ctx, { front: -0.65, back: -0.33, yFront: 0.828, y: 0.832, yBack: 0.866, width: 0.255, thick: 0.066, frontWidth: 0.165 });
  buildSeat(ctx, { front: -0.31, back: -0.1, yFront: 0.918, y: 0.93, yBack: 0.95, width: 0.155, thick: 0.04, frontWidth: 0.125 }, tint(seatFinish(ctx), '#161616'));
  const tb = tail();
  const tm = outlineLoft(tb, { su: ctx.seg(12, 4), sv: ctx.seg(6, 2), capBack: true });
  const seatHole: Field = fAnd(
    fOr(sideRegion([[-0.85, 0.81], [-0.322, 0.81], [-0.322, 1.4], [-0.85, 1.4]]), sideRegion([[-0.312, 0.9], [-0.09, 0.9], [-0.09, 1.4], [-0.312, 1.4]])),
    planRegion([[-0.85, -0.01], [-0.08, -0.01], [-0.08, 0.08], [-0.31, 0.08], [-0.32, 0.13], [-0.85, 0.13]]),
  );
  addPanel(ctx, 'chassis', tm, fNot(seatHole), PAINT, 0.0025, 0.012);
  undertray(ctx, { z0: -0.5, z1: 0.03, top0: 0.74, top1: 0.97, bot0: 0.69, botMid: 0.77, bot1: 0.94, w0: 0.125, w1: 0.04 });
  // Slim LED light bar across the tail tip.
  tailLamp(ctx, smooth2([[-0.04, -0.005], [0.04, -0.005], [0.045, 0.004], [-0.045, 0.004]], 3, true), [0, 0.992, 0.04], -0.6, { depth: 0.022 });
  frontFender(ctx, { from: -0.66, to: 0.8, gap: 0.02, width: 0.145 });
  hugger(ctx, blackGloss);
  plateHanger(ctx, { fromZ: -0.12, fromY: 0.8 });
  fasteners(ctx, ob, [[-1.3, 0.85], [-1.04, 0.81], [-0.86, 0.58], [-1.02, 0.39], [-0.66, 0.33]]);
  exhaust(ctx);
}

/**
 * 3-1-3: headers drop in front of the crankcase into a collector under the engine, a
 * silencer body sits under the right footpeg and three stacked pipes rise from it.
 */
function exhaust(ctx: KitContext): void {
  const c = ctx.bp.engine.crank;
  const lowY = 0.17;
  const col: P3 = [0.02, lowY + 0.02, c[2] + 0.07];
  headers(ctx, {
    r: 0.019,
    heat: 'steel',
    route: (_i, p) => [
      [p.pos[0] * 1.05, c[1] - 0.0, c[2] - 0.21],
      [p.pos[0] * 0.65 + 0.01, lowY + 0.05, c[2] - 0.09],
      [col[0] + p.pos[0] * 0.25, col[1], col[2] - 0.07],
    ],
  });
  collector(ctx, col, 0.048, 0.15, 'steel', 0.6);
  const b0: P3 = [0.125, 0.235, -0.6];
  const b1: P3 = [0.16, 0.315, -0.42];
  heatPipe(ctx, [[col[0], col[1], col[2] + 0.08], [0.06, lowY + 0.01, c[2] + 0.24], [0.11, 0.2, -0.66], b0], 0.026, 'steel', 0.6, 0.85);
  const dir: P3 = [0.05, 0.52, 1];
  organPipes(ctx, {
    body0: b0,
    body1: b1,
    bodyR: 0.068,
    tips: [[0.17, 0.455, -0.1], [0.175, 0.512, -0.128], [0.18, 0.569, -0.156]],
    dir,
    pipeR: 0.021,
    len: 0.24,
    finish: vary(F.steel, { rough: 0.2 }),
    body: hard('#2a2c30', 0.6, 0.4),
  });
  ctx.anchor('exhaustOutlet', [0.175, 0.512, -0.128]);
}

// ───────────────────────────── livery ─────────────────────────────

const AGO_RED = '#b3121b';
const AGO_SILVER = '#b9bdc2';
const AVIO = '#5d6268';

function lettering(p: Pen, main: string, accent: string): void {
  if (p.view !== 'right' && p.view !== 'left') return;
  p.text('F3', -0.9, 0.44, { color: accent, size: 0.085, weight: '900', italic: true });
  p.text('MV AGUSTA', -1.47, 0.745, { color: main, size: 0.017, weight: '800', spacing: 0.05 });
  p.text('RR', -0.16, 0.87, { color: main, size: 0.03, weight: '900', italic: true });
}

function livery(c: LiveryCanvas, _lv: Livery, env: LiveryEnv): void {
  const grey = env.index === 1;
  c.views(ALL_VIEWS, (p) => {
    const top = grey ? AVIO : AGO_RED;
    const low = grey ? '#1a1b1e' : AGO_SILVER;
    p.fill(top, grey ? 'metallic' : 'gloss');
    if (p.view === 'right' || p.view === 'left') {
      // The classic MV split: colour over silver along a line falling from the nose to the belly.
      p.poly([[-1.8, 0.69], [-1.5, 0.66], [-1.25, 0.61], [-1.02, 0.55], [-0.85, 0.49], [-0.66, 0.4], [-0.45, 0.36], [-0.45, -0.1], [-1.8, -0.1]], low, 'metallic');
      p.line([[-1.8, 0.69], [-1.5, 0.66], [-1.25, 0.61], [-1.02, 0.55], [-0.85, 0.49], [-0.66, 0.4], [-0.45, 0.36]], grey ? AGO_RED : '#f2f2f2', 0.004);
      p.poly([[-0.6, 0.66], [0.15, 0.86], [0.15, 0.6], [-0.6, 0.6]], low, 'metallic');
      // Front mudguard stays in the main colour.
      const arch: P2[] = [];
      for (let i = 0; i <= 12; i++) {
        const a = (i / 12) * Math.PI;
        arch.push([-1.38 + Math.cos(a) * 0.37, 0.3 + Math.sin(a) * 0.37]);
      }
      p.poly(arch, top, grey ? 'metallic' : 'gloss');
      lettering(p, grey ? '#e8e8e8' : '#f4f4f4', AGO_RED);
    } else if (p.view === 'front') {
      p.rect(-1, -1, -0.085, 0.685, low, 'metallic');
      p.rect(0.085, -1, 1, 0.685, low, 'metallic');
    }
  });
}

export function f3Blueprint(spec: BikeSpec): BikeBlueprint {
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.06, 0.73, 1.105],
    wheelbase: 1.38,
    rakeDeg: 23.5,
    trail: 0.1004,
    forkLength: 0.7,
    front: { tyre: '120/70ZR17', rimWidthIn: 3.5, crown: 0.82, tread: 'sport', tyreLabel: 'Diablo Rosso IV' },
    rear: { tyre: '180/55ZR17', rimWidthIn: 5.5, crown: 0.93, tread: 'sport', tyreLabel: 'Diablo Rosso IV' },
    frontWheel: { type: 'forged', spokes: 3, shape: 'split', color: '#1a1b1e', machinedLip: true },
    rearWheel: { type: 'forged', spokes: 3, shape: 'split', color: '#1a1b1e', machinedLip: true },
    fork: { type: 'usd', stanchion: 0.043, spacing: 0.205, outerColor: '#1d1e21', innerColor: '#c9ccd2', footColor: '#1d1e21', capColor: '#a8acb2', adjusterColor: '#c0161d', label: 'MARZOCCHI', labelColor: '#d8dadd', aboveClamp: 0.012, clampGap: 0.195 },
    frontBrake: { discs: 2, discDia: 0.32, disc: 'floating', carrierColor: '#2a2c30', caliper: 'radialMono4', caliperColor: '#45484e', caliperText: 'brembo', caliperTextColor: '#d01c1c', caliperAngleDeg: 76 },
    rearBrake: { discs: 1, discDia: 0.22, disc: 'fixed', carrierColor: '#2a2c30', caliper: 'axial2', caliperColor: '#2f3136', caliperAngleDeg: 200 },
    frame: { type: 'trellis', color: '#a3141b', metal: 0.3, rough: 0.35, subframe: 'trellis', subframeColor: '#a3141b', width: 0.33 },
    swingarm: { type: 'singleSided', length: 0.575, angleDeg: 10.5, side: 'left', color: '#9ca1a8', metal: 0.85, rough: 0.35 },
    shock: { layout: 'mono', springColor: '#b3121b', bodyColor: '#2a2c30', reservoir: true },
    drive: { type: 'chain', side: 'left', frontTeeth: 16, rearTeeth: 41, pitch: 0.015875, sprocketColor: '#1d1e21' },
    engine: {
      layout: 'I3',
      cc: 798,
      crank: [0, 0.38, -0.79],
      tiltDeg: 30,
      caseColor: '#2a2c30',
      coverColor: '#3a3d42',
      headColor: '#2a2c30',
      camCoverColor: '#1d1e21',
      camCoverText: 'MV AGUSTA',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.38, h: 0.32, z: -1.22, y: 0.62, tiltDeg: 16, curved: true },
      width: 0.32,
    },
    // Custom 3-1-3 organ-pipe exhaust (see `exhaust` in the body builder).
    exhaust: { route: 'none', side: 'right', can: 'tri', canLength: 0.22, canDia: 0.13, canFinish: 'steel', headerFinish: 'steel' },
    cockpit: {
      bars: 'clipon',
      grip: [0.32, 0.875, -0.955],
      barDia: 0.022,
      dash: 'tft',
      dashPos: [0, 1.022, -1.128],
      dashSize: [0.118, 0.066],
      dashTiltDeg: 50,
      dashMount: 'fairing',
      mirrors: 'fairing',
      mirrorPos: [0.315, 0.975, -1.23],
      mirrorSize: [0.14, 0.058],
      mirrorIndicators: true,
      mirrorShape: 'sport',
      mirrorColor: '#0d0e10',
      topClamp: 'milled',
      steeringDamper: 'side',
      leverColor: '#9ca1a8',
      reservoirs: true,
      clutch: 'hydraulic',
      ignition: 'clamp',
      switchColor: '#151618',
      gripColor: '#121212',
      barEndColor: '#9ca1a8',
    },
    lights: { head: 'beak', tail: 'compact', rearIndicators: 'stalk' },
    seat: { height: 0.832, front: -0.65, back: -0.33, pillion: 'cowl', color: '#141414' },
    rider: { hip: [0, 0.92, -0.46], peg: [0.19, 0.4, -0.44], torsoPitch: 0.8 },
    footrests: 'rearset',
    plate: { mount: 'hanger', pos: [0, 0.6, 0.33], tiltDeg: -14 },
    body,
    livery,
    groundClearance: 0.13,
    features: ['winglets'],
    zones: { splitY: 0.45, decal: [-0.9, 0.44] },
  };
}
