# Visual review log

## Pass 1 (1920x1080, then 3440x1440) – weakest element per scenario, and the fix
| # | Scenario | Weakest element | Fix applied |
|---|---|---|---|
| 0 | Rally | flat lime meadow | darker, desaturated ground palette + large-scale patch noise |
| 1 | Futuristic | concept-car neon overblooms | neon emissive halved |
| 2 | Night | headlights blow out nearby cars into white blobs; lamp glows oversized | headlight intensity 55→32, lamp glows halved |
| 3 | Marsh | willows read as solid green walls | rebuilt willow with thin hanging fronds; reeds as tapered blades |
| 4 | Mountains | whole range white, valley below the cliff reads as a pale lake | snow caps only on ridge tops; below-horizon blends to valley ground; peaks only on the cliff side |
| 5 | Snow | snowfall barely visible (thin lines) | snow drawn as soft round point sprites |
| 6 | Roadworks | light-tower lamps blank white in daylight; read as desert earlier | lamp emissive lowered; greener ground, clearer sky, denser works |
| 7 | Storm | navy-blue rumble strips and barn doors | **bug**: 3-digit hex colours were parsed wrongly – fixed globally |
| 8 | Desert | sand overexposed and flat | sun 4.2→3.5, darker orange sand, exposure 0.9 |
| 9 | Fog | hedges are flat green boxes | hedges rebuilt from bumpy blobs |
| 10 | Motorway | blue glowing barrier/rumble | same hex bug; rail darkened, less specular |
| 11 | Wind | lime grass, empty | desaturated palette, turbines twice as dense |
| 12 | Forest | (good) faceted canopies | variants per tree type add shape variety |
Also: scenery now has 3 procedural variants per natural type to avoid cloning.

## Pass 2 (after pass-1 fixes) – weakest element per scenario, and the fix
| # | Scenario | Weakest element | Fix applied |
|---|---|---|---|
| 0 | Rally | (good) rivals right next to the lens look blocky | near-camera cars now dissolve (screen-door) |
| 1 | Futuristic | (good) black tower bodies close to the road | lighter tower bodies, neon corner trims, stronger ambient |
| 2 | Night | brake-light bloom still strong | wet-glow reflections reduced; headlights already tamed |
| 3 | Marsh | washed-out, low contrast | contrast 1.05→1.14, lift removed |
| 4 | Mountains | rock wall still very dark, valley still pale | brighter rock albedo, warmer bounce light, darker valley fog |
| 5 | Snow | (good) | – |
| 6 | Roadworks | (good) | – |
| 7 | Storm | whole frame too dark | exposure 1.15→1.32 with slight lift |
| 8 | Desert | (good) | – |
| 9 | Fog | (good) | – |
| 10 | Motorway | (good) | – |
| 11 | Wind | grass still a little flat | desaturated grade (1.2→1.08), turbines denser |
| 12 | Forest | (good) | – |
Test artefact: start-of-race HUD messages persisted in headless shots – messages are cleared for screenshots.

## Pass 3 (verification after pass-2 fixes)
All 13 scenarios re-shot at 1920x1080 and 3440x1440 (`review/pass3/`). Pass-2 issues confirmed fixed
(Storm readable, Marsh contrast, Mountains rock no longer black, clean HUD). Remaining known weak spots:
- Mountains: a pale sliver can appear along the very top edge of the rock wall where it meets the sky.
- Night: brake-light bloom of cars directly ahead is still strong in close traffic.
- Style is deliberately low-poly/flat-shaded; it reads as a stylised indie racer rather than a realistic one.
