import * as THREE from 'three';
import type { BikeSpec, Livery } from '../../../data/bikes';
import type { KitContext } from '../context';
import { addPanel, buildSeat, buildTank, frontFender, PAINT, seatFinish } from '../kit/body';
import { can, collector, headers, heatPipe } from '../kit/jp-sport-exhaust';
import { steelDiamond } from '../kit/jp-sport-frame';
import { tailLamp, undertray } from '../kit/jp-sport-parts';
import { hugger, plateHanger } from '../kit/rear';
import { curve, outlineLoft, stationsBetween, type OutlineBody } from '../kit/shape';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv, type Pen } from '../livery';
import { roundBox, smooth2, type P2, type P3 } from '../mesh';
import { F, hard, tint, vary } from '../sink';
import { fAnd, fNot, fOr, planRegion, sideRegion, type Field } from '../surface';
import type { BikeBlueprint } from '../types';
import { bladeIndicator, forkBrackets, loftPart, panelPair, sideCovers, steerLamp, steerStrip } from './family-jp-naked-parts';

/**
 * Yamaha MT-07 (2021–2024).
 * Spec sheet: wheelbase 1400 mm, caster 24.8°, trail 90 mm, seat 805 mm,
 * L×W×H 2085 × 780 × 1105 mm, ground clearance 140 mm, 120/70ZR17 + 180/55ZR17 on
 * 3.50/5.50 cast wheels, 41 mm conventional telescopic fork, twin 298 mm discs with
 * four-piston calipers, tubular steel diamond frame (the engine is a stressed member),
 * asymmetric steel swingarm, 689 cc CP2 270° twin.
 * Design cues: the compact face with one central LED projector under two slim DRL
 * "eyes", tank cover with big two-tone air-scoop panels, the black tube frame visible
 * under the tank, short tail, two headers dropping in front of the crankcase into the
 * stubby muffler low on the right below the footrest, wide tubular bar with an LCD.
 */

function shroud(): OutlineBody {
  return {
    zs: stationsBetween(-1.19, -0.79, 10, 0.4),
    top: curve([[-1.19, 0.86], [-1.12, 0.905], [-1.02, 0.94], [-0.92, 0.955], [-0.84, 0.94], [-0.79, 0.9]]),
    bottom: curve([[-1.19, 0.74], [-1.13, 0.68], [-1.04, 0.64], [-0.94, 0.65], [-0.85, 0.71], [-0.79, 0.78]]),
    half: curve([[-1.19, 0.15], [-1.1, 0.205], [-1.0, 0.228], [-0.9, 0.225], [-0.79, 0.19]]),
    sections: [
      { z: -1.19, pts: [[0.64, 1], [0.86, 0.94], [0.97, 0.76], [1, 0.5], [0.96, 0.22], [0.88, 0]] },
      { z: -0.79, pts: [[0.56, 1], [0.8, 0.95], [0.95, 0.8], [1, 0.55], [0.98, 0.26], [0.92, 0]] },
    ],
  };
}

/** Lower, darker layer of the scoop panel (the two-tone look of the 2021 tank cover). */
function scoopLower(): OutlineBody {
  return {
    zs: stationsBetween(-1.17, -0.84, 8, 0.4),
    top: curve([[-1.17, 0.78], [-1.06, 0.76], [-0.94, 0.745], [-0.84, 0.76]]),
    bottom: curve([[-1.17, 0.69], [-1.08, 0.625], [-0.98, 0.615], [-0.88, 0.65], [-0.84, 0.69]]),
    half: curve([[-1.17, 0.152], [-1.06, 0.21], [-0.95, 0.222], [-0.84, 0.2]]),
    sections: [{ z: 0, pts: [[0.72, 1], [0.93, 0.88], [1, 0.6], [0.97, 0.28], [0.9, 0]] }],
  };
}

function tail(): OutlineBody {
  return {
    zs: stationsBetween(-0.66, 0.06, 13, 0.5),
    top: curve([[-0.66, 0.785], [-0.46, 0.795], [-0.31, 0.82], [-0.27, 0.87], [-0.1, 0.91], [0.02, 0.94], [0.06, 0.955]]),
    bottom: curve([[-0.66, 0.67], [-0.4, 0.69], [-0.16, 0.75], [-0.02, 0.85], [0.03, 0.9], [0.06, 0.935]]),
    half: curve([[-0.66, 0.135], [-0.46, 0.13], [-0.26, 0.11], [-0.06, 0.076], [0.06, 0.03]]),
    sections: [
      { z: -0.66, pts: [[0, 1], [0.6, 0.98], [0.95, 0.84], [1, 0.55], [0.93, 0.22], [0.6, 0.02], [0, 0]] },
      { z: 0.06, pts: [[0, 1], [0.74, 0.97], [1, 0.72], [0.98, 0.44], [0.84, 0.2], [0.42, 0.02], [0, 0]] },
    ],
  };
}

/** Fork-mounted head unit (steering-local frame): one projector, two DRL eyes, a pointed nose. */
function headUnit(ctx: KitContext): void {
  const black = hard('#121315', 0.15, 0.5, 0.4);
  const zF = -0.19, zB = -0.08;
  const face: OutlineBody = {
    zs: stationsBetween(zF, zB, 6, 0.3),
    top: curve([[zF, -0.19], [-0.13, -0.178], [zB, -0.174]]),
    bottom: curve([[zF, -0.296], [-0.13, -0.306], [zB, -0.298]]),
    half: curve([[zF, 0.098], [-0.14, 0.108], [zB, 0.096]]),
    sections: [{ z: 0, pts: [[0, 1], [0.55, 1], [1, 0.7], [0.94, 0.36], [0.62, 0.04], [0.22, 0], [0, 0]] }],
  };
  loftPart(ctx, face, black, { steer: true, capFront: true, depth: 0.006 });
  // Body-colour mask over the upper face: a V-shaped nose between the two eyes.
  const mask: OutlineBody = {
    zs: stationsBetween(zF - 0.008, -0.12, 5, 0.3),
    top: curve([[zF - 0.008, -0.184], [-0.12, -0.17]]),
    bottom: curve([[zF - 0.008, -0.214], [-0.12, -0.2]]),
    half: curve([[zF - 0.008, 0.1], [-0.12, 0.11]]),
    sections: [{ z: 0, pts: [[0, 0.3], [0.3, 1], [0.7, 1], [1, 0.6], [0.9, 0]] }],
  };
  loftPart(ctx, mask, PAINT, { steer: true, capFront: true, depth: 0.004, q: 0.8 });
  // Central LED projector (the main beam) low in the face.
  const proj: P2[] = smooth2([[-0.034, -0.022], [0.034, -0.022], [0.036, 0.018], [0.0, 0.026], [-0.036, 0.018]], 3, true);
  steerLamp(ctx, proj, [0, -0.258, zF - 0.001], { kind: 'head', inner: 'projector', count: 1, depth: 0.03, rim: 0.004 });
  // DRL eyes either side of the nose, slanting up and outwards.
  for (const s of [-1, 1]) {
    steerStrip(ctx, [[s * 0.028, -0.226, zF - 0.004], [s * 0.058, -0.218, zF - 0.003], [s * 0.088, -0.203, zF + 0.004]], 0.01, 0.004);
  }
  forkBrackets(ctx, [-0.205, -0.27], zB + 0.004, 0.055);
  // Front indicators on short stalks beside the face.
  for (const s of [-1, 1]) bladeIndicator(ctx, 'steer', ctx.fromSteer([s * 0.098, -0.25, zB - 0.01]), ctx.fromSteer([s * 0.15, -0.248, zB - 0.02]), 0.006);
}

function body(ctx: KitContext): void {
  const dark = hard('#1b1c1f', 0.2, 0.42, 0.7);
  steelDiamond(ctx, { width: 0.3, r: 0.017 });
  headUnit(ctx);
  // ── Tank cover with the two-tone scoop panels ──
  panelPair(ctx, shroud(), PAINT, { creases: [2], depth: 0.01 });
  panelPair(ctx, scoopLower(), dark, { depth: 0.008, q: 1 });
  buildTank(ctx, {
    front: -1.02,
    back: -0.62,
    top: 1.05,
    bottomFront: 0.84,
    bottomBack: 0.8,
    width: 0.38,
    style: 'muscle',
    knee: 0.14,
    capZ: -0.9,
    topLine: [[-1.02, 0.95], [-0.95, 1.01], [-0.87, 1.045], [-0.79, 1.048], [-0.72, 1.02], [-0.66, 0.95], [-0.62, 0.88]],
    bottomLine: [[-1.02, 0.84], [-0.84, 0.81], [-0.62, 0.8]],
    halfLine: [[-1.02, 0.1], [-0.95, 0.162], [-0.86, 0.19], [-0.76, 0.18], [-0.68, 0.145], [-0.62, 0.1]],
  });
  // ── Seats, tail, undertray, light ──
  buildSeat(ctx, { front: -0.64, back: -0.3, yFront: 0.82, y: 0.806, yBack: 0.83, width: 0.3, thick: 0.075, frontWidth: 0.17 });
  buildSeat(ctx, { front: -0.285, back: -0.06, yFront: 0.88, y: 0.892, yBack: 0.912, width: 0.2, thick: 0.05, frontWidth: 0.16 }, tint(seatFinish(ctx), '#18191b'));
  const tm = outlineLoft(tail(), { su: ctx.seg(12, 4), sv: ctx.seg(6, 2), capBack: true });
  const seatHole: Field = fAnd(
    fOr(sideRegion([[-0.85, 0.78], [-0.29, 0.78], [-0.29, 1.4], [-0.85, 1.4]]), sideRegion([[-0.28, 0.86], [-0.03, 0.86], [-0.03, 1.4], [-0.28, 1.4]])),
    planRegion([[-0.85, -0.01], [-0.02, -0.01], [-0.02, 0.105], [-0.28, 0.105], [-0.29, 0.15], [-0.85, 0.15]]),
  );
  addPanel(ctx, 'chassis', tm, fNot(seatHole), PAINT, 0.0025, 0.012);
  undertray(ctx, { z0: -0.5, z1: 0.04, top0: 0.7, top1: 0.92, bot0: 0.66, botMid: 0.72, bot1: 0.9, w0: 0.122, w1: 0.03 });
  tailLamp(ctx, smooth2([[-0.05, -0.006], [0.05, -0.006], [0.056, 0.004], [0.0, 0.01], [-0.056, 0.004]], 4, true), [0, 0.922, 0.05], -0.75);
  sideCovers(ctx, [[-0.65, 0.77], [-0.44, 0.76], [-0.4, 0.66], [-0.58, 0.61], [-0.66, 0.68]], 0.13, dark);
  frontFender(ctx, { from: -0.45, to: 0.82, gap: 0.02, width: 0.15, f: dark });
  hugger(ctx, F.texturedBlack);
  plateHanger(ctx, { fromZ: -0.03, fromY: 0.78 });
  exhaust(ctx);
}

/**
 * 2-into-1: both headers drop in front of the crankcase and run back under it into the
 * pre-chamber; the stubby black muffler sits low on the right, under the footrest.
 */
function exhaust(ctx: KitContext): void {
  const c = ctx.bp.engine.crank;
  const zf = c[2] - 0.25;
  const col: P3 = [0.04, 0.2, c[2] - 0.02];
  headers(ctx, {
    r: 0.021,
    heat: 'steel',
    tEnd: 0.7,
    route: (_i, p) => {
      const x = p.pos[0];
      return [
        [x * 1.05, 0.48, zf],
        [x * 0.9, 0.32, zf + 0.01],
        [x * 0.6 + 0.02, 0.21, zf + 0.1],
        [col[0] + x * 0.3, col[1] + 0.004, col[2] - 0.1],
      ];
    },
  });
  collector(ctx, col, 0.045, 0.14, 'steel', 0.65);
  const box = hard('#17181a', 0.35, 0.45, 0.3);
  // Pre-chamber under the engine.
  const bc: P3 = [0.04, 0.195, c[2] + 0.14];
  ctx.add('chassis', roundBox(0.2, 0.09, 0.22, 0.035, ctx.micro ? 3 : 2), box, new THREE.Matrix4().makeTranslation(...bc));
  heatPipe(ctx, [[col[0], col[1], col[2] + 0.06], [0.05, 0.195, c[2] + 0.05]], 0.03, 'steel', 0.65, 0.75);
  // Stubby muffler on the right, rising slightly towards the rear wheel.
  const a: P3 = [0.13, 0.21, c[2] + 0.2];
  const b: P3 = [0.175, 0.28, c[2] + 0.42];
  heatPipe(ctx, [[bc[0] + 0.08, bc[1], bc[2] + 0.04], [a[0] - 0.01, a[1] - 0.005, a[2] - 0.03], a], 0.028, 'black', 0.8, 1);
  can(ctx, { a, b, shape: 'oval', r0: 0.055, r1: 0.062, finish: box, cap: vary(F.steel, { rough: 0.22 }), slash: 0.15, outletR: 0.024 });
  // Brushed heat shield on the outside of the can.
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const mid = new THREE.Vector3(...a).addScaledVector(d, 0.5);
  ctx.add('chassis', roundBox(0.01, 0.05, 0.16, 0.004), vary(F.brushedAlu, { rough: 0.35 }), new THREE.Matrix4().makeRotationX(-Math.atan2(d.y, d.z)).setPosition(mid.x + 0.06, mid.y + 0.005, mid.z));
  ctx.anchor('exhaustOutlet', b);
}

// ───────────────────────────── livery ─────────────────────────────

function lettering(p: Pen, main: string, accent: string): void {
  if (p.view !== 'right' && p.view !== 'left') return;
  p.text('MT', -1.0, 0.82, { color: main, size: 0.045, weight: '900', italic: true, stretch: 1.1 });
  p.text('MT-07', -0.12, 0.82, { color: accent, size: 0.022, weight: '900', italic: true });
  p.text('YAMAHA', -0.84, 0.92, { color: main, size: 0.017, weight: '800', spacing: 0.05 });
}

function livery(c: LiveryCanvas, lv: Livery, env: LiveryEnv): void {
  const storm = env.index === 1;
  const dark = lv.secondary;
  const accent = storm ? '#18c7e8' : '#7aa2ff';
  c.views(ALL_VIEWS, (p) => {
    p.fill(lv.primary, storm ? 'metallic' : 'gloss');
    if (p.view === 'right' || p.view === 'left') {
      // Upper scoop and tank sides in the main colour; the lower scoop, tail and seat base dark.
      p.poly([[-1.3, 0.0], [-1.3, 0.69], [-1.12, 0.66], [-0.95, 0.66], [-0.8, 0.76], [-0.6, 0.78], [0.3, 1.2], [0.3, 0.0]], dark, 'satin');
      p.line([[-1.17, 0.785], [-1.04, 0.765], [-0.88, 0.755]], accent, 0.004);
      lettering(p, '#f2f4f7', accent);
    } else if (p.view === 'top') {
      p.rect(-0.62, -0.2, 0.3, 0.2, dark, 'satin');
    } else if (p.view === 'front' || p.view === 'rear') p.rect(-1, 0, 1, 0.66, dark, 'satin');
  });
}

export function mt07Blueprint(spec: BikeSpec): BikeBlueprint {
  const lv = spec.liveries[0];
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.085, 0.78, 1.105],
    wheelbase: 1.4,
    rakeDeg: 24.8,
    trail: 0.09,
    forkLength: 0.714,
    front: { tyre: '120/70ZR17', rimWidthIn: 3.5, crown: 0.9, tread: 'sport', tyreLabel: 'Sport Radial' },
    rear: { tyre: '180/55ZR17', rimWidthIn: 5.5, crown: 1.0, tread: 'sport', tyreLabel: 'Sport Radial' },
    frontWheel: { type: 'cast', spokes: 5, shape: 'split', color: lv.wheel, liveryColor: true },
    rearWheel: { type: 'cast', spokes: 5, shape: 'split', color: lv.wheel, liveryColor: true },
    fork: { type: 'rwu', stanchion: 0.041, spacing: 0.2, outerColor: '#25272b', innerColor: '#d9dce0', footColor: '#25272b', capColor: '#1c1d20', aboveClamp: 0.01, clampGap: 0.17 },
    frontBrake: { discs: 2, discDia: 0.298, disc: 'floating', carrierColor: '#2b2d31', caliper: 'axial2', caliperColor: '#2a2b2e', caliperAngleDeg: 70 },
    rearBrake: { discs: 1, discDia: 0.245, disc: 'fixed', carrierColor: '#2b2d31', caliper: 'axial1', caliperColor: '#2a2b2e', caliperAngleDeg: 200 },
    // Tubular steel diamond frame, added by `steelDiamond` in the body (the kit's backbone tube hides under the tank).
    frame: { type: 'backbone', color: '#202125', metal: 0.35, rough: 0.42, subframe: 'tubular', subframeColor: '#202125', width: 0.3 },
    swingarm: { type: 'box', length: 0.55, angleDeg: 10, color: '#26282c', metal: 0.4, rough: 0.45 },
    shock: { layout: 'mono', springColor: '#2f58c8', bodyColor: '#2a2c30', reservoir: false },
    drive: { type: 'chain', side: 'left', frontTeeth: 16, rearTeeth: 43, pitch: 0.015875, sprocketColor: '#1e1f22' },
    engine: {
      layout: 'P2_270',
      cc: 689,
      crank: [0, 0.39, -0.76],
      tiltDeg: 32,
      caseColor: '#1b1c1f',
      coverColor: '#2e3035',
      headColor: '#222428',
      camCoverColor: '#18191c',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.34, h: 0.26, z: -1.13, y: 0.6, tiltDeg: 12, curved: true },
      width: 0.36,
    },
    // Custom 2-into-1 with the under-engine pre-chamber and stubby side muffler (see `exhaust`).
    exhaust: { route: 'none', side: 'right', can: 'stubby', canLength: 0.2, canDia: 0.12, canFinish: 'black', headerFinish: 'steel' },
    cockpit: {
      bars: 'tubular',
      grip: [0.36, 1.035, -0.84],
      barDia: 0.023,
      dash: 'lcd',
      dashPos: [0, 1.0, -1.115],
      dashSize: [0.12, 0.072],
      dashTiltDeg: 40,
      dashMount: 'bars',
      mirrors: 'bar',
      mirrorPos: [0.34, 1.2, -0.9],
      mirrorSize: [0.12, 0.07],
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
    seat: { height: 0.805, front: -0.64, back: -0.3, pillion: 'seat', color: '#151515' },
    rider: { hip: [0, 0.885, -0.49], peg: [0.19, 0.345, -0.44], torsoPitch: 0.2, eye: [0, 1.43, -0.56] },
    footrests: 'rearset',
    plate: { mount: 'hanger', pos: [0, 0.58, 0.35], tiltDeg: -12 },
    body,
    livery,
    groundClearance: 0.14,
    features: [],
    zones: { splitY: 0.6, decal: [-1.0, 0.82] },
  };
}
