import type { BikeSpec, Livery } from '../../../data/bikes';
import { S, T, type KitContext } from '../context';
import { addPanel, bodyQ, buildSeat, buildTank, frontFender, PAINT, screen, seatFinish } from '../kit/body';
import { steelDiamond } from '../kit/jp-sport-frame';
import { ductLiner, fasteners, frontHit, innerCowl, mirrorLoop, tailLamp, undertray } from '../kit/jp-sport-parts';
import { ledStrip } from '../kit/lights';
import { hugger, plateHanger } from '../kit/rear';
import { curve, outlineLoft, sideAt, stationsBetween, type OutlineBody } from '../kit/shape';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv, type Pen } from '../livery';
import { extrude, lathe, smooth2, type P2, type P3 } from '../mesh';
import { F, hard, tint } from '../sink';
import { cut, fAnd, fNot, frontRegion, fOr, planRegion, sideRegion, type Field } from '../surface';
import type { BikeBlueprint } from '../types';

/**
 * Yamaha YZF-R3 (2025 update).
 * Spec sheet: wheelbase 1380 mm, caster 25°, trail 94 mm, seat 780 mm,
 * L×W×H 2090 × 730 × 1140 mm, ground clearance 160 mm, 110/70R17 + 140/70R17 on
 * 2.75/4.00 rims, 37 mm KYB USD fork, single 298 mm disc with a two-piston caliper,
 * tubular steel diamond frame, 321 cc parallel twin, 169 kg.
 * Design cues (2025 R-family face): the M-shaped central intake carrying the single LED
 * projector headlight, twin slim LED position "eyes" at the upper corners, the visible
 * steel frame tubes under the tank, a slim new tail, the short side silencer, 10-spoke
 * wheels and an LCD dash.
 */

const NOSE = -1.622;
const SCREEN_BASE = -1.5;
const SCREEN_TOP_Z = -1.13;

const SIDE_EDGE: P2[] = [
  [-1.1, 0.945],
  [-1.02, 0.915],
  [-0.94, 0.86],
  [-0.86, 0.76],
  [-0.79, 0.62],
  [-0.73, 0.5],
  [-0.68, 0.42],
  [-0.64, 0.38],
];

function fairing(): OutlineBody {
  const zs = [NOSE, -1.617, -1.607, -1.592, -1.572, -1.544, -1.506, -1.458, -1.4, -1.33, -1.25, -1.16, -1.06, -0.96, -0.86, -0.76, -0.68, -0.62];
  const face: P2[] = [[0, 1], [0.3, 0.96], [0.62, 0.86], [0.85, 0.68], [0.97, 0.46], [0.9, 0.21], [0.56, 0.045], [0, 0]];
  const cowl: P2[] = [[0, 1], [0.35, 0.985], [0.64, 0.935], [0.82, 0.8], [0.95, 0.6], [1, 0.38], [0.96, 0.13], [0.82, 0]];
  const side: P2[] = [[0, 1], [0.38, 0.99], [0.68, 0.95], [0.86, 0.82], [0.97, 0.6], [1, 0.36], [0.96, 0.11], [0.86, 0]];
  return {
    zs,
    top: curve([[NOSE, 0.765], [-1.6, 0.8], [-1.56, 0.83], [-1.48, 0.862], [-1.38, 0.89], [-1.27, 0.915], [-1.16, 0.93], [-1.04, 0.928], [-0.9, 0.895], [-0.76, 0.84], [-0.62, 0.77]]),
    bottom: curve([[NOSE, 0.75], [-1.617, 0.7], [-1.602, 0.66], [-1.575, 0.632], [-1.525, 0.612], [-1.45, 0.598], [-1.37, 0.575], [-1.3, 0.5], [-1.21, 0.4], [-1.1, 0.33], [-0.96, 0.305], [-0.8, 0.325], [-0.68, 0.37], [-0.62, 0.395]]),
    half: curve([[NOSE, 0.01], [-1.617, 0.055], [-1.602, 0.095], [-1.572, 0.135], [-1.515, 0.178], [-1.435, 0.214], [-1.335, 0.243], [-1.215, 0.262], [-1.065, 0.27], [-0.9, 0.26], [-0.75, 0.235], [-0.62, 0.21]]),
    sections: [
      { z: NOSE, pts: face },
      { z: -1.55, pts: face },
      { z: -1.35, pts: cowl },
      { z: -1.0, pts: side },
      { z: -0.62, pts: side },
    ],
  };
}

function tail(): OutlineBody {
  return {
    zs: stationsBetween(-0.64, 0.1, 14, 0.5),
    top: curve([[-0.64, 0.79], [-0.48, 0.8], [-0.31, 0.82], [-0.25, 0.88], [-0.1, 0.925], [0.02, 0.96], [0.1, 0.99]]),
    bottom: curve([[-0.64, 0.66], [-0.4, 0.68], [-0.16, 0.74], [0.0, 0.84], [0.07, 0.93], [0.1, 0.96]]),
    half: curve([[-0.64, 0.148], [-0.46, 0.138], [-0.24, 0.116], [-0.03, 0.085], [0.1, 0.03]]),
    sections: [
      { z: -0.64, pts: [[0, 1], [0.6, 0.98], [0.95, 0.84], [1, 0.55], [0.93, 0.22], [0.6, 0.02], [0, 0]] },
      { z: 0.1, pts: [[0, 1], [0.74, 0.97], [1, 0.72], [0.98, 0.44], [0.84, 0.2], [0.42, 0.02], [0, 0]] },
    ],
  };
}

/** M-shaped centre intake (front view, right half), carrying the projector. */
const M_DUCT: P2[] = [[0, 0.684], [0.02, 0.696], [0.045, 0.716], [0.07, 0.722], [0.09, 0.706], [0.1, 0.675], [0.094, 0.646], [0.078, 0.63], [0, 0.626]];
/** Air outlet slit in the side panel (side view). */
const VENT: P2[] = [[-1.2, 0.79], [-1.06, 0.785], [-0.95, 0.75], [-0.925, 0.728], [-1.04, 0.732], [-1.18, 0.762]];

function body(ctx: KitContext): void {
  const ob = fairing();
  const q = bodyQ(ctx, 1.5);
  const master = outlineLoft(ob, { su: q.su, sv: q.sv, creases: [2], capFront: true });
  const blackGloss = hard('#0b0c0e', 0.15, 0.2, 1);
  const A = ctx.hp.frontAxle;
  const open = sideRegion([[-1.1, 2], ...SIDE_EDGE, [-0.4, 0.2], [-0.3, 2]]);
  const arch = (_x: number, y: number, z: number) => 0.345 - Math.hypot(z - A[2], y - A[1]);
  const underScreen = fAnd(planRegion([[SCREEN_BASE + 0.07, -1], [-1.0, -1], [-1.0, 0.14], [-1.28, 0.155], [SCREEN_BASE + 0.07, 0.105]]), (_x, y) => y - 0.84);
  const intake = fAnd(frontRegion(M_DUCT), (_x, _y, z) => -1.53 - z);
  const vent = sideRegion(smooth2(VENT, 3, true));
  const bodyCut = cut(master, fAnd(fNot(open), fNot(arch), fNot(underScreen), fNot(intake)));
  const cowl = sideRegion([[-2, 2], [-1.29, 2], [-1.29, 0.91], [-1.32, 0.77], [-1.38, 0.66], [-1.45, 0.59], [-2, 0.57]]);
  const lower = sideRegion([[-1.25, 0.47], [-1.05, 0.5], [-0.85, 0.48], [-0.7, 0.45], [-0.4, 0.45], [-0.4, -1], [-1.25, -1]]);
  addPanel(ctx, 'chassis', bodyCut, cowl, PAINT, 0.003, 0.013);
  addPanel(ctx, 'chassis', bodyCut, fAnd(fNot(cowl), fNot(lower), fNot(vent)), PAINT, 0.003, 0.013);
  addPanel(ctx, 'chassis', bodyCut, fAnd(lower, fNot(cowl)), PAINT, 0.003, 0.013);
  for (const s of [-1, 1]) {
    const p = sideAt(ob, -1.06, 0.76, s);
    ctx.add('chassis', extrude(smooth2(VENT.map(([z, y]) => [z + (z < -1.06 ? -0.01 : 0.01), y + (y > 0.76 ? 0.01 : -0.01)] as P2), 3, true), 0.006, { plane: 'zy', center: p.p[0] - s * 0.035 }), F.texturedBlack);
  }
  // M intake: black lining and the single LED projector in its centre.
  ductLiner(ctx, ob, mirrorLoop(M_DUCT), -1.44, 0.8);
  {
    const pr = 0.026;
    const at: P3 = [0, 0.67, -1.535];
    const seg = ctx.seg(28, 12);
    ctx.add('chassis', lathe([[0, -0.04], [pr * 1.1, -0.03], [pr * 1.35, 0.0]], { segs: seg, axis: 'z' }).transform(S(1, 1, -1)), F.chrome, T(...at));
    ctx.add('chassis', lathe(([[0, 0.012], [pr * 0.65, 0.01], [pr, 0.0]] as P2[]).reverse(), { segs: seg, axis: 'z' }).transform(S(1, 1, -1)), F.head, T(...at));
    ctx.add('chassis', lathe([[pr * 1.02, -0.004], [pr * 1.25, -0.004], [pr * 1.25, 0.006], [pr * 1.02, 0.006]], { segs: seg, axis: 'z', sharp: true }), F.texturedBlack, T(at[0], at[1], at[2] - 0.006));
  }
  // LED position "eyes" at the upper corners of the face.
  for (const s of [-1, 1]) {
    const pts: P3[] = [];
    let nrm: P3 = [0, 0, -1];
    for (const [x, y] of [[0.085, 0.748], [0.11, 0.758], [0.135, 0.772], [0.152, 0.786]] as P2[]) {
      const h = frontHit(ob, s * x, y);
      if (h) {
        pts.push([h.p[0] + h.n[0] * 0.0015, h.p[1] + h.n[1] * 0.0015, h.p[2] + h.n[2] * 0.0015]);
        nrm = h.n;
      }
    }
    if (pts.length >= 3) ledStrip(ctx, 'chassis', pts, 0.008, 0.004, 'drl', nrm);
  }
  innerCowl(ctx, { z0: SCREEN_BASE + 0.05, z1: -1.12, yTop0: 0.85, yTop1: 0.91, yBot0: 0.74, yBot1: 0.79, w0: 0.14, w1: 0.23 });
  screen(ctx, 'chassis', {
    zs: stationsBetween(SCREEN_BASE, SCREEN_TOP_Z, 8, 0.35),
    top: curve([[SCREEN_BASE, 0.87], [-1.42, 0.93], [-1.33, 1.02], [-1.24, 1.1], [-1.17, 1.135], [SCREEN_TOP_Z, 1.14]]),
    bottom: curve([[SCREEN_BASE, 0.858], [-1.3, 0.9], [SCREEN_TOP_Z, 0.94]]),
    half: curve([[SCREEN_BASE, 0.14], [-1.36, 0.175], [-1.24, 0.165], [SCREEN_TOP_Z, 0.12]]),
    sections: [{ z: 0, pts: [[0, 1], [0.45, 0.985], [0.8, 0.93], [0.95, 0.8], [1, 0.55], [1, 0.25], [0.98, 0]] }],
  }, tint(F.screen, '#3a4450'));
  buildTank(ctx, {
    front: -1.1,
    back: -0.6,
    top: 1.03,
    bottomFront: 0.87,
    bottomBack: 0.77,
    width: 0.4,
    style: 'sport',
    knee: 0.14,
    capZ: -0.87,
    topLine: [[-1.1, 0.935], [-1.02, 0.968], [-0.93, 1.012], [-0.83, 1.03], [-0.74, 1.02], [-0.66, 0.975], [-0.62, 0.91], [-0.6, 0.86]],
    bottomLine: [[-1.1, 0.87], [-0.92, 0.835], [-0.75, 0.8], [-0.6, 0.77]],
    halfLine: [[-1.1, 0.11], [-1.0, 0.17], [-0.89, 0.2], [-0.77, 0.196], [-0.67, 0.165], [-0.6, 0.11]],
  });
  buildSeat(ctx, { front: -0.62, back: -0.27, yFront: 0.776, y: 0.78, yBack: 0.812, width: 0.27, thick: 0.07, frontWidth: 0.17 });
  buildSeat(ctx, { front: -0.255, back: 0.0, yFront: 0.87, y: 0.883, yBack: 0.905, width: 0.18, thick: 0.045, frontWidth: 0.14 }, tint(seatFinish(ctx), '#161616'));
  const tm = outlineLoft(tail(), { su: ctx.seg(12, 4), sv: ctx.seg(6, 2), capBack: true });
  const seatHole: Field = fAnd(
    fOr(sideRegion([[-0.8, 0.76], [-0.262, 0.76], [-0.262, 1.4], [-0.8, 1.4]]), sideRegion([[-0.252, 0.85], [0.01, 0.85], [0.01, 1.4], [-0.252, 1.4]])),
    planRegion([[-0.8, -0.01], [0.02, -0.01], [0.02, 0.095], [-0.25, 0.095], [-0.26, 0.138], [-0.8, 0.138]]),
  );
  addPanel(ctx, 'chassis', tm, fNot(seatHole), PAINT, 0.0025, 0.012);
  undertray(ctx, { z0: -0.44, z1: 0.08, top0: 0.7, top1: 0.94, bot0: 0.65, botMid: 0.7, bot1: 0.9, w0: 0.13, w1: 0.032 });
  tailLamp(ctx, smooth2([[-0.055, -0.006], [0.055, -0.006], [0.06, 0.004], [0.0, 0.008], [-0.06, 0.004]], 4, true), [0, 0.92, 0.085], -0.62);
  frontFender(ctx, { from: -0.62, to: 0.8, gap: 0.02, width: 0.14 });
  hugger(ctx, blackGloss);
  plateHanger(ctx, { fromZ: -0.02, fromY: 0.75 });
  steelDiamond(ctx, { width: 0.31, r: 0.016 });
  fasteners(ctx, ob, [[-1.24, 0.85], [-1.0, 0.8], [-0.8, 0.58], [-1.1, 0.4]]);
}

// ───────────────────────────── livery ─────────────────────────────

function lettering(p: Pen, color: string): void {
  if (p.view !== 'right' && p.view !== 'left') return;
  p.text('R3', -0.93, 0.57, { color, size: 0.11, italic: true, weight: '900', stretch: 1.1, font: 'Arial, Helvetica, sans-serif' });
  p.text('YAMAHA', -1.2, 0.79, { color, size: 0.026, weight: '900', spacing: 0.08 });
  p.text('YZF-R3', 0.0, 0.86, { color, size: 0.022, italic: true, weight: '800' });
}

function livery(c: LiveryCanvas, lv: Livery, env: LiveryEnv): void {
  const midnight = env.index === 1;
  const black = '#0c0d10';
  c.views(ALL_VIEWS, (p) => {
    if (midnight) {
      p.fill(lv.primary, 'metallic');
      if (p.view === 'right' || p.view === 'left') {
        p.poly([[-1.15, 0.84], [-0.85, 0.76], [-0.66, 0.6], [-0.66, 0.46], [-1.05, 0.48]], '#2a2c31', 'matte');
        p.line([[-1.58, 0.72], [-1.15, 0.84], [-0.85, 0.76]], '#3a7bd5', 0.005);
        lettering(p, '#8a96a5');
      }
      return;
    }
    // Icon Blue: blue cowl, side panels, tank and tail; black lower panels and tail edge; cyan accent.
    p.fill(lv.primary, 'metallic');
    if (p.view === 'right' || p.view === 'left') {
      p.poly([[-1.25, 0.47], [-1.05, 0.5], [-0.85, 0.48], [-0.7, 0.45], [-0.4, 0.45], [-0.4, -0.1], [-1.25, -0.1]], black, 'gloss');
      p.poly([[-1.62, 0.6], [-1.42, 0.56], [-1.25, 0.47], [-1.25, -0.1], [-1.7, -0.1]], black, 'gloss');
      p.line([[-1.55, 0.74], [-1.24, 0.88], [-0.98, 0.87], [-0.78, 0.77]], '#c9ccd2', 0.004, 'metallic');
      p.line([[-1.42, 0.575], [-1.25, 0.49], [-1.05, 0.515]], '#3fa9f5', 0.01);
      p.poly([[-0.62, 0.71], [0.15, 0.9], [0.15, 0.6], [-0.62, 0.6]], black, 'gloss');
      lettering(p, '#f4f6f8');
    } else if (p.view === 'front') {
      p.rect(-1, -1, 1, 0.58, black, 'gloss');
    }
  });
}

export function r3Blueprint(spec: BikeSpec): BikeBlueprint {
  const lv = spec.liveries[0];
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.09, 0.73, 1.14],
    wheelbase: 1.38,
    rakeDeg: 25,
    trail: 0.094,
    forkLength: 0.69,
    front: { tyre: '110/70R17', rimWidthIn: 2.75, crown: 0.9, tread: 'sport', tyreLabel: 'Sport Radial' },
    rear: { tyre: '140/70R17', rimWidthIn: 4.0, crown: 1.0, tread: 'sport', tyreLabel: 'Sport Radial' },
    frontWheel: { type: 'cast', spokes: 10, shape: 'straight', color: lv.wheel },
    rearWheel: { type: 'cast', spokes: 10, shape: 'straight', color: lv.wheel },
    fork: { type: 'usd', stanchion: 0.037, spacing: 0.19, outerColor: '#1f2023', innerColor: '#c9ccd2', footColor: '#1c1d20', capColor: '#2a2c30', aboveClamp: 0.025, clampGap: 0.18 },
    frontBrake: { discs: 1, discDia: 0.298, disc: 'fixed', carrierColor: '#2b2d31', caliper: 'axial2', caliperColor: '#2a2b2e', caliperAngleDeg: 76 },
    rearBrake: { discs: 1, discDia: 0.22, disc: 'fixed', carrierColor: '#2b2d31', caliper: 'axial1', caliperColor: '#2a2b2e', caliperAngleDeg: 200 },
    // Minimal kit frame (hidden backbone); the visible steel diamond tubes come from `steelDiamond`.
    frame: { type: 'backbone', color: '#18191c', metal: 0.35, rough: 0.42, subframe: 'tubular', subframeColor: '#18191c', width: 0.31 },
    swingarm: { type: 'box', length: 0.573, angleDeg: 8, color: '#1d1e21', metal: 0.4, rough: 0.45 },
    shock: { layout: 'mono', springColor: '#2b4fa8', bodyColor: '#2a2c30', reservoir: false },
    drive: { type: 'chain', side: 'left', frontTeeth: 14, rearTeeth: 43, pitch: 0.015875, sprocketColor: '#1e1f22' },
    engine: {
      layout: 'P2_180',
      cc: 321,
      crank: [0, 0.38, -0.79],
      tiltDeg: 28,
      caseColor: '#1e1f22',
      coverColor: '#2c2e33',
      headColor: '#25272b',
      camCoverColor: '#18191c',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.32, h: 0.26, z: -1.17, y: 0.56, tiltDeg: 14, curved: false },
      width: 0.3,
    },
    exhaust: { route: 'sideCan', side: 'right', can: 'oval', canLength: 0.3, canDia: 0.11, canFinish: 'black', headerFinish: 'steel', outlet: [0.16, 0.46, -0.17] },
    cockpit: {
      bars: 'clipon',
      grip: [0.33, 0.93, -0.93],
      barDia: 0.022,
      dash: 'lcd',
      dashPos: [0, 1.0, -1.085],
      dashSize: [0.118, 0.066],
      dashTiltDeg: 44,
      dashMount: 'fairing',
      mirrors: 'fairing',
      mirrorPos: [0.32, 0.98, -1.18],
      mirrorSize: [0.13, 0.06],
      mirrorIndicators: false,
      mirrorColor: '#0d0e10',
      mirrorShape: 'sport',
      topClamp: 'cast',
      steeringDamper: 'none',
      leverColor: '#1e1f22',
      reservoirs: false,
      clutch: 'cable',
      ignition: 'clamp',
      switchColor: '#151618',
      gripColor: '#121212',
      barEndColor: '#1d1e21',
    },
    lights: { head: 'r1', tail: 'r1', rearIndicators: 'stalk' },
    seat: { height: 0.78, front: -0.62, back: -0.27, pillion: 'seat', color: '#151515' },
    rider: { hip: [0, 0.86, -0.43], peg: [0.18, 0.4, -0.42], torsoPitch: 0.62 },
    footrests: 'rearset',
    plate: { mount: 'hanger', pos: [0, 0.58, 0.37], tiltDeg: -14 },
    body,
    livery,
    groundClearance: 0.16,
    features: [],
    zones: { splitY: 0.45, decal: [-0.93, 0.57] },
  };
}
