// Where does the terrain fold limit (ext) come closest to the road near the camera? (for picking test views)
import { generateTrack } from '../src/track/generator';
import { Track } from '../src/track/track';
import { BentPath, PATH_STEP } from '../src/render/path';
for (const code of process.argv.slice(2)) {
  const td = generateTrack(code);
  const tr = new Track(td);
  const bp = new BentPath();
  let worst = { s: 0, ext: 1e9, side: '' };
  const L = td.circuit ? td.lapLen : td.raceLen;
  for (let s = 50; s < L; s += 10) {
    bp.build(tr, s, 1400);
    for (let d = 10; d < 70; d += 2) {
      const k = Math.round((d - bp.dFirst) / PATH_STEP);
      const sAbs = s + d;
      if (bp.extL[k] - tr.hwL(sAbs) < worst.ext) worst = { s, ext: bp.extL[k] - tr.hwL(sAbs), side: 'L d' + d };
      if (bp.extR[k] - tr.hwR(sAbs) < worst.ext) worst = { s, ext: bp.extR[k] - tr.hwR(sAbs), side: 'R d' + d };
    }
  }
  console.log(code, td.circuit ? td.laps + ' laps, lap ' + (td.lapLen / 1000).toFixed(2) + ' km' : 'stage', 'closest fold limit near camera:', worst.ext.toFixed(1), 'm beyond the edge at s', worst.s, worst.side);
}
