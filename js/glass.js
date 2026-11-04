/**
 * Liquid Glass — progressive enhancement.
 *
 *  Base (all browsers): CSS `.glass` = tint + blur + saturate + gradient rim + noise.
 *  Chromium: a per-element SVG filter is generated (feImage displacement map +
 *  feDisplacementMap + specular rim) and applied through `backdrop-filter:url(#id)`.
 *  Safari / Firefox / mobile keep the CSS fallback.
 *  Pointer: radial highlight follows the cursor; `.card` tilts (max 4deg).
 */

const SVGNS = 'http://www.w3.org/2000/svg';

/** Chromium detection: backdrop-filter url() is only honoured by Blink. */
export function supportsLiquid() {
  const params = new URLSearchParams(location.search);
  if (params.get('glass') === 'fallback') return false;               // QA switch
  const ua = navigator.userAgent;
  const blink = (navigator.userAgentData?.brands || []).some((b) => /Chromium/i.test(b.brand))
    || (/Chrome\/\d+/.test(ua) && !!window.chrome);
  const css = window.CSS && CSS.supports('backdrop-filter', 'url(#a)') && !/^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  return !!(blink && css);
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

let uid = 0;
function makeFilter(host, w, h, radius, opts) {
  const id = `liquid-${++uid}`;
  const { disp, spec } = buildMaps(w, h, radius, opts.band);
  const f = document.createElementNS(SVGNS, 'filter');
  f.setAttribute('id', id);
  f.setAttribute('x', '0'); f.setAttribute('y', '0');
  f.setAttribute('width', w); f.setAttribute('height', h);
  f.setAttribute('filterUnits', 'userSpaceOnUse');
  f.setAttribute('primitiveUnits', 'userSpaceOnUse');
  f.setAttribute('color-interpolation-filters', 'sRGB');
  f.innerHTML = `
    <feImage href="${disp}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="map"/>
    <feDisplacementMap in="SourceGraphic" in2="map" scale="${opts.scale}" xChannelSelector="R" yChannelSelector="G" result="refr"/>
    <feImage href="${spec}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="spec"/>
    <feBlend in="spec" in2="refr" mode="screen"/>`;
  host.appendChild(f);
  return id;
}

const PRESETS = {
  nav:  { band: 16, scale: 26 },
  chip: { band: 18, scale: 34 },
  card: { band: 26, scale: 44 },
};

/** Attach refraction filters to every [data-liquid] element (re-generated on resize). */
export function initLiquid(root = document) {
  const host = document.getElementById('liquid-filters');
  if (!host) return;
  const els = [...root.querySelectorAll('.glass[data-liquid]')];
  const ro = new ResizeObserver((entries) => {
    for (const en of entries) {
      const el = en.target;
      const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
      if (!w || !h) continue;
      const key = `${w}x${h}`;
      if (el.dataset.liquidKey === key) continue;
      el.dataset.liquidKey = key;
      if (el._liquidId) document.getElementById(el._liquidId)?.remove();
      const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 24;
      el._liquidId = makeFilter(host, w, h, Math.min(radius, h / 2), PRESETS[el.dataset.liquid] || PRESETS.chip);
      el.style.setProperty('--liquid-filter', `url(#${el._liquidId})`);
    }
  });
  els.forEach((el) => ro.observe(el));
}

/** Pointer-following highlight on all glass + gentle tilt on cards. */
export function initGlassPointer() {
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (!fine) return;
  document.addEventListener('pointermove', (e) => {
    const el = e.target.closest?.('.glass');
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    el.style.setProperty('--mx', `${x}px`);
    el.style.setProperty('--my', `${y}px`);
    el.style.setProperty('--hl', '.13');
  }, { passive: true });
  document.addEventListener('pointerout', (e) => {
    const el = e.target.closest?.('.glass');
    if (!el || el.contains(e.relatedTarget)) return;
    el.style.removeProperty('--hl');
  }, { passive: true });
}
