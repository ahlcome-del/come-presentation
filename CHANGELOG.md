# Changelog — Côme Presentation

The story of the build, newest first. The site itself has no build step; each version is a
commit on `main`.

## v18 — qualité front-end : matériau, coût, robustesse (5 nov. 2026)

An audit pass (see `AUDIT-FRONTEND.md`) rewritten as code. No visual redesign: the same palette,
the same stage, the same gesture — but the parts that broke or cost too much are fixed.

**Correctness**
- **Liquid glass**: the SVG refraction filter is now keyed on `w × h × radius × dpr` (quantised to
  8 px) instead of size alone. `--glass-radius` changes at the 768 px breakpoint and pills force
  999 px, so elements used to keep refracting with the geometry of their previous shape. A DPR
  change (window moved to another screen, browser zoom) triggers a regeneration; a collapsed
  element releases its filter.
- **Pointer highlight**: `--hl` was written inline by `glass.js`, which permanently overrode
  `.pill:hover { --hl: .16 }`. The pointer now drives `--hover-hl`, the highlight is cleared on
  `pointerleave`/blur and re-derived on scroll, and it is repainted at most once per frame.
- **History**: panels push a real entry, `popstate` closes/opens them, and `#bibliotheque` /
  `#a-propos` deep links work. The back gesture no longer leaves the site.
- **Skip link**: it pointed at `#bibliotheque`, which starts `inert`. It now targets `#scenario`
  and moves focus to the `h1`.
- **Focus / announcements**: the focus ring and the nav underline use `--accent-ink` (4.7:1 instead
  of 3.86:1); `aria-busy` on a `<button>` became `aria-disabled` + `data-state`; the live region is
  driven by arrivals only (it used to read several chapter names per flight).
- **Keyboard**: keys are ignored while a flight is running (the scene already ignored the clicks).

**User preferences** — the material is no longer mandatory: `prefers-reduced-transparency`,
`prefers-contrast: more` and `forced-colors: active` all have real styles (opaque surfaces, no
refraction filter, no grain), plus a `prefers-reduced-motion` block that also stops the decorative
CSS animations.

**Cost**
- `js/vendor/libs.js`: 164 KB → 31 KB. GSAP, ScrollTrigger and Lenis were bundled and imported by
  nothing; `tools/build-vendor.js` now rebuilds a d3-geo + topojson-only module (`npm run build:libs`).
- `js/maps.js` (+ its 6.6 KB gzip of d3 code) is `await import()`-ed after the loader; the plate
  specs moved to the dependency-free `js/plates.js`. Only the datasets the plates use are fetched.
- `modulepreload` on `js/main.js` removed: it pulled the whole module graph in front of the first
  paint for nothing.
- Glass maps are cached per shape and built in an idle slice; a resize no longer re-encodes dozens
  of PNGs on the main thread.
- The render loop parks on a still frame and stops while a panel covers the canvas.
- Chip captions are measured on resize, not inside the frame callback (two forced layouts per frame
  removed).
- The film grain runs six cycles instead of forever; `.card` gets `content-visibility: auto`;
  `.card:hover` no longer animates four box-shadows.
- The loader's floor is 1.9 s cold / 650 ms warm (sessionStorage) / 450 ms reduced, and the bar
  becomes a travelling shuttle after 3.2 s instead of freezing at 90 %.

**Affordance**
- Six progress dots and a "Cliquez pour avancer" cue on the stage (both `aria-hidden`; the button's
  `aria-label` already carries the state).
- The nav links are 44 px tall; `.pill` has a pressed state.

**Housekeeping**
- `manifest.webmanifest`, `robots.txt`, `sitemap.xml`, `LICENSE`, `.gitignore`, `package.json`
  (`type: module`, three dev scripts).
- `npm run check` (parse + gzip budget) and `npm run smoke` (jsdom: boot, cards, panel, history,
  static fallback).
- README rewritten for a reader (what / run / add / deploy / structure); the version history moved
  here. Fixes the stale `cd site` instructions and the outdated page weight.
- Removed: the dead `.lenis*` rules, the unused `--grain-op` declaration, the `<!-- Placeholder -->`
  comment shipped in the About section.

**Not done here, deliberately**: self-hosting the fonts (the three families are needed by the canvas
maps and the 3D textures, and could not be subset without a network), a Safari/iOS device pass, and
the featured-card grid tuning. See `AUDIT-FRONTEND.md` §7–9.

## Materials (no plastic look) — v1

All surfaces are matte and textured at runtime — no image files:
- `js/textures.js` generates small tiling canvases (256 px): stone/marble/limestone, ashlar, brick, wood grain, worn painted iron, paper fibre, leather grain (+ bump and rubbed edges on the cover).
- `js/dioramas.js → makeMaterials()` uses them as colour **and** bump maps, roughness 0.78–0.95, metalness 0 (except iron 0.25 and the mirrors), `envMapIntensity` ≈ 0.45.
- `bake()` adds per-vertex contact AO (darker where parts meet the base), ±4 % tone jitter per face, and world-space box-projected UVs so texel density is constant.
- Paper (pages, plates) gets a faint warm emissive lift as a cheap subsurface-like sheen.

## The journey (v2–v17): one station per click

- `js/scene.js` is a pure function of one progress value `p`. A click calls `flyTo(nextKey)`; the render
  loop drives `p` with an eased cubic flight (3.6 s intro, 1.8 s between eras; 2.4/1.0 s reduced). Clicks
  are ignored during a flight. There is no page scroll. Headlines, era captions, letterbox and grade are
  computed from the same `p` (`main.js → updateOverlays`).
- Everything (book, 5 map plates, 5 dioramas, ground, route) is built in `init()` and warmed up (shaders +
  textures) before the loader fades. Nothing is created or shown by scroll callbacks.
- Camera: `buildCameraPath()` — two `CatmullRomCurve3` splines (position + look target) through keyframes
  `K(p, pos, look)`. Edit those keys to re-stage the flight.
- Layout: book at the origin; eras are stations along −z (`CONFIG.world.stations`). Ranges in
  `CONFIG.ranges`: station i is closest at `stations.first + i·stations.step`; `settle`, `assemble`,
  `explode` are relative to that.
- QA tools (outside `site/`): `tools/seq.js` captures a continuity sequence and fast-scroll frames.

## Props & landscape (v3)

`js/props.js` places small maquette props (trees, cypresses, olive trees, figurines, houses, carts, crates,
barrels, boats, lamps, banners, milestones, ruins, rocks, hills, a river with a bridge) around each era and
along the road between eras. Each prop kind is one `InstancedMesh` per material, so the whole landscape is a
few dozen draw calls. Era-specific sets are in `ERA_SETS`; station props scale in with their era. Smoke columns
are a handful of soft sprites (`Props.addSmoke`). Map plates (`js/maps.js`) carry sea creatures, ships, rhumb
lines, engraved relief, region names, corner rosettes and cartouche scroll-work, all drawn on canvas.

## Terrain, haze & figures (v4)

- `js/terrain.js`: `terrainH(x, z)` is a gentle value-noise relief, flat under the road and
  every era, rising into soft hills further out, with a shallow river valley carved in.
  The ground is one displaced mesh (88×300 segments, fewer on mobile); every prop sits on
  `terrainH`. No more hill "blobs".
- Three layers of far ridge silhouettes on each side (and across the end of the road) use a
  tiny shader that mixes each layer further into the era's haze, with mist at their feet.
- A sky dome follows the camera: era haze at the horizon, a soft glow that is brightest
  where the road leads, a darker zenith. Per-era colours live in `CONFIG.atmos`
  (`fog` = haze, `glow`, `top`, `key`); the fog uses the same haze colour, so distance
  reads as atmospheric perspective.
- Figures: proportioned (legs, torso, arms, head), one costume set per era (toga, peasant
  tunic & hood, sailor with hat, frock coat & top hat, 20th-c. overcoat & cap, gowns) and
  four poses (standing, walking, pointing, carrying). Cloth colour varies per instance.
- Trees: canopies of several noise-displaced icosahedra in two tones; three tree variants,
  poplars and pines. Houses: roof overhang, chimney, door, windows (some lit at dusk),
  half-timbered and two-storey brick variants.
- Cutaway: roofs and tops lift only a little (×0.34) and fade slightly; walls part ×0.8.
- Medieval ashlar is darker and warmer, the key light warmer for that era.
- Era surroundings gather slightly before the building assembles (no empty approach).
- Reduced motion: the picture always follows the chapter closest to the viewport centre.

## Harbour, art-deco ministry & the library (v5)

- Harbour (`props.js`, basin carved in `terrain.js` → `HARB`): stone quay, three timber
  jetties on piles, moored boats, bollards, a treadwheel crane, a light tower, cargo and
  porters on the quay apron. Eras II–V land and start building a little sooner, so the
  approach is never a bare disc.
- Era V (`dioramas.js → twentieth`): an art-deco ministry: limestone piers and bands, dark
  glazing with a few lit windows, a central portal with canopy, a stepped tower with fins
  and spire, roof and forecourt flagpoles, lamps; 1920s motorcars around it. Cutaway: the
  facade folds down onto the steps, revealing the treaty hall (table, chandeliers).
- `js/library3d.js`: the road ends in a library: walnut bays (all books in one
  InstancedMesh, lamp light baked into their colours), a night window, sconces with soft
  halos, a desk with banker's lamp and open book, globe, rolling ladder, rug; seen from the
  road as an ashlar building with its front cut away. The library backdrop is now only
  lightly blurred/dimmed (`main.js`). It is hidden until p > 0.72 (fully fogged before).

## Entering the library, shadows & fields (v6)

- The library stands 20 units past the last era, at the end of a lamp-lit road: a stone
  podium with three steps, a facade with tall lit windows, a carved "BIBLIOTHÈQUE" over a
  doorway with open doors, lanterns, a flagged forecourt and warm light spilling out.
  The camera climbs the steps and passes through the doorway (keys .9 / .955 / 1).
- Soft shadow map (desktop only, `?noshadow` to disable; dropped automatically on slow
  machines): the key light and its small shadow frustum follow the era in view; only the
  dioramas cast. The key now rakes from the left so shadows fall across each base.
- A faint warm light pool on the ground under each era.
- Landscape: a patchwork of ploughed/sown fields draped on the relief, a chapel and two
  windmills between the eras. Portrait: the harbour approach leans towards the quay.

## Fuller transitions, stone & a stutter-free shadow decision (v7)

- Shadows are decided once, behind the loader: a few frames are timed at a busy era
  (`benchMs`); above ~19 ms the shadow-free shaders are compiled right there, so nothing
  recompiles or stutters mid-journey (`?noadapt` skips the test). The old automatic
  mid-scroll shadow switch-off is gone.
- Between eras the next map lands and its buildings/props start rising earlier, and the
  travel camera leaves each era a little sooner and passes an "en route" key close to the
  next one, looking at it as it rises, so frames ~.50 / ~.66 / ~.75 are never an empty sheet.
- Cover turn (~.09): the book settles at a slight three-quarter angle (page edges catch the
  light) before the cover opens, with a soft warm halo behind it.
- Maps flight (~.40): the plates glide low to their stations and stay in frame.
- Library facade: dressed limestone in large courses with box-projected world-scale UVs
  (no stretched blocks), a darker plinth and a string course.
- Figures: carried loads read as baskets/crates, slimmer toga sash.

## Colour life, weathering & a lived-in library (v8)

- Masonry weathering (`dioramas.js` `weather()`): damp/moss greens creeping up from the
  foot of every stone, brick and marble part, ochre stains and darker rain-streaked patches,
  soot on the industrial brick — baked into vertex colours, no extra textures or draw calls.
- Castle: madder and ochre banners on the keep and gatehouse, pennants on every tower, ivy
  climbing the front towers and curtain wall. Temple: a faded blue painted frieze with
  madder fillets, ivy over the ruins. Galleon: painted ochre/madder wales and mast pennants.
- Industrial: coal smoke drifting from the factory chimney and the locomotive (soft sprite
  puffs, normal blending, fade in with the assembly; still pose in reduced motion), ivy on
  the hall. Ministry: green copper crown, canvas awnings over the ground-floor windows, long
  red banners by the portal, more lit windows, clipped hedges and planters.
- Library: the tall windows glow with a warm gradient and show the silhouettes of the
  shelves and book spines inside (two variants, no two windows alike).
- Figures: per-instance skin and hair tones, height variation, small accessories (staff,
  cane, satchel, briefcase) so silhouettes read at a glance.
- Static mode on portrait (reduced motion / no WebGL): copy sits at the top of each chapter
  on a soft dusk scrim, so it never lies over the book.

## Cinema, a fuller first era & readable copy (v9)

- Camera: on arrival at an era the frame eases in ~4.5 % closer, holds, and keeps a barely-there
  drift and a whisper of roll (pointer-led) — cinematic without a handheld wobble. Cut entirely
  in reduced motion.
- Haze layers parallax: the three ridge layers now slide against each other with camera motion
  and the pointer, so the distance reads as air rather than a painted backdrop.
- Maps flight: a handful of torn parchment scraps trail the plates between p .30 and .50.
  Antiquity: a forum crowd of eleven toga figures on the steps, a ruined stoa behind the temple,
  four olive trees and scrub on the plinth, a ribbed terracotta roof with ridge and gutters, a
  warmer marble, and a shallow blue bay with a sand shore, foam line, beach rocks and caiques
  beyond the temple — the Mediterranean the first era looks out on.
- Era I props: olive groves, shrubs and standing columns added to the ring around the station.
- Copy: era chips get a denser tint, a hairline and a text shadow; the journey headlines get a
  triple text shadow; a soft radial scrim fades in behind the maps/eras copy and behind the chips.
- Accessibility: progress buttons have aria-labels and aria-current, a polite live region
  announces the chapter, focus rings stay visible inside glass panels and chips stay reachable
  while focused, safe-area insets on the nav, progress and gutters, Twitter card + robots meta.

## v10 — the Antiquité bay

- **Bay beside the temple (≈ .46):** the dark band left of the plinth is now a bay. `terrain.js` exports `COAST`, `shoreX(z)` (the near shore, about 1.3 m west of the map sheet), `farX(z)` (the far shore), `seaDepth(x,z)` and `inCoast()`. The seabed is cut out between the two shores, and the far bank rises gently into the hills as terrain, with no blocky silhouettes.
- **Near bank (`props.js`):** a lifted sea-green water sheet with a pale shallow band, a sand/wet-sand ribbon that follows `shoreX`, broken foam, rocks and dune grass, a timber jetty, 7 caiques at anchor, figures and amphorae, a row of 12 olives plus cypresses, and a dry-stone wall. The far bank has a sand line and scrub cypresses.
- Station, landscape and field placement avoid the bay (`inCoast`). Coast props are placed on the terrain after they are added.
- Era II–V assembly starts slightly earlier: `[sp-.09, sp-.03]`.
- Check: the harbour frames .55–.65 look the same as before. The 6-check run (best, 1280×800 laptop, mobile, RM, mobile RM, no-GL) plus the sequence: no errors, no horizontal scroll.

## v11 — final polish

- **Library:** warmer walnut (`0xb07f58`) and panelling (`0x7a5236`), stronger lamp halos (desk .62, sconces .42), and a soft light shaft from the tall window with 26 slow dust motes (14 on mobile). These are additive sprites, gated by the existing arrival factor `k`; no real-time lights were added.
- **Maps flight (.33–.40):** the plates in the cloud are about 30 % larger and slightly closer (`CONFIG.cluster.wide` scales .6–.7). The headline stays readable.
- **Castle (.545):** the arrival camera key for station 1 is closer and centred on the castle.
- Check: the 6-check run (best, 1280×800, mobile, RM, mobile RM, no-GL) plus the sequence: no errors, no horizontal scroll.

## v11 — final verification

Run on 4 Nov 2026, around 04:10 Paris time, against the live site https://ahlcome-del.github.io/come-presentation/ (Puppeteer with SwiftShader, so a software GPU). Captures are in `shots/live/`.

| Check | Result |
|---|---|
| index.html loads | PASS (HTTP 200, 17.3 KB) |
| presentations.json loads | PASS (HTTP 200, 654 B) |
| Desktop 1440x900, 10 frames | PASS, 0 errors |
| Laptop 1280x800, 10 frames | PASS, 0 errors |
| Mobile 390x844, 10 frames | PASS, 0 errors |
| Reduced motion | PASS (static page with captions), 0 errors |
| No WebGL (`?nogl`) | PASS (fallback renders), 0 errors |
| 20-frame scroll sequence | PASS, 0 errors |
| Console errors | PASS, none in any run |
| Horizontal scroll | PASS (scrollWidth equals clientWidth in every run) |
| Page weight | PASS: about 1.41 MB transferred on first load, 1.71 MB for the whole site/ folder (under 3 MB) |

### Known issues
- Real frame rate on weak integrated GPUs has not been measured. The headless tests use SwiftShader, so on slow machines the loader benchmark may switch shadows off.
- Small diorama labels (for example "Moyen Âge") are hard to read at 390 px.
- On mobile, the maps flight (around 0.35) shows the plates partly cropped behind the headline.
- The library end frame is deliberately soft and blurred behind the cards, and the dust motes are subtle.
- No tests were run in real Safari or iOS browsers. Only Chromium was used.

## v12 (two small framing fixes, then frozen for good)
- Mobile portrait, castle at 0.545: when the screen is portrait, the camera arrives a bit higher and further back, so the outer towers no longer touch the edges. The desktop and laptop camera is unchanged.
- Desktop maps at 0.33–0.36: the middle map plate moved right (x 0.1 to 0.62) and is slightly smaller (scale 0.64 to 0.6), so there is clear space between it and the "Les pages deviennent des cartes" headline. The other plates keep their larger size.
- The only code file changed is `site/js/scene.js`. Verification run of 4 Nov 2026, 04:45 Paris time (CET), served locally; captures are in `shots/v12/`. Results: desktop, laptop 1280x800, mobile 390, reduced motion, mobile reduced motion, no WebGL and the 20-frame sequence all PASS, with 0 console errors and no horizontal scroll.

## v13 (two mobile-only fixes, then frozen)
- Maps flight on portrait screens (p .30–.40): the portrait plate cluster moved lower and one plate a little larger, so the plates now sit below the "Les pages deviennent des cartes." headline instead of behind it. Only `CONFIG.cluster.portrait` in `site/js/scene.js` changed.
- Era captions at 390 px: era name 15→17 px, years 11→12 px, caption line 14→15.5 px with line-height 1.45, brighter text and a slightly darker glass behind it. This is in the mobile media query in `site/css/main.css` only.
- Desktop, laptop and the v12 mobile castle camera are untouched. The reduced-motion desktop captures are 0 px different from v12.
- Verification run of 4 Nov 2026, 05:13 Paris time (CET), served locally; captures are in `shots/v13/`. Desktop, laptop 1280x800, mobile 390, reduced motion, mobile reduced motion, no WebGL and the 20-frame sequence all PASS, with 0 console errors and no horizontal scroll.

## v14 (French proofread, then frozen)
- Text edits: straight apostrophes changed to ’ in visible text (L’histoire, L’océan, s’élargit, s’appuie, l’empire); comma before "et" removed (Vapeur, rail et conférences / Guerre, traités et fin des empires); narrow no-break space before ":" (lede, card summary); no-break space to stop one-word last lines ("routes, escales.", "sans le simplifier."); XIXe–XXe tag now uses an en dash.
- The noscript Kolonialpolitik link now opens in a new tab with rel="noopener noreferrer", like the card link. Placeholder cards were already non-clickable (no links, nothing focusable).
- Not done (left for safety): first-paint and loader smoothing.
- Verification run of 4 Nov 2026, 05:34 Paris time (CET), served locally; captures are in `shots/v14/`. All 7 checks PASS, with 0 console errors and no horizontal scroll.

## v15 (first paint and loader, then frozen)
- Audit: the first paint was already clean. The stylesheet loads before anything is drawn, the `js` class is set inline in the head, and the loader covers the page from the very first frame. Fonts are capped at 4 s. The maps (`land-50m.json`) load after the loader has gone and fill in behind the scene. The reduced-motion, no-WebGL and error paths all hide the loader.
- One change (`site/js/main.js`): the wait for the library (`presentations.json`) is now capped at 6 s and its errors are caught, so a slow or failed request can no longer hold the loader. The cards still fill in when the file arrives.
- Throttled test (400 kbps, 300 ms latency, cache disabled; `tools/throttle.js`): loader done after 38.0 s on desktop, 33.5 s on mobile and 39.5 s with no WebGL. That is close to the minimum time to download the page at that speed. No bare canvas or jumping text before the loader goes away, page scrolls right after, 0 errors.
- Verification run of 4 Nov 2026, 05:56 Paris time (CET); captures are in `shots/v15/`. All 7 checks PASS, with 0 console errors and no horizontal scroll.

## v16 (library, glass navigation, guided scroll)
- **Library:** the first presentation is now a featured card spanning two columns (cover left, copy right); the two dashed placeholders are replaced by one quiet ghost tile. Inner cover radii are concentric (`--glass-radius - --card-pad`). The living light behind the cards is a slow CSS glow, not extra WebGL.
- **Navigation:** a glass thumb slides behind the active link (Voyage / Bibliothèque / À propos, which now follows the about section too). On mobile, a bottom glass capsule names the current chapter or era; the era chips sit above it and the progress ticks get 44 px hit areas.
- **First screen:** a glass "Défiler" capsule fades out at the first gesture.
- **Material:** gradient words get a one-shot specular sweep; cards no longer tilt (cover zoom + sheen instead); the footer becomes a colophon with À propos, Retour au livre and a GitHub pill.
- **Scroll:** Lenis is calmer (1 s cubic glide, lower wheel/touch multipliers). The hard pauses are replaced by a guided catch-up in `scene.js` / `main.js`: when the raw target runs ahead of the scene by more than ~2 %, the scene lands on each era in turn (its `data-key`) and holds ~260 ms before continuing, so a fast flick or scrollbar jump cannot skip an era. Nav clicks, keys and End/Home bypass the guide; scroll input is never locked.
- Files: `index.html`, `css/main.css`, `js/main.js`, `js/scene.js`, `js/library.js`, `js/glass.js`, `README.md`.

## v17 — sans scroll, clic & rendu cinéma (4 nov. 2026)

- **No scroll:** the document is one 100svh stage; `#progress`, the "Défiler" cue and Lenis/GSAP/ScrollTrigger
  are gone. One full-screen `#advance` button: first click opens the book to Antiquity, then one click per era
  (p .310 → .435 → .560 → .685 → .810); the last click opens the library panel. 3.6 s intro, 1.8 s between eras
  (2.4/1.0 s reduced); clicks are ignored in flight.
- **Pause de station:** the stop is after assembly and before the cutaway. `explode` starts at +.006 progress;
  the transitional “Les pages deviennent des cartes” and “Les cartes deviennent des époques” blocks have been
  removed. At .310 the building is complete and only the era chip remains; the cutaway plays on the next click,
  while the camera leaves.
- **Edge-to-edge:** the cinematic letterbox bars are removed and the stage uses `100dvh` (with `100svh`/`100vh`
  fallbacks), so there is no black band at the top/bottom and no crop on iPhone; safe-area insets only position
  the navigation and the era capsule over the full-bleed scene.
- **Panels:** Bibliothèque and À propos are fixed, scrollable, focus-managed panels; the nav opens them;
  Escape/back closes; the stage is inert while open; the footer moved into À propos.
- **Rendering:** PMREM IBL from the procedural sky, a sky shader with sun disc/halo, 2048 shadows on desktop
  when the benchmark allows, procedural normal maps on materials and ground, an animated water normal map and
  reflective water. `post.js` adds a full-screen grade (warm horizon veil, vignette, grain; desktop WebGL2;
  `?nofx`). The vendored three.js is trimmed and has no render targets, so there is deliberately no
  bloom/aberration pass.
- **Fallbacks:** no WebGL → static SVG book + silhouette, click opens the library; reduced motion keeps the
  click journey with shorter flights and no idle drift/grain; mobile keeps the era capsule. No horizontal
  scroll at 1280×900 or 390×844; console clean; no `#progress`/`#cue`.
- Files: `index.html`, `css/main.css`, `js/main.js`, `js/scene.js`, `js/post.js`, `js/textures.js`,
  `js/dioramas.js`, `js/props.js`, `js/terrain.js`, `README.md`.
