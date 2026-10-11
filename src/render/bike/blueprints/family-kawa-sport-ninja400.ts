import type { BikeSpec } from '../../../data/bikes';
import type { P2 } from '../mesh';
import type { BikeBlueprint } from '../types';
import { KRT, kawaLivery, remapLiveryGeo, type KawaScheme } from './family-kawa-sport-livery';
import { remapZxBody, zxBody, type ZxBody } from './family-kawa-sport-zx';
import { ZX10R_BODY, ZX10R_LIVERY_GEO } from './family-kawa-sport-zx10r';

/**
 * Kawasaki Ninja 400 (2018+).
 * Spec sheet: wheelbase 1370 mm, rake 24.5°, trail 92 mm, seat 785 mm,
 * L×W×H 1990 × 710 × 1120 mm, ground clearance 140 mm, 110/70-17 + 150/60R17 on
 * MT2.75 / MT4.00 rims, 41 mm conventional fork, Uni-Trak monoshock, high-tensile
 * steel trellis frame, single 310 mm semi-floating petal disc with a two-piston
 * caliper, 220 mm rear petal disc, 399 cc parallel twin (180° crank).
 * Design cues: ZX-10R-inspired full fairing with big twin LED headlights either
 * side of a black central intake, a tall screen, double-layer side fairing whose
 * rear edge leaves the black trellis visible under the tank, flank-mounted front
 * indicators, side silencer with a black shroud, analogue tacho + LCD cluster and
 * bars clamped above the top yoke (more upright than the ZX models).
 */

/** ZX-10R → Ninja 400: front 80 mm further back, everything above 0.5 m 12 % lower. */
const S = (z: number): number => z + 0.08 * Math.max(0, Math.min(1, (-0.45 - z) / 0.5));
const H = (y: number): number => (y <= 0.5 ? y : 0.5 + (y - 0.5) * 0.88);

const BASE = remapZxBody(ZX10R_BODY, S, H);

const SCREEN_BASE = S(-1.535);
const SCREEN_TOP_Z = S(-1.13);

const SIDE_EDGE: P2[] = [[-1.04, 0.89], [-0.97, 0.85], [-0.91, 0.77], [-0.86, 0.64], [-0.81, 0.5], [-0.76, 0.38], [-0.69, 0.28], [-0.61, 0.21], [-0.55, 0.18], [-0.5, 0.0]];

export const NINJA400_BODY: ZxBody = {
  ...BASE,
  sideEdge: SIDE_EDGE,
  wingDuct: null,
  // Black central intake between two big angular LED headlights.
  intake: { poly: [[0, 0.703], [0.026, 0.702], [0.04, 0.69], [0.042, 0.666], [0.03, 0.651], [0, 0.648]], zMax: S(-1.58), depth: 0.035 },
  heads: [
    {
      poly: [[0.048, 0.699], [0.07, 0.72], [0.118, 0.727], [0.162, 0.718], [0.168, 0.7], [0.14, 0.684], [0.082, 0.672], [0.052, 0.678]],
      zMax: S(-1.46),
      // Low-beam block inboard, high-beam block outboard, position-light strip underneath.
      emit: [
        [[0.062, 0.697], [0.09, 0.708], [0.096, 0.692], [0.067, 0.684]],
        [[0.11, 0.713], [0.15, 0.711], [0.153, 0.697], [0.113, 0.695]],
      ],
      drl: [[[0.074, 0.682], [0.142, 0.69], [0.145, 0.685], [0.076, 0.677]]],
    },
  ],
  vents: [
    // Large outlet in the outer side panel, black inner panel behind it.
    { poly: [[-1.15, 0.745], [-1.0, 0.752], [-0.9, 0.7], [-0.875, 0.6], [-0.97, 0.592], [-1.1, 0.66]], fins: 3, slope: 0.02 },
  ],
  belly: [[-1.06, 0.31], [-0.9, 0.295], [-0.7, 0.29], [-0.4, 0.29], [-0.4, -1], [-1.06, -1]],
  // Tall screen for a small sport bike.
  screen: {
    zs: [SCREEN_BASE, SCREEN_TOP_Z],
    top: [[SCREEN_BASE, H(0.9)], [S(-1.45), H(0.96)], [S(-1.34), H(1.045)], [S(-1.24), 1.09], [S(-1.17), 1.112], [SCREEN_TOP_Z, 1.118]],
    bottom: [[SCREEN_BASE, H(0.888)], [S(-1.3), H(0.93)], [SCREEN_TOP_Z, H(0.97)]],
    half: [[SCREEN_BASE, 0.14], [S(-1.38), 0.18], [S(-1.22), 0.168], [SCREEN_TOP_Z, 0.13]],
    tint: '#4a525a',
  },
  frontIndicators: [S(-1.5), H(0.79)],
  fasteners: [[S(-1.26), H(0.87)], [S(-1.0), H(0.8)], [-0.98, 0.33], [S(-1.47), H(0.79)]],
};

/** Metallic Carbon Gray over Metallic Magnetic Dark Gray with lime accents. */
const CARBON_GRAY: KawaScheme = {
  base: '#3c3f44',
  baseFinish: 'metallic',
  lower: '#24262a',
  lowerFinish: 'metallic',
  stripe: '#5fd02c',
  slash: false,
  model: '#5fd02c',
  logo: '#c9ccd1',
  accent: '#5fd02c',
};

const GEO = remapLiveryGeo(
  {
    ...ZX10R_LIVERY_GEO,
    lower: [[-1.66, 0.56], [-1.42, 0.52], [-1.12, 0.47], [-0.9, 0.47], [-0.75, 0.5], [-0.7, 0.34], [-0.4, 0.3], [-0.4, -0.1], [-1.7, -0.1]],
    splitLine: [[-1.66, 0.568], [-1.42, 0.528], [-1.12, 0.478], [-0.9, 0.478], [-0.75, 0.508]],
    slash: [[-1.2, 0.47], [-1.06, 0.46], [-0.94, 0.58], [-0.9, 0.7], [-0.96, 0.72], [-1.04, 0.6]],
    tailLower: [[-0.66, 0.75], [-0.2, 0.8], [0.2, 0.88], [0.2, 0.6], [-0.66, 0.6]],
    tailLine: [[-0.62, 0.76], [-0.2, 0.812], [0.17, 0.888]],
    chin: [[-1.72, 0.69], [-1.6, 0.655], [-1.5, 0.61], [-1.6, 0.57], [-1.72, 0.57]],
    frontLowerY: 0.665,
  },
  S,
  [
    { str: 'Ninja', z: -0.9, y: 0.42, size: 0.045, role: 'model' },
    { str: '400', z: -0.04, y: 0.82, size: 0.03, role: 'model' },
    { str: 'KAWASAKI', z: S(-1.3), y: H(0.86), size: 0.022, role: 'logo' },
  ],
);

export function ninja400Blueprint(spec: BikeSpec): BikeBlueprint {
  return {
    id: spec.id,
    source: 'authored',
    overall: [1.99, 0.71, 1.12],
    wheelbase: 1.37,
    rakeDeg: 24.5,
    trail: 0.092,
    forkLength: 0.7,
    front: { tyre: '110/70-17', rimWidthIn: 2.75, crown: 0.9, tread: 'sport', tyreLabel: 'Sport Bias' },
    rear: { tyre: '150/60R17', rimWidthIn: 4.0, crown: 0.95, tread: 'sport', tyreLabel: 'Sport Radial' },
    frontWheel: { type: 'cast', spokes: 5, shape: 'y', color: '#16171a', stripe: '#5fd02c' },
    rearWheel: { type: 'cast', spokes: 5, shape: 'y', color: '#16171a', stripe: '#5fd02c' },
    fork: { type: 'rwu', stanchion: 0.041, spacing: 0.19, outerColor: '#1e1f22', innerColor: '#c9ccd1', footColor: '#1e1f22', capColor: '#1e1f22', aboveClamp: 0.012, clampGap: 0.19 },
    frontBrake: { discs: 1, discDia: 0.31, disc: 'wave', carrierColor: '#2a2c30', caliper: 'axial2', caliperColor: '#26282c', caliperAngleDeg: 70 },
    rearBrake: { discs: 1, discDia: 0.22, disc: 'wave', carrierColor: '#2a2c30', caliper: 'axial2', caliperColor: '#26282c', caliperAngleDeg: 200 },
    frame: { type: 'trellis', color: '#1c1d20', metal: 0.3, rough: 0.38, subframe: 'tubular', subframeColor: '#1c1d20', width: 0.3 },
    swingarm: { type: 'banana', length: 0.55, angleDeg: 9, color: '#1c1d20', metal: 0.35, rough: 0.42 },
    shock: { layout: 'mono', springColor: '#1e1f22', bodyColor: '#2a2c30', reservoir: false },
    drive: { type: 'chain', side: 'left', frontTeeth: 14, rearTeeth: 41, pitch: 0.015875, sprocketColor: '#1d1e21' },
    engine: {
      layout: 'P2_180',
      cc: 399,
      crank: [0, 0.37, -0.72],
      tiltDeg: 25,
      caseColor: '#1e1f22',
      coverColor: '#3a3c40',
      headColor: '#26272a',
      camCoverColor: '#1a1b1e',
      camCoverText: 'Kawasaki',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.3, h: 0.27, z: -1.11, y: 0.56, tiltDeg: 12, curved: true },
      width: 0.3,
    },
    exhaust: { route: 'sideCan', side: 'right', can: 'hex', canLength: 0.36, canDia: 0.12, canFinish: 'black', headerFinish: 'steel', outlet: [0.17, 0.5, 0.03] },
    cockpit: {
      bars: 'clipon',
      // Bars clamped above the top yoke: higher and closer than the ZX models.
      grip: [0.335, 0.94, -0.92],
      barDia: 0.022,
      dash: 'analogTwin',
      dashPos: [0, 1.0, -1.045],
      dashSize: [0.16, 0.08],
      dashTiltDeg: 45,
      dashMount: 'fairing',
      mirrors: 'fairing',
      mirrorPos: [0.315, 0.985, -1.12],
      mirrorSize: [0.13, 0.062],
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
    seat: { height: 0.785, front: S(-0.63), back: S(-0.27), pillion: 'seat', color: '#151515' },
    rider: { hip: [0, 0.87, -0.43], peg: [0.18, 0.37, -0.43], torsoPitch: 0.55 },
    footrests: 'peg',
    plate: { mount: 'hanger', pos: [0, 0.57, 0.37], tiltDeg: -14 },
    body: zxBody(NINJA400_BODY),
    livery: kawaLivery(GEO, [KRT, CARBON_GRAY]),
    groundClearance: 0.14,
    features: [],
    zones: { splitY: 0.47, decal: [-0.97, 0.4] },
  };
}
