import type { RunConfig } from '../data/maps';
import type { RiderGear } from '../data/riderGear';
import type { Upgrades } from '../physics/bike';
import type { Showroom } from '../render/showroom';
import type { SaveManager } from '../storage/save';
import { h } from './dom';
import { icon } from './icons';
import type { MenuNav } from './nav';

export type ProgressTab = 'achievements' | 'stats' | 'leaderboards' | 'daily';

/** Everything the screens may ask the game to do. */
export interface UiActions {
  openMenu(): void;
  openModes(): void;
  openCareer(): void;
  openProgress(tab?: ProgressTab): void;
  startMission(id: string): void;
  claimDaily(): boolean;
  openGarage(): void;
  openRider(): void;
  openSettings(): void;
  back(): void;
  start(cfg: RunConfig): void;
  previewBike(id: string, livery: number): void;
  selectBike(id: string): boolean;
  buyBike(id: string): boolean;
  setLivery(id: string, idx: number): void;
  upgrade(id: string, kind: keyof Upgrades): boolean;
  rev(on: boolean): void;
  applySettings(patch: Readonly<Record<string, unknown>>): void;
  resetProgress(): void;
  resume(): void;
  restart(): void;
  quitToMenu(): void;
  enableTilt(): Promise<boolean>;
  click(): void;
  hover(): void;
  /** Rider screen: commit the gear to the save. */
  setGear(gear: RiderGear): void;
  /** Rider screen: preview a draft on the rider model (null = the saved gear). */
  previewGear(gear: RiderGear | null): void;
  /** Offscreen render of a bike as a data URL (cached); null when thumbnails are off or unsupported. */
  thumb(bikeId: string, livery: number): Promise<string | null>;
  /** The studio behind the menus. */
  readonly showroom: Showroom;
  /** GPU name / renderer line for the settings screen. */
  gpuInfo(): string;
}

export interface DialogSpec {
  title: string;
  icon?: string;
  body: (Node | string | null)[];
  confirm?: { label: string; cls?: string; testid?: string; run(): boolean | void };
  cancelLabel?: string;
  wide?: boolean;
  testid?: string;
}

/** Shared services every screen module gets. */
export interface UiCtx {
  readonly save: SaveManager;
  readonly a: UiActions;
  readonly nav: MenuNav;
  dialog(spec: DialogSpec): void;
  closeDialog(): void;
  toast(text: string, kind?: 'good' | 'bad' | ''): void;
  /** True when the player navigates with the keyboard or a pad (hide hover-only affordances). */
  readonly pointerMode: boolean;
}

export interface HeaderOpts {
  title: string;
  icon?: string;
  sub?: string;
  backTestid?: string;
  onBack?: () => void;
  right?: (Node | null)[];
}

/** Standard screen header: back button, title, right-hand chips. */
export function header(ctx: UiCtx, o: HeaderOpts): HTMLElement {
  return h('div', { class: 'head' },
    h('button', { class: 'btn ghost back', 'data-testid': o.backTestid ?? 'btn-back', 'data-nid': 'back', onclick: () => (o.onBack ? o.onBack() : ctx.a.back()) }, icon('left', 18), 'GERİ'),
    h('div', { class: 'title' }, o.icon ? icon(o.icon, 24) : null, o.title, o.sub ? h('small', {}, o.sub) : null),
    h('div', { class: 'right' }, o.right ?? []),
  );
}

/** Button that plays the click sound (the nav layer also does it globally, this is for testids/classes). */
export function btn(label: string | (Node | string)[], onclick: () => void, cls = '', testid?: string, ico?: string): HTMLButtonElement {
  const kids = Array.isArray(label) ? label : [label];
  return h('button', { class: `btn ${cls}`.trim(), type: 'button', 'data-testid': testid, onclick }, ico ? icon(ico, 18) : null, ...kids);
}
