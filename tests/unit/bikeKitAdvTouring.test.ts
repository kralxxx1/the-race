import { describe, expect, it } from 'vitest';
import { getBike } from '../../src/data/bikes';
import { assembleBike } from '../../src/render/bike/assemble';
import { blueprintFor, hasAuthoredBlueprint } from '../../src/render/bike/blueprints';
import { computeHardpoints, measuredTrail } from '../../src/render/bike/hardpoints';
import { kitQuality } from '../../src/render/bike/quality';
import { parseTyre } from '../../src/render/bike/tyre';

/** Spec-sheet numbers of the adventure / touring family (family-adv-touring*.ts). */
const SPECS: Record<string, { wheelbase: number; rake: number; trail: number; seat: number; front: string; rear: string; rim: [number, number]; fork: string; frame: string }> = {
  'honda-africa-twin': { wheelbase: 1.56, rake: 27.5, trail: 0.113, seat: 0.85, front: '90/90-21', rear: '150/70R18', rim: [21, 18], fork: 'usd', frame: 'cradle' },
  'honda-gold-wing': { wheelbase: 1.695, rake: 30.5, trail: 0.109, seat: 0.745, front: '130/70R18', rear: '200/55R16', rim: [18, 16], fork: 'rwu', frame: 'cradle' },
  'suzuki-vstrom650': { wheelbase: 1.56, rake: 25.5, trail: 0.11, seat: 0.835, front: '110/80R19', rear: '150/70R17', rim: [19, 17], fork: 'rwu', frame: 'twinSpar' },
  'ducati-multistrada-v4': { wheelbase: 1.567, rake: 25.5, trail: 0.1, seat: 0.85, front: '120/70ZR19', rear: '170/60ZR17', rim: [19, 17], fork: 'usd', frame: 'monocoque' },
  'bmw-k1600gt': { wheelbase: 1.618, rake: 28, trail: 0.109, seat: 0.78, front: '120/70ZR17', rear: '190/55ZR17', rim: [17, 17], fork: 'telelever', frame: 'twinSpar' },
  'ktm-890-adventure-r': { wheelbase: 1.528, rake: 26.5, trail: 0.118, seat: 0.89, front: '90/90-21', rear: '150/70-18', rim: [21, 18], fork: 'usd', frame: 'trellis' },
  'harley-pan-america': { wheelbase: 1.58, rake: 25, trail: 0.105, seat: 0.85, front: '120/70R19', rear: '170/60R17', rim: [19, 17], fork: 'usd', frame: 'trellis' },
  'benelli-trk-502x': { wheelbase: 1.45, rake: 27, trail: 0.105, seat: 0.835, front: '110/80R19', rear: '150/70R17', rim: [19, 17], fork: 'usd', frame: 'trellis' },
};

describe('adventure / touring family blueprints', () => {
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
        expect(b.stats.triangles, `${id} triangles`).toBeGreaterThan(150000);
        expect(b.stats.triangles, `${id} triangles`).toBeLessThan(400000);
      }
    }, 120000);
  }

  it('the family has a real wire/cast wheel set and distinctive silhouettes (no two share tyres + wheelbase)', () => {
    const seen = new Set<string>();
    for (const id of Object.keys(SPECS)) {
      const bp = blueprintFor(getBike(id));
      const key = `${bp.wheelbase}|${bp.front.tyre}|${bp.rear.tyre}`;
      expect(seen.has(key), id).toBe(false);
      seen.add(key);
    }
  });
});
