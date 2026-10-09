import { describe, expect, it } from 'vitest';
import { RoadPath, laneAt, laneCenter, makeLaneConfig, pavedHalfWidth } from '../../src/world/road';
import { TrafficSystem, type TrafficCar } from '../../src/world/traffic';

describe('RoadPath', () => {
  const road = new RoadPath(42);

  it('starts straight and flat at the origin', () => {
    const p = road.toWorld(0, 0, { x: 0, y: 0, z: 0 });
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.y).toBeCloseTo(0, 6);
    expect(Math.abs(road.curvature(20))).toBeLessThan(1e-6);
  });

  it('keeps curvature gentle enough for 300 km/h', () => {
    let maxK = 0;
    let maxGrade = 0;
    for (let s = 0; s < 60000; s += 7) {
      maxK = Math.max(maxK, Math.abs(road.curvature(s)));
      maxGrade = Math.max(maxGrade, Math.abs(road.grade(s)));
    }
    // Lateral acceleration at 300 km/h must stay below ~0.75 g.
    expect(maxK * (300 / 3.6) ** 2).toBeLessThan(0.75 * 9.81);
    expect(maxGrade).toBeLessThan(0.06);
  });

  it('places lateral offsets perpendicular to the road', () => {
    for (const s of [500, 1234, 7777]) {
      const c = road.toWorld(s, 0, { x: 0, y: 0, z: 0 });
      const r = road.toWorld(s, 5, { x: 0, y: 0, z: 0 });
      const f = road.toWorld(s + 0.25, 0, { x: 0, y: 0, z: 0 });
      const b = road.toWorld(s - 0.25, 0, { x: 0, y: 0, z: 0 });
      const lateral = { x: r.x - c.x, z: r.z - c.z };
      const fwd = { x: f.x - b.x, z: f.z - b.z };
      expect(Math.hypot(lateral.x, lateral.z)).toBeCloseTo(5, 4);
      expect(lateral.x * fwd.x + lateral.z * fwd.z).toBeCloseTo(0, 4);
      // +d must be on the right-hand side of the travel direction (cross product y < 0 in three.js).
      expect(fwd.x * lateral.z - fwd.z * lateral.x).toBeGreaterThan(0);
    }
  });

  it('yaw aligns a -Z forward object with the road tangent', () => {
    for (const s of [800, 2000, 3500]) {
      const yaw = road.yaw(s);
      const fwd = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
      const a = road.toWorld(s, 0, { x: 0, y: 0, z: 0 });
      const b = road.toWorld(s + 1, 0, { x: 0, y: 0, z: 0 });
      const t = { x: b.x - a.x, z: b.z - a.z };
      const n = Math.hypot(t.x, t.z);
      expect(fwd.x * (t.x / n) + fwd.z * (t.z / n)).toBeGreaterThan(0.99999);
    }
  });

  it('is deterministic per seed', () => {
    const a = new RoadPath(7);
    const b = new RoadPath(7);
    const c = new RoadPath(8);
    expect(a.centerX(3000)).toBe(b.centerX(3000));
    expect(a.centerX(3000)).not.toBe(c.centerX(3000));
  });
});

describe('lanes', () => {
  it('maps lane centres and back', () => {
    const cfg = makeLaneConfig('oneway');
    for (let i = 0; i < cfg.lanes; i++) expect(laneAt(cfg, laneCenter(cfg, i))).toBe(i);
    expect(laneAt(cfg, -100)).toBe(0);
    expect(laneAt(cfg, 100)).toBe(cfg.lanes - 1);
    expect(pavedHalfWidth(cfg)).toBeCloseTo(4 * 3.6 / 2 + cfg.shoulder);
  });
  it('two-way roads have oncoming lanes on the left', () => {
    const cfg = makeLaneConfig('twoway');
    expect(cfg.dirs[0]).toBe(-1);
    expect(cfg.dirs[cfg.lanes - 1]).toBe(1);
  });
});

function overlap(a: TrafficCar, b: TrafficCar): boolean {
  return Math.abs(a.s - b.s) < (a.length + b.length) / 2 - 0.2 && Math.abs(a.d - b.d) < (a.width + b.width) / 2 - 0.1;
}

describe('TrafficSystem', () => {
  const opts = { seed: 3, baseDensity: 24, densityGrowth: 4, maxDensity: 40, aggression: 0.8, enabled: true };

  it('populates ahead of the player without blocking the start', () => {
    const cfg = makeLaneConfig('oneway');
    const t = new TrafficSystem(cfg, opts);
    t.reset(0);
    expect(t.cars.length).toBeGreaterThan(15);
    for (const c of t.cars) {
      expect(c.s).toBeGreaterThan(60);
      expect(Number.isFinite(c.v)).toBe(true);
    }
  });

  it.each(['oneway', 'twoway'] as const)('%s: simulates 5 minutes without car-on-car overlaps', (layout) => {
    const cfg = makeLaneConfig(layout);
    const t = new TrafficSystem(cfg, opts);
    t.reset(0);
    const player = { s: 0, d: laneCenter(cfg, cfg.lanes - 1), v: 38 };
    let overlaps = 0;
    let laneChanges = 0;
    let maxCount = 0;
    const dt = 1 / 60;
    for (let i = 0; i < 60 * 300; i++) {
      player.s += player.v * dt;
      t.update(dt, player, player.s);
      for (const e of t.events) if (e.type === 'signal') laneChanges++;
      t.events.length = 0;
      maxCount = Math.max(maxCount, t.cars.length);
      if (i % 10 === 0) {
        for (let a = 0; a < t.cars.length; a++)
          for (let b = a + 1; b < t.cars.length; b++) if (overlap(t.cars[a], t.cars[b])) overlaps++;
      }
      if (i % 10 === 0) {
        for (const c of t.cars) {
          if (!(Number.isFinite(c.s) && Number.isFinite(c.d) && Number.isFinite(c.v))) throw new Error('NaN car');
          if (cfg.dirs[c.lane] !== c.dir) throw new Error('car in wrong-direction lane');
        }
      }
    }
    expect(overlaps).toBe(0);
    expect(laneChanges).toBeGreaterThan(10);
    expect(maxCount).toBeLessThanOrEqual(opts.maxDensity + 3);
  }, 60000);

  it('cars brake behind a stationary rider instead of driving through', () => {
    const cfg = makeLaneConfig('oneway');
    const t = new TrafficSystem(cfg, { ...opts, baseDensity: 0, densityGrowth: 0, aggression: 0 });
    t.reset(0);
    const lane = 2;
    const player = { s: 200, d: laneCenter(cfg, lane), v: 0 };
    // Inject a car approaching from behind.
    (t as unknown as { trySpawn: (s: number, p: unknown, i: boolean, l: number) => TrafficCar | null }).trySpawn(60, { s: -1000, d: 0, v: 0 }, false, lane);
    const car = t.cars[0];
    car.nextDecision = 1e9;
    for (let i = 0; i < 60 * 30; i++) t.update(1 / 60, player, 0);
    expect(car.s).toBeLessThan(player.s - car.length / 2 - 1);
    expect(car.v).toBeLessThan(0.5);
  });

  it('incident makes nearby traffic stop with hazards', () => {
    const cfg = makeLaneConfig('oneway');
    const t = new TrafficSystem(cfg, opts);
    t.reset(0);
    t.triggerIncident(300, 1000);
    for (let i = 0; i < 60 * 20; i++) t.update(1 / 60, { s: 300, d: 0, v: 0 }, 0);
    for (const c of t.cars) if (c.hazard) expect(c.v).toBeLessThan(0.5);
  });
});
