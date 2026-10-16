import * as THREE from 'three';

/**
 * Painted road signs: Turkish motorway guide signs (green, white text), blue facility
 * signs, neon shop signs and billboards. Canvas-drawn per request; callers own (and dispose)
 * the textures. In environments without a DOM (unit tests) a 1×1 texture is returned.
 */

export interface SignDest {
  name: string;
  /** Distance in km, or null for none. */
  km: number | null;
  /** Arrow glyph to the left of the name (↑ ← → ↗). */
  arrow?: string;
}

const hasDom = (): boolean => typeof document !== 'undefined';

function stub(): THREE.Texture {
  const t = new THREE.DataTexture(new Uint8Array([20, 110, 70, 255]), 1, 1, THREE.RGBAFormat);
  t.needsUpdate = true;
  t.userData.owned = true;
  return t;
}

function finish(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.userData.owned = true;
  return t;
}

/** Turkish motorway (otoyol) green guide sign: route badge, destination lines with distances. */
export function highwaySignTexture(dests: readonly SignDest[], route = 'O-31', w = 1024, h = 320): THREE.Texture {
  if (!hasDom()) return stub();
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  // Panel: otoyol green with a white border and rounded corners.
  g.fillStyle = '#0a6b45';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#f4f6f2';
  g.lineWidth = 9;
  g.strokeRect(10, 10, w - 20, h - 20);
  // Route badge (E-route in a white-rimmed box).
  g.fillStyle = '#f4f6f2';
  g.fillRect(34, 34, 150, 72);
  g.fillStyle = '#0a6b45';
  g.font = '700 54px "Arial Narrow", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(route, 109, 72);
  const rows = Math.min(dests.length, 3);
  const rowH = (h - 70) / Math.max(rows, 1);
  g.textBaseline = 'middle';
  for (let i = 0; i < rows; i++) {
    const d = dests[i];
    const y = 40 + rowH * (i + 0.5) + (i === 0 ? 10 : 0);
    g.fillStyle = '#f4f6f2';
    g.textAlign = 'left';
    const size = Math.min(104, rowH * 0.82);
    g.font = `700 ${size}px "Arial Narrow", Arial, sans-serif`;
    g.fillText(d.name, d.arrow ? 280 : 230, y);
    if (d.arrow) {
      g.font = `700 ${size * 1.1}px Arial, sans-serif`;
      g.textAlign = 'center';
      g.fillText(d.arrow, 235, y);
    }
    if (d.km !== null) {
      g.textAlign = 'right';
      g.font = `700 ${size * 0.8}px "Arial Narrow", Arial, sans-serif`;
      g.fillText(`${d.km} km`, w - 44, y);
    }
  }
  return finish(c);
}

/** Small blue information sign (parking, rest area, exit number). */
export function infoSignTexture(title: string, sub: string, w = 512, h = 256): THREE.Texture {
  if (!hasDom()) return stub();
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#12489d';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#f5f7fb';
  g.lineWidth = 8;
  g.strokeRect(8, 8, w - 16, h - 16);
  g.fillStyle = '#f5f7fb';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '700 84px Arial, sans-serif';
  g.fillText(title, w / 2, h * 0.38);
  g.font = '600 52px Arial, sans-serif';
  g.fillText(sub, w / 2, h * 0.72);
  return finish(c);
}

/** Brown tourist/landmark sign. */
export function brownSignTexture(title: string, sub: string, w = 512, h = 192): THREE.Texture {
  if (!hasDom()) return stub();
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#6b3a1c';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#f5ede0';
  g.lineWidth = 7;
  g.strokeRect(7, 7, w - 14, h - 14);
  g.fillStyle = '#f5ede0';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '700 64px Arial, sans-serif';
  g.fillText(title, w / 2, h * 0.38);
  g.font = '600 40px Arial, sans-serif';
  g.fillText(sub, w / 2, h * 0.74);
  return finish(c);
}

export interface BillboardStyle {
  bg: string;
  fg: string;
  accent: string;
}

const BILLBOARD_STYLES: BillboardStyle[] = [
  { bg: '#0b2d63', fg: '#ffffff', accent: '#ffcc00' },
  { bg: '#c1121f', fg: '#ffffff', accent: '#ffe066' },
  { bg: '#111418', fg: '#ffffff', accent: '#2dd4bf' },
  { bg: '#f4f1e8', fg: '#14213d', accent: '#e63946' },
  { bg: '#0f5132', fg: '#ffffff', accent: '#ffd166' },
  { bg: '#4a1d96', fg: '#ffffff', accent: '#ff9f1c' },
];

/** Generic advertising billboard with an invented brand (no real marks). */
export function billboardTexture(title: string, tagline: string, style: number, w = 1024, h = 384): THREE.Texture {
  if (!hasDom()) return stub();
  const st = BILLBOARD_STYLES[((style % BILLBOARD_STYLES.length) + BILLBOARD_STYLES.length) % BILLBOARD_STYLES.length];
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, st.bg);
  grad.addColorStop(1, st.bg);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  g.fillStyle = st.accent;
  g.beginPath();
  g.moveTo(w * 0.62, 0);
  g.lineTo(w, 0);
  g.lineTo(w, h);
  g.lineTo(w * 0.78, h);
  g.closePath();
  g.fill();
  g.fillStyle = st.fg;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.font = '800 128px Arial, sans-serif';
  g.fillText(title, 56, h * 0.4);
  g.font = '600 52px Arial, sans-serif';
  g.fillText(tagline, 60, h * 0.76);
  return finish(c);
}

/** Emissive neon-style shop sign on a transparent background. */
export function neonTexture(text: string, color: string, w = 512, h = 160): THREE.Texture {
  if (!hasDom()) return stub();
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, w, h);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '800 96px Arial, sans-serif';
  g.shadowColor = color;
  g.shadowBlur = 24;
  g.fillStyle = color;
  g.fillText(text, w / 2, h / 2);
  g.shadowBlur = 8;
  g.fillStyle = '#ffffff';
  g.fillText(text, w / 2, h / 2);
  return finish(c);
}

/** City names per region used by gantry signs (distance counts down along the road). */
export const REGION_CITIES: Record<string, readonly [string, number][]> = {
  highway: [['İZMİR', 0], ['AYDIN', 120], ['DENİZLİ', 320], ['MANİSA', 38], ['SELÇUK', 76], ['KUŞADASI', 96], ['NAZİLLİ', 180], ['TORBALI', 28]],
  city: [['EDİRNE', 240], ['İSTANBUL', 0], ['KADIKÖY', 14], ['ANKARA', 450], ['İZMİT', 90], ['BEŞİKTAŞ', 8], ['SARIYER', 22], ['BEYLİKDÜZÜ', 36]],
  industrial: [['İZMİT', 12], ['GEBZE', 28], ['DARICA', 34], ['ANKARA', 360], ['İSTANBUL', 52], ['SAKARYA', 78], ['DERİNCE', 6]],
  suburb: [['BURSA', 0], ['YALOVA', 62], ['İNEGÖL', 44], ['MUDANYA', 24], ['GEMLİK', 31], ['MERKEZ', 3]],
  desert: [['KONYA', 0], ['AKSARAY', 150], ['KARAMAN', 100], ['ANKARA', 260], ['EREĞLİ', 90], ['BEYŞEHİR', 70]],
  coast: [['KAŞ', 0], ['ANTALYA', 160], ['KALKAN', 14], ['FETHİYE', 140], ['KAŞ LİMANI', 4]],
  forest: [['RİZE', 0], ['AYDER', 48], ['TRABZON', 76], ['ÇAYELİ', 26], ['PAZAR', 17]],
  snow: [['ERZURUM', 0], ['PALANDÖKEN', 6], ['KARS', 190], ['TRABZON', 300], ['HORASAN', 70]],
};
