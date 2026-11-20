// The scenery test (Settings, Benchmark, "Scenery test") end to end at a phone's size: it runs, every way of
// drawing shows scenery on this GPU, the instance ranges come out right, the report is shown, and the game
// carries on afterwards (frames keep coming, the diagnostic switches are back at their defaults).
//   node tests/diag.mjs
import { createRequire } from 'node:module'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import fs from 'node:fs';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(root + '/')('playwright');
const br = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await br.newPage({ viewport: { width: 825, height: 360 }, deviceScaleFactor: 2 }); p.setDefaultTimeout(900000);
const errors = []; p.on('pageerror', (e) => errors.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await p.goto('file://' + path.join(root, 'dist/crestline.html') + '?screen=bench', { waitUntil: 'commit' });
await p.waitForTimeout(2500);
await p.screenshot({ path: path.join(root, 'review/v3/bench_screen_phone.png'), timeout: 300000 });
await p.locator('.btn', { hasText: 'Scenery test' }).click();
await p.waitForFunction(() => /scenery test/.test(document.querySelector('.benchout')?.textContent ?? ''), null, { timeout: 880000, polling: 1000 });
const text = await p.locator('.benchout').textContent();
fs.writeFileSync(path.join(root, 'tests/out/diag-report.txt'), text);
console.log(text);
const frames = await p.evaluate(async () => { const g = window.__crest; const a = g.frameTimes.length, t = performance.now(); let n = 0; const count = () => { n++; if (performance.now() - t < 3000) requestAnimationFrame(count); }; requestAnimationFrame(count); await new Promise((r) => setTimeout(r, 3500)); return { rafs: n, manual: g.manual, race: !!g.race, bench: !!g.bench }; });
const sw = await p.evaluate(() => { const R = window.__crest.renderer; return { skip: R.skipScenery, dissolve: R.pic.dissolve }; });
console.log('afterwards:', JSON.stringify(frames), JSON.stringify(sw), 'errors', JSON.stringify(errors));
let bad = errors.length ? 1 : 0;
const rows = text.split('\n');
const inst = rows.filter((l) => /expected/.test(l));
if (inst.length !== 7 || inst.some((l) => !/ ok$/.test(l.trim()))) { console.log('FAIL: instance ranges'); bad++; }
const pix = rows.filter((l) => / pixels +[\d.]+ %/.test(l)).map((l) => +l.match(/pixels +([\d.]+) %/)[1]);
if (pix.length !== 28 || pix.some((v) => v < 2)) { console.log('FAIL: a variant shows no scenery: ' + pix.join(' ')); bad++; }
if (/GL error [1-9]|STOPPED|FAILED|context lost: YES/.test(text)) { console.log('FAIL: errors in the report'); bad++; }
if (frames.manual || sw.skip || !sw.dissolve) { console.log('FAIL: the game was not left as it was'); bad++; }
await br.close();
if (bad) { console.log('FAILED'); process.exit(1); }
