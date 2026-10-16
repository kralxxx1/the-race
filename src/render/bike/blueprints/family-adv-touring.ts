import type { BikeSpec } from '../../../data/bikes';
import type { BikeBlueprint } from '../types';
import { africaTwinBlueprint } from './family-adv-touring-africatwin';
import { goldWingBlueprint } from './family-adv-touring-goldwing';
import { k1600gtBlueprint } from './family-adv-touring-k1600';
import { ktm890Blueprint } from './family-adv-touring-ktm890';
import { multistradaV4Blueprint } from './family-adv-touring-multistrada';
import { panAmericaBlueprint } from './family-adv-touring-panamerica';
import { vstrom650Blueprint } from './family-adv-touring-vstrom';

/**
 * Adventure / touring family: authored blueprints for the Honda Africa Twin and Gold Wing,
 * Suzuki V-Strom 650, Ducati Multistrada V4 S, BMW K 1600 GT, KTM 890 Adventure R,
 * Harley-Davidson Pan America and Benelli TRK 502 X. Discovered by `blueprints/index.ts`.
 */
export const BLUEPRINTS: Record<string, (spec: BikeSpec) => BikeBlueprint> = {
  'honda-africa-twin': africaTwinBlueprint,
  'honda-gold-wing': goldWingBlueprint,
  'suzuki-vstrom650': vstrom650Blueprint,
  'ducati-multistrada-v4': multistradaV4Blueprint,
  'bmw-k1600gt': k1600gtBlueprint,
  'ktm-890-adventure-r': ktm890Blueprint,
  'harley-pan-america': panAmericaBlueprint,
};
