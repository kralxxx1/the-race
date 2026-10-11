/** Bike model detail levels (mirrors the graphics presets). */
export type BikeDetail = 'low' | 'medium' | 'high' | 'ultra' | 'extreme';
export const BIKE_DETAILS: readonly BikeDetail[] = ['low', 'medium', 'high', 'ultra', 'extreme'];

/** LOD0 = garage close-ups and the first-person cockpit; LOD1 = crash cinematics / distance. */
export type BikeLod = 0 | 1;

export interface KitQuality {
  detail: BikeDetail;
  lod: BikeLod;
  /** Tessellation multiplier (1 = 'high' LOD0). */
  seg: number;
  /** Bolts, nipples, valves, rivets, hose clamps, lettering… */
  micro: boolean;
  /** Individually modelled chain links (otherwise a textured band). */
  chainLinks: boolean;
  /** Livery atlas size [w, h] (px). */
  livery: [number, number];
  /** Generic texture size (tyre sidewalls, dash, decals). */
  tex: number;
  /** Physical (clear-coat) shading for mechanical parts. */
  physical: boolean;
  /** Metallic flake sparkle in paint. */
  flakes: boolean;
}

const SEG: Record<BikeDetail, number> = { low: 0.42, medium: 0.68, high: 1, ultra: 1.45, extreme: 2.1 };
const LIVERY: Record<BikeDetail, [number, number]> = {
  low: [512, 1024],
  medium: [1024, 2048],
  high: [1536, 3072],
  ultra: [2048, 4096],
  extreme: [2048, 4096],
};
const TEX: Record<BikeDetail, number> = { low: 256, medium: 512, high: 1024, ultra: 1024, extreme: 2048 };

export function kitQuality(detail: BikeDetail, lod: BikeLod = 0): KitQuality {
  const d = (BIKE_DETAILS as readonly string[]).includes(detail) ? detail : 'high';
  const l1 = lod === 1;
  return {
    detail: d,
    lod,
    seg: l1 ? Math.min(0.42, SEG[d] * 0.4) : SEG[d],
    micro: !l1 && d !== 'low',
    chainLinks: !l1 && (d === 'high' || d === 'ultra' || d === 'extreme'),
    livery: l1 ? LIVERY.low : LIVERY[d],
    tex: l1 ? 256 : TEX[d],
    physical: d !== 'low',
    flakes: !l1 && (d === 'ultra' || d === 'extreme' || d === 'high'),
  };
}

/** Segment count scaled by quality with a floor. */
export function segs(q: KitQuality, base: number, min = 3): number {
  return Math.max(min, Math.round(base * q.seg));
}
