// Headless screenshot harness. Usage:
// node tests/shot.mjs out.png [WxH] [query] [simSteps] [extraWaitMs]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [out = 'review/shot.png', size = '1280x720', query = '', steps = '0', wait = '600', evalJs = ''] = process.argv.slice(2);
const [w, h] = size.split('x').map(Number);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
const errors = [];
const requests = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('request', (r) => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) requests.push(r.url()); });
const url = 'file://' + path.join(root, 'dist/crestline.html') + (query ? '?' + query : '');
await page.goto(url);
await page.waitForTimeout(800);
if (+steps > 0) await page.evaluate((n) => window.__crest.simulate(n), +steps);
if (evalJs) await page.evaluate(evalJs);
const t0 = Date.now();
await page.evaluate(() => { window.__crest.renderOnce(); window.__crest.renderOnce(); });
console.error('render ms', (Date.now() - t0) / 2);
await page.waitForTimeout(+wait);
await page.screenshot({ path: path.join(root, out) });
console.log(JSON.stringify({ errors, requests }));
await browser.close();
