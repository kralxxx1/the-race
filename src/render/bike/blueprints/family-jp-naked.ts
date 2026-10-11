import type { BikeSpec } from '../../../data/bikes';
import type { BikeBlueprint } from '../types';
import { mt09Blueprint } from './family-jp-naked-mt09';

/**
 * Japanese / Chinese middleweight naked family: authored blueprints for the Honda CB500
 * Hornet, Yamaha MT-09 and MT-07, Kawasaki Z900, Suzuki SV650 and CFMoto 800NK.
 * Discovered by `blueprints/index.ts` (family-*.ts modules).
 */
export const BLUEPRINTS: Record<string, (spec: BikeSpec) => BikeBlueprint> = {
  'yamaha-mt09': mt09Blueprint,
};
