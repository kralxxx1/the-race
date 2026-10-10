import { MeshData, catmull, smooth2, type P2, type P3 } from './mesh';

/**
 * Bodywork surfaces.
 *
 * A body surface is lofted through cross-sections ("stations"). Every station has
 * the same number of control points, so point k of each station forms a
 * longitudinal character line running along the bike — exactly how designers
 * draw bodywork. Lines flagged as creases stay sharp. The smooth surface is
 * then cut into separate panels by signed-distance regions drawn in side, plan
 * or front view, leaving real panel gaps, vents and openings with folded-under
 * edges (flanges) so the cut lines read as pressed panels, not decals.
 */

export interface Station {
  z: number;
  /** Right-half section from the top centre-line (x = 0) down to the bottom edge. */
  pts: readonly P2[];
  /** Transverse crease at this station (the surface breaks sharply across it). */
  sharp?: boolean;
}

export interface LoftOpts {
  /** Samples per station span along Z. */
  su: number;
  /** Samples per section span. */
  sv: number;
  /** Section point indices that are hard character lines. */
  creases?: readonly number[];
  /** Mirror to a full symmetric section (default). False = right half only. */
  mirror?: boolean;
  /** Lateral offset of the whole surface (for off-centre parts). */
  x?: number;
  /** Close the ring when the last point lies on the centre-line (closed bodies). */
  closed?: boolean;
  /** Cap the first / last station with a flat fan. */
  capFront?: boolean;
  capBack?: boolean;
}

/** Loft a body surface through cross-sections. */
export function loft(stations: readonly Station[], o: LoftOpts): MeshData {
  const st = [...stations].sort((a, b) => a.z - b.z);
  const K = st[0].pts.length;
  for (const s of st) if (s.pts.length !== K) throw new Error('loft: stations need equal point counts');
  const su = Math.max(1, Math.round(o.su));
  const sv = Math.max(1, Math.round(o.sv));
  const mirror = o.mirror ?? true;
  const xo = o.x ?? 0;
  const creases = new Set(o.creases ?? []);

  // 1) Rings along Z: interpolate each character line through the stations,
  //    restarting the spline at transverse creases.
  const runs: Station[][] = [];
  let cur: Station[] = [];
  for (const s of st) {
    cur.push(s);
    if (s.sharp && cur.length > 1) {
      runs.push(cur);
      cur = [s];
    }
  }
  if (cur.length > 1 || runs.length === 0) runs.push(cur);
  const rings: P3[][] = [];
  const ringRun: number[] = [];
  runs.forEach((run, ri) => {
    const lines: number[][][] = [];
    for (let k = 0; k < K; k++) {
      const ctrl = run.map((s) => [s.pts[k][0], s.pts[k][1], s.z]);
      lines.push(catmull(ctrl, su));
    }
    const n = lines[0].length;
    for (let j = 0; j < n; j++) {
      rings.push(lines.map((l) => [l[j][0], l[j][1], l[j][2]] as P3));
      ringRun.push(ri);
    }
  });

  // 2) Full section per ring: mirrored left half + right half, spline-subdivided.
  const onAxis = (p: P3) => Math.abs(p[0]) < 1e-6;
  const fullIdx: number[] = []; // control index per full-section point (signed for left)
  if (mirror) {
    for (let k = K - 1; k >= 0; k--) {
      if (k === 0 && onAxis(rings[0][0])) continue;
      fullIdx.push(-(k + 1));
    }
  }
  for (let k = 0; k < K; k++) fullIdx.push(k + 1);
  const isCrease = (fi: number) => creases.has(Math.abs(fi) - 1);
  const cols: { seg: number; t: number; dup: boolean }[] = [];
  const F = fullIdx.length;
  for (let i = 0; i < F - 1; i++) {
    for (let j = 0; j < sv; j++) {
      cols.push({ seg: i, t: j / sv, dup: false });
      if (j === 0 && i > 0 && isCrease(fullIdx[i])) cols.push({ seg: i, t: 0, dup: true });
    }
  }
  cols.push({ seg: F - 2, t: 1, dup: false });
  // Mark which column starts a new smooth run (after a crease duplicate).
  const sectionPoint = (ring: P3[], fi: number): P3 => {
    const k = Math.abs(fi) - 1;
    const p = ring[k];
    return fi < 0 ? [-p[0], p[1], p[2]] : p;
  };
  const C = cols.length;
  const R = rings.length;
  const m = new MeshData();
  for (let r = 0; r < R; r++) {
    const ring = rings[r];
    const pts = fullIdx.map((fi) => sectionPoint(ring, fi));
    for (let c = 0; c < C; c++) {
      const { seg, t } = cols[c];
      const p = splineSeg(pts, seg, t, (i) => isCrease(fullIdx[i]));
      m.v(p[0] + xo, p[1], p[2], 0, 1, 0, c / (C - 1), r / (R - 1));
    }
  }
  // 3) Triangles (outward when sections run left→top→right and Z increases).
  for (let r = 0; r < R - 1; r++) {
    if (ringRun[r] !== ringRun[r + 1]) continue; // transverse crease duplicate ring
    for (let c = 0; c < C - 1; c++) {
      if (cols[c + 1].dup) continue;
      const a = r * C + c, b = a + 1, d = a + C, e = d + 1;
      m.t(a, d, b);
      m.t(b, d, e);
    }
  }
  if (o.closed) {
    // join last column to first (bottom seam)
    for (let r = 0; r < R - 1; r++) {
      if (ringRun[r] !== ringRun[r + 1]) continue;
      const a = r * C + (C - 1), b = r * C, d = a + C, e = b + C;
      m.t(a, d, b);
      m.t(b, d, e);
    }
  }
  m.computeNormals();
  const capRing = (r: number, back: boolean) => {
    const base = m.vcount;
    let cx = 0, cy = 0, cz = 0;
    for (let c = 0; c < C; c++) {
      cx += m.pos[(r * C + c) * 3];
      cy += m.pos[(r * C + c) * 3 + 1];
      cz += m.pos[(r * C + c) * 3 + 2];
    }
    cx /= C;
    cy /= C;
    cz /= C;
    const nz = back ? 1 : -1;
    const ci = m.v(cx, cy, cz, 0, 0, nz, 0.5, back ? 1 : 0);
    for (let c = 0; c < C; c++) {
      const i = r * C + c;
      m.v(m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2], 0, 0, nz, 0, 0);
    }
    for (let c = 0; c < C - 1; c++) {
      if (back) m.t(ci, base + 1 + c, base + 2 + c);
      else m.t(ci, base + 2 + c, base + 1 + c);
    }
  };
  if (o.capFront) capRing(0, false);
  if (o.capBack) capRing(R - 1, true);
  return m;
}

/** Catmull–Rom segment i→i+1 of a polyline with crease-aware end tangents. */
function splineSeg(pts: readonly P3[], i: number, t: number, crease: (i: number) => boolean): P3 {
  const N = pts.length;
  const p1 = pts[i], p2 = pts[Math.min(N - 1, i + 1)];
  const refl = (a: P3, b: P3): P3 => [2 * a[0] - b[0], 2 * a[1] - b[1], 2 * a[2] - b[2]];
  const p0 = i > 0 && !crease(i) ? pts[i - 1] : refl(p1, p2);
  const p3 = i + 2 < N && !crease(i + 1) ? pts[i + 2] : refl(p2, p1);
  // Uniform CR on short spans is fine (section points are hand placed and similar in spacing).
  const t2 = t * t, t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]), f(p0[2], p1[2], p2[2], p3[2])];
}

// ───────────────────────────── fields ─────────────────────────────

/** Signed field: ≥ 0 inside the region. Units are metres (signed distance). */
export type Field = (x: number, y: number, z: number) => number;

/** Signed distance to a closed polygon (positive inside). */
export function sdPolygon(poly: readonly P2[], px: number, py: number): number {
  let inside = false;
  let best = Infinity;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    const dx = xj - xi, dy = yj - yi;
    const l2 = dx * dx + dy * dy || 1e-12;
    let t = ((px - xi) * dx + (py - yi) * dy) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = xi + dx * t - px, ey = yi + dy * t - py;
    const d = ex * ex + ey * ey;
    if (d < best) best = d;
  }
  const d = Math.sqrt(best);
  return inside ? d : -d;
}

/** Smooth a control polygon into a dense outline for fields (closed). */
export function outline(ctrl: readonly P2[], n = 6, sharp: readonly number[] = []): P2[] {
  return smooth2(ctrl, n, true, sharp);
}

/**
 * Signed distance to a polygon with a bounding-box early-out: far outside the box
 * the (smaller) distance to the box is returned. Cutting only needs exact values
 * near the iso-line, and a lower bound keeps the sign, so min/max combinations of
 * regions still cut in exactly the same places — this makes panel cuts ~5× faster.
 */
function boxedPolygon(poly: readonly P2[]): (a: number, b: number) => number {
  let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
  for (const [a, b] of poly) {
    a0 = Math.min(a0, a);
    a1 = Math.max(a1, a);
    b0 = Math.min(b0, b);
    b1 = Math.max(b1, b);
  }
  const M = 0.04;
  return (a, b) => {
    const da = a < a0 ? a0 - a : a > a1 ? a - a1 : 0;
    const db = b < b0 ? b0 - b : b > b1 ? b - b1 : 0;
    if (da > M || db > M) return -Math.hypot(da, db);
    return sdPolygon(poly, a, b);
  };
}

/** Region drawn in side view, points [z, y]. */
export function sideRegion(poly: readonly P2[]): Field {
  const f = boxedPolygon(poly);
  return (_x, y, z) => f(z, y);
}

/** Region drawn in plan view, points [z, |x|] (mirror symmetric) or [z, x]. */
export function planRegion(poly: readonly P2[], symmetric = true): Field {
  const f = boxedPolygon(poly);
  return (x, _y, z) => f(z, symmetric ? Math.abs(x) : x);
}

/** Region drawn in front view, points [|x|, y]. */
export function frontRegion(poly: readonly P2[], symmetric = true): Field {
  const f = boxedPolygon(poly);
  return (x, y) => f(symmetric ? Math.abs(x) : x, y);
}

export const fAnd = (...f: Field[]): Field => (x, y, z) => {
  let v = Infinity;
  for (const g of f) v = Math.min(v, g(x, y, z));
  return v;
};
export const fOr = (...f: Field[]): Field => (x, y, z) => {
  let v = -Infinity;
  for (const g of f) v = Math.max(v, g(x, y, z));
  return v;
};
export const fNot = (f: Field): Field => (x, y, z) => -f(x, y, z);
export const fSub = (a: Field, b: Field): Field => (x, y, z) => Math.min(a(x, y, z), -b(x, y, z));
export const fGrow = (f: Field, d: number): Field => (x, y, z) => f(x, y, z) + d;
/** Half-space y ≥ y0 (or ≤ when below). */
export const fAbove = (y0: number): Field => (_x, y) => y - y0;
export const fBelow = (y0: number): Field => (_x, y) => y0 - y;
export const fBehind = (z0: number): Field => (_x, _y, z) => z - z0;
export const fAhead = (z0: number): Field => (_x, _y, z) => z0 - z;
export const fSideOf = (sign: 1 | -1): Field => (x) => x * sign;

// ───────────────────────────── cutting ─────────────────────────────

/**
 * Keep the part of the mesh where field ≥ 0, splitting triangles exactly on the
 * iso-line so cut edges are smooth curves rather than stair-steps.
 */
export function cut(mesh: MeshData, field: Field): MeshData {
  const p = mesh.pos;
  const V = mesh.vcount;
  const f = new Float64Array(V);
  for (let i = 0; i < V; i++) f[i] = field(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
  const out = new MeshData();
  const src = mesh.col;
  if (src) out.col = [];
  const map = new Int32Array(V).fill(-1);
  const keep = (i: number): number => {
    if (map[i] >= 0) return map[i];
    const k = out.v(
      p[i * 3], p[i * 3 + 1], p[i * 3 + 2],
      mesh.nrm[i * 3], mesh.nrm[i * 3 + 1], mesh.nrm[i * 3 + 2],
      mesh.uv[i * 2], mesh.uv[i * 2 + 1], mesh.shade[i],
    );
    if (src && out.col) out.col.splice(k * 3, 3, src[i * 3], src[i * 3 + 1], src[i * 3 + 2]);
    map[i] = k;
    return k;
  };
  const edgeCache = new Map<number, number>();
  const split = (a: number, b: number): number => {
    const key = a < b ? a * V + b : b * V + a;
    const hit = edgeCache.get(key);
    if (hit !== undefined) return hit;
    const t = f[a] / (f[a] - f[b]);
    const L = (arr: number[], s: number, k: number) => arr[a * s + k] + (arr[b * s + k] - arr[a * s + k]) * t;
    let nx = L(mesh.nrm, 3, 0), ny = L(mesh.nrm, 3, 1), nz = L(mesh.nrm, 3, 2);
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    const k = out.v(L(p, 3, 0), L(p, 3, 1), L(p, 3, 2), nx, ny, nz, L(mesh.uv, 2, 0), L(mesh.uv, 2, 1), L(mesh.shade, 1, 0));
    if (src && out.col) out.col.splice(k * 3, 3, L(src, 3, 0), L(src, 3, 1), L(src, 3, 2));
    edgeCache.set(key, k);
    return k;
  };
  const ix = mesh.idx;
  for (let t = 0; t < ix.length; t += 3) {
    const v = [ix[t], ix[t + 1], ix[t + 2]];
    const ins = v.map((i) => f[i] >= 0);
    const n = (ins[0] ? 1 : 0) + (ins[1] ? 1 : 0) + (ins[2] ? 1 : 0);
    if (n === 3) out.t(keep(v[0]), keep(v[1]), keep(v[2]));
    else if (n === 0) continue;
    else {
      // rotate so that the odd vertex is first
      let r = 0;
      if (n === 1) r = ins[0] ? 0 : ins[1] ? 1 : 2;
      else r = !ins[0] ? 0 : !ins[1] ? 1 : 2;
      const a = v[r], b = v[(r + 1) % 3], c = v[(r + 2) % 3];
      const ab = split(a, b), ac = split(a, c);
      if (n === 1) out.t(keep(a), ab, ac);
      else {
        out.t(ab, keep(b), keep(c));
        out.t(ab, keep(c), ac);
      }
    }
  }
  return out;
}

export interface FlangeOpts {
  /** How far the folded edge goes into the body (m). */
  depth: number;
  /** Shade at the outer lip and at the bottom of the fold. */
  lip?: number;
  bottom?: number;
  /** Small rounded roll-over before the fold (m). */
  roll?: number;
}

/**
 * Fold every open edge of a surface inwards (along −normal), giving panels a
 * visible thickness, rolled edges and dark panel gaps.
 */
export function flange(mesh: MeshData, o: FlangeOpts): MeshData {
  const ix = mesh.idx;
  const V = mesh.vcount;
  const edges = new Map<number, number>(); // key → directed edge a*V+b with count sign
  const count = new Map<number, number>();
  for (let t = 0; t < ix.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = ix[t + k], b = ix[t + ((k + 1) % 3)];
      const key = a < b ? a * V + b : b * V + a;
      count.set(key, (count.get(key) ?? 0) + 1);
      edges.set(key, a * V + b);
    }
  }
  const p = mesh.pos, n = mesh.nrm;
  const out = new MeshData();
  // Accumulate per-vertex outward edge directions for smooth flange normals.
  const accum = new Map<number, [number, number, number]>();
  const bnd: [number, number][] = [];
  for (const [key, c] of count) {
    if (c !== 1) continue;
    const d = edges.get(key)!;
    const a = Math.floor(d / V), b = d % V;
    bnd.push([a, b]);
    const ex = p[b * 3] - p[a * 3], ey = p[b * 3 + 1] - p[a * 3 + 1], ez = p[b * 3 + 2] - p[a * 3 + 2];
    for (const v of [a, b]) {
      const nx = n[v * 3], ny = n[v * 3 + 1], nz = n[v * 3 + 2];
      // outward (away from the panel) = e × n
      const ox = ey * nz - ez * ny, oy = ez * nx - ex * nz, oz = ex * ny - ey * nx;
      const acc = accum.get(v) ?? [0, 0, 0];
      acc[0] += ox;
      acc[1] += oy;
      acc[2] += oz;
      accum.set(v, acc);
    }
  }
  const lip = o.lip ?? 0.75;
  const bottom = o.bottom ?? 0.08;
  const roll = o.roll ?? 0;
  const vmap = new Map<number, [number, number, number]>(); // vertex → [top, mid, bottom] ids
  const vert = (v: number) => {
    const hit = vmap.get(v);
    if (hit) return hit;
    const acc = accum.get(v)!;
    const l = Math.hypot(acc[0], acc[1], acc[2]) || 1;
    const ox = acc[0] / l, oy = acc[1] / l, oz = acc[2] / l;
    const nx = n[v * 3], ny = n[v * 3 + 1], nz = n[v * 3 + 2];
    const x = p[v * 3], y = p[v * 3 + 1], z = p[v * 3 + 2];
    // Rolled lip: halfway normal between surface and outward direction.
    let hx = nx + ox, hy = ny + oy, hz = nz + oz;
    const hl = Math.hypot(hx, hy, hz) || 1;
    hx /= hl;
    hy /= hl;
    hz /= hl;
    const top = out.v(x, y, z, hx, hy, hz, 0, 0, lip);
    const mid = out.v(x - nx * (roll + o.depth * 0.25) + ox * roll * 0.3, y - ny * (roll + o.depth * 0.25) + oy * roll * 0.3, z - nz * (roll + o.depth * 0.25) + oz * roll * 0.3, ox, oy, oz, 0, 0.5, (lip + bottom) * 0.45);
    const bot = out.v(x - nx * o.depth, y - ny * o.depth, z - nz * o.depth, ox, oy, oz, 0, 1, bottom);
    const r: [number, number, number] = [top, mid, bot];
    vmap.set(v, r);
    return r;
  };
  for (const [a, b] of bnd) {
    const A = vert(a), B = vert(b);
    for (let k = 0; k < 2; k++) {
      // quad A[k], A[k+1], B[k+1], B[k] facing outward (e × n)
      out.t(A[k], A[k + 1], B[k + 1]);
      out.t(A[k], B[k + 1], B[k]);
    }
  }
  return out;
}

/** Push a surface along its normals (layered panels sitting proud of another). */
export function offsetSurface(mesh: MeshData, d: number): MeshData {
  const m = mesh.clone();
  for (let i = 0; i < m.pos.length; i++) m.pos[i] += m.nrm[i] * d;
  return m;
}

export interface PanelOpts {
  /** Panel gap (m) — the region is shrunk by gap/2 all round. */
  gap?: number;
  /** Folded-edge depth (m). */
  depth?: number;
  /** Offset proud of the base surface (m). */
  offset?: number;
  lip?: number;
  bottom?: number;
  roll?: number;
}

/** Cut a panel out of a base surface and give it folded edges. */
export function panel(surface: MeshData, region: Field, o: PanelOpts = {}): MeshData {
  const gap = o.gap ?? 0.003;
  let s = surface;
  if (o.offset) s = offsetSurface(surface, o.offset);
  const skin = cut(s, (x, y, z) => region(x, y, z) - gap / 2);
  if (skin.tcount === 0) return skin;
  const fl = flange(skin, { depth: o.depth ?? 0.012, lip: o.lip, bottom: o.bottom, roll: o.roll ?? 0.0015 });
  return skin.append(fl);
}

/** Distance-based shade: darken vertices near a field boundary (fake occlusion in creases/vents). */
export function shadeByField(mesh: MeshData, field: Field, radius: number, minShade: number): MeshData {
  const p = mesh.pos;
  for (let i = 0; i < mesh.vcount; i++) {
    const d = Math.abs(field(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]));
    if (d < radius) {
      const k = d / radius;
      mesh.shade[i] *= minShade + (1 - minShade) * k * k * (3 - 2 * k);
    }
  }
  return mesh;
}
