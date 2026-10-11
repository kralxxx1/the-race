import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import type { TextureTier } from './quality';

/**
 * Library of real, CC0-licensed PBR textures and HDR environment maps shipped
 * under `public/assets` (see public/assets/LICENSES.md and tools/build-assets.py).
 *
 * Everything loads asynchronously with progress reporting (the loading screen
 * shows it), is cached for the lifetime of the page (runs share GPU textures),
 * and fails soft: a missing file resolves to `null` and callers fall back to the
 * procedural textures in textures.ts, so the game still runs offline or from a
 * bare build without the asset folder.
 */

export type TexRes = '1k' | '2k' | '4k';
export type TextureKey =
  | 'asphalt_fresh'
  | 'asphalt_worn'
  | 'gravel'
  | 'concrete'
  | 'guardrail'
  | 'grass'
  | 'sand'
  | 'rock'
  | 'snow'
  | 'forest'
  | 'pavement'
  | 'facade_city'
  | 'facade_industrial'
  | 'bark';
export type TextureMapKind = 'albedo' | 'normal' | 'arm';
export type HdriKey = 'dawn' | 'day' | 'cloudy' | 'overcast' | 'fog' | 'sunset' | 'night' | 'city_night';

export interface TextureSetDef {
  source: 'Poly Haven' | 'ambientCG';
  /** Asset id at the source. */
  id: string;
  authors: string;
  /** Real-world width covered by one texture repeat (metres). */
  sizeM: number;
  res: readonly TexRes[];
}

export interface HdriDef {
  id: string;
  authors: string;
  /** Direction of the brightest point (sun/moon) in game convention: 0° = ahead (−Z), + towards +X. */
  sunAzimuth: number;
  sunElevation: number;
  /** Linear scale of the 8-bit sky backdrop (absent: lighting-only HDRI). */
  skyScale?: number;
}

const PH = 'Poly Haven';
const ACG = 'ambientCG';

export const TEXTURE_SETS: Readonly<Record<TextureKey, TextureSetDef>> = {
  asphalt_fresh: { source: PH, id: 'asphalt_pit_lane', authors: 'Dimitrios Savva', sizeM: 2, res: ['1k', '2k', '4k'] },
  asphalt_worn: { source: PH, id: 'asphalt_02', authors: 'Rob Tuytel', sizeM: 3, res: ['1k', '2k'] },
  gravel: { source: PH, id: 'gravel_floor_02', authors: 'Jenelle van Heerden, Dimitrios Savva', sizeM: 2, res: ['1k', '2k'] },
  concrete: { source: PH, id: 'concrete_wall_008', authors: 'Dario Barresi, Charlotte Baglioni', sizeM: 2.71, res: ['1k', '2k'] },
  guardrail: { source: ACG, id: 'Metal050C', authors: 'ambientCG (Lennart Demes)', sizeM: 1, res: ['1k'] },
  grass: { source: PH, id: 'leafy_grass', authors: 'Charlotte Baglioni', sizeM: 2, res: ['1k', '2k'] },
  sand: { source: PH, id: 'red_sand', authors: 'Rohit Seervi', sizeM: 3, res: ['1k', '2k'] },
  rock: { source: PH, id: 'rock_face_03', authors: 'Dario Barresi, Rico Cilliers', sizeM: 2.7, res: ['1k', '2k'] },
  snow: { source: PH, id: 'snow_02', authors: 'Rob Tuytel', sizeM: 2, res: ['1k', '2k'] },
  forest: { source: PH, id: 'forest_leaves_04', authors: 'Rob Tuytel', sizeM: 1.5, res: ['1k', '2k'] },
  pavement: { source: PH, id: 'concrete_pavement', authors: 'Charlotte Baglioni', sizeM: 1.8, res: ['1k', '2k'] },
  facade_city: { source: ACG, id: 'Facade020A', authors: 'ambientCG (Lennart Demes)', sizeM: 12, res: ['1k', '2k'] },
  facade_industrial: { source: PH, id: 'corrugated_iron_02', authors: 'Jenelle van Heerden, Sergej Majboroda', sizeM: 2.7, res: ['1k'] },
  bark: { source: PH, id: 'bark_brown_02', authors: 'Rob Tuytel', sizeM: 1, res: ['1k'] },
};

// Sun directions and backdrop scales are measured by tools/build-assets.py.
export const HDRIS: Readonly<Record<HdriKey, HdriDef>> = {
  dawn: { id: 'syferfontein_0d_clear_puresky', authors: 'Greg Zaal, Jarod Guest', sunAzimuth: 124.98, sunElevation: 3.34, skyScale: 12.33248 },
  day: { id: 'kloofendal_43d_clear_puresky', authors: 'Greg Zaal', sunAzimuth: 126.04, sunElevation: 43.07, skyScale: 2.7004 },
  cloudy: { id: 'kloofendal_48d_partly_cloudy_puresky', authors: 'Greg Zaal, Jarod Guest', sunAzimuth: 124.28, sunElevation: 47.99, skyScale: 4.33658 },
  overcast: { id: 'kloofendal_overcast_puresky', authors: 'Greg Zaal', sunAzimuth: 119.36, sunElevation: 23.03, skyScale: 4.39125 },
  fog: { id: 'kloofendal_misty_morning_puresky', authors: 'Greg Zaal', sunAzimuth: 133.07, sunElevation: 44.47, skyScale: 1.86721 },
  sunset: { id: 'belfast_sunset_puresky', authors: 'Greg Zaal, Dimitrios Savva, Jarod Guest', sunAzimuth: 127.79, sunElevation: 1.93, skyScale: 16.84264 },
  night: { id: 'kloppenheim_02_puresky', authors: 'Greg Zaal, Jarod Guest', sunAzimuth: 125.68, sunElevation: 17.05, skyScale: 1.54199 },
  city_night: { id: 'shanghai_bund', authors: 'Greg Zaal', sunAzimuth: -56.43, sunElevation: 15.29 },
};

export const TEXTURE_MAPS: readonly TextureMapKind[] = ['albedo', 'normal', 'arm'];
export const SKY_RES: readonly ('2k' | '4k')[] = ['2k', '4k'];

export function texturePath(key: TextureKey, kind: TextureMapKind, res: TexRes): string {
  return `assets/textures/${key}/${kind}_${res}.webp`;
}

export function hdriPath(key: HdriKey): string {
  return `assets/hdri/${key}_1k.hdr`;
}

export function skyPath(key: HdriKey, res: '2k' | '4k'): string {
  return `assets/sky/${key}_${res}.jpg`;
}

/** Every file the manifest references (used by tests and the licence check). */
export function manifestFiles(): string[] {
  const out: string[] = [];
  for (const [key, def] of Object.entries(TEXTURE_SETS) as [TextureKey, TextureSetDef][])
    for (const res of def.res) for (const kind of TEXTURE_MAPS) out.push(texturePath(key, kind, res));
  for (const [key, def] of Object.entries(HDRIS) as [HdriKey, HdriDef][]) {
    out.push(hdriPath(key));
    if (def.skyScale !== undefined) for (const r of SKY_RES) out.push(skyPath(key, r));
  }
  return out;
}

/**
 * Resolution actually loaded for a set at a quality tier: the tier's size when the
 * set ships it, otherwise the largest smaller one. 'procedural' loads nothing.
 */
export function resolveRes(key: TextureKey, tier: TextureTier): TexRes | null {
  if (tier === 'procedural') return null;
  const avail = TEXTURE_SETS[key].res;
  // Only the main asphalt ships a 4K tier; '4k' means "4K road, 2K elsewhere".
  const order: TexRes[] = tier === '4k' ? ['4k', '2k', '1k'] : tier === '2k' ? ['2k', '1k'] : ['1k'];
  for (const r of order) if (avail.includes(r)) return r;
  return avail[0] ?? null;
}

/** A loaded PBR texture set (all maps share UVs and repeat). */
export interface PBRSet {
  key: TextureKey;
  res: TexRes;
  /** sRGB base colour. */
  map: THREE.Texture;
  /** OpenGL-convention tangent-space normal map (linear). */
  normalMap: THREE.Texture;
  /** R = ambient occlusion, G = roughness, B = metalness (linear). */
  arm: THREE.Texture;
  sizeM: number;
}

/** A loaded HDR environment: equirect radiance (sun clamped) plus statistics. */
export interface HdriData {
  key: HdriKey;
  texture: THREE.DataTexture;
  /** Mean radiance of the upper hemisphere after clamping (for exposure matching). */
  skyMean: number;
  def: HdriDef;
}

export type AssetRequest =
  | { kind: 'texture'; key: TextureKey; tier: TextureTier }
  | { kind: 'hdri'; key: HdriKey }
  | { kind: 'sky'; key: HdriKey; res: '2k' | '4k' };

function requestId(r: AssetRequest): string {
  switch (r.kind) {
    case 'texture':
      return `tex:${r.key}:${resolveRes(r.key, r.tier) ?? 'proc'}`;
    case 'hdri':
      return `hdri:${r.key}`;
    case 'sky':
      return `sky:${r.key}:${r.res}`;
  }
}

/**
 * Clamp the sun/moon out of an HDR radiance array (RGBA float) so image-based
 * lighting does not double-count the directional light that casts the shadows.
 * Returns the mean upper-hemisphere luminance after clamping.
 */
export function clampHdrSun(data: Float32Array, width: number, height: number, maxFactor = 24): number {
  const lum = (i: number) => 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  // Median-ish sky level from a sparse sample of the upper hemisphere.
  const samples: number[] = [];
  const half = Math.floor(height / 2);
  for (let y = 0; y < half; y += 4) for (let x = 0; x < width; x += 4) samples.push(lum((y * width + x) * 4));
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length * 0.5)] ?? 1;
  const cap = Math.max(median * maxFactor, 1e-4);
  let sum = 0;
  let n = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const l = lum(i);
      if (l > cap) {
        const k = cap / l;
        data[i] *= k;
        data[i + 1] *= k;
        data[i + 2] *= k;
      }
      if (y < half) {
        sum += Math.min(l, cap);
        n++;
      }
    }
  }
  return n ? sum / n : 1;
}

function baseUrl(): string {
  // Vite: '/' in dev (dev pages live in sub-folders), './' in the relative production build.
  const b = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return b.endsWith('/') ? b : `${b}/`;
}

export class AssetLibrary {
  private textures = new Map<string, Promise<THREE.Texture | null>>();
  private sets = new Map<string, PBRSet | null>();
  private pending = new Map<string, Promise<unknown>>();
  private hdris = new Map<HdriKey, HdriData | null>();
  private skies = new Map<string, THREE.Texture | null>();
  private anisotropy = 4;
  private texLoader: THREE.TextureLoader | null = null;
  private hdrLoader: HDRLoader | null = null;
  /** Files that failed to load (reported in the debug overlay / tests). */
  readonly failures: string[] = [];

  constructor(private base: string = baseUrl()) {}

  url(path: string): string {
    return this.base + path;
  }

  /** Anisotropic filtering for every photo texture, now and later. */
  setAnisotropy(n: number): void {
    if (n === this.anisotropy) return;
    this.anisotropy = n;
    for (const s of this.sets.values()) {
      if (!s) continue;
      for (const t of [s.map, s.normalMap, s.arm]) {
        t.anisotropy = n;
        t.needsUpdate = true;
      }
    }
  }

  private loadImageTexture(path: string, srgb: boolean): Promise<THREE.Texture | null> {
    const hit = this.textures.get(path);
    if (hit) return hit;
    this.texLoader ??= new THREE.TextureLoader();
    const p = new Promise<THREE.Texture | null>((resolve) => {
      this.texLoader!.load(
        this.url(path),
        (t) => {
          t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.anisotropy = this.anisotropy;
          t.generateMipmaps = true;
          t.minFilter = THREE.LinearMipmapLinearFilter;
          t.magFilter = THREE.LinearFilter;
          t.userData.shared = true;
          resolve(t);
        },
        undefined,
        () => {
          this.failures.push(path);
          resolve(null);
        },
      );
    });
    this.textures.set(path, p);
    return p;
  }

  /** Load (or fetch from cache) a PBR set at a quality tier; null when unavailable. */
  async loadTextureSet(key: TextureKey, tier: TextureTier): Promise<PBRSet | null> {
    const res = resolveRes(key, tier);
    if (!res) return null;
    const id = `${key}:${res}`;
    if (this.sets.has(id)) return this.sets.get(id)!;
    const [map, normalMap, arm] = await Promise.all([
      this.loadImageTexture(texturePath(key, 'albedo', res), true),
      this.loadImageTexture(texturePath(key, 'normal', res), false),
      this.loadImageTexture(texturePath(key, 'arm', res), false),
    ]);
    const set = map && normalMap && arm ? { key, res, map, normalMap, arm, sizeM: TEXTURE_SETS[key].sizeM } : null;
    this.sets.set(id, set);
    return set;
  }

  /** Synchronous access to an already loaded set (null if not loaded or failed). */
  textureSet(key: TextureKey, tier: TextureTier): PBRSet | null {
    const res = resolveRes(key, tier);
    if (!res) return null;
    // Fall back to any lower resolution that is already resident.
    const order: TexRes[] = ['4k', '2k', '1k'];
    for (const r of order.slice(order.indexOf(res))) {
      const s = this.sets.get(`${key}:${r}`);
      if (s) return s;
    }
    return null;
  }

  async loadHdri(key: HdriKey): Promise<HdriData | null> {
    if (this.hdris.has(key)) return this.hdris.get(key)!;
    this.hdrLoader ??= new HDRLoader().setDataType(THREE.FloatType);
    const data = await new Promise<HdriData | null>((resolve) => {
      this.hdrLoader!.load(
        this.url(hdriPath(key)),
        (tex) => {
          const img = tex.image as { data: Float32Array; width: number; height: number };
          const skyMean = clampHdrSun(img.data, img.width, img.height);
          // Half floats filter linearly everywhere (float32 linear filtering is optional on mobile).
          const half = new Uint16Array(img.data.length);
          for (let i = 0; i < half.length; i++) half[i] = THREE.DataUtils.toHalfFloat(img.data[i]);
          tex.dispose();
          const t = new THREE.DataTexture(half, img.width, img.height, THREE.RGBAFormat, THREE.HalfFloatType);
          t.colorSpace = THREE.LinearSRGBColorSpace;
          t.mapping = THREE.EquirectangularReflectionMapping;
          t.minFilter = THREE.LinearFilter;
          t.magFilter = THREE.LinearFilter;
          t.generateMipmaps = false;
          t.wrapS = THREE.RepeatWrapping;
          t.needsUpdate = true;
          t.userData.shared = true;
          resolve({ key, texture: t, skyMean, def: HDRIS[key] });
        },
        undefined,
        () => {
          this.failures.push(hdriPath(key));
          resolve(null);
        },
      );
    });
    this.hdris.set(key, data);
    return data;
  }

  hdri(key: HdriKey): HdriData | null {
    return this.hdris.get(key) ?? null;
  }

  async loadSky(key: HdriKey, res: '2k' | '4k'): Promise<THREE.Texture | null> {
    const id = `${key}:${res}`;
    if (this.skies.has(id)) return this.skies.get(id)!;
    if (HDRIS[key].skyScale === undefined) return null;
    const t = await this.loadImageTexture(skyPath(key, res), true);
    if (t) {
      // Equirect strip of the upper hemisphere: wrap around, clamp vertically.
      t.wrapT = THREE.ClampToEdgeWrapping;
      t.anisotropy = 1;
      t.needsUpdate = true;
    }
    this.skies.set(id, t);
    return t;
  }

  sky(key: HdriKey, res: '2k' | '4k'): THREE.Texture | null {
    return this.skies.get(`${key}:${res}`) ?? this.skies.get(`${key}:2k`) ?? null;
  }

  private start(r: AssetRequest): Promise<unknown> {
    const id = requestId(r);
    let p = this.pending.get(id);
    if (!p) {
      p = r.kind === 'texture' ? this.loadTextureSet(r.key, r.tier) : r.kind === 'hdri' ? this.loadHdri(r.key) : this.loadSky(r.key, r.res);
      this.pending.set(id, p);
    }
    return p;
  }

  /**
   * Load a batch of assets, reporting progress 0..1. Never rejects: failed files
   * are recorded in `failures` and the renderer falls back to procedural content.
   */
  async preload(requests: readonly AssetRequest[], onProgress?: (p: number) => void): Promise<void> {
    const unique = new Map<string, AssetRequest>();
    for (const r of requests) if (r.kind !== 'texture' || r.tier !== 'procedural') unique.set(requestId(r), r);
    const list = [...unique.values()];
    if (!list.length) {
      onProgress?.(1);
      return;
    }
    let done = 0;
    onProgress?.(0);
    await Promise.all(
      list.map((r) =>
        this.start(r).then(
          () => onProgress?.(++done / list.length),
          () => onProgress?.(++done / list.length),
        ),
      ),
    );
  }
}

/** Page-wide asset cache shared by every run, the showroom and dev tools. */
export const assets = new AssetLibrary();
