import { BIKE_BY_ID, getBike } from '../data/bikes';
import { ENV_BY_ID, type EnvId } from '../data/environments';
import { MODE_BY_ID, type ModeId } from '../data/modes';
import { audio } from '../audio/audioEngine';
import { EngineSound } from '../audio/engineSound';
import { GameAudio, UiSounds, type AudioCar } from '../audio/gameAudio';
import { clamp } from '../core/math';
import { InputManager, type FrameInput } from '../input/input';
import type { RiderInput, Upgrades } from '../physics/bike';
import { GameView } from '../render/gameView';
import { Renderer } from '../render/renderer';
import { Showroom } from '../render/showroom';
import { SaveManager, type CameraMode, type Settings } from '../storage/save';
import { Hud } from '../ui/hud';
import { Screens } from '../ui/screens';
import { cashForRun, type RunStats } from './scoring';
import { GameSession, type SessionEvent } from './session';

export type GameState = 'boot' | 'menu' | 'garage' | 'modes' | 'settings' | 'loading' | 'playing' | 'paused' | 'gameover';

const CAMERAS: CameraMode[] = ['chase', 'helmet', 'far', 'low'];
const CAMERA_LABEL: Record<CameraMode, string> = { chase: 'Takip kamerası', helmet: 'Kask içi kamera', far: 'Uzak kamera', low: 'Alçak kamera' };

/** Top-level state machine wiring simulation, rendering, audio, input and UI. */
export class Game {
  readonly save: SaveManager;
  readonly renderer: Renderer;
  readonly input = new InputManager();
  private screens: Screens;
  private hud: Hud | null = null;
  private showroom: Showroom;
  private uiSounds = new UiSounds(audio);
  private gameAudio = new GameAudio(audio);
  state: GameState = 'boot';
  session: GameSession | null = null;
  view: GameView | null = null;
  private last = 0;
  private timeScale = 1;
  private crashTimer = 0;
  private countdownShown = -1;
  private goTimer = 0;
  private mode: ModeId = 'endless';
  private env: EnvId = 'day';
  private prevScreen: GameState = 'menu';
  private revOn = false;
  private revEngine: EngineSound | null = null;
  private revRpm = 0;
  private revBike = '';
  private fps = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private showFps = false;
  private lastStats: RunStats | null = null;
  private audioCars: AudioCar[] = [];
  private runSeed = 1;
  errors: string[] = [];
  /** Exponential moving averages of per-stage frame cost (ms) for the debug overlay. */
  readonly profile: Record<string, number> = {};

  private prof(name: string, t0: number): number {
    const t = performance.now();
    const prev = this.profile[name] ?? t - t0;
    this.profile[name] = prev * 0.85 + (t - t0) * 0.15;
    return t;
  }

  constructor(private container: HTMLElement) {
    this.save = new SaveManager();
    const canvas = document.createElement('canvas');
    canvas.className = 'game-canvas';
    canvas.setAttribute('data-testid', 'game-canvas');
    container.append(canvas);
    const s = this.save.data.settings;
    this.renderer = new Renderer(canvas, s.quality);
    this.renderer.renderer.info.autoReset = false;
    this.renderer.speedBlurEnabled = s.speedBlur;
    this.input.sensitivity = s.steerSensitivity;
    this.showFps = s.showFps;
    audio.setVolumes(s.masterVolume, s.engineVolume, s.sfxVolume);
    this.mode = this.save.data.lastMode;
    this.env = this.save.data.lastEnv;
    this.showroom = new Showroom(this.renderer);
    this.screens = new Screens(container, this.save, this.actions());
    this.showroom.attachPointer(canvas);

    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('resize', () => this.onResize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.state === 'playing') this.pause();
        audio.suspend();
      } else if (this.state !== 'paused') audio.resume();
    });
    window.addEventListener('error', (e) => this.errors.push(String(e.message)));
  }

  /** Boot: build the showroom and show the main menu. */
  start(): void {
    const sel = this.save.data.selectedBike;
    this.showroom.setBike(getBike(sel), this.save.livery(sel));
    this.toMenu();
    this.last = performance.now();
    const loop = (t: number) => {
      requestAnimationFrame(loop);
      try {
        this.frame(t);
      } catch (e) {
        console.error(e);
        this.errors.push(String((e as Error).stack ?? e));
      }
    };
    requestAnimationFrame(loop);
  }

  private actions() {
    return {
      openModes: () => this.toModes(),
      openGarage: () => this.toGarage(),
      openSettings: () => this.toSettings(),
      back: () => this.back(),
      start: (mode: ModeId, env: EnvId) => void this.startRun(mode, env),
      previewBike: (id: string, livery: number) => this.previewBike(id, livery),
      selectBike: (id: string) => {
        const ok = this.save.select(id);
        if (ok) this.uiSounds.click();
        return ok;
      },
      buyBike: (id: string) => {
        const ok = this.save.buy(id);
        if (ok) {
          this.uiSounds.coin();
          this.screens.toast(`${BIKE_BY_ID.get(id)?.model} garajında!`);
        } else this.uiSounds.error();
        return ok;
      },
      setLivery: (id: string, idx: number) => this.save.setLivery(id, idx),
      upgrade: (id: string, kind: keyof Upgrades) => {
        const ok = this.save.upgrade(id, kind);
        if (ok) this.uiSounds.coin();
        else this.uiSounds.error();
        return ok;
      },
      rev: (on: boolean) => this.setRev(on),
      applySettings: (patch: Partial<Settings>) => this.applySettings(patch),
      resetProgress: () => {
        this.save.reset();
        this.screens.toast('İlerleme sıfırlandı');
        this.previewBike(this.save.data.selectedBike, 0);
      },
      resume: () => this.resume(),
      restart: () => void this.startRun(this.mode, this.env),
      quitToMenu: () => this.quitToMenu(),
      enableTilt: () => this.input.enableTilt(),
      click: () => this.uiSounds.click(),
    };
  }

  // ───────────────────────────── navigation ─────────────────────────────
  private toMenu(): void {
    this.state = 'menu';
    this.showroom.framing = 0.35;
    const sel = this.save.data.selectedBike;
    this.previewBike(sel, this.save.livery(sel));
    this.screens.menu();
  }

  private toModes(): void {
    this.state = 'modes';
    this.showroom.framing = 0;
    this.screens.modes();
  }

  private toGarage(): void {
    if (this.session) this.endRun();
    this.state = 'garage';
    this.showroom.framing = 0;
    this.screens.openGarageAt(this.save.data.selectedBike);
    this.screens.garage();
  }

  private toSettings(): void {
    this.prevScreen = this.state;
    this.state = 'settings';
    this.screens.settings(false);
  }

  private back(): void {
    if (this.screens.screen === 'settings' && this.session && (this.state === 'paused' || this.prevScreen === 'paused')) {
      this.state = 'paused';
      this.screens.pause();
      return;
    }
    this.disposeRev();
    this.toMenu();
  }

  private previewBike(id: string, livery: number): void {
    const spec = BIKE_BY_ID.get(id);
    if (!spec) return;
    this.showroom.setBike(spec, livery);
    if (this.revBike && this.revBike !== id) this.disposeRev();
  }

  private setRev(on: boolean): void {
    this.revOn = on;
    if (!on) return;
    audio.unlock();
    const id = this.screens.garageBike || this.save.data.selectedBike;
    if (!audio.ctx) return;
    if (!this.revEngine || this.revBike !== id) {
      this.disposeRev();
      const spec = getBike(id);
      this.revEngine = new EngineSound(audio, spec, audio.engineBus);
      this.revEngine.start(true);
      this.revBike = id;
      this.revRpm = spec.engine.idle;
    }
  }

  private disposeRev(): void {
    this.revEngine?.dispose();
    this.revEngine = null;
    this.revBike = '';
    this.revOn = false;
    this.showroom.setRev(0);
  }

  private applySettings(patch: Partial<Settings>): void {
    const before = this.save.data.settings;
    this.save.updateSettings(patch);
    const s = this.save.data.settings;
    audio.setVolumes(s.masterVolume, s.engineVolume, s.sfxVolume);
    this.input.sensitivity = s.steerSensitivity;
    this.renderer.speedBlurEnabled = s.speedBlur;
    this.showFps = s.showFps;
    this.input.tiltEnabled = s.tiltControls && this.input.tiltEnabled;
    if (s.quality !== before.quality) {
      this.renderer.applyQuality(s.quality);
      if (this.session) this.screens.toast('Grafik kalitesi bir sonraki sürüşte tamamen uygulanır');
    }
    if (this.view && s.camera !== before.camera) this.view.setCameraMode(s.camera);
    if (this.session && s.autoShift !== before.autoShift) this.session.bike.autoShift = s.autoShift;
  }

  // ───────────────────────────── runs ─────────────────────────────
  async startRun(mode: ModeId, env: EnvId): Promise<void> {
    this.disposeRev();
    this.endRun();
    this.mode = mode;
    this.env = env;
    this.save.data.lastMode = mode;
    this.save.data.lastEnv = env;
    this.save.save();
    this.state = 'loading';
    this.screens.loading('Yol hazırlanıyor…', 0.2);
    await nextFrame();
    await nextFrame();
    const d = this.save.data;
    const bikeId = d.selectedBike;
    const spec = getBike(bikeId);
    this.runSeed = (this.runSeed * 1103515245 + 12345 + Date.now()) % 2147483647 || 7;
    const session = new GameSession({
      bike: spec,
      upgrades: this.save.upgradesFor(bikeId),
      mode: MODE_BY_ID.get(mode)!,
      env: ENV_BY_ID.get(env)!,
      seed: (this.runSeed % 100000) + 1,
      autoShift: d.settings.autoShift,
    });
    this.screens.loading('Trafik ve manzara oluşturuluyor…', 0.6);
    await nextFrame();
    const view = new GameView(this.renderer, session, ENV_BY_ID.get(env)!, this.save.livery(bikeId), d.settings);
    view.lightningCb = (delay) => this.gameAudio.thunder(delay);
    this.session = session;
    this.view = view;
    this.hud = new Hud(this.container, this.input, {
      camera: () => this.cycleCamera(),
      pause: () => this.pause(),
    });
    this.hud.tacho.configure(spec.engine.redline, spec.engine.limiter, spec.transmission !== 'manual', spec.engine.layout === 'ELECTRIC');
    this.hud.setTiltMode(this.input.tiltEnabled);
    this.input.reset();
    this.timeScale = 1;
    this.crashTimer = 0;
    this.countdownShown = -1;
    this.goTimer = 0;
    this.screens.hideAll();
    audio.unlock();
    this.gameAudio.begin(spec, ENV_BY_ID.get(env)!, true);
    // Warm up shaders and GPU buffers so the first frames do not stutter.
    try {
      view.traffic.prewarm(this.renderer.renderer, view.cam.camera, view.scene);
      this.renderer.renderer.compile(view.scene, view.cam.camera);
    } catch (e) {
      console.warn('prewarm failed', e);
    }
    this.state = 'playing';
    this.last = performance.now();
  }

  private endRun(): void {
    this.gameAudio.end();
    this.view?.dispose();
    this.view = null;
    this.session = null;
    this.hud?.dispose();
    this.hud = null;
  }

  private quitToMenu(): void {
    if (this.session && this.state === 'paused' && this.session.state !== 'finished') {
      // Count the abandoned run so progress (distance, cash) is not lost.
      this.session.finish('quit');
      this.recordRun('quit');
    }
    this.endRun();
    audio.resume();
    this.toMenu();
  }

  private pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    audio.suspend();
    this.screens.pause();
  }

  private resume(): void {
    if (!this.session) return;
    this.state = 'playing';
    this.screens.hideAll();
    audio.resume();
    this.input.reset();
    this.last = performance.now();
  }

  private cycleCamera(): void {
    const cur = this.save.data.settings.camera;
    const next = CAMERAS[(CAMERAS.indexOf(cur) + 1) % CAMERAS.length];
    this.save.updateSettings({ camera: next });
    this.view?.setCameraMode(next);
    this.hud?.popup(CAMERA_LABEL[next], '', 'info');
  }

  private recordRun(reason: 'crash' | 'timeUp' | 'quit'): void {
    const s = this.session!;
    const stats = s.score.stats();
    const cash = cashForRun(stats);
    const record = this.save.recordRun(this.mode, stats, cash);
    this.lastStats = stats;
    if (reason !== 'quit') {
      this.screens.gameOver(reason, stats, cash, record, this.mode);
      if (record) this.uiSounds.record();
    } else {
      this.screens.toast(`+$${cash.toLocaleString('tr-TR')} kazanıldı`);
    }
  }

  private onFinish(reason: 'crash' | 'timeUp' | 'quit'): void {
    if (this.state === 'gameover') return;
    this.state = 'gameover';
    this.hud?.setVisible(false);
    this.recordRun(reason);
  }

  // ───────────────────────────── events ─────────────────────────────
  private handleEvent(e: SessionEvent): void {
    const view = this.view!;
    const hud = this.hud!;
    const s = this.session!;
    view.onEvent(e);
    switch (e.type) {
      case 'go':
        this.uiSounds.countdown(true);
        hud.showCenter('BAŞLA!', 'go');
        this.goTimer = 0.9;
        break;
      case 'shift':
        this.gameAudio.shift(e.quick, e.up);
        break;
      case 'limiter':
        this.gameAudio.limiter();
        break;
      case 'overrun':
        this.gameAudio.overrun();
        break;
      case 'land':
        this.gameAudio.land(e.impact);
        break;
      case 'nearMiss': {
        const mult = s.score.multiplier;
        hud.popup('KIL PAYI!', `+${e.points}${e.combo > 1 ? `  ·  x${mult.toFixed(2).replace(/\.?0+$/, '')}` : ''}`, e.car.dir === -1 ? 'red' : 'gold');
        this.gameAudio.whoosh(e.side, e.car.arch.heavy, 1);
        if (Math.random() < 0.3) this.gameAudio.horn(0.07, e.side * 0.6, e.car.arch.heavy);
        break;
      }
      case 'pass':
        if (e.clearance >= 0.9 && e.clearance < 2.4 && s.bike.v > 18) this.gameAudio.whoosh(e.side, e.car.arch.heavy, clamp(1 - e.clearance / 2.4, 0.15, 0.6));
        break;
      case 'honk': {
        const dz = e.car.s - s.bike.s;
        const gain = clamp(0.12 * (60 / Math.max(20, dz)), 0.03, 0.14);
        this.gameAudio.horn(gain, clamp((e.car.d - s.bike.d) / 6, -1, 1), e.car.arch.heavy);
        break;
      }
      case 'hit':
        this.gameAudio.crash(clamp(e.relSpeed / 30, 0.3, 1));
        break;
      case 'crash':
        if (e.reason !== 'traffic') this.gameAudio.crash(clamp(s.bike.v / 30, 0.3, 1));
        break;
      case 'checkpoint':
        hud.popup('KONTROL NOKTASI', `+${e.bonus} sn`, 'green');
        this.uiSounds.checkpoint();
        break;
      case 'timeUp':
        this.uiSounds.buzzer();
        break;
      case 'respawn':
        this.gameAudio.restartEngine(s.cfg.bike);
        this.timeScale = 1;
        this.crashTimer = 0;
        break;
      case 'finish':
        this.onFinish(e.reason);
        break;
      default:
        break;
    }
  }

  // ───────────────────────────── frame ─────────────────────────────
  private frame(now: number): void {
    const dt = clamp((now - this.last) / 1000, 0, 0.1);
    this.last = now;
    this.renderer.renderer.info.reset();
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.fps = this.fpsFrames / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }
    const input = this.input.update(dt);
    if (input.mute) {
      audio.setMuted(!audio.isMuted);
      this.screens.toast(audio.isMuted ? 'Ses kapalı' : 'Ses açık');
    }
    if (input.debug) this.showFps = !this.showFps;

    switch (this.state) {
      case 'playing':
      case 'gameover':
        this.frameRun(dt, input);
        break;
      case 'paused':
        if (input.pause) this.resume();
        this.view?.render();
        break;
      case 'loading':
        break;
      default:
        this.frameMenu(dt);
        break;
    }
  }

  private frameMenu(dt: number): void {
    // Garage engine preview: free-revving with realistic crank inertia.
    if (this.revEngine) {
      const spec = this.revEngine.spec;
      const e = spec.engine;
      const target = this.revOn ? e.limiter * 0.99 : e.layout === 'ELECTRIC' ? 0 : e.idle;
      const upRate = (e.limiter - e.idle) / (spec.style === 'cruiser' || spec.style === 'touring' ? 1.1 : 0.55);
      const downRate = (e.limiter - e.idle) / 1.4;
      this.revRpm = this.revRpm < target ? Math.min(target, this.revRpm + upRate * dt) : Math.max(target, this.revRpm - downRate * dt);
      const bounce = this.revOn && this.revRpm >= e.limiter * 0.985 ? (Math.sin(performance.now() / 22) > 0 ? -0.04 : 0) : 0;
      this.revEngine.update(dt, { rpm: this.revRpm * (1 + bounce), throttle: this.revOn ? 1 : 0, load: this.revOn ? 0.75 : 0.05, distance: 0.2 });
      this.showroom.setRev(this.revOn ? (this.revRpm - e.idle) / (e.limiter - e.idle) : 0);
    }
    this.showroom.update(dt);
    this.showroom.render();
  }

  private frameRun(dt: number, input: FrameInput): void {
    const s = this.session;
    const view = this.view;
    const hud = this.hud;
    if (!s || !view || !hud) return;
    const playing = this.state === 'playing';
    if (playing) {
      if (input.pause) {
        this.pause();
        return;
      }
      if (input.camera) this.cycleCamera();
      if (input.horn) this.gameAudio.playerHorn();
    }
    // Slow motion for the first moments of a crash.
    if (s.state === 'crashed') {
      this.crashTimer += dt;
      this.timeScale = this.crashTimer < 1.3 ? 0.32 : Math.min(1, this.timeScale + dt);
      if (!s.cfg.mode.respawn && this.crashTimer > 3.4 && playing) s.finish('crash');
    }
    const simDt = dt * this.timeScale;
    const rider: RiderInput = { throttle: input.throttle, brake: input.brake, steer: input.steer, wheelie: input.wheelie, shiftUp: input.shiftUp, shiftDown: input.shiftDown };
    let t0 = performance.now();
    if (playing || s.state === 'crashed') s.update(simDt, rider);
    for (const e of s.drainEvents()) this.handleEvent(e);
    if (!this.view) return;
    t0 = this.prof('sim', t0);

    // Countdown display
    if (s.state === 'countdown') {
      const n = Math.ceil(s.countdown);
      if (n !== this.countdownShown && n > 0 && n <= 3) {
        this.countdownShown = n;
        hud.showCenter(String(n), 'count');
        this.uiSounds.countdown(false);
      }
    }
    if (this.goTimer > 0) {
      this.goTimer -= dt;
      if (this.goTimer <= 0) hud.showCenter('');
    }

    view.update(simDt, dt);
    t0 = this.prof('view', t0);

    // Audio
    const b = s.bike;
    const camMode = this.save.data.settings.camera;
    this.gameAudio.frame(dt, {
      engine: {
        rpm: b.rpm,
        throttle: b.throttle,
        load: b.crashed ? 0 : b.throttle * (b.shiftTimer > 0 ? 0.2 : 1),
        distance: camMode === 'helmet' ? 0 : camMode === 'far' ? 0.5 : camMode === 'low' ? 0.12 : 0.25,
      },
      speed: b.v,
      helmet: camMode === 'helmet',
      scrape: b.scraping,
      wheelspin: b.wheelspin,
      braking: b.brake,
      wet: view.env.wet,
      cars: view.audioCars(this.audioCars),
    });
    t0 = this.prof('audio', t0);

    // HUD
    const units = this.save.data.settings.units;
    const sp = units === 'mph' ? b.speedKmh * 0.621371 : b.speedKmh;
    hud.update(
      {
        score: s.score.score,
        distance: s.score.distance,
        speed: sp,
        unit: units === 'mph' ? 'mph' : 'km/s',
        rpm: b.rpm,
        gear: b.gear,
        shiftLight: !b.autoShift && b.rpm > s.cfg.bike.engine.redline * 0.95,
        combo: s.score.combo,
        multiplier: s.score.multiplier,
        nearMisses: s.score.nearMisses,
        timeLeft: s.timeLeft,
        opposite: s.oppositeLaneActive,
        wheelie: b.isWheelie && b.speedKmh >= 50,
        draft: b.draft > 0.35 && b.speedKmh > 60,
        bonusSpeed: b.speedKmh >= 100 && s.state === 'running',
        best: this.save.data.highScores[this.mode] ?? 0,
        manual: !b.autoShift,
      },
      dt,
    );
    if (this.showFps) {
      const i = this.renderer.info();
      hud.setFps(`${this.fps.toFixed(0)} FPS · ${i.calls} çağrı · ${(i.triangles / 1000).toFixed(0)}k üçgen`);
    } else hud.setFps(null);
    t0 = this.prof('hud', t0);
    view.render();
    this.prof('render', t0);
  }

  /** One simulation-only frame (no rendering), used by tests. */
  stepHeadless(dt: number): void {
    const s = this.session;
    if (!s || (this.state !== 'playing' && this.state !== 'gameover')) return;
    const input = this.input.update(dt);
    if (s.state === 'crashed') {
      this.crashTimer += dt;
      if (!s.cfg.mode.respawn && this.crashTimer > 3.4 && this.state === 'playing') s.finish('crash');
    }
    s.update(dt, { throttle: input.throttle, brake: input.brake, steer: input.steer, wheelie: input.wheelie, shiftUp: input.shiftUp, shiftDown: input.shiftDown });
    for (const e of s.drainEvents()) if (this.view) this.handleEvent(e);
    if (this.goTimer > 0) {
      this.goTimer -= dt;
      if (this.goTimer <= 0) this.hud?.showCenter('');
    }
    this.view?.update(dt, dt);
  }

  private onResize(): void {
    this.renderer.resize();
    this.hud?.onResize();
  }

  // ───────────────────────────── test / debug API ─────────────────────────────
  debugApi() {
    const game = this as Game;
    return {
      get state() {
        return game.state;
      },
      get screen() {
        return game.screens.screen;
      },
      get speedKmh() {
        return game.session?.bike.speedKmh ?? 0;
      },
      get gear() {
        return game.session?.bike.gear ?? 0;
      },
      get rpm() {
        return game.session?.bike.rpm ?? 0;
      },
      get sessionState() {
        return game.session?.state ?? null;
      },
      get score() {
        return game.session?.score.score ?? 0;
      },
      get distance() {
        return game.session?.score.distance ?? 0;
      },
      get lane() {
        return game.session?.bike.d ?? 0;
      },
      get traffic() {
        return game.session?.traffic.cars.length ?? 0;
      },
      get fps() {
        return game.fps;
      },
      get errors() {
        return [...game.errors];
      },
      get save() {
        return JSON.parse(JSON.stringify(game.save.data));
      },
      get lastStats() {
        return game.lastStats;
      },
      get audioState() {
        return audio.ctx?.state ?? 'none';
      },
      get audioLevel() {
        return audio.level();
      },
      get memory() {
        const m = game.renderer.renderer.info.memory;
        return { geometries: m.geometries, textures: m.textures };
      },
      renderInfo: () => game.renderer.info(),
      get profile() {
        return { ...game.profile };
      },
      /**
       * Advance the simulation by `seconds` of game time in fixed 1/60 s steps
       * without rendering (lets tests on slow software renderers exercise gameplay).
       */
      advance: (seconds: number) => {
        const steps = Math.round(seconds * 60);
        for (let i = 0; i < steps; i++) game.stepHeadless(1 / 60);
      },
      setInput: (o: Partial<RiderInput>) => {
        game.input.override = o;
      },
      clearInput: () => {
        game.input.override = null;
      },
      start: (mode: ModeId = 'endless', env: EnvId = 'day') => game.startRun(mode, env),
      /** Nearest vehicle ahead of the rider (road-space deltas). */
      nearestCar: () => {
        const s = game.session;
        if (!s) return null;
        let best: { ds: number; dd: number; kind: string; dir: number } | null = null;
        for (const c of s.traffic.cars) {
          const ds = c.s - s.bike.s;
          if (ds < 0) continue;
          if (!best || ds < best.ds) best = { ds, dd: c.d - s.bike.d, kind: c.kind, dir: c.dir };
        }
        return best;
      },
      crash: () => game.session?.bike.crash('traffic'),
      pause: () => game.pause(),
      resume: () => game.resume(),
      /** Remove traffic so automated tests can ride without crashing. */
      clearTraffic: () => {
        const s = game.session;
        if (!s) return;
        for (const c of s.traffic.cars) game.view?.traffic.despawn(c);
        s.traffic.cars = [];
        s.traffic.opts.enabled = false;
      },
    };
  }
}

function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}
