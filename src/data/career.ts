import type { RoadLayout } from '../world/road';
import { MAPS, type MapId, type TimeOfDay, type Weather } from './maps';
import { CAREER_MODE, type ModeDef } from './modes';
import { CAREER_BIKE_REWARDS } from './progression';

/**
 * Career: 10 missions on each of the 8 maps (MAPS order is the career order),
 * Traffic Rider style. Every mission fixes the map, time of day, weather, road
 * layout and traffic, and asks for one objective (plus an optional bonus goal).
 * Completing it earns 1 star; better performance on the mission's star metric
 * earns 2 or 3 stars. Crashing always fails a mission.
 */

export type TrafficLevel = 'light' | 'normal' | 'heavy' | 'extreme';

export const TRAFFIC_LEVELS: Record<TrafficLevel, { label: string; baseDensity: number; densityGrowth: number; maxDensity: number }> = {
  light: { label: 'Seyrek', baseDensity: 16, densityGrowth: 1.5, maxDensity: 26 },
  normal: { label: 'Normal', baseDensity: 28, densityGrowth: 4, maxDensity: 46 },
  heavy: { label: 'Yoğun', baseDensity: 38, densityGrowth: 5, maxDensity: 58 },
  extreme: { label: 'Çok yoğun', baseDensity: 48, densityGrowth: 6, maxDensity: 70 },
};

export type Objective =
  /** Ride `meters` (use `limit.time` for "within T seconds"). */
  | { type: 'distance'; meters: number }
  /** Reach `count` checkpoints `spacing` m apart; the clock starts at `startTime` and each checkpoint adds `bonusTime`. */
  | { type: 'checkpoints'; count: number; spacing: number; startTime: number; bonusTime: number }
  /** Overtake `count` vehicles travelling in the rider's direction. */
  | { type: 'overtakes'; count: number }
  /** Pass `count` vehicles closer than the near-miss clearance above 100 km/h. */
  | { type: 'nearMisses'; count: number }
  /** Ride `meters` in the oncoming lanes (two-way roads only). */
  | { type: 'oppositeLane'; meters: number }
  /** Reach `kmh` within `startWindow` s, then cover `meters` without dropping below it. */
  | { type: 'keepSpeed'; kmh: number; meters: number; startWindow: number }
  /** Reach a top speed of `kmh`. */
  | { type: 'topSpeed'; kmh: number }
  /** Wheelie `meters` in total, or in one go when `single`. */
  | { type: 'wheelie'; meters: number; single: boolean }
  /** Collect `points` before `limit.distance` runs out. */
  | { type: 'score'; points: number }
  /** Stay alive for `seconds`; only time spent at `minKmh` or faster counts. */
  | { type: 'survive'; seconds: number; minKmh: number }
  /** Reach a near-miss combo of `combo`. */
  | { type: 'combo'; combo: number };

export type ObjectiveType = Objective['type'];

export const OBJECTIVE_TYPES: readonly ObjectiveType[] = [
  'distance',
  'checkpoints',
  'overtakes',
  'nearMisses',
  'oppositeLane',
  'keepSpeed',
  'topSpeed',
  'wheelie',
  'score',
  'survive',
  'combo',
];

/** What the 2nd and 3rd star measure at the moment the objective is completed. */
export type StarMetric = 'time' | 'distanceUsed' | 'timeLeft' | 'avgSpeed' | 'nearMisses' | 'overtakes' | 'score' | 'maxCombo' | 'topSpeed';

export const LOWER_IS_BETTER: Record<StarMetric, boolean> = {
  time: true,
  distanceUsed: true,
  timeLeft: false,
  avgSpeed: false,
  nearMisses: false,
  overtakes: false,
  score: false,
  maxCombo: false,
  topSpeed: false,
};

export interface StarRule {
  metric: StarMetric;
  /** Threshold for 2 stars. */
  two: number;
  /** Threshold for 3 stars (stricter than `two`). */
  three: number;
}

export type SecondaryKind = 'nearMisses' | 'overtakes' | 'topSpeed' | 'oppositeLane' | 'wheelie' | 'combo';

export interface SecondaryObjective {
  kind: SecondaryKind;
  target: number;
}

export interface MissionRewards {
  /** Paid every time the mission is completed. */
  cash: number;
  xp: number;
  /** Paid once, on the first completion. */
  firstClearBonus: number;
  /** Paid when the secondary (bonus) objective is met as well. */
  secondaryCash: number;
  /** Bike that becomes purchasable regardless of rider level. */
  unlockBike?: string;
}

export interface MissionDef {
  /** `${map}-${index}` e.g. "suburb-01". */
  id: string;
  /** 1..80 across the whole career. */
  number: number;
  /** 1..10 within the map. */
  index: number;
  map: MapId;
  title: string;
  briefing: string;
  hint: string;
  time: TimeOfDay;
  weather: Weather;
  layout: RoadLayout;
  traffic: { level: TrafficLevel; aggression: number };
  objective: Objective;
  /** Fail when the run exceeds these before the objective is met. */
  limit: { time?: number; distance?: number };
  secondary?: SecondaryObjective;
  stars: StarRule;
  rewards: MissionRewards;
  /** The selected bike's published top speed must reach this (km/h). */
  minTopSpeed: number;
}

// ───────────────────────────── requirement model ─────────────────────────────

/** Share of a bike's top speed a competent rider averages through traffic. */
export const AVG_SHARE = 0.62;
/** Share of a bike's top speed that is a realistic peak-speed target in traffic. */
export const TOP_SHARE = 0.88;
/** Share of a bike's top speed that can be held continuously through traffic. */
export const KEEP_SHARE = 0.7;
/** Minimum for every career mission: rules out the 115-128 km/h city bikes. */
export const CAREER_MIN_TOP_SPEED = 160;
/** Requirement steps, aligned with the catalogue's published top speeds. */
const TOP_SPEED_TIERS = [160, 170, 180, 190, 200, 210, 220, 230, 240, 250, 260, 270, 280, 290, 299, 305, 330, 400];

/** Average speed (km/h) a checkpoint objective needs: the worst of all "arrive at checkpoint k" constraints. */
export function checkpointRequiredAvgKmh(o: Extract<Objective, { type: 'checkpoints' }>): number {
  let worst = 0;
  for (let k = 1; k <= o.count; k++) worst = Math.max(worst, (k * o.spacing) / (o.startTime + (k - 1) * o.bonusTime));
  return worst * 3.6;
}

/**
 * Score per metre ridden at an average speed (the continuous rate is (v - 40) * 0.6 per second,
 * see ScoreKeeper) plus what near misses, overtakes and wheelies add on top.
 */
export const SCORE_BONUS_PER_M = 0.25;
export function scorePerMetre(avgKmh: number): number {
  const v = Math.max(avgKmh, 40.001);
  return 2.16 * (1 - 40 / v) + SCORE_BONUS_PER_M;
}

/** Average speed (km/h) a score-in-distance objective needs (Infinity when no speed can reach it). */
export function scoreRequiredAvgKmh(points: number, distance: number): number {
  const share = (points / distance - SCORE_BONUS_PER_M) / 2.16;
  return share >= 1 ? Infinity : share <= 0 ? 0 : 40 / (1 - share);
}

/** Average speed (km/h) the objective + limits require, 0 when it does not depend on pace. */
export function requiredAvgKmh(obj: Objective, limit: MissionDef['limit']): number {
  if (obj.type === 'checkpoints') return checkpointRequiredAvgKmh(obj);
  if (obj.type === 'distance' && limit.time) return (obj.meters / limit.time) * 3.6;
  if (obj.type === 'keepSpeed') return obj.kmh;
  if (obj.type === 'score' && limit.distance) return scoreRequiredAvgKmh(obj.points, limit.distance);
  return 0;
}

/** Published top speed a bike needs for this objective (rounded up to a catalogue tier). */
export function requiredTopSpeed(obj: Objective, limit: MissionDef['limit'], secondary?: SecondaryObjective): number {
  let need = CAREER_MIN_TOP_SPEED;
  if (obj.type === 'distance' || obj.type === 'checkpoints' || obj.type === 'score') need = Math.max(need, requiredAvgKmh(obj, limit) / AVG_SHARE);
  if (obj.type === 'topSpeed') need = Math.max(need, obj.kmh / TOP_SHARE);
  if (obj.type === 'keepSpeed') need = Math.max(need, obj.kmh / KEEP_SHARE);
  if (obj.type === 'survive') need = Math.max(need, obj.minKmh / KEEP_SHARE);
  if (secondary?.kind === 'topSpeed') need = Math.max(need, secondary.target / TOP_SHARE);
  for (const t of TOP_SPEED_TIERS) if (t >= need - 1e-6) return t;
  return TOP_SPEED_TIERS[TOP_SPEED_TIERS.length - 1];
}

// ───────────────────────────── mission table ─────────────────────────────

interface Spec {
  title: string;
  brief: string;
  time: TimeOfDay;
  weather: Weather;
  twoway?: boolean;
  traffic: TrafficLevel;
  aggr: number;
  obj: Objective;
  limit?: MissionDef['limit'];
  stars: [StarMetric, number, number];
  sec?: [SecondaryKind, number];
  /** Hand-tuned reward multiplier (harder mission types pay a bit more). */
  pay?: number;
}

const dist = (meters: number): Objective => ({ type: 'distance', meters });
const cps = (count: number, spacing: number, startTime: number, bonusTime: number): Objective => ({ type: 'checkpoints', count, spacing, startTime, bonusTime });
const ovt = (count: number): Objective => ({ type: 'overtakes', count });
const near = (count: number): Objective => ({ type: 'nearMisses', count });
const opp = (meters: number): Objective => ({ type: 'oppositeLane', meters });
const keep = (kmh: number, meters: number, startWindow = 20): Objective => ({ type: 'keepSpeed', kmh, meters, startWindow });
const top = (kmh: number): Objective => ({ type: 'topSpeed', kmh });
const whl = (meters: number, single = false): Objective => ({ type: 'wheelie', meters, single });
const pts = (points: number): Objective => ({ type: 'score', points });
const live = (seconds: number, minKmh: number): Objective => ({ type: 'survive', seconds, minKmh });
const combo = (n: number): Objective => ({ type: 'combo', combo: n });

const CAREER_SPECS: Record<MapId, Spec[]> = {
  suburb: [
    { title: 'İlk Sürüş', brief: 'Banliyöde ilk turun. Motoru tanı, trafiğe alış ve 1,5 km yol kat et.', time: 'day', weather: 'clear', traffic: 'light', aggr: 0.25, obj: dist(1500), stars: ['avgSpeed', 90, 130] },
    { title: 'Mahalle Sollaması', brief: 'Pazar sabahı keyifle giden komşuları geride bırak: 10 aracı solla.', time: 'day', weather: 'cloudy', traffic: 'light', aggr: 0.25, obj: ovt(10), stars: ['time', 85, 60] },
    { title: 'Akşam Servisi', brief: 'Pizza soğumadan teslim edilmeli: 3 km yolu 2:30 içinde bitir.', time: 'sunset', weather: 'clear', traffic: 'normal', aggr: 0.3, obj: dist(3000), limit: { time: 150 }, stars: ['time', 115, 80] },
    { title: 'İlk Kontrol Noktaları', brief: 'Her kontrol noktası ek süre kazandırır. 3 noktayı süre bitmeden geç.', time: 'day', weather: 'clear', traffic: 'normal', aggr: 0.3, obj: cps(3, 1200, 50, 45), stars: ['timeLeft', 28, 38] },
    { title: 'Kıl Payı Dersi', brief: '100 km/s üstünde araçların yanından çok yakın geç: 3 kıl payı yap.', time: 'day', weather: 'clear', traffic: 'normal', aggr: 0.3, obj: near(3), stars: ['time', 75, 55], sec: ['overtakes', 8], pay: 1.1 },
    { title: 'Karşı Şeride Merhaba', brief: 'Çift yönlü yolda karşı şeritte 300 m sür. Karşıdan gelenlere dikkat!', time: 'day', weather: 'clear', twoway: true, traffic: 'light', aggr: 0.25, obj: opp(300), stars: ['time', 45, 30] },
    { title: 'Yağmur Başladı', brief: 'Islak asfaltta frenler uzar, yol tutuş azalır. 3 km yolu 2:40 içinde tamamla.', time: 'day', weather: 'rain', traffic: 'normal', aggr: 0.3, obj: dist(3000), limit: { time: 160 }, stars: ['time', 115, 80] },
    { title: 'Tek Teker Merakı', brief: 'Wheelie tuşuyla ön tekeri kaldır ve toplam 100 m arka teker üstünde git.', time: 'day', weather: 'clear', traffic: 'light', aggr: 0.25, obj: whl(100), stars: ['time', 14, 9] },
    { title: 'Gece Devriyesi', brief: 'Sokak lambaları altında 60 saniye boyunca 60 km/s üstünde kazasız sür.', time: 'night', weather: 'clear', traffic: 'normal', aggr: 0.35, obj: live(60, 60), stars: ['avgSpeed', 95, 130] },
    { title: 'Banliyö Finali', brief: 'Mahallenin en hızlısı olduğunu kanıtla: 4 km içinde 4.500 puan topla.', time: 'sunset', weather: 'clear', traffic: 'normal', aggr: 0.35, obj: pts(4500), limit: { distance: 4000 }, stars: ['distanceUsed', 3200, 2700] },
  ],
  highway: [
    { title: 'Otoyola Hoş Geldin', brief: 'Zeytinlikler arasından geçen geniş otoyolda 4 km yolu 2:50 içinde bitir.', time: 'day', weather: 'clear', traffic: 'normal', aggr: 0.35, obj: dist(4000), limit: { time: 170 }, stars: ['time', 155, 110] },
    { title: 'Sollama Ustası', brief: 'Kamyonlar, otobüsler, aile arabaları… 2:30 içinde 25 aracı solla.', time: 'day', weather: 'clear', traffic: 'normal', aggr: 0.4, obj: ovt(25), limit: { time: 150 }, stars: ['time', 110, 75] },
    { title: 'Sınırları Zorla', brief: 'Boş otoyolda gazı sonuna kadar aç ve 155 km/s hıza ulaş.', time: 'day', weather: 'clear', traffic: 'light', aggr: 0.25, obj: top(155), stars: ['time', 37, 23] },
    { title: 'Sabah Sisi', brief: 'Görüş mesafesi kısa. 4 kontrol noktasını süre bitmeden geç.', time: 'dawn', weather: 'fog', traffic: 'normal', aggr: 0.35, obj: cps(4, 1500, 55, 50), stars: ['timeLeft', 25, 35] },
    { title: 'Kombo Zamanı', brief: 'Kıl payı geçişleri arka arkaya bağla ve x3 komboya ulaş.', time: 'day', weather: 'cloudy', traffic: 'normal', aggr: 0.4, obj: combo(3), stars: ['time', 200, 90], pay: 1.1 },
    { title: 'Gece Ekspresi', brief: '20 saniye içinde 100 km/s hıza çık ve 1,5 km boyunca altına düşme.', time: 'night', weather: 'clear', traffic: 'normal', aggr: 0.35, obj: keep(100, 1500), stars: ['time', 65, 45], pay: 1.1 },
    { title: 'Karşıdan Gelenler', brief: 'Çift yönlü yolda 2 dakika içinde karşı şeritte 500 m sür.', time: 'sunset', weather: 'clear', twoway: true, traffic: 'light', aggr: 0.3, obj: opp(500), limit: { time: 120 }, stars: ['time', 55, 35] },
    { title: 'Fırtına Öncesi', brief: 'Bulutlar toplanıyor. 5 km yolu 3:20 içinde bitir; bonus için 5 kıl payı yap.', time: 'day', weather: 'cloudy', traffic: 'normal', aggr: 0.4, obj: dist(5000), limit: { time: 200 }, stars: ['time', 185, 140], sec: ['nearMisses', 5] },
    { title: 'Wheelie Gösterisi', brief: 'Seyirciler toplandı: tek seferde 120 m wheelie yap.', time: 'day', weather: 'clear', traffic: 'light', aggr: 0.3, obj: whl(120, true), stars: ['time', 16, 10] },
    { title: 'Ege Finali', brief: 'Yoğun akşam trafiğinde 3 dakika içinde 8 kıl payı geçiş yap.', time: 'sunset', weather: 'clear', traffic: 'heavy', aggr: 0.45, obj: near(8), limit: { time: 180 }, stars: ['time', 110, 95] },
  ],
  desert: [
    { title: 'Sıcak Rüzgar', brief: 'Konya ovasının dümdüz yolunda 5 km yolu 3:10 içinde bitir.', time: 'day', weather: 'clear', traffic: 'normal', aggr: 0.35, obj: dist(5000), limit: { time: 190 }, stars: ['time', 175, 140] },
    { title: 'Çöl Sürati', brief: 'Gün batarken ufka doğru 185 km/s hıza ulaş.', time: 'sunset', weather: 'clear', traffic: 'light', aggr: 0.25, obj: top(185), stars: ['time', 24, 15] },
    { title: 'Serap Sollaması', brief: 'Sıcak hava dalgalanırken 2:40 içinde 30 aracı solla.', time: 'day', weather: 'clear', traffic: 'heavy', aggr: 0.45, obj: ovt(30), limit: { time: 160 }, stars: ['time', 115, 80] },
    { title: 'Gün Batımı Rotası', brief: '5 kontrol noktasını süre bitmeden geç; güneş batmadan varmalısın.', time: 'sunset', weather: 'clear', traffic: 'normal', aggr: 0.4, obj: cps(5, 1800, 65, 60), stars: ['timeLeft', 34, 48] },
    { title: 'Çöl Gecesi', brief: 'Yıldızların altında yoğun trafikte 90 saniye 80 km/s üstünde kal.', time: 'night', weather: 'clear', traffic: 'heavy', aggr: 0.45, obj: live(90, 80), stars: ['avgSpeed', 85, 120] },
    { title: 'Tek Şerit Cesareti', brief: '2:30 içinde karşı şeritte 700 m sür.', time: 'day', weather: 'cloudy', twoway: true, traffic: 'light', aggr: 0.35, obj: opp(700), limit: { time: 150 }, stars: ['time', 75, 55] },
    { title: 'Kum Tepesi Wheelie', brief: 'Şafak sökerken 2 dakika içinde toplam 400 m wheelie yap.', time: 'dawn', weather: 'clear', traffic: 'light', aggr: 0.3, obj: whl(400), limit: { time: 120 }, stars: ['time', 21, 15] },
    { title: 'Sıcak Asfalt', brief: '105 km/s hıza çık ve 2 km boyunca altına düşme.', time: 'day', weather: 'clear', traffic: 'light', aggr: 0.3, obj: keep(105, 2000), stars: ['time', 80, 55], pay: 1.1 },
    { title: 'Kervan Kombosu', brief: 'Kamyon kervanlarının arasından geç ve x3 komboya ulaş.', time: 'sunset', weather: 'clear', traffic: 'heavy', aggr: 0.45, obj: combo(3), stars: ['time', 200, 90], pay: 1.1 },
    { title: 'Çöl Finali', brief: 'Bulutlu şafakta yoğun trafikte 5 km içinde 7.000 puan topla.', time: 'dawn', weather: 'cloudy', traffic: 'heavy', aggr: 0.45, obj: pts(7000), limit: { distance: 5000 }, stars: ['distanceUsed', 4800, 4300] },
  ],
  city: [
    { title: 'Neon Işıklar', brief: 'E-5’in neonları altında yoğun trafikte 5 km yolu 3:20 içinde bitir.', time: 'night', weather: 'clear', traffic: 'heavy', aggr: 0.45, obj: dist(5000), limit: { time: 200 }, stars: ['time', 185, 155] },
    { title: 'E-5 Trafiği', brief: 'Mesai çıkışı. 3 dakika içinde 40 aracı solla.', time: 'night', weather: 'clear', traffic: 'heavy', aggr: 0.55, obj: ovt(40), limit: { time: 180 }, stars: ['time', 135, 95] },
    { title: 'Şehir Işıkları Arasında', brief: '3:20 içinde 10 kıl payı geçiş yap; bonus için 30 araç solla.', time: 'night', weather: 'cloudy', traffic: 'heavy', aggr: 0.5, obj: near(10), limit: { time: 200 }, stars: ['time', 135, 120], sec: ['overtakes', 30] },
    { title: 'Yağmurlu Gece', brief: 'Islak asfaltta neonlar yansıyor. 5 kontrol noktasını süre bitmeden geç.', time: 'night', weather: 'rain', traffic: 'heavy', aggr: 0.45, obj: cps(5, 1400, 55, 52), stars: ['timeLeft', 34, 47] },
    { title: 'Boğaz Köprüsü', brief: 'Köprü yolunda 205 km/s hıza ulaş.', time: 'sunset', weather: 'clear', traffic: 'light', aggr: 0.3, obj: top(205), stars: ['time', 25, 15] },
    { title: 'Ters Akış', brief: 'Gece çift yönlü yolda 2:30 içinde karşı şeritte 800 m sür.', time: 'night', weather: 'clear', twoway: true, traffic: 'light', aggr: 0.35, obj: opp(800), limit: { time: 150 }, stars: ['time', 70, 55] },
    { title: 'Sisli Sabah', brief: 'Sisli şehirde 2 dakika boyunca 80 km/s üstünde kazasız kal.', time: 'day', weather: 'fog', traffic: 'heavy', aggr: 0.5, obj: live(120, 80), stars: ['avgSpeed', 85, 120] },
    { title: 'Şehir Kombosu', brief: 'Sıkışık trafikte x3 komboya ulaş.', time: 'night', weather: 'clear', traffic: 'heavy', aggr: 0.5, obj: combo(3), stars: ['time', 200, 90], pay: 1.1 },
    { title: 'Gece Wheelie', brief: 'Gece yarısı gösterisi: tek seferde 200 m wheelie yap.', time: 'night', weather: 'clear', traffic: 'normal', aggr: 0.4, obj: whl(200, true), stars: ['time', 21, 13] },
    { title: 'İstanbul Finali', brief: '110 km/s hıza çık ve 2,5 km boyunca altına düşme.', time: 'night', weather: 'cloudy', traffic: 'light', aggr: 0.3, obj: keep(110, 2500), stars: ['time', 100, 70], pay: 1.1 },
  ],
  coast: [
    { title: 'Turkuaz Yol', brief: 'Deniz manzarasına dalmadan 6 km yolu 3:30 içinde bitir.', time: 'day', weather: 'clear', traffic: 'normal', aggr: 0.4, obj: dist(6000), limit: { time: 210 }, stars: ['time', 195, 170] },
    { title: 'Viraj Sollaması', brief: 'Sahil virajlarında 3:20 içinde 45 aracı solla.', time: 'sunset', weather: 'clear', traffic: 'heavy', aggr: 0.5, obj: ovt(45), limit: { time: 200 }, stars: ['time', 160, 110] },
    { title: 'Sahil Sürati', brief: 'Boş sahil yolunda 215 km/s hıza ulaş.', time: 'day', weather: 'clear', traffic: 'light', aggr: 0.3, obj: top(215), stars: ['time', 23, 14] },
    { title: 'Deniz Feneri', brief: 'Şafakta 6 kontrol noktasını süre bitmeden geç.', time: 'dawn', weather: 'clear', traffic: 'normal', aggr: 0.4, obj: cps(6, 1800, 60, 60), stars: ['timeLeft', 36, 50] },
    { title: 'Gece Sahili', brief: 'Gece yoğun trafikte 4 dakika içinde 11 kıl payı geçiş yap.', time: 'night', weather: 'clear', traffic: 'heavy', aggr: 0.5, obj: near(11), limit: { time: 240 }, stars: ['time', 155, 120] },
    { title: 'Çift Yönlü Sahil', brief: '3 dakika içinde karşı şeritte 900 m sür.', time: 'day', weather: 'cloudy', twoway: true, traffic: 'light', aggr: 0.35, obj: opp(900), limit: { time: 180 }, stars: ['time', 85, 60] },
    { title: 'Yağmurda Denge', brief: 'Sağanak altında 2 dakika boyunca 90 km/s üstünde kazasız kal.', time: 'day', weather: 'rain', traffic: 'heavy', aggr: 0.5, obj: live(120, 90), stars: ['avgSpeed', 85, 115] },
    { title: 'Kaş Wheelie', brief: 'Gün batımında 2:30 içinde toplam 600 m wheelie yap.', time: 'sunset', weather: 'clear', traffic: 'light', aggr: 0.35, obj: whl(600), limit: { time: 150 }, stars: ['time', 100, 70] },
    { title: 'Dalga Kombosu', brief: 'Kıl payları dalga dalga bağla: x3 komboya ulaş.', time: 'day', weather: 'clear', traffic: 'heavy', aggr: 0.55, obj: combo(3), stars: ['time', 200, 90], pay: 1.1 },
    { title: 'Sahil Finali', brief: 'Çift yönlü sahil yolunda 6 km içinde 7.000 puan topla. Karşı şerit puanı ikiye katlar!', time: 'sunset', weather: 'cloudy', twoway: true, traffic: 'normal', aggr: 0.45, obj: pts(7000), limit: { distance: 6000 }, stars: ['distanceUsed', 5750, 4900] },
  ],
  forest: [
    { title: 'Islak Asfalt', brief: 'Karadeniz yağmuru dinmiyor. 6 km yolu 3:40 içinde bitir.', time: 'day', weather: 'rain', traffic: 'normal', aggr: 0.4, obj: dist(6000), limit: { time: 220 }, stars: ['time', 200, 175] },
    { title: 'Orman Sisi', brief: 'Sisin içinden 6 kontrol noktasını süre bitmeden geç.', time: 'dawn', weather: 'fog', traffic: 'normal', aggr: 0.4, obj: cps(6, 2000, 66, 66), stars: ['timeLeft', 36, 50] },
    { title: 'Çam Yolu Sollaması', brief: 'Tomruk kamyonlarının arasından 3:40 içinde 50 aracı solla.', time: 'day', weather: 'cloudy', traffic: 'heavy', aggr: 0.5, obj: ovt(50), limit: { time: 220 }, stars: ['time', 170, 115] },
    { title: 'Ayder Sürati', brief: 'Yayla yolunun düzlüğünde 225 km/s hıza ulaş.', time: 'day', weather: 'clear', traffic: 'light', aggr: 0.3, obj: top(225), stars: ['time', 28, 17] },
    { title: 'Gece Ormanı', brief: 'Yağmurlu gecede 2:30 boyunca 90 km/s üstünde kazasız kal.', time: 'night', weather: 'rain', traffic: 'heavy', aggr: 0.5, obj: live(150, 90), stars: ['avgSpeed', 85, 115] },
    { title: 'Kıl Payı Yağmuru', brief: 'Islak yolda 4 dakika içinde 15 kıl payı geçiş yap.', time: 'sunset', weather: 'rain', traffic: 'heavy', aggr: 0.5, obj: near(15), limit: { time: 240 }, stars: ['time', 220, 170] },
    { title: 'Orman İçi Ters Yön', brief: '3:20 içinde karşı şeritte 1 km sür.', time: 'day', weather: 'cloudy', twoway: true, traffic: 'light', aggr: 0.35, obj: opp(1000), limit: { time: 200 }, stars: ['time', 90, 65] },
    { title: 'Sisli Hız', brief: 'Sis içinde 115 km/s hıza çık ve 3 km boyunca altına düşme.', time: 'day', weather: 'fog', traffic: 'light', aggr: 0.3, obj: keep(115, 3000, 22), stars: ['time', 110, 75], pay: 1.1 },
    { title: 'Orman Kombosu', brief: 'Yoğun trafikte x3 komboya ulaş.', time: 'day', weather: 'clear', traffic: 'heavy', aggr: 0.55, obj: combo(3), stars: ['time', 200, 90], pay: 1.1 },
    { title: 'Karadeniz Finali', brief: 'Yağmurlu gecede 10 km yolu 5:40 içinde bitir; bonus için 10 kıl payı yap.', time: 'night', weather: 'rain', traffic: 'normal', aggr: 0.5, obj: dist(10000), limit: { time: 340 }, stars: ['time', 315, 280], sec: ['nearMisses', 12] },
  ],
  snow: [
    { title: 'Beyaz Yol', brief: 'Kar yağıyor, yol tutuş zayıf. 7 km yolu 4:10 içinde bitir.', time: 'day', weather: 'snow', traffic: 'normal', aggr: 0.4, obj: dist(7000), limit: { time: 250 }, stars: ['time', 230, 195] },
    { title: 'Buzlu Kontroller', brief: 'Şafakta karlı geçitte 7 kontrol noktasını süre bitmeden geç.', time: 'dawn', weather: 'snow', traffic: 'normal', aggr: 0.45, obj: cps(7, 2000, 66, 68), stars: ['timeLeft', 52, 72] },
    { title: 'Palandöken Sollaması', brief: 'Kayak tatilcilerinin arasından 4 dakika içinde 55 aracı solla.', time: 'day', weather: 'clear', traffic: 'heavy', aggr: 0.55, obj: ovt(55), limit: { time: 240 }, stars: ['time', 195, 135] },
    { title: 'Zirve Sürati', brief: 'Berrak dağ havasında 245 km/s hıza ulaş.', time: 'day', weather: 'clear', traffic: 'light', aggr: 0.3, obj: top(245), stars: ['time', 30, 18] },
    { title: 'Kar Fırtınası', brief: 'Tipi altında 3 dakika boyunca 100 km/s üstünde kazasız kal.', time: 'night', weather: 'snow', traffic: 'heavy', aggr: 0.5, obj: live(180, 100), stars: ['avgSpeed', 85, 115] },
    { title: 'Soğuk Kıl Payları', brief: '4:30 içinde 14 kıl payı geçiş yap.', time: 'day', weather: 'cloudy', traffic: 'normal', aggr: 0.45, obj: near(14), limit: { time: 270 }, stars: ['time', 245, 170] },
    { title: 'Dağ Yolu Ters Yön', brief: 'Karlı çift yönlü yolda 3:40 içinde karşı şeritte 1,2 km sür.', time: 'day', weather: 'snow', twoway: true, traffic: 'light', aggr: 0.35, obj: opp(1200), limit: { time: 220 }, stars: ['time', 80, 60] },
    { title: 'Buzda Wheelie', brief: '3:20 içinde toplam 1 km wheelie yap.', time: 'sunset', weather: 'clear', traffic: 'light', aggr: 0.35, obj: whl(1000), limit: { time: 200 }, stars: ['time', 170, 115] },
    { title: 'Kar Kombosu', brief: 'Sisli dağ yolunda x3 komboya ulaş.', time: 'day', weather: 'fog', traffic: 'heavy', aggr: 0.55, obj: combo(3), stars: ['time', 200, 90], pay: 1.15 },
    { title: 'Dağ Finali', brief: '110 km/s hıza çık ve 3 km boyunca altına düşme.', time: 'night', weather: 'clear', traffic: 'light', aggr: 0.3, obj: keep(110, 3000, 25), stars: ['time', 120, 80], pay: 1.1 },
  ],
  industrial: [
    { title: 'Fabrika Vardiyası', brief: 'Vardiya değişiminden önce 8 km yolu 4:30 içinde bitir.', time: 'sunset', weather: 'cloudy', traffic: 'normal', aggr: 0.45, obj: dist(8000), limit: { time: 270 }, stars: ['time', 250, 225] },
    { title: 'Liman Koşusu', brief: 'Liman vinçlerinin altından 8 kontrol noktasını süre bitmeden geç.', time: 'night', weather: 'clear', traffic: 'normal', aggr: 0.45, obj: cps(8, 2200, 75, 72), stars: ['timeLeft', 50, 70] },
    { title: 'D-100 Sollaması', brief: 'Tır konvoylarının arasından 4:20 içinde 65 aracı solla.', time: 'day', weather: 'clear', traffic: 'heavy', aggr: 0.6, obj: ovt(65), limit: { time: 260 }, stars: ['time', 215, 150] },
    { title: 'Tünel Sürati', brief: 'Aydınlatmalı uzun düzlükte 262 km/s hıza ulaş.', time: 'night', weather: 'clear', traffic: 'light', aggr: 0.3, obj: top(262), stars: ['time', 25, 16] },
    { title: 'Gece Vardiyası', brief: 'Yağmurlu gecede yoğun trafikte 3:20 boyunca 100 km/s üstünde kal.', time: 'night', weather: 'rain', traffic: 'heavy', aggr: 0.5, obj: live(200, 100), stars: ['avgSpeed', 85, 110], pay: 1.1 },
    { title: 'Kıvılcım', brief: 'Gece 5 dakika içinde 16 kıl payı geçiş yap.', time: 'night', weather: 'clear', traffic: 'heavy', aggr: 0.55, obj: near(16), limit: { time: 300 }, stars: ['time', 275, 205] },
    { title: 'Ters Yön Ustası', brief: 'Çift yönlü sanayi yolunda 4 dakika içinde karşı şeritte 1,5 km sür.', time: 'sunset', weather: 'clear', twoway: true, traffic: 'light', aggr: 0.4, obj: opp(1500), limit: { time: 240 }, stars: ['time', 105, 75] },
    { title: 'Sanayi Kombosu', brief: 'Sis ve çok yoğun trafik: x3 komboya ulaş.', time: 'day', weather: 'fog', traffic: 'extreme', aggr: 0.5, obj: combo(3), stars: ['time', 200, 90], pay: 1.2 },
    { title: 'Sis Duvarı', brief: 'Sisli gecede çift yönlü yolda 9 km içinde 10.500 puan topla.', time: 'night', weather: 'fog', twoway: true, traffic: 'normal', aggr: 0.45, obj: pts(10500), limit: { distance: 9000 }, stars: ['distanceUsed', 8650, 7500] },
    { title: 'Büyük Final', brief: 'Kariyerin son sınavı: yağmurlu gecede 12 km yolu 6:40 içinde bitir. Bonus için 20 kıl payı!', time: 'night', weather: 'rain', traffic: 'normal', aggr: 0.5, obj: dist(12000), limit: { time: 400 }, stars: ['time', 370, 330], sec: ['nearMisses', 20], pay: 1.2 },
  ],
};

const HINTS: Record<ObjectiveType, string> = {
  distance: 'Boş şeritleri takip et; fren yapmak yerine şerit değiştirmek zaman kazandırır.',
  checkpoints: 'Her kontrol noktası süre ekler; ilk noktaya hızlı varmak sonrakiler için tampon yaratır.',
  overtakes: 'Yalnızca senin yönünde giden araçlar sayılır. Orta şeritlerde araçlar daha sık.',
  nearMisses: 'Kıl payı için 100 km/s üstünde aracın yanından 1 metreden yakın geç.',
  oppositeLane: 'Karşı şerit yalnızca çift yönlü yolda var. Uzaktan gelen farlara dikkat et.',
  keepSpeed: 'Hıza çıktıktan sonra frenden kaçın; boşluk görmeden araç arkasına girme.',
  topSpeed: 'Dümdüz ve boş bir şerit bul, rüzgar tünelinden (araç arkası) yararlan.',
  wheelie: 'Wheelie tuşunu basılı tut; 30 km/s üstünde ön teker havadayken sayılır.',
  score: 'Puan hızla artar: 100 km/s üstü, kıl payı ve karşı şerit en çok kazandırır.',
  survive: 'Sadece belirtilen hızın üstünde geçen süre sayılır. Acele etme, sağ kal.',
  combo: 'Kıl payları arasında 3 saniyeden fazla geçerse kombo sıfırlanır.',
};

const round50 = (x: number) => Math.max(50, Math.round(x / 50) * 50);
const round10 = (x: number) => Math.round(x / 10) * 10;

function buildMissions(): MissionDef[] {
  const out: MissionDef[] = [];
  MAPS.forEach((map, m) => {
    const specs = CAREER_SPECS[map.id];
    specs.forEach((sp, i) => {
      const final = i === specs.length - 1;
      const limit = sp.limit ?? {};
      const secondary = sp.sec ? { kind: sp.sec[0], target: sp.sec[1] } : undefined;
      const cash = round50((700 + 500 * m + 60 * i) * (sp.pay ?? 1) * (final ? 1.5 : 1));
      out.push({
        id: `${map.id}-${String(i + 1).padStart(2, '0')}`,
        number: m * 10 + i + 1,
        index: i + 1,
        map: map.id,
        title: sp.title,
        briefing: sp.brief,
        hint: HINTS[sp.obj.type],
        time: sp.time,
        weather: sp.weather,
        layout: sp.twoway ? 'twoway' : 'oneway',
        traffic: { level: sp.traffic, aggression: sp.aggr },
        objective: sp.obj,
        limit,
        secondary,
        stars: { metric: sp.stars[0], two: sp.stars[1], three: sp.stars[2] },
        rewards: {
          cash,
          xp: round10((120 + 60 * m + 12 * i) * (final ? 1.5 : 1)),
          firstClearBonus: round50(cash * 0.5),
          secondaryCash: secondary ? round50(cash * 0.3) : 0,
          unlockBike: final ? CAREER_BIKE_REWARDS[m] : undefined,
        },
        minTopSpeed: requiredTopSpeed(sp.obj, limit, secondary),
      });
    });
  });
  return out;
}

export const MISSIONS: readonly MissionDef[] = buildMissions();
export const MISSION_BY_ID: ReadonlyMap<string, MissionDef> = new Map(MISSIONS.map((d) => [d.id, d]));

export function missionsForMap(map: MapId): MissionDef[] {
  return MISSIONS.filter((d) => d.map === map);
}

/** The mission after `id` in career order (null after the last one). */
export function nextMissionId(id: string): string | null {
  const d = MISSION_BY_ID.get(id);
  if (!d) return null;
  return MISSIONS[d.number]?.id ?? null;
}

/** Mode definition used for a mission run: its layout and traffic, never respawning. */
export function missionMode(def: MissionDef): ModeDef {
  const t = TRAFFIC_LEVELS[def.traffic.level];
  return {
    ...CAREER_MODE,
    name: `Görev ${def.number}: ${def.title}`,
    description: def.briefing,
    layout: def.layout,
    traffic: { baseDensity: t.baseDensity, densityGrowth: t.densityGrowth, maxDensity: t.maxDensity, aggression: def.traffic.aggression, enabled: true },
  };
}
