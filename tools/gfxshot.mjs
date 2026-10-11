// Graphics bench screenshots with generous timeouts (software GL renders extreme very slowly).
// Usage: node tools/gfxshot.mjs <outDir> <w> <h> "<query>::<name>" ...   (query = dev/gfx.html query string)
// Prints window.__gfx (passes, plan, draw calls, per-frame ms) per shot and any console errors.
import { chromium } from 'playwright';

const [, , outdir, w, h, ...items] = process.argv;
const base = process.env.GFX_BASE ?? 'http://localhost:5183';
if (!outdir || !items.length) {
  console.error('usage: node tools/gfxshot.mjs <outDir> <w> <h> "<query>::<name>" ...');
  process.exit(1);
}
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = new Map();
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') logs.set(m.text().slice(0, 300), (logs.get(m.text().slice(0, 300)) ?? 0) + 1);
});
page.on('pageerror', (e) => logs.set(`[pageerror] ${e.message}`, 1));
for (const it of items) {
  const [query, name] = it.split('::');
  const url = `${base}/dev/gfx.html?w=${w}&h=${h}&${query}`;
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'commit', timeout: 0 });
  try {
    await page.waitForFunction('window.__ready === true', null, { timeout: 900000, polling: 500 });
  } catch {
    logs.set(`[timeout] ${name}`, 1);
  }
  await page.screenshot({ path: `${outdir}/${name}.png` });
  const info = await page.evaluate(() => JSON.stringify({ gfx: window.__gfx ?? null, err: window.__error ?? null }));
  const parsed = JSON.parse(info);
  const g = parsed.gfx;
  console.log(`${name}: ${((Date.now() - t0) / 1000).toFixed(1)}s`, g ? `passes=[${g.passes.join(',')}] draws=${g.drawCalls} tris=${g.triangles} ms=${g.frameMs.map((x) => Math.round(x)).join('/')} size=${g.plan ? g.plan.width + 'x' + g.plan.height : '-'}` : '', parsed.err ?? '');
}
if (logs.size) for (const [k, v] of logs) console.log(`  x${v} ${k}`);
await browser.close();
