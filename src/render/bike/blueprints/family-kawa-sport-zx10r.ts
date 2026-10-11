import type { BikeSpec } from '../../../data/bikes';
import type { P2 } from '../mesh';
import type { BikeBlueprint } from '../types';
import { KRT, kawaLivery, type KawaLiveryGeo, type KawaScheme } from './family-kawa-sport-livery';
import { zxBody, type ZxBody } from './family-kawa-sport-zx';

/**
 * Kawasaki Ninja ZX-10R (2021+).
 * Spec sheet: wheelbase 1450 mm, rake 25.0°, trail 107 mm, seat 835 mm,
 * L×W×H 2085 × 750 × 1185 mm, ground clearance 135 mm, 120/70ZR17 + 190/55ZR17,
 * 43 mm Showa BFF fork, horizontal back-link BFRC-lite shock, twin-spar aluminium
 * frame, Brembo M50 monoblocs on 330 mm discs, three-spoke cast wheels, 17 L tank.
 * Design cues: long sharp beak with the ram-air mouth at its tip, slim LED
 * headlights tucked under the upper-cowl brow either side of the intake, aero
 * "winglet" ducts integrated in the upper-cowl flanks, taller screen, cowl
 * mirrors with LED indicators, short sharp tail with the LED light in the tip,
 * angular side silencer on the right.
 */

const NOSE = -1.69;
const SCREEN_BASE = -1.535;
const SCREEN_TOP_Z = -1.12;

// Arrow-head sections: a narrow creased top behind the beak, the widest point low on the
// flank (the winglet lip, crease 5), then tucking in sharply to the black chin.
const FACE: P2[] = [[0, 1], [0.2, 0.965], [0.42, 0.89], [0.66, 0.75], [0.88, 0.56], [1, 0.38], [0.8, 0.19], [0.45, 0.05], [0, 0]];
const COWL: P2[] = [[0, 1], [0.3, 0.985], [0.58, 0.94], [0.78, 0.82], [0.93, 0.62], [1, 0.42], [0.95, 0.2], [0.82, 0.05], [0.7, 0]];
const SIDE: P2[] = [[0, 1], [0.38, 0.99], [0.68, 0.95], [0.86, 0.82], [0.95, 0.64], [1, 0.42], [0.97, 0.2], [0.88, 0.06], [0.6, 0]];
const BACK: P2[] = [[0, 1], [0.42, 0.99], [0.72, 0.95], [0.9, 0.82], [0.97, 0.64], [1, 0.42], [0.96, 0.2], [0.85, 0.06], [0.5, 0]];

export const ZX10R_BODY: ZxBody = {
  fairing: {
    zs: [NOSE, -1.684, -1.674, -1.66, -1.64, -1.615, -1.585, -1.55, -1.505, -1.45, -1.39, -1.32, -1.25, -1.16, -1.06, -0.96, -0.86, -0.76, -0.66, -0.56, -0.47],
    top: [[NOSE, 0.782], [-1.66, 0.8], [-1.6, 0.828], [-1.52, 0.866], [-1.42, 0.903], [-1.31, 0.938], [-1.2, 0.96], [-1.07, 0.957], [-0.9, 0.912], [-0.7, 0.832], [-0.47, 0.742]],
    bottom: [[NOSE, 0.776], [-1.68, 0.752], [-1.66, 0.722], [-1.635, 0.694], [-1.6, 0.668], [-1.55, 0.642], [-1.49, 0.62], [-1.43, 0.555], [-1.32, 0.4], [-1.2, 0.26], [-1.08, 0.18], [-0.96, 0.15], [-0.8, 0.142], [-0.64, 0.152], [-0.47, 0.185]],
    half: [[NOSE, 0.008], [-1.672, 0.042], [-1.645, 0.078], [-1.605, 0.115], [-1.55, 0.155], [-1.48, 0.198], [-1.4, 0.238], [-1.3, 0.272], [-1.18, 0.296], [-1.05, 0.302], [-0.92, 0.292], [-0.75, 0.258], [-0.47, 0.2]],
    sections: [
      { z: NOSE, pts: FACE },
      { z: -1.6, pts: FACE },
      { z: -1.42, pts: COWL },
      { z: -1.0, pts: SIDE },
      { z: -0.47, pts: BACK },
    ],
    creases: [2, 5],
  },
  sideEdge: [[-1.15, 0.975], [-1.07, 0.94], [-0.99, 0.9], [-0.9, 0.83], [-0.81, 0.69], [-0.74, 0.52], [-0.68, 0.37], [-0.61, 0.27], [-0.53, 0.2], [-0.47, 0.165]],
  archR: 0.362,
  underScreen: { base: SCREEN_BASE, rear: -1.02, y: 0.865 },
  // Ram-air mouth under the beak tip; slim LED headlights tucked under the cowl brow.
  intake: { poly: [[0, 0.762], [0.035, 0.762], [0.062, 0.752], [0.07, 0.728], [0.058, 0.695], [0.035, 0.682], [0, 0.68]], zMax: -1.6 },
  heads: [
    {
      poly: [[0.08, 0.735], [0.1, 0.742], [0.14, 0.75], [0.158, 0.744], [0.152, 0.73], [0.12, 0.72], [0.09, 0.716], [0.078, 0.722]],
      zMax: -1.54,
      emit: [[[0.092, 0.73], [0.132, 0.738], [0.144, 0.733], [0.112, 0.724], [0.092, 0.722]]],
      drl: [[[0.084, 0.736], [0.14, 0.748], [0.152, 0.744], [0.1, 0.734], [0.084, 0.731]]],
    },
  ],
  // Winglet duct in the upper-cowl flank: a long dark slot under a body-coloured lip.
  wingDuct: { poly: [[-1.57, 0.7], [-1.5, 0.692], [-1.4, 0.67], [-1.34, 0.628], [-1.4, 0.64], [-1.5, 0.666], [-1.565, 0.684]], lip: [-1.6, -1.33, 0.715, 0.64, 0.024] },
  cowl: [[-2, 2], [-1.29, 2], [-1.29, 0.93], [-1.32, 0.8], [-1.36, 0.7], [-1.4, 0.6], [-2, 0.56]],
  belly: [[-1.12, 0.31], [-0.94, 0.295], [-0.72, 0.29], [-0.4, 0.29], [-0.4, -1], [-1.12, -1]],
  vents: [
    { poly: [[-1.27, 0.86], [-1.12, 0.855], [-0.99, 0.82], [-0.955, 0.795], [-1.05, 0.776], [-1.21, 0.79]], fins: 2 },
    // Lower radiator outlet, kept clear of the front-wheel arch.
    { poly: [[-1.1, 0.585], [-1.0, 0.612], [-0.9, 0.59], [-0.86, 0.5], [-0.94, 0.475], [-1.06, 0.5]], fins: 2, slope: 0.016 },
  ],
  inner: {
    top: [[SCREEN_BASE + 0.05, 0.86], [-1.3, 0.895], [-1.13, 0.925]],
    bottom: [[SCREEN_BASE + 0.05, 0.76], [-1.13, 0.8]],
    half: [[SCREEN_BASE + 0.05, 0.12], [-1.3, 0.165], [-1.13, 0.19]],
  },
  // Taller smoked screen (2021+), rising steeply from the beak.
  screen: {
    zs: [SCREEN_BASE, SCREEN_TOP_Z],
    top: [[SCREEN_BASE, 0.9], [-1.45, 0.96], [-1.34, 1.05], [-1.23, 1.135], [-1.16, 1.175], [SCREEN_TOP_Z, 1.183]],
    bottom: [[SCREEN_BASE, 0.888], [-1.3, 0.932], [SCREEN_TOP_Z, 0.972]],
    half: [[SCREEN_BASE, 0.145], [-1.38, 0.19], [-1.22, 0.172], [SCREEN_TOP_Z, 0.125]],
    tint: '#3a4048',
  },
  tank: {
    front: -1.12,
    back: -0.6,
    top: 1.07,
    bottomFront: 0.9,
    bottomBack: 0.8,
    width: 0.46,
    style: 'sport',
    knee: 0.16,
    capZ: -0.9,
    topLine: [[-1.12, 0.958], [-1.04, 0.995], [-0.95, 1.045], [-0.85, 1.07], [-0.76, 1.06], [-0.68, 1.01], [-0.63, 0.945], [-0.6, 0.9]],
    bottomLine: [[-1.12, 0.9], [-0.96, 0.865], [-0.78, 0.83], [-0.6, 0.8]],
    halfLine: [[-1.12, 0.12], [-1.03, 0.185], [-0.92, 0.226], [-0.8, 0.222], [-0.7, 0.19], [-0.6, 0.12]],
  },
  seat: { front: -0.63, back: -0.27, yFront: 0.828, y: 0.835, yBack: 0.86, width: 0.28, thick: 0.07, frontWidth: 0.18 },
  pillion: { front: -0.25, back: 0.0, yFront: 0.935, y: 0.945, yBack: 0.962, width: 0.19, thick: 0.05, frontWidth: 0.15 },
  tail: {
    z0: -0.68,
    z1: 0.115,
    top: [[-0.68, 0.84], [-0.5, 0.847], [-0.3, 0.868], [-0.235, 0.922], [-0.08, 0.968], [0.04, 1.005], [0.115, 1.036]],
    bottom: [[-0.68, 0.7], [-0.4, 0.722], [-0.15, 0.775], [0.0, 0.862], [0.08, 0.942], [0.115, 0.985]],
    half: [[-0.68, 0.16], [-0.45, 0.15], [-0.22, 0.127], [0.0, 0.095], [0.08, 0.065], [0.115, 0.04]],
  },
  seatHole: {
    rider: [[-0.8, 0.82], [-0.262, 0.82], [-0.262, 1.4], [-0.8, 1.4]],
    pillion: [[-0.252, 0.925], [0.01, 0.925], [0.01, 1.4], [-0.252, 1.4]],
    plan: [[-0.8, -0.01], [0.02, -0.01], [0.02, 0.098], [-0.25, 0.098], [-0.26, 0.142], [-0.8, 0.142]],
  },
  tailVent: [[-0.2, 0.83], [-0.05, 0.885], [0.05, 0.93], [0.02, 0.885], [-0.12, 0.818]],
  undertray: { z0: -0.45, z1: 0.1, top: [[-0.45, 0.74], [0.1, 0.955]], bottom: [[-0.45, 0.69], [-0.1, 0.745], [0.1, 0.915]], half: [[-0.45, 0.14], [0.1, 0.05]] },
  // LED tail light in the tip: a slim V under the tail point.
  tailLight: { outline: [[-0.08, 0.01], [-0.03, -0.006], [0, -0.01], [0.03, -0.006], [0.08, 0.01], [0.072, 0.018], [0, 0.006], [-0.072, 0.018]], at: [0, 0.945, 0.088], tilt: -0.62 },
  fender: { from: -0.62, to: 0.82, width: 0.155 },
  plate: { fromZ: 0.0, fromY: 0.79 },
  fasteners: [[-1.26, 0.87], [-1.0, 0.8], [-0.82, 0.55], [-0.98, 0.33], [-0.64, 0.3], [-1.47, 0.79]],
};

export const ZX10R_LIVERY_GEO: KawaLiveryGeo = {
  lower: [[-1.66, 0.6], [-1.42, 0.56], [-1.12, 0.5], [-0.86, 0.52], [-0.6, 0.6], [-0.4, 0.66], [-0.4, -0.1], [-1.7, -0.1]],
  splitLine: [[-1.66, 0.608], [-1.42, 0.568], [-1.12, 0.508], [-0.86, 0.528], [-0.6, 0.608], [-0.4, 0.668]],
  slash: [[-1.24, 0.5], [-1.08, 0.48], [-0.82, 0.62], [-0.74, 0.74], [-0.8, 0.76], [-0.92, 0.64]],
  tailLower: [[-0.66, 0.735], [-0.2, 0.8], [0.05, 0.88], [0.2, 0.94], [0.2, 0.6], [-0.66, 0.6]],
  tailLine: [[-0.62, 0.746], [-0.2, 0.812], [0.05, 0.892], [0.17, 0.95]],
  chin: [[-1.72, 0.735], [-1.6, 0.7], [-1.5, 0.64], [-1.6, 0.6], [-1.72, 0.6]],
  frontLowerY: 0.705,
  tankStripe: [-1.12, -0.6, 0.03],
  texts: [
    { str: 'Ninja', z: -0.86, y: 0.42, size: 0.065, role: 'model' },
    { str: 'ZX-10R', z: -0.08, y: 0.82, size: 0.026, role: 'model' },
    { str: 'KAWASAKI', z: -1.36, y: 0.83, size: 0.024, role: 'logo' },
    { str: 'KRT', z: -0.42, y: 0.25, size: 0.03, role: 'accent' },
  ],
  topText: { str: 'ZX-10R', z: 0.02, size: 0.03 },
};

/** Pearl Robotic White over Metallic Carbon Gray with green pinstripes. */
const ROBOTIC_WHITE: KawaScheme = {
  base: '#eef0f2',
  baseFinish: 'pearl',
  lower: '#4a4e55',
  lowerFinish: 'metallic',
  stripe: '#5fd02c',
  slash: false,
  model: '#eef0f2',
  logo: '#1b1c1f',
  accent: '#5fd02c',
};

export const zx10rLivery = kawaLivery(ZX10R_LIVERY_GEO, [KRT, ROBOTIC_WHITE]);

export function zx10rBlueprint(spec: BikeSpec): BikeBlueprint {
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.085, 0.75, 1.185],
    wheelbase: 1.45,
    rakeDeg: 25.0,
    trail: 0.107,
    forkLength: 0.735,
    front: { tyre: '120/70ZR17', rimWidthIn: 3.5, crown: 0.82, tread: 'sport', tyreLabel: 'Sport Radial RS' },
    rear: { tyre: '190/55ZR17', rimWidthIn: 6.0, crown: 0.92, tread: 'sport', tyreLabel: 'Sport Radial RS' },
    frontWheel: { type: 'cast', spokes: 3, shape: 'split', color: '#16171a', stripe: '#5fd02c' },
    rearWheel: { type: 'cast', spokes: 3, shape: 'split', color: '#16171a', stripe: '#5fd02c' },
    // Showa Balance Free Front fork: gold outer tubes, black axle feet.
    fork: { type: 'usd', stanchion: 0.043, spacing: 0.21, outerColor: '#b8913a', innerColor: '#c9ccd1', footColor: '#1e1f22', capColor: '#2a2c30', adjusterColor: '#c99a2c', label: 'BFF', labelColor: '#1b1c1f', aboveClamp: 0.01, clampGap: 0.205 },
    frontBrake: { discs: 2, discDia: 0.33, disc: 'semiFloating', carrierColor: '#2a2c30', caliper: 'radialMono4', caliperColor: '#3d4045', caliperText: 'brembo', caliperTextColor: '#d01c1c', caliperAngleDeg: 76 },
    rearBrake: { discs: 1, discDia: 0.22, disc: 'fixed', carrierColor: '#2a2c30', caliper: 'axial1', caliperColor: '#2a2c30', caliperAngleDeg: 200 },
    frame: { type: 'twinSpar', color: '#26272a', metal: 0.7, rough: 0.42, subframe: 'cast', subframeColor: '#1e1f22', width: 0.37 },
    swingarm: { type: 'braced', length: 0.585, angleDeg: 10, color: '#26272a', metal: 0.7, rough: 0.42 },
    shock: { layout: 'mono', springColor: '#2a2c30', bodyColor: '#b8913a', reservoir: true },
    drive: { type: 'chain', side: 'left', frontTeeth: 17, rearTeeth: 40, pitch: 0.015875, sprocketColor: '#1d1e21' },
    engine: {
      layout: 'I4',
      cc: 998,
      crank: [0, 0.405, -0.8],
      tiltDeg: 31,
      caseColor: '#1e1f22',
      coverColor: '#3a3c40',
      headColor: '#26272a',
      camCoverColor: '#1a1b1e',
      camCoverText: 'Kawasaki',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.44, h: 0.35, z: -1.23, y: 0.6, tiltDeg: 14, curved: true },
      width: 0.42,
    },
    exhaust: { route: 'sideCan', side: 'right', can: 'hex', canLength: 0.4, canDia: 0.13, canFinish: 'steel', headerFinish: 'steel', outlet: [0.175, 0.53, 0.02] },
    cockpit: {
      bars: 'clipon',
      grip: [0.33, 0.9, -0.965],
      barDia: 0.022,
      dash: 'tft',
      dashPos: [0, 1.035, -1.085],
      dashSize: [0.11, 0.066],
      dashTiltDeg: 48,
      dashMount: 'fairing',
      mirrors: 'fairing',
      mirrorPos: [0.335, 1.015, -1.2],
      mirrorSize: [0.14, 0.062],
      mirrorIndicators: true,
      mirrorShape: 'sport',
      mirrorColor: '#0d0e10',
      topClamp: 'milled',
      steeringDamper: 'top',
      leverColor: '#1e1f22',
      reservoirs: true,
      clutch: 'cable',
      ignition: 'clamp',
      switchColor: '#151618',
      gripColor: '#121212',
      barEndColor: '#1d1e21',
    },
    lights: { head: 'custom', tail: 'custom', rearIndicators: 'stalk' },
    seat: { height: 0.835, front: -0.63, back: -0.27, pillion: 'seat', color: '#151515' },
    rider: { hip: [0, 0.925, -0.45], peg: [0.19, 0.4, -0.42], torsoPitch: 0.74 },
    footrests: 'rearset',
    plate: { mount: 'hanger', pos: [0, 0.6, 0.39], tiltDeg: -14 },
    body: zxBody(ZX10R_BODY),
    livery: zx10rLivery,
    groundClearance: 0.135,
    features: ['winglets'],
    zones: { splitY: 0.5, decal: [-0.86, 0.43] },
  };
}
