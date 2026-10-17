import * as THREE from 'three';
import type { KitContext } from '../context';
import { MeshData, alongY, catmull, circle, lathe, rod, sweep, type P2, type P3 } from '../mesh';
import { F, hard, Micro, vary, type Finish, type GroupName } from '../sink';
import { cut } from '../surface';

/**
 * Exhaust building blocks for the cruiser family: swept header pipes (with optional heat-tint gradient),
 * silencers (straight, megaphone, tapered, fishtail), slash-cut / flat ends with a dark bore, heat
 * shields and clamps. Pure additions: the generic kit exhaust (kit/exhaust.ts) is untouched.
 */

const V = (p: P3) => new THREE.Vector3(p[0], p[1], p[2]);

/** Dense Catmull–Rom path through control points. */
export function densePath(ctx: KitContext, ctrl: readonly P3[], per = 8): P3[] {
  if (ctrl.length < 3) return ctrl.slice();
  return catmull(ctrl, ctx.seg(per, 3)).map((q) => [q[0], q[1], q[2]] as P3);
}

export interface PipeOpts {
  group?: GroupName;
  /** Radius at the end of the path (default: same as start). */
  rEnd?: number;
  /** Samples per control span. */
  per?: number;
  caps?: boolean;
  /** Tint multiplier along the pipe (t = 0 at the start, 1 at the end). */
  tint?: (t: number) => readonly [number, number, number];
  radial?: number;
}

/** Round tube swept through control points. Returns the dense path (for shields / clamps). */
export function pipe(ctx: KitContext, ctrl: readonly P3[], r: number, f: Finish, o: PipeOpts = {}): P3[] {
  const path = densePath(ctx, ctrl, o.per ?? 8);
  const n = path.length;
  const scale = o.rEnd !== undefined ? path.map((_, i) => 1 + (o.rEnd! / r - 1) * (i / (n - 1))) : undefined;
  const m = sweep(path, circle(r, o.radial ?? ctx.seg(18, 8)), { scale, capStart: o.caps ?? true, capEnd: o.caps ?? true });
  if (o.tint) {
    let total = 0;
    const cum: number[] = [0];
    for (let i = 1; i < n; i++) {
      total += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1], path[i][2] - path[i - 1][2]);
      cum.push(total);
    }
    const C = m.vcount / n;
    m.tintBy((_x, _y, _z, i) => o.tint!(cum[Math.min(n - 1, Math.floor(i / Math.max(1, C)))] / Math.max(1e-6, total)));
  }
  ctx.add(o.group ?? 'chassis', m, f);
  return path;
}

/** Clamp ring around a pipe at path index i. */
export function clampRing(ctx: KitContext, path: readonly P3[], i: number, r: number, f: Finish = F.steel, group: GroupName = 'chassis'): void {
  const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
  const m = new THREE.Matrix4().compose(V(path[i]), q, new THREE.Vector3(1, 1, 1));
  ctx.add(group, lathe([[r * 1.0, -0.008], [r * 1.12, -0.007], [r * 1.12, 0.007], [r * 1.0, 0.008]], { segs: ctx.seg(22, 8), axis: 'y', sharp: true }), f, m);
}

/** Open arc shield (thin shell) around a pipe between path indices i0..i1. Spans `span` radians centred on `centre`. */
export function heatShield(ctx: KitContext, path: readonly P3[], i0: number, i1: number, r: number, f: Finish, o: { span?: number; centre?: number; gap?: number; group?: GroupName; slots?: number } = {}): void {
  const sub = path.slice(Math.max(0, i0), Math.min(path.length, i1 + 1));
  if (sub.length < 2) return;
  const span = o.span ?? Math.PI * 1.5;
  const c = o.centre ?? 0;
  const R1 = r + (o.gap ?? 0.006) + 0.0025, R0 = r + (o.gap ?? 0.006);
  const n = ctx.seg(18, 8);
  const prof: P2[] = [];
  for (let k = 0; k <= n; k++) {
    const a = c - span / 2 + (span * k) / n;
    prof.push([Math.cos(a) * R1, Math.sin(a) * R1]);
  }
  for (let k = n; k >= 0; k--) {
    const a = c - span / 2 + (span * k) / n;
    prof.push([Math.cos(a) * R0, Math.sin(a) * R0]);
  }
  ctx.add(o.group ?? 'chassis', sweep(sub, prof, { capStart: true, capEnd: true }), f);
  // Ventilation slots: short dark ribs across the shield.
  if (o.slots && ctx.micro) {
    const dark = hard('#0b0b0c', 0, 0.8);
    const total = sub.length;
    for (let s = 1; s <= o.slots; s++) {
      const idx = Math.round((s / (o.slots + 1)) * (total - 1));
      const p = sub[idx], q = sub[Math.min(total - 1, idx + 1)];
      const d = new THREE.Vector3(q[0] - p[0], q[1] - p[1], q[2] - p[2]).normalize();
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
      // Choose the outward direction at the shield centre angle (perpendicular to the pipe).
      const m = new THREE.Matrix4().compose(V(p), quat, new THREE.Vector3(1, 1, 1));
      const slot = lathe([[R1 + 0.0004, -0.0035], [R1 + 0.0004, 0.0035]], { segs: ctx.seg(18, 6), axis: 'y', start: c - span * 0.32, span: span * 0.64 });
      ctx.add(o.group ?? 'chassis', slot, dark, m);
    }
  }
}

export type CanKind = 'straight' | 'megaphone' | 'bell' | 'fishtail' | 'tapered' | 'torpedo';

export interface CanOpts {
  r: number;
  /** End radius (megaphone / tapered). */
  rEnd?: number;
  kind?: CanKind;
  f: Finish;
  /** End cap / rim finish (default: same). */
  capF?: Finish;
  /** Slash-cut end angle (radians from perpendicular, outer side longer); 0 = flat end. */
  slash?: number;
  /** Direction (in the plane perpendicular to the axis) the slash faces: +1 = towards +X side, −1 = −X, 0 default "up". */
  slashDir?: 'up' | 'down' | 'out' | 'in';
  group?: GroupName;
  /** Decorative bands (count) along the can. */
  bands?: number;
  bandF?: Finish;
  /** Flatten the section (fishtail): [width scale, height scale] at the end. */
  flat?: [number, number];
  /** Bore finish. */
  bore?: Finish;
}

/** Radius profile along the can (t 0..1 → radius). `r` = inlet radius, `rEnd` = mouth radius. */
function radiusAt(kind: CanKind, t: number, r: number, rEnd: number): number {
  switch (kind) {
    case 'megaphone': {
      const k = Math.max(0, (t - 0.18) / 0.82);
      return r + (rEnd - r) * Math.pow(k, 1.55);
    }
    case 'bell': {
      const k = Math.max(0, (t - 0.72) / 0.28);
      return r + (rEnd - r) * k * k;
    }
    case 'tapered':
      return r + (rEnd - r) * t;
    case 'torpedo':
      // Cigar: swells quickly from the inlet, long parallel middle, slightly closed tail.
      return r * (0.7 + 0.3 * Math.sin(Math.min(1, t * 5) * Math.PI * 0.5)) * (1 - 0.06 * Math.max(0, t - 0.85) / 0.15) + (rEnd - r) * t * 0.0;
    default:
      return r;
  }
}

/**
 * A silencer from a (inlet) to b (outlet). Built along local +Y and oriented onto a→b. The end can be flat,
 * slash-cut (hollow with a dark bore) or flattened into a fishtail.
 */
export function can(ctx: KitContext, a: P3, b: P3, o: CanOpts): void {
  const A = V(a), B = V(b);
  const len = A.distanceTo(B);
  const kind = o.kind ?? 'straight';
  const r = o.r;
  const rEnd = o.rEnd ?? r;
  const group = o.group ?? 'chassis';
  const rings = ctx.seg(30, 12);
  const seg = ctx.seg(40, 14);
  // Outer wall profile [radius, axial]
  const wall: P2[] = [[r * 0.5, 0]];
  const inlet = Math.min(0.03, len * 0.12);
  wall.push([r * 0.88, 0], [r * 0.96, 0.004]);
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const ax = inlet + (len - inlet) * t;
    let rr = radiusAt(kind, t, r, rEnd);
    // Roll the inlet shoulder.
    if (t < 0.04) rr = rr * (0.94 + 0.06 * (t / 0.04));
    wall.push([rr, ax]);
  }
  const endR = wall[wall.length - 1][0];
  const endCap = (o.capF ?? o.f);
  const slashing = (o.slash ?? 0) > 0.01;
  const isFish = kind === 'fishtail';
  let m: MeshData;
  if (isFish) {
    // Round inlet blending into a flat, wide, slightly flared mouth.
    const path: P3[] = [];
    const scale: P2[] = [];
    const n = ctx.seg(26, 10);
    const [fw, fh] = o.flat ?? [2.6, 0.42];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      path.push([0, inlet + (len - inlet) * t, 0]);
      const k = Math.max(0, (t - 0.38) / 0.62);
      const e = k * k * (3 - 2 * k);
      const base = t < 0.06 ? 0.9 + 0.1 * (t / 0.06) : 1;
      // sweep scale = [profile x (local Z → world height), profile y (local X → world width)]
      scale.push([base * (1 + (fh - 1) * e), base * (1 + (fw - 1) * e)]);
    }
    m = sweep(path, circle(r, ctx.seg(36, 14)), { scale, up: [0, 0, 1], capStart: false, capEnd: false });
    // Closing inlet disc.
    ctx.add(group, lathe([[0, 0], [r * 0.9, 0], [r * 0.9, inlet]], { segs: seg, axis: 'y' }), o.f, alongY(a, b));
  } else {
    m = lathe(wall, { segs: seg, axis: 'y' });
    ctx.add(group, lathe([[0, 0], [r * 0.9, 0]], { segs: seg, axis: 'y' }), o.f, alongY(a, b));
  }
  if (slashing) {
    const th = o.slash!;
    const dir = o.slashDir ?? 'up';
    const nrm = dir === 'up' ? new THREE.Vector3(0, Math.cos(th), Math.sin(th)) : dir === 'down' ? new THREE.Vector3(0, Math.cos(th), -Math.sin(th)) : dir === 'out' ? new THREE.Vector3(Math.sin(th), Math.cos(th), 0) : new THREE.Vector3(-Math.sin(th), Math.cos(th), 0);
    const c0 = new THREE.Vector3(0, len - endR * Math.tan(th) * 0.9, 0);
    m = cut(m, (x, y, z) => -(nrm.x * x + nrm.y * (y - c0.y) + nrm.z * z));
    // Bore + rim on the slash plane (local space).
    const pts: P3[] = [];
    const rim: P3[] = [];
    const nn = ctx.seg(36, 14);
    const fy = (x: number, z: number) => c0.y - (nrm.x * x + nrm.z * z) / nrm.y;
    for (let i = 0; i < nn; i++) {
      const aa = (i / nn) * Math.PI * 2;
      const x = Math.cos(aa) * endR * 0.9, z = Math.sin(aa) * endR * 0.9;
      pts.push([x, fy(x, z) - 0.012, z]);
      const x2 = Math.cos(aa) * endR, z2 = Math.sin(aa) * endR;
      rim.push([x2, fy(x2, z2), z2]);
    }
    const bore = new MeshData();
    const ci = bore.v(0, c0.y - 0.04, 0, nrm.x, nrm.y, nrm.z);
    const base = bore.vcount;
    for (const p of pts) bore.v(p[0], p[1], p[2], nrm.x, nrm.y, nrm.z);
    for (let i = 0; i < nn; i++) bore.t(ci, base + ((i + 1) % nn), base + i);
    ctx.add(group, bore.orient(), o.bore ?? hard('#0a0908', 0, 0.9), alongY(a, b));
    // Rim ring (thin torus following the cut ellipse)
    const ring = new MeshData();
    for (let i = 0; i < nn; i++) {
      const p = rim[i], q = rim[(i + 1) % nn];
      const x0 = p[0], z0 = p[2], x1 = q[0], z1 = q[2];
      const inner = (x: number, z: number): P3 => [x * 0.9, fy(x * 0.9, z * 0.9) - 0.006, z * 0.9];
      const ip = inner(x0, z0), iq = inner(x1, z1);
      const n0 = ring.v(p[0], p[1], p[2], nrm.x, nrm.y, nrm.z);
      const n1 = ring.v(q[0], q[1], q[2], nrm.x, nrm.y, nrm.z);
      const n2 = ring.v(iq[0], iq[1], iq[2], nrm.x, nrm.y, nrm.z);
      const n3 = ring.v(ip[0], ip[1], ip[2], nrm.x, nrm.y, nrm.z);
      ring.quad(n0, n1, n2, n3);
    }
    ctx.add(group, ring.orient(), endCap, alongY(a, b));
  } else if (!isFish) {
    // Flat end: rolled lip + dark bore.
    ctx.add(group, lathe([[endR, len], [endR * 0.9, len + 0.003], [endR * 0.74, len]], { segs: seg, axis: 'y' }), endCap, alongY(a, b));
    ctx.add(group, lathe([[endR * 0.74, len - 0.001], [endR * 0.74, len - 0.05], [0, len - 0.05]], { segs: seg, axis: 'y' }), o.bore ?? hard('#0a0908', 0, 0.9), alongY(a, b));
  } else {
    // Fishtail mouth: dark slot recessed in the flattened end.
    const [fw, fh] = o.flat ?? [2.6, 0.42];
    const mouth = new MeshData();
    const nn = ctx.seg(36, 14);
    const ci = mouth.v(0, len - 0.012, 0, 0, 1, 0);
    for (let i = 0; i < nn; i++) {
      const aa = (i / nn) * Math.PI * 2;
      mouth.v(Math.cos(aa) * r * fw * 0.9, len - 0.012, Math.sin(aa) * r * fh * 0.9, 0, 1, 0);
    }
    for (let i = 0; i < nn; i++) mouth.t(ci, 1 + ((i + 1) % nn), 1 + i);
    ctx.add(group, mouth.orient(), o.bore ?? hard('#0a0908', 0, 0.9), alongY(a, b));
    const lip = new MeshData();
    const rimPath: P3[] = [];
    for (let i = 0; i <= nn; i++) {
      const aa = (i / nn) * Math.PI * 2;
      rimPath.push([Math.cos(aa) * r * fw, len, Math.sin(aa) * r * fh]);
    }
    lip.append(sweep(rimPath, circle(0.0028, 6), { closedPath: false }));
    ctx.add(group, lip, endCap, alongY(a, b));
  }
  ctx.add(group, m, o.f, alongY(a, b));
  // Decorative bands (welded rings / clamps).
  const bands = o.bands ?? 0;
  for (let i = 0; i < bands; i++) {
    const t = (i + 1) / (bands + 1);
    const rr = radiusAt(kind, t, r, rEnd) * (isFish ? 1 : 1);
    ctx.add(group, lathe([[rr * 1.0, -0.006], [rr * 1.045, -0.004], [rr * 1.045, 0.004], [rr * 1.0, 0.006]], { segs: seg, axis: 'y', sharp: true }), o.bandF ?? vary(F.steel, { rough: 0.3 }), alongY([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], b));
  }
}

/** Header flange + stud nuts at an exhaust port (micro detail). */
export function portFlange(ctx: KitContext, at: P3, dir: P3, r: number, f: Finish = F.chrome): void {
  const d = new THREE.Vector3(...dir).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
  const m = new THREE.Matrix4().compose(V(at), q, new THREE.Vector3(1, 1, 1));
  ctx.add('chassis', lathe([[r * 1.0, 0], [r * 1.9, 0], [r * 1.9, 0.01], [r * 1.0, 0.01]], { segs: ctx.seg(24, 10), axis: 'y', sharp: true }), f, m);
  if (ctx.micro) {
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? -1 : 1;
      ctx.add('chassis', lathe([[0, 0], [0.0045, 0], [0.0045, 0.008], [0, 0.008]], { segs: 6, axis: 'y', sharp: true }), F.steel, new THREE.Matrix4().multiplyMatrices(m, new THREE.Matrix4().makeTranslation(s * r * 1.45, 0.01, 0)));
    }
  }
}

/** Straight chrome link tube between two points (balance pipe, crossover). */
export function link(ctx: KitContext, a: P3, b: P3, r: number, f: Finish = F.chrome, group: GroupName = 'chassis'): void {
  ctx.add(group, rod(a, b, r, r, ctx.seg(14, 6)), f);
}

export const chromeShield = vary(F.chrome, { rough: 0.1 });
export const blackPipe = hard('#101113', 0.45, 0.4, 0.6, Micro.plain);
