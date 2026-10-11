import type { SettingDef } from '../../settings/schema';
import { BIKE_DETAILS, type BikeDetail } from './quality';

/**
 * Motorcycle model options. `gfx.bikeDetail` drives the bike kit's tessellation,
 * micro-details (bolts, chain links, stitching, lettering), livery/texture sizes
 * and paint shading for the player's bike in the garage and the first-person cockpit.
 */
export const BIKE_SETTINGS: SettingDef[] = [
  {
    key: 'gfx.bikeDetail',
    category: 'graphics',
    group: 'Motosiklet modeli',
    label: 'Motosiklet model detayı',
    help: 'Geometri yoğunluğu, cıvata/zincir/dikiş gibi mikro detaylar, boya ve doku çözünürlüğü. Ekstrem, kokpit ve garaj yakın çekimleri içindir.',
    type: 'select',
    options: [
      { value: 'low', label: 'Düşük', help: '~70 bin üçgen, mikro detay yok' },
      { value: 'medium', label: 'Orta', help: '~150 bin üçgen' },
      { value: 'high', label: 'Yüksek', help: '~250 bin üçgen, tek tek zincir baklaları' },
      { value: 'ultra', label: 'Ultra', help: '~450 bin üçgen, metalik pul boya' },
      { value: 'extreme', label: 'Ekstrem', help: '~800 bin üçgen, 2K dokular' },
    ],
    default: 'high',
    presets: { low: 'low', medium: 'medium', high: 'high', ultra: 'ultra', extreme: 'extreme' },
  },
];

/** Typed accessor (anything with `str`, e.g. SettingsReader). */
export function bikeDetailFrom(settings: { str(key: string): string } | null | undefined): BikeDetail {
  const v = settings?.str('gfx.bikeDetail');
  return (BIKE_DETAILS as readonly string[]).includes(v ?? '') ? (v as BikeDetail) : 'high';
}
