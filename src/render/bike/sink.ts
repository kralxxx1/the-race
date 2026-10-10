import * as THREE from 'three';
import type { MeshData } from './mesh';

/**
 * Material slots. Most mechanical parts share the vertex-coloured `hard` slot
 * (colour, metalness, roughness and clear-coat baked per vertex), which is what
 * keeps a bike with hundreds of parts under ~50 draw calls.
 */
export type Slot =
  | 'hard'
  | 'paint'
  | 'carbon'
  | 'tyre'
  | 'seat'
  | 'screen'
  | 'lens'
  | 'head'
  | 'drl'
  | 'tail'
  | 'indicator'
  | 'dash'
  | 'plate'
  | 'decal'
  | 'radiator'
  | 'mirrorL'
  | 'mirrorR'
  | 'blur';

export const SLOTS: readonly Slot[] = ['hard', 'paint', 'carbon', 'tyre', 'seat', 'screen', 'lens', 'head', 'drl', 'tail', 'indicator', 'dash', 'plate', 'decal', 'radiator', 'mirrorL', 'mirrorR', 'blur'];

/** Slots whose shaders project textures in bike space and need rest-pose bike coordinates. */
const BIKE_SPACE: ReadonlySet<Slot> = new Set<Slot>(['paint', 'carbon', 'seat']);

export interface Finish {
  slot: Slot;
  /** Linear RGB. */
  color: readonly [number, number, number];
  metal: number;
  rough: number;
  /** Clear-coat amount (0..1). */
  coat: number;
}

const _c = new THREE.Color();

/** Finish from an sRGB hex colour. */
export function fin(slot: Slot, hex: string, metal = 0, rough = 0.5, coat = 0): Finish {
  _c.set(hex); // three converts sRGB hex → linear working space
  return { slot, color: [_c.r, _c.g, _c.b], metal, rough, coat };
}

export const hard = (hex: string, metal: number, rough: number, coat = 0): Finish => fin('hard', hex, metal, rough, coat);

/** Common finishes. */
export const F = {
  black: hard('#0c0d0f', 0, 0.55),
  satinBlack: hard('#121315', 0.15, 0.42, 0.3),
  glossBlack: hard('#0a0b0c', 0.1, 0.18, 1),
  texturedBlack: hard('#151618', 0, 0.82),
  rubber: hard('#101010', 0, 0.9),
  hose: hard('#16171a', 0, 0.62),
  castAlu: hard('#a9adb2', 1, 0.42),
  brushedAlu: hard('#c3c7cc', 1, 0.3),
  polishedAlu: hard('#d9dce0', 1, 0.12),
  darkAlu: hard('#5d6168', 1, 0.38),
  gunmetal: hard('#3a3d42', 1, 0.36),
  magnesium: hard('#6f7176', 0.9, 0.5),
  steel: hard('#8e9399', 1, 0.3),
  discSteel: hard('#b8bcc1', 1, 0.24),
  chrome: hard('#f2f4f7', 1, 0.05),
  titanium: hard('#9a948a', 1, 0.3),
  gold: hard('#d9a63a', 1, 0.24, 0.4),
  goldAnod: hard('#c99a2c', 1, 0.3, 0.5),
  bronze: hard('#8c6a3a', 1, 0.35),
  red: hard('#b3121b', 0.2, 0.32, 1),
  white: hard('#e8e9ea', 0, 0.4, 0.4),
  engineBlack: hard('#1c1d20', 0.35, 0.55),
  engineGrey: hard('#4a4d52', 0.6, 0.45),
  paintedSilver: hard('#9fa3a8', 0.7, 0.35, 0.6),
  copper: hard('#b36a3a', 1, 0.3),
  yellow: hard('#f2c200', 0.1, 0.35, 0.6),
  paint: fin('paint', '#ffffff'),
  carbon: fin('carbon', '#ffffff', 0.25, 0.35, 1),
  tyre: fin('tyre', '#ffffff', 0, 0.85),
  screen: fin('screen', '#ffffff'),
  lens: fin('lens', '#ffffff'),
  head: fin('head', '#ffffff'),
  drl: fin('drl', '#ffffff'),
  tail: fin('tail', '#ffffff'),
  indicator: fin('indicator', '#ffffff'),
  dash: fin('dash', '#ffffff'),
  plate: fin('plate', '#ffffff'),
  decal: fin('decal', '#ffffff'),
  radiator: fin('radiator', '#ffffff', 0.6, 0.5),
  mirrorL: fin('mirrorL', '#ffffff'),
  mirrorR: fin('mirrorR', '#ffffff'),
  blur: fin('blur', '#ffffff'),
} as const;

/** A finish of the given hex colour in a given slot (seat leather colour, paint tint…). */
export function tint(base: Finish, hex: string): Finish {
  _c.set(hex);
  return { ...base, color: [_c.r, _c.g, _c.b] };
}

export class Bucket {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  pbr: number[] = [];
  idx: number[] = [];

  get vcount(): number {
    return this.pos.length / 3;
  }
}

export type GroupName =
  | 'chassis'
  | 'steer'
  | 'forkLower'
  | 'frontWheel'
  | 'frontSpokes'
  | 'rearWheel'
  | 'rearSpokes'
  | 'swingarm';

export const GROUPS: readonly GroupName[] = ['chassis', 'steer', 'forkLower', 'frontWheel', 'frontSpokes', 'rearWheel', 'rearSpokes', 'swingarm'];

const _m = new THREE.Matrix4();

/** Collects geometry for one animated group of the bike, merged per material slot. */
export class GroupSink {
  readonly buckets = new Map<Slot, Bucket>();
  private inv: THREE.Matrix4;

  constructor(
    readonly name: GroupName,
    /** Rest transform: group-local → bike space. */
    readonly rest: THREE.Matrix4,
  ) {
    this.inv = rest.clone().invert();
  }

  /** Add geometry given in group-local coordinates. */
  add(mesh: MeshData, f: Finish, m?: THREE.Matrix4): void {
    if (!mesh.tcount) return;
    const src = m ? mesh.clone().transform(m) : mesh;
    let b = this.buckets.get(f.slot);
    if (!b) {
      b = new Bucket();
      this.buckets.set(f.slot, b);
    }
    const base = b.vcount;
    const [r, g, bl] = f.color;
    for (let i = 0; i < src.pos.length; i++) b.pos.push(src.pos[i]);
    for (let i = 0; i < src.nrm.length; i++) b.nrm.push(src.nrm[i]);
    for (let i = 0; i < src.uv.length; i++) b.uv.push(src.uv[i]);
    for (let i = 0; i < src.shade.length; i++) {
      const s = src.shade[i];
      b.col.push(r * s, g * s, bl * s);
      b.pbr.push(f.metal, f.rough, f.coat);
    }
    for (let i = 0; i < src.idx.length; i++) b.idx.push(src.idx[i] + base);
  }

  /** Add geometry given in bike coordinates (rest pose). */
  addBike(mesh: MeshData, f: Finish, m?: THREE.Matrix4): void {
    _m.copy(this.inv);
    if (m) _m.multiply(m);
    this.add(mesh, f, _m);
  }

  get triangles(): number {
    let n = 0;
    for (const b of this.buckets.values()) n += b.idx.length / 3;
    return n;
  }

  /** Convert buckets to BufferGeometries (one per slot). */
  toGeometries(): Map<Slot, THREE.BufferGeometry> {
    const out = new Map<Slot, THREE.BufferGeometry>();
    const nm = new THREE.Matrix3().getNormalMatrix(this.rest);
    const e = this.rest.elements;
    const n = nm.elements;
    for (const [slot, b] of this.buckets) {
      if (!b.idx.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      g.setAttribute('pbr', new THREE.Float32BufferAttribute(b.pbr, 3));
      if (BIKE_SPACE.has(slot)) {
        const V = b.vcount;
        const bp = new Float32Array(V * 3);
        const bn = new Float32Array(V * 3);
        for (let i = 0; i < V; i++) {
          const x = b.pos[i * 3], y = b.pos[i * 3 + 1], z = b.pos[i * 3 + 2];
          bp[i * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
          bp[i * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
          bp[i * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
          const a = b.nrm[i * 3], c = b.nrm[i * 3 + 1], d = b.nrm[i * 3 + 2];
          bn[i * 3] = n[0] * a + n[3] * c + n[6] * d;
          bn[i * 3 + 1] = n[1] * a + n[4] * c + n[7] * d;
          bn[i * 3 + 2] = n[2] * a + n[5] * c + n[8] * d;
        }
        g.setAttribute('bp', new THREE.BufferAttribute(bp, 3));
        g.setAttribute('bn', new THREE.BufferAttribute(bn, 3));
      }
      g.setIndex(b.vcount > 65535 ? new THREE.Uint32BufferAttribute(b.idx, 1) : new THREE.Uint16BufferAttribute(b.idx, 1));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      g.userData.shared = true; // owned by the bike geometry cache
      out.set(slot, g);
    }
    return out;
  }
}
