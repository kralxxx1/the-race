import type { MapId } from '../../../data/maps';
import type { Scenery, SceneryHost } from '../scenery';
import { AnkaraScenery } from './ankara';
import { BlackSeaScenery } from './blacksea';
import { BodrumScenery } from './bodrum';
import { BosphorusScenery } from './bosphorus';
import { KapadokyaScenery } from './kapadokya';
import { KarsScenery } from './kars';
import { KordonScenery } from './kordon';
import { MardinScenery } from './mardin';
import { NemrutScenery } from './nemrut';
import { PamukkaleScenery } from './pamukkale';
import { SafranboluScenery } from './safranbolu';
import { SaltLakeScenery } from './saltlake';
import { ThraceScenery } from './thrace';
import { TorosScenery } from './toros';
import { UludagScenery } from './uludag';
import { VanScenery } from './van';
import { CityScenery } from './city';
import { CoastScenery } from './coast';
import { DesertScenery } from './desert';
import { ForestScenery } from './forest';
import { HighwayScenery } from './highway';
import { IndustrialScenery } from './industrial';
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
    case 'desert':
      return new DesertScenery(host);
    case 'city':
      return new CityScenery(host);
    case 'industrial':
      return new IndustrialScenery(host);
    case 'kapadokya':
      return new KapadokyaScenery(host);
    case 'bodrum':
      return new BodrumScenery(host);
    case 'thrace':
      return new ThraceScenery(host);
    case 'ankara':
      return new AnkaraScenery(host);
    case 'pamukkale':
      return new PamukkaleScenery(host);
    case 'kordon':
      return new KordonScenery(host);
    case 'bosphorus':
      return new BosphorusScenery(host);
    case 'safranbolu':
      return new SafranboluScenery(host);
    case 'mardin':
      return new MardinScenery(host);
    case 'blacksea':
      return new BlackSeaScenery(host);
    case 'uludag':
      return new UludagScenery(host);
    case 'saltlake':
      return new SaltLakeScenery(host);
    case 'van':
      return new VanScenery(host);
    case 'nemrut':
      return new NemrutScenery(host);
    case 'toros':
      return new TorosScenery(host);
    case 'kars':
      return new KarsScenery(host);
    default:
      return new HighwayScenery(host);
  }
}
