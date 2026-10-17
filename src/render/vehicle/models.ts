import type { VehicleKind } from '../../data/vehicles';
import { Build, type VehicleGeometrySet } from './build';
import { HATCH, PICKUP, SEDAN, SUV, buildCar, pickupBed, policeExtras, taxiExtras } from './cars';

type Builder = (b: Build) => void;

const BUILDERS: Partial<Record<VehicleKind, Builder>> = {
  sedan: (b) => buildCar(b, SEDAN),
  taxi: (b) => buildCar(b, SEDAN, taxiExtras),
  police: (b) => buildCar(b, SEDAN, policeExtras),
  hatch: (b) => buildCar(b, HATCH),
  suv: (b) => buildCar(b, SUV),
  pickup: (b) => buildCar(b, PICKUP, pickupBed),
};

const cache = new Map<VehicleKind, VehicleGeometrySet>();

/** Build (once) the shared geometry of a vehicle model: LOD0 and LOD1 meshes plus its light / wheel anchors. */
export function vehicleGeometry(kind: VehicleKind): VehicleGeometrySet {
  let set = cache.get(kind);
  if (set) return set;
  const build = BUILDERS[kind] ?? BUILDERS.sedan!;
  const b0 = new Build(kind, 0);
  build(b0);
  set = b0.set;
  set.lod[0] = b0.finish();
  // LOD1 collects its own (discarded) anchors.
  const b1 = new Build(kind, 1);
  build(b1);
  set.lod[1] = b1.finish();
  set.hasBeacon = set.beaconGlow.length > 0;
  cache.set(kind, set);
  return set;
}

export function clearVehicleGeometryCache(): void {
  cache.clear();
}
