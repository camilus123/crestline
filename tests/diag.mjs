// The scenery test (Settings, Benchmark, "Scenery test") end to end at a phone's size: it runs, every spelling of
// the fold rule shows scenery on this GPU, the rule's parts read back from the shader add up, the report is
// shown, and the game carries on afterwards (frames keep coming, the switches are off again).
// The report is kept as review/v3/scenery_test_reference.txt: what a GPU that draws the scenery says.
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
await p.waitForFunction(() => /scenery test 3/.test(document.querySelector('.benchout')?.textContent ?? ''), null, { timeout: 880000, polling: 1000 });
const text = await p.locator('.benchout').textContent();
fs.writeFileSync(path.join(root, 'tests/out/diag-report.txt'), text);
console.log(text);
const frames = await p.evaluate(async () => { const g = window.__crest; const a = g.frameTimes.length, t = performance.now(); let n = 0; const count = () => { n++; if (performance.now() - t < 3000) requestAnimationFrame(count); }; requestAnimationFrame(count); await new Promise((r) => setTimeout(r, 3500)); return { rafs: n, manual: g.manual, race: !!g.race, bench: !!g.bench }; });
const sw = await p.evaluate(() => { const R = window.__crest.renderer; return { skip: R.skipScenery, dissolve: R.pic.dissolve }; });
fs.copyFileSync(path.join(root, 'tests/out/diag-report.txt'), path.join(root, 'review/v3/scenery_test_reference.txt'));
console.log('afterwards:', JSON.stringify(frames), JSON.stringify(sw), 'errors', JSON.stringify(errors));
let bad = errors.length ? 1 : 0;
const rows = text.split('\n');
// on a GPU that draws the scenery, every spelling of the rule shows it, the shipped rule and the old one leave
// out the same objects, and every combined test is what its parts give
const pix = rows.filter((l) => / pixels +[\d.]+ %/.test(l)).map((l) => +l.match(/pixels +([\d.]+) %/)[1]);
if (pix.length !== 30 || pix.some((v) => v < 2)) { console.log('FAIL: a variant shows no scenery: ' + pix.join(' ')); bad++; }
// where the rule has work to do, leaving it out changes the picture and the old spelling does not
const work = rows.slice(rows.findIndex((l) => /where the rule has work to do/.test(l)));
const px = (label) => +(work.find((l) => l.startsWith('   ' + label))?.match(/differs from as shipped in +(\d+) px/)?.[1] ?? -1);
if (!(px('the rule left out') > 100) || px('as it was up to v3.10.4') !== 0 || px('old, the three tests nested') !== 0) { console.log(`FAIL: the third moment does not exercise the rule: left out ${px('the rule left out')}, old ${px('as it was up to v3.10.4')}`); bad++; }
const out = (label) => rows.filter((l) => l.startsWith('       ' + label.padEnd(21) + ' left out ')).map((l) => l.match(/left out (\S+)/)[1]);
const a = out('shipped rule'), b = out('old rule'), c = out('old rule, hide noted');
if (a.length < 8 || a.join() !== b.join() || a.join() !== c.join()) { console.log(`FAIL: the rules do not leave out the same objects: ${a} / ${b} / ${c}`); bad++; }
if (!rows.some((l) => /before the rule [01], after it [01], after the landmark rules [01]/.test(l))) { console.log('FAIL: hide was not noted around the rule'); bad++; }
if (rows.some((l) => /   bad$/.test(l)) || /not recorded|nothing recorded/.test(text)) { console.log('FAIL: a combined test is not what its parts give, or something was not recorded'); bad++; }
if (/GL error [1-9]|STOPPED|FAILED|COULD NOT|context lost: YES|NaN|Infinity|-12345/.test(text)) { console.log('FAIL: errors in the report'); bad++; }
if (frames.manual || sw.skip || !sw.dissolve) { console.log('FAIL: the game was not left as it was'); bad++; }
await br.close();
if (bad) { console.log('FAILED'); process.exit(1); }
