import { BIKE_BY_ID } from '../data/bikes';
import { MISSION_BY_ID, TRAFFIC_LEVELS, missionsForMap, type MissionDef } from '../data/career';
import { MAPS, MAP_BY_ID, TIME_LABELS, WEATHER_LABELS, type MapId } from '../data/maps';
import { MAX_STARS, currentMission, isCareerMapUnlocked, isMissionUnlocked, missionRecord, totalStars } from '../game/careerProgress';
import { failReasonText, fmtKm, formatMetric, metricLabel, objectiveText, secondaryText, starRuleText } from '../game/missions';
import { levelProgress } from '../game/progression';
import type { RunOutcome } from '../game/progress';
import type { SaveManager } from '../storage/save';
import { clear, fmtInt, fmtMoney, h } from './dom';
import './gameplay.css';

/**
 * Career screens: the map/mission browser and the mission result card.
 * Functional and minimal by design; styling lives in gameplay.css.
 */

export interface CareerActions {
  back(): void;
  startMission(id: string): void;
  openGarage(): void;
  click(): void;
}

export function starString(n: number, of = 3): string {
  return '★'.repeat(Math.max(0, Math.min(of, n))) + '☆'.repeat(Math.max(0, of - Math.max(0, n)));
}

function stars(n: number, testid?: string): HTMLElement {
  return h('span', { class: 'gp-stars', 'data-testid': testid, 'aria-label': `${n} yıldız` }, starString(n));
}

/** "Level 7" badge + XP bar used in the menu header and result screens. */
export function levelBar(xp: number, testid = 'rider-level'): HTMLElement {
  const lp = levelProgress(xp);
  return h('div', { class: 'gp-level', 'data-testid': testid },
    h('div', { class: 'gp-level-badge' }, h('small', {}, 'SEVİYE'), h('b', { 'data-testid': `${testid}-value` }, String(lp.level))),
    h('div', { class: 'gp-level-body' },
      h('div', { class: 'gp-bar' }, h('div', { class: 'gp-bar-fill', style: `width:${(lp.fraction * 100).toFixed(1)}%` })),
      h('div', { class: 'gp-level-xp' }, lp.max ? `${fmtInt(xp)} XP · azami seviye` : `${fmtInt(lp.into)} / ${fmtInt(lp.span)} XP`),
    ),
  );
}

export class CareerScreen {
  mapSel: MapId;
  missionSel: string | null = null;

  constructor(private save: SaveManager) {
    const cur = currentMission(save.data.career);
    this.mapSel = cur?.map ?? MAPS[MAPS.length - 1].id;
    this.missionSel = cur?.id ?? null;
  }

  /** Jump to the next mission to play (called when the screen is opened). */
  focusCurrent(): void {
    const cur = currentMission(this.save.data.career);
    if (cur) {
      this.mapSel = cur.map;
      this.missionSel = cur.id;
    }
  }

  render(p: HTMLElement, a: CareerActions, rerender: () => void): void {
    clear(p);
    const d = this.save.data;
    const career = d.career;
    const tabs = h('div', { class: 'tabs gp-map-tabs', role: 'tablist' },
      MAPS.map((m) => {
        const open = isCareerMapUnlocked(career, m.id);
        return h('button', {
          class: `${m.id === this.mapSel ? 'sel' : ''} ${open ? '' : 'locked'}`,
          'data-testid': `career-map-${m.id}`,
          'aria-disabled': open ? undefined : 'true',
          onclick: () => {
            a.click();
            this.mapSel = m.id;
            this.missionSel = null;
            rerender();
          },
        }, `${open ? '' : '🔒 '}${m.name} · ★${totalStars(career, m.id)}`);
      }),
    );
    const list = missionsForMap(this.mapSel);
    if (!this.missionSel || !list.some((x) => x.id === this.missionSel)) {
      this.missionSel = (list.find((x) => isMissionUnlocked(career, x.id) && missionRecord(career, x.id).completions === 0) ?? list[0]).id;
    }
    const rows = list.map((def) => {
      const rec = missionRecord(career, def.id);
      const open = isMissionUnlocked(career, def.id);
      return h('button', {
        class: `gp-mrow ${def.id === this.missionSel ? 'sel' : ''} ${open ? '' : 'locked'} ${rec.completions > 0 ? 'done' : ''}`,
        'data-testid': `mission-${def.id}`,
        onclick: () => {
          a.click();
          this.missionSel = def.id;
          rerender();
        },
      },
        h('span', { class: 'gp-mrow-num' }, String(def.number)),
        h('span', { class: 'gp-mrow-main' }, h('b', {}, open ? def.title : `🔒 ${def.title}`), h('small', {}, objectiveText(def))),
        stars(rec.stars),
      );
    });
    const sel = MISSION_BY_ID.get(this.missionSel)!;
    p.append(
      h('div', { class: 'header' },
        h('button', { class: 'btn ghost', 'data-testid': 'career-back', onclick: () => { a.click(); a.back(); } }, '‹ GERİ'),
        h('div', { class: 'title' }, 'KARİYER'),
        h('div', { class: 'cash', 'data-testid': 'career-stars' }, `★ ${totalStars(career)}/${MAX_STARS}`),
      ),
      h('div', { class: 'scroll gp-career', 'data-testid': 'career-screen' },
        tabs,
        h('div', { class: 'gp-career-body' },
          h('div', { class: 'gp-mlist', 'data-testid': 'mission-list' }, rows),
          this.detail(sel, a),
        ),
      ),
    );
  }

  private detail(def: MissionDef, a: CareerActions): HTMLElement {
    const d = this.save.data;
    const rec = missionRecord(d.career, def.id);
    const open = isMissionUnlocked(d.career, def.id);
    const map = MAP_BY_ID.get(def.map)!;
    const bike = BIKE_BY_ID.get(d.selectedBike)!;
    const bikeOk = bike.topSpeed >= def.minTopSpeed;
    const hints = d.settings['play.missionHints'] !== false;
    const unlock = def.rewards.unlockBike ? BIKE_BY_ID.get(def.rewards.unlockBike) : undefined;
    const chip = (t: string) => h('span', { class: 'gp-chip' }, t);
    let action: HTMLElement;
    if (!open) action = h('div', { class: 'gp-note', 'data-testid': 'mission-locked' }, `🔒 Önce Görev ${def.number - 1}’i tamamla.`);
    else if (!bikeOk) {
      action = h('div', { class: 'gp-actions' },
        h('div', { class: 'gp-note warn', 'data-testid': 'mission-bike-warning' }, `Bu görev için azami hızı en az ${def.minTopSpeed} km/s olan bir motor seç. (${bike.model}: ${bike.topSpeed} km/s)`),
        h('button', { class: 'btn', 'data-testid': 'mission-garage', onclick: () => { a.click(); a.openGarage(); } }, 'GARAJA GİT'),
      );
    } else {
      action = h('button', { class: 'btn primary big', 'data-testid': 'mission-start', onclick: () => { a.click(); a.startMission(def.id); } }, rec.completions > 0 ? 'TEKRAR OYNA ›' : 'GÖREVE BAŞLA ›');
    }
    return h('div', { class: 'gp-mdetail card', 'data-testid': 'mission-detail' },
      h('div', { class: 'gp-mdetail-head' },
        h('div', {}, h('div', { class: 'card-sub' }, `GÖREV ${def.number} · ${map.name}`), h('div', { class: 'card-title', 'data-testid': 'mission-detail-title' }, def.title)),
        stars(rec.stars, 'mission-detail-stars'),
      ),
      h('div', { class: 'card-desc' }, def.briefing),
      h('div', { class: 'gp-chips' },
        chip(TIME_LABELS[def.time]),
        chip(WEATHER_LABELS[def.weather]),
        chip(def.layout === 'twoway' ? 'Çift yön' : 'Tek yön'),
        chip(`${TRAFFIC_LEVELS[def.traffic.level].label} trafik`),
      ),
      h('div', { class: 'gp-kv' }, h('span', {}, 'Hedef'), h('b', { 'data-testid': 'mission-detail-objective' }, objectiveText(def))),
      def.secondary ? h('div', { class: 'gp-kv' }, h('span', {}, 'Bonus hedef'), h('b', {}, `${secondaryText(def.secondary)}${rec.secondary ? ' ✓' : ''}`)) : null,
      h('div', { class: 'gp-kv' }, h('span', {}, 'Yıldızlar'),
        h('div', { class: 'gp-starrules' },
          h('div', {}, '★ Görevi tamamla'),
          h('div', {}, `★★ ${starRuleText(def.stars, 2)}`),
          h('div', {}, `★★★ ${starRuleText(def.stars, 3)}`),
          rec.best !== null ? h('div', { class: 'gp-best' }, `En iyi: ${metricLabel(def.stars.metric)} ${formatMetric(def.stars.metric, rec.best)}`) : null,
        ),
      ),
      h('div', { class: 'gp-kv' }, h('span', {}, 'Ödül'),
        h('b', {}, `${fmtMoney(def.rewards.cash)} · ${def.rewards.xp} XP`,
          rec.completions === 0 ? ` · ilk kez +${fmtMoney(def.rewards.firstClearBonus)}` : '',
          def.rewards.secondaryCash ? ` · bonus +${fmtMoney(def.rewards.secondaryCash)}` : ''),
      ),
      unlock ? h('div', { class: 'gp-kv' }, h('span', {}, 'Motor kilidi'), h('b', {}, `${unlock.brand} ${unlock.model}`)) : null,
      h('div', { class: 'gp-kv' }, h('span', {}, 'Gerekli motor'), h('b', { class: bikeOk ? 'ok' : 'bad' }, `Azami hız ≥ ${def.minTopSpeed} km/s ${bikeOk ? '✓' : '✗'}`)),
      hints ? h('div', { class: 'gp-hint', 'data-testid': 'mission-hint' }, `İpucu: ${def.hint}`) : null,
      rec.attempts > 0 ? h('div', { class: 'gp-best' }, `Deneme: ${rec.attempts} · Tamamlama: ${rec.completions}`) : null,
      action,
    );
  }
}

export interface ResultActions {
  next(id: string): void;
  retry(): void;
  career(): void;
  menu(): void;
  click(): void;
}

/** Result card of a finished mission (complete or failed). */
export function renderMissionResult(p: HTMLElement, o: RunOutcome, a: ResultActions): void {
  clear(p);
  const m = o.mission!;
  const ok = m.result.status === 'complete';
  const def = m.def;
  const unlock = m.unlockedBike ? BIKE_BY_ID.get(m.unlockedBike) : undefined;
  const nextDef = m.nextMissionId ? MISSION_BY_ID.get(m.nextMissionId) : undefined;
  const btn = (label: string, fn: () => void, cls: string, testid: string) =>
    h('button', { class: `btn ${cls}`, 'data-testid': testid, onclick: () => { a.click(); fn(); } }, label);
  const lines = (title: string, ls: { label: string; amount: number }[], fmt: (n: number) => string) =>
    ls.length ? h('div', { class: 'gp-lines' }, h('div', { class: 'section-title' }, title), ls.map((l) => h('div', { class: 'gp-line' }, h('span', {}, l.label), h('b', {}, `+${fmt(l.amount)}`)))) : null;
  p.append(
    h('div', { class: 'modal wide', 'data-testid': 'mission-result' },
      h('div', { class: 'card-sub', style: 'text-align:center' }, `GÖREV ${def.number} · ${def.title}`),
      h('div', { class: `title ${ok ? '' : 'red'}`, 'data-testid': 'mission-result-title' }, ok ? 'GÖREV TAMAMLANDI' : 'GÖREV BAŞARISIZ'),
      ok
        ? h('div', { class: 'gp-result-stars', 'data-testid': 'mission-stars', 'data-stars': String(m.result.stars) }, starString(m.result.stars))
        : h('div', { class: 'sub', 'data-testid': 'mission-fail-reason' }, `${failReasonText(m.result.failReason ?? 'quit')} · ilerleme %${Math.floor(m.result.progress * 100)}`),
      ok ? h('div', { class: 'sub' }, `${metricLabel(def.stars.metric)}: ${formatMetric(def.stars.metric, m.result.metricValue)} · ★★ ${starRuleText(def.stars, 2)} · ★★★ ${starRuleText(def.stars, 3)}`) : null,
      ok && m.newStars > 0 && m.bestStars === m.result.stars ? h('div', { class: 'record' }, m.firstClear ? 'İLK TAMAMLAMA!' : 'YENİ YILDIZ REKORU!') : null,
      h('div', { class: 'gp-result-grid' },
        lines('Para', o.cashLines, fmtMoney),
        lines('Deneyim', o.xpLines, (n) => `${fmtInt(n)} XP`),
      ),
      h('div', { class: 'earned', 'data-testid': 'mission-cash' }, `+${fmtMoney(o.cash)}  ·  +${fmtInt(o.xp)} XP`),
      levelBar(o.xpAfter, 'result-level'),
      o.levelAfter > o.levelBefore ? h('div', { class: 'record', 'data-testid': 'level-up' }, `SEVİYE ATLADIN! → ${o.levelAfter}`) : null,
      unlock ? h('div', { class: 'gp-note ok' }, `Yeni motor satın alınabilir: ${unlock.brand} ${unlock.model}`) : null,
      o.achievements.length ? h('div', { class: 'gp-note ok', 'data-testid': 'result-achievements' }, `Başarım: ${o.achievements.map((x) => x.title).join(', ')}`) : null,
      ok && def.secondary ? h('div', { class: 'gp-best' }, `Bonus hedef (${secondaryText(def.secondary)}): ${m.result.secondaryMet ? 'tamamlandı ✓' : 'tamamlanmadı'}`) : null,
      h('div', { class: 'go-buttons' },
        ok && nextDef && m.nextUnlocked
          ? btn('SONRAKİ GÖREV ›', () => a.next(nextDef.id), 'primary', 'btn-next-mission')
          : btn('TEKRAR DENE', () => a.retry(), 'primary', 'btn-retry-mission'),
        ok && nextDef && m.nextUnlocked ? btn('TEKRAR DENE', () => a.retry(), '', 'btn-retry-mission') : btn('KARİYER', () => a.career(), '', 'btn-career'),
        btn('ANA MENÜ', () => a.menu(), 'ghost', 'btn-menu'),
      ),
      ok && nextDef && m.nextUnlocked ? h('div', { class: 'gp-best', style: 'text-align:center' }, `Sıradaki: Görev ${nextDef.number} · ${nextDef.title} — ${objectiveText(nextDef)}`) : null,
      !ok ? h('div', { class: 'gp-best', style: 'text-align:center' }, `Hedef: ${objectiveText(def)} · ${fmtKm(m.result.distance)} sürdün`) : null,
    ),
  );
}
