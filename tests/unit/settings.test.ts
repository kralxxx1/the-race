import { describe, expect, it } from 'vitest';
import { PRESET_KEY, QUALITY_PRESETS, SETTINGS, SettingsReader, SettingsRegistry, sanitizeValue } from '../../src/settings';

describe('settings registry', () => {
  it('has unique namespaced keys with valid defaults and presets', () => {
    const keys = SETTINGS.list().map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const d of SETTINGS.list()) {
      expect(d.key).toMatch(/^[a-z0-9]+\.[A-Za-z0-9]+$/);
      expect(sanitizeValue(d, d.default)).toBe(d.default);
      for (const p of QUALITY_PRESETS) {
        const v = d.presets?.[p];
        if (v !== undefined) expect(sanitizeValue(d, v)).toBe(v);
      }
    }
  });

  it('rejects duplicate keys and bad defaults', () => {
    const r = new SettingsRegistry();
    r.register([{ key: 'a.b', category: 'hud', group: 'g', label: 'x', type: 'toggle', default: true }]);
    expect(() => r.register([{ key: 'a.b', category: 'hud', group: 'g', label: 'x', type: 'toggle', default: true }])).toThrow();
    expect(() => r.register([{ key: 'a.c', category: 'hud', group: 'g', label: 'x', type: 'slider', min: 0, max: 1, step: 0.1, default: 5 }])).toThrow();
  });

  it('applies presets and switches to custom on manual edits', () => {
    let v = SETTINGS.defaults('high');
    v = SETTINGS.change(v, PRESET_KEY, 'low');
    expect(v[PRESET_KEY]).toBe('low');
    expect(v['gfx.shadows']).toBe('off');
    expect(SETTINGS.matchingPreset(v)).toBe('low');
    v = SETTINGS.change(v, 'gfx.shadows', '4096');
    expect(v[PRESET_KEY]).toBe('custom');
    expect(v['gfx.shadows']).toBe('4096');
    v = SETTINGS.change(v, PRESET_KEY, 'extreme');
    expect(v['gfx.shadows']).toBe('8192');
    expect(SETTINGS.matchingPreset(v)).toBe('extreme');
  });

  it('non-preset settings survive preset changes', () => {
    let v = SETTINGS.defaults();
    v = SETTINGS.change(v, 'hud.units', 'mph');
    v = SETTINGS.change(v, PRESET_KEY, 'medium');
    expect(v['hud.units']).toBe('mph');
    expect(v[PRESET_KEY]).toBe('medium');
  });

  it('sanitises sliders to their range and step', () => {
    const v = SETTINGS.sanitize({ 'audio.master': 0.333, 'world.viewDistance': 99999, 'gfx.pixelRatio': 'x' });
    expect(v['audio.master']).toBe(0.35);
    expect(v['world.viewDistance']).toBe(3000);
    expect(v['gfx.pixelRatio']).toBe(1.5);
  });

  it('reader falls back to defaults for missing or mistyped values', () => {
    const r = new SettingsReader(SETTINGS, { 'audio.master': 'loud', 'hud.units': 3 });
    expect(r.num('audio.master')).toBe(0.8);
    expect(r.str('hud.units')).toBe('kmh');
    expect(r.bool('cam.shake')).toBe(true);
  });
});
