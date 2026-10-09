export type VehicleKind = 'sedan' | 'hatch' | 'suv' | 'pickup' | 'van' | 'truck' | 'semi' | 'bus' | 'taxi' | 'police';

export interface VehicleArchetype {
  kind: VehicleKind;
  length: number;
  width: number;
  height: number;
  /** Relative spawn weight. */
  weight: number;
  /** Cruising speed multiplier vs lane speed. */
  speedFactor: number;
  /** Heavy vehicles keep to the slow lanes. */
  heavy: boolean;
  colors: string[];
}

const CAR_COLORS = [
  '#e9eaec', '#c9ccd1', '#9ea3aa', '#5b6068', '#2b2d31', '#121316', // white/silver/grey/black dominate real traffic
  '#e9eaec', '#c9ccd1', '#2b2d31', '#121316',
  '#8e1b1b', '#1f3f7a', '#29507f', '#3b5d3a', '#6d1f2b', '#b0b4b9', '#7a6a55', '#c46a1b', '#d8d3c4',
];

export const VEHICLES: Record<VehicleKind, VehicleArchetype> = {
  sedan: { kind: 'sedan', length: 4.7, width: 1.84, height: 1.45, weight: 30, speedFactor: 1, heavy: false, colors: CAR_COLORS },
  hatch: { kind: 'hatch', length: 4.15, width: 1.79, height: 1.48, weight: 22, speedFactor: 0.98, heavy: false, colors: CAR_COLORS },
  suv: { kind: 'suv', length: 4.75, width: 1.93, height: 1.72, weight: 18, speedFactor: 1.02, heavy: false, colors: CAR_COLORS },
  pickup: { kind: 'pickup', length: 5.35, width: 1.95, height: 1.82, weight: 6, speedFactor: 0.95, heavy: false, colors: CAR_COLORS },
  van: { kind: 'van', length: 5.4, width: 2.02, height: 2.45, weight: 8, speedFactor: 0.9, heavy: false, colors: ['#e9eaec', '#e9eaec', '#c9ccd1', '#1f3f7a', '#121316'] },
  truck: { kind: 'truck', length: 8.2, width: 2.45, height: 3.5, weight: 6, speedFactor: 0.78, heavy: true, colors: ['#e9eaec', '#1f3f7a', '#8e1b1b', '#c46a1b', '#3b5d3a'] },
  semi: { kind: 'semi', length: 16.5, width: 2.55, height: 4.0, weight: 5, speedFactor: 0.74, heavy: true, colors: ['#e9eaec', '#1f3f7a', '#8e1b1b', '#2b2d31', '#c46a1b'] },
  bus: { kind: 'bus', length: 12.2, width: 2.55, height: 3.4, weight: 3, speedFactor: 0.8, heavy: true, colors: ['#e9eaec', '#c9ccd1', '#1f3f7a', '#8e1b1b'] },
  taxi: { kind: 'taxi', length: 4.7, width: 1.84, height: 1.45, weight: 5, speedFactor: 1.05, heavy: false, colors: ['#f2c200'] },
  police: { kind: 'police', length: 4.75, width: 1.86, height: 1.5, weight: 1.2, speedFactor: 1.15, heavy: false, colors: ['#f2f3f5'] },
};

export const VEHICLE_KINDS = Object.keys(VEHICLES) as VehicleKind[];
