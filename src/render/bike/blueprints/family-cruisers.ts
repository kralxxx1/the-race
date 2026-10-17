import type { BikeSpec } from '../../../data/bikes';
import type { BikeBlueprint } from '../types';
import { indianChiefBlueprint } from './family-cruisers-chief';
import { r18Blueprint } from './family-cruisers-r18';
import { rocket3Blueprint } from './family-cruisers-rocket3';
import { vmaxBlueprint } from './family-cruisers-vmax';
import { fatBoyBlueprint } from './family-cruisers-fatboy';
import { rebel500Blueprint } from './family-cruisers-rebel';

/**
 * Cruiser family: Honda Rebel 500, Yamaha VMAX, BMW R 18, Triumph Rocket 3 R, Harley-Davidson Fat Boy 114
 * and Indian Chief Dark Horse. Discovered automatically by blueprints/index.ts.
 */
export const BLUEPRINTS: Record<string, (spec: BikeSpec) => BikeBlueprint> = {
  'honda-rebel-500': rebel500Blueprint,
  'harley-fat-boy': fatBoyBlueprint,
  'indian-chief': indianChiefBlueprint,
  'bmw-r18': r18Blueprint,
  'triumph-rocket3': rocket3Blueprint,
  'yamaha-vmax': vmaxBlueprint,
};
