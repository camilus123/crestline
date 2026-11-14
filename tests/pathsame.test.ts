import { generateTrack } from '../src/track/generator';
import { Track } from '../src/track/track';
import { BentPath } from '../src/render/path';
for (const code of ['UTNRSVVLR17', 'MIHJHHTLI12', 'JHGHGEQJG21']) {
  const tr = new Track(generateTrack(code)); const bp = new BentPath();
  const L = tr.circuit ? tr.d.lapLen : tr.d.raceLen; let chk = 0;
  for (const s of [0, 0.7, 3.1, 60, 127.9, 500.33, L * 0.5, L - 300.2, L - 5, L + 40.5, L * 2.3]) { bp.build(tr, s, 1950); for (let i = 0; i < bp.data.length; i += 7) chk += bp.data[i] * ((i % 13) + 1); }
  console.log(code, tr.circuit ? 'circuit' : 'stage', chk);
}
