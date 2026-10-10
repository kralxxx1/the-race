import { ACHIEVEMENTS } from '../data/achievements';
import { BIKE_BY_ID } from '../data/bikes';
import { MAPS, MAP_BY_ID, type MapId } from '../data/maps';
import { FREE_MODE_IDS, MODE_BY_ID, type FreeModeId } from '../data/modes';
import { DAILY_REWARDS } from '../data/progression';
import { achContext, achievementProgress, metricValue, unlockedCount } from '../game/achievements';
import { MAX_STARS, completedCount, totalStars } from '../game/careerProgress';
import { dailyStatus } from '../game/daily';
import { boardKey } from '../game/leaderboard';
import { fmtClock, fmtKm } from '../game/missions';
import { levelForXp } from '../game/progression';
import { STAT_KEYS, type StatBlock } from '../game/stats';
import type { SaveManager } from '../storage/save';
import { levelBar } from './careerScreen';
import { clear, fmtInt, fmtMoney, h } from './dom';
import './gameplay.css';

export type ProgressTab = 'achievements' | 'stats' | 'leaderboards' | 'daily';

export interface ProgressActions {
  back(): void;
  claimDaily(): void;
  click(): void;
}

const TAB_LABEL: Record<ProgressTab, string> = { achievements: 'Başarımlar', stats: 'İstatistikler', leaderboards: 'Skor Tablosu', daily: 'Günlük Ödül' };
const TAB_TESTID: Record<ProgressTab, string> = { achievements: 'ach', stats: 'stats', leaderboards: 'lb', daily: 'daily' };

const STAT_LABEL: Record<keyof StatBlock, string> = {
  runs: 'Sürüş',
  distance: 'Mesafe',
  rideTime: 'Sürüş süresi',
  crashes: 'Kaza',
  nearMisses: 'Kıl payı',
  overtakes: 'Sollama',
  topSpeed: 'Azami hız',
  longestWheelie: 'En uzun wheelie',
  wheelieDistance: 'Toplam wheelie',
  oppositeDistance: 'Karşı şerit',
  maxCombo: 'En iyi kombo',
  bestScore: 'En iyi skor',
  bestDistance: 'En uzun sürüş',
  nightDistance: 'Gece',
  rainDistance: 'Yağmur',
  fogDistance: 'Sis',
  snowDistance: 'Kar',
  missionsCompleted: 'Tamamlanan görev',
};

function fmtStat(k: keyof StatBlock, v: number): string {
  switch (k) {
    case 'distance':
    case 'longestWheelie':
    case 'wheelieDistance':
    case 'oppositeDistance':
    case 'bestDistance':
    case 'nightDistance':
    case 'rainDistance':
    case 'fogDistance':
    case 'snowDistance':
      return fmtKm(v);
    case 'rideTime':
      return v >= 3600 ? `${Math.floor(v / 3600)} sa ${Math.floor((v % 3600) / 60)} dk` : fmtClock(v);
    case 'topSpeed':
      return `${Math.round(v)} km/s`;
    case 'maxCombo':
      return `x${Math.floor(v)}`;
    default:
      return fmtInt(v);
  }
}

function fmtAchValue(metric: string, v: number): string {
  if (/Distance$|^distance$|^longestWheelie$|^runDistance$/.test(metric)) return fmtKm(v);
  if (metric === 'topSpeed') return `${Math.round(v)} km/s`;
  if (metric === 'rideTime') return `${Math.floor(v / 60)} dk`;
  return fmtInt(v);
}

export class ProgressScreens {
  tab: ProgressTab = 'achievements';
  private achFilter: 'all' | 'open' | 'locked' = 'all';
  private statsScope: 'lifetime' | 'bikes' | 'maps' = 'lifetime';
  private lbMode: FreeModeId = 'endless';
  private lbMap: MapId = 'highway';

  constructor(private save: SaveManager) {}

  render(p: HTMLElement, a: ProgressActions, rerender: () => void): void {
    clear(p);
    const d = this.save.data;
    const tabs = h('div', { class: 'tabs' },
      (Object.keys(TAB_LABEL) as ProgressTab[]).map((t) =>
        h('button', { class: t === this.tab ? 'sel' : '', 'data-testid': `${TAB_TESTID[t]}-tab`, onclick: () => { a.click(); this.tab = t; rerender(); } }, TAB_LABEL[t]),
      ),
    );
    let body: HTMLElement;
    switch (this.tab) {
      case 'achievements':
        body = this.achievements(a, rerender);
        break;
      case 'stats':
        body = this.stats(a, rerender);
        break;
      case 'leaderboards':
        body = this.leaderboards(a, rerender);
        break;
      case 'daily':
        body = this.daily(a);
        break;
    }
    p.append(
      h('div', { class: 'header' },
        h('button', { class: 'btn ghost', 'data-testid': 'progress-back', onclick: () => { a.click(); a.back(); } }, '‹ GERİ'),
        h('div', { class: 'title' }, TAB_LABEL[this.tab].toLocaleUpperCase('tr-TR')),
        h('div', { class: 'cash' }, fmtMoney(d.cash)),
      ),
      h('div', { class: 'scroll gp-progress' }, levelBar(d.xp, 'progress-level'), tabs, body),
    );
  }

  private achievements(a: ProgressActions, rerender: () => void): HTMLElement {
    const d = this.save.data;
    const ctx = achContext(d);
    const total = ACHIEVEMENTS.length;
    const got = unlockedCount(d.achievements);
    const filters: ['all' | 'open' | 'locked', string][] = [['all', 'Tümü'], ['open', 'Açılanlar'], ['locked', 'Kilitliler']];
    const list = ACHIEVEMENTS.filter((x) => this.achFilter === 'all' || (this.achFilter === 'open') === x.id in d.achievements);
    return h('div', { 'data-testid': 'ach-screen' },
      h('div', { class: 'gp-summary' }, h('b', { 'data-testid': 'ach-count' }, `${got} / ${total}`), h('span', {}, 'başarım açıldı')),
      h('div', { class: 'seg' }, filters.map(([k, l]) => h('button', { class: k === this.achFilter ? 'sel' : '', 'data-testid': `ach-filter-${k}`, onclick: () => { a.click(); this.achFilter = k; rerender(); } }, l))),
      h('div', { class: 'gp-grid' },
        list.map((x) => {
          const done = x.id in d.achievements;
          const prog = done ? 1 : achievementProgress(x, ctx);
          const v = Math.min(metricValue(x.metric, ctx), x.target);
          return h('div', { class: `card gp-ach ${done ? 'done' : ''}`, 'data-testid': `ach-${x.id}`, 'data-unlocked': done ? '1' : '0' },
            h('div', { class: 'card-title' }, `${done ? '🏆' : '🔒'} ${x.title}`),
            h('div', { class: 'card-desc' }, x.description),
            h('div', { class: 'gp-bar' }, h('div', { class: 'gp-bar-fill', style: `width:${(prog * 100).toFixed(1)}%` })),
            h('div', { class: 'gp-ach-foot' },
              h('span', {}, done ? 'Tamamlandı' : `${fmtAchValue(x.metric, v)} / ${fmtAchValue(x.metric, x.target)}`),
              h('span', { class: 'card-foot' }, `${fmtMoney(x.reward.cash)}${x.reward.xp ? ` · ${x.reward.xp} XP` : ''}`),
            ),
          );
        }),
      ),
    );
  }

  private stats(a: ProgressActions, rerender: () => void): HTMLElement {
    const d = this.save.data;
    const scopes: ['lifetime' | 'bikes' | 'maps', string][] = [['lifetime', 'Genel'], ['bikes', 'Motorlar'], ['maps', 'Haritalar']];
    const table = (b: StatBlock, keys: readonly (keyof StatBlock)[]) =>
      h('div', { class: 'gp-stat-grid' }, keys.map((k) => h('div', { class: 'go-cell', 'data-testid': `stats-${k}` }, h('b', {}, fmtStat(k, b[k])), h('span', {}, STAT_LABEL[k]))));
    let content: (HTMLElement | null)[];
    if (this.statsScope === 'lifetime') {
      content = [
        table(d.stats.lifetime, STAT_KEYS),
        h('div', { class: 'section-title' }, 'Kariyer ve ilerleme'),
        h('div', { class: 'gp-stat-grid' },
          h('div', { class: 'go-cell' }, h('b', {}, String(levelForXp(d.xp))), h('span', {}, 'Seviye')),
          h('div', { class: 'go-cell' }, h('b', {}, fmtInt(d.xp)), h('span', {}, 'Toplam XP')),
          h('div', { class: 'go-cell' }, h('b', {}, `${completedCount(d.career)} / 80`), h('span', {}, 'Görev')),
          h('div', { class: 'go-cell' }, h('b', {}, `${totalStars(d.career)} / ${MAX_STARS}`), h('span', {}, 'Yıldız')),
          h('div', { class: 'go-cell' }, h('b', {}, String(d.ownedBikes.length)), h('span', {}, 'Motosiklet')),
          h('div', { class: 'go-cell' }, h('b', {}, `${unlockedCount(d.achievements)}`), h('span', {}, 'Başarım')),
        ),
        h('div', { class: 'section-title' }, 'En iyi skorlar (mod × harita)'),
        this.bestScoreTable(),
      ];
    } else if (this.statsScope === 'bikes') {
      const ids = Object.keys(d.stats.bikes).sort((x, y) => d.stats.bikes[y].distance - d.stats.bikes[x].distance);
      content = ids.length
        ? ids.map((id) => {
            const b = BIKE_BY_ID.get(id)!;
            return h('div', { class: 'gp-stat-block', 'data-testid': `stats-bike-${id}` }, h('div', { class: 'section-title' }, `${b.brand} ${b.model}`), table(d.stats.bikes[id], ['runs', 'distance', 'rideTime', 'topSpeed', 'nearMisses', 'overtakes', 'crashes', 'bestScore']));
          })
        : [h('div', { class: 'gp-note' }, 'Henüz sürüş kaydı yok.')];
    } else {
      content = MAPS.map((m) => {
        const b = d.stats.maps[m.id];
        return h('div', { class: 'gp-stat-block', 'data-testid': `stats-map-${m.id}` },
          h('div', { class: 'section-title' }, `${m.name} · ★${totalStars(d.career, m.id)}/30`),
          b ? table(b, ['runs', 'distance', 'rideTime', 'topSpeed', 'nearMisses', 'overtakes', 'crashes', 'bestScore']) : h('div', { class: 'gp-note' }, 'Bu haritada henüz sürmedin.'),
        );
      });
    }
    return h('div', { 'data-testid': 'stats-screen' },
      h('div', { class: 'seg' }, scopes.map(([k, l]) => h('button', { class: k === this.statsScope ? 'sel' : '', 'data-testid': `stats-scope-${k}`, onclick: () => { a.click(); this.statsScope = k; rerender(); } }, l))),
      content,
    );
  }

  private bestScoreTable(): HTMLElement {
    const lb = this.save.data.leaderboards;
    return h('div', { class: 'gp-table-wrap' },
      h('table', { class: 'gp-table', 'data-testid': 'stats-best-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Harita'), FREE_MODE_IDS.map((m) => h('th', {}, MODE_BY_ID.get(m)!.name)))),
        h('tbody', {}, MAPS.map((map) => h('tr', {}, h('td', {}, map.name), FREE_MODE_IDS.map((m) => h('td', {}, lb[boardKey(m, map.id)]?.[0] ? fmtInt(lb[boardKey(m, map.id)][0].score) : '—'))))),
      ),
    );
  }

  private leaderboards(a: ProgressActions, rerender: () => void): HTMLElement {
    const board = this.save.data.leaderboards[boardKey(this.lbMode, this.lbMap)] ?? [];
    const mapSel = h('select', { class: 'select', 'aria-label': 'Harita', 'data-testid': 'lb-map' }, MAPS.map((m) => h('option', { value: m.id, selected: m.id === this.lbMap }, m.name)));
    mapSel.addEventListener('change', () => {
      this.lbMap = mapSel.value as MapId;
      rerender();
    });
    return h('div', { 'data-testid': 'lb-screen' },
      h('div', { class: 'seg' }, FREE_MODE_IDS.map((m) => h('button', { class: m === this.lbMode ? 'sel' : '', 'data-testid': `lb-mode-${m}`, onclick: () => { a.click(); this.lbMode = m; rerender(); } }, MODE_BY_ID.get(m)!.name))),
      h('div', { class: 'gp-row' }, mapSel),
      board.length
        ? h('div', { class: 'gp-table-wrap' },
            h('table', { class: 'gp-table', 'data-testid': 'lb-table' },
              h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Skor'), h('th', {}, 'Mesafe'), h('th', {}, 'Motor'), h('th', {}, 'Tarih'))),
              h('tbody', {}, board.map((e, i) => {
                const b = BIKE_BY_ID.get(e.bike);
                return h('tr', { 'data-testid': `lb-row-${i + 1}` },
                  h('td', {}, String(i + 1)),
                  h('td', {}, h('b', {}, fmtInt(e.score))),
                  h('td', {}, fmtKm(e.distance)),
                  h('td', {}, b ? b.model : e.bike),
                  h('td', {}, e.date ? new Date(e.date).toLocaleDateString('tr-TR') : '—'),
                );
              })),
            ),
          )
        : h('div', { class: 'gp-note', 'data-testid': 'lb-empty' }, `${MODE_BY_ID.get(this.lbMode)!.name} · ${MAP_BY_ID.get(this.lbMap)!.name}: henüz skor yok.`),
    );
  }

  private daily(a: ProgressActions): HTMLElement {
    const d = this.save.data;
    const st = dailyStatus(d.daily, new Date());
    const can = st.availability === 'available';
    const streakNow = can ? st.nextStreak - 1 : d.daily.streak;
    const msg = can
      ? `Bugünün ödülü hazır: ${fmtMoney(st.reward.cash)} + ${st.reward.xp} XP`
      : st.availability === 'claimed'
        ? 'Bugünün ödülünü aldın. Yarın tekrar gel!'
        : 'Cihaz saati son ödül tarihinin gerisinde görünüyor. Ödül, takvim o günü geçince açılır.';
    return h('div', { 'data-testid': 'daily-screen' },
      h('div', { class: 'gp-summary' }, h('b', { 'data-testid': 'daily-streak' }, `${streakNow} gün`), h('span', {}, 'üst üste seri')),
      h('div', { class: 'gp-daily' },
        DAILY_REWARDS.map((r, i) => {
          const dayNo = i + 1;
          const isNext = can && i === st.ladderIndex;
          const done = i < Math.min(streakNow, DAILY_REWARDS.length) && !(can && i >= st.ladderIndex);
          return h('div', { class: `card gp-day ${isNext ? 'sel' : ''} ${done ? 'done' : ''}`, 'data-testid': `daily-day-${dayNo}` },
            h('div', { class: 'card-sub' }, `${dayNo}. GÜN${dayNo === DAILY_REWARDS.length ? '+' : ''}`),
            h('div', { class: 'card-title' }, fmtMoney(r.cash)),
            h('div', { class: 'card-foot' }, `${r.xp} XP`),
          );
        }),
      ),
      h('div', { class: 'gp-note', 'data-testid': 'daily-status' }, msg),
      h('button', { class: `btn primary big ${can ? '' : 'disabled'}`, 'data-testid': 'daily-claim', onclick: () => { a.click(); if (can) a.claimDaily(); } }, can ? 'ÖDÜLÜ AL' : 'ALINDI'),
      h('div', { class: 'gp-best' }, 'Her gün ödülü al: seri büyüdükçe ödül artar. Bir gün kaçırırsan seri 1. günden başlar.'),
    );
  }
}
