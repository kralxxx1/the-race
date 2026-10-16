import * as THREE from 'three';
import type { BikeSpec, Livery } from '../../../data/bikes';
import type { KitContext } from '../context';
import { computeHardpoints } from '../hardpoints';
import { addPanel, buildSeat, buildTank, frontFender, PAINT, seatFinish } from '../kit/body';
import { collector, headers, heatPipe } from '../kit/jp-sport-exhaust';
import { tailLamp } from '../kit/jp-sport-parts';
import { hugger, plateHanger } from '../kit/rear';
import { curve, outlineLoft, stationsBetween, type OutlineBody } from '../kit/shape';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv, type Pen } from '../livery';
import { roundBox, smooth2, type P2 } from '../mesh';
import { F, hard, tint, vary } from '../sink';
import { fAnd, fNot, fOr, planRegion, sideRegion, type Field } from '../surface';
import type { BikeBlueprint } from '../types';
import { bugEyeFace, outletCan, panelPair, sideCovers, steerToBike } from './family-eu-naked-2-parts';

/**
 * Triumph Street Triple 765 RS (2023).
 * Spec sheet: wheelbase 1399 mm, rake 23.9°, trail 98.3 mm, seat 825 mm, 120/70ZR17 +
 * 180/55ZR17, Öhlins NIX30 43 mm USD fork, Brembo Stylema calipers on twin 310 mm discs,
 * Öhlins STX40 shock, cast-aluminium twin-spar frame, twin-sided aluminium swingarm,
 * 765 cc inline triple.
 * Design cues: compact twin "bug-eye" LED headlights under a small black flyscreen, slim
 * muscular tank with silver radiator shrouds, a very short upswept tail, three headers into
 * a belly catalyser and a short stubby side silencer with three outlets on the right.
 */

// ───────────────────────────── bodywork ─────────────────────────────

const BUG_EYE: P2[] = smooth2([
  [0.054, 0.0], [0.049, 0.03], [0.026, 0.047], [-0.016, 0.048], [-0.045, 0.037], [-0.053, 0.004],
  [-0.044, -0.03], [-0.02, -0.046], [0.016, -0.047], [0.043, -0.035],
], 3, true);

function face(ctx: KitContext): void {
  const mask: OutlineBody = {
    zs: stationsBetween(-0.15, -0.06, 6, 0.3),
    top: curve([[-0.15, -0.07], [-0.11, -0.054], [-0.06, -0.036]]),
    bottom: curve([[-0.15, -0.155], [-0.11, -0.165], [-0.06, -0.175]]),
    half: curve([[-0.15, 0.112], [-0.11, 0.108], [-0.06, 0.09]]),
    sections: [{ z: 0, pts: [[0, 1], [0.55, 0.99], [0.9, 0.88], [1, 0.6], [0.92, 0.2], [0.6, 0.02], [0, 0]] }],
  };
  const visor: OutlineBody = {
    zs: stationsBetween(-0.15, -0.07, 6, 0.4),
    top: curve([[-0.15, -0.01], [-0.115, 0.04], [-0.07, 0.085]]),
    bottom: curve([[-0.15, -0.014], [-0.115, 0.03], [-0.07, 0.076]]),
    half: curve([[-0.15, 0.086], [-0.11, 0.08], [-0.07, 0.066]]),
    sections: [{ z: 0, pts: [[0, 1], [0.5, 0.985], [0.85, 0.9], [1, 0.4], [1, 0]] }],
  };
  bugEyeFace(ctx, {
    outline: BUG_EYE,
    x: 0.0765,
    y: -0.114,
    z: -0.19,
    yaw: 0.06,
    tilt: 0.04,
    depth: 0.065,
    projectors: [[0.003, -0.005, 0.023], [-0.028, 0.022, 0.009]],
    drl: { t0: -0.07, t1: 0.42, inset: 0.0065, width: 0.006 },
    mask,
    visor,
    visorTint: tint(F.screen, '#3a424c'),
    brackets: { ys: [-0.1, -0.17], toZ: -0.14, toHalf: 0.06 },
    indicator: { a: [0.122, -0.158, -0.14], b: [0.133, -0.162, -0.15] },
  });
}

/** Radiator shrouds on the tank flanks, silver on the RS. */
function shroud(): OutlineBody {
  return {
    zs: stationsBetween(-1.16, -0.76, 11, 0.4),
    top: curve([[-1.16, 0.87], [-1.1, 0.915], [-1.02, 0.955], [-0.93, 0.97], [-0.84, 0.955], [-0.76, 0.915]]),
    bottom: curve([[-1.16, 0.76], [-1.1, 0.69], [-1.02, 0.655], [-0.94, 0.65], [-0.86, 0.685], [-0.8, 0.74], [-0.76, 0.79]]),
    half: curve([[-1.16, 0.118], [-1.1, 0.15], [-1.02, 0.167], [-0.93, 0.171], [-0.84, 0.164], [-0.76, 0.145]]),
    sections: [
      { z: -1.16, pts: [[0.55, 1], [0.84, 0.98], [0.98, 0.9], [1, 0.62], [1, 0.3], [0.9, 0.05], [0.7, 0]] },
      { z: -0.76, pts: [[0.5, 1], [0.82, 0.98], [0.97, 0.9], [1, 0.62], [1, 0.3], [0.92, 0.06], [0.75, 0]] },
    ],
  };
}

function scoop(): OutlineBody {
  return {
    zs: stationsBetween(-1.15, -0.86, 8, 0.4),
    top: curve([[-1.15, 0.78], [-1.05, 0.78], [-0.86, 0.76]]),
    bottom: curve([[-1.15, 0.69], [-1.05, 0.635], [-0.96, 0.628], [-0.86, 0.65]]),
    half: curve([[-1.15, 0.108], [-1.07, 0.148], [-0.96, 0.162], [-0.86, 0.15]]),
    sections: [{ z: 0, pts: [[0.7, 1], [0.92, 0.9], [1, 0.62], [0.98, 0.3], [0.9, 0]] }],
  };
}

/** Very short, kicked-up tail. */
function tailBody(): OutlineBody {
  return {
    zs: stationsBetween(-0.6, 0.15, 12, 0.5),
    top: curve([[-0.6, 0.795], [-0.42, 0.81], [-0.28, 0.85], [-0.18, 0.91], [-0.04, 0.945], [0.08, 0.96], [0.15, 0.972]]),
    bottom: curve([[-0.6, 0.665], [-0.38, 0.69], [-0.16, 0.77], [-0.02, 0.85], [0.1, 0.915], [0.15, 0.945]]),
    half: curve([[-0.6, 0.135], [-0.42, 0.128], [-0.22, 0.106], [-0.04, 0.075], [0.15, 0.026]]),
    sections: [
      { z: -0.6, pts: [[0, 1], [0.6, 0.98], [0.95, 0.84], [1, 0.55], [0.93, 0.22], [0.6, 0.02], [0, 0]] },
      { z: 0.15, pts: [[0, 1], [0.74, 0.97], [1, 0.72], [0.98, 0.44], [0.84, 0.2], [0.42, 0.02], [0, 0]] },
    ],
  };
}

function body(ctx: KitContext): void {
  const dark = hard('#1b1c1f', 0.2, 0.42, 0.7);
  face(ctx);
  const mouth: Field = sideRegion(smooth2([[-1.17, 0.85], [-1.1, 0.82], [-1.05, 0.74], [-1.12, 0.69], [-1.17, 0.72]], 2, true));
  panelPair(ctx, shroud(), PAINT, { region: fNot(mouth), creases: [2], depth: 0.01 });
  panelPair(ctx, scoop(), F.texturedBlack, { depth: 0.008, q: 1 });
  buildTank(ctx, {
    front: -1.11,
    back: -0.58,
    top: 1.05,
    bottomFront: 0.85,
    bottomBack: 0.82,
    width: 0.33,
    style: 'muscle',
    knee: 0.18,
    capZ: -0.9,
    topLine: [[-1.11, 0.955], [-1.05, 0.995], [-0.96, 1.03], [-0.86, 1.05], [-0.77, 1.04], [-0.7, 1.005], [-0.64, 0.945], [-0.58, 0.865]],
    bottomLine: [[-1.11, 0.86], [-0.9, 0.82], [-0.58, 0.82]],
    halfLine: [[-1.11, 0.062], [-1.05, 0.11], [-0.96, 0.145], [-0.86, 0.153], [-0.77, 0.145], [-0.68, 0.105], [-0.58, 0.07]],
  });
  buildSeat(ctx, { front: -0.64, back: -0.3, yFront: 0.832, y: 0.822, yBack: 0.848, width: 0.28, thick: 0.07, frontWidth: 0.16 });
  buildSeat(ctx, { front: -0.285, back: -0.04, yFront: 0.895, y: 0.905, yBack: 0.93, width: 0.19, thick: 0.045, frontWidth: 0.14 }, tint(seatFinish(ctx), '#18191b'));
  const tm = outlineLoft(tailBody(), { su: ctx.seg(12, 4), sv: ctx.seg(6, 2), capBack: true });
  const seatHole: Field = fAnd(
    fOr(sideRegion([[-0.82, 0.795], [-0.3, 0.795], [-0.3, 1.4], [-0.82, 1.4]]), sideRegion([[-0.29, 0.88], [-0.03, 0.88], [-0.03, 1.4], [-0.29, 1.4]])),
    planRegion([[-0.82, -0.01], [-0.02, -0.01], [-0.02, 0.1], [-0.29, 0.1], [-0.3, 0.145], [-0.82, 0.145]]),
  );
  addPanel(ctx, 'chassis', tm, fNot(seatHole), PAINT, 0.0025, 0.012);
  tailLamp(ctx, smooth2([[-0.052, -0.006], [0.052, -0.006], [0.058, 0.004], [0.0, 0.011], [-0.058, 0.004]], 4, true), [0, 0.942, 0.11], -0.78, { count: 1 });
  sideCovers(ctx, [[-0.56, 0.765], [-0.42, 0.76], [-0.39, 0.69], [-0.5, 0.655], [-0.56, 0.7]], 0.124, dark);
  frontFender(ctx, { from: -0.5, to: 0.86, gap: 0.02, width: 0.14, f: hard('#1a1b1e', 0.2, 0.4, 0.8) });
  hugger(ctx, F.texturedBlack);
  plateHanger(ctx, { fromZ: -0.04, fromY: 0.85 });
  exhaust(ctx);
}

// ───────────────────────────── exhaust ─────────────────────────────

/** Three headers into a belly catalyser, then a short stubby tri-outlet silencer on the right. */
function exhaust(ctx: KitContext): void {
  const c = ctx.bp.engine.crank;
  const zf = c[2] - 0.235;
  headers(ctx, {
    r: 0.0185,
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
  collector(ctx, [0.015, 0.175, c[2] - 0.075], 0.038, 0.11, 'steel', 0.65);
  const box = hard('#1a1b1e', 0.4, 0.45, 0.3);
  ctx.add('chassis', roundBox(0.19, 0.085, 0.28, 0.038, ctx.micro ? 3 : 2), box, new THREE.Matrix4().makeTranslation(0.02, 0.165, c[2] + 0.09));
  heatPipe(ctx, [[0.03, 0.165, c[2] + 0.18], [0.1, 0.19, c[2] + 0.36], [0.135, 0.3, -0.36], [0.14, 0.39, -0.34]], 0.0235, 'steel', 0.6, 0.9);
  // Stubby brushed silencer canted up, three tail pipes in a triangle.
  outletCan(ctx, {
    a: [0.14, 0.395, -0.36],
    b: [0.158, 0.455, -0.07],
    r0: 0.052,
    r1: 0.058,
    shape: 'lobed',
    body: vary(F.titanium, { color: [0.42, 0.41, 0.39], rough: 0.36 }),
    cap: hard('#17181a', 0.5, 0.4, 0.3),
    outlets: [
      { dx: -0.02, dy: 0.016, r: 0.0125, len: 0.016 },
      { dx: 0.02, dy: 0.016, r: 0.0125, len: 0.016 },
      { dx: 0.0, dy: -0.022, r: 0.0125, len: 0.016 },
    ],
  });
  ctx.anchor('exhaustOutlet', [0.158, 0.455, -0.05]);
}

// ───────────────────────────── livery ─────────────────────────────

const RED = '#b5121b';

function lettering(p: Pen, main: string, accent: string): void {
  if (p.view !== 'right' && p.view !== 'left') return;
  p.text('STREET TRIPLE', -1.03, 0.87, { color: main, size: 0.0155, weight: '800', italic: true, spacing: 0.03 });
  p.text('RS', -0.77, 0.85, { color: accent, size: 0.022, weight: '900', italic: true });
}

function livery(c: LiveryCanvas, lv: Livery, env: LiveryEnv): void {
  const black = env.index === 1;
  c.views(ALL_VIEWS, (p) => {
    p.fill(lv.primary, black ? 'gloss' : 'metallic');
    if (p.view === 'right' || p.view === 'left') {
      // Silver shrouds / tank, dark lower flanks, red flash along the tank edge and tail.
      p.poly([[-1.2, 0.62], [-1.2, 0.9], [-1.06, 0.97], [-0.8, 0.96], [-0.76, 0.8], [-0.86, 0.64], [-1.04, 0.62]], black ? '#1e2024' : lv.primary, black ? 'satin' : 'metallic');
      p.poly([[-0.64, 0.82], [-0.4, 0.81], [-0.25, 0.9], [0.0, 0.95], [0.2, 0.99], [0.2, 0.64], [-0.62, 0.64]], black ? '#1e2024' : '#202226', 'satin');
      p.poly([[-1.1, 0.8], [-0.95, 0.775], [-0.8, 0.765], [-0.7, 0.78], [-0.8, 0.79], [-0.95, 0.805]], RED, 'gloss');
      p.line([[-0.36, 0.835], [-0.2, 0.9], [0.1, 0.96]], RED, 0.006);
      lettering(p, black ? '#d9dce0' : '#15161a', RED);
    } else if (p.view === 'top') {
      p.rect(-1.1, -0.03, -0.6, 0.03, black ? '#1e2024' : '#202226', 'satin');
      p.rect(-0.9, -0.006, -0.62, 0.006, RED, 'gloss');
    } else if (p.view === 'front') {
      p.rect(-1, 0.6, 1, 0.86, '#202226', 'satin');
    }
  });
}

// ───────────────────────────── blueprint ─────────────────────────────

export function streetTripleBlueprint(spec: BikeSpec): BikeBlueprint {
  const lv = spec.liveries[0];
  const bp: BikeBlueprint = {
    id: spec.id,
    source: 'authored',
    overall: [2.05, 0.78, 1.08],
    wheelbase: 1.399,
    rakeDeg: 23.9,
    trail: 0.0983,
    forkLength: 0.74,
    front: { tyre: '120/70ZR17', rimWidthIn: 3.5, crown: 0.9, tread: 'sport', tyreLabel: 'Sport Radial' },
    rear: { tyre: '180/55ZR17', rimWidthIn: 5.5, crown: 0.95, tread: 'sport', tyreLabel: 'Sport Radial' },
    frontWheel: { type: 'cast', spokes: 5, shape: 'y', color: lv.wheel, machinedLip: false },
    rearWheel: { type: 'cast', spokes: 5, shape: 'y', color: lv.wheel },
    fork: { type: 'usd', stanchion: 0.043, spacing: 0.205, outerColor: '#17181b', innerColor: '#c9a65a', footColor: '#1b1c1f', capColor: '#2a2c30', adjusterColor: '#c99a2c', label: 'ÖHLINS', labelColor: '#c9a65a', aboveClamp: 0.01, clampGap: 0.19 },
    frontBrake: { discs: 2, discDia: 0.31, disc: 'floating', carrierColor: '#2b2d31', caliper: 'radialMono4', caliperColor: '#25272b', caliperText: 'brembo', caliperTextColor: '#f2f2f2', caliperAngleDeg: 76 },
    rearBrake: { discs: 1, discDia: 0.22, disc: 'fixed', carrierColor: '#2b2d31', caliper: 'axial1', caliperColor: '#25272b', caliperAngleDeg: 200 },
    frame: { type: 'twinSpar', color: '#25272b', metal: 0.8, rough: 0.4, subframe: 'cast', subframeColor: '#202125', width: 0.24 },
    swingarm: { type: 'box', length: 0.58, angleDeg: 8, color: '#b7bbc1', metal: 0.8, rough: 0.38 },
    shock: { layout: 'mono', springColor: '#1d1e22', bodyColor: '#c99a2c', reservoir: true },
    drive: { type: 'chain', side: 'left', frontTeeth: 16, rearTeeth: 45, pitch: 0.015875, sprocketColor: '#1e1f22' },
    engine: {
      layout: 'I3',
      cc: 765,
      crank: [0, 0.39, -0.775],
      tiltDeg: 22,
      caseColor: '#1b1c1f',
      coverColor: '#33353a',
      headColor: '#25272b',
      camCoverColor: '#17181b',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.31, h: 0.28, z: -1.11, y: 0.58, tiltDeg: 12, curved: true },
      width: 0.37,
    },
    exhaust: { route: 'none', side: 'right', can: 'tri', canLength: 0.3, canDia: 0.11, canFinish: 'titanium', headerFinish: 'steel' },
    cockpit: {
      bars: 'tubular',
      grip: [0.355, 1.03, -0.88],
      barDia: 0.022,
      dash: 'tft',
      dashPos: [0, 1.05, -1.1],
      dashSize: [0.115, 0.066],
      dashTiltDeg: 36,
      dashMount: 'bars',
      mirrors: 'bar',
      mirrorPos: [0.31, 1.2, -0.95],
      mirrorSize: [0.115, 0.065],
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
    seat: { height: 0.825, front: -0.64, back: -0.3, pillion: 'seat', color: '#151515' },
    rider: { hip: [0, 0.915, -0.47], peg: [0.19, 0.37, -0.41], torsoPitch: 0.3 },
    footrests: 'rearset',
    plate: { mount: 'hanger', pos: [0, 0.76, 0.26], tiltDeg: -20 },
    body,
    livery,
    groundClearance: 0.14,
    features: [],
    zones: { splitY: 0.6, decal: [-0.9, 0.95] },
  };
  const hp = computeHardpoints(bp);
  bp.cockpit.grip = steerToBike(hp, [0.355, 0.15, 0.17]);
  bp.cockpit.dashPos = steerToBike(hp, [0, 0.065, -0.095]);
  bp.cockpit.mirrorPos = steerToBike(hp, [0.315, 0.32, 0.115]);
  return bp;
}
