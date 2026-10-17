import * as THREE from 'three';
import { T, mul, type KitContext } from '../context';
import { MeshData, catmull, circle, lathe, sweep, type P2, type P3 } from '../mesh';
import { F, hard, Micro, type Finish, type GroupName } from '../sink';
import { shell } from './body';

/**
 * Free-form bodywork helpers for the retro / scooter / electric family (Vespa, TMAX, LiveWire, classics).
 * The kit's OutlineBody lofts run along Z only, which cannot describe a scooter leg shield or a slanted
 * steering-column cover: these rings-along-a-spine lofts can. Pure additions, nothing else depends on them.
 *
 * Bike space: +Y up, −Z forward, +X right, rear axle at z = 0.
 */

export type Ring = readonly P3[];

/**
 * Closed section polygon (counter-clockwise in its own x/y plane): `x` lateral, `y` along the in-plane
 * perpendicular of the spine (forward for an upright spine, up for a horizontal one).
 * `front` / `back` are the depths on the +y / −y side, each with its own squareness exponent
 * (1 = diamond, 0.6 = boxy rounded, ≥1.6 = pinched).
 */
export function lensProfile(hw: number, front: number, back: number, n = 32, pFront = 0.62, pBack = 0.62, pX = 0.62): P2[] {
  // Dense superellipse, then resampled at equal arc length so the vertices (and any cut edges
  // through them) are evenly spread even on very boxy sections.
  const M = n * 8;
  const dense: P2[] = [];
  for (let i = 0; i < M; i++) {
    const a = (i / M) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    const x = hw * Math.sign(c) * Math.pow(Math.abs(c), pX);
    const y = s >= 0 ? front * Math.pow(s, pFront) : -back * Math.pow(-s, pBack);
    dense.push([x, y]);
  }
  const cum: number[] = [0];
  for (let i = 1; i <= M; i++) {
    const a = dense[i - 1], b = dense[i % M];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = cum[M];
  const out: P2[] = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const d = (i / n) * total;
    while (j < M - 1 && cum[j + 1] < d) j++;
    const t = (d - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
    const a = dense[j], b = dense[(j + 1) % M];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

export interface SpineFrame {
  o: THREE.Vector3;
  /** Lateral axis. */
  x: THREE.Vector3;
  /** In-plane perpendicular of the tangent (forward of an upright spine, up of a horizontal one). */
  y: THREE.Vector3;
  t: THREE.Vector3;
}

/** Dense Catmull–Rom spine through control points. */
export function spine(ctrl: readonly P3[], per = 8): P3[] {
  if (ctrl.length < 3) return ctrl.slice();
  return catmull(ctrl, per).map((q) => [q[0], q[1], q[2]] as P3);
}

export function spineFrames(path: readonly P3[]): SpineFrame[] {
  const out: SpineFrame[] = [];
  const n = path.length;
  for (let i = 0; i < n; i++) {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)];
    const t = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    // Perpendicular in the YZ plane, rotated −90° about X from the tangent: up-spine → forward (−Z), back-spine → up.
    const y = new THREE.Vector3(0, t.z, -t.y);
    if (y.lengthSq() < 1e-9) y.set(0, 1, 0);
    y.normalize();
    out.push({ o: new THREE.Vector3(path[i][0], path[i][1], path[i][2]), x: new THREE.Vector3(1, 0, 0), y, t });
  }
  return out;
}

export function ringOf(f: SpineFrame, prof: readonly P2[], sx = 1, sy = 1): P3[] {
  return prof.map(([px, py]) => {
    const x = px * sx, y = py * sy;
    return [f.o.x + f.x.x * x + f.y.x * y, f.o.y + f.x.y * x + f.y.y * y, f.o.z + f.x.z * x + f.y.z * y] as P3;
  });
}

export interface RingLoftOpts {
  /** Extra samples per span along the spine (Catmull–Rom through each longitudinal line). */
  su?: number;
  capStart?: boolean;
  capEnd?: boolean;
}

/** Closed tube through rings of equal point count. Winding is chosen so normals point out of the body. */
export function ringLoft(rings: readonly Ring[], o: RingLoftOpts = {}): MeshData {
  const K = rings[0].length;
  const su = Math.max(1, Math.round(o.su ?? 1));
  let rs: Ring[] = rings.slice();
  if (su > 1 && rings.length > 2) {
    const lines: number[][][] = [];
    for (let k = 0; k < K; k++) lines.push(catmull(rings.map((r) => r[k]), su));
    const n = lines[0].length;
    rs = [];
    for (let j = 0; j < n; j++) rs.push(lines.map((l) => [l[j][0], l[j][1], l[j][2]] as P3));
  }
  const R = rs.length;
  const m = new MeshData();
  for (let r = 0; r < R; r++) for (let k = 0; k < K; k++) m.v(rs[r][k][0], rs[r][k][1], rs[r][k][2], 0, 1, 0, k / K, r / Math.max(1, R - 1));
  const C = K;
  for (let r = 0; r < R - 1; r++) {
    for (let k = 0; k < K; k++) {
      const a = r * C + k, b = r * C + ((k + 1) % K), d = a + C, e = b + C;
      m.t(a, d, b);
      m.t(b, d, e);
    }
  }
  m.computeNormals();
  // Outward test against the ring centroids.
  let s = 0;
  const cen: THREE.Vector3[] = rs.map((r) => {
    const c = new THREE.Vector3();
    for (const p of r) c.add(new THREE.Vector3(p[0], p[1], p[2]));
    return c.multiplyScalar(1 / K);
  });
  for (let r = 0; r < R; r++) {
    for (let k = 0; k < K; k++) {
      const i = r * C + k;
      s += (m.pos[i * 3] - cen[r].x) * m.nrm[i * 3] + (m.pos[i * 3 + 1] - cen[r].y) * m.nrm[i * 3 + 1] + (m.pos[i * 3 + 2] - cen[r].z) * m.nrm[i * 3 + 2];
    }
  }
  if (s < 0) m.flip();
  const cap = (r: number, outward: THREE.Vector3): void => {
    const base = m.vcount;
    const c = cen[r];
    m.v(c.x, c.y, c.z, outward.x, outward.y, outward.z, 0.5, 0.5);
    for (let k = 0; k < K; k++) m.v(rs[r][k][0], rs[r][k][1], rs[r][k][2], outward.x, outward.y, outward.z, 0, 0);
    for (let k = 0; k < K; k++) m.t(base, base + 1 + k, base + 1 + ((k + 1) % K));
  };
  const capStartAt = m.tcount;
  if (o.capStart) cap(0, cen[0].clone().sub(cen[Math.min(R - 1, 1)]).normalize());
  if (o.capEnd) cap(R - 1, cen[R - 1].clone().sub(cen[Math.max(0, R - 2)]).normalize());
  // Orient the cap triangles to their normals.
  if (o.capStart || o.capEnd) {
    const idx = m.idx;
    for (let t = capStartAt * 3; t < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      const ux = m.pos[b] - m.pos[a], uy = m.pos[b + 1] - m.pos[a + 1], uz = m.pos[b + 2] - m.pos[a + 2];
      const vx = m.pos[c] - m.pos[a], vy = m.pos[c + 1] - m.pos[a + 1], vz = m.pos[c + 2] - m.pos[a + 2];
      const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
      if (fx * m.nrm[a] + fy * m.nrm[a + 1] + fz * m.nrm[a + 2] < 0) {
        const tmp = idx[t + 1];
        idx[t + 1] = idx[t + 2];
        idx[t + 2] = tmp;
      }
    }
  }
  return m;
}

/** A ring loft along a spine; `prof(t)` returns the section at parameter t ∈ [0, 1] (equal point counts). */
export function spineLoft(path: readonly P3[], prof: (t: number) => readonly P2[], o: RingLoftOpts = {}): MeshData {
  const fr = spineFrames(path);
  const n = fr.length;
  return ringLoft(fr.map((f, i) => ringOf(f, prof(i / Math.max(1, n - 1)))), o);
}

/** Linear interpolation helper for per-station parameters: `lerpKeys([[t, v], …])(t)`. */
export function keys(k: readonly P2[]): (t: number) => number {
  return (t: number) => {
    if (t <= k[0][0]) return k[0][1];
    for (let i = 1; i < k.length; i++) {
      if (t <= k[i][0]) {
        const u = (t - k[i - 1][0]) / (k[i][0] - k[i - 1][0] || 1);
        const s = u * u * (3 - 2 * u);
        return k[i - 1][1] + (k[i][1] - k[i - 1][1]) * s;
      }
    }
    return k[k.length - 1][1];
  };
}

/** Add a lofted painted shell (flanged open edges) to a group. */
export function addShell(ctx: KitContext, group: GroupName, m: MeshData, f: Finish, depth = 0.008): MeshData {
  shell(ctx, group, m, f, depth);
  return m;
}

// ───────────────────────────── small shared bits ─────────────────────────────

/** Chrome ring (torus-like bezel) around a circular opening; axis along the facing direction. */
export function bezelRing(ctx: KitContext, group: GroupName, at: P3, facing: P3, r: number, tube: number, f: Finish = F.chrome): void {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...facing).normalize());
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...at), q, new THREE.Vector3(1, 1, 1));
  const prof: P2[] = circle(tube, 10).map(([x, y]) => [r + x, y] as P2);
  ctx.add(group, lathe(prof, { segs: ctx.seg(44, 16), axis: 'z' }), f, m);
}

/** A row of slim vertical / horizontal ribs (horn covers, grilles, finned covers). */
export function ribs(ctx: KitContext, group: GroupName, n: number, at: (i: number) => P3, size: P3, f: Finish, m0?: THREE.Matrix4): void {
  for (let i = 0; i < n; i++) {
    const p = at(i);
    const mesh = new MeshData();
    // box built from a lathe-free thin slab
    const x = size[0] / 2, y = size[1] / 2, z = size[2] / 2;
    const faces: [P3, P3[]][] = [
      [[1, 0, 0], [[x, -y, -z], [x, y, -z], [x, y, z], [x, -y, z]]],
      [[-1, 0, 0], [[-x, -y, z], [-x, y, z], [-x, y, -z], [-x, -y, -z]]],
      [[0, 1, 0], [[-x, y, -z], [-x, y, z], [x, y, z], [x, y, -z]]],
      [[0, -1, 0], [[-x, -y, z], [-x, -y, -z], [x, -y, -z], [x, -y, z]]],
      [[0, 0, 1], [[x, -y, z], [x, y, z], [-x, y, z], [-x, -y, z]]],
      [[0, 0, -1], [[-x, -y, -z], [-x, y, -z], [x, y, -z], [x, -y, -z]]],
    ];
    for (const [n3, q] of faces) {
      const idx = q.map((pp) => mesh.v(pp[0], pp[1], pp[2], n3[0], n3[1], n3[2]));
      mesh.t(idx[0], idx[1], idx[2]);
      mesh.t(idx[0], idx[2], idx[3]);
    }
    mesh.orient();
    ctx.add(group, mesh, f, m0 ? mul(m0, T(p[0], p[1], p[2])) : T(p[0], p[1], p[2]));
  }
}

/** Tube along bike-space points with round section (Catmull–Rom smoothed). */
export function pipeAlong(ctx: KitContext, group: GroupName, pts: readonly P3[], r: number, f: Finish, rEnd?: number): P3[] {
  const path = pts.length > 2 ? spine(pts, ctx.seg(8, 3)) : pts.slice();
  const n = path.length;
  const scale = rEnd !== undefined ? path.map((_, i) => 1 + (rEnd / r - 1) * (i / (n - 1))) : undefined;
  ctx.add(group, sweep(path, circle(r, ctx.seg(14, 6)), { capStart: true, capEnd: true, scale }), f);
  return path;
}

/** Cast-aluminium finish with a tint (engine cases, hub housings). */
export function castTint(hex: string, metal = 0.7, rough = 0.45): Finish {
  return hard(hex, metal, rough, 0.2, Micro.cast);
}

/** Thin arched sheet section (windscreens, visors): convex towards +y, closed polygon of 2n points. */
export function archProfile(hw: number, sag: number, thick: number, n = 14): P2[] {
  const top: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const u = -1 + (2 * i) / n;
    top.push([u * hw, sag * (1 - u * u)]);
  }
  const out: P2[] = top.slice();
  for (let i = n; i >= 0; i--) {
    const u = -1 + (2 * i) / n;
    // Thin sheet: the back face follows the front, pulled back by `thick`.
    out.push([u * hw * 0.998, sag * (1 - u * u) - thick]);
  }
  // Counter-clockwise ordering (x increasing along the front face, then back along the rear) ⇒ reverse for CCW.
  return out.reverse();
}

/** Matrix placing a part whose local +Z is the outward direction `n` at `p` (lamps, badges on surfaces). */
export function onSurface(p: P3, n: P3, roll = 0): THREE.Matrix4 {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...n).normalize());
  if (roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll));
  return new THREE.Matrix4().compose(new THREE.Vector3(...p), q, new THREE.Vector3(1, 1, 1));
}
