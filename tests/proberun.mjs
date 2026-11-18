// Runs the picture cost test end to end (cut down: one round of one track) and prints its report.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 320, height: 180 } });
p.setDefaultTimeout(1600000);
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await p.addInitScript(() => { window.__benchQuick = true; window.__noGpuTimers = true; });
await p.goto('file://' + path.join(root, 'dist/crestline.html'), { waitUntil: 'commit' });
await p.waitForTimeout(3000);
const text = await p.evaluate(() => new Promise((res) => { window.__crest.startBenchmark((r) => res(r.text), true); }));
console.log(text);
// afterwards: the switches are back as released and frames are still being drawn
const after = await p.evaluate(async () => {
  const g = window.__crest; let n = 0; const f = g.frameBody.bind(g); g.frameBody = (...a) => { n++; return f(...a); };
  await new Promise((r) => setTimeout(r, 4000));
  return { pic: g.renderer.pic, frames: n, bench: !!g.bench };
});
console.log(JSON.stringify(after), errors);
await b.close();
const json = JSON.parse(text.split('\n').pop());
const ok = json.probe === 'picture' && json.cases.length === 10 && json.cases.every((c) => c.costMs.length === 1 && c.costMs[0] > 0)
  && text.includes('== High: frame cost in ms ==') && text.includes('== Commodore: frame cost in ms ==')
  && after.pic.env === 'first' && after.frames > 0 && !after.bench && !errors.length;
if (!ok) { console.log('FAILED'); process.exit(1); }
