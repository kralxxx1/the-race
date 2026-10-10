import { BIKE_BY_ID } from '../data/bikes';
import { MAP_BY_ID, type MapId, type TimeOfDay, type Weather } from '../data/maps';
import { clamp, isFiniteNumber } from '../core/math';
import type { RunStats } from './scoring';

/**
 * Riding statistics: one block for the whole career (lifetime) plus one per bike
 * and one per map. All counters are plain numbers so the save stays JSON.
 */
export interface StatBlock {
  runs: number;
  /** Metres. */
  distance: number;
  /** Seconds actually riding (countdown excluded). */
  rideTime: number;
  crashes: number;
  nearMisses: number;
  overtakes: number;
  /** km/h */
  topSpeed: number;
  /** Longest single wheelie (m). */
  longestWheelie: number;
  wheelieDistance: number;
  oppositeDistance: number;
  maxCombo: number;
  /** Best single-run score and distance. */
  bestScore: number;
  bestDistance: number;
  nightDistance: number;
  rainDistance: number;
  fogDistance: number;
  snowDistance: number;
  missionsCompleted: number;
}

export interface StatsSave {
  lifetime: StatBlock;
  bikes: Record<string, StatBlock>;
  maps: Partial<Record<MapId, StatBlock>>;
}

export const STAT_KEYS: readonly (keyof StatBlock)[] = [
  'runs',
  'distance',
  'rideTime',
  'crashes',
  'nearMisses',
  'overtakes',
  'topSpeed',
  'longestWheelie',
  'wheelieDistance',
  'oppositeDistance',
  'maxCombo',
  'bestScore',
  'bestDistance',
  'nightDistance',
  'rainDistance',
  'fogDistance',
  'snowDistance',
  'missionsCompleted',
];

/** Fields that keep the maximum instead of a sum when blocks are merged. */
const MAX_KEYS = new Set<keyof StatBlock>(['topSpeed', 'longestWheelie', 'maxCombo', 'bestScore', 'bestDistance']);
/** Integer counters. */
const INT_KEYS = new Set<keyof StatBlock>(['runs', 'crashes', 'nearMisses', 'overtakes', 'maxCombo', 'bestScore', 'missionsCompleted']);
const LIMITS: Partial<Record<keyof StatBlock, number>> = { topSpeed: 1000, maxCombo: 1e6 };

export function emptyStats(): StatBlock {
  const b = {} as StatBlock;
  for (const k of STAT_KEYS) b[k] = 0;
  return b;
}

export function emptyStatsSave(): StatsSave {
  return { lifetime: emptyStats(), bikes: {}, maps: {} };
}

/** What a finished (or in-progress) run contributes to the statistics. */
export interface RunContribution {
  stats: RunStats;
  crashed: boolean;
  missionCompleted: boolean;
  time: TimeOfDay;
  weather: Weather;
  /** Count the run itself (false for live previews mid-run, which still add their distance). */
  countRun: boolean;
}

/** Add a run to a block in place. */
export function addRun(block: StatBlock, c: RunContribution): void {
  const r = c.stats;
  const dist = Math.max(0, r.distance);
  if (c.countRun) block.runs += 1;
  block.distance += dist;
  block.rideTime += Math.max(0, r.time);
  if (c.crashed) block.crashes += 1;
  block.nearMisses += Math.max(0, r.nearMisses);
  block.overtakes += Math.max(0, r.overtakes);
  block.topSpeed = Math.max(block.topSpeed, r.topSpeed);
  block.longestWheelie = Math.max(block.longestWheelie, r.longestWheelie);
  block.wheelieDistance += Math.max(0, r.wheelieDistance);
  block.oppositeDistance += Math.max(0, r.oppositeDistance);
  block.maxCombo = Math.max(block.maxCombo, r.maxCombo);
  block.bestScore = Math.max(block.bestScore, Math.floor(r.score));
  block.bestDistance = Math.max(block.bestDistance, dist);
  if (c.time === 'night') block.nightDistance += dist;
  if (c.weather === 'rain') block.rainDistance += dist;
  if (c.weather === 'fog') block.fogDistance += dist;
  if (c.weather === 'snow') block.snowDistance += dist;
  if (c.missionCompleted) block.missionsCompleted += 1;
}

/** A copy of `a` with `b` merged in (sums, maxima for records). */
export function mergeStats(a: StatBlock, b: StatBlock): StatBlock {
  const out = { ...a };
  for (const k of STAT_KEYS) out[k] = MAX_KEYS.has(k) ? Math.max(a[k], b[k]) : a[k] + b[k];
  return out;
}

/** Record a run into lifetime, bike and map blocks. */
export function recordStats(save: StatsSave, bikeId: string, map: MapId, c: RunContribution): void {
  addRun(save.lifetime, c);
  addRun((save.bikes[bikeId] ??= emptyStats()), c);
  addRun((save.maps[map] ??= emptyStats()), c);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function sanitizeStatBlock(raw: unknown): StatBlock {
  const r = isObj(raw) ? raw : {};
  const b = emptyStats();
  for (const k of STAT_KEYS) {
    const v = r[k];
    if (!isFiniteNumber(v)) continue;
    const c = clamp(v, 0, LIMITS[k] ?? 1e12);
    b[k] = INT_KEYS.has(k) ? Math.floor(c) : c;
  }
  return b;
}

export function sanitizeStatsSave(raw: unknown): StatsSave {
  const r = isObj(raw) ? raw : {};
  const out = emptyStatsSave();
  out.lifetime = sanitizeStatBlock(r.lifetime);
  if (isObj(r.bikes)) for (const [id, b] of Object.entries(r.bikes)) if (BIKE_BY_ID.has(id)) out.bikes[id] = sanitizeStatBlock(b);
  if (isObj(r.maps)) for (const [id, b] of Object.entries(r.maps)) if (MAP_BY_ID.has(id as MapId)) out.maps[id as MapId] = sanitizeStatBlock(b);
  return out;
}

/** Maps with at least one recorded run. */
export function mapsVisited(save: StatsSave): MapId[] {
  return (Object.keys(save.maps) as MapId[]).filter((m) => (save.maps[m]?.runs ?? 0) > 0);
}
