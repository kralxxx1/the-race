import { MeshData, catmull, type P2, type P3 } from '../mesh';
import { loft, type Station } from '../surface';

/**
 * Bodywork authoring from designer views.
 *
 * A body is described the way it is drawn: a side-view top line and bottom line
 * (z, y), a plan-view half-width line (z, w) and cross-section templates. A
 * template lists normalised points from the top centre (0, 1) down the right
 * side to the bottom edge (x/half, height fraction); templates are blended
 * along z. Every template point becomes a longitudinal character line.
 */

/** Smooth side/plan curve through control points, evaluated by z (clamped). */
export function curve(ctrl: readonly P2[], samples = 10): (z: number) => number {
  const sorted = [...ctrl].sort((a, b) => a[0] - b[0]);
  const dense = sorted.length > 2 ? catmull(sorted, samples) : sorted.map((p) => [...p]);
  // Keep monotonic z (catmull may wiggle slightly at uneven spacing).
  const pts: [number, number][] = [];
  for (const p of dense) if (!pts.length || p[0] > pts[pts.length - 1][0] + 1e-6) pts.push([p[0], p[1]]);
  return (z: number) => {
    if (z <= pts[0][0]) return pts[0][1];
    if (z >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
    let lo = 0, hi = pts.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (pts[mid][0] <= z) lo = mid;
      else hi = mid;
    }
    const t = (z - pts[lo][0]) / (pts[hi][0] - pts[lo][0]);
    return pts[lo][1] + (pts[hi][1] - pts[lo][1]) * t;
  };
}

export interface SectionKey {
  z: number;
  pts: readonly P2[];
}

export interface OutlineBody {
  /** Station z positions (front to back). */
  zs: readonly number[];
  top: (z: number) => number;
  bottom: (z: number) => number;
  half: (z: number) => number;
  /** Section templates keyed by z (same point count), linearly blended. */
  sections: readonly SectionKey[];
  /** Optional lateral offset of the whole body (z → x). */
  xOff?: (z: number) => number;
  /** Optional per-station tweak of the mapped points (e.g. knee recesses). */
  shape?: (z: number, pts: P2[]) => P2[];
}

export function sectionAt(ob: OutlineBody, z: number): P2[] {
  const ks = ob.sections;
  if (ks.length === 1 || z <= ks[0].z) return ks[0].pts.map((p) => [p[0], p[1]] as P2);
  if (z >= ks[ks.length - 1].z) return ks[ks.length - 1].pts.map((p) => [p[0], p[1]] as P2);
  let i = 0;
  while (i < ks.length - 2 && ks[i + 1].z < z) i++;
  const a = ks[i], b = ks[i + 1];
  const t = (z - a.z) / (b.z - a.z);
  const s = t * t * (3 - 2 * t);
  return a.pts.map((p, k) => [p[0] + (b.pts[k][0] - p[0]) * s, p[1] + (b.pts[k][1] - p[1]) * s] as P2);
}

/** Station points (bike-space x, y) at z. */
export function stationPts(ob: OutlineBody, z: number): P2[] {
  const t = ob.top(z), b = ob.bottom(z), w = ob.half(z);
  let pts = sectionAt(ob, z).map(([nx, ny]) => [nx * w, b + ny * (t - b)] as P2);
  if (ob.shape) pts = ob.shape(z, pts);
  return pts;
}

export function outlineStations(ob: OutlineBody): Station[] {
  return ob.zs.map((z) => ({ z, pts: stationPts(ob, z) }));
}

export interface BuildOpts {
  su: number;
  sv: number;
  creases?: readonly number[];
  mirror?: boolean;
  capFront?: boolean;
  capBack?: boolean;
}

export function outlineLoft(ob: OutlineBody, o: BuildOpts): MeshData {
  const m = loft(outlineStations(ob), { su: o.su, sv: o.sv, creases: o.creases, mirror: o.mirror ?? true, capFront: o.capFront, capBack: o.capBack });
  if (ob.xOff) {
    const f = ob.xOff;
    for (let i = 0; i < m.pos.length; i += 3) m.pos[i] += f(m.pos[i + 2]);
  }
  return m;
}

/** Evenly spaced z stations with denser ends (cosine spacing). */
export function stationsBetween(z0: number, z1: number, n: number, ease = 0.5): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const c = 0.5 - 0.5 * Math.cos(t * Math.PI);
    out.push(z0 + (z1 - z0) * (t * (1 - ease) + c * ease));
  }
  return out;
}

/**
 * Point on the outer surface at (z, x) — searches the section polyline from the
 * top for the first crossing of |x|. Returns [x, y, z] and an approximate normal.
 */
export function surfaceAt(ob: OutlineBody, z: number, x: number): { p: P3; n: P3 } {
  const pts = stationPts(ob, z);
  const ax = Math.abs(x);
  let y = pts[0][1];
  let nx = 0, ny = 1;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if ((a[0] - ax) * (b[0] - ax) <= 0 && Math.abs(b[0] - a[0]) > 1e-9) {
      const t = (ax - a[0]) / (b[0] - a[0]);
      y = a[1] + (b[1] - a[1]) * t;
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const l = Math.hypot(dx, dy) || 1;
      nx = -dy / l;
      ny = dx / l;
      if (ny < 0 && nx < 0) {
        nx = -nx;
        ny = -ny;
      }
      break;
    }
  }
  // Longitudinal slope for the z component of the normal.
  const dz = 0.01;
  const y2 = ((): number => {
    const q = stationPts(ob, z + dz);
    for (let i = 0; i < q.length - 1; i++) {
      const a = q[i], b = q[i + 1];
      if ((a[0] - ax) * (b[0] - ax) <= 0 && Math.abs(b[0] - a[0]) > 1e-9) return a[1] + (b[1] - a[1]) * ((ax - a[0]) / (b[0] - a[0]));
    }
    return y;
  })();
  const slope = (y2 - y) / dz;
  let nz = -slope * ny;
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l;
  ny /= l;
  nz /= l;
  return { p: [Math.sign(x || 1) * ax, y, z], n: [Math.sign(x || 1) * nx, ny, nz] };
}

/** Common section templates (top centre → bottom edge). */
export const SECTIONS = {
  /** Round-shouldered fairing / tank (7 points). */
  round: [[0, 1], [0.5, 0.975], [0.82, 0.88], [0.98, 0.65], [1, 0.38], [0.95, 0.12], [0.86, 0]] as P2[],
  /** Pointed nose section (7 points). */
  nose: [[0, 1], [0.35, 0.93], [0.7, 0.76], [0.92, 0.52], [1, 0.3], [0.96, 0.1], [0.88, 0]] as P2[],
  /** Flat-sided, crisp shoulder (7 points; crease at 2). */
  crisp: [[0, 1], [0.62, 0.985], [0.95, 0.9], [1, 0.62], [0.99, 0.35], [0.96, 0.12], [0.92, 0]] as P2[],
  /** Closed tail / undertray section ending on the bottom centre (7 points). */
  closed: [[0, 1], [0.6, 0.96], [0.95, 0.75], [1, 0.45], [0.9, 0.15], [0.5, 0.0], [0, 0]] as P2[],
  /** Seat cushion (6 points). */
  seat: [[0, 1], [0.55, 0.975], [0.9, 0.86], [1, 0.55], [0.96, 0.15], [0.9, 0]] as P2[],
};

export function scaleSection(pts: readonly P2[], sx = 1, sy = 1): P2[] {
  return pts.map(([x, y]) => [x * sx, y * sy] as P2);
}
