import * as THREE from 'three';
import type { BikeSpec, Livery } from '../../../data/bikes';
import { T, mul, type KitContext } from '../context';
import { PAINT, buildSeat, buildTank, seatFinish } from '../kit/body';
import { can, clampRing, heatShield, pipe, portFlange } from '../kit/cruisers-exhaust';
import { indicatorPod } from '../kit/lights';
import { plateHanger } from '../kit/rear';
import { classicHeadlamp, trellisFrame } from '../kit/retro-scooter-ev-classic';
import { buildVTwin60, castFinish } from '../kit/retro-scooter-ev-engines';
import { sideAt } from '../kit/shape';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv } from '../livery';
import { roundBox, type P3 } from '../mesh';
import { F, Micro, hard, tint, vary } from '../sink';
import type { BikeBlueprint } from '../types';
import { footPegs, pillionPegs, sideStand } from './family-cruisers-controls';
import { fenderArc, radiatorBlock, roundTailLamp, tubeAlong } from './family-cruisers-parts';

/**
 * Indian FTR 1200 S (2024): the flat-track roadster.
 * Spec sheet: wheelbase 1524 mm, rake 26°, seat 835 mm, 120/70R19 + 150/80R18 cast wheels, 43 mm USD fork, twin
 * 320 mm discs with radial calipers, 1203 cc liquid-cooled 60° V-twin, red steel trellis frame, remote-reservoir shock,
 * stacked twin silencers high on the right.
 * Design cues: round LED headlamp, round 4.3" TFT, faux-tank bodywork (the fuel cell is under the seat), flat-track bar,
 * flat seat with a short tail, exposed radiator, stacked high pipes.
 */

const STEEL = (): ReturnType<typeof hard> => hard('#b9bdc2', 1, 0.2, 0.2, Micro.brushed);
const BLACKCAN = (): ReturnType<typeof hard> => hard('#17181a', 0.5, 0.4, 0.6, Micro.grain);

function engineAndPipes(ctx: KitContext): void {
  const crank = ctx.bp.engine.crank;
  const ports = buildVTwin60(ctx, {
    crank,
    frontDeg: 42,
    barrelH: 0.125,
    headH: 0.085,
    fins: 7,
    camText: 'INDIAN',
    fin: {
      case: castFinish('#17181b', 0.5, 0.5),
      block: castFinish('#141518', 0.55, 0.45),
      edge: vary(F.polishedAlu, { rough: 0.22 }),
      cover: vary(F.brushedAlu, { micro: Micro.brushed, rough: 0.3 }),
      cam: castFinish('#1b1c1f', 0.5, 0.4),
      trim: vary(F.brushedAlu, { micro: Micro.brushed }),
    },
  });
  const [pf, pr] = ports;
  const r = 0.0205;
  const hdr = hard('#c7cacf', 1, 0.2, 0.2, Micro.brushed);
  // Front header: wraps down the front of the engine, back along the right, up into the lower silencer
  const front = pipe(ctx, [pf.pos, [pf.pos[0] + 0.01, pf.pos[1] - 0.04, pf.pos[2] - 0.05], [0.07, 0.4, pf.pos[2] - 0.1], [0.13, 0.3, -1.0], [0.17, 0.3, -0.8], [0.185, 0.4, -0.58], [0.19, 0.5, -0.5]], r, hdr);
  // Rear header: leaves the back of the rear cylinder to the right, up to the upper silencer
  const back = pipe(ctx, [pr.pos, [pr.pos[0] + 0.03, pr.pos[1] + 0.0, pr.pos[2] + 0.04], [0.11, pr.pos[1] + 0.04, pr.pos[2] + 0.02], [0.18, 0.6, -0.5], [0.19, 0.575, -0.46]], r, hdr);
  portFlange(ctx, pf.pos, pf.dir, r, vary(F.steel, { rough: 0.3 }));
  portFlange(ctx, pr.pos, pr.dir, r, vary(F.steel, { rough: 0.3 }));
  clampRing(ctx, front, Math.floor(front.length * 0.5), r, F.steel);
  clampRing(ctx, back, Math.floor(back.length * 0.45), r, F.steel);
  heatShield(ctx, front, Math.floor(front.length * 0.58), front.length - 4, r, hard('#1c1d20', 0.6, 0.4, 0.5, Micro.grain), { span: Math.PI * 1.1, centre: Math.PI * 0.35, slots: 5 });
  // Stacked silencers (lower fed by the front cylinder, upper by the rear), black with brushed end caps and a shared heat shield
  const lo: [P3, P3] = [[0.19, 0.5, -0.5], [0.205, 0.535, 0.16]];
  const up: [P3, P3] = [[0.19, 0.58, -0.46], [0.205, 0.615, 0.16]];
  for (const [a, b] of [lo, up]) can(ctx, a, b, { r: 0.037, kind: 'straight', f: BLACKCAN(), capF: STEEL(), slash: 0.24, slashDir: 'out', bands: 2, bandF: STEEL() });
  // Clamp bands joining the stack
  for (const z of [-0.36, -0.12, 0.08]) ctx.add('chassis', roundBox(0.1, 0.1, 0.012, 0.03, 1), STEEL(), mul(T(0.205, 0.575, z), new THREE.Matrix4().makeRotationX(-0.05)));
  // Hanger stays to the subframe
  tubeAlong(ctx, 'chassis', [[0.2, 0.58, -0.3], [0.14, 0.68, -0.3], [0.1, 0.72, -0.3]], 0.006, F.black);
  ctx.anchor('exhaustOutlet', [0.21, 0.62, 0.16]);
}

function tankAndSeat(ctx: KitContext, lv: Livery): void {
  const ob = buildTank(ctx, {
    front: -1.08,
    back: -0.52,
    top: 1.07,
    bottomFront: 0.9,
    bottomBack: 0.84,
    width: 0.3,
    style: 'muscle',
    knee: 0.1,
    capZ: -0.9,
    topLine: [[-1.08, 0.98], [-1.03, 1.03], [-0.95, 1.062], [-0.84, 1.07], [-0.72, 1.055], [-0.6, 1.025], [-0.52, 0.99]],
    bottomLine: [[-1.08, 0.9], [-0.95, 0.86], [-0.72, 0.84], [-0.52, 0.85]],
    halfLine: [[-1.08, 0.07], [-1.03, 0.115], [-0.95, 0.15], [-0.82, 0.16], [-0.68, 0.145], [-0.52, 0.1]],
  });
  // Flat-track style number-plate decal panel and the aluminium air-box lid are painted via the livery; add the black side scoops
  for (const s of [-1, 1]) {
    const b = sideAt(ob, -0.78, 0.92, s);
    ctx.add('chassis', roundBox(0.004, 0.06, 0.2, 0.002, 1), F.satinBlack, T(b.p[0] + s * 0.0015, b.p[1], b.p[2]));
  }
  // Long flat seat with the short tail
  buildSeat(ctx, { front: -0.58, back: 0.12, yFront: 0.875, y: 0.878, yBack: 0.9, width: 0.28, thick: 0.065, frontWidth: 0.17 }, tint(seatFinish(ctx), lv.seat));
  ctx.add('chassis', roundBox(0.19, 0.03, 0.2, 0.012, 2), tint(seatFinish(ctx), lv.seat), mul(T(0, 0.905, 0.1), new THREE.Matrix4().makeRotationX(-0.12)));
  trellisFrame(ctx, {
    f: hard(lv.frame, 0.3, 0.42, 0.7),
    r: 0.0135,
    upperY: 0.82,
    halfX: 0.14,
    lower: [[0.04, 0.84, -1.2], [0.1, 0.62, -1.17], [0.14, 0.42, -1.04], [0.145, 0.3, -0.88], [0.145, 0.27, -0.7], [0.15, 0.4, -0.58]],
    seatPost: [-0.5, 0.83],
    tail: [0.2, 0.86],
    tailX: 0.08,
    braces: 4,
    plate: F.darkAlu,
  });
}

function bodyParts(ctx: KitContext): void {
  const hp = ctx.hp;
  // Radiator between the lower tubes, with the front cowl
  radiatorBlock(ctx, { cx: 0, cy: 0.56, cz: -1.2, w: 0.2, h: 0.24, tiltDeg: 8 });
  tubeAlong(ctx, 'chassis', [[0.07, 0.66, -1.17], [0.1, 0.72, -1.05], [0.07, 0.74, -0.95]], 0.012, F.hose);
  // Short rear hugger fender, tail lamp, plate on a bracket, indicators
  fenderArc(ctx, { group: 'chassis', cz: 0, cy: hp.Rr, r: hp.Rr + 0.03, a0: 0.05, a1: 1.45, half: 0.1, drop: 0.052, power: 2.4, f: F.satinBlack, taper: [0.9, 0.82] });
  roundTailLamp(ctx, [0, 0.72, 0.31], 0.03, -0.3, 'chassis', F.glossBlack);
  plateHanger(ctx, { fromZ: 0.15, fromY: 0.7 });
  for (const s of [-1, 1]) indicatorPod(ctx, 'chassis', [s * 0.07, 0.62, 0.3], [s * 0.15, 0.62, 0.32], 0.014);
  // Front fender: short and high, flat-track style
  fenderArc(ctx, { group: 'forkLower', cz: hp.frontAxle[2], cy: hp.frontAxle[1], r: hp.Rf + 0.034, a0: -0.8, a1: 0.7, half: 0.085, drop: 0.045, power: 2.4, f: PAINT });
  classicHeadlamp(ctx, { r: 0.088, y: -0.14, chrome: false, led: true, trim: hard('#25272b', 0.7, 0.4, 0.5, Micro.cast), indicators: false });
  for (const s of [-1, 1]) indicatorPod(ctx, 'steer', [s * 0.13, 0.82, -1.19], [s * 0.19, 0.83, -1.2], 0.013);
  footPegs(ctx, { at: ctx.bp.rider.peg, f: hard('#202226', 0.5, 0.4, 0.5, Micro.cast), pivot: hp.pivot, peg: F.rubber });
  pillionPegs(ctx, [0.2, 0.5, 0.06], hard('#202226', 0.5, 0.4, 0.5, Micro.cast));
  sideStand(ctx);
}

function body(ctx: KitContext): void {
  tankAndSeat(ctx, ctx.livery);
  engineAndPipes(ctx);
  bodyParts(ctx);
}

// ───────────────────────────── livery ─────────────────────────────

function livery(c: LiveryCanvas, lv: Livery, _env: LiveryEnv): void {
  c.views(ALL_VIEWS, (p) => {
    p.fill(lv.primary, 'gloss');
    if (p.view === 'right' || p.view === 'left') {
      // Black lower tank band, white racing stripe, and the INDIAN lettering
      p.poly([[-1.08, 0.9], [-0.52, 0.85], [-0.52, 0.93], [-0.68, 0.945], [-0.85, 0.955], [-1.08, 0.97]], lv.secondary, 'satin');
      p.text('INDIAN', -0.8, 1.02, { color: '#f4f1e8', size: 0.034, weight: '800', spacing: 0.08, italic: true, finish: 'chrome' });
    }
    if (p.view === 'top') {
      p.rect(-1.1, -0.018, -0.5, -0.008, '#f1eee6', 'gloss');
      p.rect(-1.1, 0.008, -0.5, 0.018, '#f1eee6', 'gloss');
    }
    if (p.view === 'front') p.text('FTR', 0, 0.62, { color: '#f4f1e8', size: 0.05, weight: '900', spacing: 0.1, finish: 'gloss' });
  });
}

export function ftr1200Blueprint(spec: BikeSpec): BikeBlueprint {
  const blk = '#17181b';
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.2, 0.88, 1.2],
    wheelbase: 1.524,
    rakeDeg: 26,
    trail: 0.105,
    forkLength: 0.78,
    front: { tyre: '120/70R19', rimWidthIn: 3.5, tyreLabel: 'Flat Track', tread: 'dual', crown: 1.0 },
    rear: { tyre: '150/80R18', rimWidthIn: 4.25, tyreLabel: 'Flat Track', tread: 'dual', crown: 1.05 },
    frontWheel: { type: 'cast', spokes: 5, shape: 'y', color: '#1a1b1e', machinedLip: true },
    rearWheel: { type: 'cast', spokes: 5, shape: 'y', color: '#1a1b1e', machinedLip: true },
    fork: { type: 'usd', stanchion: 0.043, spacing: 0.205, outerColor: blk, innerColor: '#c8ccd2', footColor: '#2a2c30', capColor: '#2a2c30', adjusterColor: '#c99a2c', aboveClamp: 0.015, clampGap: 0.2 },
    frontBrake: { discs: 2, discDia: 0.32, disc: 'floating', carrierColor: '#2b2d31', caliper: 'radial4', caliperColor: '#1b1c1e', caliperAngleDeg: 78 },
    rearBrake: { discs: 1, discDia: 0.265, disc: 'fixed', carrierColor: '#2b2d31', caliper: 'axial1', caliperColor: '#1b1c1e', caliperAngleDeg: 205 },
    frame: { type: 'trellis', color: '#b0121a', metal: 0.3, rough: 0.42, subframe: 'tubular', subframeColor: '#b0121a', width: 0.32, liveryColor: true },
    swingarm: { type: 'box', length: 0.58, angleDeg: 5, color: '#1b1c1f', metal: 0.4, rough: 0.45 },
    shock: { layout: 'mono', springColor: '#2a2c30', bodyColor: '#1c1d20', reservoir: true },
    drive: { type: 'chain', side: 'left', frontTeeth: 16, rearTeeth: 42, sprocketColor: '#2b2d31', chainColor: '#2a2a2a' },
    engine: { layout: 'V2_60', cc: 1203, crank: [0, 0.4, -0.8], tiltDeg: 42, caseColor: '#17181b', coverColor: '#b9bdc2', headColor: '#141518', camCoverColor: '#1b1c1f', finned: true, liquidCooled: true },
    exhaust: { route: 'highTwin', side: 'right', can: 'round', canLength: 0.5, canDia: 0.08, canFinish: 'black', headerFinish: 'steel' },
    cockpit: {
      bars: 'tubular',
      grip: [0.4, 1.12, -1.07],
      barDia: 0.0222,
      dash: 'tftRound',
      dashPos: [0, 1.09, -1.25],
      dashSize: [0.1, 0.1],
      dashTiltDeg: 52,
      dashMount: 'bars',
      mirrors: 'bar',
      mirrorPos: [0.43, 1.25, -1.09],
      mirrorSize: [0.1, 0.07],
      mirrorShape: 'rect',
      mirrorColor: '#16171a',
      topClamp: 'cast',
      steeringDamper: 'none',
      leverColor: '#2a2c30',
      reservoirs: true,
      clutch: 'hydraulic',
      ignition: 'keyless',
      switchColor: '#151618',
      gripColor: '#141414',
      barEndColor: '#2a2c30',
    },
    lights: { head: 'round', tail: 'round', rearIndicators: 'stalk' },
    seat: { height: 0.835, front: -0.58, back: 0.12, pillion: 'seat', color: '#141414' },
    rider: { hip: [0, 0.93, -0.36], peg: [0.28, 0.4, -0.46], torsoPitch: 0.3 },
    footrests: 'scooter',
    plate: { mount: 'hanger', pos: [0, 0.64, 0.46], tiltDeg: -18 },
    body,
    livery,
    groundClearance: 0.15,
    features: ['skip:frame', 'skip:engine', 'skip:exhaust'],
    zones: { splitY: 0.78, decal: [-0.8, 1.02] },
  };
}
