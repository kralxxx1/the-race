/**
 * Traffic vehicle catalogue: the kinds that appear on Turkish roads, their real-world sizes and how
 * likely each is to be met on a given map. Models live in render/vehicle, behaviour in world/traffic.
 */
export type VehicleKind =
  | 'sedan'
  | 'hatch'
  | 'suv'
  | 'pickup'
  | 'van'
  | 'minibus'
  | 'truck'
  | 'semi'
  | 'tanker'
  | 'bus'
  | 'coach'
  | 'taxi'
  | 'police'
  | 'ambulance';

export interface VehicleArchetype {
  kind: VehicleKind;
  /** Turkish display name (debug tools, photo mode). */
  label: string;
  length: number;
  width: number;
  height: number;
  /** Axle-to-axle distance of the (first) axle pair, for steering geometry. */
  wheelbase: number;
  /** Relative spawn weight on an average road. */
  weight: number;
  /** Cruising speed multiplier vs lane speed. */
  speedFactor: number;
  /** Heavy vehicles keep to the slow lanes. */
  heavy: boolean;
  /** Emergency / service vehicle: never blocked into an unsafe overtake, may run lights on. */
  special: boolean;
  /** Paint choices, repeated entries weight the pick (see PAINTS). */
  colors: string[];
}

/**
 * Car paint mix of Turkish roads: white dominates, then grey/silver/black, with red and blue as the
 * common colours and a few browns, greens and beiges.
 */
export const PAINTS: ReadonlyArray<{ color: string; weight: number }> = [
  { color: '#eceeef', weight: 36 }, // white
  { color: '#bfc3c8', weight: 11 }, // silver
  { color: '#8d9298', weight: 10 }, // grey
  { color: '#4a4e55', weight: 7 }, // anthracite
  { color: '#17181b', weight: 11 }, // black
  { color: '#9a1d1f', weight: 6 }, // red
  { color: '#c42a22', weight: 2.5 }, // bright red
  { color: '#1f3f7a', weight: 4 }, // blue
  { color: '#3d6ea8', weight: 2 }, // light blue
  { color: '#4d6a4a', weight: 1.4 }, // green
  { color: '#7b6a55', weight: 2.2 }, // brown
  { color: '#d6cfbd', weight: 3 }, // beige / champagne
  { color: '#c46a1b', weight: 1.2 }, // orange
];

const CAR_COLORS: string[] = expandPalette(PAINTS);

function expandPalette(p: ReadonlyArray<{ color: string; weight: number }>): string[] {
  const out: string[] = [];
  for (const { color, weight } of p) for (let i = 0; i < Math.round(weight * 2); i++) out.push(color);
  return out;
}

const TRUCK_COLORS = ['#eceeef', '#eceeef', '#eceeef', '#1f3f7a', '#8e1b1b', '#c9ccd1', '#2f3338', '#c46a1b', '#3b5d3a', '#d7a21c'];
const COACH_COLORS = ['#eceeef', '#eceeef', '#eceeef', '#eceeef', '#c9ccd1', '#1f3f7a'];
const CITY_BUS_COLORS = ['#eceeef', '#1f5aa8', '#a3262a', '#2f7d4e', '#d8d3c4'];

export const VEHICLES: Record<VehicleKind, VehicleArchetype> = {
  sedan: { kind: 'sedan', label: 'Sedan', length: 4.6, width: 1.8, height: 1.45, wheelbase: 2.7, weight: 24, speedFactor: 1, heavy: false, special: false, colors: CAR_COLORS },
  hatch: { kind: 'hatch', label: 'Hatchback', length: 4.05, width: 1.8, height: 1.44, wheelbase: 2.58, weight: 22, speedFactor: 0.98, heavy: false, special: false, colors: CAR_COLORS },
  suv: { kind: 'suv', label: 'Crossover', length: 4.5, width: 1.86, height: 1.64, wheelbase: 2.67, weight: 20, speedFactor: 1.02, heavy: false, special: false, colors: CAR_COLORS },
  pickup: { kind: 'pickup', label: 'Pikap', length: 5.3, width: 1.88, height: 1.82, wheelbase: 3.1, weight: 5, speedFactor: 0.95, heavy: false, special: false, colors: CAR_COLORS },
  van: { kind: 'van', label: 'Panelvan', length: 5.3, width: 2.0, height: 2.05, wheelbase: 3.3, weight: 8, speedFactor: 0.9, heavy: false, special: false, colors: ['#eceeef', '#eceeef', '#eceeef', '#c9ccd1', '#1f3f7a', '#17181b', '#9a1d1f'] },
  minibus: { kind: 'minibus', label: 'Minibüs', length: 5.9, width: 2.0, height: 2.55, wheelbase: 3.65, weight: 2.6, speedFactor: 0.88, heavy: false, special: false, colors: ['#eceeef', '#eceeef', '#c9ccd1', '#d7a21c', '#1f3f7a'] },
  truck: { kind: 'truck', label: 'Kamyon', length: 8.2, width: 2.45, height: 3.5, wheelbase: 4.6, weight: 5.5, speedFactor: 0.78, heavy: true, special: false, colors: TRUCK_COLORS },
  semi: { kind: 'semi', label: 'Tır', length: 16.5, width: 2.55, height: 4.0, wheelbase: 3.8, weight: 4.5, speedFactor: 0.74, heavy: true, special: false, colors: TRUCK_COLORS },
  tanker: { kind: 'tanker', label: 'Tanker', length: 16.2, width: 2.55, height: 3.75, wheelbase: 3.8, weight: 1.6, speedFactor: 0.72, heavy: true, special: false, colors: ['#eceeef', '#1f3f7a', '#a3262a', '#2f3338', '#d7a21c'] },
  bus: { kind: 'bus', label: 'Şehir otobüsü', length: 12.0, width: 2.55, height: 3.15, wheelbase: 5.9, weight: 2, speedFactor: 0.8, heavy: true, special: false, colors: CITY_BUS_COLORS },
  coach: { kind: 'coach', label: 'Şehirlerarası otobüs', length: 13.0, width: 2.55, height: 3.7, wheelbase: 6.2, weight: 2.2, speedFactor: 0.86, heavy: true, special: false, colors: COACH_COLORS },
  taxi: { kind: 'taxi', label: 'Taksi', length: 4.6, width: 1.8, height: 1.45, wheelbase: 2.7, weight: 4.5, speedFactor: 1.05, heavy: false, special: false, colors: ['#f2c200'] },
  police: { kind: 'police', label: 'Polis aracı', length: 4.6, width: 1.82, height: 1.5, wheelbase: 2.7, weight: 0.7, speedFactor: 1.15, heavy: false, special: true, colors: ['#f4f5f7'] },
  ambulance: { kind: 'ambulance', label: 'Ambulans', length: 5.9, width: 2.05, height: 2.6, wheelbase: 3.65, weight: 0.35, speedFactor: 1.12, heavy: false, special: true, colors: ['#f4f5f7'] },
};

export const VEHICLE_KINDS = Object.keys(VEHICLES) as VehicleKind[];

/** Spawn weight multipliers per map (missing kind = 1): city has taxis and buses, highways have lorries and coaches. */
export const MAP_TRAFFIC_MIX: Record<string, Partial<Record<VehicleKind, number>>> = {
  highway: { semi: 1.8, tanker: 1.6, coach: 2, truck: 1.2, pickup: 0.8, taxi: 0.3, bus: 0.2 },
  city: { taxi: 4, bus: 3.2, minibus: 2.6, van: 1.5, hatch: 1.2, semi: 0.25, tanker: 0.3, coach: 0.4, truck: 0.7, pickup: 0.6 },
  suburb: { hatch: 1.3, minibus: 1.8, bus: 1.6, taxi: 1.5, van: 1.3, semi: 0.4, tanker: 0.3, coach: 0.5 },
  desert: { pickup: 2.2, semi: 1.6, tanker: 1.8, coach: 1.6, taxi: 0.2, bus: 0.2, minibus: 0.6, hatch: 0.8 },
  coast: { suv: 1.4, minibus: 1.5, coach: 1.5, taxi: 0.8, semi: 0.6, tanker: 0.5 },
  forest: { pickup: 1.6, truck: 1.4, semi: 1.0, suv: 1.2, taxi: 0.2, bus: 0.4 },
  snow: { suv: 1.6, pickup: 1.8, truck: 1.2, semi: 0.8, taxi: 0.2 },
  industrial: { semi: 3, truck: 3, tanker: 3.2, van: 1.6, pickup: 1.4, taxi: 0.15, coach: 0.4, bus: 0.5, hatch: 0.6 },
};

/** Spawn density multiplier per map and per time of day (roads empty out at night). */
export const MAP_TRAFFIC_DENSITY: Record<string, number> = {
  city: 1.2,
  suburb: 0.95,
  highway: 1,
  coast: 0.85,
  industrial: 0.85,
  forest: 0.65,
  desert: 0.55,
  snow: 0.55,
};

export const TIME_TRAFFIC_DENSITY: Record<string, number> = { dawn: 0.7, day: 1, sunset: 1.12, night: 0.5 };

export const WEATHER_TRAFFIC_DENSITY: Record<string, number> = { clear: 1, cloudy: 1, rain: 0.82, fog: 0.7, snow: 0.7 };
