import * as THREE from 'three';

/**
 * Geometry kit for the roadside scenery: a deterministic mesh accumulator with a matrix
 * stack, so houses, lamps, trees and bridges are authored in their own local frame
 * (x right, y up, −z forward) and baked into one vertex-coloured BufferGeometry.
 *
 * Nothing here touches the GPU: builders return plain BufferGeometry objects, which keeps the
 * generators unit-testable in node and lets world views dispose them in one place.
 */

export type RGB = readonly [number, number, number];

const _c = new THREE.Color();

/** Linear-RGB triple from any CSS colour. Cached per string: colours repeat constantly while building. */
const colorCache = new Map<string, RGB>();
export function rgb(c: THREE.ColorRepresentation): RGB {
  const key = typeof c === 'string' ? c : '';
  if (key) {
    const hit = colorCache.get(key);
    if (hit) return hit;
  }
  _c.set(c);
  const out: RGB = [_c.r, _c.g, _c.b];
  if (key) colorCache.set(key, out);
  return out;
}

export function mul(c: RGB, k: number): RGB {
  return [c[0] * k, c[1] * k, c[2] * k];
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export interface GeoOptions {
  /** Emit the `aSway` attribute (wind amount per vertex, 0..1). */
  sway?: boolean;
}

const _n = new THREE.Matrix3();
const _v = new THREE.Vector3();

/** Surface description shared by the primitives. */
export interface Paint {
  color?: RGB;
  /** Texture repeats per metre in u and v (0 = use the raw 0..1 uv of the primitive). */
  uvPerM?: number;
  /** Offset added to uv (atlas cell origin, random phase…). */
  uvOff?: [number, number];
  /** Wind amount at the base and tip of the primitive. */
  sway?: [number, number];
}

export class GeoBuilder {
  private pos: number[] = [];
  private nrm: number[] = [];
  private uv: number[] = [];
  private col: number[] = [];
  private sw: number[] = [];
  private idx: number[] = [];
  private stack: THREE.Matrix4[] = [new THREE.Matrix4()];
  private normalM = new THREE.Matrix3();
  private dirty = true;

  constructor(private opts: GeoOptions = {}) {}

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  get triangleCount(): number {
    return this.idx.length / 3;
  }

  /** Current frame matrix. */
  private get m(): THREE.Matrix4 {
    return this.stack[this.stack.length - 1];
  }

  /** Push a child frame: translate, then yaw/pitch/roll (radians, Y-X-Z order), then scale. */
  push(x = 0, y = 0, z = 0, yaw = 0, pitch = 0, roll = 0, sx = 1, sy = sx, sz = sx): this {
    const e = new THREE.Euler(pitch, yaw, roll, 'YXZ');
    const local = new THREE.Matrix4().compose(_v.set(x, y, z), new THREE.Quaternion().setFromEuler(e), new THREE.Vector3(sx, sy, sz));
    this.stack.push(new THREE.Matrix4().multiplyMatrices(this.m, local));
    this.dirty = true;
    return this;
  }

  pop(): this {
    if (this.stack.length > 1) this.stack.pop();
    this.dirty = true;
    return this;
  }

  private refresh(): void {
    if (!this.dirty) return;
    _n.getNormalMatrix(this.m);
    this.normalM.copy(_n);
    this.dirty = false;
  }

  /** Emit one vertex (frame-local position/normal). Returns its index. */
  vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number, c: RGB, sway = 0): number {
    this.refresh();
    _v.set(x, y, z).applyMatrix4(this.m);
    this.pos.push(_v.x, _v.y, _v.z);
    _v.set(nx, ny, nz).applyMatrix3(this.normalM).normalize();
    this.nrm.push(_v.x, _v.y, _v.z);
    this.uv.push(u, v);
    this.col.push(c[0], c[1], c[2]);
    if (this.opts.sway) this.sw.push(sway);
    return this.pos.length / 3 - 1;
  }

  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }

  /** Quad (a,b,c,d counter-clockwise seen from the normal side). */
  quad(
    a: readonly [number, number, number],
    b: readonly [number, number, number],
    c: readonly [number, number, number],
    d: readonly [number, number, number],
    p: Paint = {},
    uvs?: readonly [number, number, number, number, number, number, number, number],
  ): this {
    const col = p.color ?? [1, 1, 1];
    // Flat normal from the diagonal cross product.
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const k = p.uvPerM ?? 0;
    const off = p.uvOff ?? [0, 0];
    const w = Math.hypot(ux, uy, uz);
    const h = Math.hypot(vx, vy, vz);
    const t = uvs ?? (k > 0 ? [0, 0, w * k, 0, w * k, h * k, 0, h * k] : [0, 0, 1, 0, 1, 1, 0, 1]);
    const sw = p.sway ?? [0, 0];
    const i0 = this.vertex(a[0], a[1], a[2], nx, ny, nz, t[0] + off[0], t[1] + off[1], col, sw[0]);
    const i1 = this.vertex(b[0], b[1], b[2], nx, ny, nz, t[2] + off[0], t[3] + off[1], col, sw[0]);
    const i2 = this.vertex(c[0], c[1], c[2], nx, ny, nz, t[4] + off[0], t[5] + off[1], col, sw[1]);
    const i3 = this.vertex(d[0], d[1], d[2], nx, ny, nz, t[6] + off[0], t[7] + off[1], col, sw[1]);
    this.tri(i0, i1, i2);
    this.tri(i0, i2, i3);
    return this;
  }

  /**
   * Axis-aligned box in the current frame, centred on (cx, cy, cz). `skip` bit flags:
   * 1 +x, 2 −x, 4 +y, 8 −y, 16 +z, 32 −z. UVs are metric (uvPerM repeats per metre).
   */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, p: Paint = {}, skip = 0): this {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    const k = p.uvPerM ?? 0;
    const face = (bit: number, a: [number, number, number], b: [number, number, number], c: [number, number, number], d: [number, number, number], w: number, h: number) => {
      if (skip & bit) return;
      const uvs = k > 0 ? ([0, 0, w * k, 0, w * k, h * k, 0, h * k] as const) : undefined;
      this.quad(a, b, c, d, p, uvs);
    };
    face(1, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], sz, sy);
    face(2, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], sz, sy);
    face(4, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], sx, sz);
    face(8, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], sx, sz);
    face(16, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], sx, sy);
    face(32, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], sx, sy);
    return this;
  }

  /**
   * Frustum / cylinder / cone along +y from y0 (radius r0) to y1 (radius r1) around (cx, cz).
   * `cap` closes the top and bottom. UV u wraps once around the circumference scaled by uvPerM.
   */
  frustum(cx: number, y0: number, cz: number, r0: number, r1: number, h: number, seg: number, p: Paint = {}, cap = false, smooth = true): this {
    const col = p.color ?? [1, 1, 1];
    const k = p.uvPerM ?? 0;
    const sw = p.sway ?? [0, 0];
    const slope = (r0 - r1) / Math.max(h, 1e-6);
    const ring: number[][] = [[], []];
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const nl = Math.hypot(1, slope);
      const u = k > 0 ? (j / seg) * Math.PI * 2 * Math.max(r0, r1) * k : j / seg;
      const nx = ca / nl, ny = slope / nl, nz = sa / nl;
      const v1 = k > 0 ? h * k : 1;
      ring[0].push(this.vertex(cx + ca * r0, y0, cz + sa * r0, smooth ? nx : nx, ny, smooth ? nz : nz, u + (p.uvOff?.[0] ?? 0), p.uvOff?.[1] ?? 0, col, sw[0]));
      ring[1].push(this.vertex(cx + ca * r1, y0 + h, cz + sa * r1, nx, ny, nz, u + (p.uvOff?.[0] ?? 0), v1 + (p.uvOff?.[1] ?? 0), col, sw[1]));
    }
    for (let j = 0; j < seg; j++) {
      // Wound so the outside faces away from the axis.
      this.tri(ring[0][j], ring[1][j], ring[1][j + 1]);
      this.tri(ring[0][j], ring[1][j + 1], ring[0][j + 1]);
    }
    if (cap) {
      for (const [y, r, up] of [[y0 + h, r1, 1], [y0, r0, -1]] as const) {
        if (r <= 1e-5) continue;
        const c0 = this.vertex(cx, y, cz, 0, up, 0, 0.5, 0.5, col, up > 0 ? sw[1] : sw[0]);
        const first = this.vertexCount;
        for (let j = 0; j <= seg; j++) {
          const a = (j / seg) * Math.PI * 2;
          this.vertex(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r, 0, up, 0, 0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5, col, up > 0 ? sw[1] : sw[0]);
        }
        for (let j = 0; j < seg; j++) (up > 0 ? this.tri(c0, first + j + 1, first + j) : this.tri(c0, first + j, first + j + 1));
      }
    }
    return this;
  }

  /** Tapered, optionally curved limb between two points (trunks, branches, poles). */
  limb(a: readonly [number, number, number], b: readonly [number, number, number], ra: number, rb: number, seg: number, p: Paint = {}, cap = false): this {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return this;
    // Orient +y along the limb: yaw around y, then pitch away from vertical.
    const yaw = Math.atan2(dx, dz);
    const pitch = Math.acos(Math.max(-1, Math.min(1, dy / len)));
    this.push(a[0], a[1], a[2], yaw, pitch, 0);
    this.frustum(0, 0, 0, ra, rb, len, seg, p, cap);
    this.pop();
    return this;
  }

  /** Simple lathe-free disc, facing +y. */
  disc(cx: number, y: number, cz: number, r: number, seg: number, p: Paint = {}): this {
    const col = p.color ?? [1, 1, 1];
    const c0 = this.vertex(cx, y, cz, 0, 1, 0, 0.5, 0.5, col);
    const first = this.vertexCount;
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      this.vertex(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r, 0, 1, 0, 0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5, col);
    }
    for (let j = 0; j < seg; j++) this.tri(c0, first + j + 1, first + j);
    return this;
  }

  /**
   * Gable roof over a rectangle (width sx across, depth sz along z), ridge along z at height `rise`
   * above `y`, with an eave overhang. Slopes carry metric UVs, gable ends are triangles.
   */
  gable(cx: number, y: number, cz: number, sx: number, sz: number, rise: number, overhang: number, roof: Paint, wall: Paint): this {
    const hx = sx / 2 + overhang, hz = sz / 2 + overhang * 0.6;
    const k = roof.uvPerM ?? 0.4;
    const run = Math.hypot(hx, rise);
    const left: [number, number, number][] = [[cx - hx, y, cz + hz], [cx - hx, y, cz - hz], [cx, y + rise, cz - hz], [cx, y + rise, cz + hz]];
    const right: [number, number, number][] = [[cx + hx, y, cz - hz], [cx + hx, y, cz + hz], [cx, y + rise, cz + hz], [cx, y + rise, cz - hz]];
    const uv = [0, 0, 2 * hz * k, 0, 2 * hz * k, run * k, 0, run * k] as const;
    this.quad(left[0], left[3], left[2], left[1], roof, [uv[0], uv[1], uv[6], uv[7], uv[4], uv[5], uv[2], uv[3]]);
    this.quad(right[0], right[3], right[2], right[1], roof, [uv[0], uv[1], uv[6], uv[7], uv[4], uv[5], uv[2], uv[3]]);
    // Gable end triangles (front +z and back −z), at the wall line.
    const gx = sx / 2;
    const gk = wall.uvPerM ?? 0.3;
    for (const [z, nz] of [[cz + sz / 2, 1], [cz - sz / 2, -1]] as const) {
      const c = wall.color ?? [1, 1, 1];
      const a = this.vertex(cx - gx, y, z, 0, 0, nz, 0, 0, c);
      const b = this.vertex(cx + gx, y, z, 0, 0, nz, sx * gk, 0, c);
      const t = this.vertex(cx, y + rise * (gx / hx), z, 0, 0, nz, sx * gk * 0.5, rise * gk, c);
      if (nz > 0) this.tri(a, b, t);
      else this.tri(b, a, t);
    }
    // Underside so the overhang does not show daylight through the eaves.
    return this;
  }

  /** Merge a THREE geometry (indexed or not) into the builder. */
  addGeometry(g: THREE.BufferGeometry, p: Paint = {}): this {
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    const uv = g.getAttribute('uv');
    const base = this.vertexCount;
    const col = p.color ?? [1, 1, 1];
    for (let i = 0; i < pos.count; i++) {
      this.vertex(pos.getX(i), pos.getY(i), pos.getZ(i), nor ? nor.getX(i) : 0, nor ? nor.getY(i) : 1, nor ? nor.getZ(i) : 0, uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0, col, p.sway ? p.sway[0] : 0);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) this.idx.push(base + g.index.getX(i));
    else for (let i = 0; i < pos.count; i++) this.idx.push(base + i);
    return this;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.opts.sway) g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.sw, 1));
    const n = this.pos.length / 3;
    g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/** Shared helpers ------------------------------------------------------------------------------- */

export function disposeGeometry(g: THREE.BufferGeometry | null | undefined): void {
  g?.dispose();
}

/** A transform with position, yaw and uniform scale, as a ready matrix (for instance buffers). */
export function composeMatrix(out: THREE.Matrix4, x: number, y: number, z: number, yaw: number, sx: number, sy = sx, sz = sx, pitch = 0, roll = 0): THREE.Matrix4 {
  _qq.setFromEuler(_ee.set(pitch, yaw, roll, 'YXZ'));
  return out.compose(_vv.set(x, y, z), _qq, _ss.set(sx, sy, sz));
}
const _qq = new THREE.Quaternion();
const _ee = new THREE.Euler();
const _vv = new THREE.Vector3();
const _ss = new THREE.Vector3();
