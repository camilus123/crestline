// A small Web Audio tracker: synthesized drums, bass, pads, stabs, arps and leads, scheduled ahead
// in time. Four original driving tracks. All composition data is below.

type Note = number; // midi

const NOTE_I: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
function midi(n: string): Note {
  const m = /^([A-G][#b]?)(-?\d)$/.exec(n);
  if (!m) return 0;
  return 12 * (+m[2] + 1) + NOTE_I[m[1]];
}
const hz = (m: Note) => 440 * Math.pow(2, (m - 69) / 12);

function chordTones(name: string, oct = 3): Note[] {
  const m = /^([A-G][#b]?)(m7|maj7|m|7|sus4|sus2|5)?$/.exec(name)!;
  const root = 12 * (oct + 1) + NOTE_I[m[1]];
  switch (m[2]) {
    case 'm': return [root, root + 3, root + 7];
    case 'm7': return [root, root + 3, root + 7, root + 10];
    case 'maj7': return [root, root + 4, root + 7, root + 11];
    case '7': return [root, root + 4, root + 7, root + 10];
    case 'sus4': return [root, root + 5, root + 7];
    case 'sus2': return [root, root + 2, root + 7];
    case '5': return [root, root + 7, root + 12];
    default: return [root, root + 4, root + 7];
  }
}

/** "A4:2 C5:2 R:4" -> list of [note|null, steps] */
function phrase(s: string): [Note | null, number][] {
  return s.trim().split(/\s+/).map((tok) => {
    const [n, d] = tok.split(':');
    return [n === 'R' ? null : midi(n), +(d || 1)] as [Note | null, number];
  });
}

interface Part {
  kick?: string; snare?: string; clap?: string; hat?: string; ohat?: string; perc?: string; crash?: boolean;
  bass?: string; // per-16th tokens: r root, o octave, 5 fifth, 7 seventh-ish(b7), - rest; uppercase = accent
  bassOct?: number;
  stab?: string; // 16 chars x / .
  pad?: boolean;
  arp?: string; // per-16th indices into chord tones (0-3), '.' rest, '+' adds an octave
  lead?: number; // index into song.leads
  gtr?: string; // power-chord rhythm 16 chars
}
interface Section { bars: number; chords: string[]; part: Part }
interface Song {
  name: string;
  style: string;
  bpm: number;
  swing: number;
  bass: 'saw' | 'square' | 'acid' | 'sub';
  lead: 'saw' | 'square' | 'gtr' | 'soft';
  pump: number; // sidechain amount
  leads: [Note | null, number][][];
  sections: Section[];
  loopFrom: number;
}

const FOUR = 'x...x...x...x...';
const OFF_H = '..x...x...x...x.';
const SIXT_H = 'xxxxxxxxxxxxxxxx';

export const SONGS: Song[] = [
  {
    name: 'Neon Apex', style: 'Euro-house · 126 BPM', bpm: 126, swing: 0.02, bass: 'saw', lead: 'saw', pump: 0.55,
    leads: [
      phrase('A4:2 C5:2 E5:3 D5:1 C5:2 A4:2 G4:2 A4:2 F4:2 A4:2 C5:3 A4:1 G4:2 F4:2 E4:2 F4:2 E4:2 G4:2 C5:3 B4:1 C5:2 E5:2 D5:2 C5:2 B4:2 D5:2 G5:3 F5:1 E5:2 D5:2 B4:2 G4:2'),
      phrase('E5:4 D5:2 C5:2 A4:6 R:2 F5:4 E5:2 D5:2 C5:6 R:2 E5:2 G5:2 E5:2 C5:2 D5:4 B4:4 C5:8 R:8'),
    ],
    sections: [
      { bars: 8, chords: ['Am', 'F', 'C', 'G'], part: { kick: FOUR, hat: OFF_H, pad: true, crash: true } },
      { bars: 8, chords: ['Am', 'F', 'C', 'G'], part: { kick: FOUR, clap: '....x.......x...', hat: SIXT_H, ohat: OFF_H, bass: '-r-o-r-o-r-o-r-o', stab: 'x..x..x...x..x..', pad: true } },
      { bars: 8, chords: ['Am', 'F', 'C', 'G'], part: { kick: FOUR, clap: '....x.......x...', hat: SIXT_H, ohat: OFF_H, bass: '-r-o-r-o-r-o-r-o', stab: 'x..x..x...x..x..', lead: 0, crash: true } },
      { bars: 4, chords: ['Dm', 'Am', 'F', 'E'], part: { pad: true, arp: '0+12+0+12+0+12+0', hat: OFF_H } },
      { bars: 8, chords: ['Dm', 'Am', 'F', 'E'], part: { kick: FOUR, clap: '....x.......x...', hat: SIXT_H, ohat: OFF_H, bass: '-r-o-r-o-r-o-r-o', lead: 1, pad: true, crash: true } },
      { bars: 8, chords: ['Am', 'F', 'C', 'G'], part: { kick: FOUR, clap: '....x.......x...', hat: SIXT_H, ohat: OFF_H, bass: '-r-o-r-o-r-o-r-o', stab: 'x..x..x...x..x..', arp: '0120+1+20120+1+2', lead: 0 } },
    ],
    loopFrom: 1,
  },
  {
    name: 'Redline Run', style: 'Synth-rock · 142 BPM', bpm: 142, swing: 0, bass: 'square', lead: 'gtr', pump: 0,
    leads: [
      phrase('E5:2 G5:2 A5:2 B5:4 A5:2 G5:2 E5:2 G5:4 E5:2 D5:2 E5:4 R:4 D5:2 F#5:2 A5:2 D6:4 C6:2 B5:2 A5:2 B5:8 R:8'),
      phrase('B5:4 A5:4 G5:4 F#5:4 E5:8 R:4 G5:4 A5:4 B5:4 C6:4 D6:4 B5:12 R:4'),
    ],
    sections: [
      { bars: 4, chords: ['E5', 'C5', 'D5', 'B5'], part: { gtr: 'x.x.x.x.x.x.x.x.', kick: 'x.......x.......', hat: 'x.x.x.x.x.x.x.x.', crash: true } },
      { bars: 8, chords: ['E5', 'C5', 'D5', 'B5'], part: { gtr: 'x.xxx.xxx.xxx.xx', kick: 'x.....x.x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', bass: 'r-r-r-r-r-r-r-o-', bassOct: 1 } },
      { bars: 8, chords: ['E5', 'C5', 'D5', 'B5'], part: { gtr: 'x.xxx.xxx.xxx.xx', kick: 'x.....x.x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', bass: 'r-r-r-r-r-r-r-o-', bassOct: 1, lead: 0, crash: true } },
      { bars: 8, chords: ['Am', 'Em', 'C', 'D'], part: { gtr: 'x...x...x...x...', kick: 'x.x...x.x.x...x.', snare: '....x.......x..x', hat: SIXT_H, bass: 'r.r.r.r.o.o.r.r.', bassOct: 1, lead: 1, pad: true } },
      { bars: 4, chords: ['E5', 'E5', 'C5', 'D5'], part: { kick: 'x...x...x...x...', snare: 'x.x.x.x.xxxxxxxx', crash: true } },
      { bars: 8, chords: ['E5', 'C5', 'D5', 'B5'], part: { gtr: 'x.xxx.xxx.xxx.xx', kick: 'x.....x.x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', bass: 'r-r-r-r-r-r-r-o-', bassOct: 1, lead: 0 } },
    ],
    loopFrom: 1,
  },
  {
    name: 'Gravel Break', style: 'Breakbeat techno · 134 BPM', bpm: 134, swing: 0.06, bass: 'acid', lead: 'square', pump: 0.2,
    leads: [
      phrase('D5:3 F5:3 A5:2 G5:3 F5:3 E5:2 D5:3 C5:3 D5:10 R:16 A5:3 C6:3 A5:2 G5:3 F5:3 G5:2 A5:16 R:16'),
    ],
    sections: [
      { bars: 4, chords: ['Dm', 'Dm', 'Bb', 'C'], part: { hat: SIXT_H, perc: '..x...x..x....x.', arp: '0.1.2.+.0.1.2.+.' } },
      { bars: 8, chords: ['Dm', 'Dm', 'Bb', 'C'], part: { kick: 'x.........x.....', snare: '....x.....x.x...', hat: SIXT_H, bass: 'RrorR5ror-rRor5r', bassOct: 0, arp: '0.1.2.+.0.1.2.+.', crash: true } },
      { bars: 8, chords: ['Dm', 'Dm', 'Bb', 'C'], part: { kick: 'x.x.......x..x..', snare: '....x..x.x..x...', hat: SIXT_H, ohat: '......x.......x.', bass: 'RrorR5ror-rRor5r', bassOct: 0, lead: 0, perc: '..x...x..x....x.' } },
      { bars: 4, chords: ['Gm', 'Gm', 'A', 'A'], part: { pad: true, arp: '012+012+012+012+', hat: OFF_H } },
      { bars: 8, chords: ['Dm', 'Dm', 'Bb', 'C'], part: { kick: 'x.x.......x..x..', snare: '....x..x.x..x...', hat: SIXT_H, ohat: '......x.......x.', bass: 'RrorR5ror-rRor5r', bassOct: 0, arp: '0.1.2.+.0.1.2.+.', stab: 'x.....x.....x...', crash: true } },
    ],
    loopFrom: 1,
  },
  {
    name: 'Midnight Crest', style: 'Synthwave · 100 BPM', bpm: 100, swing: 0, bass: 'sub', lead: 'soft', pump: 0.35,
    leads: [
      phrase('C#5:6 B4:2 A4:4 F#4:4 D5:6 C#5:2 B4:4 A4:4 E5:6 D5:2 C#5:4 A4:4 B4:8 G#4:8'),
      phrase('F#5:8 E5:4 C#5:4 D5:8 B4:8 C#5:4 E5:4 A5:8 G#5:16 R:16'),
    ],
    sections: [
      { bars: 4, chords: ['F#m', 'D', 'A', 'E'], part: { pad: true, arp: '012+012+012+012+', crash: true } },
      { bars: 8, chords: ['F#m', 'D', 'A', 'E'], part: { kick: 'x.......x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', bass: 'rrrrrrrrrrrrrrrr', bassOct: 1, pad: true, arp: '012+012+012+012+' } },
      { bars: 8, chords: ['F#m', 'D', 'A', 'E'], part: { kick: 'x.....x.x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', bass: 'rrrrrrrrrrrrrrrr', bassOct: 1, pad: true, arp: '012+012+012+012+', lead: 0, crash: true } },
      { bars: 8, chords: ['Bm', 'D', 'E', 'F#m'], part: { kick: 'x.....x.x.......', snare: '....x.......x...', hat: SIXT_H, bass: 'rrrrrrrroooooooo', bassOct: 1, pad: true, lead: 1 } },
      { bars: 4, chords: ['D', 'E', 'F#m', 'F#m'], part: { pad: true, arp: '0+1+2+0+1+2+0+1+' } },
    ],
    loopFrom: 1,
  },
];

export class Music {
  private ctx: AudioContext;
  private out: GainNode;
  private delay: DelayNode;
  private delayFb: GainNode;
  private delaySend: GainNode;
  private rev: ConvolverNode;
  private revSend: GainNode;
  private noise: AudioBuffer;
  private pumpGain: GainNode;
  song = -1;
  playing = false;
  private nextTime = 0;
  private step = 0;
  private timer: number | null = null;
  private stepDur = 0.12;
  private totalBars = 0;
  private leadPos = 0;
  private leadStepLeft = 0;
  readonly songs = SONGS;
  onStep: ((bar: number, step: number) => void) | null = null;

  constructor(ctx: AudioContext, dest: AudioNode) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0.8;
    this.pumpGain = ctx.createGain();
    this.pumpGain.connect(this.out);
    this.out.connect(dest);
    this.delay = ctx.createDelay(2);
    this.delayFb = ctx.createGain();
    this.delayFb.gain.value = 0.32;
    this.delaySend = ctx.createGain();
    this.delaySend.gain.value = 0.25;
    const dlp = ctx.createBiquadFilter();
    dlp.type = 'lowpass';
    dlp.frequency.value = 3500;
    this.delaySend.connect(this.delay).connect(dlp).connect(this.delayFb).connect(this.delay);
    dlp.connect(this.out);
    this.rev = ctx.createConvolver();
    const ir = ctx.createBuffer(2, ctx.sampleRate * 2.4, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.6);
    }
    this.rev.buffer = ir;
    this.revSend = ctx.createGain();
    this.revSend.gain.value = 0.3;
    this.revSend.connect(this.rev).connect(this.out);
    const n = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, n, n);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }

  play(index: number): void {
    this.stop();
    if (index < 0 || index >= SONGS.length) return;
    this.song = index;
    const s = SONGS[index];
    this.stepDur = 60 / s.bpm / 4;
    this.delay.delayTime.value = this.stepDur * 3; // dotted eighth
    this.totalBars = s.sections.reduce((a, b) => a + b.bars, 0);
    this.step = 0;
    this.leadPos = 0;
    this.leadStepLeft = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.playing = true;
    this.out.gain.cancelScheduledValues(this.ctx.currentTime);
    this.out.gain.setValueAtTime(0.8, this.ctx.currentTime);
    this.timer = window.setInterval(() => this.schedule(), 25);
  }
  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.playing = false;
  }
  fadeOut(sec: number): void {
    const t = this.ctx.currentTime;
    this.out.gain.setTargetAtTime(0, t, sec / 3);
    setTimeout(() => this.stop(), sec * 1000);
  }

  private sectionAt(bar: number): { sec: Section; barIn: number; secIndex: number } {
    const s = SONGS[this.song];
    let b = bar;
    // loop the arrangement from loopFrom
    const introBars = s.sections.slice(0, s.loopFrom).reduce((a, x) => a + x.bars, 0);
    const loopBars = this.totalBars - introBars;
    if (b >= this.totalBars) b = introBars + ((b - introBars) % loopBars);
    for (let i = 0; i < s.sections.length; i++) {
      const sec = s.sections[i];
      if (b < sec.bars) return { sec, barIn: b, secIndex: i };
      b -= sec.bars;
    }
    return { sec: s.sections[0], barIn: 0, secIndex: 0 };
  }

  private schedule(): void {
    const ahead = 0.15;
    while (this.nextTime < this.ctx.currentTime + ahead) {
      this.playStep(this.step, this.nextTime);
      const s = SONGS[this.song];
      const swing = this.step % 2 === 1 ? s.swing : -s.swing;
      this.nextTime += this.stepDur * (1 + swing);
      this.step++;
    }
  }

  private playStep(step: number, t: number): void {
    const s = SONGS[this.song];
    const bar = Math.floor(step / 16);
    const i = step % 16;
    const { sec, barIn } = this.sectionAt(bar);
    const P = sec.part;
    const chord = sec.chords[barIn % sec.chords.length];
    const on = (pat?: string) => !!pat && pat[i] === 'x';
    if (on(P.kick)) {
      this.kick(t);
      if (s.pump > 0) {
        const g = this.pumpGain.gain;
        g.cancelScheduledValues(t);
        g.setValueAtTime(1 - s.pump, t);
        g.linearRampToValueAtTime(1, t + this.stepDur * 3);
      }
    }
    if (on(P.snare)) this.snare(t, s.style.startsWith('Synthwave'));
    if (on(P.clap)) this.clap(t);
    if (on(P.hat)) this.hat(t, 0.04, i % 4 === 2 ? 0.16 : 0.09);
    if (on(P.ohat)) this.hat(t, 0.22, 0.1);
    if (on(P.perc)) this.perc(t, i);
    if (P.crash && barIn === 0 && i === 0) this.hat(t, 1.4, 0.16, 5000);
    if (P.bass) {
      const tok = P.bass[i];
      if (tok && tok !== '-' && tok !== '.') {
        const root = chordTones(chord, 1 + (P.bassOct ?? 0))[0];
        const lower = tok.toLowerCase();
        const note = lower === 'o' ? root + 12 : lower === '5' ? root + 7 : lower === '7' ? root + 10 : root;
        this.bass(t, note, s.bass, tok !== lower);
      }
    }
    if (P.stab && P.stab[i] === 'x') this.stab(t, chordTones(chord, 4));
    if (P.gtr && P.gtr[i] === 'x') this.gtr(t, chordTones(chord.replace(/m$/, '5').replace(/^([A-G][#b]?)$/, '$15'), 2), i % 4 === 0);
    if (P.pad && i === 0) this.pad(t, chordTones(chord, 3), this.stepDur * 16);
    if (P.arp) {
      const a = P.arp[i];
      if (a && a !== '.') {
        const tones = chordTones(chord, 4);
        const idx = a === '+' ? 0 : +a;
        const n = (tones[idx % tones.length] ?? tones[0]) + (a === '+' ? 12 : 0);
        this.arp(t, n);
      }
    }
    // lead phrase plays continuously while the section has a lead
    if (P.lead !== undefined) {
      const ph = s.leads[P.lead];
      if (barIn === 0 && i === 0) {
        this.leadPos = 0;
        this.leadStepLeft = 0;
      }
      if (this.leadStepLeft <= 0) {
        const [n, dur] = ph[this.leadPos % ph.length];
        this.leadPos++;
        this.leadStepLeft = dur;
        if (n !== null) this.lead(t, n, dur * this.stepDur, s.lead);
      }
      this.leadStepLeft--;
    }
    this.onStep?.(bar, i);
  }

  // ---------------------------------------------------------------- instruments
  private env(t: number, a: number, peak: number, d: number, sustain = 0): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain || 0.0001), t + a + d);
    return g;
  }
  private kick(t: number): void {
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.11);
    const g = this.env(t, 0.002, 0.95, 0.42);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.5);
    this.noiseShot(t, 0.01, 4000, 'highpass', 0.25, this.out);
  }
  private snare(t: number, big: boolean): void {
    this.noiseShot(t, big ? 0.32 : 0.18, 1800, 'bandpass', big ? 0.55 : 0.45, this.pumpGain, big ? 0.7 : 0.25);
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    const g = this.env(t, 0.002, 0.35, 0.11);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.15);
  }
  private clap(t: number): void {
    for (let k = 0; k < 3; k++) this.noiseShot(t + k * 0.011, 0.05 + (k === 2 ? 0.12 : 0), 1500, 'bandpass', 0.4, this.out, 0.3);
  }
  private hat(t: number, dur: number, vol: number, f = 8000): void {
    this.noiseShot(t, dur, f, 'highpass', vol, this.out, 0.05);
  }
  private perc(t: number, i: number): void {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    const f = [320, 240, 400, 280][i % 4];
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.12);
    const g = this.env(t, 0.002, 0.18, 0.14);
    o.connect(g).connect(this.pumpGain);
    o.start(t);
    o.stop(t + 0.2);
  }
  private noiseShot(t: number, dur: number, f: number, type: BiquadFilterType, vol: number, dest: AudioNode, rev = 0): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const fl = this.ctx.createBiquadFilter();
    fl.type = type;
    fl.frequency.value = f;
    fl.Q.value = type === 'bandpass' ? 0.9 : 0.7;
    const g = this.env(t, 0.001, vol, dur);
    src.connect(fl).connect(g).connect(dest);
    if (rev) {
      const r = this.ctx.createGain();
      r.gain.value = rev;
      g.connect(r).connect(this.revSend);
    }
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }
  private bass(t: number, n: Note, kind: Song['bass'], accent: boolean): void {
    const dur = this.stepDur * (kind === 'sub' ? 0.9 : 1.6);
    const o = this.ctx.createOscillator();
    o.type = kind === 'square' ? 'square' : kind === 'sub' ? 'sawtooth' : 'sawtooth';
    o.frequency.setValueAtTime(hz(n), t);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    const base = kind === 'acid' ? 260 : kind === 'sub' ? 380 : 500;
    const peak = kind === 'acid' ? (accent ? 3200 : 1500) : kind === 'sub' ? 900 : 1600;
    f.frequency.setValueAtTime(peak, t);
    f.frequency.exponentialRampToValueAtTime(base, t + dur);
    f.Q.value = kind === 'acid' ? 11 : 3;
    const g = this.env(t, 0.004, accent ? 0.5 : 0.36, dur);
    o.connect(f).connect(g).connect(this.pumpGain);
    o.start(t);
    o.stop(t + dur + 0.05);
    if (kind === 'sub') {
      const s = this.ctx.createOscillator();
      s.frequency.setValueAtTime(hz(n - 12), t);
      const g2 = this.env(t, 0.004, 0.35, dur);
      s.connect(g2).connect(this.pumpGain);
      s.start(t);
      s.stop(t + dur + 0.05);
    }
  }
  private stab(t: number, tones: Note[]): void {
    for (const n of tones) {
      for (const [mul, amp] of [[1, 0.09], [2, 0.05], [3, 0.025]] as const) {
        const o = this.ctx.createOscillator();
        o.frequency.value = hz(n) * mul;
        const g = this.env(t, 0.003, amp, 0.32);
        o.connect(g).connect(this.pumpGain);
        const r = this.ctx.createGain();
        r.gain.value = 0.4;
        g.connect(r).connect(this.revSend);
        o.start(t);
        o.stop(t + 0.4);
      }
    }
  }
  private gtr(t: number, tones: Note[], accent: boolean): void {
    const dur = this.stepDur * (accent ? 1.8 : 0.9);
    const ws = this.ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(x * 6);
    }
    ws.curve = curve;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = accent ? 2600 : 1600;
    const g = this.env(t, 0.003, accent ? 0.16 : 0.1, dur);
    for (const n of tones) {
      for (const det of [-7, 7]) {
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = hz(n);
        o.detune.value = det;
        o.connect(ws);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
    }
    ws.connect(f).connect(g).connect(this.out);
  }
  private pad(t: number, tones: Note[], dur: number): void {
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(700, t);
    f.frequency.linearRampToValueAtTime(1500, t + dur * 0.5);
    f.frequency.linearRampToValueAtTime(800, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.35);
    g.gain.setValueAtTime(0.06, t + dur - 0.1);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.5);
    for (const n of tones) {
      for (const det of [-11, 0, 9]) {
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = hz(n);
        o.detune.value = det;
        o.connect(f);
        o.start(t);
        o.stop(t + dur + 0.6);
      }
    }
    f.connect(g).connect(this.pumpGain);
    const r = this.ctx.createGain();
    r.gain.value = 0.6;
    g.connect(r).connect(this.revSend);
  }
  private arp(t: number, n: Note): void {
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = hz(n);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(3000, t);
    f.frequency.exponentialRampToValueAtTime(600, t + 0.15);
    const g = this.env(t, 0.002, 0.07, 0.16);
    o.connect(f).connect(g).connect(this.pumpGain);
    g.connect(this.delaySend);
    o.start(t);
    o.stop(t + 0.2);
  }
  private lead(t: number, n: Note, dur: number, kind: Song['lead']): void {
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = kind === 'soft' ? 1800 : kind === 'gtr' ? 3200 : 2600;
    f.Q.value = 2;
    const g = this.ctx.createGain();
    const peak = kind === 'gtr' ? 0.09 : kind === 'soft' ? 0.11 : 0.1;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + (kind === 'soft' ? 0.06 : 0.01));
    g.gain.setValueAtTime(peak, t + Math.max(0.02, dur - 0.05));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.12);
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 5.5;
    const lg = this.ctx.createGain();
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(kind === 'gtr' ? 14 : 8, t + Math.min(dur, 0.4));
    lfo.connect(lg);
    let chain: AudioNode = f;
    if (kind === 'gtr') {
      const ws = this.ctx.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) curve[i] = Math.tanh(((i / 1023) * 2 - 1) * 5);
      ws.curve = curve;
      ws.connect(f);
      chain = ws;
    }
    const types: OscillatorType[] = kind === 'square' ? ['square', 'square'] : kind === 'soft' ? ['sawtooth', 'triangle'] : ['sawtooth', 'sawtooth'];
    types.forEach((ty, k) => {
      const o = this.ctx.createOscillator();
      o.type = ty;
      o.frequency.value = hz(n) * (kind === 'soft' && k === 1 ? 2 : 1);
      o.detune.value = k === 0 ? -6 : 6;
      lg.connect(o.detune);
      o.connect(chain);
      o.start(t);
      o.stop(t + dur + 0.2);
    });
    lfo.start(t);
    lfo.stop(t + dur + 0.2);
    f.connect(g).connect(this.out);
    g.connect(this.delaySend);
    const r = this.ctx.createGain();
    r.gain.value = 0.35;
    g.connect(r).connect(this.revSend);
  }
}
