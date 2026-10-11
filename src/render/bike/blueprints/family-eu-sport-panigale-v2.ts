import type { BikeSpec, Livery } from '../../../data/bikes';
import { S, T, type KitContext } from '../context';
import { addPanel, bodyQ, buildSeat, buildTank, frontFender, PAINT, screen, seatFinish } from '../kit/body';
import { underBox, twinBarrelSilencer, veePorts } from '../kit/eu-sport-exhaust';
import { aerofoil, skinX } from '../kit/eu-sport-parts';
import { heatPipe } from '../kit/jp-sport-exhaust';
import { ductWall, fasteners, innerCowl, tailLamp, undertray } from '../kit/jp-sport-parts';
import { ledStrip } from '../kit/lights';
import { hugger, plateHanger } from '../kit/rear';
import { curve, outlineLoft, stationsBetween, surfaceAt, type OutlineBody } from '../kit/shape';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv, type Pen } from '../livery';
import { extrude, lathe, smooth2, type P2, type P3 } from '../mesh';
import { F, hard, tint, vary } from '../sink';
import { cut, fAnd, fNot, frontRegion, fOr, planRegion, sideRegion, type Field } from '../surface';
import type { BikeBlueprint } from '../types';

/**
 * Ducati Panigale V2 (2020–2024).
 * Spec sheet: wheelbase 1436 mm, rake 24°, trail 94 mm, seat 840 mm, dry 176 kg,
 * 120/70ZR17 on 3.50" + 180/60ZR17 on 5.50" 5-split-spoke cast wheels, Showa BPF 43 mm
 * fork, Sachs shock laid on the left, 2 × 320 mm discs with Brembo M4.32 monobloc
 * calipers, aluminium monocoque front frame on the 955 cc Superquadro 90° L-twin
 * (front cylinder 21° above horizontal), single-sided aluminium swingarm on the left,
 * 2-1-2 exhaust into a pre-silencer under the engine and the twin-barrel silencer
 * low on the right.
 * Design cues: the Panigale V4 face scaled down — sharp beak between two air intakes
 * with the LED headlights low inside them and the DRL "eyebrows" on their upper lips —
 * a wingless side fairing with one big outlet and two strakes, slim split tail with
 * LED light lines, Rosso Ducati paint.
 */

const NOSE = -1.668;
const SCREEN_BASE = -1.555;
const SCREEN_TOP_Z = -1.212;

const SIDE_EDGE: P2[] = [
  [-1.205, 0.972],
  [-1.095, 0.944],
  [-0.995, 0.894],
  [-0.9, 0.79],
  [-0.82, 0.62],
  [-0.76, 0.47],
  [-0.7, 0.37],
  [-0.63, 0.295],
  [-0.56, 0.255],
  [-0.5, 0.24],
];

function fairing(): OutlineBody {
  const zs = [NOSE, -1.663, -1.653, -1.638, -1.618, -1.588, -1.553, -1.503, -1.443, -1.373, -1.293, -1.205, -1.105, -1.005, -0.905, -0.805, -0.705, -0.6, -0.5];
  const face: P2[] = [[0, 1], [0.34, 0.95], [0.66, 0.84], [0.88, 0.66], [0.98, 0.44], [0.9, 0.21], [0.56, 0.045], [0, 0]];
  const cowl: P2[] = [[0, 1], [0.36, 0.985], [0.66, 0.93], [0.84, 0.79], [0.96, 0.6], [1, 0.38], [0.95, 0.12], [0.76, 0]];
  const side: P2[] = [[0, 1], [0.4, 0.99], [0.7, 0.95], [0.87, 0.82], [0.97, 0.6], [1, 0.36], [0.93, 0.1], [0.6, 0]];
  const back: P2[] = [[0, 1], [0.44, 0.99], [0.74, 0.95], [0.9, 0.82], [0.98, 0.6], [1, 0.36], [0.92, 0.1], [0.5, 0]];
  return {
    zs,
    top: curve([
      [NOSE, 0.762],
      [-1.643, 0.79],
      [-1.593, 0.821],
      [-1.513, 0.854],
      [-1.413, 0.886],
      [-1.313, 0.913],
      [-1.205, 0.936],
      [-1.08, 0.946],
      [-0.91, 0.916],
      [-0.71, 0.838],
      [-0.5, 0.756],
    ]),
    bottom: curve([
      [NOSE, 0.752],
      [-1.658, 0.707],
      [-1.643, 0.668],
      [-1.618, 0.642],
      [-1.573, 0.622],
      [-1.503, 0.607],
      [-1.433, 0.595],
      [-1.355, 0.52],
      [-1.25, 0.37],
      [-1.13, 0.255],
      [-0.98, 0.215],
      [-0.78, 0.215],
      [-0.5, 0.245],
    ]),
    half: curve([
      [NOSE, 0.008],
      [-1.658, 0.057],
      [-1.638, 0.108],
      [-1.603, 0.151],
      [-1.543, 0.189],
      [-1.453, 0.223],
      [-1.353, 0.25],
      [-1.233, 0.271],
      [-1.075, 0.282],
      [-0.905, 0.276],
      [-0.705, 0.248],
      [-0.5, 0.204],
    ]),
    sections: [
      { z: NOSE, pts: face },
      { z: -1.595, pts: face },
      { z: -1.375, pts: cowl },
      { z: -1.005, pts: side },
      { z: -0.5, pts: back },
    ],
  };
}

function tail(): OutlineBody {
  return {
    zs: stationsBetween(-0.71, 0.055, 14, 0.5),
    top: curve([[-0.71, 0.83], [-0.53, 0.84], [-0.35, 0.868], [-0.29, 0.922], [-0.16, 0.963], [-0.05, 1.005], [0.055, 1.045]]),
    bottom: curve([[-0.71, 0.68], [-0.45, 0.71], [-0.22, 0.79], [-0.07, 0.892], [0.025, 0.978], [0.055, 1.012]]),
    half: curve([[-0.71, 0.146], [-0.5, 0.136], [-0.3, 0.119], [-0.12, 0.093], [0.0, 0.068], [0.055, 0.048]]),
    sections: [
      { z: -0.71, pts: [[0, 1], [0.6, 0.98], [0.95, 0.84], [1, 0.55], [0.93, 0.22], [0.6, 0.02], [0, 0]] },
      { z: 0.055, pts: [[0, 1], [0.7, 0.98], [1, 0.76], [0.99, 0.48], [0.86, 0.2], [0.45, 0.02], [0, 0]] },
    ],
  };
}

/** Right air intake in the face (front view, x ≥ 0); the headlight sits low inside it. */
const INTAKE: P2[] = [[0.023, 0.708], [0.048, 0.724], [0.095, 0.737], [0.131, 0.73], [0.143, 0.707], [0.131, 0.677], [0.095, 0.659], [0.046, 0.659], [0.025, 0.677]];
/** Side outlet behind the front wheel (right side view). */
const OUTLET: P2[] = [[-1.232, 0.69], [-1.17, 0.722], [-1.02, 0.712], [-0.952, 0.652], [-0.955, 0.575], [-1.03, 0.525], [-1.125, 0.528], [-1.195, 0.6]];

function body(ctx: KitContext): void {
  const ob = fairing();
  const q = bodyQ(ctx, 1.7);
  const master = outlineLoft(ob, { su: q.su, sv: q.sv, creases: [2], capFront: true });
  const blackGloss = hard('#0b0c0e', 0.15, 0.2, 1);
  const A = ctx.hp.frontAxle;
  const open = sideRegion([[-1.205, 2], ...SIDE_EDGE, [-0.3, 0.1], [-0.3, 2]]);
  const arch = (_x: number, y: number, z: number) => 0.355 - Math.hypot(z - A[2], y - A[1]);
  const underScreen = fAnd(planRegion([[SCREEN_BASE + 0.08, -1], [-1.06, -1], [-1.06, 0.145], [-1.36, 0.16], [SCREEN_BASE + 0.08, 0.105]]), (_x, y) => y - 0.85);
  const intake = fAnd(frontRegion(smooth2(INTAKE, 3, true)), (_x, _y, z) => -1.555 - z);
  const outlet = sideRegion(smooth2(OUTLET, 4, true));
  const bodyCut = cut(master, fAnd(fNot(open), fNot(arch), fNot(underScreen), fNot(intake)));
  const cowl = sideRegion([[-2, 2], [-1.335, 2], [-1.335, 0.93], [-1.355, 0.79], [-1.395, 0.67], [-1.455, 0.59], [-2, 0.57]]);
  const belly = sideRegion([[-1.16, 0.37], [-0.96, 0.352], [-0.71, 0.345], [-0.35, 0.35], [-0.35, -1], [-1.16, -1]]);
  addPanel(ctx, 'chassis', bodyCut, cowl, PAINT, 0.003, 0.014);
  addPanel(ctx, 'chassis', bodyCut, fAnd(fNot(cowl), fNot(belly), fNot(outlet)), PAINT, 0.003, 0.014);
  addPanel(ctx, 'chassis', bodyCut, fAnd(belly, fNot(cowl)), PAINT, 0.003, 0.014);
  // Side outlet: dark inner wall and two painted strakes following the wheel arch.
  ductWall(ctx, ob, OUTLET.map(([z, y]) => [z + (z < -1.1 ? -0.012 : 0.012), y + (y > 0.61 ? 0.012 : -0.012)] as P2), -1.1, 0.61, 0.045);
  for (const s of [-1, 1]) {
    for (const [y, z0, z1] of [[0.655, -1.2, -1.0], [0.585, -1.165, -0.985]] as const) {
      const sp = skinX(ob, (z0 + z1) / 2, y);
      const blade = aerofoil(z0, z1, y, sp - 0.035, sp - 0.004, 0.014, 0.006, -0.006);
      ctx.add('chassis', s > 0 ? blade : blade.mirrored(), PAINT);
    }
  }
  innerCowl(ctx, { z0: SCREEN_BASE + 0.06, z1: -1.21, yTop0: 0.862, yTop1: 0.92, yBot0: 0.745, yBot1: 0.795, w0: 0.145, w1: 0.232 });
  // Intake ducts with the LED headlight modules low inside, DRL eyebrows on the upper lips.
  for (const s of [-1, 1]) {
    const duct = outlineLoft(
      {
        zs: stationsBetween(-1.62, -1.47, 4, 0.2),
        top: curve([[-1.62, 0.736], [-1.47, 0.722]]),
        bottom: curve([[-1.62, 0.657], [-1.47, 0.665]]),
        half: curve([[-1.62, 0.062], [-1.47, 0.052]]),
        sections: [{ z: 0, pts: [[0, 1], [0.6, 0.98], [0.95, 0.8], [1, 0.5], [0.95, 0.15], [0.55, 0.0], [0, 0]] }],
        xOff: () => s * 0.084,
      },
      { su: ctx.seg(3, 2), sv: ctx.seg(4, 2) },
    ).flip();
    ctx.add('chassis', duct, F.texturedBlack);
    const at: P3 = [s * 0.08, 0.677, -1.575];
    const seg = ctx.seg(20, 10);
    ctx.add('chassis', lathe([[0, -0.028], [0.019, -0.021], [0.023, 0.0]], { segs: seg, axis: 'z' }).transform(S(1.45, 0.72, -1)), F.chrome, T(...at));
    ctx.add('chassis', lathe(([[0, 0.008], [0.013, 0.006], [0.019, 0.0]] as P2[]).reverse(), { segs: seg, axis: 'z' }).transform(S(1.45, 0.72, -1)), F.head, T(...at));
    const pts: P3[] = [];
    const lip: P2[] = [[0.03, 0.716], [0.058, 0.729], [0.095, 0.739], [0.128, 0.734], [0.145, 0.715]];
    for (const [x, y] of lip) {
      const sp = surfaceAt(ob, -1.615, x);
      const z = Math.min(sp.p[2], -1.575) - (0.145 - x) * 0.3;
      pts.push([s * x, y, z]);
    }
    ledStrip(ctx, 'chassis', pts, 0.007, 0.004, 'drl', [0, 1, 0]);
  }
  // Smoked screen rising from the beak.
  screen(ctx, 'chassis', {
    zs: stationsBetween(SCREEN_BASE, SCREEN_TOP_Z, 8, 0.35),
    top: curve([[SCREEN_BASE, 0.862], [-1.475, 0.918], [-1.38, 0.998], [-1.295, 1.062], [-1.24, 1.084], [SCREEN_TOP_Z, 1.088]]),
    bottom: curve([[SCREEN_BASE, 0.85], [-1.36, 0.903], [SCREEN_TOP_Z, 0.94]]),
    half: curve([[SCREEN_BASE, 0.145], [-1.415, 0.177], [-1.285, 0.162], [SCREEN_TOP_Z, 0.114]]),
    sections: [{ z: 0, pts: [[0, 1], [0.45, 0.985], [0.8, 0.93], [0.95, 0.8], [1, 0.55], [1, 0.25], [0.98, 0]] }],
  }, tint(F.screen, '#3a3f46'));
  buildTank(ctx, {
    front: -1.2,
    back: -0.605,
    top: 1.045,
    bottomFront: 0.89,
    bottomBack: 0.79,
    width: 0.43,
    style: 'sport',
    knee: 0.165,
    capZ: -0.94,
    topLine: [[-1.2, 0.942], [-1.11, 0.978], [-1.01, 1.018], [-0.91, 1.041], [-0.81, 1.042], [-0.71, 1.017], [-0.65, 0.958], [-0.605, 0.878]],
    bottomLine: [[-1.2, 0.89], [-1.02, 0.856], [-0.81, 0.82], [-0.605, 0.79]],
    halfLine: [[-1.2, 0.116], [-1.09, 0.174], [-0.96, 0.21], [-0.82, 0.207], [-0.7, 0.178], [-0.605, 0.116]],
  });
  buildSeat(ctx, { front: -0.645, back: -0.315, yFront: 0.835, y: 0.84, yBack: 0.876, width: 0.265, thick: 0.065, frontWidth: 0.168 });
  buildSeat(ctx, { front: -0.295, back: -0.09, yFront: 0.93, y: 0.942, yBack: 0.962, width: 0.165, thick: 0.04, frontWidth: 0.128 }, tint(seatFinish(ctx), '#161616'));
  const tb = tail();
  const tm = outlineLoft(tb, { su: ctx.seg(12, 4), sv: ctx.seg(6, 2), capBack: true });
  const seatHole: Field = fAnd(
    fOr(sideRegion([[-0.85, 0.815], [-0.307, 0.815], [-0.307, 1.4], [-0.85, 1.4]]), sideRegion([[-0.297, 0.91], [-0.08, 0.91], [-0.08, 1.4], [-0.297, 1.4]])),
    planRegion([[-0.85, -0.01], [-0.07, -0.01], [-0.07, 0.085], [-0.295, 0.085], [-0.305, 0.135], [-0.85, 0.135]]),
  );
  const split = fAnd(planRegion([[-0.055, -1], [0.2, -1], [0.2, 0.027], [-0.055, 0.011]]), (_x, y) => y - 0.895);
  const tailVent = sideRegion(smooth2([[-0.31, 0.78], [-0.13, 0.848], [-0.03, 0.895], [-0.07, 0.845], [-0.25, 0.762]], 3, true));
  addPanel(ctx, 'chassis', tm, fAnd(fNot(seatHole), fNot(split), fNot(tailVent)), PAINT, 0.0025, 0.012);
  undertray(ctx, { z0: -0.5, z1: 0.035, top0: 0.74, top1: 0.985, bot0: 0.69, botMid: 0.758, bot1: 0.945, w0: 0.133, w1: 0.05 });
  // LED tail lines along the lower edges of the two fins, meeting under the tip.
  for (const s of [-1, 1]) {
    const pts: P3[] = [];
    for (let i = 0; i <= 5; i++) {
      const z = -0.145 + (i / 5) * 0.195;
      pts.push([s * tb.half(z) * 0.98, tb.bottom(z) + 0.012, z]);
    }
    ledStrip(ctx, 'chassis', pts, 0.008, 0.005, 'tail', [0, 1, 0]);
  }
  tailLamp(ctx, smooth2([[-0.048, -0.004], [0.048, -0.004], [0.053, 0.004], [-0.053, 0.004]], 3, true), [0, 1.0, 0.045], -0.7, { depth: 0.02, rim: 0.002 });
  frontFender(ctx, { from: -0.68, to: 0.78, gap: 0.02, width: 0.145 });
  hugger(ctx, blackGloss);
  plateHanger(ctx, { fromZ: -0.13, fromY: 0.795 });
  fasteners(ctx, ob, [[-1.3, 0.85], [-1.03, 0.81], [-0.9, 0.56], [-1.05, 0.38], [-0.7, 0.33]]);
  exhaust(ctx);
}

/**
 * 2-1-2: the front header drops in front of the crankcase, the rear one runs down behind
 * the engine on the right; both join the pre-silencer box under the sump, which feeds the
 * twin-barrel silencer on the right.
 */
function exhaust(ctx: KitContext): void {
  const ports = veePorts(ctx);
  const c = ctx.bp.engine.crank;
  const lowY = 0.15;
  const box: P3 = [0.03, lowY, c[2] + 0.07];
  const r = 0.026;
  for (const p of ports) {
    const a = p.pos;
    const d = p.dir;
    const lead: P3 = [a[0] + d[0] * 0.05, a[1] + d[1] * 0.05, a[2] + d[2] * 0.05];
    if (p.front) {
      heatPipe(ctx, [a, lead, [0.02, a[1] - 0.11, a[2] - 0.035], [0.04, lowY + 0.07, c[2] - 0.24], [0.05, lowY + 0.02, c[2] - 0.12], [box[0] + 0.02, box[1], box[2] - 0.12]], r, 'steel', 0, 0.75);
    } else {
      heatPipe(ctx, [a, lead, [0.08, a[1] - 0.06, a[2] + 0.07], [0.14, a[1] - 0.2, a[2] + 0.085], [0.145, 0.32, c[2] + 0.3], [0.11, lowY + 0.06, c[2] + 0.2], [box[0] + 0.05, box[1] + 0.01, box[2] + 0.12]], r, 'steel', 0, 0.75);
    }
  }
  underBox(ctx, box, [0.22, 0.085, 0.3], hard('#1b1c1f', 0.4, 0.45, 0.2));
  // Link from the box to the twin barrels on the right, ahead of the rear wheel.
  const a: P3 = [0.135, 0.205, -0.615];
  const b: P3 = [0.155, 0.275, -0.335];
  heatPipe(ctx, [[box[0] + 0.06, box[1], box[2] + 0.13], [0.1, lowY + 0.02, box[2] + 0.2], [a[0] - 0.01, a[1] - 0.03, a[2] - 0.05], a], 0.03, 'steel', 0.75, 0.9);
  twinBarrelSilencer(ctx, { a, b, r: 0.04, gap: 0.075, finish: vary(F.steel, { rough: 0.28 }), shield: F.satinBlack });
  // Hanger to the right footrest plate.
  ctx.add('chassis', extrude(smooth2([[-0.5, 0.33], [-0.43, 0.36], [-0.42, 0.32], [-0.47, 0.27]], 2, true), 0.008, { plane: 'zy', center: 0.165, bevel: 0.002 }), F.castAlu);
  ctx.anchor('exhaustOutlet', b);
}

// ───────────────────────────── livery ─────────────────────────────

const ROSSO = '#c40b13';
const WHITE = '#f1f2f3';

function lettering(p: Pen, color: string, accent: string): void {
  if (p.view !== 'right' && p.view !== 'left') return;
  p.text('Panigale V2', -0.86, 0.43, { color, size: 0.046, italic: true, weight: '800', stretch: 1.04, stroke: accent === color ? undefined : accent });
  p.text('DUCATI', -1.53, 0.785, { color, size: 0.024, weight: '900', spacing: 0.06, italic: true });
  p.text('V2', -0.18, 0.86, { color, size: 0.03, weight: '900', italic: true });
}

function livery(c: LiveryCanvas, lv: Livery, env: LiveryEnv): void {
  const white = env.index === 1;
  c.views(ALL_VIEWS, (p) => {
    if (white) {
      // "White Rosso": pearl white with a red sweep along the lower fairing and the tail.
      p.fill(WHITE, 'pearl');
      if (p.view === 'right' || p.view === 'left') {
        p.poly([[-1.7, 0.62], [-1.35, 0.55], [-1.1, 0.4], [-0.9, 0.33], [-0.5, 0.31], [-0.5, -0.1], [-1.7, -0.1]], ROSSO, 'gloss');
        p.poly([[-0.62, 0.79], [0.1, 1.0], [0.1, 0.93], [-0.62, 0.75]], ROSSO, 'gloss');
        p.line([[-1.68, 0.775], [-1.4, 0.885], [-1.2, 0.918]], ROSSO, 0.006);
        lettering(p, '#1a1b1e', ROSSO);
      } else if (p.view === 'front') {
        p.rect(-1, -1, 1, 0.6, ROSSO, 'gloss');
      } else if (p.view === 'top') {
        p.rect(-1.02, -0.012, -0.66, 0.012, ROSSO);
      }
      return;
    }
    // Rosso Ducati: solid red under clear coat; dark grey belly shield, white lettering.
    p.fill(lv.primary === '#cc0a0a' ? ROSSO : lv.primary, 'gloss');
    if (p.view === 'right' || p.view === 'left') {
      p.poly([[-1.13, 0.27], [-0.92, 0.29], [-0.6, 0.3], [-0.4, 0.33], [-0.4, -0.1], [-1.2, -0.1]], '#1a1b1e', 'satin');
      lettering(p, '#f4f4f4', '#f4f4f4');
      p.line([[-1.65, 0.782], [-1.4, 0.89], [-1.21, 0.92]], '#f4f4f4', 0.003);
    } else if (p.view === 'front') {
      p.rect(-1, -1, 1, 0.3, '#1a1b1e', 'satin');
    }
  });
}

export function panigaleV2Blueprint(spec: BikeSpec): BikeBlueprint {
  const lv = spec.liveries[0];
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.056, 0.81, 1.11],
    wheelbase: 1.436,
    rakeDeg: 24,
    trail: 0.094,
    forkLength: 0.71,
    front: { tyre: '120/70ZR17', rimWidthIn: 3.5, crown: 0.82, tread: 'sport', tyreLabel: 'Rosso Corsa II' },
    rear: { tyre: '180/60ZR17', rimWidthIn: 5.5, crown: 0.92, tread: 'sport', tyreLabel: 'Rosso Corsa II' },
    frontWheel: { type: 'cast', spokes: 5, shape: 'y', color: lv.wheel === '#cc0a0a' ? '#b80c12' : '#18191c', machinedLip: false },
    rearWheel: { type: 'cast', spokes: 5, shape: 'y', color: lv.wheel === '#cc0a0a' ? '#b80c12' : '#18191c', machinedLip: false },
    fork: { type: 'usd', stanchion: 0.043, spacing: 0.208, outerColor: '#1d1e21', innerColor: '#c6a24e', footColor: '#1e1f22', capColor: '#2a2c30', adjusterColor: '#c99a2c', label: 'SHOWA', labelColor: '#d8dadd', aboveClamp: 0.008, clampGap: 0.195 },
    frontBrake: { discs: 2, discDia: 0.32, disc: 'floating', carrierColor: '#2a2c30', caliper: 'radialMono4', caliperColor: '#2f3136', caliperText: 'brembo', caliperTextColor: '#d01c1c', caliperAngleDeg: 78 },
    rearBrake: { discs: 1, discDia: 0.245, disc: 'fixed', carrierColor: '#2a2c30', caliper: 'axial2', caliperColor: '#2f3136', caliperAngleDeg: 200 },
    frame: { type: 'monocoque', color: '#1c1d20', metal: 0.7, rough: 0.45, subframe: 'cast', subframeColor: '#1c1d20', width: 0.31 },
    swingarm: { type: 'singleSided', length: 0.575, angleDeg: 11, side: 'left', color: '#1f2023', metal: 0.7, rough: 0.42 },
    shock: { layout: 'monoSide', springColor: '#c40b13', bodyColor: '#2a2c30', reservoir: true },
    drive: { type: 'chain', side: 'left', frontTeeth: 15, rearTeeth: 43, pitch: 0.015875, sprocketColor: '#1d1e21' },
    engine: {
      layout: 'L2',
      cc: 955,
      crank: [0, 0.35, -0.765],
      tiltDeg: 21,
      caseColor: '#232427',
      coverColor: '#2f3135',
      headColor: '#26272a',
      camCoverColor: '#1d1e21',
      camCoverText: 'DESMODROMIC',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.4, h: 0.32, z: -1.27, y: 0.64, tiltDeg: 20, curved: true },
      width: 0.31,
    },
    // Custom 2-1-2 with the twin-barrel silencer (see `exhaust` in the body builder).
    exhaust: { route: 'none', side: 'right', can: 'round', canLength: 0.29, canDia: 0.08, canFinish: 'steel', headerFinish: 'steel' },
    cockpit: {
      bars: 'clipon',
      grip: [0.325, 0.87, -0.995],
      barDia: 0.022,
      dash: 'tftDucati',
      dashPos: [0, 0.998, -1.122],
      dashSize: [0.106, 0.062],
      dashTiltDeg: 50,
      dashMount: 'fairing',
      mirrors: 'fairing',
      mirrorPos: [0.322, 0.975, -1.27],
      mirrorSize: [0.145, 0.056],
      mirrorIndicators: true,
      mirrorShape: 'sport',
      mirrorColor: '#0d0e10',
      topClamp: 'milled',
      steeringDamper: 'side',
      leverColor: '#1e1f22',
      reservoirs: true,
      clutch: 'hydraulic',
      ignition: 'clamp',
      switchColor: '#151618',
      gripColor: '#121212',
      barEndColor: '#1d1e21',
    },
    lights: { head: 'panigale', tail: 'panigale', rearIndicators: 'stalk' },
    seat: { height: 0.84, front: -0.645, back: -0.315, pillion: 'cowl', color: '#141414' },
    rider: { hip: [0, 0.93, -0.47], peg: [0.19, 0.39, -0.45], torsoPitch: 0.8 },
    footrests: 'rearset',
    plate: { mount: 'hanger', pos: [0, 0.6, 0.32], tiltDeg: -14 },
    body,
    livery,
    groundClearance: 0.12,
    features: [],
    zones: { splitY: 0.4, decal: [-0.95, 0.43] },
  };
}
