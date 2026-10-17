import * as THREE from 'three';
import { MonotoneCurve } from '../../core/math';
import type { LoftStation } from '../geom';

/**
 * Geometry kit for the procedural traffic vehicles: a merging mesh builder, a curve helper for
 * side profiles and a sampler that evaluates the same lofted body surfaces `superLoft` builds, so
 * lamps, windows, pillars and arches can be placed exactly on a curved panel.
 */

export interface PartOpts {
  color?: THREE.ColorRepresentation;
  /** Metalness / roughness written to the per-vertex `pbr` attribute (detail slot). */
  metal?: number;
  rough?: number;
  /** Lamp channel (lamp slot): which light state drives this surface (see LAMP). */
  ch?: number;
  /** Mirror the triangle winding (for geometry built inside-out). */
  flip?: boolean;
}

/** Lamp channels: index into the per-instance (A.xyzw, B.xyzw) intensity vectors. */
export const LAMP = { head: 0, tail: 1, indL: 2, indR: 3, reverse: 4, beaconA: 5, beaconB: 6, aux: 7 } as const;

const _c = new THREE.Color();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();

/** Collects triangles from many small geometries into one merged buffer geometry. */
export class Mesher {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];
  private pbr: number[] = [];
  private chn: number[] = [];

  constructor(private readonly attrs: { color: boolean; pbr: boolean; ch: boolean }) {}

  get tris(): number {
    return this.pos.length / 9;
  }

  get empty(): boolean {
    return this.pos.length === 0;
  }

  add(g: THREE.BufferGeometry, m?: THREE.Matrix4, o: PartOpts = {}): void {
    const p = g.attributes.position as THREE.BufferAttribute;
    let nrm = g.attributes.normal as THREE.BufferAttribute | undefined;
    if (!nrm) {
      g.computeVertexNormals();
      nrm = g.attributes.normal as THREE.BufferAttribute;
    }
    if (m) _nm.getNormalMatrix(m);
    const idx = g.index;
    const count = idx ? idx.count : p.count;
    if (this.attrs.color) _c.set(o.color ?? '#808080');
    const metal = o.metal ?? 0;
    const rough = o.rough ?? 0.6;
    const ch = o.ch ?? 0;
    const flip = o.flip === true;
    // A mirroring matrix (negative determinant) reverses the winding; its normals stay outward.
    const wind = flip !== (m !== undefined && m.determinant() < 0);
    for (let t = 0; t < count; t += 3) {
      for (let k = 0; k < 3; k++) {
        // Flipping swaps the 2nd and 3rd vertex and negates the normals.
        const kk = wind ? (k === 0 ? 0 : 3 - k) : k;
        const vi = idx ? idx.getX(t + kk) : t + kk;
        _v.fromBufferAttribute(p, vi);
        _n.fromBufferAttribute(nrm, vi);
        if (m) {
          _v.applyMatrix4(m);
          _n.applyMatrix3(_nm).normalize();
        }
        if (flip) _n.negate();
        this.pos.push(_v.x, _v.y, _v.z);
        this.nor.push(_n.x, _n.y, _n.z);
        if (this.attrs.color) this.col.push(_c.r, _c.g, _c.b);
        if (this.attrs.pbr) this.pbr.push(metal, rough);
        if (this.attrs.ch) this.chn.push(ch);
      }
    }
  }

  build(): THREE.BufferGeometry | undefined {
    if (this.empty) return undefined;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    if (this.attrs.color) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.attrs.pbr) g.setAttribute('pbr', new THREE.Float32BufferAttribute(this.pbr, 2));
    if (this.attrs.ch) g.setAttribute('lampCh', new THREE.Float32BufferAttribute(this.chn, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    g.userData.shared = true;
    return g;
  }
}

const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Shared scratch matrix from position / euler rotation (x, y, z) / scale. Consume immediately. */
export function mat(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  return _m4.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

/**
 * Box with chamfered edges and corners (44 triangles, flat-shaded facets): a cheap stand-in for a rounded box
 * on small parts (lamps, handles, seats) where a real fillet would cost hundreds of triangles.
 */
export function chamferBox(w: number, h: number, d: number, c: number): THREE.BufferGeometry {
  const hw = w / 2;
  const hh = h / 2;
  const hd = d / 2;
  c = Math.min(c, hw * 0.9, hh * 0.9, hd * 0.9);
  const pos: number[] = [];
  // The solid is convex and centred on the origin, so a triangle faces outwards iff its normal points away from it:
  // wind each one accordingly instead of hand-ordering every facet.
  const tri = (a: number[], b: number[], cc: number[]) => {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx2 = cc[0] - a[0];
    const vy = cc[1] - a[1];
    const vz = cc[2] - a[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx2 - ux * vz;
    const nz = ux * vy - uy * vx2;
    const outward = nx * (a[0] + b[0] + cc[0]) + ny * (a[1] + b[1] + cc[1]) + nz * (a[2] + b[2] + cc[2]) > 0;
    if (outward) pos.push(...a, ...b, ...cc);
    else pos.push(...a, ...cc, ...b);
  };
  // Corner lattice: each axis has 4 stops (outer, inner, inner, outer).
  const xs = [-hw, -hw + c, hw - c, hw];
  const ys = [-hh, -hh + c, hh - c, hh];
  const zs = [-hd, -hd + c, hd - c, hd];
  // Vertex of the beveled lattice: indices (i,j,k) in 0..3; outer stops collapse to the face plane.
  const vx = (i: number, j: number, k: number): number[] => {
    // A lattice vertex lies on the shell only if at most... we clamp inner/outer so that corners are cut.
    return [xs[i], ys[j], zs[k]];
  };
  const quad = (a: number[], b: number[], cc: number[], d2: number[]) => {
    tri(a, b, cc);
    tri(a, cc, d2);
  };
  // Faces (inner squares)
  quad(vx(2, 1, 3), vx(2, 2, 3), vx(1, 2, 3), vx(1, 1, 3)); // +z
  quad(vx(1, 1, 0), vx(1, 2, 0), vx(2, 2, 0), vx(2, 1, 0)); // −z
  quad(vx(3, 1, 1), vx(3, 2, 1), vx(3, 2, 2), vx(3, 1, 2)); // +x
  quad(vx(0, 1, 2), vx(0, 2, 2), vx(0, 2, 1), vx(0, 1, 1)); // −x
  quad(vx(1, 3, 2), vx(2, 3, 2), vx(2, 3, 1), vx(1, 3, 1)); // +y
  quad(vx(1, 0, 1), vx(2, 0, 1), vx(2, 0, 2), vx(1, 0, 2)); // −y
  // Edge strips (12): each connects two faces' inner edges.
  // x-parallel edges
  quad(vx(1, 2, 3), vx(2, 2, 3), vx(2, 3, 2), vx(1, 3, 2)); // +y +z
  quad(vx(1, 3, 1), vx(2, 3, 1), vx(2, 2, 0), vx(1, 2, 0)); // +y −z
  quad(vx(1, 0, 2), vx(2, 0, 2), vx(2, 1, 3), vx(1, 1, 3)); // −y +z
  quad(vx(1, 1, 0), vx(2, 1, 0), vx(2, 0, 1), vx(1, 0, 1)); // −y −z
  // y-parallel edges
  quad(vx(2, 1, 3), vx(3, 1, 2), vx(3, 2, 2), vx(2, 2, 3)); // +x +z
  quad(vx(3, 1, 1), vx(2, 1, 0), vx(2, 2, 0), vx(3, 2, 1)); // +x −z
  quad(vx(0, 1, 2), vx(1, 1, 3), vx(1, 2, 3), vx(0, 2, 2)); // −x +z
  quad(vx(1, 1, 0), vx(0, 1, 1), vx(0, 2, 1), vx(1, 2, 0)); // −x −z
  // z-parallel edges
  quad(vx(3, 2, 1), vx(3, 2, 2), vx(2, 3, 2), vx(2, 3, 1)); // +x +y
  quad(vx(3, 1, 2), vx(3, 1, 1), vx(2, 0, 1), vx(2, 0, 2)); // +x −y
  quad(vx(0, 2, 2), vx(0, 2, 1), vx(1, 3, 1), vx(1, 3, 2)); // −x +y
  quad(vx(0, 1, 1), vx(0, 1, 2), vx(1, 0, 2), vx(1, 0, 1)); // −x −y
  // Corner triangles (8)
  const corner = (sx: number, sy: number, sz: number) => {
    const i = sx > 0 ? 2 : 1;
    const j = sy > 0 ? 2 : 1;
    const k = sz > 0 ? 2 : 1;
    const ox = sx > 0 ? 3 : 0;
    const oy = sy > 0 ? 3 : 0;
    const oz = sz > 0 ? 3 : 0;
    const a = vx(ox, j, k);
    const b = vx(i, oy, k);
    const cc = vx(i, j, oz);
    if (sx * sy * sz > 0) tri(a, cc, b);
    else tri(a, b, cc);
  };
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) corner(sx, sy, sz);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Smooth monotone curve through [x, y] control points. */
export function curve(points: ReadonlyArray<readonly [number, number]>): (x: number) => number {
  const c = new MonotoneCurve(points);
  return (x) => c.sample(x);
}

/** Quarter-ellipse plan rounding: width fraction at distance `d` from an end of a body that rounds over `r` metres. */
export function endRound(d: number, r: number, wEnd: number, m = 2): number {
  if (d >= r) return 1;
  const t = 1 - Math.max(0, d) / r;
  return wEnd + (1 - wEnd) * Math.pow(1 - Math.pow(t, m), 1 / m);
}

interface Ring {
  z: number;
  w: number;
  yb: number;
  yt: number;
  n: number;
  x: number;
  fb: number;
  pb: number;
  pt: number;
}

const KEYS = ['z', 'w', 'yb', 'yt', 'n', 'x', 'flatBottom', 'pinchBottom', 'pinchTop'] as const;

function keyVal(s: LoftStation, k: (typeof KEYS)[number]): number {
  const v = s[k];
  if (typeof v === 'number') return v;
  return k === 'n' ? 2.5 : k === 'pinchBottom' || k === 'pinchTop' ? 1 : 0;
}

/** Evaluates the surface of a `superLoft` (closed shell) analytically. */
export class Loft {
  private st: LoftStation[];

  constructor(stations: LoftStation[]) {
    this.st = [...stations].sort((a, b) => a.z - b.z);
  }

  get zMin(): number {
    return this.st[0].z;
  }
  get zMax(): number {
    return this.st[this.st.length - 1].z;
  }

  private segParams(i: number, t: number): Ring {
    const st = this.st;
    const p0 = st[Math.max(0, i - 1)];
    const p1 = st[i];
    const p2 = st[i + 1];
    const p3 = st[Math.min(st.length - 1, i + 2)];
    const r: number[] = [];
    for (const key of KEYS) {
      const a = keyVal(p0, key);
      const b = keyVal(p1, key);
      const c = keyVal(p2, key);
      const d = keyVal(p3, key);
      const t2 = t * t;
      const t3 = t2 * t;
      r.push(0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3));
    }
    return { z: r[0], w: r[1], yb: r[2], yt: r[3], n: Math.max(1.2, r[4]), x: r[5], fb: r[6], pb: r[7], pt: r[8] };
  }

  /** Section parameters at world z (Catmull-Rom between stations, like the mesh). */
  ring(z: number): Ring {
    const st = this.st;
    if (z <= st[0].z) return this.segParams(0, 0);
    if (z >= st[st.length - 1].z) return this.segParams(st.length - 2, 1);
    let i = 0;
    while (i < st.length - 2 && z > st[i + 1].z) i++;
    // z(t) is a Catmull-Rom curve too: find t by bisection.
    let lo = 0;
    let hi = 1;
    for (let k = 0; k < 22; k++) {
      const mid = (lo + hi) / 2;
      if (this.segParams(i, mid).z < z) lo = mid;
      else hi = mid;
    }
    return this.segParams(i, (lo + hi) / 2);
  }

  /** Surface point at station z and ring angle th (0 = +x flank, π/2 = top, π = −x flank). */
  point(z: number, th: number, out = new THREE.Vector3()): THREE.Vector3 {
    const r = this.ring(z);
    const ex = 2 / r.n;
    const c = Math.cos(th);
    const s = Math.sin(th);
    let y = Math.sign(s) * Math.pow(Math.abs(s), ex);
    if (y < 0) y *= 1 - r.fb * 0.5;
    const tY = (y + 1) / 2;
    const pinch = r.pb + (r.pt - r.pb) * (tY * tY * (3 - 2 * tY));
    const h = (r.yt - r.yb) / 2;
    return out.set(r.x + (r.w / 2) * pinch * Math.sign(c) * Math.pow(Math.abs(c), ex), (r.yb + r.yt) / 2 + h * y, r.z);
  }

  /** Outward normal at (z, th), by finite differences of the surface. */
  normal(z: number, th: number, out = new THREE.Vector3()): THREE.Vector3 {
    const dz = 0.02;
    const dt = 0.03;
    const a = this.point(z + dz, th);
    const b = this.point(z - dz, th);
    const c = this.point(z, th + dt);
    const d = this.point(z, th - dt);
    a.sub(b);
    c.sub(d);
    // dθ runs counter-clockwise in the x–y plane, dz along +z: dθ × dz points outwards.
    out.crossVectors(c, a).normalize();
    return out;
  }

  /** x of the +x flank at height y (null above/below the section). */
  sideX(z: number, y: number): number | null {
    const r = this.ring(z);
    const h = (r.yt - r.yb) / 2;
    const yn = (y - (r.yb + r.yt) / 2) / h;
    if (Math.abs(yn) >= 1) return null;
    const tY = (yn + 1) / 2;
    const pinch = r.pb + (r.pt - r.pb) * (tY * tY * (3 - 2 * tY));
    return r.x + (r.w / 2) * pinch * Math.pow(1 - Math.pow(Math.abs(yn), r.n), 1 / r.n);
  }

  /** y of the upper surface at lateral position x (null outside the section). */
  topY(z: number, x: number): number | null {
    const r = this.ring(z);
    const h = (r.yt - r.yb) / 2;
    const yc = (r.yb + r.yt) / 2;
    let yn = 0.9;
    for (let k = 0; k < 6; k++) {
      const tY = (yn + 1) / 2;
      const pinch = r.pb + (r.pt - r.pb) * (tY * tY * (3 - 2 * tY));
      const xf = Math.abs(x - r.x) / ((r.w / 2) * pinch);
      if (xf >= 1) return null;
      yn = Math.pow(1 - Math.pow(xf, r.n), 1 / r.n);
    }
    return yc + h * yn;
  }

  /** Ring angle (upper half, 0..π/2) of the +x flank point at height y. */
  angleAtHeight(z: number, y: number): number {
    const r = this.ring(z);
    const h = (r.yt - r.yb) / 2;
    const yn = Math.max(-0.999, Math.min(0.999, (y - (r.yb + r.yt) / 2) / h));
    return Math.asin(Math.sign(yn) * Math.pow(Math.abs(yn), r.n / 2));
  }
}

/**
 * Flat ribbon (strip) of constant width along a path of surface points, lying `lift` above the
 * surface. Used for pillars, panel gaps, window trim and stripes.
 */
export function ribbon(points: THREE.Vector3[], normals: THREE.Vector3[], width: number, lift = 0.004): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const tan = new THREE.Vector3();
  const bin = new THREE.Vector3();
  for (let i = 0; i < points.length; i++) {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(points.length - 1, i + 1)];
    tan.subVectors(b, a).normalize();
    bin.crossVectors(tan, normals[i]).normalize();
    for (const s of [-1, 1]) {
      pos.push(
        points[i].x + normals[i].x * lift + bin.x * s * width * 0.5,
        points[i].y + normals[i].y * lift + bin.y * s * width * 0.5,
        points[i].z + normals[i].z * lift + bin.z * s * width * 0.5,
      );
      nor.push(normals[i].x, normals[i].y, normals[i].z);
    }
    if (i > 0) {
      const k = i * 2;
      idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/**
 * Curved patch on a loft: u runs along z in [z0, z1], v across the ring angle [th0, th1]; `lift`
 * pushes it outwards along the surface normal. `edge` may warp (u, v) to shape the outline
 * (rounded corners, slanted ends). Indexed, smooth normals.
 */
export function loftPatch(
  loft: Loft,
  z0: number,
  z1: number,
  th0: number,
  th1: number,
  nu: number,
  nv: number,
  lift: number,
  edge?: (u: number, v: number) => [number, number],
): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i <= nu; i++) {
    for (let j = 0; j <= nv; j++) {
      let u = i / nu;
      let v = j / nv;
      if (edge) [u, v] = edge(u, v);
      const z = z0 + (z1 - z0) * u;
      const th = th0 + (th1 - th0) * v;
      loft.point(z, th, p);
      loft.normal(z, th, n);
      pos.push(p.x + n.x * lift, p.y + n.y * lift, p.z + n.z * lift);
      nor.push(n.x, n.y, n.z);
    }
  }
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = i * (nv + 1) + j;
      const b = a + 1;
      const c = a + nv + 1;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/** Flat-ish plate over the upper surface of a loft between z0..z1 and |x| ≤ xHalf(z), lifted off the surface. */
export function topPatch(loft: Loft, z0: number, z1: number, xHalf: (z: number) => number, nu: number, nv: number, lift: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= nu; i++) {
    const z = z0 + ((z1 - z0) * i) / nu;
    const xh = xHalf(z);
    for (let j = 0; j <= nv; j++) {
      const x = -xh + (2 * xh * j) / nv;
      const y = loft.topY(z, x) ?? loft.topY(z, x * 0.9) ?? 0;
      pos.push(x, y + lift, z);
      nor.push(0, 1, 0);
    }
  }
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = i * (nv + 1) + j;
      const b = a + 1;
      const c = a + nv + 1;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/** Points + normals along a path in loft (z, θ) space, for ribbons. */
export function loftPath(loft: Loft, path: ReadonlyArray<readonly [number, number]>, samples = 12): { pts: THREE.Vector3[]; nrm: THREE.Vector3[] } {
  const pts: THREE.Vector3[] = [];
  const nrm: THREE.Vector3[] = [];
  const n = path.length - 1;
  for (let i = 0; i <= samples; i++) {
    const f = (i / samples) * n;
    const k = Math.min(n - 1, Math.floor(f));
    const t = f - k;
    const z = path[k][0] + (path[k + 1][0] - path[k][0]) * t;
    const th = path[k][1] + (path[k + 1][1] - path[k][1]) * t;
    pts.push(loft.point(z, th));
    nrm.push(loft.normal(z, th));
  }
  return { pts, nrm };
}

/** A wheel-arch opening: a disc of radius `r` around (z, y), cut from flank triangles beyond |x| > xMin on one side. */
export interface ArchHole {
  z: number;
  y: number;
  r: number;
  xMin: number;
  side: 1 | -1;
}

type CutVert = [number, number, number, number, number, number, number, number, number]; // x y z nx ny nz u v sec

/**
 * Remove the parts of a (non-indexed) triangle mesh that fall inside wheel-arch discs, re-triangulating
 * the triangles the circle crosses so the opening has a clean round rim (boolean difference in the z–y plane,
 * good for near-vertical flanks). Carries position, normal, uv and `sec` through.
 */
export function cutArches(geo: THREE.BufferGeometry, holes: ArchHole[], segments = 28): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position as THREE.BufferAttribute;
  const nr = g.attributes.normal as THREE.BufferAttribute;
  const uvA = g.attributes.uv as THREE.BufferAttribute | undefined;
  const secA = g.attributes.sec as THREE.BufferAttribute | undefined;
  const polys = holes.map((h) => {
    const q: [number, number][] = [];
    for (let k = 0; k < segments; k++) {
      const a = (k / segments) * Math.PI * 2;
      q.push([h.z + Math.cos(a) * h.r, h.y + Math.sin(a) * h.r]);
    }
    return q;
  });
  const out: number[][] = [[], [], [], []];
  const vert = (i: number): CutVert => [
    p.getX(i), p.getY(i), p.getZ(i), nr.getX(i), nr.getY(i), nr.getZ(i), uvA ? uvA.getX(i) : 0, uvA ? uvA.getY(i) : 0, secA ? secA.getX(i) : 0,
  ];
  const emit = (v: CutVert) => {
    out[0].push(v[0], v[1], v[2]);
    out[1].push(v[3], v[4], v[5]);
    out[2].push(v[6], v[7]);
    out[3].push(v[8]);
  };
  const lerpV = (a: CutVert, b: CutVert, t: number): CutVert => a.map((x, i) => x + (b[i] - x) * t) as CutVert;
  // Sutherland–Hodgman against the half plane left (inside) or right (outside) of the directed edge a→b in (z, y).
  const clip = (poly: CutVert[], a: [number, number], b: [number, number], keepInside: boolean): CutVert[] => {
    const res: CutVert[] = [];
    const f = (v: CutVert) => (b[0] - a[0]) * (v[1] - a[1]) - (b[1] - a[1]) * (v[2] - a[0]);
    for (let i = 0; i < poly.length; i++) {
      const c = poly[i];
      const d = poly[(i + 1) % poly.length];
      const fc = f(c);
      const fd = f(d);
      const cIn = keepInside ? fc >= 0 : fc < 0;
      const dIn = keepInside ? fd >= 0 : fd < 0;
      if (cIn) res.push(c);
      if (cIn !== dIn) res.push(lerpV(c, d, fc / (fc - fd)));
    }
    return res;
  };
  for (let t = 0; t < p.count; t += 3) {
    let pieces: CutVert[][] = [[vert(t), vert(t + 1), vert(t + 2)]];
    const cx = (p.getX(t) + p.getX(t + 1) + p.getX(t + 2)) / 3;
    for (let h = 0; h < holes.length; h++) {
      const hole = holes[h];
      if (cx * hole.side <= hole.xMin) continue;
      const q = polys[h];
      const next: CutVert[][] = [];
      for (const piece of pieces) {
        let minZ = Infinity;
        let maxZ = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (const v of piece) {
          minZ = Math.min(minZ, v[2]);
          maxZ = Math.max(maxZ, v[2]);
          minY = Math.min(minY, v[1]);
          maxY = Math.max(maxY, v[1]);
        }
        if (maxZ < hole.z - hole.r || minZ > hole.z + hole.r || maxY < hole.y - hole.r || minY > hole.y + hole.r) {
          next.push(piece);
          continue;
        }
        let rem = piece;
        for (let k = 0; k < q.length && rem.length >= 3; k++) {
          const a = q[k];
          const b = q[(k + 1) % q.length];
          const outside = clip(rem, a, b, false);
          if (outside.length >= 3) next.push(outside);
          rem = clip(rem, a, b, true);
        }
      }
      pieces = next;
    }
    for (const piece of pieces) for (let i = 1; i < piece.length - 1; i++) [piece[0], piece[i], piece[i + 1]].forEach(emit);
  }
  const res = new THREE.BufferGeometry();
  res.setAttribute('position', new THREE.Float32BufferAttribute(out[0], 3));
  res.setAttribute('normal', new THREE.Float32BufferAttribute(out[1], 3));
  res.setAttribute('uv', new THREE.Float32BufferAttribute(out[2], 2));
  if (secA) res.setAttribute('sec', new THREE.Float32BufferAttribute(out[3], 1));
  if (g !== geo) g.dispose();
  return res;
}
