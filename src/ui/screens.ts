// All menu screens. Each returns { el, onKey, update?, destroy? }.

import type { Game } from '../game';
import { MenuKey, ACTIONS, ACTION_LABELS, DEFAULT_BINDINGS } from '../input';
import { CARS } from '../sim/specs';
import { fuelPlan } from '../sim/race';
import { BENCH_PRESETS, BENCH_TRACKS, type BenchReport } from '../bench';
import { LIVERIES } from '../sim/roster';
import { decodeCode, normalizeCode } from '../track/codes';
import { SCENARIO_NAMES } from '../track/defs';
import { QUALITY, type Quality } from '../render/renderer';
import { SONGS } from '../audio/music';
import { choiceRow, h, Menu, sliderRow, store, toast } from './dom';
import { fmtTime, ord } from './hud';
import { buildConstructor } from './constructor';

export interface Screen {
  el: HTMLElement;
  onKey?: (k: MenuKey) => void;
  update?: (dt: number) => void;
  destroy?: () => void;
}

const css = (c: number[]) => `rgb(${c.map((v) => Math.round(Math.pow(Math.min(1, v), 1 / 2.2) * 255)).join(',')})`;

export function build(g: Game, id: string, arg?: any): Screen | null {
  switch (id) {
    case 'title': return title(g);
    case 'setup': return setup(g);
    case 'music': return music(g);
    case 'cars': return carSelect(g, arg?.player ?? 0);
    case 'grid': return grid(g);
    case 'race': return { el: h('div', { class: 'scr', style: 'pointer-events:none' }), onKey: (k) => { if (k === 'back') g.setPaused(true); } };
    case 'pause': return pause(g);
    case 'results': return results(g, arg?.qualified);
    case 'over': return over(g);
    case 'settings': return settings(g, arg?.back ?? 'setup');
    case 'controls': return controls(g, arg?.back ?? 'setup');
    case 'constructor': return buildConstructor(g);
    case 'bench': return bench(g);
    case 'graphics': return graphics(g, arg?.back ?? 'settings');
  }
  return null;
}

function hdr(title: string): HTMLElement {
  return h('div', { class: 'hdr' }, h('div', { class: 'logo' }, 'CRESTLINE'), h('div', { class: 'ttl' }, title));
}
function hint(...parts: [string, string][]): HTMLElement {
  return h('div', { class: 'hint' }, ...parts.map(([k, v]) => h('span', {}, h('b', {}, k), ' ' + v)));
}
const STD_HINT = hint(['↑↓', 'SELECT'], ['←→', 'CHANGE'], ['ENTER / A', 'CONFIRM'], ['ESC / B', 'BACK']);

function bind(menu: Menu, el: HTMLElement, row: number, col: number, extra: { activate?: () => void; enabled?: () => boolean } = {}): HTMLElement {
  const adj = (el as any)._adjust as ((d: number) => boolean) | undefined;
  menu.add({ el, row, col, adjust: adj, activate: extra.activate, enabled: extra.enabled });
  return el;
}

// ---------------------------------------------------------------- title
function title(g: Game): Screen {
  const el = h('div', { class: 'scr title scan' },
    h('div', { class: 'shine' }, h('div', { class: 'logo big' }, 'CRESTLINE')),
    h('div', { class: 'sub', style: 'font-size:1.6rem;margin-top:1.4vh' }, 'MAXIMUM DRIVE'),
    h('div', { class: 'press blink' }, 'PRESS ANY KEY'),
    h('div', { class: 'foot' }, 'KEYBOARD · GAMEPAD · MOUSE · TOUCH    ·    F2 FULLSCREEN    ·    F3 PERFORMANCE'),
    h('div', { class: 'ver' }, 'v' + __VERSION__ + '  ·  build ' + __BUILD_TIME__.slice(0, 16).replace('T', ' ') + ' UTC'),
  );
  const born = performance.now();
  const go = () => {
    if (performance.now() - born < 400) return;
    g.sfx('ok');
    g.show('setup');
  };
  const kd = () => go();
  window.addEventListener('keydown', kd);
  el.addEventListener('pointerdown', go);
  return { el, onKey: go, destroy: () => window.removeEventListener('keydown', kd) };
}

// ---------------------------------------------------------------- main setup
function setup(g: Game): Screen {
  const st = g.settings;
  const menu = new Menu(g.sfx);
  const save = () => g.saveSettings();
  const MODES = ['arcade', 'championship'] as const;
  const COURSES = ['easy', 'medium', 'hard', 'custom', 'sequence'] as const;
  const courseNames = ['Easy · 7', 'Medium · 10', 'Hard · 15', 'Custom track', 'Custom sequence'];

  // drivers
  const dr = h('div', { class: 'panel' }, h('h3', {}, 'DRIVERS'));
  const pRow = choiceRow('Players', ['1 Player', '2 Players'], () => st.players - 1, (i) => { st.players = i + 1; save(); refresh(); });
  dr.append(bind(menu, pRow, 0, 0));
  const nameIn: HTMLInputElement[] = [];
  for (let p = 0; p < 2; p++) {
    const inp = h('input', { class: 'txt', maxlength: 12, value: st.names[p], style: 'width:9em' }) as HTMLInputElement;
    inp.addEventListener('input', () => { st.names[p] = inp.value.toUpperCase().slice(0, 12) || `PLAYER ${p + 1}`; save(); });
    inp.addEventListener('focus', () => (g.input.typing = true));
    inp.addEventListener('blur', () => (g.input.typing = false));
    nameIn.push(inp);
    const nr = h('div', { class: 'row' }, h('span', { class: 'lab' }, `Player ${p + 1} name`), h('span', { class: 'val' }, inp));
    const en = () => p === 0 || st.players > 1;
    dr.append(bind(menu, nr, 1 + p * 3, 0, { activate: () => { inp.focus(); inp.select(); }, enabled: en }));
    const gr = choiceRow(`P${p + 1} gears`, ['Automatic', 'Manual'], () => (st.manual[p] ? 1 : 0), (i) => { st.manual[p] = i === 1; save(); });
    dr.append(bind(menu, gr, 2 + p * 3, 0, { enabled: en }));
    const ar = choiceRow(`P${p + 1} accelerate`, ['On Up', 'On button'], () => (st.accelButton[p] ? 1 : 0), (i) => { st.accelButton[p] = i === 1; save(); });
    dr.append(bind(menu, ar, 3 + p * 3, 0, { enabled: en }));
  }
  // race
  const rc = h('div', { class: 'panel' }, h('h3', {}, 'RACE'));
  const mRow = choiceRow('Game mode', ['Arcade', 'Championship'], () => MODES.indexOf(st.mode), (i) => { st.mode = MODES[i]; save(); refresh(); });
  rc.append(bind(menu, mRow, 0, 1));
  const cRow = choiceRow('Course', courseNames, () => COURSES.indexOf(st.course), (i) => { st.course = COURSES[i]; save(); refresh(); });
  rc.append(bind(menu, cRow, 1, 1));
  const codeIn = h('input', { class: 'txt', maxlength: 32, value: st.customCode, style: 'width:11em' }) as HTMLInputElement;
  codeIn.addEventListener('input', () => { st.customCode = codeIn.value; save(); refreshInfo(); });
  codeIn.addEventListener('focus', () => (g.input.typing = true));
  codeIn.addEventListener('blur', () => { g.input.typing = false; });
  const codeRow = h('div', { class: 'row' }, h('span', { class: 'lab' }, 'Track code'), h('span', { class: 'val' }, codeIn));
  rc.append(bind(menu, codeRow, 2, 1, { activate: () => { codeIn.focus(); codeIn.select(); }, enabled: () => st.course === 'custom' }));
  const seqIn = h('textarea', { class: 'txt', placeholder: 'ONE CODE OR NAME PER LINE' }) as HTMLTextAreaElement;
  seqIn.value = st.sequence;
  seqIn.addEventListener('input', () => { st.sequence = seqIn.value; save(); refreshInfo(); });
  seqIn.addEventListener('focus', () => (g.input.typing = true));
  seqIn.addEventListener('blur', () => (g.input.typing = false));
  const seqRow = h('div', { class: 'row', style: 'flex-direction:column;align-items:stretch' }, h('span', { class: 'lab' }, 'Custom sequence'), seqIn);
  rc.append(bind(menu, seqRow, 3, 1, { activate: () => seqIn.focus(), enabled: () => st.course === 'sequence' }));
  const info = h('div', { class: 'info', style: 'margin-top:.6rem' });
  rc.append(info);
  // options column
  const op = h('div', { class: 'col', style: 'flex:.7;justify-content:flex-end;gap:.8rem' });
  const btn = (label: string, row: number, fn: () => void, cls = '') => {
    const b = h('div', { class: 'btn ' + cls }, h('span', {}, label));
    op.append(bind(menu, b, row, 2, { activate: fn }));
    return b;
  };
  btn('Track constructor', 1, () => g.show('constructor'));
  btn('Controls', 2, () => g.show('controls', { back: 'setup' }));
  btn('Settings', 3, () => g.show('settings', { back: 'setup' }));
  const startB = btn('Start', 6, () => {
    g.startSession(st.mode, st.course);
    g.show('music');
  }, 'go');
  const best = h('div', { class: 'info panel', style: 'margin-bottom:auto' });
  op.prepend(best);

  const refreshInfo = () => {
    const codes = g.courseCodes(st.mode, st.course);
    let txt = '';
    if (st.course === 'custom') {
      const c = normalizeCode(st.customCode || '');
      const p = decodeCode(c.code);
      txt = `<b>${c.code}</b>${c.direct ? '' : ' (from your text)'}<br>${SCENARIO_NAMES[p.scenario]} · ${p.type ? 'stages' : 'laps'} · difficulty ${Math.round(p.difficulty * 4)}%`;
    } else if (st.course === 'sequence') {
      txt = `<b>${codes.length}</b> race${codes.length === 1 ? '' : 's'}: ` + codes.slice(0, 8).map((c) => normalizeCode(c).code).join(' · ');
    } else {
      txt = `<b>${codes.length} races</b>: ` + codes.map((c) => SCENARIO_NAMES[decodeCode(c).scenario]).join(' · ');
    }
    txt += st.mode === 'arcade' ? '<br>Beat the clock. Checkpoints extend your time. Highest score wins.' : '<br>Season against 19 rivals. Finish in the top ten to stay in. Every race needs one fuel stop: stop on the pit strip on the right to refuel.';
    info.innerHTML = txt;
    const key = `${st.mode}:${st.course}${st.course === 'custom' ? ':' + normalizeCode(st.customCode).code : ''}`;
    const list = g.bestScores[key];
    best.innerHTML = '<h3>BEST SCORES</h3>' + (st.mode === 'arcade' && list?.length ? list.map((x, i) => `${i + 1}. <b>${x.name}</b> &nbsp; ${x.score.toLocaleString('en')}`).join('<br>') : st.mode === 'arcade' ? 'No scores yet.' : 'Points: 25 · 18 · 15 · 12 · 10 · 8 · 6 · 4 · 2 · 1<br>The next grid reverses your result.');
  };
  const refresh = () => {
    menu.items.forEach((it) => (it.el as any)._paint?.());
    menu.paint();
    refreshInfo();
  };
  const el = h('div', { class: 'scr bg scan' }, hdr('RACE SETUP'),
    h('div', { class: 'body' }, h('div', { class: 'col' }, dr), h('div', { class: 'col' }, rc), op),
    STD_HINT.cloneNode(true) as HTMLElement);
  menu.setFocus(startB);
  refresh();
  menu.onBack = () => g.show('title');
  return {
    el,
    onKey: (k) => {
      if (g.input.typing) {
        if (k === 'ok' || k === 'back') (document.activeElement as HTMLElement)?.blur();
        return;
      }
      menu.key(k);
    },
  };
}

// ---------------------------------------------------------------- music (CD player)
function music(g: Game): Screen {
  const st = g.settings;
  const menu = new Menu(g.sfx);
  const disc = h('div', { class: 'cd' });
  const lcdNum = h('div', { class: 'big' });
  const lcdName = h('div', { style: 'font-size:1.2rem;margin-top:.3rem' });
  const lcdStyle = h('div', { style: 'opacity:.75;font-size:.8rem' });
  const eq = h('div', { class: 'eq' });
  const bars: HTMLElement[] = [];
  for (let i = 0; i < 24; i++) { const b = h('i'); eq.append(b); bars.push(b); }
  const lcd = h('div', { class: 'lcd' }, lcdNum, lcdName, lcdStyle, eq);
  const list = h('div', { class: 'panel' }, h('h3', {}, 'SELECT TRACK'));
  const entries = [...SONGS.map((s, i) => ({ i, name: s.name, style: s.style })), { i: -1, name: 'Effects only', style: 'Engines and atmosphere' }];
  const paint = () => {
    const e = entries.find((x) => x.i === st.song) ?? entries[0];
    lcdNum.textContent = st.song >= 0 ? `TRACK ${String(st.song + 1).padStart(2, '0')}` : 'FX ONLY';
    lcdName.textContent = e.name.toUpperCase();
    lcdStyle.textContent = e.style.toUpperCase();
    disc.classList.toggle('play', st.song >= 0);
    rows.forEach((r, k) => r.querySelector('.val')!.textContent = entries[k].i === st.song ? '▶ PLAYING' : '');
  };
  const rows: HTMLElement[] = [];
  entries.forEach((e, k) => {
    const r = h('div', { class: 'row' }, h('span', {}, h('b', { class: 'mono', style: 'color:var(--cyan);margin-right:.8em' }, e.i >= 0 ? String(e.i + 1).padStart(2, '0') : '--'), e.name.toUpperCase(), h('span', { class: 'info', style: 'margin-left:.8em' }, e.style)), h('span', { class: 'val' }));
    rows.push(r);
    list.append(bind(menu, r, k, 0, {
      activate: () => {
        st.song = e.i;
        g.saveSettings();
        g.audio.init();
        if (e.i >= 0) g.audio.music?.play(e.i);
        else g.audio.music?.stop();
        paint();
      },
    }));
  });
  const vol = h('div', { class: 'panel' }, h('h3', {}, 'VOLUME'));
  vol.append(bind(menu, sliderRow('Music', () => Math.round(st.musicVol * 20), (v) => { st.musicVol = v / 20; g.audio.setVolumes(st.musicVol, st.sfxVol); g.saveSettings(); }, 20), entries.length, 0));
  vol.append(bind(menu, sliderRow('Effects', () => Math.round(st.sfxVol * 20), (v) => { st.sfxVol = v / 20; g.audio.setVolumes(st.musicVol, st.sfxVol); g.saveSettings(); }, 20), entries.length + 1, 0));
  const cont = h('div', { class: 'btn go', style: 'margin-top:1rem' }, h('span', {}, 'Continue'));
  bind(menu, cont, entries.length + 2, 0, { activate: () => g.show('cars', { player: 0 }) });
  const el = h('div', { class: 'scr bg scan' }, hdr('IN-CAR AUDIO'),
    h('div', { class: 'body', style: 'align-items:center' },
      h('div', { class: 'col', style: 'align-items:center;justify-content:center;gap:2rem' }, disc, lcd),
      h('div', { class: 'col', style: 'justify-content:center' }, list, vol, cont)),
    STD_HINT.cloneNode(true) as HTMLElement);
  menu.setFocus(cont);
  paint();
  menu.onBack = () => g.show('setup');
  let t = 0;
  return {
    el, onKey: (k) => menu.key(k),
    update: (dt) => {
      t += dt;
      const playing = st.song >= 0 && g.audio.music?.playing;
      bars.forEach((b, i) => (b.style.height = (playing ? 12 + 88 * Math.abs(Math.sin(t * (3 + (i % 5)) + i * 1.7)) * (0.5 + 0.5 * Math.sin(t * 1.3 + i)) : 6) + '%'));
    },
  };
}

// ---------------------------------------------------------------- car select
function carSelect(g: Game, player: number): Screen {
  const st = g.settings;
  let car = st.cars[player] ?? 0;
  let livery = st.colors[player] ?? player;
  g.showroom = { car, livery, angle: 2.4 };
  const name = h('div', { class: 'carname' });
  const make = h('div', { class: 'carmake' });
  const blurb = h('div', { class: 'info carblurb' });
  const stats = h('div', { class: 'carstats' });
  const sw = h('div', { class: 'swatches' });
  const paint = () => {
    const c = CARS[car];
    g.showroom = { ...g.showroom!, car, livery };
    name.textContent = c.model.toUpperCase();
    make.textContent = c.make.toUpperCase();
    blurb.textContent = c.blurb;
    stats.innerHTML = '';
    const z100 = estimate0to100(car);
    const rows: [string, number, string][] = [
      ['Top speed', c.stats.speed, `${Math.round(c.vTop * 3.6)} km/h`],
      ['Acceleration', c.stats.accel, `${z100.toFixed(1)} s 0-100`],
      ['Handling', c.stats.handling, `${Math.round(c.grip / 9.81 * 100) / 100} g`],
      ['Power', c.power / 420000, `${Math.round(c.power / 1000)} kW`],
    ];
    for (const [l, v, txt] of rows) stats.append(h('div', { class: 'stat' }, h('span', {}, l), h('div', { class: 'bar' }, h('i', { style: `width:${v * 100}%` })), h('span', { class: 'mono' }, txt)));
    sw.innerHTML = '';
    LIVERIES.slice(0, 12).forEach((L, i) => {
      const taken = st.players > 1 && player === 1 && i === st.colors[0];
      sw.append(h('i', {
        class: (i === livery ? 'on' : '') + (taken ? ' taken' : ''), style: `background:linear-gradient(135deg,${css(L[0])} 60%,${css(L[1])} 60%)`,
        onclick: () => { if (taken) return; livery = i; g.sfx('move'); paint(); },
      }));
    });
  };
  const step = (d: number) => { car = (car + (d < 0 ? 2 : 1)) % 3; g.sfx('move'); paint(); };
  const back = () => {
    g.sfx('back');
    if (player > 0) g.show('cars', { player: player - 1 });
    else { g.showroom = null; g.show('music'); }
  };
  // everything here works by mouse and by touch as well as keys: tap the arrows (or swipe) for the car,
  // tap a swatch for the colour
  const el = h('div', { class: 'scr scan carsel' },
    hdr(st.players > 1 ? `PLAYER ${player + 1} · CHOOSE YOUR CAR` : 'CHOOSE YOUR CAR'),
    h('div', { class: 'carinfo' }, make, name, blurb, stats, sw),
    h('div', { class: 'carbtns' },
      h('div', { class: 'btn', onclick: () => back() }, h('span', {}, 'Back')),
      h('div', { class: 'btn go', onclick: () => confirm() }, h('span', {}, 'Select'))),
    h('div', { class: 'carhint' }, hint(['←→', 'CAR'], ['↑↓', 'COLOUR'], ['ENTER / A', 'SELECT'], ['ESC / B', 'BACK'])),
  );
  el.append(
    h('div', { class: 'cararrow l', onclick: () => step(-1) }, h('span', {}, '◀')),
    h('div', { class: 'cararrow r', onclick: () => step(1) }, h('span', {}, '▶')),
  );
  el.addEventListener('wheel', (e) => { car = (car + (e.deltaY > 0 ? 1 : 2)) % 3; paint(); });
  // swipe left / right across the car
  let sx = 0, sy = 0, sid = -1;
  el.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') { sid = e.pointerId; sx = e.clientX; sy = e.clientY; } });
  el.addEventListener('pointerup', (e) => {
    if (e.pointerId !== sid) return;
    sid = -1;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
  });
  el.addEventListener('pointercancel', () => { sid = -1; });
  const confirm = () => {
    st.cars[player] = car;
    st.colors[player] = livery;
    g.saveSettings();
    g.sfx('ok');
    if (player + 1 < st.players) g.show('cars', { player: player + 1 });
    else {
      g.showroom = null;
      g.show('grid');
    }
  };
  paint();
  return {
    el,
    onKey: (k) => {
      if (k === 'left' || k === 'right') step(k === 'left' ? -1 : 1);
      if (k === 'up' || k === 'down') {
        do { livery = (livery + (k === 'up' ? 11 : 1)) % 12; } while (st.players > 1 && livery === st.colors[1 - player] && player === 1);
        g.sfx('move');
        paint();
      }
      if (k === 'ok') confirm();
      if (k === 'back') back();
    },
    destroy: () => {},
  };
}

function estimate0to100(id: number): number {
  const c = CARS[id];
  let v = 0, t = 0;
  while (v < 27.78 && t < 20) {
    const a = Math.min(c.traction * 9.81, (c.power * 0.85) / (c.mass * Math.max(4, v))) - (c.cd * v * v) / c.mass;
    v += a * 0.01;
    t += 0.01;
  }
  return t + 0.35;
}

// ---------------------------------------------------------------- starting grid
function grid(g: Game): Screen {
  const S = g.session!;
  const race = g.prepareRace();
  const d = race.cfg.track;
  const slots = race.cars.map((c) => ({ c, slot: 0 }));
  // derive slots from the grid positions (dist)
  const order = race.cars.slice().sort((a, b) => b.dist - a.dist);
  const gridEl = h('div', { class: 'gridslots' });
  order.forEach((c, i) => {
    const L = LIVERIES[c.color % LIVERIES.length];
    gridEl.append(h('div', { class: 'slot' + (c.isPlayer ? ' me' : ''), style: `animation-delay:${i * 0.03}s` }, h('span', { class: 'n' }, String(i + 1)), h('span', { class: 'sw', style: `background:${css(L[0])}` }), c.name.toUpperCase(), h('span', { class: 'info', style: 'margin-left:auto' }, CARS[c.spec.id].model)));
  });
  void slots;
  const p = d.params;
  const tl = race.segTimes[0];
  const info = h('div', { class: 'panel' }, h('h3', {}, `RACE ${S.index + 1} OF ${S.codes.length}`),
    h('div', { class: 'code' }, d.code),
    h('div', { class: 'info', html: `<b>${d.scen.name.toUpperCase()}</b> · ${d.circuit ? `${d.laps} laps of ${(d.lapLen / 1000).toFixed(2)} km` : `${d.checkpoints.length} stages`} · ${(d.raceLen / 1000).toFixed(1)} km<br>` +
      (S.mode === 'arcade' ? `Time for the first ${d.circuit ? 'lap' : 'stage'}: <b>${tl} s</b> · score so far <b>${S.score.map((x) => x.toLocaleString('en')).join(' / ')}</b>` : `${race.cfg.fuel ? `<b>One fuel stop needed</b> – a full tank lasts about ${(fuelPlan(d).tank / 1000).toFixed(1)} km of ${(d.raceLen / 1000).toFixed(1)} km. Stop on the pit strip on the right after the ` + (d.circuit ? 'start line' : 'checkpoints') + (d.scen.pitSigns ? '' : ' (no signs on mountain roads)') : 'No fuel stop needed'}`) +
      `<br>Difficulty ${Math.round(p.difficulty * 4)}% · curves ${Math.round(p.curves * 4)}% · hills ${Math.round(p.hills * 4)}%`
      + (g.bestTimes[d.code] ? `<br>Best time: <b>${fmtTime(g.bestTimes[d.code].time)}</b> by ${g.bestTimes[d.code].name}` : '') }));
  // championship standings
  const stand = h('div', { class: 'panel', style: 'flex:1;min-height:0;overflow:hidden' }, h('h3', {}, S.mode === 'championship' ? 'STANDINGS' : 'ARCADE'));
  if (S.mode === 'championship' && S.results.length) stand.append(standingsTable(g, 10));
  else stand.append(h('div', { class: 'info', html: S.mode === 'championship' ? 'The season begins. You start from the back of the grid.' : 'Pass checkpoints to add time. Overtakes, checkpoints and time left all add to your score.' }));
  const ctl = h('div', { class: 'panel' }, h('h3', {}, 'CONTROLS'));
  for (let i = 0; i < g.settings.players; i++) {
    const B = g.input.bindings[i];
    const k = (a: keyof typeof B) => B[a].filter((x) => !x.startsWith('pad:')).slice(0, 2).map((x) => `<span class="kb">${g.input.describe(x)}</span>`).join('');
    const accel = g.settings.accelButton[i] ? k('accel') : k('up');
    ctl.append(h('div', { class: 'info', html: `<b>P${i + 1}</b> steer ${k('left')}${k('right')} accelerate ${accel} brake ${k('down')}${g.settings.manual[i] ? ` gears ${k('gearUp')}${k('gearDown')}` : ' (automatic)'} · pause ${k('pause')}` }));
  }
  const go = h('div', { class: 'btn go' }, h('span', {}, 'Race'));
  const menu = new Menu(g.sfx);
  bind(menu, go, 0, 0, { activate: () => g.enterRace() });
  menu.setFocus(go);
  menu.onBack = () => { g.session = null; g.show('setup'); };
  const el = h('div', { class: 'scr bg scan' }, hdr('STARTING GRID'),
    h('div', { class: 'body' }, h('div', { class: 'col', style: 'flex:1.2' }, h('div', { class: 'panel', style: 'flex:1' }, h('h3', {}, 'GRID'), gridEl)),
      h('div', { class: 'col' }, info, stand, ctl, go)),
    hint(['ENTER / A', 'RACE'], ['ESC / B', 'QUIT TO SETUP']));
  return { el, onKey: (k) => menu.key(k) };
}

function standingsTable(g: Game, rows: number): HTMLElement {
  const S = g.session!;
  const list = [...S.points.entries()].sort((a, b) => b[1] - a[1]);
  const players = new Set(g.settings.names.slice(0, g.settings.players));
  const t = h('table', { class: 't' }, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Driver'), h('th', {}, 'Points')));
  list.slice(0, rows).forEach(([n, p], i) => t.append(h('tr', { class: players.has(n) ? 'me' : '' }, h('td', {}, String(i + 1)), h('td', {}, n.toUpperCase()), h('td', { class: 'mono' }, String(p)))));
  // make sure the players are listed
  list.forEach(([n, p], i) => { if (i >= rows && players.has(n)) t.append(h('tr', { class: 'me' }, h('td', {}, String(i + 1)), h('td', {}, n.toUpperCase()), h('td', { class: 'mono' }, String(p)))); });
  return t;
}

// ---------------------------------------------------------------- pause
function pause(g: Game): Screen {
  const menu = new Menu(g.sfx);
  const panel = h('div', { class: 'panel', style: 'width:26rem' }, h('h3', {}, 'PAUSED'));
  const resume = () => { g.paused = false; g.audio.pause(false); g.show('race'); };
  const items: [string, () => void][] = [
    ['Resume', resume],
    ['Restart race', () => { g.audio.pause(false); g.restartRace(); }],
    ['Settings', () => g.show('settings', { back: 'pause' })],
    ['Controls', () => g.show('controls', { back: 'pause' })],
    ['Quit to setup', () => { g.audio.pause(false); g.quitRace(); }],
  ];
  items.forEach(([l, fn], i) => panel.append(bind(menu, h('div', { class: 'row' }, h('span', { class: 'lab', style: 'font-size:1rem' }, l)), i, 0, { activate: fn })));
  menu.focus = 0;
  menu.paint();
  menu.onBack = resume;
  const el = h('div', { class: 'scr', style: 'align-items:center;justify-content:center;background:rgba(6,3,20,.55)' }, panel);
  return { el, onKey: (k) => menu.key(k) };
}

// ---------------------------------------------------------------- results
function results(g: Game, qualified: boolean): Screen {
  const S = g.session!;
  const res = S.results[S.results.length - 1];
  const r = g.race!;
  const t = h('table', { class: 't' }, h('tr', {}, h('th', {}, 'Pos'), h('th', {}, 'Driver'), h('th', {}, 'Car'), h('th', {}, 'Time'), S.mode === 'championship' ? h('th', {}, 'Pts') : null));
  const winner = res[0].time;
  res.forEach((x, i) => {
    const L = LIVERIES[x.color % LIVERIES.length];
    t.append(h('tr', { class: (x.isPlayer ? 'me' : '') + (S.mode === 'championship' && i === 10 ? ' cut' : '') },
      h('td', {}, ord(x.pos)), h('td', {}, h('span', { class: 'sw', style: `background:${css(L[0])}` }), x.name.toUpperCase()), h('td', {}, CARS[x.car].model),
      h('td', { class: 'mono' }, i === 0 ? fmtTime(x.time) : '+' + (x.time - winner).toFixed(2) + (x.projected ? '*' : '')),
      S.mode === 'championship' ? h('td', { class: 'mono' }, x.points ? '+' + x.points : '') : null));
  });
  const side = h('div', { class: 'col' });
  const status = h('div', { class: 'panel' });
  if (S.mode === 'arcade') {
    status.append(h('h3', {}, 'SCORE'));
    r.players.forEach((p, i) => status.append(h('div', { class: 'info', html: `<b>${p.name}</b>: ${p.finished ? 'finished ' + ord(p.position) + ' · time bonus ' + Math.round(r.timeLeft[i] * 100) : 'out of time'}<br><span class="code">${S.score[i].toLocaleString('en')}</span>` })));
  } else {
    status.append(h('h3', {}, 'CHAMPIONSHIP'));
    side.append(h('div', { class: 'panel' }, h('h3', {}, 'STANDINGS'), standingsTable(g, 10)));
  }
  const msg = S.won ? (S.mode === 'championship' ? 'SEASON COMPLETE' : 'COURSE COMPLETE') : qualified ? (S.mode === 'championship' ? 'QUALIFIED · TOP TEN' : 'QUALIFIED') : S.mode === 'championship' ? 'NOT QUALIFIED' : 'TIME UP';
  status.prepend(h('div', { class: 'carname', style: `font-size:2.4rem;margin-bottom:.6rem;color:${qualified ? 'var(--lime)' : '#ff4a4a'}` }, msg));
  side.prepend(status);
  const next = h('div', { class: 'btn go' }, h('span', {}, S.over ? 'Continue' : 'Next race'));
  side.append(next);
  const menu = new Menu(g.sfx);
  bind(menu, next, 0, 0, { activate: () => g.nextFromResults() });
  menu.setFocus(next);
  const el = h('div', { class: 'scr bg scan' }, hdr('RACE RESULTS'),
    h('div', { class: 'body' }, h('div', { class: 'col', style: 'flex:1.3' }, h('div', { class: 'panel', style: 'flex:1;overflow:hidden' }, t, h('div', { class: 'info', style: 'margin-top:.4rem' }, '* projected from race pace'))), side),
    hint(['ENTER / A', 'CONTINUE']));
  return { el, onKey: (k) => menu.key(k) };
}

function over(g: Game): Screen {
  const S = g.session!;
  const panel = h('div', { class: 'panel', style: 'width:min(46rem,90vw)' });
  if (S.mode === 'championship') {
    const list = [...S.points.entries()].sort((a, b) => b[1] - a[1]);
    const champ = list[0];
    const pl = new Set(g.settings.names.slice(0, g.settings.players));
    panel.append(h('div', { class: 'carname', style: 'font-size:2.8rem' }, S.won ? (pl.has(champ[0]) ? 'CHAMPION!' : 'SEASON OVER') : 'GAME OVER'),
      h('div', { class: 'info', html: `Champion: <b>${champ[0].toUpperCase()}</b> with ${champ[1]} points · ${S.results.length} of ${S.codes.length} races run` }), standingsTable(g, 10));
  } else {
    panel.append(h('div', { class: 'carname', style: 'font-size:2.8rem' }, S.won ? 'COURSE COMPLETE' : 'GAME OVER'),
      h('div', { class: 'info' }, `${S.results.length} of ${S.codes.length} races`),
      ...S.score.map((s, i) => h('div', { style: 'margin-top:.6rem' }, h('span', { class: 'lab' }, (g.settings.names[i] || '') + '  '), h('span', { class: 'code' }, s.toLocaleString('en')))));
    const list = g.bestScores[S.courseKey] ?? [];
    panel.append(h('h3', { style: 'margin-top:1rem' }, 'BEST SCORES'), h('div', { class: 'info', html: list.map((x, i) => `${i + 1}. <b>${x.name}</b> ${x.score.toLocaleString('en')}`).join('<br>') }));
  }
  const menu = new Menu(g.sfx);
  const b = h('div', { class: 'btn go', style: 'margin-top:1rem' }, h('span', {}, 'Main menu'));
  panel.append(b);
  bind(menu, b, 0, 0, { activate: () => { g.session = null; g.startAttract(); g.show('setup'); } });
  menu.setFocus(b);
  const el = h('div', { class: 'scr bg scan', style: 'align-items:center;justify-content:center' }, panel);
  return { el, onKey: (k) => menu.key(k) };
}

// ---------------------------------------------------------------- settings
function settings(g: Game, back: string): Screen {
  const st = g.settings;
  const menu = new Menu(g.sfx);
  const panel = h('div', { class: 'panel', style: 'width:min(44rem,92vw)' }, h('h3', {}, 'SETTINGS'));
  let r = 0;
  const add = (el: HTMLElement, extra: any = {}) => panel.append(bind(menu, el, r++, 0, extra));
  // picking a preset sets every graphics option to that preset's values; 'Graphics options' changes them one by one
  const presetRow = choiceRow('Quality preset', QUALITY.map((q) => q.name), () => st.quality, (i) => { st.quality = i; st.qo = {}; g.applyQuality(); g.saveSettings(); });
  add(presetRow);
  add(h('div', { class: 'row' }, h('span', { class: 'lab' }, 'Graphics options'), h('span', { class: 'val' }, (g.effectiveQuality().name.endsWith('(custom)') ? 'CUSTOM ' : '') + '▶')), { activate: () => g.show('graphics', { back }) });
  add(choiceRow('Dynamic resolution', ['Off', 'On'], () => (st.dynRes ? 1 : 0), (i) => { st.dynRes = i === 1; g.saveSettings(); }));
  add(sliderRow('Music volume', () => Math.round(st.musicVol * 20), (v) => { st.musicVol = v / 20; g.audio.setVolumes(st.musicVol, st.sfxVol); g.saveSettings(); }, 20));
  add(sliderRow('Effects volume', () => Math.round(st.sfxVol * 20), (v) => { st.sfxVol = v / 20; g.audio.setVolumes(st.musicVol, st.sfxVol); g.saveSettings(); }, 20));
  add(choiceRow('Camera shake', ['Off', 'On'], () => (st.shake ? 1 : 0), (i) => { st.shake = i === 1; g.saveSettings(); }));
  add(choiceRow('Performance overlay (F3)', ['Off', 'On'], () => (st.fps ? 1 : 0), (i) => { st.fps = i === 1; g.saveSettings(); }));
  add(h('div', { class: 'row' }, h('span', { class: 'lab' }, 'Fullscreen (F2)'), h('span', { class: 'val' }, 'TOGGLE')), { activate: () => g.toggleFullscreen() });
  add(h('div', { class: 'row' }, h('span', { class: 'lab' }, 'Controls'), h('span', { class: 'val' }, '▶')), { activate: () => g.show('controls', { back: 'settings' }) });
  if (back !== 'pause') add(h('div', { class: 'row' }, h('span', { class: 'lab' }, 'Benchmark'), h('span', { class: 'val' }, 'RUN ▶')), { activate: () => g.show('bench') });
  add(h('div', { class: 'row' }, h('span', { class: 'lab' }, 'Back'), h('span', { class: 'val' }, '')), { activate: () => g.show(back) });
  panel.append(h('div', { class: 'info', style: 'margin-top:.8rem' }, 'Speeds in km/h, distances in km and metres. Settings and best times are saved in this browser.'));
  menu.focus = 0;
  menu.paint();
  menu.onBack = () => g.show(back);
  const el = h('div', { class: 'scr bg scan', style: back === 'pause' ? 'background:rgba(6,3,20,.7)' : '' }, hdr('SETTINGS'), h('div', { class: 'body', style: 'justify-content:center' }, panel), STD_HINT.cloneNode(true) as HTMLElement);
  return { el, onKey: (k) => menu.key(k) };
}

// ---------------------------------------------------------------- graphics options
/** Every option a quality preset sets, adjustable on its own. Values are the steps offered. */
const GFX: { key: keyof Quality; label: string; vals: (number | boolean)[]; fmt: (v: any) => string; note?: string }[] = [
  { key: 'scale', label: 'Render resolution', vals: [0.5, 0.6, 0.7, 0.75, 0.8, 0.9, 1], fmt: (v) => Math.round(v * 100) + ' %' },
  { key: 'minScale', label: 'Dynamic resolution floor', vals: [0.4, 0.5, 0.6, 0.75, 0.85, 1], fmt: (v) => Math.round(v * 100) + ' %' },
  { key: 'dpr', label: 'Pixel ratio limit (phones)', vals: [1, 1.25, 1.5, 2, 3], fmt: (v) => '×' + v },
  { key: 'msaa', label: 'Anti-aliasing (MSAA)', vals: [0, 2, 4, 8], fmt: (v) => (v ? v + '×' : 'Off') },
  { key: 'shadows', label: 'Sun shadows', vals: [0, 1024, 2048, 4096], fmt: (v) => (v ? v + ' px' : 'Off (blobs)') },
  { key: 'ssao', label: 'Ambient occlusion', vals: [false, true], fmt: (v) => (v ? 'On' : 'Off') },
  { key: 'bloom', label: 'Bloom', vals: [0, 3, 4, 5, 6], fmt: (v) => (v ? v + ' levels' : 'Off') },
  { key: 'lite', label: 'Sky and screen effects', vals: [true, false], fmt: (v) => (v ? 'Simple' : 'Full') },
  { key: 'dist', label: 'Draw distance', vals: [0.36, 0.6, 0.8, 1, 1.2, 1.45], fmt: (v) => '×' + v },
  { key: 'scenery', label: 'Roadside clutter', vals: [0.5, 0.8, 1], fmt: (v) => Math.round(v * 100) + ' %' },
  { key: 'woods', label: 'Woodland', vals: [0, 0.4, 0.65, 0.8, 0.9, 1.1], fmt: (v) => (v ? '×' + v : 'Off') },
  { key: 'lod', label: 'Full-detail distance', vals: [40, 70, 110, 170, 260, 450], fmt: (v) => v + ' m' },
  { key: 'terrLite', label: 'Terrain mesh', vals: [true, false], fmt: (v) => (v ? 'Light' : 'Full') },
  { key: 'lamps', label: 'Street-lamp lights', vals: [4, 6, 8, 12, 16], fmt: (v) => String(v) },
  { key: 'particles', label: 'Particles', vals: [0.25, 0.4, 0.7, 1, 1.25, 1.5], fmt: (v) => '×' + v },
  { key: 'weather', label: 'Rain and snow', vals: [0.3, 0.4, 0.7, 1, 1.2, 1.4], fmt: (v) => '×' + v },
  { key: 'cap60', label: 'Dynamic resolution target', vals: [true, false], fmt: (v) => (v ? '60 fps' : 'Screen refresh') },
];

function graphics(g: Game, back: string): Screen {
  const st = g.settings;
  const menu = new Menu(g.sfx);
  const base = () => QUALITY[st.quality];
  const title = h('h3', {});
  const panel = h('div', { class: 'panel', style: 'width:min(46rem,94vw)' }, title,
    h('div', { class: 'info', style: 'margin-bottom:.5rem' }, 'A preset sets all of these; change any of them here. Options you changed are marked ●. Picking a preset in Settings resets them.'));
  const rows: HTMLElement[] = [];
  const paintAll = () => {
    const q = g.effectiveQuality();
    title.textContent = 'GRAPHICS OPTIONS · ' + q.name.toUpperCase();
    GFX.forEach((o, i) => {
      (rows[i] as any)._paint();
      rows[i].querySelector('.lab')!.textContent = (q[o.key] !== base()[o.key] ? '● ' : '') + o.label;
    });
  };
  let r = 0;
  for (const o of GFX) {
    const idx = () => {
      const v = g.effectiveQuality()[o.key];
      let best = 0;
      o.vals.forEach((x, i) => { if (typeof x === 'boolean' ? x === v : Math.abs((x as number) - (v as number)) < Math.abs((o.vals[best] as number) - (v as number))) best = i; });
      return best;
    };
    const row = choiceRow(o.label, o.vals.map(o.fmt), idx, (i) => {
      st.qo = { ...(st.qo ?? {}), [o.key]: o.vals[i] };
      if (o.vals[i] === base()[o.key]) delete (st.qo as any)[o.key];
      g.applyQuality();
      g.saveSettings();
      paintAll();
    });
    rows.push(row);
    panel.append(bind(menu, row, r++, 0, {}));
  }
  const reset = h('div', { class: 'row' }, h('span', { class: 'lab' }, 'Reset to the preset'), h('span', { class: 'val' }, ''));
  panel.append(bind(menu, reset, r++, 0, { activate: () => { st.qo = {}; g.applyQuality(); g.saveSettings(); paintAll(); } }));
  const backR = h('div', { class: 'row' }, h('span', { class: 'lab' }, 'Back'), h('span', { class: 'val' }, ''));
  panel.append(bind(menu, backR, r++, 0, { activate: () => g.show('settings', { back }) }));
  paintAll();
  menu.focus = 0;
  menu.paint();
  menu.onBack = () => g.show('settings', { back });
  const el = h('div', { class: 'scr bg scan', style: back === 'pause' ? 'background:rgba(6,3,20,.7)' : '' }, hdr('GRAPHICS'), h('div', { class: 'body', style: 'justify-content:center;flex:1 0 auto' }, panel), STD_HINT.cloneNode(true) as HTMLElement);
  return { el, onKey: (k) => { menu.key(k); (menu.items[menu.focus]?.el as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' }); } };
}

// ---------------------------------------------------------------- controls / rebinding
function controls(g: Game, back: string): Screen {
  const menu = new Menu(g.sfx);
  const grid = h('div', { class: 'keys' }, h('span'), h('span', { class: 'lab' }, 'PLAYER 1'), h('span', { class: 'lab' }, 'PLAYER 2'));
  const cells: HTMLElement[][] = [[], []];
  const paint = () => {
    ACTIONS.forEach((a, r) => {
      for (let p = 0; p < 2; p++) {
        const c = cells[p][r];
        c.innerHTML = '';
        c.append(h('span', {}, ...g.input.bindings[p][a].slice(0, 4).map((b) => h('span', { class: 'kb' }, g.input.describe(b)))));
      }
    });
  };
  ACTIONS.forEach((a, r) => {
    grid.append(h('span', { class: 'lab' }, ACTION_LABELS[a]));
    for (let p = 0; p < 2; p++) {
      const c = h('div', { class: 'row', style: 'padding:.2rem .5rem;min-height:1.9rem' });
      cells[p].push(c);
      grid.append(c);
      menu.add({ el: c, row: r, col: p, activate: () => {
        c.innerHTML = '<span class="blink">PRESS A KEY OR BUTTON…</span>';
        g.input.listening = (code) => {
          const list = g.input.bindings[p][a].filter((b) => b !== code && !(b.startsWith('pad:') === code.startsWith('pad:') && g.input.bindings[p][a].indexOf(b) === 0));
          g.input.bindings[p][a] = [code, ...list].slice(0, 5);
          g.saveSettings();
          paint();
          menu.paint();
          g.sfx('ok');
        };
      } });
    }
  });
  const reset = h('div', { class: 'btn', style: 'margin-top:1rem' }, h('span', {}, 'Reset to defaults'));
  menu.add({ el: reset, row: ACTIONS.length, col: 0, activate: () => { g.input.bindings = [structuredClone(DEFAULT_BINDINGS[0]), structuredClone(DEFAULT_BINDINGS[1])]; g.saveSettings(); paint(); toast('Controls reset'); } });
  const done = h('div', { class: 'btn go', style: 'margin-top:1rem' }, h('span', {}, 'Done'));
  menu.add({ el: done, row: ACTIONS.length, col: 1, activate: () => g.show(back) });
  paint();
  menu.focus = 0;
  menu.paint();
  menu.onBack = () => g.show(back);
  const pads = h('div', { class: 'info', style: 'margin-top:.8rem' });
  const el = h('div', { class: 'scr bg scan' }, hdr('CONTROLS'),
    h('div', { class: 'body', style: 'justify-content:center' }, h('div', { class: 'panel', style: 'width:min(64rem,94vw)' }, h('h3', {}, 'SELECT AN ACTION, THEN PRESS THE NEW KEY OR BUTTON'), grid, pads, h('div', { style: 'display:flex;gap:1rem' }, reset, done))),
    hint(['ENTER / A', 'REBIND'], ['ESC / B', 'BACK']));
  return {
    el,
    onKey: (k) => { if (!g.input.listening) menu.key(k); },
    update: () => {
      const ps = (navigator.getGamepads ? Array.from(navigator.getGamepads()) : []).filter((p) => p && p.connected) as Gamepad[];
      pads.textContent = ps.length ? 'Gamepads: ' + ps.map((p, i) => `P${i + 1} ← ${p.id.slice(0, 40)}`).join(' · ') : 'No gamepad connected. Plug one in at any time; the first pad drives player 1, the second player 2.';
    },
  };
}

// ---------------------------------------------------------------- benchmark
function bench(g: Game): Screen {
  const panel = h('div', { class: 'panel', style: 'width:min(64rem,94vw)' }, h('h3', {}, 'BENCHMARK'),
    h('div', { class: 'info' }, `About ${Math.round((BENCH_TRACKS.length * (BENCH_PRESETS.length + 1) * 9.5) / 60 * 2) / 2} minutes. The same suite every run, so results can be compared: a bot drives ${BENCH_TRACKS.length} fixed tracks at ${BENCH_PRESETS.join(', ')} and at your own settings, with the resolution fixed. Leave the controls alone, then use Copy report or Save report.`));
  const chart = h('canvas', { class: 'benchchart', width: 960, height: 150, style: 'display:none' }) as HTMLCanvasElement;
  const out = h('pre', { class: 'lcd benchout', style: 'display:none' });
  const menu = new Menu(g.sfx);
  const startB = h('div', { class: 'btn go' }, h('span', {}, 'Start'));
  const copyB = h('div', { class: 'btn', style: 'display:none' }, h('span', {}, 'Copy report'));
  const saveB = h('div', { class: 'btn', style: 'display:none' }, h('span', {}, 'Save report'));
  const backB = h('div', { class: 'btn' }, h('span', {}, 'Back'));
  panel.append(chart, out, h('div', { class: 'benchbtns' }, startB, copyB, saveB, backB));
  let rep: BenchReport | null = null;
  const draw = (r: BenchReport) => {
    const c = chart.getContext('2d');
    if (!c || !r.timeline.length) return;
    const W = chart.width, H = chart.height, pad = 26;
    c.clearRect(0, 0, W, H);
    const max = Math.max(r.refresh, ...r.timeline) * 1.08;
    const x = (i: number) => pad + (i / Math.max(1, r.timeline.length - 1)) * (W - pad - 8);
    const y = (v: number) => H - 18 - (v / max) * (H - 30);
    c.font = '12px Share Tech Mono, monospace';
    c.fillStyle = 'rgba(255,255,255,.55)';
    for (const [v, lbl] of [[r.refresh, `${r.refresh.toFixed(0)} Hz`], [60, '60']] as [number, string][]) {
      if (v > max) continue;
      c.strokeStyle = 'rgba(255,255,255,.18)';
      c.setLineDash([4, 4]);
      c.beginPath(); c.moveTo(pad, y(v)); c.lineTo(W - 8, y(v)); c.stroke();
      c.setLineDash([]);
      c.fillText(lbl, W - 8 - c.measureText(lbl).width, y(v) - 4);
    }
    // render resolution (fraction of the output) as a faint band
    c.strokeStyle = 'rgba(255,45,149,.6)';
    c.beginPath();
    r.scaleLine.forEach((v, i) => { const yy = H - 18 - v * (H - 30); if (i) c.lineTo(x(i), yy); else c.moveTo(x(i), yy); });
    c.stroke();
    c.strokeStyle = '#05d9e8';
    c.lineWidth = 2;
    c.beginPath();
    r.timeline.forEach((v, i) => { if (i) c.lineTo(x(i), y(v)); else c.moveTo(x(i), y(v)); });
    c.stroke();
    c.lineWidth = 1;
    c.fillStyle = 'rgba(255,255,255,.55)';
    c.fillText('fps, every measured run in order', pad, 12);
    c.fillStyle = '#ff2d95';
    c.fillText('render scale', pad + 250, 12);
  };
  const showRep = (r: BenchReport) => {
    rep = r;
    out.textContent = r.text;
    out.style.display = '';
    chart.style.display = '';
    copyB.style.display = '';
    saveB.style.display = '';
    draw(r);
  };
  const run = () => {
    g.startBenchmark((r) => {
      store.set('lastBenchmark3', r);
      g.show('bench');
    });
  };
  const last = store.get<BenchReport | null>('lastBenchmark3', null);
  if (last && last.text) showRep(last);
  bind(menu, startB, 0, 0, { activate: run });
  bind(menu, copyB, 0, 1, { activate: () => { if (rep) void navigator.clipboard?.writeText(rep.text).then(() => toast('Report copied'), () => toast('Copy failed – select the text manually')); } });
  bind(menu, saveB, 0, 2, { activate: () => {
    if (!rep) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([rep.text], { type: 'text/plain' }));
    a.download = `crestline-benchmark-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast('Report saved to your downloads');
  } });
  bind(menu, backB, 0, 3, { activate: () => g.show('settings') });
  menu.setFocus(startB);
  menu.onBack = () => g.show('settings');
  // the report is long: the body grows with it (never squeezed to the window) and the screen scrolls
  const el = h('div', { class: 'scr bg scan' }, hdr('BENCHMARK'), h('div', { class: 'body', style: 'justify-content:center;flex:1 0 auto' }, panel), STD_HINT.cloneNode(true) as HTMLElement);
  // the buttons are one row, so up / down scroll the report (keyboard and gamepad)
  return { el, onKey: (k) => { if (k === 'up' || k === 'down') el.scrollTop += (k === 'up' ? -0.4 : 0.4) * el.clientHeight; else menu.key(k); } };
}
