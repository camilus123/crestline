// Detailed benchmark. A bot drives a heavy track at the current settings while the game measures where the
// time goes, in phases:
//   warm-up   2 s   shaders, caches, dynamic resolution settle
//   play     30 s   normal frames: frame-time distribution, hitches, CPU per stage, fps/resolution timeline
//                   (GPU time per pass too, when the browser exposes GPU timer queries)
//   profile   6 s   GPU time per render pass, measured by finishing the GPU after every pass (stalls; slower)
//   res-full  3 s   whole-frame cost at the preset's resolution (GPU finished every frame, not limited by vsync)
//   res-half  3 s   the same at half resolution: how much of the cost is per-pixel work
// The report ends with a verdict on what limits this device and which settings would help.

import type { Game } from './game';
import { QUALITY } from './render/renderer';

interface Phase { id: 'warm' | 'play' | 'profile' | 'full' | 'half'; dur: number; label: string }
const PHASES: Phase[] = [
  { id: 'warm', dur: 2, label: 'warming up' },
  { id: 'play', dur: 30, label: 'normal run' },
  { id: 'profile', dur: 6, label: 'profiling passes' },
  { id: 'full', dur: 3, label: 'resolution test 1/2' },
  { id: 'half', dur: 3, label: 'resolution test 2/2' },
];

export interface BenchReport { text: string; timeline: number[]; scaleLine: number[]; refresh: number }

const pct = (s: number[], p: number) => (s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0);
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const f1 = (x: number) => x.toFixed(1), f2 = (x: number) => x.toFixed(2);

export class Benchmark {
  private k = 0;
  private t = 0;
  private iv: number[] = [];
  private cpu: number[] = [];
  private scales: number[] = [];
  private secN = 0;
  private secT = 0;
  private secScale: number[] = [];
  timeline: number[] = [];
  scaleLine: number[] = [];
  private playCpu = new Map<string, number>();
  private playGpu = new Map<string, number>();
  private playOrder: string[] = [];
  private playFrames = 0;
  private playCalls = 0;
  private playInst = 0;
  private playVerts = 0;
  private profCpu = new Map<string, number>();
  private profGpu = new Map<string, number>();
  private profOrder: string[] = [];
  private cost: { full: number[]; half: number[] } = { full: [], half: [] };
  private fullScale = 1;
  private dynResWas = false;
  label = '';

  constructor(private g: Game, private done: (r: BenchReport) => void) {
    this.dynResWas = g.settings.dynRes;
    this.enter();
  }

  get phase(): Phase { return PHASES[this.k]; }
  /** the game must finish the GPU at the end of this frame (whole-frame cost, resolution tests) */
  get finishFrames(): boolean { return this.phase.id === 'full' || this.phase.id === 'half'; }
  /** the game must not touch the render scale (fixed by the test) */
  get holdScale(): boolean { return this.phase.id === 'full' || this.phase.id === 'half'; }

  private enter(): void {
    const R = this.g.renderer;
    const pf = R.prof;
    const id = this.phase.id;
    this.t = 0;
    pf.reset();
    if (id === 'warm') pf.mode = 'off';
    if (id === 'play') pf.mode = pf.timerAvailable ? 'timer' : 'cpu';
    if (id === 'profile') pf.mode = 'sync';
    if (id === 'full' || id === 'half') {
      pf.mode = 'off';
      // the resolution the play phase settled on (dynamic resolution included), then half of it
      this.fullScale = this.scales.length ? mean(this.scales) : R.quality.scale;
      R.forceScale = id === 'full' ? this.fullScale : this.fullScale * 0.5;
    }
  }

  private leave(): void {
    const pf = this.g.renderer.prof;
    const id = this.phase.id;
    if (id === 'play') {
      pf.flush();
      this.playOrder = pf.order.slice();
      for (const n of pf.order) { this.playCpu.set(n, pf.cpuAvg(n)); this.playGpu.set(n, pf.gpuAvg(n)); }
      this.playFrames = pf.frames;
      this.playCalls = pf.calls / Math.max(1, pf.frames);
      this.playInst = pf.instances / Math.max(1, pf.frames);
      this.playVerts = pf.verts / Math.max(1, pf.frames);
    }
    if (id === 'profile') {
      this.profOrder = pf.order.slice();
      for (const n of pf.order) { this.profCpu.set(n, pf.cpuAvg(n)); this.profGpu.set(n, pf.gpuAvg(n)); }
    }
  }

  /** called at the end of every frame; raw = wall-clock interval, cpuMs = time spent in this frame */
  frame(raw: number, cpuMs: number): void {
    const R = this.g.renderer;
    this.t += raw;
    const id = this.phase.id;
    if (id === 'play') {
      this.iv.push(raw);
      this.cpu.push(cpuMs);
      const sc = R.renderW / Math.max(1, R.canvas.width);
      this.scales.push(sc);
      this.secN++;
      this.secT += raw;
      this.secScale.push(sc);
      if (this.secT >= 1) {
        this.timeline.push(this.secN / this.secT);
        this.scaleLine.push(mean(this.secScale));
        this.secN = 0;
        this.secT = 0;
        this.secScale = [];
      }
    }
    if (id === 'full' || id === 'half') this.cost[id].push(cpuMs);
    const recent = this.iv.slice(-120);
    const fps = recent.length ? recent.length / recent.reduce((x, y) => x + y, 0) : 0;
    this.label = `BENCHMARK · ${this.phase.label} · ${Math.min(this.phase.dur, this.t).toFixed(1)} / ${this.phase.dur} s` + (id === 'play' ? ` · ${fps.toFixed(0)} fps` : '');
    if (this.t >= this.phase.dur) {
      this.leave();
      this.k++;
      if (this.k >= PHASES.length) this.finish();
      else this.enter();
    }
  }

  /** abandon (e.g. leaving the race): restore settings */
  restore(): void {
    const R = this.g.renderer;
    R.forceScale = null;
    R.prof.mode = 'off';
    this.g.settings.dynRes = this.dynResWas;
  }

  private finish(): void {
    this.restore();
    this.done(this.report());
  }

  private report(): BenchReport {
    const g = this.g, R = g.renderer, gl = R.gl;
    const refresh = g.refreshRate;
    const T = 1000 / refresh;
    const ms = this.iv.map((x) => x * 1000);
    const s = ms.slice().sort((a, b) => a - b);
    const avgMs = mean(ms);
    const low = (p: number) => { const w = s.slice(Math.floor(s.length * (1 - p))); return 1000 / Math.max(1e-3, mean(w)); };
    const med = pct(s, 0.5);
    const hitches = ms.filter((x) => x > Math.max(med * 2, 25));
    const below60 = ms.filter((x) => x > 1000 / 58).reduce((a, b) => a + b, 0) / Math.max(1, ms.reduce((a, b) => a + b, 0));
    const cpuS = this.cpu.slice().sort((a, b) => a - b);
    const sc = this.scales.slice().sort((a, b) => a - b);
    const q = R.quality;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const gpuName = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const gpuVendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    const nav = navigator as any;
    const full = mean(this.cost.full), half = mean(this.cost.half);
    const L: string[] = [];
    const line = (k: string, v: string) => L.push(k.padEnd(25) + v);
    L.push(`CRESTLINE v${__VERSION__} — detailed benchmark`);
    L.push(`${new Date().toISOString().slice(0, 19).replace('T', ' ')}   track TUORSWWUS14 (Futuristic, heavy), bot driving`);
    L.push('');
    L.push('== Result (30 s normal run) ==');
    line('average', `${f1(1000 / avgMs)} fps   (${f2(avgMs)} ms per frame)`);
    line('1% low / 0.1% low', `${f1(low(0.01))} / ${f1(low(0.001))} fps`);
    line('frame time p50/p95/p99', `${f2(med)} / ${f2(pct(s, 0.95))} / ${f2(pct(s, 0.99))} ms   worst ${f1(s[s.length - 1] ?? 0)} ms`);
    line('hitches', `${hitches.length} frames over ${f1(Math.max(med * 2, 25))} ms` + (hitches.length ? `  (worst ${f1(Math.max(...hitches))} ms)` : ''));
    line('time below 60 fps', `${f1(below60 * 100)} %`);
    line('display refresh', `~${refresh.toFixed(0)} Hz (estimated; frames cannot be faster than this)`);
    line('render resolution', `${f1(pct(sc, 0.5) * 100)} % of output (min ${f1((sc[0] ?? 0) * 100)} %, max ${f1((sc[sc.length - 1] ?? 0) * 100)} %)` + (g.settings.dynRes ? '  dynamic resolution on' : '  fixed'));
    L.push('');
    L.push('== Frame cost, not limited by vsync ==');
    line('at played resolution', `${f2(full)} ms  → could run ~${f1(1000 / Math.max(0.01, full))} fps`);
    line('at half resolution', `${f2(half)} ms  → could run ~${f1(1000 / Math.max(0.01, half))} fps`);
    line('CPU per frame', `${f2(mean(this.cpu))} ms average, p99 ${f2(pct(cpuS, 0.99))} ms (JavaScript: simulation, scene set-up, draw calls)`);
    line('draw calls per frame', `${this.playCalls.toFixed(0)}   instances ${this.playInst.toFixed(0)}   vertices ${(this.playVerts / 1e6).toFixed(2)} M`);
    L.push('');
    // per-pass breakdown: GPU from timer queries (play) if available, else from the synchronised profile phase
    const useTimer = [...this.playGpu.values()].some((v) => v >= 0);
    const order = useTimer ? this.playOrder : this.profOrder;
    const gpuOf = (n: string) => (useTimer ? this.playGpu.get(n) ?? -1 : this.profGpu.get(n) ?? -1);
    const cpuOf = (n: string) => this.playCpu.get(n) ?? 0;
    const rows = order.map((n) => ({ n, gpu: n.endsWith('(CPU)') ? -1 : gpuOf(n), cpu: cpuOf(n) }));
    const gpuSum = rows.reduce((a, r) => a + Math.max(0, r.gpu), 0);
    L.push(`== Time per stage (ms per frame; GPU column ${useTimer ? 'from GPU timer queries' : 'measured by finishing the GPU after each stage'}) ==`);
    L.push('stage'.padEnd(30) + 'CPU'.padStart(8) + 'GPU'.padStart(9) + '  share');
    for (const r of rows) {
      const share = gpuSum > 0 && r.gpu >= 0 ? (r.gpu / gpuSum) * 100 : 0;
      const cpuOnly = r.n.endsWith('(CPU)');
      L.push(r.n.padEnd(30) + f2(r.cpu).padStart(8) + (r.gpu >= 0 && !cpuOnly ? f2(r.gpu) : '–').padStart(9) + '  ' + (cpuOnly ? '' : '█'.repeat(Math.round(share / 4)).padEnd(26) + (share ? f1(share) + ' %' : '')));
    }
    L.push('');
    // verdict
    L.push('== What limits this device ==');
    const verdict: string[] = [];
    const fpsAvg = 1000 / avgMs;
    const atRefresh = fpsAvg > refresh * 0.95;
    const cpuAvg = mean(this.cpu);
    const pixel = full > 0 ? Math.max(0, 1 - half / full) : 0;
    if (atRefresh) verdict.push(`Runs at the display's refresh rate. Frame cost ${f2(full)} ms of a ${f2(T)} ms budget (${f1(Math.max(0, (1 - full / T) * 100))} % headroom).`);
    else verdict.push(`Below the display's refresh rate (${f1(fpsAvg)} of ~${refresh.toFixed(0)} fps).`);
    if (pixel > 0.4) verdict.push(`Mostly per-pixel GPU work: half resolution cuts the frame cost by ${f1(pixel * 100)} %. Lower Render scale / MSAA, keep Dynamic resolution on, or pick a lower preset.`);
    else if (cpuAvg > full * 0.6) verdict.push(`Mostly CPU (JavaScript) work: ${f2(cpuAvg)} ms of ${f2(full)} ms. Lower draw distance (preset) reduces scenery set-up; resolution changes will not help much.`);
    else verdict.push(`Mostly geometry / draw work (half resolution only saves ${f1(pixel * 100)} %): a preset with a shorter draw distance helps more than lowering resolution.`);
    const top = rows.filter((r) => r.gpu >= 0).sort((a, b) => b.gpu - a.gpu).slice(0, 3);
    if (top.length) verdict.push('Most expensive stages: ' + top.map((r) => `${r.n} ${f2(r.gpu)} ms`).join(', ') + '.');
    if (hitches.length > 5) verdict.push(`${hitches.length} hitches: occasional long frames (often garbage collection, shader compiles or background tasks).`);
    if (!atRefresh && q.name !== QUALITY[0].name) {
      const idx = QUALITY.findIndex((x) => x.name === q.name);
      verdict.push(`Suggestion: try the ${QUALITY[Math.max(0, idx - 1)].name} preset.`);
    }
    for (const v of verdict) L.push('• ' + v);
    L.push('');
    L.push('== Settings ==');
    line('preset', `${q.name}   render scale ${f1(q.scale * 100)} % (min ${f1(q.minScale * 100)} %)   MSAA ${q.msaa}x   bloom levels ${q.bloom}   draw distance ×${q.dist}`);
    line('extras', `particles ×${q.particles}   weather ×${q.weather}   scenery ×${q.scenery}   shadows ${q.shadows ? q.shadows + ' px map' : 'blob'}   AO ${q.ssao ? 'on' : 'off'}`);
    line('players', `${g.settings.players}`);
    L.push('');
    L.push('== Device ==');
    line('GPU', `${gpuName}  (${gpuVendor})`);
    line('WebGL', `${gl.getParameter(gl.VERSION)}   max samples ${gl.getParameter(gl.MAX_SAMPLES)}   max texture ${gl.getParameter(gl.MAX_TEXTURE_SIZE)}   HDR targets ${R.hdr ? 'yes' : 'no'}   GPU timers ${R.prof.timerAvailable ? 'yes' : 'no'}`);
    line('output', `${R.canvas.width}x${R.canvas.height} px (device pixel ratio ${devicePixelRatio})   screen ${screen.width}x${screen.height}`);
    line('CPU threads / memory', `${nav.hardwareConcurrency ?? '?'} / ${nav.deviceMemory ? nav.deviceMemory + ' GB' : '?'}`);
    line('browser', navigator.userAgent);
    L.push('');
    L.push('fps per second: ' + this.timeline.map((x) => x.toFixed(0)).join(' '));
    return { text: L.join('\n'), timeline: this.timeline, scaleLine: this.scaleLine, refresh };
  }
}
