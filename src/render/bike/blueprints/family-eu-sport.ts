import type { BikeSpec } from '../../../data/bikes';
import type { BikeBlueprint } from '../types';
import { f3Blueprint } from './family-eu-sport-f3';
import { m1000rrBlueprint } from './family-eu-sport-m1000rr';
import { panigaleV2Blueprint } from './family-eu-sport-panigale-v2';
import { rs660Blueprint } from './family-eu-sport-rs660';
import { rsv4Blueprint } from './family-eu-sport-rsv4';

/**
 * European sport-bike family: authored blueprints for the Ducati Panigale V2, Aprilia
 * RSV4 Factory and RS 660, MV Agusta F3 RR and BMW M 1000 RR. Discovered by
 * `blueprints/index.ts` (family-*.ts modules).
 */
export const BLUEPRINTS: Record<string, (spec: BikeSpec) => BikeBlueprint> = {
  'ducati-panigale-v2': panigaleV2Blueprint,
  'aprilia-rsv4': rsv4Blueprint,
  'aprilia-rs660': rs660Blueprint,
  'mv-agusta-f3-rr': f3Blueprint,
  'bmw-m1000rr': m1000rrBlueprint,
};
