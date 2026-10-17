import { expect, test } from '@playwright/test';
import { api, bootToMenu, expectNoErrors, frames, seedSave, startRun, trackErrors, waitState } from './helpers';

test.describe('The Race — production build', () => {
  test('boots into the main menu with a WebGL canvas and no errors', async ({ page }) => {
    const errors = trackErrors(page);
    await seedSave(page);
    await bootToMenu(page);
    await expect(page).toHaveTitle(/The Race/);
    await expect(page.getByTestId('game-canvas')).toBeVisible();
    await expect(page.getByTestId('btn-play')).toBeVisible();
    await expect(page.getByTestId('btn-garage')).toBeVisible();
    await expect(page.getByTestId('menu-bike')).toHaveText('YZF-R3');
    const hasGl = await page.evaluate(() => {
      const c = document.querySelector('canvas.game-canvas') as HTMLCanvasElement;
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    });
    expect(hasGl).toBe(true);
    await frames(page, 3);
    expectNoErrors(errors);
  });

  test('full ride: countdown, acceleration, HUD, pause/resume, crash and results', async ({ page }) => {
    const errors = trackErrors(page);
    await seedSave(page, { cash: 1000 });
    await bootToMenu(page);

    // Navigate through the real menus.
    await page.getByTestId('btn-play').click();
    await expect(page.getByTestId('mode-endless')).toBeVisible();
    await page.getByTestId('mode-endless').click();
    await page.getByTestId('map-highway').click();
    await page.getByTestId('btn-start').click();
    await waitState(page, 'playing');
    await expect(page.getByTestId('hud')).toBeVisible();
    expect(await api(page, 'sessionState')).toBe('countdown');

    // Countdown holds the bike even with the throttle open.
    await page.evaluate(() => window.__THE_RACE__.setInput({ throttle: 1 }));
    await page.evaluate(() => window.__THE_RACE__.advance(2));
    expect(await api(page, 'speedKmh')).toBeLessThan(1);
    expect(await api(page, 'rpm')).toBeGreaterThan(3000); // revving on the grid
    await page.evaluate(() => window.__THE_RACE__.advance(1.5));
    expect(await api(page, 'sessionState')).toBe('running');

    // Clear traffic so the deterministic acceleration check cannot crash.
    await page.evaluate(() => window.__THE_RACE__.clearTraffic());
    await page.evaluate(() => window.__THE_RACE__.advance(8));
    const kmh = await api(page, 'speedKmh');
    expect(kmh).toBeGreaterThan(110);
    expect(await api(page, 'gear')).toBeGreaterThan(2);
    expect(await api(page, 'distance')).toBeGreaterThan(150);
    expect(await api(page, 'score')).toBeGreaterThan(0);
    await frames(page, 2);
    await expect(page.getByTestId('hud-score')).not.toHaveText('0');
    await expect(page.getByTestId('hud-distance')).toContainText('m');

    // Steering moves the bike across lanes.
    const lane0 = await api(page, 'lane');
    await page.evaluate(() => window.__THE_RACE__.setInput({ throttle: 0.6, steer: -1 }));
    await page.evaluate(() => window.__THE_RACE__.advance(0.8));
    expect(await api(page, 'lane')).toBeLessThan(lane0 - 0.5);

    // Pause with the keyboard, resume with the button.
    await page.evaluate(() => window.__THE_RACE__.clearInput());
    await page.keyboard.press('Escape');
    await frames(page, 2);
    await waitState(page, 'paused');
    await expect(page.getByTestId('btn-resume')).toBeVisible();
    await page.getByTestId('btn-resume').click();
    await waitState(page, 'playing');

    // Crash → slow-motion cinematic → results screen.
    await page.evaluate(() => window.__THE_RACE__.crash());
    await page.evaluate(() => window.__THE_RACE__.advance(4.5));
    await frames(page, 2);
    await waitState(page, 'gameover');
    await expect(page.getByTestId('gameover')).toBeVisible();
    await expect(page.getByTestId('final-score')).not.toHaveText('0');
    const save = await api(page, 'save');
    expect(save.gamesPlayed).toBe(1);
    expect(save.cash).toBeGreaterThan(1000);
    expect(save.highScores.endless).toBeGreaterThan(0);

    await page.getByTestId('btn-menu').click();
    await waitState(page, 'menu');
    expectNoErrors(errors);
  });

  test('storage: purchases, liveries and settings survive a reload', async ({ page }) => {
    const errors = trackErrors(page);
    // The Panigale V4 S is a level-31 bike: seed enough XP to be allowed to buy it.
    await seedSave(page, { cash: 100000, xp: 75000 });
    await bootToMenu(page);
    await page.getByTestId('btn-garage').click();
    await expect(page.getByTestId('cash')).toHaveText('$100.000');
    await page.getByTestId('bike-ducati-panigale-v4s').click();
    await expect(page.getByTestId('garage-model')).toHaveText('Panigale V4 S');
    await page.getByTestId('btn-buy').click();
    // Buying can unlock achievements whose rewards top the balance up.
    const cashAfterBuy = (await api(page, 'save')).cash;
    expect(cashAfterBuy).toBeGreaterThanOrEqual(69000);
    await expect(page.getByTestId('cash')).toHaveText(`$${cashAfterBuy.toLocaleString('tr-TR')}`);
    await page.getByTestId('btn-back').click();
    await page.getByTestId('btn-settings').click();
    await page.getByTestId('tab-hud').click();
    await page.getByTestId('set-hud.units-mph').click();
    await page.getByTestId('tab-graphics').click();
    await page.getByTestId('set-gfx.preset-medium').click();

    await page.reload();
    await waitState(page, 'menu');
    const save = await api(page, 'save');
    expect(save.ownedBikes).toContain('ducati-panigale-v4s');
    expect(save.selectedBike).toBe('ducati-panigale-v4s');
    expect(save.cash).toBe(cashAfterBuy);
    expect(save.settings['hud.units']).toBe('mph');
    expect(save.settings['gfx.preset']).toBe('medium');
    expect(save.settings['gfx.shadows']).toBe('1024');
    await expect(page.getByTestId('menu-bike')).toHaveText('Panigale V4 S');
    expectNoErrors(errors);
  });

  test('storage: a corrupted save is backed up and the game still boots', async ({ page }) => {
    const errors = trackErrors(page);
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('__seeded')) {
        localStorage.setItem('the-race.save', '{"cash": 12,,, broken');
        sessionStorage.setItem('__seeded', '1');
      }
    });
    await bootToMenu(page);
    const backup = await page.evaluate(() => localStorage.getItem('the-race.save.corrupt'));
    expect(backup).toContain('broken');
    const save = await api(page, 'save');
    expect(save.selectedBike).toBe('yamaha-r3');
    expect(save.cash).toBeGreaterThan(0);
    expectNoErrors(errors);
  });

  test('storage: tampered values are sanitised', async ({ page }) => {
    await seedSave(page, { cash: -500, ownedBikes: ['not-a-bike', 'kawasaki-h2r'], selectedBike: 'not-a-bike', settings: { 'gfx.preset': 'insane', 'audio.master': 99 } });
    await bootToMenu(page);
    const save = await api(page, 'save');
    expect(save.cash).toBe(0);
    expect(save.ownedBikes).toEqual(['yamaha-r3', 'kawasaki-h2r']);
    expect(save.selectedBike).toBe('yamaha-r3');
    expect(save.settings['gfx.preset']).toBe('high');
    expect(save.settings['audio.master']).toBe(1);
  });

  for (const [mode, env] of [
    ['twoway', 'city'],
    ['timetrial', 'forest'],
    ['freeride', 'desert'],
  ] as const) {
    test(`mode ${mode} on ${env} runs and can be quit`, async ({ page }) => {
      const errors = trackErrors(page);
      await seedSave(page);
      await bootToMenu(page);
      await startRun(page, mode, env);
      await page.evaluate(() => window.__THE_RACE__.setInput({ throttle: 1 }));
      await page.evaluate(() => window.__THE_RACE__.advance(6));
      expect(['running', 'crashed']).toContain(await api(page, 'sessionState'));
      expect(await api(page, 'traffic')).toBeGreaterThan(5);
      await frames(page, 2);
      await page.evaluate(() => window.__THE_RACE__.clearInput());
      await page.getByTestId('pause-btn').click();
      await waitState(page, 'paused');
      await page.getByTestId('btn-quit').click();
      await waitState(page, 'menu');
      // Quitting still records the ride (distance/cash are not lost).
      expect((await api(page, 'save')).gamesPlayed).toBe(1);
      expectNoErrors(errors);
    });
  }

  test('restarting from the pause menu banks the abandoned ride; a run that never left the grid is not counted', async ({ page }) => {
    const errors = trackErrors(page);
    await seedSave(page);
    await bootToMenu(page);
    await startRun(page, 'endless', 'highway');
    await page.evaluate(() => window.__THE_RACE__.pause());
    await page.getByTestId('btn-quit').click(); // still in the countdown
    await waitState(page, 'menu');
    expect((await api(page, 'save')).gamesPlayed).toBe(0);
    await startRun(page, 'endless', 'highway');
    await page.evaluate(() => window.__THE_RACE__.clearTraffic());
    await page.evaluate(() => window.__THE_RACE__.setInput({ throttle: 1 }));
    await page.evaluate(() => window.__THE_RACE__.advance(8));
    await page.evaluate(() => window.__THE_RACE__.pause());
    await page.getByTestId('btn-restart').click();
    await waitState(page, 'playing');
    const save = await api(page, 'save');
    expect(save.gamesPlayed).toBe(1);
    expect((save as unknown as { totalDistance: number }).totalDistance).toBeGreaterThan(50);
    expectNoErrors(errors);
  });

  test('free ride respawns after a crash instead of ending', async ({ page }) => {
    await seedSave(page);
    await bootToMenu(page);
    await startRun(page, 'freeride', 'highway');
    await page.evaluate(() => window.__THE_RACE__.advance(3.5));
    await page.evaluate(() => window.__THE_RACE__.crash());
    await page.evaluate(() => window.__THE_RACE__.advance(4));
    expect(await api(page, 'sessionState')).toBe('running');
    expect(await api(page, 'state')).toBe('playing');
  });

  test('manual gearbox shifts on request', async ({ page }) => {
    await seedSave(page, { settings: { 'gfx.preset': 'low', 'play.autoShift': 'manual' } });
    await bootToMenu(page);
    await startRun(page, 'freeride', 'highway');
    await page.evaluate(() => window.__THE_RACE__.clearTraffic());
    await page.evaluate(() => window.__THE_RACE__.advance(3.5));
    await page.evaluate(() => window.__THE_RACE__.setInput({ throttle: 1 }));
    await page.evaluate(() => window.__THE_RACE__.advance(5));
    expect(await api(page, 'gear')).toBe(1); // stays in 1st, bouncing off the limiter
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => {
        window.__THE_RACE__.setInput({ throttle: 1, shiftUp: true });
        window.__THE_RACE__.advance(1 / 60);
        window.__THE_RACE__.setInput({ throttle: 1 });
        window.__THE_RACE__.advance(1);
      });
    }
    expect(await api(page, 'gear')).toBe(4);
  });

  test('audio engine unlocks on a user gesture and garage engine preview plays', async ({ page }) => {
    const errors = trackErrors(page);
    await seedSave(page);
    await bootToMenu(page);
    await page.getByTestId('btn-garage').click();
    const rev = page.getByTestId('btn-rev');
    await rev.hover();
    await page.mouse.down();
    await page.waitForTimeout(800);
    await page.mouse.up();
    expect(await api(page, 'audioState')).toBe('running');
    await frames(page, 2);
    expectNoErrors(errors);
  });

  test('engine is audible during a ride and the mix reacts to the throttle', async ({ page }) => {
    const errors = trackErrors(page);
    await seedSave(page);
    await bootToMenu(page);
    await page.getByTestId('btn-play').click(); // user gesture unlocks WebAudio
    await page.getByTestId('btn-start').click();
    await waitState(page, 'playing');
    await page.evaluate(() => window.__THE_RACE__.clearTraffic());
    await page.evaluate(() => window.__THE_RACE__.advance(3.5));
    await page.evaluate(() => window.__THE_RACE__.setInput({ throttle: 1 }));
    await page.evaluate(() => window.__THE_RACE__.advance(1));
    await page.waitForTimeout(700);
    const loud = await api(page, 'audioLevel');
    expect(await api(page, 'audioState')).toBe('running');
    expect(loud).toBeGreaterThan(0.005);
    expectNoErrors(errors);
  });

  test('pausing holds the audio silent (a click or key on the pause menu must not wake it) until resume', async ({ page }) => {
    const errors = trackErrors(page);
    await seedSave(page);
    await bootToMenu(page);
    await page.getByTestId('btn-play').click(); // user gesture unlocks WebAudio
    await page.getByTestId('btn-start').click();
    await waitState(page, 'playing');
    await page.evaluate(() => window.__THE_RACE__.advance(1));
    await page.waitForTimeout(500);
    expect(await api(page, 'audioState')).toBe('running');
    await page.evaluate(() => window.__THE_RACE__.pause());
    await waitState(page, 'paused');
    await page.waitForTimeout(300);
    expect(await api(page, 'audioState')).toBe('suspended');
    await page.mouse.click(5, 5);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(400);
    expect(await api(page, 'audioState')).toBe('suspended');
    await page.getByTestId('btn-resume').click();
    await waitState(page, 'playing');
    await page.waitForTimeout(300);
    expect(await api(page, 'audioState')).toBe('running');
    expectNoErrors(errors);
  });

  test('starting a run twice in a row (double tap) leaves exactly one run and leaks nothing', async ({ page }) => {
    const errors = trackErrors(page);
    await seedSave(page);
    await bootToMenu(page);
    const boot = await api(page, 'memory');
    await page.evaluate(() => Promise.all([window.__THE_RACE__.start('endless', 'highway'), window.__THE_RACE__.start('endless', 'city')]));
    await waitState(page, 'playing');
    await frames(page, 3);
    await expect(page.getByTestId('hud')).toHaveCount(1);
    await page.evaluate(() => window.__THE_RACE__.pause());
    await page.getByTestId('btn-quit').click();
    await waitState(page, 'menu');
    await frames(page, 2);
    await expect(page.getByTestId('hud')).toHaveCount(0);
    const mem = await api(page, 'memory');
    expect(mem.geometries).toBeLessThanOrEqual(boot.geometries + 10);
    expectNoErrors(errors);
  });

  test('a saved "tilt controls" setting is armed again after a reload (first gesture), not silently ignored', async ({ page }) => {
    const errors = trackErrors(page);
    await seedSave(page, { settings: { 'gfx.preset': 'low', 'cam.shake': false, 'ctrl.tilt': true } });
    await bootToMenu(page);
    await page.mouse.click(10, 10);
    await startRun(page, 'endless', 'highway');
    await expect(page.getByTestId('hud')).toHaveClass(/tilt/);
    expectNoErrors(errors);
  });

  test('repeated runs do not leak GPU geometries', async ({ page }) => {
    await seedSave(page);
    await bootToMenu(page);
    const counts: number[] = [];
    const textures: number[] = [];
    for (let i = 0; i < 3; i++) {
      await startRun(page, 'endless', i % 2 ? 'city' : 'highway');
      await page.evaluate(() => window.__THE_RACE__.advance(4));
      await frames(page, 1);
      await page.evaluate(() => window.__THE_RACE__.crash());
      await page.evaluate(() => window.__THE_RACE__.advance(4.5));
      await frames(page, 1);
      await waitState(page, 'gameover');
      await page.getByTestId('btn-menu').click();
      await waitState(page, 'menu');
      await frames(page, 2);
      const mem = await api(page, 'memory');
      counts.push(mem.geometries);
      textures.push(mem.textures);
    }
    // Runs 0 and 2 use the same environment: nothing may accumulate in between.
    expect(counts[2]).toBeLessThanOrEqual(counts[0]);
    expect(textures[2]).toBeLessThanOrEqual(textures[1] + 2);
  });
});
