import { describe, expect, it } from 'vitest';
import { BIKES, type BikeSpec } from '../../src/data/bikes';
import { VOICE_CALIB } from '../../src/audio/voiceCalib';
import { CALIB_RMS_CAP_DB, CALIB_TARGET_A_DB, measureLoudness } from '../../src/audio/dsp/calibrate';
import { bikeDistance, bikeFeatures, type BikeFeatures } from '../../src/audio/dsp/features';
import { BIKE_VOICES, voiceParams } from '../../src/audio/voices';

describe('per-bike voices', () => {
  it('has an entry for every bike in the catalogue and none for unknown bikes', () => {
    const ids = new Set(BIKES.map((b) => b.id));
    for (const b of BIKES) expect(BIKE_VOICES[b.id], b.id).toBeDefined();
    for (const id of Object.keys(BIKE_VOICES)) expect(ids.has(id), `stale voice ${id}`).toBe(true);
    for (const b of BIKES) expect(VOICE_CALIB[b.id], `${b.id} calibration`).toBeGreaterThan(0);
  });

  it('every voice resolves to finite, sane synthesiser parameters', () => {
    for (const b of BIKES) {
      const p = voiceParams(b);
      const electric = b.engine.layout === 'ELECTRIC';
      expect(p.kind).toBe(electric ? 'electric' : 'combustion');
      expect(p.idle).toBe(b.engine.idle);
      expect(p.redline).toBe(b.engine.redline);
      expect(p.calib).toBeGreaterThan(0.01);
      expect(p.calib).toBeLessThan(40);
      expect(BIKE_VOICES[b.id].note.length, `${b.id} note`).toBeGreaterThan(20);
      if (electric) {
        expect(p.firing).toEqual([]);
        expect(p.electric).not.toBeNull();
        continue;
      }
      expect(p.firing.length).toBeGreaterThan(0);
      expect(p.network.outlets.length).toBeGreaterThan(0);
      // Network integrity: valid node references, every cylinder has a port, tail pipes exist, and the graph is connected.
      const n = p.network.nodes.length;
      const ports = new Set<number>();
      for (const [i, node] of p.network.nodes.entries()) {
        if (node.k === 'port') {
          expect(node.cyl).toBeLessThan(p.firing.length);
          ports.add(node.cyl);
        }
        if (node.k === 'open') expect(node.out).toBeLessThan(p.network.outlets.length);
        expect(i).toBeLessThan(n);
      }
      expect(ports.size, `${b.id} cylinder ports`).toBe(p.firing.length);
      const adj = new Map<number, number[]>();
      for (const pipe of p.network.pipes) {
        expect(pipe.a).toBeLessThan(n);
        expect(pipe.b).toBeLessThan(n);
        expect(pipe.len).toBeGreaterThan(0.01);
        expect(pipe.len).toBeLessThan(4);
        (adj.get(pipe.a) ?? adj.set(pipe.a, []).get(pipe.a)!).push(pipe.b);
        (adj.get(pipe.b) ?? adj.set(pipe.b, []).get(pipe.b)!).push(pipe.a);
      }
      // True dual systems are separate sub-networks: each one needs a cylinder port and a radiating tail pipe.
      const seen = new Set<number>();
      for (let start = 0; start < n; start++) {
        if (seen.has(start)) continue;
        const comp = [start];
        seen.add(start);
        for (let k = 0; k < comp.length; k++) for (const m of adj.get(comp[k]) ?? []) if (!seen.has(m)) (seen.add(m), comp.push(m));
        expect(comp.some((i) => p.network.nodes[i].k === 'port'), `${b.id} sub-network ${start} has a port`).toBe(true);
        expect(comp.some((i) => p.network.nodes[i].k === 'open'), `${b.id} sub-network ${start} has a tail pipe`).toBe(true);
      }
      for (const v of [p.exhDuration, p.blowdown, p.roughness, p.gasC, p.crackle, p.backfire, p.loudness]) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('engine families that share hardware still differ in exhaust, intake or tune', () => {
    const families: string[][] = [
      ['honda-cb500-hornet', 'honda-rebel-500'],
      ['ducati-panigale-v4s', 'ducati-streetfighter-v4'],
      ['aprilia-rsv4', 'aprilia-tuono-v4'],
      ['ktm-390-duke', 'ktm-rc390', 'husqvarna-svartpilen-401'],
      ['suzuki-sv650', 'suzuki-vstrom650'],
      ['harley-street-glide', 'harley-fat-boy'],
      ['kawasaki-h2', 'kawasaki-h2r'],
      ['honda-cbr1000rr-r', 'bmw-m1000rr'],
      ['bmw-s1000rr', 'bmw-m1000rr'],
    ];
    for (const fam of families) {
      for (let i = 0; i < fam.length; i++) {
        for (let j = i + 1; j < fam.length; j++) {
          const a = voiceParams(BIKES.find((b) => b.id === fam[i])!);
          const b = voiceParams(BIKES.find((x) => x.id === fam[j])!);
          const same = JSON.stringify({ n: a.network, m: a.muffler, i: a.intake, t: [a.blowdown, a.rasp, a.exhDuration, a.crackle] }) === JSON.stringify({ n: b.network, m: b.muffler, i: b.intake, t: [b.blowdown, b.rasp, b.exhDuration, b.crackle] });
          expect(same, `${fam[i]} vs ${fam[j]}`).toBe(false);
        }
      }
    }
  });

  it('aftermarket exhausts change the voice and the Ducati dry clutch rattles more', () => {
    const b = BIKES.find((x) => x.id === 'ducati-panigale-v4s')!;
    const stock = voiceParams(b);
    const slip = voiceParams(b, { exhaustMod: 'slipon' });
    const race = voiceParams(b, { exhaustMod: 'race' });
    expect(race.crackle).toBeGreaterThanOrEqual(slip.crackle);
    expect(slip.crackle).toBeGreaterThan(stock.crackle - 1e-9);
    expect(race.loudness).toBeGreaterThan(slip.loudness);
    expect(slip.loudness).toBeGreaterThan(stock.loudness);
    expect(JSON.stringify(race.network)).not.toBe(JSON.stringify(stock.network));
    const dry = voiceParams(b, { dryClutch: true });
    expect(dry.mech.clutchRattle).toBeGreaterThan(stock.mech.clutchRattle);
    // Electric bikes ignore exhaust options.
    const e = BIKES.find((x) => x.engine.layout === 'ELECTRIC')!;
    expect(voiceParams(e, { exhaustMod: 'race' }).kind).toBe('electric');
  });

  it('loudness calibration table is in sync with the synthesiser (regenerate with tools/audio-lab.mjs calibrate)', { timeout: 120000 }, () => {
    for (const id of ['honda-cbr1000rr-r', 'harley-fat-boy', 'kawasaki-h2r', 'yamaha-tmax', 'livewire-one', 'ktm-390-duke', 'bmw-k1600gt']) {
      const b = BIKES.find((x) => x.id === id)!;
      const m = measureLoudness(voiceParams(b, { calib: false }), b.engine);
      const gain = Math.min(CALIB_TARGET_A_DB - m.aDb, CALIB_RMS_CAP_DB - m.rmsPeakDb);
      const want = Math.pow(10, gain / 20);
      const have = VOICE_CALIB[id];
      expect(Math.abs(20 * Math.log10(have / want)), `${id} calibration drift (dB)`).toBeLessThan(0.6);
    }
  });
});

/**
 * Distinctness: a feature vector per bike (third-octave spectrum shape, spectral centroid, tonal whine
 * salience, loudness, and the rhythm of the envelope folded on the 720° cycle — each at idle / mid / high
 * rpm and on/off throttle) must separate EVERY pair of bikes.
 *
 * Distances are in rough "audible differences" (see `bikeDistance`): ≥ 1 means a listener paying attention
 * hears a difference, ≥ 2 means it is obvious. The median pair is ≈ 3.9.
 *   - Documented siblings (same engine family, same class, same tune platform) must still be ≥ SIBLING_MIN.
 *   - Everything else must be ≥ CROSS_MIN.
 * The deliberately close pairs are listed below with the reason; a new accidental near-duplicate fails.
 */
const SIBLING_MIN = 1.5;
const CROSS_MIN = 1.8;
const SIBLINGS: { reason: string; ids: string[] }[] = [
  { reason: 'same Desmosedici Stradale V4, different intake/exhaust', ids: ['ducati-panigale-v4s', 'ducati-streetfighter-v4'] },
  { reason: 'same 645 cc 90° V-twin (SV650 / DL650), different can and airbox', ids: ['suzuki-sv650', 'suzuki-vstrom650'] },
  { reason: 'same Milwaukee-Eight 45° V-twin, touring vs shotgun duals', ids: ['harley-street-glide', 'harley-fat-boy'] },
  { reason: 'same 373/399 cc single (LC4c) in three bodies', ids: ['ktm-390-duke', 'ktm-rc390', 'husqvarna-svartpilen-401'] },
  { reason: 'litre-class flat-plane inline-fours and the supercharged H2 family', ids: ['honda-cbr1000rr-r', 'kawasaki-zx10r', 'suzuki-gsxr1000r', 'bmw-s1000rr', 'bmw-m1000rr', 'kawasaki-h2', 'kawasaki-h2r'] },
  { reason: 'middleweight flat-plane inline-fours', ids: ['yamaha-r6', 'kawasaki-zx6r', 'kawasaki-zx4rr', 'honda-cbr650r'] },
  { reason: 'RSV4 V4 in two bodies', ids: ['aprilia-rsv4', 'aprilia-tuono-v4'] },
  { reason: 'both 270°-class naked/retro twins', ids: ['yamaha-mt07', 'cfmoto-800nk', 'triumph-bonneville-t120', 're-interceptor-650'] },
];

describe('distinctness of the 60 bike voices', { timeout: 300000 }, () => {
  const feats: BikeFeatures[] = BIKES.map((b: BikeSpec) => bikeFeatures(voiceParams(b), b.engine));
  const related = (a: string, b: string): boolean => SIBLINGS.some((s) => s.ids.includes(a) && s.ids.includes(b));

  it('every pair of bikes is separated by at least the documented threshold', () => {
    const failures: string[] = [];
    let min = Infinity;
    for (let i = 0; i < feats.length; i++) {
      for (let j = i + 1; j < feats.length; j++) {
        const d = bikeDistance(feats[i], feats[j]);
        const need = related(feats[i].id, feats[j].id) ? SIBLING_MIN : CROSS_MIN;
        min = Math.min(min, d);
        if (d < need) failures.push(`${feats[i].id} ~ ${feats[j].id}: ${d.toFixed(2)} < ${need}`);
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
    expect(min).toBeGreaterThan(SIBLING_MIN);
  });

  it('every bike has a nearest neighbour that is clearly different, and the typical gap is large', () => {
    const nn = feats.map((f, i) => Math.min(...feats.map((g, j) => (i === j ? Infinity : bikeDistance(f, g)))));
    expect(Math.min(...nn)).toBeGreaterThan(SIBLING_MIN);
    const pairs: number[] = [];
    for (let i = 0; i < feats.length; i++) for (let j = i + 1; j < feats.length; j++) pairs.push(bikeDistance(feats[i], feats[j]));
    pairs.sort((a, b) => a - b);
    expect(pairs[pairs.length >> 1]).toBeGreaterThan(3);
    // 90 % of all pairs are "obviously different".
    expect(pairs[Math.floor(pairs.length * 0.1)]).toBeGreaterThan(2.3);
  });

  it('different engine architectures are far apart (not just different tunes)', () => {
    const f = (id: string): BikeFeatures => feats.find((x) => x.id === id)!;
    const d = (a: string, b: string): number => bikeDistance(f(a), f(b));
    // Crossplane vs flat-plane, V-twin vs inline-four, single vs triple, boxer vs V4, electric vs everything…
    expect(d('yamaha-r1', 'honda-cbr1000rr-r')).toBeGreaterThan(3);
    expect(d('harley-fat-boy', 'honda-cbr1000rr-r')).toBeGreaterThan(5);
    expect(d('ktm-390-duke', 'triumph-street-triple')).toBeGreaterThan(3);
    expect(d('bmw-r1250gs', 'ducati-panigale-v4s')).toBeGreaterThan(3);
    for (const b of feats) if (b.id !== 'livewire-one') expect(d('livewire-one', b.id), b.id).toBeGreaterThan(4);
  });
});
