import * as THREE from 'three';
import { LAMP, chamferBox, mat, ribbon } from './kit';
import { BLACK, CHROME, GLOSS_BLACK, TRIM } from './parts';
import type { CarCtx, CarSpec } from './cars';

/**
 * Van family (panel van, minibus / dolmuş, ambulance): a car front half with a tall solid box behind
 * the doors. They reuse the car builder with a cab-forward profile and add their own box details.
 */

const GLASS_DARK = '#080c11';

export const VAN: CarSpec = {
  axleF: 0.95,
  wheelbase: 3.3,
  R: 0.34,
  tw: 0.215,
  yb: [[0, 0.4], [0.12, 0.32], [0.45, 0.26], [1.0, 0.23], [4.7, 0.23], [5.1, 0.28], [5.3, 0.36]],
  yt: [
    [0, 0.88], [0.06, 0.95], [0.3, 1.0], [0.8, 1.06], [1.1, 1.12], [1.3, 1.16], [1.85, 1.2],
    [2.05, 1.6], [2.2, 2.0], [2.4, 2.07], [5.0, 2.08], [5.22, 2.06], [5.3, 1.98],
  ],
  planF: [[0, 0.84], [0.08, 0.88], [0.3, 0.94], [0.7, 0.98], [1.1, 1]],
  planR: [[0, 0.95], [0.06, 0.97], [0.2, 0.995], [0.4, 1]],
  n: [[0, 4.4], [0.3, 4.8], [1.3, 5], [2.1, 5.5], [3, 6], [5, 6], [5.3, 6]],
  belt: 1.2,
  roof: 2.06,
  gh: [
    [1.15, 1.15, 0.95],
    [1.4, 1.52, 0.94],
    [1.78, 1.97, 0.93],
    [2.1, 2.06, 0.93],
    [2.3, 2.06, 0.93],
  ],
  ghPinch: 0.92,
  ghN: 3.6,
  cowl: 1.15,
  roofF: 1.9,
  roofR: 2.3,
  rearBase: 2.3,
  bPillar: 1.95,
  hatch: true,
  roofHalf: 0.5,
  seatF: 1.95,
  seatR: 2.2,
  headY: 0.9,
  tailY: 1.0,
  plateRearY: 0.62,
  plateFrontY: 0.5,
  grilleY: 0.66,
  tailTall: 0.4,
  van: true,
};

export const MINIBUS: CarSpec = {
  ...VAN,
  axleF: 1.0,
  wheelbase: 3.65,
  R: 0.355,
  tw: 0.225,
  yb: [[0, 0.4], [0.12, 0.32], [0.45, 0.26], [1.0, 0.24], [5.2, 0.24], [5.6, 0.28], [5.9, 0.38]],
  yt: [
    [0, 0.9], [0.06, 0.97], [0.3, 1.02], [0.8, 1.08], [1.1, 1.14], [1.3, 1.18], [1.85, 1.25],
    [2.05, 1.7], [2.2, 2.45], [2.4, 2.55], [5.6, 2.56], [5.8, 2.54], [5.9, 2.45],
  ],
  belt: 1.25,
  roof: 2.55,
  gh: [
    [1.15, 1.2, 0.95],
    [1.4, 1.6, 0.94],
    [1.78, 2.2, 0.93],
    [2.1, 2.55, 0.93],
    [2.3, 2.55, 0.93],
  ],
  headY: 0.92,
  tailY: 1.0,
  tailTall: 0.45,
  plateRearY: 0.62,
};

export const AMBULANCE: CarSpec = { ...MINIBUS, plateRearY: 0.6 };

/** Panel / minibus box: rear doors, sliding door, bumper step, windows. */
export function vanExtras(c: CarCtx, windows: 'none' | 'band' = 'none'): void {
  const { b, s, Z, flank, body } = c;
  const W = b.W;
  const L = b.L;
  const rz = Z(L);
  const roof = s.roof;
  if (b.lod === 0) {
    // Rear doors: centre seam, hinge lines, two dark panes and chrome-free black handles.
    const yTop = roof - 0.12;
    const pts = [new THREE.Vector3(0, 0.58, rz + 0.004), new THREE.Vector3(0, yTop, rz + 0.004)];
    b.D(ribbon(pts, pts.map(() => new THREE.Vector3(0, 0, 1)), 0.012, 0), '#0a0a0b', undefined, 0, 0.8, true);
    b.sym(() => {
      b.D(chamferBox(0.62, 0.62, 0.012, 0.03), GLASS_DARK, mat(W * 0.2 + 0.0, roof - 0.62, rz + 0.002), 0.6, 0.1);
      b.D(chamferBox(0.03, 0.14, 0.03, 0.008), TRIM, mat(0.05, roof - 1.2, rz + 0.012), 0.2, 0.6);
    });
    // Bumper: black step across the rear.
    b.D(chamferBox(W * 0.98, 0.22, 0.14, 0.05), BLACK, mat(0, 0.46, rz - 0.04), 0, 0.8);
    b.D(chamferBox(W * 0.52, 0.03, 0.2, 0.01), '#2a2c30', mat(0, 0.58, rz - 0.05), 0.4, 0.7);
    // Sliding door on the right flank (+x): outline and handle.
    const z0 = Z(2.4);
    const z1 = Z(L - 1.35);
    const yT = roof - 0.2;
    const yB = 0.5;
    const path: THREE.Vector3[] = [];
    for (const [z, y] of [[z0, yB], [z0, yT], [z1, yT], [z1, yB], [z0, yB]] as const) path.push(flank(body, z, y, 0.003));
    // Outline as four straight ribbons.
    for (let k = 0; k < 4; k++) {
      const a = path[k];
      const e = path[k + 1];
      const mid = a.clone().add(e).multiplyScalar(0.5);
      b.D(ribbon([a, mid, e], [a, mid, e].map(() => new THREE.Vector3(1, 0, 0)), 0.012, 0), '#0a0a0b', undefined, 0, 0.8);
    }
    b.D(chamferBox(0.02, 0.05, 0.22, 0.008), TRIM, mat((body.sideX((z0 + z1) / 2, roof - 1.0) ?? W / 2) + 0.008, roof - 1.0, z0 + 0.35), 0.3, 0.6);
    // Roof ribs.
    for (let k = 0; k < 5; k++) b.D(chamferBox(W * 0.7, 0.012, 0.05, 0.004), '#1d1f22', mat(0, roof + 0.002, Z(2.7 + k * ((L - 3.4) / 4))), 0, 0.7);
  }
  if (windows === 'band') {
    // Minibus side glazing: a dark glossy band split by body-coloured pillars.
    const z0 = Z(2.35);
    const z1 = Z(L - 0.45);
    const y0 = roof - 1.2;
    const y1 = roof - 0.28;
    b.sym(() => {
      const segs = 6;
      for (let k = 0; k < segs; k++) {
        const za = z0 + ((z1 - z0) * k) / segs + 0.04;
        const zb = z0 + ((z1 - z0) * (k + 1)) / segs - 0.04;
        const xa = (body.sideX((za + zb) / 2, (y0 + y1) / 2) ?? W / 2) + 0.004;
        b.D(chamferBox(0.01, y1 - y0, zb - za, 0.03), GLASS_DARK, mat(xa, (y0 + y1) / 2, (za + zb) / 2), 0.6, 0.08);
      }
    });
    // Rear and rooftop air-conditioning hump.
    b.D(chamferBox(W * 0.5, 0.12, 0.9, 0.05), '#d9dde0', mat(0, roof + 0.06, Z(L * 0.55)), 0, 0.5);
  }
  void CHROME;
  void GLOSS_BLACK;
}

/** Ambulance: red/orange side stripes, a blue Star-of-Life roundel, blue beacons and roof bar. */
export function ambulanceExtras(c: CarCtx): void {
  const { b, s, Z, flank, body } = c;
  const L = b.L;
  vanExtras(c, 'none');
  const roof = s.roof;
  if (b.lod === 0) {
    const z0 = Z(2.45);
    const z1 = Z(L - 0.1);
    b.sym(() => {
      for (const [y, w, color] of [[roof - 1.0, 0.14, '#d1281d'], [roof - 1.19, 0.05, '#f2a30f']] as const) {
        const pts: THREE.Vector3[] = [];
        for (let k = 0; k <= 12; k++) pts.push(flank(body, z0 + ((z1 - z0) * k) / 12, y, 0.004));
        b.D(ribbon(pts, pts.map(() => new THREE.Vector3(1, 0, 0)), w, 0), color, undefined, 0.2, 0.4);
      }
      // Star-of-Life roundel.
      const zr = Z(L * 0.62);
      const x = (body.sideX(zr, roof - 0.55) ?? b.W / 2) + 0.006;
      b.D(new THREE.CylinderGeometry(0.2, 0.2, 0.006, 20), '#1d4fb8', mat(x, roof - 0.55, zr, 0, 0, Math.PI / 2), 0.1, 0.4);
      for (let k = 0; k < 3; k++) b.D(chamferBox(0.03, 0.3, 0.05, 0.008), '#f4f5f7', mat(x + 0.004, roof - 0.55, zr, (k * Math.PI) / 3), 0, 0.4);
    });
    // Rear red band.
    b.D(chamferBox(b.W * 0.9, 0.12, 0.01, 0.003), '#d1281d', mat(0, roof - 1.45, Z(L) + 0.004), 0.2, 0.4);
  }
  const y = roof + 0.07;
  const z = Z(2.2);
  b.D(chamferBox(1.2, 0.07, 0.28, 0.03), '#e8eaec', mat(0, y - 0.02, z), 0.3, 0.4);
  b.L2(chamferBox(0.54, 0.08, 0.24, 0.03), LAMP.beaconA, '#2a5bff', mat(-0.31, y + 0.04, z));
  b.L2(chamferBox(0.54, 0.08, 0.24, 0.03), LAMP.beaconB, '#3a6bff', mat(0.31, y + 0.04, z));
  b.anchor('beacon', new THREE.Vector3(-0.31, y + 0.08, z));
  b.anchor('beacon', new THREE.Vector3(0.31, y + 0.08, z));
}
