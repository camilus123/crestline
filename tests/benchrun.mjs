// Runs the in-game benchmark end to end and prints the report. node tests/benchrun.mjs [WxH] [q]
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [size = '640x360', q = ''] = process.argv.slice(2);
const [w, h] = size.split('x').map(Number);
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: w, height: h } });
p.setDefaultTimeout(1600000);
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
// NOTIMERS=1: behave like a browser without GPU timer queries (Firefox, most phones)
// GIVEUP=n: a preset under n fps is given up, with the heavier ones (the quick suite otherwise never gives up)
await p.addInitScript(([nt, gu, only]) => { window.__benchQuick = true; if (nt) window.__noGpuTimers = true; if (gu) window.__benchGiveUp = gu; if (only) window.__benchGiveUpOnly = only; }, [!!process.env.NOTIMERS, +(process.env.GIVEUP ?? 0), process.env.EXPECT === 'low' ? 'Low' : '']);
await p.goto('file://' + path.join(root, 'dist/crestline.html') + '?screen=bench' + (q ? '&q=' + q : ''), { waitUntil: 'commit', timeout: 120000 });
await p.waitForTimeout(3000);
// PACE=1: with frame pacing on (the report must then carry its pacing section)
if (process.env.PACE) await p.evaluate(() => { window.__crest.settings.pace = true; });
// SMAA=1: the player's own settings are Low with SMAA on (the report must then time it as a stage of 'Yours')
if (process.env.SMAA) await p.evaluate(() => { const g = window.__crest; g.settings.quality = 1; g.settings.qo = { smaa: true }; g.applyQuality(); });
await p.keyboard.press('Enter');
const t0 = Date.now();
let report = '';
const labels = new Set();
while (Date.now() - t0 < 1500000) {
  await p.waitForTimeout(3000);
  const st = await p.evaluate(() => ({ screen: window.__crest.screenId, bar: document.querySelector('.benchbar')?.textContent ?? '', out: document.querySelector('.benchout')?.textContent ?? '' }));
  if (st.bar) labels.add(st.bar.split('·')[1]?.trim());
  if (st.screen === 'bench' && st.out && Date.now() - t0 > 10000) { console.log('phases seen:', [...labels].join(' | ')); console.log(st.out); report = st.out; break; }
}
// the game must still be drawing after the report is up (it once died here on devices without GPU timers)
const alive = await p.evaluate(async () => { const g = window.__crest; let n = 0; const f = g.frame.bind(g); g.frame = (...a) => { n++; return f(...a); }; await new Promise((r) => setTimeout(r, 4000)); g.frame = f; return n; });
console.log('frames in the 4 s after the report:', alive);
console.log('errors', JSON.stringify(errors));
await b.close();
if (process.env.SMAA) {
  const stage = report.split('\n').filter((l) => l.startsWith('anti-aliasing (SMAA)'));
  const ok = stage.length > 0 && /smaa false>true/.test(report) && /Yours: Low \(custom\)/.test(report) && /SMAA on/.test(report) && /Low: .*SMAA off/.test(report);
  console.log('SMAA in the report:', ok ? 'yes' : 'NO', stage[0] ?? '');
  if (!ok) process.exit(1);
}
if (process.env.GIVEUP) {
  // EXPECT=ultra: Ultra Low itself fell short (it stays in, Low goes on both tracks); EXPECT=low: Low fell short on the first track
  const rows = (name) => report.split('\n').filter((l) => new RegExp('^(Forest|Mountains) +' + name + ' ').test(l)).length;
  const data = JSON.parse(report.split('\n').filter((l) => l.startsWith('{"v"')).pop());
  const want = process.env.EXPECT === 'ultra' ? { ul: 2, low: 0, skipped: 2, who: 'Ultra Low' } : { ul: 2, low: 1, skipped: 1, who: 'Low' };
  const ok = rows('Ultra Low') === want.ul && rows('Low') === want.low && data.skipped.length === want.skipped && data.gaveUp.length === 1 && data.gaveUp[0].settings === want.who
    && /^GIVEN UP: under/m.test(report) && new RegExp(want.who + ' reached [\\d.]+ fps on Forest').test(report) && /Not run: .*Mountains: Low/.test(report)
    && (want.low !== 1 || /^Low +\(1 of 2 tracks\)/m.test(report));
  console.log('giving up:', ok ? 'as expected' : 'NOT AS EXPECTED', JSON.stringify({ ul: rows('Ultra Low'), low: rows('Low'), gaveUp: data.gaveUp, skipped: data.skipped }));
  if (!ok) process.exit(1);
}
if (alive < 1 || errors.length) process.exit(1);
