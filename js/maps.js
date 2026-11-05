/**
 * Antique map plates, drawn at runtime on <canvas> with d3-geo + topojson-client.
 * Data: world-atlas (Natural Earth) — fetched from jsDelivr, with a bundled local copy
 * as fallback so the site also works offline.
 */
import {
  geoPath, geoGraticule, geoDistance, feature,
} from './vendor/libs.js';
import { PLATES } from './plates.js';

export { PLATES };

const CDN = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/';
const LOCAL = 'assets/data/';

const PAPER = '#ebe0c7';           // flat base — also used to "erase" water-lines
const LAND = '#e2d3b2';
const INK = '#3a291d';
const ROUTE = '#7d3f2b';

/** fetch with timeout, CDN first then local copy */
async function loadTopo(name) {
  const tryFetch = async (url, ms) => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) throw new Error(r.status); return await r.json(); }
    finally { clearTimeout(t); }
  };
  try { return await tryFetch(CDN + name, 3500); }
  catch { return tryFetch(LOCAL + name, 15000); }
}

const toRoman = (n) => ['I', 'II', 'III', 'IV', 'V', 'VI'][n] || String(n + 1);


/* ------------------------------------------------------------------ paper */
let NOISE;
function noiseTile() {
  if (NOISE) return NOISE;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d'); const im = x.createImageData(256, 256);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < im.data.length; i += 4) {
    const v = 200 + rnd() * 55;
    im.data[i] = v; im.data[i + 1] = v - 6; im.data[i + 2] = v - 18; im.data[i + 3] = 255;
  }
  x.putImageData(im, 0, 0);
  return (NOISE = c);
}

function agePaper(ctx, W, H, seed = 1) {
  let s = seed * 9301 + 49297; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = ctx.createPattern(noiseTile(), 'repeat');
  ctx.globalAlpha = .55; ctx.fillRect(0, 0, W, H);
  // foxing & stains
  ctx.globalAlpha = 1;
  for (let i = 0; i < 22; i++) {
    const x = rnd() * W, y = rnd() * H, r = (6 + rnd() * 70) * (W / 2048);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(150,105,60,${.05 + rnd() * .07})`); g.addColorStop(1, 'rgba(150,105,60,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  // edge darkening
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .35, W / 2, H / 2, Math.hypot(W, H) * .58);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(120,85,45,.45)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/* ------------------------------------------------------------------ helpers */
function bboxPoints([x0, y0, x1, y1]) {
  const pts = [];
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) pts.push([x0 + (x1 - x0) * i / 8, y0 + (y1 - y0) * j / 8]);
  return { type: 'MultiPoint', coordinates: pts };
}

function spacedText(ctx, text, x, y, spacing) {
  // canvas letterSpacing is not universal; draw glyph by glyph
  const w = [...text].reduce((a, ch) => a + ctx.measureText(ch).width + spacing, -spacing);
  let cx = x - w / 2;
  for (const ch of text) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + spacing; }
}

function compass(ctx, x, y, r, sc) {
  ctx.save(); ctx.translate(x, y);
  ctx.strokeStyle = INK; ctx.fillStyle = INK; ctx.lineWidth = 1 * sc;
  ctx.beginPath(); ctx.arc(0, 0, r * .62, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, r * .56, 0, Math.PI * 2); ctx.globalAlpha = .5; ctx.stroke(); ctx.globalAlpha = 1;
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4, L = k % 2 ? r * .55 : r, w = k % 2 ? r * .07 : r * .11;
    ctx.save(); ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(0, -L); ctx.lineTo(w, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, -L); ctx.lineTo(-w, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.stroke();
    ctx.restore();
  }
  ctx.font = `italic 500 ${Math.round(r * .42)}px "Source Serif 4", Georgia, serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('N', 0, -r - r * .14);
  ctx.restore();
}


/* ------------------------------------------------------------------ ink ornaments */
/** a sea serpent: humped coils above little waterline strokes */
function serpent(ctx, x, y, s, flip) {
  ctx.save(); ctx.translate(x, y); ctx.scale(flip ? -s : s, s);
  ctx.strokeStyle = INK; ctx.fillStyle = '#e8dcc2'; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [x0, w, h] of [[-60, 34, 26], [-18, 30, 22], [20, 26, 18]]) {        // coils
    ctx.beginPath(); ctx.moveTo(x0, 0); ctx.bezierCurveTo(x0 + 2, -h, x0 + w - 2, -h, x0 + w, 0);
    ctx.lineTo(x0 + w - 7, 0); ctx.bezierCurveTo(x0 + w - 9, -h + 9, x0 + 9, -h + 9, x0 + 7, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 1; for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(x0 + w * k / 4, -h * .72); ctx.lineTo(x0 + w * k / 4 + 2, -h * .52); ctx.stroke(); } ctx.lineWidth = 2.2;
  }
  // head with open jaw and a fin crest
  ctx.beginPath(); ctx.moveTo(-60, 0); ctx.bezierCurveTo(-64, -20, -70, -34, -82, -38); ctx.lineTo(-100, -34); ctx.lineTo(-88, -30); ctx.lineTo(-100, -24);
  ctx.bezierCurveTo(-86, -24, -76, -18, -68, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(-83, -33, 1.6, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill();
  ctx.beginPath(); ctx.moveTo(-70, -32); ctx.lineTo(-66, -44); ctx.lineTo(-62, -30); ctx.lineTo(-58, -40); ctx.lineTo(-56, -24); ctx.stroke();
  // tail
  ctx.beginPath(); ctx.moveTo(46, 0); ctx.bezierCurveTo(52, -12, 62, -14, 70, -6); ctx.lineTo(78, -14); ctx.lineTo(74, -2); ctx.stroke();
  waterline(ctx, -110, 90);
  ctx.restore();
}
/** a whale spouting */
function whale(ctx, x, y, s, flip) {
  ctx.save(); ctx.translate(x, y); ctx.scale(flip ? -s : s, s);
  ctx.strokeStyle = INK; ctx.fillStyle = '#e8dcc2'; ctx.lineWidth = 2.2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-60, 0); ctx.bezierCurveTo(-60, -30, -20, -36, 18, -26); ctx.bezierCurveTo(40, -20, 52, -10, 60, -16);
  ctx.lineTo(74, -30); ctx.lineTo(70, -12); ctx.lineTo(84, -6); ctx.lineTo(62, -4); ctx.lineTo(50, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.lineWidth = 1; for (let k = 0; k < 7; k++) { ctx.beginPath(); ctx.moveTo(-40 + k * 9, -6); ctx.lineTo(-36 + k * 9, -18 + Math.abs(k - 3) * 2); ctx.stroke(); }
  ctx.beginPath(); ctx.arc(-42, -16, 1.8, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill();
  ctx.lineWidth = 1.6; ctx.beginPath();                                                 // spout
  ctx.moveTo(-34, -32); ctx.bezierCurveTo(-36, -50, -48, -56, -54, -50); ctx.moveTo(-34, -32); ctx.bezierCurveTo(-32, -50, -20, -56, -14, -50);
  ctx.moveTo(-34, -32); ctx.lineTo(-34, -56); ctx.stroke();
  waterline(ctx, -76, 92);
  ctx.restore();
}
/** a small sailing ship (caravel) with its wake */
function ship(ctx, x, y, s, flip) {
  ctx.save(); ctx.translate(x, y); ctx.scale(flip ? -s : s, s);
  ctx.strokeStyle = INK; ctx.fillStyle = '#e8dcc2'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(-40, -12); ctx.lineTo(36, -12); ctx.lineTo(28, 0); ctx.quadraticCurveTo(0, 4, -32, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-40, -12); ctx.lineTo(-40, -20); ctx.lineTo(-26, -20); ctx.lineTo(-26, -12); ctx.stroke();
  for (const [mx, h, w] of [[-14, 52, 18], [8, 62, 22], [26, 36, 12]]) {
    ctx.beginPath(); ctx.moveTo(mx, -12); ctx.lineTo(mx, -12 - h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(mx - w / 2, -12 - h * .9); ctx.quadraticCurveTo(mx + w * .45, -12 - h * .6, mx - w / 2, -12 - h * .3); ctx.lineTo(mx + w / 2, -12 - h * .3);
    ctx.quadraticCurveTo(mx + w * 1.1, -12 - h * .6, mx + w / 2, -12 - h * .9); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(8, -74); ctx.lineTo(18, -70); ctx.lineTo(8, -66); ctx.fillStyle = ROUTE; ctx.fill();
  waterline(ctx, -54, 60);
  ctx.restore();
}
function waterline(ctx, x0, x1) {
  ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(58,41,29,.7)';
  for (let r = 0; r < 3; r++) {
    ctx.beginPath();
    for (let x = x0 + r * 6; x < x1 - r * 6; x += 12) { ctx.moveTo(x, 4 + r * 5); ctx.quadraticCurveTo(x + 3, 1 + r * 5, x + 6, 4 + r * 5); }
    ctx.stroke();
  }
}
/** portolan rhumb lines radiating from a wind rose */
function rhumbs(ctx, x, y, L, sc) {
  ctx.save(); ctx.lineWidth = .8 * sc;
  for (let k = 0; k < 32; k++) {
    const a = k * Math.PI / 16;
    ctx.strokeStyle = k % 4 === 0 ? 'rgba(58,41,29,.16)' : k % 2 ? 'rgba(125,63,43,.10)' : 'rgba(58,41,29,.10)';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); ctx.stroke();
  }
  ctx.restore();
}
/** engraved mountain marks inside the land mask */
function mountains(ctx, path, land, W, H, sc, seed) {
  let s0 = seed * 7919 + 13; const rnd = () => ((s0 = (s0 * 16807) % 2147483647) / 2147483647);
  ctx.save(); ctx.beginPath(); path(land);
  const marks = [];
  for (let i = 0; i < 900 && marks.length < 70; i++) {
    const x = rnd() * W, y = rnd() * H;
    if (!ctx.isPointInPath(x, y)) continue;
    if (marks.some(([mx, my]) => Math.hypot(mx - x, my - y) < 46 * sc)) continue;
    // keep marks off the coast: test 4 neighbours
    const d = 30 * sc;
    if (![[d, 0], [-d, 0], [0, d], [0, -d]].every(([ox, oy]) => ctx.isPointInPath(x + ox, y + oy))) continue;
    marks.push([x, y]);
  }
  for (const [x, y] of marks) {
    const w = (18 + rnd() * 14) * sc, h = w * (.55 + rnd() * .3);
    ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.quadraticCurveTo(x - w * .1, y - h * 1.3, x, y - h); ctx.quadraticCurveTo(x + w * .15, y - h * 1.1, x + w / 2, y);
    ctx.fillStyle = 'rgba(235,224,199,.9)'; ctx.fill();
    ctx.strokeStyle = 'rgba(58,41,29,.55)'; ctx.lineWidth = 1.3 * sc; ctx.stroke();
    ctx.lineWidth = .8 * sc; ctx.strokeStyle = 'rgba(58,41,29,.35)';
    for (let k = 1; k < 5; k++) { const xx = x + w * (.02 + k * .1); ctx.beginPath(); ctx.moveTo(xx, y - h * (1 - k * .2)); ctx.lineTo(xx + 3 * sc, y - 1 * sc); ctx.stroke(); }
  }
  ctx.restore();
}
/** corner rosette for the frame */
function rosette(ctx, x, y, r, sc) {
  ctx.save(); ctx.translate(x, y); ctx.strokeStyle = INK; ctx.fillStyle = PAPER; ctx.lineWidth = 1.2 * sc;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  for (let k = 0; k < 8; k++) { ctx.rotate(Math.PI / 4); ctx.beginPath(); ctx.ellipse(0, -r * .5, r * .16, r * .42, 0, 0, Math.PI * 2); ctx.stroke(); }
  ctx.beginPath(); ctx.arc(0, 0, r * .16, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill();
  ctx.restore();
}
/** scroll-work either side of the cartouche */
function scrolls(ctx, x0, y0, w, h, sc) {
  ctx.save(); ctx.strokeStyle = INK; ctx.lineWidth = 1.6 * sc; ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    const x = side < 0 ? x0 : x0 + w, cy = y0 + h / 2;
    for (const dy of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(x, cy + dy * h * .32);
      ctx.bezierCurveTo(x + side * 40 * sc, cy + dy * h * .42, x + side * 46 * sc, cy + dy * h * .08, x + side * 26 * sc, cy + dy * h * .1);
      ctx.bezierCurveTo(x + side * 16 * sc, cy + dy * h * .12, x + side * 18 * sc, cy + dy * h * .24, x + side * 26 * sc, cy + dy * h * .22);
      ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(x, cy); ctx.lineTo(x + side * 18 * sc, cy); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + side * 22 * sc, cy, 3 * sc, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ plate */
export function drawPlate(canvas, spec, world, index) {
  const W = canvas.width, H = canvas.height, sc = W / 2048;
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);

  // frame geometry
  const m = Math.round(70 * sc), band = Math.round(16 * sc);
  const fx0 = m, fy0 = m, fx1 = W - m, fy1 = H - m;
  const ix0 = fx0 + band, iy0 = fy0 + band, ix1 = fx1 - band, iy1 = fy1 - band;

  const projection = spec.projection();
  const pad = 30 * sc;
  if (spec.sphere) {
    const R = Math.min(ix1 - ix0, iy1 - iy0) / 2 - pad * 1.2;
    projection.scale(R).translate([(ix0 + ix1) / 2 + (ix1 - ix0) * .14, (iy0 + iy1) / 2]);
  } else {
    projection.fitExtent([[ix0 + pad, iy0 + pad], [ix1 - pad, iy1 - pad]], bboxPoints(spec.bbox));
  }
  projection.clipExtent([[ix0, iy0], [ix1, iy1]]);
  const path = geoPath(projection, ctx);
  const land = world.land;

  ctx.save();
  ctx.beginPath(); ctx.rect(ix0, iy0, ix1 - ix0, iy1 - iy0); ctx.clip();

  if (spec.sphere) {
    // globe: limb shadow + clip to sphere
    const [cx, cy] = projection.translate(), R = projection.scale();
    ctx.save();
    ctx.shadowColor = 'rgba(60,40,20,.35)'; ctx.shadowBlur = 40 * sc; ctx.shadowOffsetY = 10 * sc;
    ctx.beginPath(); path({ type: 'Sphere' }); ctx.fillStyle = PAPER; ctx.fill();
    ctx.restore();
    ctx.beginPath(); path({ type: 'Sphere' }); ctx.clip();
    const g = ctx.createRadialGradient(cx - R * .35, cy - R * .35, R * .2, cx, cy, R);
    g.addColorStop(0, 'rgba(255,250,235,0)'); g.addColorStop(1, 'rgba(110,80,45,.22)');
    ctx.fillStyle = g; ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  }

  // 1) water-lining: concentric ripples offshore (ink ring, then erase inside with paper)
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const gap = 7 * sc, rings = 6;
  for (let k = rings; k >= 1; k--) {
    ctx.beginPath(); path(land);
    ctx.strokeStyle = `rgba(58,41,29,${.30 - k * .035})`; ctx.lineWidth = 2 * k * gap + 1.3 * sc; ctx.stroke();
    ctx.strokeStyle = PAPER; ctx.lineWidth = 2 * k * gap - .9 * sc; ctx.stroke();
  }
  if (spec.sphere) { // re-apply globe shading over the erased bands
    const [cx, cy] = projection.translate(), R = projection.scale();
    const g = ctx.createRadialGradient(cx - R * .35, cy - R * .35, R * .2, cx, cy, R);
    g.addColorStop(0, 'rgba(255,250,235,0)'); g.addColorStop(1, 'rgba(110,80,45,.18)');
    ctx.fillStyle = g; ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  }

  // 1b) portolan rhumb lines from the wind rose
  // the globe plate gets a large wind rose in the open paper on its left
  const compX = spec.sphere ? ix0 + 290 * sc : spec.cartouche === 'br' ? ix0 + 120 * sc : ix1 - 120 * sc;
  const compY = spec.sphere ? (iy0 + iy1) / 2 - 120 * sc : iy0 + 140 * sc;
  const compR = spec.sphere ? 150 * sc : 70 * sc;
  rhumbs(ctx, compX, compY, Math.hypot(W, H), sc);

  // 2) land
  ctx.beginPath(); path(land); ctx.fillStyle = LAND; ctx.fill();
  ctx.save(); ctx.beginPath(); path(land); ctx.clip();
  ctx.strokeStyle = 'rgba(120,85,50,.10)'; ctx.lineWidth = 16 * sc; ctx.beginPath(); path(land); ctx.stroke();
  ctx.strokeStyle = 'rgba(120,85,50,.10)'; ctx.lineWidth = 6 * sc; ctx.beginPath(); path(land); ctx.stroke();
  // engraved hatching on land (fine diagonal lines)
  ctx.strokeStyle = 'rgba(80,58,38,.07)'; ctx.lineWidth = .8 * sc; ctx.beginPath();
  for (let x = -H; x < W; x += 9 * sc) { ctx.moveTo(x, H); ctx.lineTo(x + H, 0); }
  ctx.stroke();
  ctx.restore();

  // 3) graticule
  const grat = geoGraticule().step([spec.step, spec.step]).precision(1)();
  ctx.beginPath(); path(grat);
  ctx.strokeStyle = 'rgba(58,41,29,.32)'; ctx.lineWidth = 1.2 * sc; ctx.stroke();

  // 4) coastline (+ engraved relief inland)
  mountains(ctx, path, land, W, H, sc, index + 1);
  ctx.beginPath(); path(land); ctx.strokeStyle = INK; ctx.lineWidth = 2.3 * sc; ctx.stroke();

  // 4b) region names: spaced capitals in faded ink
  for (const [t, lon, lat, rot] of spec.regions || []) {
    const pr = projection([lon, lat]); if (!pr) continue;
    if (spec.sphere && geoDistance([lon, lat], projection.invert(projection.translate())) > Math.PI / 2 - .2) continue;
    ctx.save(); ctx.translate(pr[0], pr[1]); ctx.rotate(rot * Math.PI / 180);
    ctx.font = `400 ${Math.round(24 * sc)}px "Source Serif 4", Georgia, serif`;
    ctx.fillStyle = 'rgba(58,41,29,.5)'; ctx.textBaseline = 'middle';
    spacedText(ctx, t, 0, 0, 9 * sc);
    ctx.restore();
  }

  // 4c) sea creatures & ships, drawn in ink on the open sea
  for (const [kind, lon, lat, size, flip] of spec.monsters || []) {
    const pr = projection([lon, lat]); if (!pr) continue;
    if (spec.sphere && geoDistance([lon, lat], projection.invert(projection.translate())) > Math.PI / 2 - .15) continue;
    const f = { serpent, whale, ship }[kind];
    f(ctx, pr[0], pr[1], size * 1.45 * sc, flip);
  }

  // 5) routes
  ctx.save();
  ctx.setLineDash(spec.rail ? [2 * sc, 5 * sc] : [9 * sc, 6 * sc]);
  ctx.strokeStyle = ROUTE; ctx.globalAlpha = .85; ctx.lineWidth = (spec.rail ? 2.8 : 2.2) * sc;
  for (const r of spec.routes || []) { ctx.beginPath(); path({ type: 'LineString', coordinates: r }); ctx.stroke(); }
  ctx.restore();

  // 6) sea labels
  for (const [t, lon, lat, size, rot] of spec.labels || []) {
    const p = projection([lon, lat]); if (!p) continue;
    ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(rot * Math.PI / 180);
    ctx.fillStyle = 'rgba(58,41,29,.62)';
    ctx.font = `italic 400 ${Math.round(30 * size * sc)}px "Source Serif 4", Georgia, serif`;
    ctx.textBaseline = 'middle';
    spacedText(ctx, t, 0, 0, (t === t.toUpperCase() ? 10 : 3) * sc * size);
    ctx.restore();
  }

  // 7) markers + labels (paper halo for legibility)
  ctx.textBaseline = 'middle';
  for (const [name, lon, lat] of spec.markers || []) {
    const p = projection([lon, lat]); if (!p) continue;
    if (spec.sphere && geoDistance([lon, lat], projection.invert(projection.translate())) > Math.PI / 2 - .05) continue;
    const [x, y] = p;
    ctx.beginPath(); ctx.arc(x, y, 6.5 * sc, 0, Math.PI * 2); ctx.fillStyle = PAPER; ctx.fill();
    ctx.lineWidth = 1.3 * sc; ctx.strokeStyle = INK; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 2 * sc, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill();
    ctx.font = `italic 500 ${Math.round(30 * sc)}px "Source Serif 4", Georgia, serif`;
    const right = x < ix1 - 260 * sc;
    ctx.textAlign = right ? 'left' : 'right';
    const lx = x + (right ? 11 : -11) * sc;
    ctx.lineWidth = 6 * sc; ctx.strokeStyle = 'rgba(226,211,178,.85)'; ctx.strokeText(name, lx, y - 1 * sc);
    ctx.fillStyle = INK; ctx.fillText(name, lx, y - 1 * sc);
  }
  ctx.textAlign = 'left';
  ctx.restore(); // end map clip

  // 8) frame: outer neat line, degree band (alternating), inner line
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3.2 * sc; ctx.strokeRect(fx0, fy0, fx1 - fx0, fy1 - fy0);
  ctx.lineWidth = 1 * sc; ctx.strokeRect(ix0, iy0, ix1 - ix0, iy1 - iy0);
  ctx.strokeRect(fx0 - 9 * sc, fy0 - 9 * sc, fx1 - fx0 + 18 * sc, fy1 - fy0 + 18 * sc);
  ctx.fillStyle = INK;
  const seg = 46 * sc, bw = band * .42;
  for (let x = ix0, k = 0; x < ix1; x += seg, k++) if (k % 2 === 0) {
    const w = Math.min(seg, ix1 - x);
    ctx.fillRect(x, fy0 + band - bw - 2 * sc, w, bw); ctx.fillRect(x, iy1 + 2 * sc, w, bw);
  }
  for (let y = iy0, k = 0; y < iy1; y += seg, k++) if (k % 2 === 0) {
    const h = Math.min(seg, iy1 - y);
    ctx.fillRect(fx0 + band - bw - 2 * sc, y, bw, h); ctx.fillRect(ix1 + 2 * sc, y, bw, h);
  }

  for (const [x, y] of [[fx0, fy0], [fx1, fy0], [fx0, fy1], [fx1, fy1]]) rosette(ctx, x, y, band * 1.25, sc);

  // 9) cartouche
  const cw = 600 * sc, ch = 180 * sc;
  const cx0 = spec.cartouche === 'br' ? ix1 - cw - 34 * sc : ix0 + 34 * sc;
  const cy0 = iy1 - ch - 34 * sc;
  ctx.save();
  ctx.shadowColor = 'rgba(60,40,20,.18)'; ctx.shadowBlur = 18 * sc;
  ctx.fillStyle = '#ede3cc'; ctx.fillRect(cx0, cy0, cw, ch);
  ctx.restore();
  scrolls(ctx, cx0, cy0, cw, ch, sc);
  ctx.lineWidth = 2.2 * sc; ctx.strokeStyle = INK; ctx.strokeRect(cx0, cy0, cw, ch);
  ctx.lineWidth = .9 * sc; ctx.strokeRect(cx0 + 8 * sc, cy0 + 8 * sc, cw - 16 * sc, ch - 16 * sc);
  ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.font = `500 ${Math.round(14 * sc)}px "Libre Franklin", sans-serif`;
  spacedText(ctx, `TABULA ${toRoman(index)}`, cx0 + cw / 2, cy0 + 40 * sc, 5 * sc);
  ctx.font = `italic 400 ${Math.round(60 * sc)}px "Source Serif 4", Georgia, serif`;
  ctx.fillText(spec.title, cx0 + cw / 2, cy0 + 104 * sc);
  ctx.font = `italic 400 ${Math.round(23 * sc)}px "Source Serif 4", Georgia, serif`;
  ctx.fillStyle = 'rgba(58,41,29,.85)';
  ctx.fillText(spec.sub, cx0 + cw / 2, cy0 + 146 * sc);
  ctx.beginPath(); ctx.moveTo(cx0 + cw / 2 - 60 * sc, cy0 + 120 * sc); ctx.lineTo(cx0 + cw / 2 + 60 * sc, cy0 + 120 * sc);
  ctx.strokeStyle = 'rgba(58,41,29,.5)'; ctx.lineWidth = 1 * sc; ctx.stroke();
  ctx.textAlign = 'left';

  // 10) compass rose + scale bar
  compass(ctx, compX, compY, compR, sc);
  if (!spec.sphere) {
    const c = [(ix0 + ix1) / 2, (iy0 + iy1) / 2];
    const a = projection.invert([c[0] - 50, c[1]]), b = projection.invert([c[0] + 50, c[1]]);
    const kmPerPx = (geoDistance(a, b) * 6371) / 100;
    const kmTotal = [200, 250, 500, 1000, 2000].find((k) => k / kmPerPx > 220 * sc) || 1000;
    const L = kmTotal / kmPerPx;
    const sx = spec.cartouche === 'br' ? ix0 + 50 * sc : ix1 - 50 * sc - L, sy = iy1 - 52 * sc;
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 ? PAPER : INK; ctx.fillRect(sx + i * L / 4, sy, L / 4, 7 * sc);
    }
    ctx.strokeStyle = INK; ctx.lineWidth = 1 * sc; ctx.strokeRect(sx, sy, L, 7 * sc);
    ctx.fillStyle = INK; ctx.font = `italic 400 ${Math.round(18 * sc)}px "Source Serif 4", Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.fillText('0', sx, sy - 9 * sc); ctx.fillText(`${kmTotal} km`, sx + L, sy - 9 * sc);
    ctx.textAlign = 'left';
  }

  // 11) age the whole sheet
  agePaper(ctx, W, H, index + 3);
  ctx.restore();
}

/** Load data, then draw all plates one per idle slice (keeps the main thread responsive). */
export async function generateMaps({ width = 2048, height = 1418, onPlate } = {}) {
  // Only the datasets the five plates actually use are fetched (an era without
  // countries no longer pays for countries-110m).
  const needed = [...new Set(PLATES.map((p) => p.data))];
  const files = await Promise.all(needed.map(loadTopo));
  const topo = Object.fromEntries(needed.map((n, i) => [n, { land: feature(files[i], files[i].objects.land) }]));
  const out = [];
  for (let i = 0; i < PLATES.length; i++) {
    await new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(r, { timeout: 120 }) : setTimeout(r, 16)));
    const cv = document.createElement('canvas'); cv.width = width; cv.height = height;
    drawPlate(cv, PLATES[i], topo[PLATES[i].data], i);
    out.push(cv);
    onPlate?.(i, cv);
  }
  return out;
}
