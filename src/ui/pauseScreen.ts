import { MAP_BY_ID, TIME_LABELS, WEATHER_LABELS, type MapId, type TimeOfDay, type Weather } from '../data/maps';
import { btn, type UiCtx } from './ctx';
import { fmtDistance, fmtInt, fmtTime, h } from './dom';
import { icon } from './icons';
import { mapArt } from './mapArt';
import { bar, chipEl } from './widgets';
import './results.css';

export interface PauseInfo {
  map: MapId;
  time: TimeOfDay;
  weather: Weather;
  modeName: string;
  bikeName: string;
  /** Live run figures. */
  stats: { score: number; distance: number; time: number; nearMisses: number; topSpeed: number; maxCombo: number; unit: 'km/s' | 'mph' };
  mission?: { title: string; objective: string; value: string; progress: number; secondary?: string };
}

/** Pause: mission recap, live run figures and the four ways out. */
export class PauseScreen {
  constructor(private ctx: UiCtx) {}

  private confirmThen(title: string, text: string, label: string, run: () => void, testid: string): void {
    const need = this.ctx.save.data.settings['ui.confirmQuit'] === true;
    if (!need) {
      run();
      return;
    }
    this.ctx.dialog({ title, icon: 'warn', body: [h('p', {}, text)], confirm: { label, cls: 'danger', testid: `${testid}-confirm`, run: () => void run() }, testid: `${testid}-dialog` });
  }

  render(host: HTMLElement, info: PauseInfo): void {
    const { a } = this.ctx;
    const map = MAP_BY_ID.get(info.map);
    const s = info.stats;
    const cell = (ico: string, v: string, l: string) => h('div', { class: 'go-cell' }, icon(ico, 16), h('b', {}, v), h('span', {}, l));
    const m = info.mission;
    host.append(
      h('div', { class: 'modal pause-modal', 'data-testid': 'pause' },
        h('div', { class: 'pause-art' }, mapArt(info.map, info.time, info.weather),
          h('div', { class: 'pause-art-text' }, h('b', {}, map?.name ?? ''), h('small', {}, `${info.modeName} · ${TIME_LABELS[info.time]} · ${WEATHER_LABELS[info.weather]}`))),
        h('div', { class: 'title' }, icon('pause', 22), 'DURAKLATILDI'),
        m
          ? h('div', { class: 'gp-note mission-recap', 'data-testid': 'pause-mission' },
              h('small', {}, m.title),
              h('b', {}, m.objective),
              bar(m.progress, 'thin'),
              h('div', { class: 'gp-best' }, m.value),
              m.secondary ? h('div', { class: 'gp-best' }, m.secondary) : null,
            )
          : h('div', { class: 'chip-row center' }, chipEl(info.bikeName, 'bike'), chipEl(info.modeName, 'road')),
        h('div', { class: 'go-grid compact' },
          cell('trophy', fmtInt(s.score), 'Puan'),
          cell('route', fmtDistance(s.distance), 'Mesafe'),
          cell('clock', fmtTime(s.time), 'Süre'),
          cell('speed', `${Math.round(s.topSpeed)}`, `Azami ${s.unit}`),
          cell('bolt', String(s.nearMisses), 'Kıl payı'),
          cell('fire', `x${s.maxCombo}`, 'Kombo'),
        ),
        h('div', { class: 'pause-buttons' },
          btn('DEVAM ET', () => a.resume(), 'primary big', 'btn-resume', 'play'),
          btn('YENİDEN BAŞLA', () => this.confirmThen('Yeniden başla?', 'Bu sürüşün ilerlemesi sayılmadan baştan başlar.', 'YENİDEN BAŞLA', () => a.restart(), 'restart'), '', 'btn-restart', 'retry'),
          btn('AYARLAR', () => a.openSettings(), '', 'btn-pause-settings', 'gear'),
          btn('ANA MENÜ', () => this.confirmThen('Ana menüye dön?', 'Sürüşün kaydedilir (mesafe ve para kaybolmaz) ve ana menüye dönersin.', 'ANA MENÜ', () => a.quitToMenu(), 'quit'), 'ghost', 'btn-quit', 'home'),
        ),
      ),
    );
    this.ctx.nav.shortcuts.start = () => a.resume();
    void this.ctx;
  }
}
