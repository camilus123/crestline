// Engine sound: how many parameter changes are scheduled per second during a race start, and that a rival voice
// is silent at the moment it is handed another car. node tests/audiorate.mjs [build.html]
import { createRequire } from 'node:module'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(root + '/')('playwright');
const build = path.resolve(process.argv[2] ?? path.join(root, 'dist/crestline.html'));
const br = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const p = await br.newPage({ viewport: { width: 160, height: 90 } }); p.setDefaultTimeout(300000);
const errors = []; p.on('pageerror', (e) => errors.push(String(e)));
await p.addInitScript(() => {
  // count every scheduled change, and note each pan target per StereoPanner (a jump of the target is a change of car)
  window.__sched = 0; window.__panJumps = [];
  const orig = AudioParam.prototype.setTargetAtTime;
  AudioParam.prototype.setTargetAtTime = function (v, t, k) { window.__sched++; return orig.call(this, v, t, k); };
});
await p.goto('file://' + build + '?race=MIHJHHTLI12&bot&manual&q=0', { waitUntil: 'commit' });
await p.waitForTimeout(2500);
const res = await p.evaluate(async () => {
  const g = window.__crest;
  g.audio.init(); await g.audio.ctx.resume();
  for (let i = 0; i < 100 && !g.audio.ready; i++) await new Promise((r) => setTimeout(r, 50));
  g.audio.setEngines(g.race.players, 4);
  // the race from the grid for 12 s of game time, the sound updated once per simulated frame of 1/120 s, with the
  // sound clock running alongside (as at 120 fps)
  const ctx = g.audio.ctx; const t0 = ctx.currentTime; const s0 = window.__sched;
  let calls = 0, swaps = 0, loudSwaps = 0, orderChanges = 0, lastOrder = '';
  const upd = g.audio.update.bind(g.audio);
  const voices = () => g.audio.engines.slice(1);
  const r = g.race;
  const start = performance.now();
  for (let f = 0; f < 1440; f++) {
    g.simulate(1);
    // what "voice i plays the i-th nearest rival" (up to v3.9.3) would have done: every change of that order
    // moved a voice to another car
    const lead = r.players[0];
    const order = r.cars.filter((c) => !c.isPlayer).map((c) => ({ c, d: Math.abs(r.track.delta(lead.s, c.s)) })).filter((o) => o.d < 140).sort((a, b) => a.d - b.d).slice(0, 4).map((o) => r.cars.indexOf(o.c)).join(',');
    if (lastOrder && order !== lastOrder) orderChanges++;
    lastOrder = order;
    const cars0 = voices().map((e) => e.car);
    upd(r.players, r.cars, (a, b) => r.track.delta(a, b), { rain: 0, wind: 0, scen: r.scen }, true); calls++;
    voices().forEach((e, i) => {
      if (e.car !== cars0[i] && cars0[i] && e.car) { swaps++; if (!(e.muteUntil > ctx.currentTime)) loudSwaps++; }
    });
    // keep pace with real time: 1/120 s per step
    const due = start + (f + 1) * (1000 / 120);
    while (performance.now() < due) await new Promise((r) => setTimeout(r, 1));
  }
  const secs = ctx.currentTime - t0;
  return { ready: g.audio.ready, state: ctx.state, seconds: +secs.toFixed(2), updatesCalled: calls, scheduledPerSecond: Math.round((window.__sched - s0) / secs), nearestFourOrderChanges: orderChanges, voiceCarChanges: swaps, changesNotSilenced: loudSwaps, hint: ctx.baseLatency };
});
console.log(JSON.stringify(res), errors);
await br.close();
