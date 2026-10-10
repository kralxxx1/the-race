// Boot the game, start a run and sample the audio output level while riding in real time.
// Usage: node tools/audio-probe.mjs <baseUrl> [map] [weather] [seconds] [bikeId]
// Prints the audio backend (worklet / script), the RMS level over time and any console errors.
import { chromium } from 'playwright';

const [, , url, map = 'highway', weather = 'clear', secs = '8', bike = ''] = process.argv;
if (!url) {
  console.error('usage: node tools/audio-probe.mjs <baseUrl> [map] [weather] [seconds] [bikeId]');
  process.exit(1);
}
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const logs = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.addInitScript((b) => {
  if (!localStorage.getItem('the-race.save')) localStorage.setItem('the-race.save', JSON.stringify({ version: 3, cash: 999999, selectedBike: b || undefined, settings: { 'gfx.preset': 'low' } }));
}, bike);
await page.goto(url);
await page.waitForFunction('window.__THE_RACE__ && window.__THE_RACE__.state === "menu"', null, { timeout: 120000 });
await page.mouse.click(10, 10);
await page.evaluate(([m, w]) => window.__THE_RACE__.start('endless', m, undefined, w || undefined), [map, weather]);
await page.waitForFunction('window.__THE_RACE__.state === "playing"', null, { timeout: 120000 });
await page.evaluate(() => window.__THE_RACE__.setInput({ throttle: 1 }));
const samples = [];
const t0 = Date.now();
while (Date.now() - t0 < Number(secs) * 1000) {
  await page.waitForTimeout(500);
  samples.push(await page.evaluate(() => ({ lvl: Number(window.__THE_RACE__.audioLevel.toFixed(4)), kmh: Math.round(window.__THE_RACE__.speedKmh), rpm: Math.round(window.__THE_RACE__.rpm) })));
}
const info = await page.evaluate(() => ({ state: window.__THE_RACE__.audioState, backend: window.__THE_RACE__.audioBackend, errors: window.__THE_RACE__.errors }));
console.log(JSON.stringify(info));
console.log(samples.map((s) => `${s.kmh}km/h ${s.rpm}rpm L=${s.lvl}`).join('\n'));
if (logs.length) console.log(logs.filter((l) => !/PCFSoftShadowMap|GPU stall|WebGL/.test(l)).slice(0, 30).join('\n'));
await browser.close();
