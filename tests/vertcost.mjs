// Vertices and draw calls per frame, by render stage and by scenery type.  node tests/vertcost.mjs <code> <q>
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(root + '/')('playwright');
const [code, q, html = path.join(root, 'dist/crestline.html')] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 320, height: 180 } }); p.setDefaultTimeout(580000);
p.on('pageerror', (e) => console.log('ERR', String(e).slice(0, 500)));
await p.goto('file://' + html + `?race=${code}&bot&q=${q}`, { waitUntil: 'commit' });
await p.waitForTimeout(2500);
const r = await p.evaluate(() => {
  const g = window.__crest, R = g.renderer, pf = R.prof, gl = R.gl;
  g.simulate(900); g.renderOnce(1 / 60);
  const acc = {}; let verts = 0, cur = [];
  const de = gl.drawElements.bind(gl), da = gl.drawArrays.bind(gl), dai = gl.drawArraysInstanced.bind(gl), dei = gl.drawElementsInstanced.bind(gl);
  gl.drawElements = (m, n, t, o) => { verts += n; de(m, n, t, o); };
  gl.drawArrays = (m, f, n) => { verts += n; da(m, f, n); };
  gl.drawArraysInstanced = (m, f, n, i) => { verts += n * i; dai(m, f, n, i); };
  gl.drawElementsInstanced = (m, n, t, o, i) => { verts += n * i; dei(m, n, t, o, i); };
  const pb = pf.begin.bind(pf), pe = pf.end.bind(pf);
  pf.mode = 'cpu';
  pf.begin = (n) => { cur.push([n, verts]); pb(n); };
  pf.end = () => { const [n, v0] = cur.pop(); acc[n] = (acc[n] || 0) + verts - v0; pe(); };
  const byType = {};
  for (const st of R.scenery.sets) for (const [m, tag] of [[st.mesh, ''], [st.far, ' (light)']]) {
    if (!m) continue;
    const f = m.drawInstances.bind(m);
    m.drawInstances = (a, n) => { const k = st.type + (st.backdrop ? ' woodland' : '') + tag; const v0 = verts; f(a, n); byType[k] = byType[k] || [0, 0]; byType[k][0] += verts - v0; byType[k][1] += n; };
  }
  g.renderOnce(1 / 60);
  pf.mode = 'off';
  return { preset: R.quality.name, total: verts, acc, byType };
});
console.log(`${code} ${r.preset}: ${(r.total / 1000).toFixed(0)}k vertices per frame`);
for (const [n, v] of Object.entries(r.acc).sort((a, b) => b[1] - a[1])) if (v > 0) console.log('   ' + n.padEnd(34) + (v / 1000).toFixed(0).padStart(7) + 'k');
console.log('   scenery by object type (vertices, instances):');
for (const [n, v] of Object.entries(r.byType).sort((a, b) => b[1][0] - a[1][0]).slice(0, 12)) console.log('     ' + n.padEnd(22) + (v[0] / 1000).toFixed(0).padStart(6) + 'k ' + String(v[1]).padStart(6));
await b.close();
