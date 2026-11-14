// JavaScript (main-thread) time per frame by stage: what limits the frame rate once the GPU is fast enough.
// node tests/cpucost.mjs <code> <quality> [html]
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(root + '/')('playwright');
const [code, q, html = path.join(root, 'dist/crestline.html')] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 160, height: 90 } }); p.setDefaultTimeout(580000);
p.on('pageerror', (e) => console.log('ERR', String(e).slice(0, 500)));
await p.goto('file://' + html + `?race=${code}&bot&q=${q}`, { waitUntil: 'commit' });
await p.waitForTimeout(2500);
const r = await p.evaluate(() => {
  const g = window.__crest, R = g.renderer, pf = R.prof;
  R.setQuality({ ...R.quality, msaa: 0 }); // (fill cost is not the subject, and the software GPU is slow at it)
  g.simulate(900); for (let i = 0; i < 5; i++) g.renderOnce(1 / 240);
  pf.mode = 'cpu'; pf.reset();
  const N = 40; const t0 = performance.now(); let calls = 0;
  for (let i = 0; i < N; i++) { pf.frameStart(); g.renderOnce(1 / 240); pf.frameEnd(); }
  const total = (performance.now() - t0) / N;
  const rows = pf.order.map((n) => [n, pf.cpuAvg(n)]);
  pf.mode = 'off';
  return { preset: R.quality.name, total, calls: pf.calls / N, rows };
});
console.log(`${code} ${r.preset}: ${r.total.toFixed(2)} ms of JavaScript per frame, ${r.calls | 0} draw calls`);
for (const [n, ms] of r.rows.sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log('   ' + n.padEnd(34) + ms.toFixed(2).padStart(7) + ' ms');
console.log('   (sum of stages ' + r.rows.reduce((a, x) => a + x[1], 0).toFixed(2) + ' ms)');
await b.close();
