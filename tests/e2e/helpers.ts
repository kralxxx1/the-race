import { expect, type Page } from '@playwright/test';

export const SAVE_KEY = 'the-race.save';

export interface DebugApi {
  state: string;
  screen: string;
  speedKmh: number;
  gear: number;
  rpm: number;
  sessionState: string | null;
  score: number;
  distance: number;
  lane: number;
  traffic: number;
  errors: string[];
  save: Record<string, unknown> & { cash: number; ownedBikes: string[]; selectedBike: string; gamesPlayed: number; highScores: Record<string, number>; settings: Record<string, unknown> };
  audioState: string;
  setInput(o: Record<string, unknown>): void;
  clearInput(): void;
  start(mode?: string, env?: string): Promise<void>;
  advance(seconds: number): void;
  crash(): void;
  clearTraffic(): void;
}

declare global {
  interface Window {
    __THE_RACE__: DebugApi;
  }
}

/** Collect console errors and uncaught exceptions for assertions. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}

/** Seed a save before the app boots (quality low keeps software rendering fast). */
export async function seedSave(page: Page, save: Record<string, unknown> = {}): Promise<void> {
  await page.addInitScript(
    ([key, data]) => {
      if (!sessionStorage.getItem('__seeded')) {
        localStorage.setItem(key as string, JSON.stringify(data));
        sessionStorage.setItem('__seeded', '1');
      }
    },
    [SAVE_KEY, { version: 2, settings: { quality: 'low', cameraShake: false }, ...save }] as const,
  );
}

export async function bootToMenu(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.__THE_RACE__?.state === 'menu', null, { timeout: 120_000 });
}

/** Read a property of the in-page debug API. */
export async function api<K extends keyof DebugApi>(page: Page, key: K): Promise<DebugApi[K]> {
  return page.evaluate((k) => (window.__THE_RACE__ as unknown as Record<string, unknown>)[k], key as string) as Promise<DebugApi[K]>;
}

export async function waitState(page: Page, state: string): Promise<void> {
  await page.waitForFunction((s) => window.__THE_RACE__?.state === s, state, { timeout: 120_000 });
}

export async function startRun(page: Page, mode = 'endless', env = 'day'): Promise<void> {
  await page.evaluate(([m, e]) => window.__THE_RACE__.start(m, e), [mode, env]);
  await waitState(page, 'playing');
}

/** Wait for a couple of real rendered frames. */
export async function frames(page: Page, n = 2): Promise<void> {
  await page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        let k = 0;
        const f = () => (++k >= count ? resolve() : requestAnimationFrame(f));
        requestAnimationFrame(f);
      }),
    n,
  );
}

export function expectNoErrors(errors: string[]): void {
  const real = errors.filter((e) => !/favicon|GPU stall|WebGL: INVALID_ENUM|Automatic fallback to software WebGL/i.test(e));
  expect(real, real.join('\n')).toEqual([]);
}
