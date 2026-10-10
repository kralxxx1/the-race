import type { SettingDef } from '../settings/schema';

const pct = (v: number): string => `${Math.round(v * 100)}%`;

export const AUDIO_SETTINGS: SettingDef[] = [
  { key: 'audio.master', category: 'audio', group: 'Ses seviyeleri', label: 'Genel ses', type: 'slider', min: 0, max: 1, step: 0.05, format: pct, default: 0.8 },
  { key: 'audio.engine', category: 'audio', group: 'Ses seviyeleri', label: 'Motor sesi', type: 'slider', min: 0, max: 1, step: 0.05, format: pct, default: 0.9 },
  { key: 'audio.sfx', category: 'audio', group: 'Ses seviyeleri', label: 'Efektler', type: 'slider', min: 0, max: 1, step: 0.05, format: pct, default: 0.8 },
];
