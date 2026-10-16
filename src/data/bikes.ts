/**
 * Motorcycle catalogue.
 *
 * Figures are approximations of manufacturers' published specifications
 * (crank power, peak torque, wet weight, top speed). Brand and model names
 * are trademarks of their respective owners; this fan game is not affiliated
 * with or endorsed by any manufacturer.
 */

export type EngineLayout =
  | 'I4' // inline four, flat-plane crank (180° firing intervals)
  | 'I4CP' // inline four, cross-plane crank (270-180-90-180)
  | 'V4' // 90° V4 "twin pulse" (Ducati Desmosedici Stradale)
  | 'V4A' // 65° V4 (Aprilia / Yamaha VMAX style irregular firing)
  | 'L2' // 90° V-twin / 270° parallel twin (270-450)
  | 'V2_45' // 45° V-twin, common crank pin (315-405) — "potato potato"
  | 'V2_60' // 60° V-twin (420-300)
  | 'V2_75' // 75° V-twin / 435° parallel twin (435-285)
  | 'P2_180' // parallel twin, 180° crank
  | 'P2_270' // parallel twin, 270° crank
  | 'P2_360' // parallel twin, 360° crank
  | 'I3' // inline triple (240° even)
  | 'SINGLE'
  | 'BOXER' // flat twin (360° even)
  | 'I6' // inline six (120° even)
  | 'F6' // flat six (120° even)
  | 'ELECTRIC';

export type BikeStyle = 'sport' | 'naked' | 'adventure' | 'touring' | 'cruiser' | 'classic' | 'scooter' | 'hyper';
export type Transmission = 'manual' | 'cvt' | 'direct';

export type WheelType = 'cast3' | 'cast5' | 'cast7' | 'cast10' | 'spoke' | 'disc' | 'scooter';
export type ExhaustType = 'under' | 'side' | 'high' | 'twinUnderseat' | 'dualChrome' | 'peashooter' | 'organ' | 'scooter' | 'none';
export type HeadlightType = 'sportTwin' | 'round' | 'angular' | 'beak' | 'touring' | 'ledBar' | 'scooter' | 'batwing';
export type FairingType = 'full' | 'half' | 'none' | 'touring' | 'adventure' | 'scooter' | 'batwing';
export type TankType = 'sport' | 'teardrop' | 'round' | 'boxy' | 'adventure' | 'muscle';
export type HandlebarType = 'clipon' | 'wide' | 'cruiser' | 'tall' | 'scooter';
export type LiveryPattern = 'solid' | 'stripes' | 'tricolor' | 'racing' | 'split' | 'chrome';
export type BikeExtra =
  | 'panniers'
  | 'topcase'
  | 'crashbars'
  | 'winglets'
  | 'singleSided'
  | 'trellis'
  | 'chromeEngine'
  | 'supercharger'
  | 'flyscreen'
  | 'bellypan'
  | 'windscreenTall'
  | 'fenderLong';

export interface Livery {
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  frame: string;
  wheel: string;
  seat: string;
  pattern: LiveryPattern;
  /** Rider leathers/helmet colours */
  suit: [string, string];
}

export interface BikeLook {
  wheelbase: number;
  frontWheelR: number;
  rearWheelR: number;
  frontTireW: number;
  rearTireW: number;
  seatH: number;
  /** Fork rake in radians */
  rake: number;
  wheel: WheelType;
  exhaust: ExhaustType;
  headlight: HeadlightType;
  fairing: FairingType;
  tank: TankType;
  handlebar: HandlebarType;
  extras: BikeExtra[];
}

export interface EngineSpec {
  layout: EngineLayout;
  cc: number;
  hp: number;
  hpRpm: number;
  torque: number;
  torqueRpm: number;
  idle: number;
  redline: number;
  limiter: number;
  supercharged: boolean;
}

/** Character of the exhaust voice used by the engine synthesiser. */
export interface ExhaustVoice {
  /** Main exhaust resonance (Hz) at the base pulse. */
  resonance: number;
  /** 0..1 high-frequency content. */
  brightness: number;
  /** 0..1 cylinder-to-cylinder irregularity (lumpiness). */
  roughness: number;
  /** 0..1 overrun crackle tendency. */
  crackle: number;
  /** Overall loudness trim (dB). */
  loudness: number;
}

export interface BikeSpec {
  id: string;
  brand: string;
  model: string;
  year: number;
  style: BikeStyle;
  engine: EngineSpec;
  transmission: Transmission;
  gears: number;
  quickshifter: boolean;
  /** Wet weight, kg */
  weight: number;
  /** Top speed, km/h */
  topSpeed: number;
  price: number;
  liveries: Livery[];
  look: BikeLook;
  voice: ExhaustVoice;
  description: string;
}

type Partial2<T> = { [K in keyof T]?: T[K] extends object ? Partial<T[K]> : T[K] };

const STYLE_LOOK: Record<BikeStyle, BikeLook> = {
  sport: {
    wheelbase: 1.42, frontWheelR: 0.3, rearWheelR: 0.315, frontTireW: 0.12, rearTireW: 0.19, seatH: 0.83,
    rake: 0.41, wheel: 'cast5', exhaust: 'side', headlight: 'sportTwin', fairing: 'full', tank: 'sport',
    handlebar: 'clipon', extras: ['bellypan'],
  },
  hyper: {
    wheelbase: 1.47, frontWheelR: 0.3, rearWheelR: 0.315, frontTireW: 0.12, rearTireW: 0.19, seatH: 0.82,
    rake: 0.43, wheel: 'cast5', exhaust: 'side', headlight: 'sportTwin', fairing: 'full', tank: 'sport',
    handlebar: 'clipon', extras: ['bellypan'],
  },
  naked: {
    wheelbase: 1.44, frontWheelR: 0.3, rearWheelR: 0.315, frontTireW: 0.12, rearTireW: 0.18, seatH: 0.82,
    rake: 0.43, wheel: 'cast5', exhaust: 'side', headlight: 'angular', fairing: 'none', tank: 'muscle',
    handlebar: 'wide', extras: [],
  },
  adventure: {
    wheelbase: 1.55, frontWheelR: 0.36, rearWheelR: 0.33, frontTireW: 0.09, rearTireW: 0.15, seatH: 0.87,
    rake: 0.47, wheel: 'spoke', exhaust: 'high', headlight: 'beak', fairing: 'adventure', tank: 'adventure',
    handlebar: 'tall', extras: ['crashbars', 'windscreenTall'],
  },
  touring: {
    wheelbase: 1.62, frontWheelR: 0.31, rearWheelR: 0.32, frontTireW: 0.13, rearTireW: 0.19, seatH: 0.75,
    rake: 0.5, wheel: 'cast7', exhaust: 'dualChrome', headlight: 'touring', fairing: 'touring', tank: 'boxy',
    handlebar: 'wide', extras: ['panniers', 'topcase', 'windscreenTall'],
  },
  cruiser: {
    wheelbase: 1.66, frontWheelR: 0.33, rearWheelR: 0.33, frontTireW: 0.13, rearTireW: 0.24, seatH: 0.68,
    rake: 0.56, wheel: 'cast10', exhaust: 'dualChrome', headlight: 'round', fairing: 'none', tank: 'teardrop',
    handlebar: 'cruiser', extras: ['chromeEngine', 'fenderLong'],
  },
  classic: {
    wheelbase: 1.45, frontWheelR: 0.33, rearWheelR: 0.32, frontTireW: 0.1, rearTireW: 0.14, seatH: 0.79,
    rake: 0.46, wheel: 'spoke', exhaust: 'peashooter', headlight: 'round', fairing: 'none', tank: 'round',
    handlebar: 'wide', extras: ['chromeEngine', 'fenderLong'],
  },
  scooter: {
    wheelbase: 1.38, frontWheelR: 0.25, rearWheelR: 0.24, frontTireW: 0.11, rearTireW: 0.13, seatH: 0.79,
    rake: 0.47, wheel: 'scooter', exhaust: 'scooter', headlight: 'scooter', fairing: 'scooter', tank: 'boxy',
    handlebar: 'scooter', extras: [],
  },
};

const LAYOUT_VOICE: Record<EngineLayout, ExhaustVoice> = {
  I4: { resonance: 520, brightness: 0.8, roughness: 0.08, crackle: 0.5, loudness: 0 },
  I4CP: { resonance: 360, brightness: 0.62, roughness: 0.32, crackle: 0.6, loudness: 1 },
  V4: { resonance: 330, brightness: 0.7, roughness: 0.4, crackle: 0.7, loudness: 1.5 },
  V4A: { resonance: 360, brightness: 0.72, roughness: 0.38, crackle: 0.7, loudness: 1.5 },
  L2: { resonance: 160, brightness: 0.45, roughness: 0.3, crackle: 0.55, loudness: 1.5 },
  V2_45: { resonance: 95, brightness: 0.25, roughness: 0.45, crackle: 0.2, loudness: 2 },
  V2_60: { resonance: 130, brightness: 0.4, roughness: 0.35, crackle: 0.3, loudness: 1.5 },
  V2_75: { resonance: 170, brightness: 0.5, roughness: 0.32, crackle: 0.6, loudness: 1.5 },
  P2_180: { resonance: 260, brightness: 0.55, roughness: 0.12, crackle: 0.25, loudness: -1 },
  P2_270: { resonance: 180, brightness: 0.5, roughness: 0.28, crackle: 0.45, loudness: 0 },
  P2_360: { resonance: 200, brightness: 0.45, roughness: 0.1, crackle: 0.2, loudness: -1 },
  I3: { resonance: 300, brightness: 0.68, roughness: 0.18, crackle: 0.65, loudness: 0.5 },
  SINGLE: { resonance: 140, brightness: 0.45, roughness: 0.25, crackle: 0.35, loudness: -1 },
  BOXER: { resonance: 140, brightness: 0.4, roughness: 0.15, crackle: 0.3, loudness: 0 },
  I6: { resonance: 420, brightness: 0.55, roughness: 0.05, crackle: 0.15, loudness: -1 },
  F6: { resonance: 240, brightness: 0.35, roughness: 0.05, crackle: 0.05, loudness: -2 },
  ELECTRIC: { resonance: 0, brightness: 0.5, roughness: 0, crackle: 0, loudness: -4 },
};

function livery(
  name: string,
  primary: string,
  secondary: string,
  accent: string,
  opts: Partial<Omit<Livery, 'name' | 'primary' | 'secondary' | 'accent'>> = {},
): Livery {
  return {
    name,
    primary,
    secondary,
    accent,
    frame: opts.frame ?? '#1b1c1f',
    wheel: opts.wheel ?? '#16171a',
    seat: opts.seat ?? '#121212',
    pattern: opts.pattern ?? 'split',
    suit: opts.suit ?? [primary, secondary],
  };
}

interface BikeInput {
  id: string;
  brand: string;
  model: string;
  year: number;
  style: BikeStyle;
  engine: Omit<EngineSpec, 'limiter' | 'supercharged'> & { limiter?: number; supercharged?: boolean };
  transmission?: Transmission;
  gears?: number;
  quickshifter?: boolean;
  weight: number;
  topSpeed: number;
  price: number;
  liveries: Livery[];
  look?: Partial2<BikeLook>;
  voice?: Partial<ExhaustVoice>;
  description: string;
}

function bike(b: BikeInput): BikeSpec {
  const base = STYLE_LOOK[b.style];
  const look: BikeLook = {
    ...base,
    ...(b.look as Partial<BikeLook>),
    extras: (b.look?.extras as BikeExtra[] | undefined) ?? [...base.extras],
  };
  return {
    id: b.id,
    brand: b.brand,
    model: b.model,
    year: b.year,
    style: b.style,
    engine: {
      ...b.engine,
      limiter: b.engine.limiter ?? Math.round(b.engine.redline * 1.04),
      supercharged: b.engine.supercharged ?? false,
    },
    transmission: b.transmission ?? (b.engine.layout === 'ELECTRIC' ? 'direct' : 'manual'),
    gears: b.gears ?? (b.engine.layout === 'ELECTRIC' ? 1 : 6),
    quickshifter: b.quickshifter ?? false,
    weight: b.weight,
    topSpeed: b.topSpeed,
    price: b.price,
    liveries: b.liveries,
    look,
    voice: { ...LAYOUT_VOICE[b.engine.layout], ...b.voice },
    description: b.description,
  };
}

const W = '#f3f4f6';
const BLK = '#121316';
const GOLD = '#c9a227';

export const BIKES: BikeSpec[] = [
  // ───────────────────────────── Honda ─────────────────────────────
  bike({
    id: 'honda-cbr1000rr-r', brand: 'Honda', model: 'CBR1000RR-R Fireblade SP', year: 2024, style: 'sport',
    engine: { layout: 'I4', cc: 999, hp: 215, hpRpm: 14500, torque: 113, torqueRpm: 12500, idle: 1300, redline: 14500, limiter: 15000 },
    quickshifter: true, weight: 201, topSpeed: 299, price: 28900,
    liveries: [
      livery('Grand Prix Red (HRC Tricolor)', W, '#c8102e', '#1d3c8f', { pattern: 'tricolor', wheel: GOLD, frame: '#3a3c40', suit: [W, '#c8102e'] }),
      livery('Matte Pearl Morion Black', '#17181b', '#0d0e10', '#c8102e', { pattern: 'stripes', wheel: GOLD, frame: '#3a3c40' }),
    ],
    look: { extras: ['winglets', 'bellypan'] },
    description: 'MotoGP kökenli 999 cc sıralı dört; 14.500 devirde 215 beygir ve yüksek devirli çığlık.',
  }),
  bike({
    id: 'honda-cbr650r', brand: 'Honda', model: 'CBR650R', year: 2024, style: 'sport',
    engine: { layout: 'I4', cc: 649, hp: 95, hpRpm: 12000, torque: 63, torqueRpm: 9500, idle: 1300, redline: 12500 },
    weight: 208, topSpeed: 235, price: 9900,
    liveries: [
      livery('Grand Prix Red', '#c8102e', '#111214', W, { pattern: 'split', frame: '#17181b' }),
      livery('Matt Gunpowder Black Metallic', '#2e3034', '#111214', '#c8102e', { pattern: 'solid', frame: '#17181b' }),
    ],
    voice: { resonance: 560 },
    description: 'Günlük kullanılabilir sıralı dört; orta devirden kırmızı bölgeye kadar pürüzsüz.',
  }),
  bike({
    id: 'honda-cb500-hornet', brand: 'Honda', model: 'CB500 Hornet', year: 2024, style: 'naked',
    engine: { layout: 'P2_180', cc: 471, hp: 47, hpRpm: 8600, torque: 43, torqueRpm: 6500, idle: 1300, redline: 9500 },
    weight: 188, topSpeed: 185, price: 6500,
    liveries: [livery('Matte Goldfinch', '#e3b31c', '#1b1c1f', BLK, { pattern: 'split' }), livery('Grand Prix Kırmızı', '#c8102e', BLK, W)],
    description: 'Hafif ve çevik 471 cc paralel ikili; şehirde ve otoyolda dengeli.',
  }),
  bike({
    id: 'honda-africa-twin', brand: 'Honda', model: 'CRF1100L Africa Twin', year: 2024, style: 'adventure',
    engine: { layout: 'P2_270', cc: 1084, hp: 101, hpRpm: 7500, torque: 112, torqueRpm: 5500, idle: 1250, redline: 8500 },
    weight: 231, topSpeed: 205, price: 15000,
    liveries: [livery('Tricolor', W, '#c8102e', '#1d3c8f', { pattern: 'tricolor', wheel: '#9ea3aa' }), livery('Siyah', BLK, '#2b2d31', '#c8102e', { wheel: '#9ea3aa' })],
    description: 'Paris–Dakar ruhu: 270° krank ile V-twin karakterli macera ikilisi.',
  }),
  bike({
    id: 'honda-gold-wing', brand: 'Honda', model: 'Gold Wing Tour', year: 2024, style: 'touring',
    engine: { layout: 'F6', cc: 1833, hp: 125, hpRpm: 5500, torque: 170, torqueRpm: 4500, idle: 800, redline: 6000 },
    gears: 7, quickshifter: true, weight: 390, topSpeed: 200, price: 29000,
    liveries: [livery('Eternal Gray', '#5b6068', '#33363b', '#b8bcc4', { pattern: 'solid', wheel: '#2a2c30' }), livery('Bordo', '#5e1420', '#2a0a10', '#c4c7cc', { pattern: 'solid' })],
    voice: { resonance: 210 },
    description: 'Yatay altı silindir, 7 ileri DCT; turbin kadar pürüzsüz bir uzun yol koltuğu.',
  }),
  bike({
    id: 'honda-rebel-500', brand: 'Honda', model: 'Rebel 500', year: 2024, style: 'cruiser',
    engine: { layout: 'P2_180', cc: 471, hp: 46, hpRpm: 8500, torque: 43, torqueRpm: 6000, idle: 1300, redline: 9000 },
    weight: 191, topSpeed: 170, price: 6300,
    liveries: [livery('Mat Siyah', '#1d1e21', '#111111', '#8d939b', { pattern: 'solid' }), livery('Pearl Smoky Gray', '#6f747c', '#2b2d31', '#c4c7cc')],
    look: { wheel: 'cast5', extras: ['fenderLong'], rearTireW: 0.15, wheelbase: 1.49 },
    description: 'Alçak sele ve bobber hatları; hafif ve kolay bir cruiser.',
  }),

  // ───────────────────────────── Yamaha ─────────────────────────────
  bike({
    id: 'yamaha-r1', brand: 'Yamaha', model: 'YZF-R1', year: 2024, style: 'sport',
    engine: { layout: 'I4CP', cc: 998, hp: 200, hpRpm: 13500, torque: 113, torqueRpm: 11500, idle: 1300, redline: 14000 },
    quickshifter: true, weight: 201, topSpeed: 299, price: 18900,
    liveries: [
      livery('Icon Blue', '#0d3fa6', W, '#c8102e', { pattern: 'racing', wheel: '#0d3fa6' }),
      livery('Tech Black', '#16171a', '#2c2d31', '#3a7bd5', { pattern: 'stripes' }),
      livery('60. Yıl Speedblock', W, '#c8102e', '#f2c400', { pattern: 'stripes', wheel: '#f2c400' }),
    ],
    voice: { resonance: 340 },
    description: 'Crossplane krank: V4 benzeri düzensiz ateşleme ve MotoGP M1 hırıltısı.',
  }),
  bike({
    id: 'yamaha-r6', brand: 'Yamaha', model: 'YZF-R6', year: 2020, style: 'sport',
    engine: { layout: 'I4', cc: 599, hp: 118, hpRpm: 14500, torque: 61.7, torqueRpm: 10500, idle: 1400, redline: 16000, limiter: 16500 },
    weight: 190, topSpeed: 262, price: 12200,
    liveries: [livery('Team Yamaha Blue', '#1849b8', W, '#0e2b70', { pattern: 'racing', wheel: '#1849b8' }), livery('Tech Black', BLK, '#2c2d31', '#888888')],
    voice: { resonance: 640, brightness: 0.9 },
    description: '16.000 devire dönen 600 cc süpersport; pist efsanesi.',
  }),
  bike({
    id: 'yamaha-mt09', brand: 'Yamaha', model: 'MT-09', year: 2024, style: 'naked',
    engine: { layout: 'I3', cc: 890, hp: 119, hpRpm: 10000, torque: 93, torqueRpm: 7000, idle: 1100, redline: 11000 },
    quickshifter: true, weight: 193, topSpeed: 230, price: 10500,
    liveries: [
      livery('Cyan Storm', '#5b6169', '#2a2d31', '#18c7e8', { pattern: 'split', wheel: '#18c7e8' }),
      livery('Icon Blue', '#0d3fa6', '#1a1b1e', '#7aa2ff', { pattern: 'split' }),
    ],
    description: 'Crossplane felsefeli üçlü: karanlık tarafın torku.',
  }),
  bike({
    id: 'yamaha-mt07', brand: 'Yamaha', model: 'MT-07', year: 2024, style: 'naked',
    engine: { layout: 'P2_270', cc: 689, hp: 73, hpRpm: 8750, torque: 67, torqueRpm: 6500, idle: 1250, redline: 10000 },
    weight: 184, topSpeed: 214, price: 8000,
    liveries: [livery('Icon Blue', '#0d3fa6', '#1b1c1f', '#7aa2ff'), livery('Cyan Storm', '#5b6169', '#2a2d31', '#18c7e8', { wheel: '#18c7e8' })],
    description: '270° CP2 ikili: kalın alt-orta devir ve şımarık ön teker.',
  }),
  bike({
    id: 'yamaha-r3', brand: 'Yamaha', model: 'YZF-R3', year: 2024, style: 'sport',
    engine: { layout: 'P2_180', cc: 321, hp: 42, hpRpm: 10750, torque: 29.6, torqueRpm: 9000, idle: 1400, redline: 12500, limiter: 13000 },
    weight: 169, topSpeed: 180, price: 5500,
    liveries: [livery('Icon Blue', '#0d3fa6', W, '#c8102e', { pattern: 'racing', wheel: '#0d3fa6' }), livery('Midnight Black', BLK, '#2c2d31', '#3a7bd5')],
    look: { frontTireW: 0.11, rearTireW: 0.14, extras: [] },
    description: 'Başlangıç süpersportu: hafif, yüksek devirli ve affedici.',
  }),
  bike({
    id: 'yamaha-tmax', brand: 'Yamaha', model: 'TMAX 560', year: 2024, style: 'scooter',
    engine: { layout: 'P2_360', cc: 562, hp: 47, hpRpm: 7500, torque: 55.7, torqueRpm: 5250, idle: 1300, redline: 8500 },
    transmission: 'cvt', gears: 1, weight: 220, topSpeed: 165, price: 12000,
    liveries: [livery('Icon Blue', '#1a3f8f', '#1a1b1e', '#9aa3ad'), livery('Tech Kamo', '#3d4a3a', '#1a1b1e', '#c4c7cc')],
    look: { wheelbase: 1.58, frontWheelR: 0.3, rearWheelR: 0.3, wheel: 'cast5' },
    description: 'Maksi-skuterlerin kralı: CVT ile sürekli tork.',
  }),
  bike({
    id: 'yamaha-vmax', brand: 'Yamaha', model: 'VMAX', year: 2017, style: 'cruiser',
    engine: { layout: 'V4A', cc: 1679, hp: 197, hpRpm: 9000, torque: 166.8, torqueRpm: 6500, idle: 1000, redline: 9500 },
    gears: 5, weight: 310, topSpeed: 220, price: 18000,
    liveries: [livery('Liquid Darkness', '#121316', '#2a2b2f', '#b8bcc4', { pattern: 'solid' })],
    look: { tank: 'muscle', wheel: 'cast10', exhaust: 'dualChrome', rake: 0.54, wheelbase: 1.7, rearTireW: 0.2 },
    voice: { resonance: 220, brightness: 0.55 },
    description: 'V-Boost efsanesinin varisi: 65° V4 dragster.',
  }),

  // ──────────────────────────── Kawasaki ────────────────────────────
  bike({
    id: 'kawasaki-h2', brand: 'Kawasaki', model: 'Ninja H2', year: 2024, style: 'hyper',
    engine: { layout: 'I4', cc: 998, hp: 228, hpRpm: 11500, torque: 141.7, torqueRpm: 11000, idle: 1100, redline: 14000, supercharged: true },
    quickshifter: true, weight: 238, topSpeed: 330, price: 31000,
    liveries: [livery('Mirror Coated Spark Black', '#25272b', '#8e949c', '#5fd02c', { pattern: 'chrome', frame: '#5fd02c' })],
    look: { extras: ['trellis', 'supercharger', 'winglets', 'singleSided'] },
    voice: { resonance: 470 },
    description: 'Süperşarjlı sıralı dört: kompresör ıslığı ve blow-off sesi ile 330 km/s.',
  }),
  bike({
    id: 'kawasaki-h2r', brand: 'Kawasaki', model: 'Ninja H2R', year: 2024, style: 'hyper',
    engine: { layout: 'I4', cc: 998, hp: 310, hpRpm: 14000, torque: 165, torqueRpm: 12500, idle: 1100, redline: 14500, supercharged: true },
    quickshifter: true, weight: 216, topSpeed: 400, price: 56000,
    liveries: [livery('Mirror Coated Matte Spark Black / Carbon', '#8e949c', '#1b1c1f', '#5fd02c', { pattern: 'chrome', frame: '#5fd02c', suit: ['#1b1c1f', '#5fd02c'] })],
    look: { extras: ['trellis', 'supercharger', 'winglets', 'singleSided'] },
    voice: { resonance: 500, brightness: 0.95, loudness: 3, crackle: 0.9 },
    description: 'Sadece pist: 310 beygir, karbon kanatlar ve 400 km/s.',
  }),
  bike({
    id: 'kawasaki-zx10r', brand: 'Kawasaki', model: 'Ninja ZX-10R', year: 2024, style: 'sport',
    engine: { layout: 'I4', cc: 998, hp: 203, hpRpm: 13200, torque: 114.9, torqueRpm: 11400, idle: 1100, redline: 14000 },
    quickshifter: true, weight: 207, topSpeed: 299, price: 17900,
    liveries: [
      livery('KRT Edition Lime Green / Ebony / Pearl Blizzard White', '#5fd02c', '#16171a', '#eef0f2', { pattern: 'racing', suit: ['#5fd02c', BLK] }),
      livery('Pearl Robotic White / Metallic Carbon Gray', '#eef0f2', '#4a4e55', '#5fd02c', { pattern: 'split' }),
    ],
    look: { extras: ['winglets', 'bellypan'] },
    voice: { resonance: 540 },
    description: 'WorldSBK şampiyonluklarının sokak versiyonu.',
  }),
  bike({
    id: 'kawasaki-zx6r', brand: 'Kawasaki', model: 'Ninja ZX-6R', year: 2024, style: 'sport',
    engine: { layout: 'I4', cc: 636, hp: 127, hpRpm: 13500, torque: 70.8, torqueRpm: 11000, idle: 1300, redline: 16000, limiter: 16500 },
    weight: 197, topSpeed: 260, price: 11300,
    liveries: [
      livery('KRT Edition Lime Green / Ebony / Pearl Blizzard White', '#5fd02c', '#16171a', '#eef0f2', { pattern: 'racing', suit: ['#5fd02c', BLK] }),
      livery('Metallic Flat Spark Black / Ebony', '#26282c', '#141518', '#5fd02c', { suit: [BLK, '#5fd02c'] }),
    ],
    voice: { resonance: 620, brightness: 0.88 },
    description: '636 cc ile sınıfının tork avantajı.',
  }),
  bike({
    id: 'kawasaki-zx4rr', brand: 'Kawasaki', model: 'Ninja ZX-4RR', year: 2024, style: 'sport',
    engine: { layout: 'I4', cc: 399, hp: 77, hpRpm: 14500, torque: 39, torqueRpm: 13000, idle: 1600, redline: 16000, limiter: 16500 },
    quickshifter: true, weight: 188, topSpeed: 230, price: 9700,
    liveries: [livery('KRT Edition Lime Green / Ebony / Pearl Blizzard White', '#5fd02c', '#16171a', '#eef0f2', { pattern: 'racing', suit: ['#5fd02c', BLK] })],
    voice: { resonance: 760, brightness: 1, loudness: -0.5 },
    description: '400 cc sıralı dört: 16.000 devirde F1 gibi çığlık.',
  }),
  bike({
    id: 'kawasaki-z900', brand: 'Kawasaki', model: 'Z900', year: 2024, style: 'naked',
    engine: { layout: 'I4', cc: 948, hp: 125, hpRpm: 9500, torque: 98.6, torqueRpm: 7700, idle: 1100, redline: 11000 },
    weight: 212, topSpeed: 240, price: 9400,
    liveries: [livery('Metallic Spark Black', '#1b1c1f', '#3a3c40', '#5fd02c', { frame: '#5fd02c' }), livery('Candy Lime Green', '#4fb81f', BLK, W)],
    look: { extras: ['trellis'] },
    voice: { resonance: 430, brightness: 0.65 },
    description: 'Sugomi tasarımı ve emme sesi tuned sıralı dört.',
  }),
  bike({
    id: 'kawasaki-ninja400', brand: 'Kawasaki', model: 'Ninja 400', year: 2023, style: 'sport',
    engine: { layout: 'P2_180', cc: 399, hp: 45, hpRpm: 10000, torque: 37, torqueRpm: 8000, idle: 1300, redline: 12500 },
    weight: 168, topSpeed: 190, price: 5300,
    liveries: [
      livery('KRT Edition Lime Green / Ebony / Pearl Blizzard White', '#5fd02c', '#16171a', '#eef0f2', { pattern: 'racing', suit: ['#5fd02c', BLK] }),
      livery('Metallic Carbon Gray / Metallic Magnetic Dark Gray', '#3c3f44', '#24262a', '#5fd02c', { suit: ['#3c3f44', BLK] }),
    ],
    look: { frontTireW: 0.11, rearTireW: 0.15, extras: [] },
    description: 'Hafif kasa, yüksek devir; sınıfının en hızlısı.',
  }),

  // ───────────────────────────── Suzuki ─────────────────────────────
  bike({
    id: 'suzuki-gsxr1000r', brand: 'Suzuki', model: 'GSX-R1000R', year: 2022, style: 'sport',
    engine: { layout: 'I4', cc: 999, hp: 202, hpRpm: 13200, torque: 117.6, torqueRpm: 10800, idle: 1200, redline: 14000 },
    quickshifter: true, weight: 203, topSpeed: 299, price: 17800,
    liveries: [livery('Metallic Triton Blue', '#1747a6', W, '#9aa3ad', { pattern: 'racing', wheel: '#1747a6' }), livery('Glass Sparkle Black', BLK, '#2c2d31', '#c8102e')],
    voice: { resonance: 500 },
    description: 'Gixxer: değişken subap zamanlamalı efsanevi sıralı dört.',
  }),
  bike({
    id: 'suzuki-hayabusa', brand: 'Suzuki', model: 'Hayabusa', year: 2024, style: 'hyper',
    engine: { layout: 'I4', cc: 1340, hp: 190, hpRpm: 9700, torque: 150, torqueRpm: 7000, idle: 1150, redline: 11000 },
    quickshifter: true, weight: 264, topSpeed: 299, price: 18800,
    liveries: [
      livery('Glass Sparkle Black / Candy Burnt Gold', '#151619', '#8a5a22', '#c9a227', { pattern: 'split', wheel: '#151619' }),
      livery('Pearl Brilliant White / Pearl Vigor Blue', W, '#24407a', '#c9a227', { pattern: 'split', wheel: '#151619' }),
    ],
    look: { wheelbase: 1.48 },
    voice: { resonance: 380, brightness: 0.62 },
    description: 'Busa: 1340 cc, aerodinamik gövde ve sonsuz çekiş.',
  }),
  bike({
    id: 'suzuki-vstrom650', brand: 'Suzuki', model: 'V-Strom 650 XT', year: 2024, style: 'adventure',
    engine: { layout: 'L2', cc: 645, hp: 70, hpRpm: 8800, torque: 62, torqueRpm: 6400, idle: 1300, redline: 10000 },
    weight: 216, topSpeed: 200, price: 9400,
    liveries: [livery('Champion Yellow', '#f2c400', '#1b1c1f', '#1747a6', { wheel: '#9ea3aa' }), livery('Pearl Glacier White', W, '#1b1c1f', '#1747a6', { wheel: '#9ea3aa' })],
    description: '90° V-twin: güvenilir, ekonomik ve sınırsız macera.',
  }),
  bike({
    id: 'suzuki-sv650', brand: 'Suzuki', model: 'SV650', year: 2024, style: 'naked',
    engine: { layout: 'L2', cc: 645, hp: 75, hpRpm: 8500, torque: 64, torqueRpm: 8100, idle: 1300, redline: 10500 },
    weight: 199, topSpeed: 210, price: 7500,
    liveries: [livery('Pearl Glacier White', W, '#1b1c1f', '#1747a6', { frame: '#1747a6' }), livery('Glass Sparkle Black', BLK, '#2c2d31', '#c8102e')],
    look: { headlight: 'round', extras: ['trellis'] },
    description: 'Klasik 90° V-twin naked; eğlenceli ve dürüst.',
  }),

  // ───────────────────────────── Ducati ─────────────────────────────
  bike({
    id: 'ducati-panigale-v4s', brand: 'Ducati', model: 'Panigale V4 S', year: 2024, style: 'sport',
    engine: { layout: 'V4', cc: 1103, hp: 215, hpRpm: 13000, torque: 123.6, torqueRpm: 9500, idle: 1200, redline: 14500, limiter: 15000 },
    quickshifter: true, weight: 198, topSpeed: 305, price: 31000,
    liveries: [
      livery('Ducati Red', '#cc0a0a', '#a00808', W, { pattern: 'solid', wheel: '#1b1c1f', suit: ['#cc0a0a', BLK] }),
      livery('Black / Red', '#1a1b1e', '#cc0a0a', W, { pattern: 'split', suit: [BLK, '#cc0a0a'] }),
    ],
    look: { extras: ['winglets', 'singleSided', 'bellypan'], wheel: 'cast3' },
    description: 'Desmosedici Stradale V4: "Twin Pulse" ateşlemeli MotoGP gürlemesi.',
  }),
  bike({
    id: 'ducati-panigale-v2', brand: 'Ducati', model: 'Panigale V2', year: 2024, style: 'sport',
    engine: { layout: 'L2', cc: 955, hp: 155, hpRpm: 10750, torque: 104, torqueRpm: 9000, idle: 1300, redline: 11500 },
    quickshifter: true, weight: 200, topSpeed: 280, price: 17000,
    liveries: [livery('Ducati Red', '#cc0a0a', '#a00808', W, { pattern: 'solid', suit: ['#cc0a0a', BLK] }), livery('White Rosso', W, '#cc0a0a', BLK, { pattern: 'split', wheel: '#cc0a0a' })],
    look: { extras: ['singleSided', 'bellypan'], wheel: 'cast5' },
    voice: { resonance: 175, brightness: 0.55 },
    description: 'Superquadro L-twin: derin, tok ve tok vuruşlu.',
  }),
  bike({
    id: 'ducati-streetfighter-v4', brand: 'Ducati', model: 'Streetfighter V4 S', year: 2024, style: 'naked',
    engine: { layout: 'V4', cc: 1103, hp: 208, hpRpm: 13000, torque: 123, torqueRpm: 9500, idle: 1200, redline: 14500 },
    quickshifter: true, weight: 199, topSpeed: 285, price: 25000,
    liveries: [livery('Ducati Red', '#cc0a0a', '#1b1c1f', W, { pattern: 'split', suit: ['#cc0a0a', BLK] }), livery('Dark Stealth', '#1a1b1e', '#2a2b2f', '#cc0a0a')],
    look: { extras: ['winglets', 'singleSided'], headlight: 'ledBar', wheel: 'cast3' },
    description: 'Panigale\'nin soyunmuş hali: kanatlı, öfkeli naked.',
  }),
  bike({
    id: 'ducati-monster', brand: 'Ducati', model: 'Monster +', year: 2024, style: 'naked',
    engine: { layout: 'L2', cc: 937, hp: 111, hpRpm: 9250, torque: 93, torqueRpm: 6500, idle: 1300, redline: 10500 },
    quickshifter: true, weight: 188, topSpeed: 245, price: 12500,
    liveries: [livery('Ducati Red', '#cc0a0a', '#1b1c1f', W, { wheel: '#1b1c1f', suit: ['#cc0a0a', BLK] }), livery('Aviator Grey', '#4f545b', '#1b1c1f', '#cc0a0a', { wheel: '#cc0a0a' })],
    look: { headlight: 'round', tank: 'muscle', extras: ['flyscreen'] },
    description: 'İkonik Monster: 937 cc Testastretta, saf sürüş keyfi.',
  }),
  bike({
    id: 'ducati-scrambler', brand: 'Ducati', model: 'Scrambler Icon', year: 2024, style: 'classic',
    engine: { layout: 'L2', cc: 803, hp: 73, hpRpm: 8250, torque: 65, torqueRpm: 7000, idle: 1200, redline: 9000 },
    weight: 189, topSpeed: 190, price: 10000,
    liveries: [livery("'62 Yellow", '#f2b705', '#1b1c1f', BLK, { pattern: 'solid', suit: ['#5a4632', '#1b1c1f'] }), livery('Ducati Red', '#cc0a0a', '#1b1c1f', BLK, { pattern: 'solid', suit: ['#5a4632', '#1b1c1f'] })],
    look: { wheel: 'cast10', exhaust: 'side', extras: ['fenderLong'] },
    voice: { resonance: 150, brightness: 0.42, roughness: 0.35 },
    description: 'Hava soğutmalı L-twin, 60\'ların özgürlük ruhu.',
  }),
  bike({
    id: 'ducati-multistrada-v4', brand: 'Ducati', model: 'Multistrada V4 S', year: 2024, style: 'adventure',
    engine: { layout: 'V4', cc: 1158, hp: 170, hpRpm: 10500, torque: 125, torqueRpm: 8750, idle: 1200, redline: 11000 },
    quickshifter: true, weight: 243, topSpeed: 260, price: 25000,
    liveries: [livery('Ducati Red', '#cc0a0a', '#1b1c1f', W, { wheel: '#2a2b2f', suit: ['#cc0a0a', BLK] }), livery('Iceberg White', W, '#2a2b2f', '#cc0a0a')],
    look: { wheel: 'cast5', frontWheelR: 0.33, frontTireW: 0.12, rearTireW: 0.17 },
    description: 'Dört motor bir arada: spor, tur, enduro ve şehir.',
  }),

  // ────────────────────────────── BMW ──────────────────────────────
  bike({
    id: 'bmw-s1000rr', brand: 'BMW', model: 'S 1000 RR', year: 2024, style: 'sport',
    engine: { layout: 'I4', cc: 999, hp: 210, hpRpm: 13750, torque: 113, torqueRpm: 11000, idle: 1200, redline: 14600 },
    quickshifter: true, weight: 197, topSpeed: 303, price: 18500,
    liveries: [
      livery('M Motorsport', W, '#1c69d4', '#d1001f', { pattern: 'tricolor', wheel: '#1c69d4', suit: [W, '#1c69d4'] }),
      livery('Black Storm Metallic', '#1b1c1f', '#2f3135', '#1c69d4', { pattern: 'solid' }),
    ],
    look: { extras: ['winglets', 'bellypan'] },
    voice: { resonance: 520 },
    description: 'ShiftCam teknolojili 999 cc; 14.600 devire kadar şiddetli.',
  }),
  bike({
    id: 'bmw-m1000rr', brand: 'BMW', model: 'M 1000 RR', year: 2024, style: 'sport',
    engine: { layout: 'I4', cc: 999, hp: 212, hpRpm: 14500, torque: 113, torqueRpm: 11000, idle: 1250, redline: 15100 },
    quickshifter: true, weight: 192, topSpeed: 314, price: 33000,
    liveries: [livery('M Motorsport Carbon', W, '#1c69d4', '#d1001f', { pattern: 'tricolor', wheel: '#2a2b2f', suit: [W, '#1c69d4'] })],
    look: { extras: ['winglets', 'bellypan'], wheel: 'cast7' },
    voice: { resonance: 560, brightness: 0.88 },
    description: 'M bölümünün homologasyon canavarı; karbon kanatlarla.',
  }),
  bike({
    id: 'bmw-r1250gs', brand: 'BMW', model: 'R 1250 GS', year: 2023, style: 'adventure',
    engine: { layout: 'BOXER', cc: 1254, hp: 136, hpRpm: 7750, torque: 143, torqueRpm: 6250, idle: 1000, redline: 9000 },
    weight: 249, topSpeed: 220, price: 18000,
    liveries: [livery('Trophy', W, '#1c69d4', '#d1001f', { pattern: 'tricolor', wheel: '#c8a14b', suit: ['#3a3c40', '#1c69d4'] }), livery('Triple Black', '#1b1c1f', '#2f3135', '#9aa3ad', { wheel: '#2f3135' })],
    look: { extras: ['crashbars', 'windscreenTall', 'singleSided'] },
    description: 'Macera sınıfının ölçütü: ShiftCam boxer ve Paralever.',
  }),
  bike({
    id: 'bmw-k1600gt', brand: 'BMW', model: 'K 1600 GT', year: 2024, style: 'touring',
    engine: { layout: 'I6', cc: 1649, hp: 160, hpRpm: 7750, torque: 180, torqueRpm: 5250, idle: 900, redline: 8500 },
    weight: 343, topSpeed: 250, price: 25000,
    liveries: [livery('Blue Ridge Metallic', '#24426b', '#16243a', '#c4c7cc', { pattern: 'solid' }), livery('Black Storm', '#1b1c1f', '#2f3135', '#c4c7cc', { pattern: 'solid' })],
    look: { extras: ['panniers', 'windscreenTall', 'singleSided'] },
    description: 'Sıralı altı: ipeksi güç ve Avrupa\'yı bir depoda geçme konforu.',
  }),
  bike({
    id: 'bmw-r18', brand: 'BMW', model: 'R 18', year: 2024, style: 'cruiser',
    engine: { layout: 'BOXER', cc: 1802, hp: 91, hpRpm: 4750, torque: 158, torqueRpm: 3000, idle: 950, redline: 5750 },
    weight: 345, topSpeed: 180, price: 17500,
    liveries: [livery('Black Storm', '#141518', '#2f3135', '#d0d3d8', { pattern: 'stripes', suit: ['#3a2a1e', '#1b1c1f'] })],
    look: { wheel: 'spoke', exhaust: 'peashooter' },
    voice: { resonance: 110, brightness: 0.3, roughness: 0.25 },
    description: 'BMW tarihinin en büyük boxer motoru; 1.8 litre krom heykel.',
  }),

  // ────────────────────────────── KTM ──────────────────────────────
  bike({
    id: 'ktm-1290-superduke-r', brand: 'KTM', model: '1290 Super Duke R Evo', year: 2024, style: 'naked',
    engine: { layout: 'V2_75', cc: 1301, hp: 180, hpRpm: 9500, torque: 140, torqueRpm: 8000, idle: 1300, redline: 10500 },
    quickshifter: true, weight: 210, topSpeed: 290, price: 20000,
    liveries: [livery('KTM Orange', '#ff6600', '#1b1c1f', W, { frame: '#ff6600', wheel: '#ff6600', suit: ['#ff6600', BLK] }), livery('Black', '#1b1c1f', '#ff6600', W, { frame: '#ff6600' })],
    look: { extras: ['trellis'], headlight: 'angular' },
    description: '"The Beast": 1301 cc LC8 V-twin, saf saldırganlık.',
  }),
  bike({
    id: 'ktm-390-duke', brand: 'KTM', model: '390 Duke', year: 2024, style: 'naked',
    engine: { layout: 'SINGLE', cc: 399, hp: 44, hpRpm: 8500, torque: 39, torqueRpm: 7000, idle: 1500, redline: 10500, limiter: 11000 },
    weight: 165, topSpeed: 170, price: 5800,
    liveries: [livery('Electronic Orange', '#ff6600', '#1b1c1f', W, { frame: '#ff6600', wheel: '#ff6600', suit: ['#ff6600', BLK] }), livery('Atlantic Blue', '#1d4f91', '#1b1c1f', '#ff6600', { wheel: '#ff6600' })],
    look: { extras: ['trellis'], frontTireW: 0.11, rearTireW: 0.15 },
    voice: { resonance: 170, brightness: 0.55 },
    description: 'Tek silindirli "corner rocket"; hafif ve sinirli.',
  }),
  bike({
    id: 'ktm-rc390', brand: 'KTM', model: 'RC 390', year: 2023, style: 'sport',
    engine: { layout: 'SINGLE', cc: 373, hp: 43, hpRpm: 9000, torque: 37, torqueRpm: 7000, idle: 1500, redline: 10500, limiter: 11000 },
    weight: 172, topSpeed: 170, price: 6000,
    liveries: [livery('Electronic Orange / Black / Blue', '#ff6600', '#16171a', '#1f63c6', { pattern: 'racing', frame: '#ff6600', wheel: '#ff6600', suit: ['#ff6600', BLK] })],
    look: { frontTireW: 0.11, rearTireW: 0.15, extras: [] },
    voice: { resonance: 175, brightness: 0.55 },
    description: 'Pist ruhlu tek silindir: Moto3 tasarımı.',
  }),
  bike({
    id: 'ktm-890-adventure-r', brand: 'KTM', model: '890 Adventure R', year: 2023, style: 'adventure',
    engine: { layout: 'V2_75', cc: 889, hp: 103, hpRpm: 8000, torque: 100, torqueRpm: 6500, idle: 1400, redline: 9500 },
    weight: 210, topSpeed: 210, price: 14500,
    liveries: [livery('Rally Orange', '#ff6600', W, '#1d4f91', { frame: '#1d4f91', wheel: '#1b1c1f', suit: ['#ff6600', '#1d4f91'] })],
    look: { headlight: 'ledBar', exhaust: 'side', extras: ['windscreenTall'] },
    description: '435° krank ile V-twin karakterli rally makinesi.',
  }),

  // ──────────────────────────── Aprilia ────────────────────────────
  bike({
    id: 'aprilia-rsv4', brand: 'Aprilia', model: 'RSV4 Factory', year: 2024, style: 'sport',
    engine: { layout: 'V4A', cc: 1099, hp: 217, hpRpm: 13000, torque: 125, torqueRpm: 10500, idle: 1300, redline: 14000 },
    quickshifter: true, weight: 202, topSpeed: 305, price: 26000,
    liveries: [livery('Ultra Dark', '#17181b', '#2c2e33', '#d8202e', { pattern: 'racing', wheel: '#d8202e', suit: [BLK, '#d8202e'] }), livery('Racing Tricolor', '#1b1c1f', '#d8202e', '#6a3cbc', { pattern: 'tricolor', suit: [BLK, '#6a3cbc'] })],
    look: { extras: ['winglets', 'bellypan'] },
    description: '65° V4: MotoGP\'deki en "tok" ses; Noale\'nin şaheseri.',
  }),
  bike({
    id: 'aprilia-tuono-v4', brand: 'Aprilia', model: 'Tuono V4 Factory', year: 2024, style: 'naked',
    engine: { layout: 'V4A', cc: 1077, hp: 175, hpRpm: 11350, torque: 121, torqueRpm: 9000, idle: 1300, redline: 12500 },
    quickshifter: true, weight: 209, topSpeed: 280, price: 21000,
    liveries: [livery('Factory Dark', '#17181b', '#2c2e33', '#d8202e', { wheel: '#d8202e', suit: [BLK, '#d8202e'] })],
    look: { fairing: 'half', headlight: 'sportTwin', extras: ['winglets'] },
    description: 'Kaslı V4 hypernaked: RSV4\'ün yarı-çıplak kardeşi.',
  }),
  bike({
    id: 'aprilia-rs660', brand: 'Aprilia', model: 'RS 660', year: 2024, style: 'sport',
    engine: { layout: 'P2_270', cc: 659, hp: 100, hpRpm: 10500, torque: 67, torqueRpm: 8500, idle: 1500, redline: 11500 },
    quickshifter: true, weight: 183, topSpeed: 240, price: 11300,
    liveries: [livery('Lava Red', '#d8202e', '#1b1c1f', '#6a3cbc', { pattern: 'split', suit: ['#d8202e', BLK] }), livery('Acid Gold', '#1b1c1f', '#c9b037', '#6a3cbc', { pattern: 'racing', wheel: '#c9b037' })],
    look: { extras: ['winglets'] },
    voice: { resonance: 210 },
    description: 'RSV4 ön yarısından türeyen 270° paralel ikili.',
  }),

  // ──────────────────────────── Triumph ────────────────────────────
  bike({
    id: 'triumph-speed-triple', brand: 'Triumph', model: 'Speed Triple 1200 RS', year: 2024, style: 'naked',
    engine: { layout: 'I3', cc: 1160, hp: 180, hpRpm: 10750, torque: 125, torqueRpm: 9000, idle: 1100, redline: 11150 },
    quickshifter: true, weight: 198, topSpeed: 270, price: 19500,
    liveries: [livery('Granite / Diablo Red', '#4a4d52', '#b5121b', '#d6d8dc', { pattern: 'split', suit: [BLK, '#b5121b'] }), livery('Sapphire Black', '#141518', '#2a2c30', '#e8c23a')],
    look: { headlight: 'round', extras: ['singleSided'] },
    voice: { resonance: 280 },
    description: 'Üç silindirin kükremesi; streetfighter türünün atası.',
  }),
  bike({
    id: 'triumph-street-triple', brand: 'Triumph', model: 'Street Triple 765 RS', year: 2024, style: 'naked',
    engine: { layout: 'I3', cc: 765, hp: 130, hpRpm: 12000, torque: 80, torqueRpm: 9500, idle: 1200, redline: 12650 },
    quickshifter: true, weight: 188, topSpeed: 250, price: 13000,
    liveries: [livery('Silver Ice / Carnival Red', '#aeb3ba', '#1b1c1f', '#b5121b', { wheel: '#1b1c1f', suit: [BLK, '#b5121b'] }), livery('Carbon Black / Carnival Red', '#17181b', '#b5121b', '#aeb3ba', { wheel: '#1b1c1f', pattern: 'solid', suit: [BLK, '#b5121b'] })],
    look: { headlight: 'angular' },
    voice: { resonance: 330, brightness: 0.78 },
    description: 'Moto2 motorundan türeyen hafif üçlü.',
  }),
  bike({
    id: 'triumph-bonneville-t120', brand: 'Triumph', model: 'Bonneville T120', year: 2024, style: 'classic',
    engine: { layout: 'P2_270', cc: 1200, hp: 79, hpRpm: 6550, torque: 105, torqueRpm: 3500, idle: 800, redline: 7000 },
    weight: 236, topSpeed: 190, price: 13500,
    liveries: [livery('Jet Black', '#121316', '#2b2d31', W, { pattern: 'solid', suit: ['#3a2a1e', '#1b1c1f'] }), livery('Cordovan Red / Silver', '#5c1a1b', '#c0c4c9', W, { pattern: 'split', suit: ['#3a2a1e', '#1b1c1f'] })],
    voice: { resonance: 130, brightness: 0.35, roughness: 0.32 },
    description: '1959\'dan bugüne İngiliz klasiği; tok 270° ikili.',
  }),
  bike({
    id: 'triumph-rocket3', brand: 'Triumph', model: 'Rocket 3 R', year: 2024, style: 'cruiser',
    engine: { layout: 'I3', cc: 2458, hp: 165, hpRpm: 6000, torque: 221, torqueRpm: 4000, idle: 900, redline: 7000 },
    weight: 318, topSpeed: 220, price: 24000,
    liveries: [livery('Sapphire Black', '#141518', '#2a2c30', '#c4c7cc', { pattern: 'solid' }), livery('Carnival Red', '#8d1016', '#141518', '#c4c7cc')],
    look: { tank: 'muscle', exhaust: 'organ', headlight: 'round', handlebar: 'wide', rearTireW: 0.24 },
    voice: { resonance: 180, brightness: 0.45, roughness: 0.25 },
    description: 'Dünyanın en büyük seri üretim motosiklet motoru: 2458 cc.',
  }),

  // ──────────────────────── Harley-Davidson / LiveWire ────────────────────────
  bike({
    id: 'harley-street-glide', brand: 'Harley-Davidson', model: 'Street Glide', year: 2024, style: 'touring',
    engine: { layout: 'V2_45', cc: 1923, hp: 105, hpRpm: 5020, torque: 175, torqueRpm: 3500, idle: 850, redline: 5500 },
    weight: 375, topSpeed: 180, price: 27000,
    liveries: [livery('Vivid Black', '#0f1012', '#2a2c30', '#d0d3d8', { pattern: 'solid', suit: ['#2a1d14', '#0f1012'] }), livery('Whiskey Fire', '#7a2a12', '#1b1c1f', GOLD, { pattern: 'solid', suit: ['#2a1d14', '#0f1012'] })],
    look: { fairing: 'batwing', headlight: 'batwing', extras: ['panniers', 'chromeEngine'], handlebar: 'cruiser', wheel: 'cast10', rake: 0.47 },
    description: 'Milwaukee-Eight 117: "potato-potato" vuruşlu Amerikan yol kralı.',
  }),
  bike({
    id: 'harley-fat-boy', brand: 'Harley-Davidson', model: 'Fat Boy 114', year: 2024, style: 'cruiser',
    engine: { layout: 'V2_45', cc: 1868, hp: 93, hpRpm: 5020, torque: 155, torqueRpm: 3250, idle: 850, redline: 5500 },
    weight: 317, topSpeed: 175, price: 21000,
    liveries: [livery('Vivid Black', '#0f1012', '#2a2c30', '#d0d3d8', { pattern: 'solid', wheel: '#c0c4c9', suit: ['#2a1d14', '#0f1012'] }), livery('Billiard Gray', '#5a5e63', '#2a2c30', '#d0d3d8', { pattern: 'solid', wheel: '#c0c4c9' })],
    look: { wheel: 'disc' },
    description: 'Disk jantlar, şişman lastikler ve 1868 cc tok vuruş.',
  }),
  bike({
    id: 'harley-pan-america', brand: 'Harley-Davidson', model: 'Pan America 1250 Special', year: 2024, style: 'adventure',
    engine: { layout: 'L2', cc: 1252, hp: 150, hpRpm: 9000, torque: 127, torqueRpm: 6750, idle: 1100, redline: 9500 },
    weight: 258, topSpeed: 220, price: 21000,
    liveries: [livery('Baja Orange / Black', '#d65a14', '#1b1c1f', '#c4c7cc', { suit: ['#3a3c40', '#d65a14'] }), livery('Vivid Black', '#0f1012', '#2a2c30', '#c4c7cc')],
    look: { headlight: 'ledBar', exhaust: 'side', wheel: 'cast5' },
    voice: { resonance: 150 },
    description: 'Revolution Max 1250: Harley\'nin yüksek devirli macera V-twin\'i.',
  }),
  bike({
    id: 'livewire-one', brand: 'LiveWire', model: 'One', year: 2023, style: 'naked',
    engine: { layout: 'ELECTRIC', cc: 0, hp: 100, hpRpm: 8000, torque: 116, torqueRpm: 0, idle: 0, redline: 15000, limiter: 15000 },
    weight: 249, topSpeed: 177, price: 23000,
    liveries: [livery('Black / Copper', '#141518', '#a8572e', '#d0d3d8', { pattern: 'split', suit: [BLK, '#a8572e'] })],
    look: { exhaust: 'none', headlight: 'round' },
    description: 'Tamamen elektrikli: sessiz, anlık tork ve jet türbini ıslığı.',
  }),

  // ─────────────────────────── MV Agusta ───────────────────────────
  bike({
    id: 'mv-agusta-f3-rr', brand: 'MV Agusta', model: 'F3 RR', year: 2024, style: 'sport',
    engine: { layout: 'I3', cc: 798, hp: 147, hpRpm: 13000, torque: 88, torqueRpm: 10100, idle: 1300, redline: 14000 },
    quickshifter: true, weight: 190, topSpeed: 270, price: 21000,
    liveries: [livery('Ago Red / Silver', '#b0121a', '#c0c4c9', W, { pattern: 'split', suit: ['#b0121a', '#c0c4c9'] }), livery('Avio Grey', '#5a5e63', '#1b1c1f', '#b0121a')],
    look: { exhaust: 'organ', extras: ['singleSided', 'winglets'] },
    voice: { resonance: 360, brightness: 0.85 },
    description: 'Ters dönen krank milli üçlü ve "org borulu" egzoz.',
  }),
  bike({
    id: 'mv-agusta-brutale-1000-rr', brand: 'MV Agusta', model: 'Brutale 1000 RR', year: 2024, style: 'naked',
    engine: { layout: 'I4', cc: 998, hp: 208, hpRpm: 13000, torque: 116.5, torqueRpm: 11000, idle: 1300, redline: 14000 },
    quickshifter: true, weight: 208, topSpeed: 300, price: 33000,
    liveries: [livery('Rosso Ago / Argento Metal', '#b0121a', '#b9bdc3', W, { frame: '#a8121b', wheel: '#1b1c1f', pattern: 'split', suit: ['#b0121a', BLK] }), livery('Nero Ago / Rosso', '#14151a', '#b0121a', '#b9bdc3', { frame: '#a8121b', wheel: '#1b1c1f', pattern: 'solid', suit: [BLK, '#b0121a'] })],
    look: { exhaust: 'organ', headlight: 'round', extras: ['singleSided', 'winglets', 'trellis'] },
    voice: { resonance: 480 },
    description: 'Radyal subaplı dörtlü ve 300 km/s ile en hızlı naked.',
  }),

  // ───────────────────────── Royal Enfield ─────────────────────────
  bike({
    id: 're-interceptor-650', brand: 'Royal Enfield', model: 'Interceptor 650', year: 2024, style: 'classic',
    engine: { layout: 'P2_270', cc: 648, hp: 47, hpRpm: 7150, torque: 52, torqueRpm: 5150, idle: 1000, redline: 7500 },
    weight: 217, topSpeed: 165, price: 6000,
    liveries: [livery('Orange Crush', '#d9561b', W, '#c0c4c9', { pattern: 'split', suit: ['#3a2a1e', '#1b1c1f'] }), livery('Baker Express', '#1f4e8c', W, '#c0c4c9', { pattern: 'split' })],
    voice: { resonance: 135, brightness: 0.32 },
    description: 'Hava-yağ soğutmalı 270° ikili: dürüst, tok ve klasik.',
  }),
  bike({
    id: 're-classic-350', brand: 'Royal Enfield', model: 'Classic 350', year: 2024, style: 'classic',
    engine: { layout: 'SINGLE', cc: 349, hp: 20.2, hpRpm: 6100, torque: 27, torqueRpm: 4000, idle: 900, redline: 6500 },
    gears: 5, weight: 195, topSpeed: 115, price: 4400,
    liveries: [livery('Halcyon Green', '#2f5a45', '#1b1c1f', '#c0c4c9', { pattern: 'stripes', suit: ['#3a2a1e', '#1b1c1f'] }), livery('Stealth Black', '#121316', '#2a2c30', GOLD, { pattern: 'stripes' })],
    voice: { resonance: 105, brightness: 0.25, roughness: 0.4, crackle: 0.15 },
    description: 'Efsanevi "thump": uzun stroklu tek silindirin nabzı.',
  }),

  // ──────────────────────────── Indian ────────────────────────────
  bike({
    id: 'indian-chief', brand: 'Indian', model: 'Chief Dark Horse', year: 2024, style: 'cruiser',
    engine: { layout: 'V2_45', cc: 1890, hp: 86, hpRpm: 4600, torque: 162, torqueRpm: 2900, idle: 850, redline: 5500 },
    weight: 304, topSpeed: 180, price: 19000,
    liveries: [livery('Black Smoke', '#18191c', '#2a2c30', '#b8bcc4', { pattern: 'solid', suit: ['#2a1d14', '#0f1012'] }), livery('Indian Red', '#7c1416', '#18191c', GOLD, { pattern: 'solid' })],
    look: { headlight: 'round' },
    voice: { resonance: 100 },
    description: 'Thunderstroke 116: 49° V-twin ve Amerikan ağır demiri.',
  }),
  bike({
    id: 'indian-ftr', brand: 'Indian', model: 'FTR 1200 S', year: 2024, style: 'naked',
    engine: { layout: 'V2_60', cc: 1203, hp: 123, hpRpm: 8250, torque: 120, torqueRpm: 6000, idle: 1100, redline: 9000 },
    weight: 230, topSpeed: 230, price: 15500,
    liveries: [livery('Indian Red / Black', '#b0121a', '#18191c', W, { frame: '#b0121a', suit: [BLK, '#b0121a'] })],
    look: { headlight: 'round', exhaust: 'high', wheel: 'cast5', frontWheelR: 0.33 },
    description: 'Flat-track yarışlarından ilham alan 60° V-twin.',
  }),

  // ───────────────────────── Husqvarna / Vespa / Benelli / CFMoto ─────────────────────────
  bike({
    id: 'husqvarna-svartpilen-401', brand: 'Husqvarna', model: 'Svartpilen 401', year: 2024, style: 'classic',
    engine: { layout: 'SINGLE', cc: 399, hp: 44, hpRpm: 8500, torque: 39, torqueRpm: 7000, idle: 1500, redline: 10500, limiter: 11000 },
    weight: 159, topSpeed: 170, price: 5900,
    liveries: [livery('Granite Grey / Silver', '#4b4f55', '#1b1c1f', '#c3c7cc', { pattern: 'solid', wheel: '#1b1c1f', frame: '#1b1c1f', suit: ['#3a3c40', BLK] }), livery('Ebony Black / Silver', '#16171a', '#c3c7cc', '#e5e7ea', { pattern: 'solid', wheel: '#1b1c1f', frame: '#1b1c1f', suit: [BLK, '#c3c7cc'] })],
    look: { wheel: 'spoke', exhaust: 'side', extras: ['flyscreen'] },
    voice: { resonance: 165, brightness: 0.5 },
    description: 'İsveç tasarımı modern scrambler; hafif tek silindir.',
  }),
  bike({
    id: 'vespa-gts-300', brand: 'Vespa', model: 'GTS 300 HPE', year: 2024, style: 'scooter',
    engine: { layout: 'SINGLE', cc: 278, hp: 23.8, hpRpm: 8250, torque: 26, torqueRpm: 5250, idle: 1700, redline: 9000 },
    transmission: 'cvt', gears: 1, weight: 160, topSpeed: 128, price: 7000,
    liveries: [livery('Verde Amabile', '#7fb7a4', '#e9e3d1', '#c0c4c9', { pattern: 'solid', seat: '#5a3b26', suit: ['#d9c9a8', '#5a3b26'] }), livery('Rosso Passione', '#b0121a', '#e9e3d1', '#c0c4c9', { pattern: 'solid', seat: '#2a1d14' })],
    voice: { resonance: 190, brightness: 0.4, loudness: -3 },
    description: 'İtalyan ikonu: çelik monokok gövde, CVT ve şehir şıklığı.',
  }),
  bike({
    id: 'benelli-trk-502x', brand: 'Benelli', model: 'TRK 502 X', year: 2024, style: 'adventure',
    engine: { layout: 'P2_360', cc: 500, hp: 47.6, hpRpm: 8500, torque: 46, torqueRpm: 6000, idle: 1300, redline: 9500 },
    weight: 235, topSpeed: 160, price: 6000,
    liveries: [livery('Metal Gri', '#5a5e63', '#1b1c1f', '#2e7d32', { wheel: '#9ea3aa' }), livery('Beyaz', W, '#1b1c1f', '#b0121a', { wheel: '#9ea3aa' })],
    look: { extras: ['crashbars', 'windscreenTall', 'panniers'] },
    description: 'Türkiye yollarının favori macera ikilisi.',
  }),
  bike({
    id: 'cfmoto-800nk', brand: 'CFMoto', model: '800NK', year: 2024, style: 'naked',
    engine: { layout: 'P2_270', cc: 799, hp: 95, hpRpm: 9250, torque: 81, torqueRpm: 8000, idle: 1300, redline: 10000 },
    weight: 200, topSpeed: 220, price: 8500,
    liveries: [livery('Nebula Black', '#17181b', '#2c2e33', '#00b7c2', { wheel: '#00b7c2' }), livery('Zircon Black / Orange', '#17181b', '#ff6a13', W)],
    look: { headlight: 'ledBar' },
    description: 'KTM kökenli 799 cc ikili ve agresif tasarım.',
  }),
];

export const BIKE_BY_ID: ReadonlyMap<string, BikeSpec> = new Map(BIKES.map((b) => [b.id, b]));

export const BRANDS: string[] = [...new Set(BIKES.map((b) => b.brand))];

export const STARTER_BIKE_ID = 'yamaha-r3';

export function getBike(id: string): BikeSpec {
  const b = BIKE_BY_ID.get(id);
  if (!b) throw new Error(`Unknown bike id: ${id}`);
  return b;
}

/** Firing angles in crank degrees across one 720° four-stroke cycle. */
export const FIRING_ANGLES: Record<EngineLayout, number[]> = {
  I4: [0, 180, 360, 540],
  I4CP: [0, 270, 450, 540],
  V4: [0, 90, 290, 380],
  V4A: [0, 245, 360, 605],
  L2: [0, 270],
  V2_45: [0, 315],
  V2_60: [0, 420],
  V2_75: [0, 435],
  P2_180: [0, 180],
  P2_270: [0, 270],
  P2_360: [0, 360],
  I3: [0, 240, 480],
  SINGLE: [0],
  BOXER: [0, 360],
  I6: [0, 120, 240, 360, 480, 600],
  F6: [0, 120, 240, 360, 480, 600],
  ELECTRIC: [],
};

export const STYLE_LABEL: Record<BikeStyle, string> = {
  sport: 'Süpersport',
  hyper: 'Hypersport',
  naked: 'Naked',
  adventure: 'Macera',
  touring: 'Tur',
  cruiser: 'Cruiser',
  classic: 'Klasik',
  scooter: 'Skuter',
};

export const LAYOUT_LABEL: Record<EngineLayout, string> = {
  I4: 'Sıralı 4',
  I4CP: 'Sıralı 4 (Crossplane)',
  V4: 'V4 (Twin Pulse)',
  V4A: 'V4 65°',
  L2: 'L-twin 90°',
  V2_45: 'V-twin 45°',
  V2_60: 'V-twin 60°',
  V2_75: 'V-twin 75°',
  P2_180: 'Paralel ikili 180°',
  P2_270: 'Paralel ikili 270°',
  P2_360: 'Paralel ikili 360°',
  I3: 'Sıralı 3',
  SINGLE: 'Tek silindir',
  BOXER: 'Boxer ikili',
  I6: 'Sıralı 6',
  F6: 'Yatay 6',
  ELECTRIC: 'Elektrik motoru',
};
