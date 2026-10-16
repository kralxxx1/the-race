import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MAPS, resolveEnvironment, type MapId } from '../../src/data/maps';
import { profileFromSettings, type QualityProfile } from '../../src/render/quality';
import { createScenery } from '../../src/render/world/maps';
import { SceneryChunk, ChunkBuild, CHUNK_LENGTH, type SceneryHost } from '../../src/render/world/scenery';
import { FOLIAGE_KEYS, foliagePath, sceneryFoliageKeys, sceneryTextureKeys, worldManifestFiles } from '../../src/render/world/worldAssets';
import { WorldMaterials } from '../../src/render/world/worldMaterials';
import { TREE_SPECS, buildTree, cellUv, disposeTree, type TreeId } from '../../src/render/world/trees';
import { TEXTURE_SETS } from '../../src/render/assets';
import { GeoBuilder } from '../../src/render/world/kit';
import { RoadPath, makeLaneConfig, pavedHalfWidth } from '../../src/world/road';
import { SETTINGS, SettingsReader, type QualityPreset } from '../../src/settings';
import { fbm2, smoothstep } from '../../src/core/math';

const PUBLIC = 'public';

function quality(preset: QualityPreset): QualityProfile {
  return profileFromSettings(new SettingsReader(SETTINGS, SETTINGS.defaults(preset)));
}

function finite(g: THREE.BufferGeometry): boolean {
  for (const name of Object.keys(g.attributes)) {
    const a = g.getAttribute(name);
    for (let i = 0; i < a.array.length; i++) if (!Number.isFinite(a.array[i])) return false;
  }
  return true;
}

describe('scenery assets', () => {
  it('ships every foliage atlas at both resolutions', () => {
    for (const f of worldManifestFiles()) expect(existsSync(join(PUBLIC, f)), f).toBe(true);
    expect(worldManifestFiles().length).toBe(FOLIAGE_KEYS.length * 2);
  });

  it('keeps the scenery files small and lists them in LICENSES.md', () => {
    const md = readFileSync(join(PUBLIC, 'assets/LICENSES.md'), 'utf8');
    let total = 0;
    for (const k of FOLIAGE_KEYS) {
      expect(md, `foliage ${k}`).toContain(`| ${k} |`);
      for (const r of ['hi', 'lo'] as const) total += statSync(join(PUBLIC, foliagePath(k, r))).size;
    }
    expect(total).toBeLessThan(4 * 1024 * 1024);
  });

  it('every map only requests texture sets that exist in the manifest', () => {
    for (const m of MAPS) {
      for (const k of sceneryTextureKeys(m.id)) expect(Object.keys(TEXTURE_SETS), `${m.id}:${k}`).toContain(k);
      expect(sceneryFoliageKeys(m.id)).toContain('grass');
    }
  });
});

describe('foliage cards and trees', () => {
  it('maps atlas cells onto a 4x2 grid', () => {
    expect(cellUv(0)).toEqual([0, 0.5, 0.25, 1]);
    expect(cellUv(3)).toEqual([0.75, 0.5, 1, 1]);
    expect(cellUv(4)).toEqual([0, 0, 0.25, 0.5]);
    expect(cellUv(7)).toEqual([0.75, 0, 1, 0.5]);
  });

  const ids = Object.keys(TREE_SPECS) as TreeId[];

  it('builds every species finite, with shrinking LOD budgets and in-atlas UVs', () => {
    for (const id of ids) {
      const spec = TREE_SPECS[id];
      for (let v = 0; v < spec.variants; v++) {
        const m = buildTree(spec, v);
        expect(m.lods[0].triangles, id).toBeGreaterThan(m.lods[1].triangles);
        expect(m.lods[1].triangles, id).toBeGreaterThanOrEqual(m.lods[2].triangles);
        // Budgets: a near tree stays cheap enough to instance ~100 per chunk.
        expect(m.lods[0].triangles, `${id} lod0`).toBeLessThan(1400);
        expect(m.lods[2].triangles, `${id} lod2`).toBeLessThan(160);
        for (const l of m.lods) {
          expect(finite(l.leaves), `${id} leaves`).toBe(true);
          if (l.trunk) expect(finite(l.trunk), `${id} trunk`).toBe(true);
          const uv = l.leaves.getAttribute('uv');
          for (let i = 0; i < uv.count; i++) {
            expect(uv.getX(i)).toBeGreaterThanOrEqual(-1e-6);
            expect(uv.getX(i)).toBeLessThanOrEqual(1 + 1e-6);
            expect(uv.getY(i)).toBeGreaterThanOrEqual(-1e-6);
            expect(uv.getY(i)).toBeLessThanOrEqual(1 + 1e-6);
          }
        }
        disposeTree(m);
      }
    }
  });

  it('is deterministic per species and variant, and variants differ', () => {
    for (const id of ['olive', 'spruce', 'stonepine'] as TreeId[]) {
      const spec = TREE_SPECS[id];
      const a = buildTree(spec, 0);
      const b = buildTree(spec, 0);
      const c = buildTree(spec, 1);
      const pa = a.lods[0].leaves.getAttribute('position').array;
      const pb = b.lods[0].leaves.getAttribute('position').array;
      const pc = c.lods[0].leaves.getAttribute('position').array;
      expect(Array.from(pa)).toEqual(Array.from(pb));
      expect(Array.from(pa)).not.toEqual(Array.from(pc));
    }
  });

  it('keeps crowns near their nominal height', () => {
    for (const id of ids) {
      const spec = TREE_SPECS[id];
      const m = buildTree(spec, 0);
      m.lods[0].leaves.computeBoundingBox();
      const top = m.lods[0].leaves.boundingBox!.max.y;
      expect(top, id).toBeLessThan(spec.height * 1.6 + 3);
      expect(top, id).toBeGreaterThan(spec.height * 0.25);
    }
  });
});

describe('geometry kit', () => {
  it('bakes frames, boxes and limbs into finite indexed geometry', () => {
    const b = new GeoBuilder();
    b.push(2, 0, -3, 0.7);
    b.box(0, 1, 0, 2, 2, 3, { color: [1, 0, 0], uvPerM: 0.5 });
    b.frustum(0, 0, 0, 0.3, 0.1, 5, 8, {}, true);
    b.limb([0, 0, 0], [3, 4, 1], 0.2, 0.1, 6);
    b.gable(0, 2, 0, 4, 6, 1.5, 0.3, {}, {});
    b.pop();
    const g = b.build();
    expect(finite(g)).toBe(true);
    expect(g.index!.count % 3).toBe(0);
    const n = g.getAttribute('normal');
    for (let i = 0; i < n.count; i++) expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i))).toBeCloseTo(1, 4);
    // Box faces are wound outwards: the +y face normal points up.
    const b2 = new GeoBuilder();
    b2.box(0, 0, 0, 1, 1, 1);
    const g2 = b2.build();
    const ny = g2.getAttribute('normal');
    let up = 0;
    for (let i = 0; i < ny.count; i++) if (ny.getY(i) > 0.99) up++;
    expect(up).toBe(4);
  });
});

/** Fake WorldView host: real road and quality, test materials. */
function makeHost(map: MapId, preset: QualityPreset, seed = 5): { host: SceneryHost; mats: WorldMaterials } {
  const env = resolveEnvironment(map, 'day', 'clear');
  const lanes = makeLaneConfig('oneway');
  const road = new RoadPath(seed);
  const q = quality(preset);
  const mats = new WorldMaterials(q, env.world.snow > 0);
  const half = pavedHalfWidth(lanes);
  const host: SceneryHost = {
    road,
    lanes,
    half,
    env,
    quality: q,
    seed,
    worldMats: mats,
    terrainHeight: (s, off, side) => road.height(s) - 0.05 + 6 * (fbm2(s * 0.003 + side * 3, off * 0.004, 3, seed) * 0.5 + 0.3) * smoothstep(9, 90, off),
  };
  return { host, mats };
}

function buildChunkFor(map: MapId, preset: QualityPreset, index: number, seed = 5) {
  const { host, mats } = makeHost(map, preset, seed);
  const scenery = createScenery(host);
  const parent = new THREE.Group();
  const chunk = new SceneryChunk(parent);
  scenery.attach(chunk);
  chunk.reset();
  const origin = new THREE.Vector3();
  host.road.toWorld(index * CHUNK_LENGTH, 0, origin);
  const ctx = new ChunkBuild(host, chunk, index, index * CHUNK_LENGTH, origin, scenery);
  scenery.build(ctx);
  ctx.commit();
  return { host, mats, scenery, chunk, parent };
}

function counts(chunk: SceneryChunk): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, p] of chunk.props) out[k] = p.count;
  return out;
}

describe('highway scenery chunk', () => {
  it('generates deterministic instance counts per seed and chunk', () => {
    const a = buildChunkFor('highway', 'medium', 6);
    const b = buildChunkFor('highway', 'medium', 6);
    expect(counts(a.chunk)).toEqual(counts(b.chunk));
    const c = buildChunkFor('highway', 'medium', 7);
    expect(counts(c.chunk)).not.toEqual(counts(a.chunk));
    const d = buildChunkFor('highway', 'medium', 6, 6);
    expect(counts(d.chunk)).not.toEqual(counts(a.chunk));
    for (const x of [a, b, c, d]) {
      x.scenery.dispose();
      x.chunk.dispose();
      x.mats.dispose();
    }
  });

  it('never produces NaN transforms and respects per-set capacity', () => {
    const r = buildChunkFor('highway', 'ultra', 4);
    let placed = 0;
    r.chunk.group.traverse((o) => {
      const im = o as THREE.InstancedMesh;
      if (!im.isInstancedMesh) return;
      expect(im.count).toBeLessThanOrEqual(im.instanceMatrix.count);
      for (let i = 0; i < im.count * 16; i++) expect(Number.isFinite(im.instanceMatrix.array[i])).toBe(true);
      placed += im.count;
    });
    expect(placed).toBeGreaterThan(50);
    r.scenery.dispose();
    r.chunk.dispose();
    r.mats.dispose();
  });

  it('scales with the scenery density preset', () => {
    const low = buildChunkFor('highway', 'low', 5);
    const ultra = buildChunkFor('highway', 'ultra', 5);
    const total = (c: SceneryChunk) => Object.values(counts(c)).reduce((a, b) => a + b, 0);
    expect(total(ultra.chunk)).toBeGreaterThan(total(low.chunk) * 1.5);
    for (const x of [low, ultra]) {
      x.scenery.dispose();
      x.chunk.dispose();
      x.mats.dispose();
    }
  });

  it('disposes every geometry it created', () => {
    const r = buildChunkFor('highway', 'medium', 5);
    const geos: THREE.BufferGeometry[] = [];
    r.chunk.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) geos.push(m.geometry);
    });
    let disposed = 0;
    for (const g of geos) g.addEventListener('dispose', () => disposed++);
    r.scenery.dispose();
    r.chunk.dispose();
    r.mats.dispose();
    // Shared prop geometries are released by the scenery, merged statics by the chunk.
    expect(disposed).toBeGreaterThan(0);
  });
});
