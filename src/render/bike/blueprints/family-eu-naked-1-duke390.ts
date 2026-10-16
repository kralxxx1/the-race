import type { BikeSpec, Livery } from '../../../data/bikes';
import type { KitContext } from '../context';
import { frontFender } from '../kit/body';
import { hugger, plateHanger } from '../kit/rear';
import { curve, stationsBetween, type OutlineBody } from '../kit/shape';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv } from '../livery';
import { extrude, smooth2 } from '../mesh';
import { F, hard } from '../sink';
import type { BikeBlueprint } from '../types';
import { KTM_ORANGE, ktmFace, ktmSeats, ktmTail, ktmTank, ktmText, seatHoleOf, spoilers, underSeatCovers } from './family-eu-naked-1-ktm';

/**
 * KTM 390 Duke (2024, third generation).
 * Spec sheet: wheelbase 1357 mm, steering head 65° (rake 25°), trail ≈ 95 mm, seat 820 mm
 * (800 mm without the spacer), 110/70R17 + 150/60R17 on 3.00 / 4.00 in cast wheels, WP APEX
 * 43 mm USD fork, single 320 mm disc with a radial four-piston caliper, 240 mm rear disc, steel
 * trellis frame with a bolt-on die-cast aluminium subframe, asymmetric cast swingarm, 399 cc
 * LC4c single, header under the engine into a short side silencer low on the right.
 * Design cues: the split LED face with boomerang DRL blades; big angular orange tank spoilers;
 * orange frame and wheels; a sharp, short tail.
 */

const FACE_Z = -0.19;

function face(ctx: KitContext): void {
  ktmFace(ctx, {
    z: FACE_Z,
    mask: [[0, -0.09], [0.06, -0.09], [0.088, -0.108], [0.094, -0.16], [0.084, -0.23], [0.06, -0.286], [0.026, -0.31], [0, -0.312]],
    depth: 0.085,
    lamp: smooth2([[0.012, -0.12], [0.04, -0.12], [0.05, -0.134], [0.048, -0.24], [0.036, -0.27], [0.012, -0.274]], 2, true),
    leds: 2,
    // Boomerang DRL: down the outer edge, kinking inwards under the lamps.
    drl: [[0.07, -0.108], [0.078, -0.16], [0.074, -0.225], [0.058, -0.268], [0.034, -0.294]],
    brackets: [-0.11, -0.24],
    bracketHalf: 0.055,
    indicator: [[0.075, -0.25, FACE_Z + 0.07], [0.115, -0.262, FACE_Z + 0.058]],
  });
}

function tail(): OutlineBody {
  return {
    zs: stationsBetween(-0.56, 0.0, 11, 0.5),
    top: curve([[-0.56, 0.8], [-0.4, 0.83], [-0.33, 0.87], [-0.2, 0.895], [-0.06, 0.92], [0.0, 0.93]]),
    bottom: curve([[-0.56, 0.7], [-0.38, 0.72], [-0.2, 0.785], [-0.06, 0.855], [0.0, 0.89]]),
    half: curve([[-0.56, 0.125], [-0.4, 0.115], [-0.2, 0.09], [-0.06, 0.062], [0.0, 0.036]]),
    sections: [
      { z: -0.56, pts: [[0, 1], [0.6, 0.98], [0.96, 0.84], [1, 0.55], [0.92, 0.22], [0.58, 0.02], [0, 0]] },
      { z: 0.0, pts: [[0, 1], [0.72, 0.98], [1, 0.74], [0.96, 0.45], [0.8, 0.18], [0.42, 0.02], [0, 0]] },
    ],
  };
}

function body(ctx: KitContext): void {
  face(ctx);
  ktmTank(ctx, {
    front: -1.02,
    back: -0.6,
    top: 1.0,
    bottomFront: 0.82,
    bottomBack: 0.77,
    width: 0.33,
    style: 'muscle',
    knee: 0.16,
    capZ: -0.87,
    topLine: [[-1.02, 0.92], [-0.96, 0.975], [-0.87, 1.0], [-0.77, 0.995], [-0.68, 0.955], [-0.6, 0.86]],
    bottomLine: [[-1.02, 0.82], [-0.85, 0.79], [-0.7, 0.78], [-0.6, 0.77]],
    halfLine: [[-1.02, 0.09], [-0.95, 0.15], [-0.85, 0.165], [-0.74, 0.155], [-0.65, 0.125], [-0.6, 0.09]],
  });
  spoilers(ctx, {
    z0: -1.23,
    z1: -0.77,
    top: [[-1.23, 0.82], [-1.14, 0.89], [-1.02, 0.94], [-0.88, 0.95], [-0.77, 0.91]],
    bottom: [[-1.23, 0.76], [-1.19, 0.67], [-1.11, 0.59], [-0.98, 0.57], [-0.86, 0.62], [-0.77, 0.74]],
    half: [[-1.23, 0.12], [-1.13, 0.18], [-1.0, 0.2], [-0.87, 0.19], [-0.77, 0.17]],
  });
  ktmSeats(
    ctx,
    { front: -0.66, back: -0.36, yFront: 0.805, y: 0.82, yBack: 0.84, width: 0.26, thick: 0.07, frontWidth: 0.15 },
    { front: -0.34, back: -0.07, yFront: 0.87, y: 0.89, yBack: 0.91, width: 0.17, thick: 0.05, frontWidth: 0.14 },
  );
  ktmTail(ctx, tail(), seatHoleOf(-0.56, -0.06, 0.79, 0.13, 0.085), [0, 0.905, 0.005], 0.036);
  underSeatCovers(ctx, [[-0.64, 0.77], [-0.47, 0.76], [-0.43, 0.66], [-0.55, 0.6], [-0.64, 0.66]], 0.11);
  // Bash plate under the engine (black).
  const c = ctx.bp.engine.crank;
  ctx.add('chassis', extrude(smooth2([[c[2] - 0.2, 0.2], [c[2] + 0.12, 0.17], [c[2] + 0.2, 0.2], [c[2] + 0.16, 0.26], [c[2] - 0.14, 0.28]], 3, true), 0.16, { plane: 'zy', bevel: 0.01 }), F.texturedBlack);
  frontFender(ctx, { from: -0.55, to: 0.72, gap: 0.02, width: 0.13, f: hard('#121315', 0.1, 0.3, 0.8) });
  hugger(ctx, F.texturedBlack, -0.12, 0.65);
  plateHanger(ctx, { fromZ: -0.06, fromY: 0.78 });
}

// ───────────────────────────── livery ─────────────────────────────

function livery(c: LiveryCanvas, lv: Livery, env: LiveryEnv): void {
  const blue = env.index === 1;
  const main = blue ? lv.primary : KTM_ORANGE;
  c.views(ALL_VIEWS, (p) => {
    p.fill('#141518', 'gloss');
    if (p.view === 'right' || p.view === 'left') {
      // Spoilers: colour panel with a white lower blade and a black intake edge.
      p.poly([[-1.25, 0.8], [-1.14, 0.9], [-1.0, 0.95], [-0.76, 0.93], [-0.76, 0.74], [-0.95, 0.68], [-1.15, 0.7]], main, 'gloss');
      p.poly([[-1.15, 0.7], [-0.95, 0.68], [-0.76, 0.74], [-0.76, 0.7], [-0.98, 0.62], [-1.12, 0.63]], '#eef0f2', 'gloss');
      ktmText(p, 'DUKE', -1.0, 0.82, 0.04, blue ? '#f4f4f4' : '#141518');
      ktmText(p, '390', -1.12, 0.89, 0.018, blue ? KTM_ORANGE : '#f4f4f4');
      // Tail: black with a thin colour line along the lower edge.
      p.line([[-0.56, 0.74], [-0.3, 0.78], [0.0, 0.9]], main, 0.006);
      ktmText(p, 'KTM', -0.22, 0.86, 0.022, main);
    } else if (p.view === 'top') {
      p.rect(-0.95, -0.03, -0.66, 0.03, blue ? '#e8eaec' : '#1d1e21', 'satin');
    }
  });
}

export function duke390Blueprint(spec: BikeSpec): BikeBlueprint {
  const lv = spec.liveries[0];
  return {
    id: spec.id,
    source: 'authored',
    wheelbase: 1.357,
    rakeDeg: 25,
    trail: 0.095,
    forkLength: 0.69,
    front: { tyre: '110/70R17', rimWidthIn: 3.0, crown: 0.95, tread: 'sport', tyreLabel: 'Sport Street' },
    rear: { tyre: '150/60R17', rimWidthIn: 4.0, crown: 1.0, tread: 'sport', tyreLabel: 'Sport Street' },
    frontWheel: { type: 'cast', spokes: 5, shape: 'split', color: lv.wheel, liveryColor: true },
    rearWheel: { type: 'cast', spokes: 5, shape: 'split', color: lv.wheel, liveryColor: true },
    fork: { type: 'usd', stanchion: 0.043, spacing: 0.19, outerColor: '#1c1d20', innerColor: '#c9cdd3', footColor: '#1c1d20', capColor: KTM_ORANGE, adjusterColor: '#f2f2f2', label: 'WP APEX', labelColor: '#f4f4f4', aboveClamp: 0.01, clampGap: 0.18 },
    frontBrake: { discs: 1, discDia: 0.32, disc: 'floating', carrierColor: '#2a2c30', caliper: 'radial4', caliperColor: '#1e1f22', caliperText: 'ByB', caliperTextColor: '#f4f4f4', caliperAngleDeg: 74 },
    rearBrake: { discs: 1, discDia: 0.24, disc: 'fixed', carrierColor: '#2a2c30', caliper: 'axial1', caliperColor: '#1e1f22', caliperAngleDeg: 200 },
    frame: { type: 'trellis', color: lv.frame, metal: 0.25, rough: 0.35, subframe: 'cast', subframeColor: '#2a2c30', width: 0.27 },
    swingarm: { type: 'banana', length: 0.56, angleDeg: 9, color: '#3a3d42', metal: 0.75, rough: 0.4 },
    shock: { layout: 'mono', springColor: KTM_ORANGE, bodyColor: '#1d1e21', reservoir: false },
    drive: { type: 'chain', side: 'left', frontTeeth: 15, rearTeeth: 45, pitch: 0.015875, sprocketColor: '#1d1e21' },
    engine: {
      layout: 'SINGLE',
      cc: 399,
      crank: [0, 0.33, -0.74],
      tiltDeg: 14,
      caseColor: '#1e1f22',
      coverColor: '#2c2e33',
      headColor: '#47494f',
      camCoverColor: '#1b1c1f',
      camCoverText: 'KTM',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.25, h: 0.23, z: -1.065, y: 0.6, tiltDeg: 14, curved: true },
    },
    exhaust: { route: 'sideCan', side: 'right', can: 'box', canLength: 0.22, canDia: 0.11, canFinish: 'black', headerFinish: 'steel', outlet: [0.17, 0.36, -0.24] },
    cockpit: {
      bars: 'tubular',
      grip: [0.335, 1.0, -0.9],
      barDia: 0.022,
      dash: 'tft',
      dashPos: [0, 0.985, -1.12],
      dashSize: [0.11, 0.066],
      dashTiltDeg: 50,
      dashMount: 'bars',
      mirrors: 'bar',
      mirrorPos: [0.34, 1.13, -0.88],
      mirrorSize: [0.12, 0.066],
      mirrorIndicators: false,
      mirrorShape: 'sport',
      mirrorColor: '#111214',
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
    lights: { head: 'custom', tail: 'custom', rearIndicators: 'stalk' },
    seat: { height: 0.82, front: -0.66, back: -0.36, pillion: 'seat', color: '#141414' },
    rider: { hip: [0, 0.89, -0.5], peg: [0.155, 0.36, -0.46], torsoPitch: 0.24, eye: [0, 1.47, -0.6] },
    footrests: 'peg',
    plate: { mount: 'hanger', pos: [0, 0.6, 0.28], tiltDeg: -14 },
    body,
    livery,
    groundClearance: 0.18,
    zones: { splitY: 0.6, decal: [-1.0, 0.82] },
  };
}
