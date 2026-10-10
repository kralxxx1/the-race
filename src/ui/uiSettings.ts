import type { SettingDef } from '../settings/schema';

export const UI_SETTINGS: SettingDef[] = [
  {
    key: 'hud.units',
    category: 'hud',
    group: 'Birimler',
    label: 'Hız birimi',
    type: 'select',
    options: [
      { value: 'kmh', label: 'km/s' },
      { value: 'mph', label: 'mph' },
    ],
    default: 'kmh',
  },
  {
    key: 'hud.showFps',
    category: 'hud',
    group: 'Performans',
    label: 'FPS göstergesi',
    type: 'toggle',
    default: false,
  },
];
