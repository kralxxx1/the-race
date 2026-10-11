import type { BikeSpec } from '../../../data/bikes';
import type { P2 } from '../mesh';
import type { BikeBlueprint } from '../types';
import { KRT, kawaLivery, remapLiveryGeo } from './family-kawa-sport-livery';
import { remapZxBody, zxBody, type ZxBody } from './family-kawa-sport-zx';
import { ZX10R_BODY, ZX10R_LIVERY_GEO } from './family-kawa-sport-zx10r';

/**
 * Kawasaki Ninja ZX-4RR (2023+, 399 cc inline four).
 * Spec sheet: wheelbase 1380 mm, rake 23.5°, trail 97 mm, seat 800 mm,
 * L×W×H 1990 × 765 × 1110 mm, ground clearance 135 mm, 120/70ZR17 + 160/60ZR17,
 * 37 mm Showa SFF-BP fork, Showa BFRC-lite horizontal back-link, high-tensile steel
 * trellis frame, dual 290 mm semi-floating petal discs with radial four-piston
 * monoblocs, short silencer on the right, 4.3" TFT.
 * Design cues: the ZX-10R family shape scaled down, with the ZX-25R/ZX-4R face —
 * a central ram-air intake between two compact LED headlights under a pointed nose —
 * a shorter side fairing that leaves the black trellis frame visible under the tank,
 * fairing-flank indicators and a short stubby silencer.
 */

/** ZX-10R → ZX-4RR: front 70 mm further back, everything above 0.5 m 10 % lower. */
const S = (z: number): number => z + 0.07 * Math.max(0, Math.min(1, (-0.5 - z) / 0.5));
const H = (y: number): number => (y <= 0.5 ? y : 0.5 + (y - 0.5) * 0.9);

const BASE = remapZxBody(ZX10R_BODY, S, H);

const SCREEN_BASE = S(-1.535);
const SCREEN_TOP_Z = S(-1.14);

/** Shorter side fairing: its rear edge runs down just behind the radiator, exposing the trellis. */
const SIDE_EDGE: P2[] = [[-1.06, 0.9], [-1.0, 0.865], [-0.94, 0.79], [-0.89, 0.66], [-0.84, 0.52], [-0.79, 0.39], [-0.72, 0.28], [-0.63, 0.2], [-0.56, 0.17], [-0.5, 0.0]];

export const ZX4RR_BODY: ZxBody = {
  ...BASE,
  sideEdge: SIDE_EDGE,
  wingDuct: null,
  // Central ram-air intake between the lights (ZX-25R / ZX-4R face).
  intake: { poly: [[0, 0.716], [0.028, 0.715], [0.044, 0.704], [0.047, 0.676], [0.035, 0.656], [0, 0.652]], zMax: S(-1.58), depth: 0.07 },
  heads: [
    {
      poly: [[0.056, 0.706], [0.076, 0.72], [0.124, 0.724], [0.14, 0.713], [0.135, 0.69], [0.1, 0.679], [0.066, 0.677], [0.053, 0.686]],
      zMax: S(-1.5),
      emit: [[[0.07, 0.705], [0.12, 0.712], [0.124, 0.696], [0.076, 0.689]]],
      drl: [[[0.062, 0.712], [0.12, 0.72], [0.132, 0.714], [0.075, 0.707]]],
    },
  ],
  vents: [
    { poly: BASE.vents[0].poly, fins: 2 },
    { poly: [[S(-1.09), 0.565], [S(-1.02), 0.59], [S(-0.95), 0.565], [S(-0.93), 0.49], [S(-0.98), 0.47], [S(-1.06), 0.49]], fins: 2, slope: 0.014 },
  ],
  belly: [[S(-1.12), 0.31], [S(-0.94), 0.295], [-0.72, 0.29], [-0.4, 0.29], [-0.4, -1], [S(-1.12), -1]],
  screen: {
    zs: [SCREEN_BASE, SCREEN_TOP_Z],
    top: [[SCREEN_BASE, H(0.9)], [S(-1.45), H(0.955)], [S(-1.34), H(1.03)], [S(-1.24), 1.08], [S(-1.18), 1.104], [SCREEN_TOP_Z, 1.108]],
    bottom: [[SCREEN_BASE, H(0.888)], [S(-1.3), H(0.93)], [SCREEN_TOP_Z, H(0.97)]],
    half: [[SCREEN_BASE, 0.14], [S(-1.38), 0.18], [S(-1.22), 0.165], [SCREEN_TOP_Z, 0.125]],
    tint: '#3a4048',
  },
  frontIndicators: [S(-1.52), H(0.8)],
  fasteners: [[S(-1.26), H(0.87)], [S(-1.0), H(0.8)], [S(-0.98), 0.33], [S(-1.47), H(0.79)]],
};

const GEO = remapLiveryGeo(
  {
    ...ZX10R_LIVERY_GEO,
    lower: [[-1.66, 0.58], [-1.42, 0.54], [-1.12, 0.48], [-0.9, 0.48], [-0.75, 0.52], [-0.7, 0.34], [-0.4, 0.3], [-0.4, -0.1], [-1.7, -0.1]],
    splitLine: [[-1.66, 0.588], [-1.42, 0.548], [-1.12, 0.488], [-0.9, 0.488], [-0.75, 0.528]],
    slash: [[-1.2, 0.48], [-1.06, 0.47], [-0.94, 0.6], [-0.9, 0.72], [-0.96, 0.74], [-1.04, 0.62]],
    tailLower: [[-0.66, 0.76], [-0.2, 0.82], [0.2, 0.9], [0.2, 0.6], [-0.66, 0.6]],
    tailLine: [[-0.62, 0.77], [-0.2, 0.832], [0.17, 0.908]],
    chin: [[-1.72, 0.7], [-1.6, 0.665], [-1.5, 0.62], [-1.6, 0.58], [-1.72, 0.58]],
    frontLowerY: 0.68,
  },
  S,
  [
    { str: 'Ninja', z: -0.95, y: 0.41, size: 0.05, role: 'model' },
    { str: 'ZX-4RR', z: -0.06, y: 0.835, size: 0.026, role: 'model' },
    { str: 'KAWASAKI', z: S(-1.3), y: H(0.86), size: 0.022, role: 'logo' },
    { str: 'KRT', z: S(-0.95), y: 0.26, size: 0.026, role: 'accent' },
  ],
);

export function zx4rrBlueprint(spec: BikeSpec): BikeBlueprint {
  return {
    id: spec.id,
    source: 'authored',
    overall: [1.99, 0.765, 1.11],
    wheelbase: 1.38,
    rakeDeg: 23.5,
    trail: 0.097,
    forkLength: 0.69,
    front: { tyre: '120/70ZR17', rimWidthIn: 3.5, crown: 0.84, tread: 'sport', tyreLabel: 'Sport Radial S' },
    rear: { tyre: '160/60ZR17', rimWidthIn: 4.5, crown: 0.92, tread: 'sport', tyreLabel: 'Sport Radial S' },
    frontWheel: { type: 'cast', spokes: 5, shape: 'y', color: '#16171a', stripe: '#5fd02c' },
    rearWheel: { type: 'cast', spokes: 5, shape: 'y', color: '#16171a', stripe: '#5fd02c' },
    fork: { type: 'usd', stanchion: 0.037, spacing: 0.195, outerColor: '#b8913a', innerColor: '#c9ccd1', footColor: '#1e1f22', capColor: '#2a2c30', adjusterColor: '#c99a2c', label: 'SFF-BP', labelColor: '#1b1c1f', aboveClamp: 0.008, clampGap: 0.19 },
    frontBrake: { discs: 2, discDia: 0.29, disc: 'wave', carrierColor: '#2a2c30', caliper: 'radialMono4', caliperColor: '#1e1f22', caliperAngleDeg: 74 },
    rearBrake: { discs: 1, discDia: 0.22, disc: 'wave', carrierColor: '#2a2c30', caliper: 'axial1', caliperColor: '#2a2c30', caliperAngleDeg: 200 },
    frame: { type: 'trellis', color: '#1c1d20', metal: 0.3, rough: 0.38, subframe: 'tubular', subframeColor: '#1c1d20', width: 0.32 },
    swingarm: { type: 'banana', length: 0.56, angleDeg: 9, color: '#1c1d20', metal: 0.4, rough: 0.42 },
    shock: { layout: 'mono', springColor: '#2a2c30', bodyColor: '#3a3c40', reservoir: false },
    drive: { type: 'chain', side: 'left', frontTeeth: 14, rearTeeth: 46, pitch: 0.015875, sprocketColor: '#1d1e21' },
    engine: {
      layout: 'I4',
      cc: 399,
      crank: [0, 0.39, -0.74],
      tiltDeg: 30,
      caseColor: '#1e1f22',
      coverColor: '#3a3c40',
      headColor: '#26272a',
      camCoverColor: '#1a1b1e',
      camCoverText: 'Kawasaki',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.34, h: 0.28, z: -1.13, y: 0.58, tiltDeg: 14, curved: true },
      width: 0.33,
    },
    exhaust: { route: 'sideCan', side: 'right', can: 'hex', canLength: 0.25, canDia: 0.11, canFinish: 'black', headerFinish: 'steel', outlet: [0.165, 0.45, -0.1] },
    cockpit: {
      bars: 'clipon',
      grip: [0.32, 0.9, -0.93],
      barDia: 0.022,
      dash: 'tft',
      dashPos: [0, 0.99, -1.025],
      dashSize: [0.105, 0.064],
      dashTiltDeg: 46,
      dashMount: 'fairing',
      mirrors: 'fairing',
      mirrorPos: [0.315, 0.965, -1.13],
      mirrorSize: [0.13, 0.058],
      mirrorIndicators: false,
      mirrorShape: 'sport',
      mirrorColor: '#0d0e10',
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
    seat: { height: 0.8, front: S(-0.63), back: S(-0.27), pillion: 'seat', color: '#151515' },
    rider: { hip: [0, 0.89, -0.43], peg: [0.18, 0.38, -0.4], torsoPitch: 0.7 },
    footrests: 'rearset',
    plate: { mount: 'hanger', pos: [0, 0.58, 0.37], tiltDeg: -14 },
    body: zxBody(ZX4RR_BODY),
    livery: kawaLivery(GEO, [KRT]),
    groundClearance: 0.135,
    features: [],
    zones: { splitY: 0.48, decal: [S(-1.06), 0.4] },
  };
}
