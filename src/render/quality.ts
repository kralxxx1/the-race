import type { SettingsReader } from '../settings';

/** Render parameters derived from the graphics settings. */
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
  adaptiveResolution: boolean;
  speedBlur: boolean;
}

export function profileFromSettings(s: SettingsReader): QualityProfile {
  const shadows = s.str('gfx.shadows');
  return {
    pixelRatio: s.num('gfx.pixelRatio'),
    shadows: shadows !== 'off',
    shadowMapSize: shadows === 'off' ? 1024 : Number(shadows),
    bloom: s.bool('fx.bloom'),
    msaa: Number(s.str('gfx.msaa')) || 0,
    sceneryDensity: s.num('world.scenery'),
    viewDistance: s.num('world.viewDistance'),
    hiResTextures: s.bool('gfx.hiResTextures'),
    postFx: s.bool('fx.postfx'),
    rainDrops: s.num('fx.rainDrops'),
    adaptiveResolution: s.bool('gfx.adaptiveRes'),
    speedBlur: s.bool('fx.speedBlur'),
  };
}
