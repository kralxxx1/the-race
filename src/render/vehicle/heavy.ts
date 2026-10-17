import * as THREE from 'three';
import { superLoft, type LoftStation } from '../geom';
import type { Build } from './build';
import { LAMP, Loft, chamferBox, cutArches, loftPatch, mat, ribbon, type ArchHole } from './kit';
import { AMBER, BLACK, CHROME, GLOSS_BLACK, RED, TRIM, WHITE_LENS, frame, inFrame, mirror, plate, wheelHouse } from './parts';

/**
 * Heavy vehicles: box truck, tractor + trailer, tanker, city bus and coach. Bodies are lofted
 * rounded blocks (superellipse sections with a high exponent), windows are dark glossy patches
 * lying on those surfaces, and chassis parts are small merged primitives.
 */

const GLASS = '#080c11';
const STEEL = '#3b3e43';
const DARK_STEEL = '#25272b';
const ALU = '#b7bcc1';
const RUBBER = '#0d0d0e';

export const TRUCK_R = 0.5;
export const TRUCK_TW = 0.3;

function stations(z0: number, z1: number, w: number, yb: number, yt: number, n: number, bevel: number, endW = 0.95): LoftStation[] {
  return [
    { z: z0, w: w * endW, yb: yb + bevel * 0.5, yt: yt - bevel * 0.5, n },
    { z: z0 + bevel, w, yb, yt, n },
    { z: z1 - bevel, w, yb, yt, n },
    { z: z1, w: w * endW, yb: yb + bevel * 0.5, yt: yt - bevel * 0.5, n },
  ];
}

/** Rounded block as a lofted shell. */
export function blockLoft(b: Build, z0: number, z1: number, w: number, yb: number, yt: number, n = 6, bevel = 0.06, radial = 28): { geo: THREE.BufferGeometry; loft: Loft } {
  const st = stations(z0, z1, w, yb, yt, n, bevel);
  return { geo: superLoft(st, b.seg(radial, 12), 1), loft: new Loft(st) };
}

/** Wheel pair (or dual pair) on an axle; `track` is the centre-to-centre distance of the outer wheels. */
export function axle(b: Build, z: number, track: number, dual = false, steer = false, r = TRUCK_R, w = TRUCK_TW): void {
  const xs = dual ? [track / 2, track / 2 - w - 0.04] : [track / 2];
  for (const x of xs) {
    b.set.wheels.push({ x, y: r, z, r, w, steer, type: 'truck' });
    b.set.wheels.push({ x: -x, y: r, z, r, w, steer, type: 'truck' });
  }
  if (b.lod === 0) {
    // Axle beam and differential housing.
    b.D(new THREE.CylinderGeometry(0.07, 0.07, track * 0.9, 8), DARK_STEEL, mat(0, r, z, 0, 0, Math.PI / 2), 0.5, 0.6);
    if (!steer) b.D(new THREE.SphereGeometry(0.2, 10, 8), DARK_STEEL, mat(0, r, z, 0, 0, 0, 1, 0.9, 0.9), 0.5, 0.6);
  }
}

/** Mudguard arc over a wheel group (right side; mirrored by `Build.sym`). */
export function mudguard(b: Build, x: number, z: number, r: number, width: number, y0 = 0): void {
  const pts = [new THREE.Vector2(r + 0.05, -width / 2), new THREE.Vector2(r + 0.09, -width / 2 + 0.02), new THREE.Vector2(r + 0.09, width / 2 - 0.02), new THREE.Vector2(r + 0.05, width / 2)];
  const seg = b.seg(16, 8);
  const g = new THREE.LatheGeometry(pts, seg, -Math.PI + 0.25, Math.PI - 0.5);
  g.rotateZ(-Math.PI / 2);
  b.D(g, '#1a1b1e', mat(x, y0 + r, z), 0.2, 0.7);
}

/** Truck tail-lamp cluster on a flat rear face (right side; mirrored by `Build.sym`). */
export function truckTail(b: Build, x: number, y: number, z: number, w = 0.34, h = 0.2): void {
  const f = frame(x, y, z, 0, 0, 1);
  b.D(chamferBox(w, h, 0.05, 0.02), '#190a0a', inFrame(f), 0.2, 0.4);
  b.L2(chamferBox(w * 0.94, h * 0.36, 0.02, 0.01), LAMP.tail, RED, inFrame(f, 0, h * 0.28, 0.026));
  b.L2(chamferBox(w * 0.94, h * 0.28, 0.02, 0.01), LAMP.indR, AMBER, inFrame(f, 0, -h * 0.04, 0.026));
  b.L2(chamferBox(w * 0.94, h * 0.24, 0.02, 0.01), LAMP.reverse, WHITE_LENS, inFrame(f, 0, -h * 0.3, 0.026));
  b.anchor('tail', new THREE.Vector3(x, y + h * 0.2, z + 0.06));
  b.anchor('ind', new THREE.Vector3(x, y, z + 0.06));
}

/** Row of amber position lights along a flank at height y (lamp channel aux), right side. */
function markers(b: Build, x: number, y: number, z0: number, z1: number, n: number): void {
  if (b.lod === 1) return;
  for (let k = 0; k < n; k++) {
    const z = z0 + ((z1 - z0) * k) / Math.max(1, n - 1);
    b.L2(chamferBox(0.012, 0.045, 0.1, 0.004), LAMP.aux, '#ff9c1a', mat(x + 0.003, y, z));
  }
}

/** Underrun bar with two reflectors, plate and side guards. */
function rearUnderride(b: Build, w: number, z: number, y: number): void {
  b.D(chamferBox(w * 0.86, 0.14, 0.1, 0.03), STEEL, mat(0, y, z - 0.05), 0.6, 0.5);
  b.sym(() => b.D(chamferBox(0.2, 0.1, 0.012, 0.004), '#a01d1d', mat(w * 0.34, y, z + 0.004), 0.3, 0.3));
  // Red/white conspicuity tape across the back.
  for (let k = 0; k < 14; k++) b.D(chamferBox(w * 0.9 / 14, 0.08, 0.008, 0.002), k % 2 ? '#d8d8d4' : '#c92222', mat(-w * 0.45 + (k + 0.5) * (w * 0.9 / 14), y + 0.15, z + 0.003), 0.2, 0.5);
}

export interface CabSpec {
  zF: number;
  zR: number;
  w: number;
  yb: number;
  roof: number;
  /** Front-face height before the windscreen rake starts. */
  face: number;
  /** Sleeper cab (taller, longer roof, fairing). */
  sleeper?: boolean;
}

/** Forward-control cab: raked windscreen, side glazing, grille, lamps, mirrors, steps. Returns the cab loft. */
export function cab(b: Build, c: CabSpec): Loft {
  const { zF, zR, w, yb, roof, face } = c;
  const st: LoftStation[] = [
    { z: zF, w: w * 0.9, yb: yb + 0.1, yt: face - 0.05, n: 5.5 },
    { z: zF + 0.05, w: w * 0.96, yb, yt: face + 0.05, n: 5.5 },
    { z: zF + 0.2, w: w * 0.99, yb, yt: face + (roof - face) * 0.55, n: 6 },
    { z: zF + 0.5, w, yb, yt: roof - 0.04, n: 6 },
    { z: zF + 0.9, w, yb, yt: roof, n: 6 },
    { z: zR - 0.1, w, yb, yt: roof, n: 6 },
    { z: zR, w: w * 0.96, yb: yb + 0.05, yt: roof - 0.06, n: 5 },
  ];
  const loft = new Loft(st);
  b.P(superLoft(st, b.seg(30, 12), 1));
  const mid = Math.PI / 2;
  // Windscreen: dark patch on the raked top of the loft.
  b.D(loftPatch(loft, zF + 0.1, zF + 0.5, mid - 0.7, mid + 0.7, b.seg(8, 3), b.seg(14, 5), 0.006), GLASS, undefined, 0.6, 0.06);
  if (b.lod === 0) {
    // Side windows.
    const zm = (zF + zR) / 2;
    const th0 = loft.angleAtHeight(zm, face + 0.18);
    const th1 = loft.angleAtHeight(zm, roof - 0.25);
    b.sym(() => {
      b.D(loftPatch(loft, zF + 0.55, zR - 0.55, th0, th1, b.seg(8, 3), b.seg(4, 2), 0.006), GLASS, undefined, 0.6, 0.06);
      // Door seam, handle, step.
      const zs = zF + 0.55 + 0.75;
      const x = loft.sideX(zs, face - 0.3) ?? w / 2;
      b.D(chamferBox(0.012, 0.8, 0.012, 0.004), '#0a0a0b', mat(x + 0.003, face - 0.7, zs), 0, 0.8);
      b.D(chamferBox(0.03, 0.04, 0.16, 0.01), TRIM, mat(x + 0.01, face - 0.35, zs + 0.3), 0.3, 0.5);
      b.D(chamferBox(0.22, 0.04, 0.5, 0.012), STEEL, mat(w / 2 - 0.02, yb - 0.02, zF + 1.1), 0.7, 0.45);
      // Large rectangular wing mirror on a bracket.
      b.D(chamferBox(0.04, 0.34, 0.22, 0.01), '#101113', mat(w / 2 + 0.18, face + 0.45, zF + 0.7), 0.2, 0.5);
      b.D(chamferBox(0.01, 0.3, 0.19, 0.01), '#a9b8c6', mat(w / 2 + 0.2, face + 0.45, zF + 0.7), 1, 0.04);
      b.D(new THREE.CylinderGeometry(0.014, 0.014, 0.35, 6), '#101113', mat(w / 2 + 0.08, face + 0.35, zF + 0.7, 0, 0, Math.PI / 2 - 0.4), 0.2, 0.5);
    });
    // Grille and lower bumper.
    b.D(chamferBox(w * 0.62, 0.55, 0.06, 0.03), GLOSS_BLACK, mat(0, yb + 0.72, zF - 0.01), 0.4, 0.3);
    for (let k = 0; k < 5; k++) b.D(chamferBox(w * 0.6, 0.014, 0.05, 0.004), CHROME, mat(0, yb + 0.5 + k * 0.1, zF - 0.025), 1, 0.2);
    b.D(chamferBox(w * 0.98, 0.34, 0.2, 0.06), DARK_STEEL, mat(0, yb + 0.12, zF - 0.06), 0.4, 0.6);
    // Sun visor over the windscreen.
    b.D(chamferBox(w * 0.92, 0.04, 0.34, 0.015), '#d6d9dc', mat(0, roof - 0.02, zF + 0.46, -0.05), 0.2, 0.5);
    // Roof lamps.
    for (const x of [-0.5, 0, 0.5]) b.L2(chamferBox(0.16, 0.07, 0.05, 0.02), LAMP.aux, '#ffb03a', mat(x, roof + 0.0, zF + 0.5));
  }
  b.sym(() => {
    const hf = frame(w * 0.38, yb + 0.55, zF - 0.02, 0.2, 0.0, -1);
    b.D(chamferBox(0.34, 0.2, 0.06, 0.03), '#16181b', inFrame(hf), 0.8, 0.25);
    b.L2(chamferBox(0.3, 0.16, 0.02, 0.02), LAMP.head, WHITE_LENS, inFrame(hf, 0, 0, 0.032));
    if (b.lod === 0) b.L2(chamferBox(0.1, 0.05, 0.015, 0.005), LAMP.indR, AMBER, inFrame(hf, -0.1, -0.1, 0.034));
    const p = new THREE.Vector3(w * 0.38, yb + 0.55, zF - 0.06);
    b.anchor('head', p);
    b.anchor('ind', new THREE.Vector3(w * 0.38 + 0.1, yb + 0.45, zF - 0.06));
  });
  plate(b, { x: 0, y: yb + 0.28, z: zF - 0.165, face: -1, w: 0.52, h: 0.11, tilt: 0 });
  return loft;
}

/** Ladder-frame chassis rails with fuel tank and air tanks between z0 and z1. */
export function chassis(b: Build, z0: number, z1: number, y: number, track = 0.9): void {
  const len = z1 - z0;
  const zc = (z0 + z1) / 2;
  for (const sx of [-1, 1]) b.D(chamferBox(0.1, 0.2, len, 0.02), DARK_STEEL, mat(sx * track / 2, y, zc), 0.6, 0.55);
  if (b.lod === 1) return;
  for (let k = 0; k < 5; k++) b.D(chamferBox(track, 0.08, 0.1, 0.02), DARK_STEEL, mat(0, y - 0.04, z0 + (len * (k + 0.5)) / 5), 0.6, 0.55);
  // Fuel tank (right) and battery box / air tanks (left).
  b.D(new THREE.CylinderGeometry(0.28, 0.28, Math.min(1.5, len * 0.35), 14), ALU, mat(track / 2 + 0.38, y - 0.02, zc, Math.PI / 2), 0.9, 0.3);
  b.D(chamferBox(0.34, 0.34, 0.7, 0.04), '#222428', mat(-track / 2 - 0.3, y, zc - 0.5), 0.3, 0.6);
  b.D(new THREE.CylinderGeometry(0.15, 0.15, 0.8, 10), ALU, mat(-track / 2 - 0.3, y - 0.1, zc + 0.5, Math.PI / 2), 0.9, 0.35);
}

// ───────────────────────────────── models ─────────────────────────────────

/** Box truck (kamyon): cab, ladder chassis, tall cargo box with rear doors and a drive tandem. */
export function buildTruck(b: Build): void {
  const hl = b.hl;
  const W = b.W;
  const zF = -hl;
  cab(b, { zF, zR: zF + 2.0, w: W * 0.96, yb: 0.55, roof: 3.05, face: 1.8 });
  const zB0 = zF + 2.15;
  const zB1 = hl;
  const yBox = 1.12;
  const { geo } = blockLoft(b, zB0, zB1, W, yBox, b.H, 7, 0.07);
  b.P(geo);
  chassis(b, zF + 0.4, zB1 - 0.5, 0.82);
  // Front axle under the cab, rear dual axle near the end of the box.
  const zFa = zF + 1.15;
  const zRa = zB1 - 1.55;
  axle(b, zFa, W - 0.36, false, true);
  axle(b, zRa, W - 0.36, true, false);
  b.sym(() => {
    mudguard(b, W / 2 - 0.15, zFa, TRUCK_R, 0.4);
    mudguard(b, W / 2 - 0.35, zRa, TRUCK_R, 0.7);
  });
  if (b.lod === 0) {
    b.sym(() => {
      markers(b, W / 2, yBox + 0.12, zB0 + 0.4, zB1 - 0.4, 6);
      truckTail(b, W * 0.4, yBox + 0.42, zB1 + 0.003, 0.34, 0.24);
      // Spare wheel under the chassis, side underrun rail.
      b.D(chamferBox(0.04, 0.1, zB1 - zB0 - 2.4, 0.015), STEEL, mat(W / 2 - 0.15, yBox - 0.22, (zB0 + zB1) / 2 - 0.1), 0.6, 0.5);
    });
    // Box: rear door seam and hinges, roll door lines, lower trim, side stripe.
    b.D(chamferBox(0.012, b.H - yBox - 0.25, 0.01, 0.003), '#0a0a0b', mat(0, (yBox + b.H) / 2, zB1 + 0.002), 0, 0.8);
    for (const sx of [-1, 1]) for (const yy of [0.35, 1.0, 1.65]) b.D(chamferBox(0.05, 0.12, 0.02, 0.006), STEEL, mat(sx * (W * 0.46), yBox + yy, zB1 + 0.008), 0.7, 0.4);
    b.D(chamferBox(W * 1.002, 0.18, zB1 - zB0 - 0.1, 0.01), '#1a1b1e', mat(0, yBox + 0.06, (zB0 + zB1) / 2), 0.1, 0.7);
    b.D(chamferBox(W * 1.003, 0.18, zB1 - zB0 - 0.4, 0.01), '#b92a22', mat(0, yBox + 1.45, (zB0 + zB1) / 2), 0.1, 0.5);
    rearUnderride(b, W, zB1 + 0.0, yBox - 0.15);
  } else {
    b.sym(() => truckTail(b, W * 0.4, yBox + 0.42, zB1 + 0.003, 0.34, 0.24));
  }
  plate(b, { x: 0, y: yBox - 0.02, z: zB1 + 0.012, face: 1, w: 0.52, h: 0.11, tilt: 0 });
  void RUBBER;
}

/** Cab-over tractor unit with fifth wheel: shared by the semi and the tanker. Returns the z of its rear. */
export function buildTractor(b: Build, zF: number): number {
  const W = b.W;
  const zCabR = zF + 2.45;
  cab(b, { zF, zR: zCabR, w: W * 0.95, yb: 0.6, roof: 3.55, face: 1.8, sleeper: true });
  // Roof fairing and side deflectors.
  if (b.lod === 0) {
    b.P(new THREE.BoxGeometry(W * 0.9, 0.5, 0.7), mat(0, 3.62, zF + 1.0, 0.2));
  }
  const zRear = zF + 6.3;
  chassis(b, zF + 0.4, zRear, 0.95, 0.85);
  const zFa = zF + 1.3;
  const zRa = zF + 5.1;
  axle(b, zFa, W - 0.3, false, true);
  axle(b, zRa, W - 0.3, true, false);
  axle(b, zRa - 1.35, W - 0.3, true, false);
  b.sym(() => {
    mudguard(b, W / 2 - 0.14, zFa, TRUCK_R, 0.4);
    mudguard(b, W / 2 - 0.32, zRa - 0.68, TRUCK_R + 0.68 * 0, 0.7);
  });
  // Fifth wheel plate.
  b.D(chamferBox(1.5, 0.12, 1.3, 0.04), DARK_STEEL, mat(0, 1.12, zRa - 0.55), 0.7, 0.45);
  if (b.lod === 0) {
    // Air hoses and cab fairing skirts.
    for (const x of [-0.35, 0.35]) b.D(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 6), '#1b1b1e', mat(x, 1.0, zRear + 0.0, 0.9), 0, 0.8);
    b.sym(() => b.D(chamferBox(0.04, 0.5, 2.3, 0.02), '#d4d7da', mat(W / 2 - 0.1, 0.95, zCabR - 1.2), 0.3, 0.5));
    // Exhaust stacks behind the cab.
    b.sym(() => b.D(new THREE.CylinderGeometry(0.06, 0.06, 2.0, 8), CHROME, mat(W / 2 - 0.2, 2.3, zCabR + 0.12), 1, 0.2));
  }
  void mirror;
  void BLACK;
  return zRear;
}

/** Curtain-sider trailer: tarp sides with ribs and a coloured band, tandem/tri-axle, landing gear. */
export function buildTrailer(b: Build, z0: number, z1: number, tarp: boolean): void {
  const W = b.W;
  const yb = 1.25;
  const yt = b.H;
  const { geo, loft } = blockLoft(b, z0, z1, W, yb, yt, 7, 0.07);
  b.P(geo);
  const zc = (z0 + z1) / 2;
  const len = z1 - z0;
  // Chassis, landing legs, axles.
  b.D(chamferBox(0.12, 0.22, len, 0.03), DARK_STEEL, mat(-0.55, yb - 0.14, zc), 0.6, 0.5);
  b.D(chamferBox(0.12, 0.22, len, 0.03), DARK_STEEL, mat(0.55, yb - 0.14, zc), 0.6, 0.5);
  const axles = [z1 - 1.0, z1 - 2.31, z1 - 3.62];
  for (const z of axles) axle(b, z, W - 0.3, true, false);
  b.sym(() => {
    for (const z of axles) mudguard(b, W / 2 - 0.3, z, TRUCK_R, 0.7, 0);
  });
  if (b.lod === 0) {
    for (const sx of [-1, 1]) b.D(chamferBox(0.1, 0.9, 0.1, 0.02), STEEL, mat(sx * 0.9, yb - 0.55, z0 + 2.2), 0.7, 0.5);
    // Side ribs / tarp seams and a coloured stripe.
    if (tarp) {
      b.sym(() => {
        for (let k = 1; k < 14; k++) {
          const z = z0 + (len * k) / 14;
          const x = loft.sideX(z, yb + 1.4) ?? W / 2;
          b.D(chamferBox(0.012, yt - yb - 0.35, 0.03, 0.004), '#1b1c1e', mat(x + 0.004, (yb + yt) / 2 - 0.05, z), 0, 0.7);
        }
        for (const [yy, hh, col] of [[yb + 0.5, 0.06, '#101113'], [yt - 0.9, 0.18, '#1f3f7a']] as const) {
          const x = loft.sideX(zc, yy) ?? W / 2;
          b.D(chamferBox(0.012, hh, len - 0.5, 0.004), col, mat(x + 0.003, yy, zc), 0.1, 0.6);
        }
        markers(b, W / 2, yb + 0.2, z0 + 0.8, z1 - 0.8, 7);
        truckTail(b, W * 0.4, yb + 0.1, z1 + 0.003, 0.34, 0.24);
      });
    }
    // Rear doors: seam + locking bars.
    b.D(chamferBox(0.012, yt - yb - 0.3, 0.01, 0.003), '#0a0a0b', mat(0, (yb + yt) / 2, z1 + 0.002), 0, 0.8);
    for (const sx of [-1, 1]) for (const hy of [0.5, 1.5, 2.3]) b.D(chamferBox(0.04, 0.3, 0.025, 0.008), STEEL, mat(sx * 0.4, yb + hy, z1 + 0.012), 0.8, 0.4);
    rearUnderride(b, W, z1, yb - 0.4);
    b.D(chamferBox(W * 0.9, 0.12, zc * 0 + 0.1, 0.02), TRIM, mat(0, yb - 0.55, z1 - 0.1), 0.2, 0.6);
  } else {
    b.sym(() => truckTail(b, W * 0.4, yb + 0.1, z1 + 0.003, 0.34, 0.24));
  }
  plate(b, { x: 0, y: yb - 0.62, z: z1 + 0.012, face: 1, w: 0.52, h: 0.11, tilt: 0 });
}

export function buildSemi(b: Build): void {
  const zF = -b.hl;
  const zRear = buildTractor(b, zF);
  void zRear;
  buildTrailer(b, zF + 2.9, b.hl, true);
}

/** Tanker: tractor + horizontal elliptical tank on a skeletal chassis, catwalk, manholes, ladder. */
export function buildTanker(b: Build): void {
  const zF = -b.hl;
  const W = b.W;
  buildTractor(b, zF);
  const z0 = zF + 3.2;
  const z1 = b.hl;
  const len = z1 - z0;
  const zc = (z0 + z1) / 2;
  const yCenter = 2.05;
  // Tank barrel: elliptical section with capped, domed ends (low exponent on the end stations).
  const hRad = 1.15;
  const st: LoftStation[] = [
    { z: z0, w: W * 0.55, yb: yCenter - hRad * 0.55, yt: yCenter + hRad * 0.55, n: 2 },
    { z: z0 + 0.12, w: W * 0.86, yb: yCenter - hRad * 0.88, yt: yCenter + hRad * 0.88, n: 2.1 },
    { z: z0 + 0.35, w: W * 0.98, yb: yCenter - hRad, yt: yCenter + hRad, n: 2.2 },
    { z: z1 - 0.35, w: W * 0.98, yb: yCenter - hRad, yt: yCenter + hRad, n: 2.2 },
    { z: z1 - 0.12, w: W * 0.86, yb: yCenter - hRad * 0.88, yt: yCenter + hRad * 0.88, n: 2.1 },
    { z: z1, w: W * 0.55, yb: yCenter - hRad * 0.55, yt: yCenter + hRad * 0.55, n: 2 },
  ];
  const tank = new Loft(st);
  b.P(superLoft(st, b.seg(32, 12), 1));
  // Frame, axles, mudguards.
  b.D(chamferBox(0.14, 0.3, len, 0.03), DARK_STEEL, mat(-0.6, yCenter - hRad - 0.1, zc), 0.6, 0.5);
  b.D(chamferBox(0.14, 0.3, len, 0.03), DARK_STEEL, mat(0.6, yCenter - hRad - 0.1, zc), 0.6, 0.5);
  const axles = [z1 - 1.0, z1 - 2.31, z1 - 3.62];
  for (const z of axles) axle(b, z, W - 0.3, true, false);
  b.sym(() => {
    for (const z of axles) mudguard(b, W / 2 - 0.3, z, TRUCK_R, 0.7, 0);
  });
  if (b.lod === 0) {
    // Stainless bands, walkway, manholes, ladder, valve cabinet.
    for (let k = 1; k < 8; k++) {
      const z = z0 + (len * k) / 8;
      const r = tank.ring(z);
      b.D(new THREE.TorusGeometry(Math.max(r.w, 0.1) / 2 * 1.0, 0.018, 5, 28), '#8e949a', mat(0, yCenter, z, 0, 0, 0, 1, (r.yt - r.yb) / r.w, 1).setPosition(0, yCenter, z), 1, 0.3);
    }
    b.D(chamferBox(0.7, 0.04, len - 1.2, 0.015), '#8b9096', mat(0, yCenter + hRad + 0.02, zc), 0.8, 0.45);
    for (let k = 0; k < 4; k++) {
      const z = z0 + 1.2 + (len - 2.4) * (k / 3);
      b.D(new THREE.CylinderGeometry(0.28, 0.3, 0.16, 14), '#a7acb1', mat(0, yCenter + hRad + 0.1, z), 1, 0.3);
      b.D(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 14), '#2a2c30', mat(0, yCenter + hRad + 0.19, z), 0.8, 0.4);
    }
    b.D(chamferBox(0.6, 0.55, 0.3, 0.04), STEEL, mat(0, yCenter - hRad - 0.1, z1 - 0.4), 0.7, 0.5);
    for (const sx of [-1, 1]) b.D(chamferBox(0.05, 1.7, 0.04, 0.01), STEEL, mat(sx * 0.2, yCenter - 0.1, z1 + 0.02), 0.7, 0.5);
    for (let k = 0; k < 6; k++) b.D(chamferBox(0.4, 0.03, 0.04, 0.01), STEEL, mat(0, yCenter - hRad + 0.2 + k * 0.28, z1 + 0.02), 0.7, 0.5);
    // Hazard diamond plate and colour band.
    b.sym(() => {
      const x = tank.sideX(zc, yCenter) ?? W / 2;
      b.D(chamferBox(0.01, 0.34, 1.0, 0.004), '#d7a21c', mat(x + 0.003, yCenter + 0.1, zc - 1.8), 0.1, 0.5);
      b.D(chamferBox(0.01, 0.12, len - 1.6, 0.004), '#c52a22', mat(x + 0.003, yCenter - 0.35, zc), 0.1, 0.5);
      markers(b, W / 2 - 0.03, yCenter - hRad + 0.3, z0 + 1.5, z1 - 1.0, 6);
      truckTail(b, W * 0.38, yCenter - hRad - 0.15, z1 + 0.003, 0.34, 0.24);
    });
    rearUnderride(b, W, z1 + 0.0, yCenter - hRad - 0.4);
  } else {
    b.sym(() => truckTail(b, W * 0.38, yCenter - hRad - 0.15, z1 + 0.003, 0.34, 0.24));
  }
  plate(b, { x: 0, y: yCenter - hRad - 0.6, z: z1 + 0.012, face: 1, w: 0.52, h: 0.11, tilt: 0 });
}

export interface BusSpec {
  /** Body bottom / top, band of glazing, number of side windows. */
  yb: number;
  glassLo: number;
  glassHi: number;
  windows: number;
  /** Axle positions from the nose. */
  axleF: number;
  axleR: number;
  /** Front door position (from the nose) and width; coach has one door, city bus two. */
  doors: number[];
  coach: boolean;
}

export const CITY_BUS: BusSpec = { yb: 0.42, glassLo: 1.0, glassHi: 2.55, windows: 7, axleF: 2.35, axleR: 8.35, doors: [1.1, 5.4], coach: false };
export const COACH: BusSpec = { yb: 0.5, glassLo: 1.6, glassHi: 3.3, windows: 8, axleF: 3.0, axleR: 9.7, doors: [1.5], coach: true };

/** City bus / intercity coach: long rounded block with a glazing band, doors, destination sign and arches. */
export function buildBus(b: Build, s: BusSpec): void {
  const hl = b.hl;
  const W = b.W;
  const H = b.H;
  const L = b.L;
  const Z = (d: number) => -hl + d;
  // Nose and tail stations round off with a plan taper (coach more than bus).
  const taper = s.coach ? 0.86 : 0.93;
  const st: LoftStation[] = [
    { z: -hl, w: W * taper, yb: s.yb + 0.25, yt: H - (s.coach ? 0.95 : 0.35), n: 5 },
    { z: -hl + 0.06, w: W * (taper + 0.05), yb: s.yb + 0.1, yt: H - (s.coach ? 0.7 : 0.18), n: 6 },
    { z: -hl + 0.5, w: W * 0.99, yb: s.yb, yt: H - (s.coach ? 0.2 : 0.04), n: 6.5 },
    { z: -hl + 1.2, w: W, yb: s.yb, yt: H, n: 7 },
    { z: hl - 1.0, w: W, yb: s.yb, yt: H, n: 7 },
    { z: hl - 0.1, w: W * 0.97, yb: s.yb + 0.05, yt: H - 0.05, n: 6 },
    { z: hl, w: W * 0.94, yb: s.yb + 0.12, yt: H - 0.12, n: 5 },
  ];
  const loft = new Loft(st);
  let geo = superLoft(st, b.seg(32, 12), 1);
  const R = TRUCK_R;
  const wells = [s.axleF, s.axleR];
  if (b.lod === 0) {
    const holes: ArchHole[] = [];
    for (const d of wells) for (const side of [1, -1] as const) holes.push({ z: Z(d), y: R, r: R + 0.12, xMin: W / 2 - 0.5, side });
    geo = cutArches(geo, holes);
  }
  b.P(geo);
  const zc = 0;
  for (const d of wells) {
    b.set.wheels.push({ x: W / 2 - 0.16, y: R, z: Z(d), r: R, w: TRUCK_TW + 0.05, steer: d === s.axleF, type: 'truck' });
    b.set.wheels.push({ x: -(W / 2 - 0.16), y: R, z: Z(d), r: R, w: TRUCK_TW + 0.05, steer: d === s.axleF, type: 'truck' });
    if (b.lod === 0) b.sym(() => wheelHouse(b, loft, Z(d), R, R + 0.12, W / 2 - 0.6, s.yb + 0.02));
  }
  void zc;
  // Front windscreen: tall dark panel with a wiper park line, destination sign above it.
  const zNose = Z(0);
  const wsH = s.coach ? 1.55 : 1.35;
  const wsY = s.coach ? H - 0.55 - wsH / 2 : s.glassLo + 0.65 + wsH / 2 - 0.2;
  b.D(chamferBox(W * 0.9, wsH, 0.06, 0.05), GLASS, mat(0, wsY, zNose + 0.05 - (s.coach ? 0.0 : 0.0), s.coach ? -0.1 : 0), 0.6, 0.06);
  const dest = frame(0, wsY + wsH / 2 + 0.17, zNose + 0.02, 0, 0.0, -1);
  b.D(chamferBox(W * 0.62, 0.22, 0.05, 0.02), '#0b0c0e', inFrame(dest), 0.3, 0.5);
  b.L2(chamferBox(W * 0.58, 0.15, 0.02, 0.01), LAMP.aux, '#ff9d1c', inFrame(dest, 0, 0, 0.03));
  // Side glazing: a continuous dark band with body pillars between windows.
  if (b.lod === 0) {
    b.sym(() => {
      const zA = Z(s.coach ? 2.3 : 1.2);
      const zB = Z(L - (s.coach ? 1.2 : 0.9));
      const n = s.windows;
      const y0 = s.glassLo;
      const y1 = s.glassHi;
      for (let k = 0; k < n; k++) {
        const za = zA + ((zB - zA) * k) / n + 0.05;
        const zb = zA + ((zB - zA) * (k + 1)) / n - 0.05;
        // Skip the door bays on a city bus.
        const dMid = (za + zb) / 2 + hl;
        if (!s.coach && s.doors.some((d) => Math.abs(dMid - d - 0.6) < 0.6)) continue;
        const x = (loft.sideX((za + zb) / 2, (y0 + y1) / 2) ?? W / 2) + 0.004;
        b.D(chamferBox(0.012, y1 - y0, zb - za, s.coach ? 0.04 : 0.025), GLASS, mat(x, (y0 + y1) / 2, (za + zb) / 2), 0.6, 0.06);
      }
      // Doors: glazed panels with a seam and a handrail.
      for (const d of s.doors) {
        const zd = Z(d + 0.6);
        const x = (loft.sideX(zd, 1.4) ?? W / 2) + 0.005;
        b.D(chamferBox(0.014, y1 - s.yb - 0.4, 1.0, 0.03), '#0d1218', mat(x, (y1 + s.yb) / 2 - 0.02, zd), 0.6, 0.08);
        b.D(chamferBox(0.016, y1 - s.yb - 0.4, 0.02, 0.005), '#111214', mat(x + 0.002, (y1 + s.yb) / 2 - 0.02, zd), 0.2, 0.7);
      }
      // Side skirt trim, luggage bay doors on the coach, side marker lights.
      b.D(chamferBox(0.012, 0.1, L - 3.2, 0.004), '#1a1b1e', mat((loft.sideX(0, s.yb + 0.3) ?? W / 2) + 0.003, s.yb + 0.12, 0), 0, 0.7);
      if (s.coach) {
        for (let k = 0; k < 3; k++) {
          const zz = Z(3.8 + k * 2.1);
          b.D(chamferBox(0.014, 0.75, 1.7, 0.03), '#9ea3a9', mat((loft.sideX(zz, 1.2) ?? W / 2) + 0.004, 1.15, zz), 0.3, 0.5);
        }
      }
      markers(b, W / 2, s.yb + 0.34, Z(1.6), Z(L - 1.0), 5);
      // Wing mirror arm (large).
      b.D(chamferBox(0.04, 0.4, 0.24, 0.01), '#101113', mat(W / 2 + 0.18, s.coach ? 2.2 : 2.0, Z(0.5)), 0.2, 0.5);
      b.D(chamferBox(0.01, 0.34, 0.2, 0.01), '#a9b8c6', mat(W / 2 + 0.2, s.coach ? 2.2 : 2.0, Z(0.5)), 1, 0.04);
    });
    // Rear window, engine louvres, roof hatches and A/C unit.
    b.D(chamferBox(W * 0.7, s.coach ? 0.8 : 0.7, 0.012, 0.03), GLASS, mat(0, H - (s.coach ? 0.85 : 0.75), Z(L) + 0.004 - 0.08), 0.6, 0.08);
    for (let k = 0; k < 6; k++) b.D(chamferBox(W * 0.6, 0.02, 0.012, 0.004), '#101113', mat(0, 0.95 + k * 0.07, Z(L) + 0.002 - 0.1), 0, 0.7);
    b.D(chamferBox(W * 0.5, 0.2, 1.6, 0.06), '#d9dde0', mat(0, H + 0.08, Z(L * 0.62)), 0.1, 0.5);
    b.D(chamferBox(0.9, 0.06, 0.9, 0.02), '#c9ced2', mat(0, H + 0.02, Z(L * 0.28)), 0.1, 0.5);
    // Bumpers.
    b.D(chamferBox(W * 0.99, 0.24, 0.16, 0.05), '#1d1f22', mat(0, s.yb + 0.16, zNose + 0.02), 0.3, 0.6);
    b.D(chamferBox(W * 0.99, 0.24, 0.16, 0.05), '#1d1f22', mat(0, s.yb + 0.16, Z(L) - 0.02), 0.3, 0.6);
  }
  // Lamps.
  b.sym(() => {
    const hf = frame(W * 0.38, s.yb + 0.48, zNose + 0.02, 0.18, 0, -1);
    b.D(chamferBox(0.38, 0.2, 0.06, 0.03), '#16181b', inFrame(hf), 0.8, 0.25);
    b.L2(chamferBox(0.34, 0.16, 0.02, 0.02), LAMP.head, WHITE_LENS, inFrame(hf, 0, 0, 0.032));
    b.anchor('head', new THREE.Vector3(W * 0.38, s.yb + 0.48, zNose - 0.04));
    b.L2(chamferBox(0.1, 0.05, 0.015, 0.005), LAMP.indR, AMBER, inFrame(hf, -0.12, -0.1, 0.034));
    b.anchor('ind', new THREE.Vector3(W * 0.38 + 0.12, s.yb + 0.38, zNose - 0.04));
    truckTail(b, W * 0.4, s.yb + 0.78, Z(L) + 0.0, 0.3, 0.36);
  });
  plate(b, { x: 0, y: s.yb + 0.26, z: zNose - 0.07, face: -1, w: 0.52, h: 0.11, tilt: 0 });
  plate(b, { x: 0, y: s.yb + 0.4, z: Z(L) + 0.012, face: 1, w: 0.52, h: 0.11, tilt: 0 });
  void ribbon;
  void GLOSS_BLACK;
  void BLACK;
  void CHROME;
  void mirror;
}
