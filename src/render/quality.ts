import type { Quality } from '../storage/save';

export interface QualityProfile {
  /** Max device pixel ratio. */
  pixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  bloom: boolean;
  /** MSAA samples for the post-processing target (0 = off). */
  msaa: number;
  /** Multiplier for trees, rocks and buildings. */
  sceneryDensity: number;
  /** Metres of road generated ahead of the player. */
  viewDistance: number;
  hiResTextures: boolean;
  postFx: boolean;
  rainDrops: number;
}

export const QUALITY: Record<Quality, QualityProfile> = {
  low: { pixelRatio: 1, shadows: false, shadowMapSize: 1024, bloom: false, msaa: 0, sceneryDensity: 0.35, viewDistance: 700, hiResTextures: false, postFx: false, rainDrops: 900 },
  medium: { pixelRatio: 1.25, shadows: true, shadowMapSize: 1024, bloom: true, msaa: 0, sceneryDensity: 0.65, viewDistance: 950, hiResTextures: false, postFx: true, rainDrops: 1500 },
  high: { pixelRatio: 1.5, shadows: true, shadowMapSize: 2048, bloom: true, msaa: 4, sceneryDensity: 1, viewDistance: 1200, hiResTextures: true, postFx: true, rainDrops: 2200 },
  ultra: { pixelRatio: 2, shadows: true, shadowMapSize: 4096, bloom: true, msaa: 4, sceneryDensity: 1.35, viewDistance: 1450, hiResTextures: true, postFx: true, rainDrops: 3200 },
};
