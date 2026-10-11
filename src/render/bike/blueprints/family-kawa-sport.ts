import type { BikeSpec } from '../../../data/bikes';
import type { BikeBlueprint } from '../types';
import { ninjaH2RBlueprint } from './family-kawa-sport-h2r';
import { ninja400Blueprint } from './family-kawa-sport-ninja400';
import { zx10rBlueprint } from './family-kawa-sport-zx10r';
import { zx4rrBlueprint } from './family-kawa-sport-zx4rr';
import { zx6rBlueprint } from './family-kawa-sport-zx6r';

/**
 * Kawasaki supersport family (Ninja H2R, ZX-10R, ZX-6R, ZX-4RR, Ninja 400) and the
 * KTM RC 390. Discovered automatically by `blueprints/index.ts` (family-*.ts).
 */
export const BLUEPRINTS: Record<string, (spec: BikeSpec) => BikeBlueprint> = {
  'kawasaki-h2r': ninjaH2RBlueprint,
  'kawasaki-zx10r': zx10rBlueprint,
  'kawasaki-zx6r': zx6rBlueprint,
  'kawasaki-zx4rr': zx4rrBlueprint,
  'kawasaki-ninja400': ninja400Blueprint,
};
