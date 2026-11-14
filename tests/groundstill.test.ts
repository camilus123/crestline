// Does the ground beside the car keep its shape as the car drives? For ground points fixed on the track
// (s, offset from the road edge) up to 80 m ahead, works out where the terrain shader puts them (squeeze towards
// the fold limit, height tapered at it) at successive car positions and reports how much they shift.
import { generateTrack } from '../src/track/generator';
import { Track } from '../src/track/track';
import { BentPath, PATH_STEP } from '../src/render/path';
import { LOOKS } from '../src/render/looks';
import { Terrain } from '../src/render/terrain';
const ss = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
for (const code of (process.argv.slice(2).length ? process.argv.slice(2) : ['JHGHGEQJG21', 'KJGJHHMLH04', 'IHFHGFQSG00'])) {
  const t = generateTrack(code); const tr = new Track(t); const bp = new BentPath();
  const look = LOOKS[t.params.scenario]; const terr = new Terrain(tr, look.terr, look.terr2);
  const L = t.circuit ? t.lapLen : t.raceLen;
  const prev = new Map<string, number[]>(); let worstH = 0, worstU = 0, sumH = 0, n = 0, where = '';
  for (let s = 100; s < Math.min(L - 300, 6000); s += 2) {
    bp.build(tr, s, 1500);
    for (let d = 0; d <= 80; d += 20) for (const side of [-1, 1]) for (const off of [15, 40, 90, 160]) {
      const sp = Math.round((s + d) / 2) * 2, k = Math.round((sp - bp.s0) / PATH_STEP);
      const edge = side < 0 ? tr.hwL(sp) : tr.hwR(sp), ext = side < 0 ? bp.extL[k] : bp.extR[k];
      let uu = edge + off;
      const es = Math.max(edge + 1, ext - Math.max(8, (ext - edge) * 0.35));
      if (uu > es) { const span = Math.max(ext - es, 1); uu = es + span * (1 - Math.exp(-(uu - es) / span)); }
      const taper = 1 - (1 - ss(350, 650, ext)) * ss(edge + (ext - edge) * 0.45, ext, uu);
      const h = terr.h(sp, side * uu) * taper;
      const key = sp + ':' + side + ':' + off, p = prev.get(key);
      if (p) { const dh = Math.abs(h - p[0]), du = Math.abs(uu - p[1]); sumH += dh; n++; if (dh > worstH) { worstH = dh; where = `s=${s} d=${d} off=${off} ext ${p[2].toFixed(0)}->${ext.toFixed(0)}`; } worstU = Math.max(worstU, du); }
      prev.set(key, [h, uu, ext]);
    }
  }
  console.log(`${code} ${t.scen.name}: per 2 m driven, ground height shifts by ${(sumH / n).toFixed(3)} m on average, ${worstH.toFixed(1)} m at worst (${where}); sideways at worst ${worstU.toFixed(1)} m`);
}
