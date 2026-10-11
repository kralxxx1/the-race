import * as THREE from 'three';
import type { BikeSpec, Livery } from '../../../data/bikes';
import type { KitContext } from '../context';
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
import { bladeIndicator, forkBrackets, loftPart, panelPair, sideCovers, steerLamp, steerMat, steerStrip } from './family-jp-naked-parts';

/**
 * Yamaha MT-09 (2024, fourth generation).
 * Spec sheet: wheelbase 1430 mm, caster 25°, trail 108 mm, seat 825 mm,
 * L×W×H 2090 × 795 × 1190 mm, ground clearance 140 mm, 120/70ZR17 + 180/55ZR17 on
 * 3.50/5.50 spin-forged 10-spoke wheels, 41 mm KYB USD fork, twin 298 mm discs with
 * radial four-piston calipers, die-cast aluminium frame and swingarm, 890 cc CP3 triple.
 * Design cues: the low, compact "transformer" face (central LED projectors under two
 * slanted DRL eyebrows) hung on the fork, big angular tank shrouds with air scoops that
 * wrap the radiator, a short tank, the exposed triple with three headers dropping in
 * front of the crankcase into the stubby muffler under the engine (short outlet on the
 * right below the footrest), a very short tail with the plate on a long hanger, tapered
 * bar with a 5" TFT on top.
 */

function shroud(): OutlineBody {
  return {
    zs: stationsBetween(-1.235, -0.78, 11, 0.4),
    top: curve([[-1.235, 0.885], [-1.17, 0.93], [-1.08, 0.965], [-0.98, 0.985], [-0.88, 0.985], [-0.78, 0.945]]),
    bottom: curve([[-1.235, 0.77], [-1.18, 0.71], [-1.1, 0.67], [-1.0, 0.66], [-0.9, 0.69], [-0.82, 0.75], [-0.78, 0.8]]),
    half: curve([[-1.235, 0.16], [-1.16, 0.218], [-1.06, 0.248], [-0.96, 0.25], [-0.86, 0.232], [-0.78, 0.2]]),
    sections: [
      { z: -1.235, pts: [[0.62, 1], [0.84, 0.95], [0.97, 0.78], [1, 0.52], [0.97, 0.24], [0.88, 0]] },
      { z: -0.78, pts: [[0.55, 1], [0.8, 0.96], [0.95, 0.8], [1, 0.55], [0.98, 0.26], [0.92, 0]] },
    ],
  };
}

/** The black scoop liner under the painted shroud (shows as the dark duct of the air intake). */
function scoop(): OutlineBody {
  return {
    zs: stationsBetween(-1.215, -0.86, 8, 0.4),
    top: curve([[-1.215, 0.8], [-1.1, 0.79], [-0.95, 0.77], [-0.86, 0.77]]),
    bottom: curve([[-1.215, 0.7], [-1.12, 0.63], [-1.0, 0.615], [-0.9, 0.64], [-0.86, 0.68]]),
    half: curve([[-1.215, 0.15], [-1.12, 0.215], [-1.0, 0.232], [-0.86, 0.215]]),
    sections: [{ z: 0, pts: [[0.7, 1], [0.92, 0.9], [1, 0.62], [0.98, 0.3], [0.9, 0]] }],
  };
}

function tail(): OutlineBody {
  return {
    zs: stationsBetween(-0.68, 0.07, 13, 0.5),
    top: curve([[-0.68, 0.805], [-0.48, 0.815], [-0.31, 0.845], [-0.26, 0.895], [-0.1, 0.935], [0.02, 0.965], [0.07, 0.985]]),
    bottom: curve([[-0.68, 0.68], [-0.42, 0.705], [-0.18, 0.77], [-0.02, 0.87], [0.04, 0.93], [0.07, 0.965]]),
    half: curve([[-0.68, 0.138], [-0.48, 0.132], [-0.26, 0.112], [-0.06, 0.078], [0.07, 0.03]]),
    sections: [
      { z: -0.68, pts: [[0, 1], [0.6, 0.98], [0.95, 0.84], [1, 0.55], [0.93, 0.22], [0.6, 0.02], [0, 0]] },
      { z: 0.07, pts: [[0, 1], [0.74, 0.97], [1, 0.72], [0.98, 0.44], [0.84, 0.2], [0.42, 0.02], [0, 0]] },
    ],
  };
}

/** Fork-mounted head unit (steering-local frame). */
function headUnit(ctx: KitContext): void {
  const black = hard('#121315', 0.15, 0.5, 0.4);
  const zF = -0.2, zB = -0.085;
  // Wide, shallow face: flat top with chamfered upper corners (where the DRL "eyebrows"
  // sit), sides tapering to a narrow chin.
  const face: OutlineBody = {
    zs: stationsBetween(zF, zB, 6, 0.3),
    top: curve([[zF, -0.212], [-0.14, -0.2], [zB, -0.196]]),
    bottom: curve([[zF, -0.322], [-0.14, -0.334], [zB, -0.322]]),
    half: curve([[zF, 0.118], [-0.15, 0.13], [zB, 0.114]]),
    sections: [{ z: 0, pts: [[0, 1], [0.6, 1], [1, 0.74], [0.97, 0.42], [0.74, 0.06], [0.34, 0], [0, 0]] }],
  };
  loftPart(ctx, face, black, { steer: true, capFront: true, depth: 0.006 });
  // Grey painted cheeks either side of the projectors (the "mask" of the transformer face).
  const cheek: OutlineBody = {
    zs: stationsBetween(zF - 0.006, -0.12, 5, 0.3),
    top: curve([[zF - 0.006, -0.27], [-0.12, -0.25]]),
    bottom: curve([[zF - 0.006, -0.318], [-0.12, -0.33]]),
    half: curve([[zF - 0.006, 0.112], [-0.12, 0.128]]),
    sections: [{ z: 0, pts: [[0.62, 1], [0.92, 0.9], [1, 0.5], [0.8, 0.0]] }],
  };
  panelPair(ctx, cheek, PAINT, { steer: true, capFront: true, depth: 0.004, q: 0.8 });
  // Central twin LED projectors.
  for (const s of [-1, 1]) {
    const proj: P2[] = smooth2([[-0.024, -0.02], [0.024, -0.02], [0.026, 0.018], [-0.026, 0.018]], 3, true);
    steerLamp(ctx, proj, [s * 0.03, -0.275, zF - 0.001], { kind: 'head', inner: 'projector', count: 1, depth: 0.03, rim: 0.004 });
  }
  // DRL eyebrows along the chamfered corners, outer ends higher.
  for (const s of [-1, 1]) {
    steerStrip(ctx, [[s * 0.04, -0.235, zF - 0.004], [s * 0.075, -0.226, zF - 0.003], [s * 0.112, -0.208, zF + 0.004]], 0.009, 0.004);
    // Small turn LED low on each face side.
    steerStrip(ctx, [[s * 0.098, -0.3, zF + 0.012], [s * 0.112, -0.28, zF + 0.018]], 0.008, 0.004, 'indicator');
  }
  // Black chin vent under the projectors.
  ctx.add('steer', roundBox(0.07, 0.012, 0.02, 0.004, 2), F.texturedBlack, steerMat(ctx, new THREE.Matrix4().makeTranslation(0, -0.31, zF - 0.002)));
  forkBrackets(ctx, [-0.232, -0.3], zB + 0.004, 0.06);
}

function body(ctx: KitContext): void {
  const dark = hard('#1b1c1f', 0.2, 0.42, 0.7);
  headUnit(ctx);
  // ── Tank shrouds with their air scoops ──
  const sh = shroud();
  const intakeMouth: Field = sideRegion(smooth2([[-1.25, 0.86], [-1.17, 0.83], [-1.1, 0.74], [-1.18, 0.7], [-1.25, 0.74]], 2, true));
  panelPair(ctx, sh, PAINT, { region: fNot(intakeMouth), creases: [2], depth: 0.01 });
  panelPair(ctx, scoop(), F.texturedBlack, { depth: 0.008, q: 1 });
  // Front indicators on the shroud noses.
  for (const s of [-1, 1]) bladeIndicator(ctx, 'chassis', [s * 0.17, 0.79, -1.2], [s * 0.2, 0.795, -1.245], 0.007);
  // ── Tank ──
  buildTank(ctx, {
    front: -1.05,
    back: -0.63,
    top: 1.075,
    bottomFront: 0.86,
    bottomBack: 0.82,
    width: 0.4,
    style: 'muscle',
    knee: 0.14,
    capZ: -0.92,
    topLine: [[-1.05, 0.975], [-0.98, 1.035], [-0.9, 1.07], [-0.81, 1.072], [-0.73, 1.04], [-0.67, 0.97], [-0.63, 0.9]],
    bottomLine: [[-1.05, 0.86], [-0.85, 0.83], [-0.63, 0.82]],
    halfLine: [[-1.05, 0.1], [-0.97, 0.168], [-0.87, 0.2], [-0.77, 0.19], [-0.69, 0.152], [-0.63, 0.105]],
  });
  // ── Seats, tail, undertray, light ──
  buildSeat(ctx, { front: -0.65, back: -0.3, yFront: 0.84, y: 0.826, yBack: 0.852, width: 0.3, thick: 0.075, frontWidth: 0.17 });
  buildSeat(ctx, { front: -0.285, back: -0.06, yFront: 0.905, y: 0.918, yBack: 0.94, width: 0.2, thick: 0.05, frontWidth: 0.16 }, tint(seatFinish(ctx), '#18191b'));
  const tm = outlineLoft(tail(), { su: ctx.seg(12, 4), sv: ctx.seg(6, 2), capBack: true });
  const seatHole: Field = fAnd(
    fOr(sideRegion([[-0.85, 0.8], [-0.29, 0.8], [-0.29, 1.4], [-0.85, 1.4]]), sideRegion([[-0.28, 0.885], [-0.03, 0.885], [-0.03, 1.4], [-0.28, 1.4]])),
    planRegion([[-0.85, -0.01], [-0.02, -0.01], [-0.02, 0.105], [-0.28, 0.105], [-0.29, 0.15], [-0.85, 0.15]]),
  );
  const tailVent = sideRegion(smooth2([[-0.5, 0.76], [-0.3, 0.79], [-0.12, 0.85], [-0.2, 0.8], [-0.42, 0.745]], 3, true));
  addPanel(ctx, 'chassis', tm, fAnd(fNot(seatHole), fNot(tailVent)), PAINT, 0.0025, 0.012);
  undertray(ctx, { z0: -0.5, z1: 0.05, top0: 0.72, top1: 0.95, bot0: 0.68, botMid: 0.74, bot1: 0.92, w0: 0.125, w1: 0.03 });
  tailLamp(ctx, smooth2([[-0.052, -0.006], [0.052, -0.006], [0.058, 0.004], [0.0, 0.01], [-0.058, 0.004]], 4, true), [0, 0.952, 0.06], -0.75);
  sideCovers(ctx, [[-0.66, 0.79], [-0.44, 0.78], [-0.4, 0.68], [-0.58, 0.63], [-0.67, 0.7]], 0.132, dark);
  frontFender(ctx, { from: -0.45, to: 0.82, gap: 0.02, width: 0.15, f: dark });
  hugger(ctx, F.texturedBlack);
  plateHanger(ctx, { fromZ: -0.02, fromY: 0.8 });
  exhaust(ctx);
}

/**
 * 3-into-1: the headers drop in front of the crankcase, sweep under it into the muffler
 * that fills the space under the engine; the short outlet pokes out on the right below
 * the footrest.
 */
function exhaust(ctx: KitContext): void {
  const c = ctx.bp.engine.crank;
  const zf = c[2] - 0.27;
  const col: P3 = [0.02, 0.2, c[2] - 0.06];
  headers(ctx, {
    r: 0.02,
    heat: 'steel',
    tEnd: 0.7,
    route: (_i, p) => {
      const x = p.pos[0];
      return [
        [x * 1.02, 0.5, zf],
        [x * 0.85, 0.33, zf + 0.01],
        [x * 0.55 + 0.01, 0.2, zf + 0.09],
        [col[0] + x * 0.35, col[1] + 0.005, col[2] - 0.1],
      ];
    },
  });
  collector(ctx, col, 0.04, 0.12, 'steel', 0.65);
  // Muffler body under the engine (black, with a brushed heat shield on the right).
  const box = hard('#17181a', 0.35, 0.45, 0.3);
  const bc: P3 = [0.025, 0.2, c[2] + 0.13];
  ctx.add('chassis', roundBox(0.25, 0.1, 0.3, 0.04, ctx.micro ? 3 : 2), box, new THREE.Matrix4().makeTranslation(...bc));
  ctx.add('chassis', roundBox(0.012, 0.07, 0.22, 0.005, 2), vary(F.brushedAlu, { rough: 0.35 }), new THREE.Matrix4().makeTranslation(bc[0] + 0.128, bc[1] + 0.005, bc[2] - 0.01));
  heatPipe(ctx, [[col[0], col[1], col[2] + 0.05], [0.03, 0.2, c[2] + 0.0]], 0.03, 'steel', 0.65, 0.75);
  // Short outlet on the right, angled up towards the rear.
  const a: P3 = [0.12, 0.225, c[2] + 0.2];
  const b: P3 = [0.165, 0.27, c[2] + 0.32];
  can(ctx, { a, b, shape: 'oval', r0: 0.045, r1: 0.05, finish: box, cap: vary(F.steel, { rough: 0.22 }), slash: 0.25, outletR: 0.024 });
  ctx.anchor('exhaustOutlet', b);
}

// ───────────────────────────── livery ─────────────────────────────

const CYAN = '#18c7e8';

function lettering(p: Pen, main: string, accent: string): void {
  if (p.view !== 'right' && p.view !== 'left') return;
  p.text('MT', -1.03, 0.77, { color: main, size: 0.05, weight: '900', italic: true, stretch: 1.1 });
  p.text('MT-09', -0.12, 0.84, { color: accent, size: 0.022, weight: '900', italic: true });
  p.text('YAMAHA', -0.86, 0.94, { color: main, size: 0.018, weight: '800', spacing: 0.05 });
}

function livery(c: LiveryCanvas, lv: Livery, env: LiveryEnv): void {
  const blue = env.index === 1;
  const dark = lv.secondary;
  c.views(ALL_VIEWS, (p) => {
    if (blue) {
      // Icon Blue: deep blue shrouds and tank covers, dark grey tank top, black tail.
      p.fill(lv.primary, 'metallic');
      if (p.view === 'right' || p.view === 'left') {
        p.poly([[-1.3, 0.0], [-1.3, 0.72], [-1.12, 0.66], [-0.96, 0.66], [-0.8, 0.78], [-0.6, 0.8], [0.3, 1.2], [0.3, 0.0]], dark, 'satin');
        p.line([[-1.22, 0.79], [-1.06, 0.7], [-0.88, 0.7]], '#7aa2ff', 0.004);
        lettering(p, '#f2f4f7', '#7aa2ff');
      } else if (p.view === 'top') {
        p.rect(-0.95, -0.06, -0.62, 0.06, dark, 'satin');
      } else if (p.view === 'front' || p.view === 'rear') p.rect(-1, 0, 1, 0.74, dark, 'satin');
      return;
    }
    // Cyan Storm: storm-grey shrouds and tank covers, darker grey tank top and tail, cyan accents.
    p.fill(lv.primary, 'metallic');
    if (p.view === 'right' || p.view === 'left') {
      p.poly([[-1.3, 0.0], [-1.3, 0.72], [-1.12, 0.66], [-0.96, 0.66], [-0.8, 0.78], [-0.6, 0.8], [0.3, 1.2], [0.3, 0.0]], dark, 'satin');
      p.line([[-1.22, 0.785], [-1.06, 0.695], [-0.88, 0.695]], CYAN, 0.006);
      p.line([[-0.44, 0.74], [-0.14, 0.8]], CYAN, 0.004);
      lettering(p, '#e9ecef', CYAN);
    } else if (p.view === 'top') {
      p.rect(-0.95, -0.07, -0.62, 0.07, dark, 'satin');
      p.rect(-1.05, -0.006, -0.95, 0.006, CYAN);
    } else if (p.view === 'front' || p.view === 'rear') p.rect(-1, 0, 1, 0.74, dark, 'satin');
  });
}

export function mt09Blueprint(spec: BikeSpec): BikeBlueprint {
  const lv = spec.liveries[0];
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.09, 0.795, 1.19],
    wheelbase: 1.43,
    rakeDeg: 25,
    trail: 0.108,
    forkLength: 0.745,
    front: { tyre: '120/70ZR17', rimWidthIn: 3.5, crown: 0.9, tread: 'sport', tyreLabel: 'Sport Radial' },
    rear: { tyre: '180/55ZR17', rimWidthIn: 5.5, crown: 1.0, tread: 'sport', tyreLabel: 'Sport Radial' },
    frontWheel: { type: 'forged', spokes: 10, shape: 'straight', color: lv.wheel, liveryColor: true },
    rearWheel: { type: 'forged', spokes: 10, shape: 'straight', color: lv.wheel, liveryColor: true },
    fork: { type: 'usd', stanchion: 0.041, spacing: 0.205, outerColor: '#1c1d20', innerColor: '#c9ccd2', footColor: '#1c1d20', capColor: '#2a2c30', adjusterColor: '#c99a2c', aboveClamp: 0.012, clampGap: 0.19 },
    frontBrake: { discs: 2, discDia: 0.298, disc: 'floating', carrierColor: '#2b2d31', caliper: 'radial4', caliperColor: '#25262a', caliperAngleDeg: 76 },
    rearBrake: { discs: 1, discDia: 0.245, disc: 'fixed', carrierColor: '#2b2d31', caliper: 'axial1', caliperColor: '#25262a', caliperAngleDeg: 200 },
    // Die-cast aluminium frame, dark grey; the spars run visibly from the head to the pivot.
    frame: { type: 'twinSpar', color: '#2c2e33', metal: 0.7, rough: 0.42, subframe: 'cast', subframeColor: '#222326', width: 0.32 },
    swingarm: { type: 'box', length: 0.59, angleDeg: 10, color: '#34373c', metal: 0.75, rough: 0.4 },
    shock: { layout: 'mono', springColor: '#2f58c8', bodyColor: '#2a2c30', reservoir: false },
    drive: { type: 'chain', side: 'left', frontTeeth: 16, rearTeeth: 45, pitch: 0.015875, sprocketColor: '#1e1f22' },
    engine: {
      layout: 'I3',
      cc: 890,
      crank: [0, 0.4, -0.78],
      tiltDeg: 28,
      caseColor: '#1b1c1f',
      coverColor: '#34363b',
      headColor: '#222428',
      camCoverColor: '#18191c',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.38, h: 0.29, z: -1.16, y: 0.62, tiltDeg: 12, curved: true },
      width: 0.4,
    },
    // Custom 3-into-1 headers and under-engine muffler (see `exhaust`).
    exhaust: { route: 'none', side: 'right', can: 'stubby', canLength: 0.14, canDia: 0.1, canFinish: 'black', headerFinish: 'steel' },
    cockpit: {
      bars: 'tubular',
      grip: [0.355, 1.06, -0.865],
      barDia: 0.024,
      dash: 'tft',
      dashPos: [0, 1.035, -1.155],
      dashSize: [0.11, 0.068],
      dashTiltDeg: 42,
      dashMount: 'bars',
      mirrors: 'bar',
      mirrorPos: [0.34, 1.215, -0.92],
      mirrorSize: [0.13, 0.065],
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
    seat: { height: 0.825, front: -0.65, back: -0.3, pillion: 'seat', color: '#151515' },
    rider: { hip: [0, 0.905, -0.5], peg: [0.2, 0.36, -0.45], torsoPitch: 0.24, eye: [0, 1.44, -0.58] },
    footrests: 'rearset',
    plate: { mount: 'hanger', pos: [0, 0.6, 0.36], tiltDeg: -12 },
    body,
    livery,
    groundClearance: 0.14,
    features: [],
    zones: { splitY: 0.6, decal: [-1.03, 0.77] },
  };
}
