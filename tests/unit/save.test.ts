import { describe, expect, it } from 'vitest';
import { BIKES, STARTER_BIKE_ID, getBike } from '../../src/data/bikes';
import {
  MemoryStore,
  SAVE_KEY,
  SAVE_VERSION,
  STARTING_CASH,
  SaveManager,
  defaultSave,
  sanitizeSave,
  type KeyValueStore,
} from '../../src/storage/save';

describe('save data sanitising', () => {
  it('returns defaults for garbage', () => {
    for (const junk of [null, undefined, 42, 'x', [], { cash: 'lots' }]) {
      const d = sanitizeSave(junk);
      expect(d.ownedBikes).toContain(STARTER_BIKE_ID);
      expect(d.selectedBike).toBe(STARTER_BIKE_ID);
      expect(Number.isFinite(d.cash)).toBe(true);
    }
  });

  it('drops unknown bikes, clamps numbers and fixes selection', () => {
    const d = sanitizeSave({
      cash: -50,
      ownedBikes: ['yamaha-r1', 'not-a-bike', 'yamaha-r1', 7],
      selectedBike: 'not-a-bike',
      liveryChoice: { 'yamaha-r1': 99, ghost: 1 },
      upgrades: { 'yamaha-r1': { engine: 12, brakes: -3, handling: 2.6 } },
      highScores: { endless: 1234.7, bogus: 5, twoway: -9 },
      settings: { quality: 'insane', masterVolume: 7, units: 'mph', autoShift: 'yes' },
    });
    expect(d.cash).toBe(0);
    expect(d.ownedBikes).toEqual([STARTER_BIKE_ID, 'yamaha-r1']);
    expect(d.selectedBike).toBe(STARTER_BIKE_ID);
    expect(d.liveryChoice['yamaha-r1']).toBe(getBike('yamaha-r1').liveries.length - 1);
    expect(d.liveryChoice.ghost).toBeUndefined();
    expect(d.upgrades['yamaha-r1']).toEqual({ engine: 5, brakes: 0, handling: 3 });
    expect(d.highScores).toEqual({ endless: 1234 });
    expect(d.settings.quality).toBe('high');
    expect(d.settings.masterVolume).toBe(1);
    expect(d.settings.units).toBe('mph');
    expect(d.settings.autoShift).toBe(true);
  });

  it('migrates v1 saves', () => {
    const d = sanitizeSave({ version: 1, bike: 'yamaha-r1', bikes: ['yamaha-r1'], bestScore: 999, cash: 10 });
    expect(d.version).toBe(SAVE_VERSION);
    expect(d.selectedBike).toBe('yamaha-r1');
    expect(d.highScores.endless).toBe(999);
  });
});

describe('SaveManager', () => {
  it('persists and reloads through the store', () => {
    const store = new MemoryStore();
    const a = new SaveManager(store);
    a.data.cash = 100000;
    a.save();
    expect(a.buy('ducati-panigale-v4s')).toBe(true);
    a.setLivery('ducati-panigale-v4s', 1);
    a.updateSettings({ units: 'mph', camera: 'helmet' });
    const b = new SaveManager(store);
    expect(b.data.ownedBikes).toContain('ducati-panigale-v4s');
    expect(b.data.selectedBike).toBe('ducati-panigale-v4s');
    expect(b.livery('ducati-panigale-v4s')).toBe(1);
    expect(b.data.cash).toBe(100000 - getBike('ducati-panigale-v4s').price);
    expect(b.data.settings.units).toBe('mph');
    expect(b.data.settings.camera).toBe('helmet');
  });

  it('refuses to buy twice, unaffordable or unknown bikes', () => {
    const m = new SaveManager(new MemoryStore());
    expect(m.data.cash).toBe(STARTING_CASH);
    expect(m.buy(STARTER_BIKE_ID)).toBe(false);
    expect(m.buy('kawasaki-h2r')).toBe(false);
    expect(m.buy('nope')).toBe(false);
    expect(m.select('kawasaki-h2r')).toBe(false);
    expect(m.data.cash).toBe(STARTING_CASH);
  });

  it('upgrades cost money and cap at max level', () => {
    const m = new SaveManager(new MemoryStore());
    m.data.cash = 1e7;
    for (let i = 0; i < 5; i++) expect(m.upgrade(STARTER_BIKE_ID, 'engine')).toBe(true);
    expect(m.upgrade(STARTER_BIKE_ID, 'engine')).toBe(false);
    expect(m.upgradesFor(STARTER_BIKE_ID).engine).toBe(5);
    expect(m.data.cash).toBeLessThan(1e7);
    expect(m.upgrade('kawasaki-h2r', 'engine')).toBe(false);
  });

  it('records runs, high scores and cash', () => {
    const m = new SaveManager(new MemoryStore());
    expect(m.recordRun('endless', { score: 5000, distance: 3000, nearMisses: 7, topSpeed: 210 }, 500)).toBe(true);
    expect(m.recordRun('endless', { score: 4000, distance: 1000, nearMisses: 1, topSpeed: 150 }, 100)).toBe(false);
    expect(m.data.highScores.endless).toBe(5000);
    expect(m.data.cash).toBe(STARTING_CASH + 600);
    expect(m.data.gamesPlayed).toBe(2);
    expect(m.data.totalNearMisses).toBe(8);
    expect(m.data.topSpeedEver).toBe(210);
  });

  it('survives corrupted JSON and keeps a backup', () => {
    const store = new MemoryStore();
    store.setItem(SAVE_KEY, '{"cash": 5,,,');
    const m = new SaveManager(store);
    expect(m.data).toEqual(defaultSave());
    expect(store.getItem(`${SAVE_KEY}.corrupt`)).toBe('{"cash": 5,,,');
    expect(m.lastError).not.toBeNull();
  });

  it('reports failure when the store throws (quota exceeded)', () => {
    const broken: KeyValueStore = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => undefined,
    };
    const m = new SaveManager(broken);
    expect(m.save()).toBe(false);
    expect(m.lastError).toContain('Quota');
  });

  it('reset keeps settings but wipes progress', () => {
    const m = new SaveManager(new MemoryStore());
    m.data.cash = 999999;
    m.buy(BIKES[0].id);
    m.updateSettings({ units: 'mph' });
    m.reset();
    expect(m.data.cash).toBe(STARTING_CASH);
    expect(m.data.ownedBikes).toEqual([STARTER_BIKE_ID]);
    expect(m.data.settings.units).toBe('mph');
  });
});
