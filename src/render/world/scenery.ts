import * as THREE from 'three';
import type { EnvDef } from '../../data/environments';
import { Rng } from '../../core/math';
import type { LaneConfig, RoadPath } from '../../world/road';
import type { QualityProfile } from '../quality';
import { GeoBuilder, composeMatrix, rgb, type RGB } from './kit';
import { PropSet, type PropDef } from './instances';
import { simpleProp, treePropDef } from './instances';
import { TREE_SPECS, buildTree, disposeTree, type TreeId, type TreeModel } from './trees';
import type { RangeSpec } from './backdrop';
import { LampKit, type LampKitOptions } from './lighting';
import type { WorldMaterials } from './worldMaterials';

/**
 * Contract between WorldView (road, terrain, rails, chunk streaming) and the per-map scenery
 * builders in `world/maps/*`. A builder fills one chunk at a time with instanced props and merged
 * static meshes; WorldView owns the chunk lifecycle and disposes through `SceneryChunk.reset`.
 */

export interface SceneryHost {
  readonly road: RoadPath;
  readonly lanes: LaneConfig;
  /** Half width of the paved road including shoulders. */
  readonly half: number;
  readonly env: EnvDef;
  readonly quality: QualityProfile;
  readonly seed: number;
  readonly worldMats: WorldMaterials;
  /** Terrain height (world y) `off` metres outside the paved edge on `side` (±1) at road distance s. */
  terrainHeight(s: number, off: number, side: number): number;
}

export const CHUNK_LENGTH = 120;

/** Per-chunk container for scenery: instanced prop sets and merged static meshes. */
export class SceneryChunk {
  readonly group = new THREE.Group();
  readonly props = new Map<string, PropSet>();
  private statics = new Map<string, THREE.Mesh>();
  /** Light glow positions (chunk-local) for the additive glow points. */
  readonly glows: { p: THREE.Vector3; r: number; g: number; b: number; size: number }[] = [];
  /** Extra objects a builder wants disposed with the chunk (animated or per-chunk meshes). */
  readonly extras: THREE.Object3D[] = [];
  index = -1;
  s0 = 0;

  constructor(parent: THREE.Object3D) {
    this.group.name = 'scenery';
    parent.add(this.group);
  }

  /** Free per-build content (merged geometry, extras) but keep the instance buffers for reuse. */
  reset(): void {
    for (const m of this.statics.values()) {
      m.geometry.dispose();
      m.geometry = EMPTY;
      m.visible = false;
    }
    for (const o of this.extras) {
      o.removeFromParent();
      disposeExtra(o);
    }
    this.extras.length = 0;
    this.glows.length = 0;
    for (const p of this.props.values()) p.begin();
  }

  setStatic(key: string, geometry: THREE.BufferGeometry, material: THREE.Material, shadow: boolean): void {
    let m = this.statics.get(key);
    if (!m) {
      m = new THREE.Mesh(EMPTY, material);
      m.matrixAutoUpdate = false;
      m.receiveShadow = true;
      this.group.add(m);
      this.statics.set(key, m);
    }
    m.geometry = geometry;
    m.material = material;
    m.castShadow = shadow;
    m.visible = true;
  }

  applyLod(dc: number): void {
    for (const p of this.props.values()) p.applyLod(dc);
  }

  dispose(): void {
    for (const p of this.props.values()) p.dispose();
    this.props.clear();
    for (const m of this.statics.values()) m.geometry.dispose();
    this.statics.clear();
    this.reset();
    this.group.removeFromParent();
  }
}

const EMPTY = new THREE.BufferGeometry();

/** Dispose a per-chunk object: geometry always; materials and textures when flagged `userData.owned`. */
export function disposeExtra(o: THREE.Object3D): void {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      if (!mat.userData.owned) continue;
      const std = mat as THREE.MeshStandardMaterial;
      for (const t of [std.map, std.emissiveMap]) if (t?.userData.owned) t.dispose();
      mat.dispose();
    }
  });
}

export interface PutOptions {
  yaw?: number;
  scale?: number;
  /** Non-uniform horizontal scale multiplier. */
  scaleXZ?: number;
  /** World height override (otherwise the terrain height at the placement). */
  y?: number;
  /** Sink into the ground by this many metres (rocks, house footings). */
  sink?: number;
  tint?: THREE.Color | null;
  pitch?: number;
  roll?: number;
}

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();

/** Everything a map builder gets for one chunk. */
export class ChunkBuild {
  readonly rng: Rng;
  /** Density multiplier from the world.scenery setting. */
  readonly density: number;
  readonly origin = new THREE.Vector3();
  private builders = new Map<string, GeoBuilder>();

  constructor(
    readonly host: SceneryHost,
    readonly chunk: SceneryChunk,
    readonly index: number,
    readonly s0: number,
    origin: THREE.Vector3,
    readonly scenery: Scenery,
  ) {
    this.origin.copy(origin);
    this.rng = new Rng(Math.floor(hash(index * 7919 + host.seed * 104729) * 1e9));
    this.density = host.quality.sceneryDensity;
  }

  get road(): RoadPath {
    return this.host.road;
  }

  /** Chunk-local position of road point (s, d) at `up` metres above the road surface. */
  local(s: number, d: number, up: number, out: THREE.Vector3 = _p): THREE.Vector3 {
    this.host.road.toWorld(s, d, out, up);
    return out.sub(this.origin);
  }

  /** World height of the terrain/road surface at lateral offset d. */
  groundY(s: number, d: number): number {
    const off = Math.abs(d) - this.host.half;
    if (off <= 0) return this.host.road.height(s);
    return this.host.terrainHeight(s, off, d < 0 ? -1 : 1);
  }

  /** Chunk-local y of a world height. */
  localY(worldY: number): number {
    return worldY - this.origin.y;
  }

  /** Yaw of the road at s. */
  yaw(s: number): number {
    return this.host.road.yaw(s);
  }

  /** Yaw offset that makes an object's front (−Z) face the road from the given side. */
  faceRoad(side: number): number {
    return side * (Math.PI / 2);
  }

  /** Place one instance of a registered prop. Returns false when the chunk's buffer is full or the prop is unknown. */
  put(key: string, s: number, d: number, o: PutOptions = {}, near = true): boolean {
    const set = this.chunk.props.get(key);
    if (!set) return false;
    const wy = o.y ?? this.groundY(s, d) - (o.sink ?? 0);
    this.host.road.toWorld(s, d, _p);
    _p.x -= this.origin.x;
    _p.z -= this.origin.z;
    _p.y = wy - this.origin.y;
    const sc = o.scale ?? 1;
    composeMatrix(_m, _p.x, _p.y, _p.z, this.host.road.yaw(s) + (o.yaw ?? 0), sc * (o.scaleXZ ?? 1), sc, sc * (o.scaleXZ ?? 1), o.pitch ?? 0, o.roll ?? 0);
    return set.add(_m, o.tint ?? null, near);
  }

  /** Merged static geometry for a registered material key; author in chunk-local coordinates. */
  stat(key: string): GeoBuilder {
    let b = this.builders.get(key);
    if (!b) {
      b = new GeoBuilder({ sway: this.scenery.staticSway.has(key) });
      this.builders.set(key, b);
    }
    return b;
  }

  /** Push a builder frame at road point (s, d), standing on the ground, yawed with the road plus `yawExtra`. */
  frame(b: GeoBuilder, s: number, d: number, yawExtra = 0, up?: number, sink = 0): GeoBuilder {
    const y = up !== undefined ? this.local(s, d, up).y : this.localY(this.groundY(s, d)) - sink;
    const p = this.local(s, d, 0);
    return b.push(p.x, y, p.z, this.yaw(s) + yawExtra);
  }

  glow(s: number, d: number, up: number, r: number, g: number, b: number, size: number): void {
    if (this.chunk.glows.length >= MAX_GLOWS) return;
    this.chunk.glows.push({ p: this.local(s, d, up, new THREE.Vector3()), r, g, b, size });
  }

  /** Finish the chunk: bake the merged builders into meshes and close instance buffers. */
  commit(): void {
    for (const [key, b] of this.builders) {
      if (b.vertexCount === 0) continue;
      const mat = this.scenery.statics.get(key);
      if (!mat) continue;
      this.chunk.setStatic(key, b.build(), mat.material, mat.shadow && this.host.quality.worldShadows);
    }
    this.builders.clear();
    for (const p of this.chunk.props.values()) p.end();
  }
}

const MAX_GLOWS = 16;

function hash(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export interface StaticDef {
  material: THREE.Material;
  shadow: boolean;
}

export interface TerrainShape {
  /** Extra metres added to the generic terrain height. */
  height?: (s: number, off: number, side: number, base: number) => number;
}

/**
 * Base class of the eight map builders: holds prop and static-material registries and the
 * per-frame update hooks. Subclasses call `defineTree`/`defineProp` in their constructor and
 * implement `build`.
 */
export abstract class Scenery {
  readonly propDefs = new Map<string, PropDef>();
  readonly statics = new Map<string, StaticDef>();
  /** Static material keys whose geometry carries wind attributes. */
  readonly staticSway = new Set<string>();
  protected trees: TreeModel[] = [];
  /** Per-run objects (animated meshes, particle systems) owned by the scenery. */
  protected disposables: { dispose(): void }[] = [];

  constructor(readonly host: SceneryHost) {}

  /** Register all variants of a species as props `${id}#${variant}`; returns their keys. */
  protected defineTree(id: TreeId, max: number, opts: { shadow?: boolean; ranges?: { hi: number; mid: number }; variants?: number; maxDist?: number } = {}): string[] {
    const spec = TREE_SPECS[id];
    const n = opts.variants ?? spec.variants;
    const keys: string[] = [];
    for (let v = 0; v < n; v++) {
      const model = buildTree(spec, v);
      this.trees.push(model);
      const key = `${id}#${v}`;
      this.propDefs.set(
        key,
        treePropDef(key, model, this.host.worldMats, { max: Math.max(2, Math.ceil(max / n) + 1), shadow: opts.shadow ?? this.host.quality.worldShadows, ranges: opts.ranges, maxDist: opts.maxDist }),
      );
      keys.push(key);
    }
    return keys;
  }

  /** Register a single-LOD instanced prop from baked geometry (the scenery owns and disposes the geometry). */
  protected defineProp(key: string, geometry: THREE.BufferGeometry, material: THREE.Material, o: { max: number; shadow?: boolean; renderOrder?: number }): void {
    const def = simpleProp(key, geometry, material, { max: Math.max(2, Math.ceil(o.max)), shadow: (o.shadow ?? false) && this.host.quality.worldShadows });
    def.renderOrder = o.renderOrder;
    this.propDefs.set(key, def);
    this.ownedGeometry.push(geometry);
  }

  protected ownedGeometry: THREE.BufferGeometry[] = [];

  /** Street-lamp family (poles, heads, pools, glows) registered on this scenery. */
  protected defineLamps(opts: LampKitOptions): LampKit {
    return new LampKit(
      { prop: (k, g, m, o) => this.defineProp(k, g, m, o), adopt: (m) => this.host.worldMats.adopt(m) },
      opts,
      this.host.worldMats.plain({ roughness: 0.55, metalness: 0.5 }),
      this.host.env.scenery.lightsOn,
    );
  }

  protected defineStatic(key: string, material: THREE.Material, shadow = false, sway = false): void {
    this.statics.set(key, { material, shadow });
    if (sway) this.staticSway.add(key);
  }

  /** Every material this scenery can draw (prop LODs and statics), including pieces no chunk has built yet. */
  materials(out: Set<THREE.Material>): void {
    for (const def of this.propDefs.values()) for (const lod of def.lods) for (const part of lod.parts) out.add(part.material);
    for (const s of this.statics.values()) out.add(s.material);
  }

  /** Create the instance buffers a chunk needs for this map. */
  attach(chunk: SceneryChunk): void {
    for (const [key, def] of this.propDefs) {
      if (!chunk.props.has(key)) chunk.props.set(key, new PropSet(def, chunk.group));
    }
  }

  /** Terrain height shaping (generic hills come from WorldView; maps add dunes, cliffs, valleys…). */
  terrain(_s: number, _off: number, _side: number, base: number): number {
    return base;
  }

  /** Extra terrain mesh columns (metres beyond the paved edge) for maps with fine relief: river banks, cliffs. */
  extraTerrainOffsets(): number[] {
    return [];
  }

  /** Ground colour override (vertex colour of the terrain); return false to keep the default. */
  groundColor(_s: number, _off: number, _h: number, _out: THREE.Color, _side: number): boolean {
    return false;
  }

  /** Fill one chunk (called after the chunk's road/terrain/rails were built). */
  abstract build(ctx: ChunkBuild): void;

  /** Per-frame hook (animation, water, smoke…). `playerS` in road metres, `time` seconds. */
  update(_playerS: number, _time: number, _camera: THREE.Vector3): void {}

  /** Distant mountain ranges (back to front); maps override for alpine peaks, sea horizons, skylines. */
  ranges(): RangeSpec[] {
    const m = this.host.env.mountains;
    return [
      { radius: 3200, height: 520, low: m.far, mid: m.far, peak: m.far, snowLine: 9, sharp: 0.3, amp: 0.5 * m.height, seed: 3, haze: 0.5 },
      { radius: 2600, height: 360, low: m.near, mid: m.near, peak: m.far, snowLine: 9, sharp: 0.4, amp: 0.55 * m.height, seed: 8, haze: 0.28 },
    ];
  }

  /** 0..1 how enclosed the rider is at s (tunnels); drives lighting and audio reverb. */
  enclosure(_s: number): number {
    return 0;
  }

  /** Objects the map adds to the world group once (water, sky dressing, particle fields). */
  readonly group = new THREE.Group();

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
    for (const t of this.trees) disposeTree(t);
    this.trees.length = 0;
    for (const g of this.ownedGeometry) g.dispose();
    this.ownedGeometry.length = 0;
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    this.group.clear();
  }
}

/** Tint helper: a random colour jitter around a base, as THREE.Color for instance buffers. */
export function jitterTint(rng: Rng, base: RGB | string, amount: number, out: THREE.Color = new THREE.Color()): THREE.Color {
  const c = typeof base === 'string' ? rgb(base) : base;
  const k = 1 + (rng.float() - 0.5) * 2 * amount;
  const w = (rng.float() - 0.5) * amount;
  return out.setRGB(c[0] * k * (1 + w), c[1] * k, c[2] * k * (1 - w));
}
