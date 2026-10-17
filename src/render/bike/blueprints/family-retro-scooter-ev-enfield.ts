import * as THREE from 'three';
import type { BikeSpec, Livery } from '../../../data/bikes';
import { RY, T, mul, type KitContext } from '../context';
import { PAINT, buildSeat, buildTank, seatFinish } from '../kit/body';
import { can, clampRing, heatShield, pipe, portFlange } from '../kit/cruisers-exhaust';
import { indicatorPod } from '../kit/lights';
import { plateHanger } from '../kit/rear';
import { cradleFrame, classicHeadlamp, kneePads, peashooters, polishedCan, twinClockBezels } from '../kit/retro-scooter-ev-classic';
import { bezelRing } from '../kit/retro-scooter-ev-body';
import { buildAirTwin, buildSingle, castFinish } from '../kit/retro-scooter-ev-engines';
import { sideAt } from '../kit/shape';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv } from '../livery';
import { lathe, roundBox, type P2, type P3 } from '../mesh';
import { F, Micro, hard, tint, vary } from '../sink';
import type { BikeBlueprint } from '../types';
import { footPegs, pillionPegs, sideStand } from './family-cruisers-controls';
import { bead, fenderArc, roundTailLamp, sidePlate, tubeAlong } from './family-cruisers-parts';

/**
 * Royal Enfield Interceptor 650 and Classic 350 (2024).
 *
 * Interceptor 650: wheelbase 1400 mm, 100/90-18 + 130/70-18 on 18" wire wheels, 41 mm fork, single 320 mm front
 * disc, 648 cc air/oil-cooled 270° twin, twin chrome peashooters, tubular steel frame, twin shocks.
 * Classic 350: wheelbase 1390 mm, 100/90-19 + 120/80-18 wire wheels, 349 cc J-series single, one long chrome
 * silencer on the right, round headlamp in a chrome nacelle with the speedometer on top, tank badge.
 */

const CHROME = F.chrome;
const BLACK_STEEL = (): ReturnType<typeof hard> => hard('#141517', 0.3, 0.45, 0.5);

// ───────────────────────────── shared pieces ─────────────────────────────

/** Fender, tail lamp, stays, plate bracket and side covers. */
function rearEnd(ctx: KitContext, o: { cover: P2[]; lampZ?: number }): void {
  const hp = ctx.hp;
  fenderArc(ctx, { group: 'chassis', cz: 0, cy: hp.Rr, r: hp.Rr + 0.03, a0: -0.5, a1: 1.66, half: 0.095, drop: 0.052, power: 2.3, f: PAINT, taper: [0.94, 0.9] });
  roundTailLamp(ctx, [0, hp.Rr + Math.cos(1.62) * (hp.Rr + 0.045) + 0.02, Math.sin(1.62) * (hp.Rr + 0.045)], 0.03, -0.15, 'chassis', CHROME);
  for (const s of [-1, 1]) {
    tubeAlong(ctx, 'chassis', [[s * 0.09, 0.62, -0.2], [s * 0.1, 0.55, -0.02], [s * 0.1, 0.52, 0.2], [s * 0.095, 0.47, 0.34]], 0.0065, CHROME);
    indicatorPod(ctx, 'chassis', [s * 0.085, 0.45, 0.32], [s * 0.16, 0.46, 0.34], 0.014);
  }
  plateHanger(ctx, { fromZ: 0.05, fromY: 0.58 });
  sidePlate(ctx, o.cover, 0.127, 0.02, PAINT);
}

function frontFender(ctx: KitContext): void {
  const hp = ctx.hp;
  fenderArc(ctx, { group: 'forkLower', cz: hp.frontAxle[2], cy: hp.frontAxle[1], r: hp.Rf + 0.028, a0: -0.82, a1: 1.12, half: 0.086, drop: 0.046, power: 2.3, f: PAINT });
}

function controls(ctx: KitContext): void {
  const pv = ctx.hp.pivot;
  footPegs(ctx, { at: ctx.bp.rider.peg, f: hard('#222428', 0.5, 0.4, 0.5, Micro.cast), pivot: pv, peg: F.rubber });
  pillionPegs(ctx, [0.2, 0.45, 0.04], hard('#222428', 0.5, 0.4, 0.5, Micro.cast));
  sideStand(ctx);
}

// ───────────────────────────── Interceptor 650 ─────────────────────────────

function interceptorBody(ctx: KitContext): void {
  const crank = ctx.bp.engine.crank;
  cradleFrame(ctx, { f: BLACK_STEEL(), crankZ: crank[2], cradleY: 0.215, cradleX: 0.1, seatPost: [-0.5, 0.76], tail: [0.12, 0.77], tailX: 0.078, rTop: 0.0175 });
  const ob = buildTank(ctx, {
    front: -1.0,
    back: -0.54,
    top: 0.99,
    bottomFront: 0.8,
    bottomBack: 0.77,
    width: 0.32,
    style: 'teardrop',
    knee: 0.1,
    capZ: -0.85,
    topLine: [[-1.0, 0.9], [-0.95, 0.945], [-0.87, 0.985], [-0.78, 0.995], [-0.68, 0.975], [-0.6, 0.94], [-0.54, 0.905]],
    bottomLine: [[-1.0, 0.8], [-0.88, 0.765], [-0.7, 0.75], [-0.54, 0.765]],
    halfLine: [[-1.0, 0.07], [-0.95, 0.115], [-0.87, 0.15], [-0.76, 0.16], [-0.66, 0.135], [-0.54, 0.09]],
  });
  const sp = sideAt(ob, -0.67, 0.86, 1);
  kneePads(ctx, { z: -0.67, y: 0.855, x: sp.p[0] + 0.001, len: 0.12, hgt: 0.09 });
  buildSeat(ctx, { front: -0.58, back: 0.15, yFront: 0.83, y: 0.835, yBack: 0.87, width: 0.3, thick: 0.065, frontWidth: 0.17 }, tint(seatFinish(ctx), ctx.livery.seat));
  rearEnd(ctx, { cover: [[-0.54, 0.665], [-0.36, 0.675], [-0.32, 0.6], [-0.35, 0.53], [-0.48, 0.5], [-0.56, 0.56]] });
  bead(ctx, 'chassis', [[0.138, 0.62, -0.5], [0.141, 0.6, -0.42], [0.141, 0.585, -0.36]], 0.0018, tint(CHROME, '#dfe1e4'));
  frontFender(ctx);
  classicHeadlamp(ctx, { r: 0.0875, y: -0.125, chrome: true, led: false, trim: CHROME });
  const d = ctx.bp.cockpit;
  twinClockBezels(ctx, d.dashPos, d.dashSize[0], d.dashSize[1], d.dashTiltDeg);
  const ports = buildAirTwin(ctx, {
    crank,
    tiltDeg: 6,
    pitch: 0.108,
    bore: 0.105,
    depth: 0.108,
    barrelH: 0.135,
    headH: 0.09,
    fins: 13,
    style: 'enfield',
    camText: 'INTERCEPTOR',
    fin: {
      case: castFinish('#17181b', 0.5, 0.5),
      block: castFinish('#141518', 0.55, 0.45),
      edge: vary(F.polishedAlu, { rough: 0.22 }),
      cover: vary(F.brushedAlu, { micro: Micro.brushed, rough: 0.3 }),
      cam: hard('#b9bdc2', 1, 0.26, 0.2, Micro.brushed),
      trim: CHROME,
    },
  });
  peashooters(ctx, ports, {
    header: hard('#d3d6da', 1, 0.14, 0.2, Micro.brushed),
    can: polishedCan(),
    capF: hard('#1a1b1d', 0.3, 0.4, 0.5),
    headerR: 0.0185,
    canR: 0.046,
    canREnd: 0.052,
    from: [0.18, 0.222, -0.46],
    to: [0.205, 0.292, 0.1],
    lowY: 0.2,
    crossoverZ: crank[2] - 0.16,
    shield: true,
    bands: 2,
  });
  controls(ctx);
}

function interceptorLivery(c: LiveryCanvas, lv: Livery, env: LiveryEnv): void {
  const orange = env.index === 0;
  c.views(ALL_VIEWS, (p) => {
    p.fill(lv.primary, 'metallic');
    if (p.view === 'right' || p.view === 'left') {
      // Two-tone: white lower tank band with a pinstripe, "Royal Enfield" script on the flank
      p.poly([[-1.0, 0.8], [-0.54, 0.77], [-0.54, 0.835], [-0.7, 0.835], [-0.85, 0.84], [-1.0, 0.86]], lv.secondary, 'gloss');
      p.line([[-1.0, 0.875], [-0.95, 0.92], [-0.85, 0.955], [-0.75, 0.96], [-0.65, 0.94], [-0.58, 0.9]], orange ? '#f3eee2' : '#c9a24a', 0.003, 'gloss');
      p.text('Royal Enfield', -0.85, 0.905, { color: '#f4f1e8', size: 0.026, weight: '700', italic: true, font: '"Brush Script MT", "Segoe Script", cursive', finish: 'chrome' });
    }
  });
}

export function interceptor650Blueprint(spec: BikeSpec): BikeBlueprint {
  const blk = '#141517';
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.17, 0.79, 1.1],
    wheelbase: 1.4,
    rakeDeg: 27,
    trail: 0.105,
    forkLength: 0.74,
    front: { tyre: '100/90-18', rimWidthIn: 2.5, tyreLabel: 'Classic', tread: 'cruiser', crown: 1.1 },
    rear: { tyre: '130/70-18', rimWidthIn: 3.0, tyreLabel: 'Classic', tread: 'cruiser', crown: 1.05 },
    frontWheel: { type: 'wire', spokes: 36, shape: 'straight', color: blk },
    rearWheel: { type: 'wire', spokes: 36, shape: 'straight', color: blk },
    fork: { type: 'rwu', stanchion: 0.041, spacing: 0.2, outerColor: blk, innerColor: '#e6e8eb', footColor: '#2b2d31', capColor: '#b9bdc2', aboveClamp: 0.02, clampGap: 0.19 },
    frontBrake: { discs: 1, discDia: 0.32, disc: 'floating', carrierColor: '#2b2d31', caliper: 'axial2', caliperColor: '#1b1c1e', caliperAngleDeg: 100 },
    rearBrake: { discs: 1, discDia: 0.24, disc: 'fixed', carrierColor: '#2b2d31', caliper: 'axial1', caliperColor: '#1b1c1e', caliperAngleDeg: 205 },
    frame: { type: 'cradle', color: blk, metal: 0.3, rough: 0.45, subframe: 'tubular', subframeColor: blk, width: 0.3 },
    swingarm: { type: 'tubular', length: 0.5, angleDeg: 6, color: blk, metal: 0.3, rough: 0.45 },
    shock: { layout: 'twin', springColor: '#c9ccd1', bodyColor: '#1c1d20', reservoir: false },
    drive: { type: 'chain', side: 'left', frontTeeth: 16, rearTeeth: 46, sprocketColor: '#2b2d31', chainColor: '#2a2a2a' },
    engine: { layout: 'P2_270', cc: 648, crank: [0, 0.37, -0.76], tiltDeg: 6, caseColor: '#17181b', coverColor: '#b9bdc2', headColor: '#141518', camCoverColor: '#b9bdc2', finned: true, liquidCooled: false },
    exhaust: { route: 'peashooter', side: 'both', can: 'round', canLength: 0.55, canDia: 0.09, canFinish: 'chrome', headerFinish: 'chrome' },
    cockpit: {
      bars: 'tubular',
      grip: [0.36, 1.04, -0.99],
      barDia: 0.0222,
      dash: 'analogTwin',
      dashPos: [0, 1.02, -1.11],
      dashSize: [0.2, 0.092],
      dashTiltDeg: 55,
      dashMount: 'bars',
      mirrors: 'bar',
      mirrorPos: [0.37, 1.19, -0.99],
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
    seat: { height: 0.804, front: -0.58, back: 0.15, pillion: 'seat', color: '#141414' },
    rider: { hip: [0, 0.875, -0.3], peg: [0.26, 0.34, -0.45], torsoPitch: 0.2 },
    footrests: 'scooter',
    plate: { mount: 'hanger', pos: [0, 0.54, 0.4], tiltDeg: -14 },
    body: interceptorBody,
    livery: interceptorLivery,
    groundClearance: 0.174,
    features: ['skip:frame', 'skip:engine', 'skip:exhaust'],
    zones: { splitY: 0.72, decal: [-0.78, 0.9] },
  };
}

// ───────────────────────────── Classic 350 ─────────────────────────────

/** Chrome nacelle: round headlamp in a chrome bucket with the speedometer pod on top and the key on the left. */
function nacelle(ctx: KitContext): void {
  const L = classicHeadlamp(ctx, { r: 0.088, y: -0.135, chrome: true, led: false, trim: CHROME, indicators: false });
  // Outer chrome shell behind the lamp: a dome spanning between the fork legs with the pod on its top
  const c = L.clone();
  ctx.add('steer', lathe([[0, -0.1], [0.07, -0.098], [0.096, -0.06], [0.106, 0.0], [0.108, 0.014], [0.096, 0.02]].map(([r, a]) => [r, a] as P2), { segs: ctx.seg(44, 16), axis: 'z', sharp: [4] }), vary(CHROME, { rough: 0.07 }), mul(T(c.x, c.y, c.z + 0.002), RY(Math.PI)));
  // Speedometer pod on top of the nacelle
  const d = ctx.bp.cockpit;
  bezelRing(ctx, 'steer', [d.dashPos[0], d.dashPos[1] + 0.003, d.dashPos[2]], [0, Math.sin((d.dashTiltDeg * Math.PI) / 180), Math.cos((d.dashTiltDeg * Math.PI) / 180)], d.dashSize[0] / 2 + 0.006, 0.0055, CHROME);
  ctx.add('steer', roundBox(0.1, 0.04, 0.08, 0.02, 2), vary(CHROME, { rough: 0.08 }), mul(T(d.dashPos[0], d.dashPos[1] - 0.03, d.dashPos[2] + 0.015), new THREE.Matrix4().makeRotationX(-0.4)));
  for (const s of [-1, 1]) indicatorPod(ctx, 'steer', [s * 0.115, c.y - 0.05, c.z + 0.02], [s * 0.18, c.y - 0.06, c.z + 0.01], 0.015);
}

function classicExhaust(ctx: KitContext, port: { pos: P3; dir: P3 }): void {
  const r = 0.0195;
  const path = pipe(ctx, [port.pos, [port.pos[0] + 0.01, port.pos[1] - 0.06, port.pos[2] - 0.075], [0.06, 0.34, port.pos[2] - 0.16], [0.14, 0.235, port.pos[2] - 0.12], [0.18, 0.205, -0.44], [0.19, 0.215, -0.36]], r, hard('#d3d6da', 1, 0.14, 0.2, Micro.brushed));
  portFlange(ctx, port.pos, port.dir, r, vary(F.steel, { rough: 0.3 }));
  clampRing(ctx, path, Math.floor(path.length * 0.5), r, F.steel);
  heatShield(ctx, path, Math.floor(path.length * 0.38), path.length - 3, r, vary(CHROME, { rough: 0.12 }), { span: Math.PI * 1.0, centre: Math.PI * 0.45, slots: 6 });
  can(ctx, [0.19, 0.215, -0.36], [0.215, 0.285, 0.1], { r: 0.052, rEnd: 0.058, kind: 'tapered', f: polishedCan(), capF: polishedCan(), slash: 0, bands: 2, bandF: vary(CHROME, { rough: 0.15 }) });
  // Mounting bracket to the pillion hanger
  tubeAlong(ctx, 'chassis', [[0.2, 0.26, -0.18], [0.14, 0.3, -0.16], [0.1, 0.34, -0.15]], 0.006, F.black);
  ctx.anchor('exhaustOutlet', [0.215, 0.285, 0.1]);
}

function classicBody(ctx: KitContext): void {
  const crank = ctx.bp.engine.crank;
  cradleFrame(ctx, { f: BLACK_STEEL(), crankZ: crank[2], cradleY: 0.21, cradleX: 0.095, seatPost: [-0.48, 0.77], tail: [0.12, 0.78], tailX: 0.075, rTop: 0.017 });
  const ob = buildTank(ctx, {
    front: -1.0,
    back: -0.56,
    top: 1.0,
    bottomFront: 0.82,
    bottomBack: 0.78,
    width: 0.3,
    style: 'teardrop',
    knee: 0.08,
    capZ: -0.82,
    topLine: [[-1.0, 0.92], [-0.95, 0.955], [-0.87, 0.992], [-0.78, 1.0], [-0.69, 0.98], [-0.62, 0.945], [-0.56, 0.91]],
    bottomLine: [[-1.0, 0.82], [-0.88, 0.785], [-0.7, 0.775], [-0.56, 0.79]],
    halfLine: [[-1.0, 0.065], [-0.95, 0.105], [-0.87, 0.14], [-0.76, 0.15], [-0.67, 0.13], [-0.56, 0.085]],
  });
  const sp = sideAt(ob, -0.66, 0.87, 1);
  kneePads(ctx, { z: -0.66, y: 0.865, x: sp.p[0] + 0.001, len: 0.11, hgt: 0.085 });
  // Winged chrome tank badges on both flanks
  for (const s of [-1, 1]) {
    const b = sideAt(ob, -0.88, 0.905, s);
    ctx.add('chassis', roundBox(0.005, 0.042, 0.075, 0.002, 1), vary(CHROME, { rough: 0.08 }), T(b.p[0] + s * 0.0015, b.p[1], b.p[2]));
    ctx.add('chassis', lathe([[0, 0], [0.013, 0], [0.014, 0.003], [0, 0.004]], { segs: 18, axis: 'x', sharp: [1] }), hard('#b3121b', 0.2, 0.3, 0.8), mul(T(b.p[0] + s * 0.004, b.p[1], b.p[2]), s > 0 ? new THREE.Matrix4() : new THREE.Matrix4().makeScale(-1, 1, 1)));
  }
  // Sculpted rider saddle + separate pillion pad
  buildSeat(ctx, { front: -0.6, back: -0.1, yFront: 0.835, y: 0.822, yBack: 0.855, width: 0.28, thick: 0.07, frontWidth: 0.16 }, tint(seatFinish(ctx), ctx.livery.seat));
  buildSeat(ctx, { front: -0.09, back: 0.18, yFront: 0.835, y: 0.845, yBack: 0.85, width: 0.24, thick: 0.05, frontWidth: 0.22 }, tint(seatFinish(ctx), ctx.livery.seat));
  rearEnd(ctx, { cover: [[-0.5, 0.665], [-0.34, 0.675], [-0.3, 0.6], [-0.33, 0.52], [-0.46, 0.49], [-0.52, 0.56]] });
  frontFender(ctx);
  nacelle(ctx);
  const ports = buildSingle(ctx, {
    crank,
    tiltDeg: 12,
    barrelH: 0.15,
    headH: 0.1,
    fins: 14,
    camText: 'CLASSIC 350',
    fin: {
      case: castFinish('#17181b', 0.5, 0.5),
      block: castFinish('#141518', 0.55, 0.45),
      edge: vary(F.polishedAlu, { rough: 0.22 }),
      cover: vary(F.brushedAlu, { micro: Micro.brushed, rough: 0.3 }),
      cam: hard('#b9bdc2', 1, 0.26, 0.2, Micro.brushed),
      trim: CHROME,
    },
  });
  classicExhaust(ctx, ports[0]);
  controls(ctx);
}

function classicLivery(c: LiveryCanvas, lv: Livery, env: LiveryEnv): void {
  const green = env.index === 0;
  c.views(ALL_VIEWS, (p) => {
    p.fill(lv.primary, 'metallic');
    if (p.view === 'right' || p.view === 'left') {
      // Hand-painted gold pinstripe following the tank flank
      const gold = green ? '#d1ad57' : '#c9a24a';
      const pts: P2[] = [[-0.98, 0.88], [-0.93, 0.925], [-0.85, 0.96], [-0.76, 0.966], [-0.68, 0.945], [-0.6, 0.915]];
      p.line(pts, gold, 0.0028, 'gloss');
      p.line(pts.map(([z, y]) => [z, y - 0.07] as P2), gold, 0.0018, 'gloss');
      p.text('ROYAL ENFIELD', -0.8, 0.835, { color: green ? '#efe9d6' : '#d5b45c', size: 0.016, weight: '800', spacing: 0.14, finish: 'chrome' });
    }
  });
}

export function classic350Blueprint(spec: BikeSpec): BikeBlueprint {
  const blk = '#141517';
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.145, 0.8, 1.09],
    wheelbase: 1.39,
    rakeDeg: 27.5,
    trail: 0.112,
    forkLength: 0.75,
    front: { tyre: '100/90-19', rimWidthIn: 2.5, tyreLabel: 'Classic', tread: 'cruiser', crown: 1.1 },
    rear: { tyre: '120/80-18', rimWidthIn: 2.75, tyreLabel: 'Classic', tread: 'cruiser', crown: 1.1 },
    frontWheel: { type: 'wire', spokes: 36, shape: 'straight', color: blk },
    rearWheel: { type: 'wire', spokes: 36, shape: 'straight', color: blk },
    fork: { type: 'rwu', stanchion: 0.041, spacing: 0.2, outerColor: blk, innerColor: '#e6e8eb', footColor: '#2b2d31', capColor: '#b9bdc2', aboveClamp: 0.02, clampGap: 0.19 },
    frontBrake: { discs: 1, discDia: 0.3, disc: 'floating', carrierColor: '#2b2d31', caliper: 'axial2', caliperColor: '#1b1c1e', caliperAngleDeg: 100 },
    rearBrake: { discs: 1, discDia: 0.27, disc: 'fixed', carrierColor: '#2b2d31', caliper: 'axial1', caliperColor: '#1b1c1e', caliperAngleDeg: 205 },
    frame: { type: 'cradle', color: blk, metal: 0.3, rough: 0.45, subframe: 'tubular', subframeColor: blk, width: 0.3 },
    swingarm: { type: 'tubular', length: 0.5, angleDeg: 6, color: blk, metal: 0.3, rough: 0.45 },
    shock: { layout: 'twin', springColor: '#b9bcc2', bodyColor: '#1c1d20', reservoir: false },
    drive: { type: 'chain', side: 'left', frontTeeth: 16, rearTeeth: 45, sprocketColor: '#2b2d31', chainColor: '#2a2a2a' },
    engine: { layout: 'SINGLE', cc: 349, crank: [0, 0.37, -0.74], tiltDeg: 12, caseColor: '#17181b', coverColor: '#b9bdc2', headColor: '#141518', camCoverColor: '#b9bdc2', finned: true, liquidCooled: false },
    exhaust: { route: 'highSingle', side: 'right', can: 'round', canLength: 0.55, canDia: 0.1, canFinish: 'chrome', headerFinish: 'chrome' },
    cockpit: {
      bars: 'tubular',
      grip: [0.36, 1.05, -0.98],
      barDia: 0.0222,
      dash: 'analog',
      dashPos: [0, 1.012, -1.15],
      dashSize: [0.085, 0.085],
      dashTiltDeg: 55,
      dashMount: 'bars',
      mirrors: 'bar',
      mirrorPos: [0.37, 1.2, -0.98],
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
    seat: { height: 0.805, front: -0.6, back: 0.18, pillion: 'seat', color: '#1a1512' },
    rider: { hip: [0, 0.885, -0.3], peg: [0.26, 0.34, -0.43], torsoPitch: 0.18 },
    footrests: 'scooter',
    plate: { mount: 'hanger', pos: [0, 0.54, 0.4], tiltDeg: -14 },
    body: classicBody,
    livery: classicLivery,
    groundClearance: 0.17,
    features: ['skip:frame', 'skip:engine', 'skip:exhaust'],
    zones: { splitY: 0.72, decal: [-0.8, 0.835] },
  };
}
