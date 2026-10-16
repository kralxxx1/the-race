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
  frontLamp,
  grille,
  arcBand,
  bladeIndicator,
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
 * Honda CRF1100L Africa Twin (2020–2024).
 * Spec sheet: wheelbase 1560 mm, caster 27.5°, trail 113 mm, seat 850 mm (870 high),
 * L×W×H ≈ 2335 × 960 × 1475 mm, 90/90-21 + 150/70R18 on cross-spoke tubeless wheels,
 * Showa 45 mm USD fork, 310 mm twin front discs, steel semi-double-cradle frame, 1084 cc
 * parallel twin with a 270° crank (cylinders leaning forward), side-mounted silencer on the right.
 * Design cues: rally-style pointed nose with two angular LED headlights and DRL eyebrows,
 * tall tilting screen, high beak-shaped front fender, big flat tank flanked by tall shrouds
 * with the black radiator slats below them, two-step seat, alloy luggage rack and grab handles.
 */

const BLACK_PL = F.texturedBlack;

function mask(): OutlineBody {
  return {
    zs: stationsBetween(-1.48, -1.2, 10, 0.4),
    top: curve([[-1.48, 0.95], [-1.44, 1.03], [-1.38, 1.1], [-1.3, 1.155], [-1.2, 1.19]]),
    bottom: curve([[-1.48, 0.93], [-1.42, 0.89], [-1.3, 0.86], [-1.2, 0.87]]),
    half: curve([[-1.48, 0.05], [-1.44, 0.12], [-1.37, 0.18], [-1.29, 0.205], [-1.2, 0.21]]),
    sections: [{ z: 0, pts: [[0, 1], [0.14, 0.97], [0.55, 0.82], [0.88, 0.62], [1, 0.36], [0.96, 0.12], [0.86, 0]] }],
  };
}

function face(ctx: KitContext): void {
  // Painted nose mask (turns with the bars) with a black lower insert around the lamps.
  const window = frontRegion([[0.03, 0.965], [0.15, 0.98], [0.172, 1.03], [0.15, 1.075], [0.04, 1.065]]);
  loftPart(ctx, mask(), PAINT, { group: 'steer', capFront: true, depth: 0.01, q: 1.6, creases: [1], region: fNot(fAnd(window, (_x, _y, z) => -1.36 - z)) });
  // Twin angular LED headlights: two slanted trapezoids either side of the crest.
  const lampOutline = (s: number): P2[] => smooth2([[s * 0.03, -0.04], [s * 0.13, -0.034], [s * 0.15, 0.01], [s * 0.125, 0.05], [s * 0.04, 0.044]], 2, true);
  for (const s of [-1, 1]) {
    frontLamp(ctx, 'steer', lampOutline(s), [s * 0.002, 1.02, -1.4], { kind: 'head', inner: 'projector', count: 1, depth: 0.045, rim: 0.005, housing: F.black }, 0.55);
    // DRL eyebrow above each lamp
    strip(ctx, 'steer', [[s * 0.035, 1.052, -1.396], [s * 0.09, 1.062, -1.4], [s * 0.15, 1.045, -1.37]], 0.009, 0.006, 'drl', [0, 0, -1]);
  }
  // Tall tilting screen on stays from the nose.
  screen(ctx, 'steer', {
    zs: stationsBetween(-1.27, -1.08, 8, 0.3),
    top: curve([[-1.27, 1.2], [-1.2, 1.3], [-1.14, 1.39], [-1.1, 1.425], [-1.08, 1.43]]),
    bottom: curve([[-1.27, 1.18], [-1.08, 1.2]]),
    half: curve([[-1.27, 0.16], [-1.2, 0.185], [-1.08, 0.17]]),
    sections: [{ z: 0, pts: [[0, 1], [0.5, 0.985], [0.85, 0.93], [1, 0.75], [1, 0.4], [1, 0]] }],
  }, tint(F.screen, '#56616b'));
  for (const s of [-1, 1]) {
    ctx.add('steer', rod([s * 0.1, 1.17, -1.26], [s * 0.12, 1.3, -1.15], 0.006, 0.006, 8), F.darkAlu);
    bladeIndicator(ctx, 'steer', [s * 0.17, 0.98, -1.35], [s * 0.2, 0.99, -1.36], 0.008);
  }
}

function tankAndShrouds(ctx: KitContext): void {
  buildTank(ctx, {
    front: -1.2,
    back: -0.78,
    top: 1.1,
    bottomFront: 0.92,
    bottomBack: 0.88,
    width: 0.36,
    style: 'adventure',
    knee: 0.1,
    capZ: -1.0,
    topLine: [[-1.2, 1.07], [-1.1, 1.095], [-0.98, 1.1], [-0.86, 1.08], [-0.8, 1.03], [-0.78, 0.98]],
    bottomLine: [[-1.2, 0.93], [-1.0, 0.9], [-0.78, 0.88]],
    halfLine: [[-1.2, 0.11], [-1.08, 0.15], [-0.95, 0.17], [-0.84, 0.15], [-0.78, 0.11]],
  });
  // Tall side shrouds (radiator covers) from the nose back to the knees.
  const shroud: OutlineBody = {
    zs: stationsBetween(-1.4, -0.8, 11, 0.4),
    top: curve([[-1.4, 0.98], [-1.3, 1.09], [-1.1, 1.115], [-0.95, 1.08], [-0.8, 1.0]]),
    bottom: curve([[-1.4, 0.8], [-1.3, 0.72], [-1.1, 0.66], [-0.92, 0.72], [-0.8, 0.8]]),
    half: curve([[-1.4, 0.16], [-1.3, 0.225], [-1.1, 0.25], [-0.95, 0.235], [-0.8, 0.2]]),
    sections: [{ z: 0, pts: [[0.6, 1], [0.84, 0.95], [0.97, 0.8], [1, 0.52], [0.97, 0.24], [0.9, 0]] }],
  };
  panelPair(ctx, shroud, PAINT, { creases: [2], depth: 0.012 });
  // Radiator slats in black below the shrouds, between the legs.
  grille(ctx, -1.25, 0.62, 0.84, 0.15, 6, 8, F.texturedBlack);
  // Lower black deflector flaps.
  for (const s of [-1, 1]) {
    const d: P2[] = smooth2([[-1.33, 0.76], [-1.15, 0.67], [-1.0, 0.65], [-0.96, 0.6], [-1.12, 0.57], [-1.3, 0.66]], 3, true);
    ctx.add('chassis', extrude(d, 0.012, { plane: 'zy', center: s * 0.255, bevel: 0.003, curveSegs: 1 }), BLACK_PL);
  }
}

function seatsAndTail(ctx: KitContext): void {
  buildSeat(ctx, { front: -0.92, back: -0.42, yFront: 0.9, y: 0.86, yBack: 0.885, width: 0.31, thick: 0.085, frontWidth: 0.2 });
  buildSeat(ctx, { front: -0.41, back: 0.1, yFront: 0.9, y: 0.93, yBack: 0.95, width: 0.28, thick: 0.08, frontWidth: 0.26 }, tint(seatFinish(ctx), '#1a1a1c'));
  // Body-coloured side covers under the seat, then the black plastic tail section.
  const cover: OutlineBody = {
    zs: stationsBetween(-0.66, -0.06, 9, 0.4),
    top: curve([[-0.66, 0.85], [-0.4, 0.865], [-0.06, 0.9]]),
    bottom: curve([[-0.66, 0.7], [-0.4, 0.69], [-0.06, 0.76]]),
    half: curve([[-0.66, 0.15], [-0.4, 0.15], [-0.06, 0.12]]),
    sections: [{ z: 0, pts: [[0.7, 1], [0.93, 0.92], [1, 0.62], [0.96, 0.25], [0.84, 0.0]] }],
  };
  panelPair(ctx, cover, PAINT, { depth: 0.01, q: 1 });
  const tail: OutlineBody = {
    zs: stationsBetween(-0.12, 0.31, 9, 0.4),
    top: curve([[-0.12, 0.895], [0.0, 0.9], [0.31, 0.92]]),
    bottom: curve([[-0.12, 0.75], [0.05, 0.8], [0.31, 0.86]]),
    half: curve([[-0.12, 0.12], [0.05, 0.1], [0.31, 0.065]]),
    sections: [{ z: 0, pts: [[0.55, 1], [0.92, 0.9], [1, 0.6], [0.95, 0.25], [0.8, 0.0]] }],
  };
  panelPair(ctx, tail, BLACK_PL, { depth: 0.008, q: 1 });
  // Alloy luggage rack with grab handles.
  ctx.add('chassis', roundBox(0.27, 0.014, 0.34, 0.01, 2), F.darkAlu, T(0, 0.965, 0.1));
  for (const s of [-1, 1]) {
    ovalTubeAlong(ctx, 'chassis', [[s * 0.11, 0.945, -0.32], [s * 0.145, 0.98, -0.28], [s * 0.15, 0.985, -0.1], [s * 0.15, 0.97, 0.14], [s * 0.115, 0.935, 0.26]], 0.009, 0.007, F.darkAlu);
    ctx.add('chassis', rod([s * 0.1, 0.9, -0.2], [s * 0.1, 0.965, -0.2], 0.009, 0.009, 8), F.darkAlu);
    ctx.add('chassis', rod([s * 0.1, 0.9, 0.2], [s * 0.1, 0.965, 0.2], 0.009, 0.009, 8), F.darkAlu);
  }
  // LED tail light and plate hanger.
  const tl: P2[] = smooth2([[-0.06, -0.018], [0.06, -0.018], [0.07, 0.016], [-0.07, 0.016]], 3, true);
  rearLamp(ctx, 'chassis', tl, [0, 0.89, 0.318], { kind: 'tail', inner: 'led', count: 3, depth: 0.028, lensSmoked: true }, -0.12);
  plateHanger(ctx, { fromZ: 0.02, fromY: 0.76 });
  hugger(ctx, F.texturedBlack, -0.15, 0.95);
}

function protection(ctx: KitContext): void {
  handGuards(ctx, { color: F.texturedBlack, outer: 0.055, h: 0.09 });
  // Bash plate under the engine.
  skidPlate(ctx, [[-1.18, 0.29], [-1.0, 0.255], [-0.7, 0.25], [-0.52, 0.28], [-0.55, 0.32], [-0.75, 0.31], [-1.0, 0.32], [-1.16, 0.36]], 0.14, F.darkAlu);
  // Crash bars: bent tube from the frame down round the cylinder head.
  const bar = hard('#26282c', 0.6, 0.4, 0.4);
  for (const s of [-1, 1]) {
    tubeAlong(ctx, 'chassis', [[s * 0.16, 0.8, -1.2], [s * 0.34, 0.66, -1.17], [s * 0.4, 0.5, -1.1], [s * 0.34, 0.36, -1.0], [s * 0.2, 0.3, -0.92]], 0.0125, bar);
  }
}

function body(ctx: KitContext): void {
  face(ctx);
  // High rally-style front fender.
  frontFender(ctx, { from: -0.95, to: 0.55, gap: 0.045, width: 0.12, f: PAINT });
  tankAndShrouds(ctx);
  seatsAndTail(ctx);
  protection(ctx);
}

const RED = '#c8102e';
const BLUE = '#1d3c8f';

function lettering(p: Pen, color: string, accent: string): void {
  if (p.view !== 'right' && p.view !== 'left') return;
  p.text('HONDA', -1.08, 1.0, { color, size: 0.036, weight: '900', spacing: 0.04 });
  p.text('AFRICA TWIN', -0.36, 0.79, { color: accent, size: 0.026, weight: '800', spacing: 0.05 });
}

function livery(c: LiveryCanvas, _lv: Livery, env: LiveryEnv): void {
  const tri = env.index === 0;
  c.views(ALL_VIEWS, (p) => {
    if (!tri) {
      // Matt black with red accents.
      p.fill('#141518', 'satin');
      if (p.view === 'right' || p.view === 'left') {
        p.poly([[-1.42, 0.97], [-1.25, 0.9], [-1.0, 0.8], [-0.82, 0.84], [-0.82, 0.88], [-1.0, 0.85], [-1.25, 0.96], [-1.42, 1.02]], '#2a2c30', 'metallic');
        p.poly([[-1.42, 0.78], [-1.2, 0.74], [-0.96, 0.7], [-0.82, 0.78], [-0.82, 0.8], [-0.96, 0.73], [-1.2, 0.77], [-1.42, 0.82]], RED, 'gloss');
        lettering(p, '#cfd2d6', RED);
        p.poly(arcBand(-1.56, 0.348, 0.37, 0.43, 0.2, 2.2), '#2a2c30', 'satin');
      }
      return;
    }
    // Tricolour: pearl white with Grand Prix Red and Dark Blue flashes.
    p.fill('#f3f3f1', 'pearl');
    if (p.view === 'right' || p.view === 'left') {
      // Shroud: a red wedge widening forwards, a blue band above it.
      p.poly([[-1.44, 0.74], [-1.2, 0.72], [-0.96, 0.68], [-0.8, 0.76], [-0.8, 0.84], [-1.0, 0.78], [-1.25, 0.86], [-1.44, 0.95]], RED, 'gloss');
      p.poly([[-1.44, 0.95], [-1.25, 0.86], [-1.0, 0.78], [-0.8, 0.84], [-0.8, 0.9], [-1.0, 0.85], [-1.25, 0.94], [-1.44, 1.02]], BLUE, 'metallic');
      // Side cover and tail: blue upper band over a thin red line.
      p.poly([[-0.66, 0.78], [-0.3, 0.8], [-0.06, 0.84], [-0.06, 0.9], [-0.66, 0.86]], BLUE, 'metallic');
      p.line([[-0.66, 0.765], [-0.3, 0.78], [-0.06, 0.82]], RED, 0.008);
      // Fender band: red tip with a blue stripe, wrapped round the wheel arch.
      p.poly(arcBand(-1.56, 0.348, 0.36, 0.43, -1.05, -0.4), RED, 'gloss');
      p.poly(arcBand(-1.56, 0.348, 0.36, 0.43, -0.4, 0.5), BLUE, 'metallic');
      lettering(p, '#ffffff', '#ffffff');
    } else if (p.view === 'top') {
      p.rect(-1.44, -0.014, -0.8, 0.014, RED);
      p.rect(-1.44, -0.04, -0.9, -0.022, BLUE);
      p.rect(-1.44, 0.022, -0.9, 0.04, BLUE);
      p.rect(-1.95, -0.02, -1.5, 0.02, RED);
    } else if (p.view === 'front') {
      p.rect(-0.016, 0.9, 0.016, 1.2, RED);
      p.rect(-0.04, 0.9, -0.026, 1.12, BLUE);
      p.rect(0.026, 0.9, 0.04, 1.12, BLUE);
    }
  });
}

export function africaTwinBlueprint(spec: BikeSpec): BikeBlueprint {
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.335, 0.96, 1.475],
    wheelbase: 1.56,
    rakeDeg: 27.5,
    trail: 0.113,
    forkLength: 0.84,
    front: { tyre: '90/90-21', rimWidthIn: 2.15, crown: 1.1, tread: 'dual', tyreLabel: 'Trail Radial' },
    rear: { tyre: '150/70R18', rimWidthIn: 4.0, crown: 1.1, tread: 'dual', tyreLabel: 'Trail Radial' },
    frontWheel: { type: 'wire', spokes: 36, shape: 'straight', color: '#c9ccd2', crossSpoke: true, rimColor: '#1b1c1f' },
    rearWheel: { type: 'wire', spokes: 36, shape: 'straight', color: '#c9ccd2', crossSpoke: true, rimColor: '#1b1c1f' },
    fork: { type: 'usd', stanchion: 0.045, spacing: 0.2, outerColor: '#1b1c1f', innerColor: '#c9ccd2', footColor: '#2a2c30', capColor: '#2a2c30', aboveClamp: 0.01, clampGap: 0.2, label: 'SHOWA', labelColor: '#d6d8dc' },
    frontBrake: { discs: 2, discDia: 0.31, disc: 'floating', carrierColor: '#2a2c30', caliper: 'radial4', caliperColor: '#2a2c30', caliperAngleDeg: 76 },
    rearBrake: { discs: 1, discDia: 0.256, disc: 'fixed', carrierColor: '#2a2c30', caliper: 'axial1', caliperColor: '#2a2c30', caliperAngleDeg: 205 },
    frame: { type: 'cradle', color: '#1f2024', metal: 0.4, rough: 0.45, subframe: 'cast', subframeColor: '#2a2c30', width: 0.3 },
    swingarm: { type: 'braced', length: 0.6, angleDeg: 6, color: '#9aa0a7', metal: 0.85, rough: 0.4 },
    shock: { layout: 'mono', springColor: '#c8102e', bodyColor: '#2a2c30', reservoir: true },
    drive: { type: 'chain', side: 'left', frontTeeth: 16, rearTeeth: 44, pitch: 0.015875, sprocketColor: '#2a2c30' },
    engine: {
      layout: 'P2_270',
      cc: 1084,
      crank: [0, 0.38, -0.87],
      tiltDeg: 15,
      caseColor: '#2e3035',
      coverColor: '#9aa0a7',
      headColor: '#2c2e33',
      camCoverColor: '#1d1e21',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.26, h: 0.24, z: -1.22, y: 0.73, tiltDeg: 8 },
      width: 0.34,
    },
    exhaust: { route: 'sideCan', side: 'right', can: 'oval', canLength: 0.46, canDia: 0.17, canFinish: 'black', headerFinish: 'steel', outlet: [0.2, 0.6, 0.14] },
    cockpit: {
      bars: 'tubular',
      grip: [0.41, 1.2, -1.04],
      barDia: 0.0254,
      dash: 'tft',
      dashPos: [0, 1.215, -1.13],
      dashSize: [0.14, 0.085],
      dashTiltDeg: 38,
      dashMount: 'bars',
      mirrors: 'bar',
      mirrorPos: [0.36, 1.33, -1.0],
      mirrorSize: [0.12, 0.08],
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
    lights: { head: 'angular', tail: 'compact', rearIndicators: 'stalk' },
    seat: { height: 0.85, front: -0.9, back: -0.42, pillion: 'seat', color: '#141414' },
    rider: { hip: [0, 0.96, -0.62], peg: [0.23, 0.42, -0.64], torsoPitch: 0.2 },
    footrests: 'peg',
    plate: { mount: 'hanger', pos: [0, 0.62, 0.34], tiltDeg: -14 },
    body,
    livery,
    groundClearance: 0.245,
    features: ['crashbars', 'windscreenTall'],
    zones: { splitY: 0.55, decal: [-1.1, 0.92] },
  };
}
