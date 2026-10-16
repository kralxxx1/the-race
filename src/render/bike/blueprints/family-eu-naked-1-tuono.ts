import type { BikeSpec, Livery } from '../../../data/bikes';
import type { KitContext } from '../context';
import { addPanel, bodyQ, buildSeat, buildTank, frontFender, PAINT, screen, seatFinish } from '../kit/body';
import { bladeSlats, ductLiner, faceLamps, fasteners, frontHit, innerCowl, mirrorLoop, tailLamp, undertray } from '../kit/jp-sport-parts';
import { ledStrip } from '../kit/lights';
import { hugger, plateHanger } from '../kit/rear';
import { curve, outlineLoft, sideAt, stationsBetween, type OutlineBody } from '../kit/shape';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv, type Pen } from '../livery';
import { extrude, smooth2, type P2, type P3 } from '../mesh';
import { F, hard, tint } from '../sink';
import { cut, fAnd, fNot, fOr, frontRegion, planRegion, sideRegion, type Field } from '../surface';
import type { BikeBlueprint } from '../types';

/**
 * Aprilia Tuono V4 Factory (2021+).
 * Spec sheet: wheelbase 1452 mm, rake 24.7°, trail 100 mm, seat 837 mm, 120/70ZR17 +
 * 200/55ZR17 on 3.50 / 6.00 in wheels, Öhlins Smart EC 2.0 NIX 43 mm fork and TTX shock,
 * 2 × 330 mm discs with Brembo Stylema monoblocs, 220 mm rear disc, aluminium twin-spar frame,
 * 1077 cc 65° V4, under-braced aluminium swingarm, 4-2-1 exhaust into a short right silencer.
 * Design cues: the RSV4-derived frame-mounted half fairing with the triple LED headlight (a
 * small centre unit between two lamps framed by DRL eyebrows), a short smoked screen, the
 * double-wall side panels whose inner wall forms the integrated wing, a tall tubular bar, an
 * RSV4-style sculpted tank and the razor tail.
 */

const NOSE = -1.415;
const SCREEN_BASE = -1.35;
const SCREEN_TOP_Z = -1.16;

/** Rear edge of the half fairing's side panel (tank front → lower corner beside the radiator). */
const SIDE_EDGE: P2[] = [
  [-1.08, 0.99],
  [-1.0, 0.93],
  [-0.95, 0.85],
  [-0.95, 0.74],
  [-0.99, 0.64],
  [-1.04, 0.57],
];

function fairing(): OutlineBody {
  const zs = [NOSE, -1.412, -1.405, -1.394, -1.378, -1.355, -1.325, -1.285, -1.235, -1.175, -1.11, -1.045, -0.98, -0.93];
  const face: P2[] = [[0, 1], [0.26, 0.96], [0.56, 0.85], [0.84, 0.66], [0.98, 0.44], [0.9, 0.2], [0.56, 0.04], [0, 0]];
  const cowl: P2[] = [[0, 1], [0.34, 0.985], [0.64, 0.93], [0.84, 0.8], [0.96, 0.6], [1, 0.38], [0.96, 0.14], [0.86, 0]];
  const side: P2[] = [[0, 1], [0.38, 0.99], [0.68, 0.95], [0.87, 0.82], [0.97, 0.6], [1, 0.36], [0.98, 0.12], [0.93, 0]];
  return {
    zs,
    top: curve([[NOSE, 0.86], [-1.4, 0.885], [-1.37, 0.905], [-1.32, 0.925], [-1.24, 0.95], [-1.14, 0.975], [-1.04, 0.99], [-0.93, 0.98]]),
    bottom: curve([[NOSE, 0.838], [-1.408, 0.79], [-1.39, 0.75], [-1.355, 0.715], [-1.3, 0.685], [-1.22, 0.64], [-1.13, 0.58], [-1.04, 0.55], [-0.93, 0.55]]),
    half: curve([[NOSE, 0.014], [-1.408, 0.07], [-1.39, 0.12], [-1.36, 0.165], [-1.31, 0.205], [-1.24, 0.235], [-1.14, 0.252], [-1.04, 0.255], [-0.93, 0.245]]),
    sections: [
      { z: NOSE, pts: face },
      { z: -1.36, pts: face },
      { z: -1.24, pts: cowl },
      { z: -1.05, pts: side },
      { z: -0.93, pts: side },
    ],
  };
}

function tail(): OutlineBody {
  return {
    zs: stationsBetween(-0.62, 0.06, 13, 0.5),
    top: curve([[-0.62, 0.83], [-0.48, 0.845], [-0.34, 0.87], [-0.29, 0.925], [-0.14, 0.955], [-0.02, 0.985], [0.06, 1.01]]),
    bottom: curve([[-0.62, 0.7], [-0.42, 0.73], [-0.2, 0.8], [-0.04, 0.89], [0.03, 0.955], [0.06, 0.985]]),
    half: curve([[-0.62, 0.145], [-0.46, 0.135], [-0.26, 0.112], [-0.06, 0.078], [0.06, 0.028]]),
    sections: [
      { z: -0.62, pts: [[0, 1], [0.6, 0.98], [0.95, 0.84], [1, 0.55], [0.93, 0.22], [0.6, 0.02], [0, 0]] },
      { z: 0.06, pts: [[0, 1], [0.74, 0.97], [1, 0.72], [0.98, 0.44], [0.84, 0.2], [0.42, 0.02], [0, 0]] },
    ],
  };
}

/** Side lamp (right): rounded trapezoid, outer end lifted. */
const LAMP: P2[] = smooth2([[0.045, 0.79], [0.1, 0.795], [0.122, 0.812], [0.112, 0.83], [0.062, 0.826], [0.044, 0.81]], 2, true);
/** Small centre lamp under the screen base. */
const CENTRE: P2[] = smooth2([[-0.024, 0.786], [0.024, 0.786], [0.03, 0.8], [0.02, 0.814], [-0.02, 0.814], [-0.03, 0.8]], 2, true);
/** Central air intake below the centre lamp. */
const INTAKE: P2[] = [[0, 0.776], [0.022, 0.774], [0.034, 0.762], [0.026, 0.748], [0.012, 0.742], [0, 0.742]];
/** Side duct holding the integrated wing (double-wall side panel). */
const WING_DUCT: P2[] = [[-1.22, 0.705], [-1.1, 0.735], [-1.0, 0.735], [-0.985, 0.665], [-1.06, 0.62], [-1.18, 0.635]];

function body(ctx: KitContext): void {
  const ob = fairing();
  const q = bodyQ(ctx, 1.5);
  const master = outlineLoft(ob, { su: q.su, sv: q.sv, creases: [2], capFront: true });
  const A = ctx.hp.frontAxle;
  const open = sideRegion([[-1.08, 2], ...SIDE_EDGE, [-1.04, 0.3], [-0.5, 0.3], [-0.5, 2]]);
  const arch = (_x: number, y: number, z: number) => 0.37 - Math.hypot(z - A[2], y - A[1]);
  const underScreen = fAnd(planRegion([[SCREEN_BASE + 0.06, -1], [-0.9, -1], [-0.9, 0.16], [-1.2, 0.18], [SCREEN_BASE + 0.06, 0.11]]), (_x, y) => y - 0.89);
  const lamps = faceLamps(ob, { outline: LAMP, at: [0.083, 0.81], inset: 0.006, square: 0.25, opts: { kind: 'head', inner: 'projector', count: 1, depth: 0.04, rim: 0.003 } });
  const centre = faceLamps(ob, { outline: CENTRE, at: [0, 0.8], inset: 0.006, square: 0.5, single: true, opts: { kind: 'head', inner: 'projector', count: 1, depth: 0.04, rim: 0.003 } });
  const intake = fAnd(frontRegion(smooth2(INTAKE, 2, false)), (_x, _y, z) => -1.36 - z);
  const wing = sideRegion(smooth2(WING_DUCT, 3, true));
  const shell = cut(master, fAnd(fNot(open), fNot(arch), fNot(underScreen), fNot(fOr(lamps.hole, centre.hole, intake))));
  // Headlight cowl + side panel split along a diagonal from the screen corner; side panel carries the wing duct.
  const cowl = sideRegion([[-2, 2], [-1.25, 2], [-1.25, 0.95], [-1.3, 0.82], [-1.35, 0.72], [-2, 0.7]]);
  addPanel(ctx, 'chassis', shell, cowl, PAINT, 0.003, 0.014);
  addPanel(ctx, 'chassis', shell, fAnd(fNot(cowl), fNot(wing)), PAINT, 0.003, 0.014);
  // Inner wall of the double-wall panel + two wing elements in the duct.
  for (const s of [-1, 1]) {
    const p = sideAt(ob, -1.1, 0.69, s);
    ctx.add('chassis', extrude(smooth2(WING_DUCT.map(([z, y]) => [z + (z < -1.1 ? -0.012 : 0.012), y + (y > 0.68 ? 0.012 : -0.012)] as P2), 3, true), 0.006, { plane: 'zy', center: p.p[0] - s * 0.04 }), F.texturedBlack);
  }
  bladeSlats(ctx, ob, [
    [[-1.2, 0.7], [-1.12, 0.718], [-1.03, 0.72], [-1.03, 0.712], [-1.12, 0.708], [-1.2, 0.692]],
    [[-1.17, 0.662], [-1.09, 0.678], [-1.01, 0.68], [-1.01, 0.672], [-1.09, 0.668], [-1.17, 0.654]],
  ], 0.008, 0.026, hard('#0f1012', 0.2, 0.3, 0.8));
  ductLiner(ctx, ob, mirrorLoop(INTAKE), -1.3, 0.8);
  lamps.add(ctx, 'chassis');
  centre.add(ctx, 'chassis');
  // DRL eyebrows: over the top of each side lamp and down its outer edge.
  for (const s of [-1, 1]) {
    const pts: P3[] = [];
    let nrm: P3 = [0, 0, -1];
    for (const [x, y] of [[0.046, 0.836], [0.08, 0.842], [0.114, 0.84], [0.132, 0.826], [0.13, 0.806], [0.118, 0.79]] as P2[]) {
      const h = frontHit(ob, s * x, y);
      if (h) {
        pts.push([h.p[0] + h.n[0] * 0.0015, h.p[1] + h.n[1] * 0.0015, h.p[2] + h.n[2] * 0.0015]);
        nrm = h.n;
      }
    }
    if (pts.length >= 3) ledStrip(ctx, 'chassis', pts, 0.0055, 0.003, 'drl', nrm);
  }
  innerCowl(ctx, { z0: SCREEN_BASE + 0.05, z1: -1.12, yTop0: 0.9, yTop1: 0.955, yBot0: 0.8, yBot1: 0.84, w0: 0.13, w1: 0.22 });
  screen(ctx, 'chassis', {
    zs: stationsBetween(SCREEN_BASE, SCREEN_TOP_Z, 8, 0.35),
    top: curve([[SCREEN_BASE, 0.9], [-1.3, 0.95], [-1.25, 1.02], [-1.2, 1.08], [SCREEN_TOP_Z, 1.1]]),
    bottom: curve([[SCREEN_BASE, 0.888], [-1.26, 0.93], [SCREEN_TOP_Z, 0.965]]),
    half: curve([[SCREEN_BASE, 0.12], [-1.28, 0.15], [-1.21, 0.14], [SCREEN_TOP_Z, 0.105]]),
    sections: [{ z: 0, pts: [[0, 1], [0.45, 0.985], [0.8, 0.93], [0.95, 0.8], [1, 0.55], [1, 0.25], [0.98, 0]] }],
  }, tint(F.screen, '#2e343c'));
  buildTank(ctx, {
    front: -1.08,
    back: -0.63,
    top: 1.08,
    bottomFront: 0.9,
    bottomBack: 0.8,
    width: 0.42,
    style: 'sport',
    knee: 0.17,
    capZ: -0.9,
    topLine: [[-1.08, 0.985], [-1.0, 1.04], [-0.9, 1.072], [-0.8, 1.078], [-0.71, 1.045], [-0.66, 0.97], [-0.63, 0.9]],
    bottomLine: [[-1.08, 0.9], [-0.92, 0.86], [-0.76, 0.82], [-0.63, 0.8]],
    halfLine: [[-1.08, 0.15], [-1.0, 0.2], [-0.9, 0.215], [-0.79, 0.205], [-0.7, 0.17], [-0.63, 0.115]],
  });
  buildSeat(ctx, { front: -0.66, back: -0.32, yFront: 0.825, y: 0.837, yBack: 0.86, width: 0.28, thick: 0.07, frontWidth: 0.17 });
  buildSeat(ctx, { front: -0.31, back: -0.05, yFront: 0.915, y: 0.93, yBack: 0.955, width: 0.18, thick: 0.05, frontWidth: 0.14 }, tint(seatFinish(ctx), '#161616'));
  const tm = outlineLoft(tail(), { su: ctx.seg(12, 4), sv: ctx.seg(6, 2), capBack: true });
  const seatHole: Field = fAnd(
    fOr(sideRegion([[-0.85, 0.8], [-0.315, 0.8], [-0.315, 1.4], [-0.85, 1.4]]), sideRegion([[-0.305, 0.9], [-0.04, 0.9], [-0.04, 1.4], [-0.305, 1.4]])),
    planRegion([[-0.85, -0.01], [-0.03, -0.01], [-0.03, 0.095], [-0.3, 0.095], [-0.31, 0.142], [-0.85, 0.142]]),
  );
  const tailVent = sideRegion(smooth2([[-0.3, 0.8], [-0.14, 0.86], [-0.02, 0.915], [-0.06, 0.875], [-0.22, 0.79]], 3, true));
  addPanel(ctx, 'chassis', tm, fAnd(fNot(seatHole), fNot(tailVent)), PAINT, 0.0025, 0.012);
  undertray(ctx, { z0: -0.46, z1: 0.04, top0: 0.74, top1: 0.97, bot0: 0.7, botMid: 0.76, bot1: 0.95, w0: 0.13, w1: 0.03 });
  tailLamp(ctx, smooth2([[-0.055, -0.006], [0.055, -0.006], [0.06, 0.004], [0.0, 0.01], [-0.06, 0.004]], 4, true), [0, 0.975, 0.05], -0.6);
  // Black radiator side covers under the fairing (lower engine stays exposed).
  for (const s of [-1, 1]) {
    ctx.add('chassis', extrude(smooth2([[-1.1, 0.56], [-0.98, 0.58], [-0.92, 0.5], [-1.0, 0.42], [-1.1, 0.46]], 3, true), 0.008, { plane: 'zy', bevel: 0.003, center: s * 0.2 }), F.texturedBlack);
  }
  frontFender(ctx, { from: -0.62, to: 0.8, gap: 0.02, width: 0.15, f: F.carbon });
  hugger(ctx, F.carbon, -0.15, 0.8);
  plateHanger(ctx, { fromZ: -0.03, fromY: 0.8 });
  fasteners(ctx, ob, [[-1.28, 0.88], [-1.06, 0.88], [-1.0, 0.6]]);
}

// ───────────────────────────── livery ─────────────────────────────

function lettering(p: Pen, red: string): void {
  if (p.view !== 'right' && p.view !== 'left') return;
  p.text('aprilia', -1.18, 0.86, { color: '#f2f2f2', size: 0.034, weight: '800', italic: false, spacing: 0.0 });
  p.text('TUONO V4', -0.22, 0.875, { color: red, size: 0.022, weight: '900', italic: true, spacing: 0.01 });
  p.text('FACTORY', -0.8, 0.95, { color: '#9a9ca0', size: 0.014, weight: '800', spacing: 0.04 });
}

function livery(c: LiveryCanvas, lv: Livery, _env: LiveryEnv): void {
  const red = lv.accent;
  c.views(ALL_VIEWS, (p) => {
    // Factory Dark: gloss black base, satin dark grey panels, red accents.
    p.fill(lv.primary, 'gloss');
    if (p.view === 'right' || p.view === 'left') {
      p.poly([[-1.3, 0.7], [-1.15, 0.62], [-0.95, 0.58], [-0.95, 0.75], [-1.12, 0.78]], lv.secondary, 'satin');
      p.line([[-1.4, 0.84], [-1.25, 0.8], [-1.05, 0.78], [-0.96, 0.8]], red, 0.005);
      p.line([[-0.6, 0.78], [-0.3, 0.83], [0.04, 0.96]], red, 0.004);
      lettering(p, red);
    } else if (p.view === 'top') {
      p.rect(-1.0, -0.004, -0.7, 0.004, red);
    } else if (p.view === 'front') {
      p.line([[-0.13, 0.86], [-0.05, 0.865]], red, 0.003);
      p.line([[0.05, 0.865], [0.13, 0.86]], red, 0.003);
    }
  });
}

export function tuonoBlueprint(spec: BikeSpec): BikeBlueprint {
  const lv = spec.liveries[0];
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.07, 0.81, 1.21],
    wheelbase: 1.452,
    rakeDeg: 24.7,
    trail: 0.1,
    forkLength: 0.72,
    front: { tyre: '120/70ZR17', rimWidthIn: 3.5, crown: 0.84, tread: 'slickish', tyreLabel: 'Supercorsa SP' },
    rear: { tyre: '200/55ZR17', rimWidthIn: 6.0, crown: 0.92, tread: 'slickish', tyreLabel: 'Supercorsa SP' },
    frontWheel: { type: 'forged', spokes: 3, shape: 'split', color: lv.wheel, liveryColor: true, machinedLip: true },
    rearWheel: { type: 'forged', spokes: 3, shape: 'split', color: lv.wheel, liveryColor: true, machinedLip: true },
    fork: { type: 'usd', stanchion: 0.043, spacing: 0.21, outerColor: '#c9a028', innerColor: '#d8b45a', footColor: '#1e1f22', capColor: '#c9a028', adjusterColor: '#d33a1c', label: 'ÖHLINS', labelColor: '#1b1c1f', aboveClamp: 0.012, clampGap: 0.2 },
    frontBrake: { discs: 2, discDia: 0.33, disc: 'floating', carrierColor: '#2a2c30', caliper: 'radialMono4', caliperColor: '#2f3136', caliperText: 'brembo', caliperTextColor: '#d01c1c', caliperAngleDeg: 78 },
    rearBrake: { discs: 1, discDia: 0.22, disc: 'fixed', carrierColor: '#2a2c30', caliper: 'axial2', caliperColor: '#2f3136', caliperAngleDeg: 200 },
    frame: { type: 'twinSpar', color: '#26282c', metal: 0.7, rough: 0.4, subframe: 'cast', subframeColor: '#1c1d20', width: 0.36 },
    swingarm: { type: 'braced', length: 0.58, angleDeg: 11, color: '#222428', metal: 0.7, rough: 0.42 },
    shock: { layout: 'mono', springColor: '#e6c41c', bodyColor: '#c9a028', reservoir: true },
    drive: { type: 'chain', side: 'left', frontTeeth: 15, rearTeeth: 42, pitch: 0.015875, sprocketColor: '#1d1e21' },
    engine: {
      layout: 'V4A',
      cc: 1077,
      crank: [0, 0.39, -0.86],
      tiltDeg: 45,
      caseColor: '#1e1f22',
      coverColor: '#2c2e33',
      headColor: '#3b3e43',
      camCoverColor: '#b3121b',
      camCoverText: 'aprilia V4',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.38, h: 0.3, z: -1.23, y: 0.6, tiltDeg: 18, curved: true },
      width: 0.36,
    },
    exhaust: { route: 'sideCan', side: 'right', can: 'hex', canLength: 0.3, canDia: 0.12, canFinish: 'black', headerFinish: 'steel', outlet: [0.17, 0.46, -0.17] },
    cockpit: {
      bars: 'tubular',
      grip: [0.35, 1.05, -1.0],
      barDia: 0.022,
      dash: 'tft',
      dashPos: [0, 1.0, -1.235],
      dashSize: [0.115, 0.068],
      dashTiltDeg: 52,
      dashMount: 'fairing',
      mirrors: 'bar',
      mirrorPos: [0.37, 1.16, -0.99],
      mirrorSize: [0.13, 0.066],
      mirrorIndicators: false,
      mirrorShape: 'sport',
      mirrorColor: '#111214',
      topClamp: 'milled',
      steeringDamper: 'side',
      leverColor: '#1e1f22',
      reservoirs: true,
      clutch: 'cable',
      ignition: 'clamp',
      switchColor: '#151618',
      gripColor: '#121212',
      barEndColor: '#1d1e21',
    },
    lights: { head: 'custom', tail: 'custom', rearIndicators: 'stalk' },
    seat: { height: 0.837, front: -0.66, back: -0.32, pillion: 'seat', color: '#141414' },
    rider: { hip: [0, 0.92, -0.52], peg: [0.175, 0.4, -0.48], torsoPitch: 0.36, eye: [0, 1.48, -0.68] },
    footrests: 'rearset',
    plate: { mount: 'hanger', pos: [0, 0.62, 0.33], tiltDeg: -14 },
    body,
    livery,
    groundClearance: 0.13,
    features: ['winglets'],
    zones: { splitY: 0.6, decal: [-1.18, 0.86] },
  };
}
