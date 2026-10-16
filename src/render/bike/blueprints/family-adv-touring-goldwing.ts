import type { BikeSpec, Livery } from '../../../data/bikes';
import { T, type KitContext } from '../context';
import { buildSeat, frontFender, PAINT, screen, seatFinish } from '../kit/body';
import { hugger, plateHanger } from '../kit/rear';
import { curve, stationsBetween, type OutlineBody } from '../kit/shape';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv, type Pen } from '../livery';
import { extrude, lathe, roundBox, rod, smooth2, sweep, type P2 } from '../mesh';
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
  ovalCan,
  panelPair,
  rearLamp,
  strip,
  tubeAlong,
} from './family-adv-touring-parts';

/**
 * Honda Gold Wing Tour (GL1800, 2018–2024).
 * Spec sheet: wheelbase 1695 mm, rake 30.5°, trail 109 mm, seat 745 mm, L×W×H ≈ 2475 × 925 × 1430 mm,
 * 130/70R18 + 200/55R16 on cast wheels, double-wishbone front (single central shock), Pro-Link
 * single-sided swingarm with shaft drive, twin 320 mm front discs, 1833 cc SOHC flat-six
 * (cylinder heads stick out either side ahead of the rider's boots), integral top trunk and saddlebags.
 * Design cues: huge frame-mounted fairing with two slim LED headlights and a tall electric screen,
 * side vents and mirrors with indicators, big painted lower cowls, long full fender, floorboards,
 * a very low seat with a pillion backrest in the trunk, long saddlebags with LED tail strips.
 */

const SAT_BLACK = F.satinBlack;
const CHROME = F.chrome;

function nose(): OutlineBody {
  return {
    zs: stationsBetween(-1.88, -1.06, 14, 0.4),
    top: curve([[-1.88, 0.86], [-1.84, 0.95], [-1.75, 1.015], [-1.6, 1.06], [-1.42, 1.08], [-1.24, 1.07], [-1.06, 1.04]]),
    bottom: curve([[-1.88, 0.8], [-1.82, 0.73], [-1.68, 0.65], [-1.5, 0.6], [-1.3, 0.58], [-1.14, 0.6], [-1.06, 0.66]]),
    half: curve([[-1.88, 0.07], [-1.83, 0.22], [-1.72, 0.315], [-1.56, 0.365], [-1.4, 0.39], [-1.22, 0.37], [-1.06, 0.31]]),
    sections: [{ z: 0, pts: [[0, 1], [0.45, 0.99], [0.82, 0.93], [0.97, 0.78], [1, 0.56], [0.97, 0.3], [0.9, 0.1], [0.8, 0]] }],
  };
}

function fairing(ctx: KitContext): void {
  // Painted upper fairing, with the two headlight windows cut into the nose.
  const window = frontRegion([[0.06, 0.87], [0.3, 0.9], [0.31, 0.99], [0.06, 0.98]]);
  const opening = planRegion([[-1.36, 0], [-1.36, 0.16], [-1.2, 0.19], [-1.1, 0.17], [-1.1, 0]]);
  const lampCut = fAnd(window, (_x, _y, z) => -1.68 - z);
  const cockpitCut = fAnd(opening, (_x, y) => y - 0.96);
  loftPart(ctx, nose(), PAINT, { capFront: true, depth: 0.012, q: 1.7, creases: [3], region: fNot(fOr(lampCut, cockpitCut)) });
  // Cockpit tub behind the screen: black well with the dash sitting in it.
  ctx.add('chassis', roundBox(0.38, 0.012, 0.3, 0.01, 2), F.texturedBlack, T(0, 0.955, -1.23));
  // Twin LED headlights: slim lozenges, each with two LED segments and a DRL line above.
  for (const s of [-1, 1]) {
    const lampOutline: P2[] = smooth2([[s * 0.07, -0.036], [s * 0.2, -0.032], [s * 0.245, 0.0], [s * 0.2, 0.034], [s * 0.085, 0.04]], 2, true);
    frontLamp(ctx, 'chassis', lampOutline, [0, 0.93, -1.725], { kind: 'head', inner: 'led', count: 2, depth: 0.05, rim: 0.005, housing: F.black }, 0.12);
    strip(ctx, 'chassis', [[s * 0.07, 0.982, -1.72], [s * 0.19, 0.985, -1.71], [s * 0.27, 0.965, -1.68]], 0.009, 0.005, 'drl', [0, 0, -1]);
  }
  // Chrome wing badge between the lamps and a chrome nose bar.
  ctx.add('chassis', roundBox(0.07, 0.02, 0.012, 0.006), CHROME, T(0, 0.945, -1.838));
  // Lower air intakes (black grille) under the nose, left and right of the wheel opening.
  grille(ctx, -1.64, 0.7, 0.8, 0.2, 4, 10, F.texturedBlack);
  // Electric windscreen: tall, tinted, on chrome stays.
  screen(ctx, 'chassis', {
    zs: stationsBetween(-1.56, -1.24, 9, 0.3),
    top: curve([[-1.56, 1.06], [-1.5, 1.2], [-1.4, 1.32], [-1.3, 1.395], [-1.24, 1.42]]),
    bottom: curve([[-1.56, 1.05], [-1.24, 1.07]]),
    half: curve([[-1.56, 0.21], [-1.45, 0.285], [-1.34, 0.3], [-1.24, 0.27]]),
    sections: [{ z: 0, pts: [[0, 1], [0.5, 0.985], [0.85, 0.93], [1, 0.75], [1, 0.4], [1, 0]] }],
  }, tint(F.screen, '#4b565f'));
  for (const s of [-1, 1]) {
    ctx.add('chassis', rod([s * 0.26, 1.075, -1.5], [s * 0.285, 1.2, -1.36], 0.007, 0.007, 8), CHROME);
    ctx.add('chassis', roundBox(0.55, 0.012, 0.014, 0.004), CHROME, T(0, 1.075, -1.5));
  }
  // Side vent slats (black) and chrome trim lines on the fairing flanks.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      ctx.add('chassis', roundBox(0.01, 0.014, 0.1, 0.003, 1), F.black, T(s * 0.372, 0.9 - i * 0.027, -1.36 + i * 0.008));
    }
    tubeAlong(ctx, 'chassis', [[s * 0.33, 0.7, -1.72], [s * 0.388, 0.8, -1.5], [s * 0.395, 0.82, -1.3], [s * 0.34, 0.8, -1.1]], 0.004, CHROME);
  }
  // Mirror-integrated indicators come from the kit; add front corner indicators low on the nose.
  for (const s of [-1, 1]) bladeIndicator(ctx, 'chassis', [s * 0.3, 0.84, -1.74], [s * 0.33, 0.85, -1.74], 0.009);
}

function lowers(ctx: KitContext): void {
  // Painted lower cowls flanking the engine and the front wheel (leg shields).
  const cowl: OutlineBody = {
    zs: stationsBetween(-1.56, -0.82, 12, 0.4),
    top: curve([[-1.56, 0.7], [-1.4, 0.66], [-1.2, 0.64], [-1.0, 0.66], [-0.82, 0.62]]),
    bottom: curve([[-1.56, 0.5], [-1.4, 0.4], [-1.2, 0.33], [-1.0, 0.3], [-0.82, 0.32]]),
    half: curve([[-1.56, 0.17], [-1.42, 0.3], [-1.2, 0.37], [-1.0, 0.36], [-0.82, 0.3]]),
    sections: [{ z: 0, pts: [[0.55, 1], [0.86, 0.96], [0.98, 0.8], [1, 0.52], [0.96, 0.24], [0.86, 0]] }],
  };
  panelPair(ctx, cowl, PAINT, { creases: [2], depth: 0.012 });
  // Centre console / tank cover between the cockpit and the rider's seat.
  const console_: OutlineBody = {
    zs: stationsBetween(-1.14, -0.84, 8, 0.4),
    top: curve([[-1.14, 0.86], [-1.0, 0.845], [-0.84, 0.8]]),
    bottom: curve([[-1.14, 0.6], [-0.84, 0.6]]),
    half: curve([[-1.14, 0.17], [-1.0, 0.16], [-0.84, 0.15]]),
    sections: [{ z: 0, pts: [[0, 1], [0.55, 0.985], [0.9, 0.9], [1, 0.62], [0.95, 0.25], [0.8, 0.0]] }],
  };
  loftPart(ctx, console_, PAINT, { depth: 0.01, capBack: true });
}

function frontEnd(ctx: KitContext): void {
  // Full-length painted front fender with a chrome trim strip.
  frontFender(ctx, { from: -1.18, to: 0.95, gap: 0.03, width: 0.17, f: PAINT });
  // Double-wishbone: lower and upper arms from the wheel knuckle back to the engine, one central shock.
  const A = ctx.hp.frontAxle;
  const arm = hard('#2a2c30', 0.7, 0.4, 0.4);
  for (const s of [-1, 1]) {
    tubeAlong(ctx, 'chassis', [[s * 0.1, A[1] + 0.2, A[2] + 0.12], [s * 0.13, A[1] + 0.2, A[2] + 0.36], [s * 0.15, 0.55, -1.2]], 0.014, arm);
    tubeAlong(ctx, 'chassis', [[s * 0.1, A[1] + 0.42, A[2] + 0.2], [s * 0.13, A[1] + 0.46, A[2] + 0.4], [s * 0.15, 0.8, -1.24]], 0.012, arm);
  }
  ctx.add('chassis', rod([0, 0.62, -1.46], [0, 0.82, -1.4], 0.02, 0.02, 12), hard('#c9ccd2', 1, 0.2));
}

function seatsAndRear(ctx: KitContext): void {
  buildSeat(ctx, { front: -0.9, back: -0.44, yFront: 0.775, y: 0.745, yBack: 0.78, width: 0.36, thick: 0.1, frontWidth: 0.2 });
  buildSeat(ctx, { front: -0.43, back: -0.1, yFront: 0.78, y: 0.8, yBack: 0.82, width: 0.34, thick: 0.08, frontWidth: 0.3 }, tint(seatFinish(ctx), '#1a1a1c'));
  // Top trunk with the pillion backrest on its front face.
  luggageCase(ctx, {
    front: -0.12,
    back: 0.46,
    x: 0,
    half: 0.215,
    top: [[-0.12, 1.02], [0.0, 1.085], [0.2, 1.11], [0.42, 1.07], [0.46, 1.0]],
    bottom: [[-0.12, 0.84], [0.0, 0.8], [0.4, 0.78], [0.46, 0.8]],
    plan: [[-0.12, 0.8], [0.0, 0.96], [0.36, 1], [0.46, 0.82]],
    f: PAINT,
    trim: SAT_BLACK,
    seam: 0.24,
    latches: 0,
  }, 0);
  ctx.add('chassis', roundBox(0.3, 0.15, 0.05, 0.024, 3), tint(seatFinish(ctx), '#1b1b1d'), T(0, 0.9, -0.115));
  // Saddlebags (integral, long, rounded) and LED strips round their tails.
  for (const s of [-1, 1] as const) {
    luggageCase(ctx, {
      front: -0.46,
      back: 0.47,
      x: 0.355,
      half: 0.13,
      top: [[-0.46, 0.7], [-0.36, 0.77], [-0.1, 0.8], [0.3, 0.795], [0.44, 0.76], [0.47, 0.7]],
      bottom: [[-0.46, 0.5], [-0.36, 0.38], [-0.1, 0.33], [0.3, 0.33], [0.44, 0.38], [0.47, 0.48]],
      plan: [[-0.46, 0.55], [-0.35, 0.92], [0.0, 1], [0.4, 0.95], [0.47, 0.6]],
      f: PAINT,
      trim: SAT_BLACK,
      seam: 0.2,
      latches: 0,
    }, s);
    strip(ctx, 'chassis', [[s * 0.42, 0.74, 0.46], [s * 0.36, 0.755, 0.485], [s * 0.3, 0.74, 0.47]], 0.012, 0.006, 'tail', [0, 1, 0]);
    // Muffler under each bag: black body, fat chrome tip sticking out behind the bag.
    ovalCan(ctx, [s * 0.3, 0.29, -0.5], [s * 0.3, 0.29, 0.46], 0.052, 0.046, F.satinBlack);
    ctx.add('chassis', lathe([[0.04, 0], [0.047, 0.004], [0.047, 0.07], [0.04, 0.07]], { segs: ctx.seg(24, 8), axis: 'z' }), CHROME, T(s * 0.3, 0.29, 0.46));
    ctx.add('chassis', lathe([[0.0, 0.0], [0.04, 0.0], [0.04, 0.001], [0.0, 0.001]], { segs: ctx.seg(24, 8), axis: 'z' }), hard('#0a0a0a', 0, 0.9), T(s * 0.3, 0.29, 0.532));
  }
  // Tail strip across the trunk and brake light.
  const tl: P2[] = smooth2([[-0.15, -0.012], [0.15, -0.012], [0.16, 0.012], [-0.16, 0.012]], 3, true);
  rearLamp(ctx, 'chassis', tl, [0, 1.0, 0.463], { kind: 'tail', inner: 'led', count: 3, depth: 0.02, lensSmoked: true }, -0.1);
  strip(ctx, 'chassis', [[-0.2, 0.98, 0.447], [0, 0.99, 0.47], [0.2, 0.98, 0.447]], 0.01, 0.005, 'tail', [0, 1, 0]);
  plateHanger(ctx, { fromZ: 0.2, fromY: 0.7 });
  hugger(ctx, F.texturedBlack, -0.15, 0.9);
  void sweep;
  void extrude;
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
  p.text('GOLD WING', -0.05, 0.64, { color, size: 0.04, weight: '800', spacing: 0.06 });
  p.text('HONDA', -1.3, 0.74, { color, size: 0.03, weight: '900', spacing: 0.06 });
}

function livery(c: LiveryCanvas, _lv: Livery, env: LiveryEnv): void {
  const white = env.index === 0;
  const main = white ? '#f2f2f0' : '#9d1020';
  c.views(ALL_VIEWS, (p) => {
    p.fill(main, white ? 'pearl' : 'metallic');
    if (p.view === 'right' || p.view === 'left') {
      // Black lower cowl and bag/trunk lower band; thin chrome pin-stripe above them.
      p.poly([[-1.62, 0.52], [-1.4, 0.4], [-1.2, 0.33], [-0.8, 0.3], [-0.8, 0.45], [-1.2, 0.46], [-1.5, 0.58]], '#1b1c1f', 'satin');
      p.poly([[-0.46, 0.3], [0.47, 0.3], [0.47, 0.44], [-0.46, 0.44]], '#1b1c1f', 'satin');
      p.line([[-1.84, 0.8], [-1.5, 0.76], [-1.2, 0.78], [-1.06, 0.74]], '#c4c7cc', 0.006, 'chrome');
      p.line([[-0.46, 0.64], [-0.1, 0.7], [0.47, 0.66]], '#c4c7cc', 0.006, 'chrome');
      p.poly(arcBand(-1.695, 0.3196, 0.33, 0.37, -0.4, 1.8), main, 'gloss');
      lettering(p, white ? '#8a6a2a' : '#d8c27a');
    }
  });
}

export function goldWingBlueprint(spec: BikeSpec): BikeBlueprint {
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.475, 0.925, 1.43],
    wheelbase: 1.695,
    rakeDeg: 30.5,
    trail: 0.109,
    forkLength: 0.74,
    front: { tyre: '130/70R18', rimWidthIn: 3.5, crown: 1.15, tread: 'cruiser', tyreLabel: 'Tour Radial' },
    rear: { tyre: '200/55R16', rimWidthIn: 5.5, crown: 1.2, tread: 'cruiser', tyreLabel: 'Tour Radial' },
    frontWheel: { type: 'cast', spokes: 10, shape: 'split', color: '#1b1c1f', machinedLip: true },
    rearWheel: { type: 'cast', spokes: 10, shape: 'split', color: '#1b1c1f', machinedLip: true },
    fork: { type: 'rwu', stanchion: 0.043, spacing: 0.25, outerColor: '#1b1c1f', innerColor: '#c9ccd2', footColor: '#1b1c1f', capColor: '#1b1c1f', aboveClamp: 0.0, clampGap: 0.2 },
    frontBrake: { discs: 2, discDia: 0.32, disc: 'floating', carrierColor: '#2a2c30', caliper: 'radial4', caliperColor: '#2a2c30', caliperAngleDeg: 70 },
    rearBrake: { discs: 1, discDia: 0.316, disc: 'fixed', carrierColor: '#2a2c30', caliper: 'axial2', caliperColor: '#2a2c30', caliperAngleDeg: 200 },
    frame: { type: 'cradle', color: '#2a2c30', metal: 0.5, rough: 0.45, subframe: 'cast', subframeColor: '#2a2c30', width: 0.34 },
    swingarm: { type: 'shaft', length: 0.66, angleDeg: 4, side: 'right', color: '#9aa0a7', metal: 0.85, rough: 0.4 },
    shock: { layout: 'mono', springColor: '#2a2c30', bodyColor: '#2a2c30', reservoir: false },
    drive: { type: 'shaft', side: 'right', frontTeeth: 1, rearTeeth: 1, sprocketColor: '#2a2c30' },
    engine: {
      layout: 'F6',
      cc: 1833,
      crank: [0, 0.45, -0.98],
      tiltDeg: 0,
      caseColor: '#222428',
      coverColor: '#9aa0a7',
      headColor: '#222428',
      camCoverColor: '#9aa0a7',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.24, h: 0.26, z: -1.4, y: 0.52, tiltDeg: 12, side: true },
      width: 0.4,
    },
    exhaust: { route: 'none', side: 'both', can: 'round', canLength: 0.6, canDia: 0.085, canFinish: 'black', headerFinish: 'steel' },
    cockpit: {
      bars: 'tall',
      grip: [0.37, 1.03, -1.02],
      barDia: 0.0254,
      dash: 'tftWide',
      dashPos: [0, 1.06, -1.22],
      dashSize: [0.17, 0.1],
      dashTiltDeg: 50,
      dashMount: 'fairing',
      mirrors: 'fairing',
      mirrorPos: [0.4, 1.06, -1.4],
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
    seat: { height: 0.745, front: -0.9, back: -0.44, pillion: 'seat', color: '#141414' },
    rider: { hip: [0, 0.83, -0.62], peg: [0.31, 0.28, -0.78], torsoPitch: -0.04 },
    footrests: 'floorboard',
    plate: { mount: 'body', pos: [0, 0.62, 0.49], tiltDeg: -4 },
    body,
    livery,
    groundClearance: 0.13,
    features: ['panniers', 'topcase'],
    zones: { splitY: 0.45, decal: [-1.3, 0.8] },
  };
}
