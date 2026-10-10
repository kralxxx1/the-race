import { BIKES, BIKE_BY_ID, BRANDS, LAYOUT_LABEL, STYLE_LABEL, type BikeSpec, type BikeStyle } from '../data/bikes';
import { MAPS, MAP_BY_ID, TIME_LABELS, WEATHER_LABELS, type MapId, type RunConfig, type TimeOfDay, type Weather } from '../data/maps';
import { MODES, type ModeId } from '../data/modes';
import { CATEGORY_LABELS, CATEGORY_ORDER, SETTINGS, type SettingCategory, type SettingDef } from '../settings';
import { MAX_UPGRADE, measurePerformance, type PerformanceFigures, type Upgrades } from '../physics/bike';
import type { RunStats } from '../game/scoring';
import { SaveManager, type SaveData } from '../storage/save';
import { clear, fmtDistance, fmtInt, fmtMoney, h } from './dom';

export interface UiActions {
  openModes(): void;
  openGarage(): void;
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
}

const perfCache = new Map<string, PerformanceFigures>();
function perf(b: BikeSpec, u: Upgrades): PerformanceFigures {
  const key = `${b.id}:${u.engine}`;
  let p = perfCache.get(key);
  if (!p) {
    p = measurePerformance(b, u, 90);
    perfCache.set(key, p);
  }
  return p;
}

const TIME_GRADIENT: Record<TimeOfDay, string> = {
  dawn: 'linear-gradient(160deg,#3b4f7a,#f2b27a 65%,#4a4038)',
  day: 'linear-gradient(160deg,#2f6fc0,#bcd7ef 60%,#6b7d5a)',
  sunset: 'linear-gradient(160deg,#2d3561,#ff9a5a 60%,#a7643a)',
  night: 'linear-gradient(160deg,#03050c,#1d2236 60%,#ff9a3c)',
};

const MAX = { hp: 320, torque: 230, weight: 400, top: 400 };

/** All menu screens rendered as DOM overlays above the 3D canvas. */
export class Screens {
  readonly root: HTMLElement;
  private panels = new Map<string, HTMLElement>();
  private current = '';
  private garageSel: string;
  private garageLivery = 0;
  private brandFilter = 'all';
  private styleFilter: BikeStyle | 'all' = 'all';
  private modeSel: ModeId;
  private mapSel: MapId;
  private timeSel: TimeOfDay;
  private weatherSel: Weather;
  private settingsTab: SettingCategory = 'graphics';
  private confirmReset = false;

  constructor(
    parent: HTMLElement,
    private save: SaveManager,
    private a: UiActions,
  ) {
    this.root = h('div', { class: 'screens' });
    parent.append(this.root);
    this.garageSel = save.data.selectedBike;
    const run = save.data.lastRun;
    this.modeSel = run.mode;
    this.mapSel = run.map;
    this.timeSel = run.time;
    this.weatherSel = run.weather;
  }

  get data(): SaveData {
    return this.save.data;
  }

  private panel(name: string): HTMLElement {
    let p = this.panels.get(name);
    if (!p) {
      p = h('div', { class: `panel panel-${name}`, 'data-screen': name });
      this.panels.set(name, p);
      this.root.append(p);
    }
    return p;
  }

  show(name: string): void {
    this.current = name;
    for (const [k, p] of this.panels) p.classList.toggle('visible', k === name);
    this.root.classList.toggle('active', name !== '');
    this.root.dataset.screen = name;
  }

  get screen(): string {
    return this.current;
  }

  hideAll(): void {
    this.show('');
  }

  private btn(label: string, onclick: () => void, cls = '', testid?: string): HTMLButtonElement {
    return h('button', { class: `btn ${cls}`, 'data-testid': testid, onclick: () => { this.a.click(); onclick(); } }, label);
  }

  // ───────────────────────────── loading ─────────────────────────────
  loading(text: string, progress?: number): void {
    const p = this.panel('loading');
    clear(p);
    p.append(
      h('div', { class: 'loading-box' },
        h('div', { class: 'logo small' }, 'THE ', h('span', {}, 'RACE')),
        h('div', { class: 'spinner' }),
        h('div', { class: 'loading-text' }, text),
        progress !== undefined ? h('div', { class: 'bar' }, h('div', { class: 'bar-fill', style: `width:${Math.round(progress * 100)}%` })) : null,
      ),
    );
    this.show('loading');
  }

  // ───────────────────────────── main menu ─────────────────────────────
  menu(): void {
    const p = this.panel('menu');
    clear(p);
    const d = this.data;
    const bike = BIKE_BY_ID.get(d.selectedBike)!;
    const best = Math.max(0, ...Object.values(d.highScores).map((x) => x ?? 0));
    p.append(
      h('div', { class: 'menu-left' },
        h('div', { class: 'logo' }, 'THE ', h('span', {}, 'RACE')),
        h('div', { class: 'tagline' }, 'GERÇEKÇİ TRAFİK MOTOSİKLET SÜRÜŞÜ'),
        h('div', { class: 'menu-buttons' },
          this.btn('YOLA ÇIK', () => this.a.openModes(), 'primary big', 'btn-play'),
          this.btn('GARAJ', () => this.a.openGarage(), '', 'btn-garage'),
          this.btn('AYARLAR', () => this.a.openSettings(), '', 'btn-settings'),
        ),
        h('div', { class: 'menu-stats' },
          h('div', {}, h('b', {}, fmtMoney(d.cash)), h('span', {}, 'Para')),
          h('div', {}, h('b', {}, fmtInt(best)), h('span', {}, 'En iyi skor')),
          h('div', {}, h('b', {}, fmtDistance(d.totalDistance)), h('span', {}, 'Toplam mesafe')),
          h('div', {}, h('b', {}, String(d.ownedBikes.length)), h('span', {}, 'Motosiklet')),
        ),
        this.save.persistent ? null : h('div', { class: 'warn-box' }, 'Tarayıcı depolaması kapalı: ilerleme bu oturumdan sonra kaybolur.'),
      ),
      h('div', { class: 'menu-bike' },
        h('div', { class: 'bike-brand' }, bike.brand),
        h('div', { class: 'bike-model', 'data-testid': 'menu-bike' }, bike.model),
        h('div', { class: 'bike-meta' }, `${STYLE_LABEL[bike.style]} · ${LAYOUT_LABEL[bike.engine.layout]} · ${bike.engine.hp} hp`),
      ),
    );
    this.show('menu');
  }

  // ───────────────────────────── mode select ─────────────────────────────
  modes(): void {
    const p = this.panel('modes');
    clear(p);
    const d = this.data;
    const modeCards = MODES.map((m) =>
      h('div', { class: `card mode ${m.id === this.modeSel ? 'sel' : ''}`, 'data-testid': `mode-${m.id}`, onclick: () => { this.a.click(); this.modeSel = m.id; this.modes(); } },
        h('div', { class: 'card-title' }, m.name),
        h('div', { class: 'card-desc' }, m.description),
        h('div', { class: 'card-foot' }, (d.highScores[m.id] ?? 0) > 0 ? `Rekor: ${fmtInt(d.highScores[m.id] ?? 0)}` : 'Rekor yok'),
      ),
    );
    const map = MAP_BY_ID.get(this.mapSel) ?? MAPS[0];
    if (!map.times.includes(this.timeSel)) this.timeSel = map.defaultTime;
    if (!map.weathers.includes(this.weatherSel)) this.weatherSel = map.defaultWeather;
    const mapCards = MAPS.map((m) =>
      h('div', { class: `card env ${m.id === this.mapSel ? 'sel' : ''}`, 'data-testid': `map-${m.id}`, onclick: () => {
        this.a.click();
        this.mapSel = m.id;
        this.timeSel = m.defaultTime;
        this.weatherSel = m.defaultWeather;
        this.modes();
      } },
        h('div', { class: 'env-swatch', style: `background:${TIME_GRADIENT[m.defaultTime]};box-shadow:inset 0 -4px 0 ${m.color}` }),
        h('div', { class: 'card-title' }, m.name),
        h('div', { class: 'card-sub' }, m.region),
        h('div', { class: 'card-desc' }, m.description),
      ),
    );
    const chips = <T extends string>(opts: readonly T[], labels: Record<T, string>, cur: T, prefix: string, set: (v: T) => void) =>
      h('div', { class: 'seg' }, opts.map((o) => h('button', { class: o === cur ? 'sel' : '', 'data-testid': `${prefix}-${o}`, onclick: () => { this.a.click(); set(o); this.modes(); } }, labels[o])));
    const envCards = [
      h('div', { class: 'set-row' }, h('div', { class: 'set-label' }, 'Zaman'), chips(map.times, TIME_LABELS, this.timeSel, 'time', (v) => (this.timeSel = v))),
      h('div', { class: 'set-row' }, h('div', { class: 'set-label' }, 'Hava'), chips(map.weathers, WEATHER_LABELS, this.weatherSel, 'weather', (v) => (this.weatherSel = v))),
    ];
    const bike = BIKE_BY_ID.get(d.selectedBike)!;
    p.append(
      h('div', { class: 'header' }, this.btn('‹ GERİ', () => this.a.back(), 'ghost'), h('div', { class: 'title' }, 'SÜRÜŞ MODU'), h('div', { class: 'cash' }, fmtMoney(d.cash))),
      h('div', { class: 'scroll' },
        h('div', { class: 'section-title' }, 'Mod'),
        h('div', { class: 'grid4' }, modeCards),
        h('div', { class: 'section-title' }, 'Harita'),
        h('div', { class: 'grid4' }, mapCards),
        h('div', { class: 'section-title' }, 'Zaman ve hava'),
        envCards,
      ),
      h('div', { class: 'footer' },
        h('div', { class: 'footer-bike' }, `${bike.brand} ${bike.model}`),
        this.btn('YOLA ÇIK ›', () => this.a.start({ mode: this.modeSel, map: this.mapSel, time: this.timeSel, weather: this.weatherSel }), 'primary big', 'btn-start'),
      ),
    );
    this.show('modes');
  }

  // ───────────────────────────── garage ─────────────────────────────
  garage(): void {
    const p = this.panel('garage');
    clear(p);
    const d = this.data;
    const sel = BIKE_BY_ID.get(this.garageSel) ?? BIKES[0];
    const owned = this.save.owns(sel.id);
    const list = BIKES.filter((b) => (this.brandFilter === 'all' || b.brand === this.brandFilter) && (this.styleFilter === 'all' || b.style === this.styleFilter))
      .sort((x, y) => x.price - y.price);
    const brandSelect = h('select', { class: 'select', 'aria-label': 'Marka', onchange: (e: Event) => { this.brandFilter = (e.target as HTMLSelectElement).value; this.garage(); } },
      h('option', { value: 'all' }, `Tüm markalar (${BRANDS.length})`),
      BRANDS.map((b) => h('option', { value: b, selected: b === this.brandFilter }, b)),
    );
    const styles: (BikeStyle | 'all')[] = ['all', 'sport', 'hyper', 'naked', 'adventure', 'touring', 'cruiser', 'classic', 'scooter'];
    const styleChips = styles.map((s) => h('button', { class: `chip-btn ${this.styleFilter === s ? 'sel' : ''}`, onclick: () => { this.a.click(); this.styleFilter = s; this.garage(); } }, s === 'all' ? 'Tümü' : STYLE_LABEL[s]));
    const cards = list.map((b) => {
      const own = this.save.owns(b.id);
      return h('div', { class: `bike-card ${b.id === sel.id ? 'sel' : ''} ${own ? 'owned' : ''}`, 'data-testid': `bike-${b.id}`, onclick: () => {
        this.a.click();
        this.garageSel = b.id;
        this.garageLivery = this.save.livery(b.id);
        this.a.previewBike(b.id, this.garageLivery);
        this.garage();
      } },
        h('div', { class: 'bc-brand' }, b.brand),
        h('div', { class: 'bc-model' }, b.model),
        h('div', { class: 'bc-foot' }, h('span', {}, `${b.engine.hp} hp · ${b.topSpeed} km/s`), h('span', { class: 'bc-price' }, own ? (d.selectedBike === b.id ? 'SEÇİLİ' : 'SAHİP') : fmtMoney(b.price))),
      );
    });
    const ups = this.save.upgradesFor(sel.id);
    const pf = perf(sel, ups);
    const bar = (label: string, value: number, max: number, text: string) =>
      h('div', { class: 'stat' }, h('div', { class: 'stat-label' }, label, h('span', {}, text)), h('div', { class: 'stat-bar' }, h('div', { style: `width:${Math.min(100, (value / max) * 100)}%` })));
    const swatches = sel.liveries.map((l, i) =>
      h('button', { class: `swatch ${i === this.garageLivery ? 'sel' : ''}`, title: l.name, 'aria-label': l.name, style: `background:linear-gradient(135deg,${l.primary} 0 55%,${l.secondary} 55% 80%,${l.accent} 80%)`, onclick: () => {
        this.a.click();
        this.garageLivery = i;
        if (owned) this.a.setLivery(sel.id, i);
        this.a.previewBike(sel.id, i);
        this.garage();
      } }),
    );
    const upRow = (kind: keyof Upgrades, label: string) => {
      const lvl = ups[kind];
      const cost = SaveManager.upgradeCost(sel.price, lvl);
      return h('div', { class: 'up-row' },
        h('div', { class: 'up-label' }, label),
        h('div', { class: 'pips' }, Array.from({ length: MAX_UPGRADE }, (_, i) => h('i', { class: i < lvl ? 'on' : '' }))),
        lvl >= MAX_UPGRADE
          ? h('span', { class: 'up-max' }, 'MAKS')
          : this.btn(fmtMoney(cost), () => { if (this.a.upgrade(sel.id, kind)) this.garage(); }, `small ${d.cash < cost || !owned ? 'disabled' : ''}`),
      );
    };
    const actionBtn = owned
      ? d.selectedBike === sel.id
        ? h('div', { class: 'tag sel' }, '✓ SEÇİLİ')
        : this.btn('SEÇ', () => { this.a.selectBike(sel.id); this.garage(); }, 'primary', 'btn-select')
      : this.btn(`SATIN AL  ${fmtMoney(sel.price)}`, () => { if (this.a.buyBike(sel.id)) { this.a.setLivery(sel.id, this.garageLivery); this.garage(); } }, `primary ${d.cash < sel.price ? 'disabled' : ''}`, 'btn-buy');
    const revBtn = h('button', { class: 'btn ghost', 'data-testid': 'btn-rev' }, '🔊 MOTORU DİNLE (basılı tut)');
    const revOn = (e: Event) => { e.preventDefault(); this.a.rev(true); };
    const revOff = () => this.a.rev(false);
    revBtn.addEventListener('pointerdown', revOn);
    revBtn.addEventListener('pointerup', revOff);
    revBtn.addEventListener('pointerleave', revOff);
    revBtn.addEventListener('pointercancel', revOff);
    p.append(
      h('div', { class: 'header' }, this.btn('‹ GERİ', () => this.a.back(), 'ghost', 'btn-back'), h('div', { class: 'title' }, 'GARAJ'), h('div', { class: 'cash', 'data-testid': 'cash' }, fmtMoney(d.cash))),
      h('div', { class: 'garage-body' },
        h('div', { class: 'garage-list' }, h('div', { class: 'filters' }, brandSelect, h('div', { class: 'chips' }, styleChips)), h('div', { class: 'cards' }, cards)),
        h('div', { class: 'garage-spacer' }),
        h('div', { class: 'garage-detail' },
          h('div', { class: 'bike-brand' }, `${sel.brand} · ${sel.year}`),
          h('div', { class: 'bike-model', 'data-testid': 'garage-model' }, sel.model),
          h('div', { class: 'bike-meta' }, `${STYLE_LABEL[sel.style]} · ${LAYOUT_LABEL[sel.engine.layout]}${sel.engine.cc ? ` · ${sel.engine.cc} cc` : ''}${sel.engine.supercharged ? ' · süperşarj' : ''}`),
          h('div', { class: 'bike-desc' }, sel.description),
          bar('Güç', sel.engine.hp, MAX.hp, `${sel.engine.hp} hp @ ${fmtInt(sel.engine.hpRpm)}`),
          bar('Tork', sel.engine.torque, MAX.torque, `${sel.engine.torque} Nm`),
          bar('Azami hız', sel.topSpeed, MAX.top, `${sel.topSpeed} km/s`),
          bar('Hafiflik', MAX.weight - sel.weight + 100, MAX.weight, `${sel.weight} kg`),
          h('div', { class: 'perf' },
            h('div', {}, h('b', {}, `${pf.zeroTo100.toFixed(1)} s`), h('span', {}, '0-100')),
            h('div', {}, h('b', {}, pf.zeroTo200 ? `${pf.zeroTo200.toFixed(1)} s` : '—'), h('span', {}, '0-200')),
            h('div', {}, h('b', {}, `${pf.quarterMile.toFixed(1)} s`), h('span', {}, '400 m')),
            h('div', {}, h('b', {}, `${Math.round(pf.topSpeed)}`), h('span', {}, 'Vmax')),
          ),
          h('div', { class: 'row' }, h('span', { class: 'mini-label' }, 'Renk'), h('div', { class: 'swatches' }, swatches)),
          owned ? h('div', { class: 'ups' }, upRow('engine', 'Motor'), upRow('brakes', 'Fren'), upRow('handling', 'Yol tutuş')) : null,
          h('div', { class: 'actions' }, revBtn, actionBtn),
        ),
      ),
    );
    this.show('garage');
    this.a.previewBike(sel.id, this.garageLivery);
  }

  get garageBike(): string {
    return this.garageSel;
  }

  openGarageAt(id: string): void {
    this.garageSel = id;
    this.garageLivery = this.save.livery(id);
  }

  // ───────────────────────────── settings ─────────────────────────────
  settings(inGame = false): void {
    const p = this.panel('settings');
    clear(p);
    const values = this.data.settings;
    const rerender = () => this.settings(inGame);
    const control = (d: SettingDef): HTMLElement => {
      const v = values[d.key];
      if (d.type === 'toggle') {
        const on = v === true;
        return h('button', { class: `toggle ${on ? 'on' : ''}`, 'aria-pressed': on ? 'true' : 'false', 'aria-label': d.label, 'data-testid': `set-${d.key}`, onclick: async () => {
          this.a.click();
          if (d.key === 'ctrl.tilt' && !on) {
            const ok = await this.a.enableTilt();
            if (!ok) return;
          }
          this.a.applySettings({ [d.key]: !on });
          rerender();
        } }, h('i', {}));
      }
      if (d.type === 'select') {
        if (d.options.length <= 6) {
          return h('div', { class: 'seg' }, d.options.map((o) => h('button', { class: o.value === v ? 'sel' : '', title: o.help, 'data-testid': `set-${d.key}-${o.value}`, onclick: () => {
            this.a.click();
            this.a.applySettings({ [d.key]: o.value });
            rerender();
          } }, o.label)));
        }
        const sel = h('select', { 'aria-label': d.label, 'data-testid': `set-${d.key}` }, d.options.map((o) => h('option', { value: o.value, selected: o.value === v }, o.label)));
        sel.addEventListener('change', () => {
          this.a.applySettings({ [d.key]: sel.value });
          rerender();
        });
        return sel;
      }
      const fmt = (x: number) => (d.format ? d.format(x) : `${Number(x.toFixed(2))}${d.unit ?? ''}`);
      const cur = typeof v === 'number' ? v : d.default;
      const out = h('span', { class: 'set-val' }, fmt(cur));
      const input = h('input', { type: 'range', min: d.min, max: d.max, step: d.step, value: cur, 'aria-label': d.label, 'data-testid': `set-${d.key}` });
      input.addEventListener('input', () => {
        out.textContent = fmt(Number(input.value));
        this.a.applySettings({ [d.key]: Number(input.value) });
      });
      // Preset may have switched to "custom": refresh once the drag ends.
      input.addEventListener('change', () => rerender());
      return h('div', { class: 'slider' }, input, out);
    };
    const tabs = CATEGORY_ORDER.filter((c) => SETTINGS.byCategory(c).length > 0);
    if (!tabs.includes(this.settingsTab)) this.settingsTab = tabs[0];
    const defs = SETTINGS.byCategory(this.settingsTab).filter((d) => !d.visibleIf || d.visibleIf(values));
    const groups = new Map<string, SettingDef[]>();
    for (const d of defs) {
      const g = groups.get(d.group) ?? [];
      g.push(d);
      groups.set(d.group, g);
    }
    const body: HTMLElement[] = [];
    for (const [g, list] of groups) {
      body.push(h('div', { class: 'section-title' }, g));
      for (const d of list) {
        body.push(h('div', { class: 'set-row', 'data-setting': d.key },
          h('div', { class: 'set-label' }, d.label, d.restart ? h('span', { class: 'set-note' }, ' (sonraki sürüşte)') : null, d.help ? h('div', { class: 'set-help' }, d.help) : null),
          control(d),
        ));
      }
    }
    const tabBar = h('div', { class: 'tabs' }, tabs.map((c) => h('button', { class: c === this.settingsTab ? 'sel' : '', 'data-testid': `tab-${c}`, onclick: () => { this.a.click(); this.settingsTab = c; rerender(); } }, CATEGORY_LABELS[c])));
    p.append(
      h('div', { class: 'header' }, this.btn('‹ GERİ', () => this.a.back(), 'ghost', 'btn-back'), h('div', { class: 'title' }, 'AYARLAR'), h('div', {})),
      h('div', { class: 'scroll settings-body' },
        tabBar,
        body,
        inGame ? null : h('div', { class: 'section-title' }, 'İlerleme'),
        inGame ? null : h('div', { class: 'set-row' },
          h('div', { class: 'set-label' }, this.confirmReset ? 'Emin misin? Tüm motorlar ve para silinecek.' : 'İlerlemeyi sıfırla'),
          this.btn(this.confirmReset ? 'EVET, SIFIRLA' : 'SIFIRLA', () => {
            if (this.confirmReset) {
              this.a.resetProgress();
              this.confirmReset = false;
            } else this.confirmReset = true;
            this.settings(inGame);
          }, 'danger small', 'btn-reset'),
        ),
        h('div', { class: 'credits' }, 'Marka ve model adları sahiplerinin ticari markalarıdır; bu hayran oyunu herhangi bir üreticiyle bağlantılı değildir.'),
      ),
    );
    this.show('settings');
  }

  // ───────────────────────────── pause / game over ─────────────────────────────
  pause(): void {
    const p = this.panel('pause');
    clear(p);
    p.append(
      h('div', { class: 'modal' },
        h('div', { class: 'title' }, 'DURAKLATILDI'),
        this.btn('DEVAM ET', () => this.a.resume(), 'primary', 'btn-resume'),
        this.btn('YENİDEN BAŞLA', () => this.a.restart(), '', 'btn-restart'),
        this.btn('AYARLAR', () => this.settings(true), ''),
        this.btn('ANA MENÜ', () => this.a.quitToMenu(), 'ghost', 'btn-quit'),
      ),
    );
    this.show('pause');
  }

  gameOver(reason: 'crash' | 'timeUp' | 'quit', stats: RunStats, cash: number, record: boolean, mode: ModeId): void {
    const p = this.panel('gameover');
    clear(p);
    const title = reason === 'crash' ? 'KAZA!' : reason === 'timeUp' ? 'SÜRE DOLDU' : 'SÜRÜŞ BİTTİ';
    const best = this.data.highScores[mode] ?? 0;
    const cell = (v: string, l: string) => h('div', { class: 'go-cell' }, h('b', {}, v), h('span', {}, l));
    p.append(
      h('div', { class: 'modal wide', 'data-testid': 'gameover' },
        h('div', { class: `title ${reason === 'crash' ? 'red' : ''}` }, title),
        record ? h('div', { class: 'record' }, '★ YENİ REKOR ★') : h('div', { class: 'sub' }, `Rekor: ${fmtInt(best)}`),
        h('div', { class: 'go-score', 'data-testid': 'final-score' }, fmtInt(stats.score)),
        h('div', { class: 'go-grid' },
          cell(fmtDistance(stats.distance), 'Mesafe'),
          cell(`${Math.round(this.data.settings['hud.units'] === 'mph' ? stats.topSpeed * 0.621371 : stats.topSpeed)} ${this.data.settings['hud.units'] === 'mph' ? 'mph' : 'km/s'}`, 'Azami hız'),
          cell(String(stats.nearMisses), 'Kıl payı'),
          cell(`x${stats.maxCombo}`, 'En iyi kombo'),
          cell(String(stats.overtakes), 'Sollama'),
          cell(`${stats.oppositeLaneTime.toFixed(1)} s`, 'Ters yön'),
          cell(`${stats.wheelieTime.toFixed(1)} s`, 'Wheelie'),
          cell(`${Math.floor(stats.time)} s`, 'Süre'),
        ),
        h('div', { class: 'earned' }, '+', fmtMoney(cash)),
        h('div', { class: 'go-buttons' },
          this.btn('TEKRAR', () => this.a.restart(), 'primary', 'btn-retry'),
          this.btn('GARAJ', () => this.a.openGarage(), ''),
          this.btn('ANA MENÜ', () => this.a.quitToMenu(), 'ghost', 'btn-menu'),
        ),
      ),
    );
    this.show('gameover');
  }

  toast(text: string): void {
    const t = h('div', { class: 'toast' }, text);
    document.body.append(t);
    window.setTimeout(() => t.classList.add('out'), 1800);
    window.setTimeout(() => t.remove(), 2400);
  }
}
