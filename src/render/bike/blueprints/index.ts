import type { BikeSpec } from '../../../data/bikes';
import type { BikeBlueprint } from '../types';
import { autoBlueprint } from './auto';
import { ninjaH2Blueprint } from './ninjaH2';
import { panigaleV4Blueprint } from './panigaleV4';
import { r1Blueprint } from './r1';
import { s1000rrBlueprint } from './s1000rr';

/**
 * Blueprint registry. Authored blueprints (hand-built from spec sheets and
 * photos) take precedence; every other bike gets an automatic blueprint derived
 * from its catalogue look parameters.
 */
type Factory = (spec: BikeSpec) => BikeBlueprint;

const AUTHORED = new Map<string, Factory>();
const cache = new Map<string, BikeBlueprint>();

AUTHORED.set('yamaha-r1', r1Blueprint);
AUTHORED.set('ducati-panigale-v4s', panigaleV4Blueprint);
AUTHORED.set('kawasaki-h2', ninjaH2Blueprint);
AUTHORED.set('bmw-s1000rr', s1000rrBlueprint);

export function registerBlueprint(id: string, f: Factory): void {
  AUTHORED.set(id, f);
  cache.delete(id);
}

export function hasAuthoredBlueprint(id: string): boolean {
  return AUTHORED.has(id);
}

export function authoredIds(): string[] {
  return [...AUTHORED.keys()];
}

export function blueprintFor(spec: BikeSpec): BikeBlueprint {
  let bp = cache.get(spec.id);
  if (!bp) {
    const f = AUTHORED.get(spec.id);
    bp = f ? f(spec) : autoBlueprint(spec);
    cache.set(spec.id, bp);
  }
  return bp;
}
