import { Rng } from '../../core/math';
import { GeoBuilder, mul, rgb, type RGB } from './kit';
import type { ChunkBuild } from './scenery';

/**
 * Building generators. Each one authors a structure in its own frame (x across the façade,
 * y up, front = −z) into the chunk's merged static builders, one per surface material:
 *
 *   plaster / concrete / brick / planks   photographic walls (metric UVs)
 *   roof                                   tiles, metal sheet, membrane (double sided)
 *   trim                                   frames, rails, doors, gutters (flat colours)
 *   glass                                  dark window glazing
 *   lit                                    lit windows (emissive, only used at night)
 */

/** Plaster tints are >1 on purpose: the photographic plaster is dim and sunless façades must still read. */
const GAIN = 1.45;
export const WALLS: readonly RGB[] = [rgb('#f1ece0'), rgb('#e9dcc2'), rgb('#e8c9a0'), rgb('#d8d6cc'), rgb('#efe3cf'), rgb('#cfd8dc'), rgb('#e6d3b3'), rgb('#f4efe6')].map((c) => mul(c, GAIN));
export const ROOFS: readonly RGB[] = [rgb('#b4553a'), rgb('#a8472f'), rgb('#bf6a46'), rgb('#9c4a38'), rgb('#7d4a3a')];

/** Builder keys every map that has buildings registers (see Scenery.defineStatic). */
export interface Surfaces {
  wall: GeoBuilder;
  roof: GeoBuilder;
  trim: GeoBuilder;
  glass: GeoBuilder;
  lit: GeoBuilder;
}

export function surfaces(ctx: ChunkBuild, wall = 'plaster'): Surfaces {
  return { wall: ctx.stat(wall), roof: ctx.stat('roof'), trim: ctx.stat('trim'), glass: ctx.stat('glass'), lit: ctx.stat('lit') };
}

/** Run `fn` with every surface builder positioned in the same object frame at a road point. */
export function inFrame(ctx: ChunkBuild, sf: Surfaces, s: number, d: number, yawExtra: number, fn: () => void, sink = 0): void {
  const p = ctx.local(s, d, 0);
  const y = ctx.localY(ctx.groundY(s, d)) - sink;
  const yaw = ctx.yaw(s) + yawExtra;
  const bs = [sf.wall, sf.roof, sf.trim, sf.glass, sf.lit];
  for (const b of bs) b.push(p.x, y, p.z, yaw);
  fn();
  for (const b of bs) b.pop();
}

const TRIM_WHITE = rgb('#ecebe6');
const TRIM_DARK = rgb('#3a3d42');
const GLASS = rgb('#1b2733');
const DOOR = rgb('#5a3a28');

/** A window (frame, glazing, sill) on the −z face at (x, y) of width w and height h. */
export function window(sf: Surfaces, x: number, y: number, z: number, w: number, h: number, lit: boolean, shutter = false): void {
  const fr = 0.07;
  sf.trim.box(x, y, z - 0.02, w + fr * 2, h + fr * 2, 0.08, { color: TRIM_WHITE });
  (lit ? sf.lit : sf.glass).box(x, y, z - 0.065, w, h, 0.03, { color: lit ? rgb('#ffcf8a') : GLASS });
  // Mullion cross and sill.
  sf.trim.box(x, y, z - 0.085, 0.05, h, 0.03, { color: TRIM_WHITE });
  sf.trim.box(x, y + h * 0.08, z - 0.085, w, 0.05, 0.03, { color: TRIM_WHITE });
  sf.trim.box(x, y - h / 2 - fr - 0.04, z - 0.1, w + 0.3, 0.07, 0.22, { color: rgb('#d2cdc2') });
  if (shutter) {
    sf.trim.box(x - w / 2 - 0.3, y, z - 0.07, 0.42, h + 0.08, 0.05, { color: rgb('#6b8a62') });
    sf.trim.box(x + w / 2 + 0.3, y, z - 0.07, 0.42, h + 0.08, 0.05, { color: rgb('#6b8a62') });
  }
}

export interface HouseOpts {
  rng: Rng;
  night: boolean;
  /** Plot width along the road (house is centred in it). */
  width?: number;
  floors?: number;
  wall?: RGB;
  roof?: RGB;
  /** Probability that a window is lit at night. */
  lit?: number;
}

/** Detached Turkish suburban villa: plastered walls, gable roof with tiles, balcony, garage and garden wall. */
export function house(ctx: ChunkBuild, sf: Surfaces, s: number, d: number, side: number, o: HouseOpts): void {
  const rng = o.rng;
  const W = o.width ?? rng.range(9, 13);
  const D = rng.range(8.5, 11);
  const floors = o.floors ?? rng.int(2, 3);
  const fh = 2.9;
  const H = floors * fh;
  const wall = o.wall ?? rng.pick(WALLS);
  const roof = o.roof ?? rng.pick(ROOFS);
  const litP = o.lit ?? 0.45;
  inFrame(ctx, sf, s, d, ctx.faceRoad(side), () => {
    const wp = { color: wall, uvPerM: 1 / 3 };
    // Plinth + walls (sunk below grade so slopes never open a gap).
    sf.wall.box(0, (H - 1.6) / 2 - 0.2, 0, W, H + 1.6, D, wp, 4 | 8);
    sf.trim.box(0, 0.12, 0, W + 0.12, 0.28, D + 0.12, { color: rgb('#a9a69c') }, 8);
    // Roof: gable with the ridge along x or z; hip-like overhang. Attic gable ends filled by gable().
    const ridgeAlongX = rng.chance(0.55);
    const rise = (ridgeAlongX ? D : W) * 0.3;
    const rp = { color: roof, uvPerM: 0.4 };
    sf.roof.push(0, H, 0, ridgeAlongX ? Math.PI / 2 : 0);
    sf.wall.push(0, H, 0, ridgeAlongX ? Math.PI / 2 : 0);
    const sx = ridgeAlongX ? D : W;
    const sz = ridgeAlongX ? W : D;
    sf.roof.roofSlopes(0, 0, 0, sx, sz, rise, 0.5, rp);
    sf.wall.gableEnds(0, 0, 0, sx, sz, rise, 0.5, wp);
    sf.roof.pop();
    sf.wall.pop();
    // Ridge cap and chimney.
    sf.trim.push(0, H, 0, ridgeAlongX ? Math.PI / 2 : 0);
    sf.trim.box(0, rise + 0.04, 0, 0.18, 0.14, sz + 1.0, { color: mul(roof, 0.8) });
    sf.trim.pop();
    if (rng.chance(0.7)) {
      const cx = rng.range(-W * 0.25, W * 0.25);
      sf.wall.box(cx, H + rise * 0.55, rng.range(-1, 1), 0.7, rise * 1.4 + 0.6, 0.7, { color: rgb('#8a5b46'), uvPerM: 0.5 });
    }
    // Front (−z) façade: windows on each floor, door and balcony.
    const bays = W > 11 ? 3 : 2;
    for (let f = 0; f < floors; f++) {
      for (let k = 0; k < bays; k++) {
        const x = (k - (bays - 1) / 2) * (W / bays);
        const isDoor = f === 0 && k === 0;
        if (isDoor) {
          sf.trim.box(x, 1.15, -D / 2 - 0.03, 1.3, 2.3, 0.1, { color: TRIM_WHITE });
          sf.trim.box(x, 1.12, -D / 2 - 0.09, 1.0, 2.15, 0.05, { color: DOOR });
          sf.trim.box(x + 0.3, 1.1, -D / 2 - 0.13, 0.06, 0.06, 0.05, { color: rgb('#c9a23a') });
          // Entry steps and canopy.
          sf.wall.box(x, 0.1, -D / 2 - 0.65, 1.8, 0.2, 1.1, { color: rgb('#b8b2a6'), uvPerM: 0.4 });
          sf.trim.box(x, 2.45, -D / 2 - 0.45, 1.9, 0.1, 1.0, { color: TRIM_WHITE });
        } else {
          window(sf, x, f * fh + 1.55, -D / 2, 1.1, 1.3, rng.chance(o.night ? litP : 0), rng.chance(0.25));
        }
      }
    }
    if (floors >= 2 && rng.chance(0.7)) {
      // Balcony on the first floor over the door bay: slab + railing.
      const bx = rng.pick([-1, 1]) * (W / 4);
      sf.wall.box(bx, fh, -D / 2 - 0.6, W / 2.4, 0.16, 1.2, { color: wall, uvPerM: 1 / 3 });
      for (let i = -3; i <= 3; i++) sf.trim.box(bx + (i * W) / 15, fh + 0.55, -D / 2 - 1.15, 0.03, 0.95, 0.03, { color: TRIM_DARK });
      sf.trim.box(bx, fh + 1.04, -D / 2 - 1.15, W / 2.4, 0.05, 0.05, { color: TRIM_DARK });
    }
    // Side windows (+x / −x faces).
    for (const sgn of [-1, 1]) {
      for (let f = 0; f < floors; f++) {
        if (!rng.chance(0.75)) continue;
        sf.trim.push(sgn * W / 2, 0, 0, sgn > 0 ? -Math.PI / 2 : Math.PI / 2);
        sf.glass.push(sgn * W / 2, 0, 0, sgn > 0 ? -Math.PI / 2 : Math.PI / 2);
        sf.lit.push(sgn * W / 2, 0, 0, sgn > 0 ? -Math.PI / 2 : Math.PI / 2);
        window(sf, 0, f * fh + 1.55, -0, 1.0, 1.3, rng.chance(o.night ? litP : 0), false);
        sf.trim.pop();
        sf.glass.pop();
        sf.lit.pop();
      }
    }
  });
}
