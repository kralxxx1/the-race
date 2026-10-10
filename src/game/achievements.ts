import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID, type AchMetric, type AchievementDef } from '../data/achievements';
import type { MapId } from '../data/maps';
import { isFiniteNumber } from '../core/math';
import { completedCount, totalStars, type CareerSave } from './careerProgress';
import type { DailyState } from './daily';
import { levelForXp } from './progression';
import { addRun, mapsVisited, type RunContribution, type StatBlock, type StatsSave } from './stats';

/** Everything achievements can measure. */
export interface AchContext {
  lifetime: StatBlock;
  missions: number;
  stars: number;
  mapsVisited: number;
  bikesOwned: number;
  level: number;
  dailyStreak: number;
}

/** The parts of the save achievements read (SaveData satisfies it). */
export interface AchSource {
  stats: StatsSave;
  career: CareerSave;
  ownedBikes: readonly string[];
  xp: number;
  daily: DailyState;
  achievements: Record<string, number>;
}

export function achContext(src: AchSource): AchContext {
  return {
    lifetime: src.stats.lifetime,
    missions: completedCount(src.career),
    stars: totalStars(src.career),
    mapsVisited: mapsVisited(src.stats).length,
    bikesOwned: src.ownedBikes.length,
    level: levelForXp(src.xp),
    dailyStreak: src.daily.streak,
  };
}

/** Context including a run that is still in progress (for live unlock toasts). */
export function liveAchContext(src: AchSource, run: RunContribution, map: MapId, runXp: number): AchContext {
  const ctx = achContext(src);
  const lifetime = { ...src.stats.lifetime };
  addRun(lifetime, run);
  ctx.lifetime = lifetime;
  if ((src.stats.maps[map]?.runs ?? 0) === 0 && run.stats.distance > 0) ctx.mapsVisited++;
  ctx.level = levelForXp(src.xp + runXp);
  return ctx;
}

export function metricValue(metric: AchMetric, c: AchContext): number {
  const l = c.lifetime;
  switch (metric) {
    case 'distance':
      return l.distance;
    case 'nearMisses':
      return l.nearMisses;
    case 'overtakes':
      return l.overtakes;
    case 'topSpeed':
      return l.topSpeed;
    case 'wheelieDistance':
      return l.wheelieDistance;
    case 'longestWheelie':
      return l.longestWheelie;
    case 'oppositeDistance':
      return l.oppositeDistance;
    case 'missions':
      return c.missions;
    case 'stars':
      return c.stars;
    case 'mapsVisited':
      return c.mapsVisited;
    case 'bikesOwned':
      return c.bikesOwned;
    case 'nightDistance':
      return l.nightDistance;
    case 'rainDistance':
      return l.rainDistance;
    case 'snowDistance':
      return l.snowDistance;
    case 'fogDistance':
      return l.fogDistance;
    case 'maxCombo':
      return l.maxCombo;
    case 'crashes':
      return l.crashes;
    case 'rideTime':
      return l.rideTime;
    case 'runDistance':
      return l.bestDistance;
    case 'dailyStreak':
      return c.dailyStreak;
    case 'level':
      return c.level;
  }
}

/** 0..1 */
export function achievementProgress(def: AchievementDef, c: AchContext): number {
  const v = metricValue(def.metric, c);
  return Math.min(1, Math.max(0, v / def.target));
}

/** Achievements reached in `c` that are not in `unlocked` (nor in `skip`), in definition order. */
export function reachedAchievements(unlocked: Readonly<Record<string, number>>, c: AchContext, skip?: ReadonlySet<string>): AchievementDef[] {
  const out: AchievementDef[] = [];
  for (const a of ACHIEVEMENTS) {
    if (a.id in unlocked || skip?.has(a.id)) continue;
    if (metricValue(a.metric, c) >= a.target) out.push(a);
  }
  return out;
}

export interface AchievementGrant {
  unlocked: AchievementDef[];
  cash: number;
  xp: number;
}

/**
 * Unlock everything reached and pay the rewards into `src`. Repeats because
 * reward XP can raise the level, which can unlock a level achievement.
 */
export function grantAchievements(src: AchSource & { cash: number }, now: number): AchievementGrant {
  const grant: AchievementGrant = { unlocked: [], cash: 0, xp: 0 };
  for (let pass = 0; pass < 6; pass++) {
    const fresh = reachedAchievements(src.achievements, achContext(src));
    if (!fresh.length) break;
    for (const a of fresh) {
      src.achievements[a.id] = now;
      src.cash += a.reward.cash;
      src.xp += a.reward.xp;
      grant.cash += a.reward.cash;
      grant.xp += a.reward.xp;
      grant.unlocked.push(a);
    }
  }
  return grant;
}

export function sanitizeAchievements(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const [id, t] of Object.entries(raw as Record<string, unknown>)) {
    if (!ACHIEVEMENT_BY_ID.has(id)) continue;
    out[id] = isFiniteNumber(t) && t > 0 ? Math.min(t, 8.64e15) : 0;
  }
  return out;
}

export function unlockedCount(unlocked: Readonly<Record<string, number>>): number {
  let n = 0;
  for (const a of ACHIEVEMENTS) if (a.id in unlocked) n++;
  return n;
}
