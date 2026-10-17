import { describe, expect, it } from 'vitest';
import { VEHICLE_KINDS, VEHICLES } from '../../src/data/vehicles';
import { vehicleGeometry } from '../../src/render/vehicle/models';

describe('traffic vehicle models', () => {
  it.each(VEHICLE_KINDS)('%s builds with every slot and sane bounds', (kind) => {
    const set = vehicleGeometry(kind);
    const a = VEHICLES[kind];
    const lod0 = set.lod[0];
    const slots = Object.entries(lod0).filter(([k, v]) => k !== 'tris' && v);
    // eslint-disable-next-line no-console
    console.log(kind, 'tris', lod0.tris, set.lod[1].tris, slots.map(([k, v]) => `${k}:${(v as { attributes: { position: { count: number } } }).attributes.position.count / 3}`).join(' '));
    expect(lod0.paint).toBeDefined();
    expect(lod0.glass).toBeDefined();
    expect(lod0.lamp).toBeDefined();
    const box = lod0.paint!.boundingBox!;
    expect(box.max.z - box.min.z).toBeGreaterThan(a.length * 0.9);
    expect(box.max.z - box.min.z).toBeLessThan(a.length * 1.1);
  });
});
