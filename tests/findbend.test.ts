// Finds the sharpest bend with towers on its inside, and how many sim steps the bot needs to get there.
import { generateTrack } from '../src/track/generator';
import { Race } from '../src/sim/race';
import { makeRivals } from '../src/sim/roster';
import { NO_INPUT } from '../src/sim/car';
const code = process.argv[2] || 'PPLONQSOP14';
const t = generateTrack(code);
let best = -1, bc = 0;
const n = t.curv.length;
for (let i = 200; i < n - 200; i++) {
  const c = Math.abs(t.curv[i]);
  if (c <= bc) continue;
  const s = i * 2 - (t as any).sOff;
  const side = t.curv[i] > 0 ? 1 : -1; // inside of the bend
  let towers = 0;
  for (let k = 0; k < t.objects.count; k++) if (t.objects.type[k] === 16 && Math.abs(t.objects.s[k] - s) < 40 && Math.sign(t.objects.u[k]) === side) towers++;
  if (towers >= 2 && s > 300 && s < t.raceLen - 300) { bc = c; best = s; }
}
console.log('bend at s', best, 'radius', (1 / bc).toFixed(0), 'm');
const r = new Race({ track: t, mode: 'arcade', difficulty: 0, players: [{ name: 'BOT', car: 0, manual: true, accelButton: false, color: 0, bot: true }], rivals: makeRivals(1, 0), playerSlots: [19], fuel: false, seed: 5 });
let steps = 0;
while (r.players[0].s < best - 45 && steps < 120 * 600) { r.step([NO_INPUT]); steps++; }
console.log('steps', steps, 's', r.players[0].s.toFixed(0));
