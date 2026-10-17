import type { BikeSpec, Livery } from '../../../data/bikes';
import { T, type KitContext } from '../context';
import { bodyQ, PAINT, seatFinish } from '../kit/body';
import { buildVTwin, type EnginePort } from '../kit/cruisers-engine';
import { blackPipe, can, clampRing, heatShield, pipe } from '../kit/cruisers-exhaust';
import { indicatorPod, roundHeadlight } from '../kit/lights';
import { plateHanger } from '../kit/rear';
import { curve, outlineLoft, SECTIONS, stationsBetween, type OutlineBody } from '../kit/shape';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv, type Pen } from '../livery';
import { roundBox, type P3 } from '../mesh';
import { F, hard, vary } from '../sink';
import type { BikeBlueprint } from '../types';
import { floorBoards, sideStand } from './family-cruisers-controls';
import { bead, capMeshOf, cruiserTank, fenderArc, rearFrameLoop, roundTailLamp, tubeAlong } from './family-cruisers-parts';

/**
 * Indian Chief Dark Horse (2022 generation, Thunderstroke 116).
 * Spec sheet: wheelbase 1626 mm, rake 29°, trail 130 mm, seat 665 mm, 130/90B16 front + 180/65B16 rear
 * on black cast wheels, 46 mm fork, steel tube frame with the hidden monoshock, belt drive,
 * 49° V-twin (blacked out, machined highlights), 2-into-2 black slash-cut exhaust, forward floorboards.
 * Design cues: bobbed fenders, round LED headlamp, bar-mounted round gauge, solo bucket seat, wide
 * rounded tank.
 */

const CRANK: P3 = [0, 0.335, -0.9];

function engine(ctx: KitContext): EnginePort[] {
  return buildVTwin(ctx, {
    crank: CRANK,
    bankDeg: 49,
    frontDeg: 65.5,
    bore: 0.053,
    finHalf: 0.08,
    barrelLen: 0.19,
    finCount: 11,
    black: hard('#14151a', 0.35, 0.5, 0.5),
    bright: hard('#17181c', 0.5, 0.28, 0.9),
    coverF: hard('#18191d', 0.5, 0.3, 0.9),
    airF: hard('#18191d', 0.5, 0.3, 0.9),
    airCleaner: 'oval',
    finEdge: vary(F.polishedAlu, { rough: 0.22 }),
    rockerText: 'THUNDERSTROKE',
    ribbed: true,
    primaryScale: 1.05,
  });
}

function exhaust(ctx: KitContext, ports: EnginePort[]): void {
  const [pf, pr] = ports;
  const r = 0.0215;
  const blk = blackPipe;
  // Right: front cylinder, wrapping the front of the engine.
  const right = pipe(ctx, [pf.pos, [pf.pos[0] + 0.006, pf.pos[1] - 0.05, pf.pos[2] - 0.04], [0.04, 0.5, -1.1], [0.1, 0.36, -1.13], [0.17, 0.245, -1.07], [0.2, 0.2, -0.93], [0.22, 0.19, -0.72], [0.23, 0.19, -0.54]], r, blk);
  // Left: rear cylinder, dropping behind the rear head and running back along the left.
  const left = pipe(ctx, [pr.pos, [pr.pos[0] - 0.01, pr.pos[1] - 0.05, pr.pos[2] + 0.03], [-0.06, 0.45, -0.68], [-0.16, 0.34, -0.62], [-0.22, 0.27, -0.5], [-0.235, 0.255, -0.4]], r, blk);
  clampRing(ctx, right, 14, r, F.steel);
  heatShield(ctx, right, 24, right.length - 1, r, hard('#17181b', 0.6, 0.3, 0.8), { span: Math.PI * 1.15, centre: -Math.PI * 0.2, slots: 4 });
  heatShield(ctx, left, 14, left.length - 1, r, hard('#17181b', 0.6, 0.3, 0.8), { span: Math.PI * 1.15, centre: Math.PI * 1.2, slots: 3 });
  can(ctx, [0.23, 0.19, -0.54], [0.245, 0.235, 0.26], { r: 0.052, rEnd: 0.06, kind: 'tapered', f: blk, capF: F.chrome, slash: 0.5, slashDir: 'out', bands: 1, bandF: F.steel });
  can(ctx, [-0.235, 0.255, -0.4], [-0.25, 0.292, 0.24], { r: 0.05, rEnd: 0.058, kind: 'tapered', f: blk, capF: F.chrome, slash: 0.5, slashDir: 'out', bands: 1, bandF: F.steel });
  ctx.anchor('exhaustOutlet', [0.245, 0.235, 0.26]);
}

function seatBody(ctx: KitContext): void {
  const ob: OutlineBody = {
    zs: stationsBetween(-0.88, -0.26, 14, 0.4),
    top: curve([[-0.88, 0.7], [-0.82, 0.69], [-0.72, 0.665], [-0.58, 0.648], [-0.46, 0.655], [-0.36, 0.68], [-0.29, 0.7], [-0.26, 0.69]]),
    bottom: curve([[-0.88, 0.65], [-0.7, 0.58], [-0.5, 0.56], [-0.3, 0.6], [-0.26, 0.64]]),
    half: curve([[-0.88, 0.05], [-0.82, 0.1], [-0.7, 0.155], [-0.55, 0.18], [-0.4, 0.18], [-0.3, 0.15], [-0.26, 0.12]]),
    sections: [{ z: -0.88, pts: SECTIONS.seat }],
  };
  ctx.add('chassis', outlineLoft(ob, { ...bodyQ(ctx, 1.2), capFront: true }), seatFinish(ctx));
  ctx.add('chassis', capMeshOf(ob, -0.26, true), seatFinish(ctx));
  const lip: P3[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    lip.push([(t - 0.5) * 0.28, 0.69 - 0.035 * Math.pow(Math.abs(t - 0.5) * 2, 2) + 0.004, -0.265]);
  }
  bead(ctx, 'chassis', lip, 0.002, hard('#2a2b2f', 0.6, 0.3));
}

function body(ctx: KitContext): void {
  const hp = ctx.hp;
  const blackGloss = F.glossBlack;
  const ports = engine(ctx);
  exhaust(ctx, ports);

  // ── Tank: wide, rounded, with the filler cap on the left; the gauge lives on the bars ──
  cruiserTank(ctx, {
    front: -1.19,
    back: -0.7,
    top: 0.935,
    bottomFront: 0.79,
    bottomBack: 0.76,
    width: 0.4,
    style: 'round',
    knee: 0,
    topLine: [[-1.19, 0.88], [-1.12, 0.915], [-1.0, 0.94], [-0.88, 0.935], [-0.78, 0.91], [-0.71, 0.875], [-0.7, 0.85]],
    bottomLine: [[-1.19, 0.8], [-1.0, 0.77], [-0.82, 0.76], [-0.7, 0.78]],
    halfLine: [[-1.19, 0.09], [-1.12, 0.15], [-1.0, 0.195], [-0.9, 0.2], [-0.8, 0.175], [-0.72, 0.125], [-0.7, 0.1]],
    cap: { x: -0.06, z: -0.86, r: 0.032, f: hard('#1b1c20', 0.7, 0.28, 0.8) },
  });
  seatBody(ctx);

  // ── Bobbed rear fender with an integrated LED tail lamp ──
  const rr = hp.Rr + 0.03;
  fenderArc(ctx, { group: 'chassis', cz: 0, cy: hp.Rr, r: rr, a0: -0.7, a1: 1.5, half: 0.1, drop: 0.07, power: 2.3, f: PAINT, taper: [1, 0.9] });
  roundTailLamp(ctx, [0, hp.Rr + Math.cos(1.46) * (rr + 0.012), Math.sin(1.46) * (rr + 0.012)], 0.032, -0.1, 'chassis', F.glossBlack);
  tubeAlong(ctx, 'chassis', [[0.1, 0.5, -0.3], [0.115, 0.5, -0.1], [0.105, 0.46, 0.15]], 0.007, F.black);
  tubeAlong(ctx, 'chassis', [[-0.1, 0.5, -0.3], [-0.115, 0.5, -0.1], [-0.105, 0.46, 0.15]], 0.007, F.black);
  plateHanger(ctx, { fromZ: 0.2, fromY: 0.3 });
  for (const s of [-1, 1]) indicatorPod(ctx, 'chassis', [s * 0.1, 0.4, 0.3], [s * 0.17, 0.41, 0.33], 0.015);

  // ── Short bobbed front fender ──
  fenderArc(ctx, { group: 'forkLower', cz: hp.frontAxle[2], cy: hp.frontAxle[1], r: hp.Rf + 0.028, a0: -0.85, a1: 1.0, half: 0.088, drop: 0.055, power: 2.3, f: PAINT });

  // ── Round LED headlamp in a black bucket, fork-mounted indicators ──
  const hl: P3 = [0, hp.head[1] - 0.1, hp.head[2] - 0.2];
  roundHeadlight(ctx, 'steer', hl, 0.088, [0, 0, -1], { led: true, chrome: false });
  for (const s of [-1, 1]) {
    ctx.add('steer', roundBox(0.014, 0.032, 0.055, 0.005), blackGloss, T(s * 0.1, hl[1], hl[2] + 0.08));
    indicatorPod(ctx, 'steer', [s * 0.115, hl[1] - 0.07, hl[2] + 0.07], [s * 0.19, hl[1] - 0.08, hl[2] + 0.04], 0.016);
  }

  floorBoards(ctx, [0.3, 0.205, -0.99], { f: hard('#16171a', 0.5, 0.35, 0.8), len: 0.28, wid: 0.115 });
  sideStand(ctx);
  rearFrameLoop(ctx, { w: 0.112, front: -0.88, back: -0.26, y: 0.585, r: 0.017, f: hard('#14151a', 0.35, 0.4, 0.8) });
  ctx.add('chassis', roundBox(0.1, 0.16, 0.3, 0.03, 2), blackGloss, T(-0.13, 0.5, -0.5));
  ctx.add('chassis', roundBox(0.1, 0.19, 0.26, 0.03, 2), blackGloss, T(0.13, 0.49, -0.5));
}

// ───────────────────────────── livery ─────────────────────────────

function lettering(p: Pen, color: string): void {
  if (p.view === 'right' || p.view === 'left') {
    p.text('Indian', -0.95, 0.865, { color, size: 0.04, italic: true, weight: '700', finish: 'chrome', font: '"Brush Script MT", "Segoe Script", cursive' });
  }
}

function livery(c: LiveryCanvas, lv: Livery, _env: LiveryEnv): void {
  // Black Smoke / Stealth Gray: both are smoky satin finishes with a chrome-lettered tank script.
  c.views(ALL_VIEWS, (p) => {
    p.fill(lv.primary, 'satin');
    lettering(p, '#cfd3d8');
  });
}

export function indianChiefBlueprint(spec: BikeSpec): BikeBlueprint {
  const black = '#14151a';
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.35, 0.9, 1.1],
    wheelbase: 1.626,
    rakeDeg: 29,
    trail: 0.13,
    forkLength: 0.745,
    front: { tyre: '130/90B16', rimWidthIn: 3.5, crown: 1.15, tread: 'cruiser', tyreLabel: 'Cruise Bias' },
    rear: { tyre: '180/65B16', rimWidthIn: 5.0, crown: 1.2, tread: 'cruiser', tyreLabel: 'Cruise Bias' },
    frontWheel: { type: 'cast', spokes: 9, shape: 'curved', color: black, machinedLip: true },
    rearWheel: { type: 'cast', spokes: 9, shape: 'curved', color: black, machinedLip: true },
    fork: { type: 'rwu', stanchion: 0.046, spacing: 0.245, outerColor: black, innerColor: '#1c1d22', footColor: black, capColor: '#2a2b30', aboveClamp: 0.0, clampGap: 0.21 },
    frontBrake: { discs: 1, discDia: 0.298, disc: 'floating', carrierColor: '#2a2b30', caliper: 'axial2', caliperColor: black, caliperText: 'INDIAN', caliperTextColor: '#c9ccd2', caliperAngleDeg: 78 },
    rearBrake: { discs: 1, discDia: 0.298, disc: 'fixed', carrierColor: '#2a2b30', caliper: 'axial1', caliperColor: black, caliperAngleDeg: 205 },
    frame: { type: 'cradle', color: black, metal: 0.3, rough: 0.4, subframe: 'integrated', subframeColor: black, width: 0.33 },
    swingarm: { type: 'box', length: 0.62, angleDeg: 5, color: black, metal: 0.3, rough: 0.4 },
    shock: { layout: 'none', springColor: black, bodyColor: black, reservoir: false },
    drive: { type: 'belt', side: 'left', frontTeeth: 32, rearTeeth: 68, sprocketColor: '#2a2b30' },
    engine: {
      layout: 'V2_45',
      cc: 1890,
      crank: CRANK,
      tiltDeg: 65.5,
      caseColor: '#14151a',
      coverColor: '#18191d',
      headColor: '#14151a',
      camCoverColor: '#18191d',
      camCoverText: 'THUNDERSTROKE',
      finned: true,
      liquidCooled: false,
    },
    exhaust: { route: 'none', side: 'both', can: 'slash', canLength: 0.8, canDia: 0.105, canFinish: 'black', headerFinish: 'black' },
    cockpit: {
      bars: 'tall',
      grip: [0.4, 1.02, -1.0],
      barDia: 0.0254,
      dash: 'analog',
      dashPos: [0, 0.995, -1.2],
      dashSize: [0.096, 0.096],
      dashTiltDeg: 32,
      dashMount: 'bars',
      mirrors: 'bar',
      mirrorPos: [0.37, 1.2, -1.0],
      mirrorSize: [0.1, 0.1],
      mirrorIndicators: false,
      mirrorShape: 'round',
      mirrorColor: '#111214',
      topClamp: 'cast',
      steeringDamper: 'none',
      leverColor: '#1c1d21',
      reservoirs: true,
      clutch: 'hydraulic',
      ignition: 'tank',
      switchColor: '#141518',
      gripColor: '#141414',
      barEndColor: '#1c1d21',
    },
    lights: { head: 'round', tail: 'round', rearIndicators: 'stalk' },
    seat: { height: 0.665, front: -0.88, back: -0.26, pillion: 'none', color: '#15130f' },
    rider: { hip: [0, 0.745, -0.55], peg: [0.3, 0.205, -0.99], torsoPitch: -0.1 },
    footrests: 'scooter',
    plate: { mount: 'fender', pos: [0, 0.4, 0.36], tiltDeg: -10 },
    body,
    livery,
    groundClearance: 0.12,
    features: ['skip:engine'],
    zones: { splitY: 0.3, decal: [-0.95, 0.865] },
  };
}
