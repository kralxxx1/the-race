import { BIKE_BY_ID } from '../data/bikes';
import { CAREER_MAPS, MISSION_BY_ID, TRAFFIC_LEVELS, missionsForMap, type MissionDef } from '../data/career';
import { MAPS, MAP_BY_ID, TIME_LABELS, WEATHER_LABELS, type MapId, type TimeOfDay, type Weather } from '../data/maps';
import { MAX_STARS, currentMission, isCareerMapUnlocked, isMissionUnlocked, missionRecord, totalStars } from '../game/careerProgress';
import { formatMetric, metricLabel, objectiveText, secondaryText, starRuleText } from '../game/missions';
import { btn, header, type UiCtx } from './ctx';
import { fmtInt, fmtMoney, h, rerender } from './dom';
import { icon } from './icons';
import { mapArt } from './mapArt';
import { bar, chipEl, starsEl } from './widgets';
import './career.css';

export { starString, levelBar } from './widgets';

const TIME_ICON: Record<TimeOfDay, string> = { dawn: 'dawn', day: 'sun', sunset: 'sunset', night: 'moon' };
const WEATHER_ICON: Record<Weather, string> = { clear: 'clear', cloudy: 'cloud', rain: 'rain', fog: 'fog', snow: 'snow' };
const OBJ_ICON: Record<string, string> = { distance: 'route', score: 'trophy', time: 'timer', speed: 'speed', nearMiss: 'bolt', overtake: 'car', wheelie: 'bike', combo: 'fire', checkpoint: 'target', opposite: 'twoway', survive: 'clock' };

/** Row height of the mission path in px. */
export const PATH_ROW = 92;

/**
 * Positions (percent of the path width, px from the top) of `n` mission nodes on a winding path:
 * a gentle sine so the road snakes down the page. Exported for the unit tests.
 */
export function pathPositions(n: number, rowHeight = PATH_ROW): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) out.push({ x: 50 + Math.sin(i * 1.15 + 0.4) * 30, y: rowHeight * 0.5 + i * rowHeight });
  return out;
}

/** SVG path data (viewBox 0..100 wide) through the node centres as a smooth curve. */
export function pathData(pts: readonly { x: number; y: number }[]): string {
  if (!pts.length) return '';
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const my = (a.y + b.y) / 2;
    d += ` C ${a.x.toFixed(2)} ${my.toFixed(1)} ${b.x.toFixed(2)} ${my.toFixed(1)} ${b.x.toFixed(2)} ${b.y.toFixed(1)}`;
  }
  return d;
}

/** Career: map tabs with art, a winding mission path with stars and locks, and the mission briefing. */
export class CareerScreen {
  mapSel: MapId;
  missionSel: string | null = null;
  private host: HTMLElement | null = null;

  constructor(private ctx: UiCtx) {
    const cur = currentMission(ctx.save.data.career);
    this.mapSel = cur?.map ?? MAPS[0].id;
    this.missionSel = cur?.id ?? null;
  }

  /** Jump to the next mission to play (called when the screen is opened). */
  focusCurrent(): void {
    const cur = currentMission(this.ctx.save.data.career);
    if (cur) {
      this.mapSel = cur.map;
      this.missionSel = cur.id;
    }
  }

  render(host: HTMLElement): void {
    this.host = host;
    this.build(host);
    // Bring the selected node into view on open.
    requestAnimationFrame(() => host.querySelector('.cnode.sel')?.scrollIntoView({ block: 'center', behavior: 'auto' }));
  }

  private redo(): void {
    if (this.host) rerender(this.host, () => this.build(this.host as HTMLElement));
  }

  private build(host: HTMLElement): void {
    const { save, a } = this.ctx;
    const career = save.data.career;
    const map = MAP_BY_ID.get(this.mapSel) ?? MAPS[0];
    const list = missionsForMap(map.id);
    if (!this.missionSel || !list.some((x) => x.id === this.missionSel)) {
      this.missionSel = (list.find((x) => isMissionUnlocked(career, x.id) && missionRecord(career, x.id).completions === 0) ?? list[0]).id;
    }
    const sel = MISSION_BY_ID.get(this.missionSel) as MissionDef;
    const mapStars = totalStars(career, map.id);
    const mapOpen = isCareerMapUnlocked(career, map.id);

    const tabs = h('div', { class: 'career-tabs', 'data-tabs': '', role: 'tablist', 'aria-label': 'Haritalar' },
      CAREER_MAPS.map((m) => {
        const open = isCareerMapUnlocked(career, m.id);
        const st = totalStars(career, m.id);
        return h('button', { class: `ctab ${m.id === this.mapSel ? 'sel' : ''} ${open ? '' : 'locked'}`, type: 'button', role: 'tab', 'aria-selected': m.id === this.mapSel ? 'true' : 'false', 'data-testid': `career-map-${m.id}`, 'data-nid': `cmap-${m.id}`, onclick: () => {
          this.mapSel = m.id;
          this.missionSel = null;
          this.redo();
          host.querySelector('.career-path-wrap')?.scrollTo({ top: 0 });
        } },
          h('span', { class: 'ctab-art' }, mapArt(m.id, m.defaultTime, m.defaultWeather), open ? null : h('span', { class: 'lock-veil' }, icon('lock', 18))),
          h('span', { class: 'ctab-txt' }, h('b', {}, m.name), h('small', {}, `★ ${st}/30`)),
        );
      }),
    );

    host.append(
      header(this.ctx, { title: 'KARİYER', icon: 'career', backTestid: 'career-back', right: [h('div', { class: 'cash', 'data-testid': 'career-stars' }, icon('starFill', 16), `${totalStars(career)}/${MAX_STARS}`)] }),
      h('div', { class: 'body career-body', 'data-testid': 'career-screen' },
        h('div', { class: 'career-left' },
          tabs,
          h('div', { class: 'career-hero' },
            h('div', { class: 'career-hero-art' }, mapArt(map.id, map.defaultTime, map.defaultWeather)),
            h('div', { class: 'career-hero-txt' },
              h('b', {}, map.name),
              h('small', {}, map.region),
              h('div', { class: 'career-hero-prog' }, bar(mapStars / 30, 'thin'), h('span', {}, `★ ${mapStars}/30 · ${list.filter((x) => missionRecord(career, x.id).completions > 0).length}/${list.length} görev`)),
              mapOpen ? null : h('span', { class: 'badge gold' }, icon('lock', 12), 'Önceki haritayı bitir'),
            ),
          ),
          h('div', { class: 'scroll career-path-wrap', 'data-keep': 'career-path' }, this.path(list)),
        ),
        this.detail(sel, a),
        this.quickBar(sel),
      ),
    );
    this.ctx.nav.shortcuts.start = () => {
      const open = isMissionUnlocked(career, sel.id);
      const bike = BIKE_BY_ID.get(save.data.selectedBike);
      if (open && bike && bike.topSpeed >= sel.minTopSpeed) a.startMission(sel.id);
    };
  }

  // ───────────────────────────── path ─────────────────────────────
  private path(list: readonly MissionDef[]): HTMLElement {
    const { save } = this.ctx;
    const career = save.data.career;
    const pts = pathPositions(list.length);
    const doneCount = list.filter((m) => missionRecord(career, m.id).completions > 0).length;
    const frac = list.length > 1 ? Math.min(1, doneCount / (list.length - 1)) : 0;
    const height = list.length * PATH_ROW;
    const svg = `<svg class="cpath-svg" viewBox="0 0 100 ${height}" preserveAspectRatio="none" aria-hidden="true"><path class="rail" d="${pathData(pts)}" pathLength="1"/><path class="rail dash" d="${pathData(pts)}" pathLength="1"/><path class="rail done" d="${pathData(pts)}" pathLength="1" stroke-dasharray="${frac.toFixed(4)} 1"/></svg>`;
    const wrap = h('div', { class: 'cpath', style: `height:${height}px`, 'data-testid': 'mission-list' });
    wrap.innerHTML = svg;
    list.forEach((def, i) => {
      const rec = missionRecord(career, def.id);
      const open = isMissionUnlocked(career, def.id);
      const done = rec.completions > 0;
      const cur = open && !done;
      const p = pts[i];
      const right = p.x < 50;
      wrap.append(
        h('button', { class: `cnode ${def.id === this.missionSel ? 'sel' : ''} ${open ? 'open' : 'locked'} ${done ? 'done' : ''} ${cur ? 'current' : ''} ${right ? 'lab-right' : 'lab-left'}`, type: 'button', style: `left:${p.x}%;top:${p.y}px`, 'data-testid': `mission-${def.id}`, 'data-nid': `mission-${def.id}`, 'aria-label': `Görev ${def.number}: ${def.title}`, onclick: () => {
          this.missionSel = def.id;
          this.redo();
        } },
          h('span', { class: 'cnode-disc' }, open ? h('b', {}, String(def.number)) : icon('lock', 18)),
          h('span', { class: 'cnode-stars' }, starsEl(rec.stars, 3, undefined, 13)),
          h('span', { class: 'cnode-label' }, h('b', {}, def.title), h('small', {}, open ? objectiveText(def) : 'Kilitli')),
        ),
      );
    });
    return wrap;
  }

  /** Phones: the selected mission with its start button stays pinned to the bottom of the screen. */
  private quickBar(def: MissionDef): HTMLElement {
    const { save, a } = this.ctx;
    const open = isMissionUnlocked(save.data.career, def.id);
    const bike = BIKE_BY_ID.get(save.data.selectedBike);
    const ok = !bike || bike.topSpeed >= def.minTopSpeed;
    const rec = missionRecord(save.data.career, def.id);
    return h('div', { class: 'career-bar' },
      h('div', { class: 'cb-txt' }, h('small', {}, `GÖREV ${def.number}`), h('b', {}, def.title)),
      starsEl(rec.stars, 3, undefined, 14),
      !open
        ? h('span', { class: 'badge' }, icon('lock', 12), 'Kilitli')
        : ok
          ? btn(['BAŞLA', icon('right', 16)], () => a.startMission(def.id), 'primary', 'mission-start-bar')
          : btn('GARAJ', () => a.openGarage(), '', 'mission-garage-bar', 'garage'),
    );
  }

  // ───────────────────────────── detail ─────────────────────────────
  private detail(def: MissionDef, a: UiCtx['a']): HTMLElement {
    const d = this.ctx.save.data;
    const rec = missionRecord(d.career, def.id);
    const open = isMissionUnlocked(d.career, def.id);
    const map = MAP_BY_ID.get(def.map) ?? MAPS[0];
    const bike = BIKE_BY_ID.get(d.selectedBike);
    const bikeOk = !bike || bike.topSpeed >= def.minTopSpeed;
    const hints = d.settings['play.missionHints'] !== false;
    const unlock = def.rewards.unlockBike ? BIKE_BY_ID.get(def.rewards.unlockBike) : undefined;

    let action: HTMLElement;
    if (!open) action = h('div', { class: 'note', 'data-testid': 'mission-locked' }, icon('lock', 14), ` Önce Görev ${def.number - 1}’i tamamla.`);
    else if (!bikeOk) {
      action = h('div', { class: 'cd-actions' },
        h('div', { class: 'note warn', 'data-testid': 'mission-bike-warning' }, `Bu görev için azami hızı en az ${def.minTopSpeed} km/s olan bir motor seç. (${bike?.model}: ${bike?.topSpeed} km/s)`),
        btn('GARAJA GİT', () => a.openGarage(), '', 'mission-garage', 'garage'),
      );
    } else action = btn([rec.completions > 0 ? 'TEKRAR OYNA' : 'GÖREVE BAŞLA', icon('right', 18)], () => a.startMission(def.id), 'primary big', 'mission-start');

    const stat = (ico: string, label: string, value: string | Node, cls = '') => h('div', { class: `cd-row ${cls}` }, h('span', { class: 'cd-ico' }, icon(ico, 16)), h('span', { class: 'cd-label' }, label), h('b', {}, value));
    const rule = (n: number, text: string) => h('div', { class: `star-rule ${rec.stars >= n ? 'got' : ''}` }, starsEl(n, 3, undefined, 12), h('span', {}, text));

    return h('aside', { class: 'career-detail glass scroll', 'data-testid': 'mission-detail', 'data-keep': 'career-detail' },
      h('div', { class: 'cd-art' }, mapArt(def.map, def.time, def.weather), h('span', { class: 'cd-no' }, `GÖREV ${def.number}`)),
      h('div', { class: 'cd-head' },
        h('div', {}, h('div', { class: 'card-sub' }, `${map.name} · ${map.region}`), h('div', { class: 'cd-title', 'data-testid': 'mission-detail-title' }, def.title)),
        starsEl(rec.stars, 3, 'mission-detail-stars', 22),
      ),
      h('p', { class: 'cd-brief' }, def.briefing),
      h('div', { class: 'chip-row' },
        chipEl(TIME_LABELS[def.time], TIME_ICON[def.time]),
        chipEl(WEATHER_LABELS[def.weather], WEATHER_ICON[def.weather]),
        chipEl(def.layout === 'twoway' ? 'Çift yön' : 'Tek yön', def.layout === 'twoway' ? 'twoway' : 'road'),
        chipEl(`${TRAFFIC_LEVELS[def.traffic.level].label} trafik`, 'car'),
      ),
      h('div', { class: 'section-title' }, 'Hedefler'),
      stat(OBJ_ICON[def.objective.type] ?? 'target', 'Ana hedef', h('span', { 'data-testid': 'mission-detail-objective' }, objectiveText(def))),
      def.secondary ? stat('star', 'Bonus hedef', `${secondaryText(def.secondary)}${rec.secondary ? ' ✓' : ''}`, rec.secondary ? 'ok' : '') : null,
      h('div', { class: 'star-rules' },
        rule(1, 'Görevi tamamla'),
        rule(2, starRuleText(def.stars, 2)),
        rule(3, starRuleText(def.stars, 3)),
      ),
      rec.best !== null ? stat('trophy', `En iyi ${metricLabel(def.stars.metric).toLocaleLowerCase('tr-TR')}`, formatMetric(def.stars.metric, rec.best)) : null,
      h('div', { class: 'section-title' }, 'Ödüller'),
      h('div', { class: 'reward-row' },
        h('div', { class: 'reward' }, icon('coin', 20), h('b', {}, fmtMoney(def.rewards.cash)), h('small', {}, 'Para')),
        h('div', { class: 'reward' }, icon('bolt', 20), h('b', {}, `${fmtInt(def.rewards.xp)} XP`), h('small', {}, 'Deneyim')),
        rec.completions === 0 ? h('div', { class: 'reward gold' }, icon('gift', 20), h('b', {}, `+${fmtMoney(def.rewards.firstClearBonus)}`), h('small', {}, 'İlk tamamlama')) : null,
        def.rewards.secondaryCash ? h('div', { class: 'reward' }, icon('star', 20), h('b', {}, `+${fmtMoney(def.rewards.secondaryCash)}`), h('small', {}, 'Bonus hedef')) : null,
        unlock ? h('div', { class: 'reward gold' }, icon('bike', 20), h('b', {}, unlock.model), h('small', {}, 'Yeni motor')) : null,
      ),
      stat('bike', 'Gerekli motor', `Azami hız ≥ ${def.minTopSpeed} km/s ${bikeOk ? '✓' : '✗'}`, bikeOk ? 'ok' : 'bad'),
      hints ? h('div', { class: 'cd-hint', 'data-testid': 'mission-hint' }, icon('tip', 14), `İpucu: ${def.hint}`) : null,
      rec.attempts > 0 ? h('div', { class: 'muted cd-attempts' }, `Deneme: ${rec.attempts} · Tamamlama: ${rec.completions}`) : null,
      h('div', { class: 'cd-footer' }, action),
    );
  }
}
