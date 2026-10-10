// Boot the game, start a run and capture screenshots while riding.
// Usage: node tools/play.mjs <baseUrl> <outPrefix> [mode] [map] [time] [weather] [preset] [seconds]
// e.g.   node tools/play.mjs http://localhost:5173/ /tmp/x endless highway day clear medium 6
// The simulation is advanced headlessly (window.__THE_RACE__.advance) so slow software
// rendering does not matter; a few real frames are rendered before each screenshot.
import { chromium } from 'playwright';

const [, , url, out, mode = 'endless', map = 'highway', time = '', weather = '', preset = 'medium', secs = '6'] = process.argv;
if (!url || !out) {
  console.error('usage: node tools/play.mjs <baseUrl> <outPrefix> [mode] [map] [time] [weather] [preset] [seconds]');
  process.exit(1);
}
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.addInitScript((p) => {
  if (!localStorage.getItem('the-race.save')) localStorage.setItem('the-race.save', JSON.stringify({ version: 3, cash: 999999, settings: { 'gfx.preset': p } }));
}, preset);
await page.goto(url);
await page.waitForFunction('window.__THE_RACE__ && window.__THE_RACE__.state === "menu"', null, { timeout: 120000 });
const frames = (n) =>
  page.evaluate((c) => new Promise((r) => { let k = 0; const f = () => (++k >= c ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
await frames(3);
await page.screenshot({ path: `${out}-menu.png` });
await page.evaluate(([m, mp, t, w]) => window.__THE_RACE__.start(m, mp, t || undefined, w || undefined), [mode, map, time, weather]);
await page.waitForFunction('window.__THE_RACE__.state === "playing"', null, { timeout: 120000 });
await frames(3);
await page.screenshot({ path: `${out}-start.png` });
await page.evaluate(() => window.__THE_RACE__.setInput({ throttle: 1 }));
const total = Number(secs);
for (let t = 0; t < total; t += 2) {
  await page.evaluate((d) => window.__THE_RACE__.advance(d), Math.min(2, total - t));
  await frames(2);
}
await page.screenshot({ path: `${out}-ride.png` });
const st = await page.evaluate(() => {
  const g = window.__THE_RACE__;
  return { state: g.state, session: g.sessionState, kmh: Math.round(g.speedKmh), gear: g.gear, score: g.score, dist: Math.round(g.distance), traffic: g.traffic, info: g.renderInfo(), errors: g.errors };
});
console.log(JSON.stringify(st));
if (logs.length) console.log(logs.filter((l) => !/PCFSoftShadowMap/.test(l)).slice(0, 40).join('\n'));
await browser.close();
