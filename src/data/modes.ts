import type { RoadLayout } from '../world/road';

export type ModeId = 'endless' | 'twoway' | 'timetrial' | 'freeride';

export interface ModeDef {
  id: ModeId;
  name: string;
  description: string;
  layout: RoadLayout;
  traffic: { baseDensity: number; densityGrowth: number; maxDensity: number; aggression: number; enabled: boolean };
  /** Time trial: starting seconds and checkpoint spacing. */
  timer: { start: number; checkpointEvery: number; bonus: number } | null;
  /** Free ride respawns instead of ending the run. */
  respawn: boolean;
}

export const MODES: ModeDef[] = [
  {
    id: 'endless',
    name: 'Sonsuz — Tek Yön',
    description: 'Dört şeritli otoyolda trafik içinde akabildiğin kadar ak. 100 km/s üstünde kıl payı geçişler puanı katlar.',
    layout: 'oneway',
    traffic: { baseDensity: 30, densityGrowth: 5, maxDensity: 56, aggression: 0.45, enabled: true },
    timer: null,
    respawn: false,
  },
  {
    id: 'twoway',
    name: 'Sonsuz — Çift Yön',
    description: 'Karşı şeritte sürmek ekstra puan getirir… ama karşıdan gelenler durmaz.',
    layout: 'twoway',
    traffic: { baseDensity: 30, densityGrowth: 4.5, maxDensity: 52, aggression: 0.4, enabled: true },
    timer: null,
    respawn: false,
  },
  {
    id: 'timetrial',
    name: 'Zamana Karşı',
    description: 'Süre bitmeden kontrol noktalarına ulaş. Her kontrol noktası ek süre kazandırır.',
    layout: 'oneway',
    traffic: { baseDensity: 32, densityGrowth: 5, maxDensity: 58, aggression: 0.5, enabled: true },
    timer: { start: 65, checkpointEvery: 2500, bonus: 38 },
    respawn: false,
  },
  {
    id: 'freeride',
    name: 'Serbest Sürüş',
    description: 'Hafif trafik, süre yok. Motoru, sesi ve manzarayı keşfet; düşersen yeniden başlarsın.',
    layout: 'oneway',
    traffic: { baseDensity: 12, densityGrowth: 0, maxDensity: 12, aggression: 0.2, enabled: true },
    timer: null,
    respawn: true,
  },
];

export const MODE_BY_ID: ReadonlyMap<ModeId, ModeDef> = new Map(MODES.map((m) => [m.id, m]));
