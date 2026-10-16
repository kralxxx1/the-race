import * as THREE from 'three';
import type { QualityProfile } from '../quality';
import { assets, type AssetRequest, type TextureKey } from '../assets';

/**
 * Loader for the roadside-scenery files under `public/assets/world`: foliage atlases built from CC0
 * Poly Haven leaf photographs (tools/build-foliage.py). Like the PBR sets in assets.ts it caches for the
 * page lifetime, reports progress for the loading screen and fails soft: a missing file resolves to
 * `null` and the vegetation falls back to a painted canvas atlas so the game still runs offline.
 */

export type FoliageKey = 'fir' | 'pine' | 'olive' | 'broad' | 'palm' | 'grass';
export const FOLIAGE_KEYS: readonly FoliageKey[] = ['fir', 'pine', 'olive', 'broad', 'palm', 'grass'];
export type FoliageRes = 'hi' | 'lo';

export function foliagePath(key: FoliageKey, res: FoliageRes): string {
  return `assets/world/foliage_${key}_${res}.webp`;
}

/** Foliage atlas resolution for a quality profile (the 2K+ texture tiers get the 1024×512 atlas). */
export function foliageRes(q: Pick<QualityProfile, 'textures'>): FoliageRes {
  return q.textures === '2k' || q.textures === '4k' ? 'hi' : 'lo';
}

/** Every file the world scenery can request (used by tests and the licence check). */
export function worldManifestFiles(): string[] {
  const out: string[] = [];
  for (const k of FOLIAGE_KEYS) for (const r of ['hi', 'lo'] as const) out.push(foliagePath(k, r));
  return out;
}

/** Texture sets (assets.ts keys) that the scenery of a map needs, beyond the road/terrain ones. */
export function sceneryTextureKeys(map: string): TextureKey[] {
  const keys: TextureKey[] = ['bark'];
  switch (map) {
    case 'suburb':
      keys.push('roof_tiles', 'plaster', 'brick', 'concrete', 'pavement');
      break;
    case 'highway':
      keys.push('concrete', 'rock', 'dry_ground');
      break;
    case 'desert':
      keys.push('cliff', 'dry_ground', 'rock');
      break;
    case 'city':
      keys.push('concrete', 'facade_city', 'pavement');
      break;
    case 'coast':
      keys.push('cliff', 'beach', 'rock', 'plaster', 'roof_tiles');
      break;
    case 'forest':
      keys.push('rock', 'planks', 'cliff');
      break;
    case 'snow':
      keys.push('rock', 'cliff', 'snow', 'planks');
      break;
    case 'industrial':
      keys.push('container', 'concrete', 'tile_white', 'facade_industrial', 'brick', 'cliff', 'asphalt_worn');
      break;
  }
  return keys;
}

/** Foliage atlases a map uses. */
export function sceneryFoliageKeys(map: string): FoliageKey[] {
  // Every map has grass tufts along the verge.
  return [...new Set<FoliageKey>(['grass', ...mapFoliage(map)])];
}

function mapFoliage(map: string): FoliageKey[] {
  switch (map) {
    case 'suburb':
      return ['broad', 'olive', 'pine'];
    case 'highway':
      return ['olive', 'broad', 'pine'];
    case 'desert':
      return ['olive', 'pine'];
    case 'city':
      return ['broad', 'palm'];
    case 'coast':
      return ['pine', 'palm', 'olive', 'broad'];
    case 'forest':
      return ['fir', 'pine', 'broad'];
    case 'snow':
      return ['fir', 'pine'];
    case 'industrial':
      return ['broad', 'olive'];
    default:
      return ['broad'];
  }
}

function baseUrl(): string {
  const b = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return b.endsWith('/') ? b : `${b}/`;
}

export class WorldAssetLibrary {
  private foliageTex = new Map<string, Promise<THREE.Texture | null>>();
  private loaded = new Map<string, THREE.Texture | null>();
  private loader: THREE.TextureLoader | null = null;
  readonly failures: string[] = [];

  constructor(private base: string = baseUrl()) {}

  async loadFoliage(key: FoliageKey, res: FoliageRes): Promise<THREE.Texture | null> {
    const id = `${key}:${res}`;
    let p = this.foliageTex.get(id);
    if (!p) {
      this.loader ??= new THREE.TextureLoader();
      p = new Promise<THREE.Texture | null>((resolve) => {
        this.loader!.load(
          this.base + foliagePath(key, res),
          (t) => {
            t.colorSpace = THREE.SRGBColorSpace;
            t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
            t.generateMipmaps = true;
            t.minFilter = THREE.LinearMipmapLinearFilter;
            t.magFilter = THREE.LinearFilter;
            t.anisotropy = 4;
            t.userData.shared = true;
            this.loaded.set(id, t);
            resolve(t);
          },
          undefined,
          () => {
            this.failures.push(foliagePath(key, res));
            this.loaded.set(id, null);
            resolve(null);
          },
        );
      });
      this.foliageTex.set(id, p);
    }
    return p;
  }

  /** Synchronous access to an already loaded atlas (null when missing or not requested yet). */
  foliage(key: FoliageKey, res: FoliageRes): THREE.Texture | null {
    return this.loaded.get(`${key}:${res}`) ?? this.loaded.get(`${key}:${res === 'hi' ? 'lo' : 'hi'}`) ?? null;
  }

  async preload(keys: readonly FoliageKey[], res: FoliageRes, onProgress?: (p: number) => void): Promise<void> {
    if (!keys.length) {
      onProgress?.(1);
      return;
    }
    let done = 0;
    await Promise.all(
      keys.map((k) =>
        this.loadFoliage(k, res).then(() => onProgress?.(++done / keys.length)),
      ),
    );
  }
}

/** Page-wide cache shared by every run. */
export const worldAssets = new WorldAssetLibrary();

/** Extra PBR sets the scenery of `map` samples (appended to the loading screen's request list). */
export function sceneryRequests(map: string, q: QualityProfile): AssetRequest[] {
  if (q.textures === 'procedural') return [];
  return sceneryTextureKeys(map).map((key) => ({ kind: 'texture' as const, key, tier: q.textures }));
}

/** Load everything the scenery of `map` needs. Never rejects. */
export async function preloadScenery(map: string, q: QualityProfile, onProgress?: (p: number) => void): Promise<void> {
  if (q.textures === 'procedural') {
    onProgress?.(1);
    return;
  }
  await Promise.all([
    assets.preload(sceneryRequests(map, q)),
    worldAssets.preload(sceneryFoliageKeys(map), foliageRes(q), onProgress),
  ]);
}
