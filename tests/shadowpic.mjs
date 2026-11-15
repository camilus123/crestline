// Renders the same frame with two builds and reports how many pixels differ.
// node tests/samepic.mjs <old.html> <new.html> <raceCode> [q] [simulateFrames]
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(root + '/')('playwright');
const [a, b, code, q = '3', frames = '900'] = process.argv.slice(2);
const br = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const grab = async (html) => {
  const p = await br.newPage({ viewport: { width: 320, height: 180 } }); p.setDefaultTimeout(580000);
  await p.goto('file://' + path.resolve(html) + `?race=${code}&bot&manual&q=${q}&lod=${process.env.LOD || ""}`, { waitUntil: 'commit' });
  await p.waitForTimeout(2500);
  const px = await p.evaluate((n) => { const g = window.__crest, R = g.renderer; R.setQuality({ ...R.quality, shadows: 1024, msaa: 0, lod: +(new URLSearchParams(location.search).get("lod") || R.quality.lod) }); g.simulate(n); g.renderOnce(1 / 60); g.renderOnce(0); const gl = R.gl; const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight; const d = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, d); return { w, h, d: Array.from(d), live: R.shadowLive, err: gl.getError() }; }, +frames);
  await p.close();
  return px;
};
const A = await grab(a), B = await grab(b);
let diff = 0, big = 0, max = 0;
for (let i = 0; i < A.d.length; i += 4) { const e = Math.max(Math.abs(A.d[i] - B.d[i]), Math.abs(A.d[i + 1] - B.d[i + 1]), Math.abs(A.d[i + 2] - B.d[i + 2])); if (e > 0) diff++; if (e > 8) big++; max = Math.max(max, e); }
console.log(`shadows ${A.live}/${B.live} glerr ${A.err}/${B.err} ${code} q${q}: ${A.w}x${A.h}, pixels differing ${diff} (${(diff / (A.w * A.h) * 100).toFixed(2)} %), by more than 8/255: ${big}, largest difference ${max}`);
await br.close();
