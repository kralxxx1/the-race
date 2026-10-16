import * as THREE from 'three';
import type { BikeSpec, Livery } from '../../../data/bikes';
import type { KitContext } from '../context';
import { computeHardpoints } from '../hardpoints';
import { addPanel, buildSeat, buildTank, frontFender, PAINT, seatFinish } from '../kit/body';
import { can, collector, headers, heatPipe } from '../kit/jp-sport-exhaust';
import { tailLamp, undertray } from '../kit/jp-sport-parts';
import { hugger, plateHanger } from '../kit/rear';
import { curve, outlineLoft, stationsBetween, type OutlineBody } from '../kit/shape';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv, type Pen } from '../livery';
import { roundBox, smooth2, type P2, type P3 } from '../mesh';
import { F, hard, tint, vary } from '../sink';
import { fAnd, fNot, fOr, planRegion, sideRegion, type Field } from '../surface';
import type { BikeBlueprint } from '../types';
import { bladeIndicator, drlArc, forkBrackets, loftPart, mirrorOutline, panelPair, sideCovers, squircle, steerLamp, steerMat, steerToBike } from './family-eu-naked-2-parts';

/**
 * Triumph Speed Triple 1200 RS (2021+).
 * Spec sheet: wheelbase 1455 mm, rake 23.5°, trail 93 mm, seat 830 mm, 120/70ZR17 +
 * 190/55ZR17, 43 mm Öhlins NIX30 USD fork, Brembo Stylema radial calipers on twin 320 mm
 * discs, Öhlins TTX36 shock, aluminium twin-spar frame, single-sided aluminium swingarm,
 * 1160 cc inline triple (cylinders inclined ~20° forward).
 * Design cues: the twin "bug-eye" LED headlights hung low on the fork under a black mask
 * with a tiny flyscreen, a tall muscular tank with big airbox shrouds, the three headers
 * dropping in front of the engine, and a *stacked pair* of short silencers tucked up on
 * the right under the short, sharp tail.
 */

// ───────────────────────────── bodywork ─────────────────────────────

/** Fork-mounted face: black mask, twin bug-eye LED lamps with DRL rings, smoked flyscreen. */
function face(ctx: KitContext): void {
  const black = hard('#141519', 0.2, 0.4, 0.7);
  // Mask: a shallow dark trapezoid shell between the lamps and the fork.
  const mask: OutlineBody = {
    zs: stationsBetween(-0.16, -0.065, 6, 0.3),
    top: curve([[-0.16, -0.012], [-0.12, 0.014], [-0.065, 0.034]]),
    bottom: curve([[-0.16, -0.158], [-0.12, -0.185], [-0.065, -0.205]]),
    half: curve([[-0.16, 0.152], [-0.12, 0.15], [-0.065, 0.124]]),
    sections: [{ z: 0, pts: [[0, 1], [0.55, 0.99], [0.9, 0.88], [1, 0.6], [0.92, 0.2], [0.6, 0.02], [0, 0]] }],
  };
  loftPart(ctx, mask, black, { steer: true, capFront: true, capBack: true, depth: 0.006 });
  // Twin bug-eye lamps: fat squircles, outer-lower corner chamfered.
  const lampOutline = (s: number): P2[] => {
    const base = squircle(0.122, 0.112, 3.2, 30).map(([x, y]) => {
      // pull the lower inner corner in and the upper outer corner out a touch (pod shape)
      const k = y < -0.01 && x * s < 0 ? 0.93 : 1;
      return [x * k, y] as P2;
    });
    return s > 0 ? base : mirrorOutline(base);
  };
  for (const s of [-1, 1]) {
    const x = s * 0.0885, y = -0.082, z = -0.2;
    // Lamp-local x is flipped by the 180° turn about Y, so author with -s then it lands on the right side.
    steerLamp(ctx, mirrorOutline(lampOutline(s)), [x, y, z], { kind: 'head', inner: 'projector', count: 1, depth: 0.07, rim: 0.0055 }, 0.0, 0.0, s * -0.05);
    // DRL: a light-guide ring hugging the upper edge of each lens plus a lower outer tick.
    drlArc(ctx, x, y, z - 0.0035, 0.049, s > 0 ? 0.2 : Math.PI - 2.9, s > 0 ? 2.95 : Math.PI - 0.2, 0.0065, 0.004, 'drl', 0.045);
    // Front indicator pod low on the outer side.
    bladeIndicator(ctx, 'steer', steerToBikeLocal(ctx, [s * 0.138, -0.135, -0.15]), steerToBikeLocal(ctx, [s * 0.15, -0.14, -0.16]), 0.0075);
  }
  forkBrackets(ctx, [-0.07, -0.15], -0.15, 0.065);
  // Smoked flyscreen on the mask: a small, steeply raked visor.
  const visor: OutlineBody = {
    zs: stationsBetween(-0.16, -0.075, 6, 0.4),
    top: curve([[-0.16, 0.026], [-0.125, 0.082], [-0.075, 0.13]]),
    bottom: curve([[-0.16, 0.022], [-0.125, 0.07], [-0.075, 0.12]]),
    half: curve([[-0.16, 0.1], [-0.12, 0.092], [-0.075, 0.076]]),
    sections: [{ z: 0, pts: [[0, 1], [0.5, 0.985], [0.85, 0.9], [1, 0.4], [1, 0]] }],
  };
  const vm = outlineLoft(visor, { su: ctx.seg(8, 3), sv: ctx.seg(4, 2) });
  vm.transform(ctx.steerM);
  ctx.add('steer', vm, tint(F.screen, '#3a424c'));
  void steerMat;
}

/** Steering-local → bike-space point helper. */
function steerToBikeLocal(ctx: KitContext, p: P3): P3 {
  return ctx.fromSteer(p);
}

/** Big airbox / radiator shrouds flanking the front of the tank. */
function shroud(): OutlineBody {
  return {
    zs: stationsBetween(-1.215, -0.8, 11, 0.4),
    top: curve([[-1.215, 0.9], [-1.15, 0.945], [-1.07, 0.985], [-0.97, 1.0], [-0.88, 0.985], [-0.8, 0.935]]),
    bottom: curve([[-1.215, 0.77], [-1.16, 0.7], [-1.08, 0.66], [-0.98, 0.655], [-0.9, 0.69], [-0.83, 0.75], [-0.8, 0.8]]),
    half: curve([[-1.215, 0.148], [-1.16, 0.205], [-1.07, 0.238], [-0.97, 0.243], [-0.88, 0.225], [-0.8, 0.19]]),
    sections: [
      { z: -1.215, pts: [[0.6, 1], [0.84, 0.95], [0.97, 0.78], [1, 0.5], [0.96, 0.22], [0.86, 0]] },
      { z: -0.8, pts: [[0.55, 1], [0.8, 0.96], [0.95, 0.8], [1, 0.55], [0.98, 0.26], [0.9, 0]] },
    ],
  };
}

/** Black duct liner visible in the shroud mouth. */
function scoop(): OutlineBody {
  return {
    zs: stationsBetween(-1.2, -0.9, 8, 0.4),
    top: curve([[-1.2, 0.8], [-1.1, 0.8], [-0.9, 0.78]]),
    bottom: curve([[-1.2, 0.7], [-1.1, 0.63], [-1.0, 0.62], [-0.9, 0.65]]),
    half: curve([[-1.2, 0.14], [-1.12, 0.215], [-1.0, 0.236], [-0.9, 0.215]]),
    sections: [{ z: 0, pts: [[0.7, 1], [0.92, 0.9], [1, 0.62], [0.98, 0.3], [0.9, 0]] }],
  };
}

/** Short, sharp tail unit: kicked up at the back, ending in a point. */
function tailBody(): OutlineBody {
  return {
    zs: stationsBetween(-0.66, 0.17, 13, 0.5),
    top: curve([[-0.66, 0.805], [-0.46, 0.82], [-0.3, 0.855], [-0.2, 0.915], [-0.05, 0.955], [0.08, 0.972], [0.17, 0.985]]),
    bottom: curve([[-0.66, 0.67], [-0.4, 0.7], [-0.18, 0.775], [-0.02, 0.86], [0.1, 0.925], [0.17, 0.96]]),
    half: curve([[-0.66, 0.145], [-0.46, 0.138], [-0.24, 0.115], [-0.04, 0.082], [0.17, 0.028]]),
    sections: [
      { z: -0.66, pts: [[0, 1], [0.6, 0.98], [0.95, 0.84], [1, 0.55], [0.93, 0.22], [0.6, 0.02], [0, 0]] },
      { z: 0.17, pts: [[0, 1], [0.74, 0.97], [1, 0.72], [0.98, 0.44], [0.84, 0.2], [0.42, 0.02], [0, 0]] },
    ],
  };
}

function body(ctx: KitContext): void {
  const dark = hard('#1b1c1f', 0.2, 0.42, 0.7);
  face(ctx);
  // Shrouds with their air scoops.
  const sh = shroud();
  const mouth: Field = sideRegion(smooth2([[-1.23, 0.88], [-1.15, 0.85], [-1.09, 0.76], [-1.17, 0.7], [-1.23, 0.74]], 2, true));
  panelPair(ctx, sh, PAINT, { region: fNot(mouth), creases: [2], depth: 0.01 });
  panelPair(ctx, scoop(), F.texturedBlack, { depth: 0.008, q: 1 });
  // Tank.
  buildTank(ctx, {
    front: -1.17,
    back: -0.62,
    top: 1.08,
    bottomFront: 0.86,
    bottomBack: 0.83,
    width: 0.36,
    style: 'muscle',
    knee: 0.16,
    capZ: -0.94,
    topLine: [[-1.17, 0.985], [-1.1, 1.025], [-1.0, 1.062], [-0.9, 1.077], [-0.8, 1.07], [-0.72, 1.04], [-0.66, 0.995], [-0.62, 0.95]],
    bottomLine: [[-1.17, 0.88], [-0.95, 0.835], [-0.62, 0.84]],
    halfLine: [[-1.17, 0.07], [-1.1, 0.125], [-1.0, 0.163], [-0.9, 0.172], [-0.8, 0.16], [-0.7, 0.12], [-0.62, 0.085]],
  });
  // Seat, pillion pad, tail.
  buildSeat(ctx, { front: -0.67, back: -0.31, yFront: 0.835, y: 0.826, yBack: 0.852, width: 0.3, thick: 0.075, frontWidth: 0.17 });
  buildSeat(ctx, { front: -0.295, back: -0.04, yFront: 0.9, y: 0.91, yBack: 0.935, width: 0.2, thick: 0.05, frontWidth: 0.15 }, tint(seatFinish(ctx), '#18191b'));
  const tm = outlineLoft(tailBody(), { su: ctx.seg(12, 4), sv: ctx.seg(6, 2), capBack: true });
  const seatHole: Field = fAnd(
    fOr(sideRegion([[-0.85, 0.8], [-0.3, 0.8], [-0.3, 1.4], [-0.85, 1.4]]), sideRegion([[-0.29, 0.885], [-0.03, 0.885], [-0.03, 1.4], [-0.29, 1.4]])),
    planRegion([[-0.85, -0.01], [-0.02, -0.01], [-0.02, 0.105], [-0.29, 0.105], [-0.3, 0.15], [-0.85, 0.15]]),
  );
  addPanel(ctx, 'chassis', tm, fNot(seatHole), PAINT, 0.0025, 0.012);
  undertray(ctx, { z0: -0.5, z1: 0.14, top0: 0.72, top1: 0.955, bot0: 0.68, botMid: 0.74, bot1: 0.935, w0: 0.125, w1: 0.03 });
  tailLamp(ctx, smooth2([[-0.058, -0.006], [0.058, -0.006], [0.064, 0.004], [0.0, 0.011], [-0.064, 0.004]], 4, true), [0, 0.95, 0.125], -0.78, { count: 1 });
  sideCovers(ctx, [[-0.66, 0.79], [-0.44, 0.78], [-0.4, 0.68], [-0.58, 0.63], [-0.67, 0.7]], 0.132, dark);
  // Carbon front mudguard (RS), black rear hugger.
  frontFender(ctx, { from: -0.5, to: 0.86, gap: 0.02, width: 0.15, f: F.carbon });
  hugger(ctx, F.texturedBlack);
  plateHanger(ctx, { fromZ: -0.02, fromY: 0.8 });
  exhaust(ctx);
}

// ───────────────────────────── exhaust ─────────────────────────────

/**
 * 3-into-1 headers dropping in front of the engine into a collector under it, a
 * catalyser box in the belly, then a pipe up the right side to the stacked twin silencers.
 */
function exhaust(ctx: KitContext): void {
  const c = ctx.bp.engine.crank;
  const zf = c[2] - 0.255;
  headers(ctx, {
    r: 0.0195,
    heat: 'steel',
    tEnd: 0.7,
    route: (_i, p) => {
      const x = p.pos[0];
      return [
        [x * 1.04, 0.5, zf],
        [x * 0.8, 0.31, zf + 0.012],
        [x * 0.45, 0.2, zf + 0.1],
        [0.015, 0.175, c[2] - 0.09],
      ];
    },
  });
  collector(ctx, [0.015, 0.175, c[2] - 0.075], 0.04, 0.12, 'steel', 0.65);
  // Belly catalyser box under the crankcase.
  const box = hard('#1a1b1e', 0.4, 0.45, 0.3);
  ctx.add('chassis', roundBox(0.2, 0.09, 0.3, 0.04, ctx.micro ? 3 : 2), box, new THREE.Matrix4().makeTranslation(0.02, 0.17, c[2] + 0.1));
  // Link pipe up the right side to the two cans.
  heatPipe(ctx, [[0.03, 0.17, c[2] + 0.2], [0.11, 0.2, c[2] + 0.38], [0.145, 0.33, -0.33], [0.15, 0.43, -0.3]], 0.025, 'steel', 0.6, 0.9);
  const capDark = hard('#18191b', 0.5, 0.4, 0.3);
  // Upper and lower can, both inclined up towards the tail and stacked on the right.
  const upper: [P3, P3] = [[0.14, 0.505, -0.32], [0.165, 0.585, 0.16]];
  const lower: [P3, P3] = [[0.135, 0.405, -0.3], [0.158, 0.475, 0.15]];
  for (const [a, b] of [upper, lower]) can(ctx, { a, b, shape: 'round', r0: 0.042, r1: 0.045, finish: vary(F.titanium, { color: [0.62, 0.61, 0.58] }), cap: capDark, outletR: 0.0215 });
  ctx.anchor('exhaustOutlet', upper[1]);
}

// ───────────────────────────── livery ─────────────────────────────

const RED = '#b5121b';

function lettering(p: Pen, main: string, accent: string): void {
  if (p.view !== 'right' && p.view !== 'left') return;
  p.text('TRIUMPH', -0.88, 0.955, { color: main, size: 0.03, weight: '900', spacing: 0.05, stretch: 1.0 });
  p.text('SPEED TRIPLE', -0.06, 0.9, { color: main, size: 0.021, weight: '800', italic: true, spacing: 0.03 });
  p.text('RS', -0.1, 0.93, { color: accent, size: 0.024, weight: '900', italic: true });
}

function livery(c: LiveryCanvas, lv: Livery, env: LiveryEnv): void {
  const black = env.index === 1;
  c.views(ALL_VIEWS, (p) => {
    p.fill(lv.primary, black ? 'gloss' : 'matte');
    if (p.view === 'right' || p.view === 'left') {
      // Black airbox shrouds and tail-unit flanks; a slim red blade under the tank edge.
      p.poly([[-1.3, 0.62], [-1.3, 0.93], [-1.12, 1.0], [-0.84, 0.97], [-0.8, 0.8], [-0.9, 0.66], [-1.08, 0.62]], black ? '#1e2024' : '#202226', 'satin');
      p.poly([[-0.67, 0.84], [-0.4, 0.83], [-0.25, 0.9], [0.0, 0.95], [0.2, 0.99], [0.2, 0.66], [-0.66, 0.66]], black ? '#1e2024' : lv.primary, black ? 'satin' : 'matte');
      p.line([[-1.0, 0.845], [-0.84, 0.826], [-0.66, 0.842]], RED, 0.006);
      p.line([[-0.36, 0.835], [-0.2, 0.9], [0.1, 0.96]], RED, 0.005);
      lettering(p, black ? '#d9dce0' : '#15161a', RED);
    } else if (p.view === 'top') {
      p.rect(-1.16, -0.03, -0.64, 0.03, '#15161a', 'satin');
    } else if (p.view === 'front') {
      p.rect(-1, 0.6, 1, 0.86, '#202226', 'satin');
    }
  });
}

// ───────────────────────────── blueprint ─────────────────────────────

export function speedTripleBlueprint(spec: BikeSpec): BikeBlueprint {
  const lv = spec.liveries[0];
  const bp: BikeBlueprint = {
    id: spec.id,
    source: 'authored',
    overall: [2.13, 0.81, 1.22],
    wheelbase: 1.455,
    rakeDeg: 23.5,
    trail: 0.093,
    forkLength: 0.75,
    front: { tyre: '120/70ZR17', rimWidthIn: 3.5, crown: 0.9, tread: 'sport', tyreLabel: 'Sport Radial' },
    rear: { tyre: '190/55ZR17', rimWidthIn: 6.0, crown: 0.95, tread: 'sport', tyreLabel: 'Sport Radial' },
    frontWheel: { type: 'cast', spokes: 5, shape: 'y', color: lv.wheel },
    rearWheel: { type: 'cast', spokes: 5, shape: 'y', color: lv.wheel },
    fork: { type: 'usd', stanchion: 0.043, spacing: 0.21, outerColor: '#17181b', innerColor: '#c9a65a', footColor: '#1b1c1f', capColor: '#2a2c30', adjusterColor: '#c99a2c', label: 'ÖHLINS', labelColor: '#c9a65a', aboveClamp: 0.01, clampGap: 0.2 },
    frontBrake: { discs: 2, discDia: 0.32, disc: 'floating', carrierColor: '#2b2d31', caliper: 'radialMono4', caliperColor: '#25272b', caliperText: 'brembo', caliperTextColor: '#f2f2f2', caliperAngleDeg: 76 },
    rearBrake: { discs: 1, discDia: 0.22, disc: 'fixed', carrierColor: '#2b2d31', caliper: 'axial2', caliperColor: '#25272b', caliperAngleDeg: 200 },
    frame: { type: 'twinSpar', color: '#2a2c30', metal: 0.8, rough: 0.4, subframe: 'cast', subframeColor: '#232428', width: 0.36 },
    swingarm: { type: 'singleSided', length: 0.6, angleDeg: 8.5, side: 'left', color: '#2a2c30', metal: 0.75, rough: 0.4 },
    shock: { layout: 'mono', springColor: '#1d1e22', bodyColor: '#c99a2c', reservoir: true },
    drive: { type: 'chain', side: 'left', frontTeeth: 17, rearTeeth: 44, pitch: 0.015875, sprocketColor: '#1e1f22' },
    engine: {
      layout: 'I3',
      cc: 1160,
      crank: [0, 0.4, -0.81],
      tiltDeg: 20,
      caseColor: '#1b1c1f',
      coverColor: '#33353a',
      headColor: '#25272b',
      camCoverColor: '#17181b',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.34, h: 0.3, z: -1.17, y: 0.6, tiltDeg: 12, curved: true },
      width: 0.4,
    },
    exhaust: { route: 'none', side: 'right', can: 'round', canLength: 0.34, canDia: 0.09, canFinish: 'titanium', headerFinish: 'steel' },
    cockpit: {
      bars: 'tubular',
      grip: [0.375, 1.05, -0.9],
      barDia: 0.0235,
      dash: 'tft',
      dashPos: [0, 1.07, -1.2],
      dashSize: [0.125, 0.072],
      dashTiltDeg: 36,
      dashMount: 'bars',
      mirrors: 'bar',
      mirrorPos: [0.33, 1.22, -0.97],
      mirrorSize: [0.125, 0.07],
      mirrorIndicators: false,
      mirrorShape: 'rect',
      mirrorColor: '#141517',
      topClamp: 'cast',
      steeringDamper: 'none',
      leverColor: '#2a2c30',
      reservoirs: true,
      clutch: 'hydraulic',
      ignition: 'clamp',
      switchColor: '#151618',
      gripColor: '#141414',
      barEndColor: '#2a2c30',
    },
    lights: { head: 'custom', tail: 'custom', rearIndicators: 'stalk' },
    seat: { height: 0.83, front: -0.67, back: -0.31, pillion: 'seat', color: '#151515' },
    rider: { hip: [0, 0.925, -0.5], peg: [0.195, 0.37, -0.43], torsoPitch: 0.3 },
    footrests: 'rearset',
    plate: { mount: 'hanger', pos: [0, 0.62, 0.4], tiltDeg: -13 },
    body,
    livery,
    groundClearance: 0.14,
    features: [],
    zones: { splitY: 0.6, decal: [-0.9, 0.96] },
  };
  // Cockpit points are authored in steering-local coordinates and converted once the hardpoints are known.
  const hp = computeHardpoints(bp);
  bp.cockpit.grip = steerToBike(hp, [0.375, 0.158, 0.175]);
  bp.cockpit.dashPos = steerToBike(hp, [0, 0.07, -0.1]);
  bp.cockpit.mirrorPos = steerToBike(hp, [0.335, 0.33, 0.12]);
  return bp;
}
