import { describe, expect, it } from 'vitest';
import { getBike } from '../../src/data/bikes';
import { assembleBike } from '../../src/render/bike/assemble';
import { authoredIds, blueprintFor } from '../../src/render/bike/blueprints';
import { computeHardpoints } from '../../src/render/bike/hardpoints';
import { kitQuality } from '../../src/render/bike/quality';
import { parseTyre } from '../../src/render/bike/tyre';

/** European naked family "eu-naked-1" (blueprints/family-eu-naked-1*.ts): spec sheets, liveries and budgets. */
interface Sheet {
  wheelbase: number;
  rake: number;
  trail: number;
  seat: number;
  front: string;
  rear: string;
  swingarm: string;
  frame: string;
}

const SPEC: Record<string, Sheet> = {
  'ducati-streetfighter-v4': { wheelbase: 1.488, rake: 24.5, trail: 0.1, seat: 0.845, front: '120/70ZR17', rear: '200/60ZR17', swingarm: 'singleSided', frame: 'monocoque' },
  'ducati-monster': { wheelbase: 1.474, rake: 24, trail: 0.093, seat: 0.82, front: '120/70ZR17', rear: '180/55ZR17', swingarm: 'banana', frame: 'monocoque' },
  'ktm-1290-superduke-r': { wheelbase: 1.497, rake: 25.2, trail: 0.106, seat: 0.835, front: '120/70ZR17', rear: '200/55ZR17', swingarm: 'singleSided', frame: 'trellis' },
};

describe('European naked blueprints (eu-naked-1)', () => {
  for (const [id, s] of Object.entries(SPEC)) {
    it(`${id} is authored and matches its spec sheet`, () => {
      expect(authoredIds()).toContain(id);
      const bp = blueprintFor(getBike(id));
      expect(bp.source).toBe('authored');
      expect(bp.wheelbase).toBeCloseTo(s.wheelbase, 3);
      expect(bp.rakeDeg).toBeCloseTo(s.rake, 3);
      expect(bp.trail).toBeCloseTo(s.trail, 3);
      expect(bp.seat.height).toBeCloseTo(s.seat, 3);
      expect(bp.front.tyre).toBe(s.front);
      expect(bp.rear.tyre).toBe(s.rear);
      expect(bp.swingarm.type).toBe(s.swingarm);
      expect(bp.frame.type).toBe(s.frame);
      expect(parseTyre(bp.front.tyre)).not.toBeNull();
      const hp = computeHardpoints(bp);
      // Naked bikes: top clamp ~0.85–1.0 m up, grips above the clamp and behind the head.
      expect(hp.head[1]).toBeGreaterThan(0.82);
      expect(hp.head[1]).toBeLessThan(1.02);
      expect(hp.grip[1]).toBeGreaterThan(hp.head[1]);
      expect(hp.grip[2]).toBeGreaterThan(hp.head[2]);
      if (bp.overall) expect(hp.grip[1]).toBeLessThan(bp.overall[2]);
    });

    it(`${id} builds every livery cleanly within the LOD0 budget`, () => {
      const spec = getBike(id);
      for (let i = 0; i < spec.liveries.length; i++) {
        const b = assembleBike(spec, i, kitQuality('low', 1));
        expect(b.warnings, `${id} livery ${i}`).toEqual([]);
      }
      const hi = assembleBike(spec, 0, kitQuality('high', 0));
      expect(hi.warnings).toEqual([]);
      let calls = 0;
      for (const m of hi.geoms.values()) calls += m.size;
      expect(calls).toBeLessThan(60);
      expect(hi.stats.triangles).toBeGreaterThan(150000);
      expect(hi.stats.triangles).toBeLessThan(420000);
      const lo = assembleBike(spec, 0, kitQuality('high', 1));
      expect(lo.stats.triangles).toBeLessThan(hi.stats.triangles * 0.45);
    }, 60000);
  }
});
