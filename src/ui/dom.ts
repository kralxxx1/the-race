type Attrs = Record<string, string | number | boolean | ((e: Event) => void) | undefined>;
type Child = Node | string | number | null | undefined | false;

/** Minimal hyperscript helper for building the DOM UI. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (k === 'class') {
      el.className = String(v);
    } else if (v === true) {
      el.setAttribute(k, '');
    } else {
      el.setAttribute(k, String(v));
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function fmtInt(n: number): string {
  return Math.floor(n).toLocaleString('tr-TR');
}

export function fmtMoney(n: number): string {
  return `$${Math.floor(n).toLocaleString('tr-TR')}`;
}

export function fmtDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.floor(m)} m`;
}

export function fmtTime(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

/** Signed number with an explicit "+" for positive values. */
export function fmtSigned(n: number, digits = 0): string {
  const v = Number(n.toFixed(digits));
  return `${v > 0 ? '+' : ''}${v.toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function fmtDecimal(n: number, digits = 1): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Turkish upper-casing ("i" becomes "İ"). */
export function upper(s: string): string {
  return s.toLocaleUpperCase('tr-TR');
}

/**
 * Re-render a screen in place while keeping the scroll position of `[data-keep]` containers and
 * the focused element (`data-nid`), so clicking inside long lists does not jump the view.
 */
export function rerender(host: HTMLElement, build: () => void): void {
  const scrolls = new Map<string, [number, number]>();
  host.querySelectorAll<HTMLElement>('[data-keep]').forEach((el) => scrolls.set(el.dataset.keep as string, [el.scrollTop, el.scrollLeft]));
  const act = document.activeElement;
  const active = act instanceof HTMLElement && host.contains(act) ? act.dataset.nid : undefined;
  clear(host);
  build();
  host.querySelectorAll<HTMLElement>('[data-keep]').forEach((el) => {
    const s = scrolls.get(el.dataset.keep as string);
    if (s) {
      el.scrollTop = s[0];
      el.scrollLeft = s[1];
    }
  });
  if (active) host.querySelector<HTMLElement>(`[data-nid="${CSS.escape(active)}"]`)?.focus({ preventScroll: true });
}

/** Trailing-edge debounce. */
export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number): (...a: A) => void {
  let t = 0;
  return (...a: A) => {
    window.clearTimeout(t);
    t = window.setTimeout(() => fn(...a), ms);
  };
}

export function clampN(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
