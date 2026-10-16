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
 * Ducati Multistrada V4 S (2021–2024).
 * Spec sheet: wheelbase 1567 mm, rake 25.5°, trail 100 mm, seat 840/860 mm, L×W×H ≈ 2200 × 960 × 1450 mm,
 * 120/70 ZR19 + 170/60 ZR17 on cast 5-split-spoke wheels, 50 mm semi-active USD fork, Brembo Stylema
 * 330 mm discs, aluminium monocoque "front frame" + double-sided swingarm, 1158 cc Granturismo V4
 * (rear bank turned to the front, 90°), compact side silencer on the right.
 * Design cues: pointed beak nose with two slanted LED eyes and a radar module under them, tall
 * electrically adjustable screen, high pointed beak fender, wide tank wings with black vents, stepped
 * seat, upswept tail with grab rails, aluminium bash plate.
 */

const BLACK_PL = F.texturedBlack;

function nose(): OutlineBody {
  return {
    zs: stationsBetween(-1.56, -1.2, 11, 0.4),
    top: curve([[-1.56, 0.985], [-1.51, 1.04], [-1.44, 1.095], [-1.34, 1.14], [-1.22, 1.175]]),
    bottom: curve([[-1.56, 0.965], [-1.5, 0.93], [-1.42, 0.885], [-1.32, 0.855], [-1.22, 0.86]]),
    half: curve([[-1.56, 0.025], [-1.5, 0.085], [-1.42, 0.15], [-1.32, 0.19], [-1.22, 0.215]]),
    sections: [{ z: 0, pts: [[0, 1], [0.09, 0.975], [0.5, 0.88], [0.86, 0.68], [1, 0.4], [0.94, 0.12], [0.8, 0]] }],
  };
}

function face(ctx: KitContext): void {
  // Two slanted eye openings cut from the nose, outer corners high.
  const eye = frontRegion([[0.035, 0.935], [0.17, 0.99], [0.185, 1.05], [0.05, 1.0]]);
  loftPart(ctx, nose(), PAINT, { capFront: true, depth: 0.01, q: 1.7, creases: [1], region: fNot(fAnd(eye, (_x, _y, z) => -1.4 - z)) });
  const lampOutline = (s: number): P2[] => smooth2([[s * 0.034, -0.045], [s * 0.168, 0.01], [s * 0.18, 0.062], [s * 0.05, 0.012]], 2, true);
  for (const s of [-1, 1]) {
    frontLamp(ctx, 'chassis', lampOutline(s), [s * 0.002, 0.985, -1.43], { kind: 'head', inner: 'projector', count: 2, depth: 0.05, rim: 0.005, housing: F.black }, 0.5);
    // DRL: a thin signature line under each eye running into a short vertical drop at the centre.
    strip(ctx, 'chassis', [[s * 0.04, 0.925, -1.455], [s * 0.1, 0.945, -1.447], [s * 0.17, 0.978, -1.425]], 0.007, 0.005, 'drl', [0, 0, -1]);
    bladeIndicator(ctx, 'chassis', [s * 0.205, 1.0, -1.34], [s * 0.225, 1.015, -1.36], 0.008);
  }
  // Radar module in the lower nose.
  ctx.add('chassis', roundBox(0.13, 0.06, 0.03, 0.012), hard('#0e0f11', 0.3, 0.35), T(0, 0.875, -1.475));
  // Tall electric screen on two stays.
  screen(ctx, 'chassis', {
    zs: stationsBetween(-1.28, -1.07, 8, 0.3),
    top: curve([[-1.28, 1.19], [-1.22, 1.3], [-1.15, 1.4], [-1.1, 1.45], [-1.07, 1.465]]),
    bottom: curve([[-1.28, 1.17], [-1.07, 1.2]]),
    half: curve([[-1.28, 0.17], [-1.2, 0.2], [-1.07, 0.185]]),
    sections: [{ z: 0, pts: [[0, 1], [0.5, 0.985], [0.85, 0.93], [1, 0.75], [1, 0.4], [1, 0]] }],
  }, tint(F.screen, '#58626d'));
  for (const s of [-1, 1]) ctx.add('chassis', rod([s * 0.11, 1.17, -1.25], [s * 0.13, 1.33, -1.14], 0.0065, 0.0065, 8), F.darkAlu);
}

function tankAndWings(ctx: KitContext): void {
  buildTank(ctx, {
    front: -1.22,
    back: -0.8,
    top: 1.12,
    bottomFront: 0.93,
    bottomBack: 0.9,
    width: 0.38,
    style: 'adventure',
    knee: 0.12,
    capZ: -1.0,
    topLine: [[-1.22, 1.1], [-1.1, 1.12], [-0.98, 1.12], [-0.86, 1.1], [-0.8, 1.05]],
    bottomLine: [[-1.22, 0.94], [-1.0, 0.91], [-0.8, 0.9]],
    halfLine: [[-1.22, 0.12], [-1.08, 0.17], [-0.95, 0.185], [-0.84, 0.165], [-0.8, 0.12]],
  });
  // Large body-coloured side panels / radiator covers sweeping from the nose back to the knees.
  const wing: OutlineBody = {
    zs: stationsBetween(-1.42, -0.86, 11, 0.4),
    top: curve([[-1.42, 0.97], [-1.32, 1.09], [-1.12, 1.125], [-0.97, 1.09], [-0.86, 1.02]]),
    bottom: curve([[-1.42, 0.84], [-1.3, 0.72], [-1.1, 0.66], [-0.94, 0.71], [-0.86, 0.8]]),
    half: curve([[-1.42, 0.17], [-1.32, 0.235], [-1.12, 0.265], [-0.97, 0.245], [-0.86, 0.2]]),
    sections: [{ z: 0, pts: [[0.6, 1], [0.84, 0.95], [0.97, 0.8], [1, 0.52], [0.97, 0.24], [0.9, 0]] }],
  };
  panelPair(ctx, wing, PAINT, { creases: [2], depth: 0.012 });
  // Black air vent behind the wing's leading edge.
  grille(ctx, -1.27, 0.66, 0.86, 0.15, 6, 8, F.texturedBlack);
  for (const s of [-1, 1]) {
    const d: P2[] = smooth2([[-1.3, 0.74], [-1.12, 0.67], [-1.0, 0.655], [-0.96, 0.62], [-1.12, 0.59], [-1.28, 0.66]], 3, true);
    ctx.add('chassis', extrude(d, 0.012, { plane: 'zy', center: s * 0.262, bevel: 0.003, curveSegs: 1 }), BLACK_PL);
  }
}

function seatAndTail(ctx: KitContext): void {
  buildSeat(ctx, { front: -0.9, back: -0.42, yFront: 0.89, y: 0.865, yBack: 0.89, width: 0.32, thick: 0.085, frontWidth: 0.2 });
  buildSeat(ctx, { front: -0.41, back: 0.1, yFront: 0.9, y: 0.93, yBack: 0.955, width: 0.29, thick: 0.08, frontWidth: 0.27 }, tint(seatFinish(ctx), '#1a1a1c'));
  // Closed tail unit under the pillion seat: body-coloured, rising to the tail light.
  const tail: OutlineBody = {
    zs: stationsBetween(-0.62, 0.345, 12, 0.45),
    top: curve([[-0.62, 0.84], [-0.4, 0.855], [-0.15, 0.87], [0.1, 0.92], [0.345, 0.99]]),
    bottom: curve([[-0.62, 0.7], [-0.4, 0.68], [-0.1, 0.7], [0.1, 0.76], [0.345, 0.86]]),
    half: curve([[-0.62, 0.16], [-0.4, 0.165], [-0.1, 0.15], [0.1, 0.125], [0.345, 0.075]]),
    sections: [{ z: 0, pts: SOFT }],
  };
  loftPart(ctx, tail, PAINT, { depth: 0.01, q: 1.2, capBack: true });
  // Black grab rails and a rack plate.
  ctx.add('chassis', roundBox(0.24, 0.012, 0.26, 0.008, 2), F.darkAlu, T(0, 0.985, 0.08));
  for (const s of [-1, 1]) ovalTubeAlong(ctx, 'chassis', [[s * 0.11, 0.955, -0.3], [s * 0.145, 0.99, -0.2], [s * 0.15, 0.995, 0.0], [s * 0.125, 0.99, 0.2]], 0.01, 0.007, F.texturedBlack);
  // Angular LED tail light.
  const tl: P2[] = smooth2([[-0.075, -0.014], [0.075, -0.014], [0.082, 0.014], [-0.082, 0.014], [-0.03, 0.02], [0.03, 0.02]], 2, true);
  rearLamp(ctx, 'chassis', tl, [0, 0.965, 0.345], { kind: 'tail', inner: 'led', count: 4, depth: 0.026, lensSmoked: true }, -0.16);
  plateHanger(ctx, { fromZ: 0.02, fromY: 0.78 });
  hugger(ctx, F.texturedBlack, -0.15, 0.95);
}

function protection(ctx: KitContext): void {
  handGuards(ctx, { color: F.texturedBlack, outer: 0.05, h: 0.09 });
  skidPlate(ctx, [[-1.18, 0.29], [-1.0, 0.255], [-0.7, 0.25], [-0.52, 0.28], [-0.55, 0.32], [-0.75, 0.31], [-1.0, 0.32], [-1.16, 0.36]], 0.14, F.darkAlu);
  const bar = hard('#26282c', 0.6, 0.4, 0.4);
  for (const s of [-1, 1]) tubeAlong(ctx, 'chassis', [[s * 0.17, 0.82, -1.22], [s * 0.34, 0.66, -1.18], [s * 0.4, 0.5, -1.1], [s * 0.34, 0.36, -1.0], [s * 0.2, 0.3, -0.93]], 0.0125, bar);
}

function body(ctx: KitContext): void {
  face(ctx);
  frontFender(ctx, { from: -1.15, to: 0.55, gap: 0.05, width: 0.125, f: PAINT });
  tankAndWings(ctx);
  seatAndTail(ctx);
  protection(ctx);
}

// ───────────────────────────── livery ─────────────────────────────

const RED = '#cc0a0a';

function lettering(p: Pen, color: string): void {
  if (p.view !== 'right' && p.view !== 'left') return;
  p.text('DUCATI', -1.14, 1.0, { color, size: 0.045, weight: '900', spacing: 0.05 });
  p.text('MULTISTRADA V4 S', -0.62, 0.78, { color, size: 0.02, weight: '700', spacing: 0.08 });
}

function livery(c: LiveryCanvas, _lv: Livery, env: LiveryEnv): void {
  const red = env.index === 0;
  c.views(ALL_VIEWS, (p) => {
    p.fill(red ? RED : '#f1f2f3', red ? 'gloss' : 'pearl');
    if (p.view === 'right' || p.view === 'left') {
      // Black lower side flaps and a dark swoosh through the wing, as on the factory scheme.
      p.poly([[-1.44, 0.8], [-1.2, 0.7], [-1.0, 0.655], [-0.86, 0.72], [-0.86, 0.8], [-1.0, 0.76], [-1.2, 0.8], [-1.44, 0.9]], '#1b1c1f', 'satin');
      if (!red) p.poly([[-1.44, 0.9], [-1.2, 0.8], [-1.0, 0.76], [-0.86, 0.8], [-0.86, 0.83], [-1.0, 0.79], [-1.2, 0.83], [-1.44, 0.93]], RED, 'gloss');
      // Black lower tail plastics and the air vent in the wing's trailing edge.
      p.poly([[-0.62, 0.69], [-0.4, 0.67], [-0.1, 0.69], [0.1, 0.75], [0.345, 0.85], [0.345, 0.925], [0.1, 0.84], [-0.1, 0.775], [-0.4, 0.755], [-0.62, 0.78]], '#1b1c1f', 'satin');
      p.poly([[-1.06, 0.84], [-0.9, 0.9], [-0.9, 0.97], [-1.06, 0.9]], '#1b1c1f', 'satin');
      // Fender: black lower half.
      p.poly(arcBand(-1.567, 0.325, 0.33, 0.44, -1.1, -0.05), '#1b1c1f', 'satin');
      lettering(p, red ? '#ffffff' : '#1b1c1f');
    } else if (p.view === 'top') {
      p.rect(-1.5, -0.014, -0.8, 0.014, red ? '#1b1c1f' : RED);
    }
  });
}

export function multistradaV4Blueprint(spec: BikeSpec): BikeBlueprint {
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.2, 0.96, 1.45],
    wheelbase: 1.567,
    rakeDeg: 25.5,
    trail: 0.1,
    forkLength: 0.78,
    front: { tyre: '120/70ZR19', rimWidthIn: 3.5, crown: 1.05, tread: 'touring', tyreLabel: 'Trail Sport' },
    rear: { tyre: '170/60ZR17', rimWidthIn: 4.5, crown: 1.05, tread: 'touring', tyreLabel: 'Trail Sport' },
    frontWheel: { type: 'cast', spokes: 5, shape: 'split', color: '#1b1c1f', machinedLip: false },
    rearWheel: { type: 'cast', spokes: 5, shape: 'split', color: '#1b1c1f', machinedLip: false },
    fork: { type: 'usd', stanchion: 0.05, spacing: 0.215, outerColor: '#1d1e21', innerColor: '#3a3c40', footColor: '#2b2d31', capColor: '#2b2d31', adjusterColor: '#c8102e', aboveClamp: 0.01, clampGap: 0.2, label: 'SHOWA', labelColor: '#d6d8dc' },
    frontBrake: { discs: 2, discDia: 0.33, disc: 'floating', carrierColor: '#1b1c1f', caliper: 'radialMono4', caliperColor: '#2a2c30', caliperText: 'BREMBO', caliperTextColor: '#d6d8dc', caliperAngleDeg: 76 },
    rearBrake: { discs: 1, discDia: 0.265, disc: 'fixed', carrierColor: '#1b1c1f', caliper: 'axial2', caliperColor: '#2a2c30', caliperAngleDeg: 205 },
    frame: { type: 'monocoque', color: '#2b2d31', metal: 0.7, rough: 0.45, subframe: 'tubular', subframeColor: '#1b1c1f', width: 0.33 },
    swingarm: { type: 'banana', length: 0.62, angleDeg: 8, color: '#35383d', metal: 0.75, rough: 0.42 },
    shock: { layout: 'mono', springColor: '#1b1c1f', bodyColor: '#2a2c30', reservoir: true },
    drive: { type: 'chain', side: 'left', frontTeeth: 15, rearTeeth: 43, pitch: 0.015875, sprocketColor: '#2a2c30' },
    engine: {
      layout: 'V4',
      cc: 1158,
      crank: [0, 0.4, -0.88],
      tiltDeg: 42,
      caseColor: '#232427',
      coverColor: '#2f3135',
      headColor: '#26272a',
      camCoverColor: '#1d1e21',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.3, h: 0.28, z: -1.26, y: 0.72, tiltDeg: 14, curved: true },
      width: 0.38,
    },
    exhaust: { route: 'sideCan', side: 'right', can: 'round', canLength: 0.4, canDia: 0.14, canFinish: 'steel', headerFinish: 'steel', outlet: [0.21, 0.52, 0.16] },
    cockpit: {
      bars: 'tubular',
      grip: [0.41, 1.2, -1.02],
      barDia: 0.0254,
      dash: 'tftDucati',
      dashPos: [0, 1.2, -1.12],
      dashSize: [0.16, 0.095],
      dashTiltDeg: 36,
      dashMount: 'fairing',
      mirrors: 'bar',
      mirrorPos: [0.36, 1.33, -1.04],
      mirrorSize: [0.12, 0.075],
      mirrorIndicators: true,
      mirrorShape: 'sport',
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
    lights: { head: 'angular', tail: 'strip', rearIndicators: 'stalk' },
    seat: { height: 0.85, front: -0.9, back: -0.42, pillion: 'seat', color: '#141414' },
    rider: { hip: [0, 0.96, -0.62], peg: [0.23, 0.42, -0.66], torsoPitch: 0.2 },
    footrests: 'peg',
    plate: { mount: 'hanger', pos: [0, 0.64, 0.36], tiltDeg: -14 },
    body,
    livery,
    groundClearance: 0.22,
    features: ['crashbars', 'windscreenTall'],
    zones: { splitY: 0.55, decal: [-1.14, 0.98] },
  };
}
