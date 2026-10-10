import { BIKE_BY_ID } from '../data/bikes';
import { MAP_BY_ID, type MapId } from '../data/maps';
import { isFreeMode, type FreeModeId } from '../data/modes';
import { isFiniteNumber } from '../core/math';

/** Local top-10 tables, one per free mode × map. */
export const LEADERBOARD_SIZE = 10;

export interface LeaderboardEntry {
  score: number;
  /** Metres. */
  distance: number;
  bike: string;
  /** Epoch milliseconds. */
  date: number;
}

export type Leaderboards = Record<string, LeaderboardEntry[]>;

export function boardKey(mode: FreeModeId, map: MapId): string {
  return `${mode}:${map}`;
}

/** Ranking: higher score first, then longer distance, then the older entry (it got there first). */
export function compareEntries(a: LeaderboardEntry, b: LeaderboardEntry): number {
  return b.score - a.score || b.distance - a.distance || a.date - b.date;
}

/**
 * Insert an entry into a board in place; keeps it sorted and truncated.
 * Returns the 1-based rank, or null when it did not make the top 10.
 */
export function insertEntry(board: LeaderboardEntry[], entry: LeaderboardEntry): number | null {
  if (!(entry.score > 0)) return null;
  board.push(entry);
  board.sort(compareEntries);
  const idx = board.indexOf(entry);
  if (board.length > LEADERBOARD_SIZE) board.length = LEADERBOARD_SIZE;
  return idx < LEADERBOARD_SIZE ? idx + 1 : null;
}

export function recordLeaderboard(boards: Leaderboards, mode: FreeModeId, map: MapId, entry: LeaderboardEntry): number | null {
  const key = boardKey(mode, map);
  const board = (boards[key] ??= []);
  const rank = insertEntry(board, entry);
  if (board.length === 0) delete boards[key];
  return rank;
}

export function bestScore(boards: Leaderboards, mode: FreeModeId, map: MapId): number {
  return boards[boardKey(mode, map)]?.[0]?.score ?? 0;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function sanitizeLeaderboards(raw: unknown): Leaderboards {
  const out: Leaderboards = {};
  if (!isObj(raw)) return out;
  for (const [key, list] of Object.entries(raw)) {
    const [mode, map, extra] = key.split(':');
    if (extra !== undefined || !isFreeMode(mode) || !MAP_BY_ID.has(map as MapId) || !Array.isArray(list)) continue;
    const entries: LeaderboardEntry[] = [];
    for (const e of list.slice(0, 100)) {
      if (!isObj(e)) continue;
      const { score, distance, bike, date } = e;
      if (!isFiniteNumber(score) || score <= 0 || typeof bike !== 'string' || !BIKE_BY_ID.has(bike)) continue;
      entries.push({
        score: Math.floor(Math.min(score, 1e12)),
        distance: isFiniteNumber(distance) ? Math.min(Math.max(0, distance), 1e9) : 0,
        bike,
        date: isFiniteNumber(date) ? Math.min(Math.max(0, date), 8.64e15) : 0,
      });
    }
    entries.sort(compareEntries);
    if (entries.length) out[key] = entries.slice(0, LEADERBOARD_SIZE);
  }
  return out;
}
