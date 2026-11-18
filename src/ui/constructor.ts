// Track constructor: nine sliders (0..100% in 4% steps), Type and Scenario, live map and
// elevation profile, shareable 9+2 code with copy button.

import type { Game } from '../game';
import { decodeCode, encodeCode, normalizeCode, SLIDERS, SLIDER_LABELS, TrackParams } from '../track/codes';
import { Hz, SCENARIO_NAMES } from '../track/defs';
import { TrackData } from '../track/generator';
import { choiceRow, h, Menu, sliderRow, toast } from './dom';
import type { Screen } from './screens';

export function buildConstructor(g: Game): Screen {
  const st = g.settings;
  let p: TrackParams = decodeCode(st.customCode || 'KJGJHHMLH00');
  const menu = new Menu(g.sfx);
  const left = h('div', { class: 'panel', style: 'flex:0 0 auto;width:min(34rem,40vw)' }, h('h3', {}, 'PARAMETERS'));
  let row = 0;
  for (const k of SLIDERS) {
    left.append(bindRow(menu, sliderRow(SLIDER_LABELS[k], () => p[k], (v) => { p[k] = v; changed(); }, 25), row++));
  }
  left.append(bindRow(menu, choiceRow('Type', ['Laps (circuit)', 'Stages (point to point)'], () => p.type, (i) => { p.type = i as 0 | 1; changed(); }), row++));
  left.append(bindRow(menu, choiceRow('Scenario', SCENARIO_NAMES, () => p.scenario, (i) => { p.scenario = i; changed(); }), row++));
  // right side: code + map + profile
  const codeEl = h('div', { class: 'code' });
  const codeIn = h('input', { class: 'txt', maxlength: 32, placeholder: 'TYPE A CODE OR ANY NAME', style: 'width:100%' }) as HTMLInputElement;
  codeIn.addEventListener('focus', () => (g.input.typing = true));
  codeIn.addEventListener('blur', () => (g.input.typing = false));
  codeIn.addEventListener('change', () => apply(codeIn.value));
  codeIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { apply(codeIn.value); codeIn.blur(); } });
  const meta = h('div', { class: 'info' });
  const map = h('canvas') as HTMLCanvasElement;
  const prof = h('canvas') as HTMLCanvasElement;
  const right = h('div', { class: 'col', style: 'min-width:0' },
    h('div', { class: 'panel' }, h('h3', {}, 'TRACK CODE'), h('div', { style: 'display:flex;align-items:center;gap:1rem;flex-wrap:wrap' }, codeEl), meta),
    h('div', { class: 'panel mapbox', style: 'flex:2.2' }, map),
    h('div', { class: 'panel mapbox', style: 'flex:0.8' }, prof),
  );
  const btns = h('div', { style: 'display:flex;gap:.8rem;flex-wrap:wrap;margin-top:.6rem' });
  const mk = (label: string, col: number, fn: () => void, cls = '') => {
    const b = h('div', { class: 'btn ' + cls }, h('span', {}, label));
    btns.append(b);
    menu.add({ el: b, row: row, col, activate: fn });
    return b;
  };
  mk('Copy code', 0, () => {
    const c = encodeCode(p);
    const done = () => toast('Copied ' + c);
    try {
      void navigator.clipboard.writeText(c).then(done, () => { codeIn.value = c; codeIn.select(); document.execCommand?.('copy'); done(); });
    } catch { codeIn.value = c; toast(c); }
  });
  mk('Type code', 1, () => { codeIn.focus(); codeIn.select(); });
  mk('Random', 2, () => { apply('random ' + Math.random()); });
  mk('Add to sequence', 3, () => {
    const c = encodeCode(p);
    st.sequence = (st.sequence.trim() ? st.sequence.trim() + '\n' : '') + c;
    g.saveSettings();
    toast(`${c} added · ${st.sequence.split(/\n/).length} in sequence`);
  });
  const raceB = mk('Race this track', 4, () => {
    st.customCode = encodeCode(p);
    st.course = 'custom';
    g.saveSettings();
    g.startSession(st.mode, 'custom');
    g.show('music');
  }, 'go');
  row++;
  const backB = h('div', { class: 'btn' }, h('span', {}, 'Back'));
  btns.append(backB);
  menu.add({ el: backB, row: row - 1, col: 5, activate: () => g.show('setup') });
  right.append(btns);
  const el = h('div', { class: 'scr bg scan' }, hdr(), h('div', { class: 'body' }, left, right),
    h('div', { class: 'hint' }, h('span', {}, h('b', {}, '↑↓'), ' SELECT'), h('span', {}, h('b', {}, '←→'), ' ADJUST 4%'), h('span', {}, h('b', {}, 'ESC', h('i', { class: 'padhint' }, ' / PAD B')), ' BACK')));

  let track: TrackData | null = null;
  let timer = 0;
  function apply(text: string) {
    const c = normalizeCode(text);
    p = decodeCode(c.code);
    menu.items.forEach((it) => (it.el as any)._paint?.());
    changed(c.direct ? '' : `“${text.slice(0, 24)}” → ${c.code}`);
  }
  function changed(note = '') {
    const c = encodeCode(p);
    codeEl.textContent = c;
    st.customCode = c;
    g.saveSettings();
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      track = g.track(c);
      draw(note);
    }, 90);
  }
  function draw(note: string) {
    if (!track) return;
    const t = track;
    const laps = t.circuit ? `${t.laps} laps × ${(t.lapLen / 1000).toFixed(2)} km` : `${t.checkpoints.length} stages`;
    let maxG = 0, minY = 1e9, maxY = -1e9;
    for (let i = 0; i < t.n; i++) { maxG = Math.max(maxG, Math.abs(t.grade[i])); minY = Math.min(minY, t.Y[i]); maxY = Math.max(maxY, t.Y[i]); }
    meta.innerHTML = (note ? note + '<br>' : '') + `<b>${SCENARIO_NAMES[p.scenario]}</b> · ${laps} · race ${(t.raceLen / 1000).toFixed(1)} km · climb ${Math.round(maxY - minY)} m · max grade ${(maxG * 100).toFixed(0)}% · ${t.hazards.length} hazards · ${t.objects.count} objects` +
      (t.raceLen > 15000 ? ' · <b>fuel stop in championship</b>' : '') + ` · data hash <span class="mono">${t.hash}</span>`;
    drawMap(map, t);
    drawProfile(prof, t);
  }
  const ro = new ResizeObserver(() => { if (track) { drawMap(map, track); drawProfile(prof, track); } });
  ro.observe(map);
  ro.observe(prof);
  changed();
  menu.focus = 0;
  menu.paint();
  menu.onBack = () => g.show('setup');
  void raceB;
  return {
    el,
    onKey: (k) => {
      if (g.input.typing) { if (k === 'back' || k === 'ok') { if (k === 'ok') apply(codeIn.value); codeIn.blur(); } return; }
      menu.key(k);
    },
    destroy: () => ro.disconnect(),
  };
}

function hdr(): HTMLElement {
  return h('div', { class: 'hdr' }, h('div', { class: 'logo' }, 'CRESTLINE'), h('div', { class: 'ttl' }, 'TRACK CONSTRUCTOR'));
}
function bindRow(menu: Menu, el: HTMLElement, row: number): HTMLElement {
  menu.add({ el, row, col: 0, adjust: (el as any)._adjust });
  return el;
}

function fit(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const r = c.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = Math.max(10, Math.floor(r.width * dpr));
  c.height = Math.max(10, Math.floor(r.height * dpr));
  const ctx = c.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function drawMap(c: HTMLCanvasElement, t: TrackData): void {
  const ctx = fit(c);
  const W = c.clientWidth, H = c.clientHeight;
  ctx.clearRect(0, 0, W, H);
  const n = t.n;
  // circuits: distribute the closure gap so the drawn loop closes
  const ex = t.circuit ? t.X[n - 1] + Math.sin(t.heading[n - 1]) * 2 - t.X[0] : 0;
  const ez = t.circuit ? t.Z[n - 1] + Math.cos(t.heading[n - 1]) * 2 - t.Z[0] : 0;
  const end = t.circuit ? n : Math.min(n, Math.round((t.raceLen + t.sOff) / 2) + 1);
  const xs = new Float32Array(end), zs = new Float32Array(end);
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (let i = 0; i < end; i++) {
    const f = i / n;
    xs[i] = t.X[i] - ex * f;
    zs[i] = t.Z[i] - ez * f;
    minX = Math.min(minX, xs[i]); maxX = Math.max(maxX, xs[i]); minZ = Math.min(minZ, zs[i]); maxZ = Math.max(maxZ, zs[i]);
  }
  const sc = Math.min((W - 40) / Math.max(1, maxX - minX), (H - 40) / Math.max(1, maxZ - minZ));
  const ox = W / 2 - ((minX + maxX) / 2) * sc, oz = H / 2 + ((minZ + maxZ) / 2) * sc;
  const P = (i: number): [number, number] => [ox + xs[i] * sc, oz - zs[i] * sc];
  // grid
  ctx.strokeStyle = 'rgba(5,217,232,.08)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 24) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 24) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  // road with elevation colouring
  let minY = 1e9, maxY = -1e9;
  for (let i = 0; i < end; i++) { minY = Math.min(minY, t.Y[i]); maxY = Math.max(maxY, t.Y[i]); }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 7;
  ctx.strokeStyle = 'rgba(0,0,0,.5)';
  ctx.beginPath();
  for (let i = 0; i < end; i += 3) { const [x, y] = P(i); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  if (t.circuit) ctx.closePath();
  ctx.stroke();
  ctx.lineWidth = 3.5;
  for (let i = 0; i + 4 < end; i += 4) {
    const hgt = (t.Y[i] - minY) / Math.max(1, maxY - minY);
    ctx.strokeStyle = `hsl(${200 - hgt * 190},95%,${55 + hgt * 10}%)`;
    const [x0, y0] = P(i), [x1, y1] = P(Math.min(end - 1, i + 5));
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
  if (t.circuit) { const [x0, y0] = P(end - 2), [x1, y1] = P(0); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
  // hazards
  for (const hz of t.hazards) {
    const i = Math.round((hz.s + t.sOff) / 2);
    if (i < 0 || i >= end) continue;
    const [x, y] = P(i);
    ctx.fillStyle = hz.kind === Hz.LASER || hz.kind === Hz.MAGNET ? '#ff40c0' : hz.kind === Hz.BARRIER || hz.kind === Hz.ROCK || hz.kind === Hz.FALLEN_TREE || hz.kind === Hz.CONE ? '#ff5a1c' : '#ffd23f';
    ctx.beginPath(); ctx.arc(x, y, 2.2, 0, 7); ctx.fill();
  }
  // pits, checkpoints, start
  ctx.fillStyle = '#7cff4f';
  for (const pz of t.pits) { const i = Math.round((pz.s0 + t.sOff) / 2); const [x, y] = P(Math.min(end - 1, Math.max(0, i))); ctx.fillRect(x - 3, y - 3, 6, 6); }
  ctx.fillStyle = '#fff';
  if (!t.circuit) for (const cp of t.checkpoints) { const i = Math.round((cp + t.sOff) / 2); if (i < end) { const [x, y] = P(i); ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill(); } }
  const [sx, sy] = P(Math.round(t.sOff / 2));
  ctx.fillStyle = '#ff2a6d';
  ctx.beginPath(); ctx.arc(sx, sy, 6, 0, 7); ctx.fill();
  ctx.font = '600 12px "Chakra Petch"';
  ctx.fillStyle = '#fff';
  ctx.fillText('START', sx + 9, sy + 4);
  ctx.fillStyle = 'rgba(155,143,199,.9)';
  ctx.fillText('● hazard   ■ pit strip   ○ checkpoint   colour = altitude', 10, H - 10);
}

function drawProfile(c: HTMLCanvasElement, t: TrackData): void {
  const ctx = fit(c);
  const W = c.clientWidth, H = c.clientHeight;
  ctx.clearRect(0, 0, W, H);
  const end = t.circuit ? t.n : Math.min(t.n, Math.round((t.raceLen + t.sOff) / 2) + 1);
  let minY = 1e9, maxY = -1e9;
  for (let i = 0; i < end; i++) { minY = Math.min(minY, t.Y[i]); maxY = Math.max(maxY, t.Y[i]); }
  const span = Math.max(20, maxY - minY);
  const py = (y: number) => H - 14 - ((y - minY) / span) * (H - 30);
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(255,42,109,.75)');
  grad.addColorStop(1, 'rgba(5,217,232,.08)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let i = 0; i < end; i += 2) ctx.lineTo((i / (end - 1)) * W, py(t.Y[i]));
  ctx.lineTo(W, H);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < end; i += 2) { const x = (i / (end - 1)) * W; i ? ctx.lineTo(x, py(t.Y[i])) : ctx.moveTo(x, py(t.Y[i])); }
  ctx.stroke();
  ctx.font = '600 11px "Chakra Petch"';
  ctx.fillStyle = 'rgba(244,240,255,.85)';
  ctx.fillText(`ELEVATION  ${Math.round(span)} m range  ·  ${t.circuit ? 'one lap' : 'whole stage route'}`, 8, 14);
}
