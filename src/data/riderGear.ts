/**
 * Rider gear: helmet, leathers and gloves the player designs on the "Sürücü" screen. Stored in the
 * save (sanitised), previewed in the showroom and worn by the rider model in the cockpit
 * (sleeves and gloves) and in the crash ragdoll.
 */

export type HelmetDesign = 'solid' | 'stripe' | 'twin' | 'checker' | 'flame' | 'chevron';
export type SuitDesign = 'solid' | 'panels' | 'racing' | 'split';
export type VisorTint = 'smoke' | 'clear' | 'iridium' | 'amber' | 'blue';

export interface RiderGear {
  /** Name shown on the profile card (max 16 characters). */
  name: string;
  /** True: colours follow the bike's factory livery (the default look). */
  follow: boolean;
  helmet: { base: string; accent: string; design: HelmetDesign; visor: VisorTint };
  suit: { base: string; accent: string; design: SuitDesign };
  gloves: { base: string; accent: string };
  boots: string;
}

export const HELMET_DESIGNS: readonly { id: HelmetDesign; label: string }[] = [
  { id: 'solid', label: 'Düz' },
  { id: 'stripe', label: 'Şerit' },
  { id: 'twin', label: 'Çift şerit' },
  { id: 'checker', label: 'Damalı' },
  { id: 'flame', label: 'Alev' },
  { id: 'chevron', label: 'Ok başı' },
];

export const SUIT_DESIGNS: readonly { id: SuitDesign; label: string }[] = [
  { id: 'solid', label: 'Düz' },
  { id: 'panels', label: 'Paneller' },
  { id: 'racing', label: 'Yarış şeritleri' },
  { id: 'split', label: 'İki renkli' },
];

export const VISOR_TINTS: readonly { id: VisorTint; label: string; color: string }[] = [
  { id: 'smoke', label: 'Füme', color: '#1a1d22' },
  { id: 'clear', label: 'Şeffaf', color: '#9fb4c4' },
  { id: 'iridium', label: 'İridyum', color: '#5b8bd9' },
  { id: 'amber', label: 'Amber', color: '#c98a1c' },
  { id: 'blue', label: 'Mavi', color: '#2a63c9' },
];

export const GEAR_SWATCHES: readonly string[] = [
  '#f2f2f2', '#15171b', '#8b9099', '#e11d2a', '#ff5a1f', '#ffb020', '#f5e033', '#34c759',
  '#0f7a4a', '#19b5c9', '#2a63c9', '#14307a', '#7a3ff2', '#d63fa1', '#7a1226', '#6b4a2b',
];

export const MAX_NAME = 16;
const HEX = /^#[0-9a-fA-F]{6}$/;

export function defaultGear(): RiderGear {
  return {
    name: 'Sürücü',
    follow: true,
    helmet: { base: '#e11d2a', accent: '#f2f2f2', design: 'stripe', visor: 'smoke' },
    suit: { base: '#15171b', accent: '#e11d2a', design: 'panels' },
    gloves: { base: '#15171b', accent: '#e11d2a' },
    boots: '#15171b',
  };
}

/** Ready-made sets shown as one-tap presets. `follow` is always false: choosing one means "use these colours". */
export const GEAR_PRESETS: readonly { id: string; label: string; gear: Omit<RiderGear, 'name'> }[] = [
  {
    id: 'racer',
    label: 'Yarışçı',
    gear: {
      follow: false,
      helmet: { base: '#f2f2f2', accent: '#e11d2a', design: 'stripe', visor: 'smoke' },
      suit: { base: '#f2f2f2', accent: '#e11d2a', design: 'racing' },
      gloves: { base: '#15171b', accent: '#e11d2a' },
      boots: '#15171b',
    },
  },
  {
    id: 'night',
    label: 'Gece Yolcusu',
    gear: {
      follow: false,
      helmet: { base: '#15171b', accent: '#19b5c9', design: 'twin', visor: 'iridium' },
      suit: { base: '#15171b', accent: '#19b5c9', design: 'panels' },
      gloves: { base: '#15171b', accent: '#19b5c9' },
      boots: '#15171b',
    },
  },
  {
    id: 'sunset',
    label: 'Gün Batımı',
    gear: {
      follow: false,
      helmet: { base: '#ff5a1f', accent: '#ffb020', design: 'flame', visor: 'amber' },
      suit: { base: '#15171b', accent: '#ff5a1f', design: 'split' },
      gloves: { base: '#15171b', accent: '#ffb020' },
      boots: '#15171b',
    },
  },
  {
    id: 'forest',
    label: 'Karadeniz',
    gear: {
      follow: false,
      helmet: { base: '#0f7a4a', accent: '#f5e033', design: 'chevron', visor: 'smoke' },
      suit: { base: '#0f7a4a', accent: '#15171b', design: 'panels' },
      gloves: { base: '#15171b', accent: '#f5e033' },
      boots: '#15171b',
    },
  },
  {
    id: 'royal',
    label: 'Kraliyet',
    gear: {
      follow: false,
      helmet: { base: '#14307a', accent: '#ffb020', design: 'twin', visor: 'blue' },
      suit: { base: '#14307a', accent: '#ffb020', design: 'racing' },
      gloves: { base: '#14307a', accent: '#ffb020' },
      boots: '#15171b',
    },
  },
  {
    id: 'neon',
    label: 'Neon',
    gear: {
      follow: false,
      helmet: { base: '#7a3ff2', accent: '#34c759', design: 'checker', visor: 'iridium' },
      suit: { base: '#15171b', accent: '#7a3ff2', design: 'split' },
      gloves: { base: '#7a3ff2', accent: '#34c759' },
      boots: '#15171b',
    },
  },
  {
    id: 'stealth',
    label: 'Gölge',
    gear: {
      follow: false,
      helmet: { base: '#15171b', accent: '#8b9099', design: 'solid', visor: 'smoke' },
      suit: { base: '#15171b', accent: '#8b9099', design: 'solid' },
      gloves: { base: '#15171b', accent: '#8b9099' },
      boots: '#15171b',
    },
  },
  {
    id: 'classic',
    label: 'Klasik',
    gear: {
      follow: false,
      helmet: { base: '#f2f2f2', accent: '#6b4a2b', design: 'stripe', visor: 'clear' },
      suit: { base: '#6b4a2b', accent: '#f2f2f2', design: 'panels' },
      gloves: { base: '#6b4a2b', accent: '#f2f2f2' },
      boots: '#6b4a2b',
    },
  },
];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const color = (v: unknown, def: string): string => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : def);
const oneOf = <T extends string>(v: unknown, opts: readonly { id: T }[], def: T): T => (typeof v === 'string' && opts.some((o) => o.id === v) ? (v as T) : def);

/** Clean a display name: printable characters only, trimmed, at most MAX_NAME characters. */
export function sanitizeName(v: unknown, def = defaultGear().name): string {
  if (typeof v !== 'string') return def;
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
  return s.length > 0 ? s : def;
}

/** Validate untrusted JSON into well-formed gear; never throws. */
export function sanitizeGear(raw: unknown): RiderGear {
  const d = defaultGear();
  if (!isObj(raw)) return d;
  const hm = isObj(raw.helmet) ? raw.helmet : {};
  const su = isObj(raw.suit) ? raw.suit : {};
  const gl = isObj(raw.gloves) ? raw.gloves : {};
  return {
    name: sanitizeName(raw.name, d.name),
    follow: typeof raw.follow === 'boolean' ? raw.follow : d.follow,
    helmet: {
      base: color(hm.base, d.helmet.base),
      accent: color(hm.accent, d.helmet.accent),
      design: oneOf(hm.design, HELMET_DESIGNS, d.helmet.design),
      visor: oneOf(hm.visor, VISOR_TINTS, d.helmet.visor),
    },
    suit: { base: color(su.base, d.suit.base), accent: color(su.accent, d.suit.accent), design: oneOf(su.design, SUIT_DESIGNS, d.suit.design) },
    gloves: { base: color(gl.base, d.gloves.base), accent: color(gl.accent, d.gloves.accent) },
    boots: color(raw.boots, d.boots),
  };
}

/** Deep copy (the UI edits a draft, the save keeps the committed value). */
export function cloneGear(g: RiderGear): RiderGear {
  return { ...g, helmet: { ...g.helmet }, suit: { ...g.suit }, gloves: { ...g.gloves } };
}

/** A random but tasteful combination (two or three colours from the swatch palette). */
export function randomGear(base: RiderGear, rnd: () => number = Math.random): RiderGear {
  const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length) % a.length];
  const a = pick(GEAR_SWATCHES);
  const b = pick(GEAR_SWATCHES.filter((c) => c !== a));
  const dark = '#15171b';
  return {
    ...cloneGear(base),
    follow: false,
    helmet: { base: a, accent: b, design: pick(HELMET_DESIGNS).id, visor: pick(VISOR_TINTS).id },
    suit: { base: rnd() < 0.5 ? dark : a, accent: b, design: pick(SUIT_DESIGNS).id },
    gloves: { base: rnd() < 0.6 ? dark : a, accent: b },
    boots: dark,
  };
}

/** Do two gear sets look the same (ignoring the name)? */
export function sameLook(a: RiderGear, b: RiderGear): boolean {
  return JSON.stringify({ ...a, name: '' }) === JSON.stringify({ ...b, name: '' });
}
