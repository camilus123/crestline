// End-to-end: open the built file via file:// with ALL network blocked, drive the menus with the
// keyboard from the title to a running race, check console errors and network requests.
// node tests/flow.mjs [WxH]
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [size = '1280x720'] = process.argv.slice(2);
const [w, h] = size.split('x').map(Number);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: w, height: h } });
const errors = [], requests = [];
await ctx.route('**/*', (route) => {
  const u = route.request().url();
  if (u.startsWith('file:')) return route.continue();
  requests.push(u);
  return route.abort();
});
const page = await ctx.newPage();
page.setDefaultTimeout(300000);
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const t0 = Date.now();
await page.goto('file://' + path.join(root, 'dist/crestline.html'));
await page.waitForFunction(() => window.__crest && window.__crest.screenId === 'title');
const step = async (key, expect) => {
  await page.keyboard.press(key);
  if (expect) await page.waitForFunction((e) => window.__crest.screenId === e, expect, { timeout: 120000 });
};
await page.waitForTimeout(600);
await step('Enter', 'setup');
await page.waitForTimeout(400);
const tStart = Date.now();
await step('Enter', 'music'); // START has default focus
await step('Enter', 'cars');
await step('Enter', 'grid');
await step('Enter', 'race');
const toRace = (Date.now() - tStart) / 1000;
// let it run a bit
await page.waitForTimeout(4000);
const state = await page.evaluate(() => ({ screen: window.__crest.screenId, started: !!window.__crest.race, time: window.__crest.race?.clock, audio: window.__crest.audio.ctx?.state, music: window.__crest.audio.music?.playing }));
// pause with Escape and resume
await page.keyboard.press('Escape');
await page.waitForFunction(() => window.__crest.screenId === 'pause');
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__crest.screenId === 'race');
await page.screenshot({ path: path.join(root, 'review/flow_race.png') });
console.log(JSON.stringify({ toRaceSeconds: toRace, totalSeconds: (Date.now() - t0) / 1000, state, errors, requests }, null, 1));
await browser.close();
