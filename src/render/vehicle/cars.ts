import * as THREE from 'three';
import { rod, splitTriangles, superLoft, type LoftStation } from '../geom';
import type { Build } from './build';
import { LAMP, Loft, chamferBox, cutArches, curve, loftPatch, mat, ribbon, topPatch, type ArchHole } from './kit';
import {
  BLACK,
  CHROME,
  GLOSS_BLACK,
  TRIM,
  dashboard,
  frame,
  gap,
  headLamp,
  inFrame,
  mirror,
  occupant,
  plate,
  roundLamp,
  seatBlock,
  steeringWheel,
  tailLamp,
  tailpipe,
  wheelHouse,
} from './parts';

/**
 * Passenger-car family (sedan, hatchback, crossover, pickup and their taxi / police variants).
 * A car is a lofted lower body (rocker to hood / deck), a glazed greenhouse loft with painted roof
 * and pillars, and details placed on those analytic surfaces. All numbers are metres, `d` values are
 * distances from the nose.
 */

export interface CarSpec {
  /** Distance from the nose to the front axle and the wheelbase. */
  axleF: number;
  wheelbase: number;
  R: number;
  tw: number;
  /** Lower body profile: [distance from nose, y]. */
  yb: [number, number][];
  yt: [number, number][];
  /** Plan-view width fraction from the nose / from the tail (distance from that end). */
  planF: [number, number][];
  planR: [number, number][];
  /** Cross-section exponent of the lower body along d. */
  n: [number, number][];
  belt: number;
  roof: number;
  /** Greenhouse stations: [distance from nose, top y, width fraction]. */
  gh: [number, number, number][];
  ghPinch: number;
  ghN: number;
  /** Cabin extents (distance from the nose): windshield base, roof front, roof rear, rear glass base. */
  cowl: number;
  roofF: number;
  roofR: number;
  rearBase: number;
  bPillar: number;
  hatch: boolean;
  /** Roof half angle for the painted panel. */
  roofHalf: number;
  /** Seat positions (distance from nose) of the front seats. */
  seatF: number;
  seatR: number;
  /** Lamp heights. */
  headY: number;
  tailY: number;
  plateRearY: number;
  plateFrontY: number;
  /** Height of the grille centre. */
  grilleY: number;
  /** Height of one tail-lamp cluster (tall on hatchbacks / crossovers). */
  tailTall?: number;
  /** Pickup: distance from the nose where the load bed starts (the cab ends there). */
  bed?: number;
}

/** Everything a variant (taxi, police, pickup bed) needs to dress the shared car body. */
export interface CarCtx {
  b: Build;
  s: CarSpec;
  body: Loft;
  cabin: Loft;
  /** World z at distance d from the nose. */
  Z: (d: number) => number;
  /** Point on the +x flank of a loft at height y, pushed out by `lift`. */
  flank: (loft: Loft, z: number, y: number, lift?: number) => THREE.Vector3;
  /** Lower-body bottom curve. */
  yb: (d: number) => number;
  yt: (d: number) => number;
  /** Wheel-arch centres (distance from the nose) and arch radius. */
  axles: number[];
  arch: number;
}

const ENDS = [0, 0.012, 0.03, 0.06, 0.1, 0.16, 0.24, 0.34, 0.48, 0.66];

function stationDs(L: number, lod: 0 | 1, axles: number[], R: number): number[] {
  if (lod === 1) return [0, 0.04, 0.16, 0.5, L * 0.3, L * 0.5, L * 0.7, L - 0.5, L - 0.16, L - 0.04, L];
  const set = new Set<number>(ENDS);
  for (const e of ENDS) set.add(L - e);
  for (let d = 0.9; d < L - 0.9; d += 0.34) set.add(Math.round(d * 1000) / 1000);
  // Extra rings around the axles so the arch ring hugs the tyre.
  for (const a of axles) for (const o of [-0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6]) set.add(Math.round((a + o * (R / 0.32)) * 1000) / 1000);
  const sorted = [...set].filter((d) => d >= 0 && d <= L).sort((p, q) => p - q);
  // Drop stations closer than 2 cm to the previously kept one, but never the last (the tail face).
  const kept: number[] = [];
  for (const d of sorted) {
    if (kept.length && d - kept[kept.length - 1] <= 0.02) {
      if (d === L) kept[kept.length - 1] = d;
      continue;
    }
    kept.push(d);
  }
  return kept;
}

export function buildCar(b: Build, s: CarSpec, extras?: (c: CarCtx) => void): void {
  const L = b.L;
  const W = b.W;
  const hl = b.hl;
  const lod = b.lod;
  const yb = curve(s.yb);
  const yt = curve(s.yt);
  const planF = curve(s.planF);
  const planR = curve(s.planR);
  const nC = curve(s.n);
  const Z = (d: number) => -hl + d;
  const axles = [s.axleF, s.axleF + s.wheelbase];

  // ── lower body ──
  const stations: LoftStation[] = stationDs(L, lod, axles, s.R).map((d) => ({
    z: Z(d),
    w: W * planF(d) * planR(L - d),
    yb: yb(d),
    yt: yt(d),
    n: nC(d),
    pinchTop: 0.97,
  }));
  const body = new Loft(stations);
  let lowerGeo = superLoft(stations, b.seg(36, 12), 1);
  const zA = Z(s.cowl);
  const zB = Z(s.rearBase);
  // Wheel arches: real openings cut into both flanks (full detail only).
  const arch = s.R + 0.075;
  const wells = axles.map((d) => {
    const xo = body.sideX(Z(d), s.R + 0.12) ?? W / 2;
    return { d, z: Z(d), xo, x0: xo - s.tw - 0.04 };
  });
  if (lod === 0) {
    const holes: ArchHole[] = [];
    for (const w of wells) for (const side of [1, -1] as const) holes.push({ z: w.z, y: s.R, r: arch, xMin: w.x0, side });
    lowerGeo = cutArches(lowerGeo, holes);
  }
  // Black cladding along the sills and bumper lower edges; the rest is painted.
  const zEnds = [Z(0), Z(L)];
  const [clad, upper] = splitTriangles(lowerGeo, (_x, _y, z, sec) => sec < -0.62 && Math.abs(z - zEnds[0]) > 1e-4 && Math.abs(z - zEnds[1]) > 1e-4);
  b.D(clad, TRIM, undefined, 0, 0.7);
  b.P(upper);

  // ── greenhouse (glass shell, painted roof + pillars) ──
  const ghStations: LoftStation[] = s.gh.map(([d, top, wf], i) => ({
    z: Z(d),
    w: W * wf,
    yb: s.belt - 0.36,
    yt: top,
    n: i === 0 || i === s.gh.length - 1 ? s.ghN + 0.6 : s.ghN,
    pinchTop: s.ghPinch,
    pinchBottom: 1,
  }));
  const cabin = new Loft(ghStations);
  b.G(superLoft(ghStations, b.seg(32, 12), lod === 0 ? 2 : 1));
  const zRf = Z(s.roofF);
  const zRr = Z(s.roofR);
  const mid = Math.PI / 2;
  const roofTh0 = mid - s.roofHalf;
  b.P(loftPatch(cabin, zRf - 0.02, zRr + 0.02, roofTh0, mid + s.roofHalf, b.seg(10, 3), b.seg(16, 4), 0.004));
  const belt = s.belt;
  // Point on the +x flank of a loft at height y, pushed out of the surface by `lift`.
  const flank = (loft: Loft, z: number, y: number, lift = 0.012): THREE.Vector3 => new THREE.Vector3((loft.sideX(z, y) ?? W * 0.4) + lift, y, z);
  const ctx: CarCtx = { b, s, body, cabin, Z, flank, yb, yt, axles, arch };
  const roofEdge = (z: number): THREE.Vector3 => {
    const p = cabin.point(z, roofTh0);
    return p.add(cabin.normal(z, roofTh0).multiplyScalar(0.012));
  };
  if (lod === 0) {
    b.sym(() => {
      // Pillars are bars from the belt line to the roof edge, standing a hair off the glass.
      const aBase = flank(cabin, zA + 0.06, belt + 0.02);
      b.P(rod(aBase, roofEdge(zRf), 0.034, 0.03, 7));
      const zb = Z(s.bPillar);
      b.D(rod(flank(cabin, zb, belt + 0.02), roofEdge(zb), 0.036, 0.034, 7), GLOSS_BLACK, undefined, 0.2, 0.35);
      const cBase = flank(cabin, zB - 0.05, belt + 0.02);
      b.P(rod(cBase, roofEdge(zRr), s.hatch ? 0.06 : 0.05, 0.042, 7));
      // Belt moulding along the base of the side glass, window frame chrome above it.
      const zs: number[] = [];
      for (let k = 0; k <= 12; k++) zs.push(zA + 0.12 + ((zB - 0.12 - (zA + 0.12)) * k) / 12);
      const beltPts = zs.map((z) => flank(cabin, z, belt + 0.035, 0.006));
      const beltNrm = zs.map(() => new THREE.Vector3(1, 0, 0));
      b.D(ribbon(beltPts, beltNrm, 0.045, 0), GLOSS_BLACK, undefined, 0.3, 0.3);
      // Door gaps on the flank.
      for (const dz of [s.cowl + 0.1, s.bPillar, s.rearBase - 0.2]) {
        const z = Z(dz);
        const ys = [belt - 0.02, belt - 0.2, yb(dz) + 0.3, yb(dz) + 0.18];
        gap(b, ys.map((y) => flank(body, z, y, 0.002)), ys.map(() => new THREE.Vector3(1, 0, 0)));
      }
      // Door handles.
      for (const dz of [s.bPillar - 0.35, s.bPillar + 0.5]) {
        const z = Z(dz);
        const x = body.sideX(z, belt - 0.12) ?? W / 2;
        b.D(chamferBox(0.14, 0.025, 0.02, 0.008), '#1b1c1e', mat(x + 0.008, belt - 0.12, z), 0.5, 0.4);
      }
    });
    // Rubber seal at the windscreen / rear-glass base and the cowl vent strip under the wipers.
    const wsPts: THREE.Vector3[] = [];
    const cvPts: THREE.Vector3[] = [];
    for (let k = 0; k <= 10; k++) {
      const x = -W * 0.38 + (W * 0.76 * k) / 10;
      wsPts.push(new THREE.Vector3(x, (body.topY(zA + 0.06, x) ?? belt) + 0.006, zA + 0.06));
      cvPts.push(new THREE.Vector3(x, (body.topY(zA - 0.04, x) ?? belt) + 0.008, zA - 0.04));
    }
    const up = wsPts.map(() => new THREE.Vector3(0, 1, 0));
    b.D(ribbon(wsPts, up, 0.05, 0), GLOSS_BLACK, undefined, 0.3, 0.3);
    b.D(ribbon(cvPts, up, 0.07, 0), '#101113', undefined, 0, 0.8);
  }

  // ── front end ──
  const nz = Z(0);
  frontFace(b, s, nz, W, yb);

  // ── rear end ──
  const rz = Z(L);
  rearFace(b, s, rz, W, yb(L));
  if (extras) extras(ctx);
  if (lod === 0) {
    // Third brake light and exhaust.
    const zr3 = Z(s.rearBase) - (s.hatch ? 0.14 : 0.12);
    const y3 = s.hatch ? s.roof - 0.12 : s.belt + 0.08;
    b.L2(chamferBox(0.5, 0.022, 0.015, 0.008), LAMP.tail, '#d01a10', mat(0, y3, zr3, -0.65));
    b.set.tailGlow.push(new THREE.Vector3(0, y3, zr3));
    b.sym(() => tailpipe(b, W * 0.3, yb(L - 0.05) + 0.06, rz - 0.04));
  }

  // ── wheels, arches, mirrors ──
  wells.forEach((w, i) => {
    const wx = w.xo - s.tw / 2 - 0.02;
    b.set.wheels.push({ x: wx, y: s.R, z: w.z, r: s.R, w: s.tw, steer: i === 0, type: 'car' });
    b.set.wheels.push({ x: -wx, y: s.R, z: w.z, r: s.R, w: s.tw, steer: i === 0, type: 'car' });
    if (lod === 0) b.sym(() => wheelHouse(b, body, w.z, s.R, arch, w.x0, yb(w.d) + 0.04));
  });
  b.sym(() => mirror(b, W * 0.5 + 0.06, s.belt + 0.1, zA + 0.2));

  // ── interior ──
  if (lod === 0) {
    const deckY = s.belt - 0.03;
    // Cabin floor seen through the glass: a dark plate just inside the glass footprint.
    b.D(topPatch(body, zA + 0.12, zB - 0.1, (z) => Math.max(0.3, (cabin.sideX(z, s.belt + 0.03) ?? 0.7) - 0.06), 4, 6, 0.004), '#1c1d20', undefined, 0, 0.85);
    dashboard(b, deckY + 0.05, Z(s.cowl + 0.3), W * 0.7);
    steeringWheel(b, -W * 0.2, deckY + 0.2, Z(s.cowl + 0.62));
    const sf = Z(s.seatF);
    for (const sx of [-1, 1]) {
      seatBlock(b, 0.46, 0.4, 0.12, sx * W * 0.2, deckY + 0.02, sf, -0.14);
      seatBlock(b, 0.19, 0.13, 0.09, sx * W * 0.2, deckY + 0.28, sf - 0.02, -0.1);
    }
    occupant(b, -W * 0.2, deckY + 0.3, sf - 0.1, '#2a303a');
    occupant(b, W * 0.2, deckY + 0.3, sf - 0.1, '#4b4f57');
    const sr = Z(s.seatR);
    seatBlock(b, W * 0.72, 0.36, 0.11, 0, deckY - 0.02, sr, -0.2);
    for (const hx of [-0.3, 0, 0.3]) seatBlock(b, 0.16, 0.12, 0.08, hx, deckY + 0.24, sr, -0.2, '#2a2b2e');
    b.D(new THREE.BoxGeometry(W * 0.7, 0.025, 0.3), '#1a1b1e', mat(0, deckY + 0.03, Z(s.rearBase - 0.22)), 0, 0.9);
  }
}

/** Horizontal strip across an end face (panel seam, bumper split). */
function seam(b: Build, y: number, z: number, half: number, nz: number, width = 0.012, color = '#0a0a0b'): void {
  if (b.lod === 1) return;
  const pts: THREE.Vector3[] = [];
  const nrm: THREE.Vector3[] = [];
  for (let k = 0; k <= 8; k++) {
    const x = -half + (2 * half * k) / 8;
    // The face bulges a little towards its centre (plan rounding): follow it.
    pts.push(new THREE.Vector3(x, y, z + nz * (0.012 - 0.03 * Math.pow(Math.abs(x) / half, 2))));
    nrm.push(new THREE.Vector3(0, 0, nz));
  }
  b.D(ribbon(pts, nrm, width, 0), color, undefined, 0, 0.8, nz < 0);
}

function frontFace(b: Build, s: CarSpec, nz: number, W: number, yb: (d: number) => number): void {
  const lod = b.lod;
  // Grille: glossy panel with a chrome bar and the badge, sloped with the nose; lower intake and fog lamps.
  const gf = frame(0, s.grilleY, nz, 0, 0.2, -1);
  b.D(chamferBox(W * 0.46, 0.14, 0.05, 0.03), GLOSS_BLACK, inFrame(gf, 0, 0, 0.012), 0.4, 0.3);
  if (lod === 0) {
    b.D(chamferBox(W * 0.48, 0.022, 0.06, 0.008), CHROME, inFrame(gf, 0, 0.085, 0.02), 1, 0.2);
    b.D(chamferBox(W * 0.48, 0.022, 0.06, 0.008), CHROME, inFrame(gf, 0, -0.085, 0.02), 1, 0.2);
    for (let k = -3; k <= 3; k++) b.D(chamferBox(0.006, 0.12, 0.04, 0.002), '#1c1d20', inFrame(gf, k * W * 0.06, 0, 0.034), 0.6, 0.4);
    b.D(new THREE.CylinderGeometry(0.036, 0.036, 0.012, 14), CHROME, inFrame(gf, 0, 0, 0.044, Math.PI / 2), 1, 0.2);
    b.D(chamferBox(W * 0.7, 0.09, 0.05, 0.03), BLACK, inFrame(gf, 0, -0.27, 0.0), 0, 0.8);
    seam(b, s.grilleY - 0.16, nz, W * 0.42, -1);
  }
  b.sym(() => {
    const hf = frame(W * 0.35, s.headY, nz + 0.2, 0.66, 0.1, -0.74);
    headLamp(b, hf, 1.12, 0.13);
    if (lod === 0) {
      const ff = frame(W * 0.37, yb(0.3) + 0.1, nz + 0.1, 0.5, 0.1, -0.86);
      roundLamp(b, ff, 0, 0, 0.042, LAMP.aux, '#e8f0ff');
    }
  });
  plate(b, { x: 0, y: s.plateFrontY, z: nz - 0.012, face: -1, w: 0.52, h: 0.11, tilt: -0.08 });
}

function rearFace(b: Build, s: CarSpec, rz: number, W: number, ybEnd: number): void {
  const lod = b.lod;
  b.sym(() => {
    const tf = frame(W * 0.335, s.tailY, rz - 0.05, 0.42, 0.04, 0.9);
    tailLamp(b, tf, 1.15, s.tailTall ?? 0.15);
  });
  plate(b, { x: 0, y: s.plateRearY, z: rz + 0.012, face: 1, w: 0.52, h: 0.11, tilt: 0.04 });
  if (lod === 0) {
    // Bumper split, diffuser, reflectors and the brand badge.
    seam(b, s.plateRearY + 0.12, rz, W * 0.43, 1);
    b.D(chamferBox(W * 0.62, 0.075, 0.04, 0.02), '#101113', mat(0, ybEnd + 0.07, rz - 0.015), 0.1, 0.7);
    b.D(chamferBox(0.12, 0.03, 0.012, 0.005), CHROME, mat(0, s.tailY + 0.0, rz + 0.003), 1, 0.25);
    b.sym(() => b.D(chamferBox(0.12, 0.035, 0.015, 0.006), '#7a1818', mat(W * 0.4, ybEnd + 0.15, rz - 0.006), 0.3, 0.3));
  }
}

export const SEDAN: CarSpec = {
  axleF: 0.93,
  wheelbase: 2.7,
  R: 0.315,
  tw: 0.205,
  yb: [[0, 0.3], [0.12, 0.25], [0.45, 0.19], [1.0, 0.165], [3.5, 0.165], [4.1, 0.19], [4.45, 0.26], [4.6, 0.32]],
  yt: [
    [0, 0.7], [0.05, 0.77], [0.3, 0.8], [0.8, 0.85], [1.25, 0.91], [1.6, 0.96],
    [3.0, 0.97], [3.5, 0.98], [4.0, 0.985], [4.4, 0.975], [4.55, 0.95], [4.6, 0.9],
  ],
  planF: [[0, 0.82], [0.08, 0.86], [0.3, 0.92], [0.7, 0.97], [1.2, 1]],
  planR: [[0, 0.86], [0.08, 0.9], [0.3, 0.95], [0.7, 0.985], [1.2, 1]],
  n: [[0, 4.2], [0.3, 4.6], [1.3, 4.6], [2.3, 4.4], [3.3, 4.4], [4.2, 4.6], [4.6, 4.8]],
  belt: 0.96,
  roof: 1.45,
  gh: [
    [1.5, 1.0, 0.93],
    [1.8, 1.2, 0.9],
    [2.2, 1.42, 0.84],
    [2.9, 1.45, 0.85],
    [3.4, 1.4, 0.82],
    [3.75, 1.17, 0.88],
    [4.0, 1.02, 0.93],
  ],
  ghPinch: 0.74,
  ghN: 3.1,
  cowl: 1.5,
  roofF: 2.2,
  roofR: 3.4,
  rearBase: 4.0,
  bPillar: 2.72,
  hatch: false,
  roofHalf: 0.62,
  seatF: 2.3,
  seatR: 3.28,
  headY: 0.76,
  tailY: 0.79,
  plateRearY: 0.55,
  plateFrontY: 0.4,
  grilleY: 0.55,
};

export const HATCH: CarSpec = {
  axleF: 0.84,
  wheelbase: 2.58,
  R: 0.3,
  tw: 0.195,
  yb: [[0, 0.3], [0.12, 0.25], [0.42, 0.19], [0.9, 0.165], [3.2, 0.165], [3.65, 0.19], [3.95, 0.26], [4.05, 0.32]],
  yt: [
    [0, 0.7], [0.05, 0.76], [0.3, 0.79], [0.8, 0.84], [1.2, 0.9], [1.5, 0.95],
    [2.8, 0.97], [3.5, 0.98], [3.85, 1.0], [3.98, 0.99], [4.05, 0.95],
  ],
  planF: [[0, 0.82], [0.08, 0.86], [0.3, 0.93], [0.7, 0.97], [1.1, 1]],
  planR: [[0, 0.9], [0.08, 0.93], [0.3, 0.97], [0.6, 1]],
  n: [[0, 4.2], [0.3, 4.6], [1.3, 4.6], [2.3, 4.4], [3.3, 4.4], [3.9, 4.6], [4.05, 4.8]],
  belt: 0.97,
  roof: 1.44,
  gh: [
    [1.45, 0.99, 0.93],
    [1.7, 1.17, 0.9],
    [2.05, 1.38, 0.85],
    [2.7, 1.44, 0.86],
    [3.3, 1.42, 0.85],
    [3.7, 1.31, 0.88],
    [3.97, 1.02, 0.93],
  ],
  ghPinch: 0.76,
  ghN: 3.1,
  cowl: 1.45,
  roofF: 2.05,
  roofR: 3.5,
  rearBase: 3.95,
  bPillar: 2.55,
  hatch: true,
  roofHalf: 0.6,
  seatF: 2.1,
  seatR: 3.0,
  headY: 0.76,
  tailY: 0.8,
  plateRearY: 0.56,
  plateFrontY: 0.4,
  grilleY: 0.55,
  tailTall: 0.25,
};

export const SUV: CarSpec = {
  axleF: 0.92,
  wheelbase: 2.67,
  R: 0.35,
  tw: 0.225,
  yb: [[0, 0.36], [0.12, 0.3], [0.45, 0.24], [1.0, 0.21], [3.4, 0.21], [3.9, 0.24], [4.3, 0.3], [4.5, 0.36]],
  yt: [
    [0, 0.84], [0.05, 0.9], [0.3, 0.94], [0.8, 0.98], [1.2, 1.03], [1.5, 1.07],
    [2.8, 1.08], [3.6, 1.1], [4.2, 1.11], [4.4, 1.09], [4.5, 1.02],
  ],
  planF: [[0, 0.84], [0.08, 0.88], [0.3, 0.94], [0.7, 0.98], [1.1, 1]],
  planR: [[0, 0.9], [0.08, 0.93], [0.3, 0.97], [0.6, 1]],
  n: [[0, 4.4], [0.3, 4.8], [1.3, 4.8], [2.3, 4.6], [3.3, 4.6], [4.0, 4.8], [4.5, 5]],
  belt: 1.08,
  roof: 1.64,
  gh: [
    [1.5, 1.1, 0.94],
    [1.78, 1.3, 0.92],
    [2.2, 1.58, 0.87],
    [2.9, 1.64, 0.88],
    [3.7, 1.62, 0.86],
    [4.12, 1.5, 0.89],
    [4.36, 1.13, 0.93],
  ],
  ghPinch: 0.78,
  ghN: 3.2,
  cowl: 1.5,
  roofF: 2.15,
  roofR: 3.95,
  rearBase: 4.34,
  bPillar: 2.85,
  hatch: true,
  roofHalf: 0.6,
  seatF: 2.3,
  seatR: 3.3,
  headY: 0.86,
  tailY: 0.92,
  plateRearY: 0.64,
  plateFrontY: 0.5,
  grilleY: 0.68,
  tailTall: 0.27,
};

export const PICKUP: CarSpec = {
  axleF: 1.0,
  wheelbase: 3.1,
  R: 0.38,
  tw: 0.245,
  yb: [[0, 0.42], [0.12, 0.34], [0.5, 0.28], [1.1, 0.25], [4.6, 0.25], [5.1, 0.3], [5.3, 0.38]],
  yt: [
    [0, 0.92], [0.06, 0.98], [0.35, 1.02], [0.9, 1.06], [1.4, 1.1], [1.7, 1.12],
    [3.1, 1.12], [3.4, 1.06], [3.6, 1.02], [5.1, 1.03], [5.25, 1.01], [5.3, 0.97],
  ],
  planF: [[0, 0.85], [0.08, 0.88], [0.3, 0.94], [0.7, 0.98], [1.1, 1]],
  planR: [[0, 0.9], [0.08, 0.93], [0.3, 0.97], [0.6, 1]],
  n: [[0, 4.4], [0.3, 4.8], [1.3, 4.8], [3.0, 4.6], [3.6, 4.6], [5.0, 4.8], [5.3, 5]],
  belt: 1.12,
  roof: 1.82,
  gh: [
    [1.7, 1.14, 0.94],
    [2.0, 1.4, 0.9],
    [2.45, 1.8, 0.86],
    [3.0, 1.82, 0.87],
    [3.3, 1.62, 0.9],
    [3.45, 1.15, 0.93],
  ],
  ghPinch: 0.8,
  ghN: 3.2,
  cowl: 1.7,
  roofF: 2.35,
  roofR: 3.1,
  rearBase: 3.44,
  bPillar: 2.7,
  hatch: true,
  roofHalf: 0.55,
  seatF: 2.45,
  seatR: 3.1,
  headY: 0.9,
  tailY: 0.93,
  plateRearY: 0.7,
  plateFrontY: 0.52,
  grilleY: 0.7,
  tailTall: 0.22,
  bed: 3.6,
};

/** Open load bed: a dark liner inside raised rims, the cab's rear wall and a tailgate with handle. */
export function pickupBed(c: CarCtx): void {
  const { b, s, Z } = c;
  if (s.bed === undefined) return;
  const W = b.W;
  const z0 = Z(s.bed);
  const z1 = Z(b.L) - 0.07;
  const rimY = 1.04;
  const inset = 0.13;
  // Dark liner floor, a touch above the loft's top so it reads as the bed floor.
  b.D(topPatch(c.body, z0 + 0.05, z1, () => W / 2 - inset, 6, 6, 0.012), '#17181a', undefined, 0, 0.9);
  // Raised rims (side walls' inner lip) and the cab bulkhead.
  for (const sx of [-1, 1]) b.D(chamferBox(0.05, 0.1, z1 - z0, 0.02), '#202226', mat(sx * (W / 2 - inset), rimY, (z0 + z1) / 2), 0, 0.7);
  b.D(chamferBox(W - 2 * inset, 0.2, 0.06, 0.02), '#202226', mat(0, rimY + 0.04, z0 + 0.02), 0, 0.7);
  // Tailgate split and handle.
  const rz = Z(b.L);
  b.D(chamferBox(W - 0.25, 0.012, 0.01, 0.004), '#0a0a0b', mat(0, rimY - 0.2, rz + 0.001), 0, 0.8);
  b.D(chamferBox(0.2, 0.03, 0.02, 0.008), '#1b1c1e', mat(0, rimY - 0.07, rz + 0.01), 0.4, 0.5);
}

/** Roof sign of a taxi: a lit box with a dark band. */
export function taxiExtras(c: CarCtx): void {
  const { b, s, Z } = c;
  if (b.lod === 1) {
    b.D(chamferBox(0.42, 0.14, 0.22, 0.04), '#f1d20f', mat(0, s.roof + 0.07, Z((s.roofF + s.roofR) / 2)), 0, 0.5);
    return;
  }
  const y = s.roof + 0.075;
  const z = Z((s.roofF + s.roofR) / 2);
  b.D(chamferBox(0.46, 0.14, 0.2, 0.045), '#f3d11a', mat(0, y, z), 0, 0.45);
  b.D(chamferBox(0.47, 0.035, 0.205, 0.01), '#101113', mat(0, y, z), 0, 0.6);
  b.L2(chamferBox(0.34, 0.022, 0.012, 0.005), LAMP.aux, '#fff2b0', mat(0, y + 0.035, z - 0.1));
  b.L2(chamferBox(0.34, 0.022, 0.012, 0.005), LAMP.aux, '#fff2b0', mat(0, y + 0.035, z + 0.1));
  // Chequered door stripe.
  b.sym(() => {
    for (let k = 0; k < 10; k++) {
      const zz = Z(s.cowl + 0.25 + k * 0.17);
      const y0 = s.belt - 0.32;
      const x = c.body.sideX(zz, y0) ?? b.W / 2;
      b.D(chamferBox(0.006, 0.045, 0.085, 0.002), k % 2 === 0 ? '#0b0b0c' : '#f1d20f', mat(x + 0.003, y0 + (k % 2) * 0.0, zz), 0, 0.5);
    }
  });
}

/** Turkish police livery: white body, blue flank bands, "POLİS" panel and a blue/red light bar. */
export function policeExtras(c: CarCtx): void {
  const { b, s, Z, flank, body } = c;
  const BLUE = '#14398a';
  if (b.lod === 0) {
    // Flank band between the arches (above them) running nose to tail.
    const y0 = s.belt - 0.2;
    const zs0 = Z(0.5);
    const zs1 = Z(b.L - 0.45);
    b.sym(() => {
      for (const [ya, yb2] of [[y0, y0 - 0.16], [y0 - 0.2, y0 - 0.24]] as const) {
        const pts: THREE.Vector3[] = [];
        for (let k = 0; k <= 14; k++) {
          const z = zs0 + ((zs1 - zs0) * k) / 14;
          pts.push(flank(body, z, (ya + yb2) / 2, 0.003));
        }
        b.D(ribbon(pts, pts.map(() => new THREE.Vector3(1, 0, 0)), Math.abs(ya - yb2), 0), BLUE, undefined, 0.2, 0.4);
      }
    });
    // Hood and trunk stripes.
    b.D(new THREE.BoxGeometry(0.5, 0.004, 1.0), BLUE, mat(0, c.yt(0.9) + 0.004, Z(0.9)), 0.2, 0.4);
  }
  // Light bar: housing with a blue (left) and red (right) lens. Channels beaconA / beaconB flash alternately.
  const y = s.roof + 0.06;
  const z = Z((s.roofF + s.roofR) / 2 - 0.1);
  b.D(chamferBox(1.0, 0.06, 0.26, 0.025), '#0e0f12', mat(0, y - 0.02, z), 0.4, 0.4);
  b.L2(chamferBox(0.44, 0.07, 0.22, 0.03), LAMP.beaconA, '#2a5bff', mat(-0.26, y + 0.03, z));
  b.L2(chamferBox(0.44, 0.07, 0.22, 0.03), LAMP.beaconB, '#ff2a1c', mat(0.26, y + 0.03, z));
  b.anchor('beacon', new THREE.Vector3(-0.26, y + 0.06, z));
  b.anchor('beacon', new THREE.Vector3(0.26, y + 0.06, z));
}
