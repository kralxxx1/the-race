import type { MissionDef, Objective } from '../../../src/data/career';
import { MissionTracker, emptySample, type MissionSample } from '../../../src/game/missions';

/** A throw-away mission definition for tracker tests. */
export function mk(objective: Objective, over: Partial<MissionDef> = {}): MissionDef {
  return {
    id: 'suburb-01',
    number: 1,
    index: 1,
    map: 'suburb',
    title: 'Deneme',
    briefing: 'Deneme görevi',
    hint: 'İpucu',
    time: 'day',
    weather: 'clear',
    layout: 'oneway',
    traffic: { level: 'normal', aggression: 0.3 },
    objective,
    limit: {},
    stars: { metric: 'time', two: 60, three: 30 },
    rewards: { cash: 100, xp: 10, firstClearBonus: 50, secondaryCash: 0 },
    minTopSpeed: 160,
    ...over,
  };
}

/**
 * Feeds a tracker the cumulative samples a GameSession would: advance `time` and
 * `distance` from the speed and let the test bump the counters.
 */
export class SampleFeeder {
  readonly s: MissionSample = emptySample();
  constructor(readonly tracker: MissionTracker) {}

  /** Advance `seconds` at `kmh` in 1/60 s ticks, applying `each` after every tick. */
  ride(seconds: number, kmh: number, each?: (s: MissionSample, tick: number) => void): this {
    const dt = 1 / 60;
    const n = Math.round(seconds * 60);
    for (let i = 0; i < n && this.tracker.running; i++) {
      const dd = (kmh / 3.6) * dt;
      this.s.time += dt;
      this.s.distance += dd;
      this.s.distanceDelta = dd;
      this.s.speedKmh = kmh;
      this.s.topSpeed = Math.max(this.s.topSpeed, kmh);
      each?.(this.s, i);
      this.tracker.update(dt, this.s);
    }
    return this;
  }

  /** Ride until `meters` have been covered at `kmh`. */
  rideMeters(meters: number, kmh: number, each?: (s: MissionSample, tick: number) => void): this {
    return this.ride(meters / (kmh / 3.6), kmh, each);
  }
}

export function feeder(objective: Objective, over: Partial<MissionDef> = {}): SampleFeeder {
  return new SampleFeeder(new MissionTracker(mk(objective, over)));
}
