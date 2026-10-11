import type { EnvDef } from '../data/environments';
import { assets, type AssetRequest } from './assets';
import type { QualityProfile } from './quality';
import { hdriFor } from './sky';
import { surfaceKeys } from './surfaces';
import { setTextureAnisotropy } from './textures';

/** Everything a run in `env` will sample, for the selected quality (nothing at the procedural tier). */
export function assetRequests(env: EnvDef, q: QualityProfile): AssetRequest[] {
  const out: AssetRequest[] = [];
  if (q.textures !== 'procedural') for (const key of surfaceKeys(env)) out.push({ kind: 'texture', key, tier: q.textures });
  const sky = hdriFor(env);
  if (q.ibl === 'hdri') out.push({ kind: 'hdri', key: sky.light });
  if (q.sky === 'hdri') out.push({ kind: 'sky', key: sky.sky, res: q.skyRes });
  return out;
}

/** Load the CC0 textures and HDRIs of a run with progress 0..1; never rejects (missing files fall back to procedural). */
export async function preloadWorld(env: EnvDef, q: QualityProfile, onProgress?: (p: number) => void): Promise<void> {
  assets.setAnisotropy(q.anisotropy);
  setTextureAnisotropy(q.anisotropy);
  await assets.preload(assetRequests(env, q), onProgress);
}
