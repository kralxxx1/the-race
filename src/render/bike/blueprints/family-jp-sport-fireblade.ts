import type { BikeSpec, Livery } from '../../../data/bikes';
import { T, type KitContext } from '../context';
import { addPanel, bodyQ, buildSeat, buildTank, frontFender, PAINT, screen, seatFinish } from '../kit/body';
import { bladeSlats, ductLiner, ductWall, faceLamps, fasteners, frontHit, innerCowl, mirrorLoop, tailLamp, undertray } from '../kit/jp-sport-parts';
import { ledStrip } from '../kit/lights';
import { hugger, plateHanger } from '../kit/rear';
import { curve, outlineLoft, stationsBetween, type OutlineBody } from '../kit/shape';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv, type Pen } from '../livery';
import { roundBox, smooth2, type P2, type P3 } from '../mesh';
import { F, hard, tint } from '../sink';
import { cut, fAnd, fNot, frontRegion, fOr, planRegion, sideRegion, type Field } from '../surface';
import type { BikeBlueprint } from '../types';

/**
 * Honda CBR1000RR-R Fireblade SP (2024).
 * Spec sheet: wheelbase 1455 mm, caster 24°, trail 102 mm, seat 830 mm,
 * L×W×H 2100 × 745 × 1140 mm, ground clearance 115 mm, 120/70ZR17 + 200/55ZR17 on
 * 3.50/6.00 rims, Öhlins NPX 43 mm fork, Brembo Stylema R calipers on 330 mm discs,
 * aluminium twin-tube frame, RC213V-S derived swingarm, titanium side silencer.
 * Design cues: very narrow, low and pointed nose; a large central ram-air duct with two
 * slim slanted LED headlights above-outside it; winglets set inside ducts in the upper
 * side cowl; a hot-air outlet behind the front wheel; short, high tail; gold wheels.
 */

const NOSE = -1.728;
const SCREEN_BASE = -1.6;
const SCREEN_TOP_Z = -1.2;

/** Side-panel rear edge (side view): tank front → back of the belly pan. */
const SIDE_EDGE: P2[] = [
  [-1.19, 0.975],
  [-1.1, 0.945],
  [-1.01, 0.89],
  [-0.91, 0.81],
  [-0.82, 0.66],
  [-0.75, 0.5],
  [-0.69, 0.37],
  [-0.62, 0.27],
  [-0.54, 0.2],
  [-0.47, 0.17],
];

function fairing(): OutlineBody {
  const zs = [NOSE, -1.724, -1.715, -1.7, -1.68, -1.65, -1.61, -1.56, -1.5, -1.43, -1.35, -1.26, -1.17, -1.07, -0.97, -0.87, -0.77, -0.67, -0.57, -0.47];
  // Pointed, narrow face: the upper shoulders fall away steeply from the centre ridge.
  const face: P2[] = [[0, 1], [0.2, 0.952], [0.5, 0.83], [0.81, 0.66], [0.97, 0.45], [0.92, 0.21], [0.58, 0.045], [0, 0]];
  const cowl: P2[] = [[0, 1], [0.33, 0.98], [0.62, 0.925], [0.82, 0.79], [0.95, 0.6], [1, 0.38], [0.95, 0.12], [0.76, 0]];
  const side: P2[] = [[0, 1], [0.38, 0.99], [0.68, 0.95], [0.86, 0.82], [0.97, 0.6], [1, 0.36], [0.93, 0.1], [0.6, 0]];
  const back: P2[] = [[0, 1], [0.42, 0.99], [0.72, 0.95], [0.9, 0.82], [0.98, 0.6], [1, 0.36], [0.92, 0.1], [0.5, 0]];
  return {
    zs,
    top: curve([[NOSE, 0.775], [-1.71, 0.8], [-1.66, 0.83], [-1.58, 0.862], [-1.48, 0.895], [-1.37, 0.925], [-1.25, 0.95], [-1.12, 0.958], [-0.98, 0.94], [-0.85, 0.9], [-0.68, 0.82], [-0.47, 0.73]]),
    bottom: curve([[NOSE, 0.758], [-1.72, 0.715], [-1.7, 0.68], [-1.665, 0.648], [-1.61, 0.625], [-1.53, 0.61], [-1.45, 0.592], [-1.37, 0.5], [-1.26, 0.34], [-1.12, 0.21], [-0.97, 0.145], [-0.78, 0.13], [-0.6, 0.14], [-0.47, 0.175]]),
    half: curve([[NOSE, 0.01], [-1.722, 0.05], [-1.705, 0.09], [-1.675, 0.13], [-1.63, 0.17], [-1.56, 0.205], [-1.47, 0.238], [-1.37, 0.265], [-1.24, 0.288], [-1.08, 0.298], [-0.92, 0.29], [-0.72, 0.258], [-0.47, 0.2]]),
    sections: [
      { z: NOSE, pts: face },
      { z: -1.62, pts: face },
      { z: -1.42, pts: cowl },
      { z: -1.02, pts: side },
      { z: -0.47, pts: back },
    ],
  };
}

function tail(): OutlineBody {
  return {
    zs: stationsBetween(-0.69, 0.075, 14, 0.5),
    top: curve([[-0.69, 0.82], [-0.5, 0.83], [-0.33, 0.853], [-0.27, 0.918], [-0.12, 0.964], [0.0, 1.0], [0.075, 1.03]]),
    bottom: curve([[-0.69, 0.68], [-0.42, 0.71], [-0.18, 0.78], [-0.02, 0.888], [0.05, 0.975], [0.075, 1.0]]),
    half: curve([[-0.69, 0.155], [-0.48, 0.142], [-0.26, 0.118], [-0.05, 0.084], [0.075, 0.03]]),
    sections: [
      { z: -0.69, pts: [[0, 1], [0.6, 0.98], [0.95, 0.84], [1, 0.55], [0.93, 0.22], [0.6, 0.02], [0, 0]] },
      { z: 0.075, pts: [[0, 1], [0.74, 0.97], [1, 0.72], [0.98, 0.44], [0.84, 0.2], [0.42, 0.02], [0, 0]] },
    ],
  };
}

/** Central ram-air duct (front view, right half from the top centre down to the bottom centre). */
const INTAKE: P2[] = [[0, 0.754], [0.028, 0.749], [0.054, 0.733], [0.069, 0.706], [0.07, 0.672], [0.062, 0.648], [0.04, 0.636], [0, 0.633]];
/** Right headlight: a slim parallelogram rising outwards, above and outside the duct. */
const HEAD: P2[] = smooth2([[0.07, 0.724], [0.1, 0.734], [0.135, 0.752], [0.162, 0.774], [0.16, 0.792], [0.132, 0.784], [0.096, 0.765], [0.066, 0.75]], 2, true);
/** Winglet duct in the upper side cowl (side view). */
const WING_DUCT: P2[] = [[-1.535, 0.752], [-1.46, 0.79], [-1.36, 0.822], [-1.285, 0.832], [-1.262, 0.81], [-1.29, 0.788], [-1.37, 0.764], [-1.47, 0.732]];
/** Hot-air outlet behind the front wheel (side view). */
const OUTLET: P2[] = [[-1.215, 0.53], [-1.09, 0.585], [-0.995, 0.575], [-1.005, 0.48], [-1.1, 0.448], [-1.2, 0.46]];

function body(ctx: KitContext): void {
  const ob = fairing();
  const q = bodyQ(ctx, 1.7);
  const master = outlineLoft(ob, { su: q.su, sv: q.sv, creases: [2], capFront: true });
  const blackGloss = hard('#0b0c0e', 0.15, 0.2, 1);
  const A = ctx.hp.frontAxle;
  const open = sideRegion([[-1.19, 2], ...SIDE_EDGE, [-0.3, 0.1], [-0.3, 2]]);
  const arch = (_x: number, y: number, z: number) => 0.36 - Math.hypot(z - A[2], y - A[1]);
  const underScreen = fAnd(planRegion([[SCREEN_BASE + 0.08, -1], [-1.08, -1], [-1.08, 0.15], [-1.36, 0.165], [SCREEN_BASE + 0.08, 0.105]]), (_x, y) => y - 0.86);
  const lamps = faceLamps(ob, { outline: HEAD, at: [0.114, 0.758], inset: 0.005, square: 0, opts: { kind: 'head', inner: 'led', count: 3, depth: 0.04, rim: 0.0025 } });
  const intake = fAnd(frontRegion(smooth2(INTAKE, 2, false)), (_x, _y, z) => -1.6 - z);
  const wing = sideRegion(smooth2(WING_DUCT, 3, true));
  const outlet = sideRegion(smooth2(OUTLET, 3, true));
  const bodyCut = cut(master, fAnd(fNot(open), fNot(arch), fNot(underScreen), fNot(fOr(lamps.hole, intake)), fNot(wing), fNot(outlet)));
  // Panel split: nose cowl / side panel diagonal from the screen corner; belly pan below.
  const cowl = sideRegion([[-2, 2], [-1.36, 2], [-1.36, 0.94], [-1.39, 0.8], [-1.45, 0.69], [-1.53, 0.61], [-2, 0.59]]);
  const belly = sideRegion([[-1.14, 0.33], [-0.95, 0.31], [-0.7, 0.3], [-0.4, 0.3], [-0.4, -1], [-1.14, -1]]);
  addPanel(ctx, 'chassis', bodyCut, cowl, PAINT, 0.003, 0.014);
  addPanel(ctx, 'chassis', bodyCut, fAnd(fNot(cowl), fNot(belly)), PAINT, 0.003, 0.014);
  addPanel(ctx, 'chassis', bodyCut, fAnd(belly, fNot(cowl)), PAINT, 0.003, 0.014);
  // Winglet duct: dark inner wall, two carbon blades across the opening.
  ductWall(ctx, ob, WING_DUCT.map(([z, y]) => [z + (z < -1.4 ? -0.01 : 0.01), y + (y > 0.77 ? 0.01 : -0.01)] as P2), -1.4, 0.78, 0.055);
  bladeSlats(ctx, ob, [
    [[-1.51, 0.758], [-1.38, 0.797], [-1.28, 0.812], [-1.28, 0.803], [-1.38, 0.788], [-1.51, 0.751]],
  ], 0.008, 0.045, PAINT);
  // Hot-air outlet: dark wall and three slanted louvres.
  ductWall(ctx, ob, OUTLET.map(([z, y]) => [z + (z < -1.1 ? -0.01 : 0.01), y + (y > 0.53 ? 0.01 : -0.01)] as P2), -1.1, 0.53, 0.04);
  for (let i = 0; i < 3; i++) {
    const z0 = -1.17 + i * 0.055;
    bladeSlats(ctx, ob, [[[z0, 0.465], [z0 + 0.04, 0.575], [z0 + 0.05, 0.575], [z0 + 0.01, 0.465]]], 0.006, 0.025, F.satinBlack);
  }
  // Ram-air duct lining and the headlights.
  ductLiner(ctx, ob, mirrorLoop(INTAKE), -1.5, 0.82);
  if (ctx.micro) {
    // Mesh grille across the lower part of the duct.
    for (let i = 0; i < 5; i++) ctx.add('chassis', roundBox(0.003, 0.05, 0.004, 0.001), F.texturedBlack, T(-0.05 + i * 0.025, 0.662, -1.585));
  }
  lamps.add(ctx, 'chassis');
  // DRL light guides along the top edge of each headlight.
  for (const s of [-1, 1]) {
    const pts: P3[] = [];
    let nrm: P3 = [0, 0, -1];
    for (const [x, y] of [[0.07, 0.754], [0.097, 0.769], [0.128, 0.787], [0.152, 0.8]] as P2[]) {
      const h = frontHit(ob, s * x, y);
      if (h) {
        pts.push([h.p[0] + h.n[0] * 0.0015, h.p[1] + h.n[1] * 0.0015, h.p[2] + h.n[2] * 0.0015]);
        nrm = h.n;
      }
    }
    if (pts.length >= 3) ledStrip(ctx, 'chassis', pts, 0.0045, 0.003, 'drl', nrm);
  }
  innerCowl(ctx, { z0: SCREEN_BASE + 0.06, z1: -1.2, yTop0: 0.87, yTop1: 0.93, yBot0: 0.75, yBot1: 0.8, w0: 0.14, w1: 0.24 });
  // Screen: long, low double-bubble running back from just behind the beak.
  screen(ctx, 'chassis', {
    zs: stationsBetween(SCREEN_BASE, SCREEN_TOP_Z, 8, 0.35),
    top: curve([[SCREEN_BASE, 0.872], [-1.5, 0.93], [-1.4, 1.02], [-1.3, 1.1], [-1.23, 1.135], [SCREEN_TOP_Z, 1.14]]),
    bottom: curve([[SCREEN_BASE, 0.86], [-1.38, 0.915], [SCREEN_TOP_Z, 0.955]]),
    half: curve([[SCREEN_BASE, 0.14], [-1.44, 0.178], [-1.3, 0.165], [SCREEN_TOP_Z, 0.12]]),
    sections: [{ z: 0, pts: [[0, 1], [0.45, 0.985], [0.8, 0.93], [0.95, 0.8], [1, 0.55], [1, 0.25], [0.98, 0]] }],
  }, tint(F.screen, '#3a424c'));
  buildTank(ctx, {
    front: -1.19,
    back: -0.64,
    top: 1.055,
    bottomFront: 0.9,
    bottomBack: 0.8,
    width: 0.44,
    style: 'sport',
    knee: 0.17,
    capZ: -0.92,
    topLine: [[-1.19, 0.958], [-1.1, 0.99], [-0.99, 1.035], [-0.89, 1.056], [-0.79, 1.05], [-0.71, 1.005], [-0.66, 0.94], [-0.64, 0.89]],
    bottomLine: [[-1.19, 0.9], [-1.0, 0.865], [-0.8, 0.825], [-0.64, 0.8]],
    halfLine: [[-1.19, 0.12], [-1.09, 0.182], [-0.96, 0.218], [-0.84, 0.212], [-0.73, 0.18], [-0.64, 0.118]],
  });
  buildSeat(ctx, { front: -0.66, back: -0.3, yFront: 0.826, y: 0.83, yBack: 0.862, width: 0.275, thick: 0.07, frontWidth: 0.17 });
  buildSeat(ctx, { front: -0.285, back: -0.05, yFront: 0.915, y: 0.93, yBack: 0.952, width: 0.185, thick: 0.045, frontWidth: 0.145 }, tint(seatFinish(ctx), '#161616'));
  const tb = tail();
  const tm = outlineLoft(tb, { su: ctx.seg(12, 4), sv: ctx.seg(6, 2), capBack: true });
  const seatHole: Field = fAnd(
    fOr(sideRegion([[-0.85, 0.805], [-0.292, 0.805], [-0.292, 1.4], [-0.85, 1.4]]), sideRegion([[-0.282, 0.9], [-0.04, 0.9], [-0.04, 1.4], [-0.282, 1.4]])),
    planRegion([[-0.85, -0.01], [-0.03, -0.01], [-0.03, 0.095], [-0.28, 0.095], [-0.29, 0.142], [-0.85, 0.142]]),
  );
  // Air exit through the tail side, like the RC213V-S.
  const tailVent = sideRegion(smooth2([[-0.25, 0.79], [-0.08, 0.86], [0.02, 0.92], [-0.01, 0.875], [-0.17, 0.785]], 3, true));
  addPanel(ctx, 'chassis', tm, fAnd(fNot(seatHole), fNot(tailVent)), PAINT, 0.0025, 0.012);
  undertray(ctx, { z0: -0.46, z1: 0.06, top0: 0.73, top1: 0.985, bot0: 0.68, botMid: 0.74, bot1: 0.945, w0: 0.135, w1: 0.034 });
  tailLamp(ctx, smooth2([[-0.06, -0.006], [0.06, -0.006], [0.066, 0.004], [0.0, 0.008], [-0.066, 0.004]], 4, true), [0, 0.97, 0.058], -0.6);
  frontFender(ctx, { from: -0.64, to: 0.8, gap: 0.02, width: 0.155 });
  hugger(ctx, blackGloss);
  plateHanger(ctx, { fromZ: -0.04, fromY: 0.79 });
  fasteners(ctx, ob, [[-1.32, 0.88], [-1.06, 0.84], [-0.83, 0.56], [-1.0, 0.35], [-0.63, 0.3]]);
}

// ───────────────────────────── livery ─────────────────────────────

const HRC_RED = '#c8102e';
const HRC_BLUE = '#1d3c8f';
const PEARL = '#f1f2f4';

function lettering(p: Pen, main: string, accent: string): void {
  if (p.view !== 'right' && p.view !== 'left') return;
  p.text('Fireblade', -0.92, 0.42, { color: main, size: 0.05, italic: true, weight: '900', stretch: 1.05 });
  p.text('HRC', -1.06, 0.76, { color: accent, size: 0.045, italic: true, weight: '900', stretch: 1.2 });
  p.text('CBR1000RR-R', -0.12, 0.885, { color: accent, size: 0.022, italic: true, weight: '800' });
  p.text('SP', 0.0, 0.94, { color: main === PEARL ? HRC_RED : main, size: 0.02, italic: true, weight: '900' });
}

function livery(c: LiveryCanvas, _lv: Livery, env: LiveryEnv): void {
  const black = env.index === 1;
  c.views(ALL_VIEWS, (p) => {
    if (black) {
      // Matte Pearl Morion Black: satin black body, gloss black lower panels, red HRC accents.
      p.fill('#17181b', 'matte');
      if (p.view === 'right' || p.view === 'left') {
        p.poly([[-1.75, 0.66], [-1.4, 0.62], [-1.0, 0.62], [-0.7, 0.4], [-0.45, 0.3], [-0.45, -0.1], [-1.75, -0.1]], '#0d0e10', 'gloss');
        p.line([[-1.7, 0.72], [-1.35, 0.79], [-1.0, 0.82], [-0.8, 0.72]], HRC_RED, 0.006);
        p.line([[-0.62, 0.72], [-0.2, 0.83], [0.08, 0.96]], '#3c3e43', 0.014, 'gloss');
        lettering(p, '#4a4d53', HRC_RED);
      } else if (p.view === 'top') {
        p.rect(-1.0, -0.035, -0.66, 0.035, '#0d0e10', 'gloss');
      }
      return;
    }
    // Grand Prix Red (HRC Tricolour): pearl white base, red nose and lower fairing,
    // blue sweep from the headlights back along the upper cowl and tank flanks.
    p.fill(PEARL, 'pearl');
    if (p.view === 'right' || p.view === 'left') {
      // Red nose and red lower fairing / belly with a white separation and blue keyline.
      p.poly([[-1.8, 0.62], [-1.66, 0.7], [-1.58, 0.69], [-1.5, 0.62], [-1.3, 0.58], [-1.05, 0.6], [-0.88, 0.56], [-0.7, 0.42], [-0.45, 0.33], [-0.45, -0.1], [-1.8, -0.1]], HRC_RED);
      p.line([[-1.5, 0.6], [-1.3, 0.555], [-1.05, 0.575], [-0.88, 0.535], [-0.7, 0.4], [-0.45, 0.31]], HRC_BLUE, 0.012);
      // Blue sweep: from the headlight back along the upper cowl, under the screen edge, onto the tank flank.
      p.poly([[-1.64, 0.76], [-1.5, 0.82], [-1.36, 0.875], [-1.2, 0.92], [-1.0, 0.94], [-0.8, 0.92], [-0.7, 0.86], [-0.82, 0.85], [-1.02, 0.86], [-1.2, 0.84], [-1.38, 0.79], [-1.52, 0.74], [-1.6, 0.72]], HRC_BLUE);
      // Tail: blue and red stripes rising to the tip.
      p.poly([[-0.62, 0.74], [-0.3, 0.8], [0.0, 0.92], [0.12, 1.0], [0.12, 0.96], [0.0, 0.885], [-0.3, 0.77], [-0.62, 0.715]], HRC_BLUE);
      p.poly([[-0.62, 0.71], [-0.3, 0.765], [0.0, 0.875], [0.12, 0.95], [0.12, 0.9], [0.0, 0.85], [-0.3, 0.74], [-0.62, 0.69]], HRC_RED);
      lettering(p, PEARL, HRC_RED);
    } else if (p.view === 'top') {
      // Tank: twin blue bands either side of the centre line; red over the nose and front fender.
      p.rect(-1.08, -0.11, -0.66, -0.06, HRC_BLUE);
      p.rect(-1.08, 0.06, -0.66, 0.11, HRC_BLUE);
      p.rect(-1.9, -0.2, -1.66, 0.2, HRC_RED);
    } else if (p.view === 'front') {
      p.rect(-1, -1, 1, 0.695, HRC_RED);
      for (const s of [-1, 1]) p.poly([[s * 0.07, 0.8], [s * 0.17, 0.83], [s * 0.2, 0.86], [s * 0.08, 0.84]], HRC_BLUE);
    } else if (p.view === 'rear') {
      p.rect(-1, 0.86, 1, 0.9, HRC_BLUE);
      p.rect(-1, 0.82, 1, 0.86, HRC_RED);
    }
  });
}

export function firebladeBlueprint(spec: BikeSpec): BikeBlueprint {
  const wheel = spec.liveries[0]?.wheel ?? '#c9a227';
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.1, 0.745, 1.14],
    wheelbase: 1.455,
    rakeDeg: 24,
    trail: 0.102,
    forkLength: 0.725,
    front: { tyre: '120/70ZR17', rimWidthIn: 3.5, crown: 0.8, tread: 'slickish', tyreLabel: 'Supercorsa SP' },
    rear: { tyre: '200/55ZR17', rimWidthIn: 6.0, crown: 0.9, tread: 'slickish', tyreLabel: 'Supercorsa SP' },
    frontWheel: { type: 'cast', spokes: 5, shape: 'y', color: wheel, machinedLip: false },
    rearWheel: { type: 'cast', spokes: 5, shape: 'y', color: wheel },
    fork: { type: 'usd', stanchion: 0.043, spacing: 0.212, outerColor: '#c99a2c', innerColor: '#d6ae54', footColor: '#1c1d20', capColor: '#c99a2c', adjusterColor: '#d8b25a', label: 'ÖHLINS', labelColor: '#f2f2f2', aboveClamp: 0.01, clampGap: 0.2 },
    frontBrake: { discs: 2, discDia: 0.33, disc: 'floating', carrierColor: '#2b2d31', caliper: 'radialMono4', caliperColor: '#3a3c41', caliperText: 'brembo', caliperTextColor: '#d4202a', caliperAngleDeg: 76 },
    rearBrake: { discs: 1, discDia: 0.22, disc: 'fixed', carrierColor: '#2b2d31', caliper: 'axial2', caliperColor: '#3a3c41', caliperAngleDeg: 200 },
    frame: { type: 'twinSpar', color: '#3a3c40', metal: 0.85, rough: 0.38, subframe: 'cast', subframeColor: '#232428', width: 0.36 },
    swingarm: { type: 'box', length: 0.622, angleDeg: 10, color: '#2f3135', metal: 0.85, rough: 0.36 },
    shock: { layout: 'mono', springColor: '#e8c21a', bodyColor: '#c99a2c', reservoir: true },
    drive: { type: 'chain', side: 'left', frontTeeth: 16, rearTeeth: 40, pitch: 0.015875, sprocketColor: '#1e1f22' },
    engine: {
      layout: 'I4',
      cc: 999,
      crank: [0, 0.39, -0.83],
      tiltDeg: 32,
      caseColor: '#1f2023',
      coverColor: '#2c2e33',
      headColor: '#26282c',
      camCoverColor: '#17181b',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.45, h: 0.36, z: -1.27, y: 0.6, tiltDeg: 14, curved: true },
      width: 0.4,
    },
    // Akrapovič-style titanium can: short, oval, angled steeply upwards beside the rear wheel.
    exhaust: { route: 'sideCan', side: 'right', can: 'oval', canLength: 0.33, canDia: 0.112, canFinish: 'titanium', headerFinish: 'titanium', outlet: [0.175, 0.56, -0.07] },
    cockpit: {
      bars: 'clipon',
      grip: [0.335, 0.885, -0.975],
      barDia: 0.022,
      dash: 'tftWide',
      dashPos: [0, 1.012, -1.135],
      dashSize: [0.112, 0.066],
      dashTiltDeg: 50,
      dashMount: 'fairing',
      mirrors: 'fairing',
      mirrorPos: [0.33, 0.985, -1.27],
      mirrorSize: [0.135, 0.058],
      mirrorIndicators: true,
      mirrorShape: 'sport',
      mirrorColor: '#0d0e10',
      topClamp: 'milled',
      steeringDamper: 'top',
      leverColor: '#2a2b2e',
      reservoirs: true,
      clutch: 'cable',
      ignition: 'keyless',
      switchColor: '#151618',
      gripColor: '#121212',
      barEndColor: '#1d1e21',
    },
    lights: { head: 'sportTwin', tail: 'strip', rearIndicators: 'stalk' },
    seat: { height: 0.83, front: -0.66, back: -0.3, pillion: 'seat', color: '#151515' },
    rider: { hip: [0, 0.9, -0.46], peg: [0.19, 0.39, -0.43], torsoPitch: 0.8 },
    footrests: 'rearset',
    plate: { mount: 'hanger', pos: [0, 0.6, 0.37], tiltDeg: -14 },
    body,
    livery,
    groundClearance: 0.115,
    features: ['winglets'],
    zones: { splitY: 0.4, decal: [-0.92, 0.42] },
  };
}
