/**
 * Liquid Glass — progressive enhancement.
 *
 *  Base (all browsers): CSS `.glass` = tint + blur + saturate + gradient rim + noise.
 *  Chromium: a per-element SVG filter is generated (feImage displacement map +
 *  feDisplacementMap + specular rim) and applied through `backdrop-filter:url(#id)`.
 *  Safari / Firefox / mobile keep the CSS fallback.
 *  Pointer: radial highlight follows the cursor; the highlight is cleared on leave
 *  and re-derived on scroll, so it never sticks to a stale screen position.
 *
 * Everything here is opt-in and disposable:
 *   - maps are generated **once per shape** (w, h, radius, dpr, band) and reused,
 *     so a resize storm no longer re-encodes dozens of PNGs;
 *   - the filter is dropped when the element is hidden or off-screen;
 *   - a slow GPU (scene.js → cp:slow) can turn the whole thing off (`killLiquid`).
 *
 * The radius is part of the cache key on purpose: `--glass-radius` changes at the
 * 768px breakpoint (28 → 24) and pills force 999px, so keying on size alone left
 * elements refracting with the geometry of their previous shape.
 */

const SVGNS = 'http://www.w3.org/2000/svg';
const MAP_CACHE = new Map();       // shape key -> { disp, spec }
const MAP_CACHE_MAX = 48;

/** Chromium detection: backdrop-filter url() is only honoured by Blink. */
export function supportsLiquid() {
  const params = new URLSearchParams(location.search);
  if (params.get('glass') === 'fallback') return false;               // QA switch
  const ua = navigator.userAgent;
  const blink = (navigator.userAgentData?.brands || []).some((b) => /Chromium/i.test(b.brand))
    || (/Chrome\/\d+/.test(ua) && !!window.chrome);
  const css = window.CSS && CSS.supports('backdrop-filter', 'url(#a)') && !/^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  // A device that asks for less transparency must not get an extra refraction pass.
  const opaque = matchMedia('(prefers-reduced-transparency: reduce)').matches;
  return !!(blink && css && !opaque);
}

/** Signed distance to a rounded rectangle centred at origin. */
function sdRoundRect(px, py, hw, hh, r) {
  const qx = Math.abs(px) - hw + r, qy = Math.abs(py) - hh + r;
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
}

/**
 * Build displacement (R=x, G=y) + specular maps for a w×h element.
 * Only a rim band refracts (like the thick edge of a lens); the centre stays still.
 */
function buildMaps(w, h, radius, band) {
  const s = 0.5;                                    // half resolution, feImage upscales smoothly
  const W = Math.max(8, Math.round(w * s)), H = Math.max(8, Math.round(h * s));
  const hw = W / 2, hh = H / 2, r = Math.min(radius * s, hw, hh), b = band * s;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const sp = document.createElement('canvas'); sp.width = W; sp.height = H;
  const ctx = cv.getContext('2d'), sctx = sp.getContext('2d');
  const img = ctx.createImageData(W, H), simg = sctx.createImageData(W, H);
  const d = img.data, sd = simg.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = x + .5 - hw, py = y + .5 - hh;
      const dist = -sdRoundRect(px, py, hw, hh, r);           // >0 inside
      const i = (y * W + x) * 4;
      let dx = 0, dy = 0, spec = 0;
      if (dist > 0 && dist < b) {
        const e = 0.75;
        const gx = sdRoundRect(px + e, py, hw, hh, r) - sdRoundRect(px - e, py, hw, hh, r);
        const gy = sdRoundRect(px, py + e, hw, hh, r) - sdRoundRect(px, py - e, hw, hh, r);
        const gl = Math.hypot(gx, gy) || 1;
        const t = 1 - dist / b;                                  // 1 at the edge
        const m = t * t * (3 - 2 * t);
        dx = -(gx / gl) * m; dy = -(gy / gl) * m;               // sample inward: edge magnifies
        // specular: light from top-left
        const lit = Math.max(0, (-gx / gl) * -0.7 + (-gy / gl) * -0.7);
        spec = Math.pow(t, 3) * (0.35 + 0.65 * lit);
      }
      d[i] = 128 + dx * 127; d[i + 1] = 128 + dy * 127; d[i + 2] = 128; d[i + 3] = 255;
      sd[i] = 255; sd[i + 1] = 248; sd[i + 2] = 232; sd[i + 3] = Math.round(spec * 150);
    }
  }
  ctx.putImageData(img, 0, 0); sctx.putImageData(simg, 0, 0);
  return { disp: cv.toDataURL('image/png'), spec: sp.toDataURL('image/png') };
}

/** Cached map lookup: identical shapes share one pair of PNGs. */
function mapsFor(key, w, h, radius, band) {
  let m = MAP_CACHE.get(key);
  if (m) return m;
  m = buildMaps(w, h, radius, band);
  if (MAP_CACHE.size >= MAP_CACHE_MAX) MAP_CACHE.delete(MAP_CACHE.keys().next().value);
  MAP_CACHE.set(key, m);
  return m;
}

let uid = 0;
function makeFilter(host, w, h, radius, opts, maps) {
  const id = `liquid-${++uid}`;
  const f = document.createElementNS(SVGNS, 'filter');
  f.setAttribute('id', id);
  f.setAttribute('x', '0'); f.setAttribute('y', '0');
  f.setAttribute('width', w); f.setAttribute('height', h);
  f.setAttribute('filterUnits', 'userSpaceOnUse');
  f.setAttribute('primitiveUnits', 'userSpaceOnUse');
  f.setAttribute('color-interpolation-filters', 'sRGB');
  f.innerHTML = `
    <feImage href="${maps.disp}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="map"/>
    <feDisplacementMap in="SourceGraphic" in2="map" scale="${opts.scale}" xChannelSelector="R" yChannelSelector="G" result="refr"/>
    <feImage href="${maps.spec}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="spec"/>
    <feBlend in="spec" in2="refr" mode="screen"/>`;
  host.appendChild(f);
  return id;
}

const PRESETS = {
  nav:  { band: 16, scale: 26 },
  chip: { band: 18, scale: 34 },
  card: { band: 26, scale: 44 },
};

const Q = 8;                                        // quantise geometry to 8px buckets
const q8 = (v) => Math.round(v / Q) * Q;

/** Regenerate the filter of one element if (and only if) its real shape changed. */
function syncElement(el, host) {
  const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
  if (!w || !h || !el.isConnected) { dropFilter(el); return; }
  const radius = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 24, h / 2);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const key = `${q8(w)}x${q8(h)}r${q8(radius)}d${dpr.toFixed(1)}`;
  if (el.dataset.liquidKey === key) return;
  el.dataset.liquidKey = key;
  const preset = PRESETS[el.dataset.liquid] || PRESETS.chip;
  const band = Math.min(preset.band, Math.min(w, h) / 2);
  // Draw the maps at the quantised size, then stretch to the exact box: the error
  // is at most 4px on a soft gradient, and it keeps the cache useful.
  const maps = mapsFor(key, q8(w), q8(h), q8(radius), band);
  dropFilter(el);
  el._liquidId = makeFilter(host, w, h, radius, preset, maps);
  el.style.setProperty('--liquid-filter', `url(#${el._liquidId})`);
}

function dropFilter(el) {
  if (el._liquidId) { document.getElementById(el._liquidId)?.remove(); el._liquidId = null; }
  el.style.removeProperty('--liquid-filter');
}

let observer = null;
const observed = new WeakSet();
const pending = new Set();
let flushScheduled = false;

function flush(host) {
  flushScheduled = false;
  for (const el of pending) syncElement(el, host);
  pending.clear();
}

/** Queue a rebuild on the next frame + idle slice (never during a resize storm). */
function schedule(el, host) {
  pending.add(el);
  if (flushScheduled) return;
  flushScheduled = true;
  requestAnimationFrame(() => {
    const run = () => flush(host);
    if (window.requestIdleCallback) requestIdleCallback(run, { timeout: 250 }); else setTimeout(run, 60);
  });
}

/** Attach refraction filters to every [data-liquid] element (re-generated on resize). */
export function initLiquid(root = document) {
  const host = document.getElementById('liquid-filters');
  if (!host) return;
  const els = [...root.querySelectorAll('.glass[data-liquid]')];
  if (!els.length) return;

  observer?.disconnect();
  observer = new ResizeObserver((entries) => {
    for (const en of entries) {
      const el = en.target;
      // A collapse to zero (panel closed, card filtered out) releases the filter.
      if (!el.offsetWidth || !el.offsetHeight) { dropFilter(el); el.dataset.liquidKey = ''; continue; }
      schedule(el, host);
    }
  });
  els.forEach((el) => { observed.add(el); schedule(el, host); observer.observe(el); });

  // A DPR change (window dragged to another screen, browser zoom) is not a resize.
  const mq = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
  const onDpr = () => {
    els.forEach((el) => { el.dataset.liquidKey = ''; schedule(el, host); });
    mq.removeEventListener?.('change', onDpr);
    initLiquid(root);
  };
  mq.addEventListener?.('change', onDpr, { once: true });

  // Cards can arrive after this call (presentations.json is awaited with a cap).
  const cards = document.getElementById('cards');
  if (cards && !cards._liquidMo) {
    const mo = new MutationObserver(() => {
      for (const el of cards.querySelectorAll('.glass[data-liquid]')) {
        if (observed.has(el)) continue;
        observed.add(el); schedule(el, host); observer.observe(el);
      }
    });
    mo.observe(cards, { childList: true });
    cards._liquidMo = mo;
  }
}

/** Turn the refraction off for good (slow GPU, or "reduce transparency" toggled live). */
export function killLiquid() {
  document.documentElement.classList.remove('liquid');
  observer?.disconnect(); observer = null;
  document.querySelectorAll('.glass[data-liquid]').forEach(dropFilter);
  const host = document.getElementById('liquid-filters');
  if (host) host.textContent = '';
  MAP_CACHE.clear();
}

/* ------------------------------------------------------------------ pointer */

/**
 * Pointer-following highlight on all glass.
 *
 * Two bugs are fixed here compared with the previous version:
 *  - `--hl` was written inline, which overrode `.pill:hover { --hl: .16 }` for good;
 *    the pointer now drives `--hover-hl`, a separate variable;
 *  - the highlight stayed glued to a screen coordinate when the element moved under
 *    a still cursor (scrolling the library panel). It is now re-derived on scroll.
 */
export function initGlassPointer() {
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (!fine) return;

  let x = 0, y = 0, has = false, cur = null, raf = 0;

  const paint = () => {
    raf = 0;
    if (!has) return;
    const el = document.elementFromPoint(x, y)?.closest?.('.glass') || null;
    if (el !== cur) {
      if (cur) cur.style.removeProperty('--hover-hl');
      cur = el;
    }
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${(x - r.left).toFixed(1)}px`);
    el.style.setProperty('--my', `${(y - r.top).toFixed(1)}px`);
    el.style.setProperty('--hover-hl', '.13');
  };
  const request = () => { if (!raf) raf = requestAnimationFrame(paint); };

  document.addEventListener('pointermove', (e) => {
    x = e.clientX; y = e.clientY; has = true;
    request();
  }, { passive: true });

  // Re-derive when the page moves under a still cursor.
  const onScroll = () => request();
  addEventListener('scroll', onScroll, { passive: true, capture: true });

  const clear = () => {
    has = false;
    cur?.style.removeProperty('--hover-hl');
    cur?.style.removeProperty('--mx');
    cur?.style.removeProperty('--my');
    cur = null;
  };
  document.addEventListener('pointerleave', clear, { passive: true });
  document.addEventListener('pointerout', (e) => {
    const el = e.target.closest?.('.glass');
    if (!el || el.contains(e.relatedTarget)) return;
    el.style.removeProperty('--hover-hl');
    if (el === cur) cur = null;
  }, { passive: true });
  addEventListener('blur', clear);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); });

  // "Reduce transparency" can be toggled while the page is open.
  matchMedia('(prefers-reduced-transparency: reduce)').addEventListener?.('change', (e) => {
    if (e.matches) killLiquid(); else if (supportsLiquid()) { document.documentElement.classList.add('liquid'); initLiquid(); }
  });
}
