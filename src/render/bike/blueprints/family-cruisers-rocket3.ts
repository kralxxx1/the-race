import type { BikeSpec, Livery } from '../../../data/bikes';
import { RX, T, mul, type KitContext } from '../context';
import { bodyQ, PAINT, seatFinish } from '../kit/body';
import type { EnginePort } from '../kit/cruisers-engine';
import { can, clampRing, pipe } from '../kit/cruisers-exhaust';
import { buildRocketTriple } from '../kit/cruisers-triple';
import { ledStrip, roundHeadlight } from '../kit/lights';
import { plateHanger } from '../kit/rear';
import { curve, outlineLoft, SECTIONS, stationsBetween, type OutlineBody } from '../kit/shape';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv, type Pen } from '../livery';
import { lathe, rod, roundBox, type P2, type P3 } from '../mesh';
import { F, hard, vary } from '../sink';
import type { BikeBlueprint } from '../types';
import { footPegs, sideStand } from './family-cruisers-controls';
import { capMeshOf, cruiserTank, fenderArc, radiatorBlock, tubeAlong } from './family-cruisers-parts';

/**
 * Triumph Rocket 3 R (2024): the 2458 cc triple.
 * Spec sheet: wheelbase 1677 mm, rake 29°, trail 134 mm, seat 773 mm, 150/80R17 front + 240/50R16 rear on
 * cast five-spoke wheels, 47 mm USD fork, twin 320 mm discs with Stylema calipers, aluminium twin-spar
 * frame, shaft drive, longitudinal inline-three (cylinders leaning right), three brushed header pipes
 * on the right into one big silencer.
 * Design cues: twin round LED headlamps, big muscular tank with brushed flanks, huge rear tyre, short
 * tail, bar-mounted TFT.
 */

const Y = 0.335;
const ZC = -0.93;

function engine(ctx: KitContext): EnginePort[] {
  return buildRocketTriple(ctx, {
    y: Y,
    zc: ZC,
    pitch: 0.112,
    leanDeg: 32,
    black: hard('#17181b', 0.4, 0.5, 0.4),
    camF: hard('#202226', 0.55, 0.38, 0.6),
    trim: vary(F.brushedAlu, { rough: 0.3 }),
    frontF: hard('#202226', 0.55, 0.4, 0.6),
    camText: 'ROCKET 3',
  });
}

function exhaust(ctx: KitContext, ports: EnginePort[]): void {
  const r = 0.0225;
  const steel = vary(F.steel, { rough: 0.2, color: [0.8, 0.8, 0.82] });
  const heights = [0.205, 0.245, 0.285];
  const collector: P3 = [0.235, 0.25, -0.6];
  ports.forEach((p, i) => {
    const z = p.pos[2];
    const path = pipe(ctx, [p.pos, [p.pos[0] + 0.05, p.pos[1] - 0.045, z], [0.272 + i * 0.002, p.pos[1] - 0.16, z - 0.012 * (i + 1)], [0.268, 0.33 - i * 0.02, z - 0.02 + i * 0.01], [0.255, heights[i] + 0.02, z + 0.07 + i * 0.04], [0.245, heights[i], -0.72 + i * 0.03], collector], r, steel);
    clampRing(ctx, path, Math.floor(path.length * 0.55), r);
  });
  ctx.add('chassis', lathe([[0.016, -0.05], [0.058, -0.045], [0.064, 0.0], [0.06, 0.05]], { segs: ctx.seg(28, 10), axis: 'z' }), steel, T(collector[0], collector[1], collector[2] + 0.04));
  // One big brushed silencer, upswept with a slanted mouth.
  can(ctx, [0.235, 0.25, -0.6], [0.262, 0.318, 0.12], { r: 0.066, rEnd: 0.074, kind: 'tapered', f: steel, capF: F.chrome, slash: 0.5, slashDir: 'out', bands: 2, bandF: F.chrome });
  ctx.anchor('exhaustOutlet', [0.262, 0.318, 0.12]);
}

function seatBodies(ctx: KitContext): void {
  const q = bodyQ(ctx, 1.2);
  const rider: OutlineBody = {
    zs: stationsBetween(-0.74, -0.32, 12, 0.4),
    top: curve([[-0.74, 0.8], [-0.66, 0.785], [-0.55, 0.775], [-0.44, 0.778], [-0.36, 0.795], [-0.32, 0.8]]),
    bottom: curve([[-0.74, 0.74], [-0.5, 0.68], [-0.32, 0.72]]),
    half: curve([[-0.74, 0.05], [-0.68, 0.1], [-0.55, 0.145], [-0.42, 0.15], [-0.32, 0.135]]),
    sections: [{ z: -0.74, pts: SECTIONS.seat }],
  };
  ctx.add('chassis', outlineLoft(rider, { ...q, capFront: true }), seatFinish(ctx));
  ctx.add('chassis', capMeshOf(rider, -0.32, true), seatFinish(ctx));
  const pillion: OutlineBody = {
    zs: stationsBetween(-0.32, 0.1, 10, 0.4),
    top: curve([[-0.32, 0.805], [-0.2, 0.825], [-0.05, 0.842], [0.06, 0.845], [0.1, 0.835]]),
    bottom: curve([[-0.32, 0.74], [-0.1, 0.75], [0.1, 0.79]]),
    half: curve([[-0.32, 0.13], [-0.2, 0.125], [-0.05, 0.1], [0.1, 0.07]]),
    sections: [{ z: -0.32, pts: SECTIONS.seat }],
  };
  ctx.add('chassis', outlineLoft(pillion, { ...q, capFront: true, capBack: false }), seatFinish(ctx));
  ctx.add('chassis', capMeshOf(pillion, 0.1, true), seatFinish(ctx));
  // Painted tail cowl under the pillion pad with the LED tail light bar.
  const tail: OutlineBody = {
    zs: stationsBetween(-0.3, 0.13, 10, 0.5),
    top: curve([[-0.3, 0.745], [-0.1, 0.752], [0.06, 0.785], [0.13, 0.8]]),
    bottom: curve([[-0.3, 0.675], [-0.05, 0.69], [0.13, 0.74]]),
    half: curve([[-0.3, 0.115], [-0.1, 0.105], [0.05, 0.075], [0.13, 0.055]]),
    sections: [{ z: -0.3, pts: SECTIONS.closed }],
  };
  ctx.add('chassis', outlineLoft(tail, { ...bodyQ(ctx, 1), capFront: false, capBack: false }), PAINT);
  ctx.add('chassis', capMeshOf(tail, 0.13, true), PAINT);
  ledStrip(ctx, 'chassis', [[-0.06, 0.775, 0.136], [0.0, 0.78, 0.139], [0.06, 0.775, 0.136]], 0.016, 0.006, 'tail');
}

function body(ctx: KitContext): void {
  const hp = ctx.hp;
  const black = F.glossBlack;
  const ports = engine(ctx);
  exhaust(ctx, ports);

  // ── Muscular tank with knee recesses and the offset filler cap ──
  cruiserTank(ctx, {
    front: -1.22,
    back: -0.62,
    top: 1.0,
    bottomFront: 0.87,
    bottomBack: 0.83,
    width: 0.4,
    style: 'muscle',
    knee: 0.16,
    topLine: [[-1.22, 0.935], [-1.15, 0.975], [-1.05, 0.998], [-0.92, 0.995], [-0.8, 0.965], [-0.7, 0.925], [-0.62, 0.89]],
    bottomLine: [[-1.22, 0.87], [-1.0, 0.83], [-0.8, 0.8], [-0.62, 0.82]],
    halfLine: [[-1.22, 0.1], [-1.15, 0.155], [-1.03, 0.197], [-0.9, 0.2], [-0.78, 0.17], [-0.68, 0.125], [-0.62, 0.1]],
    cap: { x: 0, z: -0.95, r: 0.036, f: vary(F.brushedAlu, { rough: 0.22 }) },
    q: 1.2,
  });
  seatBodies(ctx);

  // ── Short rear mudguard over the 240 tyre, hanger plate ──
  fenderArc(ctx, { group: 'chassis', cz: 0, cy: hp.Rr, r: hp.Rr + 0.03, a0: -0.05, a1: 0.95, half: 0.13, drop: 0.03, power: 2.4, f: PAINT, taper: [1, 0.85] });
  plateHanger(ctx, { fromZ: 0.05, fromY: 0.74 });
  // ── Short front mudguard ──
  fenderArc(ctx, { group: 'forkLower', cz: hp.frontAxle[2], cy: hp.frontAxle[1], r: hp.Rf + 0.026, a0: -0.55, a1: 0.9, half: 0.078, drop: 0.035, power: 2.4, f: PAINT });

  // ── Twin round LED headlamps in a black mask ──
  for (const s of [-1, 1]) {
    roundHeadlight(ctx, 'steer', [s * 0.1, hp.head[1] - 0.085, hp.head[2] - 0.2], 0.074, [0, 0, -1], { led: true, chrome: false });
  }
  ctx.add('steer', roundBox(0.3, 0.032, 0.06, 0.012, 2), black, T(0, hp.head[1] + 0.004, hp.head[2] - 0.15));
  ctx.add('steer', roundBox(0.06, 0.1, 0.07, 0.02, 2), black, T(0, hp.head[1] - 0.085, hp.head[2] - 0.15));

  // ── Radiator with its shroud in front of the engine ──
  radiatorBlock(ctx, { cx: 0, cy: 0.55, cz: -1.26, w: 0.32, h: 0.3, tiltDeg: 8 });
  tubeAlong(ctx, 'chassis', [[0.1, 0.66, -1.24], [0.12, 0.7, -1.12], [0.1, 0.7, -1.0]], 0.014, F.hose);
  tubeAlong(ctx, 'chassis', [[-0.1, 0.42, -1.24], [-0.12, 0.38, -1.1], [-0.1, 0.36, -1.0]], 0.014, F.hose);

  // ── Shaft drive on the right: swingarm housing and final-drive casing ──
  const pv = hp.pivot;
  ctx.add('swingarm', rod([0.165, pv[1] - 0.01, pv[2] + 0.05], [0.165, hp.Rr, -0.05], 0.045, 0.04, ctx.seg(20, 8)), hard('#202226', 0.6, 0.4, 0.6));
  ctx.add('swingarm', lathe([[0, -0.06], [0.08, -0.058], [0.095, -0.04], [0.098, 0.04], [0.08, 0.06], [0, 0.06]], { segs: ctx.seg(40, 14), axis: 'x', sharp: [1, 4] }), hard('#202226', 0.6, 0.4, 0.6), T(0.17, hp.Rr, 0));
  ctx.add('swingarm', lathe([[0, 0], [0.05, 0], [0.054, 0.006], [0.046, 0.013], [0, 0.014]], { segs: ctx.seg(32, 10), axis: 'x', sharp: [1, 3] }), vary(F.brushedAlu, { rough: 0.28 }), T(0.226, hp.Rr, 0));
  ctx.add('swingarm', lathe([[0.034, 0], [0.042, 0.012], [0.034, 0.024], [0.042, 0.036], [0.034, 0.048], [0.042, 0.06], [0.034, 0.072]], { segs: ctx.seg(20, 8), axis: 'y' }), F.rubber, mul(T(0.165, pv[1] - 0.02, pv[2] + 0.1), RX(-1.5)));

  // ── Foot controls (mid-forward pegs) ──
  footPegs(ctx, { at: ctx.bp.rider.peg, f: hard('#26282c', 0.7, 0.35, 0.6), pivot: pv });
  sideStand(ctx);
}

// ───────────────────────────── livery ─────────────────────────────

function livery(c: LiveryCanvas, lv: Livery, env: LiveryEnv): void {
  const red = env.index === 1;
  c.views(ALL_VIEWS, (p: Pen) => {
    p.fill(lv.primary, 'metallic');
    if (p.view === 'right' || p.view === 'left') {
      // Hand-brushed aluminium flanks on the lower tank.
      const flank: P2[] = [[-1.2, 0.87], [-1.08, 0.842], [-0.92, 0.825], [-0.76, 0.83], [-0.65, 0.86], [-0.7, 0.9], [-0.82, 0.88], [-0.96, 0.875], [-1.1, 0.9]];
      p.poly(flank, '#b8bdc3', 'metallic');
      p.text('TRIUMPH', -0.93, 0.935, { color: red ? '#e9d9c4' : '#d6d8dc', size: 0.03, weight: '800', spacing: 0.12, finish: 'chrome' });
      p.text('ROCKET 3 R', -0.14, 0.77, { color: '#c4c7cc', size: 0.02, weight: '800', spacing: 0.08, finish: 'chrome' });
    }
  });
}

export function rocket3Blueprint(spec: BikeSpec): BikeBlueprint {
  const black = '#1b1c1f';
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.5, 0.95, 1.2],
    wheelbase: 1.677,
    rakeDeg: 29,
    trail: 0.134,
    forkLength: 0.75,
    front: { tyre: '150/80R17', rimWidthIn: 4.0, crown: 1.1, tread: 'cruiser', tyreLabel: 'Cruise Radial' },
    rear: { tyre: '240/50R16', rimWidthIn: 7.5, crown: 1.3, tread: 'cruiser', tyreLabel: 'Cruise Radial' },
    frontWheel: { type: 'cast', spokes: 5, shape: 'y', color: black, machinedLip: true },
    rearWheel: { type: 'cast', spokes: 5, shape: 'y', color: black, machinedLip: true },
    fork: { type: 'usd', stanchion: 0.047, spacing: 0.235, outerColor: '#1b1c1f', innerColor: '#2a2c30', footColor: '#1b1c1f', capColor: '#8a8d92', adjusterColor: '#8a8d92', aboveClamp: 0.012, clampGap: 0.2, label: 'ROCKET', labelColor: '#d6d8dc' },
    frontBrake: { discs: 2, discDia: 0.32, disc: 'floating', carrierColor: '#26282b', caliper: 'radialMono4', caliperColor: '#1d1e21', caliperText: 'brembo', caliperTextColor: '#d6d8dc', caliperAngleDeg: 70 },
    rearBrake: { discs: 1, discDia: 0.3, disc: 'floating', carrierColor: '#26282b', caliper: 'axial2', caliperColor: '#1d1e21', caliperAngleDeg: 205 },
    frame: { type: 'twinSpar', color: '#2a2c30', metal: 0.7, rough: 0.4, subframe: 'tubular', subframeColor: '#1d1e21', width: 0.36 },
    swingarm: { type: 'box', length: 0.72, angleDeg: 4, side: 'right', color: '#202226', metal: 0.6, rough: 0.4 },
    shock: { layout: 'monoSide', springColor: '#2a2c30', bodyColor: '#2a2c30', reservoir: true },
    drive: { type: 'shaft', side: 'right', frontTeeth: 0, rearTeeth: 0, sprocketColor: '#c9ccd2' },
    engine: {
      layout: 'I3',
      cc: 2458,
      crank: [0, Y, ZC],
      tiltDeg: 32,
      caseColor: '#17181b',
      coverColor: '#202226',
      headColor: '#17181b',
      camCoverColor: '#202226',
      finned: false,
      liquidCooled: true,
      width: 0.34,
    },
    exhaust: { route: 'none', side: 'right', can: 'round', canLength: 0.7, canDia: 0.13, canFinish: 'titanium', headerFinish: 'steel' },
    cockpit: {
      bars: 'tall',
      grip: [0.42, 1.075, -1.08],
      barDia: 0.0254,
      dash: 'tft',
      dashPos: [0, 1.03, -1.3],
      dashSize: [0.13, 0.082],
      dashTiltDeg: 52,
      dashMount: 'bars',
      mirrors: 'bar',
      mirrorPos: [0.4, 1.2, -1.08],
      mirrorSize: [0.12, 0.08],
      mirrorIndicators: true,
      mirrorShape: 'oval',
      mirrorColor: '#141518',
      topClamp: 'cast',
      steeringDamper: 'none',
      leverColor: '#2a2c30',
      reservoirs: true,
      clutch: 'hydraulic',
      ignition: 'keyless',
      switchColor: '#141518',
      gripColor: '#131313',
      barEndColor: '#2a2c30',
    },
    lights: { head: 'round', tail: 'strip', rearIndicators: 'stalk' },
    seat: { height: 0.773, front: -0.74, back: 0.1, pillion: 'seat', color: '#151515' },
    rider: { hip: [0, 0.865, -0.46], peg: [0.285, 0.34, -0.72], torsoPitch: 0.18 },
    footrests: 'scooter',
    plate: { mount: 'hanger', pos: [0, 0.7, 0.24], tiltDeg: -20 },
    body,
    livery,
    groundClearance: 0.13,
    features: ['skip:engine'],
    zones: { splitY: 0.34, decal: [-0.93, 0.935] },
  };
}
