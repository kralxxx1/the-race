import { BIKES, BIKE_BY_ID, BRANDS, LAYOUT_LABEL, STYLE_LABEL, type BikeSpec, type BikeStyle } from '../data/bikes';
import { bikeLockText, bikeUnlockLevel } from '../game/progression';
import { MAX_UPGRADE, measurePerformance, type PerformanceFigures, type Upgrades } from '../physics/bike';
import { VIEW_LABELS, type LightLook, type ViewId } from '../render/showroom';
import { SaveManager } from '../storage/save';
import { btn, header, type UiCtx } from './ctx';
import { clear, debounce, fmtDecimal, fmtInt, fmtMoney, fmtSigned, h } from './dom';
import { icon } from './icons';
import { cashChip, chipEl, kv } from './widgets';
import './garage.css';

type SortKey = 'price' | 'hp' | 'top' | 'weight' | 'accel' | 'name' | 'year';
const SORTS: { id: SortKey; label: string; asc: boolean }[] = [
  { id: 'price', label: 'Fiyat', asc: true },
  { id: 'hp', label: 'Güç', asc: false },
  { id: 'top', label: 'Azami hız', asc: false },
  { id: 'weight', label: 'Ağırlık (hafif)', asc: true },
  { id: 'accel', label: '0–100 (hızlı)', asc: true },
  { id: 'year', label: 'Model yılı', asc: false },
  { id: 'name', label: 'İsim', asc: true },
];

const STYLES: (BikeStyle | 'all')[] = ['all', 'sport', 'hyper', 'naked', 'adventure', 'touring', 'cruiser', 'classic', 'scooter'];
const VIEWS: ViewId[] = ['free', 'side', 'front', 'rear', 'cockpit', 'engine'];
const VIEW_ICON: Record<string, string> = { free: 'rotate', side: 'side', front: 'front', rear: 'rear', cockpit: 'cockpit', engine: 'engine' };
const LOOKS: { id: LightLook; label: string }[] = [
  { id: 'studio', label: 'Stüdyo' },
  { id: 'warm', label: 'Sıcak' },
  { id: 'cool', label: 'Soğuk' },
  { id: 'neon', label: 'Neon' },
];

const UPGRADES: { kind: keyof Upgrades; label: string; ico: string; per: string; total: string }[] = [
  { kind: 'engine', label: 'Motor', ico: 'engine', per: 'Seviye başına +%3,5 güç', total: '+%17,5 güç' },
  { kind: 'brakes', label: 'Fren', ico: 'brake', per: 'Seviye başına +%3 fren gücü', total: '+%15 fren gücü' },
  { kind: 'handling', label: 'Yol tutuş', ico: 'steer', per: 'Seviye başına +%5 viraj hâkimiyeti', total: '+%25 viraj hâkimiyeti' },
];

const MAXES = {
  hp: Math.max(...BIKES.map((b) => b.engine.hp)),
  torque: Math.max(...BIKES.map((b) => b.engine.torque)),
  top: Math.max(...BIKES.map((b) => b.topSpeed)),
  wMin: Math.min(...BIKES.map((b) => b.weight)),
  wMax: Math.max(...BIKES.map((b) => b.weight)),
};

// ───────────────────────────── performance cache ─────────────────────────────
const perfCache = new Map<string, PerformanceFigures>();

/** Drag-strip figures for a bike at an engine upgrade level (cached; `quick` skips the slow top-speed tail). */
export function perfOf(b: BikeSpec, engineLevel: number, quick = false): PerformanceFigures {
  const key = `${b.id}:${engineLevel}:${quick ? 'q' : 'f'}`;
  let p = perfCache.get(key);
  if (!p) {
    p = measurePerformance(b, { engine: engineLevel, brakes: 0, handling: 0 }, quick ? 22 : 90);
    perfCache.set(key, p);
  }
  return p;
}

const fmtSec = (s: number | null): string => (s === null || !Number.isFinite(s) ? '—' : `${fmtDecimal(s, 1)} sn`);

/** Fold Turkish letters so "cagiri" finds "Çağrı". */
function fold(s: string): string {
  return s.toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');
}

/** Sort helper shared with the unit tests. */
export function sortBikes(list: readonly BikeSpec[], key: SortKey, desc: boolean, accel: (b: BikeSpec) => number = (b) => perfOf(b, 0, true).zeroTo100): BikeSpec[] {
  const val = (b: BikeSpec): number | string => {
    switch (key) {
      case 'price': return b.price;
      case 'hp': return b.engine.hp;
      case 'top': return b.topSpeed;
      case 'weight': return b.weight;
      case 'accel': return accel(b);
      case 'year': return b.year;
      case 'name': return `${b.brand} ${b.model}`;
    }
  };
  const out = [...list].sort((x, y) => {
    const a = val(x);
    const b = val(y);
    const c = typeof a === 'string' && typeof b === 'string' ? a.localeCompare(b, 'tr') : (a as number) - (b as number);
    return c || x.price - y.price;
  });
  return desc ? out.reverse() : out;
}

/** Garage: filterable bike list with lazy thumbnails, 3D viewer controls, spec sheet, upgrades, compare and purchase. */
export class GarageScreen {
  selected: string;
  private livery = 0;
  private q = '';
  private brand = 'all';
  private style: BikeStyle | 'all' = 'all';
  private sort: SortKey = 'price';
  private desc = false;
  private ownedOnly = false;
  private listEl: HTMLElement | null = null;
  private detailEl: HTMLElement | null = null;
  private countEl: HTMLElement | null = null;
  private cashSlot: HTMLElement | null = null;
  private viewBar: HTMLElement | null = null;
  private io: IntersectionObserver | null = null;
  private compareWith = '';

  constructor(private ctx: UiCtx) {
    this.selected = ctx.save.data.selectedBike;
  }

  select(id: string): void {
    if (!BIKE_BY_ID.has(id)) return;
    this.selected = id;
    this.livery = this.ctx.save.livery(id);
  }

  back(): void {
    this.ctx.a.rev(false);
    this.io?.disconnect();
    this.ctx.a.back();
  }

  // ───────────────────────────── layout ─────────────────────────────
  render(host: HTMLElement): void {
    const { a, save } = this.ctx;
    if (!BIKE_BY_ID.has(this.selected)) this.select(save.data.selectedBike);
    this.livery = save.livery(this.selected);

    const search = h('input', { class: 'field', type: 'search', placeholder: 'Marka veya model ara…', value: this.q, 'aria-label': 'Motosiklet ara', 'data-testid': 'garage-search', 'data-nid': 'garage-search', autocomplete: 'off', spellcheck: 'false' });
    search.addEventListener('input', debounce(() => {
      this.q = search.value;
      this.fillList();
    }, 100));
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (search.value) {
          search.value = '';
          this.q = '';
          this.fillList();
        } else search.blur();
      } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
        search.blur();
        this.ctx.nav.focusFirst();
      }
    });
    const brandSel = h('select', { class: 'select', 'aria-label': 'Marka', 'data-testid': 'garage-brand', 'data-nid': 'garage-brand' },
      h('option', { value: 'all' }, 'Tüm markalar'),
      [...BRANDS].sort((x, y) => x.localeCompare(y, 'tr')).map((b) => h('option', { value: b, selected: b === this.brand }, `${b} (${BIKES.filter((x) => x.brand === b).length})`)),
    );
    brandSel.addEventListener('change', () => {
      this.brand = brandSel.value;
      this.fillList();
    });
    const sortSel = h('select', { class: 'select', 'aria-label': 'Sırala', 'data-testid': 'garage-sort', 'data-nid': 'garage-sort' }, SORTS.map((s) => h('option', { value: s.id, selected: s.id === this.sort }, s.label)));
    const dirBtn = h('button', { class: 'btn small ghost sq', type: 'button', 'aria-label': 'Sıralama yönü', 'data-testid': 'garage-sort-dir', title: 'Sıralama yönünü çevir', onclick: () => {
      this.desc = !this.desc;
      dirBtn.classList.toggle('flip', this.desc);
      this.fillList();
    } }, icon('sort', 16));
    dirBtn.classList.toggle('flip', this.desc);
    sortSel.addEventListener('change', () => {
      this.sort = sortSel.value as SortKey;
      this.desc = !(SORTS.find((s) => s.id === this.sort)?.asc ?? true);
      dirBtn.classList.toggle('flip', this.desc);
      this.fillList();
    });
    const styleRow = h('div', { class: 'chip-row styles', 'data-tabs': '', role: 'tablist', 'aria-label': 'Tür' },
      STYLES.map((s) => h('button', { class: `chip ${this.style === s ? 'sel' : ''}`, type: 'button', role: 'tab', 'aria-selected': this.style === s ? 'true' : 'false', 'data-testid': `garage-style-${s}`, 'data-nid': `style-${s}`, onclick: (e: Event) => {
        this.style = s;
        styleRow.querySelectorAll('.chip').forEach((c) => {
          c.classList.remove('sel');
          c.setAttribute('aria-selected', 'false');
        });
        (e.currentTarget as HTMLElement).classList.add('sel');
        (e.currentTarget as HTMLElement).setAttribute('aria-selected', 'true');
        this.fillList();
      } }, s === 'all' ? 'Tümü' : STYLE_LABEL[s])),
    );
    const ownedBtn = h('button', { class: `chip ${this.ownedOnly ? 'sel' : ''}`, type: 'button', role: 'switch', 'aria-checked': this.ownedOnly ? 'true' : 'false', 'data-testid': 'garage-owned', onclick: () => {
      this.ownedOnly = !this.ownedOnly;
      ownedBtn.classList.toggle('sel', this.ownedOnly);
      ownedBtn.setAttribute('aria-checked', String(this.ownedOnly));
      this.fillList();
    } }, icon('check', 14), 'Sahip olduklarım');

    this.listEl = h('div', { class: 'scroll garage-cards', 'data-keep': 'garage-list', role: 'listbox', 'aria-label': 'Motosikletler' });
    this.countEl = h('div', { class: 'garage-count', 'data-testid': 'garage-count' });
    this.detailEl = h('div', { class: 'garage-detail glass', 'data-testid': 'garage-detail' });
    this.cashSlot = h('span', {});
    this.viewBar = this.buildViewBar();

    host.append(
      header(this.ctx, { title: 'GARAJ', icon: 'garage', sub: `${save.data.ownedBikes.length} / ${BIKES.length}`, backTestid: 'btn-back', right: [this.cashSlot] }),
      h('div', { class: 'body garage-body' },
        h('aside', { class: 'garage-list glass' },
          h('button', { class: 'chip garage-filter-toggle', type: 'button', 'aria-expanded': 'false', 'data-testid': 'garage-filter-toggle', 'data-nid': 'garage-filter-toggle', onclick: (e: Event) => {
            const list = (e.currentTarget as HTMLElement).closest('.garage-list');
            const open = list?.classList.toggle('tools-open') ?? false;
            (e.currentTarget as HTMLElement).setAttribute('aria-expanded', String(open));
          } }, icon('filter', 14), 'Filtre ve sıralama'),
          h('div', { class: 'garage-tools' },
            h('div', { class: 'field-wrap' }, icon('search', 16), search),
            h('div', { class: 'garage-row2' }, brandSel, h('div', { class: 'sort-box' }, sortSel, dirBtn)),
            styleRow,
            h('div', { class: 'garage-row3' }, ownedBtn, this.countEl),
          ),
          this.listEl,
        ),
        h('div', { class: 'garage-mid pass' }, this.viewBar),
        this.detailEl,
      ),
    );
    this.fillCash();
    this.fillList();
    this.fillDetail();
    a.previewBike(this.selected, this.livery);
    this.ctx.nav.shortcuts.alt = () => this.openCompare();
    this.ctx.nav.shortcuts.alt2 = () => this.revTap();
  }

  private fillCash(): void {
    if (!this.cashSlot) return;
    const c = cashChip(this.ctx.save.data.cash, 'cash');
    this.cashSlot.replaceWith(c);
    this.cashSlot = c;
  }

  // ───────────────────────────── list ─────────────────────────────
  private filtered(): BikeSpec[] {
    const { save } = this.ctx;
    const q = fold(this.q.trim());
    const words = q.split(/\s+/).filter(Boolean);
    const list = BIKES.filter((b) => {
      if (this.brand !== 'all' && b.brand !== this.brand) return false;
      if (this.style !== 'all' && b.style !== this.style) return false;
      if (this.ownedOnly && !save.owns(b.id)) return false;
      if (!words.length) return true;
      const hay = fold(`${b.brand} ${b.model} ${b.year} ${STYLE_LABEL[b.style]} ${LAYOUT_LABEL[b.engine.layout]}`);
      return words.every((w) => hay.includes(w));
    });
    return sortBikes(list, this.sort, this.desc);
  }

  private fillList(): void {
    const el = this.listEl;
    if (!el) return;
    const { save } = this.ctx;
    const d = save.data;
    this.io?.disconnect();
    this.io = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver((entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            const img = e.target as HTMLElement;
            this.io?.unobserve(img);
            this.loadThumb(img);
          }
        }, { root: el, rootMargin: '240px 0px' })
      : null;
    clear(el);
    const list = this.filtered();
    if (this.countEl) this.countEl.textContent = `${list.length} motosiklet`;
    if (!list.length) {
      el.append(h('div', { class: 'empty', 'data-testid': 'garage-empty' }, icon('search', 28), h('b', {}, 'Sonuç yok'), h('small', {}, 'Filtreleri gevşetmeyi dene.')));
      return;
    }
    let first = true;
    for (const b of list) {
      const own = save.owns(b.id);
      const locked = !own && !save.isBikeUnlocked(b.id);
      const liv = save.livery(b.id);
      const thumb = h('span', { class: 'bc-thumb', 'data-bike': b.id, 'data-livery': String(liv), style: `--c1:${b.liveries[liv]?.primary ?? '#444'};--c2:${b.liveries[liv]?.secondary ?? '#222'}` }, icon('bike', 30));
      const eager = first;
      first = false;
      const card = h('button', { class: `bike-card ${b.id === this.selected ? 'sel' : ''} ${own ? 'owned' : ''} ${locked ? 'locked' : ''}`, type: 'button', role: 'option', 'aria-selected': b.id === this.selected ? 'true' : 'false', 'data-testid': `bike-${b.id}`, 'data-nid': `bike-${b.id}`, 'data-locked': locked ? '1' : '0', onclick: () => this.choose(b.id) },
        thumb,
        h('span', { class: 'bc-main' },
          h('span', { class: 'bc-brand' }, b.brand),
          h('span', { class: 'bc-model' }, b.model),
          h('span', { class: 'bc-foot' }, `${b.engine.hp} hp · ${b.topSpeed} km/s`),
        ),
        h('span', { class: 'bc-tag' }, own ? (d.selectedBike === b.id ? h('span', { class: 'badge accent' }, 'SEÇİLİ') : h('span', { class: 'badge green' }, 'SAHİP')) : locked ? h('span', { class: 'badge' }, icon('lock', 12), `Sv ${bikeUnlockLevel(b.id)}`) : h('span', { class: 'bc-price' }, fmtMoney(b.price))),
      );
      el.append(card);
      if (this.io && !eager) this.io.observe(thumb);
      else this.loadThumb(thumb);
    }
    el.querySelector('.bike-card.sel')?.scrollIntoView({ block: 'nearest' });
  }

  private loadThumb(span: HTMLElement): void {
    const id = span.dataset.bike;
    if (!id) return;
    const liv = Number(span.dataset.livery) || 0;
    void this.ctx.a.thumb(id, liv).then((url) => {
      if (!url || !span.isConnected) return;
      const img = h('img', { src: url, alt: '', draggable: 'false', decoding: 'async' });
      span.replaceChildren(img);
      span.classList.add('has-img');
    });
  }

  private choose(id: string): void {
    this.selected = id;
    this.livery = this.ctx.save.livery(id);
    this.compareWith = '';
    this.listEl?.querySelectorAll('.bike-card').forEach((c) => {
      const on = (c as HTMLElement).dataset.nid === `bike-${id}`;
      c.classList.toggle('sel', on);
      c.setAttribute('aria-selected', String(on));
    });
    this.ctx.a.previewBike(id, this.livery);
    this.fillDetail();
  }

  // ───────────────────────────── 3D viewer controls ─────────────────────────────
  private buildViewBar(): HTMLElement {
    const sr = this.ctx.a.showroom;
    const bar = h('div', { class: 'viewbar glass', role: 'toolbar', 'aria-label': '3B görünüm' });
    const cur = sr.view;
    const chips = VIEWS.map((v) => h('button', { class: `chip ${v === cur ? 'sel' : ''}`, type: 'button', title: VIEW_LABELS[v], 'aria-pressed': v === cur ? 'true' : 'false', 'data-testid': `view-${v}`, 'data-nid': `view-${v}`, onclick: () => sr.setView(v) }, icon(VIEW_ICON[v], 16), h('span', {}, VIEW_LABELS[v])));
    sr.onViewChange((v) => {
      chips.forEach((c, i) => {
        const on = VIEWS[i] === v;
        c.classList.toggle('sel', on);
        c.setAttribute('aria-pressed', String(on));
      });
    });
    bar.append(
      h('div', { class: 'chip-row' }, chips),
      h('div', { class: 'viewbar-tools' },
        h('button', { class: 'btn small ghost sq', type: 'button', 'aria-label': 'Yakınlaş', title: 'Yakınlaş', 'data-testid': 'view-zoom-in', onclick: () => sr.zoom(0.82) }, icon('zoomIn', 16)),
        h('button', { class: 'btn small ghost sq', type: 'button', 'aria-label': 'Uzaklaş', title: 'Uzaklaş', 'data-testid': 'view-zoom-out', onclick: () => sr.zoom(1.22) }, icon('zoomOut', 16)),
        h('div', { class: 'looks', role: 'group', 'aria-label': 'Işık' }, LOOKS.map((l) => h('button', { class: 'chip look', type: 'button', 'data-look': l.id, title: `Işık: ${l.label}`, onclick: (e: Event) => {
          sr.setLook(l.id);
          (e.currentTarget as HTMLElement).parentElement?.querySelectorAll('.chip').forEach((c) => c.classList.remove('sel'));
          (e.currentTarget as HTMLElement).classList.add('sel');
        } }, l.label))),
      ),
      h('div', { class: 'viewbar-hint' }, icon('rotate', 14), 'Sürükle: döndür · Tekerlek / çimdik: yakınlaştır'),
    );
    return bar;
  }

  // ───────────────────────────── detail ─────────────────────────────
  private bar(label: string, frac: number, text: string, extraFrac = 0, cls = ''): HTMLElement {
    const f = Math.max(0, Math.min(1, frac));
    const x = Math.max(0, Math.min(1 - f, extraFrac));
    return h('div', { class: `stat ${cls}` },
      h('div', { class: 'stat-label' }, h('span', {}, label), h('b', {}, text)),
      h('div', { class: 'bar delta' },
        h('i', { style: `width:${(f * 100).toFixed(1)}%` }),
        x > 0 ? h('i', { class: 'plus', style: `left:${(f * 100).toFixed(1)}%;width:${(x * 100).toFixed(1)}%` }) : null,
      ),
    );
  }

  private fillDetail(): void {
    const el = this.detailEl;
    if (!el) return;
    const { save, a } = this.ctx;
    const d = save.data;
    const b = BIKE_BY_ID.get(this.selected) ?? BIKES[0];
    const own = save.owns(b.id);
    const locked = !own && !save.isBikeUnlocked(b.id);
    const ups = save.upgradesFor(b.id);
    const p = perfOf(b, ups.engine);
    const hpNow = b.engine.hp * (1 + 0.035 * ups.engine);
    const hpFrac = hpNow / (MAXES.hp * 1.18);
    const hpAdd = (b.engine.hp * 0.035 * (MAX_UPGRADE - ups.engine)) / (MAXES.hp * 1.18);
    const accel = Math.max(0, Math.min(1, 1 - (p.zeroTo100 - 2.2) / 6));
    const equipped = d.selectedBike === b.id;

    const swatches = b.liveries.map((l, i) =>
      h('button', { class: `swatch ${i === this.livery ? 'sel' : ''}`, type: 'button', title: l.name, 'aria-label': `Renk: ${l.name}`, 'aria-pressed': i === this.livery ? 'true' : 'false', 'data-testid': `livery-${i}`, 'data-nid': `livery-${i}`, style: `background:linear-gradient(135deg,${l.primary} 0 52%,${l.secondary} 52% 78%,${l.accent} 78%)`, onclick: () => {
        this.livery = i;
        if (own) a.setLivery(b.id, i);
        a.previewBike(b.id, i);
        this.fillDetail();
        const thumb = this.listEl?.querySelector<HTMLElement>(`.bike-card[data-nid="bike-${b.id}"] .bc-thumb`);
        if (thumb && own) {
          thumb.dataset.livery = String(i);
          this.loadThumb(thumb);
        }
      } }),
    );

    let action: HTMLElement;
    if (own) {
      action = equipped
        ? h('div', { class: 'tag sel', 'data-testid': 'bike-selected' }, icon('check', 16), 'SEÇİLİ MOTOSİKLET')
        : btn('SEÇ', () => {
            if (a.selectBike(b.id)) {
              this.fillList();
              this.fillDetail();
            }
          }, 'primary', 'btn-select', 'check');
    } else if (locked) {
      action = h('div', { class: 'tag lock', 'data-testid': 'bike-locked' }, icon('lock', 16), bikeLockText(b));
    } else {
      const afford = d.cash >= b.price;
      action = btn(['SATIN AL  ', h('b', {}, fmtMoney(b.price))], () => this.confirmBuy(b), `primary ${afford ? '' : 'disabled'}`, 'btn-buy', 'coin');
      if (!afford) action.title = `${fmtMoney(b.price - d.cash)} eksik`;
    }

    const rev = h('button', { class: 'btn ghost', type: 'button', 'data-testid': 'btn-rev', 'data-nid': 'rev', 'data-silent': '' }, icon('volume', 18), h('span', { class: 'lbl' }, 'MOTORU DİNLE'), h('small', {}, 'basılı tut'));
    const revOn = (e: Event) => {
      e.preventDefault();
      a.rev(true);
    };
    const revOff = () => a.rev(false);
    rev.addEventListener('pointerdown', revOn);
    rev.addEventListener('pointerup', revOff);
    rev.addEventListener('pointerleave', revOff);
    rev.addEventListener('pointercancel', revOff);
    // Keyboard / pad "click" (no pointer): a short rev instead of nothing.
    rev.addEventListener('click', (e) => {
      if (e.detail === 0) this.revTap();
    });

    const spec = h('div', { class: 'spec-grid', 'data-testid': 'spec-sheet' },
      kv('Motor', `${LAYOUT_LABEL[b.engine.layout]}${b.engine.supercharged ? ' · süperşarj' : ''}`),
      kv('Hacim', b.engine.cc ? `${fmtInt(b.engine.cc)} cc` : 'Elektrik'),
      kv('Güç', `${Math.round(hpNow)} hp @ ${fmtInt(b.engine.hpRpm)}`),
      kv('Tork', `${b.engine.torque} Nm @ ${fmtInt(b.engine.torqueRpm)}`),
      kv('Devir sınırı', `${fmtInt(b.engine.limiter)} d/dk`),
      kv('Şanzıman', b.transmission === 'manual' ? `${b.gears} vites${b.quickshifter ? ' · quickshifter' : ''}` : b.transmission === 'cvt' ? 'CVT otomatik' : 'Doğrudan tahrik'),
      kv('Ağırlık', `${b.weight} kg`),
      kv('Güç / ağırlık', `${fmtInt((hpNow / b.weight) * 1000)} hp/ton`),
      kv('0–100 km/s', fmtSec(p.zeroTo100)),
      kv('0–200 km/s', fmtSec(p.zeroTo200)),
      kv('400 m', fmtSec(p.quarterMile)),
      kv('Azami hız', `${Math.round(p.topSpeed || b.topSpeed)} km/s`),
    );

    const bars = h('div', { class: 'perf-bars' },
      this.bar('Güç', hpFrac, `${Math.round(hpNow)} hp`, hpAdd, 'hp'),
      this.bar('Tork', b.engine.torque / (MAXES.torque * 1.1), `${b.engine.torque} Nm`),
      this.bar('Azami hız', b.topSpeed / (MAXES.top * 1.05), `${b.topSpeed} km/s`),
      this.bar('Hafiflik', 1 - (b.weight - MAXES.wMin) / (MAXES.wMax - MAXES.wMin + 60), `${b.weight} kg`),
      this.bar('İvmelenme', accel, fmtSec(p.zeroTo100)),
    );

    const prevScroll = el.querySelector('.gd-scroll')?.scrollTop ?? 0;
    const scroller = h('div', { class: 'scroll gd-scroll', 'data-keep': 'garage-detail' },
      h('div', { class: 'gd-head' },
        h('div', { class: 'bike-brand' }, `${b.brand} · ${b.year}`),
        h('div', { class: 'bike-model', 'data-testid': 'garage-model' }, b.model),
        h('div', { class: 'chip-row' },
          chipEl(STYLE_LABEL[b.style], 'bike'),
          chipEl(LAYOUT_LABEL[b.engine.layout], 'engine'),
          b.engine.cc ? chipEl(`${fmtInt(b.engine.cc)} cc`) : chipEl('Elektrikli', 'bolt'),
          own ? chipEl('Garajında', 'check', 'good') : locked ? chipEl('Kilitli', 'lock') : chipEl(fmtMoney(b.price), 'coin'),
        ),
      ),
      h('p', { class: 'bike-desc' }, b.description),
      bars,
      h('div', { class: 'section-title' }, 'Teknik özellikler'),
      spec,
      h('div', { class: 'section-title' }, 'Renk'),
      h('div', { class: 'swatch-row' }, h('div', { class: 'swatches', role: 'group', 'aria-label': 'Renk' }, swatches), h('small', { class: 'muted' }, b.liveries[this.livery]?.name ?? '')),
      h('div', { class: 'section-title' }, icon('wrench', 14), 'Yükseltmeler'),
      this.upgradeTree(b, own),
    );
    el.replaceChildren(
      scroller,
      h('div', { class: 'gd-actions' },
        h('div', { class: 'gd-actions-row' }, rev, btn([h('span', { class: 'lbl' }, 'KARŞILAŞTIR')], () => this.openCompare(), 'ghost', 'btn-compare', 'compare')),
        action,
      ),
    );
    scroller.scrollTop = prevScroll;
    this.fillCash();
  }

  private revTap(): void {
    this.ctx.a.rev(true);
    window.setTimeout(() => this.ctx.a.rev(false), 1500);
  }

  // ───────────────────────────── upgrade tree ─────────────────────────────
  private upgradeTree(b: BikeSpec, own: boolean): HTMLElement {
    const { save, a } = this.ctx;
    const d = save.data;
    const ups = save.upgradesFor(b.id);
    const rows = UPGRADES.map((u) => {
      const lvl = ups[u.kind];
      const max = lvl >= MAX_UPGRADE;
      const cost = SaveManager.upgradeCost(b.price, lvl);
      const afford = d.cash >= cost;
      let delta = u.per;
      if (u.kind === 'engine' && !max) {
        const now = perfOf(b, lvl, true).zeroTo100;
        const next = perfOf(b, lvl + 1, true).zeroTo100;
        delta = `+${fmtDecimal(b.engine.hp * 0.035, 1)} hp · 0–100 ${fmtSigned(next - now, 2)} sn`;
      }
      return h('div', { class: `up-row ${own ? '' : 'off'}`, 'data-testid': `up-${u.kind}` },
        h('div', { class: 'up-ico' }, icon(u.ico, 20)),
        h('div', { class: 'up-main' },
          h('div', { class: 'up-label' }, u.label, h('small', {}, lvl > 0 ? ` · Seviye ${lvl}` : '')),
          h('div', { class: 'pips', role: 'img', 'aria-label': `${lvl} / ${MAX_UPGRADE}` }, Array.from({ length: MAX_UPGRADE }, (_, i) => h('i', { class: i < lvl ? 'on' : '' }))),
          h('small', { class: 'up-delta' }, max ? `Toplam ${u.total}` : delta),
        ),
        max
          ? h('span', { class: 'badge gold' }, 'MAKS')
          : h('button', { class: `btn small ${afford && own ? 'primary' : ''}`, type: 'button', disabled: !own || !afford, 'data-testid': `upgrade-${u.kind}`, 'data-nid': `upgrade-${u.kind}`, title: !own ? 'Önce motosikleti satın al' : afford ? undefined : `${fmtMoney(cost - d.cash)} eksik`, onclick: () => {
            if (a.upgrade(b.id, u.kind)) {
              perfCache.delete(`${b.id}:${ups.engine + (u.kind === 'engine' ? 1 : 0)}:f`);
              this.fillDetail();
            }
          } }, icon('up', 14), fmtMoney(cost)),
      );
    });
    return h('div', { class: 'upgrades' }, rows, own ? null : h('div', { class: 'note' }, 'Yükseltmeler motosikleti satın alınca açılır.'));
  }

  // ───────────────────────────── purchase ─────────────────────────────
  private confirmBuy(b: BikeSpec): void {
    const { a, save } = this.ctx;
    const cash = save.data.cash;
    this.ctx.dialog({
      title: 'Satın alma onayı',
      icon: 'coin',
      body: [
        h('div', { class: 'buy-bike' },
          h('b', {}, `${b.brand} ${b.model}`),
          h('small', {}, `${b.year} · ${STYLE_LABEL[b.style]} · ${b.engine.hp} hp · ${b.topSpeed} km/s`),
        ),
        h('div', { class: 'sum', 'data-testid': 'buy-summary' },
          h('div', {}, h('span', {}, 'Bakiye'), h('b', {}, fmtMoney(cash))),
          h('div', {}, h('span', {}, 'Fiyat'), h('b', { class: 'neg' }, `−${fmtMoney(b.price)}`)),
          h('div', { class: 'total' }, h('span', {}, 'Kalan'), h('b', {}, fmtMoney(cash - b.price))),
        ),
      ],
      confirm: { label: 'SATIN AL', testid: 'buy-confirm', run: () => {
        if (!a.buyBike(b.id)) return false;
        a.setLivery(b.id, this.livery);
        this.fillList();
        this.fillDetail();
        return true;
      } },
      testid: 'buy-dialog',
    });
  }

  // ───────────────────────────── compare ─────────────────────────────
  private openCompare(): void {
    const a = BIKE_BY_ID.get(this.selected);
    if (!a) return;
    if (!this.compareWith || this.compareWith === a.id || !BIKE_BY_ID.has(this.compareWith)) {
      const eq = this.ctx.save.data.selectedBike;
      this.compareWith = eq !== a.id ? eq : (BIKES.find((x) => x.id !== a.id && x.style === a.style)?.id ?? BIKES[0].id);
    }
    const holder = h('div', { class: 'compare', 'data-testid': 'compare' });
    const sel = h('select', { class: 'select', 'aria-label': 'Karşılaştırılacak motosiklet', 'data-testid': 'compare-select' }, sortBikes(BIKES.filter((x) => x.id !== a.id), 'name', false).map((x) => h('option', { value: x.id, selected: x.id === this.compareWith }, `${x.brand} ${x.model}`)));
    const draw = () => {
      const bb = BIKE_BY_ID.get(this.compareWith);
      if (bb) holder.replaceChildren(this.compareTable(a, bb));
    };
    sel.addEventListener('change', () => {
      this.compareWith = sel.value;
      draw();
    });
    draw();
    this.ctx.dialog({
      title: 'Karşılaştır',
      icon: 'compare',
      body: [h('div', { class: 'compare-pick' }, h('b', {}, `${a.brand} ${a.model}`), h('span', {}, 'ile'), sel), holder],
      wide: true,
      testid: 'compare-dialog',
    });
  }

  private compareTable(a: BikeSpec, b: BikeSpec): HTMLElement {
    const ua = this.ctx.save.upgradesFor(a.id).engine;
    const ub = this.ctx.save.upgradesFor(b.id).engine;
    const pa = perfOf(a, ua);
    const pb = perfOf(b, ub);
    const hpA = a.engine.hp * (1 + 0.035 * ua);
    const hpB = b.engine.hp * (1 + 0.035 * ub);
    interface Row { label: string; va: number; vb: number; fmt: (n: number) => string; low?: boolean; neutral?: boolean }
    const rows: Row[] = [
      { label: 'Güç', va: hpA, vb: hpB, fmt: (n) => `${Math.round(n)} hp` },
      { label: 'Tork', va: a.engine.torque, vb: b.engine.torque, fmt: (n) => `${Math.round(n)} Nm` },
      { label: 'Azami hız', va: pa.topSpeed || a.topSpeed, vb: pb.topSpeed || b.topSpeed, fmt: (n) => `${Math.round(n)} km/s` },
      { label: 'Ağırlık', va: a.weight, vb: b.weight, fmt: (n) => `${Math.round(n)} kg`, low: true },
      { label: 'Güç / ağırlık', va: (hpA / a.weight) * 1000, vb: (hpB / b.weight) * 1000, fmt: (n) => `${Math.round(n)} hp/ton` },
      { label: '0–100 km/s', va: pa.zeroTo100, vb: pb.zeroTo100, fmt: (n) => fmtSec(n), low: true },
      { label: '400 m', va: pa.quarterMile, vb: pb.quarterMile, fmt: (n) => fmtSec(n), low: true },
      { label: 'Hacim', va: a.engine.cc, vb: b.engine.cc, fmt: (n) => (n ? `${fmtInt(n)} cc` : 'Elektrik'), neutral: true },
      { label: 'Vites', va: a.gears, vb: b.gears, fmt: (n) => String(n), neutral: true },
      { label: 'Fiyat', va: a.price, vb: b.price, fmt: (n) => fmtMoney(n), neutral: true },
    ];
    const card = (x: BikeSpec) => h('div', { class: 'cmp-head' },
      h('span', { class: 'bc-thumb big', 'data-bike': x.id, 'data-livery': String(this.ctx.save.livery(x.id)), style: `--c1:${x.liveries[this.ctx.save.livery(x.id)]?.primary};--c2:${x.liveries[this.ctx.save.livery(x.id)]?.secondary}` }, icon('bike', 40)),
      h('b', {}, x.model), h('small', {}, `${x.brand} · ${x.year}`),
    );
    const t = h('div', { class: 'cmp-table' });
    const heads = h('div', { class: 'cmp-row heads' }, card(a), h('span', {}), card(b));
    t.append(heads);
    heads.querySelectorAll<HTMLElement>('.bc-thumb').forEach((s) => this.loadThumb(s));
    for (const r of rows) {
      const better = r.neutral || r.va === r.vb ? 0 : (r.low ? r.va < r.vb : r.va > r.vb) ? 1 : 2;
      const top = Math.max(r.va, r.vb, 1e-6);
      const w = (v: number) => (r.low ? (Math.min(r.va, r.vb) / Math.max(v, 1e-6)) : v / top);
      t.append(h('div', { class: 'cmp-row' },
        h('div', { class: `cmp-cell a ${better === 1 ? 'win' : ''}` }, h('b', {}, r.fmt(r.va)), r.neutral ? null : h('span', { class: 'bar thin' }, h('i', { style: `width:${(Math.min(1, w(r.va)) * 100).toFixed(0)}%` }))),
        h('span', { class: 'cmp-label' }, r.label),
        h('div', { class: `cmp-cell b ${better === 2 ? 'win' : ''}` }, h('b', {}, r.fmt(r.vb)), r.neutral ? null : h('span', { class: 'bar thin' }, h('i', { style: `width:${(Math.min(1, w(r.vb)) * 100).toFixed(0)}%` }))),
      ));
    }
    return t;
  }
}
