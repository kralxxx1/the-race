import * as THREE from 'three';
import { GeoBuilder, mul, rgb, type RGB } from './kit';

/**
 * Geometry of the small instanced roadside props (lamps, poles, parked cars, fences, benches…).
 * All are authored at the origin standing on y = 0 with the front facing −z, and baked with vertex
 * colours so one material per prop family is enough.
 */

const METAL: RGB = rgb('#6c7278');
const METAL_DARK: RGB = rgb('#3d4247');
const GALV: RGB = rgb('#9aa2a8');

export type LampStyle = 'led' | 'sodium' | 'highmast' | 'garden';

export interface LampParts {
  pole: THREE.BufferGeometry;
  head: THREE.BufferGeometry;
  /** Where the light sits relative to the base (x towards the road along +x of the prop frame). */
  lightAt: [number, number, number];
  /** Pool size on the ground (metres). */
  pool: [number, number];
}

/** Street lamp: the arm reaches towards −x so a prop yawed to face the road leans over the carriageway. */
export function lampGeometry(style: LampStyle): LampParts {
  const pole = new GeoBuilder();
  const head = new GeoBuilder();
  if (style === 'highmast') {
    pole.frustum(0, 0, 0, 0.32, 0.18, 24, 10, { color: GALV });
    pole.frustum(0, 24, 0, 0.5, 0.5, 0.5, 8, { color: METAL_DARK }, true);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      pole.limb([0, 23.8, 0], [Math.cos(a) * 1.6, 24.4, Math.sin(a) * 1.6], 0.05, 0.05, 4, { color: METAL_DARK });
      head.box(Math.cos(a) * 1.6, 24.35, Math.sin(a) * 1.6, 0.75, 0.12, 0.5, { color: rgb('#fff1d6') });
    }
    return { pole: pole.build(), head: head.build(), lightAt: [0, 24.2, 0], pool: [34, 34] };
  }
  const h = style === 'garden' ? 4.2 : style === 'led' ? 8.6 : 10.2;
  const reach = style === 'garden' ? 0.9 : style === 'led' ? 2.1 : 2.6;
  const base = style === 'garden' ? 0.14 : 0.2;
  pole.frustum(0, 0, 0, base, base * 0.55, h, 8, { color: style === 'garden' ? METAL_DARK : GALV });
  pole.frustum(0, 0, 0, base * 1.6, base * 1.2, 0.5, 8, { color: METAL_DARK }, true);
  // Curved arm: three segments sweeping outwards and slightly up.
  const pts: [number, number, number][] = [[0, h - 0.4, 0], [-reach * 0.45, h + 0.05, 0], [-reach * 0.85, h + 0.12, 0], [-reach, h + 0.06, 0]];
  for (let i = 0; i < pts.length - 1; i++) pole.limb(pts[i], pts[i + 1], base * 0.4, base * 0.34, 5, { color: GALV });
  if (style === 'garden') {
    head.frustum(-reach, h - 0.2, 0, 0.16, 0.2, 0.34, 8, { color: rgb('#fff3dc') }, true);
  } else {
    pole.box(-reach, h + 0.12, 0, style === 'led' ? 0.95 : 0.8, 0.16, 0.34, { color: METAL_DARK });
    head.box(-reach, h + 0.01, 0, style === 'led' ? 0.85 : 0.7, 0.05, 0.28, { color: style === 'led' ? rgb('#eef4ff') : rgb('#ffb867') });
  }
  return { pole: pole.build(), head: head.build(), lightAt: [-reach, h, 0], pool: style === 'garden' ? [7, 7] : [15, 12] };
}

/** Concrete (or wooden) utility pole with cross-arms and insulators; ~9 m. */
export function utilityPoleGeometry(wood: boolean, arms = 2): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const h = 9.2;
  const col = wood ? rgb('#6b4f35') : rgb('#9b9a94');
  b.frustum(0, 0, 0, wood ? 0.15 : 0.19, wood ? 0.1 : 0.12, h, 8, { color: col, uvPerM: 0 });
  for (let a = 0; a < arms; a++) {
    const y = h - 0.5 - a * 0.9;
    b.box(0, y, 0, 2.5 - a * 0.5, 0.1, 0.1, { color: wood ? rgb('#5a4129') : METAL });
    for (const x of [-1, -0.5, 0.5, 1]) {
      if (Math.abs(x) > (2.5 - a * 0.5) / 2) continue;
      b.frustum(x * (1 - a * 0.1), y + 0.05, 0, 0.04, 0.05, 0.2, 5, { color: rgb('#c9c3b6') });
    }
  }
  return b.build();
}

/** Lattice high-voltage pylon (~26 m): four tapered legs, cross braces and three arm levels. */
export function pylonGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const steel: RGB = rgb('#8e969c');
  const H = 26;
  const legs: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const half = (y: number) => 3.2 * (1 - y / (H * 1.25));
  for (let i = 0; i < 4; i++) {
    const [lx, lz] = legs[i];
    b.limb([lx * half(0), 0, lz * half(0)], [lx * half(H * 0.78), H * 0.78, lz * half(H * 0.78)], 0.1, 0.07, 4, { color: steel });
  }
  const levels = [4, 8, 12, 16, 20];
  for (const y of levels) {
    const hw = half(y);
    const hw2 = half(y + 4);
    for (let i = 0; i < 4; i++) {
      const [ax, az] = legs[i];
      const [bx, bz] = legs[(i + 1) % 4];
      b.limb([ax * hw, y, az * hw], [bx * hw, y, bz * hw], 0.035, 0.035, 3, { color: steel });
      b.limb([ax * hw, y, az * hw], [bx * hw2, y + 4, bz * hw2], 0.03, 0.03, 3, { color: steel });
    }
  }
  // Cross arms with insulator strings.
  for (const [y, len] of [[H * 0.76, 5.2], [H * 0.62, 6.6], [H * 0.48, 5.2]] as const) {
    b.box(0, y, 0, len * 2, 0.16, 0.16, { color: steel });
    for (const sgn of [-1, 1]) {
      b.limb([sgn * len, y, 0], [sgn * (len - 0.1), y - 2.2, 0], 0.05, 0.05, 4, { color: rgb('#b8c4a8') });
      b.limb([sgn * len, y + 0.05, 0], [sgn * (len * 0.5), y + 1.3, 0], 0.03, 0.03, 3, { color: steel });
    }
  }
  b.frustum(0, H * 0.78, 0, 0.12, 0.05, 2.2, 5, { color: steel });
  return b.build();
}

export interface CarColors {
  paint: RGB;
}

/** Compact parked car (hatchback/sedan proportions) ~4.1 m, with glass and wheels baked into vertex colours. */
export function carGeometry(paint: RGB, kind: 'hatch' | 'sedan' | 'suv' = 'hatch'): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const glass = rgb('#141c24');
  const tyre = rgb('#17181a');
  const L = kind === 'suv' ? 4.6 : kind === 'sedan' ? 4.5 : 4.0;
  const W = kind === 'suv' ? 1.88 : 1.74;
  const bodyH = kind === 'suv' ? 0.95 : 0.7;
  const roofH = kind === 'suv' ? 1.72 : 1.46;
  // Lower body and tapered cabin.
  b.box(0, 0.28 + bodyH / 2, 0, W, bodyH, L, { color: paint });
  const cabLen = kind === 'sedan' ? L * 0.45 : L * 0.56;
  const cz = kind === 'sedan' ? 0.1 : 0.35;
  b.box(0, (0.28 + bodyH + roofH) / 2, cz, W * 0.9, roofH - 0.28 - bodyH, cabLen, { color: paint });
  // Glasshouse: dark panels slightly proud of the cabin sides, front and back.
  const gy = (0.28 + bodyH + roofH) / 2 - 0.02;
  const gh = roofH - 0.28 - bodyH - 0.2;
  b.box(0, gy, cz, W * 0.9 + 0.03, gh, cabLen - 0.5, { color: glass });
  b.box(0, gy, cz - cabLen / 2, W * 0.86, gh, 0.04, { color: glass });
  b.box(0, gy, cz + cabLen / 2, W * 0.86, gh, 0.04, { color: glass });
  // Bumpers, lights and plates.
  b.box(0, 0.42, -L / 2 - 0.03, W + 0.02, 0.28, 0.1, { color: mul(paint, 0.55) });
  b.box(0, 0.42, L / 2 + 0.03, W + 0.02, 0.28, 0.1, { color: mul(paint, 0.55) });
  for (const sx of [-1, 1]) {
    b.box(sx * (W / 2 - 0.3), 0.68, -L / 2 - 0.01, 0.4, 0.14, 0.05, { color: rgb('#f2efe2') });
    b.box(sx * (W / 2 - 0.3), 0.7, L / 2 + 0.01, 0.4, 0.12, 0.05, { color: rgb('#a01818') });
  }
  // Wheels (cylinders along x).
  for (const [wx, wz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    b.push(wx * (W / 2 - 0.12), 0.31, wz * (L / 2 - 0.85), 0, 0, Math.PI / 2);
    b.frustum(0, -0.12, 0, 0.31, 0.31, 0.24, 10, { color: tyre }, true);
    b.pop();
  }
  return b.build();
}

/** Low garden wall with a wrought-iron railing (4 m segment, along x). */
export function gardenFenceGeometry(wall: RGB): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.box(0, 0.3, 0, 4, 0.6, 0.22, { color: wall, uvPerM: 0.35 });
  b.box(0, 0.64, 0, 4.04, 0.07, 0.28, { color: mul(wall, 0.9) });
  const iron = rgb('#2f3235');
  for (let i = 0; i <= 12; i++) b.box(-2 + (i * 4) / 12, 1.05, 0, 0.025, 0.85, 0.025, { color: iron });
  b.box(0, 1.46, 0, 4, 0.04, 0.04, { color: iron });
  b.box(0, 0.78, 0, 4, 0.03, 0.03, { color: iron });
  for (const x of [-2, 0, 2]) b.box(x, 0.85, 0, 0.26, 1.7, 0.26, { color: wall, uvPerM: 0.35 });
  return b.build();
}

/** Park bench: slatted seat and back on two cast ends. */
export function benchGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const wood = rgb('#7a5636');
  for (let i = 0; i < 4; i++) b.box(0, 0.45, -0.18 + i * 0.12, 1.7, 0.04, 0.09, { color: wood });
  for (let i = 0; i < 3; i++) b.box(0, 0.72 + i * 0.12, 0.28, 1.7, 0.09, 0.03, { color: wood });
  for (const x of [-0.75, 0.75]) {
    b.box(x, 0.22, 0, 0.06, 0.45, 0.5, { color: METAL_DARK });
    b.box(x, 0.65, 0.27, 0.06, 0.8, 0.06, { color: METAL_DARK });
  }
  return b.build();
}

export function binGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.frustum(0, 0, 0, 0.26, 0.3, 0.85, 10, { color: rgb('#3f5a47') }, true);
  b.frustum(0, 0.85, 0, 0.3, 0.3, 0.06, 10, { color: METAL_DARK }, true);
  return b.build();
}

/** Post-box style mailbox on a short post. */
export function mailboxGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.box(0, 0.45, 0, 0.08, 0.9, 0.08, { color: METAL_DARK });
  b.box(0, 1.0, 0, 0.36, 0.28, 0.2, { color: rgb('#b02a2a') });
  return b.build();
}

/** Round concrete bollard / traffic cone family used by industrial sites. */
export function coneGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.box(0, 0.02, 0, 0.4, 0.04, 0.4, { color: rgb('#1d1d1d') });
  b.frustum(0, 0.04, 0, 0.17, 0.04, 0.62, 10, { color: rgb('#ee5a1a') }, true);
  b.frustum(0, 0.3, 0, 0.115, 0.098, 0.09, 10, { color: rgb('#f2f2ee') });
  return b.build();
}

/** Sodium/LED lamp materials get their lit colour from the head geometry's vertex colours. */
export function lampHeadMaterial(on: boolean): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true });
  if (!on) m.color.setScalar(0.55);
  else m.color.setScalar(1.7);
  return m;
}
