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
  strip,
  tubeAlong,
} from './family-adv-touring-parts';

/**
 * Suzuki V-Strom 650 XT (2017–2024).
 * Spec sheet: wheelbase 1560 mm, caster 25.5°, trail 110 mm, seat 835 mm, L×W×H ≈ 2275 × 880 × 1405 mm,
 * 110/80R19 + 150/70R17 on tubeless cross-spoke wheels, 43 mm telescopic fork, twin 310 mm front
 * discs, aluminium twin-spar frame, 645 cc 90° V-twin (front cylinder almost horizontal), side-mounted
 * silencer on the right.
 * Design cues: the famous "beak" (pointed nose cowl over a large trapezoid headlight and a small
 * adjustable screen), steel 20 L tank with black knee shrouds, single long seat with an alloy grab
 * rack, hand guards, bash plate and crash bars on the XT.
 */

const BLACK_PL = F.texturedBlack;
const BLACK = '#1b1c1f';

function beak(): OutlineBody {
  // The beak: pointed nose cowl above the headlight, running back to the screen and cockpit.
  return {
    zs: stationsBetween(-1.58, -1.18, 11, 0.4),
    top: curve([[-1.58, 1.0], [-1.54, 1.05], [-1.46, 1.09], [-1.36, 1.125], [-1.26, 1.15], [-1.18, 1.165]]),
    bottom: curve([[-1.58, 0.965], [-1.52, 0.955], [-1.46, 0.93], [-1.36, 0.9], [-1.26, 0.89], [-1.18, 0.9]]),
    half: curve([[-1.58, 0.03], [-1.54, 0.08], [-1.46, 0.135], [-1.36, 0.175], [-1.26, 0.195], [-1.18, 0.2]]),
    sections: [{ z: 0, pts: [[0, 1], [0.12, 0.97], [0.5, 0.86], [0.85, 0.66], [1, 0.38], [0.95, 0.12], [0.86, 0]] }],
  };
}

function face(ctx: KitContext): void {
  // Headlight window below the beak, cut from the cowl front.
  const window = frontRegion([[0.0, 0.89], [0.12, 0.9], [0.145, 0.95], [0.13, 0.99], [0.0, 0.99]]);
  loftPart(ctx, beak(), PAINT, { group: 'steer', capFront: true, depth: 0.01, q: 1.6, creases: [1], region: fNot(fAnd(window, (_x, _y, z) => -1.44 - z)) });
  // Large trapezoid multi-reflector headlight, recessed under the beak.
  const lampOutline: P2[] = smooth2([[-0.125, -0.052], [0.125, -0.052], [0.15, 0.046], [-0.15, 0.046]], 3, true);
  frontLamp(ctx, 'steer', lampOutline, [0, 0.944, -1.4], { kind: 'head', inner: 'reflector', depth: 0.06, rim: 0.007, housing: F.black }, 0.1);
  // Black cheeks either side of the lamp reach down toward the fender.
  const cheek: OutlineBody = {
    zs: stationsBetween(-1.5, -1.24, 8, 0.4),
    top: curve([[-1.5, 0.93], [-1.4, 0.95], [-1.24, 0.97]]),
    bottom: curve([[-1.5, 0.84], [-1.4, 0.8], [-1.24, 0.8]]),
    half: curve([[-1.5, 0.15], [-1.4, 0.17], [-1.24, 0.19]]),
    sections: [{ z: 0, pts: [[0.7, 1], [0.92, 0.9], [1, 0.62], [0.96, 0.25], [0.86, 0]] }],
  };
  panelPair(ctx, cheek, BLACK_PL, { group: 'steer', depth: 0.008, q: 1 });
  // Adjustable screen on two stays.
  screen(ctx, 'steer', {
    zs: stationsBetween(-1.28, -1.1, 7, 0.3),
    top: curve([[-1.28, 1.13], [-1.23, 1.22], [-1.17, 1.3], [-1.12, 1.345], [-1.1, 1.35]]),
    bottom: curve([[-1.28, 1.12], [-1.1, 1.14]]),
    half: curve([[-1.28, 0.15], [-1.2, 0.18], [-1.1, 0.165]]),
    sections: [{ z: 0, pts: [[0, 1], [0.5, 0.985], [0.85, 0.93], [1, 0.75], [1, 0.4], [1, 0]] }],
  }, tint(F.screen, '#5b6670'));
  for (const s of [-1, 1]) {
    ctx.add('steer', rod([s * 0.1, 1.13, -1.24], [s * 0.125, 1.25, -1.15], 0.006, 0.006, 8), F.darkAlu);
    bladeIndicator(ctx, 'steer', [s * 0.17, 0.95, -1.38], [s * 0.2, 0.96, -1.4], 0.009);
  }
  // Small suzuki-style badge on the beak.
  ctx.add('steer', roundBox(0.04, 0.025, 0.006, 0.004), F.chrome, T(0, 1.07, -1.5));
}

function tankAndBody(ctx: KitContext): void {
  buildTank(ctx, {
    front: -1.2,
    back: -0.78,
    top: 1.07,
    bottomFront: 0.9,
    bottomBack: 0.86,
    width: 0.36,
    style: 'adventure',
    knee: 0.14,
    capZ: -1.02,
    topLine: [[-1.2, 1.04], [-1.12, 1.065], [-1.0, 1.075], [-0.9, 1.065], [-0.82, 1.03], [-0.78, 0.98]],
    bottomLine: [[-1.2, 0.9], [-1.0, 0.88], [-0.78, 0.86]],
    halfLine: [[-1.2, 0.12], [-1.08, 0.165], [-0.95, 0.18], [-0.84, 0.16], [-0.78, 0.12]],
  });
  // Black radiator shrouds below the tank edge: narrow, so the yellow tank flanks stay visible above them.
  const shroud: OutlineBody = {
    zs: stationsBetween(-1.28, -0.96, 8, 0.4),
    top: curve([[-1.28, 0.86], [-1.2, 0.875], [-1.08, 0.87], [-0.96, 0.84]]),
    bottom: curve([[-1.28, 0.76], [-1.2, 0.7], [-1.08, 0.68], [-0.96, 0.73]]),
    half: curve([[-1.28, 0.15], [-1.2, 0.185], [-1.08, 0.195], [-0.96, 0.17]]),
    sections: [{ z: 0, pts: [[0.62, 1], [0.86, 0.95], [0.98, 0.78], [1, 0.5], [0.97, 0.22], [0.88, 0]] }],
  };
  panelPair(ctx, shroud, BLACK_PL, { depth: 0.01 });
  grille(ctx, -1.24, 0.64, 0.8, 0.14, 5, 8, F.texturedBlack);
}

function seatAndTail(ctx: KitContext): void {
  buildSeat(ctx, { front: -0.86, back: -0.38, yFront: 0.875, y: 0.84, yBack: 0.86, width: 0.3, thick: 0.08, frontWidth: 0.2 });
  buildSeat(ctx, { front: -0.37, back: 0.1, yFront: 0.87, y: 0.885, yBack: 0.9, width: 0.27, thick: 0.07, frontWidth: 0.25 }, tint(seatFinish(ctx), '#1a1a1c'));
  // Side covers under the seat (body colour) and the upswept tail cowl.
  const cover: OutlineBody = {
    zs: stationsBetween(-0.62, 0.05, 9, 0.4),
    top: curve([[-0.62, 0.83], [-0.4, 0.85], [0.05, 0.9]]),
    bottom: curve([[-0.62, 0.68], [-0.4, 0.67], [0.05, 0.75]]),
    half: curve([[-0.62, 0.15], [-0.4, 0.15], [0.05, 0.11]]),
    sections: [{ z: 0, pts: [[0.7, 1], [0.93, 0.92], [1, 0.62], [0.96, 0.25], [0.84, 0.0]] }],
  };
  panelPair(ctx, cover, PAINT, { depth: 0.01, q: 1 });
  const tail: OutlineBody = {
    zs: stationsBetween(0.0, 0.3, 7, 0.4),
    top: curve([[0.0, 0.905], [0.15, 0.925], [0.3, 0.95]]),
    bottom: curve([[0.0, 0.76], [0.15, 0.82], [0.3, 0.88]]),
    half: curve([[0.0, 0.1], [0.15, 0.085], [0.3, 0.06]]),
    sections: [{ z: 0, pts: [[0.5, 1], [0.92, 0.9], [1, 0.6], [0.94, 0.25], [0.8, 0.0]] }],
  };
  panelPair(ctx, tail, PAINT, { depth: 0.008, q: 1, capBack: true });
  // Aluminium grab rack with a short load plate.
  ctx.add('chassis', roundBox(0.22, 0.012, 0.22, 0.008, 2), F.darkAlu, T(0, 0.945, 0.14));
  for (const s of [-1, 1]) ovalTubeAlong(ctx, 'chassis', [[s * 0.1, 0.92, -0.28], [s * 0.13, 0.95, -0.2], [s * 0.14, 0.96, 0.0], [s * 0.12, 0.95, 0.2]], 0.009, 0.007, F.darkAlu);
  const tl: P2[] = smooth2([[-0.055, -0.016], [0.055, -0.016], [0.062, 0.015], [-0.062, 0.015]], 3, true);
  rearLamp(ctx, 'chassis', tl, [0, 0.9, 0.31], { kind: 'tail', inner: 'led', count: 3, depth: 0.026, lensSmoked: true }, -0.14);
  plateHanger(ctx, { fromZ: 0.02, fromY: 0.78 });
  hugger(ctx, F.texturedBlack, -0.15, 0.95);
}

function protection(ctx: KitContext): void {
  handGuards(ctx, { color: F.texturedBlack, outer: 0.05, h: 0.085 });
  skidPlate(ctx, [[-1.1, 0.27], [-0.95, 0.24], [-0.68, 0.24], [-0.52, 0.27], [-0.56, 0.31], [-0.75, 0.3], [-0.95, 0.31], [-1.08, 0.34]], 0.13, F.darkAlu);
  const bar = hard('#26282c', 0.6, 0.4, 0.4);
  for (const s of [-1, 1]) tubeAlong(ctx, 'chassis', [[s * 0.15, 0.78, -1.1], [s * 0.3, 0.62, -1.06], [s * 0.34, 0.46, -1.0], [s * 0.28, 0.34, -0.92], [s * 0.17, 0.3, -0.86]], 0.0115, bar);
  strip(ctx, 'steer', [[-0.1, 1.012, -1.5], [0, 1.0, -1.52], [0.1, 1.012, -1.5]], 0.006, 0.004, 'drl', [0, 0, -1]);
  void extrude;
}

function body(ctx: KitContext): void {
  face(ctx);
  // Pointed front fender: the beak's lower half.
  frontFender(ctx, { from: -1.05, to: 0.5, gap: 0.04, width: 0.12, f: PAINT });
  tankAndBody(ctx);
  seatAndTail(ctx);
  protection(ctx);
}

// ───────────────────────────── livery ─────────────────────────────

const YELLOW = '#f6c500';

function lettering(p: Pen, color: string): void {
  if (p.view !== 'right' && p.view !== 'left') return;
  p.text('V-STROM', -1.0, 0.95, { color, size: 0.036, weight: '900', spacing: 0.05 });
  p.text('650XT', -0.3, 0.8, { color, size: 0.026, weight: '800', spacing: 0.1 });
}

function livery(c: LiveryCanvas, lv: Livery, env: LiveryEnv): void {
  const yellow = env.index === 0;
  c.views(ALL_VIEWS, (p) => {
    p.fill(yellow ? YELLOW : '#f1f2f3', yellow ? 'gloss' : 'pearl');
    if (p.view === 'right' || p.view === 'left') {
      // Fender: black lower half; blue pin-stripe on the beak and tail like the factory scheme.
      p.poly(arcBand(-1.56, 0.3293, 0.34, 0.43, -1.0, 0.0), '#1b1c1f', 'gloss');
      p.line([[-1.56, 1.0], [-1.4, 1.06], [-1.2, 1.1]], '#1747a6', 0.006);
      p.line([[-0.62, 0.84], [-0.2, 0.86], [0.3, 0.92]], '#1747a6', 0.006);
      lettering(p, yellow ? '#1b1c1f' : '#1747a6');
    }
    void lv;
  });
}

export function vstrom650Blueprint(spec: BikeSpec): BikeBlueprint {
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.275, 0.89, 1.405],
    wheelbase: 1.56,
    rakeDeg: 25.5,
    trail: 0.11,
    forkLength: 0.74,
    front: { tyre: '110/80R19', rimWidthIn: 2.5, crown: 1.1, tread: 'dual', tyreLabel: 'Trail Radial' },
    rear: { tyre: '150/70R17', rimWidthIn: 4.0, crown: 1.1, tread: 'dual', tyreLabel: 'Trail Radial' },
    frontWheel: { type: 'wire', spokes: 36, shape: 'straight', color: '#c9ccd2', crossSpoke: true, rimColor: BLACK },
    rearWheel: { type: 'wire', spokes: 36, shape: 'straight', color: '#c9ccd2', crossSpoke: true, rimColor: BLACK },
    fork: { type: 'rwu', stanchion: 0.043, spacing: 0.19, outerColor: '#1b1c1f', innerColor: '#c9ccd2', footColor: '#1b1c1f', capColor: '#1b1c1f', aboveClamp: 0.01, clampGap: 0.18 },
    frontBrake: { discs: 2, discDia: 0.31, disc: 'floating', carrierColor: '#2a2c30', caliper: 'axial2', caliperColor: '#2a2c30', caliperAngleDeg: 70 },
    rearBrake: { discs: 1, discDia: 0.26, disc: 'fixed', carrierColor: '#2a2c30', caliper: 'axial1', caliperColor: '#2a2c30', caliperAngleDeg: 205 },
    frame: { type: 'twinSpar', color: '#3b3e43', metal: 0.7, rough: 0.42, subframe: 'tubular', subframeColor: '#1b1c1f', width: 0.3 },
    swingarm: { type: 'box', length: 0.6, angleDeg: 6, color: '#9aa0a7', metal: 0.85, rough: 0.4 },
    shock: { layout: 'mono', springColor: '#1747a6', bodyColor: '#1b1c1f', reservoir: false },
    drive: { type: 'chain', side: 'left', frontTeeth: 15, rearTeeth: 46, pitch: 0.015875, sprocketColor: '#2a2c30' },
    engine: {
      layout: 'L2',
      cc: 645,
      crank: [0, 0.4, -0.84],
      tiltDeg: 38,
      caseColor: '#2a2c30',
      coverColor: '#9aa0a7',
      headColor: '#9aa0a7',
      camCoverColor: '#2a2c30',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.3, h: 0.24, z: -1.24, y: 0.72, tiltDeg: 8, curved: true },
      width: 0.32,
    },
    exhaust: { route: 'sideCan', side: 'right', can: 'round', canLength: 0.44, canDia: 0.115, canFinish: 'steel', headerFinish: 'steel', outlet: [0.2, 0.54, 0.1] },
    cockpit: {
      bars: 'tubular',
      grip: [0.4, 1.15, -1.0],
      barDia: 0.0254,
      dash: 'lcd',
      dashPos: [0, 1.15, -1.14],
      dashSize: [0.15, 0.09],
      dashTiltDeg: 36,
      dashMount: 'bars',
      mirrors: 'bar',
      mirrorPos: [0.36, 1.3, -1.0],
      mirrorSize: [0.12, 0.08],
      mirrorIndicators: false,
      mirrorShape: 'rect',
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
    seat: { height: 0.835, front: -0.86, back: -0.38, pillion: 'seat', color: '#141414' },
    rider: { hip: [0, 0.94, -0.6], peg: [0.22, 0.4, -0.64], torsoPitch: 0.18 },
    footrests: 'peg',
    plate: { mount: 'hanger', pos: [0, 0.6, 0.34], tiltDeg: -14 },
    body,
    livery,
    groundClearance: 0.17,
    features: ['crashbars', 'windscreenTall'],
    zones: { splitY: 0.6, decal: [-1.0, 0.95] },
  };
}
