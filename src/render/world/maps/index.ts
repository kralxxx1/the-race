import type { MapId } from '../../../data/maps';
import type { Scenery, SceneryHost } from '../scenery';
import { CoastScenery } from './coast';
import { ForestScenery } from './forest';
import { HighwayScenery } from './highway';
import { SnowScenery } from './snow';
import { SuburbScenery } from './suburb';

/** Scenery builder for the host's map (template environments fall back to the highway). */
export function createScenery(host: SceneryHost): Scenery {
  const map: MapId = host.env.world.map;
  switch (map) {
    case 'snow':
      return new SnowScenery(host);
    case 'forest':
      return new ForestScenery(host);
    case 'coast':
      return new CoastScenery(host);
    case 'suburb':
      return new SuburbScenery(host);
    default:
      return new HighwayScenery(host);
  }
}
