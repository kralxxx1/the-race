import type { BikeSpec, Livery } from '../../../data/bikes';
import { RX, T, mul, type KitContext } from '../context';
import { bodyQ, PAINT, seatFinish } from '../kit/body';
import { buildBigBoxer } from '../kit/cruisers-boxer';
import type { EnginePort } from '../kit/cruisers-engine';
import { can, clampRing, pipe } from '../kit/cruisers-exhaust';
import { indicatorPod, roundHeadlight } from '../kit/lights';
import { plateHanger } from '../kit/rear';
import { curve, outlineLoft, SECTIONS, stationsBetween, type OutlineBody } from '../kit/shape';
import { ALL_VIEWS, type LiveryCanvas, type Pen } from '../livery';
import { lathe, roundBox, rod, type P2, type P3 } from '../mesh';
import { F, hard, vary } from '../sink';
import type { BikeBlueprint } from '../types';
import { floorBoards, sideStand } from './family-cruisers-controls';
import { bead, capMeshOf, cruiserTank, fenderArc, roundTailLamp, tubeAlong } from './family-cruisers-parts';

/**
 * BMW R 18 (2024, Black Storm Metallic).
 * Spec sheet: wheelbase 1731 mm, rake ~32.7°, trail 118 mm, seat 690 mm, 120/70R19 front + 180/65B16 rear
 * on wire-spoke wheels, 49 mm fork, double-loop tubular steel frame with the hidden cantilever shock
 * ("hardtail look"), shaft drive on the right, 1802 cc air/oil-cooled "Big Boxer", two chrome
 * fishtail silencers.
 * Design cues: huge exposed cylinder heads, chrome pushrod tubes, long teardrop tank with the BMW
 * roundel, round chrome headlamp, solo seat, hand-painted white coach lines on black.
 */

const Y = 0.385;
const CASE: [number, number] = [-1.14, -0.76];
const CYL_Z = -0.985;

function engine(ctx: KitContext): EnginePort[] {
  return buildBigBoxer(ctx, {
    y: Y,
    caseZ: CASE,
    cylZ: CYL_Z,
    xEnd: 0.355,
    black: hard('#17181b', 0.4, 0.5, 0.4),
    finEdge: vary(F.polishedAlu, { rough: 0.2 }),
    headF: hard('#1a1b1f', 0.45, 0.45, 0.5),
    coverF: vary(F.brushedAlu, { rough: 0.26 }),
    bright: F.chrome,
    frontF: vary(F.brushedAlu, { rough: 0.3 }),
  });
}

function exhaust(ctx: KitContext, ports: EnginePort[]): void {
  const r = 0.0245;
  for (const p of ports) {
    const s = p.pos[0] < 0 ? -1 : 1;
    const ax = Math.abs(p.pos[0]);
    const path = pipe(ctx, [[p.pos[0], p.pos[1], p.pos[2]], [s * (ax + 0.012), p.pos[1] - 0.04, p.pos[2] - 0.05], [s * (ax - 0.01), 0.205, p.pos[2] - 0.1], [s * 0.285, 0.165, p.pos[2] - 0.06], [s * 0.245, 0.15, p.pos[2] + 0.1], [s * 0.232, 0.155, -0.7], [s * 0.226, 0.165, -0.5]], r, F.chrome);
    clampRing(ctx, path, Math.floor(path.length * 0.8), r);
    // Chrome fishtail silencer: round inlet flaring into a wide, flat, slightly upswept mouth.
    can(ctx, [s * 0.226, 0.165, -0.5], [s * 0.236, 0.232, 0.3], { r: 0.052, kind: 'fishtail', flat: [2.5, 0.5], f: F.chrome, bands: 1, bandF: F.chrome });
  }
  ctx.anchor('exhaustOutlet', [0.236, 0.232, 0.3]);
  // Balance pipe tucked under the gearbox.
  tubeAlong(ctx, 'chassis', [[0.2, 0.19, -0.62], [0.0, 0.14, -0.64], [-0.2, 0.19, -0.62]], 0.017, F.chrome);
}

/** Single solo seat on the frame loop, as on the real bike (pillion pad optional). */
function seatBody(ctx: KitContext): void {
  const ob: OutlineBody = {
    zs: stationsBetween(-0.76, -0.22, 14, 0.4),
    top: curve([[-0.76, 0.725], [-0.7, 0.71], [-0.6, 0.695], [-0.48, 0.688], [-0.38, 0.7], [-0.3, 0.72], [-0.24, 0.715], [-0.22, 0.7]]),
    bottom: curve([[-0.76, 0.68], [-0.6, 0.61], [-0.4, 0.59], [-0.25, 0.63], [-0.22, 0.66]]),
    half: curve([[-0.76, 0.06], [-0.7, 0.11], [-0.58, 0.16], [-0.44, 0.17], [-0.3, 0.15], [-0.22, 0.11]]),
    sections: [{ z: -0.76, pts: SECTIONS.seat }],
  };
  ctx.add('chassis', outlineLoft(ob, { ...bodyQ(ctx, 1.2), capFront: true }), seatFinish(ctx));
  ctx.add('chassis', capMeshOf(ob, -0.22, true), seatFinish(ctx));
  const seam: P3[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    seam.push([(t - 0.5) * 0.3, 0.7 + 0.01 * Math.pow(Math.abs(t - 0.5) * 2, 2), -0.4]);
  }
  bead(ctx, 'chassis', seam, 0.0015, F.rubber);
}

function body(ctx: KitContext): void {
  const hp = ctx.hp;
  const chrome = F.chrome;
  const ports = engine(ctx);
  exhaust(ctx, ports);

  // ── Classic teardrop tank, filler cap on top ──
  cruiserTank(ctx, {
    front: -1.19,
    back: -0.72,
    top: 0.99,
    bottomFront: 0.86,
    bottomBack: 0.82,
    width: 0.42,
    style: 'teardrop',
    knee: 0,
    topLine: [[-1.19, 0.935], [-1.13, 0.97], [-1.02, 0.992], [-0.9, 0.985], [-0.8, 0.955], [-0.74, 0.92], [-0.72, 0.9]],
    bottomLine: [[-1.19, 0.86], [-1.0, 0.82], [-0.82, 0.8], [-0.72, 0.82]],
    halfLine: [[-1.19, 0.085], [-1.13, 0.15], [-1.02, 0.2], [-0.9, 0.208], [-0.8, 0.18], [-0.74, 0.13], [-0.72, 0.1]],
    cap: { x: 0, z: -0.93, r: 0.035, f: vary(F.brushedAlu, { rough: 0.2 }) },
  });
  seatBody(ctx);

  // ── Full, valanced fenders with a chrome light at the back ──
  const rr = hp.Rr + 0.034;
  fenderArc(ctx, { group: 'chassis', cz: 0, cy: hp.Rr, r: rr, a0: -1.0, a1: 1.5, half: 0.112, drop: 0.075, power: 2.3, f: PAINT, taper: [1, 0.92] });
  roundTailLamp(ctx, [0, hp.Rr + Math.cos(1.46) * (rr + 0.012), Math.sin(1.46) * (rr + 0.012)], 0.034, -0.1, 'chassis', chrome);
  plateHanger(ctx, { fromZ: 0.2, fromY: 0.3 });
  for (const s of [-1, 1]) indicatorPod(ctx, 'chassis', [s * 0.12, 0.4, 0.3], [s * 0.19, 0.41, 0.33], 0.015);
  // The hardtail-look rear frame loops stay visible (the generic subframe tubes plus a chrome fender hoop).
  for (const s of [-1, 1]) tubeAlong(ctx, 'chassis', [[s * 0.1, 0.56, -0.5], [s * 0.115, 0.62, -0.3], [s * 0.12, 0.62, -0.1], [s * 0.115, 0.58, 0.1]], 0.013, hard('#17181b', 0.35, 0.4, 0.8));
  fenderArc(ctx, { group: 'forkLower', cz: hp.frontAxle[2], cy: hp.frontAxle[1], r: hp.Rf + 0.03, a0: -1.25, a1: 1.3, half: 0.088, drop: 0.07, power: 2.3, f: PAINT });

  // ── Round LED headlamp in a chrome shell ──
  const hl: P3 = [0, hp.head[1] - 0.115, hp.head[2] - 0.215];
  roundHeadlight(ctx, 'steer', hl, 0.092, [0, 0, -1], { led: true, chrome: true });
  for (const s of [-1, 1]) {
    ctx.add('steer', roundBox(0.014, 0.034, 0.06, 0.005), chrome, T(s * 0.105, hl[1], hl[2] + 0.082));
    indicatorPod(ctx, 'steer', [s * 0.12, hl[1] - 0.07, hl[2] + 0.07], [s * 0.2, hl[1] - 0.08, hl[2] + 0.04], 0.017);
  }

  // ── Shaft drive on the right: swingarm tube, final-drive housing, cardan boot ──
  const pv = hp.pivot;
  ctx.add('swingarm', rod([0.14, pv[1] - 0.005, pv[2] + 0.04], [0.14, hp.Rr - 0.0, -0.05], 0.034, 0.03, ctx.seg(20, 8)), hard('#17181b', 0.35, 0.4, 0.8));
  ctx.add('swingarm', lathe([[0, -0.05], [0.07, -0.048], [0.082, -0.03], [0.085, 0.03], [0.07, 0.05], [0, 0.05]], { segs: ctx.seg(40, 14), axis: 'x', sharp: [1, 4] }), hard('#1a1b1f', 0.45, 0.45, 0.6), T(0.147, hp.Rr, 0));
  ctx.add('swingarm', lathe([[0, 0], [0.044, 0], [0.046, 0.006], [0.04, 0.012], [0, 0.013]], { segs: ctx.seg(32, 10), axis: 'x', sharp: [1, 3] }), vary(F.brushedAlu, { rough: 0.25 }), T(0.197, hp.Rr, 0));
  ctx.add('swingarm', lathe([[0.032, 0], [0.038, 0.01], [0.032, 0.02], [0.038, 0.03], [0.032, 0.04], [0.038, 0.05], [0.032, 0.06], [0.038, 0.07], [0.032, 0.08]], { segs: ctx.seg(20, 8), axis: 'y' }), F.rubber, mul(T(0.14, pv[1] - 0.02, pv[2] + 0.08), RX(-1.45)));

  // ── Foot controls ──
  floorBoards(ctx, [0.335, 0.215, -0.7], { f: hard('#26282b', 0.7, 0.35, 0.6), len: 0.28, wid: 0.12 });
  sideStand(ctx);
}

// ───────────────────────────── livery ─────────────────────────────

/** BMW roundel painted as four quadrants inside a black ring. */
function roundel(p: Pen, cz: number, cy: number, r: number): void {
  const ring = (rr: number, a0: number, a1: number): P2[] => {
    const out: P2[] = [[cz, cy]];
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      out.push([cz + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
    return out;
  };
  p.poly(ring(r, 0, Math.PI * 2), '#0c0d0f', 'chrome');
  p.poly(ring(r * 0.86, 0, Math.PI * 2), '#f2f4f6', 'chrome');
  p.poly(ring(r * 0.86, 0, Math.PI / 2), '#1c69d4', 'gloss');
  p.poly(ring(r * 0.86, Math.PI, Math.PI * 1.5), '#1c69d4', 'gloss');
}

function livery(c: LiveryCanvas, lv: Livery): void {
  c.views(ALL_VIEWS, (p) => {
    p.fill(lv.primary, 'metallic');
    const white = '#eef0f2';
    if (p.view === 'right' || p.view === 'left') {
      // Hand-painted coach lines: lower tank edge, and along the fenders.
      p.line([[-1.17, 0.865], [-1.05, 0.83], [-0.88, 0.815], [-0.74, 0.835]], white, 0.004, 'gloss');
      p.line([[-1.15, 0.935], [-1.05, 0.975], [-0.92, 0.98], [-0.8, 0.945]], white, 0.0028, 'gloss');
      roundel(p, -0.96, 0.9, 0.034);
      // Rear fender line following the arc
      const arc: P2[] = [];
      for (let i = 0; i <= 14; i++) {
        const a = -0.95 + (2.4 * i) / 14;
        arc.push([Math.sin(a) * 0.346, 0.3202 + Math.cos(a) * 0.346 - 0.04]);
      }
      p.line(arc, white, 0.0035, 'gloss');
    }
    if (p.view === 'top') {
      // Centre coach lines on the tank and both fenders.
      p.line([[-1.17, 0.012], [-0.74, 0.012]], white, 0.0028, 'gloss');
      p.line([[-1.17, -0.012], [-0.74, -0.012]], white, 0.0028, 'gloss');
      p.line([[-1.62, 0.0], [-1.34, 0.0]], white, 0.0035, 'gloss');
      p.line([[-0.25, 0.0], [0.34, 0.0]], white, 0.0035, 'gloss');
    }
  });
}

export function r18Blueprint(spec: BikeSpec): BikeBlueprint {
  const black = '#17181b';
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.44, 0.96, 1.18],
    wheelbase: 1.731,
    rakeDeg: 32.7,
    trail: 0.118,
    forkLength: 0.84,
    front: { tyre: '120/70R19', rimWidthIn: 3.0, crown: 1.1, tread: 'cruiser', tyreLabel: 'Touring Radial' },
    rear: { tyre: '180/65B16', rimWidthIn: 4.5, crown: 1.2, tread: 'cruiser', tyreLabel: 'Touring Radial' },
    frontWheel: { type: 'wire', spokes: 36, shape: 'straight', color: black, rimColor: '#1d1e22' },
    rearWheel: { type: 'wire', spokes: 36, shape: 'straight', color: black, rimColor: '#1d1e22' },
    fork: { type: 'rwu', stanchion: 0.049, spacing: 0.25, outerColor: black, innerColor: '#eef0f3', footColor: black, capColor: '#c9ccd0', aboveClamp: 0.0, clampGap: 0.21 },
    frontBrake: { discs: 2, discDia: 0.3, disc: 'floating', carrierColor: '#1d1e22', caliper: 'axial2', caliperColor: black, caliperAngleDeg: 78 },
    rearBrake: { discs: 1, discDia: 0.3, disc: 'floating', carrierColor: '#1d1e22', caliper: 'axial2', caliperColor: black, caliperAngleDeg: 205 },
    frame: { type: 'cradle', color: black, metal: 0.3, rough: 0.4, subframe: 'tubular', subframeColor: black, width: 0.34 },
    swingarm: { type: 'tubular', length: 0.66, angleDeg: 5, color: black, metal: 0.3, rough: 0.4 },
    shock: { layout: 'none', springColor: black, bodyColor: black, reservoir: false },
    drive: { type: 'shaft', side: 'right', frontTeeth: 0, rearTeeth: 0, sprocketColor: '#c9ccd2' },
    engine: {
      layout: 'BOXER',
      cc: 1802,
      crank: [0, Y, -0.95],
      tiltDeg: 0,
      caseColor: '#17181b',
      coverColor: '#c3c7cc',
      headColor: '#1a1b1f',
      camCoverColor: '#c3c7cc',
      finned: true,
      liquidCooled: false,
      width: 0.3,
    },
    exhaust: { route: 'none', side: 'both', can: 'fishtail', canLength: 0.8, canDia: 0.1, canFinish: 'chrome', headerFinish: 'chrome' },
    cockpit: {
      bars: 'tall',
      grip: [0.4, 1.075, -0.98],
      barDia: 0.0254,
      dash: 'analog',
      dashPos: [0, 1.04, -1.255],
      dashSize: [0.1, 0.1],
      dashTiltDeg: 30,
      dashMount: 'bars',
      mirrors: 'bar',
      mirrorPos: [0.37, 1.24, -0.98],
      mirrorSize: [0.1, 0.1],
      mirrorIndicators: false,
      mirrorShape: 'round',
      mirrorColor: '#dfe2e6',
      topClamp: 'cast',
      steeringDamper: 'none',
      leverColor: '#c9ccd0',
      reservoirs: true,
      clutch: 'hydraulic',
      ignition: 'tank',
      switchColor: '#141518',
      gripColor: '#141414',
      barEndColor: '#c9ccd0',
    },
    lights: { head: 'round', tail: 'round', rearIndicators: 'stalk' },
    seat: { height: 0.69, front: -0.76, back: -0.22, pillion: 'none', color: '#15130f' },
    rider: { hip: [0, 0.775, -0.45], peg: [0.335, 0.215, -0.7], torsoPitch: -0.05 },
    footrests: 'scooter',
    plate: { mount: 'fender', pos: [0, 0.38, 0.4], tiltDeg: -10 },
    body,
    livery,
    groundClearance: 0.12,
    features: ['skip:engine'],
    zones: { splitY: 0.3, decal: [-0.96, 0.9] },
  };
}
