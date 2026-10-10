import { describe, expect, it } from 'vitest';
import { LOWER_IS_BETTER, MISSION_BY_ID, MISSIONS, type MissionDef } from '../../src/data/career';
import { FAILED_MISSION_CASH_SHARE, STAR_XP_SHARE } from '../../src/data/progression';
import { isMissionUnlocked, missionRecord } from '../../src/game/careerProgress';
import type { MissionResult } from '../../src/game/missions';
import { applyRun, type RunRecordInput } from '../../src/game/progress';
import { levelForXp, missionXp, xpForRun } from '../../src/game/progression';
import { cashForRun, emptyRunStats, type RunStats } from '../../src/game/scoring';
import { MemoryStore, SaveManager, defaultSave } from '../../src/storage/save';

const NOW = 1_750_000_000_000;

function freeRun(over: Partial<RunStats> = {}, extra: Partial<RunRecordInput> = {}): RunRecordInput {
  return {
    mode: 'endless',
    map: 'highway',
    time: 'day',
    weather: 'clear',
    bikeId: 'yamaha-r3',
    stats: { ...emptyRunStats(), score: 6000, distance: 4000, time: 100, topSpeed: 190, nearMisses: 6, overtakes: 12, ...over },
    crashed: true,
    mission: null,
    now: NOW,
    ...extra,
  };
}

function result(def: MissionDef, over: Partial<MissionResult> = {}): MissionResult {
  return {
    id: def.id,
    status: 'complete',
    failReason: null,
    stars: 1,
    metric: def.stars.metric,
    metricValue: def.stars.two + 5,
    progress: 1,
    secondaryMet: false,
    time: 90,
    distance: 2000,
    ...over,
  };
}

function missionRun(def: MissionDef, res: MissionResult, over: Partial<RunStats> = {}): RunRecordInput {
  return {
    mode: 'career',
    map: def.map,
    time: def.time,
    weather: def.weather,
    bikeId: 'yamaha-r3',
    stats: { ...emptyRunStats(), score: 3000, distance: res.distance, time: res.time, topSpeed: 170, nearMisses: 2, overtakes: 8, ...over },
    crashed: res.failReason === 'crash',
    mission: { def, result: res },
    now: NOW,
  };
}

describe('applyRun: free modes', () => {
  it('pays cash and XP, records stats, high score and leaderboard', () => {
    const d = defaultSave();
    const rec = freeRun();
    const out = applyRun(d, rec);
    expect(out.mission).toBeNull();
    const baseCash = cashForRun(rec.stats);
    expect(out.cashLines[0]).toEqual({ label: 'Sürüş', amount: baseCash });
    expect(out.xpLines[0].amount).toBe(xpForRun(rec.stats));
    expect(d.cash).toBe(defaultSave().cash + out.cash);
    expect(d.xp).toBe(out.xp);
    expect(out.xpAfter).toBe(d.xp);
    expect(out.levelAfter).toBe(levelForXp(d.xp));
    expect(d.highScores.endless).toBe(6000);
    expect(out.record).toBe(true);
    expect(out.rank).toBe(1);
    expect(d.leaderboards['endless:highway']).toEqual([{ score: 6000, distance: 4000, bike: 'yamaha-r3', date: NOW }]);
    expect(d.stats.lifetime).toMatchObject({ runs: 1, crashes: 1, distance: 4000, nearMisses: 6, overtakes: 12, topSpeed: 190 });
    expect(d.stats.bikes['yamaha-r3'].runs).toBe(1);
    expect(d.stats.maps.highway?.runs).toBe(1);
    expect(d.gamesPlayed).toBe(1);
    expect(d.totalDistance).toBe(4000);
    expect(d.totalNearMisses).toBe(6);
    expect(d.topSpeedEver).toBe(190);
  });

  it('a lower score is ranked but is not a record', () => {
    const d = defaultSave();
    applyRun(d, freeRun({ score: 9000 }));
    const out = applyRun(d, freeRun({ score: 4000 }));
    expect(out.record).toBe(false);
    expect(out.rank).toBe(2);
    expect(d.highScores.endless).toBe(9000);
    expect(d.leaderboards['endless:highway']!.map((e) => e.score)).toEqual([9000, 4000]);
  });

  it('scores are kept per mode and map', () => {
    const d = defaultSave();
    applyRun(d, freeRun({ score: 5000 }));
    const out = applyRun(d, freeRun({ score: 100 }, { mode: 'twoway', map: 'city' }));
    expect(out.record).toBe(true); // first score of that board
    expect(Object.keys(d.leaderboards).sort()).toEqual(['endless:highway', 'twoway:city']);
  });

  it('a zero-score run is recorded in the statistics but not on the board', () => {
    const d = defaultSave();
    const out = applyRun(d, freeRun({ score: 0, distance: 5, nearMisses: 0, overtakes: 0 }));
    expect(out.rank).toBeNull();
    expect(d.leaderboards).toEqual({});
    expect(d.stats.lifetime.runs).toBe(1);
  });

  it('detects a level-up and the achievements it caused', () => {
    const d = defaultSave();
    const out = applyRun(d, freeRun({ distance: 60_000, score: 90_000, nearMisses: 120, overtakes: 600 }));
    expect(out.levelAfter).toBeGreaterThan(out.levelBefore);
    const ids = out.achievements.map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['dist-1', 'near-1', 'near-2', 'ovt-1', 'ovt-2', 'run-1', 'crash-1']));
    const ach = out.cashLines.find((l) => l.label === 'Başarımlar');
    expect(ach?.amount).toBe(out.achievements.reduce((a, x) => a + x.reward.cash, 0));
    expect(Object.keys(d.achievements)).toEqual(expect.arrayContaining(ids));
    // The same run again unlocks nothing new for the same tiers.
    const again = applyRun(d, freeRun({ distance: 100, score: 100, nearMisses: 0, overtakes: 0 }));
    expect(again.achievements.map((a) => a.id)).not.toContain('dist-1');
  });
});

describe('applyRun: career missions', () => {
  const m1 = MISSION_BY_ID.get('suburb-01')!;

  it('first clear pays the reward, the first-clear bonus and XP, and unlocks the next mission', () => {
    const d = defaultSave();
    expect(isMissionUnlocked(d.career, 'suburb-02')).toBe(false);
    const out = applyRun(d, missionRun(m1, result(m1, { stars: 2 })));
    const mo = out.mission!;
    expect(mo.firstClear).toBe(true);
    expect(mo.newStars).toBe(2);
    expect(mo.bestStars).toBe(2);
    expect(mo.nextMissionId).toBe('suburb-02');
    expect(mo.nextUnlocked).toBe(true);
    expect(out.cashLines.map((l) => l.label)).toEqual(expect.arrayContaining(['Görev ödülü', 'İlk tamamlama bonusu']));
    expect(out.cashLines.find((l) => l.label === 'Görev ödülü')!.amount).toBe(m1.rewards.cash);
    expect(out.cashLines.find((l) => l.label === 'İlk tamamlama bonusu')!.amount).toBe(m1.rewards.firstClearBonus);
    expect(out.xpLines.some((l) => l.amount === missionXp(m1, true, 2))).toBe(true);
    expect(d.career.missions['suburb-01']).toMatchObject({ stars: 2, attempts: 1, completions: 1 });
    expect(isMissionUnlocked(d.career, 'suburb-02')).toBe(true);
    expect(d.stats.lifetime.missionsCompleted).toBe(1);
    // The first completion also triggers the career achievement.
    expect(out.achievements.map((a) => a.id)).toContain('car-1');
  });

  it('replays pay the reward again but no bonus, less XP, and only improve stars', () => {
    const d = defaultSave();
    // Metric values in the "better" / "worse" direction of this mission's star metric.
    const lower = LOWER_IS_BETTER[m1.stars.metric];
    const good = lower ? 100 : 200;
    const bad = lower ? 130 : 150;
    const best = lower ? 60 : 260;
    applyRun(d, missionRun(m1, result(m1, { stars: 2, metricValue: good })));
    const cashBefore = d.cash;
    const replay = applyRun(d, missionRun(m1, result(m1, { stars: 1, metricValue: bad })));
    const mo = replay.mission!;
    expect(mo.firstClear).toBe(false);
    expect(mo.newStars).toBe(0);
    expect(mo.bestStars).toBe(2); // never downgraded
    expect(replay.cashLines.map((l) => l.label)).not.toContain('İlk tamamlama bonusu');
    expect(replay.cashLines.find((l) => l.label === 'Görev ödülü')!.amount).toBe(m1.rewards.cash);
    expect(replay.xpLines.some((l) => l.amount === missionXp(m1, false, 0))).toBe(true);
    expect(d.cash).toBe(cashBefore + replay.cash);
    expect(d.career.missions['suburb-01']).toMatchObject({ stars: 2, completions: 2, attempts: 2 });
    // The best value is kept; a better run improves it.
    expect(d.career.missions['suburb-01'].best).toBe(good);
    const better = applyRun(d, missionRun(m1, result(m1, { stars: 3, metricValue: best })));
    expect(better.mission!.newStars).toBe(1);
    expect(better.mission!.bestStars).toBe(3);
    expect(d.career.missions['suburb-01'].best).toBe(best);
    expect(better.xpLines.some((l) => l.amount === missionXp(m1, false, 1))).toBe(true);
  });

  it('a missed or failed mission pays only a consolation, counts the attempt and unlocks nothing', () => {
    const d = defaultSave();
    const res = result(m1, { status: 'failed', failReason: 'crash', stars: 0, progress: 0.4 });
    const rec = missionRun(m1, res);
    const out = applyRun(d, rec);
    const mo = out.mission!;
    expect(mo.result.status).toBe('failed');
    expect(mo.firstClear).toBe(false);
    expect(mo.nextUnlocked).toBe(false);
    expect(mo.unlockedBike).toBeNull();
    expect(out.cashLines.map((l) => l.label)).not.toContain('Görev ödülü');
    const consolation = Math.floor(cashForRun(rec.stats) * FAILED_MISSION_CASH_SHARE);
    expect(out.cash).toBeGreaterThanOrEqual(consolation);
    expect(out.xpLines.some((l) => l.label.startsWith('Görev'))).toBe(false);
    expect(missionRecord(d.career, 'suburb-01')).toMatchObject({ stars: 0, completions: 0, attempts: 1 });
    expect(isMissionUnlocked(d.career, 'suburb-02')).toBe(false);
    expect(d.stats.lifetime.missionsCompleted).toBe(0);
    expect(d.stats.lifetime.crashes).toBe(1);
  });

  it('the bonus objective pays extra once met', () => {
    const withBonus = MISSIONS.find((m) => m.secondary)!;
    const d = defaultSave();
    const out = applyRun(d, missionRun(withBonus, result(withBonus, { secondaryMet: true })));
    expect(out.cashLines.find((l) => l.label === 'Bonus hedef')!.amount).toBe(withBonus.rewards.secondaryCash);
    expect(d.career.missions[withBonus.id].secondary).toBe(true);
    // Not met: no bonus line.
    const d2 = defaultSave();
    const none = applyRun(d2, missionRun(withBonus, result(withBonus)));
    expect(none.cashLines.map((l) => l.label)).not.toContain('Bonus hedef');
  });

  it("finishing a map's last mission for the first time unlocks the reward bike and the next map", () => {
    const finale = MISSION_BY_ID.get('suburb-10')!;
    const d = defaultSave();
    d.cash = 1_000_000;
    // Pretend the first nine are done.
    for (const m of MISSIONS.slice(0, 9)) d.career.missions[m.id] = { stars: 1, attempts: 1, completions: 1, best: 1, secondary: false };
    const saver = new SaveManager(new MemoryStore());
    saver.data = d;
    expect(saver.isBikeUnlocked('kawasaki-z900')).toBe(false);
    const out = saver.commitRun(missionRun(finale, result(finale, { stars: 3 })));
    expect(out.mission!.unlockedBike).toBe('kawasaki-z900');
    expect(out.mission!.nextMissionId).toBe('highway-01');
    expect(out.mission!.nextUnlocked).toBe(true);
    expect(saver.isBikeUnlocked('kawasaki-z900')).toBe(true);
    expect(saver.buy('kawasaki-z900')).toBe(true);
    // Replaying the finale does not announce the bike again.
    const again = saver.commitRun(missionRun(finale, result(finale)));
    expect(again.mission!.unlockedBike).toBeNull();
  });

  it('the last mission of the career has no next mission', () => {
    const last = MISSION_BY_ID.get('industrial-10')!;
    const d = defaultSave();
    const out = applyRun(d, missionRun(last, result(last)));
    expect(out.mission!.nextMissionId).toBeNull();
    expect(out.mission!.nextUnlocked).toBe(false);
  });

  it('career runs never enter the free-mode leaderboards', () => {
    const d = defaultSave();
    applyRun(d, missionRun(m1, result(m1), { score: 99_999 }));
    expect(d.leaderboards).toEqual({});
    expect(d.highScores.career).toBeUndefined();
  });

  it('XP per extra star follows the shared constant', () => {
    expect(missionXp(m1, true, 3) - missionXp(m1, true, 0)).toBe(Math.round(3 * m1.rewards.xp * STAR_XP_SHARE));
  });

  it('can never pay negative amounts, whatever the stats claim', () => {
    const d = defaultSave();
    const cash0 = d.cash;
    const out = applyRun(d, freeRun({ score: -5000, distance: -10, nearMisses: -4, overtakes: -2, topSpeed: -1 }));
    expect(out.cash).toBeGreaterThanOrEqual(0);
    expect(out.xp).toBeGreaterThanOrEqual(0);
    expect(d.cash).toBeGreaterThanOrEqual(cash0);
    expect(d.totalDistance).toBeGreaterThanOrEqual(0);
  });
});

describe('SaveManager.commitRun persists the result', () => {
  it('writes the outcome to storage', () => {
    const store = new MemoryStore();
    const m = new SaveManager(store);
    m.commitRun(freeRun());
    const reloaded = new SaveManager(store);
    expect(reloaded.data.stats.lifetime.runs).toBe(1);
    expect(reloaded.data.xp).toBe(m.data.xp);
    expect(reloaded.data.leaderboards['endless:highway']).toHaveLength(1);
    const same = JSON.stringify(reloaded.data) === JSON.stringify(m.data);
    expect(same).toBe(true);
  });
});

