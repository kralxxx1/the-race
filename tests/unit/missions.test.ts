import { describe, expect, it } from 'vitest';
import { LOWER_IS_BETTER, MISSIONS, type StarMetric } from '../../src/data/career';
import {
  KEEP_SPEED_GRACE,
  MissionTracker,
  failReasonText,
  fmtClock,
  fmtKm,
  formatMetric,
  missionHud,
  objectiveText,
  secondaryText,
  starRuleText,
  starsFor,
} from '../../src/game/missions';
import { feeder, mk } from './helpers/mission';

describe('MissionTracker: distance', () => {
  it('tracks progress and completes at the target distance', () => {
    const f = feeder({ type: 'distance', meters: 1000 });
    f.rideMeters(500, 100);
    expect(f.tracker.progress).toBeCloseTo(0.5, 2);
    expect(f.tracker.status).toBe('running');
    f.rideMeters(520, 100);
    expect(f.tracker.status).toBe('complete');
    expect(f.tracker.progress).toBe(1);
    expect(f.tracker.stars).toBeGreaterThanOrEqual(1);
  });

  it('fails with timeUp when the time limit passes first', () => {
    const f = feeder({ type: 'distance', meters: 5000 }, { limit: { time: 30 } });
    f.ride(40, 100);
    expect(f.tracker.status).toBe('failed');
    expect(f.tracker.failReason).toBe('timeUp');
    expect(f.tracker.timeLeft).toBe(0);
  });

  it('completion wins over a limit reached on the same tick', () => {
    const t = new MissionTracker(mk({ type: 'distance', meters: 100 }, { limit: { time: 10 } }));
    t.update(1 / 60, { ...feederSample(), time: 10, distance: 100 });
    expect(t.status).toBe('complete');
  });

  it('counts the remaining clock down', () => {
    const f = feeder({ type: 'distance', meters: 5000 }, { limit: { time: 60 } });
    f.ride(10, 100);
    expect(f.tracker.timeLeft).toBeCloseTo(50, 1);
  });

  it('awards 3 stars for a fast run and 1 star for a slow one (time metric)', () => {
    const fast = feeder({ type: 'distance', meters: 1000 }, { stars: { metric: 'time', two: 40, three: 25 } });
    fast.rideMeters(1005, 200); // 18 s
    expect(fast.tracker.stars).toBe(3);
    const mid = feeder({ type: 'distance', meters: 1000 }, { stars: { metric: 'time', two: 40, three: 25 } });
    mid.rideMeters(1005, 120); // 30 s
    expect(mid.tracker.stars).toBe(2);
    const slow = feeder({ type: 'distance', meters: 1000 }, { stars: { metric: 'time', two: 40, three: 25 } });
    slow.rideMeters(1005, 60); // 60 s
    expect(slow.tracker.stars).toBe(1);
  });
});

function feederSample() {
  return feeder({ type: 'distance', meters: 1 }).s;
}

describe('MissionTracker: checkpoints', () => {
  const obj = { type: 'checkpoints', count: 3, spacing: 500, startTime: 20, bonusTime: 15 } as const;

  it('adds bonus time at each checkpoint and completes at the last one', () => {
    const f = feeder(obj, { stars: { metric: 'timeLeft', two: 10, three: 25 } });
    const events: string[] = [];
    f.rideMeters(520, 108, () => events.push(...f.tracker.events.splice(0).map((e) => e.type)));
    expect(f.tracker.checkpointIndex).toBe(1);
    expect(f.tracker.timeLeft).toBeGreaterThan(15); // 20 s - 17.3 s ridden + 15 s bonus
    f.rideMeters(1000, 108, () => events.push(...f.tracker.events.splice(0).map((e) => e.type)));
    expect(f.tracker.status).toBe('complete');
    events.push(...f.tracker.events.splice(0).map((e) => e.type));
    expect(events.filter((e) => e === 'checkpoint')).toHaveLength(2); // the last one completes instead
    expect(events).toContain('complete');
  });

  it('fails when the clock runs out before the next checkpoint', () => {
    const f = feeder(obj);
    f.rideMeters(480, 50); // ~35 s at 50 km/h: too slow for 500 m in 20 s
    expect(f.tracker.status).toBe('failed');
    expect(f.tracker.failReason).toBe('timeUp');
  });

  it('uses time left as the star metric', () => {
    const f = feeder(obj, { stars: { metric: 'timeLeft', two: 10, three: 20 } });
    f.rideMeters(1520, 200);
    expect(f.tracker.status).toBe('complete');
    expect(f.tracker.metricValue).toBeGreaterThan(20);
    expect(f.tracker.stars).toBe(3);
  });
});

describe('MissionTracker: counters', () => {
  it('overtakes', () => {
    const f = feeder({ type: 'overtakes', count: 5 });
    f.ride(10, 120, (s, i) => (s.overtakes = Math.floor(i / 100)));
    expect(f.tracker.status).toBe('complete');
    expect(f.tracker.progress).toBe(1);
  });

  it('near misses', () => {
    const f = feeder({ type: 'nearMisses', count: 3 });
    f.ride(1, 120, (s) => (s.nearMisses = 2));
    expect(f.tracker.progress).toBeCloseTo(2 / 3, 2);
    f.ride(1, 120, (s) => (s.nearMisses = 3));
    expect(f.tracker.status).toBe('complete');
  });

  it('combo uses the live or best combo', () => {
    const f = feeder({ type: 'combo', combo: 4 });
    f.ride(1, 120, (s) => ((s.combo = 2), (s.maxCombo = 2)));
    expect(f.tracker.status).toBe('running');
    f.ride(1, 120, (s) => ((s.combo = 0), (s.maxCombo = 4)));
    expect(f.tracker.status).toBe('complete');
  });

  it('score within a distance limit: completes in time, fails with distanceUp otherwise', () => {
    const ok = feeder({ type: 'score', points: 1000 }, { limit: { distance: 2000 } });
    ok.rideMeters(1500, 120, (s) => (s.score = s.distance * 0.6));
    expect(ok.tracker.status).toBe('running');
    ok.rideMeters(300, 120, (s) => (s.score = s.distance * 0.6));
    expect(ok.tracker.status).toBe('complete');
    const bad = feeder({ type: 'score', points: 5000 }, { limit: { distance: 2000 } });
    bad.rideMeters(2100, 120, (s) => (s.score = s.distance * 0.5));
    expect(bad.tracker.status).toBe('failed');
    expect(bad.tracker.failReason).toBe('distanceUp');
    expect(bad.tracker.distanceLeft).toBe(0);
  });

  it('reach top speed', () => {
    const f = feeder({ type: 'topSpeed', kmh: 200 });
    f.ride(1, 150);
    expect(f.tracker.progress).toBeCloseTo(0.75, 2);
    f.ride(1, 205);
    expect(f.tracker.status).toBe('complete');
    // The peak counts, not the current speed.
    const g = feeder({ type: 'topSpeed', kmh: 200 });
    g.ride(0.5, 210);
    expect(g.tracker.status).toBe('complete');
  });
});

describe('MissionTracker: opposite lane', () => {
  it('counts only metres ridden in the oncoming lanes', () => {
    const f = feeder({ type: 'oppositeLane', meters: 300 });
    f.rideMeters(500, 120); // never in the opposite lane
    expect(f.tracker.progress).toBe(0);
    let opp = 0;
    f.rideMeters(200, 120, (s) => {
      opp += s.distanceDelta;
      s.oppositeDistance = opp;
    });
    expect(f.tracker.progress).toBeCloseTo(200 / 300, 1);
    f.rideMeters(150, 120, (s) => {
      opp += s.distanceDelta;
      s.oppositeDistance = opp;
    });
    expect(f.tracker.status).toBe('complete');
  });
});

describe('MissionTracker: keep speed', () => {
  const obj = { type: 'keepSpeed', kmh: 100, meters: 1000, startWindow: 20 } as const;

  it('is not enforced until the target speed is reached once', () => {
    const f = feeder(obj);
    f.ride(5, 40);
    expect(f.tracker.status).toBe('running');
    expect(f.tracker.armed).toBe(false);
    f.ride(1, 105);
    expect(f.tracker.armed).toBe(true);
    expect(f.tracker.events.map((e) => e.type)).toContain('armed');
  });

  it('fails when the target is not reached within the start window', () => {
    const f = feeder(obj);
    f.ride(25, 80);
    expect(f.tracker.status).toBe('failed');
    expect(f.tracker.failReason).toBe('tooSlow');
  });

  it('fails when the speed stays below the target for longer than the grace period', () => {
    const f = feeder(obj);
    f.ride(2, 120);
    f.ride(KEEP_SPEED_GRACE + 0.3, 90);
    expect(f.tracker.status).toBe('failed');
    expect(f.tracker.failReason).toBe('tooSlow');
  });

  it('tolerates a dip shorter than the grace period', () => {
    const f = feeder(obj);
    f.ride(2, 120);
    f.ride(KEEP_SPEED_GRACE * 0.5, 90);
    f.ride(2, 120);
    expect(f.tracker.status).toBe('running');
  });

  it('only counts the distance held at or above the target', () => {
    const f = feeder(obj);
    f.rideMeters(400, 120);
    expect(f.tracker.heldDistance).toBeCloseTo(400, 0);
    f.rideMeters(650, 120);
    expect(f.tracker.status).toBe('complete');
  });
});

describe('MissionTracker: wheelie', () => {
  it('total distance mode accumulates', () => {
    const f = feeder({ type: 'wheelie', meters: 300, single: false });
    f.ride(5, 100, (s) => (s.wheelieDistance += s.distanceDelta * 0.5));
    expect(f.tracker.status).toBe('running');
    f.ride(20, 100, (s) => (s.wheelieDistance += s.distanceDelta * 0.5));
    expect(f.tracker.status).toBe('complete');
  });

  it('single mode needs one unbroken wheelie', () => {
    const f = feeder({ type: 'wheelie', meters: 100, single: true });
    // Many short wheelies add up to a lot of metres in total, but never 100 m in one go.
    f.ride(10, 100, (s, i) => {
      const on = i % 60 < 30;
      s.currentWheelie = on ? (s.currentWheelie || 0) + s.distanceDelta : 0;
      s.longestWheelie = Math.max(s.longestWheelie, s.currentWheelie);
      if (on) s.wheelieDistance += s.distanceDelta;
    });
    expect(f.s.wheelieDistance).toBeGreaterThan(100);
    expect(f.tracker.status).toBe('running');
    f.ride(5, 100, (s) => {
      s.currentWheelie += s.distanceDelta;
      s.longestWheelie = Math.max(s.longestWheelie, s.currentWheelie);
    });
    expect(f.tracker.status).toBe('complete');
  });
});

describe('MissionTracker: survive', () => {
  it('only time spent above the minimum speed counts', () => {
    const f = feeder({ type: 'survive', seconds: 20, minKmh: 80 });
    f.ride(10, 50);
    expect(f.tracker.aliveTime).toBe(0);
    f.ride(10, 100);
    expect(f.tracker.aliveTime).toBeCloseTo(10, 1);
    expect(f.tracker.status).toBe('running');
    f.ride(11, 100);
    expect(f.tracker.status).toBe('complete');
  });

  it('is failed by a crash', () => {
    const f = feeder({ type: 'survive', seconds: 20, minKmh: 80 });
    f.ride(5, 100);
    f.tracker.fail('crash');
    expect(f.tracker.status).toBe('failed');
    expect(f.tracker.failReason).toBe('crash');
    expect(f.tracker.result().stars).toBe(0);
  });
});

describe('MissionTracker: general behaviour', () => {
  it('every kind of mission fails on a crash and ignores updates afterwards', () => {
    const objs = [
      { type: 'distance', meters: 100 },
      { type: 'overtakes', count: 3 },
      { type: 'nearMisses', count: 3 },
      { type: 'combo', combo: 3 },
      { type: 'topSpeed', kmh: 100 },
    ] as const;
    for (const o of objs) {
      const f = feeder(o);
      f.ride(0.2, 10);
      f.tracker.fail('crash');
      expect(f.tracker.status).toBe('failed');
      f.s.distance = 1e6;
      f.s.overtakes = 99;
      f.s.nearMisses = 99;
      f.s.maxCombo = 99;
      f.s.topSpeed = 999;
      f.tracker.update(0.1, f.s);
      expect(f.tracker.status).toBe('failed');
      expect(f.tracker.result().status).toBe('failed');
      expect(f.tracker.result().failReason).toBe('crash');
    }
  });

  it('a decided mission cannot be failed again or changed', () => {
    const f = feeder({ type: 'distance', meters: 100 });
    f.rideMeters(110, 100);
    expect(f.tracker.status).toBe('complete');
    f.tracker.fail('crash');
    expect(f.tracker.status).toBe('complete');
    expect(f.tracker.result().status).toBe('complete');
  });

  it('secondary objective is evaluated at completion', () => {
    const f = feeder({ type: 'distance', meters: 500 }, { secondary: { kind: 'nearMisses', target: 5 } });
    f.ride(1, 100, (s) => (s.nearMisses = 4));
    expect(f.tracker.secondaryMet).toBe(false);
    f.rideMeters(500, 100, (s) => (s.nearMisses = 6));
    expect(f.tracker.status).toBe('complete');
    expect(f.tracker.result().secondaryMet).toBe(true);
    const g = feeder({ type: 'distance', meters: 500 }, { secondary: { kind: 'overtakes', target: 5 } });
    g.rideMeters(520, 100);
    expect(g.tracker.result().secondaryMet).toBe(false);
  });

  it('robust to NaN and negative inputs', () => {
    const t = new MissionTracker(mk({ type: 'distance', meters: 100 }));
    t.update(NaN, { ...feederSample(), distance: NaN, time: -3 });
    expect(Number.isFinite(t.progress)).toBe(true);
    expect(t.status).toBe('running');
  });

  it('result() reports failure reason, progress and metric', () => {
    const f = feeder({ type: 'distance', meters: 1000 }, { limit: { time: 20 } });
    f.ride(25, 60);
    const r = f.tracker.result();
    expect(r.status).toBe('failed');
    expect(r.failReason).toBe('timeUp');
    expect(r.progress).toBeGreaterThan(0.2);
    expect(r.progress).toBeLessThan(1);
  });
});

describe('stars', () => {
  it('starsFor handles lower-is-better and higher-is-better metrics at the boundaries', () => {
    const lower = { metric: 'time', two: 60, three: 40 } as const;
    expect(starsFor(lower, 100)).toBe(1);
    expect(starsFor(lower, 60)).toBe(2);
    expect(starsFor(lower, 41)).toBe(2);
    expect(starsFor(lower, 40)).toBe(3);
    expect(starsFor(lower, 5)).toBe(3);
    const higher = { metric: 'timeLeft', two: 10, three: 25 } as const;
    expect(starsFor(higher, 3)).toBe(1);
    expect(starsFor(higher, 10)).toBe(2);
    expect(starsFor(higher, 24.9)).toBe(2);
    expect(starsFor(higher, 25)).toBe(3);
  });

  it('every career mission has coherent star thresholds', () => {
    for (const d of MISSIONS) {
      const r = d.stars;
      if (LOWER_IS_BETTER[r.metric]) expect(r.three, d.id).toBeLessThan(r.two);
      else expect(r.three, d.id).toBeGreaterThan(r.two);
      expect(r.two, d.id).toBeGreaterThan(0);
      expect(r.three, d.id).toBeGreaterThan(0);
    }
  });

  it('all star metrics are measurable at completion', () => {
    const metrics: StarMetric[] = ['time', 'distanceUsed', 'timeLeft', 'avgSpeed', 'nearMisses', 'overtakes', 'score', 'maxCombo', 'topSpeed'];
    for (const metric of metrics) {
      const f = feeder({ type: 'distance', meters: 100 }, { stars: { metric, two: 1, three: 2 }, limit: { time: 60 } });
      f.s.score = 500;
      f.s.nearMisses = 3;
      f.s.overtakes = 4;
      f.s.maxCombo = 2;
      f.rideMeters(110, 100);
      expect(f.tracker.status, metric).toBe('complete');
      expect(Number.isFinite(f.tracker.metricValue), metric).toBe(true);
    }
  });
});

describe('texts and HUD view', () => {
  it('formats distances and clocks', () => {
    expect(fmtKm(450)).toBe('450 m');
    expect(fmtKm(2500)).toMatch(/^2,5 km$/);
    expect(fmtClock(65)).toBe('1:05');
    expect(fmtClock(0)).toBe('0:00');
    expect(fmtClock(-4)).toBe('0:00');
    expect(formatMetric('time', 125)).toBe('2:05');
    expect(formatMetric('maxCombo', 5)).toBe('x5');
  });

  it('describes every objective in Turkish', () => {
    for (const d of MISSIONS) {
      const text = objectiveText(d);
      expect(text.length, d.id).toBeGreaterThan(5);
      expect(text, d.id).not.toMatch(/undefined|NaN|\[object/);
      if (d.secondary) expect(secondaryText(d.secondary), d.id).not.toMatch(/undefined|NaN/);
      expect(starRuleText(d.stars, 2), d.id).toContain(d.stars.metric === 'time' ? 'Süre' : '');
    }
    expect(failReasonText('crash')).toBe('Kaza yaptın');
    expect(failReasonText('timeUp')).toBe('Süre doldu');
  });

  it('builds a live HUD view with progress, value and warning', () => {
    const f = feeder({ type: 'keepSpeed', kmh: 100, meters: 1000, startWindow: 20 }, { secondary: { kind: 'topSpeed', target: 150 } });
    f.ride(1, 40);
    let v = missionHud(f.tracker);
    expect(v.title).toContain('GÖREV 1');
    expect(v.value).toContain('100');
    expect(v.secondary).toContain('Bonus');
    f.ride(2, 120);
    f.ride(0.4, 80); // below the target but within the grace period: warn
    v = missionHud(f.tracker);
    expect(v.warn).toBe(true);
    expect(v.progress).toBeGreaterThan(0);
  });

  it('shows the checkpoint counter and a countdown for timed missions', () => {
    const f = feeder({ type: 'checkpoints', count: 3, spacing: 500, startTime: 40, bonusTime: 15 });
    f.rideMeters(200, 100);
    const v = missionHud(f.tracker);
    expect(v.value).toContain('0 / 3');
    expect(v.timeLeft).not.toBeNull();
  });
});
