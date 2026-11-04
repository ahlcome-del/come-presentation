/**
 * Côme Presentation — boot & orchestration.
 *  - feature detection (WebGL, reduced motion, mobile, Chromium liquid glass)
 *  - preloader, library rendering, 3D scene (lazy-imported)
 *  - Lenis smooth scroll + GSAP ScrollTrigger master timeline (scrub) driving the scene
 *  - text overlays, era chips, progress indicator, keyboard, nav
 *  - static mode (ONLY when WebGL is genuinely unavailable): normal scroll, composed frames
 *  - reduced motion (OS setting) is a MODIFIER: the journey keeps running, only the
 *    automatic motion (idle float, pointer parallax, grain) is toned down.
 */
import { gsap, ScrollTrigger, Lenis } from './vendor/libs.js';
import { renderLibrary } from './library.js';
import { supportsLiquid, initLiquid, initGlassPointer } from './glass.js';

const html = document.documentElement;
const params = new URLSearchParams(location.search);

/* A reload always starts at the cover: never restore the previous scroll offset,
   and drop any #anchor so the browser cannot jump into the library. */
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
if (location.hash) history.replaceState(null, '', location.pathname + location.search);
window.scrollTo(0, 0);
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches || params.has('reduced');
const MOBILE = matchMedia('(max-width: 768px)').matches || matchMedia('(pointer: coarse)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

/** CSS-identical easing for GSAP: cubic-bezier(.28,.11,.32,1) */
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  return (x) => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) { const e = ((ax * t + bx) * t + cx) * t - x, d = (3 * ax * t + 2 * bx) * t + cx; if (Math.abs(e) < 1e-5 || !d) break; t -= e / d; }
    return ((ay * t + by) * t + cy) * t;
  };
}
const EASE = bezier(.28, .11, .32, 1);

/*
 * WebGL is the only thing that may drop the page into static mode. On Windows with
 * an integrated GPU, WebGL2 can be missing or blacklisted while WebGL1 still works,
 * so probe in order and remember what answered: webgl2 → webgl1. (three r169 can
 * render on WebGL1; the renderer is created with a fallback anyway, see scene.js.)
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
/*
 * The bar never waits on anything. It fills on its own clock (a damped ease-out
 * reaching ~.9 in 3 s), and the real loading progress can only push it further:
 * max() of the two, and never backwards. So a slow scene, a stuck font or a
 * presentations.json that never resolves can no longer leave it parked mid-way.
 */
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
const app = { scene: null, lenis: null, st: null, p: 0, ready: false, static: false };
window.__cp = app;   // handy for QA / debugging

async function boot() {
  const t0 = performance.now();
  $('#year').textContent = String(new Date().getFullYear());
  const gl = probeWebGL();
  const webgl = gl.ok;
  if (!webgl) html.classList.add('no-webgl');
  // reduced motion must NEVER cost the user the journey: it only mutes the automatic
  // motion (idle float, pointer parallax, grain) — see scene.js and css/main.css
  app.static = !webgl;
  app.reduced = REDUCED;
  app.diag = { webgl, webglKind: gl.kind, webglReason: gl.reason, reduced: REDUCED, static: app.static,
    reason: app.static ? `no-webgl (${gl.reason})` : REDUCED ? 'reduced-motion (scene kept)' : 'ok',
    ua: navigator.userAgent, dpr: window.devicePixelRatio || 1 };
  if (app.static) html.classList.add('static-mode');
  // the OS "reduce motion" preference only switches off the decorative loops
  if (REDUCED) html.classList.add('reduced-motion');
  if (!MOBILE && supportsLiquid()) html.classList.add('liquid');
  if (MOBILE) html.classList.add('is-mobile');

  // never let a slow presentations.json hold the loader: cap the wait, the cards still fill in when it arrives
  const libP = Promise.race([renderLibrary($('#cards')).catch(() => {}), wait(6000)]);
  const fontsP = Promise.race([
    Promise.all(['700 40px "UnifrakturCook"', 'italic 400 20px "Source Serif 4"', '400 20px "Source Serif 4"', '500 20px "Libre Franklin"', '600 20px "Libre Franklin"']
      .map((f) => document.fonts.load(f))),
    wait(4000),
  ]).catch(() => {});
  setBar(.12);
  await fontsP;
  setBar(.3);

  if (webgl) {
    try {
      const { StoryScene } = await import('./scene.js');
      const canvas = $('#scene');
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
        // only here — no working 3D at all — does the page fall back to the static art
        console.warn('[scene] no usable WebGL, static fallback', err2);
        app.scene = null;
        html.classList.add('no-webgl', 'static-mode');
        app.static = true; app.diag.static = true; app.diag.reason = 'no-webgl (init failed)';
      }
    }
  }
  // the cards still fill in when they arrive; the loader does not wait for them past the cap
  await Promise.race([libP, wait(1500)]);

  finishBoot();
}

/* ------------------------------------------------------------ scroll story */
/*
 * Scroll only sets a TARGET progress. The scene damps its own progress towards it
 * every frame (see scene.js), and every overlay below (headlines, era captions,
 * letterbox, progress line, backdrop blur) is computed from that same damped value
 * in onSceneFrame — so text and 3D can never drift apart, and a fast scroll
 * simply glides through the journey.
 */
function setupScroll() {
  gsap.registerPlugin(ScrollTrigger);
  const lenis = app.lenis = new Lenis({ duration: 1.15, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  app.st = ScrollTrigger.create({
    trigger: '#voyage', start: 'top top', endTrigger: '#bibliotheque', end: 'top top',
    invalidateOnRefresh: true,
    onUpdate: (self) => onProgress(self.progress),
  });
  texts = $$('.stage .chapter').filter((ch) => !ch.classList.contains('chapter--chip')).map((ch) => ({
    ch, items: $$('.rv', ch), tin: parseFloat(ch.dataset.in), tout: parseFloat(ch.dataset.out), shown: null,
  }));
  setupKeyboard();
  setupEraPauses(lenis);
  // a reload must land on the cover: kill any restored offset, re-measure the
  // trigger, and take progress from the real scroll position (0), not a stale one
  const toTop = () => { if (lenis.scroll !== 0) lenis.scrollTo(0, { immediate: true, force: true }); window.scrollTo(0, 0); };
  toTop();
  ScrollTrigger.refresh();
  toTop();
  onProgress(0);
}

/* ------------------------------------------------------------ pauses */
/*
 * Scroll pauses: each time the scroll crosses a STOP, scrolling is cut dead on that
 * exact position (no inertia left), input is locked, and the visitor has to start a
 * NEW gesture (new wheel flick, key press, touch) to continue — in either direction.
 *
 * STOPS = progress values (0..1 of the journey). By default: the 5 era dioramas,
 * read from the data-key of each .chapter--chip so they always match the markup.
 * To also pause on the book / the maps, add e.g. 0.11 (book open) and 0.258 (maps)
 * to EXTRA_STOPS below.
 */
const EXTRA_STOPS = [];            // e.g. [0.11, 0.258]
const PAUSE_MIN_LOCK = 650;        // ms: minimum time held on a stop before a new gesture can release it
const WHEEL_GAP = 110;             // ms of wheel silence that separates "inertia tail" from "new gesture"
const pause = { stops: [], locked: false, lockY: 0, lockedAt: 0, ignore: -1, progUntil: 0 };
app.pause = pause;

function setupEraPauses(lenis) {
  const keys = [...$$('.chapter--chip').map((c) => parseFloat(c.dataset.key)), ...EXTRA_STOPS]
    .filter((k) => !Number.isNaN(k)).sort((a, b) => a - b);
  const span = () => (app.st ? app.st.end - app.st.start : 1);
  const stopsY = () => keys.map((k) => progressToY(k));
  const margin = () => Math.max(40, span() * .02);   // distance to move away before a stop re-arms
  let prev = lenis.scroll;
  let lastWheel = 0, lastAbs = 0;

  const release = () => {
    if (!pause.locked) return;
    pause.locked = false;
    lenis.start();
  };
  const canRelease = () => pause.locked && performance.now() - pause.lockedAt > PAUSE_MIN_LOCK;
  pause.tryRelease = () => { if (canRelease()) { release(); return true; } return false; };

  const lockAt = (idx, y) => {
    pause.locked = true; pause.lockY = y; pause.lockedAt = performance.now(); pause.ignore = idx;
    lastWheel = performance.now(); lastAbs = 1e9;      // the gesture in progress can never release it
    lenis.scrollTo(y, { immediate: true, force: true }); // snap + kill velocity/inertia
    lenis.reset?.();
    lenis.stop();
    prev = y;
  };

  lenis.on('scroll', ({ scroll }) => {
    if (pause.locked) {                                // native touch / scrollbar drift: pin it
      if (Math.abs(scroll - pause.lockY) > 1) { lenis.scrollTo(pause.lockY, { immediate: true, force: true }); }
      prev = pause.lockY; return;
    }
    const ys = stopsY();
    // re-arm the stop we just left
    if (pause.ignore >= 0 && Math.abs(scroll - ys[pause.ignore]) > margin()) pause.ignore = -1;
    if (performance.now() < pause.progUntil) { prev = scroll; return; }   // programmatic jumps (nav, Home/End) don't pause
    let hit = -1;
    if (scroll > prev) {                               // going down: nearest stop crossed
      for (let i = 0; i < ys.length; i++) if (i !== pause.ignore && prev < ys[i] && scroll >= ys[i]) { hit = i; break; }
    } else if (scroll < prev) {                        // going up
      for (let i = ys.length - 1; i >= 0; i--) if (i !== pause.ignore && prev > ys[i] && scroll <= ys[i]) { hit = i; break; }
    }
    prev = scroll;
    if (hit >= 0) lockAt(hit, ys[hit]);
  });

  // new gesture detection (capture: runs before Lenis' own wheel handler, so the releasing flick isn't lost)
  window.addEventListener('wheel', (e) => {
    if (!pause.locked) return;
    const now = performance.now(), abs = Math.abs(e.deltaY) + Math.abs(e.deltaX);
    const gap = now - lastWheel, rising = abs > lastAbs * 1.6 + 4;
    lastWheel = now; lastAbs = abs;
    if (canRelease() && (gap > WHEEL_GAP || rising)) release();
  }, { capture: true, passive: true });
  window.addEventListener('touchstart', () => { pause.tryRelease(); }, { capture: true, passive: true });

  // after a programmatic jump ends, don't re-trigger a stop we landed right next to
  pause.afterProgrammatic = () => {
    const ys = stopsY(), s = lenis.scroll;
    ys.forEach((y, i) => { if (Math.abs(s - y) <= margin()) pause.ignore = i; });
    prev = s;
  };
}

function onProgress(p) {
  app.target = p;
  app.scene?.setProgress(p);
}

/* ------------------------------------------------------------ overlays (from damped p) */
let texts = [];
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
function updateOverlays(p) {
  app.p = p;
  // headlines: opacity + 12px + blur, staggered 0.004 progress per line (≈ 60–80 ms at reading speed)
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
  }
  // cinema letterbox during the journey
  html.style.setProperty('--lb', (smoothstep(.262, .30, p) * (1 - smoothstep(.845, .885, p))).toFixed(3));
  // text scrim: on while the maps/eras copy or an era chip is on screen (they can sit over a busy frame)
  const scrim = Math.max(
    smoothstep(.246, .262, p) * (1 - smoothstep(.322, .342, p)) * .8,
    smoothstep(.352, .366, p) * (1 - smoothstep(.392, .412, p)) * .85,
    0,
  );
  const chipOn = (p > .392 && p < .87) ? .42 : 0;
  const sc = Math.max(scrim, chipOn * smoothstep(.392, .428, p) * (1 - smoothstep(.838, .876, p))).toFixed(3);
  if (html.style.getPropertyValue('--scrim') !== sc) html.style.setProperty('--scrim', sc);
  // library: the 3D becomes a blurred, dimmed backdrop
  const lb = EASE(clamp((p - .885) / .1));
  const canvas = $('#scene');
  const f = lb > 0.001 ? `blur(${(lb * (MOBILE ? 1.6 : 2.4)).toFixed(2)}px) brightness(${(1 - lb * .2).toFixed(3)})` : '';
  if (canvas.style.filter !== f) canvas.style.filter = f;
  const fill = $('#progress-fill'); if (fill) fill.style.setProperty('--p', p.toFixed(4));
  const idx = p < .232 ? 0 : p < .345 ? 1 : p < .872 ? 2 : 3;
  $$('#progress button').forEach((b, i) => { b.classList.toggle('is-active', i === idx); b.setAttribute('aria-current', String(i === idx)); });
  $('#progress').classList.toggle('is-hidden', p > .97);
  // announce the era (and the chapter changes) politely, once each
  const eraNow = p < .232 ? 'Le livre' : p < .345 ? 'Les cartes' : p < .872 ? 'Les époques' : 'La bibliothèque';
  if (app.eraNow !== eraNow) { app.eraNow = eraNow; const st = $('#sr-status'); if (st) st.textContent = eraNow; }
  $$('.nav__links a').forEach((a) => a.setAttribute('aria-current', String((a.hash === '#voyage' && p < .91) || (a.hash === '#bibliotheque' && p >= .91))));
}

/* era chips follow the projected front of each diorama base */
const chips = [];
function onSceneFrame(scene) {
  if (!app.static) updateOverlays(scene.p);
  if (!chips.length) $$('.chapter--chip').forEach((el) => chips.push({ el, i: +el.dataset.era }));
  if (app.static) return;
  const anchors = scene.anchors();
  const vw = innerWidth, vh = innerHeight;
  for (const c of chips) {
    const a = anchors[c.i]; if (!a) continue;
    const o = a.z < 1 ? clamp(a.e) : 0;
    const focused = c.el.contains(document.activeElement);
    if (o <= 0.01 && !focused) { if (c.vis !== false) { c.el.style.visibility = 'hidden'; c.el.style.opacity = '0'; c.vis = false; } continue; }
    const w = c.el.offsetWidth || 300, h = c.el.offsetHeight || 90;
    const x = clamp(a.x - w / 2, 16, vw - w - 16), y = clamp(a.y + 18, 70, vh - h - 24);
    c.el.style.visibility = 'visible'; c.vis = true;
    c.el.style.opacity = (focused ? Math.max(o, .35) : o).toFixed(3);
    c.el.style.transform = `translate3d(${x.toFixed(1)}px, ${(y + (1 - o) * 12).toFixed(1)}px, 0)`;
    c.el.style.filter = o < .99 ? `blur(${((1 - o) * 6).toFixed(2)}px)` : 'none';
  }
}

addEventListener('load', () => { if (!app.ready) return; if (app.lenis) app.lenis.scrollTo(0, { immediate: true, force: true }); }, { once: true });

/* ------------------------------------------------------------ static mode */
function setupStatic() {
  const scene = app.scene;
  const canvas = $('#scene');
  if (!scene) return;
  let current = -1;
  const show = (key) => {
    if (key === current) return; current = key;
    canvas.style.opacity = '0';
    setTimeout(() => {
      scene.setProgress(key);
      canvas.style.filter = key > .9 ? 'blur(2.4px) brightness(.8)' : 'none';
      canvas.style.opacity = '1';
    }, 260);
  };
  // the picture always follows the chapter whose centre is closest to the viewport centre,
  // so a caption is never shown over the previous era's picture
  $('#bibliotheque').dataset.key = '0.95';
  const chapters = [...$$('.stage .chapter'), $('#bibliotheque')];
  let raf = 0;
  const pick = () => {
    raf = 0;
    const mid = innerHeight / 2; let best = null, bd = Infinity;
    for (const ch of chapters) {
      const r = ch.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) continue;
      const d = Math.abs((r.top + r.bottom) / 2 - mid);
      if (d < bd) { bd = d; best = ch; }
    }
    if (best) show(parseFloat(best.dataset.key));
  };
  addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(pick); }, { passive: true });
  addEventListener('resize', pick);
  requestAnimationFrame(pick);
  scene.setProgress(.03);
}

/* ------------------------------------------------------------ reveal on scroll */
function setupReveal() {
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
  }, { rootMargin: '0px 0px -8% 0px', threshold: .08 });
  $$('.rv-io').forEach((el) => io.observe(el));
}

/* ------------------------------------------------------------ navigation */
function scrollToY(y, opts = {}) {
  if (app.lenis) {
    const d = opts.duration ?? 1.8;
    pause.locked = false; app.lenis.start();                       // a click on the nav always wins over a pause
    pause.progUntil = performance.now() + d * 1000 + 150;          // no pauses while a programmatic scroll runs
    setTimeout(() => pause.afterProgrammatic?.(), d * 1000 + 200);
    app.lenis.scrollTo(y, { duration: 1.8, easing: EASE, ...opts });
  }
  else window.scrollTo({ top: y, behavior: REDUCED ? 'auto' : 'smooth' });
}
function progressToY(p) {
  const st = app.st;
  if (!st) return 0;
  return st.start + p * (st.end - st.start);
}
app.progressToY = progressToY;

function setupNav() {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href').slice(1);
    const target = document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    const y = id === 'voyage' ? 0 : target.getBoundingClientRect().top + window.scrollY;
    scrollToY(y);
    // keep the hash out of the URL: a reload would jump straight there
    history.replaceState(null, '', location.pathname + location.search);
    if (id !== 'voyage') app.navTarget = id;
    if (id !== 'voyage') { target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true }); }
  });
  $$('#progress button').forEach((b) => b.setAttribute('aria-current', 'false'));
  $$('#progress button').forEach((b) => b.addEventListener('click', () => {
    const g = b.dataset.goto;
    if (g === 'library') scrollToY($('#bibliotheque').getBoundingClientRect().top + window.scrollY);
    else scrollToY(progressToY(parseFloat(g)));
  }));
}

function setupKeyboard() {
  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target, tag = t.tagName;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || t.isContentEditable) return;
    const lenis = app.lenis; if (!lenis) return;
    if (pause.locked) {                                  // paused on a stop: a key press is a new gesture
      if (['PageDown', 'PageUp', ' ', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
        if (e.key === ' ' && (tag === 'BUTTON' || tag === 'A')) return;
        e.preventDefault();
        if (e.repeat || !pause.tryRelease()) return;     // held key / too soon: stay put
      } else return;
    }
    const vh = innerHeight; let d = null;
    switch (e.key) {
      case 'PageDown': d = vh * .9; break;
      case 'PageUp': d = -vh * .9; break;
      case ' ': if (tag === 'BUTTON' || tag === 'A') return; d = (e.shiftKey ? -1 : 1) * vh * .9; break;
      case 'ArrowDown': d = vh * .3; break;
      case 'ArrowUp': d = -vh * .3; break;
      case 'Home': e.preventDefault(); scrollToY(0, { duration: 1.4 }); return;
      case 'End': e.preventDefault(); scrollToY(lenis.limit, { duration: 1.4 }); return;
      default: return;
    }
    e.preventDefault();
    // lock: a new keypress takes over from the previous glide, so rapid presses always land
    lenis.scrollTo(clamp(lenis.targetScroll + d, 0, lenis.limit), { duration: .7, easing: EASE });
  });
}

/* ------------------------------------------------------------ finish (once) */
/*
 * Everything that must happen exactly once when the cover lifts: the bar completes,
 * the silhouette's drawing animation is allowed to finish (2.1 s stroke + fill at
 * 1.5 s, so ~2.4 s of display before the fade), the loader fades, and the story
 * (scroll or static) is wired up. Safe to call twice: a hard safety timer and the
 * normal end of boot() can race, and only the first one does the work.
 */
let finished = false;
async function finishBoot() {
  if (finished) return;
  finished = true;
  clearInterval(barTick);
  barReal = 1; paintBar(1);                                  // visible full bar…
  const minTime = REDUCED ? 700 : 2400;                      // …held while the mark draws itself
  const left = Math.max(0, minTime - (performance.now() - T0));
  if (left > 0) await wait(left);
  // a scene whose init never got to build its camera path must not be started here:
  // the safety net may fire while init() is still walking
  if (app.scene && app.scene.renderer && app.scene.camKeys) { app.scene.frame(); app.scene.start(); }
  html.classList.add('is-ready');
  loader.classList.add('is-done');                           // fade only once the mark is drawn
  setTimeout(() => { $$('.chapter--hero .rv').forEach((el) => { el.style.transition = 'none'; el._o = null; }); app.heroSettled = true; }, 1500);

  if (app.static) setupStatic(); else setupScroll();
  setupReveal();
  setupNav();
  if (html.classList.contains('liquid')) initLiquid();
  window.addEventListener('cp:slow', () => html.classList.remove('liquid'), { once: true });
  initGlassPointer({ tilt: !REDUCED });
  app.ready = true;

  // maps are drawn in idle slices after first paint
  if (app.scene) setTimeout(() => app.scene.loadMaps().catch((e) => console.warn('[maps]', e)), 300);
  window.addEventListener('pagehide', () => app.scene?.dispose(), { once: true });
}

/* absolute safety net: whatever hangs (a promise that never settles, a WebGL driver
   that stalls, a font request), the cover lifts and the page becomes usable at 9 s */
setTimeout(() => { if (!finished) finishBoot(); }, 9000);

boot().catch((e) => {
  console.error(e);
  // a thrown boot leaves no usable 3D: fall back to the composed static art
  app.static = !app.scene;
  if (app.diag) { app.diag.static = app.static; app.diag.reason = app.static ? 'boot error' : app.diag.reason; }
  if (app.static) html.classList.add('static-mode');
  finishBoot();
});
