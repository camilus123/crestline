// What SMAA does to the game's picture, measured: one frozen moment per track drawn with no anti-aliasing, with
// SMAA, with MSAA, with both, and at 4x4 the resolution (averaged down in linear light: the picture every
// method is trying to reach). Reports the mean error against that on the pixels where the picture has edges,
// the share of pixels SMAA takes for edges, and writes the frames to OUT (default: a temp folder) for looking at.
// Bloom, speed blur and sharpening are off for this: their reach depends on the resolution.
//   node tests/smaapic.mjs [out folder]
import { createRequire } from 'node:module'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process'; import os from 'node:os'; import fs from 'node:fs';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(root + '/')('playwright');
const out = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'smaapic-'));
fs.mkdirSync(out, { recursive: true });
const [VW, VH] = (process.env.VIEW || '480x270').split('x').map(Number);
const TRACKS = [['MIHJHHTLI12', 'forest'], ['UTNRSVVLR17', 'mountains'], ['KIGJHGSHI15', 'night'], ['TUORSWWUS14', 'futuristic']];
const VARIANTS = [
  ['none', { msaa: 0, smaa: false }], ['smaa', { msaa: 0, smaa: true }], ['smaa-plainmix', { msaa: 0, smaa: true, plain: true }],
  ['msaa4', { msaa: 4, smaa: false }], ['msaa4+smaa', { msaa: 4, smaa: true }],
];
const br = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let bad = 0;
const ratios = [];
for (const [code, name] of TRACKS) {
  const p = await br.newPage({ viewport: { width: VW, height: VH } }); p.setDefaultTimeout(900000);
  const errors = []; p.on('pageerror', (e) => errors.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto('file://' + path.join(root, 'dist/crestline.html') + `?race=${code}&bot&manual&q=3`, { waitUntil: 'commit' });
  await p.waitForTimeout(2500);
  await p.evaluate(() => window.__crest.simulate(420));
  const frame = async (file, o, dpr = 1) => {
    const url = await p.evaluate(({ o, dpr }) => {
      const g = window.__crest, R = g.renderer;
      const base = { ...R.quality, bloom: 0, lite: true, dpr, msaa: o.msaa, smaa: o.smaa };
      R.setQuality(base);
      R.smaaPlainMix = !!o.plain;
      g.renderOnce(0); g.renderOnce(0);
      return [R.canvas.toDataURL('image/png'), R.gl.getError(), R.canvas.width, R.canvas.height];
    }, { o, dpr });
    fs.writeFileSync(path.join(out, file), Buffer.from(url[0].split(',')[1], 'base64'));
    return url.slice(1);
  };
  const info = {};
  for (const [v, o] of VARIANTS) info[v] = await frame(`${name}-${v}.png`, o);
  // share of pixels the edge pass marks
  const edgeShare = await p.evaluate(() => {
    const g = window.__crest, R = g.renderer, gl = R.gl;
    R.setQuality({ ...R.quality, msaa: 0, smaa: true }); R.smaaPlainMix = false;
    g.renderOnce(0);
    const w = R.renderW, h = R.renderH, buf = new Uint8Array(w * h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, R.smaa.edges.fb);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    let n = 0; for (let i = 0; i < buf.length; i += 4) if (buf[i] | buf[i + 1]) n++;
    return n / (w * h);
  });
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 4, mobile: false });
  await p.waitForTimeout(300);
  info.truth = await frame(`${name}-truth4x.png`, { msaa: 0, smaa: false }, 4);
  const glerr = Object.values(info).reduce((a, x) => a || x[0], 0);
  const py = spawnSync('python3', ['-I', path.join(root, 'tests/smaapic.py'), out, name, ...VARIANTS.map((v) => v[0])]);
  const res = py.stdout.toString().trimEnd();
  const changed = Object.fromEntries(py.stderr.toString().trim().split('\n').map((l) => l.split(' ')).filter((a) => a[0] === 'changed').map((a) => [a[1], [+a[2], +a[3]]]));
  console.log(`${name}: ${(edgeShare * 100).toFixed(1)} % of pixels marked as edges; truth ${info.truth[1]}x${info.truth[2]}; GL error ${glerr}; ${errors.length} page errors ${errors.slice(0, 2).join(' | ')}`);
  console.log(res);
  // where SMAA changed the picture it must have moved it towards the 16-sample one, on every track
  // (and mixing in screen light must do no worse than mixing in plain scene light)
  if (!changed.smaa || !(changed.smaa[1] < changed.smaa[0]) || !(changed.smaa[1] <= changed['smaa-plainmix'][1]) || glerr || errors.length || info.truth[1] !== VW * 4) bad++;
  ratios.push(changed.smaa ? changed.smaa[1] / changed.smaa[0] : 1);
  await p.close();
}
await br.close();
const avg = ratios.reduce((x, y) => x + y, 0) / ratios.length;
console.log(`on the pixels SMAA changed, the error against the 16-sample picture fell to ${(avg * 100).toFixed(0)} % of what it was, averaged over the tracks`);
if (!(avg < 0.85)) bad++;
console.log('frames in ' + out);
if (bad) { console.log('FAILED'); process.exit(1); }
