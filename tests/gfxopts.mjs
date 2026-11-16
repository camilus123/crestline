// Graphics options: pick Medium, lower MSAA, check the renderer got it and it survives a reload; picking a preset resets.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(root + '/')('playwright');
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 520, height: 300 } });
const p = await ctx.newPage(); p.setDefaultTimeout(120000);
const errors = []; p.on('pageerror', (e) => errors.push(String(e)));
const url = 'file://' + path.join(root, 'dist/crestline.html');
await p.goto(url + '?screen=settings', { waitUntil: 'commit' });
await p.waitForSelector('.panel'); await p.waitForTimeout(800);
const Q = () => p.evaluate(() => { const q = window.__crest.renderer.quality; return { name: q.name, msaa: q.msaa, shadows: q.shadows, ssao: q.ssao }; });
await p.evaluate(() => { const g = window.__crest; g.settings.quality = 2; g.settings.qo = {}; g.applyQuality(); g.saveSettings(); g.show('graphics'); });
await p.waitForTimeout(600);
const log = { medium: await Q() };
const row = (t) => p.locator('.row', { hasText: t });
await row('Anti-aliasing').locator('[data-dir="-1"]').click(); await p.waitForTimeout(200);
log.msaaDown = await Q();
log.marked = await row('Anti-aliasing').locator('.lab').textContent();
await p.reload({ waitUntil: 'commit' }); await p.waitForTimeout(1500);
log.afterReload = await Q();
await p.evaluate(() => { const g = window.__crest; g.settings.quality = 0; g.settings.qo = {}; g.applyQuality(); g.show('graphics'); });
await p.waitForTimeout(400);
await row('Sun shadows').locator('[data-dir="1"]').click(); await p.waitForTimeout(200);
log.ultraLowWithShadows = await Q();
await row('Reset to the preset').click(); await p.waitForTimeout(200);
log.reset = await Q();
// free values: the arrows move in fine steps from wherever the value is, and a value can be typed
const D = () => p.evaluate(() => { const q = window.__crest.renderer.quality; return { dist: q.dist, lod: q.lod, scale: q.scale }; });
await p.evaluate(() => { const g = window.__crest; g.settings.quality = 3; g.settings.qo = {}; g.applyQuality(); g.show('graphics'); });
await p.waitForTimeout(400);
await row('Draw distance').locator('[data-dir="1"]').click(); await p.waitForTimeout(150);
log.distUp = (await D()).dist;                       // 1 -> 1.05
await row('Draw distance').locator('.free').click(); await p.waitForTimeout(150);
await p.keyboard.type('1.33'); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
log.distTyped = (await D()).dist;                    // 1.33
await row('Draw distance').locator('[data-dir="1"]').click(); await p.waitForTimeout(150);
log.distNext = (await D()).dist;                     // 1.35
await row('Full-detail distance').locator('.free').click(); await p.waitForTimeout(150);
await p.keyboard.type('9999'); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
log.lodClamped = (await D()).lod;                    // 600
await row('Render resolution').locator('.free').click(); await p.waitForTimeout(150);
await p.keyboard.type('66'); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
log.scaleTyped = (await D()).scale;                  // 0.66
await p.reload({ waitUntil: 'commit' }); await p.waitForTimeout(1500);
log.afterReload2 = await D();
await p.evaluate(() => { const g = window.__crest; g.show('graphics'); });
await p.waitForTimeout(400);
await p.setViewportSize({ width: 900, height: 620 });
await row('Bloom').locator('[data-dir="1"]').click(); await p.waitForTimeout(300);
await p.screenshot({ path: path.join(root, 'review/v3/graphics_options.png'), timeout: 300000 });
console.log(JSON.stringify(log, null, 1), 'errors', JSON.stringify(errors));
await b.close();
const ok = log.distUp === 1.05 && log.distTyped === 1.33 && log.distNext === 1.35 && log.lodClamped === 600 && log.scaleTyped === 0.66 && log.afterReload2.dist === 1.35 && log.afterReload2.scale === 0.66 && !errors.length;
if (!ok) { console.log('FAILED'); process.exit(1); }
