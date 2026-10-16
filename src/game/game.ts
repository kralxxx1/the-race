import { BIKE_BY_ID, getBike } from '../data/bikes';
import { MISSION_BY_ID, missionMode, type MissionDef } from '../data/career';
import { MAP_BY_ID, resolveEnvironment, type MapId, type RunConfig } from '../data/maps';
import { MODE_BY_ID, type ModeId } from '../data/modes';
import { audio } from '../audio/audioEngine';
import { EngineSound } from '../audio/engineSound';
import type { ReverbKind } from '../audio/dsp/impulse';
import { GameAudio, UiSounds, surfaceAt, type AudioCar } from '../audio/gameAudio';
import { clamp } from '../core/math';
import { InputManager, type FrameInput } from '../input/input';
import type { RiderInput, Upgrades } from '../physics/bike';
import { GameView } from '../render/gameView';
import { PerfOverlay } from '../render/perfOverlay';
import { preloadWorld } from '../render/preload';
import { Renderer } from '../render/renderer';
import { Showroom } from '../render/showroom';
import { SETTINGS, SettingsReader, type QualityPreset } from '../settings';
import { SaveManager } from '../storage/save';
import { starString } from '../ui/careerScreen';
import { pavedHalfWidth } from '../world/road';
import { Hud } from '../ui/hud';
import { Screens } from '../ui/screens';
import type { ProgressTab } from '../ui/progressScreens';
import { liveAchContext, reachedAchievements } from './achievements';
import { applyTrafficSettings, autoThrottleActive } from './gameplaySettings';
import { failReasonText, missionHud } from './missions';
import type { RunOutcome, RunRecordInput } from './progress';
import { levelForXp, xpForRun } from './progression';
import type { RunStats } from './scoring';
import { GameSession, type FinishReason, type SessionEvent } from './session';

export type GameState = 'boot' | 'menu' | 'garage' | 'modes' | 'career' | 'progress' | 'settings' | 'loading' | 'playing' | 'paused' | 'gameover';

/** Seconds a clean finish (mission complete, time up) stays on screen before the result card. */
const RESULT_DELAY = 1.6;

/** Top-level state machine wiring simulation, rendering, audio, input and UI. */
export class Game {
  readonly save: SaveManager;
  readonly renderer: Renderer;
  private perf: PerfOverlay;
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
  /** Configuration of the current (or last) run. */
  private run: RunConfig;
  /** Typed view over the saved settings record. */
  readonly settings: SettingsReader;
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
  private lastOutcome: RunOutcome | null = null;
  /** Result card waiting for the finish moment to sink in. */
  private pendingResult: { timer: number; show: () => void } | null = null;
  // Live (in-run) progression toasts.
  private liveTimer = 0;
  private liveLevel = 1;
  private readonly liveShown = new Set<string>();
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
    if (this.save.isNew) this.save.data.settings = SETTINGS.applyPreset(this.save.data.settings, autoQuality());
    this.settings = new SettingsReader(SETTINGS, this.save.data.settings);
    const s = this.settings;
    this.renderer = new Renderer(canvas, s);
    this.perf = new PerfOverlay(container);
    this.renderer.renderer.info.autoReset = false;
    this.input.sensitivity = s.num('ctrl.steerSensitivity');
    this.showFps = s.bool('hud.showFps');
    audio.applySettings(s);
    this.run = { ...this.save.data.lastRun };
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
    // Riders upgrading from an older save may already qualify for early achievements.
    const welcome = this.save.reconcileAchievements();
    this.toMenu();
    if (welcome.length) this.screens.toast(`${welcome.length} başarım açıldı: ${welcome.slice(0, 2).map((a) => a.title).join(', ')}${welcome.length > 2 ? '…' : ''}`);
    this.last = performance.now();
    const loop = (t: number) => {
      requestAnimationFrame(loop);
      // FPS cap (graphics setting): skip display refreshes that are not due yet.
      if (!this.renderer.limiter.shouldRender(t)) return;
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
      openCareer: () => this.toCareer(),
      openProgress: (tab?: ProgressTab) => this.toProgress(tab),
      startMission: (id: string) => void this.startMission(id),
      claimDaily: () => this.claimDaily(),
      openGarage: () => this.toGarage(),
      openSettings: () => this.toSettings(),
      back: () => this.back(),
      start: (cfg: RunConfig) => void this.startRun(cfg),
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
      applySettings: (patch: Readonly<Record<string, unknown>>) => this.applySettings(patch),
      resetProgress: () => {
        this.save.reset();
        this.screens.toast('İlerleme sıfırlandı');
        this.previewBike(this.save.data.selectedBike, 0);
      },
      resume: () => this.resume(),
      restart: () => void this.startRun(this.run),
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

  private toCareer(): void {
    if (this.session) this.endRun(); // coming from a mission result card
    this.state = 'career';
    this.showroom.framing = 0;
    this.screens.career(true);
  }

  private toProgress(tab?: ProgressTab): void {
    this.state = 'progress';
    this.showroom.framing = 0;
    this.screens.progress(tab);
  }

  /** Claim today's daily reward (the progress screen refreshes itself). */
  private claimDaily(): boolean {
    const r = this.save.claimDaily();
    if (!r) {
      this.uiSounds.error();
      return false;
    }
    this.uiSounds.coin();
    this.screens.toast(`Günlük ödül: +$${r.cash.toLocaleString('tr-TR')} · +${r.xp} XP`);
    for (const a of this.save.lastUnlocks) this.screens.toast(`Başarım: ${a.title}`);
    this.screens.refresh();
    return true;
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
      this.showPause();
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
      this.revEngine = new EngineSound(audio, spec, audio.engineBus, 'external');
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

  private applySettings(patch: Readonly<Record<string, unknown>>): void {
    const before = this.save.data.settings;
    this.save.updateSettings(patch);
    const after = this.save.data.settings;
    const s = this.settings;
    s.update(after);
    audio.applySettings(s);
    this.input.sensitivity = s.num('ctrl.steerSensitivity');
    this.showFps = s.bool('hud.showFps');
    this.input.tiltEnabled = s.bool('ctrl.tilt') && this.input.tiltEnabled;
    this.renderer.applySettings();
    const changed = Object.keys(after).filter((k) => after[k] !== before[k]);
    if (this.session && changed.some((k) => SETTINGS.get(k)?.restart)) {
      this.screens.toast('Bazı ayarlar bir sonraki sürüşte uygulanır');
    }
    if (this.session && changed.includes('play.autoShift')) this.session.bike.autoShift = s.str('play.autoShift') === 'auto';
  }

  // ───────────────────────────── runs ─────────────────────────────
  /** Start a career mission (the menus only offer unlocked ones; the debug API may start any). */
  startMission(id: string): Promise<void> {
    const def = MISSION_BY_ID.get(id);
    if (!def) return Promise.resolve();
    return this.startRun({ mode: 'career', missionId: def.id, map: def.map, time: def.time, weather: def.weather });
  }

  async startRun(cfg: RunConfig): Promise<void> {
    this.disposeRev();
    this.endRun();
    const mission: MissionDef | undefined = cfg.mode === 'career' && cfg.missionId ? MISSION_BY_ID.get(cfg.missionId) : undefined;
    // A career run without a known mission is just an endless run.
    if (cfg.mode === 'career' && !mission) cfg = { ...cfg, mode: 'endless', missionId: undefined };
    const map = MAP_BY_ID.get(mission ? mission.map : cfg.map) ?? MAP_BY_ID.get('highway')!;
    this.run = mission
      ? { mode: 'career', missionId: mission.id, map: mission.map, time: mission.time, weather: mission.weather, seed: cfg.seed }
      : {
          ...cfg,
          map: map.id,
          time: map.times.includes(cfg.time) ? cfg.time : map.defaultTime,
          weather: map.weathers.includes(cfg.weather) ? cfg.weather : map.defaultWeather,
        };
    if (this.run.seed === undefined) delete this.run.seed;
    this.save.data.lastRun = { ...this.run };
    this.save.save();
    this.state = 'loading';
    this.screens.loading('Yol hazırlanıyor…', 0.2);
    await nextFrame();
    await nextFrame();
    const d = this.save.data;
    const bikeId = d.selectedBike;
    const spec = getBike(bikeId);
    const env = resolveEnvironment(this.run.map, this.run.time, this.run.weather);
    this.runSeed = (this.runSeed * 1103515245 + 12345 + Date.now()) % 2147483647 || 7;
    const st = this.settings;
    const baseMode = mission ? missionMode(mission) : MODE_BY_ID.get(this.run.mode)!;
    const session = new GameSession({
      bike: spec,
      upgrades: this.save.upgradesFor(bikeId),
      mode: applyTrafficSettings(baseMode, st.str('play.trafficDensity'), st.str('play.difficulty')),
      env,
      seed: this.run.seed ?? (this.runSeed % 100000) + 1,
      autoShift: st.str('play.autoShift') === 'auto',
      mission,
      assists: { autoThrottle: autoThrottleActive(st.str('play.autoThrottle'), isTouchDevice()), wheelie: st.bool('play.wheelieAssist') },
    });
    // CC0 PBR textures and HDRI skies for this environment (falls back to procedural ones offline).
    await preloadWorld(env, this.renderer.profile, (p) => this.screens.loading('Dokular ve gökyüzü yükleniyor…', 0.2 + p * 0.4));
    this.screens.loading('Trafik ve manzara oluşturuluyor…', 0.6);
    await nextFrame();
    const view = new GameView(this.renderer, session, env, this.save.livery(bikeId), this.settings);
    view.lightningCb = (delay) => this.gameAudio.thunder(delay);
    // Secondary impacts of the crash simulation (rider bouncing, bike sliding into the rail, car crumple).
    view.crashImpactCb = (strength, kind) => this.gameAudio.crash(0.25 + strength * 0.55, kind === 'car' ? 'traffic' : kind === 'barrier' ? 'barrier' : 'fall');
    this.session = session;
    this.view = view;
    this.hud = new Hud(this.container, this.input, {
      camera: () => this.hud?.popup('Birinci şahıs kamera', '', 'info'),
      pause: () => this.pause(),
    });
    this.hud.tacho.configure(spec.engine.redline, spec.engine.limiter, spec.transmission !== 'manual', spec.engine.layout === 'ELECTRIC');
    this.hud.setTiltMode(this.input.tiltEnabled);
    this.hud.kmMarkers = st.bool('hud.kmMarkers');
    if (session.mission && st.bool('hud.missionPanel')) {
      this.hud.setMission(missionHud(session.mission), st.bool('play.missionHints') ? session.mission.def.hint : null);
    }
    this.lastOutcome = null;
    this.pendingResult = null;
    this.liveShown.clear();
    this.liveLevel = levelForXp(d.xp);
    this.liveTimer = 1;
    this.input.reset();
    this.timeScale = 1;
    this.crashTimer = 0;
    this.countdownShown = -1;
    this.goTimer = 0;
    this.screens.hideAll();
    audio.unlock();
    this.gameAudio.begin(spec, env, true);
    // Warm up shaders and GPU buffers so the first frames do not stutter.
    try {
      view.traffic.prewarm(this.renderer.renderer, view.cam.camera, view.scene);
      this.renderer.warmup(view.scene, view.cam.camera);
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
    this.pendingResult = null;
    this.endRun();
    audio.resume();
    this.toMenu();
  }

  private pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    audio.suspend();
    this.showPause();
  }

  private showPause(): void {
    const m = this.session?.mission;
    const v = m ? missionHud(m) : null;
    this.screens.pause(v ? { title: v.title, objective: v.objective, value: v.value } : undefined);
  }

  private resume(): void {
    if (!this.session) return;
    this.state = 'playing';
    this.screens.hideAll();
    audio.resume();
    this.input.reset();
    this.last = performance.now();
  }

  /** Commit the finished run to the save (cash, XP, stats, career, achievements) and show its result. */
  private recordRun(reason: FinishReason): void {
    const s = this.session!;
    const stats = s.score.stats();
    const tracker = s.mission;
    const rec: RunRecordInput = {
      mode: this.run.mode,
      map: this.run.map,
      time: this.run.time,
      weather: this.run.weather,
      bikeId: s.cfg.bike.id,
      stats,
      crashed: s.bike.crashed,
      mission: tracker ? { def: tracker.def, result: tracker.result() } : null,
      now: Date.now(),
    };
    const out = this.save.commitRun(rec);
    this.lastStats = stats;
    this.lastOutcome = out;
    if (reason === 'quit') {
      this.screens.toast(`+$${out.cash.toLocaleString('tr-TR')} · +${out.xp} XP`);
      return;
    }
    const show = () => {
      this.hud?.setVisible(false);
      if (out.mission) this.screens.missionResult(out);
      else this.screens.gameOver(reason === 'timeUp' ? 'timeUp' : 'crash', stats, out, this.run.mode);
      if (out.record || (out.mission && out.mission.result.status === 'complete' && out.mission.newStars > 0)) this.uiSounds.record();
    };
    // A clean finish keeps the world rolling for a moment before the card covers it.
    if (reason === 'missionComplete' || reason === 'timeUp' || (reason === 'missionFailed' && !s.bike.crashed)) this.pendingResult = { timer: RESULT_DELAY, show };
    else show();
  }

  private tickResult(dt: number): void {
    const p = this.pendingResult;
    if (!p) return;
    p.timer -= dt;
    if (p.timer > 0) return;
    this.pendingResult = null;
    p.show();
  }

  private onFinish(reason: FinishReason): void {
    if (this.state === 'gameover') return;
    this.state = 'gameover';
    this.recordRun(reason);
  }

  /** Toasts for achievements and level-ups reached during the run (the save is only updated at the end). */
  private updateLive(dt: number): void {
    const s = this.session;
    const hud = this.hud;
    if (!s || !hud || s.state === 'countdown') return;
    this.liveTimer -= dt;
    if (this.liveTimer > 0) return;
    this.liveTimer = 0.5;
    const d = this.save.data;
    const stats = s.score.stats();
    const runXp = xpForRun(stats);
    const toasts = this.settings.bool('play.achievementToasts');
    const ctx = liveAchContext(d, { stats, crashed: s.state === 'crashed', missionCompleted: false, time: this.run.time, weather: this.run.weather, countRun: false }, this.run.map, runXp);
    for (const a of reachedAchievements(d.achievements, ctx, this.liveShown)) {
      this.liveShown.add(a.id);
      if (toasts) {
        hud.toast('BAŞARIM AÇILDI', `${a.title} · +$${a.reward.cash.toLocaleString('tr-TR')}`, 'ach');
        this.uiSounds.record();
      }
    }
    if (ctx.level > this.liveLevel) {
      this.liveLevel = ctx.level;
      if (toasts) {
        hud.toast('SEVİYE ATLADIN!', `Seviye ${ctx.level}`, 'level');
        this.uiSounds.coin();
      }
    }
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
        if (Math.random() < 0.3) this.gameAudio.horn(0.07, e.side * 0.6, e.car.arch.heavy, e.car.kind);
        break;
      }
      case 'pass':
        if (e.clearance >= 0.9 && e.clearance < 2.4 && s.bike.v > 18) this.gameAudio.whoosh(e.side, e.car.arch.heavy, clamp(1 - e.clearance / 2.4, 0.15, 0.6));
        break;
      case 'honk': {
        const dz = e.car.s - s.bike.s;
        const gain = clamp(0.12 * (60 / Math.max(20, dz)), 0.03, 0.14);
        this.gameAudio.horn(gain, clamp((e.car.d - s.bike.d) / 6, -1, 1), e.car.arch.heavy, e.car.kind);
        break;
      }
      case 'hit':
        this.gameAudio.crash(clamp(e.relSpeed / 30, 0.3, 1), 'traffic');
        break;
      case 'crash':
        if (e.reason !== 'traffic') this.gameAudio.crash(clamp(s.bike.v / 30, 0.3, 1), e.reason === 'barrier' ? 'barrier' : 'fall');
        break;
      case 'checkpoint':
        hud.popup('KONTROL NOKTASI', `+${e.bonus} sn`, 'green');
        this.uiSounds.checkpoint();
        break;
      case 'timeUp':
        this.uiSounds.buzzer();
        break;
      case 'missionArmed':
        hud.popup('HIZA ULAŞTIN', 'Altına düşme!', 'green');
        break;
      case 'missionComplete':
        hud.popup('GÖREV TAMAMLANDI', starString(e.stars), 'gold');
        this.uiSounds.checkpoint();
        break;
      case 'missionFailed':
        hud.popup('GÖREV BAŞARISIZ', failReasonText(e.reason), 'red');
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
    // The overlay reports the previous frame's counters, so it reads them before they are reset.
    this.perf.update(this.renderer, this.settings.str('gfx.perfOverlay') as 'off' | 'fps' | 'full', now);
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

  /**
   * Sim + events + view update of one frame (no audio, HUD or drawing), shared by the real
   * frame loop and the headless test stepper. Returns false when the run ended mid-frame.
   */
  private simulateFrame(dt: number, input: FrameInput): boolean {
    const s = this.session;
    const view = this.view;
    const hud = this.hud;
    if (!s || !view || !hud) return false;
    const playing = this.state === 'playing';
    // Crash sequence: slow motion, first-person tumble and cinematic replay are directed by the view.
    if (s.state === 'crashed') {
      this.crashTimer += dt;
      this.timeScale = view.crashTimeScale(this.crashTimer);
      if (!s.cfg.mode.respawn && this.crashTimer > view.crashSequenceLength() && playing) s.finishAfterCrash();
    }
    const simDt = dt * this.timeScale;
    const rider: RiderInput = { throttle: input.throttle, brake: input.brake, steer: input.steer, wheelie: input.wheelie, shiftUp: input.shiftUp, shiftDown: input.shiftDown };
    if (playing || s.state === 'crashed' || s.state === 'finished') s.update(simDt, rider);
    for (const e of s.drainEvents()) this.handleEvent(e);
    this.tickResult(dt);
    if (!this.view) return false;
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
    view.lookBack = input.lookBack && playing;
    view.update(simDt, dt);
    return true;
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
      if (input.horn) this.gameAudio.playerHorn();
    }
    let t0 = performance.now();
    if (!this.simulateFrame(dt, input)) return;
    t0 = this.prof('view', t0);

    // Audio
    const b = s.bike;
    this.gameAudio.frame(dt, {
      engine: {
        rpm: b.rpm,
        throttle: b.throttle,
        load: b.crashed ? 0 : b.throttle * (b.shiftTimer > 0 ? 0.2 : 1),
        distance: 0,
      },
      speed: b.v,
      helmet: true,
      scrape: b.scraping,
      wheelspin: b.wheelspin,
      braking: b.brake,
      wet: view.env.wet,
      cars: view.audioCars(this.audioCars),
      surface: surfaceAt(b.d, pavedHalfWidth(s.lanes), view.env.id.endsWith(':snow')),
      lean: b.lean,
      crashed: b.crashed,
      zone: view.audioZone(),
    });
    t0 = this.prof('audio', t0);

    // HUD
    const units = this.settings.str('hud.units');
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
        best: this.save.data.highScores[this.run.mode] ?? 0,
        manual: !b.autoShift,
      },
      dt,
    );
    if (s.mission) hud.updateMission(() => missionHud(s.mission!), dt, !s.mission.running);
    if (playing) this.updateLive(dt);
    if (playing && s.state === 'running') this.renderer.adapt(this.fps, dt);
    if (this.showFps) {
      const i = this.renderer.info();
      hud.setFps(`${this.fps.toFixed(0)} FPS · ${i.calls} çağrı · ${(i.triangles / 1000).toFixed(0)}k üçgen · ${Math.round(this.renderer.resolutionScale * 100)}% çözünürlük`);
    } else hud.setFps(null);
    t0 = this.prof('hud', t0);
    view.render();
    this.prof('render', t0);
  }

  /** One full simulation + view frame without audio/HUD/drawing (slow-motion crash, head motion). */
  stepFull(dt: number): void {
    if (!this.session || !this.view || (this.state !== 'playing' && this.state !== 'gameover')) return;
    this.simulateFrame(dt, this.input.update(dt));
  }

  /** One simulation-only frame (no rendering), used by tests. */
  stepHeadless(dt: number): void {
    const s = this.session;
    if (!s || (this.state !== 'playing' && this.state !== 'gameover')) return;
    const input = this.input.update(dt);
    if (s.state === 'crashed') {
      this.crashTimer += dt;
      if (!s.cfg.mode.respawn && this.crashTimer > 3.4 && this.state === 'playing') s.finishAfterCrash();
    }
    s.update(dt, { throttle: input.throttle, brake: input.brake, steer: input.steer, wheelie: input.wheelie, shiftUp: input.shiftUp, shiftDown: input.shiftDown });
    for (const e of s.drainEvents()) if (this.view) this.handleEvent(e);
    this.tickResult(dt);
    if (this.state === 'playing') this.updateLive(dt);
    if (s.mission && this.hud) this.hud.updateMission(() => missionHud(s.mission!), dt);
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
      get audioBackend() {
        return audio.ctx ? (audio.workletReady ? 'worklet' : 'script') : 'none';
      },
      /** Force an acoustic zone ('tunnel', 'canyon'…) or pass null for the map's own. */
      setAudioZone: (z: ReverbKind | null) => {
        game.gameAudio.zoneOverride = z;
      },
      get memory() {
        const m = game.renderer.renderer.info.memory;
        return { geometries: m.geometries, textures: m.textures };
      },
      renderInfo: () => game.renderer.info(),
      /** Debug: the live render view (cameras, mirrors, crash) for tooling. */
      get view() {
        return game.view;
      },
      get profile() {
        return { ...game.profile };
      },
      /**
       * Advance the simulation by `seconds` of game time in fixed 1/60 s steps
       * without rendering (lets tests on slow software renderers exercise gameplay).
       */
      advance: (seconds: number, full = false) => {
        // `full` also runs the view (head motion, crash sequence) in 1/30 s frames.
        const hz = full ? 30 : 60;
        const steps = Math.round(seconds * hz);
        for (let i = 0; i < steps; i++) (full ? game.stepFull(1 / hz) : game.stepHeadless(1 / hz));
      },
      setInput: (o: Partial<FrameInput>) => {
        game.input.override = o;
      },
      clearInput: () => {
        game.input.override = null;
      },
      /** Start a run: `start('endless', 'highway', 'night', 'rain')`. */
      start: (mode: ModeId = 'endless', map: MapId = 'highway', time?: RunConfig['time'], weather?: RunConfig['weather']) => {
        const m = MAP_BY_ID.get(map) ?? MAP_BY_ID.get('highway')!;
        return game.startRun({ mode, map: m.id, time: time ?? m.defaultTime, weather: weather ?? m.defaultWeather });
      },
      /** Start a career mission by id ("suburb-01"…"industrial-10"), bypassing the unlock check. */
      startMission: (id: string) => game.startMission(id),
      /** Live state of the running career mission (null outside missions). */
      get mission() {
        const m = game.session?.mission;
        if (!m) return null;
        const v = missionHud(m);
        return {
          id: m.def.id,
          number: m.def.number,
          type: m.def.objective.type,
          status: m.status,
          failReason: m.failReason,
          progress: m.progress,
          stars: m.stars,
          timeLeft: m.timeLeft,
          text: v.value,
          objective: v.objective,
          secondaryMet: m.secondaryMet,
        };
      },
      /** Rewards and unlocks of the last finished run. */
      get lastOutcome() {
        return game.lastOutcome ? JSON.parse(JSON.stringify(game.lastOutcome)) : null;
      },
      get level() {
        return game.save.level;
      },
      get xp() {
        return game.save.data.xp;
      },
      get achievementCount() {
        return Object.keys(game.save.data.achievements).length;
      },
      claimDaily: () => game.claimDaily(),
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

/** Pick a sensible first-launch quality from the device class. */
function autoQuality(): QualityPreset {
  const cores = navigator.hardwareConcurrency || 4;
  const mobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  if (mobile) return cores >= 8 ? 'medium' : 'low';
  return cores >= 8 ? 'high' : 'medium';
}

function isTouchDevice(): boolean {
  return matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
}

function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}
