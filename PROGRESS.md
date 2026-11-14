# CRESTLINE: Maximum Drive — progress log

Playable file: `dist/crestline.html` (double-click; works from `file://`, no server, no network).
Rebuild: `npm install` once, then `npm run build`.

## Decisions (approved defaults)
- Title **CRESTLINE: Maximum Drive**; cars **Vantor Stiletto GT** (wedge supercar), **Kestrel Sprite R** (roadster), **Axiom Halo X** (concept).
- Custom WebGL2 renderer (no three.js), TypeScript, esbuild-wasm, single inlined HTML (fonts decoded from inlined data, no requests).
- Two players: top/bottom split, full width, horizontal FOV capped at ~112°; one pad + 2 players → pad goes to player 2.
- Music: four live Web Audio sequencer tracks + effects-only. Points 25-18-15-12-10-8-6-4-2-1. A full tank ≈ 15 km.

## Architecture
- `src/core` deterministic maths (`dmath.ts`: sin/cos from + − × ÷ only) and seeded sfc32 RNG.
- `src/track` codes (9 letters + 2 digits), generator, runtime sampling, 64 course codes, `hashcheck.ts`.
- `src/sim` 120 Hz car physics in road coordinates, AI (shared with the test bot), race manager, roster.
- `src/render` bent-path renderer (road ahead integrated each frame into camera-relative space, relative heading
  soft-clamped so bends sweep sideways and never fold back); HDR + MSAA + bloom + radial speed blur + ACES.
- `src/audio` synthesized engines/SFX and a small tracker with four songs.
- `src/ui` DOM menus with keyboard/gamepad/mouse focus navigation, HUD, track constructor.
- `tests/` bot races, 64-course runner, keyboard-driver test, gearbox test, fuel test, determinism hash,
  headless screenshot / flow / frame-sequence harnesses, review-pass runner.

## Milestones — all done
- [x] M1 Greybox · [x] M2 Generator, codes, constructor · [x] M3 Rivals, modes, pits, seasons
- [x] M4 13 scenarios + hazards · [x] M5 Audio, menus, title/attract, HUD · [x] M6 Two-player, rebinding, presets, F3, benchmark
- [x] M7 Review loop: 3 passes × 13 scenarios × (1920x1080 + 3440x1440) in `review/pass1..3`, notes in `review/NOTES.md`

## Test status (final)
- Determinism: 100 tracks hash identically (combined `a0d30c1d`) in Node/V8, headless Chromium 153 and SpiderMonkey 115 (gjs). Open `crestline.html?hashcheck` in any browser to compare.
- All 64 course tracks: bot beats every arcade limit (margin 4.8–25.5 %); championship (every race now with a fuel stop):
  31/32 top ten in the single-seed run, the 32nd (Storm, Hard) makes the top ten in 7 of 8 seeds (6 of 8 before fuel).
- Keyboard-tapping driver (8 Hz, 150 ms reaction) laps within 2–5 % of the analogue bot with no crashes (Mountains excepted).
- `file://` with all network blocked: menus from title to race, zero console errors, zero network requests.

## Fixes after first playtest (2026-11-05)
- Dust/spray behind a pack (Rally, Marsh, also Storm/Snow/Desert): lighter puffs, rivals throw up less,
  puffs that would cover a large part of the screen thin out, and a density budget caps the total haze ahead.
- Futuristic buildings over the road with no collision: towers were up to ~40 m wide, randomly rotated, 18 m
  from the edge, with a smaller collision box. Buildings, fences and signs now face the road; every roadside rule
  in every scenario keeps its drawn model off the road and its collision box covering its solid part
  (`tests/footprint.test.ts` checks this). Scenery now bends with the road along its length, and the far-distance
  squeeze can no longer pull a building towards the road.
- Car rears: the Stiletto and Halo had a black rear panel; now body colour with proper lamp clusters (Stiletto),
  a light blade (Halo), round red + amber lamps (Sprite), red lenses that read red when unlit, red light spilling
  onto the paint around them, and glows shaped like the lamps instead of four round blobs. Brake glow toned down.
- Re-tested: all 64 courses pass (arcade margin 4.8–25.5 %), hashes identical in V8/Chromium/SpiderMonkey,
  `file://` flow zero errors / zero requests. Before/after shots in `review/fix4/`.

## Fixes after second playtest (2026-11-05)
- "Warp speed" stars and turbines: the radial speed blur streaked the whole screen. Every opaque surface now
  writes a motion weight (falls off as 1/distance, like real forward motion) and the sky writes none, so near
  road and verges still streak while stars, turbines and distant scenery stay sharp. Stars are now small
  round twinkling dots of varied colour instead of filled square cells.
- Forest depth: a dense, purely visual woodland band (about 13–85 m beyond the road edge, ~1.7 trees per metre
  per side) generated in the renderer from the track code, kept clear of every other stretch of road; track
  data, hashes and race results are unchanged. The ground under the trees is now a dark, dappled forest floor.

## Fixes after third playtest (2026-11-06)
- Esc in fullscreen: Chrome/Edge now use Keyboard Lock, so Esc reaches the game (back / pause) and the browser
  asks you to hold Esc to leave fullscreen. Browsers without it (Firefox) still spend the first Esc on leaving
  fullscreen, but that exit is now treated as the press: it pauses a race or goes back in a menu.
- F3 monitor: refresh estimate was only updated with dynamic resolution on (stuck at 60 Hz otherwise); now always.
  Shows FPS to 0.1 with 1 % low, frame interval avg/max, CPU time per frame, GPU time per frame (timer query,
  where the browser exposes it) and headroom — the frame interval alone always equals the refresh period.
- Benchmark: live on-screen counter (elapsed / 30 s, current fps), anything left over the race is removed,
  focus loss no longer pauses it, report adds CPU and GPU time per frame.

## Fixes after fourth playtest (2026-11-06)
- Driving through Desert mesas (and other big landmarks): a landmark was placed clear of the road beside it,
  but the road could curve back through it further on (and a mesa could be wider than its placement distance).
  Each rigid landmark now checks the road ahead for several footprints either side and moves outwards until
  it clears every stretch; if it cannot fit, it is left out. Render-only, so track data is unchanged.
- Mouse cursor hides during a race after 1.2 s without mouse movement; it returns on movement and in menus/pause.

## v1.5.0 (2026-11-06)
- Version: one source (`package.json`), shown in the browser tab title, on the title screen and in benchmark reports.
  Numbering: 1.0 first complete build, +0.1 per playtest round of fixes.
- Touch controls: steering (◀ ▶) on the left, BRAKE / GAS on the right, gear ▲ ▼ above GAS with the manual gearbox,
  pause in the top-left corner. Multi-touch; thumbs can slide between steer buttons or between pedals. Shown in a race
  when touch is the input in use (from the start on phones/tablets, after the first touch on a touch-screen PC;
  keyboard or gamepad use hides them again). HUD makes room for them; portrait shows a "turn sideways" hint.
  Menus already work by tapping. Touch-first devices start on the Medium preset if nothing was saved yet.
  Tested with Chromium phone emulation (layout, multi-touch, accelerate/steer/brake/gears); not tried on a real device.

## v1.6.0 (2026-11-06)
- Menus on phones: every screen scrolls when its content does not fit (swipe to scroll; a swipe that starts on a
  button does not press it, a tap still does). Small screens get a compact layout (tighter spacing, smaller type,
  map gets a fixed height); portrait stacks the columns into one list; touch-first devices hide the
  keyboard/gamepad hint bar. Desktop layout unchanged (checked at 1920x1080: no scrolling, same sizes).
  Tested in Chromium phone emulation at 915x412 and 412x915 (swipe scroll, no accidental press, tap START).

## v1.7.0 (2026-11-06) — fuel in every Championship race
- Before: fuel only in Championship races over 15 km (12 of 64 races), rivals never pitted (they were slowed instead),
  and pit strips were drawn on every track — so the mechanic looked missing.
- Now: every Championship race uses fuel; the tank is sized per race (62–74 % of the distance) so exactly one stop is
  needed and the best-placed pit strip is always in reach. Fuel gauge always shown; grid screen states the tank range.
- Rivals really pit: one-stop strategy (pass a strip while the next is reachable, stop where one fill reaches the
  finish, fill only what is needed); each has its own stopping spot, fills in the outer half of the pit lane and
  arrives/leaves along the inner half; approach along the road edge so nobody clips the pit signs. In fuel races
  rivals run 1 % slower (the stops reshuffle a field you start at the back of).
- Arcade (no fuel): no pit signs (removed from the sim too, no invisible posts) and no pit-lane markings — the strip is
  a hard shoulder behind a solid edge line.
- Tested: all 32 Championship races — every car pits, nobody runs dry; Arcade results unchanged.

## v1.8.0 (2026-11-06) — backlit buildings
- Buildings between the camera and a low sun looked sunlit. Direct sunlight was correct (verified with a debug
  render: camera-facing faces got no sun); the brightness came from the haze — fog in-scatter used a wide glow
  around the sun, washing anything in front of it to the sky colour — plus uniform sky fill light.
- Fog sun in-scatter now concentrated close around the sun (pow 24 instead of 6); sky fill light is directional
  with a low sun (faces turned away from the sun get less, faces towards it more; flat ground unchanged);
  Motorway haze slightly thinner and its fill light lower. Checked Motorway, Marsh, Snow.

## v1.9.0 (2026-11-06) — terrain "wall" on the inside of tight bends
- Beyond the per-frame fold limit (inside of tight bends) terrain vertices were collapsed onto the limit line and
  dropped, forming a near-vertical curtain: lit like a wall, sand texture stretched into dark vertical bands, and
  flickering because the limit was sampled at positions that slid with the car.
- Now: terrain is squeezed smoothly towards the limit (no kink), only the far remainder sinks, normals ignore the
  sinking and texture/ground-type lookups use the squeezed position (the lip shades like the ground beside it);
  the limit's coarse samples sit at fixed track positions, so it no longer jitters as the car moves.

## v2.0.0 (2026-11-06) — detailed benchmark, Ultra Low and Psycho presets
- Benchmark (Settings → Benchmark) now runs on screen: 2 s warm-up, 30 s normal run, 6 s profiling, then 3 s at
  full and 3 s at half resolution with vsync bypassed. The report has:
  - average / 1 % / 0.1 % lows, p50/p95/p99 frame time, hitches, time below 60 fps, refresh, render resolution;
  - frame cost without vsync at full and half resolution, which tells GPU-fill-bound apart from geometry- or CPU-bound;
  - CPU time per frame, and draw calls, instances and vertices per frame;
  - a per-stage CPU/GPU table (sky, terrain, road, scenery, cars, particles, post, shadows, AO, MSAA resolve,
    simulation, HUD and the rest);
  - a plain-language "what limits this device" verdict;
  - the settings, the GPU name, WebGL limits, CPU threads, memory and browser;
  - fps for every second, with a chart of fps and render resolution, plus Copy report and Save report (.txt).
- GPU time per stage comes from GPU timer queries where the browser offers them. Otherwise the profiling phase makes
  the GPU finish at every stage boundary with a 1-pixel read-back (gl.finish() does not wait in Chrome). Stage times
  are then real, but that phase runs slower than normal play. Profiling is never active outside the benchmark.
- Ultra Low preset (new default on touch-first devices):
  - 75 % render scale with dynamic resolution down to 50 %, pixel ratio 1;
  - no MSAA, no bloom, draw distance ×0.36;
  - half the decorative scenery, no background woodland, 4 dynamic lights;
  - simplified sky and post-processing.
- Psycho preset (above Ultra):
  - a 4096² sun shadow map with 12-tap soft filtering: cars, trees, buildings, props and terrain cast real
    shadows, replacing blob shadows;
  - screen-space ambient occlusion and 8× MSAA;
  - draw distance ×1.45, with more woodland, particles and weather;
  - shadows are skipped at night and when the sun is very low.
- The presets are now Ultra Low, Low, Medium, High (default), Ultra and Psycho. Saved settings are migrated so a
  stored preset keeps its name.

## v2.0.1 (2026-11-07) — no more driving inside mesas and peaks; benchmark report scrolls
- Big rigid landmarks (Desert mesas up to 350 m across, Mountains peaks up to 900 m) could cover the road at the
  camera, so the player drove "inside" them (dark red ceiling over the road in Desert).
  - Cause: the vertex shader checked a landmark against the road only within about three footprints of its own
    stretch, and sampled the road as sparsely as 0.3 of its size. A mesa placed 1.1–1.9 km ahead, beside a stretch
    the bent view brought round towards the camera, was never tested against the road under the car. Psycho's longer
    view distance made this more common.
  - Fix (`src/render/landmarks.ts`): every frame the CPU places each landmark in view against the whole visible
    path, sampled every 10 m at fixed track positions plus both ends of the path. The landmark is pushed outwards
    until it clears every stretch, and left out if it cannot. The shader only reads the result, so the GPU does less
    work than before.
  - Test `tests/inside.test.ts` drives every course with landmarks in 6 m steps at Psycho view distance and checks
    the camera and the first 120 m of road against every landmark footprint. The old placement fails on 4 tracks
    (worst: 240 m inside a mesa on POLONNVHN21); the new one on none. Landmarks are never left out, and they never
    switch between shown and hidden.
  - `review/fix12/desert_mesa_before.png` / `_after.png`: the same frame on both builds.
- Benchmark screen on windows roughly 620–1100 px tall (most laptops, and full HD with browser bars): the screen
  body was squeezed to the window height and the panel's clipped corners hid the rest of the report, so there was
  nothing to scroll to. The body now grows with the report and the screen scrolls (mouse wheel, touch). Up / Down
  scroll it with keyboard or gamepad.

## v2.0.2 (2026-11-08) — no glowing columns on mountain tracks
- Glowing white columns standing in the air on Mountains (and anywhere terrain on the inside of a tight bend is
  squeezed hard). Cause: far out, the squeeze collapses neighbouring terrain points onto the same spot, so the normal
  was normalize(0) = NaN. The NaN lit a thin line along the cut end of the squeezed mountainside, and bloom and
  motion blur smeared it into a glowing column. Isolated by turning passes off one at a time: the column survives
  without particles, glows, hazards or scenery; it goes with the terrain off; with motion blur off it is a 1-pixel
  line.
- Fix: where the squeezed slope has collapsed, the terrain normal comes from the slope as it would be unsqueezed, so
  the cut end is shaded like the rock face it belongs to ("up" if even that is degenerate).
- Safety net: any NaN or infinite surface colour shows as fog colour, and the bloom's first stage drops non-finite
  pixels, so one bad pixel can never again bloom across the screen.
- `review/fix13/column_before_noblur.png` (the bright line, motion blur off) / `column_after.png`.

## v3.0.0 (2026-11-14) — branch `v3`: mountains rebuilt, woodland everywhere, far shadows, performance
Developed on the `v3` branch; `main` stays at v2.0.2.

**Mountains terrain**
- Was: the mountain side a constant 69 degree ramp that never stopped (about 1,500 m up at the mesh edge), the
  valley side an endless drop, and the two swapping sides from one road sample to the next every 1.2-3 km, which
  left a sheer sheet across the view (the "holes").
- Now: a cut rock face at the road, a concave slope easing up to a ridge 170-430 m above (height varies along the
  road), and on the other side a steep drop below the guard rail easing into a valley whose far side rises again.
  The side changes over smoothly across about 200 m (`Track.tilt`). Meadow low down, rock on steep ground and
  higher up, snow above the snow line. The peak landmark is a faceted, snow-capped mountain instead of a cone.
- Peak landmarks are backdrop mountains at fixed compass bearings, 2.3-3 km away, turned against the car's true
  heading each frame the way the sky is (`Scenery.placeSky`). They used to be placed sideways off the road, and
  in the bent view a sideways offset of more than a few hundred metres means nothing: inside a bend the peak
  swung back beside the near road (a flat slab, blue when in shade) or hung in the air with its underside
  showing. Moving them further out sideways (first attempt) could not fix that. The model is now about 2,000
  triangles with ridges, gullies, shoulders and a ragged snow line, and has rock and snow texture in its own
  coordinates.
- Inside bends, where the bent view folds, the ground now tapers back to road level before the fold limit
  (`foldTaper`), so the inside of a bend is a rounded spur. The old squeezed strip ended in a vertical curtain
  with smeared texture and nothing behind it. This applies to every scenario.
- "Texture flowing down": rock banding and rock noise were keyed on height relative to the car, so they slid up
  and down the walls as the road climbed. They now use true altitude, and steep faces are textured by
  (distance along road, altitude) instead of the flat mapping that stretched into vertical streaks.

**Woodland beyond the roadside** (`woodland()` in scenery.ts, `tests/woods.test.ts`)
- Every scenario with trees now has woods further out: Rally, Night, Marsh, Mountains, Snow, Storm, Fog, and a
  deeper Forest (150 m instead of 85 m). Open scenarios get separate woods and copses from a ground-fixed noise
  field; Forest stays solid.
- Trees stand only where it makes sense: clear of every other stretch of road, not on rock faces or steep
  ground, not in water (Marsh), and on Mountains below the tree line. The test checks every tree on one track per
  scenario.
- Visual only (no collisions, track codes unchanged), built from the track code so it is the same every time.

**Lighting and shadows (Psycho)**
- "Bright in the distance, shaded when closer": the sun shadow map covered a 230 m box at the camera, so a
  mountain's shadow on the road did not exist until the road came inside it. A second, far cascade (2048 texels
  over 2.4 km, terrain and landmarks) now shades distant ground, blended into the detailed map at its edge.
- Not fixed, and inherent to the bent view: far geometry moves a little relative to the sun as a bend sweeps
  round, so a distant shadow can still drift slightly. It no longer pops.

**Performance**
- Scenery vertices no longer evaluate terrain noise: each object's ground height is worked out once on the CPU
  (`src/render/terrain.ts`, a mirror of the GLSL `terrainH`) and stored per instance.
- Level of detail: trees, bushes, hedges and rocks beyond a per-preset distance use the same model with fewer
  triangles (blobs as plain icosahedra), trees further still a simple distance tree; woodland always uses the
  distance trees; cars some way off use a model with half the ring resolution.
- Vertices per frame (index count, `tests/vertcost.mjs`), v2.0.2 -> v3.0.0, with the new woodland included:
  Forest High 6.66 M -> 1.16 M, Forest Low 2.85 M -> 0.43 M, Mountains Low 0.54 M -> 0.33 M,
  Rally Low 0.46 M -> 0.28 M; Mountains and Rally High about level (0.7 M, 0.6 M) despite thousands more trees.
- Light presets (Ultra Low, Low): terrain mesh with about 40 % of the vertices; Low now uses the simplified sky
  and post-processing, 6 lamps and pixel ratio 1.25, and starts at 80 % render scale instead of 60 %.
- Dynamic resolution rewritten (game.ts): it used to act only below 80 % of the refresh rate (48 fps on a 60 Hz
  screen) and took a slow device's own frame time for the screen's refresh rate, so it never lowered the
  resolution on the devices that needed it most. It now remembers the best frame interval the device has
  sustained, lowers resolution as soon as frames drop (in proportion), and raises it again only by cautious
  probes that back off. Ultra Low and Low aim for 60 fps even on a 120 Hz screen.

**Later v3 fixes (2026-11-14)**
- Car selection could not be used by touch: the arrows ignored taps and the colours were not clickable (only the
  mouse wheel and keys changed anything). Arrows and swatches are tappable, a swipe changes car, there is a Back
  button, and the screen fits a phone. `tests/cartouch.mjs` taps through it on a 780x360 touch screen.
- Start-up: shaders were compiled and checked one at a time (each check makes the browser wait for that shader).
  They are now all started first and checked on first use, so the browser compiles them in parallel. The terrain
  vertex shader calls the terrain function from one place in a loop instead of six. Start-up time is shown in the
  benchmark report. Not measured on Windows, where the Direct3D shader compiler is the slow part.
- Phones: the canvas no longer asks for low-latency ('desynchronized') presentation on touch devices; that mode
  can show a frame that is still being drawn. This is the likely cause of the brief garbage seen in Brave on
  Android, but it is not confirmed.
- CPU per frame: three WebGL state queries per view in the Psycho shadow pass and one per frame for MSAA made the
  page wait for the GPU process; they are gone. The bent path reads track arrays directly (0.50 -> 0.34 ms).

**v3.0.1 / v3.0.2 (2026-11-14)**
- The title screen and the F3 monitor show the build date and time, so a build can be told from the last one.
- Backdrop peaks, circuits: the peak inherited the "bend along the road" switch from whichever object type was
  drawn before it, which on circuit tracks wrapped the 1 km mountain along the road around the camera (the sky
  became the inside of a mountain). Every switch is now set explicitly for peaks. The stage tracks tested before
  happened to draw a non-bending type first.
- Ground moving beside the car in bends (dunes on Desert): the fold limit that shapes the ground inside bends was
  recomputed from the bent view each frame and shifted as the car moved. It is now capped by a limit computed
  once from the track's true geometry (`Track.fold`). `tests/extstable.test.ts`: average change per 4 m driven,
  Desert 0.027 -> 0.000 m, Rally 1.6 -> 0.009 m, Mountains 3.1 -> 0.08 m (rare larger steps remain on Mountains).
- Street lamps: arms had a random turn while their light and glow were placed over the road, so glows floated
  away from the lamp heads. Arms now reach over the road and the light and glow sit at the head. Every lamp in
  view glows (to 1.4 km), not only the nearest 16 that light the ground.
- Headlights: the beam met the road at a grazing angle and plain Lambert shading left it nearly black; a 3-9 m
  dead zone in front of the lamps left the car just ahead unlit. Softer ground cosine, longer reach, wider cone,
  no dead zone beyond 2.5 m, intensity retuned.

**v3.0.3 (2026-11-14)**
- "Holes" in the mountains with the backdrop showing behind: the land stopped dead at the end of the draw
  distance, and from a bend the cut end of a hillside showed in cross-section. Terrain heights (and the objects
  standing on them) now ease down to road level over the last third of the draw distance (`farTaper`).
- Backdrop peaks: smooth normals with a relief bump instead of flat facets, stronger rock texture with strata and
  gully streaks, and snow decided per pixel (ragged line, lower in gullies) instead of per facet.
- Street lamps beyond the nearest point lights paint a pool of light on the road under them.

## Known issues / not verified
- v3 frame rates are not measured on real hardware (no GPU here). What is measured: vertex counts, and that
  every stage runs on a software GPU. Whether Low holds 60 fps on a given slow device needs a benchmark run there.
- v3: beyond the level-of-detail distance a tree swaps to its lighter model; the shapes match, but the swap to
  the simple distance tree further out (2.2x that distance) can be noticed if you look for it.
- v3: the shape of the ground inside a bend changes a little as you drive through it (the fold limit moves).
- Not measured: whether Ultra Low reaches ~60 fps on a mid-range phone, or what Psycho costs on the target PC.
  Only relative costs on a software GPU are known, per frame on an emulated phone: Ultra Low 1.4 s, Low 2.0 s,
  High 11.4 s, Psycho 45 s.
- Generated-track bot test (`npm run test:sim`): on Roadworks d1 the bot finishes the championship race 17th (it
  needs the top ten). v1.6.0 and v1.9.0 give the same result, so this predates the release; the 64 course tracks
  are unaffected.
- Frame rate not measured on the target PC (headless uses a software GPU). Use F3 and Settings → Benchmark.
- Firefox browser itself not run (only its JS engine); audio not listened to; gamepads not physically tested.
