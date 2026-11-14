// Does the camera (or the road just ahead of it) ever end up inside a big landmark (Desert mesas, peaks...)?
// Drives along every course track whose scenario has landmarks, rebuilding the bent path every few metres
// exactly as the renderer does, places each landmark with the renderer's own placement code and reports
// any landmark whose footprint covers the camera or the first 120 m of road.
// node build.mjs --test tests/inside.test.ts tests/out/inside.mjs && node tests/out/inside.mjs [old] [code...]
import { generateTrack } from '../src/track/generator';
import { COURSES } from '../src/track/courses';
import { O, SCENARIOS } from '../src/track/defs';
import { Track } from '../src/track/track';
import { BentPath, PATH_STEP } from '../src/render/path';
import { buildModel, LANDMARK } from '../src/render/models';
import { LandmarkPlacer } from '../src/render/landmarks';

const args = process.argv.slice(2);
const old = args.includes('old');
const given = args.filter((a) => a !== 'old');
const codes = new Set<string>(given);
if (!given.length) for (const m of Object.values(COURSES)) for (const l of Object.values(m)) for (const c of l as string[]) codes.add(c);

// footprint radius per landmark type (largest horizontal extent of the model below 40 m, i.e. what a camera could be inside)
const footCache = new Map<number, { foot: number; low: number }>();
const footOf = (type: number) => {
  let f = footCache.get(type);
  if (!f) {
    const b = buildModel(type, 0);
    let foot = 0, low = 0;
    for (let i = 0; i < b.pos.length; i += 3) {
      const r = Math.hypot(b.pos[i], b.pos[i + 2]);
      foot = Math.max(foot, r);
      if (b.pos[i + 1] < 40) low = Math.max(low, r);
    }
    f = { foot, low };
    footCache.set(type, f);
  }
  return f;
};

// the previous GPU placement (kept to show the bug this test was written for)
function oldPlace(bp: BentPath, tr: Track, d: number, u0: number, foot: number, scale: number): { x: number; z: number; hide: boolean } {
  const at = (dd: number) => {
    const f = Math.max(0, Math.min(bp.px.length - 1.001, (dd - bp.dFirst) / PATH_STEP));
    const k = Math.floor(f), t = f - k;
    const L = (a: Float32Array) => a[k] + (a[k + 1] - a[k]) * t;
    const s = bp.s0 + f * PATH_STEP;
    return { x: L(bp.px), z: L(bp.pz), phi: L(bp.phi), extL: L(bp.extL), extR: L(bp.extR), hwL: tr.hwL(s), hwR: tr.hwR(s) };
  };
  const p = at(d);
  let u = u0;
  const side = u < 0 ? -1 : 1;
  const edge = side < 0 ? p.hwL : p.hwR, ext = side < 0 ? p.extL : p.extR;
  let hide = false;
  if (Math.abs(u) > ext) u = side * Math.max(ext + (Math.abs(u) - ext) * 0.85, Math.min(Math.abs(u0), edge + foot * scale + 1));
  const R = foot * scale + 8;
  const rx = Math.cos(p.phi) * side, rz = -Math.sin(p.phi) * side;
  const c0x = p.x + Math.cos(p.phi) * u, c0z = p.z - Math.sin(p.phi) * u;
  const stepD = Math.max(R * 0.3, 10);
  const wEnd = bp.maxD;
  let t = 0;
  for (let pass = 0; pass < 2; pass++) for (let k = -10; k <= 10; k++) {
    const dk = d + k * stepD;
    if (dk < bp.dFirst || dk > wEnd) continue;
    const q = at(dk);
    const L = R + Math.max(q.hwL, q.hwR) + 4;
    const ax = c0x + rx * t - q.x, az = c0z + rz * t - q.z;
    const b = ax * rx + az * rz, aa = ax * ax + az * az;
    if (aa < L * L) t += Math.sqrt(b * b - aa + L * L) - b;
  }
  for (let k = -10; k <= 10; k++) {
    const dk = d + k * stepD;
    if (dk < bp.dFirst || dk > wEnd) continue;
    const q = at(dk);
    const L = R + Math.max(q.hwL, q.hwR) + 2;
    const ax = c0x + rx * t - q.x, az = c0z + rz * t - q.z;
    if (ax * ax + az * az < L * L) hide = true;
  }
  u += side * t;
  return { x: p.x + Math.cos(p.phi) * u, z: p.z - Math.sin(p.phi) * u, hide };
}

let bad = 0, checked = 0, shown = 0, hidden = 0, jumps = 0, flips = 0;
const prevU = new Map<number, number>(), prevH = new Map<number, boolean>();
const placer = new LandmarkPlacer();
const out = { u: 0, hide: false };
for (const code of codes) {
  const td = generateTrack(code);
  const sc = SCENARIOS[td.params.scenario];
  if (!sc.landmarks?.length) continue;
  const tr = new Track(td);
  const o = td.objects;
  const lm: number[] = [];
  for (let i = 0; i < o.count; i++) if (LANDMARK.has(o.type[i]) && o.type[i] !== O.TOWER /* bends with the road */ && o.type[i] !== O.PEAK /* backdrop, placed by compass bearing */) lm.push(i);
  if (!lm.length) continue;
  const loop = td.circuit ? td.lapLen : 0;
  const L = td.circuit ? td.lapLen : td.raceLen;
  const maxD = Math.min(1950, sc.visibility * 1.15 * 1.45 + (sc.visibility < 400 ? 60 : 0));
  const bp = new BentPath();
  let worst = '', worstBy = -1;
  let hits = 0;
  for (let s = 0; s < L; s += 6) {
    bp.build(tr, s, maxD);
    checked++;
    for (const i of lm) {
      let d = o.s[i] - s;
      if (loop > 0) d = ((d + loop * 0.5) % loop + loop) % loop - loop * 0.5;
      if (d < bp.dFirst + 4 || d > maxD) continue;
      const { foot, low } = footOf(o.type[i]);
      if (o.u[i] === 0) continue;
      let cx: number, cz: number, hide: boolean;
      if (old) ({ x: cx, z: cz, hide } = oldPlace(bp, tr, d, o.u[i], foot, o.scale[i]));
      else {
        placer.place(bp, d, o.u[i], foot * o.scale[i], out);
        hide = out.hide;
        const pp = bp.pos(d, out.u, 0, [0, 0, 0, 0]);
        cx = pp[0]; cz = pp[2];
      }
      if (!old) {
        const key = i * 1000 + (code.charCodeAt(0) * 31 + code.charCodeAt(5));
        const pu = prevU.get(key), ph = prevH.get(key);
        if (pu !== undefined && Math.abs(pu - out.u) > 15) { jumps++; if (jumps % 40 === 1) console.log('  jump', code, 'type', o.type[i], 'd', d.toFixed(0), 'u', pu.toFixed(0), '->', out.u.toFixed(0), 'size', (foot * o.scale[i]).toFixed(0)); }
        if (ph !== undefined && ph !== hide) flips++;
        prevU.set(key, out.u); prevH.set(key, hide);
      }
      if (hide) { hidden++; continue; }
      shown++;
      const R = low * o.scale[i];
      // camera (about 6 m behind the car) and the road up to 120 m ahead
      for (let dd = -6; dd <= 120; dd += 6) {
        const q = bp.pos(dd, 0, 0, [0, 0, 0, 0]);
        const hw = Math.max(tr.hwL(s + dd), tr.hwR(s + dd));
        const dist = Math.hypot(q[0] - cx, q[2] - cz) - hw;
        if (dist < R) {
          hits++;
          if (R - dist > worstBy) worstBy = R - dist, worst = `s=${s} landmark type ${o.type[i]} scale ${o.scale[i].toFixed(2)} at d=${d.toFixed(0)} u=${o.u[i].toFixed(0)} covers road at d=${dd} by ${(R - dist).toFixed(0)} m`;
          break;
        }
      }
    }
  }
  if (hits) { bad++; console.log('BAD', code, sc.name, hits, 'frames;', worst); }
}
console.log(`landmark-frames shown ${shown}, left out ${hidden} (${(hidden / Math.max(1, shown + hidden) * 100).toFixed(1)} %), moves over 15 m in one 6 m step ${jumps}, show/hide switches ${flips}`);
console.log(old ? '(old placement)' : '(current placement)', 'tracks with a landmark over the road near the camera:', bad, '· positions checked', checked);
