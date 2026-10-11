import type { BikeSpec, Livery } from '../../../data/bikes';
import { T, type KitContext } from '../context';
import { addPanel, bodyQ, buildSeat, buildTank, frontFender, PAINT, screen, seatFinish } from '../kit/body';
import { can, canHanger, collector, headers, heatPipe } from '../kit/jp-sport-exhaust';
import { bladeSlats, ductLiner, ductWall, faceLamps, fasteners, frontHit, innerCowl, tailLamp, trimLoop, undertray } from '../kit/jp-sport-parts';
import { ledStrip } from '../kit/lights';
import { hugger, plateHanger } from '../kit/rear';
import { curve, outlineLoft, stationsBetween, type OutlineBody } from '../kit/shape';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv, type Pen } from '../livery';
import { roundBox, smooth2, type P2, type P3 } from '../mesh';
import { F, hard, tint, vary } from '../sink';
import { cut, fAnd, fNot, frontRegion, fOr, planRegion, sideRegion, type Field } from '../surface';
import type { BikeBlueprint } from '../types';

/**
 * Suzuki Hayabusa (third generation, 2022+).
 * Spec sheet: wheelbase 1480 mm, caster 23°, trail 90 mm, seat 800 mm,
 * L×W×H 2180 × 735 × 1165 mm, ground clearance 125 mm, 120/70ZR17 + 190/50ZR17 on
 * 3.50/6.00 rims, 43 mm KYB USD fork with DLC inner tubes, Brembo Stylema calipers on
 * 320 mm discs, aluminium twin-spar frame, 1340 cc inline four, 264 kg.
 * Design cues: the long, bulbous wind-tunnel nose with the vertically stacked LED
 * headlight in its centre, ram-air intakes either side carrying the slim position /
 * turn-signal strips, big side air exits framed in chrome, the long wheelbase and tank,
 * the rounded tail hump with a wrap-around LED light, and the twin conical silencers
 * (one each side).
 */

const NOSE = -1.79;
const SCREEN_BASE = -1.66;
const SCREEN_TOP_Z = -1.27;

const SIDE_EDGE: P2[] = [
  [-1.24, 0.99],
  [-1.15, 0.96],
  [-1.05, 0.905],
  [-0.95, 0.82],
  [-0.86, 0.67],
  [-0.79, 0.5],
  [-0.73, 0.37],
  [-0.66, 0.28],
  [-0.58, 0.21],
  [-0.5, 0.18],
];

function fairing(): OutlineBody {
  const zs = [NOSE, -1.785, -1.775, -1.76, -1.738, -1.708, -1.668, -1.618, -1.558, -1.488, -1.408, -1.32, -1.225, -1.125, -1.02, -0.915, -0.81, -0.705, -0.6, -0.5];
  // Rounded "bullet" face, full shoulders: the Busa section is fuller than a superbike's.
  const face: P2[] = [[0, 1], [0.4, 0.97], [0.72, 0.86], [0.92, 0.68], [1, 0.45], [0.95, 0.21], [0.62, 0.045], [0, 0]];
  const cowl: P2[] = [[0, 1], [0.4, 0.985], [0.7, 0.935], [0.87, 0.8], [0.97, 0.6], [1, 0.38], [0.95, 0.12], [0.78, 0]];
  const side: P2[] = [[0, 1], [0.4, 0.99], [0.7, 0.95], [0.88, 0.82], [0.98, 0.6], [1, 0.36], [0.94, 0.1], [0.62, 0]];
  const back: P2[] = [[0, 1], [0.44, 0.99], [0.74, 0.95], [0.9, 0.82], [0.98, 0.6], [1, 0.36], [0.92, 0.1], [0.5, 0]];
  return {
    zs,
    top: curve([[NOSE, 0.752], [-1.775, 0.79], [-1.74, 0.828], [-1.68, 0.866], [-1.59, 0.9], [-1.48, 0.93], [-1.36, 0.955], [-1.24, 0.968], [-1.1, 0.96], [-0.94, 0.92], [-0.74, 0.84], [-0.5, 0.75]]),
    bottom: curve([[NOSE, 0.735], [-1.786, 0.69], [-1.772, 0.65], [-1.745, 0.618], [-1.69, 0.594], [-1.61, 0.58], [-1.53, 0.57], [-1.45, 0.525], [-1.34, 0.375], [-1.2, 0.225], [-1.04, 0.16], [-0.82, 0.15], [-0.64, 0.16], [-0.5, 0.19]]),
    half: curve([[NOSE, 0.015], [-1.786, 0.075], [-1.772, 0.12], [-1.745, 0.165], [-1.7, 0.205], [-1.62, 0.245], [-1.53, 0.275], [-1.42, 0.298], [-1.28, 0.316], [-1.12, 0.322], [-0.95, 0.312], [-0.76, 0.282], [-0.5, 0.222]]),
    sections: [
      { z: NOSE, pts: face },
      { z: -1.68, pts: face },
      { z: -1.46, pts: cowl },
      { z: -1.06, pts: side },
      { z: -0.5, pts: back },
    ],
  };
}

/** The tail hump: rounded, wide, carrying the wrap-around tail light at its end. */
function tail(): OutlineBody {
  return {
    zs: stationsBetween(-0.66, 0.2, 14, 0.5),
    top: curve([[-0.66, 0.82], [-0.46, 0.83], [-0.3, 0.86], [-0.24, 0.93], [-0.1, 0.99], [0.04, 1.03], [0.14, 1.04], [0.2, 1.02]]),
    bottom: curve([[-0.66, 0.68], [-0.4, 0.71], [-0.14, 0.77], [0.04, 0.84], [0.16, 0.9], [0.2, 0.93]]),
    half: curve([[-0.66, 0.155], [-0.44, 0.148], [-0.2, 0.135], [0.02, 0.12], [0.14, 0.095], [0.2, 0.05]]),
    sections: [
      { z: -0.66, pts: [[0, 1], [0.6, 0.98], [0.95, 0.84], [1, 0.55], [0.93, 0.22], [0.6, 0.02], [0, 0]] },
      { z: 0.2, pts: [[0, 1], [0.66, 0.97], [0.96, 0.8], [1, 0.52], [0.9, 0.22], [0.5, 0.02], [0, 0]] },
    ],
  };
}

/** Stacked headlight: upper and lower LED lamps on the centre line. */
const HEAD_UP: P2[] = smooth2([[-0.042, 0.744], [0.042, 0.744], [0.05, 0.766], [0.034, 0.786], [-0.034, 0.786], [-0.05, 0.766]], 2, true);
const HEAD_LO: P2[] = smooth2([[-0.036, 0.69], [0.036, 0.69], [0.044, 0.71], [0.04, 0.732], [-0.04, 0.732], [-0.044, 0.71]], 2, true);
/** Right ram-air intake, sweeping outwards and down beside the headlight. */
const INTAKE: P2[] = [[0.06, 0.765], [0.09, 0.77], [0.135, 0.752], [0.16, 0.72], [0.15, 0.69], [0.115, 0.69], [0.075, 0.71], [0.058, 0.735]];
/** Big side air exit (framed in chrome). */
const EXIT: P2[] = [[-1.37, 0.635], [-1.2, 0.7], [-1.07, 0.69], [-1.03, 0.62], [-1.09, 0.51], [-1.23, 0.485], [-1.34, 0.525]];

function body(ctx: KitContext): void {
  const ob = fairing();
  const q = bodyQ(ctx, 1.7);
  const master = outlineLoft(ob, { su: q.su, sv: q.sv, creases: [2], capFront: true });
  const blackGloss = hard('#0b0c0e', 0.15, 0.2, 1);
  const A = ctx.hp.frontAxle;
  const open = sideRegion([[-1.24, 2], ...SIDE_EDGE, [-0.32, 0.1], [-0.32, 2]]);
  const arch = (_x: number, y: number, z: number) => 0.365 - Math.hypot(z - A[2], y - A[1]);
  const underScreen = fAnd(planRegion([[SCREEN_BASE + 0.08, -1], [-1.12, -1], [-1.12, 0.16], [-1.44, 0.175], [SCREEN_BASE + 0.08, 0.12]]), (_x, y) => y - 0.87);
  const lampOpts = { kind: 'head' as const, inner: 'led' as const, count: 1, depth: 0.04, rim: 0.004 };
  const up = faceLamps(ob, { outline: HEAD_UP, at: [0, 0.765], single: true, inset: 0.01, square: 0.5, opts: lampOpts });
  const lo = faceLamps(ob, { outline: HEAD_LO, at: [0, 0.711], single: true, inset: 0.01, square: 0.5, opts: lampOpts });
  const intake = fAnd(frontRegion(smooth2(INTAKE, 3, true)), (_x, _y, z) => -1.66 - z);
  const exit = sideRegion(smooth2(EXIT, 2, true));
  const bodyCut = cut(master, fAnd(fNot(open), fNot(arch), fNot(underScreen), fNot(fOr(up.hole, lo.hole, intake)), fNot(exit)));
  const cowl = sideRegion([[-2, 2], [-1.44, 2], [-1.44, 0.95], [-1.47, 0.8], [-1.52, 0.68], [-1.6, 0.6], [-2, 0.58]]);
  const belly = sideRegion([[-1.2, 0.33], [-1.0, 0.31], [-0.72, 0.3], [-0.45, 0.3], [-0.45, -1], [-1.2, -1]]);
  addPanel(ctx, 'chassis', bodyCut, cowl, PAINT, 0.003, 0.014);
  addPanel(ctx, 'chassis', bodyCut, fAnd(fNot(cowl), fNot(belly)), PAINT, 0.003, 0.014);
  addPanel(ctx, 'chassis', bodyCut, fAnd(belly, fNot(cowl)), PAINT, 0.003, 0.014);
  // Side exit: chrome surround, dark wall and three vertical gills.
  trimLoop(ctx, ob, EXIT, 0.0035, vary(F.polishedAlu, { rough: 0.18 }));
  ductWall(ctx, ob, EXIT.map(([z, y]) => [z + (z < -1.18 ? -0.01 : 0.01), y + (y > 0.6 ? 0.01 : -0.01)] as P2), -1.18, 0.6, 0.045);
  for (let i = 0; i < 3; i++) {
    const z0 = -1.29 + i * 0.07;
    bladeSlats(ctx, ob, [[[z0, 0.51], [z0 + 0.03, 0.67], [z0 + 0.042, 0.67], [z0 + 0.012, 0.51]]], 0.008, 0.03, F.satinBlack);
  }
  // Ram-air intakes with the position / turn-signal strips along their outer edges.
  for (const s of [1, -1]) ductLiner(ctx, ob, INTAKE.map(([x, y]) => [s * x, y] as P2), -1.56, 0.8);
  if (ctx.micro) for (const s of [-1, 1]) ctx.add('chassis', roundBox(0.07, 0.004, 0.004, 0.001), F.texturedBlack, T(s * 0.108, 0.728, -1.62));
  for (const s of [-1, 1]) {
    const pts: P3[] = [];
    let nrm: P3 = [0, 0, -1];
    for (const [x, y] of [[0.094, 0.777], [0.14, 0.76], [0.166, 0.73], [0.17, 0.705]] as P2[]) {
      const h = frontHit(ob, s * x, y);
      if (h) {
        pts.push([h.p[0] + h.n[0] * 0.0015, h.p[1] + h.n[1] * 0.0015, h.p[2] + h.n[2] * 0.0015]);
        nrm = h.n;
      }
    }
    if (pts.length >= 3) ledStrip(ctx, 'chassis', pts, 0.006, 0.003, 'drl', nrm);
  }
  up.add(ctx, 'chassis');
  lo.add(ctx, 'chassis');
  innerCowl(ctx, { z0: SCREEN_BASE + 0.06, z1: -1.26, yTop0: 0.875, yTop1: 0.94, yBot0: 0.76, yBot1: 0.81, w0: 0.16, w1: 0.26 });
  // Short, steeply raked screen on top of the long cowl.
  screen(ctx, 'chassis', {
    zs: stationsBetween(SCREEN_BASE, SCREEN_TOP_Z, 8, 0.35),
    top: curve([[SCREEN_BASE, 0.89], [-1.57, 0.95], [-1.47, 1.04], [-1.37, 1.12], [-1.3, 1.158], [SCREEN_TOP_Z, 1.165]]),
    bottom: curve([[SCREEN_BASE, 0.878], [-1.45, 0.93], [SCREEN_TOP_Z, 0.97]]),
    half: curve([[SCREEN_BASE, 0.16], [-1.5, 0.2], [-1.38, 0.19], [SCREEN_TOP_Z, 0.14]]),
    sections: [{ z: 0, pts: [[0, 1], [0.45, 0.985], [0.8, 0.93], [0.95, 0.8], [1, 0.55], [1, 0.25], [0.98, 0]] }],
  }, tint(F.screen, '#2e353d'));
  buildTank(ctx, {
    front: -1.24,
    back: -0.6,
    top: 1.075,
    bottomFront: 0.91,
    bottomBack: 0.79,
    width: 0.47,
    style: 'round',
    knee: 0.1,
    capZ: -0.96,
    topLine: [[-1.24, 0.965], [-1.14, 1.005], [-1.03, 1.05], [-0.92, 1.073], [-0.81, 1.066], [-0.71, 1.02], [-0.64, 0.95], [-0.6, 0.89]],
    bottomLine: [[-1.24, 0.91], [-1.02, 0.87], [-0.8, 0.825], [-0.6, 0.79]],
    halfLine: [[-1.24, 0.13], [-1.13, 0.2], [-0.99, 0.235], [-0.85, 0.23], [-0.72, 0.2], [-0.6, 0.13]],
  });
  buildSeat(ctx, { front: -0.62, back: -0.26, yFront: 0.795, y: 0.8, yBack: 0.836, width: 0.3, thick: 0.08, frontWidth: 0.19 });
  buildSeat(ctx, { front: -0.245, back: 0.0, yFront: 0.905, y: 0.92, yBack: 0.94, width: 0.21, thick: 0.05, frontWidth: 0.16 }, tint(seatFinish(ctx), '#141414'));
  const tm = outlineLoft(tail(), { su: ctx.seg(12, 4), sv: ctx.seg(6, 2), capBack: true });
  const seatHole: Field = fAnd(
    fOr(sideRegion([[-0.85, 0.79], [-0.252, 0.79], [-0.252, 1.4], [-0.85, 1.4]]), sideRegion([[-0.242, 0.885], [0.012, 0.885], [0.012, 1.4], [-0.242, 1.4]])),
    planRegion([[-0.85, -0.01], [0.02, -0.01], [0.02, 0.112], [-0.24, 0.112], [-0.25, 0.155], [-0.85, 0.155]]),
  );
  addPanel(ctx, 'chassis', tm, fNot(seatHole), PAINT, 0.0025, 0.012);
  undertray(ctx, { z0: -0.48, z1: 0.17, top0: 0.73, top1: 0.92, bot0: 0.68, botMid: 0.74, bot1: 0.88, w0: 0.14, w1: 0.06 });
  // Wrap-around LED tail light across the end of the hump (indicators integrated).
  tailLamp(ctx, smooth2([[-0.1, -0.008], [0.1, -0.008], [0.11, 0.004], [0.06, 0.012], [-0.06, 0.012], [-0.11, 0.004]], 4, true), [0, 0.965, 0.198], -0.15, { depth: 0.035 });
  frontFender(ctx, { from: -0.66, to: 0.85, gap: 0.022, width: 0.16 });
  hugger(ctx, blackGloss);
  plateHanger(ctx, { fromZ: 0.06, fromY: 0.86 });
  fasteners(ctx, ob, [[-1.4, 0.88], [-1.12, 0.84], [-0.88, 0.56], [-1.05, 0.34], [-0.66, 0.3]]);
  exhaust(ctx);
}

/** 4-2-1-2: headers into a collector under the engine, then twin conical cans. */
function exhaust(ctx: KitContext): void {
  const c = ctx.bp.engine.crank;
  const lowY = 0.165;
  const col: P3 = [0, lowY + 0.035, c[2] + 0.08];
  headers(ctx, {
    r: 0.02,
    heat: 'steel',
    route: (_i, p) => [
      [p.pos[0] * 1.05, c[1] + 0.02, c[2] - 0.22],
      [p.pos[0] * 0.7, lowY + 0.06, c[2] - 0.1],
      [col[0] + p.pos[0] * 0.2, col[1], col[2] - 0.07],
    ],
  });
  collector(ctx, col, 0.055, 0.18, 'steel', 0.55);
  const fin = vary(F.chrome, { rough: 0.12 });
  for (const s of [-1, 1]) {
    const a: P3 = [s * 0.165, 0.37, -0.4];
    const b: P3 = [s * 0.2, 0.575, 0.1];
    heatPipe(ctx, [[s * 0.03, col[1], col[2] + 0.09], [s * 0.09, lowY + 0.04, c[2] + 0.3], [s * 0.15, 0.28, -0.5], a], 0.028, 'steel', 0.55, 0.85);
    can(ctx, { a, b, shape: 'cone', r0: 0.056, r1: 0.074, finish: fin, cap: F.glossBlack, slash: 0.55 });
    canHanger(ctx, [s * 0.18, 0.52, -0.05], [s * 0.12, 0.7, -0.12]);
  }
  ctx.anchor('exhaustOutlet', [0.2, 0.575, 0.1]);
}

// ───────────────────────────── livery ─────────────────────────────

function lettering(p: Pen, kanji: string, script: string): void {
  if (p.view !== 'right' && p.view !== 'left') return;
  // The 隼 (peregrine falcon) kanji on the side cowl, "Hayabusa" script on the tail.
  p.text('隼', -1.32, 0.84, { color: kanji, size: 0.075, weight: '700', font: '"Noto Serif CJK JP", "Yu Mincho", "Hiragino Mincho ProN", "MS Mincho", "WenQuanYi Zen Hei", serif' });
  p.text('Hayabusa', -0.12, 0.88, { color: script, size: 0.032, italic: true, weight: '700', font: 'Georgia, "Times New Roman", serif' });
  p.text('SUZUKI', -0.95, 0.42, { color: script, size: 0.03, italic: true, weight: '900', spacing: 0.05 });
}

function livery(c: LiveryCanvas, lv: Livery, env: LiveryEnv): void {
  const white = env.index === 1;
  c.views(ALL_VIEWS, (p) => {
    if (white) {
      // Pearl Brilliant White / Pearl Vigor Blue: white upper, blue lower fairing and belly.
      p.fill('#eef0f2', 'pearl');
      if (p.view === 'right' || p.view === 'left') {
        p.poly([[-1.85, 0.6], [-1.5, 0.56], [-1.2, 0.47], [-0.95, 0.45], [-0.75, 0.4], [-0.5, 0.33], [-0.5, -0.1], [-1.85, -0.1]], lv.secondary, 'metallic');
        p.poly([[-0.62, 0.72], [0.25, 0.9], [0.25, 0.86], [-0.62, 0.69]], lv.secondary, 'metallic');
        lettering(p, '#7a5a1e', lv.secondary);
      } else if (p.view === 'front') {
        p.rect(-1, -1, 1, 0.64, lv.secondary, 'metallic');
      }
      return;
    }
    // Glass Sparkle Black with Candy Burnt Gold lower cowl, belly and tail flash.
    const gold = '#8a5a22';
    p.fill('#141518', 'metallic');
    if (p.view === 'right' || p.view === 'left') {
      p.gradientPoly([[-1.85, 0.6], [-1.5, 0.56], [-1.2, 0.47], [-0.95, 0.45], [-0.75, 0.4], [-0.5, 0.33], [-0.5, -0.1], [-1.85, -0.1]], [-1.2, 0.6, '#9c6a2a'], [-1.0, 0.15, '#5a3812'], 'metallic');
      p.line([[-1.85, 0.612], [-1.5, 0.572], [-1.2, 0.482], [-0.95, 0.462], [-0.75, 0.412], [-0.5, 0.342]], '#c9a227', 0.006, 'metallic');
      p.poly([[-0.62, 0.72], [0.25, 0.9], [0.25, 0.86], [-0.62, 0.69]], gold, 'metallic');
      lettering(p, '#c9a227', '#c9a227');
    } else if (p.view === 'front') {
      p.rect(-1, -1, 1, 0.64, gold, 'metallic');
    }
  });
}

export function hayabusaBlueprint(spec: BikeSpec): BikeBlueprint {
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.18, 0.735, 1.165],
    wheelbase: 1.48,
    rakeDeg: 23,
    trail: 0.09,
    forkLength: 0.73,
    front: { tyre: '120/70ZR17', rimWidthIn: 3.5, crown: 0.86, tread: 'sport', tyreLabel: 'Sport Radial S' },
    rear: { tyre: '190/50ZR17', rimWidthIn: 6.0, crown: 0.95, tread: 'sport', tyreLabel: 'Sport Radial S' },
    frontWheel: { type: 'cast', spokes: 6, shape: 'curved', color: '#141518', stripe: '#c9a227' },
    rearWheel: { type: 'cast', spokes: 6, shape: 'curved', color: '#141518', stripe: '#c9a227' },
    fork: { type: 'usd', stanchion: 0.043, spacing: 0.215, outerColor: '#1c1d20', innerColor: '#3a3c40', footColor: '#1c1d20', capColor: '#2a2c30', adjusterColor: '#c99a2c', aboveClamp: 0.02, clampGap: 0.2 },
    frontBrake: { discs: 2, discDia: 0.32, disc: 'floating', carrierColor: '#2b2d31', caliper: 'radialMono4', caliperColor: '#3a3c41', caliperText: 'brembo', caliperTextColor: '#d4202a', caliperAngleDeg: 76 },
    rearBrake: { discs: 1, discDia: 0.26, disc: 'fixed', carrierColor: '#2b2d31', caliper: 'axial1', caliperColor: '#2b2d31', caliperAngleDeg: 200 },
    frame: { type: 'twinSpar', color: '#1f2023', metal: 0.7, rough: 0.4, subframe: 'cast', subframeColor: '#1f2023', width: 0.38 },
    swingarm: { type: 'braced', length: 0.6, angleDeg: 9, color: '#1f2023', metal: 0.7, rough: 0.4 },
    shock: { layout: 'mono', springColor: '#2a2c30', bodyColor: '#2a2c30', reservoir: true },
    drive: { type: 'chain', side: 'left', frontTeeth: 17, rearTeeth: 40, pitch: 0.01905, sprocketColor: '#1e1f22' },
    engine: {
      layout: 'I4',
      cc: 1340,
      crank: [0, 0.42, -0.86],
      tiltDeg: 22,
      caseColor: '#1c1d20',
      coverColor: '#2a2c30',
      headColor: '#232428',
      camCoverColor: '#16171a',
      camCoverText: 'SUZUKI',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.48, h: 0.38, z: -1.31, y: 0.62, tiltDeg: 12, curved: true },
      width: 0.43,
    },
    // Twin cans (see `exhaust` in the body builder).
    exhaust: { route: 'none', side: 'both', can: 'round', canLength: 0.54, canDia: 0.15, canFinish: 'chrome', headerFinish: 'steel' },
    cockpit: {
      bars: 'clipon',
      grip: [0.335, 0.945, -1.0],
      barDia: 0.022,
      dash: 'analogTwin',
      dashPos: [0, 1.04, -1.2],
      dashSize: [0.22, 0.095],
      dashTiltDeg: 44,
      dashMount: 'fairing',
      mirrors: 'fairing',
      mirrorPos: [0.35, 1.02, -1.34],
      mirrorSize: [0.15, 0.07],
      mirrorIndicators: false,
      mirrorColor: '#111214',
      mirrorShape: 'oval',
      topClamp: 'cast',
      steeringDamper: 'none',
      leverColor: '#1e1f22',
      reservoirs: true,
      clutch: 'hydraulic',
      ignition: 'clamp',
      switchColor: '#151618',
      gripColor: '#121212',
      barEndColor: '#2a2c30',
    },
    lights: { head: 'beak', tail: 'bar', rearIndicators: 'integrated' },
    seat: { height: 0.8, front: -0.62, back: -0.26, pillion: 'seat', color: '#151515' },
    rider: { hip: [0, 0.89, -0.45], peg: [0.19, 0.38, -0.44], torsoPitch: 0.62 },
    footrests: 'rearset',
    plate: { mount: 'hanger', pos: [0, 0.62, 0.42], tiltDeg: -12 },
    body,
    livery,
    groundClearance: 0.125,
    features: [],
    zones: { splitY: 0.42, decal: [-1.32, 0.84] },
  };
}
