import type { MapId } from './maps';

export type EnvId = 'day' | 'sunset' | 'night' | 'rain';

/**
 * Per-map scenery description consumed by the world renderer (src/render/world): which scenery
 * builder to run and the atmosphere knobs it reads. Filled by resolveEnvironment.
 */
export interface WorldDesc {
  /** Scenery builder to run. */
  map: MapId;
  /** Wind strength 0 (calm) .. 1 (storm): foliage sway amplitude. */
  wind: number;
  /** Snow lying on foliage, roofs, banks and rocks (0 none .. 1 deep). */
  snow: number;
  /** Heat-haze shimmer over the asphalt (hot, dry maps). */
  heat: number;
  /** Mist density multiplier for valley/forest fog sheets. */
  mist: number;
}

export const DEFAULT_WORLD: WorldDesc = { map: 'highway', wind: 0.35, snow: 0, heat: 0, mist: 0 };

export interface EnvDef {
  /** Template id (`day`, `rain`…) or a resolved `map:time:weather` id. */
  id: string;
  name: string;
  description: string;
  /** Tyre/road friction coefficient. */
  grip: number;
  sky: {
    zenith: string;
    horizon: string;
    ground: string;
    sunColor: string;
    sunIntensity: number;
    /** Degrees above the horizon. */
    sunElevation: number;
    /** Degrees, 0 = straight ahead (−Z), positive = to the right. */
    sunAzimuth: number;
    sunDisc: number;
    stars: boolean;
    clouds: number;
  };
  fog: { color: string; near: number; far: number };
  hemi: { sky: string; ground: string; intensity: number };
  exposure: number;
  terrain: 'grass' | 'sand' | 'city' | 'forest';
  scenery: {
    trees: 'olive' | 'pine' | 'cactus' | 'none';
    treeDensity: number;
    buildings: boolean;
    streetLights: boolean;
    lightsOn: boolean;
    rocks: boolean;
  };
  wet: boolean;
  rain: boolean;
  lightning: boolean;
  mountains: { near: string; far: string; height: number };
  bloom: { strength: number; threshold: number; radius: number };
  /** Vehicles drive with headlights on. */
  headlights: boolean;
  ambience: 'country' | 'desert' | 'city' | 'rain';
  world: WorldDesc;
}

export const ENVIRONMENTS: EnvDef[] = [
  {
    id: 'day',
    name: 'Ege Otoyolu — Gündüz',
    description: 'Zeytin ağaçları, yeşil tepeler ve parlak Akdeniz güneşi.',
    grip: 1.1,
    sky: {
      zenith: '#2f6fc0', horizon: '#bcd7ef', ground: '#6b7d5a', sunColor: '#fff3df', sunIntensity: 3.2,
      sunElevation: 48, sunAzimuth: -35, sunDisc: 1, stars: false, clouds: 0.35,
    },
    fog: { color: '#c3d6e8', near: 180, far: 1250 },
    hemi: { sky: '#cfe3ff', ground: '#5f6b4a', intensity: 0.9 },
    exposure: 0.95,
    terrain: 'grass',
    scenery: { trees: 'olive', treeDensity: 1, buildings: false, streetLights: false, lightsOn: false, rocks: true },
    wet: false,
    rain: false,
    lightning: false,
    mountains: { near: '#6f8a73', far: '#9db3c4', height: 1 },
    bloom: { strength: 0.18, threshold: 0.92, radius: 0.4 },
    headlights: false,
    ambience: 'country',
    world: DEFAULT_WORLD,
  },
  {
    id: 'sunset',
    name: 'Çöl Otoyolu — Gün Batımı',
    description: 'Kızıl kumlar, kayalıklar ve ufka gömülen alçak güneş. Uzun gölgeler.',
    grip: 1.05,
    sky: {
      zenith: '#2d3561', horizon: '#ff9a5a', ground: '#a7643a', sunColor: '#ffb070', sunIntensity: 2.6,
      sunElevation: 7, sunAzimuth: 18, sunDisc: 1.6, stars: false, clouds: 0.25,
    },
    fog: { color: '#e49b6e', near: 160, far: 1150 },
    hemi: { sky: '#ffb98a', ground: '#7a4a2a', intensity: 0.75 },
    exposure: 1.0,
    terrain: 'sand',
    scenery: { trees: 'cactus', treeDensity: 0.5, buildings: false, streetLights: false, lightsOn: false, rocks: true },
    wet: false,
    rain: false,
    lightning: false,
    mountains: { near: '#8a4a3a', far: '#c07a62', height: 1.2 },
    bloom: { strength: 0.35, threshold: 0.8, radius: 0.55 },
    headlights: true,
    ambience: 'desert',
    world: DEFAULT_WORLD,
  },
  {
    id: 'night',
    name: 'İstanbul Çevre Yolu — Gece',
    description: 'Sodyum sokak lambaları, gökdelen ışıkları ve neon yansımaları.',
    grip: 1.08,
    sky: {
      zenith: '#03050c', horizon: '#1d2236', ground: '#0b0c10', sunColor: '#8fa6ff', sunIntensity: 0.35,
      sunElevation: 35, sunAzimuth: 30, sunDisc: 0.0, stars: true, clouds: 0.15,
    },
    fog: { color: '#141826', near: 90, far: 900 },
    hemi: { sky: '#3a4466', ground: '#0d0e12', intensity: 0.45 },
    exposure: 1.15,
    terrain: 'city',
    scenery: { trees: 'none', treeDensity: 0, buildings: true, streetLights: true, lightsOn: true, rocks: false },
    wet: false,
    rain: false,
    lightning: false,
    mountains: { near: '#10131c', far: '#181c2a', height: 0.6 },
    bloom: { strength: 0.9, threshold: 0.55, radius: 0.6 },
    headlights: true,
    ambience: 'city',
    world: DEFAULT_WORLD,
  },
  {
    id: 'rain',
    name: 'Karadeniz — Yağmurlu',
    description: 'Islak asfalt, çam ormanları ve sis. Yol tutuşu azalır, frenler uzar.',
    grip: 0.74,
    sky: {
      zenith: '#4a535e', horizon: '#9aa4ad', ground: '#3a4236', sunColor: '#d8e0e8', sunIntensity: 0.9,
      sunElevation: 40, sunAzimuth: -20, sunDisc: 0, stars: false, clouds: 1,
    },
    fog: { color: '#8e989f', near: 40, far: 620 },
    hemi: { sky: '#b6c0c8', ground: '#3a4236', intensity: 1.1 },
    exposure: 0.95,
    terrain: 'forest',
    scenery: { trees: 'pine', treeDensity: 1.3, buildings: false, streetLights: true, lightsOn: false, rocks: true },
    wet: true,
    rain: true,
    lightning: true,
    mountains: { near: '#3d4a42', far: '#6f7a80', height: 1.4 },
    bloom: { strength: 0.3, threshold: 0.75, radius: 0.5 },
    headlights: true,
    ambience: 'rain',
    world: DEFAULT_WORLD,
  },
];

export const ENV_BY_ID: ReadonlyMap<EnvId, EnvDef> = new Map(ENVIRONMENTS.map((e) => [e.id as EnvId, e]));
