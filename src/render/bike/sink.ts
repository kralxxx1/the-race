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

/**
 * Procedural micro-surface applied by the `hard` shader (keeps hundreds of parts in one
 * draw call while still reading as different materials up close).
 */
export const Micro = {
  plain: 0,
  /** Directional brushing (machined clamps, levers, footpegs). */
  brushed: 1,
  /** Sand-cast speckle (frames, swingarms, engine cases). */
  cast: 2,
  /** Fine grain (textured plastics, rubber, crinkle paint). */
  grain: 3,
  /** Cross knurling (footpegs, adjusters, grips). */
  knurl: 4,
  /** Anodised: tiny colour/roughness variation. */
  anodised: 5,
} as const;
export type Micro = (typeof Micro)[keyof typeof Micro];

export interface Finish {
  slot: Slot;
  /** Linear RGB. */
  color: readonly [number, number, number];
  metal: number;
  rough: number;
  /** Clear-coat amount (0..1). */
  coat: number;
  micro: Micro;
}

const _c = new THREE.Color();

/** Finish from an sRGB hex colour. */
export function fin(slot: Slot, hex: string, metal = 0, rough = 0.5, coat = 0, micro: Micro = Micro.plain): Finish {
  _c.set(hex); // three converts sRGB hex → linear working space
  return { slot, color: [_c.r, _c.g, _c.b], metal, rough, coat, micro };
}

export const hard = (hex: string, metal: number, rough: number, coat = 0, micro: Micro = Micro.plain): Finish => fin('hard', hex, metal, rough, coat, micro);

/** Common finishes. */
export const F = {
  black: hard('#0c0d0f', 0, 0.55, 0, Micro.grain),
  satinBlack: hard('#121315', 0.15, 0.42, 0.3),
  glossBlack: hard('#0a0b0c', 0.1, 0.18, 1),
  texturedBlack: hard('#151618', 0, 0.82, 0, Micro.grain),
  rubber: hard('#101010', 0, 0.9, 0, Micro.grain),
  hose: hard('#16171a', 0, 0.62, 0, Micro.grain),
  castAlu: hard('#a9adb2', 1, 0.42, 0, Micro.cast),
  brushedAlu: hard('#c3c7cc', 1, 0.3, 0, Micro.brushed),
  polishedAlu: hard('#d9dce0', 1, 0.12),
  darkAlu: hard('#5d6168', 1, 0.38, 0, Micro.cast),
  gunmetal: hard('#3a3d42', 1, 0.36, 0, Micro.anodised),
  magnesium: hard('#6f7176', 0.9, 0.5, 0, Micro.cast),
  steel: hard('#8e9399', 1, 0.3, 0, Micro.brushed),
  discSteel: hard('#b8bcc1', 1, 0.24, 0, Micro.brushed),
  chrome: hard('#f2f4f7', 1, 0.05),
  titanium: hard('#9a948a', 1, 0.3, 0, Micro.brushed),
  gold: hard('#d9a63a', 1, 0.24, 0.4, Micro.anodised),
  goldAnod: hard('#c99a2c', 1, 0.3, 0.5, Micro.anodised),
  bronze: hard('#8c6a3a', 1, 0.35, 0, Micro.cast),
  red: hard('#b3121b', 0.2, 0.32, 1),
  white: hard('#e8e9ea', 0, 0.4, 0.4),
  engineBlack: hard('#1c1d20', 0.35, 0.55, 0, Micro.cast),
  engineGrey: hard('#4a4d52', 0.6, 0.45, 0, Micro.cast),
  paintedSilver: hard('#9fa3a8', 0.7, 0.35, 0.6),
  copper: hard('#b36a3a', 1, 0.3),
  yellow: hard('#f2c200', 0.1, 0.35, 0.6),
  knurled: hard('#9ea3a9', 1, 0.34, 0, Micro.knurl),
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

/** Same finish with a different micro-surface or PBR tweak. */
export function vary(base: Finish, o: Partial<Pick<Finish, 'metal' | 'rough' | 'coat' | 'micro' | 'color'>>): Finish {
  return { ...base, ...o };
}

/** Growable typed-array storage for one material slot (avoids per-element pushes and per-part clones). */
export class Bucket {
  pos = new Float32Array(3 * 1024);
  nrm = new Float32Array(3 * 1024);
  uv = new Float32Array(2 * 1024);
  col = new Float32Array(3 * 1024);
  pbr = new Float32Array(4 * 1024);
  idx = new Uint32Array(3 * 1024);
  vcount = 0;
  icount = 0;

  private reserve(nv: number, ni: number): void {
    const V = this.vcount + nv;
    if (V * 3 > this.pos.length) {
      let cap = this.pos.length / 3;
      while (cap < V) cap *= 2;
      const grow = <T extends Float32Array>(a: T, k: number): T => {
        const b = new Float32Array(cap * k);
        b.set(a.subarray(0, this.vcount * k));
        return b as T;
      };
      this.pos = grow(this.pos, 3);
      this.nrm = grow(this.nrm, 3);
      this.uv = grow(this.uv, 2);
      this.col = grow(this.col, 3);
      this.pbr = grow(this.pbr, 4);
    }
    const I = this.icount + ni;
    if (I > this.idx.length) {
      let cap = this.idx.length;
      while (cap < I) cap *= 2;
      const b = new Uint32Array(cap);
      b.set(this.idx.subarray(0, this.icount));
      this.idx = b;
    }
  }

  /** Append a mesh transformed by `m` (positions) and its normal matrix `nm`. */
  append(src: MeshData, f: Finish, m: THREE.Matrix4 | null): void {
    const nv = src.vcount;
    const ni = src.idx.length;
    this.reserve(nv, ni);
    const base = this.vcount;
    const P = this.pos, N = this.nrm, U = this.uv, C = this.col, R = this.pbr;
    const sp = src.pos, sn = src.nrm, su = src.uv, ss = src.shade, vc = src.col;
    const [r, g, bl] = f.color;
    let e: ArrayLike<number> | null = null;
    let n: ArrayLike<number> | null = null;
    if (m) {
      e = m.elements;
      n = _n3.getNormalMatrix(m).elements;
    }
    for (let i = 0; i < nv; i++) {
      const o = (base + i) * 3;
      const x = sp[i * 3], y = sp[i * 3 + 1], z = sp[i * 3 + 2];
      const a = sn[i * 3], b = sn[i * 3 + 1], c = sn[i * 3 + 2];
      if (e && n) {
        P[o] = e[0] * x + e[4] * y + e[8] * z + e[12];
        P[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        P[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        let nx = n[0] * a + n[3] * b + n[6] * c;
        let ny = n[1] * a + n[4] * b + n[7] * c;
        let nz = n[2] * a + n[5] * b + n[8] * c;
        const l = Math.hypot(nx, ny, nz) || 1;
        nx /= l;
        ny /= l;
        nz /= l;
        N[o] = nx;
        N[o + 1] = ny;
        N[o + 2] = nz;
      } else {
        P[o] = x;
        P[o + 1] = y;
        P[o + 2] = z;
        N[o] = a;
        N[o + 1] = b;
        N[o + 2] = c;
      }
      U[(base + i) * 2] = su[i * 2];
      U[(base + i) * 2 + 1] = su[i * 2 + 1];
      const sh = ss[i];
      if (vc) {
        C[o] = r * sh * vc[i * 3];
        C[o + 1] = g * sh * vc[i * 3 + 1];
        C[o + 2] = bl * sh * vc[i * 3 + 2];
      } else {
        C[o] = r * sh;
        C[o + 1] = g * sh;
        C[o + 2] = bl * sh;
      }
      const q = (base + i) * 4;
      R[q] = f.metal;
      R[q + 1] = f.rough;
      R[q + 2] = f.coat;
      R[q + 3] = f.micro;
    }
    const I = this.idx;
    const si = src.idx;
    const flip = m !== null && m.determinant() < 0;
    let k = this.icount;
    for (let t = 0; t < ni; t += 3) {
      I[k++] = si[t] + base;
      if (flip) {
        I[k++] = si[t + 2] + base;
        I[k++] = si[t + 1] + base;
      } else {
        I[k++] = si[t + 1] + base;
        I[k++] = si[t + 2] + base;
      }
    }
    this.vcount += nv;
    this.icount += ni;
  }
}

const _n3 = new THREE.Matrix3();

export type GroupName =
  | 'chassis'
  | 'steer'
  | 'forkLower'
  | 'frontWheel'
  | 'frontSpokes'
  | 'rearWheel'
  | 'rearSpokes'
  | 'swingarm'
  /** Brake / clutch lever blades: pivot on the bar so the first-person view can pull them. */
  | 'leverBrake'
  | 'leverClutch';

export const GROUPS: readonly GroupName[] = ['chassis', 'steer', 'forkLower', 'frontWheel', 'frontSpokes', 'rearWheel', 'rearSpokes', 'swingarm', 'leverBrake', 'leverClutch'];

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
    let b = this.buckets.get(f.slot);
    if (!b) {
      b = new Bucket();
      this.buckets.set(f.slot, b);
    }
    b.append(mesh, f, m ?? null);
  }

  /** Add geometry given in bike coordinates (rest pose). */
  addBike(mesh: MeshData, f: Finish, m?: THREE.Matrix4): void {
    _m.copy(this.inv);
    if (m) _m.multiply(m);
    this.add(mesh, f, _m);
  }

  get triangles(): number {
    let n = 0;
    for (const b of this.buckets.values()) n += b.icount / 3;
    return n;
  }

  /** Convert buckets to BufferGeometries (one per slot). */
  toGeometries(): Map<Slot, THREE.BufferGeometry> {
    const out = new Map<Slot, THREE.BufferGeometry>();
    const nm = new THREE.Matrix3().getNormalMatrix(this.rest);
    const e = this.rest.elements;
    const n = nm.elements;
    for (const [slot, b] of this.buckets) {
      if (!b.icount) continue;
      const V = b.vcount;
      const g = new THREE.BufferGeometry();
      // Exact-size copies (the buckets keep growth headroom).
      g.setAttribute('position', new THREE.BufferAttribute(b.pos.slice(0, V * 3), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(b.nrm.slice(0, V * 3), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(b.uv.slice(0, V * 2), 2));
      g.setAttribute('color', new THREE.BufferAttribute(b.col.slice(0, V * 3), 3));
      g.setAttribute('pbr', new THREE.BufferAttribute(b.pbr.slice(0, V * 4), 4));
      if (BIKE_SPACE.has(slot)) {
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
      const idx = b.idx.subarray(0, b.icount);
      g.setIndex(V > 65535 ? new THREE.BufferAttribute(idx.slice(), 1) : new THREE.BufferAttribute(Uint16Array.from(idx), 1));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      g.userData.shared = true; // owned by the bike geometry cache
      out.set(slot, g);
    }
    return out;
  }
}
