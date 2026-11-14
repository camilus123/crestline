// Frame cost per preset (GPU finished every frame) in a phone-like viewport. node tests/presetcost.mjs [WxH] [dpr] [code]
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [size = '915x412', dpr = '2.625', code = 'TUORSWWUS14'] = process.argv.slice(2);
const [w, h] = size.split('x').map(Number);
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const q of [0, 1, 3, 5]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: +dpr, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.setDefaultTimeout(600000);
  await p.goto('file://' + path.join(root, 'dist/crestline.html') + `?race=${code}&bot&manual&q=${q}`, { waitUntil: 'commit', timeout: 120000 });
  await p.waitForTimeout(3000);
  const r = await p.evaluate(async () => {
    const g = window.__crest, R = g.renderer;
    g.simulate(1500);
    R.prof.mode = 'off';
    for (let i = 0; i < 2; i++) { g.renderOnce(1 / 60); R.prof.sync(); }
    let t = 0;
    for (let i = 0; i < 4; i++) { const t0 = performance.now(); g.simulate(2); g.renderOnce(1 / 60); R.prof.sync(); t += performance.now() - t0; }
    return { q: R.quality.name, canvas: R.canvas.width + 'x' + R.canvas.height, render: R.renderW + 'x' + R.renderH, ms: (t / 4).toFixed(0) };
  });
  console.log(JSON.stringify(r));
  await ctx.close();
}
await b.close();
