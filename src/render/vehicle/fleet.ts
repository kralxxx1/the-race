import * as THREE from 'three';
import type { VehicleKind } from '../../data/vehicles';
import { VEHICLE_KINDS } from '../../data/vehicles';
import type { LodGeometry } from './build';
import { createFleetMaterials, type FleetMaterials } from './materials';
import { vehicleGeometry } from './models';
import { wheelGeometry, type WheelType } from './wheels';

/** Per-car lamp intensities (emissive multipliers) written into the instance attributes. */
export interface LampState {
  head: number;
  tail: number;
  indL: number;
  indR: number;
  reverse: number;
  beaconA: number;
  beaconB: number;
  aux: number;
}

export function newLampState(): LampState {
  return { head: 0, tail: 0, indL: 0, indR: 0, reverse: 0, beaconA: 0, beaconB: 0, aux: 0 };
}

type Slot = 'paint' | 'detail' | 'glass' | 'lamp';

/**
 * Instance storage for one model at one level of detail: the instanced meshes of its material
 * slots share one matrix / style / lamp buffer, so adding a car is a single write.
 */
export class Bucket {
  count = 0;
  readonly meshes: THREE.InstancedMesh[] = [];
  private readonly matrix: THREE.InstancedBufferAttribute;
  private readonly color: THREE.InstancedBufferAttribute;
  private readonly style: THREE.InstancedBufferAttribute;
  private readonly lampA: THREE.InstancedBufferAttribute;
  private readonly lampB: THREE.InstancedBufferAttribute;

  constructor(
    readonly kind: VehicleKind,
    readonly lod: 0 | 1,
    geo: LodGeometry,
    mats: FleetMaterials,
    readonly cap: number,
    parent: THREE.Group,
  ) {
    const dyn = (a: THREE.InstancedBufferAttribute) => a.setUsage(THREE.DynamicDrawUsage);
    this.matrix = dyn(new THREE.InstancedBufferAttribute(new Float32Array(cap * 16), 16));
    this.color = dyn(new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3));
    this.style = dyn(new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4));
    this.lampA = dyn(new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4));
    this.lampB = dyn(new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4));
    const slots: [Slot, THREE.BufferGeometry | undefined, THREE.Material][] = [
      ['paint', geo.paint, mats.paint],
      ['detail', geo.detail, mats.detail],
      ['glass', geo.glass, mats.glass],
      ['lamp', geo.lamp, mats.lamp],
    ];
    for (const [slot, g, m] of slots) {
      if (!g) continue;
      // A view of the shared model geometry that owns only the instance attributes.
      const view = new THREE.BufferGeometry();
      for (const name of Object.keys(g.attributes)) view.setAttribute(name, g.attributes[name]);
      view.boundingSphere = g.boundingSphere;
      view.boundingBox = g.boundingBox;
      view.setAttribute('aStyle', this.style);
      if (slot === 'lamp') {
        view.setAttribute('aLampA', this.lampA);
        view.setAttribute('aLampB', this.lampB);
      }
      const mesh = new THREE.InstancedMesh(view, m, 1);
      mesh.instanceMatrix = this.matrix;
      if (slot === 'paint') mesh.instanceColor = this.color;
      mesh.frustumCulled = false;
      mesh.castShadow = slot === 'paint' || slot === 'detail';
      mesh.receiveShadow = false;
      mesh.count = 0;
      mesh.visible = false;
      mesh.renderOrder = slot === 'glass' ? 2 : 0;
      mesh.name = `${kind}-lod${lod}-${slot}`;
      parent.add(mesh);
      this.meshes.push(mesh);
    }
  }

  reset(): void {
    this.count = 0;
  }

  /** Append a car; returns false when the bucket is full. */
  push(m: THREE.Matrix4, c: THREE.Color, metal: number, dirt: number, plateRow: number, l: LampState): boolean {
    const i = this.count;
    if (i >= this.cap) return false;
    m.toArray(this.matrix.array as Float32Array, i * 16);
    const ca = this.color.array as Float32Array;
    ca[i * 3] = c.r;
    ca[i * 3 + 1] = c.g;
    ca[i * 3 + 2] = c.b;
    const sa = this.style.array as Float32Array;
    sa[i * 4] = metal;
    sa[i * 4 + 1] = dirt;
    sa[i * 4 + 2] = 0;
    sa[i * 4 + 3] = plateRow;
    const a = this.lampA.array as Float32Array;
    a[i * 4] = l.head;
    a[i * 4 + 1] = l.tail;
    a[i * 4 + 2] = l.indL;
    a[i * 4 + 3] = l.indR;
    const b = this.lampB.array as Float32Array;
    b[i * 4] = l.reverse;
    b[i * 4 + 1] = l.beaconA;
    b[i * 4 + 2] = l.beaconB;
    b[i * 4 + 3] = l.aux;
    this.count = i + 1;
    return true;
  }

  commit(): void {
    const n = this.count;
    for (const m of this.meshes) {
      m.count = n;
      m.visible = n > 0;
    }
    if (n === 0) return;
    this.matrix.needsUpdate = true;
    this.color.needsUpdate = true;
    this.style.needsUpdate = true;
    this.lampA.needsUpdate = true;
    this.lampB.needsUpdate = true;
  }

  dispose(): void {
    for (const m of this.meshes) {
      m.geometry.dispose();
      m.dispose();
      m.removeFromParent();
    }
    this.meshes.length = 0;
  }
}

/**
 * Instances per model and LOD. Generous on purpose: a bucket that is full silently hides a car that still
 * collides, and the buffers are tiny (about 150 bytes per instance).
 */
const CAPACITY: Record<VehicleKind, number> = {
  sedan: 120,
  hatch: 120,
  suv: 120,
  pickup: 96,
  van: 96,
  minibus: 96,
  truck: 96,
  semi: 96,
  tanker: 96,
  bus: 96,
  coach: 96,
  taxi: 120,
  police: 64,
  ambulance: 64,
};

/** The instanced traffic fleet: one bucket per model and LOD plus shared wheel buckets. */
export class Fleet {
  readonly group = new THREE.Group();
  readonly mats: FleetMaterials;
  private buckets = new Map<VehicleKind, [Bucket | undefined, Bucket | undefined]>();
  private wheelMeshes = new Map<WheelType, { mesh: THREE.InstancedMesh; n: number }>();
  private wheelCap = 1400;
  /** Live statistics for budgets / debugging. */
  stats = { cars: 0, wheels: 0, tris: 0 };

  constructor(mats?: FleetMaterials) {
    this.mats = mats ?? createFleetMaterials();
    this.group.name = 'fleet';
    for (const t of ['car', 'truck', 'far'] as const) {
      const mesh = new THREE.InstancedMesh(wheelGeometry(t), this.mats.wheel, this.wheelCap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = t !== 'far';
      mesh.count = 0;
      mesh.visible = false;
      mesh.name = `wheels-${t}`;
      // The wheel geometry is shared with the cache: keep it out of the per-run disposal.
      this.group.add(mesh);
      this.wheelMeshes.set(t, { mesh, n: 0 });
    }
  }

  bucket(kind: VehicleKind, lod: 0 | 1): Bucket {
    let pair = this.buckets.get(kind);
    if (!pair) {
      pair = [undefined, undefined];
      this.buckets.set(kind, pair);
    }
    let b = pair[lod];
    if (!b) {
      b = new Bucket(kind, lod, vehicleGeometry(kind).lod[lod], this.mats, CAPACITY[kind], this.group);
      pair[lod] = b;
    }
    return b;
  }

  /** Create every bucket now so the first sighting of a model never hitches. */
  prebuild(): void {
    for (const k of VEHICLE_KINDS) {
      this.bucket(k, 0);
      this.bucket(k, 1);
    }
  }

  private each(fn: (b: Bucket) => void): void {
    for (const pair of this.buckets.values()) {
      if (pair[0]) fn(pair[0]);
      if (pair[1]) fn(pair[1]);
    }
  }

  begin(): void {
    this.each((b) => b.reset());
    for (const w of this.wheelMeshes.values()) w.n = 0;
  }

  addWheel(type: WheelType, m: THREE.Matrix4): void {
    const w = this.wheelMeshes.get(type)!;
    if (w.n >= this.wheelCap) return;
    w.mesh.setMatrixAt(w.n++, m);
  }

  end(): void {
    let cars = 0;
    let tris = 0;
    this.each((b) => {
      b.commit();
      cars += b.count;
      tris += b.count * vehicleGeometry(b.kind).lod[b.lod].tris;
    });
    let wheels = 0;
    for (const w of this.wheelMeshes.values()) {
      w.mesh.count = w.n;
      w.mesh.visible = w.n > 0;
      w.mesh.instanceMatrix.needsUpdate = true;
      wheels += w.n;
    }
    this.stats.cars = cars;
    this.stats.wheels = wheels;
    this.stats.tris = tris;
  }

  dispose(): void {
    this.each((b) => b.dispose());
    this.buckets.clear();
    for (const w of this.wheelMeshes.values()) {
      w.mesh.dispose();
      w.mesh.removeFromParent();
    }
    this.wheelMeshes.clear();
    this.mats.dispose();
  }
}
