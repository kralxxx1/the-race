import type { SettingsReader } from '../settings';

export type AAMode = 'off' | 'fxaa' | 'smaa' | 'taa';
export type Quality = 'low' | 'medium' | 'high' | 'ultra';
/** Quality level of an optional effect ('off' disables it). */
export type EffectLevel = 'off' | Quality;
export type AOMode = 'off' | 'sao' | 'ssao' | 'gtao';
export type ShadowFilter = 'basic' | 'pcf' | 'vsm';
export type TextureTier = 'procedural' | '1k' | '2k' | '4k';
export type SkyMode = 'basic' | 'physical' | 'hdri';
export type ToneMap = 'aces' | 'agx' | 'neutral' | 'reinhard' | 'cineon' | 'linear';
export type LutStyle = 'off' | 'neutral' | 'warm' | 'cool' | 'cinematic' | 'vivid' | 'bleach' | 'vintage' | 'mono' | 'nightvision';

/** Render parameters derived from the graphics settings. */
export interface QualityProfile {
  /** Max device pixel ratio of the output canvas. */
  pixelRatio: number;
  /** Internal render resolution relative to the canvas (0.5..2, >1 = supersampling). */
  renderScale: number;
  adaptiveResolution: boolean;
  targetFps: number;
  /** Lowest dynamic resolution scale the adaptive controller may use. */
  minScale: number;
  /** Frame-rate cap (0 = uncapped / display refresh). */
  fpsCap: number;

  postFx: boolean;
  aa: AAMode;
  /** MSAA samples for the scene target (0 = off). */
  msaa: number;
  taaFeedback: number;
  sharpen: number;

  shadows: boolean;
  shadowMapSize: number;
  shadowCascades: number;
  shadowDistance: number;
  shadowFilter: ShadowFilter;
  shadowSoftness: number;
  headlightShadows: boolean;

  ao: AOMode;
  aoQuality: Quality;
  aoRadius: number;
  aoIntensity: number;

  ssr: EffectLevel;
  /** Dynamic environment probe refresh interval in frames (0 = static sky reflections). */
  envProbeInterval: number;
  envProbeRes: number;

  textures: TextureTier;
  /** True when the 2K+ texture tier is selected (procedural fallbacks use their larger size). */
  hiResTextures: boolean;
  anisotropy: number;
  detailNormals: boolean;
  terrainBlend: boolean;

  sky: SkyMode;
  skyRes: '2k' | '4k';
  ibl: 'sky' | 'hdri';
  iblIntensity: number;

  toneMapping: ToneMap;
  /** Exposure offset in EV stops on top of the environment's exposure. */
  exposureEV: number;
  brightness: number;
  contrast: number;
  saturation: number;
  lut: LutStyle;
  lutStrength: number;

  bloom: boolean;
  bloomQuality: Quality;
  bloomIntensity: number;
  lensFlare: boolean;
  lensDirt: boolean;
  godRays: EffectLevel;

  volumetricFog: EffectLevel;
  fogDensity: number;
  heatHaze: boolean;

  motionBlur: EffectLevel;
  motionBlurStrength: number;
  speedBlur: boolean;
  dof: EffectLevel;
  chromatic: number;
  vignette: number;
  filmGrain: number;

  rainDrops: number;
  visorRain: boolean;

  /** Multiplier for trees, rocks and buildings. */
  sceneryDensity: number;
  /** Metres of road generated ahead of the player. */
  viewDistance: number;
  /** Scenery (trees, posts, buildings) casts shadows. */
  worldShadows: boolean;

  perfOverlay: 'off' | 'fps' | 'full';
}

function pick<T extends string>(v: string, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

const QUALITIES = ['low', 'medium', 'high', 'ultra'] as const;
const LEVELS = ['off', 'low', 'medium', 'high', 'ultra'] as const;

export function profileFromSettings(s: SettingsReader): QualityProfile {
  const shadows = s.str('gfx.shadows');
  const textures = pick<TextureTier>(s.str('gfx.textures'), ['procedural', '1k', '2k', '4k'], '2k');
  return {
    pixelRatio: s.num('gfx.pixelRatio'),
    renderScale: s.num('gfx.renderScale') / 100,
    adaptiveResolution: s.bool('gfx.adaptiveRes'),
    targetFps: Number(s.str('gfx.targetFps')) || 60,
    minScale: s.num('gfx.minScale') / 100,
    fpsCap: Number(s.str('gfx.fpsCap')) || 0,

    postFx: s.bool('fx.postfx'),
    aa: pick<AAMode>(s.str('gfx.aa'), ['off', 'fxaa', 'smaa', 'taa'], 'smaa'),
    msaa: Number(s.str('gfx.msaa')) || 0,
    taaFeedback: s.num('gfx.taaFeedback'),
    sharpen: s.num('gfx.sharpen'),

    shadows: shadows !== 'off',
    shadowMapSize: shadows === 'off' ? 1024 : Number(shadows),
    shadowCascades: Math.max(1, Math.min(4, Number(s.str('gfx.shadowCascades')) || 1)),
    shadowDistance: s.num('gfx.shadowDistance'),
    shadowFilter: pick<ShadowFilter>(s.str('gfx.shadowFilter'), ['basic', 'pcf', 'vsm'], 'pcf'),
    shadowSoftness: s.num('gfx.shadowSoftness'),
    headlightShadows: s.bool('gfx.headlightShadows'),

    ao: pick<AOMode>(s.str('gfx.ao'), ['off', 'sao', 'ssao', 'gtao'], 'off'),
    aoQuality: pick<Quality>(s.str('gfx.aoQuality'), QUALITIES, 'medium'),
    aoRadius: s.num('gfx.aoRadius'),
    aoIntensity: s.num('gfx.aoIntensity'),

    ssr: pick<EffectLevel>(s.str('gfx.ssr'), LEVELS, 'off'),
    envProbeInterval: Number(s.str('gfx.envProbe')) || 0,
    envProbeRes: Number(s.str('gfx.envProbeRes')) || 128,

    textures,
    hiResTextures: textures === '2k' || textures === '4k',
    anisotropy: Number(s.str('gfx.anisotropy')) || 1,
    detailNormals: s.bool('gfx.detailNormals'),
    terrainBlend: s.bool('gfx.terrainBlend'),

    sky: pick<SkyMode>(s.str('gfx.sky'), ['basic', 'physical', 'hdri'], 'basic'),
    skyRes: pick(s.str('gfx.skyRes'), ['2k', '4k'] as const, '2k'),
    ibl: pick(s.str('gfx.ibl'), ['sky', 'hdri'] as const, 'sky'),
    iblIntensity: s.num('gfx.iblIntensity'),

    toneMapping: pick<ToneMap>(s.str('fx.toneMapping'), ['aces', 'agx', 'neutral', 'reinhard', 'cineon', 'linear'], 'aces'),
    exposureEV: s.num('fx.exposure'),
    brightness: s.num('fx.brightness'),
    contrast: s.num('fx.contrast'),
    saturation: s.num('fx.saturation'),
    lut: pick<LutStyle>(s.str('fx.lut'), ['off', 'neutral', 'warm', 'cool', 'cinematic', 'vivid', 'bleach', 'vintage', 'mono', 'nightvision'], 'off'),
    lutStrength: s.num('fx.lutStrength'),

    bloom: s.bool('fx.bloom'),
    bloomQuality: pick<Quality>(s.str('fx.bloomQuality'), QUALITIES, 'medium'),
    bloomIntensity: s.num('fx.bloomIntensity'),
    lensFlare: s.bool('fx.lensFlare'),
    lensDirt: s.bool('fx.lensDirt'),
    godRays: pick<EffectLevel>(s.str('fx.godRays'), LEVELS, 'off'),

    volumetricFog: pick<EffectLevel>(s.str('fx.volumetricFog'), LEVELS, 'off'),
    fogDensity: s.num('fx.fogDensity'),
    heatHaze: s.bool('fx.heatHaze'),

    motionBlur: pick<EffectLevel>(s.str('fx.motionBlur'), LEVELS, 'off'),
    motionBlurStrength: s.num('fx.motionBlurStrength'),
    speedBlur: s.bool('fx.speedBlur'),
    dof: pick<EffectLevel>(s.str('fx.dof'), LEVELS, 'off'),
    chromatic: s.num('fx.chromatic'),
    vignette: s.num('fx.vignette'),
    filmGrain: s.num('fx.filmGrain'),

    rainDrops: s.num('fx.rainDrops'),
    visorRain: s.bool('fx.visorRain'),

    sceneryDensity: s.num('world.scenery'),
    viewDistance: s.num('world.viewDistance'),
    worldShadows: s.bool('world.shadowCasters'),

    perfOverlay: pick(s.str('gfx.perfOverlay'), ['off', 'fps', 'full'] as const, 'off'),
  };
}
