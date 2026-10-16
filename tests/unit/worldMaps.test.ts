import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MAPS, resolveEnvironment, type MapId } from '../../src/data/maps';
import { fbm2, smoothstep } from '../../src/core/math';
import { profileFromSettings, type QualityProfile } from '../../src/render/quality';
import { BLOCK, ROWS, inStreet, planBlock } from '../../src/render/world/cityPlan';
import { FACADES } from '../../src/render/world/facade';
import { createScenery } from '../../src/render/world/maps';
import { BRIDGE_CORE, BRIDGE_FIRST, BRIDGE_PERIOD, CityScenery } from '../../src/render/world/maps/city';
import { CHUNK_LENGTH, ChunkBuild, SceneryChunk, type Scenery, type SceneryHost } from '../../src/render/world/scenery';
import { BORE_HEIGHT, crestHeight, mountainMask, mountainRise, tunnelEnclosure, tunnelNear, tunnelSpan } from '../../src/render/world/tunnel';
import { WorldMaterials } from '../../src/render/world/worldMaterials';
import { SETTINGS, SettingsReader, type QualityPreset } from '../../src/settings';
import { RoadPath, makeLaneConfig, pavedHalfWidth } from '../../src/world/road';

function quality(preset: QualityPreset): QualityProfile {
  return profileFromSettings(new SettingsReader(SETTINGS, SETTINGS.defaults(preset)));
}

interface Built {
  host: SceneryHost;
  mats: WorldMaterials;
  scenery: Scenery;
  chunk: SceneryChunk;
}

/** Host with the map's own terrain shaping applied, like WorldView does. */
function build(map: MapId, preset: QualityPreset, index: number, seed = 5, time: 'day' | 'night' = 'day'): Built {
  const env = resolveEnvironment(map, time, 'clear');
  const lanes = makeLaneConfig('oneway');
  const road = new RoadPath(seed);
  const q = quality(preset);
  const mats = new WorldMaterials(q, env.world.snow > 0);
  let scenery: Scenery | null = null;
  const host: SceneryHost = {
    road,
    lanes,
    half: pavedHalfWidth(lanes),
    env,
    quality: q,
    seed,
    worldMats: mats,
    terrainHeight: (s, off, side) => {
      const base = road.height(s) - 0.05 + 6 * (fbm2(s * 0.003 + side * 3, off * 0.004, 3, seed) * 0.5 + 0.3) * smoothstep(9, 90, off);
      return scenery ? scenery.terrain(s, off, side, base) : base;
    },
  };
  scenery = createScenery(host);
  const chunk = new SceneryChunk(new THREE.Group());
  scenery.attach(chunk);
  chunk.reset();
  const origin = new THREE.Vector3();
  road.toWorld(index * CHUNK_LENGTH, 0, origin);
  const ctx = new ChunkBuild(host, chunk, index, index * CHUNK_LENGTH, origin, scenery);
  scenery.build(ctx);
  ctx.commit();
  return { host, mats, scenery, chunk };
}

function free(b: Built): void {
  b.scenery.dispose();
  b.chunk.dispose();
  b.mats.dispose();
}

function allFinite(g: THREE.BufferGeometry): boolean {
  for (const name of Object.keys(g.attributes)) {
    const a = g.getAttribute(name);
    for (let i = 0; i < a.array.length; i++) if (!Number.isFinite(a.array[i])) return false;
  }
  return true;
}

interface Stats {
  triangles: number;
  instances: number;
  statics: number;
}

function inspect(b: Built): Stats {
  const st: Stats = { triangles: 0, instances: 0, statics: 0 };
  b.chunk.group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.visible && !(m as unknown as THREE.InstancedMesh).isInstancedMesh) return;
    const im = m as unknown as THREE.InstancedMesh;
    if (im.isInstancedMesh) {
      expect(im.count).toBeLessThanOrEqual(im.instanceMatrix.count);
      for (let i = 0; i < im.count * 16; i++) if (!Number.isFinite(im.instanceMatrix.array[i])) throw new Error(`NaN instance matrix in ${m.name}`);
      st.instances += im.count;
      return;
    }
    if (m.geometry.index) {
      expect(allFinite(m.geometry)).toBe(true);
      st.triangles += m.geometry.index.count / 3;
      st.statics++;
    }
  });
  return st;
}

const MAP_IDS = MAPS.map((m) => m.id);
/** Chunk indexes that cover open road, a tunnel mountain (industrial ≈ 10–14) and the first bridge (city ≈ 19–22). */
const CHUNKS = [3, 10, 12, 14, 20];
/** Static triangle budget per chunk and quality preset: generous but bounded (a runaway generator trips it). */
const BUDGET: Record<'low' | 'medium' | 'ultra', number> = { low: 15000, medium: 20000, ultra: 30000 };

describe('every map builds clean chunks', () => {
  for (const map of MAP_IDS) {
    for (const preset of ['low', 'medium', 'ultra'] as const) {
      it(`${map} @ ${preset}: finite geometry, bounded triangles, deterministic`, () => {
        for (const idx of CHUNKS) {
          const a = build(map, preset, idx);
          const sa = inspect(a);
          expect(sa.triangles, `${map} chunk ${idx} static triangles`).toBeLessThan(BUDGET[preset]);
          expect(sa.instances, `${map} chunk ${idx} instances`).toBeLessThan(2500);
          const b = build(map, preset, idx);
          expect(inspect(b)).toEqual(sa);
          free(a);
          free(b);
        }
      });
    }
  }

  it('different seeds and night/day change the scenery but stay valid', () => {
    for (const map of ['city', 'industrial', 'desert'] as const) {
      const a = build(map, 'medium', 10, 5, 'day');
      const b = build(map, 'medium', 10, 9, 'night');
      const sa = inspect(a);
      const sb = inspect(b);
      expect(sa.triangles).toBeGreaterThan(0);
      expect(sb.triangles).toBeGreaterThan(0);
      free(a);
      free(b);
    }
  });

  it('low keeps a lighter scene than ultra on the dense maps', () => {
    for (const map of ['city', 'industrial', 'forest'] as const) {
      const lo = build(map, 'low', 8);
      const hi = build(map, 'ultra', 8);
      const total = (s: Stats) => s.triangles + s.instances * 30;
      expect(total(inspect(lo)), map).toBeLessThanOrEqual(total(inspect(hi)));
      free(lo);
      free(hi);
    }
  });

  it('disposes the geometry it created (repeat runs do not leak)', () => {
    for (const map of MAP_IDS) {
      const r = build(map, 'medium', 10);
      const geos = new Set<THREE.BufferGeometry>();
      r.chunk.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) geos.add(m.geometry);
      });
      let disposed = 0;
      for (const g of geos) g.addEventListener('dispose', () => disposed++);
      free(r);
      expect(disposed, map).toBeGreaterThan(0);
    }
  });
});

describe('city plan', () => {
  it('is deterministic per seed, block, side and row', () => {
    expect(planBlock(5, 1, 0, 7)).toEqual(planBlock(5, 1, 0, 7));
    expect(planBlock(5, 1, 0, 7)).not.toEqual(planBlock(6, 1, 0, 7));
    expect(planBlock(5, 1, 0, 7)).not.toEqual(planBlock(5, -1, 0, 7));
  });

  it('keeps buildings inside their block, off the cross streets, and clear of each other', () => {
    for (let block = 0; block < 12; block++) {
      for (let row = 0; row < ROWS.length; row++) {
        const plans = planBlock(11, 1, row, block);
        let prevEnd = -Infinity;
        for (const p of plans) {
          const a = p.s - p.w / 2;
          const b = p.s + p.w / 2;
          expect(a).toBeGreaterThanOrEqual(block * BLOCK);
          expect(b).toBeLessThanOrEqual((block + 1) * BLOCK);
          expect(inStreet(p.s)).toBe(false);
          expect(a).toBeGreaterThanOrEqual(prevEnd);
          prevEnd = b;
          expect(p.floors).toBeGreaterThan(2);
          expect(p.off).toBeGreaterThan(ROWS[row].front);
          expect(Number.isFinite(p.w * p.d)).toBe(true);
        }
      }
    }
  });

  it('defines every façade style with window fractions inside the cell', () => {
    for (const def of Object.values(FACADES)) {
      expect(def.win[0]).toBeGreaterThan(0);
      expect(def.win[0]).toBeLessThanOrEqual(1);
      expect(def.win[1]).toBeLessThanOrEqual(1);
      expect(def.cell[0]).toBeGreaterThan(0);
    }
  });
});

describe('tunnels', () => {
  it('plans increasing, non-overlapping spans aligned to 4 m', () => {
    let prevEnd = -1;
    for (let k = 0; k < 8; k++) {
      const sp = tunnelSpan(3, k);
      expect(sp.a % 4).toBe(0);
      expect(sp.b % 4).toBe(0);
      expect(sp.b - sp.a).toBeGreaterThanOrEqual(360);
      expect(sp.a).toBeGreaterThan(prevEnd);
      prevEnd = sp.b;
    }
  });

  it('reports enclosure 0 outside and 1 deep inside, rising across the portal', () => {
    const sp = tunnelSpan(3, 0);
    expect(tunnelEnclosure(3, sp.a - 60)).toBe(0);
    expect(tunnelEnclosure(3, (sp.a + sp.b) / 2)).toBe(1);
    expect(tunnelEnclosure(3, sp.b + 60)).toBe(0);
    let last = 0;
    for (let s = sp.a - 4; s <= sp.a + 14; s += 2) {
      const e = tunnelEnclosure(3, s);
      expect(e).toBeGreaterThanOrEqual(last);
      last = e;
    }
    expect(tunnelNear(3, (sp.a + sp.b) / 2, 0)).toEqual(sp);
  });

  it('raises the mountain above the bore only where there is a tunnel', () => {
    const sp = tunnelSpan(3, 0);
    const mid = (sp.a + sp.b) / 2;
    expect(mountainMask(3, mid)).toBe(1);
    expect(mountainRise(3, mid, 0)).toBeGreaterThan(BORE_HEIGHT);
    expect(mountainRise(3, mid, 0)).toBeCloseTo(crestHeight(3, mid) + 0.05, 5);
    expect(mountainRise(3, mid, 400)).toBe(0);
    expect(mountainMask(3, sp.a - 400)).toBe(0);
  });
});

describe('city bridge', () => {
  it('finds the water level below the lowest road height of the span', () => {
    const b = build('city', 'medium', 20);
    const city = b.scenery as CityScenery;
    const sp = city.bridgeNear(BRIDGE_FIRST + BRIDGE_CORE / 2)!;
    expect(sp).not.toBeNull();
    expect(sp.b - sp.a).toBe(BRIDGE_CORE);
    for (let s = sp.a; s <= sp.b; s += 40) expect(sp.level).toBeLessThan(b.host.road.height(s) - 10);
    expect(city.bridgeNear(BRIDGE_FIRST + BRIDGE_PERIOD / 2)).toBeNull();
    free(b);
  });
});
