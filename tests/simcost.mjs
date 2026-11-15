// Time of one simulation step (120 per second), per track. node tests/simcost.mjs [html] [codes...]
import { createRequire } from 'node:module'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(root + '/')('playwright');
const [html = path.join(root, 'dist/crestline.html'), ...codes] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const code of codes.length ? codes : ['MIHJHHTLI12', 'UTNRSVVLR17', 'KIGJHGSHI15', 'TUORSWWUS14']) {
  const p = await b.newPage({ viewport: { width: 160, height: 90 } }); p.setDefaultTimeout(580000);
  await p.goto('file://' + path.resolve(html) + `?race=${code}&bot&manual&q=0`, { waitUntil: 'commit' });
  await p.waitForTimeout(2500);
  const r = await p.evaluate(() => { const g = window.__crest; g.simulate(1200); const out = []; for (let k = 0; k < 5; k++) { const t0 = performance.now(); g.simulate(1200); out.push((performance.now() - t0) / 1200); } out.sort((a, b) => a - b); return { ms: out[2], cars: g.race.cars.length, traffic: g.race.traffic.length }; });
  console.log(`${code}: ${(r.ms * 1000).toFixed(0)} us per step, ${r.cars} cars, ${r.traffic} traffic`);
  await p.close();
}
await b.close();
