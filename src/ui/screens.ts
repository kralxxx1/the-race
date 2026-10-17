import type { MenuIntent } from '../input/input';
import type { ModeId } from '../data/modes';
import type { RunOutcome } from '../game/progress';
import type { RunStats } from '../game/scoring';
import type { SaveData, SaveManager } from '../storage/save';
import { CareerScreen } from './careerScreen';
import { clear, h } from './dom';
import { GarageScreen } from './garageScreen';
import { icon } from './icons';
import { LoadingScreen, type LoadingInfo } from './loadingScreen';
import { MenuScreen } from './menuScreen';
import { MenuNav } from './nav';
import { ModesScreen } from './modesScreen';
import { PauseScreen, type PauseInfo } from './pauseScreen';
import { ProgressScreens } from './progressScreens';
import { ResultScreens } from './resultScreens';
import { RiderScreen } from './riderScreen';
import { SettingsScreen } from './settingsScreen';
import type { DialogSpec, ProgressTab, UiActions, UiCtx } from './ctx';

export type { UiActions, ProgressTab, DialogSpec } from './ctx';
export type { PauseInfo } from './pauseScreen';
export type { LoadingInfo } from './loadingScreen';

/** Where the bike should sit in the viewport for each screen (lens shift as fractions of the viewport). */
function stageFor(name: string, portrait: boolean): { mode: 'menu' | 'garage' | 'rider'; x: number; y: number } {
  switch (name) {
    case 'menu':
      return portrait ? { mode: 'menu', x: 0, y: -0.15 } : { mode: 'menu', x: 0.2, y: 0 };
    case 'garage':
      return portrait ? { mode: 'garage', x: 0, y: -0.22 } : { mode: 'garage', x: 0.02, y: -0.02 };
    case 'rider':
      return portrait ? { mode: 'rider', x: 0, y: -0.22 } : { mode: 'rider', x: 0.2, y: 0 };
    case 'settings':
      return portrait ? { mode: 'menu', x: 0, y: -0.3 } : { mode: 'menu', x: 0.27, y: 0 };
    default:
      return { mode: 'menu', x: 0, y: 0 };
  }
}

/**
 * All menu screens as DOM overlays above the 3D showroom. This class owns the panel framework
 * (one visible panel at a time, entrance transitions), dialogs, toasts and keyboard / gamepad
 * navigation; each screen lives in its own module.
 */
export class Screens implements UiCtx {
  readonly root: HTMLElement;
  readonly nav: MenuNav;
  private panels = new Map<string, HTMLElement>();
  private current = '';
  private stageMode = '';
  private renderers = new Map<string, () => void>();
  private readonly hints: HTMLElement;
  pointerMode = true;

  private readonly menuS: MenuScreen;
  private readonly modesS: ModesScreen;
  private readonly garageS: GarageScreen;
  private readonly riderS: RiderScreen;
  private readonly settingsS: SettingsScreen;
  private readonly careerS: CareerScreen;
  private readonly progressS: ProgressScreens;
  private readonly pauseS: PauseScreen;
  private readonly resultS: ResultScreens;
  private readonly loadingS: LoadingScreen;

  constructor(
    parent: HTMLElement,
    readonly save: SaveManager,
    readonly a: UiActions,
  ) {
    this.root = h('div', { class: 'screens' });
    parent.append(this.root);
    this.hints = h('div', { class: 'nav-hints', 'aria-hidden': 'true' },
      h('span', { class: 'kb' }, h('i', { class: 'kbd' }, '↑↓←→'), 'Gezin'),
      h('span', { class: 'kb' }, h('i', { class: 'kbd' }, 'Enter'), 'Seç'),
      h('span', { class: 'kb' }, h('i', { class: 'kbd' }, 'Esc'), 'Geri'),
      h('span', { class: 'kb' }, h('i', { class: 'kbd' }, 'Q'), h('i', { class: 'kbd' }, 'E'), 'Sekme'),
      h('span', { class: 'pad' }, h('i', { class: 'pad-btn' }, '✥'), 'Gezin'),
      h('span', { class: 'pad' }, h('i', { class: 'pad-btn a' }, 'A'), 'Seç'),
      h('span', { class: 'pad' }, h('i', { class: 'pad-btn b' }, 'B'), 'Geri'),
      h('span', { class: 'pad' }, h('i', { class: 'pad-btn x' }, 'X'), h('i', { class: 'pad-btn y' }, 'Y'), 'Kısayol'),
      h('span', { class: 'pad' }, h('i', { class: 'kbd' }, 'LB'), h('i', { class: 'kbd' }, 'RB'), 'Sekme'),
    );
    this.root.append(this.hints);
    this.nav = new MenuNav(this.root, { back: () => this.onBack(), click: () => a.click(), hover: () => a.hover() });
    this.menuS = new MenuScreen(this);
    this.modesS = new ModesScreen(this);
    this.garageS = new GarageScreen(this);
    this.riderS = new RiderScreen(this);
    this.settingsS = new SettingsScreen(this);
    this.careerS = new CareerScreen(this);
    this.progressS = new ProgressScreens(this);
    this.pauseS = new PauseScreen(this);
    this.resultS = new ResultScreens(this);
    this.loadingS = new LoadingScreen(this);
    window.addEventListener('resize', () => this.restage());
  }

  get data(): SaveData {
    return this.save.data;
  }

  get screen(): string {
    return this.current;
  }

  // ───────────────────────────── framework ─────────────────────────────
  private panel(name: string): HTMLElement {
    let p = this.panels.get(name);
    if (!p) {
      p = h('div', { class: `panel panel-${name}`, 'data-screen': name });
      this.panels.set(name, p);
      this.root.append(p);
    }
    return p;
  }

  /** Render `name` with `render(host)` and make it the visible panel. */
  private open(name: string, render: (host: HTMLElement) => void, opts: { focus?: boolean } = {}): void {
    const host = this.panel(name);
    const same = this.current === name;
    this.closeDialog();
    clear(host);
    this.nav.clearShortcuts();
    render(host);
    this.renderers.set(name, () => {
      this.closeDialog();
      clear(host);
      this.nav.clearShortcuts();
      render(host);
    });
    this.show(name);
    if (!same) this.stage(name);
    if (opts.focus !== false && this.nav.keys) this.nav.focusFirst();
  }

  private show(name: string): void {
    this.current = name;
    for (const [k, p] of this.panels) {
      const on = k === name;
      p.classList.toggle('visible', on);
      // Hidden panels are emptied so test ids and focusable elements never exist twice.
      if (!on && p.firstChild) clear(p);
    }
    this.root.classList.toggle('active', name !== '');
    this.root.dataset.screen = name;
  }

  hideAll(): void {
    this.closeDialog();
    this.show('');
  }

  /** Re-render the visible screen after the save changed under it (daily claim, purchases). */
  refresh(): void {
    this.renderers.get(this.current)?.();
  }

  private restage(): void {
    this.stageMode = '';
    this.stage(this.current);
  }

  private stage(name: string): void {
    if (!['menu', 'garage', 'rider', 'settings', 'modes', 'career', 'progress'].includes(name)) return;
    const portrait = window.innerHeight > window.innerWidth * 1.05 || window.innerWidth < 760;
    const s = stageFor(name, portrait);
    const sr = this.a.showroom;
    const key = `${s.mode}`;
    if (key !== this.stageMode) {
      sr.setMode(s.mode);
      this.stageMode = key;
    }
    sr.setLayout(s.x, s.y);
  }

  private onBack(): void {
    switch (this.current) {
      case 'menu':
      case 'loading':
      case '':
        return;
      case 'pause':
        this.a.resume();
        return;
      case 'gameover':
        return;
      case 'rider':
        this.riderS.back();
        return;
      case 'garage':
        this.garageS.back();
        return;
      default:
        this.a.back();
    }
  }

  // ───────────────────────────── input ─────────────────────────────
  handleIntent(i: MenuIntent): boolean {
    if (!this.current) return false;
    return this.nav.handle(i);
  }

  /** Called when the last-used input device changes (switches the hint glyphs). */
  setDevice(d: 'keyboard' | 'gamepad' | 'pointer'): void {
    this.pointerMode = d === 'pointer';
    this.root.classList.toggle('dev-pad', d === 'gamepad');
  }

  // ───────────────────────────── dialogs and toasts ─────────────────────────────
  dialog(spec: DialogSpec): void {
    this.closeDialog();
    const close = () => this.closeDialog();
    const row = h('div', { class: 'row' },
      h('button', { class: 'btn ghost', type: 'button', 'data-dialog-cancel': '', 'data-testid': 'dialog-cancel', onclick: close }, spec.cancelLabel ?? (spec.confirm ? 'VAZGEÇ' : 'KAPAT')),
      spec.confirm
        ? h('button', { class: `btn ${spec.confirm.cls ?? 'primary'}`, type: 'button', 'data-nav-default': '', 'data-testid': spec.confirm.testid ?? 'dialog-confirm', onclick: () => {
            if (spec.confirm?.run() !== false) close();
          } }, spec.confirm.label)
        : null,
    );
    const dlg = h('div', { class: `dialog ${spec.wide ? 'wide' : ''}`.trim(), role: 'dialog', 'aria-modal': 'true', 'data-testid': spec.testid ?? 'dialog' },
      h('h3', {}, spec.icon ? icon(spec.icon, 22) : null, spec.title),
      ...spec.body,
      row,
    );
    const back = h('div', { class: 'dialog-backdrop' }, dlg);
    back.addEventListener('pointerdown', (e) => {
      if (e.target === back) close();
    });
    this.root.append(back);
    if (this.nav.keys) this.nav.focusFirst();
    else (back.querySelector('[data-nav-default]') as HTMLElement | null)?.focus({ preventScroll: true });
  }

  closeDialog(): void {
    this.root.querySelectorAll('.dialog-backdrop').forEach((d) => d.remove());
  }

  toast(text: string, kind: 'good' | 'bad' | '' = ''): void {
    const t = h('div', { class: `toast ${kind}`.trim(), role: 'status' }, text);
    document.body.append(t);
    window.setTimeout(() => t.classList.add('out'), 2200);
    window.setTimeout(() => t.remove(), 2800);
  }

  // ───────────────────────────── screens ─────────────────────────────
  loading(text: string, progress?: number, info?: LoadingInfo): void {
    if (this.current !== 'loading') {
      const host = this.panel('loading');
      clear(host);
      this.loadingS.render(host, info);
      this.renderers.set('loading', () => undefined);
      this.show('loading');
    }
    this.loadingS.update(text, progress, info);
  }

  menu(): void {
    this.open('menu', (p) => this.menuS.render(p));
  }

  modes(): void {
    this.open('modes', (p) => this.modesS.render(p));
  }

  garage(): void {
    this.open('garage', (p) => this.garageS.render(p));
  }

  get garageBike(): string {
    return this.garageS.selected;
  }

  openGarageAt(id: string): void {
    this.garageS.select(id);
  }

  rider(): void {
    this.open('rider', (p) => this.riderS.render(p));
  }

  settings(inGame = false): void {
    this.open('settings', (p) => this.settingsS.render(p, inGame));
  }

  career(focusCurrent = false): void {
    if (focusCurrent) this.careerS.focusCurrent();
    this.open('career', (p) => this.careerS.render(p));
  }

  progress(tab?: ProgressTab): void {
    if (tab) this.progressS.tab = tab;
    this.open('progress', (p) => this.progressS.render(p));
  }

  pause(info: PauseInfo): void {
    this.open('pause', (p) => this.pauseS.render(p, info));
  }

  gameOver(reason: 'crash' | 'timeUp' | 'quit', stats: RunStats, out: RunOutcome, mode: ModeId): void {
    this.open('gameover', (p) => this.resultS.renderRun(p, reason, stats, out, mode));
  }

  /** Result card of a career mission (complete or failed). */
  missionResult(out: RunOutcome): void {
    this.open('gameover', (p) => this.resultS.renderMission(p, out));
  }
}
