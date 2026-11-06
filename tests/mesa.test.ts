// Finds Desert mesas whose footprint covers some stretch of road (world space), for picking test views.
import { generateTrack } from '../src/track/generator';
import { COURSES } from '../src/track/courses';
import { O } from '../src/track/defs';
const codes = new Set<string>();
for (const m of Object.values(COURSES)) for (const l of Object.values(m)) for (const c of l as string[]) codes.add(c);
let shown = 0;
for (const code of codes) {
  const t = generateTrack(code);
  if (t.scen.name !== 'Desert') continue;
  const o = t.objects;
  for (let k = 0; k < o.count; k++) {
    if (o.type[k] !== O.MESA) continue;
    const s0 = o.s[k], u = o.u[k];
    const i0 = Math.round((s0 + t.sOff) / 2);
    if (i0 < 0 || i0 >= t.n) continue;
    const th = t.heading[i0];
    const cx = t.X[i0] + Math.cos(th) * u, cz = t.Z[i0] - Math.sin(th) * u;
    const R = 140 * o.scale[k];
    let best = 1e9, bi = -1;
    for (let i = 0; i < t.n; i++) {
      const dd = Math.hypot(t.X[i] - cx, t.Z[i] - cz) - Math.max(t.hwL[i], t.hwR[i]);
      if (dd < best) { best = dd; bi = i; }
    }
    if (best < R) {
      console.log(code, 'mesa at s', s0.toFixed(0), 'u', u.toFixed(0), 'R', R.toFixed(0), 'covers road at s', (bi * 2 - t.sOff).toFixed(0), 'by', (R - best).toFixed(0), 'm');
      shown++;
    }
  }
}
console.log('overlaps', shown);
