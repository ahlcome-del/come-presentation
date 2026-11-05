# Côme Presentation

Portfolio of historical presentations — a static, framework-free website with a click-driven
WebGL story (a book opens, its pages become antique maps, the maps become era dioramas) and a
data-driven library of presentations on "liquid glass" cards. The journey itself never scrolls:
one click moves to the next era.

- Interface in French; each presentation keeps its own language (`lang` is set per title).
- 100 % static: works on GitHub Pages as-is (`.nojekyll` included), relative paths only,
  so it also works under a sub-path such as `https://<user>.github.io/<repo>/`.
- All runtime libraries are **vendored** (pinned) in `js/vendor/`: a trimmed three@0.169.0, and
  `libs.js` = d3-geo@3.1.1 + topojson-client@3.1.0 only (31 KB; the old GSAP/ScrollTrigger/Lenis
  bundle is gone — rebuild it with `npm run build:libs`).
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

One quiet "Bientôt" ghost tile is added automatically after the real entries
(change `placeholders` in `js/library.js` → `renderLibrary(...)` if you want none).
The first presentation is rendered as the featured card (cover left, copy right) on wide screens.

## Run locally

ES modules and `fetch()` do not work from `file://`, so serve the folder **from the repository
root** (that is where `index.html` lives):

```bash
python3 -m http.server 8790     # or: npm start
# open http://localhost:8790/
```

Node is only needed for the maintenance scripts (nothing is bundled at deploy time):

```bash
npm install
npm run check     # parses every module + prints the gzip budget of the critical path
npm run smoke     # headless jsdom pass: boot, cards, panel + history, static fallback
npm run build:libs  # rebuilds js/vendor/libs.js (d3-geo + topojson) with esbuild
```

Useful query switches for testing: `?nofx` (disable the full-screen cinematic grade),
`?reduced` (reduced-motion mode), `?nowebgl` (static fallback), `?glass=fallback` (disable
the Chromium SVG refraction), `?noadapt` (freeze the adaptive DPR), `?noshadow`.

## Deploy (GitHub Pages)

1. Push the repository to GitHub (the site is at the repository root).
2. Repository → Settings → Pages → *Deploy from a branch* → `main`, folder `/ (root)`.
3. Done — no build step. `.nojekyll` makes Pages serve every file untouched.
   `robots.txt`, `sitemap.xml` and `manifest.webmanifest` are already there; update the absolute
   URLs (`ahlcome-del.github.io/come-presentation`) if the site moves.

## Structure

```
├── index.html            semantic page, inline SVG silhouette symbol (#sil)
├── css/main.css          tokens, liquid glass, layout, preference modes, static/fallback modes
├── js/
│   ├── main.js           boot, loader, click story (stations), panels, history, overlays, keyboard
│   ├── scene.js          three.js scene — CONFIG at the top; camera splines; IBL/shadows; flyTo()
│   ├── plates.js         the five map specs (pure data, no libraries)
│   ├── maps.js           antique map plates (d3-geo + topojson on canvas) — imported after the loader
│   ├── post.js           full-screen cinematic grade (warm veil, vignette, grain)
│   ├── dioramas.js       five low-poly era dioramas (procedural), normal-mapped materials
│   ├── props.js          landscape, harbour, figures, water normal animation
│   ├── terrain.js        relief, coast, ridges, sky shader (sun disc)
│   ├── library3d.js      the 3D library at the end of the road
│   ├── textures.js       procedural leather, pages, endpaper, normal maps, sprites
│   ├── glass.js          liquid-glass refraction filters + pointer highlight
│   ├── library.js        cards from presentations.json, generated covers
│   └── vendor/           three.js (trimmed), libs.js (d3-geo + topojson)
├── assets/
│   ├── logo.svg          traced silhouette (cream)
│   ├── og-image.jpg
│   ├── icons/            favicon.svg, favicon-32.png, apple-touch-icon.png
│   └── data/             countries-110m.json, land-50m.json (offline fallback)
└── tools/                build-vendor.js, check.js, smoke.js (dev only)
```

## Tuning the story

All timings live in `CONFIG.ranges` at the top of `js/scene.js` (progress units 0→1 over the
whole voyage). Text blocks use `data-in` / `data-out` attributes in `index.html` with the same
units; reduced-motion frames use `data-key`.

## Accessibility & fallbacks

- `prefers-reduced-motion`: the click journey is kept; flights are shorter, idle drift/parallax
  and grain are removed.
- `prefers-reduced-transparency`, `prefers-contrast: more`, `forced-colors`: the glass becomes an
  opaque surface (Apple HIG requires it) and the refraction filter is not even generated.
- No WebGL: static SVG book + silhouette; one click opens the library; the library stays fully
  usable.
- No page scroll in the journey: one full-screen button, one click per era, six progress dots and
  a "click to advance" cue. The library and À propos are scrollable panels.
- Real DOM text everywhere, landmarks, skip link ("Aller au récit"), visible focus (4.7:1 brick
  ring), keyboard: arrows / PageUp / PageDown / Space, Home, End, Escape to close a panel.
- Panels are real history entries: the system back gesture closes a panel instead of leaving the
  site, and `#bibliotheque` / `#a-propos` deep links open the right panel.
- `.card` uses `content-visibility: auto`: off-screen cards cost nothing.

## Performance notes

- Before the first pixel: ~247 KB gzip (three.js alone is 135 KB of it). `js/maps.js`, d3-geo and
  the 644 KB of map data are all fetched **after** the loader.
- The glass refraction maps are generated once per shape (`w × h × radius × dpr`, quantised to
  8 px) and cached; a resize no longer re-encodes dozens of PNGs.
- The render loop parks itself when the frame cannot change (no flight, no parallax delta) and
  stops entirely while a panel covers the canvas.
- Chip captions are measured on resize only, never inside the frame callback.

## A history of the build

The version-by-version notes (v2 → v18: materials, harbour, cinema pass, mobile framing, the
click story, the glass library) have moved to **[CHANGELOG.md](CHANGELOG.md)**.

## Licence

MIT for the code (see [LICENSE](LICENSE)); the silhouetted mark and the og-image are the author's.
Third-party components keep their own licences (three.js MIT, d3-geo/topojson ISC, Natural Earth
public domain, the three typefaces under the SIL Open Font License).
