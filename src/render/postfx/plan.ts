import type { EffectLevel, Quality, QualityProfile } from '../quality';

/**
 * Pure description of the frame pipeline for a quality profile and output size:
 * which passes run, in which order, at which resolution and with how many
 * samples. The renderer builds GPU resources from this plan, and unit tests
 * check it per preset without a WebGL context.
 *
 * Order (HDR, linear until "composite"; normals are rebuilt from the scene depth,
 * so there is no separate geometry pass):
 *   scene (colour + depth) → ao → ssr → volumetrics → taa → bloom → dof → motionBlur
 *   → composite (tone map + grading + LUT + lens effects) → fxaa|smaa → output
 * TAA resolves the fully lit HDR image before bloom/DOF/motion blur so those see
 * a stable, anti-aliased input; FXAA/SMAA work on the final LDR image as intended.
 */

export type PassId =
  | 'scene'
  | 'ao'
  | 'ssr'
  | 'volumetrics'
  | 'taa'
  | 'bloom'
  | 'dof'
  | 'motionBlur'
  | 'composite'
  | 'fxaa'
  | 'smaa'
  | 'output';

export const PASS_ORDER: readonly PassId[] = ['scene', 'ao', 'ssr', 'volumetrics', 'taa', 'bloom', 'dof', 'motionBlur', 'composite', 'fxaa', 'smaa', 'output'];

export interface PassSpec {
  id: PassId;
  width: number;
  height: number;
  /** Primary sample/step count of the effect (taps, ray steps, mips…). */
  samples: number;
  /** Secondary count (volumetrics: god-ray taps next to the fog steps). */
  extra?: number;
  quality?: Quality | EffectLevel;
}

export interface PipelinePlan {
  mode: 'forward' | 'post';
  /** Canvas drawing-buffer size. */
  outputWidth: number;
  outputHeight: number;
  /** Internal render size (render scale × dynamic scale). */
  width: number;
  height: number;
  msaa: number;
  passes: PassSpec[];
  /** Structural identity: passes, qualities and sample counts (not sizes). */
  key: string;
}

export const AO_SAMPLES: Record<'sao' | 'ssao' | 'gtao', Record<Quality, number>> = {
  sao: { low: 8, medium: 12, high: 16, ultra: 24 },
  ssao: { low: 8, medium: 16, high: 32, ultra: 48 },
  gtao: { low: 8, medium: 12, high: 16, ultra: 24 },
};
/** GTAO slice/step layout; slices × steps equals the AO_SAMPLES.gtao budget. */
export const GTAO_LAYOUT: Record<Quality, readonly [number, number]> = { low: [2, 4], medium: [3, 4], high: [4, 4], ultra: [4, 6] };
export const SSR_STEPS: Record<Quality, number> = { low: 16, medium: 32, high: 48, ultra: 96 };
export const BLOOM_MIPS: Record<Quality, number> = { low: 4, medium: 5, high: 6, ultra: 7 };
export const GODRAY_SAMPLES: Record<Quality, number> = { low: 24, medium: 48, high: 96, ultra: 128 };
export const FOG_STEPS: Record<Quality, number> = { low: 8, medium: 12, high: 24, ultra: 48 };
export const DOF_SAMPLES: Record<Quality, number> = { low: 16, medium: 32, high: 64, ultra: 96 };
export const MOTION_SAMPLES: Record<Quality, number> = { low: 6, medium: 10, high: 16, ultra: 24 };

const fullRes = (q: Quality) => q === 'high' || q === 'ultra';

export function internalSize(outW: number, outH: number, renderScale: number, dynScale: number): [number, number] {
  const s = Math.max(0.25, renderScale * dynScale);
  return [Math.max(1, Math.round(outW * s)), Math.max(1, Math.round(outH * s))];
}

export function planPipeline(p: QualityProfile, outputWidth: number, outputHeight: number, dynScale = 1): PipelinePlan {
  const [w, h] = internalSize(outputWidth, outputHeight, p.postFx ? p.renderScale : Math.min(p.renderScale, 1), dynScale);
  const passes: PassSpec[] = [];
  const add = (id: PassId, scale: number, samples: number, quality?: Quality | EffectLevel, extra?: number) =>
    passes.push({ id, width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)), samples, quality, extra });

  if (!p.postFx) {
    // Simple forward path: one scene render straight to the canvas (MSAA via the context or one resolve).
    add('scene', 1, p.msaa);
    return { mode: 'forward', outputWidth, outputHeight, width: w, height: h, msaa: p.msaa, passes, key: `forward:${p.msaa}` };
  }

  const ao = p.ao;
  const ssr = p.ssr;
  add('scene', 1, p.msaa);
  if (ao !== 'off') add('ao', fullRes(p.aoQuality) ? 1 : 0.5, AO_SAMPLES[ao][p.aoQuality], p.aoQuality);
  if (ssr !== 'off') add('ssr', fullRes(ssr) ? 1 : 0.5, SSR_STEPS[ssr], ssr);
  if (p.volumetricFog !== 'off' || p.godRays !== 'off') {
    const fogQ = p.volumetricFog === 'off' ? 'low' : p.volumetricFog;
    const rayQ = p.godRays === 'off' ? null : p.godRays;
    const q = p.volumetricFog === 'off' ? rayQ ?? 'low' : fogQ;
    add('volumetrics', q === 'high' || q === 'ultra' ? 0.5 : 0.25, p.volumetricFog === 'off' ? 0 : FOG_STEPS[fogQ], q, rayQ ? GODRAY_SAMPLES[rayQ] : 0);
  }
  if (p.aa === 'taa') add('taa', 1, 1);
  if (p.bloom) add('bloom', p.bloomQuality === 'ultra' ? 1 : 0.5, BLOOM_MIPS[p.bloomQuality], p.bloomQuality);
  if (p.dof !== 'off') add('dof', fullRes(p.dof) ? 1 : 0.5, DOF_SAMPLES[p.dof], p.dof);
  if (p.motionBlur !== 'off') add('motionBlur', 1, MOTION_SAMPLES[p.motionBlur], p.motionBlur);
  add('composite', 1, 1);
  if (p.aa === 'fxaa') add('fxaa', 1, 1);
  if (p.aa === 'smaa') add('smaa', 1, 1);
  passes.push({ id: 'output', width: outputWidth, height: outputHeight, samples: 1 });

  const key = `post:${p.msaa}:` + passes.map((s) => `${s.id}/${s.samples}/${s.extra ?? 0}/${s.quality ?? ''}/${s.width === w ? 'f' : 'h'}`).join(',');
  return { mode: 'post', outputWidth, outputHeight, width: w, height: h, msaa: p.msaa, passes, key };
}

export function hasPass(plan: PipelinePlan, id: PassId): boolean {
  return plan.passes.some((s) => s.id === id);
}

export function passSpec(plan: PipelinePlan, id: PassId): PassSpec | undefined {
  return plan.passes.find((s) => s.id === id);
}

/** Rough relative GPU weight of one sample/tap per pixel for each pass (fill-rate × shader cost). */
const PASS_WEIGHT: Record<PassId, number> = {
  scene: 6,
  ao: 0.9,
  ssr: 1.1,
  volumetrics: 0.7,
  taa: 3,
  bloom: 2.5,
  dof: 0.8,
  motionBlur: 0.9,
  composite: 4,
  fxaa: 2,
  smaa: 5,
  output: 1.5,
};

/**
 * Relative frame cost of a plan, in "megapixel-taps" (higher = heavier). Not a
 * timing: it only orders presets and sizes so tests can assert that 'extreme' is
 * far heavier than 'low' and that cost grows with every step of the ladder.
 */
export function estimateCost(plan: PipelinePlan, shadowCascades = 1, shadowMapSize = 1024, shadowing = true): number {
  let cost = 0;
  for (const p of plan.passes) {
    const mp = (p.width * p.height) / 1e6;
    const taps = p.id === 'scene' ? 1 + Math.max(0, p.samples - 1) * 0.35 : p.id === 'volumetrics' ? p.samples + (p.extra ?? 0) * 0.5 : Math.max(1, p.samples);
    cost += mp * PASS_WEIGHT[p.id] * (p.id === 'scene' ? taps : Math.sqrt(taps));
  }
  if (shadowing) cost += ((shadowCascades * shadowMapSize * shadowMapSize) / 1e6) * 1.2;
  return cost;
}
