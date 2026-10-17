import { MAP_BY_ID, TIME_LABELS, WEATHER_LABELS, type MapId, type TimeOfDay, type Weather } from '../data/maps';
import type { UiCtx } from './ctx';
import { h } from './dom';
import { icon } from './icons';
import { mapArt } from './mapArt';
import { TIPS } from './tips';
import { chipEl } from './widgets';
import './results.css';

export interface LoadingInfo {
  map: MapId;
  time: TimeOfDay;
  weather: Weather;
  bikeName: string;
  modeName: string;
}

const TIME_ICON: Record<TimeOfDay, string> = { dawn: 'dawn', day: 'sun', sunset: 'sunset', night: 'moon' };
const WEATHER_ICON: Record<Weather, string> = { clear: 'clear', cloudy: 'cloud', rain: 'rain', fog: 'fog', snow: 'snow' };

/** Loading screen: map art, run summary, a tip and a progress bar that follows the real loading stages. */
export class LoadingScreen {
  private text: HTMLElement | null = null;
  private fill: HTMLElement | null = null;
  private pct: HTMLElement | null = null;
  private bar: HTMLElement | null = null;

  constructor(private ctx: UiCtx) {}

  render(host: HTMLElement, info?: LoadingInfo): void {
    const map = info ? MAP_BY_ID.get(info.map) : undefined;
    this.text = h('div', { class: 'loading-text', 'data-testid': 'loading-text' }, 'Yükleniyor…');
    this.fill = h('i', { style: 'width:0%' });
    this.pct = h('span', { class: 'loading-pct' }, '');
    this.bar = h('div', { class: 'bar thick' }, this.fill);
    const tip = TIPS[Math.floor(Math.random() * TIPS.length)];
    host.append(
      h('div', { class: 'loading-screen', 'data-testid': 'loading' },
        info ? h('div', { class: 'loading-bg' }, mapArt(info.map, info.time, info.weather)) : null,
        h('div', { class: 'loading-box' },
          h('div', { class: 'logo small' }, 'THE ', h('span', {}, 'RACE')),
          info && map
            ? h('div', { class: 'loading-info' },
                h('b', {}, map.name),
                h('small', {}, `${map.region} · ${info.modeName}`),
                h('div', { class: 'chip-row' }, chipEl(TIME_LABELS[info.time], TIME_ICON[info.time]), chipEl(WEATHER_LABELS[info.weather], WEATHER_ICON[info.weather]), chipEl(info.bikeName, 'bike')),
              )
            : null,
          h('div', { class: 'loading-row' }, this.text, this.pct),
          this.bar,
          h('div', { class: 'loading-tip' }, icon('tip', 18), tip),
        ),
      ),
    );
  }

  update(text: string, progress?: number, _info?: LoadingInfo): void {
    if (this.text) this.text.textContent = text;
    if (this.fill && this.bar) {
      if (progress === undefined) this.bar.classList.add('indeterminate');
      else {
        this.bar.classList.remove('indeterminate');
        this.fill.style.width = `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`;
      }
    }
    if (this.pct) this.pct.textContent = progress === undefined ? '' : `%${Math.round(Math.max(0, Math.min(1, progress)) * 100)}`;
  }
}
