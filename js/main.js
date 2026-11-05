/**
 * Côme Presentation — boot & orchestration.
 *  - feature detection (WebGL, reduced motion, mobile, Chromium liquid glass)
 *  - preloader, library rendering, 3D scene (lazy-imported)
 *  - a CLICK story: one click opens the book / moves to the next era, one
 *    animation per click; the page itself never scrolls
 *  - full-screen library / about panels, opened from the nav
 *  - static mode (ONLY when WebGL is genuinely unavailable): one composed frame
 *  - reduced motion (OS setting) is a MODIFIER: the journey keeps running, only
 *    the automatic motion (idle float, pointer parallax, grain) is toned down.
 */
import { renderLibrary } from './library.js';
import { supportsLiquid, initLiquid, initGlassPointer, killLiquid } from './glass.js';

const html = document.documentElement;
const params = new URLSearchParams(location.search);

/* A reload always starts on the cover: never restore the previous position. */
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
/* A deep link (#bibliotheque, #a-propos) is honoured once the boot is over. */
const INITIAL_HASH = location.hash.slice(1);
if (location.hash) history.replaceState(null, '', location.pathname + location.search);
window.scrollTo(0, 0);
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches || params.has('reduced');
const MOBILE = matchMedia('(max-width: 768px)').matches || matchMedia('(pointer: coarse)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

/*
 * WebGL is the only thing that may drop the page into static mode. On Windows with
 * an integrated GPU, WebGL2 can be missing or blacklisted while WebGL1 still works,
 * so probe in order and remember what answered: webgl2 → webgl1.
 */
function probeWebGL() {
  if (params.has('nowebgl')) return { ok: false, kind: null, reason: '?nowebgl' };
  const c = document.createElement('canvas');
  const opts = [{ failIfMajorPerformanceCaveat: false, antialias: true }, { antialias: false }, { powerPreference: 'low-power', antialias: false }];
  for (const o of opts) {
    for (const [kind, name] of [['webgl2', 'webgl2'], ['webgl1', 'webgl']]) {
      try {
        const gl = c.getContext(name, o);
        if (gl && typeof gl.getParameter === 'function') return { ok: true, kind, reason: `ctx:${kind}` };
      } catch (e) { /* try the next option */ }
    }
  }
  return { ok: false, kind: null, reason: 'no-context' };
}

/* ------------------------------------------------------------ loader */
/* The bar never waits on anything. It fills on its own clock, and the real
   loading progress can only push it further: max() of the two, never backwards. */
const loader = $('#loader'), bar = $('#loader-bar');
const T0 = performance.now();
let barVal = 0, barReal = 0;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const barTime = () => Math.min(.9, .92 * easeOut(clamp((performance.now() - T0) / 3000)));
const paintBar = (x) => {
  barVal = Math.max(barVal, clamp(x));
  if (bar) bar.style.transform = `scaleX(${barVal.toFixed(4)})`;
};
const setBar = (x) => { barReal = Math.max(barReal, clamp(x)); paintBar(Math.max(barReal * .92, barTime())); };
const barTick = setInterval(() => { const v = Math.max(barReal * .92, barTime()); if (v > barVal + 1e-4) paintBar(v); }, 80);
setBar(0);

/* ------------------------------------------------------------ state */
const app = {
  scene: null, ready: false, static: false, station: 0, flight: false, panel: null,
  p: 0, reduced: REDUCED, mobile: MOBILE,
};
window.__cp = app;

/* The click story. The numbers are the scene's existing progress keys:
   0 the closed book → .310 Antiquité → .435 Moyen Âge → .560 Grandes découvertes
   → .685 XIXe → .810 XXe. The library is a panel, not another camera station. */
const STATIONS = [
  { key: 0, name: 'Le livre' },
  { key: .310, name: 'Antiquité' },
  { key: .435, name: 'Moyen Âge' },
  { key: .560, name: 'Grandes découvertes' },
  { key: .685, name: 'XIXe siècle industriel' },
  { key: .810, name: 'Début du XXe siècle' },
];

async function boot() {
  $('#year').textContent = String(new Date().getFullYear());
  const gl = probeWebGL();
  const webgl = gl.ok;
  if (!webgl) html.classList.add('no-webgl');
  app.static = !webgl;
  app.diag = { webgl, webglKind: gl.kind, webglReason: gl.reason, reduced: REDUCED, static: app.static,
    reason: app.static ? `no-webgl (${gl.reason})` : REDUCED ? 'reduced-motion (scene kept)' : 'ok',
    ua: navigator.userAgent, dpr: window.devicePixelRatio || 1 };
  if (app.static) html.classList.add('static-mode');
  if (REDUCED) html.classList.add('reduced-motion');
  // A warm visit replays the same arrival, faster (see the loader rules in main.css).
  try { if (sessionStorage.getItem('cp:seen') === '1') html.classList.add('warm'); } catch (e) { /* private mode */ }
  if (matchMedia('(prefers-reduced-transparency: reduce)').matches) html.classList.add('opaque');
  if (!MOBILE && supportsLiquid()) html.classList.add('liquid');
  if (MOBILE) html.classList.add('is-mobile');

  // never let a slow presentations.json hold the loader: cap the wait
  const libP = Promise.race([renderLibrary($('#cards')).catch(() => {}), wait(6000)]);
  const fontsP = Promise.race([
    document.fonts?.load
      ? Promise.all(['700 40px "UnifrakturCook"', 'italic 400 20px "Source Serif 4"', '400 20px "Source Serif 4"', '500 20px "Libre Franklin"', '600 20px "Libre Franklin"']
        .map((f) => document.fonts.load(f).catch(() => null)))
      : Promise.resolve(),
    wait(4000),
  ]).catch(() => {});
  setBar(.12);
  await fontsP;
  setBar(.3);

  if (webgl) {
    const canvas = $('#scene');
    try {
      const { StoryScene } = await import('./scene.js');
      app.scene = new StoryScene(canvas, { mobile: MOBILE, reduced: REDUCED, onFrame: onSceneFrame });
      await app.scene.init((x) => setBar(.3 + x * .6));
    } catch (err) {
      console.warn('[scene] WebGL init failed, retrying a lighter renderer', err);
      app.scene = null;
      try {
        const { StoryScene } = await import('./scene.js');
        app.scene = new StoryScene(canvas, { mobile: MOBILE, reduced: REDUCED, lite: true, onFrame: onSceneFrame });
        await app.scene.init((x) => setBar(.3 + x * .6));
        app.diag.reason += ' | lite renderer';
      } catch (err2) {
        console.warn('[scene] no usable WebGL, static fallback', err2);
        app.scene = null;
        html.classList.add('no-webgl', 'static-mode');
        app.static = true; app.diag.static = true; app.diag.reason = 'no-webgl (init failed)';
      }
    }
  }
  await Promise.race([libP, wait(1500)]);
  finishBoot();
}

/* ------------------------------------------------------------ overlays */
let texts = [], eraKeys = [], eraNames = [];
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

function initTexts() {
  texts = $$('.stage .chapter').filter((ch) => !ch.classList.contains('chapter--chip')).map((ch) => ({
    ch, items: $$('.rv', ch), tin: parseFloat(ch.dataset.in), tout: parseFloat(ch.dataset.out), shown: null,
  }));
}
function setupEras() {
  const chips = $$('.chapter--chip');
  eraKeys = chips.map((ch) => parseFloat(ch.dataset.key)).filter((k) => Number.isFinite(k)).sort((a, b) => a - b);
  eraNames = chips.map((ch) => $('.chip__era', ch)?.textContent.trim() || '');
}
function chapterLabel(p) {
  if (p < .232) return 'Le livre';
  if (p < .305) return 'Les cartes';
  if (p >= .872) return 'La bibliothèque';
  let i = 0;
  for (let k = 0; k < eraKeys.length; k++) if (p >= eraKeys[k] - .035) i = k;
  return eraNames[i] || 'Les époques';
}

let textsShown = false;
function updateOverlays(p) {
  app.p = p;
  // headlines: opacity + 12px + blur, staggered 0.004 progress per line
  for (const t of texts) {
    let vis = false;
    t.items.forEach((el, j) => {
      const din = Number.isNaN(t.tin) ? 1 : smoothstep(t.tin + j * .004, t.tin + .02 + j * .004, p);
      const dout = Number.isNaN(t.tout) ? 0 : smoothstep(t.tout + j * .003, t.tout + .018 + j * .003, p);
      const o = din * (1 - dout);
      if (o > .001) vis = true;
      const key = o.toFixed(3);
      if (el._o === key) return; el._o = key;
      if (t.ch.classList.contains('chapter--hero') && !app.heroSettled) return;   // CSS intro first
      el.style.opacity = key;
      el.style.transform = o > .999 ? 'none' : `translate3d(0, ${((din < 1 ? 1 : -1) * (1 - o) * 12).toFixed(1)}px, 0)`;
      el.style.filter = o > .99 ? 'none' : `blur(${((1 - o) * 8).toFixed(2)}px)`;
    });
    if (t.shown !== vis) { t.shown = vis; t.ch.style.visibility = vis ? 'visible' : 'hidden'; t.ch.style.opacity = vis ? '1' : '0'; }
    if (vis && !t.lit && app.ready && !REDUCED) {
      t.lit = true; t.ch.classList.add('is-lit');
      setTimeout(() => t.ch.classList.remove('is-lit'), 2800);
    }
  }
  // text scrim: on while the maps/eras copy or an era chip is on screen
  const scrim = Math.max(
    smoothstep(.246, .262, p) * (1 - smoothstep(.322, .342, p)) * .8,
    smoothstep(.352, .366, p) * (1 - smoothstep(.392, .412, p)) * .85,
    0,
  );
  const chipOn = (p > .392 && p < .87) ? .42 : 0;
  const sc = Math.max(scrim, chipOn * smoothstep(.392, .428, p) * (1 - smoothstep(.838, .876, p))).toFixed(3);
  if (html.style.getPropertyValue('--scrim') !== sc) html.style.setProperty('--scrim', sc);
  // the mobile chapter capsule
  const pill = $('#era-pill');
  if (pill) {
    pill.style.setProperty('--pill-o', (smoothstep(.016, .028, p) * (1 - smoothstep(.858, .89, p))).toFixed(3));
    const label = chapterLabel(p), el = $('#era-pill-label');
    if (el && el.textContent !== label) el.textContent = label;
  }
  // The live region is driven by arrivals only (flyToStation → announce): reading
  // several chapter names per flight saturated the screen-reader queue.
  app.eraNow = chapterLabel(p);
}

/* era chips follow the projected front of each diorama base.
   Their box is measured once per resize (see measureChips): reading offsetWidth in
   the frame callback forced a synchronous layout on every single frame. */
const chips = [];
function measureChips() {
  if (!chips.length) $$('.chapter--chip').forEach((el) => chips.push({ el, i: +el.dataset.era }));
  for (const c of chips) {
    c.w = c.el.offsetWidth || 300;
    c.h = c.el.offsetHeight || 90;
  }
}
function onSceneFrame(scene) {
  if (!app.static) updateOverlays(scene.p);
  if (chips.some((c) => !c.w)) measureChips();
  if (app.static) return;
  const anchors = scene.anchors();
  const vw = innerWidth, vh = innerHeight;
  for (const c of chips) {
    const a = anchors[c.i]; if (!a) continue;
    const o = a.z < 1 ? clamp(a.e) : 0;
    if (o <= 0.01) { if (c.vis !== false) { c.el.style.visibility = 'hidden'; c.el.style.opacity = '0'; c.vis = false; } continue; }
    const w = c.w || 300, h = c.h || 90;
    const x = clamp(a.x - w / 2, 16, vw - w - 16), y = clamp(a.y + 18, 70, vh - h - (vw <= 768 ? 66 : 24));
    c.el.style.visibility = 'visible'; c.vis = true;
    c.el.style.opacity = o.toFixed(3);
    c.el.style.transform = `translate3d(${x.toFixed(1)}px, ${(y + (1 - o) * 12).toFixed(1)}px, 0)`;
    c.el.style.filter = o < .99 ? `blur(${((1 - o) * 6).toFixed(2)}px)` : 'none';
  }
}

/* ------------------------------------------------------------ stations */
function announce(name) {
  const st = $('#sr-status'); if (st) st.textContent = name.replace(/<[^>]+>/g, '');
}

function updateAdvance() {
  // The visible cue and the six dots: the stage is clickable, and how far in we are.
  const cue = $('#cue');
  if (cue) cue.style.setProperty('--cue-o', app.station === 0 && !app.flight && !app.panel ? '1' : '0');
  const ticks = $('#ticks');
  if (ticks) {
    ticks.style.setProperty('--ticks-o', app.static ? '0' : (app.panel ? '0' : '1'));
    [...ticks.children].forEach((li, i) => {
      li.classList.toggle('is-on', i <= app.station);
      li.classList.toggle('is-next', i === app.station + 1);
    });
  }
  const btn = $('#advance'); if (!btn) return;
  const next = STATIONS[app.station + 1];
  let label;
  if (app.static) label = 'Ouvrir la bibliothèque';
  else if (!next) label = 'Ouvrir la bibliothèque';
  else if (app.station === 0) label = 'Ouvrir le livre';
  else label = `Passer à l’époque suivante : ${next.name}`;
  btn.setAttribute('aria-label', label);
  // aria-busy is not reliably exposed on a <button>; aria-disabled + a data hook is.
  btn.setAttribute('aria-disabled', String(!!app.flight));
  btn.dataset.state = app.flight ? 'flying' : 'idle';
  btn.classList.toggle('is-flying', !!app.flight);
}

function flyToStation(index, duration) {
  if (!STATIONS[index] || !app.scene) { app.station = index; updateAdvance(); return; }
  app.flight = true;
  updateAdvance();
  app.scene.flyTo(STATIONS[index].key, duration, () => {
    app.station = index;
    app.flight = false;
    updateAdvance();
    announce(STATIONS[index].name);
  });
}

function nextStation() {
  if (app.panel || app.flight) return;
  if (app.static || app.station >= STATIONS.length - 1) { openPanel('bibliotheque'); return; }
  flyToStation(app.station + 1, app.station === 0 ? (REDUCED ? 2.4 : 3.6) : (REDUCED ? 1.0 : 1.8));
}

function prevStation() {
  if (app.panel || app.flight || app.station <= 0) return;
  flyToStation(app.station - 1, REDUCED ? 1.0 : 1.6);
}

function resetToCover() {
  if (app.panel) closePanel();
  if (app.static) { app.station = 0; updateAdvance(); return; }
  if (app.station === 0 && !app.flight) return;
  flyToStation(0, REDUCED ? 1.0 : 1.4);
}

/* ------------------------------------------------------------ panels */
function openPanel(name, { push = true } = {}) {
  if (app.panel === name) return;
  const panel = document.getElementById(name);
  if (!panel) return;
  $$('.panel').forEach((p) => {
    if (p !== panel) { p.classList.remove('is-open'); p.inert = true; p.setAttribute('aria-hidden', 'true'); }
  });
  panel.classList.add('is-open');
  panel.inert = false;
  panel.removeAttribute('aria-hidden');
  app.panel = name;
  html.classList.add('panel-open');
  const stage = $('#voyage'); if (stage) stage.inert = true;
  // The 3D frame is blurred and dimmed by CSS: rendering it at 60 fps behind an
  // opaque panel burns the GPU (and the battery) for zero visible pixels.
  app.scene?.setPaused(true);
  panel.scrollTop = 0;
  updateNavState();
  updateAdvance();
  const title = panel.querySelector('h2');
  if (title) title.focus({ preventScroll: true });
  // A real history entry, so the system back gesture closes the panel instead of
  // leaving the site (iOS/Android expect it).
  if (push) history.pushState({ panel: name }, '', `#${name}`);
}

function closePanel({ fromHistory = false } = {}) {
  if (!app.panel) return;
  if (!fromHistory && history.state?.panel) history.back();
  const panel = document.getElementById(app.panel);
  if (panel) { panel.classList.remove('is-open'); panel.inert = true; panel.setAttribute('aria-hidden', 'true'); }
  app.panel = null;
  html.classList.remove('panel-open');
  const stage = $('#voyage'); if (stage) stage.inert = false;
  app.scene?.setPaused(false);
  updateNavState();
  updateAdvance();
  if (location.hash && PATHS.has(location.hash.slice(1))) history.replaceState(null, '', location.pathname + location.search);
  const back = $('.nav__links a[href="#voyage"]') || $('.nav__brand');
  back?.focus({ preventScroll: true });
}

/* The journeys between the stage, the library and the about page are real history
   entries: back closes the panel, it does not leave the site. */
const PATHS = new Set(['bibliotheque', 'a-propos', 'voyage']);
function setupHistory() {
  addEventListener('popstate', (e) => {
    const panel = e.state?.panel || null;
    if (panel) openPanel(panel, { push: false }); else closePanel({ fromHistory: true });
  });
  // A shared/deep link opens the panel it points at (the hash was stripped at boot).
  if (PATHS.has(INITIAL_HASH) && INITIAL_HASH !== 'voyage') openPanel(INITIAL_HASH, { push: false });
}

/* ------------------------------------------------------------ stage */
function setupStage() {
  const advance = $('#advance');
  advance?.addEventListener('click', () => { $('#cue')?.style.setProperty('--cue-o', '0'); nextStation(); });
  updateOverlays(0);
  app.scene?.setProgress(0);
  app.scene?.frame();
  updateAdvance();
}

function setupStatic() {
  // no 3D: the composed static art stays, and a click opens the library
  const advance = $('#advance');
  advance?.addEventListener('click', nextStation);
  app.scene?.setProgress(.03);
  app.scene?.frame();
  updateOverlays(0);
  updateAdvance();
}

/* ------------------------------------------------------------ reveal */
/* The skip link points at #scenario, a plain anchor on the stage: pointing it at
   #bibliotheque sent keyboard users to a section that starts `inert`. */
function setupSkipLink() {
  const skip = $('.skip');
  if (!skip) return;
  skip.addEventListener('click', (e) => {
    e.preventDefault();
    closePanelIfAny();
    const h1 = $('.chapter--hero .display');
    const target = $('#scenario') || h1;
    if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
    target?.scrollIntoView?.({ block: 'start', behavior: REDUCED ? 'auto' : 'smooth' });
  });
}
function closePanelIfAny() { if (app.panel) closePanel(); }

function setupChipMetrics() {
  measureChips();
  let t = 0;
  addEventListener('resize', () => { clearTimeout(t); t = setTimeout(measureChips, 180); }, { passive: true });
  if (document.fonts?.ready) document.fonts.ready.then(() => setTimeout(measureChips, 100));
  // the mobile breakpoint changes the chip padding and the type size
  matchMedia('(max-width: 768px)').addEventListener?.('change', () => setTimeout(measureChips, 60));
}

function setupReveal() {
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
  }, { rootMargin: '0px 0px -8% 0px', threshold: .08 });
  $$('.rv-io').forEach((el) => io.observe(el));
}

/* ------------------------------------------------------------ navigation */
function updateNavState() {
  const sec = app.panel || 'voyage';
  $$('.nav__links a').forEach((a) => a.setAttribute('aria-current', String(a.hash === `#${sec}`)));
  if (app.navActive !== sec) { app.navActive = sec; updateNavThumb(); }
}

function updateNavThumb() {
  const nav = $('.nav'), thumb = nav?.querySelector('.nav__thumb');
  if (!nav || !thumb) return;
  const a = nav.querySelector('.nav__links a[aria-current="true"]') || nav.querySelector('.nav__links a');
  if (!a) return;
  const nr = nav.getBoundingClientRect(), ar = a.getBoundingClientRect();
  thumb.style.width = `${ar.width}px`;
  thumb.style.transform = `translate3d(${(ar.left - nr.left).toFixed(1)}px, -50%, 0)`;
  thumb.style.opacity = '1';
}

function setupNavState() {
  updateNavState();
  updateNavThumb();
  addEventListener('resize', () => { updateNavState(); updateNavThumb(); }, { passive: true });
  if (document.fonts?.ready) document.fonts.ready.then(updateNavThumb);
}

function setupNav() {
  document.addEventListener('click', (e) => {
    const close = e.target.closest('[data-close]');
    if (close) { e.preventDefault(); closePanel(); return; }
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href').slice(1);
    if (!document.getElementById(id)) return;
    e.preventDefault();
    // History is owned by openPanel/closePanel: replacing the entry here would strand
    // a '#bibliotheque' URL behind a closed panel.
    if (id === 'voyage') { if (app.panel) closePanel(); resetToCover(); }
    else if (id === 'bibliotheque') openPanel('bibliotheque');
    else if (id === 'a-propos') openPanel('a-propos');
  });
}

function setupKeyboard() {
  window.addEventListener('keydown', (e) => {
    if (app.panel) {
      if (e.key === 'Escape') { e.preventDefault(); closePanel(); }
      return;                      // arrows/space stay available to scroll the panel
    }
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target, tag = t.tagName;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || t.isContentEditable) return;
    if (app.flight && e.key !== 'Escape') return;      // one flight at a time
    if ((tag === 'BUTTON' || tag === 'A') && (e.key === ' ' || e.key === 'Enter')) return;
    $('#cue')?.style.setProperty('--cue-o', '0');
    switch (e.key) {
      case 'ArrowRight': case 'ArrowDown': case 'PageDown': case ' ': case 'Enter':
        e.preventDefault(); nextStation(); break;
      case 'ArrowLeft': case 'ArrowUp': case 'PageUp':
        e.preventDefault(); prevStation(); break;
      case 'Home':
        e.preventDefault(); resetToCover(); break;
      case 'End':
        e.preventDefault(); openPanel('bibliotheque'); break;
      default: break;
    }
  });
}

/* ------------------------------------------------------------ finish (once) */
let finished = false;
async function finishBoot() {
  if (finished) return;
  finished = true;
  clearInterval(barTick);
  barReal = 1; paintBar(1);
  // The curtain must never lift before the logo has finished drawing and filling
  // (css/main.css: 2.3 s cold, .86 s warm, .44 s reduced). A shorter floor cut the
  // arrival animation in half, which read as "the logo animation is broken".
  try { sessionStorage.setItem('cp:seen', '1'); } catch (e) { /* private mode */ }
  const minTime = REDUCED ? 520 : (html.classList.contains('warm') ? 950 : 2350);
  const left = Math.max(0, minTime - (performance.now() - T0));
  if (left > 0) await wait(left);

  initTexts();
  setupEras();
  // a scene whose init never got to build its camera path must not be started here
  if (app.scene && app.scene.renderer && app.scene.camKeys) { app.scene.frame(); app.scene.start(); }
  html.classList.add('is-ready');
  loader.classList.add('is-done');
  setTimeout(() => { $$('.chapter--hero .rv').forEach((el) => { el.style.transition = 'none'; el._o = null; }); app.heroSettled = true; }, 1500);

  if (app.static) setupStatic(); else setupStage();
  setupReveal();
  setupChipMetrics();
  setupSkipLink();
  setupNav();
  setupHistory();
  setupNavState();
  setupKeyboard();
  if (html.classList.contains('liquid')) initLiquid();
  window.addEventListener('cp:slow', () => { html.classList.add('low-fx'); killLiquid(); }, { once: true });
  initGlassPointer();
  app.ready = true;

  if (app.scene) setTimeout(() => app.scene.loadMaps().catch((e) => console.warn('[maps]', e)), 300);
  window.addEventListener('pagehide', () => app.scene?.dispose(), { once: true });
}

/* absolute safety net: the cover lifts and the page becomes usable at 9 s */
setTimeout(() => { if (!finished) finishBoot(); }, 9000);

boot().catch((e) => {
  console.error(e);
  app.static = !app.scene;
  if (app.diag) { app.diag.static = app.static; app.diag.reason = app.static ? 'boot error' : app.diag.reason; }
  if (app.static) html.classList.add('static-mode');
  finishBoot();
});
