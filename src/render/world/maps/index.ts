import type { MapId } from '../../../data/maps';
import type { Scenery, SceneryHost } from '../scenery';
import { HighwayScenery } from './highway';
import { SuburbScenery } from './suburb';

/** Scenery builder for the host's map (template environments fall back to the highway). */
export function createScenery(host: SceneryHost): Scenery {
  const map: MapId = host.env.world.map;
  switch (map) {
    case 'suburb':
      return new SuburbScenery(host);
    default:
      return new HighwayScenery(host);
  }
}
