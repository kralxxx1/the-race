import type { BikeSpec } from '../../../data/bikes';
import type { BikeBlueprint } from '../types';
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
};
