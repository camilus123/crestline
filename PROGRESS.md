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

## v3.4.2 (2026-11-15) — distance model for the city towers
**Measured with v3.4.1 on the target PC (Edge):** Futuristic vertices 4.66 -> 2.44 M per frame, sun shadow map
1.23 -> 0.88 ms (Psycho) and 1.47 -> 0.92 ms (Admiral); Admiral on Futuristic 193.3 -> 217.7 fps, Psycho 177.
Admiral average 233.0 fps: 239.8 on Mountains and Night, 234.8 on Forest (239.8 in the two runs before; its cost
of 4.9-5.0 ms sits right at the edge), 217.7 on Futuristic. (Start-up read 0.3 s: a reload with shaders cached.)
- Towers beyond the full-detail distance are drawn with a distance model: each window band is its outward face
  (6 vertices) in place of a box 6 cm deep (36). Landmark sets could not have a distance model before; one that
  is placed every frame now shares the instance buffer, and the whole stretch is placed before either part is
  drawn. The shadow maps use the plain hull for both parts.
- Software GPU, Futuristic at High: 1,916 k -> 870 k vertices per frame, scenery stage 1,384 -> 741 ms.
  Picture against v3.4.1: 3-6 % of pixels differ at 480x270, 0.1-0.4 % by more than 8/255, all on towers far
  down the street (bands seen edge-on, under a pixel wide); side by side at 960x540 the frames look the same.
  Not measured on real hardware yet.

## v3.4.3 (2026-11-15) — snow on firs fixed, no drawing while the window is out of focus
**Measured with v3.4.2 on the target PC (Edge):** Futuristic vertices 2.44 -> 1.53 M (Admiral, Psycho) and
1.91 -> 0.87 M (High); scenery stage 1.06 -> 0.98 ms (Admiral), 0.72 -> 0.62 ms (High): the towers' cost in the
main view is mostly pixels, not vertices. Admiral: Forest 235.2, Mountains 239.8, Night 239.8, Futuristic 221.3
fps (217.7 in v3.4.1); average 234.0. Psycho average 210.8. (Start-up 0.2 s is with Edge's shader cache warm;
the user notes the cache is gone when Edge is closed.)
- **Snow on firs** (user's screenshot: stray white facets on the tiers). The snow was a separate cone inside each
  tier with its own random jitter, so facets of it stuck out wherever the two jitters disagreed. It is now a band
  cut from the tier's own surface and pushed out 5 %, reaching half way up the tier (to the tip on the top tier),
  in the full, lighter and distance models. Tree shapes are unchanged (same random numbers). The trees carry
  visibly more snow than before: a clean white band on every tier.
- **Window out of focus:** the game already paused; it now also stops drawing after four more frames and starts
  again on focus (`tests/sleep.mjs`: 0 frames while out of focus). Not during the benchmark.

## v3.5.0 (2026-11-15) — simulation 3-4x cheaper on circuits, programs compiled once, compile times in the benchmark
- **Simulation cost** (`tests/simcost.mjs`, software-GPU container, microseconds per 1/120 s step, 20 cars):
  Forest circuit 322 -> about 75-95; Mountains, Night, Futuristic about 90-100 -> 60-85 (noisy). Results are
  bit-identical: `tests/simsame.mjs` runs 9,000 steps on the four benchmark tracks with the old and new build and
  compares every car's distance, lateral position and speed (largest difference 0).
  - `Track.delta` (signed distance along the track) took two floating-point remainders per call and was 67 % of
    the simulation's time on circuits; it now settles the usual case with a comparison and one addition.
  - The rivals' lane choice worked out the distance to every other car again for each of 24 candidate lanes
    (about 8,700 `delta` calls per step); the nearby cars are now found once per driver.
  - `hazardsIn` / `objectsIn` no longer create a closure per call; pit-strip test without `Array.some`.
  Not measured on the laptop yet (was 1.8-3.5 ms per frame there on v3.2.0).
- **Shader programs were compiled again for every race.** Scenery and hazards create their programs per race:
  the benchmark's 8 short cases had left 56 programs (13 x objects, 12 x blobshadow, 8 x hazprops, 7 x decals),
  none ever freed. `Program` now returns the existing program for the same source. Browsers that cache shaders
  by source (Chrome, Edge) hid this; where there is no such cache each race start paid the compile again.
- **Benchmark: shader compile times.** After the last case every program is built again with a changed comment
  (so no cache answers) and timed, one by one and then all at once as at start-up; the report has a "Shader
  compilation" section and `compileMs` in the JSON. This is the measurement the start-up work needs: on Windows
  the suspect is Direct3D shader compilation, which cannot be reproduced here.
- Start-up itself is unchanged in this version. JavaScript set-up before the first frame is about 1.1 s in the
  test container.

## v3.5.1 (2026-11-15) — compile-time experiments in the benchmark
**Measured with v3.5.0 (and v3.4.3 for comparison)**
- Target PC, Edge: Admiral average 236.1 fps (Forest 238.6, Mountains 239.8, Night 239.8, Futuristic 226.3);
  Psycho 213.6. Simulation 0.14 -> 0.04-0.05 ms per frame on Forest.
- Laptop (Core 5 120U, Intel graphics, Firefox, 1080p), v3.4.3 -> v3.5.0 in the same sitting: simulation per
  frame Forest 2.05 -> 0.69 ms (Low), 5.15 -> 1.60 (Psycho); Mountains 1.08 -> 0.66; Night 0.90 -> 0.51;
  Futuristic 0.88 -> 0.55. CPU per frame on Low 2.82 -> 2.20 ms. Frame rates unchanged (the GPU is the limit
  there): Low 60.0 on every track, High 53.0 average, Admiral 36.4, Psycho 20.4. Start-up 12.8 s (v3.5.0); the
  v3.4.3 run reported 46.3 s, unexplained.
  On that laptop "cars, traffic" is by far the largest stage on Psycho (19.6-21.5 ms) and Admiral (8.3-8.9 ms)
  against 1.9-3.9 ms on High: to look at (the cars' full-detail distance follows the scenery's 450 m).
- Phone (PowerVR GE8320, 2 GB, Chrome, v3.4.3): Ultra Low 18.0-27.0 fps at 618x270, Low 12.4-18.5. CPU 11-20 ms
  per frame on Ultra Low, of which simulation 4.9-13.2 ms (before the v3.5.0 fix). MSAA resolve takes 200-500 ms
  there, so High and Psycho run at 2-4 fps. Start-up 16.8 s. Needs a run with v3.5.0 or later.
- **Shader compilation, each program from scratch.** PC (Edge): all at once 5.40 s, one after another 11.83 s.
  Laptop (Firefox): 14.04 s at once, 14.33 s one after another: Firefox does not compile in parallel.
  PC / laptop, ms: terrain 4643 / 7508, sky 2050 / 2277, terrain-depth 1802 / 1751, blobshadow 831 / 706,
  car 634 / 541, decals 585 / 520, objects 447 / 359, texgen 295 / 217, road 206 / 150, the rest under 70.
  Start-up on Edge is therefore the terrain program (it bounds the parallel compile); on Firefox it is the sum.
  Programs that contain the terrain height function are the slow ones: about 0.6-0.8 s per copy of it
  (blobshadow and decals have one, the terrain vertex shader three).

**In v3.5.1**
- `terrNoise` writes the noise out at two places, not three (same values; 0 pixels differ on a circuit and two
  stage tracks). Expected to cut the compile time of every program with the terrain function; not measured.
- The benchmark's compile section ends with ten experiments: cut-down variants of the terrain and sky programs
  (vertex shader alone, fragment shader alone, one point not three, 2 noise octaves, lattice values from a
  texture, no circuit seam blend, no lighting, no branches around textures; sky with 2 octaves and with a
  texture). They are compiled and timed, never drawn with. Temporary: to be removed when start-up is settled.
- Candidate fixes, to be chosen from those numbers: (a) bake the terrain height into a per-track texture (the
  item dropped in v3.3.0 for frame time comes back for compile time; changes how Mountains is sampled, so needs
  care); (b) lattice values from a texture; (c) show the menu before the terrain and sky programs are ready
  (helps where compilation is parallel, i.e. not Firefox).

## v3.5.2 (2026-11-15) — lattice hash four corners at a time; lighter car model from 80 m
**Measured with v3.5.1 on the target PC**
- The two-place `terrNoise` of v3.5.1 (Edge, from scratch): terrain 4643 -> 2768 ms, terrain-depth 1802 -> 1136,
  blobshadow 831 -> 458; all at once 5.40 -> 3.47 s. Firefox on the same PC: 9.11 s at once (9.35 one by one),
  start-up 8.2 s (9.3 s on v3.2.0).
- Experiments (Edge / Firefox, ms): terrain vertex shader alone 1117 / 1119; fragment shader alone 119 / 123;
  one point not three 545 / 590; 2 octaves 542 / 584; lattice values from a texture 253 / 271; no seam blend
  566 / 518; fragment without lighting 57 / 61; without branches around textures 118 / 121. Sky 2083 / 2293:
  2 octaves 965 / 1051, lattice from a texture 417 / 451.
  Reading: the fragment shaders are not the problem; the time is the integer lattice hash, written out once per
  corner, per octave, per noise call, per terrain point. Everything that halves the number of copies halves
  the time. (The whole terrain program takes 2.5x the vertex shader alone because with no fragment shader two
  of its three terrain points are dead code.)
- Frame rates, Edge: Admiral 235.6 average (Forest 237.4, Futuristic 225.4, the others 239.8). Firefox: 232.8.

**In v3.5.2**
- `vnoise` hashes the four corners of a cell in one four-wide operation (`hashU4`): the same numbers (0 pixels
  differ on the four benchmark tracks), a quarter of the instructions. Not measured on Direct3D yet.
- The benchmark's two "lattice values from a texture" experiments now apply to the new `vnoise`, so the next run
  shows what a texture would still gain on top.
- Cars use the lighter model beyond min(0.35 x detail distance, 80 m): was 157 m on Psycho and Admiral, where
  "cars, traffic" was 0.45-0.91 ms on the PC (0.14-0.15 on High) and 8-21 ms on the laptop. High and below are
  unchanged (60 m and less). Not measured yet.

## v3.5.3 (2026-11-15) — one lighting call per car pixel
**Measured with v3.5.2 on the target PC**
- Shader compilation, Edge: terrain 2768 -> 1631 ms, sky 2083 -> 1212, terrain-depth 1136 -> 664; all at once
  3.47 -> 1.93 s; start-up 2.3 s (5.4-6.5 s before v3.5.1). Firefox: 9.11 -> 5.87 s at once, start-up 5.5 s
  (8.2). The four-wide hash gives the same picture and cut the two slow programs by about 40 %.
- Lattice values from a texture would still take the terrain vertex shader from 675 to 230 ms and the sky from
  1212 to 424 ms. Not taken: it changes the shape of the ground on every track. Open for the sky alone.
- Admiral, Edge: Forest 239.8, Mountains 239.8, Night 239.8, Futuristic 231.6; average 237.8 (user: "super close
  to hitting 239-240 average on all tests"). Psycho 212.9. Firefox: Admiral 232.9.
- **The 80 m car model change of v3.5.2 gained nothing**: cars, traffic 0.44 / 0.71 / 0.48 / 0.54 ms on Admiral
  as before, vertices down by 0.01 M. The cars' cost was not their geometry.

**In v3.5.3**
- Cause: the car fragment shader called the lighting function in eight material branches (paint, glass, chrome,
  trim, lenses, ...). Compilers flatten such a chain, so every car pixel paid for eight sets of sun-shadow
  lookups (16 taps each) and eight passes over the lamp list. That fits what was measured: cars cost 3-5x more
  with sun shadows on (0.15 -> 0.44-0.91 ms on the PC, 2 -> 8-21 ms on the laptop) and 0.49 ms on Night even
  on High. Now the branch only picks the material's values and the lighting is called once.
  0 pixels differ (Forest, Night, Futuristic; Mountains with a shadow map on). On the software GPU the cars
  stage on Night at High went from 319 to 160 ms in one noisy run. Not measured on real hardware yet.
- The 80 m limit on the full car model stays (harmless, slightly fewer vertices).
- Same pattern, not changed: the ground-patch shader (decals) calls the lighting in seven branches; it covers
  few pixels, but it is one of the slower programs to compile (546 ms).

**Measured with v3.5.3 on the target PC (2026-11-15): Admiral holds the refresh rate on every benchmark track**
- Edge: Admiral 239.8 fps on Forest, Mountains, Night and Futuristic (1% lows 226-233, no frame over 4.6 ms);
  frame cost 4.42 / 3.48 / 3.23 / 4.33 ms. Low and High 239.8 everywhere. Psycho 219.9 average: Mountains 239.6
  and Night 239.8, Forest 205.1, Futuristic 194.9.
- Firefox: Admiral 239.0 / 239.8 / 239.8 / 239.8 (average 239.6); Psycho 229.7.
- The car-shader theory held. Cars, traffic on Edge, v3.5.2 -> v3.5.3: Forest Admiral 0.44 -> 0.11 ms, Night
  0.48 -> 0.14 (High 0.49 -> 0.14), Futuristic 0.54 -> 0.12, Mountains 0.71 -> 0.39. The car program compiles
  in 171 ms (548). Left over: on Mountains the cars still cost 0.39-0.46 ms with sun shadows on against 0.08 on
  High; not looked at.
- Shader compilation: Edge 1.80 s all at once, Firefox 5.49 s; start-up on Firefox 4.8 s.
- User: "looks like we did it.. it's 239 for everything now".
- The 240 Hz figures above are the user's measurements on the target hardware (RX 9070, 3440x1440, 240 Hz
  display, vsync on, so 239.8 is the cap). Psycho does not hold it and nothing here claims it does.

## v3.5.4 (2026-11-15) — windsocks and trees no longer shake when gusts build
User's screenshot: windsocks on a Wind track vibrating very quickly.
- Cause: the sway was sin(time x speed), and the speed rises with the wind. Any change of speed was therefore
  multiplied by the whole race time: a gust building over a second, one minute into a race, swung the phase at
  about 90 rad/s (14 Hz) for as long as the gust was rising or falling. Everything that sways was affected
  (trees too); the windsocks, with full sway, showed it most. Worse the longer the race had run.
- Fix: the phase is added up frame by frame on the CPU (`Scenery.windPhase`, uniform `uWindPh`).
  `tests/windphase.mjs`: on a Wind track, 60 s in, the phase never advances faster than 4.4 rad/s.
- Also: a gust from the other side flipped the lean of every tree and sock in one frame; the wind's side is now
  eased over in about a second.
- Calm tracks are unchanged: Forest at High, 0 pixels differ from v3.5.3.

## v3.5.5 (2026-11-15) — tidy-up before release
**Measured with v3.5.4 on the Xiaomi 17T (Mali-G720, Mi Browser, 1696x780, 120 Hz):** Low 118.8 fps average
(119.7 / 119.7 / 116.7 / 119.3), CPU 2.05 ms per frame. High 52.9 with 30-43 hitches per 5 s run (median frame
8.4-16.7 ms, 95th percentile 50-66 ms); Admiral 55.5 and Psycho 39.3, the same pattern. So the stutter above
Low is still there and is not MSAA (Admiral has none) and not JavaScript (CPU 99th percentile 6-10 ms): open.
Shader compilation 0.31 s; start-up 3.8 s. Stage times on this device are unusable (most read 0).
- **User: after the benchmark the tab seemed to hang on the phone.** Probable cause (not reproduced): v3.4.3
  stops drawing when the window loses focus, and on a phone the download prompt or share sheet takes focus and
  never gives it back as an event. Now: on touch devices losing focus only pauses; and on every device a
  touch, click, key or return to the tab wakes the game as well as the focus event.
- Removed the ten temporary compile experiments from the benchmark (the per-program compile times stay).
- README brought up to v3.5.5.

## v3.5.6 (2026-11-15) — the game no longer freezes after the benchmark where there are no GPU timers
User's screenshot from the 17T on v3.5.5: benchmark report on screen with the race's touch controls still drawn
over it, nothing responding. My focus theory for v3.5.5 was wrong.
- Cause, a bug introduced in v3.5.0: since the shader-compile timing was added, the benchmark object stays alive
  for some frames after its last phase. Without GPU timers the phase index is then one past the end, the game
  asks `bench.finishFrames` every frame, and that threw ("Cannot read properties of undefined"). The frame loop
  never scheduled another frame: frozen picture, and on a phone the race's touch controls stayed on top of the
  report and swallowed every touch. Affected every browser without GPU timers since v3.5.0 (Firefox on desktop
  too: there the report worked but the background was frozen until reload). The automated test missed it
  because the software GPU here has timers.
- Fix: the phase is clamped and `finishFrames` is false while finishing.
- The frame loop now schedules the next frame even when a frame throws (the error is still reported).
- `tests/benchrun.mjs`: `NOTIMERS=1` runs it as a browser without GPU timers, and it fails unless frames are
  still being drawn in the 4 s after the report. Before the fix: 0 frames and the error above; after: 17.
- The v3.5.5 focus changes stay (touch devices only pause on losing focus; any input wakes the game).

## Standing instructions from the user
- **Keep the performance tables up to date** (2026-11-18: "the performance tables are good, make sure to keep
  them updated when necessary"). When a benchmark report arrives: `python3 tools/perfadd.py report.txt`, then
  `python3 tools/perfcharts.py` (redraws the charts, rewrites the tables of `docs/performance.md`), then read
  the page's prose and the charts' descriptions for figures that have moved, and commit. Picture cost tests are
  not benchmark runs and do not go into the data file.

## v3.10.8 released to `main` (2026-11-21)
User sent the old Xiaomi's benchmark of v3.10.8: "do you notice any issues? if not let's move this to main".
The build is the one he ran (15:05 UTC); only documents changed after it.

**The report**: giving up works. Ultra Low on all four tracks (18.7, 22.2, 18.6, 12.8 fps; average 18.1), Low on
Forest 9.9 fps, then given up: 5 cases in place of 24, and the "GIVEN UP" block lists what was not run.

**What I noticed, none of it a reason to hold the release**
1. The 10 fps limit sits exactly on this phone's Low: 9.9 fps now, 10.3 in v3.10.5. So whether its Low gets
   measured on the other tracks is a coin toss from run to run. Any limit is somebody's edge; not changed.
2. A cosmetic fault in the pacing section: "Forest / Ultra Low: … -0.1s 4 (remembered)". The first case's
   remembered rhythm is logged before the case's clock starts. NOT fixed (the release is the build he ran).
3. "all 20 programs" in the shader compile section, 25 in v3.10.5: the depth and SMAA programs are only made
   when a preset that needs them runs, and those were given up. Compile totals of runs that gave up are
   therefore not comparable with full runs. Not a fault in the game; to be remembered when reading them.
4. Frame cost reads higher than the frame time on Forest (61.4 ms cost, 53 ms a frame at 18.7 fps). The
   report's own note covers it ("if cost disagrees with fps, trust fps"); cost on this phone is rough.
- Simulation 4.5 ms a frame on Forest here, 9.4 ms in the v3.10.5 run: that run was slow for outside reasons.

**Released**: `v3` pushed to `main` (README says v3.10.8). Tag and release are the user's to make.
Since v3.10.2: the scenery fix for PowerVR Rogue (v3.10.5), preset by measuring and lost-context handling
(v3.10.7), benchmark with Ultra Low and giving up (v3.10.8).

## v3.10.8 (2026-11-21) — the benchmark includes Ultra Low and gives up on hopeless presets (on `v3`)
User, on v3.10.7: "this one seems to work and pick the phone mode correctly, the slow one gets ultra low and
the 17t get commodore". So the measurement is confirmed on both phones (how he ran it, first start or the
Settings row, he did not say; the timings it found were not sent). Then: "let's have the benchmark include
ultra low and give up on hopeless presets".

- Suite: Ultra Low, Low, High, Psycho, Admiral, Commodore (six, was five) on the four tracks, plus the player's
  own settings if they are not exactly one of those. "Yours: Ultra Low" rows of stock Ultra Low are gone.
- Run order on each track is now lightest first: Ultra Low, Low, Commodore, High, Admiral, Psycho
  (`BENCH_LADDER`), then the player's own. The tables keep their usual order.
- Giving up (`BENCH_GIVE_UP_FPS` = 10): a stock preset that measures under 10 fps on a track is hopeless on
  that device. It and everything heavier on the ladder are not run from there on, on that track and the later
  ones. Ultra Low is always run on all tracks, and so are the player's own settings.
- 10, not the "about 20" I first said: at 20 the old Xiaomi would lose Low (8 to 16 fps) and nearly Ultra Low,
  which are the two presets one wants its numbers for. Under 10 nobody plays.
- "Heavier" is the fixed ladder, from the two phones measured (old Xiaomi: Commodore 3.3 fps, Admiral 2.3,
  High 1.7, Psycho 1.3). It is NOT measured per device: a device on which, say, Commodore is hopeless and High
  is not would lose its High figures. None such is known.
- The report: a "GIVEN UP" block under the header (the limit, which preset reached what on which track, what
  was not run); averages over fewer tracks are marked "(n of 4 tracks)"; the data line has `giveUpFps`,
  `gaveUp`, `skipped`. The per-second fps line says in which order the cases ran.
- Expected on the old Xiaomi from its v3.10.5 figures: Forest runs Ultra Low, Low (10.3 fps: stays, just),
  Commodore (2.8: given up); then Ultra Low and Low on the other tracks, where Low at 8.4 fps on Futuristic
  comes last and changes nothing. About 9 cases in place of 24. NOT run there yet.
- Tools: `perfadd.py` keeps `gaveUp` and `skipped`; `perfcharts.py` treats a preset measured on fewer tracks
  than the rest as not measured (its average would not compare). Charts and tables unchanged by this.
- Checked: `tests/benchrun.mjs` plain, and with `GIVEUP` (`EXPECT=ultra`: Ultra Low short, stays in, Low gone
  from both tracks; `EXPECT=low`: Low short on the first track, gone from the second, average marked);
  `autopreset`, `flow`, `gfxopts` pass.
- Not checked: the full six-preset suite in one run (a software GPU needs minutes per Psycho frame; the test
  suite is Ultra Low and Low on two tracks). The table order with all six therefore rests on reading the code.

## v3.10.7 (2026-11-21) — the preset picked by measuring; a lost graphics context; scenery test removed (on `v3`)
User: "is it possible to detect what kind of phone is it running on and default to ultra low if it's slow and
commodore if it's not?" then "go + remove the scenery test for now".

**Scenery test removed** (`src/diag.ts`, `tests/diag.mjs`, the button, `Game.sceneryTest`, `Scenery.debug`,
`Renderer.skipScenery`, the transform-feedback option of `Program`, `Mesh.drawInstancePoints`). The shader fix
stays. To bring the test back: commit bf69a2a (v3.10.6) has all of it.

**The preset picked by measuring** (`Game.measureDevice`, game.ts)
- Not by recognising the phone: a page is not told the model, the GPU name is hidden or differs by browser
  (this Xiaomi: "PowerVR SGX Doma" in Edge, "Rogue GE8320" in Chrome), and both of the user's phones report 8
  threads.
- On the first start of a touch-first device (nothing saved yet, no test parameters in the address): Low is
  timed, and only if it passes, Commodore. Commodore if its frame stays under 22 ms (30 fps with a third to
  spare), else Low if Low's does, else Ultra Low. Low first, so a weak phone never has to try Commodore.
- A timing: the benchmark's Forest as the title's background race, 3 frames left out, then the median of up
  to 8 frames (at least 3, and no more once 1.5 s have gone), each with the GPU made to finish.
- Stored as `autoPreset` (preset, the two timings, limit, version). A note is stored BEFORE measuring: a page
  that dies in the middle starts on Ultra Low next time and does not try again.
- Never again by itself, so a preset picked by hand stays. Settings has "Pick the preset by measuring" (not
  from the pause menu). `?measure` forces it, `?measure=40` with another limit (tests).
- A desktop is not measured: High, as before.
- NOT measured on any real phone. Expected from the benchmarks: the Xiaomi 17T passes (Commodore about 8 ms a
  frame), the old Xiaomi fails Low (about 80 ms) and gets Ultra Low. The 22 ms limit is a guess for the
  phones in between; nothing in between has been measured.
- Known weaknesses: a phone that is fast cold and slow warm is judged cold. The timing does not take off what
  making the GPU finish costs (3.8 ms a call on the old Xiaomi), which errs towards the lighter preset. If
  the page is closed during a measurement started from Settings, the next start is on Ultra Low.

**A lost graphics context** (`Game.onContextLost`)
- Before: no handling at all. The game went on "drawing" into a dead canvas and the benchmark reported 60 fps
  for cases that showed a black or white screen (the A53-class phone's report of v3.10.2).
- Now: drawing stops, a notice says what happened, with "Restart" and, unless already on Ultra Low, "Restart
  on Low" (on Ultra Low from Low). Enter or space restarts too. No attempt to rebuild the renderer in place:
  everything it made is gone, a restart is the reliable way, and settings and best times are in storage.
- The benchmark ends with a report headed "STOPPED: THE GRAPHICS CONTEXT WAS LOST": the case it happened in,
  the device (noted at the start of the run, a lost context cannot be asked), the cases completed before.
  The player's own settings are put back. The report is on the benchmark screen after the restart.
- During a measurement: the measurement stores the preset that was safe; the notice has "Restart" only.
- NOT tested with a context really lost for lack of memory, only with the browser's own switch for it
  (WEBGL_lose_context) on the software GPU.

**Also**: toasts sit outside `#ui` and so had the browser's serif font and, once their animation ended, were
no longer centred (the keyframes ended on `transform:none`). They name their font now and have their own
animation. Seen because this version's toast is longer and stays 5 s.

**Checked** (software GPU)
- `tests/autopreset.mjs` (new), 15 checks: first start on an emulated phone measures and gives Ultra Low; not
  measured again; a hand-picked preset stays; generous limit gives Commodore; a limit between the two timings
  gives Low; an unfinished measurement gives Ultra Low without measuring; a desktop is not measured; lost
  context in the menus (notice, 4 frames before, 0 after, restart on the lighter preset works); lost context
  in the benchmark (report, settings back); the Settings row.
- `flow`, `gfxopts`, `benchrun`, `cartouch`, `smaastage` pass; `smaaopt` and `picscan` against v3.10.6: 0 pixels.
- Looked at: the notice, the Settings row and the toast at 825x360.

**Not done** (offered earlier, not asked for): the benchmark including Ultra Low and stopping once a preset
falls below about 20 fps.

## v3.10.6 (2026-11-21) — the fix confirmed on the phone; performance tables updated (on `v3`)
User: "the trees, buildings, cones and incoming traffic are now there", with the round 3 scenery test and a
benchmark from the Xiaomi, and a benchmark from the PC (Firefox), all on v3.10.5. No code change in the game
since v3.10.5: comments, documents, tools.

**Round 3 on the phone**
- The shipped rule draws the scenery: 29.3 % (Forest), 41.6 % (Futuristic), 32.6 % (Forest on Low), the software
  GPU's figures. It still hides what it should: leaving it out changes 753 pixels at the third moment (777 on
  the software GPU).
- Which spellings of the old rule fail: only the line as it was, and the same line placed after the landmark
  rules. Nested, distance test first, distance test last, as a "?:" choice, with abs(u) and ext + 1.0 worked
  out beforehand, distance test alone: all draw the scenery.
- Read back from the driver: each of the three tests alone is right, the pairs are right, all three as a choice
  and as a bool are right (0); as an "if" they come out 1. `hide` is 0 before the old line and 1 after it.
- So the driver's fault is narrow: an "if" whose condition has a comparison of two worked-out float values
  between two whole-number tests. WHY it does that is not known and will not be found from here.
- Every line of part 2 is marked "bad", the shipped rule's too. That is my probe, not the shipped rule: the
  probe contains the faulty "if" to measure it. "left out 0" is the rule in use. A badly chosen mark.
- Other shaders: no other condition has that shape. Nearest: the rumble-strip condition in the road's fragment
  shader (`ground.ts`: bool, ready float against a constant, bool), the form that worked in this test; and two
  all-whole-number chains of three in OBJ_VS. All left as they are: nothing says they misbehave, and the
  pictures on the phone match the software GPU to 0.1 point.

**Benchmarks** (`python3 -I tools/perfadd.py`, `tools/perfcharts.py`, prose reread)
- Xiaomi, v3.10.5, Chrome, pacing on, now with roadside objects: Ultra Low 18.6 fps (Forest 19.5, Mountains
  22.3, Night 19.4, Futuristic 13.4), Low 11.5, Commodore 3.3, Admiral 2.3, High 1.7, Psycho 1.3.
- Against v3.10.2 (Edge, objects missing): Ultra Low 19.7 → 18.6 fps, frame cost 33.2 → 46.2 ms. NOT a clean
  comparison: other browser, and "simulation (CPU)" read 9.9 ms a frame against 3.7 ms with unchanged simulation
  code. Draw calls and instances identical (the objects were always sent, they never reached the screen).
- The v3.4.3 "old phone" in the data is this same phone (same GPU, output and thread count). The v3.10.2 report
  was not in `benchmarks.json`; added. `perfadd.py` now knows "EdgA/" as Edge and labels this phone's plain
  Chrome user agent "Chrome" (Brave would look the same).
- `docs/performance.md`: a generated table `oldphone` replaces the hand-written one, with a column saying
  whether roadside objects were drawn (from the scenery tests, by version). Prose on what the rows do and do
  not say. The PC's Firefox paragraph, the shader compile table and chart text, and "Not measured" updated.
- PC, v3.10.5, Firefox, pacing on: Low, High, Admiral, Commodore 239.8 fps, Psycho 198.4. First PC run with
  SMAA inside Commodore: frame cost 3.09 ms, SMAA stage 0.08 to 0.22 ms. Shader compile 5.5 s for 25 programs.
- Seen in the Xiaomi report, not acted on: the simulation is the largest JavaScript item there (8 to 13 ms a
  frame on Ultra Low, 17 to 25 ms on the presets that run at a few fps: a slow frame has more simulation
  steps to catch up on).

**Still open**
- The "Scenery test" button is still on the benchmark screen. It has done its job; whether it stays is the
  user's call.
- Offered, awaiting "go": lost graphics context handling; benchmark including Ultra Low and stopping when a
  preset falls below about 20 fps; starting preset from a short measurement.

## v3.10.5 (2026-11-21) — the missing trees and buildings: the cause found, a fix to be confirmed on the phone (on `v3`)
User sent the round 2 report from the Xiaomi (PowerVR Rogue GE8320, Chrome 146).

**What round 2 showed**
- Transform feedback works on that phone. Everything the vertex shader works out is right (the three instance
  attributes equal what the game gave it; distance, ground height, tapers, world position all as on the
  software GPU) except ONE number: `hide` is 1 for every object and landmark recorded (17 of 17), so every one
  is sent to clip position (2, 2, 2, 1), off the screen.
- Of the 13 variants only two drew the scenery, both with exactly the software GPU's figures: "never left out"
  (Forest 29.3 %, Futuristic 41.9 %) and "not left out for being beyond the fold" (29.3 %, 41.7 %).
- So the fault is one line of the objects vertex shader:
  `if (uLandmark == 0 && abs(u) > ext + 1.0 && uSpan == 0) hide = 1.0;`
  With abs(u) about 34 and ext 700 the middle test is false, and for landmarks the first is false too; that
  driver sets hide anyway. Span sets (uSpan 1) escape, which is why they were drawn. WHY the driver does this
  (which construct it gets wrong) is NOT known yet.

**The fix** (`src/render/scenery.ts`, OBJ_VS)
- The rule without "if" and without "&&", built only from constructs that demonstrably work on that phone
  elsewhere in the same shader (a choice on one comparison, arithmetic):
  `float ordinary = (uLandmark == 0 ? 1.0 : 0.0) * (uSpan == 0 ? 1.0 : 0.0);`
  `hide = max(hide, ordinary * (abs(u) > ext + 1.0 ? 1.0 : 0.0));`
- NOT confirmed on the phone. It is a best guess at what the driver will take; round 3 says whether it did.
- Same pictures as before on the software GPU, including where the rule fires: `tests/picscan.mjs` (new),
  v3.10.2 against v3.10.5, 0 pixels differ at every 250th frame of Mountains on Low (22 moments), Forest on Low
  (26) and every 500th of Forest on High (12). The rule is known to fire in that span: a copy of the build with
  the rule disabled differs at Forest 2500 to 3000 and 6000 to 6250, Mountains 4000 to 5250.
- A trap found on the way: two pages of the same build differ at some moments (sparks, spray: Math.random), and
  my first scans read that noise as differences between builds. `picscan.mjs` gives both pages the same random
  numbers; the same build twice is then 0 everywhere.
- On Ultra Low the rule hardly ever fires (no moment found in 6000 frames of Forest or Mountains); it matters
  from Low up.

**Round 3 of the scenery test** (`src/diag.ts`, header "scenery test 3")
1. Pictures with the rule written ten ways (as shipped; as it was; nested; distance test first; distance test
   last; as a choice; the two numbers worked out beforehand; only the distance test; placed after the landmark
   rules; left out), at three frozen moments: Forest and Futuristic on Ultra Low as before, and Forest on Low
   after 2750 steps, where objects ARE beyond the fold. Each line also says in how many pixels it differs from
   the shipped rule. Software GPU: all ten the same at the first two moments; at the third only "left out"
   differs (777 px), which is how the report shows that the shipped rule still hides what it should.
2. Read back from the driver for three objects of up to three kinds, with the shipped rule, the old rule, and
   the old rule with `hide` noted before it, after it and after the landmark rules: the three tests alone, in
   pairs, all three as a choice, as an "if" and as a bool, and the two landmark conditions. A line whose
   combined tests are not what their parts give is marked "bad". Software GPU: none.
- Reference: `review/v3/scenery_test_reference.txt`. Checked by `tests/diag.mjs`; `tests/smaaopt.mjs` against
  v3.10.2 0 pixels on four presets; `tests/flow.mjs` passes.

**Still open**
- Whether the fix works on the phone; which construct that driver gets wrong, and whether other shaders use it
  (other "&&" chains exist: `glsl.ts` shadows, `ground.ts`, `sky.ts`, `smaa.ts`, three more in OBJ_VS).
- Traffic and cones use the same shader: they were presumably missing on that phone too. Not asked, not known.
- The Xiaomi's benchmark figures in `docs/performance.md` were measured WITHOUT roadside objects; with them the
  phone will be slower. To be re-measured once the scenery shows.
- The "Scenery test" button is still on the benchmark screen: decide before a release whether it stays.

## v3.10.4 (2026-11-20) — scenery test, round 2 (on `v3`, not for release)
User sent the scenery test report of v3.10.3 from the Xiaomi (Chrome 146; this browser names the GPU
"PowerVR Rogue GE8320", where Edge's benchmark report said "PowerVR SGX Doma").

**What round 1 showed**
- My suspicion was WRONG. All seven instance-range cases came out right on the phone: the driver honours the
  moved pointers. The 'copy' path (`Mesh.rangeMode`) is removed again.
- All seven ways of drawing gave the same picture: Forest 1.4 % of the picture changed by roadside objects
  (software GPU: 29.3 % on Ultra Low, 42.0 % on Low), Futuristic 0.3 % and 0.5 % (41.7 %, 42.5 %). No GL error,
  context not lost. So it is not the change-over blend, not the fragment shader, not the ranges.
- What the phone does draw: drawing the parts one at a time on the software GPU (`tests/out/whichpart.mjs`,
  scratch) gives the phone's maps for "blob shadows only" (Forest, 1.4 %) and for the span sets (the things
  that cross the road, Futuristic). Those two draw; ordinary objects and landmarks do not.
- What tells them apart: blob shadows have their own vertex shader with two instance attributes; span sets use
  the objects shader but skip base height, scale, turn, sway and bending. So the fault is in the part of the
  objects VERTEX shader that only ordinary objects run, or in the third instance attribute (`iAdj`: ground
  height, placement) that only they need. Which step: NOT known.

**Round 2** (`src/diag.ts`, header "scenery test 2"; Forest and Futuristic on Ultra Low)
1. The picture with the vertex shader changed one step at a time, 13 variants: as shipped; ground height 0;
   height without the two tapers; height limited to ±500 m; third instance attribute not read; no sway/rotor;
   no bending; no turn; no scale; no cloud shade; never left out; not left out for being beyond the fold; all
   the simplifications together. Share of the picture changed, with the map when it is above 5 %. A variant
   that does not compile says so in the report.
2. The vertex shader's own numbers, read back by transform feedback for the first vertex of up to four
   objects of up to three kinds: the three instance attributes as the shader sees them beside what the game
   put in the buffer, then distance, hide, ground height, edge, extent, road height, the two tapers, bend
   angle, base height, world position and clip position. This part runs second, so that a driver taking it
   badly cannot cost the pictures.
- Reference (software GPU, 825x360): `review/v3/scenery_test_reference.txt`. As shipped 29.3 % (Forest) and
  41.6 % (Futuristic); every variant within 0.3 points except "no scale" (27.2 %, 37.9 %: objects are smaller);
  every "shader" row equal to its "given" row.
- For it: `Program` takes a list of transform-feedback outputs; `Mesh.drawInstancePoints`; `Scenery.debug`
  is now `{ prog, onRange }` (a replacement program for objects, a call per near range). Off unless the test
  turns them on; the shaders it makes are kept out of the game's compile-time list.
- Checked: `tests/diag.mjs` (26 variant pictures all show scenery, 17 shader rows equal the given rows, no
  errors, the game carries on afterwards); `tests/smaaopt.mjs` against v3.10.2: Low, High, Admiral, Commodore
  0 pixels differ; `tests/flow.mjs` passes; `test:gen` passes; `test:sim` has its one known failure
  (Roadworks d1 bot, see "Known issues").
- Not checked: whether transform feedback works on that phone. If it does not, the report says so and part 1
  still stands.

## v3.10.3 (2026-11-20) — a diagnostic build: the scenery test (on `v3`, not for release)
User, with a benchmark report of v3.10.2 from his Xiaomi 23129RN51X (settings Ultra Low, pacing on): "I also
noticed a bug on that xiaomi where the trees and buildings aren't shown".

**The report** (GPU "PowerVR SGX Doma", 2 GB, 1650x720 at pixel ratio 2, about 90 Hz, Edge)
- Ultra Low, drawn at 593x270: Forest 20.3 fps (33.1 ms, CPU 12.4), Mountains 22.4 (27.3, 9.9), Night 19.6
  (31.6, 11.4), Futuristic 16.6 (40.9, 12.6); average 19.7 fps, 33.2 ms, CPU 11.6 ms. The pacer sat on every
  4th refresh. Low: 13.1 fps, 56.0 ms. Commodore 4.6 fps, High 2.7, Admiral 3.0, Psycho 2.1 (MSAA resolve 270
  to 480 ms, ambient occlusion 140 to 350 ms a frame there).
- A steady 30 fps on a 90 Hz screen needs a frame well under 33 ms: Ultra Low does not reach it on any of the
  four tracks, and these figures are WITHOUT the roadside objects, which this phone did not draw.
- In `docs/performance.md` under "Other devices", by hand, with both caveats; not in `benchmarks.json`.

**The missing trees and buildings**
- Not reproduced: Ultra Low and Low at that screen size on the software GPU show them.
- What the code says: trees, buildings and the rest of the roadside are one shader program ('objects'), drawn
  as instances. It is the only thing in the frame that draws a RANGE of instances starting part-way into an
  instance buffer, done by pointing the instance attributes further into the buffer before each draw
  (`Mesh.drawInstances`). Traffic, cones and the backdrop mountains use the same program from instance 0.
- My suspicion, NOT confirmed: that phone's driver does not honour the moved pointers. Other candidates: the
  change-over blend's discard, something in the fragment shader, something in the vertex shader.
- Rather than guess, v3.10.3 has a test the phone can run: Settings, Benchmark, "Scenery test" (`src/diag.ts`).
  1. Eight instanced squares drawn as ranges, by moved pointers and by copying the range to a buffer of its
     own, away from the game's shaders: which instance lands where.
  2. One frozen moment of Forest and Futuristic on Ultra Low and Low, drawn seven ways (as shipped; no
     change-over blend; plain-colour fragment shader; every instance from the first; ranges copied; two
     combinations): the share of the picture the roadside objects change against the same frame without
     them, with a 48x12 character map of where, the draw calls, the instance count and any GL error.
  - Reference, software GPU at 825x360: as shipped 29.3 % (Forest, Ultra Low), 42.0 % (Forest, Low), 41.7 %
    (Futuristic, Ultra Low), 42.5 % (Futuristic, Low); all seven ways within 0.4 points of each other; all
    seven instance cases right.
- For it: `Mesh.rangeMode` ('offset' as before, or 'copy': a second vertex array and a small buffer per mesh),
  `Scenery.debug` (flat, all), `Renderer.skipScenery`. All off unless the test turns them on, and it turns them
  off again (`tests/diag.mjs`).

## A report from someone else's phone: the graphics context was lost (2026-11-20; no change to the game)
User: a benchmark report of v3.10.2 from "an old a53 (I think?)", whose owner said only the first track of the
benchmark worked and the others showed a black or a white screen; and his own run on a Xiaomi 23129RN51X had a
picture throughout but was slow (no report of that one sent). His question: is it worth making the game run
well on such phones? Answered with an opinion; nothing built, waiting for his decision.

What the report shows:
- The WebGL context was lost during the run. GPU, WebGL version and max MSAA are all "null" (a lost context
  answers every query with null); from the second case on the frame cost is 1 to 3 ms with every GPU stage at
  0.00, and all 25 shader programs "compiled" in 0.00 s. Forest/High warmed up for 6.6 s where every other case
  took 1.5 s: that is where it went, as the benchmark stepped from Low to High.
- One row is real: Forest on Low, 832x330, 26.6 fps, frame cost 28.7 ms, CPU 9.3 ms, four stalls up to 150 ms.
  The other 19 rows (60 fps each) are a dead canvas being timed. Not added to `docs/perf/benchmarks.json`.
- The phone's settings were Commodore, chosen by hand (a touch device starts on Ultra Low).
- 4 threads, 4 GB, 1080x2400 at pixel ratio 2.625. The model cannot be told from the report.

Found in the game (not fixed):
- Nothing listens for `webglcontextlost`: the game carries on with a dead canvas, and the benchmark prints
  frame rates for it without a word. A fault in the benchmark's honesty, whatever is decided about slow phones.
- The fixed suite walks every device through Psycho, and does not include Ultra Low, the preset meant for such
  phones.

## Release: `main` moved to v3.10.2 (2026-11-19, user: "smaa in commodore and v3.10.1 on main, go")
- He named v3.10.1; what went to `main` is v3.10.2, which is v3.10.1 with one value changed (below), because a
  build that differs gets its own number. Said to him.
- Since v3.9.4 on `main`: the SMAA option (v3.10.0), the Stiletto's louvres (v3.10.1), SMAA in Commodore
  (v3.10.2).
- Measured before the release: v3.10.0 on the PC in Firefox with and without SMAA; v3.10.1 on the phone with and
  without it. NOT measured: v3.10.2 itself on any device; the PC in Edge since v3.9.1; the laptop since v3.9.x.
- Tag and GitHub release are the user's to make (tag pushes are refused from this session).
- Open: pacing together with dynamic resolution; pacing in a second browser; default preset and pacing default
  for phones; the model change-over blend's cost on Forest; the stalls left on the phone; whether Admiral's
  Forest (236 fps without SMAA) deserves a look.

## v3.10.2 (2026-11-19) — SMAA on in the Commodore preset
User: "smaa in commodore".
- `QUALITY`: Commodore `smaa: true`. The other seven presets stay without it (`tests/smaaopt.mjs` checks both).
- This is exactly the setting he measured on the phone as "Yours: Commodore (custom) [smaa false>true]" in
  v3.10.1: 59.0 fps against 59.2 without, 8.24 against 7.31 ms, two 33 ms frames against none, one run.
- Consequences:
  - His phone's stored settings (Commodore with SMAA on by hand) now equal the stock preset, so the name loses
    its "(custom)" and the benchmark no longer runs a separate "Yours" case for it.
  - Commodore on the PC gets SMAA too. Not measured; from the Admiral figures (0.2 to 0.3 ms at 3440x1440, less
    at Commodore's 80 %) it should stay inside 240 fps: its frame cost was 3.08 ms of 4.16.
  - From here on, Commodore rows in the benchmark and on the performance page include SMAA. The page says so
    where the older rows stand.
  - Anyone who wants the old Commodore: Graphics options, Anti-aliasing (SMAA), Off.
- With SMAA switched off, Commodore's frame is pixel for pixel the v3.10.1 frame, and so are High's and
  Admiral's (same test, against the v3.10.1 build). Against v3.9.4 a few hundred pixels differ on all three:
  the louvres. My first run of the test still compared with v3.9.4 and failed on exactly that.

## v3.10.1 on the phone (2026-11-19; no new build)
User, with a benchmark report of v3.10.1 from the phone (Mi Browser, Commodore with SMAA on as his settings,
pacing on): "Seems fine now as far as those artefacts are concerned". So the louvres were the artefact, or at
least nothing else on the car bothers him now.

- Commodore against Commodore with SMAA: 59.2 against 59.0 fps, every 2nd refresh on all four tracks both ways.
  Frame cost 7.31 against 8.24 ms (+0.93; per track +0.82, +1.34, +2.12, -0.58). Stalls 0 against 2 (one 33 ms
  frame each on Forest and Futuristic).
- How far to trust the +0.93 ms: not far. Stock Commodore read 8.71 ms in v3.9.3 and 7.31 ms now, High 10.48
  and 12.37, with nothing changed in how those presets draw (SMAA off is pixel for pixel v3.9.4). The phone
  moves by a millisecond or two between runs. One run supports "about a millisecond, and 60 fps holds".
- The stage line is useless on this phone: without GPU timers almost every stage reads 0.00 (SMAA 0.09, 0.08,
  0.00, 0.01), as in every earlier phone report.
- Its shaders compile on the phone's Mali driver (the last of yesterday's unknowns): weights 37 ms, blend 8,
  edges 3.
- The rest of the run, against v3.9.3: Low 119.9 (119.6), High 44.5 (46.5), Admiral 44.1 (44.8), Psycho 33.2
  (35.0); stalls High 2, Admiral 3, Psycho 1 (was 0, 1, 2).
- `docs/performance.md`: the SMAA section has a phone table; the phone charts, tables, their descriptions and
  the wording around them now show v3.10.1 (the "presets today" section follows the latest run by design).
- Not decided: whether SMAA goes into any preset. Not measured: SMAA on the phone more than once, or with any
  other preset; Edge; the laptop.

## v3.10.1 (2026-11-19) — SMAA measured on the PC; the Stiletto's louvres (on `v3`)
User, with two benchmark reports of v3.10.0 (PC, Firefox, Admiral with SMAA on as his settings; frame pacing
off and on): "there's some minor artefacting on the player car with smaa on but other than that the image is
better than with aa off".

**What SMAA costs on the PC** (RX 9070, 3440x1440, Firefox; in `docs/performance.md`, new section and table)
- Frame cost, Admiral against Admiral with SMAA, mean of the two runs: Forest 5.05 to 5.28 ms, Mountains 3.95 to
  4.20, Night 3.78 to 4.00, Futuristic 4.67 to 4.79; average +0.21 ms. The stage timed on its own: 0.32, 0.25,
  0.21, 0.31 ms; average 0.27 ms. My estimate had been 0.4 to 0.6 ms.
- fps without pacing: Forest 236.0 to 226.8, the other three 239.8 both ways. With pacing: Forest 239.0 to 129.0
  (the pacer went to every 2nd refresh after 13 % late frames, and the benchmark holds the rhythm), Futuristic
  239.2 to 236.4, the other two unchanged within 0.2.
- Its shaders compile on Windows through Direct3D (one of the things not known yesterday): weights 103 and
  106 ms, edges 21 and 20, blend 17.
- Firefox has no GPU timers: all of this is with the GPU made to finish, and single figures move by 0.1 ms
  between runs (Futuristic's cost difference was -0.11 ms in one run, +0.35 in the other).
- Still not measured: the phone, the laptop, Edge.

**The artefact on the car**
- Drew the Stiletto at 3440x1440, Admiral, with the option off and on, two consecutive frames (software GPU).
  One place stands out: the six louvres over the engine. Without anti-aliasing they are broken dark lines one
  pixel high that differ from frame to frame; with SMAA the same lines are drawn out into soft streaks.
- Cause, in the model and older than SMAA: the slats sat at fixed heights (0.99 m, then 4 mm lower each),
  while the engine cover rises to 1.00 m at z = -1.75 and falls again. Slat tops against the cover along the
  middle: +11.7, +3.0, -5.5, -4.0, -2.7, -1.3 mm. Four of six were sunk, and came through only towards the sides
  where the cover curves down, as slivers of a few millimetres; a pixel is about 5 to 6 mm there.
- Fix: each slat follows the cover and stands 14 mm proud of it (`carmodel.ts`). This changes how the car looks
  at every setting: six even dark bars where there was one bar and some dashes.
- After (`review/v3/louvres_before_after.png`, 3440x1440, Admiral, software GPU): from the chase camera the six
  slats overlap into one dark slatted panel under the rear window, steady between the two modes; in the
  showroom they read as six separate slats. The other two cars were drawn the same way, off and on: nothing
  of the kind on them.
- Whether this is the artefact the user meant is NOT confirmed: he did not say where on the car it was, and I
  cannot see the game in motion. The tail lamps, their surround, the light strip, the wing and the exhausts
  were clean in the same frames.

## v3.10.0 (2026-11-19) — SMAA anti-aliasing, as an option (on `v3`)
User, on the two questions put to him: the MIT-licensed lookup tables are "acceptable and until we know how it
affects performance let's keep it as an option".

**What was added**
- Graphics options → "Anti-aliasing (SMAA)", On / Off. Off in every preset, so no preset's picture or cost
  changes: with it off the frame is pixel for pixel the v3.9.4 frame (High, Admiral, Commodore;
  `tests/smaaopt.mjs`). It can be on together with MSAA.
- `src/render/smaa.ts`: SMAA 1x, "high" settings (edge threshold 0.1, search 16 steps, diagonals 8, corner
  rounding 25). Three full-screen passes on the finished 3D picture, before bloom and tone mapping: find edges,
  work out how much of each edge pixel the true edge covers, mix each edge pixel with its neighbour.
- It runs at the render resolution (so before the picture is scaled up), on both halves of a split screen, and
  in the car showroom.
- Its three shader programs and three screen-sized textures (14 bytes a pixel together: 69 MB at 3440x1440)
  exist only while the option is on. Start-up for everyone else compiles nothing more.
- The benchmark needs no change to measure it: with the option on, the report has a row "Yours: <preset>
  (custom)" beside the stock preset on every track, a stage line "anti-aliasing (SMAA)", and its three
  programs in the compile-time list.

**Third-party code: what was taken, and under what terms** (`third_party/smaa/`)
- From https://github.com/iryoku/smaa (MIT; Copyright 2013 Jimenez, Echevarria, Masia, Navarro, Gutierrez),
  downloaded 2026-11-18: the two lookup tables (`AreaTex.h`, `SearchTex.h`), and `SMAA.hlsl`, from which the
  three shaders were ported by hand. The user was asked about the tables only; the shader port comes from the
  same project under the same licence. Said to him in the hand-over.
- The tables are in `src/render/smaatables.ts`, same bytes, packed (179 KB to 38 KB of text) by
  `tools/smaatables.py`; `src/render/inflate.ts` is a small inflater written for this (no library);
  `tests/smaatables.test.ts`: both tables unpack to the SHA-256 of the originals; the inflater equals zlib on
  564 streams of every block type.
- MIT inside a GPL-3.0 project is allowed; the licence text is in the repo, the README names it, and the built
  page carries a credit line. The README's licence section now also names the three fonts built into the page
  (SIL OFL 1.1), which it had not.
- The game file grew from 463 to 506 KB.

**Where the port differs from the upstream shader, and why** (all in the header of `smaa.ts`)
1. The picture is still scene light with a wide range where the pass runs. Edges are looked for in the picture
   as the screen will show it (exposure, tone curve, square root). The mix is done in the light the screen
   will give out (through the tone curve, mix, back). Measured (below): mixing in plain scene light, as
   upstream would here, gains nothing on Futuristic and loses on Night.
2. Bloom is taken from the picture before the pass, so the pass cannot change the glow of bright things.
3. Coordinates run in texture space and the working textures are cleared whole: the picture may fill only a
   corner of its texture (render resolution below 100 %). Test: 60 %, 100 %, 60 % again gives the first 60 %
   picture back exactly.
4. Upstream's colour edge detection compares the centre pixel with the pixel two to the left for its
   local-contrast test; the luma variant and the paper compare the left pixel with ITS left. The port does the
   latter. 155 of 64,000 texels of the test picture differ for it.
5. A pixel's own edges are read exactly (`texelFetch`), the weights from a nearest-filtered texture. See the
   bug below.
6. Loops are bounded `for` loops, offsets are added by hand, every read names its mip level.

**A bug found by the tests, in upstream as much as in the first port**
- On the software GPU the tests use, one pixel in eight along a shallow edge came out wrong (a straight edge
  rising 1 in 8: 61 where its neighbours gave 76 and 145, ideal 124). Cause: upstream reads a pixel's own edge
  flags through a bilinear sampler at the texel centre and tests them against zero. A GPU that filters with
  more than the usual 8 bits lets a trace of the neighbour's edge through; a pixel with no edge then does the
  whole look-up and its weight halves the blend of the pixel beside it. 1,323 of 64,000 texels of the test
  picture had such a weight.
- Whether any of the user's GPUs filters that finely is NOT known. The exact read costs nothing and removes
  the question.

**Checked**
- `tests/smaaref.mjs`, the port against the upstream shader (compiled through its own GLSL path), same input,
  texel by texel, twice (picture filling the texture; in a corner of a larger one): edges 0 texels differ (with
  item 4 applied to upstream too), weights 0 differ (with item 5 applied to upstream too), blend at most 17
  texels differ by 1/255.
- Same test, does it do the job: clean shapes at one sample per pixel against 64 samples per pixel, mean error
  on the edge pixels in levels of 255: one long edge rising 1 in 25: 42.0 to 5.5; 1 in 8: 33.4 to 7.4; 1 in 3:
  40.6 to 21.8; bars near level or upright 19.6 to 8.0; near a diagonal 16.2 to 8.0; any angle 19.9 to 8.6;
  discs 19.3 to 12.3. What is left on a straight edge is where within the pixel the true edge runs, which a
  method that sees only finished pixels cannot know, and that range grows with the slope. The test's pass marks
  were set just above these figures after seeing them (my first guesses, 0.1 to 0.4 of the error left, were
  too strict for the steeper edges).
- `tests/smaapic.mjs`, in the game: one frozen moment on each benchmark track, bloom and sharpening off, at
  960x540, against the same frame at 3840x2160 averaged down. Mean error in levels of 255 on the pixels with
  an edge in them:

  | | none | SMAA | SMAA, plain mix | MSAA 4x | MSAA 4x + SMAA |
  |---|---|---|---|---|---|
  | Forest | 3.57 | 2.93 | 3.10 | 2.64 | 2.70 |
  | Mountains | 5.77 | 4.47 | 4.77 | 3.82 | 3.83 |
  | Night | 4.54 | 3.93 | 4.15 | 3.51 | 3.35 |
  | Futuristic | 5.05 | 3.91 | 5.07 | 3.67 | 4.30 |

  - SMAA gets 59 to 83 % of the way from no anti-aliasing to MSAA 4x by this measure. On the pixels it changed,
    the error fell to 75 % of what it was (average of the four); 55 to 63 % of those pixels came closer, 34 to
    41 % moved away (thin and distant things, where a guess from the finished picture is often wrong).
  - Away from edges the error rose by 0.06 to 0.20 levels: a slight softening of fine texture.
  - On top of MSAA 4x it helped on Night only and hurt on Futuristic. So: one or the other.
  - To the eye, in the frames (`review/v3/smaa_*.png`): MSAA 4x leaves bright edges stepped on Futuristic (its
    samples are averaged in scene light); SMAA smooths them.
  - At 480x270 the same order (edge-pixel error: Forest 6.03 none, 5.18 SMAA, 4.26 MSAA 4x; Futuristic 9.22,
    7.46, 6.66). The pass marks 3 to 8 % of the pixels as edges at 960x540 (5 to 14 % at 480x270).
- `tests/smaaopt.mjs`: on, in five arrangements (Admiral; High with MSAA 4x; Commodore at 80 %; Ultra Low
  without bloom; Admiral with two players) and in the showroom: no GL error, no page error, 2 to 11 % of the
  pixels change, turning it off gives the first picture back exactly. The option row turns it on, marks it,
  and it survives a reload.
- `tests/benchrun.mjs` with SMAA=1 (cut-down suite): the report carries the row "Yours: Low (custom)", the
  diff "smaa false>true", "SMAA on" in the presets list and the three programs' compile times. Its stage line
  read 0.00 there: the cut-down run measures one frame at 2 fps and that frame's timer result had not come
  back. `tests/smaastage.mjs` therefore checks the stage timing on its own, six frames in each of the
  profiler's two modes: the stage gets a time with the option on (GPU timers 23.4 ms, forced finish 24.9 ms
  on the software GPU at 384x216) and is absent with it off.
  - For scale only: on that software GPU the pass costs about what the whole post stage does (22.7 ms). That
    ratio need not hold on a real GPU.
- The option's help text. My second wording (323 characters) made the help box above the list a line taller;
  the rows then moved under the mouse, the focus moved, the text changed, and the page flickered for ever
  (the test's hover timed out: that is how it was found). The box holds about 190 characters; the text is
  179 now, the limit is written beside the texts, and the test compares the box height with the other rows'.

**NOT measured or seen**
- What it costs on any real GPU. My estimate of 0.4 to 0.6 ms a frame on the PC at 3440x1440 is an estimate;
  Admiral's average frame cost there was 4.19 ms in Edge (v3.9.1) against 4.17 ms for 240 fps, so any cost at
  all can show. On the phone, Commodore holds 60 fps at 8.5 to 9.6 ms and the step down to 40 fps came at
  about 10 ms (v3.9.3), so it has little room either.
- Whether its shaders compile, and how fast, on Windows through Direct3D and on the phone's Mali driver. They
  compile on Chromium's software GPU (ANGLE, the same shader translator as Chrome and Edge).
- Nobody has looked at it on a real screen in motion. Morphological anti-aliasing can shimmer on thin moving
  things; still frames do not show that.
- The picture error figures are from four still frames at 960x540.

**Also**
- README: the stale known issue "Graphics options only offer the values the presets use" removed (free values
  have been there since v3.6.0).
- `Target` (gl.ts) takes a filter and can be disposed; `Post.run` takes the picture to bloom from.

## Release: `main` moved to v3.9.4 (2026-11-18, user: "3.9.4 fixed the audio problem and everything seems to work, let's move it to main")
- The crackle on the phone with camera shake on is gone in v3.9.4 (user). Which of the three sound changes did
  it is not known, and neither is why shake mattered.
- The released build is the one delivered and tried by the user (build 2026-11-18), not rebuilt.
- Measured before this release: v3.9.3 on the phone (Mi Browser) and on the PC in Firefox. Not measured: v3.9.4
  itself (it differs from v3.9.3 in the sound code and the key hints only), and the PC in Edge since v3.9.1.
- Open: pacing together with dynamic resolution; pacing in a second browser; default preset and pacing default
  for phones; the model change-over blend's cost on Forest; Psycho's remaining stalls on the phone; SMAA (next
  by the plan, with the two decisions put to the user on 2026-11-18 still to be answered: its cost against
  Admiral's 240 fps, and the MIT-licensed lookup tables).

## v3.9.4 (2026-11-18) — sturdier engine sound, key hints that say what they mean (on `v3`)
**v3.9.3 measured** (both runs in `docs/perf/benchmarks.json`; page and charts updated).
- Xiaomi 17T, Mi Browser, pacing on, against v3.9.1: High 46.5 fps (39.7), frame cost 10.5 ms (13.8); Psycho
  35.0 (31.2), 17.0 ms (22.0); Admiral 44.8 (44.4), 12.2 ms (13.2); Commodore 59.8 (59.0); Low 119.6. Stalls
  0 / 0 / 1 / 2 / 0 (Low, High, Admiral, Psycho, Commodore); Psycho's two were 133 and 125 ms long.
- My prediction (High at 60 fps "on at least some tracks") held on one: Mountains 60.0. Forest 43.8, Night 42.2,
  Futuristic 40.0: High settles on every 2nd refresh and then steps to every 3rd ("late 11-18 %") at a frame
  cost of 11-12 ms. Commodore holds every 2nd at 8.5-10 ms. So on this phone the limit for every 2nd refresh is
  about 10 ms of measured frame cost, not the 16.4 ms the refresh interval suggests.
- PC, Firefox, pacing on: Low, High, Commodore 239.8 fps, Admiral 239.7, Psycho 205.7 (Forest held at 120 by
  pacing). Frame costs as in Firefox v3.7.0 (High 3.34 ms both). No Edge run on v3.9.3.

**Reported by the user**
1. Phone: the sound crackles when camera shake is on and many opponents are in view (race start); fine with
   shake off.
   - Camera shake is one line in the renderer (it moves the camera); nothing in the sound code reads it or
     anything derived from it. So the link is indirect, through load, and I have not found which load. NOT
     explained. A guess only: a picture that changes in every tile every frame costs the phone more than a
     still one on the grid.
   - Changed, because each makes crackling less likely whatever the trigger:
     - the sound buffer on touch-first devices is 'balanced', not the smallest ('interactive');
     - the sound is updated about 30 times a second, not once per drawn frame: scheduled parameter changes at a
       race start fall from 7,800 to 1,800 a second at 120 fps (`tests/audiorate.mjs`, old build and new);
     - a rival's engine voice keeps its car while that car is among the nearest six, and is silent for 60 ms when
       it does change. Before, voice i played the i-th nearest rival, and in the first 12 s of a race that order
       changed 10 times, each time jumping a voice to another car's pitch and side (same test). The 60 ms
       hand-over itself did not occur in the test run, so it is untested.
   - Not verifiable here: whether the crackle is gone on the phone.
2. PC: "A" and "B" do nothing in the menus although the hints say "ENTER / A", "ESC / B". The user meant the
   keyboard's A and B; the hints meant gamepad buttons. The gamepad half of a hint is now shown only while a
   gamepad is connected, as "PAD A" / "PAD B" (`hint()` in screens.ts, `body.haspad`). `tests/padhint.mjs`:
   without a pad the hints read "ENTER CONFIRM · ESC BACK"; with one, PAD B goes back and PAD A confirms;
   keyboard A and B still do nothing in a menu.

## v3.9.3 (2026-11-18) — the sky picture for reflections is drawn first: the phone's v3.7.0 cost found (on `v3`)
**v3.9.2 picture cost test on the Xiaomi 17T, Mi Browser** (frame cost in ms; three rounds in order, median):

| High | Forest | Mountains |
|---|---|---|
| as released | 14.25, 16.75, 16.85 (16.75) | 12.65, 14.95, 16.45 (14.95) |
| off-screen pictures first | 11.25, 12.25, 13.35 (12.25) | 8.65, 9.35, 11.15 (9.35) |
| no sky reflections | 13.15, 15.05, 14.15 (14.15) | 9.75, 10.15, 9.45 (9.75) |
| no cloud shadows | 14.95, 12.95, 16.05 (14.95) | 13.05, 16.55, 16.15 (16.15) |
| no haze | 13.75, 16.75, 16.25 (16.25) | 13.05, 17.55, 17.05 (17.05) |
| no terrain variation | 15.05, 17.75, 17.45 (17.45) | 13.55, 16.55, 14.55 (14.55) |
| no model blend | 12.95, 14.35, 13.55 (13.55) | 11.85, 16.25, 16.25 (16.25) |
| all five off | 12.25, 14.05, 14.05 (14.05) | 9.85, 10.75, 11.15 (10.75) |

Commodore: as released 8.95 / 7.35, off-screen pictures first 9.45 / 7.05 (spread 0.6-1.9): no difference.
- "Off-screen pictures first" is lower than "as released" in every round on both tracks: by 3.0, 4.5 and 3.5 ms
  on Forest, by 4.0, 5.6 and 5.3 on Mountains; the two ranges do not overlap. The suspicion of v3.9.2 holds.
- It is also no worse than having no sky picture at all (lower in five rounds of six), so the sky picture
  itself costs nothing measurable; the detour out of the main picture was the cost.
- Every round's first figure is the lowest: the phone slows down as the test goes on. That is what the
  interleaving was for.
- Cloud shadows, haze, terrain variation: changes of both signs, inside the spread. Not resolved by this test.
- Model blend: 3.2 ms lower on Forest (lower in each round) but 1.3 higher on Mountains, and "all five off" on
  Forest (14.05) is no better than "no model blend" alone (13.55). Not additive, so not trusted. Open; Forest is
  where it would show, since the blend draws both tree models over the last 25 m.
- On Forest "all five off" (14.05) is higher than "off-screen pictures first" (12.25). Unexplained: either
  noise of that size on Forest, or clearing the main picture a second time helps by itself.
- **v3.9.3: `FX_DEFAULT.env` is 'first'.** Same picture pixel for pixel (`tests/picorder.mjs`: High, Admiral,
  Commodore, and Admiral with a split screen). The test's button is off the benchmark screen; the harness stays
  (`Benchmark` with `probe`, `tests/proberun.mjs`), its baseline now "as shipped" with "sky picture in
  mid-frame" as a variant.
- **Not measured:** frame rates on v3.9.3 on any device. Expected on the phone, from the cost alone: High with
  pacing on every 2nd refresh (60 fps) instead of every 3rd on at least some tracks. On the PC nothing should
  change. `docs/performance.md` has the test's result under "What got slower, and why"; its tables wait for a
  benchmark.

## v3.9.2 (2026-11-18) — picture cost test: what each v3.7.0 effect costs on a device (on `v3`; measured since: see v3.9.3)
User chose to find the phone's v3.7.0 cost before SMAA.
- Read from the code before measuring anything: since v3.7.0 the small sky picture the cars reflect has been
  drawn in the middle of the main picture (just before the cars), which means leaving the main render target and
  coming back. A phone's GPU draws tile by tile and has to write the whole main picture out to memory and read it
  back when that happens, anti-aliasing samples included. That fits what was measured (High, with 4x MSAA,
  +3.3 ms; Admiral, without, +1.1 ms; Low, which has no sky picture, unchanged), but it is a suspicion, not a
  finding. The sun-shadow maps have always been drawn after the main picture was cleared, the same pattern.
- `Renderer.pic` (type `PictureFx`): switches for the sky picture's place in the frame ('mid' as released,
  'first', 'off'), cloud shadows, haze, the terrain's second texture copy, the model change-over blend. With
  'first' the sky picture is drawn before the shadow maps and the main picture is cleared again after the
  off-screen passes (single view only). **Default unchanged: the build draws as v3.9.1 does.** The shaders gained
  two branches so that a switched-off effect is really skipped (haze, terrain copy); no change to the picture.
  Baked model shading has no switch: it is vertex colours, nothing per frame.
- Picture cost test (button on the benchmark screen; `Benchmark` with `probe`): Forest and Mountains on High with
  eight variants (as released, off-screen pictures first, each of five effects off, all five off) and on
  Commodore with two (as released, off-screen pictures first: Commodore has no sky picture but has shadow maps).
  Each case 1 s warm-up and 2 s with the GPU made to finish; three rounds interleaved, every second in reverse
  order, because the phone's frame cost wanders by a millisecond or more between runs; the report gives the
  median, the lowest and highest and the change against "as released". About 3.5 minutes. Pacing is ignored
  during it. A diagnostic: to be removed once it has done its job.
- `tests/picorder.mjs`: 'mid' and 'first' give the same picture pixel for pixel on High, Admiral and Commodore
  (and the check can fail: switching the sky picture off changes 1,600-1,850 pixels). `tests/proberun.mjs`: the
  test end to end, cut down. `tests/benchrun.mjs` passes after the report's device block was shared.
- `tools/perfadd.py` adds reports to the data file (re-adding all 37 reproduces it byte for byte);
  `tools/perfcharts.py` now also writes the page's tables (it reproduced the hand-made ones and added the
  v3.9.0 phone row I had left out).

## Release: `main` moved to v3.9.1 (2026-11-17, user: "go")
The released build is the one benchmarked on the PC and the phone (build 2026-11-17 18:21 UTC), not rebuilt.
Frame pacing ships as an option, off by default; touch devices still start on Ultra Low.
Open after this release: what v3.7.0's picture batch costs on the phone and which part of it; pacing together
with dynamic resolution; pacing in a second browser; default preset and pacing default for phones.

## Performance history page (2026-11-17, on `v3`, no new build)
**v3.9.1 measured on the PC (RX 9070, Edge, 3440x1440, 240 Hz), pacing off:** Low, High and Commodore 239.8 fps,
Admiral 239.6 (frame cost 4.19 ms; v3.7.0: 4.25), Psycho 213.8 (5.42 ms; v3.7.0: 5.40). Shader compile 1.8 s,
start-up 2.1 s. So v3.8.0-v3.9.1 changed nothing measurable on the PC; the check asked for before `main` is done.
- The same PC with pacing on: Psycho on Forest and Futuristic settles on every 2nd refresh, a flat 119.9 fps
  (1 % low 117, longest frame 8.5 ms) where it ran 187-196 fps unpaced (1 % low 80, longest frame 12.6 ms).
  Average over the four tracks 179.4 against 213.8. The other presets are untouched by it.
- User asked for charts and tables for GitHub on how performance changed. All 37 reports attached during the
  project (v3.1.0 to v3.9.1; PC in Edge and Firefox, the 17T in Mi Browser and Brave, the laptop, the old phone)
  are reduced to `docs/perf/benchmarks.json`. `tools/perfcharts.py` draws four charts from it as SVG, light and
  dark (`docs/perf/`): PC frame cost by version, shader compile time by version, phone stalls before and after
  pacing, phone frame rate per preset. `docs/performance.md` holds the charts, the tables and what changed in
  each version; linked from the README. Nothing older than v3.1.0 is in it: the fixed suite starts there.
- **Found while putting the history together: v3.7.0's picture batch is not cheap on the phone.** Without
  pacing, High cost 11.5 ms in v3.5.4 and 14.8 ms in v3.7.1 (52.9 to 43.3 fps), Psycho 18.3 to 21.1 ms. On the PC
  it was 0.3-0.4 ms. Single runs, but the v3.8.x runs without pacing agree (High 15.5-16.5 ms). Which of the six
  changes is responsible is not measured. Open.

## State after v3.9.1 (2026-11-17): phone measured, PC not (PC measured since: see above)
**v3.9.1 measured on the Xiaomi 17T, Mi Browser, pacing on (each case measured once its rhythm had settled):**

| | fps (Forest / Mountains / Night / Futuristic) | average | hitches | settled rhythm |
|---|---|---|---|---|
| Low | 119.3 / 119.7 / 119.3 / 119.5 | 119.4 | 0 | every refresh |
| High | 40.8 / 40.0 / 39.4 / 38.4 | 39.7 | 1 / 0 / 0 / 0 | every 3rd |
| Psycho | 29.8 / 30.0 / 39.6 / 25.4 | 31.2 | 0 | every 4th (3rd on Night, 4th-5th on Futuristic) |
| Admiral | 40.2 / 40.0 / 57.8 / 39.6 | 44.4 | 1 / 0 / 1 / 0 | every 3rd (2nd on Night) |
| Commodore | 59.0 / 58.4 / 59.9 / 58.8 | 59.0 | 1 / 0 / 0 / 1 | every 2nd |

- The prediction for Commodore (60 fps on all four tracks) held. Its frame cost is 8.4 ms, 0.2 ms over one refresh.
- The early attempt after a remembered start works as meant: Night on Admiral and on Psycho found their own
  faster rhythm; Commodore tries every refresh at 1.5 s on each track, fails, and stays on every 2nd.
- Against the morning (v3.7.1, same phone and browser, no pacing): High 43.3 fps with 32-42 hitches per run and
  worst frames of 92-100 ms; Admiral 47.4 with 34-48 and 67-108 ms. Now worst frames are 33-50 ms (High),
  33-58 ms (Admiral), 25-42 ms (Commodore).
- **Not measured since v3.7.1: the PC.** v3.8.0-v3.9.1 touched the frame loop (the pacing check runs at every
  refresh even when pacing is off), the HUD strip and the preset list. Nothing there should cost anything at
  240 Hz, but no run says so yet. Wanted before `main` moves.
- Open, none of it measured: pacing together with dynamic resolution (the benchmark switches the scaler off; in
  play the scaler aims at every refresh while pacing holds every 2nd or 3rd, so it will sit at the preset's
  floor, and the two may push each other back and forth); pacing in Brave (60 Hz) with the current rule; whether
  pacing should be on by default on phones; the default preset for touch devices (still Ultra Low).

## v3.9.1 (2026-11-17) — benchmark: five presets, measured once the pacing rhythm has settled (on `v3`)
User: the opponent marks on the phone are the right colour now (v3.9.0 fix confirmed). Asked for the benchmark
to run Low, High, Psycho, Admiral and Commodore.

**v3.9.0 measured on the Xiaomi 17T, Mi Browser, pacing on:**

| | fps | frame cost | hitches (per 5 s run) | rhythm |
|---|---|---|---|---|
| Low | 119.5 | 6.7 ms | 0 | every refresh |
| Commodore | 40.0 | 8.5 ms (7.2-9.5) | 0 | every 3rd, "remembered" from the first second |
| High | 38.3 | 17.0 ms | 3 / 1 / 0 / 0 | every 3rd, 4th at times on Mountains and Futuristic |
| Psycho | 24.6 | 25.6 ms | 3 / 0 / 0 / 0 | every 5th after Forest |

- Commodore costs half of what High does, and every one of its frames came 25.0-25.1 ms after the last: as even
  as it gets. But 8.5 ms fits two refreshes (16.4 ms) twice over, so 40 fps is not what it can do: the rhythm
  "every 3rd" was remembered from before the benchmark (the player's own races or the menus on this preset) and
  the rule waited 7 s before trying a faster one, longer than a case lasts. Same story for Psycho: Forest pushed
  it to every 5th and the three lighter tracks inherited that. Why the player's own session had settled on
  every 3rd is not known.
- Expected for Commodore, NOT measured: every 2nd refresh, 60 fps. Its cost is just over one refresh (8.2 ms).

**Changes**
- Benchmark presets: Low, High, Psycho, Admiral, Commodore (20 cases; a sixth column only for settings that
  differ from all five).
- A race that starts on a remembered rhythm tries a faster one at once (about 1.5 s in), not after 7 s. If that
  fails it is left alone for 8 s, then 16, 32.
- With pacing on, the benchmark's warm-up lasts until the rhythm has stood unchanged for 2.5 s (8 s at most), and
  no faster rhythm is tried during the 5 measured seconds (`Pacer.hold`). The report says so, and gives the time
  measuring started for each case. So the table now shows what each preset settles on for each track; the search
  is in the pacing log, not in the fps. `Pacer.settled` now means "unchanged for 2.5 s" (it also decides what is
  remembered, so a rhythm passed through on the way up is no longer stored).
- `tests/pace.test.ts`: 28 pass (remembered start: first attempt within seconds, the next not for 7 s or more).

## v3.9.0 (2026-11-17) — Commodore preset, progress strip under forced dark mode (on `v3`)
**v3.8.4 measured on the Xiaomi 17T, Mi Browser, pacing on** (pacing off for comparison: the v3.8.2 run):

| | fps on | fps off | hitches on (per 5 s run) | hitches off | rhythm |
|---|---|---|---|---|---|
| Low | 119.1 | 119.5 | 0 | 0 | every refresh |
| High | 40.0 | 42.6 | 3 / 0 / 0 / 0 | 35-47 | every 3rd |
| Admiral | 39.6 | 48.4 | 0 / 0 / 0 / 0 | 26-43 | every 3rd |
| Psycho | 29.2 | 33.6 | 7 / 0 / 0 / 1 | 5-32 | every 4th |

- The runaway to 20 fps is gone. The only hitches left are on the first track of a preset, while the rhythm is
  being found; the three tracks that start on the remembered rhythm have none (Psycho on Futuristic: one, with a
  step to every 5th refresh and back). Worst frame on those tracks 25-42 ms (High, Admiral), against 83-108 ms
  without pacing.
- The price: Admiral draws 18 % fewer frames (39.6 against 48.4), High 6 %, Psycho 13 %.
- Night on Admiral ran at every 3rd refresh because that is what the preset had settled on on Forest; alone it
  held every 2nd (60 fps) in v3.8.2. The memory is per preset, not per track, and the first attempt at a faster
  rhythm comes after 7 s, which a 5 s benchmark case never reaches. In a race it would. Not measured.
- Pacing stays off unless turned on. Whether it should be on by default on phones is for the player to say.

**Progress strip dark on the phone** (user, with pictures: white opponent marks black, gold checkpoint ticks
brown, the bar's light edge gone; fine on the PC).
- Cause: the browser's forced dark mode, which repaints light CSS backgrounds dark. Reproduced here with
  Chromium's own (`--blink-settings=forceDarkModeEnabled=true`): the same black marks and brown ticks. That the
  phone has this mode on is inferred from the match, not confirmed.
- Probed what survives it: backgrounds, gradients, inset shadows and outlines are repainted, borders greyed,
  `color-scheme` declarations made no difference with that switch; SVG fills are left alone.
- Fix: the marks, the ticks and the bar's edge are painted by small inline SVGs in the element's text colour
  (`hud.ts`, `style.css`). `tests/forcedark.mjs` captures the strip with the mode off and on; the new build looks
  the same in both.
- Not checked: other light backgrounds in menus under that mode (text is not affected by it).

**Commodore preset** (the user's own phone settings, from his screenshot): resolution 80 % (floor 60 %), pixel
ratio limit 2, no MSAA, sun shadows 1024, ambient occlusion on, bloom 3, simple sky and effects, draw distance
0.85, roadside clutter 80 %, woodland 0.6, full detail to 250 m, full terrain, 16 lamp lights, particles and
weather 0.8, resolution scaler aiming at the screen's refresh. Preset number 7 (appended, so stored preset
numbers do not shift). Name chosen by me, not by the user.
- In the benchmark suite: Low / Commodore / High / Psycho + yours, so 16 to 20 cases and about a quarter longer.
- Not measured on any real device yet. Touch devices still default to Ultra Low.

## v3.8.4 (2026-11-17) — frame pacing: frames judged against the rhythm, not the screen (on `v3`; measured since: see v3.9.0)
**v3.8.3 measured on the Xiaomi 17T, Mi Browser, pacing on (dynamic resolution now off in the player's settings):**
- Low 117.3 fps (rhythm 1). High 39.7 fps, hitches 2 / 0 / 0 / 1, started on the remembered rhythm 3 on three
  tracks: the memory does what it was for.
- **Admiral 20.0 fps on all four tracks**, rhythm 6 "remembered" 0.1-0.4 s into the very first Admiral case, so
  the 6 came from before the benchmark: the player's own races (and the menus) on Admiral. Psycho 24.9 fps:
  Forest climbed 2, 3, 4, 5 ("stall" each time) and the other three started on the remembered 5.
  v3.8.2 held Admiral at 45.6 and Psycho at 31.9, so these settings do not need rhythm 5 or 6.
- Player, after races on Admiral: "feels ok most of the time and frame pacing makes the start of the forest track
  feel better". With the log above, part of that play was probably at 20-24 fps (inferred, not seen).
- Cause, reproduced in the model before changing anything: every late callback counted, and any gap of four
  refreshes was a "stall". A browser that holds the page back while a frame is unfinished delays the callback
  after each drawn frame by that frame's whole cost, at any rhythm. A frame of 26 ms is then a "stall" every
  time, whatever N is, and attempts at a faster rhythm fail on the first such gap. Model with that browser,
  v3.8.3 rule: cost 1.8, 2.6 and 3.1 refreshes all end on N = 6 (20 fps).
- v3.8.4: a frame is judged when it is drawn, against the rhythm: late by the refreshes it comes after its turn;
  a stall is a frame four refreshes late. The refresh interval may now only fall (in that browser the callbacks
  are all late while skipping too, and an interval believed too long sent the model to N = 1 at 12 fps).
- `tests/pace.test.ts`: the strict browser added (cost 1.8-3.6 refreshes, 120 and 60 Hz): ends on N = 3, 3, 4, 5
  at 120 Hz. 28 cases pass. In the lenient browser a rhythm one step too fast is now left alone when no frame is
  more than one refresh late (model: 54 fps on frames of 17 and 25 ms where v3.8.3 chose a flat 40).
- Tests run for this build: the model, `tests/pace.mjs`, `tests/flow.mjs`. Not rerun: `tests/benchrun.mjs`
  (the report code is unchanged since v3.8.3, where it passed with `PACE=1`).

## v3.8.3 (2026-11-17) — frame pacing: a race starts on the rhythm the last one found (on `v3`; measured since: see v3.8.4)
**v3.8.2 measured on the Xiaomi 17T, Mi Browser, pacing off and on (average over four tracks):**

| | fps off | fps on | hitches off (per 5 s run) | hitches on | worst frame off | worst frame on |
|---|---|---|---|---|---|---|
| Low | 119.5 | 119.7 | 0 | 0 | 17-25 ms | 9-17 ms |
| High | 42.6 | 40.0 | 35-47 | 1-7 | 83-108 ms | 58-83 ms |
| Admiral | 48.4 | 45.6 | 26-43 | 2-14 | 58-100 ms | 58-83 ms |
| Psycho | 33.6 | 31.9 | 5-32 | 3-10 | 83-175 ms | 83-108 ms |

- Low is whole again (rhythm 1.0 in all four cases, no change logged).
- High and Admiral: 6 % fewer frames; hitches down to a twelfth (High) and a quarter (Admiral). Not zero.
- The pacing log says where the remaining ones come from. Every heavy case climbs 1 -> 2 at 2.0 s and 2 -> 3
  at 3.4 s (the warm-up ends at 1.5 s, so the climb is inside the measured 5 s), then tries the faster rhythm
  after 1-2 s and fails ("stall"). High and Admiral settle on every 3rd refresh (40 fps), Night Admiral on every
  2nd (60), Psycho on every 3rd or 4th. So most of a 5 s case is spent finding the rhythm, which a race of
  minutes does once. Not separable from this data: how many hitches remain once it has settled.
- v3.8.3: the rhythm each quality preset settled on is remembered for the session (`Game.paceMemo`,
  `Pacer.settled`, `Pacer.hint`); the next race on that preset starts there, and a faster rhythm is first tried
  after 7 s. In the benchmark the first track of each preset still climbs; the other three start settled.
- `tests/pace.test.ts`: two more cases (remembered rhythm right; remembered rhythm too slow for a light load:
  back at every refresh after 9 s). 20 pass.
- Not measured, and the benchmark cannot: play with dynamic resolution on, which is what the player has on the
  phone. There the resolution falls to the preset's floor first (High 60 %, Admiral 85 %), so the rhythm may
  well be faster than the benchmark's. Open: with pacing at every 2nd refresh the resolution scaler still aims
  at every refresh and so stays at the floor.

## v3.8.2 (2026-11-17) — frame pacing, third rule, with a log in the report (on `v3`; measured since: see v3.8.3)
**v3.8.1 measured on the Xiaomi 17T, Mi Browser, pacing off and on (average over four tracks):**

| | fps off | fps on | hitches off (per 5 s run) | hitches on | 1 % low off | 1 % low on |
|---|---|---|---|---|---|---|
| Low | 119.1 | 71.4 | 0 | 0-4 | 60-89 | 20-60 |
| High | 41.7 | 36.8 | 8-48 | 0-3 | 8-13 | 14-24 |
| Admiral | 48.4 | 36.5 | 25-51 | 0-2 | 9-17 | 16-30 |
| Psycho | 33.0 | 26.9 | 1-33 | 0 | 7-11 | 17-22 |

- The stalls go: worst frames 83-150 ms without pacing, 33-75 ms with it. That part works.
- The price is too high and Low is broken: its rhythm per case was 4.1, 2.0, 1.4, 1.1 (it should be 1), i.e.
  it started each case slow and crept back; Night Low fell from 118 back to 52 fps in the last second.
- Three faults read from the figures: (1) the rule climbs during loading and the first frames of a race;
  (2) it comes down one step per 1.5 s at best; (3) trying the faster rhythm fails although the device can hold
  it. For (3) the likely cause is the phone clocking itself down while it draws less: with pacing on, CPU work
  that does not depend on the frame rate (HUD and audio) took 0.7-0.9 ms per frame in the Low cases that ran
  slow, against 0.4 in those that ran at every refresh and in all of them without pacing. Not proven.
- v3.8.2 rule (`src/pace.ts`, class `Pacer`, pure logic): judged in half seconds; two bad ones in a row raise N
  (one alone is a hiccup); a clean one lowers it at once unless that rhythm failed lately (then 2 s, 4, ... 32);
  a rhythm being tried goes back after one bad half second; nothing is judged for 0.3 s after a change, 1 s
  after a race starts and 0.5 s after a halt of 250 ms or more; N never takes the game below 20 fps; the
  refresh interval may only shrink while every refresh is drawn (constant lateness looks like a slower screen).
- `tests/pace.test.ts`: the rule against a model device (GPU cost, a browser that holds the page back, a clock
  governor), 120 and 60 Hz, cost 0.5 to 3.1 refreshes, a hiccup, heavy-then-light. All pass: light loads stay at
  every refresh, heavy ones settle on the fitting rhythm with one attempt per 2-32 s. The model found two faults
  before the phone had to (refresh estimate swallowing constant lateness; one hiccup changing the rhythm).
  **The model does not reproduce the phone's stalls** (without pacing it is simply slower, and faster than with):
  it checks the logic, not the benefit.
- The report gets a "Frame pacing" section when pacing is on: per case the average rhythm and every change with
  its time and reason (JSON `paceLog`). `tests/benchrun.mjs` takes `PACE=1`.
- Still off unless turned on in Settings.

## v3.8.1 (2026-11-17) — frame pacing redone after the phone said no (on `v3`; measured since: see v3.8.2)
**v3.8.0 measured on the Xiaomi 17T, Mi Browser, same build, pacing off and on:**
- Off: as v3.7.1 (Low 118.6 fps, 0 hitches; High 42.0 with 41-47 hitches; Admiral 46.9 with 31-48; Psycho 33.2).
- On: Low 21.2 fps, High 18.7, Admiral 20.4, Psycho 17.6. Hitches 0 in 15 of 16 cases, frames evenly 33-66 ms.
- So the prediction (steady 60 on High and Admiral) was wrong, and the default-on setting made the phone
  several times slower. Cause: the GPU fence reports 30-50 ms after the frame is handed over even when the
  frame costs 6-8 ms (Low settled at one frame per 4 refreshes), so "wait for the fence" waits for the
  browser's pipeline, not for the GPU.
- What the run does show: with frames spaced out, the 75-150 ms stalls disappear. That supports the queueing
  reading of the stutter; it says nothing yet about which rhythm the phone can hold.
- v3.8.1: the fence is gone. Frames are drawn on every Nth refresh, and N follows the refresh callbacks' own
  timing: in each half second, more than 10 % late refreshes or one gap of 4+ refreshes raises N (to 6 at most);
  under 3 % late lowers it again as an attempt, with the same back-off as before. `Game.skipFrame`.
- **Frame pacing is now off unless the player turns it on** (Settings), on every device.
- The refresh-rate estimate comes from the refresh callbacks while pacing (v3.8.0 reported "24 Hz").
- The benchmark resets the rhythm in its cost and stage phases (they make the GPU finish inside the frame) and,
  with pacing on, prints the average rhythm of each case (JSON `rhythm`).
- `tests/pace.mjs` on the software GPU (4-7 fps, most gaps longer than the 250 ms the rule ignores) only shows
  that it runs without errors; it cannot say whether the rule finds the right rhythm.

## v3.8.0 (2026-11-17) — phones: frame pacing, first attempt (on `v3`; measured since: it failed, see v3.8.1)
User's Xiaomi 17T (Mali-G720 MC8), v3.7.1, two browsers:
- Mi Browser (120 Hz): Low 118 fps, no hitches (cost 5.1 ms, under the 8.3 ms budget). High 43 fps with 32-42
  hitches per 5 s run, Admiral 47 with 34-48, Psycho 33. Median frame 16.6 ms, but p95 75-83 ms and p99 83-108 ms:
  most frames are quick and about every fifth stalls for 5-10 refreshes. JavaScript is 3-4 ms (p99 8-12 ms).
- Brave (reports ~60 Hz; some seconds show 88-92 fps, so the limit is probably the phone's refresh-rate choice
  for that app, not a hard browser cap: not confirmed). Low 60, High 45, Admiral 50, Psycho 35; hitches 0-14,
  frames mostly 16.7 / 33 / 50 ms. Start-up 0.8 s (Mi Browser 3.2 s). The picture corruption seen earlier in
  Brave: user reports it gone.
- In both, Admiral (no MSAA, with sun shadows and AO) costs less than High (4x MSAA, neither): 12.3 against
  14.8 ms in Mi Browser. MSAA is the dearest single thing in High on this GPU.
- Reading (a hypothesis, fitted to the figures above): the stalls come when the GPU cannot finish frames as fast
  as the page hands them over; they queue, and the browser then holds the page for several refreshes.
  Every case under the refresh budget has no hitches, every case over it has them, and they are far worse at
  120 Hz. The software GPU here shows the same shape (median 13 ms, p95 440 ms).
- **Frame pacing** (Settings, "Frame pacing"; unset = on for touch-first devices, off elsewhere, so the PC is
  unchanged): after each frame a fence object is put in the GPU's queue; no new frame starts until it reports
  done (at most 250 ms), and the resulting rhythm (every 2nd, 3rd... refresh) is held, with an occasional
  attempt at a faster one that backs off (1.5 s doubling to 12 s) when it fails. `Game.skipFrame`.
- The benchmark runs with the player's pacing setting and prints it in "your settings" (JSON `pace`), so the
  same phone can be measured with it off and on.
- `tests/pace.mjs` (software GPU, about 4 fps, so only the shape counts): off: p50 13 ms, p95 440, worst 532,
  28 frames in 6 s; on: p50 267, p95 377, worst 400, 21 frames. Even rhythm, fewer frames. Whether a phone
  gains (expected: 60 steady in place of 41-47 with stalls) or loses frames is for the user's benchmark to say.

## v3.7.1 (2026-11-16) — night sky: the band of faint light no longer breaks along a line (released: `main` moved to it 2026-11-16, user: "let's put this version as main")
- User (KJGJHHMLH02, second half): a hard vertical edge through the blue haze of the night sky.
- Cause, older than v3.7.0: the pattern of the star band was laid out on the compass angle, which wraps round
  behind the world's north; the pattern jumped along that line, visible whenever the road points that way.
  Now laid out on a dome plane, which has no wrap. The star dots' pixel-size estimate is capped at the same line.
- Reproduced with `tests/pair.mjs` at 8000 steps on that track (edge at the left in v3.7.0, gone in v3.7.1).
- **v3.7.0 measured by the user (RX 9070, 3440x1440, 240 Hz), Admiral frame cost against v3.5.3 in Edge:**
  Forest 4.86 ms (was 4.42), Mountains 3.79 (3.48), Night 3.64 (3.23), Futuristic 4.73 (4.33): 0.3-0.45 ms more.
  Measured frame rate: 239.8 / 239.8 / 239.8 / 239.4 in Edge and 239.4 / 239.8 / 239.8 / 239.8 in Firefox, so
  Admiral still holds 240, with less in hand (1 % low 198 on Futuristic in Edge, 205 on Forest in Firefox:
  a few doubled frames per run). Psycho averages 218.6 in Edge (was about 220) and 224.7 in Firefox.
  Start-up 3.0 s in Edge (was about 2 s) and 5.2 s in Firefox. Not broken down: which of the six changes costs what.

## v3.7.0 (2026-11-16) — the "nearly free" image-quality batch (on `v3`)
Six changes to the picture. None is switchable; all but the last apply on every preset.
1. **Shading baked into the models** (`MB.bakeShade`, at model build): tree crowns darker low down, inside and
   underneath and lighter at the top; trunks darker under the crown; everything solid a little darker where it
   meets the ground. Vertex colours only: no cost per frame. Lit windows, neon, rotor blades and flags untouched.
2. **Cloud shadows** on tracks with broken cloud and the sun up (cover 0.12-0.9, not at night): soft shade a few
   hundred metres across, fixed to the ground, drifting along the track with the clouds' speed. Worked out per
   vertex for terrain and road, once per object and per car (never per pixel), from the existing noise texture:
   two texture reads in the vertex shaders. Takes up to 42 % of the direct sunlight. A whole number of tiles
   fits a lap, so there is no seam at the line.
3. **Air** (`uAerial` in `fogApply`): the far distance fades towards the horizon's colour with distance (up to
   42 %, less where the track's own fog is heavy, 40 % of that at night). One `exp` per pixel.
4. **Terrain**: the coarse ground texture repeated every 32 m; a second copy at another size with swapped axes is
   mixed in patch by patch. One more texture read per terrain pixel.
5. **Change-over between full and distance models**: over the last 25 m (or a fifth of the detail distance)
   before the switch both are drawn through complementary screen-door patterns. Not for the second, far switch.
6. **Cars reflect the sky itself** (not on presets with simple sky and effects): the sky is drawn every frame
   into a 128x64 unrolled picture, read by the car shader in place of the two-colour gradient. The car shader
   also reads its reflection once per pixel now, not in eight material branches.
- Found by `tests/shadowpic.mjs` and fixed before delivery: on the first frame with sun shadows the cars were
  refused by the driver (the new reflection sampler sat on texture unit 0, where a shadow map was bound).
  `uEnvT` and `uCloudT` now have fixed units, like the shadow maps.
- Checked: six scenarios side by side with v3.6.1 at High (rally, night, mountains, snow, desert, forest), and
  rally with sun shadows and AO: no errors, changes as intended. `tests/pair.mjs` makes such pairs.
- **Cost: not measured on real hardware.** On the software GPU a Forest frame at High is about 10 % slower
  (terrain +20 %, scenery +8 %), but texture reads are far dearer there than on a graphics card. Needs a
  benchmark run on the target PC: Admiral had 0.3-0.5 ms in hand on Forest and Futuristic.
- Not done from the list: nothing; "larger-scale variation" was done as item 4.

## v3.6.1 (2026-11-16) — what each graphics option does (on `v3`)
User, after trying v3.6.0 ("looks like it works"): explanations for the graphics options.
- A help box at the top of the graphics screen shows one or two sentences about the option in focus: what it
  does and roughly what it costs. It follows keyboard, gamepad and mouse focus and stays in view while the list
  scrolls (a hover-only tooltip would not exist on a gamepad or a phone); the same text is each row's hover
  tooltip. Texts are in `GFX_HELP` in screens.ts. `Menu.onFocus` added for this.

## v3.6.0 (2026-11-16) — graphics options take any value; progress strip readable in daylight (on `v3`)
- **Free values.** Render resolution, dynamic resolution floor, pixel ratio limit, draw distance, roadside
  clutter, woodland, full-detail distance, street-lamp lights, particles and rain and snow now move in fine
  steps over a wider range than the presets use (draw distance x0.3-2, detail distance 20-600 m, particles and
  weather x0-2, woodland x0-1.5, resolution 30-100 %), and any value in the range can be typed: Enter or a
  click on the (underlined) number. The arrows continue from whatever the value is. Presets' own values stay
  reachable exactly. `tests/gfxopts.mjs` covers stepping, typing, clamping and surviving a reload.
  Not measured: what the new extremes cost (draw distance x2, particles x2) on any real device.
- **Progress strip** (user, phone in daylight: the road line and the opponents' marks could not be seen): it
  was a 10 %-white bar with 60 %-white marks. Now a dark bar with a light edge; opponents solid white, stage
  marks wider, every mark outlined in black.
- **Desert dunes moving in bends: recorded as a known issue, not a bug to chase.** The user's reading, which
  the code supports: the ground inside a bend is squeezed towards the road by a limit that moves as you drive
  (the fold limit), so whatever stands on it slides a little; dunes are the largest features on any flat track,
  so they show it most. Same family as the Mountains artefacts: a consequence of the bent, strip-shaped world.

## v3.5.7 (2026-11-15) — Futuristic: pylon glows on the lamps, no light patches on the road (released: `main` moved to it 2026-11-15, user: "it seems ok, let's move it to main")
User's screenshot of Futuristic: lamp glows floating above the pylons; and a request to remove the light patches
on the street there ("it looks wrong and the track looked better before that got there").
- The glow position was written for the street lamp (light 7.1 m up, 1.7 m out) and used for every lamp model.
  The neon pylon's light is 5.9 m up: its glow hung 1.2 m above it. Each model now has its own entry
  (`LAMP_HEAD` in models.ts, beside the models).
- The pools of light painted on the road under distant lamps (added in v3.0.x for Night) are no longer drawn on
  Futuristic, only where there is street lighting. Night is unchanged (0 pixels differ at High).
- Not checked by eye here: the glows are faint at the time of day the test frame used.

**Released 2026-11-15: v3.5.6.** The user confirmed the benchmark no longer freezes on the 17T ("It worked now")
and said "go": `main` was fast-forwarded from v2.0.2 to v3.5.6 and is what the play link serves. The tag and the
GitHub release entry are the user's to create (tag pushes are refused from this session). Not finished: see the
known issues in the README (Mountains edge artefacts, Desert dunes in bends, stutter above Low on some phones,
unconfirmed Brave glitches) and the to-do lists below.

## To do (tidied 2026-11-16)
Done since this list was first written: benchmark end-of-run stutter explained on screen and GPU timers used
(v3.2.0); track load kept out of the measured run (v3.2.0); sky drawn last (v3.2.0); start-up 6.5 -> 2 s on Edge
and 9.3 -> 5 s on Firefox on the target PC (v3.5.1-v3.5.3); free-value graphics options (v3.6.0).
Still open:
- Benchmark "cost" overstates on Firefox and on the Intel laptop (the read-back used to finish the GPU).
- Stutter above Low on the Xiaomi 17T (not MSAA, not JavaScript); touch default preset from a measurement.
- Cars on Mountains cost 0.39-0.46 ms with sun shadows against 0.08 on High (target PC).
- Brave on Android: brief glitches reported, unconfirmed.
- Night: reusable cloud texture; lamps limited to those near each surface (items 2 and 5 below).

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
  On Desert this shows as dunes beside the road appearing to move in bends (accepted 2026-11-16, like Mountains).
- Not measured: whether Ultra Low reaches ~60 fps on a mid-range phone, or what Psycho costs on the target PC.
  Only relative costs on a software GPU are known, per frame on an emulated phone: Ultra Low 1.4 s, Low 2.0 s,
  High 11.4 s, Psycho 45 s.
- Generated-track bot test (`npm run test:sim`): on Roadworks d1 the bot finishes the championship race 17th (it
  needs the top ten). v1.6.0 and v1.9.0 give the same result, so this predates the release; the 64 course tracks
  are unaffected.
- Frame rate not measured on the target PC (headless uses a software GPU). Use F3 and Settings → Benchmark.
- Firefox browser itself not run (only its JS engine); audio not listened to; gamepads not physically tested.
