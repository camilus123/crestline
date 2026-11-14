import { generateTrack } from '../src/track/generator';
import { COURSES } from '../src/track/courses';
for (const [mode, m] of Object.entries(COURSES)) for (const [diff, list] of Object.entries(m)) {
  const lens = (list as string[]).map((c) => generateTrack(c).raceLen / 1000);
  console.log(mode, diff, 'races', lens.length, 'over 15 km', lens.filter((l) => l > 15).length, 'lengths', lens.map((l) => l.toFixed(1)).join(' '));
}
