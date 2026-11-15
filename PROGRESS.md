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

**v3.0.4 (2026-11-14)**
- v3.0.2's ground-fixed fold limit (`Track.fold`) compared every stretch of road with every other on the track's
  map. The map is not a real place: circuits do not close (1.6 km gap on KJGJHHMLH04) and distant stretches cross
  on it, so the limit collapsed to 6 m on straights and the ground ended a few metres from the road with nothing
  beyond. It now only considers road within 500 m along the track and never across a circuit's seam.
- That also means the Desert figure quoted for v3.0.2 was an artefact: `tests/groundstill.test.ts` shows the ground
  within 160 m of the road beside the car was already stable on Desert (0.2 m worst shift). Dunes that seem to
  move in bends are not explained yet.

**v3.1.0 (2026-11-15)**
- Benchmark is a fixed suite, the same on every run: Forest, Mountains, Night and Futuristic, each at Low, High
  and Psycho (stock options) and at the player's own settings if those differ; one player, bot driving, the same
  car, resolution fixed at the preset's scale. Per case: 5 s of normal frames, then true frame cost with the GPU
  finished every frame, then cost per render stage. The report has a summary table, averages against the
  refresh-rate budget, a stage table per track, the options of each preset, and one line of JSON with every number.
- Graphics options (Settings -> Graphics options): every option a preset sets can be changed on its own
  (resolution, pixel-ratio limit, MSAA, sun shadows, ambient occlusion, bloom, sky/screen effects, draw distance,
  clutter, woodland, detail distance, terrain mesh, lamp lights, particles, weather, dynamic-resolution floor and
  target). Changed options are marked; picking a preset resets them. `tests/gfxopts.mjs`.

## v3.2.0 (2026-11-15) — benchmark fixes, sky drawn last
Steps 1 and 2 of the "Next work" list below.
- Sky is drawn after everything solid, at the far plane with the depth test on, so its clouds are only computed
  where nothing else is. `tests/samepic.mjs` renders the same frame with the old and new build: 0 pixels differ on
  Mountains, Night (High) and Forest (Low). On the software GPU the sky stage fell 53 % on a Forest frame and 3 %
  on a Mountains frame with a lot of sky in view; the gain on real hardware is not measured.
- Benchmark:
  - stage times come from GPU timer queries during the normal 5 s run where the browser has them, and the slow
    stage-by-stage phase is skipped;
  - without timers, the cost of the read-back that makes the GPU finish is measured at the start, taken off the
    frame cost and stage times, and printed in the report;
  - warm-up lasts until 20 consecutive frames are steady (up to 8 s), so track loading stays out of the result;
  - the cost and stage phases are 1 s each (were 1.5 s), and the bar says the picture slowing down is normal.

**Measured 2026-11-15 with the v3.2.0 benchmark**
- Target PC (RX 9070, 3440x1440, 240 Hz), Firefox: Low 239.8, High 239.0 (was 229.2), Psycho 195.1 fps (was 162.5).
  Sky stage on High fell from 2.1-3.2 ms to 0.1-1.0 ms. Cost and fps now agree (Forest High 4.20 ms, 239.8 fps).
- Same PC, Edge (GPU timers available): same averages (239.8 / 239.8 / 195.0); start-up 6.5 s against 9.3 s in
  Firefox; Psycho 1% lows worse (60-130 against 120). Real stage times: terrain 0.9-1.3 ms on High and Psycho,
  sun shadows 1.60 ms on Futuristic but 0.27-0.39 ms on Forest and Mountains, Night sky 0.9-1.1 ms, ambient
  occlusion 0.4-0.5 ms, MSAA resolve 0.3-0.4 ms on Psycho.
- **Unaccounted on Psycho:** stage times sum to 1.1-2.2 ms less than the frame cost (0.5-0.9 ms on High).
  Suspects: filling and presenting an 8x MSAA target, the browser's compositing. Find this before the terrain work.
- Laptop (Core 5 120U, integrated Intel graphics, 1920x1080, 60 Hz), Firefox: Low 53-60 fps at a fixed 1536x864
  (Forest 59.8, Mountains 59.6, Night 57.4, Futuristic 53.2), High 32-46, Psycho 12-23. Terrain is the largest
  GPU stage on Low on three tracks (about 3 ms), then road and post. The cost column is wrong on this machine
  (says 42 fps max while 57-60 was measured). Ultra Low was not in the run.

**Added to the next-work list, 2026-11-15**
- Simulation CPU cost on slow machines: 1.8-3.5 ms per frame on the laptop on Low (0.05-0.2 ms on the target
  PC), and more as the frame rate falls because several steps run per frame to catch up.
- Start-up time on Windows: 17.6 s on the laptop, 9.3 s (Firefox) and 6.5 s (Edge) on the target PC, 1.7 s on
  the phone. Shader compilation through Direct3D is the suspect.

## v3.3.0 (2026-11-15) — whole-frame GPU timer in the benchmark, terrain shaded only where seen
- **Benchmark diagnostic for the time no stage accounts for.** With GPU timers, every second frame of the 5 s run
  is now timed with a single query around the whole frame (queries cannot overlap, so the stages are timed on the
  other frames). Each track's stage table ends with four lines: GPU stages only, whole frame from one timer, CPU
  time in the frame, frame cost. Whole frame minus stages = GPU work between the stages; frame cost minus whole
  frame = outside the game's drawing (presenting, compositing, the read-back). The JSON has `wholeGpu` per case.
  Not yet run on real hardware: needs one Edge run on the target PC.
- **Terrain finding (corrects item 4 of the next-work list).** The terrain mesh is 19,600 vertices (9,800 light),
  so on a real GPU the terrain stage is pixel work, not the per-vertex height noise. Baking the noise into a
  texture would not have helped the PC or the laptop; that item is dropped.
- **Terrain is drawn after the scenery** (order now: road, scenery, terrain, water and rails, ground patches and
  blob shadows, props, cars, sky). Ground pixels behind trees and buildings are no longer shaded. On the
  software GPU the terrain stage fell 18 % on a Forest frame at High (994 -> 818 ms); real hardware not measured.
  Picture: 0 pixels differ on Mountains and Night (High). On Forest and Futuristic the lowest pixel row of a tree
  trunk or building that stands in its own blob shadow is now darkened with the ground (0.2-2 % of pixels at
  480x270, mostly by under 8/255), because the blob shadows are drawn after the scenery. Not on Psycho (no blob
  shadows there). Tried and rejected: cars before the terrain as well (blob shadows crept up the wheels), and
  pushing the ground back in depth instead of pulling the shadows forward (bright lines across the road on
  Futuristic).
- The three texture lookups for the rock colour are skipped on pixels without rock (0 pixels differ).

## v3.3.1 (2026-11-15) — far backdrop drawn after the terrain
**Measured with v3.3.0 on the target PC (Edge, GPU timers), against v3.2.0 in the same browser**
- Averages: Low 239.8, High 239.8, Psycho 207.0 fps (was 195.0). Frame cost Low 2.26 -> 2.11, High 3.85 -> 3.50,
  Psycho 6.50 -> 6.01 ms. Start-up 5.6 s.
- Terrain stage on High: Forest 1.29 -> 0.27, Night 0.69 -> 0.37, Futuristic 0.91 -> 0.21 ms. Larger than hidden
  ground alone explains; whatever is drawn first into the frame seems to carry an extra cost (road rose by about
  0.1 ms). Forest High frame cost 4.20 -> 3.01 ms, Futuristic Psycho 133 -> 187.5 fps.
- **Regression on Mountains in v3.3.0:** scenery stage 0.09 / 0.16 / 0.24 ms (Low / High / Psycho) became
  1.03 / 1.59 / 1.42 ms, more than the terrain saved (0.58 / 0.93 / 1.04 -> 0.27 / 0.47 / 0.51). Frame cost on
  High 3.16 -> 4.32 ms, Psycho 219 -> 197 fps. Cause: the backdrop peaks were shaded in full before the terrain
  that hides most of them was drawn.
- **Whole-frame timer:** within 0.35 ms of the sum of the GPU stages on every case, so no drawing is hidden
  between the stages. Frame cost exceeds whole-frame GPU time plus CPU time by 0.3-0.6 ms on Low and High and
  0.7-1.7 ms on Psycho: that part is outside the game's drawing commands (the browser presenting the picture,
  and how "cost" is measured). Cost also overstates: cases with a cost of 4.66 and 4.83 ms held 239.8 fps
  against a 4.10 ms budget.
- User's settings (Psycho with MSAA off, distance x1.2, particles x1.25, weather x1.2): 239.8 fps on Forest and
  Night, 226.6 on Mountains, 202.1 on Futuristic (sun shadow map 1.41 ms there: 4.66 M vertices per frame).

**Fix in v3.3.1:** backdrop sets (mountain peaks, far skylines) are drawn in their own stage, "backdrop", after
the terrain and cars and before the sky. Mountains UTNRSVVLR17 High: 0 pixels differ from v3.3.0; KJGJHHMLH04 and
Forest move slightly closer to v3.2.0 (far backdrop no longer picks up the blob-shadow fringe). Not yet measured
on real hardware.

## v3.3.2 (2026-11-15) — "Admiral" preset
**Measured with v3.3.1 on the target PC (Edge):** Low 239.8, High 239.8, Psycho 219.4 fps (207.0 in v3.3.0,
195.0 in v3.2.0); frame cost Low 1.89, High 3.20, Psycho 5.78 ms. Mountains is fixed: scenery 0.12 ms and
backdrop 0.11 ms on High (1.59 ms in v3.3.0), Mountains Psycho 239.8 fps (197.3). Still under 240: Forest Psycho
217.7, Futuristic Psycho 180.3 (sun shadow map 1.23 ms). The user's settings: 239.8 on Forest, Mountains and
Night, 193.5 on Futuristic (sun shadow map 1.47 ms). User: "very fast almost all the time, much better than
v2.0.2".

- New preset **Admiral**, last in the list: the user's settings as a built-in (Psycho with MSAA off, distance
  x1.2, particles x1.25, rain and snow x1.2). Built in rather than saved in the browser because each delivered
  .html file is a different address to the browser, so saved settings do not follow from one build to the next.

## v3.4.0 (2026-11-15) — lighter sun shadow pass
Item 3 of the next-work list. Not measured on real hardware yet.
- Terrain and scenery are drawn into the shadow maps with depth-only programs (same vertex shader, a fragment
  shader that does nothing, so the full terrain and object shading no longer runs per shadow-map pixel and the
  linker drops the vertex work that only fed it). The two programs are created when shadows are first used.
- In the detailed (near) map, scenery beyond 250 m along the track uses its lighter model (was the preset's
  detail distance, 450 m on Psycho and Admiral). That map only receives within about 240 m of the camera.
- `tests/shadowpic.mjs` (High with a 1024 px shadow map switched on, old build against new): 0 pixels differ on
  Forest, Futuristic and Mountains; also 0 on Forest and Futuristic with the detail distance at 450 m. Psycho
  itself cannot be rendered on the software GPU here.
- **Not done: far map updated every few frames.** The whole shadow stage is 0.26-0.56 ms on Forest and Mountains,
  so the far map is worth perhaps 0.1-0.2 ms, and reusing an old map needs the exact camera movement between
  frames or distant shadows would shimmer. Left out as not worth the risk.
- Cars, traffic and props still go in with their full programs (few vertices).

## v3.4.1 (2026-11-15) — towers cast shadows as plain hulls
**Measured with v3.4.0 on the target PC (Edge): the v3.4.0 shadow changes gained nothing.** Sun shadow map on
Futuristic 1.23 ms (Psycho) and 1.47 ms (Admiral), exactly as in v3.3.1; Forest 0.48 / 0.57, Mountains
0.29 / 0.46. Vertices per frame on Futuristic unchanged at 4.66 M (Forest 2.76 -> 2.66 M). Averages: Psycho
212.0, Admiral 228.2 fps (Admiral 239.8 on Forest, Mountains, Night; 193.3 on Futuristic). So the shading in
the shadow pass was not the cost; the vertex count is.
- Cause found: the city towers. Three sets of about 1,940 towers each, 1,900-2,340 vertices per tower (window
  bands and trim), are landmarks, so they have no lighter distance model and are drawn to 400 m beyond the draw
  distance, in the main view and again in both shadow maps.
- **Fix:** `buildCaster` in models.ts makes the plain hull of a tower (main box and roof block, 72 vertices, same
  random size as the model); the shadow maps draw that in place of the model, sharing its instance buffer.
  `tests/shadowpic.mjs` on Futuristic against v3.4.0: 34-48 of 64,000 pixels differ, by at most 4/255; Forest 0.
  Not measured on real hardware yet.
- Still open on Futuristic: the towers in the main view (scenery 0.99-1.08 ms) have no distance model either.

## To do (noted 2026-11-15, from the first full benchmark run on the target PC)
- **Benchmark looks broken at the end of each run.** The cost and stage phases (the last 3 s of each 9.5 s case)
  make the GPU finish every frame or every stage, so the frame rate drops and the picture stutters, and the next
  track then loads; it reads as a hang. Fix: say on screen what is happening, or measure off screen / shorter.
- **Benchmark frame cost is overstated on Firefox.** Measured 237 fps on Forest High while "cost" says 6.56 ms
  (152 fps max): the read-back used to finish the GPU costs about 2 ms itself there. Needs a cheaper way to wait
  (fence sync), or calibration against an empty frame.
- **Track load leaks into the measured run.** Mountains Low and High show one 670-730 ms frame (1% low 14-15 fps);
  the 1.5 s warm-up is not always enough for the 28,000-tree woodland build. Wait for a few steady frames.
- **Graphics options should take free values** where that makes sense (draw distance, particles, rain and snow,
  full-detail distance, woodland, render resolution, lamp lights), not only the steps the presets use.
- Sky is the largest single stage on every preset at 3440x1440 (2.1-3.2 ms with full effects, 1.1-1.8 ms simple).
  It is drawn first over the whole screen and then mostly covered; drawing it after the opaque scene, only where
  nothing else is, should recover most of that.
- Start-up was 10.7 s on Firefox / Windows.

**Next work, agreed 2026-11-15** (1 and 2 done in v3.2.0, 4 and part of 6 in v3.3.0)
1. Benchmark: use GPU timer queries for the stage times where the browser offers them (dropped in the v3.1.0
   rewrite; Chrome usually has them), and fix the three benchmark faults listed above.
2. Sky: draw it after the opaque scene, only where nothing else was drawn; then consider painting the clouds
   into a smaller texture that is reused across frames.
3. Shadow pass: depth-only shader, lighter (level-of-detail) models (done in v3.4.0); far cascade updated
   every few frames (dropped, see v3.4.0).
4. ~~Terrain: bake the height noise into a texture~~ dropped in v3.3.0: the mesh is too small for that to be
   the cost. Done instead: terrain drawn after the scenery, rock lookups skipped where there is no rock.
5. Night: limit each surface to the street-lamp lights near it instead of looping over all 16 per pixel.
6. Draw order: near things (cars, road) before far things, so hidden pixels are skipped.
Then: one benchmark run each in Firefox and Chrome on the target PC. A run on a second device (the "17t") is
expected from the user with the current v3.1.0 benchmark.

**Image-quality ideas, noted 2026-11-15 (not started; to follow the performance work above)**
Costs are estimates for the target PC at 3440x1440, not measurements (240 Hz budget: 4.16 ms).
- Nearly free (do as one batch):
  - shading baked into the models at load (darker undersides and creases), on every preset;
  - cloud shadows drifting over the ground (under 0.1 ms);
  - terrain texturing with larger-scale variation, to break up the repeating wavy pattern on slopes;
  - haze with depth, so far hills fade towards the sky colour in layers;
  - trees dissolve between their near and far models instead of switching in one frame;
  - cars reflect the real sky and clouds instead of a two-colour gradient.
- Cheap (as options):
  - post-process anti-aliasing, for use with MSAA off (0.2-0.4 ms);
  - lighter sun shadows for High and Ultra, cars and nearby objects only (0.5-1 ms);
  - soft particles that fade where they meet the ground (0.1-0.2 ms);
  - grass and ground cover along the verges (0.2-0.5 ms).
- Expensive (Psycho only):
  - reflections on wet roads (1-1.5 ms);
  - headlight shadows at night (1 ms or more).
- Phones: the free batch only; no shadows or reflections on phone presets.
- Also noted: pick the default preset on touch devices from a short measurement at first start, not a fixed
  Ultra Low; find why High stutters on the Xiaomi 17T (try it with MSAA off).

**Frame generation and fuller lighting, noted 2026-11-15 (ideas, not started; costs are estimates)**
- Frame generation by reprojection, not interpolation. Interpolation needs the next real frame, so it adds a
  frame of lag (about 8 ms at 120 fps). Reprojection shifts the last real frame to the current camera using
  the depth buffer and adds none.
  - Cars are redrawn properly on every generated frame (they move with the camera and would smear); the HUD is
    separate already.
  - Gaps uncovered behind near objects are filled by stretching neighbours; how visible they are is unknown
    until it runs.
  - Estimated about 1 ms per generated frame against 5-8 ms for a real one: 120 real frames shown as 240.
    Handling still updates at the real rate.
- Lighting that is convincing for nearly everything (ray tracing is not available to a web page):
  - headlight shadows, a small shadow map per headlight pair (about 1 ms);
  - road and water reflections by drawing the scene mirrored at half size (1-2 ms);
  - car paint reflecting a small all-round snapshot of the surroundings, refreshed gradually (about 0.5 ms);
  - street-lamp shadows are too expensive (16 lights): fake soft pools instead;
  - bounced light is not feasible: ambient occlusion and sky light stand in.
  - Together roughly 4-6 ms more per frame on the target PC, about 100-130 real fps.
- The two fit together as a "Psycho+" mode: full effects at about 120 real frames, shown at 240 by reprojection.
- Limit that stays: the world is bent, so distant shadows and reflections can drift in long bends.

**Anti-aliasing beyond MSAA, noted 2026-11-15 (ideas, not started; costs are estimates at 3440x1440)**
- DLSS, FSR 4 and XeSS are not available to a web page (native driver and game toolkits only).
- Options, simplest to best:
  - FXAA: blurs detected edges; trivial, about 0.2 ms, softens everything;
  - SMAA: rebuilds edges properly; 0.4-0.6 ms, sharper than FXAA, does nothing for shimmer;
  - temporal AA: sub-pixel shift each frame, several frames blended; 0.4-0.6 ms, removes shimmer too, can
    ghost behind moving things;
  - temporal upscaling: the same while rendering fewer pixels; saves time overall, same risks more visible.
- FSR 1 (AMD's older single-frame upscaler, published as open shader code) can be ported: about 0.3 ms, no
  anti-aliasing, but a better picture under dynamic resolution than the plain stretch used now.
- Plan: SMAA as an option first; temporal AA together with frame generation (both need to know where each pixel
  was a frame ago); FSR 1-style upscaling for dynamic resolution, mainly for phones and slower PCs.
- Caveat: the world is re-bent every frame, so the previous position of a pixel is slightly inexact in bends;
  expect a little extra softness there with the temporal methods.

**Measured 2026-11-15: Xiaomi 17T (Mali-G720 MC8, 120 Hz), Mi Browser, v3.1.0 benchmark**
- Low and Ultra Low hold the screen's 120 Hz on all four tracks (119 fps average; 1% lows 45-118 fps).
  First real measurement of the light presets on a phone. Start-up 1.7 s.
- High: 42-68 fps, and not evenly slow: the median frame is still 8.4 ms but p95 is 42-92 ms, with 37-45 long
  frames per 5 s run. Cause not known (4x MSAA at 1506x558 on a tile-based GPU is the first suspect).
- Psycho: 13-49 fps.
- The per-stage table is useless on this phone: every stage reads about 2 ms, including "clear". That is the
  cost of the read-back used to finish the GPU, the same fault as on Firefox, only larger.
- Ultra Low (the default on touch devices) renders 564x209 here, far below what the phone can afford; Low at
  752x278 also holds 120 fps. The touch default should be picked from a short measurement, not fixed.

## Known issues / not verified
- **Mountains has known visual issues that are staying.** The world is a strip of terrain about 800 m either side
  of the road, bent each frame so the road ahead straightens, with a painted sky behind. On flat scenarios the
  strip's edge sits on the horizon; with mountain-sized relief its edges and the joins between stretches can be
  seen, with the backdrop showing behind them ("holes"), and the ground inside bends changes shape slightly as
  you drive. Decided 2026-11-14 to leave it. What would fix it: a far ground layer behind the strip, lower
  relief, or a true 3D world (a rewrite of the renderer and the track generator).
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
