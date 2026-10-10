import type { SettingDef } from '../settings/schema';

/** First-person camera options. */
export const CAMERA_SETTINGS: SettingDef[] = [
  {
    key: 'cam.shake',
    category: 'camera',
    group: 'Hareket',
    label: 'Kamera sarsıntısı',
    help: 'Yol titreşimi, darbe ve yüksek hız sarsıntısı.',
    type: 'toggle',
    default: true,
  },
];
