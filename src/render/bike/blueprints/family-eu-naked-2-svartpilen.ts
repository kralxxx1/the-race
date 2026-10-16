import type { BikeSpec, Livery } from '../../../data/bikes';
import { T, mul, type KitContext } from '../context';
import { computeHardpoints } from '../hardpoints';
import { buildSeat, buildTank, frontFender, PAINT, seatFinish } from '../kit/body';
import { collector, headers } from '../kit/jp-sport-exhaust';
import { tailLamp } from '../kit/jp-sport-parts';
import { hugger, plateHanger } from '../kit/rear';
import { curve, outlineLoft, stationsBetween, type OutlineBody } from '../kit/shape';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv, type Pen } from '../livery';
import { extrude, lathe, rod, smooth2, type P2 } from '../mesh';
import { F, hard, tint, vary } from '../sink';
import { fNot, sideRegion, type Field } from '../surface';
import type { BikeBlueprint } from '../types';
import { bladeIndicator, forkBrackets, loftPart, outletCan, outlineArc, panelPair, sideCovers, steerLedLamp, steerToBike } from './family-eu-naked-2-parts';

/**
 * Husqvarna Svartpilen 401 (2024).
 * Spec sheet: wheelbase 1357 mm, rake 25°, trail ~98 mm, seat 835 mm, 110/70R17 + 150/60R17
 * on 10-spoke cast wheels, 43 mm WP Apex USD fork, single 320 mm disc with a four-piston radial
 * caliper, WP Apex monoshock, steel trellis frame, cast aluminium swingarm, 399 cc single.
 * Design cues: the round LED headlight with a ring DRL in a squared black mask under a
 * flyscreen, the angular tank with big chiselled shrouds running forward to the lamp, the flat
 * "tabletop" seat running into a stubby square tail with a grab bar, wide scrambler bars and
 * a short brushed silencer low on the right.
 */

// ───────────────────────────── bodywork ─────────────────────────────

const LAMP_R = 0.074;

function face(ctx: KitContext): void {
  const y = -0.075, z = -0.19;
  const ring = Array.from({ length: 40 }, (_, i) => [Math.cos((i / 40) * Math.PI * 2) * LAMP_R, Math.sin((i / 40) * Math.PI * 2) * LAMP_R] as P2);
  steerLedLamp(ctx, ring, [0, y, z], { depth: 0.07, rim: 0.0045, projectors: [[0, 0, 0.036]], drl: outlineArc(ring, 0, 1, 0.0095), drlWidth: 0.006 }, 0.0);
  // Silver bezel ring.
  ctx.addSteer('steer', lathe([[LAMP_R + 0.003, 0], [LAMP_R + 0.011, 0.001], [LAMP_R + 0.011, 0.012], [LAMP_R + 0.003, 0.012]], { segs: ctx.seg(44, 20), axis: 'z', sharp: true }), vary(F.brushedAlu, { rough: 0.32 }), mul(T(0, y, z - 0.012)));
  // Squared black mask round the lamp: flat top, deep sides.
  const mask: OutlineBody = {
    zs: stationsBetween(-0.2, -0.05, 7, 0.3),
    top: curve([[-0.2, 0.01], [-0.15, 0.022], [-0.05, 0.03]]),
    bottom: curve([[-0.2, -0.14], [-0.15, -0.158], [-0.05, -0.17]]),
    half: curve([[-0.2, 0.092], [-0.15, 0.108], [-0.05, 0.116]]),
    sections: [{ z: 0, pts: [[0, 1], [0.72, 1], [0.97, 0.94], [1, 0.62], [0.96, 0.2], [0.7, 0.03], [0, 0]] }],
  };
  loftPart(ctx, mask, { ...F.satinBlack, rough: 0.55 }, { steer: true, capBack: true, depth: 0.006 });
  // Flyscreen: short, tinted, perched on the mask.
  const visor: OutlineBody = {
    zs: stationsBetween(-0.18, -0.085, 6, 0.4),
    top: curve([[-0.18, 0.026], [-0.15, 0.07], [-0.085, 0.115]]),
    bottom: curve([[-0.18, 0.02], [-0.15, 0.062], [-0.085, 0.108]]),
    half: curve([[-0.18, 0.072], [-0.14, 0.078], [-0.085, 0.074]]),
    sections: [{ z: 0, pts: [[0, 1], [0.5, 0.985], [0.85, 0.9], [1, 0.4], [1, 0]] }],
  };
  const vm = outlineLoft(visor, { su: ctx.seg(8, 3), sv: ctx.seg(4, 2) });
  vm.transform(ctx.steerM);
  ctx.add('steer', vm, tint(F.screen, '#454c55'));
  for (const s of [-1, 1]) bladeIndicator(ctx, 'steer', ctx.fromSteer([s * 0.098, -0.125, -0.12]), ctx.fromSteer([s * 0.112, -0.13, -0.13]), 0.008);
  forkBrackets(ctx, [-0.06, -0.14], -0.15, 0.06);
}

/** Big chiselled tank shrouds running forward to the headlight mask. */
function shroud(): OutlineBody {
  return {
    zs: stationsBetween(-1.1, -0.62, 11, 0.4),
    top: curve([[-1.1, 0.935], [-1.04, 0.96], [-0.96, 0.99], [-0.86, 1.0], [-0.76, 0.985], [-0.68, 0.96], [-0.62, 0.93]]),
    bottom: curve([[-1.1, 0.82], [-1.04, 0.74], [-0.96, 0.7], [-0.86, 0.69], [-0.76, 0.72], [-0.68, 0.78], [-0.62, 0.84]]),
    half: curve([[-1.1, 0.095], [-1.04, 0.14], [-0.96, 0.17], [-0.86, 0.18], [-0.76, 0.17], [-0.68, 0.15], [-0.62, 0.12]]),
    sections: [
      { z: -1.1, pts: [[0.6, 1], [0.92, 0.98], [1, 0.82], [1, 0.4], [0.9, 0.08], [0.7, 0]] },
      { z: -0.62, pts: [[0.55, 1], [0.9, 0.98], [1, 0.8], [1, 0.4], [0.92, 0.1], [0.78, 0]] },
    ],
  };
}

function scoop(): OutlineBody {
  return {
    zs: stationsBetween(-1.09, -0.8, 7, 0.4),
    top: curve([[-1.09, 0.84], [-1.0, 0.84], [-0.8, 0.82]]),
    bottom: curve([[-1.09, 0.76], [-1.0, 0.72], [-0.9, 0.715], [-0.8, 0.74]]),
    half: curve([[-1.09, 0.092], [-1.02, 0.136], [-0.92, 0.165], [-0.8, 0.152]]),
    sections: [{ z: 0, pts: [[0.7, 1], [0.92, 0.9], [1, 0.62], [0.98, 0.3], [0.9, 0]] }],
  };
}

/** Stubby squared-off tail behind the long flat seat. */
function tailBody(): OutlineBody {
  return {
    zs: stationsBetween(-0.3, 0.17, 10, 0.5),
    top: curve([[-0.3, 0.845], [-0.12, 0.855], [0.04, 0.875], [0.17, 0.89]]),
    bottom: curve([[-0.3, 0.74], [-0.1, 0.76], [0.06, 0.8], [0.17, 0.84]]),
    half: curve([[-0.3, 0.125], [-0.1, 0.115], [0.06, 0.1], [0.17, 0.085]]),
    sections: [
      { z: -0.3, pts: [[0, 1], [0.7, 0.99], [0.97, 0.88], [1, 0.55], [0.94, 0.22], [0.6, 0.02], [0, 0]] },
      { z: 0.17, pts: [[0, 1], [0.8, 0.98], [1, 0.8], [1, 0.45], [0.9, 0.15], [0.5, 0.02], [0, 0]] },
    ],
  };
}

function body(ctx: KitContext): void {
  const dark = hard('#1b1c1f', 0.2, 0.42, 0.7);
  face(ctx);
  const mouth: Field = sideRegion(smooth2([[-1.11, 0.84], [-1.05, 0.8], [-1.0, 0.74], [-1.07, 0.7], [-1.11, 0.72]], 2, true));
  panelPair(ctx, shroud(), PAINT, { region: fNot(mouth), creases: [2], depth: 0.01 });
  panelPair(ctx, scoop(), F.texturedBlack, { depth: 0.008, q: 1 });
  buildTank(ctx, {
    front: -1.05,
    back: -0.52,
    top: 1.03,
    bottomFront: 0.84,
    bottomBack: 0.8,
    width: 0.32,
    style: 'boxy',
    knee: 0.12,
    capZ: -0.82,
    topLine: [[-1.05, 0.955], [-1.0, 0.99], [-0.92, 1.015], [-0.82, 1.03], [-0.72, 1.025], [-0.62, 1.005], [-0.56, 0.98], [-0.52, 0.95]],
    bottomLine: [[-1.05, 0.86], [-0.85, 0.82], [-0.52, 0.8]],
    halfLine: [[-1.05, 0.07], [-1.0, 0.115], [-0.92, 0.145], [-0.82, 0.155], [-0.72, 0.15], [-0.62, 0.125], [-0.52, 0.1]],
  });
  // Long flat seat running into the tail: rider and pillion sections share one level.
  buildSeat(ctx, { front: -0.58, back: -0.27, yFront: 0.848, y: 0.842, yBack: 0.85, width: 0.27, thick: 0.065, frontWidth: 0.15 });
  buildSeat(ctx, { front: -0.26, back: 0.05, yFront: 0.852, y: 0.858, yBack: 0.872, width: 0.2, thick: 0.05, frontWidth: 0.2 }, tint(seatFinish(ctx), '#18191b'));
  loftPart(ctx, tailBody(), PAINT, { capBack: true, depth: 0.006, q: 1 });
  // Square LED tail light on the tail face and a rear grab loop.
  tailLamp(ctx, smooth2([[-0.05, -0.012], [0.05, -0.012], [0.056, 0.0], [0.05, 0.012], [-0.05, 0.012], [-0.056, 0.0]], 3, true), [0, 0.87, 0.168], -0.15, { count: 1 });
  for (const s of [-1, 1]) {
    ctx.add('chassis', rod([s * 0.1, 0.862, -0.05], [s * 0.1, 0.888, 0.1], 0.0075, 0.0075, 8), F.brushedAlu);
  }
  sideCovers(ctx, [[-0.5, 0.78], [-0.34, 0.77], [-0.3, 0.66], [-0.46, 0.62], [-0.52, 0.68]], 0.128, dark);
  frontFender(ctx, { from: -0.45, to: 0.82, gap: 0.022, width: 0.125, f: hard('#17181b', 0.2, 0.5, 0.6) });
  hugger(ctx, F.texturedBlack);
  plateHanger(ctx, { fromZ: 0.0, fromY: 0.82 });
  exhaust(ctx);
}

// ───────────────────────────── exhaust ─────────────────────────────

/** Single header down the front of the cylinder and under the engine into a short brushed side silencer. */
function exhaust(ctx: KitContext): void {
  const c = ctx.bp.engine.crank;
  const zf = c[2] - 0.2;
  headers(ctx, {
    r: 0.0165,
    heat: 'steel',
    tEnd: 0.7,
    route: () => [
      [0.0, 0.46, zf],
      [0.0, 0.31, zf + 0.012],
      [0.06, 0.22, c[2] - 0.08],
      [0.12, 0.2, c[2] + 0.12],
      [0.14, 0.24, c[2] + 0.3],
    ],
  });
  collector(ctx, [0.0, 0.31, zf + 0.012], 0.024, 0.05, 'steel', 0.65);
  outletCan(ctx, {
    a: [0.15, 0.255, c[2] + 0.28],
    b: [0.162, 0.315, -0.12],
    r0: 0.048,
    r1: 0.054,
    shape: 'round',
    body: vary(F.titanium, { color: [0.4, 0.39, 0.37], rough: 0.36 }),
    cap: hard('#111214', 0.5, 0.4, 0.3),
    outlets: [{ dx: 0, dy: 0, r: 0.026, len: 0.016 }],
  });
  // Heat shield band over the silencer.
  ctx.add('chassis', extrude(smooth2([[-0.4, 0.3], [-0.32, 0.325], [-0.22, 0.34], [-0.2, 0.31], [-0.3, 0.285]], 3, true), 0.108, { plane: 'zy', bevel: 0.004, center: 0.157, curveSegs: 1 }), hard('#16171a', 0.6, 0.5, 0.2));
  ctx.anchor('exhaustOutlet', [0.162, 0.315, -0.1]);
}

// ───────────────────────────── livery ─────────────────────────────

const SILVER = '#c3c7cc';

function lettering(p: Pen, main: string, accent: string): void {
  if (p.view !== 'right' && p.view !== 'left') return;
  p.text('SVARTPILEN', -0.88, 0.9, { color: main, size: 0.027, weight: '900', spacing: 0.05, stretch: 1.0 });
  p.text('401', -0.5, 0.9, { color: accent, size: 0.027, weight: '900' });
}

function livery(c: LiveryCanvas, lv: Livery, env: LiveryEnv): void {
  const black = env.index === 1;
  c.views(ALL_VIEWS, (p) => {
    p.fill(lv.primary, black ? 'gloss' : 'matte');
    if (p.view === 'right' || p.view === 'left') {
      // Silver chiselled shrouds, dark tail and frame plates, thin silver flash on the tail.
      p.poly([[-1.12, 0.68], [-1.12, 0.92], [-1.02, 0.98], [-0.8, 0.99], [-0.62, 0.92], [-0.62, 0.8], [-0.76, 0.69], [-1.0, 0.67]], black ? '#cfd3d8' : SILVER, 'metallic');
      p.poly([[-0.34, 0.74], [-0.1, 0.75], [0.2, 0.84], [0.2, 0.9], [-0.1, 0.87], [-0.34, 0.86]], '#1b1c1f', 'satin');
      p.line([[-0.3, 0.86], [-0.1, 0.862], [0.17, 0.886]], SILVER, 0.005);
      lettering(p, black ? '#e5e7ea' : '#15161a', lv.accent);
    } else if (p.view === 'top') {
      p.rect(-1.05, -0.04, -0.55, 0.04, '#1b1c1f', 'satin');
    } else if (p.view === 'front') {
      p.rect(-1, 0.7, 1, 0.92, SILVER, 'metallic');
    }
  });
}

// ───────────────────────────── blueprint ─────────────────────────────

export function svartpilenBlueprint(spec: BikeSpec): BikeBlueprint {
  const lv = spec.liveries[0];
  const bp: BikeBlueprint = {
    id: spec.id,
    source: 'authored',
    overall: [2.0, 0.83, 1.13],
    wheelbase: 1.357,
    rakeDeg: 25.0,
    trail: 0.098,
    forkLength: 0.72,
    front: { tyre: '110/70R17', rimWidthIn: 3.0, crown: 1.0, tread: 'sport', tyreLabel: 'Sport Touring' },
    rear: { tyre: '150/60R17', rimWidthIn: 4.0, crown: 1.0, tread: 'sport', tyreLabel: 'Sport Touring' },
    frontWheel: { type: 'cast', spokes: 10, shape: 'straight', color: lv.wheel, machinedLip: true },
    rearWheel: { type: 'cast', spokes: 10, shape: 'straight', color: lv.wheel, machinedLip: true },
    fork: { type: 'usd', stanchion: 0.043, spacing: 0.2, outerColor: '#17181b', innerColor: '#a9acb1', footColor: '#1b1c1f', capColor: '#2a2c30', adjusterColor: '#d9dce0', label: 'WP', labelColor: '#d9dce0', aboveClamp: 0.01, clampGap: 0.2 },
    frontBrake: { discs: 1, discDia: 0.32, disc: 'fixed', carrierColor: '#2b2d31', caliper: 'radial4', caliperColor: '#25272b', caliperText: 'brembo', caliperTextColor: '#d6d8dc', caliperAngleDeg: 76 },
    rearBrake: { discs: 1, discDia: 0.23, disc: 'fixed', carrierColor: '#2b2d31', caliper: 'axial1', caliperColor: '#25272b', caliperAngleDeg: 200 },
    frame: { type: 'trellis', color: '#1b1c1f', metal: 0.4, rough: 0.45, subframe: 'trellis', subframeColor: '#1b1c1f', width: 0.29 },
    swingarm: { type: 'box', length: 0.55, angleDeg: 7, color: '#202227', metal: 0.6, rough: 0.45 },
    shock: { layout: 'mono', springColor: '#d6d8dc', bodyColor: '#202227', reservoir: false },
    drive: { type: 'chain', side: 'left', frontTeeth: 15, rearTeeth: 45, pitch: 0.015875, sprocketColor: '#1e1f22' },
    engine: {
      layout: 'SINGLE',
      cc: 399,
      crank: [0, 0.37, -0.72],
      tiltDeg: 10,
      caseColor: '#1b1c1f',
      coverColor: '#2d2f33',
      headColor: '#25272b',
      camCoverColor: '#17181b',
      finned: true,
      liquidCooled: true,
      radiator: { w: 0.22, h: 0.24, z: -1.0, y: 0.55, tiltDeg: 10, curved: false },
      width: 0.3,
    },
    exhaust: { route: 'none', side: 'right', can: 'round', canLength: 0.3, canDia: 0.1, canFinish: 'titanium', headerFinish: 'steel' },
    cockpit: {
      bars: 'tubular',
      grip: [0.37, 1.04, -0.82],
      barDia: 0.0222,
      dash: 'tft',
      dashPos: [0, 1.04, -1.0],
      dashSize: [0.11, 0.065],
      dashTiltDeg: 34,
      dashMount: 'bars',
      mirrors: 'bar',
      mirrorPos: [0.35, 1.2, -0.85],
      mirrorSize: [0.105, 0.058],
      mirrorIndicators: false,
      mirrorShape: 'rect',
      mirrorColor: '#141517',
      topClamp: 'cast',
      steeringDamper: 'none',
      leverColor: '#2a2c30',
      reservoirs: true,
      clutch: 'cable',
      ignition: 'clamp',
      switchColor: '#151618',
      gripColor: '#141414',
      barEndColor: '#9aa0a7',
    },
    lights: { head: 'custom', tail: 'custom', rearIndicators: 'stalk' },
    seat: { height: 0.835, front: -0.58, back: -0.27, pillion: 'seat', color: '#151515' },
    rider: { hip: [0, 0.915, -0.4], peg: [0.2, 0.36, -0.35], torsoPitch: 0.14 },
    footrests: 'peg',
    plate: { mount: 'hanger', pos: [0, 0.74, 0.27], tiltDeg: -18 },
    body,
    livery,
    groundClearance: 0.16,
    features: [],
    zones: { splitY: 0.6, decal: [-0.9, 0.95] },
  };
  const hp = computeHardpoints(bp);
  bp.cockpit.grip = steerToBike(hp, [0.37, 0.16, 0.15]);
  bp.cockpit.dashPos = steerToBike(hp, [0, 0.07, -0.085]);
  bp.cockpit.mirrorPos = steerToBike(hp, [0.34, 0.32, 0.1]);
  return bp;
}
