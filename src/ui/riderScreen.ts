import { BIKE_BY_ID, BIKES } from '../data/bikes';
import { GEAR_PRESETS, GEAR_SWATCHES, HELMET_DESIGNS, MAX_NAME, SUIT_DESIGNS, VISOR_TINTS, cloneGear, defaultGear, randomGear, sameLook, sanitizeName, type RiderGear } from '../data/riderGear';
import { VIEW_LABELS, type ViewId } from '../render/showroom';
import { btn, header, type UiCtx } from './ctx';
import { h, rerender } from './dom';
import { icon } from './icons';
import { levelBar } from './widgets';
import './rider.css';

type Part = 'helmet' | 'suit' | 'gloves' | 'boots';
const PARTS: { id: Part; label: string; ico: string; view: ViewId }[] = [
  { id: 'helmet', label: 'Kask', ico: 'helmet', view: 'helmet' },
  { id: 'suit', label: 'Tulum', ico: 'suit', view: 'rider' },
  { id: 'gloves', label: 'Eldiven', ico: 'glove', view: 'gloves' },
  { id: 'boots', label: 'Bot', ico: 'bike', view: 'rider' },
];
const VIEW_CHIPS: ViewId[] = ['rider', 'helmet', 'gloves', 'side', 'rear'];

/** Rider: design the helmet, leathers, gloves and boots on a live preview, then save them to the profile. */
export class RiderScreen {
  private draft: RiderGear;
  private part: Part = 'helmet';
  private host: HTMLElement | null = null;

  constructor(private ctx: UiCtx) {
    this.draft = cloneGear(ctx.save.data.rider);
  }

  private get saved(): RiderGear {
    return this.ctx.save.data.rider;
  }

  private get dirty(): boolean {
    return JSON.stringify(this.draft) !== JSON.stringify(this.saved);
  }

  render(host: HTMLElement): void {
    this.host = host;
    this.draft = cloneGear(this.saved);
    this.part = 'helmet';
    this.build(host);
    this.preview();
    this.ctx.a.showroom.setView(PARTS[0].view);
    this.ctx.nav.shortcuts.alt = () => this.randomise();
    this.ctx.nav.shortcuts.start = () => this.commit();
  }

  /** Leave the screen; unsaved changes ask first. */
  back(): void {
    if (!this.dirty) {
      this.leave();
      return;
    }
    this.ctx.dialog({
      title: 'Değişiklikler kaydedilsin mi?',
      icon: 'helmet',
      body: [
        h('p', {}, 'Ekipman tasarımında kaydedilmemiş değişiklikler var.'),
        h('button', { class: 'btn danger small', type: 'button', 'data-testid': 'gear-discard', onclick: () => {
          this.ctx.closeDialog();
          this.leave();
        } }, 'KAYDETMEDEN ÇIK'),
      ],
      confirm: { label: 'KAYDET VE ÇIK', testid: 'gear-save-exit', run: () => {
        this.commit();
        this.leave();
      } },
      cancelLabel: 'DEVAM ET',
    });
  }

  private leave(): void {
    this.ctx.a.previewGear(null);
    this.ctx.a.back();
  }

  private preview(): void {
    this.ctx.a.previewGear(this.draft);
  }

  private commit(): void {
    this.draft.name = sanitizeName(this.draft.name);
    this.ctx.a.setGear(cloneGear(this.draft));
    this.ctx.toast('Ekipman kaydedildi', 'good');
    this.redo();
  }

  private redo(): void {
    if (this.host) rerender(this.host, () => this.build(this.host as HTMLElement));
  }

  /** A change made by the player: colours stop following the bike. */
  private touch(): void {
    this.draft.follow = false;
    this.preview();
  }

  private randomise(): void {
    this.draft = randomGear(this.draft);
    this.preview();
    this.redo();
  }

  // ───────────────────────────── layout ─────────────────────────────
  private build(host: HTMLElement): void {
    const { save, a } = this.ctx;
    const d = save.data;
    const bike = BIKE_BY_ID.get(d.selectedBike) ?? BIKES[0];
    const g = this.draft;
    const liv = bike.liveries[save.livery(bike.id)];

    const name = h('input', { class: 'field', type: 'text', maxlength: String(MAX_NAME), value: g.name, 'aria-label': 'Sürücü adı', 'data-testid': 'gear-name', 'data-nid': 'gear-name', autocomplete: 'off', spellcheck: 'false' });
    name.addEventListener('input', () => {
      g.name = name.value.slice(0, MAX_NAME);
      counter.textContent = `${g.name.length}/${MAX_NAME}`;
    });
    name.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') name.blur();
      else if (e.key === 'Enter') name.blur();
    });
    const counter = h('small', { class: 'name-count' }, `${g.name.length}/${MAX_NAME}`);

    const partTabs = h('div', { class: 'tabs part-tabs', 'data-tabs': '', role: 'tablist' },
      PARTS.map((p) => h('button', { class: p.id === this.part ? 'sel' : '', type: 'button', role: 'tab', 'aria-selected': p.id === this.part ? 'true' : 'false', 'data-testid': `gear-part-${p.id}`, 'data-nid': `part-${p.id}`, onclick: () => {
        this.part = p.id;
        a.showroom.setView(p.view);
        this.redo();
      } }, icon(p.ico, 16), p.label)),
    );

    const cur = a.showroom.view;
    const views = h('div', { class: 'chip-row rider-views', role: 'group', 'aria-label': 'Görünüm' },
      VIEW_CHIPS.map((v) => h('button', { class: `chip ${v === cur ? 'sel' : ''}`, type: 'button', 'data-testid': `rider-view-${v}`, 'data-nid': `rview-${v}`, onclick: (e: Event) => {
        a.showroom.setView(v);
        (e.currentTarget as HTMLElement).parentElement?.querySelectorAll('.chip').forEach((c) => c.classList.remove('sel'));
        (e.currentTarget as HTMLElement).classList.add('sel');
      } }, VIEW_LABELS[v])),
    );
    a.showroom.onViewChange((v) => {
      views.querySelectorAll<HTMLElement>('.chip').forEach((c, i) => c.classList.toggle('sel', VIEW_CHIPS[i] === v));
    });

    const follow = h('button', { class: `toggle ${g.follow ? 'on' : ''}`, type: 'button', role: 'switch', 'aria-checked': g.follow ? 'true' : 'false', 'aria-label': 'Motosikletin renklerini kullan', 'data-testid': 'gear-follow', 'data-nid': 'gear-follow', onclick: () => {
      g.follow = !g.follow;
      this.preview();
      this.redo();
    } }, h('i', {}));

    const presets = h('div', { class: 'gear-presets', role: 'group', 'aria-label': 'Hazır setler' },
      GEAR_PRESETS.map((p) => {
        const on = !g.follow && sameLook(g, { ...p.gear, name: g.name });
        return h('button', { class: `gp ${on ? 'sel' : ''}`, type: 'button', 'aria-pressed': on ? 'true' : 'false', 'data-testid': `gear-preset-${p.id}`, 'data-nid': `gpreset-${p.id}`, title: p.label, onclick: () => {
          this.draft = { ...cloneGear({ ...p.gear, name: g.name }), name: g.name };
          this.preview();
          this.redo();
        } },
          h('span', { class: 'gp-dots' },
            h('i', { style: `background:${p.gear.helmet.base}` }), h('i', { style: `background:${p.gear.suit.base}` }), h('i', { style: `background:${p.gear.helmet.accent}` }), h('i', { style: `background:${p.gear.gloves.base}` })),
          h('b', {}, p.label));
      }),
    );

    host.append(
      header(this.ctx, { title: 'SÜRÜCÜ', icon: 'helmet', sub: this.dirty ? 'kaydedilmemiş değişiklik' : undefined, backTestid: 'btn-back', right: [this.dirty ? h('span', { class: 'badge gold' }, 'DEĞİŞTİ') : null] }),
      h('div', { class: 'body rider-body' },
        h('div', { class: 'scroll rider-panel glass', 'data-keep': 'rider' },
          h('div', { class: 'rider-card' },
            h('div', { class: 'avatar sm', style: `--av:${g.follow ? liv?.suit[0] ?? '#e11d2a' : g.helmet.base}` }, icon('helmet', 26)),
            h('div', { class: 'rider-card-main' }, h('label', { class: 'mini-label', for: 'gear-name' }, 'SÜRÜCÜ ADI'), h('div', { class: 'name-row' }, name, counter)),
          ),
          levelBar(d.xp, 'rider-level-card'),
          h('div', { class: 'follow-row' },
            h('div', {}, h('b', {}, 'Motosikletin renkleri'), h('small', {}, `${bike.model} fabrika tulumu ve kaskı`)),
            follow,
          ),
          h('div', { class: 'section-title' }, 'Hazır setler'),
          presets,
          h('div', { class: 'section-title' }, 'Özelleştir'),
          partTabs,
          this.partControls(),
          h('div', { class: 'section-title' }, 'Önizleme'),
          views,
          h('div', { class: 'note' }, 'Seçtiklerin sürüşte birinci şahıs görünümünde eldiven ve kollarda, kaza anında sürücü modelinde görünür.'),
        ),
        h('div', { class: 'rider-mid pass' }),
      ),
      h('div', { class: 'foot rider-foot' },
        btn([h('span', { class: 'lbl' }, 'Rastgele')], () => this.randomise(), 'ghost', 'gear-random', 'dice'),
        btn([h('span', { class: 'lbl' }, 'Varsayılan')], () => {
          this.draft = { ...defaultGear(), name: g.name };
          this.preview();
          this.redo();
        }, 'ghost', 'gear-default', 'reset'),
        btn(this.dirty ? 'KAYDET' : 'KAYDEDİLDİ', () => this.commit(), `primary ${this.dirty ? '' : 'disabled'}`, 'gear-save', 'check'),
      ),
    );
  }

  // ───────────────────────────── controls per part ─────────────────────────────
  private colorRow(label: string, value: string, set: (c: string) => void, testid: string): HTMLElement {
    const dis = this.draft.follow;
    const picker = h('input', { class: 'colorpick', type: 'color', value, 'aria-label': `${label}: özel renk`, 'data-testid': `${testid}-picker`, 'data-nid': `${testid}-picker`, disabled: dis });
    picker.addEventListener('input', () => {
      set(picker.value.toLowerCase());
      this.touch();
      row.querySelectorAll('.sw').forEach((s) => s.classList.toggle('sel', (s as HTMLElement).dataset.c === picker.value.toLowerCase()));
    });
    picker.addEventListener('change', () => this.redo());
    const row = h('div', { class: `color-row ${dis ? 'off' : ''}` },
      h('div', { class: 'mini-label' }, label),
      h('div', { class: 'swatch-grid', role: 'group', 'aria-label': label },
        GEAR_SWATCHES.map((c) => h('button', { class: `sw ${c === value ? 'sel' : ''}`, type: 'button', style: `background:${c}`, title: c, 'aria-label': `${label} ${c}`, 'aria-pressed': c === value ? 'true' : 'false', 'data-c': c, 'data-testid': `${testid}-${c.slice(1)}`, 'data-nid': `${testid}-${c.slice(1)}`, disabled: dis, onclick: () => {
          set(c);
          this.touch();
          this.redo();
        } })),
        h('label', { class: 'sw custom', title: 'Özel renk' }, picker, icon('plus', 14)),
      ),
    );
    return row;
  }

  private chipRow<T extends string>(label: string, opts: readonly { id: T; label: string; color?: string }[], cur: T, set: (v: T) => void, testid: string): HTMLElement {
    return h('div', { class: 'design-row' },
      h('div', { class: 'mini-label' }, label),
      h('div', { class: 'chip-row', role: 'group', 'aria-label': label },
        opts.map((o) => h('button', { class: `chip ${o.id === cur ? 'sel' : ''}`, type: 'button', 'aria-pressed': o.id === cur ? 'true' : 'false', 'data-testid': `${testid}-${o.id}`, 'data-nid': `${testid}-${o.id}`, onclick: () => {
          set(o.id);
          this.touch();
          this.redo();
        } }, o.color ? h('i', { class: 'tint', style: `background:${o.color}` }) : null, o.label)),
      ),
    );
  }

  private partControls(): HTMLElement {
    const g = this.draft;
    const wrap = h('div', { class: 'part-controls', 'data-testid': `gear-controls-${this.part}` });
    switch (this.part) {
      case 'helmet':
        wrap.append(
          this.colorRow('Ana renk', g.helmet.base, (c) => (g.helmet.base = c), 'helmet-base'),
          this.colorRow('Desen rengi', g.helmet.accent, (c) => (g.helmet.accent = c), 'helmet-accent'),
          this.chipRow('Desen', HELMET_DESIGNS, g.helmet.design, (v) => (g.helmet.design = v), 'helmet-design'),
          this.chipRow('Siperlik', VISOR_TINTS, g.helmet.visor, (v) => (g.helmet.visor = v), 'helmet-visor'),
        );
        break;
      case 'suit':
        wrap.append(
          this.colorRow('Ana renk', g.suit.base, (c) => (g.suit.base = c), 'suit-base'),
          this.colorRow('Şerit / panel rengi', g.suit.accent, (c) => (g.suit.accent = c), 'suit-accent'),
          this.chipRow('Desen', SUIT_DESIGNS, g.suit.design, (v) => (g.suit.design = v), 'suit-design'),
        );
        break;
      case 'gloves':
        wrap.append(
          this.colorRow('Ana renk', g.gloves.base, (c) => (g.gloves.base = c), 'gloves-base'),
          this.colorRow('Manşet / kaplama rengi', g.gloves.accent, (c) => (g.gloves.accent = c), 'gloves-accent'),
        );
        break;
      case 'boots':
        wrap.append(this.colorRow('Bot rengi', g.boots, (c) => (g.boots = c), 'boots'));
        break;
    }
    return wrap;
  }
}
