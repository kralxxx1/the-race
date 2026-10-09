import * as THREE from 'three';
import type { EnvDef } from '../data/environments';
import type { VehicleKind } from '../data/vehicles';
import { clamp } from '../core/math';
import type { TrafficCar } from '../world/traffic';
import type { GlowPoints } from './effects';
import type { Materials } from './materials';
import { VehicleMaterials, VehicleObject, vehicleGeometry, wheelGeometry } from './vehicleModels';
import type { WorldView } from './worldView';

const MAX_WHEELS = 520;
const _p = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _w = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _t = new THREE.Vector3();

interface Bound {
  car: TrafficCar;
  obj: VehicleObject;
}

/** Renders the traffic simulation: bodies, spinning wheels and all their lights. */
export class TrafficView {
  readonly group = new THREE.Group();
  private vm: VehicleMaterials;
  private pools = new Map<VehicleKind, VehicleObject[]>();
  private bound = new Map<number, Bound>();
  private wheels: THREE.InstancedMesh;
  private time = 0;

  constructor(
    mats: Materials,
    private world: WorldView,
    private env: EnvDef,
  ) {
    this.vm = new VehicleMaterials(mats);
    this.wheels = new THREE.InstancedMesh(wheelGeometry(), this.vm.wheel, MAX_WHEELS);
    this.wheels.count = 0;
    this.wheels.castShadow = true;
    this.wheels.frustumCulled = false;
    this.group.add(this.wheels);
  }

  spawn(car: TrafficCar): void {
    const pool = this.pools.get(car.kind) ?? [];
    let obj = pool.pop();
    if (!obj) {
      obj = new VehicleObject(vehicleGeometry(car.kind), car.color, this.vm);
      this.group.add(obj.group);
    } else {
      obj.setColor(car.color, this.vm);
    }
    obj.group.visible = true;
    this.bound.set(car.id, { car, obj });
  }

  despawn(car: TrafficCar): void {
    const b = this.bound.get(car.id);
    if (!b) return;
    b.obj.group.visible = false;
    this.bound.delete(car.id);
    const pool = this.pools.get(car.kind) ?? [];
    pool.push(b.obj);
    this.pools.set(car.kind, pool);
  }

  clear(): void {
    for (const b of [...this.bound.values()]) this.despawn(b.car);
  }

  /** Position every vehicle and push light glows. */
  update(dt: number, glow: GlowPoints, camPos: THREE.Vector3): void {
    this.time += dt;
    const road = this.world.road;
    const vm = this.vm;
    const night = this.env.headlights;
    const blink = Math.sin(this.time * Math.PI * 2 * 1.4) > 0;
    const beaconPhase = Math.floor(this.time * 7) % 2 === 0;
    let wi = 0;
    for (const { car, obj } of this.bound.values()) {
      const set = obj.set;
      this.world.worldPos(car.s, car.d, 0, _p);
      const dist2 = _p.distanceToSquared(camPos);
      const visible = dist2 < 1400 * 1400;
      obj.group.visible = visible;
      if (!visible) continue;
      const roadPitch = road.pitch(car.s);
      // Body dynamics: nose dive under braking, squat when accelerating, roll in lane changes.
      const dive = clamp(-car.accel * 0.006, -0.02, 0.035);
      const roll = car.laneChange ? clamp(Math.sin(car.yaw) * 0.6, -0.03, 0.03) : 0;
      const yaw = road.yaw(car.s) - car.yaw;
      const pitch = (car.dir === 1 ? roadPitch : -roadPitch) - dive;
      _e.set(pitch, yaw, roll * car.dir, 'YXZ');
      obj.group.position.copy(_p);
      obj.group.rotation.copy(_e);
      obj.group.updateMatrix();
      obj.group.matrixAutoUpdate = false;
      obj.group.updateMatrixWorld(true);

      // Lights
      const m = obj.meshes;
      const braking = car.braking > 0.25;
      if (m.tail) m.tail.material = braking ? vm.tailBrake : night ? vm.tailNight : vm.tailOff;
      if (m.head) m.head.material = night ? vm.headOn : vm.headOff;
      const left = car.hazard || (car.indicator !== 0 && ((car.dir === 1 && car.indicator < 0) || (car.dir === -1 && car.indicator > 0)));
      const right = car.hazard || (car.indicator !== 0 && !left);
      if (m.indL) m.indL.material = left && blink ? vm.indOn : vm.indOff;
      if (m.indR) m.indR.material = right && blink ? vm.indOn : vm.indOff;
      if (m.beacon) m.beacon.material = beaconPhase ? vm.beaconBlue : vm.beaconRed;

      // Glows (only nearby for performance)
      if (dist2 < 900 * 900) {
        const mw = obj.group.matrixWorld;
        if (night) for (const g of set.headGlow) {
          _t.copy(g).applyMatrix4(mw);
          glow.add(_t.x, _t.y, _t.z, 1.6, 1.5, 1.3, 1.9);
        }
        const tailI = braking ? 1.6 : night ? 0.7 : 0;
        if (tailI > 0) for (const g of set.tailGlow) {
          _t.copy(g).applyMatrix4(mw);
          glow.add(_t.x, _t.y, _t.z, 1.5 * tailI, 0.08 * tailI, 0.05 * tailI, braking ? 1.4 : 0.9);
        }
        if (blink) {
          if (left) for (const g of set.indicatorGlowL) {
            _t.copy(g).applyMatrix4(mw);
            glow.add(_t.x, _t.y, _t.z, 1.4, 0.7, 0.05, 0.8);
          }
          if (right) for (const g of set.indicatorGlowR) {
            _t.copy(g).applyMatrix4(mw);
            glow.add(_t.x, _t.y, _t.z, 1.4, 0.7, 0.05, 0.8);
          }
        }
        set.beaconGlow.forEach((g, i) => {
          _t.copy(g).applyMatrix4(mw);
          const on = (i === 0) === beaconPhase;
          if (on) glow.add(_t.x, _t.y, _t.z, i === 0 ? 0.3 : 2, i === 0 ? 0.6 : 0.2, i === 0 ? 2.4 : 0.2, 2.2);
        });
      }

      // Wheels
      if (dist2 < 300 * 300) {
        const spin = -(car.odometer % 1000);
        for (const w of set.wheels) {
          if (wi >= MAX_WHEELS) break;
          _q.setFromEuler(_e.set(spin / w.r, 0, 0));
          _s.set(0.24, w.r, w.r);
          _w.compose(_t.set(w.x, w.y, w.z), _q, _s);
          _m.multiplyMatrices(obj.group.matrixWorld, _w);
          this.wheels.setMatrixAt(wi++, _m);
        }
      }
    }
    this.wheels.count = wi;
    this.wheels.instanceMatrix.needsUpdate = true;
  }
}
