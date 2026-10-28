// Renders preview screenshots of dumped models with headless Chromium.
//   node tools/render/shoot.mjs world aerial,top,plaza  [extra query string]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');
const file = process.argv[2] || 'world';
const views = (process.argv[3] || 'aerial').split(',');
const extra = process.argv[4] || '';
const port = 8123 + Math.floor(Math.random() * 500);

const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: repoRoot, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 900));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--headless=new'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => { if (m.type() === 'error') console.log('page error:', m.text()); });
  page.on('pageerror', (e) => console.log('page exception:', e.message));
  for (const view of views) {
    const url = `http://127.0.0.1:${port}/roblox/pc-tamirci/tools/render/index.html?file=${file}&view=${view}${extra ? '&' + extra : ''}`;
    await page.goto(url);
    await page.waitForFunction('window.__ready === true', null, { timeout: 240000 });
    const out = path.join(here, 'out', `${file}_${view}${extra.includes('night=1') ? '_night' : ''}.png`);
    await page.screenshot({ path: out });
    console.log('saved', out);
  }
} finally {
  await browser.close();
  server.kill();
}
