import { describe, expect, it } from 'vitest';
import { GEAR_PRESETS, GEAR_SWATCHES, MAX_NAME, cloneGear, defaultGear, randomGear, sameLook, sanitizeGear, sanitizeName } from '../../src/data/riderGear';
import { MemoryStore, SAVE_KEY, SaveManager, defaultSave, migrate, sanitizeSave } from '../../src/storage/save';

describe('rider gear sanitising', () => {
  it('returns the defaults for garbage', () => {
    for (const junk of [null, undefined, 5, 'x', [], [1, 2], true, { helmet: 3, suit: 'x', gloves: [] }]) {
      expect(sanitizeGear(junk)).toEqual(defaultGear());
    }
  });

  it('keeps valid values, lower-cases colours and rejects invalid ones', () => {
    const g = sanitizeGear({
      name: 'Kaya',
      follow: false,
      helmet: { base: '#FF5A1F', accent: 'red', design: 'flame', visor: 'amber' },
      suit: { base: '#123', accent: '#00ff00', design: 'nonsense' },
      gloves: { base: '#ABCDEF', accent: 7 },
      boots: '#000000',
    });
    expect(g.name).toBe('Kaya');
    expect(g.follow).toBe(false);
    expect(g.helmet).toEqual({ base: '#ff5a1f', accent: defaultGear().helmet.accent, design: 'flame', visor: 'amber' });
    expect(g.suit).toEqual({ base: defaultGear().suit.base, accent: '#00ff00', design: defaultGear().suit.design });
    expect(g.gloves).toEqual({ base: '#abcdef', accent: defaultGear().gloves.accent });
    expect(g.boots).toBe('#000000');
  });

  it('cleans names: control characters and markup are dropped, length is capped', () => {
    expect(sanitizeName('  A\u0000B\n<b>C  ')).toBe('ABbC');
    expect(sanitizeName('x'.repeat(40))).toHaveLength(MAX_NAME);
    expect(sanitizeName('   ')).toBe(defaultGear().name);
    expect(sanitizeName(42)).toBe(defaultGear().name);
    expect(sanitizeName('<>')).toBe(defaultGear().name);
  });

  it('every preset and swatch is valid and idempotent under sanitising', () => {
    for (const p of GEAR_PRESETS) {
      const g = { name: 'Test', ...p.gear };
      expect(sanitizeGear(g)).toEqual(g);
      expect(p.gear.follow).toBe(false);
    }
    for (const c of GEAR_SWATCHES) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('randomGear always yields a valid custom look', () => {
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 50; i++) {
      const g = randomGear(defaultGear(), rnd);
      expect(sanitizeGear(g)).toEqual(g);
      expect(g.follow).toBe(false);
    }
  });

  it('cloneGear is deep and sameLook ignores the name', () => {
    const a = defaultGear();
    const b = cloneGear(a);
    b.helmet.base = '#000000';
    expect(a.helmet.base).not.toBe('#000000');
    expect(sameLook(a, { ...cloneGear(a), name: 'Başka' })).toBe(true);
    expect(sameLook(a, b)).toBe(false);
  });
});

describe('rider gear in the save (version 5)', () => {
  it('a fresh save carries the default gear', () => {
    expect(defaultSave().rider).toEqual(defaultGear());
  });

  it('a v4 save migrates and gains default gear while keeping everything else', () => {
    const v4 = { version: 4, cash: 777, xp: 1234, ownedBikes: ['yamaha-r3'], selectedBike: 'yamaha-r3' };
    const m = migrate(v4);
    expect(m.version).toBe(5);
    const s = sanitizeSave(v4);
    expect(s.rider).toEqual(defaultGear());
    expect(s.cash).toBe(777);
    expect(s.xp).toBe(1234);
  });

  it('tampered gear in storage is repaired', () => {
    const s = sanitizeSave({ version: 5, rider: { name: 'a'.repeat(99), helmet: { base: 'javascript:alert(1)', design: '<script>' }, suit: null } });
    expect(s.rider.name).toHaveLength(MAX_NAME);
    expect(s.rider.helmet.base).toBe(defaultGear().helmet.base);
    expect(s.rider.helmet.design).toBe(defaultGear().helmet.design);
  });

  it('SaveManager.setGear persists a validated copy', () => {
    const store = new MemoryStore();
    const m = new SaveManager(store);
    const g = cloneGear(GEAR_PRESETS[0].gear as ReturnType<typeof defaultGear>);
    g.name = 'Deniz';
    m.setGear(g);
    const raw = JSON.parse(store.getItem(SAVE_KEY) ?? '{}');
    expect(raw.rider.name).toBe('Deniz');
    expect(raw.rider.follow).toBe(false);
    expect(new SaveManager(store).data.rider).toEqual(m.data.rider);
    // An invalid object cannot corrupt the save.
    m.setGear({ ...g, helmet: { ...g.helmet, base: 'nope' } });
    expect(m.data.rider.helmet.base).toBe(defaultGear().helmet.base);
  });
});
