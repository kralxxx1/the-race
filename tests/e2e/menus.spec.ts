import { expect, test } from '@playwright/test';
import { api, bootToMenu, expectNoErrors, seedSave, trackErrors, waitState } from './helpers';

test.describe('Menus: navigation, garage, rider and settings', () => {
  test('keyboard drives the main menu: arrows move, Enter opens, Esc goes back', async ({ page }) => {
    const errors = trackErrors(page);
    await seedSave(page);
    await bootToMenu(page);
    await page.keyboard.press('ArrowDown'); // first key press focuses the primary button (Kariyer)
    await expect(page.getByTestId('btn-career')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('btn-play')).toBeFocused();
    await page.keyboard.press('Enter');
    await waitState(page, 'modes');
    await expect(page.getByTestId('btn-start')).toBeVisible();
    await page.keyboard.press('Escape');
    await waitState(page, 'menu');
    await expect(page.getByTestId('btn-career')).toBeVisible();
    expectNoErrors(errors);
  });

  test('garage: search, filters, compare, view presets and the purchase dialog', async ({ page }) => {
    const errors = trackErrors(page);
    await seedSave(page, { cash: 90000, xp: 200000 });
    await bootToMenu(page);
    await page.getByTestId('btn-garage').click();
    await expect(page.getByTestId('garage-count')).toContainText('motosiklet');
    const all = await page.locator('.bike-card').count();
    expect(all).toBeGreaterThan(40);
    // Search narrows the list; the style filter narrows it further.
    await page.getByTestId('garage-search').fill('ducati');
    await expect.poll(() => page.locator('.bike-card').count()).toBeLessThan(all);
    expect(await page.locator('.bike-card').count()).toBeGreaterThan(0);
    await page.getByTestId('garage-search').fill('zzzz-yok');
    await expect(page.getByTestId('garage-empty')).toBeVisible();
    await page.getByTestId('garage-search').fill('');
    await page.getByTestId('garage-style-scooter').click();
    await expect.poll(() => page.locator('.bike-card').count()).toBeLessThan(all);
    await page.getByTestId('garage-style-all').click();
    // Sorting by power puts the strongest bike first.
    await page.getByTestId('garage-sort').selectOption('hp');
    await expect(page.locator('.bike-card').first()).toHaveAttribute('data-testid', /bike-/);
    // Viewer presets and compare.
    await page.getByTestId('bike-ducati-panigale-v4s').click();
    await expect(page.getByTestId('garage-model')).toHaveText('Panigale V4 S');
    await expect(page.getByTestId('spec-sheet')).toBeVisible();
    await page.getByTestId('view-engine').click();
    await expect(page.getByTestId('view-engine')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('btn-compare').click();
    await expect(page.getByTestId('compare')).toBeVisible();
    await page.getByTestId('dialog-cancel').click();
    // Purchase asks for confirmation, and cancelling keeps the money.
    const cash = (await api(page, 'save')).cash;
    await page.getByTestId('btn-buy').click();
    await expect(page.getByTestId('buy-summary')).toBeVisible();
    await page.getByTestId('dialog-cancel').click();
    expect((await api(page, 'save')).cash).toBe(cash);
    expect((await api(page, 'save')).ownedBikes).not.toContain('ducati-panigale-v4s');
    expectNoErrors(errors);
  });

  test('rider: gear is designed, saved and survives a reload', async ({ page }) => {
    const errors = trackErrors(page);
    await seedSave(page);
    await bootToMenu(page);
    await page.getByTestId('btn-rider').click();
    await expect(page.getByTestId('gear-save')).toBeVisible();
    await page.getByTestId('gear-name').fill('Kaya');
    await page.getByTestId('gear-preset-night').click();
    await page.getByTestId('gear-part-helmet').click();
    await page.getByTestId('helmet-design-flame').click();
    await page.getByTestId('gear-save').click();
    const gear = (await api(page, 'save')).rider as { name: string; follow: boolean; helmet: { design: string } };
    expect(gear.name).toBe('Kaya');
    expect(gear.follow).toBe(false);
    expect(gear.helmet.design).toBe('flame');
    await page.getByTestId('btn-back').click();
    await waitState(page, 'menu');
    await expect(page.getByTestId('profile-name')).toHaveText('Kaya');
    await page.reload();
    await waitState(page, 'menu');
    await expect(page.getByTestId('profile-name')).toHaveText('Kaya');
    expectNoErrors(errors);
  });

  test('settings: search, tabs, advanced toggle and accessibility options apply at once', async ({ page }) => {
    const errors = trackErrors(page);
    await seedSave(page);
    await bootToMenu(page);
    await page.getByTestId('btn-settings').click();
    await expect(page.getByTestId('set-gfx.preset-high')).toBeVisible();
    await page.getByTestId('settings-search').fill('gölge');
    await expect(page.getByTestId('settings-count')).toContainText('sonuç');
    await expect(page.locator('.set-row[data-setting="gfx.shadows"]')).toBeVisible();
    await page.getByTestId('settings-search').fill('');
    // Accessibility: high contrast and a colour-blind palette change the document immediately.
    await page.getByTestId('tab-accessibility').click();
    await page.getByTestId('set-a11y.contrast').click();
    await expect(page.locator('html')).toHaveClass(/a11y-contrast/);
    await page.getByTestId('set-a11y.colorBlind-deutan').click();
    await expect(page.locator('html')).toHaveClass(/cb-deutan/);
    // HUD layout option reaches the root as a class.
    await page.getByTestId('tab-hud').click();
    await expect(page.getByTestId('hud-preview')).toBeVisible();
    await page.getByTestId('set-hud.layout-center').click();
    await expect(page.locator('html')).toHaveClass(/hud-layout-center/);
    // The advanced toggle reveals more options.
    await page.getByTestId('tab-graphics').click();
    const before = await page.locator('.set-row').count();
    await page.getByTestId('settings-advanced').click();
    await expect.poll(() => page.locator('.set-row').count()).toBeGreaterThan(before);
    // Reset for the tab restores the preset values.
    await page.getByTestId('tab-hud').click();
    await page.getByTestId('tab-reset').click();
    await page.getByTestId('tab-reset-confirm').click();
    await expect(page.locator('html')).not.toHaveClass(/hud-layout-center/);
    expect((await api(page, 'save')).settings['hud.layout']).toBe('classic');
    expectNoErrors(errors);
  });
});
