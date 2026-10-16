import * as THREE from 'three';
import type { BikeSpec, Livery } from '../../../data/bikes';
import type { KitContext } from '../context';
import { addPanel, buildSeat, buildTank, frontFender, PAINT, seatFinish } from '../kit/body';
import { can, collector, headers, heatPipe } from '../kit/jp-sport-exhaust';
import { steelDiamond } from '../kit/jp-sport-frame';
import { tailLamp, undertray } from '../kit/jp-sport-parts';
import { hugger, plateHanger } from '../kit/rear';
import { curve, outlineLoft, stationPts, stationsBetween, type OutlineBody } from '../kit/shape';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv, type Pen } from '../livery';
import { extrude, smooth2, type P2, type P3 } from '../mesh';
import { F, hard, tint, vary } from '../sink';
import { fAnd, fNot, fOr, planRegion, sideRegion, type Field } from '../surface';
import type { BikeBlueprint } from '../types';
import { bladeIndicator, forkBrackets, loftPart, panelPair, sideCovers, steerLamp, steerStrip } from './family-jp-naked-parts';

/**
 * Honda CB500 Hornet (2024).
 * Spec sheet: wheelbase 1420 mm, caster 25°, trail 102 mm, seat 785 mm,
 * L×W×H 2090 × 780 × 1060 mm, ground clearance 150 mm, 120/70ZR17 + 160/60ZR17 on
 * 3.50/4.50 cast wheels, 41 mm Showa SFF-BP USD fork (gold outer tubes), twin 296 mm
 * discs with radial four-piston calipers, 35 mm-tube steel diamond frame, steel
 * swingarm, 471 cc 180° parallel twin.
 * Design cues: the compact twin-LED face (two small lamps side by side under thin DRL
 * brows), sharp angular tank shrouds whose tips point down at the front wheel, the black
 * tube frame visible under the tank, two silver headers in front of the engine, the
 * short muffler low on the right below the footrest, a slim upswept tail.
 */

function shroud(): OutlineBody {
  return {
    zs: stationsBetween(-1.22, -0.8, 11, 0.4),
    top: curve([[-1.22, 0.83], [-1.15, 0.88], [-1.06, 0.92], [-0.96, 0.945], [-0.87, 0.94], [-0.8, 0.9]]),
    bottom: curve([[-1.22, 0.62], [-1.17, 0.6], [-1.1, 0.63], [-1.0, 0.69], [-0.9, 0.74], [-0.8, 0.8]]),
    half: curve([[-1.22, 0.14], [-1.14, 0.2], [-1.04, 0.226], [-0.92, 0.222], [-0.8, 0.19]]),
    sections: [
      { z: -1.22, pts: [[0.62, 1], [0.86, 0.93], [0.98, 0.72], [1, 0.46], [0.94, 0.18], [0.8, 0]] },
      { z: -0.8, pts: [[0.55, 1], [0.8, 0.95], [0.95, 0.8], [1, 0.55], [0.98, 0.26], [0.92, 0]] },
    ],
  };
}

/** Black inner wing under each shroud (frames the radiator). */
function innerWing(): OutlineBody {
  return {
    zs: stationsBetween(-1.19, -0.92, 7, 0.4),
    top: curve([[-1.19, 0.76], [-1.06, 0.78], [-0.92, 0.8]]),
    bottom: curve([[-1.19, 0.58], [-1.1, 0.56], [-1.0, 0.6], [-0.92, 0.66]]),
    half: curve([[-1.19, 0.13], [-1.06, 0.19], [-0.92, 0.19]]),
    sections: [{ z: 0, pts: [[0.72, 1], [0.93, 0.88], [1, 0.6], [0.97, 0.28], [0.9, 0]] }],
  };
}

function tail(): OutlineBody {
  return {
    zs: stationsBetween(-0.66, 0.06, 12, 0.5),
    top: curve([[-0.66, 0.77], [-0.46, 0.78], [-0.3, 0.805], [-0.26, 0.85], [-0.1, 0.89], [0.02, 0.925], [0.06, 0.94]]),
    bottom: curve([[-0.66, 0.65], [-0.4, 0.67], [-0.16, 0.73], [-0.02, 0.83], [0.03, 0.885], [0.06, 0.915]]),
    half: curve([[-0.66, 0.135], [-0.46, 0.13], [-0.24, 0.108], [-0.05, 0.072], [0.06, 0.028]]),
    sections: [
      { z: -0.66, pts: [[0, 1], [0.6, 0.98], [0.95, 0.84], [1, 0.55], [0.93, 0.22], [0.6, 0.02], [0, 0]] },
      { z: 0.06, pts: [[0, 1], [0.74, 0.97], [1, 0.72], [0.98, 0.44], [0.84, 0.2], [0.42, 0.02], [0, 0]] },
    ],
  };
}

/** Compact twin-LED head unit on the fork (steering-local frame). */
function headUnit(ctx: KitContext): void {
  const zF = -0.19, zB = -0.075;
  const shell: OutlineBody = {
    zs: stationsBetween(zF, zB, 7, 0.3),
    top: curve([[zF, -0.205], [-0.14, -0.19], [zB, -0.182]]),
    bottom: curve([[zF, -0.3], [-0.14, -0.31], [zB, -0.3]]),
    half: curve([[zF, 0.1], [-0.15, 0.112], [zB, 0.098]]),
    // Hexagonal face: flat top, chamfered upper and lower corners.
    sections: [{ z: 0, pts: [[0, 1], [0.58, 1], [1, 0.72], [1, 0.42], [0.62, 0.02], [0, 0]] }],
  };
  const black = hard('#121315', 0.15, 0.5, 0.4);
  loftPart(ctx, shell, black, { steer: true, depth: 0.006, creases: [1, 2, 3, 4] });
  // Recessed face plate with the two LED lamps side by side, tilted down towards the centre.
  const zFace = zF + 0.012;
  const half = stationPts(shell, zFace).map(([x, y]) => [x * 0.985, y] as P2);
  const full: P2[] = [...half, ...half.slice(1, -1).reverse().map(([x, y]) => [-x, y] as P2)];
  ctx.add('steer', extrude(full, 0.03, { plane: 'xy', bevel: 0.002, center: zFace + 0.015 }), F.texturedBlack, ctx.steerM);
  for (const s of [-1, 1]) {
    const lens: P2[] = smooth2([[-0.032, -0.016], [0.032, -0.016], [0.036, 0.014], [-0.03, 0.016]], 2, true);
    steerLamp(ctx, lens, [s * 0.044, -0.252, zFace - 0.001], { kind: 'head', inner: 'led', count: 2, depth: 0.025, rim: 0.004 }, 0, s * 0.12);
    // Thin DRL brow over each lamp, following the chamfered upper corner.
    steerStrip(ctx, [[s * 0.012, -0.226, zFace - 0.004], [s * 0.05, -0.222, zFace - 0.004], [s * 0.088, -0.214, zFace - 0.002]], 0.006, 0.004);
  }
  forkBrackets(ctx, [-0.215, -0.28], zB + 0.004, 0.055);
}

function body(ctx: KitContext): void {
  const dark = hard('#1b1c1f', 0.2, 0.42, 0.7);
  steelDiamond(ctx, { width: 0.3, r: 0.0175 });
  headUnit(ctx);
  // ── Angular shrouds over black inner wings ──
  panelPair(ctx, shroud(), PAINT, { creases: [2, 4], depth: 0.01 });
  panelPair(ctx, innerWing(), F.texturedBlack, { depth: 0.008, q: 1 });
  for (const s of [-1, 1]) bladeIndicator(ctx, 'chassis', [s * 0.15, 0.74, -1.19], [s * 0.19, 0.745, -1.225], 0.0065);
  buildTank(ctx, {
    front: -1.04,
    back: -0.62,
    top: 1.035,
    bottomFront: 0.84,
    bottomBack: 0.79,
    width: 0.39,
    style: 'muscle',
    knee: 0.15,
    capZ: -0.9,
    topLine: [[-1.04, 0.95], [-0.97, 1.0], [-0.89, 1.03], [-0.8, 1.035], [-0.72, 1.005], [-0.66, 0.94], [-0.62, 0.875]],
    bottomLine: [[-1.04, 0.84], [-0.84, 0.81], [-0.62, 0.79]],
    halfLine: [[-1.04, 0.1], [-0.96, 0.168], [-0.87, 0.195], [-0.77, 0.185], [-0.68, 0.148], [-0.62, 0.1]],
  });
  // ── Seats, tail, undertray, light ──
  buildSeat(ctx, { front: -0.64, back: -0.3, yFront: 0.8, y: 0.785, yBack: 0.81, width: 0.29, thick: 0.075, frontWidth: 0.17 });
  buildSeat(ctx, { front: -0.285, back: -0.05, yFront: 0.86, y: 0.872, yBack: 0.895, width: 0.2, thick: 0.05, frontWidth: 0.16 }, tint(seatFinish(ctx), '#18191b'));
  const tm = outlineLoft(tail(), { su: ctx.seg(12, 4), sv: ctx.seg(6, 2), capBack: true });
  const seatHole: Field = fAnd(
    fOr(sideRegion([[-0.85, 0.765], [-0.29, 0.765], [-0.29, 1.4], [-0.85, 1.4]]), sideRegion([[-0.28, 0.845], [-0.04, 0.845], [-0.04, 1.4], [-0.28, 1.4]])),
    planRegion([[-0.85, -0.01], [-0.03, -0.01], [-0.03, 0.105], [-0.28, 0.105], [-0.29, 0.15], [-0.85, 0.15]]),
  );
  const tailCut = sideRegion(smooth2([[-0.48, 0.71], [-0.22, 0.76], [-0.06, 0.84], [-0.16, 0.78], [-0.4, 0.705]], 3, true));
  addPanel(ctx, 'chassis', tm, fAnd(fNot(seatHole), fNot(tailCut)), PAINT, 0.0025, 0.012);
  undertray(ctx, { z0: -0.5, z1: 0.05, top0: 0.7, top1: 0.91, bot0: 0.65, botMid: 0.71, bot1: 0.88, w0: 0.122, w1: 0.03 });
  tailLamp(ctx, smooth2([[-0.05, -0.006], [0.05, -0.006], [0.056, 0.004], [0.0, 0.01], [-0.056, 0.004]], 4, true), [0, 0.905, 0.055], -0.75);
  sideCovers(ctx, [[-0.65, 0.76], [-0.44, 0.75], [-0.4, 0.65], [-0.58, 0.6], [-0.66, 0.67]], 0.128, dark);
  frontFender(ctx, { from: -0.45, to: 0.82, gap: 0.02, width: 0.15, f: dark });
  hugger(ctx, F.texturedBlack);
  plateHanger(ctx, { fromZ: -0.03, fromY: 0.76 });
  exhaust(ctx);
}

/**
 * 2-into-1: both headers drop in front of the crankcase and run back under it; the short
 * muffler sits low on the right below the footrest, angled up towards the rear tyre.
 */
function exhaust(ctx: KitContext): void {
  const c = ctx.bp.engine.crank;
  const zf = c[2] - 0.24;
  const col: P3 = [0.05, 0.21, c[2] + 0.02];
  headers(ctx, {
    r: 0.02,
    heat: 'steel',
    tEnd: 0.7,
    route: (_i, p) => {
      const x = p.pos[0];
      return [
        [x * 1.05, 0.46, zf],
        [x * 0.9, 0.31, zf + 0.012],
        [x * 0.6 + 0.03, 0.22, zf + 0.1],
        [col[0] + x * 0.3, col[1] + 0.004, col[2] - 0.1],
      ];
    },
  });
  collector(ctx, col, 0.042, 0.13, 'steel', 0.66);
  const a: P3 = [0.13, 0.225, c[2] + 0.22];
  const b: P3 = [0.17, 0.3, c[2] + 0.45];
  heatPipe(ctx, [[col[0], col[1], col[2] + 0.06], [0.1, 0.215, c[2] + 0.13], [a[0] - 0.01, a[1] - 0.008, a[2] - 0.03], a], 0.026, 'steel', 0.66, 0.9);
  const body = hard('#18191b', 0.35, 0.42, 0.4);
  can(ctx, { a, b, shape: 'tri', r0: 0.056, r1: 0.064, finish: body, cap: vary(F.steel, { rough: 0.2 }), slash: 0.35, roll: 0.3, outletR: 0.024 });
  // Brushed cover on the outer face of the muffler.
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const mid = new THREE.Vector3(...a).addScaledVector(d, 0.45);
  ctx.add('chassis', extrude(smooth2([[-0.08, -0.022], [0.07, -0.018], [0.09, 0.02], [-0.07, 0.024]], 2, true), 0.008, { plane: 'zy', bevel: 0.002 }), vary(F.brushedAlu, { rough: 0.32 }), new THREE.Matrix4().makeRotationX(-Math.atan2(d.y, d.z)).setPosition(mid.x + 0.058, mid.y, mid.z));
  ctx.anchor('exhaustOutlet', b);
}

// ───────────────────────────── livery ─────────────────────────────

function lettering(p: Pen, main: string, accent: string): void {
  if (p.view !== 'right' && p.view !== 'left') return;
  p.text('HORNET', -1.02, 0.79, { color: main, size: 0.032, weight: '900', italic: true, stretch: 1.1 });
  p.text('HONDA', -0.84, 0.94, { color: accent, size: 0.02, weight: '900', spacing: 0.05 });
  p.text('CB500', -0.12, 0.8, { color: main, size: 0.018, weight: '800', italic: true });
}

function livery(c: LiveryCanvas, lv: Livery, env: LiveryEnv): void {
  const red = env.index === 1;
  c.views(ALL_VIEWS, (p) => {
    p.fill(lv.primary, red ? 'gloss' : 'matte');
    if (p.view === 'right' || p.view === 'left') {
      // Black lower shroud edge and tail base; a sharp black flash across the shroud.
      p.poly([[-1.3, 0.0], [-1.3, 0.62], [-1.12, 0.64], [-0.96, 0.7], [-0.8, 0.77], [-0.6, 0.77], [0.3, 1.05], [0.3, 0.0]], lv.secondary, 'satin');
      p.poly([[-1.2, 0.7], [-1.0, 0.76], [-0.84, 0.82], [-0.84, 0.8], [-1.0, 0.735], [-1.2, 0.68]], '#111214', 'gloss');
      lettering(p, red ? '#f4f4f4' : '#111214', red ? '#f4f4f4' : '#111214');
    } else if (p.view === 'front' || p.view === 'rear') p.rect(-1, 0, 1, 0.6, lv.secondary, 'satin');
  });
}

export function hornetBlueprint(spec: BikeSpec): BikeBlueprint {
  const lv = spec.liveries[0];
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.09, 0.78, 1.06],
    wheelbase: 1.42,
    rakeDeg: 25,
    trail: 0.102,
    forkLength: 0.7,
    front: { tyre: '120/70ZR17', rimWidthIn: 3.5, crown: 0.92, tread: 'sport', tyreLabel: 'Sport Radial' },
    rear: { tyre: '160/60ZR17', rimWidthIn: 4.5, crown: 1.02, tread: 'sport', tyreLabel: 'Sport Radial' },
    frontWheel: { type: 'cast', spokes: 5, shape: 'y', color: lv.wheel },
    rearWheel: { type: 'cast', spokes: 5, shape: 'y', color: lv.wheel },
    fork: { type: 'usd', stanchion: 0.041, spacing: 0.2, outerColor: '#b98b35', innerColor: '#c9ccd2', footColor: '#1c1d20', capColor: '#2a2c30', adjusterColor: '#c99a2c', aboveClamp: 0.012, clampGap: 0.18 },
    frontBrake: { discs: 2, discDia: 0.296, disc: 'floating', carrierColor: '#2b2d31', caliper: 'radial4', caliperColor: '#26272b', caliperAngleDeg: 76 },
    rearBrake: { discs: 1, discDia: 0.24, disc: 'fixed', carrierColor: '#2b2d31', caliper: 'axial1', caliperColor: '#26272b', caliperAngleDeg: 200 },
    // Steel diamond frame, added by `steelDiamond` in the body (the kit's backbone tube hides under the tank).
    frame: { type: 'backbone', color: '#17181b', metal: 0.35, rough: 0.42, subframe: 'tubular', subframeColor: '#17181b', width: 0.3 },
    swingarm: { type: 'box', length: 0.56, angleDeg: 10, color: '#1b1c1f', metal: 0.4, rough: 0.45 },
    shock: { layout: 'mono', springColor: '#b3121b', bodyColor: '#2a2c30', reservoir: false },
    drive: { type: 'chain', side: 'left', frontTeeth: 15, rearTeeth: 41, pitch: 0.015875, sprocketColor: '#1e1f22' },
    engine: {
      layout: 'P2_180',
      cc: 471,
      crank: [0, 0.38, -0.76],
      tiltDeg: 30,
      caseColor: '#1b1c1f',
      coverColor: '#2c2e33',
      headColor: '#222428',
      camCoverColor: '#18191c',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.32, h: 0.25, z: -1.12, y: 0.58, tiltDeg: 12, curved: true },
      width: 0.34,
    },
    // Custom 2-into-1 with the short right-side muffler (see `exhaust`).
    exhaust: { route: 'none', side: 'right', can: 'stubby', canLength: 0.24, canDia: 0.12, canFinish: 'black', headerFinish: 'steel' },
    cockpit: {
      bars: 'tubular',
      grip: [0.355, 1.02, -0.865],
      barDia: 0.023,
      dash: 'tft',
      dashPos: [0, 0.985, -1.135],
      dashSize: [0.11, 0.066],
      dashTiltDeg: 42,
      dashMount: 'bars',
      mirrors: 'bar',
      mirrorPos: [0.34, 1.19, -0.92],
      mirrorSize: [0.125, 0.065],
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
      barEndColor: '#2a2c30',
    },
    lights: { head: 'custom', tail: 'custom', rearIndicators: 'stalk' },
    seat: { height: 0.785, front: -0.64, back: -0.3, pillion: 'seat', color: '#151515' },
    rider: { hip: [0, 0.865, -0.5], peg: [0.19, 0.335, -0.45], torsoPitch: 0.22, eye: [0, 1.41, -0.57] },
    footrests: 'rearset',
    plate: { mount: 'hanger', pos: [0, 0.56, 0.35], tiltDeg: -12 },
    body,
    livery,
    groundClearance: 0.15,
    features: [],
    zones: { splitY: 0.6, decal: [-1.02, 0.79] },
  };
}
