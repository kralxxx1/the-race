import { BIKE_BY_ID, STARTER_BIKE_ID } from '../data/bikes';
import { MISSION_BY_ID } from '../data/career';
import { MAP_BY_ID, defaultRunConfig, type MapId, type RunConfig, type TimeOfDay, type Weather } from '../data/maps';
import { MODE_BY_ID, type ModeId } from '../data/modes';
import { defaultGear, sanitizeGear, type RiderGear } from '../data/riderGear';
import { PRESET_KEY, SETTINGS, type QualityPreset, type SettingValue } from '../settings';
import { MAX_UPGRADE, type Upgrades } from '../physics/bike';
import { clamp, isFiniteNumber } from '../core/math';
import type { AchievementDef } from '../data/achievements';
import { achContext, grantAchievements, reachedAchievements, sanitizeAchievements } from '../game/achievements';
import { emptyCareer, sanitizeCareer, type CareerSave } from '../game/careerProgress';
import { claimDaily, emptyDaily, sanitizeDaily, type DailyState } from '../game/daily';
import { sanitizeLeaderboards, type Leaderboards } from '../game/leaderboard';
import { applyRun, type RunOutcome, type RunRecordInput } from '../game/progress';
import { isBikeUnlocked, levelForXp } from '../game/progression';
import { emptyStatsSave, sanitizeStatsSave, type StatsSave } from '../game/stats';

export const SAVE_KEY = 'the-race.save';
export const SAVE_VERSION = 5;

export type Quality = QualityPreset;
export type SpeedUnit = 'kmh' | 'mph';
/** Flat, registry-validated settings record (see src/settings). */
export type Settings = Record<string, SettingValue>;

export interface SaveData {
  version: number;
  cash: number;
  ownedBikes: string[];
  selectedBike: string;
  liveryChoice: Record<string, number>;
  upgrades: Record<string, Upgrades>;
  highScores: Partial<Record<ModeId, number>>;
  bestDistance: number;
  totalDistance: number;
  totalNearMisses: number;
  gamesPlayed: number;
  topSpeedEver: number;
  /** The last run configuration chosen in the menus. */
  lastRun: RunConfig;
  settings: Settings;
  // ── v4: progression ──
  /** Rider experience; the level is derived from it (src/game/progression.ts). */
  xp: number;
  career: CareerSave;
  /** Unlocked achievement id → unlock time (epoch ms, 0 if unknown). */
  achievements: Record<string, number>;
  stats: StatsSave;
  leaderboards: Leaderboards;
  daily: DailyState;
  // ── v5: rider gear ──
  /** Helmet, leathers and gloves chosen on the rider screen (sanitised, see data/riderGear.ts). */
  rider: RiderGear;
}

export function defaultSettings(preset: QualityPreset = 'high'): Settings {
  return SETTINGS.defaults(preset);
}

export const STARTING_CASH = 3000;

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    cash: STARTING_CASH,
    ownedBikes: [STARTER_BIKE_ID],
    selectedBike: STARTER_BIKE_ID,
    liveryChoice: {},
    upgrades: {},
    highScores: {},
    bestDistance: 0,
    totalDistance: 0,
    totalNearMisses: 0,
    gamesPlayed: 0,
    topSpeedEver: 0,
    lastRun: defaultRunConfig(),
    settings: defaultSettings(),
    xp: 0,
    career: emptyCareer(),
    achievements: {},
    stats: emptyStatsSave(),
    leaderboards: {},
    daily: emptyDaily(),
    rider: defaultGear(),
  };
}

/** Minimal storage interface so tests can inject fakes and private-mode browsers degrade gracefully. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStore implements KeyValueStore {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

/** Returns window.localStorage if it is usable, otherwise an in-memory store. */
export function detectStore(): { store: KeyValueStore; persistent: boolean } {
  try {
    const ls = globalThis.localStorage;
    if (ls) {
      const probe = '__the_race_probe__';
      ls.setItem(probe, '1');
      ls.removeItem(probe);
      return { store: ls, persistent: true };
    }
  } catch {
    /* private mode / disabled storage */
  }
  return { store: new MemoryStore(), persistent: false };
}

const num = (v: unknown, def: number, lo = 0, hi = Number.MAX_SAFE_INTEGER): number =>
  isFiniteNumber(v) ? clamp(v, lo, hi) : def;
const oneOf = <T extends string>(v: unknown, opts: readonly T[], def: T): T =>
  typeof v === 'string' && (opts as readonly string[]).includes(v) ? (v as T) : def;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const V2_ENV_TO_RUN: Record<string, Pick<RunConfig, 'map' | 'time' | 'weather'>> = {
  day: { map: 'highway', time: 'day', weather: 'clear' },
  sunset: { map: 'desert', time: 'sunset', weather: 'clear' },
  night: { map: 'city', time: 'night', weather: 'clear' },
  rain: { map: 'forest', time: 'day', weather: 'rain' },
};

/** v2 stored settings as named fields; v3 uses namespaced registry keys. */
function migrateSettingsV2(r: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  // Already-namespaced keys (hand-edited or partially migrated saves) pass through.
  for (const [k, v] of Object.entries(r)) if (k.includes('.')) out[k] = v;
  const map: [string, string][] = [
    ['quality', PRESET_KEY],
    ['units', 'hud.units'],
    ['masterVolume', 'audio.master'],
    ['engineVolume', 'audio.engine'],
    ['sfxVolume', 'audio.sfx'],
    ['steerSensitivity', 'ctrl.steerSensitivity'],
    ['tiltControls', 'ctrl.tilt'],
    ['speedBlur', 'fx.speedBlur'],
    ['cameraShake', 'cam.shake'],
    ['showFps', 'hud.showFps'],
  ];
  for (const [from, to] of map) if (from in r) out[to] = r[from];
  if (typeof r.autoShift === 'boolean') out['play.autoShift'] = r.autoShift ? 'auto' : 'manual';
  return out;
}

function sanitizeRun(raw: unknown): RunConfig {
  const d = defaultRunConfig();
  const r = isObj(raw) ? raw : {};
  const map = MAP_BY_ID.get(r.map as MapId);
  const out: RunConfig = {
    mode: oneOf(r.mode, [...MODE_BY_ID.keys()], d.mode),
    map: map ? map.id : d.map,
    time: d.time,
    weather: d.weather,
  };
  const m = MAP_BY_ID.get(out.map)!;
  out.time = oneOf<TimeOfDay>(r.time, m.times, m.defaultTime);
  out.weather = oneOf<Weather>(r.weather, m.weathers, m.defaultWeather);
  // A career run is only meaningful with a known mission; otherwise fall back to free play.
  if (out.mode === 'career') {
    const def = typeof r.missionId === 'string' ? MISSION_BY_ID.get(r.missionId) : undefined;
    if (def) {
      out.missionId = def.id;
      out.map = def.map;
      out.time = def.time;
      out.weather = def.weather;
    } else out.mode = d.mode;
  }
  if (isFiniteNumber(r.seed) && Number.isInteger(r.seed) && r.seed > 0 && r.seed < 2 ** 31) out.seed = r.seed;
  return out;
}

function sanitizeUpgrades(raw: unknown): Upgrades {
  const r = isObj(raw) ? raw : {};
  const lvl = (v: unknown) => Math.round(num(v, 0, 0, MAX_UPGRADE));
  return { engine: lvl(r.engine), brakes: lvl(r.brakes), handling: lvl(r.handling) };
}

/** Upgrade v1 saves (single `bestScore`, `bike` field) to the current schema. */
export function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  const v = num(raw.version, 1, 0, 1000);
  const out: Record<string, unknown> = { ...raw };
  if (v < 2) {
    if (typeof raw.bike === 'string' && out.selectedBike === undefined) out.selectedBike = raw.bike;
    if (isFiniteNumber(raw.bestScore) && out.highScores === undefined) out.highScores = { endless: raw.bestScore };
    if (Array.isArray(raw.bikes) && out.ownedBikes === undefined) out.ownedBikes = raw.bikes;
    delete out.bike;
    delete out.bestScore;
    delete out.bikes;
  }
  if (v < 3) {
    if (isObj(raw.settings)) out.settings = migrateSettingsV2(raw.settings);
    const run = V2_ENV_TO_RUN[typeof raw.lastEnv === 'string' ? raw.lastEnv : 'day'] ?? V2_ENV_TO_RUN.day;
    out.lastRun = { mode: raw.lastMode, ...run };
    delete out.lastMode;
    delete out.lastEnv;
  }
  if (v < 4) {
    // v4 adds statistics, XP, career, achievements, leaderboards and the daily reward.
    // Seed the lifetime statistics and some XP from the totals older versions kept,
    // so experienced riders do not start again at level 1.
    const dist = num(raw.totalDistance, 0, 0, 1e12);
    const near = Math.floor(num(raw.totalNearMisses, 0, 0, 1e9));
    if (!isObj(out.stats)) {
      out.stats = {
        lifetime: {
          runs: Math.floor(num(raw.gamesPlayed, 0, 0, 1e9)),
          distance: dist,
          nearMisses: near,
          topSpeed: num(raw.topSpeedEver, 0, 0, 1000),
          bestDistance: num(raw.bestDistance, 0, 0, 1e9),
          bestScore: Math.max(0, ...Object.values(isObj(raw.highScores) ? raw.highScores : {}).filter(isFiniteNumber)),
        },
      };
    }
    if (!isFiniteNumber(out.xp)) out.xp = Math.floor(dist * 0.1 + near * 10);
  }
  if (v < 5) {
    // v5 adds the rider gear; older saves keep the bike-livery look until the player customises it.
    if (!isObj(out.rider)) out.rider = defaultGear();
  }
  out.version = SAVE_VERSION;
  return out;
}

/** Validate untrusted JSON into a well-formed SaveData; never throws. */
export function sanitizeSave(input: unknown): SaveData {
  const def = defaultSave();
  if (!isObj(input)) return def;
  const raw = migrate(input);
  const owned = Array.isArray(raw.ownedBikes)
    ? [...new Set(raw.ownedBikes.filter((id): id is string => typeof id === 'string' && BIKE_BY_ID.has(id)))]
    : [];
  if (!owned.includes(STARTER_BIKE_ID)) owned.unshift(STARTER_BIKE_ID);
  const selected = typeof raw.selectedBike === 'string' && owned.includes(raw.selectedBike) ? raw.selectedBike : owned[0];

  const liveryChoice: Record<string, number> = {};
  if (isObj(raw.liveryChoice)) {
    for (const [id, idx] of Object.entries(raw.liveryChoice)) {
      const b = BIKE_BY_ID.get(id);
      if (b && isFiniteNumber(idx)) liveryChoice[id] = clamp(Math.floor(idx), 0, b.liveries.length - 1);
    }
  }
  const upgrades: Record<string, Upgrades> = {};
  if (isObj(raw.upgrades)) {
    for (const [id, u] of Object.entries(raw.upgrades)) if (BIKE_BY_ID.has(id)) upgrades[id] = sanitizeUpgrades(u);
  }
  const highScores: Partial<Record<ModeId, number>> = {};
  if (isObj(raw.highScores)) {
    for (const [id, sc] of Object.entries(raw.highScores)) {
      if (MODE_BY_ID.has(id as ModeId) && isFiniteNumber(sc) && sc >= 0) highScores[id as ModeId] = Math.floor(sc);
    }
  }
  return {
    version: SAVE_VERSION,
    cash: Math.floor(num(raw.cash, def.cash, 0, 1e12)),
    ownedBikes: owned,
    selectedBike: selected,
    liveryChoice,
    upgrades,
    highScores,
    bestDistance: num(raw.bestDistance, 0, 0, 1e9),
    totalDistance: num(raw.totalDistance, 0, 0, 1e12),
    totalNearMisses: Math.floor(num(raw.totalNearMisses, 0, 0, 1e9)),
    gamesPlayed: Math.floor(num(raw.gamesPlayed, 0, 0, 1e9)),
    topSpeedEver: num(raw.topSpeedEver, 0, 0, 1000),
    lastRun: sanitizeRun(raw.lastRun),
    settings: SETTINGS.sanitize(raw.settings),
    xp: Math.floor(num(raw.xp, 0, 0, 1e9)),
    career: sanitizeCareer(raw.career),
    achievements: sanitizeAchievements(raw.achievements),
    stats: sanitizeStatsSave(raw.stats),
    leaderboards: sanitizeLeaderboards(raw.leaderboards),
    daily: sanitizeDaily(raw.daily),
    rider: sanitizeGear(raw.rider),
  };
}

export class SaveManager {
  data: SaveData;
  readonly persistent: boolean;
  private store: KeyValueStore;
  private listeners = new Set<(d: SaveData) => void>();
  lastError: string | null = null;
  /** True when no previous save existed (first launch on this device). */
  isNew = false;

  constructor(store?: KeyValueStore) {
    if (store) {
      this.store = store;
      this.persistent = true;
    } else {
      const det = detectStore();
      this.store = det.store;
      this.persistent = det.persistent;
    }
    this.data = this.load();
  }

  load(): SaveData {
    let text: string | null = null;
    try {
      text = this.store.getItem(SAVE_KEY);
    } catch (e) {
      this.lastError = String(e);
    }
    if (!text) {
      this.isNew = true;
      return defaultSave();
    }
    try {
      return sanitizeSave(JSON.parse(text));
    } catch (e) {
      // Corrupted save: keep a backup copy for debugging and start fresh.
      this.lastError = String(e);
      try {
        this.store.setItem(`${SAVE_KEY}.corrupt`, text);
      } catch {
        /* ignore */
      }
      return defaultSave();
    }
  }

  save(): boolean {
    try {
      this.store.setItem(SAVE_KEY, JSON.stringify(this.data));
      this.lastError = null;
      for (const l of this.listeners) l(this.data);
      return true;
    } catch (e) {
      this.lastError = String(e);
      return false;
    }
  }

  onChange(fn: (d: SaveData) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  reset(): void {
    const settings = this.data.settings;
    // The daily reward state survives a reset so resetting cannot be used to claim twice a day.
    const daily = this.data.daily;
    this.data = defaultSave();
    this.data.settings = settings;
    this.data.daily = daily;
    this.save();
  }

  get level(): number {
    return levelForXp(this.data.xp);
  }

  /** Can `bikeId` be bought (rider level or career milestone)? */
  isBikeUnlocked(bikeId: string): boolean {
    return isBikeUnlocked(this.data, bikeId);
  }

  /** Achievements unlocked since the last check (e.g. after buying a bike); rewards are paid. */
  private checkAchievements(): AchievementDef[] {
    return grantAchievements(this.data, Date.now()).unlocked;
  }

  /** Achievements unlocked by the last non-run action (purchase, daily reward). */
  lastUnlocks: AchievementDef[] = [];

  /**
   * Mark the achievements the loaded save already qualifies for as unlocked (e.g. riders upgrading
   * from v3 whose old totals reach early tiers). Retroactive unlocks pay no reward, so loading a
   * save can never create money or XP; returns the newly marked achievements.
   */
  reconcileAchievements(): AchievementDef[] {
    const fresh = reachedAchievements(this.data.achievements, achContext(this.data));
    const now = Date.now();
    for (const a of fresh) this.data.achievements[a.id] = now;
    if (fresh.length) this.save();
    this.lastUnlocks = fresh;
    return fresh;
  }

  owns(bikeId: string): boolean {
    return this.data.ownedBikes.includes(bikeId);
  }

  /** Attempt to buy a bike. Returns false if unknown, already owned or unaffordable. */
  buy(bikeId: string): boolean {
    const bike = BIKE_BY_ID.get(bikeId);
    if (!bike || this.owns(bikeId) || this.data.cash < bike.price || !this.isBikeUnlocked(bikeId)) return false;
    this.data.cash -= bike.price;
    this.data.ownedBikes.push(bikeId);
    this.data.selectedBike = bikeId;
    this.lastUnlocks = this.checkAchievements();
    this.save();
    return true;
  }

  /** Claim today's daily reward (`now` injectable for tests). Null if not available. */
  claimDaily(now: Date = new Date()): { cash: number; xp: number; streak: number } | null {
    const r = claimDaily(this.data.daily, now);
    if (!r) return null;
    this.data.cash += r.cash;
    this.data.xp += r.xp;
    this.lastUnlocks = this.checkAchievements();
    this.save();
    return r;
  }

  /** Commit a finished run (rewards, statistics, career, achievements) and persist it. */
  commitRun(rec: RunRecordInput): RunOutcome {
    const out = applyRun(this.data, rec);
    this.save();
    return out;
  }

  select(bikeId: string): boolean {
    if (!this.owns(bikeId)) return false;
    this.data.selectedBike = bikeId;
    this.save();
    return true;
  }

  setLivery(bikeId: string, idx: number): void {
    const bike = BIKE_BY_ID.get(bikeId);
    if (!bike) return;
    this.data.liveryChoice[bikeId] = clamp(Math.floor(idx), 0, bike.liveries.length - 1);
    this.save();
  }

  livery(bikeId: string): number {
    return this.data.liveryChoice[bikeId] ?? 0;
  }

  /** Commit the rider's gear (validated; unknown values fall back to the defaults). */
  setGear(gear: RiderGear): void {
    this.data.rider = sanitizeGear(gear);
    this.save();
  }

  upgradesFor(bikeId: string): Upgrades {
    return this.data.upgrades[bikeId] ?? { engine: 0, brakes: 0, handling: 0 };
  }

  static upgradeCost(bikePrice: number, level: number): number {
    return Math.round((bikePrice * 0.06 * (level + 1)) / 50) * 50 + 250;
  }

  upgrade(bikeId: string, kind: keyof Upgrades): boolean {
    const bike = BIKE_BY_ID.get(bikeId);
    if (!bike || !this.owns(bikeId)) return false;
    const u = { ...this.upgradesFor(bikeId) };
    if (u[kind] >= MAX_UPGRADE) return false;
    const cost = SaveManager.upgradeCost(bike.price, u[kind]);
    if (this.data.cash < cost) return false;
    this.data.cash -= cost;
    u[kind]++;
    this.data.upgrades[bikeId] = u;
    this.save();
    return true;
  }

  /**
   * Apply setting changes through the registry (validation, presets → "custom").
   * Keys are applied in order, so `{ 'gfx.preset': 'ultra', 'gfx.msaa': '8' }` works.
   */
  updateSettings(patch: Readonly<Record<string, unknown>>): void {
    let next = this.data.settings;
    for (const [k, v] of Object.entries(patch)) next = SETTINGS.change(next, k, v);
    this.data.settings = next;
    this.save();
  }
}
