// Frame pacing: with it on, frames are still drawn, none is started while the GPU is busy, nothing throws;
// prints the rhythm of drawn frames with pacing off and on (software GPU, so the numbers say little about a phone).
import { createRequire } from 'node:module'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(root + '/')('playwright');
const br = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const [w, h] = (process.argv[2] ?? '640x360').split('x').map(Number);
const p = await br.newPage({ viewport: { width: w, height: h } });
const errors = []; p.on('pageerror', (e) => errors.push(String(e)));
await p.goto('file://' + path.join(root, 'dist/crestline.html') + '?race=MIHJHHTLI12&bot&q=' + (process.argv[3] ?? '3'), { waitUntil: 'commit' });
await p.waitForTimeout(5000);
const run = (on) => p.evaluate(async (on) => {
  const g = window.__crest; g.settings.pace = on;
  let calls = 0, last = 0; const iv = []; const ns = [];
  const f = g.frame.bind(g), fb = g.frameBody.bind(g);
  g.frame = (...a) => { calls++; return f(...a); };
  g.frameBody = (...a) => { const t = performance.now(); if (last) iv.push(t - last); last = t; ns.push(g.pacer.n); return fb(...a); };
  await new Promise((r) => setTimeout(r, 6000));
  g.frame = f; g.frameBody = fb;
  const s = iv.slice().sort((a, b) => a - b), q = (x) => +(s[Math.floor((s.length - 1) * x)] ?? -1).toFixed(1);
  return { asleep: g.asleep, screen: g.screenId, pacing: g.pacing, refreshes: calls, drawn: iv.length + 1, p50: q(0.5), p95: q(0.95), p99: q(0.99), worst: q(1), rhythm: [Math.min(...ns), Math.max(...ns)] };
}, on);
const off = await run(false), on = await run(true);
console.log(JSON.stringify({ off, on, errors }, null, 1));
await br.close();
if (!(off.drawn > 5 && on.drawn > 5 && on.pacing && !off.pacing && on.drawn <= on.refreshes && !errors.length)) process.exit(1);
