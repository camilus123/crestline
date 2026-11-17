// Game controller: settings, sessions (arcade / championship), screen flow, the fixed-timestep loop,
// split-screen views, audio routing, dynamic resolution, F3 overlay and benchmark.

import { Audio } from './audio/audio';
import { Input, DEFAULT_BINDINGS, Bindings } from './input';
import { DT, NO_INPUT, CarInput } from './sim/car';
import { POINTS, Race, RaceCfg, RivalCfg } from './sim/race';
import { makeRivals } from './sim/roster';
import { decodeCode, normalizeCode, DEFAULT_CODE } from './track/codes';
import { COURSES, CourseKey } from './track/courses';
import { generateTrack, TrackData } from './track/generator';
import { hashString } from './core/rng';
import { QUALITY, Q_DEFAULT, Renderer, View, type Quality } from './render/renderer';
import { LOOKS } from './render/looks';
import { Hud, ord } from './ui/hud';
import { TouchControls } from './ui/touch';
import { Benchmark, type BenchReport } from './bench';
import { h, installStyle, store, toast } from './ui/dom';
import * as Screens from './ui/screens';

export type CourseSel = CourseKey | 'custom' | 'sequence';

export interface Settings {
  players: number;
  names: string[];
  manual: boolean[];
  accelButton: boolean[];
  cars: number[];
  colors: number[];
  mode: 'arcade' | 'championship';
  course: CourseSel;
  customCode: string;
  sequence: string;
  quality: number;
  qv?: number; // preset list version (2: Ultra Low added at the front, Psycho at the end)
  /** individual graphics options changed from the chosen preset (cleared when another preset is picked) */
  qo?: Partial<Quality>;
  dynRes: boolean;
  /** frame pacing (see Game.skipFrame); unset: on for touch-first devices, off elsewhere */
  pace?: boolean;
  musicVol: number;
  sfxVol: number;
  shake: boolean;
  fps: boolean;
  song: number; // -1 = effects only
}

const DEFAULTS: Settings = {
  players: 1, names: ['PLAYER 1', 'PLAYER 2'], manual: [false, false], accelButton: [false, false], cars: [0, 2], colors: [0, 1],
  mode: 'arcade', course: 'easy', customCode: DEFAULT_CODE, sequence: '', quality: Q_DEFAULT, dynRes: true, musicVol: 0.7, sfxVol: 0.85,
  shake: true, fps: false, song: 0, qv: 2,
};

export interface Session {
  mode: 'arcade' | 'championship';
  difficulty: number;
  courseKey: string;
  codes: string[];
  index: number;
  points: Map<string, number>;
  rivals: RivalCfg[];
  slots: number[];
  score: number[];
  results: { name: string; pos: number; time: number; points: number; isPlayer: boolean; color: number; car: number; projected: boolean }[][];
  over: boolean;
  won: boolean;
}

export class Game {
  renderer: Renderer;
  input = new Input();
  audio = new Audio();
  settings: Settings;
  session: Session | null = null;
  race: Race | null = null;
  hud: Hud | null = null;
  screen: Screens.Screen | null = null;
  screenId = '';
  acc = 0;
  last = 0;
  time = 0;
  paused = false;
  /** frames still to draw before going to sleep (window lost focus), and whether drawing has stopped */
  private sleepIn = 0;
  asleep = false;
  manual = false;
  frameTimes: number[] = [];
  f3: HTMLDivElement;
  /** race running in the background of menus */
  attract: Race | null = null;
  attractT = 0;
  attractCar = 0;
  /** showroom state for car select */
  showroom: { car: number; livery: number; angle: number } | null = null;
  menuLook = LOOKS[1];
  fade = 0;
  fadeTarget = 0;
  hit = [0, 0];
  private refresh = 1 / 60;
  private dtHist: number[] = [];
  private dynT = 0;
  // performance monitor: wall-clock frame intervals, CPU time spent in a frame, GPU time from timer queries
  private ivl: number[] = [];
  private cpuMs: number[] = [];
  private gpuMs: number[] = [];
  private gpuT: { ext: any; free: WebGLQuery[]; busy: WebGLQuery[] } | null | undefined;
  private benchEl: HTMLDivElement | null = null;
  // fullscreen: Keyboard Lock lets Esc reach the game (hold Esc to leave fullscreen); without it the browser
  // spends the first Esc press on leaving fullscreen, so that exit is treated as the press it was
  private fsExitByUs = false;
  touch: TouchControls;
  private mouseIdle = 0; // seconds since the mouse last moved; the cursor hides in a race when it isn't in use
  private escLocked = false;
  bench: Benchmark | null = null;
  private trackCache = new Map<string, TrackData>();
  idle = 0;
  bestScores: Record<string, { name: string; score: number }[]>;
  bestTimes: Record<string, { name: string; time: number }>;

  constructor(public canvas: HTMLCanvasElement, public ui: HTMLDivElement) {
    this.renderer = new Renderer(canvas);
    const saved = store.get<Partial<Settings>>('settings', {});
    // settings saved before Ultra Low existed stored the preset one position lower
    if (saved.quality !== undefined && !saved.qv) saved.quality += 1;
    this.settings = { ...DEFAULTS, ...saved, qv: 2 };
    const b = store.get<Bindings[] | null>('bindings', null);
    if (b && b.length === 2) this.input.bindings = b;
    this.bestScores = store.get('bestScores', {});
    this.bestTimes = store.get('bestTimes', {});
    // touch-first devices (phones, tablets) start on a lighter preset if nothing was saved yet
    if (!store.get('settings', null) && typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches) this.settings.quality = 0; // Ultra Low
    this.touch = new TouchControls(this.input, () => this.setPaused(true));
    this.f3 = h('div', { class: 'f3', style: 'display:none' });
    document.body.appendChild(this.f3);
    this.input.onFirstInput = () => {
      this.audio.init();
      this.audio.setVolumes(this.settings.musicVol, this.settings.sfxVol);
      if (this.screenId !== 'race' && this.settings.song >= 0 && this.audio.music && !this.audio.music.playing) this.audio.music.play(this.settings.song);
    };
    this.input.onKey = (e) => {
      if (e.code === 'F3') {
        e.preventDefault();
        this.settings.fps = !this.settings.fps;
        this.saveSettings();
      }
      if (e.code === 'F2') {
        e.preventDefault();
        this.toggleFullscreen();
      }
    };
    // Window not in focus: pause, draw a few more frames (so the pause menu is on the picture), then stop
    // drawing altogether until the window has focus again. The last picture stays on screen; the GPU idles.
    // (Not during the benchmark, which must run to its end.)
    // On phones and tablets a share sheet, a download prompt or the address bar takes focus away without ever
    // giving it back as an event: there the game only pauses, and any touch, key or return to the tab wakes it.
    const touch = matchMedia('(pointer: coarse)').matches;
    window.addEventListener('blur', () => { if (!this.bench) { this.setPaused(true, true); if (!touch) this.sleepIn = 4; } });
    const wakeUp = () => {
      this.sleepIn = 0;
      if (this.asleep) { this.asleep = false; this.last = 0; if (!this.manual) requestAnimationFrame((t) => this.frame(t)); }
    };
    window.addEventListener('focus', wakeUp);
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, wakeUp, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) wakeUp(); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.setPaused(true, true);
    });
    document.addEventListener('fullscreenchange', () => {
      if (document.fullscreenElement) { this.lockEsc(); return; }
      try { (navigator as any).keyboard?.unlock?.(); } catch { /* not supported */ }
      if (!this.fsExitByUs && !this.escLocked && document.hasFocus()) {
        if (this.screenId === 'race' && this.race && !this.paused) this.setPaused(true);
        else if (this.screenId !== 'race') this.input.menuQueue.push('back');
      }
      this.fsExitByUs = false;
      this.escLocked = false;
    });
    window.addEventListener('resize', () => this.layout());
    const wake = () => { this.mouseIdle = 0; document.body.classList.remove('nocursor'); };
    window.addEventListener('pointermove', wake);
    window.addEventListener('pointerdown', wake);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  saveSettings(): void {
    store.set('settings', this.settings);
    store.set('bindings', this.input.bindings);
  }

  toggleFullscreen(): void {
    try {
      if (document.fullscreenElement) {
        this.fsExitByUs = true;
        void document.exitFullscreen();
      } else {
        document.documentElement.requestFullscreen({ navigationUI: 'hide' } as any).catch(() => toast('Fullscreen is not available'));
      }
    } catch {
      toast('Fullscreen is not available');
    }
  }

  /** Chrome/Edge: deliver Esc to the game while fullscreen (the browser then asks you to hold Esc to exit). */
  private lockEsc(): void {
    const kb = (navigator as any).keyboard;
    if (!kb?.lock) return;
    kb.lock(['Escape']).then(() => { this.escLocked = !!document.fullscreenElement; }, () => { this.escLocked = false; });
  }

  async start(): Promise<void> {
    await installStyle();
    const q = new URLSearchParams(location.search);
    if (q.has('q')) this.renderer.setQuality(QUALITY[+q.get('q')!] ?? QUALITY[Q_DEFAULT]);
    else this.applyQuality();
    this.manual = q.has('manual');
    if (q.has('hashcheck')) {
      const { hashCheck } = await import('./track/hashcheck');
      const r = hashCheck();
      const pre = h('pre', { class: 'lcd', style: 'position:fixed;inset:2rem;overflow:auto;pointer-events:auto;font-size:13px;z-index:99' });
      pre.textContent = `CRESTLINE determinism check\n${r.lines.length} tracks · combined hash ${r.combined}\n(every browser must show the same value)\n\n` + r.lines.join('\n');
      document.body.appendChild(pre);
      return;
    }
    // test hooks: ?race=CODE&bot jumps straight into a race
    if (q.has('race') || q.has('code')) {
      const code = q.get('race') || q.get('code') || DEFAULT_CODE;
      this.settings.players = +(q.get('players') ?? 1);
      this.startSession(q.get('mode') === 'championship' ? 'championship' : 'arcade', 'custom', [code], q.has('bot'));
      this.enterRace(q.has('bot'));
    } else if (q.has('screen')) {
      this.startAttract();
      this.show(q.get('screen')!);
    } else {
      this.startAttract();
      this.show('title');
    }
    if (!this.manual) requestAnimationFrame((t) => this.frame(t));
  }

  track(code: string): TrackData {
    const c = normalizeCode(code).code;
    let t = this.trackCache.get(c);
    if (!t) {
      t = generateTrack(c);
      if (this.trackCache.size > 6) this.trackCache.clear();
      this.trackCache.set(c, t);
    }
    return t;
  }

  // ---------------------------------------------------------------- attract mode
  startAttract(code?: string): void {
    const codes = ['MKJLKJURJ01', 'ONLOMNTTN08', 'QQLOOQSVP20', 'MLJMKLSTK11', 'KHGIHFQRH12', 'OMJNMNTMN17', 'TUORRUVHT10', 'PPLONQSOP02'];
    const c = code ?? codes[Math.floor(Math.random() * codes.length)];
    const t = this.track(c);
    this.attract = new Race({
      track: t, mode: 'attract', difficulty: 1, players: [], rivals: makeRivals(hashString(c), 2).map((r) => ({ ...r, aggression: 0.2 })), playerSlots: [], fuel: false, seed: 3,
    });
    this.attract.countdown = 0.3;
    this.renderer.loadTrack(t);
    this.attractT = 0;
    this.attractCar = 0;
    this.menuLook = LOOKS[t.params.scenario];
  }

  // ---------------------------------------------------------------- screens
  show(id: string, arg?: any): void {
    if (this.screen) {
      const old = this.screen;
      old.el.classList.remove('on');
      setTimeout(() => old.el.remove(), 320);
      old.destroy?.();
    }
    this.screenId = id;
    this.idle = 0;
    this.input.typing = false;
    this.input.menuQueue.length = 0; // keys that triggered the change must not reach the new screen
    const S = Screens.build(this, id, arg);
    this.screen = S;
    if (S) {
      this.ui.appendChild(S.el);
      requestAnimationFrame(() => S.el.classList.add('on'));
    }
  }

  sfx = (k: 'move' | 'ok' | 'back' | 'error') => this.audio.ui(k);

  // ---------------------------------------------------------------- sessions
  courseCodes(mode: 'arcade' | 'championship', course: CourseSel): string[] {
    if (course === 'custom') return [this.settings.customCode || DEFAULT_CODE];
    if (course === 'sequence') {
      const list = this.settings.sequence.split(/[\n,;]+/).map((s) => s.trim()).filter((s) => s.length);
      return list.length ? list : [DEFAULT_CODE];
    }
    return COURSES[mode][course];
  }

  startSession(mode: 'arcade' | 'championship', course: CourseSel, codes?: string[], bot = false): void {
    const list = codes ?? this.courseCodes(mode, course);
    let difficulty = course === 'easy' ? 0 : course === 'medium' ? 1 : course === 'hard' ? 2 : 1;
    if (course === 'custom' || course === 'sequence') {
      const p = decodeCode(list[0]);
      difficulty = p.difficulty < 9 ? 0 : p.difficulty < 17 ? 1 : 2;
    }
    const n = this.settings.players;
    this.session = {
      mode, difficulty, courseKey: `${mode}:${course}${course === 'custom' ? ':' + normalizeCode(list[0]).code : ''}`, codes: list, index: 0,
      points: new Map(), rivals: makeRivals(hashString(mode + course + list.join('')), difficulty), slots: n > 1 ? [18, 19] : [19],
      score: new Array(n).fill(0), results: [], over: false, won: false,
    };
    (this.session as any).bot = bot;
  }

  /** set up the next race of the session (shown on the grid screen) */
  prepareRace(): Race {
    const S = this.session!;
    const code = S.codes[S.index];
    const track = this.track(code);
    const st = this.settings;
    const bot = !!(S as any).bot;
    const players = Array.from({ length: st.players }, (_, i) => ({
      name: st.names[i] || `PLAYER ${i + 1}`, car: st.cars[i] ?? 0, manual: st.manual[i], accelButton: st.accelButton[i], color: st.colors[i] ?? i, bot,
    }));
    const cfg: RaceCfg = {
      track, mode: S.mode, difficulty: S.difficulty, players, rivals: S.rivals, playerSlots: S.slots.slice(0, st.players),
      fuel: S.mode === 'championship', seed: hashString(code) ^ S.index,
    };
    return new Race(cfg);
  }

  enterRace(bot = false): void {
    if (!this.session) this.startSession(this.settings.mode, this.settings.course);
    this.input.players = this.settings.players;
    this.input.assignPads();
    if (bot) (this.session as any).bot = true;
    this.race = this.prepareRace();
    this.attract = null;
    this.renderer.loadTrack(this.race.cfg.track, this.race.cfg.fuel);
    this.hud?.destroy();
    this.hud = new Hud(this.ui, this.race.players.length);
    this.layout();
    this.acc = 0;
    this.fade = 1;
    this.fadeTarget = 0;
    this.show('race');
    this.audio.setEngines(this.race.players, 4);
    if (this.audio.music) {
      if (this.settings.song >= 0) this.audio.music.play(this.settings.song);
      else this.audio.music.stop();
    }
    this.hud.message(-1, 'GET READY', this.raceSubtitle(), 2600);
  }

  raceSubtitle(): string {
    const r = this.race!;
    const d = r.cfg.track;
    return `${d.scen.name.toUpperCase()} · ${d.circuit ? d.laps + ' LAPS' : d.checkpoints.length + ' STAGES'} · ${(d.raceLen / 1000).toFixed(1)} KM`;
  }

  quitRace(): void {
    this.audio.stopEngines();
    this.hud?.destroy();
    this.hud = null;
    this.race = null;
    this.session = null;
    this.paused = false;
    this.startAttract();
    this.show('setup');
  }

  restartRace(): void {
    if (!this.session) return;
    this.paused = false;
    this.enterRace();
  }

  setPaused(p: boolean, auto = false): void {
    if (this.screenId !== 'race' || !this.race) return;
    if (p === this.paused) return;
    if (p && this.bench) { this.cancelBenchmark(); return; } // a paused run would measure nothing useful
    if (!p && auto) return;
    this.paused = p;
    this.audio.pause(p);
    if (p) this.show('pause');
  }

  /** finish the race: points, qualification, next grid */
  finishRace(): void {
    const r = this.race!;
    const S = this.session!;
    const cls = r.classification();
    const res = cls.map((c, i) => ({
      name: c.car.name, pos: i + 1, time: c.time, points: S.mode === 'championship' ? POINTS[i] ?? 0 : 0, isPlayer: c.car.isPlayer,
      color: c.car.color, car: c.car.spec.id, projected: c.projected,
    }));
    S.results.push(res);
    for (const x of res) S.points.set(x.name, (S.points.get(x.name) ?? 0) + x.points);
    let qualified: boolean;
    if (S.mode === 'arcade') {
      for (let i = 0; i < r.players.length; i++) S.score[i] += Math.floor(r.score[i]);
      qualified = r.players.some((p) => p.finished);
    } else {
      qualified = r.players.some((p) => (res.find((x) => x.name === p.name)?.pos ?? 99) <= 10);
    }
    // reversed grid for the next race: 1st starts 20th ...
    S.slots = r.players.map((p) => {
      const pos = res.find((x) => x.name === p.name)?.pos ?? 20;
      return S.mode === 'championship' ? Math.min(19, 20 - pos) : 19 - r.players.indexOf(p);
    });
    if (S.slots.length > 1 && S.slots[0] === S.slots[1]) S.slots[1] = S.slots[0] === 19 ? 18 : S.slots[0] + 1;
    // best times / scores
    for (const p of r.players) {
      if (!p.finished) continue;
      const key = r.cfg.track.code;
      const best = this.bestTimes[key];
      if (!best || p.finishTime < best.time) this.bestTimes[key] = { name: p.name, time: p.finishTime };
    }
    store.set('bestTimes', this.bestTimes);
    S.index++;
    S.over = !qualified || S.index >= S.codes.length;
    S.won = qualified && S.index >= S.codes.length;
    if (S.over && S.mode === 'arcade') this.recordScore();
    this.audio.stopEngines();
    this.show('results', { qualified });
  }

  recordScore(): void {
    const S = this.session!;
    const key = S.courseKey;
    const list = this.bestScores[key] ?? [];
    S.score.forEach((sc, i) => list.push({ name: this.settings.names[i] || `PLAYER ${i + 1}`, score: sc }));
    list.sort((a, b) => b.score - a.score);
    this.bestScores[key] = list.slice(0, 5);
    store.set('bestScores', this.bestScores);
  }

  nextFromResults(): void {
    const S = this.session!;
    this.hud?.destroy();
    this.hud = null;
    this.race = null;
    this.startAttract();
    if (S.over) this.show('over');
    else this.show('grid');
  }

  // ---------------------------------------------------------------- layout
  viewRects(): [number, number, number, number][] {
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    const n = this.race?.players.length ?? 1;
    if (n <= 1) return [[0, 0, W, H]];
    const hh = Math.floor(H / 2);
    return [[0, 0, W, hh], [0, hh, W, H - hh]];
  }
  layout(): void {
    if (this.hud) this.hud.layout(this.viewRects(), this.canvas.clientHeight);
  }

  // ---------------------------------------------------------------- loop
  simulate(steps: number): void {
    for (let i = 0; i < steps; i++) this.stepSim();
  }
  renderOnce(dt = 1 / 60): void {
    this.race?.takeEvents(); // tests: drop queued HUD messages so screenshots are clean
    this.hud?.clearMessages();
    this.frame(performance.now(), dt);
  }

  private stepSim(): void {
    const r = this.race;
    if (!r) return;
    const inputs: CarInput[] = r.players.map((_, i) => this.input.carInput(i, { manual: this.settings.manual[i], accelButton: this.settings.accelButton[i] }));
    r.step(inputs.length ? inputs : [NO_INPUT]);
    if (r.over && !(r as any)._overT) (r as any)._overT = r.clock;
  }

  private handleRaceEvents(): void {
    const r = this.race!;
    const ev = r.takeEvents();
    for (const e of ev) {
      const pi = r.players.findIndex((p) => p.index === e.car);
      switch (e.t) {
        case 'beep': this.audio.beep(false); break;
        case 'go': this.audio.beep(true); this.hud?.message(-1, 'GO!', '', 900); break;
        case 'checkpoint': this.hud?.message(pi, 'CHECKPOINT', r.cfg.mode === 'arcade' ? `+${r.segTimes[e.value ?? 0] ?? 0} SECONDS` : '', 1800); break;
        case 'lap':
          if (r.cfg.mode !== 'arcade') this.hud?.message(pi, `LAP ${Math.min((e.value ?? 0) + 1, r.cfg.track.laps)}`, '', 1400);
          else this.hud?.message(pi, 'EXTENDED PLAY', `+${r.segTimes[e.value ?? 0] ?? 0} SECONDS`, 1800);
          break;
        case 'finallap': setTimeout(() => this.hud?.message(pi, 'FINAL LAP', '', 1600), 1500); break;
        case 'finish': this.hud?.message(pi, 'FINISHED', ord(r.players[pi]?.position ?? 0), 3000); break;
        case 'timeout': if (pi >= 0 && !(r.players[pi] as any)._to) { (r.players[pi] as any)._to = 1; this.hud?.message(pi, 'TIME UP', '', 3000); } break;
        case 'crash': case 'headon': if (pi >= 0) this.hit[pi] = 1; break;
      }
    }
    // per-car sounds
    const L = r.players;
    for (const c of r.cars) {
      const sev = (c as any).sndEv | 0;
      (c as any).sndEv = 0;
      if (!sev) continue;
      let near = false, pan = 0;
      for (const p of L) {
        const d = r.track.delta(p.s, c.s);
        if (Math.abs(d) < 60) { near = true; pan = Math.max(-1, Math.min(1, (c.x - p.x) / 8)); }
      }
      if (c.isPlayer || near) this.audio.events(c, sev, c.isPlayer ? 0 : pan);
    }
  }

  /** One frame. If anything in it throws, the error is still reported but the next frame is scheduled all the same:
   *  one bad frame must not leave a frozen picture with dead controls on top of it. */
  frame(now: number, forceDt?: number): void {
    if (forceDt === undefined && !this.manual && this.skipFrame(now)) { requestAnimationFrame((t) => this.frame(t)); return; }
    let done = false;
    try { this.frameBody(now, forceDt); done = true; }
    finally { if (!done && !this.manual && !this.asleep) requestAnimationFrame((t) => this.frame(t)); }
  }
  /** frame pacing is on: the setting if the player chose, otherwise on for touch-first devices only */
  get pacing(): boolean {
    if (this.settings.pace !== undefined) return this.settings.pace;
    return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
  }
  private fence: WebGLSync | null = null;
  private sinceDraw = 0;   // screen refreshes since the last frame was drawn
  private drawnAt = 0;     // when it was started (ms)
  /** frames are drawn on every paceN-th screen refresh */
  paceN = 1;
  private paceHold = 0;    // no attempt at a faster rhythm before this time (ms)
  private paceBack = 1500; // how long to wait before the next attempt (ms)
  private paceDrop = 0;    // when the last attempt started (ms)
  /**
   * Frame pacing. A browser lets the page hand over frames faster than the GPU finishes them; the surplus queues
   * up, and when the queue is full the browser stops the page for several refreshes at once (seen on a phone:
   * most frames 8-17 ms, every fifth 75-150 ms). So: no new frame is started while the GPU is still busy with
   * the last one (a fence object says when it has finished), and the rhythm that results (every 2nd refresh,
   * every 3rd) is held steady, not left to flip between two rhythms; now and then a faster rhythm is tried,
   * less often each time the attempt fails.
   * Returns true if this refresh is to be skipped.
   */
  private skipFrame(now: number): boolean {
    if (!this.pacing) {
      if (this.fence) { this.renderer.gl.deleteSync(this.fence); this.fence = null; }
      this.paceN = 1; this.sinceDraw = 0;
      return false;
    }
    const gl = this.renderer.gl;
    this.sinceDraw++;
    const busy = !!this.fence && gl.clientWaitSync(this.fence, 0, 0) === gl.TIMEOUT_EXPIRED;
    if (busy && now - this.drawnAt < 250) { // (a fence that never reports must not stop the game)
      if (this.sinceDraw >= this.paceN) {
        // the rhythm was too fast: slow it by one refresh, and wait longer before trying again if this was an attempt
        this.paceN = this.sinceDraw + 1;
        this.paceBack = now - this.paceDrop < 1000 ? Math.min(12000, this.paceBack * 2) : 1500;
        this.paceHold = now + this.paceBack;
      }
      return true;
    }
    if (this.sinceDraw < this.paceN) return true; // GPU idle, but keep the rhythm
    if (this.fence) { gl.deleteSync(this.fence); this.fence = null; }
    if (this.paceN > 1 && now > this.paceHold) { this.paceN--; this.paceDrop = now; this.paceHold = now + this.paceBack; }
    this.sinceDraw = 0;
    this.drawnAt = now;
    return false;
  }
  private frameBody(now: number, forceDt?: number): void {
    const t0 = performance.now();
    const monitor = this.settings.fps || !!this.bench;
    const pf = this.renderer.prof;
    if (this.bench) pf.frameStart();
    else if (monitor) this.gpuBegin(); // (the benchmark's profiler owns the GPU timer while it runs)
    const raw = this.last ? (now - this.last) / 1000 : 1 / 60;
    const dt = forceDt ?? Math.min(0.1, raw);
    this.last = now;
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 240) this.frameTimes.shift();
    this.dtHist.push(raw);
    if (this.dtHist.length > 90) this.dtHist.shift();
    this.input.poll(dt);
    // menus
    const keys = this.input.takeMenu();
    const scr = this.screen;
    for (const k of keys) {
      if (this.screen !== scr || !scr?.onKey) break;
      scr.onKey(k);
    }
    if (keys.length) this.idle = 0;
    this.idle += dt;
    this.screen?.update?.(dt);
    this.time += dt;
    // pause key in race
    if (this.screenId === 'race' && this.race) {
      for (let i = 0; i < this.race.players.length; i++) if (this.input.pressed('pause', i)) this.setPaused(true);
    }

    if (this.race) {
      const r = this.race;
      const live = this.screenId === 'race' || this.screenId === 'results';
      if (!this.paused && live) {
        this.acc += dt;
        let n = 0;
        pf.begin('simulation (CPU)');
        while (this.acc >= DT && n < 12) {
          this.stepSim();
          this.acc -= DT;
          n++;
        }
        pf.end();
        if (n >= 12) this.acc = 0;
        if (this.screenId === 'race') this.handleRaceEvents();
        else r.takeEvents();
        if (r.over && r.clock - (r as any)._overT > 3.5 && this.screenId === 'race') this.finishRace();
      }
      this.fade += (this.fadeTarget - this.fade) * Math.min(1, dt * 3);
      if (this.manual) this.fade = 0;
      this.hit = this.hit.map((x) => Math.max(0, x - dt * 2.5));
      const rects = this.viewRects();
      const views: View[] = r.players.map((p, i) => ({ car: p, rect: rects[i], shake: this.settings.shake ? 1 : 0 }));
      this.renderer.render({ race: r, alpha: this.acc / DT, time: this.time, dt: this.paused ? 0 : dt, views, fade: this.fade, hit: this.hit });
      pf.begin('HUD, audio (CPU)');
      if (!this.paused && this.screenId === 'race') this.hud?.update(r, dt);
      if (this.hud) this.hud.root.style.display = this.screenId === 'race' ? '' : 'none';
      // thunder
      const tq = this.renderer.thunderQueue;
      while (tq.length && tq[0].at <= this.time) this.audio.thunder(tq.shift()!.power);
      const look = this.renderer.look;
      this.audio.update(r.players, r.cars, (a, b) => r.track.delta(a, b), { rain: look.rain, wind: r.scen === 11 ? 1 : 0, scen: r.scen }, r.started && !this.paused && this.screenId === 'race');
      pf.end();
    } else if (this.showroom) {
      const s = this.showroom;
      s.angle += dt * 0.35;
      this.renderer.renderShowroom(s.car, s.livery, s.angle, this.time, this.menuLook);
    } else if (this.attract) {
      // attract race in the background of menus
      const a = this.attract;
      this.acc += dt;
      let n = 0;
      while (this.acc >= DT && n < 8) {
        a.step([]);
        this.acc -= DT;
        n++;
      }
      if (n >= 8) this.acc = 0;
      this.attractT += dt;
      const leaders = a.cars.slice().sort((x, y) => y.dist - x.dist);
      if (this.attractT > 9) {
        this.attractT = 0;
        this.attractCar = (this.attractCar + 1 + Math.floor(Math.random() * 4)) % 8;
      }
      const car = leaders[Math.min(this.attractCar, leaders.length - 1)];
      if (car.dist > a.cfg.track.raceLen - 300 || a.clock > 240) this.startAttract();
      const orbit = this.attractT < 3.5 && Math.floor(this.time / 9) % 2 === 0 ? this.time : undefined;
      this.renderer.render({ race: a, alpha: this.acc / DT, time: this.time, dt, views: [{ car, rect: [0, 0, this.canvas.clientWidth, this.canvas.clientHeight], shake: 0.5 }], fade: 0, hit: [0], attract: true, orbit });
      if (this.screenId === 'setup' && this.idle > 45) this.show('title');
    }
    const padUsed = this.input.padUsed;
    this.input.padUsed = false;
    this.touch.update(this.screenId === 'race' && !this.paused && !!this.race, this.settings.manual[0], padUsed);
    this.mouseIdle += raw;
    const hideCursor = this.screenId === 'race' && !this.paused && this.mouseIdle > 1.2;
    if (hideCursor !== document.body.classList.contains('nocursor')) document.body.classList.toggle('nocursor', hideCursor);
    if (!this.bench?.holdScale) this.dynamicResolution(raw);
    if (this.bench?.finishFrames) this.renderer.prof.sync(); // whole-frame cost incl. the GPU (resolution test)
    if (monitor && !this.bench) this.gpuEnd();
    if (monitor) {
      this.ivl.push(raw);
      if (this.ivl.length > 480) this.ivl.shift();
      this.cpuMs.push(performance.now() - t0);
      if (this.cpuMs.length > 240) this.cpuMs.shift();
    }
    // start-up time: page start to the end of the third frame (by then every shader has been compiled and used)
    if (this.startFrames < 3 && ++this.startFrames === 3) { this.renderer.prof.sync(); this.startupMs = performance.now(); }
    this.overlay();
    if (this.bench) {
      const b = this.bench;
      pf.frameEnd();
      b.frame(raw, performance.now() - t0);
      if (this.benchEl) this.benchEl.textContent = b.label;
    }
    if (this.pacing && !this.manual && forceDt === undefined) {
      const gl = this.renderer.gl;
      if (this.fence) gl.deleteSync(this.fence);
      this.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush(); // (without this the fence may never be sent to the GPU)
    }
    if (this.sleepIn > 0 && !this.bench && --this.sleepIn === 0) { this.asleep = true; return; }
    if (!this.manual) requestAnimationFrame((t) => this.frame(t));
  }

  // GPU frame time via EXT_disjoint_timer_query_webgl2 (results arrive a few frames late)
  private gpuBegin(): void {
    const gl = this.renderer.gl;
    if (this.gpuT === undefined) {
      const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      this.gpuT = ext ? { ext, free: [], busy: [] } : null;
    }
    const T = this.gpuT;
    if (!T) return;
    while (T.busy.length) {
      const q = T.busy[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      T.busy.shift();
      const disjoint = gl.getParameter(T.ext.GPU_DISJOINT_EXT);
      if (!disjoint) {
        this.gpuMs.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
        if (this.gpuMs.length > 240) this.gpuMs.shift();
      }
      T.free.push(q);
    }
    if (T.busy.length > 6) return;
    const q = T.free.pop() ?? gl.createQuery();
    if (!q) return;
    gl.beginQuery(T.ext.TIME_ELAPSED_EXT, q);
    T.busy.push(q);
    (T as any).open = true;
  }
  private gpuEnd(): void {
    const T = this.gpuT as any;
    if (!T?.open) return;
    this.renderer.gl.endQuery(T.ext.TIME_ELAPSED_EXT);
    T.open = false;
  }

  private startFrames = 0;
  /** milliseconds from page start until the game had drawn three frames (0 until then) */
  startupMs = 0;
  private refreshBest = 1 / 30;
  private dynHold = 0;
  private dynBackoff = 2;
  /**
   * Dynamic resolution: hold the frame rate at the screen's refresh rate (60 fps on the light presets, even on a
   * faster screen) by lowering the render resolution, and raise it again only cautiously.
   *  - The refresh interval is the shortest frame interval the device has sustained (a slow device that never
   *    reaches its refresh rate must not be taken for a slow screen, or the scaler would never act).
   *  - Dropped frames lower the resolution at once, in proportion to how far behind the frame rate is.
   *  - With vsync a frame that is on time says nothing about headroom, so raising is a probe: one small step
   *    after a quiet spell, and every probe that ends in dropped frames makes the next one wait longer.
   */
  private dynamicResolution(raw: number): void {
    // refresh interval estimate (always, the monitor shows it): low percentile of recent frame intervals
    const s = this.dtHist.slice().sort((a, b) => a - b);
    if (s.length > 30) {
      this.refresh = Math.max(1 / 500, s[Math.floor(s.length * 0.1)]);
      this.refreshBest = Math.min(this.refreshBest, this.refresh);
    }
    if (!this.settings.dynRes || this.manual) {
      this.renderer.dynScale = this.renderer.quality.scale;
      return;
    }
    this.dynT += raw;
    if (this.dynT < 0.25) return;
    const step = this.dynT;
    this.dynT = 0;
    const recent = this.dtHist.slice(-20);
    const avg = recent.reduce((a, b) => a + b, 0) / Math.max(1, recent.length);
    const q = this.renderer.quality;
    const target = Math.max(this.refreshBest, q.cap60 ? 1 / 60 : 0);
    const over = avg / target;
    let sc = this.renderer.dynScale;
    if (over > 1.1) {
      sc -= Math.max(0.03, Math.min(0.12, (over - 1) * 0.25));
      this.dynHold = this.dynBackoff;
      this.dynBackoff = Math.min(20, this.dynBackoff * 1.6);
    } else if (over < 1.04) {
      this.dynHold -= step;
      if (this.dynHold <= 0) {
        sc += 0.02;
        this.dynBackoff = Math.max(2, this.dynBackoff * 0.97);
      }
    }
    this.renderer.dynScale = Math.max(q.minScale, Math.min(q.scale, sc));
  }

  private overlay(): void {
    const on = this.settings.fps;
    this.f3.style.display = on ? '' : 'none';
    if (!on) return;
    // last second of wall-clock frame intervals
    const ft: number[] = [];
    let sum = 0;
    for (let i = this.ivl.length - 1; i >= 0 && sum < 1; i--) { ft.push(this.ivl[i]); sum += this.ivl[i]; }
    const avg = sum / Math.max(1, ft.length);
    const worst = ft.length ? Math.max(...ft) : 0;
    const sorted = ft.slice().sort((a, b) => b - a);
    const low = sorted.slice(0, Math.max(1, Math.ceil(sorted.length * 0.01)));
    const lowFps = low.length ? low.length / low.reduce((a, b) => a + b, 0) : 0;
    const mean = (a: number[]) => a.slice(-120).reduce((x, y) => x + y, 0) / Math.max(1, Math.min(120, a.length));
    const cpu = mean(this.cpuMs), gpu = this.gpuMs.length ? mean(this.gpuMs) : -1;
    const R = this.renderer;
    this.f3.textContent =
      `FPS        ${(1 / avg).toFixed(1)}  (1% low ${lowFps.toFixed(0)})\n` +
      `frame      ${(avg * 1000).toFixed(2)} ms  (max ${(worst * 1000).toFixed(2)})\n` +
      `CPU        ${cpu.toFixed(2)} ms   GPU ${gpu >= 0 ? gpu.toFixed(2) + ' ms' : 'n/a'}\n` +
      `headroom   ${gpu >= 0 ? Math.max(0, (1 - Math.max(cpu, gpu) / (avg * 1000)) * 100).toFixed(0) + ' %' : 'n/a'}\n` +
      `render     ${R.renderW}×${R.renderH}  (${Math.round((R.renderW / this.canvas.width) * 100)}%)\n` +
      `output     ${this.canvas.width}×${this.canvas.height}\n` +
      `version    ${__VERSION__}  build ${__BUILD_TIME__.slice(5, 16).replace('T', ' ')} UTC\n` +
      `preset     ${R.quality.name}${this.settings.dynRes ? '  dyn-res' : ''}  MSAA ${R.quality.msaa}x\n` +
      `refresh    ~${(1 / this.refresh).toFixed(0)} Hz  (estimated from frame timing)`;
  }

  // ---------------------------------------------------------------- benchmark
  private benchSaved: Partial<Settings> | null = null;
  startBenchmark(done: (report: BenchReport) => void): void {
    // the same conditions on every run: one player, the same car, no music restarts
    const st = this.settings;
    this.benchSaved = { players: st.players, cars: st.cars.slice(), colors: st.colors.slice(), manual: st.manual.slice(), song: st.song };
    st.players = 1; st.cars[0] = 0; st.colors[0] = 0; st.manual[0] = false; st.song = -1;
    this.cpuMs.length = 0;
    this.gpuMs.length = 0;
    this.benchEl?.remove();
    this.benchEl = h('div', { class: 'benchbar' });
    document.body.appendChild(this.benchEl);
    this.bench = new Benchmark(this, (rep) => {
      this.benchEl?.remove();
      this.benchEl = null;
      this.bench = null;
      this.audio.stopEngines();
      this.hud?.destroy();
      this.hud = null;
      this.race = null;
      this.session = null;
      this.startAttract();
      done(rep);
    });
  }
  /** benchmark: start one case (a track at a set of quality options) */
  benchRace(code: string, q: Quality): void {
    this.session = null;
    this.startSession('arcade', 'custom', [code], true);
    this.renderer.setQuality(q);
    this.enterRace(true);
    this.race!.countdown = 0.01; // skip the countdown
    this.paused = false;
    // nothing may cover the race while it is measured
    for (const e of Array.from(this.ui.querySelectorAll('.scr'))) if (e !== this.screen?.el) e.remove();
  }
  /** benchmark over or abandoned: the player's own settings again */
  benchRestore(): void {
    if (this.benchSaved) Object.assign(this.settings, this.benchSaved);
    this.benchSaved = null;
    this.applyQuality();
  }

  /** the chosen preset with the player's own changes to individual options on top */
  effectiveQuality(): Quality {
    const base = QUALITY[this.settings.quality] ?? QUALITY[Q_DEFAULT];
    const o = this.settings.qo ?? {};
    const changed = (Object.keys(o) as (keyof Quality)[]).some((k) => o[k] !== base[k]);
    return changed ? { ...base, ...o, name: base.name + ' (custom)' } : base;
  }
  applyQuality(): void { this.renderer.setQuality(this.effectiveQuality()); }

  cancelBenchmark(): void {
    if (!this.bench) return;
    this.bench.restore();
    this.bench = null;
    this.benchEl?.remove();
    this.benchEl = null;
    this.audio.stopEngines();
    this.hud?.destroy();
    this.hud = null;
    this.race = null;
    this.session = null;
    this.startAttract();
    this.show('bench');
    toast('Benchmark cancelled');
  }
  /** display refresh rate estimated from frame timing (Hz) */
  get refreshRate(): number { return 1 / this.refresh; }
}
