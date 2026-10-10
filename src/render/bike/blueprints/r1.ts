import * as THREE from 'three';
import type { BikeSpec, Livery } from '../../../data/bikes';
import { RX, T, mul, type KitContext } from '../context';
import { addPanel, bodyQ, buildSeat, buildTank, frontFender, PAINT, screen, seatFinish, shell } from '../kit/body';
import { lamp, ledStrip } from '../kit/lights';
import { hugger, plateHanger } from '../kit/rear';
import { curve, outlineLoft, stationsBetween, surfaceAt, type OutlineBody } from '../kit/shape';
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
const NOSE = -1.625;
const SCREEN_BASE = -1.255;
const SIDE_END = -0.43;

function r1Fairing(): OutlineBody {
  return {
    zs: stationsBetween(NOSE, SIDE_END, 14, 0.6),
    top: curve([
      [NOSE, 0.775],
      [NOSE + 0.05, 0.815],
      [NOSE + 0.16, 0.885],
      [SCREEN_BASE, 0.952],
      [-1.13, 0.975],
      [-0.95, 0.94],
      [-0.72, 0.84],
      [SIDE_END, 0.66],
    ]),
    bottom: curve([
      [NOSE, 0.745],
      [NOSE + 0.06, 0.69],
      [NOSE + 0.15, 0.62],
      [-1.36, 0.565],
      [-1.2, 0.47],
      [-1.06, 0.33],
      [-0.9, 0.22],
      [-0.7, 0.19],
      [-0.55, 0.2],
      [SIDE_END, 0.26],
    ]),
    half: curve([
      [NOSE, 0.035],
      [NOSE + 0.05, 0.11],
      [NOSE + 0.14, 0.19],
      [-1.38, 0.245],
      [-1.22, 0.3],
      [-1.06, 0.33],
      [-0.86, 0.335],
      [-0.68, 0.3],
      [SIDE_END, 0.2],
    ]),
    sections: [
      // Beak: pointed top, near-vertical intake face below.
      { z: NOSE, pts: [[0, 1], [0.3, 0.9], [0.62, 0.7], [0.85, 0.5], [0.97, 0.3], [1, 0.12], [0.94, 0]] },
      { z: -1.38, pts: [[0, 1], [0.36, 0.95], [0.72, 0.8], [0.93, 0.6], [1, 0.38], [0.97, 0.14], [0.88, 0]] },
      // Mid fairing: crisp shoulder line, flat flank, tucked lower edge.
      { z: -1.0, pts: [[0, 1], [0.55, 0.985], [0.88, 0.9], [0.99, 0.7], [1, 0.4], [0.96, 0.14], [0.84, 0]] },
      { z: SIDE_END, pts: [[0, 1], [0.6, 0.98], [0.9, 0.86], [1, 0.62], [0.99, 0.35], [0.9, 0.1], [0.7, 0]] },
    ],
  };
}

function r1Tail(): OutlineBody {
  return {
    zs: stationsBetween(-0.66, 0.18, 12, 0.55),
    top: curve([[-0.66, 0.85], [-0.4, 0.865], [-0.18, 0.905], [0.0, 0.975], [0.12, 1.012], [0.18, 1.02]]),
    bottom: curve([[-0.66, 0.66], [-0.4, 0.68], [-0.15, 0.74], [0.05, 0.84], [0.15, 0.915], [0.18, 0.95]]),
    half: curve([[-0.66, 0.155], [-0.45, 0.15], [-0.2, 0.125], [0.0, 0.088], [0.12, 0.05], [0.18, 0.026]]),
    sections: [
      { z: -0.66, pts: [[0, 1], [0.6, 0.97], [0.93, 0.8], [1, 0.5], [0.92, 0.2], [0.55, 0.02], [0, 0]] },
      { z: 0.18, pts: [[0, 1], [0.7, 0.97], [1, 0.72], [0.98, 0.45], [0.85, 0.2], [0.45, 0.02], [0, 0]] },
    ],
  };
}

function r1Body(ctx: KitContext): void {
  const ob = r1Fairing();
  const q = bodyQ(ctx, 1.6);
  const master = outlineLoft(ob, { su: q.su, sv: q.sv, creases: [2] });
  const blackGloss = hard('#0b0c0e', 0.15, 0.2, 1);
  // Cockpit / tank opening above the shoulder line behind the screen base.
  const open = sideRegion([
    [SCREEN_BASE + 0.02, 1.6],
    [SCREEN_BASE + 0.02, 0.945],
    [-1.12, 0.92],
    [-0.98, 0.86],
    [-0.78, 0.76],
    [-0.58, 0.64],
    [SIDE_END - 0.1, 0.5],
    [SIDE_END + 0.3, 1.6],
  ]);
  // M-shaped centre intake (front view) — only on the nose.
  const intakeFront: P2[] = [[0, 0.668], [0.035, 0.706], [0.075, 0.74], [0.112, 0.742], [0.142, 0.706], [0.148, 0.655], [0.12, 0.618], [0, 0.612]];
  const intake = fAnd(frontRegion(intakeFront), (_x, _y, z) => -1.36 - z);
  const body = cut(master, fAnd(fNot(open), fNot(intake)));
  // Panels: nose cowl, side panels (with the big outlet behind the front wheel), lower belly.
  const cowl = sideRegion([[-2, 2], [-1.19, 2], [-1.19, 0.93], [-1.29, 0.75], [-1.38, 0.64], [-1.46, 0.55], [-2, 0.5]]);
  const belly = sideRegion([[-1.3, 0.36], [-1.0, 0.33], [-0.72, 0.335], [SIDE_END + 0.2, 0.36], [SIDE_END + 0.2, -1], [-1.3, -1]]);
  const outlet = sideRegion(smooth2([[-1.13, 0.66], [-0.97, 0.64], [-0.86, 0.56], [-0.9, 0.44], [-1.03, 0.46], [-1.12, 0.55]], 4, true));
  const finCut = sideRegion([[-0.8, 0.72], [-0.6, 0.62], [-0.56, 0.52], [-0.74, 0.6]]);
  const side = fAnd(fNot(cowl), fNot(belly), fNot(outlet), fNot(finCut));
  addPanel(ctx, 'chassis', body, cowl, PAINT, 0.0035, 0.014);
  addPanel(ctx, 'chassis', body, side, PAINT, 0.0035, 0.014);
  addPanel(ctx, 'chassis', body, fAnd(belly, fNot(cowl)), PAINT, 0.0035, 0.014);
  // Dark inner ducts behind the side outlet (stacked louvres)
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const z = -1.07 + i * 0.055;
      const p = surfaceAt(ob, z, s * 0.3);
      const louvre = smooth2([[z - 0.03, 0.62 - i * 0.03], [z + 0.06, 0.6 - i * 0.03], [z + 0.08, 0.47 - i * 0.01], [z - 0.01, 0.49 - i * 0.01]], 2, true);
      ctx.add('chassis', extrude(louvre, 0.006, { plane: 'zy', center: p.p[0] - s * (0.028 + i * 0.006) }), F.texturedBlack);
    }
  }
  // Inner fairing panels (unpainted black) around the dash and headstock.
  const inner = outlineLoft(
    {
      zs: stationsBetween(-1.3, -1.0, 6, 0.3),
      top: curve([[-1.3, 0.94], [-1.12, 0.95], [-1.0, 0.92]]),
      bottom: curve([[-1.3, 0.72], [-1.12, 0.7], [-1.0, 0.68]]),
      half: curve([[-1.3, 0.22], [-1.12, 0.3], [-1.0, 0.31]]),
      sections: [{ z: 0, pts: [[0, 1], [0.5, 0.98], [0.86, 0.88], [0.98, 0.65], [1, 0.4], [0.97, 0.15], [0.9, 0]] }],
    },
    { su: ctx.seg(5, 2), sv: ctx.seg(4, 2) },
  );
  ctx.add('chassis', cut(inner, fNot(planRegion([[-2, -1], [0, -1], [0, 0.16], [-2, 0.16]]))), F.texturedBlack);
  // Intake duct (black) behind the M opening, with the two LED projectors inside.
  const duct = outlineLoft(
    {
      zs: stationsBetween(-1.62, -1.38, 5, 0.2),
      top: curve([[-1.62, 0.745], [-1.38, 0.74]]),
      bottom: curve([[-1.62, 0.61], [-1.38, 0.62]]),
      half: curve([[-1.62, 0.15], [-1.38, 0.12]]),
      sections: [{ z: 0, pts: [[0, 1], [0.6, 0.98], [0.95, 0.8], [1, 0.5], [0.95, 0.15], [0.55, 0.0], [0, 0]] }],
    },
    { su: ctx.seg(4, 2), sv: ctx.seg(4, 2) },
  ).flip();
  ctx.add('chassis', duct, F.texturedBlack);
  for (const s of [-1, 1]) {
    const pr = 0.026;
    const at: P3 = [s * 0.06, 0.676, -1.555];
    ctx.add('chassis', lathe([[0, -0.03], [pr * 1.15, -0.02], [pr * 1.3, 0.0]], { segs: ctx.seg(24, 10), axis: 'z' }).transform(new THREE.Matrix4().makeScale(1, 1, -1)), F.chrome, T(...at));
    ctx.add('chassis', lathe(([[0, 0.012], [pr * 0.65, 0.009], [pr, 0.0]] as P2[]).reverse(), { segs: ctx.seg(24, 10), axis: 'z' }).transform(new THREE.Matrix4().makeScale(1, 1, -1)), F.head, T(...at));
    ctx.add('chassis', lathe([[pr * 1.05, -0.004], [pr * 1.2, -0.004], [pr * 1.2, 0.004], [pr * 1.05, 0.004]], { segs: ctx.seg(24, 10), axis: 'z', sharp: true }), F.texturedBlack, T(at[0], at[1], at[2] - 0.004));
  }
  // Mesh grille across the bottom of the intake
  ctx.add('chassis', roundBox(0.25, 0.006, 0.05, 0.002), F.texturedBlack, T(0, 0.628, -1.585));
  // LED position "eyes" at the upper nose corners.
  for (const s of [-1, 1]) {
    const pts: P3[] = [];
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const z = -1.6 + t * 0.075;
      const sp = surfaceAt(ob, z, s * (0.07 + t * 0.055));
      pts.push([sp.p[0] + sp.n[0] * 0.003, sp.p[1] + sp.n[1] * 0.003 - 0.004, sp.p[2] + sp.n[2] * 0.003]);
    }
    ledStrip(ctx, 'chassis', pts, 0.008, 0.004, 'drl', [0, 1, 0]);
  }
  // Screen: tall, smoked, with the double-bubble top edge.
  screen(ctx, 'chassis', {
    zs: stationsBetween(SCREEN_BASE - 0.005, -1.025, 7, 0.35),
    top: curve([[SCREEN_BASE - 0.005, 0.96], [-1.2, 1.05], [-1.11, 1.125], [-1.05, 1.15], [-1.025, 1.15]]),
    bottom: curve([[SCREEN_BASE - 0.005, 0.945], [-1.1, 0.96], [-1.025, 0.975]]),
    half: curve([[SCREEN_BASE - 0.005, 0.2], [-1.15, 0.185], [-1.025, 0.14]]),
    sections: [{ z: 0, pts: [[0, 1], [0.45, 0.985], [0.8, 0.93], [0.95, 0.8], [1, 0.55], [1, 0.25], [0.98, 0]] }],
  }, tint(F.screen, '#44505e'));
  // Tank + airbox cover
  buildTank(ctx, { front: -1.03, back: -0.6, top: 1.06, bottomFront: 0.88, bottomBack: 0.85, width: 0.43, style: 'sport', knee: 0.16, capZ: -0.88 });
  const airbox = outlineLoft(
    {
      zs: stationsBetween(-1.1, -0.98, 4, 0.2),
      top: curve([[-1.1, 0.985], [-0.98, 1.02]]),
      bottom: curve([[-1.1, 0.9], [-0.98, 0.88]]),
      half: curve([[-1.1, 0.1], [-0.98, 0.18]]),
      sections: [{ z: 0, pts: [[0, 1], [0.6, 0.97], [0.92, 0.8], [1, 0.5], [0.96, 0.2], [0.9, 0.0], [0.85, 0]] }],
    },
    { su: ctx.seg(4, 2), sv: ctx.seg(4, 2) },
  );
  shell(ctx, 'chassis', airbox, F.texturedBlack, 0.01);
  // Seats: rider + pillion
  buildSeat(ctx, { front: -0.64, back: -0.26, yFront: 0.85, y: 0.855, yBack: 0.885, width: 0.28, thick: 0.07, frontWidth: 0.18 });
  buildSeat(ctx, { front: -0.24, back: 0.02, yFront: 0.935, y: 0.95, yBack: 0.97, width: 0.2, thick: 0.05, frontWidth: 0.16 }, tint(seatFinish(ctx), '#141414'));
  // Tail with seat recesses, side intakes and the undertray.
  const tail = r1Tail();
  const tm = outlineLoft(tail, { su: ctx.seg(12, 4), sv: ctx.seg(6, 2), capBack: true });
  const seatHole: Field = fAnd(
    fOr(
      sideRegion([[-0.75, 0.84], [-0.255, 0.84], [-0.255, 1.4], [-0.75, 1.4]]),
      sideRegion([[-0.25, 0.925], [0.025, 0.925], [0.025, 1.4], [-0.25, 1.4]]),
    ),
    planRegion([[-0.8, -0.01], [0.03, -0.01], [0.03, 0.098], [-0.25, 0.098], [-0.26, 0.14], [-0.8, 0.14]]),
  );
  const tailVent = sideRegion(smooth2([[-0.2, 0.83], [-0.05, 0.89], [0.0, 0.86], [-0.16, 0.8]], 3, true));
  addPanel(ctx, 'chassis', tm, fAnd(fNot(seatHole), fNot(tailVent)), PAINT, 0.0025, 0.012);
  // Undertray (black) with the LED tail light band under the tip.
  const ut: OutlineBody = {
    zs: stationsBetween(-0.4, 0.15, 7, 0.4),
    top: curve([[-0.4, 0.72], [0.15, 0.92]]),
    bottom: curve([[-0.4, 0.66], [-0.1, 0.72], [0.15, 0.89]]),
    half: curve([[-0.4, 0.13], [0.15, 0.03]]),
    sections: [{ z: 0, pts: [[0, 1], [0.6, 0.95], [0.95, 0.7], [1, 0.45], [0.9, 0.2], [0.5, 0.02], [0, 0]] }],
  };
  ctx.add('chassis', outlineLoft(ut, { su: ctx.seg(5, 2), sv: ctx.seg(3, 2) }), F.texturedBlack);
  const tl: P2[] = smooth2([[-0.075, -0.006], [0.075, -0.006], [0.082, 0.004], [0.0, 0.009], [-0.082, 0.004]], 4, true);
  lamp(ctx, 'chassis', tl, mul(T(0, 0.905, 0.122), RX(-0.62)), { kind: 'tail', inner: 'led', count: 1, depth: 0.03, rim: 0.003, lensSmoked: true });
  // Front mudguard (short, painted)
  frontFender(ctx, { from: -0.62, to: 0.82, gap: 0.02, width: 0.155 });
  hugger(ctx, blackGloss);
  plateHanger(ctx, { fromZ: 0.02, fromY: 0.77 });
  // Fairing stays / small fasteners on the side panels
  if (ctx.micro) {
    for (const s of [-1, 1]) {
      for (const [z, y] of [[-1.17, 0.88], [-0.98, 0.79], [-0.72, 0.42], [-1.0, 0.37]] as const) {
        const sp = surfaceAt(ob, z, s * ob.half(z) * 0.98);
        const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), new THREE.Vector3(...sp.n).negate(), new THREE.Vector3(0, 1, 0));
        m.setPosition(sp.p[0] + sp.n[0] * 0.001, y, sp.p[2]);
        ctx.add('chassis', lathe([[0, 0], [0.0055, 0], [0.005, 0.0025], [0, 0.003]], { segs: 10, axis: 'z' }), F.texturedBlack, m);
      }
    }
  }
}

/** Yamaha logo-free tuning-fork style roundel (abstract) and lettering helpers. */
function r1Lettering(p: Pen, color: string, dark: boolean): void {
  if (p.view === 'right' || p.view === 'left') {
    // Big "R1" on the side fairing below the shoulder, italic, outlined.
    p.text('R1', -1.0, 0.56, { color, size: 0.12, italic: true, weight: '900', stretch: 1.05, stroke: dark ? undefined : '#0b0c0e', strokeWidth: 0.004 });
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
    frame: { type: 'twinSpar', color: '#4a4d52', metal: 0.85, rough: 0.36, subframe: 'cast', subframeColor: '#2a2c30', width: 0.37 },
    swingarm: { type: 'braced', length: 0.575, angleDeg: 9.5, color: '#4a4d52', metal: 0.85, rough: 0.38 },
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
      camCoverColor: '#1d3b8a',
      camCoverText: 'YAMAHA',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.44, h: 0.34, z: -1.22, y: 0.62, tiltDeg: 14, curved: true },
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
      mirrorPos: [0.33, 1.04, -1.16],
      mirrorSize: [0.15, 0.07],
      mirrorIndicators: true,
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
