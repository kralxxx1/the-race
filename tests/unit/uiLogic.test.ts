import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BIKES } from '../../src/data/bikes';
import { SETTINGS } from '../../src/settings';
import { PATH_ROW, pathData, pathPositions } from '../../src/ui/careerScreen';
import { sortBikes } from '../../src/ui/garageScreen';
import { fold, matchesQuery } from '../../src/ui/settingsScreen';
import { gaugeSize } from '../../src/ui/tacho';
import { UI_PALETTE, applyUiSettings, readHudToggles } from '../../src/ui/uiApply';
import { UI_SETTINGS } from '../../src/ui/uiSettings';

/** Minimal document root: the class list and style properties applyUiSettings touches. */
function fakeRoot() {
  const classes = new Set<string>();
  const props = new Map<string, string>();
  return {
    classes,
    props,
    root: {
      classList: {
        toggle: (c: string, on?: boolean) => {
          const want = on ?? !classes.has(c);
          if (want) classes.add(c);
          else classes.delete(c);
          return want;
        },
      },
      style: {
        fontSize: '',
        setProperty: (k: string, v: string) => props.set(k, v),
        removeProperty: (k: string) => props.delete(k),
      },
    } as unknown as HTMLElement,
  };
}

const reader = (over: Record<string, string | number | boolean> = {}) => {
  const vals = { ...SETTINGS.defaults('high'), ...over };
  return {
    num: (k: string) => Number(vals[k]),
    bool: (k: string) => vals[k] === true,
    str: (k: string) => String(vals[k]),
  };
};

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

describe('garage sorting', () => {
  it('sorts by price both ways and keeps every bike', () => {
    const asc = sortBikes(BIKES, 'price', false);
    expect(asc).toHaveLength(BIKES.length);
    for (let i = 1; i < asc.length; i++) expect(asc[i].price).toBeGreaterThanOrEqual(asc[i - 1].price);
    const desc = sortBikes(BIKES, 'price', true);
    expect(desc[0].price).toBe(asc[asc.length - 1].price);
  });

  it('sorts by power, weight and name', () => {
    const hp = sortBikes(BIKES, 'hp', true);
    expect(hp[0].engine.hp).toBe(Math.max(...BIKES.map((b) => b.engine.hp)));
    const light = sortBikes(BIKES, 'weight', false);
    expect(light[0].weight).toBe(Math.min(...BIKES.map((b) => b.weight)));
    const names = sortBikes(BIKES, 'name', false).map((b) => `${b.brand} ${b.model}`);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'tr')));
  });

  it('sorts by acceleration using the supplied timing', () => {
    const t = new Map(BIKES.map((b, i) => [b.id, 3 + (i % 7)]));
    const sorted = sortBikes(BIKES, 'accel', false, (b) => t.get(b.id) ?? 99);
    for (let i = 1; i < sorted.length; i++) expect(t.get(sorted[i].id) ?? 99).toBeGreaterThanOrEqual(t.get(sorted[i - 1].id) ?? 99);
  });
});

describe('settings search', () => {
  it('folds Turkish letters', () => {
    expect(fold('Işık ŞÖĞÜÇ İstanbul')).toBe('isik soguc istanbul');
  });

  it('finds settings by label, group, help or category and needs every word', () => {
    const shadows = SETTINGS.get('gfx.shadows');
    expect(shadows).toBeDefined();
    if (!shadows) return;
    expect(matchesQuery(shadows, 'gölge')).toBe(true);
    expect(matchesQuery(shadows, 'golge')).toBe(true);
    expect(matchesQuery(shadows, 'GÖLGE grafik')).toBe(true);
    expect(matchesQuery(shadows, 'gölge zzzz')).toBe(false);
    expect(matchesQuery(shadows, '   ')).toBe(true);
  });

  it('every query word of the visible UI strings hits at least one setting', () => {
    for (const q of ['ses', 'kontrast', 'fps', 'sis', 'harita']) expect(SETTINGS.list().some((d) => matchesQuery(d, q))).toBe(true);
  });
});

describe('career path', () => {
  it('places one node per mission, top to bottom, inside the page width', () => {
    const pts = pathPositions(10);
    expect(pts).toHaveLength(10);
    pts.forEach((p, i) => {
      expect(p.x).toBeGreaterThan(8);
      expect(p.x).toBeLessThan(92);
      if (i) expect(p.y - pts[i - 1].y).toBe(PATH_ROW);
    });
  });

  it('draws a smooth curve through every node', () => {
    const pts = pathPositions(5);
    const d = pathData(pts);
    expect(d.startsWith(`M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(1)}`)).toBe(true);
    expect(d.match(/ C /g)).toHaveLength(4);
    expect(pathData([])).toBe('');
  });
});

describe('gauge sizes', () => {
  it('has a size for every style, smaller on phones', () => {
    for (const s of ['dial', 'bar', 'digital'] as const) {
      const big = gaugeSize(s, false);
      const small = gaugeSize(s, true);
      expect(big.w).toBeGreaterThan(small.w);
      expect(big.h).toBeGreaterThan(small.h);
    }
  });
});

describe('interface settings are applied', () => {
  it('maps accessibility options to root classes, text size and the colour-blind palette', () => {
    const { root, classes, props } = fakeRoot();
    applyUiSettings(reader({ 'a11y.contrast': true, 'a11y.reduceMotion': true, 'a11y.textScale': '130', 'a11y.colorBlind': 'deutan', 'a11y.largeTargets': true }), root);
    expect(classes.has('a11y-contrast')).toBe(true);
    expect(classes.has('a11y-reduce-motion')).toBe(true);
    expect(classes.has('a11y-large')).toBe(true);
    expect(classes.has('cb-deutan')).toBe(true);
    expect(root.style.fontSize).toBe('20.8px');
    expect(props.get('--c-good')).toBe(UI_PALETTE.good);
    expect(UI_PALETTE.bad).not.toBe('#ff3b30');
    applyUiSettings(reader(), root);
    expect(classes.has('a11y-contrast')).toBe(false);
    expect(classes.has('cb-deutan')).toBe(false);
    expect(UI_PALETTE.bad).toBe('#ff3b30');
  });

  it('maps HUD options to classes and CSS variables', () => {
    const { root, classes, props } = fakeRoot();
    applyUiSettings(reader({ 'hud.scale': 125, 'hud.opacity': 60, 'hud.margin': 20, 'hud.layout': 'center', 'hud.showScore': false, 'hud.popups': false, 'hud.touchLayout': 'left' }), root);
    expect(props.get('--hud-scale')).toBe('1.25');
    expect(props.get('--hud-opacity')).toBe('0.6');
    expect(props.get('--hud-margin')).toBe('20px');
    expect(classes.has('hud-layout-center')).toBe(true);
    expect(classes.has('hud-no-score')).toBe(true);
    expect(classes.has('hud-no-popups')).toBe(true);
    expect(classes.has('touch-left')).toBe(true);
    expect(readHudToggles(reader({ 'hud.showRpm': false })).rpm).toBe(false);
  });
});

describe('every interface option is wired', () => {
  const files = sourceFiles(join(__dirname, '../../src')).filter((f) => !f.endsWith('uiSettings.ts'));
  const text = files.map((f) => readFileSync(f, 'utf8')).join('\n');

  it('reads each hud.*, ui.* and a11y.* key somewhere outside its definition', () => {
    const missing = UI_SETTINGS.map((d) => d.key).filter((k) => !text.includes(`'${k}'`) && !text.includes(`"${k}"`));
    expect(missing).toEqual([]);
  });

  it('gives every interface option a Turkish label', () => {
    for (const d of UI_SETTINGS) expect(d.label.length).toBeGreaterThan(2);
  });
});
