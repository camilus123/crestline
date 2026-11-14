// Shared track/scenario definitions used by the generator, simulation and renderer.

export const DELTA = 2; // metres between track samples

export const enum Scn {
  RALLY = 0,
  FUTURE = 1,
  NIGHT = 2,
  MARSH = 3,
  MOUNTAINS = 4,
  SNOW = 5,
  ROADWORKS = 6,
  STORM = 7,
  DESERT = 8,
  FOG = 9,
  MOTORWAY = 10,
  WIND = 11,
  FOREST = 12,
}
export const SCENARIO_COUNT = 13;
export const SCENARIO_NAMES = [
  'Rally', 'Futuristic', 'Night', 'Marsh', 'Mountains', 'Snow', 'Roadworks',
  'Storm', 'Desert', 'Fog', 'Motorway', 'Wind', 'Forest',
];

export const enum Surf {
  ASPHALT = 0,
  DIRT = 1,
  SNOW = 2,
  CITY = 3,
}

/** Per-sample flag bits */
export const F_RUMBLE_L = 1;
export const F_RUMBLE_R = 2;
export const F_PIT = 4;
export const F_WALL_L = 8;
export const F_WALL_R = 16;
export const F_CLIFF_L = 32;
export const F_CLIFF_R = 64;
export const F_PROTECT = 128;

export const enum Hz {
  PUDDLE = 1,
  MUD = 2,
  OIL = 3,
  FLOOD = 4,
  POTHOLE = 5,
  CONE = 6,
  BARRIER = 7,
  ROCK = 8,
  FALLEN_TREE = 9,
  LOG = 10,
  LASER = 11,
  MAGNET = 12,
  GUST = 13,
  DRIFT = 14,
  ICE = 15,
  STREAM = 16,
  SNOWBANK = 17,
}
export const HAZARD_BLOCKING = new Set<number>([Hz.BARRIER, Hz.ROCK, Hz.FALLEN_TREE]);

/** Roadside object types. Each one maps to a procedural model in the renderer. */
export const enum O {
  PINE, FIR, OAK, BIRCH, BUSH, ROCK, BOULDER, GRASS, FENCE, CHEVRON,
  LAMP, HOUSE, BARN, HAYBALE, CROWD, POLE, TOWER, NEON_PYLON, HOLO_ARCH, MAGNET,
  REEDS, DEAD_TREE, WILLOW, HUT, SNOW_PINE, CHALET, SNOWMAN, CONE_STACK, WORK_SIGN, DIGGER,
  CABIN, LIGHT_TOWER, POWER_POLE, CACTUS, CACTUS_ARM, MESA, DRYBUSH, ADOBE, POPLAR, HEDGE,
  REFLECTOR, LAMP_DOUBLE, GANTRY, BILLBOARD, TURBINE, WINDSOCK, COTTAGE, LIGHTHOUSE, FERN, STUMP,
  LOGPILE, ARCH, PITSIGN, LASER_POST, SPIRE, PEAK, CRANE, WINDMILL, RUIN, SKILIFT,
  PYLON, CHURCH, OVERPASS, FIRETOWER, OILPUMP, MARKER_POLE, BENT_OAK, SNOW_ROCK, BOARD, MAST, COUNT,
}

export interface RoadsideRule {
  type: O;
  weight: number;
  near: number; // metres beyond road edge
  far: number;
  side?: -1 | 0 | 1; // 0 or undefined = both
  radius: number; // collision radius (0 = no collision)
  scale: [number, number];
  cluster?: number; // max cluster size at high scatter
  row?: boolean; // good for tidy rows
  align?: 'grid' | 'face'; // grid: rotation snapped to the road axes; face: always faces the road
}

export interface HazardRule {
  kind: Hz;
  weight: number;
}

export interface ScenarioDef {
  id: number;
  name: string;
  halfWidth: number;
  surface: Surf;
  grip: number; // base tyre grip multiplier
  response: number; // lateral response multiplier (loose surfaces slide more)
  offroadDrag: number; // multiplier on off-road deceleration
  visibility: number; // view distance in metres
  rumble: boolean;
  hillsScale: number;
  curveScale: number;
  densityMul: number;
  hazardRate: number; // hazards per km at Obstacles 100%
  hazards: HazardRule[];
  roadside: RoadsideRule[];
  landmarks: { type: O; every: number; dist: [number, number]; scale: [number, number] }[];
  walls: 'none' | 'mountain' | 'motorway';
  rivalPace: number; // multiplier for rival speed (Night/Fog hamper rivals)
  pitSigns: boolean;
}

const S = (o: Partial<ScenarioDef> & Pick<ScenarioDef, 'id' | 'name' | 'roadside' | 'hazards' | 'landmarks'>): ScenarioDef => ({
  halfWidth: 6,
  surface: Surf.ASPHALT,
  grip: 1,
  response: 1,
  offroadDrag: 1,
  visibility: 1700,
  rumble: true,
  hillsScale: 1,
  curveScale: 1,
  densityMul: 1,
  hazardRate: 4,
  walls: 'none',
  rivalPace: 1,
  pitSigns: true,
  ...o,
});

export const SCENARIOS: ScenarioDef[] = [
  S({
    id: Scn.RALLY, name: 'Rally', surface: Surf.DIRT, grip: 0.78, response: 0.72, halfWidth: 5.4, rumble: false,
    hazardRate: 9, hazards: [{ kind: Hz.MUD, weight: 4 }, { kind: Hz.PUDDLE, weight: 5 }],
    roadside: [
      { type: O.PINE, weight: 5, near: 4, far: 40, radius: 0.8, scale: [0.8, 1.5], cluster: 5, row: true },
      { type: O.BIRCH, weight: 2, near: 3, far: 30, radius: 0.5, scale: [0.8, 1.3], cluster: 3 },
      { type: O.ROCK, weight: 2, near: 2.6, far: 25, radius: 0.9, scale: [0.6, 1.6], cluster: 3 },
      { type: O.HAYBALE, weight: 1.5, near: 1.2, far: 6, radius: 0.9, scale: [0.9, 1.1], row: true },
      { type: O.CROWD, weight: 1.2, near: 3, far: 8, radius: 0, scale: [0.9, 1.1], row: true, align: 'face' },
      { type: O.FENCE, weight: 1.5, near: 2, far: 4, radius: 0.3, scale: [1, 1], row: true, align: 'face' },
      { type: O.GRASS, weight: 5, near: 1.4, far: 14, radius: 0, scale: [0.6, 1.4], cluster: 4 },
    ],
    landmarks: [{ type: O.WINDMILL, every: 1800, dist: [90, 320], scale: [1, 1.4] }],
  }),
  S({
    id: Scn.FUTURE, name: 'Futuristic', surface: Surf.CITY, grip: 1.05, response: 1.1, halfWidth: 6.4,
    hazardRate: 4, hazards: [{ kind: Hz.MAGNET, weight: 5 }, { kind: Hz.LASER, weight: 2.6 }],
    roadside: [
      { type: O.TOWER, weight: 6, near: 18, far: 90, radius: 7.4, scale: [0.7, 1.6], cluster: 3, row: true, align: 'face' },
      { type: O.NEON_PYLON, weight: 3, near: 1.5, far: 2.5, radius: 0.4, scale: [1, 1], row: true },
      { type: O.BILLBOARD, weight: 1, near: 6, far: 16, radius: 1.5, scale: [1, 1.5], align: 'face' },
      { type: O.HOLO_ARCH, weight: 0.4, near: 0, far: 0, radius: 0, scale: [1, 1] },
    ],
    landmarks: [{ type: O.SPIRE, every: 1500, dist: [160, 520], scale: [1, 1.8] }],
  }),
  S({
    id: Scn.NIGHT, name: 'Night', visibility: 900, hazardRate: 2, rivalPace: 0.94,
    hazards: [{ kind: Hz.OIL, weight: 2 }, { kind: Hz.PUDDLE, weight: 2 }],
    roadside: [
      { type: O.OAK, weight: 4, near: 4, far: 40, radius: 0.9, scale: [0.8, 1.4], cluster: 4, row: true },
      { type: O.HOUSE, weight: 1.5, near: 10, far: 40, radius: 5, scale: [0.9, 1.3], align: 'face' },
      { type: O.LAMP, weight: 2.5, near: 1.5, far: 2.5, radius: 0.3, scale: [1, 1], row: true },
      { type: O.REFLECTOR, weight: 3, near: 0.8, far: 1.2, radius: 0, scale: [1, 1], row: true },
      { type: O.BUSH, weight: 3, near: 3, far: 25, radius: 0, scale: [0.7, 1.4], cluster: 4 },
      { type: O.POLE, weight: 1, near: 5, far: 7, radius: 0.3, scale: [1, 1.1], row: true },
    ],
    landmarks: [{ type: O.MAST, every: 1700, dist: [90, 380], scale: [1, 1.4] }],
  }),
  S({
    id: Scn.MARSH, name: 'Marsh', grip: 0.92, halfWidth: 5.6, rumble: false, hillsScale: 0.35,
    hazardRate: 8, hazards: [{ kind: Hz.OIL, weight: 2 }, { kind: Hz.MUD, weight: 4 }, { kind: Hz.FLOOD, weight: 3 }],
    roadside: [
      { type: O.REEDS, weight: 7, near: 2.1, far: 30, radius: 0, scale: [0.7, 1.4], cluster: 6 },
      { type: O.DEAD_TREE, weight: 2, near: 4, far: 50, radius: 0.6, scale: [0.8, 1.6], cluster: 2 },
      { type: O.WILLOW, weight: 2.5, near: 5, far: 45, radius: 1, scale: [0.8, 1.4], cluster: 3, row: true },
      { type: O.HUT, weight: 0.5, near: 14, far: 40, radius: 4, scale: [0.9, 1.2], align: 'face' },
      { type: O.BUSH, weight: 2, near: 2.6, far: 30, radius: 0, scale: [0.6, 1.2], cluster: 3 },
    ],
    landmarks: [{ type: O.RUIN, every: 2400, dist: [90, 300], scale: [1, 1.3] }],
  }),
  S({
    id: Scn.MOUNTAINS, name: 'Mountains', halfWidth: 4.7, hillsScale: 1.6, curveScale: 1.25, walls: 'mountain',
    hazardRate: 1.6, hazards: [{ kind: Hz.ROCK, weight: 2 }, { kind: Hz.POTHOLE, weight: 1.5 }], pitSigns: false,
    roadside: [
      { type: O.PINE, weight: 3, near: 6, far: 40, radius: 0.8, scale: [0.7, 1.4], cluster: 4 },
      { type: O.ROCK, weight: 2, near: 3.4, far: 30, radius: 0, scale: [0.8, 2.2], cluster: 3 },
      { type: O.CHEVRON, weight: 0.5, near: 0.9, far: 1.2, radius: 0, scale: [1, 1] },
    ],
    landmarks: [{ type: O.PEAK, every: 900, dist: [500, 1200], scale: [1, 2.2] }],
  }),
  S({
    id: Scn.SNOW, name: 'Snow', surface: Surf.SNOW, grip: 0.62, response: 0.55, visibility: 650, halfWidth: 5.6, rumble: false,
    hazardRate: 5, hazards: [{ kind: Hz.ICE, weight: 4 }, { kind: Hz.SNOWBANK, weight: 3 }],
    roadside: [
      { type: O.SNOW_PINE, weight: 7, near: 3, far: 45, radius: 0.8, scale: [0.7, 1.6], cluster: 6, row: true },
      { type: O.CHALET, weight: 0.8, near: 12, far: 40, radius: 5, scale: [0.9, 1.3], align: 'face' },
      { type: O.SNOW_ROCK, weight: 1.5, near: 2.6, far: 30, radius: 0.9, scale: [0.6, 1.6], cluster: 2 },
      { type: O.MARKER_POLE, weight: 2.5, near: 0.8, far: 1.3, radius: 0, scale: [1, 1], row: true },
      { type: O.SNOWMAN, weight: 0.2, near: 4, far: 12, radius: 0.6, scale: [0.9, 1.2] },
    ],
    landmarks: [{ type: O.SKILIFT, every: 1600, dist: [70, 260], scale: [1, 1.3] }],
  }),
  S({
    id: Scn.ROADWORKS, name: 'Roadworks', halfWidth: 3.9, hazardRate: 9, rivalPace: 0.94, densityMul: 1.4,
    hazards: [{ kind: Hz.CONE, weight: 4 }, { kind: Hz.BARRIER, weight: 3 }, { kind: Hz.POTHOLE, weight: 4 }],
    roadside: [
      { type: O.CONE_STACK, weight: 1.5, near: 0.9, far: 3, radius: 0.4, scale: [0.9, 1.1] },
      { type: O.WORK_SIGN, weight: 2, near: 1, far: 3, radius: 0.4, scale: [1, 1.2], row: true, align: 'face' },
      { type: O.DIGGER, weight: 0.8, near: 6, far: 20, radius: 3.6, scale: [0.9, 1.1], align: 'face' },
      { type: O.CABIN, weight: 0.8, near: 6, far: 22, radius: 3, scale: [1, 1.2], row: true, align: 'face' },
      { type: O.LIGHT_TOWER, weight: 1, near: 2.5, far: 6, radius: 0.6, scale: [1, 1.1], row: true, align: 'face' },
      { type: O.FENCE, weight: 2.5, near: 2, far: 3, radius: 0.3, scale: [1, 1], row: true, align: 'face' },
      { type: O.BUSH, weight: 2, near: 5, far: 30, radius: 0, scale: [0.6, 1.2], cluster: 3 },
    ],
    landmarks: [{ type: O.CRANE, every: 600, dist: [40, 220], scale: [1, 1.4] }],
  }),
  S({
    id: Scn.STORM, name: 'Storm', grip: 0.82, response: 0.85, visibility: 1100, hazardRate: 9,
    hazards: [{ kind: Hz.PUDDLE, weight: 5 }, { kind: Hz.POTHOLE, weight: 4 }, { kind: Hz.MUD, weight: 1 }],
    roadside: [
      { type: O.BENT_OAK, weight: 4, near: 4, far: 40, radius: 0.9, scale: [0.8, 1.4], cluster: 3 },
      { type: O.POWER_POLE, weight: 2, near: 4, far: 5, radius: 0.3, scale: [1, 1], row: true },
      { type: O.BARN, weight: 0.8, near: 14, far: 45, radius: 6, scale: [0.9, 1.2], align: 'face' },
      { type: O.BUSH, weight: 3, near: 3, far: 30, radius: 0, scale: [0.7, 1.4], cluster: 4 },
      { type: O.FENCE, weight: 2, near: 2, far: 3, radius: 0.3, scale: [1, 1], row: true, align: 'face' },
      { type: O.GRASS, weight: 4, near: 1.3, far: 12, radius: 0, scale: [0.6, 1.3], cluster: 4 },
    ],
    landmarks: [{ type: O.PYLON, every: 1300, dist: [80, 320], scale: [1, 1.3] }],
  }),
  S({
    id: Scn.DESERT, name: 'Desert', grip: 0.95, halfWidth: 6, hillsScale: 0.8, rumble: false, hazardRate: 6,
    hazards: [{ kind: Hz.DRIFT, weight: 5 }, { kind: Hz.OIL, weight: 1 }],
    roadside: [
      { type: O.CACTUS, weight: 3, near: 3, far: 40, radius: 0.5, scale: [0.7, 1.6], cluster: 3, row: true },
      { type: O.CACTUS_ARM, weight: 2.5, near: 4, far: 45, radius: 0.6, scale: [0.7, 1.5], cluster: 2 },
      { type: O.DRYBUSH, weight: 4, near: 1.4, far: 35, radius: 0, scale: [0.6, 1.3], cluster: 4 },
      { type: O.ROCK, weight: 2, near: 3.7, far: 40, radius: 1, scale: [0.7, 2.4], cluster: 3 },
      { type: O.ADOBE, weight: 0.5, near: 14, far: 40, radius: 4, scale: [0.9, 1.3], align: 'face' },
      { type: O.OILPUMP, weight: 0.4, near: 16, far: 50, radius: 3, scale: [0.9, 1.2] },
    ],
    landmarks: [{ type: O.MESA, every: 900, dist: [300, 900], scale: [1, 2.5] }],
  }),
  S({
    id: Scn.FOG, name: 'Fog', visibility: 210, hazardRate: 2, rivalPace: 0.95,
    hazards: [{ kind: Hz.PUDDLE, weight: 2 }, { kind: Hz.OIL, weight: 1 }],
    roadside: [
      { type: O.POPLAR, weight: 4, near: 3, far: 8, radius: 0.6, scale: [0.9, 1.3], row: true },
      { type: O.HEDGE, weight: 3, near: 1.8, far: 3, radius: 0, scale: [1, 1.3], row: true, align: 'face' },
      { type: O.REFLECTOR, weight: 3, near: 0.8, far: 1.2, radius: 0, scale: [1, 1], row: true },
      { type: O.FENCE, weight: 2, near: 4, far: 6, radius: 0.3, scale: [1, 1], row: true, align: 'face' },
      { type: O.HOUSE, weight: 0.6, near: 12, far: 30, radius: 5, scale: [0.9, 1.2], align: 'face' },
      { type: O.OAK, weight: 1.5, near: 8, far: 40, radius: 0.9, scale: [0.8, 1.4], cluster: 3 },
    ],
    landmarks: [{ type: O.CHURCH, every: 2600, dist: [60, 160], scale: [1, 1.2] }],
  }),
  S({
    id: Scn.MOTORWAY, name: 'Motorway', halfWidth: 7.6, curveScale: 0.55, hillsScale: 0.6, walls: 'motorway', hazardRate: 0,
    hazards: [],
    roadside: [
      { type: O.LAMP_DOUBLE, weight: 3, near: 3.6, far: 3.6, radius: 0, scale: [1, 1], row: true },
      { type: O.BILLBOARD, weight: 1, near: 14, far: 30, radius: 0, scale: [1, 1.4], align: 'face' },
      { type: O.BUSH, weight: 3, near: 6, far: 40, radius: 0, scale: [0.7, 1.4], cluster: 4 },
      { type: O.TOWER, weight: 0.8, near: 60, far: 160, radius: 0, scale: [0.6, 1.4], cluster: 3 },
      { type: O.GANTRY, weight: 0.25, near: 0, far: 0, radius: 0, scale: [1, 1] },
    ],
    landmarks: [{ type: O.OVERPASS, every: 2600, dist: [0, 0], scale: [1, 1] }],
  }),
  S({
    id: Scn.WIND, name: 'Wind', hillsScale: 0.9, hazardRate: 3, hazards: [{ kind: Hz.GUST, weight: 1 }],
    roadside: [
      { type: O.GRASS, weight: 8, near: 1.6, far: 25, radius: 0, scale: [0.8, 1.6], cluster: 6 },
      { type: O.WINDSOCK, weight: 0.8, near: 2, far: 4, radius: 0.3, scale: [1, 1] },
      { type: O.FENCE, weight: 2, near: 3, far: 5, radius: 0.3, scale: [1, 1], row: true, align: 'face' },
      { type: O.COTTAGE, weight: 0.6, near: 12, far: 40, radius: 5, scale: [0.9, 1.2], align: 'face' },
      { type: O.BUSH, weight: 2.5, near: 2.6, far: 35, radius: 0, scale: [0.6, 1.2], cluster: 3 },
      { type: O.ROCK, weight: 1.2, near: 3, far: 30, radius: 0.9, scale: [0.6, 1.5], cluster: 2 },
    ],
    landmarks: [
      { type: O.TURBINE, every: 260, dist: [45, 380], scale: [0.9, 1.3] },
      { type: O.LIGHTHOUSE, every: 4000, dist: [160, 300], scale: [1, 1.2] },
    ],
  }),
  S({
    id: Scn.FOREST, name: 'Forest', grip: 0.95, halfWidth: 5.4, densityMul: 1.8, hazardRate: 7,
    hazards: [{ kind: Hz.STREAM, weight: 2 }, { kind: Hz.FALLEN_TREE, weight: 3 }, { kind: Hz.LOG, weight: 4 }, { kind: Hz.PUDDLE, weight: 2 }],
    roadside: [
      { type: O.OAK, weight: 4, near: 3, far: 40, radius: 0.9, scale: [0.8, 1.6], cluster: 5, row: true },
      { type: O.FIR, weight: 5, near: 3, far: 45, radius: 0.8, scale: [0.8, 1.7], cluster: 6, row: true },
      { type: O.BIRCH, weight: 2, near: 2.5, far: 30, radius: 0.5, scale: [0.8, 1.3], cluster: 4 },
      { type: O.FERN, weight: 5, near: 1.9, far: 20, radius: 0, scale: [0.6, 1.4], cluster: 6 },
      { type: O.STUMP, weight: 1, near: 1.5, far: 15, radius: 0.5, scale: [0.8, 1.3] },
      { type: O.LOGPILE, weight: 0.5, near: 3, far: 10, radius: 1.5, scale: [0.9, 1.1], align: 'face' },
    ],
    landmarks: [{ type: O.FIRETOWER, every: 2600, dist: [40, 120], scale: [1, 1.2] }],
  }),
];
