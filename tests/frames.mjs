// Capture a short frame sequence (for checking motion / temporal stability).
// node tests/frames.mjs <outPrefix> <WxH> <query> <warmupSteps> <frames> <stepsPerFrame>
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [prefix = 'review/seq/f', size = '960x540', query = '', warm = '2400', frames = '12', per = '2'] = process.argv.slice(2);
const [w, h] = size.split('x').map(Number);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: w, height: h } });
page.setDefaultTimeout(300000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('file://' + path.join(root, 'dist/crestline.html') + '?' + query);
await page.waitForTimeout(800);
await page.evaluate((n) => window.__crest.simulate(n), +warm);
for (let i = 0; i < +frames; i++) {
  await page.evaluate((n) => { window.__crest.simulate(n); window.__crest.renderOnce(n / 120); }, +per);
  await page.screenshot({ path: path.join(root, `${prefix}${String(i).padStart(2, '0')}.png`), timeout: 300000 });
}
console.log(JSON.stringify({ errors }));
await browser.close();
