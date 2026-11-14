// How much the fold limit at a fixed place on the track changes as the car drives past it (it shapes the ground
// there, so any change is ground visibly moving). Reports the worst change for places 0-150 m ahead of the car.
import { generateTrack } from '../src/track/generator';
import { Track } from '../src/track/track';
import { BentPath, PATH_STEP } from '../src/render/path';
for (const code of ['JHGHGEQJG21', 'UTNRSVVLR17', 'IHFHGFQSG00']) {
  const tr = new Track(generateTrack(code)); const bp = new BentPath();
  const L = tr.circuit ? tr.d.lapLen : tr.d.raceLen;
  let worst = 0, sum = 0, n = 0;
  const prev = new Map<number, number[]>();
  for (let s = 200; s < L - 400; s += 4) {
    bp.build(tr, s, 1500);
    for (let d = 0; d <= 150; d += 10) {
      const sp = Math.round((s + d) / 2) * 2;
      const k = Math.round((sp - bp.s0) / PATH_STEP);
      const e = [Math.min(bp.extL[k], 300), Math.min(bp.extR[k], 300)];
      const p = prev.get(sp);
      if (p) { const ch = Math.max(Math.abs(e[0] - p[0]), Math.abs(e[1] - p[1])); worst = Math.max(worst, ch); sum += ch; n++; }
      prev.set(sp, e);
    }
  }
  console.log(code, tr.d.scen.name, 'worst change per 4 m driven', worst.toFixed(1), 'm; average', (sum / n).toFixed(3), 'm');
}
