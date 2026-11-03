/**
 * Côme Presentation — boot & orchestration.
 *  - feature detection (WebGL, reduced motion, mobile, Chromium liquid glass)
 *  - preloader, library rendering, 3D scene (lazy-imported)
 *  - Lenis smooth scroll + GSAP ScrollTrigger master timeline (scrub) driving the scene
 *  - text overlays, era chips, progress indicator, keyboard, nav
 *  - static mode (prefers-reduced-motion / no WebGL): normal scroll, composed frames
 */
import { gsap, ScrollTrigger, Lenis } from './vendor/libs.js';
import { renderLibrary } from './library.js';
import { supportsLiquid, initLiquid, initGlassPointer } from './glass.js';

const html = document.documentElement;
const params = new URLSearchParams(location.search);
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

function hasWebGL() {
  if (params.has('nowebgl')) return false;
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
  catch { return false; }
}

/* ------------------------------------------------------------ loader */
const loader = $('#loader'), bar = $('#loader-bar');
const setBar = (x) => { if (bar) bar.style.transform = `scaleX(${clamp(x)})`; };

/* ------------------------------------------------------------ state */
const app = { scene: null, lenis: null, st: null, p: 0, ready: false, static: false };
window.__cp = app;   // handy for QA / debugging

async function boot() {
  const t0 = performance.now();
  $('#year').textContent = String(new Date().getFullYear());
  const webgl = hasWebGL();
  if (!webgl) html.classList.add('no-webgl');
  app.static = REDUCED || !webgl;
  if (app.static) html.classList.add('static-mode');
  if (!MOBILE && supportsLiquid()) html.classList.add('liquid');
  if (MOBILE) html.classList.add('is-mobile');

  const libP = renderLibrary($('#cards'));
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
      console.error('[scene] WebGL init failed, static fallback', err);
      app.scene = null;
      html.classList.add('no-webgl', 'static-mode'); app.static = true;
    }
  }
  await libP;
  setBar(1);

  // let the silhouette finish drawing (skipped with reduced motion)
  const minTime = REDUCED ? 0 : 1900;
  await wait(Math.max(0, minTime - (performance.now() - t0)));

  if (app.scene) { app.scene.frame(); app.scene.start(); }
  loader.classList.add('is-done');
  html.classList.add('is-ready');
  setTimeout(() => $$('.chapter--hero .rv').forEach((el) => { el.style.transition = 'none'; }), 1500);

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

/* ------------------------------------------------------------ scroll story */
function setupScroll() {
  gsap.registerPlugin(ScrollTrigger);
  const lenis = app.lenis = new Lenis({ duration: 1.15, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  const state = { p: 0 };
  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: { trigger: '#voyage', start: 'top top', endTrigger: '#bibliotheque', end: 'top top', scrub: 1, invalidateOnRefresh: true },
  });
  app.st = tl.scrollTrigger;
  tl.to(state, { p: 1, duration: 1, onUpdate: () => onProgress(state.p) }, 0);

  // text blocks: opacity + 12px + blur, staggered
  const IN = { opacity: 0, y: 12, filter: 'blur(8px)' }, SHOWN = { opacity: 1, y: 0, filter: 'blur(0px)' };
  $$('.stage .chapter').forEach((ch) => {
    if (ch.classList.contains('chapter--chip')) return;
    const items = $$('.rv', ch);
    const tin = parseFloat(ch.dataset.in), tout = parseFloat(ch.dataset.out);
    if (!Number.isNaN(tin)) {
      tl.set(ch, { autoAlpha: 1 }, tin - .0005);
      tl.fromTo(items, IN, { ...SHOWN, duration: .024, stagger: .006, ease: EASE }, tin);
    }
    if (!Number.isNaN(tout)) {
      tl.to(items, { opacity: 0, y: -12, filter: 'blur(8px)', duration: .02, stagger: .004, ease: EASE }, tout);
      tl.set(ch, { autoAlpha: 0 }, tout + .036);
    }
  });
  // cinema letterbox during maps & eras; blurred/dimmed backdrop for the library
  tl.fromTo(html, { '--lb': 0 }, { '--lb': 1, duration: .04 }, .31);
  tl.to(html, { '--lb': 0, duration: .04 }, .8);

  setupKeyboard();
  onProgress(0);
}

function onProgress(p) {
  app.p = p;
  app.scene?.setProgress(p);
  // library: the 3D becomes a blurred, dimmed backdrop (no filter at all before)
  const lb = EASE(clamp((p - .87) / .1));
  const canvas = $('#scene');
  const f = lb > 0 ? `blur(${(lb * (MOBILE ? 5 : 8)).toFixed(2)}px) brightness(${(1 - lb * .45).toFixed(3)})` : '';
  if (canvas.style.filter !== f) canvas.style.filter = f;
  const fill = $('#progress-fill'); if (fill) fill.style.setProperty('--p', p.toFixed(4));
  const idx = p < .3 ? 0 : p < .52 ? 1 : p < .86 ? 2 : 3;
  $$('#progress button').forEach((b, i) => b.classList.toggle('is-active', i === idx));
  $('#progress').classList.toggle('is-hidden', p > .985);
  $$('.nav__links a').forEach((a) => a.setAttribute('aria-current', String((a.hash === '#voyage' && p < .9) || (a.hash === '#bibliotheque' && p >= .9))));
}

/* era chips follow the projected front of each diorama base */
const chips = [];
function onSceneFrame(scene) {
  if (app.static || !scene.dioramas.length) {
    if (!app.static) chips.forEach((c) => c && (c.el.style.visibility = 'hidden'));
    return;
  }
  if (!chips.length) $$('.chapter--chip').forEach((el) => chips.push({ el, i: +el.dataset.era }));
  const anchors = scene.anchors();
  const vw = innerWidth, vh = innerHeight;
  for (const c of chips) {
    const a = anchors[c.i]; if (!a) continue;
    const o = clamp((a.e - .25) / .5);
    if (o <= 0.01) { if (c.vis !== false) { c.el.style.visibility = 'hidden'; c.el.style.opacity = '0'; c.vis = false; } continue; }
    const w = c.el.offsetWidth || 300, h = c.el.offsetHeight || 90;
    const x = clamp(a.x - w / 2, 16, vw - w - 16), y = clamp(a.y + 18, 70, vh - h - 24);
    c.el.style.visibility = 'visible'; c.vis = true;
    c.el.style.opacity = o.toFixed(3);
    c.el.style.transform = `translate3d(${x.toFixed(1)}px, ${(y + (1 - o) * 12).toFixed(1)}px, 0)`;
    c.el.style.filter = o < .99 ? `blur(${((1 - o) * 6).toFixed(2)}px)` : 'none';
  }
}

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
      canvas.style.filter = key > .9 ? 'blur(8px) brightness(.62)' : 'none';
      canvas.style.opacity = '1';
    }, 260);
  };
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) show(parseFloat(en.target.dataset.key));
  }, { rootMargin: '-45% 0px -45% 0px' });
  $$('.stage .chapter').forEach((ch) => io.observe(ch));
  $('#bibliotheque').dataset.key = '0.95';
  io.observe($('#bibliotheque'));
  if (!scene.dioramas.length) scene.ensureDioramas();
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
  if (app.lenis) app.lenis.scrollTo(y, { duration: 1.8, easing: EASE, ...opts });
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
    history.replaceState(null, '', `#${id}`);
    if (id !== 'voyage') { target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true }); }
  });
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
    const vh = innerHeight; let d = null;
    switch (e.key) {
      case 'PageDown': d = vh * .9; break;
      case 'PageUp': d = -vh * .9; break;
      case ' ': if (tag === 'BUTTON' || tag === 'A') return; d = (e.shiftKey ? -1 : 1) * vh * .9; break;
      case 'ArrowDown': d = vh * .3; break;
      case 'ArrowUp': d = -vh * .3; break;
      case 'Home': e.preventDefault(); lenis.scrollTo(0, { duration: 2.2, easing: EASE }); return;
      case 'End': e.preventDefault(); lenis.scrollTo(lenis.limit, { duration: 2.2, easing: EASE }); return;
      default: return;
    }
    e.preventDefault();
    lenis.scrollTo(clamp(lenis.targetScroll + d, 0, lenis.limit), { duration: 1.1, easing: EASE });
  });
}

boot().catch((e) => {
  console.error(e);
  loader?.classList.add('is-done');
  html.classList.add('is-ready', 'static-mode');
});
