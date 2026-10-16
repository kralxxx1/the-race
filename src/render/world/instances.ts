import * as THREE from 'three';
import type { WorldMaterials } from './worldMaterials';
import type { TreeModel } from './trees';

/**
 * Chunk-local instancing with distance LODs.
 *
 * A PropDef describes one kind of roadside object (a tree variant, a lamp post…) as a list of
 * LODs, each with one or more parts (trunk + leaves). A PropSet is the per-chunk instance buffer
 * set for a PropDef: every placement is written to all LOD meshes once, and the chunk's distance
 * to the rider then only toggles `visible` flags: no per-frame matrix work.
 */

export interface PartDef {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  castShadow: boolean;
}

export interface LodDef {
  parts: PartDef[];
  /** Chunk distance range (metres of road from the rider) in which this LOD is drawn. */
  from: number;
  to: number;
  /** Which placements this LOD draws: roadside band, far band (never closer than the mid LOD) or both. */
  band: 'near' | 'far' | 'all';
}

export interface PropDef {
  key: string;
  lods: LodDef[];
  /** Instance capacity per chunk. */
  max: number;
  /** Bounding radius of one object (frustum culling margin). */
  radius: number;
}

interface Entry {
  mesh: THREE.InstancedMesh;
  lod: LodDef;
  n: number;
}

const _white = new THREE.Color(1, 1, 1);

export class PropSet {
  private entries: Entry[] = [];
  /** Instances written in the last build (any LOD). */
  count = 0;

  constructor(
    readonly def: PropDef,
    parent: THREE.Object3D,
  ) {
    for (const lod of def.lods) {
      for (const part of lod.parts) {
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, def.max);
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(def.max * 3).fill(1), 3);
        mesh.count = 0;
        mesh.castShadow = part.castShadow;
        mesh.receiveShadow = false;
        mesh.frustumCulled = false;
        mesh.matrixAutoUpdate = false;
        mesh.visible = false;
        mesh.name = def.key;
        parent.add(mesh);
        this.entries.push({ mesh, lod, n: 0 });
      }
    }
  }

  begin(): void {
    this.count = 0;
    for (const e of this.entries) e.n = 0;
  }

  /** Write one placement (chunk-local matrix). `near` = within the roadside band that may use LOD 0/1. */
  add(m: THREE.Matrix4, tint: THREE.Color | null, near: boolean): boolean {
    if (this.count >= this.def.max) return false;
    for (const e of this.entries) {
      if (e.lod.band !== 'all' && (e.lod.band === 'near') !== near) continue;
      const i = e.n++;
      e.mesh.setMatrixAt(i, m);
      e.mesh.setColorAt(i, tint ?? _white);
    }
    this.count++;
    return true;
  }

  end(): void {
    for (const e of this.entries) {
      e.mesh.count = e.n;
      if (e.n > 0) {
        e.mesh.instanceMatrix.needsUpdate = true;
        if (e.mesh.instanceColor) e.mesh.instanceColor.needsUpdate = true;
        e.mesh.computeBoundingSphere();
        e.mesh.frustumCulled = true;
      } else e.mesh.frustumCulled = false;
    }
  }

  /** Show the LOD that matches the chunk's road distance from the rider. */
  applyLod(dc: number): void {
    for (const e of this.entries) e.mesh.visible = e.n > 0 && dc >= e.lod.from && dc < e.lod.to;
  }

  hide(): void {
    for (const e of this.entries) e.mesh.visible = false;
  }

  /** Remove meshes from the scene; geometries/materials belong to the PropDef owner. */
  dispose(): void {
    for (const e of this.entries) {
      e.mesh.removeFromParent();
      e.mesh.dispose();
    }
    this.entries.length = 0;
  }
}

export interface TreeLodRanges {
  hi: number;
  mid: number;
}

/** PropDef for a built tree: LOD0 near, LOD1 mid, LOD2 far (far band starts at the mid LOD). */
export function treePropDef(key: string, model: TreeModel, mats: WorldMaterials, opts: { max: number; shadow: boolean; ranges?: TreeLodRanges; swayScale?: number; maxDist?: number }): PropDef {
  const r = opts.ranges ?? { hi: 70, mid: 230 };
  const spec = model.spec;
  const leafMat = mats.foliage(spec.atlas, { sway: spec.sway * (opts.swayScale ?? 1) });
  const trunkMat = mats.pbr('bark', { roughness: 1 });
  const mk = (i: 0 | 1 | 2, from: number, to: number, band: LodDef['band']): LodDef => {
    const l = model.lods[i];
    const parts: PartDef[] = [];
    if (l.trunk) parts.push({ geometry: l.trunk, material: trunkMat, castShadow: opts.shadow && i === 0 });
    parts.push({ geometry: l.leaves, material: leafMat, castShadow: opts.shadow && i === 0 });
    return { parts, from, to, band };
  };
  const bound = spec.height + spec.radius;
  return {
    key,
    lods: [mk(0, 0, r.hi, 'near'), mk(1, r.hi, r.mid, 'near'), mk(1, 0, r.mid, 'far'), mk(2, r.mid, opts.maxDist ?? 1e9, 'all')],
    max: opts.max,
    radius: bound,
  };
}

/** Single-LOD prop from one baked geometry (poles, lamps, rocks, barrels…). */
export function simpleProp(key: string, geometry: THREE.BufferGeometry, material: THREE.Material, opts: { max: number; shadow?: boolean; radius?: number }): PropDef {
  geometry.computeBoundingSphere();
  return {
    key,
    lods: [{ parts: [{ geometry, material, castShadow: opts.shadow ?? false }], from: 0, to: 1e9, band: 'all' }],
    max: opts.max,
    radius: opts.radius ?? geometry.boundingSphere?.radius ?? 5,
  };
}

/** Prop with a detailed near geometry and a cheaper far one (rocks, buildings…). */
export function lodProp(key: string, near: THREE.BufferGeometry, far: THREE.BufferGeometry, material: THREE.Material, opts: { max: number; shadow?: boolean; switchAt: number }): PropDef {
  near.computeBoundingSphere();
  return {
    key,
    lods: [
      { parts: [{ geometry: near, material, castShadow: opts.shadow ?? false }], from: 0, to: opts.switchAt, band: 'near' },
      { parts: [{ geometry: far, material, castShadow: false }], from: opts.switchAt, to: 1e9, band: 'near' },
      { parts: [{ geometry: far, material, castShadow: false }], from: 0, to: 1e9, band: 'far' },
    ],
    max: opts.max,
    radius: near.boundingSphere?.radius ?? 5,
  };
}
