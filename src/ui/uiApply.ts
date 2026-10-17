/**
 * Applies the interface and accessibility settings (src/ui/uiSettings.ts) to the document:
 * root classes and CSS variables that the stylesheets key off, plus the shared UI palette that
 * canvas drawing (the gauge) reads. Cheap and idempotent: call it whenever a setting changes.
 */

interface Reader {
  num(key: string): number;
  bool(key: string): boolean;
  str(key: string): string;
}

export type ColorBlindMode = 'off' | 'protan' | 'deutan' | 'tritan';

export interface UiPalette {
  good: string;
  warn: string;
  bad: string;
  info: string;
  accent: string;
}

const PALETTES: Record<ColorBlindMode, UiPalette> = {
  off: { good: '#34d058', warn: '#ffb020', bad: '#ff3b30', info: '#3aa0ff', accent: '#ff5a1f' },
  // Okabe-Ito based sets: red/green pairs become blue/yellow/vermillion.
  protan: { good: '#56b4e9', warn: '#f0e442', bad: '#e69f00', info: '#0072b2', accent: '#e69f00' },
  deutan: { good: '#56b4e9', warn: '#f0e442', bad: '#d55e00', info: '#0072b2', accent: '#e69f00' },
  tritan: { good: '#009e73', warn: '#cc79a7', bad: '#d55e00', info: '#009e73', accent: '#d55e00' },
};

/** Live palette (mutated in place so canvas code can hold a reference). */
export const UI_PALETTE: UiPalette = { ...PALETTES.off };

export interface HudToggles {
  score: boolean;
  distance: boolean;
  combo: boolean;
  popups: boolean;
  chips: boolean;
  best: boolean;
  hints: boolean;
  buttons: boolean;
  gear: boolean;
  shiftLights: boolean;
  rpm: boolean;
}

export function readHudToggles(s: Reader): HudToggles {
  return {
    score: s.bool('hud.showScore'),
    distance: s.bool('hud.showDistance'),
    combo: s.bool('hud.showCombo'),
    popups: s.bool('hud.popups'),
    chips: s.bool('hud.chips'),
    best: s.bool('hud.showBest'),
    hints: s.bool('hud.hints'),
    buttons: s.bool('hud.buttons'),
    gear: s.bool('hud.showGear'),
    shiftLights: s.bool('hud.shiftLights'),
    rpm: s.bool('hud.showRpm'),
  };
}

export function applyUiSettings(s: Reader, root: HTMLElement = document.documentElement): void {
  const cl = root.classList;
  const flag = (name: string, on: boolean) => cl.toggle(name, on);
  // Accessibility
  flag('a11y-contrast', s.bool('a11y.contrast'));
  flag('a11y-reduce-motion', s.bool('a11y.reduceMotion'));
  flag('a11y-no-flash', s.bool('a11y.reduceFlash'));
  flag('a11y-outline', s.bool('a11y.hudOutline'));
  flag('a11y-large', s.bool('a11y.largeTargets'));
  flag('a11y-focus-always', s.str('a11y.focusRing') === 'always');
  const cb = (['protan', 'deutan', 'tritan'].includes(s.str('a11y.colorBlind')) ? s.str('a11y.colorBlind') : 'off') as ColorBlindMode;
  for (const m of ['protan', 'deutan', 'tritan']) flag(`cb-${m}`, cb === m);
  Object.assign(UI_PALETTE, PALETTES[cb]);
  root.style.setProperty('--c-good', UI_PALETTE.good);
  root.style.setProperty('--c-warn', UI_PALETTE.warn);
  root.style.setProperty('--c-bad', UI_PALETTE.bad);
  root.style.setProperty('--c-info', UI_PALETTE.info);
  if (cb !== 'off') root.style.setProperty('--c-accent', UI_PALETTE.accent);
  else root.style.removeProperty('--c-accent');
  const text = Number(s.str('a11y.textScale')) || 100;
  root.style.fontSize = `${(16 * text) / 100}px`;
  // HUD
  const t = readHudToggles(s);
  flag('hud-no-score', !t.score);
  flag('hud-no-distance', !t.distance);
  flag('hud-no-combo', !t.combo);
  flag('hud-no-popups', !t.popups);
  flag('hud-no-chips', !t.chips);
  flag('hud-no-best', !t.best);
  flag('hud-no-hints', !t.hints);
  flag('hud-no-buttons', !t.buttons);
  for (const l of ['classic', 'center', 'minimal']) flag(`hud-layout-${l}`, s.str('hud.layout') === l);
  root.style.setProperty('--hud-scale', String(s.num('hud.scale') / 100));
  root.style.setProperty('--hud-opacity', String(s.num('hud.opacity') / 100));
  root.style.setProperty('--hud-margin', `${s.num('hud.margin')}px`);
  // Touch controls
  flag('touch-left', s.str('hud.touchLayout') === 'left');
  flag('touch-no-labels', !s.bool('hud.touchLabels'));
  root.style.setProperty('--touch-scale', String(s.num('hud.touchScale') / 100));
  root.style.setProperty('--touch-opacity', String(s.num('hud.touchOpacity') / 100));
  // Menu
  flag('no-menu-tips', !s.bool('ui.tips'));
  flag('no-nav-hints', !s.bool('ui.navHints'));
}

/** Vibrate briefly on touch presses when the setting allows it. */
export function haptic(s: Reader, ms = 12): void {
  if (!s.bool('hud.touchHaptics')) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* unsupported */
  }
}
