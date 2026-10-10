// Screenshot one or more pages (e.g. dev/preview.html) with software WebGL.
// Usage: node tools/shot.mjs <outDir> <width> <height> "<url>::<name>" ["<url>::<name>" ...]
// A page signals it is ready by setting `window.__ready = true`.
import { chromium } from 'playwright';

const [, , outdir, w, h, ...items] = process.argv;
if (!outdir || !items.length) {
  console.error('usage: node tools/shot.mjs <outDir> <w> <h> "<url>::<name>" ...');
  process.exit(1);
}
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
for (const it of items) {
  const [url, name] = it.split('::');
  await page.goto(url);
  try {
    await page.waitForFunction('window.__ready === true', null, { timeout: 120000 });
  } catch {
    logs.push(`[timeout] ${name}`);
  }
  await page.screenshot({ path: `${outdir}/${name}.png` });
  console.log(`saved ${outdir}/${name}.png`);
}
if (logs.length) console.log(logs.filter((l) => !/PCFSoftShadowMap/.test(l)).join('\n'));
await browser.close();
