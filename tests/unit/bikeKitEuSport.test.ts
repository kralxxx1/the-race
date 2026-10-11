import { describe, expect, it } from 'vitest';
import { getBike } from '../../src/data/bikes';
import { assembleBike } from '../../src/render/bike/assemble';
import { authoredIds, blueprintFor } from '../../src/render/bike/blueprints';
import { computeHardpoints } from '../../src/render/bike/hardpoints';
import { veePorts } from '../../src/render/bike/kit/eu-sport-exhaust';
import { moveOutline } from '../../src/render/bike/kit/eu-sport-parts';
import { curve } from '../../src/render/bike/kit/shape';
import { kitQuality } from '../../src/render/bike/quality';
import { parseTyre } from '../../src/render/bike/tyre';
import { KitContext } from '../../src/render/bike/context';

/** European sport-bike family (blueprints/family-eu-sport*.ts): spec sheets, signature hardware, liveries and budgets. */
const SPEC: Record<string, { wheelbase: number; rake: number; trail: number; seat: number; front: string; rear: string }> = {
  'ducati-panigale-v2': { wheelbase: 1.436, rake: 24, trail: 0.094, seat: 0.84, front: '120/70ZR17', rear: '180/60ZR17' },
  'aprilia-rsv4': { wheelbase: 1.436, rake: 24.6, trail: 0.1037, seat: 0.845, front: '120/70ZR17', rear: '200/55ZR17' },
  'aprilia-rs660': { wheelbase: 1.37, rake: 24.1, trail: 0.1047, seat: 0.82, front: '120/70ZR17', rear: '180/55ZR17' },
  'mv-agusta-f3-rr': { wheelbase: 1.38, rake: 23.5, trail: 0.1004, seat: 0.832, front: '120/70ZR17', rear: '180/55ZR17' },
  'bmw-m1000rr': { wheelbase: 1.457, rake: 23.6, trail: 0.099, seat: 0.832, front: '120/70ZR17', rear: '200/55ZR17' },
};

describe('European sport-bike blueprints', () => {
  for (const [id, s] of Object.entries(SPEC)) {
    it(`${id} is authored and matches its spec sheet`, () => {
      expect(authoredIds()).toContain(id);
      const bp = blueprintFor(getBike(id));
      expect(bp.source).toBe('authored');
      expect(bp.wheelbase).toBeCloseTo(s.wheelbase, 3);
      expect(bp.rakeDeg).toBeCloseTo(s.rake, 3);
      expect(bp.trail).toBeCloseTo(s.trail, 4);
      expect(bp.seat.height).toBeCloseTo(s.seat, 3);
      expect(bp.front.tyre).toBe(s.front);
      expect(bp.rear.tyre).toBe(s.rear);
      expect(parseTyre(bp.rear.tyre)).not.toBeNull();
      const hp = computeHardpoints(bp);
      expect(hp.head[1]).toBeGreaterThan(0.85);
      expect(hp.head[1]).toBeLessThan(1.0);
      if (bp.overall) expect(hp.grip[1]).toBeLessThan(bp.overall[2]);
    });

    it(`${id} builds every livery cleanly within the LOD0 budget`, () => {
      const spec = getBike(id);
      expect(spec.liveries.length).toBeGreaterThanOrEqual(2);
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
      expect(hi.stats.triangles).toBeLessThan(440000);
      const lo = assembleBike(spec, 0, kitQuality('high', 1));
      expect(lo.stats.triangles).toBeLessThan(hi.stats.triangles * 0.45);
    }, 60000);
  }

  it('signature hardware of each model', () => {
    const v2 = blueprintFor(getBike('ducati-panigale-v2'));
    expect(v2.engine.layout).toBe('L2');
    expect(v2.swingarm.type).toBe('singleSided');
    expect(v2.swingarm.side).toBe('left');
    const f3 = blueprintFor(getBike('mv-agusta-f3-rr'));
    expect(f3.frame.type).toBe('trellis');
    expect(f3.swingarm.type).toBe('singleSided');
    expect(f3.engine.layout).toBe('I3');
    // The organ-pipe silencer is built by the blueprint, not by the generic exhaust routes.
    expect(f3.exhaust.route).toBe('none');
    const rsv4 = blueprintFor(getBike('aprilia-rsv4'));
    expect(rsv4.engine.layout).toBe('V4A');
    expect(rsv4.exhaust.side).toBe('right');
    const m = blueprintFor(getBike('bmw-m1000rr'));
    expect(m.frontBrake.caliperColor.toLowerCase()).toBe('#1d5bd0');
    expect(m.features).toContain('winglets');
    const rs = blueprintFor(getBike('aprilia-rs660'));
    expect(rs.engine.layout).toBe('P2_270');
    expect(rs.exhaust.route).toBe('underslung');
  });

  it('veePorts places one port per cylinder: front bank forward/down, rear bank rearwards', () => {
    for (const id of ['ducati-panigale-v2', 'aprilia-rsv4']) {
      const spec = getBike(id);
      const bp = blueprintFor(spec);
      const ctx = new KitContext(bp, spec, computeHardpoints(bp), kitQuality('low', 1), spec.liveries[0], 0);
      const ports = veePorts(ctx);
      expect(ports.length).toBe(bp.engine.layout === 'L2' ? 2 : 4);
      for (const p of ports) {
        if (p.front) expect(p.dir[1]).toBeLessThan(0);
        else expect(p.dir[2]).toBeGreaterThan(0);
        expect(p.pos[2]).toBeLessThan(ctx.hp.pivot[2] + 0.1);
      }
    }
  });

  it('moveOutline shifts and slims a body without changing its section templates', () => {
    const ob = { zs: [-1, 0], top: curve([[-1, 1], [0, 1.2]]), bottom: curve([[-1, 0.5], [0, 0.6]]), half: curve([[-1, 0.2], [0, 0.3]]), sections: [{ z: -1, pts: [[0, 1], [1, 0.5], [0, 0]] as const }] };
    const m = moveOutline(ob, { dz: 0.1, dy: -0.05, sx: 0.5 });
    expect(m.zs).toEqual([-0.9, 0.1]);
    expect(m.top(-0.9)).toBeCloseTo(ob.top(-1) - 0.05, 6);
    expect(m.half(0.1)).toBeCloseTo(ob.half(0) * 0.5, 6);
    expect(m.sections[0].z).toBeCloseTo(-0.9, 6);
    expect(m.sections[0].pts).toBe(ob.sections[0].pts);
  });
});
