import * as THREE from 'three';
import type { BikeSpec, Livery } from '../../../data/bikes';
import { RX, T, mul, type KitContext } from '../context';
import { addPanel, bodyQ, buildSeat, buildTank, frontFender, PAINT, screen } from '../kit/body';
import { hugger } from '../kit/rear';
import { curve, outlineLoft, sideAt, stationsBetween, surfaceAt, type OutlineBody } from '../kit/shape';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv, type Pen } from '../livery';
import { extrude, lathe, smooth2, type P2 } from '../mesh';
import { F, hard, tint } from '../sink';
import { cut, fAnd, fNot, frontRegion, planRegion, sideRegion, type Field } from '../surface';
import type { BikeBlueprint } from '../types';

/**
 * Kawasaki Ninja H2R (2019+ spec, track only).
 * Spec sheet: wheelbase 1450 mm, rake 25.1°, trail 108 mm, seat 830 mm,
 * L×W×H 2070 × 850 × 1160 mm (the width is the wings), ground clearance 130 mm,
 * racing slicks 120/600R17 + 190/650R17 on 3.50 / 6.00 rims (modelled with the
 * equivalent 120/70 + 190/55 sizes), 43 mm KYB AOS-II fork, Öhlins TTX36 shock,
 * Brembo Stylema calipers on 330 mm discs, green steel trellis, single-sided swingarm
 * on the left, supercharged 998 cc inline four with the ram-air duct on the left.
 * Design cues versus the road H2: carbon upper cowl with two-element carbon wings
 * on each side and small lower wings, no headlight / mirrors / indicators / plate /
 * tail light, solo-seat tail, dark screen, short fat open megaphone silencer on the
 * right and mirror-chrome "Spark Black" paint on the side panels, tank and tail.
 */

const NOSE = -1.69;
const SCREEN_BASE = -1.55;
const SCREEN_TOP_Z = -1.17;

/** Rear edge of the (short) side fairing: almost vertical just behind the radiator. */
const SIDE_EDGE: P2[] = [
  [-1.2, 0.985],
  [-1.11, 0.955],
  [-1.03, 0.89],
  [-0.98, 0.78],
  [-0.95, 0.64],
  [-0.94, 0.5],
  [-0.95, 0.38],
  [-0.98, 0.27],
  [-1.02, 0.19],
];

function fairing(): OutlineBody {
  const zs = [NOSE, -1.685, -1.675, -1.66, -1.64, -1.61, -1.57, -1.52, -1.46, -1.39, -1.31, -1.23, -1.15, -1.07, -0.99, -0.91];
  const face: P2[] = [[0, 1], [0.3, 0.95], [0.62, 0.84], [0.86, 0.66], [0.98, 0.44], [0.9, 0.21], [0.56, 0.045], [0, 0]];
  const cowl: P2[] = [[0, 1], [0.34, 0.985], [0.64, 0.93], [0.83, 0.79], [0.96, 0.6], [1, 0.38], [0.95, 0.12], [0.76, 0]];
  const side: P2[] = [[0, 1], [0.38, 0.99], [0.68, 0.95], [0.86, 0.82], [0.97, 0.6], [1, 0.36], [0.94, 0.1], [0.66, 0]];
  return {
    zs,
    top: curve([[NOSE, 0.772], [-1.66, 0.802], [-1.59, 0.84], [-1.49, 0.88], [-1.39, 0.913], [-1.28, 0.943], [-1.16, 0.96], [-1.03, 0.948], [-0.91, 0.9]]),
    bottom: curve([[NOSE, 0.758], [-1.682, 0.71], [-1.662, 0.67], [-1.625, 0.643], [-1.57, 0.622], [-1.49, 0.606], [-1.4, 0.52], [-1.29, 0.37], [-1.17, 0.25], [-1.04, 0.21], [-0.91, 0.23]]),
    half: curve([[NOSE, 0.01], [-1.68, 0.06], [-1.655, 0.11], [-1.61, 0.158], [-1.53, 0.205], [-1.43, 0.245], [-1.31, 0.275], [-1.17, 0.29], [-1.03, 0.288], [-0.91, 0.27]]),
    sections: [
      { z: NOSE, pts: face },
      { z: -1.59, pts: face },
      { z: -1.39, pts: cowl },
      { z: -0.99, pts: side },
    ],
  };
}

/** Solo-seat tail: the pillion area is covered by a raised seat cowl. */
function tail(): OutlineBody {
  return {
    zs: stationsBetween(-0.7, 0.06, 13, 0.5),
    top: curve([[-0.7, 0.81], [-0.52, 0.82], [-0.36, 0.85], [-0.3, 0.925], [-0.2, 0.968], [-0.06, 0.99], [0.02, 1.0], [0.06, 1.005]]),
    bottom: curve([[-0.7, 0.67], [-0.42, 0.7], [-0.2, 0.78], [-0.04, 0.89], [0.04, 0.955], [0.06, 0.975]]),
    half: curve([[-0.7, 0.15], [-0.5, 0.14], [-0.3, 0.122], [-0.1, 0.092], [0.06, 0.04]]),
    sections: [
      { z: -0.7, pts: [[0, 1], [0.6, 0.98], [0.95, 0.84], [1, 0.55], [0.93, 0.22], [0.6, 0.02], [0, 0]] },
      { z: 0.06, pts: [[0, 1], [0.7, 0.98], [1, 0.76], [0.99, 0.48], [0.86, 0.2], [0.45, 0.02], [0, 0]] },
    ],
  };
}

/**
 * Carbon wing element: plan-view outline (x, z) extruded in Y, pitched so the trailing
 * edge sits higher than the leading edge (downforce), with a rounded leading edge.
 */
function wingBlade(ctx: KitContext, s: number, rootX: number, tipX: number, y: number, zLead: number, chord: number, sweep: number, thick: number, pitch: number): void {
  const tipChord = chord * 0.72;
  const plan: P2[] = smooth2(
    [
      [rootX, zLead],
      [(rootX + tipX) / 2, zLead + sweep * 0.5 - 0.004],
      [tipX, zLead + sweep],
      [tipX + 0.006, zLead + sweep + tipChord * 0.5],
      [tipX, zLead + sweep + tipChord],
      [rootX, zLead + chord],
    ],
    ctx.micro ? 3 : 2,
    true,
  ).map(([x, z]) => [s * x, z] as P2);
  const m = extrude(s > 0 ? plan : [...plan].reverse(), thick, { plane: 'xz', center: 0, bevel: thick * 0.4, bevelSegs: 2, curveSegs: 1 });
  ctx.add('chassis', m, F.carbon, mul(T(0, y, zLead), RX(-pitch), T(0, 0, -zLead)));
}

function body(ctx: KitContext): void {
  const ob = fairing();
  const q = bodyQ(ctx, 1.7);
  const master = outlineLoft(ob, { su: q.su, sv: q.sv, creases: [2], capFront: true });
  const blackGloss = hard('#0b0c0e', 0.15, 0.2, 1);
  const A = ctx.hp.frontAxle;
  const open = sideRegion([[-1.2, 2], ...SIDE_EDGE, [-0.6, 0.1], [-0.6, 2]]);
  const arch = (_x: number, y: number, z: number) => 0.36 - Math.hypot(z - A[2], y - A[1]);
  const underScreen = fAnd(planRegion([[SCREEN_BASE + 0.08, -1], [-1.05, -1], [-1.05, 0.15], [-1.35, 0.165], [SCREEN_BASE + 0.08, 0.11]]), (_x, y) => y - 0.86);
  // The road bike's headlight slot is blanked on the H2R: a narrow dark air slot remains.
  const nosSlot = fAnd(frontRegion(smooth2([[0, 0.71], [0.04, 0.716], [0.075, 0.73], [0.078, 0.722], [0.04, 0.703], [0, 0.699]], 3, true)), (_x, _y, z) => -1.61 - z);
  // Ram-air mouth: LEFT side of the chin only.
  const ramAir: Field = fAnd(frontRegion(smooth2([[-0.025, 0.684], [-0.07, 0.69], [-0.125, 0.676], [-0.14, 0.652], [-0.1, 0.632], [-0.04, 0.636], [-0.02, 0.655]], 3, true), false), (_x, _y, z) => -1.59 - z);
  const bodyCut = cut(master, fAnd(fNot(open), fNot(arch), fNot(underScreen), fNot(nosSlot), fNot(ramAir)));
  // Carbon upper cowl (nose → screen corners → behind the wing roots) and mirror-chrome side panels.
  const cowl = sideRegion([[-2, 2], [-1.3, 2], [-1.3, 0.94], [-1.34, 0.8], [-1.4, 0.69], [-1.48, 0.61], [-2, 0.58]]);
  const vent = sideRegion(smooth2([[-1.29, 0.8], [-1.11, 0.8], [-1.01, 0.72], [-1.01, 0.58], [-1.11, 0.53], [-1.25, 0.6]], 4, true));
  addPanel(ctx, 'chassis', bodyCut, cowl, F.carbon, 0.003, 0.014);
  addPanel(ctx, 'chassis', bodyCut, fAnd(fNot(cowl), fNot(vent)), PAINT, 0.003, 0.014);
  // Side vents: black grille behind the radiator outlet.
  for (const s of [-1, 1]) {
    const p = sideAt(ob, -1.14, 0.66, s);
    ctx.add('chassis', extrude(smooth2([[-1.3, 0.81], [-1.1, 0.81], [-1.0, 0.73], [-1.0, 0.57], [-1.11, 0.52], [-1.26, 0.59]], 3, true), 0.006, { plane: 'zy', center: p.p[0] - s * 0.04 }), F.texturedBlack);
    for (let i = 0; i < 4; i++) {
      const y = 0.76 - i * 0.055;
      ctx.add('chassis', extrude([[-1.25, y], [-1.03, y - 0.01], [-1.03, y - 0.018], [-1.25, y - 0.008]], 0.026, { plane: 'zy', center: p.p[0] - s * 0.022 }), blackGloss);
    }
  }
  // Ram-air duct throat (left) and the blanked slot.
  ctx.add('chassis', extrude(smooth2([[-0.13, 0.65], [-0.12, 0.68], [-0.07, 0.692], [-0.025, 0.686], [-0.02, 0.655], [-0.045, 0.632], [-0.1, 0.63]], 3, true), 0.14, { plane: 'xy', center: -1.535 }), F.texturedBlack);
  ctx.add('chassis', extrude(smooth2([[-0.078, 0.722], [-0.04, 0.703], [0.04, 0.703], [0.078, 0.722], [0.075, 0.73], [0.0, 0.716], [-0.075, 0.73]], 3, true), 0.07, { plane: 'xy', center: -1.6 }), F.texturedBlack);
  // Two-element carbon wings on the upper cowl with end plates (the H2R's widest point).
  for (const s of [-1, 1]) {
    const root = sideAt(ob, -1.47, 0.8, s);
    const rx = Math.abs(root.p[0]) - 0.01;
    const tipX = 0.425;
    wingBlade(ctx, s, rx, tipX, 0.838, -1.52, 0.13, 0.06, 0.009, 0.16);
    wingBlade(ctx, s, rx + 0.012, tipX, 0.79, -1.5, 0.115, 0.055, 0.008, 0.2);
    // End plate joining both elements.
    const plate: P2[] = smooth2([[-1.47, 0.765], [-1.38, 0.775], [-1.35, 0.82], [-1.37, 0.872], [-1.45, 0.865], [-1.48, 0.8]], 3, true);
    ctx.add('chassis', extrude(plate, 0.006, { plane: 'zy', center: s * (tipX + 0.002), bevel: 0.002 }), F.carbon);
    // Small single-element lower wing ahead of the radiator vent.
    const low = sideAt(ob, -1.37, 0.6, s);
    wingBlade(ctx, s, Math.abs(low.p[0]) - 0.01, Math.abs(low.p[0]) + 0.075, 0.6, -1.4, 0.09, 0.035, 0.007, 0.22);
  }
  // Inner panel under the screen.
  const inner = outlineLoft(
    {
      zs: stationsBetween(SCREEN_BASE + 0.06, -1.19, 6, 0.3),
      top: curve([[SCREEN_BASE + 0.06, 0.87], [-1.35, 0.9], [-1.19, 0.93]]),
      bottom: curve([[SCREEN_BASE + 0.06, 0.75], [-1.19, 0.8]]),
      half: curve([[SCREEN_BASE + 0.06, 0.15], [-1.35, 0.2], [-1.19, 0.24]]),
      sections: [{ z: 0, pts: [[0, 1], [0.5, 0.98], [0.86, 0.88], [0.98, 0.65], [1, 0.4], [0.97, 0.15], [0.9, 0]] }],
    },
    { su: ctx.seg(6, 2), sv: ctx.seg(4, 2) },
  );
  ctx.add('chassis', inner, F.texturedBlack);
  // Dark-tinted race screen, a little taller than the road bike's.
  screen(ctx, 'chassis', {
    zs: stationsBetween(SCREEN_BASE, SCREEN_TOP_Z, 8, 0.35),
    top: curve([[SCREEN_BASE, 0.886], [-1.46, 0.94], [-1.37, 1.02], [-1.28, 1.1], [-1.21, 1.13], [SCREEN_TOP_Z, 1.138]]),
    bottom: curve([[SCREEN_BASE, 0.874], [-1.35, 0.92], [SCREEN_TOP_Z, 0.955]]),
    half: curve([[SCREEN_BASE, 0.15], [-1.41, 0.18], [-1.29, 0.165], [SCREEN_TOP_Z, 0.12]]),
    sections: [{ z: 0, pts: [[0, 1], [0.45, 0.985], [0.8, 0.93], [0.95, 0.8], [1, 0.55], [1, 0.25], [0.98, 0]] }],
  }, tint(F.screen, '#2a2e33'));
  buildTank(ctx, {
    front: -1.19,
    back: -0.63,
    top: 1.08,
    bottomFront: 0.9,
    bottomBack: 0.79,
    width: 0.46,
    style: 'sport',
    knee: 0.15,
    capZ: -0.94,
    topLine: [[-1.19, 0.96], [-1.1, 1.0], [-0.99, 1.05], [-0.9, 1.075], [-0.8, 1.07], [-0.71, 1.03], [-0.66, 0.96], [-0.63, 0.88]],
    bottomLine: [[-1.19, 0.9], [-1.0, 0.86], [-0.8, 0.82], [-0.63, 0.79]],
    halfLine: [[-1.19, 0.12], [-1.1, 0.19], [-0.97, 0.23], [-0.84, 0.228], [-0.72, 0.19], [-0.63, 0.12]],
  });
  // Solo race seat (grippy suede-like cover).
  buildSeat(ctx, { front: -0.67, back: -0.32, yFront: 0.825, y: 0.83, yBack: 0.865, width: 0.27, thick: 0.065, frontWidth: 0.18 }, hard('#141414', 0, 0.92));
  const tb = tail();
  const tm = outlineLoft(tb, { su: ctx.seg(12, 4), sv: ctx.seg(6, 2), capBack: true });
  const seatHole: Field = fAnd(sideRegion([[-0.85, 0.8], [-0.31, 0.8], [-0.31, 1.4], [-0.85, 1.4]]), planRegion([[-0.85, -0.01], [-0.31, -0.01], [-0.31, 0.142], [-0.85, 0.142]]));
  // Solo cowl panel line across the old pillion area.
  const cowlLine = sideRegion([[-0.31, 2], [0.2, 2], [0.2, 0.9], [-0.31, 0.88]]);
  addPanel(ctx, 'chassis', tm, fAnd(fNot(seatHole), fNot(cowlLine)), PAINT, 0.0025, 0.012);
  addPanel(ctx, 'chassis', tm, fAnd(fNot(seatHole), cowlLine), PAINT, 0.0025, 0.012);
  // Open undertray (no lights, no plate): black, the subframe shows underneath.
  const ut: OutlineBody = {
    zs: stationsBetween(-0.46, 0.04, 6, 0.4),
    top: curve([[-0.46, 0.72], [0.04, 0.96]]),
    bottom: curve([[-0.46, 0.68], [-0.12, 0.75], [0.04, 0.93]]),
    half: curve([[-0.46, 0.13], [0.04, 0.04]]),
    sections: [{ z: 0, pts: [[0, 1], [0.6, 0.95], [0.95, 0.7], [1, 0.45], [0.9, 0.2], [0.5, 0.02], [0, 0]] }],
  };
  ctx.add('chassis', outlineLoft(ut, { su: ctx.seg(5, 2), sv: ctx.seg(3, 2) }), F.texturedBlack);
  frontFender(ctx, { from: -0.66, to: 0.8, gap: 0.02, width: 0.15, f: F.carbon });
  hugger(ctx, F.carbon);
  // Open megaphone: polished rim and a dark throat over the end of the kit silencer.
  const out = ctx.anchors.get('exhaustOutlet');
  if (out) {
    const ex = ctx.bp.exhaust;
    const lowY = Math.max(0.15, (ctx.bp.groundClearance ?? 0.13) + 0.04);
    const pv = ctx.hp.pivot;
    const s0 = new THREE.Vector3(0.15, lowY + 0.14, pv[2] + 0.02);
    const B = new THREE.Vector3(...out);
    const d = B.clone().sub(s0).normalize();
    const r = ex.canDia / 2;
    const q4 = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    const m = new THREE.Matrix4().compose(B.clone().addScaledVector(d, 0.001), q4, new THREE.Vector3(1, 1, 1));
    const segs = ctx.seg(28, 12);
    ctx.add('chassis', lathe([[r * 0.86, -0.004], [r * 1.005, -0.004], [r * 1.02, 0.004], [r * 0.9, 0.006], [r * 0.84, 0.0]], { segs, axis: 'y' }), F.polishedAlu, m);
    ctx.add('chassis', lathe([[r * 0.86, 0.0], [r * 0.6, -0.08], [0, -0.1]], { segs, axis: 'y' }), hard('#0a0a0a', 0.2, 0.85), m);
  }
  // Cowl fasteners (Dzus-style race fasteners)
  if (ctx.micro) {
    for (const s of [-1, 1]) {
      for (const [z, y] of [[-1.29, 0.86], [-1.05, 0.84], [-1.04, 0.35], [-1.24, 0.45]] as const) {
        const sp = sideAt(ob, z, y, s);
        const mm = new THREE.Matrix4().lookAt(new THREE.Vector3(), new THREE.Vector3(...sp.n).negate(), new THREE.Vector3(0, 1, 0));
        mm.setPosition(sp.p[0] + sp.n[0] * 0.001, sp.p[1], sp.p[2]);
        ctx.add('chassis', lathe([[0, 0], [0.0065, 0], [0.006, 0.0025], [0, 0.003]], { segs: 10, axis: 'z' }), F.brushedAlu, mm);
      }
    }
    // Kawasaki river-mark emblem on the nose (above the blanked slot).
    const em = surfaceAt(ob, -1.635, 0);
    ctx.add('chassis', lathe([[0, 0.002], [0.016, 0.002], [0.018, 0.0]], { segs: 16, axis: 'y' }), F.chrome, mul(T(0, em.p[1] - 0.0005, -1.635), RX(Math.atan2(-em.n[2], em.n[1]))));
  }
}

function lettering(p: Pen, color: string): void {
  if (p.view !== 'right' && p.view !== 'left') return;
  p.text('H2R', -1.17, 0.42, { color, size: 0.07, weight: '900', italic: true, stretch: 1.12 });
  p.text('Ninja', -0.18, 0.86, { color, size: 0.024, weight: '800', italic: true });
  p.text('KAWASAKI', -0.92, 0.985, { color, size: 0.018, weight: '900', spacing: 0.12 });
}

function livery(c: LiveryCanvas, _lv: Livery, _env: LiveryEnv): void {
  c.views(ALL_VIEWS, (p) => {
    // Mirror-coated Spark Black: a bright silver mirror layer under a lightly tinted clear coat.
    p.fill('#a3a9b1', 'chrome');
    if (p.view === 'right' || p.view === 'left') {
      // Dark lower edges of the side panels and tail, black wing-to-tank accent line.
      p.poly([[-1.36, 0.58], [-1.15, 0.4], [-0.9, 0.3], [-0.9, -0.1], [-1.6, -0.1], [-1.6, 0.5]], '#141518', 'gloss');
      p.poly([[-0.7, 0.68], [0.1, 0.93], [0.1, 0.6], [-0.7, 0.6]], '#141518', 'gloss');
      p.line([[-1.3, 0.9], [-1.1, 0.93], [-0.98, 0.83]], '#5fd02c', 0.005);
      lettering(p, '#16171a');
    } else if (p.view === 'front') {
      p.rect(-1, -1, 1, 0.6, '#141518', 'gloss');
    } else if (p.view === 'top') {
      p.rect(-1.0, -0.035, -0.68, 0.035, '#1a1b1e', 'gloss');
      p.text('H2R', -0.1, 0, { color: '#16171a', size: 0.05, weight: '900', italic: true, rotate: Math.PI / 2 });
    }
  });
}

export function ninjaH2RBlueprint(spec: BikeSpec): BikeBlueprint {
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.07, 0.85, 1.16],
    wheelbase: 1.45,
    rakeDeg: 25.1,
    trail: 0.108,
    forkLength: 0.73,
    front: { tyre: '120/70ZR17', rimWidthIn: 3.5, crown: 0.78, tread: 'slickish', tyreLabel: 'Racing Slick' },
    rear: { tyre: '190/55ZR17', rimWidthIn: 6.0, crown: 0.86, tread: 'slickish', tyreLabel: 'Racing Slick' },
    frontWheel: { type: 'cast', spokes: 5, shape: 'split', color: '#17181b', machinedLip: true },
    rearWheel: { type: 'cast', spokes: 5, shape: 'split', color: '#17181b', machinedLip: true },
    fork: { type: 'usd', stanchion: 0.043, spacing: 0.21, outerColor: '#2a2c30', innerColor: '#c4a560', footColor: '#1e1f22', capColor: '#2a2c30', adjusterColor: '#c99a2c', label: 'AOS-II', labelColor: '#d8d8d8', aboveClamp: 0.012, clampGap: 0.2 },
    frontBrake: { discs: 2, discDia: 0.33, disc: 'semiFloating', carrierColor: '#2a2c30', caliper: 'radialMono4', caliperColor: '#3a3c40', caliperText: 'brembo', caliperTextColor: '#d01c1c', caliperAngleDeg: 76 },
    rearBrake: { discs: 1, discDia: 0.25, disc: 'fixed', carrierColor: '#2a2c30', caliper: 'axial2', caliperColor: '#34363b', caliperAngleDeg: 205 },
    frame: { type: 'trellis', color: '#5fd02c', metal: 0.35, rough: 0.32, subframe: 'cast', subframeColor: '#1c1d20', width: 0.36 },
    swingarm: { type: 'singleSided', length: 0.6, angleDeg: 10, side: 'left', color: '#1d1e21', metal: 0.7, rough: 0.4 },
    // Öhlins TTX36: yellow spring, gold body.
    shock: { layout: 'mono', springColor: '#e8c51a', bodyColor: '#c9a028', reservoir: true },
    drive: { type: 'chain', side: 'left', frontTeeth: 17, rearTeeth: 40, pitch: 0.015875, sprocketColor: '#1d1e21' },
    engine: {
      layout: 'I4',
      cc: 998,
      crank: [0, 0.4, -0.815],
      tiltDeg: 30,
      caseColor: '#202124',
      coverColor: '#34363b',
      headColor: '#26272a',
      camCoverColor: '#1c1d20',
      camCoverText: 'Kawasaki',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.44, h: 0.34, z: -1.25, y: 0.6, tiltDeg: 14, curved: true },
      supercharger: true,
      width: 0.42,
    },
    // Short, fat, open megaphone (no baffles) on the right.
    exhaust: { route: 'sideCan', side: 'right', can: 'megaphone', canLength: 0.4, canDia: 0.155, canFinish: 'steel', headerFinish: 'steel', outlet: [0.185, 0.5, 0.0] },
    cockpit: {
      bars: 'clipon',
      grip: [0.33, 0.9, -0.995],
      barDia: 0.022,
      dash: 'tft',
      dashPos: [0, 1.02, -1.135],
      dashSize: [0.12, 0.07],
      dashTiltDeg: 50,
      dashMount: 'fairing',
      mirrors: 'none',
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
    lights: { head: 'custom', tail: 'custom', rearIndicators: 'integrated' },
    seat: { height: 0.83, front: -0.67, back: -0.32, pillion: 'cowl', color: '#141414' },
    rider: { hip: [0, 0.915, -0.47], peg: [0.19, 0.4, -0.44], torsoPitch: 0.8 },
    footrests: 'rearset',
    plate: { mount: 'body', pos: [0, 0.8, 0.05], tiltDeg: 0 },
    body,
    livery,
    groundClearance: 0.13,
    features: ['winglets'],
    zones: { splitY: 0.4, decal: [-1.17, 0.42] },
  };
}
