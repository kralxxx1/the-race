import type { SettingDef } from '../settings/schema';

/**
 * Interface options: HUD layout and elements, touch controls, menu behaviour and accessibility.
 * Everything here is applied by `applyUiSettings` (CSS classes / variables on the document root)
 * or read directly by the HUD, the gauge, the showroom and the menu code; see docs/dev/UI.md.
 */

const pct = (v: number): string => `${Math.round(v)}%`;

const HUD_LAYOUT = 'HUD yerleşimi';
const HUD_ITEMS = 'HUD öğeleri';
const GAUGE = 'Gösterge';
const TOUCH = 'Dokunmatik kontroller';
const MENU = 'Menü ve garaj';

const hudToggle = (key: string, label: string, help: string, def = true, group = HUD_ITEMS): SettingDef => ({
  key,
  category: 'hud',
  group,
  label,
  help,
  type: 'toggle',
  default: def,
});

export const UI_SETTINGS: SettingDef[] = [
  {
    key: 'hud.units',
    category: 'hud',
    group: 'Birimler',
    label: 'Hız birimi',
    type: 'select',
    options: [
      { value: 'kmh', label: 'km/s' },
      { value: 'mph', label: 'mph' },
    ],
    default: 'kmh',
  },
  {
    key: 'hud.showFps',
    category: 'hud',
    group: 'Performans',
    label: 'FPS göstergesi',
    type: 'toggle',
    default: false,
  },

  // ── HUD layout ──
  { key: 'hud.scale', category: 'hud', group: HUD_LAYOUT, label: 'HUD boyutu', help: 'Puan, süre, görev paneli ve bildirimlerin boyutu.', type: 'slider', min: 70, max: 150, step: 5, format: pct, default: 100 },
  { key: 'hud.opacity', category: 'hud', group: HUD_LAYOUT, label: 'HUD saydamlığı', help: 'Düşük değerler manzarayı daha az kapatır.', type: 'slider', min: 30, max: 100, step: 5, format: pct, default: 100 },
  { key: 'hud.margin', category: 'hud', group: HUD_LAYOUT, label: 'Ekran kenar boşluğu', help: 'Çentikli veya kenarı kesilen ekranlarda HUD’u içeri çeker.', type: 'slider', min: 0, max: 48, step: 2, unit: ' px', default: 0 },
  {
    key: 'hud.layout',
    category: 'hud',
    group: HUD_LAYOUT,
    label: 'HUD düzeni',
    help: 'Klasik: puan solda, gösterge sağda. Ortalı: bilgiler üstte, gösterge altta ortada.',
    type: 'select',
    options: [
      { value: 'classic', label: 'Klasik' },
      { value: 'center', label: 'Ortalı' },
      { value: 'minimal', label: 'Sade' },
    ],
    default: 'classic',
  },

  // ── Gauge ──
  {
    key: 'hud.gaugeStyle',
    category: 'hud',
    group: GAUGE,
    label: 'Gösterge tipi',
    help: 'Kadran: analog devir saati. Çubuk: yatay devir çubuğu. Dijital: yalnız hız ve vites.',
    type: 'select',
    options: [
      { value: 'dial', label: 'Kadran' },
      { value: 'bar', label: 'Çubuk' },
      { value: 'digital', label: 'Dijital' },
    ],
    default: 'dial',
  },
  { key: 'hud.gaugeScale', category: 'hud', group: GAUGE, label: 'Gösterge boyutu', type: 'slider', min: 60, max: 150, step: 5, format: pct, default: 100 },
  hudToggle('hud.showGear', 'Vites göstergesi', 'Göstergenin ortasındaki vites harfi/numarası.', true, GAUGE),
  hudToggle('hud.shiftLights', 'Vites ışıkları', 'Devir sınırına yaklaşırken yanan LED’ler (elektrikli motorlarda yoktur).', true, GAUGE),
  hudToggle('hud.showRpm', 'Devir ibresi', 'Kapalıyken yalnızca hız ve vites görünür.', true, GAUGE),

  // ── HUD items ──
  hudToggle('hud.showScore', 'Puan', 'Sol üstteki puan sayacı.'),
  hudToggle('hud.showDistance', 'Mesafe ve kıl payı sayacı', 'Puanın altındaki mesafe ve kıl payı sayısı.'),
  hudToggle('hud.showCombo', 'Kombo rozeti', 'Çarpanı gösteren turuncu rozet.'),
  hudToggle('hud.popups', 'Kıl payı bildirimleri', 'Ekran ortasında beliren “KIL PAYI!” ve kilometre yazıları.'),
  hudToggle('hud.chips', 'Durum rozetleri', 'Ters yön, wheelie, rüzgar tüneli ve 100+ hız bonusu rozetleri.'),
  hudToggle('hud.showBest', 'Rekor yazısı', 'Süre alanının altındaki en iyi skor.'),
  hudToggle('hud.hints', 'Kontrol ipuçları', 'Sürüşün başında kısa süre görünen tuş listesi.'),
  hudToggle('hud.buttons', 'Kamera ve duraklat düğmeleri', 'Sağ üstteki düğmeler. Esc / Start ile duraklatma her zaman çalışır.'),

  // ── Touch ──
  { key: 'hud.touchScale', category: 'hud', group: TOUCH, label: 'Dokunmatik düğme boyutu', type: 'slider', min: 70, max: 140, step: 5, format: pct, default: 100 },
  { key: 'hud.touchOpacity', category: 'hud', group: TOUCH, label: 'Dokunmatik düğme saydamlığı', type: 'slider', min: 20, max: 100, step: 5, format: pct, default: 100 },
  {
    key: 'hud.touchLayout',
    category: 'hud',
    group: TOUCH,
    label: 'Düğme düzeni',
    help: 'Solak düzende gaz ve fren solda, direksiyon sağdadır.',
    type: 'select',
    options: [
      { value: 'right', label: 'Sağ elini gazda' },
      { value: 'left', label: 'Solak' },
    ],
    default: 'right',
  },
  hudToggle('hud.touchLabels', 'Düğme yazıları', 'GAZ, FREN gibi etiketleri gösterir.', true, TOUCH),
  hudToggle('hud.touchHaptics', 'Titreşimli geri bildirim', 'Dokunduğunda kısa titreşim (destekleyen telefonlarda).', true, TOUCH),

  // ── Menu & garage ──
  hudToggle('ui.menuSounds', 'Menü sesleri', 'Düğmelerin üzerine gelince ve tıklayınca çıkan sesler.', true, MENU),
  hudToggle('ui.tips', 'İpucu ve haber bandı', 'Ana menüde dönen ipuçları ve oyun haberleri.', true, MENU),
  hudToggle('ui.navHints', 'Klavye / oyun kolu ipuçları', 'Menü altında tuş ve düğme kısayollarını gösterir.', true, MENU),
  {
    key: 'ui.showroomMotion',
    category: 'hud',
    group: MENU,
    label: 'Showroom dönüşü',
    help: 'Menüde ve garajda motorun plakada kendiliğinden dönme hızı.',
    type: 'select',
    options: [
      { value: 'off', label: 'Kapalı' },
      { value: 'slow', label: 'Yavaş' },
      { value: 'normal', label: 'Normal' },
    ],
    default: 'slow',
  },
  {
    key: 'ui.showroomLight',
    category: 'hud',
    group: MENU,
    label: 'Stüdyo ışığı',
    help: 'Showroom ışıklarının rengi ve sıcaklığı.',
    type: 'select',
    options: [
      { value: 'studio', label: 'Stüdyo' },
      { value: 'warm', label: 'Sıcak' },
      { value: 'cool', label: 'Soğuk' },
      { value: 'neon', label: 'Neon' },
    ],
    default: 'studio',
  },
  {
    key: 'ui.thumbnails',
    category: 'hud',
    group: MENU,
    label: 'Garaj küçük resimleri',
    help: 'Motosikletlerin küçük resimlerini 3B modelden çizer. Otomatik: Düşük grafik ön ayarında kapalıdır.',
    type: 'select',
    options: [
      { value: 'auto', label: 'Otomatik' },
      { value: 'on', label: 'Açık' },
      { value: 'off', label: 'Kapalı' },
    ],
    default: 'auto',
    advanced: true,
  },
  hudToggle('ui.confirmQuit', 'Çıkışta onay iste', 'Ana menüye dönerken ve yeniden başlarken “emin misin?” sorar.', true, MENU),

  // ── Accessibility ──
  { key: 'a11y.contrast', category: 'accessibility', group: 'Görünüm', label: 'Yüksek kontrast', help: 'Daha koyu zemin, daha parlak metin ve kalın çerçeveler.', type: 'toggle', default: false },
  {
    key: 'a11y.textScale',
    category: 'accessibility',
    group: 'Görünüm',
    label: 'Menü metin boyutu',
    type: 'select',
    options: [
      { value: '100', label: '100%' },
      { value: '115', label: '115%' },
      { value: '130', label: '130%' },
      { value: '150', label: '150%' },
    ],
    default: '100',
  },
  { key: 'a11y.hudOutline', category: 'accessibility', group: 'Görünüm', label: 'HUD yazılarına kontur', help: 'Parlak zeminlerde (kar, çöl) okunurluğu artırır.', type: 'toggle', default: false },
  {
    key: 'a11y.colorBlind',
    category: 'accessibility',
    group: 'Renk',
    label: 'Renk körlüğü paleti',
    help: 'HUD ve menülerdeki kırmızı/yeşil ayrımını mavi/turuncu/sarı ile değiştirir.',
    type: 'select',
    options: [
      { value: 'off', label: 'Kapalı' },
      { value: 'protan', label: 'Protanopi (kırmızı)' },
      { value: 'deutan', label: 'Deuteranopi (yeşil)' },
      { value: 'tritan', label: 'Tritanopi (mavi)' },
    ],
    default: 'off',
  },
  { key: 'a11y.reduceMotion', category: 'accessibility', group: 'Hareket', label: 'Arayüz animasyonlarını azalt', help: 'Menü geçişleri, kayan bantlar ve sayaç animasyonları kapanır.', type: 'toggle', default: false },
  { key: 'a11y.reduceFlash', category: 'accessibility', group: 'Hareket', label: 'Yanıp sönmeleri azalt', help: 'Titreyen uyarılar ve vurgu animasyonları sabit renge döner.', type: 'toggle', default: false },
  {
    key: 'a11y.focusRing',
    category: 'accessibility',
    group: 'Gezinme',
    label: 'Odak çerçevesi',
    help: 'Otomatik: yalnızca klavye / oyun koluyla gezinirken görünür.',
    type: 'select',
    options: [
      { value: 'auto', label: 'Otomatik' },
      { value: 'always', label: 'Her zaman' },
    ],
    default: 'auto',
  },
  { key: 'a11y.largeTargets', category: 'accessibility', group: 'Gezinme', label: 'Büyük dokunma alanları', help: 'Düğmeleri ve listeleri parmakla basmak için büyütür.', type: 'toggle', default: false },
];
