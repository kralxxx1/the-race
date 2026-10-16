import * as THREE from 'three';
import type { EnvDef } from '../data/environments';
import type { SettingsReader } from '../settings';
import type { CameraMode } from './camera';
import type { AudioCar } from '../audio/gameAudio';
import { clamp, damp, noise1, smoothstep } from '../core/math';
import type { GameSession, SessionEvent } from '../game/session';
import { BikeModel } from './bikeModel';
import { bikeDetailFrom } from './bike/bikeSettings';
import { CameraRig } from './camera';
import { makeFpvOptions, readFpvOptions } from './cameraSettings';
import { HeadMotion, makeHeadInput, makeHeadPose } from './fpv/headMotion';
import { MirrorRig, type MirrorHooks } from './fpv/mirrors';
import { VisorFx, type VisorState } from './fpv/visor';
import { pavedHalfWidth } from '../world/road';
import { CrashSim, type CrashStart, type ImpactKind } from './crash';
import type { TrafficCar } from '../world/traffic';
import { crashPhase, crashTimeScale as planTimeScale, planCrash, type CrashPlan } from './fpv/crashPlan';
import { GlowPoints, Rain, SkidMarks, Smoke, Sparks } from './effects';
import { Materials } from './materials';
import { defaultFx, type FxState, type Renderer } from './renderer';
import { RiderModel } from './riderModel';
import { EnvProbe } from './postfx/envProbe';
import { ShadowSystem } from './postfx/shadows';
import { SkySystem, parseEnv } from './sky';
import { TrafficView } from './trafficView';
import { WorldView } from './worldView';
import { EnclosureFx } from './world/enclosureFx';
import { Snowfall } from './world/snowfall';
import type { ReverbKind } from '../audio/dsp/impulse';

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
  /** Render-to-texture rear view in the bike's mirrors. */
  readonly mirrors: MirrorRig;
  /** Screen-space visor layer: rain beads, crack overlay, edge shading. */
  readonly visor: VisorFx;
  private readonly visorState: VisorState = { rain: 0, speed: 0, side: 0, buffet: 0, active: true, frame: true, crack: 0, letterbox: 0 };
  private crackAmt = 0;
  readonly cam: CameraRig;
  readonly glow: GlowPoints;
  readonly sparks = new Sparks(600);
  readonly smoke = new Smoke(320);
  private rain: Rain | null = null;
  /** Falling snow (snow weather) and the tunnel lighting/eye-adaptation response of the scenery. */
  private snowfall: Snowfall | null = null;
  private enclosureFx: EnclosureFx | null = null;
  readonly skid = new SkidMarks();
  crash: CrashSim | null = null;
  private crashClock = 0;
  private crashPlan: CrashPlan = planCrash('both', false);
  private crashPhaseNow: 'fpv' | 'cine' | 'replay' = 'fpv';
  private feel = { roughness: 0.1, rumble: 0 };
  /** 0..1 how tightly the rider is squeezed between two vehicles (lane splitting). */
  private squeeze = 0;
  /** Secondary impact sounds (strength 0..1) while the crash plays out. */
  crashImpactCb: ((strength: number, kind: ImpactKind) => void) | null = null;
  readonly fx: FxState = defaultFx();
  /** Resolved first-person options (re-read every frame, no allocation). */
  readonly fpv = makeFpvOptions();
  private readonly head = new HeadMotion();
  private readonly headIn = makeHeadInput();
  private readonly headPose = makeHeadPose();
  /** Look-over-the-shoulder control (held), set by the game loop. */
  lookBack = false;
  private lookSide = 1;
  private frameDt = 1 / 60;
  private readonly mirrorHooks: MirrorHooks = {
    before: (h, fov) => {
      // A rider's elbows would fill the glass; the reflection shows the traffic, not the rider.
      this.rider.root.visible = false;
      this.glow.setViewportHeight(h, fov);
      this.smoke.setViewportHeight(h, fov);
    },
    after: () => {
      this.rider.root.visible = true;
      this.glow.setViewportHeight(this.renderer.viewportHeight, this.cam.camera.fov);
      this.smoke.setViewportHeight(this.renderer.viewportHeight, this.cam.camera.fov);
    },
  };
  private time = 0;
  private frontComp = 0;
  private frontVel = 0;
  private rearComp = 0;
  private rearVel = 0;
  private dashTimer = 0;
  private shiftAnim = 0;
  /** Smoothed clutch lever pull (0..1): in on gear shifts and while slipping. */
  private clutchVis = 0;
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

    this.bike = new BikeModel(session.cfg.bike, liveryIndex, this.mats, { headlightSpot: env.headlights, detail: bikeDetailFrom(settings) });
    scene.add(this.bike.root);
    this.rider = new RiderModel(this.mats, this.bike.livery, session.cfg.bike.style);
    this.bike.riderMount.add(this.rider.root);
    this.mirrors = new MirrorRig(this.bike);
    this.visor = new VisorFx(renderer.canvas.parentElement ?? document.body, renderer.canvas);

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
    scene.add(this.glow.points, this.sparks.lines, this.smoke.points, this.skid.mesh);
    this.sparks.ground = this.ground;
    if (env.rain) {
      this.rain = new Rain(q.rainDrops);
      scene.add(this.rain.lines);
      this.smoke.material.uniforms.tint.value.set('#c9d1d8');
    }
    if (parseEnv(env).weather === 'snow') {
      this.snowfall = new Snowfall(q.sceneryDensity, env.world.wind);
      scene.add(this.snowfall.points);
    }
    renderer.setBloom(env.bloom.strength, env.bloom.threshold, env.bloom.radius);
    renderer.renderer.toneMappingExposure = env.exposure;
    this.enclosureFx = new EnclosureFx({ scene, sun: this.sky.sun, hemi: this.sky.hemi, renderer: renderer.renderer, exposure: env.exposure });
    this.world.prewarm(session.bike.s);
    this.placeBike(0.016);
    this.cam.startIntro(3);
  }

  /** Acoustic zone override for the audio engine: tunnels while the rider is inside one. */
  audioZone(): ReverbKind | undefined {
    return this.world.enclosure(this.session.bike.s) > 0.55 ? 'tunnel' : undefined;
  }

  /** Time scale of the simulation `t` real seconds after the crash (slow motion, replay pacing). */
  crashTimeScale(t: number): number {
    this.crashPlan = planCrash(this.crashMode(), this.session.cfg.mode.respawn);
    return planTimeScale(this.crashPlan, t, this.fpv.crashSlowmo);
  }

  /** Real seconds of the crash sequence before the run ends (non-respawn modes). */
  crashSequenceLength(): number {
    return planCrash(this.crashMode(), this.session.cfg.mode.respawn).total;
  }

  /** The motion-comfort preset swaps the tumbling helmet view for the steadier external camera. */
  private crashMode(): 'fpv' | 'cinematic' | 'both' {
    return this.fpv.comfort === 'strong' ? 'cinematic' : this.fpv.crashCamera;
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
    // Ground-hugging layer on top of the scene fog: thick mist at dawn and in fog weather, a trace of haze otherwise.
    a.fogDensity = weather === 'fog' ? 0.0032 : weather === 'rain' ? 0.0011 : time === 'dawn' ? 0.0013 : 0.00045;
    a.fogFalloff = weather === 'fog' ? 0.018 : time === 'dawn' ? 0.025 : 0.035;
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
        this.head.jolt(e.impact);
        break;
      case 'nearMiss':
        this.cam.addTrauma(0.1);
        // Wind punch from the passing vehicle: bigger for heavy ones and for oncoming closing speed.
        this.head.punch((0.55 + (e.car.arch.heavy ? 0.3 : 0) + (e.car.dir === -1 ? 0.25 : 0)) * this.fpv.nearMiss, -e.side);
        break;
      case 'pass':
        if (e.clearance < 1.6 && this.session.bike.v > 18) this.head.punch((0.25 + (e.car.arch.heavy ? 0.25 : 0)) * (1 - e.clearance / 1.6) * this.fpv.nearMiss, -e.side);
        break;
      case 'hit':
        this.startCrash(e.relSpeed, e.car, null);
        break;
      case 'crash':
        // A traffic crash starts with its own `hit` event; anything else (barrier, loop, debug) starts here.
        this.startCrash(this.session.bike.v, null, e.reason);
        break;
      case 'respawn':
        this.endCrash();
        this.cam.snap();
        break;
      default:
        break;
    }
  }

  private startCrash(impactSpeed: number, hit: TrafficCar | null, reason: 'barrier' | 'loop' | 'traffic' | null): void {
    if (this.crash) return;
    const sess = this.session;
    const b = sess.bike;
    const road = sess.road;
    const yaw = road.yaw(b.s) - b.heading;
    const vel = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)).multiplyScalar(b.v);
    let car: CrashStart['car'] = null;
    if (hit) {
      this.world.worldPos(hit.s, hit.d, 0, _v);
      car = { car: hit, pos: _v.clone(), yaw: road.yaw(hit.s) - hit.yaw, speed: hit.v };
    }
    let barrier: CrashStart['barrier'] = null;
    if (reason === 'barrier') {
      const side = b.d > 0 ? 1 : -1;
      const lim = sess.limits.halfWidth;
      const p = this.world.worldPos(b.s, side * (lim + 0.5), 0, new THREE.Vector3());
      const q = this.world.worldPos(b.s, side * (lim + 1.5), 0, new THREE.Vector3());
      barrier = { p, n: p.clone().sub(q).setY(0).normalize() };
    }
    this.crashClock = 0;
    this.crashPlan = planCrash(this.crashMode(), sess.cfg.mode.respawn);
    this.crashPhaseNow = crashPhase(this.crashPlan, 0);
    this.crash = new CrashSim(
      this.bike,
      this.rider,
      this.scene,
      this.traffic,
      { sparks: this.sparks, smoke: this.smoke, skid: this.skid },
      {
        vel,
        pitchRate: b.pitchRate,
        yawRate: b.yawRate,
        leanRate: b.leanRate,
        seed: (sess.cfg.seed * 7919 + Math.floor(b.s)) | 0,
        grip: clamp(this.env.grip, 0.35, 1),
        car,
        barrier,
        bikeMass: sess.cfg.bike.weight,
        ground: this.ground,
        plastic: new THREE.Color(this.bike.livery.primary),
      },
    );
    this.crash.onImpact = (str, kind) => this.crashImpactCb?.(str, kind);
    this.applyCrashPhase(true);
    this.cam.resetCrash();
    this.cam.addTrauma(1);
    this.crackAmt = impactSpeed > 6 ? 1 : 0.6;
    this.flash = 0.9;
    this.redPulse = 1;
    this.smoke.emit(this.bike.root.position.x, 0.6 + this.bike.root.position.y, this.bike.root.position.z, vel.x * 0.2, 1, vel.z * 0.2, { n: 8, size: 1.4, life: 2, alpha: 0.4, shade: 0.8, spread: 3 });
  }

  /** Switch the crash camera phase (helmet / external / replay) and the matching body visibility. */
  private applyCrashPhase(first = false): void {
    const next = crashPhase(this.crashPlan, this.crashClock);
    if (!first && next === this.crashPhaseNow) return;
    this.crashPhaseNow = next;
    this.rider.showBody(next !== 'fpv');
    this.cam.resetCrash();
    if (next === 'replay') {
      this.crash?.restart();
      this.flash = Math.max(this.flash, 0.5);
    } else if (!first) this.flash = Math.max(this.flash, 0.3);
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
    this.crackAmt = 0;
    this.visor.reset();
    this.skid.clear();
  }

  private ground = (x: number, z: number): number => {
    // Approximate road surface height at a rebased world position (s ≈ −z).
    const s = -(z + this.world.origin.z);
    return this.session.road.height(s) - this.world.origin.y + 0.01 + 0 * x;
  };

  private placeBike(dt: number): void {
    const b = this.session.bike;
    this.clutchVis = damp(this.clutchVis, b.shiftTimer > 0 ? 1 : b.clutchSlip ? 0.55 : 0, b.shiftTimer > 0 ? 40 : 12, dt);
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
      clutch: this.clutchVis,
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
    this.frameDt = realDt;
    const s = this.session;
    const b = s.bike;
    for (const shift of this.world.shiftEvents.splice(0)) {
      this.cam.shift(shift);
      this.sparks.shift(shift.x, shift.y, shift.z);
      this.smoke.shift(shift.x, shift.y, shift.z);
      this.skid.shift(shift.x, shift.y, shift.z);
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
        throttle: b.throttle,
        clutch: this.clutchVis,
        dt,
      });
      this.shiftAnim = 0;
      // The pre-race orbit shows the whole rider; from the helmet only forearms and gloves.
      const fp = this.cam.mode === 'helmet' && !this.cam.introActive;
      this.rider.setHeadVisible(!fp);
      this.rider.setFirstPerson(fp);
      // Track velocity for rain slant / audio
      _v.copy(this.bike.root.position);
      if (dt > 0) this.bikeVel.copy(_v).sub(this.lastBikePos).divideScalar(dt);
      this.lastBikePos.copy(_v);
    } else {
      this.crashClock += realDt;
      this.applyCrashPhase();
      const impact = this.crash.update(dt);
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
      if (this.crashPhaseNow === 'fpv') this.cam.crashFpv(realDt, this.crash.head, this.crash.headQuat, this.crash.riderSpeed);
      else this.cam.crash(realDt, this.crash.orbit, this.crash.yaw, this.crashPhaseNow === 'replay' ? this.crashClock - this.crashPlan.firstEnd : this.crashClock);
    } else {
      this.updateHeadAndCamera(realDt);
    }
    const camPos = this.cam.camera.position;
    this.sky.follow(this.crash ? this.crash.focus : this.bike.root.position);
    this.sky.mesh.position.copy(camPos);
    this.sky.update(dt, this.time, (delay) => this.onLightning(delay));
    this.enclosureFx?.update(realDt, this.world.enclosure(b.s));

    // Lights / glows
    this.glow.begin();
    this.world.collectGlows(this.glow, camPos);
    this.traffic.update(dt, this.glow, camPos);
    this.crash?.updateCarLights(this.traffic, this.glow, dt);
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
    this.snowfall?.update(realDt, camPos, this.renderer.viewportHeight, this.cam.camera.fov);

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

    // Visor layer (rain beads, crack, edge shading)
    const vs = this.visorState;
    vs.active = !this.crash || this.crashPhaseNow === 'fpv';
    vs.letterbox = this.crash && this.crashPhaseNow === 'replay' ? 1 : 0;
    vs.rain = this.fpv.visorRain && this.env.rain ? 1 : 0;
    vs.speed = b.v;
    vs.side = clamp(b.lean * 0.9 + b.heading * 1.5, -1, 1);
    vs.buffet = this.headPose.buffet;
    vs.frame = this.fpv.visorFrame;
    vs.crack = this.crackAmt;
    this.visor.update(realDt, vs);

    // Post FX
    const speedK = smoothstep(28, 95, b.v);
    this.fx.nearStatic = this.cam.mode === 'helmet' ? 1.3 : 0;
    this.fx.rain = this.env.rain ? 1 : 0;
    // Heat shimmer from the map's climate (desert 1, steppe/highway a little) while the sun is up.
    this.fx.heat = this.env.wet ? 0 : Math.min(1, this.env.world.heat * (this.env.sky.sunElevation > 5 ? 0.9 : 0.35) + (this.env.sky.sunElevation > 20 ? 0.12 : 0));
    this.renderer.atmosphere.fogBase = this.session.road.height(b.s) - this.world.origin.y - 1.5;
    this.fx.blur = this.crash ? 0 : speedK * (this.cam.mode === 'helmet' ? 1 : 0.8);
    this.fx.aberration = this.crash ? 0.5 : speedK * 0.6;
    this.fx.vignette = 0.25 + speedK * 0.45 + this.squeeze * 0.2;
    this.flash = damp(this.flash, 0, 4, realDt);
    this.redPulse = damp(this.redPulse, 0, 1.5, realDt);
    this.fx.flash = this.flash * 0.6;
    this.fx.desat = this.crash ? (this.crashPhaseNow === 'fpv' ? 0.28 : 0.15) : 0;
    this.fx.tint.set(this.redPulse * 0.5, 0, 0);
  }

  /** Surface roughness / rumble strip contact from the lateral position on the road. */
  private surfaceFeel(): { roughness: number; rumble: number } {
    const out = this.feel;
    const b = this.session.bike;
    const hw = pavedHalfWidth(this.session.lanes);
    const a = Math.abs(b.d);
    const rumble = smoothstep(hw - 1.25, hw - 0.5, a);
    const rough = this.env.id.endsWith(':snow') ? 0.35 : 0.1 + (this.env.wet ? 0.02 : 0);
    out.roughness = a > hw ? 0.9 : rough + rumble * 0.25;
    out.rumble = rumble;
    return out;
  }

  /** Lane splitting: traffic close on both sides at once (≤ 2.6 m of clearance) squeezes the view and shakes the helmet. */
  private updateSqueeze(dt: number): void {
    const b = this.session.bike;
    const hw = this.session.playerHalfWidth;
    let left = 9;
    let right = 9;
    for (const c of this.session.traffic.cars) {
      if (Math.abs(c.s - b.s) > c.length / 2 + 2.5) continue;
      const gap = Math.abs(c.d - b.d) - c.width / 2 - hw;
      if (c.d < b.d) left = Math.min(left, gap);
      else right = Math.min(right, gap);
    }
    const worst = Math.max(left, right);
    const target = b.v > 8 ? Math.max(0, 1 - Math.max(0, worst) / 2.6) * (left < 9 && right < 9 ? 1 : 0) : 0;
    this.squeeze = damp(this.squeeze, target, target > this.squeeze ? 8 : 3, dt);
  }

  /** Head dynamics → helmet camera (first-person view). */
  private updateHeadAndCamera(realDt: number): void {
    const b = this.session.bike;
    const s = this.session;
    const f = readFpvOptions(this.settings, this.fpv);
    this.updateSqueeze(realDt);
    this.mirrors.configure(f.mirrors, f.mirrorHz);
    const hi = this.headIn;
    const feel = this.surfaceFeel();
    hi.speed = b.v;
    hi.lean = b.lean;
    hi.leanRate = b.leanRate;
    hi.accel = b.accel;
    hi.pitch = b.pitch;
    hi.yawRate = b.yawRate;
    hi.rpmFrac = b.curve.kind === 'electric' ? 0.2 : clamp(b.rpm / s.cfg.bike.engine.redline, 0, 1.2);
    hi.roughness = feel.roughness;
    hi.rumble = feel.rumble;
    hi.turbulence = Math.min(1, s.wake.turbulence + this.squeeze * 0.4);
    const style = s.cfg.bike.style;
    hi.tuckStyle = style === 'sport' || style === 'hyper' ? 1 : style === 'naked' ? 0.55 : style === 'adventure' ? 0.2 : 0;
    // Look over the shoulder: auto picks the side the rider is steering towards.
    if (this.lookBack && f.lookBackSide === 'auto' && hi.lookBack < 0.5) this.lookSide = b.heading + b.lean * 0.3 > 0.04 ? -1 : 1;
    else if (f.lookBackSide !== 'auto') this.lookSide = f.lookBackSide === 'left' ? 1 : -1;
    hi.lookBack = this.lookBack ? 1 : 0;
    hi.lookBackSide = this.lookSide;
    this.head.step(realDt, hi, f, this.headPose);
    this.bike.chassis.updateMatrixWorld(true);
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
      rpmFrac: hi.rpmFrac,
      chassis: this.bike.chassis.matrixWorld,
      eyeLocal: this.bike.frame.eye,
      head: this.headPose,
      baseFov: f.fov,
      shake: f.shake,
    });
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
      out.push({ id: c.id, heavy: c.arch.heavy, kind: c.kind, x: _v.x, y: _v.y, z: _v.z, vRad, speed: c.v, braking: c.braking });
    }
    return out;
  }

  render(): void {
    this.renderer.setDepthOfField(0, 0);
    this.cam.camera.aspect = this.renderer.aspect;
    this.cam.camera.updateProjectionMatrix();
    if (!this.crash) this.mirrors.render(this.renderer.renderer, this.scene, this.cam.camera.position, this.frameDt, this.mirrorHooks, this.lookBack);
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
    this.snowfall?.dispose();
    this.enclosureFx?.dispose();
    this.crash?.dispose();
    this.mirrors.dispose();
    this.visor.dispose();
    this.skid.dispose();
    this.sparks.dispose();
    this.smoke.dispose();
    this.rider.dispose();
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
