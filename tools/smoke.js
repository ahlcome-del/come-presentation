/**
 * Headless smoke test (jsdom) — catches wiring mistakes that `node --check` cannot:
 * a missing selector, a handler bound to nothing, a module that throws at import.
 *
 *   npm run smoke
 *
 * The real product is WebGL, which jsdom does not implement: the scene is stubbed by
 * `?nowebgl` (the site's own fallback path, which exercises the static-mode wiring),
 * and a fake `__cp.scene` exercises the flyTo / pause / resume contract.
 * This is not a substitute for a browser pass; it is the cheap safety net.
 */
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const html = await readFile(new URL('index.html', root), 'utf8');

const problems = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => problems.push(`jsdomError: ${e.message}`));
vc.on('warn', (m) => { if (!/Could not parse CSS|not implemented/i.test(m)) problems.push(`warn: ${m}`); });

const dom = new JSDOM(html, {
  url: 'http://localhost:8790/?nowebgl',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: vc,
});
const { window } = dom;

/* ---- the minimum browser surface the modules touch ---- */
window.matchMedia = (q) => ({
  matches: /max-width: 768px|pointer: coarse|prefers-reduced-motion: reduce/.test(q) ? false : false,
  media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
});
window.ResizeObserver = window.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
window.requestIdleCallback = (fn) => setTimeout(fn, 0);
window.CSS = window.CSS || { supports: () => true };
// jsdom has no font loader; the site caps it at 4 s, we answer immediately.
Object.defineProperty(window.document, 'fonts', {
  configurable: true,
  value: { load: async () => [], ready: Promise.resolve() },
});
window.fetch = async (url) => ({
  ok: true,
  json: async () => (String(url).includes('presentations.json')
    ? JSON.parse(await readFile(new URL('presentations.json', root), 'utf8'))
    : {}),
});
const errors = [];
window.addEventListener('error', (e) => errors.push(e.message));
window.addEventListener('unhandledrejection', (e) => errors.push(String(e.reason)));

/* The modules are ES modules and jsdom cannot execute them, so they are imported in
   Node's realm with the jsdom window installed as the global surface. Everything the
   site touches is therefore the real DOM, not a mock. */
for (const key of ['window', 'document', 'location', 'history', 'navigator', 'matchMedia',
  'ResizeObserver', 'IntersectionObserver', 'requestIdleCallback', 'requestAnimationFrame',
  'cancelAnimationFrame', 'CSS', 'fetch', 'getComputedStyle', 'sessionStorage',
  'localStorage', 'innerWidth', 'innerHeight', 'devicePixelRatio', 'addEventListener',
  'removeEventListener', 'dispatchEvent', 'CustomEvent', 'MutationObserver', 'scrollTo',
  'Element', 'HTMLElement', 'Node', 'SVGElement', 'DocumentFragment']) {
  if (!(key in window)) continue;
  try { globalThis[key] = window[key]; }
  catch { Object.defineProperty(globalThis, key, { value: window[key], configurable: true }); }
}
globalThis.self = window;
window.scrollTo = () => {};          // not implemented in jsdom, and boot calls it
window.requestAnimationFrame = window.requestAnimationFrame || ((cb) => setTimeout(() => cb(performance.now()), 16));

/* ---- boot ---- */
const t0 = Date.now();
await import(new URL('js/main.js', root)).catch((e) => problems.push(`import main.js: ${e.message}`));
await new Promise((r) => setTimeout(r, 50));
const doc = window.document;
const app = window.__cp;

/* The curtain must outlast the logo animation (2.3 s cold, .86 s warm). */
await new Promise((r) => setTimeout(r, 2600));

const $ = (s) => doc.querySelector(s);
const ok = (cond, msg) => { if (!cond) problems.push(msg); };

ok(!!app, 'window.__cp is not exposed (boot did not start)');
ok(doc.documentElement.classList.contains('is-ready'), 'html.is-ready missing (boot never finished)');
ok($('#loader')?.classList.contains('is-done'), 'the loader was never dismissed');
ok($('#year')?.textContent === String(new Date().getFullYear()), 'footer year not set');
{
  const css = await readFile(new URL('css/main.css', root), 'utf8');
  const mark = css.match(/\.loader__mark\s*\{([\s\S]*?)\}/);
  const warm = css.match(/html\.warm \.loader__mark\s*\{([\s\S]*?)\}/);
  const sec = (block, v) => Number((block?.[1] || '').match(new RegExp(`--mark-${v}:\\s*([\\d.]+)s`))?.[1] || 0) * 1000;
  const endCold = Math.max(sec(mark, 'draw'), sec(mark, 'delay') + sec(mark, 'fill'));
  const endWarm = Math.max(sec(warm, 'draw'), sec(warm, 'delay') + sec(warm, 'fill'));
  console.log(`  loader: logo drawn by ${endCold} ms (cold) / ${endWarm} ms (warm), curtain at 2350 / 950 ms`);
  ok(endCold > 0 && endCold < 2350, `the cold curtain (2350 ms) cuts the logo animation (${endCold} ms)`);
  ok(endWarm > 0 && endWarm < 950, `the warm curtain (950 ms) cuts the logo animation (${endWarm} ms)`);
}
ok(doc.querySelectorAll('#cards .card').length >= 1, 'the library rendered no card');
ok($('#cards .card--soon'), 'the "Bientôt" ghost tile is missing');
ok($('#scene'), 'the canvas is missing');

/* ---- static mode (the ?nowebgl path) ---- */
ok(doc.documentElement.classList.contains('static-mode'), 'static-mode class missing under ?nowebgl');
ok($('#advance')?.getAttribute('aria-label') === 'Ouvrir la bibliothèque', 'static advance label wrong');

/* ---- the six dots + the click cue ---- */
ok(doc.querySelectorAll('#ticks li').length === 6, 'expected 6 progress ticks');
ok($('#cue'), 'the click cue is missing');

/* ---- navigation: library panel, history, escape ---- */
const nav = $('.nav__links a[href="#bibliotheque"]');
nav?.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 30));
ok($('#bibliotheque').classList.contains('is-open'), 'clicking Bibliothèque did not open the panel');
ok($('#bibliotheque').getAttribute('aria-hidden') !== 'true', 'the open panel is still aria-hidden');
ok($('#voyage').inert === true, 'the stage was not made inert behind the panel');
ok(window.location.hash === '#bibliotheque', 'no history entry for the panel');

doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
await new Promise((r) => setTimeout(r, 30));

/* ---- the fake scene contract: flyTo, setPaused ---- */
let paused = 0, started = 0;
const fake = {
  p: 0, camKeys: [], renderer: {}, mouse: { distanceToSquared: () => 0 }, mouseT: {},
  flyTo(p, dur, done) { this.p = p; done?.(); },
  anchors: () => [], setProgress() {}, frame() {},
  start() { started++; }, stop() { paused++; }, setPaused(v) { v ? paused++ : started++; },
  loadMaps: async () => {},
};
if (app) app.scene = fake;
const btn = $('#advance');
btn?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 20));
ok(app.station >= 0, 'the click story did not advance');

/* ---- report ---- */
const ms = Date.now() - t0;
for (const e of errors) problems.push(`runtime: ${e}`);
if (problems.length) {
  console.error(`\n✘ ${problems.length} problem(s) after ${ms} ms:`);
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log(`✓ smoke test passed in ${ms} ms (static mode, ${doc.querySelectorAll('#cards .card').length} card(s), 6 ticks, panel + history OK).`);
dom.window.close();
