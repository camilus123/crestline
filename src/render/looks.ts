// Per-scenario visual identity. Colours are authored as sRGB hex and converted to linear.

export type RGB = [number, number, number];

export function hex(h: string, mul = 1): RGB {
  let x = h.replace('#', '');
  if (x.length === 3) x = x[0] + x[0] + x[1] + x[1] + x[2] + x[2];
  const v = parseInt(x, 16);
  const c = (x: number) => {
    const s = x / 255;
    return (s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)) * mul;
  };
  return [c((v >> 16) & 255), c((v >> 8) & 255), c(v & 255)];
}

export interface Look {
  skyZenith: RGB;
  skyHorizon: RGB;
  skyGlow: RGB;
  sunAz: number; // degrees, world azimuth
  sunEl: number; // degrees
  sunColor: RGB;
  sunSize: number;
  ambTop: RGB;
  ambBot: RGB;
  fogColor: RGB;
  fogDensity: number;
  fogHeight: number;
  fogMax: number;
  fogSun: RGB;
  cloudCover: number;
  cloudColor: RGB;
  cloudShade: RGB;
  cloudSpeed: number;
  cloudHigh: number; // cirrus amount
  layers: { color: RGB; height: number; rough: number; kind: number }[]; // far -> near; kind 0 mountains 1 hills 2 city 3 mesas 4 trees 5 sea
  snowCaps: number;
  stars: number;
  moon: number;
  planet: number;
  cityGlow: number;
  ground: [RGB, RGB, RGB];
  groundType: number; // 0 grass 1 sand 2 snow 3 marsh 4 alpine 5 city 6 dry/dirt 7 forest floor
  terr: [number, number, number, number]; // amp, freq, rise, type
  terr2: [number, number, number, number]; // wallH, cliffDepth, dunes, water level
  water: RGB;
  road: {
    base: RGB;
    line: RGB;
    edge: boolean;
    center: number; // 0 none 1 dashed 2 double solid 3 lanes(motorway) 4 neon
    rumbleA: RGB;
    rumbleB: RGB;
    dirt: number; // 0 asphalt .. 1 dirt
    snow: number; // compacted snow cover
    patch: number; // patched/poor surface
    gloss: number;
  };
  wet: number;
  grade: { sat: number; contrast: number; exposure: number; tint: RGB; lift: RGB; vignette: number };
  rain: number;
  snow: number;
  lightning: number;
  debris: number;
  mist: number;
  night: number;
  bloom: number;
  bloomThreshold: number;
  heatHaze: number;
  shaftStrength: number;
  streetLights: boolean;
  carLights: boolean;
}

const base = (o: Partial<Look>): Look => ({
  skyZenith: hex('#2a6fdb'), skyHorizon: hex('#a9d4ff'), skyGlow: hex('#fff2d6'),
  sunAz: 30, sunEl: 35, sunColor: hex('#fff1dc', 3.2), sunSize: 1,
  ambTop: hex('#8fb8ff', 0.75), ambBot: hex('#6f7f5a', 0.4),
  fogColor: hex('#b8d4f0'), fogDensity: 0.00045, fogHeight: 0.004, fogMax: 0.92, fogSun: hex('#ffe6c0', 0.5),
  cloudCover: 0.45, cloudColor: hex('#ffffff', 1.2), cloudShade: hex('#8c9bb3'), cloudSpeed: 0.004, cloudHigh: 0.3,
  layers: [
    { color: hex('#7d98c2'), height: 5.5, rough: 0.6, kind: 0 },
    { color: hex('#4f7a72'), height: 3.2, rough: 0.5, kind: 1 },
    { color: hex('#2e5a3a'), height: 1.6, rough: 0.8, kind: 4 },
  ],
  snowCaps: 0, stars: 0, moon: 0, planet: 0, cityGlow: 0,
  ground: [hex('#4d7d2e'), hex('#6f9a38'), hex('#a8a058')], groundType: 0,
  terr: [14, 0.008, 0.6, 0], terr2: [0, 0, 0, -60],
  water: hex('#2a5a6a'),
  road: { base: hex('#3d3e42'), line: hex('#f2f2ea'), edge: true, center: 1, rumbleA: hex('#d81e1e'), rumbleB: hex('#f4f4f4'), dirt: 0, snow: 0, patch: 0.15, gloss: 0.2 },
  wet: 0,
  grade: { sat: 1.18, contrast: 1.08, exposure: 1.0, tint: [1, 1, 1], lift: [0, 0, 0], vignette: 0.35 },
  rain: 0, snow: 0, lightning: 0, debris: 0, mist: 0, night: 0, bloom: 0.08, bloomThreshold: 1.6,
  heatHaze: 0, shaftStrength: 0.15, streetLights: false, carLights: false,
  ...o,
});

export const LOOKS: Look[] = [
  // 0 Rally – sunlit summer dirt stages
  base({
    sunAz: 210, sunEl: 32, cloudCover: 0.5,
    ground: [hex('#3a6424'), hex('#5e8434'), hex('#a8905a')], groundType: 0,
    terr: [16, 0.007, 0.8, 0],
    road: { base: hex('#8c6a46'), line: hex('#ffffff'), edge: false, center: 0, rumbleA: hex('#c11'), rumbleB: hex('#fff'), dirt: 1, snow: 0, patch: 0, gloss: 0.05 },
    layers: [
      { color: hex('#7e9cc8'), height: 6.5, rough: 0.6, kind: 0 },
      { color: hex('#557f6c'), height: 3.6, rough: 0.5, kind: 1 },
      { color: hex('#2f5a2a'), height: 1.9, rough: 0.9, kind: 4 },
    ],
  }),
  // 1 Futuristic – neon megacity at dusk
  base({
    skyZenith: hex('#120734'), skyHorizon: hex('#ff4f8b'), skyGlow: hex('#ffb070'),
    sunAz: 350, sunEl: 4, sunColor: hex('#ff9a6a', 1.6), sunSize: 2.6,
    ambTop: hex('#6a4cff', 0.8), ambBot: hex('#ff3fa0', 0.4),
    fogColor: hex('#5a2a7a'), fogDensity: 0.0012, fogSun: hex('#ff7a50', 0.6), fogMax: 0.9,
    cloudCover: 0.25, cloudColor: hex('#ff9ad0', 0.8), cloudShade: hex('#4a1a6a'), cloudHigh: 0.6,
    layers: [
      { color: hex('#3b1f6e'), height: 7.5, rough: 1, kind: 2 },
      { color: hex('#2a1554'), height: 5, rough: 1, kind: 2 },
      { color: hex('#180b33'), height: 3, rough: 1, kind: 2 },
    ],
    planet: 1, stars: 0.4,
    ground: [hex('#1c1b2e'), hex('#2a2846'), hex('#00e5ff')], groundType: 5,
    terr: [0.0, 0.01, 0, 5],
    road: { base: hex('#191a26'), line: hex('#3ff6ff', 6), edge: true, center: 4, rumbleA: hex('#ff2fb4', 3), rumbleB: hex('#1a1a26'), dirt: 0, snow: 0, patch: 0, gloss: 0.9 },
    wet: 0.55,
    grade: { sat: 1.25, contrast: 1.1, exposure: 1.05, tint: [1.02, 0.96, 1.08], lift: [0.01, 0, 0.02], vignette: 0.45 },
    bloom: 0.22, bloomThreshold: 1.1, carLights: true, streetLights: false,
  }),
  // 2 Night – country roads under the stars
  base({
    skyZenith: hex('#02040d'), skyHorizon: hex('#0d1a33'), skyGlow: hex('#1a2c55'),
    sunAz: 140, sunEl: 28, sunColor: hex('#9fb4ff', 0.09), sunSize: 0,
    ambTop: hex('#2a3a66', 0.06), ambBot: hex('#101418', 0.02),
    fogColor: hex('#060a16'), fogDensity: 0.0024, fogSun: hex('#000000'), fogMax: 1,
    cloudCover: 0.2, cloudColor: hex('#2a3550', 0.4), cloudShade: hex('#05070d'), cloudHigh: 0.2,
    layers: [
      { color: hex('#0b1222'), height: 4.5, rough: 0.6, kind: 1 },
      { color: hex('#070c17'), height: 2.6, rough: 0.7, kind: 1 },
      { color: hex('#04070e'), height: 1.4, rough: 0.9, kind: 4 },
    ],
    stars: 1, moon: 1, cityGlow: 1,
    ground: [hex('#243a1e'), hex('#33502a'), hex('#5a6a3a')], groundType: 0,
    road: { base: hex('#2c2d31'), line: hex('#f5f5f0'), edge: true, center: 1, rumbleA: hex('#d81e1e'), rumbleB: hex('#f4f4f4'), dirt: 0, snow: 0, patch: 0.2, gloss: 0.35 },
    wet: 0.15, night: 1, carLights: true, streetLights: true, bloom: 0.16, bloomThreshold: 1.0,
    grade: { sat: 1.1, contrast: 1.12, exposure: 1.25, tint: [0.92, 0.98, 1.1], lift: [0.002, 0.004, 0.01], vignette: 0.5 },
  }),
  // 3 Marsh – hazy wetlands, low sun
  base({
    skyZenith: hex('#56707a'), skyHorizon: hex('#d6cda4'), skyGlow: hex('#ffd59a'),
    sunAz: 280, sunEl: 12, sunColor: hex('#ffd29a', 2.2),
    ambTop: hex('#a8b8a8', 0.6), ambBot: hex('#5a5a3a', 0.35),
    fogColor: hex('#c2c0a0'), fogDensity: 0.0016, fogSun: hex('#ffcf8a', 0.6), fogHeight: 0.02,
    cloudCover: 0.7, cloudColor: hex('#e8e0c8', 1.0), cloudShade: hex('#7a7f6f'),
    layers: [
      { color: hex('#9aa792'), height: 2.2, rough: 0.3, kind: 1 },
      { color: hex('#6e7b5e'), height: 1.4, rough: 0.6, kind: 4 },
      { color: hex('#4a5638'), height: 0.8, rough: 1, kind: 4 },
    ],
    ground: [hex('#4f5a2a'), hex('#7a7a3a'), hex('#5a4a2a')], groundType: 3,
    terr: [1.2, 0.012, 0, 7], terr2: [0, 0, 0, -0.5],
    water: hex('#3a4a3a'),
    road: { base: hex('#4a4740'), line: hex('#e8e2cc'), edge: true, center: 1, rumbleA: hex('#b22'), rumbleB: hex('#eee'), dirt: 0.15, snow: 0, patch: 0.5, gloss: 0.3 },
    wet: 0.45, mist: 0.7,
    grade: { sat: 1.15, contrast: 1.14, exposure: 0.98, tint: [1.03, 1.0, 0.92], lift: [0.0, 0.0, 0], vignette: 0.42 },
  }),
  // 4 Mountains – alpine passes
  base({
    skyZenith: hex('#1450b8'), skyHorizon: hex('#c8e2ff'), sunAz: 160, sunEl: 40, sunColor: hex('#fff6e8', 3.6),
    fogColor: hex('#9cb2c8'), fogDensity: 0.00035,
    cloudCover: 0.35, cloudHigh: 0.5,
    layers: [
      { color: hex('#8aa3cc'), height: 12, rough: 0.8, kind: 0 },
      { color: hex('#5f7896'), height: 8, rough: 0.8, kind: 0 },
      { color: hex('#3d5068'), height: 4.5, rough: 0.9, kind: 0 },
    ],
    snowCaps: 1, ambBot: hex('#a08a68', 0.75), ambTop: hex('#9ab8e8', 0.75),
    ground: [hex('#3e5a2a'), hex('#7a7a6a'), hex('#9a9a92')], groundType: 4,
    terr: [10, 0.01, 1.5, 4], terr2: [40, 160, 0, -60],
    road: { base: hex('#36373b'), line: hex('#f6d23a'), edge: true, center: 2, rumbleA: hex('#d22'), rumbleB: hex('#fff'), dirt: 0, snow: 0, patch: 0.15, gloss: 0.2 },
  }),
  // 5 Snow – frozen forest, driving snow
  base({
    skyZenith: hex('#8a9cb4'), skyHorizon: hex('#e2e8f0'), skyGlow: hex('#fffaf0'),
    sunAz: 200, sunEl: 14, sunColor: hex('#fff4e8', 1.4),
    ambTop: hex('#c8d8f0', 0.9), ambBot: hex('#d8e0ea', 0.6),
    fogColor: hex('#d8dee8'), fogDensity: 0.0032, fogSun: hex('#ffffff', 0.2), fogHeight: 0.002,
    cloudCover: 0.95, cloudColor: hex('#e8ecf2'), cloudShade: hex('#9aa4b4'),
    layers: [
      { color: hex('#b8c4d4'), height: 6, rough: 0.7, kind: 0 },
      { color: hex('#98a8bc'), height: 3.5, rough: 0.8, kind: 4 },
      { color: hex('#6a7c90'), height: 1.8, rough: 1, kind: 4 },
    ],
    snowCaps: 1,
    ground: [hex('#e8eef6'), hex('#ffffff'), hex('#b8c8dc')], groundType: 2,
    terr: [10, 0.008, 0.8, 3],
    road: { base: hex('#c8ced8'), line: hex('#ffffff'), edge: false, center: 0, rumbleA: hex('#d22'), rumbleB: hex('#fff'), dirt: 0, snow: 1, patch: 0, gloss: 0.4 },
    snow: 1, debris: 0,
    grade: { sat: 1.05, contrast: 1.06, exposure: 0.95, tint: [0.97, 1.0, 1.05], lift: [0, 0, 0.01], vignette: 0.35 },
  }),
  // 6 Roadworks – dusty industrial edge of town
  base({
    skyZenith: hex('#2f6fc4'), skyHorizon: hex('#c8dcec'), sunAz: 100, sunEl: 42, sunColor: hex('#fff0d8', 3.4),
    fogColor: hex('#c8d4dc'), fogDensity: 0.0007, fogSun: hex('#ffe0b0', 0.4),
    cloudCover: 0.25,
    layers: [
      { color: hex('#a8a8a4'), height: 3.5, rough: 1, kind: 2 },
      { color: hex('#8a8a78'), height: 2.4, rough: 0.6, kind: 1 },
      { color: hex('#5a6a3a'), height: 1.2, rough: 1, kind: 4 },
    ],
    ground: [hex('#5a6a34'), hex('#7a7a48'), hex('#6a5434')], groundType: 6,
    terr: [5, 0.01, 0.4, 0],
    road: { base: hex('#3e3c3a'), line: hex('#ffc21a'), edge: true, center: 1, rumbleA: hex('#ff8a00'), rumbleB: hex('#1a1a1a'), dirt: 0, snow: 0, patch: 0.8, gloss: 0.15 },
    grade: { sat: 1.15, contrast: 1.08, exposure: 1.0, tint: [1.04, 1.0, 0.94], lift: [0.01, 0.005, 0], vignette: 0.35 },
  }),
  // 7 Storm – rain, thunder and lightning
  base({
    skyZenith: hex('#161c24'), skyHorizon: hex('#4a5460'), skyGlow: hex('#6a7480'),
    sunAz: 60, sunEl: 25, sunColor: hex('#c8d0e0', 0.5),
    ambTop: hex('#5a6878', 0.55), ambBot: hex('#2a3228', 0.3),
    fogColor: hex('#3a424c'), fogDensity: 0.0026, fogSun: hex('#000000'),
    cloudCover: 1, cloudColor: hex('#4a5260', 0.8), cloudShade: hex('#12161c'), cloudSpeed: 0.02,
    layers: [
      { color: hex('#2a323c'), height: 3.5, rough: 0.6, kind: 1 },
      { color: hex('#1e252c'), height: 2.2, rough: 0.7, kind: 1 },
      { color: hex('#131a16'), height: 1.4, rough: 0.9, kind: 4 },
    ],
    ground: [hex('#2e4a22'), hex('#40602a'), hex('#4a4a32')], groundType: 0,
    road: { base: hex('#2a2b2e'), line: hex('#e8e8e0'), edge: true, center: 1, rumbleA: hex('#b11'), rumbleB: hex('#ddd'), dirt: 0, snow: 0, patch: 0.6, gloss: 0.6 },
    wet: 1, rain: 1, lightning: 1, carLights: true, bloom: 0.12,
    grade: { sat: 0.98, contrast: 1.1, exposure: 1.32, tint: [0.94, 0.98, 1.06], lift: [0.004, 0.008, 0.014], vignette: 0.45 },
  }),
  // 8 Desert – heat, sand and mesas
  base({
    skyZenith: hex('#2f6fd0'), skyHorizon: hex('#ffdcae'), skyGlow: hex('#fff0cc'),
    sunAz: 120, sunEl: 50, sunColor: hex('#fff2d8', 3.5),
    ambTop: hex('#9cc0ff', 0.8), ambBot: hex('#c08a50', 0.55),
    fogColor: hex('#f2d6b0'), fogDensity: 0.00055, fogSun: hex('#fff0d0', 0.4),
    cloudCover: 0.08, cloudHigh: 0.25,
    layers: [
      { color: hex('#d89a78'), height: 4, rough: 0.2, kind: 3 },
      { color: hex('#b86a48'), height: 2.8, rough: 0.2, kind: 3 },
      { color: hex('#c8925a'), height: 1.1, rough: 0.3, kind: 1 },
    ],
    ground: [hex('#c4824a'), hex('#d8a066'), hex('#a8622e')], groundType: 1,
    terr: [6, 0.006, 0.3, 2], terr2: [0, 0, 6, -5],
    road: { base: hex('#4a4644'), line: hex('#f0e6c8'), edge: true, center: 1, rumbleA: hex('#c22'), rumbleB: hex('#eee'), dirt: 0, snow: 0, patch: 0.3, gloss: 0.12 },
    heatHaze: 1,
    grade: { sat: 1.16, contrast: 1.12, exposure: 0.9, tint: [1.05, 1.0, 0.92], lift: [0.01, 0.005, 0], vignette: 0.38 },
  }),
  // 9 Fog – grey morning farmland
  base({
    skyZenith: hex('#a8b2b8'), skyHorizon: hex('#c4ccd0'), skyGlow: hex('#e8e4d8'),
    sunAz: 90, sunEl: 10, sunColor: hex('#fff4e0', 0.8),
    ambTop: hex('#c0c8d0', 0.85), ambBot: hex('#6a7060', 0.45),
    fogColor: hex('#b6bec2'), fogDensity: 0.0155, fogSun: hex('#fff0d0', 0.15), fogHeight: 0.0, fogMax: 1,
    cloudCover: 1, cloudColor: hex('#c8ced2'), cloudShade: hex('#a0a8ae'),
    layers: [],
    ground: [hex('#3e6a2e'), hex('#58803a'), hex('#7a7a52')], groundType: 0,
    road: { base: hex('#46474a'), line: hex('#f2f2ee'), edge: true, center: 1, rumbleA: hex('#c22'), rumbleB: hex('#eee'), dirt: 0, snow: 0, patch: 0.2, gloss: 0.35 },
    wet: 0.3, carLights: true,
    grade: { sat: 0.95, contrast: 1.04, exposure: 1.0, tint: [0.98, 1.0, 1.02], lift: [0.01, 0.01, 0.012], vignette: 0.3 },
  }),
  // 10 Motorway – golden hour, oncoming traffic
  base({
    skyZenith: hex('#253f80'), skyHorizon: hex('#ffb070'), skyGlow: hex('#ffd090'),
    sunAz: 8, sunEl: 7, sunColor: hex('#ffc890', 3.0), sunSize: 1.6,
    ambTop: hex('#8aa0d8', 0.52), ambBot: hex('#8a6a4a', 0.32),
    fogColor: hex('#d8a882'), fogDensity: 0.00055, fogSun: hex('#ffb070', 0.7),
    cloudCover: 0.35, cloudColor: hex('#ffd0b0', 1.1), cloudShade: hex('#7a6080'),
    layers: [
      { color: hex('#8a7aa0'), height: 5, rough: 1, kind: 2 },
      { color: hex('#6a6a80'), height: 2.5, rough: 0.6, kind: 1 },
      { color: hex('#3e4a3a'), height: 1.2, rough: 1, kind: 4 },
    ],
    ground: [hex('#5a7a32'), hex('#7a9a3e'), hex('#9a8a58')], groundType: 0,
    terr: [8, 0.006, 0.3, 6],
    road: { base: hex('#38393d'), line: hex('#f4f4ee'), edge: true, center: 3, rumbleA: hex('#eee'), rumbleB: hex('#333'), dirt: 0, snow: 0, patch: 0.1, gloss: 0.25 },
    grade: { sat: 1.2, contrast: 1.08, exposure: 1.0, tint: [1.06, 1.0, 0.92], lift: [0.01, 0.005, 0.0], vignette: 0.4 },
    carLights: true,
  }),
  // 11 Wind – bright coast, fast clouds
  base({
    skyZenith: hex('#2a78d8'), skyHorizon: hex('#c4e6ff'), sunAz: 250, sunEl: 38,
    cloudCover: 0.55, cloudSpeed: 0.03,
    layers: [
      { color: hex('#2e6aa8'), height: 0.4, rough: 0, kind: 5 },
      { color: hex('#6a9a7a'), height: 2.5, rough: 0.4, kind: 1 },
      { color: hex('#4a7a3a'), height: 1.2, rough: 0.6, kind: 1 },
    ],
    ground: [hex('#3a6a2c'), hex('#5a843a'), hex('#b8a860')], groundType: 0,
    terr: [12, 0.006, 0.5, 0],
    debris: 1,
    grade: { sat: 1.08, contrast: 1.08, exposure: 0.97, tint: [1, 1, 1], lift: [0, 0, 0], vignette: 0.32 },
  }),
  // 12 Forest – deep woods, dappled light
  base({
    skyZenith: hex('#3a82c8'), skyHorizon: hex('#d4ead0'), sunAz: 300, sunEl: 28, sunColor: hex('#fff0c8', 3.0),
    ambTop: hex('#88b088', 0.6), ambBot: hex('#3a4a2a', 0.35),
    fogColor: hex('#a8c8b0'), fogDensity: 0.0012, fogSun: hex('#fff0c0', 0.6),
    layers: [
      { color: hex('#5a8a7a'), height: 4.5, rough: 0.5, kind: 1 },
      { color: hex('#2f5a3a'), height: 3, rough: 1, kind: 4 },
      { color: hex('#1e3a22'), height: 2, rough: 1, kind: 4 },
    ],
    ground: [hex('#3a4a1e'), hex('#4e6a26'), hex('#6a4a2a')], groundType: 7,
    terr: [10, 0.009, 1.0, 0],
    road: { base: hex('#3a3b3c'), line: hex('#f0f0e8'), edge: true, center: 1, rumbleA: hex('#c22'), rumbleB: hex('#eee'), dirt: 0.1, snow: 0, patch: 0.3, gloss: 0.2 },
    shaftStrength: 0.5, wet: 0.1,
    grade: { sat: 1.18, contrast: 1.08, exposure: 1.02, tint: [0.98, 1.03, 0.96], lift: [0, 0.005, 0], vignette: 0.4 },
  }),
];
