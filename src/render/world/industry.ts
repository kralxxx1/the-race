import * as THREE from 'three';
import type { Rng } from '../../core/math';
import { GeoBuilder, mul, rgb, type RGB } from './kit';
import type { ChunkBuild } from './scenery';

/**
 * Industrial props and building authoring: chimneys, cooling towers, tanks, silos, container stacks,
 * quay cranes, pipe racks, fences and factory halls. Props stand on y = 0 with their front towards −z so
 * they instance cheaply; halls and sheds are merged into the chunk statics.
 */

const STEEL: RGB = rgb('#7a8289');
const STEEL_DARK: RGB = rgb('#3d4247');
const CONC: RGB = rgb('#bdbab2');
const WHITE: RGB = rgb('#eceae4');
const RED: RGB = rgb('#c4382c');

/** Brick-and-concrete chimney with red/white aviation bands, work platforms and a flared cap. */
export function chimneyGeometry(height: number, bands = true): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const r0 = height * 0.055;
  const r1 = height * 0.028;
  const segs = 8;
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs;
    const t1 = (i + 1) / segs;
    const red = bands && i >= segs - 3 && i % 2 === 1;
    b.frustum(0, t0 * height, 0, r0 + (r1 - r0) * t0, r0 + (r1 - r0) * t1, height / segs, 14, { color: red ? RED : i < 2 ? mul(CONC, 0.82) : WHITE, uvPerM: 0.1 }, false);
  }
  b.frustum(0, height, 0, r1 * 1.15, r1 * 1.0, 1.4, 14, { color: STEEL_DARK }, true);
  b.frustum(0, height * 0.7, 0, r1 * 1.35, r1 * 1.35, 0.25, 14, { color: STEEL_DARK }, true);
  // Ladder cage up the side.
  b.box(r0 * 0.98, height * 0.45, 0, 0.1, height * 0.9, 0.5, { color: STEEL_DARK });
  return b.build();
}

/** Hyperbolic natural-draught cooling tower: ~90 m tall in the original; scale per instance. */
export function coolingTowerGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const H = 60;
  const rings = 12;
  const radius = (t: number) => 17 - 7.5 * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.62) + 2.2 * t * t;
  for (let i = 0; i < rings; i++) {
    const t0 = i / rings;
    const t1 = (i + 1) / rings;
    b.frustum(0, t0 * H, 0, radius(t0), radius(t1), H / rings, 28, { color: i % 4 === 3 ? mul(CONC, 0.88) : CONC, uvPerM: 0.08 }, false);
  }
  b.frustum(0, H, 0, radius(1) + 0.2, radius(1) + 0.2, 0.9, 28, { color: mul(CONC, 0.7) }, false);
  // Inlet piers around the base.
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    b.box(Math.cos(a) * 17.2, 2.4, Math.sin(a) * 17.2, 0.9, 4.8, 0.9, { color: mul(CONC, 0.75) });
  }
  return b.build();
}

/** Cylindrical storage tank with a floating roof ring, a spiral stair and a pipe at the foot. */
export function tankGeometry(r: number, h: number): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const shell = mul(WHITE, 0.92);
  b.frustum(0, 0, 0, r, r, h, 24, { color: shell, uvPerM: 0.12 }, true);
  b.frustum(0, 0, 0, r + 0.1, r + 0.1, 0.9, 24, { color: STEEL_DARK }, false);
  b.frustum(0, h, 0, r + 0.15, r + 0.15, 0.5, 24, { color: STEEL }, true);
  // Stair: a staircase wrapping a quarter turn up the shell.
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 0.9;
    const a1 = ((i + 1) / n) * Math.PI * 0.9;
    b.limb([Math.cos(a0) * (r + 0.5), (i / n) * h, Math.sin(a0) * (r + 0.5)], [Math.cos(a1) * (r + 0.5), ((i + 1) / n) * h, Math.sin(a1) * (r + 0.5)], 0.08, 0.08, 4, { color: STEEL_DARK });
  }
  b.limb([r, 0.6, 0], [r + 3, 0.6, 2], 0.25, 0.25, 6, { color: STEEL });
  return b.build();
}

/** Four grain/cement silos with a conveyor gallery and a head house. */
export function silosGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const H = 28;
  for (const [x, z] of [[-4.6, -4.6], [4.6, -4.6], [-4.6, 4.6], [4.6, 4.6]] as const) {
    b.frustum(x, 0, z, 4.3, 4.3, H, 20, { color: mul(CONC, 1.05), uvPerM: 0.1 }, true);
    b.frustum(x, H, z, 4.4, 0.5, 1.6, 20, { color: mul(CONC, 0.9) }, true);
  }
  b.box(0, H + 3.4, 0, 12, 4.2, 12, { color: mul(STEEL, 1.1) });
  b.limb([0, H + 4, 0], [28, 6, 0], 1.0, 1.0, 4, { color: STEEL_DARK });
  b.box(30, 2.5, 0, 6, 5, 6, { color: STEEL });
  return b.build();
}

/** Container: 12.2 × 2.6 × 2.4 m corrugated steel box (texture + instance colour give the livery). */
export function containerGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const k = 1 / 1.9;
  b.box(0, 1.3, 0, 2.44, 2.6, 12.2, { color: [1, 1, 1], uvPerM: k }, 0);
  // Door end: frame, locking bars, and corner castings.
  b.box(0, 1.3, 6.11, 2.3, 2.5, 0.05, { color: [0.55, 0.55, 0.55] });
  for (const x of [-0.6, -0.2, 0.2, 0.6]) b.box(x, 1.3, 6.15, 0.05, 2.3, 0.03, { color: [0.25, 0.25, 0.25] });
  for (const [x, y, z] of [[-1.15, 0.12, 6], [1.15, 0.12, 6], [-1.15, 2.48, 6], [1.15, 2.48, 6], [-1.15, 0.12, -6], [1.15, 0.12, -6], [-1.15, 2.48, -6], [1.15, 2.48, -6]] as const) b.box(x, y, z, 0.16, 0.16, 0.16, { color: [0.3, 0.3, 0.3] });
  return b.build();
}

/** Ship-to-shore quay crane: portal legs, machinery house, an out-reaching boom with stays and an A-frame. */
export function quayCraneGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const blue: RGB = rgb('#2f5a93');
  const grey: RGB = rgb('#aab2b8');
  const yellow: RGB = rgb('#e2b021');
  const H = 32;
  for (const [x, z] of [[-8, -9], [8, -9], [-8, 9], [8, 9]] as const) {
    b.box(x, H / 2, z, 1.5, H, 1.5, { color: blue });
    b.box(x, 1.0, z, 2.6, 2, 2.6, { color: grey });
  }
  for (const z of [-9, 9]) b.box(0, H, z, 18, 1.8, 1.6, { color: blue });
  for (const x of [-8, 8]) b.box(x, H, 0, 1.6, 1.8, 20, { color: blue });
  b.box(0, H + 2.6, 7, 12, 4.5, 10, { color: grey });
  // Boom: reaches 60 m over the water (−z) with a back reach of 16 m; A-frame mast at the portal.
  b.box(0, H + 1.6, -22, 2.8, 2.8, 76, { color: blue });
  for (const x of [-3, 3]) b.limb([x, H, 0], [x * 0.35, H + 22, 2], 0.4, 0.3, 4, { color: blue });
  for (const x of [-1.4, 1.4]) {
    b.limb([x * 0.35, H + 22, 2], [x, H + 3, -58], 0.1, 0.1, 3, { color: STEEL_DARK });
    b.limb([x * 0.35, H + 22, 2], [x, H + 3, 14], 0.1, 0.1, 3, { color: STEEL_DARK });
  }
  b.box(0, H - 3.5, -30, 3.4, 1.4, 4, { color: yellow });
  b.limb([0, H - 4, -30], [0, 10, -30], 0.04, 0.04, 3, { color: STEEL_DARK });
  b.box(0, 9, -30, 2.4, 0.3, 12, { color: STEEL_DARK });
  return b.build();
}

/** Tower crane on a construction or yard site: lattice mast, jib with trolley, counter-jib with ballast. */
export function towerCraneGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const yellow: RGB = rgb('#e8b520');
  const H = 46;
  for (const [x, z] of [[-0.9, -0.9], [0.9, -0.9], [0.9, 0.9], [-0.9, 0.9]] as const) b.box(x, H / 2, z, 0.18, H, 0.18, { color: yellow });
  for (let y = 1; y < H; y += 2.2) {
    b.box(0, y, -0.9, 1.8, 0.08, 0.08, { color: yellow });
    b.box(0, y, 0.9, 1.8, 0.08, 0.08, { color: yellow });
    b.box(-0.9, y, 0, 0.08, 0.08, 1.8, { color: yellow });
    b.box(0.9, y, 0, 0.08, 0.08, 1.8, { color: yellow });
  }
  b.box(0, H + 1.5, 0, 2.6, 2.2, 2.6, { color: mul(yellow, 0.9) });
  b.box(0, H + 2.4, -22, 1.4, 1.6, 46, { color: yellow });
  b.box(0, H + 2.2, 11, 1.2, 1.4, 18, { color: yellow });
  b.box(0, H + 0.9, 17, 2.4, 2.6, 3.4, { color: STEEL_DARK });
  b.limb([0, H + 8, 0], [0, H + 2.6, -42], 0.06, 0.06, 3, { color: STEEL_DARK });
  b.limb([0, H + 8, 0], [0, H + 2.4, 16], 0.06, 0.06, 3, { color: STEEL_DARK });
  b.box(0, H + 5.2, 0, 0.9, 6.5, 0.9, { color: yellow });
  b.box(0, H + 1.4, -24, 1.3, 1.0, 1.6, { color: STEEL_DARK });
  b.limb([0, H + 1.4, -24], [0, 4, -24], 0.03, 0.03, 3, { color: STEEL_DARK });
  return b.build();
}

/** Refinery flare stack: slim lattice tower with a pilot flame ring (the flame itself is a plume sprite). */
export function flareGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const H = 70;
  b.frustum(0, 0, 0, 1.6, 0.4, H, 8, { color: STEEL }, false);
  for (const a of [0, 2.1, 4.2]) b.limb([Math.cos(a) * 3, 0, Math.sin(a) * 3], [0, H * 0.7, 0], 0.12, 0.08, 4, { color: STEEL_DARK });
  b.frustum(0, H, 0, 0.7, 0.55, 1.6, 8, { color: STEEL_DARK }, true);
  return b.build();
}

/** Elevated pipe rack segment (8 m along z): trestle frames and a bundle of pipes with a catwalk. */
export function pipeRackGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const pipes: RGB[] = [rgb('#8d949b'), rgb('#c9a02c'), rgb('#6b8a62'), rgb('#9aa2a8')];
  for (const x of [-1.6, 1.6]) b.box(x, 2.4, 0, 0.3, 4.8, 0.3, { color: STEEL_DARK });
  b.box(0, 4.7, 0, 3.8, 0.25, 0.3, { color: STEEL_DARK });
  pipes.forEach((c, i) => {
    const x = -1.35 + i * 0.9;
    b.push(x, 5.05, 0, 0, Math.PI / 2, 0);
    b.frustum(0, -4, 0, 0.26 + (i % 2) * 0.08, 0.26 + (i % 2) * 0.08, 8, 8, { color: c }, false);
    b.pop();
  });
  b.box(0, 5.5, 0, 3.4, 0.05, 8, { color: STEEL });
  return b.build();
}

/** Chain-link fence panel (4 m along x): posts, rails and a wire mesh drawn as fine rails. */
export function fenceGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const post = rgb('#6b7076');
  const wire = rgb('#9aa0a6');
  for (const x of [-2, 2]) b.box(x, 1.1, 0, 0.07, 2.2, 0.07, { color: post });
  b.box(0, 2.18, 0, 4, 0.05, 0.05, { color: post });
  b.box(0, 0.08, 0, 4, 0.05, 0.05, { color: post });
  for (let i = 1; i < 14; i++) b.box(0, i * 0.15, 0, 4, 0.012, 0.012, { color: wire });
  for (let i = 0; i <= 20; i++) b.box(-2 + i * 0.2, 1.1, 0, 0.01, 2.1, 0.01, { color: wire });
  return b.build();
}

/** Stack of oil drums on a pallet: a bit of life at the edge of yards. */
export function drumsGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const cols = [rgb('#2b5fa8'), rgb('#b8321f'), rgb('#3d7a46'), rgb('#c9a02c')];
  b.box(0, 0.08, 0, 2.2, 0.16, 1.6, { color: rgb('#8a6a46') });
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) b.frustum(-0.8 + i * 0.5, 0.16, -0.5 + j * 0.5, 0.22, 0.22, 0.88, 10, { color: cols[(i + j) % cols.length] }, true);
  return b.build();
}

export interface HallOptions {
  rng: Rng;
  night: boolean;
  W: number;
  D: number;
  H: number;
  tint: RGB;
  roof: RGB;
}

const GLASS = rgb('#1b2733');

/** Factory hall in the road frame: corrugated walls, low gable roof, clerestory glazing, dock doors, roof vents. */
export function hall(ctx: ChunkBuild, s: number, d: number, side: number, o: HallOptions): void {
  const wall = ctx.stat('metal');
  const roof = ctx.stat('roofm');
  const trim = ctx.stat('trim');
  const lit = ctx.stat('lit');
  const glass = ctx.stat('glass');
  const set: GeoBuilder[] = [wall, roof, trim, lit, glass];
  const p = ctx.local(s, d, 0);
  const y = ctx.localY(ctx.groundY(s, d));
  const yaw = ctx.yaw(s) + ctx.faceRoad(side);
  for (const b of set) b.push(p.x, y, p.z, yaw);
  const { W, D, H, rng } = o;
  const k = ctx.host.worldMats.uv('facade_industrial');
  wall.box(0, (H - 1.4) / 2, 0, W, H + 1.4, D, { color: o.tint, uvPerM: k }, 4 | 8);
  // Roof: low-pitch gable, ridge along x (across the front), plus gable-end fill.
  const rise = Math.min(D * 0.14, 3.4);
  roof.push(0, H, 0, Math.PI / 2);
  wall.push(0, H, 0, Math.PI / 2);
  roof.roofSlopes(0, 0, 0, D, W, rise, 0.4, { color: o.roof, uvPerM: k });
  wall.gableEnds(0, 0, 0, D, W, rise, 0.4, { color: o.tint, uvPerM: k });
  roof.pop();
  wall.pop();
  // Clerestory band under the eaves on the front and rear, lit windows at night.
  const wb = o.night ? lit : glass;
  for (const z of [-D / 2, D / 2]) {
    wb.box(0, H - 1.2, z + (z < 0 ? -0.04 : 0.04), W * 0.82, 0.9, 0.05, { color: o.night ? [1.0, 0.88, 0.62] : GLASS });
    for (let x = -W * 0.4; x <= W * 0.41; x += 4) trim.box(x, H - 1.2, z + (z < 0 ? -0.07 : 0.07), 0.1, 1.0, 0.04, { color: STEEL_DARK });
  }
  // Loading docks on the front (−z): dark doors with yellow guards and a canopy.
  const docks = Math.max(2, Math.floor(W / 11));
  for (let i = 0; i < docks; i++) {
    const x = (i - (docks - 1) / 2) * (W / docks);
    trim.box(x, 2.1, -D / 2 - 0.05, 3.6, 4.2, 0.1, { color: rgb('#23272b') });
    trim.box(x - 1.9, 2.1, -D / 2 - 0.1, 0.18, 4.3, 0.15, { color: rgb('#e2b021') });
    trim.box(x + 1.9, 2.1, -D / 2 - 0.1, 0.18, 4.3, 0.15, { color: rgb('#e2b021') });
    trim.box(x, 4.6, -D / 2 - 1.2, 5, 0.15, 2.4, { color: STEEL });
    if (o.night) lit.box(x, 4.0, -D / 2 - 0.12, 0.7, 0.18, 0.12, { color: [1, 0.9, 0.7] });
  }
  // Rooftop vents along the ridge and an exhaust stack.
  const nv = Math.floor(W / 9);
  for (let i = 0; i < nv; i++) trim.box((i - (nv - 1) / 2) * 9, H + rise + 0.6, 0, 1.8, 1.2, 2.6, { color: STEEL });
  if (rng.chance(0.6)) trim.frustum(rng.range(-W * 0.3, W * 0.3), H + rise - 0.1, rng.range(-D * 0.1, D * 0.1), 0.55, 0.45, 7, 10, { color: rgb('#b8bcc0') }, true);
  // Annex: a lower block on one side with a flat roof.
  if (rng.chance(0.7)) {
    const ax = (rng.chance(0.5) ? 1 : -1) * (W / 2 + 4.5);
    wall.box(ax, (H * 0.55) / 2 - 0.5, 0.2, 9, H * 0.55 + 1, D * 0.65, { color: mul(o.tint, 0.92), uvPerM: k }, 4 | 8);
    roof.box(ax, H * 0.55 + 0.15, 0.2, 9.4, 0.3, D * 0.65 + 0.4, { color: mul(o.roof, 0.85), uvPerM: k });
  }
  for (const b of set) b.pop();
}

/** Muted corporate paints for halls and sheds (tinted over the grey corrugated texture, hence the gain). */
export const HALL_TINTS: readonly RGB[] = [rgb('#c9ccce'), rgb('#9fb4c8'), rgb('#d8d2c2'), rgb('#b9c7b0'), rgb('#c98b78'), rgb('#e4e4e0')].map((c) => mul(c, 5));
export const CONTAINER_TINTS: readonly RGB[] = [
  [1.0, 1.0, 1.0],
  [2.9, 0.55, 0.5],
  [0.5, 0.95, 2.6],
  [2.8, 1.5, 0.4],
  [2.2, 2.2, 2.2],
  [2.8, 2.5, 0.5],
  [1.9, 1.0, 0.6],
  [0.45, 0.8, 1.7],
];
