import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BIKES, getBike } from '../../src/data/bikes';
import { acquireBike, assembleBike, bikeCacheStats, purgeBikeCache, releaseBike, type BikeBuild } from '../../src/render/bike/assemble';
import { BIKE_SETTINGS, bikeDetailFrom } from '../../src/render/bike/bikeSettings';
import { authoredIds, blueprintFor } from '../../src/render/bike/blueprints';
import { computeHardpoints, measuredTrail } from '../../src/render/bike/hardpoints';
import { kitQuality } from '../../src/render/bike/quality';
import { parseTyre, VALID_RIMS } from '../../src/render/bike/tyre';
import { BikeModel } from '../../src/render/bikeModel';
import { Materials } from '../../src/render/materials';
import { QUALITY_PRESETS } from '../../src/settings/schema';

const inRange = (v: number, lo: number, hi: number) => v >= lo && v <= hi;

describe('bike blueprints (all bikes)', () => {
  it('covers every bike in the catalogue and the showcase bikes are authored', () => {
    expect(BIKES.length).toBeGreaterThanOrEqual(60);
    for (const id of ['yamaha-r1', 'ducati-panigale-v4s']) expect(authoredIds()).toContain(id);
  });

  for (const spec of BIKES) {
    it(`${spec.id}: real-world dimensions and valid wheel/tyre sizes`, () => {
      const bp = blueprintFor(spec);
      expect(bp.id).toBe(spec.id);
      const scooter = spec.style === 'scooter';
      expect(inRange(bp.wheelbase, scooter ? 1.25 : 1.3, 1.85)).toBe(true);
      expect(inRange(bp.rakeDeg, 20, 35)).toBe(true);
      expect(inRange(bp.trail, 0.06, 0.16)).toBe(true);
      expect(inRange(bp.seat.height, 0.6, 0.93)).toBe(true);
      for (const end of [bp.front, bp.rear]) {
        const t = parseTyre(end.tyre);
        expect(t, `${spec.id} tyre ${end.tyre}`).not.toBeNull();
        expect(VALID_RIMS).toContain(t!.rimInch);
        expect(inRange(end.rimWidthIn, 2, 8.5)).toBe(true);
        // Tyre wider than the rim, but not absurdly (≈ rim width + 20…70 %).
        const rimW = end.rimWidthIn * 0.0254;
        expect(t!.width).toBeGreaterThan(rimW * 0.95);
        expect(t!.width).toBeLessThan(rimW * 1.9);
      }
      const hp = computeHardpoints(bp);
      // Wheel radii of real motorcycles (scooters 12–13", tourers up to 21" fronts).
      expect(inRange(hp.Rf, scooter ? 0.22 : 0.27, 0.37)).toBe(true);
      expect(inRange(hp.Rr, scooter ? 0.22 : 0.27, 0.37)).toBe(true);
      // The derived steering geometry reproduces the spec-sheet trail.
      expect(Math.abs(measuredTrail(hp) - bp.trail)).toBeLessThan(1e-6);
      expect(inRange(hp.offset, scooter ? -0.05 : -0.02, 0.09)).toBe(true);
      // Pivot ahead of the rear axle, head ahead of the pivot, grips near the head.
      expect(hp.pivot[2]).toBeLessThan(-0.35);
      expect(hp.head[2]).toBeLessThan(hp.pivot[2]);
      expect(inRange(hp.head[1], 0.6, 1.15)).toBe(true);
      expect(Math.hypot(hp.grip[1] - hp.head[1], hp.grip[2] - hp.head[2])).toBeLessThan(0.45);
      expect(inRange(Math.abs(hp.grip[0]), 0.2, 0.5)).toBe(true);
      if (bp.overall) {
        expect(inRange(bp.overall[0], 1.7, 2.7)).toBe(true);
        expect(inRange(bp.overall[2], 1.0, 1.6)).toBe(true);
      }
    });
  }

  it('showcase bikes match their spec sheets', () => {
    const r1 = blueprintFor(getBike('yamaha-r1'));
    expect(r1.wheelbase).toBeCloseTo(1.405, 3);
    expect(r1.rakeDeg).toBe(24);
    expect(r1.front.tyre).toBe('120/70ZR17');
    expect(r1.rear.tyre).toBe('190/55ZR17');
    expect(r1.seat.height).toBeCloseTo(0.855, 3);
    const pv4 = blueprintFor(getBike('ducati-panigale-v4s'));
    expect(pv4.wheelbase).toBeCloseTo(1.485, 3);
    expect(pv4.rear.tyre).toBe('200/60ZR17');
    expect(pv4.swingarm.type).toBe('singleSided');
    expect(pv4.frontWheel.spokes).toBe(3);
    expect(pv4.exhaust.route).toBe('underbelly');
  });
});

/** Every finite, bounded, unit normals; returns the triangle count. */
function checkBuild(b: BikeBuild): number {
  let tris = 0;
  for (const [group, slots] of b.geoms) {
    for (const [slot, g] of slots) {
      const p = g.getAttribute('position');
      const n = g.getAttribute('normal');
      expect(p.count, `${group}:${slot}`).toBeGreaterThan(0);
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        if (!Number.isFinite(x + y + z)) throw new Error(`${b.spec.id} ${group}:${slot} NaN position at ${i}`);
        // Group-local coordinates stay within a 3 m box around the group origin.
        if (Math.abs(x) > 1.5 || Math.abs(y) > 2 || Math.abs(z) > 3) throw new Error(`${b.spec.id} ${group}:${slot} vertex out of bounds ${x},${y},${z}`);
        const l = Math.hypot(n.getX(i), n.getY(i), n.getZ(i));
        if (!(l > 0.98 && l < 1.02)) throw new Error(`${b.spec.id} ${group}:${slot} normal length ${l} at ${i}`);
      }
      const idx = g.getIndex();
      expect(idx).not.toBeNull();
      for (let i = 0; i < idx!.count; i++) if (idx!.getX(i) >= p.count) throw new Error(`${b.spec.id} ${group}:${slot} index out of range`);
      tris += idx!.count / 3;
    }
  }
  return tris;
}

describe('bike kit geometry', () => {
  it('every bike builds at LOD1 without warnings, NaNs or stray vertices', () => {
    for (const spec of BIKES) {
      const b = assembleBike(spec, 0, kitQuality('low', 1));
      expect(b.warnings, spec.id).toEqual([]);
      const tris = checkBuild(b);
      expect(tris, spec.id).toBeGreaterThan(15000);
      expect(tris, spec.id).toBeLessThan(120000);
    }
  }, 240000);

  it('showcase bikes meet the LOD0 triangle budget and stay under 60 draw calls', () => {
    for (const id of ['yamaha-r1', 'ducati-panigale-v4s']) {
      const hi = assembleBike(getBike(id), 0, kitQuality('high', 0));
      expect(hi.warnings).toEqual([]);
      const tris = checkBuild(hi);
      expect(tris).toBeGreaterThanOrEqual(250000);
      let calls = 0;
      for (const m of hi.geoms.values()) calls += m.size;
      expect(calls).toBeLessThan(60);
      const lo = assembleBike(getBike(id), 0, kitQuality('high', 1));
      expect(lo.stats.triangles).toBeLessThan(tris * 0.4);
    }
  }, 120000);

  it('detail levels scale the triangle count monotonically', () => {
    const spec = getBike('kawasaki-z900');
    let prev = 0;
    for (const d of ['low', 'medium', 'high', 'ultra'] as const) {
      const t = assembleBike(spec, 0, kitQuality(d, 0)).stats.triangles;
      expect(t).toBeGreaterThan(prev);
      prev = t;
    }
  }, 120000);

  it('builds are deterministic', () => {
    const a = assembleBike(getBike('ducati-panigale-v4s'), 0, kitQuality('medium', 0));
    const b = assembleBike(getBike('ducati-panigale-v4s'), 0, kitQuality('medium', 0));
    for (const [group, slots] of a.geoms) {
      for (const [slot, g] of slots) {
        const h = b.geoms.get(group)!.get(slot)!;
        const pa = g.getAttribute('position').array, pb = h.getAttribute('position').array;
        expect(pb.length).toBe(pa.length);
        let diff = 0;
        for (let i = 0; i < pa.length; i++) diff = Math.max(diff, Math.abs(pa[i] - pb[i]));
        expect(diff).toBe(0);
      }
    }
  }, 60000);
});

describe('bike cache and BikeModel lifecycle', () => {
  it('shares builds between instances and disposes every GPU resource when released', () => {
    purgeBikeCache(0);
    const spec = getBike('yamaha-r1');
    const disposed = new Set<unknown>();
    const a = acquireBike(spec, 0, 'low', 1);
    const b = acquireBike(spec, 0, 'low', 1);
    expect(b).toBe(a);
    expect(bikeCacheStats().live).toBe(1);
    const resources: { addEventListener(t: 'dispose', f: () => void): void }[] = [];
    for (const m of a.geoms.values()) for (const g of m.values()) resources.push(g);
    for (const [k, m] of a.materials) if (k !== 'hard') resources.push(m);
    for (const t of a.textures) resources.push(t);
    for (const r of resources) r.addEventListener('dispose', () => disposed.add(r));
    releaseBike(a);
    expect(disposed.size).toBe(0);
    releaseBike(b);
    // With an idle pool of 0 the build is disposed as soon as the last user lets go.
    expect(disposed.size).toBe(resources.length);
    expect(bikeCacheStats()).toEqual({ live: 0, idle: 0 });
    purgeBikeCache(2);
  }, 60000);

  it('BikeModel exposes the facade API and cleans up on dispose', () => {
    purgeBikeCache(0);
    const bike = new BikeModel(getBike('ducati-panigale-v4s'), 0, new Materials(), { detail: 'low', lod: 1 });
    expect(bike.stats.drawCalls).toBeGreaterThan(5);
    expect(bike.stats.drawCalls).toBeLessThan(60);
    expect(bike.frame.L).toBeCloseTo(1.485, 3);
    expect(bike.mirrors.left).not.toBeNull();
    expect(bike.mirrors.right).not.toBeNull();
    // Animate: steer, lean, spin, suspension.
    bike.update({ lean: 0.5, pitch: 0, steer: 0.2, wheelSpeed: 80, frontComp: 0.03, rearComp: 0.02, brake: 1, headlight: true, dt: 1 / 60 });
    bike.updateDash(0.7, 4, 182, true, 'kmh');
    bike.root.updateMatrixWorld(true);
    const grip = new THREE.Vector3();
    bike.gripR.getWorldPosition(grip);
    expect(Number.isFinite(grip.x + grip.y + grip.z)).toBe(true);
    let meshes = 0;
    bike.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes++;
    });
    expect(meshes).toBe(bike.stats.drawCalls);
    bike.dispose();
    meshes = 0;
    bike.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes++;
    });
    expect(meshes).toBe(0);
    expect(bikeCacheStats().live).toBe(0);
    purgeBikeCache(2);
  }, 60000);
});

describe('bike settings', () => {
  it('gfx.bikeDetail has a value for every quality preset and maps to kit detail levels', () => {
    const def = BIKE_SETTINGS.find((d) => d.key === 'gfx.bikeDetail');
    expect(def?.type).toBe('select');
    if (def?.type !== 'select') return;
    for (const p of QUALITY_PRESETS) expect(def.presets?.[p]).toBeDefined();
    expect(bikeDetailFrom({ str: () => 'ultra' })).toBe('ultra');
    expect(bikeDetailFrom({ str: () => 'bogus' })).toBe('high');
    expect(bikeDetailFrom(null)).toBe('high');
  });
});
