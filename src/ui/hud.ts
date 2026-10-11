import type { MissionHudView } from '../game/missions';
import type { InputManager } from '../input/input';
import { clear, fmtDistance, fmtInt, fmtTime, h } from './dom';
import { Tacho } from './tacho';
import './gameplay.css';

export interface HudState {
  score: number;
  distance: number;
  speed: number;
  unit: string;
  rpm: number;
  gear: number;
  shiftLight: boolean;
  combo: number;
  multiplier: number;
  nearMisses: number;
  timeLeft: number | null;
  opposite: boolean;
  wheelie: boolean;
  draft: boolean;
  bonusSpeed: boolean;
  best: number;
  manual: boolean;
}

/** In-ride heads-up display and touch controls. */
export class Hud {
  readonly root: HTMLElement;
  private score: HTMLElement;
  private dist: HTMLElement;
  private combo: HTMLElement;
  private near: HTMLElement;
  private timer: HTMLElement;
  private best: HTMLElement;
  private chips: HTMLElement;
  private popups: HTMLElement;
  private center: HTMLElement;
  private hints: HTMLElement;
  private fps: HTMLElement;
  private chipEls = new Map<string, HTMLElement>();
  readonly tacho = new Tacho();
  private touch: HTMLElement | null = null;
  private lastScore = -1;
  // Career mission panel
  private mission: HTMLElement;
  private mTitle: HTMLElement;
  private mObjective: HTMLElement;
  private mFill: HTMLElement;
  private mValue: HTMLElement;
  private mSecondary: HTMLElement;
  private mHint: HTMLElement;
  private missionTimer = 0;
  private toasts: HTMLElement;
  /** Show a popup every completed kilometre. */
  kmMarkers = false;
  private lastKm = 0;

  constructor(
    parent: HTMLElement,
    private input: InputManager,
    private actions: { camera: () => void; pause: () => void },
  ) {
    this.score = h('div', { class: 'hud-score', 'data-testid': 'hud-score' }, '0');
    this.dist = h('div', { class: 'hud-sub', 'data-testid': 'hud-distance' }, '0 m');
    this.combo = h('div', { class: 'hud-combo' });
    this.near = h('div', { class: 'hud-sub' });
    this.timer = h('div', { class: 'hud-timer', 'data-testid': 'hud-timer' });
    this.best = h('div', { class: 'hud-best' });
    this.chips = h('div', { class: 'hud-chips' });
    this.popups = h('div', { class: 'hud-popups' });
    this.center = h('div', { class: 'hud-center' });
    this.fps = h('div', { class: 'hud-fps' });
    this.mTitle = h('div', { class: 'gp-m-title', 'data-testid': 'mission-title' });
    this.mObjective = h('div', { class: 'gp-m-obj', 'data-testid': 'mission-objective' });
    this.mFill = h('div', { class: 'gp-bar-fill' });
    this.mValue = h('div', { class: 'gp-m-val', 'data-testid': 'mission-progress' });
    this.mSecondary = h('div', { class: 'gp-m-sec' });
    this.mHint = h('div', { class: 'gp-m-hint' });
    this.mission = h('div', { class: 'gp-mission', 'data-testid': 'mission-panel' },
      this.mTitle, this.mObjective, h('div', { class: 'gp-bar' }, this.mFill), this.mValue, this.mSecondary, this.mHint);
    this.mission.style.display = 'none';
    this.toasts = h('div', { class: 'gp-toasts', 'data-testid': 'hud-toasts' });
    this.hints = h(
      'div',
      { class: 'hud-hints' },
      h('span', {}, '↑/W gaz'),
      h('span', {}, '↓/S fren'),
      h('span', {}, '←→/A D direksiyon'),
      h('span', {}, 'Boşluk wheelie'),
      h('span', {}, 'B arkaya bak'),
      h('span', {}, 'C kamera'),
      h('span', {}, 'H korna'),
      h('span', {}, 'Esc duraklat'),
    );
    const speedBox = h('div', { class: 'hud-gauge', 'data-testid': 'hud-gauge' }, this.tacho.canvas);
    this.root = h(
      'div',
      { class: 'hud', 'data-testid': 'hud' },
      h('div', { class: 'hud-tl' }, h('div', { class: 'hud-label' }, 'PUAN'), this.score, this.dist, this.near, this.combo, this.mission),
      h('div', { class: 'hud-tc' }, this.timer, this.best),
      h(
        'div',
        { class: 'hud-tr' },
        h('button', { class: 'icon-btn', title: 'Kamera (C)', 'aria-label': 'Kamera', onclick: () => this.actions.camera() }, '◉'),
        h('button', { class: 'icon-btn', title: 'Duraklat (Esc)', 'aria-label': 'Duraklat', 'data-testid': 'pause-btn', onclick: () => this.actions.pause() }, '❚❚'),
      ),
      this.chips,
      this.toasts,
      this.popups,
      this.center,
      speedBox,
      this.hints,
      this.fps,
    );
    parent.append(this.root);
    if (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) this.buildTouch();
    window.setTimeout(() => this.hints.classList.add('fade'), 7000);
    this.onResize();
  }

  onResize(): void {
    const small = Math.min(window.innerWidth, window.innerHeight) < 520;
    this.tacho.resize(small ? 150 : 220);
  }

  private buildTouch(): void {
    const hold = (el: HTMLElement, on: () => void, off: () => void) => {
      const start = (e: Event) => {
        e.preventDefault();
        el.classList.add('down');
        on();
      };
      const end = (e: Event) => {
        e.preventDefault();
        el.classList.remove('down');
        off();
      };
      el.addEventListener('pointerdown', start);
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
      el.addEventListener('pointerleave', end);
      return el;
    };
    const i = this.input;
    const left = hold(h('div', { class: 'tbtn steer' }, '◀'), () => i.setTouch('left', 1), () => i.setTouch('left', 0));
    const right = hold(h('div', { class: 'tbtn steer' }, '▶'), () => i.setTouch('right', 1), () => i.setTouch('right', 0));
    const gas = hold(h('div', { class: 'tbtn gas' }, 'GAZ'), () => i.setTouch('throttle', 1), () => i.setTouch('throttle', 0));
    const brake = hold(h('div', { class: 'tbtn brake' }, 'FREN'), () => i.setTouch('brake', 1), () => i.setTouch('brake', 0));
    const wheelie = hold(h('div', { class: 'tbtn small' }, 'WHEELIE'), () => i.setTouchWheelie(true), () => i.setTouchWheelie(false));
    const horn = h('div', { class: 'tbtn small', onpointerdown: () => i.touchEdge('horn') }, 'KORNA');
    // Hold to turn the head over the shoulder and read the traffic behind.
    const look = hold(h('div', { class: 'tbtn small', 'data-testid': 'lookback-btn' }, 'ARKAYA BAK'), () => i.setTouchLookBack(true), () => i.setTouchLookBack(false));
    this.touch = h(
      'div',
      { class: 'touch' },
      h('div', { class: 'touch-left' }, left, right),
      h('div', { class: 'touch-right' }, h('div', { class: 'touch-col' }, wheelie, look, horn), brake, gas),
    );
    this.root.append(this.touch);
    this.hints.style.display = 'none';
  }

  setTiltMode(on: boolean): void {
    this.root.classList.toggle('tilt', on);
  }

  setChip(key: string, text: string, on: boolean, cls = ''): void {
    let el = this.chipEls.get(key);
    if (!el) {
      el = h('div', { class: `chip ${cls}` }, text);
      this.chipEls.set(key, el);
      this.chips.append(el);
    }
    el.textContent = text;
    el.classList.toggle('on', on);
  }

  update(s: HudState, dt: number): void {
    if (Math.floor(s.score) !== this.lastScore) {
      this.lastScore = Math.floor(s.score);
      this.score.textContent = fmtInt(s.score);
    }
    this.dist.textContent = fmtDistance(s.distance);
    this.near.textContent = s.nearMisses > 0 ? `Kıl payı: ${s.nearMisses}` : '';
    this.combo.textContent = s.combo > 1 ? `KOMBO x${s.multiplier.toFixed(2).replace(/\.?0+$/, '')}` : '';
    this.combo.classList.toggle('on', s.combo > 1);
    if (s.timeLeft !== null) {
      this.timer.textContent = fmtTime(s.timeLeft);
      this.timer.classList.toggle('warn', s.timeLeft < 10);
    } else this.timer.textContent = '';
    this.best.textContent = s.best > 0 ? `Rekor ${fmtInt(s.best)}` : '';
    this.setChip('opp', 'TERS YÖN x2', s.opposite, 'red');
    this.setChip('wheelie', 'WHEELIE', s.wheelie, 'gold');
    this.setChip('draft', 'RÜZGAR TÜNELİ', s.draft, 'blue');
    this.setChip('bonus', '100+ BONUS', s.bonusSpeed, 'green');
    this.tacho.draw(s.rpm, s.speed, s.unit, s.gear, dt, s.shiftLight);
    if (this.kmMarkers) {
      const km = Math.floor(s.distance / 1000);
      if (km > this.lastKm) this.popup(`${km} KM`, '', 'info');
      this.lastKm = km;
    }
  }

  /** Configure the career objective panel (null hides it). */
  setMission(view: MissionHudView | null, hint: string | null = null): void {
    this.mission.style.display = view ? '' : 'none';
    this.mHint.textContent = hint ?? '';
    this.mHint.style.display = hint ? '' : 'none';
    if (hint) window.setTimeout(() => this.mHint.classList.add('fade'), 9000);
    this.missionTimer = 0;
    if (view) this.renderMission(view);
  }

  /** Refresh the objective panel (throttled to ~10 Hz; the view is cheap but DOM writes are not). */
  updateMission(view: () => MissionHudView, dt: number, force = false): void {
    if (this.mission.style.display === 'none') return;
    this.missionTimer -= dt;
    if (this.missionTimer > 0 && !force) return;
    this.missionTimer = 0.1;
    this.renderMission(view());
  }

  private renderMission(v: MissionHudView): void {
    const set = (el: HTMLElement, t: string) => {
      if (el.textContent !== t) el.textContent = t;
    };
    set(this.mTitle, v.title);
    set(this.mObjective, v.objective);
    set(this.mValue, v.value);
    this.mFill.style.width = `${Math.round(v.progress * 1000) / 10}%`;
    this.mission.classList.toggle('warn', v.warn);
    this.mission.classList.toggle('done', v.progress >= 1);
    set(this.mSecondary, v.secondary ?? '');
    this.mSecondary.style.display = v.secondary ? '' : 'none';
    this.mSecondary.classList.toggle('done', v.secondaryDone);
  }

  /** Short notification at the top of the screen (achievements, level-ups). */
  toast(title: string, sub = '', kind: 'ach' | 'level' | 'info' = 'info'): void {
    const el = h('div', { class: `gp-toast ${kind}` }, h('div', { class: 'gp-toast-title' }, title), sub ? h('div', { class: 'gp-toast-sub' }, sub) : null);
    this.toasts.append(el);
    window.setTimeout(() => el.classList.add('out'), 3200);
    window.setTimeout(() => el.remove(), 3800);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild?.remove();
  }

  popup(text: string, sub = '', cls = ''): void {
    const el = h('div', { class: `popup ${cls}` }, h('div', { class: 'popup-main' }, text), sub ? h('div', { class: 'popup-sub' }, sub) : null);
    this.popups.append(el);
    window.setTimeout(() => el.remove(), 1400);
    while (this.popups.children.length > 4) this.popups.firstElementChild?.remove();
  }

  showCenter(text: string, cls = ''): void {
    clear(this.center);
    if (!text) return;
    const el = h('div', { class: `center-text ${cls}` }, text);
    this.center.append(el);
  }

  setFps(text: string | null): void {
    this.fps.textContent = text ?? '';
    this.fps.style.display = text ? 'block' : 'none';
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? '' : 'none';
  }

  dispose(): void {
    this.root.remove();
  }
}
