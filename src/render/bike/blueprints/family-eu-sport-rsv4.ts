import type { BikeSpec, Livery } from '../../../data/bikes';
import type { KitContext } from '../context';
import { addPanel, bodyQ, buildSeat, buildTank, frontFender, PAINT, screen, seatFinish } from '../kit/body';
import { fasteners, innerCowl, tailLamp, undertray } from '../kit/jp-sport-parts';
import { ledStrip } from '../kit/lights';
import { hugger, plateHanger } from '../kit/rear';
import { curve, outlineLoft, stationsBetween, type OutlineBody } from '../kit/shape';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv, type Pen } from '../livery';
import { smooth2, type P2, type P3 } from '../mesh';
import { F, hard, tint } from '../sink';
import { cut, fAnd, fNot, fOr, planRegion, sideRegion, type Field } from '../surface';
import type { BikeBlueprint } from '../types';
import { apriliaAero, apriliaFace } from './family-eu-sport-aprilia';

/**
 * Aprilia RSV4 Factory (2021+).
 * Spec sheet: wheelbase 1436 mm, rake 24.6°, trail 103.7 mm, seat 845 mm,
 * 120/70ZR17 + 200/55ZR17 on forged 3.50 / 6.00 in wheels, Öhlins NIX 30 43 mm fork
 * and TTX 36 shock (Smart EC 2.0), 2 × 330 mm discs with Brembo Stylema monoblocs,
 * aluminium twin-spar frame, RS-GP derived under-braced swingarm, 1099 cc 65° V4.
 * Design cues: triple full-LED face (centre lamp at the beak tip, two side lamps framed
 * by DRL strips), the double-layer fairing with its integrated wing in the lower front
 * channel, tall sharp tank, short pointed tail, upswept side silencer on the right,
 * "Aprilia Racing" black / red / purple or Lava Red.
 */

const NOSE = -1.664;
const SCREEN_BASE = -1.548;
const SCREEN_TOP_Z = -1.19;

const SIDE_EDGE: P2[] = [
  [-1.195, 0.975],
  [-1.1, 0.948],
  [-1.0, 0.895],
  [-0.9, 0.8],
  [-0.82, 0.64],
  [-0.76, 0.49],
  [-0.7, 0.37],
  [-0.63, 0.28],
  [-0.56, 0.225],
  [-0.49, 0.2],
];

export function rsv4Fairing(): OutlineBody {
  const zs = [NOSE, -1.659, -1.649, -1.634, -1.614, -1.584, -1.548, -1.498, -1.438, -1.368, -1.288, -1.2, -1.1, -1.0, -0.9, -0.8, -0.7, -0.6, -0.49];
  // Sharper, more vertical face than the Japanese bikes: the shoulder crease (index 2) runs high.
  const face: P2[] = [[0, 1], [0.3, 0.96], [0.6, 0.87], [0.84, 0.7], [0.97, 0.47], [0.92, 0.22], [0.58, 0.05], [0, 0]];
  const cowl: P2[] = [[0, 1], [0.34, 0.985], [0.62, 0.94], [0.82, 0.81], [0.95, 0.62], [1, 0.4], [0.95, 0.13], [0.76, 0]];
  const side: P2[] = [[0, 1], [0.38, 0.99], [0.66, 0.955], [0.85, 0.83], [0.97, 0.62], [1, 0.38], [0.93, 0.11], [0.6, 0]];
  const back: P2[] = [[0, 1], [0.42, 0.99], [0.72, 0.95], [0.9, 0.82], [0.98, 0.6], [1, 0.36], [0.92, 0.1], [0.5, 0]];
  return {
    zs,
    top: curve([[NOSE, 0.778], [-1.64, 0.806], [-1.59, 0.838], [-1.51, 0.872], [-1.41, 0.905], [-1.31, 0.93], [-1.2, 0.948], [-1.07, 0.95], [-0.9, 0.912], [-0.7, 0.832], [-0.49, 0.742]]),
    bottom: curve([[NOSE, 0.766], [-1.657, 0.722], [-1.64, 0.684], [-1.61, 0.653], [-1.56, 0.63], [-1.49, 0.614], [-1.42, 0.6], [-1.34, 0.52], [-1.23, 0.36], [-1.1, 0.232], [-0.95, 0.172], [-0.75, 0.165], [-0.6, 0.175], [-0.49, 0.2]]),
    half: curve([[NOSE, 0.01], [-1.657, 0.06], [-1.64, 0.11], [-1.6, 0.153], [-1.54, 0.193], [-1.45, 0.228], [-1.35, 0.254], [-1.22, 0.273], [-1.07, 0.281], [-0.9, 0.273], [-0.7, 0.244], [-0.49, 0.198]]),
    sections: [
      { z: NOSE, pts: face },
      { z: -1.6, pts: face },
      { z: -1.37, pts: cowl },
      { z: -1.0, pts: side },
      { z: -0.49, pts: back },
    ],
  };
}

function tail(): OutlineBody {
  return {
    zs: stationsBetween(-0.69, 0.085, 14, 0.5),
    top: curve([[-0.69, 0.828], [-0.5, 0.838], [-0.33, 0.862], [-0.27, 0.928], [-0.12, 0.978], [0.0, 1.022], [0.085, 1.056]]),
    bottom: curve([[-0.69, 0.68], [-0.42, 0.71], [-0.18, 0.79], [-0.03, 0.9], [0.055, 0.995], [0.085, 1.03]]),
    half: curve([[-0.69, 0.15], [-0.48, 0.14], [-0.26, 0.118], [-0.05, 0.084], [0.085, 0.028]]),
    sections: [
      // Sharp upper shoulder: the RSV4 tail is faceted, almost triangular in section.
      { z: -0.69, pts: [[0, 1], [0.6, 0.98], [0.96, 0.82], [1, 0.52], [0.9, 0.2], [0.58, 0.02], [0, 0]] },
      { z: 0.085, pts: [[0, 1], [0.75, 0.96], [1, 0.7], [0.95, 0.42], [0.78, 0.18], [0.4, 0.02], [0, 0]] },
    ],
  };
}

export const RSV4_FACE = {
  centre: smooth2([[-0.031, 0.769], [0.031, 0.769], [0.022, 0.748], [-0.022, 0.748]], 2, true),
  centreAt: [0, 0.758] as P2,
  // Slanted side units: inner ends low, outer ends high — the "angry" Aprilia look.
  side: smooth2([[0.05, 0.726], [0.128, 0.75], [0.136, 0.736], [0.13, 0.724], [0.058, 0.703]], 2, true),
  sideAt: [0.092, 0.727] as P2,
  // DRL frame: over the top of the side unit, then down its outer edge.
  drl: [[0.042, 0.738], [0.09, 0.753], [0.13, 0.764], [0.147, 0.752], [0.15, 0.728], [0.142, 0.705]] as P2[],
  intake: [[0, 0.731], [0.03, 0.728], [0.037, 0.708], [0.026, 0.686], [0, 0.682]] as P2[],
};

/** Lower-front aero channel (right side view) with the integrated wing. */
const CHANNEL: P2[] = [[-1.245, 0.64], [-1.13, 0.682], [-0.98, 0.668], [-0.885, 0.59], [-0.89, 0.49], [-0.98, 0.43], [-1.09, 0.455], [-1.18, 0.56]];

function body(ctx: KitContext): void {
  const ob = rsv4Fairing();
  const q = bodyQ(ctx, 1.7);
  const master = outlineLoft(ob, { su: q.su, sv: q.sv, creases: [2], capFront: true });
  const blackGloss = hard('#0b0c0e', 0.15, 0.2, 1);
  const A = ctx.hp.frontAxle;
  const open = sideRegion([[-1.195, 2], ...SIDE_EDGE, [-0.3, 0.1], [-0.3, 2]]);
  const arch = (_x: number, y: number, z: number) => 0.355 - Math.hypot(z - A[2], y - A[1]);
  const underScreen = fAnd(planRegion([[SCREEN_BASE + 0.08, -1], [-1.05, -1], [-1.05, 0.148], [-1.35, 0.162], [SCREEN_BASE + 0.08, 0.108]]), (_x, y) => y - 0.865);
  const face = apriliaFace(ob, { ...RSV4_FACE, drlWidth: 0.0065, cutBehind: -1.56, intakeBack: -1.46 });
  const aero = apriliaAero(ob, { channel: CHANNEL, ref: [-1.06, 0.56], blades: [[0.622, -1.21, -0.94, 0.018, 0.008], [0.535, -1.13, -0.92, 0.013, 0.006]], inset: 0.055 });
  const bodyCut = cut(master, fAnd(fNot(open), fNot(arch), fNot(underScreen), fNot(face.hole)));
  // Double fairing: the lower side panel and belly are a second, inner layer stepped 16 mm in
  // under the upper panel's swept lower edge.
  const innerOb: OutlineBody = { ...ob, half: (z) => Math.max(0.004, ob.half(z) - 0.016 * Math.min(1, Math.max(0, (z + 1.42) / 0.1))) };
  const innerCut = cut(outlineLoft(innerOb, { su: q.su, sv: q.sv, creases: [2], capFront: true }), fAnd(fNot(open), fNot(arch), fNot(underScreen), fNot(face.hole)));
  const cowl = sideRegion([[-2, 2], [-1.33, 2], [-1.33, 0.94], [-1.35, 0.8], [-1.39, 0.69], [-1.45, 0.6], [-2, 0.58]]);
  const belly = sideRegion([[-1.12, 0.36], [-0.93, 0.33], [-0.7, 0.32], [-0.35, 0.32], [-0.35, -1], [-1.12, -1]]);
  // Second-layer seam: the upper side panel overlaps the lower one along a swept line behind the channel.
  const upper = sideRegion([[-1.4, 2], [-0.3, 2], [-0.3, 0.75], [-0.86, 0.7], [-0.9, 0.62], [-0.99, 0.665], [-1.13, 0.68], [-1.4, 0.64]]);
  addPanel(ctx, 'chassis', bodyCut, cowl, PAINT, 0.003, 0.014);
  addPanel(ctx, 'chassis', bodyCut, fAnd(fNot(cowl), upper, fNot(aero.region)), PAINT, 0.003, 0.014);
  addPanel(ctx, 'chassis', innerCut, fAnd(fNot(cowl), fNot(upper), fNot(belly), fNot(aero.region)), PAINT, 0.003, 0.014);
  addPanel(ctx, 'chassis', innerCut, fAnd(belly, fNot(cowl)), PAINT, 0.003, 0.014);
  aero.add(ctx);
  face.add(ctx);
  innerCowl(ctx, { z0: SCREEN_BASE + 0.06, z1: -1.19, yTop0: 0.875, yTop1: 0.932, yBot0: 0.75, yBot1: 0.8, w0: 0.148, w1: 0.236 });
  screen(ctx, 'chassis', {
    zs: stationsBetween(SCREEN_BASE, SCREEN_TOP_Z, 8, 0.35),
    top: curve([[SCREEN_BASE, 0.878], [-1.47, 0.94], [-1.37, 1.03], [-1.28, 1.1], [-1.22, 1.124], [SCREEN_TOP_Z, 1.128]]),
    bottom: curve([[SCREEN_BASE, 0.866], [-1.35, 0.918], [SCREEN_TOP_Z, 0.958]]),
    half: curve([[SCREEN_BASE, 0.148], [-1.41, 0.18], [-1.29, 0.166], [SCREEN_TOP_Z, 0.12]]),
    sections: [{ z: 0, pts: [[0, 1], [0.45, 0.985], [0.8, 0.93], [0.95, 0.8], [1, 0.55], [1, 0.25], [0.98, 0]] }],
  }, tint(F.screen, '#2f343a'));
  // Tall, short tank with a crisp spine.
  buildTank(ctx, {
    front: -1.19,
    back: -0.6,
    top: 1.068,
    bottomFront: 0.9,
    bottomBack: 0.8,
    width: 0.44,
    style: 'sport',
    knee: 0.17,
    capZ: -0.93,
    topLine: [[-1.19, 0.965], [-1.1, 1.0], [-1.0, 1.046], [-0.9, 1.068], [-0.8, 1.062], [-0.71, 1.02], [-0.64, 0.95], [-0.6, 0.888]],
    bottomLine: [[-1.19, 0.9], [-0.99, 0.865], [-0.8, 0.825], [-0.6, 0.8]],
    halfLine: [[-1.19, 0.118], [-1.09, 0.182], [-0.96, 0.22], [-0.83, 0.216], [-0.71, 0.184], [-0.6, 0.118]],
  });
  buildSeat(ctx, { front: -0.64, back: -0.3, yFront: 0.84, y: 0.845, yBack: 0.876, width: 0.27, thick: 0.068, frontWidth: 0.17 });
  buildSeat(ctx, { front: -0.28, back: -0.04, yFront: 0.925, y: 0.94, yBack: 0.96, width: 0.18, thick: 0.042, frontWidth: 0.14 }, tint(seatFinish(ctx), '#161616'));
  const tb = tail();
  const tm = outlineLoft(tb, { su: ctx.seg(12, 4), sv: ctx.seg(6, 2), capBack: true });
  const seatHole: Field = fAnd(
    fOr(sideRegion([[-0.85, 0.82], [-0.292, 0.82], [-0.292, 1.4], [-0.85, 1.4]]), sideRegion([[-0.282, 0.905], [-0.03, 0.905], [-0.03, 1.4], [-0.282, 1.4]])),
    planRegion([[-0.85, -0.01], [-0.02, -0.01], [-0.02, 0.095], [-0.28, 0.095], [-0.29, 0.14], [-0.85, 0.14]]),
  );
  // Side vent under the seat (the RSV4's tail has a dark scoop on each side).
  const tailVent = sideRegion(smooth2([[-0.36, 0.79], [-0.16, 0.85], [-0.02, 0.915], [-0.05, 0.875], [-0.2, 0.8], [-0.3, 0.772]], 3, true));
  addPanel(ctx, 'chassis', tm, fAnd(fNot(seatHole), fNot(tailVent)), PAINT, 0.0025, 0.012);
  undertray(ctx, { z0: -0.48, z1: 0.07, top0: 0.73, top1: 0.995, bot0: 0.68, botMid: 0.75, bot1: 0.95, w0: 0.135, w1: 0.03 });
  // Tail light: a slim LED wedge under the tip plus two light guides along the lower tail edges.
  tailLamp(ctx, smooth2([[-0.06, -0.006], [0.06, -0.006], [0.07, 0.005], [0.0, 0.01], [-0.07, 0.005]], 4, true), [0, 0.995, 0.072], -0.8, { depth: 0.03 });
  for (const s of [-1, 1]) {
    const pts: P3[] = [];
    for (let i = 0; i <= 4; i++) {
      const z = -0.06 + (i / 4) * 0.12;
      pts.push([s * tb.half(z) * 0.97, tb.bottom(z) + 0.01, z]);
    }
    ledStrip(ctx, 'chassis', pts, 0.006, 0.004, 'tail', [0, 1, 0]);
  }
  frontFender(ctx, { from: -0.66, to: 0.8, gap: 0.02, width: 0.15 });
  hugger(ctx, blackGloss);
  plateHanger(ctx, { fromZ: -0.04, fromY: 0.8 });
  fasteners(ctx, ob, [[-1.3, 0.88], [-1.04, 0.83], [-0.82, 0.56], [-0.98, 0.36], [-0.62, 0.3]]);
}

// ───────────────────────────── livery ─────────────────────────────

const AP_RED = '#d21f2b';
const AP_PURPLE = '#5a2a8c';
const AP_BLACK = '#141518';

function lettering(p: Pen, main: string, accent: string): void {
  if (p.view !== 'right' && p.view !== 'left') return;
  p.text('aprilia', -0.93, 0.39, { color: main, size: 0.062, weight: '800', italic: true, stretch: 1.05 });
  p.text('RSV4', -0.15, 0.885, { color: accent, size: 0.034, weight: '900', italic: true });
  p.text('FACTORY', -0.85, 0.968, { color: main, size: 0.016, weight: '800', spacing: 0.05 });
}

function livery(c: LiveryCanvas, _lv: Livery, env: LiveryEnv): void {
  const lava = env.index === 1;
  c.views(ALL_VIEWS, (p) => {
    if (lava) {
      // Lava Red: deep red bodywork, black lower fairing, purple accents and lettering.
      p.fill(AP_RED, 'metallic');
      if (p.view === 'right' || p.view === 'left') {
        p.poly([[-1.75, 0.58], [-1.3, 0.54], [-1.0, 0.43], [-0.8, 0.36], [-0.4, 0.34], [-0.4, -0.1], [-1.75, -0.1]], AP_BLACK, 'gloss');
        p.line([[-1.62, 0.66], [-1.32, 0.6], [-1.02, 0.49], [-0.8, 0.41]], AP_PURPLE, 0.012);
        p.poly([[-0.62, 0.7], [0.15, 0.93], [0.15, 0.6], [-0.62, 0.6]], AP_BLACK, 'gloss');
        lettering(p, '#f4f4f4', AP_RED);
      } else if (p.view === 'front') {
        p.rect(-1, -1, 1, 0.62, AP_BLACK, 'gloss');
      }
      return;
    }
    // "Aprilia Racing": black with the RS-GP red nose and lower sweep, purple pinstripes.
    p.fill(AP_BLACK, 'satin');
    if (p.view === 'right' || p.view === 'left') {
      p.poly([[-1.75, 0.95], [-1.48, 0.95], [-1.36, 0.72], [-1.26, 0.6], [-1.75, 0.6]], AP_RED, 'gloss');
      p.poly([[-1.2, 0.52], [-0.98, 0.43], [-0.72, 0.36], [-0.5, 0.34], [-0.5, 0.29], [-0.75, 0.3], [-1.0, 0.37], [-1.2, 0.46]], AP_RED, 'gloss');
      p.line([[-1.46, 0.95], [-1.34, 0.72], [-1.24, 0.6]], AP_PURPLE, 0.01);
      p.line([[-0.6, 0.73], [-0.25, 0.83], [0.1, 0.99]], AP_RED, 0.016);
      p.line([[-0.6, 0.705], [-0.25, 0.805], [0.1, 0.965]], AP_PURPLE, 0.008);
      lettering(p, '#f4f4f4', AP_RED);
    } else if (p.view === 'front') {
      p.rect(-1, 0.6, 1, 1.2, AP_RED, 'gloss');
    } else if (p.view === 'top') {
      p.rect(-1.75, -0.3, -1.45, 0.3, AP_RED, 'gloss');
      p.rect(-1.0, -0.008, -0.66, 0.008, AP_RED);
    }
  });
}

export function rsv4Blueprint(spec: BikeSpec): BikeBlueprint {
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.07, 0.735, 1.13],
    wheelbase: 1.436,
    rakeDeg: 24.6,
    trail: 0.1037,
    forkLength: 0.718,
    front: { tyre: '120/70ZR17', rimWidthIn: 3.5, crown: 0.8, tread: 'slickish', tyreLabel: 'Supercorsa SP' },
    rear: { tyre: '200/55ZR17', rimWidthIn: 6.0, crown: 0.9, tread: 'slickish', tyreLabel: 'Supercorsa SP' },
    frontWheel: { type: 'forged', spokes: 5, shape: 'y', color: '#16171a', stripe: '#d21f2b' },
    rearWheel: { type: 'forged', spokes: 5, shape: 'y', color: '#16171a', stripe: '#d21f2b' },
    fork: { type: 'usd', stanchion: 0.043, spacing: 0.21, outerColor: '#c9a028', innerColor: '#d8b45a', footColor: '#1e1f22', capColor: '#c9a028', adjusterColor: '#1d1e21', label: 'ÖHLINS', labelColor: '#1b1c1f', aboveClamp: 0.012, clampGap: 0.2 },
    frontBrake: { discs: 2, discDia: 0.33, disc: 'floating', carrierColor: '#2a2c30', caliper: 'radialMono4', caliperColor: '#5a5d63', caliperText: 'brembo', caliperTextColor: '#d01c1c', caliperAngleDeg: 76 },
    rearBrake: { discs: 1, discDia: 0.22, disc: 'fixed', carrierColor: '#2a2c30', caliper: 'axial2', caliperColor: '#2f3136', caliperAngleDeg: 200 },
    frame: { type: 'twinSpar', color: '#1f2023', metal: 0.75, rough: 0.4, subframe: 'cast', subframeColor: '#1f2023', width: 0.37 },
    swingarm: { type: 'braced', length: 0.6, angleDeg: 10, color: '#1f2023', metal: 0.75, rough: 0.4 },
    shock: { layout: 'mono', springColor: '#e6c41c', bodyColor: '#c9a028', reservoir: true },
    drive: { type: 'chain', side: 'left', frontTeeth: 16, rearTeeth: 40, pitch: 0.015875, sprocketColor: '#1d1e21' },
    engine: {
      layout: 'V4A',
      cc: 1099,
      crank: [0, 0.4, -0.83],
      tiltDeg: 40,
      caseColor: '#232427',
      coverColor: '#2f3135',
      headColor: '#26272a',
      camCoverColor: '#1d1e21',
      camCoverText: 'aprilia',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.42, h: 0.34, z: -1.27, y: 0.62, tiltDeg: 16, curved: true },
      width: 0.37,
    },
    exhaust: { route: 'sideCan', side: 'right', can: 'hex', canLength: 0.28, canDia: 0.115, canFinish: 'black', headerFinish: 'titanium', outlet: [0.215, 0.275, -0.335] },
    cockpit: {
      bars: 'clipon',
      grip: [0.33, 0.885, -0.985],
      barDia: 0.022,
      dash: 'tft',
      dashPos: [0, 1.02, -1.12],
      dashSize: [0.11, 0.066],
      dashTiltDeg: 50,
      dashMount: 'fairing',
      mirrors: 'fairing',
      mirrorPos: [0.325, 0.995, -1.255],
      mirrorSize: [0.14, 0.056],
      mirrorIndicators: true,
      mirrorShape: 'sport',
      mirrorColor: '#0d0e10',
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
    lights: { head: 'sportTwin', tail: 'strip', rearIndicators: 'stalk' },
    seat: { height: 0.845, front: -0.64, back: -0.3, pillion: 'cowl', color: '#141414' },
    rider: { hip: [0, 0.93, -0.45], peg: [0.19, 0.405, -0.43], torsoPitch: 0.78 },
    footrests: 'rearset',
    plate: { mount: 'hanger', pos: [0, 0.6, 0.36], tiltDeg: -14 },
    body,
    livery,
    groundClearance: 0.13,
    features: ['winglets'],
    zones: { splitY: 0.4, decal: [-1.02, 0.4] },
  };
}
