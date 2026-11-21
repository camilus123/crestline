// Steps two builds through the same race side by side and counts the pixels that differ every <step> frames.
// Both pages get the same random numbers (sparks, spray and the like roll dice): the same build twice gives 0
// everywhere. Unlike samepic.mjs this looks at many moments, which matters for rules that fire only now and then.
//   node tests/picscan.mjs <a.html> <b.html> <raceCode> <q> <step> <count>
import { createRequire } from 'node:module'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(root + '/')('playwright');
const [a, b, code, q, step, count] = process.argv.slice(2);
const br = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const open = async (html) => { const p = await br.newPage({ viewport: { width: 480, height: 270 } }); p.setDefaultTimeout(580000);
  await p.addInitScript(() => { let x = 123456789; Math.random = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; }; }); // (the same dice in both pages)
  await p.goto('file://' + path.resolve(html) + `?race=${code}&bot&manual&q=${q}`, { waitUntil: 'commit' }); await p.waitForTimeout(2500); return p; };
const shot = (p, n) => p.evaluate((n) => { const g = window.__crest, R = g.renderer; g.simulate(n); g.renderOnce(1 / 60); g.renderOnce(0); const gl = R.gl; const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight; const d = new Uint8Array(w * h * 4); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, d); let s = ''; for (let i = 0; i < d.length; i += 4096) s += String.fromCharCode(...d.subarray(i, i + 4096)); return btoa(s); }, n);
const A = await open(a), B = await open(b);
const out = [];
for (let k = 1; k <= +count; k++) {
  const [x, y] = await Promise.all([shot(A, +step), shot(B, +step)]);
  const X = Buffer.from(x, 'base64'), Y = Buffer.from(y, 'base64'); let n = 0;
  for (let i = 0; i < X.length; i += 4) if (X[i] !== Y[i] || X[i + 1] !== Y[i + 1] || X[i + 2] !== Y[i + 2]) n++;
  out.push(`${k * +step}:${n}`);
}
console.log(code, 'q' + q, out.join(' '));
await br.close();
