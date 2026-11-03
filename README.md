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
