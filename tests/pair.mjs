// Two builds side by side at the same moment of the same race: node tests/pair.mjs old.html new.html CODE [q] [steps] [WxH] -> scratch PNG path printed
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs'; import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(root + '/')('playwright');
const [a, b, code, q = '3', steps = '600', size = '960x420', out = 'pair'] = process.argv.slice(2);
const [w, h] = size.split('x').map(Number);
const br = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const shots = [];
for (const html of [a, b]) {
  const p = await br.newPage({ viewport: { width: w, height: h } }); p.setDefaultTimeout(580000);
  p.on('pageerror', (e) => console.log('ERROR', String(e)));
  await p.goto('file://' + path.resolve(html) + `?race=${code}&bot&manual&q=${q}`, { waitUntil: 'commit' });
  await p.waitForTimeout(2500);
  await p.evaluate((n) => { const g = window.__crest; g.simulate(n); g.renderOnce(1 / 60); g.renderOnce(0); }, +steps);
  const f = `${out}-${shots.length}.png`;
  await p.locator('canvas').first().screenshot({ path: f, timeout: 300000 });
  shots.push(f); await p.close();
}
await br.close();
console.log(shots.join(' '));
