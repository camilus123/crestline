// DOM helpers, embedded fonts and the focus/menu framework (keyboard, gamepad and mouse).

import css from './style.css';
import russo from '../assets/fonts/russo-one-latin-400-normal.woff2';
import chakra5 from '../assets/fonts/chakra-petch-latin-500-normal.woff2';
import chakra7 from '../assets/fonts/chakra-petch-latin-700-normal.woff2';
import mono from '../assets/fonts/share-tech-mono-latin-400-normal.woff2';
import { MenuKey } from '../input';

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, any> = {}, ...kids: (Node | string | null | undefined | false)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.setAttribute('style', v);
    else if (k.startsWith('on')) (el as any)[k.toLowerCase()] = v;
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, String(v));
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) el.append(c as any);
  return el;
}

function b64(s: string): ArrayBuffer {
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
}

/** Install CSS and fonts (fonts are decoded from inlined data – no requests). */
export async function installStyle(): Promise<void> {
  const st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);
  const fonts: [string, string, string][] = [
    ['Russo One', russo, '400'],
    ['Chakra Petch', chakra5, '500'],
    ['Chakra Petch', chakra7, '700'],
    ['Share Tech Mono', mono, '400'],
  ];
  await Promise.all(
    fonts.map(async ([fam, data, weight]) => {
      try {
        const f = new FontFace(fam, b64(data), { weight });
        await f.load();
        (document.fonts as any).add(f);
      } catch (e) {
        console.warn('font', fam, e);
      }
    }),
  );
}

// ---------------------------------------------------------------- menu items

export interface Item {
  el: HTMLElement;
  row: number;
  col: number;
  /** left/right adjust; return true if handled */
  adjust?: (dir: number) => boolean;
  activate?: () => void;
  enabled?: () => boolean;
}

export interface Sfx {
  (kind: 'move' | 'ok' | 'back' | 'error'): void;
}

export class Menu {
  items: Item[] = [];
  focus = 0;
  onBack: (() => void) | null = null;
  onTab: (() => void) | null = null;
  constructor(private sfx: Sfx) {}
  add(it: Item): Item {
    this.items.push(it);
    const idx = this.items.length - 1;
    it.el.addEventListener('mouseenter', () => {
      if (this.ok(idx) && this.focus !== idx) {
        this.focus = idx;
        this.paint();
      }
    });
    it.el.addEventListener('click', (e) => {
      if (!this.ok(idx)) return;
      this.focus = idx;
      this.paint();
      const t = e.target as HTMLElement;
      const ar = t.closest('[data-dir]') as HTMLElement | null;
      if (ar && it.adjust) {
        it.adjust(+ar.dataset.dir!);
        this.sfx('move');
      } else if (it.activate) {
        this.sfx('ok');
        it.activate();
      } else if (it.adjust) {
        it.adjust(1);
        this.sfx('move');
      }
    });
    return it;
  }
  private ok(i: number): boolean {
    const it = this.items[i];
    return !!it && (!it.enabled || it.enabled()) && !it.el.classList.contains('dis') && it.el.offsetParent !== null;
  }
  paint(): void {
    this.items.forEach((it, i) => {
      it.el.classList.toggle('f', i === this.focus);
      const en = !it.enabled || it.enabled();
      it.el.classList.toggle('dis', !en);
    });
  }
  setFocus(el: HTMLElement): void {
    const i = this.items.findIndex((it) => it.el === el);
    if (i >= 0) this.focus = i;
    this.paint();
  }
  key(k: MenuKey): void {
    const cur = this.items[this.focus];
    if (k === 'back') {
      if (this.onBack) {
        this.sfx('back');
        this.onBack();
      }
      return;
    }
    if (k === 'tab') {
      this.onTab?.();
      return;
    }
    if (k === 'ok') {
      if (cur?.activate) {
        this.sfx('ok');
        cur.activate();
      } else if (cur?.adjust) {
        cur.adjust(1);
        this.sfx('move');
      }
      return;
    }
    if ((k === 'left' || k === 'right') && cur?.adjust) {
      if (cur.adjust(k === 'left' ? -1 : 1)) {
        this.sfx('move');
        this.paint();
        return;
      }
    }
    // spatial navigation
    const n = this.items.length;
    if (!n) return;
    const c = cur ?? this.items[0];
    let best = -1, bestScore = 1e9;
    for (let i = 0; i < n; i++) {
      if (i === this.focus || !this.ok(i)) continue;
      const it = this.items[i];
      const dr = it.row - c.row, dc = it.col - c.col;
      let score = 1e9;
      if (k === 'down' && (dr > 0 || (dr === 0 && dc === 0 && i > this.focus))) score = dr * 10 + Math.abs(dc) * 3;
      if (k === 'up' && (dr < 0 || (dr === 0 && dc === 0 && i < this.focus))) score = -dr * 10 + Math.abs(dc) * 3;
      if (k === 'right' && dc > 0) score = dc * 10 + Math.abs(dr) * 2;
      if (k === 'left' && dc < 0) score = -dc * 10 + Math.abs(dr) * 2;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best >= 0) {
      this.focus = best;
      this.sfx('move');
      this.paint();
      this.items[best].el.scrollIntoView?.({ block: 'nearest' });
    }
  }
}

/** a labelled option row with left/right choices */
export function choiceRow(label: string, opts: string[], get: () => number, set: (i: number) => void): HTMLElement {
  const val = h('span', { class: 'val' });
  const row = h('div', { class: 'row' }, h('span', { class: 'lab' }, label), val);
  const paint = () => {
    val.innerHTML = '';
    val.append(h('span', { class: 'ar', 'data-dir': -1 }, '◀'), h('span', {}, opts[get()]), h('span', { class: 'ar', 'data-dir': 1 }, '▶'));
  };
  (row as any)._paint = paint;
  (row as any)._adjust = (d: number) => {
    set((get() + d + opts.length) % opts.length);
    paint();
    return true;
  };
  paint();
  return row;
}

export function sliderRow(label: string, get: () => number, set: (v: number) => void, steps = 25, fmt?: (v: number) => string): HTMLElement {
  const fill = h('i');
  const knob = h('em');
  const sl = h('div', { class: 'slider' }, fill, knob);
  const num = h('span', { class: 'mono', style: 'min-width:3.2em;text-align:right' });
  const row = h('div', { class: 'row' }, h('span', { class: 'lab' }, label), h('span', { class: 'val' }, h('span', { class: 'ar', 'data-dir': -1 }, '◀'), sl, h('span', { class: 'ar', 'data-dir': 1 }, '▶'), num));
  const paint = () => {
    const v = get();
    fill.style.width = (v / steps) * 100 + '%';
    knob.style.left = `calc(${(v / steps) * 100}% - .2rem)`;
    num.textContent = fmt ? fmt(v) : Math.round((v / steps) * 100) + '%';
  };
  (row as any)._paint = paint;
  (row as any)._adjust = (d: number) => {
    const v = Math.max(0, Math.min(steps, get() + d));
    if (v === get()) return false;
    set(v);
    paint();
    return true;
  };
  // mouse drag on the slider
  const drag = (e: PointerEvent) => {
    const r = sl.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    set(Math.round(t * steps));
    paint();
  };
  sl.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    drag(e);
    const mv = (ev: PointerEvent) => drag(ev);
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  });
  sl.addEventListener('click', (e) => e.stopPropagation());
  paint();
  return row;
}

export function toast(msg: string, ms = 1800): void {
  const t = h('div', { class: 'toast' }, msg);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

export const store = {
  get<T>(key: string, def: T): T {
    try {
      const v = localStorage.getItem('crestline.' + key);
      return v ? (JSON.parse(v) as T) : def;
    } catch {
      return def;
    }
  },
  set(key: string, v: unknown): void {
    try {
      localStorage.setItem('crestline.' + key, JSON.stringify(v));
    } catch {
      /* storage unavailable: keep working */
    }
  },
};
