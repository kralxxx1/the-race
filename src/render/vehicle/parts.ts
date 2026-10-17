import * as THREE from 'three';
import type { Build, PlateDef } from './build';
import { LAMP, chamferBox, mat, ribbon, type Loft } from './kit';

/** Reusable vehicle parts: lamps, mirrors, arches, panel lines, interior, plates. */

export const BLACK = '#0d0e10';
export const TRIM = '#16171a';
export const GLOSS_BLACK = '#08090b';
export const CHROME = '#d9dde2';
export const FABRIC = '#2b2c30';
export const SKIN = '#8a6650';

export const AMBER = '#ff9a1a';
export const RED = '#c4150f';
export const WHITE_LENS = '#e9eef5';

const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _n = new THREE.Vector3();
const _m = new THREE.Matrix4();

/**
 * Frame on a surface point: local +z along the outward normal, +y up (projected), +x to the right of a viewer
 * looking at the surface from outside. Parts built in that frame read correctly from the outside, and
 * mirrored copies (`Build.sym`) stay correct.
 */
export function frame(px: number, py: number, pz: number, nx: number, ny: number, nz: number): THREE.Matrix4 {
  _n.set(nx, ny, nz).normalize();
  _y.set(0, 1, 0).addScaledVector(_n, -_n.y).normalize();
  if (_y.lengthSq() < 1e-6) _y.set(0, 0, -1);
  _x.crossVectors(_y, _n).normalize();
  return new THREE.Matrix4().copy(_m.makeBasis(_x, _y, _n).setPosition(px, py, pz));
}

/** Compose a local offset in a frame (returns a shared scratch matrix: consume immediately). */
const _o = new THREE.Matrix4();
export function inFrame(f: THREE.Matrix4, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): THREE.Matrix4 {
  return _o.copy(f).multiply(mat(x, y, z, rx, ry, rz));
}

/** Conformal annulus on the +x flank: the dark gap between a tyre and its wheel arch (right side; mirrored by `sym`). */
export function archRing(b: Build, loft: Loft, zc: number, yc: number, rIn: number, rOut: number, yMin: number, color: string = BLACK): void {
  const seg = b.seg(36, 14);
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const rows = 3;
  for (let j = 0; j <= seg; j++) {
    const a = (j / seg) * Math.PI * 2;
    for (let i = 0; i <= rows; i++) {
      const r = rIn + ((rOut - rIn) * i) / rows;
      const z = zc + Math.cos(a) * r;
      const y = Math.max(yMin, yc + Math.sin(a) * r);
      const x = loft.sideX(z, y) ?? loft.sideX(z, yMin + 0.02) ?? 0.8;
      pos.push(x + 0.004, y, z);
      nor.push(1, 0, 0);
    }
  }
  for (let j = 0; j < seg; j++) {
    for (let i = 0; i < rows; i++) {
      const a = j * (rows + 1) + i;
      const c = a + rows + 1;
      idx.push(a, a + 1, c, a + 1, c + 1, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  b.D(g, color, undefined, 0, 0.95);
}

/** Wing mirror (right side; mirrored by `sym`): painted housing, reflective glass and a stalk. */
export function mirror(b: Build, x: number, y: number, z: number, size = 1): void {
  const hs = size;
  b.P(chamferBox(0.19 * hs, 0.12 * hs, 0.11 * hs, 0.04 * hs), mat(x, y, z, 0, 0.12));
  b.D(new THREE.BoxGeometry(0.16 * hs, 0.095 * hs, 0.008), '#a9b8c6', mat(x - 0.004, y, z + 0.056 * hs, 0, 0.12), 1, 0.03);
  b.D(chamferBox(0.08 * hs, 0.05 * hs, 0.09 * hs, 0.015), TRIM, mat(x - 0.12 * hs, y - 0.045 * hs, z - 0.02 * hs));
  if (b.lod === 0) b.L2(new THREE.BoxGeometry(0.05 * hs, 0.012, 0.012), LAMP.indR, AMBER, mat(x + 0.06 * hs, y + 0.045 * hs, z - 0.05 * hs, 0, 0.12));
}

/** Thin dark panel-gap line from a surface path. */
export function gap(b: Build, pts: THREE.Vector3[], nrm: THREE.Vector3[], width = 0.007, color = '#0a0a0b'): void {
  if (b.lod === 1) return;
  b.D(ribbon(pts, nrm, width, 0.0025), color, undefined, 0, 0.9);
}

/** Licence plate anchor (drawn by the global plate renderer) + dark holder. */
export function plate(b: Build, p: PlateDef): void {
  b.set.plates.push(p);
  if (b.lod === 0) b.D(chamferBox(p.w + 0.035, p.h + 0.035, 0.014, 0.004), '#101112', mat(p.x, p.y, p.z - p.face * 0.004, p.tilt * p.face), 0, 0.7);
}

/** Exhaust tailpipe (chrome tip) at the rear. */
export function tailpipe(b: Build, x: number, y: number, z: number, r = 0.035, len = 0.12): void {
  if (b.lod === 1) return;
  b.D(new THREE.CylinderGeometry(r, r, len, 12, 1, true), '#b4b8bd', mat(x, y, z, Math.PI / 2), 1, 0.25);
  b.D(new THREE.CylinderGeometry(r * 0.8, r * 0.8, len * 0.8, 10, 1, true), '#1a1a1a', mat(x, y, z - 0.01, Math.PI / 2), 0.2, 0.8, true);
}

/** Round lamp (fog / projector / reverse) facing local +z: dark housing + emissive lens. */
export function roundLamp(b: Build, f: THREE.Matrix4, x: number, y: number, r: number, ch: number, color: string): void {
  b.D(new THREE.CylinderGeometry(r * 1.2, r * 1.2, 0.02, b.seg(14, 8)), '#1a1c20', inFrame(f, x, y, 0.004, Math.PI / 2), 0.9, 0.3);
  b.L2(new THREE.CylinderGeometry(r, r, 0.02, b.seg(14, 8)), ch, color, inFrame(f, x, y, 0.012, Math.PI / 2));
}

/** Fabric-covered block (seats, console). */
export function seatBlock(b: Build, w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, color: string = FABRIC): void {
  b.D(chamferBox(w, h, d, Math.min(w, h, d) * 0.32), color, mat(x, y, z, rx), 0, 0.9);
}

/** Seated person silhouette (head + shoulders): dark skin and clothes so it reads as a shape. */
export function occupant(b: Build, x: number, headY: number, z: number, shirt = '#2a303a'): void {
  if (b.lod !== 0) return;
  b.D(new THREE.SphereGeometry(0.1, 9, 7), SKIN, mat(x, headY, z, 0, 0, 0, 0.95, 1.12, 1.0), 0, 0.7);
  b.D(new THREE.SphereGeometry(0.104, 8, 6), '#1c1713', mat(x, headY + 0.03, z + 0.018, 0, 0, 0, 1, 0.8, 1), 0, 0.9);
  b.D(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 7), SKIN, mat(x, headY - 0.12, z), 0, 0.7);
  seatBlock(b, 0.42, 0.3, 0.2, x, headY - 0.3, z - 0.02, 0, shirt);
  for (const sx of [-1, 1]) b.D(new THREE.CapsuleGeometry(0.045, 0.26, 2, 6), shirt, mat(x + sx * 0.23, headY - 0.3, z - 0.12, Math.PI / 2.4), 0, 0.9);
}

/** Steering wheel (torus) at an angle. */
export function steeringWheel(b: Build, x: number, y: number, z: number): void {
  if (b.lod !== 0) return;
  b.D(new THREE.TorusGeometry(0.19, 0.016, 5, 16), '#111214', mat(x, y, z, -1.15), 0, 0.6);
}

/** Dashboard slab + instrument hood. */
export function dashboard(b: Build, y: number, z: number, w: number): void {
  if (b.lod !== 0) return;
  b.D(chamferBox(w, 0.16, 0.5, 0.05), '#1d1e21', mat(0, y, z), 0, 0.6);
  b.D(chamferBox(0.34, 0.1, 0.16, 0.04), '#101113', mat(-w * 0.2, y + 0.1, z + 0.08), 0, 0.5);
}

/**
 * Headlight cluster in a surface frame (right side; mirror with `Build.sym`): housing, lens, projector eye,
 * DRL strip and indicator. Outer edge is local −x as seen from the front.
 */
export function headLamp(b: Build, f: THREE.Matrix4, size = 1, tall = 0.12): void {
  const w = 0.46 * size;
  b.D(chamferBox(w, tall, 0.06, 0.03), '#1b1d21', inFrame(f), 0.9, 0.25);
  b.L2(chamferBox(w * 0.92, tall * 0.82, 0.02, 0.018), LAMP.head, WHITE_LENS, inFrame(f, 0, 0, 0.032));
  if (b.lod === 0) {
    b.D(new THREE.CylinderGeometry(0.042 * size, 0.042 * size, 0.02, 12), '#08090b', inFrame(f, w * 0.2, 0, 0.038, Math.PI / 2), 0.9, 0.1);
    b.L2(new THREE.CylinderGeometry(0.026 * size, 0.026 * size, 0.02, 10), LAMP.head, '#ffffff', inFrame(f, w * 0.2, 0, 0.047, Math.PI / 2));
    b.L2(chamferBox(w * 0.74, 0.012, 0.01, 0.004), LAMP.aux, '#f2f6ff', inFrame(f, 0, tall * 0.33, 0.044));
    b.L2(chamferBox(w * 0.28, 0.022, 0.01, 0.006), LAMP.indR, AMBER, inFrame(f, -w * 0.3, -tall * 0.27, 0.044));
  }
  const p = new THREE.Vector3().setFromMatrixPosition(f);
  // Viewer-right is −x of the car for a front-facing right lamp: the outer indicator sits at +x.
  b.anchor('head', new THREE.Vector3(p.x, p.y, p.z - 0.04));
  b.anchor('ind', new THREE.Vector3(p.x + w * 0.3, p.y - tall * 0.27, p.z - 0.05));
}

/** Rear lamp cluster in a surface frame (right side; mirror with `Build.sym`); outer edge is local +x seen from behind. */
export function tailLamp(b: Build, f: THREE.Matrix4, size = 1, tall = 0.13): void {
  const w = 0.42 * size;
  b.D(chamferBox(w, tall, 0.05, 0.025), '#1a0b0b', inFrame(f), 0.2, 0.4);
  b.L2(chamferBox(w * 0.95, tall * 0.88, 0.02, 0.018), LAMP.tail, RED, inFrame(f, 0, 0, 0.026));
  if (b.lod === 0) {
    b.L2(chamferBox(w * 0.3, tall * 0.3, 0.01, 0.006), LAMP.indR, AMBER, inFrame(f, w * 0.3, -tall * 0.27, 0.036));
    b.L2(chamferBox(w * 0.24, tall * 0.3, 0.01, 0.006), LAMP.reverse, WHITE_LENS, inFrame(f, -w * 0.3, -tall * 0.27, 0.036));
    b.L2(chamferBox(w * 0.76, 0.014, 0.01, 0.005), LAMP.tail, '#ff6a55', inFrame(f, 0, tall * 0.26, 0.036));
  }
  const p = new THREE.Vector3().setFromMatrixPosition(f);
  b.anchor('tail', new THREE.Vector3(p.x, p.y, p.z + 0.04));
  b.anchor('ind', new THREE.Vector3(p.x + w * 0.3, p.y - tall * 0.27, p.z + 0.05));
}

/**
 * Wheel house behind an arch opening (right side; mirror with `Build.sym`): a dark liner following the opening's
 * upper rim inward to x0 and a closing disc, so the arch reads as a deep dark well around the tyre.
 */
export function wheelHouse(b: Build, loft: Loft, zc: number, yc: number, r: number, x0: number, ySill: number, color = '#0a0b0c'): void {
  const seg = b.seg(26, 10);
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const a0 = -0.5;
  const a1 = Math.PI + 0.5;
  const ring: [number, number][] = [];
  for (let i = 0; i <= seg; i++) {
    const a = a0 + ((a1 - a0) * i) / seg;
    ring.push([zc + Math.cos(a) * r, Math.max(ySill, yc + Math.sin(a) * r)]);
  }
  const want = new THREE.Vector3();
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  const C = new THREE.Vector3();
  const tri = (pa: number[], pb: number[], pc: number[], nx: number, ny: number, nz: number) => {
    A.set(pa[0], pa[1], pa[2]);
    B.set(pb[0], pb[1], pb[2]);
    C.set(pc[0], pc[1], pc[2]);
    want.set(nx, ny, nz);
    const n = B.clone().sub(A).cross(C.clone().sub(A));
    const k = pos.length / 3;
    const order = n.dot(want) >= 0 ? [pa, pb, pc] : [pa, pc, pb];
    for (const q of order) {
      pos.push(q[0], q[1], q[2]);
      nor.push(nx, ny, nz);
    }
    idx.push(k, k + 1, k + 2);
  };
  for (let i = 0; i < seg; i++) {
    const [z0, y0] = ring[i];
    const [z1, y1] = ring[i + 1];
    const xo0 = (loft.sideX(z0, y0) ?? x0 + 0.25) - 0.004;
    const xo1 = (loft.sideX(z1, y1) ?? x0 + 0.25) - 0.004;
    // Face the wheel centre.
    const zm = (z0 + z1) / 2 - zc;
    const ym = (y0 + y1) / 2 - yc;
    const l = Math.hypot(zm, ym) || 1;
    const nz = -zm / l;
    const ny = -ym / l;
    tri([xo0, y0, z0], [xo1, y1, z1], [x0, y0, z0], 0, ny, nz);
    tri([xo1, y1, z1], [x0, y1, z1], [x0, y0, z0], 0, ny, nz);
    // Closing disc facing outward.
    tri([x0, yc, zc], [x0, y0, z0], [x0, y1, z1], 1, 0, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  b.D(g, color, undefined, 0, 0.95);
}
