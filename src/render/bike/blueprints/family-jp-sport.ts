import type { BikeSpec } from '../../../data/bikes';
import type { BikeBlueprint } from '../types';
import { firebladeBlueprint } from './family-jp-sport-fireblade';
import { r6Blueprint } from './family-jp-sport-r6';

/**
 * Japanese sport-bike family: authored blueprints for the Honda Fireblade SP and
 * CBR650R, Yamaha R6 and R3, Suzuki GSX-R1000R and Hayabusa. Discovered by
 * `blueprints/index.ts` (family-*.ts modules).
 */
export const BLUEPRINTS: Record<string, (spec: BikeSpec) => BikeBlueprint> = {
  'honda-cbr1000rr-r': firebladeBlueprint,
  'yamaha-r6': r6Blueprint,
};
