import { MAP_BY_ID, type MapId, type TimeOfDay, type Weather } from '../data/maps';

/**
 * Procedural vector illustrations of the eight maps (320×180), tinted by time of day and
 * weather. Used for the quick-ride gallery, the career header, the loading screen and the
 * pause card, so a map looks the same everywhere without shipping image files.
 */

const W = 320;
const H = 180;
const HORIZON = 112;

interface SkyDef {
  top: string;
  mid: string;
  bottom: string;
  /** Overlay darkening the landscape (colour, opacity). */
  tint: [string, number];
  stars: boolean;
}

const SKY: Record<TimeOfDay, SkyDef> = {
  dawn: { top: '#2c3e6e', mid: '#c98f9c', bottom: '#f6c58a', tint: ['#2b2548', 0.28], stars: false },
  day: { top: '#2a68b8', mid: '#7fb0e0', bottom: '#cfe3f3', tint: ['#000000', 0], stars: false },
  sunset: { top: '#2a2f5e', mid: '#d4647a', bottom: '#ffb36b', tint: ['#4a1d2a', 0.3], stars: false },
  night: { top: '#02040b', mid: '#0a1330', bottom: '#1b2447', tint: ['#040818', 0.62], stars: true },
};

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hills(y: number, amp: number, freq: number, phase: number, fill: string, opacity = 1): string {
  let d = `M0,${H} L0,${y}`;
  for (let x = 0; x <= W; x += 8) d += ` L${x},${(y + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 2.3 + phase * 1.7) * amp * 0.4).toFixed(1)}`;
  return `<path d="${d} L${W},${H} Z" fill="${fill}" opacity="${opacity}"/>`;
}

function peaks(y: number, count: number, hMin: number, hMax: number, seed: number, fill: string, cap?: string): string {
  const r = rng(seed);
  let out = '';
  const step = W / count;
  for (let i = 0; i < count + 1; i++) {
    const cx = i * step + (r() - 0.5) * step * 0.6;
    const h = hMin + r() * (hMax - hMin);
    const w = step * (0.8 + r() * 0.6);
    out += `<path d="M${(cx - w).toFixed(1)},${y} L${cx.toFixed(1)},${(y - h).toFixed(1)} L${(cx + w).toFixed(1)},${y} Z" fill="${fill}"/>`;
    if (cap) out += `<path d="M${(cx - w * 0.28).toFixed(1)},${(y - h * 0.72).toFixed(1)} L${cx.toFixed(1)},${(y - h).toFixed(1)} L${(cx + w * 0.28).toFixed(1)},${(y - h * 0.72).toFixed(1)} L${(cx + w * 0.1).toFixed(1)},${(y - h * 0.8).toFixed(1)} L${cx.toFixed(1)},${(y - h * 0.7).toFixed(1)} L${(cx - w * 0.12).toFixed(1)},${(y - h * 0.82).toFixed(1)} Z" fill="${cap}"/>`;
  }
  return out;
}

function pine(x: number, y: number, h: number, fill: string, snow?: string): string {
  const w = h * 0.34;
  let out = `<rect x="${(x - 1).toFixed(1)}" y="${y.toFixed(1)}" width="2" height="${(h * 0.14).toFixed(1)}" fill="#2b1c10"/>`;
  for (let k = 0; k < 3; k++) {
    const ty = y - h * (0.22 + k * 0.26);
    const tw = w * (1 - k * 0.26);
    out += `<path d="M${(x - tw).toFixed(1)},${(ty + h * 0.3).toFixed(1)} L${x.toFixed(1)},${ty.toFixed(1)} L${(x + tw).toFixed(1)},${(ty + h * 0.3).toFixed(1)} Z" fill="${fill}"/>`;
    if (snow) out += `<path d="M${(x - tw * 0.55).toFixed(1)},${(ty + h * 0.13).toFixed(1)} L${x.toFixed(1)},${ty.toFixed(1)} L${(x + tw * 0.55).toFixed(1)},${(ty + h * 0.13).toFixed(1)} Z" fill="${snow}"/>`;
  }
  return out;
}

function roundTree(x: number, y: number, r: number, fill: string): string {
  return `<rect x="${(x - 1).toFixed(1)}" y="${(y - r * 0.4).toFixed(1)}" width="2" height="${(r * 0.9).toFixed(1)}" fill="#3a2a18"/><circle cx="${x.toFixed(1)}" cy="${(y - r).toFixed(1)}" r="${r.toFixed(1)}" fill="${fill}"/>`;
}

function house(x: number, y: number, w: number, h: number, wall: string, roof: string): string {
  return `<rect x="${x}" y="${y - h}" width="${w}" height="${h}" fill="${wall}"/><path d="M${x - 2},${y - h} L${x + w / 2},${y - h - h * 0.55} L${x + w + 2},${y - h} Z" fill="${roof}"/><rect x="${x + w * 0.4}" y="${y - h * 0.55}" width="${w * 0.2}" height="${h * 0.55}" fill="#2a2018" opacity=".6"/>`;
}

function skyline(seed: number, y: number, count: number, hMin: number, hMax: number, fill: string, lit: boolean): string {
  const r = rng(seed);
  let out = '';
  let x = -4;
  for (let i = 0; i < count; i++) {
    const w = 12 + r() * 20;
    const h = hMin + r() * (hMax - hMin);
    out += `<rect x="${x.toFixed(1)}" y="${(y - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${fill}"/>`;
    if (lit) {
      for (let wy = y - h + 4; wy < y - 3; wy += 6) {
        for (let wx = x + 2; wx < x + w - 2; wx += 5) if (r() < 0.45) out += `<rect x="${wx.toFixed(1)}" y="${wy.toFixed(1)}" width="2" height="3" fill="${r() < 0.2 ? '#ff9a3c' : '#ffe9a8'}"/>`;
      }
    }
    if (r() < 0.25) out += `<rect x="${(x + w / 2 - 0.5).toFixed(1)}" y="${(y - h - 8).toFixed(1)}" width="1" height="8" fill="${fill}"/>`;
    x += w + 1 + r() * 3;
    if (x > W) break;
  }
  return out;
}

/** Perspective road with lane dashes; `lanes` controls how wide the carriageway looks. */
function road(lanes: number, asphalt: string, edge: string, verge: string): string {
  const half = 22 + lanes * 14;
  const vx = W / 2;
  let out = `<path d="M0,${H} L${vx - 6},${HORIZON} L${vx + 6},${HORIZON} L${W},${H} Z" fill="${verge}"/>`;
  out += `<path d="M${vx - half},${H} L${vx - 3},${HORIZON} L${vx + 3},${HORIZON} L${vx + half},${H} Z" fill="${asphalt}"/>`;
  out += `<path d="M${vx - half},${H} L${vx - 3},${HORIZON} L${vx - 2.4},${HORIZON} L${vx - half + 3},${H} Z" fill="${edge}"/>`;
  out += `<path d="M${vx + half},${H} L${vx + 3},${HORIZON} L${vx + 2.4},${HORIZON} L${vx + half - 3},${H} Z" fill="${edge}"/>`;
  for (let k = 1; k < lanes; k++) {
    const t = k / lanes;
    const bx = vx - half + 2 * half * t;
    const tx = vx - 3 + 6 * t;
    for (let s = 0; s < 6; s++) {
      const a = 0.12 + s * 0.17;
      const b = a + 0.08;
      const p = (u: number) => [tx + (bx - tx) * u * u, HORIZON + (H - HORIZON) * u * u];
      const [x1, y1] = p(a);
      const [x2, y2] = p(b);
      out += `<path d="M${x1 - 0.3 - a},${y1} L${x1 + 0.3 + a},${y1} L${x2 + 0.3 + b * 1.4},${y2} L${x2 - 0.3 - b * 1.4},${y2} Z" fill="#f2f2f2" opacity=".85"/>`;
    }
  }
  return out;
}

function stars(seed: number): string {
  const r = rng(seed);
  let out = '';
  for (let i = 0; i < 46; i++) out += `<circle cx="${(r() * W).toFixed(1)}" cy="${(r() * 80).toFixed(1)}" r="${(0.3 + r() * 0.8).toFixed(2)}" fill="#fff" opacity="${(0.3 + r() * 0.7).toFixed(2)}"/>`;
  return out;
}

function clouds(seed: number, count: number, fill: string, opacity: number): string {
  const r = rng(seed);
  let out = '';
  for (let i = 0; i < count; i++) {
    const cx = r() * W;
    const cy = 16 + r() * 52;
    const s = 0.7 + r() * 0.9;
    out += `<g opacity="${opacity}" fill="${fill}"><ellipse cx="${cx}" cy="${cy}" rx="${22 * s}" ry="${6 * s}"/><ellipse cx="${cx - 12 * s}" cy="${cy + 2}" rx="${14 * s}" ry="${5 * s}"/><ellipse cx="${cx + 13 * s}" cy="${cy + 1}" rx="${15 * s}" ry="${5.5 * s}"/></g>`;
  }
  return out;
}

let uid = 0;

/** SVG markup for a map under the given time and weather. */
export function mapArtSvg(map: MapId, time: TimeOfDay, weather: Weather): string {
  const id = `ma${++uid}`;
  const sky = SKY[time];
  const night = time === 'night';
  let g = '';
  // Sun / moon
  if (night) g += `<circle cx="244" cy="40" r="11" fill="#e8eefc"/><circle cx="248" cy="37" r="10" fill="${sky.mid}"/>`;
  else if (time === 'day') g += `<circle cx="248" cy="42" r="26" fill="#fff6c8" opacity=".35"/><circle cx="248" cy="42" r="12" fill="#fff3b0"/>`;
  else if (time === 'dawn') g += `<circle cx="70" cy="${HORIZON - 6}" r="30" fill="#ffd9a0" opacity=".4"/><circle cx="70" cy="${HORIZON - 6}" r="13" fill="#ffe6b8"/>`;
  else g += `<circle cx="244" cy="${HORIZON - 10}" r="32" fill="#ff9a5a" opacity=".4"/><circle cx="244" cy="${HORIZON - 10}" r="14" fill="#ffc77a"/>`;
  const cloudy = weather === 'cloudy' || weather === 'rain' || weather === 'snow' || weather === 'fog';
  const cloudColor = weather === 'rain' ? '#5b6573' : weather === 'snow' ? '#aeb7c4' : night ? '#2b3350' : '#ffffff';
  g += clouds(map.length * 7 + 3, cloudy ? 7 : 2, cloudColor, cloudy ? 0.9 : 0.55);

  // Landscape
  const L = (() => {
    switch (map) {
      case 'suburb': {
        let s = hills(HORIZON - 6, 6, 0.03, 1, '#7aa86a') + hills(HORIZON + 2, 5, 0.05, 2, '#5d9a52');
        s += house(22, HORIZON + 4, 20, 12, '#e8dcc6', '#b0472f') + house(60, HORIZON + 2, 16, 10, '#d9e2ea', '#8a3a2a') + house(250, HORIZON + 4, 22, 13, '#f0e2c4', '#a53e2a') + house(284, HORIZON + 2, 18, 11, '#cfd9e0', '#6e3a2e');
        s += roundTree(100, HORIZON + 4, 7, '#3f8a3c') + roundTree(214, HORIZON + 3, 8, '#468f40') + roundTree(8, HORIZON + 10, 10, '#3a7d37') + roundTree(308, HORIZON + 10, 10, '#3d8239');
        return s + road(2, '#3a3d44', '#d8d8d8', '#5f9a4e');
      }
      case 'highway': {
        let s = peaks(HORIZON - 2, 5, 14, 30, 11, '#7d93a3') + hills(HORIZON - 4, 6, 0.04, 0.6, '#8aa05a') + hills(HORIZON + 3, 4, 0.06, 1.8, '#6f8f45');
        for (let i = 0; i < 9; i++) s += roundTree(14 + i * 38, HORIZON + 3 + (i % 3), 4 + (i % 2), '#59753a');
        s += road(4, '#3a3d44', '#e4e4e4', '#80995a');
        s += `<rect x="40" y="62" width="2.5" height="52" fill="#9ea6b0"/><rect x="277" y="62" width="2.5" height="52" fill="#9ea6b0"/><rect x="38" y="62" width="244" height="3" fill="#aab2bc"/><rect x="118" y="66" width="38" height="12" fill="#0b6b3a"/><rect x="166" y="66" width="38" height="12" fill="#0b6b3a"/><rect x="123" y="70" width="28" height="1.6" fill="#fff"/><rect x="171" y="70" width="28" height="1.6" fill="#fff"/>`;
        return s;
      }
      case 'desert': {
        let s = peaks(HORIZON - 1, 4, 10, 22, 21, '#b8774e') + hills(HORIZON - 4, 7, 0.025, 0.4, '#d9985a') + hills(HORIZON + 4, 6, 0.04, 2.4, '#c47f46');
        s += `<path d="M20,${HORIZON + 2} L26,${HORIZON - 16} L56,${HORIZON - 16} L62,${HORIZON + 2} Z" fill="#a8603a"/><path d="M262,${HORIZON + 3} L268,${HORIZON - 12} L290,${HORIZON - 12} L296,${HORIZON + 3} Z" fill="#a8603a"/>`;
        s += `<rect x="86" y="${HORIZON - 18}" width="1.4" height="22" fill="#4a3a2a"/><rect x="82" y="${HORIZON - 17}" width="9" height="1.2" fill="#4a3a2a"/><rect x="230" y="${HORIZON - 14}" width="1.4" height="18" fill="#4a3a2a"/><rect x="227" y="${HORIZON - 13}" width="7" height="1.2" fill="#4a3a2a"/>`;
        return s + road(2, '#4a4642', '#e8dcc0', '#d8a35f');
      }
      case 'city': {
        let s = skyline(5, HORIZON + 2, 14, 22, 58, '#3a4156', night) + skyline(9, HORIZON + 6, 12, 14, 36, '#2b3144', night);
        s += `<rect x="150" y="30" width="3" height="84" fill="#414a64"/><circle cx="151.5" cy="28" r="2.4" fill="#ff4a3a"/>`;
        for (let i = 0; i < 6; i++) s += `<rect x="${24 + i * 54}" y="${HORIZON - 4}" width="1.3" height="12" fill="#2a2f3e"/><circle cx="${24.6 + i * 54}" cy="${HORIZON - 5}" r="2.2" fill="${night ? '#ffb347' : '#999'}"/>`;
        return s + road(3, '#2e3138', '#d8d8d8', '#41465a');
      }
      case 'coast': {
        let s = `<rect x="0" y="${HORIZON - 14}" width="${W}" height="30" fill="#1fa7c4"/><rect x="0" y="${HORIZON - 14}" width="${W}" height="6" fill="#58d0e0" opacity=".6"/>`;
        s += peaks(HORIZON - 12, 3, 8, 14, 31, '#6a8a8f') + hills(HORIZON + 2, 7, 0.035, 3, '#a39a7a') + hills(HORIZON + 8, 5, 0.05, 1, '#8c8566');
        s += `<path d="M20,${HORIZON + 6} L26,${HORIZON - 14} L33,${HORIZON - 14} L39,${HORIZON + 6} Z" fill="#f2f2f2"/><rect x="24" y="${HORIZON - 18}" width="11" height="4" fill="#c33"/>`;
        for (let i = 0; i < 5; i++) s += `<path d="M${40 + i * 3},${HORIZON - 8 + i} q8,-3 16,0" stroke="#fff" stroke-width="0.8" fill="none" opacity=".6"/>`;
        return s + road(2, '#3f4147', '#e8e8e8', '#b7ac84');
      }
      case 'forest': {
        let s = peaks(HORIZON - 1, 6, 16, 34, 41, '#2e5a52') + hills(HORIZON - 3, 5, 0.04, 2, '#1f4a3c');
        const r = rng(7);
        for (let i = 0; i < 26; i++) s += pine(r() * W, HORIZON + 2 + r() * 8, 14 + r() * 20, i % 3 ? '#1a4a30' : '#225a38');
        return s + road(2, '#2f3238', '#cfd6cf', '#1d3b2a') + `<rect x="0" y="${HORIZON - 18}" width="${W}" height="34" fill="#cfe0dc" opacity=".16"/>`;
      }
      case 'snow': {
        let s = peaks(HORIZON, 4, 30, 62, 51, '#8fa6bd', '#ffffff') + hills(HORIZON - 3, 6, 0.04, 1, '#e9f0f6') + hills(HORIZON + 4, 5, 0.05, 2, '#f6f9fc');
        const r = rng(9);
        for (let i = 0; i < 14; i++) s += pine(r() * W, HORIZON + 4 + r() * 6, 12 + r() * 14, '#2f5a4a', '#ffffff');
        return s + road(2, '#5a5f66', '#ffffff', '#eef3f8');
      }
      case 'industrial': {
        let s = hills(HORIZON, 3, 0.05, 1, '#5c6168');
        s += `<rect x="18" y="${HORIZON - 30}" width="46" height="34" fill="#6b7179"/><rect x="24" y="${HORIZON - 50}" width="6" height="22" fill="#7d838b"/><rect x="42" y="${HORIZON - 44}" width="6" height="16" fill="#7d838b"/>`;
        s += `<ellipse cx="27" cy="${HORIZON - 56}" rx="10" ry="5" fill="#cfd4da" opacity=".55"/><ellipse cx="38" cy="${HORIZON - 64}" rx="13" ry="6" fill="#cfd4da" opacity=".4"/>`;
        s += `<circle cx="110" cy="${HORIZON - 8}" r="12" fill="#8a9099"/><rect x="98" y="${HORIZON - 8}" width="24" height="12" fill="#8a9099"/><circle cx="150" cy="${HORIZON - 6}" r="9" fill="#9aa1a9"/><rect x="141" y="${HORIZON - 6}" width="18" height="10" fill="#9aa1a9"/>`;
        s += `<path d="M205,${HORIZON + 4} L205,${HORIZON - 44} L246,${HORIZON - 44}" stroke="#d6a92c" stroke-width="3" fill="none"/><rect x="238" y="${HORIZON - 44}" width="3" height="20" fill="#d6a92c"/><rect x="262" y="${HORIZON - 22}" width="40" height="26" fill="#4a5058"/><rect x="266" y="${HORIZON - 16}" width="14" height="6" fill="#d6842c"/><rect x="284" y="${HORIZON - 16}" width="14" height="6" fill="#2c7fd6"/>`;
        s += road(3, '#34373d', '#e8d9a0', '#4b4f56');
        s += `<path d="M118,${HORIZON - 4} A42,42 0 0 1 202,${HORIZON - 4} L202,${H} L118,${H} Z" fill="none"/>`;
        return s;
      }
      default: {
        // Generic landscape tinted with the map's accent colour until the map has its own art.
        const accent = MAP_BY_ID.get(map)?.color ?? '#7a8a6a';
        const s = peaks(HORIZON - 1, 5, 12, 30, map.length * 13, '#7d8a99') + hills(HORIZON - 3, 6, 0.04, 1, accent) + hills(HORIZON + 4, 5, 0.05, 2, '#6f7f5a');
        return s + road(2, '#3a3d44', '#e4e4e4', '#6f7f5a');
      }
    }
  })();
  g += L;

  // Weather overlays
  let wx = '';
  if (weather === 'rain') {
    const r = rng(77);
    wx += `<rect width="${W}" height="${H}" fill="#1a2433" opacity=".28"/>`;
    for (let i = 0; i < 70; i++) {
      const x = r() * W;
      const y = r() * H;
      wx += `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x - 3).toFixed(1)}" y2="${(y + 9).toFixed(1)}" stroke="#bcd0e6" stroke-width=".7" opacity=".55"/>`;
    }
  } else if (weather === 'fog') {
    wx += `<rect y="${HORIZON - 40}" width="${W}" height="${H - HORIZON + 40}" fill="url(#${id}f)"/><rect width="${W}" height="${H}" fill="#dfe6ec" opacity=".22"/>`;
  } else if (weather === 'snow') {
    const r = rng(78);
    wx += `<rect width="${W}" height="${H}" fill="#dfe8f2" opacity=".14"/>`;
    for (let i = 0; i < 60; i++) wx += `<circle cx="${(r() * W).toFixed(1)}" cy="${(r() * H).toFixed(1)}" r="${(0.7 + r() * 1.3).toFixed(1)}" fill="#fff" opacity="${(0.5 + r() * 0.5).toFixed(2)}"/>`;
  }

  return `<svg class="map-art" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
<defs>
<linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky.top}"/><stop offset=".6" stop-color="${sky.mid}"/><stop offset="1" stop-color="${sky.bottom}"/></linearGradient>
<linearGradient id="${id}f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e6ecf1" stop-opacity="0"/><stop offset="1" stop-color="#e6ecf1" stop-opacity=".8"/></linearGradient>
<linearGradient id="${id}v" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#${id}s)"/>
${sky.stars ? stars(map.length) : ''}
${g}
<rect width="${W}" height="${H}" fill="${sky.tint[0]}" opacity="${sky.tint[1]}" style="mix-blend-mode:multiply"/>
${wx}
<rect width="${W}" height="${H}" fill="url(#${id}v)"/>
</svg>`;
}

/** DOM wrapper for an illustration (fills its parent). */
export function mapArt(map: MapId, time: TimeOfDay, weather: Weather, cls = ''): HTMLElement {
  const el = document.createElement('div');
  el.className = `map-art-wrap ${cls}`.trim();
  el.innerHTML = mapArtSvg(map, time, weather);
  return el;
}
