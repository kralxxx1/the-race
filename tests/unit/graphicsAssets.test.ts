import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENVIRONMENTS } from '../../src/data/environments';
import { MAPS, TIMES_OF_DAY_FOR_TESTS, resolveEnvironment } from './graphicsEnv';
import { HDRIS, TEXTURE_MAPS, TEXTURE_SETS, clampHdrSun, hdriPath, manifestFiles, resolveRes, skyPath, texturePath, type HdriKey, type TextureKey } from '../../src/render/assets';
import { assetRequests } from '../../src/render/preload';
import { profileFromSettings } from '../../src/render/quality';
import { hdriFor, parseEnv } from '../../src/render/sky';
import { groundKey, surfaceKeys } from '../../src/render/surfaces';
import { SETTINGS, SettingsReader } from '../../src/settings';

const PUBLIC = 'public';

describe('asset manifest', () => {
  it('references only files that exist under public/', () => {
    const missing = manifestFiles().filter((f) => !existsSync(join(PUBLIC, f)));
    expect(missing).toEqual([]);
  });

  it('every texture set ships albedo, normal and ARM at each declared resolution', () => {
    for (const [key, def] of Object.entries(TEXTURE_SETS) as [TextureKey, (typeof TEXTURE_SETS)[TextureKey]][]) {
      expect(def.res.length, key).toBeGreaterThan(0);
      expect(def.res, key).toContain('1k');
      for (const r of def.res) for (const k of TEXTURE_MAPS) expect(existsSync(join(PUBLIC, texturePath(key, k, r))), `${key} ${k} ${r}`).toBe(true);
    }
  });

  it('stays within the asset budget (≤ 80 MB of new files)', () => {
    const total = manifestFiles().reduce((n, f) => n + statSync(join(PUBLIC, f)).size, 0);
    expect(total).toBeLessThan(80 * 1024 * 1024);
  });

  it('lists every asset with source URL, author and licence in LICENSES.md', () => {
    const md = readFileSync(join(PUBLIC, 'assets/LICENSES.md'), 'utf8');
    expect(md).toMatch(/CC0/);
    for (const [key, def] of Object.entries(TEXTURE_SETS)) {
      expect(md, `texture ${key}`).toContain(`| ${key} |`);
      expect(md, `texture ${key} source`).toMatch(new RegExp(`(polyhaven\\.com/a/${def.id}|ambientcg\\.com/a/${def.id})`));
      expect(md, `texture ${key} author`).toContain(def.authors.split(',')[0].trim());
    }
    for (const [key, def] of Object.entries(HDRIS)) {
      expect(md, `hdri ${key}`).toContain(`| ${key} |`);
      expect(md, `hdri ${key} source`).toContain(`polyhaven.com/a/${def.id}`);
    }
  });

  it('only ships JPEG/WebP/HDR files and no oversized single file', () => {
    for (const f of manifestFiles()) {
      expect(f).toMatch(/\.(webp|jpg|hdr)$/);
      expect(statSync(join(PUBLIC, f)).size, f).toBeLessThan(9 * 1024 * 1024);
    }
  });

  it('covers every surface the brief asks for', () => {
    const keys = Object.keys(TEXTURE_SETS);
    for (const k of ['asphalt_fresh', 'asphalt_worn', 'gravel', 'concrete', 'guardrail', 'grass', 'sand', 'rock', 'snow', 'forest', 'pavement', 'facade_city', 'facade_industrial', 'bark']) expect(keys).toContain(k);
    for (const k of ['dawn', 'day', 'overcast', 'sunset', 'night', 'fog'] as HdriKey[]) expect(Object.keys(HDRIS)).toContain(k);
    expect(existsSync(join(PUBLIC, skyPath('day', '4k')))).toBe(true);
    expect(existsSync(join(PUBLIC, hdriPath('city_night')))).toBe(true);
  });
});

describe('texture tier selection', () => {
  it('picks the tier or the largest smaller resolution; procedural loads nothing', () => {
    expect(resolveRes('asphalt_fresh', 'procedural')).toBeNull();
    expect(resolveRes('asphalt_fresh', '1k')).toBe('1k');
    expect(resolveRes('asphalt_fresh', '2k')).toBe('2k');
    expect(resolveRes('asphalt_fresh', '4k')).toBe('4k');
    // Only the main asphalt has a 4K set: other surfaces fall back to 2K, and 1K-only sets to 1K.
    expect(resolveRes('grass', '4k')).toBe('2k');
    expect(resolveRes('guardrail', '4k')).toBe('1k');
    expect(resolveRes('bark', '2k')).toBe('1k');
  });
});

describe('HDRI preparation', () => {
  it('clamps the sun so image-based lighting does not double-count the directional light', () => {
    const w = 8;
    const h = 4;
    const data = new Float32Array(w * h * 4);
    for (let i = 0; i < w * h; i++) data.set([0.5, 0.5, 0.5, 1], i * 4);
    data.set([50000, 50000, 50000, 1], (1 * w + 3) * 4); // the sun, in the upper hemisphere
    const mean = clampHdrSun(data, w, h);
    expect(data[(1 * w + 3) * 4]).toBeLessThan(20);
    expect(mean).toBeGreaterThan(0.4);
    expect(mean).toBeLessThan(2);
    expect(data[0]).toBeCloseTo(0.5, 5);
  });
});

describe('sky and surface selection per environment', () => {
  it('maps time of day and weather to a photographic sky and lighting HDRI', () => {
    const pick = (time: 'dawn' | 'day' | 'sunset' | 'night', weather: 'clear' | 'cloudy' | 'rain' | 'fog' | 'snow') => hdriFor(resolveEnvironment('highway', time, weather));
    expect(pick('day', 'clear')).toEqual({ sky: 'day', light: 'day' });
    expect(pick('day', 'cloudy').sky).toBe('cloudy');
    expect(pick('day', 'rain').sky).toBe('overcast');
    expect(pick('day', 'fog').sky).toBe('fog');
    expect(pick('sunset', 'clear').sky).toBe('sunset');
    expect(pick('dawn', 'clear').sky).toBe('dawn');
    expect(pick('night', 'clear').sky).toBe('night');
    expect(hdriFor(resolveEnvironment('city', 'night', 'clear')).light).toBe('city_night');
  });

  it('every map/time/weather combination resolves to HDRIs and surface sets that exist', () => {
    for (const map of MAPS) {
      for (const time of TIMES_OF_DAY_FOR_TESTS) {
        for (const weather of map.weathers) {
          const env = resolveEnvironment(map.id, time, weather);
          const sky = hdriFor(env);
          expect(HDRIS[sky.sky], env.id).toBeDefined();
          expect(HDRIS[sky.light], env.id).toBeDefined();
          for (const key of surfaceKeys(env)) expect(TEXTURE_SETS[key], `${env.id} ${key}`).toBeDefined();
        }
      }
    }
  });

  it('parses template and resolved environment ids', () => {
    for (const env of ENVIRONMENTS) expect(parseEnv(env).time).toMatch(/day|sunset|night/);
    expect(parseEnv(resolveEnvironment('snow', 'dawn', 'snow'))).toMatchObject({ map: 'snow', time: 'dawn', weather: 'snow' });
    expect(groundKey(resolveEnvironment('snow', 'day', 'clear'))).toBe('snow');
    expect(groundKey(resolveEnvironment('desert', 'day', 'clear'))).toBe('sand');
    expect(groundKey(resolveEnvironment('city', 'day', 'clear'))).toBe('pavement');
  });

  it('preload requests follow the quality settings (nothing at the procedural tier)', () => {
    const env = resolveEnvironment('highway', 'day', 'clear');
    const make = (patch: Record<string, string | boolean>) => profileFromSettings(new SettingsReader(SETTINGS, { ...SETTINGS.defaults('high'), ...patch }));
    expect(assetRequests(env, make({ 'gfx.textures': 'procedural', 'gfx.ibl': 'sky', 'gfx.sky': 'basic' }))).toEqual([]);
    const reqs = assetRequests(env, make({ 'gfx.textures': '2k', 'gfx.ibl': 'hdri', 'gfx.sky': 'hdri' }));
    expect(reqs.some((r) => r.kind === 'hdri')).toBe(true);
    expect(reqs.some((r) => r.kind === 'sky')).toBe(true);
    expect(reqs.filter((r) => r.kind === 'texture').length).toBeGreaterThanOrEqual(6);
  });
});
