import type { ModeDef } from '../data/modes';
import type { SettingDef } from '../settings/schema';

export type TrafficDensitySetting = 'low' | 'normal' | 'high' | 'extreme';
export type DifficultySetting = 'easy' | 'normal' | 'hard';
export type AutoThrottleSetting = 'off' | 'touch' | 'always';

export const GAMEPLAY_SETTINGS: SettingDef[] = [
  {
    key: 'play.autoShift',
    category: 'gameplay',
    group: 'Sürüş',
    label: 'Şanzıman',
    type: 'select',
    options: [
      { value: 'auto', label: 'Otomatik' },
      { value: 'manual', label: 'Manuel (Q/E)' },
    ],
    default: 'auto',
  },
  {
    key: 'play.autoThrottle',
    category: 'gameplay',
    group: 'Sürüş',
    label: 'Otomatik gaz',
    help: 'Traffic Rider gibi: motor kendiliğinden hızlanır, sen sadece fren ve direksiyonu kullanırsın.',
    type: 'select',
    options: [
      { value: 'off', label: 'Kapalı' },
      { value: 'touch', label: 'Dokunmatikte', help: 'Yalnızca dokunmatik ekranlı cihazlarda' },
      { value: 'always', label: 'Her zaman' },
    ],
    default: 'off',
  },
  {
    key: 'play.wheelieAssist',
    category: 'gameplay',
    group: 'Sürüş',
    label: 'Wheelie asistanı',
    help: 'Wheelie tuşu basılıyken gazı denge noktasında tutar; ayrıca gaz vermen gerekmez.',
    type: 'toggle',
    default: true,
  },
  {
    key: 'play.trafficDensity',
    category: 'gameplay',
    group: 'Trafik',
    label: 'Trafik yoğunluğu',
    help: 'Serbest modlardaki araç sayısı. Kariyer görevleri kendi trafiğini kullanır.',
    type: 'select',
    options: [
      { value: 'low', label: 'Az' },
      { value: 'normal', label: 'Normal' },
      { value: 'high', label: 'Yoğun' },
      { value: 'extreme', label: 'Çok yoğun' },
    ],
    default: 'normal',
  },
  {
    key: 'play.difficulty',
    category: 'gameplay',
    group: 'Trafik',
    label: 'Zorluk',
    help: 'Sürücülerin ne sıklıkla ve ne kadar ani şerit değiştirdiği (tüm modlar).',
    type: 'select',
    options: [
      { value: 'easy', label: 'Kolay' },
      { value: 'normal', label: 'Normal' },
      { value: 'hard', label: 'Zor' },
    ],
    default: 'normal',
  },
  {
    key: 'play.missionHints',
    category: 'gameplay',
    group: 'Kariyer',
    label: 'Görev ipuçları',
    help: 'Görev ekranında ve sürüşün başında hedefe yönelik bir ipucu gösterir.',
    type: 'toggle',
    default: true,
  },
  {
    key: 'play.achievementToasts',
    category: 'gameplay',
    group: 'Kariyer',
    label: 'Sürüş sırasında başarım bildirimleri',
    help: 'Başarım açıldığında veya seviye atladığında ekranın üstünde kısa bir bildirim çıkar.',
    type: 'toggle',
    default: true,
  },
  {
    key: 'hud.missionPanel',
    category: 'hud',
    group: 'Görevler',
    label: 'Görev paneli',
    help: 'Kariyer sürüşünde hedefi, ilerleme çubuğunu ve bonus hedefi gösterir.',
    type: 'toggle',
    default: true,
  },
  {
    key: 'hud.kmMarkers',
    category: 'hud',
    group: 'Görevler',
    label: 'Kilometre bildirimleri',
    help: 'Her tamamlanan kilometrede kısa bir bildirim gösterir.',
    type: 'toggle',
    default: true,
  },
];

const DENSITY_FACTOR: Record<TrafficDensitySetting, number> = { low: 0.6, normal: 1, high: 1.3, extreme: 1.6 };
/** Aggression multiplier and lane-change appetite per difficulty. */
const DIFFICULTY_AGGRESSION: Record<DifficultySetting, number> = { easy: 0.6, normal: 1, hard: 1.45 };

/**
 * A copy of `mode` with its traffic adjusted to the player's settings.
 * Density only applies to free modes (career missions are balanced around
 * their own traffic); difficulty applies everywhere.
 */
export function applyTrafficSettings(mode: ModeDef, density: string, difficulty: string): ModeDef {
  const t = mode.traffic;
  const k = mode.id === 'career' ? 1 : (DENSITY_FACTOR[density as TrafficDensitySetting] ?? 1);
  const a = DIFFICULTY_AGGRESSION[difficulty as DifficultySetting] ?? 1;
  return {
    ...mode,
    traffic: {
      ...t,
      baseDensity: Math.round(t.baseDensity * k),
      densityGrowth: t.densityGrowth * k,
      maxDensity: Math.round(t.maxDensity * k),
      aggression: Math.min(1, t.aggression * a),
    },
  };
}

/** Whether auto-throttle is active for this setting on this device. */
export function autoThrottleActive(setting: string, touchDevice: boolean): boolean {
  return setting === 'always' || (setting === 'touch' && touchDevice);
}
