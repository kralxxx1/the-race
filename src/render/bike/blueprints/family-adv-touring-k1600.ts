import type { BikeSpec, Livery } from '../../../data/bikes';
import { T, type KitContext } from '../context';
import { buildSeat, frontFender, PAINT, screen, seatFinish } from '../kit/body';
import { hugger, plateHanger } from '../kit/rear';
import { curve, stationsBetween, type OutlineBody } from '../kit/shape';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv, type Pen } from '../livery';
import { extrude, roundBox, rod, smooth2, type P2 } from '../mesh';
import { F, hard, tint } from '../sink';
import { fAnd, fNot, fOr, frontRegion, planRegion } from '../surface';
import type { BikeBlueprint } from '../types';
import {
  arcBand,
  bladeIndicator,
  frontLamp,
  grille,
  loftPart,
  luggageCase,
  panelPair,
  rearLamp,
  SOFT,
  strip,
  tubeAlong,
} from './family-adv-touring-parts';

/**
 * BMW K 1600 GT (2017–2024).
 * Spec sheet: wheelbase 1618 mm, steering head ≈ 62° (rake 28°), trail 109 mm, seat 780/810 mm,
 * L×W×H ≈ 2300 × 990 × 1430 mm, 120/70 ZR17 + 190/55 ZR17 on cast wheels, Duolever front (two
 * A-arms + central shock), EVO Paralever single-sided swingarm with shaft drive on the right, twin
 * 320 mm discs, 1649 cc transverse inline-six leaning forward 55° with its cylinder block and
 * cam cover left exposed under the fairing, side silencer on the right below the pannier.
 * Design cues: big wind-cheating fairing with two angular LED eyes and a DRL brow, tall electric
 * screen, integrated body-colour panniers with LED tail lamps, wide stepped touring seat.
 */

const BLACK_PL = F.texturedBlack;
const SAT_BLACK = F.satinBlack;

function nose(): OutlineBody {
  return {
    zs: stationsBetween(-1.8, -1.08, 14, 0.4),
    top: curve([[-1.8, 0.86], [-1.76, 0.94], [-1.66, 1.005], [-1.5, 1.045], [-1.32, 1.07], [-1.18, 1.075], [-1.08, 1.06]]),
    bottom: curve([[-1.8, 0.8], [-1.75, 0.71], [-1.62, 0.63], [-1.45, 0.58], [-1.28, 0.57], [-1.14, 0.6], [-1.08, 0.66]]),
    half: curve([[-1.8, 0.05], [-1.76, 0.16], [-1.66, 0.25], [-1.5, 0.3], [-1.34, 0.32], [-1.2, 0.31], [-1.08, 0.27]]),
    sections: [{ z: 0, pts: [[0, 1], [0.38, 0.99], [0.78, 0.95], [0.94, 0.86], [1, 0.62], [0.98, 0.34], [0.92, 0.1], [0.8, 0]] }],
  };
}

function fairing(ctx: KitContext): void {
  // Painted fairing: two slim slanted eye windows cut into the nose, plus the cockpit opening.
  const eye = frontRegion([[0.06, 0.855], [0.285, 0.895], [0.295, 0.99], [0.06, 0.96]]);
  const opening = planRegion([[-1.38, 0], [-1.38, 0.17], [-1.22, 0.2], [-1.1, 0.18], [-1.1, 0]]);
  const lampCut = fAnd(eye, (_x, _y, z) => -1.64 - z);
  const cockpitCut = fAnd(opening, (_x, y) => y - 0.99);
  loftPart(ctx, nose(), PAINT, { capFront: true, depth: 0.012, q: 1.7, creases: [3], region: fNot(fOr(lampCut, cockpitCut)) });
  ctx.add('chassis', roundBox(0.4, 0.012, 0.3, 0.01, 2), F.texturedBlack, T(0, 0.985, -1.25));
  // Angular LED eyes: slim wedges, outer corner high, DRL brow above them joined over the centre.
  for (const s of [-1, 1]) {
    const lampOutline: P2[] = smooth2([[s * 0.065, -0.05], [s * 0.275, -0.03], [s * 0.288, 0.045], [s * 0.065, 0.034]], 2, true);
    frontLamp(ctx, 'chassis', lampOutline, [0, 0.91, -1.7], { kind: 'head', inner: 'projector', count: 3, depth: 0.05, rim: 0.005, housing: F.black }, 0.2);
    strip(ctx, 'chassis', [[s * 0.05, 1.0, -1.7], [s * 0.15, 0.998, -1.69], [s * 0.28, 0.99, -1.66]], 0.012, 0.005, 'drl', [0, 0, -1]);
    bladeIndicator(ctx, 'chassis', [s * 0.3, 0.8, -1.7], [s * 0.325, 0.815, -1.7], 0.009);
  }
  // Black lower air intake under the nose (the radiator breathes through it).
  grille(ctx, -1.7, 0.66, 0.78, 0.17, 5, 10, F.texturedBlack);
  // Tall electrically adjustable screen on black stays.
  screen(ctx, 'chassis', {
    zs: stationsBetween(-1.5, -1.2, 9, 0.3),
    top: curve([[-1.5, 1.07], [-1.44, 1.18], [-1.36, 1.3], [-1.28, 1.385], [-1.2, 1.43]]),
    bottom: curve([[-1.5, 1.06], [-1.2, 1.08]]),
    half: curve([[-1.5, 0.22], [-1.4, 0.275], [-1.3, 0.29], [-1.2, 0.26]]),
    sections: [{ z: 0, pts: [[0, 1], [0.5, 0.985], [0.85, 0.93], [1, 0.75], [1, 0.4], [1, 0]] }],
  }, tint(F.screen, '#4e5a63'));
  for (const s of [-1, 1]) ctx.add('chassis', rod([s * 0.22, 1.08, -1.47], [s * 0.26, 1.22, -1.28], 0.007, 0.007, 8), F.darkAlu);
  // Fairing-side air vents, silver trim.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) ctx.add('chassis', roundBox(0.01, 0.012, 0.09, 0.003, 1), F.black, T(s * 0.318, 0.93 - i * 0.026, -1.33 + i * 0.008));
  }
}

function lowers(ctx: KitContext): void {
  // Lower cheeks beside the front wheel / radiator; the cylinder block stays exposed behind them.
  const cheek: OutlineBody = {
    zs: stationsBetween(-1.56, -0.98, 10, 0.4),
    top: curve([[-1.56, 0.66], [-1.4, 0.62], [-1.2, 0.6], [-0.98, 0.6]]),
    bottom: curve([[-1.56, 0.52], [-1.4, 0.4], [-1.2, 0.36], [-0.98, 0.4]]),
    half: curve([[-1.56, 0.17], [-1.42, 0.27], [-1.2, 0.3], [-0.98, 0.25]]),
    sections: [{ z: 0, pts: [[0.55, 1], [0.86, 0.96], [0.98, 0.8], [1, 0.52], [0.96, 0.24], [0.86, 0]] }],
  };
  panelPair(ctx, cheek, BLACK_PL, { creases: [2], depth: 0.012 });
  // Centre console / tank cover between the cockpit and the rider's seat.
  const console_: OutlineBody = {
    zs: stationsBetween(-1.16, -0.86, 8, 0.4),
    top: curve([[-1.16, 0.89], [-1.0, 0.875], [-0.86, 0.83]]),
    bottom: curve([[-1.16, 0.62], [-0.86, 0.62]]),
    half: curve([[-1.16, 0.19], [-1.0, 0.18], [-0.86, 0.16]]),
    sections: [{ z: 0, pts: [[0, 1], [0.55, 0.985], [0.9, 0.9], [1, 0.62], [0.95, 0.25], [0.8, 0.0]] }],
  };
  loftPart(ctx, console_, PAINT, { depth: 0.01, capBack: true });
  // Aluminium bash plate under the straight-six.
  const plate: P2[] = [[-1.3, 0.3], [-1.0, 0.22], [-0.7, 0.22], [-0.55, 0.28], [-0.62, 0.32], [-0.9, 0.31], [-1.2, 0.34]];
  ctx.add('chassis', extrude(smooth2(plate, 3, true), 0.24, { plane: 'zy', bevel: 0.005, curveSegs: 1, center: 0 }), F.darkAlu);
}

function frontEnd(ctx: KitContext): void {
  frontFender(ctx, { from: -1.2, to: 0.95, gap: 0.03, width: 0.15, f: PAINT });
  // Duolever: two wishbones carrying the wheel, one central shock to the frame.
  const A = ctx.hp.frontAxle;
  const arm = hard('#2a2c30', 0.7, 0.4, 0.4);
  for (const s of [-1, 1]) {
    tubeAlong(ctx, 'chassis', [[s * 0.1, A[1] + 0.06, A[2] + 0.14], [s * 0.12, A[1] + 0.1, A[2] + 0.4], [s * 0.15, 0.56, -1.2]], 0.013, arm);
  }
  ctx.add('chassis', rod([0, 0.64, -1.45], [0, 0.88, -1.36], 0.02, 0.02, 12), hard('#c9ccd2', 1, 0.2));
}

function seatsAndRear(ctx: KitContext): void {
  buildSeat(ctx, { front: -0.92, back: -0.46, yFront: 0.805, y: 0.78, yBack: 0.81, width: 0.34, thick: 0.095, frontWidth: 0.2 });
  buildSeat(ctx, { front: -0.45, back: 0.06, yFront: 0.81, y: 0.84, yBack: 0.87, width: 0.32, thick: 0.08, frontWidth: 0.3 }, tint(seatFinish(ctx), '#1a1a1c'));
  // Tail centre unit between the panniers: body colour, rising to the LED bar.
  const tail: OutlineBody = {
    zs: stationsBetween(-0.5, 0.5, 12, 0.45),
    top: curve([[-0.5, 0.8], [-0.2, 0.815], [0.1, 0.87], [0.34, 0.94], [0.5, 0.95]]),
    bottom: curve([[-0.5, 0.62], [-0.2, 0.62], [0.1, 0.68], [0.34, 0.76], [0.5, 0.8]]),
    half: curve([[-0.5, 0.17], [-0.2, 0.17], [0.1, 0.16], [0.34, 0.14], [0.5, 0.11]]),
    sections: [{ z: 0, pts: SOFT }],
  };
  loftPart(ctx, tail, PAINT, { depth: 0.01, q: 1.2, capBack: true });
  // Integral panniers: wide, flowing into the tail, with LED tail strips in their rear ends.
  for (const s of [-1, 1] as const) {
    luggageCase(ctx, {
      front: -0.48,
      back: 0.52,
      x: 0.31,
      half: 0.135,
      top: [[-0.48, 0.74], [-0.38, 0.8], [-0.1, 0.835], [0.3, 0.87], [0.48, 0.9], [0.52, 0.86]],
      bottom: [[-0.48, 0.58], [-0.38, 0.5], [-0.1, 0.46], [0.3, 0.47], [0.48, 0.55], [0.52, 0.66]],
      plan: [[-0.48, 0.55], [-0.36, 0.92], [0.0, 1], [0.42, 0.96], [0.52, 0.6]],
      f: PAINT,
      trim: SAT_BLACK,
      seam: 0.2,
      latches: 0,
    }, s);
    strip(ctx, 'chassis', [[s * 0.4, 0.84, 0.52], [s * 0.34, 0.86, 0.535], [s * 0.26, 0.85, 0.525]], 0.014, 0.006, 'tail', [0, 1, 0]);
  }
  const tl: P2[] = smooth2([[-0.1, -0.012], [0.1, -0.012], [0.11, 0.012], [-0.11, 0.012]], 3, true);
  rearLamp(ctx, 'chassis', tl, [0, 0.9, 0.505], { kind: 'tail', inner: 'led', count: 3, depth: 0.02, lensSmoked: true }, -0.12);
  plateHanger(ctx, { fromZ: 0.2, fromY: 0.74 });
  hugger(ctx, F.texturedBlack, -0.15, 0.9);
}

function body(ctx: KitContext): void {
  fairing(ctx);
  lowers(ctx);
  frontEnd(ctx);
  seatsAndRear(ctx);
}

// ───────────────────────────── livery ─────────────────────────────

function lettering(p: Pen, color: string): void {
  if (p.view !== 'right' && p.view !== 'left') return;
  p.text('K 1600 GT', -0.12, 0.7, { color, size: 0.036, weight: '800', spacing: 0.08 });
  p.text('BMW', -1.45, 0.86, { color, size: 0.036, weight: '900', spacing: 0.1 });
}

function livery(c: LiveryCanvas, _lv: Livery, env: LiveryEnv): void {
  const blue = env.index === 0;
  const main = blue ? '#1f3f7a' : '#16171a';
  c.views(ALL_VIEWS, (p) => {
    p.fill(main, blue ? 'metallic' : 'gloss');
    if (p.view === 'right' || p.view === 'left') {
      // Black lower fairing and pannier base, silver pin-stripe through the fairing flank.
      p.poly([[-1.66, 0.6], [-1.4, 0.52], [-1.1, 0.5], [-0.98, 0.58], [-0.98, 0.64], [-1.3, 0.66], [-1.6, 0.72]], '#16171a', 'satin');
      p.poly([[-0.48, 0.46], [0.52, 0.46], [0.52, 0.62], [-0.48, 0.56]], blue ? '#101a2e' : '#0e0f11', 'satin');
      p.line([[-1.78, 0.84], [-1.5, 0.9], [-1.2, 0.98], [-1.08, 0.96]], '#c4c7cc', 0.005, 'chrome');
      p.line([[-0.48, 0.72], [-0.1, 0.8], [0.52, 0.84]], '#c4c7cc', 0.005, 'chrome');
      p.poly(arcBand(-1.618, 0.3, 0.31, 0.37, -0.5, 1.9), main, 'gloss');
      lettering(p, '#d9dce1');
    } else if (p.view === 'front') {
      p.rect(-0.4, 0.5, 0.4, 0.84, '#16171a', 'satin');
    }
  });
}

export function k1600gtBlueprint(spec: BikeSpec): BikeBlueprint {
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.3, 0.99, 1.43],
    wheelbase: 1.618,
    rakeDeg: 28,
    trail: 0.109,
    forkLength: 0.78,
    front: { tyre: '120/70ZR17', rimWidthIn: 3.5, crown: 1.1, tread: 'touring', tyreLabel: 'Sport Touring' },
    rear: { tyre: '190/55ZR17', rimWidthIn: 6.0, crown: 1.1, tread: 'touring', tyreLabel: 'Sport Touring' },
    frontWheel: { type: 'cast', spokes: 5, shape: 'split', color: '#1b1c1f', machinedLip: true },
    rearWheel: { type: 'cast', spokes: 5, shape: 'split', color: '#1b1c1f', machinedLip: true },
    fork: { type: 'telelever', stanchion: 0.04, spacing: 0.21, outerColor: '#2a2c30', innerColor: '#c9ccd2', footColor: '#2a2c30', capColor: '#2a2c30', aboveClamp: 0.0, clampGap: 0.2 },
    frontBrake: { discs: 2, discDia: 0.32, disc: 'floating', carrierColor: '#2a2c30', caliper: 'radial4', caliperColor: '#2a2c30', caliperText: 'BMW', caliperTextColor: '#d6d8dc', caliperAngleDeg: 76 },
    rearBrake: { discs: 1, discDia: 0.32, disc: 'fixed', carrierColor: '#2a2c30', caliper: 'axial2', caliperColor: '#2a2c30', caliperAngleDeg: 205 },
    frame: { type: 'twinSpar', color: '#3a3d42', metal: 0.7, rough: 0.42, subframe: 'tubular', subframeColor: '#2a2c30', width: 0.32 },
    swingarm: { type: 'shaft', length: 0.62, angleDeg: 6, side: 'right', color: '#9aa0a7', metal: 0.85, rough: 0.4 },
    shock: { layout: 'mono', springColor: '#2a2c30', bodyColor: '#2a2c30', reservoir: false },
    drive: { type: 'shaft', side: 'right', frontTeeth: 1, rearTeeth: 1, sprocketColor: '#2a2c30' },
    engine: {
      layout: 'I6',
      cc: 1649,
      crank: [0, 0.36, -0.96],
      tiltDeg: 55,
      caseColor: '#5d6168',
      coverColor: '#b0b4ba',
      headColor: '#4a4e55',
      camCoverColor: '#c4c7cc',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.26, h: 0.26, z: -1.38, y: 0.6, tiltDeg: 10 },
      width: 0.5,
    },
    exhaust: { route: 'sideCan', side: 'right', can: 'oval', canLength: 0.5, canDia: 0.12, canFinish: 'steel', headerFinish: 'steel', outlet: [0.2, 0.36, 0.3] },
    cockpit: {
      bars: 'tall',
      grip: [0.38, 1.1, -1.0],
      barDia: 0.0254,
      dash: 'tftBmw',
      dashPos: [0, 1.11, -1.2],
      dashSize: [0.17, 0.1],
      dashTiltDeg: 42,
      dashMount: 'fairing',
      mirrors: 'fairing',
      mirrorPos: [0.4, 1.1, -1.36],
      mirrorSize: [0.14, 0.09],
      mirrorIndicators: true,
      mirrorShape: 'rect',
      topClamp: 'riser',
      steeringDamper: 'none',
      leverColor: '#9aa0a7',
      reservoirs: true,
      clutch: 'hydraulic',
      ignition: 'keyless',
      switchColor: '#151618',
      gripColor: '#141414',
      barEndColor: '#9aa0a7',
    },
    lights: { head: 'touring', tail: 'bar', rearIndicators: 'integrated' },
    seat: { height: 0.78, front: -0.92, back: -0.46, pillion: 'seat', color: '#141414' },
    rider: { hip: [0, 0.88, -0.64], peg: [0.3, 0.34, -0.74], torsoPitch: 0.02 },
    footrests: 'peg',
    plate: { mount: 'body', pos: [0, 0.68, 0.53], tiltDeg: -4 },
    body,
    livery,
    groundClearance: 0.14,
    features: ['panniers'],
    zones: { splitY: 0.5, decal: [-1.3, 0.8] },
  };
}
