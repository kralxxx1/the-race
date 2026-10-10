import { expect, test } from '@playwright/test';
import { api, bootToMenu, expectNoErrors, frames, seedSave, startRun, trackErrors } from './helpers';

test('mobile: touch controls drive the bike', async ({ page }) => {
  const errors = trackErrors(page);
  await seedSave(page);
  await bootToMenu(page);
  await expect(page.getByTestId('btn-play')).toBeVisible();
  await startRun(page, 'endless', 'highway');
  const gas = page.locator('.tbtn.gas');
  await expect(gas).toBeVisible();
  await expect(page.locator('.tbtn.brake')).toBeVisible();
  await page.evaluate(() => window.__THE_RACE__.clearTraffic());
  await page.evaluate(() => window.__THE_RACE__.advance(3.5));
  // Press and hold the on-screen throttle.
  await gas.dispatchEvent('pointerdown');
  await page.evaluate(() => window.__THE_RACE__.advance(4));
  expect(await api(page, 'speedKmh')).toBeGreaterThan(60);
  await gas.dispatchEvent('pointerup');
  const left = page.locator('.tbtn.steer').first();
  const lane0 = await api(page, 'lane');
  await left.dispatchEvent('pointerdown');
  await page.evaluate(() => window.__THE_RACE__.advance(0.8));
  await left.dispatchEvent('pointerup');
  expect(await api(page, 'lane')).toBeLessThan(lane0 - 0.3);
  await frames(page, 2);
  expectNoErrors(errors);
});
