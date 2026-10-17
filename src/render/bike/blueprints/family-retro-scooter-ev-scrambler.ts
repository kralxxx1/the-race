import type { BikeSpec, Livery } from '../../../data/bikes';
import { T, type KitContext } from '../context';
import { PAINT, buildSeat, seatFinish } from '../kit/body';
import { can, clampRing, link, pipe, portFlange } from '../kit/cruisers-exhaust';
import { indicatorPod, ledStrip } from '../kit/lights';
import { plateHanger } from '../kit/rear';
import { classicHeadlamp, tankWithPanels, trellisFrame } from '../kit/retro-scooter-ev-classic';
import { buildLTwin, castFinish } from '../kit/retro-scooter-ev-engines';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv } from '../livery';
import { roundBox } from '../mesh';
import { F, Micro, hard, tint, vary } from '../sink';
import type { BikeBlueprint } from '../types';
import { footPegs, pillionPegs, sideStand } from './family-cruisers-controls';
import { fenderArc, roundTailLamp, tubeAlong } from './family-cruisers-parts';

/**
 * Ducati Scrambler Icon (2024): the retro scrambler.
 * Spec sheet: wheelbase 1445 mm, rake 24°, seat 798 mm, 110/80R18 + 180/55ZR17 on 10-spoke cast wheels, 41 mm USD fork,
 * single 330 mm front disc, 803 cc air-cooled 90° L-twin, steel trellis frame, single right-hand shock, a short
 * brushed-steel silencer on the right.
 * Design cues: round LED headlamp with the X-shaped DRL, muscular tank with removable aluminium side panels,
 * flat bench seat, short tail on a stubby fender, wide tapered bar with a round dash on top.
 */

const BRUSH = (): ReturnType<typeof hard> => hard('#aeb2b8', 1, 0.3, 0.2, Micro.brushed);

function engineAndExhaust(ctx: KitContext): void {
  const crank = ctx.bp.engine.crank;
  const ports = buildLTwin(ctx, {
    crank,
    frontDeg: 80,
    barrelH: 0.125,
    headH: 0.095,
    fins: 12,
    fin: {
      case: castFinish('#17181b', 0.5, 0.5),
      block: castFinish('#141518', 0.55, 0.45),
      edge: vary(F.polishedAlu, { rough: 0.22 }),
      cover: castFinish('#1f2023', 0.6, 0.45),
      cam: castFinish('#16171a', 0.6, 0.4),
      trim: vary(F.brushedAlu, { micro: Micro.brushed }),
    },
  });
  const pipeF = hard('#b9bdc2', 1, 0.2, 0.2, Micro.brushed);
  const r = 0.0195;
  const [pf, pr] = ports;
  // Front header drops from the underside of the front cylinder, rear header runs down behind the engine; both collect on the right
  const front = pipe(ctx, [pf.pos, [pf.pos[0] + 0.01, pf.pos[1] - 0.05, pf.pos[2] + 0.02], [0.07, 0.2, pf.pos[2] + 0.12], [0.15, 0.175, -0.72], [0.18, 0.2, -0.52]], r, pipeF);
  const back = pipe(ctx, [pr.pos, [pr.pos[0] + 0.015, pr.pos[1] - 0.07, pr.pos[2] + 0.005], [0.1, 0.37, -0.55], [0.17, 0.27, -0.5], [0.185, 0.215, -0.5]], r, pipeF);
  portFlange(ctx, pf.pos, pf.dir, r, vary(F.steel, { rough: 0.3 }));
  portFlange(ctx, pr.pos, pr.dir, r, vary(F.steel, { rough: 0.3 }));
  clampRing(ctx, front, Math.floor(front.length * 0.5), r, F.steel);
  clampRing(ctx, back, Math.floor(back.length * 0.5), r, F.steel);
  // Collector box + the short stainless silencer with a black cap, angled up on the right
  ctx.add('chassis', roundBox(0.07, 0.07, 0.12, 0.03, 2), BRUSH(), T(0.19, 0.215, -0.46));
  link(ctx, [0.19, 0.215, -0.5], [0.19, 0.215, -0.4], 0.02, pipeF);
  can(ctx, [0.19, 0.225, -0.4], [0.2, 0.275, -0.02], { r: 0.052, rEnd: 0.056, kind: 'tapered', f: BRUSH(), capF: hard('#18191b', 0.4, 0.4, 0.4), slash: 0.28, slashDir: 'out', bands: 1, bandF: vary(F.chrome, { rough: 0.2 }) });
  ctx.anchor('exhaustOutlet', [0.2, 0.275, -0.02]);
}

function tankAndSeat(ctx: KitContext, lv: Livery): void {
  // Muscular tank with removable brushed-aluminium side panels (cut from the same surface, standing proud)
  tankWithPanels(
    ctx,
    {
      front: -1.02,
      back: -0.48,
      top: 1.02,
      bottomFront: 0.84,
      bottomBack: 0.8,
      width: 0.34,
      style: 'muscle',
      knee: 0.12,
      capZ: -0.88,
      topLine: [[-1.02, 0.93], [-0.97, 0.985], [-0.9, 1.015], [-0.8, 1.025], [-0.7, 1.012], [-0.6, 0.985], [-0.48, 0.94]],
      bottomLine: [[-1.02, 0.84], [-0.9, 0.8], [-0.7, 0.78], [-0.48, 0.8]],
      halfLine: [[-1.02, 0.075], [-0.97, 0.125], [-0.9, 0.162], [-0.8, 0.175], [-0.68, 0.155], [-0.48, 0.1]],
    },
    [[-0.95, 0.9], [-0.86, 0.945], [-0.7, 0.94], [-0.58, 0.905], [-0.6, 0.835], [-0.74, 0.805], [-0.9, 0.82]],
    BRUSH(),
    { text: 'SCRAMBLER', z: -0.77, y: 0.872, color: '#1b1c1f', h: 0.024 },
  );
  buildSeat(ctx, { front: -0.55, back: 0.2, yFront: 0.835, y: 0.835, yBack: 0.855, width: 0.3, thick: 0.065, frontWidth: 0.18 }, tint(seatFinish(ctx), lv.seat));
  trellisFrame(ctx, { f: hard('#17181b', 0.3, 0.45, 0.5), r: 0.0125, upperY: 0.775, halfX: 0.135, seatPost: [-0.5, 0.78], tail: [0.17, 0.79], tailX: 0.075, braces: 4 });
}

function rearEnd(ctx: KitContext): void {
  const hp = ctx.hp;
  // Short stubby rear fender (hugger) with the tail lamp and indicator stalks
  fenderArc(ctx, { group: 'chassis', cz: 0, cy: hp.Rr, r: hp.Rr + 0.03, a0: -0.12, a1: 1.5, half: 0.093, drop: 0.05, power: 2.4, f: PAINT, taper: [0.9, 0.84] });
  roundTailLamp(ctx, [0, hp.Rr + Math.cos(1.46) * (hp.Rr + 0.04) + 0.022, Math.sin(1.46) * (hp.Rr + 0.04) + 0.01], 0.026, -0.2, 'chassis', F.glossBlack);
  plateHanger(ctx, { fromZ: 0.1, fromY: 0.6 });
  for (const s of [-1, 1]) indicatorPod(ctx, 'chassis', [s * 0.07, 0.5, 0.28], [s * 0.15, 0.5, 0.3], 0.014);
  // Black tail bracket / rear footpeg hangers on a tubular loop
  tubeAlong(ctx, 'chassis', [[-0.085, 0.79, 0.1], [-0.09, 0.8, 0.2], [0, 0.805, 0.24], [0.09, 0.8, 0.2], [0.085, 0.79, 0.1]], 0.009, F.satinBlack);
}

function frontEnd(ctx: KitContext): void {
  const hp = ctx.hp;
  fenderArc(ctx, { group: 'forkLower', cz: hp.frontAxle[2], cy: hp.frontAxle[1], r: hp.Rf + 0.028, a0: -0.9, a1: 0.95, half: 0.082, drop: 0.045, power: 2.4, f: PAINT });
  const lc = classicHeadlamp(ctx, { r: 0.088, y: -0.13, chrome: false, led: true, trim: hard('#25272b', 0.7, 0.4, 0.5, Micro.cast), indicators: true });
  // X-shaped DRL across the lens
  const z = lc.z - 0.021;
  const d = 0.062;
  ledStrip(ctx, 'steer', [[lc.x - d, lc.y + d, z], [lc.x, lc.y, z], [lc.x + d, lc.y - d, z]], 0.011, 0.004, 'drl', [0, 0, -1]);
  ledStrip(ctx, 'steer', [[lc.x - d, lc.y - d, z], [lc.x, lc.y, z], [lc.x + d, lc.y + d, z]], 0.011, 0.004, 'drl', [0, 0, -1]);
}

function body(ctx: KitContext): void {
  tankAndSeat(ctx, ctx.livery);
  engineAndExhaust(ctx);
  rearEnd(ctx);
  frontEnd(ctx);
  footPegs(ctx, { at: ctx.bp.rider.peg, f: hard('#202226', 0.5, 0.4, 0.5, Micro.cast), pivot: ctx.hp.pivot, peg: F.rubber });
  pillionPegs(ctx, [0.2, 0.46, 0.06], hard('#202226', 0.5, 0.4, 0.5, Micro.cast));
  sideStand(ctx);
}

// ───────────────────────────── livery ─────────────────────────────

function livery(c: LiveryCanvas, lv: Livery, _env: LiveryEnv): void {
  c.views(ALL_VIEWS, (p) => {
    p.fill(lv.primary, 'gloss');
    if (p.view === 'top') p.rect(-1.0, -0.012, -0.5, 0.012, '#1b1c1f', 'gloss');
  });
}

export function scramblerIconBlueprint(spec: BikeSpec): BikeBlueprint {
  const blk = '#17181b';
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.1, 0.86, 1.15],
    wheelbase: 1.445,
    rakeDeg: 24,
    trail: 0.112,
    forkLength: 0.74,
    front: { tyre: '110/80R18', rimWidthIn: 3.0, tyreLabel: 'Road', tread: 'dual', crown: 1.05 },
    rear: { tyre: '180/55ZR17', rimWidthIn: 5.5, tyreLabel: 'Road', tread: 'dual', crown: 1.0 },
    frontWheel: { type: 'cast', spokes: 10, shape: 'straight', color: '#1b1c1f', machinedLip: true },
    rearWheel: { type: 'cast', spokes: 10, shape: 'straight', color: '#1b1c1f', machinedLip: true },
    fork: { type: 'usd', stanchion: 0.041, spacing: 0.2, outerColor: blk, innerColor: '#b9bdc2', footColor: '#2a2c30', capColor: '#2a2c30', aboveClamp: 0.015, clampGap: 0.19 },
    frontBrake: { discs: 1, discDia: 0.33, disc: 'semiFloating', carrierColor: '#2b2d31', caliper: 'radial4', caliperColor: '#1b1c1e', caliperAngleDeg: 78 },
    rearBrake: { discs: 1, discDia: 0.245, disc: 'fixed', carrierColor: '#2b2d31', caliper: 'axial1', caliperColor: '#1b1c1e', caliperAngleDeg: 205 },
    frame: { type: 'trellis', color: blk, metal: 0.3, rough: 0.45, subframe: 'tubular', subframeColor: blk, width: 0.3 },
    swingarm: { type: 'box', length: 0.55, angleDeg: 5, color: '#1b1c1f', metal: 0.4, rough: 0.45 },
    shock: { layout: 'monoSide', springColor: '#2a2c30', bodyColor: '#1c1d20', reservoir: false },
    drive: { type: 'chain', side: 'left', frontTeeth: 15, rearTeeth: 45, sprocketColor: '#2b2d31', chainColor: '#2a2a2a' },
    engine: { layout: 'L2', cc: 803, crank: [0, 0.36, -0.72], tiltDeg: 80, caseColor: '#17181b', coverColor: '#1f2023', headColor: '#141518', camCoverColor: '#16171a', finned: true, liquidCooled: false },
    exhaust: { route: 'sideCan', side: 'right', can: 'round', canLength: 0.4, canDia: 0.1, canFinish: 'steel', headerFinish: 'steel' },
    cockpit: {
      bars: 'tubular',
      grip: [0.38, 1.07, -1.04],
      barDia: 0.0222,
      dash: 'tftRound',
      dashPos: [0, 1.052, -1.17],
      dashSize: [0.088, 0.088],
      dashTiltDeg: 52,
      dashMount: 'bars',
      mirrors: 'bar',
      mirrorPos: [0.4, 1.2, -1.02],
      mirrorSize: [0.1, 0.07],
      mirrorShape: 'rect',
      mirrorColor: '#16171a',
      topClamp: 'cast',
      steeringDamper: 'none',
      leverColor: '#2a2c30',
      reservoirs: true,
      clutch: 'cable',
      ignition: 'tank',
      switchColor: '#151618',
      gripColor: '#141414',
      barEndColor: '#2a2c30',
    },
    lights: { head: 'round', tail: 'round', rearIndicators: 'stalk' },
    seat: { height: 0.798, front: -0.55, back: 0.2, pillion: 'seat', color: '#141414' },
    rider: { hip: [0, 0.88, -0.3], peg: [0.27, 0.35, -0.45], torsoPitch: 0.3 },
    footrests: 'scooter',
    plate: { mount: 'hanger', pos: [0, 0.6, 0.42], tiltDeg: -16 },
    body,
    livery,
    groundClearance: 0.17,
    features: ['skip:frame', 'skip:engine', 'skip:exhaust'],
    zones: { splitY: 0.72, decal: [-0.76, 0.865] },
  };
}
