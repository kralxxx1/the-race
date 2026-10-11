import type { BikeSpec } from '../../../data/bikes';
import type { BikeBlueprint } from '../types';
import { KRT, kawaLivery, remapLiveryGeo, type KawaScheme } from './family-kawa-sport-livery';
import { remapZxBody, zxBody, type ZxBody } from './family-kawa-sport-zx';
import { ZX10R_BODY, ZX10R_LIVERY_GEO } from './family-kawa-sport-zx10r';

/**
 * Kawasaki Ninja ZX-6R (2024, 636 cc).
 * Spec sheet: wheelbase 1400 mm, rake 23.5°, trail 101 mm, seat 830 mm,
 * L×W×H 2025 × 710 × 1100 mm, ground clearance 130 mm, 120/70ZR17 + 180/55ZR17,
 * 41 mm Showa SFF-BP fork, bottom-link Uni-Trak, aluminium perimeter frame,
 * dual 310 mm semi-floating petal discs with radial monobloc four-pistons,
 * pre-chamber under the engine and a short silencer on the right, 4.3" TFT.
 * Design cues (2024 facelift): the ZX-10R family face — pointed beak with the ram-air
 * mouth at its tip, bigger twin LED headlights with a DRL brow — but no winglet ducts,
 * a lower screen and a more compact 636 package.
 */

/** ZX-10R → ZX-6R: the front half moves back 50 mm (shorter wheelbase), the tail stays. */
const S = (z: number): number => z + 0.05 * Math.max(0, Math.min(1, (-0.55 - z) / 0.5));

const BASE = remapZxBody(ZX10R_BODY, S);

const SCREEN_BASE = S(-1.535);
const SCREEN_TOP_Z = S(-1.13);

export const ZX6R_BODY: ZxBody = {
  ...BASE,
  wingDuct: null,
  heads: [
    {
      poly: [[0.074, 0.725], [0.098, 0.738], [0.145, 0.745], [0.162, 0.736], [0.156, 0.716], [0.122, 0.706], [0.088, 0.703], [0.072, 0.712]],
      zMax: S(-1.54),
      // Low-beam projector block inboard, high-beam block outboard, DRL brow along the top.
      emit: [
        [[0.088, 0.722], [0.112, 0.728], [0.114, 0.716], [0.09, 0.712]],
        [[0.122, 0.73], [0.148, 0.736], [0.15, 0.724], [0.124, 0.718]],
      ],
      drl: [[[0.08, 0.733], [0.145, 0.745], [0.156, 0.739], [0.098, 0.73], [0.08, 0.728]]],
    },
  ],
  // Lower screen than the ZX-10R's.
  screen: {
    zs: [SCREEN_BASE, SCREEN_TOP_Z],
    top: [[SCREEN_BASE, 0.9], [S(-1.45), 0.955], [S(-1.34), 1.03], [S(-1.24), 1.08], [S(-1.17), 1.098], [SCREEN_TOP_Z, 1.1]],
    bottom: [[SCREEN_BASE, 0.888], [S(-1.3), 0.93], [SCREEN_TOP_Z, 0.965]],
    half: [[SCREEN_BASE, 0.142], [S(-1.38), 0.185], [S(-1.22), 0.168], [SCREEN_TOP_Z, 0.13]],
    tint: '#3a4048',
  },
  vents: [
    { poly: BASE.vents[0].poly, fins: 2 },
    { poly: [[S(-1.12), 0.58], [S(-1.02), 0.61], [S(-0.92), 0.585], [S(-0.88), 0.49], [S(-0.96), 0.47], [S(-1.08), 0.495]], fins: 3, slope: 0.016 },
  ],
};

const FLAT_SPARK_BLACK: KawaScheme = {
  base: '#26282c',
  baseFinish: 'matte',
  lower: '#141518',
  lowerFinish: 'gloss',
  stripe: '#5fd02c',
  slash: false,
  model: '#5fd02c',
  logo: '#8a8f96',
  accent: '#5fd02c',
};

const GEO = remapLiveryGeo(ZX10R_LIVERY_GEO, S, [
  { str: 'Ninja', z: S(-0.86), y: 0.42, size: 0.065, role: 'model' },
  { str: 'ZX-6R', z: -0.05, y: 0.865, size: 0.028, role: 'model' },
  { str: 'KAWASAKI', z: S(-1.36), y: 0.83, size: 0.024, role: 'logo' },
  { str: '636', z: S(-1.1), y: 0.69, size: 0.045, role: 'model' },
]);

export function zx6rBlueprint(spec: BikeSpec): BikeBlueprint {
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.025, 0.71, 1.1],
    wheelbase: 1.4,
    rakeDeg: 23.5,
    trail: 0.101,
    forkLength: 0.72,
    front: { tyre: '120/70ZR17', rimWidthIn: 3.5, crown: 0.82, tread: 'sport', tyreLabel: 'Sport Radial S' },
    rear: { tyre: '180/55ZR17', rimWidthIn: 5.5, crown: 0.9, tread: 'sport', tyreLabel: 'Sport Radial S' },
    frontWheel: { type: 'cast', spokes: 3, shape: 'split', color: '#16171a', stripe: '#5fd02c' },
    rearWheel: { type: 'cast', spokes: 3, shape: 'split', color: '#16171a', stripe: '#5fd02c' },
    fork: { type: 'usd', stanchion: 0.041, spacing: 0.205, outerColor: '#b8913a', innerColor: '#c9ccd1', footColor: '#1e1f22', capColor: '#2a2c30', adjusterColor: '#c99a2c', label: 'SFF-BP', labelColor: '#1b1c1f', aboveClamp: 0.01, clampGap: 0.2 },
    frontBrake: { discs: 2, discDia: 0.31, disc: 'wave', carrierColor: '#2a2c30', caliper: 'radialMono4', caliperColor: '#2b2d31', caliperText: 'NISSIN', caliperTextColor: '#d6d8db', caliperAngleDeg: 76 },
    rearBrake: { discs: 1, discDia: 0.22, disc: 'wave', carrierColor: '#2a2c30', caliper: 'axial1', caliperColor: '#2a2c30', caliperAngleDeg: 200 },
    frame: { type: 'twinSpar', color: '#26272a', metal: 0.7, rough: 0.42, subframe: 'cast', subframeColor: '#1e1f22', width: 0.35 },
    swingarm: { type: 'braced', length: 0.565, angleDeg: 10, color: '#26272a', metal: 0.7, rough: 0.42 },
    shock: { layout: 'mono', springColor: '#2a2c30', bodyColor: '#3a3c40', reservoir: true },
    drive: { type: 'chain', side: 'left', frontTeeth: 16, rearTeeth: 43, pitch: 0.015875, sprocketColor: '#1d1e21' },
    engine: {
      layout: 'I4',
      cc: 636,
      crank: [0, 0.4, -0.765],
      tiltDeg: 33,
      caseColor: '#1e1f22',
      coverColor: '#3a3c40',
      headColor: '#26272a',
      camCoverColor: '#1a1b1e',
      camCoverText: 'Kawasaki',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.4, h: 0.32, z: -1.18, y: 0.6, tiltDeg: 14, curved: true },
      width: 0.39,
    },
    // Pre-chamber under the engine feeds a short angular silencer tucked under the right footrest hanger.
    exhaust: { route: 'sideCan', side: 'right', can: 'hex', canLength: 0.28, canDia: 0.12, canFinish: 'steel', headerFinish: 'steel', outlet: [0.17, 0.47, -0.06] },
    cockpit: {
      bars: 'clipon',
      grip: [0.325, 0.905, -0.94],
      barDia: 0.022,
      dash: 'tft',
      dashPos: [0, 1.025, -1.055],
      dashSize: [0.105, 0.064],
      dashTiltDeg: 48,
      dashMount: 'fairing',
      mirrors: 'fairing',
      mirrorPos: [0.325, 1.0, -1.165],
      mirrorSize: [0.135, 0.06],
      mirrorIndicators: true,
      mirrorShape: 'sport',
      mirrorColor: '#0d0e10',
      topClamp: 'milled',
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
    seat: { height: 0.83, front: S(-0.63), back: S(-0.27), pillion: 'seat', color: '#151515' },
    rider: { hip: [0, 0.92, -0.44], peg: [0.185, 0.4, -0.41], torsoPitch: 0.74 },
    footrests: 'rearset',
    plate: { mount: 'hanger', pos: [0, 0.6, 0.38], tiltDeg: -14 },
    body: zxBody(ZX6R_BODY),
    livery: kawaLivery(GEO, [KRT, FLAT_SPARK_BLACK]),
    groundClearance: 0.13,
    features: [],
    zones: { splitY: 0.5, decal: [S(-0.86), 0.42] },
  };
}
