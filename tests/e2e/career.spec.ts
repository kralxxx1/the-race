import { expect, test } from '@playwright/test';
import { api, bootToMenu, expectNoErrors, seedSave, trackErrors, waitState } from './helpers';

/** Drive the simulation headlessly: `seconds` of game time with the throttle open. */
async function ride(page: import('@playwright/test').Page, seconds: number): Promise<void> {
  await page.evaluate(() => window.__THE_RACE__.clearTraffic());
  await page.evaluate(() => window.__THE_RACE__.setInput({ throttle: 1 }));
  await page.evaluate((s) => window.__THE_RACE__.advance(s), seconds);
}

test.describe('Career, progression and menus', () => {
  test('menu shows the rider level and the new entries', async ({ page }) => {
    const errors = trackErrors(page);
    await seedSave(page, { cash: 5000 });
    await bootToMenu(page);
    await expect(page.getByTestId('btn-career')).toBeVisible();
    await expect(page.getByTestId('rider-level')).toBeVisible();
    await expect(page.getByTestId('rider-level-value')).toHaveText('1');
    for (const id of ['btn-achievements', 'btn-stats', 'btn-leaderboards', 'btn-daily']) await expect(page.getByTestId(id)).toBeVisible();
    await expect(page.getByTestId('daily-ready')).toBeVisible();
    expectNoErrors(errors);
  });

  test('career: pick a mission, ride it, complete it, collect rewards and continue', async ({ page }) => {
    const errors = trackErrors(page);
    await seedSave(page, { cash: 5000 });
    await bootToMenu(page);
    await page.getByTestId('btn-career').click();
    await expect(page.getByTestId('career-screen')).toBeVisible();
    await expect(page.getByTestId('mission-suburb-01')).toBeVisible();
    await expect(page.getByTestId('mission-detail-title')).toHaveText('İlk Sürüş');
    // Mission 2 is locked until mission 1 is done.
    await page.getByTestId('mission-suburb-02').click();
    await expect(page.getByTestId('mission-locked')).toBeVisible();
    await expect(page.getByTestId('mission-start')).toHaveCount(0);
    await page.getByTestId('mission-suburb-01').click();
    await page.getByTestId('mission-start').click();
    await waitState(page, 'playing');

    // The objective panel is on screen and the debug API reports the mission.
    await expect(page.getByTestId('mission-panel')).toBeVisible();
    await expect(page.getByTestId('mission-objective')).toContainText('1,5 km');
    expect(await api(page, 'mission')).toMatchObject({ id: 'suburb-01', status: 'running', type: 'distance' });
    await ride(page, 20);
    const mid = await api(page, 'mission');
    expect(mid!.progress).toBeGreaterThan(0.05);
    expect(mid!.progress).toBeLessThan(1);
    await ride(page, 40);
    expect((await api(page, 'mission'))!.status).toBe('complete');
    await waitState(page, 'gameover');
    await page.evaluate(() => window.__THE_RACE__.advance(3)); // let the result card appear
    await expect(page.getByTestId('mission-result')).toBeVisible();
    await expect(page.getByTestId('mission-result-title')).toHaveText('GÖREV TAMAMLANDI');
    await expect(page.getByTestId('mission-stars')).toBeVisible();
    await expect(page.getByTestId('mission-cash')).toContainText('XP');
    const out = await api(page, 'lastOutcome');
    expect(out!.mission!.firstClear).toBe(true);
    expect(out!.mission!.nextMissionId).toBe('suburb-02');
    expect(out!.cash).toBeGreaterThan(0);
    expect(await api(page, 'level')).toBeGreaterThanOrEqual(2);
    expect(await api(page, 'achievementCount')).toBeGreaterThanOrEqual(1);

    // Progress was saved, and "next mission" starts mission 2.
    const save = await api(page, 'save');
    expect((save.career as { missions: Record<string, { completions: number }> }).missions['suburb-01'].completions).toBe(1);
    await page.getByTestId('btn-next-mission').click();
    await waitState(page, 'playing');
    expect((await api(page, 'mission'))!.id).toBe('suburb-02');
    expectNoErrors(errors);
  });

  test('career: a crash fails the mission and "tekrar dene" restarts it', async ({ page }) => {
    const errors = trackErrors(page);
    await seedSave(page, { cash: 5000 });
    await bootToMenu(page);
    await page.evaluate(() => void window.__THE_RACE__.startMission('suburb-03'));
    await waitState(page, 'playing');
    await page.evaluate(() => window.__THE_RACE__.advance(4));
    await page.evaluate(() => window.__THE_RACE__.crash());
    expect((await api(page, 'mission'))!.status).toBe('failed');
    await page.evaluate(() => window.__THE_RACE__.advance(5));
    await waitState(page, 'gameover');
    await expect(page.getByTestId('mission-result-title')).toHaveText('GÖREV BAŞARISIZ');
    await expect(page.getByTestId('mission-fail-reason')).toContainText('Kaza');
    await page.getByTestId('btn-retry-mission').click();
    await waitState(page, 'playing');
    expect(await api(page, 'mission')).toMatchObject({ id: 'suburb-03', status: 'running' });
    // The failed attempt is on record but nothing was unlocked.
    const save = await api(page, 'save');
    const rec = (save.career as { missions: Record<string, { attempts: number; completions: number }> }).missions['suburb-03'];
    expect(rec.attempts).toBe(1);
    expect(rec.completions).toBe(0);
    expectNoErrors(errors);
  });

  test('locked maps and bikes are marked and cannot be used early', async ({ page }) => {
    const errors = trackErrors(page);
    await seedSave(page, { cash: 500000 });
    await bootToMenu(page);
    await page.getByTestId('btn-play').click();
    await expect(page.getByTestId('map-highway')).toHaveAttribute('data-locked', '0');
    await expect(page.getByTestId('map-industrial')).toHaveAttribute('data-locked', '1');
    await page.getByTestId('modes-back').click();
    await page.getByTestId('btn-garage').click();
    await page.getByTestId('bike-kawasaki-h2r').click();
    await expect(page.getByTestId('bike-locked')).toBeVisible();
    await expect(page.getByTestId('btn-buy')).toHaveCount(0);
    expect((await api(page, 'save')).ownedBikes).not.toContain('kawasaki-h2r');
    expectNoErrors(errors);
  });

  test('achievements, statistics, leaderboards and the daily reward screens work', async ({ page }) => {
    const errors = trackErrors(page);
    await seedSave(page, { cash: 1000 });
    await bootToMenu(page);

    await page.getByTestId('btn-achievements').click();
    await expect(page.getByTestId('ach-screen')).toBeVisible();
    await expect(page.getByTestId('ach-count')).toContainText('/');
    await expect(page.getByTestId('ach-dist-1')).toBeVisible();
    await page.getByTestId('stats-tab').click();
    await expect(page.getByTestId('stats-screen')).toBeVisible();
    await page.getByTestId('lb-tab').click();
    await expect(page.getByTestId('lb-screen')).toBeVisible();
    await expect(page.getByTestId('lb-empty')).toBeVisible();

    // Daily reward: claim once, then it is locked for the rest of the day.
    await page.getByTestId('daily-tab').click();
    await expect(page.getByTestId('daily-screen')).toBeVisible();
    const before = (await api(page, 'save')).cash;
    await page.getByTestId('daily-claim').click();
    await expect.poll(async () => (await api(page, 'save')).cash).toBeGreaterThan(before);
    await expect(page.getByTestId('daily-status')).toContainText('aldın');
    const after = (await api(page, 'save')).cash;
    await page.getByTestId('daily-claim').click({ force: true });
    expect((await api(page, 'save')).cash).toBe(after);
    expect(await page.evaluate(() => window.__THE_RACE__.claimDaily())).toBe(false);

    // A finished free run shows up on the leaderboard.
    await page.getByTestId('progress-back').click();
    await page.evaluate(() => void window.__THE_RACE__.start('endless', 'highway'));
    await waitState(page, 'playing');
    await ride(page, 12);
    await page.evaluate(() => window.__THE_RACE__.crash());
    await page.evaluate(() => window.__THE_RACE__.advance(5));
    await waitState(page, 'gameover');
    await expect(page.getByTestId('result-level')).toBeVisible();
    await page.getByTestId('btn-menu').click();
    await waitState(page, 'menu');
    await page.getByTestId('btn-leaderboards').click();
    await page.getByTestId('lb-mode-endless').click();
    await expect(page.getByTestId('lb-table')).toBeVisible();
    await expect(page.getByTestId('lb-row-1')).toBeVisible();
    expectNoErrors(errors);
  });

  test('XP, level and career progress survive a reload', async ({ page }) => {
    const errors = trackErrors(page);
    await seedSave(page, { cash: 1000 });
    await bootToMenu(page);
    await page.evaluate(() => void window.__THE_RACE__.startMission('suburb-01'));
    await waitState(page, 'playing');
    await ride(page, 60);
    await waitState(page, 'gameover');
    const xp = await api(page, 'xp');
    expect(xp).toBeGreaterThan(0);
    await page.reload();
    await waitState(page, 'menu');
    expect(await api(page, 'xp')).toBe(xp);
    await page.getByTestId('btn-career').click();
    // Mission 2 is open now.
    await page.getByTestId('mission-suburb-02').click();
    await expect(page.getByTestId('mission-start')).toBeVisible();
    expectNoErrors(errors);
  });
});
