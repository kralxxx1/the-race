import * as THREE from 'three';
import { T, mul, type KitContext } from '../context';
import { catmull, extrude, flat, lathe, roundRect, sweep, type P2, type P3 } from '../mesh';
import { F, hard, type Finish, type GroupName } from '../sink';

export type LampKind = 'head' | 'drl' | 'tail' | 'indicator';

const EMIT: Record<LampKind, Finish> = { head: F.head, drl: F.drl, tail: F.tail, indicator: F.indicator };

/** Outward offset of a closed 2D outline (miter-limited). */
export function offsetOutline(pts: readonly P2[], d: number): P2[] {
  const n = pts.length;
  // signed area → orientation
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const sgn = area > 0 ? 1 : -1;
  const out: P2[] = [];
  for (let i = 0; i < n; i++) {
    const p = pts[(i - 1 + n) % n], c = pts[i], q = pts[(i + 1) % n];
    const e1 = [c[0] - p[0], c[1] - p[1]], e2 = [q[0] - c[0], q[1] - c[1]];
    const l1 = Math.hypot(e1[0], e1[1]) || 1, l2 = Math.hypot(e2[0], e2[1]) || 1;
    const n1 = [(e1[1] / l1) * sgn, (-e1[0] / l1) * sgn], n2 = [(e2[1] / l2) * sgn, (-e2[0] / l2) * sgn];
    let nx = n1[0] + n2[0], ny = n1[1] + n2[1];
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    const cos = Math.max(0.35, nx * n1[0] + ny * n1[1]);
    out.push([c[0] + (nx * d) / cos, c[1] + (ny * d) / cos]);
  }
  return out;
}

export interface LampOpts {
  kind: LampKind;
  /** Housing depth behind the lens (m). */
  depth?: number;
  /** Housing rim width around the lens (m). */
  rim?: number;
  housing?: Finish;
  /** Interior style: plain reflector, LED segments, or projector lenses. */
  inner?: 'reflector' | 'led' | 'projector' | 'none';
  /** Number of LED segments / projectors. */
  count?: number;
  /** Lens colour tint for tail/indicator lenses (clear for head). */
  lensSmoked?: boolean;
}

/**
 * Lamp unit from a 2D outline in local XY facing +Z: housing, chrome reflector
 * cavity, emitters (segments / projectors) and a clear lens on top.
 */
export function lamp(ctx: KitContext, group: GroupName, outline: readonly P2[], m: THREE.Matrix4, o: LampOpts): void {
  const depth = o.depth ?? 0.03;
  const rim = o.rim ?? 0.004;
  const housing = extrude(offsetOutline(outline, rim), depth, { bevel: Math.min(rim * 0.8, 0.003), plane: 'xy', center: -depth / 2, curveSegs: 1 });
  ctx.add(group, housing, o.housing ?? F.texturedBlack, m);
  const inner = o.inner ?? 'reflector';
  // Reflector cavity floor
  ctx.add(group, flat(outline, 'xy', 0.0012, 1), inner === 'none' ? EMIT[o.kind] : vary2(F.chrome, 0.12), m);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of outline) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const w = maxX - minX, h = maxY - minY;
  if (inner === 'led' || inner === 'reflector') {
    // Emitter: the outline shrunk towards its centre, sitting just above the reflector.
    const k = inner === 'led' ? 0.86 : 0.7;
    const em = outline.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k] as P2);
    if (inner === 'led' && (o.count ?? 0) > 1) {
      const n = o.count!;
      const horiz = w >= h;
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 0.72) / n;
        const seg = em.map(([x, y]) => (horiz ? [minX + (x - minX) * (t1 - t0) + w * t0 * 0.95, y] : [x, minY + (y - minY) * (t1 - t0) + h * t0 * 0.95]) as P2);
        ctx.add(group, flat(seg, 'xy', 0.003, 1), EMIT[o.kind], m);
      }
    } else ctx.add(group, flat(em, 'xy', 0.003, 1), EMIT[o.kind], m);
  } else if (inner === 'projector') {
    const n = Math.max(1, o.count ?? 1);
    const pr = Math.min(h * 0.38, (w / n) * 0.38);
    for (let i = 0; i < n; i++) {
      const x = minX + (w * (i + 0.5)) / n;
      const bowl = lathe([[0, -0.012], [pr * 1.25, -0.006], [pr * 1.35, 0.002]], { segs: ctx.seg(20, 8), axis: 'z' });
      ctx.add(group, bowl, F.chrome, mul(m, T(x, cy, 0)));
      const lens = lathe([[0, pr * 0.42], [pr * 0.6, pr * 0.32], [pr, 0.0]].map(([r, a]) => [r, a] as P2).reverse(), { segs: ctx.seg(20, 8), axis: 'z' });
      ctx.add(group, lens, EMIT[o.kind], mul(m, T(x, cy, 0.002)));
    }
  }
  // Clear (or smoked) lens
  ctx.add(group, flat(outline, 'xy', 0.006, 1), o.lensSmoked ? hard('#200404', 0, 0.05, 1) : F.lens, m);
}

function vary2(f: Finish, rough: number): Finish {
  return { ...f, rough };
}

/** LED light guide strip along a 3D path (DRL eyebrows, tail-light lines). */
export function ledStrip(ctx: KitContext, group: GroupName, path: readonly P3[], width: number, thick: number, kind: LampKind, up: P3 = [0, 1, 0]): void {
  const pts = catmull(path, ctx.seg(8, 3)).map((q) => [q[0], q[1], q[2]] as P3);
  const prof = roundRect(thick, width, Math.min(thick, width) * 0.45, 2);
  ctx.add(group, sweep(pts, prof, { up, capStart: true, capEnd: true }), EMIT[kind]);
  // Dark bezel behind the strip
  const bez = roundRect(thick * 0.7, width * 1.5, Math.min(thick, width) * 0.3, 2).map(([a, b]) => [a - thick * 0.5, b] as P2);
  ctx.add(group, sweep(pts, bez, { up, capStart: true, capEnd: true }), F.texturedBlack);
}

/** Classic round headlight: bucket, chrome ring, faceted reflector, lens, LED ring option. */
export function roundHeadlight(ctx: KitContext, group: GroupName, at: P3, r: number, facing: P3 = [0, 0, -1], opts: { led?: boolean; chrome?: boolean } = {}): void {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...facing).normalize());
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...at), q, new THREE.Vector3(1, 1, 1));
  const seg = ctx.seg(40, 14);
  const bucket = lathe([[0, -r * 0.95], [r * 0.6, -r * 0.9], [r * 0.95, -r * 0.55], [r * 1.03, -r * 0.1], [r * 1.04, 0]], { segs: seg, axis: 'z' });
  ctx.add(group, bucket, opts.chrome ? F.chrome : F.glossBlack, m);
  const ring = lathe([[r * 0.93, 0.002], [r * 1.07, 0.0], [r * 1.08, 0.012], [r * 1.0, 0.02], [r * 0.93, 0.016]], { segs: seg, axis: 'z' });
  ctx.add(group, ring, F.chrome, m);
  // Reflector with concentric facets
  const refl: P2[] = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    refl.push([t * r * 0.94, -r * 0.35 * (1 - t * t) + (i % 2) * 0.002]);
  }
  ctx.add(group, lathe(refl, { segs: seg, axis: 'z' }), F.chrome, m);
  if (opts.led) {
    ctx.add(group, lathe([[r * 0.7, 0.004], [r * 0.82, 0.004]], { segs: seg, axis: 'z' }), F.drl, m);
    ctx.add(group, lathe([[0, 0.01], [r * 0.32, 0.006], [r * 0.4, 0.0]], { segs: seg, axis: 'z' }), F.head, m);
  } else {
    ctx.add(group, lathe([[0, -0.01], [r * 0.12, -0.012], [r * 0.14, -0.03]], { segs: 16, axis: 'z' }), F.head, m);
  }
  const lens = lathe(([[0, r * 0.12], [r * 0.6, r * 0.09], [r * 0.95, 0.012]] as P2[]).reverse(), { segs: seg, axis: "z" });
  ctx.add(group, lens, F.lens, m);
}

/** Small round / rectangular indicator pod on a stalk. */
export function indicatorPod(ctx: KitContext, group: GroupName, base: P3, tip: P3, r = 0.011): void {
  const d = new THREE.Vector3(tip[0] - base[0], tip[1] - base[1], tip[2] - base[2]);
  const len = d.length();
  d.normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...base), q, new THREE.Vector3(1, 1, 1));
  ctx.add(group, lathe([[0, 0], [0.005, 0], [0.0045, len * 0.7], [0, len * 0.7]], { segs: 8, axis: 'y', sharp: [1] }), F.texturedBlack, m);
  ctx.add(group, lathe([[0, len * 0.65], [r * 0.9, len * 0.7], [r, len * 0.85], [r * 0.85, len], [0, len + 0.002]], { segs: ctx.seg(14, 8), axis: 'y' }), F.indicator, m);
}

export function emitFinish(kind: LampKind): Finish {
  return EMIT[kind];
}

