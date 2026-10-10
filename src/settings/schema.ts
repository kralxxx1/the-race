/**
 * Schema-driven settings. Every subsystem declares its options as `SettingDef`s
 * (graphics, audio, controls, gameplay, HUD…); the registry validates stored values,
 * applies quality presets and the settings screen is generated from the same data.
 */

export type SettingValue = number | string | boolean;
export type SettingsValues = Readonly<Record<string, SettingValue>>;

export type QualityPreset = 'low' | 'medium' | 'high' | 'ultra' | 'extreme';
export const QUALITY_PRESETS: readonly QualityPreset[] = ['low', 'medium', 'high', 'ultra', 'extreme'];
export const PRESET_LABELS: Record<QualityPreset | 'custom', string> = {
  low: 'Düşük',
  medium: 'Orta',
  high: 'Yüksek',
  ultra: 'Ultra',
  extreme: 'Ekstrem (RTX)',
  custom: 'Özel',
};

export type SettingCategory = 'graphics' | 'effects' | 'world' | 'camera' | 'audio' | 'controls' | 'gameplay' | 'hud' | 'accessibility';
export const CATEGORY_ORDER: readonly SettingCategory[] = ['graphics', 'effects', 'world', 'camera', 'audio', 'controls', 'gameplay', 'hud', 'accessibility'];
export const CATEGORY_LABELS: Record<SettingCategory, string> = {
  graphics: 'Grafik',
  effects: 'Efektler',
  world: 'Dünya',
  camera: 'Kamera',
  audio: 'Ses',
  controls: 'Kontroller',
  gameplay: 'Oynanış',
  hud: 'Arayüz',
  accessibility: 'Erişilebilirlik',
};

interface SettingBase {
  /** Stable storage key, namespaced: `gfx.shadows`, `audio.master`, `ctrl.tilt`… */
  key: string;
  category: SettingCategory;
  /** Sub-heading inside the category (e.g. "Gölgeler", "Kenar yumuşatma"). */
  group: string;
  label: string;
  /** One-line explanation shown under the control. */
  help?: string;
  /** Hidden unless "advanced" is expanded. */
  advanced?: boolean;
  /** Takes effect on the next run / reload only. */
  restart?: boolean;
  /** Show only when this predicate over the current values holds. */
  visibleIf?: (v: SettingsValues) => boolean;
}

export interface ToggleSetting extends SettingBase {
  type: 'toggle';
  default: boolean;
  presets?: Partial<Record<QualityPreset, boolean>>;
}

export interface SelectSetting extends SettingBase {
  type: 'select';
  options: ReadonlyArray<{ value: string; label: string; help?: string }>;
  default: string;
  presets?: Partial<Record<QualityPreset, string>>;
}

export interface SliderSetting extends SettingBase {
  type: 'slider';
  min: number;
  max: number;
  step: number;
  /** Display unit appended to the value ("%", "m", "°"…). */
  unit?: string;
  /** Custom display formatting. */
  format?: (v: number) => string;
  default: number;
  presets?: Partial<Record<QualityPreset, number>>;
}

export type SettingDef = ToggleSetting | SelectSetting | SliderSetting;

/** Key of the master graphics preset select. Changing it rewrites every preset-bearing setting. */
export const PRESET_KEY = 'gfx.preset';

function roundToStep(v: number, d: SliderSetting): number {
  const steps = Math.round((v - d.min) / d.step);
  const out = d.min + steps * d.step;
  // Avoid 0.30000000000000004 style noise.
  return Math.min(d.max, Math.max(d.min, Number(out.toFixed(6))));
}

/** Coerce an untrusted value into a valid one for `def`, or return its default. */
export function sanitizeValue(def: SettingDef, raw: unknown): SettingValue {
  switch (def.type) {
    case 'toggle':
      return typeof raw === 'boolean' ? raw : def.default;
    case 'select':
      return typeof raw === 'string' && def.options.some((o) => o.value === raw) ? raw : def.default;
    case 'slider':
      return typeof raw === 'number' && Number.isFinite(raw) ? roundToStep(raw, def) : def.default;
  }
}

export class SettingsRegistry {
  private defs = new Map<string, SettingDef>();

  register(defs: readonly SettingDef[]): this {
    for (const d of defs) {
      if (this.defs.has(d.key)) throw new Error(`Duplicate setting key: ${d.key}`);
      if (d.type === 'select' && !d.options.some((o) => o.value === d.default)) throw new Error(`Bad default for ${d.key}`);
      if (d.type === 'slider' && (d.default < d.min || d.default > d.max)) throw new Error(`Bad default for ${d.key}`);
      this.defs.set(d.key, d);
    }
    return this;
  }

  get(key: string): SettingDef | undefined {
    return this.defs.get(key);
  }

  has(key: string): boolean {
    return this.defs.has(key);
  }

  list(): SettingDef[] {
    return [...this.defs.values()];
  }

  byCategory(cat: SettingCategory): SettingDef[] {
    return this.list().filter((d) => d.category === cat);
  }

  /** The value a preset assigns to a setting (its default when the preset does not mention it). */
  presetValue(def: SettingDef, preset: QualityPreset): SettingValue {
    const p = def.presets?.[preset];
    return p === undefined ? def.default : p;
  }

  /** Defaults for every setting, with preset-bearing ones taken from `preset`. */
  defaults(preset: QualityPreset = 'high'): Record<string, SettingValue> {
    const out: Record<string, SettingValue> = {};
    for (const d of this.defs.values()) out[d.key] = d.presets ? this.presetValue(d, preset) : d.default;
    if (this.defs.has(PRESET_KEY)) out[PRESET_KEY] = preset;
    return out;
  }

  /** Validate an untrusted record: unknown keys are dropped, bad values reset to defaults. */
  sanitize(raw: unknown, preset: QualityPreset = 'high'): Record<string, SettingValue> {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    const base = this.defaults(preset);
    const pre = this.defs.get(PRESET_KEY);
    const chosen = pre ? sanitizeValue(pre, src[PRESET_KEY]) : null;
    // A stored preset (other than custom) decides the defaults of preset-bearing keys.
    const presetDefaults = typeof chosen === 'string' && (QUALITY_PRESETS as readonly string[]).includes(chosen) ? this.defaults(chosen as QualityPreset) : base;
    const out: Record<string, SettingValue> = {};
    for (const d of this.defs.values()) out[d.key] = d.key in src ? sanitizeValue(d, src[d.key]) : presetDefaults[d.key];
    return out;
  }

  /** Return a copy of `values` with every preset-bearing setting set for `preset`. */
  applyPreset(values: SettingsValues, preset: QualityPreset): Record<string, SettingValue> {
    const out: Record<string, SettingValue> = { ...values };
    for (const d of this.defs.values()) if (d.presets) out[d.key] = this.presetValue(d, preset);
    if (this.defs.has(PRESET_KEY)) out[PRESET_KEY] = preset;
    return out;
  }

  /**
   * Apply a user change. Picking a preset rewrites all preset-bearing settings;
   * hand-editing one of them switches the preset to "custom".
   */
  change(values: SettingsValues, key: string, value: unknown): Record<string, SettingValue> {
    const def = this.defs.get(key);
    if (!def) return { ...values };
    const v = sanitizeValue(def, value);
    if (key === PRESET_KEY && typeof v === 'string' && (QUALITY_PRESETS as readonly string[]).includes(v)) {
      return this.applyPreset(values, v as QualityPreset);
    }
    const out: Record<string, SettingValue> = { ...values, [key]: v };
    if (def.presets && this.defs.has(PRESET_KEY) && values[key] !== v) out[PRESET_KEY] = 'custom';
    return out;
  }

  /** Which preset (if any) the current values match exactly. */
  matchingPreset(values: SettingsValues): QualityPreset | null {
    for (const p of QUALITY_PRESETS) {
      let ok = true;
      for (const d of this.defs.values()) {
        if (d.presets && values[d.key] !== this.presetValue(d, p)) {
          ok = false;
          break;
        }
      }
      if (ok) return p;
    }
    return null;
  }
}

/** Typed readers over a settings record (fall back to the registry default). */
export class SettingsReader {
  constructor(
    private readonly reg: SettingsRegistry,
    private values: SettingsValues,
  ) {}

  update(values: SettingsValues): void {
    this.values = values;
  }

  raw(): SettingsValues {
    return this.values;
  }

  num(key: string): number {
    const v = this.values[key];
    if (typeof v === 'number') return v;
    const d = this.reg.get(key);
    return d && d.type === 'slider' ? d.default : 0;
  }

  bool(key: string): boolean {
    const v = this.values[key];
    if (typeof v === 'boolean') return v;
    const d = this.reg.get(key);
    return d && d.type === 'toggle' ? d.default : false;
  }

  str<T extends string = string>(key: string): T {
    const v = this.values[key];
    if (typeof v === 'string') return v as T;
    const d = this.reg.get(key);
    return (d && d.type === 'select' ? d.default : '') as T;
  }
}
