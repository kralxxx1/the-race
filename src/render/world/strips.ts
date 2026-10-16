import * as THREE from 'three';
import type { GeoBuilder, Paint } from './kit';
import type { ChunkBuild } from './scenery';
import { CHUNK_LENGTH } from './scenery';

/**
 * Ribbons that follow the road's curvature: sidewalks, service roads, snow banks, curbs and low
 * walls. Vertices are sampled every `step` metres of road distance and always include the exact chunk
 * borders, so neighbouring chunks join without gaps.
 */

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();

function samples(ctx: ChunkBuild, step: number): number[] {
  const n = Math.max(1, Math.ceil(CHUNK_LENGTH / step));
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(ctx.s0 + (i / n) * CHUNK_LENGTH);
  return out;
}

/** Height function: `up` metres above the road surface at s (constant) or `ground + y` when `onGround`. */
export interface RibbonHeight {
  up?: number;
  /** Follow the terrain surface instead of the road height (offset added). */
  ground?: number;
}

function heightAt(ctx: ChunkBuild, s: number, d: number, h: RibbonHeight, out: THREE.Vector3): THREE.Vector3 {
  if (h.ground !== undefined) {
    const p = ctx.local(s, d, 0, out);
    p.y = ctx.localY(ctx.groundY(s, d)) + h.ground;
    return p;
  }
  return ctx.local(s, d, h.up ?? 0, out);
}

/** Flat horizontal band between lateral offsets dA and dB (road space d), facing up. UV: u across, v along (metric × uvPerM). */
export function ribbon(b: GeoBuilder, ctx: ChunkBuild, dA: number, dB: number, h: RibbonHeight, p: Paint, step = 6): void {
  const ss = samples(ctx, step);
  const k = p.uvPerM ?? 0.25;
  for (let i = 0; i < ss.length - 1; i++) {
    const s0 = ss[i];
    const s1 = ss[i + 1];
    const a = heightAt(ctx, s0, dA, h, _a);
    const bb = heightAt(ctx, s0, dB, h, _b);
    const c = heightAt(ctx, s1, dB, h, _c);
    const d = heightAt(ctx, s1, dA, h, _d);
    const w = Math.abs(dB - dA) * k;
    // Up-facing for dB > dA (left→right when looking along +s).
    if (dB > dA) b.quad([a.x, a.y, a.z], [bb.x, bb.y, bb.z], [c.x, c.y, c.z], [d.x, d.y, d.z], p, [0, s0 * k, w, s0 * k, w, s1 * k, 0, s1 * k]);
    else b.quad([a.x, a.y, a.z], [d.x, d.y, d.z], [c.x, c.y, c.z], [bb.x, bb.y, bb.z], p, [0, s0 * k, 0, s1 * k, w, s1 * k, w, s0 * k]);
  }
}

/**
 * Vertical wall strip at lateral offset d from height y0 to y1 (above the road surface unless `ground`),
 * facing towards `faceSign` (+1 faces +d / away from the road centre on the right side).
 */
export function wall(b: GeoBuilder, ctx: ChunkBuild, d: number, y0: number, y1: number, faceSign: 1 | -1, h: 'road' | 'ground', p: Paint, step = 6): void {
  const ss = samples(ctx, step);
  const k = p.uvPerM ?? 0.25;
  for (let i = 0; i < ss.length - 1; i++) {
    const s0 = ss[i];
    const s1 = ss[i + 1];
    const lo = (s: number, out: THREE.Vector3, up: number) => (h === 'ground' ? heightAt(ctx, s, d, { ground: up }, out) : ctx.local(s, d, up, out));
    const a = lo(s0, _a, y0);
    const bb = lo(s1, _b, y0);
    const c = lo(s1, _c, y1);
    const dd = lo(s0, _d, y1);
    const len = (s1 - s0) * k;
    const hh = (y1 - y0) * k;
    if (faceSign > 0) b.quad([a.x, a.y, a.z], [bb.x, bb.y, bb.z], [c.x, c.y, c.z], [dd.x, dd.y, dd.z], p, [0, 0, len, 0, len, hh, 0, hh]);
    else b.quad([a.x, a.y, a.z], [dd.x, dd.y, dd.z], [c.x, c.y, c.z], [bb.x, bb.y, bb.z], p, [0, 0, 0, hh, len, hh, len, 0]);
  }
}

/** A single flat quad patch between road distances s0..s1 and lateral offsets d0..d1 (driveways, crossings, pads). */
export function patch(b: GeoBuilder, ctx: ChunkBuild, s0: number, s1: number, d0: number, d1: number, up: number, p: Paint): void {
  const k = p.uvPerM ?? 0.25;
  const a = ctx.local(s0, d0, up, _a);
  const bb = ctx.local(s0, d1, up, _b);
  const c = ctx.local(s1, d1, up, _c);
  const d = ctx.local(s1, d0, up, _d);
  const w = Math.abs(d1 - d0) * k;
  const l = (s1 - s0) * k;
  if (d1 > d0) b.quad([a.x, a.y, a.z], [bb.x, bb.y, bb.z], [c.x, c.y, c.z], [d.x, d.y, d.z], p, [0, 0, w, 0, w, l, 0, l]);
  else b.quad([a.x, a.y, a.z], [d.x, d.y, d.z], [c.x, c.y, c.z], [bb.x, bb.y, bb.z], p, [0, 0, 0, l, w, l, w, 0]);
}
