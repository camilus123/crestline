// The progress strip under a browser's forced dark mode (it repaints light backgrounds dark: seen on a phone,
// where the white opponent marks came out black). Crops the strip from a race with the mode off and on.
// usage: node tests/forcedark.mjs [build.html] [out-prefix]
import { createRequire } from 'node:module'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(root + '/')('playwright');
const build = path.resolve(process.argv[2] ?? path.join(root, 'dist/crestline.html'));
const out = process.argv[3] ?? 'forcedark';
for (const dark of [false, true]) {
  const br = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', ...(dark ? ['--blink-settings=forceDarkModeEnabled=true'] : [])] });
  const p = await br.newPage({ viewport: { width: 900, height: 420 }, deviceScaleFactor: 2 });
  await p.goto('file://' + build + '?race=MIHJHHTLI12&bot&q=0', { waitUntil: 'commit' });
  await p.waitForSelector('.hud .prog i', { timeout: 60000 });
  await p.waitForTimeout(1500);
  // spread the field out as it is in mid-race (the software GPU is too slow to get there), the player in the middle
  await p.addStyleTag({ content: Array.from({ length: 20 }, (_, i) => `.hud .prog i:nth-of-type(${i + 1}){left:${36 + i * 0.9 + (i % 3) * 0.5}% !important}`).join('') });
  await p.waitForTimeout(300);
  const box = await p.evaluate(() => { const r = document.querySelector('.hud .prog').getBoundingClientRect(); return { x: r.x - 20, y: r.y - 14, width: r.width + 40, height: r.height + 28 }; });
  await p.screenshot({ path: `${out}-${dark ? 'on' : 'off'}.png`, clip: box });
  await br.close();
}

