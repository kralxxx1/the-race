import * as THREE from 'three';
import type { BikeSpec, Livery } from '../../../data/bikes';
import { T, mul, type KitContext } from '../context';
import { computeHardpoints } from '../hardpoints';
import { addPanel, buildSeat, buildTank, frontFender, PAINT, seatFinish } from '../kit/body';
import { collector, headers, heatPipe } from '../kit/jp-sport-exhaust';
import { tailLamp } from '../kit/jp-sport-parts';
import { hugger, plateHanger } from '../kit/rear';
import { curve, outlineLoft, stationsBetween, type OutlineBody } from '../kit/shape';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv, type Pen } from '../livery';
import { extrude, lathe, roundBox, smooth2, type P2 } from '../mesh';
import { F, hard, tint, vary } from '../sink';
import { fAnd, fNot, fOr, planRegion, sideRegion, type Field } from '../surface';
import type { BikeBlueprint } from '../types';
import { bladeIndicator, forkBrackets, loftPart, outletCan, outlineArc, panelPair, sideCovers, steerLedLamp, steerToBike } from './family-eu-naked-2-parts';

/**
 * MV Agusta Brutale 1000 RR (2021+).
 * Spec sheet: wheelbase 1415 mm, rake 24.0°, trail 102 mm, seat 845 mm, 120/70ZR17 +
 * 200/55ZR17 on forged five-spoke wheels, 43 mm Öhlins NIX fork (gold TiN), Brembo Stylema
 * calipers on twin 320 mm discs, Öhlins TTX shock, steel trellis frame with aluminium pivot
 * plates, single-sided aluminium swingarm, 998 cc inline four with the radial-valve head.
 * Design cues: the round LED headlight with a full DRL ring under a tiny flyscreen with
 * small winglets, a red steel-trellis frame wrapped round a slim tank with silver side
 * covers, a razor-sharp raised tail, and the signature four organ-pipe silencer outlets
 * stacked on the right under the tail.
 */

// ───────────────────────────── bodywork ─────────────────────────────

const LAMP_R = 0.078;

function face(ctx: KitContext): void {
  const y = -0.1, z = -0.2;
  const ring = Array.from({ length: 40 }, (_, i) => [Math.cos((i / 40) * Math.PI * 2) * LAMP_R, Math.sin((i / 40) * Math.PI * 2) * LAMP_R] as P2);
  const drl = outlineArc(ring, 0, 1, 0.0105);
  steerLedLamp(ctx, ring, [0, y, z], { depth: 0.07, rim: 0.0045, projectors: [[0, 0, 0.034], [-0.052, 0.0, 0.011], [0.052, 0.0, 0.011]], drl, drlWidth: 0.0065 }, 0.03);
  // Aluminium bezel ring round the lens.
  ctx.addSteer('steer', lathe([[LAMP_R + 0.003, 0], [LAMP_R + 0.012, 0.001], [LAMP_R + 0.012, 0.012], [LAMP_R + 0.003, 0.012]], { segs: ctx.seg(44, 20), axis: 'z', sharp: true }), vary(F.brushedAlu, { rough: 0.3 }), mul(T(0, y, z - 0.012), new THREE.Matrix4().makeRotationX(0.03)));
  // Lamp cowl behind the lens: a compact black shell between lamp and fork.
  const cowl: OutlineBody = {
    zs: stationsBetween(-0.2, -0.05, 7, 0.3),
    top: curve([[-0.2, -0.018], [-0.15, 0.0], [-0.05, 0.02]]),
    bottom: curve([[-0.2, -0.158], [-0.15, -0.18], [-0.05, -0.19]]),
    half: curve([[-0.2, 0.084], [-0.15, 0.1], [-0.05, 0.108]]),
    sections: [{ z: 0, pts: [[0, 1], [0.55, 0.99], [0.9, 0.9], [1, 0.6], [0.92, 0.2], [0.6, 0.02], [0, 0]] }],
  };
  loftPart(ctx, cowl, { ...F.satinBlack, rough: 0.5 }, { steer: true, capBack: true, depth: 0.006 });
  // Tiny flyscreen over the lamp.
  const visor: OutlineBody = {
    zs: stationsBetween(-0.2, -0.085, 6, 0.4),
    top: curve([[-0.2, -0.01], [-0.16, 0.045], [-0.085, 0.1]]),
    bottom: curve([[-0.2, -0.016], [-0.16, 0.036], [-0.085, 0.092]]),
    half: curve([[-0.2, 0.078], [-0.15, 0.086], [-0.085, 0.082]]),
    sections: [{ z: 0, pts: [[0, 1], [0.5, 0.985], [0.85, 0.9], [1, 0.4], [1, 0]] }],
  };
  const vm = outlineLoft(visor, { su: ctx.seg(8, 3), sv: ctx.seg(4, 2) });
  vm.transform(ctx.steerM);
  ctx.add('steer', vm, tint(F.screen, '#3a424c'));
  // Winglets either side of the lamp (aluminium-look leading edge, carbon upper surface).
  for (const s of [-1, 1]) {
    const w: P2[] = [[s * 0.07, -0.2], [s * 0.125, -0.178], [s * 0.15, -0.15], [s * 0.145, -0.135], [s * 0.07, -0.135]];
    const mesh = extrude(smooth2(s > 0 ? w : w.slice().reverse(), 1, true), 0.006, { plane: 'xz', bevel: 0.0015, curveSegs: 1, center: 0 });
    ctx.addSteer('steer', mesh, F.carbon, T(0, -0.075, 0));
    bladeIndicator(ctx, 'steer', ctx.fromSteer([s * 0.088, -0.15, -0.16]), ctx.fromSteer([s * 0.1, -0.155, -0.17]), 0.0075);
  }
  forkBrackets(ctx, [-0.095, -0.17], -0.15, 0.06);
}

/** Aluminium-look tank side covers (silver on the Rosso / Argento livery). */
function cheek(): OutlineBody {
  return {
    zs: stationsBetween(-1.18, -0.72, 11, 0.4),
    top: curve([[-1.18, 0.93], [-1.1, 0.965], [-1.0, 0.99], [-0.9, 0.995], [-0.82, 0.98], [-0.72, 0.945]]),
    bottom: curve([[-1.18, 0.78], [-1.12, 0.7], [-1.04, 0.655], [-0.95, 0.645], [-0.86, 0.68], [-0.78, 0.74], [-0.72, 0.8]]),
    half: curve([[-1.18, 0.115], [-1.1, 0.152], [-1.0, 0.172], [-0.9, 0.176], [-0.82, 0.166], [-0.72, 0.14]]),
    sections: [
      { z: -1.18, pts: [[0.55, 1], [0.84, 0.98], [0.98, 0.9], [1, 0.62], [1, 0.3], [0.9, 0.05], [0.7, 0]] },
      { z: -0.72, pts: [[0.5, 1], [0.82, 0.98], [0.97, 0.9], [1, 0.62], [1, 0.3], [0.92, 0.06], [0.75, 0]] },
    ],
  };
}

function radiatorDuct(): OutlineBody {
  return {
    zs: stationsBetween(-1.16, -0.9, 7, 0.4),
    top: curve([[-1.16, 0.8], [-1.05, 0.8], [-0.9, 0.78]]),
    bottom: curve([[-1.16, 0.7], [-1.05, 0.65], [-0.98, 0.645], [-0.9, 0.67]]),
    half: curve([[-1.16, 0.105], [-1.08, 0.142], [-0.98, 0.162], [-0.9, 0.15]]),
    sections: [{ z: 0, pts: [[0.7, 1], [0.92, 0.9], [1, 0.62], [0.98, 0.3], [0.9, 0]] }],
  };
}

/** Needle-sharp tail raised at the back, narrowing to a ridge. */
function tailBody(): OutlineBody {
  return {
    zs: stationsBetween(-0.62, 0.2, 13, 0.5),
    top: curve([[-0.62, 0.8], [-0.44, 0.815], [-0.3, 0.855], [-0.2, 0.915], [-0.06, 0.96], [0.08, 0.985], [0.2, 1.0]]),
    bottom: curve([[-0.62, 0.665], [-0.4, 0.695], [-0.2, 0.775], [-0.02, 0.87], [0.1, 0.945], [0.2, 0.985]]),
    half: curve([[-0.62, 0.135], [-0.44, 0.126], [-0.24, 0.1], [-0.04, 0.07], [0.2, 0.02]]),
    sections: [
      { z: -0.62, pts: [[0, 1], [0.6, 0.98], [0.95, 0.84], [1, 0.55], [0.93, 0.22], [0.6, 0.02], [0, 0]] },
      { z: 0.2, pts: [[0, 1], [0.6, 0.98], [1, 0.7], [0.96, 0.42], [0.8, 0.2], [0.4, 0.02], [0, 0]] },
    ],
  };
}

function body(ctx: KitContext): void {
  const dark = hard('#1b1c1f', 0.2, 0.42, 0.7);
  face(ctx);
  const mouth: Field = sideRegion(smooth2([[-1.19, 0.86], [-1.12, 0.83], [-1.07, 0.75], [-1.14, 0.7], [-1.19, 0.73]], 2, true));
  panelPair(ctx, cheek(), PAINT, { region: fNot(mouth), creases: [2], depth: 0.01 });
  panelPair(ctx, radiatorDuct(), F.texturedBlack, { depth: 0.008, q: 1 });
  buildTank(ctx, {
    front: -1.13,
    back: -0.6,
    top: 1.065,
    bottomFront: 0.86,
    bottomBack: 0.83,
    width: 0.34,
    style: 'muscle',
    knee: 0.2,
    capZ: -0.92,
    topLine: [[-1.13, 0.965], [-1.07, 1.005], [-0.98, 1.04], [-0.88, 1.063], [-0.78, 1.058], [-0.71, 1.025], [-0.66, 0.96], [-0.6, 0.875]],
    bottomLine: [[-1.13, 0.865], [-0.9, 0.825], [-0.6, 0.83]],
    halfLine: [[-1.13, 0.062], [-1.07, 0.112], [-0.98, 0.15], [-0.88, 0.16], [-0.78, 0.15], [-0.7, 0.11], [-0.6, 0.072]],
  });
  buildSeat(ctx, { front: -0.66, back: -0.31, yFront: 0.855, y: 0.846, yBack: 0.87, width: 0.29, thick: 0.07, frontWidth: 0.17 });
  buildSeat(ctx, { front: -0.295, back: -0.03, yFront: 0.915, y: 0.93, yBack: 0.955, width: 0.18, thick: 0.045, frontWidth: 0.13 }, tint(seatFinish(ctx), '#18191b'));
  const tm = outlineLoft(tailBody(), { su: ctx.seg(12, 4), sv: ctx.seg(6, 2), capBack: true });
  const seatHole: Field = fAnd(
    fOr(sideRegion([[-0.86, 0.8], [-0.3, 0.8], [-0.3, 1.4], [-0.86, 1.4]]), sideRegion([[-0.29, 0.9], [-0.02, 0.9], [-0.02, 1.4], [-0.29, 1.4]])),
    planRegion([[-0.86, -0.01], [-0.02, -0.01], [-0.02, 0.095], [-0.29, 0.095], [-0.3, 0.15], [-0.86, 0.15]]),
  );
  addPanel(ctx, 'chassis', tm, fNot(seatHole), PAINT, 0.0025, 0.012);
  // Thin LED tail light across the tail tip, kicked up.
  tailLamp(ctx, smooth2([[-0.05, -0.005], [0.05, -0.005], [0.054, 0.003], [0.0, 0.009], [-0.054, 0.003]], 4, true), [0, 0.985, 0.19], -0.8, { count: 1 });
  sideCovers(ctx, [[-0.58, 0.775], [-0.44, 0.77], [-0.41, 0.69], [-0.52, 0.66], [-0.58, 0.71]], 0.128, dark);
  frontFender(ctx, { from: -0.5, to: 0.86, gap: 0.02, width: 0.15, f: F.carbon });
  hugger(ctx, F.texturedBlack);
  plateHanger(ctx, { fromZ: -0.02, fromY: 0.88 });
  exhaust(ctx);
}

// ───────────────────────────── exhaust ─────────────────────────────

/** Four headers → belly collector → pipe up the right → four organ-pipe outlets stacked under the tail. */
function exhaust(ctx: KitContext): void {
  const c = ctx.bp.engine.crank;
  const zf = c[2] - 0.255;
  headers(ctx, {
    r: 0.0165,
    heat: 'titanium',
    tEnd: 0.7,
    route: (_i, p) => {
      const x = p.pos[0];
      return [
        [x * 1.05, 0.5, zf],
        [x * 0.78, 0.31, zf + 0.012],
        [x * 0.4, 0.2, zf + 0.1],
        [0.015, 0.175, c[2] - 0.09],
      ];
    },
  });
  collector(ctx, [0.015, 0.175, c[2] - 0.075], 0.04, 0.12, 'titanium', 0.65);
  const box = hard('#1a1b1e', 0.4, 0.45, 0.3);
  ctx.add('chassis', roundBox(0.2, 0.09, 0.3, 0.04, ctx.micro ? 3 : 2), box, new THREE.Matrix4().makeTranslation(0.02, 0.17, c[2] + 0.1));
  heatPipe(ctx, [[0.03, 0.17, c[2] + 0.2], [0.1, 0.22, c[2] + 0.36], [0.13, 0.4, -0.4], [0.14, 0.55, -0.34]], 0.0255, 'titanium', 0.6, 0.9);
  // Tall, narrow can under the tail: four organ-pipe outlets in a stack, longest at the top.
  outletCan(ctx, {
    a: [0.15, 0.575, -0.36],
    b: [0.162, 0.6, -0.05],
    r0: 0.038,
    r1: 0.04,
    shape: 'oval',
    aspect: 2.15,
    body: vary(F.titanium, { color: [0.4, 0.39, 0.37], rough: 0.36 }),
    cap: hard('#111214', 0.5, 0.4, 0.3),
    outlets: [
      { dx: 0, dy: 0.074, r: 0.0185, len: 0.075 },
      { dx: 0, dy: 0.025, r: 0.0185, len: 0.052 },
      { dx: 0, dy: -0.025, r: 0.0185, len: 0.03 },
      { dx: 0, dy: -0.074, r: 0.0185, len: 0.01 },
    ],
  });
  ctx.anchor('exhaustOutlet', [0.162, 0.6, 0.0]);
}

// ───────────────────────────── livery ─────────────────────────────

const SILVER = '#b9bdc3';

function lettering(p: Pen, main: string): void {
  if (p.view !== 'right' && p.view !== 'left') return;
  p.text('MV AGUSTA', -1.0, 0.8, { color: main, size: 0.022, weight: '900', spacing: 0.06 });
  p.text('BRUTALE', -0.2, 0.9, { color: main, size: 0.022, weight: '800', italic: true, spacing: 0.04 });
  p.text('1000 RR', -0.2, 0.86, { color: main, size: 0.016, weight: '800', italic: true });
}

function livery(c: LiveryCanvas, lv: Livery, _env: LiveryEnv): void {
  c.views(ALL_VIEWS, (p) => {
    p.fill(lv.primary, 'gloss');
    if (p.view === 'right' || p.view === 'left') {
      // Silver tank covers and a silver stripe through the tail, red top of the tank.
      p.poly([[-1.22, 0.62], [-1.22, 0.9], [-1.1, 0.97], [-0.84, 0.96], [-0.74, 0.82], [-0.86, 0.64], [-1.04, 0.62]], SILVER, 'metallic');
      p.poly([[-0.64, 0.8], [-0.4, 0.8], [-0.25, 0.88], [0.0, 0.94], [0.22, 1.0], [0.22, 0.64], [-0.62, 0.64]], '#202226', 'satin');
      p.poly([[-0.3, 0.86], [-0.12, 0.93], [0.1, 0.975], [0.1, 0.96], [-0.1, 0.915], [-0.28, 0.85]], SILVER, 'metallic');
      p.line([[-1.12, 0.99], [-0.98, 1.04], [-0.8, 1.05], [-0.66, 0.99]], SILVER, 0.008);
      lettering(p, '#15161a');
    } else if (p.view === 'top') {
      p.rect(-1.12, -0.02, -0.62, 0.02, SILVER, 'metallic');
    } else if (p.view === 'front') {
      p.rect(-1, 0.6, 1, 0.86, SILVER, 'metallic');
    }
  });
}

// ───────────────────────────── blueprint ─────────────────────────────

export function brutaleBlueprint(spec: BikeSpec): BikeBlueprint {
  const lv = spec.liveries[0];
  const bp: BikeBlueprint = {
    id: spec.id,
    source: 'authored',
    overall: [2.09, 0.82, 1.1],
    wheelbase: 1.415,
    rakeDeg: 24.0,
    trail: 0.102,
    forkLength: 0.75,
    front: { tyre: '120/70ZR17', rimWidthIn: 3.5, crown: 0.9, tread: 'sport', tyreLabel: 'Sport Radial' },
    rear: { tyre: '200/55ZR17', rimWidthIn: 6.0, crown: 0.95, tread: 'sport', tyreLabel: 'Sport Radial' },
    frontWheel: { type: 'forged', spokes: 5, shape: 'y', color: lv.wheel, },
    rearWheel: { type: 'forged', spokes: 5, shape: 'y', color: lv.wheel },
    fork: { type: 'usd', stanchion: 0.043, spacing: 0.205, outerColor: '#17181b', innerColor: '#c9a65a', footColor: '#1b1c1f', capColor: '#2a2c30', adjusterColor: '#c99a2c', label: 'ÖHLINS', labelColor: '#c9a65a', aboveClamp: 0.01, clampGap: 0.2 },
    frontBrake: { discs: 2, discDia: 0.32, disc: 'floating', carrierColor: '#2b2d31', caliper: 'radialMono4', caliperColor: '#25272b', caliperText: 'brembo', caliperTextColor: '#f2f2f2', caliperAngleDeg: 76 },
    rearBrake: { discs: 1, discDia: 0.22, disc: 'fixed', carrierColor: '#2b2d31', caliper: 'axial2', caliperColor: '#25272b', caliperAngleDeg: 200 },
    frame: { type: 'trellis', color: '#a8121b', metal: 0.3, rough: 0.38, subframe: 'trellis', subframeColor: '#a8121b', width: 0.32 },
    swingarm: { type: 'singleSided', length: 0.6, angleDeg: 8, side: 'left', color: '#b9bdc3', metal: 0.8, rough: 0.35 },
    shock: { layout: 'mono', springColor: '#1d1e22', bodyColor: '#c99a2c', reservoir: true },
    drive: { type: 'chain', side: 'left', frontTeeth: 16, rearTeeth: 43, pitch: 0.015875, sprocketColor: '#1e1f22' },
    engine: {
      layout: 'I4',
      cc: 998,
      crank: [0, 0.405, -0.82],
      tiltDeg: 24,
      caseColor: '#1b1c1f',
      coverColor: '#33353a',
      headColor: '#25272b',
      camCoverColor: '#8f1018',
      camCoverText: 'MV AGUSTA',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.32, h: 0.3, z: -1.14, y: 0.58, tiltDeg: 12, curved: true },
      width: 0.4,
    },
    exhaust: { route: 'none', side: 'right', can: 'oval', canLength: 0.3, canDia: 0.09, canFinish: 'titanium', headerFinish: 'titanium' },
    cockpit: {
      bars: 'tubular',
      grip: [0.37, 1.03, -0.9],
      barDia: 0.0235,
      dash: 'tft',
      dashPos: [0, 1.05, -1.1],
      dashSize: [0.12, 0.07],
      dashTiltDeg: 38,
      dashMount: 'bars',
      mirrors: 'bar',
      mirrorPos: [0.33, 1.2, -0.95],
      mirrorSize: [0.1, 0.056],
      mirrorIndicators: false,
      mirrorShape: 'sport',
      mirrorColor: '#141517',
      topClamp: 'milled',
      steeringDamper: 'side',
      leverColor: '#2a2c30',
      reservoirs: true,
      clutch: 'hydraulic',
      ignition: 'keyless',
      switchColor: '#151618',
      gripColor: '#141414',
      barEndColor: '#2a2c30',
    },
    lights: { head: 'custom', tail: 'custom', rearIndicators: 'stalk' },
    seat: { height: 0.845, front: -0.66, back: -0.31, pillion: 'seat', color: '#151515' },
    rider: { hip: [0, 0.935, -0.5], peg: [0.195, 0.38, -0.44], torsoPitch: 0.34 },
    footrests: 'rearset',
    plate: { mount: 'hanger', pos: [0, 0.76, 0.3], tiltDeg: -20 },
    body,
    livery,
    groundClearance: 0.135,
    features: [],
    zones: { splitY: 0.6, decal: [-1.0, 0.95] },
  };
  const hp = computeHardpoints(bp);
  bp.cockpit.grip = steerToBike(hp, [0.37, 0.15, 0.17]);
  bp.cockpit.dashPos = steerToBike(hp, [0, 0.07, -0.1]);
  bp.cockpit.mirrorPos = steerToBike(hp, [0.33, 0.31, 0.11]);
  return bp;
}

