import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID, type AchMetric } from '../../src/data/achievements';
import { DAILY_REWARDS } from '../../src/data/progression';
import {
  achContext,
  achievementProgress,
  grantAchievements,
  liveAchContext,
  metricValue,
  reachedAchievements,
  sanitizeAchievements,
  unlockedCount,
} from '../../src/game/achievements';
import { claimDaily, dailyStatus, dayKey, dayNumber, emptyDaily, rewardForStreak, sanitizeDaily } from '../../src/game/daily';
import {
  LEADERBOARD_SIZE,
  bestScore,
  boardKey,
  compareEntries,
  insertEntry,
  recordLeaderboard,
  sanitizeLeaderboards,
  type LeaderboardEntry,
  type Leaderboards,
} from '../../src/game/leaderboard';
import { levelForXp, xpForLevel } from '../../src/game/progression';
import { emptyRunStats } from '../../src/game/scoring';
import {
  STAT_KEYS,
  addRun,
  emptyStats,
  emptyStatsSave,
  mapsVisited,
  mergeStats,
  recordStats,
  sanitizeStatBlock,
  sanitizeStatsSave,
  type RunContribution,
} from '../../src/game/stats';
import { MemoryStore, SaveManager, defaultSave } from '../../src/storage/save';

const contribution = (over: Partial<ReturnType<typeof emptyRunStats>> = {}, extra: Partial<RunContribution> = {}): RunContribution => ({
  stats: { ...emptyRunStats(), ...over },
  crashed: false,
  missionCompleted: false,
  time: 'day',
  weather: 'clear',
  countRun: true,
  ...extra,
});

// ───────────────────────────── statistics ─────────────────────────────
describe('statistics', () => {
  it('accumulates sums and keeps records as maxima', () => {
    const b = emptyStats();
    addRun(b, contribution({ distance: 1000, time: 60, nearMisses: 3, overtakes: 5, topSpeed: 180, longestWheelie: 40, wheelieDistance: 60, oppositeDistance: 200, maxCombo: 3, score: 4000 }, { crashed: true }));
    addRun(b, contribution({ distance: 2500, time: 100, nearMisses: 1, overtakes: 2, topSpeed: 150, longestWheelie: 90, wheelieDistance: 90, oppositeDistance: 0, maxCombo: 5, score: 3000 }));
    expect(b).toMatchObject({
      runs: 2,
      distance: 3500,
      rideTime: 160,
      crashes: 1,
      nearMisses: 4,
      overtakes: 7,
      topSpeed: 180,
      longestWheelie: 90,
      wheelieDistance: 150,
      oppositeDistance: 200,
      maxCombo: 5,
      bestScore: 4000,
      bestDistance: 2500,
    });
  });

  it('splits distance by time of day and weather', () => {
    const b = emptyStats();
    addRun(b, contribution({ distance: 1000 }, { time: 'night' }));
    addRun(b, contribution({ distance: 500 }, { weather: 'rain' }));
    addRun(b, contribution({ distance: 300 }, { weather: 'snow', time: 'night' }));
    addRun(b, contribution({ distance: 200 }, { weather: 'fog' }));
    expect(b.nightDistance).toBe(1300);
    expect(b.rainDistance).toBe(500);
    expect(b.snowDistance).toBe(300);
    expect(b.fogDistance).toBe(200);
    expect(b.distance).toBe(2000);
  });

  it('does not count the run itself for live previews, and counts completed missions', () => {
    const b = emptyStats();
    addRun(b, contribution({ distance: 100 }, { countRun: false }));
    expect(b.runs).toBe(0);
    expect(b.distance).toBe(100);
    addRun(b, contribution({ distance: 100 }, { missionCompleted: true }));
    expect(b.missionsCompleted).toBe(1);
  });

  it('ignores negative and non-finite contributions', () => {
    const b = emptyStats();
    addRun(b, contribution({ distance: -50, nearMisses: -1, overtakes: -4, time: -9 }));
    expect(b.distance).toBe(0);
    expect(b.nearMisses).toBe(0);
    expect(b.rideTime).toBe(0);
  });

  it('records into lifetime, per-bike and per-map blocks', () => {
    const s = emptyStatsSave();
    recordStats(s, 'yamaha-r3', 'highway', contribution({ distance: 1200, topSpeed: 170 }));
    recordStats(s, 'yamaha-r3', 'city', contribution({ distance: 800, topSpeed: 190 }));
    recordStats(s, 'yamaha-r1', 'city', contribution({ distance: 100, topSpeed: 250 }));
    expect(s.lifetime.distance).toBe(2100);
    expect(s.lifetime.runs).toBe(3);
    expect(s.lifetime.topSpeed).toBe(250);
    expect(s.bikes['yamaha-r3'].distance).toBe(2000);
    expect(s.bikes['yamaha-r3'].topSpeed).toBe(190);
    expect(s.bikes['yamaha-r1'].runs).toBe(1);
    expect(s.maps.city?.distance).toBe(900);
    expect(s.maps.highway?.runs).toBe(1);
    expect(mapsVisited(s).sort()).toEqual(['city', 'highway']);
  });

  it('mergeStats sums counters and takes the better record', () => {
    const a = emptyStats();
    const b = emptyStats();
    a.distance = 100;
    a.topSpeed = 200;
    b.distance = 50;
    b.topSpeed = 150;
    const m = mergeStats(a, b);
    expect(m.distance).toBe(150);
    expect(m.topSpeed).toBe(200);
    expect(a.distance).toBe(100); // inputs untouched
  });

  it('sanitising clamps tampered values and drops unknown keys', () => {
    const b = sanitizeStatBlock({ distance: -5, runs: 3.9, topSpeed: 99999, maxCombo: 1e15, rideTime: 'abc', crashes: NaN, nearMisses: Infinity, bogus: 5 });
    expect(b.distance).toBe(0);
    expect(b.runs).toBe(3);
    expect(b.topSpeed).toBe(1000);
    expect(b.maxCombo).toBeLessThanOrEqual(1e6);
    expect(b.rideTime).toBe(0);
    expect(b.crashes).toBe(0);
    expect(b.nearMisses).toBe(0);
    expect(Object.keys(b).sort()).toEqual([...STAT_KEYS].sort());
    const s = sanitizeStatsSave({ lifetime: { runs: 2 }, bikes: { 'yamaha-r3': { runs: 1 }, 'ghost-bike': { runs: 9 } }, maps: { city: { runs: 1 }, atlantis: { runs: 4 } } });
    expect(s.lifetime.runs).toBe(2);
    expect(Object.keys(s.bikes)).toEqual(['yamaha-r3']);
    expect(Object.keys(s.maps)).toEqual(['city']);
    for (const bad of [null, 7, 'x', [], undefined]) expect(sanitizeStatsSave(bad)).toEqual(emptyStatsSave());
  });
});

// ───────────────────────────── achievements ─────────────────────────────
describe('achievement definitions', () => {
  it('has about 45+ achievements with tiers, rewards and Turkish text', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(45);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) {
      expect(a.title.length, a.id).toBeGreaterThan(2);
      expect(a.description.length, a.id).toBeGreaterThan(8);
      expect(a.target, a.id).toBeGreaterThan(0);
      expect(a.reward.cash, a.id).toBeGreaterThan(0);
      expect(a.reward.xp, a.id).toBeGreaterThanOrEqual(0);
      expect(ACHIEVEMENT_BY_ID.get(a.id)).toBe(a);
    }
  });

  it('tiers of a group are consecutive and grow in target and reward', () => {
    const groups = new Map<string, typeof ACHIEVEMENTS>();
    for (const a of ACHIEVEMENTS) groups.set(a.group, [...(groups.get(a.group) ?? []), a]);
    expect(groups.size).toBeGreaterThanOrEqual(18);
    for (const [g, list] of groups) {
      list.forEach((a, i) => {
        expect(a.tier, `${g} tier`).toBe(i + 1);
        if (i) {
          expect(a.target, `${g}`).toBeGreaterThan(list[i - 1].target);
          expect(a.metric, `${g}`).toBe(list[i - 1].metric);
        }
      });
    }
    expect(groups.get('dist')!.length).toBeGreaterThanOrEqual(3);
  });

  it('covers the required themes', () => {
    const metrics = new Set<AchMetric>(ACHIEVEMENTS.map((a) => a.metric));
    for (const m of ['distance', 'nearMisses', 'overtakes', 'topSpeed', 'wheelieDistance', 'oppositeDistance', 'missions', 'stars', 'mapsVisited', 'bikesOwned', 'nightDistance', 'rainDistance', 'snowDistance', 'maxCombo', 'crashes', 'rideTime'] as const) {
      expect(metrics.has(m), m).toBe(true);
    }
  });
});

describe('achievement unlocking', () => {
  it('a fresh save has no progress and nothing reached', () => {
    const d = defaultSave();
    const ctx = achContext(d);
    expect(reachedAchievements(d.achievements, ctx)).toHaveLength(0);
    for (const a of ACHIEVEMENTS) {
      if (a.metric === 'bikesOwned' || a.metric === 'level') continue;
      expect(achievementProgress(a, ctx), a.id).toBe(0);
    }
    expect(metricValue('bikesOwned', ctx)).toBe(1);
    expect(metricValue('level', ctx)).toBe(1);
  });

  it('reaches tiers as the lifetime statistics grow and pays each reward exactly once', () => {
    const d = defaultSave();
    d.stats.lifetime.distance = 120_000;
    d.stats.lifetime.nearMisses = 12;
    const cash0 = d.cash;
    const xp0 = d.xp;
    const g = grantAchievements(d, 1_700_000_000_000);
    const ids = g.unlocked.map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['dist-1', 'dist-2', 'near-1']));
    expect(ids).not.toContain('dist-3');
    expect(d.cash).toBe(cash0 + g.cash);
    expect(d.xp).toBe(xp0 + g.xp);
    expect(d.achievements['dist-1']).toBe(1_700_000_000_000);
    expect(unlockedCount(d.achievements)).toBe(ids.length);
    // A second pass pays nothing.
    const again = grantAchievements(d, 1_700_000_100_000);
    expect(again.unlocked).toHaveLength(0);
    expect(d.cash).toBe(cash0 + g.cash);
    expect(d.achievements['dist-1']).toBe(1_700_000_000_000);
  });

  it('reward XP can raise the level and unlock a level achievement in the same pass', () => {
    const d = defaultSave();
    d.xp = xpForLevel(10) - 50;
    d.stats.lifetime.distance = 10_000; // dist-1 pays 100 XP: level 10 is reached
    const g = grantAchievements(d, 5);
    expect(levelForXp(d.xp)).toBeGreaterThanOrEqual(10);
    expect(g.unlocked.map((a) => a.id)).toContain('lvl-1');
  });

  it('career, star, map, bike and daily metrics come from the save', () => {
    const d = defaultSave();
    d.career.missions['suburb-01'] = { stars: 3, attempts: 1, completions: 1, best: 1, secondary: false };
    d.stats.maps.highway = { ...emptyStats(), runs: 1 };
    d.stats.maps.city = { ...emptyStats(), runs: 2 };
    d.stats.maps.coast = { ...emptyStats(), runs: 1 };
    d.ownedBikes = ['yamaha-r3', 'yamaha-r1'];
    d.daily = { lastDay: '2025-01-07', streak: 7, claims: 7 };
    const c = achContext(d);
    expect(metricValue('missions', c)).toBe(1);
    expect(metricValue('stars', c)).toBe(3);
    expect(metricValue('mapsVisited', c)).toBe(3);
    expect(metricValue('bikesOwned', c)).toBe(2);
    expect(metricValue('dailyStreak', c)).toBe(7);
    const ids = reachedAchievements(d.achievements, c).map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['car-1', 'map-1', 'bike-1', 'daily-1']));
  });

  it('live context includes the run in progress so toasts can fire before the run is saved', () => {
    const d = defaultSave();
    const run = contribution({ nearMisses: 10, distance: 3000, topSpeed: 205 }, { countRun: false });
    const live = liveAchContext(d, run, 'desert', 0);
    const ids = reachedAchievements(d.achievements, live).map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['near-1', 'speed-1']));
    expect(live.mapsVisited).toBe(1); // first ride on a new map counts at once
    // The save itself is untouched.
    expect(d.stats.lifetime.nearMisses).toBe(0);
    // Skipping already-toasted ids.
    expect(reachedAchievements(d.achievements, live, new Set(['near-1'])).map((a) => a.id)).not.toContain('near-1');
    // Reward-free XP from riding raises the live level.
    const lvl = liveAchContext(d, run, 'desert', xpForLevel(6));
    expect(lvl.level).toBe(6);
  });

  it('a crash counts live as soon as it happens', () => {
    const d = defaultSave();
    const live = liveAchContext(d, contribution({ distance: 10 }, { crashed: true, countRun: false }), 'highway', 0);
    expect(reachedAchievements(d.achievements, live).map((a) => a.id)).toContain('crash-1');
  });

  it('buying bikes and claiming the daily reward can unlock achievements', () => {
    const m = new SaveManager(new MemoryStore());
    m.data.cash = 100_000;
    expect(m.buy('honda-cb500-hornet')).toBe(true);
    expect(m.lastUnlocks.map((a) => a.id)).toContain('bike-1');
    expect(m.data.achievements['bike-1']).toBeGreaterThan(0);
    expect(m.buy('ktm-390-duke')).toBe(true);
    expect(m.lastUnlocks.map((a) => a.id)).not.toContain('bike-1'); // already unlocked
  });

  it('progress is a clamped fraction', () => {
    const d = defaultSave();
    d.stats.lifetime.distance = 5000;
    const a = ACHIEVEMENT_BY_ID.get('dist-1')!;
    expect(achievementProgress(a, achContext(d))).toBeCloseTo(0.5, 5);
    d.stats.lifetime.distance = 5e9;
    expect(achievementProgress(a, achContext(d))).toBe(1);
  });

  it('sanitising drops unknown ids and repairs times', () => {
    const r = sanitizeAchievements({ 'dist-1': 1700000000000, 'dist-2': 'x', 'nope-1': 5, 'near-1': -3, 'near-2': Infinity, 'near-3': 1e300 });
    expect(r['dist-1']).toBe(1700000000000);
    expect(r['dist-2']).toBe(0);
    expect(r['nope-1']).toBeUndefined();
    expect(r['near-1']).toBe(0);
    expect(r['near-2']).toBe(0);
    expect(r['near-3']).toBeLessThanOrEqual(8.64e15);
    for (const bad of [null, 3, 'x', [], undefined]) expect(sanitizeAchievements(bad)).toEqual({});
  });
});

// ───────────────────────────── leaderboards ─────────────────────────────
describe('leaderboards', () => {
  const e = (score: number, distance = 1000, date = 1000, bike = 'yamaha-r3'): LeaderboardEntry => ({ score, distance, date, bike });

  it('keeps entries sorted by score, then distance, then the older entry', () => {
    const board: LeaderboardEntry[] = [];
    insertEntry(board, e(500));
    insertEntry(board, e(900));
    insertEntry(board, e(700));
    insertEntry(board, e(700, 2000, 5000)); // same score, longer: ahead of the earlier one
    insertEntry(board, e(700, 2000, 4000)); // same score and distance, older: ahead
    expect(board.map((x) => x.score)).toEqual([900, 700, 700, 700, 500]);
    expect(board[1]).toMatchObject({ distance: 2000, date: 4000 });
    expect(board[2]).toMatchObject({ distance: 2000, date: 5000 });
    expect(board[3]).toMatchObject({ distance: 1000 });
  });

  it('returns the 1-based rank and truncates to the top 10', () => {
    const board: LeaderboardEntry[] = [];
    for (let i = 1; i <= 10; i++) expect(insertEntry(board, e(i * 100))).toBe(1); // each one is the new best
    expect(board).toHaveLength(LEADERBOARD_SIZE);
    expect(insertEntry(board, e(50))).toBeNull(); // too low for a full board
    expect(board).toHaveLength(LEADERBOARD_SIZE);
    expect(board[9].score).toBe(100);
    expect(insertEntry(board, e(350))).toBe(8);
    expect(board).toHaveLength(LEADERBOARD_SIZE);
    expect(board.map((x) => x.score)).toEqual([1000, 900, 800, 700, 600, 500, 400, 350, 300, 200]);
    expect(board.some((x) => x.score === 100)).toBe(false);
  });

  it('ignores zero and negative scores', () => {
    const board: LeaderboardEntry[] = [];
    expect(insertEntry(board, e(0))).toBeNull();
    expect(insertEntry(board, e(-5))).toBeNull();
    expect(insertEntry(board, e(NaN))).toBeNull();
    expect(board).toHaveLength(0);
  });

  it('keeps one table per mode and map', () => {
    const lb: Leaderboards = {};
    expect(recordLeaderboard(lb, 'endless', 'highway', e(1000))).toBe(1);
    expect(recordLeaderboard(lb, 'endless', 'city', e(400))).toBe(1);
    expect(recordLeaderboard(lb, 'twoway', 'highway', e(300))).toBe(1);
    expect(recordLeaderboard(lb, 'endless', 'highway', e(800))).toBe(2);
    expect(Object.keys(lb).sort()).toEqual(['endless:city', 'endless:highway', 'twoway:highway']);
    expect(bestScore(lb, 'endless', 'highway')).toBe(1000);
    expect(bestScore(lb, 'freeride', 'snow')).toBe(0);
    expect(recordLeaderboard(lb, 'timetrial', 'snow', e(0))).toBeNull();
    expect(lb[boardKey('timetrial', 'snow')]).toBeUndefined();
  });

  it('compareEntries is a consistent total order', () => {
    const a = e(100, 10, 1);
    const b = e(100, 10, 2);
    expect(compareEntries(a, b)).toBeLessThan(0);
    expect(compareEntries(b, a)).toBeGreaterThan(0);
    expect(compareEntries(a, a)).toBe(0);
  });

  it('sanitising repairs, sorts and truncates tampered tables', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ score: 1000 + i, distance: i, bike: 'yamaha-r3', date: i }));
    const lb = sanitizeLeaderboards({
      'endless:highway': [{ score: 10, distance: 5, bike: 'yamaha-r3', date: 3 }, { score: 99999, distance: -1, bike: 'yamaha-r3', date: 'x' }, { score: -5, bike: 'yamaha-r3' }, { score: 5, bike: 'ghost' }, 'junk'],
      'twoway:city': many,
      'career:city': [{ score: 5, bike: 'yamaha-r3' }], // career has no board
      'endless:atlantis': [{ score: 5, bike: 'yamaha-r3' }],
      'endless:highway:extra': [],
      'freeride:snow': 'nope',
    });
    expect(Object.keys(lb).sort()).toEqual(['endless:highway', 'twoway:city']);
    expect(lb['endless:highway'].map((x) => x.score)).toEqual([99999, 10]);
    expect(lb['endless:highway'][0]).toMatchObject({ distance: 0, date: 0 });
    expect(lb['twoway:city']).toHaveLength(LEADERBOARD_SIZE);
    expect(lb['twoway:city'][0].score).toBe(1039);
    for (const bad of [null, 5, 'x', [], undefined]) expect(sanitizeLeaderboards(bad)).toEqual({});
  });
});

// ───────────────────────────── daily reward ─────────────────────────────
describe('daily reward', () => {
  const at = (y: number, mo: number, d: number, h = 12, mi = 0) => new Date(y, mo - 1, d, h, mi, 0);

  it('formats local calendar days and validates keys', () => {
    expect(dayKey(at(2025, 3, 9))).toBe('2025-03-09');
    expect(dayKey(at(2025, 12, 31, 23, 59))).toBe('2025-12-31');
    expect(dayNumber('1970-01-02')).toBe(1);
    expect(dayNumber('2024-02-29')).not.toBeNull();
    for (const bad of ['2025-02-30', '2025-13-01', '25-01-01', 'today', '2025-1-1', '', '2025-00-10']) expect(dayNumber(bad), bad).toBeNull();
    expect(dayNumber('2024-03-01')! - dayNumber('2024-02-29')!).toBe(1);
    expect(dayNumber('2025-01-01')! - dayNumber('2024-12-31')!).toBe(1);
  });

  it('the first claim is available and pays day 1', () => {
    const st = emptyDaily();
    const s = dailyStatus(st, at(2025, 5, 1));
    expect(s.availability).toBe('available');
    expect(s.nextStreak).toBe(1);
    expect(s.reward).toEqual(DAILY_REWARDS[0]);
    const r = claimDaily(st, at(2025, 5, 1))!;
    expect(r).toMatchObject({ cash: DAILY_REWARDS[0].cash, xp: DAILY_REWARDS[0].xp, streak: 1 });
    expect(st).toEqual({ lastDay: '2025-05-01', streak: 1, claims: 1 });
  });

  it('cannot be claimed twice on the same day, even right before midnight', () => {
    const st = emptyDaily();
    expect(claimDaily(st, at(2025, 5, 1, 0, 0))).not.toBeNull();
    expect(claimDaily(st, at(2025, 5, 1, 9, 30))).toBeNull();
    expect(claimDaily(st, at(2025, 5, 1, 23, 59))).toBeNull();
    expect(dailyStatus(st, at(2025, 5, 1, 23, 59)).availability).toBe('claimed');
    expect(st.claims).toBe(1);
    expect(st.streak).toBe(1);
  });

  it('consecutive days grow the streak and the reward; the ladder tops out', () => {
    const st = emptyDaily();
    let prevCash = 0;
    for (let day = 1; day <= 10; day++) {
      const r = claimDaily(st, at(2025, 5, day))!;
      expect(r.streak).toBe(day);
      expect(r.cash).toBeGreaterThanOrEqual(prevCash);
      prevCash = r.cash;
    }
    expect(st.streak).toBe(10);
    expect(prevCash).toBe(DAILY_REWARDS[DAILY_REWARDS.length - 1].cash);
    expect(rewardForStreak(1)).toEqual(DAILY_REWARDS[0]);
    expect(rewardForStreak(999)).toEqual(DAILY_REWARDS[DAILY_REWARDS.length - 1]);
    expect(rewardForStreak(0)).toEqual(DAILY_REWARDS[0]);
  });

  it('a missed day resets the streak to 1', () => {
    const st = emptyDaily();
    claimDaily(st, at(2025, 5, 1));
    claimDaily(st, at(2025, 5, 2));
    claimDaily(st, at(2025, 5, 3));
    expect(st.streak).toBe(3);
    expect(dailyStatus(st, at(2025, 5, 5)).nextStreak).toBe(1);
    const r = claimDaily(st, at(2025, 5, 5))!;
    expect(r.streak).toBe(1);
    expect(r.cash).toBe(DAILY_REWARDS[0].cash);
    expect(st.claims).toBe(4);
  });

  it('works across month and year boundaries and leap days', () => {
    const st = emptyDaily();
    claimDaily(st, at(2024, 2, 28));
    expect(claimDaily(st, at(2024, 2, 29))!.streak).toBe(2);
    expect(claimDaily(st, at(2024, 3, 1))!.streak).toBe(3);
    const y = emptyDaily();
    claimDaily(y, at(2024, 12, 31, 23, 50));
    expect(claimDaily(y, at(2025, 1, 1, 0, 10))!.streak).toBe(2);
  });

  it('survives daylight-saving jumps (days are calendar dates, not 24 h blocks)', () => {
    // Local midnight around a DST change: whatever the host time zone does, consecutive dates stay consecutive.
    const st = emptyDaily();
    for (const [m, d] of [[3, 29], [3, 30], [3, 31], [4, 1]] as const) expect(claimDaily(st, at(2024, m, d, 0, 30))).not.toBeNull();
    expect(st.streak).toBe(4);
    const oct = emptyDaily();
    for (const [m, d] of [[10, 26], [10, 27], [10, 28]] as const) expect(claimDaily(oct, at(2024, m, d, 23, 30))).not.toBeNull();
    expect(oct.streak).toBe(3);
  });

  it('setting the clock back never allows a second claim and never lowers anything', () => {
    const st = emptyDaily();
    claimDaily(st, at(2025, 6, 10));
    claimDaily(st, at(2025, 6, 11));
    const before = JSON.stringify(st);
    const s = dailyStatus(st, at(2025, 6, 8));
    expect(s.availability).toBe('clockBehind');
    expect(claimDaily(st, at(2025, 6, 8))).toBeNull();
    expect(claimDaily(st, at(2025, 6, 10))).toBeNull();
    expect(claimDaily(st, at(2025, 6, 11))).toBeNull();
    expect(JSON.stringify(st)).toBe(before);
    // The calendar catching up again resumes normally.
    expect(claimDaily(st, at(2025, 6, 12))!.streak).toBe(3);
  });

  it('setting the clock far forward, claiming, then back does not allow farming', () => {
    const st = emptyDaily();
    claimDaily(st, at(2025, 6, 1));
    expect(claimDaily(st, at(2030, 1, 1))!.streak).toBe(1); // a gap: the streak restarts
    expect(claimDaily(st, at(2025, 6, 2))).toBeNull(); // back in 2025: nothing until the calendar passes 2030-01-01
    expect(claimDaily(st, at(2030, 1, 1, 22))).toBeNull();
    expect(st.claims).toBe(2);
  });

  it('never produces negative or NaN rewards for any clock value', () => {
    const st = emptyDaily();
    // An unreadable clock yields no claim and leaves the state alone.
    for (const bad of [new Date(NaN), new Date(8.64e15)]) {
      expect(claimDaily(st, bad)).toBeNull();
      expect(st).toEqual(emptyDaily());
    }
    const odd = [new Date(0), at(1999, 12, 31), at(2100, 1, 1)];
    for (const now of odd) {
      const r = claimDaily(st, now);
      if (r) {
        expect(r.cash).toBeGreaterThan(0);
        expect(r.xp).toBeGreaterThan(0);
        expect(Number.isFinite(r.cash)).toBe(true);
      }
      const s = dailyStatus(st, now);
      expect(s.nextStreak).toBeGreaterThanOrEqual(1);
      expect(Number.isFinite(s.reward.cash)).toBe(true);
    }
  });

  it('sanitising repairs tampered state', () => {
    expect(sanitizeDaily({ lastDay: '2025-02-30', streak: 9, claims: 4 })).toEqual({ lastDay: null, streak: 0, claims: 4 });
    expect(sanitizeDaily({ lastDay: '2025-02-01', streak: -4, claims: -1 })).toEqual({ lastDay: '2025-02-01', streak: 0, claims: 0 });
    expect(sanitizeDaily({ lastDay: '2025-02-01', streak: 1e30, claims: NaN }).streak).toBeLessThanOrEqual(100_000);
    for (const bad of [null, 4, 'x', [], undefined]) expect(sanitizeDaily(bad)).toEqual(emptyDaily());
  });

  it('SaveManager pays cash and XP once per day with an injected clock', () => {
    const m = new SaveManager(new MemoryStore());
    const cash = m.data.cash;
    const r = m.claimDaily(at(2025, 7, 1))!;
    expect(m.data.cash).toBe(cash + r.cash + m.lastUnlocks.reduce((a, x) => a + x.reward.cash, 0));
    expect(m.data.xp).toBeGreaterThanOrEqual(r.xp);
    const afterFirst = JSON.stringify(m.data);
    expect(m.claimDaily(at(2025, 7, 1, 20))).toBeNull();
    expect(JSON.stringify(m.data)).toBe(afterFirst);
    expect(m.claimDaily(at(2025, 7, 2))!.streak).toBe(2);
    // Resetting progress keeps the claim state so a reset cannot be used to claim again the same day.
    m.reset();
    expect(m.claimDaily(at(2025, 7, 2, 21))).toBeNull();
    expect(m.claimDaily(at(2025, 7, 3))!.streak).toBe(3);
  });
});
