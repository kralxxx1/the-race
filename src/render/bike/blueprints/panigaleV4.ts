import * as THREE from 'three';
import type { BikeSpec, Livery } from '../../../data/bikes';
import { RX, S, T, mul, type KitContext } from '../context';
import { addPanel, bodyQ, buildSeat, buildTank, frontFender, PAINT, screen, seatFinish } from '../kit/body';
import { lamp, ledStrip } from '../kit/lights';
import { hugger, plateHanger } from '../kit/rear';
import { curve, outlineLoft, sideAt, stationsBetween, surfaceAt, type OutlineBody } from '../kit/shape';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv, type Pen } from '../livery';
import { extrude, lathe, MeshData, smooth2, type P2, type P3 } from '../mesh';
import { F, hard, tint } from '../sink';
import { cut, fAnd, fNot, frontRegion, fOr, planRegion, sideRegion, type Field } from '../surface';
import type { BikeBlueprint } from '../types';

/**
 * Ducati Panigale V4 S (2022+).
 * Spec sheet: wheelbase 1485 mm, rake 24.5°, trail 100 mm, seat 850 mm,
 * 120/70ZR17 + 200/60ZR17 on 3-spoke forged wheels (3.50 / 6.00 in), Öhlins
 * NIX30 43 mm fork (TiN gold), 2 × 330 mm discs with monobloc radial calipers,
 * aluminium "Front Frame" monocoque on the 90° Desmosedici Stradale V4 (rotated
 * back 42°), single-sided swingarm on the left, under-engine exhaust with twin
 * short outlets on the right.
 * Design cues: sharp beak between two big air intakes, each topped by a thin LED
 * DRL "eyebrow"; double-profile wing integrated in the side fairing; slim high
 * tail split in two with LED light lines; Rosso Ducati paint.
 */

const NOSE = -1.715;
const SCREEN_BASE = -1.6;
const SCREEN_TOP_Z = -1.25;

/** Rear edge of the side fairing (side view), tank front → back of the belly. */
const SIDE_EDGE: P2[] = [
  [-1.25, 0.985],
  [-1.14, 0.955],
  [-1.04, 0.905],
  [-0.94, 0.8],
  [-0.86, 0.63],
  [-0.8, 0.48],
  [-0.74, 0.36],
  [-0.67, 0.27],
  [-0.6, 0.21],
  [-0.54, 0.18],
];

function fairing(): OutlineBody {
  const zs = [NOSE, -1.71, -1.7, -1.685, -1.665, -1.635, -1.6, -1.55, -1.49, -1.42, -1.34, -1.25, -1.15, -1.05, -0.95, -0.85, -0.75, -0.65, -0.54];
  // Trapezoid sections with a hard shoulder crease (index 2) — the V4 nose is sharper than the R1's.
  const face: P2[] = [[0, 1], [0.34, 0.95], [0.66, 0.84], [0.88, 0.66], [0.98, 0.44], [0.98, 0.22], [0.87, 0.05], [0.68, 0]];
  const cowl: P2[] = [[0, 1], [0.36, 0.985], [0.66, 0.93], [0.84, 0.79], [0.96, 0.6], [1, 0.38], [0.95, 0.12], [0.76, 0]];
  const side: P2[] = [[0, 1], [0.4, 0.99], [0.7, 0.95], [0.87, 0.82], [0.97, 0.6], [1, 0.36], [0.93, 0.1], [0.6, 0]];
  const back: P2[] = [[0, 1], [0.44, 0.99], [0.74, 0.95], [0.9, 0.82], [0.98, 0.6], [1, 0.36], [0.92, 0.1], [0.5, 0]];
  return {
    zs,
    top: curve([
      [NOSE, 0.772],
      [-1.69, 0.8],
      [-1.64, 0.832],
      [-1.56, 0.866],
      [-1.46, 0.9],
      [-1.36, 0.928],
      [-1.25, 0.952],
      [-1.12, 0.962],
      [-0.95, 0.93],
      [-0.75, 0.85],
      [-0.54, 0.76],
    ]),
    bottom: curve([
      [NOSE, 0.762],
      [-1.705, 0.715],
      [-1.69, 0.675],
      [-1.665, 0.648],
      [-1.62, 0.628],
      [-1.55, 0.612],
      [-1.48, 0.6],
      [-1.4, 0.52],
      [-1.29, 0.35],
      [-1.16, 0.21],
      [-1.0, 0.165],
      [-0.8, 0.165],
      [-0.54, 0.2],
    ]),
    half: curve([
      [NOSE, 0.008],
      [-1.705, 0.06],
      [-1.685, 0.115],
      [-1.65, 0.16],
      [-1.59, 0.2],
      [-1.5, 0.236],
      [-1.4, 0.264],
      [-1.28, 0.287],
      [-1.12, 0.298],
      [-0.95, 0.292],
      [-0.75, 0.262],
      [-0.54, 0.215],
    ]),
    sections: [
      { z: NOSE, pts: face },
      { z: -1.64, pts: face },
      { z: -1.42, pts: cowl },
      { z: -1.05, pts: side },
      { z: -0.54, pts: back },
    ],
  };
}

function tail(): OutlineBody {
  return {
    zs: stationsBetween(-0.72, 0.06, 14, 0.5),
    top: curve([[-0.72, 0.835], [-0.55, 0.845], [-0.36, 0.875], [-0.3, 0.93], [-0.16, 0.975], [-0.04, 1.02], [0.06, 1.065]]),
    bottom: curve([[-0.72, 0.68], [-0.45, 0.71], [-0.22, 0.79], [-0.06, 0.9], [0.03, 0.99], [0.06, 1.03]]),
    half: curve([[-0.72, 0.15], [-0.5, 0.14], [-0.3, 0.122], [-0.12, 0.096], [0.0, 0.07], [0.06, 0.05]]),
    sections: [
      { z: -0.72, pts: [[0, 1], [0.6, 0.98], [0.95, 0.84], [1, 0.55], [0.93, 0.22], [0.6, 0.02], [0, 0]] },
      { z: 0.06, pts: [[0, 1], [0.7, 0.98], [1, 0.76], [0.99, 0.48], [0.86, 0.2], [0.45, 0.02], [0, 0]] },
    ],
  };
}

/** Thin aerofoil section (chord along z, thickness along y) extruded across x. */
function wingBlade(z0: number, z1: number, y: number, x0: number, x1: number, thick: number, camber: number): MeshData {
  const n = 10;
  const top: P2[] = [];
  const bot: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const z = z0 + (z1 - z0) * t;
    const th = thick * 2.6 * Math.sqrt(t) * (1 - t) + 0.0008;
    const c = camber * 4 * t * (1 - t) + (t * 0.012);
    top.push([z, y + c + th / 2]);
    bot.push([z, y + c - th / 2]);
  }
  const outline = [...top, ...bot.reverse()];
  return extrude(outline, x1 - x0, { plane: 'zy', center: (x0 + x1) / 2, bevel: 0.0015, curveSegs: 1 });
}

function body(ctx: KitContext): void {
  const ob = fairing();
  const q = bodyQ(ctx, 1.7);
  const master = outlineLoft(ob, { su: q.su, sv: q.sv, creases: [2], capFront: true });
  const blackGloss = hard('#0b0c0e', 0.15, 0.2, 1);
  const A = ctx.hp.frontAxle;
  const open = sideRegion([[-1.25, 2], ...SIDE_EDGE, [-0.35, 0.1], [-0.35, 2]]);
  const arch = (_x: number, y: number, z: number) => 0.36 - Math.hypot(z - A[2], y - A[1]);
  const underScreen = fAnd(planRegion([[SCREEN_BASE + 0.08, -1], [-1.1, -1], [-1.1, 0.15], [-1.4, 0.165], [SCREEN_BASE + 0.08, 0.11]]), (_x, y) => y - 0.86);
  // Twin air intakes either side of the beak (front view, x ≥ 0).
  const intakePoly: P2[] = [[0.024, 0.716], [0.05, 0.733], [0.1, 0.746], [0.138, 0.738], [0.15, 0.715], [0.138, 0.684], [0.1, 0.664], [0.048, 0.664], [0.026, 0.684]];
  const intake = fAnd(frontRegion(smooth2(intakePoly, 3, true)), (_x, _y, z) => -1.6 - z);
  const bodyCut = cut(master, fAnd(fNot(open), fNot(arch), fNot(underScreen), fNot(intake)));
  // Side air outlet behind the front wheel; the double-profile wing sits in its rear part.
  const outletPoly: P2[] = [[-1.27, 0.72], [-1.1, 0.725], [-1.0, 0.68], [-0.98, 0.58], [-1.03, 0.53], [-1.2, 0.545], [-1.27, 0.62]];
  const outlet = sideRegion(smooth2(outletPoly, 4, true));
  const cowl = sideRegion([[-2, 2], [-1.38, 2], [-1.38, 0.94], [-1.4, 0.8], [-1.44, 0.68], [-1.5, 0.6], [-2, 0.58]]);
  const belly = sideRegion([[-1.2, 0.34], [-1.0, 0.32], [-0.75, 0.31], [-0.4, 0.31], [-0.4, -1], [-1.2, -1]]);
  addPanel(ctx, 'chassis', bodyCut, cowl, PAINT, 0.003, 0.014);
  addPanel(ctx, 'chassis', bodyCut, fAnd(fNot(cowl), fNot(belly), fNot(outlet)), PAINT, 0.003, 0.014);
  addPanel(ctx, 'chassis', bodyCut, fAnd(belly, fNot(cowl)), PAINT, 0.003, 0.014);
  // Outlet: dark inner wall, then the double-deck wing blades (carbon) bridging the opening.
  for (const s of [-1, 1]) {
    const p = sideAt(ob, -1.12, 0.62, s);
    const inner = smooth2(outletPoly.map(([z, y]) => [z + (z < -1.12 ? -0.012 : 0.012), y + (y > 0.62 ? 0.012 : -0.012)] as P2), 3, true);
    ctx.add('chassis', extrude(inner, 0.006, { plane: 'zy', center: p.p[0] - s * 0.05 }), F.texturedBlack);
    const xIn = Math.abs(p.p[0]) - 0.05, xOut = Math.abs(p.p[0]) + 0.026;
    for (const [y, z0, z1] of [[0.665, -1.25, -1.03], [0.585, -1.22, -1.0]] as const) {
      const blade = wingBlade(z0, z1, y, xIn, xOut, 0.016, 0.01);
      ctx.add('chassis', s > 0 ? blade : blade.mirrored(), blackGloss);
    }
    // End plate joining the blade tips (the outer edge of the double wing).
    const plate: P2[] = [[-1.22, 0.565], [-1.0, 0.575], [-0.99, 0.61], [-1.02, 0.7], [-1.25, 0.69], [-1.24, 0.61]];
    ctx.add('chassis', extrude(smooth2(plate, 2, true), 0.004, { plane: 'zy', center: s * (xOut + 0.002), bevel: 0.0012 }), blackGloss);
  }
  // Inner panel under the screen (dash surround).
  const inner = outlineLoft(
    {
      zs: stationsBetween(SCREEN_BASE + 0.06, -1.24, 6, 0.3),
      top: curve([[SCREEN_BASE + 0.06, 0.87], [-1.4, 0.9], [-1.24, 0.93]]),
      bottom: curve([[SCREEN_BASE + 0.06, 0.75], [-1.24, 0.8]]),
      half: curve([[SCREEN_BASE + 0.06, 0.15], [-1.4, 0.2], [-1.24, 0.24]]),
      sections: [{ z: 0, pts: [[0, 1], [0.5, 0.98], [0.86, 0.88], [0.98, 0.65], [1, 0.4], [0.97, 0.15], [0.9, 0]] }],
    },
    { su: ctx.seg(6, 2), sv: ctx.seg(4, 2) },
  );
  ctx.add('chassis', inner, F.texturedBlack);
  // Intake ducts with the LED headlight modules low inside them, and the DRL eyebrows on their upper lips.
  for (const s of [-1, 1]) {
    const duct = outlineLoft(
      {
        zs: stationsBetween(-1.665, -1.5, 4, 0.2),
        top: curve([[-1.665, 0.745], [-1.5, 0.73]]),
        bottom: curve([[-1.665, 0.662], [-1.5, 0.67]]),
        half: curve([[-1.665, 0.065], [-1.5, 0.055]]),
        sections: [{ z: 0, pts: [[0, 1], [0.6, 0.98], [0.95, 0.8], [1, 0.5], [0.95, 0.15], [0.55, 0.0], [0, 0]] }],
        xOff: () => s * 0.088,
      },
      { su: ctx.seg(3, 2), sv: ctx.seg(4, 2) },
    ).flip();
    ctx.add('chassis', duct, F.texturedBlack);
    // Compact LED headlight: reflector bowl + emitter, low in the intake.
    const at: P3 = [s * 0.082, 0.684, -1.62];
    const seg = ctx.seg(20, 10);
    ctx.add('chassis', lathe([[0, -0.03], [0.02, -0.022], [0.024, 0.0]], { segs: seg, axis: 'z' }).transform(S(1.5, 0.75, -1)), F.chrome, T(...at));
    ctx.add('chassis', lathe(([[0, 0.008], [0.014, 0.006], [0.02, 0.0]] as P2[]).reverse(), { segs: seg, axis: 'z' }).transform(S(1.5, 0.75, -1)), F.head, T(...at));
    // DRL: a thin LED line hugging the upper lip of the intake, curling down at the outer end.
    const pts: P3[] = [];
    const lip: P2[] = [[0.03, 0.722], [0.06, 0.737], [0.1, 0.748], [0.135, 0.742], [0.152, 0.722]];
    for (const [x, y] of lip) {
      const sp = surfaceAt(ob, -1.66, x);
      const z = Math.min(sp.p[2], -1.62) - (0.15 - x) * 0.3;
      pts.push([s * x, y, z]);
    }
    ledStrip(ctx, 'chassis', pts, 0.0075, 0.004, 'drl', [0, 1, 0]);
  }
  // Screen: smoked, tall bubble from the beak.
  screen(ctx, 'chassis', {
    zs: stationsBetween(SCREEN_BASE, SCREEN_TOP_Z, 8, 0.35),
    top: curve([[SCREEN_BASE, 0.872], [-1.52, 0.93], [-1.42, 1.02], [-1.33, 1.09], [-1.27, 1.115], [SCREEN_TOP_Z, 1.12]]),
    bottom: curve([[SCREEN_BASE, 0.86], [-1.4, 0.915], [SCREEN_TOP_Z, 0.955]]),
    half: curve([[SCREEN_BASE, 0.15], [-1.46, 0.185], [-1.32, 0.17], [SCREEN_TOP_Z, 0.12]]),
    sections: [{ z: 0, pts: [[0, 1], [0.45, 0.985], [0.8, 0.93], [0.95, 0.8], [1, 0.55], [1, 0.25], [0.98, 0]] }],
  }, tint(F.screen, '#3a3f46'));
  // Tank cover (airbox) + tank: long and low, flowing into the seat.
  buildTank(ctx, {
    front: -1.24,
    back: -0.64,
    top: 1.06,
    bottomFront: 0.9,
    bottomBack: 0.8,
    width: 0.44,
    style: 'sport',
    knee: 0.17,
    capZ: -0.98,
    topLine: [[-1.24, 0.955], [-1.15, 0.99], [-1.05, 1.03], [-0.95, 1.055], [-0.85, 1.056], [-0.75, 1.03], [-0.69, 0.97], [-0.64, 0.89]],
    bottomLine: [[-1.24, 0.9], [-1.06, 0.865], [-0.85, 0.83], [-0.64, 0.8]],
    halfLine: [[-1.24, 0.12], [-1.13, 0.18], [-1.0, 0.218], [-0.86, 0.215], [-0.74, 0.185], [-0.64, 0.12]],
  });
  // Rider seat (with the stitched edge) + passenger cowl seat pad.
  buildSeat(ctx, { front: -0.68, back: -0.33, yFront: 0.845, y: 0.85, yBack: 0.885, width: 0.27, thick: 0.065, frontWidth: 0.17 });
  buildSeat(ctx, { front: -0.31, back: -0.1, yFront: 0.94, y: 0.952, yBack: 0.97, width: 0.17, thick: 0.04, frontWidth: 0.13 }, tint(seatFinish(ctx), '#161616'));
  // Tail: split at the back into two fins carrying the LED light lines.
  const tb = tail();
  const tm = outlineLoft(tb, { su: ctx.seg(12, 4), sv: ctx.seg(6, 2), capBack: true });
  const seatHole: Field = fAnd(
    fOr(sideRegion([[-0.85, 0.82], [-0.322, 0.82], [-0.322, 1.4], [-0.85, 1.4]]), sideRegion([[-0.312, 0.92], [-0.09, 0.92], [-0.09, 1.4], [-0.312, 1.4]])),
    planRegion([[-0.85, -0.01], [-0.08, -0.01], [-0.08, 0.088], [-0.31, 0.088], [-0.32, 0.138], [-0.85, 0.138]]),
  );
  // Central slot between the two fins (plan view) and the side air channel under the seat.
  const split = fAnd(planRegion([[-0.05, -1], [0.2, -1], [0.2, 0.028], [-0.05, 0.012]]), (_x, y) => y - 0.9);
  const tailVent = sideRegion(smooth2([[-0.3, 0.78], [-0.12, 0.85], [-0.02, 0.9], [-0.06, 0.85], [-0.24, 0.76]], 3, true));
  addPanel(ctx, 'chassis', tm, fAnd(fNot(seatHole), fNot(split), fNot(tailVent)), PAINT, 0.0025, 0.012);
  // Dark undertray
  const ut: OutlineBody = {
    zs: stationsBetween(-0.5, 0.04, 7, 0.4),
    top: curve([[-0.5, 0.74], [0.04, 0.99]]),
    bottom: curve([[-0.5, 0.69], [-0.15, 0.76], [0.04, 0.95]]),
    half: curve([[-0.5, 0.135], [0.04, 0.05]]),
    sections: [{ z: 0, pts: [[0, 1], [0.6, 0.95], [0.95, 0.7], [1, 0.45], [0.9, 0.2], [0.5, 0.02], [0, 0]] }],
  };
  ctx.add('chassis', outlineLoft(ut, { su: ctx.seg(5, 2), sv: ctx.seg(3, 2) }), F.texturedBlack);
  // LED tail lines along the lower edges of the two fins, meeting under the tip.
  for (const s of [-1, 1]) {
    const pts: P3[] = [];
    for (let i = 0; i <= 5; i++) {
      const z = -0.14 + (i / 5) * 0.2;
      const w = tb.half(z) * 0.98;
      const y = tb.bottom(z) + 0.012;
      pts.push([s * w, y, z]);
    }
    ledStrip(ctx, 'chassis', pts, 0.008, 0.005, 'tail', [0, 1, 0]);
  }
  const tl: P2[] = smooth2([[-0.05, -0.004], [0.05, -0.004], [0.055, 0.004], [-0.055, 0.004]], 3, true);
  lamp(ctx, 'chassis', tl, mul(T(0, 1.005, 0.05), RX(-0.7)), { kind: 'tail', inner: 'led', count: 1, depth: 0.02, rim: 0.002, lensSmoked: true });
  frontFender(ctx, { from: -0.68, to: 0.78, gap: 0.02, width: 0.15 });
  hugger(ctx, blackGloss);
  plateHanger(ctx, { fromZ: -0.12, fromY: 0.8 });
  // Fasteners
  if (ctx.micro) {
    for (const s of [-1, 1]) {
      for (const [z, y] of [[-1.34, 0.86], [-1.06, 0.82], [-0.9, 0.58], [-1.05, 0.33], [-0.68, 0.3]] as const) {
        const sp = sideAt(ob, z, y, s);
        const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), new THREE.Vector3(...sp.n).negate(), new THREE.Vector3(0, 1, 0));
        m.setPosition(sp.p[0] + sp.n[0] * 0.001, sp.p[1], sp.p[2]);
        ctx.add('chassis', lathe([[0, 0], [0.0055, 0], [0.005, 0.0025], [0, 0.003]], { segs: 10, axis: 'z' }), F.texturedBlack, m);
      }
    }
  }
}

function lettering(p: Pen, color: string): void {
  if (p.view !== 'right' && p.view !== 'left') return;
  // Big "V4 S" on the lower side fairing, Ducati wordmark on the nose, model name on the tail.
  p.text('V4 S', -1.02, 0.36, { color, size: 0.105, italic: true, weight: '900', stretch: 1.08 });
  p.text('DUCATI', -1.55, 0.79, { color, size: 0.026, weight: '900', spacing: 0.06, italic: true });
  p.text('Panigale V4 S', -0.2, 0.86, { color, size: 0.024, weight: '700', italic: true });
}

function livery(c: LiveryCanvas, lv: Livery, env: LiveryEnv): void {
  const blackRed = env.index === 1;
  c.views(ALL_VIEWS, (p) => {
    if (blackRed) {
      p.fill('#17181b', 'metallic');
      if (p.view === 'right' || p.view === 'left') {
        // Red accent sweep along the fairing shoulder and the tail edge.
        p.poly([[-1.7, 0.76], [-1.25, 0.94], [-1.0, 0.92], [-1.0, 0.89], [-1.25, 0.905], [-1.7, 0.735]], '#cc0a0a');
        p.poly([[-0.3, 0.86], [0.06, 1.05], [0.06, 1.0], [-0.3, 0.83]], '#cc0a0a');
        lettering(p, '#cc0a0a');
      } else if (p.view === 'top') {
        p.rect(-1.0, -0.012, -0.66, 0.012, '#cc0a0a');
      }
      return;
    }
    // Rosso Ducati: solid red under clear coat; black belly / exhaust shield, white graphics.
    p.fill(lv.primary, 'gloss');
    if (p.view === 'right' || p.view === 'left') {
      p.poly([[-1.15, 0.24], [-0.9, 0.26], [-0.6, 0.27], [-0.4, 0.3], [-0.4, -0.1], [-1.2, -0.1]], '#141517', 'satin');
      lettering(p, '#f4f4f4');
      // Thin white pinstripe following the shoulder crease
      p.line([[-1.69, 0.79], [-1.4, 0.905], [-1.22, 0.935]], '#f4f4f4', 0.003);
    } else if (p.view === 'front') {
      p.rect(-1, -1, 1, 0.3, '#141517', 'satin');
    }
  });
}

export function panigaleV4Blueprint(spec: BikeSpec): BikeBlueprint {
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.11, 0.81, 1.12],
    wheelbase: 1.485,
    rakeDeg: 24.5,
    trail: 0.1,
    forkLength: 0.725,
    front: { tyre: '120/70ZR17', rimWidthIn: 3.5, crown: 0.8, tread: 'slickish', tyreLabel: 'Supercorsa SP' },
    rear: { tyre: '200/60ZR17', rimWidthIn: 6.0, crown: 0.9, tread: 'slickish', tyreLabel: 'Supercorsa SP' },
    frontWheel: { type: 'forged', spokes: 3, shape: 'y', color: '#1d1e21', machinedLip: true },
    rearWheel: { type: 'forged', spokes: 3, shape: 'y', color: '#1d1e21', machinedLip: true },
    fork: { type: 'usd', stanchion: 0.043, spacing: 0.212, outerColor: '#c9a028', innerColor: '#d8b45a', footColor: '#1e1f22', capColor: '#c9a028', adjusterColor: '#d33a1c', label: 'ÖHLINS', labelColor: '#1b1c1f', aboveClamp: 0.01, clampGap: 0.2 },
    frontBrake: { discs: 2, discDia: 0.33, disc: 'floating', carrierColor: '#2a2c30', caliper: 'radialMono4', caliperColor: '#2f3136', caliperText: 'brembo', caliperTextColor: '#d01c1c', caliperAngleDeg: 78 },
    rearBrake: { discs: 1, discDia: 0.245, disc: 'fixed', carrierColor: '#2a2c30', caliper: 'axial2', caliperColor: '#2f3136', caliperAngleDeg: 200 },
    frame: { type: 'monocoque', color: '#1c1d20', metal: 0.75, rough: 0.42, subframe: 'cast', subframeColor: '#1c1d20', width: 0.33 },
    swingarm: { type: 'singleSided', length: 0.6, angleDeg: 11, side: 'left', color: '#1f2023', metal: 0.7, rough: 0.42 },
    shock: { layout: 'mono', springColor: '#e6c41c', bodyColor: '#c9a028', reservoir: true },
    drive: { type: 'chain', side: 'left', frontTeeth: 16, rearTeeth: 41, pitch: 0.015875, sprocketColor: '#1d1e21' },
    engine: {
      layout: 'V4',
      cc: 1103,
      crank: [0, 0.39, -0.87],
      tiltDeg: 42,
      caseColor: '#232427',
      coverColor: '#2f3135',
      headColor: '#26272a',
      camCoverColor: '#1d1e21',
      camCoverText: 'DESMOSEDICI',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.42, h: 0.36, z: -1.3, y: 0.62, tiltDeg: 18, curved: true },
      width: 0.4,
    },
    exhaust: { route: 'underbelly', side: 'right', can: 'round', canLength: 0.12, canDia: 0.062, canFinish: 'steel', headerFinish: 'steel' },
    cockpit: {
      bars: 'clipon',
      grip: [0.33, 0.885, -1.04],
      barDia: 0.022,
      dash: 'tftDucati',
      dashPos: [0, 1.01, -1.165],
      dashSize: [0.112, 0.066],
      dashTiltDeg: 50,
      dashMount: 'fairing',
      mirrors: 'fairing',
      mirrorPos: [0.33, 0.99, -1.31],
      mirrorSize: [0.15, 0.058],
      mirrorIndicators: true,
      mirrorShape: 'sport',
      mirrorColor: '#0d0e10',
      topClamp: 'milled',
      steeringDamper: 'side',
      leverColor: '#1e1f22',
      reservoirs: true,
      clutch: 'hydraulic',
      ignition: 'keyless',
      switchColor: '#151618',
      gripColor: '#121212',
      barEndColor: '#1d1e21',
    },
    lights: { head: 'panigale', tail: 'panigale', rearIndicators: 'stalk' },
    seat: { height: 0.85, front: -0.68, back: -0.33, pillion: 'cowl', color: '#141414' },
    rider: { hip: [0, 0.94, -0.49], peg: [0.19, 0.4, -0.47], torsoPitch: 0.8 },
    footrests: 'rearset',
    plate: { mount: 'hanger', pos: [0, 0.6, 0.33], tiltDeg: -14 },
    body,
    livery,
    groundClearance: 0.13,
    features: ['winglets'],
    zones: { splitY: 0.4, decal: [-1.02, 0.36] },
  };
}
