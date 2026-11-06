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
p.setDefaultTimeout(600000);
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await p.goto('file://' + path.join(root, 'dist/crestline.html') + '?screen=bench' + (q ? '&q=' + q : ''), { waitUntil: 'commit', timeout: 120000 });
await p.waitForTimeout(3000);
await p.keyboard.press('Enter');
const t0 = Date.now();
const labels = new Set();
while (Date.now() - t0 < 500000) {
  await p.waitForTimeout(3000);
  const st = await p.evaluate(() => ({ screen: window.__crest.screenId, bar: document.querySelector('.benchbar')?.textContent ?? '', out: document.querySelector('.benchout')?.textContent ?? '' }));
  if (st.bar) labels.add(st.bar.split('·')[1]?.trim());
  if (st.screen === 'bench' && st.out && Date.now() - t0 > 10000) { console.log('phases seen:', [...labels].join(' | ')); console.log(st.out); break; }
}
console.log('errors', JSON.stringify(errors));
await b.close();
