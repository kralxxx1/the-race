import { levelProgress } from '../game/progression';
import { fmtInt, fmtMoney, h } from './dom';
import { icon } from './icons';

/** Small building blocks shared by every screen. */

export function starString(n: number, of = 3): string {
  return '★'.repeat(Math.max(0, Math.min(of, n))) + '☆'.repeat(Math.max(0, of - Math.max(0, n)));
}

/** Row of star icons (filled up to `n`). */
export function starsEl(n: number, of = 3, testid?: string, size = 16): HTMLElement {
  const el = h('span', { class: 'stars', 'data-testid': testid, 'data-stars': String(n), role: 'img', 'aria-label': `${n} / ${of} yıldız` });
  for (let i = 0; i < of; i++) {
    const s = icon(i < n ? 'starFill' : 'star', size);
    if (i < n) s.classList.add('on');
    el.append(s);
  }
  return el;
}

/** Horizontal progress bar (value 0..1). */
export function bar(value: number, cls = ''): HTMLElement {
  const fill = h('i', { style: `width:${Math.round(Math.max(0, Math.min(1, value)) * 1000) / 10}%` });
  return h('div', { class: `bar ${cls}`.trim() }, fill);
}

/** "Seviye 7" badge + XP bar (menu profile card, results, progress screen). */
export function levelBar(xp: number, testid = 'rider-level'): HTMLElement {
  const lp = levelProgress(xp);
  return h('div', { class: 'level-bar', 'data-testid': testid },
    h('div', { class: 'level-badge' }, h('small', {}, 'SEVİYE'), h('b', { 'data-testid': `${testid}-value` }, String(lp.level))),
    h('div', { class: 'level-body' },
      bar(lp.fraction, 'thick'),
      h('div', { class: 'level-xp' }, lp.max ? `${fmtInt(xp)} XP · azami seviye` : `${fmtInt(lp.into)} / ${fmtInt(lp.span)} XP`),
    ),
  );
}

export function cashChip(cash: number, testid?: string): HTMLElement {
  return h('div', { class: 'cash', 'data-testid': testid }, icon('coin', 18), fmtMoney(cash));
}

/** Label + value pair used in spec sheets. */
export function kv(label: string, value: string | Node, cls = ''): HTMLElement {
  return h('div', { class: `kv ${cls}`.trim() }, h('span', {}, label), h('b', {}, value));
}

/** Big number with a caption underneath. */
export function statTile(value: string, label: string, ico?: string, testid?: string): HTMLElement {
  return h('div', { class: 'stat-tile', 'data-testid': testid }, ico ? icon(ico, 20) : null, h('b', {}, value), h('span', {}, label));
}

export function chipEl(text: string, ico?: string, cls = ''): HTMLElement {
  return h('span', { class: `chip static ${cls}`.trim() }, ico ? icon(ico, 14) : null, text);
}

/** (?) button with a hover / focus / tap tooltip. */
export function tip(text: string): HTMLElement {
  const btn = h('button', { class: 'tip-btn', type: 'button', 'aria-label': 'Açıklama', 'data-nav-skip': '' }, '?');
  const pop = h('span', { class: 'tip-pop', role: 'tooltip' }, text);
  // Touch: tap toggles it, tapping elsewhere closes it.
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = btn.classList.toggle('open');
    if (open) {
      const close = () => {
        btn.classList.remove('open');
        window.removeEventListener('pointerdown', close, true);
      };
      window.addEventListener('pointerdown', close, true);
    }
  });
  return h('span', { class: 'tip' }, btn, pop);
}

/** Count a number up inside `el` (instant when `instant`). Returns when the animation ends. */
export function countUp(el: HTMLElement, to: number, fmt: (n: number) => string, ms = 900, delay = 0, instant = false): Promise<void> {
  return new Promise((resolve) => {
    if (instant || ms <= 0 || to <= 0) {
      el.textContent = fmt(to);
      resolve();
      return;
    }
    el.textContent = fmt(0);
    let t0 = -1;
    const step = (t: number) => {
      if (!el.isConnected) {
        resolve();
        return;
      }
      if (t0 < 0) t0 = t + delay;
      const k = Math.min(1, Math.max(0, (t - t0) / ms));
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(Math.round(to * e));
      if (k < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

/** True when the player asked for reduced motion (OS or the in-game accessibility setting). */
export function reducedMotion(): boolean {
  return document.documentElement.classList.contains('a11y-reduce-motion') || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
}
