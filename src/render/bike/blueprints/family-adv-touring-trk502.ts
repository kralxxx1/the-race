import type { BikeSpec, Livery } from '../../../data/bikes';
import { T, type KitContext } from '../context';
import { buildSeat, buildTank, frontFender, PAINT, screen, seatFinish } from '../kit/body';
import { hugger, plateHanger } from '../kit/rear';
import { curve, stationsBetween, type OutlineBody } from '../kit/shape';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv, type Pen } from '../livery';
import { roundBox, rod, smooth2, type P2 } from '../mesh';
import { F, hard, tint } from '../sink';
import type { BikeBlueprint } from '../types';
import {
  arcBand,
  bladeIndicator,
  frontLamp,
  grille,
  handGuards,
  loftPart,
  luggageCase,
  ovalTubeAlong,
  panelPair,
  rearLamp,
  skidPlate,
  SOFT,
  strip,
  tubeAlong,
} from './family-adv-touring-parts';

/**
 * Benelli TRK 502 X (2018–2024).
 * Spec sheet: wheelbase 1450 mm, rake 27°, trail ≈ 105 mm, seat 835 mm, L×W×H ≈ 2200 × 900 × 1400 mm,
 * 110/80R19 + 150/70R17 on spoked wheels, 41 mm USD fork, twin 320 mm front discs, steel trellis frame,
 * 500 cc parallel twin (360° crank), side silencer on the right.
 * Design cues: a "mini-GS" beak over a big trapezoid LED headlamp with an inverted-U DRL, tall
 * adjustable screen, 20 L tank with large plastic shrouds, high beak fender, hand guards, crash bars
 * and a pair of black hard panniers on tubular racks.
 */

const BLACK_PL = F.texturedBlack;

function beak(): OutlineBody {
  // Pointed beak: a short nose cone whose tip overhangs the headlamp below it.
  return {
    zs: stationsBetween(-1.52, -1.1, 11, 0.4),
    top: curve([[-1.52, 0.975], [-1.47, 1.035], [-1.4, 1.08], [-1.3, 1.115], [-1.1, 1.145]]),
    bottom: curve([[-1.52, 0.95], [-1.46, 0.96], [-1.38, 0.945], [-1.28, 0.915], [-1.1, 0.9]]),
    half: curve([[-1.52, 0.03], [-1.47, 0.1], [-1.4, 0.16], [-1.3, 0.195], [-1.1, 0.205]]),
    sections: [{ z: 0, pts: [[0, 1], [0.12, 0.98], [0.55, 0.88], [0.88, 0.7], [1, 0.42], [0.95, 0.14], [0.85, 0]] }],
  };
}

function face(ctx: KitContext): void {
  loftPart(ctx, beak(), PAINT, { depth: 0.01, q: 1.6, creases: [1], capFront: true });
  // Large trapezoid headlamp tucked under the beak, in a black surround.
  const mask: OutlineBody = {
    zs: stationsBetween(-1.4, -1.2, 5, 0.4),
    top: curve([[-1.4, 0.96], [-1.2, 0.96]]),
    bottom: curve([[-1.4, 0.84], [-1.2, 0.82]]),
    half: curve([[-1.4, 0.15], [-1.2, 0.2]]),
    sections: [{ z: 0, pts: [[0, 1], [0.7, 0.99], [0.96, 0.9], [1, 0.55], [0.95, 0.15], [0.8, 0], [0, 0]] }],
  };
  loftPart(ctx, mask, BLACK_PL, { depth: 0.008, q: 1, group: 'steer' });
  const lampOutline: P2[] = smooth2([[-0.12, -0.05], [0.12, -0.05], [0.145, 0.05], [-0.145, 0.05]], 3, true);
  frontLamp(ctx, 'steer', lampOutline, [0, 0.9, -1.4], { kind: 'head', inner: 'reflector', depth: 0.06, rim: 0.007, housing: F.black }, 0.14);
  // Inverted-U DRL over the lamp.
  strip(ctx, 'steer', [[-0.15, 0.85, -1.405], [-0.16, 0.9, -1.4], [-0.14, 0.96, -1.4], [0, 0.968, -1.425], [0.14, 0.96, -1.4], [0.16, 0.9, -1.4], [0.15, 0.85, -1.405]], 0.008, 0.005, 'drl', [0, 0, -1]);
  for (const s of [-1, 1]) bladeIndicator(ctx, 'steer', [s * 0.19, 0.9, -1.33], [s * 0.215, 0.91, -1.35], 0.009);
  // Beak badge.
  ctx.add('steer', roundBox(0.05, 0.022, 0.006, 0.004), F.chrome, T(0, 1.04, -1.49));
  // Adjustable screen on its stays.
  screen(ctx, 'steer', {
    zs: stationsBetween(-1.26, -1.06, 7, 0.3),
    top: curve([[-1.26, 1.13], [-1.21, 1.22], [-1.15, 1.3], [-1.1, 1.345], [-1.06, 1.36]]),
    bottom: curve([[-1.26, 1.12], [-1.06, 1.14]]),
    half: curve([[-1.26, 0.15], [-1.18, 0.185], [-1.06, 0.17]]),
    sections: [{ z: 0, pts: [[0, 1], [0.5, 0.985], [0.85, 0.93], [1, 0.75], [1, 0.4], [1, 0]] }],
  }, tint(F.screen, '#5b6670'));
  for (const s of [-1, 1]) ctx.add('steer', rod([s * 0.1, 1.12, -1.22], [s * 0.125, 1.24, -1.12], 0.006, 0.006, 8), F.darkAlu);
}

function tankAndShrouds(ctx: KitContext): void {
  buildTank(ctx, {
    front: -1.12,
    back: -0.72,
    top: 1.08,
    bottomFront: 0.9,
    bottomBack: 0.86,
    width: 0.34,
    style: 'adventure',
    knee: 0.12,
    capZ: -0.95,
    topLine: [[-1.12, 1.05], [-1.04, 1.075], [-0.92, 1.085], [-0.82, 1.065], [-0.75, 1.02], [-0.72, 0.97]],
    bottomLine: [[-1.12, 0.91], [-0.94, 0.88], [-0.72, 0.86]],
    halfLine: [[-1.12, 0.11], [-1.0, 0.16], [-0.9, 0.175], [-0.8, 0.155], [-0.72, 0.11]],
  });
  // Large tank shrouds covering the radiator and wrapping the tank sides.
  const shroud: OutlineBody = {
    zs: stationsBetween(-1.3, -0.78, 11, 0.4),
    top: curve([[-1.3, 0.93], [-1.2, 1.03], [-1.02, 1.07], [-0.88, 1.05], [-0.78, 0.97]]),
    bottom: curve([[-1.3, 0.8], [-1.2, 0.72], [-1.0, 0.68], [-0.86, 0.73], [-0.78, 0.79]]),
    half: curve([[-1.3, 0.16], [-1.2, 0.215], [-1.0, 0.24], [-0.86, 0.225], [-0.78, 0.19]]),
    sections: [{ z: 0, pts: [[0.6, 1], [0.84, 0.95], [0.97, 0.8], [1, 0.52], [0.97, 0.24], [0.9, 0]] }],
  };
  panelPair(ctx, shroud, PAINT, { creases: [2], depth: 0.012 });
  grille(ctx, -1.2, 0.62, 0.8, 0.14, 5, 8, F.texturedBlack);
}

function seatAndTail(ctx: KitContext): void {
  buildSeat(ctx, { front: -0.84, back: -0.36, yFront: 0.865, y: 0.84, yBack: 0.86, width: 0.3, thick: 0.08, frontWidth: 0.2 });
  buildSeat(ctx, { front: -0.35, back: 0.1, yFront: 0.86, y: 0.885, yBack: 0.9, width: 0.27, thick: 0.07, frontWidth: 0.25 }, tint(seatFinish(ctx), '#1a1a1c'));
  const tail: OutlineBody = {
    zs: stationsBetween(-0.56, 0.3, 10, 0.45),
    top: curve([[-0.56, 0.82], [-0.35, 0.84], [-0.1, 0.855], [0.12, 0.9], [0.3, 0.945]]),
    bottom: curve([[-0.56, 0.68], [-0.35, 0.67], [-0.1, 0.7], [0.12, 0.76], [0.3, 0.84]]),
    half: curve([[-0.56, 0.15], [-0.35, 0.15], [-0.1, 0.135], [0.12, 0.105], [0.3, 0.065]]),
    sections: [{ z: 0, pts: SOFT }],
  };
  loftPart(ctx, tail, PAINT, { depth: 0.01, q: 1.1, capBack: true });
  // Grab rails + rack plate.
  ctx.add('chassis', roundBox(0.22, 0.012, 0.22, 0.008, 2), F.darkAlu, T(0, 0.96, 0.1));
  for (const s of [-1, 1]) ovalTubeAlong(ctx, 'chassis', [[s * 0.1, 0.925, -0.3], [s * 0.135, 0.955, -0.2], [s * 0.145, 0.965, 0.0], [s * 0.12, 0.955, 0.2]], 0.009, 0.007, F.darkAlu);
  const tl: P2[] = smooth2([[-0.055, -0.016], [0.055, -0.016], [0.062, 0.015], [-0.062, 0.015]], 3, true);
  rearLamp(ctx, 'chassis', tl, [0, 0.915, 0.305], { kind: 'tail', inner: 'led', count: 3, depth: 0.026, lensSmoked: true }, -0.14);
  plateHanger(ctx, { fromZ: 0.02, fromY: 0.76 });
  hugger(ctx, F.texturedBlack, -0.15, 0.95);
}

function luggage(ctx: KitContext): void {
  // Black hard panniers on tubular side racks.
  for (const s of [-1, 1] as const) {
    luggageCase(ctx, {
      front: -0.12,
      back: 0.34,
      x: 0.29,
      half: 0.095,
      top: [[-0.12, 0.86], [-0.04, 0.9], [0.14, 0.91], [0.3, 0.9], [0.34, 0.87]],
      bottom: [[-0.12, 0.62], [-0.04, 0.57], [0.14, 0.56], [0.3, 0.58], [0.34, 0.63]],
      plan: [[-0.12, 0.7], [-0.04, 0.98], [0.14, 1], [0.3, 0.95], [0.34, 0.78]],
      f: BLACK_PL,
      trim: F.darkAlu,
      seam: 0.14,
      latches: 2,
      section: [[0, 1], [0.7, 0.99], [0.96, 0.93], [1, 0.62], [0.97, 0.18], [0.86, 0.02], [0, 0]],
    }, s);
    tubeAlong(ctx, 'chassis', [[s * 0.1, 0.88, -0.12], [s * 0.19, 0.84, -0.06], [s * 0.19, 0.64, -0.04], [s * 0.19, 0.64, 0.3], [s * 0.14, 0.76, 0.36]], 0.009, F.darkAlu);
  }
}

function protection(ctx: KitContext): void {
  handGuards(ctx, { color: F.texturedBlack, outer: 0.05, h: 0.085 });
  skidPlate(ctx, [[-1.04, 0.28], [-0.9, 0.245], [-0.62, 0.245], [-0.46, 0.27], [-0.5, 0.31], [-0.68, 0.3], [-0.9, 0.3], [-1.02, 0.33]], 0.12, F.darkAlu);
  const bar = hard('#26282c', 0.6, 0.4, 0.4);
  for (const s of [-1, 1]) tubeAlong(ctx, 'chassis', [[s * 0.15, 0.78, -1.0], [s * 0.3, 0.62, -0.96], [s * 0.35, 0.46, -0.9], [s * 0.29, 0.34, -0.82], [s * 0.17, 0.3, -0.76]], 0.0115, bar);
}

function body(ctx: KitContext): void {
  face(ctx);
  frontFender(ctx, { from: -1.0, to: 0.5, gap: 0.05, width: 0.12, f: PAINT });
  tankAndShrouds(ctx);
  seatAndTail(ctx);
  luggage(ctx);
  protection(ctx);
}

// ───────────────────────────── livery ─────────────────────────────

const GREEN = '#2e7d32';
const RED = '#b0121a';

function lettering(p: Pen, color: string): void {
  if (p.view !== 'right' && p.view !== 'left') return;
  p.text('BENELLI', -1.04, 0.93, { color, size: 0.036, weight: '900', spacing: 0.06 });
  p.text('TRK 502 X', -0.52, 0.76, { color, size: 0.022, weight: '800', spacing: 0.08 });
}

function livery(c: LiveryCanvas, _lv: Livery, env: LiveryEnv): void {
  const grey = env.index === 0;
  const accent = grey ? GREEN : RED;
  c.views(ALL_VIEWS, (p) => {
    p.fill(grey ? '#5a5e63' : '#f1f2f3', grey ? 'metallic' : 'pearl');
    if (p.view === 'right' || p.view === 'left') {
      // Dark lower panels, accent flash through the tank shroud, black fender tip.
      p.poly([[-1.3, 0.8], [-1.2, 0.72], [-1.0, 0.68], [-0.86, 0.73], [-0.78, 0.79], [-0.78, 0.83], [-0.9, 0.77], [-1.0, 0.74], [-1.2, 0.78], [-1.3, 0.86]], '#1b1c1f', 'satin');
      p.poly([[-1.28, 0.95], [-1.1, 1.04], [-0.9, 1.05], [-0.78, 0.96], [-0.78, 0.99], [-0.9, 1.07], [-1.1, 1.06], [-1.28, 0.99]], accent, 'gloss');
      p.line([[-0.56, 0.84], [-0.1, 0.87], [0.3, 0.93]], accent, 0.01);
      p.poly(arcBand(-1.45, 0.329, 0.33, 0.43, -1.0, -0.1), '#1b1c1f', 'satin');
      lettering(p, grey ? '#e8e9ea' : '#1b1c1f');
    } else if (p.view === 'top') {
      p.rect(-1.12, -0.012, -0.72, 0.012, accent);
    }
  });
}

export function trk502xBlueprint(spec: BikeSpec): BikeBlueprint {
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.2, 0.9, 1.4],
    wheelbase: 1.45,
    rakeDeg: 27,
    trail: 0.105,
    forkLength: 0.72,
    front: { tyre: '110/80R19', rimWidthIn: 2.5, crown: 1.1, tread: 'dual', tyreLabel: 'Trail Radial' },
    rear: { tyre: '150/70R17', rimWidthIn: 4.0, crown: 1.1, tread: 'dual', tyreLabel: 'Trail Radial' },
    frontWheel: { type: 'wire', spokes: 36, shape: 'straight', color: '#c9ccd2', rimColor: '#2a2c30' },
    rearWheel: { type: 'wire', spokes: 36, shape: 'straight', color: '#c9ccd2', rimColor: '#2a2c30' },
    fork: { type: 'usd', stanchion: 0.041, spacing: 0.19, outerColor: '#26282c', innerColor: '#c9ccd2', footColor: '#26282c', capColor: '#26282c', aboveClamp: 0.01, clampGap: 0.18 },
    frontBrake: { discs: 2, discDia: 0.32, disc: 'floating', carrierColor: '#2a2c30', caliper: 'radial4', caliperColor: '#2a2c30', caliperAngleDeg: 70 },
    rearBrake: { discs: 1, discDia: 0.26, disc: 'fixed', carrierColor: '#2a2c30', caliper: 'axial1', caliperColor: '#2a2c30', caliperAngleDeg: 205 },
    frame: { type: 'trellis', color: '#1b1c1f', metal: 0.4, rough: 0.5, subframe: 'trellis', subframeColor: '#1b1c1f', width: 0.3 },
    swingarm: { type: 'box', length: 0.56, angleDeg: 6, color: '#2a2c30', metal: 0.6, rough: 0.5 },
    shock: { layout: 'mono', springColor: '#c8102e', bodyColor: '#2a2c30', reservoir: false },
    drive: { type: 'chain', side: 'left', frontTeeth: 15, rearTeeth: 44, pitch: 0.015875, sprocketColor: '#2a2c30' },
    engine: {
      layout: 'P2_360',
      cc: 500,
      crank: [0, 0.38, -0.8],
      tiltDeg: 20,
      caseColor: '#2e3035',
      coverColor: '#9aa0a7',
      headColor: '#2c2e33',
      camCoverColor: '#1d1e21',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.26, h: 0.24, z: -1.16, y: 0.72, tiltDeg: 8 },
      width: 0.3,
    },
    exhaust: { route: 'sideCan', side: 'right', can: 'oval', canLength: 0.4, canDia: 0.115, canFinish: 'steel', headerFinish: 'steel', outlet: [0.2, 0.46, 0.1] },
    cockpit: {
      bars: 'tubular',
      grip: [0.38, 1.12, -0.93],
      barDia: 0.0254,
      dash: 'lcd',
      dashPos: [0, 1.13, -1.06],
      dashSize: [0.15, 0.09],
      dashTiltDeg: 36,
      dashMount: 'bars',
      mirrors: 'bar',
      mirrorPos: [0.34, 1.26, -0.93],
      mirrorSize: [0.12, 0.08],
      mirrorIndicators: false,
      mirrorShape: 'oval',
      mirrorColor: '#1b1c1f',
      topClamp: 'riser',
      steeringDamper: 'none',
      leverColor: '#9aa0a7',
      reservoirs: true,
      clutch: 'cable',
      ignition: 'clamp',
      switchColor: '#151618',
      gripColor: '#141414',
      barEndColor: '#2a2c30',
    },
    lights: { head: 'beak', tail: 'compact', rearIndicators: 'stalk' },
    seat: { height: 0.835, front: -0.84, back: -0.36, pillion: 'seat', color: '#141414' },
    rider: { hip: [0, 0.93, -0.56], peg: [0.22, 0.39, -0.6], torsoPitch: 0.18 },
    footrests: 'peg',
    plate: { mount: 'hanger', pos: [0, 0.58, 0.32], tiltDeg: -14 },
    body,
    livery,
    groundClearance: 0.19,
    features: ['crashbars', 'windscreenTall', 'panniers'],
    zones: { splitY: 0.6, decal: [-1.04, 0.93] },
  };
}
