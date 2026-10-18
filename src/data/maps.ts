import { ENV_BY_ID, type EnvDef, type EnvId, type WorldDesc } from './environments';
import type { ModeId } from './modes';

/**
 * Maps (routes), times of day and weather. A run is played on one map with one
 * time/weather combination; `resolveEnvironment` turns that into the lighting,
 * fog, grip and scenery description the renderer and physics consume.
 */

export type MapId =
  | 'suburb'
  | 'highway'
  | 'desert'
  | 'city'
  | 'coast'
  | 'forest'
  | 'snow'
  | 'industrial'
  | 'kapadokya'
  | 'bodrum'
  | 'thrace'
  | 'ankara'
  | 'pamukkale'
  | 'kordon'
  | 'bosphorus'
  | 'safranbolu'
  | 'mardin'
  | 'blacksea'
  | 'uludag'
  | 'saltlake'
  | 'van'
  | 'nemrut'
  | 'toros'
  | 'kars';
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
  {
    id: 'kapadokya',
    name: 'Kapadokya Vadisi',
    region: 'Nevşehir — Göreme',
    description: 'Peri bacaları, tüf kayalıklar ve şafakta gökyüzünü dolduran sıcak hava balonları.',
    defaultTime: 'dawn',
    defaultWeather: 'clear',
    times: ['dawn', 'day', 'sunset', 'night'],
    weathers: ['clear', 'cloudy', 'fog'],
    unlockLevel: 20,
    baseEnv: 'sunset',
    color: '#d9a066',
  },
  {
    id: 'bodrum',
    name: 'Bodrum Yarımadası',
    region: 'Muğla — Bodrum',
    description: 'Beyaz badanalı evler, begonviller, taş yel değirmenleri ve yatlarla dolu marina.',
    defaultTime: 'sunset',
    defaultWeather: 'clear',
    times: ['dawn', 'day', 'sunset', 'night'],
    weathers: ['clear', 'cloudy'],
    unlockLevel: 22,
    baseEnv: 'day',
    color: '#2fb0d6',
  },
  {
    id: 'thrace',
    name: 'Trakya Ayçiçeği Yolu',
    region: 'Edirne — Kırklareli',
    description: 'Ufka kadar ayçiçeği tarlaları, rüzgâr türbinleri ve uzakta yükselen minareler.',
    defaultTime: 'day',
    defaultWeather: 'clear',
    times: ['dawn', 'day', 'sunset', 'night'],
    weathers: ['clear', 'cloudy', 'rain', 'fog'],
    unlockLevel: 24,
    baseEnv: 'day',
    color: '#f2c230',
  },
  {
    id: 'ankara',
    name: 'Ankara Bulvarları',
    region: 'Ankara — Eskişehir Yolu',
    description: 'Geniş bulvarlar, cam kuleler, alt geçitler ve şehrin ardında bozkır tepeleri.',
    defaultTime: 'day',
    defaultWeather: 'cloudy',
    times: ['dawn', 'day', 'sunset', 'night'],
    weathers: ['clear', 'cloudy', 'snow', 'fog'],
    unlockLevel: 26,
    baseEnv: 'day',
    color: '#8a8fa8',
  },
  {
    id: 'pamukkale',
    name: 'Pamukkale Travertenleri',
    region: 'Denizli — Pamukkale',
    description: 'Bembeyaz traverten basamakları, turkuaz termal havuzlar ve antik Hierapolis.',
    defaultTime: 'day',
    defaultWeather: 'clear',
    times: ['dawn', 'day', 'sunset'],
    weathers: ['clear', 'cloudy'],
    unlockLevel: 28,
    baseEnv: 'day',
    color: '#9fd8e8',
  },
  {
    id: 'kordon',
    name: 'İzmir Kordon',
    region: 'İzmir — Kordonboyu',
    description: 'Palmiyeli sahil bulvarı, vapurlar, saat kulesi ve körfeze batan güneş.',
    defaultTime: 'sunset',
    defaultWeather: 'clear',
    times: ['dawn', 'day', 'sunset', 'night'],
    weathers: ['clear', 'cloudy', 'rain'],
    unlockLevel: 30,
    baseEnv: 'sunset',
    color: '#ff8a5c',
  },
  {
    id: 'bosphorus',
    name: 'Boğaz Köprüsü',
    region: 'İstanbul — Boğaziçi',
    description: 'Asma köprü, iki yakada yalılar ve şehir ışıkları, altından geçen gemiler.',
    defaultTime: 'night',
    defaultWeather: 'clear',
    times: ['day', 'sunset', 'night'],
    weathers: ['clear', 'cloudy', 'rain', 'fog'],
    unlockLevel: 32,
    baseEnv: 'night',
    color: '#3a7bd5',
  },
  {
    id: 'safranbolu',
    name: 'Safranbolu Konakları',
    region: 'Karabük — Safranbolu',
    description: 'Ahşap Osmanlı konakları, taş köprüler, bakırcılar çarşısı ve yeşil vadiler.',
    defaultTime: 'day',
    defaultWeather: 'clear',
    times: ['dawn', 'day', 'sunset', 'night'],
    weathers: ['clear', 'cloudy', 'rain', 'fog'],
    unlockLevel: 34,
    baseEnv: 'day',
    color: '#b5653a',
  },
  {
    id: 'mardin',
    name: 'Mardin Taş Yolu',
    region: 'Mardin — Mezopotamya Ovası',
    description: 'Yamaca yaslanan bal rengi taş evler, kubbeler ve sonsuz Mezopotamya ovası.',
    defaultTime: 'sunset',
    defaultWeather: 'clear',
    times: ['dawn', 'day', 'sunset', 'night'],
    weathers: ['clear', 'cloudy'],
    unlockLevel: 36,
    baseEnv: 'sunset',
    color: '#c9935a',
  },
  {
    id: 'blacksea',
    name: 'Karadeniz Sahil Yolu',
    region: 'Trabzon — Rize',
    description: 'Bir yanda dalgalı deniz, öbür yanda dik çay bahçeleri, köprüler ve tüneller.',
    defaultTime: 'day',
    defaultWeather: 'cloudy',
    times: ['dawn', 'day', 'sunset', 'night'],
    weathers: ['clear', 'cloudy', 'rain', 'fog'],
    unlockLevel: 38,
    baseEnv: 'day',
    color: '#3c8d6e',
  },
  {
    id: 'uludag',
    name: 'Uludağ Sonbahar Yolu',
    region: 'Bursa — Uludağ',
    description: 'Sarı, turuncu ve kızıl yapraklı orman, yere düşen yapraklar ve sisli virajlar.',
    defaultTime: 'day',
    defaultWeather: 'clear',
    times: ['dawn', 'day', 'sunset', 'night'],
    weathers: ['clear', 'cloudy', 'rain', 'fog'],
    unlockLevel: 40,
    baseEnv: 'day',
    color: '#d2691e',
  },
  {
    id: 'saltlake',
    name: 'Tuz Gölü',
    region: 'Aksaray — Şereflikoçhisar',
    description: 'Ufka kadar bembeyaz tuz düzlüğü, gökyüzünü yansıtan sığ su ve titreyen serap.',
    defaultTime: 'day',
    defaultWeather: 'clear',
    times: ['dawn', 'day', 'sunset', 'night'],
    weathers: ['clear', 'cloudy'],
    unlockLevel: 42,
    baseEnv: 'day',
    color: '#e8eef2',
  },
  {
    id: 'van',
    name: 'Van Gölü Kıyısı',
    region: 'Van — Tatvan',
    description: 'Uçsuz bucaksız mavi göl, karlı Süphan Dağı ve rüzgârlı yüksek yayla.',
    defaultTime: 'day',
    defaultWeather: 'clear',
    times: ['dawn', 'day', 'sunset', 'night'],
    weathers: ['clear', 'cloudy', 'snow'],
    unlockLevel: 44,
    baseEnv: 'day',
    color: '#2f6fd1',
  },
  {
    id: 'nemrut',
    name: 'Nemrut Dağı Yolu',
    region: 'Adıyaman — Kahta',
    description: 'Çıplak dağ yamaçları, keskin virajlar ve zirvede gün doğumunu bekleyen dev heykeller.',
    defaultTime: 'dawn',
    defaultWeather: 'clear',
    times: ['dawn', 'day', 'sunset'],
    weathers: ['clear', 'cloudy'],
    unlockLevel: 46,
    baseEnv: 'sunset',
    color: '#a86f4a',
  },
  {
    id: 'toros',
    name: 'Toros Dağları Geçidi',
    region: 'Mersin — Pozantı',
    description: 'Kayalık kanyonlar, yüksek viyadükler ve dağın içinden kıvrılan otoyol.',
    defaultTime: 'day',
    defaultWeather: 'clear',
    times: ['dawn', 'day', 'sunset', 'night'],
    weathers: ['clear', 'cloudy', 'rain', 'fog'],
    unlockLevel: 48,
    baseEnv: 'day',
    color: '#8c7a5b',
  },
  {
    id: 'kars',
    name: 'Kars Kış Yolu',
    region: 'Kars — Sarıkamış',
    description: 'Karla örtülü ovalar, Baltık mimarisi taş binalar, çam ormanları ve dondurucu ayaz.',
    defaultTime: 'day',
    defaultWeather: 'snow',
    times: ['dawn', 'day', 'sunset', 'night'],
    weathers: ['clear', 'cloudy', 'snow', 'fog'],
    unlockLevel: 50,
    baseEnv: 'day',
    color: '#cfd8e3',
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
  kapadokya: { wind: 0.3, heat: 0.5, mist: 0.2 },
  bodrum: { wind: 0.6, heat: 0.4, mist: 0 },
  thrace: { wind: 0.55, heat: 0.4, mist: 0.1 },
  ankara: { wind: 0.4, heat: 0.2, mist: 0 },
  pamukkale: { wind: 0.3, heat: 0.6, mist: 0.15 },
  kordon: { wind: 0.6, heat: 0.3, mist: 0.05 },
  bosphorus: { wind: 0.7, heat: 0, mist: 0.2 },
  safranbolu: { wind: 0.3, heat: 0.1, mist: 0.3 },
  mardin: { wind: 0.35, heat: 0.9, mist: 0 },
  blacksea: { wind: 0.7, heat: 0, mist: 0.6 },
  uludag: { wind: 0.5, heat: 0, mist: 0.5 },
  saltlake: { wind: 0.45, heat: 1, mist: 0 },
  van: { wind: 0.8, heat: 0.1, mist: 0.1 },
  nemrut: { wind: 0.7, heat: 0.4, mist: 0.1 },
  toros: { wind: 0.5, heat: 0.3, mist: 0.2 },
  kars: { wind: 0.7, heat: 0, mist: 0.3 },
};

const TIME_TEMPLATE: Record<TimeOfDay, EnvId> = { dawn: 'sunset', day: 'day', sunset: 'sunset', night: 'night' };

/**
 * Maps that borrow an older map's terrain/scenery tweaks below until they get their own
 * (each map's builder lives in src/render/world/maps/<id>.ts).
 */
const LOOK_TEMPLATE: Partial<Record<MapId, MapId>> = {
  kapadokya: 'desert',
  bodrum: 'coast',
  thrace: 'highway',
  ankara: 'city',
  pamukkale: 'highway',
  kordon: 'coast',
  bosphorus: 'city',
  safranbolu: 'suburb',
  mardin: 'desert',
  blacksea: 'coast',
  uludag: 'forest',
  saltlake: 'desert',
  van: 'coast',
  nemrut: 'desert',
  toros: 'highway',
  kars: 'snow',
};

/**
 * Combine a map's scenery with a time of day and weather into one environment.
 * Lighting comes from the time-of-day template, scenery from the map template,
 * and weather adjusts grip, fog, clouds and precipitation.
 */
export function resolveEnvironment(mapId: MapId, time: TimeOfDay, weather: Weather): EnvDef {
  const map = MAP_BY_ID.get(mapId) ?? MAPS[0];
  const look = LOOK_TEMPLATE[map.id] ?? map.id;
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
    world: { map: map.id, ...WORLD_BASE[map.id], snow: look === 'snow' ? 1 : 0 },
  };
  if (time === 'dawn') {
    env.sky = { ...env.sky, sunElevation: 4, sunAzimuth: -60, zenith: '#3b4f7a', horizon: '#f2b27a' };
    env.exposure = 1.05;
  }
  if (look === 'forest') {
    env.terrain = 'grass';
    // Dark moss floor under the canopy: let the vertex colours darken the photograph strongly.
    env.world = { ...env.world, groundMix: 0.95 };
  }
  if (look === 'desert') env.world = { ...env.world, groundMix: 0.85 };
  if (look === 'snow') {
    env.terrain = 'grass';
    env.mountains = { near: '#d7e1ea', far: '#eef3f8', height: 1.6 };
    env.scenery = { ...env.scenery, trees: 'pine', treeDensity: 0.8 };
    env.grip = 0.9;
  }
  if (look === 'city' || look === 'industrial') {
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
      env.fog = { ...env.fog, color: snowFog(time, light.fog.color), near: 40, far: 520 };
      env.headlights = true;
      break;
  }
  return env;
}

/** Falling snow turns the fog pale grey by day; at dusk it keeps part of the sky's colour and at night it stays dark. */
function snowFog(time: TimeOfDay, timeFog: string): string {
  const pale = '#d9e2ea';
  switch (time) {
    case 'night':
      return '#232d3d';
    case 'day':
      return pale;
    default:
      return mixHex(pale, timeFog, 0.45);
  }
}

function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  let out = 0;
  for (const shift of [16, 8, 0]) {
    const ca = (pa >> shift) & 255;
    const cb = (pb >> shift) & 255;
    out |= Math.round(ca + (cb - ca) * t) << shift;
  }
  return `#${out.toString(16).padStart(6, '0')}`;
}
