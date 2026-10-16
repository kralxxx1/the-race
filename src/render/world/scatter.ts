import * as THREE from 'three';
import { Rng, hash01, noise2 } from '../../core/math';
import type { ChunkBuild } from './scenery';
import { CHUNK_LENGTH, jitterTint } from './scenery';
import type { RGB } from './kit';

/** Offset (metres from the paved edge) up to which props use the detailed LODs. */
export const NEAR_BAND = 46;

export interface ScatterOptions {
  /** Instances per chunk at density 1 (scaled by the world.scenery setting). */
  count: number;
  /** Lateral offset range from the paved edge. */
  offMin: number;
  offMax: number;
  /** Distribution exponent: >1 packs towards offMin. */
  pow?: number;
  /** Which sides: 1 right, −1 left, 0 both. */
  side?: -1 | 0 | 1;
  scale?: [number, number];
  /** Horizontal stretch range. */
  stretch?: [number, number];
  tint?: RGB | string;
  tintJitter?: number;
  /** Return true to reject a placement (e.g. inside a house plot). */
  reject?: (s: number, d: number, off: number) => boolean;
  /** Density mask 0..1 evaluated at (s, d): thins the scatter into clearings/groves. */
  mask?: (s: number, d: number) => number;
  sink?: number;
  /** Random yaw (default true). */
  spin?: boolean;
  /** Tilt range for rocks etc. (radians). */
  tilt?: number;
}

const _c = new THREE.Color();

/** Scatter instances of the given prop keys (variants) around the road. Returns how many were placed. */
export function scatter(ctx: ChunkBuild, keys: readonly string[], o: ScatterOptions): number {
  const rng = ctx.rng;
  const n = Math.round(o.count * ctx.density);
  const pw = o.pow ?? 1;
  let placed = 0;
  for (let i = 0; i < n; i++) {
    const side = o.side ? o.side : rng.chance(0.5) ? 1 : -1;
    const s = ctx.s0 + rng.float() * CHUNK_LENGTH;
    const off = o.offMin + Math.pow(rng.float(), pw) * (o.offMax - o.offMin);
    const d = side * (ctx.host.half + off);
    if (o.mask && rng.float() > o.mask(s, d)) continue;
    if (o.reject?.(s, d, off)) continue;
    const key = keys[rng.int(0, keys.length - 1)];
    const sc = o.scale ? rng.range(o.scale[0], o.scale[1]) : 1;
    const st = o.stretch ? rng.range(o.stretch[0], o.stretch[1]) : 1;
    const tint = o.tint ? jitterTint(rng, o.tint, o.tintJitter ?? 0.12, _c) : null;
    const ok = ctx.put(
      key,
      s,
      d,
      {
        yaw: o.spin === false ? 0 : rng.range(0, Math.PI * 2),
        scale: sc,
        scaleXZ: st,
        sink: o.sink,
        tint,
        pitch: o.tilt ? rng.range(-o.tilt, o.tilt) : 0,
        roll: o.tilt ? rng.range(-o.tilt, o.tilt) : 0,
      },
      off < NEAR_BAND,
    );
    if (ok) placed++;
  }
  return placed;
}

export interface LineOptions {
  /** Spacing along the road, metres. */
  every: number;
  /** Lateral offset from the paved edge (positive away from the road). */
  off: number;
  side: -1 | 0 | 1;
  /** Phase so that two lines can interleave. */
  phase?: number;
  /** Face the road (default) or point along it. */
  facing?: 'road' | 'along' | 'away';
  scale?: number;
  yaw?: number;
  /** Skip placements for which this returns true. */
  skip?: (s: number) => boolean;
  sink?: number;
}

/** Periodic placement along the road, locked to absolute s so chunk borders are seamless. */
export function line(ctx: ChunkBuild, key: string, o: LineOptions): number {
  let placed = 0;
  const sides: (1 | -1)[] = o.side === 0 ? [1, -1] : [o.side];
  const first = Math.ceil((ctx.s0 - (o.phase ?? 0)) / o.every);
  for (let k = first; ; k++) {
    const s = k * o.every + (o.phase ?? 0);
    if (s >= ctx.s0 + CHUNK_LENGTH) break;
    if (o.skip?.(s)) continue;
    for (const side of sides) {
      const base = o.facing === 'along' ? 0 : o.facing === 'away' ? -ctx.faceRoad(side) : ctx.faceRoad(side);
      if (ctx.put(key, s, side * (ctx.host.half + o.off), { yaw: base + (o.yaw ?? 0), scale: o.scale, sink: o.sink }, true)) placed++;
    }
  }
  return placed;
}

/** Deterministic per-position hash in [0, 1). */
export function h2(a: number, b: number, seed = 0): number {
  return hash01(Math.floor(a) * 73856093 + Math.floor(b) * 19349663 + seed * 83492791);
}

/** Smooth patchiness mask in 0..1 (groves, clearings, villages). */
export function patchy(s: number, d: number, scale: number, seed: number, lo = 0.35, hi = 0.65): number {
  const n = noise2(s / scale, d / scale, seed) * 0.5 + 0.5;
  const t = Math.min(1, Math.max(0, (n - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}

export { Rng };
