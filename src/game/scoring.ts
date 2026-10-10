import { clamp } from '../core/math';

export const BONUS_SPEED_KMH = 100;
export const NEAR_MISS_CLEARANCE = 0.9;
export const COMBO_WINDOW = 3.2;
/** A wheelie only counts as distance above this speed (no "walking pace" wheelies). */
export const WHEELIE_MIN_KMH = 30;

export interface ScoreContext {
  speedKmh: number;
  distanceDelta: number;
  oppositeLane: boolean;
  wheelie: boolean;
}

export interface RunStats {
  score: number;
  distance: number;
  time: number;
  topSpeed: number;
  nearMisses: number;
  overtakes: number;
  maxCombo: number;
  oppositeLaneTime: number;
  wheelieTime: number;
  highSpeedTime: number;
  /** Metres ridden in the oncoming lanes (any speed). */
  oppositeDistance: number;
  /** Metres ridden on the rear wheel. */
  wheelieDistance: number;
  /** Longest single wheelie (m). */
  longestWheelie: number;
}

export function emptyRunStats(): RunStats {
  return {
    score: 0,
    distance: 0,
    time: 0,
    topSpeed: 0,
    nearMisses: 0,
    overtakes: 0,
    maxCombo: 0,
    oppositeLaneTime: 0,
    wheelieTime: 0,
    highSpeedTime: 0,
    oppositeDistance: 0,
    wheelieDistance: 0,
    longestWheelie: 0,
  };
}

/** Pure scoring rules (Traffic-Rider style), independent of rendering. */
export class ScoreKeeper {
  score = 0;
  distance = 0;
  time = 0;
  topSpeed = 0;
  nearMisses = 0;
  overtakes = 0;
  combo = 0;
  maxCombo = 0;
  comboTimer = 0;
  oppositeLaneTime = 0;
  wheelieTime = 0;
  highSpeedTime = 0;
  oppositeDistance = 0;
  wheelieDistance = 0;
  /** Length of the wheelie in progress (0 when the front wheel is down). */
  currentWheelie = 0;
  longestWheelie = 0;
  /** Score gained from continuous sources this frame (for HUD flourish). */
  lastRate = 0;

  get multiplier(): number {
    return clamp(1 + this.combo * 0.25, 1, 4);
  }

  update(dt: number, ctx: ScoreContext): void {
    if (dt <= 0) return;
    this.time += dt;
    const dd = Math.max(0, ctx.distanceDelta);
    this.distance += dd;
    this.topSpeed = Math.max(this.topSpeed, ctx.speedKmh);
    if (ctx.oppositeLane) this.oppositeDistance += dd;
    if (ctx.wheelie && ctx.speedKmh >= WHEELIE_MIN_KMH) {
      this.wheelieDistance += dd;
      this.currentWheelie += dd;
      if (this.currentWheelie > this.longestWheelie) this.longestWheelie = this.currentWheelie;
    } else this.currentWheelie = 0;
    let rate = Math.max(0, ctx.speedKmh - 40) * 0.6;
    if (ctx.speedKmh >= BONUS_SPEED_KMH) {
      this.highSpeedTime += dt;
      if (ctx.oppositeLane) {
        rate *= 2;
        this.oppositeLaneTime += dt;
      }
    }
    if (ctx.wheelie && ctx.speedKmh >= 50) {
      rate += 45 * (ctx.speedKmh / 100);
      this.wheelieTime += dt;
    }
    this.lastRate = rate;
    this.score += rate * dt;
    if (this.combo > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 0;
        this.comboTimer = 0;
      }
    }
  }

  /** Register a vehicle passed with `clearance` metres of air. Returns awarded points (0 if none). */
  nearMiss(clearance: number, speedKmh: number, oncoming: boolean): number {
    if (speedKmh < BONUS_SPEED_KMH || clearance >= NEAR_MISS_CLEARANCE || clearance < 0) return 0;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.comboTimer = COMBO_WINDOW;
    this.nearMisses++;
    const closeness = 1 + (NEAR_MISS_CLEARANCE - clearance) / NEAR_MISS_CLEARANCE; // 1..2
    const speedFactor = speedKmh / 150;
    const pts = Math.round(160 * closeness * speedFactor * (oncoming ? 1.5 : 1) * this.multiplier);
    this.score += pts;
    return pts;
  }

  overtake(): void {
    this.overtakes++;
  }

  addBonus(points: number): void {
    this.score += Math.max(0, points);
  }

  stats(): RunStats {
    return {
      score: Math.floor(this.score),
      distance: this.distance,
      time: this.time,
      topSpeed: this.topSpeed,
      nearMisses: this.nearMisses,
      overtakes: this.overtakes,
      maxCombo: this.maxCombo,
      oppositeLaneTime: this.oppositeLaneTime,
      wheelieTime: this.wheelieTime,
      highSpeedTime: this.highSpeedTime,
      oppositeDistance: this.oppositeDistance,
      wheelieDistance: this.wheelieDistance,
      longestWheelie: this.longestWheelie,
    };
  }
}

/** Cash reward for a finished run. */
export function cashForRun(stats: RunStats): number {
  const base = stats.score / 12;
  const dist = stats.distance / 50;
  return Math.max(0, Math.floor(base + dist));
}
