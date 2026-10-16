import { ENV_BY_ID, type EnvDef, type EnvId, type WorldDesc } from './environments';
import type { ModeId } from './modes';

/**
 * Maps (routes), times of day and weather. A run is played on one map with one
 * time/weather combination; `resolveEnvironment` turns that into the lighting,
 * fog, grip and scenery description the renderer and physics consume.
 */

export type MapId = 'suburb' | 'highway' | 'desert' | 'city' | 'coast' | 'forest' | 'snow' | 'industrial';
export type TimeOfDay = 'dawn' | 'day' | 'sunset' | 'night';
export type Weather = 'clear' | 'cloudy' | 'rain' | 'fog' | 'snow';

export const TIME_LABELS: Record<TimeOfDay, string> = { dawn: 'Şafak', day: 'Gündüz', sunset: 'Gün batımı', night: 'Gece' };
export const WEATHER_LABELS: Record<Weather, string> = { clear: 'Açık', cloudy: 'Bulutlu', rain: 'Yağmurlu', fog: 'Sisli', snow: 'Karlı' };

export interface MapDef {
  id: MapId;
  name: string;
  /** Short location line under the name. */
  region: string;
  description: string;
  defaultTime: TimeOfDay;
  defaultWeather: Weather;
  /** Combinations the player may pick in free choice modes. */
  times: readonly TimeOfDay[];
  weathers: readonly Weather[];
  /** Rider level needed to play this map outside the career. */
  unlockLevel: number;
  /** Lighting/scenery template used until the map has its own world description. */
  baseEnv: EnvId;
  /** Accent colour for menu cards. */
  color: string;
}

export const MAPS: readonly MapDef[] = [
  {
    id: 'suburb',
    name: 'Banliyö',
    region: 'Bursa — çevre yolu',
    description: 'Bahçeli evler, kavşaklar ve sakin trafik. Kariyerin başladığı yer.',
    defaultTime: 'day',
    defaultWeather: 'clear',
    times: ['dawn', 'day', 'sunset', 'night'],
    weathers: ['clear', 'cloudy', 'rain', 'fog'],
    unlockLevel: 1,
    baseEnv: 'day',
    color: '#5fb85a',
  },
  {
    id: 'highway',
    name: 'Ege Otoyolu',
    region: 'İzmir — Aydın',
    description: 'Zeytinlikler arasında geniş ve hızlı otoyol. Yüksek hız bonusları için ideal.',
    defaultTime: 'day',
    defaultWeather: 'clear',
    times: ['dawn', 'day', 'sunset', 'night'],
    weathers: ['clear', 'cloudy', 'rain', 'fog'],
    unlockLevel: 1,
    baseEnv: 'day',
    color: '#3f8fd8',
  },
  {
    id: 'desert',
    name: 'Çöl Yolu',
    region: 'Konya ovası',
    description: 'Kızıl kum tepeleri, kaya oluşumları ve sıcak hava dalgalanması.',
    defaultTime: 'sunset',
    defaultWeather: 'clear',
    times: ['dawn', 'day', 'sunset', 'night'],
    weathers: ['clear', 'cloudy'],
    unlockLevel: 3,
    baseEnv: 'sunset',
    color: '#e0874a',
  },
  {
    id: 'city',
    name: 'İstanbul Gece',
    region: 'İstanbul — E-5',
    description: 'Gökdelenler, neonlar, sodyum lambaları ve yoğun şehir trafiği.',
    defaultTime: 'night',
    defaultWeather: 'clear',
    times: ['day', 'sunset', 'night'],
    weathers: ['clear', 'cloudy', 'rain', 'fog'],
    unlockLevel: 5,
    baseEnv: 'night',
    color: '#9d6bff',
  },
  {
    id: 'coast',
    name: 'Sahil Yolu',
    region: 'Antalya — Kaş',
    description: 'Turkuaz deniz, kayalık yamaçlar ve virajlı sahil şeridi.',
    defaultTime: 'day',
    defaultWeather: 'clear',
    times: ['dawn', 'day', 'sunset', 'night'],
    weathers: ['clear', 'cloudy', 'rain'],
    unlockLevel: 8,
    baseEnv: 'day',
    color: '#21b8c9',
  },
  {
    id: 'forest',
    name: 'Karadeniz Ormanı',
    region: 'Rize — Ayder',
    description: 'Islak asfalt, çam ormanları ve sis. Yol tutuşu düşük, frenler uzun.',
    defaultTime: 'day',
    defaultWeather: 'rain',
    times: ['dawn', 'day', 'sunset', 'night'],
    weathers: ['clear', 'cloudy', 'rain', 'fog'],
    unlockLevel: 11,
    baseEnv: 'rain',
    color: '#2f8a57',
  },
  {
    id: 'snow',
    name: 'Karlı Dağ Geçidi',
    region: 'Erzurum — Palandöken',
    description: 'Karla kaplı zirveler, buzlu kenarlar ve soğuk, berrak hava.',
    defaultTime: 'day',
    defaultWeather: 'snow',
    times: ['dawn', 'day', 'sunset', 'night'],
    weathers: ['clear', 'cloudy', 'snow', 'fog'],
    unlockLevel: 14,
    baseEnv: 'day',
    color: '#b9d4ec',
  },
  {
    id: 'industrial',
    name: 'Sanayi ve Tüneller',
    region: 'Kocaeli — D-100',
    description: 'Fabrikalar, liman vinçleri ve uzun aydınlatmalı tüneller.',
    defaultTime: 'sunset',
    defaultWeather: 'cloudy',
    times: ['day', 'sunset', 'night'],
    weathers: ['clear', 'cloudy', 'rain', 'fog'],
    unlockLevel: 18,
    baseEnv: 'night',
    color: '#c9a23a',
  },
];

export const MAP_BY_ID: ReadonlyMap<MapId, MapDef> = new Map(MAPS.map((m) => [m.id, m]));

/** Everything needed to start a run. */
export interface RunConfig {
  mode: ModeId;
  map: MapId;
  time: TimeOfDay;
  weather: Weather;
  /** Career mission being played, if any. */
  missionId?: string;
  seed?: number;
}

export function defaultRunConfig(): RunConfig {
  return { mode: 'endless', map: 'highway', time: 'day', weather: 'clear' };
}

/** Per-map atmosphere of the scenery (wind, heat haze, valley mist); weather then adjusts it. */
const WORLD_BASE: Record<MapId, Pick<WorldDesc, 'wind' | 'heat' | 'mist'>> = {
  suburb: { wind: 0.3, heat: 0.1, mist: 0 },
  highway: { wind: 0.4, heat: 0.3, mist: 0 },
  desert: { wind: 0.5, heat: 1, mist: 0 },
  city: { wind: 0.2, heat: 0.1, mist: 0 },
  coast: { wind: 0.75, heat: 0.1, mist: 0.1 },
  forest: { wind: 0.4, heat: 0, mist: 1 },
  snow: { wind: 0.65, heat: 0, mist: 0.4 },
  industrial: { wind: 0.25, heat: 0.1, mist: 0.1 },
};

const TIME_TEMPLATE: Record<TimeOfDay, EnvId> = { dawn: 'sunset', day: 'day', sunset: 'sunset', night: 'night' };

/**
 * Combine a map's scenery with a time of day and weather into one environment.
 * Lighting comes from the time-of-day template, scenery from the map template,
 * and weather adjusts grip, fog, clouds and precipitation.
 */
export function resolveEnvironment(mapId: MapId, time: TimeOfDay, weather: Weather): EnvDef {
  const map = MAP_BY_ID.get(mapId) ?? MAPS[0];
  const base = ENV_BY_ID.get(map.baseEnv)!;
  const light = ENV_BY_ID.get(TIME_TEMPLATE[time])!;
  const env: EnvDef = {
    ...base,
    id: `${map.id}:${time}:${weather}`,
    name: `${map.name} — ${TIME_LABELS[time]}, ${WEATHER_LABELS[weather]}`,
    description: map.description,
    sky: { ...light.sky },
    fog: { ...light.fog },
    hemi: { ...light.hemi },
    exposure: light.exposure,
    bloom: { ...light.bloom },
    headlights: light.headlights,
    scenery: { ...base.scenery, lightsOn: time === 'night' || time === 'dawn' ? base.scenery.streetLights : false },
    wet: false,
    rain: false,
    lightning: false,
    grip: 1.08,
    world: { map: map.id, ...WORLD_BASE[map.id], snow: map.id === 'snow' ? 1 : 0 },
  };
  if (time === 'dawn') {
    env.sky = { ...env.sky, sunElevation: 4, sunAzimuth: -60, zenith: '#3b4f7a', horizon: '#f2b27a' };
    env.exposure = 1.05;
  }
  if (map.id === 'forest') {
    env.terrain = 'grass';
    // Dark moss floor under the canopy: let the vertex colours darken the photograph strongly.
    env.world = { ...env.world, groundMix: 0.95 };
  }
  if (map.id === 'desert') env.world = { ...env.world, groundMix: 0.85 };
  if (map.id === 'snow') {
    env.terrain = 'grass';
    env.mountains = { near: '#d7e1ea', far: '#eef3f8', height: 1.6 };
    env.scenery = { ...env.scenery, trees: 'pine', treeDensity: 0.8 };
    env.grip = 0.9;
  }
  if (map.id === 'city' || map.id === 'industrial') {
    env.terrain = 'city';
    env.scenery = { ...env.scenery, buildings: true, streetLights: true, trees: 'none', lightsOn: time !== 'day' };
  }
  switch (weather) {
    case 'clear':
      break;
    case 'cloudy':
      env.sky = { ...env.sky, clouds: Math.max(env.sky.clouds, 0.75), sunIntensity: env.sky.sunIntensity * 0.6 };
      break;
    case 'rain': {
      env.world = { ...env.world, wind: Math.min(1, env.world.wind * 1.5 + 0.15), heat: 0 };
      const rain = ENV_BY_ID.get('rain')!;
      env.wet = true;
      env.rain = true;
      env.lightning = time !== 'dawn';
      env.grip = rain.grip;
      env.sky = { ...env.sky, clouds: 1, sunIntensity: env.sky.sunIntensity * 0.35, sunDisc: 0 };
      env.fog = { ...env.fog, near: env.fog.near * 0.4, far: env.fog.far * 0.55 };
      env.headlights = true;
      break;
    }
    case 'fog':
      env.world = { ...env.world, heat: 0, mist: Math.max(env.world.mist, 0.6) };
      env.fog = { ...env.fog, near: 15, far: 260 };
      env.sky = { ...env.sky, clouds: 1, sunDisc: 0, sunIntensity: env.sky.sunIntensity * 0.45 };
      env.headlights = true;
      env.grip = 1.0;
      break;
    case 'snow':
      env.world = { ...env.world, snow: 1, heat: 0, wind: Math.min(1, env.world.wind + 0.15) };
      env.wet = true;
      env.grip = 0.78;
      env.sky = { ...env.sky, clouds: 0.9, sunIntensity: env.sky.sunIntensity * 0.55 };
      env.fog = { ...env.fog, color: '#d9e2ea', near: 40, far: 520 };
      env.headlights = true;
      break;
  }
  return env;
}
