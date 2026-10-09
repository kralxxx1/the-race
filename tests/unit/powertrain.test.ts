import { describe, expect, it } from 'vitest';
import { BIKES, BIKE_BY_ID, FIRING_ANGLES, getBike } from '../../src/data/bikes';
import { buildDrivetrain, buildPowerCurve, measureCurve } from '../../src/physics/powertrain';
import { BikePhysics, FLAT_ROAD, measurePerformance, neutralInput } from '../../src/physics/bike';

describe('bike catalogue', () => {
  it('has unique ids and many brands', () => {
    const ids = new Set(BIKES.map((b) => b.id));
    expect(ids.size).toBe(BIKES.length);
    expect(new Set(BIKES.map((b) => b.brand)).size).toBeGreaterThanOrEqual(15);
    expect(BIKES.length).toBeGreaterThanOrEqual(50);
  });

  it('every bike has sane data', () => {
    for (const b of BIKES) {
      expect(b.liveries.length, b.id).toBeGreaterThan(0);
      expect(b.weight, b.id).toBeGreaterThan(100);
      expect(b.topSpeed, b.id).toBeGreaterThan(100);
      expect(b.price, b.id).toBeGreaterThan(0);
      expect(b.engine.limiter, b.id).toBeGreaterThanOrEqual(b.engine.redline);
      if (b.engine.layout !== 'ELECTRIC') {
        expect(b.engine.idle, b.id).toBeGreaterThan(500);
        expect(b.engine.hpRpm, b.id).toBeLessThanOrEqual(b.engine.limiter);
        expect(b.engine.torqueRpm, b.id).toBeLessThan(b.engine.hpRpm + 1);
      }
      for (const a of FIRING_ANGLES[b.engine.layout]) {
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThan(720);
      }
      for (const l of b.liveries) for (const c of [l.primary, l.secondary, l.accent, l.frame, l.wheel]) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('getBike throws for unknown ids', () => {
    expect(() => getBike('nope')).toThrow();
    expect(BIKE_BY_ID.get('yamaha-r1')?.brand).toBe('Yamaha');
  });
});

describe('power curves', () => {
  it.each(BIKES.map((b) => [b.id, b] as const))('%s reproduces its rated power and torque', (_id, b) => {
    const c = buildPowerCurve(b.engine);
    const m = measureCurve(c);
    expect(m.hp / b.engine.hp).toBeGreaterThan(0.95);
    expect(m.hp / b.engine.hp).toBeLessThan(1.04);
    const ratedT = Math.max(b.engine.torque, (b.engine.hp * 0.7457 * 9549) / b.engine.hpRpm);
    expect(m.torque / ratedT).toBeGreaterThan(0.97);
    expect(m.torque / ratedT).toBeLessThanOrEqual(1.0001);
    if (c.kind === 'combustion') {
      expect(Math.abs(m.hpRpm - b.engine.hpRpm) / b.engine.hpRpm).toBeLessThan(0.08);
      // Torque must never go negative inside the rev range.
      for (let r = c.idle; r <= c.limiter; r += 250) expect(c.torqueAt(r)).toBeGreaterThan(0);
    }
  });
});

describe('drivetrain', () => {
  it.each(BIKES.map((b) => [b.id, b] as const))('%s has plausible gearing and aero', (_id, b) => {
    const d = buildDrivetrain(b);
    expect(d.cda).toBeGreaterThan(0.15);
    expect(d.cda).toBeLessThan(1.0);
    for (let i = 1; i < d.ratios.length; i++) expect(d.ratios[i]).toBeLessThan(d.ratios[i - 1]);
    expect(d.ratios.length).toBe(b.transmission === 'manual' ? b.gears : 1);
  });
});

describe('performance simulation', () => {
  it.each(BIKES.map((b) => [b.id, b] as const))('%s reaches its rated top speed', (_id, b) => {
    const p = measurePerformance(b);
    expect(p.topSpeed / b.topSpeed).toBeGreaterThan(0.95);
    expect(p.topSpeed / b.topSpeed).toBeLessThan(1.04);
    expect(p.zeroTo100).toBeGreaterThan(2.3);
    expect(p.zeroTo100).toBeLessThan(16);
  });

  it('orders acceleration sensibly', () => {
    const h2r = measurePerformance(getBike('kawasaki-h2r'));
    const r1 = measurePerformance(getBike('yamaha-r1'));
    const r3 = measurePerformance(getBike('yamaha-r3'));
    const classic = measurePerformance(getBike('re-classic-350'));
    expect(r1.zeroTo100).toBeLessThan(3.6);
    expect(h2r.zeroTo200!).toBeLessThan(r1.zeroTo200!);
    expect(r1.zeroTo100).toBeLessThan(r3.zeroTo100);
    expect(r3.zeroTo100).toBeLessThan(classic.zeroTo100);
    expect(r1.quarterMile).toBeGreaterThan(9.3);
    expect(r1.quarterMile).toBeLessThan(11.2);
  });

  it('engine upgrades improve performance', () => {
    const base = measurePerformance(getBike('yamaha-mt07'));
    const tuned = measurePerformance(getBike('yamaha-mt07'), { engine: 5, brakes: 0, handling: 0 });
    expect(tuned.topSpeed).toBeGreaterThan(base.topSpeed);
    expect(tuned.zeroTo100).toBeLessThanOrEqual(base.zeroTo100);
  });
});

describe('bike dynamics', () => {
  const limits = { halfWidth: 100, grip: 1.1 };
  const dt = 1 / 120;

  it('brakes from 100 km/h in a realistic distance', () => {
    const bike = new BikePhysics(getBike('yamaha-r1'));
    bike.reset(0, 0, 100 / 3.6);
    const input = { ...neutralInput(), brake: 1 };
    let t = 0;
    while (bike.v > 0.01 && t < 20) {
      bike.step(dt, input, FLAT_ROAD, limits);
      t += dt;
    }
    expect(bike.distance).toBeGreaterThan(36);
    expect(bike.distance).toBeLessThan(52);
    expect(bike.gear).toBeLessThanOrEqual(2);
  });

  it('auto-shifts up through the gears at full throttle', () => {
    const bike = new BikePhysics(getBike('kawasaki-zx10r'));
    bike.reset();
    const input = { ...neutralInput(), throttle: 1 };
    for (let i = 0; i < 120 * 25; i++) bike.step(dt, input, FLAT_ROAD, limits);
    expect(bike.gear).toBe(6);
    expect(bike.rpm).toBeLessThanOrEqual(bike.spec.engine.limiter * 1.02);
  });

  it('leans into a steering input and changes lane', () => {
    const bike = new BikePhysics(getBike('yamaha-mt09'));
    bike.reset(0, 0, 30);
    const input = { ...neutralInput(), throttle: 0.4, steer: 1 };
    for (let i = 0; i < 60; i++) bike.step(dt, input, FLAT_ROAD, limits);
    expect(bike.lean).toBeGreaterThan(0.05);
    for (let i = 0; i < 60; i++) bike.step(dt, input, FLAT_ROAD, limits);
    expect(bike.d).toBeGreaterThan(1);
    // Release: the controller straightens the bike up.
    const straight = { ...input, steer: 0 };
    for (let i = 0; i < 240; i++) bike.step(dt, straight, FLAT_ROAD, limits);
    expect(Math.abs(bike.heading)).toBeLessThan(0.02);
    expect(Math.abs(bike.lean)).toBeLessThan(0.05);
  });

  it('follows a curved road by leaning automatically', () => {
    const bike = new BikePhysics(getBike('honda-cbr650r'));
    bike.reset(0, 0, 40);
    const curved = { curvature: () => 1 / 800, grade: () => 0, metric: () => 1 };
    const input = { ...neutralInput(), throttle: 0.5 };
    for (let i = 0; i < 120 * 6; i++) bike.step(dt, input, curved, limits);
    expect(bike.lean).toBeGreaterThan(0.1);
    expect(Math.abs(bike.d)).toBeLessThan(1.5);
  });

  it('rider wheelie lifts the front and stays bounded', () => {
    const bike = new BikePhysics(getBike('yamaha-mt07'));
    bike.reset(0, 0, 15);
    const input = { ...neutralInput(), throttle: 1, wheelie: true };
    let maxPitch = 0;
    for (let i = 0; i < 120 * 3; i++) {
      bike.step(dt, input, FLAT_ROAD, limits);
      maxPitch = Math.max(maxPitch, bike.pitch);
    }
    expect(bike.isWheelie).toBe(true);
    expect(maxPitch).toBeLessThan(0.95);
    expect(bike.crashed).toBe(false);
    const release = { ...input, wheelie: false, throttle: 0.2 };
    let landed = false;
    for (let i = 0; i < 120 * 3; i++) {
      bike.step(dt, release, FLAT_ROAD, limits);
      if (bike.events.some((e) => e.type === 'land')) landed = true;
      bike.events.length = 0;
    }
    expect(bike.pitch).toBe(0);
    expect(landed).toBe(true);
  });

  it('barrier: glancing contact scrapes, steep impact crashes', () => {
    const bike = new BikePhysics(getBike('yamaha-r1'));
    const narrow = { halfWidth: 3, grip: 1.1 };
    bike.reset(0, 2.9, 20);
    bike.heading = 0.05;
    for (let i = 0; i < 30; i++) bike.step(dt, neutralInput(), FLAT_ROAD, narrow);
    expect(bike.crashed).toBe(false);
    expect(Math.abs(bike.d)).toBeLessThanOrEqual(3);
    bike.reset(0, 2.5, 50);
    bike.heading = 0.4;
    for (let i = 0; i < 30; i++) bike.step(dt, neutralInput(), FLAT_ROAD, narrow);
    expect(bike.crashed).toBe(true);
    expect(bike.crashReason).toBe('barrier');
  });

  it('never produces NaN under random inputs', () => {
    for (const b of BIKES) {
      const bike = new BikePhysics(b);
      bike.reset(0, 0, 0);
      let seed = 1;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const limits2 = { halfWidth: 8, grip: 0.75 };
      for (let i = 0; i < 1200; i++) {
        bike.step(
          dt,
          { throttle: rnd(), brake: rnd() < 0.2 ? rnd() : 0, steer: rnd() * 2 - 1, wheelie: rnd() < 0.1, shiftUp: false, shiftDown: false },
          FLAT_ROAD,
          limits2,
        );
        bike.events.length = 0;
        if (bike.crashed) bike.reset(bike.s, 0, 10);
      }
      for (const v of [bike.s, bike.d, bike.v, bike.rpm, bike.lean, bike.pitch, bike.heading]) expect(Number.isFinite(v), b.id).toBe(true);
    }
  });
});
