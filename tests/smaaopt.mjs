// The SMAA option in the game:
//  1. off, the picture is what an earlier build drew (OLD=path to that build; skipped without it). Against
//     v3.9.4 that held for v3.10.0; v3.10.1 changed the Stiletto's louvres, so from there on compare with
//     v3.10.1. It is on in the Commodore preset and in no other.
//  2. on, in every arrangement: alone, on top of MSAA, below 100 % render resolution, no bloom, two players, the
//     showroom: no GL error, no page error, the picture changes, and changes only a little (it smooths edges)
//  3. the render resolution going down and up again leaves nothing behind in the working textures
//  4. the Graphics options row turns it on, marks it, and it is kept over a reload
//   node tests/smaaopt.mjs
import { createRequire } from 'node:module'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import fs from 'node:fs';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(root + '/')('playwright');
const NEW = path.join(root, 'dist/crestline.html'), OLD = process.env.OLD;
const br = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let bad = 0;
const fail = (what) => { console.log('FAIL ' + what); bad++; };
const open = async (file, query, view = { width: 480, height: 210 }) => {
  const p = await br.newPage({ viewport: view }); p.setDefaultTimeout(580000);
  p.errors = []; p.on('pageerror', (e) => p.errors.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') p.errors.push(m.text()); });
  await p.goto('file://' + file + query, { waitUntil: 'commit' });
  await p.waitForTimeout(2500);
  return p;
};
// the canvas as raw pixels, read in the page (drawn twice at a standstill first)
const grab = (p, set) => p.evaluate((set) => {
  const g = window.__crest, R = g.renderer;
  if (set) { R.setQuality({ ...R.quality, ...set.q }); R.forceScale = set.scale ?? null; }
  g.renderOnce(0); g.renderOnce(0);
  const c = document.createElement('canvas'); c.width = R.canvas.width; c.height = R.canvas.height;
  const x = c.getContext('2d'); x.drawImage(R.canvas, 0, 0);
  return { px: Array.from(x.getImageData(0, 0, c.width, c.height).data), err: R.gl.getError(), w: c.width, h: c.height };
}, set);
const diff = (a, b) => { let n = 0, big = 0, sum = 0; for (let i = 0; i < a.px.length; i += 4) { const d = Math.abs(a.px[i] - b.px[i]) + Math.abs(a.px[i + 1] - b.px[i + 1]) + Math.abs(a.px[i + 2] - b.px[i + 2]); sum += d; if (d > 6) n++; if (d > 180) big++; } const of = a.px.length / 4; return { n, big, mean: sum / of / 3, of }; };

// (ONLY=row: just part 4; ONLY=old: just part 1)
const rowOnly = process.env.ONLY === 'row', oldOnly = process.env.ONLY === 'old';
// ---- 1. off: as the old build
if (rowOnly) { /* skipped */ } else if (OLD && fs.existsSync(OLD)) {
  for (const [q, name] of [[3, 'High'], [6, 'Admiral'], [7, 'Commodore']]) {
    const query = `?race=MIHJHHTLI12&bot&manual&q=${q}`;
    const shots = [];
    for (const f of [OLD, NEW, NEW]) { const p = await open(f, query); await p.evaluate(() => window.__crest.simulate(300)); shots.push(await grab(p, f === NEW ? { q: { smaa: false } } : undefined)); if (p.errors.length) fail(`${name}: page errors ${p.errors[0]}`); await p.close(); }
    const d = diff(shots[0], shots[1]), noise = diff(shots[1], shots[2]);
    console.log(`${name}, SMAA off: ${d.n} of ${d.of} pixels differ from ${path.basename(OLD)} (two loads of this build differ in ${noise.n})`);
    if (d.n > Math.max(noise.n * 2, d.of * 0.002)) fail(`${name}: the picture with SMAA off is not the old build's picture`);
  }
} else console.log('(no OLD build given: the comparison with an earlier build is skipped)');
if (!rowOnly && !oldOnly) {
  const p = await open(NEW, '?screen=settings');
  const stock = await p.evaluate(() => { const g = window.__crest, out = {}; for (let i = 0; i < 8; i++) { g.settings.quality = i; g.settings.qo = {}; g.applyQuality(); out[g.renderer.quality.name] = g.renderer.quality.smaa; } return out; });
  const on = Object.keys(stock).filter((k) => stock[k]);
  console.log('presets with SMAA on: ' + on.join(', ') + ' (of ' + Object.keys(stock).length + ')');
  if (on.join() !== 'Commodore' || Object.keys(stock).length !== 8) fail('SMAA must be on in Commodore and in no other preset');
  await p.close();
}

// ---- 2. on, in every arrangement
const CASES = [
  ['Admiral + SMAA', '?race=MIHJHHTLI12&bot&manual&q=6', {}],
  ['High (MSAA 4x) + SMAA', '?race=TUORSWWUS14&bot&manual&q=3', {}],
  ['Commodore (80 % resolution) + SMAA', '?race=KIGJHGSHI15&bot&manual&q=7', {}],
  ['Ultra Low (no bloom, 75 %) + SMAA', '?race=UTNRSVVLR17&bot&manual&q=0', {}],
  ['Admiral + SMAA, two players', '?race=MIHJHHTLI12&bot&manual&q=6&players=2', {}],
];
for (const [name, query] of rowOnly || oldOnly ? [] : CASES) {
  const p = await open(NEW, query);
  await p.evaluate(() => window.__crest.simulate(300));
  const off = await grab(p, { q: { smaa: false } }), on = await grab(p, { q: { smaa: true } }), off2 = await grab(p, { q: { smaa: false } });
  const d = diff(off, on), same = diff(off, off2);
  console.log(`${name}: ${d.n} of ${d.of} pixels change (${(d.n / d.of * 100).toFixed(1)} %), mean change ${d.mean.toFixed(2)} levels, ${d.big} change by more than 60 a channel; off again: ${same.n} differ; GL error ${on.err || off.err}; ${p.errors.length} page errors ${p.errors.slice(0, 2).join(' | ')}`);
  if (on.err || off.err || p.errors.length) fail(name + ': errors');
  if (d.n < d.of * 0.005) fail(name + ': SMAA changed next to nothing');
  if (d.n > d.of * 0.3 || d.mean > 3 || d.big > d.of * 0.02) fail(name + ': SMAA changed far more than edges');
  if (same.n > d.n * 0.05) fail(name + ': turning it off again does not give the first picture back');
  if (name.startsWith('Commodore')) {
    // ---- 3. resolution down, up, down: the same picture as before going up
    const a = await grab(p, { q: { smaa: true }, scale: 0.6 }); await grab(p, { q: { smaa: true }, scale: 1 }); const b = await grab(p, { q: { smaa: true }, scale: 0.6 });
    const r = diff(a, b);
    console.log(`  at 60 %, then 100 %, then 60 % again: ${r.n} pixels differ between the two 60 % pictures; GL error ${a.err || b.err}`);
    if (r.n > 0 || a.err || b.err) fail('something is left behind when the resolution changes');
    await p.evaluate(() => { window.__crest.renderer.forceScale = null; });
  }
  await p.close();
}
if (!rowOnly && !oldOnly) {
  const p = await open(NEW, '?screen=cars&q=6');
  // (the showroom turns with the clock: drawn here at one fixed moment, straight through the renderer)
  const room = (smaa) => p.evaluate((smaa) => {
    const g = window.__crest, R = g.renderer;
    g.frame = () => {}; // (the game's own frames must not draw over it)
    R.setQuality({ ...R.quality, smaa });
    R.renderShowroom(0, 0, 2.4, 10, g.menuLook);
    const c = document.createElement('canvas'); c.width = R.canvas.width; c.height = R.canvas.height;
    const x = c.getContext('2d'); x.drawImage(R.canvas, 0, 0);
    return { px: Array.from(x.getImageData(0, 0, c.width, c.height).data), err: R.gl.getError() };
  }, smaa);
  const off = await room(false), on = await room(true), off2 = await room(false);
  const d = diff(off, on), same = diff(off, off2);
  console.log(`showroom: ${d.n} of ${d.of} pixels change (${(d.n / d.of * 100).toFixed(1)} %), mean ${d.mean.toFixed(2)} levels; off again: ${same.n} differ; GL error ${on.err}; ${p.errors.length} page errors`);
  if (on.err || p.errors.length || d.n < 50 || d.mean > 3 || same.n > 0) fail('showroom');
  await p.close();
}

// ---- 4. the option row
if (!oldOnly) {
  const p = await open(NEW, '?screen=settings', { width: 900, height: 620 });
  await p.evaluate(() => { const g = window.__crest; g.settings.quality = 6; g.settings.qo = {}; g.applyQuality(); g.saveSettings(); g.show('graphics'); });
  await p.waitForTimeout(600);
  const Q = () => p.evaluate(() => { const g = window.__crest, q = g.renderer.quality; return { name: q.name, smaa: q.smaa, msaa: q.msaa, made: !!g.renderer.smaa }; });
  const before = await Q();
  const row = p.locator('.row', { hasText: 'Anti-aliasing (SMAA)' });
  await row.locator('[data-dir="1"]').click(); await p.waitForTimeout(250);
  const after = await Q(), label = await row.locator('.lab').textContent(), value = await row.locator('.val').textContent();
  await row.hover({ timeout: 30000 }); await p.waitForTimeout(200); // (fails if the rows keep moving under the mouse)
  const help = await p.locator('.gfxhelp').textContent();
  // its help text must not make the box above the list taller than the longest of the others does (a taller
  // box moves the rows under the mouse, which moves the focus, which changes the text, for ever)
  const boxH = async (label) => { await p.locator('.row', { hasText: label }).hover({ timeout: 30000 }); await p.waitForTimeout(150); return p.evaluate(() => document.querySelector('.gfxhelp').offsetHeight); };
  const hOthers = Math.max(await boxH('Pixel ratio limit'), await boxH('Anti-aliasing (MSAA)'), await boxH('Render resolution')), hSmaa = await boxH('Anti-aliasing (SMAA)');
  console.log(`  help box: ${hSmaa} px high for this row, ${hOthers} px for the longest of the others`);
  if (hSmaa > hOthers) fail('the help text is too long for its box');
  await p.screenshot({ path: path.join(root, 'review/v3/graphics_options_smaa.png'), timeout: 300000 });
  await p.reload({ waitUntil: 'commit' }); await p.waitForTimeout(1800);
  const reloaded = await Q();
  console.log('option row:', JSON.stringify({ before, after, label, value, reloaded }), '\n  help: ' + help);
  if (before.smaa || before.made || !after.smaa || !after.made || after.name !== 'Admiral (custom)' || !label.startsWith('●') || !/On/.test(value) || !reloaded.smaa || !/in place of MSAA/.test(help) || p.errors.length) fail('option row');
  await p.evaluate(() => { const g = window.__crest; g.settings.qo = {}; g.applyQuality(); g.saveSettings(); });
  await p.close();
}
await br.close();
if (bad) { console.log('FAILED'); process.exit(1); }
console.log('all passed');
