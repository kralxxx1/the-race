import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MAPS, resolveEnvironment } from '../../src/data/maps';
import { TEXTURE_SETS, assets, resolveRes, type PBRSet, type TextureKey } from '../../src/render/assets';
import { profileFromSettings } from '../../src/render/quality';
import { collectMaterialTextures, collectObjectTextures, uploadable } from '../../src/render/residency';
import { createScenery } from '../../src/render/world/maps';
import { CHUNK_LENGTH, ChunkBuild, SceneryChunk, type SceneryHost } from '../../src/render/world/scenery';
import { WorldMaterials } from '../../src/render/world/worldMaterials';
import { FOLIAGE_KEYS, foliageRes, worldAssets } from '../../src/render/world/worldAssets';
import { RoadPath, makeLaneConfig, pavedHalfWidth } from '../../src/world/road';
import { SETTINGS, SettingsReader } from '../../src/settings';

function dataTexture(): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  t.needsUpdate = true;
  return t;
}

describe('texture residency', () => {
  it('collects map slots and shader uniform textures', () => {
    const map = dataTexture();
    const normal = dataTexture();
    const std = new THREE.MeshStandardMaterial({ map, normalMap: normal, roughnessMap: map });
    const lut = dataTexture();
    const shader = new THREE.ShaderMaterial({ uniforms: { tLut: { value: lut }, uGain: { value: 2 } } });
    const out = new Set<THREE.Texture>();
    collectMaterialTextures(std, out);
    collectMaterialTextures(shader, out);
    expect([...out].sort((a, b) => a.id - b.id)).toEqual([map, normal, lut].sort((a, b) => a.id - b.id));

    const root = new THREE.Group();
    const extra = dataTexture();
    root.add(new THREE.Mesh(new THREE.BufferGeometry(), [std, new THREE.MeshBasicMaterial({ map: extra })]));
    const fromScene = new Set<THREE.Texture>();
    collectObjectTextures(root, fromScene);
    expect(fromScene.has(extra) && fromScene.has(map) && fromScene.has(normal)).toBe(true);
  });

  it('only uploads textures that carry data', () => {
    expect(uploadable(dataTexture())).toBe(true);
    expect(uploadable(new THREE.Texture())).toBe(false);
    const decoding = new THREE.Texture({ complete: false } as unknown as HTMLImageElement);
    decoding.needsUpdate = true;
    expect(uploadable(decoding)).toBe(false);
    const rt = new THREE.WebGLRenderTarget(4, 4);
    rt.texture.needsUpdate = true;
    expect(uploadable(rt.texture)).toBe(false);
    rt.dispose();
  });

  it('the up-front set covers every texture a scenery chunk draws from its props and statics, on every map', () => {
    const q = profileFromSettings(new SettingsReader(SETTINGS, SETTINGS.defaults('high')));
    // Stand-ins for the photo sets and foliage atlases the browser would have loaded, so the scenery uses them.
    const sets = (assets as unknown as { sets: Map<string, PBRSet | null> }).sets;
    const loaded = (worldAssets as unknown as { loaded: Map<string, THREE.Texture | null> }).loaded;
    for (const key of Object.keys(TEXTURE_SETS) as TextureKey[]) {
      const res = resolveRes(key, q.textures);
      if (res) sets.set(`${key}:${res}`, { key, res, map: dataTexture(), normalMap: dataTexture(), arm: dataTexture(), sizeM: TEXTURE_SETS[key].sizeM });
    }
    for (const k of FOLIAGE_KEYS) loaded.set(`${k}:${foliageRes(q)}`, dataTexture());
    let checked = 0;
    for (const m of MAPS) {
      const env = resolveEnvironment(m.id, m.defaultTime, m.defaultWeather);
      const lanes = makeLaneConfig('oneway');
      const road = new RoadPath(7);
      const mats = new WorldMaterials(q, env.world.snow > 0);
      const host: SceneryHost = { road, lanes, half: pavedHalfWidth(lanes), env, quality: q, seed: 7, worldMats: mats, terrainHeight: (s) => road.height(s) };
      const scenery = createScenery(host);

      const upFront = new Set<THREE.Material>();
      scenery.materials(upFront);
      mats.materials(upFront);
      const resident = new Set<THREE.Texture>();
      for (const mat of upFront) collectMaterialTextures(mat, resident);

      const parent = new THREE.Group();
      const drawn = new Set<THREE.Texture>();
      const extras = new Set<THREE.Object3D>();
      for (let i = 2; i < 14; i++) {
        const chunk = new SceneryChunk(parent);
        scenery.attach(chunk);
        chunk.reset();
        const origin = new THREE.Vector3();
        road.toWorld(i * CHUNK_LENGTH, 0, origin);
        const ctx = new ChunkBuild(host, chunk, i, i * CHUNK_LENGTH, origin, scenery);
        scenery.build(ctx);
        ctx.commit();
        for (const e of chunk.extras) extras.add(e);
      }
      // Per-chunk extras (animated or one-off meshes) are created with their chunk and cannot be uploaded early.
      for (const e of extras) e.removeFromParent();
      collectObjectTextures(parent, drawn);
      checked += drawn.size;
      const missing = [...drawn].filter((t) => !resident.has(t));
      expect(missing.map((t) => t.name || t.uuid), m.id).toEqual([]);
      scenery.dispose();
      mats.dispose();
    }
    // The photo stand-ins really were drawn (the check above is not vacuous).
    expect(checked).toBeGreaterThan(MAPS.length * 4);
    sets.clear();
    loaded.clear();
  });
});
