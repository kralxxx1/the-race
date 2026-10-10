import { LOWER_IS_BETTER, type MissionDef, type Objective, type SecondaryObjective, type StarMetric, type StarRule } from '../data/career';

/**
 * Render-independent career mission logic. `GameSession` feeds a
 * `MissionSample` every fixed simulation tick; the tracker decides progress,
 * completion, failure and stars. Nothing here touches the DOM or three.js, so
 * every objective can be unit-tested with synthetic samples.
 */

export type MissionStatus = 'running' | 'complete' | 'failed';
export type MissionFailReason = 'crash' | 'timeUp' | 'distanceUp' | 'tooSlow' | 'quit';

/** Cumulative run measurements at one tick (see ScoreKeeper / GameSession). */
export interface MissionSample {
  /** Seconds since the start signal. */
  time: number;
  /** Metres ridden since the start signal. */
  distance: number;
  /** Metres ridden during this tick. */
  distanceDelta: number;
  speedKmh: number;
  score: number;
  overtakes: number;
  nearMisses: number;
  combo: number;
  maxCombo: number;
  topSpeed: number;
  oppositeDistance: number;
  wheelieDistance: number;
  /** Length of the wheelie in progress (0 when both wheels are down). */
  currentWheelie: number;
  longestWheelie: number;
}

export function emptySample(): MissionSample {
  return {
    time: 0,
    distance: 0,
    distanceDelta: 0,
    speedKmh: 0,
    score: 0,
    overtakes: 0,
    nearMisses: 0,
    combo: 0,
    maxCombo: 0,
    topSpeed: 0,
    oppositeDistance: 0,
    wheelieDistance: 0,
    currentWheelie: 0,
    longestWheelie: 0,
  };
}

export type MissionEvent =
  | { type: 'checkpoint'; index: number; bonus: number }
  | { type: 'armed' }
  | { type: 'complete'; stars: number }
  | { type: 'failed'; reason: MissionFailReason };

export interface MissionResult {
  id: string;
  status: 'complete' | 'failed';
  failReason: MissionFailReason | null;
  /** 0 when failed, otherwise 1..3. */
  stars: number;
  metric: StarMetric;
  metricValue: number;
  /** 0..1 progress when the run ended. */
  progress: number;
  secondaryMet: boolean;
  time: number;
  distance: number;
}

/** Seconds below the target speed tolerated in a keep-speed mission (lets a wobble or gear change pass). */
export const KEEP_SPEED_GRACE = 1.0;

export function starsFor(rule: StarRule, value: number): 1 | 2 | 3 {
  const lower = LOWER_IS_BETTER[rule.metric];
  const meets = (t: number) => (lower ? value <= t : value >= t);
  if (!meets(rule.two)) return 1;
  return meets(rule.three) ? 3 : 2;
}

export function secondaryValue(sec: SecondaryObjective, s: MissionSample): number {
  switch (sec.kind) {
    case 'nearMisses':
      return s.nearMisses;
    case 'overtakes':
      return s.overtakes;
    case 'topSpeed':
      return s.topSpeed;
    case 'oppositeLane':
      return s.oppositeDistance;
    case 'wheelie':
      return s.wheelieDistance;
    case 'combo':
      return s.maxCombo;
  }
}

const clamp01 = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : Number.isFinite(x) ? x : 0);

export class MissionTracker {
  status: MissionStatus = 'running';
  failReason: MissionFailReason | null = null;
  /** 0..1 */
  progress = 0;
  /** Stars earned (set on completion). */
  stars = 0;
  metricValue = 0;
  secondaryMet = false;
  /** Seconds left on the active clock (time limit or checkpoint timer); null when untimed. */
  timeLeft: number | null = null;
  /** Metres left before a distance limit fails the mission; null when unlimited. */
  distanceLeft: number | null = null;
  /** Checkpoints reached so far. */
  checkpointIndex = 0;
  /** Keep-speed: the target speed has been reached and is now enforced. */
  armed = false;
  /** Keep-speed: seconds spent below the target since it was last held. */
  belowTime = 0;
  /** Keep-speed: metres covered at or above the target. */
  heldDistance = 0;
  /** Survive: seconds spent at or above the minimum speed. */
  aliveTime = 0;
  readonly events: MissionEvent[] = [];
  /** Latest sample (copied, so callers may reuse their object). */
  readonly last: MissionSample = emptySample();

  constructor(readonly def: MissionDef) {
    const o = def.objective;
    if (o.type === 'checkpoints') this.timeLeft = o.startTime;
    else if (def.limit.time) this.timeLeft = def.limit.time;
    if (def.limit.distance) this.distanceLeft = def.limit.distance;
  }

  get objective(): Objective {
    return this.def.objective;
  }

  get running(): boolean {
    return this.status === 'running';
  }

  /** Current value of the secondary objective (0 when there is none). */
  get secondaryProgress(): number {
    const sec = this.def.secondary;
    return sec ? secondaryValue(sec, this.last) : 0;
  }

  /** Advance one simulation tick. Ignored once the mission is decided. */
  update(dt: number, s: MissionSample): void {
    if (this.status !== 'running') return;
    Object.assign(this.last, s);
    const def = this.def;
    const o = def.objective;
    const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
    let done = false;

    switch (o.type) {
      case 'distance':
        this.progress = clamp01(s.distance / o.meters);
        done = s.distance >= o.meters;
        break;
      case 'checkpoints': {
        const total = o.count * o.spacing;
        // Several checkpoints can fall into one tick only with absurd speeds; handle it anyway.
        while (this.checkpointIndex < o.count && s.distance >= (this.checkpointIndex + 1) * o.spacing) {
          this.checkpointIndex++;
          if (this.checkpointIndex < o.count) {
            this.timeLeft = (this.timeLeft ?? 0) + o.bonusTime;
            this.events.push({ type: 'checkpoint', index: this.checkpointIndex, bonus: o.bonusTime });
          }
        }
        this.progress = clamp01(s.distance / total);
        done = this.checkpointIndex >= o.count;
        if (!done) {
          this.timeLeft = Math.max(0, (this.timeLeft ?? 0) - step);
          if (this.timeLeft <= 0) {
            this.fail('timeUp');
            return;
          }
        }
        break;
      }
      case 'overtakes':
        this.progress = clamp01(s.overtakes / o.count);
        done = s.overtakes >= o.count;
        break;
      case 'nearMisses':
        this.progress = clamp01(s.nearMisses / o.count);
        done = s.nearMisses >= o.count;
        break;
      case 'oppositeLane':
        this.progress = clamp01(s.oppositeDistance / o.meters);
        done = s.oppositeDistance >= o.meters;
        break;
      case 'keepSpeed':
        if (!this.armed) {
          if (s.speedKmh >= o.kmh) {
            this.armed = true;
            this.events.push({ type: 'armed' });
          } else if (s.time > o.startWindow) {
            this.fail('tooSlow');
            return;
          }
        }
        if (this.armed) {
          if (s.speedKmh >= o.kmh) {
            this.belowTime = 0;
            this.heldDistance += Math.max(0, s.distanceDelta);
          } else {
            this.belowTime += step;
            if (this.belowTime > KEEP_SPEED_GRACE) {
              this.fail('tooSlow');
              return;
            }
          }
        }
        this.progress = clamp01(this.heldDistance / o.meters);
        done = this.heldDistance >= o.meters;
        break;
      case 'topSpeed':
        this.progress = clamp01(s.topSpeed / o.kmh);
        done = s.topSpeed >= o.kmh;
        break;
      case 'wheelie': {
        const v = o.single ? Math.max(s.longestWheelie, s.currentWheelie) : s.wheelieDistance;
        this.progress = clamp01(v / o.meters);
        done = v >= o.meters;
        break;
      }
      case 'score':
        this.progress = clamp01(s.score / o.points);
        done = s.score >= o.points;
        break;
      case 'survive':
        if (s.speedKmh >= o.minKmh) this.aliveTime += step;
        this.progress = clamp01(this.aliveTime / o.seconds);
        done = this.aliveTime >= o.seconds;
        break;
      case 'combo':
        this.progress = clamp01(Math.max(s.combo, s.maxCombo) / o.combo);
        done = Math.max(s.combo, s.maxCombo) >= o.combo;
        break;
    }

    if (o.type !== 'checkpoints' && def.limit.time) this.timeLeft = Math.max(0, def.limit.time - s.time);
    if (def.limit.distance) this.distanceLeft = Math.max(0, def.limit.distance - s.distance);
    if (def.secondary) this.secondaryMet = secondaryValue(def.secondary, s) >= def.secondary.target;

    // Completion wins over a limit reached on the very same tick.
    if (done) {
      this.complete(s);
      return;
    }
    if (def.limit.time && s.time >= def.limit.time) this.fail('timeUp');
    else if (def.limit.distance && s.distance >= def.limit.distance) this.fail('distanceUp');
  }

  private complete(s: MissionSample): void {
    this.status = 'complete';
    this.progress = 1;
    this.metricValue = this.metric(s);
    this.stars = starsFor(this.def.stars, this.metricValue);
    this.events.push({ type: 'complete', stars: this.stars });
  }

  private metric(s: MissionSample): number {
    switch (this.def.stars.metric) {
      case 'time':
        return s.time;
      case 'distanceUsed':
        return s.distance;
      case 'timeLeft':
        return this.timeLeft ?? 0;
      case 'avgSpeed':
        return s.time > 0 ? (s.distance / s.time) * 3.6 : 0;
      case 'nearMisses':
        return s.nearMisses;
      case 'overtakes':
        return s.overtakes;
      case 'score':
        return s.score;
      case 'maxCombo':
        return s.maxCombo;
      case 'topSpeed':
        return s.topSpeed;
    }
  }

  /** End the mission unsuccessfully (crash, quit, limits). No effect once decided. */
  fail(reason: MissionFailReason): void {
    if (this.status !== 'running') return;
    this.status = 'failed';
    this.failReason = reason;
    this.stars = 0;
    if (reason === 'timeUp' && this.timeLeft !== null) this.timeLeft = 0;
    this.events.push({ type: 'failed', reason });
  }

  result(): MissionResult {
    return {
      id: this.def.id,
      status: this.status === 'complete' ? 'complete' : 'failed',
      failReason: this.status === 'complete' ? null : (this.failReason ?? 'quit'),
      stars: this.status === 'complete' ? this.stars : 0,
      metric: this.def.stars.metric,
      metricValue: this.metricValue,
      progress: this.progress,
      secondaryMet: this.status === 'complete' && this.secondaryMet,
      time: this.last.time,
      distance: this.last.distance,
    };
  }
}

// ───────────────────────────── Turkish text ─────────────────────────────

export function fmtKm(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} km`;
}

export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.ceil(sec - 1e-9));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const fmtN = (n: number) => Math.floor(n).toLocaleString('tr-TR');

/** One-line objective, e.g. "5 km yol kat et · 3:20 içinde". */
export function objectiveText(def: MissionDef): string {
  const o = def.objective;
  let t: string;
  switch (o.type) {
    case 'distance':
      t = `${fmtKm(o.meters)} yol kat et`;
      break;
    case 'checkpoints':
      t = `${o.count} kontrol noktasına süre bitmeden ulaş`;
      break;
    case 'overtakes':
      t = `${o.count} aracı solla`;
      break;
    case 'nearMisses':
      t = `${o.count} kıl payı geçiş yap`;
      break;
    case 'oppositeLane':
      t = `Karşı şeritte ${fmtKm(o.meters)} sür`;
      break;
    case 'keepSpeed':
      t = `${o.kmh} km/s üstünde ${fmtKm(o.meters)} sür`;
      break;
    case 'topSpeed':
      t = `${o.kmh} km/s hıza ulaş`;
      break;
    case 'wheelie':
      t = o.single ? `Tek seferde ${fmtKm(o.meters)} wheelie yap` : `Toplam ${fmtKm(o.meters)} wheelie yap`;
      break;
    case 'score':
      t = `${fmtN(o.points)} puan topla`;
      break;
    case 'survive':
      t = `${o.seconds} sn hayatta kal (${o.minKmh}+ km/s)`;
      break;
    case 'combo':
      t = `x${o.combo} komboya ulaş`;
      break;
  }
  const lim: string[] = [];
  if (def.limit.time) lim.push(`${fmtClock(def.limit.time)} içinde`);
  if (def.limit.distance) lim.push(`${fmtKm(def.limit.distance)} içinde`);
  return lim.length ? `${t} · ${lim.join(', ')}` : t;
}

export function secondaryText(sec: SecondaryObjective): string {
  switch (sec.kind) {
    case 'nearMisses':
      return `${sec.target} kıl payı`;
    case 'overtakes':
      return `${sec.target} sollama`;
    case 'topSpeed':
      return `${sec.target} km/s azami hız`;
    case 'oppositeLane':
      return `karşı şeritte ${fmtKm(sec.target)}`;
    case 'wheelie':
      return `${fmtKm(sec.target)} wheelie`;
    case 'combo':
      return `x${sec.target} kombo`;
  }
}

export function formatMetric(metric: StarMetric, v: number): string {
  switch (metric) {
    case 'time':
      return fmtClock(v);
    case 'timeLeft':
      return `${Math.floor(v)} sn`;
    case 'distanceUsed':
      return fmtKm(v);
    case 'avgSpeed':
    case 'topSpeed':
      return `${Math.round(v)} km/s`;
    case 'maxCombo':
      return `x${Math.floor(v)}`;
    case 'nearMisses':
    case 'overtakes':
    case 'score':
      return fmtN(v);
  }
}

const METRIC_LABEL: Record<StarMetric, string> = {
  time: 'Süre',
  distanceUsed: 'Kullanılan mesafe',
  timeLeft: 'Kalan süre',
  avgSpeed: 'Ortalama hız',
  nearMisses: 'Kıl payı',
  overtakes: 'Sollama',
  score: 'Puan',
  maxCombo: 'Kombo',
  topSpeed: 'Azami hız',
};

export function metricLabel(metric: StarMetric): string {
  return METRIC_LABEL[metric];
}

/** "Süre ≤ 2:05" style requirement for 2 or 3 stars. */
export function starRuleText(rule: StarRule, stars: 2 | 3): string {
  const t = stars === 2 ? rule.two : rule.three;
  return `${METRIC_LABEL[rule.metric]} ${LOWER_IS_BETTER[rule.metric] ? '≤' : '≥'} ${formatMetric(rule.metric, t)}`;
}

export function failReasonText(r: MissionFailReason): string {
  switch (r) {
    case 'crash':
      return 'Kaza yaptın';
    case 'timeUp':
      return 'Süre doldu';
    case 'distanceUp':
      return 'Mesafe hakkın bitti';
    case 'tooSlow':
      return 'Hedef hızın altına düştün';
    case 'quit':
      return 'Görevden çıkıldı';
  }
}

/** Live HUD view of a tracker. */
export interface MissionHudView {
  title: string;
  objective: string;
  progress: number;
  /** "2,4 / 5 km" */
  value: string;
  /** Seconds on the visible clock or null. */
  timeLeft: number | null;
  secondary: string | null;
  secondaryDone: boolean;
  /** Something needs the rider's attention (speed dropping, clock running out). */
  warn: boolean;
}

export function missionHud(t: MissionTracker): MissionHudView {
  const def = t.def;
  const o = def.objective;
  const s = t.last;
  let value: string;
  switch (o.type) {
    case 'distance':
      value = `${fmtKm(Math.min(s.distance, o.meters))} / ${fmtKm(o.meters)}`;
      break;
    case 'checkpoints':
      value = `${t.checkpointIndex} / ${o.count} nokta · sonraki ${fmtKm(Math.max(0, (t.checkpointIndex + 1) * o.spacing - s.distance))}`;
      break;
    case 'overtakes':
      value = `${Math.min(s.overtakes, o.count)} / ${o.count}`;
      break;
    case 'nearMisses':
      value = `${Math.min(s.nearMisses, o.count)} / ${o.count}`;
      break;
    case 'oppositeLane':
      value = `${fmtKm(Math.min(s.oppositeDistance, o.meters))} / ${fmtKm(o.meters)}`;
      break;
    case 'keepSpeed':
      value = t.armed ? `${fmtKm(Math.min(t.heldDistance, o.meters))} / ${fmtKm(o.meters)}` : `${o.kmh} km/s hıza çık!`;
      break;
    case 'topSpeed':
      value = `${Math.round(s.topSpeed)} / ${o.kmh} km/s`;
      break;
    case 'wheelie': {
      const v = o.single ? Math.max(s.longestWheelie, s.currentWheelie) : s.wheelieDistance;
      value = `${fmtKm(Math.min(v, o.meters))} / ${fmtKm(o.meters)}`;
      break;
    }
    case 'score':
      value = `${fmtN(Math.min(s.score, o.points))} / ${fmtN(o.points)}`;
      break;
    case 'survive':
      value = `${Math.floor(Math.min(t.aliveTime, o.seconds))} / ${o.seconds} sn`;
      break;
    case 'combo':
      value = `x${Math.max(s.combo, s.maxCombo)} / x${o.combo}`;
      break;
  }
  if (t.distanceLeft !== null && t.running) value += ` · kalan ${fmtKm(t.distanceLeft)}`;
  const sec = def.secondary;
  const warn =
    (o.type === 'keepSpeed' && t.armed && t.belowTime > 0) ||
    (o.type === 'survive' && s.speedKmh < o.minKmh && s.time > 3) ||
    (t.timeLeft !== null && t.timeLeft < 10 && t.running);
  return {
    title: `GÖREV ${def.number} · ${def.title}`,
    objective: objectiveText(def),
    progress: t.progress,
    value,
    timeLeft: t.timeLeft,
    secondary: sec ? `Bonus: ${secondaryText(sec)} (${formatSecondary(sec, t.secondaryProgress)})` : null,
    secondaryDone: t.secondaryMet,
    warn,
  };
}

function formatSecondary(sec: SecondaryObjective, v: number): string {
  if (sec.kind === 'oppositeLane' || sec.kind === 'wheelie') return `${fmtKm(Math.min(v, sec.target))}/${fmtKm(sec.target)}`;
  if (sec.kind === 'topSpeed') return `${Math.round(v)}/${sec.target}`;
  return `${Math.min(Math.floor(v), sec.target)}/${sec.target}`;
}
