import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { VEHICLE_KINDS, VEHICLES, PAINTS } from '../../src/data/vehicles';
import { Fleet, newLampState } from '../../src/render/vehicle/fleet';
import { LAMP } from '../../src/render/vehicle/kit';
import { clearVehicleGeometryCache, vehicleGeometry } from '../../src/render/vehicle/models';
import { plateLocal } from '../../src/render/vehicle/plates';
import { wheelGeometry } from '../../src/render/vehicle/wheels';

function boxOf(set: ReturnType<typeof vehicleGeometry>, lod: 0 | 1): THREE.Box3 {
  const box = new THREE.Box3();
  const l = set.lod[lod];
  for (const g of [l.paint, l.detail, l.glass, l.lamp]) if (g) box.union(g.boundingBox!);
  return box;
}

describe('traffic vehicle models', () => {
  it.each(VEHICLE_KINDS)('%s: sane bounds, budgets and anchors', (kind) => {
    const set = vehicleGeometry(kind);
    const a = VEHICLES[kind];
    const lod0 = set.lod[0];
    const lod1 = set.lod[1];
    expect(lod0.paint, 'paint').toBeDefined();
    expect(lod0.detail, 'detail').toBeDefined();
    expect(lod0.lamp, 'lamp').toBeDefined();
    const box = boxOf(set, 0);
    expect(box.max.z - box.min.z).toBeGreaterThan(a.length * 0.94);
    expect(box.max.z - box.min.z).toBeLessThan(a.length * 1.08);
    expect(box.max.x - box.min.x).toBeGreaterThan(a.width * 0.9);
    expect(box.max.x - box.min.x).toBeLessThan(a.width * 1.3);
    expect(box.min.y).toBeGreaterThanOrEqual(-0.01);
    expect(box.max.y).toBeGreaterThan(a.height * 0.9);
    expect(box.max.y).toBeLessThan(a.height * 1.22);
    // Left / right symmetry of the whole model (mirrors, lamps and plates are placed symmetrically).
    expect(Math.abs(box.min.x + box.max.x)).toBeLessThan(0.08);
    // Triangle budgets: LOD0 stays below a few tens of thousands, LOD1 is a cheap far impostor.
    expect(lod0.tris).toBeLessThan(26000);
    expect(lod0.tris).toBeGreaterThan(1500);
    expect(lod1.tris).toBeLessThan(4200);
    expect(lod1.tris).toBeLessThan(lod0.tris * 0.6);
    // Wheels: pairs on both sides, resting on the road, steered pair at the front.
    expect(set.wheels.length).toBeGreaterThanOrEqual(4);
    expect(set.wheels.length % 2).toBe(0);
    for (const w of set.wheels) {
      expect(w.y).toBeCloseTo(w.r, 3);
      expect(w.r).toBeGreaterThan(0.25);
      expect(w.r).toBeLessThan(0.6);
      expect(set.wheels.some((o) => Math.abs(o.x + w.x) < 1e-4 && Math.abs(o.z - w.z) < 1e-4)).toBe(true);
    }
    expect(set.wheels.filter((w) => w.steer).length).toBe(2);
    // Plates front and rear, lamps and indicators on both sides.
    expect(set.plates.filter((p) => p.face === -1).length).toBe(1);
    expect(set.plates.filter((p) => p.face === 1).length).toBe(1);
    expect(set.headGlow.length).toBeGreaterThanOrEqual(2);
    expect(set.tailGlow.length).toBeGreaterThanOrEqual(2);
    expect(set.indicatorGlowL.length).toBeGreaterThanOrEqual(1);
    expect(set.indicatorGlowR.length).toBeGreaterThanOrEqual(1);
    expect(set.hasBeacon).toBe(kind === 'police' || kind === 'ambulance');
  });

  it.each(VEHICLE_KINDS)('%s: finite vertex data with unit normals and valid lamp channels', (kind) => {
    const set = vehicleGeometry(kind);
    for (const lod of [0, 1] as const) {
      for (const g of [set.lod[lod].paint, set.lod[lod].detail, set.lod[lod].glass, set.lod[lod].lamp]) {
        if (!g) continue;
        const p = g.attributes.position as THREE.BufferAttribute;
        const n = g.attributes.normal as THREE.BufferAttribute;
        for (let i = 0; i < p.count; i += 7) {
          expect(Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i))).toBe(true);
          const l = Math.hypot(n.getX(i), n.getY(i), n.getZ(i));
          expect(l).toBeGreaterThan(0.5);
          expect(l).toBeLessThan(1.5);
        }
        const ch = g.attributes.lampCh as THREE.BufferAttribute | undefined;
        if (ch) for (let i = 0; i < ch.count; i += 5) expect(ch.getX(i)).toBeLessThanOrEqual(LAMP.aux);
      }
    }
  });

  it('shares one geometry set per kind and rebuilds after the cache is cleared', () => {
    const a = vehicleGeometry('sedan');
    expect(vehicleGeometry('sedan')).toBe(a);
    clearVehicleGeometryCache();
    expect(vehicleGeometry('sedan')).not.toBe(a);
  });

  it('plate anchors face outwards', () => {
    const set = vehicleGeometry('sedan');
    const m = new THREE.Matrix4();
    for (const p of set.plates) {
      plateLocal(p, m);
      // The quad's +z (its visible side) must look along the vehicle's own axis: +z for the rear plate, -z for the front.
      const n = new THREE.Vector3(0, 0, 1).transformDirection(m);
      expect(Math.sign(n.z)).toBe(p.face);
    }
  });

  it('unit wheels have tread, rim and a sane triangle count', () => {
    for (const t of ['car', 'truck', 'far'] as const) {
      const g = wheelGeometry(t);
      const tris = g.attributes.position.count / 3;
      expect(tris).toBeGreaterThan(100);
      expect(tris).toBeLessThan(9000);
      g.computeBoundingBox();
      expect(g.boundingBox!.max.y).toBeCloseTo(1, 1);
    }
  });

  it('paint palette is mostly white, grey and black like real traffic', () => {
    const total = PAINTS.reduce((s, p) => s + p.weight, 0);
    const neutral = PAINTS.filter((p) => ['#eceeef', '#bfc3c8', '#8d9298', '#4a4e55', '#17181b'].includes(p.color)).reduce((s, p) => s + p.weight, 0);
    expect(neutral / total).toBeGreaterThan(0.6);
    expect(PAINTS.some((p) => p.color === '#9a1d1f')).toBe(true);
    expect(PAINTS.some((p) => p.color === '#1f3f7a')).toBe(true);
  });
});

describe('fleet instancing', () => {
  it('draws one instanced mesh per material slot and lets cars be added and reset', () => {
    const fleet = new Fleet();
    const lamps = newLampState();
    const m = new THREE.Matrix4();
    const c = new THREE.Color('#ffffff');
    fleet.begin();
    for (let i = 0; i < 5; i++) expect(fleet.bucket('sedan', 0).push(m.makeTranslation(i * 3, 0, 0), c, 0.5, 0.1, 0, lamps)).toBe(true);
    fleet.bucket('semi', 1).push(m, c, 0.2, 0.2, 1, lamps);
    fleet.end();
    expect(fleet.stats.cars).toBe(6);
    expect(fleet.stats.tris).toBe(5 * vehicleGeometry('sedan').lod[0].tris + vehicleGeometry('semi').lod[1].tris);
    const sedan = fleet.bucket('sedan', 0);
    expect(sedan.meshes.length).toBeGreaterThanOrEqual(3);
    for (const mesh of sedan.meshes) expect(mesh.count).toBe(5);
    fleet.begin();
    fleet.end();
    for (const mesh of sedan.meshes) expect(mesh.visible).toBe(false);
    fleet.dispose();
  });

  it('refuses cars beyond a bucket capacity instead of overflowing', () => {
    const fleet = new Fleet();
    const b = fleet.bucket('ambulance', 0);
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    const lamps = newLampState();
    let ok = 0;
    for (let i = 0; i < b.cap + 5; i++) if (b.push(m, c, 0, 0, 0, lamps)) ok++;
    expect(ok).toBe(b.cap);
    fleet.dispose();
  });

  it('dispose removes every mesh and frees the per-bucket geometry views', () => {
    const fleet = new Fleet();
    fleet.prebuild();
    const parent = fleet.group;
    expect(parent.children.length).toBeGreaterThan(40);
    let disposed = 0;
    for (const mesh of fleet.bucket('sedan', 0).meshes) mesh.geometry.addEventListener('dispose', () => disposed++);
    fleet.dispose();
    expect(parent.children.length).toBe(0);
    expect(disposed).toBeGreaterThan(0);
  });
});
