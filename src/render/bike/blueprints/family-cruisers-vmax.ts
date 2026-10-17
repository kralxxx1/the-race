import type { BikeSpec, Livery } from '../../../data/bikes';
import { RX, T, mul, type KitContext } from '../context';
import { bodyQ, PAINT, seatFinish } from '../kit/body';
import { can, clampRing, pipe } from '../kit/cruisers-exhaust';
import { ledStrip, roundHeadlight } from '../kit/lights';
import { plateHanger } from '../kit/rear';
import { curve, outlineLoft, SECTIONS, stationsBetween, surfaceAt, type OutlineBody } from '../kit/shape';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv, type Pen } from '../livery';
import { lathe, rod, roundBox, type P2, type P3 } from '../mesh';
import { F, hard, vary } from '../sink';
import type { BikeBlueprint } from '../types';
import { footPegs, sideStand } from './family-cruisers-controls';
import { bead, capMeshOf, fenderArc, loft, sidePlate, tubeAlong } from './family-cruisers-parts';

/**
 * Yamaha VMAX (2017, 1679 cc 65° V4).
 * Spec sheet: wheelbase 1700 mm, rake 31°, trail 113 mm, seat 775 mm, 120/70R18 front + 200/50R18 rear on
 * cast five-spoke wheels, 52 mm USD fork, twin 320 mm discs, aluminium diamond frame, shaft drive,
 * four-pipe stacked exhaust (two chrome megaphones per side), big chrome ram-air scoops, airbox cover
 * in place of a tank.
 * Design cues: V-shaped airbox cover with the ridge, forward-facing chrome intake scoops either side
 * of the nose, compact nose cowl with twin lamps, long low seat rising into a duck-tail.
 */

/** Exhaust port positions of the generic V4 (mirrors kit/engine.ts buildVee for the 'V4A' layout). */
function v4Ports(ctx: KitContext): { pos: P3; front: boolean }[] {
  const e = ctx.bp.engine;
  const k = Math.cbrt(e.cc / 1000);
  const c = e.crank;
  const bore = 0.081 * k;
  const len = 0.2 * k;
  const phiF = (e.tiltDeg * Math.PI) / 180;
  const phiR = phiF + (65 * Math.PI) / 180;
  const out: { pos: P3; front: boolean }[] = [];
  const banks: [number, number, boolean][] = [[phiF, -0.02, true], [phiR, 0.02, false]];
  for (const [phi, shift, front] of banks) {
    const d: P3 = [0, Math.sin(phi), -Math.cos(phi)];
    for (let j = 0; j < 2; j++) {
      const x = (j - 0.5) * (bore + 0.022) + shift;
      const bz = c[2] + d[2] * 0.08 * k, by = c[1] + d[1] * 0.08 * k;
      const top: P3 = [x, by + d[1] * len, bz + d[2] * len];
      const r = bore / 2 + 0.012;
      const pd: P3 = front ? [0, -Math.cos(phi), -Math.sin(phi)] : [0, Math.cos(phi), Math.sin(phi)];
      const s = front ? 1 : pd[2] < 0 ? -1 : 1;
      out.push({ pos: [top[0], top[1] + pd[1] * s * (r + 0.01), top[2] + pd[2] * s * (r + 0.01)], front });
    }
  }
  return out;
}

function exhaust(ctx: KitContext): void {
  const ports = v4Ports(ctx);
  const r = 0.0185;
  const chrome = F.chrome;
  for (const s of [-1, 1]) {
    const mine = ports.filter((p) => Math.sign(p.pos[0]) === s || Math.abs(p.pos[0]) < 0.001);
    const front = mine.filter((p) => p.front).sort((a, b) => Math.abs(b.pos[0]) - Math.abs(a.pos[0]))[0] ?? ports.find((p) => p.front)!;
    const rear = mine.filter((p) => !p.front).sort((a, b) => Math.abs(b.pos[0]) - Math.abs(a.pos[0]))[0] ?? ports.find((p) => !p.front)!;
    const f = front.pos, b = rear.pos;
    // Front-bank header: down the front of the engine, then low along the side (lower silencer).
    const lower = pipe(ctx, [f, [f[0] + s * 0.006, f[1] - 0.05, f[2] - 0.04], [s * 0.1, 0.4, f[2] - 0.1], [s * 0.19, 0.26, f[2] - 0.08], [s * 0.226, 0.2, -0.95], [s * 0.236, 0.188, -0.75], [s * 0.24, 0.188, -0.55]], r, chrome);
    // Rear-bank header: drops behind the rear heads and runs back above the first (upper silencer).
    const upper = pipe(ctx, [b, [b[0] + s * 0.006, b[1] - 0.05, b[2] + 0.03], [s * 0.12, 0.47, b[2] + 0.04], [s * 0.2, 0.37, b[2] + 0.06], [s * 0.245, 0.31, -0.5], [s * 0.255, 0.3, -0.4]], r, chrome);
    clampRing(ctx, lower, Math.floor(lower.length * 0.6), r);
    clampRing(ctx, upper, Math.floor(upper.length * 0.6), r);
    // Two stacked chrome megaphones per side, angled up.
    can(ctx, [s * 0.24, 0.188, -0.55], [s * 0.262, 0.245, 0.3], { r: 0.043, rEnd: 0.06, kind: 'megaphone', f: chrome, bands: 1, bandF: chrome });
    can(ctx, [s * 0.255, 0.3, -0.4], [s * 0.275, 0.372, 0.3], { r: 0.043, rEnd: 0.06, kind: 'megaphone', f: chrome, bands: 1, bandF: chrome });
  }
  ctx.anchor('exhaustOutlet', [0.275, 0.372, 0.3]);
}

/** Big forward-facing chrome ram-air scoop with a slatted mouth, one per side. */
function scoops(ctx: KitContext): void {
  for (const s of [-1, 1]) {
    const ob: OutlineBody = {
      zs: stationsBetween(-1.33, -0.95, 10, 0.4),
      top: curve([[-1.33, 0.81], [-1.22, 0.825], [-1.08, 0.82], [-0.95, 0.79]]),
      bottom: curve([[-1.33, 0.645], [-1.22, 0.64], [-1.08, 0.655], [-0.95, 0.69]]),
      half: curve([[-1.33, 0.048], [-1.22, 0.06], [-1.08, 0.055], [-0.95, 0.03]]),
      sections: [{ z: -1.33, pts: [[0, 1], [0.7, 0.99], [0.96, 0.92], [1, 0.6], [0.98, 0.15], [0.85, 0.01], [0, 0]] }],
      xOff: () => s * 0.205,
    };
    loft(ctx, ob, F.chrome, { q: 1.1, capBack: true, depth: 0.008 });
    // Dark mouth with horizontal slats
    const x = s * 0.205;
    ctx.add('chassis', roundBox(0.074, 0.15, 0.006, 0.012, 2), F.black, T(x, 0.7275, -1.325));
    for (let i = 0; i < 5; i++) ctx.add('chassis', roundBox(0.07, 0.005, 0.012, 0.002, 1), F.chrome, T(x, 0.667 + i * 0.031, -1.33));
  }
}

function airboxCover(ctx: KitContext): void {
  const ob: OutlineBody = {
    zs: stationsBetween(-1.2, -0.7, 14, 0.4),
    top: curve([[-1.2, 0.87], [-1.14, 0.915], [-1.04, 0.948], [-0.92, 0.955], [-0.8, 0.94], [-0.7, 0.905]]),
    bottom: curve([[-1.2, 0.74], [-1.0, 0.72], [-0.82, 0.72], [-0.7, 0.78]]),
    half: curve([[-1.2, 0.1], [-1.12, 0.15], [-1.0, 0.185], [-0.88, 0.19], [-0.78, 0.165], [-0.7, 0.12]]),
    sections: [{ z: -1.2, pts: SECTIONS.crisp }],
  };
  loft(ctx, ob, PAINT, { q: 1.3, creases: [2], depth: 0.012 });
  // Chrome V-ridge: two raised beads converging at the front, a trim plate at the rear.
  for (const s of [-1, 1]) {
    const pts: P3[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const z = -1.16 + t * 0.4;
      const x = s * (0.012 + t * 0.12);
      const sp = surfaceAt(ob, z, x);
      pts.push([x, sp.p[1] + 0.003, z]);
    }
    bead(ctx, 'chassis', pts, 0.0032, F.chrome);
  }
  ctx.add('chassis', roundBox(0.14, 0.004, 0.03, 0.002, 1), F.chrome, mul(T(0, 0.955, -0.78), RX(0.1)));
}

function noseCowl(ctx: KitContext): void {
  const hp = ctx.hp;
  const ob: OutlineBody = {
    zs: stationsBetween(-1.47, -1.3, 8, 0.45),
    top: curve([[-1.47, hp.head[1] - 0.06], [-1.4, hp.head[1] - 0.02], [-1.3, hp.head[1] - 0.0]]),
    bottom: curve([[-1.47, hp.head[1] - 0.215], [-1.4, hp.head[1] - 0.235], [-1.3, hp.head[1] - 0.23]]),
    half: curve([[-1.47, 0.085], [-1.4, 0.14], [-1.3, 0.15]]),
    sections: [{ z: -1.47, pts: SECTIONS.nose }],
  };
  loft(ctx, ob, PAINT, { q: 1.1, capFront: true, steer: true, depth: 0.006 });
  // Twin projector eyes and a small central brow/V.
  for (const s of [-1, 1]) roundHeadlight(ctx, 'steer', [s * 0.058, hp.head[1] - 0.14, hp.head[2] - 0.18], 0.042, [0, -0.02, -1], { led: true, chrome: true });
  ctx.add('steer', roundBox(0.03, 0.12, 0.05, 0.01, 2), F.chrome, T(0, hp.head[1] - 0.14, hp.head[2] - 0.165));
}

function tailBody(ctx: KitContext): void {
  const q = bodyQ(ctx, 1.2);
  const rider: OutlineBody = {
    zs: stationsBetween(-0.82, -0.4, 10, 0.4),
    top: curve([[-0.82, 0.8], [-0.7, 0.785], [-0.58, 0.78], [-0.46, 0.79], [-0.4, 0.8]]),
    bottom: curve([[-0.82, 0.74], [-0.6, 0.7], [-0.4, 0.74]]),
    half: curve([[-0.82, 0.05], [-0.74, 0.1], [-0.6, 0.145], [-0.4, 0.14]]),
    sections: [{ z: -0.82, pts: SECTIONS.seat }],
  };
  ctx.add('chassis', outlineLoft(rider, { ...q, capFront: true }), seatFinish(ctx));
  ctx.add('chassis', capMeshOf(rider, -0.4, true), seatFinish(ctx));
  const pillion: OutlineBody = {
    zs: stationsBetween(-0.4, 0.0, 10, 0.4),
    top: curve([[-0.4, 0.8], [-0.3, 0.835], [-0.18, 0.875], [-0.06, 0.885], [0.0, 0.875]]),
    bottom: curve([[-0.4, 0.74], [-0.2, 0.78], [0.0, 0.81]]),
    half: curve([[-0.4, 0.13], [-0.25, 0.125], [-0.1, 0.105], [0.0, 0.08]]),
    sections: [{ z: -0.4, pts: SECTIONS.seat }],
  };
  ctx.add('chassis', outlineLoft(pillion, { ...q, capFront: true }), seatFinish(ctx));
  ctx.add('chassis', capMeshOf(pillion, 0.0, true), seatFinish(ctx));
  // Duck-tail cowl: rises at the back, pointed end with the LED lamp.
  const tail: OutlineBody = {
    zs: stationsBetween(-0.42, 0.14, 12, 0.5),
    top: curve([[-0.42, 0.775], [-0.3, 0.8], [-0.16, 0.845], [-0.02, 0.865], [0.08, 0.85], [0.14, 0.825]]),
    bottom: curve([[-0.42, 0.7], [-0.2, 0.7], [0.0, 0.74], [0.14, 0.77]]),
    half: curve([[-0.42, 0.14], [-0.2, 0.15], [0.0, 0.125], [0.14, 0.07]]),
    sections: [{ z: -0.42, pts: SECTIONS.closed }],
  };
  loft(ctx, tail, PAINT, { q: 1.1, capBack: true });
  ledStrip(ctx, 'chassis', [[-0.07, 0.808, 0.146], [0.0, 0.814, 0.15], [0.07, 0.808, 0.146]], 0.018, 0.006, 'tail');
}

function body(ctx: KitContext): void {
  const hp = ctx.hp;
  exhaust(ctx);
  scoops(ctx);
  airboxCover(ctx);
  noseCowl(ctx);
  tailBody(ctx);

  // ── Fenders: short front, wide rear hugger over the 200 tyre ──
  fenderArc(ctx, { group: 'forkLower', cz: hp.frontAxle[2], cy: hp.frontAxle[1], r: hp.Rf + 0.026, a0: -0.7, a1: 1.0, half: 0.072, drop: 0.03, power: 2.4, f: F.glossBlack });
  fenderArc(ctx, { group: 'chassis', cz: 0, cy: hp.Rr, r: hp.Rr + 0.03, a0: 0.0, a1: 1.1, half: 0.11, drop: 0.03, power: 2.4, f: F.glossBlack, taper: [1, 0.9] });
  plateHanger(ctx, { fromZ: 0.06, fromY: 0.76 });

  // ── Shaft drive on the right ──
  const pv = hp.pivot;
  ctx.add('swingarm', rod([0.16, pv[1] - 0.01, pv[2] + 0.05], [0.16, hp.Rr, -0.05], 0.042, 0.038, ctx.seg(20, 8)), hard('#2a2c30', 0.6, 0.4, 0.6));
  ctx.add('swingarm', lathe([[0, -0.055], [0.075, -0.053], [0.09, -0.035], [0.092, 0.035], [0.075, 0.055], [0, 0.055]], { segs: ctx.seg(40, 14), axis: 'x', sharp: [1, 4] }), hard('#2a2c30', 0.6, 0.4, 0.6), T(0.165, hp.Rr, 0));
  ctx.add('swingarm', lathe([[0, 0], [0.046, 0], [0.05, 0.006], [0.042, 0.012], [0, 0.013]], { segs: ctx.seg(32, 10), axis: 'x', sharp: [1, 3] }), vary(F.brushedAlu, { rough: 0.28 }), T(0.218, hp.Rr, 0));

  // ── Frame-mounted side covers over the under-seat fuel tank ──
  sidePlate(ctx, [[-0.74, 0.79], [-0.44, 0.79], [-0.3, 0.75], [-0.28, 0.64], [-0.4, 0.57], [-0.62, 0.56], [-0.74, 0.62]], 0.158, 0.03, PAINT);

  // ── Foot controls, stand, frame bracing ──
  footPegs(ctx, { at: ctx.bp.rider.peg, f: hard('#2a2c30', 0.7, 0.35, 0.6), pivot: pv });
  sideStand(ctx);
  tubeAlong(ctx, 'chassis', [[0.1, 0.75, -0.72], [0.12, 0.78, -0.55], [0.1, 0.78, -0.4]], 0.012, hard('#2a2c30', 0.5, 0.4, 0.8));
}

// ───────────────────────────── livery ─────────────────────────────

function livery(c: LiveryCanvas, lv: Livery, _env: LiveryEnv): void {
  c.views(ALL_VIEWS, (p: Pen) => {
    p.fill(lv.primary, 'matte');
    if (p.view === 'right' || p.view === 'left') {
      // Satin silver flank panels on the airbox cover and the cowl edge.
      const flank: P2[] = [[-1.18, 0.78], [-1.0, 0.765], [-0.84, 0.77], [-0.72, 0.8], [-0.76, 0.86], [-0.9, 0.84], [-1.06, 0.84], [-1.16, 0.86]];
      p.poly(flank, '#9aa0a8', 'satin');
      p.text('VMAX', -0.93, 0.92, { color: '#d6d8dc', size: 0.034, weight: '900', spacing: 0.16, finish: 'chrome' });
    }
    if (p.view === 'top') p.text('VMAX', -0.92, 0.0, { color: '#d6d8dc', size: 0.036, weight: '900', spacing: 0.16, rotate: 90, finish: 'chrome' });
  });
}

export function vmaxBlueprint(spec: BikeSpec): BikeBlueprint {
  const black = '#18191c';
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.5, 0.78, 1.18],
    wheelbase: 1.7,
    rakeDeg: 31,
    trail: 0.113,
    forkLength: 0.76,
    front: { tyre: '120/70R18', rimWidthIn: 3.5, crown: 1.0, tread: 'sport', tyreLabel: 'Sport Radial' },
    rear: { tyre: '200/50R18', rimWidthIn: 6.0, crown: 1.1, tread: 'sport', tyreLabel: 'Sport Radial' },
    frontWheel: { type: 'cast', spokes: 5, shape: 'split', color: '#1b1c20', machinedLip: true },
    rearWheel: { type: 'cast', spokes: 5, shape: 'split', color: '#1b1c20', machinedLip: true },
    fork: { type: 'usd', stanchion: 0.052, spacing: 0.25, outerColor: black, innerColor: '#c4c8ce', footColor: black, capColor: '#2a2c30', adjusterColor: '#8d9097', aboveClamp: 0.012, clampGap: 0.2 },
    frontBrake: { discs: 2, discDia: 0.32, disc: 'floating', carrierColor: '#2a2c30', caliper: 'radial4', caliperColor: '#b3b6bc', caliperAngleDeg: 70 },
    rearBrake: { discs: 1, discDia: 0.298, disc: 'fixed', carrierColor: '#2a2c30', caliper: 'axial2', caliperColor: '#b3b6bc', caliperAngleDeg: 205 },
    frame: { type: 'twinSpar', color: '#2b2d31', metal: 0.7, rough: 0.4, subframe: 'cast', subframeColor: '#1d1e21', width: 0.36 },
    swingarm: { type: 'box', length: 0.7, angleDeg: 5, side: 'right', color: '#2a2c30', metal: 0.65, rough: 0.4 },
    shock: { layout: 'monoSide', springColor: '#3a3d42', bodyColor: '#2a2c30', reservoir: false },
    drive: { type: 'shaft', side: 'right', frontTeeth: 0, rearTeeth: 0, sprocketColor: '#c9ccd2' },
    engine: {
      layout: 'V4A',
      cc: 1679,
      crank: [0, 0.345, -0.85],
      tiltDeg: 57.5,
      caseColor: '#18191c',
      coverColor: '#5d6168',
      headColor: '#1a1b1f',
      camCoverColor: '#6f747b',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.34, h: 0.3, z: -1.2, y: 0.5, tiltDeg: 8 },
      filterColor: '#18191c',
      width: 0.34,
    },
    exhaust: { route: 'none', side: 'both', can: 'megaphone', canLength: 0.8, canDia: 0.1, canFinish: 'chrome', headerFinish: 'chrome' },
    cockpit: {
      bars: 'tall',
      grip: [0.42, 1.04, -1.02],
      barDia: 0.0254,
      dash: 'analogTwin',
      dashPos: [0, 0.968, -1.0],
      dashSize: [0.15, 0.075],
      dashTiltDeg: 22,
      dashMount: 'fairing',
      mirrors: 'bar',
      mirrorPos: [0.4, 1.2, -1.02],
      mirrorSize: [0.12, 0.08],
      mirrorIndicators: false,
      mirrorShape: 'oval',
      mirrorColor: '#141518',
      topClamp: 'cast',
      steeringDamper: 'none',
      leverColor: '#2a2c30',
      reservoirs: true,
      clutch: 'hydraulic',
      ignition: 'tank',
      switchColor: '#141518',
      gripColor: '#131313',
      barEndColor: '#2a2c30',
    },
    lights: { head: 'custom', tail: 'strip', rearIndicators: 'stalk' },
    seat: { height: 0.775, front: -0.82, back: 0.04, pillion: 'seat', color: '#151515' },
    rider: { hip: [0, 0.855, -0.5], peg: [0.3, 0.33, -0.76], torsoPitch: 0.12 },
    footrests: 'scooter',
    plate: { mount: 'hanger', pos: [0, 0.66, 0.2], tiltDeg: -22 },
    body,
    livery,
    groundClearance: 0.13,
    features: [],
    zones: { splitY: 0.36, decal: [-0.93, 0.92] },
  };
}
