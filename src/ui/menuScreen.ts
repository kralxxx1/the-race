import { BIKES, BIKE_BY_ID, LAYOUT_LABEL, STYLE_LABEL } from '../data/bikes';
import { MAP_BY_ID } from '../data/maps';
import { ACHIEVEMENTS } from '../data/achievements';
import { MAX_STARS, completedCount, currentMission, totalStars } from '../game/careerProgress';
import { dailyStatus } from '../game/daily';
import { unlockedCount } from '../game/achievements';
import type { SaveData } from '../storage/save';
import { fmtDistance, fmtInt, fmtMoney, h } from './dom';
import { icon } from './icons';
import type { UiCtx } from './ctx';
import { levelBar } from './widgets';
import { TIPS } from './tips';
import './menu.css';


/** Main menu: logo, rider profile card, daily reward, navigation, bike plate and a rotating tip. */
export class MenuScreen {
  private tipIndex = 0;
  private plate: HTMLElement | null = null;

  constructor(private ctx: UiCtx) {}

  private dynamicTips(d: SaveData): string[] {
    const cur = currentMission(d.career);
    const out = [...TIPS];
    if (cur) out.unshift(`Sıradaki görev: ${cur.number}. ${cur.title} (${MAP_BY_ID.get(cur.map)?.name}). Kariyer düğmesinden başla.`);
    out.push(`Garajında ${d.ownedBikes.length} / ${BIKES.length} motosiklet var; yeni modeller seviye atladıkça açılır.`);
    return out;
  }

  render(host: HTMLElement): void {
    const { save, a } = this.ctx;
    const d = save.data;
    const daily = dailyStatus(d.daily, new Date());
    const dailyReady = daily.availability === 'available';
    const cur = currentMission(d.career);
    const owned = d.ownedBikes.length;
    const ach = `${unlockedCount(d.achievements)}/${ACHIEVEMENTS.length}`;
    const bikeSpec = BIKE_BY_ID.get(d.selectedBike) ?? BIKES[0];
    const best = Math.max(0, ...Object.values(d.highScores).map((x) => x ?? 0));
    const gear = d.rider;
    const avatarColor = gear.follow ? bikeSpec.liveries[save.livery(bikeSpec.id)]?.suit[0] ?? '#e11d2a' : gear.helmet.base;

    const mbtn = (testid: string, ico: string, label: string, sub: string, cls: string, run: () => void, extra?: Node | null): HTMLButtonElement =>
      h('button', { class: `mbtn ${cls}`.trim(), type: 'button', 'data-testid': testid, onclick: run },
        h('span', { class: 'mbtn-ico' }, icon(ico, 26)),
        h('span', { class: 'mbtn-txt' }, h('b', {}, label), h('small', {}, sub)),
        extra ?? null,
        h('span', { class: 'mbtn-arrow' }, icon('right', 18)),
      );
    const tile = (testid: string, ico: string, label: string, sub: string, run: () => void): HTMLButtonElement =>
      h('button', { class: 'mtile', type: 'button', 'data-testid': testid, onclick: run },
        icon(ico, 22), h('b', {}, label), h('small', {}, sub));

    const left = h('div', { class: 'menu-left' },
      h('div', { class: 'menu-logo' },
        h('div', { class: 'logo' }, 'THE ', h('span', {}, 'RACE')),
        h('div', { class: 'tagline' }, 'GERÇEKÇİ TRAFİK MOTOSİKLET SÜRÜŞÜ'),
      ),
      h('nav', { class: 'menu-list', 'aria-label': 'Ana menü' },
        mbtn('btn-career', 'career', 'KARİYER', cur ? `Görev ${cur.number} · ${MAP_BY_ID.get(cur.map)?.name ?? ''}` : `Tamamlandı · ★ ${totalStars(d.career)}/${MAX_STARS}`, 'primary', () => a.openCareer()),
        mbtn('btn-play', 'road', 'HIZLI SÜRÜŞ', '4 mod · 8 harita · hava ve saat', '', () => a.openModes()),
        mbtn('btn-garage', 'garage', 'GARAJ', `${owned} / ${BIKES.length} motosiklet`, '', () => a.openGarage()),
        mbtn('btn-rider', 'helmet', 'SÜRÜCÜ', 'Kask, tulum ve eldiven', '', () => a.openRider()),
        h('div', { class: 'menu-tiles' },
          tile('btn-achievements', 'trophy', 'BAŞARIMLAR', ach, () => a.openProgress('achievements')),
          tile('btn-stats', 'chart', 'İSTATİSTİKLER', fmtDistance(d.totalDistance), () => a.openProgress('stats')),
          tile('btn-leaderboards', 'podium', 'LİDERLİK', best > 0 ? `En iyi ${fmtInt(best)}` : 'Skor tabloları', () => a.openProgress('leaderboards')),
          tile('btn-settings', 'gear', 'AYARLAR', 'Grafik · ses · kontrol', () => a.openSettings()),
        ),
      ),
      this.ticker(d),
    );

    const profile = h('div', { class: 'menu-profile' },
      h('div', { class: 'profile-card' },
        h('button', { class: 'avatar', type: 'button', 'data-testid': 'btn-profile', 'aria-label': 'Sürücüyü düzenle', style: `--av:${avatarColor}`, onclick: () => a.openRider() }, icon('helmet', 30)),
        h('div', { class: 'profile-main' },
          h('div', { class: 'profile-name' }, h('b', { 'data-testid': 'profile-name' }, gear.name), h('small', {}, `${STYLE_LABEL[bikeSpec.style]} sürücüsü`)),
          levelBar(d.xp, 'rider-level'),
        ),
      ),
      h('div', { class: 'profile-row' },
        h('div', { class: 'cash', 'data-testid': 'menu-cash' }, icon('coin', 18), fmtMoney(d.cash)),
        h('button', { class: `daily-badge ${dailyReady ? 'ready' : ''}`, type: 'button', 'data-testid': 'btn-daily', onclick: () => a.openProgress('daily') },
          icon('gift', 20),
          h('span', {}, dailyReady ? 'Günlük ödül hazır' : 'Günlük ödül'),
          dailyReady ? h('i', { class: 'menu-daily-dot', 'data-testid': 'daily-ready' }) : null,
        ),
      ),
    );

    this.plate = h('div', { class: 'bike-plate' });
    this.fillPlate();

    const stats = h('div', { class: 'menu-stats' },
      [
        ['coin', fmtMoney(d.cash), 'Para'],
        ['trophy', best > 0 ? fmtInt(best) : '—', 'En iyi skor'],
        ['route', fmtDistance(d.totalDistance), 'Toplam mesafe'],
        ['career', `${completedCount(d.career)}/80`, 'Görev'],
        ['star', `${totalStars(d.career)}`, 'Yıldız'],
      ].map(([ico, v, l]) => h('div', { class: 'mstat' }, icon(ico, 16), h('b', {}, v), h('span', {}, l))),
    );

    host.append(
      h('div', { class: 'menu-layout' }, left, profile, this.plate, stats, save.persistent ? null : h('div', { class: 'note warn menu-warn' }, icon('warn', 16), 'Tarayıcı depolaması kapalı: ilerleme bu oturumdan sonra kaybolur.')),
    );
  }

  /** Bike name + cycle arrows + livery dots (rerendered on its own so the rest of the menu stays put). */
  private fillPlate(): void {
    const plate = this.plate;
    if (!plate) return;
    const { save, a } = this.ctx;
    const d = save.data;
    const spec = BIKE_BY_ID.get(d.selectedBike) ?? BIKES[0];
    const ownedIds = d.ownedBikes.filter((id) => BIKE_BY_ID.has(id));
    const idx = Math.max(0, ownedIds.indexOf(spec.id));
    const cycle = (step: number) => {
      if (ownedIds.length < 2) return;
      const next = ownedIds[(idx + step + ownedIds.length) % ownedIds.length];
      if (save.select(next)) {
        a.previewBike(next, save.livery(next));
        this.fillPlate();
      }
    };
    const liv = save.livery(spec.id);
    plate.replaceChildren(
      h('button', { class: 'btn ghost sq plate-arrow', type: 'button', 'aria-label': 'Önceki motosiklet', 'data-testid': 'menu-bike-prev', disabled: ownedIds.length < 2, onclick: () => cycle(-1) }, icon('left', 20)),
      h('div', { class: 'plate-main' },
        h('div', { class: 'bike-brand' }, `${spec.brand} · ${spec.year}`),
        h('div', { class: 'bike-model', 'data-testid': 'menu-bike' }, spec.model),
        h('div', { class: 'bike-meta' }, `${STYLE_LABEL[spec.style]} · ${LAYOUT_LABEL[spec.engine.layout]} · ${spec.engine.hp} hp · ${spec.topSpeed} km/s`),
        h('div', { class: 'plate-dots', role: 'group', 'aria-label': 'Renk' },
          spec.liveries.map((l, i) =>
            h('button', { class: `dot ${i === liv ? 'sel' : ''}`, type: 'button', title: l.name, 'aria-label': l.name, style: `--c1:${l.primary};--c2:${l.secondary}`, onclick: () => {
              save.setLivery(spec.id, i);
              a.previewBike(spec.id, i);
              this.fillPlate();
            } }),
          ),
        ),
      ),
      h('button', { class: 'btn ghost sq plate-arrow', type: 'button', 'aria-label': 'Sonraki motosiklet', 'data-testid': 'menu-bike-next', disabled: ownedIds.length < 2, onclick: () => cycle(1) }, icon('right', 20)),
    );
  }

  /** Rotating tip / news line. */
  private ticker(d: SaveData): HTMLElement {
    const tips = this.dynamicTips(d);
    const text = h('span', { class: 'tick-text' });
    const label = h('span', { class: 'tick-label' });
    const show = () => {
      const i = this.tipIndex++ % tips.length;
      text.classList.remove('in');
      label.textContent = i % 4 === 3 ? 'HABER' : 'İPUCU';
      text.textContent = tips[i];
      // Re-trigger the CSS fade-in.
      void text.offsetWidth;
      text.classList.add('in');
    };
    this.tipIndex = Math.floor(Math.random() * tips.length);
    show();
    const el = h('div', { class: 'menu-ticker', 'aria-live': 'off' }, icon('tip', 18), label, text);
    const id = window.setInterval(() => {
      if (!el.isConnected) window.clearInterval(id);
      else show();
    }, 7000);
    return el;
  }
}

