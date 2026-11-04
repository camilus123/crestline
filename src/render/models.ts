// Original low-poly scenery models. Local frame: x = towards/along road right, y up, z = road forward.
// Spanning models (arches, gantries) are authored with their legs at x = -1 and +1 and flagged `span`.

import { O } from '../track/defs';
import { hex } from './looks';
import { MB, Mat, V3 } from './meshbuild';

const M = (h: string, o: Partial<Mat> = {}): Mat => ({ c: hex(h), spec: 0.08, ...o });
const leaf = (h: string, sway = 0.6): Mat => ({ c: hex(h), spec: 0.05, sway, hue: 1 });
const bark = M('#5a3f2a', { hue: 0.3 });
const wood = M('#8a6440', { hue: 0.5 });
const darkWood = M('#4a3322');
const metal = M('#9aa0a8', { spec: 0.6, hue: 0 });
const dmetal = M('#4a4e55', { spec: 0.5, hue: 0 });
const white = M('#f2f2ee', { hue: 0 });
const red = M('#d4202a', { hue: 0 });
const concrete = M('#9c9a94', { hue: 0.2 });
const glassLit = (h = '#ffd890', e = 1): Mat => ({ c: hex(h), spec: 0.4, emis: e, hue: 0 });

type Builder = (b: MB) => void;

function conifer(b: MB, col: string, snow = false, h = 9, tiers = 4, r = 2.6): void {
  b.cyl(0, 0, 0, 0.32, 0.2, h * 0.35, 6, bark);
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const y = h * (0.18 + t * 0.62);
    const rr = r * (1 - t * 0.72);
    b.cyl(0, y, 0, rr, 0.05, h * 0.36, 8, leaf(col, 0.3 + t * 0.6), true, 0.18);
    if (snow) b.cyl(0, y + h * 0.12, 0, rr * 0.72, 0.04, h * 0.25, 8, { c: hex('#f4f8ff'), spec: 0.3, sway: 0.3 + t * 0.6, hue: 0 }, true, 0.2);
  }
}

function broadleaf(b: MB, cols: string[], h = 8, spread = 3.4): void {
  b.cyl(0, 0, 0, 0.42, 0.26, h * 0.55, 7, bark, true, 0.12);
  b.push().t(0, h * 0.42, 0).rz(0.5);
  b.cyl(0, 0, 0, 0.18, 0.1, h * 0.25, 5, bark);
  b.pop();
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + b.rng.float();
    const r = spread * (0.35 + b.rng.float() * 0.35);
    const y = h * (0.62 + b.rng.float() * 0.22);
    const sz = spread * (0.55 + b.rng.float() * 0.3);
    b.blob(Math.cos(a) * r, y, Math.sin(a) * r, sz, sz * 0.8, sz, leaf(cols[i % cols.length], 0.7), 0.22, 1);
  }
  b.blob(0, h * 0.86, 0, spread * 0.8, spread * 0.7, spread * 0.8, leaf(cols[0], 0.9), 0.2, 1);
}

function house(b: MB, wall: string, roof: string, w = 7, d = 8, h = 4.5, lit = 0.6): void {
  b.box(0, 0, 0, w, h, d, M(wall, { hue: 0.6 }));
  // roof prism
  b.prism([[-w / 2 - 0.4, h], [w / 2 + 0.4, h], [0, h + w * 0.42]], -d / 2 - 0.4, d / 2 + 0.4, M(roof, { hue: 0.4 }));
  // windows (emissive at night)
  for (const side of [-1, 1])
    for (let i = 0; i < 2; i++) b.box(side * (w / 2 + 0.02), 1.4, -d / 4 + i * (d / 2), 0.08, 1.2, 1.1, glassLit('#ffcf7a', lit));
  b.box(-w / 2 - 0.02, 0, 0, 0.1, 2.2, 1.0, darkWood);
  b.box(w * 0.25, h + w * 0.2, d * 0.2, 0.7, 1.6, 0.7, M('#7a4a3a'));
}

const LIB: Partial<Record<O, Builder>> = {
  [O.PINE]: (b) => conifer(b, '#2d5a2a', false, 10, 5, 2.8),
  [O.FIR]: (b) => conifer(b, '#1f4a2c', false, 13, 6, 3.0),
  [O.SNOW_PINE]: (b) => conifer(b, '#2a4a3a', true, 10, 5, 2.8),
  [O.OAK]: (b) => broadleaf(b, ['#3e7a28', '#4f8a2e', '#356a24'], 9, 3.8),
  [O.BENT_OAK]: (b) => {
    b.push().rz(-0.18);
    broadleaf(b, ['#2e5a22', '#3a6a26', '#28501e'], 8.5, 3.4);
    b.pop();
  },
  [O.BIRCH]: (b) => {
    b.cyl(0, 0, 0, 0.22, 0.12, 9, 6, M('#e8e4da', { hue: 0 }));
    for (let i = 0; i < 4; i++) b.box(0, 1.5 + i * 1.7, 0, 0.46, 0.18, 0.46, M('#2a2a2a'));
    for (let i = 0; i < 4; i++) b.blob((b.rng.float() - 0.5) * 2, 6 + i * 0.9, (b.rng.float() - 0.5) * 2, 1.6, 1.5, 1.6, leaf(i % 2 ? '#8ab83a' : '#6a9a2e', 0.8), 0.25, 1);
  },
  [O.POPLAR]: (b) => {
    b.cyl(0, 0, 0, 0.3, 0.2, 3, 6, bark);
    b.blob(0, 8, 0, 1.6, 6.5, 1.6, leaf('#3a6a2a', 0.5), 0.15, 1);
  },
  [O.WILLOW]: (b) => {
    b.cyl(0, 0, 0, 0.5, 0.35, 3.5, 7, bark, true, 0.15);
    b.blob(0, 5.2, 0, 4.2, 2.2, 4.2, leaf('#6a8a3a', 0.9), 0.2, 1);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      b.cyl(Math.cos(a) * 3.2, 1.2, Math.sin(a) * 3.2, 0.7, 1.4, 3.6, 5, leaf('#7a9a42', 1.0), false, 0.2);
    }
  },
  [O.DEAD_TREE]: (b) => {
    b.cyl(0, 0, 0, 0.35, 0.15, 6.5, 6, M('#4a4038'), true, 0.2);
    for (let i = 0; i < 5; i++) {
      const y = 2.5 + i * 0.8;
      const a = b.rng.float() * Math.PI * 2;
      b.beam([0, y, 0], [Math.cos(a) * 2.4, y + 1.5, Math.sin(a) * 2.4], 0.14, M('#4a4038'));
    }
  },
  [O.BUSH]: (b) => {
    for (let i = 0; i < 3; i++) b.blob((b.rng.float() - 0.5) * 1.6, 0.6, (b.rng.float() - 0.5) * 1.6, 1.1, 0.9, 1.1, leaf(i ? '#4a7a2a' : '#3a6a24', 0.4), 0.25, 1);
  },
  [O.DRYBUSH]: (b) => {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      b.beam([0, 0, 0], [Math.cos(a) * 0.9, 0.9 + b.rng.float() * 0.4, Math.sin(a) * 0.9], 0.08, M('#8a6a3a', { sway: 0.4 }));
    }
    b.blob(0, 0.5, 0, 0.8, 0.45, 0.8, leaf('#9a8a4a', 0.4), 0.3, 1);
  },
  [O.FERN]: (b) => {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + b.rng.float() * 0.3;
      const d: V3 = [Math.cos(a), 0, Math.sin(a)];
      b.card([0, 0.05, 0], [d[0] * 0.25 - d[2] * 0.25, 0.5, d[2] * 0.25 + d[0] * 0.25], [d[0] * 1.3, 0.75, d[2] * 1.3], [d[0] * 0.25 + d[2] * 0.25, 0.5, d[2] * 0.25 - d[0] * 0.25], leaf('#4a8a2a', 0.8));
    }
  },
  [O.GRASS]: (b) => {
    for (let i = 0; i < 9; i++) {
      const x = (b.rng.float() - 0.5) * 1.4, z = (b.rng.float() - 0.5) * 1.4, h = 0.5 + b.rng.float() * 0.6;
      const a = b.rng.float() * Math.PI;
      const dx = Math.cos(a) * 0.08, dz = Math.sin(a) * 0.08;
      b.card([x - dx, 0, z - dz], [x + dx, 0, z + dz], [x + dx * 0.2 + 0.15, h, z + dz * 0.2], [x - dx * 0.2 + 0.15, h, z - dz * 0.2], leaf(i % 3 ? '#7aa83a' : '#a8b85a', 1));
    }
  },
  [O.REEDS]: (b) => {
    for (let i = 0; i < 12; i++) {
      const x = (b.rng.float() - 0.5) * 1.8, z = (b.rng.float() - 0.5) * 1.8, h = 1.4 + b.rng.float() * 1.2;
      b.beam([x, 0, z], [x + 0.2, h, z], 0.05, leaf('#8a8a4a', 1));
      if (i % 3 === 0) b.box(x + 0.2, h - 0.35, z, 0.1, 0.35, 0.1, M('#5a3a22', { sway: 1 }));
    }
  },
  [O.ROCK]: (b) => {
    b.blob(0, 0.4, 0, 1.2, 0.9, 1.0, M('#7a7670', { hue: 0.6 }), 0.3, 1);
    b.blob(0.8, 0.2, 0.4, 0.6, 0.45, 0.6, M('#6a6660', { hue: 0.6 }), 0.3, 0);
  },
  [O.SNOW_ROCK]: (b) => {
    b.blob(0, 0.4, 0, 1.2, 0.9, 1.0, M('#6a6e78'), 0.3, 1);
    b.blob(0, 0.95, 0, 1.0, 0.35, 0.85, M('#f2f6ff', { spec: 0.3, hue: 0 }), 0.2, 1);
  },
  [O.BOULDER]: (b) => b.blob(0, 1.2, 0, 2.4, 2, 2.2, M('#7a7670', { hue: 0.6 }), 0.3, 1),
  [O.STUMP]: (b) => {
    b.cyl(0, 0, 0, 0.5, 0.42, 0.6, 8, bark, true, 0.1);
    b.cyl(0, 0.6, 0, 0.4, 0.4, 0.02, 8, M('#c8a070'));
  },
  [O.LOGPILE]: (b) => {
    for (let r = 0; r < 3; r++)
      for (let i = 0; i < 4 - r; i++) {
        b.push().t(-1.2 + i * 0.75 + r * 0.37, 0.35 + r * 0.62, 0).rx(Math.PI / 2);
        b.cyl(0, -2, 0, 0.35, 0.35, 4, 7, i % 2 ? bark : M('#6a4a30'));
        b.pop();
      }
  },
  [O.FENCE]: (b) => {
    for (let i = 0; i < 2; i++) b.box(0, 0, -2 + i * 4, 0.12, 1.2, 0.12, wood);
    b.box(0, 0.75, 0, 0.06, 0.12, 4.2, wood);
    b.box(0, 0.4, 0, 0.06, 0.12, 4.2, wood);
  },
  [O.HEDGE]: (b) => b.box(0, 0, 0, 1.4, 1.6, 6, leaf('#2e5a24', 0.15)),
  [O.CHEVRON]: (b) => {
    b.box(0, 0, 0, 0.1, 0.9, 0.1, dmetal);
    b.box(0, 0.9, 0, 0.06, 0.6, 1.0, M('#f4f4f0', { hue: 0, emis: 0.15 }));
    for (let i = 0; i < 2; i++) b.prism([[-0.4 + i * 0.4, 0], [-0.25 + i * 0.4, 0], [0.0 + i * 0.4, 0.25], [-0.25 + i * 0.4, 0.5], [-0.4 + i * 0.4, 0.5], [-0.15 + i * 0.4, 0.25]], 0, 0.04, red), void 0;
  },
  [O.LAMP]: (b) => {
    b.cyl(0, 0, 0, 0.12, 0.08, 7, 6, dmetal);
    b.beam([0, 7, 0], [-1.6, 7.4, 0], 0.1, dmetal);
    b.box(-1.7, 7.15, 0, 0.7, 0.2, 0.35, dmetal);
    b.box(-1.7, 7.05, 0, 0.55, 0.06, 0.25, glassLit('#ffd8a0', 3));
  },
  [O.LAMP_DOUBLE]: (b) => {
    b.cyl(0, 0, 0, 0.16, 0.1, 10, 6, metal);
    b.beam([0, 10, 0], [-2.4, 10.4, 0], 0.12, metal);
    b.box(-2.5, 10.15, 0, 0.9, 0.22, 0.4, dmetal);
    b.box(-2.5, 10.05, 0, 0.75, 0.06, 0.3, glassLit('#ffe0b0', 3));
  },
  [O.REFLECTOR]: (b) => {
    b.box(0, 0, 0, 0.12, 1.0, 0.12, white);
    b.box(-0.07, 0.75, 0, 0.02, 0.18, 0.08, glassLit('#ff9a20', 0.6));
    b.box(0, 0.9, 0, 0.13, 0.1, 0.13, M('#222'));
  },
  [O.MARKER_POLE]: (b) => {
    for (let i = 0; i < 5; i++) b.cyl(0, i * 0.4, 0, 0.04, 0.04, 0.4, 5, i % 2 ? white : red, false);
  },
  [O.HOUSE]: (b) => house(b, '#d8c8a8', '#8a3a2a'),
  [O.COTTAGE]: (b) => house(b, '#f0ece0', '#3a4a5a', 6, 7, 3.6, 0.3),
  [O.BARN]: (b) => {
    b.box(0, 0, 0, 9, 6, 14, M('#8a2a22', { hue: 0.4 }));
    b.prism([[-5, 6], [5, 6], [3, 8.5], [-3, 8.5]], -7.2, 7.2, M('#5a5a5a'));
    b.box(-4.52, 0, 0, 0.1, 4.5, 4, M('#eee'));
  },
  [O.CHALET]: (b) => {
    b.box(0, 0, 0, 8, 3, 9, M('#c8c0b0'));
    b.box(0, 3, 0, 8, 2.4, 9, M('#7a4a2a'));
    b.prism([[-5, 5.4], [5, 5.4], [0, 8.4]], -5, 5, M('#f4f8ff', { spec: 0.3 }));
    for (let i = 0; i < 3; i++) b.box(-4.02, 3.6, -3 + i * 3, 0.08, 1.1, 1.0, glassLit('#ffcc80', 0.8));
    b.box(-4.6, 2.8, 0, 1.2, 0.15, 9, darkWood);
  },
  [O.HUT]: (b) => {
    for (const x of [-2, 2]) for (const z of [-2, 2]) b.box(x, 0, z, 0.25, 2, 0.25, darkWood);
    b.box(0, 2, 0, 5, 0.2, 5, darkWood);
    b.box(0, 2.2, 0, 4, 2.4, 4, wood);
    b.prism([[-2.6, 4.6], [2.6, 4.6], [0, 6.2]], -2.6, 2.6, M('#a8985a'));
    b.box(-2.02, 3, 0.5, 0.06, 0.8, 0.8, glassLit('#ffc070', 0.5));
  },
  [O.ADOBE]: (b) => {
    b.box(0, 0, 0, 7, 3.2, 6, M('#d8a878', { hue: 0.3 }));
    b.box(2, 3.2, 0, 3, 2, 3, M('#c8986a'));
    for (let i = 0; i < 4; i++) b.box(-3.6, 2.6, -2 + i * 1.3, 0.8, 0.15, 0.15, darkWood);
    b.box(-3.52, 0, 0, 0.08, 2, 1.1, M('#3a2a1a'));
  },
  [O.HAYBALE]: (b) => {
    b.push().rx(Math.PI / 2);
    b.cyl(0, -0.6, -0.75, 0.75, 0.75, 1.2, 10, M('#d8b860', { hue: 0.3 }));
    b.pop();
  },
  [O.CROWD]: (b) => {
    for (let i = 0; i < 6; i++) {
      const x = (i - 2.5) * 0.6, z = (b.rng.float() - 0.5) * 1.2;
      const c = ['#d82a2a', '#2a5ad8', '#f0d020', '#f0f0f0', '#2a2a2a', '#3aa84a'][i];
      b.box(x, 0, z, 0.3, 0.9, 0.22, M('#2a3040'));
      b.box(x, 0.9, z, 0.42, 0.65, 0.26, M(c, { hue: 1 }));
      b.blob(x, 1.72, z, 0.13, 0.15, 0.13, M('#e0b090'), 0, 0);
      if (i % 2) b.beam([x + 0.2, 1.4, z], [x + 0.3, 1.95, z], 0.08, M(c));
    }
  },
  [O.POLE]: (b) => {
    b.cyl(0, 0, 0, 0.16, 0.12, 8, 6, M('#6a5a48'));
    b.box(0, 7.4, 0, 0.12, 0.12, 1.6, darkWood);
  },
  [O.POWER_POLE]: (b) => {
    b.cyl(0, 0, 0, 0.18, 0.13, 9, 6, M('#5a4a38'));
    b.box(0, 8.2, 0, 0.14, 0.14, 2.4, darkWood);
    for (const z of [-1, 0, 1]) b.cyl(0, 8.34, z, 0.06, 0.06, 0.2, 5, M('#9ab'));
    // sagging wires towards the next pole
    for (const z of [-1, 0, 1]) b.beam([0, 8.5, z], [0, 7.9, z + 12], 0.03, M('#222'));
  },
  [O.TOWER]: (b) => {
    const h = 26 + b.rng.float() * 50;
    const w = 10 + b.rng.float() * 8;
    b.box(0, 0, 0, w, h, w, M('#2a2a3e', { spec: 0.6, hue: 0.4 }));
    // window bands
    for (let y = 3; y < h - 2; y += 3.2) {
      for (const side of [-1, 1]) b.box(side * (w / 2 + 0.03), y, 0, 0.06, 1.3, w * 0.86, glassLit(b.rng.chance(0.5) ? '#7ad8ff' : '#ff8ad8', b.rng.chance(0.65) ? 1.6 : 0.1));
      b.box(0, y, -w / 2 - 0.03, w * 0.86, 1.3, 0.06, glassLit('#a0e8ff', b.rng.chance(0.6) ? 1.4 : 0.1));
    }
    b.box(0, h, 0, w * 0.6, 3, w * 0.6, dmetal);
    b.cyl(0, h + 3, 0, 0.2, 0.05, 8, 4, metal);
    b.box(0, h + 10.5, 0, 0.5, 0.5, 0.5, glassLit('#ff2040', 3));
  },
  [O.NEON_PYLON]: (b) => {
    b.box(0, 0, 0, 0.3, 6, 0.3, dmetal);
    b.box(-0.18, 0.5, 0, 0.06, 5.2, 0.12, glassLit('#30f0ff', 4));
    b.box(-0.9, 6, 0, 2.2, 0.2, 0.35, dmetal);
    b.box(-1.6, 5.9, 0, 0.8, 0.06, 0.25, glassLit('#ff40c0', 4));
  },
  [O.HOLO_ARCH]: (b) => {
    for (const x of [-1, 1]) {
      b.box(x + x * 0.4, 0, 0, 0.8, 9.5, 1.0, { c: hex('#30304a'), spec: 0.6, span: 0.5 });
      b.box(x + x * 0.4 - x * 0.41, 0.5, 0, 0.04, 8.5, 0.3, { c: hex('#40e8ff'), emis: 5, span: 0.5 });
    }
    b.box(0, 8.5, 0, 2, 1.0, 1.0, { c: hex('#30304a'), spec: 0.6, span: 1 });
    b.box(0, 8.35, -0.52, 2, 0.12, 0.04, { c: hex('#40e8ff'), emis: 5, span: 1 });
    b.box(0, 9.35, -0.52, 2, 0.08, 0.04, { c: hex('#ff40c0'), emis: 5, span: 1 });
  },
  [O.MAGNET]: (b) => {
    b.cyl(0, 0, 0, 0.9, 0.7, 1.0, 10, dmetal);
    b.cyl(0, 1.0, 0, 0.55, 0.55, 3.2, 10, M('#c8a040', { spec: 0.8, hue: 0 }));
    for (let i = 0; i < 6; i++) b.cyl(0, 1.2 + i * 0.5, 0, 0.62, 0.62, 0.18, 10, M('#b06030', { emis: 0.8 }));
    b.cyl(0, 4.2, 0, 0.9, 0.9, 0.4, 10, dmetal);
    b.blob(0, 4.9, 0, 0.45, 0.45, 0.45, glassLit('#40a0ff', 5), 0, 1);
  },
  [O.LASER_POST]: (b) => {
    b.box(0, 0, 0, 0.6, 3, 0.6, dmetal);
    b.box(0, 2.0, 0, 0.7, 0.4, 0.7, glassLit('#ff2020', 2));
  },
  [O.CONE_STACK]: (b) => {
    for (let i = 0; i < 3; i++) {
      b.cyl(i * 0.5 - 0.5, 0, 0, 0.25, 0.04, 0.75, 8, M('#ff6a10', { emis: 0.1 }));
      b.cyl(i * 0.5 - 0.5, 0.3, 0, 0.17, 0.12, 0.15, 8, white, false);
    }
  },
  [O.WORK_SIGN]: (b) => {
    b.box(0, 0, 0, 0.08, 1.0, 0.08, dmetal);
    b.prism([[0, 1.0], [0, 2.0], [0, 1.5]], -0.02, 0.02, white);
    b.push().ry(Math.PI / 2);
    b.prism([[-0.55, 1.0], [0.55, 1.0], [0, 1.95]], -0.03, 0.03, M('#e83a20'));
    b.prism([[-0.4, 1.12], [0.4, 1.12], [0, 1.8]], -0.04, 0.04, M('#f8f0e0'));
    b.pop();
  },
  [O.DIGGER]: (b) => {
    b.box(0, 0, 0, 2.6, 0.8, 4, M('#2a2a2a'));
    b.box(0, 0.8, 0, 2.4, 1.0, 3, M('#f0b010', { spec: 0.4 }));
    b.box(0.2, 1.8, -0.5, 1.6, 1.6, 1.6, M('#f0b010', { spec: 0.4 }));
    b.box(0.2, 2.0, -0.5, 1.65, 0.9, 1.4, M('#3a4a5a', { spec: 0.7 }));
    b.beam([0, 1.8, 1.2], [0, 4.2, 3.2], 0.35, M('#f0b010'));
    b.beam([0, 4.2, 3.2], [0, 1.0, 5.2], 0.3, M('#f0b010'));
    b.box(0, 0.4, 5.3, 1.6, 0.9, 0.7, dmetal);
  },
  [O.CABIN]: (b) => {
    b.box(0, 0, 0, 2.6, 2.6, 6, M('#e8e0d0'));
    b.box(-1.32, 1.2, 1, 0.06, 0.9, 1.6, glassLit('#a0c0ff', 0.4));
    b.box(0, 2.6, 0, 2.7, 0.12, 6.1, M('#2a6ad0'));
  },
  [O.LIGHT_TOWER]: (b) => {
    b.box(0, 0, 0, 1.6, 0.6, 2.2, M('#f0b010'));
    b.cyl(0, 0.6, 0, 0.1, 0.08, 6.5, 6, metal);
    for (let i = 0; i < 4; i++) b.box(-0.8 + (i % 2) * 1.6, 7 + Math.floor(i / 2) * 0.6, 0, 0.5, 0.45, 0.2, glassLit('#fff4e0', 2.5));
  },
  [O.CACTUS]: (b) => {
    b.cyl(0, 0, 0, 0.42, 0.36, 4.2, 8, M('#4a7a3a', { hue: 0.5 }));
    b.blob(0, 4.2, 0, 0.36, 0.3, 0.36, M('#4a7a3a'), 0, 1);
    for (let i = 0; i < 8; i++) b.box(Math.cos(i) * 0.4, 0.5 + i * 0.45, Math.sin(i) * 0.4, 0.04, 0.04, 0.04, M('#f0e8c0'));
  },
  [O.CACTUS_ARM]: (b) => {
    b.cyl(0, 0, 0, 0.5, 0.42, 5.2, 8, M('#3e6e32', { hue: 0.5 }));
    b.blob(0, 5.2, 0, 0.42, 0.34, 0.42, M('#3e6e32'), 0, 1);
    for (const sd of [-1, 1]) {
      const y = 1.8 + (sd > 0 ? 0.8 : 0);
      b.beam([0, y, 0], [sd * 1.3, y + 0.3, 0], 0.5, M('#3e6e32'));
      b.cyl(sd * 1.3, y, 0, 0.3, 0.27, 1.8, 7, M('#3e6e32'));
      b.blob(sd * 1.3, y + 1.8, 0, 0.27, 0.25, 0.27, M('#3e6e32'), 0, 1);
    }
  },
  [O.OILPUMP]: (b) => {
    b.box(0, 0, 0, 2, 0.4, 5, concrete);
    b.beam([0, 0.4, -1], [0, 3.6, 0], 0.25, dmetal);
    b.beam([0, 0.4, 1], [0, 3.6, 0], 0.25, dmetal);
    b.box(0, 3.6, 0.3, 0.5, 0.5, 5.2, M('#c83020', { spec: 0.4 }));
    b.box(0, 3.0, 2.8, 0.6, 1.6, 0.9, M('#c83020'));
  },
  [O.BILLBOARD]: (b) => {
    for (const z of [-2.5, 2.5]) b.box(0, 0, z, 0.25, 6, 0.25, dmetal);
    const pal = ['#ff4a2a', '#2a8aff', '#ffd020', '#30d080', '#d040ff'];
    const c = pal[b.rng.int(pal.length)];
    b.box(0, 5, 0, 0.3, 3.4, 7.2, M('#f8f8f0'));
    b.box(-0.17, 5.2, -1.4, 0.04, 3.0, 4.0, M(c, { emis: 0.4 }));
    b.box(-0.17, 5.6, 2.0, 0.04, 2.2, 2.4, M('#202030', { emis: 0.2 }));
    b.blob(-0.2, 6.7, 2.0, 0.05, 0.8, 0.8, M(c, { emis: 0.8 }), 0, 1);
  },
  [O.GANTRY]: (b) => {
    for (const x of [-1, 1]) b.box(x + x * 0.5, 0, 0, 0.45, 8.1, 0.45, { c: hex('#8a9098'), spec: 0.5, span: 0.5 });
    b.box(0, 7, 0, 2, 0.5, 0.5, { c: hex('#8a9098'), spec: 0.5, span: 1 });
    b.box(0, 7.6, 0, 2, 0.5, 0.5, { c: hex('#8a9098'), spec: 0.5, span: 1 });
    b.box(0.1, 5.6, -0.35, 0.7, 2.4, 0.15, { c: hex('#1a5a2a'), span: 1, emis: 0.15 });
    b.box(0.1, 6.4, -0.44, 0.55, 0.25, 0.02, { c: hex('#f0f0f0'), span: 1, emis: 0.3 });
    b.box(0.05, 5.9, -0.44, 0.35, 0.25, 0.02, { c: hex('#f0f0f0'), span: 1, emis: 0.3 });
  },
  [O.ARCH]: (b) => {
    // start / checkpoint gantry: legs at the road edges + banner
    for (const x of [-1, 1]) {
      b.box(x + x * 0.6, 0, 0, 0.5, 7.6, 0.5, { c: hex('#d8d8dc'), spec: 0.6, span: 0.5 });
      b.box(x + x * 0.6, 0, 0, 1.2, 0.4, 1.2, { c: hex('#30303a'), span: 0.5 });
    }
    b.box(0, 5.8, 0, 2, 1.6, 0.6, { c: hex('#101018'), spec: 0.4, span: 1 });
    b.box(0, 6.0, -0.32, 2, 1.2, 0.04, { c: hex('#ff2a50'), emis: 1.2, span: 1 });
    b.box(0, 7.4, 0, 2, 0.15, 0.7, { c: hex('#ffd030'), emis: 1.5, span: 1 });
    for (let i = 0; i < 10; i++) b.box(-1 + i * 0.2 + 0.1, 5.82, -0.33, 0.1, 0.14, 0.03, { c: hex(i % 2 ? '#ffffff' : '#000000'), span: 1, emis: i % 2 ? 0.6 : 0 });
  },
  [O.PITSIGN]: (b) => {
    b.box(0, 0, 0, 0.12, 2.2, 0.12, dmetal);
    b.box(0, 2.2, 0, 0.1, 1.2, 1.6, M('#1a3aa8', { emis: 0.3 }));
    b.box(-0.06, 2.45, -0.3, 0.02, 0.7, 0.18, M('#ffffff', { emis: 0.6 }));
    b.box(-0.06, 2.45, 0.05, 0.02, 0.7, 0.18, M('#ffffff', { emis: 0.6 }));
    b.box(-0.06, 2.95, -0.12, 0.02, 0.2, 0.4, M('#ffffff', { emis: 0.6 }));
    b.box(-0.06, 2.45, 0.42, 0.02, 0.7, 0.14, M('#ffd020', { emis: 0.6 }));
  },
  [O.SPIRE]: (b) => {
    b.cyl(0, 0, 0, 22, 14, 60, 8, M('#26213e', { spec: 0.7, hue: 0 }));
    b.cyl(0, 60, 0, 14, 6, 90, 8, M('#2e2950', { spec: 0.7, hue: 0 }));
    b.cyl(0, 150, 0, 6, 0.5, 80, 8, M('#3a3460', { spec: 0.7 }));
    for (let y = 8; y < 150; y += 9) b.cyl(0, y, 0, 22 - y * 0.1, 22 - y * 0.1, 1.2, 8, glassLit(y % 18 ? '#40e8ff' : '#ff50c8', 3), false);
    b.blob(0, 232, 0, 2.5, 2.5, 2.5, glassLit('#ff3050', 8), 0, 1);
  },
  [O.PEAK]: (b) => {
    b.cyl(0, -20, 0, 380, 30, 420, 9, M('#5a6a80', { hue: 0 }), false, 0.35);
    b.cyl(0, 250, 0, 120, 8, 160, 9, M('#eef2fa', { spec: 0.3, hue: 0 }), false, 0.3);
  },
  [O.MESA]: (b) => {
    b.cyl(0, -10, 0, 140, 110, 70, 10, M('#b8603a', { hue: 0.3 }), true, 0.25);
    b.cyl(0, 60, 0, 110, 100, 6, 10, M('#c8784a'), true, 0.2);
    for (let i = 0; i < 4; i++) b.cyl(0, 10 + i * 13, 0, 133 - i * 6, 131 - i * 6, 3, 10, M('#a85030'), false, 0.25);
  },
  [O.CRANE]: (b) => {
    const y: Mat = M('#f0b818', { spec: 0.3 });
    b.box(0, 0, 0, 4, 1.2, 4, concrete);
    for (let i = 0; i < 12; i++) {
      b.box(0, 1.2 + i * 3.2, 0, 1.6, 0.2, 1.6, y);
      for (const [x, z] of [[-0.75, -0.75], [0.75, -0.75], [-0.75, 0.75], [0.75, 0.75]]) b.box(x, 1.2 + i * 3.2, z, 0.15, 3.2, 0.15, y);
    }
    b.box(0, 39.6, 6, 1.2, 1.2, 34, y);
    b.box(0, 39.6, -9, 3, 2.2, 4, concrete);
    b.box(0.8, 37.4, 0.6, 2.2, 2.2, 2.2, M('#e8e8e8'));
    b.beam([0, 39.6, 18], [0, 22, 18], 0.08, dmetal);
    b.box(0, 21, 18, 1.2, 1, 1.2, dmetal);
    b.box(0, 41, 0, 0.4, 0.4, 0.4, glassLit('#ff2020', 4));
  },
  [O.WINDMILL]: (b) => {
    b.cyl(0, 0, 0, 4, 2.6, 14, 8, M('#e8dcc8'));
    b.cyl(0, 14, 0, 2.9, 0.4, 4, 8, M('#5a3a2a'));
    b.push().t(0, 15, -3.2);
    for (let i = 0; i < 4; i++) {
      b.push().rz((i * Math.PI) / 2 + 0.3);
      b.box(0, 0, 0, 0.3, 9, 0.12, darkWood);
      b.box(0.85, 2.5, 0, 1.4, 6.5, 0.06, M('#d8d0c0'));
      b.pop();
    }
    b.pop();
    b.box(-4.02, 0, 0, 0.1, 2.4, 1.4, darkWood);
  },
  [O.RUIN]: (b) => {
    const st = M('#8a8478', { hue: 0.4 });
    b.box(-6, 0, 0, 2, 12, 2, st);
    b.box(6, 0, 0, 2, 9, 2, st);
    b.box(0, 0, 8, 14, 6, 1.6, st);
    b.prism([[-7, 12], [-5, 12], [0, 17], [5, 12], [6, 12], [6, 13], [0, 18.5], [-7, 13]], -1, 1, st);
    for (let i = 0; i < 5; i++) b.blob((b.rng.float() - 0.5) * 16, 0.4, (b.rng.float() - 0.5) * 10, 1.2, 0.8, 1, st, 0.3, 0);
  },
  [O.SKILIFT]: (b) => {
    b.box(0, 0, 0, 1.8, 0.6, 1.8, concrete);
    b.cyl(0, 0.6, 0, 0.5, 0.4, 16, 8, M('#d8d8d8', { spec: 0.6 }));
    b.box(0, 16.6, 0, 1, 0.6, 7, M('#c82a2a'));
    for (const z of [-3.2, 3.2]) {
      b.beam([0, 16.4, z], [0, 14, z + 60], 0.06, M('#333'));
      b.beam([0, 16.4, z], [0, 14, z - 60], 0.06, M('#333'));
    }
  },
  [O.PYLON]: (b) => {
    const st = M('#7a8088', { spec: 0.4 });
    const lv = [[0, 4], [10, 3.2], [20, 2.4], [30, 1.6], [38, 1.0]];
    for (let i = 0; i < lv.length - 1; i++) {
      const [y0, w0] = lv[i], [y1, w1] = lv[i + 1];
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.beam([sx * w0, y0, sz * w0], [sx * w1, y1, sz * w1], 0.25, st);
      b.beam([-w1, y1, -w1], [w1, y1, w1], 0.15, st);
      b.beam([w1, y1, -w1], [-w1, y1, w1], 0.15, st);
    }
    for (const y of [24, 31]) b.box(0, y, 0, 14, 0.5, 0.5, st);
    b.cyl(0, 38, 0, 0.2, 0.05, 5, 4, st);
    b.box(0, 42.6, 0, 0.6, 0.6, 0.6, glassLit('#ff2020', 5));
  },
  [O.CHURCH]: (b) => {
    b.box(0, 0, 0, 9, 7, 18, M('#d8d0c0'));
    b.prism([[-5, 7], [5, 7], [0, 11.5]], -9.4, 9.4, M('#6a4a3a'));
    b.box(0, 0, 11, 5, 18, 5, M('#d8d0c0'));
    b.cyl(0, 18, 11, 3.4, 0.1, 12, 8, M('#3a5a6a', { spec: 0.4 }));
    b.box(-2.52, 12, 11, 0.06, 2, 1.2, glassLit('#ffd090', 0.8));
  },
  [O.OVERPASS]: (b) => {
    const c: Mat = { c: hex('#a8a49c'), spec: 0.2, span: 1 };
    for (const x of [-1, 1]) {
      b.box(x + x * 4.5, 0, 0, 3, 6.6, 10, { c: hex('#9a968e'), span: 0.5 });
      b.box(x + x * 2.0, 0, 0, 1.0, 6.6, 1.0, { c: hex('#a8a49c'), span: 0.5 });
    }
    b.box(0, 6.4, 0, 2, 1.6, 12, c);
    b.box(0, 8.0, -5.8, 2, 1.1, 0.4, c);
    b.box(0, 8.0, 5.8, 2, 1.1, 0.4, c);
    b.box(0, 6.2, -6.05, 2, 0.15, 0.1, { c: hex('#ffd030'), span: 1, emis: 0.3 });
  },
  [O.FIRETOWER]: (b) => {
    for (const [x, z] of [[-2, -2], [2, -2], [2, 2], [-2, 2]]) b.beam([x, 0, z], [x * 0.5, 18, z * 0.5], 0.3, wood);
    for (let y = 4; y < 18; y += 4.5) {
      const w = 2 - (y / 18) * 1;
      b.box(0, y, 0, w * 2.1, 0.2, 0.2, wood);
      b.box(0, y, 0, 0.2, 0.2, w * 2.1, wood);
    }
    b.box(0, 18, 0, 3.6, 0.3, 3.6, darkWood);
    b.box(0, 18.3, 0, 3, 2.2, 3, M('#8a5a3a'));
    b.box(0, 18.9, 0, 3.05, 1.0, 3.05, glassLit('#ffd8a0', 0.4));
    b.prism([[-2.2, 20.5], [2.2, 20.5], [0, 22.5]], -2.2, 2.2, M('#3a4a3a'));
  },
  [O.TURBINE]: (b) => {
    b.cyl(0, 0, 0, 1.6, 0.9, 62, 10, M('#f0f2f4', { spec: 0.5, hue: 0 }));
    b.box(0, 61, -1.5, 2.2, 2.6, 6, M('#f0f2f4', { spec: 0.5 }));
    // blades rotate in the shader (sway channel 2 = rotor): authored around (0,62.3,-4.6)
    for (let i = 0; i < 3; i++) {
      b.push().t(0, 62.3, -4.6).rz((i * Math.PI * 2) / 3);
      b.prism([[-0.9, 0], [0.9, 0], [0.4, 30], [-0.1, 31]], -0.2, 0.2, { c: hex('#f6f8fa'), spec: 0.5, sway: 1.0, hue: 0 });
      b.pop();
    }
    b.blob(0, 62.3, -4.7, 1.1, 1.1, 1.3, { c: hex('#e8eaec'), spec: 0.5, sway: 1.0, hue: 0 }, 0, 1);
  },
  [O.WINDSOCK]: (b) => {
    b.cyl(0, 0, 0, 0.08, 0.06, 5, 6, metal);
    for (let i = 0; i < 4; i++) b.cyl(0.2 + i * 0.5, 4.6 - i * 0.05, 0, 0.32 - i * 0.05, 0.28 - i * 0.05, 0.5, 8, { c: hex(i % 2 ? '#f2f2f2' : '#ff5010'), sway: 1, hue: 0 }, false);
  },
  [O.LIGHTHOUSE]: (b) => {
    b.cyl(0, 0, 0, 5, 3.2, 26, 12, M('#f2f2ee'));
    for (let i = 0; i < 3; i++) b.cyl(0, 4 + i * 8, 0, 4.7 - i * 0.6, 4.4 - i * 0.6, 3.5, 12, red, false);
    b.cyl(0, 26, 0, 4, 4, 0.6, 12, dmetal);
    b.cyl(0, 26.6, 0, 2.4, 2.4, 3.2, 12, glassLit('#fff2c0', 4));
    b.cyl(0, 29.8, 0, 2.8, 0.2, 2.4, 12, red);
  },
  [O.SNOWMAN]: (b) => {
    const sn: Mat = { c: hex('#f8faff'), spec: 0.3, hue: 0 };
    b.blob(0, 0.6, 0, 0.7, 0.65, 0.7, sn, 0.05, 1);
    b.blob(0, 1.55, 0, 0.5, 0.48, 0.5, sn, 0.05, 1);
    b.blob(0, 2.25, 0, 0.34, 0.33, 0.34, sn, 0.05, 1);
    b.push().t(-0.32, 2.25, 0).rz(Math.PI / 2);
    b.cyl(0, 0, 0, 0.06, 0, 0.35, 6, M('#ff7a10'));
    b.pop();
    b.cyl(0, 2.5, 0, 0.3, 0.3, 0.06, 8, M('#202020'));
    b.cyl(0, 2.55, 0, 0.2, 0.2, 0.35, 8, M('#202020'));
    b.box(0, 1.92, 0, 0.62, 0.12, 0.62, M('#c8202a'));
  },
  [O.BOARD]: (b) => {
    b.box(0, 0, 0, 0.1, 1.6, 0.1, dmetal);
    b.box(0, 1.6, 0, 0.08, 0.8, 1.4, M('#f4f4f0'));
  },
};

/** objects drawn at any distance (not culled by terrain extents) */
export const LANDMARK = new Set<number>([O.PEAK, O.MESA, O.SPIRE, O.CRANE, O.PYLON, O.TURBINE, O.LIGHTHOUSE, O.WINDMILL, O.SKILIFT, O.CHURCH, O.FIRETOWER, O.RUIN, O.TOWER]);
/** spanning objects (stretch across the road) */
export const SPANNING = new Set<number>([O.ARCH, O.GANTRY, O.HOLO_ARCH, O.OVERPASS]);
/** lamps that light the road at night */
export const LAMPS = new Set<number>([O.LAMP, O.LAMP_DOUBLE, O.NEON_PYLON, O.LIGHT_TOWER]);

export function buildModel(type: number, variant = 0): MB {
  const b = new MB(type * 131 + variant * 7 + 1);
  const f = LIB[type as O];
  if (f) f(b);
  else b.box(0, 0, 0, 1, 1, 1, M('#ff00ff'));
  return b;
}

export function hasModel(type: number): boolean {
  return LIB[type as O] !== undefined;
}

/** Motorway traffic: 0 hatchback, 1 van, 2 lorry. Authored facing +z, drawn rotated to face the player. */
export function buildTraffic(kind: number): MB {
  const b = new MB(900 + kind);
  const body: Mat = { c: hex('#d0d0d0'), spec: 0.5, hue: 1 };
  const glass: Mat = { c: hex('#101418'), spec: 0.9, hue: 0 };
  const tyre: Mat = { c: hex('#111'), spec: 0.1, hue: 0 };
  const head: Mat = { c: hex('#fff6e0'), spec: 0.5, emis: 2.5, hue: 0 };
  const tail: Mat = { c: hex('#ff1a10'), spec: 0.5, emis: 1.2, hue: 0 };
  const wheels = (len: number, w: number, r: number) => {
    for (const z of [-len * 0.32, len * 0.32]) for (const x of [-w / 2, w / 2]) {
      b.push().t(x, r, z).rz(Math.PI / 2);
      b.cyl(0, -0.12, 0, r, r, 0.24, 10, tyre);
      b.pop();
    }
  };
  if (kind === 0) {
    b.box(0, 0.32, 0, 1.72, 0.62, 4.1, body);
    b.prism([[-0.8, 0.94], [0.8, 0.94], [0.68, 1.42], [-0.68, 1.42]], -1.4, 1.0, body);
    b.prism([[-0.81, 0.98], [0.81, 0.98], [0.69, 1.38], [-0.69, 1.38]], -1.35, 0.95, glass);
    for (const x of [-0.6, 0.6]) { b.box(x, 0.62, 2.04, 0.36, 0.14, 0.04, head); b.box(x, 0.7, -2.05, 0.3, 0.14, 0.04, tail); }
    wheels(4.1, 1.62, 0.32);
  } else if (kind === 1) {
    b.box(0, 0.34, 0, 1.95, 1.75, 5.2, body);
    b.box(0, 1.25, 1.95, 1.9, 0.6, 0.8, glass);
    for (const x of [-0.7, 0.7]) { b.box(x, 0.7, 2.61, 0.34, 0.16, 0.04, head); b.box(x, 0.9, -2.61, 0.25, 0.3, 0.04, tail); }
    wheels(5.2, 1.85, 0.36);
  } else {
    b.box(0, 0.5, 4.3, 2.4, 2.3, 2.4, { c: hex('#2a5ad0'), spec: 0.5, hue: 1 });
    b.box(0, 1.65, 5.52, 2.2, 0.9, 0.06, glass);
    b.box(0, 0.9, -1.4, 2.5, 3.2, 8.6, { c: hex('#eeeeea'), spec: 0.3, hue: 0.3 });
    b.box(0, 0.5, -1.4, 2.2, 0.4, 8.8, { c: hex('#333'), spec: 0.2 });
    for (const x of [-0.9, 0.9]) { b.box(x, 0.75, 5.52, 0.38, 0.2, 0.04, head); b.box(x, 0.8, -5.72, 0.3, 0.2, 0.04, tail); }
    for (const z of [-4.2, -2.8, 3.6]) for (const x of [-1.1, 1.1]) {
      b.push().t(x, 0.5, z).rz(Math.PI / 2);
      b.cyl(0, -0.15, 0, 0.5, 0.5, 0.3, 10, tyre);
      b.pop();
    }
  }
  return b;
}
