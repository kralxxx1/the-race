import * as THREE from 'three';
import type { BikeSpec, Livery } from '../../../data/bikes';
import { RX, S, T, mul, type KitContext } from '../context';
import { addPanel, bodyQ, buildSeat, buildTank, frontFender, PAINT, screen, seatFinish } from '../kit/body';
import { lamp, ledStrip } from '../kit/lights';
import { hugger, plateHanger } from '../kit/rear';
import { curve, outlineLoft, sideAt, stationsBetween, surfaceAt, type OutlineBody } from '../kit/shape';
import { ALL_VIEWS, lum, type LiveryCanvas, type LiveryEnv, type Pen } from '../livery';
import { extrude, lathe, roundBox, smooth2, type P2, type P3 } from '../mesh';
import { F, hard, tint } from '../sink';
import { cut, fAnd, fNot, frontRegion, fOr, planRegion, sideRegion, type Field } from '../surface';
import type { BikeBlueprint } from '../types';

/**
 * Yamaha YZF-R1 (2020+).
 * Spec sheet: wheelbase 1405 mm, rake 24°, trail 102 mm, seat 855 mm,
 * L×W×H 2055 × 690 × 1165 mm, ground clearance 130 mm, 120/70ZR17 + 190/55ZR17,
 * 43 mm KYB USD fork, Deltabox aluminium frame, crossplane I4 tilted ~30°.
 * Design cues: M-shaped centre intake with the LED projectors inside it, tiny LED
 * "eyes" at the upper nose corners, short underslung titanium silencer on the
 * right, slim stacked tail with the LED light under the tip.
 */

// Key side-view hardpoints of the bodywork (bike space, metres).
const NOSE = -1.632;
const SCREEN_BASE = -1.5;
const SCREEN_TOP_Z = -1.13;

/** Side-panel rear edge (side view): from the tank front down to the back of the belly pan. */
const SIDE_EDGE: P2[] = [
  [-1.16, 0.975],
  [-1.08, 0.94],
  [-1.0, 0.9],
  [-0.9, 0.83],
  [-0.8, 0.68],
  [-0.73, 0.5],
  [-0.67, 0.36],
  [-0.6, 0.27],
  [-0.52, 0.2],
  [-0.46, 0.16],
];

function r1Fairing(): OutlineBody {
  const zs = [NOSE, -1.626, -1.615, -1.6, -1.58, -1.55, -1.51, -1.46, -1.4, -1.33, -1.25, -1.16, -1.06, -0.96, -0.86, -0.76, -0.66, -0.56, -0.46];
  // Section templates, top centre → bottom edge (x / half-width, height fraction).
  // Trapezoid sections: narrow creased shoulders under the screen, widest low down around the radiator.
  // The face template closes under the chin (intakes are cut into it explicitly).
  const face: P2[] = [[0, 1], [0.3, 0.96], [0.62, 0.86], [0.85, 0.68], [0.97, 0.46], [0.9, 0.21], [0.56, 0.045], [0, 0]];
  const cowl: P2[] = [[0, 1], [0.35, 0.985], [0.64, 0.935], [0.82, 0.8], [0.95, 0.6], [1, 0.38], [0.95, 0.12], [0.75, 0]];
  const side: P2[] = [[0, 1], [0.38, 0.99], [0.68, 0.95], [0.86, 0.82], [0.97, 0.6], [1, 0.36], [0.93, 0.1], [0.6, 0]];
  const back: P2[] = [[0, 1], [0.42, 0.99], [0.72, 0.95], [0.9, 0.82], [0.98, 0.6], [1, 0.36], [0.92, 0.1], [0.5, 0]];
  return {
    zs,
    top: curve([
      [NOSE, 0.79],
      [-1.6, 0.835],
      [-1.55, 0.862],
      [-1.46, 0.896],
      [-1.36, 0.925],
      [-1.25, 0.95],
      [-1.15, 0.965],
      [-1.02, 0.955],
      [-0.86, 0.91],
      [-0.66, 0.83],
      [-0.46, 0.74],
    ]),
    bottom: curve([
      [NOSE, 0.775],
      [-1.625, 0.71],
      [-1.61, 0.665],
      [-1.585, 0.635],
      [-1.54, 0.615],
      [-1.44, 0.6],
      [-1.33, 0.5],
      [-1.2, 0.33],
      [-1.07, 0.2],
      [-0.94, 0.15],
      [-0.76, 0.14],
      [-0.6, 0.15],
      [-0.46, 0.18],
    ]),
    half: curve([
      [NOSE, 0.008],
      [-1.626, 0.06],
      [-1.61, 0.1],
      [-1.58, 0.14],
      [-1.52, 0.188],
      [-1.44, 0.228],
      [-1.34, 0.27],
      [-1.22, 0.295],
      [-1.06, 0.3],
      [-0.9, 0.29],
      [-0.72, 0.255],
      [-0.46, 0.2],
    ]),
    sections: [
      { z: NOSE, pts: face },
      { z: -1.56, pts: face },
      { z: -1.36, pts: cowl },
      { z: -1.0, pts: side },
      { z: -0.46, pts: back },
    ],
  };
}

function r1Tail(): OutlineBody {
  return {
    zs: stationsBetween(-0.68, 0.135, 14, 0.5),
    top: curve([[-0.68, 0.84], [-0.5, 0.848], [-0.3, 0.872], [-0.22, 0.925], [-0.06, 0.968], [0.06, 1.0], [0.135, 1.032]]),
    bottom: curve([[-0.68, 0.7], [-0.4, 0.72], [-0.15, 0.77], [0.02, 0.86], [0.1, 0.95], [0.135, 0.995]]),
    half: curve([[-0.68, 0.16], [-0.45, 0.148], [-0.22, 0.125], [0.0, 0.088], [0.1, 0.05], [0.135, 0.022]]),
    sections: [
      { z: -0.68, pts: [[0, 1], [0.6, 0.98], [0.95, 0.84], [1, 0.55], [0.93, 0.22], [0.6, 0.02], [0, 0]] },
      { z: 0.135, pts: [[0, 1], [0.72, 0.97], [1, 0.74], [0.98, 0.46], [0.84, 0.2], [0.42, 0.02], [0, 0]] },
    ],
  };
}

function r1Body(ctx: KitContext): void {
  const ob = r1Fairing();
  const q = bodyQ(ctx, 1.7);
  const master = outlineLoft(ob, { su: q.su, sv: q.sv, creases: [2], capFront: true });
  const blackGloss = hard('#0b0c0e', 0.15, 0.2, 1);
  const A = ctx.hp.frontAxle;
  // Openings: cockpit/tank area and everything behind the side-panel edge; the front-wheel arch.
  const open = sideRegion([[-1.16, 2], ...SIDE_EDGE, [-0.3, 0.1], [-0.3, 2]]);
  const arch = (_x: number, y: number, z: number) => 0.362 - Math.hypot(z - A[2], y - A[1]);
  // Cockpit opening under the screen: look through the screen at the inner panel and dash.
  const underScreen = fAnd(planRegion([[SCREEN_BASE + 0.07, -1], [-1.0, -1], [-1.0, 0.15], [-1.3, 0.165], [SCREEN_BASE + 0.07, 0.11]]), (_x, y) => y - 0.86);
  // M-shaped centre intake drawn in front view (x ≥ 0 half): two humps meeting at the beak.
  const intakeFront: P2[] = [[0, 0.7], [0.022, 0.713], [0.05, 0.736], [0.078, 0.743], [0.1, 0.727], [0.112, 0.692], [0.106, 0.66], [0.088, 0.642], [0, 0.638]];
  const intake = fAnd(frontRegion(intakeFront), (_x, _y, z) => -1.55 - z);
  const body = cut(master, fAnd(fNot(open), fNot(arch), fNot(underScreen), fNot(intake)));
  // Panel lines: nose cowl / side panel (diagonal from the screen corner to the vent), belly pan.
  const cowl = sideRegion([[-2, 2], [-1.29, 2], [-1.29, 0.93], [-1.33, 0.78], [-1.39, 0.66], [-1.47, 0.6], [-2, 0.58]]);
  // Slim dart-shaped air exit under the shoulder crease.
  const ventPoly: P2[] = [[-1.26, 0.862], [-1.12, 0.858], [-0.99, 0.826], [-0.955, 0.8], [-1.04, 0.78], [-1.2, 0.79]];
  const vent = sideRegion(smooth2(ventPoly, 4, true));
  const belly = sideRegion([[-1.12, 0.32], [-0.94, 0.3], [-0.72, 0.29], [-0.4, 0.29], [-0.4, -1], [-1.12, -1]]);
  addPanel(ctx, 'chassis', body, cowl, PAINT, 0.003, 0.014);
  addPanel(ctx, 'chassis', body, fAnd(fNot(cowl), fNot(belly), fNot(vent)), PAINT, 0.003, 0.014);
  addPanel(ctx, 'chassis', body, fAnd(belly, fNot(cowl)), PAINT, 0.003, 0.014);
  // Vent: dark inner duct with three louvres, set back from the skin.
  for (const s of [-1, 1]) {
    const p = sideAt(ob, -1.1, 0.74, s);
    const back = smooth2(ventPoly.map(([z, y]) => [z + (z < -1.1 ? -0.01 : 0.01), y + (y > 0.75 ? 0.01 : -0.01)] as P2), 3, true);
    ctx.add('chassis', extrude(back, 0.006, { plane: 'zy', center: p.p[0] - s * 0.04 }), F.texturedBlack);
    const fin: P2[] = [[-1.22, 0.83], [-1.0, 0.808], [-1.0, 0.8], [-1.22, 0.822]];
    ctx.add('chassis', extrude(fin, 0.03, { plane: 'zy', center: p.p[0] - s * 0.024 }), blackGloss);
  }
  // Inner panels (unpainted black) seen through the screen and around the cockpit.
  const inner = outlineLoft(
    {
      zs: stationsBetween(SCREEN_BASE + 0.05, -1.14, 6, 0.3),
      top: curve([[SCREEN_BASE + 0.05, 0.87], [-1.3, 0.9], [-1.14, 0.93]]),
      bottom: curve([[SCREEN_BASE + 0.05, 0.75], [-1.14, 0.8]]),
      half: curve([[SCREEN_BASE + 0.05, 0.15], [-1.3, 0.2], [-1.14, 0.24]]),
      sections: [{ z: 0, pts: [[0, 1], [0.5, 0.98], [0.86, 0.88], [0.98, 0.65], [1, 0.4], [0.97, 0.15], [0.9, 0]] }],
    },
    { su: ctx.seg(6, 2), sv: ctx.seg(4, 2) },
  );
  ctx.add('chassis', inner, F.texturedBlack);
  // Intake duct (black) behind the M opening, with the bi-LED projector inside.
  const duct = outlineLoft(
    {
      zs: stationsBetween(-1.592, -1.44, 5, 0.2),
      top: curve([[-1.592, 0.748], [-1.44, 0.735]]),
      bottom: curve([[-1.592, 0.636], [-1.44, 0.628]]),
      half: curve([[-1.592, 0.115], [-1.44, 0.1]]),
      sections: [{ z: 0, pts: [[0, 1], [0.6, 0.98], [0.95, 0.8], [1, 0.5], [0.95, 0.15], [0.55, 0.0], [0, 0]] }],
    },
    { su: ctx.seg(4, 2), sv: ctx.seg(4, 2) },
  ).flip();
  ctx.add('chassis', duct, F.texturedBlack);
  // Central bi-LED projector (single lens on the 2020 bike, flanked by the duct walls).
  {
    const pr = 0.03;
    const at: P3 = [0, 0.682, -1.565];
    const seg = ctx.seg(28, 12);
    ctx.add('chassis', lathe([[0, -0.04], [pr * 1.1, -0.03], [pr * 1.35, 0.0]], { segs: seg, axis: 'z' }).transform(S(1, 1, -1)), F.chrome, T(...at));
    ctx.add('chassis', lathe(([[0, 0.014], [pr * 0.65, 0.011], [pr, 0.0]] as P2[]).reverse(), { segs: seg, axis: 'z' }).transform(S(1, 1, -1)), F.head, T(...at));
    ctx.add('chassis', lathe([[pr * 1.02, -0.004], [pr * 1.25, -0.004], [pr * 1.25, 0.006], [pr * 1.02, 0.006]], { segs: seg, axis: 'z', sharp: true }), F.texturedBlack, T(at[0], at[1], at[2] - 0.006));
  }
  // Mesh grille across the lower duct
  ctx.add('chassis', roundBox(0.17, 0.006, 0.04, 0.002), F.texturedBlack, T(0, 0.645, -1.595));
  // LED position "eyes": slim slits at the upper corners of the face, under the screen edge.
  for (const s of [-1, 1]) {
    const pts: P3[] = [];
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      const z = -1.6 + t * 0.07;
      const sp = surfaceAt(ob, z, s * ob.half(z) * (0.55 + t * 0.2));
      pts.push([sp.p[0] + sp.n[0] * 0.002, sp.p[1] - 0.004 - t * 0.01, z]);
    }
    ledStrip(ctx, 'chassis', pts, 0.009, 0.004, 'drl', [0, 1, 0]);
  }
  // Screen: smoked double-bubble, rising steeply from the nose.
  screen(ctx, 'chassis', {
    zs: stationsBetween(SCREEN_BASE, SCREEN_TOP_Z, 8, 0.35),
    top: curve([[SCREEN_BASE, 0.895], [-1.42, 0.95], [-1.32, 1.04], [-1.22, 1.12], [-1.16, 1.155], [SCREEN_TOP_Z, 1.162]]),
    bottom: curve([[SCREEN_BASE, 0.882], [-1.3, 0.93], [SCREEN_TOP_Z, 0.97]]),
    half: curve([[SCREEN_BASE, 0.15], [-1.36, 0.19], [-1.22, 0.175], [SCREEN_TOP_Z, 0.13]]),
    sections: [{ z: 0, pts: [[0, 1], [0.45, 0.985], [0.8, 0.93], [0.95, 0.8], [1, 0.55], [1, 0.25], [0.98, 0]] }],
  }, tint(F.screen, '#3a4450'));
  // Tank (with the airbox cover forming its front) — the R1 tank is tall and wide at the knees.
  buildTank(ctx, {
    front: -1.14,
    back: -0.6,
    top: 1.07,
    bottomFront: 0.9,
    bottomBack: 0.8,
    width: 0.45,
    style: 'sport',
    knee: 0.16,
    capZ: -0.9,
    topLine: [[-1.14, 0.958], [-1.06, 0.99], [-0.96, 1.04], [-0.86, 1.066], [-0.77, 1.056], [-0.69, 1.005], [-0.63, 0.94], [-0.6, 0.9]],
    bottomLine: [[-1.14, 0.9], [-0.98, 0.865], [-0.78, 0.825], [-0.6, 0.8]],
    halfLine: [[-1.14, 0.12], [-1.04, 0.185], [-0.92, 0.222], [-0.8, 0.218], [-0.7, 0.185], [-0.6, 0.12]],
  });
  // Seats: rider + pillion
  buildSeat(ctx, { front: -0.64, back: -0.27, yFront: 0.85, y: 0.855, yBack: 0.88, width: 0.28, thick: 0.07, frontWidth: 0.18 });
  buildSeat(ctx, { front: -0.25, back: 0.0, yFront: 0.94, y: 0.952, yBack: 0.968, width: 0.2, thick: 0.05, frontWidth: 0.15 }, tint(seatFinish(ctx), '#141414'));
  // Tail with seat recesses, the through-duct and the undertray.
  const tail = r1Tail();
  const tm = outlineLoft(tail, { su: ctx.seg(12, 4), sv: ctx.seg(6, 2), capBack: true });
  const seatHole: Field = fAnd(
    fOr(sideRegion([[-0.8, 0.83], [-0.262, 0.83], [-0.262, 1.4], [-0.8, 1.4]]), sideRegion([[-0.252, 0.93], [0.01, 0.93], [0.01, 1.4], [-0.252, 1.4]])),
    planRegion([[-0.8, -0.01], [0.02, -0.01], [0.02, 0.1], [-0.25, 0.1], [-0.26, 0.142], [-0.8, 0.142]]),
  );
  const tailVent = sideRegion(smooth2([[-0.24, 0.8], [-0.06, 0.875], [0.03, 0.9], [0.0, 0.86], [-0.16, 0.79]], 3, true));
  addPanel(ctx, 'chassis', tm, fAnd(fNot(seatHole), fNot(tailVent)), PAINT, 0.0025, 0.012);
  // Undertray (black) with the LED tail light under the tip.
  const ut: OutlineBody = {
    zs: stationsBetween(-0.45, 0.11, 7, 0.4),
    top: curve([[-0.45, 0.74], [0.11, 0.96]]),
    bottom: curve([[-0.45, 0.69], [-0.1, 0.745], [0.11, 0.92]]),
    half: curve([[-0.45, 0.14], [0.11, 0.035]]),
    sections: [{ z: 0, pts: [[0, 1], [0.6, 0.95], [0.95, 0.7], [1, 0.45], [0.9, 0.2], [0.5, 0.02], [0, 0]] }],
  };
  ctx.add('chassis', outlineLoft(ut, { su: ctx.seg(5, 2), sv: ctx.seg(3, 2) }), F.texturedBlack);
  const tl: P2[] = smooth2([[-0.07, -0.006], [0.07, -0.006], [0.078, 0.004], [0.0, 0.009], [-0.078, 0.004]], 4, true);
  lamp(ctx, 'chassis', tl, mul(T(0, 0.945, 0.1), RX(-0.62)), { kind: 'tail', inner: 'led', count: 1, depth: 0.03, rim: 0.003, lensSmoked: true });
  // Front mudguard (short, painted)
  frontFender(ctx, { from: -0.62, to: 0.82, gap: 0.02, width: 0.155 });
  hugger(ctx, blackGloss);
  plateHanger(ctx, { fromZ: -0.02, fromY: 0.79 });
  // Fairing fasteners on the side panels
  if (ctx.micro) {
    for (const s of [-1, 1]) {
      for (const [z, y] of [[-1.24, 0.86], [-1.0, 0.8], [-0.8, 0.55], [-0.98, 0.33], [-0.62, 0.3]] as const) {
        const sp = sideAt(ob, z, y, s);
        const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), new THREE.Vector3(...sp.n).negate(), new THREE.Vector3(0, 1, 0));
        m.setPosition(sp.p[0] + sp.n[0] * 0.001, sp.p[1], sp.p[2]);
        ctx.add('chassis', lathe([[0, 0], [0.0055, 0], [0.005, 0.0025], [0, 0.003]], { segs: 10, axis: 'z' }), F.texturedBlack, m);
      }
    }
  }
}

/** Yamaha logo-free tuning-fork style roundel (abstract) and lettering helpers. */
function r1Lettering(p: Pen, color: string, dark: boolean): void {
  if (p.view === 'right' || p.view === 'left') {
    // Big "R1" on the side fairing below the shoulder, italic, outlined.
    p.text('R1', -0.9, 0.46, { color, size: 0.12, italic: true, weight: '900', stretch: 1.05, stroke: dark ? undefined : '#0b0c0e', strokeWidth: 0.004 });
    p.text('YAMAHA', -1.28, 0.8, { color, size: 0.03, italic: false, weight: '900', spacing: 0.08 });
    p.text('YZF-R1', -0.02, 0.9, { color, size: 0.024, italic: true, weight: '800' });
  }
}

function r1Livery(c: LiveryCanvas, lv: Livery, env: LiveryEnv): void {
  const techBlack = env.index === 1;
  const anniversary = env.index === 2;
  const base = lv.primary;
  const black = '#0c0d10';
  c.views(ALL_VIEWS, (p) => {
    if (techBlack) {
      p.fill('#17181b', 'metallic');
      if (p.view === 'right' || p.view === 'left') {
        // Matte dark-grey flank panels with the blue-grey R1 graphics.
        p.poly([[-1.2, 0.86], [-0.86, 0.79], [-0.62, 0.62], [-0.62, 0.3], [-1.12, 0.3]], '#2a2c31', 'matte');
        p.poly([[-0.3, 0.85], [0.18, 1.0], [0.18, 0.93], [-0.3, 0.79]], '#2a2c31', 'matte');
        r1Lettering(p, '#7c8a99', true);
        p.line([[-1.6, 0.74], [-1.2, 0.86], [-0.86, 0.79]], '#3a7bd5', 0.006);
      }
      if (p.view === 'top') p.rect(-1.06, -0.22, -0.6, 0.22, '#1d1e22', 'satin');
      return;
    }
    if (anniversary) {
      p.fill('#f3f4f6', 'pearl');
      if (p.view === 'right' || p.view === 'left') {
        // Speedblock: red blocks with yellow pinstripes.
        p.poly([[-1.65, 0.7], [-1.2, 0.86], [-1.0, 0.74], [-1.38, 0.55], [-1.65, 0.6]], '#c8102e');
        p.poly([[-0.95, 0.7], [-0.62, 0.62], [-0.58, 0.3], [-0.85, 0.3]], '#c8102e');
        p.line([[-1.62, 0.63], [-1.32, 0.52], [-0.88, 0.36]], '#f2c400', 0.012);
        r1Lettering(p, '#c8102e', false);
      }
      return;
    }
    // Icon Blue: deep metallic blue, black lower flanks and belly, white R1 graphics.
    p.fill(base, 'metallic');
    if (p.view === 'right' || p.view === 'left') {
      p.poly([[-1.15, 0.34], [-0.9, 0.42], [-0.6, 0.5], [-0.38, 0.6], [-0.38, -0.1], [-1.2, -0.1]], black, 'gloss');
      p.poly([[-1.46, 0.56], [-1.3, 0.44], [-1.15, 0.34], [-1.2, -0.1], [-1.6, -0.1]], black, 'gloss');
      // Silver accent along the shoulder crease
      p.line([[-1.58, 0.76], [-1.25, 0.92], [-1.0, 0.92], [-0.75, 0.8]], '#c9ccd2', 0.004, 'metallic');
      r1Lettering(p, '#f4f6f8', false);
      // Tail: black lower edge
      p.poly([[-0.6, 0.66], [0.2, 0.92], [0.2, 0.6], [-0.6, 0.6]], black, 'gloss');
    } else if (p.view === 'top') {
      // Tank top: blue with a black centre panel behind the cap
      p.rect(-0.82, -0.06, -0.6, 0.06, black, 'gloss');
    } else if (p.view === 'front') {
      p.rect(-1, -1, 1, 0.6, black, 'gloss');
      p.text('R1', 0, 0.86, { color: '#f4f6f8', size: 0.02, weight: '900' });
    }
    if (lum(base) < 0.2 && p.view === 'rear') p.text('R1', 0, 0.98, { color: '#f4f6f8', size: 0.025, weight: '900', italic: true });
  });
}

export function r1Blueprint(spec: BikeSpec): BikeBlueprint {
  const lv = spec.liveries[0];
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.055, 0.69, 1.165],
    wheelbase: 1.405,
    rakeDeg: 24,
    trail: 0.102,
    forkLength: 0.735,
    front: { tyre: '120/70ZR17', rimWidthIn: 3.5, crown: 0.82, tread: 'sport', tyreLabel: 'Sport Radial RS' },
    rear: { tyre: '190/55ZR17', rimWidthIn: 6.0, crown: 0.92, tread: 'sport', tyreLabel: 'Sport Radial RS' },
    frontWheel: { type: 'cast', spokes: 5, shape: 'y', color: lv.wheel, machinedLip: false },
    rearWheel: { type: 'cast', spokes: 5, shape: 'y', color: lv.wheel },
    fork: { type: 'usd', stanchion: 0.043, spacing: 0.21, outerColor: '#b9902f', innerColor: '#c9a65a', footColor: '#1e1f22', capColor: '#2a2c30', adjusterColor: '#c99a2c', aboveClamp: 0.008, clampGap: 0.205 },
    frontBrake: { discs: 2, discDia: 0.32, disc: 'floating', carrierColor: '#2b2d31', caliper: 'radialMono4', caliperColor: '#2b2d31', caliperAngleDeg: 76 },
    rearBrake: { discs: 1, discDia: 0.22, disc: 'fixed', carrierColor: '#2b2d31', caliper: 'axial1', caliperColor: '#2b2d31', caliperAngleDeg: 200 },
    frame: { type: 'twinSpar', color: '#2c2e33', metal: 0.8, rough: 0.4, subframe: 'cast', subframeColor: '#232428', width: 0.37 },
    swingarm: { type: 'braced', length: 0.575, angleDeg: 9.5, color: '#2c2e33', metal: 0.8, rough: 0.4 },
    shock: { layout: 'mono', springColor: '#2b4fa8', bodyColor: '#2a2c30', reservoir: true },
    drive: { type: 'chain', side: 'left', frontTeeth: 16, rearTeeth: 41, pitch: 0.015875, sprocketColor: '#1e1f22' },
    engine: {
      layout: 'I4CP',
      cc: 998,
      crank: [0, 0.4, -0.78],
      tiltDeg: 30,
      caseColor: '#232428',
      coverColor: '#3a3d42',
      headColor: '#2a2c30',
      camCoverColor: '#1a1b1e',
      camCoverText: 'YAMAHA',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.44, h: 0.34, z: -1.22, y: 0.62, tiltDeg: 14, curved: true },
      filterColor: '#1d3b8a',
      width: 0.42,
    },
    exhaust: { route: 'underslung', side: 'right', can: 'stubby', canLength: 0.22, canDia: 0.115, canFinish: 'titanium', headerFinish: 'titanium' },
    cockpit: {
      bars: 'clipon',
      grip: [0.335, 0.905, -0.93],
      barDia: 0.022,
      dash: 'tftR1',
      dashPos: [0, 1.035, -1.075],
      dashSize: [0.105, 0.064],
      dashTiltDeg: 48,
      dashMount: 'fairing',
      mirrors: 'fairing',
      mirrorPos: [0.335, 1.02, -1.19],
      mirrorSize: [0.14, 0.062],
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
    seat: { height: 0.855, front: -0.64, back: -0.26, pillion: 'seat', color: '#151515' },
    rider: { hip: [0, 0.94, -0.44], peg: [0.185, 0.395, -0.4], torsoPitch: 0.72 },
    footrests: 'rearset',
    plate: { mount: 'hanger', pos: [0, 0.6, 0.39], tiltDeg: -14 },
    body: r1Body,
    livery: r1Livery,
    groundClearance: 0.13,
    features: [],
    zones: { splitY: 0.4, decal: [-1.0, 0.56] },
  };
}
