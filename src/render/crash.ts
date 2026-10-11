import * as THREE from 'three';
import { DEBRIS, DebrisField } from '../physics/crash/debris';
import { v3, type V3 } from '../physics/crash/math';
import {
  buildCrash, SEGMENT_IDS, vehicleMass, type CarInit, type CrashInit, type CrashScene, type RiderPose, type SegmentId,
} from '../physics/crash/scenario';
import type { Barrier } from '../physics/crash/world';
import type { BikeModel } from './bikeModel';
import type { Smoke, SkidMarks, Sparks } from './effects';
import type { RiderModel, SegmentPose } from './riderModel';
import type { CrashVehicle, TrafficView } from './trafficView';
import type { TrafficCar } from '../world/traffic';
import type { GlowPoints } from './effects';

/** Everything the crash needs to know about the moment of impact (all in rebased world space). */
export interface CrashStart {
  /** World velocity of the bike (m/s). */
  vel: THREE.Vector3;
  /** Bike rates: pitch (wheelie), yaw (turning right +) and roll (lean right +), rad/s. */
  pitchRate: number;
  yawRate: number;
  leanRate: number;
  seed: number;
  /** 1 dry tarmac … ~0.35 snow. */
  grip: number;
  /** Hit traffic car (its visual proxy is taken over) and where it is. */
  car: { car: TrafficCar; pos: THREE.Vector3; yaw: number; speed: number } | null;
  /** Guard-rail plane for barrier hits. */
  barrier: { p: THREE.Vector3; n: THREE.Vector3 } | null;
  /** Total bike mass incl. fluids (kg). */
  bikeMass: number;
  ground: (x: number, z: number) => number;
  /** Livery colour of the plastics. */
  plastic: THREE.Color;
}

export interface CrashEffects {
  sparks: Sparks;
  smoke: Smoke;
  skid: SkidMarks;
}

export type ImpactKind = 'bike' | 'rider' | 'car' | 'barrier';

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _sv = v3();
const _vv = v3();

function toV3(o: V3, v: THREE.Vector3): V3 {
  o.x = v.x;
  o.y = v.y;
  o.z = v.z;
  return o;
}

/** Instanced shards: opaque plastics / chrome and translucent glass, coloured per piece. */
class DebrisMeshes {
  readonly solid: THREE.InstancedMesh;
  readonly glass: THREE.InstancedMesh;
  private tmp = new THREE.Matrix4();
  private col = new THREE.Color();

  constructor(private field: DebrisField) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const solidMat = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.25, vertexColors: false });
    const glassMat = new THREE.MeshStandardMaterial({ roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55, depthWrite: false, emissive: '#400808', emissiveIntensity: 0.6 });
    this.solid = new THREE.InstancedMesh(geo, solidMat, field.max);
    this.glass = new THREE.InstancedMesh(geo, glassMat, field.max);
    for (const m of [this.solid, this.glass]) {
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
    this.solid.castShadow = true;
  }

  sync(): void {
    const f = this.field;
    let ns = 0;
    let ng = 0;
    for (let i = 0; i < f.count; i++) {
      const k = f.kind[i];
      const isGlass = k === DEBRIS.glass || k === DEBRIS.lens;
      const mesh = isGlass ? this.glass : this.solid;
      const idx = isGlass ? ng++ : ns++;
      _q.set(f.quat[i * 4], f.quat[i * 4 + 1], f.quat[i * 4 + 2], f.quat[i * 4 + 3]);
      _p.set(f.pos[i * 3], f.pos[i * 3 + 1], f.pos[i * 3 + 2]);
      _s.set(f.size[i * 3], f.size[i * 3 + 1], f.size[i * 3 + 2]);
      mesh.setMatrixAt(idx, this.tmp.compose(_p, _q, _s));
      if (k === DEBRIS.chrome) this.col.setRGB(0.75, 0.78, 0.82);
      else if (k === DEBRIS.lens) this.col.setRGB(0.9, 0.04, 0.03);
      else this.col.setRGB(f.color[i * 3], f.color[i * 3 + 1], f.color[i * 3 + 2]);
      mesh.setColorAt(idx, this.col);
    }
    this.solid.count = ns;
    this.glass.count = ng;
    this.solid.instanceMatrix.needsUpdate = true;
    this.glass.instanceMatrix.needsUpdate = true;
    if (this.solid.instanceColor) this.solid.instanceColor.needsUpdate = true;
    if (this.glass.instanceColor) this.glass.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.solid.geometry.dispose();
    (this.solid.material as THREE.Material).dispose();
    (this.glass.material as THREE.Material).dispose();
    this.solid.dispose();
    this.glass.dispose();
  }
}

/**
 * Visual side of a crash: builds the rigid-body scene from the models at the instant of impact,
 * drives bike, rider ragdoll and the hit vehicle from the solver, and turns its contacts into
 * sparks, smoke, debris, skid marks and camera/audio hooks. `restart()` replays the identical
 * crash (the solver is deterministic) for the cinematic replay.
 */
export class CrashSim {
  private scene!: CrashScene;
  private init!: CrashInit;
  private debris: DebrisField;
  private debrisView: DebrisMeshes;
  private t = 0;
  private vehicle: CrashVehicle | null = null;
  private wheelSpin = 0;
  private riderBuf = {} as Record<SegmentId, SegmentPose>;
  private poseGet: (id: SegmentId, p: THREE.Vector3, q: THREE.Quaternion) => void;
  private slideSeen = 0;
  private cooldown = new Float32Array(4);
  private heading = 0;
  private bikeSteer = 0;
  private bikeWheel = 0;
  private plasticRgb: [number, number, number];
  private carRgb: [number, number, number] = [0.8, 0.8, 0.8];
  /** Head camera hooks. */
  readonly head = new THREE.Vector3();
  readonly headQuat = new THREE.Quaternion();
  /** Rider torso (sky/shadow follow target, camera hint). */
  readonly focus = new THREE.Vector3();
  /** Cinematic orbit centre: the rider, pulled towards the hit vehicle so both stay in frame. */
  readonly orbit = new THREE.Vector3();
  done = false;
  /** Called with (strength 0..1, what hit) for secondary impact sounds. */
  onImpact: ((strength: number, kind: ImpactKind) => void) | null = null;
  /** Largest impact speed seen during the last update (m/s): camera trauma. */
  lastImpact = 0;

  constructor(
    private bikeModel: BikeModel,
    private riderModel: RiderModel,
    private root: THREE.Object3D,
    private traffic: TrafficView,
    private effects: CrashEffects,
    private start: CrashStart,
  ) {
    for (const id of SEGMENT_IDS) this.riderBuf[id] = { x: new THREE.Vector3(), q: new THREE.Quaternion() };
    this.debris = new DebrisField(110, start.seed);
    this.debrisView = new DebrisMeshes(this.debris);
    root.add(this.debrisView.solid, this.debrisView.glass);
    this.plasticRgb = [start.plastic.r, start.plastic.g, start.plastic.b];
    this.poseGet = (id, p, q) => {
      const b = this.scene.riders[id];
      p.set(b.x.x, b.x.y, b.x.z);
      q.set(b.q.x, b.q.y, b.q.z, b.q.w);
    };
    this.capture();
    this.rebuild();
    this.heading = Math.atan2(-start.vel.x, -start.vel.z);
  }

  /** Detach models from their riding pose and record the initial rigid-body state. */
  private capture(): void {
    const bike = this.bikeModel;
    const rm = this.riderModel;
    const s = this.start;
    bike.root.updateMatrixWorld(true);
    // Bike: the chassis frame becomes the model root so the solver's body frame matches bike space.
    _m.copy(bike.chassis.matrixWorld);
    _m.decompose(_p, _q, _s);
    this.bikeSteer = -bike.steer.rotation.y;
    this.bikeWheel = Math.hypot(s.vel.x, s.vel.z) / bike.frame.Rr;
    // Rider segments → world.
    rm.root.updateMatrixWorld(true);
    rm.captureSegments(this.riderBuf);
    const rw = rm.root.matrixWorld;
    const rq = _q2.setFromRotationMatrix(rw);
    const pose = {} as RiderPose;
    for (const id of SEGMENT_IDS) {
      const seg = this.riderBuf[id];
      _v.copy(seg.x).applyMatrix4(rw);
      const q = seg.q.clone().premultiply(rq);
      pose[id] = { x: v3(_v.x, _v.y, _v.z), q: { x: q.x, y: q.y, z: q.z, w: q.w } };
    }
    // Reparent: bike root takes the chassis world transform; rider lives in the world.
    this.root.add(bike.root);
    bike.root.position.copy(_p);
    bike.root.quaternion.copy(_q);
    bike.root.scale.set(1, 1, 1);
    this.root.add(rm.root);
    rm.root.position.set(0, 0, 0);
    rm.root.quaternion.identity();
    rm.root.scale.set(1, 1, 1);
    this.applyBikeVisual(0.016);
    // Angular velocity of the bike in world space.
    const wl = new THREE.Vector3(s.pitchRate, -s.yawRate, -s.leanRate).applyQuaternion(_q);
    const f = bike.frame;
    const bq = _q;
    let carInit: CarInit | undefined;
    let carRef: CrashStart['car'] = s.car;
    if (carRef) {
      const cv = this.traffic.detachForCrash(carRef.car);
      if (cv) {
        this.vehicle = cv;
        const a = carRef.car.arch;
        const cq = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, carRef.yaw, 0));
        const fwd = new THREE.Vector3(-Math.sin(carRef.yaw), 0, -Math.cos(carRef.yaw)).multiplyScalar(carRef.speed);
        carInit = {
          x: v3(carRef.pos.x, carRef.pos.y, carRef.pos.z),
          q: { x: cq.x, y: cq.y, z: cq.z, w: cq.w },
          v: v3(fwd.x, 0, fwd.z),
          mass: vehicleMass(carRef.car.kind),
          length: a.length,
          width: a.width,
          height: a.height,
          heavy: a.heavy,
        };
        const c = new THREE.Color(carRef.car.color);
        this.carRgb = [c.r, c.g, c.b];
      } else carRef = null;
    }
    let barrier: Barrier | undefined;
    if (s.barrier) {
      barrier = { p: v3(s.barrier.p.x, s.barrier.p.y, s.barrier.p.z), n: v3(s.barrier.n.x, 0, s.barrier.n.z), height: 0.85, mu: 0.5 };
    }
    this.init = {
      seed: s.seed,
      ground: s.ground,
      grip: s.grip,
      bike: {
        x: v3(_p.x, _p.y, _p.z),
        q: { x: bq.x, y: bq.y, z: bq.z, w: bq.w },
        v: toV3(v3(), s.vel),
        w: v3(wl.x, wl.y, wl.z),
        mass: s.bikeMass,
        wheelbase: f.L,
        frontR: f.Rf,
        rearR: f.Rr,
        seatY: f.seatY,
      },
      rider: pose,
      riderVel: toV3(v3(), s.vel),
      car: carInit,
      barrier,
    };
  }

  /** (Re)create the rigid-body scene from the stored initial state. */
  private rebuild(): void {
    // buildCrash mutates nothing in `init`, but the solver's back-out moves bodies: clone positions.
    this.scene = buildCrash(this.init);
    this.t = 0;
    this.done = false;
    this.cooldown.fill(0);
    this.slideSeen = 0;
    this.debris.reseed(this.init.seed);
    this.sync();
  }

  /** Replay the same crash from the start (deterministic). */
  restart(): void {
    this.effects.sparks.clear();
    this.effects.smoke.clear();
    this.effects.skid.clear();
    this.rebuild();
    this.debrisView.sync();
  }

  get kind(): CrashScene['kind'] {
    return this.scene.kind;
  }

  get time(): number {
    return this.t;
  }

  /** Travel direction at impact (three.js yaw) for the cinematic camera. */
  get yaw(): number {
    return this.heading;
  }

  get settled(): boolean {
    return this.scene.world.settled;
  }

  get bikeSpeed(): number {
    return Math.hypot(this.scene.bike.v.x, this.scene.bike.v.y, this.scene.bike.v.z);
  }

  get riderSpeed(): number {
    const b = this.scene.riders.torso;
    return Math.hypot(b.v.x, b.v.y, b.v.z);
  }

  get hasCar(): boolean {
    return this.vehicle !== null;
  }

  get carPosition(): THREE.Vector3 | null {
    const c = this.scene.car;
    return c ? _p.set(c.x.x, c.x.y, c.x.z) : null;
  }

  /** Per-frame: step the solver, drive the models, emit effects. Returns the strongest impact (m/s). */
  update(dt: number): number {
    this.lastImpact = 0;
    const sc = this.scene;
    sc.update(dt);
    this.t += dt;
    this.emitEffects(dt);
    this.debris.step(dt, this.start.ground);
    this.debrisView.sync();
    this.sync();
    this.applyBikeVisual(dt);
    if (this.t > 5 && sc.world.settled) this.done = true;
    return this.lastImpact;
  }

  // ───────────────────────────── models ─────────────────────────────

  private sync(): void {
    const sc = this.scene;
    const bike = this.bikeModel;
    // Bike root = body frame minus the centre-of-mass offset.
    sc.originOf(sc.bike, sc.bikeCom, _sv);
    bike.root.position.set(_sv.x, _sv.y, _sv.z);
    bike.root.quaternion.set(sc.bike.q.x, sc.bike.q.y, sc.bike.q.z, sc.bike.q.w);
    this.riderModel.applySegments(this.poseGet);
    const t = sc.riders.torso;
    this.focus.set(t.x.x, t.x.y, t.x.z);
    this.orbit.copy(this.focus);
    if (sc.car) {
      const dx = sc.car.x.x - t.x.x;
      const dy = sc.car.x.y - t.x.y;
      const dz = sc.car.x.z - t.x.z;
      if (dx * dx + dy * dy + dz * dz < 14 * 14) this.orbit.add(_v.set(dx, dy, dz).multiplyScalar(0.3));
    }
    const h = sc.riders.head;
    this.head.set(h.x.x, h.x.y, h.x.z);
    this.headQuat.set(h.q.x, h.q.y, h.q.z, h.q.w);
    const cv = this.vehicle;
    if (cv && sc.car) {
      sc.originOf(sc.car, sc.carCom, _vv);
      cv.obj.group.position.set(_vv.x, _vv.y, _vv.z);
      cv.obj.group.quaternion.set(sc.car.q.x, sc.car.q.y, sc.car.q.z, sc.car.q.w);
      cv.obj.group.updateMatrixWorld(true);
    }
  }

  private applyBikeVisual(dt: number): void {
    // Wheels keep turning while they have grip, then coast down.
    this.bikeWheel *= Math.exp(-0.55 * dt);
    this.bikeModel.update({
      lean: 0,
      pitch: 0,
      steer: this.bikeSteer,
      wheelSpeed: this.bikeWheel,
      frontComp: 0,
      rearComp: 0,
      brake: 0,
      clutch: 0,
      headlight: false,
      dt,
    });
    // The wheel/suspension rig resets the root's children only; the root itself is driven by the solver.
  }

  /** Brake lights + hazards of the hit vehicle (call once per frame). */
  updateCarLights(traffic: TrafficView, glow: GlowPoints, dt: number): void {
    const cv = this.vehicle;
    const car = this.scene.car;
    if (!cv || !car) return;
    traffic.crashVehicleLights(cv, this.t > 0.25, car.muLong > 0.2, glow);
    // Wheels roll while rolling, lock when braking hard.
    const speed = Math.hypot(car.v.x, car.v.z);
    const lock = Math.min(1, Math.max(0, (car.muLong - 0.3) / 0.35));
    this.wheelSpin -= (speed * dt * (1 - lock)) / 0.33;
    for (const w of cv.wheels) w.rotation.x = this.wheelSpin;
  }

  // ───────────────────────────── effects ─────────────────────────────

  private emitEffects(dt: number): void {
    const w = this.scene.world;
    const { sparks, smoke, skid } = this.effects;
    const bike = this.scene.bike;
    for (let i = 0; i < this.cooldown.length; i++) this.cooldown[i] = Math.max(0, this.cooldown[i] - dt);
    // Impacts: debris, dust, sparks, camera shake, audio.
    for (let i = 0; i < w.eventCount; i++) {
      const e = w.events[i];
      const sp = e.speed;
      this.lastImpact = Math.max(this.lastImpact, sp);
      _sv.x = e.a.v.x;
      _sv.y = e.a.v.y;
      _sv.z = e.a.v.z;
      const wall = e.kind === 1;
      const carHit = e.b !== null && (e.b.kind === 'car' || e.a.kind === 'car');
      const slot = wall ? 3 : carHit ? 2 : e.a.kind === 'bike' ? 0 : 1;
      if (sp > 2.2 && this.cooldown[slot] <= 0) {
        this.cooldown[slot] = 0.09;
        this.onImpact?.(Math.min(1, sp / 28), wall ? 'barrier' : carHit ? 'car' : e.a.kind === 'bike' ? 'bike' : 'rider');
      }
      if (e.a.kind === 'bike' || wall || carHit) {
        if (sp > 4) this.shards(e.p, _sv, sp, e.a.kind === 'bike' || wall, carHit);
        if (sp > 3) sparks.emit(e.p.x, e.p.y, e.p.z, _sv.x * 0.25, 1.2, _sv.z * 0.25, Math.min(26, Math.floor(sp * 0.9)), 2 + sp * 0.12);
      }
      if (sp > 3.5) smoke.emit(e.p.x, e.p.y + 0.1, e.p.z, _sv.x * 0.08, 0.8, _sv.z * 0.08, { n: Math.min(5, 1 + Math.floor(sp / 5)), size: 0.8 + sp * 0.03, life: 1.8, alpha: 0.32, shade: 0.7 + Math.min(0.3, sp * 0.01), spread: 1.8 });
    }
    // Sliding contacts: sparks from metal, dust from leather, tyre smoke and marks from wheels.
    let seen = 0;
    for (let i = 0; i < w.slideCount; i++) {
      const s = w.slides[i];
      const a = s.a;
      const v = s.speed;
      const id = a.kind === 'bike' ? 0 : a.kind === 'car' ? 4 + (i & 3) : a.name === 'head' ? 2 : 1;
      seen |= 1 << id;
      const gx = s.p.x;
      const gy = s.p.y;
      const gz = s.p.z;
      if (a.kind === 'bike') {
        if (v > 3 && s.kind !== 2) sparks.emit(gx, gy + 0.03, gz, s.dir.x * v * 0.5, 0.6, s.dir.z * v * 0.5, Math.min(5, 1 + Math.floor(v / 7)), 1.4 + v * 0.05);
        skid.stroke(id, gx, gy, gz, 0.07, 0.35, 0.22);
        if (v > 8 && (i & 1) === 0) smoke.emit(gx, gy + 0.05, gz, 0, 0.4, 0, { size: 0.55, life: 1.1, alpha: 0.22, shade: 0.8 });
      } else if (a.kind === 'rider') {
        skid.stroke(id, gx, gy, gz, id === 2 ? 0.16 : 0.26, 0.22, 0.1);
        if (v > 5 && (i & 1) === 0) smoke.emit(gx, gy + 0.05, gz, s.dir.x * v * 0.1, 0.5, s.dir.z * v * 0.1, { size: 0.7, life: 1.3, alpha: 0.26, shade: 0.78, spread: 1.2 });
      } else if (a.kind === 'car') {
        if (v > 3.5) {
          skid.stroke(id, gx, gy, gz, 0.22, 0.6, 0.02);
          if ((i & 1) === 0) smoke.emit(gx, gy + 0.05, gz, s.dir.x * v * 0.12, 0.7, s.dir.z * v * 0.12, { size: 0.9, life: 1.8, alpha: 0.3, shade: 1.05, spread: 1.4 });
        }
      }
    }
    for (let id = 0; id < 8; id++) if (!(seen & (1 << id)) && (this.slideSeen & (1 << id))) skid.lift(id);
    this.slideSeen = seen;
    void bike;
  }

  /** Throw plastic fairing pieces, mirror glass, bumper bits and lamp lenses from an impact. */
  private shards(p: V3, vel: V3, speed: number, fromBike: boolean, car: boolean): void {
    const d = this.debris;
    const n = Math.min(24, 4 + Math.floor(speed * 0.8));
    if (fromBike) d.burst(p, vel, n, DEBRIS.plastic, 3 + speed * 0.2, 2 + speed * 0.1, 0.09, this.plasticRgb);
    if (fromBike) d.burst(p, vel, Math.ceil(n * 0.3), DEBRIS.dark, 3 + speed * 0.15, 2, 0.07, [0.05, 0.05, 0.06]);
    if (fromBike && speed > 8) d.burst(p, vel, 1 + (speed > 18 ? 1 : 0), DEBRIS.chrome, 4, 2.5, 0.07, [1, 1, 1]);
    if (car) {
      d.burst(p, vel, Math.ceil(n * 0.4), DEBRIS.plastic, 2.5 + speed * 0.12, 1.5, 0.1, this.carRgb);
      if (speed > 9) d.burst(p, vel, 2 + Math.floor(speed / 10), DEBRIS.lens, 3 + speed * 0.1, 2, 0.05, [1, 0.05, 0.04]);
      if (speed > 12) d.burst(p, vel, 3 + Math.floor(speed / 8), DEBRIS.glass, 4 + speed * 0.1, 2.5, 0.04, [0.8, 0.9, 1]);
    }
  }

  /** Move everything by −d (floating-origin rebase). */
  shift(d: THREE.Vector3): void {
    this.scene.world.shift(d.x, d.y, d.z);
    this.debris.shift(d.x, d.y, d.z);
    const i = this.init;
    const sub = (v: V3) => {
      v.x -= d.x;
      v.y -= d.y;
      v.z -= d.z;
    };
    sub(i.bike.x);
    for (const id of SEGMENT_IDS) sub(i.rider[id].x);
    if (i.car) sub(i.car.x);
    if (i.barrier) sub(i.barrier.p);
    this.focus.sub(d);
    this.orbit.sub(d);
    this.head.sub(d);
  }

  dispose(): void {
    this.root.remove(this.debrisView.solid, this.debrisView.glass);
    this.debrisView.dispose();
    if (this.vehicle) this.traffic.releaseCrashVehicle(this.vehicle);
    this.vehicle = null;
  }
}
