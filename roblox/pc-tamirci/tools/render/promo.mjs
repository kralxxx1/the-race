// Store images for the Roblox game page: renders views of the real game models with the previewer
// (index.html), then lays the titles over them (promo.html).
//   lune run tools/dump.luau world
//   lune run tools/dump.luau shop 6 bench
//   lune run tools/dump.luau device desktop 3 high open
//   node tools/render/promo.mjs        → publish/icon.png, publish/thumbnail_1..4.jpg
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');
const publish = path.resolve(here, '../../publish');
const base = '/roblox/pc-tamirci/tools/render';

// camera, target, field of view (studs, Roblox axes)
const SHOTS = [
  { name: 'city', file: 'world', cam: '-500,260,1150', look: '200,0,300', fov: 50 },
  { name: 'fun', file: 'world', cam: '-2150,380,250', look: '-1100,0,-500', fov: 50 },
  { name: 'shop', file: 'shop6', cam: '-34,40,-8', look: '0,2,40', fov: 45, extra: 'clip=11&bg=none' },
  { name: 'pc', file: 'device_desktop', cam: '5.6,15.2,11.2', look: '-1.2,1.8,-1.4', fov: 40, extra: 'bg=none&ground=shadow' },
];
const CARDS = [
  { kind: 'icon', w: 512, h: 512, out: 'icon.png' },
  { kind: 'main', w: 1920, h: 1080, out: 'thumbnail_1.jpg' },
  { kind: 'repair', w: 1920, h: 1080, out: 'thumbnail_2.jpg' },
  { kind: 'shop', w: 1920, h: 1080, out: 'thumbnail_3.jpg' },
  { kind: 'city', w: 1920, h: 1080, out: 'thumbnail_4.jpg' },
];

mkdirSync(publish, { recursive: true });
const port = 8600 + Math.floor(Math.random() * 500);
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: repoRoot, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 900));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--headless=new'] });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', (e) => console.log('page exception:', e.message));
  for (const s of SHOTS) {
    const url = `http://127.0.0.1:${port}${base}/index.html?file=${s.file}&view=custom&w=1920&h=1080&cam=${s.cam}&look=${s.look}&fov=${s.fov}${s.extra ? '&' + s.extra : ''}`;
    await page.goto(url);
    await page.waitForFunction('window.__ready === true', null, { timeout: 300000 });
    await page.screenshot({ path: path.join(here, 'out', `promo_${s.name}.png`), omitBackground: true });
    console.log('rendered', s.name);
  }
  for (const c of CARDS) {
    await page.setViewportSize({ width: c.w, height: c.h });
    await page.goto(`http://127.0.0.1:${port}${base}/promo.html?kind=${c.kind}`);
    await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
    const out = path.join(publish, c.out);
    await page.screenshot(c.out.endsWith('.jpg') ? { path: out, type: 'jpeg', quality: 90 } : { path: out });
    console.log('saved', out);
  }
} finally {
  await browser.close();
  server.kill();
}
