// Manual (shifting near the redline) should be slightly faster than automatic.
import { generateTrack } from '../src/track/generator';
import { Race } from '../src/sim/race';
import { NO_INPUT } from '../src/sim/car';
for (const code of ['IHFHGFQSG00', 'MKIKJHTMI23', 'ONLONNTGM18']) for (const car of [0, 1, 2]) {
  const t: number[] = [];
  for (const manual of [false, true]) {
    const r = new Race({ track: generateTrack(code), mode: 'practice', difficulty: 1, players: [{ name: 'B', car, manual, accelButton: false, color: 0, bot: true }], rivals: [], playerSlots: [0], fuel: false, seed: 1 });
    while (!r.over && r.clock < 900) r.step([NO_INPUT]);
    t.push(r.time);
  }
  console.log(`${code} car ${car}: auto ${t[0].toFixed(2)}s  manual ${t[1].toFixed(2)}s  gain ${(t[0] - t[1]).toFixed(2)}s (${((1 - t[1] / t[0]) * 100).toFixed(2)}%)`);
}
