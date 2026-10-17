import { BIKE_BY_ID } from '../data/bikes';
import { MISSION_BY_ID } from '../data/career';
import { MAP_BY_ID } from '../data/maps';
import type { ModeId } from '../data/modes';
import { fmtKm, failReasonText, formatMetric, metricLabel, objectiveText, secondaryText, starRuleText } from '../game/missions';
import type { RunOutcome } from '../game/progress';
import { levelProgress } from '../game/progression';
import type { RunStats } from '../game/scoring';
import { btn, type UiCtx } from './ctx';
import { fmtDistance, fmtInt, fmtMoney, h } from './dom';
import { icon } from './icons';
import { mapArt } from './mapArt';
import { bar, countUp, levelBar, reducedMotion, starsEl } from './widgets';
import './results.css';

/** Animate the level bar from `before` to `after` XP, rolling through level-ups. */
function animateXp(root: HTMLElement, before: number, after: number, onLevelUp: (lvl: number) => void): void {
  const fill = root.querySelector<HTMLElement>('.bar > i');
  const badge = root.querySelector<HTMLElement>('.level-badge b');
  const text = root.querySelector<HTMLElement>('.level-xp');
  if (!fill || !badge) return;
  const b = levelProgress(before);
  const a = levelProgress(after);
  const set = (frac: number, instant: boolean) => {
    fill.style.transition = instant ? 'none' : '';
    fill.style.width = `${(frac * 100).toFixed(1)}%`;
    if (instant) void fill.offsetWidth;
  };
  const finish = () => {
    badge.textContent = String(a.level);
    set(a.fraction, true);
    if (text) text.textContent = a.max ? `${fmtInt(after)} XP · azami seviye` : `${fmtInt(a.into)} / ${fmtInt(a.span)} XP`;
  };
  if (reducedMotion() || b.level === a.level && a.fraction <= b.fraction) {
    finish();
    return;
  }
  badge.textContent = String(b.level);
  set(b.fraction, true);
  let level = b.level;
  const step = () => {
    if (!root.isConnected) return;
    if (level < a.level) {
      set(1, false);
      window.setTimeout(() => {
        level++;
        badge.textContent = String(level);
        root.classList.add('levelup');
        onLevelUp(level);
        set(0, true);
        window.setTimeout(() => root.classList.remove('levelup'), 700);
        window.setTimeout(step, 150);
      }, 650);
    } else {
      window.setTimeout(finish, 20);
      window.setTimeout(() => set(a.fraction, false), 40);
    }
  };
  window.setTimeout(step, 700);
}

/** Result cards: free-run summary and career mission result, with counters, stars and XP animation. */
export class ResultScreens {
  constructor(private ctx: UiCtx) {}

  private rewards(out: RunOutcome): HTMLElement {
    const lines = (title: string, ls: { label: string; amount: number }[], fmt: (n: number) => string, ico: string) =>
      ls.length
        ? h('div', { class: 'gp-lines' },
            h('div', { class: 'section-title' }, icon(ico, 14), title),
            ls.map((l, i) => {
              const v = h('b', {}, '');
              void countUp(v, l.amount, (n) => `+${fmt(n)}`, 700, 250 + i * 120, reducedMotion());
              return h('div', { class: 'gp-line' }, h('span', {}, l.label), v);
            }),
          )
        : null;
    return h('div', { class: 'gp-result-grid' }, lines('Para', out.cashLines, fmtMoney, 'coin'), lines('Deneyim', out.xpLines, (n) => `${fmtInt(n)} XP`, 'bolt'));
  }

  private achievements(out: RunOutcome): HTMLElement | null {
    if (!out.achievements.length) return null;
    return h('div', { class: 'ach-list', 'data-testid': 'result-achievements' },
      h('div', { class: 'section-title' }, icon('trophy', 14), 'Yeni başarımlar'),
      out.achievements.map((x, i) =>
        h('div', { class: 'ach-toast', style: `animation-delay:${0.8 + i * 0.15}s` }, icon('trophy', 22), h('span', {}, h('b', {}, x.title), h('small', {}, x.description)), h('em', {}, `+${fmtMoney(x.reward.cash)}`)),
      ),
    );
  }

  private levelBlock(out: RunOutcome): HTMLElement {
    const el = levelBar(out.xpBefore, 'result-level');
    const up = h('div', { class: 'record level-up-banner', 'data-testid': 'level-up', style: 'display:none' }, '');
    const wrap = h('div', { class: 'result-level' }, el, up);
    window.setTimeout(() => {
      animateXp(el, out.xpBefore, out.xpAfter, (lvl) => {
        up.style.display = '';
        up.textContent = `SEVİYE ATLADIN! → ${lvl}`;
      });
    }, 0);
    // Without animation the banner still has to appear for a level-up.
    if (out.levelAfter > out.levelBefore) {
      up.style.display = '';
      up.textContent = `SEVİYE ATLADIN! → ${out.levelAfter}`;
    } else up.remove();
    return wrap;
  }

  renderRun(host: HTMLElement, reason: 'crash' | 'timeUp' | 'quit', stats: RunStats, out: RunOutcome, mode: ModeId): void {
    const { save, a } = this.ctx;
    const d = save.data;
    const title = reason === 'crash' ? 'KAZA!' : reason === 'timeUp' ? 'SÜRE DOLDU' : 'SÜRÜŞ BİTTİ';
    const mph = d.settings['hud.units'] === 'mph';
    const instant = reducedMotion();
    const score = h('div', { class: 'go-score', 'data-testid': 'final-score' }, '0');
    void countUp(score, stats.score, fmtInt, 1100, 150, instant);
    const cell = (ico: string, v: number, fmt: (n: number) => string, l: string, i: number) => {
      const b = h('b', {}, '');
      void countUp(b, v, fmt, 650, 300 + i * 70, instant);
      return h('div', { class: 'go-cell' }, icon(ico, 16), b, h('span', {}, l));
    };
    const top = mph ? stats.topSpeed * 0.621371 : stats.topSpeed;
    const earned = h('div', { class: 'earned' }, icon('coin', 20), '+', fmtMoney(out.cash), h('i', {}, '·'), icon('bolt', 20), `+${fmtInt(out.xp)} XP`);
    host.append(
      h('div', { class: 'modal wide result', 'data-testid': 'gameover' },
        h('div', { class: `title ${reason === 'crash' ? 'red' : ''}` }, title),
        out.record
          ? h('div', { class: 'record', 'data-testid': 'new-record' }, icon('star', 20), 'YENİ REKOR', icon('star', 20))
          : h('div', { class: 'sub' }, `${MAP_BY_ID.get(save.data.lastRun.map)?.name ?? ''} · ${d.highScores[mode] ? `Rekor: ${fmtInt(d.highScores[mode] ?? 0)}` : 'İlk sürüş'}`),
        score,
        out.rank !== null ? h('div', { class: 'rank-chip', 'data-testid': 'go-rank' }, icon('podium', 16), `Skor tablosunda ${out.rank}. sıra`) : null,
        h('div', { class: 'go-grid' },
          cell('route', stats.distance, fmtDistance, 'Mesafe', 0),
          cell('speed', top, (n) => `${n} ${mph ? 'mph' : 'km/s'}`, 'Azami hız', 1),
          cell('bolt', stats.nearMisses, (n) => String(n), 'Kıl payı', 2),
          cell('fire', stats.maxCombo, (n) => `x${n}`, 'En iyi kombo', 3),
          cell('car', stats.overtakes, (n) => String(n), 'Sollama', 4),
          cell('twoway', Math.round(stats.oppositeLaneTime * 10), (n) => `${(n / 10).toFixed(1)} s`, 'Ters yön', 5),
          cell('target', Math.round(stats.wheelieTime * 10), (n) => `${(n / 10).toFixed(1)} s`, 'Wheelie', 6),
          cell('clock', Math.floor(stats.time), (n) => `${n} s`, 'Süre', 7),
        ),
        this.rewards(out),
        earned,
        this.levelBlock(out),
        this.achievements(out),
        h('div', { class: 'go-buttons' },
          btn('TEKRAR', () => a.restart(), 'primary', 'btn-retry', 'retry'),
          btn('GARAJ', () => a.openGarage(), '', 'btn-go-garage', 'garage'),
          btn('ANA MENÜ', () => a.quitToMenu(), 'ghost', 'btn-menu', 'home'),
        ),
      ),
    );
    this.ctx.nav.shortcuts.start = () => a.restart();
  }

  renderMission(host: HTMLElement, o: RunOutcome): void {
    const { a } = this.ctx;
    const m = o.mission!;
    const ok = m.result.status === 'complete';
    const def = m.def;
    const map = MAP_BY_ID.get(def.map);
    const unlock = m.unlockedBike ? BIKE_BY_ID.get(m.unlockedBike) : undefined;
    const nextDef = m.nextMissionId ? MISSION_BY_ID.get(m.nextMissionId) : undefined;
    const instant = reducedMotion();
    const starRow = h('div', { class: 'result-stars', 'data-testid': 'mission-stars', 'data-stars': String(m.result.stars) });
    for (let i = 0; i < 3; i++) {
      const s = icon(i < m.result.stars ? 'starFill' : 'star', 54);
      s.classList.add('rstar');
      if (i < m.result.stars) {
        s.classList.add('on');
        s.style.animationDelay = instant ? '0s' : `${0.4 + i * 0.32}s`;
      }
      starRow.append(s);
    }
    const rule = (n: number, text: string) => h('div', { class: `star-rule ${m.result.stars >= n ? 'got' : ''}` }, starsEl(n, n, undefined, 13), text);
    const hasBetter = ok && m.newStars > 0 && m.bestStars === m.result.stars;
    host.append(
      h('div', { class: 'modal wide result mission', 'data-testid': 'mission-result' },
        h('div', { class: 'mission-head' },
          h('div', { class: 'mission-art' }, mapArt(def.map, def.time, def.weather)),
          h('div', {}, h('div', { class: 'card-sub' }, `GÖREV ${def.number} · ${map?.name ?? ''}`), h('div', { class: 'mission-name' }, def.title)),
        ),
        h('div', { class: `title ${ok ? '' : 'red'}`, 'data-testid': 'mission-result-title' }, ok ? 'GÖREV TAMAMLANDI' : 'GÖREV BAŞARISIZ'),
        ok
          ? starRow
          : h('div', { class: 'sub', 'data-testid': 'mission-fail-reason' }, `${failReasonText(m.result.failReason ?? 'quit')} · ilerleme %${Math.floor(m.result.progress * 100)}`),
        ok
          ? h('div', { class: 'sub' }, `${metricLabel(def.stars.metric)}: ${formatMetric(def.stars.metric, m.result.metricValue)}`)
          : h('div', { class: 'gp-best' }, `Hedef: ${objectiveText(def)} · ${fmtKm(m.result.distance)} sürdün`),
        hasBetter ? h('div', { class: 'record', 'data-testid': 'new-record' }, icon('star', 20), m.firstClear ? 'İLK TAMAMLAMA' : 'YENİ YILDIZ REKORU', icon('star', 20)) : null,
        ok ? h('div', { class: 'star-rules' }, rule(1, 'Görevi tamamla'), rule(2, starRuleText(def.stars, 2)), rule(3, starRuleText(def.stars, 3))) : null,
        ok && def.secondary
          ? h('div', { class: `gp-note ${m.result.secondaryMet ? 'ok' : ''}` }, icon(m.result.secondaryMet ? 'check' : 'target', 16), `Bonus hedef (${secondaryText(def.secondary)}): ${m.result.secondaryMet ? 'tamamlandı' : 'tamamlanmadı'}`)
          : null,
        this.rewards(o),
        h('div', { class: 'earned', 'data-testid': 'mission-cash' }, icon('coin', 20), `+${fmtMoney(o.cash)}`, h('i', {}, '·'), icon('bolt', 20), `+${fmtInt(o.xp)} XP`),
        this.levelBlock(o),
        unlock ? h('div', { class: 'gp-note ok unlock' }, icon('bike', 18), `Yeni motor satın alınabilir: ${unlock.brand} ${unlock.model}`) : null,
        this.achievements(o),
        h('div', { class: 'go-buttons' },
          ok && nextDef && m.nextUnlocked ? btn(['SONRAKİ GÖREV ', icon('right', 18)], () => a.startMission(nextDef.id), 'primary', 'btn-next-mission') : btn('TEKRAR DENE', () => a.restart(), 'primary', 'btn-retry-mission', 'retry'),
          ok && nextDef && m.nextUnlocked ? btn('TEKRAR DENE', () => a.restart(), '', 'btn-retry-mission', 'retry') : btn('KARİYER', () => a.openCareer(), '', 'btn-career', 'career'),
          btn('ANA MENÜ', () => a.quitToMenu(), 'ghost', 'btn-menu', 'home'),
        ),
        ok && nextDef && m.nextUnlocked ? h('div', { class: 'gp-best center' }, `Sıradaki: Görev ${nextDef.number} · ${nextDef.title} — ${objectiveText(nextDef)}`) : null,
      ),
    );
    this.ctx.nav.shortcuts.start = () => (ok && nextDef && m.nextUnlocked ? a.startMission(nextDef.id) : a.restart());
  }
}
