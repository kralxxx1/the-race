import type { BikeSpec, Livery } from '../../../data/bikes';
import { T, type KitContext } from '../context';
import { buildSeat, buildTank, frontFender, PAINT, screen, seatFinish } from '../kit/body';
import { hugger, plateHanger } from '../kit/rear';
import { curve, stationsBetween, type OutlineBody } from '../kit/shape';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv, type Pen } from '../livery';
import { extrude, roundBox, rod, smooth2, type P2 } from '../mesh';
import { F, hard, tint } from '../sink';
import { fAnd, fNot, frontRegion } from '../surface';
import type { BikeBlueprint } from '../types';
import {
  arcBand,
  bladeIndicator,
  frontLamp,
  grille,
  handGuards,
  loftPart,
  ovalTubeAlong,
  panelPair,
  rearLamp,
  skidPlate,
  SOFT,
  strip,
  tubeAlong,
} from './family-adv-touring-parts';

/**
 * Harley-Davidson Pan America 1250 Special (2021–2024).
 * Spec sheet: wheelbase 1580 mm, rake 25°, trail ≈ 105 mm, seat 850 mm (adaptive ride height),
 * L×W×H ≈ 2270 × 960 × 1500 mm, 120/70R19 + 170/60R17 on tubeless cross-spoke wheels, 47 mm
 * Showa semi-active USD fork, Brembo 320 mm twin discs, steel trellis frame with the 1252 cc
 * Revolution Max 60° V-twin as a stressed member, aluminium swingarm, side silencer on the right.
 * Design cues: very wide stance, a big rectangular LED headlamp under an angular brow with a
 * full-width LED light bar, tall manual screen, high beak fender, large angular tank wings,
 * knobbly dual-sport tyres, tall slab tail with a rack, hand guards and engine guards.
 */

const BLACK_PL = F.texturedBlack;

function brow(): OutlineBody {
  return {
    zs: stationsBetween(-1.52, -1.16, 10, 0.4),
    top: curve([[-1.52, 1.0], [-1.47, 1.065], [-1.4, 1.12], [-1.3, 1.165], [-1.16, 1.195]]),
    bottom: curve([[-1.52, 0.95], [-1.47, 0.9], [-1.4, 0.87], [-1.3, 0.85], [-1.16, 0.86]]),
    half: curve([[-1.52, 0.08], [-1.47, 0.16], [-1.4, 0.215], [-1.3, 0.24], [-1.16, 0.25]]),
    sections: [{ z: 0, pts: [[0, 1], [0.4, 0.99], [0.8, 0.95], [0.97, 0.8], [1, 0.5], [0.95, 0.15], [0.85, 0]] }],
  };
}

function face(ctx: KitContext): void {
  // The brow with a wide rectangular window for the headlamp.
  const window = frontRegion([[0.0, 0.925], [0.165, 0.925], [0.18, 0.945], [0.18, 1.03], [0.165, 1.05], [0.0, 1.05]]);
  loftPart(ctx, brow(), PAINT, { depth: 0.01, q: 1.7, creases: [2], region: fNot(fAnd(window, (_x, _y, z) => -1.42 - z)) });
  const lampOutline: P2[] = smooth2([[-0.172, -0.058], [0.172, -0.058], [0.182, -0.04], [0.182, 0.04], [0.172, 0.058], [-0.172, 0.058], [-0.182, 0.04], [-0.182, -0.04]], 1, true);
  frontLamp(ctx, 'chassis', lampOutline, [0, 0.988, -1.445], { kind: 'head', inner: 'projector', count: 2, depth: 0.05, rim: 0.006, housing: F.black }, 0.28);
  // Full-width LED bar above the lamp, short vertical returns at both ends.
  strip(ctx, 'chassis', [[-0.18, 1.0, -1.43], [-0.18, 1.065, -1.425], [0, 1.072, -1.436], [0.18, 1.065, -1.425], [0.18, 1.0, -1.43]], 0.011, 0.005, 'drl', [0, 0, -1]);
  // Black lower mask / air intake under the lamp.
  ctx.add('chassis', roundBox(0.3, 0.05, 0.03, 0.01), hard('#101113', 0.2, 0.6), T(0, 0.905, -1.43));
  for (const s of [-1, 1]) bladeIndicator(ctx, 'chassis', [s * 0.235, 0.96, -1.36], [s * 0.26, 0.965, -1.38], 0.009);
  // Tall manually adjustable screen on two stays, wide at the top.
  screen(ctx, 'chassis', {
    zs: stationsBetween(-1.3, -1.1, 8, 0.3),
    top: curve([[-1.3, 1.2], [-1.24, 1.3], [-1.17, 1.39], [-1.12, 1.44], [-1.1, 1.455]]),
    bottom: curve([[-1.3, 1.18], [-1.1, 1.2]]),
    half: curve([[-1.3, 0.18], [-1.2, 0.215], [-1.1, 0.2]]),
    sections: [{ z: 0, pts: [[0, 1], [0.5, 0.985], [0.85, 0.93], [1, 0.75], [1, 0.4], [1, 0]] }],
  }, tint(F.screen, '#56606a'));
  for (const s of [-1, 1]) ctx.add('chassis', rod([s * 0.12, 1.19, -1.27], [s * 0.15, 1.33, -1.15], 0.0075, 0.0075, 8), F.darkAlu);
}

function tankAndWings(ctx: KitContext): void {
  buildTank(ctx, {
    front: -1.16,
    back: -0.76,
    top: 1.115,
    bottomFront: 0.92,
    bottomBack: 0.9,
    width: 0.34,
    style: 'adventure',
    knee: 0.12,
    capZ: -0.98,
    topLine: [[-1.16, 1.09], [-1.06, 1.115], [-0.94, 1.115], [-0.84, 1.09], [-0.78, 1.04], [-0.76, 0.98]],
    bottomLine: [[-1.16, 0.93], [-0.96, 0.91], [-0.76, 0.9]],
    halfLine: [[-1.16, 0.11], [-1.06, 0.155], [-0.94, 0.17], [-0.84, 0.15], [-0.76, 0.11]],
  });
  // Big angular tank wings / radiator covers: wide stance, sharp shoulder.
  const wing: OutlineBody = {
    zs: stationsBetween(-1.4, -0.82, 11, 0.4),
    top: curve([[-1.4, 0.98], [-1.3, 1.08], [-1.1, 1.115], [-0.95, 1.09], [-0.82, 1.0]]),
    bottom: curve([[-1.4, 0.84], [-1.3, 0.72], [-1.1, 0.65], [-0.94, 0.7], [-0.82, 0.8]]),
    half: curve([[-1.4, 0.19], [-1.3, 0.25], [-1.1, 0.285], [-0.95, 0.265], [-0.82, 0.22]]),
    sections: [{ z: 0, pts: [[0.6, 1], [0.86, 0.95], [0.98, 0.8], [1, 0.52], [0.97, 0.24], [0.9, 0]] }],
  };
  panelPair(ctx, wing, PAINT, { creases: [2], depth: 0.012 });
  // Black radiator slats behind the wing's leading edge.
  grille(ctx, -1.27, 0.62, 0.84, 0.16, 6, 8, F.texturedBlack);
  for (const s of [-1, 1]) {
    const d: P2[] = smooth2([[-1.34, 0.78], [-1.14, 0.68], [-1.0, 0.65], [-0.96, 0.6], [-1.14, 0.57], [-1.32, 0.68]], 3, true);
    ctx.add('chassis', extrude(d, 0.012, { plane: 'zy', center: s * 0.285, bevel: 0.003, curveSegs: 1 }), BLACK_PL);
  }
}

function seatAndTail(ctx: KitContext): void {
  buildSeat(ctx, { front: -0.92, back: -0.44, yFront: 0.89, y: 0.86, yBack: 0.885, width: 0.32, thick: 0.085, frontWidth: 0.2 });
  buildSeat(ctx, { front: -0.43, back: 0.1, yFront: 0.9, y: 0.93, yBack: 0.95, width: 0.29, thick: 0.08, frontWidth: 0.27 }, tint(seatFinish(ctx), '#1a1a1c'));
  const tail: OutlineBody = {
    zs: stationsBetween(-0.62, 0.36, 11, 0.45),
    top: curve([[-0.62, 0.84], [-0.4, 0.86], [-0.1, 0.88], [0.14, 0.93], [0.36, 0.99]]),
    bottom: curve([[-0.62, 0.7], [-0.4, 0.69], [-0.1, 0.72], [0.14, 0.78], [0.36, 0.87]]),
    half: curve([[-0.62, 0.16], [-0.4, 0.16], [-0.1, 0.145], [0.14, 0.12], [0.36, 0.08]]),
    sections: [{ z: 0, pts: SOFT }],
  };
  loftPart(ctx, tail, F.texturedBlack, { depth: 0.01, q: 1.1, capBack: true });
  // Luggage rack with grab handles.
  ctx.add('chassis', roundBox(0.26, 0.014, 0.32, 0.01, 2), F.darkAlu, T(0, 1.01, 0.1));
  for (const s of [-1, 1]) {
    ovalTubeAlong(ctx, 'chassis', [[s * 0.115, 0.96, -0.32], [s * 0.15, 1.0, -0.26], [s * 0.155, 1.015, -0.1], [s * 0.155, 1.0, 0.14], [s * 0.115, 0.97, 0.28]], 0.009, 0.007, F.darkAlu);
  }
  const tl: P2[] = smooth2([[-0.065, -0.016], [0.065, -0.016], [0.07, 0.016], [-0.07, 0.016]], 3, true);
  rearLamp(ctx, 'chassis', tl, [0, 0.975, 0.365], { kind: 'tail', inner: 'led', count: 3, depth: 0.028, lensSmoked: true }, -0.14);
  plateHanger(ctx, { fromZ: 0.02, fromY: 0.78 });
  hugger(ctx, F.texturedBlack, -0.15, 0.95);
}

function protection(ctx: KitContext): void {
  handGuards(ctx, { color: F.texturedBlack, outer: 0.055, h: 0.09 });
  skidPlate(ctx, [[-1.2, 0.29], [-1.0, 0.255], [-0.7, 0.25], [-0.52, 0.28], [-0.55, 0.32], [-0.75, 0.31], [-1.0, 0.32], [-1.18, 0.36]], 0.15, F.darkAlu);
  const bar = hard('#1b1c1f', 0.6, 0.4, 0.4);
  for (const s of [-1, 1]) tubeAlong(ctx, 'chassis', [[s * 0.18, 0.82, -1.22], [s * 0.37, 0.66, -1.18], [s * 0.44, 0.5, -1.1], [s * 0.38, 0.36, -1.0], [s * 0.22, 0.3, -0.93]], 0.0125, bar);
}

function body(ctx: KitContext): void {
  face(ctx);
  frontFender(ctx, { from: -1.15, to: 0.5, gap: 0.06, width: 0.125, f: PAINT });
  tankAndWings(ctx);
  seatAndTail(ctx);
  protection(ctx);
}

// ───────────────────────────── livery ─────────────────────────────

const ORANGE = '#d65a14';

function lettering(p: Pen, color: string): void {
  if (p.view !== 'right' && p.view !== 'left') return;
  p.text('PAN AMERICA', -1.2, 0.86, { color, size: 0.03, weight: '900', spacing: 0.08 });
  p.text('1250 SPECIAL', -0.62, 0.76, { color, size: 0.016, weight: '800', spacing: 0.1 });
}

function livery(c: LiveryCanvas, _lv: Livery, env: LiveryEnv): void {
  const orange = env.index === 0;
  c.views(ALL_VIEWS, (p) => {
    p.fill(orange ? ORANGE : '#0f1012', orange ? 'gloss' : 'satin');
    if (p.view === 'right' || p.view === 'left') {
      if (orange) {
        // Black lower wing and black tail, as on the Baja Orange / Black scheme; orange flash on the wing.
        p.poly([[-1.4, 0.84], [-1.3, 0.72], [-1.1, 0.65], [-0.94, 0.7], [-0.82, 0.8], [-0.82, 0.86], [-0.94, 0.78], [-1.1, 0.74], [-1.3, 0.82], [-1.4, 0.92]], '#16171a', 'satin');
        p.poly([[-1.0, 1.0], [-0.84, 1.0], [-0.82, 1.06], [-0.9, 1.1], [-1.1, 1.11]], '#16171a', 'satin');
        p.poly(arcBand(-1.58, 0.325, 0.33, 0.45, -1.1, -0.05), '#16171a', 'satin');
      } else {
        p.poly([[-1.4, 0.88], [-1.1, 0.7], [-0.9, 0.72], [-0.82, 0.86], [-0.82, 0.9], [-0.9, 0.78], [-1.1, 0.76], [-1.4, 0.94]], '#2a2c30', 'metallic');
      }
      lettering(p, orange ? '#f3f3f1' : '#c4c7cc');
    } else if (p.view === 'top' && orange) {
      p.rect(-1.16, -0.05, -0.76, 0.05, '#16171a');
    }
  });
}

export function panAmericaBlueprint(spec: BikeSpec): BikeBlueprint {
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.27, 0.96, 1.5],
    wheelbase: 1.58,
    rakeDeg: 25,
    trail: 0.105,
    forkLength: 0.78,
    front: { tyre: '120/70R19', rimWidthIn: 3.0, crown: 1.1, tread: 'dual', tyreLabel: 'Trail Radial' },
    rear: { tyre: '170/60R17', rimWidthIn: 4.5, crown: 1.1, tread: 'dual', tyreLabel: 'Trail Radial' },
    frontWheel: { type: 'wire', spokes: 36, shape: 'straight', color: '#c9ccd2', crossSpoke: true, rimColor: '#16171a' },
    rearWheel: { type: 'wire', spokes: 36, shape: 'straight', color: '#c9ccd2', crossSpoke: true, rimColor: '#16171a' },
    fork: { type: 'usd', stanchion: 0.047, spacing: 0.215, outerColor: '#1b1c1f', innerColor: '#2a2c30', footColor: '#1b1c1f', capColor: '#1b1c1f', adjusterColor: '#d65a14', aboveClamp: 0.01, clampGap: 0.2, label: 'SHOWA', labelColor: '#d6d8dc' },
    frontBrake: { discs: 2, discDia: 0.32, disc: 'floating', carrierColor: '#1b1c1f', caliper: 'radial4', caliperColor: '#1b1c1f', caliperText: 'BREMBO', caliperTextColor: '#d6d8dc', caliperAngleDeg: 76 },
    rearBrake: { discs: 1, discDia: 0.28, disc: 'fixed', carrierColor: '#1b1c1f', caliper: 'axial2', caliperColor: '#1b1c1f', caliperAngleDeg: 205 },
    frame: { type: 'trellis', color: '#16171a', metal: 0.35, rough: 0.5, subframe: 'trellis', subframeColor: '#16171a', width: 0.34 },
    swingarm: { type: 'box', length: 0.62, angleDeg: 7, color: '#1b1c1f', metal: 0.6, rough: 0.5 },
    shock: { layout: 'mono', springColor: '#1b1c1f', bodyColor: '#2a2c30', reservoir: true },
    drive: { type: 'chain', side: 'left', frontTeeth: 17, rearTeeth: 44, pitch: 0.015875, sprocketColor: '#2a2c30' },
    engine: {
      layout: 'V2_60',
      cc: 1252,
      crank: [0, 0.4, -0.88],
      tiltDeg: 52,
      caseColor: '#232427',
      coverColor: '#9aa0a7',
      headColor: '#26272a',
      camCoverColor: '#1d1e21',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.3, h: 0.28, z: -1.26, y: 0.72, tiltDeg: 12, curved: true },
      width: 0.4,
    },
    exhaust: { route: 'sideCan', side: 'right', can: 'oval', canLength: 0.46, canDia: 0.15, canFinish: 'steel', headerFinish: 'steel', outlet: [0.21, 0.55, 0.15] },
    cockpit: {
      bars: 'tubular',
      grip: [0.43, 1.2, -1.0],
      barDia: 0.0286,
      dash: 'tftWide',
      dashPos: [0, 1.2, -1.1],
      dashSize: [0.16, 0.095],
      dashTiltDeg: 38,
      dashMount: 'fairing',
      mirrors: 'bar',
      mirrorPos: [0.38, 1.33, -1.02],
      mirrorSize: [0.12, 0.075],
      mirrorIndicators: false,
      mirrorShape: 'rect',
      mirrorColor: '#1b1c1f',
      topClamp: 'riser',
      steeringDamper: 'none',
      leverColor: '#9aa0a7',
      reservoirs: true,
      clutch: 'hydraulic',
      ignition: 'keyless',
      switchColor: '#151618',
      gripColor: '#141414',
      barEndColor: '#2a2c30',
    },
    lights: { head: 'ledBar', tail: 'compact', rearIndicators: 'stalk' },
    seat: { height: 0.85, front: -0.92, back: -0.44, pillion: 'seat', color: '#141414' },
    rider: { hip: [0, 0.97, -0.62], peg: [0.24, 0.43, -0.66], torsoPitch: 0.18 },
    footrests: 'peg',
    plate: { mount: 'hanger', pos: [0, 0.66, 0.36], tiltDeg: -14 },
    body,
    livery,
    groundClearance: 0.19,
    features: ['crashbars', 'windscreenTall'],
    zones: { splitY: 0.55, decal: [-1.2, 0.9] },
  };
}
