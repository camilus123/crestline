// In-race HUD, one per player viewport. DOM nodes are only touched when their text changes.

import { Car } from '../sim/car';
import { Race } from '../sim/race';
import { h } from './dom';

const LEDS = 18;

function fmtTime(t: number): string {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
}
function ord(n: number): string {
  const s = ['TH', 'ST', 'ND', 'RD'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

class PlayerHud {
  el: HTMLDivElement;
  private c: Record<string, HTMLElement> = {};
  private last: Record<string, string> = {};
  private leds: HTMLElement[] = [];
  private msgEl: HTMLElement | null = null;
  private msgT = 0;
  private dots: HTMLElement[] = [];
  constructor(root: HTMLElement) {
    const c = this.c;
    c.pos = h('div', { class: 'pos' });
    c.lap = h('div', { class: 'lbl', style: 'margin-top:.4em' });
    c.timeL = h('div', { class: 'lbl' });
    c.time = h('div', { class: 'time' });
    c.scoreL = h('div', { class: 'lbl' });
    c.score = h('div', { class: 'score' });
    c.gap = h('div', { class: 'gap', style: 'display:none' });
    c.spd = h('div', { class: 'spd' });
    c.gear = h('span', { class: 'gear' });
    const rev = h('div', { class: 'rev' });
    for (let i = 0; i < LEDS; i++) {
      const l = h('i');
      rev.appendChild(l);
      this.leds.push(l);
    }
    c.rev = rev;
    c.fuelBar = h('i');
    c.fuel = h('div', { class: 'fuel', style: 'display:none' }, h('div', { class: 'lbl' }, 'FUEL'), h('div', { class: 'bar' }, c.fuelBar));
    c.tag = h('div', { class: 'tag', style: 'display:none' });
    c.prog = h('div', { class: 'prog' });
    c.lights = h('div', { class: 'lights', style: 'display:none' }, h('i'), h('i'), h('i'), h('i'));
    this.el = h('div', { class: 'hud' },
      h('div', { class: 'tl' }, h('div', { class: 'lbl' }, 'POSITION'), c.pos, c.lap),
      h('div', { class: 'tc' }, c.timeL, c.time),
      h('div', { class: 'tr' }, c.scoreL, c.score, h('br'), c.gap),
      h('div', { class: 'bl' }, c.fuel, c.tag),
      h('div', { class: 'br' }, h('div', {}, c.spd, c.gear), c.rev),
      c.prog, c.lights,
    );
    root.appendChild(this.el);
  }
  private set(k: string, v: string, html = false): void {
    if (this.last[k] === v) return;
    this.last[k] = v;
    if (html) this.c[k].innerHTML = v;
    else this.c[k].textContent = v;
  }
  layout(r: [number, number, number, number], scale: number): void {
    const s = this.el.style;
    s.left = r[0] + 'px';
    s.top = r[1] + 'px';
    s.width = r[2] + 'px';
    s.height = r[3] + 'px';
    s.fontSize = scale + 'em';
  }
  message(text: string, sub = '', ms = 1600): void {
    if (this.msgEl) this.msgEl.remove();
    this.msgEl = h('div', { class: 'msg' }, text, sub ? h('small', {}, sub) : null);
    this.el.appendChild(this.msgEl);
    this.msgT = ms / 1000;
  }
  update(race: Race, pi: number, dt: number, other: Car | null): void {
    const car = race.players[pi];
    const d = race.cfg.track;
    const arcade = race.cfg.mode === 'arcade';
    this.set('pos', `${car.position}<small>/${race.cars.length}</small>`, true);
    const cp = Math.min(car.nextCp + 1, d.checkpoints.length);
    this.set('lap', d.circuit ? `LAP ${Math.min(cp, d.laps)}/${d.laps}` : `STAGE ${cp}/${d.checkpoints.length}`);
    if (arcade) {
      this.set('timeL', 'TIME');
      const tl = race.timeLeft[pi];
      this.set('time', String(Math.ceil(Math.max(0, tl))));
      this.c.time.classList.toggle('low', tl < 10 && race.started && !car.finished);
      this.set('scoreL', 'SCORE');
      this.set('score', String(Math.floor(race.score[pi])).padStart(7, '0'));
    } else {
      this.set('timeL', 'RACE TIME');
      this.set('time', fmtTime(car.finished ? car.finishTime : race.time));
      this.c.time.classList.remove('low');
      this.set('scoreL', race.cfg.mode === 'championship' ? 'LEADER' : '');
      const lead = race.cars.reduce((a, b) => (b.position < a.position ? b : a));
      this.set('score', race.cfg.mode === 'championship' ? (lead === car ? 'YOU' : lead.name.toUpperCase()) : '');
    }
    // speed / gear / revs
    this.set('spd', `${Math.round(car.v * 3.6)}<small> KM/H</small>`, true);
    this.set('gear', String(car.gear));
    this.c.gear.classList.toggle('m', car.manual);
    const n = car.rpm / car.spec.redline;
    const lit = Math.round(Math.max(0, Math.min(1, (n - 0.12) / 0.88)) * LEDS);
    const key = lit + (car.limiter ? 'L' : '') + (car.manual ? 'M' : '');
    if (this.last.rev !== key) {
      this.last.rev = key;
      this.leds.forEach((l, i) => {
        l.className = (i < lit ? 'l' : '') + (i >= LEDS - 4 ? ' r' : i >= LEDS - 8 ? ' y' : '') + (car.manual && i >= LEDS - 3 && i < LEDS - 1 ? ' z' : '');
      });
      this.c.rev.classList.toggle('lim', car.limiter);
    }
    // fuel
    const fuel = race.cfg.fuel;
    this.c.fuel.style.display = fuel ? '' : 'none';
    if (fuel) this.c.fuelBar.style.width = (car.fuel * 100).toFixed(1) + '%';
    let tag = '';
    if (car.pitting) tag = 'REFUELLING';
    else if (fuel && race.track.isPit(car.s)) tag = 'PIT LANE';
    else if (fuel && car.fuel < 0.12 && car.fuel > 0) tag = 'LOW FUEL';
    else if (fuel && car.fuel <= 0) tag = 'OUT OF FUEL';
    this.set('tag', tag);
    this.c.tag.style.display = tag ? '' : 'none';
    // two-player gap indicator
    if (other) {
      const dd = car.dist - other.dist;
      const secs = Math.abs(dd) / Math.max(15, other.v);
      const txt = (dd >= 0 ? '▲ ' : '▼ ') + (Math.abs(dd) < 1000 ? Math.round(Math.abs(dd)) + ' m' : (Math.abs(dd) / 1000).toFixed(2) + ' km') + '  ' + secs.toFixed(1) + ' s';
      this.set('gap', txt);
      this.c.gap.style.display = '';
      this.c.gap.className = 'gap ' + (dd >= 0 ? 'up' : 'dn');
    } else this.c.gap.style.display = 'none';
    // progress strip
    const total = d.raceLen;
    if (!this.dots.length) {
      for (const cpv of d.checkpoints.slice(0, -1)) this.c.prog.appendChild(h('b', { style: `left:${(cpv / total) * 100}%` }));
      for (const c of race.cars) {
        const e = h('i', { class: c.isPlayer ? 'me' : '' });
        this.c.prog.appendChild(e);
        this.dots.push(e);
      }
    }
    race.cars.forEach((c, i) => {
      const f = Math.max(0, Math.min(1, c.dist / total));
      this.dots[i].style.left = (f * 100).toFixed(2) + '%';
      if (c === car) this.dots[i].className = 'me';
      else if (c.isPlayer) this.dots[i].style.background = 'var(--cyan)';
    });
    // start lights
    if (!race.started) {
      this.c.lights.style.display = '';
      const on = Math.max(0, Math.min(4, Math.floor((4.0 - race.countdown) / 0.8) + 0));
      Array.from(this.c.lights.children).forEach((l, i) => l.classList.toggle('on', i < on));
      this.c.lights.classList.remove('go');
    } else if (race.time < 1.2) {
      this.c.lights.classList.add('go');
    } else this.c.lights.style.display = 'none';
    if (this.msgT > 0) {
      this.msgT -= dt;
      if (this.msgT <= 0 && this.msgEl) {
        this.msgEl.remove();
        this.msgEl = null;
      }
    }
  }
  clear(): void {
    this.msgEl?.remove();
    this.msgEl = null;
    this.msgT = 0;
  }
  destroy(): void {
    this.el.remove();
  }
}

export class Hud {
  players: PlayerHud[] = [];
  root: HTMLElement;
  private splitEl: HTMLElement | null = null;
  constructor(parent: HTMLElement, n: number) {
    this.root = h('div', { style: 'position:absolute;inset:0;pointer-events:none' });
    parent.appendChild(this.root);
    for (let i = 0; i < n; i++) this.players.push(new PlayerHud(this.root));
    if (n > 1) {
      this.splitEl = h('div', { class: 'split' });
      this.root.appendChild(this.splitEl);
    }
  }
  layout(rects: [number, number, number, number][], H: number): void {
    rects.forEach((r, i) => this.players[i]?.layout(r, r[3] < H * 0.75 ? 0.78 : 1));
    if (this.splitEl && rects[1]) this.splitEl.style.top = rects[1][1] - 2 + 'px';
  }
  update(race: Race, dt: number): void {
    this.players.forEach((p, i) => p.update(race, i, dt, race.players.length > 1 ? race.players[1 - i] : null));
  }
  message(i: number, text: string, sub = '', ms = 1600): void {
    if (i < 0) this.players.forEach((p) => p.message(text, sub, ms));
    else this.players[i]?.message(text, sub, ms);
  }
  clearMessages(): void {
    this.players.forEach((p) => p.clear());
  }
  destroy(): void {
    this.root.remove();
  }
}

export { fmtTime, ord };
