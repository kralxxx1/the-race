import { describe, expect, it } from 'vitest';
import { BIKES, BIKE_BY_ID, STARTER_BIKE_ID } from '../../src/data/bikes';
import { MISSIONS } from '../../src/data/career';
import { MAPS } from '../../src/data/maps';
import {
  BIKE_UNLOCK_LEVEL,
  CAREER_BIKE_REWARDS,
  DAILY_REWARDS,
  MAX_LEVEL,
  PRICE_TIERS,
  REPLAY_XP_SHARE,
  STAR_XP_SHARE,
  levelForPrice,
  xpToNextLevel,
} from '../../src/data/progression';
import {
  completedCount,
  currentMission,
  emptyCareer,
  isCareerMapUnlocked,
  isCompleted,
  isMissionUnlocked,
  missionRecord,
  missionUnlockingBike,
  sanitizeCareer,
  totalStars,
  type CareerSave,
} from '../../src/game/careerProgress';
import {
  bikeLockText,
  bikeUnlockLevel,
  isBikeUnlocked,
  isMapUnlocked,
  levelForXp,
  levelProgress,
  missionXp,
  xpForLevel,
  xpForRun,
} from '../../src/game/progression';
import { MemoryStore, SaveManager, STARTING_CASH } from '../../src/storage/save';

describe('XP curve', () => {
  it('needs more XP for every level and starts at level 1 with 0 XP', () => {
    expect(xpForLevel(1)).toBe(0);
    let prev = 0;
    for (let l = 1; l < MAX_LEVEL; l++) {
      const need = xpToNextLevel(l);
      expect(need, `level ${l}`).toBeGreaterThan(0);
      expect(need, `level ${l}`).toBeGreaterThanOrEqual(prev);
      expect(Number.isInteger(need)).toBe(true);
      prev = need;
    }
    for (let l = 2; l <= MAX_LEVEL; l++) expect(xpForLevel(l)).toBeGreaterThan(xpForLevel(l - 1));
  });

  it('levelForXp inverts xpForLevel exactly at the boundaries', () => {
    for (let l = 1; l <= MAX_LEVEL; l++) {
      expect(levelForXp(xpForLevel(l)), `level ${l}`).toBe(l);
      if (l > 1) expect(levelForXp(xpForLevel(l) - 1), `just below ${l}`).toBe(l - 1);
    }
    expect(levelForXp(1e12)).toBe(MAX_LEVEL);
    expect(levelForXp(-50)).toBe(1);
    expect(levelForXp(NaN)).toBe(1);
    expect(levelForXp(Infinity)).toBe(1); // not finite: treated as a corrupted value
  });

  it('is monotonic over a dense sweep of XP values', () => {
    let last = 1;
    for (let xp = 0; xp < xpForLevel(MAX_LEVEL) + 5000; xp += 137) {
      const l = levelForXp(xp);
      expect(l).toBeGreaterThanOrEqual(last);
      last = l;
    }
    expect(last).toBe(MAX_LEVEL);
  });

  it('level 50 is a long-term goal but the early levels come quickly', () => {
    expect(xpForLevel(2)).toBeLessThanOrEqual(400); // a mission or two
    expect(xpForLevel(10)).toBeLessThanOrEqual(8000);
    expect(xpForLevel(MAX_LEVEL)).toBeGreaterThan(150_000);
    // Completing the whole career for the first time lands in the middle of the ladder.
    const careerXp = MISSIONS.reduce((a, d) => a + d.rewards.xp * (1 + STAR_XP_SHARE * 3), 0);
    expect(levelForXp(careerXp)).toBeGreaterThanOrEqual(18);
    expect(levelForXp(careerXp)).toBeLessThan(MAX_LEVEL);
  });

  it('levelProgress reports the fraction inside the current level', () => {
    const p0 = levelProgress(0);
    expect(p0).toMatchObject({ level: 1, into: 0, max: false });
    expect(p0.span).toBe(xpToNextLevel(1));
    const mid = levelProgress(xpForLevel(5) + xpToNextLevel(5) / 2);
    expect(mid.level).toBe(5);
    expect(mid.fraction).toBeCloseTo(0.5, 2);
    const max = levelProgress(xpForLevel(MAX_LEVEL) + 99999);
    expect(max).toMatchObject({ level: MAX_LEVEL, fraction: 1, max: true });
  });
});

describe('XP sources', () => {
  it('riding XP grows with distance, near misses, overtakes, opposite lane, wheelies and combos', () => {
    const base = { distance: 0, nearMisses: 0, overtakes: 0, oppositeDistance: 0, wheelieDistance: 0, maxCombo: 0 };
    expect(xpForRun(base)).toBe(0);
    for (const k of ['distance', 'nearMisses', 'overtakes', 'oppositeDistance', 'wheelieDistance'] as const) {
      expect(xpForRun({ ...base, [k]: 1000 }), k).toBeGreaterThan(0);
    }
    expect(xpForRun({ ...base, maxCombo: 5 })).toBeGreaterThan(xpForRun({ ...base, maxCombo: 2 }));
    expect(xpForRun({ ...base, distance: NaN, nearMisses: -5 })).toBe(0);
  });

  it('mission XP: first clear pays in full, replays a share, new stars a bonus', () => {
    const d = MISSIONS[0];
    const first = missionXp(d, true, 1);
    const replay = missionXp(d, false, 0);
    expect(first).toBeGreaterThan(replay);
    expect(replay).toBe(Math.round(d.rewards.xp * REPLAY_XP_SHARE));
    expect(missionXp(d, false, 2)).toBeGreaterThan(replay);
    expect(missionXp(d, true, -3)).toBe(Math.round(d.rewards.xp));
  });
});

describe('bike unlocks', () => {
  it('every bike has an unlock level; starters are level 1; the table follows the price', () => {
    for (const b of BIKES) {
      const lvl = BIKE_UNLOCK_LEVEL.get(b.id);
      expect(lvl, b.id).toBeDefined();
      expect(lvl!, b.id).toBeGreaterThanOrEqual(1);
      expect(lvl!, b.id).toBeLessThanOrEqual(MAX_LEVEL);
      expect(bikeUnlockLevel(b.id)).toBe(lvl);
    }
    expect(bikeUnlockLevel(STARTER_BIKE_ID)).toBe(1);
    const cheap = BIKES.filter((b) => b.price <= 6500);
    expect(cheap.length).toBeGreaterThanOrEqual(5);
    for (const b of cheap) expect(bikeUnlockLevel(b.id)).toBe(1);
    // Price tiers are sorted, so a pricier bike never unlocks earlier than a cheaper one.
    const sorted = [...BIKES].sort((a, b) => a.price - b.price);
    for (let i = 1; i < sorted.length; i++) expect(bikeUnlockLevel(sorted[i].id)).toBeGreaterThanOrEqual(bikeUnlockLevel(sorted[i - 1].id));
    for (let i = 1; i < PRICE_TIERS.length; i++) {
      expect(PRICE_TIERS[i][0]).toBeGreaterThan(PRICE_TIERS[i - 1][0]);
      expect(PRICE_TIERS[i][1]).toBeGreaterThanOrEqual(PRICE_TIERS[i - 1][1]);
    }
    expect(levelForPrice(1e9)).toBeGreaterThan(30);
    expect(bikeUnlockLevel('does-not-exist')).toBe(MAX_LEVEL);
  });

  it('the headline superbikes are late unlocks', () => {
    expect(bikeUnlockLevel('kawasaki-h2r')).toBeGreaterThanOrEqual(35);
    expect(bikeUnlockLevel('ducati-panigale-v4s')).toBeGreaterThanOrEqual(25);
  });

  it('a locked bike cannot be bought, however rich the rider is', () => {
    const m = new SaveManager(new MemoryStore());
    m.data.cash = 5_000_000;
    expect(m.isBikeUnlocked('kawasaki-h2r')).toBe(false);
    expect(m.buy('kawasaki-h2r')).toBe(false);
    expect(m.owns('kawasaki-h2r')).toBe(false);
    expect(m.data.cash).toBe(5_000_000);
  });

  it('reaching the level unlocks the bike for purchase', () => {
    const m = new SaveManager(new MemoryStore());
    m.data.cash = 5_000_000;
    const id = 'yamaha-r6';
    const need = bikeUnlockLevel(id);
    m.data.xp = xpForLevel(need) - 1;
    expect(m.buy(id)).toBe(false);
    m.data.xp = xpForLevel(need);
    expect(m.buy(id)).toBe(true);
    expect(m.owns(id)).toBe(true);
  });

  it('a career milestone unlocks its bike before its level would', () => {
    const m = new SaveManager(new MemoryStore());
    m.data.cash = 5_000_000;
    const id = CAREER_BIKE_REWARDS[7]; // the last map's reward: Kawasaki H2R
    expect(bikeUnlockLevel(id)).toBeGreaterThan(levelForXp(m.data.xp));
    expect(m.buy(id)).toBe(false);
    const mission = missionUnlockingBike(id)!;
    expect(mission.number).toBe(80);
    m.data.career.missions[mission.id] = { stars: 1, attempts: 1, completions: 1, best: 100, secondary: false };
    expect(m.isBikeUnlocked(id)).toBe(true);
    expect(m.buy(id)).toBe(true);
  });

  it('owned bikes stay available even if the level is lower (e.g. after a progress reset)', () => {
    const st = { xp: 0, ownedBikes: [STARTER_BIKE_ID, 'kawasaki-h2r'], career: emptyCareer() };
    expect(isBikeUnlocked(st, 'kawasaki-h2r')).toBe(true);
    expect(isBikeUnlocked({ ...st, ownedBikes: [STARTER_BIKE_ID] }, 'kawasaki-h2r')).toBe(false);
    expect(isBikeUnlocked(st, 'no-such-bike')).toBe(false);
  });

  it('explains how to unlock a locked bike', () => {
    expect(bikeLockText(BIKE_BY_ID.get('kawasaki-h2r')!)).toMatch(/Seviye \d+ veya Görev 80/);
    expect(bikeLockText(BIKE_BY_ID.get('suzuki-hayabusa')!)).toMatch(/^Seviye \d+$/);
  });

  it('free-play maps unlock with the rider level', () => {
    for (const m of MAPS) {
      expect(isMapUnlocked(xpForLevel(m.unlockLevel), m.id), m.id).toBe(true);
      if (m.unlockLevel > 1) expect(isMapUnlocked(xpForLevel(m.unlockLevel) - 1, m.id), m.id).toBe(false);
    }
    expect(isMapUnlocked(0, 'suburb')).toBe(true);
    expect(isMapUnlocked(0, 'industrial')).toBe(false);
  });
});

describe('career unlock chain', () => {
  const done = (ids: string[]): CareerSave => {
    const c = emptyCareer();
    for (const id of ids) c.missions[id] = { stars: 1, attempts: 1, completions: 1, best: 1, secondary: false };
    return c;
  };

  it('the first mission is open, the others unlock one after another', () => {
    const c = emptyCareer();
    expect(isMissionUnlocked(c, 'suburb-01')).toBe(true);
    expect(isMissionUnlocked(c, 'suburb-02')).toBe(false);
    expect(currentMission(c)?.id).toBe('suburb-01');
    const c1 = done(['suburb-01']);
    expect(isMissionUnlocked(c1, 'suburb-02')).toBe(true);
    expect(isMissionUnlocked(c1, 'suburb-03')).toBe(false);
    expect(currentMission(c1)?.id).toBe('suburb-02');
  });

  it("a map's first mission opens when the previous map's last mission is done", () => {
    const suburb = MISSIONS.filter((d) => d.map === 'suburb').map((d) => d.id);
    expect(isMissionUnlocked(done(suburb.slice(0, 9)), 'highway-01')).toBe(false);
    expect(isCareerMapUnlocked(done(suburb.slice(0, 9)), 'highway')).toBe(false);
    expect(isMissionUnlocked(done(suburb), 'highway-01')).toBe(true);
    expect(isCareerMapUnlocked(done(suburb), 'highway')).toBe(true);
    expect(isCareerMapUnlocked(emptyCareer(), 'suburb')).toBe(true);
    expect(isCareerMapUnlocked(emptyCareer(), 'snow')).toBe(false);
  });

  it('unknown missions are locked; a finished career has no current mission', () => {
    expect(isMissionUnlocked(emptyCareer(), 'bogus-01')).toBe(false);
    const all = done(MISSIONS.map((d) => d.id));
    expect(currentMission(all)).toBeNull();
    expect(completedCount(all)).toBe(80);
    expect(completedCount(all, 'snow')).toBe(10);
  });

  it('counts stars overall and per map', () => {
    const c = done(['suburb-01', 'suburb-02', 'highway-01']);
    c.missions['suburb-01'].stars = 3;
    c.missions['suburb-02'].stars = 2;
    c.missions['highway-01'].stars = 1;
    expect(totalStars(c)).toBe(6);
    expect(totalStars(c, 'suburb')).toBe(5);
    expect(totalStars(c, 'highway')).toBe(1);
    expect(isCompleted(c, 'suburb-01')).toBe(true);
    expect(missionRecord(c, 'suburb-05')).toMatchObject({ stars: 0, completions: 0, attempts: 0 });
  });

  it('sanitizeCareer rejects tampered records', () => {
    const c = sanitizeCareer({
      missions: {
        'suburb-01': { stars: 99, completions: 5, attempts: 2, best: -4, secondary: 'yes' },
        'suburb-02': { stars: 3, completions: 0, attempts: 1 },
        'nope-01': { stars: 3, completions: 1 },
        'highway-01': 'garbage',
        'highway-02': { stars: NaN, completions: Infinity, attempts: -9, best: 'x' },
      },
    });
    expect(c.missions['suburb-01']).toMatchObject({ stars: 3, completions: 5, attempts: 5, best: null, secondary: false });
    expect(c.missions['suburb-02']).toMatchObject({ stars: 0, completions: 0 }); // never completed: no stars
    expect(c.missions['nope-01']).toBeUndefined();
    expect(c.missions['highway-01']).toBeUndefined();
    expect(c.missions['highway-02']).toMatchObject({ stars: 0, completions: 0, attempts: 0 });
    for (const bad of [null, undefined, 5, 'x', [], { missions: [] }, { missions: null }]) expect(sanitizeCareer(bad)).toEqual(emptyCareer());
  });
});

describe('daily reward ladder', () => {
  it('pays more every day and never pays nothing', () => {
    expect(DAILY_REWARDS.length).toBeGreaterThanOrEqual(5);
    for (let i = 0; i < DAILY_REWARDS.length; i++) {
      expect(DAILY_REWARDS[i].cash).toBeGreaterThan(0);
      expect(DAILY_REWARDS[i].xp).toBeGreaterThan(0);
      if (i) {
        expect(DAILY_REWARDS[i].cash).toBeGreaterThan(DAILY_REWARDS[i - 1].cash);
        expect(DAILY_REWARDS[i].xp).toBeGreaterThan(DAILY_REWARDS[i - 1].xp);
      }
    }
    expect(DAILY_REWARDS[0].cash).toBeLessThan(STARTING_CASH);
  });
});
