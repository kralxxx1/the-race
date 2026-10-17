import { describe, expect, it } from 'vitest';
import type { VehicleKind } from '../../src/data/vehicles';
import { TrafficSystem, type PlayerProbe, type TrafficCar } from '../../src/world/traffic';
import { laneCenter, makeLaneConfig } from '../../src/world/road';

/** Regression tests for bugs found by the simulation bug hunt (see git log). */

function overlap(a: TrafficCar, b: TrafficCar): boolean {
  return a.dir === b.dir && Math.abs(a.s - b.s) < (a.length + b.length) / 2 - 0.3 && Math.abs(a.d - b.d) < (a.width + b.width) / 2 - 0.2;
}

type Maker = { makeCar(kind: VehicleKind, ln: number, s: number, d: number, dir: 1 | -1, v0: number): TrafficCar };

describe('traffic: cars joining behind a stopped rider', () => {
  // After a crash the rider stands still and the cars behind it stack up with hazard lights. The "slow rider lets
  // faster traffic come from behind" spawner used to drop 28 m/s cars into that queue, which then ploughed into it.
  it.each([1, 2, 3, 4, 5, 6])('seed %i: nobody drives through the queue behind a crashed rider', (seed) => {
    const cfg = makeLaneConfig('oneway');
    const sys = new TrafficSystem(cfg, { seed, baseDensity: 6, densityGrowth: 0, maxDensity: 6, aggression: 0.5, enabled: true, zones: false });
    sys.reset(400);
    const lane = 2;
    const player: PlayerProbe = { s: 400, d: laneCenter(cfg, 3), v: 0 };
    // A stopped queue in the fast lane just behind the crash site.
    for (const back of [40, 75, 110]) {
      const car = (sys as unknown as Maker).makeCar('sedan', lane, player.s - back, laneCenter(cfg, lane), 1, 0);
      car.v = 0;
      car.hazard = true;
      car.nextDecision = 1e9;
      sys.cars.push(car);
    }
    const dt = 1 / 60;
    let overlaps = 0;
    for (let i = 0; i < 60 * 120; i++) {
      sys.update(dt, player, 400);
      if (i % 6 === 0) for (let a = 0; a < sys.cars.length; a++) for (let b = a + 1; b < sys.cars.length; b++) if (overlap(sys.cars[a], sys.cars[b])) overlaps++;
    }
    expect(overlaps).toBe(0);
  }, 60000);
});
