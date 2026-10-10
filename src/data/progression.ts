import { BIKES, STARTER_BIKE_ID } from './bikes';

/**
 * Progression tuning: rider levels, bike unlock levels, career bike rewards and
 * the daily reward ladder. Pure data; the rules live in src/game/progression.ts.
 */

export const MAX_LEVEL = 50;

/**
 * XP needed to go from `level` to `level + 1`. Quadratic so the first levels
 * come after a run or two while level 50 stays a long-term goal (≈240k XP;
 * completing the whole career with good stars lands around level 30).
 */
export function xpToNextLevel(level: number): number {
  const l = Math.max(1, Math.floor(level));
  return Math.round(150 + 60 * l + 4 * l * l);
}

/**
 * Bikes become purchasable at a rider level derived from their price tier.
 * Everything in the cheapest tier (the A2-class singles and twins) is open from
 * level 1 so a new rider always has a choice.
 */
export const PRICE_TIERS: ReadonlyArray<readonly [maxPrice: number, level: number]> = [
  [6500, 1],
  [8000, 2],
  [9000, 3],
  [10000, 5],
  [11500, 7],
  [13500, 9],
  [16000, 12],
  [19000, 15],
  [22000, 19],
  [26000, 23],
  [30000, 27],
  [34000, 31],
  [Infinity, 38],
];

export function levelForPrice(price: number): number {
  for (const [max, lvl] of PRICE_TIERS) if (price <= max) return lvl;
  return MAX_LEVEL;
}

export const BIKE_UNLOCK_LEVEL: ReadonlyMap<string, number> = new Map(
  BIKES.map((b) => [b.id, b.id === STARTER_BIKE_ID ? 1 : levelForPrice(b.price)]),
);

/**
 * Finishing a map's final career mission unlocks one bike for purchase before
 * its level would (Traffic Rider style milestone rewards). Keyed by map order.
 */
export const CAREER_BIKE_REWARDS: readonly string[] = [
  'kawasaki-z900', // Banliyö
  'kawasaki-zx6r', // Ege Otoyolu
  'triumph-street-triple', // Çöl Yolu
  'ducati-panigale-v2', // İstanbul Gece
  'yamaha-r1', // Sahil Yolu
  'aprilia-rsv4', // Karadeniz Ormanı
  'kawasaki-h2', // Karlı Dağ Geçidi
  'kawasaki-h2r', // Sanayi ve Tüneller
];

/** Daily login ladder; day 7 and beyond pay the top reward while the streak lasts. */
export const DAILY_REWARDS: ReadonlyArray<{ cash: number; xp: number }> = [
  { cash: 500, xp: 50 },
  { cash: 750, xp: 75 },
  { cash: 1000, xp: 100 },
  { cash: 1500, xp: 150 },
  { cash: 2000, xp: 200 },
  { cash: 3000, xp: 250 },
  { cash: 5000, xp: 400 },
];

/** XP awarded per unit of riding (free modes and missions alike). */
export const RIDE_XP = {
  /** per metre */
  distance: 0.1,
  nearMiss: 10,
  overtake: 2,
  /** per metre in the opposite lane */
  opposite: 0.04,
  /** per metre on the rear wheel */
  wheelie: 0.1,
  /** per combo step when the best combo reached at least x3 */
  combo: 5,
} as const;

/** Share of the mission XP paid again when replaying an already cleared mission. */
export const REPLAY_XP_SHARE = 0.3;
/** Extra XP per newly earned star, as a share of the mission XP. */
export const STAR_XP_SHARE = 0.25;
/** Share of the normal run cash paid when a mission is failed. */
export const FAILED_MISSION_CASH_SHARE = 0.25;
