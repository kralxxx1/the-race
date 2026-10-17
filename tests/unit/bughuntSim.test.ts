import { describe, expect, it } from 'vitest';
import type { VehicleKind } from '../../src/data/vehicles';
import { getBike } from '../../src/data/bikes';
import { resolveEnvironment } from '../../src/data/maps';
import { MODE_BY_ID } from '../../src/data/modes';
import { GameSession, TIME_TRIAL_MIN_BONUS, timeTrialBonus } from '../../src/game/session';
import { pilotInput } from './helpers/pilot';
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

describe('time trial pacing', () => {
  // The first checkpoint used to need 2.5 km in 65 s from a standstill (138 km/h on average) and the later ones
  // 2.5 km in 38 s (237 km/h): the starter bike never reached the first one and nobody reached the third.
  it.each([1, 2, 3])('seed %i: the starter bike ridden by the reference rider makes several checkpoints', (seed) => {
    const bike = getBike('yamaha-r3');
    const s = new GameSession({
      bike,
      upgrades: { engine: 0, brakes: 0, handling: 0 },
      mode: MODE_BY_ID.get('timetrial')!,
      env: resolveEnvironment('highway', 'day', 'clear'),
      seed,
      autoShift: true,
    });
    for (let i = 0; i < 60 * 400 && s.state !== 'finished'; i++) {
      s.update(1 / 60, pilotInput(s, { cruise: (bike.topSpeed / 3.6) * 0.9 }));
      if (s.state === 'crashed') s.finishAfterCrash();
    }
    expect(s.checkpointIndex).toBeGreaterThanOrEqual(2);
  }, 60000);

  it('the checkpoint bonus shrinks one second at a time and never below the floor', () => {
    expect(timeTrialBonus(40, 1)).toBe(40);
    expect(timeTrialBonus(40, 2)).toBe(39);
    expect(timeTrialBonus(40, 100)).toBe(TIME_TRIAL_MIN_BONUS);
    // Even the floor leaves a pace a fast bike can hold in traffic over one checkpoint stretch.
    const t = MODE_BY_ID.get('timetrial')!.timer!;
    expect(t.checkpointEvery / TIME_TRIAL_MIN_BONUS) .toBeLessThan(65);
  });
});
