// Screenshot after rendering a run of consecutive frames, so particle effects (dust, spray) build up.
// node tests/dust.mjs <out.png> <WxH> <query> <warmupSteps> <renderedFrames> [stepsPerFrame]
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [out, size = '1280x720', query = '', warm = '600', frames = '90', per = '2'] = process.argv.slice(2);
const [w, h] = size.split('x').map(Number);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: w, height: h } });
page.setDefaultTimeout(1200000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('file://' + (process.env.HTML || path.join(root, 'dist/crestline.html')) + '?' + query);
await page.waitForTimeout(800);
if (warm.startsWith("S")) await page.evaluate((t) => { const g = window.__crest; let k = 0; while (g.race.players[0].s < t && k++ < 20000) g.simulate(2); }, +warm.slice(1));
else if (warm.startsWith("s")) await page.evaluate((t) => { const g = window.__crest; let k = 0; while (g.race.players[0].dist < t && k++ < 20000) g.simulate(6); }, +warm.slice(1));
else await page.evaluate((n) => window.__crest.simulate(n), +warm);
await page.evaluate(([f, n]) => { for (let i = 0; i < f; i++) { window.__crest.simulate(n); window.__crest.renderOnce(n / 120); } }, [+frames, +per]);
await page.screenshot({ path: path.join(root, out), timeout: 1200000 });
console.log(JSON.stringify({ errors }));
await browser.close();
