import { describe, expect, it } from 'vitest';
import { STARTER_BIKE_ID } from '../../src/data/bikes';
import { levelForXp } from '../../src/game/progression';
import { MemoryStore, SAVE_KEY, SAVE_VERSION, SaveManager, defaultSave, migrate, sanitizeSave } from '../../src/storage/save';

/** A realistic v3 save (the format before the career update). */
function v3(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 3,
    cash: 12_345,
    ownedBikes: ['yamaha-r3', 'honda-cbr650r'],
    selectedBike: 'honda-cbr650r',
    liveryChoice: { 'honda-cbr650r': 1 },
    upgrades: { 'honda-cbr650r': { engine: 2, brakes: 1, handling: 0 } },
    highScores: { endless: 88_000, twoway: 41_000 },
    bestDistance: 21_000,
    totalDistance: 350_000,
    totalNearMisses: 420,
    gamesPlayed: 61,
    topSpeedEver: 231,
    lastRun: { mode: 'twoway', map: 'city', time: 'night', weather: 'rain' },
    settings: { 'gfx.preset': 'medium', 'hud.units': 'mph', 'audio.master': 0.5 },
    ...extra,
  };
}

describe('save version 4', () => {
  it('is version 4', () => {
    expect(SAVE_VERSION).toBe(4);
    expect(defaultSave().version).toBe(4);
  });

  it('a default save has empty progression', () => {
    const d = defaultSave();
    expect(d.xp).toBe(0);
    expect(d.career).toEqual({ missions: {} });
    expect(d.achievements).toEqual({});
    expect(d.leaderboards).toEqual({});
    expect(d.daily).toEqual({ lastDay: null, streak: 0, claims: 0 });
    expect(d.stats.lifetime.runs).toBe(0);
    expect(d.stats.bikes).toEqual({});
    expect(d.stats.maps).toEqual({});
  });
});

describe('migration v3 -> v4', () => {
  it('keeps every v3 field', () => {
    const s = sanitizeSave(v3());
    expect(s.version).toBe(4);
    expect(s.cash).toBe(12_345);
    expect(s.ownedBikes).toEqual(['yamaha-r3', 'honda-cbr650r']);
    expect(s.selectedBike).toBe('honda-cbr650r');
    expect(s.liveryChoice['honda-cbr650r']).toBe(1);
    expect(s.upgrades['honda-cbr650r']).toEqual({ engine: 2, brakes: 1, handling: 0 });
    expect(s.highScores).toEqual({ endless: 88_000, twoway: 41_000 });
    expect(s.bestDistance).toBe(21_000);
    expect(s.totalDistance).toBe(350_000);
    expect(s.totalNearMisses).toBe(420);
    expect(s.gamesPlayed).toBe(61);
    expect(s.topSpeedEver).toBe(231);
    expect(s.lastRun).toMatchObject({ mode: 'twoway', map: 'city', time: 'night', weather: 'rain' });
    expect(s.settings['hud.units']).toBe('mph');
    expect(s.settings['gfx.preset']).toBe('medium');
  });

  it('seeds lifetime statistics and XP from the old totals so veterans do not restart at level 1', () => {
    const s = sanitizeSave(v3());
    expect(s.stats.lifetime).toMatchObject({ runs: 61, distance: 350_000, nearMisses: 420, topSpeed: 231, bestDistance: 21_000, bestScore: 88_000 });
    expect(s.xp).toBeGreaterThan(30_000);
    expect(levelForXp(s.xp)).toBeGreaterThan(5);
    expect(s.career).toEqual({ missions: {} });
    expect(s.achievements).toEqual({});
    expect(s.daily).toEqual({ lastDay: null, streak: 0, claims: 0 });
  });

  it('does not overwrite v4 data that is already there', () => {
    const s = sanitizeSave(v3({ xp: 777, stats: { lifetime: { runs: 5, distance: 100 } } }));
    expect(s.xp).toBe(777);
    expect(s.stats.lifetime).toMatchObject({ runs: 5, distance: 100 });
  });

  it('a v3 save with nothing but a version number migrates to a valid save', () => {
    const s = sanitizeSave({ version: 3 });
    expect(s.version).toBe(4);
    expect(s.ownedBikes).toContain(STARTER_BIKE_ID);
    expect(s.xp).toBe(0);
  });

  it('migration is a pure upgrade step and ends at the current version', () => {
    const m = migrate(v3());
    expect(m.version).toBe(SAVE_VERSION);
    expect(migrate(m)).toEqual(m); // running it again changes nothing
  });

  it('older saves keep migrating through the chain (v1 -> v4 and v2 -> v4)', () => {
    const v1 = { version: 1, cash: 9000, bike: 'yamaha-r3', bikes: ['yamaha-r3', 'honda-cbr650r'], bestScore: 5000, bestDistance: 3000, totalDistance: 20_000, totalNearMisses: 15, gamesPlayed: 4, topSpeedEver: 180 };
    const a = sanitizeSave(v1);
    expect(a.version).toBe(4);
    expect(a.ownedBikes).toEqual(['yamaha-r3', 'honda-cbr650r']);
    expect(a.highScores.endless).toBe(5000);
    expect(a.cash).toBe(9000);
    expect(a.stats.lifetime.distance).toBe(20_000);
    expect(a.xp).toBeGreaterThan(0);

    const v2 = {
      version: 2,
      cash: 4000,
      ownedBikes: ['yamaha-r3'],
      selectedBike: 'yamaha-r3',
      highScores: { endless: 700 },
      totalDistance: 1500,
      totalNearMisses: 2,
      gamesPlayed: 2,
      lastMode: 'timetrial',
      lastEnv: 'sunset',
      settings: { quality: 'high', units: 'mph', masterVolume: 0.4, autoShift: false },
    };
    const b = sanitizeSave(v2);
    expect(b.version).toBe(4);
    expect(b.lastRun).toMatchObject({ mode: 'timetrial', map: 'desert', time: 'sunset' });
    expect(b.settings['hud.units']).toBe('mph');
    expect(b.settings['play.autoShift']).toBe('manual');
    expect(b.stats.lifetime.runs).toBe(2);
    expect(b.stats.lifetime.distance).toBe(1500);
  });

  it('riders with big old totals get the early achievements marked once, without a payout', () => {
    const store = new MemoryStore();
    store.setItem(SAVE_KEY, JSON.stringify(v3()));
    const m = new SaveManager(store);
    expect(Object.keys(m.data.achievements)).toHaveLength(0); // loading alone changes nothing
    const { cash, xp } = m.data;
    const unlocked = m.reconcileAchievements();
    const ids = unlocked.map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['dist-1', 'dist-2', 'near-1', 'near-2', 'speed-1', 'bike-1']));
    expect(m.data.cash).toBe(cash); // retroactive unlocks never create money or XP
    expect(m.data.xp).toBe(xp);
    expect(new SaveManager(store).data.achievements['dist-1']).toBeGreaterThan(0); // persisted
    expect(m.reconcileAchievements()).toHaveLength(0); // never twice
    expect(new SaveManager(new MemoryStore()).reconcileAchievements()).toHaveLength(0); // fresh install: nothing
  });

  it('survives a full SaveManager round trip from a v3 string in storage', () => {
    const store = new MemoryStore();
    store.setItem(SAVE_KEY, JSON.stringify(v3()));
    const m = new SaveManager(store);
    expect(m.isNew).toBe(false);
    expect(m.data.version).toBe(4);
    expect(m.data.cash).toBe(12_345);
    m.save();
    const raw = JSON.parse(store.getItem(SAVE_KEY)!);
    expect(raw.version).toBe(4);
    expect(raw.stats.lifetime.runs).toBe(61);
    // Re-loading the upgraded save gives identical data.
    expect(new SaveManager(store).data).toEqual(m.data);
  });
});

describe('sanitising v4 fields', () => {
  it('is idempotent', () => {
    const once = sanitizeSave(v3({ xp: 5000, career: { missions: { 'suburb-01': { stars: 2, completions: 1, attempts: 3, best: 70, secondary: true } } }, achievements: { 'dist-1': 123 }, daily: { lastDay: '2025-03-04', streak: 3, claims: 9 } }));
    const twice = sanitizeSave(JSON.parse(JSON.stringify(once)));
    expect(twice).toEqual(once);
    expect(once.career.missions['suburb-01']).toMatchObject({ stars: 2, completions: 1, attempts: 3, best: 70, secondary: true });
    expect(once.daily).toEqual({ lastDay: '2025-03-04', streak: 3, claims: 9 });
  });

  it('wrong types fall back to defaults instead of throwing', () => {
    const junk = [null, 0, 'x', [], true];
    for (const j of junk) {
      expect(() => sanitizeSave({ version: 4, xp: j, career: j, achievements: j, stats: j, leaderboards: j, daily: j })).not.toThrow();
      const s = sanitizeSave({ version: 4, xp: j, career: j, achievements: j, stats: j, leaderboards: j, daily: j });
      expect(s.xp).toBeGreaterThanOrEqual(0);
      expect(s.career).toEqual({ missions: {} });
      expect(s.achievements).toEqual({});
      expect(s.leaderboards).toEqual({});
      expect(s.daily.lastDay).toBeNull();
    }
  });

  it('tampered numbers cannot grant infinite or negative money, XP or stats', () => {
    // JSON.parse turns 1e999 into Infinity, so parse real text the way localStorage would.
    const text = `{"version":4,"cash":1e999,"xp":1e999,"totalDistance":-1e999,"bestDistance":1e999,"gamesPlayed":1e999,"topSpeedEver":1e999,
      "stats":{"lifetime":{"distance":1e999,"runs":-5,"topSpeed":1e999,"nearMisses":1e999}},
      "daily":{"lastDay":"2025-01-01","streak":1e999,"claims":1e999}}`;
    const s = sanitizeSave(JSON.parse(text));
    for (const v of [s.cash, s.xp, s.totalDistance, s.bestDistance, s.gamesPlayed, s.topSpeedEver, s.stats.lifetime.distance, s.stats.lifetime.topSpeed, s.stats.lifetime.nearMisses, s.daily.streak, s.daily.claims]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
    expect(s.cash).toBe(defaultSave().cash); // an infinite balance is treated as corrupted
    expect(s.xp).toBe(0);
    expect(levelForXp(s.xp)).toBe(1);
    expect(s.stats.lifetime.topSpeed).toBeLessThanOrEqual(1000);
  });

  it('huge but finite values are clamped to sane caps', () => {
    const s = sanitizeSave({ version: 4, cash: 1e30, xp: 1e30, stats: { lifetime: { distance: 1e30, topSpeed: 5e5 } } });
    expect(s.cash).toBeLessThanOrEqual(1e12);
    expect(s.xp).toBeLessThanOrEqual(1e9);
    expect(levelForXp(s.xp)).toBe(50);
    expect(s.stats.lifetime.distance).toBeLessThanOrEqual(1e12);
    expect(s.stats.lifetime.topSpeed).toBeLessThanOrEqual(1000);
  });

  it('unknown missions, bikes, maps, modes and achievements are dropped', () => {
    const s = sanitizeSave({
      version: 4,
      career: { missions: { 'ghost-99': { stars: 3, completions: 1 }, 'suburb-01': { stars: 1, completions: 1 } } },
      achievements: { 'ghost-1': 5, 'dist-1': 5 },
      stats: { bikes: { 'ghost-bike': { runs: 3 } }, maps: { atlantis: { runs: 2 } } },
      leaderboards: { 'endless:atlantis': [{ score: 5, bike: STARTER_BIKE_ID }], 'ghostmode:highway': [{ score: 5, bike: STARTER_BIKE_ID }] },
    });
    expect(Object.keys(s.career.missions)).toEqual(['suburb-01']);
    expect(Object.keys(s.achievements)).toEqual(['dist-1']);
    expect(s.stats.bikes).toEqual({});
    expect(s.stats.maps).toEqual({});
    expect(s.leaderboards).toEqual({});
  });

  it('a career lastRun needs a real mission, otherwise it falls back to free play', () => {
    const ok = sanitizeSave({ version: 4, lastRun: { mode: 'career', missionId: 'forest-03', map: 'desert', time: 'dawn', weather: 'clear' } });
    expect(ok.lastRun).toMatchObject({ mode: 'career', missionId: 'forest-03', map: 'forest', time: 'day', weather: 'cloudy' });
    const bad = sanitizeSave({ version: 4, lastRun: { mode: 'career', missionId: 'nope-1', map: 'desert' } });
    expect(bad.lastRun.mode).toBe('endless');
    expect(bad.lastRun.missionId).toBeUndefined();
    const none = sanitizeSave({ version: 4, lastRun: { mode: 'career' } });
    expect(none.lastRun.mode).toBe('endless');
  });

  it('SaveManager survives garbage in every new slot of a stored save', () => {
    const store = new MemoryStore();
    store.setItem(SAVE_KEY, JSON.stringify({ version: 4, xp: 'many', career: 'done', achievements: [1, 2], stats: { lifetime: 'x' }, leaderboards: 5, daily: { lastDay: 12 } }));
    const m = new SaveManager(store);
    expect(m.data.xp).toBe(0);
    expect(m.level).toBe(1);
    expect(m.claimDaily(new Date(2025, 0, 5))).not.toBeNull();
  });

  it('reset keeps settings and the daily claim, clears the progression', () => {
    const m = new SaveManager(new MemoryStore());
    m.updateSettings({ 'hud.units': 'mph' });
    m.claimDaily(new Date(2025, 4, 5));
    m.data.xp = 5000;
    m.data.career.missions['suburb-01'] = { stars: 3, attempts: 1, completions: 1, best: 1, secondary: false };
    m.reset();
    expect(m.data.xp).toBe(0);
    expect(m.data.career.missions).toEqual({});
    expect(m.data.achievements).toEqual({});
    expect(m.data.settings['hud.units']).toBe('mph');
    expect(m.data.daily.lastDay).toBe('2025-05-05');
  });
});
