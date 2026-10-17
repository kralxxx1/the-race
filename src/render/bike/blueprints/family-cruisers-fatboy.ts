import * as THREE from 'three';
import type { BikeSpec, Livery } from '../../../data/bikes';
import { RX, T, mul, type KitContext } from '../context';
import { PAINT, seatFinish } from '../kit/body';
import { buildVTwin, type EnginePort } from '../kit/cruisers-engine';
import { can, clampRing, heatShield, pipe } from '../kit/cruisers-exhaust';
import { discWheelFace } from '../kit/cruisers-wheel';
import { buildDisc } from '../kit/wheel';
import { placeCaliper } from '../kit/brakes';
import { indicatorPod, roundHeadlight } from '../kit/lights';
import { plateHanger } from '../kit/rear';
import { curve, outlineLoft, SECTIONS, stationsBetween, type OutlineBody } from '../kit/shape';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv, type Pen } from '../livery';
import { lathe, roundBox, type P3 } from '../mesh';
import { bodyQ } from '../kit/body';
import { F, hard, vary } from '../sink';
import type { BikeBlueprint } from '../types';
import { floorBoards } from './family-cruisers-controls';
import { bead, capMeshOf, cruiserTank, fenderArc, rearFrameLoop, roundTailLamp, tubeAlong } from './family-cruisers-parts';

/**
 * Harley-Davidson Fat Boy 114 (Softail, Milwaukee-Eight 114).
 * Spec sheet: wheelbase 1615 mm, rake 30°, trail 117 mm, seat 675 mm, 160/70B17 front + 240/40R18 rear on
 * solid "Lakester" cast discs, 49 mm fork, steel frame with the hidden Softail monoshock, belt drive,
 * 45° V-twin with chrome covers, "shotgun" duals on the right, forward floorboards.
 * Design cues: huge valanced fenders, fat tyres, solid disc wheels, tank console speedo, 7" round
 * headlamp, solo seat, chrome everywhere.
 */

const CRANK: P3 = [0, 0.345, -0.93];

function engine(ctx: KitContext): EnginePort[] {
  return buildVTwin(ctx, {
    crank: CRANK,
    bankDeg: 45,
    frontDeg: 67.5,
    bore: 0.052,
    finHalf: 0.08,
    barrelLen: 0.19,
    finCount: 12,
    black: hard('#17181b', 0.4, 0.5, 0.4),
    bright: F.chrome,
    coverF: vary(F.chrome, { rough: 0.08 }),
    airF: F.chrome,
    airCleaner: 'round',
    finEdge: vary(F.polishedAlu, { rough: 0.2 }),
    rockerText: 'MILWAUKEE-EIGHT',
  });
}

function exhaust(ctx: KitContext, ports: EnginePort[]): void {
  const chrome = F.chrome;
  const [pf, pr] = ports;
  const r = 0.0215;
  // Front cylinder → lower pipe. Wraps round the front of the engine, then runs back low on the right.
  const lower = pipe(ctx, [pf.pos, [pf.pos[0] + 0.006, pf.pos[1] - 0.05, pf.pos[2] - 0.04], [0.04, 0.5, -1.15], [0.1, 0.36, -1.17], [0.17, 0.24, -1.1], [0.215, 0.185, -0.97], [0.235, 0.172, -0.78], [0.24, 0.17, -0.58]], r, chrome);
  // Rear cylinder → upper pipe, dropping behind the rear cylinder.
  const upper = pipe(ctx, [pr.pos, [pr.pos[0] + 0.01, pr.pos[1] - 0.05, pr.pos[2] + 0.03], [0.07, 0.45, -0.72], [0.17, 0.35, -0.66], [0.235, 0.29, -0.6], [0.25, 0.268, -0.52]], r, chrome);
  clampRing(ctx, lower, 14, r);
  // Chrome heat shields over the long straight sections.
  heatShield(ctx, lower, 22, lower.length - 2, r, vary(F.chrome, { rough: 0.1 }), { span: Math.PI * 1.15, centre: -Math.PI * 0.2, slots: 5 });
  heatShield(ctx, upper, 16, upper.length - 1, r, vary(F.chrome, { rough: 0.1 }), { span: Math.PI * 1.15, centre: Math.PI * 0.15, slots: 3 });
  // Two long slash-cut mufflers stacked on the right ("shotgun" duals).
  can(ctx, [0.24, 0.17, -0.58], [0.252, 0.222, 0.3], { r: 0.05, rEnd: 0.058, kind: 'tapered', f: chrome, slash: 0.55, slashDir: 'out', bands: 2 });
  can(ctx, [0.25, 0.268, -0.52], [0.262, 0.318, 0.31], { r: 0.047, rEnd: 0.054, kind: 'tapered', f: chrome, slash: 0.55, slashDir: 'out', bands: 2 });
  // Crossover / hanger brackets
  tubeAlong(ctx, 'chassis', [[0.24, 0.2, -0.3], [0.2, 0.26, -0.3], [0.14, 0.34, -0.3]], 0.007, F.chrome);
  ctx.anchor('exhaustOutlet', [0.262, 0.318, 0.31]);
}

function seatBody(ctx: KitContext): void {
  const ob: OutlineBody = {
    zs: stationsBetween(-0.9, -0.28, 14, 0.4),
    top: curve([[-0.9, 0.715], [-0.84, 0.7], [-0.74, 0.675], [-0.6, 0.655], [-0.5, 0.66], [-0.4, 0.69], [-0.32, 0.725], [-0.28, 0.715]]),
    bottom: curve([[-0.9, 0.67], [-0.7, 0.6], [-0.5, 0.58], [-0.3, 0.62], [-0.28, 0.66]]),
    half: curve([[-0.9, 0.05], [-0.84, 0.1], [-0.72, 0.16], [-0.55, 0.19], [-0.4, 0.19], [-0.3, 0.16], [-0.28, 0.13]]),
    sections: [{ z: -0.9, pts: SECTIONS.seat }],
  };
  ctx.add('chassis', outlineLoft(ob, { ...bodyQ(ctx, 1.2), capFront: true }), seatFinish(ctx));
  ctx.add('chassis', capMeshOf(ob, -0.28, true), seatFinish(ctx));
  // Chrome seat-pan trim at the rear lip.
  const lip: P3[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    lip.push([(t - 0.5) * 0.3, 0.712 - 0.04 * Math.pow(Math.abs(t - 0.5) * 2, 2), -0.285]);
  }
  bead(ctx, 'chassis', lip, 0.0022, F.chrome);
}

function body(ctx: KitContext): void {
  const hp = ctx.hp;
  const chrome = F.chrome;
  const ports = engine(ctx);
  exhaust(ctx, ports);

  // ── Tank with the Softail's offset left filler cap; the console sits on top ──
  cruiserTank(ctx, {
    front: -1.2,
    back: -0.7,
    top: 0.965,
    bottomFront: 0.8,
    bottomBack: 0.77,
    width: 0.41,
    style: 'round',
    knee: 0,
    topLine: [[-1.2, 0.915], [-1.13, 0.95], [-1.02, 0.97], [-0.9, 0.965], [-0.8, 0.94], [-0.72, 0.9], [-0.7, 0.87]],
    bottomLine: [[-1.2, 0.82], [-1.0, 0.78], [-0.82, 0.77], [-0.7, 0.79]],
    halfLine: [[-1.2, 0.09], [-1.13, 0.15], [-1.02, 0.198], [-0.9, 0.205], [-0.8, 0.18], [-0.72, 0.13], [-0.7, 0.1]],
    cap: { x: -0.075, z: -0.84, r: 0.034 },
  });
  // Chrome console with the speedometer bezel (the dial itself is the animated dash).
  ctx.add('chassis', lathe([[0, 0], [0.074, 0], [0.078, 0.008], [0.072, 0.02], [0.06, 0.03], [0, 0.034]], { segs: ctx.seg(40, 14), axis: 'y', sharp: [1, 3] }).transform(new THREE.Matrix4().makeScale(1, 1, 1.12)), chrome, mul(T(0, 0.962, -1.04), RX(-0.35)));
  seatBody(ctx);

  // ── Rear fender: wide, deeply valanced, chrome stays and a round tail lamp ──
  const rr = hp.Rr + 0.036;
  fenderArc(ctx, { group: 'chassis', cz: 0, cy: hp.Rr, r: rr, a0: -1.02, a1: 1.62, half: 0.146, drop: 0.092, power: 2.2, f: PAINT, taper: [1, 0.9] });
  roundTailLamp(ctx, [0, hp.Rr + Math.cos(1.58) * (rr + 0.012), Math.sin(1.58) * (rr + 0.012)], 0.035, -0.12, 'chassis', chrome);
  plateHanger(ctx, { fromZ: 0.2, fromY: 0.34 });
  for (const s of [-1, 1]) indicatorPod(ctx, 'chassis', [s * 0.14, 0.38, 0.31], [s * 0.2, 0.39, 0.34], 0.016);

  // ── Front fender: full, valanced, riding close over the 17" disc wheel ──
  fenderArc(ctx, { group: 'forkLower', cz: hp.frontAxle[2], cy: hp.frontAxle[1], r: hp.Rf + 0.03, a0: -1.2, a1: 1.28, half: 0.104, drop: 0.082, power: 2.2, f: PAINT });

  // ── Headlamp: 7" chrome shell, fork-mounted indicators ──
  const hl: P3 = [0, hp.head[1] - 0.115, hp.head[2] - 0.22];
  roundHeadlight(ctx, 'steer', hl, 0.094, [0, 0, -1], { led: true, chrome: true });
  for (const s of [-1, 1]) {
    ctx.add('steer', roundBox(0.014, 0.034, 0.06, 0.005), chrome, T(s * 0.108, hl[1], hl[2] + 0.085));
    indicatorPod(ctx, 'steer', [s * 0.12, hl[1] - 0.075, hl[2] + 0.07], [s * 0.2, hl[1] - 0.085, hl[2] + 0.04], 0.018);
  }

  // ── Solid disc wheels (Lakester): dished chrome faces, hub caps, rotor + caliper on the right ──
  discWheelFace(ctx, true, { face: vary(F.chrome, { rough: 0.07 }), cap: F.chrome, rings: [0.82], bolts: 5, dish: 0.006 });
  discWheelFace(ctx, false, { face: vary(F.chrome, { rough: 0.07 }), cap: F.chrome, rings: [0.84], bolts: 6, dish: 0.012 });
  rearBrake(ctx);

  // ── Foot controls ──
  floorBoards(ctx, [0.3, 0.2, -1.02], { f: F.chrome, len: 0.3, wid: 0.12 });
  sideStand(ctx);

  // ── Softail details: triangulated swingarm gussets, oil tank / battery side covers, belt guard ──
  rearFrameLoop(ctx, { w: 0.115, front: -0.9, back: -0.26, y: 0.6, r: 0.017, f: hard('#15161a', 0.35, 0.4, 0.8) });
  // Battery box (left) and oil tank (right) tucked under the seat.
  ctx.add('chassis', roundBox(0.1, 0.17, 0.3, 0.03, 2), F.glossBlack, T(-0.13, 0.52, -0.5));
  ctx.add('chassis', roundBox(0.1, 0.2, 0.28, 0.03, 2), F.glossBlack, T(0.13, 0.5, -0.5));
}

function rearBrake(ctx: KitContext): void {
  const hp = ctx.hp;
  const brake = { discs: 1 as const, discDia: 0.292, disc: 'fixed' as const, carrierColor: '#17181b', caliper: 'axial2' as const, caliperColor: '#17181b', caliperAngleDeg: 205 };
  const x = 0.118;
  for (const [m, f] of buildDisc(ctx, brake, false)) ctx.add('rearWheel', m, f, T(hp.rearAxle[0] + x, hp.rearAxle[1], hp.rearAxle[2]));
  placeCaliper(ctx, 'swingarm', brake, false, hp.rearAxle, x, (205 * Math.PI) / 180);
}

function sideStand(ctx: KitContext): void {
  const pv = ctx.hp.pivot;
  const a: P3 = [-0.2, 0.26, pv[2] - 0.06];
  const b: P3 = [-0.27, 0.23, pv[2] + 0.2];
  tubeAlong(ctx, 'chassis', [a, [(a[0] + b[0]) / 2, 0.235, (a[2] + b[2]) / 2], b], 0.0105, F.chrome);
  ctx.add('chassis', roundBox(0.04, 0.008, 0.06, 0.003), F.black, T(b[0], b[1] - 0.004, b[2]));
}

// ───────────────────────────── livery ─────────────────────────────

function lettering(p: Pen, color: string): void {
  if (p.view === 'right' || p.view === 'left') {
    p.text('Harley-Davidson', -0.95, 0.885, { color, size: 0.03, italic: true, weight: '800', finish: 'chrome', stretch: 0.9 });
  }
}

function livery(c: LiveryCanvas, lv: Livery, env: LiveryEnv): void {
  const gray = env.index === 1;
  c.views(ALL_VIEWS, (p) => {
    p.fill(lv.primary, gray ? 'metallic' : 'gloss');
    lettering(p, '#e4e7ea');
  });
}

export function fatBoyBlueprint(spec: BikeSpec): BikeBlueprint {
  const black = '#15161a';
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.38, 0.96, 1.1],
    wheelbase: 1.615,
    rakeDeg: 30,
    trail: 0.117,
    forkLength: 0.79,
    front: { tyre: '160/70B17', rimWidthIn: 4.5, crown: 1.15, tread: 'cruiser', tyreLabel: 'Cruise Bias' },
    rear: { tyre: '240/40R18', rimWidthIn: 8.0, crown: 1.2, tread: 'cruiser', tyreLabel: 'Cruise Bias' },
    // The kit builds a plain disc wheel; `discWheelFace` (body) adds the dished Lakester faces on top.
    frontWheel: { type: 'disc', spokes: 2, shape: 'straight', color: '#c9ccd0' },
    rearWheel: { type: 'disc', spokes: 2, shape: 'straight', color: '#c9ccd0' },
    fork: { type: 'rwu', stanchion: 0.049, spacing: 0.25, outerColor: black, innerColor: '#eef0f3', footColor: black, capColor: '#eef0f3', aboveClamp: 0.0, clampGap: 0.22 },
    frontBrake: { discs: 2, discDia: 0.292, disc: 'fixed', carrierColor: '#cfd2d6', caliper: 'axial2', caliperColor: black, caliperAngleDeg: 78 },
    rearBrake: { discs: 0, discDia: 0.292, disc: 'fixed', carrierColor: black, caliper: 'axial2', caliperColor: black, caliperAngleDeg: 205 },
    frame: { type: 'cradle', color: black, metal: 0.3, rough: 0.4, subframe: 'integrated', subframeColor: black, width: 0.34 },
    swingarm: { type: 'box', length: 0.64, angleDeg: 4, color: black, metal: 0.3, rough: 0.4 },
    shock: { layout: 'none', springColor: black, bodyColor: black, reservoir: false },
    drive: { type: 'belt', side: 'left', frontTeeth: 32, rearTeeth: 70, sprocketColor: '#c9ccd2' },
    engine: {
      layout: 'V2_45',
      cc: 1868,
      crank: CRANK,
      tiltDeg: 67.5,
      caseColor: '#17181b',
      coverColor: '#e6e8eb',
      headColor: '#17181b',
      camCoverColor: '#e6e8eb',
      camCoverText: 'MILWAUKEE-EIGHT',
      finned: true,
      liquidCooled: false,
    },
    exhaust: { route: 'none', side: 'right', can: 'slash', canLength: 0.8, canDia: 0.105, canFinish: 'chrome', headerFinish: 'chrome' },
    cockpit: {
      bars: 'cruiser',
      grip: [0.41, 1.045, -0.99],
      barDia: 0.0254,
      dash: 'harley',
      dashPos: [0, 1.0, -1.04],
      dashSize: [0.088, 0.088],
      dashTiltDeg: 20,
      dashMount: 'fairing',
      mirrors: 'bar',
      mirrorPos: [0.37, 1.22, -1.0],
      mirrorSize: [0.1, 0.075],
      mirrorIndicators: false,
      mirrorShape: 'oval',
      mirrorColor: '#e8eaed',
      topClamp: 'riser',
      steeringDamper: 'none',
      leverColor: '#e8eaed',
      reservoirs: true,
      clutch: 'hydraulic',
      ignition: 'tank',
      switchColor: '#141518',
      gripColor: '#141414',
      barEndColor: '#e8eaed',
    },
    lights: { head: 'round', tail: 'round', rearIndicators: 'stalk' },
    seat: { height: 0.675, front: -0.9, back: -0.28, pillion: 'none', color: '#15130f' },
    rider: { hip: [0, 0.76, -0.56], peg: [0.3, 0.2, -1.02], torsoPitch: -0.12 },
    footrests: 'scooter',
    plate: { mount: 'fender', pos: [0, 0.4, 0.4], tiltDeg: -10 },
    body,
    livery,
    groundClearance: 0.112,
    features: ['chromeEngine', 'skip:engine'],
    zones: { splitY: 0.3, decal: [-0.95, 0.885] },
  };
}

