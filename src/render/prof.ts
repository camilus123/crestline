// Frame profiler: CPU time and GPU time per section of a frame, plus draw counters.
//
// GPU time comes from EXT_disjoint_timer_query_webgl2 when the browser exposes it ('timer' mode). Where it does
// not (common on desktop Chrome), the benchmark's profiling phase uses 'sync' mode instead: the GPU is made to finish
// at every section boundary, so the wall time of a section includes the GPU's work. (gl.finish() does not actually
// wait in Chrome; reading back one pixel does, since it cannot return before all queued work is done.) That stalls
// the pipeline, so it is only used for a few seconds of the benchmark, never in normal play.

export const glStats = { calls: 0, instances: 0, verts: 0 };

export type ProfMode = 'off' | 'cpu' | 'timer' | 'sync';

const WHOLE = '\u0000whole';
interface PendingQuery { q: WebGLQuery; name: string }

export class Profiler {
  mode: ProfMode = 'off';
  /** accumulated milliseconds per section since reset() */
  cpu = new Map<string, number>();
  gpu = new Map<string, number>();
  gpuFrames = new Map<string, number>();
  frames = 0;
  /** 'timer' mode: every second frame is timed as a whole with one query in place of the per-stage ones (queries
   *  cannot overlap), so that the sum of the stages can be compared with the GPU's time for the entire frame */
  whole = false;
  wholeMs = 0;
  wholeN = 0;
  private wholeNow = false;
  private wholeQ: WebGLQuery | null = null;
  private tick = 0;
  calls = 0;
  instances = 0;
  verts = 0;
  private stack: { name: string; t: number; q: WebGLQuery | null }[] = [];
  private ext: any = undefined;
  private free: WebGLQuery[] = [];
  private pending: PendingQuery[] = [];
  /** sections ordered as first seen, for reports */
  order: string[] = [];

  private syncFB: WebGLFramebuffer | null = null;
  private px = new Uint8Array(4);
  constructor(private gl: WebGL2RenderingContext) {}

  /** block until the GPU has finished everything submitted so far */
  sync(): void {
    const gl = this.gl;
    if (!this.syncFB) {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      this.syncFB = gl.createFramebuffer();
      const prev = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.syncFB);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, prev);
    }
    // only the read binding changes, so whatever is being drawn into stays bound
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.syncFB);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.px);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
  }

  get timerAvailable(): boolean {
    if (this.ext === undefined) this.ext = this.gl.getExtension('EXT_disjoint_timer_query_webgl2') || null;
    return !!this.ext;
  }

  reset(): void {
    this.cpu.clear();
    this.gpu.clear();
    this.gpuFrames.clear();
    this.frames = 0;
    this.wholeMs = this.wholeN = 0;
    this.calls = this.instances = this.verts = 0;
    this.order = [];
  }

  frameStart(): void {
    glStats.calls = glStats.instances = glStats.verts = 0;
    if (this.mode === 'timer') this.poll();
    this.wholeNow = false;
    if (this.mode === 'timer' && this.whole && this.timerAvailable && this.stack.length === 0 && (this.tick++ & 1)) {
      this.wholeQ = this.free.pop() ?? this.gl.createQuery();
      if (this.wholeQ) { this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, this.wholeQ); this.wholeNow = true; }
    }
  }
  frameEnd(): void {
    if (this.wholeNow && this.wholeQ) {
      this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
      this.pending.push({ q: this.wholeQ, name: WHOLE });
      this.wholeQ = null;
      this.wholeNow = false;
    }
    if (this.mode === 'off') return;
    this.frames++;
    this.calls += glStats.calls;
    this.instances += glStats.instances;
    this.verts += glStats.verts;
  }

  /** sections must nest only one level deep in 'timer' mode (GPU queries cannot overlap) */
  begin(name: string): void {
    if (this.mode === 'off') return;
    if (!this.order.includes(name)) this.order.push(name);
    if (this.mode === 'sync') this.sync();
    let q: WebGLQuery | null = null;
    if (this.mode === 'timer' && !this.wholeNow && this.stack.length === 0 && this.timerAvailable) {
      q = this.free.pop() ?? this.gl.createQuery();
      if (q) this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    }
    this.stack.push({ name, t: performance.now(), q });
  }
  end(): void {
    if (this.mode === 'off') return;
    const s = this.stack.pop();
    if (!s) return;
    if (this.mode === 'sync') this.sync();
    const dt = performance.now() - s.t;
    this.cpu.set(s.name, (this.cpu.get(s.name) ?? 0) + dt);
    if (this.mode === 'sync') this.addGpu(s.name, dt);
    if (s.q) {
      this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
      this.pending.push({ q: s.q, name: s.name });
    }
  }
  private addGpu(name: string, ms: number): void {
    if (name === WHOLE) { this.wholeMs += ms; this.wholeN++; return; }
    this.gpu.set(name, (this.gpu.get(name) ?? 0) + ms);
    this.gpuFrames.set(name, (this.gpuFrames.get(name) ?? 0) + 1);
  }
  /** collect finished timer queries */
  poll(): void {
    const gl = this.gl;
    while (this.pending.length) {
      const p = this.pending[0];
      if (!gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE)) break;
      this.pending.shift();
      if (!gl.getParameter(this.ext.GPU_DISJOINT_EXT)) this.addGpu(p.name, gl.getQueryParameter(p.q, gl.QUERY_RESULT) / 1e6);
      this.free.push(p.q);
    }
  }
  /** wait (briefly) for outstanding timer queries, then stop */
  flush(): void {
    const t = performance.now();
    while (this.pending.length && performance.now() - t < 200) { this.sync(); this.poll(); }
  }
  /** per-frame averages */
  cpuAvg(name: string): number { return (this.cpu.get(name) ?? 0) / Math.max(1, this.frames); }
  get wholeAvg(): number { return this.wholeN ? this.wholeMs / this.wholeN : -1; }
  gpuAvg(name: string): number { const n = this.gpuFrames.get(name) ?? 0; return n ? (this.gpu.get(name) ?? 0) / n : -1; }
}
