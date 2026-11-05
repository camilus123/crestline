// Review screenshots: one representative track per scenario.
// node tests/review.mjs <outdir> <WxH> [scenarios comma list] [steps]
import { execFileSync } from 'node:child_process';
const [outdir = 'review/pass0', size = '1280x720', list = '', steps = '3000'] = process.argv.slice(2);
const TRACKS = {
  0: 'MLJMLLRIK13', 1: 'PPLONQSOP14', 2: 'UUOQSTVJS02', 3: 'NMIMKJRRJ03', 4: 'OMJNMNTMN17', 5: 'ONLONNTGM18', 6: 'OMJNLLTKL06',
  7: 'OMJNMMTSL07', 8: 'ONLOMNTTN08', 9: 'MLJMKLSTK22', 10: 'RQMPPRUSQ10', 11: 'KHGIHFQRH11', 12: 'PPLNOPSKO12',
};
const NAMES = ['rally', 'futuristic', 'night', 'marsh', 'mountains', 'snow', 'roadworks', 'storm', 'desert', 'fog', 'motorway', 'wind', 'forest'];
const scens = list ? list.split(',').map(Number) : Object.keys(TRACKS).map(Number);
execFileSync('mkdir', ['-p', outdir]);
for (const sc of scens) {
  const out = `${outdir}/${String(sc).padStart(2, '0')}_${NAMES[sc]}_${size}.png`;
  const t0 = Date.now();
  try {
    const r = execFileSync('node', ['tests/shot.mjs', out, size, `race=${TRACKS[sc]}&bot&manual`, steps, '200'], { encoding: 'utf8', timeout: 900000, stdio: ['ignore', 'pipe', 'pipe'] });
    console.log(out, ((Date.now() - t0) / 1000).toFixed(0) + 's', r.trim().split('\n').pop());
  } catch (e) { console.log(out, 'FAILED', String(e).slice(0, 300)); }
}
