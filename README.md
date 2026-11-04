# Côme Presentation

Portfolio of historical presentations — a static, framework-free website with a scroll-driven
WebGL story (a book opens, its pages become antique maps, the maps become era dioramas) and a
data-driven library of presentations on "liquid glass" cards.

- Interface in French; each presentation keeps its own language (`lang` is set per title).
- 100 % static: works on GitHub Pages as-is (`.nojekyll` included), relative paths only,
  so it also works under a sub-path such as `https://<user>.github.io/<repo>/`.
- All libraries are **vendored** (pinned) in `js/vendor/`:
  three@0.169.0 (+ RoomEnvironment, mergeGeometries), gsap@3.12.5 + ScrollTrigger,
  lenis@1.3.27, d3-geo@3.1.1, topojson-client@3.1.0.
- Map data: Natural Earth via world-atlas@2.0.2 — fetched from jsDelivr, with local copies in
  `assets/data/` used automatically when offline.

## Add a presentation

Edit **`presentations.json`** and append one object. Nothing else to change.

```json
{
  "id": "versailles-1919",
  "title": "Le traité de Versailles",
  "subtitle": "Une paix de vainqueurs",
  "years": "1919-1920",
  "language": "Français",
  "summary": "Deux ou trois phrases de résumé, en français.",
  "tags": ["Europe", "Diplomatie", "XXe siècle"],
  "url": "https://example.github.io/versailles/"
}
```

| field      | required | notes |
|------------|----------|-------|
| `id`       | yes | unique, used as the card's anchor (`#p-<id>`) |
| `title`    | yes | shown in its own language |
| `subtitle` | no  | italic line under the title |
| `years`    | yes | `"1884-1919"` → displayed `1884–1919`; drives the cover tint |
| `language` | yes | `Deutsch`, `Français`, `English`… → sets `lang` (de/fr/en…) |
| `lang`     | no  | explicit BCP-47 code if `language` is not recognised |
| `summary`  | yes | French |
| `tags`     | no  | array of short strings |
| `url`      | yes | opened in a new tab (`rel="noopener noreferrer"`) |
| `cover`    | no  | path/URL of an image; otherwise a cover is generated (era-tinted gradient, giant years, silhouette) |

The two dashed "Bientôt" placeholders are added automatically after the real entries
(change `placeholders` in `js/main.js` → `renderLibrary(...)` if you want fewer).

## Run locally

ES modules and `fetch()` do not work from `file://`, so serve the folder:

```bash
cd site
python3 -m http.server 8790
# open http://localhost:8790/
```

(any static server works: `npx serve`, `php -S localhost:8790`, …)

Useful query switches for testing: `?reduced` (reduced-motion mode), `?nowebgl` (static
fallback), `?glass=fallback` (disable the Chromium SVG refraction), `?noadapt` (disable the
adaptive resolution).

## Deploy (GitHub Pages)

1. Push the **contents of `site/`** to a repository (root of the branch, or a `/docs` folder).
2. Repository → Settings → Pages → *Deploy from a branch* → select the branch and folder.
3. Done — no build step. `.nojekyll` makes Pages serve every file untouched.

After deploy, replace the relative `og:image` in `index.html` with the absolute URL
(`https://<user>.github.io/<repo>/assets/og-image.jpg`) so every social network picks it up.

## Structure

```
site/
├── index.html            semantic page, inline SVG silhouette symbol (#sil)
├── presentations.json    the library data
├── css/main.css          tokens, liquid glass, layout, static/fallback modes
├── js/
│   ├── main.js           boot, loader, Lenis + GSAP master timeline, overlays, keyboard
│   ├── scene.js          three.js scene — CONFIG object at the top (colours, timings, ranges)
│   ├── maps.js           antique map plates (d3-geo + topojson on canvas)
│   ├── dioramas.js       five low-poly era dioramas (procedural)
│   ├── textures.js       procedural leather, pages, endpaper, sprites
│   ├── glass.js          liquid-glass refraction filters + pointer highlight / tilt
│   ├── library.js        cards from presentations.json, generated covers
│   └── vendor/           three.js, libs.js (gsap, ScrollTrigger, lenis, d3-geo, topojson)
└── assets/
    ├── logo.svg          traced silhouette (cream)
    ├── og-image.jpg
    ├── icons/            favicon.svg, favicon-32.png, apple-touch-icon.png
    └── data/             countries-110m.json, land-50m.json (offline fallback)
```

## Tuning the story

All timings live in `CONFIG.ranges` at the top of `js/scene.js` (progress units 0→1 over the
whole voyage). Text blocks use `data-in` / `data-out` attributes in `index.html` with the same
units; reduced-motion frames use `data-key`.

## Accessibility & fallbacks

- `prefers-reduced-motion`: no smooth scroll, no scrubbing; each chapter shows a static
  composed 3D frame, normal page scroll.
- No WebGL: static SVG book + silhouette, the library stays fully usable.
- Real DOM text everywhere, landmarks, skip link, visible focus (brick ring), keyboard:
  PageUp/PageDown, Space, arrows, Home/End; the progress ticks are buttons.

## Materials (no plastic look)

All surfaces are matte and textured at runtime — no image files:
- `js/textures.js` generates small tiling canvases (256 px): stone/marble/limestone, ashlar, brick, wood grain, worn painted iron, paper fibre, leather grain (+ bump and rubbed edges on the cover).
- `js/dioramas.js → makeMaterials()` uses them as colour **and** bump maps, roughness 0.78–0.95, metalness 0 (except iron 0.25 and the mirrors), `envMapIntensity` ≈ 0.45.
- `bake()` adds per-vertex contact AO (darker where parts meet the base), ±4 % tone jitter per face, and world-space box-projected UVs so texel density is constant.
- Paper (pages, plates) gets a faint warm emissive lift as a cheap subsurface-like sheen.

## The journey (v2): one continuous camera flight

- `js/scene.js` is a pure function of one progress value `p`. Scroll only sets a *target*; the render loop
  damps `p → target` every frame (`1 − e^(−dt·k)`, `CONFIG.damping`), so scrollbar drags, End/Home or fast
  wheels glide through the story instead of cutting. Headlines, era captions, letterbox and backdrop blur are
  computed from the same damped value (`main.js → updateOverlays`).
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
