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
  handGuards,
  loftPart,
  ovalTubeAlong,
  panelPair,
  rearLamp,
  skidPlate,
  SOFT,
  strip,
} from './family-adv-touring-parts';

/**
 * KTM 890 Adventure R (2021–2023).
 * Spec sheet: wheelbase 1528 mm, steering head 63.5° (rake 26.5°), trail ≈ 118 mm, seat 890 mm,
 * L×W×H ≈ 2250 × 920 × 1450 mm, 90/90-21 + 150/70-18 on spoked wheels, 48 mm WP XPLOR USD fork
 * (240 mm travel), WP XPLOR PDS monoshock, steel trellis frame, die-cast aluminium swingarm,
 * 889 cc LC8c parallel twin (75° crank), short side silencer on the right.
 * Design cues: rally "tower" mask with a slim LED headlamp and DRL bars, tall flat screen,
 * very high-mounted front fender, low-slung side fuel tanks flanking the engine (centre tank
 * above them), orange trellis frame with orange springs, slim tail with a rally-style rack.
 */

const BLACK_PL = F.texturedBlack;

function mask(): OutlineBody {
  return {
    zs: stationsBetween(-1.47, -1.1, 10, 0.4),
    top: curve([[-1.47, 1.04], [-1.45, 1.11], [-1.4, 1.175], [-1.3, 1.225], [-1.2, 1.245], [-1.1, 1.25]]),
    bottom: curve([[-1.47, 0.98], [-1.42, 0.935], [-1.32, 0.905], [-1.2, 0.9], [-1.1, 0.92]]),
    half: curve([[-1.47, 0.07], [-1.44, 0.13], [-1.37, 0.17], [-1.27, 0.19], [-1.1, 0.2]]),
    sections: [{ z: 0, pts: [[0, 1], [0.2, 0.985], [0.6, 0.93], [0.92, 0.8], [1, 0.52], [0.96, 0.2], [0.84, 0]] }],
  };
}

function face(ctx: KitContext): void {
  // Wide slim headlamp window cut into the mask.
  const window = frontRegion([[0.0, 0.985], [0.105, 0.99], [0.12, 1.035], [0.105, 1.08], [0.0, 1.085]]);
  loftPart(ctx, mask(), PAINT, { group: 'steer', capFront: true, depth: 0.01, q: 1.6, creases: [1], region: fNot(fAnd(window, (_x, _y, z) => -1.4 - z)) });
  const lampOutline: P2[] = smooth2([[-0.1, -0.045], [0.1, -0.045], [0.115, 0.0], [0.1, 0.045], [-0.1, 0.045], [-0.115, 0.0]], 2, true);
  frontLamp(ctx, 'steer', lampOutline, [0, 1.035, -1.425], { kind: 'head', inner: 'projector', count: 2, depth: 0.05, rim: 0.005, housing: F.black }, 0.35);
  // Vertical DRL bars either side of the lamp, framed by black mask inserts.
  for (const s of [-1, 1]) {
    strip(ctx, 'steer', [[s * 0.14, 1.08, -1.402], [s * 0.146, 1.035, -1.4], [s * 0.14, 0.99, -1.402]], 0.008, 0.005, 'drl', [0, 0, -1]);
    bladeIndicator(ctx, 'steer', [s * 0.165, 0.95, -1.38], [s * 0.195, 0.955, -1.39], 0.009);
  }
  // Black air-intake grille under the lamp.
  ctx.add('steer', roundBox(0.2, 0.05, 0.02, 0.01), hard('#101113', 0.2, 0.6), T(0, 0.935, -1.405));
  // Tall flat rally screen on stays.
  screen(ctx, 'steer', {
    zs: stationsBetween(-1.3, -1.16, 6, 0.3),
    top: curve([[-1.3, 1.23], [-1.25, 1.33], [-1.2, 1.42], [-1.16, 1.47]]),
    bottom: curve([[-1.3, 1.21], [-1.16, 1.24]]),
    half: curve([[-1.3, 0.14], [-1.2, 0.165], [-1.16, 0.155]]),
    sections: [{ z: 0, pts: [[0, 1], [0.5, 0.99], [0.85, 0.94], [1, 0.76], [1, 0.4], [1, 0]] }],
  }, tint(F.screen, '#5c6670'));
  for (const s of [-1, 1]) ctx.add('steer', rod([s * 0.1, 1.215, -1.28], [s * 0.12, 1.33, -1.2], 0.006, 0.006, 8), F.darkAlu);
}

function tanksAndPanels(ctx: KitContext): void {
  // Centre tank: slim, standing above the low side tanks.
  buildTank(ctx, {
    front: -1.14,
    back: -0.72,
    top: 1.14,
    bottomFront: 0.95,
    bottomBack: 0.92,
    width: 0.28,
    style: 'adventure',
    knee: 0.08,
    capZ: -0.98,
    topLine: [[-1.14, 1.115], [-1.04, 1.14], [-0.92, 1.14], [-0.8, 1.11], [-0.74, 1.06], [-0.72, 1.0]],
    bottomLine: [[-1.14, 0.96], [-0.95, 0.93], [-0.72, 0.92]],
    halfLine: [[-1.14, 0.1], [-1.04, 0.135], [-0.92, 0.145], [-0.8, 0.13], [-0.72, 0.1]],
  });
  // Low-slung side fuel tanks / radiator covers flanking the engine.
  const side: OutlineBody = {
    zs: stationsBetween(-1.34, -0.68, 12, 0.4),
    top: curve([[-1.34, 0.98], [-1.24, 1.06], [-1.06, 1.09], [-0.88, 1.06], [-0.74, 0.98], [-0.68, 0.9]]),
    bottom: curve([[-1.34, 0.84], [-1.24, 0.76], [-1.06, 0.68], [-0.88, 0.67], [-0.76, 0.7], [-0.68, 0.76]]),
    half: curve([[-1.34, 0.15], [-1.24, 0.215], [-1.06, 0.255], [-0.88, 0.255], [-0.76, 0.225], [-0.68, 0.19]]),
    sections: [{ z: 0, pts: [[0.55, 1], [0.8, 0.95], [0.96, 0.8], [1, 0.55], [0.97, 0.28], [0.88, 0.04]] }],
  };
  panelPair(ctx, side, PAINT, { creases: [2], depth: 0.012 });
  // Black radiator scoop at the front of the side tanks.
  for (const s of [-1, 1]) {
    const d: P2[] = smooth2([[-1.3, 0.82], [-1.16, 0.74], [-1.04, 0.72], [-1.02, 0.67], [-1.18, 0.66], [-1.3, 0.74]], 3, true);
    ctx.add('chassis', extrude(d, 0.012, { plane: 'zy', center: s * 0.223, bevel: 0.003, curveSegs: 1 }), BLACK_PL);
  }
}

function seatAndTail(ctx: KitContext): void {
  buildSeat(ctx, { front: -0.95, back: -0.45, yFront: 0.925, y: 0.9, yBack: 0.92, width: 0.27, thick: 0.08, frontWidth: 0.17 });
  buildSeat(ctx, { front: -0.44, back: 0.12, yFront: 0.93, y: 0.95, yBack: 0.97, width: 0.25, thick: 0.075, frontWidth: 0.23 }, tint(seatFinish(ctx), '#1a1a1c'));
  const tail: OutlineBody = {
    zs: stationsBetween(-0.62, 0.36, 11, 0.45),
    top: curve([[-0.62, 0.88], [-0.4, 0.89], [-0.1, 0.9], [0.14, 0.935], [0.36, 0.98]]),
    bottom: curve([[-0.62, 0.74], [-0.4, 0.73], [-0.1, 0.76], [0.14, 0.8], [0.36, 0.88]]),
    half: curve([[-0.62, 0.14], [-0.4, 0.14], [-0.1, 0.125], [0.14, 0.1], [0.36, 0.06]]),
    sections: [{ z: 0, pts: SOFT }],
  };
  loftPart(ctx, tail, PAINT, { depth: 0.01, q: 1.1, capBack: true });
  // Rally-style alloy rack with grab handles.
  ctx.add('chassis', roundBox(0.22, 0.012, 0.3, 0.008, 2), F.darkAlu, T(0, 1.0, 0.1));
  for (const s of [-1, 1]) ovalTubeAlong(ctx, 'chassis', [[s * 0.1, 0.98, -0.3], [s * 0.125, 1.0, -0.2], [s * 0.13, 1.005, 0.0], [s * 0.11, 0.99, 0.26]], 0.009, 0.007, F.darkAlu);
  const tl: P2[] = smooth2([[-0.055, -0.016], [0.055, -0.016], [0.06, 0.016], [-0.06, 0.016]], 3, true);
  rearLamp(ctx, 'chassis', tl, [0, 0.96, 0.365], { kind: 'tail', inner: 'led', count: 3, depth: 0.026, lensSmoked: true }, -0.14);
  plateHanger(ctx, { fromZ: 0.02, fromY: 0.8 });
  hugger(ctx, F.texturedBlack, -0.15, 0.95);
}

function protection(ctx: KitContext): void {
  handGuards(ctx, { color: tint(F.texturedBlack, '#ff6600'), outer: 0.05, h: 0.09 });
  skidPlate(ctx, [[-1.18, 0.3], [-1.0, 0.265], [-0.7, 0.26], [-0.52, 0.29], [-0.55, 0.33], [-0.75, 0.32], [-1.0, 0.33], [-1.16, 0.37]], 0.13, F.darkAlu);
}

function body(ctx: KitContext): void {
  face(ctx);
  // The very high rally fender.
  frontFender(ctx, { from: -1.2, to: 0.3, gap: 0.1, width: 0.115, f: F.paint });
  tanksAndPanels(ctx);
  seatAndTail(ctx);
  protection(ctx);
}

// ───────────────────────────── livery ─────────────────────────────

const ORANGE = '#ff6600';

function lettering(p: Pen, color: string): void {
  if (p.view !== 'right' && p.view !== 'left') return;
  p.text('KTM', -1.12, 0.93, { color, size: 0.05, weight: '900', spacing: 0.06, italic: true });
  p.text('890 ADVENTURE R', -0.7, 0.74, { color, size: 0.02, weight: '800', spacing: 0.08 });
}

function livery(c: LiveryCanvas, _lv: Livery, _env: LiveryEnv): void {
  c.views(ALL_VIEWS, (p) => {
    p.fill(ORANGE, 'gloss');
    if (p.view === 'right' || p.view === 'left') {
      // White upper panel through the side tank / shroud and a dark lower edge.
      p.poly([[-1.34, 0.98], [-1.24, 1.06], [-1.06, 1.09], [-0.88, 1.06], [-0.74, 0.98], [-0.74, 0.94], [-0.88, 1.0], [-1.06, 1.03], [-1.24, 1.0], [-1.34, 0.93]], '#f3f3f1', 'gloss');
      p.poly([[-1.34, 0.84], [-1.24, 0.76], [-1.06, 0.68], [-0.88, 0.67], [-0.76, 0.7], [-0.68, 0.76], [-0.68, 0.8], [-0.88, 0.72], [-1.06, 0.73], [-1.24, 0.81], [-1.34, 0.88]], '#1b1c1f', 'satin');
      // The high front fender is white.
      p.poly(arcBand(-1.528, 0.348, 0.37, 0.5, -1.0, 0.4), '#f3f3f1', 'gloss');
      // Tail: white flash.
      p.poly([[-0.4, 0.8], [0.0, 0.82], [0.36, 0.9], [0.36, 0.93], [0.0, 0.86], [-0.4, 0.84]], '#f3f3f1', 'gloss');
      lettering(p, '#1b1c1f');
    } else if (p.view === 'top') {
      p.rect(-1.14, -0.05, -0.72, 0.05, '#f3f3f1');
    } else if (p.view === 'front') {
      p.rect(-0.05, 0.9, 0.05, 1.25, '#f3f3f1');
    }
  });
}

export function ktm890Blueprint(spec: BikeSpec): BikeBlueprint {
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.25, 0.92, 1.45],
    wheelbase: 1.528,
    rakeDeg: 26.5,
    trail: 0.118,
    forkLength: 0.88,
    front: { tyre: '90/90-21', rimWidthIn: 2.15, crown: 1.1, tread: 'knobbly', tyreLabel: 'Rally Trail' },
    rear: { tyre: '150/70-18', rimWidthIn: 4.25, crown: 1.1, tread: 'knobbly', tyreLabel: 'Rally Trail' },
    frontWheel: { type: 'wire', spokes: 36, shape: 'straight', color: '#c9ccd2', rimColor: '#1b1c1f' },
    rearWheel: { type: 'wire', spokes: 36, shape: 'straight', color: '#c9ccd2', rimColor: '#1b1c1f' },
    fork: { type: 'usd', stanchion: 0.048, spacing: 0.205, outerColor: '#26282c', innerColor: '#1b1c1f', footColor: '#26282c', capColor: '#ff6600', adjusterColor: '#ff6600', aboveClamp: 0.01, clampGap: 0.2, label: 'WP', labelColor: '#f3f3f1' },
    frontBrake: { discs: 2, discDia: 0.32, disc: 'floating', carrierColor: '#2a2c30', caliper: 'radial4', caliperColor: '#2a2c30', caliperAngleDeg: 76 },
    rearBrake: { discs: 1, discDia: 0.26, disc: 'fixed', carrierColor: '#2a2c30', caliper: 'axial1', caliperColor: '#2a2c30', caliperAngleDeg: 205 },
    frame: { type: 'trellis', color: ORANGE, metal: 0.3, rough: 0.45, subframe: 'trellis', subframeColor: ORANGE, width: 0.3 },
    swingarm: { type: 'braced', length: 0.6, angleDeg: 6, color: '#2a2c30', metal: 0.7, rough: 0.42 },
    shock: { layout: 'mono', springColor: ORANGE, bodyColor: '#2a2c30', reservoir: true },
    drive: { type: 'chain', side: 'left', frontTeeth: 16, rearTeeth: 45, pitch: 0.015875, sprocketColor: '#2a2c30' },
    engine: {
      layout: 'P2_270',
      cc: 889,
      crank: [0, 0.39, -0.84],
      tiltDeg: 8,
      caseColor: '#2a2c30',
      coverColor: '#9aa0a7',
      headColor: '#2c2e33',
      camCoverColor: '#1d1e21',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.26, h: 0.24, z: -1.2, y: 0.74, tiltDeg: 8 },
      width: 0.34,
    },
    exhaust: { route: 'sideCan', side: 'right', can: 'round', canLength: 0.38, canDia: 0.115, canFinish: 'steel', headerFinish: 'steel', outlet: [0.19, 0.64, 0.14] },
    cockpit: {
      bars: 'tubular',
      grip: [0.42, 1.27, -0.96],
      barDia: 0.0286,
      dash: 'tft',
      dashPos: [0, 1.255, -1.1],
      dashSize: [0.13, 0.08],
      dashTiltDeg: 40,
      dashMount: 'bars',
      mirrors: 'bar',
      mirrorPos: [0.38, 1.4, -0.97],
      mirrorSize: [0.12, 0.075],
      mirrorIndicators: false,
      mirrorShape: 'rect',
      mirrorColor: '#1b1c1f',
      topClamp: 'riser',
      steeringDamper: 'none',
      leverColor: '#ff6600',
      reservoirs: true,
      clutch: 'hydraulic',
      ignition: 'keyless',
      switchColor: '#151618',
      gripColor: '#141414',
      barEndColor: '#2a2c30',
    },
    lights: { head: 'ledBar', tail: 'compact', rearIndicators: 'stalk' },
    seat: { height: 0.89, front: -0.95, back: -0.45, pillion: 'seat', color: '#141414' },
    rider: { hip: [0, 1.0, -0.62], peg: [0.23, 0.46, -0.64], torsoPitch: 0.16 },
    footrests: 'peg',
    plate: { mount: 'hanger', pos: [0, 0.66, 0.36], tiltDeg: -14 },
    body,
    livery,
    groundClearance: 0.252,
    features: ['windscreenTall'],
    zones: { splitY: 0.6, decal: [-1.12, 0.95] },
  };
}
