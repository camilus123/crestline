// Benchmark: the same fixed suite on every run, so results can be compared between runs, builds and devices.
//
// Four tracks (heavy scenery, big terrain, many lights, many buildings), each at five fixed presets with their
// stock options, plus once more at the player's own settings when those differ from all five. One player, a bot
// driving, the same car, render resolution fixed at the preset's scale (dynamic resolution off). Each case:
//   warm-up   1.5 to 8 s: until the track has loaded and frame times are steady; with frame pacing on, also until
//                    the rhythm has been found and has stood for 2.5 s (not measured)
//   play      5 s    normal frames: fps, lows, frame-time percentiles, CPU time, draw counters, and the GPU time
//                    of each render stage where the browser has GPU timers (they cost nothing to use)
//   cost      1 s    the GPU is made to finish every frame: frame cost, not limited by vsync
//   stages    1 s    only without GPU timers: the GPU is made to finish after every render stage
// Making the GPU finish means reading a pixel back, which itself takes time (0.3 ms per call on one desktop
// browser, 2 ms on one phone). That overhead is measured at the start and taken off, and reported.
// The report is plain text: a summary table, a stage table per case, the device, and one line of JSON with
// every number for pasting into a spreadsheet or back to the developer.

import type { Game } from './game';
import { QUALITY, FX_DEFAULT, type Quality, type PictureFx } from './render/renderer';
import { Program } from './render/gl';

export const BENCH_TRACKS: { code: string; what: string }[] = [
  { code: 'MIHJHHTLI12', what: 'Forest (dense scenery)' },
  { code: 'UTNRSVVLR17', what: 'Mountains (terrain, woodland)' },
  { code: 'KIGJHGSHI15', what: 'Night (street lights)' },
  { code: 'TUORSWWUS14', what: 'Futuristic (buildings, neon)' },
];
export const BENCH_PRESETS = ['Low', 'High', 'Psycho', 'Admiral', 'Commodore'];

interface Phase { id: 'warm' | 'play' | 'cost' | 'stages'; dur: number }
// (automated tests on a software GPU shorten the phases: window.__benchQuick)
const QK = (globalThis as any).__benchQuick ? 0.1 : 1;
const PHASES: Phase[] = [{ id: 'warm', dur: 1.5 * QK }, { id: 'play', dur: 5 * QK }, { id: 'cost', dur: 1 * QK }, { id: 'stages', dur: 1 * QK }];
const CASE_SECONDS = PHASES.reduce((a, p) => a + p.dur, 0);

interface Case { track: number; q: Quality; label: string; fx?: Partial<PictureFx>; round?: number }

// The picture cost test: what each of the picture effects added in v3.7.0 costs on this device. (v3.7.0 was
// measured on a desktop only, 0.3-0.4 ms a frame; a phone turned out to pay about 3 ms on High.)
// (Run on the phone with v3.9.2: the whole cost was the place in the frame where the sky picture for the cars'
// reflections was drawn, 4.5-5.6 ms on High; fixed in v3.9.3. The other four effects were below what the test
// can tell apart there, about 1.5 ms. The test stays as a tool, started by the automated test only: its button
// is gone from the benchmark screen.)
// Two tracks on High, the effects switched one at a time, and on Commodore the frame order alone; each case is a
// short warm-up and 2 s with the GPU made to finish every frame. Frame cost on a phone varies by a millisecond
// or more from one run to the next, as much as the differences looked for, so everything is run three times,
// the rounds interleaved and every second round in reverse order (a phone that warms up and slows down then
// handicaps each variant equally), and the median is reported with the lowest and highest.
const PROBE_PHASES: Phase[] = [{ id: 'warm', dur: 1 * QK }, { id: 'cost', dur: 2 * QK }];
const PROBE_TRACKS = [0, 1];
const PROBE_ROUNDS = 3;
const PROBE: { preset: string; variants: { label: string; fx: Partial<PictureFx> }[] }[] = [
  { preset: 'High', variants: [
    { label: 'as shipped', fx: {} },
    { label: 'sky picture in mid-frame', fx: { env: 'mid' } },
    { label: 'no sky reflections', fx: { env: 'off' } },
    { label: 'no cloud shadows', fx: { cloud: false } },
    { label: 'no haze', fx: { aerial: false } },
    { label: 'no terrain variation', fx: { terrVar: false } },
    { label: 'no model blend', fx: { dissolve: false } },
    { label: 'all five off', fx: { env: 'off', cloud: false, aerial: false, terrVar: false, dissolve: false } },
  ] },
  { preset: 'Commodore', variants: [
    { label: 'as shipped', fx: {} },
    { label: 'main picture not cleared again', fx: { env: 'mid' } },
  ] },
];
export const PROBE_SECONDS = PROBE_ROUNDS * PROBE_TRACKS.length * PROBE.reduce((a, p) => a + p.variants.length, 0) * 3.4;
interface CaseResult {
  track: string; what: string; settings: string; res: string;
  fps: number; low1: number; p50: number; p95: number; p99: number; worst: number; hitches: number;
  cpuMs: number; cpuP99: number; costMs: number; calls: number; instances: number; verts: number; rhythm: number; paceLog: string;
  stages: { name: string; cpu: number; gpu: number }[];
  /** where the stage GPU times came from */
  src: 'timer' | 'sync';
  /** GPU time of the entire frame from one timer query (-1: not measured) */
  wholeGpu: number;
  warm: number;
}

export interface BenchReport { text: string; timeline: number[]; scaleLine: number[]; refresh: number }

const pct = (s: number[], p: number) => (s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0);
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const f1 = (x: number) => x.toFixed(1), f2 = (x: number) => x.toFixed(2);

/** the options that differ from the stock preset of the same name, e.g. "msaa 8>4, shadows 4096>0" */
export function qualityDiff(q: Quality): string {
  const base = QUALITY.find((x) => x.name === q.name.replace(/ \(custom\)$/, ''));
  if (!base) return '';
  const out: string[] = [];
  for (const k of Object.keys(base) as (keyof Quality)[]) if (k !== 'name' && base[k] !== q[k]) out.push(`${k} ${base[k]}>${q[k]}`);
  return out.join(', ');
}

export class Benchmark {
  private cases: Case[] = [];
  private ci = 0;
  private k = 0;
  private t = 0;
  private iv: number[] = [];
  private caseT0 = 0;
  private paceSum = 0; // sum of the pacing rhythm over the measured frames
  private cpu: number[] = [];
  private cost: number[] = [];
  private calls = 0;
  private inst = 0;
  private verts = 0;
  private stageCpu = new Map<string, number>();
  private stageGpu: Map<string, number> | null = null;
  private wholeGpu = -1;
  private order: string[] = [];
  private warmIv: number[] = [];
  private warmT = 0;
  /** milliseconds one 'finish the GPU' read-back takes with nothing queued (taken off the measurements) */
  private syncMs = 0;
  private results: CaseResult[] = [];
  private probeRes: { track: number; preset: string; variant: string; round: number; costMs: number }[] = [];
  private phases: Phase[] = PHASES;
  private caseSeconds = CASE_SECONDS;
  private secN = 0;
  private secT = 0;
  timeline: number[] = [];
  scaleLine: number[] = [];
  label = '';
  readonly totalSeconds: number;

  constructor(private g: Game, private done: (r: BenchReport) => void, readonly probe = false) {
    const mine = g.effectiveQuality();
    if (probe) {
      this.phases = PROBE_PHASES;
      this.caseSeconds = PROBE_SECONDS / (PROBE_ROUNDS * PROBE_TRACKS.length * PROBE.reduce((a, p) => a + p.variants.length, 0));
      // (the automated test, on a software GPU: one round of one track)
      const quickP = !!(globalThis as any).__benchQuick;
      for (let round = 0; round < (quickP ? 1 : PROBE_ROUNDS); round++) {
        const one: Case[] = [];
        for (const t of quickP ? [0] : PROBE_TRACKS) for (const pr of PROBE) for (const v of pr.variants) one.push({ track: t, q: QUALITY.find((x) => x.name === pr.preset)!, label: v.label, fx: v.fx, round });
        this.cases.push(...(round % 2 ? one.reverse() : one));
      }
    }
    // (the automated test runs a cut-down suite: a software GPU needs minutes per Psycho frame)
    const quick = !!(globalThis as any).__benchQuick;
    const presets = quick ? ['Ultra Low', 'Low'] : BENCH_PRESETS;
    for (let t = 0; !probe && t < (quick ? 2 : BENCH_TRACKS.length); t++) {
      for (const n of presets) this.cases.push({ track: t, q: QUALITY.find((x) => x.name === n)!, label: n });
      // the player's own settings too, unless they are exactly one of the presets above
      if (!(presets.includes(mine.name) && !qualityDiff(mine))) this.cases.push({ track: t, q: mine, label: 'Yours: ' + mine.name });
    }
    this.totalSeconds = this.cases.length * this.caseSeconds;
    // what a read-back costs when the GPU has nothing to do
    const pf = g.renderer.prof;
    pf.sync();
    const t0 = performance.now();
    for (let i = 0; i < 12; i++) pf.sync();
    this.syncMs = (performance.now() - t0) / 12;
    this.startCase();
  }

  // (after the last phase of the last case k is one past the end while the shader timing runs: the game still asks
  // about the phase every frame, and an undefined one here stopped its frame loop on every device without GPU
  // timers)
  get phase(): Phase { return this.phases[Math.min(this.k, this.phases.length - 1)]; }
  /** the game must finish the GPU at the end of this frame (whole-frame cost) */
  get finishFrames(): boolean { return !this.finishing && this.phase.id === 'cost'; }
  /** the game must not touch the render scale (fixed by the test) */
  get holdScale(): boolean { return true; }

  private startCase(): void {
    const c = this.cases[this.ci];
    this.g.pacer.log.length = 0;
    this.caseT0 = performance.now();
    this.g.benchRace(BENCH_TRACKS[c.track].code, c.q);
    this.g.renderer.forceScale = c.q.scale;
    this.g.renderer.pic = { ...FX_DEFAULT, ...(c.fx ?? {}) };
    this.iv = [];
    this.paceSum = 0;
    this.cpu = [];
    this.cost = [];
    this.warmIv = [];
    this.stageGpu = null;
    this.k = 0;
    this.enter();
  }

  private enter(): void {
    const pf = this.g.renderer.prof;
    const id = this.phase.id;
    this.t = 0;
    pf.reset();
    pf.whole = id === 'play';
    pf.mode = id === 'play' ? (pf.timerAvailable ? 'timer' : 'cpu') : id === 'stages' ? 'sync' : 'off';
  }

  private leave(): void {
    const R = this.g.renderer, pf = R.prof;
    const id = this.phase.id;
    if (id === 'play') {
      const n = Math.max(1, pf.frames);
      this.calls = pf.calls / n;
      this.inst = pf.instances / n;
      this.verts = pf.verts / n;
      this.stageCpu = new Map(pf.order.map((s) => [s, pf.cpuAvg(s)]));
      this.order = pf.order.slice();
      if (pf.mode === 'timer') {
        pf.flush();
        const m = new Map(pf.order.map((s) => [s, pf.gpuAvg(s)]));
        if ([...m.values()].some((v) => v > 0)) this.stageGpu = m;
        this.wholeGpu = pf.wholeAvg;
      }
    }
    if (this.probe && id === 'cost') {
      const c = this.cases[this.ci];
      const s = this.cost.slice(Math.floor(this.cost.length * 0.2)).sort((a, b) => a - b);
      this.probeRes.push({ track: c.track, preset: c.q.name, variant: c.label, round: c.round ?? 0, costMs: Math.max(0, pct(s, 0.5) - this.syncMs) });
      return;
    }
    if (id === 'stages' || (id === 'cost' && this.stageGpu)) {
      const c = this.cases[this.ci];
      const ms = this.iv.map((x) => x * 1000);
      const s = ms.slice().sort((a, b) => a - b);
      const med = pct(s, 0.5);
      const cs = this.cpu.slice().sort((a, b) => a - b);
      const worst1 = s.slice(Math.floor(s.length * 0.99));
      this.results.push({
        track: BENCH_TRACKS[c.track].code, what: BENCH_TRACKS[c.track].what, settings: c.label, res: `${R.renderW}x${R.renderH}`,
        fps: 1000 / Math.max(1e-3, mean(ms)), low1: 1000 / Math.max(1e-3, mean(worst1)), p50: med, p95: pct(s, 0.95), p99: pct(s, 0.99), worst: s[s.length - 1] ?? 0,
        hitches: ms.filter((x) => x > Math.max(med * 2, 25)).length,
        cpuMs: mean(this.cpu), cpuP99: pct(cs, 0.99), costMs: Math.max(0, mean(this.cost.slice(Math.floor(this.cost.length * 0.2))) - this.syncMs),
        calls: this.calls, instances: this.inst, verts: this.verts, rhythm: this.paceSum / Math.max(1, this.iv.length),
        paceLog: this.g.pacer.log.map((e) => `${((e.t - this.caseT0) / 1000).toFixed(1)}s ${e.n} (${e.why})`).join(', '),
        stages: this.stageGpu
          ? this.order.map((n) => ({ name: n, cpu: this.stageCpu.get(n) ?? 0, gpu: n.endsWith('(CPU)') ? -1 : this.stageGpu!.get(n) ?? -1 }))
          : pf.order.map((n) => ({ name: n, cpu: this.stageCpu.get(n) ?? 0, gpu: n.endsWith('(CPU)') ? -1 : Math.max(0, pf.gpuAvg(n) - this.syncMs) })),
        src: this.stageGpu ? 'timer' : 'sync', warm: this.warmT, wholeGpu: this.stageGpu ? this.wholeGpu : -1,
      });
    }
  }

  /** called at the end of every frame; raw = wall-clock interval, cpuMs = time spent in this frame */
  frame(raw: number, cpuMs: number): void {
    if (this.finishing) return;
    this.t += raw;
    const id = this.phase.id;
    if (id === 'warm') this.warmIv.push(raw);
    if (id === 'play') {
      this.iv.push(raw);
      this.paceSum += this.g.pacer.n;
      this.cpu.push(cpuMs);
      this.secN++;
      this.secT += raw;
      if (this.secT >= 1) {
        this.timeline.push(this.secN / this.secT);
        this.scaleLine.push(this.cases[this.ci].q.scale);
        this.secN = 0;
        this.secT = 0;
      }
    }
    if (id === 'cost') this.cost.push(cpuMs);
    const c = this.cases[this.ci];
    const left = Math.max(0, (this.cases.length - this.ci) * this.caseSeconds - this.phases.slice(0, this.k).reduce((a, p) => a + p.dur, 0) - this.t);
    const recent = this.iv.slice(-120);
    const fps = recent.length ? recent.length / recent.reduce((x, y) => x + y, 0) : 0;
    const doing = id === 'warm' ? 'loading' : id === 'play' ? `${fps.toFixed(0)} fps` : 'measuring the graphics card (the picture slows down, this is normal)';
    this.label = this.probe
      ? `PICTURE COST TEST ${this.ci + 1}/${this.cases.length} · ${BENCH_TRACKS[c.track].what.split(' (')[0]} · ${c.q.name} · ${c.label} · ${Math.ceil(left)} s left (the picture is slow and jumps back: this is normal)`
      : `BENCHMARK ${this.ci + 1}/${this.cases.length} · ${BENCH_TRACKS[c.track].what.split(' (')[0]} · ${c.label} · ${doing} · ${Math.ceil(left)} s left`;
    let over = this.t >= this.phase.dur;
    if (id === 'warm' && over && this.t < 8) {
      // not until the track has finished loading: the last 20 frames must be steady (none over 2.5x their median)
      const w = this.warmIv.slice(-20), sorted = w.slice().sort((x, y) => x - y);
      over = w.length >= 20 && sorted[19] < Math.max(sorted[10] * 2.5, 0.012);
      if (!over && this.t > 4 && w.length < 20) over = true; // (a device too slow to draw 20 frames in 4 s)
      // with frame pacing on, also not until the rhythm has been found and has stood for 2.5 s
      if (over && !this.probe && this.g.pacing && !this.g.pacer.settled(performance.now())) over = false;
    }
    if (over && id === 'warm') this.warmT = this.t;
    // with GPU timers the stage times came from the normal run: no need for the slow stage-by-stage phase
    const last = this.k === this.phases.length - 1 || (id === 'cost' && !!this.stageGpu);
    if (over) {
      this.leave();
      this.k++;
      if (!last) this.enter();
      else if (++this.ci < this.cases.length) this.startCase();
      else this.finish();
    }
  }

  /** abandon (e.g. leaving the race): restore settings */
  restore(): void {
    const R = this.g.renderer;
    R.forceScale = null;
    R.pic = { ...FX_DEFAULT };
    R.prof.mode = 'off';
    R.prof.whole = false;
    this.g.benchRestore();
  }

  private finishing = false;
  private compiles: { each: { name: string; ms: number }[]; together: number; probes: { name: string; ms: number; ok: boolean }[] } | null = null;
  private finish(): void {
    this.restore();
    if (this.probe) { this.finishing = true; this.done(this.probeReport()); return; }
    // last: how long the graphics driver takes over each shader program (what start-up waits for)
    this.finishing = true;
    const next = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    Program.timeCompiles(this.g.renderer.gl, (i, n) => {
      this.label = `BENCHMARK · timing shader compilation ${i + 1}/${n} (the picture stops for a moment each time, this is normal)`;
      return next();
    }, () => this.g.renderer.prof.sync()).then((c) => { this.compiles = c; }, () => { /* report without it */ }).then(() => this.done(this.report()));
  }

  private deviceLines(L: string[]): string {
    const g = this.g, R = g.renderer, gl = R.gl;
    const refresh = g.refreshRate;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const gpuName = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const gpuVendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    const nav = navigator as any;
    const mine = g.effectiveQuality();
    const line = (k: string, v: string) => L.push(k.padEnd(22) + v);
    L.push('== Device ==');
    line('GPU', `${gpuName}  (${gpuVendor})`);
    line('output', `${R.canvas.width}x${R.canvas.height} px   device pixel ratio ${devicePixelRatio}   screen ${screen.width}x${screen.height}   refresh ~${refresh.toFixed(0)} Hz (estimated)`);
    line('WebGL', `${gl.getParameter(gl.VERSION)}   max MSAA ${gl.getParameter(gl.MAX_SAMPLES)}   HDR targets ${R.hdr ? 'yes' : 'no'}   GPU timers ${R.prof.timerAvailable ? 'yes' : 'no'}`);
    line('CPU threads / memory', `${nav.hardwareConcurrency ?? '?'} / ${nav.deviceMemory ? nav.deviceMemory + ' GB' : '?'}`);
    line('browser', navigator.userAgent);
    line('start-up', `${(g.startupMs / 1000).toFixed(1)} s from opening the page to the third frame (shader compilation included)`);
    line('your settings', `${mine.name}` + (qualityDiff(mine) ? `  [${qualityDiff(mine)}]` : '  (stock)') + `   dynamic resolution ${g.settings.dynRes ? 'on' : 'off'} (off during the benchmark)   frame pacing ${g.pacing ? 'on' : 'off'}`);
    return String(gpuName);
  }

  /** the report of the picture cost test */
  private probeReport(): BenchReport {
    const L: string[] = [];
    const tracks = PROBE_TRACKS.filter((t) => this.probeRes.some((r) => r.track === t));
    const rounds = 1 + Math.max(0, ...this.probeRes.map((r) => r.round));
    const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    L.push(`CRESTLINE v${__VERSION__} (build ${__BUILD_TIME__.slice(0, 16).replace('T', ' ')} UTC) — picture cost test, ${stamp} UTC`);
    L.push(`What each picture effect added in v3.7.0 costs on this device: frame cost with the GPU made to finish, ${rounds} round${rounds > 1 ? 's' : ''}, median (lowest-highest).`);
    L.push('');
    const gpu = this.deviceLines(L);
    L.push('');
    L.push(`(making the GPU finish costs ${f2(this.syncMs)} ms per call on this device; that has been taken off)`);
    const med = (a: number[]) => pct(a.slice().sort((x, y) => x - y), 0.5);
    const cases: unknown[] = [];
    for (const pr of PROBE) {
      L.push('');
      L.push(`== ${pr.preset}: frame cost in ms ==`);
      L.push('variant'.padEnd(28) + tracks.map((t) => BENCH_TRACKS[t].what.split(' (')[0].padStart(24)).join('') + tracks.map((t) => ('change, ' + BENCH_TRACKS[t].what.split(' (')[0]).padStart(20)).join(''));
      const base = tracks.map((t) => med(this.probeRes.filter((r) => r.track === t && r.preset === pr.preset && r.variant === 'as shipped').map((r) => r.costMs)));
      for (const v of pr.variants) {
        let row = v.label.padEnd(28), diff = '';
        tracks.forEach((t, i) => {
          const c = this.probeRes.filter((r) => r.track === t && r.preset === pr.preset && r.variant === v.label).sort((a, b) => a.round - b.round).map((r) => r.costMs);
          const lo = Math.min(...c), hi = Math.max(...c);
          row += `${f2(med(c))} (${f2(lo)}-${f2(hi)})`.padStart(24);
          const d = med(c) - base[i];
          diff += (v.label === 'as shipped' ? '–' : (d >= 0 ? '+' : '') + f2(d)).padStart(20);
          cases.push({ track: BENCH_TRACKS[t].code, preset: pr.preset, variant: v.label, costMs: c.map((x) => Math.round(x * 100) / 100) });
        });
        L.push(row + diff);
      }
    }
    L.push('');
    L.push('A change smaller than the spread between rounds (the figures in brackets) means nothing.');
    L.push('');
    L.push('== Data (JSON, one line) ==');
    L.push(JSON.stringify({ v: __VERSION__, probe: 'picture', when: stamp, gpu, out: [this.g.renderer.canvas.width, this.g.renderer.canvas.height], hz: Math.round(this.g.refreshRate), syncMs: Math.round(this.syncMs * 1000) / 1000, cases }));
    return { text: L.join('\n'), timeline: [], scaleLine: [], refresh: this.g.refreshRate };
  }

  private report(): BenchReport {
    const g = this.g, R = g.renderer, gl = R.gl;
    const refresh = g.refreshRate;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const gpuName = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const gpuVendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    const nav = navigator as any;
    const mine = g.effectiveQuality();
    const L: string[] = [];
    const line = (k: string, v: string) => L.push(k.padEnd(22) + v);
    const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    L.push(`CRESTLINE v${__VERSION__} (build ${__BUILD_TIME__.slice(0, 16).replace('T', ' ')} UTC) — benchmark, ${stamp} UTC`);
    L.push(`Fixed suite: ${BENCH_TRACKS.length} tracks x ${BENCH_PRESETS.join(' / ')}` + (this.cases.length > BENCH_TRACKS.length * BENCH_PRESETS.length ? ' + your settings' : '') + '; 1 player, bot driving, resolution fixed at each preset\'s scale.');
    L.push('');
    this.deviceLines(L);
    L.push('');
    L.push('== Summary ==');
    L.push('fps = measured (never above the refresh rate) · cost = full frame with the GPU made to finish, no vsync · max fps = 1000 / cost');
    L.push(`(making the GPU finish costs ${f2(this.syncMs)} ms per call on this device; that has been taken off cost and stage times. If cost still disagrees with fps, trust fps.)`);
    L.push('CPU = JavaScript per frame (simulation, scene set-up, draw calls) · verts = vertices sent per frame');
    L.push('');
    const head = 'track'.padEnd(12) + 'settings'.padEnd(20) + 'render'.padEnd(11) + 'fps'.padStart(7) + '1% low'.padStart(8) + 'p99 ms'.padStart(8) + 'cost ms'.padStart(9) + 'max fps'.padStart(9) + 'CPU ms'.padStart(8) + 'calls'.padStart(7) + 'verts'.padStart(8) + '  hitches';
    L.push(head);
    let lastTrack = '';
    for (const r of this.results) {
      if (lastTrack && lastTrack !== r.track) L.push('');
      lastTrack = r.track;
      L.push(r.what.split(' (')[0].padEnd(12) + r.settings.slice(0, 19).padEnd(20) + r.res.padEnd(11) + f1(r.fps).padStart(7) + f1(r.low1).padStart(8) + f2(r.p99).padStart(8) + f2(r.costMs).padStart(9) + f1(1000 / Math.max(0.01, r.costMs)).padStart(9) + f2(r.cpuMs).padStart(8) + r.calls.toFixed(0).padStart(7) + ((r.verts / 1e6).toFixed(2) + 'M').padStart(8) + '  ' + r.hitches);
    }
    L.push('');
    // averages per settings across the tracks
    L.push('== Average over the tracks ==');
    const labels = [...new Set(this.results.map((r) => r.settings))];
    for (const lab of labels) {
      const rs = this.results.filter((r) => r.settings === lab);
      const cost = mean(rs.map((r) => r.costMs));
      L.push(lab.padEnd(22) + `${f1(mean(rs.map((r) => r.fps)))} fps measured   frame cost ${f2(cost)} ms (max ~${f1(1000 / Math.max(0.01, cost))} fps)   CPU ${f2(mean(rs.map((r) => r.cpuMs)))} ms   ` +
        (cost <= 1000 / refresh ? `fits the ${refresh.toFixed(0)} Hz budget of ${f2(1000 / refresh)} ms` : `over the ${refresh.toFixed(0)} Hz budget of ${f2(1000 / refresh)} ms by ${f2(cost - 1000 / refresh)} ms`));
    }
    L.push('');
    const timer = this.results.some((r) => r.src === 'timer');
    L.push(timer ? '== Time per render stage (ms per frame, from GPU timers during the normal run) ==' : '== Time per render stage (ms per frame; no GPU timers in this browser, so the GPU was made to finish after each stage: compare the proportions) ==');
    const names: string[] = [];
    for (const r of this.results) for (const s of r.stages) if (!names.includes(s.name)) names.push(s.name);
    for (const t of BENCH_TRACKS) {
      const rs = this.results.filter((r) => r.track === t.code);
      if (!rs.length) continue;
      L.push('');
      L.push(`${t.what}  ${t.code}`);
      L.push('stage'.padEnd(30) + rs.map((r) => r.settings.slice(0, 15).padStart(16)).join(''));
      for (const n of names) {
        const vals = rs.map((r) => r.stages.find((s) => s.name === n));
        if (vals.every((v) => !v || (v.gpu < 0.005 && v.cpu < 0.005))) continue;
        const cpuOnly = n.endsWith('(CPU)');
        L.push(n.padEnd(30) + vals.map((v) => (v ? f2(cpuOnly ? v.cpu : Math.max(0, v.gpu)) : '–').padStart(16)).join(''));
      }
      L.push('total of stages'.padEnd(30) + rs.map((r) => f2(r.stages.reduce((a, s) => a + Math.max(0, s.name.endsWith('(CPU)') ? s.cpu : s.gpu), 0)).padStart(16)).join(''));
      if (rs.some((r) => r.wholeGpu > 0)) {
        // one query around the whole frame: what it shows beyond the stages is GPU work between them; what the
        // frame cost shows beyond it is outside the game's drawing (the browser presenting the picture, the page)
        L.push('GPU stages only'.padEnd(30) + rs.map((r) => f2(r.stages.reduce((a, s) => a + (s.name.endsWith('(CPU)') ? 0 : Math.max(0, s.gpu)), 0)).padStart(16)).join(''));
        L.push('whole frame, one GPU timer'.padEnd(30) + rs.map((r) => (r.wholeGpu > 0 ? f2(r.wholeGpu) : '–').padStart(16)).join(''));
        L.push('CPU time in the frame'.padEnd(30) + rs.map((r) => f2(r.cpuMs).padStart(16)).join(''));
        L.push('frame cost (as measured)'.padEnd(30) + rs.map((r) => f2(r.costMs).padStart(16)).join(''));
      }
    }
    if (this.compiles) {
      const c = this.compiles, sum = c.each.reduce((a, x) => a + x.ms, 0);
      L.push('');
      L.push('== Shader compilation (each program built again from scratch, so no cache answers) ==');
      L.push(`all ${c.each.length} programs at once, as at start-up: ${(c.together / 1000).toFixed(2)} s · one after another: ${(sum / 1000).toFixed(2)} s`);
      for (const x of c.each.slice().sort((a, b) => b.ms - a.ms)) L.push(x.name.padEnd(22) + x.ms.toFixed(0).padStart(7) + ' ms');
      if (c.probes.length) {
        L.push('');
        L.push('experiments (temporary): cut-down variants of the slowest programs, to find what the compiler is slow at');
        for (const x of c.probes) L.push(x.name.padEnd(52) + x.ms.toFixed(0).padStart(7) + ' ms' + (x.ok ? '' : '   (did not link: ignore)'));
      }
    }
    L.push('');
    L.push('== Presets used ==');
    const used: Quality[] = [];
    for (const c of this.cases) if (!used.includes(c.q)) used.push(c.q);
    for (const q of used) {
      L.push(`${q.name}: scale ${q.scale} (min ${q.minScale}) · pixel ratio cap ${q.dpr} · MSAA ${q.msaa}x · SMAA ${q.smaa ? 'on' : 'off'} · bloom ${q.bloom} · distance x${q.dist} · scenery x${q.scenery} · woodland x${q.woods} · detail distance ${q.lod} m · ` +
        `terrain ${q.terrLite ? 'light' : 'full'} · particles x${q.particles} · weather x${q.weather} · lamp lights ${q.lamps} · effects ${q.lite ? 'simple' : 'full'} · sun shadows ${q.shadows || 'off'} · AO ${q.ssao ? 'on' : 'off'}`);
    }
    L.push('');
    L.push('fps per second of the measured runs, in order: ' + this.timeline.map((x) => x.toFixed(0)).join(' '));
    if (g.pacing) {
      L.push('');
      L.push('== Frame pacing (a frame on every Nth refresh; times from the start of the case. The rhythm is found during the warm-up, which lasts until it has stood for 2.5 s or 8 s are up; no faster one is tried in the 5 measured seconds) ==');
      for (const r of this.results) L.push(`${r.what.split(' (')[0]} / ${r.settings}: measured from ${r.warm.toFixed(1)} s, average ${r.rhythm.toFixed(1)} · ${r.paceLog}`);
    }
    L.push('');
    L.push('== Data (JSON, one line) ==');
    const round = (x: number) => Math.round(x * 100) / 100;
    L.push(JSON.stringify({
      v: __VERSION__, build: __BUILD_TIME__, when: stamp, gpu: gpuName, out: [R.canvas.width, R.canvas.height], dpr: devicePixelRatio, hz: Math.round(refresh), pace: g.pacing, syncMs: Math.round(this.syncMs * 1000) / 1000, stageSource: this.results[0]?.src ?? '',
      threads: nav.hardwareConcurrency ?? null, startupMs: Math.round(g.startupMs), compileMs: this.compiles ? { together: Math.round(this.compiles.together), each: Object.fromEntries(this.compiles.each.map((x) => [x.name, Math.round(x.ms)])), probes: Object.fromEntries(this.compiles.probes.map((x) => [x.name, x.ok ? Math.round(x.ms) : -1])) } : null, yours: { name: mine.name, diff: qualityDiff(mine) },
      cases: this.results.map((r) => ({
        track: r.track, settings: r.settings, res: r.res, fps: round(r.fps), low1: round(r.low1), p50: round(r.p50), p95: round(r.p95), p99: round(r.p99), worst: round(r.worst), hitches: r.hitches, rhythm: Math.round(r.rhythm * 100) / 100, paceLog: r.paceLog,
        warmS: round(r.warm), wholeGpu: round(r.wholeGpu), cpuMs: round(r.cpuMs), cpuP99: round(r.cpuP99), costMs: round(r.costMs), calls: Math.round(r.calls), instances: Math.round(r.instances), verts: Math.round(r.verts),
        stages: Object.fromEntries(r.stages.map((s) => [s.name, round(s.name.endsWith('(CPU)') ? s.cpu : Math.max(0, s.gpu))])),
      })),
    }));
    return { text: L.join('\n'), timeline: this.timeline, scaleLine: this.scaleLine, refresh };
  }
}
