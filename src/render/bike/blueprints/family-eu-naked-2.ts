import type { BikeSpec } from '../../../data/bikes';
import type { BikeBlueprint } from '../types';
import { speedTripleBlueprint } from './family-eu-naked-2-speedtriple';
import { streetTripleBlueprint } from './family-eu-naked-2-streettriple';

/**
 * European naked bikes, family 2: Triumph Speed Triple 1200 RS, Triumph Street Triple 765 RS,
 * MV Agusta Brutale 1000 RR and Husqvarna Svartpilen 401. Discovered automatically by
 * `blueprints/index.ts` (family-*.ts).
 */
export const BLUEPRINTS: Record<string, (spec: BikeSpec) => BikeBlueprint> = {
  'triumph-speed-triple': speedTripleBlueprint,
  'triumph-street-triple': streetTripleBlueprint,
};
