import type { BikeSpec } from '../../../data/bikes';
import type { BikeBlueprint } from '../types';
import { africaTwinBlueprint } from './family-adv-touring-africatwin';
import { goldWingBlueprint } from './family-adv-touring-goldwing';

/**
 * Adventure / touring family: authored blueprints for the Honda Africa Twin and Gold Wing,
 * Suzuki V-Strom 650, Ducati Multistrada V4 S, BMW K 1600 GT, KTM 890 Adventure R,
 * Harley-Davidson Pan America and Benelli TRK 502 X. Discovered by `blueprints/index.ts`.
 */
export const BLUEPRINTS: Record<string, (spec: BikeSpec) => BikeBlueprint> = {
  'honda-africa-twin': africaTwinBlueprint,
  'honda-gold-wing': goldWingBlueprint,
};
