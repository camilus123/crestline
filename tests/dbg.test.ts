import { generateTrack } from '../src/track/generator';
import { Race } from '../src/sim/race';
import { makeRivals } from '../src/sim/roster';
import { NO_INPUT } from '../src/sim/car';
const code = process.argv[2] || 'STMQRUPPU00';
const nr = +(process.argv[3] ?? 19);
const track = generateTrack(code);
const r = new Race({ track, mode: 'arcade', difficulty: 2, players: [{ name: 'BOT', car: 0, manual: false, accelButton: false, color: 0, bot: true }], rivals: makeRivals(1234, 2).slice(0, nr), playerSlots: [nr], fuel: false, seed: 1 });
console.log('segTimes', r.segTimes, 'laps', track.laps, 'lapLen', track.lapLen);
let t = 0, lastCp = 0;
while (!r.over && t < 120 * 600) {
  r.step([NO_INPUT]); t++;
  for (const e of r.events) if (e.t !== 'beep') console.log(r.time.toFixed(1), e.t, e.value ?? '', 'pos', r.players[0].position, 'left', r.timeLeft[0].toFixed(1));
  if (t % 1200 === 0) { const p = r.players[0]; console.log(` t=${r.time.toFixed(0)} dist=${p.dist.toFixed(0)} v=${(p.v*3.6).toFixed(0)} x=${p.x.toFixed(1)} pos=${p.position} gear=${p.gear} off=${p.offroad}`); }
}
