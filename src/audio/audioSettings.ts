import type { SettingDef } from '../settings/schema';

const pct = (v: number): string => `${Math.round(v * 100)}%`;
const db = (v: number): string => `${v > 0 ? '+' : ''}${v.toFixed(0)} dB`;

const LEVELS = 'Ses seviyeleri';
const ENGINE = 'Motor';
const WORLD = 'Çevre ve trafik';
const SPACE = 'Mekân ve yankı';
const PROC = 'Ses işleme';
const QUALITY = 'Sentez kalitesi';

/** Every audio option. Each one is read by `AudioEngine.applySettings` or `GameAudio`; see docs/dev/AUDIO.md. */
export const AUDIO_SETTINGS: SettingDef[] = [
  // ── levels ──
  { key: 'audio.master', category: 'audio', group: LEVELS, label: 'Genel ses', type: 'slider', min: 0, max: 1, step: 0.05, format: pct, default: 0.8 },
  { key: 'audio.engine', category: 'audio', group: LEVELS, label: 'Motor sesi', type: 'slider', min: 0, max: 1, step: 0.05, format: pct, default: 0.9 },
  { key: 'audio.wind', category: 'audio', group: LEVELS, label: 'Rüzgâr (kask)', type: 'slider', min: 0, max: 1, step: 0.05, format: pct, default: 0.8, help: 'Hızla artan kask rüzgârı, titreşim ve ıslık.' },
  { key: 'audio.tyres', category: 'audio', group: LEVELS, label: 'Lastik ve yol sesi', type: 'slider', min: 0, max: 1, step: 0.05, format: pct, default: 0.8, help: 'Asfalt, ıslak zemin, rumble şeritleri, çakıl ve derz tıkırtıları.' },
  { key: 'audio.traffic', category: 'audio', group: LEVELS, label: 'Trafik', type: 'slider', min: 0, max: 1, step: 0.05, format: pct, default: 0.8 },
  { key: 'audio.sfx', category: 'audio', group: LEVELS, label: 'Efektler', type: 'slider', min: 0, max: 1, step: 0.05, format: pct, default: 0.8, help: 'Korna, çarpışma, kıl payı geçişleri.' },
  { key: 'audio.ambience', category: 'audio', group: LEVELS, label: 'Ortam (yağmur, gök gürültüsü)', type: 'slider', min: 0, max: 1, step: 0.05, format: pct, default: 0.8 },
  { key: 'audio.ui', category: 'audio', group: LEVELS, label: 'Arayüz sesleri', type: 'slider', min: 0, max: 1, step: 0.05, format: pct, default: 0.8 },

  // ── engine ──
  {
    key: 'audio.intakeBalance',
    category: 'audio',
    group: ENGINE,
    label: 'Emiş / egzoz dengesi',
    type: 'slider',
    min: -1,
    max: 1,
    step: 0.1,
    format: (v) => (Math.abs(v) < 0.05 ? 'Dengeli' : v < 0 ? `Emiş ${Math.round(-v * 100)}%` : `Egzoz ${Math.round(v * 100)}%`),
    default: 0,
    help: 'Sürücü kulağında hava kutusu hırıltısı (sol) ile egzoz notası (sağ) arasındaki denge.',
  },
  { key: 'audio.helmet', category: 'audio', group: ENGINE, label: 'Kask etkisi', type: 'toggle', default: true, help: 'Kask ve kulak koruması yüksek frekansları yumuşatır; kapalıyken ses daha parlak ve açık olur.' },
  { key: 'audio.mechanical', category: 'audio', group: ENGINE, label: 'Mekanik sesler', type: 'slider', min: 0, max: 1.5, step: 0.1, format: pct, default: 1, help: 'Supap tıkırtısı, zincir, ana dişli ve kavrama sesleri.' },
  { key: 'audio.crackle', category: 'audio', group: ENGINE, label: 'Egzoz patlamaları', type: 'slider', min: 0, max: 2, step: 0.1, format: pct, default: 1, help: 'Gaz kesildiğinde ve vites kesmede çıtırtı, burble ve ara sıra backfire.' },
  {
    key: 'audio.exhaust',
    category: 'audio',
    group: ENGINE,
    label: 'Egzoz tipi',
    type: 'select',
    default: 'stock',
    options: [
      { value: 'stock', label: 'Orijinal', help: 'Fabrika susturucusu.' },
      { value: 'slipon', label: 'Slip-on', help: 'Daha açık, daha yüksek ve çıtırtıya yatkın.' },
      { value: 'race', label: 'Yarış (açık boru)', help: 'Neredeyse susturucusuz: çok sert ve gürültülü.' },
    ],
  },
  { key: 'audio.dryClutch', category: 'audio', group: ENGINE, label: 'Kuru kavrama tıkırtısı', type: 'toggle', default: true, help: 'Ducati kuru kavramasının rölantideki karakteristik tıkırtısı.' },
  { key: 'audio.starter', category: 'audio', group: ENGINE, label: 'Marş sesi', type: 'toggle', default: true },

  // ── world ──
  { key: 'audio.doppler', category: 'audio', group: WORLD, label: 'Doppler etkisi', type: 'slider', min: 0, max: 2, step: 0.1, format: pct, default: 1, help: 'Geçen araçların perde değişimi. 100% gerçek fiziktir.' },
  {
    key: 'audio.trafficVoices',
    category: 'audio',
    group: WORLD,
    label: 'Eşzamanlı trafik motoru',
    type: 'slider',
    min: 2,
    max: 8,
    step: 1,
    default: 5,
    presets: { low: 3, medium: 4, high: 5, ultra: 6, extreme: 8 },
    help: 'Aynı anda ayrı ayrı sentezlenen en yakın araç sayısı.',
  },
  {
    key: 'audio.spatial',
    category: 'audio',
    group: WORLD,
    label: 'Uzamsal ses',
    type: 'select',
    default: 'hrtf',
    presets: { low: 'stereo', medium: 'stereo', high: 'hrtf', ultra: 'hrtf', extreme: 'hrtf' },
    options: [
      { value: 'hrtf', label: 'HRTF (kulaklık)', help: 'Kafa ve kulak modeli; kulaklıkla gerçek 3B konum.' },
      { value: 'stereo', label: 'Stereo (hoparlör)', help: 'Basit sağ-sol panorama; hafif ve hoparlörlerde net.' },
    ],
  },
  { key: 'audio.nearMiss', category: 'audio', group: WORLD, label: 'Kıl payı geçiş sesi', type: 'toggle', default: true },
  { key: 'audio.hornSounds', category: 'audio', group: WORLD, label: 'Trafik kornaları', type: 'toggle', default: true },

  // ── space ──
  { key: 'audio.reverb', category: 'audio', group: SPACE, label: 'Ortam yankısı', type: 'toggle', default: true, presets: { low: false, medium: true, high: true, ultra: true, extreme: true }, help: 'Harita ve bölgeye göre açık yol, şehir kanyonu, orman veya tünel yankısı.' },
  { key: 'audio.reverbAmount', category: 'audio', group: SPACE, label: 'Yankı miktarı', type: 'slider', min: 0, max: 1, step: 0.05, format: pct, default: 0.6, visibleIf: (v) => v['audio.reverb'] !== false },

  // ── processing ──
  { key: 'audio.nightMode', category: 'audio', group: PROC, label: 'Gece modu', type: 'toggle', default: false, help: 'Dinamik aralığı sıkıştırır: gürültülü sesler kısılır, kısık sesler yükselir.' },
  { key: 'audio.mono', category: 'audio', group: PROC, label: 'Mono ses', type: 'toggle', default: false, help: 'Tek kulaklık veya işitme güçlüğü için sol-sağ kanalları birleştirir.' },
  { key: 'audio.bass', category: 'audio', group: PROC, label: 'Bas', type: 'slider', min: -8, max: 8, step: 1, format: db, default: 0, advanced: true },
  { key: 'audio.treble', category: 'audio', group: PROC, label: 'Tiz', type: 'slider', min: -8, max: 8, step: 1, format: db, default: 0, advanced: true },

  // ── quality ──
  {
    key: 'audio.quality',
    category: 'audio',
    group: QUALITY,
    label: 'Motor sentezi kalitesi',
    type: 'select',
    default: 'high',
    restart: true,
    presets: { low: 'low', medium: 'medium', high: 'high', ultra: 'ultra', extreme: 'extreme' },
    options: [
      { value: 'low', label: 'Düşük', help: 'Tek borulu egzoz, ses işlemcisi hafif (telefon).' },
      { value: 'medium', label: 'Orta', help: 'Tam egzoz ağı (silindir başına başlık borusu).' },
      { value: 'high', label: 'Yüksek', help: 'Tam ağ + supap/zincir mekaniği ve ek rezonanslar.' },
      { value: 'ultra', label: 'Ultra', help: 'Tüm blok ve susturucu modları.' },
      { value: 'extreme', label: 'Ekstrem', help: '2× aşırı örnekleme: en temiz yüksek frekanslar.' },
    ],
    help: 'Gerçek zamanlı motor sentezinin ayrıntı düzeyi (dalga kılavuzu sayısı ve aşırı örnekleme).',
  },
];
