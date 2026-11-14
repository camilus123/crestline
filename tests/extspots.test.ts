import { generateTrack } from '../src/track/generator';
import { Track } from '../src/track/track';
import { BentPath, PATH_STEP } from '../src/render/path';
const code = process.argv[2];
const td = generateTrack(code); const tr = new Track(td); const bp = new BentPath();
const spots: string[] = [];
for (let s = 50; s < td.lapLen; s += 20) {
  bp.build(tr, s, 1400);
  let mL = 1e9, mR = 1e9;
  for (let d = 15; d < 80; d += 2) {
    const k = Math.round((d - bp.dFirst) / PATH_STEP);
    mL = Math.min(mL, bp.extL[k] - tr.hwL(s + d)); mR = Math.min(mR, bp.extR[k] - tr.hwR(s + d));
  }
  if (mL < 40 || mR < 40) spots.push(`s ${s}: L ${mL.toFixed(0)} R ${mR.toFixed(0)} curv ${(td.curv[Math.round((s + 30 + td.sOff) / 2)] * 1000).toFixed(1)}`);
}
console.log(spots.join('\n'));
