import { describe, expect, it } from 'vitest';
import { getBike } from '../../src/data/bikes';
import { assembleBike } from '../../src/render/bike/assemble';
import { authoredIds, blueprintFor } from '../../src/render/bike/blueprints';
import { computeHardpoints, measuredTrail } from '../../src/render/bike/hardpoints';
import { kitQuality } from '../../src/render/bike/quality';

/** Spec-sheet numbers of the European naked family 2: Triumph triples, MV Agusta Brutale, Husqvarna Svartpilen. */
const SPECS: Record<string, { wheelbase: number; rake: number; trail: number; seat: number; front: string; rear: string; swingarm: string }> = {
  'triumph-speed-triple': { wheelbase: 1.455, rake: 23.5, trail: 0.093, seat: 0.83, front: '120/70ZR17', rear: '190/55ZR17', swingarm: 'singleSided' },
  'triumph-street-triple': { wheelbase: 1.399, rake: 23.9, trail: 0.0983, seat: 0.825, front: '120/70ZR17', rear: '180/55ZR17', swingarm: 'box' },
  'mv-agusta-brutale-1000-rr': { wheelbase: 1.415, rake: 24.0, trail: 0.102, seat: 0.845, front: '120/70ZR17', rear: '200/55ZR17', swingarm: 'singleSided' },
  'husqvarna-svartpilen-401': { wheelbase: 1.357, rake: 25.0, trail: 0.098, seat: 0.835, front: '110/70R17', rear: '150/60R17', swingarm: 'box' },
};

describe('European naked family 2 blueprints', () => {
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
      expect(bp.swingarm.type).toBe(s.swingarm);
      const hp = computeHardpoints(bp);
      expect(measuredTrail(hp)).toBeCloseTo(s.trail, 3);
      // Naked bikes: the top clamp sits around 0.88–1.0 m and the grips a little above it.
      expect(hp.head[1]).toBeGreaterThan(0.86);
      expect(hp.head[1]).toBeLessThan(1.0);
      expect(bp.cockpit.grip[1]).toBeGreaterThan(hp.head[1] - 0.02);
      expect(bp.cockpit.grip[1]).toBeLessThan(1.15);
    });

    it(`${id} builds at high detail within the triangle and draw-call budget`, () => {
      const hi = assembleBike(getBike(id), 0, kitQuality('high', 0));
      expect(hi.warnings).toEqual([]);
      expect(hi.stats.triangles).toBeGreaterThan(90000);
      expect(hi.stats.triangles).toBeLessThan(420000);
      let calls = 0;
      for (const m of hi.geoms.values()) calls += m.size;
      expect(calls).toBeLessThan(60);
      const lo = assembleBike(getBike(id), 0, kitQuality('high', 1));
      expect(lo.warnings).toEqual([]);
      expect(lo.stats.triangles).toBeLessThan(hi.stats.triangles * 0.45);
    }, 60000);

    it(`${id} builds every livery`, () => {
      const spec = getBike(id);
      for (let i = 0; i < spec.liveries.length; i++) {
        const r = assembleBike(spec, i, kitQuality('low', 1));
        expect(r.warnings).toEqual([]);
      }
    }, 60000);
  }

  it('the Triumph triples and the Brutale carry three / four headers and their signature silencers', () => {
    expect(blueprintFor(getBike('triumph-speed-triple')).engine.layout).toBe('I3');
    expect(blueprintFor(getBike('triumph-street-triple')).engine.layout).toBe('I3');
    expect(blueprintFor(getBike('mv-agusta-brutale-1000-rr')).engine.layout).toBe('I4');
    expect(blueprintFor(getBike('husqvarna-svartpilen-401')).engine.layout).toBe('SINGLE');
    // Single-sided swingarms on the left (chain side) for the Speed Triple and the Brutale.
    for (const id of ['triumph-speed-triple', 'mv-agusta-brutale-1000-rr']) {
      const sw = blueprintFor(getBike(id)).swingarm;
      expect(sw.type).toBe('singleSided');
      expect(sw.side).toBe('left');
    }
  });
});
