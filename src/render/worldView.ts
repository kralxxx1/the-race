import * as THREE from 'three';
import type { EnvDef } from '../data/environments';
import { Rng, fbm2, hash01, noise2, smoothstep } from '../core/math';
import { pavedHalfWidth, type LaneConfig, type RoadPath } from '../world/road';
import type { GlowPoints } from './effects';
import type { Materials } from './materials';
import type { QualityProfile } from './quality';
import { createSurfaces, type WorldSurfaces } from './surfaces';
import { ROAD_TEX_LENGTH, glowTexture, mountainTexture, signTexture } from './textures';

export const CHUNK = 120;
const STEP = 4;
const ROWS = CHUNK / STEP + 1;
const ROAD_COLS = [-1, -0.5, 0, 0.5, 1];
const TERRAIN_OFFS = [0, 0.9, 2.2, 4.2, 7, 11, 17, 26, 40, 60, 90, 135, 200, 290, 420];
const RAIL_PROFILE: [number, number][] = [[0, 0.79], [0.05, 0.73], [0.02, 0.63], [0.05, 0.53], [0, 0.47]];
const BARRIER_PROFILE: [number, number][] = [[0, 0], [0, 0.075], [0.13, 0.33], [0.19, 0.82], [0.36, 0.82], [0.42, 0.33], [0.55, 0.075], [0.55, 0]];

const _v = new THREE.Vector3();

/**
 * Write vertex data into a geometry, reusing the existing attribute (and its GPU
 * buffer) when the size matches. Replacing attributes on a live geometry would
 * orphan the old GPU buffers until the geometry itself is disposed.
 */
function writeAttr(g: THREE.BufferGeometry, name: string, data: Float32Array, itemSize: number): void {
  const a = g.getAttribute(name) as THREE.BufferAttribute | undefined;
  if (a && a.array.length === data.length) {
    (a.array as Float32Array).set(data);
    a.needsUpdate = true;
  } else {
    if (a) g.deleteAttribute(name);
    g.setAttribute(name, new THREE.BufferAttribute(data, itemSize));
  }
}

function writeIndex(g: THREE.BufferGeometry, idx: number[]): void {
  if (g.index && g.index.count === idx.length) return; // topology is fixed per chunk mesh
  g.setIndex(idx);
}
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

function vcolor(g: THREE.BufferGeometry, color: THREE.ColorRepresentation, jitter = 0): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 3) {
    const j = 1 + (Math.random() - 0.5) * jitter;
    for (let k = 0; k < 3 && i + k < n; k++) arr.set([c.r * j, c.g * j, c.b * j], (i + k) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (geo.attributes.uv) geo.deleteAttribute('uv');
  return geo;
}

/** Dispose geometries, materials and per-object (owned) textures of a subtree. */
function disposeOwned(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      const std = mat as THREE.MeshStandardMaterial;
      for (const t of [std.map, std.emissiveMap]) if (t?.userData.owned) t.dispose();
      mat.dispose();
    }
  });
}

function mergeColored(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const total = parts.reduce((a, g) => a + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3);
  const nrm = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let o = 0;
  for (const g of parts) {
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    nrm.set(g.attributes.normal.array as Float32Array, o * 3);
    col.set(g.attributes.color.array as Float32Array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

function lumpy(radius: number, detail: number, amount: number, seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(radius, detail);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    _v.fromBufferAttribute(p, i);
    const n = 1 + (noise2(_v.x * 2.1 + seed, _v.y * 2.3 + _v.z * 1.7, seed) * amount);
    _v.multiplyScalar(n);
    p.setXYZ(i, _v.x, _v.y, _v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Library of instanced prop geometries (vertex coloured). */
function propGeometry(kind: string): THREE.BufferGeometry {
  switch (kind) {
    case 'olive': {
      const trunk = new THREE.CylinderGeometry(0.16, 0.26, 2.0, 7);
      trunk.translate(0, 1.0, 0);
      const c1 = lumpy(1.6, 1, 0.25, 1);
      c1.scale(1.2, 0.8, 1.2);
      c1.translate(0, 2.6, 0);
      const c2 = lumpy(1.1, 1, 0.3, 2);
      c2.translate(0.8, 3.0, 0.4);
      const c3 = lumpy(1.0, 1, 0.3, 3);
      c3.translate(-0.7, 2.9, -0.3);
      return mergeColored([vcolor(trunk, '#5b4a3a'), vcolor(c1, '#6f7f57', 0.2), vcolor(c2, '#7c8b62', 0.2), vcolor(c3, '#66784f', 0.2)]);
    }
    case 'pine': {
      const parts = [vcolor(new THREE.CylinderGeometry(0.18, 0.3, 3, 7).translate(0, 1.5, 0), '#4a3a2c')];
      for (let i = 0; i < 4; i++) {
        const r = 2.4 - i * 0.5;
        const cone = new THREE.ConeGeometry(r, 3.6, 9);
        cone.translate(0, 3.2 + i * 2.1, 0);
        parts.push(vcolor(cone, i % 2 ? '#2f4a32' : '#294430', 0.25));
      }
      return mergeColored(parts);
    }
    case 'cactus': {
      const parts: THREE.BufferGeometry[] = [];
      const col = '#4f6b3a';
      parts.push(vcolor(new THREE.CapsuleGeometry(0.28, 4.2, 4, 10).translate(0, 2.4, 0), col, 0.1));
      parts.push(vcolor(new THREE.CapsuleGeometry(0.18, 1.0, 4, 8).rotateZ(Math.PI / 2).translate(0.55, 2.2, 0), col, 0.1));
      parts.push(vcolor(new THREE.CapsuleGeometry(0.18, 1.5, 4, 8).translate(1.0, 2.9, 0), col, 0.1));
      parts.push(vcolor(new THREE.CapsuleGeometry(0.16, 0.8, 4, 8).rotateZ(Math.PI / 2).translate(-0.45, 2.8, 0), col, 0.1));
      parts.push(vcolor(new THREE.CapsuleGeometry(0.16, 1.0, 4, 8).translate(-0.85, 3.3, 0), col, 0.1));
      return mergeColored(parts);
    }
    case 'bush':
      return mergeColored([vcolor(lumpy(1, 1, 0.3, 4).scale(1.3, 0.8, 1.3).translate(0, 0.6, 0), '#4d6a3c', 0.3)]);
    case 'oleander': {
      const g = lumpy(1, 2, 0.28, 5).scale(1.1, 0.9, 1.1).translate(0, 0.8, 0);
      const geo = vcolor(g, '#3f5f34', 0.2);
      const c = geo.attributes.color as THREE.BufferAttribute;
      const p = geo.attributes.position as THREE.BufferAttribute;
      const pink = new THREE.Color('#c95c88');
      const white = new THREE.Color('#e8d6dc');
      // Blossoms only on the upper, outward-facing part of the shrub.
      for (let i = 0; i < c.count; i += 3) {
        if (p.getY(i) < 0.9 || Math.random() > 0.22) continue;
        const col = Math.random() < 0.8 ? pink : white;
        for (let k = 0; k < 3; k++) c.setXYZ(i + k, col.r, col.g, col.b);
      }
      return mergeColored([geo]);
    }
    case 'rock':
      return mergeColored([vcolor(lumpy(1, 0, 0.35, 6).scale(1.4, 0.8, 1.1), '#8a8178', 0.25)]);
    case 'redrock':
      return mergeColored([vcolor(lumpy(1, 1, 0.3, 7).scale(1.2, 1.6, 1.0), '#a2583a', 0.2)]);
    case 'post':
      return mergeColored([vcolor(new THREE.BoxGeometry(0.12, 0.85, 0.08).translate(0, 0.42, 0), '#a7adb3', 0.05)]);
    case 'lamp': {
      const pole = new THREE.CylinderGeometry(0.08, 0.13, 10, 8).translate(0, 5, 0);
      const arm = new THREE.CylinderGeometry(0.05, 0.06, 2.4, 6).rotateZ(Math.PI / 2 - 0.12).translate(-1.15, 9.85, 0);
      const head = new THREE.BoxGeometry(0.7, 0.14, 0.28).translate(-2.25, 9.75, 0);
      return mergeColored([vcolor(pole, '#7d8389'), vcolor(arm, '#7d8389'), vcolor(head, '#55595e')]);
    }
    case 'lampHead':
      return new THREE.BoxGeometry(0.62, 0.05, 0.22).translate(-2.25, 9.67, 0);
    default:
      return new THREE.BoxGeometry(1, 1, 1);
  }
}

interface PropDef {
  key: string;
  max: number;
  material: THREE.Material;
  castShadow: boolean;
}

class Chunk {
  index = -1;
  s0 = 0;
  readonly group = new THREE.Group();
  readonly origin = new THREE.Vector3();
  road: THREE.Mesh;
  terrain: THREE.Mesh;
  railR: THREE.Mesh;
  railL: THREE.Mesh;
  props = new Map<string, THREE.InstancedMesh>();
  buildings: THREE.Mesh | null = null;
  pools: THREE.InstancedMesh | null = null;
  gantry: THREE.Group | null = null;
  glows: THREE.Vector3[] = [];

  constructor(roadMat: THREE.Material, terrainMat: THREE.Material, railMatR: THREE.Material, railMatL: THREE.Material) {
    this.road = new THREE.Mesh(new THREE.BufferGeometry(), roadMat);
    this.road.receiveShadow = true;
    this.terrain = new THREE.Mesh(new THREE.BufferGeometry(), terrainMat);
    this.terrain.receiveShadow = true;
    this.railR = new THREE.Mesh(new THREE.BufferGeometry(), railMatR);
    this.railL = new THREE.Mesh(new THREE.BufferGeometry(), railMatL);
    this.railR.castShadow = this.railL.castShadow = true;
    this.railR.receiveShadow = this.railL.receiveShadow = true;
    this.group.add(this.road, this.terrain, this.railR, this.railL);
  }
}

const CITIES: [string, number][] = [
  ['İSTANBUL', 412], ['ANKARA', 286], ['İZMİR', 198], ['BURSA', 154], ['ESKİŞEHİR', 241], ['ANTALYA', 530], ['KONYA', 377], ['TRABZON', 690], ['SAMSUN', 520], ['ÇANAKKALE', 310],
];

/**
 * Streams the highway and its surroundings in fixed-length chunks around the
 * rider, recycling geometry buffers. World coordinates are re-based every
 * couple of kilometres to keep float precision on the GPU.
 */
export class WorldView {
  readonly group = new THREE.Group();
  readonly origin = new THREE.Vector3();
  private chunks: Chunk[] = [];
  private active = new Map<number, Chunk>();
  private free: Chunk[] = [];
  private roadMat: THREE.MeshStandardMaterial;
  private terrainMat: THREE.MeshStandardMaterial;
  private railMat: THREE.MeshStandardMaterial;
  private barrierMat: THREE.MeshStandardMaterial;
  private buildingMat: THREE.MeshStandardMaterial | null = null;
  private surfaces: WorldSurfaces;
  private poolMat: THREE.MeshBasicMaterial | null = null;
  private props: PropDef[] = [];
  private propGeo = new Map<string, THREE.BufferGeometry>();
  private backdrop: THREE.Group;
  private half: number;
  private originS = 0;
  private seed: number;
  /** Pending origin shift that dynamic objects must also apply (consumed by the game view). */
  readonly shiftEvents: THREE.Vector3[] = [];

  constructor(
    readonly road: RoadPath,
    readonly lanes: LaneConfig,
    readonly env: EnvDef,
    readonly mats: Materials,
    readonly quality: QualityProfile,
  ) {
    this.seed = road.seed;
    this.half = pavedHalfWidth(lanes);
    // PBR surface materials (photographic sets when loaded, procedural otherwise): see surfaces.ts.
    this.surfaces = createSurfaces({ lanes, env, quality });
    this.roadMat = this.surfaces.road;
    this.terrainMat = this.surfaces.terrain;
    this.railMat = this.surfaces.rail;
    this.barrierMat = this.surfaces.barrier;
    this.buildingMat = this.surfaces.building;
    if (env.scenery.lightsOn) {
      this.poolMat = new THREE.MeshBasicMaterial({
        map: glowTexture(),
        color: new THREE.Color('#ff9a3c').multiplyScalar(0.55),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      });
    }
    this.defineProps();
    this.backdrop = this.buildBackdrop();
    this.group.add(this.backdrop);
  }

  private defineProps(): void {
    const env = this.env;
    const propMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
    const metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.6 });
    const dens = this.quality.sceneryDensity;
    const def = (key: string, max: number, material: THREE.Material, castShadow = true) => {
      this.props.push({ key, max: Math.max(1, Math.round(max)), material, castShadow: castShadow && this.quality.worldShadows });
      if (!this.propGeo.has(key)) this.propGeo.set(key, propGeometry(key));
    };
    def('post', ROWS * 2, metal, false);
    const t = env.scenery.trees;
    if (t !== 'none') def(t, 70 * env.scenery.treeDensity * dens + 4, propMat);
    if (env.terrain !== 'city') def('bush', 40 * dens + 2, propMat);
    if (this.lanes.layout === 'oneway' && env.terrain !== 'city' && env.terrain !== 'sand') def('oleander', 32, propMat);
    if (env.scenery.rocks) def(env.terrain === 'sand' ? 'redrock' : 'rock', 26 * dens + 2, propMat);
    if (env.scenery.streetLights) {
      def('lamp', 8, metal);
      const headMat = this.mats.makeLight('#ffd09a', env.scenery.lightsOn ? 6 : 0.05);
      if (!env.scenery.lightsOn) headMat.color.set('#c9cdd2');
      this.props.push({ key: 'lampHead', max: 8, material: headMat, castShadow: false });
      this.propGeo.set('lampHead', propGeometry('lampHead'));
    }
  }

  private buildBackdrop(): THREE.Group {
    const g = new THREE.Group();
    const env = this.env;
    const layers: [number, number, string, string, number][] = [
      [3200, 520, env.mountains.far, env.fog.color, 0],
      [2600, 360, env.mountains.near, env.mountains.far, 1],
    ];
    for (const [r, h, near, far, i] of layers) {
      // Silhouettes depend on the environment only, so the cached texture is reused across runs.
      const tex = mountainTexture(near, far, env.mountains.height, 17 + i * 7);
      tex.repeat.set(2, 1);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false, depthWrite: false, side: THREE.BackSide });
      // Blend towards the horizon haze colour.
      mat.color = new THREE.Color(env.fog.color).lerp(new THREE.Color('#ffffff'), i === 0 ? 0.25 : 0.55);
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 64, 1, true), mat);
      cyl.position.y = h / 2 - 40;
      cyl.renderOrder = -5 + i;
      g.add(cyl);
    }
    g.frustumCulled = false;
    g.traverse((o) => (o.frustumCulled = false));
    return g;
  }

  /** World (rebased) position of a road-space point. */
  worldPos(s: number, d: number, up: number, out: THREE.Vector3): THREE.Vector3 {
    this.road.toWorld(s, d, out, up);
    return out.sub(this.origin);
  }

  terrainHeight(s: number, off: number, side: number): number {
    const env = this.env;
    const base = this.road.height(s) - 0.05;
    const ditch = env.terrain === 'city' ? 0 : -0.55 * smoothstep(0.8, 2.6, off) * (1 - smoothstep(4.5, 9, off));
    const A = env.terrain === 'city' ? 0.3 : env.terrain === 'sand' ? 7 : env.terrain === 'forest' ? 18 : 11;
    const B = env.terrain === 'city' ? 10 : env.terrain === 'sand' ? 70 : env.terrain === 'forest' ? 140 : 90;
    const hill = A * (fbm2(s * 0.0028 + side * 37, off * 0.004, 4, this.seed) * 0.5 + 0.35) * smoothstep(9, 90, off);
    const far = B * (fbm2(s * 0.0011 + side * 91, off * 0.0016, 4, this.seed + 3) * 0.6 + 0.45) * smoothstep(150, 420, off);
    return base + ditch + hill + far;
  }

  private groundColor(s: number, off: number, h: number, out: THREE.Color): THREE.Color {
    const env = this.env;
    const n = noise2(s * 0.02, off * 0.05, 11) * 0.5 + 0.5;
    const shade = 0.82 + n * 0.26;
    if (off < 1.0 && env.terrain !== 'city') {
      // Gravel verge
      out.setRGB(0.78, 0.76, 0.72);
    } else if (env.terrain === 'city') {
      out.setRGB(0.7, 0.7, 0.72).multiplyScalar(shade);
    } else if (env.terrain === 'sand') {
      out.setRGB(1, 0.95, 0.9).multiplyScalar(shade);
      if (h > 25) out.lerp(new THREE.Color(0.85, 0.7, 0.62), smoothstep(25, 60, h));
    } else {
      out.setRGB(shade, shade, shade);
      // Ditches are greener and darker; hilltops drier.
      if (off > 1 && off < 9) out.multiplyScalar(0.86);
      if (h > 40) out.lerp(new THREE.Color(0.9, 0.86, 0.78), smoothstep(40, 110, h) * 0.6);
    }
    return out;
  }

  update(playerS: number): void {
    // Re-base the origin every 2 km.
    if (Math.abs(playerS - this.originS) > 2000) {
      const old = this.origin.clone();
      this.originS = Math.round(playerS / 1000) * 1000;
      this.road.toWorld(this.originS, 0, this.origin);
      const shift = this.origin.clone().sub(old);
      this.shiftEvents.push(shift);
      for (const c of this.active.values()) c.group.position.copy(c.origin).sub(this.origin);
    }
    const ahead = this.quality.viewDistance;
    const first = Math.floor((playerS - 160) / CHUNK);
    const last = Math.floor((playerS + ahead) / CHUNK);
    for (const [idx, c] of this.active) {
      if (idx < first || idx > last) {
        this.active.delete(idx);
        c.group.visible = false;
        this.free.push(c);
      }
    }
    let built = 0;
    for (let i = first; i <= last; i++) {
      if (this.active.has(i)) continue;
      // Spread chunk generation over frames, nearest first.
      if (built >= 2 && i > Math.floor((playerS + 300) / CHUNK)) break;
      const c = this.free.pop() ?? this.newChunk();
      this.buildChunk(c, i);
      this.active.set(i, c);
      built++;
    }
    // Backdrop follows the player horizontally.
    this.worldPos(playerS, 0, 0, _v);
    this.backdrop.position.set(_v.x, _v.y - this.road.height(playerS) + 0, _v.z);
  }

  /** Build all chunks within view immediately (used while loading). */
  prewarm(playerS: number): void {
    for (let k = 0; k < 40; k++) this.update(playerS);
  }

  private newChunk(): Chunk {
    const c = new Chunk(this.roadMat, this.terrainMat, this.railMat, this.lanes.layout === 'oneway' ? this.barrierMat : this.railMat);
    for (const p of this.props) {
      const im = new THREE.InstancedMesh(this.propGeo.get(p.key)!, p.material, p.max);
      im.castShadow = p.castShadow;
      im.receiveShadow = false;
      im.count = 0;
      im.frustumCulled = false;
      c.props.set(p.key, im);
      c.group.add(im);
    }
    this.chunks.push(c);
    this.group.add(c.group);
    return c;
  }

  private buildChunk(c: Chunk, index: number): void {
    c.index = index;
    c.s0 = index * CHUNK;
    c.group.visible = true;
    this.road.toWorld(c.s0, 0, c.origin);
    c.group.position.copy(c.origin).sub(this.origin);
    this.buildRoad(c);
    this.buildTerrain(c);
    this.buildRails(c);
    this.buildProps(c);
    this.buildBuildings(c);
    this.buildGantry(c);
  }

  private local(c: Chunk, s: number, d: number, up: number, out: THREE.Vector3): THREE.Vector3 {
    this.road.toWorld(s, d, out, up);
    return out.sub(c.origin);
  }

  private buildRoad(c: Chunk): void {
    const cols = ROAD_COLS.length;
    const pos = new Float32Array(ROWS * cols * 3);
    const uv = new Float32Array(ROWS * cols * 2);
    for (let r = 0; r < ROWS; r++) {
      const s = c.s0 + r * STEP;
      for (let k = 0; k < cols; k++) {
        const d = ROAD_COLS[k] * this.half;
        const crown = 0.05 * (1 - ROAD_COLS[k] * ROAD_COLS[k]);
        this.local(c, s, d, crown, _v);
        const i = r * cols + k;
        pos.set([_v.x, _v.y, _v.z], i * 3);
        // v is the global distance along the road (wrapped far away) so markings, patches and cracks never repeat per chunk.
        uv.set([(ROAD_COLS[k] + 1) / 2, ((s % (ROAD_TEX_LENGTH * 1000)) / ROAD_TEX_LENGTH)], i * 2);
      }
    }
    const idx: number[] = [];
    for (let r = 0; r < ROWS - 1; r++)
      for (let k = 0; k < cols - 1; k++) {
        const a = r * cols + k;
        const b = a + 1;
        const d = a + cols;
        const e = d + 1;
        idx.push(a, b, d, b, e, d);
      }
    const g = c.road.geometry;
    writeAttr(g, 'position', pos, 3);
    writeAttr(g, 'uv', uv, 2);
    writeIndex(g, idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
  }

  private buildTerrain(c: Chunk): void {
    const offs = TERRAIN_OFFS;
    const cols = offs.length;
    const vcount = ROWS * cols * 2;
    const pos = new Float32Array(vcount * 3);
    const uv = new Float32Array(vcount * 2);
    const col = new Float32Array(vcount * 3);
    const edgeOff = new Float32Array(vcount);
    const color = new THREE.Color();
    for (let side = 0; side < 2; side++) {
      const sg = side === 0 ? -1 : 1;
      for (let r = 0; r < ROWS; r++) {
        const s = c.s0 + r * STEP;
        for (let k = 0; k < cols; k++) {
          const off = offs[k];
          const d = sg * (this.half + off);
          const h = this.terrainHeight(s, off, sg);
          this.road.toWorld(s, d, _v);
          _v.y = h;
          const wx = _v.x;
          const wz = _v.z;
          _v.sub(c.origin);
          const i = side * ROWS * cols + r * cols + k;
          pos.set([_v.x, _v.y, _v.z], i * 3);
          uv.set([wx / 9, wz / 9], i * 2);
          edgeOff[i] = off;
          this.groundColor(s, off, h - this.road.height(s), color);
          col.set([color.r, color.g, color.b], i * 3);
        }
      }
    }
    const idx: number[] = [];
    for (let side = 0; side < 2; side++) {
      const base = side * ROWS * cols;
      for (let r = 0; r < ROWS - 1; r++)
        for (let k = 0; k < cols - 1; k++) {
          const a = base + r * cols + k;
          const b = a + 1;
          const d = a + cols;
          const e = d + 1;
          // Winding depends on the side so faces point up.
          if (side === 1) idx.push(a, b, d, b, e, d);
          else idx.push(a, d, b, b, d, e);
        }
    }
    const g = c.terrain.geometry;
    writeAttr(g, 'position', pos, 3);
    writeAttr(g, 'uv', uv, 2);
    writeAttr(g, 'color', col, 3);
    writeAttr(g, 'aOff', edgeOff, 1);
    writeIndex(g, idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
  }

  /** Sweep a 2D profile (lateral offset outward, height) along the chunk at a given road edge. */
  private sweep(mesh: THREE.Mesh, c: Chunk, edge: number, side: number, profile: [number, number][]): void {
    const n = profile.length;
    const pos = new Float32Array(ROWS * n * 3);
    const uv = new Float32Array(ROWS * n * 2);
    // Profile arc length in metres gives the second texture coordinate (u = metres along the rail).
    const arc = [0];
    for (let k = 1; k < n; k++) arc.push(arc[k - 1] + Math.hypot(profile[k][0] - profile[k - 1][0], profile[k][1] - profile[k - 1][1]));
    for (let r = 0; r < ROWS; r++) {
      const s = c.s0 + r * STEP;
      for (let k = 0; k < n; k++) {
        const [o, y] = profile[k];
        this.local(c, s, side * (edge + o), y, _v);
        pos.set([_v.x, _v.y, _v.z], (r * n + k) * 3);
        uv.set([s % 4096, arc[k]], (r * n + k) * 2);
      }
    }
    const idx: number[] = [];
    for (let r = 0; r < ROWS - 1; r++)
      for (let k = 0; k < n - 1; k++) {
        const a = r * n + k;
        const b = a + 1;
        const d = a + n;
        const e = d + 1;
        if (side > 0) idx.push(a, d, b, b, d, e);
        else idx.push(a, b, d, b, e, d);
      }
    const g = mesh.geometry;
    writeAttr(g, 'position', pos, 3);
    writeAttr(g, 'uv', uv, 2);
    writeIndex(g, idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
  }

  private buildRails(c: Chunk): void {
    const edge = this.half + 0.45;
    this.sweep(c.railR, c, edge, 1, RAIL_PROFILE);
    if (this.lanes.layout === 'oneway') this.sweep(c.railL, c, this.half + 0.25, -1, BARRIER_PROFILE);
    else this.sweep(c.railL, c, edge, -1, RAIL_PROFILE);
  }

  private setInstance(im: THREE.InstancedMesh, i: number, c: Chunk, s: number, d: number, y: number, yawExtra: number, scale: number, sx = scale): void {
    this.road.toWorld(s, d, _v);
    _v.y = y;
    _v.sub(c.origin);
    _q.setFromEuler(_e.set(0, this.road.yaw(s) + yawExtra, 0));
    _s.set(sx, scale, sx);
    _m.compose(_v, _q, _s);
    im.setMatrixAt(i, _m);
  }

  private buildProps(c: Chunk): void {
    const env = this.env;
    const rng = new Rng(Math.floor(hash01(c.index * 7919 + this.seed * 104729) * 1e9));
    const counts = new Map<string, number>();
    const put = (key: string, s: number, d: number, y: number, yaw: number, scale: number, sx?: number) => {
      const im = c.props.get(key);
      if (!im) return false;
      const n = counts.get(key) ?? 0;
      if (n >= im.instanceMatrix.count) return false;
      this.setInstance(im, n, c, s, d, y, yaw, scale, sx);
      counts.set(key, n + 1);
      return true;
    };
    const edge = this.half + 0.45;
    // Guardrail posts every 4 m on the right (and left for two-way roads).
    for (let r = 0; r < ROWS - 1; r++) {
      const s = c.s0 + r * STEP + 2;
      put('post', s, edge + 0.08, this.road.height(s), 0, 1);
      if (this.lanes.layout === 'twoway') put('post', s, -edge - 0.08, this.road.height(s), 0, 1);
    }
    const tree = env.scenery.trees;
    if (tree !== 'none') {
      const im = c.props.get(tree)!;
      const max = im.instanceMatrix.count;
      for (let i = 0; i < max; i++) {
        const side = rng.chance(0.5) ? 1 : -1;
        const s = c.s0 + rng.range(0, CHUNK);
        const near = rng.chance(0.7);
        const off = near ? 9 + Math.pow(rng.float(), 1.6) * 70 : 80 + rng.float() * 260;
        const h = this.terrainHeight(s, off, side);
        const sc = (tree === 'pine' ? rng.range(0.8, 1.5) : rng.range(0.7, 1.3)) * (near ? 1 : 1.3);
        put(tree, s, side * (this.half + off), h - 0.1, rng.range(0, Math.PI * 2), sc);
      }
    }
    if (c.props.has('bush')) {
      const max = c.props.get('bush')!.instanceMatrix.count;
      for (let i = 0; i < max; i++) {
        const side = rng.chance(0.5) ? 1 : -1;
        const s = c.s0 + rng.range(0, CHUNK);
        const off = 3 + rng.float() * 50;
        put('bush', s, side * (this.half + off), this.terrainHeight(s, off, side) - 0.2, rng.range(0, 6.28), rng.range(0.5, 1.3));
      }
    }
    if (c.props.has('oleander')) {
      // Oleander hedge along the central reservation (classic Turkish motorway look).
      const max = c.props.get('oleander')!.instanceMatrix.count;
      for (let i = 0; i < max; i++) {
        const s = c.s0 + (i + rng.float() * 0.6) * (CHUNK / max);
        put('oleander', s, -(this.half + 1.6 + rng.float() * 0.8), this.road.height(s) - 0.25, rng.range(0, 6.28), rng.range(0.8, 1.2));
      }
    }
    for (const key of ['rock', 'redrock']) {
      if (!c.props.has(key)) continue;
      const max = c.props.get(key)!.instanceMatrix.count;
      for (let i = 0; i < max; i++) {
        const side = rng.chance(0.5) ? 1 : -1;
        const s = c.s0 + rng.range(0, CHUNK);
        const off = 7 + Math.pow(rng.float(), 1.3) * 160;
        const sc = rng.range(0.4, 1.6) * (key === 'redrock' ? 1 + off / 60 : 1);
        put(key, s, side * (this.half + off), this.terrainHeight(s, off, side) - 0.2 * sc, rng.range(0, 6.28), sc, sc * rng.range(0.8, 1.4));
      }
    }
    // Street lights every 40 m on both sides.
    c.glows.length = 0;
    if (c.props.has('lamp')) {
      const poolPos: { s: number; d: number }[] = [];
      for (let k = 0; k < CHUNK / 40; k++) {
        const s = c.s0 + k * 40 + 10;
        const y = this.road.height(s);
        put('lamp', s, edge + 0.9, y, 0, 1);
        put('lampHead', s, edge + 0.9, y, 0, 1);
        const lampD = edge + 0.9 - 2.25;
        c.glows.push(this.local(c, s, lampD, 9.6, new THREE.Vector3()));
        poolPos.push({ s, d: lampD });
        if (this.lanes.layout === 'oneway' || k % 2 === 0) {
          const s2 = s + 20;
          put('lamp', s2, -(edge + 0.9), this.road.height(s2), Math.PI, 1);
          put('lampHead', s2, -(edge + 0.9), this.road.height(s2), Math.PI, 1);
          c.glows.push(this.local(c, s2, -lampD, 9.6, new THREE.Vector3()));
          poolPos.push({ s: s2, d: -lampD });
        }
      }
      if (this.poolMat) {
        if (!c.pools) {
          const g = new THREE.PlaneGeometry(16, 13);
          g.rotateX(-Math.PI / 2);
          c.pools = new THREE.InstancedMesh(g, this.poolMat, 8);
          c.pools.frustumCulled = false;
          c.pools.renderOrder = 2;
          c.group.add(c.pools);
        }
        poolPos.forEach((p, i) => this.setInstance(c.pools!, i, c, p.s, p.d * 0.7, this.road.height(p.s) + 0.06, 0, 1));
        c.pools.count = poolPos.length;
        c.pools.instanceMatrix.needsUpdate = true;
        c.pools.computeBoundingSphere();
        c.pools.frustumCulled = true;
      }
    }
    for (const [key, im] of c.props) {
      im.count = counts.get(key) ?? 0;
      im.instanceMatrix.needsUpdate = true;
      // Bounds over all instances so both the camera and the shadow pass can cull.
      if (im.count > 0) {
        im.computeBoundingSphere();
        im.frustumCulled = true;
      } else im.frustumCulled = false;
    }
  }

  private buildBuildings(c: Chunk): void {
    if (!this.buildingMat) return;
    const rng = new Rng(Math.floor(hash01(c.index * 31337 + this.seed) * 1e9));
    const pos: number[] = [];
    const nrm: number[] = [];
    const uv: number[] = [];
    const winW = 3.1;
    const floorH = 3.4;
    const quad = (p: THREE.Vector3[], n: THREE.Vector3, u0: number, u1: number, v0: number, v1: number) => {
      const [a, b, cc, d] = p;
      for (const [v, uu, vv] of [[a, u0, v0], [b, u1, v0], [cc, u1, v1], [a, u0, v0], [cc, u1, v1], [d, u0, v1]] as [THREE.Vector3, number, number][]) {
        pos.push(v.x, v.y, v.z);
        nrm.push(n.x, n.y, n.z);
        uv.push(uu, vv);
      }
    };
    const count = Math.round(14 * this.quality.sceneryDensity + 4);
    for (let i = 0; i < count; i++) {
      const side = rng.chance(0.5) ? 1 : -1;
      const s = c.s0 + rng.range(0, CHUNK);
      const off = 22 + Math.pow(rng.float(), 1.5) * 260;
      const w = rng.range(14, 36);
      const dpt = rng.range(14, 30);
      const h = rng.range(10, 30) + Math.pow(rng.float(), 2) * (off > 60 ? 140 : 40);
      const cx = side * (this.half + off + dpt / 2);
      const ground = this.road.height(s) - 0.2;
      this.road.toWorld(s, cx, _v);
      const center = _v.clone().sub(c.origin);
      center.y = ground - c.origin.y;
      const yaw = this.road.yaw(s);
      const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      const hw = w / 2;
      const hd = dpt / 2;
      const corner = (fx: number, rx: number, y: number) =>
        center.clone().addScaledVector(fwd, fx).addScaledVector(right, rx).add(new THREE.Vector3(0, y, 0));
      const vTop = h / (16 * floorH);
      const faces: [number, number, number, number, THREE.Vector3, number][] = [
        // [fx0, rx0, fx1, rx1, normal, width]
        [-hw, -hd, hw, -hd, right.clone().multiplyScalar(-1), w],
        [hw, hd, -hw, hd, right.clone(), w],
        [hw, -hd, hw, hd, fwd.clone(), dpt],
        [-hw, hd, -hw, -hd, fwd.clone().multiplyScalar(-1), dpt],
      ];
      const u0 = rng.float();
      for (const [f0, r0, f1, r1, n, len] of faces) {
        quad([corner(f0, r0, 0), corner(f1, r1, 0), corner(f1, r1, h), corner(f0, r0, h)], n, u0, u0 + len / (8 * winW), 0, vTop);
      }
      // Roof (dark corner of the texture)
      quad([corner(-hw, -hd, h), corner(hw, -hd, h), corner(hw, hd, h), corner(-hw, hd, h)], new THREE.Vector3(0, 1, 0), 0, 0.01, 0, 0.01);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeBoundingSphere();
    if (!c.buildings) {
      c.buildings = new THREE.Mesh(g, this.buildingMat);
      c.buildings.castShadow = true;
      c.buildings.receiveShadow = true;
      c.group.add(c.buildings);
    } else {
      c.buildings.geometry.dispose();
      c.buildings.geometry = g;
    }
  }

  private buildGantry(c: Chunk): void {
    const every = 9;
    if (c.gantry) {
      c.group.remove(c.gantry);
      disposeOwned(c.gantry);
      c.gantry = null;
    }
    if (c.index % every !== 4) return;
    const s = c.s0 + 60;
    const g = new THREE.Group();
    const steel = this.mats.metal('#8f969d', 0.45);
    const span = this.half * 2 + 2.2;
    const yaw = this.road.yaw(s);
    this.local(c, s, 0, 0, _v);
    g.position.copy(_v);
    g.rotation.y = yaw;
    for (const sd of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 7.6, 10), steel);
      post.position.set(sd * span / 2, 3.8, 0);
      post.castShadow = true;
      g.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(span, 0.5, 0.6), steel);
    beam.position.y = 7.4;
    beam.castShadow = true;
    g.add(beam);
    const km = Math.max(1, Math.round(c.s0 / 1000));
    const rng = new Rng(c.index);
    const pick = () => CITIES[rng.int(0, CITIES.length - 1)];
    const signs: [string, string][][] = [
      [[pick()[0], `${Math.max(3, pick()[1] - km)}`], [pick()[0], `${Math.max(5, pick()[1] - km)}`]],
      [[pick()[0], `${Math.max(2, pick()[1] - km)}`], ['ÇIKIŞ', `${rng.int(1, 3)} km`]],
    ];
    signs.forEach((lines, i) => {
      const tex = signTexture(lines);
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.1, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: this.env.scenery.lightsOn ? 0.35 : 0.05 });
      // BoxGeometry face 4 (+Z) faces the approaching rider once the gantry is yawed.
      const panel = new THREE.Mesh(new THREE.BoxGeometry(7.2, 3.4, 0.12), [steel, steel, steel, steel, mat, steel]);
      panel.position.set((i === 0 ? -1 : 1) * span * 0.22, 8.9, 0.2);
      panel.castShadow = true;
      g.add(panel);
    });
    c.gantry = g;
    c.group.add(g);
  }

  /** Street-lamp glows for the GlowPoints system (world/rebased coordinates). */
  collectGlows(glow: GlowPoints, camPos: THREE.Vector3): void {
    if (!this.env.scenery.lightsOn) return;
    for (const c of this.active.values()) {
      for (const g of c.glows) {
        const x = g.x + c.group.position.x;
        const y = g.y + c.group.position.y;
        const z = g.z + c.group.position.z;
        const d2 = (x - camPos.x) ** 2 + (z - camPos.z) ** 2;
        if (d2 > 1200 * 1200) continue;
        glow.add(x, y, z, 1.6, 0.95, 0.55, 2.6);
      }
    }
  }

  dispose(): void {
    for (const c of this.chunks) if (c.gantry) disposeOwned(c.gantry);
    // Release everything the world created, including detached recycled chunks.
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      if ((m as unknown as THREE.InstancedMesh).isInstancedMesh) (m as unknown as THREE.InstancedMesh).dispose();
    });
    for (const g of this.propGeo.values()) g.dispose();
    this.surfaces.dispose();
    this.group.clear();
  }

  get currentOriginS(): number {
    return this.originS;
  }
}
