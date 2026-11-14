import { generateTrack } from '../src/track/generator';
import { COURSES } from '../src/track/courses';
import { fuelPlan } from '../src/sim/race';
let bad = 0;
for (const [diff, list] of Object.entries(COURSES.championship)) for (const c of list as string[]) {
  const t = generateTrack(c);
  const f = fuelPlan(t);
  const ok = f.tank < t.raceLen * 0.92;
  if (!ok) bad++;
  console.log(diff.padEnd(7), c, (t.raceLen / 1000).toFixed(1) + ' km', t.circuit ? t.laps + ' laps' : 'stage ', 'tank', (f.tank / 1000).toFixed(1) + ' km', (100 * f.tank / t.raceLen).toFixed(0) + '%', 'best pit at', (100 * f.bestPit / t.raceLen).toFixed(0) + '%', ok ? '' : 'NO STOP NEEDED');
}
console.log('races without a needed stop:', bad);
