// Picking the preset by measuring, and a lost graphics context, end to end on the software GPU.
//  1 a phone's first start measures and (being a software GPU) ends on Ultra Low; the title shows, frames go on
//  2 a second start does not measure again, and a preset picked by hand stays
//  3 with a generous limit the same measurement picks Commodore; with one between the two timings, Low
//  4 a measurement that never ended (the page died) gives Ultra Low without measuring
//  5 a desktop does not measure
//  6 a lost context in the menus: the notice, no more frames, "Restart on Ultra Low" starts again on it
//  7 a lost context during the benchmark: the report says it stopped, the player's settings are back
//  8 Settings has the "Pick the preset by measuring" row and it works
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(root + '/')('playwright');
const br = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const url = 'file://' + path.join(root, 'dist/crestline.html');
let bad = 0;
const check = (ok, what, info = '') => { console.log((ok ? 'ok    ' : 'FAIL  ') + what + (info ? '  ' + info : '')); if (!ok) bad++; };
const errors = [];
const fresh = async (phone) => {
  const ctx = await br.newContext(phone ? { viewport: { width: 480, height: 270 }, hasTouch: true, isMobile: true } : { viewport: { width: 480, height: 270 } });
  const p = await ctx.newPage(); p.setDefaultTimeout(240000);
  p.on('pageerror', (e) => errors.push(String(e)));
  return p;
};
const state = (p) => p.evaluate(() => { const g = window.__crest; const get = (k) => JSON.parse(localStorage.getItem('crestline.' + k) ?? 'null');
  return { ap: get('autoPreset'), saved: get('settings')?.quality ?? null, q: g.renderer.quality.name, screen: !!document.querySelector('.scr'), lost: g.contextLost, manual: g.manual }; });
// (frames drawn in `ms`; a software GPU needs most of a second for a Low frame)
const frames = (p, ms = 1500) => p.evaluate((ms) => new Promise((res) => { const R = window.__crest.renderer, o = R.render.bind(R); let n = 0; R.render = (...a) => { n++; return o(...a); }; setTimeout(() => { R.render = o; res(n); }, ms); }), ms);
const settled = (p) => p.waitForFunction(() => { const a = JSON.parse(localStorage.getItem('crestline.autoPreset') ?? 'null'); return a && !a.pending && !!document.querySelector('.scr'); });

// 1
let p = await fresh(true);
const touch = await (async () => { await p.goto(url, { waitUntil: 'commit' }); return p.evaluate(() => matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches); })();
check(touch, 'the test page counts as a touch-first device');
await settled(p);
let s = await state(p);
check(s.ap.preset === 'Ultra Low' && s.ap.lowMs > 22 && s.ap.commodoreMs === -1 && s.saved === 0 && s.q === 'Ultra Low', '1 first start on a phone: measured, Ultra Low (Low was too slow, Commodore not tried)', JSON.stringify(s.ap));
check(!s.manual && (await frames(p)) > 2, '1 the title screen is drawing afterwards');
// 2
const stamp = JSON.stringify(s.ap);
await p.reload({ waitUntil: 'commit' }); await p.waitForSelector('.scr'); await p.waitForTimeout(1200);
s = await state(p);
check(JSON.stringify(s.ap) === stamp && s.q === 'Ultra Low', '2 second start: not measured again');
await p.evaluate(() => { const g = window.__crest; g.settings.quality = 3; g.saveSettings(); });
await p.reload({ waitUntil: 'commit' }); await p.waitForSelector('.scr'); await p.waitForTimeout(1200);
s = await state(p);
check(s.q === 'High' && JSON.stringify(s.ap) === stamp, '2 a preset picked by hand stays', s.q);
await p.context().close();
// 3
p = await fresh(true);
await p.goto(url + '?measure=1000000', { waitUntil: 'commit' }); await settled(p);
s = await state(p);
const { lowMs, commodoreMs } = s.ap;
check(s.ap.preset === 'Commodore' && lowMs > 0 && commodoreMs > 0 && s.q === 'Commodore' && s.saved === 7, '3 generous limit: Commodore', JSON.stringify(s.ap));
await p.context().close();
if (commodoreMs > lowMs * 1.3) {
  p = await fresh(true);
  await p.goto(url + '?measure=' + Math.round(Math.sqrt(lowMs * commodoreMs)), { waitUntil: 'commit' }); await settled(p);
  s = await state(p);
  check(s.ap.preset === 'Low' && s.q === 'Low' && s.saved === 1, '3 limit between the two timings: Low', JSON.stringify(s.ap));
  await p.context().close();
} else check(false, '3 Low and Commodore too close on this machine to test the middle branch', `${lowMs} ${commodoreMs}`);
// 4
p = await fresh(true);
await p.addInitScript(() => { if (!sessionStorage.getItem('once')) { sessionStorage.setItem('once', '1'); localStorage.setItem('crestline.autoPreset', JSON.stringify({ pending: true })); } });
await p.goto(url, { waitUntil: 'commit' }); await p.waitForSelector('.scr'); await p.waitForTimeout(800);
s = await state(p);
check(s.ap.preset === 'Ultra Low' && /did not finish/.test(s.ap.note ?? '') && s.ap.lowMs === -1 && s.q === 'Ultra Low' && s.saved === 0, '4 a measurement that never ended: Ultra Low, not measured again', JSON.stringify(s.ap));
await p.context().close();
// 5
p = await fresh(false);
await p.goto(url, { waitUntil: 'commit' }); await p.waitForSelector('.scr'); await p.waitForTimeout(1200);
s = await state(p);
check(s.ap === null && s.q === 'High', '5 a desktop does not measure', s.q);
// 6 (frames counted on Ultra Low, which a software GPU can draw a few of; then on Low, so that the notice offers Ultra Low)
await p.evaluate(() => { const g = window.__crest; g.settings.quality = 0; g.saveSettings(); g.applyQuality(); }); await p.waitForTimeout(4000);
const before = await frames(p, 4000);
await p.evaluate(() => { const g = window.__crest; g.settings.quality = 1; g.saveSettings(); });
await p.evaluate(() => window.__crest.renderer.gl.getExtension('WEBGL_lose_context').loseContext());
await p.waitForSelector('#ctxlost');
const text = await p.locator('#ctxlost').textContent();
const after = await frames(p, 3000);
check(before >= 2 && after === 0 && /WebGL context lost/.test(text) && /Restart on Ultra Low/.test(text), '6 lost context: the notice is up and nothing more is drawn', `frames ${before} -> ${after}`);
await Promise.all([p.waitForNavigation({ waitUntil: 'commit' }), p.locator('#ctxlost .btn', { hasText: 'Restart on Ultra Low' }).click()]);
await p.waitForSelector('.scr'); await p.waitForTimeout(1200);
s = await state(p);
check(s.q === 'Ultra Low' && s.saved === 0 && !s.lost && (await frames(p)) > 2, '6 "Restart on Ultra Low": started again on it and drawing', s.q);
// 7
await p.evaluate(() => { const g = window.__crest; g.settings.quality = 2; g.settings.cars[0] = 2; g.saveSettings(); g.applyQuality(); globalThis.__benchQuick = true; g.show('bench'); });
await p.waitForTimeout(500);
await p.locator('.btn', { hasText: /start|run/i }).first().click();
await p.waitForFunction(() => window.__crest.bench && window.__crest.bench.results.length >= 1, null, { timeout: 240000 });
await p.evaluate(() => window.__crest.renderer.gl.getExtension('WEBGL_lose_context').loseContext());
await p.waitForSelector('#ctxlost');
const rep = await p.evaluate(() => JSON.parse(localStorage.getItem('crestline.lastBenchmark3')).text);
s = await state(p);
const kept = await p.evaluate(() => JSON.parse(localStorage.getItem('crestline.settings')));
check(/STOPPED: THE GRAPHICS CONTEXT WAS LOST/.test(rep) && /during case \d+ of \d+/.test(rep) && /== Measured before it stopped ==\ntrack/.test(rep) && /GPU/.test(rep) && !/null/.test(rep.split('== Measured')[0]),
  '7 benchmark: the report says where it stopped and lists what was measured');
check(kept.quality === 2 && kept.cars[0] === 2 && /benchmark stopped/.test(await p.locator('#ctxlost').textContent()), '7 the player\'s settings are back', JSON.stringify({ q: kept.quality, car: kept.cars[0] }));
console.log(rep.split('\n').slice(0, 3).join('\n').slice(0, 400)); console.log(rep.split('== Measured')[1].slice(0, 400));
await Promise.all([p.waitForNavigation({ waitUntil: 'commit' }), p.keyboard.press('Enter')]);
await p.waitForSelector('.scr'); await p.waitForTimeout(1000);
// 8
await p.evaluate(() => window.__crest.show('settings'));
await p.locator('.row', { hasText: 'Pick the preset by measuring' }).click();
await p.waitForFunction(() => { const a = JSON.parse(localStorage.getItem('crestline.autoPreset') ?? 'null'); return a && !a.pending && window.__crest.manual === false; });
await p.waitForTimeout(600);
s = await state(p);
const row = await p.locator('.row', { hasText: 'Quality preset' }).textContent();
const f8 = await frames(p, 6000);
check(s.ap.preset === 'Ultra Low' && s.q === 'Ultra Low' && /ULTRA LOW/i.test(row) && f8 >= 2, '8 from Settings: measured, preset row shows the result, drawing goes on', JSON.stringify({ row, f8, s }));
check(errors.length === 0, 'no page errors', errors.join(' | ').slice(0, 300));
await br.close();
console.log(bad ? `${bad} FAILED` : 'all passed');
process.exit(bad ? 1 : 0);
