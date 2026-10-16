import { Rng, hash01 } from '../../core/math';
import { FACADES, floorsFor, type FacadeStyle } from './facade';

/**
 * City block layout: blocks of BLOCK metres along the road separated by cross streets, with up to four
 * rows of buildings behind the sidewalk. Pure functions of (seed, side, row, block): any chunk can ask for any
 * block and get the same buildings, so towers that straddle a chunk border are placed exactly once.
 */

export const BLOCK = 200;
export const STREET = 16;

export interface RowDef {
  /** Distance from the paved edge to the building's front face. */
  front: number;
  depth: [number, number];
  /** Height range in metres. */
  height: [number, number];
  /** Chance that a slot in the row is empty (park, plot, car park). */
  gap: number;
  /** Building width along the road. */
  width: [number, number];
}

export const ROWS: readonly RowDef[] = [
  { front: 15, depth: [20, 28], height: [14, 52], gap: 0.1, width: [20, 40] },
  { front: 52, depth: [26, 40], height: [45, 140], gap: 0.12, width: [28, 56] },
  { front: 112, depth: [30, 50], height: [90, 210], gap: 0.2, width: [34, 64] },
  { front: 190, depth: [36, 56], height: [130, 270], gap: 0.3, width: [40, 74] },
];

export interface BuildingPlan {
  /** Road distance of the building's centre. */
  s: number;
  /** Lateral centre offset beyond the paved edge. */
  off: number;
  w: number;
  d: number;
  floors: number;
  style: FacadeStyle;
  round: boolean;
  setback: number;
  spire: boolean;
  podium: number;
  tint: number;
  /** Rooftop billboard slot (0 = none). */
  billboard: number;
}

/** Whether road distance s lies inside a cross street (no buildings, dark paving). */
export function inStreet(s: number): boolean {
  const m = ((s % BLOCK) + BLOCK) % BLOCK;
  return m < STREET / 2 || m > BLOCK - STREET / 2;
}

function pickStyle(rng: Rng, row: number): FacadeStyle {
  const t = rng.float();
  if (row === 0) return t < 0.4 ? 'apartment' : t < 0.78 ? 'punched' : 'glass';
  return t < 0.5 ? 'glass' : t < 0.82 ? 'punched' : 'apartment';
}

/** Buildings of one block on one side of the road in one row. */
export function planBlock(seed: number, side: 1 | -1, row: number, block: number): BuildingPlan[] {
  const def = ROWS[row];
  const rng = new Rng(Math.floor(hash01(block * 7919 + side * 104729 + row * 1299709 + seed * 15485863) * 4294967296));
  const out: BuildingPlan[] = [];
  let s = block * BLOCK + STREET / 2 + rng.range(0, 6);
  const end = (block + 1) * BLOCK - STREET / 2;
  while (true) {
    const w = rng.range(def.width[0], def.width[1]);
    if (s + w > end) break;
    const gap = rng.chance(def.gap);
    const d = rng.range(def.depth[0], def.depth[1]);
    if (!gap) {
      const style = pickStyle(rng, row);
      const hMax = def.height[1];
      // Heights skew low with a few outliers: most of the row is mid-rise, now and then a tower.
      const k = Math.pow(rng.float(), row === 0 ? 1.7 : 1.3);
      const m = def.height[0] + (hMax - def.height[0]) * k;
      const floors = floorsFor(style, m);
      const tall = m > 70;
      out.push({
        s: s + w / 2,
        off: def.front + d / 2,
        w,
        d,
        floors,
        style,
        round: tall && w > 30 && rng.chance(0.14),
        setback: tall && rng.chance(0.4) ? rng.range(0.55, 0.78) : 0,
        spire: m > 110 && rng.chance(0.6),
        podium: row === 0 && m < 90 && rng.chance(0.8) ? 1 : row === 1 && rng.chance(0.4) ? 1 : 0,
        tint: rng.int(0, 5),
        billboard: row === 0 && m < 60 && rng.chance(0.3) ? rng.int(1, 8) : 0,
      });
    }
    s += w + rng.range(0.5, row === 0 ? 4 : 8);
  }
  return out;
}

/** Cell type under a point, for ground colouring: street, or the nearest row's plot. */
export function groundKind(seed: number, side: 1 | -1, s: number, off: number): 'street' | 'verge' | 'plaza' | 'park' {
  if (off < 9) return 'verge';
  if (inStreet(s)) return 'street';
  const hit = hash01(Math.floor(s / 45) * 31 + side * 977 + Math.floor(off / 40) * 13 + seed * 7);
  return hit < 0.22 ? 'park' : 'plaza';
}

/** Metres of floor height for a style (re-exported so scenery code does not import facade for it). */
export function floorHeight(style: FacadeStyle): number {
  return FACADES[style].cell[1];
}
