/**
 * Inline SVG icon set (24×24, stroke = currentColor). Icons are decorative: they sit next to a
 * Turkish text label, so they are hidden from assistive technology.
 */
const P: Record<string, string> = {
  play: '<path d="M8 5v14l11-7z" fill="currentColor"/>',
  career: '<path d="M5 21V4"/><path d="M5 4h12l-2.5 4L17 12H5"/>',
  road: '<path d="M8 3 4 21M16 3l4 18M12 4v3M12 10v4M12 17v3"/>',
  garage: '<path d="M3 10 12 4l9 6v10H3z"/><path d="M8 20v-6h8v6M8 17h8"/>',
  helmet: '<path d="M3.5 15a8.5 8.5 0 0 1 17 0v3.5h-17z"/><path d="M3.5 15h10l3-4.5h4"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4M12 13v4M8 21h8M10 17h4"/>',
  chart: '<path d="M4 20V4M4 20h16"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
  podium: '<path d="M3 20h18M4 20v-6h5v6M9 20V8h6v12M15 20v-9h5v9"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  starFill: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" fill="currentColor"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M14.5 9.2c-.6-.8-1.5-1.2-2.6-1.2-1.5 0-2.6.8-2.6 2s1 1.7 2.7 2.1c1.8.4 2.8.9 2.8 2.1S13.700 16 12.200 16c-1.200 0-2.200-.5-2.800-1.400M12 6.500V8M12 16v1.500"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13M12 8C9.500 8 7.500 7 7.500 5.300S10.500 3.500 12 8c1.500-4.500 4.500-3.700 4.500-2.700S14.500 8 12 8"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.500v2.500M12 19v2.500M2.500 12H5M19 12h2.500M5.300 5.300l1.800 1.800M16.900 16.900l1.800 1.800M5.300 18.700l1.800-1.800M16.900 7.100l1.800-1.800"/>',
  moon: '<path d="M20 14.500A8 8 0 0 1 9.500 4 8 8 0 1 0 20 14.500z"/>',
  dawn: '<path d="M3 18h18M6 18a6 6 0 0 1 12 0M12 5v3M4.500 9.500 6.500 11.500M19.500 9.500 17.500 11.500"/>',
  sunset: '<path d="M3 18h18M6 18a6 6 0 0 1 12 0M12 8V5l-2 2M12 5l2 2M4.500 12 6.500 13.500M19.500 12 17.500 13.500"/>',
  cloud: '<path d="M7 18a4 4 0 0 1-.5-8A5.500 5.500 0 0 1 17 8.500 4.800 4.800 0 0 1 17 18z"/>',
  rain: '<path d="M7 14a4 4 0 0 1-.5-8A5.500 5.500 0 0 1 17 4.500 4.800 4.800 0 0 1 17 14z"/><path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3"/>',
  fog: '<path d="M7 12a4 4 0 0 1-.5-7A5.500 5.500 0 0 1 17 3.500 4.800 4.800 0 0 1 17 12z"/><path d="M4 15h16M6 18.500h12M9 22h6"/>',
  snow: '<path d="M12 2v20M3.300 7 20.700 17M3.300 17 20.700 7M9.500 3.500 12 6l2.500-2.500M9.500 20.500 12 18l2.500 2.500"/>',
  clear: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.600 5.600 7 7M17 17l1.400 1.400M5.600 18.400 7 17M17 7l1.400-1.400"/>',
  infinity: '<path d="M7 8a4 4 0 1 0 0 8c4 0 6-8 10-8a4 4 0 1 1 0 8c-4 0-6-8-10-8z"/>',
  twoway: '<path d="M7 20V4M7 4 4 8M7 4l3 4M17 4v16M17 20l-3-4M17 20l3-4"/>',
  timer: '<circle cx="12" cy="13.500" r="7.500"/><path d="M12 9.500v4l2.800 1.800M9.500 2.500h5M12 2.500V6"/>',
  bike: '<circle cx="5.500" cy="16.500" r="3.500"/><circle cx="18.500" cy="16.500" r="3.500"/><path d="M5.500 16.500 9 9h4.500l5 7.500M8.500 9 7.500 6.500H10M11 13h5"/>',
  speed: '<path d="M4 18a8 8 0 1 1 16 0"/><path d="m12 18 4.200-6M12 6.500v1.500M6.200 9l1.200 1M17.800 9l-1.200 1"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  weight: '<path d="M6.500 20h11l-1.800-11h-7.400z"/><circle cx="12" cy="5.500" r="2.200"/>',
  engine: '<path d="M4 10h3V7h5v3h3l2 2v5H7l-3-3zM2 11v5M20 13v3M9 5h3"/>',
  gearbox: '<circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/><path d="M6 8v8M18 8v8M6 12h12"/>',
  compare: '<path d="M8 3v18M16 3v18M3 8h5M16 16h5M3 16h5M16 8h5"/>',
  search: '<circle cx="11" cy="11" r="6.500"/><path d="m20 20-4.200-4.200"/>',
  sort: '<path d="M4 6h9M4 12h6M4 18h3M17 6v12m0 0-3-3m3 3 3-3"/>',
  filter: '<path d="M3 5h18l-7 8.500V20l-4-2v-4.500z"/>',
  close: '<path d="M5.500 5.500l13 13M18.500 5.500l-13 13"/>',
  check: '<path d="m5 12.500 4.500 4.500L19 7.500"/>',
  left: '<path d="m15 5-7 7 7 7"/>',
  right: '<path d="m9 5 7 7-7 7"/>',
  up: '<path d="m5 15 7-7 7 7"/>',
  down: '<path d="m5 9 7 7 7-7"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.500v.5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.500 9.500a2.500 2.500 0 1 1 3.500 2.300c-.7.400-1 1-1 1.700M12 17v.5"/>',
  volume: '<path d="M4 9.500h4L13 5.500v13l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.500 6.500a8 8 0 0 1 0 11"/>',
  eye: '<path d="M2 12s3.500-7 10-7 10 7 10 7-3.500 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  camera: '<path d="M4 8h3l1.500-2.500h7L17 8h3v11H4z"/><circle cx="12" cy="13.500" r="3.500"/>',
  hud: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/>',
  access: '<circle cx="12" cy="4.500" r="2"/><path d="M5 8l7 1.500L19 8M12 9.500V15l-3 6M12 15l3 6"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  sparkle: '<path d="M11 3l1.800 5.200L18 10l-5.200 1.800L11 17l-1.800-5.200L4 10l5.200-1.800zM19 15l.8 2.200L22 18l-2.200.8L19 21l-.8-2.200L16 18l2.200-.8z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  pad: '<rect x="2" y="7.500" width="20" height="10" rx="5"/><path d="M7 10.500v4M5 12.500h4M16 11.500h.01M18.500 13.500h.01"/>',
  wheel: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="M3 12h7M14 12h7M12 14v7"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  touch: '<path d="M9 11V5a1.500 1.500 0 0 1 3 0v5l5 1.500a2 2 0 0 1 1.500 2.500L17.500 20H10l-4-5.500a1.500 1.500 0 0 1 2.300-1.800z"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.500-5.800M4 4v4.500h4.500"/>',
  retry: '<path d="M20 12a8 8 0 1 1-2.500-5.800M20 4v4.500h-4.500"/>',
  home: '<path d="M4 11 12 4l8 7M6 10v10h12V10"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="3.500"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  calendar: '<rect x="3.500" y="5" width="17" height="15" rx="2"/><path d="M3.500 10h17M8 3v4M16 3v4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  cone: '<path d="M12 3 7 19h10zM4 21h16M9 12h6"/>',
  route: '<circle cx="6" cy="18" r="2.500"/><circle cx="18" cy="6" r="2.500"/><path d="M8.500 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.500"/>',
  mountain: '<path d="m2 20 7-12 4 7 3-4 6 9z"/>',
  car: '<path d="M4 16v-4l2-5h12l2 5v4zM4 16v2.500M20 16v2.500M7 13h.01M17 13h.01"/>',
  tree: '<path d="M12 21v-5M12 3 6.500 11h3L5.500 17h13l-4-6h3z"/>',
  fire: '<path d="M12 3c1 3.500 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 .3 1.500 1 2 1.500 2C10 8 10.500 5 12 3z"/>',
  wrench: '<path d="M14.500 6.500a4 4 0 0 0 5 5L21 13l-8 8a2.100 2.100 0 0 1-3-3l8-8z"/>',
  brake: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 4v2M20 12h-2M12 20v-2M4 12h2"/>',
  steer: '<path d="M3 9h18M12 9v3M6 9l-2 5M18 9l2 5"/><circle cx="12" cy="16" r="3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.500 4-6.500 8-6.500s7 2 8 6.500"/>',
  glove: '<path d="M7 20V10l-2-3a1.500 1.500 0 0 1 2.500-1.500L9 8V4a1.500 1.500 0 0 1 3 0v4V3a1.500 1.500 0 0 1 3 0v5V4.500a1.500 1.500 0 0 1 3 0V14l-1 6z"/>',
  suit: '<path d="M8 3 3 6l2 5 3-1v11h8V10l3 1 2-5-5-3-2 3h-4z"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.500 8.500h.01M15.500 8.500h.01M12 12h.01M8.500 15.500h.01M15.500 15.500h.01"/>',
  save: '<path d="M5 3h12l3 3v15H5z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/>',
  rotate: '<path d="M4 12a8 8 0 0 1 14-5.300M20 12a8 8 0 0 1-14 5.300M18 3v4h-4M6 21v-4h4"/>',
  zoomIn: '<circle cx="11" cy="11" r="6.500"/><path d="m20 20-4.200-4.200M8.500 11h5M11 8.500v5"/>',
  zoomOut: '<circle cx="11" cy="11" r="6.500"/><path d="m20 20-4.200-4.200M8.500 11h5"/>',
  side: '<circle cx="6" cy="16" r="3"/><circle cx="18" cy="16" r="3"/><path d="M6 16 10 9h4l4 7M9 12h7"/>',
  front: '<path d="M12 3v7M9 10h6l1 10H8zM6 8h3M15 8h3"/>',
  rear: '<path d="M12 4v5M8 9h8l1 11H7zM10 14h4"/>',
  cockpit: '<path d="M3 17c2-6 5-9 9-9s7 3 9 9M7 17v-3h10v3M12 8V5"/>',
  battery: '<rect x="3" y="8" width="16" height="9" rx="2"/><path d="M21 11v3M7 11v3M11 11v3"/>',
  news: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h10M7 17h6"/>',
  tip: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.500 10.900c.700.600 1 1.300 1 2.100h5c0-.8.300-1.500 1-2.100A6 6 0 0 0 12 3z"/>',
  warn: '<path d="M12 3 2.500 20h19zM12 10v5M12 17.500v.5"/>',
};

export type IconName = keyof typeof P;

/** SVG markup for an icon (unknown names render an empty box). */
export function iconSvg(name: string, size = 20): string {
  const body = P[name] ?? '';
  return `<svg class="ico" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

/** DOM element wrapping an icon. */
export function icon(name: string, size = 20): HTMLElement {
  const s = document.createElement('span');
  s.className = 'ico-wrap';
  s.innerHTML = iconSvg(name, size);
  return s;
}

export const ICON_NAMES: readonly string[] = Object.keys(P);
