import { describe, expect, it } from 'vitest';
import { BIKES, getBike } from '../../src/data/bikes';
import { MISSION_BY_ID, missionMode, type MissionDef, type Objective } from '../../src/data/career';
import { resolveEnvironment } from '../../src/data/maps';
import { MODE_BY_ID } from '../../src/data/modes';
import { GameSession, type SessionAssists, type SessionEvent } from '../../src/game/session';
import { neutralInput } from '../../src/physics/bike';
import { laneCenter } from '../../src/world/road';
import { mk } from './helpers/mission';
import { holdLane, missionSession, pilotInput, runSession, slowestBikeFor, type PilotOptions } from './helpers/pilot';
import { addCar, clearRoad } from './helpers/scenario';

const R1 = getBike('yamaha-r1');

/** A mission session on an empty road (no traffic at all unless the scenario adds some). */
function lab(objective: Objective, over: Partial<MissionDef> = {}, assists?: SessionAssists): GameSession {
  const def = mk(objective, over);
  const s = new GameSession({
    bike: R1,
    upgrades: { engine: 0, brakes: 0, handling: 0 },
    mode: missionMode(def),
    env: resolveEnvironment(def.map, def.time, def.weather),
    seed: 3,
    autoShift: true,
    mission: def,
    assists,
  });
  clearRoad(s);
  return s;
}

const startLaneD = (s: GameSession) => laneCenter(s.lanes, s.startLane) - 0.6;

/** Step the session at 60 Hz until `done` or the time budget ends. */
function run(s: GameSession, drive: Parameters<typeof runSession>[1], seconds: number, done: (s: GameSession) => boolean = () => false): SessionEvent[] {
  const events: SessionEvent[] = [];
  for (let i = 0; i < seconds * 60 && s.state !== 'finished' && !done(s); i++) {
    s.update(1 / 60, drive(s));
    events.push(...s.drainEvents());
  }
  return events;
}

describe('mission sessions: start and finish', () => {
  it('a mission waits for the start signal and mirrors the objective clock', () => {
    const s = lab({ type: 'distance', meters: 500 }, { limit: { time: 90 } });
    expect(s.mission).not.toBeNull();
    expect(s.timeLeft).toBe(90);
    run(s, () => neutralInput(), 2);
    expect(s.state).toBe('countdown');
    expect(s.mission!.progress).toBe(0);
    expect(s.timeLeft).toBe(90);
    // A free-play session has no mission.
    const free = new GameSession({ bike: R1, upgrades: { engine: 0, brakes: 0, handling: 0 }, mode: MODE_BY_ID.get('endless')!, env: resolveEnvironment('highway', 'day', 'clear'), seed: 1, autoShift: true });
    expect(free.mission).toBeNull();
  });

  it('completing the objective finishes with missionComplete and emits the events', () => {
    const s = lab({ type: 'distance', meters: 600 });
    const ev = run(s, (x) => holdLane(x, startLaneD(x), 45), 60);
    expect(s.state).toBe('finished');
    expect(s.finishReason).toBe('missionComplete');
    expect(s.mission!.status).toBe('complete');
    expect(ev.find((e) => e.type === 'missionComplete')).toMatchObject({ stars: s.mission!.stars });
    expect(ev.filter((e) => e.type === 'finish')).toEqual([{ type: 'finish', reason: 'missionComplete' }]);
    expect(s.score.distance).toBeGreaterThanOrEqual(600);
  });

  it('keeps coasting after a clean finish without scoring or changing the result', () => {
    const s = lab({ type: 'distance', meters: 400 });
    run(s, (x) => holdLane(x, startLaneD(x), 45), 60);
    expect(s.state).toBe('finished');
    const scoreDist = s.score.distance;
    const score = s.score.score;
    const pos = s.bike.s;
    const v = s.bike.v;
    for (let i = 0; i < 120; i++) s.update(1 / 60, neutralInput());
    expect(s.bike.s).toBeGreaterThan(pos); // the world kept rolling
    expect(s.bike.v).toBeLessThan(v); // and the bike braked gently
    expect(s.score.distance).toBe(scoreDist); // nothing counted any more
    expect(s.score.score).toBe(score);
    expect(s.mission!.status).toBe('complete');
    expect(s.finishReason).toBe('missionComplete');
    for (let i = 0; i < 60 * 10; i++) s.update(1 / 60, neutralInput());
    const settled = s.bike.s;
    for (let i = 0; i < 60; i++) s.update(1 / 60, neutralInput());
    expect(s.bike.s).toBe(settled); // the coast phase ends: a finished session is frozen
  });

  it('running out of time fails the mission with missionFailed and a timeUp event', () => {
    const s = lab({ type: 'distance', meters: 90_000 }, { limit: { time: 8 } });
    const ev = run(s, (x) => holdLane(x, startLaneD(x), 45), 30);
    expect(s.state).toBe('finished');
    expect(s.finishReason).toBe('missionFailed');
    expect(s.mission!.failReason).toBe('timeUp');
    expect(ev.some((e) => e.type === 'timeUp')).toBe(true);
    expect(ev.find((e) => e.type === 'missionFailed')).toMatchObject({ reason: 'timeUp' });
    expect(s.timeLeft).toBe(0);
  });

  it('a crash fails the mission at once and the run ends as missionFailed after the cinematic', () => {
    const s = lab({ type: 'distance', meters: 5000 });
    addCar(s, { ahead: 160, lane: s.startLane, kmh: 0, dOffset: -0.6 });
    const ev = run(s, (x) => holdLane(x, startLaneD(x), 45), 20, (x) => x.state === 'crashed');
    expect(s.state).toBe('crashed');
    expect(s.mission!.status).toBe('failed');
    expect(s.mission!.failReason).toBe('crash');
    expect([...ev, ...s.drainEvents()].some((e) => e.type === 'missionFailed' && e.reason === 'crash')).toBe(true);
    s.finishAfterCrash();
    expect(s.state).toBe('finished');
    expect(s.finishReason).toBe('missionFailed');
    // The session never reports 'missionComplete' after a crash, even if later calls try to finish it.
    s.finish('missionComplete');
    expect(s.finishReason).toBe('missionFailed');
  });

  it('quitting a mission is a failed attempt that keeps the quit reason', () => {
    const s = lab({ type: 'distance', meters: 5000 });
    run(s, (x) => holdLane(x, startLaneD(x), 40), 6);
    s.finish('quit');
    expect(s.state).toBe('finished');
    expect(s.finishReason).toBe('quit');
    expect(s.mission!.status).toBe('failed');
    expect(s.mission!.failReason).toBe('quit');
    expect(s.mission!.result().stars).toBe(0);
  });

  it('free sessions still finish with the classic reasons', () => {
    const s = new GameSession({ bike: R1, upgrades: { engine: 0, brakes: 0, handling: 0 }, mode: MODE_BY_ID.get('endless')!, env: resolveEnvironment('highway', 'day', 'clear'), seed: 2, autoShift: true });
    s.finish('crash');
    expect(s.finishReason).toBe('crash');
  });
});

describe('mission objectives measured by the real simulation', () => {
  it('top speed', () => {
    const s = lab({ type: 'topSpeed', kmh: 200 });
    run(s, (x) => holdLane(x, startLaneD(x), 90), 60);
    expect(s.finishReason).toBe('missionComplete');
    expect(s.score.topSpeed).toBeGreaterThanOrEqual(200);
  });

  it('keep speed: completes while the speed holds, fails when it drops', () => {
    const ok = lab({ type: 'keepSpeed', kmh: 100, meters: 800, startWindow: 20 });
    const ev = run(ok, (x) => holdLane(x, startLaneD(x), 36), 60);
    expect(ok.finishReason).toBe('missionComplete');
    expect(ev.some((e) => e.type === 'missionArmed')).toBe(true);

    const bad = lab({ type: 'keepSpeed', kmh: 100, meters: 5000, startWindow: 20 });
    run(bad, (x) => holdLane(x, startLaneD(x), x.mission!.armed ? 10 : 40), 60);
    expect(bad.finishReason).toBe('missionFailed');
    expect(bad.mission!.failReason).toBe('tooSlow');

    const lazy = lab({ type: 'keepSpeed', kmh: 150, meters: 800, startWindow: 5 });
    run(lazy, (x) => holdLane(x, startLaneD(x), 20), 30);
    expect(lazy.mission!.failReason).toBe('tooSlow');
  });

  it('wheelie: total distance and a single long wheelie', () => {
    const total = lab({ type: 'wheelie', meters: 150, single: false });
    run(total, (x) => holdLane(x, startLaneD(x), 60, { wheelie: true }), 90);
    expect(total.finishReason).toBe('missionComplete');
    expect(total.score.wheelieDistance).toBeGreaterThanOrEqual(150);

    const single = lab({ type: 'wheelie', meters: 100, single: true });
    run(single, (x) => holdLane(x, startLaneD(x), 60, { wheelie: true }), 90);
    expect(single.finishReason).toBe('missionComplete');
    expect(single.score.longestWheelie).toBeGreaterThanOrEqual(100);
    expect(single.score.currentWheelie).toBeGreaterThanOrEqual(0);
  });

  it('wheelie meters only count above the minimum wheelie speed', () => {
    const s = lab({ type: 'wheelie', meters: 50, single: false });
    run(s, (x) => holdLane(x, startLaneD(x), 6, { wheelie: true }), 6); // crawling: the front wheel may lift but it does not count
    expect(s.score.wheelieDistance).toBe(0);
    expect(s.mission!.status).toBe('running');
  });

  it('opposite lane: only the metres ridden left of the centre line count (two-way road)', () => {
    const s = lab({ type: 'oppositeLane', meters: 300 }, { layout: 'twoway' });
    const leftD = laneCenter(s.lanes, 1);
    run(s, (x) => holdLane(x, startLaneD(x), 40), 10, () => s.score.distance > 150);
    expect(s.score.oppositeDistance).toBe(0);
    expect(s.mission!.progress).toBe(0);
    run(s, (x) => holdLane(x, leftD, 40), 60);
    expect(s.finishReason).toBe('missionComplete');
    expect(s.score.oppositeDistance).toBeGreaterThanOrEqual(300);
    expect(s.score.oppositeDistance).toBeLessThan(s.score.distance);
  });

  it('opposite lane does not exist on a one-way road', () => {
    const s = lab({ type: 'oppositeLane', meters: 100 }, { layout: 'oneway' });
    run(s, (x) => holdLane(x, laneCenter(x.lanes, 0), 40), 20);
    expect(s.score.oppositeDistance).toBe(0);
    expect(s.inOppositeLane).toBe(false);
  });

  it('overtakes count vehicles passed in the rider direction, not oncoming ones', () => {
    const s = lab({ type: 'overtakes', count: 4 }, { layout: 'twoway' });
    for (let i = 0; i < 3; i++) addCar(s, { ahead: 80 + i * 70, lane: s.startLane, kmh: 50, dOffset: -0.3 + 0 });
    // Oncoming cars in the left lanes must not count.
    for (let i = 0; i < 3; i++) addCar(s, { ahead: 120 + i * 90, lane: 1, kmh: 80 });
    // The rider weaves between the slow cars via the lane to the left.
    run(s, (x) => holdLane(x, laneCenter(x.lanes, 2), 40), 40, (x) => x.score.overtakes >= 3);
    expect(s.score.overtakes).toBe(3);
    expect(s.mission!.status).toBe('running');
    addCar(s, { ahead: 150, lane: 2, kmh: 40 });
    run(s, (x) => holdLane(x, laneCenter(x.lanes, 3), 40), 40);
    expect(s.score.overtakes).toBe(4);
    expect(s.finishReason).toBe('missionComplete');
  });

  it('near misses need speed over 100 km/h and a gap under 0.9 m', () => {
    const s = lab({ type: 'nearMisses', count: 3 });
    const d = startLaneD(s);
    // Far away (wide pass): no near miss. Close (offset into our lane): near miss.
    addCar(s, { ahead: 120, lane: s.startLane - 1, kmh: 60 });
    addCar(s, { ahead: 190, lane: s.startLane - 1, kmh: 60, dOffset: 1.5 });
    addCar(s, { ahead: 260, lane: s.startLane - 1, kmh: 60, dOffset: 1.5 });
    addCar(s, { ahead: 330, lane: s.startLane - 1, kmh: 60, dOffset: 1.5 });
    const ev = run(s, (x) => holdLane(x, d, 50), 40);
    const nm = ev.filter((e) => e.type === 'nearMiss');
    expect(nm).toHaveLength(3);
    for (const e of nm) if (e.type === 'nearMiss') expect(e.clearance).toBeLessThan(0.9);
    expect(s.score.nearMisses).toBe(3);
    expect(s.finishReason).toBe('missionComplete');
  });

  it('a slow pass is never a near miss', () => {
    const s = lab({ type: 'nearMisses', count: 1 });
    addCar(s, { ahead: 60, lane: s.startLane - 1, kmh: 5, dOffset: 1.5 });
    run(s, (x) => holdLane(x, startLaneD(x), 20), 20, (x) => x.bike.s > 100);
    expect(s.score.nearMisses).toBe(0);
  });

  it('combo: back-to-back near misses chain; a long gap resets', () => {
    const s = lab({ type: 'combo', combo: 5 });
    for (let i = 0; i < 6; i++) addCar(s, { ahead: 110 + i * 35, lane: s.startLane - 1, kmh: 50, dOffset: 1.5 });
    run(s, (x) => holdLane(x, startLaneD(x), 50), 40);
    expect(s.score.maxCombo).toBeGreaterThanOrEqual(5);
    expect(s.finishReason).toBe('missionComplete');

    const slowChain = lab({ type: 'combo', combo: 3 });
    // Cars 400 m apart: ~8 s between passes, longer than the combo window.
    for (let i = 0; i < 4; i++) addCar(slowChain, { ahead: 110 + i * 400, lane: slowChain.startLane - 1, kmh: 50, dOffset: 1.5 });
    run(slowChain, (x) => holdLane(x, startLaneD(x), 50), 60, (x) => x.bike.s > 1700);
    expect(slowChain.score.nearMisses).toBeGreaterThanOrEqual(3);
    expect(slowChain.score.maxCombo).toBe(1);
    expect(slowChain.mission!.status).toBe('running');
  });

  it('checkpoints extend the clock and the session mirrors it', () => {
    const s = lab({ type: 'checkpoints', count: 3, spacing: 500, startTime: 25, bonusTime: 20 });
    const ev = run(s, (x) => holdLane(x, startLaneD(x), 50), 60);
    const cps = ev.filter((e) => e.type === 'checkpoint');
    expect(cps).toHaveLength(2);
    expect(cps[0]).toMatchObject({ index: 1, bonus: 20 });
    expect(s.finishReason).toBe('missionComplete');
    expect(s.timeLeft).toBe(s.mission!.timeLeft);
  });

  it('checkpoints fail when the pace is too slow', () => {
    const s = lab({ type: 'checkpoints', count: 3, spacing: 800, startTime: 15, bonusTime: 10 });
    run(s, (x) => holdLane(x, startLaneD(x), 15), 40);
    expect(s.finishReason).toBe('missionFailed');
    expect(s.mission!.failReason).toBe('timeUp');
  });

  it('score within a distance budget', () => {
    const easy = lab({ type: 'score', points: 800 }, { limit: { distance: 4000 } });
    run(easy, (x) => holdLane(x, startLaneD(x), 45), 120);
    expect(easy.finishReason).toBe('missionComplete');
    const hard = lab({ type: 'score', points: 900_000 }, { limit: { distance: 1500 } });
    run(hard, (x) => holdLane(x, startLaneD(x), 45), 120);
    expect(hard.finishReason).toBe('missionFailed');
    expect(hard.mission!.failReason).toBe('distanceUp');
  });

  it('survive: counts only the seconds spent above the minimum speed', () => {
    const s = lab({ type: 'survive', seconds: 8, minKmh: 90 });
    run(s, (x) => holdLane(x, startLaneD(x), 36), 40);
    expect(s.finishReason).toBe('missionComplete');
    // Reaching 90 km/h from a standstill takes a while, so total time exceeds the 8 s of objective time.
    expect(s.time).toBeGreaterThan(8);
  });

  it('stars follow the star metric of the finished run', () => {
    const fast = lab({ type: 'topSpeed', kmh: 150 }, { stars: { metric: 'time', two: 30, three: 20 } });
    run(fast, (x) => holdLane(x, startLaneD(x), 90), 60);
    expect(fast.mission!.stars).toBe(3);
    const slow = lab({ type: 'distance', meters: 500 }, { stars: { metric: 'time', two: 12, three: 8 } });
    run(slow, (x) => holdLane(x, startLaneD(x), 20), 60);
    expect(slow.mission!.stars).toBe(1);
  });
});

describe('rider assists', () => {
  it('auto-throttle accelerates without input and stops when braking', () => {
    const a = lab({ type: 'distance', meters: 5000 }, {}, { autoThrottle: true });
    run(a, () => neutralInput(), 8);
    expect(a.bike.speedKmh).toBeGreaterThan(40);
    const b = lab({ type: 'distance', meters: 5000 }, {}, {});
    run(b, () => neutralInput(), 8);
    expect(b.bike.speedKmh).toBeLessThan(1);
    // Braking cancels the auto throttle.
    run(a, () => ({ ...neutralInput(), brake: 1 }), 12);
    expect(a.bike.speedKmh).toBeLessThan(5);
  });

  it('auto-throttle is not applied while the engine only revs on the grid', () => {
    const s = lab({ type: 'distance', meters: 5000 }, {}, { autoThrottle: true });
    run(s, () => neutralInput(), 2.5);
    expect(s.state).toBe('countdown');
    expect(s.bike.speedKmh).toBeLessThan(1);
  });

  it('wheelie assist holds the throttle at the balance point', () => {
    const s = lab({ type: 'distance', meters: 5000 }, {}, { wheelie: true });
    run(s, (x) => holdLane(x, startLaneD(x), 60), 7);
    // Wheelie held with zero throttle input: the assist supplies the drive.
    run(s, (x) => ({ ...neutralInput(), steer: holdLane(x, startLaneD(x), 0).steer, wheelie: true }), 4);
    expect(s.score.wheelieDistance).toBeGreaterThan(0);
    const without = lab({ type: 'distance', meters: 5000 });
    run(without, (x) => holdLane(x, startLaneD(x), 60), 7);
    run(without, (x) => ({ ...neutralInput(), steer: holdLane(x, startLaneD(x), 0).steer, wheelie: true }), 4);
    expect(without.score.wheelieDistance).toBeLessThanOrEqual(s.score.wheelieDistance);
  });
});

describe('reference rider completes missions on the real traffic simulation', () => {
  /** One mission per objective type, ridden by the headless reference rider on the slowest qualifying bike. */
  const SAMPLE: [id: string, opts: Partial<PilotOptions>][] = [
    ['suburb-01', {}], // distance
    ['suburb-02', {}], // overtakes
    ['suburb-04', {}], // checkpoints
    ['suburb-05', { hunt: true }], // near misses
    ['suburb-06', { preferOpposite: true }], // opposite lane (two-way)
    ['suburb-08', { wheelie: true }], // wheelie (total)
    ['suburb-09', {}], // survive
    ['suburb-10', {}], // score within distance
    ['highway-03', {}], // top speed
    ['highway-06', { minSpeed: 100 / 3.6 }], // keep speed
    ['city-09', { wheelie: true }], // wheelie (single)
    ['desert-02', {}], // top speed on a faster bike
    ['coast-01', {}], // long distance with a time limit
  ];

  it.each(SAMPLE)('%s', (id, extra) => {
    const def = MISSION_BY_ID.get(id)!;
    const bike = slowestBikeFor(def.minTopSpeed);
    expect(bike.topSpeed).toBeGreaterThanOrEqual(def.minTopSpeed);
    const t = def.objective.type;
    const hunt = extra.hunt === true;
    const opts: PilotOptions = {
      cruise: Math.min(hunt ? 34 : 99, (bike.topSpeed / 3.6) * (t === 'topSpeed' ? 1.02 : 0.9)),
      ...extra,
    };
    // The simulation is deterministic per seed; a human gets several tries, so does the reference rider.
    let best: GameSession | null = null;
    for (const seed of [11, 23, 37, 41, 53]) {
      const s = missionSession(def, bike, seed);
      runSession(s, (x) => pilotInput(x, opts), def.limit.time ? def.limit.time + 120 : 700);
      if (s.mission!.status === 'complete') {
        best = s;
        break;
      }
    }
    expect(best, `${id} completed by the reference rider`).not.toBeNull();
    expect(best!.finishReason).toBe('missionComplete');
    expect(best!.mission!.stars).toBeGreaterThanOrEqual(1);
    expect(best!.mission!.result().progress).toBe(1);
  });

  it('every bike that meets the requirement can in principle start the mission (bike coverage)', () => {
    for (const d of [MISSION_BY_ID.get('suburb-01')!, MISSION_BY_ID.get('industrial-04')!]) {
      const ok = BIKES.filter((b) => b.topSpeed >= d.minTopSpeed);
      expect(ok.length).toBeGreaterThan(0);
    }
  });
});
