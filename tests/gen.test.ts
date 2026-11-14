import { generateTrack } from '../src/track/generator';
import { encodeCode, normalizeCode } from '../src/track/codes';
import { SCENARIO_NAMES } from '../src/track/defs';

const codes = ['KJGJHHMLH00', 'ZZZZZZZZZ12', 'AAAAAAAAA13', 'MARKO RULES', '', 'hello world 42', 'ZZZAZZZZZ17'];
for (let sc = 0; sc < 13; sc++) codes.push(encodeCode({ curves: 14, sharpness: 14, length: 8, hills: 12, steepness: 12, difficulty: 12, scenery: 16, scatter: 18, obstacles: 14, scenario: sc, type: (sc % 2) as 0 | 1 }));
for (const c of codes) {
  const t0 = performance.now();
  const t = generateTrack(c);
  const dt = performance.now() - t0;
  let maxC = 0, minY = 1e9, maxY = -1e9, maxG = 0;
  for (let i = 0; i < t.n; i++) { maxC = Math.max(maxC, Math.abs(t.curv[i])); minY = Math.min(minY, t.Y[i]); maxY = Math.max(maxY, t.Y[i]); maxG = Math.max(maxG, Math.abs(t.grade[i])); }
  console.log(`${JSON.stringify(c).padEnd(16)} -> ${t.code} ${SCENARIO_NAMES[t.params.scenario].padEnd(10)} ${t.circuit ? 'laps ' + t.laps : 'stages ' + t.checkpoints.length} race ${(t.raceLen / 1000).toFixed(1)}km Rmin ${(1 / maxC).toFixed(0)}m Y ${minY.toFixed(0)}..${maxY.toFixed(0)} g ${(maxG * 100).toFixed(1)}% obj ${t.objects.count} hz ${t.hazards.length} hash ${t.hash} ${dt.toFixed(0)}ms`);
  if (t.circuit) {
    const n = t.n;
    console.log(`   loop blend: curv ${t.curv[n - 1].toExponential(2)} vs ${t.curv[0].toExponential(2)}  Y ${t.Y[n - 1].toFixed(2)} vs ${t.Y[0].toFixed(2)} grade ${t.grade[n-1].toFixed(4)} ${t.grade[0].toFixed(4)}`);
  }
}
console.log(normalizeCode('kjgjhhmlh 00'), normalizeCode('Grand Admiral'));
