// Game shell (greybox stage): fixed-timestep loop, quick race, debug overlay.
import { Input } from './input';
import { DT, NO_INPUT } from './sim/car';
import { Race, RaceCfg } from './sim/race';
import { makeRivals } from './sim/roster';
import { generateTrack } from './track/generator';
import { DEFAULT_CODE } from './track/codes';
import { QUALITY, Renderer, View } from './render/renderer';

export class Game {
  renderer: Renderer;
  input = new Input();
  race: Race | null = null;
  acc = 0;
  last = 0;
  time = 0;
  paused = false;
  frameTimes: number[] = [];
  overlay: HTMLDivElement;
  bot = false;
  manual = false;
  /** render a single frame (tests) */
  renderOnce(dt = 1 / 60): void {
    this.last = 0;
    this.frame(performance.now(), dt);
  }
  constructor(public canvas: HTMLCanvasElement, public ui: HTMLDivElement) {
    this.renderer = new Renderer(canvas);
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = 'position:fixed;left:8px;top:8px;font:12px monospace;color:#0f0;background:#0008;padding:4px 6px;white-space:pre;z-index:9';
    ui.appendChild(this.overlay);
    window.addEventListener('blur', () => (this.paused = true));
    window.addEventListener('focus', () => (this.paused = false));
  }
  async start(): Promise<void> {
    const q = new URLSearchParams(location.search);
    const code = q.get('code') || DEFAULT_CODE;
    this.bot = q.has('bot');
    this.renderer.setQuality(QUALITY[+(q.get('q') ?? 2)]);
    this.quickRace(code, q.has('mode') ? (q.get('mode') as any) : 'arcade');
    this.manual = q.has('manual');
    if (!this.manual) requestAnimationFrame((t) => this.frame(t));
  }
  quickRace(code: string, mode: 'arcade' | 'championship'): void {
    const track = generateTrack(code);
    const cfg: RaceCfg = {
      track, mode, difficulty: 1,
      players: [{ name: 'PLAYER', car: 0, manual: false, accelButton: false, color: 0, bot: this.bot }],
      rivals: makeRivals(7, 1), playerSlots: [19], fuel: false, seed: 1,
    };
    this.race = new Race(cfg);
    this.renderer.loadTrack(track);
  }
  /** advance the simulation n steps (testing) */
  simulate(steps: number): void {
    for (let i = 0; i < steps; i++) this.stepSim();
  }
  private stepSim(): void {
    const r = this.race!;
    const inp = [this.input.carInput(0, { manual: false, accelButton: false })];
    r.step(this.bot ? [NO_INPUT] : inp);
    for (const c of r.cars) (c as any).fxEv = ((c as any).fxEv | 0) | c.events;
  }
  frame(now: number, forceDt?: number): void {
    const dt = forceDt ?? Math.min(0.1, this.last ? (now - this.last) / 1000 : 1 / 60);
    this.last = now;
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 120) this.frameTimes.shift();
    this.input.poll(dt);
    if (!this.paused && this.race) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= DT && n < 12) {
        this.stepSim();
        this.acc -= DT;
        n++;
      }
      if (n >= 12) this.acc = 0;
      this.time += dt;
    }
    if (this.race) {
      const r = this.race;
      const views: View[] = [{ car: r.players[0], rect: [0, 0, this.canvas.clientWidth, this.canvas.clientHeight], shake: 1 }];
      this.renderer.render({ race: r, alpha: this.acc / DT, time: this.time, dt, views, fade: 0, hit: [0] });
      const p = r.players[0];
      const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
      this.overlay.textContent = `fps ${(1 / avg).toFixed(0)}  ${this.renderer.renderW}x${this.renderer.renderH}\n${(p.v * 3.6).toFixed(0)} km/h  gear ${p.gear}  rpm ${p.rpm.toFixed(0)}\npos ${p.position}  t ${r.time.toFixed(1)}  left ${r.timeLeft[0]?.toFixed(1)}`;
    }
    if (!this.manual) requestAnimationFrame((t) => this.frame(t));
  }
}
