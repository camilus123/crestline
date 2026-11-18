// The benchmark's stage timing sees the SMAA pass: in both of the profiler's modes (GPU timers; making the GPU
// finish after every stage) a few frames with the option on give the stage "anti-aliasing (SMAA)" a time, and
// with it off the stage is not there.   node tests/smaastage.mjs
import { createRequire } from 'node:module'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(root + '/')('playwright');
const br = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await br.newPage({ viewport: { width: 480, height: 270 } }); p.setDefaultTimeout(580000);
const errors = []; p.on('pageerror', (e) => errors.push(String(e)));
await p.goto('file://' + path.join(root, 'dist/crestline.html') + '?race=MIHJHHTLI12&bot&manual&q=1', { waitUntil: 'commit' });
await p.waitForTimeout(2500);
const r = await p.evaluate(async () => {
  const g = window.__crest, R = g.renderer, pf = R.prof;
  g.simulate(200);
  const out = { timers: pf.timerAvailable };
  for (const smaa of [true, false]) for (const mode of ['sync', 'timer']) {
    if (mode === 'timer' && !pf.timerAvailable) continue;
    R.setQuality({ ...R.quality, smaa });
    g.renderOnce(0);
    pf.reset(); pf.mode = mode;
    for (let i = 0; i < 6; i++) g.renderOnce(0);
    if (mode === 'timer') { for (let k = 0; k < 20 && pf.gpuAvg('post (bloom, blur, tonemap)') < 0; k++) { pf.flush(); await new Promise((r) => setTimeout(r, 100)); } }
    out[`${smaa ? 'on' : 'off'}, ${mode}`] = { smaa: +pf.gpuAvg('anti-aliasing (SMAA)').toFixed(3), post: +pf.gpuAvg('post (bloom, blur, tonemap)').toFixed(3), listed: pf.order.includes('anti-aliasing (SMAA)') };
    pf.mode = 'off';
  }
  out.err = R.gl.getError();
  return out;
});
await br.close();
console.log(JSON.stringify(r, null, 1), 'errors', JSON.stringify(errors));
let bad = errors.length || r.err ? 1 : 0;
for (const [k, v] of Object.entries(r)) {
  if (typeof v !== 'object') continue;
  if (k.startsWith('on') && !(v.smaa > 0 && v.listed)) bad++;
  if (k.startsWith('off') && (v.listed || v.smaa > 0)) bad++;
}
if (bad) { console.log('FAILED'); process.exit(1); }
