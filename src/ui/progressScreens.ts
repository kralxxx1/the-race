import { ACHIEVEMENTS, type AchMetric, type AchievementDef } from '../data/achievements';
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
import { btn, header, type ProgressTab, type UiCtx } from './ctx';
import { fmtInt, fmtMoney, h, rerender } from './dom';
import { icon } from './icons';
import { mapArt } from './mapArt';
import { bar, cashChip, levelBar, statTile } from './widgets';
import './progress.css';

export type { ProgressTab } from './ctx';

const TAB_LABEL: Record<ProgressTab, string> = { achievements: 'Başarımlar', stats: 'İstatistikler', leaderboards: 'Liderlik', daily: 'Günlük Ödül' };
const TAB_TESTID: Record<ProgressTab, string> = { achievements: 'ach', stats: 'stats', leaderboards: 'lb', daily: 'daily' };
const TAB_ICON: Record<ProgressTab, string> = { achievements: 'trophy', stats: 'chart', leaderboards: 'podium', daily: 'gift' };

type AchCat = 'all' | 'road' | 'skill' | 'traffic' | 'world' | 'career';
const CAT_LABEL: Record<AchCat, string> = { all: 'Tümü', road: 'Yol', skill: 'Hız ve Beceri', traffic: 'Trafik', world: 'Hava ve Zaman', career: 'Kariyer' };
const METRIC_CAT: Record<AchMetric, Exclude<AchCat, 'all'>> = {
  distance: 'road', rideTime: 'road', runDistance: 'road', mapsVisited: 'road',
  topSpeed: 'skill', wheelieDistance: 'skill', longestWheelie: 'skill', maxCombo: 'skill',
  nearMisses: 'traffic', overtakes: 'traffic', oppositeDistance: 'traffic', crashes: 'traffic',
  nightDistance: 'world', rainDistance: 'world', snowDistance: 'world', fogDistance: 'world',
  missions: 'career', stars: 'career', level: 'career', dailyStreak: 'career', bikesOwned: 'career',
};
const METRIC_ICON: Record<AchMetric, string> = {
  distance: 'route', rideTime: 'clock', runDistance: 'route', mapsVisited: 'globe', topSpeed: 'speed', wheelieDistance: 'bike', longestWheelie: 'bike', maxCombo: 'fire',
  nearMisses: 'bolt', overtakes: 'car', oppositeDistance: 'twoway', crashes: 'warn', nightDistance: 'moon', rainDistance: 'rain', snowDistance: 'snow', fogDistance: 'fog',
  missions: 'career', stars: 'star', level: 'bolt', dailyStreak: 'calendar', bikesOwned: 'garage',
};

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

/** Achievements, statistics, leaderboards and the daily reward, as tabs of one screen. */
export class ProgressScreens {
  tab: ProgressTab = 'achievements';
  private achFilter: 'all' | 'open' | 'locked' = 'all';
  private achCat: AchCat = 'all';
  private statsScope: 'lifetime' | 'bikes' | 'maps' = 'lifetime';
  private lbMode: FreeModeId = 'endless';
  private lbMap: MapId = 'highway';
  private host: HTMLElement | null = null;

  constructor(private ctx: UiCtx) {}

  private redo(): void {
    if (this.host) rerender(this.host, () => this.build(this.host as HTMLElement));
  }

  render(host: HTMLElement): void {
    this.host = host;
    this.build(host);
  }

  private build(host: HTMLElement): void {
    const d = this.ctx.save.data;
    const tabs = h('div', { class: 'tabs prog-tabs', 'data-tabs': '', role: 'tablist' },
      (Object.keys(TAB_LABEL) as ProgressTab[]).map((t) =>
        h('button', { class: t === this.tab ? 'sel' : '', type: 'button', role: 'tab', 'aria-selected': t === this.tab ? 'true' : 'false', 'data-testid': `${TAB_TESTID[t]}-tab`, 'data-nid': `ptab-${t}`, onclick: () => {
          this.tab = t;
          this.redo();
        } }, icon(TAB_ICON[t], 18), TAB_LABEL[t]),
      ),
    );
    let body: HTMLElement;
    switch (this.tab) {
      case 'achievements': body = this.achievements(); break;
      case 'stats': body = this.stats(); break;
      case 'leaderboards': body = this.leaderboards(); break;
      case 'daily': body = this.daily(); break;
    }
    host.append(
      header(this.ctx, { title: TAB_LABEL[this.tab].toLocaleUpperCase('tr-TR'), icon: TAB_ICON[this.tab], backTestid: 'progress-back', right: [cashChip(d.cash)] }),
      h('div', { class: 'scroll prog-body', 'data-keep': 'progress' },
        h('div', { class: 'prog-inner' }, h('div', { class: 'prog-top glass' }, levelBar(d.xp, 'progress-level'), tabs), body),
      ),
    );
  }

  private seg<T extends string>(items: readonly [T, string][], cur: T, set: (v: T) => void, testPrefix: string): HTMLElement {
    return h('div', { class: 'seg', role: 'group' }, items.map(([k, l]) =>
      h('button', { class: k === cur ? 'sel' : '', type: 'button', 'aria-pressed': k === cur ? 'true' : 'false', 'data-testid': `${testPrefix}-${k}`, 'data-nid': `${testPrefix}-${k}`, onclick: () => {
        set(k);
        this.redo();
      } }, l),
    ));
  }

  // ───────────────────────────── achievements ─────────────────────────────
  private achievements(): HTMLElement {
    const d = this.ctx.save.data;
    const ctx = achContext(d);
    const total = ACHIEVEMENTS.length;
    const got = unlockedCount(d.achievements);
    const filters: ['all' | 'open' | 'locked', string][] = [['all', 'Tümü'], ['open', 'Açılanlar'], ['locked', 'Kilitliler']];
    const inCat = (x: AchievementDef) => this.achCat === 'all' || METRIC_CAT[x.metric] === this.achCat;
    const catCount = (c: AchCat) => ACHIEVEMENTS.filter((x) => c === 'all' || METRIC_CAT[x.metric] === c).length;
    const list = ACHIEVEMENTS.filter((x) => inCat(x) && (this.achFilter === 'all' || (this.achFilter === 'open') === x.id in d.achievements));
    // Within a family show tiers in order; nearly-finished locked ones first.
    list.sort((p, q) => {
      const pd = p.id in d.achievements;
      const qd = q.id in d.achievements;
      if (pd !== qd && this.achFilter === 'all') return pd ? 1 : -1;
      return pd ? p.group.localeCompare(q.group) || p.tier - q.tier : achievementProgress(q, ctx) - achievementProgress(p, ctx);
    });
    const cash = ACHIEVEMENTS.filter((x) => x.id in d.achievements).reduce((s, x) => s + x.reward.cash, 0);
    return h('div', { 'data-testid': 'ach-screen' },
      h('div', { class: 'ach-summary glass' },
        h('div', { class: 'ach-ring', style: `--p:${((got / total) * 100).toFixed(1)}` }, h('b', { 'data-testid': 'ach-count' }, `${got} / ${total}`), h('small', {}, 'başarım')),
        h('div', { class: 'ach-sum-main' },
          bar(got / total, 'thick'),
          h('div', { class: 'ach-sum-line' }, h('span', {}, `%${Math.round((got / total) * 100)} tamamlandı`), h('span', {}, `Kazanılan ödül: ${fmtMoney(cash)}`)),
        ),
      ),
      h('div', { class: 'prog-filters' },
        this.seg(filters, this.achFilter, (v) => (this.achFilter = v), 'ach-filter'),
        h('div', { class: 'chip-row', role: 'group', 'aria-label': 'Kategori' },
          (Object.keys(CAT_LABEL) as AchCat[]).map((c) => h('button', { class: `chip ${c === this.achCat ? 'sel' : ''}`, type: 'button', 'data-testid': `ach-cat-${c}`, 'data-nid': `ach-cat-${c}`, onclick: () => {
            this.achCat = c;
            this.redo();
          } }, `${CAT_LABEL[c]} · ${catCount(c)}`)),
        ),
      ),
      h('div', { class: 'ach-grid' },
        list.length === 0 ? h('div', { class: 'empty' }, icon('trophy', 28), h('b', {}, 'Bu filtrede başarım yok')) : null,
        list.map((x) => {
          const done = x.id in d.achievements;
          const prog = done ? 1 : achievementProgress(x, ctx);
          const v = Math.min(metricValue(x.metric, ctx), x.target);
          return h('div', { class: `ach ${done ? 'done' : ''}`, 'data-testid': `ach-${x.id}`, 'data-unlocked': done ? '1' : '0' },
            h('div', { class: 'ach-ico' }, icon(done ? METRIC_ICON[x.metric] : 'lock', 24)),
            h('div', { class: 'ach-main' },
              h('div', { class: 'ach-title' }, x.title, h('span', { class: 'ach-tier', title: `Kademe ${x.tier}` }, '★'.repeat(Math.min(5, x.tier)))),
              h('div', { class: 'ach-desc' }, x.description),
              bar(prog, done ? 'good thin' : 'thin'),
              h('div', { class: 'ach-foot' },
                h('span', {}, done ? 'Tamamlandı' : `${fmtAchValue(x.metric, v)} / ${fmtAchValue(x.metric, x.target)}`),
                h('span', { class: 'ach-reward' }, `${fmtMoney(x.reward.cash)}${x.reward.xp ? ` · ${x.reward.xp} XP` : ''}`),
              ),
            ),
          );
        }),
      ),
    );
  }

  // ───────────────────────────── statistics ─────────────────────────────
  private stats(): HTMLElement {
    const d = this.ctx.save.data;
    const scopes: ['lifetime' | 'bikes' | 'maps', string][] = [['lifetime', 'Genel'], ['bikes', 'Motorlar'], ['maps', 'Haritalar']];
    const STAT_ICON: Partial<Record<keyof StatBlock, string>> = { runs: 'play', distance: 'route', rideTime: 'clock', crashes: 'warn', nearMisses: 'bolt', overtakes: 'car', topSpeed: 'speed', longestWheelie: 'bike', wheelieDistance: 'bike', oppositeDistance: 'twoway', maxCombo: 'fire', bestScore: 'trophy', bestDistance: 'route', nightDistance: 'moon', rainDistance: 'rain', fogDistance: 'fog', snowDistance: 'snow', missionsCompleted: 'career' };
    const tiles = (b: StatBlock, keys: readonly (keyof StatBlock)[]) =>
      h('div', { class: 'stat-grid' }, keys.map((k) => statTile(fmtStat(k, b[k]), STAT_LABEL[k], STAT_ICON[k], `stats-${k}`)));
    let content: (HTMLElement | null)[];
    if (this.statsScope === 'lifetime') {
      content = [
        tiles(d.stats.lifetime, STAT_KEYS),
        h('div', { class: 'section-title' }, 'Kariyer ve ilerleme'),
        h('div', { class: 'stat-grid' },
          statTile(String(levelForXp(d.xp)), 'Seviye', 'bolt'),
          statTile(fmtInt(d.xp), 'Toplam XP', 'sparkle'),
          statTile(`${completedCount(d.career)} / 80`, 'Görev', 'career'),
          statTile(`${totalStars(d.career)} / ${MAX_STARS}`, 'Yıldız', 'star'),
          statTile(String(d.ownedBikes.length), 'Motosiklet', 'garage'),
          statTile(`${unlockedCount(d.achievements)}`, 'Başarım', 'trophy'),
        ),
        h('div', { class: 'section-title' }, 'En iyi skorlar (mod × harita)'),
        this.bestScoreTable(),
      ];
    } else if (this.statsScope === 'bikes') {
      const ids = Object.keys(d.stats.bikes).filter((id) => BIKE_BY_ID.has(id)).sort((x, y) => d.stats.bikes[y].distance - d.stats.bikes[x].distance);
      content = ids.length
        ? ids.map((id) => {
            const b = BIKE_BY_ID.get(id)!;
            return h('div', { class: 'stat-block', 'data-testid': `stats-bike-${id}` }, h('div', { class: 'section-title' }, `${b.brand} ${b.model}`), tiles(d.stats.bikes[id], ['runs', 'distance', 'rideTime', 'topSpeed', 'nearMisses', 'overtakes', 'crashes', 'bestScore']));
          })
        : [h('div', { class: 'empty' }, icon('bike', 28), h('b', {}, 'Henüz sürüş kaydı yok'), h('small', {}, 'Bir sürüş yap, motor bazlı istatistikler burada görünür.'))];
    } else {
      content = MAPS.map((m) => {
        const b = d.stats.maps[m.id];
        return h('div', { class: 'stat-block map', 'data-testid': `stats-map-${m.id}` },
          h('div', { class: 'stat-map-head' }, h('span', { class: 'sm-art' }, mapArt(m.id, m.defaultTime, m.defaultWeather)), h('b', {}, m.name), h('small', {}, `★ ${totalStars(d.career, m.id)}/30`)),
          b ? tiles(b, ['runs', 'distance', 'rideTime', 'topSpeed', 'nearMisses', 'overtakes', 'crashes', 'bestScore']) : h('div', { class: 'note' }, 'Bu haritada henüz sürmedin.'),
        );
      });
    }
    return h('div', { 'data-testid': 'stats-screen' }, this.seg(scopes, this.statsScope, (v) => (this.statsScope = v), 'stats-scope'), content);
  }

  private bestScoreTable(): HTMLElement {
    const lb = this.ctx.save.data.leaderboards;
    return h('div', { class: 'table-wrap glass' },
      h('table', { class: 'table', 'data-testid': 'stats-best-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Harita'), FREE_MODE_IDS.map((m) => h('th', {}, MODE_BY_ID.get(m)!.name)))),
        h('tbody', {}, MAPS.map((map) => h('tr', {}, h('td', {}, map.name), FREE_MODE_IDS.map((m) => h('td', {}, lb[boardKey(m, map.id)]?.[0] ? fmtInt(lb[boardKey(m, map.id)][0].score) : '—'))))),
      ),
    );
  }

  // ───────────────────────────── leaderboards ─────────────────────────────
  private leaderboards(): HTMLElement {
    const board = this.ctx.save.data.leaderboards[boardKey(this.lbMode, this.lbMap)] ?? [];
    const modes = FREE_MODE_IDS.map((m) => [m, MODE_BY_ID.get(m)!.name] as [FreeModeId, string]);
    const mapChips = h('div', { class: 'chip-row lb-maps', role: 'group', 'aria-label': 'Harita' },
      MAPS.map((m) => h('button', { class: `chip ${m.id === this.lbMap ? 'sel' : ''}`, type: 'button', 'data-testid': `lb-map-${m.id}`, 'data-nid': `lb-map-${m.id}`, onclick: () => {
        this.lbMap = m.id;
        this.redo();
      } }, m.name)),
    );
    const medal = (i: number) => (i < 3 ? h('span', { class: `medal m${i + 1}` }, String(i + 1)) : String(i + 1));
    return h('div', { 'data-testid': 'lb-screen' },
      this.seg(modes, this.lbMode, (v) => (this.lbMode = v), 'lb-mode'),
      mapChips,
      board.length
        ? h('div', { class: 'table-wrap glass' },
            h('table', { class: 'table lb', 'data-testid': 'lb-table' },
              h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Skor'), h('th', {}, 'Mesafe'), h('th', {}, 'Motor'), h('th', {}, 'Tarih'))),
              h('tbody', {}, board.map((e, i) => {
                const b = BIKE_BY_ID.get(e.bike);
                return h('tr', { class: i < 3 ? 'top' : '', 'data-testid': `lb-row-${i + 1}` },
                  h('td', {}, medal(i)),
                  h('td', {}, h('b', {}, fmtInt(e.score))),
                  h('td', {}, fmtKm(e.distance)),
                  h('td', {}, b ? b.model : e.bike),
                  h('td', {}, e.date ? new Date(e.date).toLocaleDateString('tr-TR') : '—'),
                );
              })),
            ),
          )
        : h('div', { class: 'empty', 'data-testid': 'lb-empty' }, icon('podium', 30), h('b', {}, 'Henüz skor yok'), h('small', {}, `${MODE_BY_ID.get(this.lbMode)!.name} · ${MAP_BY_ID.get(this.lbMap)!.name}: bir sürüş yap, ilk sırayı sen al.`)),
    );
  }

  // ───────────────────────────── daily reward ─────────────────────────────
  private daily(): HTMLElement {
    const { a, save } = this.ctx;
    const d = save.data;
    const st = dailyStatus(d.daily, new Date());
    const can = st.availability === 'available';
    const streakNow = can ? st.nextStreak - 1 : d.daily.streak;
    const msg = can
      ? `Bugünün ödülü hazır: ${fmtMoney(st.reward.cash)} + ${st.reward.xp} XP`
      : st.availability === 'claimed'
        ? 'Bugünün ödülünü aldın. Yarın tekrar gel!'
        : 'Cihaz saati son ödül tarihinin gerisinde görünüyor. Ödül, takvim o günü geçince açılır.';
    return h('div', { 'data-testid': 'daily-screen' },
      h('div', { class: 'daily-hero glass' },
        h('div', { class: 'daily-streak' }, icon('fire', 28), h('b', { 'data-testid': 'daily-streak' }, `${streakNow} gün`), h('small', {}, 'üst üste seri')),
        h('div', { class: 'daily-msg', 'data-testid': 'daily-status' }, msg),
        btn(can ? 'ÖDÜLÜ AL' : 'ALINDI', () => {
          if (can) a.claimDaily();
        }, `primary big ${can ? '' : 'disabled'}`, 'daily-claim', 'gift'),
      ),
      h('div', { class: 'daily-ladder' },
        DAILY_REWARDS.map((r, i) => {
          const dayNo = i + 1;
          const isNext = can && i === st.ladderIndex;
          const done = i < Math.min(streakNow, DAILY_REWARDS.length) && !(can && i >= st.ladderIndex);
          return h('div', { class: `day ${isNext ? 'next' : ''} ${done ? 'done' : ''}`, 'data-testid': `daily-day-${dayNo}` },
            h('small', {}, `${dayNo}. GÜN${dayNo === DAILY_REWARDS.length ? '+' : ''}`),
            icon(done ? 'check' : dayNo === DAILY_REWARDS.length ? 'trophy' : 'gift', 22),
            h('b', {}, fmtMoney(r.cash)),
            h('em', {}, `${r.xp} XP`),
          );
        }),
      ),
      h('div', { class: 'muted daily-note' }, 'Her gün ödülü al: seri büyüdükçe ödül artar. Bir gün kaçırırsan seri 1. günden başlar.'),
    );
  }
}
