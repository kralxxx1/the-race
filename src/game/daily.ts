import { DAILY_REWARDS } from '../data/progression';
import { isFiniteNumber } from '../core/math';

/**
 * Daily login reward. Days are local calendar days ("YYYY-MM-DD"); a claim is
 * possible once per day, consecutive days grow the streak and a missed day
 * resets it. If the clock goes backwards (or was set forward, claimed and set
 * back) nothing can be claimed until the calendar passes the last claimed day,
 * so changing the clock can never produce a second claim.
 */
export interface DailyState {
  /** Local calendar day of the last claim, or null if never claimed. */
  lastDay: string | null;
  /** Consecutive days claimed up to and including `lastDay`. */
  streak: number;
  /** Total number of claims (statistics). */
  claims: number;
}

export function emptyDaily(): DailyState {
  return { lastDay: null, streak: 0, claims: 0 };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar day of `now` as "YYYY-MM-DD". */
export function dayKey(now: Date): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Days since the epoch for a day key (DST-proof: computed on the calendar date, not on local time). */
export function dayNumber(key: string): number | null {
  const m = KEY_RE.exec(key);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  // Reject impossible dates such as 2024-02-31.
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return Math.round(t / 86_400_000);
}

export type DailyAvailability = 'available' | 'claimed' | 'clockBehind';

export interface DailyStatus {
  availability: DailyAvailability;
  /** Streak the next claim would produce (1 after a missed day). */
  nextStreak: number;
  /** Reward for the next claim. */
  reward: { cash: number; xp: number };
  /** Index into DAILY_REWARDS of the next claim (0..6). */
  ladderIndex: number;
}

export function rewardForStreak(streak: number): { cash: number; xp: number } {
  const i = Math.min(Math.max(1, Math.floor(streak)), DAILY_REWARDS.length) - 1;
  return DAILY_REWARDS[i];
}

export function dailyStatus(state: DailyState, now: Date): DailyStatus {
  const today = dayNumber(dayKey(now));
  const last = state.lastDay ? dayNumber(state.lastDay) : null;
  let availability: DailyAvailability = 'available';
  let nextStreak = 1;
  // An unreadable clock (invalid Date, year outside 1000-9999) must never produce a claim.
  if (today === null) availability = 'clockBehind';
  if (today !== null && last !== null) {
    const diff = today - last;
    if (diff === 0) availability = 'claimed';
    else if (diff < 0) availability = 'clockBehind';
    nextStreak = diff === 1 || diff <= 0 ? state.streak + 1 : 1;
  }
  nextStreak = Math.max(1, nextStreak);
  return { availability, nextStreak, reward: rewardForStreak(nextStreak), ladderIndex: Math.min(nextStreak, DAILY_REWARDS.length) - 1 };
}

/**
 * Claim today's reward. Returns the reward and mutates `state`, or returns null
 * when nothing can be claimed right now.
 */
export function claimDaily(state: DailyState, now: Date): { cash: number; xp: number; streak: number } | null {
  const st = dailyStatus(state, now);
  if (st.availability !== 'available') return null;
  state.lastDay = dayKey(now);
  state.streak = st.nextStreak;
  state.claims += 1;
  return { ...st.reward, streak: st.nextStreak };
}

export function sanitizeDaily(raw: unknown): DailyState {
  const r = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const lastDay = typeof r.lastDay === 'string' && dayNumber(r.lastDay) !== null ? r.lastDay : null;
  const int = (v: unknown, hi: number) => (isFiniteNumber(v) ? Math.floor(Math.min(Math.max(0, v), hi)) : 0);
  return { lastDay, streak: lastDay ? int(r.streak, 100_000) : 0, claims: int(r.claims, 1e7) };
}
