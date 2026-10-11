import * as THREE from 'three';
import type { BikeSpec, Livery } from '../../../data/bikes';
import type { KitContext } from '../context';
import { addPanel, buildSeat, buildTank, frontFender, PAINT, seatFinish } from '../kit/body';
import { can, collector, headers, heatPipe } from '../kit/jp-sport-exhaust';
import { undertray } from '../kit/jp-sport-parts';
import { ledStrip } from '../kit/lights';
import { hugger, plateHanger } from '../kit/rear';
import { curve, outlineLoft, stationPts, stationsBetween, type OutlineBody } from '../kit/shape';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv, type Pen } from '../livery';
import { extrude, roundBox, smooth2, type P2, type P3 } from '../mesh';
import { F, hard, tint, vary } from '../sink';
import { fAnd, fNot, fOr, planRegion, sideRegion, type Field } from '../surface';
import type { BikeBlueprint } from '../types';
import { bladeIndicator, forkBrackets, loftPart, panelPair, sideCovers, steerLamp, steerStrip } from './family-jp-naked-parts';

/**
 * Kawasaki Z900 (2020–2024).
 * Spec sheet: wheelbase 1450 mm, caster 24.9°, trail 110 mm, seat 800 mm,
 * L×W×H 2070 × 825 × 1080 mm, ground clearance 145 mm, 120/70ZR17 + 180/55ZR17 on
 * 3.50/5.50 five-spoke cast wheels, 41 mm USD fork, twin 300 mm petal discs with
 * four-piston calipers, high-tensile steel trellis frame, horizontal back-link rear,
 * 948 cc inline four.
 * Design cues ("Sugomi"): the crouched, forward-leaning stance; a sharp head cowl with
 * four LED headlamps set in a V and a meter visor over the TFT; big angular radiator
 * shrouds pointing down at the front wheel; the trellis frame (green on the black bike);
 * four headers fanning in front of the engine into a short silencer low on the right;
 * a sharp upswept tail with the Z-shaped LED tail light.
 */

function shroud(): OutlineBody {
  return {
    zs: stationsBetween(-1.27, -0.8, 11, 0.4),
    top: curve([[-1.27, 0.86], [-1.2, 0.91], [-1.1, 0.95], [-0.98, 0.975], [-0.88, 0.97], [-0.8, 0.93]]),
    bottom: curve([[-1.27, 0.7], [-1.22, 0.64], [-1.15, 0.63], [-1.05, 0.67], [-0.93, 0.73], [-0.84, 0.8], [-0.8, 0.84]]),
    half: curve([[-1.27, 0.15], [-1.18, 0.22], [-1.06, 0.248], [-0.94, 0.248], [-0.8, 0.205]]),
    sections: [
      { z: -1.27, pts: [[0.66, 1], [0.88, 0.94], [0.98, 0.74], [1, 0.48], [0.95, 0.2], [0.84, 0]] },
      { z: -0.8, pts: [[0.55, 1], [0.8, 0.95], [0.95, 0.8], [1, 0.55], [0.98, 0.26], [0.92, 0]] },
    ],
  };
}

/** Black lower shroud blade (the second layer under the painted shroud). */
function shroudLower(): OutlineBody {
  return {
    zs: stationsBetween(-1.25, -0.9, 8, 0.4),
    top: curve([[-1.25, 0.76], [-1.12, 0.75], [-0.98, 0.76], [-0.9, 0.78]]),
    bottom: curve([[-1.25, 0.66], [-1.19, 0.58], [-1.1, 0.57], [-0.98, 0.62], [-0.9, 0.68]]),
    half: curve([[-1.25, 0.16], [-1.14, 0.222], [-1.0, 0.232], [-0.9, 0.215]]),
    sections: [{ z: 0, pts: [[0.72, 1], [0.93, 0.88], [1, 0.6], [0.97, 0.28], [0.9, 0]] }],
  };
}

function tail(): OutlineBody {
  return {
    zs: stationsBetween(-0.66, 0.09, 13, 0.5),
    top: curve([[-0.66, 0.785], [-0.46, 0.795], [-0.3, 0.83], [-0.26, 0.88], [-0.1, 0.92], [0.04, 0.965], [0.09, 0.985]]),
    bottom: curve([[-0.66, 0.66], [-0.4, 0.69], [-0.16, 0.76], [0.0, 0.86], [0.06, 0.92], [0.09, 0.955]]),
    half: curve([[-0.66, 0.14], [-0.46, 0.134], [-0.24, 0.112], [-0.04, 0.074], [0.09, 0.028]]),
    sections: [
      { z: -0.66, pts: [[0, 1], [0.6, 0.98], [0.95, 0.84], [1, 0.55], [0.93, 0.22], [0.6, 0.02], [0, 0]] },
      { z: 0.09, pts: [[0, 1], [0.74, 0.97], [1, 0.72], [0.98, 0.44], [0.84, 0.2], [0.42, 0.02], [0, 0]] },
    ],
  };
}

/** Head cowl in the steering-local frame: sharp hood with cheeks, visor over the TFT. */
function cowl(): OutlineBody {
  const zF = -0.225;
  return {
    zs: stationsBetween(zF, -0.045, 9, 0.35),
    top: curve([[zF, -0.188], [-0.18, -0.152], [-0.13, -0.088], [-0.09, -0.03], [-0.06, 0.004], [-0.045, 0.01]]),
    bottom: curve([[zF, -0.31], [-0.18, -0.322], [-0.12, -0.326], [-0.06, -0.3], [-0.045, -0.29]]),
    half: curve([[zF, 0.1], [-0.19, 0.12], [-0.15, 0.13], [-0.1, 0.132], [-0.045, 0.112]]),
    sections: [
      { z: zF, pts: [[0, 1], [0.55, 0.97], [0.95, 0.8], [1, 0.56], [0.82, 0.18], [0.35, 0], [0, 0]] },
      { z: -0.045, pts: [[0, 1], [0.6, 0.98], [0.95, 0.85], [1, 0.6], [0.86, 0.2], [0.4, 0], [0, 0]] },
    ],
  };
}

function headUnit(ctx: KitContext): void {
  const ob = cowl();
  const zFace = -0.185;
  // Open-fronted hood: its front edge stands proud of the recessed black face plate.
  loftPart(ctx, ob, PAINT, { steer: true, depth: 0.008, q: 1.2, creases: [2, 4] });
  const half = stationPts(ob, zFace).map(([x, y]) => [x * 0.985, y] as P2);
  const full: P2[] = [...half, ...half.slice(1, -1).reverse().map(([x, y]) => [-x, y] as P2)];
  ctx.add('steer', extrude(full, 0.05, { plane: 'xy', bevel: 0.002, center: zFace + 0.025 }), F.texturedBlack, ctx.steerM);
  // Four LED headlamps in a V: an upper-outer and a lower-inner lamp per side, outer ends raised.
  for (const s of [-1, 1]) {
    const upper: P2[] = smooth2([[-0.036, -0.006], [0.034, -0.008], [0.038, 0.007], [-0.03, 0.008]], 1, true);
    steerLamp(ctx, upper, [s * 0.068, -0.2, zFace - 0.001], { kind: 'head', inner: 'led', count: 1, depth: 0.025, rim: 0.004 }, 0, -s * 0.38);
    const lower: P2[] = smooth2([[-0.026, -0.006], [0.024, -0.007], [0.028, 0.006], [-0.022, 0.007]], 1, true);
    steerLamp(ctx, lower, [s * 0.036, -0.243, zFace - 0.001], { kind: 'head', inner: 'led', count: 1, depth: 0.025, rim: 0.004 }, 0, -s * 0.45);
    // Position-light guide along the outer edge of the mask.
    steerStrip(ctx, [[s * 0.108, -0.19, zFace - 0.004], [s * 0.098, -0.228, zFace - 0.004], [s * 0.078, -0.266, zFace - 0.004]], 0.006, 0.004, 'drl');
  }
  forkBrackets(ctx, [-0.215, -0.285], -0.07, 0.07);
  for (const s of [-1, 1]) bladeIndicator(ctx, 'steer', ctx.fromSteer([s * 0.12, -0.3, -0.09]), ctx.fromSteer([s * 0.17, -0.305, -0.1]), 0.006);
}

function body(ctx: KitContext): void {
  const dark = hard('#18191c', 0.25, 0.4, 0.7);
  headUnit(ctx);
  // ── Radiator shrouds: painted upper blade over a black lower blade ──
  panelPair(ctx, shroud(), PAINT, { creases: [2], depth: 0.01 });
  panelPair(ctx, shroudLower(), F.texturedBlack, { depth: 0.008, q: 1 });
  // ── Tank: high at the front, falling steeply to the seat (the crouched stance) ──
  buildTank(ctx, {
    front: -1.07,
    back: -0.63,
    top: 1.075,
    bottomFront: 0.87,
    bottomBack: 0.8,
    width: 0.42,
    style: 'muscle',
    knee: 0.16,
    capZ: -0.94,
    topLine: [[-1.07, 0.99], [-1.0, 1.048], [-0.92, 1.074], [-0.83, 1.066], [-0.74, 1.02], [-0.67, 0.94], [-0.63, 0.88]],
    bottomLine: [[-1.07, 0.87], [-0.86, 0.83], [-0.63, 0.8]],
    halfLine: [[-1.07, 0.11], [-0.99, 0.18], [-0.9, 0.212], [-0.8, 0.205], [-0.7, 0.16], [-0.63, 0.105]],
  });
  // ── Seats, tail, undertray, Z tail light ──
  buildSeat(ctx, { front: -0.64, back: -0.3, yFront: 0.815, y: 0.8, yBack: 0.83, width: 0.3, thick: 0.075, frontWidth: 0.17 });
  buildSeat(ctx, { front: -0.285, back: -0.04, yFront: 0.875, y: 0.89, yBack: 0.92, width: 0.2, thick: 0.05, frontWidth: 0.16 }, tint(seatFinish(ctx), '#18191b'));
  const tm = outlineLoft(tail(), { su: ctx.seg(12, 4), sv: ctx.seg(6, 2), capBack: true });
  const seatHole: Field = fAnd(
    fOr(sideRegion([[-0.85, 0.78], [-0.29, 0.78], [-0.29, 1.4], [-0.85, 1.4]]), sideRegion([[-0.28, 0.86], [-0.01, 0.86], [-0.01, 1.4], [-0.28, 1.4]])),
    planRegion([[-0.85, -0.01], [0.0, -0.01], [0.0, 0.105], [-0.28, 0.105], [-0.29, 0.15], [-0.85, 0.15]]),
  );
  // Sharp "Z" cut-out in the tail side (the black undertray shows through).
  const tailSlash = sideRegion(smooth2([[-0.46, 0.745], [-0.22, 0.79], [-0.02, 0.88], [-0.1, 0.83], [-0.38, 0.74]], 2, true));
  addPanel(ctx, 'chassis', tm, fAnd(fNot(seatHole), fNot(tailSlash)), PAINT, 0.0025, 0.012);
  undertray(ctx, { z0: -0.5, z1: 0.07, top0: 0.72, top1: 0.95, bot0: 0.66, botMid: 0.72, bot1: 0.93, w0: 0.13, w1: 0.03 });
  zTailLight(ctx);
  sideCovers(ctx, [[-0.65, 0.77], [-0.44, 0.76], [-0.4, 0.66], [-0.58, 0.61], [-0.66, 0.68]], 0.13, dark);
  frontFender(ctx, { from: -0.45, to: 0.82, gap: 0.02, width: 0.15, f: PAINT });
  hugger(ctx, F.texturedBlack);
  plateHanger(ctx, { fromZ: -0.02, fromY: 0.78 });
  exhaust(ctx);
}

/** The Z-shaped LED tail light on a black lens under the tail tip. */
function zTailLight(ctx: KitContext): void {
  const z = 0.085, y = 0.945;
  const tilt = -0.55;
  const m = new THREE.Matrix4().makeTranslation(0, y, z).multiply(new THREE.Matrix4().makeRotationX(tilt));
  const plate: P2[] = smooth2([[-0.055, -0.02], [0.055, -0.02], [0.06, 0.018], [-0.06, 0.018]], 2, true);
  ctx.add('chassis', extrude(plate, 0.012, { plane: 'xy', bevel: 0.003, center: -0.006 }), hard('#1a0606', 0.1, 0.1, 1), m);
  const P = (x: number, yy: number): P3 => {
    const v = new THREE.Vector3(x, yy, 0.004).applyMatrix4(m);
    return [v.x, v.y, v.z];
  };
  const nrm = new THREE.Vector3(0, 0, 1).transformDirection(m);
  ledStrip(ctx, 'chassis', [P(-0.045, 0.011), P(0.0, 0.011), P(0.045, 0.011)], 0.007, 0.004, 'tail', [nrm.x, nrm.y, nrm.z]);
  ledStrip(ctx, 'chassis', [P(0.043, 0.008), P(0.0, -0.001), P(-0.043, -0.01)], 0.006, 0.004, 'tail', [nrm.x, nrm.y, nrm.z]);
  ledStrip(ctx, 'chassis', [P(-0.045, -0.013), P(0.0, -0.013), P(0.045, -0.013)], 0.007, 0.004, 'tail', [nrm.x, nrm.y, nrm.z]);
}

/**
 * 4-into-2-into-1: the headers fan down in front of the crankcase, pair up under it into
 * the pre-chamber, and the short silencer pokes out low on the right below the footrest.
 */
function exhaust(ctx: KitContext): void {
  const c = ctx.bp.engine.crank;
  const zf = c[2] - 0.29;
  const col: P3 = [0.03, 0.2, c[2] - 0.03];
  headers(ctx, {
    r: 0.018,
    heat: 'steel',
    tEnd: 0.72,
    route: (_i, p, j) => {
      const x = p.pos[0];
      const pair = x > 0 ? 1 : -1;
      return [
        [x * 1.04, 0.52 - 0.012 * j, zf],
        [x * 0.92, 0.36, zf + 0.008],
        [pair * 0.06 + x * 0.25, 0.22, zf + 0.1],
        [col[0] + pair * 0.035, col[1] + 0.004, col[2] - 0.1],
      ];
    },
  });
  collector(ctx, col, 0.045, 0.14, 'steel', 0.66);
  const box = hard('#17181a', 0.35, 0.45, 0.3);
  const bc: P3 = [0.035, 0.2, c[2] + 0.15];
  ctx.add('chassis', roundBox(0.24, 0.095, 0.24, 0.04, ctx.micro ? 3 : 2), box, new THREE.Matrix4().makeTranslation(...bc));
  heatPipe(ctx, [[col[0], col[1], col[2] + 0.06], [0.04, 0.2, c[2] + 0.05]], 0.03, 'steel', 0.66, 0.75);
  // Short, squat silencer: black body, brushed end cap angled up towards the rear tyre.
  const a: P3 = [0.135, 0.22, c[2] + 0.2];
  const b: P3 = [0.18, 0.29, c[2] + 0.4];
  heatPipe(ctx, [[bc[0] + 0.09, bc[1], bc[2] + 0.05], [a[0] - 0.01, a[1] - 0.006, a[2] - 0.03], a], 0.03, 'black', 0.8, 1);
  can(ctx, { a, b, shape: 'tri', r0: 0.06, r1: 0.068, finish: box, cap: vary(F.brushedAlu, { rough: 0.25 }), slash: 0.3, roll: 0.5, outletR: 0.026 });
  ctx.anchor('exhaustOutlet', b);
}

// ───────────────────────────── livery ─────────────────────────────

const KAWA_GREEN = '#5fd02c';

function lettering(p: Pen, main: string, accent: string): void {
  if (p.view !== 'right' && p.view !== 'left') return;
  p.text('Z', -1.08, 0.82, { color: accent, size: 0.07, weight: '900', italic: true, stretch: 1.2 });
  p.text('Z900', -0.16, 0.83, { color: main, size: 0.024, weight: '900', italic: true });
  p.text('KAWASAKI', -0.85, 0.93, { color: main, size: 0.016, weight: '800', spacing: 0.05 });
}

function livery(c: LiveryCanvas, lv: Livery, env: LiveryEnv): void {
  const green = env.index === 1;
  c.views(ALL_VIEWS, (p) => {
    if (green) {
      // Candy Lime Green tank, shrouds and tail; black lower blades, tail base and fender sides.
      p.fill(lv.primary, 'pearl');
      if (p.view === 'right' || p.view === 'left') {
        p.poly([[-1.3, 0.0], [-1.3, 0.66], [-1.1, 0.68], [-0.9, 0.75], [-0.7, 0.78], [0.3, 1.0], [0.3, 0.0]], lv.secondary, 'metallic');
        p.line([[-1.25, 0.79], [-1.05, 0.8], [-0.86, 0.85]], '#111214', 0.004);
        lettering(p, '#111214', '#111214');
      } else if (p.view === 'front' || p.view === 'rear') p.rect(-1, 0, 1, 0.62, lv.secondary, 'metallic');
      return;
    }
    // Metallic Spark Black with matte graphite panels and green accents.
    p.fill(lv.primary, 'metallic');
    if (p.view === 'right' || p.view === 'left') {
      p.poly([[-1.25, 0.9], [-1.0, 0.96], [-0.86, 0.95], [-0.9, 0.86], [-1.12, 0.8]], lv.secondary, 'matte');
      p.line([[-1.26, 0.77], [-1.06, 0.79], [-0.86, 0.84]], KAWA_GREEN, 0.005);
      p.line([[-0.44, 0.735], [-0.2, 0.78]], KAWA_GREEN, 0.004);
      lettering(p, '#c9ccd1', KAWA_GREEN);
    }
  });
}

export function z900Blueprint(spec: BikeSpec): BikeBlueprint {
  const lv = spec.liveries[0];
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.07, 0.825, 1.08],
    wheelbase: 1.45,
    rakeDeg: 24.9,
    trail: 0.11,
    forkLength: 0.73,
    front: { tyre: '120/70ZR17', rimWidthIn: 3.5, crown: 0.9, tread: 'sport', tyreLabel: 'Sport Radial' },
    rear: { tyre: '180/55ZR17', rimWidthIn: 5.5, crown: 1.0, tread: 'sport', tyreLabel: 'Sport Radial' },
    frontWheel: { type: 'cast', spokes: 5, shape: 'y', color: lv.wheel },
    rearWheel: { type: 'cast', spokes: 5, shape: 'y', color: lv.wheel },
    fork: { type: 'usd', stanchion: 0.041, spacing: 0.21, outerColor: '#1c1d20', innerColor: '#c9ccd2', footColor: '#1c1d20', capColor: '#2a2c30', adjusterColor: '#c99a2c', aboveClamp: 0.01, clampGap: 0.18 },
    frontBrake: { discs: 2, discDia: 0.3, disc: 'wave', carrierColor: '#2b2d31', caliper: 'axial2', caliperColor: '#26272b', caliperAngleDeg: 72 },
    rearBrake: { discs: 1, discDia: 0.25, disc: 'wave', carrierColor: '#2b2d31', caliper: 'axial1', caliperColor: '#26272b', caliperAngleDeg: 200 },
    // High-tensile steel trellis; its colour follows the livery (green on the black bike).
    frame: { type: 'trellis', color: lv.frame, metal: 0.35, rough: 0.38, subframe: 'tubular', subframeColor: '#1b1c1f', width: 0.31, liveryColor: true },
    swingarm: { type: 'box', length: 0.57, angleDeg: 10, color: '#1d1e21', metal: 0.45, rough: 0.42 },
    shock: { layout: 'mono', springColor: '#5fd02c', bodyColor: '#2a2c30', reservoir: false },
    drive: { type: 'chain', side: 'left', frontTeeth: 15, rearTeeth: 44, pitch: 0.015875, sprocketColor: '#1e1f22' },
    engine: {
      layout: 'I4',
      cc: 948,
      crank: [0, 0.4, -0.8],
      tiltDeg: 26,
      caseColor: '#1b1c1f',
      coverColor: '#2e3035',
      headColor: '#222428',
      camCoverColor: '#18191c',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.42, h: 0.31, z: -1.2, y: 0.62, tiltDeg: 12, curved: true },
      width: 0.4,
    },
    // Custom 4-into-2-into-1 with the short right-side silencer (see `exhaust`).
    exhaust: { route: 'none', side: 'right', can: 'stubby', canLength: 0.2, canDia: 0.13, canFinish: 'black', headerFinish: 'steel' },
    cockpit: {
      bars: 'tubular',
      grip: [0.36, 1.045, -0.88],
      barDia: 0.023,
      dash: 'tft',
      dashPos: [0, 1.005, -1.165],
      dashSize: [0.1, 0.06],
      dashTiltDeg: 45,
      dashMount: 'bars',
      mirrors: 'bar',
      mirrorPos: [0.34, 1.2, -0.94],
      mirrorSize: [0.13, 0.06],
      mirrorIndicators: false,
      mirrorShape: 'sport',
      mirrorColor: '#141517',
      topClamp: 'cast',
      steeringDamper: 'none',
      leverColor: '#2a2c30',
      reservoirs: true,
      clutch: 'cable',
      ignition: 'clamp',
      switchColor: '#151618',
      gripColor: '#141414',
      barEndColor: '#2a2c30',
    },
    lights: { head: 'custom', tail: 'custom', rearIndicators: 'stalk' },
    seat: { height: 0.8, front: -0.64, back: -0.3, pillion: 'seat', color: '#151515' },
    rider: { hip: [0, 0.88, -0.49], peg: [0.2, 0.345, -0.45], torsoPitch: 0.3, eye: [0, 1.42, -0.58] },
    footrests: 'rearset',
    plate: { mount: 'hanger', pos: [0, 0.58, 0.36], tiltDeg: -12 },
    body,
    livery,
    groundClearance: 0.145,
    features: ['trellis'],
    zones: { splitY: 0.6, decal: [-1.08, 0.82] },
  };
}
