import { BIKE_BY_ID, type BikeSpec } from '../data/bikes';
import type { MissionDef } from '../data/career';
import { MAP_BY_ID, type MapId } from '../data/maps';
import { BIKE_UNLOCK_LEVEL, MAX_LEVEL, REPLAY_XP_SHARE, RIDE_XP, STAR_XP_SHARE, xpToNextLevel } from '../data/progression';
import { careerUnlockedBikes, missionUnlockingBike, type CareerSave } from './careerProgress';
import type { RunStats } from './scoring';

/** Rider levels, XP and what they unlock. Pure functions over plain data. */

/** Total XP needed to reach `level` (level 1 = 0 XP). */
export function xpForLevel(level: number): number {
  const target = Math.min(Math.max(1, Math.floor(level)), MAX_LEVEL);
  let xp = 0;
  for (let l = 1; l < target; l++) xp += xpToNextLevel(l);
  return xp;
}

const LEVEL_TABLE: number[] = Array.from({ length: MAX_LEVEL }, (_, i) => xpForLevel(i + 1));

export function levelForXp(xp: number): number {
  const x = Number.isFinite(xp) ? Math.max(0, xp) : 0;
  let lvl = 1;
  while (lvl < MAX_LEVEL && x >= LEVEL_TABLE[lvl]) lvl++;
  return lvl;
}

export interface LevelProgress {
  level: number;
  /** XP earned inside the current level. */
  into: number;
  /** XP the current level needs in total (0 at max level). */
  span: number;
  /** 0..1 (1 at max level). */
  fraction: number;
  max: boolean;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelForXp(xp);
  if (level >= MAX_LEVEL) return { level, into: 0, span: 0, fraction: 1, max: true };
  const base = LEVEL_TABLE[level - 1];
  const span = LEVEL_TABLE[level] - base;
  const into = Math.max(0, xp - base);
  return { level, into, span, fraction: Math.min(1, into / span), max: false };
}

/** XP for riding: distance, near misses, overtakes, opposite lane, wheelies and combos. */
export function xpForRun(s: Pick<RunStats, 'distance' | 'nearMisses' | 'overtakes' | 'oppositeDistance' | 'wheelieDistance' | 'maxCombo'>): number {
  const pos = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);
  let xp = pos(s.distance) * RIDE_XP.distance;
  xp += pos(s.nearMisses) * RIDE_XP.nearMiss;
  xp += pos(s.overtakes) * RIDE_XP.overtake;
  xp += pos(s.oppositeDistance) * RIDE_XP.opposite;
  xp += pos(s.wheelieDistance) * RIDE_XP.wheelie;
  if (s.maxCombo >= 3) xp += pos(s.maxCombo) * RIDE_XP.combo;
  return Math.floor(xp);
}

/** XP for completing a mission: full on the first clear, a share on replays, plus a bonus per newly earned star. */
export function missionXp(def: MissionDef, firstClear: boolean, newStars: number): number {
  const base = def.rewards.xp * (firstClear ? 1 : REPLAY_XP_SHARE);
  return Math.round(base + Math.max(0, newStars) * def.rewards.xp * STAR_XP_SHARE);
}

// ───────────────────────────── unlocks ─────────────────────────────

export function bikeUnlockLevel(bikeId: string): number {
  return BIKE_UNLOCK_LEVEL.get(bikeId) ?? MAX_LEVEL;
}

export interface UnlockState {
  xp: number;
  ownedBikes: readonly string[];
  career: CareerSave;
}

/** A bike can be bought once the rider level or a career milestone unlocks it (owned bikes are always available). */
export function isBikeUnlocked(st: UnlockState, bikeId: string): boolean {
  if (!BIKE_BY_ID.has(bikeId)) return false;
  if (st.ownedBikes.includes(bikeId)) return true;
  if (levelForXp(st.xp) >= bikeUnlockLevel(bikeId)) return true;
  return careerUnlockedBikes(st.career).includes(bikeId);
}

/** Short Turkish explanation of how a locked bike unlocks. */
export function bikeLockText(bike: BikeSpec): string {
  const m = missionUnlockingBike(bike.id);
  const lvl = `Seviye ${bikeUnlockLevel(bike.id)}`;
  return m ? `${lvl} veya Görev ${m.number}` : lvl;
}

/** Free-play maps unlock with the rider level (MapDef.unlockLevel). */
export function isMapUnlocked(xp: number, map: MapId): boolean {
  const def = MAP_BY_ID.get(map);
  return !!def && levelForXp(xp) >= def.unlockLevel;
}
