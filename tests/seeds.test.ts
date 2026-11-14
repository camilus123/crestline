import { generateTrack } from '../src/track/generator';
import { COURSES } from '../src/track/courses';
import { Race } from '../src/sim/race';
import { makeRivals } from '../src/sim/roster';
import { NO_INPUT } from '../src/sim/car';
import { hashString } from '../src/core/rng';
const [code, diffName = 'hard', fuelArg = '1'] = process.argv.slice(2);
const diff = diffName === 'easy' ? 0 : diffName === 'medium' ? 1 : 2;
const track = generateTrack(code);
const rivals = makeRivals(hashString('championship' + diffName + (COURSES.championship as any)[diffName].join('')), diff);
const out: number[] = [];
for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
  const r = new Race({ track, mode: 'championship', difficulty: diff, players: [{ name: 'BOT', car: 0, manual: false, accelButton: false, color: 0, bot: true }], rivals, playerSlots: [19], fuel: fuelArg === '1', seed });
  let steps = 0;
  while (!r.over && steps < 120 * 60 * 25) { r.step([NO_INPUT]); steps++; }
  out.push(r.players[0].position);
}
console.log(code, fuelArg === '1' ? 'fuel' : 'no fuel', 'positions over 8 seeds:', out.join(' '), ' top-ten in', out.filter((p) => p <= 10).length, 'of 8');
