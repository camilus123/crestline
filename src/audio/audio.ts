// Web Audio: layered synthesized engines, tyres, surfaces, rumble, wind, rain, thunder, impacts,
// passing cars, start beeps and UI sounds. Everything is generated at runtime – no samples.

import { Car, EV_CONE, EV_CRASH, EV_JUMP, EV_LAND, EV_LASER, EV_POTHOLE, EV_SCRAPE, EV_SHIFT, EV_SHUNT, EV_SPLASH, Spray } from '../sim/car';
import { Music } from './music';

type Buf = AudioBuffer;

function noiseBuffer(ctx: BaseAudioContext, secs: number, color: 'white' | 'pink' | 'brown' = 'white'): Buf {
  const n = Math.floor(ctx.sampleRate * secs);
  const b = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = b.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (color === 'white') d[i] = w;
    else if (color === 'pink') {
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    } else {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
  }
  // crossfade the loop seam
  const f = Math.min(2000, n >> 3);
  for (let i = 0; i < f; i++) {
    const t = i / f;
    d[i] = d[i] * t + d[n - f + i] * (1 - t);
  }
  return b;
}

/** Engine loop: an integer number of 4-stroke cycles at baseRpm so it loops seamlessly. */
function engineBuffer(ctx: BaseAudioContext, cyl: number, baseRpm: number, kind: number, load: boolean): Buf {
  const sr = ctx.sampleRate;
  const cycleHz = baseRpm / 60 / 2; // one full 4-stroke cycle
  const cycles = Math.round(cycleHz * 1.2);
  const n = Math.round((cycles / cycleHz) * sr);
  const b = ctx.createBuffer(1, n, sr);
  const d = b.getChannelData(0);
  const fire = cycleHz * cyl; // firing frequency
  // per-cylinder amplitude/phase variation gives the characteristic "beat"
  const amp: number[] = [], jit: number[] = [];
  let seed = cyl * 977 + kind * 31 + (load ? 7 : 0);
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let c = 0; c < cyl; c++) {
    amp.push(0.75 + rnd() * 0.5);
    jit.push((rnd() - 0.5) * 0.06);
  }
  const period = sr / fire;
  const decay = kind === 1 ? 0.0016 : kind === 0 ? 0.0011 : 0.0009; // seconds of each pulse
  const res1 = kind === 1 ? 2.9 : kind === 0 ? 2.1 : 3.4; // exhaust resonance in multiples of firing freq
  const res2 = kind === 1 ? 6.3 : 4.7;
  for (let i = 0; i < n; i++) d[i] = 0;
  const pulses = Math.floor(n / period);
  for (let p = 0; p < pulses; p++) {
    const c = p % cyl;
    const start = Math.floor((p + jit[c]) * period);
    const A = amp[c] * (load ? 1 : 0.55);
    const len = Math.floor(period * 2.4);
    for (let k = 0; k < len; k++) {
      const idx = (start + k + n) % n;
      const t = k / sr;
      const env = Math.exp(-t / decay) * (1 - Math.exp(-t / 0.00012));
      const s1 = Math.sin(2 * Math.PI * fire * res1 * t);
      const s2 = Math.sin(2 * Math.PI * fire * res2 * t) * 0.35;
      d[idx] += A * env * (s1 + s2) + A * env * (rnd() - 0.5) * (load ? 0.6 : 0.3);
    }
  }
  // fundamental rumble and (concept) turbine whine – both are multiples of the cycle frequency
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    d[i] += Math.sin(2 * Math.PI * fire * t) * (load ? 0.35 : 0.25);
    d[i] += Math.sin(2 * Math.PI * fire * 0.5 * t) * 0.18;
    if (kind === 2) d[i] += Math.sin(2 * Math.PI * cycleHz * Math.round(fire * 9 / cycleHz) * t) * 0.07;
  }
  // soft clip + normalise
  let mx = 0;
  for (let i = 0; i < n; i++) {
    d[i] = Math.tanh(d[i] * (kind === 1 ? 1.6 : 1.1));
    mx = Math.max(mx, Math.abs(d[i]));
  }
  for (let i = 0; i < n; i++) d[i] /= mx || 1;
  return b;
}

interface EngineVoice {
  layers: { src: AudioBufferSourceNode; gain: GainNode; base: number }[];
  filter: BiquadFilterNode;
  out: GainNode;
  pan: StereoPannerNode;
  intake: GainNode;
  car: Car | null;
}

export class Audio {
  ctx: AudioContext | null = null;
  master!: GainNode;
  musicBus!: GainNode;
  sfxBus!: GainNode;
  music!: Music;
  musicVol = 0.7;
  sfxVol = 0.85;
  private bufs = new Map<string, Buf>();
  private engines: EngineVoice[] = [];
  private loops = new Map<string, { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode }>();
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  ready = false;
  private suspended = false;

  init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx: AudioContext = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 4;
    comp.attack.value = 0.005;
    comp.release.value = 0.2;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(comp).connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.setVolumes(this.musicVol, this.sfxVol);
    // small hall reverb (generated impulse response)
    this.reverb = ctx.createConvolver();
    const ir = ctx.createBuffer(2, ctx.sampleRate * 1.8, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3.2);
    }
    this.reverb.buffer = ir;
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.25;
    this.reverbSend.connect(this.reverb).connect(this.sfxBus);
    this.bufs.set('white', noiseBuffer(ctx, 2, 'white'));
    this.bufs.set('pink', noiseBuffer(ctx, 2, 'pink'));
    this.bufs.set('brown', noiseBuffer(ctx, 2, 'brown'));
    for (let k = 0; k < 3; k++) {
      const cyl = [12, 4, 8][k];
      this.bufs.set(`eng${k}lo`, engineBuffer(ctx, cyl, 2200, k, true));
      this.bufs.set(`eng${k}hi`, engineBuffer(ctx, cyl, 6000, k, true));
      this.bufs.set(`eng${k}off`, engineBuffer(ctx, cyl, 3500, k, false));
    }
    this.music = new Music(ctx, this.musicBus);
    this.ready = true;
  }

  setVolumes(music: number, sfx: number): void {
    this.musicVol = music;
    this.sfxVol = sfx;
    if (!this.ctx) return;
    this.musicBus.gain.setTargetAtTime(music * 0.6, this.ctx.currentTime, 0.05);
    this.sfxBus.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.05);
  }

  pause(p: boolean): void {
    if (!this.ctx) return;
    if (p && !this.suspended) {
      this.suspended = true;
      void this.ctx.suspend();
    } else if (!p && this.suspended) {
      this.suspended = false;
      void this.ctx.resume();
    }
  }

  // ---------------------------------------------------------------- engines
  private makeEngine(kind: number): EngineVoice {
    const ctx = this.ctx!;
    const out = ctx.createGain();
    out.gain.value = 0;
    const pan = ctx.createStereoPanner();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2000;
    filter.Q.value = 0.7;
    filter.connect(out).connect(pan).connect(this.sfxBus);
    const layers = (['lo', 'hi', 'off'] as const).map((l) => {
      const src = ctx.createBufferSource();
      src.buffer = this.bufs.get(`eng${kind}${l}`)!;
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(g).connect(filter);
      src.start(ctx.currentTime + Math.random() * 0.05);
      return { src, gain: g, base: l === 'lo' ? 2200 : l === 'hi' ? 6000 : 3500 };
    });
    // intake / induction noise
    const isrc = ctx.createBufferSource();
    isrc.buffer = this.bufs.get('pink')!;
    isrc.loop = true;
    const ibp = ctx.createBiquadFilter();
    ibp.type = 'bandpass';
    ibp.frequency.value = 900;
    ibp.Q.value = 0.8;
    const intake = ctx.createGain();
    intake.gain.value = 0;
    isrc.connect(ibp).connect(intake).connect(filter);
    isrc.start();
    (intake as any)._bp = ibp;
    return { layers, filter, out, pan, intake, car: null };
  }

  /** set up engine voices: players first, then nearest rivals */
  setEngines(players: Car[], rivals: number): void {
    if (!this.ctx) return;
    for (const e of this.engines) {
      e.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      setTimeout(() => { e.layers.forEach((l) => l.src.stop()); e.out.disconnect(); }, 300);
    }
    this.engines = [];
    for (const p of players) {
      const e = this.makeEngine(p.spec.id);
      e.car = p;
      this.engines.push(e);
    }
    for (let i = 0; i < rivals; i++) this.engines.push(this.makeEngine(i % 3));
  }

  stopEngines(): void {
    if (!this.ctx) return;
    for (const e of this.engines) e.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    for (const [, l] of this.loops) l.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
  }

  private loop(key: string, buf: string, type: BiquadFilterType, freq: number, q = 1): { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } {
    let l = this.loops.get(key);
    if (!l) {
      const ctx = this.ctx!;
      const src = ctx.createBufferSource();
      src.buffer = this.bufs.get(buf)!;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.sfxBus);
      src.start();
      l = { src, gain, filter };
      this.loops.set(key, l);
    }
    return l;
  }

  /**
   * Per-frame update. `listeners` are the player cars (one or two), `cars` all cars for rival voices.
   * `split` true in two-player mode (players panned left/right slightly).
   */
  update(listeners: Car[], cars: Car[], delta: (a: number, b: number) => number, weather: { rain: number; wind: number; scen: number }, active: boolean): void {
    if (!this.ctx || !this.ready) return;
    const t = this.ctx.currentTime;
    const k = 0.03;
    // engines: player voices follow their car
    const lead = listeners[0];
    let ei = 0;
    for (const L of listeners) {
      const e = this.engines[ei++];
      if (!e) continue;
      this.driveEngine(e, L, 1, listeners.length > 1 ? (ei === 1 ? -0.35 : 0.35) : 0, 1, active);
    }
    // rival voices: nearest rivals to the lead listener
    if (lead) {
      const near = cars.filter((c) => !c.isPlayer).map((c) => ({ c, d: delta(lead.s, c.s), dx: c.x - lead.x })).filter((o) => Math.abs(o.d) < 140).sort((a, b) => Math.abs(a.d) - Math.abs(b.d));
      for (let i = 0; ei < this.engines.length; i++, ei++) {
        const e = this.engines[ei];
        const o = near[i];
        if (!o) {
          e.out.gain.setTargetAtTime(0, t, 0.1);
          continue;
        }
        const dist = Math.hypot(o.d, o.dx);
        const att = 1 / (1 + dist * dist * 0.004);
        // doppler: approaching (we are faster and behind) raises pitch slightly
        const rel = (o.c.v - lead.v) * Math.sign(-o.d || 1);
        const dop = 1 + Math.max(-0.12, Math.min(0.12, rel / 340));
        this.driveEngine(e, o.c, att * 0.55, Math.max(-0.9, Math.min(0.9, o.dx / 6)), dop, active);
        // whoosh when passing close
        if (Math.abs(o.d) < 6 && Math.abs(o.dx) < 4 && Math.abs(lead.v - o.c.v) > 6 && !(e as any)._wh) {
          (e as any)._wh = true;
          this.whoosh(o.dx);
          setTimeout(() => ((e as any)._wh = false), 600);
        }
      }
    }
    // tyres, surfaces, rumble, wind for the lead listener (and averaged for split)
    let slip = 0, rumble = 0, speed = 0, gravel = 0, water = 0, snow = 0;
    for (const L of listeners) {
      slip = Math.max(slip, L.slip * (L.airborne ? 0 : 1) * (L.spray === Spray.SNOW || L.spray === Spray.DUST ? 0.35 : 1));
      rumble = Math.max(rumble, L.rumble * Math.min(1, L.v / 15));
      speed = Math.max(speed, L.v);
      if (L.spray === Spray.DUST || L.spray === Spray.GRASS || L.spray === Spray.SAND || L.offroad) gravel = Math.max(gravel, Math.min(1, L.v / 25) * (L.offroad ? 1 : 0.55));
      if (L.spray === Spray.WATER || L.spray === Spray.MUD) water = Math.max(water, Math.min(1, L.v / 25) * Math.min(1, L.sprayAmt));
      if (L.spray === Spray.SNOW) snow = Math.max(snow, Math.min(1, L.v / 25));
    }
    if (!active) slip = rumble = gravel = water = snow = 0;
    const tyre = this.loop('tyre', 'white', 'bandpass', 1700, 6);
    tyre.gain.gain.setTargetAtTime(Math.max(0, slip - 0.25) * 0.4, t, k);
    tyre.filter.frequency.setTargetAtTime(1400 + slip * 900 + Math.sin(t * 13) * 120, t, k);
    const rum = this.loop('rumble', 'brown', 'lowpass', 120, 4);
    rum.gain.gain.setTargetAtTime(rumble * 0.9, t, k);
    rum.src.playbackRate.setTargetAtTime(0.6 + speed / 60, t, k);
    const gr = this.loop('gravel', 'white', 'lowpass', 2400, 0.6);
    gr.gain.gain.setTargetAtTime(gravel * 0.22, t, k);
    const wa = this.loop('water', 'pink', 'bandpass', 900, 0.7);
    wa.gain.gain.setTargetAtTime(water * 0.5, t, k);
    const sn = this.loop('snow', 'pink', 'highpass', 1800, 0.5);
    sn.gain.gain.setTargetAtTime(snow * 0.12, t, k);
    const wind = this.loop('wind', 'pink', 'bandpass', 500, 0.5);
    const ws = active ? Math.min(1, (speed / 80) ** 2) * 0.35 + weather.wind * 0.2 : weather.wind * 0.1;
    wind.gain.gain.setTargetAtTime(ws, t, 0.1);
    wind.filter.frequency.setTargetAtTime(300 + speed * 12, t, 0.1);
    const rain = this.loop('rain', 'white', 'highpass', 2500, 0.3);
    rain.gain.gain.setTargetAtTime(weather.rain * 0.16, t, 0.2);
  }

  private driveEngine(e: EngineVoice, car: Car, vol: number, pan: number, pitch: number, active: boolean): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const rpm = Math.max(car.spec.idle, car.rpm);
    const thr = car.throttle;
    const k = 0.02;
    const loW = 1 - Math.min(1, Math.max(0, (rpm - 2500) / 3000));
    const hiW = 1 - loW;
    const load = Math.min(1, thr * 1.2 + (car.limiter ? 0.5 : 0));
    const [lo, hi, off] = e.layers;
    lo.src.playbackRate.setTargetAtTime((rpm / lo.base) * pitch, t, k);
    hi.src.playbackRate.setTargetAtTime((rpm / hi.base) * pitch, t, k);
    off.src.playbackRate.setTargetAtTime((rpm / off.base) * pitch, t, k);
    lo.gain.gain.setTargetAtTime(loW * (0.35 + 0.65 * load), t, k);
    hi.gain.gain.setTargetAtTime(hiW * (0.3 + 0.7 * load), t, k);
    off.gain.gain.setTargetAtTime((1 - load) * 0.55, t, k);
    e.filter.frequency.setTargetAtTime(700 + rpm * 0.55 + load * 2200, t, k);
    (e.intake as any)._bp.frequency.setTargetAtTime(400 + rpm * 0.18, t, k);
    e.intake.gain.setTargetAtTime(load * (rpm / car.spec.redline) * 0.18, t, k);
    e.out.gain.setTargetAtTime(active ? vol * 0.32 : vol * 0.12, t, 0.05);
    e.pan.pan.setTargetAtTime(pan, t, 0.05);
  }

  // ---------------------------------------------------------------- one-shots
  private noiseHit(dur: number, freq: number, q: number, vol: number, type: BiquadFilterType = 'lowpass', pan = 0, sweepTo = 0, send = 0.2): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.bufs.get('white')!;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    src.connect(f).connect(g).connect(p).connect(this.sfxBus);
    if (send) {
      const s = ctx.createGain();
      s.gain.value = send;
      g.connect(s).connect(this.reverbSend);
    }
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }
  private tone(freq: number, dur: number, vol: number, type: OscillatorType = 'sine', sweepTo = 0, when = 0, bus: AudioNode | null = null): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (sweepTo) o.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus ?? this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  whoosh(pan: number): void {
    this.noiseHit(0.5, 600, 0.8, 0.25, 'bandpass', Math.max(-1, Math.min(1, pan / 3)), 2600, 0);
  }
  beep(final: boolean): void {
    this.tone(final ? 1046 : 660, final ? 0.55 : 0.22, 0.32, 'square', 0, 0, this.sfxBus);
    this.tone(final ? 523 : 330, final ? 0.55 : 0.22, 0.12, 'sine');
  }
  thunder(power: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.noiseHit(0.25, 3000, 0.5, 0.5 * power, 'lowpass', 0, 400, 0.6);
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.bufs.get('brown')!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 180;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1.6 * power, t + 0.25);
    g.gain.setTargetAtTime(0.4 * power, t + 0.6, 0.6);
    g.gain.setTargetAtTime(0.0001, t + 1.8, 0.9);
    src.loop = true;
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t);
    src.stop(t + 6);
  }
  ui(kind: 'move' | 'ok' | 'back' | 'error'): void {
    if (!this.ctx) return;
    if (kind === 'move') this.tone(1300, 0.05, 0.08, 'square');
    else if (kind === 'ok') { this.tone(880, 0.08, 0.12, 'square'); this.tone(1320, 0.12, 0.1, 'square', 0, 0.06); }
    else if (kind === 'back') this.tone(520, 0.1, 0.1, 'square', 330);
    else this.tone(180, 0.2, 0.15, 'sawtooth');
  }

  /** translate car event bits into sounds */
  events(car: Car, ev: number, pan: number): void {
    if (!this.ctx) return;
    if (ev & EV_CRASH) {
      this.noiseHit(0.7, 1800, 0.7, 0.9, 'lowpass', pan, 200, 0.4);
      this.tone(90, 0.45, 0.7, 'sine', 40);
      this.noiseHit(0.25, 5000, 1, 0.3, 'highpass', pan, 0, 0.3);
    }
    if (ev & EV_SHUNT) {
      this.tone(120, 0.18, 0.4, 'sine', 60);
      this.noiseHit(0.2, 1200, 1, 0.35, 'lowpass', pan);
    }
    if (ev & EV_SCRAPE && Math.random() < 0.15) this.noiseHit(0.25, 3500, 3, 0.15, 'bandpass', pan, 2000);
    if (ev & EV_POTHOLE) { this.tone(70, 0.18, 0.6, 'sine', 40); this.noiseHit(0.12, 900, 1, 0.3, 'lowpass', pan); }
    if (ev & EV_CONE) { this.tone(420, 0.09, 0.3, 'triangle', 260); this.noiseHit(0.1, 2000, 2, 0.2, 'bandpass', pan); }
    if (ev & EV_LASER) { this.tone(1800, 0.4, 0.25, 'sawtooth', 120); this.noiseHit(0.3, 4000, 2, 0.25, 'highpass', pan); }
    if (ev & EV_LAND) { this.tone(80, 0.3, 0.55, 'sine', 45); this.noiseHit(0.2, 700, 1, 0.3, 'lowpass', pan); }
    if (ev & EV_JUMP) this.noiseHit(0.3, 800, 1, 0.12, 'bandpass', pan, 1600, 0);
    if (ev & EV_SPLASH && Math.random() < 0.05) this.noiseHit(0.35, 1400, 0.6, 0.25, 'bandpass', pan, 500, 0.2);
    if (ev & EV_SHIFT && car.isPlayer) {
      this.noiseHit(0.06, 2500, 1, 0.12, 'bandpass', pan);
      if (car.spec.id !== 1) this.noiseHit(0.18, 3000, 4, 0.06, 'bandpass', pan, 6000, 0); // blow-off
    }
  }
}
