import { CATEGORY_LABELS, CATEGORY_ORDER, PRESET_KEY, QUALITY_PRESETS, SETTINGS, type QualityPreset, type SettingCategory, type SettingDef, type SettingValue } from '../settings';
import { header, type UiCtx } from './ctx';
import { clear, debounce, h, rerender } from './dom';
import { icon } from './icons';
import { tip } from './widgets';
import './settings.css';

const CATEGORY_ICON: Record<SettingCategory, string> = {
  graphics: 'monitor',
  effects: 'sparkle',
  world: 'globe',
  camera: 'camera',
  audio: 'volume',
  controls: 'pad',
  gameplay: 'steer',
  hud: 'hud',
  accessibility: 'access',
};

/** What each quality preset means, in plain words (GPU load 1..5 drives the little meter). */
const PRESET_INFO: Record<QualityPreset, { desc: string; load: number; for: string }> = {
  low: { desc: 'Gölge ve yansımalar kısılır, sis ve parçacıklar azalır. Pil ve akıcılık için.', load: 1, for: 'Telefon · eski dizüstü' },
  medium: { desc: 'Orta çözünürlüklü gölgeler, temel ışık efektleri ve yumuşak kenarlar.', load: 2, for: 'Orta seviye telefon · tümleşik GPU' },
  high: { desc: 'Yumuşak gölgeler, ekran-uzayı yansıma, hareket bulanıklığı. Önerilen denge.', load: 3, for: 'Güncel bilgisayar · üst telefon' },
  ultra: { desc: 'Yüksek çözünürlüklü gölgeler, hacimsel sis, daha yoğun manzara ve süper örnekleme.', load: 4, for: 'Ayrık ekran kartı' },
  extreme: { desc: 'RTX tarzı: çok kademeli büyük gölgeler, GTAO, her karede yansıma, %200 örnekleme. En güçlü kartı zorlar.', load: 5, for: 'Üst seviye ekran kartı' },
};

const KEYS_HELP: [string, string][] = [
  ['↑ / W', 'Gaz'],
  ['↓ / S', 'Fren'],
  ['← → / A D', 'Direksiyon (yatma)'],
  ['Boşluk', 'Wheelie'],
  ['Q / E', 'Vites düşür / yükselt (manuel)'],
  ['B (basılı)', 'Arkaya bak'],
  ['H', 'Korna'],
  ['C', 'Kamera bilgisi'],
  ['M', 'Sesi kapat / aç'],
  ['Esc / P', 'Duraklat'],
];

const PAD_HELP: [string, string][] = [
  ['Sol çubuk', 'Direksiyon'],
  ['RT / LT', 'Gaz / Fren'],
  ['A', 'Wheelie'],
  ['X / Y', 'Vites düşür / yükselt'],
  ['LB (basılı)', 'Arkaya bak'],
  ['Start', 'Duraklat'],
];

const ADV_KEY = 'the-race.ui.advanced';

function readAdvanced(): boolean {
  try {
    return localStorage.getItem(ADV_KEY) === '1';
  } catch {
    return false;
  }
}

function writeAdvanced(on: boolean): void {
  try {
    localStorage.setItem(ADV_KEY, on ? '1' : '0');
  } catch {
    /* storage unavailable */
  }
}

/** Case- and diacritic-insensitive text for searching (Turkish dotted/dotless i folded together). */
export function fold(s: string): string {
  return s
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Does `def` match every word of `query`? (label, group, help, category name and key are searched). */
export function matchesQuery(def: SettingDef, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = fold(`${def.label} ${def.group} ${def.help ?? ''} ${CATEGORY_LABELS[def.category]} ${def.key}`);
  return words.every((w) => hay.includes(w));
}

/** Settings: tabs generated from the registry, search, advanced toggle, presets, per-tab reset and live previews. */
export class SettingsScreen {
  private tab: SettingCategory = 'graphics';
  private query = '';
  private advanced = readAdvanced();
  private host: HTMLElement | null = null;
  private list: HTMLElement | null = null;
  private inGame = false;
  private previewEl: HTMLElement | null = null;
  private queued: Record<string, unknown> = {};
  private raf = 0;

  constructor(private ctx: UiCtx) {}

  private get values(): Readonly<Record<string, SettingValue>> {
    return this.ctx.save.data.settings as Record<string, SettingValue>;
  }

  render(host: HTMLElement, inGame: boolean): void {
    this.host = host;
    this.inGame = inGame;
    this.build(host);
  }

  private redo(): void {
    if (this.host) rerender(this.host, () => this.build(this.host as HTMLElement));
  }

  /** Categories that have at least one visible setting. */
  private categories(): SettingCategory[] {
    return CATEGORY_ORDER.filter((c) => SETTINGS.byCategory(c).some((d) => this.visible(d)));
  }

  private visible(d: SettingDef): boolean {
    if (d.visibleIf && !d.visibleIf(this.values)) return false;
    return this.advanced || !d.advanced || this.query.trim() !== '';
  }

  private baseline(d: SettingDef): SettingValue {
    const preset = this.values[PRESET_KEY];
    const p: QualityPreset = (QUALITY_PRESETS as readonly string[]).includes(String(preset)) ? (preset as QualityPreset) : 'high';
    return d.presets ? SETTINGS.presetValue(d, p) : d.default;
  }

  private changed(d: SettingDef): boolean {
    return d.key !== PRESET_KEY && this.values[d.key] !== undefined && this.values[d.key] !== this.baseline(d);
  }

  private apply(patch: Record<string, unknown>): void {
    this.flush();
    this.ctx.a.applySettings(patch);
    this.updatePreview();
  }

  /** Slider drags fire many `input` events: coalesce them to one settings change per frame. */
  private applyLater(key: string, value: number): void {
    this.queued[key] = value;
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.flush();
      this.updatePreview();
    });
  }

  private flush(): void {
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    const keys = Object.keys(this.queued);
    if (!keys.length) return;
    const patch = this.queued;
    this.queued = {};
    this.ctx.a.applySettings(patch);
  }

  // ───────────────────────────── layout ─────────────────────────────
  private build(host: HTMLElement): void {
    const cats = this.categories();
    if (!cats.includes(this.tab)) this.tab = cats[0] ?? 'graphics';
    const searching = this.query.trim() !== '';

    const search = h('input', { class: 'field', type: 'search', placeholder: 'Ayar ara… (gölge, ses, kontrast)', value: this.query, 'aria-label': 'Ayarlarda ara', 'data-testid': 'settings-search', 'data-nid': 'search', autocomplete: 'off', spellcheck: 'false' });
    const onSearch = debounce(() => {
      this.query = search.value;
      this.renderList();
      tabs.classList.toggle('muted-tabs', this.query.trim() !== '');
    }, 120);
    search.addEventListener('input', onSearch);
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (search.value) {
          search.value = '';
          this.query = '';
          this.renderList();
          tabs.classList.remove('muted-tabs');
        } else search.blur();
      } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
        search.blur();
        this.ctx.nav.focusFirst();
      }
    });

    const tabs = h('div', { class: `set-tabs ${searching ? 'muted-tabs' : ''}`, 'data-tabs': '', role: 'tablist' },
      cats.map((c) => {
        const n = SETTINGS.byCategory(c).filter((d) => this.visible(d) && this.changed(d)).length;
        return h('button', { class: `set-tab ${c === this.tab ? 'sel' : ''}`, type: 'button', role: 'tab', 'aria-selected': c === this.tab ? 'true' : 'false', 'data-testid': `tab-${c}`, 'data-nid': `tab-${c}`, onclick: () => {
          this.tab = c;
          this.query = '';
          this.redo();
        } }, icon(CATEGORY_ICON[c], 18), h('span', {}, CATEGORY_LABELS[c]), n > 0 ? h('i', { class: 'set-dot', title: `${n} ayar varsayılandan farklı` }) : null);
      }),
    );

    const adv = h('button', { class: `chip big ${this.advanced ? 'sel' : ''}`, type: 'button', role: 'switch', 'aria-checked': this.advanced ? 'true' : 'false', 'data-testid': 'settings-advanced', 'data-nid': 'advanced', title: 'Uzmanlara yönelik ek seçenekleri göster', onclick: () => {
      this.advanced = !this.advanced;
      writeAdvanced(this.advanced);
      this.redo();
    } }, icon('wrench', 16), 'Gelişmiş');

    this.list = h('div', { class: 'set-list' });
    host.append(
      header(this.ctx, { title: 'AYARLAR', icon: 'gear', sub: `${SETTINGS.list().length} seçenek`, right: [adv] }),
      h('div', { class: 'body set-body' },
        h('aside', { class: 'set-side glass' },
          h('div', { class: 'field-wrap' }, icon('search', 16), search),
          tabs,
          h('div', { class: 'set-side-foot' },
            this.ctx.a.gpuInfo() ? h('div', { class: 'gpu-line', 'data-testid': 'gpu-info' }, icon('monitor', 14), h('span', {}, this.ctx.a.gpuInfo())) : null,
          ),
        ),
        h('div', { class: 'scroll set-main', 'data-keep': 'settings' }, this.list),
      ),
    );
    this.renderList();
    requestAnimationFrame(() => tabs.querySelector('.sel')?.scrollIntoView({ inline: 'center', block: 'nearest' }));
  }

  /** Re-render only the settings list (search typing must not rebuild the search box). */
  private renderList(): void {
    const list = this.list;
    if (!list) return;
    clear(list);
    const q = this.query.trim();
    if (q) this.renderSearch(list, q);
    else this.renderTab(list, this.tab);
    list.parentElement?.scrollTo({ top: 0 });
  }

  private renderSearch(list: HTMLElement, q: string): void {
    const defs = SETTINGS.list().filter((d) => this.visible(d) && matchesQuery(d, q));
    list.append(h('div', { class: 'set-count', 'data-testid': 'settings-count' }, defs.length === 0 ? `“${q}” için sonuç yok.` : `“${q}” için ${defs.length} sonuç`));
    let lastCat: SettingCategory | null = null;
    for (const d of defs) {
      if (d.category !== lastCat) {
        lastCat = d.category;
        list.append(h('div', { class: 'section-title' }, icon(CATEGORY_ICON[d.category], 14), CATEGORY_LABELS[d.category]));
      }
      list.append(this.row(d, true));
    }
  }

  private renderTab(list: HTMLElement, cat: SettingCategory): void {
    if (cat === 'graphics') list.append(this.presetStrip());
    if (cat === 'hud') list.append(this.hudPreview());
    if (cat === 'controls') list.append(this.controlsHelp());
    const defs = SETTINGS.byCategory(cat).filter((d) => this.visible(d) && d.key !== PRESET_KEY);
    const groups = new Map<string, SettingDef[]>();
    for (const d of defs) {
      const g = groups.get(d.group) ?? [];
      g.push(d);
      groups.set(d.group, g);
    }
    for (const [g, items] of groups) {
      list.append(h('div', { class: 'section-title' }, g));
      const card = h('div', { class: 'set-group glass' });
      for (const d of items) card.append(this.row(d, false));
      list.append(card);
    }
    const n = SETTINGS.byCategory(cat).filter((d) => d.key !== PRESET_KEY && this.changed(d)).length;
    list.append(
      h('div', { class: 'set-actions' },
        h('button', { class: 'btn small', type: 'button', 'data-testid': 'tab-reset', 'data-nid': 'tab-reset', disabled: n === 0, onclick: () => this.resetTab(cat) }, icon('reset', 16), `${CATEGORY_LABELS[cat]} sekmesini sıfırla${n ? ` (${n})` : ''}`),
        h('button', { class: 'btn small ghost', type: 'button', 'data-testid': 'settings-export', onclick: () => this.exportDialog() }, icon('save', 16), 'Ayarları dışa aktar'),
        h('button', { class: 'btn small ghost', type: 'button', 'data-testid': 'settings-import', onclick: () => this.importDialog() }, icon('plus', 16), 'İçe aktar'),
      ),
    );
    if (!this.inGame && cat === 'gameplay') list.append(this.progressBlock());
    if (cat === 'accessibility') list.append(h('div', { class: 'note' }, 'Not: Bu seçenekler anında uygulanır. “Yüksek kontrast” ve “Büyük metin” hem menüleri hem sürüş ekranını etkiler.'));
    list.append(h('div', { class: 'credits' }, 'Marka ve model adları sahiplerinin ticari markalarıdır; bu hayran oyunu herhangi bir üreticiyle bağlantılı değildir.'));
  }

  // ───────────────────────────── rows and controls ─────────────────────────────
  private row(d: SettingDef, showPath: boolean): HTMLElement {
    const changed = this.changed(d);
    return h('div', { class: `set-row row-${d.type} ${changed ? 'changed' : ''}`, 'data-setting': d.key },
      h('div', { class: 'set-label' },
        h('span', { class: 'set-name' }, d.label),
        showPath ? h('small', { class: 'set-path' }, d.group) : null,
        d.restart ? h('span', { class: 'badge gold', title: 'Bir sonraki sürüşte uygulanır' }, 'SONRAKİ SÜRÜŞ') : null,
        d.advanced ? h('span', { class: 'badge', title: 'Gelişmiş seçenek' }, 'GELİŞMİŞ') : null,
        d.help ? tip(d.help) : null,
      ),
      h('div', { class: 'set-ctl' },
        this.control(d),
        h('button', { class: 'set-reset', type: 'button', 'aria-label': `${d.label} varsayılana dön`, title: 'Varsayılana dön', 'data-nav-skip': changed ? undefined : '', disabled: !changed, onclick: () => {
          this.apply({ [d.key]: this.baseline(d) });
          this.redo();
        } }, icon('reset', 14)),
      ),
    );
  }

  private control(d: SettingDef): HTMLElement {
    const v = this.values[d.key];
    const a = this.ctx.a;
    if (d.type === 'toggle') {
      const on = v === true;
      return h('button', { class: `toggle ${on ? 'on' : ''}`, type: 'button', role: 'switch', 'aria-checked': on ? 'true' : 'false', 'aria-label': d.label, 'data-testid': `set-${d.key}`, 'data-nid': d.key, onclick: async () => {
        if (d.key === 'ctrl.tilt' && !on) {
          const ok = await a.enableTilt();
          if (!ok) {
            this.ctx.toast('Eğim sensörü izni verilmedi', 'bad');
            return;
          }
        }
        this.apply({ [d.key]: !on });
        this.redo();
      } }, h('i', {}));
    }
    if (d.type === 'select') {
      if (d.key === PRESET_KEY) return h('span', {});
      if (d.options.length <= 5) {
        return h('div', { class: 'seg', role: 'group', 'aria-label': d.label }, d.options.map((o) =>
          h('button', { class: o.value === v ? 'sel' : '', type: 'button', title: o.help, 'aria-pressed': o.value === v ? 'true' : 'false', 'data-testid': `set-${d.key}-${o.value}`, 'data-nid': `${d.key}-${o.value}`, onclick: () => {
            this.apply({ [d.key]: o.value });
            this.redo();
          } }, o.label),
        ));
      }
      const sel = h('select', { class: 'select', 'aria-label': d.label, 'data-testid': `set-${d.key}`, 'data-nid': d.key }, d.options.map((o) => h('option', { value: o.value, selected: o.value === v }, o.label)));
      sel.addEventListener('change', () => {
        this.apply({ [d.key]: sel.value });
        this.redo();
      });
      return sel;
    }
    const fmt = (x: number) => (d.format ? d.format(x) : `${Number(x.toFixed(2))}${d.unit ?? ''}`);
    const cur = typeof v === 'number' ? v : d.default;
    const out = h('output', { class: 'set-val' }, fmt(cur));
    const input = h('input', { class: 'range', type: 'range', min: d.min, max: d.max, step: d.step, value: cur, 'aria-label': d.label, 'data-testid': `set-${d.key}`, 'data-nid': d.key });
    const fill = () => input.style.setProperty('--fill', `${((Number(input.value) - d.min) / (d.max - d.min)) * 100}%`);
    fill();
    input.addEventListener('input', () => {
      fill();
      out.textContent = fmt(Number(input.value));
      this.applyLater(d.key, Number(input.value));
    });
    // Moving a slider can flip the preset to "Özel" and mark rows as changed: refresh once the drag ends.
    input.addEventListener('change', () => {
      this.flush();
      this.updatePreview();
      this.redo();
    });
    return h('div', { class: 'slider' }, input, out);
  }

  // ───────────────────────────── graphics presets ─────────────────────────────
  private presetStrip(): HTMLElement {
    const cur = String(this.values[PRESET_KEY]);
    const match = SETTINGS.matchingPreset(this.values);
    const custom = cur === 'custom' || !match;
    const def = SETTINGS.get(PRESET_KEY);
    const labels = new Map(def && def.type === 'select' ? def.options.map((o) => [o.value, o.label]) : []);
    return h('section', { class: 'preset-strip', 'aria-label': 'Grafik ön ayarları' },
      h('div', { class: 'section-title' }, 'Grafik ön ayarı'),
      h('div', { class: 'preset-grid', role: 'group' },
        QUALITY_PRESETS.map((p) => {
          const info = PRESET_INFO[p];
          const sel = !custom && cur === p;
          return h('button', { class: `preset ${sel ? 'sel' : ''} p-${p}`, type: 'button', 'aria-pressed': sel ? 'true' : 'false', 'data-testid': `set-${PRESET_KEY}-${p}`, 'data-nid': `preset-${p}`, onclick: () => {
            this.apply({ [PRESET_KEY]: p });
            this.redo();
          } },
            h('b', {}, labels.get(p) ?? p),
            h('span', { class: 'preset-load', 'aria-label': `GPU yükü ${info.load} / 5` }, [1, 2, 3, 4, 5].map((i) => h('i', { class: i <= info.load ? 'on' : '' }))),
            h('small', {}, info.desc),
            h('em', {}, info.for),
          );
        }),
      ),
      h('div', { class: 'preset-state', 'data-testid': 'preset-state' },
        custom ? h('span', { class: 'badge gold' }, 'ÖZEL') : h('span', { class: 'badge green' }, 'ÖN AYAR'),
        custom ? 'Ayarlar elle değiştirildi. Bir ön ayara basarak hepsini birden geri alabilirsin.' : `${labels.get(cur) ?? cur} ön ayarı etkin.`,
      ),
    );
  }

  // ───────────────────────────── controls help ─────────────────────────────
  private controlsHelp(): HTMLElement {
    const table = (title: string, ico: string, rows: [string, string][]) =>
      h('div', { class: 'keys-card glass' },
        h('div', { class: 'section-title' }, icon(ico, 14), title),
        rows.map(([k, v]) => h('div', { class: 'keys-row' }, h('span', { class: 'kbd' }, k), h('span', {}, v))),
      );
    return h('div', { class: 'keys-grid' }, table('Klavye', 'keyboard', KEYS_HELP), table('Oyun kolu', 'pad', PAD_HELP));
  }

  // ───────────────────────────── HUD live preview ─────────────────────────────
  private hudPreview(): HTMLElement {
    this.previewEl = h('div', { class: 'hudp', 'data-testid': 'hud-preview', 'aria-hidden': 'true' });
    this.updatePreview(true);
    return h('div', { class: 'hudp-wrap' }, h('div', { class: 'section-title' }, 'Canlı önizleme'), this.previewEl);
  }

  private updatePreview(force = false): void {
    const el = this.previewEl;
    if (!el || (!force && !el.isConnected)) return;
    const v = this.values;
    const n = (k: string, d: number) => (typeof v[k] === 'number' ? (v[k] as number) : d);
    const b = (k: string) => v[k] !== false;
    const mph = v['hud.units'] === 'mph';
    el.style.setProperty('--p-scale', String(n('hud.scale', 100) / 100));
    el.style.setProperty('--p-opacity', String(n('hud.opacity', 100) / 100));
    el.style.setProperty('--p-gauge', String(n('hud.gaugeScale', 100) / 100));
    el.dataset.layout = String(v['hud.layout'] ?? 'classic');
    el.dataset.gauge = String(v['hud.gaugeStyle'] ?? 'dial');
    clear(el);
    const rpm = h('div', { class: 'hudp-rpm' }, [...Array(14)].map((_, i) => h('i', { class: i < 9 ? 'on' : '', style: i >= 11 ? 'background:var(--c-bad)' : '' })));
    const parts: (HTMLElement | null)[] = [
      h('div', { class: 'hudp-road' }),
      b('hud.showScore') ? h('div', { class: 'hudp-score' }, h('small', {}, 'PUAN'), h('b', {}, '12.480'), b('hud.showDistance') ? h('span', {}, '2,41 km · 7 kıl payı') : null) : null,
      b('hud.showCombo') ? h('div', { class: 'hudp-combo' }, 'KOMBO x1,6') : null,
      b('hud.popups') ? h('div', { class: 'hudp-popup' }, h('b', {}, 'KIL PAYI!'), h('span', {}, '+240')) : null,
      b('hud.chips') ? h('div', { class: 'hudp-chip' }, 'WHEELIE') : null,
      h('div', { class: 'hudp-gauge' }, b('hud.showRpm') ? rpm : null, h('b', {}, mph ? '112' : '180'), h('small', {}, mph ? 'mph' : 'km/s'), b('hud.showGear') ? h('em', {}, '4') : null),
    ];
    for (const p of parts) if (p) el.append(p);
  }

  // ───────────────────────────── reset, import, export ─────────────────────────────
  private resetTab(cat: SettingCategory): void {
    const patch: Record<string, unknown> = {};
    for (const d of SETTINGS.byCategory(cat)) if (d.key !== PRESET_KEY && this.changed(d)) patch[d.key] = this.baseline(d);
    this.ctx.dialog({
      title: `${CATEGORY_LABELS[cat]} ayarlarını sıfırla`,
      icon: 'reset',
      body: [h('p', {}, `${Object.keys(patch).length} ayar bu sekmenin ön ayarındaki değerlerine döner. İlerlemen etkilenmez.`)],
      confirm: { label: 'SIFIRLA', cls: 'danger', testid: 'tab-reset-confirm', run: () => {
        this.apply(patch);
        this.redo();
        this.ctx.toast('Sekme sıfırlandı', 'good');
      } },
    });
  }

  private exportDialog(): void {
    const data: Record<string, SettingValue> = {};
    for (const d of SETTINGS.list()) data[d.key] = this.values[d.key] ?? d.default;
    const json = JSON.stringify(data, null, 1);
    const ta = h('textarea', { class: 'field set-json', readonly: true, rows: '8', 'aria-label': 'Ayarlar (JSON)', 'data-testid': 'settings-json' }, json);
    this.ctx.dialog({
      title: 'Ayarları dışa aktar',
      icon: 'save',
      body: [h('p', {}, 'Bu metni kopyalayıp başka bir cihazda “İçe aktar” ile yapıştırabilirsin.'), ta],
      confirm: { label: 'KOPYALA', run: () => {
        ta.select();
        void navigator.clipboard?.writeText(json).then(
          () => this.ctx.toast('Panoya kopyalandı', 'good'),
          () => this.ctx.toast('Kopyalanamadı: metni elle seç', 'bad'),
        );
        return false;
      } },
      cancelLabel: 'KAPAT',
      wide: true,
    });
  }

  private importDialog(): void {
    const ta = h('textarea', { class: 'field set-json', rows: '8', placeholder: '{ "gfx.preset": "high", … }', 'aria-label': 'Ayarlar (JSON)', 'data-testid': 'settings-json-in' });
    this.ctx.dialog({
      title: 'Ayarları içe aktar',
      icon: 'plus',
      body: [h('p', {}, 'Daha önce dışa aktardığın ayar metnini yapıştır. Geçersiz değerler yok sayılır.'), ta],
      confirm: { label: 'UYGULA', testid: 'settings-import-apply', run: () => {
        try {
          const raw = JSON.parse(ta.value) as unknown;
          if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('bad');
          const src = raw as Record<string, unknown>;
          const keys = Object.keys(src).filter((k) => SETTINGS.has(k));
          if (!keys.length) throw new Error('empty');
          // The master preset first (it rewrites many keys), then the individual values on top.
          keys.sort((x, y) => (x === PRESET_KEY ? -1 : y === PRESET_KEY ? 1 : 0));
          const patch: Record<string, unknown> = {};
          for (const k of keys) patch[k] = src[k];
          this.apply(patch);
          this.redo();
          this.ctx.toast(`${keys.length} ayar içe aktarıldı`, 'good');
          return true;
        } catch {
          this.ctx.toast('Metin okunamadı', 'bad');
          return false;
        }
      } },
      wide: true,
    });
  }

  // ───────────────────────────── progress ─────────────────────────────
  private progressBlock(): HTMLElement {
    return h('div', { class: 'set-group glass danger-zone' },
      h('div', { class: 'section-title' }, 'İlerleme'),
      h('div', { class: 'set-row' },
        h('div', { class: 'set-label' }, h('span', { class: 'set-name' }, 'İlerlemeyi sıfırla'), tip('Tüm motorlar, para, seviye, görevler ve başarımlar silinir. Ayarların korunur.')),
        h('div', { class: 'set-ctl' }, h('button', { class: 'btn small danger', type: 'button', 'data-testid': 'btn-reset', onclick: () => this.confirmReset() }, icon('warn', 16), 'SIFIRLA')),
      ),
    );
  }

  private confirmReset(): void {
    this.ctx.dialog({
      title: 'İlerleme silinsin mi?',
      icon: 'warn',
      body: [h('p', {}, 'Tüm motosikletlerin, paran, seviyen, kariyer ilerlemen ve başarımların silinecek. Bu işlem geri alınamaz.')],
      confirm: { label: 'EVET, SIFIRLA', cls: 'danger', testid: 'btn-reset-confirm', run: () => {
        this.ctx.a.resetProgress();
        this.redo();
      } },
    });
  }
}

