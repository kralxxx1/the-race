import { BIKE_BY_ID, STARTER_BIKE_ID } from '../data/bikes';
import { ENV_BY_ID, type EnvId } from '../data/environments';
import { MODE_BY_ID, type ModeId } from '../data/modes';
import { MAX_UPGRADE, type Upgrades } from '../physics/bike';
import { clamp, isFiniteNumber } from '../core/math';

export const SAVE_KEY = 'the-race.save';
export const SAVE_VERSION = 2;

export type Quality = 'low' | 'medium' | 'high' | 'ultra';
export type CameraMode = 'helmet' | 'chase' | 'far' | 'low';
export type SpeedUnit = 'kmh' | 'mph';

export interface Settings {
  quality: Quality;
  camera: CameraMode;
  units: SpeedUnit;
  autoShift: boolean;
  masterVolume: number;
  engineVolume: number;
  sfxVolume: number;
  steerSensitivity: number;
  tiltControls: boolean;
  speedBlur: boolean;
  cameraShake: boolean;
  showFps: boolean;
}

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
  lastMode: ModeId;
  lastEnv: EnvId;
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  quality: 'high',
  camera: 'chase',
  units: 'kmh',
  autoShift: true,
  masterVolume: 0.8,
  engineVolume: 0.9,
  sfxVolume: 0.8,
  steerSensitivity: 1,
  tiltControls: false,
  speedBlur: true,
  cameraShake: true,
  showFps: false,
};

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
    lastMode: 'endless',
    lastEnv: 'day',
    settings: { ...DEFAULT_SETTINGS },
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
const bool = (v: unknown, def: boolean): boolean => (typeof v === 'boolean' ? v : def);
const oneOf = <T extends string>(v: unknown, opts: readonly T[], def: T): T =>
  typeof v === 'string' && (opts as readonly string[]).includes(v) ? (v as T) : def;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function sanitizeSettings(raw: unknown): Settings {
  const r = isObj(raw) ? raw : {};
  const d = DEFAULT_SETTINGS;
  return {
    quality: oneOf(r.quality, ['low', 'medium', 'high', 'ultra'] as const, d.quality),
    camera: oneOf(r.camera, ['helmet', 'chase', 'far', 'low'] as const, d.camera),
    units: oneOf(r.units, ['kmh', 'mph'] as const, d.units),
    autoShift: bool(r.autoShift, d.autoShift),
    masterVolume: num(r.masterVolume, d.masterVolume, 0, 1),
    engineVolume: num(r.engineVolume, d.engineVolume, 0, 1),
    sfxVolume: num(r.sfxVolume, d.sfxVolume, 0, 1),
    steerSensitivity: num(r.steerSensitivity, d.steerSensitivity, 0.5, 1.5),
    tiltControls: bool(r.tiltControls, d.tiltControls),
    speedBlur: bool(r.speedBlur, d.speedBlur),
    cameraShake: bool(r.cameraShake, d.cameraShake),
    showFps: bool(r.showFps, d.showFps),
  };
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
    lastMode: oneOf(raw.lastMode, [...MODE_BY_ID.keys()], def.lastMode),
    lastEnv: oneOf(raw.lastEnv, [...ENV_BY_ID.keys()], def.lastEnv),
    settings: sanitizeSettings(raw.settings),
  };
}

export class SaveManager {
  data: SaveData;
  readonly persistent: boolean;
  private store: KeyValueStore;
  private listeners = new Set<(d: SaveData) => void>();
  lastError: string | null = null;

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
    if (!text) return defaultSave();
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
    this.data = defaultSave();
    this.data.settings = settings;
    this.save();
  }

  owns(bikeId: string): boolean {
    return this.data.ownedBikes.includes(bikeId);
  }

  /** Attempt to buy a bike. Returns false if unknown, already owned or unaffordable. */
  buy(bikeId: string): boolean {
    const bike = BIKE_BY_ID.get(bikeId);
    if (!bike || this.owns(bikeId) || this.data.cash < bike.price) return false;
    this.data.cash -= bike.price;
    this.data.ownedBikes.push(bikeId);
    this.data.selectedBike = bikeId;
    this.save();
    return true;
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

  /** Record a finished run; returns whether it set a new high score. */
  recordRun(mode: ModeId, stats: { score: number; distance: number; nearMisses: number; topSpeed: number }, cash: number): boolean {
    const d = this.data;
    const prev = d.highScores[mode] ?? 0;
    const record = stats.score > prev;
    if (record) d.highScores[mode] = Math.floor(stats.score);
    d.cash += Math.max(0, Math.floor(cash));
    d.bestDistance = Math.max(d.bestDistance, stats.distance);
    d.totalDistance += Math.max(0, stats.distance);
    d.totalNearMisses += Math.max(0, stats.nearMisses);
    d.topSpeedEver = Math.max(d.topSpeedEver, stats.topSpeed);
    d.gamesPlayed++;
    this.save();
    return record;
  }

  updateSettings(patch: Partial<Settings>): void {
    this.data.settings = sanitizeSettings({ ...this.data.settings, ...patch });
    this.save();
  }
}
