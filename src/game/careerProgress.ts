import { MISSIONS, MISSION_BY_ID, type MissionDef } from '../data/career';
import { MAPS, type MapId } from '../data/maps';
import { isFiniteNumber } from '../core/math';

/** Saved state of the career. */
export interface MissionRecord {
  /** Best stars earned (0 = never completed). */
  stars: number;
  attempts: number;
  completions: number;
  /** Best value of the mission's star metric (only meaningful once completed). */
  best: number | null;
  /** The bonus objective was met at least once. */
  secondary: boolean;
}

export interface CareerSave {
  missions: Record<string, MissionRecord>;
}

export function emptyCareer(): CareerSave {
  return { missions: {} };
}

export function missionRecord(c: CareerSave, id: string): MissionRecord {
  return c.missions[id] ?? { stars: 0, attempts: 0, completions: 0, best: null, secondary: false };
}

export function isCompleted(c: CareerSave, id: string): boolean {
  return (c.missions[id]?.completions ?? 0) > 0;
}

/**
 * Missions unlock one after another: the first one is always open, every other
 * one needs its predecessor (the previous map's last mission for a map's first).
 */
export function isMissionUnlocked(c: CareerSave, id: string): boolean {
  const def = MISSION_BY_ID.get(id);
  if (!def) return false;
  if (def.number === 1) return true;
  return isCompleted(c, MISSIONS[def.number - 2].id);
}

/** A map's career is open once its first mission is unlocked. */
export function isCareerMapUnlocked(c: CareerSave, map: MapId): boolean {
  const first = MISSIONS.find((d) => d.map === map);
  return !!first && isMissionUnlocked(c, first.id);
}

/** First unlocked mission that has not been completed yet (null when the career is done). */
export function currentMission(c: CareerSave): MissionDef | null {
  for (const d of MISSIONS) if (!isCompleted(c, d.id)) return isMissionUnlocked(c, d.id) ? d : null;
  return null;
}

export function totalStars(c: CareerSave, map?: MapId): number {
  let n = 0;
  for (const d of MISSIONS) if (!map || d.map === map) n += missionRecord(c, d.id).stars;
  return n;
}

export function completedCount(c: CareerSave, map?: MapId): number {
  let n = 0;
  for (const d of MISSIONS) if ((!map || d.map === map) && isCompleted(c, d.id)) n++;
  return n;
}

export const MAX_STARS = MISSIONS.length * 3;

/** Bikes unlocked by completed career milestones. */
export function careerUnlockedBikes(c: CareerSave): string[] {
  const out: string[] = [];
  for (const d of MISSIONS) if (d.rewards.unlockBike && isCompleted(c, d.id)) out.push(d.rewards.unlockBike);
  return out;
}

/** Mission whose completion unlocks `bikeId`, if any. */
export function missionUnlockingBike(bikeId: string): MissionDef | null {
  return MISSIONS.find((d) => d.rewards.unlockBike === bikeId) ?? null;
}

export function sanitizeCareer(raw: unknown): CareerSave {
  const out = emptyCareer();
  const r = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const ms = r.missions;
  if (typeof ms !== 'object' || ms === null || Array.isArray(ms)) return out;
  const int = (v: unknown, hi: number) => (isFiniteNumber(v) ? Math.floor(Math.min(Math.max(0, v), hi)) : 0);
  for (const [id, v] of Object.entries(ms as Record<string, unknown>)) {
    if (!MISSION_BY_ID.has(id) || typeof v !== 'object' || v === null || Array.isArray(v)) continue;
    const x = v as Record<string, unknown>;
    const completions = int(x.completions, 1e6);
    const stars = completions > 0 ? Math.max(1, int(x.stars, 3)) : 0;
    out.missions[id] = {
      stars,
      completions,
      attempts: Math.max(completions, int(x.attempts, 1e6)),
      best: completions > 0 && isFiniteNumber(x.best) && x.best >= 0 ? Math.min(x.best, 1e9) : null,
      secondary: completions > 0 && x.secondary === true,
    };
  }
  return out;
}

/** Ordered list of maps with their career completion, for menus. */
export function careerMapSummary(c: CareerSave): { map: MapId; unlocked: boolean; completed: number; stars: number }[] {
  return MAPS.map((m) => ({ map: m.id, unlocked: isCareerMapUnlocked(c, m.id), completed: completedCount(c, m.id), stars: totalStars(c, m.id) }));
}
