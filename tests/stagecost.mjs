// Per-stage frame cost for a preset on one track (software GPU: only the relative sizes mean anything).
// node tests/stagecost.mjs <raceCode> <quality 0-5> [WxH] [html]
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(root + '/')('playwright');
const [code, q, size = '800x360', html = path.join(root, 'dist/crestline.html')] = process.argv.slice(2);
const [W, H] = size.split('x').map(Number);
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: W, height: H } }); p.setDefaultTimeout(580000);
p.on('pageerror', (e) => console.log('ERR', String(e).slice(0, 500)));
await p.goto('file://' + html + `?race=${code}&bot&q=${q}`, { waitUntil: 'commit' });
await p.waitForTimeout(3000);
const r = await p.evaluate(() => {
  const g = window.__crest, R = g.renderer, pf = R.prof;
  g.simulate(900); g.renderOnce(1 / 60); g.renderOnce(1 / 60);
  pf.mode = 'sync'; pf.reset();
  const N = 3; const t0 = performance.now();
  for (let i = 0; i < N; i++) { pf.frameStart(); g.simulate(1); g.renderOnce(1 / 60); pf.sync(); pf.frameEnd(); }
  const total = (performance.now() - t0) / N;
  const rows = pf.order.map((n) => [n, pf.gpuAvg(n)]);
  const out = { preset: R.quality.name, res: R.renderW + 'x' + R.renderH, total, calls: pf.calls / N, inst: pf.instances / N, verts: pf.verts / N, rows };
  pf.mode = 'off';
  return out;
});
console.log(`${code} ${r.preset} ${r.res}: ${r.total.toFixed(0)} ms/frame, ${r.calls | 0} calls, ${r.inst | 0} instances, ${(r.verts / 1000).toFixed(0)}k verts`);
for (const [n, ms] of r.rows.sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log('   ' + n.padEnd(34) + ms.toFixed(1).padStart(8) + ' ms ' + (ms / r.total * 100).toFixed(0).padStart(3) + ' %');
console.log('   sum of stages', r.rows.reduce((a, x) => a + x[1], 0).toFixed(0));
await b.close();
