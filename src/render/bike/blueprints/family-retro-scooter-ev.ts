import type { BikeSpec } from '../../../data/bikes';
import type { BikeBlueprint } from '../types';
import { bonnevilleT120Blueprint } from './family-retro-scooter-ev-bonneville';
import { classic350Blueprint, interceptor650Blueprint } from './family-retro-scooter-ev-enfield';
import { liveWireOneBlueprint } from './family-retro-scooter-ev-livewire';
import { scramblerIconBlueprint } from './family-retro-scooter-ev-scrambler';
import { tmaxBlueprint } from './family-retro-scooter-ev-tmax';
import { vespaGtsBlueprint } from './family-retro-scooter-ev-vespa';

/**
 * Retro / scooter / electric family: Vespa GTS 300, Yamaha TMAX 560, LiveWire One, Triumph Bonneville T120,
 * Royal Enfield Interceptor 650 and Classic 350, Indian FTR 1200 S and Ducati Scrambler Icon.
 * Discovered automatically by blueprints/index.ts.
 */
export const BLUEPRINTS: Record<string, (spec: BikeSpec) => BikeBlueprint> = {
  'vespa-gts-300': vespaGtsBlueprint,
  'yamaha-tmax': tmaxBlueprint,
  'livewire-one': liveWireOneBlueprint,
  'triumph-bonneville-t120': bonnevilleT120Blueprint,
  're-interceptor-650': interceptor650Blueprint,
  're-classic-350': classic350Blueprint,
  'ducati-scrambler': scramblerIconBlueprint,
};
