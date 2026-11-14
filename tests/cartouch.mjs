// Car selection by touch on a phone-sized screen: tap the arrows, swipe, tap a colour, tap Select.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(root + '/')('playwright');
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 780, height: 360 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
const p = await ctx.newPage(); p.setDefaultTimeout(120000);
const errors = []; p.on('pageerror', (e) => errors.push(String(e)));
await p.goto('file://' + path.join(root, 'dist/crestline.html') + '?screen=cars', { waitUntil: 'commit' });
await p.waitForSelector('.carsel');
await p.waitForTimeout(1500);
const state = () => p.evaluate(() => { const s = window.__crest.showroom; return s ? [s.car, s.livery] : null; });
const log = [];
log.push(['start', await state()]);
await p.tap('.cararrow.r'); await p.waitForTimeout(400); log.push(['tap right arrow', await state()]);
await p.tap('.cararrow.l'); await p.waitForTimeout(400); log.push(['tap left arrow', await state()]);
// swipe left across the middle
const cdp = await ctx.newCDPSession(p);
const sw = async (x0, x1) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: 150 }] }); for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * i / 5, y: 150 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
await sw(500, 300); await p.waitForTimeout(400); log.push(['swipe left', await state()]);
await p.tap('.swatches i:nth-child(5)'); await p.waitForTimeout(400); log.push(['tap 5th colour', await state()]);
await p.screenshot({ path: process.argv[2] || path.join(root, 'review/v3/cars_phone.png') });
const box = await p.evaluate(() => [...document.querySelectorAll('.carbtns .btn, .swatches i, .cararrow')].every((e) => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }));
await p.tap('.carbtns .btn.go'); await p.waitForTimeout(600);
const after = await p.evaluate(() => ({ screen: document.querySelector('.carsel') ? 'cars' : 'next', saved: [window.__crest.settings.cars[0], window.__crest.settings.colors[0]] }));
console.log(JSON.stringify({ log, allControlsOnScreen: box, afterSelect: after, errors }));
await b.close();
