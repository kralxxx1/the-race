import { describe, expect, it } from 'vitest';
import { getBike } from '../../src/data/bikes';
import { assembleBike } from '../../src/render/bike/assemble';
import { authoredIds, blueprintFor } from '../../src/render/bike/blueprints';
import { computeHardpoints } from '../../src/render/bike/hardpoints';
import { kitQuality } from '../../src/render/bike/quality';
import { parseTyre } from '../../src/render/bike/tyre';

/** Spec-sheet checks for the retro / scooter / electric family (Vespa, TMAX, LiveWire, Bonneville, Enfields, FTR, Scrambler). */
const IDS = ['vespa-gts-300', 'yamaha-tmax', 'livewire-one', 'triumph-bonneville-t120', 're-interceptor-650', 're-classic-350', 'ducati-scrambler', 'indian-ftr'] as const;

describe('retro / scooter / EV family blueprints', () => {
  it('are all authored (not the automatic fallback)', () => {
    for (const id of IDS) {
      expect(authoredIds()).toContain(id);
      expect(blueprintFor(getBike(id)).source).toBe('authored');
    }
  });

  it('match their spec sheets', () => {
    const bp = (id: (typeof IDS)[number]) => blueprintFor(getBike(id));
    const vespa = bp('vespa-gts-300');
    expect(vespa.wheelbase).toBeCloseTo(1.38, 3);
    expect(parseTyre(vespa.front.tyre)!.rimInch).toBe(12);
    expect(parseTyre(vespa.rear.tyre)!.rimInch).toBe(12);
    expect(vespa.frontWheel.type).toBe('cast');
    const tmax = bp('yamaha-tmax');
    expect(tmax.wheelbase).toBeCloseTo(1.575, 3);
    expect(parseTyre(tmax.front.tyre)!.rimInch).toBe(15);
    expect(tmax.cockpit.mirrorIndicators).toBe(true);
    const lw = bp('livewire-one');
    expect(lw.exhaust.route).toBe('none');
    expect(lw.drive.type).toBe('belt');
    expect(lw.engine.layout).toBe('ELECTRIC');
    const t120 = bp('triumph-bonneville-t120');
    expect(t120.wheelbase).toBeCloseTo(1.45, 3);
    expect(t120.frontWheel.type).toBe('wire');
    expect(t120.exhaust.route).toBe('peashooter');
    expect(parseTyre(t120.front.tyre)!.rimInch).toBe(18);
    const int650 = bp('re-interceptor-650');
    expect(int650.wheelbase).toBeCloseTo(1.4, 3);
    expect(parseTyre(int650.rear.tyre)!.rimInch).toBe(18);
    expect(int650.frontBrake.discs).toBe(1);
    const classic = bp('re-classic-350');
    expect(classic.engine.layout).toBe('SINGLE');
    expect(parseTyre(classic.front.tyre)!.rimInch).toBe(19);
    expect(classic.cockpit.dash).toBe('analog');
    const scrambler = bp('ducati-scrambler');
    expect(scrambler.wheelbase).toBeCloseTo(1.445, 3);
    expect(scrambler.frame.type).toBe('trellis');
    expect(scrambler.rear.tyre).toBe('180/55ZR17');
    const ftr = bp('indian-ftr');
    expect(parseTyre(ftr.front.tyre)!.rimInch).toBe(19);
    expect(parseTyre(ftr.rear.tyre)!.rimInch).toBe(18);
    expect(ftr.cockpit.dash).toBe('tftRound');
  });

  it('keep the head, grips and seat in a rideable arrangement', () => {
    for (const id of IDS) {
      const b = blueprintFor(getBike(id));
      const hp = computeHardpoints(b);
      // Grips above the seat, within reach of the head, eye above the grips
      expect(hp.grip[1]).toBeGreaterThan(b.seat.height + 0.12);
      expect(hp.eye[1]).toBeGreaterThan(hp.grip[1] + 0.25);
      expect(hp.eye[2]).toBeGreaterThan(hp.grip[2]);
    }
  });

  it('build at LOD0 low detail without warnings', () => {
    for (const id of IDS) {
      const b = assembleBike(getBike(id), 1 % getBike(id).liveries.length, kitQuality('low', 0));
      expect(b.warnings, id).toEqual([]);
      expect(b.stats.triangles, id).toBeGreaterThan(20000);
    }
  }, 240000);
});
