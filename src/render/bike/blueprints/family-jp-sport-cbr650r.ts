import * as THREE from 'three';
import type { BikeSpec, Livery } from '../../../data/bikes';
import type { KitContext } from '../context';
import { addPanel, bodyQ, buildSeat, buildTank, frontFender, PAINT, screen, seatFinish } from '../kit/body';
import { can, canHanger, collector, headers, heatPipe } from '../kit/jp-sport-exhaust';
import { ductLiner, faceLamps, fasteners, frontHit, innerCowl, mirrorLoop, tailLamp, undertray } from '../kit/jp-sport-parts';
import { ledStrip } from '../kit/lights';
import { hugger, plateHanger } from '../kit/rear';
import { curve, outlineLoft, sideAt, stationsBetween, type OutlineBody } from '../kit/shape';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv, type Pen } from '../livery';
import { extrude, roundBox, smooth2, type P2, type P3 } from '../mesh';
import { F, hard, tint, vary } from '../sink';
import { cut, fAnd, fNot, frontRegion, fOr, planRegion, sideRegion, type Field } from '../surface';
import type { BikeBlueprint } from '../types';

/**
 * Honda CBR650R (2024).
 * Spec sheet: wheelbase 1450 mm, caster 25.5°, trail 101 mm, seat 810 mm,
 * L×W×H 2120 × 750 × 1145 mm, ground clearance 130 mm, 120/70ZR17 + 180/55ZR17 on
 * 3.50/5.50 rims, 41 mm Showa SFF-BP USD fork, twin 310 mm discs with radial
 * four-piston calipers, steel diamond frame, 649 cc inline four, 5" TFT.
 * Design cues: the four exposed header pipes that drop in front of the engine and sweep
 * to the right under the crankcase (the family signature since the CBR650F), a compact
 * sharp fairing with twin slim LED headlights either side of a pointed beak, the lower
 * engine left uncovered, the visible black steel frame, clip-ons above the top yoke,
 * short tail and the stubby black side silencer.
 */

const NOSE = -1.69;
const SCREEN_BASE = -1.56;
const SCREEN_TOP_Z = -1.19;

/** Side-panel rear edge: tank front → lower rear corner (the lower engine stays exposed). */
const SIDE_EDGE: P2[] = [
  [-1.15, 0.98],
  [-1.07, 0.95],
  [-0.98, 0.9],
  [-0.9, 0.83],
  [-0.83, 0.72],
  [-0.77, 0.6],
  [-0.72, 0.5],
  [-0.68, 0.46],
];

function fairing(): OutlineBody {
  const zs = [NOSE, -1.686, -1.677, -1.663, -1.643, -1.615, -1.578, -1.53, -1.47, -1.4, -1.32, -1.235, -1.145, -1.05, -0.955, -0.86, -0.765, -0.68, -0.62];
  const face: P2[] = [[0, 1], [0.24, 0.955], [0.54, 0.84], [0.82, 0.66], [0.97, 0.45], [0.92, 0.21], [0.58, 0.045], [0, 0]];
  const cowl: P2[] = [[0, 1], [0.34, 0.985], [0.63, 0.93], [0.82, 0.79], [0.95, 0.6], [1, 0.38], [0.97, 0.14], [0.86, 0]];
  const side: P2[] = [[0, 1], [0.38, 0.99], [0.68, 0.95], [0.86, 0.82], [0.97, 0.6], [1, 0.36], [0.97, 0.12], [0.9, 0]];
  return {
    zs,
    top: curve([[NOSE, 0.8], [-1.67, 0.83], [-1.62, 0.86], [-1.54, 0.89], [-1.44, 0.92], [-1.33, 0.945], [-1.21, 0.962], [-1.08, 0.96], [-0.93, 0.92], [-0.78, 0.86], [-0.62, 0.78]]),
    bottom: curve([[NOSE, 0.782], [-1.686, 0.73], [-1.672, 0.69], [-1.645, 0.66], [-1.59, 0.635], [-1.51, 0.62], [-1.43, 0.6], [-1.36, 0.52], [-1.27, 0.43], [-1.16, 0.38], [-1.02, 0.375], [-0.88, 0.4], [-0.74, 0.44], [-0.62, 0.465]]),
    half: curve([[NOSE, 0.012], [-1.686, 0.058], [-1.672, 0.1], [-1.645, 0.142], [-1.59, 0.186], [-1.51, 0.226], [-1.41, 0.258], [-1.29, 0.282], [-1.13, 0.292], [-0.96, 0.282], [-0.78, 0.252], [-0.62, 0.218]]),
    sections: [
      { z: NOSE, pts: face },
      { z: -1.6, pts: face },
      { z: -1.4, pts: cowl },
      { z: -1.0, pts: side },
      { z: -0.62, pts: side },
    ],
  };
}

function tail(): OutlineBody {
  return {
    zs: stationsBetween(-0.66, 0.08, 14, 0.5),
    top: curve([[-0.66, 0.81], [-0.5, 0.82], [-0.33, 0.845], [-0.27, 0.91], [-0.12, 0.955], [0.0, 0.99], [0.08, 1.02]]),
    bottom: curve([[-0.66, 0.67], [-0.42, 0.7], [-0.18, 0.77], [-0.02, 0.87], [0.05, 0.96], [0.08, 0.99]]),
    half: curve([[-0.66, 0.15], [-0.48, 0.14], [-0.26, 0.118], [-0.05, 0.085], [0.08, 0.03]]),
    sections: [
      { z: -0.66, pts: [[0, 1], [0.6, 0.98], [0.95, 0.84], [1, 0.55], [0.93, 0.22], [0.6, 0.02], [0, 0]] },
      { z: 0.08, pts: [[0, 1], [0.74, 0.97], [1, 0.72], [0.98, 0.44], [0.84, 0.2], [0.42, 0.02], [0, 0]] },
    ],
  };
}

/** Right LED headlight: a slim slanted blade beside the beak. */
const HEAD: P2[] = smooth2([[0.032, 0.744], [0.07, 0.749], [0.118, 0.763], [0.15, 0.779], [0.148, 0.792], [0.11, 0.783], [0.062, 0.771], [0.03, 0.759]], 2, true);
/** Small central intake under the beak. */
const INTAKE: P2[] = [[0, 0.728], [0.026, 0.726], [0.046, 0.71], [0.042, 0.692], [0.022, 0.684], [0, 0.682]];
/** Air outlet slit in the upper side panel. */
const VENT: P2[] = [[-1.27, 0.81], [-1.12, 0.8], [-0.99, 0.76], [-0.965, 0.738], [-1.1, 0.745], [-1.25, 0.78]];

function body(ctx: KitContext): void {
  const ob = fairing();
  const q = bodyQ(ctx, 1.6);
  const master = outlineLoft(ob, { su: q.su, sv: q.sv, creases: [2], capFront: true });
  const blackGloss = hard('#0b0c0e', 0.15, 0.2, 1);
  const A = ctx.hp.frontAxle;
  const open = sideRegion([[-1.15, 2], ...SIDE_EDGE, [-0.5, 0.3], [-0.3, 2]]);
  const arch = (_x: number, y: number, z: number) => 0.36 - Math.hypot(z - A[2], y - A[1]);
  const underScreen = fAnd(planRegion([[SCREEN_BASE + 0.08, -1], [-1.06, -1], [-1.06, 0.15], [-1.34, 0.165], [SCREEN_BASE + 0.08, 0.105]]), (_x, y) => y - 0.87);
  const lamps = faceLamps(ob, { outline: HEAD, at: [0.09, 0.766], inset: 0.005, square: 0.1, opts: { kind: 'head', inner: 'led', count: 2, depth: 0.04, rim: 0.003 } });
  const intake = fAnd(frontRegion(smooth2(INTAKE, 2, false)), (_x, _y, z) => -1.6 - z);
  const vent = sideRegion(smooth2(VENT, 3, true));
  const bodyCut = cut(master, fAnd(fNot(open), fNot(arch), fNot(underScreen), fNot(fOr(lamps.hole, intake))));
  // Layered side: upper cowl + side "wing" panel, split diagonally from the screen corner.
  const cowl = sideRegion([[-2, 2], [-1.34, 2], [-1.34, 0.94], [-1.38, 0.8], [-1.45, 0.68], [-1.52, 0.6], [-2, 0.58]]);
  const lower = sideRegion([[-1.3, 0.56], [-1.1, 0.6], [-0.9, 0.58], [-0.7, 0.52], [-0.4, 0.5], [-0.4, -1], [-1.3, -1]]);
  addPanel(ctx, 'chassis', bodyCut, cowl, PAINT, 0.003, 0.014);
  addPanel(ctx, 'chassis', bodyCut, fAnd(fNot(cowl), fNot(lower), fNot(vent)), PAINT, 0.003, 0.014);
  addPanel(ctx, 'chassis', bodyCut, fAnd(lower, fNot(cowl)), PAINT, 0.003, 0.014);
  for (const s of [-1, 1]) {
    const p = sideAt(ob, -1.1, 0.77, s);
    ctx.add('chassis', extrude(smooth2(VENT.map(([z, y]) => [z + (z < -1.1 ? -0.01 : 0.01), y + (y > 0.775 ? 0.01 : -0.01)] as P2), 3, true), 0.006, { plane: 'zy', center: p.p[0] - s * 0.035 }), F.texturedBlack);
  }
  ductLiner(ctx, ob, mirrorLoop(INTAKE), -1.52, 0.8);
  lamps.add(ctx, 'chassis');
  // DRL guides along the top edge of each lamp.
  for (const s of [-1, 1]) {
    const pts: P3[] = [];
    let nrm: P3 = [0, 0, -1];
    for (const [x, y] of [[0.036, 0.765], [0.07, 0.773], [0.11, 0.787], [0.142, 0.798]] as P2[]) {
      const h = frontHit(ob, s * x, y);
      if (h) {
        pts.push([h.p[0] + h.n[0] * 0.0015, h.p[1] + h.n[1] * 0.0015, h.p[2] + h.n[2] * 0.0015]);
        nrm = h.n;
      }
    }
    if (pts.length >= 3) ledStrip(ctx, 'chassis', pts, 0.004, 0.003, 'drl', nrm);
  }
  innerCowl(ctx, { z0: SCREEN_BASE + 0.06, z1: -1.18, yTop0: 0.875, yTop1: 0.935, yBot0: 0.76, yBot1: 0.81, w0: 0.14, w1: 0.24 });
  screen(ctx, 'chassis', {
    zs: stationsBetween(SCREEN_BASE, SCREEN_TOP_Z, 8, 0.35),
    top: curve([[SCREEN_BASE, 0.885], [-1.47, 0.94], [-1.37, 1.03], [-1.28, 1.11], [-1.22, 1.14], [SCREEN_TOP_Z, 1.145]]),
    bottom: curve([[SCREEN_BASE, 0.872], [-1.36, 0.925], [SCREEN_TOP_Z, 0.965]]),
    half: curve([[SCREEN_BASE, 0.14], [-1.42, 0.175], [-1.3, 0.165], [SCREEN_TOP_Z, 0.125]]),
    sections: [{ z: 0, pts: [[0, 1], [0.45, 0.985], [0.8, 0.93], [0.95, 0.8], [1, 0.55], [1, 0.25], [0.98, 0]] }],
  }, tint(F.screen, '#353d46'));
  buildTank(ctx, {
    front: -1.15,
    back: -0.62,
    top: 1.07,
    bottomFront: 0.9,
    bottomBack: 0.79,
    width: 0.44,
    style: 'sport',
    knee: 0.16,
    capZ: -0.9,
    topLine: [[-1.15, 0.965], [-1.06, 1.0], [-0.96, 1.048], [-0.86, 1.07], [-0.76, 1.062], [-0.68, 1.01], [-0.64, 0.94], [-0.62, 0.89]],
    bottomLine: [[-1.15, 0.9], [-0.96, 0.86], [-0.78, 0.82], [-0.62, 0.79]],
    halfLine: [[-1.15, 0.12], [-1.05, 0.186], [-0.93, 0.222], [-0.8, 0.216], [-0.7, 0.182], [-0.62, 0.12]],
  });
  buildSeat(ctx, { front: -0.64, back: -0.28, yFront: 0.806, y: 0.81, yBack: 0.845, width: 0.29, thick: 0.075, frontWidth: 0.18 });
  buildSeat(ctx, { front: -0.265, back: -0.03, yFront: 0.905, y: 0.918, yBack: 0.94, width: 0.19, thick: 0.05, frontWidth: 0.15 }, tint(seatFinish(ctx), '#161616'));
  const tm = outlineLoft(tail(), { su: ctx.seg(12, 4), sv: ctx.seg(6, 2), capBack: true });
  const seatHole: Field = fAnd(
    fOr(sideRegion([[-0.85, 0.79], [-0.272, 0.79], [-0.272, 1.4], [-0.85, 1.4]]), sideRegion([[-0.262, 0.885], [-0.02, 0.885], [-0.02, 1.4], [-0.262, 1.4]])),
    planRegion([[-0.85, -0.01], [-0.01, -0.01], [-0.01, 0.1], [-0.26, 0.1], [-0.27, 0.148], [-0.85, 0.148]]),
  );
  const tailVent = sideRegion(smooth2([[-0.24, 0.79], [-0.08, 0.855], [0.02, 0.915], [-0.01, 0.87], [-0.16, 0.785]], 3, true));
  addPanel(ctx, 'chassis', tm, fAnd(fNot(seatHole), fNot(tailVent)), PAINT, 0.0025, 0.012);
  undertray(ctx, { z0: -0.46, z1: 0.06, top0: 0.72, top1: 0.98, bot0: 0.67, botMid: 0.73, bot1: 0.94, w0: 0.135, w1: 0.034 });
  tailLamp(ctx, smooth2([[-0.06, -0.006], [0.06, -0.006], [0.066, 0.004], [0.0, 0.009], [-0.066, 0.004]], 4, true), [0, 0.965, 0.065], -0.6);
  frontFender(ctx, { from: -0.64, to: 0.82, gap: 0.02, width: 0.15 });
  hugger(ctx, blackGloss);
  plateHanger(ctx, { fromZ: -0.04, fromY: 0.78 });
  fasteners(ctx, ob, [[-1.3, 0.87], [-1.05, 0.83], [-0.82, 0.6], [-1.15, 0.45]]);
  exhaust(ctx);
}

/**
 * The CBR650 "waterfall": every header drops in front of the crankcase, turns right at a
 * height that steps down from the right-hand cylinder to the left-hand one (so the bends
 * nest without crossing), and the four pipes run back as a stacked bundle beside the
 * sump into the collector, then the link pipe and the short side can.
 */
function exhaust(ctx: KitContext): void {
  const c = ctx.bp.engine.crank;
  const zf = -1.07;
  const col: P3 = [0.13, 0.2, c[2] + 0.22];
  headers(ctx, {
    r: 0.018,
    heat: 'steel',
    tEnd: 0.75,
    route: (_i, p, j) => {
      const x = p.pos[0];
      const yTurn = 0.43 - 0.045 * j;
      const yRun = 0.28 - 0.036 * j;
      return [
        [x, 0.52, zf],
        [x + 0.004, yTurn + 0.04, zf - 0.006],
        [x * 0.5 + 0.08, yTurn - 0.012, zf - 0.002],
        [0.165, yRun + 0.085, zf + 0.07],
        [0.172, yRun + 0.03, -0.9],
        [0.166, yRun - 0.008 + j * 0.006, -0.76],
        [col[0] + 0.0, col[1] + (1.5 - j) * 0.018, col[2] - 0.08],
      ];
    },
  });
  collector(ctx, col, 0.05, 0.14, 'steel', 0.7);
  // Link pipe out of the collector to the short, black side can.
  const a: P3 = [0.165, 0.29, -0.45];
  const b: P3 = [0.19, 0.42, -0.17];
  heatPipe(ctx, [[col[0], col[1], col[2] + 0.07], [0.15, 0.22, c[2] + 0.36], [0.16, 0.26, -0.5], a], 0.026, 'steel', 0.7, 0.95);
  can(ctx, { a, b, shape: 'oval', r0: 0.066, r1: 0.068, finish: hard('#18191b', 0.4, 0.42, 0.4), cap: vary(F.steel, { rough: 0.22 }), slash: 0.2 });
  // Heat shield band on the can.
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const mid = new THREE.Vector3(...a).addScaledVector(d, 0.5);
  ctx.add('chassis', roundBox(0.012, 0.03, 0.16, 0.005), F.steel, new THREE.Matrix4().makeRotationX(-Math.atan2(d.y, d.z)).setPosition(mid.x + 0.066, mid.y + 0.01, mid.z));
  canHanger(ctx, [0.17, 0.38, -0.26], [0.12, 0.62, -0.32]);
  ctx.anchor('exhaustOutlet', b);
}

// ───────────────────────────── livery ─────────────────────────────

const GP_RED = '#c8102e';

function lettering(p: Pen, main: string, accent: string): void {
  if (p.view !== 'right' && p.view !== 'left') return;
  p.text('CBR', -1.04, 0.66, { color: main, size: 0.06, italic: true, weight: '900', stretch: 1.15 });
  p.text('650R', -0.06, 0.88, { color: accent, size: 0.026, italic: true, weight: '900' });
  p.text('HONDA', -1.5, 0.75, { color: main, size: 0.026, weight: '900', spacing: 0.06 });
}

function livery(c: LiveryCanvas, lv: Livery, env: LiveryEnv): void {
  const gunpowder = env.index === 1;
  const black = '#111214';
  c.views(ALL_VIEWS, (p) => {
    if (gunpowder) {
      // Matt Gunpowder Black Metallic with gloss black lower panels and red pinstripes.
      p.fill(lv.primary, 'matte');
      if (p.view === 'right' || p.view === 'left') {
        p.poly([[-1.3, 0.56], [-1.1, 0.6], [-0.9, 0.58], [-0.7, 0.52], [-0.4, 0.5], [-0.4, -0.1], [-1.3, -0.1]], black, 'gloss');
        p.line([[-1.62, 0.72], [-1.34, 0.8], [-1.0, 0.82], [-0.82, 0.76]], GP_RED, 0.005);
        lettering(p, '#9a9ea6', GP_RED);
      }
      return;
    }
    // Grand Prix Red: red cowl, side wing, tank and tail; black lower panel and tail edge.
    p.fill(GP_RED, 'gloss');
    if (p.view === 'right' || p.view === 'left') {
      p.poly([[-1.3, 0.56], [-1.1, 0.6], [-0.9, 0.58], [-0.7, 0.52], [-0.4, 0.5], [-0.4, -0.1], [-1.3, -0.1]], black, 'gloss');
      p.poly([[-0.62, 0.74], [0.15, 0.95], [0.15, 0.6], [-0.62, 0.6]], black, 'gloss');
      p.line([[-1.66, 0.735], [-1.36, 0.69], [-1.1, 0.61], [-0.9, 0.59]], '#f2f2f2', 0.004);
      lettering(p, '#f4f4f4', '#f4f4f4');
    } else if (p.view === 'front') {
      p.rect(-1, -1, 1, 0.56, black, 'gloss');
    }
  });
}

export function cbr650rBlueprint(spec: BikeSpec): BikeBlueprint {
  const lv = spec.liveries[0];
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.12, 0.75, 1.145],
    wheelbase: 1.45,
    rakeDeg: 25.5,
    trail: 0.101,
    forkLength: 0.727,
    front: { tyre: '120/70ZR17', rimWidthIn: 3.5, crown: 0.85, tread: 'sport', tyreLabel: 'Sport Radial' },
    rear: { tyre: '180/55ZR17', rimWidthIn: 5.5, crown: 0.95, tread: 'sport', tyreLabel: 'Sport Radial' },
    frontWheel: { type: 'cast', spokes: 5, shape: 'y', color: lv.wheel },
    rearWheel: { type: 'cast', spokes: 5, shape: 'y', color: lv.wheel },
    fork: { type: 'usd', stanchion: 0.041, spacing: 0.205, outerColor: '#b98b35', innerColor: '#c9ccd2', footColor: '#1c1d20', capColor: '#2a2c30', adjusterColor: '#c99a2c', aboveClamp: 0.03, clampGap: 0.195 },
    frontBrake: { discs: 2, discDia: 0.31, disc: 'floating', carrierColor: '#2b2d31', caliper: 'radial4', caliperColor: '#2a2b2e', caliperAngleDeg: 76 },
    rearBrake: { discs: 1, discDia: 0.24, disc: 'fixed', carrierColor: '#2b2d31', caliper: 'axial1', caliperColor: '#2a2b2e', caliperAngleDeg: 200 },
    // Steel diamond frame: painted black twin spars, clearly visible under the tank.
    frame: { type: 'twinSpar', color: '#17181b', metal: 0.35, rough: 0.42, subframe: 'tubular', subframeColor: '#17181b', width: 0.33 },
    swingarm: { type: 'box', length: 0.57, angleDeg: 9, color: '#1d1e21', metal: 0.6, rough: 0.42 },
    shock: { layout: 'mono', springColor: '#b3121b', bodyColor: '#2a2c30', reservoir: false },
    drive: { type: 'chain', side: 'left', frontTeeth: 15, rearTeeth: 42, pitch: 0.015875, sprocketColor: '#1e1f22' },
    engine: {
      layout: 'I4',
      cc: 649,
      crank: [0, 0.4, -0.8],
      tiltDeg: 30,
      caseColor: '#1c1d20',
      coverColor: '#2c2e33',
      headColor: '#25272b',
      camCoverColor: '#17181b',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.42, h: 0.32, z: -1.22, y: 0.62, tiltDeg: 14, curved: true },
      width: 0.38,
    },
    // Custom four-header "waterfall" and side can (see `exhaust` in the body builder).
    exhaust: { route: 'none', side: 'right', can: 'oval', canLength: 0.3, canDia: 0.13, canFinish: 'black', headerFinish: 'steel' },
    cockpit: {
      bars: 'clipon',
      grip: [0.335, 0.965, -0.975],
      barDia: 0.022,
      dash: 'tft',
      dashPos: [0, 1.045, -1.135],
      dashSize: [0.112, 0.066],
      dashTiltDeg: 46,
      dashMount: 'fairing',
      mirrors: 'fairing',
      mirrorPos: [0.33, 1.015, -1.25],
      mirrorSize: [0.135, 0.06],
      mirrorIndicators: false,
      mirrorColor: '#0d0e10',
      mirrorShape: 'sport',
      topClamp: 'cast',
      steeringDamper: 'none',
      leverColor: '#1e1f22',
      reservoirs: true,
      clutch: 'cable',
      ignition: 'clamp',
      switchColor: '#151618',
      gripColor: '#121212',
      barEndColor: '#1d1e21',
    },
    lights: { head: 'sportTwin', tail: 'strip', rearIndicators: 'stalk' },
    seat: { height: 0.81, front: -0.64, back: -0.28, pillion: 'seat', color: '#151515' },
    rider: { hip: [0, 0.89, -0.45], peg: [0.19, 0.37, -0.43], torsoPitch: 0.6 },
    footrests: 'rearset',
    plate: { mount: 'hanger', pos: [0, 0.6, 0.37], tiltDeg: -14 },
    body,
    livery,
    groundClearance: 0.13,
    features: [],
    zones: { splitY: 0.52, decal: [-1.04, 0.66] },
  };
}
