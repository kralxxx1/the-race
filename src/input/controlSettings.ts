import type { SettingDef } from '../settings/schema';

export const CONTROL_SETTINGS: SettingDef[] = [
  {
    key: 'ctrl.steerSensitivity',
    category: 'controls',
    group: 'Direksiyon',
    label: 'Direksiyon hassasiyeti',
    type: 'slider',
    min: 0.5,
    max: 1.5,
    step: 0.05,
    format: (v) => `${Math.round(v * 100)}%`,
    default: 1,
  },
  {
    key: 'ctrl.tilt',
    category: 'controls',
    group: 'Direksiyon',
    label: 'Eğim kontrolü (telefon)',
    help: 'Telefonu sağa sola yatırarak yönlendir.',
    type: 'toggle',
    default: false,
  },
];
