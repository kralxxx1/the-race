import type { BikeSpec } from '../../../data/bikes';
import type { BikeBlueprint } from '../types';
import { duke390Blueprint } from './family-eu-naked-1-duke390';
import { monsterBlueprint } from './family-eu-naked-1-monster';
import { superDukeBlueprint } from './family-eu-naked-1-sdr';
import { sfv4Blueprint } from './family-eu-naked-1-sfv4';

/**
 * European naked-bike family "eu-naked-1": authored blueprints for the Ducati Streetfighter
 * V4 S and Monster, the KTM 1290 Super Duke R Evo and 390 Duke, and the Aprilia Tuono V4
 * Factory. Discovered by `blueprints/index.ts` (family-*.ts modules).
 */
export const BLUEPRINTS: Record<string, (spec: BikeSpec) => BikeBlueprint> = {
  'ducati-streetfighter-v4': sfv4Blueprint,
  'ducati-monster': monsterBlueprint,
  'ktm-1290-superduke-r': superDukeBlueprint,
  'ktm-390-duke': duke390Blueprint,
};
