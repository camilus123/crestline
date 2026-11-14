// The 19 rival drivers. Names and liveries are original.

import { Rng } from '../core/rng';
import { RivalCfg } from './race';

export const RIVAL_NAMES = [
  'Ines Vey', 'Tomas Hruby', 'Kofi Okafor', 'Mila Strand', 'Jens Kalloway', 'Aiko Mori', 'Dario Brenna',
  'Freya Lund', 'Ozan Demir', 'Petra Novak', 'Luc Ferrand', 'Nadia Sorel', 'Viktor Ash', 'Sol Ramirez',
  'Bram de Wit', 'Yuki Tanabe', 'Elena Varga', 'Hugo Marsh', 'Jure Kos',
];

/** Livery palette (index -> [body, accent]) in linear-ish sRGB 0..1. Index 0..3 reserved for players. */
export const LIVERIES: [number[], number[]][] = [
  [[0.85, 0.06, 0.08], [0.95, 0.95, 0.95]], // racing red
  [[0.05, 0.35, 0.95], [1.0, 0.8, 0.1]], // electric blue
  [[1.0, 0.78, 0.05], [0.08, 0.08, 0.08]], // sunburst yellow
  [[0.1, 0.85, 0.35], [0.05, 0.05, 0.1]], // acid green
  [[0.95, 0.4, 0.02], [0.1, 0.1, 0.12]],
  [[0.6, 0.1, 0.85], [0.95, 0.9, 1.0]],
  [[0.95, 0.95, 0.97], [0.85, 0.05, 0.1]],
  [[0.06, 0.06, 0.08], [0.95, 0.7, 0.1]],
  [[0.0, 0.7, 0.75], [1.0, 1.0, 1.0]],
  [[0.95, 0.25, 0.55], [0.1, 0.1, 0.12]],
  [[0.45, 0.48, 0.52], [0.9, 0.2, 0.1]],
  [[0.05, 0.2, 0.45], [0.95, 0.95, 0.95]],
  [[0.55, 0.85, 0.1], [0.1, 0.1, 0.1]],
  [[0.7, 0.04, 0.12], [0.95, 0.8, 0.5]],
  [[0.98, 0.6, 0.2], [0.2, 0.1, 0.5]],
  [[0.2, 0.55, 0.3], [0.95, 0.9, 0.7]],
  [[0.35, 0.2, 0.75], [0.1, 0.95, 0.9]],
  [[0.9, 0.85, 0.7], [0.3, 0.15, 0.05]],
  [[0.1, 0.45, 0.95], [0.95, 0.95, 0.95]],
  [[0.75, 0.1, 0.5], [1.0, 0.85, 0.2]],
  [[0.25, 0.25, 0.28], [0.1, 0.9, 0.4]],
  [[0.98, 0.9, 0.2], [0.85, 0.1, 0.1]],
  [[0.5, 0.75, 0.95], [0.05, 0.1, 0.3]],
];

export const PLAYER_COLORS = [0, 1, 2, 3];

/** Build the rival field for a season / race. Seeded, so a season always has the same field. */
export function makeRivals(seed: number, difficulty: number): RivalCfg[] {
  const rng = new Rng(seed);
  const out: RivalCfg[] = [];
  const base = [0.875, 0.915, 0.94][difficulty] ?? 0.92;
  const spread = [0.09, 0.075, 0.06][difficulty] ?? 0.08;
  const aggr = [0.15, 0.35, 0.6][difficulty] ?? 0.3;
  for (let i = 0; i < 19; i++) {
    // a few stars, a midfield and some backmarkers
    const rank = i / 18; // 0 = strongest
    const skill = base + spread * (0.5 - rank) + (rng.float() - 0.5) * 0.015;
    out.push({
      name: RIVAL_NAMES[i],
      car: i % 3 === 0 ? 0 : i % 3 === 1 ? 2 : 1,
      color: 4 + (i % (LIVERIES.length - 4)),
      skill,
      aggression: Math.min(1, aggr * (0.5 + rng.float())),
    });
  }
  return out;
}
