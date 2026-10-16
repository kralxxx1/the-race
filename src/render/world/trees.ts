import * as THREE from 'three';
import { Rng, clamp } from '../../core/math';
import { GeoBuilder, mix, mul, rgb, type RGB } from './kit';
import type { FoliageKey } from './worldAssets';

/**
 * Procedural trees for the roadside: tapered trunks and branches plus alpha-cut foliage cards
 * textured with real leaf/needle photographs (see tools/build-foliage.py). Every species is built at
 * three levels of detail from the same seed, so swapping LODs does not change the silhouette.
 *
 * Cards carry painted "soft" normals (radial from the crown centre) and per-vertex ambient
 * occlusion, which is what makes a flat sprite cluster light like a volume.
 */

export type TreeId =
  | 'olive'
  | 'plane'
  | 'poplar'
  | 'cypress'
  | 'stonepine'
  | 'redpine'
  | 'spruce'
  | 'palm'
  | 'shrub'
  | 'oleander'
  | 'maki'
  | 'tuft'
  | 'grass';

export type TreeKind = 'broad' | 'conifer' | 'umbrella' | 'palm' | 'shrub' | 'tuft';

export interface TreeSpec {
  id: TreeId;
  kind: TreeKind;
  atlas: FoliageKey;
  /** Total height in metres. */
  height: number;
  trunkR: number;
  /** Height at which the crown starts (fraction of height). */
  crownStart: number;
  /** Crown ellipsoid radii (broad/shrub) or max whorl radius (conifer) in metres. */
  radius: number;
  radiusY?: number;
  /** Card edge length (metres) at LOD 0. */
  card: number;
  /** Foliage card count at LOD 0 (broad/umbrella/shrub/palm) or whorls (conifer). */
  count: number;
  /** Branch cards per whorl (conifer). */
  perWhorl?: number;
  /** Leaf tint (linear rgb multiplier on the photograph). */
  tint: RGB;
  /** Bark tint. */
  bark: RGB;
  /** Atlas cells used (0..7). */
  cells: readonly number[];
  /** Crown/branch droop for conifers (radians). */
  droop?: number;
  lean?: number;
  /** Wind sway amplitude at the tip, metres. */
  sway: number;
  variants: number;
}

export const TREE_SPECS: Readonly<Record<TreeId, TreeSpec>> = {
  olive: { id: 'olive', kind: 'broad', atlas: 'olive', height: 5.2, trunkR: 0.2, crownStart: 0.28, radius: 2.5, radiusY: 1.7, card: 1.75, count: 58, tint: [1.12, 1.12, 1.0], bark: rgb('#a39581'), cells: [0, 1, 2, 3, 4, 5, 6, 7], lean: 0.3, sway: 0.16, variants: 2 },
  plane: { id: 'plane', kind: 'broad', atlas: 'broad', height: 12, trunkR: 0.32, crownStart: 0.42, radius: 4.4, radiusY: 4.2, card: 2.5, count: 78, tint: [0.95, 1.1, 0.78], bark: rgb('#b5aea0'), cells: [0, 1, 2, 3, 4, 5, 6, 7], lean: 0.2, sway: 0.28, variants: 2 },
  poplar: { id: 'poplar', kind: 'broad', atlas: 'broad', height: 19, trunkR: 0.28, crownStart: 0.18, radius: 1.9, radiusY: 8, card: 1.9, count: 90, tint: [1.0, 1.15, 0.78], bark: rgb('#b0a898'), cells: [0, 1, 2, 3, 4, 5, 6, 7], lean: 0.05, sway: 0.32, variants: 1 },
  cypress: { id: 'cypress', kind: 'broad', atlas: 'fir', height: 10, trunkR: 0.18, crownStart: 0.1, radius: 1.05, radiusY: 4.6, card: 1.6, count: 56, tint: [0.7, 0.92, 0.7], bark: rgb('#8a7560'), cells: [0, 1, 2, 3], lean: 0, sway: 0.06, variants: 1 },
  stonepine: { id: 'stonepine', kind: 'umbrella', atlas: 'pine', height: 13, trunkR: 0.34, crownStart: 0.62, radius: 5.2, radiusY: 2.4, card: 2.3, count: 64, tint: [1.0, 1.12, 0.9], bark: rgb('#b9825c'), cells: [0, 1, 2, 3, 4, 5, 6, 7], lean: 0.8, sway: 0.2, variants: 2 },
  redpine: { id: 'redpine', kind: 'umbrella', atlas: 'pine', height: 16, trunkR: 0.3, crownStart: 0.55, radius: 3.8, radiusY: 4.2, card: 2.2, count: 70, tint: [1.0, 1.1, 0.88], bark: rgb('#b87a54'), cells: [0, 1, 2, 3, 4, 5, 6, 7], lean: 0.5, sway: 0.2, variants: 2 },
  spruce: { id: 'spruce', kind: 'conifer', atlas: 'fir', height: 19, trunkR: 0.34, crownStart: 0.1, radius: 3.7, card: 1.0, count: 20, perWhorl: 6, tint: [0.8, 1.0, 0.85], bark: rgb('#6f6458'), cells: [0, 1, 2, 3, 4, 5, 6, 7], droop: 0.38, sway: 0.22, variants: 2 },
  palm: { id: 'palm', kind: 'palm', atlas: 'palm', height: 10, trunkR: 0.26, crownStart: 1, radius: 3.4, card: 4.4, count: 15, tint: [1.0, 1.12, 0.9], bark: rgb('#b3a287'), cells: [0, 1, 2, 3, 4, 5, 6, 7], lean: 0.6, sway: 0.3, variants: 1 },
  shrub: { id: 'shrub', kind: 'shrub', atlas: 'broad', height: 1.5, trunkR: 0.03, crownStart: 0, radius: 1.1, radiusY: 0.7, card: 1.05, count: 18, tint: [0.95, 1.1, 0.82], bark: rgb('#6a5a48'), cells: [0, 1, 2, 3, 4, 5, 6, 7], sway: 0.05, variants: 1 },
  // Mediterranean scrub (maki): low silver-green thorny shrubs.
  maki: { id: 'maki', kind: 'shrub', atlas: 'olive', height: 1.2, trunkR: 0.03, crownStart: 0, radius: 1.0, radiusY: 0.62, card: 1.2, count: 16, tint: [1.0, 1.0, 0.88], bark: rgb('#6a5a48'), cells: [0, 1, 2, 3, 4, 5, 6, 7], sway: 0.05, variants: 1 },
  // Ground cover: crossed upright cards of real grass blades (short tufts and tall clumps).
  tuft: { id: 'tuft', kind: 'tuft', atlas: 'grass', height: 0.7, trunkR: 0, crownStart: 0, radius: 0.55, card: 0.95, count: 5, tint: [0.9, 1.05, 0.7], bark: rgb('#000000'), cells: [0, 1, 2, 3], sway: 0.1, variants: 1 },
  grass: { id: 'grass', kind: 'tuft', atlas: 'grass', height: 1.2, trunkR: 0, crownStart: 0, radius: 0.7, card: 1.45, count: 4, tint: [0.9, 1.05, 0.7], bark: rgb('#000000'), cells: [4, 5, 6, 7], sway: 0.14, variants: 1 },
  oleander: { id: 'oleander', kind: 'shrub', atlas: 'olive', height: 1.9, trunkR: 0.04, crownStart: 0, radius: 0.95, radiusY: 1.0, card: 1.15, count: 22, tint: [1.0, 1.1, 0.95], bark: rgb('#6a5a48'), cells: [0, 1, 2, 3, 4, 5, 6, 7], sway: 0.05, variants: 1 },
};

export interface TreeLod {
  /** Opaque trunk and branches (null when the LOD has none). */
  trunk: THREE.BufferGeometry | null;
  leaves: THREE.BufferGeometry;
  triangles: number;
}

export interface TreeModel {
  spec: TreeSpec;
  variant: number;
  /** LOD 0 (near), 1 (mid), 2 (far). */
  lods: [TreeLod, TreeLod, TreeLod];
}

/** UV rectangle (u0, v0, u1, v1) of atlas cell k in the 4×2 grid. */
export function cellUv(k: number): [number, number, number, number] {
  const col = k % 4;
  const row = Math.floor(k / 4);
  const v1 = 1 - row / 2;
  return [col / 4, v1 - 0.5, (col + 1) / 4, v1];
}

type V3 = [number, number, number];

const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function randUnit(rng: Rng): V3 {
  const z = rng.range(-1, 1);
  const a = rng.range(0, Math.PI * 2);
  const r = Math.sqrt(1 - z * z);
  return [r * Math.cos(a), z, r * Math.sin(a)];
}

interface CardOpts {
  cell: number;
  /** Stem point (bottom centre of the sprite). */
  base: V3;
  /** Direction the sprite's tip points. */
  up: V3;
  /** Width direction (perpendicular to `up`). */
  side: V3;
  size: number;
  /** Width relative to height (cells are square; 1 = full cell width). */
  widthK?: number;
  /** Crown centre and radii for the painted soft normals. */
  center: V3;
  radii: V3;
  /** 0..1: how much the true card normal contributes to the soft normal. */
  cardMix?: number;
  color: RGB;
  /** Vertex-baked occlusion at the stem and at the tip (1 = unoccluded). */
  ao: [number, number];
  /** Wind weight at the stem/tip (0..1). */
  sway: [number, number];
  /** Lift bias of the soft normal (sun-lit tops). */
  lift?: number;
}

/** One leaf/needle sprite as a quad with painted normals. */
function leafCard(b: GeoBuilder, o: CardOpts): void {
  const [u0, v0, u1, v1] = cellUv(o.cell);
  const w = o.size * (o.widthK ?? 1);
  const down = o.size * 0.03;
  const cardN = norm(cross(o.side, o.up));
  const corners: [V3, number, number, number][] = [
    [[o.base[0] - o.side[0] * w * 0.5 - o.up[0] * down, o.base[1] - o.side[1] * w * 0.5 - o.up[1] * down, o.base[2] - o.side[2] * w * 0.5 - o.up[2] * down], u0, v0, 0],
    [[o.base[0] + o.side[0] * w * 0.5 - o.up[0] * down, o.base[1] + o.side[1] * w * 0.5 - o.up[1] * down, o.base[2] + o.side[2] * w * 0.5 - o.up[2] * down], u1, v0, 0],
    [[o.base[0] + o.side[0] * w * 0.5 + o.up[0] * o.size, o.base[1] + o.side[1] * w * 0.5 + o.up[1] * o.size, o.base[2] + o.side[2] * w * 0.5 + o.up[2] * o.size], u1, v1, 1],
    [[o.base[0] - o.side[0] * w * 0.5 + o.up[0] * o.size, o.base[1] - o.side[1] * w * 0.5 + o.up[1] * o.size, o.base[2] - o.side[2] * w * 0.5 + o.up[2] * o.size], u0, v1, 1],
  ];
  const mixK = o.cardMix ?? 0.3;
  const lift = o.lift ?? 0.25;
  const idx: number[] = [];
  for (const [p, u, v, t] of corners) {
    const radial = norm([(p[0] - o.center[0]) / o.radii[0], (p[1] - o.center[1]) / o.radii[1] + lift, (p[2] - o.center[2]) / o.radii[2]]);
    // Face the card normal towards the outside so both faces light alike.
    const s = dot(cardN, radial) >= 0 ? 1 : -1;
    const n = norm([radial[0] * (1 - mixK) + cardN[0] * s * mixK, radial[1] * (1 - mixK) + cardN[1] * s * mixK, radial[2] * (1 - mixK) + cardN[2] * s * mixK]);
    const ao = o.ao[0] + (o.ao[1] - o.ao[0]) * t;
    idx.push(b.vertex(p[0], p[1], p[2], n[0], n[1], n[2], u, v, mul(o.color, ao), o.sway[0] + (o.sway[1] - o.sway[0]) * t));
  }
  b.tri(idx[0], idx[1], idx[2]);
  b.tri(idx[0], idx[2], idx[3]);
}

/** Pick a roll direction for a card whose tip points along `up`: a random perpendicular. */
function sideFor(up: V3, rng: Rng, bias?: V3): V3 {
  let r = bias ?? randUnit(rng);
  let s = cross(up, r);
  if (Math.hypot(s[0], s[1], s[2]) < 0.2) {
    r = [1, 0, 0];
    s = cross(up, r);
  }
  return norm(s);
}

interface LodPlan {
  /** Fraction of the LOD 0 card count. */
  cards: number;
  /** Card scale compensating for fewer cards. */
  scale: number;
  trunkSeg: number;
  branches: number;
}

const LOD_PLANS: [LodPlan, LodPlan, LodPlan] = [
  { cards: 1, scale: 1, trunkSeg: 7, branches: 1 },
  { cards: 0.38, scale: 1.45, trunkSeg: 5, branches: 0.5 },
  { cards: 0.14, scale: 2.1, trunkSeg: 4, branches: 0 },
];

function leafColor(spec: TreeSpec, rng: Rng, k = 0.1): RGB {
  const j = 1 + (rng.float() - 0.5) * 2 * k;
  const warm = rng.float() * 0.1;
  return [spec.tint[0] * j * (1 + warm), spec.tint[1] * j, spec.tint[2] * j * (1 - warm)];
}

/** Curved trunk polyline from the ground to `top`, leaning by `lean` metres. */
function trunkPath(spec: TreeSpec, rng: Rng, topY: number, segs: number): V3[] {
  const lean = (spec.lean ?? 0) * (0.6 + rng.float() * 0.8);
  const dir = rng.range(0, Math.PI * 2);
  const out: V3[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const bend = Math.sin(t * Math.PI * 0.9) * lean * (spec.kind === 'umbrella' ? 1.4 : 1);
    const wob = Math.sin(t * 7 + rng.float() * 0.3) * 0.04 * spec.height * 0.15 * (spec.kind === 'broad' && spec.id === 'olive' ? 3 : 1);
    out.push([Math.cos(dir) * (bend + wob), topY * t, Math.sin(dir) * (bend + wob * 0.6)]);
  }
  return out;
}

/** The bark photograph is dark and cavity-occluded: lift it so trunks read as bark, not black. */
const BARK_GAIN = 5.5;

function buildTrunk(spec: TreeSpec, plan: LodPlan, path: V3[], paint: { color: RGB; uvPerM: number }): GeoBuilder {
  const b = new GeoBuilder({ sway: true });
  const rBase = spec.trunkR;
  for (let i = 0; i < path.length - 1; i++) {
    const t0 = i / (path.length - 1);
    const t1 = (i + 1) / (path.length - 1);
    const r0 = rBase * (1 - t0 * 0.78) * (i === 0 ? 1.12 : 1);
    const r1 = rBase * (1 - t1 * 0.78);
    const sw0 = Math.pow(path[i][1] / spec.height, 1.6);
    const sw1 = Math.pow(path[i + 1][1] / spec.height, 1.6);
    b.limb(path[i], path[i + 1], r0, r1, plan.trunkSeg, { color: paint.color, uvPerM: paint.uvPerM, sway: [sw0, sw1] });
  }
  return b;
}

function addBranch(b: GeoBuilder, spec: TreeSpec, from: V3, to: V3, r0: number, r1: number, seg: number, paint: { color: RGB; uvPerM: number }): void {
  const sw0 = Math.pow(Math.max(from[1], 0) / spec.height, 1.6);
  const sw1 = Math.pow(Math.max(to[1], 0) / spec.height, 1.6);
  b.limb(from, to, r0, r1, seg, { color: paint.color, uvPerM: paint.uvPerM, sway: [sw0, sw1] });
}

const tris = (g: THREE.BufferGeometry): number => (g.index ? g.index.count / 3 : g.getAttribute('position').count / 3);

function broadLod(spec: TreeSpec, variant: number, lod: 0 | 1 | 2): TreeLod {
  const plan = LOD_PLANS[lod];
  // Same seed per LOD so the crown shape (not the card count) is what changes.
  const rng = new Rng(7919 * (spec.id.length * 131 + variant * 17 + 3) + spec.height * 100);
  const crng = new Rng(4421 * (variant + 1) + spec.radius * 977);
  const trunkTop = spec.height * (spec.crownStart + 0.28);
  const path = trunkPath(spec, rng, trunkTop, 6);
  const paint = { color: mul(spec.bark, BARK_GAIN), uvPerM: 1 };
  const trunk = buildTrunk(spec, plan, path, paint);
  const ry = spec.radiusY ?? spec.radius;
  const cy = spec.height * spec.crownStart + ry * 0.92;
  const top = path[path.length - 1];
  const center: V3 = [top[0] * 0.8, Math.min(cy, spec.height - ry), top[2] * 0.8];
  const radii: V3 = [spec.radius, ry, spec.radius];
  // Main limbs reaching into the crown.
  const nb = Math.round((spec.id === 'olive' ? 5 : 4) * plan.branches);
  const brng = new Rng(97 * (variant + 5) + 3);
  for (let i = 0; i < nb; i++) {
    const a = (i / Math.max(nb, 1)) * Math.PI * 2 + brng.float() * 0.7;
    const reach = spec.radius * brng.range(0.5, 0.78);
    const from: V3 = [top[0], trunkTop * brng.range(0.78, 1), top[2]];
    const to: V3 = [center[0] + Math.cos(a) * reach, center[1] + ry * brng.range(0.0, 0.5), center[2] + Math.sin(a) * reach];
    addBranch(trunk, spec, from, to, spec.trunkR * 0.46, spec.trunkR * 0.12, 4, paint);
  }
  // Foliage cards across the ellipsoid shell.
  const leaves = new GeoBuilder({ sway: true });
  const n = Math.max(5, Math.round(spec.count * plan.cards));
  const size = spec.card * plan.scale;
  for (let i = 0; i < n; i++) {
    const d = randUnit(crng);
    // Bias towards the outer shell: leaves hide the inside of a real crown.
    const rr = 0.35 + 0.65 * Math.pow(crng.float(), 0.55);
    const p: V3 = [center[0] + d[0] * radii[0] * rr, center[1] + d[1] * radii[1] * rr, center[2] + d[2] * radii[2] * rr];
    if (p[1] < spec.height * spec.crownStart * 0.8) p[1] = spec.height * spec.crownStart * 0.8 + crng.float() * 0.3;
    const up = norm([d[0] * 0.65 + (crng.float() - 0.5) * 0.4, d[1] * 0.45 + 0.35 + crng.float() * 0.25, d[2] * 0.65 + (crng.float() - 0.5) * 0.4]);
    const side = sideFor(up, crng);
    const baseP: V3 = [p[0] - up[0] * size * 0.38, p[1] - up[1] * size * 0.38, p[2] - up[2] * size * 0.38];
    const dist = clamp(Math.hypot((p[0] - center[0]) / radii[0], (p[1] - center[1]) / radii[1], (p[2] - center[2]) / radii[2]), 0, 1);
    const ao = 0.4 + 0.6 * dist;
    leafCard(leaves, {
      cell: spec.cells[crng.int(0, spec.cells.length - 1)],
      base: baseP,
      up,
      side,
      size,
      center,
      radii,
      color: leafColor(spec, crng),
      ao: [ao * 0.85, Math.min(1, ao * 1.08 + 0.05)],
      sway: [clamp(p[1] / spec.height, 0, 1) ** 1.4, clamp(p[1] / spec.height, 0, 1) ** 1.4],
    });
  }
  const tg = trunk.build();
  const lg = leaves.build();
  return { trunk: tg, leaves: lg, triangles: tris(tg) + tris(lg) };
}

function coniferLod(spec: TreeSpec, variant: number, lod: 0 | 1 | 2): TreeLod {
  const plan = LOD_PLANS[lod];
  const crng = new Rng(8123 * (variant + 3) + spec.radius * 313);
  const H = spec.height;
  const paint = { color: mul(spec.bark, BARK_GAIN), uvPerM: 1 };
  const path: V3[] = [];
  const segs = 6;
  for (let i = 0; i <= segs; i++) path.push([Math.sin(i * 1.3 + variant) * 0.06 * (i / segs), H * 0.985 * (i / segs), Math.cos(i * 0.9) * 0.05 * (i / segs)]);
  const trunk = buildTrunk(spec, plan, path, paint);
  const leaves = new GeoBuilder({ sway: true });
  const whorls = Math.max(3, Math.round(spec.count * (lod === 0 ? 1 : lod === 1 ? 0.55 : 0.24)));
  const per = Math.max(3, Math.round((spec.perWhorl ?? 5) * (lod === 0 ? 1 : lod === 1 ? 0.8 : 0.7)));
  const droop = spec.droop ?? 0.35;
  const start = spec.crownStart;
  const golden = 2.399963;
  for (let i = 0; i < whorls; i++) {
    const t = whorls === 1 ? 0 : i / (whorls - 1);
    const y = H * (start + (0.975 - start) * t);
    // Spruce silhouette: widest near the lower third, tapering to a spike.
    const rr = Math.max(0.5, spec.radius * Math.pow(1 - t, 0.82) * (0.78 + 0.22 * Math.sin(Math.min(1, t * 2.5) * Math.PI * 0.5)));
    const len = rr * 1.2 * (0.9 + crng.float() * 0.2);
    const size = Math.max(len, 0.9) * 1.35 * (lod === 0 ? 1 : lod === 1 ? 1.3 : 1.7);
    for (let k = 0; k < per; k++) {
      const a = i * golden + (k / per) * Math.PI * 2 + crng.float() * 0.5;
      const h: V3 = [Math.cos(a), 0, Math.sin(a)];
      const dr = droop * (0.7 + 0.6 * crng.float()) * (1 - t * 0.5) - t * 0.18;
      const up: V3 = norm([h[0] * Math.cos(dr), -Math.sin(dr), h[2] * Math.cos(dr)]);
      const hs: V3 = norm(cross([0, 1, 0], h));
      // Two cards per branch, one lying flat and one standing: seen from any side, some needles face the eye.
      const sides: V3[] = lod === 2 ? [hs] : [hs, norm([hs[0] * 0.35, 1, hs[2] * 0.35])];
      for (const sd of sides) {
        const side = norm(cross(cross(up, sd), up));
        const dist = 0.45 + 0.55 * (len > 0 ? 1 : 0);
        leafCard(leaves, {
          cell: spec.cells[crng.int(0, spec.cells.length - 1)],
          base: [h[0] * 0.15, y - crng.float() * 0.2, h[2] * 0.15],
          up,
          side,
          size,
          widthK: 0.9,
          center: [0, y + H * 0.02, 0],
          radii: [Math.max(rr, 1), Math.max(rr, 1) * 1.7, Math.max(rr, 1)],
          color: leafColor(spec, crng, 0.12),
          ao: [0.34 + 0.3 * t, Math.min(1, 0.85 + 0.2 * dist)],
          sway: [0.12 + 0.5 * t, 0.2 + 0.8 * t],
          cardMix: 0.22,
          lift: 0.45,
        });
      }
    }
  }
  const tg = trunk.build();
  const lg = leaves.build();
  return { trunk: lod === 2 ? tg : tg, leaves: lg, triangles: tris(tg) + tris(lg) };
}

function umbrellaLod(spec: TreeSpec, variant: number, lod: 0 | 1 | 2): TreeLod {
  const plan = LOD_PLANS[lod];
  const rng = new Rng(2287 * (variant + 4) + spec.height * 17);
  const crng = new Rng(6151 * (variant + 2) + spec.radius * 211);
  const H = spec.height;
  const paint = { color: mul(spec.bark, BARK_GAIN), uvPerM: 1 };
  const trunkTop = H * spec.crownStart;
  const path = trunkPath(spec, rng, trunkTop, 6);
  const trunk = buildTrunk(spec, plan, path, paint);
  const top = path[path.length - 1];
  const leaves = new GeoBuilder({ sway: true });
  const ry = spec.radiusY ?? 2.4;
  const nb = Math.max(3, Math.round(6 * (lod === 0 ? 1 : lod === 1 ? 0.7 : 0.55)));
  const perBranch = Math.max(2, Math.round((spec.count / 6) * plan.cards));
  const size = spec.card * plan.scale;
  const center: V3 = [top[0], top[1] + ry * 0.7, top[2]];
  const radii: V3 = [spec.radius, ry * 1.25, spec.radius];
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2 + crng.float() * 0.8;
    const reach = spec.radius * crng.range(0.5, 0.95);
    const rise = ry * crng.range(0.35, 1.0);
    const tip: V3 = [top[0] + Math.cos(a) * reach, top[1] + rise, top[2] + Math.sin(a) * reach];
    const mid: V3 = [top[0] + Math.cos(a) * reach * 0.45, top[1] + rise * 0.55, top[2] + Math.sin(a) * reach * 0.45];
    if (plan.branches > 0 || lod === 1) {
      addBranch(trunk, spec, top, mid, spec.trunkR * 0.7, spec.trunkR * 0.32, 4, paint);
      addBranch(trunk, spec, mid, tip, spec.trunkR * 0.32, spec.trunkR * 0.1, 4, paint);
    }
    // A tuft: cards spoking out from the branch tip like pine needles around a shoot.
    for (let k = 0; k < perBranch; k++) {
      const aa = a + (crng.float() - 0.5) * 1.6;
      const el = crng.range(-0.15, 0.85);
      const up: V3 = norm([Math.cos(aa) * Math.cos(el), Math.sin(el), Math.sin(aa) * Math.cos(el)]);
      const side = sideFor(up, crng);
      const dist = 0.5 + 0.5 * crng.float();
      leafCard(leaves, {
        cell: spec.cells[crng.int(0, spec.cells.length - 1)],
        base: [tip[0] - up[0] * size * 0.1, tip[1] - up[1] * size * 0.1, tip[2] - up[2] * size * 0.1],
        up,
        side,
        size,
        widthK: 0.8,
        center,
        radii,
        color: leafColor(spec, crng, 0.1),
        ao: [0.5 * dist + 0.2, 0.7 + 0.3 * dist],
        sway: [0.55, 0.9],
        cardMix: 0.35,
        lift: 0.35,
      });
    }
  }
  const tg = trunk.build();
  const lg = leaves.build();
  return { trunk: tg, leaves: lg, triangles: tris(tg) + tris(lg) };
}

function palmLod(spec: TreeSpec, variant: number, lod: 0 | 1 | 2): TreeLod {
  const plan = LOD_PLANS[lod];
  const rng = new Rng(1597 * (variant + 3) + 11);
  const H = spec.height;
  const path = trunkPath(spec, rng, H * 0.94, 8);
  const b = new GeoBuilder({ sway: true });
  // Ringed trunk: alternate darker bands (old leaf bases).
  for (let i = 0; i < path.length - 1; i++) {
    const t0 = i / (path.length - 1);
    const t1 = (i + 1) / (path.length - 1);
    const band = i % 2 === 0 ? 1 : 0.82;
    b.limb(path[i], path[i + 1], spec.trunkR * (1.15 - t0 * 0.42), spec.trunkR * (1.15 - t1 * 0.42), plan.trunkSeg, { color: mul(spec.bark, band), uvPerM: 1, sway: [(path[i][1] / H) ** 1.6, (path[i + 1][1] / H) ** 1.6] });
  }
  const top = path[path.length - 1];
  const leaves = new GeoBuilder({ sway: true });
  const n = Math.max(6, Math.round(spec.count * (lod === 0 ? 1 : lod === 1 ? 0.62 : 0.4)));
  const size = spec.card * (lod === 0 ? 1 : lod === 1 ? 1.15 : 1.35);
  const crng = new Rng(2999 * (variant + 1));
  const center: V3 = [top[0], top[1] + 0.8, top[2]];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + crng.float() * 0.4;
    const el = crng.range(-0.35, 0.95);
    const dirH: V3 = [Math.cos(a), 0, Math.sin(a)];
    const up: V3 = norm([dirH[0] * Math.cos(el), Math.sin(el), dirH[2] * Math.cos(el)]);
    // Fronds arch: two segments, the second bends towards the ground.
    const seg1 = size * 0.55;
    const mid: V3 = [top[0] + up[0] * seg1, top[1] + up[1] * seg1, top[2] + up[2] * seg1];
    const bend = Math.min(el - 0.55, 0.2);
    const up2: V3 = norm([dirH[0] * Math.cos(bend), Math.sin(bend), dirH[2] * Math.cos(bend)]);
    const hs: V3 = norm(cross([0, 1, 0], dirH));
    const col = leafColor(spec, crng, 0.08);
    const cell = spec.cells[crng.int(0, spec.cells.length - 1)];
    for (const [base, upv, sz, ao0, ao1] of [[top, up, seg1 * 1.05, 0.5, 0.85], [mid, up2, size * 0.62, 0.8, 1]] as [V3, V3, number, number, number][]) {
      leafCard(leaves, {
        cell,
        base,
        up: upv,
        side: norm(cross(cross(upv, hs), upv)),
        size: sz,
        widthK: 1.05,
        center,
        radii: [3, 3, 3],
        color: col,
        ao: [ao0, ao1],
        sway: [0.7, 1],
        cardMix: 0.5,
        lift: 0.5,
      });
    }
  }
  const tg = b.build();
  const lg = leaves.build();
  return { trunk: tg, leaves: lg, triangles: tris(tg) + tris(lg) };
}

function tuftLod(spec: TreeSpec, variant: number, lod: 0 | 1 | 2): TreeLod {
  const crng = new Rng(521 * (variant + 3) + spec.card * 100);
  const leaves = new GeoBuilder({ sway: true });
  const n = Math.max(2, Math.round(spec.count * (lod === 0 ? 1 : lod === 1 ? 0.6 : 0.4)));
  const size = spec.card * (lod === 0 ? 1 : lod === 1 ? 1.12 : 1.25);
  const center: V3 = [0, size * 0.4, 0];
  const radii: V3 = [spec.radius, size, spec.radius];
  for (let i = 0; i < n; i++) {
    // Crossed upright cards, leaning slightly outwards, evenly spread in yaw.
    const a = (i / n) * Math.PI + crng.float() * 0.5;
    const lean = crng.range(0.0, 0.35);
    const up: V3 = norm([Math.cos(a + Math.PI / 2) * Math.sin(lean), Math.cos(lean), Math.sin(a + Math.PI / 2) * Math.sin(lean)]);
    const side: V3 = norm([Math.cos(a), 0, Math.sin(a)]);
    const off = crng.range(-0.12, 0.12);
    leafCard(leaves, {
      cell: spec.cells[crng.int(0, spec.cells.length - 1)],
      base: [Math.cos(a + Math.PI / 2) * off, 0, Math.sin(a + Math.PI / 2) * off],
      up,
      side,
      size,
      center,
      radii,
      color: leafColor(spec, crng, 0.12),
      ao: [0.5, 1],
      sway: [0.05, 1],
      cardMix: 0.3,
      lift: 0.6,
    });
  }
  const lg = leaves.build();
  return { trunk: null, leaves: lg, triangles: tris(lg) };
}

function shrubLod(spec: TreeSpec, variant: number, lod: 0 | 1 | 2): TreeLod {
  const crng = new Rng(731 * (variant + 5) + spec.radius * 997);
  const leaves = new GeoBuilder({ sway: true });
  const n = Math.max(4, Math.round(spec.count * (lod === 0 ? 1 : lod === 1 ? 0.6 : 0.35)));
  const size = spec.card * (lod === 0 ? 1 : lod === 1 ? 1.25 : 1.5);
  const ry = spec.radiusY ?? spec.radius * 0.7;
  const center: V3 = [0, ry * 0.5, 0];
  const radii: V3 = [spec.radius, ry, spec.radius];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + crng.float() * 0.5;
    const el = crng.range(0.2, 1.25);
    const up: V3 = norm([Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)]);
    const side = sideFor(up, crng);
    const rr = crng.float() * spec.radius * 0.35;
    leafCard(leaves, {
      cell: spec.cells[crng.int(0, spec.cells.length - 1)],
      base: [Math.cos(a) * rr, 0, Math.sin(a) * rr],
      up,
      side,
      size,
      center,
      radii,
      color: leafColor(spec, crng, 0.14),
      ao: [0.4, 0.95],
      sway: [0.3, 1],
      cardMix: 0.3,
      lift: 0.3,
    });
  }
  const lg = leaves.build();
  return { trunk: null, leaves: lg, triangles: tris(lg) };
}

/** Build all three LODs of one variant of a species. */
export function buildTree(spec: TreeSpec, variant: number): TreeModel {
  const make = (lod: 0 | 1 | 2): TreeLod => {
    switch (spec.kind) {
      case 'conifer':
        return coniferLod(spec, variant, lod);
      case 'umbrella':
        return umbrellaLod(spec, variant, lod);
      case 'palm':
        return palmLod(spec, variant, lod);
      case 'shrub':
        return shrubLod(spec, variant, lod);
      case 'tuft':
        return tuftLod(spec, variant, lod);
      default:
        return broadLod(spec, variant, lod);
    }
  };
  return { spec, variant, lods: [make(0), make(1), make(2)] };
}

export function disposeTree(t: TreeModel): void {
  for (const l of t.lods) {
    l.trunk?.dispose();
    l.leaves.dispose();
  }
}

// mix() is re-exported for map builders that tint species by region.
export { mix };
