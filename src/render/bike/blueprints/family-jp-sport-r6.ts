import * as THREE from 'three';
import type { BikeSpec, Livery } from '../../../data/bikes';
import { T, type KitContext } from '../context';
import { addPanel, bodyQ, buildSeat, buildTank, frontFender, PAINT, screen, seatFinish } from '../kit/body';
import { ductLiner, faceLamps, fasteners, frontHit, innerCowl, mirrorLoop, tailLamp, undertray } from '../kit/jp-sport-parts';
import { ledStrip } from '../kit/lights';
import { hugger, plateHanger } from '../kit/rear';
import { curve, outlineLoft, sideAt, stationsBetween, type OutlineBody } from '../kit/shape';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv, type Pen } from '../livery';
import { extrude, roundBox, smooth2, type P2, type P3 } from '../mesh';
import { F, hard, tint } from '../sink';
import { cut, fAnd, fNot, frontRegion, fOr, planRegion, sideRegion, type Field } from '../surface';
import type { BikeBlueprint } from '../types';

/**
 * Yamaha YZF-R6 (2017–2020).
 * Spec sheet: wheelbase 1375 mm, caster 24°, trail 97 mm, seat 850 mm,
 * L×W×H 2040 × 695 × 1150 mm, ground clearance 130 mm, 120/70ZR17 + 180/55ZR17 on
 * 3.50/5.50 rims, 43 mm KYB USD fork (from the R1), 320 mm discs with radial
 * monoblock calipers, aluminium Deltabox frame, 599 cc inline four.
 * Design cues: the R1 face in a smaller body — central M-shaped ram-air duct (no lamp
 * inside it) flanked by twin LED headlight "eyes" at the upper corners of the nose,
 * a taller screen, compact aluminium tank, slim stacked tail with the LED light under
 * the tip, and the short stubby silencer low on the right under the engine.
 */

const NOSE = -1.6;
const SCREEN_BASE = -1.47;
const SCREEN_TOP_Z = -1.09;

const SIDE_EDGE: P2[] = [
  [-1.12, 0.975],
  [-1.04, 0.94],
  [-0.96, 0.9],
  [-0.87, 0.83],
  [-0.78, 0.68],
  [-0.71, 0.5],
  [-0.65, 0.36],
  [-0.58, 0.27],
  [-0.5, 0.2],
  [-0.44, 0.17],
];

function fairing(): OutlineBody {
  const zs = [NOSE, -1.594, -1.583, -1.568, -1.548, -1.518, -1.478, -1.428, -1.368, -1.298, -1.22, -1.13, -1.03, -0.93, -0.83, -0.73, -0.63, -0.53, -0.44];
  const face: P2[] = [[0, 1], [0.3, 0.96], [0.62, 0.86], [0.85, 0.68], [0.97, 0.46], [0.9, 0.21], [0.56, 0.045], [0, 0]];
  const cowl: P2[] = [[0, 1], [0.35, 0.985], [0.64, 0.935], [0.82, 0.8], [0.95, 0.6], [1, 0.38], [0.95, 0.12], [0.75, 0]];
  const side: P2[] = [[0, 1], [0.38, 0.99], [0.68, 0.95], [0.86, 0.82], [0.97, 0.6], [1, 0.36], [0.93, 0.1], [0.6, 0]];
  const back: P2[] = [[0, 1], [0.42, 0.99], [0.72, 0.95], [0.9, 0.82], [0.98, 0.6], [1, 0.36], [0.92, 0.1], [0.5, 0]];
  return {
    zs,
    top: curve([[NOSE, 0.79], [-1.57, 0.838], [-1.52, 0.866], [-1.43, 0.9], [-1.33, 0.928], [-1.22, 0.952], [-1.12, 0.965], [-0.99, 0.952], [-0.83, 0.905], [-0.63, 0.83], [-0.44, 0.74]]),
    bottom: curve([[NOSE, 0.775], [-1.594, 0.71], [-1.58, 0.665], [-1.555, 0.635], [-1.51, 0.615], [-1.41, 0.6], [-1.3, 0.5], [-1.17, 0.33], [-1.04, 0.2], [-0.91, 0.15], [-0.73, 0.14], [-0.57, 0.15], [-0.44, 0.18]]),
    half: curve([[NOSE, 0.008], [-1.594, 0.058], [-1.58, 0.098], [-1.55, 0.138], [-1.49, 0.184], [-1.41, 0.222], [-1.31, 0.258], [-1.19, 0.282], [-1.03, 0.288], [-0.87, 0.278], [-0.69, 0.246], [-0.44, 0.195]]),
    sections: [
      { z: NOSE, pts: face },
      { z: -1.53, pts: face },
      { z: -1.33, pts: cowl },
      { z: -0.97, pts: side },
      { z: -0.44, pts: back },
    ],
  };
}

function tail(): OutlineBody {
  return {
    zs: stationsBetween(-0.66, 0.12, 14, 0.5),
    top: curve([[-0.66, 0.84], [-0.48, 0.848], [-0.29, 0.872], [-0.21, 0.925], [-0.05, 0.966], [0.06, 0.998], [0.12, 1.025]]),
    bottom: curve([[-0.66, 0.7], [-0.38, 0.72], [-0.14, 0.77], [0.02, 0.86], [0.09, 0.945], [0.12, 0.99]]),
    half: curve([[-0.66, 0.155], [-0.44, 0.144], [-0.21, 0.12], [0.0, 0.085], [0.09, 0.048], [0.12, 0.02]]),
    sections: [
      { z: -0.66, pts: [[0, 1], [0.6, 0.98], [0.95, 0.84], [1, 0.55], [0.93, 0.22], [0.6, 0.02], [0, 0]] },
      { z: 0.12, pts: [[0, 1], [0.72, 0.97], [1, 0.74], [0.98, 0.46], [0.84, 0.2], [0.42, 0.02], [0, 0]] },
    ],
  };
}

/** M-shaped ram-air duct (front view, right half): two humps meeting at the beak. */
const M_DUCT: P2[] = [[0, 0.702], [0.022, 0.715], [0.05, 0.738], [0.077, 0.745], [0.1, 0.729], [0.111, 0.694], [0.105, 0.661], [0.087, 0.643], [0, 0.639]];
/** Right LED headlight "eye": slanted wedge at the upper outer corner of the face. */
const EYE: P2[] = smooth2([[0.1, 0.762], [0.138, 0.77], [0.172, 0.786], [0.192, 0.803], [0.188, 0.815], [0.152, 0.806], [0.116, 0.792], [0.096, 0.779]], 2, true);
/** Slim dart vent under the shoulder crease. */
const VENT: P2[] = [[-1.23, 0.862], [-1.09, 0.858], [-0.96, 0.826], [-0.925, 0.8], [-1.01, 0.78], [-1.17, 0.79]];

function body(ctx: KitContext): void {
  const ob = fairing();
  const q = bodyQ(ctx, 1.7);
  const master = outlineLoft(ob, { su: q.su, sv: q.sv, creases: [2], capFront: true });
  const blackGloss = hard('#0b0c0e', 0.15, 0.2, 1);
  const A = ctx.hp.frontAxle;
  const open = sideRegion([[-1.12, 2], ...SIDE_EDGE, [-0.28, 0.1], [-0.28, 2]]);
  const arch = (_x: number, y: number, z: number) => 0.362 - Math.hypot(z - A[2], y - A[1]);
  const underScreen = fAnd(planRegion([[SCREEN_BASE + 0.07, -1], [-0.97, -1], [-0.97, 0.15], [-1.27, 0.165], [SCREEN_BASE + 0.07, 0.11]]), (_x, y) => y - 0.86);
  const eyes = faceLamps(ob, { outline: EYE, at: [0.145, 0.788], inset: 0.004, square: 0.1, opts: { kind: 'head', inner: 'led', count: 2, depth: 0.04, rim: 0.005 } });
  const intake = fAnd(frontRegion(M_DUCT), (_x, _y, z) => -1.52 - z);
  const vent = sideRegion(smooth2(VENT, 4, true));
  const bodyCut = cut(master, fAnd(fNot(open), fNot(arch), fNot(underScreen), fNot(fOr(intake, eyes.hole))));
  const cowl = sideRegion([[-2, 2], [-1.26, 2], [-1.26, 0.93], [-1.3, 0.78], [-1.36, 0.66], [-1.44, 0.6], [-2, 0.58]]);
  const belly = sideRegion([[-1.09, 0.32], [-0.91, 0.3], [-0.69, 0.29], [-0.38, 0.29], [-0.38, -1], [-1.09, -1]]);
  addPanel(ctx, 'chassis', bodyCut, cowl, PAINT, 0.003, 0.014);
  addPanel(ctx, 'chassis', bodyCut, fAnd(fNot(cowl), fNot(belly), fNot(vent)), PAINT, 0.003, 0.014);
  addPanel(ctx, 'chassis', bodyCut, fAnd(belly, fNot(cowl)), PAINT, 0.003, 0.014);
  // Dart vent: dark duct with a louvre.
  for (const s of [-1, 1]) {
    const p = sideAt(ob, -1.07, 0.74, s);
    const back = smooth2(VENT.map(([z, y]) => [z + (z < -1.07 ? -0.01 : 0.01), y + (y > 0.75 ? 0.01 : -0.01)] as P2), 3, true);
    ctx.add('chassis', extrude(back, 0.006, { plane: 'zy', center: p.p[0] - s * 0.04 }), F.texturedBlack);
    ctx.add('chassis', extrude([[-1.19, 0.83], [-0.97, 0.808], [-0.97, 0.8], [-1.19, 0.822]], 0.03, { plane: 'zy', center: p.p[0] - s * 0.024 }), blackGloss);
  }
  // M-duct: black lining with a mesh grille; the R6 carries no lamp inside the duct.
  ductLiner(ctx, ob, mirrorLoop(M_DUCT), -1.42, 0.8);
  if (ctx.micro) for (let i = 0; i < 7; i++) ctx.add('chassis', roundBox(0.003, 0.09, 0.004, 0.001), F.texturedBlack, T(-0.09 + i * 0.03, 0.69, -1.5));
  eyes.add(ctx, 'chassis');
  // DRL guide along the top of each eye.
  for (const s of [-1, 1]) {
    const pts: P3[] = [];
    let nrm: P3 = [0, 0, -1];
    for (const [x, y] of [[0.104, 0.783], [0.138, 0.794], [0.168, 0.808], [0.186, 0.819]] as P2[]) {
      const h = frontHit(ob, s * x, y);
      if (h) {
        pts.push([h.p[0] + h.n[0] * 0.0015, h.p[1] + h.n[1] * 0.0015, h.p[2] + h.n[2] * 0.0015]);
        nrm = h.n;
      }
    }
    if (pts.length >= 3) ledStrip(ctx, 'chassis', pts, 0.004, 0.003, 'drl', nrm);
  }
  innerCowl(ctx, { z0: SCREEN_BASE + 0.05, z1: -1.09, yTop0: 0.87, yTop1: 0.93, yBot0: 0.75, yBot1: 0.8, w0: 0.15, w1: 0.24 });
  // Screen: taller and steeper than the R1's (the 2017 R6 gained a bigger bubble).
  screen(ctx, 'chassis', {
    zs: stationsBetween(SCREEN_BASE, SCREEN_TOP_Z, 8, 0.35),
    top: curve([[SCREEN_BASE, 0.895], [-1.4, 0.955], [-1.31, 1.05], [-1.21, 1.13], [-1.14, 1.15], [SCREEN_TOP_Z, 1.152]]),
    bottom: curve([[SCREEN_BASE, 0.882], [-1.27, 0.93], [SCREEN_TOP_Z, 0.97]]),
    half: curve([[SCREEN_BASE, 0.15], [-1.33, 0.19], [-1.2, 0.178], [SCREEN_TOP_Z, 0.13]]),
    sections: [{ z: 0, pts: [[0, 1], [0.45, 0.985], [0.8, 0.93], [0.95, 0.8], [1, 0.55], [1, 0.25], [0.98, 0]] }],
  }, tint(F.screen, '#3a4450'));
  buildTank(ctx, {
    front: -1.1,
    back: -0.58,
    top: 1.055,
    bottomFront: 0.9,
    bottomBack: 0.8,
    width: 0.42,
    style: 'sport',
    knee: 0.18,
    capZ: -0.87,
    topLine: [[-1.1, 0.958], [-1.02, 0.99], [-0.93, 1.035], [-0.84, 1.056], [-0.75, 1.046], [-0.67, 1.0], [-0.61, 0.935], [-0.58, 0.9]],
    bottomLine: [[-1.1, 0.9], [-0.95, 0.865], [-0.76, 0.828], [-0.58, 0.8]],
    halfLine: [[-1.1, 0.115], [-1.0, 0.178], [-0.89, 0.21], [-0.78, 0.205], [-0.68, 0.172], [-0.58, 0.115]],
  });
  buildSeat(ctx, { front: -0.62, back: -0.25, yFront: 0.846, y: 0.85, yBack: 0.876, width: 0.27, thick: 0.07, frontWidth: 0.17 });
  buildSeat(ctx, { front: -0.235, back: -0.0, yFront: 0.935, y: 0.948, yBack: 0.964, width: 0.19, thick: 0.05, frontWidth: 0.145 }, tint(seatFinish(ctx), '#141414'));
  const tm = outlineLoft(tail(), { su: ctx.seg(12, 4), sv: ctx.seg(6, 2), capBack: true });
  const seatHole: Field = fAnd(
    fOr(sideRegion([[-0.8, 0.83], [-0.242, 0.83], [-0.242, 1.4], [-0.8, 1.4]]), sideRegion([[-0.232, 0.925], [0.01, 0.925], [0.01, 1.4], [-0.232, 1.4]])),
    planRegion([[-0.8, -0.01], [0.02, -0.01], [0.02, 0.1], [-0.23, 0.1], [-0.24, 0.138], [-0.8, 0.138]]),
  );
  const tailVent = sideRegion(smooth2([[-0.22, 0.8], [-0.05, 0.872], [0.03, 0.9], [0.0, 0.86], [-0.15, 0.79]], 3, true));
  addPanel(ctx, 'chassis', tm, fAnd(fNot(seatHole), fNot(tailVent)), PAINT, 0.0025, 0.012);
  undertray(ctx, { z0: -0.43, z1: 0.1, top0: 0.74, top1: 0.955, bot0: 0.69, botMid: 0.74, bot1: 0.915, w0: 0.138, w1: 0.035 });
  tailLamp(ctx, smooth2([[-0.065, -0.006], [0.065, -0.006], [0.072, 0.004], [0.0, 0.009], [-0.072, 0.004]], 4, true), [0, 0.94, 0.09], -0.62);
  frontFender(ctx, { from: -0.62, to: 0.82, gap: 0.02, width: 0.15 });
  hugger(ctx, blackGloss);
  plateHanger(ctx, { fromZ: -0.0, fromY: 0.79 });
  // LCD panel beside the analogue tachometer (the 2017 R6 kept a needle tach).
  const d = ctx.bp.cockpit.dashPos;
  const tilt = (ctx.bp.cockpit.dashTiltDeg * Math.PI) / 180;
  const lcdM = new THREE.Matrix4().makeRotationX(-tilt).setPosition(d[0] + 0.085, d[1] - 0.006, d[2] + 0.004);
  ctx.add('chassis', roundBox(0.075, 0.05, 0.028, 0.008, 2).transform(T(0, 0, -0.015)), F.texturedBlack, lcdM);
  ctx.add('chassis', roundBox(0.062, 0.036, 0.002, 0.003, 1), hard('#2e3a33', 0.1, 0.25, 1), lcdM);
  fasteners(ctx, ob, [[-1.21, 0.86], [-0.97, 0.8], [-0.77, 0.55], [-0.95, 0.33], [-0.59, 0.3]]);
}

// ───────────────────────────── livery ─────────────────────────────

function lettering(p: Pen, color: string, accent: string): void {
  if (p.view !== 'right' && p.view !== 'left') return;
  p.text('R6', -0.88, 0.53, { color, size: 0.14, italic: true, weight: '900', stretch: 1.1, font: 'Arial, Helvetica, sans-serif' });
  p.text('YAMAHA', -1.25, 0.8, { color, size: 0.03, weight: '900', spacing: 0.08 });
  p.text('YZF-R6', 0.0, 0.905, { color: accent, size: 0.024, italic: true, weight: '800' });
}

function livery(c: LiveryCanvas, lv: Livery, env: LiveryEnv): void {
  const techBlack = env.index === 1;
  const black = '#0c0d10';
  c.views(ALL_VIEWS, (p) => {
    if (techBlack) {
      // Tech Black: gloss black body, matte dark-grey flank panels, blue-grey R6 graphics.
      p.fill('#141518', 'metallic');
      if (p.view === 'right' || p.view === 'left') {
        p.poly([[-1.17, 0.86], [-0.83, 0.79], [-0.6, 0.62], [-0.6, 0.3], [-1.08, 0.3]], '#2a2c31', 'matte');
        p.line([[-1.58, 0.74], [-1.18, 0.86], [-0.83, 0.79]], '#4a7fd0', 0.006);
        lettering(p, '#8d99a8', '#8d99a8');
      }
      return;
    }
    // Team Yamaha Blue: racing blue body, black lower flanks and belly, white R6.
    p.fill(lv.primary, 'metallic');
    if (p.view === 'right' || p.view === 'left') {
      p.poly([[-1.12, 0.34], [-0.87, 0.42], [-0.58, 0.5], [-0.36, 0.6], [-0.36, -0.1], [-1.17, -0.1]], black, 'gloss');
      p.poly([[-1.43, 0.56], [-1.27, 0.44], [-1.12, 0.34], [-1.17, -0.1], [-1.6, -0.1]], black, 'gloss');
      // Silver streak along the shoulder crease and a light-blue accent under it.
      p.line([[-1.56, 0.765], [-1.22, 0.92], [-0.97, 0.92], [-0.72, 0.8]], '#c9ccd2', 0.005, 'metallic');
      p.line([[-1.5, 0.6], [-1.27, 0.5], [-1.1, 0.41]], '#3fa9f5', 0.012);
      lettering(p, '#f4f6f8', '#f4f6f8');
      p.poly([[-0.58, 0.67], [0.2, 0.92], [0.2, 0.6], [-0.58, 0.6]], black, 'gloss');
    } else if (p.view === 'top') {
      p.rect(-0.8, -0.05, -0.58, 0.05, black, 'gloss');
    } else if (p.view === 'front') {
      p.rect(-1, -1, 1, 0.6, black, 'gloss');
    }
  });
}

export function r6Blueprint(spec: BikeSpec): BikeBlueprint {
  const lv = spec.liveries[0];
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.04, 0.695, 1.15],
    wheelbase: 1.375,
    rakeDeg: 24,
    trail: 0.097,
    forkLength: 0.725,
    front: { tyre: '120/70ZR17', rimWidthIn: 3.5, crown: 0.82, tread: 'sport', tyreLabel: 'Sport Radial RS' },
    rear: { tyre: '180/55ZR17', rimWidthIn: 5.5, crown: 0.92, tread: 'sport', tyreLabel: 'Sport Radial RS' },
    frontWheel: { type: 'cast', spokes: 5, shape: 'split', color: lv.wheel },
    rearWheel: { type: 'cast', spokes: 5, shape: 'split', color: lv.wheel },
    fork: { type: 'usd', stanchion: 0.043, spacing: 0.205, outerColor: '#b9902f', innerColor: '#c9a65a', footColor: '#1e1f22', capColor: '#2a2c30', adjusterColor: '#c99a2c', aboveClamp: 0.008, clampGap: 0.2 },
    frontBrake: { discs: 2, discDia: 0.32, disc: 'floating', carrierColor: '#2b2d31', caliper: 'radialMono4', caliperColor: '#2b2d31', caliperAngleDeg: 76 },
    rearBrake: { discs: 1, discDia: 0.22, disc: 'fixed', carrierColor: '#2b2d31', caliper: 'axial1', caliperColor: '#2b2d31', caliperAngleDeg: 200 },
    frame: { type: 'twinSpar', color: '#4b4f56', metal: 0.85, rough: 0.38, subframe: 'cast', subframeColor: '#232428', width: 0.35 },
    swingarm: { type: 'box', length: 0.56, angleDeg: 10, color: '#4b4f56', metal: 0.85, rough: 0.38 },
    shock: { layout: 'mono', springColor: '#2b4fa8', bodyColor: '#2a2c30', reservoir: true },
    drive: { type: 'chain', side: 'left', frontTeeth: 16, rearTeeth: 45, pitch: 0.015875, sprocketColor: '#1e1f22' },
    engine: {
      layout: 'I4',
      cc: 599,
      crank: [0, 0.41, -0.75],
      tiltDeg: 35,
      caseColor: '#232428',
      coverColor: '#3a3d42',
      headColor: '#2a2c30',
      camCoverColor: '#1a1b1e',
      camCoverText: 'YAMAHA',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.4, h: 0.32, z: -1.2, y: 0.6, tiltDeg: 14, curved: true },
      filterColor: '#1d3b8a',
      width: 0.36,
    },
    // Pre-chamber under the engine and the short stubby can low on the right.
    exhaust: { route: 'underslung', side: 'right', can: 'stubby', canLength: 0.21, canDia: 0.125, canFinish: 'black', headerFinish: 'titanium' },
    cockpit: {
      bars: 'clipon',
      grip: [0.33, 0.9, -0.9],
      barDia: 0.022,
      dash: 'analog',
      dashPos: [-0.02, 1.03, -1.06],
      dashSize: [0.088, 0.088],
      dashTiltDeg: 46,
      dashMount: 'fairing',
      mirrors: 'fairing',
      mirrorPos: [0.322, 1.015, -1.16],
      mirrorSize: [0.13, 0.06],
      mirrorIndicators: true,
      mirrorColor: '#0d0e10',
      mirrorShape: 'sport',
      topClamp: 'milled',
      steeringDamper: 'none',
      leverColor: '#1e1f22',
      reservoirs: true,
      clutch: 'cable',
      ignition: 'clamp',
      switchColor: '#151618',
      gripColor: '#121212',
      barEndColor: '#1d1e21',
    },
    lights: { head: 'r1', tail: 'r1', rearIndicators: 'stalk' },
    seat: { height: 0.85, front: -0.62, back: -0.25, pillion: 'seat', color: '#151515' },
    rider: { hip: [0, 0.94, -0.41], peg: [0.185, 0.41, -0.38], torsoPitch: 0.74 },
    footrests: 'rearset',
    plate: { mount: 'hanger', pos: [0, 0.6, 0.39], tiltDeg: -14 },
    body,
    livery,
    groundClearance: 0.13,
    features: [],
    zones: { splitY: 0.4, decal: [-0.88, 0.53] },
  };
}
