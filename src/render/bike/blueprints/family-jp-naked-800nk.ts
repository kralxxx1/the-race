import * as THREE from 'three';
import type { BikeSpec, Livery } from '../../../data/bikes';
import type { KitContext } from '../context';
import { addPanel, buildSeat, buildTank, frontFender, PAINT, seatFinish } from '../kit/body';
import { can, collector, headers, heatPipe } from '../kit/jp-sport-exhaust';
import { tailLamp, undertray } from '../kit/jp-sport-parts';
import { hugger, plateHanger } from '../kit/rear';
import { curve, outlineLoft, stationPts, stationsBetween, type OutlineBody } from '../kit/shape';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv, type Pen } from '../livery';
import { extrude, roundBox, smooth2, type P2, type P3 } from '../mesh';
import { F, hard, tint, vary } from '../sink';
import { fAnd, fNot, fOr, planRegion, sideRegion, type Field } from '../surface';
import type { BikeBlueprint } from '../types';
import { bladeIndicator, forkBrackets, loftPart, panelPair, sideCovers, steerLamp, steerStrip } from './family-jp-naked-parts';

/**
 * CFMoto 800NK (2023–2024).
 * Spec sheet: wheelbase 1465 mm, caster 24.5°, trail 100 mm, seat 795 mm,
 * L×W×H 2105 × 840 × 1080 mm, ground clearance 150 mm, 120/70ZR17 + 180/55ZR17 on
 * 3.50/5.50 cast wheels, 43 mm KYB USD fork, twin 320 mm discs with radial four-piston
 * calipers, chromoly steel trellis frame, cast aluminium swingarm, 799 cc 270° twin.
 * Design cues: the aggressive split LED face (two angled lamp halves either side of a
 * black centre split, DRL "fangs" down the outer edges) with fins on its flanks, faceted
 * tank with winged shrouds and slatted intakes, the trellis frame (orange on the
 * Zircon Black bike), a high, sharp tail, an under-engine pre-silencer feeding the short
 * angular end can on the right.
 */

function shroud(): OutlineBody {
  return {
    zs: stationsBetween(-1.25, -0.8, 11, 0.4),
    top: curve([[-1.25, 0.84], [-1.18, 0.9], [-1.08, 0.94], [-0.97, 0.965], [-0.87, 0.96], [-0.8, 0.92]]),
    bottom: curve([[-1.25, 0.72], [-1.19, 0.64], [-1.1, 0.6], [-1.0, 0.63], [-0.9, 0.7], [-0.8, 0.8]]),
    half: curve([[-1.25, 0.15], [-1.17, 0.215], [-1.06, 0.245], [-0.94, 0.24], [-0.8, 0.2]]),
    sections: [
      { z: -1.25, pts: [[0.64, 1], [0.9, 0.9], [1, 0.66], [0.98, 0.4], [0.92, 0.16], [0.8, 0]] },
      { z: -0.8, pts: [[0.55, 1], [0.8, 0.95], [0.95, 0.8], [1, 0.55], [0.98, 0.26], [0.92, 0]] },
    ],
  };
}

function tail(): OutlineBody {
  return {
    zs: stationsBetween(-0.66, 0.08, 13, 0.5),
    top: curve([[-0.66, 0.78], [-0.46, 0.79], [-0.3, 0.825], [-0.26, 0.88], [-0.1, 0.925], [0.03, 0.965], [0.08, 0.99]]),
    bottom: curve([[-0.66, 0.66], [-0.4, 0.69], [-0.16, 0.76], [0.0, 0.87], [0.05, 0.93], [0.08, 0.965]]),
    half: curve([[-0.66, 0.14], [-0.46, 0.133], [-0.24, 0.11], [-0.04, 0.072], [0.08, 0.026]]),
    sections: [
      { z: -0.66, pts: [[0, 1], [0.6, 0.98], [0.95, 0.84], [1, 0.55], [0.93, 0.22], [0.6, 0.02], [0, 0]] },
      { z: 0.08, pts: [[0, 1], [0.74, 0.97], [1, 0.72], [0.98, 0.44], [0.84, 0.2], [0.42, 0.02], [0, 0]] },
    ],
  };
}

/** Split LED face with flank fins (steering-local frame). */
function headUnit(ctx: KitContext): void {
  const zF = -0.2, zB = -0.075;
  const housing: OutlineBody = {
    zs: stationsBetween(zF, zB, 7, 0.3),
    top: curve([[zF, -0.198], [-0.14, -0.185], [zB, -0.18]]),
    bottom: curve([[zF, -0.322], [-0.14, -0.33], [zB, -0.318]]),
    half: curve([[zF, 0.104], [-0.15, 0.116], [zB, 0.1]]),
    // Shield-shaped front: wide flat brow, flanks tapering to a pointed chin.
    sections: [{ z: 0, pts: [[0, 1], [0.7, 1], [1, 0.8], [0.9, 0.42], [0.5, 0.08], [0.14, 0], [0, 0]] }],
  };
  loftPart(ctx, housing, hard('#121315', 0.15, 0.5, 0.4), { steer: true, depth: 0.006, creases: [1, 2, 3] });
  const zFace = zF + 0.012;
  const half = stationPts(housing, zFace).map(([x, y]) => [x * 0.985, y] as P2);
  const full: P2[] = [...half, ...half.slice(1, -1).reverse().map(([x, y]) => [-x, y] as P2)];
  ctx.add('steer', extrude(full, 0.03, { plane: 'xy', bevel: 0.002, center: zFace + 0.015 }), F.texturedBlack, ctx.steerM);
  for (const s of [-1, 1]) {
    // Angled lamp half: outer end high, inner end low, either side of the black centre split.
    const lens: P2[] = smooth2([[-0.036, -0.014], [0.03, -0.018], [0.038, 0.012], [-0.028, 0.02]], 1, true);
    steerLamp(ctx, lens, [s * 0.05, -0.238, zFace - 0.001], { kind: 'head', inner: 'projector', count: 1, depth: 0.025, rim: 0.004 }, 0, s * 0.3);
    // DRL fang: from the upper outer corner down the flank and in towards the chin.
    steerStrip(ctx, [[s * 0.098, -0.206, zFace - 0.003], [s * 0.092, -0.25, zFace - 0.003], [s * 0.066, -0.288, zFace - 0.003], [s * 0.03, -0.31, zFace - 0.002]], 0.006, 0.004);
    // Two flank fins: small winglets sweeping out and back from the housing sides.
    for (const [y, w] of [[-0.21, 0.055], [-0.245, 0.042]] as const) {
      const fin: P2[] = [[s * 0.1, -0.19], [s * (0.1 + w), -0.16], [s * (0.104 + w), -0.14], [s * 0.1, -0.13]];
      ctx.add('steer', extrude(s > 0 ? fin : [...fin].reverse(), 0.005, { plane: 'xz', center: y, bevel: 0.0015 }), PAINT, ctx.steerM);
    }
  }
  // Centre split: a raised black spine between the lamp halves.
  ctx.add('steer', roundBox(0.012, 0.09, 0.016, 0.004, 2), hard('#0c0d0f', 0.2, 0.35, 0.8), ctx.steerM.clone().multiply(new THREE.Matrix4().makeTranslation(0, -0.255, zFace - 0.006)));
  forkBrackets(ctx, [-0.21, -0.29], zB + 0.004, 0.06);
}

function body(ctx: KitContext): void {
  const dark = hard('#1b1c1f', 0.2, 0.42, 0.7);
  headUnit(ctx);
  // ── Winged shrouds with slatted intakes ──
  const intake: Field = sideRegion(smooth2([[-1.22, 0.83], [-1.12, 0.86], [-1.0, 0.82], [-1.05, 0.74], [-1.18, 0.72]], 2, true));
  panelPair(ctx, shroud(), PAINT, { creases: [1, 3], depth: 0.01, region: fNot(intake) });
  // Dark slats inside the intake opening.
  for (let i = 0; i < 3; i++) {
    const y = 0.75 + i * 0.03;
    const blade: P2[] = [[-1.19, y - 0.008], [-1.03, y + 0.012], [-1.03, y + 0.02], [-1.19, y]];
    for (const s of [-1, 1]) ctx.add('chassis', extrude(blade, 0.03, { plane: 'zy', center: s * 0.21, bevel: 0.002 }), F.texturedBlack);
  }
  for (const s of [-1, 1]) ctx.add('chassis', extrude(smooth2([[-1.22, 0.83], [-1.12, 0.86], [-1.0, 0.82], [-1.05, 0.74], [-1.18, 0.72]], 2, true), 0.006, { plane: 'zy', center: s * 0.19 }), F.black);
  for (const s of [-1, 1]) bladeIndicator(ctx, 'chassis', [s * 0.16, 0.7, -1.23], [s * 0.2, 0.705, -1.26], 0.0065);
  buildTank(ctx, {
    front: -1.08,
    back: -0.63,
    top: 1.06,
    bottomFront: 0.86,
    bottomBack: 0.8,
    width: 0.42,
    style: 'boxy',
    knee: 0.16,
    capZ: -0.93,
    topLine: [[-1.08, 0.97], [-1.01, 1.03], [-0.93, 1.058], [-0.83, 1.06], [-0.74, 1.025], [-0.67, 0.95], [-0.63, 0.885]],
    bottomLine: [[-1.08, 0.86], [-0.86, 0.83], [-0.63, 0.8]],
    halfLine: [[-1.08, 0.11], [-1.0, 0.18], [-0.9, 0.21], [-0.8, 0.2], [-0.7, 0.16], [-0.63, 0.105]],
  });
  // ── Seats, tail, undertray, light ──
  buildSeat(ctx, { front: -0.65, back: -0.31, yFront: 0.81, y: 0.795, yBack: 0.825, width: 0.3, thick: 0.075, frontWidth: 0.17 });
  buildSeat(ctx, { front: -0.295, back: -0.03, yFront: 0.875, y: 0.89, yBack: 0.925, width: 0.2, thick: 0.05, frontWidth: 0.16 }, tint(seatFinish(ctx), '#18191b'));
  const tm = outlineLoft(tail(), { su: ctx.seg(12, 4), sv: ctx.seg(6, 2), capBack: true });
  const seatHole: Field = fAnd(
    fOr(sideRegion([[-0.85, 0.775], [-0.3, 0.775], [-0.3, 1.4], [-0.85, 1.4]]), sideRegion([[-0.29, 0.86], [-0.02, 0.86], [-0.02, 1.4], [-0.29, 1.4]])),
    planRegion([[-0.85, -0.01], [-0.01, -0.01], [-0.01, 0.105], [-0.29, 0.105], [-0.3, 0.15], [-0.85, 0.15]]),
  );
  const tailVent = sideRegion(smooth2([[-0.5, 0.735], [-0.26, 0.775], [-0.06, 0.86], [-0.16, 0.8], [-0.42, 0.725]], 3, true));
  addPanel(ctx, 'chassis', tm, fAnd(fNot(seatHole), fNot(tailVent)), PAINT, 0.0025, 0.012);
  undertray(ctx, { z0: -0.5, z1: 0.06, top0: 0.71, top1: 0.95, bot0: 0.66, botMid: 0.72, bot1: 0.93, w0: 0.125, w1: 0.03 });
  tailLamp(ctx, smooth2([[-0.05, -0.006], [0.05, -0.006], [0.056, 0.004], [0.0, 0.01], [-0.056, 0.004]], 4, true), [0, 0.955, 0.07], -0.75);
  sideCovers(ctx, [[-0.66, 0.77], [-0.44, 0.76], [-0.4, 0.66], [-0.58, 0.61], [-0.67, 0.68]], 0.13, dark);
  frontFender(ctx, { from: -0.45, to: 0.82, gap: 0.02, width: 0.15, f: dark });
  hugger(ctx, F.texturedBlack);
  plateHanger(ctx, { fromZ: -0.02, fromY: 0.78 });
  exhaust(ctx);
}

/**
 * 2-into-1: headers drop in front of the crankcase into the pre-silencer under the
 * engine; the short angular end can rises on the right behind the footrest.
 */
function exhaust(ctx: KitContext): void {
  const c = ctx.bp.engine.crank;
  const zf = c[2] - 0.25;
  const col: P3 = [0.03, 0.205, c[2] - 0.04];
  headers(ctx, {
    r: 0.021,
    heat: 'steel',
    tEnd: 0.7,
    route: (_i, p) => {
      const x = p.pos[0];
      return [
        [x * 1.05, 0.48, zf],
        [x * 0.9, 0.32, zf + 0.01],
        [x * 0.6 + 0.02, 0.215, zf + 0.1],
        [col[0] + x * 0.3, col[1] + 0.004, col[2] - 0.1],
      ];
    },
  });
  collector(ctx, col, 0.045, 0.13, 'steel', 0.65);
  const box = hard('#17181a', 0.35, 0.45, 0.3);
  const bc: P3 = [0.03, 0.2, c[2] + 0.13];
  ctx.add('chassis', roundBox(0.24, 0.1, 0.26, 0.04, ctx.micro ? 3 : 2), box, new THREE.Matrix4().makeTranslation(...bc));
  heatPipe(ctx, [[col[0], col[1], col[2] + 0.06], [0.04, 0.2, c[2] + 0.03]], 0.03, 'steel', 0.65, 0.75);
  const a: P3 = [0.14, 0.24, c[2] + 0.25];
  const b: P3 = [0.18, 0.33, c[2] + 0.47];
  heatPipe(ctx, [[bc[0] + 0.09, bc[1], bc[2] + 0.06], [a[0] - 0.01, a[1] - 0.008, a[2] - 0.03], a], 0.03, 'black', 0.8, 1);
  can(ctx, { a, b, shape: 'tri', r0: 0.058, r1: 0.066, finish: box, cap: vary(F.steel, { rough: 0.22 }), slash: 0.4, roll: 0.2, outletR: 0.026 });
  ctx.anchor('exhaustOutlet', b);
}

// ───────────────────────────── livery ─────────────────────────────

function lettering(p: Pen, main: string, accent: string): void {
  if (p.view !== 'right' && p.view !== 'left') return;
  p.text('800NK', -1.0, 0.9, { color: main, size: 0.03, weight: '900', italic: true, stretch: 1.1 });
  p.text('CFMOTO', -0.07, 0.88, { color: accent, size: 0.016, weight: '900', spacing: 0.03 });
}

function livery(c: LiveryCanvas, lv: Livery, env: LiveryEnv): void {
  const orange = env.index === 1;
  const accent = orange ? lv.secondary : lv.accent;
  c.views(ALL_VIEWS, (p) => {
    p.fill(lv.primary, orange ? 'matte' : 'metallic');
    if (p.view === 'right' || p.view === 'left') {
      p.poly([[-1.25, 0.86], [-1.0, 0.95], [-0.86, 0.95], [-0.9, 0.9], [-1.1, 0.84]], lv.secondary === accent ? '#2c2e33' : lv.secondary, 'satin');
      p.line([[-1.25, 0.715], [-1.1, 0.65], [-0.95, 0.66], [-0.82, 0.76]], accent, 0.005);
      p.line([[-0.46, 0.73], [-0.2, 0.775], [0.0, 0.86]], accent, 0.004);
      lettering(p, '#e6e8eb', accent);
    }
  });
}

export function nk800Blueprint(spec: BikeSpec): BikeBlueprint {
  const lv = spec.liveries[0];
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.105, 0.84, 1.08],
    wheelbase: 1.465,
    rakeDeg: 24.5,
    trail: 0.1,
    forkLength: 0.72,
    front: { tyre: '120/70ZR17', rimWidthIn: 3.5, crown: 0.9, tread: 'sport', tyreLabel: 'Sport Radial' },
    rear: { tyre: '180/55ZR17', rimWidthIn: 5.5, crown: 1.0, tread: 'sport', tyreLabel: 'Sport Radial' },
    frontWheel: { type: 'cast', spokes: 5, shape: 'split', color: lv.wheel, liveryColor: true },
    rearWheel: { type: 'cast', spokes: 5, shape: 'split', color: lv.wheel, liveryColor: true },
    fork: { type: 'usd', stanchion: 0.043, spacing: 0.21, outerColor: '#1e1f22', innerColor: '#c9ccd2', footColor: '#1e1f22', capColor: '#2a2c30', adjusterColor: '#c99a2c', aboveClamp: 0.012, clampGap: 0.18 },
    frontBrake: { discs: 2, discDia: 0.32, disc: 'floating', carrierColor: '#2b2d31', caliper: 'radialMono4', caliperColor: '#25262a', caliperAngleDeg: 76 },
    rearBrake: { discs: 1, discDia: 0.26, disc: 'fixed', carrierColor: '#2b2d31', caliper: 'axial1', caliperColor: '#25262a', caliperAngleDeg: 200 },
    // Chromoly steel trellis; its colour follows the livery (orange on Zircon Black).
    frame: { type: 'trellis', color: lv.frame, metal: 0.35, rough: 0.38, subframe: 'trellis', subframeColor: '#1d1e21', width: 0.3, liveryColor: true },
    swingarm: { type: 'box', length: 0.6, angleDeg: 10, color: '#1d1e21', metal: 0.6, rough: 0.42 },
    shock: { layout: 'mono', springColor: '#8e9399', bodyColor: '#2a2c30', reservoir: true },
    drive: { type: 'chain', side: 'left', frontTeeth: 16, rearTeeth: 44, pitch: 0.015875, sprocketColor: '#1e1f22' },
    engine: {
      layout: 'P2_270',
      cc: 799,
      crank: [0, 0.38, -0.78],
      tiltDeg: 36,
      caseColor: '#1b1c1f',
      coverColor: '#2e3035',
      headColor: '#222428',
      camCoverColor: '#18191c',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.36, h: 0.28, z: -1.17, y: 0.6, tiltDeg: 12, curved: true },
      width: 0.36,
    },
    // Custom 2-into-1 with the under-engine pre-silencer and short end can (see `exhaust`).
    exhaust: { route: 'none', side: 'right', can: 'tri', canLength: 0.24, canDia: 0.13, canFinish: 'black', headerFinish: 'steel' },
    cockpit: {
      bars: 'tubular',
      grip: [0.37, 1.04, -0.895],
      barDia: 0.024,
      dash: 'tft',
      dashPos: [0, 1.005, -1.18],
      dashSize: [0.11, 0.066],
      dashTiltDeg: 42,
      dashMount: 'bars',
      mirrors: 'bar',
      mirrorPos: [0.35, 1.2, -0.95],
      mirrorSize: [0.13, 0.062],
      mirrorIndicators: false,
      mirrorShape: 'sport',
      mirrorColor: '#141517',
      topClamp: 'cast',
      steeringDamper: 'none',
      leverColor: '#2a2c30',
      reservoirs: true,
      clutch: 'cable',
      ignition: 'keyless',
      switchColor: '#151618',
      gripColor: '#141414',
      barEndColor: '#2a2c30',
    },
    lights: { head: 'custom', tail: 'custom', rearIndicators: 'stalk' },
    seat: { height: 0.795, front: -0.65, back: -0.31, pillion: 'seat', color: '#151515' },
    rider: { hip: [0, 0.875, -0.5], peg: [0.2, 0.35, -0.46], torsoPitch: 0.28, eye: [0, 1.42, -0.59] },
    footrests: 'rearset',
    plate: { mount: 'hanger', pos: [0, 0.58, 0.37], tiltDeg: -12 },
    body,
    livery,
    groundClearance: 0.15,
    features: ['trellis'],
    zones: { splitY: 0.6, decal: [-1.0, 0.9] },
  };
}
