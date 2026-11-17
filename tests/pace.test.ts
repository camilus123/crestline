// The pacing rule against a model of a device that cannot keep up: a GPU that takes `cost` ms per frame, a
// browser that stops calling the page while two frames are waiting, and a clock governor that slows the chip
// down (up to 1.8x) when it is less than 60 % busy and speeds it up again when it is more than 85 % busy.
// A model of my assumptions, not of any phone: it checks the rule's logic (settles, does not hunt, recovers
// after a loading stall), not what a real device will do.
import { Pacer } from '../src/pace';

function run(T: number, cost: number, seconds: number, opts: { loadStallAt?: number; pacing?: boolean; heavyUntil?: number; hint?: number; hold?: number } = {}) {
  const p = new Pacer();
  const pacing = opts.pacing ?? true;
  let gpuFree = 0;              // when the GPU finishes what it has
  const queue: number[] = [];   // finish times of frames handed over
  let slow = 1;                 // governor: cost multiplier
  let busyAcc = 0, lastGov = 0;
  const draws: number[] = [];
  const ns: number[] = [];
  let blockedUntil = 0;
  let hinted = false;
  p.reset(0);
  for (let i = 0, now = 0; now < seconds * 1000; i++, now = i * T) {
    while (queue.length && queue[0] <= now) queue.shift();
    // governor, every 50 ms
    if (now - lastGov >= 50) {
      const u = busyAcc / (now - lastGov || 1);
      if (u < 0.6) slow += (1.8 - slow) * 0.15; else if (u > 0.85) slow += (1 - slow) * 0.4;
      busyAcc = 0; lastGov = now;
    }
    if (opts.loadStallAt !== undefined && Math.abs(now - opts.loadStallAt) < T / 2) blockedUntil = now + 180; // a loading stall
    if (now < blockedUntil) continue;
    if (queue.length >= (opts.hold ?? 2)) continue; // the browser holds the page back
    if (opts.hint && now >= 1000 && !hinted) { hinted = true; p.reset(now); p.hint(now, opts.hint); } // a new race after the menu
    const skip = p.tick(now, pacing);
    ns.push(p.n);
    if (skip) continue;
    // (the first second is a light menu, as in the game: the rule learns the screen's refresh interval there)
    const c = (now < 1000 ? T * 0.3 : (opts.heavyUntil && now < opts.heavyUntil ? T * 1.8 : cost) * slow) * (0.9 + 0.2 * ((i * 7919) % 100) / 100); // +-10 % from frame to frame
    const start = Math.max(now + 1, gpuFree);
    gpuFree = start + c;
    busyAcc += c;
    queue.push(gpuFree);
    draws.push(now);
  }
  const half = seconds * 500;
  const late = draws.filter((t) => t >= half);
  const iv = late.slice(1).map((t, j) => t - late[j]);
  const s = iv.slice().sort((a, b) => a - b);
  const changes = p.log.filter((e) => e.t >= half).length;
  return { fps: (late.length - 1) / ((late[late.length - 1] - late[0]) / 1000), p50: s[Math.floor(s.length * 0.5)], p99: s[Math.floor(s.length * 0.99)], worst: s[s.length - 1], n: p.n, changes, log: p.log.map((e) => `${(e.t / 1000).toFixed(1)}:${e.n}`).join(' ') };
}

let bad = 0;
const check = (name: string, ok: boolean, r: ReturnType<typeof run>) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(46)} fps ${r.fps.toFixed(1).padStart(6)}  p50 ${r.p50.toFixed(1)}  p99 ${r.p99.toFixed(1)}  worst ${r.worst.toFixed(1)}  ends at N=${r.n}  changes in 2nd half ${r.changes}\n       ${r.log}`);
  if (!ok) bad++;
};
for (const [T, name] of [[1000 / 120, '120 Hz'], [1000 / 60, '60 Hz']] as [number, string][]) {
  for (const frac of [0.5, 0.8, 1.3, 1.8, 2.2, 3.1]) {
    const cost = T * frac;
    const off = run(T, cost, 30, { pacing: false });
    const r = run(T, cost, 30);
    const maxN = Math.max(2, Math.floor(50 / T)); // the rule never goes below 20 frames a second
    const need = Math.min(maxN, Math.ceil(frac * 1.1 - 1e-9)); // rhythm that fits the cost with the chip at full speed (+10 % jitter)
    // light load: every refresh; heavy: the fitting rhythm or one slower, and little hunting
    const ok = frac < 0.9 ? r.fps > 0.95 * 1000 / T : r.n >= Math.min(maxN, Math.ceil(frac)) - 1 && r.n <= Math.min(maxN, need + 1) && r.changes <= 8 && r.worst <= (r.n + 1) * T + 1;
    // (this browser lets two frames wait, so a rhythm one step too fast still runs without a gap longer than one
    // extra refresh; the rule lets that be)
    check(`${name}, cost ${frac} refreshes`, ok, r);
    console.log(`       (pacing off: fps ${off.fps.toFixed(1)}, p99 ${off.p99.toFixed(1)}, worst ${off.worst.toFixed(1)})`);
  }
  // a browser that holds the page back while even one frame is unfinished: every callback after a drawn frame
  // comes a whole frame late, whatever the rhythm. (v3.8.3 on the phone: the rule read those gaps as stalls and
  // climbed to the slowest rhythm it has, 20 fps, on settings that hold 40.)
  for (const frac of [1.8, 2.6, 3.1, 3.6]) {
    const r = run(T, T * frac, 30, { hold: 1 });
    const maxN = Math.max(2, Math.floor(50 / T));
    const fit = Math.min(maxN, Math.ceil(frac * 1.1 + 0.15));
    check(`${name}, strict browser, cost ${frac} refreshes`, r.n >= Math.min(maxN, Math.ceil(frac)) && r.n <= Math.min(maxN, fit + 1), r);
  }
  // a race started on the remembered rhythm: no climbing, and the first attempt at a faster one after 7 s
  const m = run(T, T * 2.2, 12, { hint: 3 });
  const first = m.log.split(' ').slice(3)[0] ?? '99:0';
  check(`${name}, cost 2.2, started on the remembered rhythm`, (m.n === 3 || m.n === 2) && parseFloat(first) >= 7.9 && m.worst <= 3 * T + 1, m);
  const m2 = run(T, T * 0.55, 20, { hint: 3 }); // remembered too slow: it must find its way back up
  check(`${name}, light load, remembered rhythm too slow`, m2.fps > 0.95 * 1000 / T && m2.n === 1, m2);
  // what v3.8.1 got wrong on the phone: back on a light load after a heavy spell, the chip has clocked itself down
  const h = run(T, T * 0.55, 16, { heavyUntil: 4000 });
  check(`${name}, heavy for 4 s, then light`, h.fps > 0.95 * 1000 / T && h.n === 1, h);
  const r = run(T, T * 0.6, 12, { loadStallAt: 2000 });
  check(`${name}, light load, one 180 ms hiccup at 2 s`, r.fps > 0.95 * 1000 / T && r.log.split(' ').length === 1, r);
}
if (bad) { console.log(bad + ' failed'); process.exit(1); }
