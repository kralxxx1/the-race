import * as THREE from 'three';
import { splitTriangles, superLoft, type LoftStation } from '../geom';
import type { Build } from './build';
import { LAMP, Loft, chamferBox, cutArches, curve, loftPatch, loftPath, mat, ribbon, topPatch, type ArchHole } from './kit';
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
  /** Height of the hood leading edge's top and of the grille centre. */
  grilleY: number;
}

const ENDS = [0, 0.012, 0.03, 0.06, 0.1, 0.16, 0.24, 0.34, 0.48, 0.66];

function stationDs(L: number, lod: 0 | 1, axles: number[], R: number): number[] {
  if (lod === 1) return [0, 0.04, 0.16, 0.5, L * 0.3, L * 0.5, L * 0.7, L - 0.5, L - 0.16, L - 0.04, L];
  const set = new Set<number>(ENDS);
  for (const e of ENDS) set.add(L - e);
  for (let d = 0.9; d < L - 0.9; d += 0.34) set.add(Math.round(d * 1000) / 1000);
  // Extra rings around the axles so the arch ring hugs the tyre.
  for (const a of axles) for (const o of [-0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6]) set.add(Math.round((a + o * (R / 0.32)) * 1000) / 1000);
  return [...set].filter((d) => d >= 0 && d <= L).sort((p, q) => p - q).filter((d, i, arr) => i === 0 || d - arr[i - 1] > 0.02);
}

export function buildCar(b: Build, s: CarSpec): void {
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
  const [clad, upper] = splitTriangles(lowerGeo, (_x, _y, _z, sec) => sec < -0.62);
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
  if (lod === 0) {
    const belt = s.belt;
    b.sym(() => {
      // A-pillar: windshield base corner → roof front corner. B and C pillars likewise.
      const aPath = loftPath(cabin, [[zA + 0.04, cabin.angleAtHeight(zA + 0.04, belt + 0.08) + 0.1], [zRf, roofTh0 - 0.02]], 10);
      b.P(ribbon(aPath.pts, aPath.nrm, 0.075, 0.006));
      const zb = Z(s.bPillar);
      const bPath = loftPath(cabin, [[zb, cabin.angleAtHeight(zb, belt + 0.02)], [zb, roofTh0 - 0.05]], 8);
      b.P(ribbon(bPath.pts, bPath.nrm, 0.085, 0.006));
      const cPath = loftPath(cabin, [[zB - 0.04, cabin.angleAtHeight(zB - 0.04, belt + 0.08) + 0.1], [zRr, roofTh0 - 0.02]], 10);
      b.P(ribbon(cPath.pts, cPath.nrm, s.hatch ? 0.14 : 0.12, 0.006));
      // Belt moulding: black strip along the base of the side glass.
      const zs = [zA + 0.15, Z(s.bPillar), zB - 0.15];
      const bl = loftPath(cabin, zs.map((z) => [z, cabin.angleAtHeight(z, belt + 0.035)] as [number, number]), 12);
      b.D(ribbon(bl.pts, bl.nrm, 0.04, 0.004), GLOSS_BLACK, undefined, 0.3, 0.3);
      // Door gaps on the flank.
      for (const dz of [s.cowl + 0.1, s.bPillar, s.rearBase - 0.2]) {
        const z = Z(dz);
        const path = loftPath(body, [[z, body.angleAtHeight(z, belt - 0.02)], [z, body.angleAtHeight(z, yb(dz) + 0.18)]], 8);
        gap(b, path.pts, path.nrm);
      }
      // Door handles.
      for (const dz of [s.bPillar - 0.35, s.bPillar + 0.5]) {
        const z = Z(dz);
        const x = body.sideX(z, belt - 0.12) ?? W / 2;
        b.D(chamferBox(0.14, 0.025, 0.02, 0.008), '#1b1c1e', mat(x + 0.008, belt - 0.12, z), 0.5, 0.4);
      }
    });
    // Rubber seal at the windscreen base and the cowl vent strip under the wipers.
    const wsPath = loftPath(cabin, [[zA + 0.06, mid + 0.55], [zA + 0.06, mid - 0.55]], 12);
    b.D(ribbon(wsPath.pts, wsPath.nrm, 0.05, 0.005), GLOSS_BLACK, undefined, 0.3, 0.3);
    const cv = loftPath(cabin, [[zA - 0.04, mid + 0.7], [zA - 0.04, mid - 0.7]], 12);
    b.D(ribbon(cv.pts, cv.nrm, 0.06, 0.01), '#101113', undefined, 0, 0.8);
  }

  // ── front end ──
  const nz = Z(0);
  // Grille: chrome bar, glossy black panel, lower intake; raked with the nose.
  const gf = frame(0, s.grilleY, nz - 0.0, 0, 0.18, -1);
  b.D(chamferBox(W * 0.5, 0.15, 0.05, 0.03), GLOSS_BLACK, inFrame(gf, 0, 0, 0.02), 0.4, 0.3);
  if (lod === 0) {
    b.D(chamferBox(W * 0.52, 0.026, 0.06, 0.01), CHROME, inFrame(gf, 0, 0.09, 0.025), 1, 0.2);
    b.D(chamferBox(W * 0.62, 0.11, 0.06, 0.03), BLACK, inFrame(gf, 0, -0.2, 0.0), 0, 0.8);
    b.D(new THREE.CylinderGeometry(0.035, 0.035, 0.01, 14), CHROME, inFrame(gf, 0, 0.09, 0.056, Math.PI / 2), 1, 0.2);
  }
  b.sym(() => {
    const hf = frame(W * 0.33, s.headY, Z(0.2), 0.62, 0.12, -0.78);
    headLamp(b, hf, 1, 0.12);
    if (lod === 0) {
      const ff = frame(W * 0.33, yb(0.3) + 0.12, Z(0.12), 0.45, 0.1, -0.88);
      roundLamp(b, ff, 0, 0, 0.04, LAMP.aux, '#e8f0ff');
    }
  });
  plate(b, { x: 0, y: s.plateFrontY, z: nz - 0.015, face: -1, w: 0.52, h: 0.11, tilt: -0.1 });

  // ── rear end ──
  const rz = Z(L);
  b.sym(() => {
    const tf = frame(W * 0.34, s.tailY, rz - 0.07, 0.5, 0.05, 0.86);
    tailLamp(b, tf, 1, 0.14);
  });
  plate(b, { x: 0, y: s.plateRearY, z: rz + 0.015, face: 1, w: 0.52, h: 0.11, tilt: 0.05 });
  if (lod === 0) {
    // Third brake light, bumper reflectors and exhaust.
    const zr3 = Z(s.rearBase) - (s.hatch ? 0.14 : 0.12);
    const y3 = s.hatch ? s.roof - 0.12 : s.belt + 0.08;
    b.L2(chamferBox(0.5, 0.022, 0.015, 0.008), LAMP.tail, '#d01a10', mat(0, y3, zr3, -0.65));
    b.set.tailGlow.push(new THREE.Vector3(0, y3, zr3));
    b.sym(() => {
      tailpipe(b, W * 0.28, yb(L - 0.05) + 0.05, rz - 0.04);
      b.D(chamferBox(0.12, 0.035, 0.015, 0.006), '#6d1515', mat(W * 0.38, yb(L - 0.05) + 0.18, rz - 0.01), 0.3, 0.3);
    });
    b.D(chamferBox(W * 0.5, 0.05, 0.05, 0.02), '#121316', mat(0, yb(L - 0.05) + 0.06, rz - 0.03), 0.1, 0.7);
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

export const SEDAN: CarSpec = {
  axleF: 0.93,
  wheelbase: 2.7,
  R: 0.315,
  tw: 0.205,
  yb: [[0, 0.3], [0.12, 0.24], [0.45, 0.185], [1.0, 0.165], [3.5, 0.165], [4.1, 0.19], [4.45, 0.26], [4.6, 0.33]],
  yt: [
    [0, 0.64], [0.08, 0.74], [0.45, 0.8], [1.0, 0.87], [1.45, 0.95], [1.6, 0.97],
    [3.0, 0.97], [3.5, 0.99], [3.95, 1.0], [4.3, 0.98], [4.5, 0.9], [4.6, 0.78],
  ],
  planF: [[0, 0.76], [0.06, 0.8], [0.25, 0.88], [0.6, 0.95], [1.1, 0.99], [1.5, 1]],
  planR: [[0, 0.78], [0.08, 0.82], [0.3, 0.9], [0.7, 0.96], [1.2, 1]],
  n: [[0, 2.8], [0.5, 3.2], [1.3, 3.8], [2.3, 4.2], [3.3, 4.0], [4.0, 3.6], [4.2, 3.1], [4.6, 2.8]],
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
  headY: 0.73,
  tailY: 0.9,
  plateRearY: 0.72,
  plateFrontY: 0.37,
  grilleY: 0.52,
};
