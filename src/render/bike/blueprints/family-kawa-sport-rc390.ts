import type { BikeSpec, Livery } from '../../../data/bikes';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv } from '../livery';
import type { P2 } from '../mesh';
import type { BikeBlueprint } from '../types';
import { zxBody, type ZxBody } from './family-kawa-sport-zx';

/**
 * KTM RC 390 (2022+).
 * Spec sheet: wheelbase 1343 mm, steering head angle 66.5° (rake 23.5°), trail 84 mm,
 * seat 824 mm, ground clearance 158 mm, 110/70R17 + 150/60R17, WP APEX 43 open-cartridge
 * fork, WP APEX monoshock, orange steel trellis frame with a bolt-on subframe, single
 * 320 mm disc with a radial four-piston ByBre caliper, 230 mm rear disc, 373 cc single,
 * stainless primary + aluminium secondary silencer on the right, 13.7 L tank, TFT.
 * Design cues: angular, faceted full fairing derived from the RC16 — a blunt face with a
 * central LED headlight cluster (two stacked LED blocks framed by DRL blades), a large
 * screen, layered side panels with outlets, orange trellis and orange wheels, short
 * mid-mounted side silencer, sharp high tail with the LED light in the tip.
 */

const NOSE = -1.565;
const SCREEN_BASE = -1.47;
const SCREEN_TOP_Z = -1.03;

// Crisp, faceted sections (KTM's angular surfacing): creases at the shoulder (2) and the
// lower flank (5).
const FACE: P2[] = [[0, 1], [0.46, 0.97], [0.8, 0.86], [0.97, 0.66], [1, 0.46], [0.97, 0.26], [0.7, 0.08], [0.35, 0.01], [0, 0]];
const COWL: P2[] = [[0, 1], [0.36, 0.985], [0.66, 0.93], [0.86, 0.8], [0.96, 0.6], [1, 0.4], [0.95, 0.18], [0.82, 0.05], [0.7, 0]];
const SIDE: P2[] = [[0, 1], [0.4, 0.99], [0.7, 0.95], [0.88, 0.82], [0.96, 0.64], [1, 0.42], [0.97, 0.2], [0.88, 0.06], [0.6, 0]];
const BACK: P2[] = [[0, 1], [0.44, 0.99], [0.74, 0.95], [0.9, 0.82], [0.97, 0.64], [1, 0.42], [0.96, 0.2], [0.85, 0.06], [0.5, 0]];

export const RC390_BODY: ZxBody = {
  fairing: {
    zs: [NOSE, -1.562, -1.556, -1.546, -1.53, -1.505, -1.47, -1.42, -1.36, -1.29, -1.21, -1.12, -1.02, -0.92, -0.82, -0.72, -0.62, -0.52],
    top: [[NOSE, 0.8], [-1.54, 0.836], [-1.48, 0.868], [-1.4, 0.898], [-1.3, 0.924], [-1.18, 0.944], [-1.06, 0.94], [-0.9, 0.9], [-0.72, 0.82], [-0.52, 0.73]],
    bottom: [[NOSE, 0.775], [-1.563, 0.7], [-1.556, 0.66], [-1.54, 0.63], [-1.5, 0.61], [-1.44, 0.596], [-1.36, 0.52], [-1.26, 0.38], [-1.14, 0.26], [-1.0, 0.2], [-0.84, 0.19], [-0.66, 0.2], [-0.52, 0.22]],
    half: [[NOSE, 0.045], [-1.56, 0.085], [-1.55, 0.1], [-1.52, 0.13], [-1.47, 0.168], [-1.4, 0.206], [-1.3, 0.244], [-1.18, 0.272], [-1.04, 0.283], [-0.88, 0.275], [-0.7, 0.245], [-0.52, 0.2]],
    sections: [
      { z: NOSE, pts: FACE },
      { z: -1.5, pts: FACE },
      { z: -1.36, pts: COWL },
      { z: -1.0, pts: SIDE },
      { z: -0.52, pts: BACK },
    ],
    creases: [2, 5],
  },
  sideEdge: [[-1.0, 0.93], [-0.94, 0.9], [-0.88, 0.83], [-0.83, 0.7], [-0.79, 0.56], [-0.74, 0.42], [-0.68, 0.31], [-0.6, 0.25], [-0.54, 0.22], [-0.49, 0.0]],
  archR: 0.355,
  underScreen: { base: SCREEN_BASE, rear: -0.98, y: 0.88, half: [0.12, 0.16] },
  // Small chin slot under the headlight cluster.
  intake: { poly: [[0, 0.656], [0.048, 0.656], [0.06, 0.646], [0.05, 0.632], [0, 0.63]], zMax: -1.48, depth: 0.04 },
  heads: [
    {
      // Central cluster: one opening across the nose, two stacked LED blocks, DRL blades either side.
      // Angular pentagon: a sharp-cornered cluster (flat top, pointed outer corners, V chin).
      poly: [[0, 0.8], [0.03, 0.8], [0.058, 0.797], [0.08, 0.76], [0.078, 0.722], [0.05, 0.686], [0.02, 0.668], [0, 0.664]],
      zMax: -1.5,
      sharp: [2, 3, 4, 7],
      emit: [
        [[0, 0.768], [0.036, 0.768], [0.046, 0.752], [0.036, 0.738], [0, 0.738]],
        [[0, 0.724], [0.03, 0.724], [0.04, 0.708], [0.026, 0.694], [0, 0.692]],
      ],
      drl: [[[0.054, 0.792], [0.073, 0.76], [0.072, 0.724], [0.064, 0.722], [0.066, 0.758], [0.048, 0.787]]],
    },
  ],
  wingDuct: null,
  cowl: [[-2, 2], [-1.25, 2], [-1.25, 0.92], [-1.28, 0.8], [-1.32, 0.68], [-1.38, 0.58], [-2, 0.55]],
  belly: [[-1.02, 0.33], [-0.9, 0.31], [-0.7, 0.3], [-0.4, 0.3], [-0.4, -1], [-1.02, -1]],
  vents: [
    { poly: [[-1.2, 0.845], [-1.06, 0.846], [-0.95, 0.808], [-0.925, 0.785], [-1.02, 0.772], [-1.16, 0.786]], fins: 1 },
    { poly: [[-1.06, 0.625], [-0.96, 0.645], [-0.87, 0.605], [-0.84, 0.51], [-0.91, 0.49], [-1.01, 0.525]], fins: 2, slope: 0.016 },
  ],
  inner: {
    top: [[SCREEN_BASE + 0.05, 0.865], [-1.2, 0.9], [-1.04, 0.925]],
    bottom: [[SCREEN_BASE + 0.05, 0.77], [-1.04, 0.8]],
    half: [[SCREEN_BASE + 0.05, 0.12], [-1.2, 0.16], [-1.04, 0.18]],
  },
  // Large, wide screen.
  screen: {
    zs: [SCREEN_BASE, SCREEN_TOP_Z],
    top: [[SCREEN_BASE, 0.905], [-1.4, 0.975], [-1.3, 1.06], [-1.2, 1.118], [-1.1, 1.146], [SCREEN_TOP_Z, 1.15]],
    bottom: [[SCREEN_BASE, 0.89], [-1.25, 0.94], [SCREEN_TOP_Z, 0.968]],
    half: [[SCREEN_BASE, 0.168], [-1.3, 0.2], [-1.15, 0.186], [SCREEN_TOP_Z, 0.152]],
    tint: '#4a525a',
  },
  tank: {
    front: -1.02,
    back: -0.55,
    top: 1.03,
    bottomFront: 0.88,
    bottomBack: 0.79,
    width: 0.42,
    style: 'sport',
    knee: 0.15,
    capZ: -0.82,
    topLine: [[-1.02, 0.93], [-0.95, 0.97], [-0.86, 1.015], [-0.76, 1.03], [-0.67, 1.01], [-0.6, 0.96], [-0.55, 0.89]],
    bottomLine: [[-1.02, 0.88], [-0.85, 0.85], [-0.7, 0.82], [-0.55, 0.79]],
    halfLine: [[-1.02, 0.12], [-0.94, 0.18], [-0.84, 0.212], [-0.74, 0.208], [-0.64, 0.18], [-0.55, 0.12]],
  },
  seat: { front: -0.58, back: -0.25, yFront: 0.818, y: 0.824, yBack: 0.85, width: 0.26, thick: 0.07, frontWidth: 0.17 },
  pillion: { front: -0.23, back: 0.02, yFront: 0.925, y: 0.935, yBack: 0.952, width: 0.18, thick: 0.05, frontWidth: 0.14 },
  tail: {
    z0: -0.62,
    z1: 0.12,
    top: [[-0.62, 0.83], [-0.45, 0.836], [-0.28, 0.86], [-0.215, 0.912], [-0.06, 0.958], [0.06, 0.998], [0.12, 1.02]],
    bottom: [[-0.62, 0.7], [-0.35, 0.72], [-0.12, 0.78], [0.02, 0.87], [0.09, 0.95], [0.12, 0.985]],
    half: [[-0.62, 0.15], [-0.4, 0.14], [-0.2, 0.12], [0.0, 0.09], [0.09, 0.055], [0.12, 0.03]],
    tipSection: [[0, 1], [0.8, 0.97], [1, 0.7], [0.96, 0.4], [0.8, 0.16], [0.4, 0.02], [0, 0]],
  },
  seatHole: {
    rider: [[-0.8, 0.81], [-0.242, 0.81], [-0.242, 1.4], [-0.8, 1.4]],
    pillion: [[-0.232, 0.918], [0.03, 0.918], [0.03, 1.4], [-0.232, 1.4]],
    plan: [[-0.8, -0.01], [0.04, -0.01], [0.04, 0.092], [-0.23, 0.092], [-0.24, 0.132], [-0.8, 0.132]],
  },
  tailVent: [[-0.17, 0.84], [-0.04, 0.892], [0.05, 0.93], [0.02, 0.888], [-0.1, 0.83]],
  undertray: { z0: -0.42, z1: 0.1, top: [[-0.42, 0.73], [0.1, 0.95]], bottom: [[-0.42, 0.68], [-0.1, 0.74], [0.1, 0.91]], half: [[-0.42, 0.13], [0.1, 0.05]] },
  tailLight: { outline: [[-0.065, 0.0], [0.065, 0.0], [0.072, 0.012], [0, 0.017], [-0.072, 0.012]], at: [0, 0.952, 0.095], tilt: -0.62 },
  fender: { from: -0.6, to: 0.8, width: 0.14 },
  plate: { fromZ: 0.0, fromY: 0.78 },
  fasteners: [[-1.22, 0.86], [-0.98, 0.8], [-0.8, 0.55], [-0.98, 0.35], [-0.62, 0.3], [-1.42, 0.8]],
};

/** KTM Electronic Orange with black lower panels and blue accents. */
function rc390Livery(c: LiveryCanvas, _lv: Livery, _env: LiveryEnv): void {
  const orange = '#ff6600', black = '#16171a', blue = '#1f63c6', white = '#f3f4f6';
  c.views(ALL_VIEWS, (p) => {
    p.fill(orange, 'gloss');
    if (p.view === 'right' || p.view === 'left') {
      // Black lower side panel and belly, rising to the footrest; black tank cover.
      p.poly([[-1.58, 0.64], [-1.36, 0.6], [-1.12, 0.54], [-0.9, 0.5], [-0.62, 0.5], [-0.4, 0.55], [-0.4, -0.1], [-1.7, -0.1]], black, 'gloss');
      p.poly([[-1.02, 0.84], [-0.55, 0.78], [-0.55, 1.2], [-1.02, 1.2]], black, 'gloss');
      // Blue accent blades along the split and on the tail.
      p.poly([[-1.5, 0.66], [-1.2, 0.6], [-0.95, 0.56], [-0.92, 0.58], [-1.18, 0.625], [-1.48, 0.69]], blue, 'gloss');
      p.poly([[-0.5, 0.82], [0.12, 0.95], [0.12, 0.97], [-0.5, 0.85]], blue, 'gloss');
      // Tail: black lower edge.
      p.poly([[-0.62, 0.78], [0.2, 0.92], [0.2, 0.6], [-0.62, 0.6]], black, 'gloss');
      p.text('RC 390', -0.86, 0.42, { color: white, size: 0.05, weight: '900', italic: true, stretch: 1.05 });
      p.text('KTM', -1.32, 0.8, { color: black, size: 0.05, weight: '900', italic: true });
      p.text('READY TO RACE', -0.1, 0.885, { color: white, size: 0.014, weight: '800', italic: true });
    } else if (p.view === 'front') {
      // Black frame around the headlight cluster and the chin.
      p.rect(-1, -1, 1, 0.645, black, 'gloss');
      p.poly([[-0.07, 0.815], [0.07, 0.815], [0.098, 0.765], [0.094, 0.715], [0.04, 0.655], [-0.04, 0.655], [-0.094, 0.715], [-0.098, 0.765]], black, 'gloss');
    } else if (p.view === 'top') {
      p.rect(-1.02, -0.3, -0.55, 0.3, black, 'gloss');
      p.rect(-0.95, -0.012, -0.6, 0.012, blue, 'gloss');
    } else if (p.view === 'rear') {
      p.rect(-1, -1, 1, 0.9, black, 'gloss');
    }
  });
}

export function rc390Blueprint(spec: BikeSpec): BikeBlueprint {
  return {
    id: spec.id,
    source: 'authored',
    overall: [1.98, 0.69, 1.15],
    wheelbase: 1.343,
    rakeDeg: 23.5,
    trail: 0.084,
    forkLength: 0.712,
    front: { tyre: '110/70R17', rimWidthIn: 3.0, crown: 0.86, tread: 'sport', tyreLabel: 'Race Attack' },
    rear: { tyre: '150/60R17', rimWidthIn: 4.0, crown: 0.92, tread: 'sport', tyreLabel: 'Race Attack' },
    frontWheel: { type: 'cast', spokes: 5, shape: 'split', color: '#ff6600' },
    rearWheel: { type: 'cast', spokes: 5, shape: 'split', color: '#ff6600' },
    // WP APEX 43: black outer tubes, orange damping adjusters on top.
    fork: { type: 'usd', stanchion: 0.043, spacing: 0.19, outerColor: '#1e1f22', innerColor: '#c9ccd1', footColor: '#1e1f22', capColor: '#1e1f22', adjusterColor: '#ff6600', label: 'WP', labelColor: '#f3f4f6', aboveClamp: 0.012, clampGap: 0.19 },
    frontBrake: { discs: 1, discDia: 0.32, disc: 'fixed', carrierColor: '#2a2c30', caliper: 'radial4', caliperColor: '#1e1f22', caliperText: 'ByBre', caliperTextColor: '#f3f4f6', caliperAngleDeg: 72 },
    rearBrake: { discs: 1, discDia: 0.23, disc: 'fixed', carrierColor: '#2a2c30', caliper: 'axial1', caliperColor: '#1e1f22', caliperAngleDeg: 200 },
    frame: { type: 'trellis', color: '#ff6600', metal: 0.3, rough: 0.32, subframe: 'tubular', subframeColor: '#1c1d20', width: 0.3 },
    swingarm: { type: 'banana', length: 0.55, angleDeg: 10, color: '#1e1f22', metal: 0.6, rough: 0.45 },
    shock: { layout: 'mono', springColor: '#ff6600', bodyColor: '#1e1f22', reservoir: false },
    drive: { type: 'chain', side: 'left', frontTeeth: 15, rearTeeth: 45, pitch: 0.015875, sprocketColor: '#1d1e21' },
    engine: {
      layout: 'SINGLE',
      cc: 373,
      crank: [0, 0.36, -0.7],
      tiltDeg: 12,
      caseColor: '#1e1f22',
      coverColor: '#2e3034',
      headColor: '#26272a',
      camCoverColor: '#1a1b1e',
      camCoverText: 'KTM',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.26, h: 0.26, z: -1.06, y: 0.56, tiltDeg: 10, curved: false },
      width: 0.27,
    },
    // Mid-mounted side silencer under the right footrest hanger (black shroud, steel end cap).
    exhaust: { route: 'sideCan', side: 'right', can: 'oval', canLength: 0.3, canDia: 0.12, canFinish: 'black', headerFinish: 'steel', outlet: [0.17, 0.46, -0.1] },
    cockpit: {
      bars: 'clipon',
      grip: [0.32, 0.93, -0.9],
      barDia: 0.022,
      dash: 'tft',
      dashPos: [0, 1.015, -1.025],
      dashSize: [0.11, 0.07],
      dashTiltDeg: 46,
      dashMount: 'fairing',
      mirrors: 'fairing',
      mirrorPos: [0.31, 0.985, -1.1],
      mirrorSize: [0.13, 0.064],
      mirrorIndicators: true,
      mirrorShape: 'rect',
      mirrorColor: '#16171a',
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
    seat: { height: 0.824, front: -0.58, back: -0.25, pillion: 'seat', color: '#151515' },
    rider: { hip: [0, 0.91, -0.41], peg: [0.18, 0.4, -0.4], torsoPitch: 0.66 },
    footrests: 'rearset',
    plate: { mount: 'hanger', pos: [0, 0.58, 0.37], tiltDeg: -14 },
    body: zxBody(RC390_BODY),
    livery: rc390Livery,
    groundClearance: 0.158,
    features: [],
    zones: { splitY: 0.52, decal: [-0.86, 0.42] },
  };
}
