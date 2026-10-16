import * as THREE from 'three';
import type { EnvDef } from '../data/environments';
import { fbm2, noise2, smoothstep } from '../core/math';
import { pavedHalfWidth, type LaneConfig, type RoadPath } from '../world/road';
import type { GlowPoints } from './effects';
import type { Materials } from './materials';
import type { QualityProfile } from './quality';
import { createSurfaces, type WorldSurfaces } from './surfaces';
import { ROAD_TEX_LENGTH } from './textures';
import { Backdrop } from './world/backdrop';
import { createScenery } from './world/maps';
import { ChunkBuild, SceneryChunk, type Scenery, type SceneryHost } from './world/scenery';
import { WorldMaterials } from './world/worldMaterials';

export const CHUNK = 120;
const STEP = 4;
const ROWS = CHUNK / STEP + 1;
const ROAD_COLS = [-1, -0.5, 0, 0.5, 1];
// Columns are dense near the road (where the eye is) and sparse far out; maps with cliffs or valleys add extra ones.
const TERRAIN_OFFS = [0, 0.9, 2.2, 4.2, 7, 11, 15, 20, 27, 36, 48, 64, 90, 135, 200, 290, 420];

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

class Chunk {
  index = -1;
  s0 = 0;
  readonly group = new THREE.Group();
  readonly origin = new THREE.Vector3();
  road: THREE.Mesh;
  terrain: THREE.Mesh;
  railR: THREE.Mesh;
  railL: THREE.Mesh;
  posts: THREE.InstancedMesh;
  scn: SceneryChunk;
  /** Whether the chunk's scenery is currently built for `index` (false after recycling until rebuilt). */
  constructor(roadMat: THREE.Material, terrainMat: THREE.Material, railMatR: THREE.Material, railMatL: THREE.Material, postGeo: THREE.BufferGeometry, postMat: THREE.Material) {
    this.road = new THREE.Mesh(new THREE.BufferGeometry(), roadMat);
    this.road.receiveShadow = true;
    this.terrain = new THREE.Mesh(new THREE.BufferGeometry(), terrainMat);
    this.terrain.receiveShadow = true;
    this.railR = new THREE.Mesh(new THREE.BufferGeometry(), railMatR);
    this.railL = new THREE.Mesh(new THREE.BufferGeometry(), railMatL);
    this.railR.castShadow = this.railL.castShadow = true;
    this.railR.receiveShadow = this.railL.receiveShadow = true;
    this.posts = new THREE.InstancedMesh(postGeo, postMat, ROWS * 2);
    this.posts.count = 0;
    this.posts.frustumCulled = false;
    this.group.add(this.road, this.terrain, this.railR, this.railL, this.posts);
    this.scn = new SceneryChunk(this.group);
  }
}

/**
 * Streams the highway and its surroundings in fixed-length chunks around the
 * rider, recycling geometry buffers. World coordinates are re-based every
 * couple of kilometres to keep float precision on the GPU.
 *
 * The road, terrain and guardrails are generated here; everything beside the road (trees, houses,
 * signs, water, tunnels…) comes from the per-map scenery builders in `world/`.
 */
export class WorldView implements SceneryHost {
  readonly group = new THREE.Group();
  readonly origin = new THREE.Vector3();
  private chunks: Chunk[] = [];
  private active = new Map<number, Chunk>();
  private free: Chunk[] = [];
  private roadMat: THREE.MeshStandardMaterial;
  private terrainMat: THREE.MeshStandardMaterial;
  private railMat: THREE.MeshStandardMaterial;
  private barrierMat: THREE.MeshStandardMaterial;
  private surfaces: WorldSurfaces;
  private postGeo: THREE.BufferGeometry;
  private postMat: THREE.MeshStandardMaterial;
  private backdrop: THREE.Group;
  private backdropObj: Backdrop;
  readonly half: number;
  private originS = 0;
  readonly seed: number;
  readonly scenery: Scenery;
  /** Scenery materials of this run (foliage, PBR sets); also feeds wind/snow uniforms. */
  readonly worldMats: WorldMaterials;
  private lastPlayerS = 0;
  /** Terrain mesh columns: the shared set plus whatever the map's relief needs. */
  private terrainOffs: number[];
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
    this.postGeo = new THREE.BoxGeometry(0.12, 0.85, 0.08).translate(0, 0.42, 0);
    this.postMat = new THREE.MeshStandardMaterial({ color: '#a7adb3', roughness: 0.5, metalness: 0.6 });
    this.worldMats = new WorldMaterials(quality, env.world.snow > 0);
    this.worldMats.uniforms.uWind.value = env.world.wind;
    this.worldMats.uniforms.uSnow.value = env.world.snow;
    this.worldMats.uniforms.uNight.value = env.scenery.lightsOn ? 1 : 0;
    this.scenery = createScenery(this);
    this.terrainOffs = [...new Set([...TERRAIN_OFFS, ...this.scenery.extraTerrainOffsets()])].sort((a, b) => a - b);
    this.group.add(this.scenery.group);
    this.backdropObj = new Backdrop(this.scenery.ranges(), env.fog.color);
    this.backdrop = this.backdropObj.group;
    this.group.add(this.backdrop);
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
    return this.scenery.terrain(s, off, side, base + ditch + hill + far);
  }

  private groundColor(s: number, off: number, h: number, out: THREE.Color, side: number): THREE.Color {
    if (this.scenery.groundColor(s, off, h, out, side)) return out;
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
    this.lastPlayerS = playerS;
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
    // Scenery LOD per chunk and per-frame animation (wind, water, smoke).
    for (const c of this.active.values()) c.scn.applyLod(Math.abs(c.s0 + CHUNK * 0.5 - playerS));
    const t = typeof performance !== 'undefined' ? performance.now() / 1000 : 0;
    this.worldMats.update(t);
    this.scenery.update(playerS, t, _v.set(0, 0, 0));
  }

  /** Build all chunks within view immediately (used while loading). */
  prewarm(playerS: number): void {
    for (let k = 0; k < 40; k++) this.update(playerS);
  }

  /** 0..1 how enclosed the rider is at road distance s (tunnels): lighting and acoustics follow it. */
  enclosure(s: number): number {
    return this.scenery.enclosure(s);
  }

  private newChunk(): Chunk {
    const c = new Chunk(this.roadMat, this.terrainMat, this.railMat, this.lanes.layout === 'oneway' ? this.barrierMat : this.railMat, this.postGeo, this.postMat);
    this.scenery.attach(c.scn);
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
    this.buildPosts(c);
    this.buildScenery(c);
  }

  private buildScenery(c: Chunk): void {
    c.scn.reset();
    c.scn.index = c.index;
    c.scn.s0 = c.s0;
    const ctx = new ChunkBuild(this, c.scn, c.index, c.s0, c.origin, this.scenery);
    this.scenery.build(ctx);
    ctx.commit();
    c.scn.applyLod(Math.abs(c.s0 + CHUNK * 0.5 - this.lastPlayerS));
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
        // v counts road distance in texture repeats. The chunk start wraps every 2.4 km (a multiple of every texture period) to keep
        // float precision in the surface shader; wrapping per chunk, not per row, keeps v continuous inside a chunk.
        uv.set([(ROAD_COLS[k] + 1) / 2, (((((c.s0 % 2400) + 2400) % 2400) + r * STEP) / ROAD_TEX_LENGTH)], i * 2);
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
    const offs = this.terrainOffs;
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
          this.groundColor(s, off, h - this.road.height(s), color, sg);
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

  /** Guardrail posts every 4 m on the right (and left for two-way roads). */
  private buildPosts(c: Chunk): void {
    const edge = this.half + 0.45;
    let n = 0;
    for (let r = 0; r < ROWS - 1; r++) {
      const s = c.s0 + r * STEP + 2;
      this.setPost(c, n++, s, edge + 0.08);
      if (this.lanes.layout === 'twoway') this.setPost(c, n++, s, -edge - 0.08);
    }
    c.posts.count = n;
    c.posts.instanceMatrix.needsUpdate = true;
    c.posts.computeBoundingSphere();
    c.posts.frustumCulled = true;
  }

  private setPost(c: Chunk, i: number, s: number, d: number): void {
    this.road.toWorld(s, d, _v);
    _v.y = this.road.height(s);
    _v.sub(c.origin);
    _q.setFromEuler(_e.set(0, this.road.yaw(s), 0));
    _s.set(1, 1, 1);
    _m.compose(_v, _q, _s);
    c.posts.setMatrixAt(i, _m);
  }

  /** Light glows (street lamps, tunnel lights, neon) for the GlowPoints system (world/rebased coordinates). */
  collectGlows(glow: GlowPoints, camPos: THREE.Vector3): void {
    if (!this.env.scenery.lightsOn) return;
    for (const c of this.active.values()) {
      for (const g of c.scn.glows) {
        const x = g.p.x + c.group.position.x;
        const y = g.p.y + c.group.position.y;
        const z = g.p.z + c.group.position.z;
        const d2 = (x - camPos.x) ** 2 + (z - camPos.z) ** 2;
        if (d2 > 1200 * 1200) continue;
        glow.add(x, y, z, g.r, g.g, g.b, g.size);
      }
    }
  }

  dispose(): void {
    this.scenery.dispose();
    this.backdropObj.dispose();
    for (const c of this.chunks) {
      c.scn.dispose();
      c.posts.dispose();
    }
    // Release everything the world created, including detached recycled chunks.
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      if ((m as unknown as THREE.InstancedMesh).isInstancedMesh) (m as unknown as THREE.InstancedMesh).dispose();
    });
    this.postGeo.dispose();
    this.postMat.dispose();
    this.worldMats.dispose();
    this.surfaces.dispose();
    this.group.clear();
  }

  /** Debug/test: instance counts per prop key over the active chunks, plus draw-visible meshes. */
  debugCounts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const c of this.active.values()) for (const [k, set] of c.scn.props) out[k] = (out[k] ?? 0) + set.count;
    return out;
  }

  get currentOriginS(): number {
    return this.originS;
  }
}
