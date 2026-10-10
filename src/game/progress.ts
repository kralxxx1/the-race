import type { AchievementDef } from '../data/achievements';
import { LOWER_IS_BETTER, nextMissionId, type MissionDef } from '../data/career';
import type { MapId, TimeOfDay, Weather } from '../data/maps';
import { isFreeMode, type ModeId } from '../data/modes';
import { FAILED_MISSION_CASH_SHARE } from '../data/progression';
import type { SaveData } from '../storage/save';
import { grantAchievements } from './achievements';
import { isMissionUnlocked, missionRecord } from './careerProgress';
import { bestScore, recordLeaderboard } from './leaderboard';
import type { MissionResult } from './missions';
import { levelForXp, missionXp, xpForRun } from './progression';
import { cashForRun, type RunStats } from './scoring';
import { recordStats } from './stats';

/**
 * Commits a finished run to the save: cash, XP, statistics, leaderboards,
 * career records, unlocks and achievements, in that order. Pure over SaveData
 * (the caller persists it), so the whole reward pipeline is unit-testable.
 */

export interface RunRecordInput {
  mode: ModeId;
  map: MapId;
  time: TimeOfDay;
  weather: Weather;
  bikeId: string;
  stats: RunStats;
  crashed: boolean;
  mission: { def: MissionDef; result: MissionResult } | null;
  /** Epoch milliseconds. */
  now: number;
}

export interface RewardLine {
  label: string;
  amount: number;
}

export interface MissionOutcome {
  def: MissionDef;
  result: MissionResult;
  firstClear: boolean;
  /** Stars added to the mission's best. */
  newStars: number;
  bestStars: number;
  unlockedBike: string | null;
  nextMissionId: string | null;
  nextUnlocked: boolean;
}

export interface RunOutcome {
  cash: number;
  cashLines: RewardLine[];
  xp: number;
  xpLines: RewardLine[];
  xpBefore: number;
  xpAfter: number;
  levelBefore: number;
  levelAfter: number;
  achievements: AchievementDef[];
  /** New best score for this mode × map (free modes). */
  record: boolean;
  /** Leaderboard rank (1-based) or null. */
  rank: number | null;
  mission: MissionOutcome | null;
}

export function applyRun(save: SaveData, rec: RunRecordInput): RunOutcome {
  const stats = rec.stats;
  const xpBefore = save.xp;
  const levelBefore = levelForXp(xpBefore);
  const cashLines: RewardLine[] = [];
  const xpLines: RewardLine[] = [];
  let mission: MissionOutcome | null = null;

  const rideXp = xpForRun(stats);
  if (rideXp > 0) xpLines.push({ label: 'Sürüş', amount: rideXp });

  if (rec.mission) {
    const { def, result } = rec.mission;
    const r = { ...missionRecord(save.career, def.id) };
    const firstClear = result.status === 'complete' && r.completions === 0;
    r.attempts += 1;
    let newStars = 0;
    if (result.status === 'complete') {
      newStars = Math.max(0, result.stars - r.stars);
      r.completions += 1;
      r.stars = Math.max(r.stars, result.stars);
      const better = r.best === null || (LOWER_IS_BETTER[def.stars.metric] ? result.metricValue < r.best : result.metricValue > r.best);
      if (better) r.best = result.metricValue;
      r.secondary ||= result.secondaryMet;
      cashLines.push({ label: 'Görev ödülü', amount: def.rewards.cash });
      if (firstClear) cashLines.push({ label: 'İlk tamamlama bonusu', amount: def.rewards.firstClearBonus });
      if (result.secondaryMet && def.rewards.secondaryCash > 0) cashLines.push({ label: 'Bonus hedef', amount: def.rewards.secondaryCash });
      xpLines.push({ label: newStars > 0 ? `Görev (+${newStars} yıldız)` : 'Görev', amount: missionXp(def, firstClear, newStars) });
    } else {
      const consolation = Math.floor(cashForRun(stats) * FAILED_MISSION_CASH_SHARE);
      if (consolation > 0) cashLines.push({ label: 'Sürüş', amount: consolation });
    }
    save.career.missions[def.id] = r;
    const next = nextMissionId(def.id);
    mission = {
      def,
      result,
      firstClear,
      newStars,
      bestStars: r.stars,
      unlockedBike: firstClear && def.rewards.unlockBike ? def.rewards.unlockBike : null,
      nextMissionId: next,
      nextUnlocked: next !== null && isMissionUnlocked(save.career, next),
    };
  } else {
    const c = cashForRun(stats);
    if (c > 0) cashLines.push({ label: 'Sürüş', amount: c });
  }

  // Statistics (lifetime, per bike, per map) and the legacy totals the menus show.
  recordStats(save.stats, rec.bikeId, rec.map, {
    stats,
    crashed: rec.crashed,
    missionCompleted: rec.mission?.result.status === 'complete',
    time: rec.time,
    weather: rec.weather,
    countRun: true,
  });
  save.bestDistance = Math.max(save.bestDistance, stats.distance);
  save.totalDistance += Math.max(0, stats.distance);
  save.totalNearMisses += Math.max(0, stats.nearMisses);
  save.topSpeedEver = Math.max(save.topSpeedEver, stats.topSpeed);
  save.gamesPlayed++;

  // High scores and leaderboards (free modes only; the career is ranked by stars).
  let record = false;
  let rank: number | null = null;
  if (isFreeMode(rec.mode) && stats.score > 0) {
    const prevBest = bestScore(save.leaderboards, rec.mode, rec.map);
    rank = recordLeaderboard(save.leaderboards, rec.mode, rec.map, { score: Math.floor(stats.score), distance: stats.distance, bike: rec.bikeId, date: rec.now });
    record = stats.score > prevBest;
    if (stats.score > (save.highScores[rec.mode] ?? 0)) save.highScores[rec.mode] = Math.floor(stats.score);
  }

  let cash = cashLines.reduce((a, l) => a + l.amount, 0);
  let xp = xpLines.reduce((a, l) => a + l.amount, 0);
  save.cash += cash;
  save.xp += xp;

  const ach = grantAchievements(save, rec.now);
  if (ach.cash > 0) cashLines.push({ label: 'Başarımlar', amount: ach.cash });
  if (ach.xp > 0) xpLines.push({ label: 'Başarımlar', amount: ach.xp });
  cash += ach.cash;
  xp += ach.xp;

  return {
    cash,
    cashLines,
    xp,
    xpLines,
    xpBefore,
    xpAfter: save.xp,
    levelBefore,
    levelAfter: levelForXp(save.xp),
    achievements: ach.unlocked,
    record,
    rank,
    mission,
  };
}
