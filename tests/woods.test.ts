import { generateTrack } from '../src/track/generator';
import { COURSES } from '../src/track/courses';
// count deep-woodland trees for the forest courses (sanity: dense but bounded)
import { woodlandCount } from '../src/render/scenery';
for (const code of ['KJGKJGPPI12', 'OOJNNNPPO25', 'STMQRUPPU12']) {
  const t = generateTrack(code);
  console.log(code, (t.raceLen / 1000).toFixed(1) + 'km', 'circuit', t.circuit, 'roadside objects', t.objects.count, 'woodland', woodlandCount(t));
}
void COURSES;
