import { describe, expect, it } from 'vitest';
import { getBike } from '../../src/data/bikes';
import { ENV_BY_ID } from '../../src/data/environments';
import { MODE_BY_ID, type ModeId } from '../../src/data/modes';
import { neutralInput, type RiderInput } from '../../src/physics/bike';
import { GameSession } from '../../src/game/session';
import { ScoreKeeper, cashForRun } from '../../src/game/scoring';
import { laneCenter } from '../../src/world/road';

function makeSession(mode: ModeId = 'endless', bike = 'yamaha-r1', seed = 5) {
  return new GameSession({
    bike: getBike(bike),
    upgrades: { engine: 0, brakes: 0, handling: 0 },
    mode: MODE_BY_ID.get(mode)!,
    env: ENV_BY_ID.get('day')!,
    seed,
    autoShift: true,
  });
}

/** Simple autopilot: picks the freest adjacent lane, checking flanks like a careful rider. */
function autopilot(sess: GameSession): RiderInput {
  const b = sess.bike;
  const cfg = sess.lanes;
  const cur = Math.round(b.d / cfg.laneWidth + (cfg.lanes - 1) / 2);
  const laneGap = (l: number) => {
    const dc = laneCenter(cfg, l);
    let gap = 400;
    for (const c of sess.traffic.cars) {
      const intoLane = (c.laneChange && c.laneChange.to === l) || (c.indicator !== 0 && c.lane + c.indicator === l);
      if (Math.abs(c.d - dc) > (c.width / 2 + 1.4) && !intoLane) continue;
      const ahead = c.s - b.s;
      const rear = ahead + c.length / 2 + 4;
      if (rear < 0) continue;
      // Oncoming cars close the gap twice as fast.
      const eff = c.dir === 1 ? ahead - c.length / 2 : (ahead - c.length / 2) / 2.5;
      gap = Math.min(gap, eff);
    }
    return gap;
  };
  let bestLane = Math.max(0, Math.min(cfg.lanes - 1, cur));
  let bestScore = -Infinity;
  for (const l of [cur - 1, cur, cur + 1]) {
    if (l < 0 || l >= cfg.lanes || cfg.dirs[l] !== 1) continue;
    const score = laneGap(l) - (l === cur ? 0 : 25);
    if (score > bestScore) {
      bestScore = score;
      bestLane = l;
    }
  }
  const target = laneCenter(cfg, bestLane);
  const err = target - b.d;
  const steer = Math.max(-1, Math.min(1, err * 0.7 - b.heading * 8));
  const gapAhead = Math.min(laneGap(cur), laneGap(bestLane));
  const want = Math.min(45, 6 + Math.max(0, gapAhead) * 0.55);
  return { ...neutralInput(), steer, throttle: b.v < want ? 1 : 0, brake: b.v > want + 4 ? 0.9 : 0 };
}

describe('GameSession', () => {
  it('counts down, then lets the rider go', () => {
    const s = makeSession();
    const input = { ...neutralInput(), throttle: 1 };
    for (let i = 0; i < 60 * 2; i++) s.update(1 / 60, input);
    expect(s.state).toBe('countdown');
    expect(s.bike.v).toBeLessThan(0.5);
    for (let i = 0; i < 60 * 3; i++) s.update(1 / 60, input);
    expect(s.state).toBe('running');
    expect(s.bike.v).toBeGreaterThan(5);
    expect(s.drainEvents().some((e) => e.type === 'go')).toBe(true);
  });

  it('crashes when riding straight into traffic and keeps state consistent', () => {
    const s = makeSession('endless', 'yamaha-r1', 11);
    const input = { ...neutralInput(), throttle: 1 };
    let t = 0;
    while (s.state !== 'crashed' && t < 240) {
      s.update(1 / 60, input);
      t += 1 / 60;
    }
    expect(s.state).toBe('crashed');
    expect(s.bike.crashed).toBe(true);
    expect(s.crashedInto).not.toBeNull();
    const events = s.drainEvents();
    expect(events.some((e) => e.type === 'hit')).toBe(true);
    const scoreAtCrash = s.score.score;
    for (let i = 0; i < 120; i++) s.update(1 / 60, input);
    expect(s.score.score).toBe(scoreAtCrash);
    s.finish('crash');
    expect(s.state).toBe('finished');
  });

  it.each(['endless', 'twoway', 'timetrial', 'freeride'] as const)('%s: autopilot survives and scores', (mode) => {
    const s = makeSession(mode, 'kawasaki-zx10r', 21);
    let nearMisses = 0;
    let passes = 0;
    for (let i = 0; i < 60 * 90 && s.state !== 'finished'; i++) {
      s.update(1 / 60, s.state === 'running' ? autopilot(s) : neutralInput());
      for (const e of s.drainEvents()) {
        if (e.type === 'nearMiss') nearMisses++;
        if (e.type === 'pass') passes++;
      }
      expect(Number.isFinite(s.bike.s)).toBe(true);
    }
    expect(s.score.distance).toBeGreaterThan(1500);
    expect(passes).toBeGreaterThan(5);
    expect(s.score.score).toBeGreaterThan(0);
    expect(nearMisses).toBeGreaterThanOrEqual(0);
  });

  it('time trial runs out of time and finishes', () => {
    const s = makeSession('timetrial', 're-classic-350');
    s.timeLeft = 5;
    for (let i = 0; i < 60 * 12; i++) s.update(1 / 60, neutralInput());
    expect(s.state).toBe('finished');
    expect(s.finishReason).toBe('timeUp');
  });

  it('free ride respawns after a crash', () => {
    const s = makeSession('freeride');
    for (let i = 0; i < 60 * 4; i++) s.update(1 / 60, neutralInput());
    s.bike.crash('traffic');
    for (let i = 0; i < 60 * 4; i++) s.update(1 / 60, neutralInput());
    expect(s.state).toBe('running');
    expect(s.bike.crashed).toBe(false);
  });

  it('opposite lane is only reported on two-way roads', () => {
    const one = makeSession('endless');
    one.bike.d = -5;
    expect(one.inOppositeLane).toBe(false);
    const two = makeSession('twoway');
    two.bike.d = -5;
    expect(two.inOppositeLane).toBe(true);
  });

  it('handles huge and zero frame times safely', () => {
    const s = makeSession();
    s.update(0, neutralInput());
    s.update(10, neutralInput());
    s.update(Number.NaN, neutralInput());
    expect(Number.isFinite(s.bike.s)).toBe(true);
  });
});

describe('ScoreKeeper', () => {
  it('awards nothing below 100 km/h for near misses', () => {
    const k = new ScoreKeeper();
    expect(k.nearMiss(0.2, 90, false)).toBe(0);
    expect(k.nearMisses).toBe(0);
  });

  it('builds combos within the window and resets after', () => {
    const k = new ScoreKeeper();
    const a = k.nearMiss(0.5, 150, false);
    const b = k.nearMiss(0.5, 150, false);
    expect(b).toBeGreaterThan(a);
    expect(k.combo).toBe(2);
    k.update(4, { speedKmh: 150, distanceDelta: 1, oppositeLane: false, wheelie: false });
    expect(k.combo).toBe(0);
    expect(k.maxCombo).toBe(2);
  });

  it('pays more for speed, opposite lane and wheelies', () => {
    const base = new ScoreKeeper();
    base.update(1, { speedKmh: 150, distanceDelta: 41, oppositeLane: false, wheelie: false });
    const opp = new ScoreKeeper();
    opp.update(1, { speedKmh: 150, distanceDelta: 41, oppositeLane: true, wheelie: false });
    const wh = new ScoreKeeper();
    wh.update(1, { speedKmh: 150, distanceDelta: 41, oppositeLane: false, wheelie: true });
    const slow = new ScoreKeeper();
    slow.update(1, { speedKmh: 30, distanceDelta: 8, oppositeLane: false, wheelie: false });
    expect(opp.score).toBeGreaterThan(base.score);
    expect(wh.score).toBeGreaterThan(base.score);
    expect(slow.score).toBe(0);
    expect(opp.oppositeLaneTime).toBeCloseTo(1);
  });

  it('cash is non-negative and grows with score', () => {
    const k = new ScoreKeeper();
    expect(cashForRun(k.stats())).toBe(0);
    k.addBonus(12000);
    expect(cashForRun(k.stats())).toBe(1000);
  });
});
