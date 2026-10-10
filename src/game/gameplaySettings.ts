import type { SettingDef } from '../settings/schema';

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
];
