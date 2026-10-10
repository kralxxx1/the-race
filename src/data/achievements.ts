/**
 * Achievements. Tiered families share a `group`; each tier is its own
 * achievement with a target on one metric (see src/game/achievements.ts for how
 * the metrics are measured). Rewards are paid once, when the tier unlocks.
 */

export type AchMetric =
  | 'distance'
  | 'nearMisses'
  | 'overtakes'
  | 'topSpeed'
  | 'wheelieDistance'
  | 'longestWheelie'
  | 'oppositeDistance'
  | 'missions'
  | 'stars'
  | 'mapsVisited'
  | 'bikesOwned'
  | 'nightDistance'
  | 'rainDistance'
  | 'snowDistance'
  | 'fogDistance'
  | 'maxCombo'
  | 'crashes'
  | 'rideTime'
  | 'runDistance'
  | 'dailyStreak'
  | 'level';

export interface AchievementDef {
  id: string;
  group: string;
  /** 1-based tier inside the group. */
  tier: number;
  title: string;
  description: string;
  metric: AchMetric;
  /** Value of `metric` that unlocks it (metres, km/h, seconds or counts). */
  target: number;
  reward: { cash: number; xp: number };
}

type Row = [id: string, title: string, description: string, metric: AchMetric, target: number, cash: number, xp: number];

const ROWS: Row[] = [
  ['dist-1', 'İlk Kilometreler', 'Toplam 10 km yol yap.', 'distance', 10_000, 500, 100],
  ['dist-2', 'Yol Arkadaşı', 'Toplam 100 km yol yap.', 'distance', 100_000, 2000, 300],
  ['dist-3', 'Asfalt Kurdu', 'Toplam 500 km yol yap.', 'distance', 500_000, 6000, 800],
  ['dist-4', 'Dünya Turu Provası', 'Toplam 2.000 km yol yap.', 'distance', 2_000_000, 15000, 2000],
  ['near-1', 'Kıl Payı', '10 kıl payı geçiş yap.', 'nearMisses', 10, 500, 100],
  ['near-2', 'Ayna Silen', '100 kıl payı geçiş yap.', 'nearMisses', 100, 2000, 300],
  ['near-3', 'Milimetrik', '500 kıl payı geçiş yap.', 'nearMisses', 500, 6000, 800],
  ['ovt-1', 'Sollama Çırağı', '50 aracı solla.', 'overtakes', 50, 400, 80],
  ['ovt-2', 'Sollama Kalfası', '500 aracı solla.', 'overtakes', 500, 2500, 400],
  ['ovt-3', 'Sollama Ustası', '3.000 aracı solla.', 'overtakes', 3000, 8000, 1200],
  ['speed-1', 'İki Yüz Kulübü', '200 km/s hıza ulaş.', 'topSpeed', 200, 1500, 250],
  ['speed-2', 'Ses Duvarına Doğru', '250 km/s hıza ulaş.', 'topSpeed', 250, 4000, 600],
  ['speed-3', 'Üç Yüzlük', '300 km/s hıza ulaş.', 'topSpeed', 300, 10000, 1500],
  ['speed-4', 'Hiperuzay', '350 km/s hıza ulaş.', 'topSpeed', 350, 20000, 3000],
  ['whl-1', 'Ön Teker Havada', 'Toplam 200 m wheelie yap.', 'wheelieDistance', 200, 500, 100],
  ['whl-2', 'Tek Teker Sanatçısı', 'Toplam 5 km wheelie yap.', 'wheelieDistance', 5000, 4000, 600],
  ['whl-long-1', 'Uzun Wheelie', 'Tek seferde 150 m wheelie yap.', 'longestWheelie', 150, 1000, 200],
  ['whl-long-2', 'Bitmeyen Wheelie', 'Tek seferde 500 m wheelie yap.', 'longestWheelie', 500, 5000, 800],
  ['opp-1', 'Ters Köşe', 'Karşı şeritte toplam 1 km sür.', 'oppositeDistance', 1000, 800, 150],
  ['opp-2', 'Kafa Kafaya', 'Karşı şeritte toplam 10 km sür.', 'oppositeDistance', 10_000, 4000, 600],
  ['car-1', 'Kariyere Başlangıç', 'İlk kariyer görevini tamamla.', 'missions', 1, 300, 50],
  ['car-2', 'Yükselen Yıldız', '10 kariyer görevi tamamla.', 'missions', 10, 2000, 300],
  ['car-3', 'Usta Sürücü', '40 kariyer görevi tamamla.', 'missions', 40, 8000, 1200],
  ['car-4', 'Efsane', 'Kariyerdeki 80 görevin hepsini tamamla.', 'missions', 80, 25000, 4000],
  ['star-1', 'Yıldız Avcısı', 'Kariyerde 30 yıldız topla.', 'stars', 30, 2000, 300],
  ['star-2', 'Yıldız Koleksiyoncusu', 'Kariyerde 120 yıldız topla.', 'stars', 120, 8000, 1200],
  ['star-3', 'Kusursuz Kariyer', 'Kariyerdeki 240 yıldızın hepsini topla.', 'stars', 240, 30000, 5000],
  ['map-1', 'Gezgin', '3 farklı haritada sür.', 'mapsVisited', 3, 1000, 200],
  ['map-2', 'Türkiye Turu', '8 haritanın hepsinde sür.', 'mapsVisited', 8, 5000, 800],
  ['bike-1', 'Garaj Açılışı', '2 motosiklete sahip ol.', 'bikesOwned', 2, 500, 100],
  ['bike-2', 'Koleksiyoner', '5 motosiklete sahip ol.', 'bikesOwned', 5, 3000, 500],
  ['bike-3', 'Galerici', '15 motosiklete sahip ol.', 'bikesOwned', 15, 12000, 2000],
  ['night-1', 'Gece Kuşu', 'Gece toplam 25 km sür.', 'nightDistance', 25_000, 2000, 300],
  ['rain-1', 'Yağmur Adamı', 'Yağmurda toplam 25 km sür.', 'rainDistance', 25_000, 2000, 300],
  ['snow-1', 'Kar Kaplanı', 'Karda toplam 10 km sür.', 'snowDistance', 10_000, 2000, 300],
  ['fog-1', 'Sis Pilotu', 'Siste toplam 10 km sür.', 'fogDistance', 10_000, 2000, 300],
  ['combo-1', 'Kombo', 'x5 komboya ulaş.', 'maxCombo', 5, 800, 150],
  ['combo-2', 'Kombo Ustası', 'x10 komboya ulaş.', 'maxCombo', 10, 3000, 500],
  ['combo-3', 'Kombo Kralı', 'x20 komboya ulaş.', 'maxCombo', 20, 8000, 1200],
  ['crash-1', 'Asfaltla Tanışma', 'İlk kazanı yap. Herkesin başına gelir.', 'crashes', 1, 100, 20],
  ['crash-2', 'Sigortacının Kâbusu', '25 kez kaza yap.', 'crashes', 25, 500, 100],
  ['crash-3', 'Ambulans Şoförünün Kankası', '100 kez kaza yap. Kask iyi bir yatırımmış.', 'crashes', 100, 1000, 200],
  ['time-1', 'Isınma Turu', 'Toplam 1 saat sür.', 'rideTime', 3600, 1500, 250],
  ['time-2', 'Yolların Ruhu', 'Toplam 10 saat sür.', 'rideTime', 36_000, 8000, 1200],
  ['run-1', 'Uzun Yol', 'Tek sürüşte 10 km yol yap.', 'runDistance', 10_000, 1500, 250],
  ['run-2', 'Maraton', 'Tek sürüşte 42 km yol yap.', 'runDistance', 42_000, 6000, 1000],
  ['daily-1', 'Sadık Sürücü', 'Günlük ödülü 7 gün üst üste al.', 'dailyStreak', 7, 3000, 500],
  ['lvl-1', 'Çaylak Değil', '10. seviyeye ulaş.', 'level', 10, 2000, 0],
  ['lvl-2', 'Kıdemli', '25. seviyeye ulaş.', 'level', 25, 6000, 0],
  ['lvl-3', 'Efsane Sürücü', '50. seviyeye ulaş.', 'level', 50, 20000, 0],
];

function build(): AchievementDef[] {
  return ROWS.map(([id, title, description, metric, target, cash, xp]) => {
    const dash = id.lastIndexOf('-');
    return { id, group: id.slice(0, dash), tier: Number(id.slice(dash + 1)), title, description, metric, target, reward: { cash, xp } };
  });
}

export const ACHIEVEMENTS: readonly AchievementDef[] = build();
export const ACHIEVEMENT_BY_ID: ReadonlyMap<string, AchievementDef> = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
