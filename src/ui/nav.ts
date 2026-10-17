import type { MenuDir, MenuIntent } from '../input/input';

export interface NavHooks {
  /** Esc / B with no dialog open: the screen's own "go back". */
  back(): void;
  click(): void;
  hover(): void;
}

type AltKind = 'alt' | 'alt2' | 'start';

const SELECTOR = 'button, [role="button"], [data-nav], input, select, textarea, a[href]';

function visible(el: HTMLElement): boolean {
  if (el.hasAttribute('disabled') || el.hasAttribute('data-nav-skip') || el.closest('[inert],[hidden],.leaving,[data-nav-skip]')) return false;
  if (el instanceof HTMLInputElement && el.type === 'hidden') return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.display !== 'none';
}

/** Spatial score of moving from `a` to `b` in `dir` (lower is better, null = not in that direction). */
export function navScore(a: DOMRect, b: DOMRect, dir: MenuDir): number | null {
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  const bx = b.left + b.width / 2;
  const by = b.top + b.height / 2;
  const horizontal = dir === 'left' || dir === 'right';
  const sign = dir === 'right' || dir === 'down' ? 1 : -1;
  const along = (horizontal ? bx - ax : by - ay) * sign;
  if (along < 3) return null;
  const across = Math.abs(horizontal ? by - ay : bx - ax);
  const overlap = horizontal ? Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) : Math.min(a.right, b.right) - Math.max(a.left, b.left);
  return along + across * (overlap > 4 ? 0.35 : 3);
}

/**
 * Keyboard / gamepad navigation over the visible menu panel: spatial focus movement, activation,
 * back, tab switching and screen-specific shortcuts. Pointer use hides the focus ring again.
 */
export class MenuNav {
  /** Focus rings are shown while the player navigates with keys or the pad. */
  keys = false;
  /** Active screen shortcuts (X / Y / Start on the pad). */
  readonly shortcuts: Partial<Record<AltKind, () => void>> = {};
  private lastHover: Element | null = null;
  private lastMove = { x: 0, y: 0 };

  constructor(
    private readonly root: HTMLElement,
    private readonly hooks: NavHooks,
  ) {
    root.addEventListener('pointerdown', () => this.setKeys(false), true);
    root.addEventListener('pointermove', (e) => {
      if (Math.abs(e.clientX - this.lastMove.x) + Math.abs(e.clientY - this.lastMove.y) > 6) this.setKeys(false);
      this.lastMove = { x: e.clientX, y: e.clientY };
    });
    root.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse') return;
      const t = (e.target as HTMLElement).closest('button, .card, [data-hover], [role="button"], .bike-card, label');
      if (t && t !== this.lastHover && !t.hasAttribute('disabled')) this.hooks.hover();
      this.lastHover = t;
    });
    root.addEventListener(
      'click',
      (e) => {
        const t = e.target as HTMLElement;
        if (t.closest('button:not([data-silent]):not([disabled]), [role="button"], [data-click], select, .toggle, .bike-card, .card.pick')) this.hooks.click();
      },
      true,
    );
  }

  private setKeys(on: boolean): void {
    if (this.keys === on) return;
    this.keys = on;
    this.root.classList.toggle('nav-keys', on);
  }

  /** The dialog on top, if any, else the visible panel. */
  private container(): HTMLElement | null {
    return this.root.querySelector<HTMLElement>('.dialog-backdrop') ?? this.root.querySelector<HTMLElement>('.panel.visible:not(.leaving)');
  }

  candidates(): HTMLElement[] {
    const c = this.container();
    if (!c) return [];
    return [...c.querySelectorAll<HTMLElement>(SELECTOR)].filter(visible);
  }

  private current(c: HTMLElement): HTMLElement | null {
    const a = document.activeElement;
    return a instanceof HTMLElement && c.contains(a) && a !== c && visible(a) ? a : null;
  }

  focusFirst(): void {
    const c = this.container();
    if (!c) return;
    const list = this.candidates();
    const pref = list.find((e) => e.hasAttribute('data-nav-default')) ?? list.find((e) => e.classList.contains('primary')) ?? list[0];
    this.focus(pref);
  }

  private focus(el: HTMLElement | undefined): void {
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    this.hooks.hover();
  }

  move(dir: MenuDir): void {
    const c = this.container();
    if (!c) return;
    const cur = this.current(c);
    if (!cur) {
      this.focusFirst();
      return;
    }
    const a = cur.getBoundingClientRect();
    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    for (const el of this.candidates()) {
      if (el === cur) continue;
      const s = navScore(a, el.getBoundingClientRect(), dir);
      if (s !== null && s < bestScore) {
        bestScore = s;
        best = el;
      }
    }
    if (best) this.focus(best);
    else {
      // Nothing that way: scroll the nearest scrolling ancestor so off-screen rows can come into reach.
      const sc = cur.closest<HTMLElement>('[data-keep], .scroll');
      const step = dir === 'down' ? 140 : dir === 'up' ? -140 : 0;
      if (sc && step) sc.scrollBy({ top: step });
    }
  }

  /** Pad movement on a slider or select changes its value instead of moving focus. */
  private adjust(el: HTMLElement, dir: MenuDir): boolean {
    if (el instanceof HTMLInputElement && el.type === 'range' && (dir === 'left' || dir === 'right')) {
      const step = Number(el.step) || 1;
      const v = Number(el.value) + (dir === 'right' ? step : -step);
      el.value = String(Math.min(Number(el.max), Math.max(Number(el.min), v)));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    if (el instanceof HTMLSelectElement) {
      const d = dir === 'down' || dir === 'right' ? 1 : dir === 'up' || dir === 'left' ? -1 : 0;
      const i = Math.min(el.options.length - 1, Math.max(0, el.selectedIndex + d));
      if (i !== el.selectedIndex) {
        el.selectedIndex = i;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return true;
    }
    return false;
  }

  private tabs(step: number): void {
    const c = this.container();
    if (!c) return;
    const group = [...c.querySelectorAll<HTMLElement>('[data-tabs]')].find((g) => visible(g));
    if (!group) return;
    const tabs = [...group.children].filter((t): t is HTMLElement => t instanceof HTMLElement && !t.hasAttribute('disabled'));
    const i = tabs.findIndex((t) => t.classList.contains('sel') || t.getAttribute('aria-selected') === 'true');
    const next = tabs[Math.min(tabs.length - 1, Math.max(0, (i < 0 ? 0 : i) + step))];
    if (next && next !== tabs[i]) next.click();
  }

  /** Apply one navigation intent. Returns true when it did something. */
  handle(intent: MenuIntent): boolean {
    const c = this.container();
    if (!c) return false;
    this.setKeys(true);
    switch (intent.kind) {
      case 'move': {
        const cur = this.current(c);
        if (cur && intent.source === 'pad' && this.adjust(cur, intent.dir)) return true;
        this.move(intent.dir);
        return true;
      }
      case 'confirm': {
        const cur = this.current(c);
        if (!cur) this.focusFirst();
        else if (cur instanceof HTMLSelectElement) this.adjust(cur, 'down');
        else cur.click();
        return true;
      }
      case 'back': {
        const dlg = this.root.querySelector<HTMLElement>('.dialog-backdrop [data-dialog-cancel]');
        if (dlg) dlg.click();
        else this.hooks.back();
        return true;
      }
      case 'tabPrev':
        this.tabs(-1);
        return true;
      case 'tabNext':
        this.tabs(1);
        return true;
      case 'alt':
      case 'alt2':
      case 'start':
        this.shortcuts[intent.kind]?.();
        return !!this.shortcuts[intent.kind];
    }
  }

  clearShortcuts(): void {
    delete this.shortcuts.alt;
    delete this.shortcuts.alt2;
    delete this.shortcuts.start;
  }
}
