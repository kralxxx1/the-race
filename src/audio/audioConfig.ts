import type { SettingsReader } from '../settings/schema';
import type { EngineQuality } from './dsp/params';
import { ENGINE_QUALITIES } from './dsp/params';
import type { ExhaustMod } from './voices';

export type SpatialMode = 'hrtf' | 'stereo';

/** Typed snapshot of every `audio.*` setting. */
export interface AudioConfig {
  master: number;
  engine: number;
  wind: number;
  tyres: number;
  traffic: number;
  sfx: number;
  ambience: number;
  ui: number;
  intakeBalance: number;
  helmet: boolean;
  mechanical: number;
  crackle: number;
  exhaust: ExhaustMod;
  dryClutch: boolean;
  starter: boolean;
  doppler: number;
  trafficVoices: number;
  spatial: SpatialMode;
  nearMiss: boolean;
  hornSounds: boolean;
  reverb: boolean;
  reverbAmount: number;
  nightMode: boolean;
  mono: boolean;
  bass: number;
  treble: number;
  quality: EngineQuality;
}

export const DEFAULT_AUDIO_CONFIG: Readonly<AudioConfig> = {
  master: 0.8,
  engine: 0.9,
  wind: 0.8,
  tyres: 0.8,
  traffic: 0.8,
  sfx: 0.8,
  ambience: 0.8,
  ui: 0.8,
  intakeBalance: 0,
  helmet: true,
  mechanical: 1,
  crackle: 1,
  exhaust: 'stock',
  dryClutch: true,
  starter: true,
  doppler: 1,
  trafficVoices: 5,
  spatial: 'hrtf',
  nearMiss: true,
  hornSounds: true,
  reverb: true,
  reverbAmount: 0.6,
  nightMode: false,
  mono: false,
  bass: 0,
  treble: 0,
  quality: 'high',
};

/** Read the audio settings from the game's settings store. */
export function readAudioConfig(s: SettingsReader): AudioConfig {
  const q = s.str('audio.quality');
  return {
    master: s.num('audio.master'),
    engine: s.num('audio.engine'),
    wind: s.num('audio.wind'),
    tyres: s.num('audio.tyres'),
    traffic: s.num('audio.traffic'),
    sfx: s.num('audio.sfx'),
    ambience: s.num('audio.ambience'),
    ui: s.num('audio.ui'),
    intakeBalance: s.num('audio.intakeBalance'),
    helmet: s.bool('audio.helmet'),
    mechanical: s.num('audio.mechanical'),
    crackle: s.num('audio.crackle'),
    exhaust: s.str<ExhaustMod>('audio.exhaust'),
    dryClutch: s.bool('audio.dryClutch'),
    starter: s.bool('audio.starter'),
    doppler: s.num('audio.doppler'),
    trafficVoices: Math.round(s.num('audio.trafficVoices')),
    spatial: s.str<SpatialMode>('audio.spatial'),
    nearMiss: s.bool('audio.nearMiss'),
    hornSounds: s.bool('audio.hornSounds'),
    reverb: s.bool('audio.reverb'),
    reverbAmount: s.num('audio.reverbAmount'),
    nightMode: s.bool('audio.nightMode'),
    mono: s.bool('audio.mono'),
    bass: s.num('audio.bass'),
    treble: s.num('audio.treble'),
    quality: (ENGINE_QUALITIES as readonly string[]).includes(q) ? (q as EngineQuality) : 'high',
  };
}
