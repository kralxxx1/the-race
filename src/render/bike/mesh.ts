import * as THREE from 'three';

/**
 * Lightweight indexed triangle mesh used by every bike-kit generator.
 *
 * Generators build into plain growable arrays (fast, allocation-light) and the
 * sink converts the merged result to one BufferGeometry per material slot.
 * Conventions (see docs/dev/BIKE_BLUEPRINTS.md): metres, +Y up, −Z forward,
 * +X = rider's right, rear axle at z = 0 on the ground plane.
 */

export type P2 = readonly [number, number];
export type P3 = readonly [number, number, number];

const _m3 = new THREE.Matrix3();

export class MeshData {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  /** Per-vertex shade multiplier on the finish colour (cheap baked occlusion for gaps and recesses). */
  shade: number[] = [];
  /** Optional per-vertex RGB multiplier on the finish colour (heat tint, two-tone parts). */
  col: number[] | null = null;
  idx: number[] = [];

  get vcount(): number {
    return this.pos.length / 3;
  }

  get tcount(): number {
    return this.idx.length / 3;
  }

  v(x: number, y: number, z: number, nx = 0, ny = 1, nz = 0, u = 0, w = 0, shade = 1): number {
    const i = this.pos.length / 3;
    this.pos.push(x, y, z);
    this.nrm.push(nx, ny, nz);
    this.uv.push(u, w);
    this.shade.push(shade);
    if (this.col) this.col.push(1, 1, 1);
    return i;
  }

  /** Per-vertex colour multipliers (created on demand, initialised to white). */
  colors(): number[] {
    if (!this.col) {
      this.col = new Array<number>(this.vcount * 3).fill(1);
    }
    return this.col;
  }

  /** Multiply the colour of every vertex by fn(x, y, z) → [r, g, b]. */
  tintBy(fn: (x: number, y: number, z: number, i: number) => readonly [number, number, number]): this {
    const c = this.colors();
    const p = this.pos;
    for (let i = 0; i < this.vcount; i++) {
      const t = fn(p[i * 3], p[i * 3 + 1], p[i * 3 + 2], i);
      c[i * 3] *= t[0];
      c[i * 3 + 1] *= t[1];
      c[i * 3 + 2] *= t[2];
    }
    return this;
  }

  t(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }

  /** Quad a-b-c-d (consistent winding). */
  quad(a: number, b: number, c: number, d: number): void {
    this.idx.push(a, b, c, a, c, d);
  }

  append(o: MeshData, m?: THREE.Matrix4): this {
    const base = this.vcount;
    if (m) {
      const c = o.clone().transform(m);
      o = c;
    }
    for (let i = 0; i < o.pos.length; i++) this.pos.push(o.pos[i]);
    for (let i = 0; i < o.nrm.length; i++) this.nrm.push(o.nrm[i]);
    for (let i = 0; i < o.uv.length; i++) this.uv.push(o.uv[i]);
    for (let i = 0; i < o.shade.length; i++) this.shade.push(o.shade[i]);
    if (o.col || this.col) {
      const c = this.col ?? new Array<number>(base * 3).fill(1);
      if (o.col) for (let i = 0; i < o.col.length; i++) c.push(o.col[i]);
      else for (let i = 0; i < o.vcount * 3; i++) c.push(1);
      this.col = c;
    }
    for (let i = 0; i < o.idx.length; i++) this.idx.push(o.idx[i] + base);
    return this;
  }

  clone(): MeshData {
    const c = new MeshData();
    c.pos = this.pos.slice();
    c.nrm = this.nrm.slice();
    c.uv = this.uv.slice();
    c.shade = this.shade.slice();
    c.col = this.col ? this.col.slice() : null;
    c.idx = this.idx.slice();
    return c;
  }

  /** Apply an affine transform (normals use the inverse-transpose). Mirroring transforms flip the winding. */
  transform(m: THREE.Matrix4): this {
    const e = m.elements;
    const p = this.pos;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i], y = p[i + 1], z = p[i + 2];
      p[i] = e[0] * x + e[4] * y + e[8] * z + e[12];
      p[i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      p[i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    }
    const n = _m3.getNormalMatrix(m).elements;
    const q = this.nrm;
    for (let i = 0; i < q.length; i += 3) {
      const x = q[i], y = q[i + 1], z = q[i + 2];
      let a = n[0] * x + n[3] * y + n[6] * z;
      let b = n[1] * x + n[4] * y + n[7] * z;
      let c = n[2] * x + n[5] * y + n[8] * z;
      const l = Math.hypot(a, b, c) || 1;
      a /= l;
      b /= l;
      c /= l;
      q[i] = a;
      q[i + 1] = b;
      q[i + 2] = c;
    }
    if (m.determinant() < 0) this.flipWinding();
    return this;
  }

  translate(x: number, y: number, z: number): this {
    const p = this.pos;
    for (let i = 0; i < p.length; i += 3) {
      p[i] += x;
      p[i + 1] += y;
      p[i + 2] += z;
    }
    return this;
  }

  flipWinding(): this {
    const ix = this.idx;
    for (let i = 0; i < ix.length; i += 3) {
      const t = ix[i + 1];
      ix[i + 1] = ix[i + 2];
      ix[i + 2] = t;
    }
    return this;
  }

  /** Turn the surface inside out (winding and normals). */
  flip(): this {
    this.flipWinding();
    for (let i = 0; i < this.nrm.length; i++) this.nrm[i] = -this.nrm[i];
    return this;
  }

  /** Copy mirrored across the YZ plane (left ↔ right), winding fixed. */
  mirrored(): MeshData {
    return this.clone().transform(new THREE.Matrix4().makeScale(-1, 1, 1));
  }

  /** This mesh plus its mirror image. */
  withMirror(): this {
    return this.append(this.mirrored());
  }

  /** Area-weighted smooth vertex normals from the triangles (shared vertices only). */
  computeNormals(): this {
    const p = this.pos;
    const n = this.nrm;
    n.fill(0);
    const ix = this.idx;
    for (let i = 0; i < ix.length; i += 3) {
      const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
      const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
      const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
      const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
      n[a] += fx; n[a + 1] += fy; n[a + 2] += fz;
      n[b] += fx; n[b + 1] += fy; n[b + 2] += fz;
      n[c] += fx; n[c + 1] += fy; n[c + 2] += fz;
    }
    for (let i = 0; i < n.length; i += 3) {
      const l = Math.hypot(n[i], n[i + 1], n[i + 2]);
      if (l > 1e-12) {
        n[i] /= l;
        n[i + 1] /= l;
        n[i + 2] /= l;
      } else n[i + 1] = 1;
    }
    return this;
  }

  /**
   * Make triangle winding agree with the (analytic) vertex normals. Generators
   * compute outward normals exactly; this picks the matching winding once.
   */
  orient(): this {
    const p = this.pos, n = this.nrm, ix = this.idx;
    let s = 0;
    for (let i = 0; i < ix.length; i += 3) {
      const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
      const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
      const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
      const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
      s += fx * (n[a] + n[b] + n[c]) + fy * (n[a + 1] + n[b + 1] + n[c + 1]) + fz * (n[a + 2] + n[b + 2] + n[c + 2]);
    }
    if (s < 0) this.flipWinding();
    return this;
  }

  setShade(v: number): this {
    this.shade.fill(v);
    return this;
  }

  bounds(): THREE.Box3 {
    const b = new THREE.Box3();
    const p = this.pos;
    for (let i = 0; i < p.length; i += 3) b.expandByPoint(new THREE.Vector3(p[i], p[i + 1], p[i + 2]));
    return b;
  }

  static fromBufferGeometry(g: THREE.BufferGeometry): MeshData {
    const m = new MeshData();
    const pa = g.getAttribute('position');
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const na = g.getAttribute('normal');
    const ua = g.getAttribute('uv');
    for (let i = 0; i < pa.count; i++) {
      m.pos.push(pa.getX(i), pa.getY(i), pa.getZ(i));
      m.nrm.push(na.getX(i), na.getY(i), na.getZ(i));
      if (ua) m.uv.push(ua.getX(i), ua.getY(i));
      else m.uv.push(0, 0);
      m.shade.push(1);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) m.idx.push(g.index.getX(i));
    else for (let i = 0; i < pa.count; i++) m.idx.push(i);
    g.dispose();
    return m;
  }
}

// ───────────────────────────── transforms ─────────────────────────────

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Compose a matrix from position, XYZ euler rotation and scale. */
export function M(pos: P3 = [0, 0, 0], rot: P3 = [0, 0, 0], scale: P3 | number = 1): THREE.Matrix4 {
  _e.set(rot[0], rot[1], rot[2]);
  _q.setFromEuler(_e);
  _p.set(pos[0], pos[1], pos[2]);
  if (typeof scale === 'number') _s.set(scale, scale, scale);
  else _s.set(scale[0], scale[1], scale[2]);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

/** Matrix that maps local +Y onto the direction a→b, placing the origin at `a`. */
export function alongY(a: P3, b: P3, roll = 0): THREE.Matrix4 {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
  if (roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), roll));
  return new THREE.Matrix4().compose(new THREE.Vector3(a[0], a[1], a[2]), q, new THREE.Vector3(1, 1, 1));
}

export function dist3(a: P3, b: P3): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}

export function lerp3(a: P3, b: P3, t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function add3(a: P3, b: P3): [number, number, number] {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

// ───────────────────────────── splines ─────────────────────────────

/** Centripetal Catmull–Rom through `pts` (any dimension), `n` samples per span (open curve). */
export function catmull(pts: ReadonlyArray<readonly number[]>, n: number, closed = false): number[][] {
  const out: number[][] = [];
  const N = pts.length;
  if (N < 2) return pts.map((p) => [...p]);
  const dim = pts[0].length;
  const get = (i: number): readonly number[] => {
    if (closed) return pts[((i % N) + N) % N];
    if (i < 0) return pts[0].map((v, k) => 2 * v - pts[1][k]);
    if (i >= N) return pts[N - 1].map((v, k) => 2 * v - pts[N - 2][k]);
    return pts[i];
  };
  const spans = closed ? N : N - 1;
  for (let i = 0; i < spans; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const d = (a: readonly number[], b: readonly number[]) => {
      let s = 0;
      for (let k = 0; k < dim; k++) s += (b[k] - a[k]) ** 2;
      return Math.max(1e-9, Math.pow(s, 0.25));
    };
    const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
    for (let j = 0; j < n; j++) {
      const t = t1 + ((t2 - t1) * j) / n;
      const pt: number[] = [];
      for (let k = 0; k < dim; k++) {
        const A1 = ((t1 - t) / (t1 - t0)) * p0[k] + ((t - t0) / (t1 - t0)) * p1[k];
        const A2 = ((t2 - t) / (t2 - t1)) * p1[k] + ((t - t1) / (t2 - t1)) * p2[k];
        const A3 = ((t3 - t) / (t3 - t2)) * p2[k] + ((t - t2) / (t3 - t2)) * p3[k];
        const B1 = ((t2 - t) / (t2 - t0)) * A1 + ((t - t0) / (t2 - t0)) * A2;
        const B2 = ((t3 - t) / (t3 - t1)) * A2 + ((t - t1) / (t3 - t1)) * A3;
        pt.push(((t2 - t) / (t2 - t1)) * B1 + ((t - t1) / (t2 - t1)) * B2);
      }
      out.push(pt);
    }
  }
  if (!closed) out.push([...pts[N - 1]]);
  return out;
}

/** Smooth 2D outline through control points; `sharp` indices keep hard corners. */
export function smooth2(pts: readonly P2[], n: number, closed = true, sharp: readonly number[] = []): [number, number][] {
  if (!sharp.length) return catmull(pts, n, closed).map((p) => [p[0], p[1]]);
  // Split at sharp corners and spline each run separately.
  const N = pts.length;
  const out: [number, number][] = [];
  const corners = [...sharp].sort((a, b) => a - b);
  const runs: P2[][] = [];
  if (closed) {
    for (let c = 0; c < corners.length; c++) {
      const a = corners[c];
      const b = corners[(c + 1) % corners.length];
      const run: P2[] = [];
      let i = a;
      for (;;) {
        run.push(pts[i % N]);
        if (i % N === b % N && run.length > 1) break;
        i++;
        if (run.length > N + 1) break;
      }
      runs.push(run);
    }
  } else {
    let start = 0;
    for (const c of corners) {
      runs.push(pts.slice(start, c + 1));
      start = c;
    }
    runs.push(pts.slice(start));
  }
  for (const r of runs) {
    if (r.length < 2) continue;
    const s = catmull(r, n, false);
    for (let i = 0; i < s.length - 1; i++) out.push([s[i][0], s[i][1]]);
    if (!closed) out.push([s[s.length - 1][0], s[s.length - 1][1]]);
  }
  if (!closed) {
    // remove duplicate joins
    return out.filter((p, i) => i === 0 || Math.hypot(p[0] - out[i - 1][0], p[1] - out[i - 1][1]) > 1e-9);
  }
  return out;
}

/** Sample a 3D poly-curve by arc length into `n` segments. */
export function resample3(path: readonly P3[], n: number): [number, number, number][] {
  const len: number[] = [0];
  for (let i = 1; i < path.length; i++) len.push(len[i - 1] + dist3(path[i - 1], path[i]));
  const total = len[len.length - 1];
  const out: [number, number, number][] = [];
  let j = 0;
  for (let i = 0; i <= n; i++) {
    const s = (total * i) / n;
    while (j < len.length - 2 && len[j + 1] < s) j++;
    const t = (s - len[j]) / Math.max(1e-9, len[j + 1] - len[j]);
    out.push(lerp3(path[j], path[j + 1], Math.min(1, Math.max(0, t))));
  }
  return out;
}

export function pathLength(path: readonly P3[]): number {
  let s = 0;
  for (let i = 1; i < path.length; i++) s += dist3(path[i - 1], path[i]);
  return s;
}

// ───────────────────────────── primitives ─────────────────────────────

export type Axis = 'x' | 'y' | 'z';

export interface LatheOpts {
  segs: number;
  /** Start angle and angular span (radians). */
  start?: number;
  span?: number;
  axis?: Axis;
  /** Profile indices with a hard edge (normals split). `true` = every vertex. */
  sharp?: readonly number[] | true;
  /** Shade per profile vertex. */
  shade?: readonly number[];
}

/**
 * Revolve a profile of [radius, axial] points. Profiles are written counter-clockwise
 * in the (r, a) plane (solid on the left), which makes the analytic normals point out.
 */
export function lathe(profile: readonly P2[], o: LatheOpts): MeshData {
  const m = new MeshData();
  const N = profile.length;
  const segs = Math.max(3, Math.round(o.segs));
  const start = o.start ?? 0;
  const span = o.span ?? Math.PI * 2;
  const full = Math.abs(span - Math.PI * 2) < 1e-6;
  const axis = o.axis ?? 'x';
  const sharpAll = o.sharp === true;
  const sharp = new Set(Array.isArray(o.sharp) ? o.sharp : []);
  // Segment normals in (r, a): clockwise rotation of the tangent.
  const segN: [number, number][] = [];
  for (let i = 0; i < N - 1; i++) {
    const dr = profile[i + 1][0] - profile[i][0];
    const da = profile[i + 1][1] - profile[i][1];
    const l = Math.hypot(dr, da) || 1;
    segN.push([da / l, -dr / l]);
  }
  // Rings: [profile index, nr, na]; sharp vertices emit two rings.
  const rings: [number, number, number][] = [];
  for (let i = 0; i < N; i++) {
    const prev = i > 0 ? segN[i - 1] : null;
    const next = i < N - 1 ? segN[i] : null;
    if ((sharpAll || sharp.has(i)) && prev && next) {
      rings.push([i, prev[0], prev[1]]);
      rings.push([i, next[0], next[1]]);
    } else {
      const a = prev ?? next!;
      const b = next ?? prev!;
      const nr = a[0] + b[0], na = a[1] + b[1];
      const l = Math.hypot(nr, na) || 1;
      rings.push([i, nr / l, na / l]);
    }
  }
  const cols = segs + 1;
  const total = rings.length;
  let arc = 0;
  const arcs: number[] = [];
  for (let r = 0; r < total; r++) {
    if (r > 0) {
      const a = profile[rings[r - 1][0]], b = profile[rings[r][0]];
      arc += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    arcs.push(arc);
  }
  for (let r = 0; r < total; r++) {
    const [pi, nr, na] = rings[r];
    const [rad, ax] = profile[pi];
    const sh = o.shade ? o.shade[pi] : 1;
    for (let k = 0; k < cols; k++) {
      const th = start + (span * k) / segs;
      const c = Math.cos(th), s = Math.sin(th);
      const u = k / segs;
      const w = arc > 0 ? arcs[r] / arc : 0;
      if (axis === 'x') m.v(ax, rad * c, rad * s, na, nr * c, nr * s, u, w, sh);
      else if (axis === 'y') m.v(rad * s, ax, rad * c, nr * s, na, nr * c, u, w, sh);
      else m.v(rad * c, rad * s, ax, nr * c, nr * s, na, u, w, sh);
    }
  }
  for (let r = 0; r < total - 1; r++) {
    if (rings[r][0] === rings[r + 1][0]) continue; // crease duplicate
    for (let k = 0; k < segs; k++) {
      const a = r * cols + k, b = a + 1, c = a + cols, d = c + 1;
      m.t(a, c, b);
      m.t(b, c, d);
    }
  }
  if (!full) {
    // open lathes keep their seam; nothing to weld
  }
  return m.orient();
}

export interface SweepOpts {
  closedProfile?: boolean;
  closedPath?: boolean;
  /** Per path-point scale of the profile (uniform or [sx, sy]). */
  scale?: ReadonlyArray<number | P2>;
  /** Initial frame "up" hint (profile +y). */
  up?: P3;
  capStart?: boolean;
  capEnd?: boolean;
  /** Profile vertices with hard edges (`true` = all, for boxy sections). */
  sharp?: readonly number[] | true;
  /** Twist (radians) along the path, per point. */
  twist?: ReadonlyArray<number>;
  shade?: number;
}

/**
 * Sweep a 2D profile along a 3D path with rotation-minimising frames.
 * Closed profiles should be counter-clockwise (outward normals).
 */
export function sweep(path: readonly P3[], profile: readonly P2[], o: SweepOpts = {}): MeshData {
  const m = new MeshData();
  const P = path.length;
  const closedProf = o.closedProfile ?? true;
  const K = profile.length;
  // Tangents
  const T: THREE.Vector3[] = [];
  for (let i = 0; i < P; i++) {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(P - 1, i + 1)];
    let t = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (o.closedPath) {
      const a2 = path[(i - 1 + P) % P], b2 = path[(i + 1) % P];
      t = new THREE.Vector3(b2[0] - a2[0], b2[1] - a2[1], b2[2] - a2[2]);
    }
    if (t.lengthSq() < 1e-14) t.set(0, 0, 1);
    T.push(t.normalize());
  }
  // Parallel transport frames
  const Nf: THREE.Vector3[] = [];
  const up = new THREE.Vector3(...(o.up ?? [0, 1, 0]));
  let n0 = up.clone().sub(T[0].clone().multiplyScalar(up.dot(T[0])));
  if (n0.lengthSq() < 1e-8) {
    const alt = Math.abs(T[0].x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    n0 = alt.sub(T[0].clone().multiplyScalar(alt.dot(T[0])));
  }
  Nf.push(n0.normalize());
  const q = new THREE.Quaternion();
  for (let i = 1; i < P; i++) {
    q.setFromUnitVectors(T[i - 1], T[i]);
    Nf.push(Nf[i - 1].clone().applyQuaternion(q).normalize());
  }
  // Profile normals (2D), with optional hard corners.
  const sharpAll = o.sharp === true;
  const sharp = new Set(Array.isArray(o.sharp) ? o.sharp : []);
  const segN: [number, number][] = [];
  const segCount = closedProf ? K : K - 1;
  for (let i = 0; i < segCount; i++) {
    const a = profile[i], b = profile[(i + 1) % K];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    segN.push([dy / l, -dx / l]);
  }
  // Columns: profile vertex, normal
  const cols: [number, number, number][] = [];
  for (let i = 0; i < K; i++) {
    const prev = closedProf ? segN[(i - 1 + K) % K] : i > 0 ? segN[i - 1] : null;
    const next = closedProf ? segN[i] : i < K - 1 ? segN[i] : null;
    if ((sharpAll || sharp.has(i)) && prev && next) {
      cols.push([i, prev[0], prev[1]]);
      cols.push([i, next[0], next[1]]);
    } else {
      const a = prev ?? next!;
      const b = next ?? prev!;
      const x = a[0] + b[0], y = a[1] + b[1];
      const l = Math.hypot(x, y) || 1;
      cols.push([i, x / l, y / l]);
    }
  }
  // Close the profile loop by repeating the first column (UV seam).
  if (closedProf) {
    const first = cols[0];
    if (sharpAll || sharp.has(0)) {
      // first column holds "prev" normal → the wrap needs the "prev" side, which is cols[0]; re-add for seam
      cols.push([first[0], first[1], first[2]]);
      // move the leading prev-normal column to the end: rotate so seam pairs line up
      cols.shift();
    } else cols.push([first[0], first[1], first[2]]);
  }
  const C = cols.length;
  const shade = o.shade ?? 1;
  let along = 0;
  for (let i = 0; i < P; i++) {
    if (i > 0) along += dist3(path[i - 1], path[i]);
    const t = T[i];
    const n = Nf[i];
    const b = new THREE.Vector3().crossVectors(t, n);
    const tw = o.twist ? o.twist[i] : 0;
    let nx = n, bx = b;
    if (tw) {
      const c = Math.cos(tw), s = Math.sin(tw);
      nx = n.clone().multiplyScalar(c).add(b.clone().multiplyScalar(s));
      bx = b.clone().multiplyScalar(c).sub(n.clone().multiplyScalar(s));
    }
    const sc = o.scale ? o.scale[i] : 1;
    const sx = typeof sc === 'number' ? sc : sc[0];
    const sy = typeof sc === 'number' ? sc : sc[1];
    for (let c = 0; c < C; c++) {
      const [pi, pnx, pny] = cols[c];
      const px = profile[pi][0] * sx, py = profile[pi][1] * sy;
      // Normal under anisotropic scale: inverse scale on the 2D normal.
      let qx = pnx / (sx || 1), qy = pny / (sy || 1);
      const ql = Math.hypot(qx, qy) || 1;
      qx /= ql;
      qy /= ql;
      const p = path[i];
      m.v(
        p[0] + nx.x * px + bx.x * py,
        p[1] + nx.y * px + bx.y * py,
        p[2] + nx.z * px + bx.z * py,
        nx.x * qx + bx.x * qy,
        nx.y * qx + bx.y * qy,
        nx.z * qx + bx.z * qy,
        c / (C - 1),
        along,
        shade,
      );
    }
  }
  const rows = o.closedPath ? P : P - 1;
  for (let i = 0; i < rows; i++) {
    const i2 = (i + 1) % P;
    for (let c = 0; c < C - 1; c++) {
      if (cols[c][0] === cols[c + 1][0]) continue;
      const a = i * C + c, b = a + 1, d = i2 * C + c, e = d + 1;
      m.t(a, d, b);
      m.t(b, d, e);
    }
  }
  const cap = (row: number, dir: number) => {
    if (!closedProf) return;
    const t = T[row].clone().multiplyScalar(dir);
    const n = Nf[row];
    const b = new THREE.Vector3().crossVectors(T[row], n);
    const sc = o.scale ? o.scale[row] : 1;
    const sx = typeof sc === 'number' ? sc : sc[0];
    const sy = typeof sc === 'number' ? sc : sc[1];
    const contour = profile.map((p) => new THREE.Vector2(p[0] * sx, p[1] * sy));
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    const base = m.vcount;
    const p0 = path[row];
    for (const p of contour) {
      m.v(p0[0] + n.x * p.x + b.x * p.y, p0[1] + n.y * p.x + b.y * p.y, p0[2] + n.z * p.x + b.z * p.y, t.x, t.y, t.z, p.x, p.y, shade);
    }
    for (const tr of tris) {
      // orient each cap triangle to face along t
      const A = base + tr[0], B = base + tr[1], Cc = base + tr[2];
      const pa = m.pos, ax = pa[A * 3], ay = pa[A * 3 + 1], az = pa[A * 3 + 2];
      const ux = pa[B * 3] - ax, uy = pa[B * 3 + 1] - ay, uz = pa[B * 3 + 2] - az;
      const vx = pa[Cc * 3] - ax, vy = pa[Cc * 3 + 1] - ay, vz = pa[Cc * 3 + 2] - az;
      const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
      if (fx * t.x + fy * t.y + fz * t.z >= 0) m.t(A, B, Cc);
      else m.t(A, Cc, B);
    }
  };
  // Orient the tube walls first (caps are self-oriented).
  m.orient();
  if (o.capStart) cap(0, -1);
  if (o.capEnd) cap(P - 1, 1);
  return m;
}

/** Circle / ellipse profile (counter-clockwise). */
export function circle(r: number, n: number, ry = r): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([Math.cos(a) * r, Math.sin(a) * ry]);
  }
  return out;
}

/** Rounded rectangle profile centred at the origin (counter-clockwise). */
export function roundRect(w: number, h: number, r: number, n = 3): [number, number][] {
  r = Math.max(0, Math.min(r, w / 2 - 1e-5, h / 2 - 1e-5));
  const out: [number, number][] = [];
  const corners: [number, number, number][] = [
    [w / 2 - r, -h / 2 + r, -Math.PI / 2],
    [w / 2 - r, h / 2 - r, 0],
    [-w / 2 + r, h / 2 - r, Math.PI / 2],
    [-w / 2 + r, -h / 2 + r, Math.PI],
  ];
  for (const [cx, cy, a0] of corners) {
    if (r <= 1e-6) {
      out.push([cx, cy]);
      continue;
    }
    for (let i = 0; i <= n; i++) {
      const a = a0 + (i / n) * (Math.PI / 2);
      out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  }
  return out;
}

/** Tube through control points (Catmull–Rom), radius r. */
export function tube(ctrl: readonly P3[], r: number, radial: number, perSpan = 8, o: SweepOpts = {}): MeshData {
  const pts = ctrl.length > 2 ? catmull(ctrl, perSpan).map((p) => [p[0], p[1], p[2]] as P3) : (ctrl as P3[]);
  return sweep(pts, circle(r, Math.max(3, radial)), { ...o, closedProfile: true });
}

/** Straight cylinder from a to b (radii r1 at a, r2 at b), optional caps. */
export function rod(a: P3, b: P3, r1: number, r2 = r1, radial = 12, caps = true): MeshData {
  const len = dist3(a, b);
  const prof: P2[] = caps
    ? [[0, 0], [r1, 0], [r2, len], [0, len]]
    : [[r1, 0], [r2, len]];
  const g = lathe(prof, { segs: radial, axis: 'y', sharp: caps ? [1, 2] : undefined });
  return g.transform(alongY(a, b));
}

/** Box with optional hard edges. */
export function box(w: number, h: number, d: number): MeshData {
  const m = new MeshData();
  const x = w / 2, y = h / 2, z = d / 2;
  const faces: [P3, P3[]][] = [
    [[1, 0, 0], [[x, -y, -z], [x, y, -z], [x, y, z], [x, -y, z]]],
    [[-1, 0, 0], [[-x, -y, z], [-x, y, z], [-x, y, -z], [-x, -y, -z]]],
    [[0, 1, 0], [[-x, y, -z], [-x, y, z], [x, y, z], [x, y, -z]]],
    [[0, -1, 0], [[-x, -y, z], [-x, -y, -z], [x, -y, -z], [x, -y, z]]],
    [[0, 0, 1], [[x, -y, z], [x, y, z], [-x, y, z], [-x, -y, z]]],
    [[0, 0, -1], [[-x, -y, -z], [-x, y, -z], [x, y, -z], [x, -y, -z]]],
  ];
  for (const [n, q] of faces) {
    const i = q.map((p, k) => m.v(p[0], p[1], p[2], n[0], n[1], n[2], k === 1 || k === 2 ? 1 : 0, k >= 2 ? 1 : 0));
    m.t(i[0], i[1], i[2]);
    m.t(i[0], i[2], i[3]);
  }
  return m.orient();
}

/** UV sphere / ellipsoid. */
export function sphere(r: number, segs = 16, rings = 10, ry = r, rz = r): MeshData {
  const prof: P2[] = [];
  for (let i = 0; i <= rings; i++) {
    const a = -Math.PI / 2 + (i / rings) * Math.PI;
    prof.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const m = lathe(prof, { segs, axis: 'y' });
  if (ry !== r || rz !== r) m.transform(new THREE.Matrix4().makeScale(1, ry / r, rz / r));
  return m;
}

/** Torus around the X axis (major radius R, tube radius r). */
export function torusX(R: number, r: number, segs = 32, radial = 8, start = 0, span = Math.PI * 2): MeshData {
  const prof: P2[] = [];
  for (let i = 0; i <= radial; i++) {
    const a = (i / radial) * Math.PI * 2;
    prof.push([R + Math.cos(a) * r, Math.sin(a) * r]);
  }
  return lathe(prof, { segs, axis: 'x', start, span });
}

export type ExtrudePlane = 'zy' | 'xy' | 'xz';

export interface ExtrudeOpts {
  bevel?: number;
  bevelSegs?: number;
  holes?: readonly (readonly P2[])[];
  curveSegs?: number;
  /** Outline plane: 'zy' side profile extruded across X, 'xy' front outline along Z, 'xz' plan outline along Y. */
  plane?: ExtrudePlane;
  /** Centre of the extrusion along its axis. */
  center?: number;
}

/**
 * Extrude a 2D outline with rounded bevels. Outline points are in the plane's
 * coordinates (e.g. [z, y] for 'zy'); depth is the full thickness incl. bevels.
 */
export function extrude(outline: readonly P2[], depth: number, o: ExtrudeOpts = {}): MeshData {
  const plane = o.plane ?? 'zy';
  const bevel = Math.min(o.bevel ?? 0, depth * 0.45);
  const shape = new THREE.Shape(outline.map((p) => new THREE.Vector2(p[0], p[1])));
  for (const h of o.holes ?? []) shape.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p[0], p[1]))));
  const core = Math.max(1e-4, depth - bevel * 2);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: core,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel * 0.85,
    bevelOffset: -bevel * 0.85,
    bevelSegments: o.bevelSegs ?? 2,
    curveSegments: o.curveSegs ?? 4,
  });
  g.translate(0, 0, -core / 2 + (o.center ?? 0));
  const m = MeshData.fromBufferGeometry(g);
  // Map shape (sx, sy, e) into the requested plane.
  const p = m.pos, n = m.nrm;
  const remap = (arr: number[]) => {
    for (let i = 0; i < arr.length; i += 3) {
      const sx = arr[i], sy = arr[i + 1], e = arr[i + 2];
      if (plane === 'zy') {
        arr[i] = e;
        arr[i + 1] = sy;
        arr[i + 2] = sx;
      } else if (plane === 'xz') {
        arr[i] = sx;
        arr[i + 1] = e;
        arr[i + 2] = sy;
      }
    }
  };
  if (plane !== 'xy') {
    remap(p);
    remap(n);
    m.flipWinding(); // both remaps are reflections
  }
  return m;
}

/** Rounded box (bevelled edges). */
export function roundBox(w: number, h: number, d: number, r: number, segs = 2): MeshData {
  r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  if (r <= 1e-4) return box(w, h, d);
  return extrude(roundRect(w, h, r, segs), d, { bevel: r * 0.9, bevelSegs: segs, plane: 'xy' });
}

/** Hexagon bolt head + washer, axis +Y, sitting on the origin. */
export function bolt(r: number, h = r * 0.7, hex = true, segs = 6): MeshData {
  const m = lathe([[0, 0], [r * 1.35, 0], [r * 1.35, h * 0.18], [r, h * 0.2], [r, h], [0, h]], { segs: hex ? 6 : Math.max(8, segs), axis: 'y', sharp: true });
  return m;
}

/** Helical coil (springs), axis +Y from 0 to len. */
export function coil(R: number, wire: number, len: number, turns: number, segsPerTurn = 16, radial = 6): MeshData {
  const pts: P3[] = [];
  const n = Math.max(8, Math.round(turns * segsPerTurn));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = t * turns * Math.PI * 2;
    // flattened end coils like a real spring
    const ease = t < 0.05 ? t * 0.5 : t > 0.95 ? 0.975 + (t - 0.95) * 0.5 : 0.025 + (t - 0.05) * (0.95 / 0.9);
    pts.push([Math.cos(a) * R, ease * len, Math.sin(a) * R]);
  }
  return sweep(pts, circle(wire, radial));
}

/** Flat polygon (single sided, facing +normal axis) from an outline in a plane. */
export function flat(outline: readonly P2[], plane: ExtrudePlane = 'xy', offset = 0, facing = 1): MeshData {
  const m = new MeshData();
  const pts = outline.map((p) => new THREE.Vector2(p[0], p[1]));
  const tris = THREE.ShapeUtils.triangulateShape(pts, []);
  const n: P3 = plane === 'xy' ? [0, 0, facing] : plane === 'zy' ? [facing, 0, 0] : [0, facing, 0];
  for (const p of outline) {
    if (plane === 'xy') m.v(p[0], p[1], offset, ...n, p[0], p[1]);
    else if (plane === 'zy') m.v(offset, p[1], p[0], ...n, p[0], p[1]);
    else m.v(p[0], offset, p[1], ...n, p[0], p[1]);
  }
  for (const t of tris) m.t(t[0], t[1], t[2]);
  return m.orient();
}
