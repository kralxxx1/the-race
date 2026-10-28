// Screenshots of UI dumps (tools/uidump.luau) rendered by ui.html.
//   node tools/render/shootui.mjs hud,phone,bench
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const scenes = (process.argv[2] || 'hud').split(',');
const port = 8700 + Math.floor(Math.random() * 500);
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: here, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 900));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--headless=new'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('page exception:', e.message));
  for (const scene of scenes) {
    await page.goto(`http://127.0.0.1:${port}/ui.html?file=ui_${scene}`);
    await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
    const out = path.join(here, 'out', `ui_${scene}.png`);
    await page.screenshot({ path: out });
    console.log('saved', out);
  }
} finally {
  await browser.close();
  server.kill();
}
