// The sky picture the cars reflect, drawn in the middle of the frame ('mid') or before the main picture
// ('first'), must give the same picture; also with sun shadows on (Admiral: the main picture is cleared again
// after the shadow maps). Renders one frozen moment both ways and counts the pixels that differ.
import { createRequire } from 'node:module'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(root + '/')('playwright');
import { execFileSync } from 'node:child_process'; import os from 'node:os'; import fs from 'node:fs';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'picorder-'));
const br = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let bad = 0;
// (the last one with a split screen: there the main picture is not cleared again, the other half is already drawn)
for (const [q, name, players] of [[3, 'High', 1], [6, 'Admiral', 1], [7, 'Commodore', 1], [6, 'Admiral, two players', 2]]) {
  const p = await br.newPage({ viewport: { width: 480, height: 210 } }); p.setDefaultTimeout(580000);
  const errors = []; p.on('pageerror', (e) => errors.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto('file://' + path.join(root, 'dist/crestline.html') + `?race=MIHJHHTLI12&bot&manual&q=${q}&players=${players}`, { waitUntil: 'commit' });
  await p.waitForTimeout(2500);
  await p.evaluate(() => { const g = window.__crest; g.simulate(300); });
  const shot = async (env, f) => {
    await p.evaluate((env) => { const g = window.__crest; g.renderer.pic.env = env; g.renderOnce(0); g.renderOnce(0); }, env);
    await p.locator('canvas').first().screenshot({ path: path.join(tmp, f), timeout: 300000 });
  };
  await shot('mid', 'a.png'); await shot('first', 'b.png'); await shot('mid', 'c.png'); await shot('off', 'o.png');
  // (pixels compared with Python's imaging library: more than 6 levels apart over the three channels)
  const [d, noise, total, off, lit] = execFileSync('python3', ['-c', `
from PIL import Image, ImageChops
import sys
a,b,c,o=[Image.open(sys.argv[1]+'/'+n).convert('RGB') for n in ('a.png','b.png','c.png','o.png')]
def diff(x,y):
    d=ImageChops.difference(x,y); r,g,bl=d.split()
    s=ImageChops.add(ImageChops.add(r,g),bl)
    return sum(1 for v in s.tobytes() if v>6)
print(diff(a,b),diff(a,c),a.width*a.height,diff(a,o),sum(1 for v in a.convert('L').tobytes() if v>40))`, tmp]).toString().trim().split(' ').map(Number);
  const glerr = await p.evaluate(() => window.__crest.renderer.gl.getError());
  console.log(`${name}: ${d} of ${total} pixels differ between 'mid' and 'first' (two 'mid' frames differ in ${noise}; with the sky picture off ${off} differ; ${lit} pixels are not dark); GL error ${glerr}; ${errors.length} page errors ${errors.slice(0, 2).join(' | ')}`);
  // (the check must be able to fail: the frame is a real picture, and on presets with reflections switching them off shows)
  if (d > Math.max(noise * 2, total * 0.002) || glerr || errors.length || lit < total * 0.2 || (name !== 'Commodore' && off === 0)) bad++;
  await p.close();
}
await br.close();
if (bad) process.exit(1);
