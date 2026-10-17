import * as THREE from 'three';
import type { EnvDef } from '../data/environments';
import { VEHICLE_KINDS } from '../data/vehicles';
import { clamp } from '../core/math';
import type { SlowZone, TrafficCar } from '../world/traffic';
import type { GlowPoints } from './effects';
import type { Materials } from './materials';
import { Fleet, newLampState, type LampState } from './vehicle/fleet';
import { vehicleGeometry } from './vehicle/models';
import { PLATE_ROWS, platesMaterial, plateLocal, type PlateRenderer } from './vehicle/plates';
import type { VehicleGeometrySet } from './vehicle/build';
import type { WorldView } from './worldView';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _p = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _w = new THREE.Matrix4();
const _pl = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _qs = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);
const _t = new THREE.Vector3();
const _c = new THREE.Color();
const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);

/** Intensity multipliers written to the lamp channels (see vehicle/materials). */
const LAMP_HEAD = 5.5;
const LAMP_HEAD_FLASH = 15;
const LAMP_TAIL_NIGHT = 0.8;
const LAMP_TAIL_DAY = 0.12;
const LAMP_BRAKE = 3.4;
const LAMP_IND = 5;
const LAMP_BEACON = 8;
const LOD1_DIST = 80;
const FAR_WHEEL_DIST = 260;
const WHEEL_DIST = 70;
const PLATE_DIST = 55;
const POOL_DIST = 170;
const MAX_POOLS = 40;
const BLINK_HZ = 1.5;

/** A traffic car taken over by the crash simulation, which positions its body group and spins its wheel nodes. */
export interface CrashVehicle {
  obj: { group: THREE.Group };
  /** One node per wheel (child of the group): the crash sim writes `rotation.x` to roll the wheel. */
  wheels: THREE.Object3D[];
  car: TrafficCar;
  set: VehicleGeometrySet;
  lamps: LampState;
  hazard: boolean;
  braking: boolean;
}

/** Soft headlight / tail-light pool laid on the road (additive, one draw call for every car). */
function poolTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const w = 64;
  const h = 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) return null;
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const v = 1 - y / (h - 1); // 0 at the car, 1 at the far end of the pool (canvas rows run top-down, uv bottom-up)
    for (let x = 0; x < w; x++) {
      const u = (x / (w - 1)) * 2 - 1;
      // Wide near the lamps, narrowing and fading with distance; hot spot a few metres ahead of the bumper.
      const spread = 0.55 + 0.45 * Math.min(1, v * 3);
      const lat = Math.exp(-Math.pow(u / spread, 2) * 1.7);
      const lon = Math.pow(Math.max(0, 1 - v), 1.5) * Math.min(1, v * 14 + 0.25);
      const a = Math.max(0, Math.min(1, lat * lon));
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

const MAX_CONES = 96;

/** Traffic cone: orange body with a retro-reflective white band, 0.7 m tall (vertex coloured). */
function coneGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const col = (g: THREE.BufferGeometry, hex: string) => {
    const c = new THREE.Color(hex);
    const n = g.attributes.position.count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      a[i * 3] = c.r;
      a[i * 3 + 1] = c.g;
      a[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  };
  parts.push(col(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 8).translate(0, 0.02, 0), '#1d1d1f'));
  parts.push(col(new THREE.CylinderGeometry(0.035, 0.17, 0.5, 10).translate(0, 0.29, 0), '#ff5a14'));
  parts.push(col(new THREE.CylinderGeometry(0.075, 0.1, 0.1, 10).translate(0, 0.4, 0), '#f1f1ec'));
  const merged = mergeGeometries(parts.map((g) => g.toNonIndexed()), false)!;
  parts.forEach((g) => g.dispose());
  merged.userData.shared = false;
  return merged;
}

/** Deterministic 0..1 hash of a car's seed and a salt, for per-car looks (metal flake, dirt, plates). */
function hash01(seed: number, salt: number): number {
  let h = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Renders the traffic simulation: instanced bodies, wheels, plates, lamps and the night light pools. */
export class TrafficView {
  readonly group = new THREE.Group();
  readonly fleet: Fleet;
  private plates: PlateRenderer;
  private pools: THREE.InstancedMesh;
  private poolTex: THREE.Texture | null;
  private cones: THREE.InstancedMesh;
  private bound = new Map<number, TrafficCar>();
  private crashed = new Set<CrashVehicle>();
  private time = 0;
  private readonly night: boolean;
  private readonly wet: boolean;
  private readonly dirtBias: number;
  private readonly lamps = newLampState();
  /** Scratch: wheel / plate world matrices are composed per frame without allocating. */
  private stats = { cars: 0, lod0: 0, pools: 0 };

  constructor(
    _mats: Materials,
    private world: WorldView,
    env: EnvDef,
  ) {
    this.fleet = new Fleet();
    this.group.add(this.fleet.group);
    this.plates = platesMaterial(160);
    this.group.add(this.plates.mesh);
    this.night = env.headlights;
    this.wet = env.wet || env.rain;
    const map = env.id.split(':')[0];
    this.dirtBias = map === 'desert' || map === 'industrial' ? 0.35 : map === 'snow' ? 0.3 : env.rain ? 0.05 : 0.12;
    // Light pools.
    this.poolTex = poolTexture();
    const mat = new THREE.MeshBasicMaterial({
      map: this.poolTex ?? undefined,
      color: 0xffffff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      toneMapped: true,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    this.pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, MAX_POOLS * 2);
    this.pools.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pools.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_POOLS * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.pools.frustumCulled = false;
    this.pools.count = 0;
    this.pools.renderOrder = 1;
    this.pools.name = 'light-pools';
    this.group.add(this.pools);
    this.cones = new THREE.InstancedMesh(coneGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 }), MAX_CONES);
    this.cones.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.cones.frustumCulled = false;
    this.cones.count = 0;
    this.cones.castShadow = true;
    this.cones.name = 'cones';
    this.group.add(this.cones);
    // Build every vehicle type up front so a first sighting never causes a frame hitch.
    for (const k of VEHICLE_KINDS) vehicleGeometry(k);
    this.fleet.prebuild();
  }

  /** Draw one of each model into a tiny target so geometry is uploaded and every shader compiled before play. */
  prewarm(renderer: THREE.WebGLRenderer, camera: THREE.Camera, scene: THREE.Scene): void {
    const f = this.fleet;
    f.begin();
    const col = new THREE.Color('#999999');
    const lamp = newLampState();
    lamp.head = 1;
    lamp.tail = 1;
    lamp.indL = 1;
    lamp.beaconA = 1;
    lamp.aux = 1;
    _m.identity();
    VEHICLE_KINDS.forEach((k, i) => {
      _m.makeTranslation((i - VEHICLE_KINDS.length / 2) * 4, 0, -20);
      f.bucket(k, 0).push(_m, col, 0.5, 0.2, 0, lamp);
      f.bucket(k, 1).push(_m, col, 0.5, 0.2, 0, lamp);
      for (const type of ['car', 'truck', 'far'] as const) f.addWheel(type, _m);
    });
    f.end();
    this.plates.begin();
    this.plates.add(0, 1, -20, 1, 0.5, 0.11, 0, 0);
    this.plates.commit();
    this.pools.count = 1;
    this.pools.setMatrixAt(0, _m.makeTranslation(0, 0.1, -10));
    this.pools.instanceMatrix.needsUpdate = true;
    const rt = new THREE.WebGLRenderTarget(4, 4);
    const prev = renderer.getRenderTarget();
    const cam = camera.clone() as THREE.PerspectiveCamera;
    cam.position.set(0, 3, 0);
    cam.lookAt(0, 0, -20);
    // The group is already part of the scene; every bucket is visible for this one draw.
    renderer.setRenderTarget(rt);
    renderer.render(scene, cam);
    renderer.setRenderTarget(prev);
    rt.dispose();
    f.begin();
    f.end();
    this.plates.begin();
    this.plates.commit();
    this.pools.count = 0;
  }

  spawn(car: TrafficCar): void {
    this.bound.set(car.id, car);
  }

  despawn(car: TrafficCar): void {
    this.bound.delete(car.id);
  }

  clear(): void {
    this.bound.clear();
  }

  /** Cars currently drawn at full detail (debug / budgets). */
  get debug(): { cars: number; lod0: number; pools: number; tris: number; wheels: number } {
    return { ...this.stats, tris: this.fleet.stats.tris, wheels: this.fleet.stats.wheels };
  }

  // ───────────────────────────── crash proxy ─────────────────────────────

  /**
   * Take a traffic car out of the normal traffic pass so the crash simulation can drive its body
   * (and its wheel nodes) directly. Returns null when the car has no visual yet.
   */
  detachForCrash(car: TrafficCar): CrashVehicle | null {
    if (!this.bound.has(car.id)) return null;
    this.bound.delete(car.id);
    const set = vehicleGeometry(car.kind);
    const group = new THREE.Group();
    group.matrixAutoUpdate = true;
    const wheels = set.wheels.map((w) => {
      const n = new THREE.Object3D();
      n.position.set(w.x, w.y, w.z);
      group.add(n);
      return n;
    });
    const cv: CrashVehicle = { obj: { group }, wheels, car, set, lamps: newLampState(), hazard: false, braking: false };
    this.crashed.add(cv);
    return cv;
  }

  /** Brake / hazard lights and their glows for a crashed vehicle; call once per frame. */
  crashVehicleLights(cv: CrashVehicle, hazard: boolean, braking: boolean, glow: GlowPoints): void {
    cv.hazard = hazard;
    cv.braking = braking;
    const blink = Math.sin(this.time * Math.PI * 2 * BLINK_HZ) > 0;
    const l = cv.lamps;
    l.head = this.night ? LAMP_HEAD : 0;
    l.tail = braking ? LAMP_BRAKE : this.night ? LAMP_TAIL_NIGHT : LAMP_TAIL_DAY;
    const on = hazard && blink;
    l.indL = l.indR = on ? LAMP_IND : 0;
    cv.obj.group.updateMatrixWorld(true);
    this.pushGlows(cv.set, cv.obj.group.matrixWorld, l, glow, 1);
  }

  /** Return a crash proxy (after a respawn or at the end of the run); the car is not drawn any more. */
  releaseCrashVehicle(cv: CrashVehicle): void {
    this.crashed.delete(cv);
    for (const w of cv.wheels) cv.obj.group.remove(w);
  }

  // ─────────────────────────────── per frame ──────────────────────────────

  private pushGlows(set: VehicleGeometrySet, mw: THREE.Matrix4, l: LampState, glow: GlowPoints, scale: number): void {
    if (l.head > 0.5) {
      const flash = l.head > LAMP_HEAD + 1;
      for (const g of set.headGlow) {
        _t.copy(g).applyMatrix4(mw);
        glow.add(_t.x, _t.y, _t.z, 1.6, 1.5, 1.3, (flash ? 3.2 : 1.9) * scale);
      }
    }
    if (l.tail > 0.1) {
      const k = clamp(l.tail / LAMP_BRAKE, 0.15, 1.2);
      const braking = l.tail > 1.5;
      for (const g of set.tailGlow) {
        _t.copy(g).applyMatrix4(mw);
        glow.add(_t.x, _t.y, _t.z, 1.9 * k, 0.07 * k, 0.04 * k, (braking ? 1.5 : 0.9) * scale);
      }
    }
    if (l.indL > 0.5) {
      for (const g of set.indicatorGlowL) {
        _t.copy(g).applyMatrix4(mw);
        glow.add(_t.x, _t.y, _t.z, 1.5, 0.75, 0.05, 0.8 * scale);
      }
    }
    if (l.indR > 0.5) {
      for (const g of set.indicatorGlowR) {
        _t.copy(g).applyMatrix4(mw);
        glow.add(_t.x, _t.y, _t.z, 1.5, 0.75, 0.05, 0.8 * scale);
      }
    }
    if (l.beaconA > 0.5 || l.beaconB > 0.5) {
      set.beaconGlow.forEach((g, i) => {
        if ((i === 0 ? l.beaconA : l.beaconB) < 0.5) return;
        _t.copy(g).applyMatrix4(mw);
        // First anchor is blue, second red (police) / blue (ambulance); colours are close enough at this size.
        glow.add(_t.x, _t.y, _t.z, i === 0 ? 0.25 : 2.2, i === 0 ? 0.55 : 0.2, i === 0 ? 2.6 : 0.2, 2.4 * scale);
      });
    }
  }

  /** Lamp intensities of a car this frame. */
  private lampState(car: TrafficCar, blink: boolean, beaconPhase: boolean, out: LampState): LampState {
    const night = this.night;
    out.head = car.flash > 0 ? LAMP_HEAD_FLASH : night ? LAMP_HEAD : 0;
    // Day: running lights (LED strip) on a share of cars; night: markers / DRL on everything with lights.
    out.aux = night ? 3 : car.drl ? 2.2 : 0;
    out.tail = car.braking > 0.25 ? LAMP_TAIL_NIGHT + (LAMP_BRAKE - LAMP_TAIL_NIGHT) * Math.min(1, car.braking * 1.15) : night ? LAMP_TAIL_NIGHT : car.drl ? LAMP_TAIL_DAY : 0;
    // Road-space indicator: -1 = towards smaller d, which is the driver's left when driving along +s.
    const left = car.hazard || (car.indicator !== 0 && ((car.dir === 1 && car.indicator < 0) || (car.dir === -1 && car.indicator > 0)));
    const right = car.hazard || (car.indicator !== 0 && !left);
    out.indL = left && blink ? LAMP_IND : 0;
    out.indR = right && blink ? LAMP_IND : 0;
    out.reverse = 0;
    out.beaconA = car.beacon && beaconPhase ? LAMP_BEACON : 0;
    out.beaconB = car.beacon && !beaconPhase ? LAMP_BEACON : 0;
    return out;
  }

  /** Position every vehicle, write the instance buffers and push light glows. */
  update(dt: number, glow: GlowPoints, camPos: THREE.Vector3, zones?: readonly SlowZone[]): void {
    this.time += dt;
    const road = this.world.road;
    const fleet = this.fleet;
    const blink = Math.sin(this.time * Math.PI * 2 * BLINK_HZ) > 0;
    const beaconPhase = Math.floor(this.time * 6) % 2 === 0;
    fleet.begin();
    this.plates.begin();
    let poolN = 0;
    let n0 = 0;
    let nCars = 0;
    const poolMesh = this.pools;
    const poolCol = poolMesh.instanceColor as THREE.InstancedBufferAttribute;
    const poolHot = this.wet ? 1.5 : 1;

    for (const car of this.bound.values()) {
      this.world.worldPos(car.s, car.d, 0, _p);
      const dist2 = _p.distanceToSquared(camPos);
      if (dist2 > 1400 * 1400) continue;
      const dist = Math.sqrt(dist2);
      const roadPitch = road.pitch(car.s);
      // Body dynamics: nose dive under braking, squat when accelerating, roll in lane changes.
      const dive = clamp(-car.accel * 0.006, -0.02, 0.035);
      const roll = car.laneChange ? clamp(Math.sin(car.yaw) * 0.6, -0.03, 0.03) : 0;
      const rel = car.yaw - (car.dir === 1 ? 0 : Math.PI);
      const yaw = road.yaw(car.s) - car.yaw;
      const pitch = (car.dir === 1 ? roadPitch : -roadPitch) - dive;
      _e.set(pitch, yaw, roll * car.dir, 'YXZ');
      _q.setFromEuler(_e);
      _m.compose(_p, _q, _one);
      const lod: 0 | 1 = dist < LOD1_DIST ? 0 : 1;
      const lamps = this.lampState(car, blink, beaconPhase, this.lamps);
      const set = vehicleGeometry(car.kind);
      const metal = hash01(car.seed, 1) < 0.58 ? 0.55 + hash01(car.seed, 2) * 0.4 : 0.1;
      const dirt = clamp(this.dirtBias + (hash01(car.seed, 3) - 0.35) * 0.5 + (car.arch.heavy ? 0.15 : 0), 0, 0.85);
      _c.set(car.color);
      if (!fleet.bucket(car.kind, lod).push(_m, _c, metal, dirt, Math.floor(hash01(car.seed, 4) * PLATE_ROWS), lamps)) continue;
      nCars++;
      if (lod === 0) n0++;

      // Glows and light pools only nearby for performance.
      if (dist < 700) this.pushGlows(set, _m, lamps, glow, 1);

      // Wheels: spinning, with the steered pair following the lane change.
      if (dist < FAR_WHEEL_DIST) {
        const spin = -(car.odometer % 1000);
        const steer = -clamp(rel, -0.2, 0.2) * 0.9;
        const type = dist < WHEEL_DIST ? undefined : ('far' as const);
        for (const w of set.wheels) {
          _e.set(spin / w.r, w.steer ? steer : 0, 0, 'YXZ');
          _qs.setFromEuler(_e);
          _w.compose(_t.set(w.x, w.y, w.z), _qs, _s.set(w.w, w.r, w.r));
          _pl.multiplyMatrices(_m, _w);
          fleet.addWheel(type ?? w.type, _pl);
        }
      }
      if (dist < PLATE_DIST) {
        for (const p of set.plates) {
          plateLocal(p, _w);
          _pl.multiplyMatrices(_m, _w);
          this.plates.addMatrix(_pl, (Math.floor(hash01(car.seed, 5) * PLATE_ROWS) + (p.face === 1 ? 0 : 3)) % PLATE_ROWS);
        }
      }

      // Projected pools of light on the road ahead of lit headlamps and behind lit tail lamps.
      if (poolN < MAX_POOLS * 2 - 1 && dist < POOL_DIST && (lamps.head > 0.5 || lamps.tail > 1.2)) {
        const fade = 1 - clamp((dist - POOL_DIST * 0.55) / (POOL_DIST * 0.45), 0, 1);
        if (lamps.head > 0.5) {
          const flash = lamps.head > LAMP_HEAD + 1;
          const len = flash ? 34 : 24;
          const wid = flash ? 9 : 7.5;
          _q.setFromAxisAngle(AXIS_X, -Math.PI / 2);
          _w.compose(_t.set(0, 0.05, -(car.length / 2 + len / 2 - 1.5)), _q, _s.set(wid, len, 1));
          _pl.multiplyMatrices(_m, _w);
          poolMesh.setMatrixAt(poolN, _pl);
          const k = (flash ? 0.62 : 0.34) * fade * poolHot;
          poolCol.setXYZ(poolN, 1.0 * k, 0.9 * k, 0.72 * k);
          poolN++;
        }
        if (lamps.tail > 1.2 && poolN < MAX_POOLS * 2) {
          const k = Math.min(1, (lamps.tail - 0.4) / 3) * 0.42 * fade * poolHot;
          _q.setFromAxisAngle(AXIS_X, -Math.PI / 2);
          _qs.setFromAxisAngle(AXIS_Y, Math.PI);
          _qs.multiply(_q);
          _w.compose(_t.set(0, 0.05, car.length / 2 + 3.2), _qs, _s.set(car.width * 1.7, 6.5, 1));
          _pl.multiplyMatrices(_m, _w);
          poolMesh.setMatrixAt(poolN, _pl);
          poolCol.setXYZ(poolN, 1.0 * k, 0.07 * k, 0.04 * k);
          poolN++;
        }
      }
    }

    // Crash proxies keep their own matrices (set by the crash simulation).
    for (const cv of this.crashed) {
      cv.obj.group.updateMatrixWorld(true);
      const mw = cv.obj.group.matrixWorld;
      _p.setFromMatrixPosition(mw);
      const car = cv.car;
      const metal = hash01(car.seed, 1) < 0.58 ? 0.55 + hash01(car.seed, 2) * 0.4 : 0.1;
      const dirt = clamp(this.dirtBias + (hash01(car.seed, 3) - 0.35) * 0.5, 0, 0.85);
      _c.set(car.color);
      const dist = _p.distanceTo(camPos);
      const lod: 0 | 1 = dist < LOD1_DIST ? 0 : 1;
      cv.lamps.aux = this.night ? 3 : 0;
      fleet.bucket(car.kind, lod).push(mw, _c, metal, dirt, Math.floor(hash01(car.seed, 4) * PLATE_ROWS), cv.lamps);
      for (let i = 0; i < cv.wheels.length; i++) {
        const w = cv.set.wheels[i];
        cv.wheels[i].updateMatrixWorld(true);
        _w.makeScale(w.w, w.r, w.r);
        _pl.multiplyMatrices(cv.wheels[i].matrixWorld, _w);
        fleet.addWheel(dist < WHEEL_DIST ? w.type : 'far', _pl);
      }
      if (dist < PLATE_DIST) {
        for (const p of cv.set.plates) {
          plateLocal(p, _w);
          _pl.multiplyMatrices(mw, _w);
          this.plates.addMatrix(_pl, (Math.floor(hash01(car.seed, 5) * PLATE_ROWS) + (p.face === 1 ? 0 : 3)) % PLATE_ROWS);
        }
      }
    }

    // Cones of roadworks zones near the camera.
    let coneN = 0;
    if (zones) {
      for (const z of zones) {
        for (const c of z.cones) {
          if (coneN >= MAX_CONES) break;
          this.world.worldPos(c.s, c.d, 0, _p);
          if (_p.distanceToSquared(camPos) > 450 * 450) continue;
          _e.set(0, road.yaw(c.s), 0);
          _q.setFromEuler(_e);
          this.cones.setMatrixAt(coneN++, _m.compose(_p, _q, _one));
        }
      }
    }
    this.cones.count = coneN;
    this.cones.visible = coneN > 0;
    if (coneN > 0) this.cones.instanceMatrix.needsUpdate = true;

    fleet.end();
    this.plates.commit();
    poolMesh.count = poolN;
    poolMesh.visible = poolN > 0;
    if (poolN > 0) {
      poolMesh.instanceMatrix.needsUpdate = true;
      poolCol.needsUpdate = true;
    }
    this.stats.cars = nCars;
    this.stats.lod0 = n0;
    this.stats.pools = poolN;
  }

  /** Release GPU resources owned by this view (shared model geometry stays cached). */
  dispose(): void {
    this.fleet.dispose();
    this.plates.dispose();
    this.pools.geometry.dispose();
    (this.pools.material as THREE.Material).dispose();
    this.pools.dispose();
    this.poolTex?.dispose();
    this.cones.geometry.dispose();
    (this.cones.material as THREE.Material).dispose();
    this.cones.dispose();
    this.pools.removeFromParent();
    this.group.clear();
    this.bound.clear();
    this.crashed.clear();
  }
}
