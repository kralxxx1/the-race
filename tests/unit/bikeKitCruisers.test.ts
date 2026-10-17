import { describe, expect, it } from 'vitest';
import { getBike } from '../../src/data/bikes';
import { assembleBike } from '../../src/render/bike/assemble';
import { blueprintFor, hasAuthoredBlueprint } from '../../src/render/bike/blueprints';
import { computeHardpoints, measuredTrail } from '../../src/render/bike/hardpoints';
import { kitQuality } from '../../src/render/bike/quality';
import { parseTyre } from '../../src/render/bike/tyre';

/** Spec-sheet numbers of the cruiser family (family-cruisers*.ts). */
const SPECS: Record<string, { wheelbase: number; rake: number; trail: number; seat: number; front: string; rear: string; rim: [number, number]; fork: string; frame: string }> = {
  'honda-rebel-500': { wheelbase: 1.485, rake: 28, trail: 0.11, seat: 0.69, front: '130/90-16', rear: '150/80-16', rim: [16, 16], fork: 'rwu', frame: 'cradle' },
  'yamaha-vmax': { wheelbase: 1.7, rake: 31, trail: 0.113, seat: 0.775, front: '120/70R18', rear: '200/50R18', rim: [18, 18], fork: 'usd', frame: 'twinSpar' },
  'bmw-r18': { wheelbase: 1.731, rake: 32.7, trail: 0.118, seat: 0.69, front: '120/70R19', rear: '180/65B16', rim: [19, 16], fork: 'rwu', frame: 'cradle' },
  'triumph-rocket3': { wheelbase: 1.677, rake: 29, trail: 0.134, seat: 0.773, front: '150/80R17', rear: '240/50R16', rim: [17, 16], fork: 'usd', frame: 'twinSpar' },
  'harley-fat-boy': { wheelbase: 1.615, rake: 30, trail: 0.117, seat: 0.675, front: '160/70B17', rear: '240/40R18', rim: [17, 18], fork: 'rwu', frame: 'cradle' },
  'indian-chief': { wheelbase: 1.626, rake: 29, trail: 0.13, seat: 0.665, front: '130/90B16', rear: '180/65B16', rim: [16, 16], fork: 'rwu', frame: 'cradle' },
};

describe('cruiser family blueprints', () => {
  for (const [id, s] of Object.entries(SPECS)) {
    it(`${id} is authored and matches its spec sheet`, () => {
      expect(hasAuthoredBlueprint(id)).toBe(true);
      const bp = blueprintFor(getBike(id));
      expect(bp.source).toBe('authored');
      expect(bp.wheelbase).toBeCloseTo(s.wheelbase, 3);
      expect(bp.rakeDeg).toBeCloseTo(s.rake, 2);
      expect(bp.trail).toBeCloseTo(s.trail, 3);
      expect(bp.seat.height).toBeCloseTo(s.seat, 3);
      expect(bp.front.tyre).toBe(s.front);
      expect(bp.rear.tyre).toBe(s.rear);
      expect(parseTyre(bp.front.tyre)!.rimInch).toBe(s.rim[0]);
      expect(parseTyre(bp.rear.tyre)!.rimInch).toBe(s.rim[1]);
      expect(bp.fork.type).toBe(s.fork);
      expect(bp.frame.type).toBe(s.frame);
      // The derived steering axis reproduces the published trail.
      expect(measuredTrail(computeHardpoints(bp))).toBeCloseTo(s.trail, 3);
    });

    it(`${id} builds every livery without warnings and within budget`, () => {
      const spec = getBike(id);
      for (let li = 0; li < spec.liveries.length; li++) {
        const b = assembleBike(spec, li, kitQuality('high', 0));
        expect(b.warnings, `${id} livery ${li}`).toEqual([]);
        let calls = 0;
        for (const m of b.geoms.values()) calls += m.size;
        expect(calls, `${id} draw calls`).toBeLessThan(60);
        expect(b.stats.triangles, `${id} triangles`).toBeGreaterThan(120000);
        expect(b.stats.triangles, `${id} triangles`).toBeLessThan(450000);
      }
    }, 120000);
  }

  it('the family has distinctive silhouettes (no two share tyres + wheelbase)', () => {
    const seen = new Set<string>();
    for (const id of Object.keys(SPECS)) {
      const bp = blueprintFor(getBike(id));
      const key = `${bp.wheelbase}|${bp.front.tyre}|${bp.rear.tyre}`;
      expect(seen.has(key), id).toBe(false);
      seen.add(key);
    }
  });
});
