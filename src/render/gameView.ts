import * as THREE from 'three';
import type { EnvDef } from '../data/environments';
import type { SettingsReader } from '../settings';
import type { CameraMode } from './camera';
import type { AudioCar } from '../audio/gameAudio';
import { clamp, damp, noise1, smoothstep } from '../core/math';
import type { GameSession, SessionEvent } from '../game/session';
import { BikeModel } from './bikeModel';
import { CameraRig } from './camera';
import { CrashSim } from './crash';
import { GlowPoints, Rain, Smoke, Sparks } from './effects';
import { Materials } from './materials';
import { defaultFx, type FxState, type Renderer } from './renderer';
import { RiderModel } from './riderModel';
import { EnvProbe } from './postfx/envProbe';
import { ShadowSystem } from './postfx/shadows';
import { SkySystem, parseEnv } from './sky';
import { TrafficView } from './trafficView';
import { WorldView } from './worldView';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _m = new THREE.Matrix4();

/** Everything that renders one riding session. */
export class GameView {
  readonly scene = new THREE.Scene();
  readonly mats = new Materials();
  readonly sky: SkySystem;
  readonly shadows: ShadowSystem;
  private probe: EnvProbe | null = null;
  readonly world: WorldView;
  readonly traffic: TrafficView;
  readonly bike: BikeModel;
  readonly rider: RiderModel;
  readonly cam: CameraRig;
  readonly glow: GlowPoints;
  readonly sparks = new Sparks(600);
  readonly smoke = new Smoke(320);
  private rain: Rain | null = null;
  crash: CrashSim | null = null;
  readonly fx: FxState = defaultFx();
  private time = 0;
  private frontComp = 0;
  private frontVel = 0;
  private rearComp = 0;
  private rearVel = 0;
  private dashTimer = 0;
  private shiftAnim = 0;
  private flash = 0;
  private redPulse = 0;
  private bikeVel = new THREE.Vector3();
  private lastBikePos = new THREE.Vector3();

  constructor(
    private renderer: Renderer,
    private session: GameSession,
    readonly env: EnvDef,
    liveryIndex: number,
    private settings: SettingsReader,
  ) {
    const scene = this.scene;
    const q = renderer.profile;
    this.sky = new SkySystem(env, { mode: q.sky, ibl: q.ibl, skyRes: q.skyRes, iblIntensity: q.iblIntensity });
    scene.add(this.sky.mesh, this.sky.sun, this.sky.sun.target, this.sky.hemi);
    this.sky.buildEnvMap(renderer.renderer);
    this.sky.applyTo(scene);
    scene.fog = new THREE.Fog(env.fog.color, env.fog.near, env.fog.far * (q.viewDistance / 1200));
    scene.background = new THREE.Color(env.fog.color);

    this.world = new WorldView(session.road, session.lanes, env, this.mats, q);
    scene.add(this.world.group);
    this.traffic = new TrafficView(this.mats, this.world, env);
    scene.add(this.traffic.group);
    for (const c of session.traffic.cars) this.traffic.spawn(c);

    this.bike = new BikeModel(session.cfg.bike, liveryIndex, this.mats, { headlightSpot: env.headlights });
    scene.add(this.bike.root);
    this.rider = new RiderModel(this.mats, this.bike.livery, session.cfg.bike.style);
    this.bike.riderMount.add(this.rider.root);

    this.cam = new CameraRig(renderer.aspect);
    this.cam.setMode('helmet');
    this.shadows = new ShadowSystem(scene, this.cam.camera, this.sky, q);
    this.shadows.enableHeadlightShadows(this.bike.root, q.headlightShadows && env.headlights);
    if (q.envProbeInterval > 0) {
      this.probe = new EnvProbe(renderer.renderer, q.envProbeRes, q.envProbeInterval);
      // The probe captures sky + world, so the photographic IBL gain no longer applies.
      this.sky.envIntensity = q.iblIntensity;
    }
    renderer.beforeRender.add(this.preRender);
    this.setupAtmosphere();
    renderer.pipeline.resetHistory();
    this.glow = new GlowPoints(2400, env.fog.near, env.fog.far * 1.1);
    scene.add(this.glow.points, this.sparks.lines, this.smoke.points);
    if (env.rain) {
      this.rain = new Rain(q.rainDrops);
      scene.add(this.rain.lines);
      this.smoke.material.uniforms.tint.value.set('#c9d1d8');
    }
    renderer.setBloom(env.bloom.strength, env.bloom.threshold, env.bloom.radius);
    renderer.renderer.toneMappingExposure = env.exposure;
    this.world.prewarm(session.bike.s);
    this.placeBike(0.016);
    this.cam.startIntro(3);
  }

  /** Hand the post chain what it needs to know about the sky and weather. */
  private setupAtmosphere(): void {
    const a = this.renderer.atmosphere;
    const env = this.env;
    const { weather, time } = parseEnv(env);
    a.sunDir = this.sky.sunDir;
    // Radiance of the sun disc as seen by flares and light shafts; the moon is far dimmer.
    a.sunColor.set(env.sky.sunColor).multiplyScalar(time === 'night' ? 0.08 : weather === 'rain' || weather === 'fog' ? 0.25 : 0.7);
    a.fogColor.set(env.fog.color);
    a.fogDensity = weather === 'fog' ? 0.0045 : weather === 'rain' ? 0.0022 : time === 'dawn' ? 0.0026 : 0.0011;
    a.wet = env.wet ? 1 : 0;
    a.dofAmount = 0;
  }

  private preRender = (): void => {
    this.shadows.update();
    if (this.probe) {
      _v.copy(this.bike.root.position);
      _v.y += 1.0;
      if (this.probe.tick(this.scene, _v, [this.bike.root])) {
        this.scene.environment = this.probe.texture;
        this.scene.environmentRotation.set(0, 0, 0);
      }
    }
  };

  setCameraMode(m: CameraMode): void {
    this.cam.setMode(m);
    this.cam.snap();
  }

  onEvent(e: SessionEvent): void {
    switch (e.type) {
      case 'spawn':
        this.traffic.spawn(e.car);
        break;
      case 'despawn':
        this.traffic.despawn(e.car);
        break;
      case 'shift':
        this.shiftAnim = e.up ? 1 : -1;
        if (!e.quick) this.cam.addTrauma(0.05);
        break;
      case 'land':
        this.frontVel -= 1.5 * e.impact + 0.4;
        this.cam.addTrauma(0.25 * e.impact);
        break;
      case 'nearMiss':
        this.cam.addTrauma(0.18);
        break;
      case 'hit':
        this.startCrash(e.relSpeed, e.car.d < this.session.bike.d ? 1 : -1);
        break;
      case 'crash':
        if (e.reason !== 'traffic') this.startCrash(this.session.bike.v, this.session.bike.d > 0 ? -1 : 1);
        break;
      case 'respawn':
        this.endCrash();
        this.cam.snap();
        break;
      default:
        break;
    }
  }

  private startCrash(impactSpeed: number, hitSide: number): void {
    if (this.crash) return;
    const b = this.session.bike;
    const yaw = this.session.road.yaw(b.s) - b.heading;
    const vel = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)).multiplyScalar(b.v);
    this.crash = new CrashSim(this.bike, this.rider, this.scene, vel, impactSpeed, b.lean, hitSide);
    this.cam.resetCrash();
    this.cam.addTrauma(1);
    this.flash = 0.9;
    this.redPulse = 1;
    this.smoke.emit(this.bike.root.position.x, 0.6 + this.bike.root.position.y, this.bike.root.position.z, vel.x * 0.2, 1, vel.z * 0.2, { n: 8, size: 1.4, life: 2, alpha: 0.4, shade: 0.8, spread: 3 });
  }

  /** Free ride respawn: put the rider back on the bike. */
  private endCrash(): void {
    if (!this.crash) return;
    this.crash.dispose();
    this.crash = null;
    this.bike.riderMount.add(this.rider.root);
    this.rider.root.position.set(0, 0, 0);
    this.rider.root.quaternion.identity();
    this.bike.root.rotation.set(0, 0, 0);
  }

  private ground = (x: number, z: number): number => {
    // Approximate road surface height at a rebased world position (s ≈ −z).
    const s = -(z + this.world.origin.z);
    return this.session.road.height(s) - this.world.origin.y + 0.01 + 0 * x;
  };

  private placeBike(dt: number): void {
    const b = this.session.bike;
    const road = this.session.road;
    this.world.worldPos(b.s, b.d, 0, _v);
    this.bike.root.position.copy(_v);
    const yaw = road.yaw(b.s) - b.heading;
    this.bike.root.rotation.set(road.pitch(b.s), yaw, 0, 'YXZ');
    // Suspension: spring-dampers driven by longitudinal load transfer and road texture.
    const a = b.accel;
    const fTarget = clamp(-a * 0.011, -0.03, 0.09) + noise1(this.time * 7 + b.s * 0.3, 9) * 0.004 * smoothstep(5, 30, b.v);
    const rTarget = clamp(a * 0.005, -0.015, 0.035) + noise1(this.time * 6 + b.s * 0.3, 11) * 0.004 * smoothstep(5, 30, b.v);
    const k = 180;
    const c = 2 * Math.sqrt(k) * 0.55;
    this.frontVel += (k * (fTarget - this.frontComp) - c * this.frontVel) * dt;
    this.frontComp += this.frontVel * dt;
    this.rearVel += (k * (rTarget - this.rearComp) - c * this.rearVel) * dt;
    this.rearComp += this.rearVel * dt;
    const stand = 1 - smoothstep(0.3, 1.6, b.v);
    const steerVis = clamp((b.yawRate * this.bike.frame.L) / Math.max(b.v, 2.5), -0.45, 0.45) - b.leanRate * 0.015;
    this.bike.update({
      lean: b.lean - stand * 0.11,
      pitch: b.pitch,
      steer: steerVis,
      wheelSpeed: b.v / this.bike.frame.Rr,
      frontComp: this.frontComp,
      rearComp: this.rearComp,
      brake: b.brake,
      headlight: this.env.headlights,
      dt,
    });
    // From inside the helmet the lamp housings face away: keep them from blooming into view.
    if (this.cam.mode === 'helmet') {
      this.bike.headLight.emissiveIntensity = Math.min(this.bike.headLight.emissiveIntensity, 0.6);
      this.bike.drl.emissiveIntensity = 0.5;
    } else this.bike.drl.emissiveIntensity = 3;
  }

  update(dt: number, realDt: number): void {
    this.time += dt;
    const s = this.session;
    const b = s.bike;
    for (const shift of this.world.shiftEvents.splice(0)) {
      this.cam.shift(shift);
      this.sparks.shift(shift.x, shift.y, shift.z);
      this.smoke.shift(shift.x, shift.y, shift.z);
      this.crash?.shift(shift);
      this.lastBikePos.sub(shift);
    }
    this.world.update(b.s);

    if (!this.crash) {
      this.placeBike(dt);
      this.bike.root.updateMatrixWorld(true);
      this.rider.ride(this.bike, {
        speedKmh: b.speedKmh,
        lean: b.lean,
        accel: b.accel,
        brake: b.brake,
        pitch: b.pitch,
        steer: clamp(b.heading * 3, -1, 1),
        shift: this.shiftAnim,
        dt,
      });
      this.shiftAnim = 0;
      this.rider.setHeadVisible(this.cam.mode !== 'helmet');
      // Track velocity for rain slant / audio
      _v.copy(this.bike.root.position);
      if (dt > 0) this.bikeVel.copy(_v).sub(this.lastBikePos).divideScalar(dt);
      this.lastBikePos.copy(_v);
    } else {
      const impact = this.crash.update(dt, this.ground, this.sparks, this.smoke);
      if (impact > 3) this.cam.addTrauma(Math.min(0.4, impact * 0.05));
      this.bikeVel.multiplyScalar(Math.exp(-2 * dt));
    }

    // Effects: scrape sparks, wheelspin smoke, wet spray.
    if (b.scraping > 0 && !this.crash) {
      const side = b.d > 0 ? 1 : -1;
      this.world.worldPos(b.s, b.d + side * 0.35, 0.55, _v);
      this.sparks.emit(_v.x, _v.y, _v.z, this.bikeVel.x * 0.5, 0.5, this.bikeVel.z * 0.5, Math.ceil(5 * b.scraping), 3);
      this.cam.addTrauma(0.03 * b.scraping);
    }
    if (!this.crash && b.wheelspin > 0.15 && b.v < 25) {
      this.world.worldPos(b.s - 0.1, b.d, 0.15, _v);
      this.smoke.emit(_v.x, _v.y, _v.z, this.bikeVel.x * 0.1, 0.3, this.bikeVel.z * 0.1, { size: 0.7, life: 1.4, alpha: 0.35 * b.wheelspin + 0.1 });
    }
    if (this.env.wet && !this.crash && b.v > 8 && Math.random() < dt * 25) {
      this.world.worldPos(b.s - 0.5, b.d, 0.1, _v);
      this.smoke.emit(_v.x, _v.y, _v.z, this.bikeVel.x * 0.4, 0.8, this.bikeVel.z * 0.4, { size: 0.6, life: 0.7, alpha: 0.18, shade: 1.1, spread: 1.2 });
    }

    // Camera
    if (this.crash) {
      this.cam.crash(realDt, this.crash.focus, this.crash.yaw);
    } else {
      this.rider.root.updateMatrixWorld(true);
      const eye = _v.copy(this.rider.eye).applyMatrix4(this.rider.root.matrixWorld);
      const eyeQ = new THREE.Quaternion();
      this.rider.root.getWorldQuaternion(eyeQ);
      eyeQ.multiply(this.rider.eyeQuat);
      this.world.worldPos(b.s, b.d, 0, _v2);
      this.cam.update({
        dt: realDt,
        bikePos: _v2,
        yaw: s.road.yaw(b.s) - b.heading,
        roadPitch: s.road.pitch(b.s),
        lean: b.lean,
        wheelie: b.pitch,
        speed: b.v,
        accel: b.accel,
        rpmFrac: b.curve.kind === 'electric' ? 0.2 : b.rpm / s.cfg.bike.engine.redline,
        eye,
        eyeQuat: eyeQ,
        shakeEnabled: this.settings.bool('cam.shake'),
      });
    }
    const camPos = this.cam.camera.position;
    this.sky.follow(this.crash ? this.crash.focus : this.bike.root.position);
    this.sky.mesh.position.copy(camPos);
    this.sky.update(dt, this.time, (delay) => this.onLightning(delay));

    // Lights / glows
    this.glow.begin();
    this.world.collectGlows(this.glow, camPos);
    this.traffic.update(dt, this.glow, camPos);
    if (!this.crash) {
      this.bike.chassis.updateMatrixWorld(true);
      _v.set(0, this.bike.frame.seatY + 0.08, 0.1).applyMatrix4(this.bike.chassis.matrixWorld);
      const bi = b.brake > 0.1 ? 1.5 : this.env.headlights ? 0.5 : 0;
      if (bi > 0) this.glow.add(_v.x, _v.y, _v.z, 1.6 * bi, 0.1 * bi, 0.05 * bi, 0.8);
      if (this.env.headlights && this.cam.mode !== 'helmet') {
        _v.set(0, this.bike.frame.head.y - 0.06, -this.bike.frame.L - 0.06).applyMatrix4(this.bike.chassis.matrixWorld);
        this.glow.add(_v.x, _v.y, _v.z, 1.6, 1.5, 1.35, 1.2);
      }
    }
    this.glow.end();
    this.glow.setViewportHeight(this.renderer.viewportHeight, this.cam.camera.fov);
    this.smoke.setViewportHeight(this.renderer.viewportHeight, this.cam.camera.fov);
    this.sparks.update(dt);
    this.smoke.update(dt);
    if (this.rain) this.rain.update(realDt, camPos, this.bikeVel);

    // Dashboard redraw (~15 Hz)
    this.dashTimer -= realDt;
    if (this.dashTimer <= 0 && !this.crash) {
      this.dashTimer = 1 / 15;
      const e = s.cfg.bike.engine;
      const frac = b.curve.kind === 'electric' ? b.v / (s.cfg.bike.topSpeed / 3.6) : (b.rpm - e.idle * 0.8) / (e.limiter - e.idle * 0.8);
      const units = this.settings.str<'kmh' | 'mph'>('hud.units');
      const sp = units === 'mph' ? b.speedKmh * 0.621371 : b.speedKmh;
      this.bike.updateDash(clamp(frac, 0, 1), b.gear, sp, b.rpm > e.redline * 0.95, units);
    }

    // Post FX
    const speedK = smoothstep(28, 95, b.v);
    this.fx.nearStatic = this.cam.mode === 'helmet' ? 1.3 : 0;
    this.fx.rain = this.env.rain ? 1 : 0;
    this.fx.heat = this.env.terrain === 'sand' ? 0.8 : this.env.sky.sunElevation > 20 && !this.env.wet ? 0.3 : 0;
    this.renderer.atmosphere.fogBase = this.session.road.height(b.s) - this.world.origin.y - 1.5;
    this.fx.blur = this.crash ? 0 : speedK * (this.cam.mode === 'helmet' ? 1 : 0.8);
    this.fx.aberration = this.crash ? 0.5 : speedK * 0.6;
    this.fx.vignette = 0.25 + speedK * 0.45;
    this.flash = damp(this.flash, 0, 4, realDt);
    this.redPulse = damp(this.redPulse, 0, 1.5, realDt);
    this.fx.flash = this.flash * 0.6;
    this.fx.desat = this.crash ? clamp(this.crash ? 0.35 : 0, 0, 0.5) : 0;
    this.fx.tint.set(this.redPulse * 0.5, 0, 0);
  }

  private onLightning(delay: number): void {
    this.flash = Math.max(this.flash, 0.35);
    this.lightningCb?.(delay);
  }

  lightningCb: ((delay: number) => void) | null = null;

  /** Nearby traffic in listener (camera) space for the audio engine. */
  audioCars(out: AudioCar[]): AudioCar[] {
    out.length = 0;
    const cam = this.cam.camera;
    cam.updateMatrixWorld();
    _m.copy(cam.matrixWorldInverse);
    const camPos = cam.position;
    const road = this.session.road;
    for (const c of this.session.traffic.cars) {
      if (Math.abs(c.s - this.session.bike.s) > 140) continue;
      this.world.worldPos(c.s, c.d, 0.6, _v);
      const yaw = road.yaw(c.s) - c.yaw;
      const vx = -Math.sin(yaw) * c.v;
      const vz = -Math.cos(yaw) * c.v;
      const rx = vx - this.bikeVel.x;
      const rz = vz - this.bikeVel.z;
      const dx = _v.x - camPos.x;
      const dz = _v.z - camPos.z;
      const d = Math.max(0.5, Math.hypot(dx, dz));
      const vRad = -(rx * dx + rz * dz) / d;
      _v.applyMatrix4(_m);
      out.push({ id: c.id, heavy: c.arch.heavy, x: _v.x, y: _v.y, z: _v.z, vRad, speed: c.v });
    }
    return out;
  }

  render(): void {
    this.renderer.setDepthOfField(0, 0);
    this.cam.camera.aspect = this.renderer.aspect;
    this.cam.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.cam.camera, this.fx);
  }

  dispose(): void {
    // Collect every per-run GPU resource *before* sub-systems detach their groups
    // (shared vehicle geometry and cached textures survive for the next run).
    const geos = new Set<THREE.BufferGeometry>();
    const mats = new Set<THREE.Material>();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && !m.geometry.userData.shared) geos.add(m.geometry);
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => mats.add(x));
      else if (mat) mats.add(mat);
    });
    this.crash?.dispose();
    this.renderer.beforeRender.delete(this.preRender);
    // Leave the post chain in a neutral state for the menu showroom (no sun, no fog layer, no stale history).
    const a = this.renderer.atmosphere;
    a.sunDir = null;
    a.fogDensity = 0;
    a.wet = 0;
    a.dofAmount = 0;
    this.renderer.pipeline.resetHistory();
    this.probe?.dispose();
    this.shadows.dispose();
    this.world.dispose();
    this.bike.dispose();
    this.sky.dispose();
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
    this.scene.clear();
  }
}
