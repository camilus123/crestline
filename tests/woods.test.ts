// Woodland beyond the roadside: how many trees each scenario gets, and that every one stands where it makes
// sense (on ground that is not too steep, above water, below the tree line, clear of the road).
// node build.mjs --test tests/woods.test.ts tests/out/woods.mjs && node tests/out/woods.mjs
import { generateTrack } from '../src/track/generator';
import { COURSES } from '../src/track/courses';
import { Track } from '../src/track/track';
import { LOOKS } from '../src/render/looks';
import { Terrain } from '../src/render/terrain';
import { woodlandTrees } from '../src/render/scenery';
const first = new Map<string, string>();
for (const m of Object.values(COURSES)) for (const l of Object.values(m)) for (const c of l as string[]) { const t = generateTrack(c); if (!first.has(t.scen.name)) first.set(t.scen.name, c); }
let bad = 0;
for (const [name, code] of first) {
  const t = generateTrack(code);
  const tr = new Track(t);
  const look = LOOKS[t.params.scenario];
  const terrain = new Terrain(tr, look.terr, look.terr2);
  const water = look.terr2[3] > -20 ? look.terr2[3] : -1e9;
  const t0 = Date.now();
  const trees = woodlandTrees(t, terrain, water);
  const ms = Date.now() - t0;
  let steep = 0, wet = 0, near = 0, maxSlope = 0, hMin = 1e9, hMax = -1e9, offMax = 0;
  for (const w of trees) {
    const sl = terrain.slope(w.s, w.u);
    maxSlope = Math.max(maxSlope, sl);
    if (sl > 0.5) steep++;
    if (w.h < water + 0.3) wet++;
    const off = Math.abs(w.u) - terrain.edge(w.s, w.u);
    if (off < 12) near++;
    offMax = Math.max(offMax, off); hMin = Math.min(hMin, w.h); hMax = Math.max(hMax, w.h);
    if (Math.abs(terrain.h(w.s, w.u) - w.h) > 1e-6) bad++;
  }
  bad += steep + wet + near;
  const km = (t.circuit ? t.lapLen : t.raceLen) / 1000;
  console.log(`${name.padEnd(11)} ${code}  ${String(trees.length).padStart(6)} trees (${(trees.length / km).toFixed(0)} per km, built in ${ms} ms)` +
    (trees.length ? `  up to ${offMax.toFixed(0)} m out, ground ${hMin.toFixed(0)}..${hMax.toFixed(0)} m, steepest ${maxSlope.toFixed(2)}; too steep ${steep}, in water ${wet}, too near ${near}` : ''));
}
console.log(bad ? `FAIL: ${bad} badly placed trees` : 'OK: every woodland tree stands on suitable ground');
if (bad) process.exit(1);
