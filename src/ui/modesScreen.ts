import { BIKE_BY_ID, BIKES } from '../data/bikes';
import { MAPS, MAP_BY_ID, TIME_LABELS, WEATHER_LABELS, type MapId, type TimeOfDay, type Weather } from '../data/maps';
import { MODES, MODE_BY_ID, type FreeModeId } from '../data/modes';
import { isCareerMapUnlocked } from '../game/careerProgress';
import { bestScore } from '../game/leaderboard';
import { levelForXp } from '../game/progression';
import { btn, header, type UiCtx } from './ctx';
import { fmtInt, fmtMoney, h, rerender } from './dom';
import { icon } from './icons';
import { mapArt } from './mapArt';
import { cashChip, chipEl } from './widgets';
import './modes.css';

const MODE_ICON: Record<FreeModeId, string> = { endless: 'infinity', twoway: 'twoway', timetrial: 'timer', freeride: 'route' };
const TIME_ICON: Record<TimeOfDay, string> = { dawn: 'dawn', day: 'sun', sunset: 'sunset', night: 'moon' };
const WEATHER_ICON: Record<Weather, string> = { clear: 'clear', cloudy: 'cloud', rain: 'rain', fog: 'fog', snow: 'snow' };

/** Quick ride: mode cards, map gallery, time and weather chips, and a summary with the best scores. */
export class ModesScreen {
  private mode: FreeModeId;
  private map: MapId;
  private time: TimeOfDay;
  private weather: Weather;
  private host: HTMLElement | null = null;

  constructor(private ctx: UiCtx) {
    const run = ctx.save.data.lastRun;
    this.mode = run.mode === 'career' ? 'endless' : (run.mode as FreeModeId);
    this.map = run.map;
    this.time = run.time;
    this.weather = run.weather;
  }

  /** Free-play maps open with the rider level (MapDef.unlockLevel) or once the career has reached them. */
  private open(id: MapId): boolean {
    const m = MAP_BY_ID.get(id);
    const d = this.ctx.save.data;
    return !!m && (levelForXp(d.xp) >= m.unlockLevel || isCareerMapUnlocked(d.career, id));
  }

  private normalise(): void {
    if (!this.open(this.map)) {
      const first = MAPS.find((m) => this.open(m.id)) ?? MAPS[0];
      this.map = first.id;
      this.time = first.defaultTime;
      this.weather = first.defaultWeather;
    }
    const map = MAP_BY_ID.get(this.map) ?? MAPS[0];
    if (!map.times.includes(this.time)) this.time = map.defaultTime;
    if (!map.weathers.includes(this.weather)) this.weather = map.defaultWeather;
  }

  render(host: HTMLElement): void {
    this.host = host;
    this.normalise();
    rerender(host, () => this.build(host));
  }

  private redo(): void {
    if (this.host) this.render(this.host);
  }

  private build(host: HTMLElement): void {
    const { save, a } = this.ctx;
    const d = save.data;
    const map = MAP_BY_ID.get(this.map) ?? MAPS[0];
    const mode = MODE_BY_ID.get(this.mode)!;
    const bike = BIKE_BY_ID.get(d.selectedBike) ?? BIKES[0];

    const modeCards = MODES.map((m) => {
      const best = bestScore(d.leaderboards, m.id as FreeModeId, this.map) || (d.highScores[m.id] ?? 0);
      return h('button', { class: `card mode ${m.id === this.mode ? 'sel' : ''}`, type: 'button', 'data-testid': `mode-${m.id}`, 'data-nid': `mode-${m.id}`, 'aria-pressed': m.id === this.mode ? 'true' : 'false', onclick: () => {
        this.mode = m.id as FreeModeId;
        this.redo();
      } },
        h('span', { class: 'mode-ico' }, icon(MODE_ICON[m.id as FreeModeId], 28)),
        h('span', { class: 'card-title' }, m.name),
        h('span', { class: 'card-desc' }, m.description),
        h('span', { class: 'card-foot' }, icon('trophy', 14), best > 0 ? `Rekor: ${fmtInt(best)}` : 'Rekor yok'),
      );
    });

    const mapCards = MAPS.map((m) => {
      const open = this.open(m.id);
      const sel = m.id === this.map;
      const bests = MODES.map((x) => bestScore(d.leaderboards, x.id as FreeModeId, m.id)).filter((x) => x > 0);
      return h('button', { class: `card env ${sel ? 'sel' : ''} ${open ? '' : 'locked'}`, type: 'button', 'data-testid': `map-${m.id}`, 'data-nid': `map-${m.id}`, 'data-locked': open ? '0' : '1', 'aria-pressed': sel ? 'true' : 'false', onclick: () => {
        if (!open) {
          this.ctx.toast(`${m.name}: Seviye ${m.unlockLevel} gerekli`, 'bad');
          return;
        }
        this.map = m.id;
        this.time = m.defaultTime;
        this.weather = m.defaultWeather;
        this.redo();
      } },
        h('span', { class: 'env-art' }, mapArt(m.id, m.defaultTime, m.defaultWeather),
          open ? null : h('span', { class: 'lock-veil' }, icon('lock', 26), h('b', {}, `Seviye ${m.unlockLevel}`)),
          h('span', { class: 'env-tag', style: `background:${m.color}` }, m.region.split('—')[0].trim()),
        ),
        h('span', { class: 'card-title' }, m.name),
        h('span', { class: 'card-sub' }, open ? (bests.length ? `Rekor ${fmtInt(Math.max(...bests))}` : m.region) : `Kilitli · Seviye ${m.unlockLevel}`),
      );
    });

    const chips = <T extends string>(opts: readonly T[], all: readonly T[], labels: Record<T, string>, icons: Record<T, string>, cur: T, prefix: string, set: (v: T) => void) =>
      h('div', { class: 'chip-row', role: 'group' }, all.map((o) => {
        const on = opts.includes(o);
        return h('button', { class: `chip big ${o === cur ? 'sel' : ''} ${on ? '' : 'off'}`, type: 'button', disabled: !on, 'data-testid': `${prefix}-${o}`, 'data-nid': `${prefix}-${o}`, 'aria-pressed': o === cur ? 'true' : 'false', title: on ? undefined : 'Bu haritada yok', onclick: () => {
          set(o);
          this.redo();
        } }, icon(icons[o], 18), labels[o]);
      }));
    const allTimes = Object.keys(TIME_LABELS) as TimeOfDay[];
    const allWeathers = Object.keys(WEATHER_LABELS) as Weather[];

    const board = d.leaderboards[`${this.mode}:${this.map}`] ?? [];
    const summary = h('aside', { class: 'summary glass', 'data-testid': 'modes-summary' },
      h('div', { class: 'summary-art' }, mapArt(this.map, this.time, this.weather), h('span', { class: 'env-tag', style: `background:${map.color}` }, map.region)),
      h('div', { class: 'summary-title' }, h('b', {}, map.name), h('small', {}, `${mode.name}`)),
      h('div', { class: 'chip-row' },
        chipEl(TIME_LABELS[this.time], TIME_ICON[this.time]),
        chipEl(WEATHER_LABELS[this.weather], WEATHER_ICON[this.weather]),
        chipEl(mode.layout === 'twoway' ? 'Çift yön' : 'Tek yön', mode.layout === 'twoway' ? 'twoway' : 'road'),
        mode.timer ? chipEl(`${mode.timer.start} sn`, 'timer') : null,
        mode.respawn ? chipEl('Yeniden doğma', 'retry') : null,
      ),
      h('div', { class: 'best-matrix', 'data-testid': 'modes-best' },
        h('div', { class: 'section-title' }, 'Bu harita için rekorlar'),
        MODES.map((m) => {
          const b = bestScore(d.leaderboards, m.id as FreeModeId, this.map);
          return h('div', { class: `bm-row ${m.id === this.mode ? 'sel' : ''}` }, icon(MODE_ICON[m.id as FreeModeId], 16), h('span', {}, m.name), h('b', {}, b > 0 ? fmtInt(b) : '—'));
        }),
        board.length > 1 ? h('div', { class: 'card-sub' }, `Bu modda ${board.length} kayıtlı skor`) : null,
      ),
      h('div', { class: 'summary-bike' },
        icon('bike', 22),
        h('span', {}, h('small', {}, 'Motosiklet'), h('b', {}, `${bike.brand} ${bike.model}`)),
        btn('DEĞİŞTİR', () => a.openGarage(), 'small ghost', 'modes-garage'),
      ),
      h('div', { class: 'summary-actions' },
        btn('Rastgele', () => this.randomise(), 'ghost', 'btn-random', 'dice'),
        btn(['YOLA ÇIK ', icon('right', 18)], () => a.start({ mode: this.mode, map: this.map, time: this.time, weather: this.weather }), 'primary big', 'btn-start'),
      ),
    );

    host.append(
      header(this.ctx, { title: 'HIZLI SÜRÜŞ', icon: 'road', backTestid: 'modes-back', right: [cashChip(d.cash)] }),
      h('div', { class: 'body modes-body' },
        h('div', { class: 'scroll modes-main', 'data-keep': 'modes' },
          h('div', { class: 'section-title' }, 'Mod'),
          h('div', { class: 'grid-modes' }, modeCards),
          h('div', { class: 'section-title' }, 'Harita'),
          h('div', { class: 'grid-maps' }, mapCards),
          h('div', { class: 'section-title' }, 'Saat'),
          chips(map.times, allTimes, TIME_LABELS, TIME_ICON, this.time, 'time', (v) => (this.time = v)),
          h('div', { class: 'section-title' }, 'Hava durumu'),
          chips(map.weathers, allWeathers, WEATHER_LABELS, WEATHER_ICON, this.weather, 'weather', (v) => (this.weather = v)),
          h('div', { class: 'modes-pad' }),
        ),
        summary,
      ),
    );
    this.ctx.nav.shortcuts.alt = () => this.randomise();
    this.ctx.nav.shortcuts.start = () => a.start({ mode: this.mode, map: this.map, time: this.time, weather: this.weather });
    void fmtMoney;
  }

  private randomise(): void {
    const opens = MAPS.filter((m) => this.open(m.id));
    const m = opens[Math.floor(Math.random() * opens.length)] ?? MAPS[0];
    this.map = m.id;
    this.time = m.times[Math.floor(Math.random() * m.times.length)];
    this.weather = m.weathers[Math.floor(Math.random() * m.weathers.length)];
    this.mode = MODES[Math.floor(Math.random() * MODES.length)].id as FreeModeId;
    this.redo();
  }
}
