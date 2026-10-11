import type { BikeSpec, Livery } from '../../../data/bikes';
import type { KitContext } from '../context';
import { addPanel, bodyQ, buildSeat, buildTank, frontFender, PAINT, screen, seatFinish } from '../kit/body';
import { moveOutline } from '../kit/eu-sport-parts';
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
import { rsv4Fairing } from './family-eu-sport-rsv4';

/**
 * Aprilia RS 660 (2021+).
 * Spec sheet: wheelbase 1370 mm, rake 24.1°, trail 104.7 mm, seat 820 mm, 183 kg wet,
 * 120/70ZR17 + 180/55ZR17 on 3.50 / 5.50 in cast 3-split-spoke wheels, Kayaba 41 mm USD
 * fork, 2 × 320 mm discs with Brembo radial calipers, aluminium twin-spar frame with the
 * engine stressed, asymmetric aluminium swingarm, 659 cc 270° parallel twin (the RSV4's
 * front bank), short silencer under the engine on the right.
 * Design cues: the RSV4 family face scaled to the 660 — centre lamp at the beak, two side
 * lamps each framed by a bold DRL "bracket" — and the double fairing whose outer shell
 * works as a wing over a deep channel into the dark inner layer; clip-ons above the top
 * clamp; Lava Red and Apex Black.
 */

const DZ = 0.052;
const DY = -0.022;
const mv = (pts: readonly P2[]): P2[] => pts.map(([z, y]) => [z + DZ, y + DY] as P2);

const SCREEN_BASE = -1.598 + DZ;
const SCREEN_TOP_Z = -1.2 + DZ;

const SIDE_EDGE: P2[] = mv([
  [-1.195, 0.975],
  [-1.1, 0.948],
  [-1.0, 0.895],
  [-0.9, 0.8],
  [-0.82, 0.64],
  [-0.76, 0.49],
  [-0.7, 0.37],
  [-0.63, 0.28],
  [-0.56, 0.23],
  [-0.49, 0.21],
]);

function fairing(): OutlineBody {
  // The RSV4 design lines, moved back with the shorter wheelbase and slimmed down.
  return moveOutline(rsv4Fairing(), { dz: DZ, dy: DY, sx: 0.965 });
}

function tail(): OutlineBody {
  return {
    zs: stationsBetween(-0.66, 0.07, 14, 0.5),
    top: curve([[-0.66, 0.805], [-0.48, 0.815], [-0.32, 0.84], [-0.26, 0.9], [-0.12, 0.95], [-0.01, 0.99], [0.07, 1.02]]),
    bottom: curve([[-0.66, 0.66], [-0.4, 0.69], [-0.18, 0.77], [-0.04, 0.875], [0.04, 0.965], [0.07, 0.995]]),
    half: curve([[-0.66, 0.148], [-0.46, 0.138], [-0.25, 0.117], [-0.05, 0.085], [0.07, 0.03]]),
    sections: [
      { z: -0.66, pts: [[0, 1], [0.6, 0.98], [0.96, 0.82], [1, 0.52], [0.9, 0.2], [0.58, 0.02], [0, 0]] },
      { z: 0.07, pts: [[0, 1], [0.75, 0.96], [1, 0.7], [0.95, 0.42], [0.78, 0.18], [0.4, 0.02], [0, 0]] },
    ],
  };
}

/** Face (front view): centre lamp, slanted side lamps and the bold DRL brackets around them. */
const FACE = {
  centre: smooth2([[-0.028, 0.744], [0.028, 0.744], [0.02, 0.724], [-0.02, 0.724]], 2, true),
  centreAt: [0, 0.734] as P2,
  side: smooth2([[0.048, 0.703], [0.118, 0.725], [0.126, 0.711], [0.12, 0.698], [0.056, 0.682]], 2, true),
  sideAt: [0.088, 0.704] as P2,
  drl: [[0.036, 0.715], [0.085, 0.731], [0.124, 0.743], [0.142, 0.733], [0.146, 0.705], [0.138, 0.676], [0.12, 0.663]] as P2[],
  intake: [[0, 0.708], [0.028, 0.705], [0.034, 0.687], [0.024, 0.666], [0, 0.662]] as P2[],
};

/** Deep aero channel under the outer "wing" shell (right side view). */
const CHANNEL: P2[] = mv([[-1.25, 0.655], [-1.13, 0.698], [-0.97, 0.69], [-0.87, 0.6], [-0.875, 0.48], [-0.97, 0.42], [-1.08, 0.445], [-1.17, 0.56]]);

function body(ctx: KitContext): void {
  const ob = fairing();
  const q = bodyQ(ctx, 1.6);
  const master = outlineLoft(ob, { su: q.su, sv: q.sv, creases: [2], capFront: true });
  const blackGloss = hard('#0b0c0e', 0.15, 0.2, 1);
  const A = ctx.hp.frontAxle;
  const open = sideRegion([[SIDE_EDGE[0][0], 2], ...SIDE_EDGE, [-0.28, 0.1], [-0.28, 2]]);
  const arch = (_x: number, y: number, z: number) => 0.35 - Math.hypot(z - A[2], y - A[1]);
  const underScreen = fAnd(planRegion([[SCREEN_BASE + 0.07, -1], [-1.0, -1], [-1.0, 0.142], [-1.3, 0.156], [-1.42, 0.135], [SCREEN_BASE + 0.07, 0.087]]), (_x, y) => y - 0.83);
  const face = apriliaFace(ob, { ...FACE, drlWidth: 0.0085, cutBehind: -1.51, intakeBack: -1.41 });
  const aero = apriliaAero(ob, { channel: CHANNEL, ref: mv([[-1.04, 0.56]])[0], blades: [[0.625 + DY, -1.21 + DZ, -0.93 + DZ, 0.02, 0.009]], inset: 0.06 });
  const holes = fAnd(fNot(open), fNot(arch), fNot(underScreen), fNot(face.hole));
  const bodyCut = cut(master, holes);
  // Double fairing: the lower side panel and belly form an inner layer 22 mm inside the outer "wing" shell.
  const innerOb: OutlineBody = { ...ob, half: (z) => Math.max(0.004, ob.half(z) - 0.022 * Math.min(1, Math.max(0, (z + 1.37) / 0.1))) };
  const innerCut = cut(outlineLoft(innerOb, { su: q.su, sv: q.sv, creases: [2], capFront: true }), holes);
  const cowl = sideRegion(mv([[-2, 2], [-1.33, 2], [-1.33, 0.94], [-1.35, 0.8], [-1.39, 0.69], [-1.45, 0.6], [-2, 0.58]]));
  const belly = sideRegion(mv([[-1.12, 0.37], [-0.93, 0.34], [-0.7, 0.33], [-0.35, 0.33], [-0.35, -1], [-1.12, -1]]));
  // Outer shell: a big wing-shaped panel whose swept lower edge overhangs the channel and the inner layer.
  const upper = sideRegion(mv([[-1.4, 2], [-0.3, 2], [-0.3, 0.8], [-0.8, 0.74], [-0.86, 0.66], [-0.92, 0.7], [-1.0, 0.7], [-1.13, 0.705], [-1.4, 0.66]]));
  addPanel(ctx, 'chassis', bodyCut, cowl, PAINT, 0.003, 0.014);
  addPanel(ctx, 'chassis', bodyCut, fAnd(fNot(cowl), upper, fNot(aero.region)), PAINT, 0.003, 0.014);
  addPanel(ctx, 'chassis', innerCut, fAnd(fNot(cowl), fNot(upper), fNot(belly), fNot(aero.region)), PAINT, 0.003, 0.014);
  addPanel(ctx, 'chassis', innerCut, fAnd(belly, fNot(cowl)), PAINT, 0.003, 0.014);
  aero.add(ctx);
  face.add(ctx);
  innerCowl(ctx, { z0: SCREEN_BASE + 0.06, z1: SCREEN_TOP_Z + 0.01, yTop0: 0.82, yTop1: 0.88, yBot0: 0.73, yBot1: 0.78, w0: 0.096, w1: 0.164 });
  // Short sport screen (the 660's is lower than the RSV4's).
  screen(ctx, 'chassis', {
    zs: stationsBetween(SCREEN_BASE, SCREEN_TOP_Z, 8, 0.35),
    top: curve([[SCREEN_BASE, 0.824], [SCREEN_BASE + 0.08, 0.876], [SCREEN_BASE + 0.19, 0.955], [SCREEN_BASE + 0.3, 1.03], [SCREEN_TOP_Z - 0.03, 1.064], [SCREEN_TOP_Z, 1.07]]),
    bottom: curve([[SCREEN_BASE, 0.812], [SCREEN_BASE + 0.22, 0.878], [SCREEN_TOP_Z, 0.932]]),
    half: curve([[SCREEN_BASE, 0.124], [SCREEN_BASE + 0.14, 0.168], [SCREEN_BASE + 0.3, 0.158], [SCREEN_TOP_Z, 0.114]]),
    sections: [{ z: 0, pts: [[0, 1], [0.45, 0.985], [0.8, 0.93], [0.95, 0.8], [1, 0.55], [1, 0.25], [0.98, 0]] }],
  }, tint(F.screen, '#2f343a'));
  buildTank(ctx, {
    front: -1.14,
    back: -0.57,
    top: 1.036,
    bottomFront: 0.875,
    bottomBack: 0.78,
    width: 0.425,
    style: 'sport',
    knee: 0.16,
    capZ: -0.89,
    topLine: [[-1.14, 0.942], [-1.05, 0.975], [-0.95, 1.016], [-0.85, 1.036], [-0.76, 1.03], [-0.67, 0.99], [-0.61, 0.925], [-0.57, 0.865]],
    bottomLine: [[-1.14, 0.875], [-0.95, 0.842], [-0.76, 0.805], [-0.57, 0.78]],
    halfLine: [[-1.14, 0.114], [-1.04, 0.176], [-0.92, 0.212], [-0.79, 0.208], [-0.68, 0.178], [-0.57, 0.114]],
  });
  buildSeat(ctx, { front: -0.61, back: -0.285, yFront: 0.815, y: 0.82, yBack: 0.852, width: 0.275, thick: 0.07, frontWidth: 0.172 });
  buildSeat(ctx, { front: -0.265, back: -0.03, yFront: 0.897, y: 0.912, yBack: 0.933, width: 0.18, thick: 0.045, frontWidth: 0.142 }, tint(seatFinish(ctx), '#161616'));
  const tb = tail();
  const tm = outlineLoft(tb, { su: ctx.seg(12, 4), sv: ctx.seg(6, 2), capBack: true });
  const seatHole: Field = fAnd(
    fOr(sideRegion([[-0.85, 0.79], [-0.277, 0.79], [-0.277, 1.4], [-0.85, 1.4]]), sideRegion([[-0.267, 0.878], [-0.02, 0.878], [-0.02, 1.4], [-0.267, 1.4]])),
    planRegion([[-0.85, -0.01], [-0.01, -0.01], [-0.01, 0.095], [-0.265, 0.095], [-0.275, 0.14], [-0.85, 0.14]]),
  );
  const tailVent = sideRegion(smooth2([[-0.34, 0.77], [-0.15, 0.828], [-0.03, 0.89], [-0.06, 0.85], [-0.2, 0.78], [-0.29, 0.752]], 3, true));
  addPanel(ctx, 'chassis', tm, fAnd(fNot(seatHole), fNot(tailVent)), PAINT, 0.0025, 0.012);
  undertray(ctx, { z0: -0.46, z1: 0.055, top0: 0.71, top1: 0.96, bot0: 0.66, botMid: 0.73, bot1: 0.92, w0: 0.133, w1: 0.03 });
  tailLamp(ctx, smooth2([[-0.058, -0.006], [0.058, -0.006], [0.068, 0.005], [0.0, 0.01], [-0.068, 0.005]], 4, true), [0, 0.962, 0.058], -0.8, { depth: 0.03 });
  for (const s of [-1, 1]) {
    const pts: P3[] = [];
    for (let i = 0; i <= 4; i++) {
      const z = -0.07 + (i / 4) * 0.12;
      pts.push([s * tb.half(z) * 0.97, tb.bottom(z) + 0.01, z]);
    }
    ledStrip(ctx, 'chassis', pts, 0.006, 0.004, 'tail', [0, 1, 0]);
  }
  frontFender(ctx, { from: -0.66, to: 0.8, gap: 0.02, width: 0.145 });
  hugger(ctx, blackGloss);
  plateHanger(ctx, { fromZ: -0.05, fromY: 0.78 });
  fasteners(ctx, ob, mv([[-1.3, 0.88], [-1.04, 0.83], [-0.82, 0.58], [-0.98, 0.38], [-0.62, 0.32]]));
}

// ───────────────────────────── livery ─────────────────────────────

const LAVA = '#d0202c';
const PURPLE = '#5b2c90';
const APEX = '#141518';

function lettering(p: Pen, main: string, model: string): void {
  if (p.view !== 'right' && p.view !== 'left') return;
  p.text('aprilia', -0.89, 0.38, { color: main, size: 0.058, weight: '800', italic: true, stretch: 1.05 });
  p.text('RS 660', -0.08, 0.875, { color: model, size: 0.026, weight: '900', italic: true });
}

function livery(c: LiveryCanvas, _lv: Livery, env: LiveryEnv): void {
  const apex = env.index === 1;
  c.views(ALL_VIEWS, (p) => {
    if (apex) {
      // Apex Black: gloss black with the purple and red speed stripes of the RS-GP.
      p.fill(APEX, 'gloss');
      if (p.view === 'right' || p.view === 'left') {
        p.line([[-1.6, 0.72], [-1.3, 0.69], [-1.05, 0.66], [-0.85, 0.6]], PURPLE, 0.018);
        p.line([[-1.58, 0.69], [-1.3, 0.66], [-1.05, 0.635], [-0.86, 0.575]], LAVA, 0.008);
        p.line([[-0.58, 0.72], [-0.22, 0.81], [0.08, 0.96]], PURPLE, 0.014);
        p.line([[-0.58, 0.7], [-0.22, 0.79], [0.08, 0.94]], LAVA, 0.006);
        lettering(p, '#f2f2f2', LAVA);
      } else if (p.view === 'top') {
        p.rect(-0.96, -0.012, -0.62, 0.012, PURPLE);
      }
      return;
    }
    // Lava Red: red upper shell and tail, black inner layer / belly, purple accents.
    p.fill(LAVA, 'gloss');
    if (p.view === 'right' || p.view === 'left') {
      p.poly([[-1.2, 0.66], [-0.98, 0.66], [-0.8, 0.6], [-0.6, 0.45], [-0.35, 0.36], [-0.35, -0.1], [-1.2, -0.1]], APEX, 'gloss');
      p.line([[-1.62, 0.7], [-1.3, 0.69], [-1.05, 0.68], [-0.84, 0.64]], PURPLE, 0.01);
      p.poly([[-0.6, 0.7], [0.1, 0.92], [0.1, 0.6], [-0.6, 0.6]], APEX, 'gloss');
      p.line([[-0.58, 0.725], [-0.22, 0.815], [0.08, 0.965]], PURPLE, 0.01);
      lettering(p, '#f2f2f2', '#f2f2f2');
    } else if (p.view === 'front') {
      p.rect(-1, -1, 1, 0.6, APEX, 'gloss');
    } else if (p.view === 'top') {
      p.rect(-0.96, -0.1, -0.6, 0.1, APEX, 'gloss');
    }
  });
}

export function rs660Blueprint(spec: BikeSpec): BikeBlueprint {
  return {
    id: spec.id,
    source: 'authored',
    overall: [1.995, 0.745, 1.14],
    wheelbase: 1.37,
    rakeDeg: 24.1,
    trail: 0.1047,
    forkLength: 0.69,
    front: { tyre: '120/70ZR17', rimWidthIn: 3.5, crown: 0.84, tread: 'sport', tyreLabel: 'Diablo Rosso IV' },
    rear: { tyre: '180/55ZR17', rimWidthIn: 5.5, crown: 0.94, tread: 'sport', tyreLabel: 'Diablo Rosso IV' },
    frontWheel: { type: 'cast', spokes: 3, shape: 'split', color: '#17181b' },
    rearWheel: { type: 'cast', spokes: 3, shape: 'split', color: '#17181b' },
    fork: { type: 'usd', stanchion: 0.041, spacing: 0.205, outerColor: '#1d1e21', innerColor: '#c4c8ce', footColor: '#1d1e21', capColor: '#2a2c30', adjusterColor: '#c99a2c', label: 'KYB', labelColor: '#d8dadd', aboveClamp: 0.015, clampGap: 0.19 },
    frontBrake: { discs: 2, discDia: 0.32, disc: 'floating', carrierColor: '#2a2c30', caliper: 'radial4', caliperColor: '#26282c', caliperText: 'brembo', caliperTextColor: '#d01c1c', caliperAngleDeg: 76 },
    rearBrake: { discs: 1, discDia: 0.22, disc: 'fixed', carrierColor: '#2a2c30', caliper: 'axial2', caliperColor: '#2f3136', caliperAngleDeg: 200 },
    frame: { type: 'twinSpar', color: '#1f2023', metal: 0.7, rough: 0.42, subframe: 'cast', subframeColor: '#1f2023', width: 0.33 },
    swingarm: { type: 'banana', length: 0.565, angleDeg: 10, color: '#1f2023', metal: 0.7, rough: 0.42 },
    shock: { layout: 'mono', springColor: '#1d1e21', bodyColor: '#3a3d42', reservoir: false },
    drive: { type: 'chain', side: 'left', frontTeeth: 16, rearTeeth: 43, pitch: 0.015875, sprocketColor: '#1d1e21' },
    engine: {
      layout: 'P2_270',
      cc: 659,
      crank: [0, 0.38, -0.79],
      tiltDeg: 42,
      caseColor: '#232427',
      coverColor: '#2f3135',
      headColor: '#26272a',
      camCoverColor: '#1d1e21',
      camCoverText: 'aprilia',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.38, h: 0.3, z: -1.2, y: 0.6, tiltDeg: 16, curved: true },
      width: 0.3,
    },
    exhaust: { route: 'underslung', side: 'right', can: 'stubby', canLength: 0.16, canDia: 0.1, canFinish: 'black', headerFinish: 'steel' },
    cockpit: {
      bars: 'clipon',
      grip: [0.335, 0.905, -0.935],
      barDia: 0.022,
      dash: 'tft',
      dashPos: [0, 0.995, -1.07],
      dashSize: [0.1, 0.06],
      dashTiltDeg: 48,
      dashMount: 'fairing',
      mirrors: 'fairing',
      mirrorPos: [0.31, 0.97, -1.2],
      mirrorSize: [0.135, 0.055],
      mirrorIndicators: true,
      mirrorShape: 'sport',
      mirrorColor: '#0d0e10',
      topClamp: 'milled',
      steeringDamper: 'none',
      leverColor: '#1e1f22',
      reservoirs: true,
      clutch: 'cable',
      ignition: 'clamp',
      switchColor: '#151618',
      gripColor: '#121212',
      barEndColor: '#1d1e21',
    },
    lights: { head: 'sportTwin', tail: 'strip', rearIndicators: 'stalk' },
    seat: { height: 0.82, front: -0.61, back: -0.285, pillion: 'seat', color: '#141414' },
    rider: { hip: [0, 0.9, -0.43], peg: [0.185, 0.38, -0.42], torsoPitch: 0.68 },
    footrests: 'rearset',
    plate: { mount: 'hanger', pos: [0, 0.58, 0.35], tiltDeg: -14 },
    body,
    livery,
    groundClearance: 0.13,
    features: ['winglets'],
    zones: { splitY: 0.4, decal: [-0.89, 0.38] },
  };
}
