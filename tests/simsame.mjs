// The same race simulated by two builds must end in the same state. node tests/simsame.mjs old.html new.html [steps]
import { createRequire } from 'node:module'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(root + '/')('playwright');
const [a, bb, steps = '9000'] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let bad = 0;
for (const code of ['MIHJHHTLI12', 'UTNRSVVLR17', 'KIGJHGSHI15', 'TUORSWWUS14']) {
  const res = [];
  for (const html of [a, bb]) {
    const p = await b.newPage({ viewport: { width: 160, height: 90 } }); p.setDefaultTimeout(580000);
    await p.goto('file://' + path.resolve(html) + `?race=${code}&bot&manual&q=0`, { waitUntil: 'commit' });
    await p.waitForTimeout(2500);
    res.push(await p.evaluate((n) => { const g = window.__crest; g.simulate(n); return g.race.cars.map((c) => [c.dist, c.x, c.v]); }, +steps));
    await p.close();
  }
  let max = 0; res[0].forEach((c, i) => c.forEach((v, k) => { max = Math.max(max, Math.abs(v - res[1][i][k])); }));
  console.log(`${code}: largest difference in any car's distance, lateral position or speed after ${steps} steps: ${max}`);
  if (max > 0) bad++;
}
await b.close();
process.exit(bad ? 1 : 0);
