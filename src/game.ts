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
import { QUALITY, Renderer, View } from './render/renderer';
import { LOOKS } from './render/looks';
import { Hud, ord } from './ui/hud';
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
  dynRes: boolean;
  musicVol: number;
  sfxVol: number;
  shake: boolean;
  fps: boolean;
  song: number; // -1 = effects only
}

const DEFAULTS: Settings = {
  players: 1, names: ['PLAYER 1', 'PLAYER 2'], manual: [false, false], accelButton: [false, false], cars: [0, 2], colors: [0, 1],
  mode: 'arcade', course: 'easy', customCode: DEFAULT_CODE, sequence: '', quality: 2, dynRes: true, musicVol: 0.7, sfxVol: 0.85,
  shake: true, fps: false, song: 0,
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
  private escLocked = false;
  bench: { t: number; frames: number[]; done: (r: string) => void } | null = null;
  private trackCache = new Map<string, TrackData>();
  idle = 0;
  bestScores: Record<string, { name: string; score: number }[]>;
  bestTimes: Record<string, { name: string; time: number }>;

  constructor(public canvas: HTMLCanvasElement, public ui: HTMLDivElement) {
    this.renderer = new Renderer(canvas);
    this.settings = { ...DEFAULTS, ...store.get<Partial<Settings>>('settings', {}) };
    const b = store.get<Bindings[] | null>('bindings', null);
    if (b && b.length === 2) this.input.bindings = b;
    this.bestScores = store.get('bestScores', {});
    this.bestTimes = store.get('bestTimes', {});
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
    window.addEventListener('blur', () => { if (!this.bench) this.setPaused(true, true); });
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
    this.renderer.setQuality(QUALITY[+(q.get('q') ?? this.settings.quality)] ?? QUALITY[2]);
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
      fuel: S.mode === 'championship' && track.raceLen > 15000, seed: hashString(code) ^ S.index,
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
    this.renderer.loadTrack(this.race.cfg.track);
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

  frame(now: number, forceDt?: number): void {
    const t0 = performance.now();
    const monitor = this.settings.fps || !!this.bench;
    if (monitor) this.gpuBegin();
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
        while (this.acc >= DT && n < 12) {
          this.stepSim();
          this.acc -= DT;
          n++;
        }
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
      if (!this.paused && this.screenId === 'race') this.hud?.update(r, dt);
      if (this.hud) this.hud.root.style.display = this.screenId === 'race' ? '' : 'none';
      // thunder
      const tq = this.renderer.thunderQueue;
      while (tq.length && tq[0].at <= this.time) this.audio.thunder(tq.shift()!.power);
      const look = this.renderer.look;
      this.audio.update(r.players, r.cars, (a, b) => r.track.delta(a, b), { rain: look.rain, wind: r.scen === 11 ? 1 : 0, scen: r.scen }, r.started && !this.paused && this.screenId === 'race');
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
    this.dynamicResolution(raw);
    if (monitor) {
      this.gpuEnd();
      this.ivl.push(raw);
      if (this.ivl.length > 480) this.ivl.shift();
      this.cpuMs.push(performance.now() - t0);
      if (this.cpuMs.length > 240) this.cpuMs.shift();
    }
    this.overlay();
    if (this.bench) this.benchTick(raw);
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

  private dynamicResolution(raw: number): void {
    // refresh interval estimate (always, the monitor shows it): low percentile of recent frame intervals
    const s = this.dtHist.slice().sort((a, b) => a - b);
    if (s.length > 30) this.refresh = Math.max(1 / 500, s[Math.floor(s.length * 0.1)]);
    if (!this.settings.dynRes || this.manual) {
      this.renderer.dynScale = this.renderer.quality.scale;
      return;
    }
    this.dynT += raw;
    if (this.dynT < 0.25) return;
    this.dynT = 0;
    const recent = this.dtHist.slice(-20);
    const avg = recent.reduce((a, b) => a + b, 0) / Math.max(1, recent.length);
    const q = this.renderer.quality;
    let sc = this.renderer.dynScale;
    if (avg > this.refresh * 1.25) sc -= 0.05;
    else if (avg < this.refresh * 1.06) sc += 0.02;
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
      `preset     ${R.quality.name}${this.settings.dynRes ? '  dyn-res' : ''}  MSAA ${R.quality.msaa}x\n` +
      `refresh    ~${(1 / this.refresh).toFixed(0)} Hz  (estimated from frame timing)`;
  }

  // ---------------------------------------------------------------- benchmark
  startBenchmark(done: (report: string) => void): void {
    this.settings.players = this.settings.players;
    this.session = null;
    this.startSession('arcade', 'custom', ['TUORSWWUS14'], true);
    this.enterRace(true);
    // skip the countdown
    this.race!.countdown = 0.01;
    this.paused = false;
    // nothing may cover the race while it is measured
    for (const e of Array.from(this.ui.querySelectorAll('.scr'))) if (e !== this.screen?.el) e.remove();
    this.bench = { t: 0, frames: [], done };
    this.cpuMs.length = 0;
    this.gpuMs.length = 0;
    this.benchEl?.remove();
    this.benchEl = h('div', { class: 'benchbar' });
    document.body.appendChild(this.benchEl);
  }
  private benchTick(raw: number): void {
    const b = this.bench!;
    b.t += raw;
    if (b.t > 2) b.frames.push(raw);
    if (this.benchEl) {
      const recent = b.frames.slice(-120);
      const fps = recent.length ? recent.length / recent.reduce((x, y) => x + y, 0) : 0;
      this.benchEl.textContent = b.t < 2 ? 'BENCHMARK · warming up' : `BENCHMARK · ${Math.min(30, b.t - 2).toFixed(1)} / 30 s · ${fps.toFixed(0)} fps`;
    }
    if (b.t >= 32) {
      this.benchEl?.remove();
      this.benchEl = null;
      const f = b.frames.slice().sort((x, y) => x - y);
      const avg = f.reduce((x, y) => x + y, 0) / f.length;
      const p99 = f[Math.floor(f.length * 0.99)] ?? avg;
      const low1 = f.slice(Math.floor(f.length * 0.99));
      const low1fps = 1 / (low1.reduce((x, y) => x + y, 0) / Math.max(1, low1.length));
      const gl = this.renderer.gl;
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      const R = this.renderer;
      const report = [
        `CRESTLINE benchmark (30 s)`,
        `average      ${(1 / avg).toFixed(1)} fps   ${(avg * 1000).toFixed(2)} ms`,
        `1% low       ${low1fps.toFixed(1)} fps`,
        `99th pct     ${(p99 * 1000).toFixed(2)} ms`,
        `frames       ${f.length}`,
        `CPU / frame  ${(this.cpuMs.reduce((x, y) => x + y, 0) / Math.max(1, this.cpuMs.length)).toFixed(2)} ms (last 240 frames)`,
        `GPU / frame  ${this.gpuMs.length ? (this.gpuMs.reduce((x, y) => x + y, 0) / this.gpuMs.length).toFixed(2) + ' ms (last 240 frames)' : 'n/a (no GPU timer in this browser)'}`,
        `output       ${this.canvas.width}x${this.canvas.height}`,
        `render       ${R.renderW}x${R.renderH} (last)  preset ${R.quality.name} MSAA ${R.quality.msaa}x dyn-res ${this.settings.dynRes ? 'on' : 'off'}`,
        `refresh est  ${(1 / this.refresh).toFixed(0)} Hz`,
        `GPU          ${gpu}`,
        `browser      ${navigator.userAgent}`,
      ].join('\n');
      const done = b.done;
      this.bench = null;
      this.audio.stopEngines();
      this.hud?.destroy();
      this.hud = null;
      this.race = null;
      this.session = null;
      this.startAttract();
      done(report);
    }
  }
}
