import type { SettingsReader } from '../settings';
import type { SettingDef } from '../settings/schema';
import type { HeadSettings } from './fpv/headMotion';

const pct = (v: number): string => `${Math.round(v * 100)}%`;

/** First-person camera options (helmet view, mirrors, visor, crash cameras). */
export const CAMERA_SETTINGS: SettingDef[] = [
  // ── field of view ──
  {
    key: 'cam.fov',
    category: 'camera',
    group: 'Görüş açısı',
    label: 'Görüş açısı (FOV)',
    help: 'Dikey görüş açısı. Geniş açı hız hissini artırır, dar açı daha gerçekçi görünür.',
    type: 'slider',
    min: 55,
    max: 105,
    step: 1,
    unit: '°',
    default: 74,
  },
  {
    key: 'cam.speedFov',
    category: 'camera',
    group: 'Görüş açısı',
    label: 'Hızla görüş genişlemesi',
    help: 'Hız arttıkça görüş açısının ne kadar açılacağı (derece).',
    type: 'slider',
    min: 0,
    max: 30,
    step: 1,
    unit: '°',
    default: 14,
  },
  // ── head ──
  {
    key: 'cam.headMotion',
    category: 'camera',
    group: 'Kafa hareketi',
    label: 'Kafa hareketi şiddeti',
    help: 'Fren ve gazda kafanın öne arkaya savrulması, virajda eğilme ve genel kafa dinamiği.',
    type: 'slider',
    min: 0,
    max: 1.5,
    step: 0.05,
    format: pct,
    default: 1,
  },
  {
    key: 'cam.horizonTilt',
    category: 'camera',
    group: 'Kafa hareketi',
    label: 'Ufuk dengeleme',
    help: 'Motor yatarken gerçek sürücüler gibi kafayı ufka doğru dik tutar. %100 ufku hep düz tutar.',
    type: 'slider',
    min: 0,
    max: 1,
    step: 0.05,
    format: pct,
    default: 0.6,
  },
  {
    key: 'cam.lookIntoTurn',
    category: 'camera',
    group: 'Kafa hareketi',
    label: 'Virajın içine bakış',
    help: 'Viraja girerken kafa yatış yönüne döner.',
    type: 'slider',
    min: 0,
    max: 1.5,
    step: 0.05,
    format: pct,
    default: 1,
  },
  {
    key: 'cam.tuck',
    category: 'camera',
    group: 'Kafa hareketi',
    label: 'Yüksek hızda siper alma',
    help: 'Spor motorlarda yüksek hızda sürücü ön camın arkasına yatar, bakış noktası alçalır.',
    type: 'slider',
    min: 0,
    max: 1.5,
    step: 0.05,
    format: pct,
    default: 1,
  },
  {
    key: 'cam.shake',
    category: 'camera',
    group: 'Titreşim',
    label: 'Kamera sarsıntısı',
    help: 'Yol titreşimi, darbe ve yüksek hız sarsıntısı.',
    type: 'toggle',
    default: true,
  },
  {
    key: 'cam.engineVibration',
    category: 'camera',
    group: 'Titreşim',
    label: 'Motor titreşimi',
    help: 'Devirle artan, gidondan ve koltuktan gelen ince titreşim.',
    type: 'slider',
    min: 0,
    max: 2,
    step: 0.05,
    format: pct,
    default: 1,
  },
  {
    key: 'cam.roadVibration',
    category: 'camera',
    group: 'Titreşim',
    label: 'Yol ve süspansiyon titreşimi',
    help: 'Yüzeye göre değişir: asfalt hafif, stabilize yol ve çakıl şiddetli, ikaz şeridi gürültülü.',
    type: 'slider',
    min: 0,
    max: 2,
    step: 0.05,
    format: pct,
    default: 1,
  },
  {
    key: 'cam.windBuffet',
    category: 'camera',
    group: 'Titreşim',
    label: 'Rüzgâr çarpması',
    help: '120 km/s üstünde, siper almadan giderken rüzgâr kaskı sarsar.',
    type: 'slider',
    min: 0,
    max: 2,
    step: 0.05,
    format: pct,
    default: 1,
  },
  {
    key: 'cam.nearMissFx',
    category: 'camera',
    group: 'Şerit hissi',
    label: 'Yakın geçiş efekti',
    help: 'Araçların yanından kıl payı geçerken rüzgâr patlaması, görüş açısı genişlemesi ve TIR türbülansı.',
    type: 'slider',
    min: 0,
    max: 1.5,
    step: 0.05,
    format: pct,
    default: 1,
  },
  // ── look back ──
  {
    key: 'cam.lookBackSide',
    category: 'camera',
    group: 'Geriye bakış',
    label: 'Geriye bakış tarafı',
    help: 'B tuşuna / ekrandaki düğmeye basılı tutarak omuz üstünden arkaya bak.',
    type: 'select',
    options: [
      { value: 'auto', label: 'Otomatik (dönülen taraf)' },
      { value: 'left', label: 'Sol omuz' },
      { value: 'right', label: 'Sağ omuz' },
    ],
    default: 'auto',
  },
  // ── mirrors ──
  {
    key: 'cam.mirrors',
    category: 'camera',
    group: 'Aynalar',
    label: 'Ayna çözünürlüğü',
    help: 'Aynalar arkadaki trafiği gerçek zamanlı gösterir. Kapalıyken ayna mat görünür.',
    type: 'select',
    options: [
      { value: 'off', label: 'Kapalı' },
      { value: 'low', label: 'Düşük (160 px)' },
      { value: 'medium', label: 'Orta (256 px)' },
      { value: 'high', label: 'Yüksek (384 px)' },
      { value: 'ultra', label: 'Ultra (512 px)' },
    ],
    default: 'medium',
    presets: { low: 'off', medium: 'low', high: 'medium', ultra: 'high', extreme: 'ultra' },
  },
  {
    key: 'cam.mirrorRate',
    category: 'camera',
    group: 'Aynalar',
    label: 'Ayna yenileme hızı',
    help: 'Saniyede kaç kez güncellenir. Düşük değer performansı korur.',
    type: 'select',
    options: [
      { value: '10', label: '10 Hz' },
      { value: '20', label: '20 Hz' },
      { value: '30', label: '30 Hz' },
      { value: '60', label: 'Her kare' },
    ],
    default: '30',
    presets: { low: '10', medium: '20', high: '30', ultra: '60', extreme: '60' },
    visibleIf: (v) => v['cam.mirrors'] !== 'off',
  },
  // ── visor ──
  {
    key: 'cam.visorRain',
    category: 'camera',
    group: 'Vizör',
    label: 'Vizörde yağmur damlaları',
    help: 'Yağmurda kask vizörüne damlalar yapışır ve hızla yana, yukarı akar.',
    type: 'toggle',
    default: true,
  },
  {
    key: 'cam.visorFrame',
    category: 'camera',
    group: 'Vizör',
    label: 'Vizör kenar karartması',
    help: 'Kask açıklığının kenarlarında hafif karartma.',
    type: 'toggle',
    default: true,
  },
  // ── crash ──
  {
    key: 'cam.crashCamera',
    category: 'camera',
    group: 'Kaza kamerası',
    label: 'Kaza kamerası',
    help: 'Birinci şahıs: kaskın içinden savrulmayı izle. Sinematik: kazanın dışarıdan tekrarı. İkisi: önce kask, sonra tekrar.',
    type: 'select',
    options: [
      { value: 'fpv', label: 'Birinci şahıs' },
      { value: 'cinematic', label: 'Sinematik' },
      { value: 'both', label: 'İkisi birden' },
    ],
    default: 'both',
  },
  {
    key: 'cam.crashSlowmo',
    category: 'camera',
    group: 'Kaza kamerası',
    label: 'Kaza ağır çekimi',
    help: 'Çarpışma anının ne kadar yavaşlatılacağı. %0 kapalı.',
    type: 'slider',
    min: 0,
    max: 1,
    step: 0.05,
    format: pct,
    default: 0.8,
  },
  // ── comfort ──
  {
    key: 'cam.motionComfort',
    category: 'accessibility',
    group: 'Hareket',
    label: 'Hareket hastalığını azalt',
    help: 'Kafa sallanması, titreşim ve görüş açısı değişimini azaltır; ufuğu sabit tutar.',
    type: 'select',
    options: [
      { value: 'off', label: 'Kapalı' },
      { value: 'medium', label: 'Orta' },
      { value: 'strong', label: 'Güçlü' },
    ],
    default: 'off',
  },
];

export type MirrorQuality = 'off' | 'low' | 'medium' | 'high' | 'ultra';
export const MIRROR_PIXELS: Record<MirrorQuality, number> = { off: 0, low: 160, medium: 256, high: 384, ultra: 512 };

/** Resolved first-person options, with the motion-comfort preset already folded in. */
export interface FpvOptions extends HeadSettings {
  mirrors: MirrorQuality;
  mirrorHz: number;
  visorRain: boolean;
  visorFrame: boolean;
  crashCamera: 'fpv' | 'cinematic' | 'both';
  crashSlowmo: number;
  lookBackSide: 'auto' | 'left' | 'right';
  nearMiss: number;
  comfort: 'off' | 'medium' | 'strong';
}

export function makeFpvOptions(): FpvOptions {
  return {
    motion: 1, horizon: 0.6, lookTurn: 1, tuck: 1, engineVib: 1, roadVib: 1, wind: 1, shake: 1, fov: 74, speedFov: 14,
    mirrors: 'medium', mirrorHz: 30, visorRain: true, visorFrame: true, crashCamera: 'both', crashSlowmo: 0.8, lookBackSide: 'auto', nearMiss: 1, comfort: 'off',
  };
}

/** Read the camera settings into a reusable object (no allocation). */
export function readFpvOptions(s: SettingsReader, out: FpvOptions): FpvOptions {
  const comfort = s.str<FpvOptions['comfort']>('cam.motionComfort');
  // The comfort preset damps everything that moves the horizon or shakes the view.
  const k = comfort === 'strong' ? 0.2 : comfort === 'medium' ? 0.5 : 1;
  out.comfort = comfort;
  out.fov = s.num('cam.fov');
  out.speedFov = s.num('cam.speedFov') * (comfort === 'off' ? 1 : comfort === 'medium' ? 0.5 : 0.15);
  out.motion = s.num('cam.headMotion') * k;
  out.horizon = comfort === 'off' ? s.num('cam.horizonTilt') : comfort === 'medium' ? Math.max(0.85, s.num('cam.horizonTilt')) : 1;
  out.lookTurn = s.num('cam.lookIntoTurn') * k;
  out.tuck = s.num('cam.tuck');
  out.shake = s.bool('cam.shake') ? k : 0;
  out.engineVib = s.num('cam.engineVibration') * k;
  out.roadVib = s.num('cam.roadVibration') * k;
  out.wind = s.num('cam.windBuffet') * k;
  out.nearMiss = s.num('cam.nearMissFx') * k;
  out.mirrors = s.str<MirrorQuality>('cam.mirrors');
  out.mirrorHz = Number(s.str('cam.mirrorRate')) || 30;
  out.visorRain = s.bool('cam.visorRain');
  out.visorFrame = s.bool('cam.visorFrame');
  out.crashCamera = s.str<FpvOptions['crashCamera']>('cam.crashCamera');
  out.crashSlowmo = s.num('cam.crashSlowmo');
  out.lookBackSide = s.str<FpvOptions['lookBackSide']>('cam.lookBackSide');
  return out;
}
