import * as THREE from 'three';
import { hash01, noise2, smoothstep } from '../../core/math';
import { mul, rgb, type GeoBuilder, type RGB } from './kit';
import type { ChunkBuild } from './scenery';
import { CHUNK_LENGTH } from './scenery';

/**
 * Road tunnels: a deterministic plan (where tunnels are), the mountain they pass through (terrain height
 * and the cut faces at the approaches), the lined bore with lights, jet fans, niches and exit doors, and the
 * portal headwalls. The scenery reports `enclosure(s)` from the plan; the game view turns that into the
 * lighting change, eye adaptation and the audio reverb zone.
 *
 * Geometry is authored in chunk-local space from road-space samples every 4 m (the bore follows the road's
 * curvature), with explicit winding checks so every lining face points at the tunnel axis.
 */

export const TUNNEL_FIRST = 1252;
export const TUNNEL_PERIOD = 3100;
/** Interior height at the crown above the road. */
export const BORE_HEIGHT = 8.6;
const RISE = 130;
const STEP = 4;
/** Distance over which the mountain flank fades out to the ordinary terrain. */
export const FLANK = 100;

export interface TunnelSpan {
  a: number;
  b: number;
}

/** Tunnel k (≥ 0): start and end road distance, both multiples of 4 m so slices line up with chunk borders. */
export function tunnelSpan(seed: number, k: number): TunnelSpan {
  const jitter = Math.floor(hash01(k * 977 + seed * 31) * 90) * 4;
  const len = 360 + Math.floor(hash01(k * 331 + seed * 17 + 5) * 110) * 4;
  const a = TUNNEL_FIRST + k * TUNNEL_PERIOD + jitter;
  return { a, b: a + len };
}

/** The tunnel (if any) whose mountain or bore is within `margin` metres of s. */
export function tunnelNear(seed: number, s: number, margin: number): TunnelSpan | null {
  const k0 = Math.floor((s - TUNNEL_FIRST) / TUNNEL_PERIOD);
  for (const k of [k0 - 1, k0, k0 + 1]) {
    if (k < 0) continue;
    const sp = tunnelSpan(seed, k);
    if (s >= sp.a - margin && s <= sp.b + margin) return sp;
  }
  return null;
}

/** 0..1 how far inside a tunnel the rider is (smooth over the portal). */
export function tunnelEnclosure(seed: number, s: number): number {
  const sp = tunnelNear(seed, s, 20);
  if (!sp) return 0;
  return smoothstep(sp.a - 3, sp.a + 12, s) * (1 - smoothstep(sp.b - 12, sp.b + 3, s));
}

/** Mountain mask: rises over RISE metres before the entry portal and falls after the exit. */
export function mountainMask(seed: number, s: number): number {
  const sp = tunnelNear(seed, s, RISE + 40);
  if (!sp) return 0;
  return smoothstep(sp.a - RISE, sp.a, s) * (1 - smoothstep(sp.b, sp.b + RISE, s));
}

/** Crest of the mountain above the road surface at s (metres), without the mask. */
export function crestHeight(seed: number, s: number): number {
  return BORE_HEIGHT + 6 + 2.2 * noise2(s * 0.011, seed * 0.37, 41);
}

/** Terrain height above the road for the mountain at lateral offset `off` beyond the paved edge (metres). */
export function mountainRise(seed: number, s: number, off: number): number {
  return (crestHeight(seed, s) + 0.05) * mountainMask(seed, s) * (1 - smoothstep(0, FLANK, off));
}

/** Profile of the bore half-section (x from the centre line, y above the road), crown last. */
function boreProfile(W: number): [number, number][] {
  return [
    [W, 0],
    [W, 3.3],
    [W * 0.9, 5.5],
    [W * 0.66, 7.3],
    [W * 0.33, 8.3],
    [0, BORE_HEIGHT],
  ];
}

const TILE: RGB = rgb('#ece9df');
const CEIL: RGB = rgb('#c9c6be');
const CONC_COL: RGB = rgb('#c8c5bc');
const ROCK_COL: RGB = [0.62, 0.74, 0.86];

/**
 * Build the bore, fixtures, cap and portals of one tunnel into the chunk (only the part inside it).
 * Static material keys used: tunnelTile, tunnelConc, lit, steel, conc, rock.
 */
export function buildTunnel(ctx: ChunkBuild, sp: TunnelSpan, night: boolean, pool: (s: number) => void): void {
  const s0 = ctx.s0;
  const s1 = s0 + CHUNK_LENGTH;
  const half = ctx.host.half;
  const seed = ctx.host.seed;
  const W = half + 0.9;
  const prof = boreProfile(W);
  const tile = ctx.stat('tunnelTile');
  const conc = ctx.stat('tunnelConc');
  const lit = ctx.stat('lit');
  const steel = ctx.stat('steel');
  const rock = ctx.stat('rock');
  const cc = ctx.stat('conc');
  const kt = ctx.host.worldMats.uv('tile_white');
  const kc = ctx.host.worldMats.uv('concrete');
  const kr = ctx.host.worldMats.uv('cliff');
  const sa = Math.max(sp.a, s0);
  const sb = Math.min(sp.b, s1);

  if (sb > sa) {
    const n = Math.round((sb - sa) / STEP);
    const ss: number[] = [];
    const left: THREE.Vector3[][] = [];
    const right: THREE.Vector3[][] = [];
    for (let i = 0; i <= n; i++) {
      const s = sa + (i / n) * (sb - sa);
      ss.push(s);
      left.push(prof.map(([x, y]) => ctx.local(s, -x, y, new THREE.Vector3())));
      right.push(prof.map(([x, y]) => ctx.local(s, x, y, new THREE.Vector3())));
    }
    const mid = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      ctx.local((ss[i] + ss[i + 1]) / 2, 0, 3.5, mid);
      for (let j = 0; j < prof.length - 1; j++) {
        const lower = j === 0;
        const b = lower ? tile : conc;
        const k = lower ? kt : kc;
        const col = lower ? TILE : CEIL;
        const len = Math.hypot(prof[j + 1][0] - prof[j][0], prof[j + 1][1] - prof[j][1]);
        const u0 = lower ? 0 : (prof[j][1] - 3.3) * k;
        const v0 = ss[i] * k;
        const v1 = ss[i + 1] * k;
        const u1 = u0 + len * k;
        for (const side of [left, right]) {
          const a = side[i][j];
          const bb = side[i + 1][j];
          const c = side[i + 1][j + 1];
          const d = side[i][j + 1];
          // Flat normal of (a, bb, c, d) = (bb − a) × (d − a); flip the winding when it points away from the axis.
          const ux = bb.x - a.x, uy = bb.y - a.y, uz = bb.z - a.z;
          const vx = d.x - a.x, vy = d.y - a.y, vz = d.z - a.z;
          const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
          const toAxis = (mid.x - a.x) * nx + (mid.y - a.y) * ny + (mid.z - a.z) * nz;
          if (toAxis > 0) b.quad([a.x, a.y, a.z], [bb.x, bb.y, bb.z], [c.x, c.y, c.z], [d.x, d.y, d.z], { color: col }, [u0, v0, u0, v1, u1, v1, u1, v0]);
          else b.quad([a.x, a.y, a.z], [d.x, d.y, d.z], [c.x, c.y, c.z], [bb.x, bb.y, bb.z], { color: col }, [u0, v0, u1, v0, u1, v1, u0, v1]);
        }
      }
    }
    // Walkway kerbs (0.3 m, dark concrete) along both walls, and the mountain cap over the roof.
    const a = new THREE.Vector3();
    const b2 = new THREE.Vector3();
    const c2 = new THREE.Vector3();
    const d2 = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      for (const sx of [-1, 1]) {
        ctx.local(ss[i], sx * (half + 0.02), 0.3, a);
        ctx.local(ss[i + 1], sx * (half + 0.02), 0.3, b2);
        ctx.local(ss[i + 1], sx * W, 0.3, c2);
        ctx.local(ss[i], sx * W, 0.3, d2);
        // Top: up-facing; the front face (towards the road) is a thin vertical quad.
        if (sx > 0) cc.quad([a.x, a.y, a.z], [d2.x, d2.y, d2.z], [c2.x, c2.y, c2.z], [b2.x, b2.y, b2.z], { color: [0.45, 0.45, 0.45] });
        else cc.quad([a.x, a.y, a.z], [b2.x, b2.y, b2.z], [c2.x, c2.y, c2.z], [d2.x, d2.y, d2.z], { color: [0.45, 0.45, 0.45] });
      }
      // Cap: the mountain's top surface across the gap between the two terrain halves.
      const sA = ss[i];
      const sB = ss[i + 1];
      const yA = ctx.host.road.height(sA) - 0.05 + mountainRise(seed, sA, 0);
      const yB = ctx.host.road.height(sB) - 0.05 + mountainRise(seed, sB, 0);
      ctx.local(sA, -half - 0.9, 0, a);
      ctx.local(sB, -half - 0.9, 0, b2);
      ctx.local(sB, half + 0.9, 0, c2);
      ctx.local(sA, half + 0.9, 0, d2);
      a.y = ctx.localY(yA);
      d2.y = ctx.localY(yA);
      b2.y = ctx.localY(yB);
      c2.y = ctx.localY(yB);
      const wd = (half + 0.9) * 2 * kr;
      rock.quad([a.x, a.y, a.z], [d2.x, d2.y, d2.z], [c2.x, c2.y, c2.z], [b2.x, b2.y, b2.z], { color: CAP_COL }, [0, sA * kr, wd, sA * kr, wd, sB * kr, 0, sB * kr]);
    }
  }

  // ── Luminaires every 12 m (twice as dense in the threshold zones), light pools, bloom glows.
  const fix = (s: number) => {
    for (const sx of [-1, 1]) {
      ctx.frame(lit, s, sx * W * 0.4, 0, 8.0);
      lit.box(0, 0, 0, 0.5, 0.07, 1.8, { color: night ? [1.0, 0.94, 0.82] : [1.0, 0.96, 0.88] });
      lit.pop();
      ctx.frame(steel, s, sx * W * 0.4, 0, 8.07);
      steel.box(0, 0, 0, 0.65, 0.08, 2.0, { color: [0.35, 0.37, 0.4] });
      steel.pop();
    }
    pool(s);
  };
  for (let k = Math.ceil(Math.max(sp.a, s0) / 12); k * 12 < Math.min(sp.b, s1); k++) {
    const s = k * 12;
    if (s <= sp.a + 1 || s >= sp.b - 1) continue;
    fix(s);
    if (s < sp.a + 60 || s > sp.b - 60) if (s + 6 < Math.min(sp.b, s1)) fix(s + 6);
    if (k % 2 === 0) ctx.glow(s, 0, 7.9, 1.5, 1.4, 1.2, 4.5);
  }
  // Continuous side lighting strip at 1.15 m on both walls.
  if (sb > sa) {
    const p0 = new THREE.Vector3();
    const p1 = new THREE.Vector3();
    for (const sx of [-1, 1]) {
      for (let s = sa; s < sb - 1e-3; s += 12) {
        const e = Math.min(sb, s + 12);
        ctx.local(s, sx * (W - 0.05), 1.15, p0);
        ctx.local(e, sx * (W - 0.05), 1.15, p1);
        const yaw = Math.atan2(p1.x - p0.x, p1.z - p0.z);
        lit.push((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2, yaw);
        lit.box(0, 0, 0, 0.05, 0.08, Math.hypot(p1.x - p0.x, p1.z - p0.z) * 0.96, { color: [0.85, 0.92, 1.0] });
        lit.pop();
      }
    }
  }
  // Safety niches (phone + extinguisher) every 60 m, jet fans every 72 m, exit doors every 180 m.
  for (let k = Math.ceil(sa / 60); k * 60 < sb; k++) {
    const s = k * 60 + 18;
    if (s <= sp.a + 8 || s >= sp.b - 8 || s < s0 || s >= s1) continue;
    const sx = k % 2 === 0 ? 1 : -1;
    ctx.frame(steel, s, sx * (W - 0.12), 0, 0);
    ctx.frame(lit, s, sx * (W - 0.12), 0, 0);
    steel.box(0, 1.4, 0, 0.1, 1.1, 1.3, { color: [0.25, 0.27, 0.3] });
    steel.box(-sx * 0.04, 0.7, 0.4 * sx, 0.14, 0.5, 0.25, { color: rgb('#c0281e') });
    lit.box(-sx * 0.07, 1.6, 0, 0.03, 0.55, 0.8, { color: [0.3, 1.0, 0.5] });
    steel.pop();
    lit.pop();
  }
  for (let k = Math.ceil(sa / 72); k * 72 < sb; k++) {
    const s = k * 72 + 30;
    if (s <= sp.a + 10 || s >= sp.b - 10 || s < s0 || s >= s1) continue;
    for (const sx of [-0.55, 0.55]) {
      ctx.frame(steel, s, sx * W, 0, 6.3, 0);
      steel.push(0, 0, 0, 0, Math.PI / 2, 0);
      steel.frustum(0, -2.2, 0, 0.5, 0.5, 4.4, 14, { color: [0.62, 0.65, 0.68] }, false);
      steel.frustum(0, -2.4, 0, 0.62, 0.5, 0.35, 14, { color: [0.45, 0.47, 0.5] }, false);
      steel.frustum(0, 2.05, 0, 0.5, 0.62, 0.35, 14, { color: [0.45, 0.47, 0.5] }, false);
      steel.pop();
      steel.pop();
    }
  }
  for (let k = Math.ceil(sa / 180); k * 180 < sb; k++) {
    const s = k * 180 + 90;
    if (s <= sp.a + 20 || s >= sp.b - 20 || s < s0 || s >= s1) continue;
    const sx = k % 2 === 0 ? -1 : 1;
    ctx.frame(steel, s, sx * (W - 0.1), 0, 0);
    ctx.frame(lit, s, sx * (W - 0.1), 0, 0);
    steel.box(0, 1.1, 0, 0.12, 2.2, 1.6, { color: [0.2, 0.55, 0.3] });
    lit.box(-sx * 0.08, 2.5, 0, 0.04, 0.35, 1.1, { color: [0.2, 1.0, 0.4] });
    steel.pop();
    lit.pop();
  }

  // ── Portals and rock cuts.
  for (const [s, entry] of [[sp.a, true], [sp.b, false]] as const) {
    if (s < s0 || s >= s1) continue;
    portal(ctx, s, entry, prof, W);
  }
  cutFaces(ctx, sp, rock, W, kr);
  void mul;
}

const CAP_COL: RGB = [0.62, 0.7, 0.5];

/** Headwall around the bore opening: concrete collar plus the exposed mountain face above and beside it. */
function portal(ctx: ChunkBuild, s: number, entry: boolean, prof: [number, number][], W: number): void {
  const cc = ctx.stat('conc');
  const rock = ctx.stat('rock');
  const k = ctx.host.worldMats.uv('concrete');
  const kr = ctx.host.worldMats.uv('cliff');
  const half = ctx.host.half;
  const road = ctx.host.road.height(s);
  const seed = ctx.host.seed;
  ctx.frame(cc, s, 0, 0);
  ctx.frame(rock, s, 0, 0);
  // Height of the mountain surface above the road at lateral station x (metres, +right).
  const top = (x: number): number => {
    const off = Math.abs(x) - half;
    const rise = off <= 0 ? mountainRise(seed, s, 0) - 0.05 : ctx.host.terrainHeight(s, off, x < 0 ? -1 : 1) - road;
    return Math.max(BORE_HEIGHT + 0.5, rise);
  };
  // Quad listed counter-clockwise as seen from +z (the approaching rider): bottom-left, bottom-right, top-right, top-left.
  // The exit wall faces the other way, so its winding is reversed.
  const face = (b: GeoBuilder, x0: number, y0: number, x1: number, y1: number, y2: number, y3: number, color: RGB, kk: number): void => {
    const p0: [number, number, number] = [x0, y0, 0];
    const p1: [number, number, number] = [x1, y1, 0];
    const p2: [number, number, number] = [x1, y2, 0];
    const p3: [number, number, number] = [x0, y3, 0];
    const uv = [x0 * kk, y0 * kk, x1 * kk, y1 * kk, x1 * kk, y2 * kk, x0 * kk, y3 * kk] as const;
    if (entry) b.quad(p0, p1, p2, p3, { color }, uv);
    else b.quad(p1, p0, p3, p2, { color }, [uv[2], uv[3], uv[0], uv[1], uv[6], uv[7], uv[4], uv[5]]);
  };
  // Right half of the arch from the foot to the crown, then the left half (mirror).
  const half0 = prof.slice();
  for (const sx of [1, -1]) {
    for (let i = 0; i < half0.length - 1; i++) {
      const [xa, ya] = half0[i];
      const [xb, yb] = half0[i + 1];
      const x0 = sx > 0 ? xb : -xa;
      const x1 = sx > 0 ? xa : -xb;
      const yL = sx > 0 ? yb : ya;
      const yR = sx > 0 ? ya : yb;
      const tL = Math.max(top(x0), yL + 0.6);
      const tR = Math.max(top(x1), yR + 0.6);
      const cL = Math.min(yL + 1.3, tL);
      const cR = Math.min(yR + 1.3, tR);
      // Concrete collar hugging the opening, rock face from there to the mountain surface.
      face(cc, x0, yL, x1, yR, cR, cL, CONC_COL, k);
      if (tL > cL + 0.01 || tR > cR + 0.01) face(rock, x0, cL, x1, cR, tR, tL, ROCK_COL, kr);
    }
  }
  // Wing walls either side of the opening, from the road up to the mountain surface.
  const x1 = W + 6;
  const steps = 6;
  for (const sx of [1, -1]) {
    for (let i = 0; i < steps; i++) {
      const xa = sx * (W + (i / steps) * (x1 - W));
      const xb = sx * (W + ((i + 1) / steps) * (x1 - W));
      const [lo, hi] = sx > 0 ? [xa, xb] : [xb, xa];
      face(rock, lo, -0.4, hi, -0.4, top(hi), top(lo), ROCK_COL, kr);
    }
  }
  cc.pop();
  rock.pop();
}

/**
 * Vertical rock faces holding back the mountain next to the road on the approaches, where the terrain at
 * the bore width is above the road. Sampled every 4 m; the top follows the terrain surface.
 */
function cutFaces(ctx: ChunkBuild, sp: TunnelSpan, rock: GeoBuilder, W: number, kr: number): void {
  const road = ctx.host.road;
  const lo = Math.max(ctx.s0, sp.a - RISE - 8);
  const hi = Math.min(ctx.s0 + CHUNK_LENGTH, sp.b + RISE + 8);
  if (hi <= lo) return;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const start = Math.ceil(lo / STEP) * STEP;
  for (let s = start; s < hi - 1e-3; s += STEP) {
    const sN = s + STEP;
    if (s >= sp.a && sN <= sp.b) continue;
    for (const side of [-1, 1] as const) {
      const hA = ctx.host.terrainHeight(s, 0.9, side) - road.height(s);
      const hB = ctx.host.terrainHeight(sN, 0.9, side) - road.height(sN);
      if (hA < 0.12 && hB < 0.12) continue;
      ctx.local(s, side * W, 0, a);
      ctx.local(sN, side * W, 0, b);
      const len = STEP * kr;
      const yA = Math.max(0, hA);
      const yB = Math.max(0, hB);
      // Three vertical bands, each pushed outward by rock noise, so the face reads as a blasted rock cut.
      const bands = 3;
      for (let j = 0; j < bands; j++) {
        const f0 = j / bands;
        const f1 = (j + 1) / bands;
        const o = (s: number, f: number) => side * (W + Math.max(0, noise2(s * 0.09, f * 2.7 + side * 5, 23) * 0.5 + 0.5) * 1.1 * Math.min(1, f * 3));
        const pa0 = ctx.local(s, o(s, f0), 0, a);
        const ax0 = pa0.x, az0 = pa0.z, ay0 = pa0.y;
        const pb0 = ctx.local(sN, o(sN, f0), 0, b);
        const bx0 = pb0.x, bz0 = pb0.z, by0 = pb0.y;
        const aN = ctx.local(s, o(s, f1), 0, new THREE.Vector3());
        const bN = ctx.local(sN, o(sN, f1), 0, new THREE.Vector3());
        const y0A = j === 0 ? -0.4 : yA * f0;
        const y0B = j === 0 ? -0.4 : yB * f0;
        const uv = [0, y0A * kr, len, y0B * kr, len, yB * f1 * kr, 0, yA * f1 * kr] as const;
        if (side < 0) rock.quad([ax0, ay0 + y0A, az0], [bx0, by0 + y0B, bz0], [bN.x, bN.y + yB * f1, bN.z], [aN.x, aN.y + yA * f1, aN.z], { color: ROCK_COL }, uv);
        else rock.quad([bx0, by0 + y0B, bz0], [ax0, ay0 + y0A, az0], [aN.x, aN.y + yA * f1, aN.z], [bN.x, bN.y + yB * f1, bN.z], { color: ROCK_COL }, [len, uv[1], 0, uv[3], 0, uv[5], len, uv[7]]);
      }
    }
  }
}

/** Light pool on the road under a luminaire (additive). */
export function poolGeometry(W: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(W * 2, 11);
  g.rotateX(-Math.PI / 2);
  return g;
}
