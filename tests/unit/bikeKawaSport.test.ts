import { describe, expect, it } from 'vitest';
import { getBike } from '../../src/data/bikes';
import { assembleBike } from '../../src/render/bike/assemble';
import { authoredIds, blueprintFor } from '../../src/render/bike/blueprints';
import { computeHardpoints } from '../../src/render/bike/hardpoints';
import { kitQuality } from '../../src/render/bike/quality';

/** Spec-sheet numbers of the Kawasaki supersport family + KTM RC 390 blueprints. */
const SPECS: Record<string, { wheelbase: number; rake: number; trail: number; seat: number; front: string; rear: string }> = {
  'kawasaki-h2r': { wheelbase: 1.45, rake: 25.1, trail: 0.108, seat: 0.83, front: '120/70ZR17', rear: '190/55ZR17' },
  'kawasaki-zx10r': { wheelbase: 1.45, rake: 25.0, trail: 0.107, seat: 0.835, front: '120/70ZR17', rear: '190/55ZR17' },
  'kawasaki-zx6r': { wheelbase: 1.4, rake: 23.5, trail: 0.101, seat: 0.83, front: '120/70ZR17', rear: '180/55ZR17' },
  'kawasaki-zx4rr': { wheelbase: 1.38, rake: 23.5, trail: 0.097, seat: 0.8, front: '120/70ZR17', rear: '160/60ZR17' },
};

describe('Kawasaki sport family blueprints', () => {
  for (const [id, s] of Object.entries(SPECS)) {
    it(`${id} is authored and matches its spec sheet`, () => {
      expect(authoredIds()).toContain(id);
      const bp = blueprintFor(getBike(id));
      expect(bp.source).toBe('authored');
      expect(bp.wheelbase).toBeCloseTo(s.wheelbase, 3);
      expect(bp.rakeDeg).toBeCloseTo(s.rake, 2);
      expect(bp.trail).toBeCloseTo(s.trail, 3);
      expect(bp.seat.height).toBeCloseTo(s.seat, 3);
      expect(bp.front.tyre).toBe(s.front);
      expect(bp.rear.tyre).toBe(s.rear);
      // Top clamp of a sport bike sits around 0.88–1.0 m.
      const hp = computeHardpoints(bp);
      expect(hp.head[1]).toBeGreaterThan(0.86);
      expect(hp.head[1]).toBeLessThan(1.0);
    });

    it(`${id} builds at high detail within the triangle and draw-call budget`, () => {
      const hi = assembleBike(getBike(id), 0, kitQuality('high', 0));
      expect(hi.warnings).toEqual([]);
      expect(hi.stats.triangles).toBeGreaterThan(120000);
      expect(hi.stats.triangles).toBeLessThan(420000);
      let calls = 0;
      for (const m of hi.geoms.values()) calls += m.size;
      expect(calls).toBeLessThan(60);
      const lo = assembleBike(getBike(id), 0, kitQuality('high', 1));
      expect(lo.warnings).toEqual([]);
      expect(lo.stats.triangles).toBeLessThan(hi.stats.triangles * 0.45);
    }, 60000);
  }

  it('the H2R is the track-only bike: no mirrors, no lights, slicks, megaphone', () => {
    const bp = blueprintFor(getBike('kawasaki-h2r'));
    expect(bp.cockpit.mirrors).toBe('none');
    expect(bp.front.tread).toBe('slickish');
    expect(bp.exhaust.can).toBe('megaphone');
    expect(bp.engine.supercharger).toBe(true);
    expect(bp.swingarm.type).toBe('singleSided');
  });
});
