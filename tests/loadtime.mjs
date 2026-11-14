// Start-up time: page load to game object ready, and to the first few rendered frames.
// (software GPU and Linux here: shader compile time on Windows / Direct3D is not represented)
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(root + '/')('playwright');
const html = process.argv[2] || path.join(root, 'dist/crestline.html');
const query = process.argv[3] || '';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 320, height: 180 } }); p.setDefaultTimeout(120000);
await p.addInitScript(() => {
  window.__t = {}; let n = 0;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (f) => raf((t) => { const t0 = performance.now(); f(t); n++; if (n === 1) window.__t.firstFrameMs = performance.now() - t0; if (n === 3) window.__t.threeFrames = performance.now(); });
  const iv = setInterval(() => { if (window.__crest && !window.__t.ready) { window.__t.ready = performance.now(); clearInterval(iv); } }, 5);
  const obs = new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.duration > 80) (window.__t.long = window.__t.long || []).push([Math.round(e.startTime), Math.round(e.duration)]); });
  obs.observe({ entryTypes: ['longtask'] });
});
await p.goto('file://' + html + '?' + query, { waitUntil: 'commit' });
await p.waitForFunction(() => window.__t && window.__t.threeFrames, null, { timeout: 120000 });
const t = await p.evaluate(() => window.__t);
console.log(path.basename(path.dirname(path.dirname(html))), query || '(title)', `game ready ${t.ready | 0} ms, first frame took ${t.firstFrameMs | 0} ms, three frames drawn by ${t.threeFrames | 0} ms; long tasks [start,ms]: ${JSON.stringify(t.long || [])}`);
await b.close();
