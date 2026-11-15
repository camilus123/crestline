// On a Wind track the sway phase must advance at the sway's own speed (a few radians per second) however long
// the race has run and however the gusts come and go.
import { createRequire } from 'node:module'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(root + '/')('playwright');
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 160, height: 90 } }); p.setDefaultTimeout(580000);
const errors = []; p.on('pageerror', (e) => errors.push(String(e)));
await p.goto('file://' + path.join(root, 'dist/crestline.html') + '?race=KHGIHFQRH11&bot&manual&q=0', { waitUntil: 'commit' });
await p.waitForTimeout(2500);
const r = await p.evaluate(() => {
  const g = window.__crest, sc = () => g.renderer.scenery;
  g.simulate(120 * 60); g.renderOnce(1 / 60);
  let max = 0, prev = sc().windPhase, strongest = 0;
  for (let i = 0; i < 400; i++) {
    g.simulate(2); g.renderOnce(1 / 60);
    let d = sc().windPhase - prev; if (d < 0) d += Math.PI * 2000;
    prev = sc().windPhase; max = Math.max(max, d * 60);
  }
  return { maxRadPerSecond: max };
});
console.log(JSON.stringify({ ...r, errors }));
await b.close();
if (!(r.maxRadPerSecond > 1 && r.maxRadPerSecond < 6) || errors.length) process.exit(1);
