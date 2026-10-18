import * as THREE from 'three';

/**
 * GPU texture residency. three.js uploads a texture on the first frame that samples it, so a cached
 * photo set used only by a rarely spawned scenery piece (a city's worn-asphalt patch, a highway rest
 * area) was uploaded with its whole mip chain in the middle of a ride: a visible hitch, and a GPU
 * texture count that depended on what happened to spawn. A run collects every texture its materials
 * can sample and uploads them while the loading screen is still up instead.
 */

function isTexture(v: unknown): v is THREE.Texture {
  return !!v && (v as THREE.Texture).isTexture === true;
}

/** Add every texture a material references (standard map slots and shader uniforms) to `out`. */
export function collectMaterialTextures(mat: THREE.Material, out: Set<THREE.Texture>): void {
  for (const v of Object.values(mat)) if (isTexture(v)) out.add(v);
  const uniforms = (mat as Partial<THREE.ShaderMaterial>).uniforms;
  if (uniforms) for (const u of Object.values(uniforms)) if (isTexture(u?.value)) out.add(u.value);
}

/** Textures of every mesh material under `root`. */
export function collectObjectTextures(root: THREE.Object3D, out: Set<THREE.Texture>): void {
  root.traverse((o) => {
    const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) for (const m of mat) collectMaterialTextures(m, out);
    else if (mat) collectMaterialTextures(mat, out);
  });
}

/** Anything that can list the materials it may draw (scenery, world materials). */
export interface MaterialSource {
  materials(out: Set<THREE.Material>): void;
}

/** Textures of `materials` plus every material the `sources` may draw, including scenery pieces not built yet. */
export function collectSourceTextures(sources: readonly MaterialSource[], materials: readonly THREE.Material[], out: Set<THREE.Texture>): void {
  const mats = new Set<THREE.Material>(materials);
  for (const src of sources) src.materials(mats);
  for (const m of mats) collectMaterialTextures(m, out);
}

/**
 * Whether a texture has image data that can be uploaded now. Render-target textures are allocated by
 * their target, a version of 0 means no data was ever set and an image still decoding would only log
 * a warning.
 */
export function uploadable(t: THREE.Texture): boolean {
  if (t.isRenderTargetTexture || t.version === 0) return false;
  const img = t.image as { complete?: boolean } | null | undefined;
  return !!img && img.complete !== false;
}
