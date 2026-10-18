import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MAPS, resolveEnvironment } from '../../src/data/maps';
import { TEXTURE_SETS, assets, resolveRes, type PBRSet, type TextureKey } from '../../src/render/assets';
import { profileFromSettings } from '../../src/render/quality';
import { collectMaterialTextures, collectObjectTextures, collectSourceTextures, uploadable } from '../../src/render/residency';
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

  it('the up-front set covers every texture a scenery chunk really draws, on every map', () => {
    const q = profileFromSettings(new SettingsReader(SETTINGS, SETTINGS.defaults('high')));
    // Stand-ins for the photo sets and foliage atlases the browser would have loaded, so the scenery uses them.
    const sets = (assets as unknown as { sets: Map<string, PBRSet | null> }).sets;
    const loaded = (worldAssets as unknown as { loaded: Map<string, THREE.Texture | null> }).loaded;
    const photo = new Map<THREE.Texture, string>();
    const standIn = (name: string): THREE.DataTexture => {
      const t = dataTexture();
      photo.set(t, name);
      return t;
    };
    for (const key of Object.keys(TEXTURE_SETS) as TextureKey[]) {
      const res = resolveRes(key, q.textures);
      if (res) sets.set(`${key}:${res}`, { key, res, map: standIn(`${key}.albedo`), normalMap: standIn(`${key}.normal`), arm: standIn(`${key}.arm`), sizeM: TEXTURE_SETS[key].sizeM });
    }
    for (const k of FOLIAGE_KEYS) loaded.set(`${k}:${foliageRes(q)}`, standIn(`foliage.${k}`));
    try {
      for (const m of MAPS) {
        const env = resolveEnvironment(m.id, m.defaultTime, m.defaultWeather);
        const lanes = makeLaneConfig('oneway');
        const road = new RoadPath(7);
        const mats = new WorldMaterials(q, env.world.snow > 0);
        const host: SceneryHost = { road, lanes, half: pavedHalfWidth(lanes), env, quality: q, seed: 7, worldMats: mats, terrainHeight: (s) => road.height(s) };
        const scenery = createScenery(host);
        // The production collection path (WorldView.textures adds only the road surfaces on top).
        const resident = new Set<THREE.Texture>();
        collectSourceTextures([scenery, mats], [], resident);

        const drawn = new Set<THREE.Texture>();
        for (let i = 2; i < 30; i++) {
          const parent = new THREE.Group();
          const chunk = new SceneryChunk(parent);
          scenery.attach(chunk);
          chunk.reset();
          const origin = new THREE.Vector3();
          road.toWorld(i * CHUNK_LENGTH, 0, origin);
          const ctx = new ChunkBuild(host, chunk, i, i * CHUNK_LENGTH, origin, scenery);
          scenery.build(ctx);
          ctx.commit();
          // Per-chunk extras (animated or one-off meshes) are created with their chunk and cannot be uploaded early.
          for (const e of chunk.extras) e.removeFromParent();
          // Only meshes that really draw something: placed instances and built statics.
          const live = new THREE.Group();
          parent.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (!mesh.isMesh) return;
            const inst = o as THREE.InstancedMesh;
            if (inst.isInstancedMesh ? inst.count > 0 : mesh.visible && !!mesh.geometry.getAttribute('position')) live.add(new THREE.Mesh(mesh.geometry, mesh.material));
          });
          collectObjectTextures(live, drawn);
          chunk.dispose();
        }
        const missing = [...drawn].filter((t) => !resident.has(t)).map((t) => photo.get(t) ?? t.name ?? t.uuid);
        expect(missing, m.id).toEqual([]);
        // Not vacuous: the scenery really drew photo sets (bark, foliage, building or rock sets) from the cache.
        const drawnPhotos = [...drawn].filter((t) => photo.has(t)).map((t) => photo.get(t)!);
        expect(drawnPhotos.length, `${m.id}: ${drawnPhotos.join(', ')}`).toBeGreaterThanOrEqual(4);
        scenery.dispose();
        mats.dispose();
      }
    } finally {
      // The caches are page-wide singletons: leave them as other test files expect.
      sets.clear();
      loaded.clear();
    }
  });
});
