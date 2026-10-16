import type { Rng } from '../../core/math';
import { mul, rgb, type RGB } from './kit';
import { inFrame, window, type Surfaces } from './buildings';
import type { ChunkBuild } from './scenery';

const TRIM_WHITE = rgb('#ecebe6');
const GLASS = rgb('#1b2733');

export interface BlockOpts {
  rng: Rng;
  night: boolean;
  floors?: number;
  width?: number;
  wall?: RGB;
  lit?: number;
}

/** Apartment block (apartman): concrete frame with plastered façade, balconies, flat roof with water tanks. */
export function apartment(ctx: ChunkBuild, sf: Surfaces, s: number, d: number, side: number, o: BlockOpts): void {
  const rng = o.rng;
  const W = o.width ?? rng.range(16, 26);
  const D = rng.range(11, 15);
  const floors = o.floors ?? rng.int(4, 7);
  const fh = 3.0;
  const H = floors * fh + 0.6;
  const wall = o.wall ?? mul(rng.pick([rgb('#e6dfd0'), rgb('#d9cdb4'), rgb('#cfd2d0'), rgb('#e2c7a6'), rgb('#c9d3da'), rgb('#ecd9c4')]), 1.45);
  const litP = o.lit ?? 0.5;
  inFrame(ctx, sf, s, d, ctx.faceRoad(side), () => {
    const wp = { color: wall, uvPerM: 1 / 3 };
    sf.wall.box(0, (H - 1.8) / 2, 0, W, H + 1.8, D, wp, 4 | 8);
    // Flat roof slab with parapet, water tanks and a stairwell box.
    sf.trim.box(0, H + 0.04, 0, W + 0.5, 0.2, D + 0.5, { color: rgb('#bdb8ac') });
    for (const [px, pz, sx, sz] of [[0, D / 2 + 0.2, W + 0.5, 0.18], [0, -D / 2 - 0.2, W + 0.5, 0.18], [W / 2 + 0.2, 0, 0.18, D + 0.5], [-W / 2 - 0.2, 0, 0.18, D + 0.5]] as const) {
      sf.trim.box(px, H + 0.5, pz, sx, 0.75, sz, { color: rgb('#c9c4b8') });
    }
    sf.wall.box(rng.range(-W / 3, W / 3), H + 1.0, rng.range(-1, 1), 2.6, 1.8, 2.6, { color: mul(wall, 0.92), uvPerM: 0.3 });
    const tanks = rng.int(1, 3);
    for (let i = 0; i < tanks; i++) sf.trim.frustum(-W / 2 + 2 + i * 1.5, H + 0.25, rng.range(-2, 2), 0.55, 0.55, 1.1, 10, { color: rgb('#c9ccd0') }, true);
    // Front façade: bay grid of windows with balconies on alternate bays.
    const bays = Math.max(3, Math.round(W / 3.2));
    const bw = W / bays;
    const balc = rng.chance(0.75);
    for (let f = 0; f < floors; f++) {
      for (let k = 0; k < bays; k++) {
        const x = (k - (bays - 1) / 2) * bw;
        const y = f * fh + 1.55 + (f === 0 ? 0.6 : 0);
        if (f === 0 && k === Math.floor(bays / 2)) {
          sf.trim.box(x, 1.2, -D / 2 - 0.05, 1.9, 2.4, 0.1, { color: rgb('#30363c') });
          sf.glass.box(x, 1.15, -D / 2 - 0.1, 1.6, 2.2, 0.04, { color: GLASS });
          sf.trim.box(x, 2.6, -D / 2 - 0.7, 2.6, 0.12, 1.4, { color: TRIM_WHITE });
          continue;
        }
        const lit = rng.chance(o.night ? litP : 0);
        window(sf, x, y, -D / 2, bw * 0.46, 1.3, lit, false);
        if (balc && f > 0 && k % 2 === 0) {
          sf.wall.box(x, f * fh + 0.45, -D / 2 - 0.55, bw * 0.9, 0.14, 1.1, { color: wall, uvPerM: 1 / 3 });
          sf.trim.box(x, f * fh + 1.0, -D / 2 - 1.07, bw * 0.9, 0.9, 0.05, { color: rgb('#5d6970') });
        }
      }
    }
    // Side windows, sparse.
    for (const sgn of [-1, 1]) {
      for (let f = 0; f < floors; f++) {
        for (let k = 0; k < 2; k++) {
          if (!rng.chance(0.7)) continue;
          for (const b of [sf.trim, sf.glass, sf.lit]) b.push(sgn * (W / 2), 0, (k - 0.5) * (D * 0.5), sgn > 0 ? -Math.PI / 2 : Math.PI / 2);
          window(sf, 0, f * fh + 1.55 + (f === 0 ? 0.6 : 0), 0, 1.0, 1.3, rng.chance(o.night ? litP : 0), false);
          for (const b of [sf.trim, sf.glass, sf.lit]) b.pop();
        }
      }
    }
  });
}
