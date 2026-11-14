// Checks every roadside rule: does the drawn model stay off the road, and does its collision box
// cover the solid part a car could drive into? Run: node build.mjs --test tests/footprint.test.ts tests/out/fp.mjs && node tests/out/fp.mjs
import { SCENARIOS } from '../src/track/defs';
import { buildModel } from '../src/render/models';

const CAR_H = 1.6; // only geometry below this height can hit a car
const NAMES = 'PINE FIR OAK BIRCH BUSH ROCK BOULDER GRASS FENCE CHEVRON LAMP HOUSE BARN HAYBALE CROWD POLE TOWER NEON_PYLON HOLO_ARCH MAGNET REEDS DEAD_TREE WILLOW HUT SNOW_PINE CHALET SNOWMAN CONE_STACK WORK_SIGN DIGGER CABIN LIGHT_TOWER POWER_POLE CACTUS CACTUS_ARM MESA DRYBUSH ADOBE POPLAR HEDGE REFLECTOR LAMP_DOUBLE GANTRY BILLBOARD TURBINE WINDSOCK COTTAGE LIGHTHOUSE FERN STUMP LOGPILE ARCH PITSIGN LASER_POST SPIRE PEAK CRANE WINDMILL RUIN SKILIFT PYLON CHURCH OVERPASS FIRETOWER OILPUMP MARKER_POLE BENT_OAK SNOW_ROCK BOARD MAST'.split(' ');
// whole model must stay off the road (buildings, signs); for the rest only the part at car height counts
const SOLID = new Set(['TOWER', 'HOUSE', 'BARN', 'HUT', 'CHALET', 'COTTAGE', 'CABIN', 'ADOBE', 'DIGGER', 'BILLBOARD', 'LIGHT_TOWER', 'WORK_SIGN', 'CROWD', 'FENCE', 'HEDGE', 'LOGPILE', 'OILPUMP', 'WINDSOCK', 'SNOWMAN', 'CONE_STACK']);
// soft low foliage (fronds, branches) may hang beyond the trunk's collision box
const FOLIAGE = new Set(['WILLOW', 'OAK', 'BENT_OAK', 'PINE', 'FIR', 'SNOW_PINE', 'BIRCH', 'POPLAR', 'DEAD_TREE']);
let bad = 0;
for (const sc of SCENARIOS) {
  for (const r of sc.roadside) {
    if (r.far <= 0) continue;
    let rAll = 0, rLow = 0, xLow = 0, zLow = 0, xAll = 0;
    for (let v = 0; v < 3; v++) {
      const b = buildModel(r.type, v);
      for (let i = 0; i < b.pos.length; i += 3) {
        const x = b.pos[i], y = b.pos[i + 1], z = b.pos[i + 2];
        const rad = Math.hypot(x, z);
        rAll = Math.max(rAll, rad);
        xAll = Math.max(xAll, Math.abs(x));
        if (y * r.scale[1] < CAR_H) { rLow = Math.max(rLow, rad); xLow = Math.max(xLow, Math.abs(x)); zLow = Math.max(zLow, Math.abs(z)); }
      }
    }
    const sMax = r.scale[1];
    const name = NAMES[r.type];
    const solid = (r.align ? xLow : rLow) * sMax;
    const reach = SOLID.has(name) ? (r.align ? xAll : rAll) * sMax : solid; // lateral reach that must not cross the road edge
    const clear = r.near - reach; // gap between road edge and nearest drawn part (negative = over the road)
    const coll = r.radius > 0 ? r.radius * sMax + 0.9 : 0;
    const solidS = (r.align ? zLow : rLow) * sMax;
    const collS = r.radius > 0 ? r.radius * sMax + 2.1 : 0;
    const flagClear = clear < 0;
    const flagColl = r.radius > 0 && !FOLIAGE.has(name) && (solid > coll + 0.3 || solidS > collS + 0.3);
    if (flagClear || flagColl) bad++;
    console.log(`${(flagClear || flagColl) ? '!!' : '  '} ${sc.name.padEnd(11)} ${name.padEnd(11)} near ${r.near.toFixed(1).padStart(5)} reach ${reach.toFixed(1).padStart(5)} clear ${clear.toFixed(1).padStart(6)}  solid ${solid.toFixed(1)}/${solidS.toFixed(1)} coll ${coll.toFixed(1)}/${collS.toFixed(1)}${r.align ? ' ' + r.align : ''}`);
  }
}
console.log(bad ? `${bad} rules flagged` : 'all rules clear');
