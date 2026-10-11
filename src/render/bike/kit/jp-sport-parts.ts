import * as THREE from 'three';
import { RX, T, mul, type KitContext } from '../context';
import { MeshData, circle, extrude, flat, lathe, smooth2, sweep, type P2, type P3 } from '../mesh';
import { F, type Finish, type GroupName } from '../sink';
import { sdPolygon, type Field } from '../surface';
import { lamp, type LampOpts } from './lights';
import { curve, outlineLoft, sideAt, stationPts, stationsBetween, type OutlineBody } from './shape';

/**
 * Bodywork helpers for the Japanese sport-bike blueprints (Fireblade, CBR650R,
 * R6, R3, GSX-R1000R, Hayabusa). Pure additions: nothing in the shared kit
 * depends on this module.
 */

/** Is (x, y) inside the closed cross-section of `ob` at station z (both halves)? */
function insideSection(ob: OutlineBody, z: number, x: number, y: number): boolean {
  const half = stationPts(ob, z);
  // Right half top → bottom, then the mirrored left half bottom → top: one closed polygon.
  const poly: P2[] = [...half, ...half.slice().reverse().map(([a, b]) => [-a, b] as P2)];
  return sdPolygon(poly, x, y) >= 0;
}

/**
 * Where a ray travelling rearwards (+z) at front-view point (x, y) first meets the body
 * surface, with the outward surface normal there. Used to sit lamps, ducts and badges
 * flush on a curved nose. Returns null when the ray misses the body.
 */
export function frontHit(ob: OutlineBody, x: number, y: number): { p: P3; n: P3 } | null {
  const zs = ob.zs;
  const z0 = zs[0], z1 = zs[zs.length - 1];
  const zAt = (xx: number, yy: number): number | null => {
    const steps = 160;
    let prev = z0;
    if (insideSection(ob, z0, xx, yy)) return z0;
    for (let i = 1; i <= steps; i++) {
      const z = z0 + ((z1 - z0) * i) / steps;
      if (insideSection(ob, z, xx, yy)) {
        let lo = prev, hi = z;
        for (let k = 0; k < 18; k++) {
          const mid = (lo + hi) / 2;
          if (insideSection(ob, mid, xx, yy)) hi = mid;
          else lo = mid;
        }
        return hi;
      }
      prev = z;
    }
    return null;
  };
  const z = zAt(x, y);
  if (z === null) return null;
  const d = 0.004;
  const zx = zAt(x + d, y), zxm = zAt(x - d, y), zy = zAt(x, y + d), zym = zAt(x, y - d);
  const gx = zx !== null && zxm !== null ? (zx - zxm) / (2 * d) : 0;
  const gy = zy !== null && zym !== null ? (zy - zym) / (2 * d) : 0;
  const n = new THREE.Vector3(gx, gy, -1).normalize();
  return { p: [x, y, z], n: [n.x, n.y, n.z] };
}

/**
 * Proper (det +1) frame on a surface: local +Z along the outward normal, local +Y as close
 * to `up` as possible. Local +X then points to the bike's LEFT for a forward-facing
 * surface, so outlines authored in bike-x must be mirrored (`localOutline`).
 */
export function surfaceFrame(p: P3, n: P3, up: P3 = [0, 1, 0]): THREE.Matrix4 {
  const z = new THREE.Vector3(...n).normalize();
  let u = new THREE.Vector3(...up);
  u.sub(z.clone().multiplyScalar(u.dot(z)));
  if (u.lengthSq() < 1e-8) u = new THREE.Vector3(0, 0, 1);
  u.normalize();
  const x = new THREE.Vector3().crossVectors(u, z).normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  const m = new THREE.Matrix4().makeBasis(x, y, z);
  m.setPosition(p[0], p[1], p[2]);
  return m;
}

/** Outline authored in bike-space x (front view, viewer-independent) → local frame of `surfaceFrame`. */
export function localOutline(pts: readonly P2[], facingForward = true): P2[] {
  return facingForward ? pts.map(([x, y]) => [-x, y] as P2) : pts.map((p) => [p[0], p[1]] as P2);
}

/** Field ≥ 0 inside the prism of a local outline (|local z| < depth) under frame `m`. */
export function prismField(outlineLocal: readonly P2[], m: THREE.Matrix4, depth: number): Field {
  const inv = m.clone().invert();
  const e = inv.elements;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [a, b] of outlineLocal) {
    x0 = Math.min(x0, a);
    x1 = Math.max(x1, a);
    y0 = Math.min(y0, b);
    y1 = Math.max(y1, b);
  }
  return (x, y, z) => {
    const lx = e[0] * x + e[4] * y + e[8] * z + e[12];
    const ly = e[1] * x + e[5] * y + e[9] * z + e[13];
    const lz = e[2] * x + e[6] * y + e[10] * z + e[14];
    const dz = depth - Math.abs(lz);
    const dx = lx < x0 ? x0 - lx : lx > x1 ? lx - x1 : 0;
    const dy = ly < y0 ? y0 - ly : ly > y1 ? ly - y1 : 0;
    if (dx > 0.03 || dy > 0.03) return -Math.hypot(dx, dy);
    return Math.min(sdPolygon(outlineLocal, lx, ly), dz);
  };
}

export interface FaceLamp {
  /** Lamp outline in front view, bike-space x/y (right-hand lamp; mirrored for the left). */
  outline: readonly P2[];
  /** Point used to find the surface (front view x, y), usually the outline centre. */
  at: P2;
  /** Recess of the lens below the skin (m). */
  inset?: number;
  opts: LampOpts;
  /** Extra tilt of the lamp face towards straight ahead (0 = on the surface, 1 = facing −z). */
  square?: number;
  /** One lamp on the centre line (outline spans both sides) instead of a mirrored pair. */
  single?: boolean;
}

/**
 * Place a pair of lamps flush in a nose surface: returns the hole field (for `cut`) and
 * a function adding the lamp units. Outlines are projected along z onto the surface.
 */
export function faceLamps(ob: OutlineBody, l: FaceLamp): { hole: Field; add: (ctx: KitContext, group: GroupName) => void } {
  const frames: { m: THREE.Matrix4; out: P2[] }[] = [];
  const holes: Field[] = [];
  for (const s of l.single ? [1] : [1, -1]) {
    const hit = frontHit(ob, s * l.at[0], l.at[1]);
    if (!hit) continue;
    const sq = l.square ?? 0.35;
    const n = new THREE.Vector3(...hit.n).lerp(new THREE.Vector3(0, 0, -1), sq).normalize();
    const inset = l.inset ?? 0.004;
    const p: P3 = [hit.p[0] + n.x * -inset, hit.p[1] + n.y * -inset, hit.p[2] + n.z * -inset];
    const m = surfaceFrame(p, [n.x, n.y, n.z]);
    // Outline relative to the lamp centre, in local coordinates (x mirrored for a forward-facing frame).
    const rel = l.outline.map(([x, y]) => [s * (x - l.at[0]), y - l.at[1]] as P2);
    const out = localOutline(rel);
    frames.push({ m, out });
    holes.push(prismField(out.map(([a, b]) => [a * 1.04, b * 1.08] as P2), m, 0.06));
  }
  const hole: Field = (x, y, z) => {
    let v = -Infinity;
    for (const h of holes) v = Math.max(v, h(x, y, z));
    return v;
  };
  return {
    hole,
    add: (ctx, group) => {
      for (const f of frames) lamp(ctx, group, f.out, f.m, l.opts);
    },
  };
}

/** Closed front-view loop from a right-half outline running top centre → bottom centre (x ≥ 0). */
export function mirrorLoop(half: readonly P2[]): P2[] {
  const left = half.slice(1, -1).reverse().map(([x, y]) => [-x, y] as P2);
  return [...half.map((p) => [p[0], p[1]] as P2), ...left];
}

/**
 * Dark duct lining behind a front opening: a tube that starts exactly on the body skin
 * (projected along z with `frontHit`) and runs back to `zBack`, shrinking by `shrink`,
 * closed by a back wall. Normals face inwards so the opening reads as a deep intake.
 */
export function ductLiner(ctx: KitContext, ob: OutlineBody, loop: readonly P2[], zBack: number, shrink = 0.85, f: Finish = F.texturedBlack, back: Finish = F.black): void {
  const n = loop.length;
  let cx = 0, cy = 0;
  for (const [x, y] of loop) {
    cx += x / n;
    cy += y / n;
  }
  const m = new MeshData();
  const rings = 4;
  const front = loop.map(([x, y]) => frontHit(ob, x, y)?.p[2] ?? zBack);
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    for (let i = 0; i < n; i++) {
      const [x, y] = loop[i];
      const k = 1 - (1 - shrink) * t;
      const z = front[i] + 0.002 + (zBack - front[i] - 0.002) * t;
      m.v(cx + (x - cx) * k, cy + (y - cy) * k, z, 0, 0, 0, i / n, t);
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let i = 0; i < n; i++) {
      const a = r * n + i, b = r * n + ((i + 1) % n), c = (r + 1) * n + i, d = (r + 1) * n + ((i + 1) % n);
      m.t(a, b, d);
      m.t(a, d, c);
    }
  }
  m.computeNormals();
  // Inward normals: the first vertex's normal must point towards the duct axis.
  const nx = m.nrm[0], ny = m.nrm[1];
  if (nx * (cx - m.pos[0]) + ny * (cy - m.pos[1]) < 0) m.flip();
  ctx.add('chassis', m, f);
  const k = shrink;
  ctx.add('chassis', flat(loop.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k] as P2), 'xy', zBack, -1), back);
}

/** A trim bead (chrome surround) following a side-view outline on the body skin, both sides. */
export function trimLoop(ctx: KitContext, ob: OutlineBody, poly: readonly P2[], r: number, f: Finish = F.chrome, smoothing = 2): void {
  const dense = smooth2(poly, smoothing, true);
  for (const s of [-1, 1]) {
    const path: P3[] = dense.map(([z, y]) => {
      const sp = sideAt(ob, z, y, s);
      return [sp.p[0] + sp.n[0] * r * 0.4, sp.p[1] + sp.n[1] * r * 0.4, z] as P3;
    });
    ctx.add('chassis', sweep(path, circle(r, 8), { up: [s, 0, 0], closedPath: true }), f);
  }
}

/** Domed fairing fasteners at side-view points on a body. */
export function fasteners(ctx: KitContext, ob: OutlineBody, pts: readonly P2[], f: Finish = F.texturedBlack): void {
  if (!ctx.micro) return;
  for (const s of [-1, 1]) {
    for (const [z, y] of pts) {
      const sp = sideAt(ob, z, y, s);
      const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), new THREE.Vector3(...sp.n).negate(), new THREE.Vector3(0, 1, 0));
      m.setPosition(sp.p[0] + sp.n[0] * 0.001, sp.p[1], sp.p[2]);
      ctx.add('chassis', lathe([[0, 0], [0.0055, 0], [0.005, 0.0025], [0, 0.003]], { segs: 10, axis: 'z' }), f, m);
    }
  }
}

/** Unpainted inner cowl seen through the screen (between the screen base and the tank). */
export function innerCowl(ctx: KitContext, o: { z0: number; z1: number; yTop0: number; yTop1: number; yBot0: number; yBot1: number; w0: number; w1: number }): void {
  const zm = (o.z0 + o.z1) / 2;
  ctx.add('chassis', outlineLoft(
    {
      zs: stationsBetween(o.z0, o.z1, 6, 0.3),
      top: curve([[o.z0, o.yTop0], [zm, (o.yTop0 + o.yTop1) / 2 + 0.01], [o.z1, o.yTop1]]),
      bottom: curve([[o.z0, o.yBot0], [o.z1, o.yBot1]]),
      half: curve([[o.z0, o.w0], [zm, (o.w0 + o.w1) / 2 + 0.01], [o.z1, o.w1]]),
      sections: [{ z: 0, pts: [[0, 1], [0.5, 0.98], [0.86, 0.88], [0.98, 0.65], [1, 0.4], [0.97, 0.15], [0.9, 0]] }],
    },
    { su: ctx.seg(6, 2), sv: ctx.seg(4, 2) },
  ), F.texturedBlack);
}

/** Black undertray under a tail unit. */
export function undertray(ctx: KitContext, o: { z0: number; z1: number; top0: number; top1: number; bot0: number; botMid: number; bot1: number; w0: number; w1: number }, f: Finish = F.texturedBlack): void {
  const ob: OutlineBody = {
    zs: stationsBetween(o.z0, o.z1, 7, 0.4),
    top: curve([[o.z0, o.top0], [o.z1, o.top1]]),
    bottom: curve([[o.z0, o.bot0], [(o.z0 + o.z1) * 0.5, o.botMid], [o.z1, o.bot1]]),
    half: curve([[o.z0, o.w0], [o.z1, o.w1]]),
    sections: [{ z: 0, pts: [[0, 1], [0.6, 0.95], [0.95, 0.7], [1, 0.45], [0.9, 0.2], [0.5, 0.02], [0, 0]] }],
  };
  ctx.add('chassis', outlineLoft(ob, { su: ctx.seg(5, 2), sv: ctx.seg(3, 2) }), f);
}

/** Dark backing wall behind a side opening (side-view outline), set in from the skin. */
export function ductWall(ctx: KitContext, ob: OutlineBody, poly: readonly P2[], zRef: number, yRef: number, inset: number, f: Finish = F.texturedBlack): void {
  for (const s of [-1, 1]) {
    const p = sideAt(ob, zRef, yRef, s);
    ctx.add('chassis', extrude(smooth2(poly, 2, true), 0.006, { plane: 'zy', center: p.p[0] - s * inset }), f);
  }
}

/**
 * Aerodynamic slats spanning a side duct (winglet blades / louvres): side-view blade
 * outlines extruded across `span`, their outer face `inset` metres under the body skin.
 */
export function bladeSlats(ctx: KitContext, ob: OutlineBody, blades: readonly (readonly P2[])[], inset: number, span: number, f: Finish = F.carbon): void {
  for (const b of blades) {
    let zc = 0, yc = 0;
    for (const [z, y] of b) {
      zc += z / b.length;
      yc += y / b.length;
    }
    for (const s of [-1, 1]) {
      const x = Math.abs(sideAt(ob, zc, yc, s).p[0]) - inset - span / 2;
      ctx.add('chassis', extrude(smooth2(b, 2, true), span, { plane: 'zy', center: s * x, bevel: 0.0015 }), f);
    }
  }
}

/** Short tank-pad / knee-grip rubber pads on the tank flanks (side-view outline). */
export function kneePads(ctx: KitContext, tank: OutlineBody, poly: readonly P2[], zRef: number, yRef: number): void {
  for (const s of [-1, 1]) {
    const p = sideAt(tank, zRef, yRef, s);
    ctx.add('chassis', extrude(smooth2(poly, 3, true), 0.006, { plane: 'zy', center: p.p[0] + s * 0.001, bevel: 0.002 }), F.rubber);
  }
}

/** Tail lamp under a tail tip: outline in the lamp plane, tilted `tilt` radians from vertical. */
export function tailLamp(ctx: KitContext, outline: readonly P2[], at: P3, tilt: number, opts: Partial<LampOpts> = {}): void {
  lamp(ctx, 'chassis', outline, mul(T(...at), RX(tilt)), { kind: 'tail', inner: 'led', count: 1, depth: 0.03, rim: 0.003, lensSmoked: true, ...opts });
}
