import type { BikeSpec, Livery } from '../../../data/bikes';
import type { KitContext } from '../context';
import { frontFender } from '../kit/body';
import { hugger, plateHanger } from '../kit/rear';
import { curve, stationsBetween, type OutlineBody } from '../kit/shape';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv } from '../livery';
import { smooth2, sweep, type MeshData, type P3 } from '../mesh';
import { F, hard } from '../sink';
import type { BikeBlueprint } from '../types';
import { KTM_ORANGE, ktmFace, ktmSeats, ktmTail, ktmTank, ktmText, seatHoleOf, spoilers, underSeatCovers } from './family-eu-naked-1-ktm';

/**
 * KTM 1290 Super Duke R Evo (2022–2023, third generation "The Beast").
 * Spec sheet: wheelbase 1497 mm, steering head 64.8° (rake 25.2°), trail 106 mm, seat 835 mm,
 * 120/70ZR17 + 200/55ZR17 on 3.50 / 6.00 in cast wheels, WP APEX semi-active 48 mm USD fork,
 * 2 × 320 mm discs with Brembo Stylema monoblocs, 240 mm rear disc, chromoly trellis frame with
 * the LC8 75° V-twin as a stressed member, single-sided cast swingarm on the left, 2-1 exhaust
 * into a pre-silencer under the engine and a short silencer low on the right.
 * Design cues: the split vertical LED "mask"; angular tank spoilers framing the ram-air intakes
 * either side of the headstock; a long flat tank top; minimal knife-edge tail; orange trellis.
 */

const FACE_Z = -0.205;

function face(ctx: KitContext): void {
  ktmFace(ctx, {
    z: FACE_Z,
    mask: [[0, -0.088], [0.07, -0.088], [0.098, -0.104], [0.104, -0.16], [0.092, -0.24], [0.066, -0.305], [0.03, -0.33], [0, -0.334]],
    depth: 0.09,
    lamp: smooth2([[0.015, -0.118], [0.05, -0.118], [0.062, -0.136], [0.06, -0.215], [0.047, -0.266], [0.027, -0.288], [0.015, -0.282]], 2, true),
    leds: 2,
    drl: [[0.08, -0.112], [0.086, -0.165], [0.08, -0.222], [0.064, -0.27]],
    brackets: [-0.12, -0.26],
    bracketHalf: 0.06,
    indicator: [[0.085, -0.27, FACE_Z + 0.07], [0.13, -0.285, FACE_Z + 0.055]],
  });
}

function tail(): OutlineBody {
  return {
    zs: stationsBetween(-0.6, 0.02, 12, 0.5),
    top: curve([[-0.6, 0.82], [-0.42, 0.85], [-0.34, 0.9], [-0.2, 0.925], [-0.06, 0.95], [0.02, 0.965]]),
    bottom: curve([[-0.6, 0.71], [-0.4, 0.74], [-0.22, 0.81], [-0.06, 0.885], [0.02, 0.925]]),
    half: curve([[-0.6, 0.13], [-0.42, 0.122], [-0.22, 0.095], [-0.06, 0.066], [0.02, 0.036]]),
    sections: [
      { z: -0.6, pts: [[0, 1], [0.6, 0.98], [0.96, 0.84], [1, 0.55], [0.92, 0.22], [0.58, 0.02], [0, 0]] },
      { z: 0.02, pts: [[0, 1], [0.72, 0.98], [1, 0.74], [0.96, 0.45], [0.8, 0.18], [0.42, 0.02], [0, 0]] },
    ],
  };
}

function body(ctx: KitContext): void {
  face(ctx);
  // Long flat tank (black top) between the spoilers.
  ktmTank(ctx, {
    front: -1.13,
    back: -0.66,
    top: 1.06,
    bottomFront: 0.86,
    bottomBack: 0.8,
    width: 0.36,
    style: 'muscle',
    knee: 0.18,
    capZ: -0.97,
    topLine: [[-1.13, 0.965], [-1.07, 1.025], [-0.97, 1.055], [-0.85, 1.058], [-0.75, 1.02], [-0.66, 0.9]],
    bottomLine: [[-1.13, 0.86], [-0.95, 0.83], [-0.8, 0.81], [-0.66, 0.8]],
    halfLine: [[-1.13, 0.1], [-1.05, 0.16], [-0.94, 0.178], [-0.82, 0.17], [-0.72, 0.14], [-0.66, 0.1]],
  });
  // Tank spoilers: wrap the radiator, sharp upper crease, open intake mouth at the front.
  spoilers(ctx, {
    z0: -1.34,
    z1: -0.84,
    top: [[-1.34, 0.86], [-1.24, 0.94], [-1.12, 0.99], [-0.98, 1.0], [-0.84, 0.96]],
    bottom: [[-1.34, 0.8], [-1.3, 0.7], [-1.22, 0.62], [-1.08, 0.6], [-0.96, 0.66], [-0.84, 0.8]],
    half: [[-1.34, 0.135], [-1.24, 0.2], [-1.1, 0.222], [-0.96, 0.208], [-0.84, 0.19]],
  });
  // Ram-air snorkels either side of the headstock (black ducts into the airbox).
  for (const s of [-1, 1]) {
    const d: P3[] = [[s * 0.075, 0.93, -1.3], [s * 0.08, 0.95, -1.2], [s * 0.075, 0.97, -1.1]];
    ctx.add('chassis', smoothDuct(d), F.texturedBlack);
  }
  ktmSeats(
    ctx,
    { front: -0.72, back: -0.38, yFront: 0.82, y: 0.835, yBack: 0.86, width: 0.27, thick: 0.07, frontWidth: 0.16 },
    { front: -0.36, back: -0.08, yFront: 0.905, y: 0.925, yBack: 0.95, width: 0.18, thick: 0.05, frontWidth: 0.15 },
  );
  ktmTail(ctx, tail(), seatHoleOf(-0.6, -0.07, 0.8, 0.14, 0.09), [0, 0.938, 0.025], 0.04);
  underSeatCovers(ctx, [[-0.7, 0.79], [-0.52, 0.775], [-0.47, 0.68], [-0.6, 0.62], [-0.7, 0.68]], 0.12);
  frontFender(ctx, { from: -0.6, to: 0.72, gap: 0.02, width: 0.14, f: hard('#121315', 0.1, 0.3, 0.8) });
  hugger(ctx, F.texturedBlack, -0.12, 0.7);
  plateHanger(ctx, { fromZ: -0.06, fromY: 0.8 });
}

/** Short rounded-rectangle duct along three points (ram-air snorkel). */
function smoothDuct(pts: readonly P3[]): MeshData {
  const prof = smooth2([[-0.022, -0.018], [0.022, -0.018], [0.024, 0.016], [-0.024, 0.016]], 2, true);
  return sweep(pts, prof, { up: [0, 1, 0], capStart: true, capEnd: true });
}

// ───────────────────────────── livery ─────────────────────────────

function livery(c: LiveryCanvas, lv: Livery, env: LiveryEnv): void {
  const orange = env.index === 0;
  c.views(ALL_VIEWS, (p) => {
    // Base: black plastics; the tank spoilers and tail sides carry the colour.
    p.fill(orange ? '#141518' : lv.primary, orange ? 'gloss' : 'matte');
    if (p.view === 'right' || p.view === 'left') {
      // Spoiler: orange (or dark grey) with a black lower wedge and white model name.
      const main = orange ? KTM_ORANGE : '#2b2d31';
      p.poly([[-1.36, 0.82], [-1.24, 0.96], [-1.1, 1.01], [-0.84, 0.97], [-0.84, 0.82], [-1.0, 0.74], [-1.2, 0.72]], main, orange ? 'gloss' : 'matte');
      p.poly([[-1.36, 0.6], [-1.36, 0.8], [-1.2, 0.7], [-1.0, 0.72], [-0.84, 0.8], [-0.84, 0.6]], '#141518', 'satin');
      p.line([[-1.32, 0.83], [-1.18, 0.78], [-0.9, 0.8]], orange ? '#f4f4f4' : KTM_ORANGE, 0.004);
      ktmText(p, '1290 SUPER DUKE R', -1.1, 0.87, 0.018, orange ? '#141518' : '#f4f4f4', { spacing: 0.01 });
      // Tail sides.
      p.poly([[-0.6, 0.78], [-0.3, 0.84], [0.04, 0.93], [0.04, 0.99], [-0.6, 0.99]], orange ? KTM_ORANGE : '#2b2d31', orange ? 'gloss' : 'matte');
      ktmText(p, 'KTM', -0.2, 0.87, 0.026, orange ? '#141518' : KTM_ORANGE);
    } else if (p.view === 'top') {
      p.rect(-1.0, -0.004, -0.72, 0.004, orange ? KTM_ORANGE : '#3a3c40');
    } else if (p.view === 'front') {
      ktmText(p, 'KTM', 0, 1.0, 0.03, orange ? KTM_ORANGE : '#f4f4f4', { italic: false });
    }
  });
}

export function superDukeBlueprint(spec: BikeSpec): BikeBlueprint {
  const lv = spec.liveries[0];
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.11, 0.86, 1.12],
    wheelbase: 1.497,
    rakeDeg: 25.2,
    trail: 0.106,
    forkLength: 0.73,
    front: { tyre: '120/70ZR17', rimWidthIn: 3.5, crown: 0.85, tread: 'slickish', tyreLabel: 'Supercorsa' },
    rear: { tyre: '200/55ZR17', rimWidthIn: 6.0, crown: 0.92, tread: 'slickish', tyreLabel: 'Supercorsa' },
    frontWheel: { type: 'cast', spokes: 5, shape: 'y', color: lv.wheel, liveryColor: true, machinedLip: false },
    rearWheel: { type: 'cast', spokes: 5, shape: 'y', color: lv.wheel, liveryColor: true, machinedLip: false },
    fork: { type: 'usd', stanchion: 0.048, spacing: 0.21, outerColor: '#1c1d20', innerColor: '#c9cdd3', footColor: '#1c1d20', capColor: KTM_ORANGE, adjusterColor: KTM_ORANGE, label: 'WP', labelColor: '#f4f4f4', aboveClamp: 0.01, clampGap: 0.2 },
    frontBrake: { discs: 2, discDia: 0.32, disc: 'floating', carrierColor: '#2a2c30', caliper: 'radialMono4', caliperColor: '#2f3136', caliperText: 'brembo', caliperTextColor: '#d01c1c', caliperAngleDeg: 76 },
    rearBrake: { discs: 1, discDia: 0.24, disc: 'fixed', carrierColor: '#2a2c30', caliper: 'axial2', caliperColor: '#2f3136', caliperAngleDeg: 200 },
    frame: { type: 'trellis', color: spec.liveries[0].frame, metal: 0.25, rough: 0.35, subframe: 'tubular', subframeColor: '#1c1d20', width: 0.3 },
    swingarm: { type: 'singleSided', length: 0.62, angleDeg: 10, side: 'left', color: '#1d1e21', metal: 0.6, rough: 0.42 },
    shock: { layout: 'mono', springColor: KTM_ORANGE, bodyColor: '#1d1e21', reservoir: true },
    drive: { type: 'chain', side: 'left', frontTeeth: 17, rearTeeth: 40, pitch: 0.015875, sprocketColor: '#1d1e21' },
    engine: {
      layout: 'V2_75',
      cc: 1301,
      crank: [0, 0.37, -0.83],
      tiltDeg: 46,
      caseColor: '#1e1f22',
      coverColor: '#2c2e33',
      headColor: '#4b4e54',
      camCoverColor: '#1b1c1f',
      camCoverText: 'LC8',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.36, h: 0.28, z: -1.23, y: 0.63, tiltDeg: 16, curved: true },
      width: 0.34,
    },
    exhaust: { route: 'underslung', side: 'right', can: 'stubby', canLength: 0.2, canDia: 0.11, canFinish: 'black', headerFinish: 'steel' },
    cockpit: {
      bars: 'tubular',
      grip: [0.365, 1.05, -1.02],
      barDia: 0.022,
      dash: 'tft',
      dashPos: [0, 1.03, -1.235],
      dashSize: [0.115, 0.068],
      dashTiltDeg: 50,
      dashMount: 'bars',
      mirrors: 'bar',
      mirrorPos: [0.37, 1.17, -1.0],
      mirrorSize: [0.13, 0.068],
      mirrorIndicators: false,
      mirrorShape: 'sport',
      mirrorColor: '#111214',
      topClamp: 'milled',
      steeringDamper: 'side',
      leverColor: '#1e1f22',
      reservoirs: true,
      clutch: 'hydraulic',
      ignition: 'keyless',
      switchColor: '#151618',
      gripColor: '#121212',
      barEndColor: KTM_ORANGE,
    },
    lights: { head: 'custom', tail: 'custom', rearIndicators: 'stalk' },
    seat: { height: 0.835, front: -0.72, back: -0.38, pillion: 'seat', color: '#141414' },
    rider: { hip: [0, 0.92, -0.56], peg: [0.17, 0.39, -0.5], torsoPitch: 0.3, eye: [0, 1.5, -0.68] },
    footrests: 'rearset',
    plate: { mount: 'hanger', pos: [0, 0.62, 0.31], tiltDeg: -14 },
    body,
    livery,
    groundClearance: 0.14,
    zones: { splitY: 0.6, decal: [-1.1, 0.87] },
  };
}
