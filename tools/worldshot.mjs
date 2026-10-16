// Scenery screenshots: loads dev/world.html once and renders several camera shots from the same world.
// Usage: node tools/worldshot.mjs <outDir> <w> <h> "<query>" "<name>=<fs>,<fd>,<fh>,<yaw>,<pitch>,<fov>" ...
//   query   dev/world.html query string, e.g. "env=highway:day:clear&preset=medium&s=900"
//   shots   camera at road distance fs, lateral fd, fh metres above the road; yaw/pitch in degrees
//           (+yaw looks right of the road direction); fov = vertical field of view in degrees.
// Env: WORLD_BASE (default http://localhost:5210).
import { chromium } from 'playwright';

const [, , outdir, w, h, query, ...shots] = process.argv;
if (!outdir || !query || !shots.length) {
  console.error('usage: node tools/worldshot.mjs <outDir> <w> <h> "<query>" "<name>=fs,fd,fh,yaw,pitch,fov" ...');
  process.exit(1);
}
const base = process.env.WORLD_BASE ?? 'http://localhost:5210';
const parsed = shots.map((s) => {
  const [name, v] = s.split('=');
  return { name, v };
});
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = new Map();
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') {
    const t = m.text().slice(0, 400);
    if (!/PCFSoftShadowMap/.test(t)) logs.set(t, (logs.get(t) ?? 0) + 1);
  }
});
page.on('pageerror', (e) => logs.set(`[pageerror] ${e.message}`, 1));
const url = `${base}/dev/world.html?w=${w}&h=${h}&${query}&shots=${encodeURIComponent(parsed.map((p) => p.v).join(';'))}`;
const t0 = Date.now();
await page.goto(url, { waitUntil: 'commit', timeout: 0 });
await page.waitForFunction('window.__ready === true', null, { timeout: 900000, polling: 500 });
const err = await page.evaluate(() => window.__error ?? null);
if (err) {
  console.log('ERROR', err);
  await browser.close();
  process.exit(1);
}
console.log('loaded in', ((Date.now() - t0) / 1000).toFixed(1), 's', JSON.stringify(await page.evaluate(() => window.__world)));
for (let i = 0; i < parsed.length; i++) {
  const info = await page.evaluate((k) => window.__renderShot(k), i);
  await page.screenshot({ path: `${outdir}/${parsed[i].name}.png`, timeout: 900000 });
  console.log(parsed[i].name, JSON.stringify(info));
}
if (logs.size) for (const [k, v] of logs) console.log(`  x${v} ${k}`);
await browser.close();
