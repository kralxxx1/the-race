import type { BikeSpec, Livery } from '../../../data/bikes';
import type { KitContext } from '../context';
import { PAINT, buildSeat, buildTank, seatFinish } from '../kit/body';
import { indicatorPod } from '../kit/lights';
import { plateHanger } from '../kit/rear';
import { cradleFrame, classicHeadlamp, kneePads, peashooters, polishedCan, twinClockBezels } from '../kit/retro-scooter-ev-classic';
import { buildAirTwin, castFinish } from '../kit/retro-scooter-ev-engines';
import { sideAt, type OutlineBody } from '../kit/shape';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv, type Pen } from '../livery';
import type { P2 } from '../mesh';
import { F, Micro, hard, tint, vary } from '../sink';
import type { BikeBlueprint } from '../types';
import { footPegs, pillionPegs, sideStand } from './family-cruisers-controls';
import { bead, fenderArc, roundTailLamp, sidePlate, tubeAlong } from './family-cruisers-parts';

/**
 * Triumph Bonneville T120 (2024): the modern classic.
 * Spec sheet: wheelbase 1450 mm, rake 25.6°, seat 790 mm, 100/90-18 front + 150/70R17 rear on 32-spoke wire wheels,
 * 41 mm cartridge fork, twin 310 mm front discs, 1200 cc SOHC 270° parallel twin (mock carburettors, finned barrels),
 * tubular steel cradle frame, twin chromed-spring shocks, 2-into-2 brushed headers into chrome peashooter silencers.
 * Design cues: round LED headlamp on chrome ears, teardrop tank with knee pads and coach lines, twin analogue clocks,
 * flat stepped dual seat, round tail lamp on a classic fender.
 */

const CHROME = F.chrome;

function frame(ctx: KitContext): void {
  cradleFrame(ctx, { f: hard('#141517', 0.3, 0.45, 0.5), crankZ: ctx.bp.engine.crank[2], cradleY: 0.215, cradleX: 0.1, seatPost: [-0.5, 0.75], tail: [0.12, 0.76], tailX: 0.075, rTop: 0.0175 });
}

function tankAndSeat(ctx: KitContext, lv: Livery): OutlineBody {
  const ob = buildTank(ctx, {
    front: -1.03,
    back: -0.55,
    top: 0.99,
    bottomFront: 0.8,
    bottomBack: 0.76,
    width: 0.33,
    style: 'teardrop',
    knee: 0.1,
    capZ: -0.86,
    topLine: [[-1.03, 0.9], [-0.98, 0.945], [-0.9, 0.985], [-0.8, 0.995], [-0.7, 0.975], [-0.62, 0.94], [-0.55, 0.9]],
    bottomLine: [[-1.03, 0.8], [-0.9, 0.76], [-0.72, 0.745], [-0.55, 0.76]],
    halfLine: [[-1.03, 0.07], [-0.98, 0.115], [-0.9, 0.152], [-0.78, 0.165], [-0.68, 0.14], [-0.55, 0.095]],
  });
  // Rubber knee pads on both flanks (aft half of the tank), and the chrome tank badge plates
  const sp = sideAt(ob, -0.68, 0.86, 1);
  kneePads(ctx, { z: -0.68, y: 0.855, x: sp.p[0] + 0.001, len: 0.12, hgt: 0.09 });
  // Flat dual seat with a short step up to the pillion
  buildSeat(ctx, { front: -0.6, back: 0.14, yFront: 0.82, y: 0.828, yBack: 0.86, width: 0.3, thick: 0.065, frontWidth: 0.17 }, tint(seatFinish(ctx), lv.seat));
  return ob;
}

function rear(ctx: KitContext): void {
  const hp = ctx.hp;
  // Classic rear fender with stays, round bobbin LED tail lamp and a bracket for the plate
  fenderArc(ctx, { group: 'chassis', cz: 0, cy: hp.Rr, r: hp.Rr + 0.03, a0: -0.42, a1: 1.62, half: 0.093, drop: 0.052, power: 2.3, f: PAINT, taper: [0.92, 0.92] });
  roundTailLamp(ctx, [0, hp.Rr + Math.cos(1.58) * (hp.Rr + 0.045) + 0.02, Math.sin(1.58) * (hp.Rr + 0.045)], 0.028, -0.15, 'chassis', CHROME);
  for (const s of [-1, 1]) {
    tubeAlong(ctx, 'chassis', [[s * 0.09, 0.62, -0.18], [s * 0.1, 0.56, -0.02], [s * 0.1, 0.52, 0.2], [s * 0.095, 0.47, 0.33]], 0.0065, CHROME);
    indicatorPod(ctx, 'chassis', [s * 0.085, 0.43, 0.31], [s * 0.16, 0.44, 0.33], 0.014);
  }
  plateHanger(ctx, { fromZ: 0.05, fromY: 0.58 });
  // Twin side covers: right air-box cover with the badge, left battery / tool cover
  const cover: P2[] = [[-0.54, 0.665], [-0.36, 0.675], [-0.32, 0.6], [-0.35, 0.53], [-0.48, 0.5], [-0.56, 0.56]];
  sidePlate(ctx, cover, 0.126, 0.02, PAINT);
  bead(ctx, 'chassis', [[0.137, 0.62, -0.5], [0.14, 0.6, -0.42], [0.14, 0.585, -0.36]], 0.0018, tint(CHROME, '#dfe1e4'));
}

function front(ctx: KitContext): void {
  const hp = ctx.hp;
  // Classic front mudguard on the fork lowers
  fenderArc(ctx, { group: 'forkLower', cz: hp.frontAxle[2], cy: hp.frontAxle[1], r: hp.Rf + 0.026, a0: -0.78, a1: 1.1, half: 0.083, drop: 0.045, power: 2.3, f: PAINT });
  classicHeadlamp(ctx, { r: 0.0875, y: -0.125, chrome: true, led: true, trim: CHROME });
  const d = ctx.bp.cockpit;
  twinClockBezels(ctx, d.dashPos, d.dashSize[0], d.dashSize[1], d.dashTiltDeg);
}

function body(ctx: KitContext): void {
  const crank = ctx.bp.engine.crank;
  frame(ctx);
  tankAndSeat(ctx, ctx.livery);
  rear(ctx);
  front(ctx);
  const ports = buildAirTwin(ctx, {
    crank,
    tiltDeg: 9,
    pitch: 0.124,
    bore: 0.116,
    depth: 0.118,
    barrelH: 0.15,
    headH: 0.1,
    fins: 14,
    style: 'triumph',
    camText: 'BONNEVILLE',
    fin: {
      case: castFinish('#1a1b1e', 0.5, 0.5),
      block: castFinish('#17181b', 0.55, 0.45),
      edge: vary(F.polishedAlu, { rough: 0.25 }),
      cover: vary(F.brushedAlu, { micro: Micro.brushed, rough: 0.3 }),
      cam: hard('#b9bdc2', 1, 0.28, 0.2, Micro.brushed),
      trim: CHROME,
    },
  });
  peashooters(ctx, ports, {
    header: hard('#c7cacf', 1, 0.16, 0.2, Micro.brushed),
    can: polishedCan(),
    capF: hard('#1a1b1d', 0.3, 0.4, 0.5),
    headerR: 0.0185,
    canR: 0.044,
    from: [0.185, 0.222, -0.44],
    to: [0.205, 0.284, 0.1],
    lowY: 0.2,
    crossoverZ: crank[2] - 0.16,
    shield: true,
    bands: 2,
  });
  footPegs(ctx, { at: ctx.bp.rider.peg, f: hard('#222428', 0.5, 0.4, 0.5, Micro.cast), pivot: ctx.hp.pivot, peg: F.rubber });
  pillionPegs(ctx, [0.2, 0.45, 0.02], hard('#222428', 0.5, 0.4, 0.5, Micro.cast));
  sideStand(ctx);
}

// ───────────────────────────── livery ─────────────────────────────

function tankLines(p: Pen, gold: string): void {
  // Hand-painted coach line following the flank of the tank (right / left views).
  const pts: P2[] = [[-1.0, 0.86], [-0.94, 0.915], [-0.84, 0.935], [-0.72, 0.925], [-0.64, 0.9], [-0.58, 0.865]];
  p.line(pts, gold, 0.0032, 'gloss');
  p.line(pts.map(([z, y]) => [z, y - 0.075] as P2), gold, 0.0022, 'gloss');
}

function livery(c: LiveryCanvas, lv: Livery, env: LiveryEnv): void {
  const two = env.index === 1;
  c.views(ALL_VIEWS, (p) => {
    p.fill(lv.primary, 'metallic');
    if (two) {
      // Cordovan Red with the silver upper tank panel and silver fenders trim
      if (p.view === 'right' || p.view === 'left') p.poly([[-1.06, 0.99], [-0.5, 0.99], [-0.5, 0.905], [-0.6, 0.915], [-0.75, 0.94], [-0.9, 0.93], [-1.06, 0.9]], lv.secondary, 'metallic');
      if (p.view === 'top') p.rect(-1.1, -0.2, -0.5, 0.2, lv.secondary, 'metallic');
    }
    if (p.view === 'right' || p.view === 'left') {
      tankLines(p, two ? '#161616' : '#c9a24a');
      p.text('TRIUMPH', -0.9, 0.84, { color: two ? '#f3f3f3' : '#d8dbe0', size: 0.024, weight: '800', spacing: 0.12, finish: 'chrome' });
    }
  });
}

export function bonnevilleT120Blueprint(spec: BikeSpec): BikeBlueprint {
  const blk = '#141517';
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.23, 0.83, 1.1],
    wheelbase: 1.45,
    rakeDeg: 25.6,
    trail: 0.095,
    forkLength: 0.74,
    front: { tyre: '100/90-18', rimWidthIn: 2.5, tyreLabel: 'Classic', tread: 'cruiser', crown: 1.1 },
    rear: { tyre: '150/70R17', rimWidthIn: 3.5, tyreLabel: 'Classic', tread: 'cruiser', crown: 1.05 },
    frontWheel: { type: 'wire', spokes: 32, shape: 'straight', color: blk },
    rearWheel: { type: 'wire', spokes: 32, shape: 'straight', color: blk },
    fork: { type: 'rwu', stanchion: 0.041, spacing: 0.2, outerColor: blk, innerColor: '#e6e8eb', footColor: '#b9bdc2', capColor: '#b9bdc2', aboveClamp: 0.02, clampGap: 0.19 },
    frontBrake: { discs: 2, discDia: 0.31, disc: 'floating', carrierColor: '#2b2d31', caliper: 'axial2', caliperColor: '#1b1c1e', caliperAngleDeg: 95 },
    rearBrake: { discs: 1, discDia: 0.255, disc: 'fixed', carrierColor: '#2b2d31', caliper: 'axial1', caliperColor: '#1b1c1e', caliperAngleDeg: 205 },
    frame: { type: 'cradle', color: blk, metal: 0.3, rough: 0.45, subframe: 'tubular', subframeColor: blk, width: 0.3 },
    swingarm: { type: 'tubular', length: 0.52, angleDeg: 6, color: blk, metal: 0.3, rough: 0.45 },
    shock: { layout: 'twin', springColor: '#c9ccd1', bodyColor: '#1c1d20', reservoir: false },
    drive: { type: 'chain', side: 'left', frontTeeth: 17, rearTeeth: 44, sprocketColor: '#2b2d31', chainColor: '#2a2a2a' },
    engine: { layout: 'P2_270', cc: 1200, crank: [0, 0.37, -0.79], tiltDeg: 9, caseColor: '#1a1b1e', coverColor: '#b9bdc2', headColor: '#17181b', camCoverColor: '#b9bdc2', finned: true, liquidCooled: false },
    exhaust: { route: 'peashooter', side: 'both', can: 'round', canLength: 0.55, canDia: 0.09, canFinish: 'chrome', headerFinish: 'chrome' },
    cockpit: {
      bars: 'tubular',
      grip: [0.36, 1.04, -1.0],
      barDia: 0.0222,
      dash: 'analogTwin',
      dashPos: [0, 1.02, -1.12],
      dashSize: [0.2, 0.092],
      dashTiltDeg: 55,
      dashMount: 'bars',
      mirrors: 'bar',
      mirrorPos: [0.37, 1.19, -1.0],
      mirrorSize: [0.105, 0.105],
      mirrorShape: 'round',
      mirrorColor: '#d5d8dc',
      topClamp: 'cast',
      steeringDamper: 'none',
      leverColor: '#b9bdc2',
      reservoirs: false,
      clutch: 'cable',
      ignition: 'tank',
      switchColor: '#151618',
      gripColor: '#161616',
      barEndColor: '#b9bdc2',
    },
    lights: { head: 'round', tail: 'round', rearIndicators: 'stalk' },
    seat: { height: 0.79, front: -0.6, back: 0.14, pillion: 'seat', color: '#141414' },
    rider: { hip: [0, 0.87, -0.3], peg: [0.26, 0.34, -0.46], torsoPitch: 0.2 },
    footrests: 'scooter',
    plate: { mount: 'hanger', pos: [0, 0.54, 0.4], tiltDeg: -14 },
    body,
    livery,
    groundClearance: 0.13,
    features: ['skip:frame', 'skip:engine', 'skip:exhaust'],
    zones: { splitY: 0.72, decal: [-0.82, 0.835] },
  };
}

