import * as THREE from 'three';
import type { BikeSpec, Livery } from '../../../data/bikes';
import { RX, RY, T, mul, type KitContext } from '../context';
import { addPanel, bodyQ, buildSeat, buildTank, frontFender, PAINT, screen, seatFinish } from '../kit/body';
import { lamp, ledStrip } from '../kit/lights';
import { hugger, plateHanger } from '../kit/rear';
import { curve, outlineLoft, sideAt, stationsBetween, type OutlineBody } from '../kit/shape';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv, type Pen } from '../livery';
import { extrude, lathe, smooth2, type P2, type P3 } from '../mesh';
import { F, hard, tint } from '../sink';
import { cut, fAnd, fNot, frontRegion, fOr, planRegion, sideRegion, type Field } from '../surface';
import type { BikeBlueprint } from '../types';

/**
 * Kawasaki Ninja H2 (2015+, current spec).
 * Spec sheet: wheelbase 1455 mm, rake 24.9°, trail 103 mm, seat 825 mm,
 * L×W×H 2085 × 770 × 1125 mm, 120/70ZR17 + 200/55ZR17, 43 mm USD fork,
 * steel trellis frame (Kawasaki green), single-sided swingarm on the left,
 * supercharged 998 cc inline four with the ram-air duct on the left.
 * Design cues: long pointed nose with a slim centre LED headlight, a big ram-air
 * intake low on the LEFT side of the nose only, short side fairings that expose
 * the green trellis and the supercharger, carbon wings on the upper cowl,
 * mirror-coated "Spark Black" paint, large right-side silencer.
 */

const NOSE = -1.7;
const SCREEN_BASE = -1.56;
const SCREEN_TOP_Z = -1.2;

/** Rear edge of the (short) side fairing: almost vertical just behind the radiator. */
const SIDE_EDGE: P2[] = [
  [-1.21, 0.985],
  [-1.12, 0.955],
  [-1.04, 0.89],
  [-0.99, 0.78],
  [-0.96, 0.64],
  [-0.95, 0.5],
  [-0.96, 0.38],
  [-0.99, 0.27],
  [-1.03, 0.19],
];

function fairing(): OutlineBody {
  const zs = [NOSE, -1.695, -1.685, -1.67, -1.65, -1.62, -1.58, -1.53, -1.47, -1.4, -1.32, -1.24, -1.16, -1.08, -1.0, -0.92];
  const face: P2[] = [[0, 1], [0.3, 0.95], [0.62, 0.84], [0.86, 0.66], [0.98, 0.44], [0.98, 0.22], [0.87, 0.05], [0.68, 0]];
  const cowl: P2[] = [[0, 1], [0.34, 0.985], [0.64, 0.93], [0.83, 0.79], [0.96, 0.6], [1, 0.38], [0.95, 0.12], [0.76, 0]];
  const side: P2[] = [[0, 1], [0.38, 0.99], [0.68, 0.95], [0.86, 0.82], [0.97, 0.6], [1, 0.36], [0.94, 0.1], [0.66, 0]];
  return {
    zs,
    top: curve([[NOSE, 0.775], [-1.67, 0.805], [-1.6, 0.842], [-1.5, 0.882], [-1.4, 0.915], [-1.29, 0.945], [-1.17, 0.962], [-1.04, 0.95], [-0.92, 0.9]]),
    bottom: curve([[NOSE, 0.762], [-1.692, 0.712], [-1.672, 0.672], [-1.635, 0.645], [-1.58, 0.624], [-1.5, 0.608], [-1.41, 0.52], [-1.3, 0.37], [-1.18, 0.25], [-1.05, 0.21], [-0.92, 0.23]]),
    half: curve([[NOSE, 0.01], [-1.69, 0.06], [-1.665, 0.11], [-1.62, 0.158], [-1.54, 0.205], [-1.44, 0.245], [-1.32, 0.275], [-1.18, 0.29], [-1.04, 0.288], [-0.92, 0.27]]),
    sections: [
      { z: NOSE, pts: face },
      { z: -1.6, pts: face },
      { z: -1.4, pts: cowl },
      { z: -1.0, pts: side },
    ],
  };
}

function tail(): OutlineBody {
  return {
    zs: stationsBetween(-0.7, 0.07, 13, 0.5),
    top: curve([[-0.7, 0.81], [-0.52, 0.82], [-0.34, 0.85], [-0.29, 0.91], [-0.14, 0.955], [0.0, 0.995], [0.07, 1.02]]),
    bottom: curve([[-0.7, 0.67], [-0.42, 0.7], [-0.2, 0.78], [-0.04, 0.89], [0.05, 0.965], [0.07, 0.99]]),
    half: curve([[-0.7, 0.15], [-0.5, 0.14], [-0.3, 0.12], [-0.1, 0.09], [0.07, 0.04]]),
    sections: [
      { z: -0.7, pts: [[0, 1], [0.6, 0.98], [0.95, 0.84], [1, 0.55], [0.93, 0.22], [0.6, 0.02], [0, 0]] },
      { z: 0.07, pts: [[0, 1], [0.7, 0.98], [1, 0.76], [0.99, 0.48], [0.86, 0.2], [0.45, 0.02], [0, 0]] },
    ],
  };
}

function body(ctx: KitContext): void {
  const ob = fairing();
  const q = bodyQ(ctx, 1.7);
  const master = outlineLoft(ob, { su: q.su, sv: q.sv, creases: [2], capFront: true });
  const blackGloss = hard('#0b0c0e', 0.15, 0.2, 1);
  const A = ctx.hp.frontAxle;
  const open = sideRegion([[-1.21, 2], ...SIDE_EDGE, [-0.6, 0.1], [-0.6, 2]]);
  const arch = (_x: number, y: number, z: number) => 0.36 - Math.hypot(z - A[2], y - A[1]);
  const underScreen = fAnd(planRegion([[SCREEN_BASE + 0.08, -1], [-1.06, -1], [-1.06, 0.15], [-1.36, 0.165], [SCREEN_BASE + 0.08, 0.11]]), (_x, y) => y - 0.86);
  // Slim centre headlight slot and the LEFT-only ram-air mouth in the chin.
  const headSlot = fAnd(frontRegion(smooth2([[0, 0.712], [0.05, 0.722], [0.085, 0.738], [0.09, 0.728], [0.05, 0.703], [0, 0.697]], 3, true)), (_x, _y, z) => -1.62 - z);
  const ramAir: Field = fAnd(frontRegion(smooth2([[-0.025, 0.684], [-0.07, 0.69], [-0.125, 0.676], [-0.14, 0.652], [-0.1, 0.632], [-0.04, 0.636], [-0.02, 0.655]], 3, true), false), (_x, _y, z) => -1.6 - z);
  const bodyCut = cut(master, fAnd(fNot(open), fNot(arch), fNot(underScreen), fNot(headSlot), fNot(ramAir)));
  const cowl = sideRegion([[-2, 2], [-1.36, 2], [-1.36, 0.94], [-1.39, 0.78], [-1.44, 0.66], [-1.5, 0.6], [-2, 0.58]]);
  const vent = sideRegion(smooth2([[-1.3, 0.8], [-1.12, 0.8], [-1.02, 0.72], [-1.02, 0.58], [-1.12, 0.53], [-1.26, 0.6]], 4, true));
  addPanel(ctx, 'chassis', bodyCut, cowl, PAINT, 0.003, 0.014);
  addPanel(ctx, 'chassis', bodyCut, fAnd(fNot(cowl), fNot(vent)), PAINT, 0.003, 0.014);
  // Side vents: black grille behind the radiator outlet.
  for (const s of [-1, 1]) {
    const p = sideAt(ob, -1.15, 0.66, s);
    ctx.add('chassis', extrude(smooth2([[-1.31, 0.81], [-1.11, 0.81], [-1.01, 0.73], [-1.01, 0.57], [-1.12, 0.52], [-1.27, 0.59]], 3, true), 0.006, { plane: 'zy', center: p.p[0] - s * 0.04 }), F.texturedBlack);
    for (let i = 0; i < 4; i++) {
      const y = 0.76 - i * 0.055;
      ctx.add('chassis', extrude([[-1.26, y], [-1.04, y - 0.01], [-1.04, y - 0.018], [-1.26, y - 0.008]], 0.026, { plane: 'zy', center: p.p[0] - s * 0.022 }), blackGloss);
    }
  }
  // Ram-air duct mouth (left): carbon lip around a dark throat.
  ctx.add('chassis', extrude(smooth2([[-0.13, 0.65], [-0.12, 0.68], [-0.07, 0.692], [-0.025, 0.686], [-0.02, 0.655], [-0.045, 0.632], [-0.1, 0.63]], 3, true), 0.14, { plane: 'xy', center: -1.545 }), F.texturedBlack);
  // Headlight: slim LED unit in the slot.
  const hl: P2[] = smooth2([[-0.085, 0.0], [-0.05, -0.012], [0.05, -0.012], [0.085, 0.0], [0.08, 0.01], [-0.08, 0.01]], 3, true);
  lamp(ctx, 'chassis', hl, mul(T(0, 0.716, -1.628), RY(Math.PI), RX(0.25)), { kind: 'head', inner: 'projector', count: 2, depth: 0.05, rim: 0.003 });
  // Position-light lines along the upper edge of the headlight slot.
  for (const s of [-1, 1]) {
    const pts: P3[] = [[s * 0.012, 0.728, -1.665], [s * 0.05, 0.734, -1.645], [s * 0.088, 0.744, -1.618]];
    ledStrip(ctx, 'chassis', pts, 0.006, 0.0035, 'drl', [0, 1, 0]);
  }
  // Carbon wings on the upper cowl sides.
  for (const s of [-1, 1]) {
    const p = sideAt(ob, -1.42, 0.83, s);
    const wing: P2[] = [[-1.5, 0.842], [-1.36, 0.84], [-1.33, 0.828], [-1.48, 0.83]];
    const m = extrude(wing, 0.07, { plane: 'zy', center: p.p[0] + s * 0.03, bevel: 0.002 });
    ctx.add('chassis', m, F.carbon);
  }
  // Inner panel under the screen.
  const inner = outlineLoft(
    {
      zs: stationsBetween(SCREEN_BASE + 0.06, -1.2, 6, 0.3),
      top: curve([[SCREEN_BASE + 0.06, 0.87], [-1.36, 0.9], [-1.2, 0.93]]),
      bottom: curve([[SCREEN_BASE + 0.06, 0.75], [-1.2, 0.8]]),
      half: curve([[SCREEN_BASE + 0.06, 0.15], [-1.36, 0.2], [-1.2, 0.24]]),
      sections: [{ z: 0, pts: [[0, 1], [0.5, 0.98], [0.86, 0.88], [0.98, 0.65], [1, 0.4], [0.97, 0.15], [0.9, 0]] }],
    },
    { su: ctx.seg(6, 2), sv: ctx.seg(4, 2) },
  );
  ctx.add('chassis', inner, F.texturedBlack);
  screen(ctx, 'chassis', {
    zs: stationsBetween(SCREEN_BASE, SCREEN_TOP_Z, 8, 0.35),
    top: curve([[SCREEN_BASE, 0.886], [-1.47, 0.93], [-1.38, 1.0], [-1.29, 1.07], [-1.23, 1.095], [SCREEN_TOP_Z, 1.1]]),
    bottom: curve([[SCREEN_BASE, 0.874], [-1.36, 0.92], [SCREEN_TOP_Z, 0.955]]),
    half: curve([[SCREEN_BASE, 0.15], [-1.42, 0.18], [-1.3, 0.165], [SCREEN_TOP_Z, 0.12]]),
    sections: [{ z: 0, pts: [[0, 1], [0.45, 0.985], [0.8, 0.93], [0.95, 0.8], [1, 0.55], [1, 0.25], [0.98, 0]] }],
  }, tint(F.screen, '#454b52'));
  buildTank(ctx, {
    front: -1.2,
    back: -0.63,
    top: 1.08,
    bottomFront: 0.9,
    bottomBack: 0.79,
    width: 0.46,
    style: 'sport',
    knee: 0.15,
    capZ: -0.94,
    topLine: [[-1.2, 0.96], [-1.11, 1.0], [-1.0, 1.05], [-0.9, 1.075], [-0.8, 1.07], [-0.71, 1.03], [-0.66, 0.96], [-0.63, 0.88]],
    bottomLine: [[-1.2, 0.9], [-1.0, 0.86], [-0.8, 0.82], [-0.63, 0.79]],
    halfLine: [[-1.2, 0.12], [-1.1, 0.19], [-0.97, 0.23], [-0.84, 0.228], [-0.72, 0.19], [-0.63, 0.12]],
  });
  buildSeat(ctx, { front: -0.67, back: -0.33, yFront: 0.82, y: 0.825, yBack: 0.86, width: 0.28, thick: 0.07, frontWidth: 0.18 });
  buildSeat(ctx, { front: -0.31, back: -0.08, yFront: 0.915, y: 0.928, yBack: 0.95, width: 0.18, thick: 0.045, frontWidth: 0.14 }, tint(seatFinish(ctx), '#161616'));
  const tb = tail();
  const tm = outlineLoft(tb, { su: ctx.seg(12, 4), sv: ctx.seg(6, 2), capBack: true });
  const seatHole: Field = fAnd(
    fOr(sideRegion([[-0.85, 0.8], [-0.322, 0.8], [-0.322, 1.4], [-0.85, 1.4]]), sideRegion([[-0.312, 0.9], [-0.07, 0.9], [-0.07, 1.4], [-0.312, 1.4]])),
    planRegion([[-0.85, -0.01], [-0.06, -0.01], [-0.06, 0.095], [-0.31, 0.095], [-0.32, 0.142], [-0.85, 0.142]]),
  );
  addPanel(ctx, 'chassis', tm, fNot(seatHole), PAINT, 0.0025, 0.012);
  const ut: OutlineBody = {
    zs: stationsBetween(-0.48, 0.05, 7, 0.4),
    top: curve([[-0.48, 0.72], [0.05, 0.97]]),
    bottom: curve([[-0.48, 0.67], [-0.12, 0.74], [0.05, 0.93]]),
    half: curve([[-0.48, 0.135], [0.05, 0.04]]),
    sections: [{ z: 0, pts: [[0, 1], [0.6, 0.95], [0.95, 0.7], [1, 0.45], [0.9, 0.2], [0.5, 0.02], [0, 0]] }],
  };
  ctx.add('chassis', outlineLoft(ut, { su: ctx.seg(5, 2), sv: ctx.seg(3, 2) }), F.texturedBlack);
  const tl: P2[] = smooth2([[-0.06, -0.006], [0.06, -0.006], [0.066, 0.004], [0.0, 0.01], [-0.066, 0.004]], 4, true);
  lamp(ctx, 'chassis', tl, mul(T(0, 0.968, 0.06), RX(-0.6)), { kind: 'tail', inner: 'led', count: 1, depth: 0.025, rim: 0.003, lensSmoked: true });
  frontFender(ctx, { from: -0.66, to: 0.8, gap: 0.02, width: 0.15 });
  hugger(ctx, blackGloss);
  plateHanger(ctx, { fromZ: -0.1, fromY: 0.78 });
  // Fuel-cap style filler and fasteners
  if (ctx.micro) {
    for (const s of [-1, 1]) {
      for (const [z, y] of [[-1.3, 0.86], [-1.06, 0.84], [-1.05, 0.35], [-1.25, 0.45]] as const) {
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
  p.text('H2', -1.18, 0.4, { color, size: 0.06, weight: '900', italic: true, stretch: 1.1 });
  p.text('Ninja', -0.24, 0.84, { color, size: 0.022, weight: '800', italic: true });
  p.text('KAWASAKI', -1.5, 0.78, { color, size: 0.02, weight: '900', spacing: 0.12 });
}

function livery(c: LiveryCanvas, _lv: Livery, _env: LiveryEnv): void {
  c.views(ALL_VIEWS, (p) => {
    // Mirror-coated Spark Black: a silver-black mirror layer under clear coat, black lower parts.
    p.fill('#8b929b', 'chrome');
    if (p.view === 'right' || p.view === 'left') {
      p.poly([[-1.36, 0.6], [-1.15, 0.42], [-0.9, 0.3], [-0.9, -0.1], [-1.6, -0.1], [-1.6, 0.52]], '#121316', 'gloss');
      p.poly([[-0.7, 0.67], [0.1, 0.92], [0.1, 0.6], [-0.7, 0.6]], '#121316', 'gloss');
      lettering(p, '#d9dde2');
    } else if (p.view === 'front') {
      p.rect(-1, -1, 1, 0.6, '#121316', 'gloss');
    } else if (p.view === 'top') {
      p.rect(-1.0, -0.035, -0.68, 0.035, '#1a1b1e', 'gloss');
    }
  });
}

export function ninjaH2Blueprint(_spec: BikeSpec): BikeBlueprint {
  return {
    id: _spec.id,
    source: 'authored',
    overall: [2.085, 0.77, 1.125],
    wheelbase: 1.455,
    rakeDeg: 24.9,
    trail: 0.103,
    forkLength: 0.73,
    front: { tyre: '120/70ZR17', rimWidthIn: 3.5, crown: 0.82, tread: 'sport', tyreLabel: 'Sport Radial S22' },
    rear: { tyre: '200/55ZR17', rimWidthIn: 6.0, crown: 0.92, tread: 'sport', tyreLabel: 'Sport Radial S22' },
    frontWheel: { type: 'cast', spokes: 5, shape: 'split', color: '#17181b', machinedLip: true },
    rearWheel: { type: 'cast', spokes: 5, shape: 'split', color: '#17181b', machinedLip: true },
    fork: { type: 'usd', stanchion: 0.043, spacing: 0.21, outerColor: '#2a2c30', innerColor: '#c4a560', footColor: '#1e1f22', capColor: '#2a2c30', adjusterColor: '#c99a2c', aboveClamp: 0.012, clampGap: 0.2 },
    frontBrake: { discs: 2, discDia: 0.33, disc: 'semiFloating', carrierColor: '#2a2c30', caliper: 'radialMono4', caliperColor: '#34363b', caliperText: 'brembo', caliperTextColor: '#d01c1c', caliperAngleDeg: 76 },
    rearBrake: { discs: 1, discDia: 0.25, disc: 'fixed', carrierColor: '#2a2c30', caliper: 'axial2', caliperColor: '#34363b', caliperAngleDeg: 205 },
    frame: { type: 'trellis', color: '#5fd02c', metal: 0.35, rough: 0.32, subframe: 'cast', subframeColor: '#1c1d20', width: 0.36 },
    swingarm: { type: 'singleSided', length: 0.6, angleDeg: 10, side: 'left', color: '#1d1e21', metal: 0.7, rough: 0.4 },
    shock: { layout: 'mono', springColor: '#e6c41c', bodyColor: '#c9a028', reservoir: true },
    drive: { type: 'chain', side: 'left', frontTeeth: 17, rearTeeth: 41, pitch: 0.015875, sprocketColor: '#1d1e21' },
    engine: {
      layout: 'I4',
      cc: 998,
      crank: [0, 0.4, -0.82],
      tiltDeg: 30,
      caseColor: '#202124',
      coverColor: '#34363b',
      headColor: '#26272a',
      camCoverColor: '#1c1d20',
      camCoverText: 'Kawasaki',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.44, h: 0.34, z: -1.26, y: 0.6, tiltDeg: 14, curved: true },
      supercharger: true,
      width: 0.42,
    },
    exhaust: { route: 'sideCan', side: 'right', can: 'round', canLength: 0.42, canDia: 0.13, canFinish: 'steel', headerFinish: 'steel', outlet: [0.17, 0.5, 0.06] },
    cockpit: {
      bars: 'clipon',
      grip: [0.335, 0.9, -1.0],
      barDia: 0.022,
      dash: 'tft',
      dashPos: [0, 1.02, -1.14],
      dashSize: [0.12, 0.07],
      dashTiltDeg: 50,
      dashMount: 'fairing',
      mirrors: 'fairing',
      mirrorPos: [0.345, 0.99, -1.28],
      mirrorSize: [0.15, 0.06],
      mirrorIndicators: true,
      mirrorShape: 'sport',
      mirrorColor: '#111214',
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
    lights: { head: 'custom', tail: 'compact', rearIndicators: 'stalk' },
    seat: { height: 0.825, front: -0.67, back: -0.33, pillion: 'seat', color: '#141414' },
    rider: { hip: [0, 0.915, -0.47], peg: [0.19, 0.39, -0.45], torsoPitch: 0.76 },
    footrests: 'rearset',
    plate: { mount: 'hanger', pos: [0, 0.6, 0.33], tiltDeg: -14 },
    body,
    livery,
    groundClearance: 0.13,
    features: ['winglets'],
    zones: { splitY: 0.4, decal: [-1.18, 0.4] },
  };
}
