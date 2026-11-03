/**
 * Procedural canvas textures for the book (leather, emblem, pages, edges) and soft sprites.
 * Everything is generated at runtime: no image downloads.
 */

const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

/** Fine monochrome grain, drawn with a blend mode over an existing canvas. */
function grain(ctx, w, h, { amount = .12, seed = 3, mode = 'overlay', scale = 1 } = {}) {
  const t = canvas(256, 256), x = t.getContext('2d'), im = x.createImageData(256, 256), r = rng(seed);
  for (let i = 0; i < im.data.length; i += 4) { const v = r() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
  x.putImageData(im, 0, 0);
  ctx.save(); ctx.globalCompositeOperation = mode; ctx.globalAlpha = amount;
  ctx.scale(scale, scale); ctx.fillStyle = ctx.createPattern(t, 'repeat'); ctx.fillRect(0, 0, w / scale, h / scale); ctx.restore();
}

/** Leather: dark warm base, pebbled grain, rubbed edges. */
function leatherBase(ctx, w, h, seed = 11) {
  const r = rng(seed);
  ctx.fillStyle = '#34261e'; ctx.fillRect(0, 0, w, h);
  cloudy(ctx, w, h, 7, .16, seed + 7, '0,0,0', '150,105,75');      // tonal mottling of hide
  for (let i = 0; i < w * h / 90; i++) {                    // pebbles
    const x = r() * w, y = r() * h, s = 1 + r() * 3.2;
    ctx.fillStyle = r() > .5 ? 'rgba(0,0,0,.14)' : 'rgba(255,235,210,.05)';
    ctx.beginPath(); ctx.ellipse(x, y, s, s * (.6 + r() * .5), r() * 3, 0, Math.PI * 2); ctx.fill();
  }
  grain(ctx, w, h, { amount: .09, seed });
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .3, w / 2, h / 2, Math.hypot(w, h) * .55);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.35)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  // rubbed, lighter wear along the edges and corners
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < 260; i++) {
    const side = r() * 4 | 0, t = r(), e = r() * 18;
    const x = side === 0 ? t * w : side === 1 ? w - e : side === 2 ? t * w : e;
    const y = side === 0 ? e : side === 1 ? t * h : side === 2 ? h - e : t * h;
    const s = 4 + r() * 22, gg = ctx.createRadialGradient(x, y, 0, x, y, s);
    gg.addColorStop(0, `rgba(120,85,60,${.05 + r() * .08})`); gg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gg; ctx.fillRect(x - s, y - s, 2 * s, 2 * s);
  }
  ctx.restore();
}

/** leather pebble grain for a bump canvas (white = raised) */
function leatherBump(ctx, w, h, seed = 11) {
  const r = rng(seed + 50);
  for (let i = 0; i < w * h / 90; i++) {
    const x = r() * w, y = r() * h, s = .8 + r() * 2.6;
    ctx.fillStyle = `rgba(0,0,0,${.06 + r() * .12})`;
    ctx.beginPath(); ctx.ellipse(x, y, s, s * (.6 + r() * .5), r() * 3, 0, Math.PI * 2); ctx.fill();
  }
}

/**
 * Front cover: blind-tooled frame + cream debossed silhouette + blackletter title.
 * Returns { map, bump } canvases (bump: white = raised leather, dark = pressed).
 */
export function makeCover(silPath, { w = 1024, h = 1418 } = {}) {
  const map = canvas(w, h), bump = canvas(w, h);
  const c = map.getContext('2d'), b = bump.getContext('2d');
  leatherBase(c, w, h);
  b.fillStyle = '#fff'; b.fillRect(0, 0, w, h);
  leatherBump(b, w, h);

  // blind-tooled double frame
  const frame = (ctx, col, lw) => {
    ctx.strokeStyle = col; ctx.lineWidth = lw;
    ctx.strokeRect(64, 64, w - 128, h - 128);
    ctx.strokeRect(80, 80, w - 160, h - 160);
  };
  c.save(); c.translate(1.5, 2); frame(c, 'rgba(255,230,200,.07)', 3); c.restore();
  frame(c, 'rgba(10,6,4,.55)', 3);
  frame(b, '#555', 5);

  // silhouette (viewBox 1323 x 2095)
  const sh = h * .40, s = sh / 2095, sw = 1323 * s;
  const ox = (w - sw) / 2, oy = h * .19;
  const m = new DOMMatrix([s, 0, 0, s, ox, oy]);
  const sil = new Path2D(); sil.addPath(silPath, m);

  // cream foil fill with slight texture
  c.save(); c.fillStyle = '#d9cdb4'; c.fill(sil, 'evenodd'); c.clip(sil, 'evenodd');
  grain(c, w, h, { amount: .18, seed: 5, mode: 'multiply' });
  // inner shadow (pressed into the leather)
  const ring = new Path2D(); ring.rect(-50, -50, w + 100, h + 100); ring.addPath(sil);
  c.shadowColor = 'rgba(0,0,0,.75)'; c.shadowBlur = 7; c.shadowOffsetX = 3; c.shadowOffsetY = 4;
  c.fillStyle = '#000'; c.fill(ring, 'evenodd');
  c.restore();
  b.save(); b.filter = 'blur(2.5px)'; b.fillStyle = '#3a3a3a'; b.fill(sil, 'evenodd'); b.restore();

  // blackletter wordmark beneath
  const fs = Math.round(w * .072);
  c.font = `700 ${fs}px "UnifrakturCook", "Pirata One", serif`;
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  const ty = oy + sh + h * .115;
  c.save(); c.fillStyle = 'rgba(0,0,0,.6)'; c.fillText('Côme Presentation', w / 2 + 2, ty + 3); c.restore();
  c.fillStyle = '#d9cdb4'; c.fillText('Côme Presentation', w / 2, ty);
  b.save(); b.filter = 'blur(1.5px)'; b.font = c.font; b.textAlign = 'center'; b.fillStyle = '#444'; b.fillText('Côme Presentation', w / 2, ty); b.restore();

  // small tooled rule under the title
  c.fillStyle = 'rgba(10,6,4,.6)'; c.fillRect(w / 2 - 70, ty + 40, 140, 2);
  b.fillStyle = '#666'; b.fillRect(w / 2 - 70, ty + 40, 140, 3);
  return { map, bump };
}

export function makeLeather({ w = 512, h = 708, seed = 17, spine = false } = {}) {
  const cv = canvas(w, h), c = cv.getContext('2d');
  leatherBase(c, w, h, seed);
  if (spine) {                          // raised bands
    for (const y of [.16, .30, .70, .84]) {
      const yy = y * h;
      c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(0, yy + 6, w, 5);
      c.fillStyle = 'rgba(255,230,200,.08)'; c.fillRect(0, yy - 5, w, 4);
    }
  }
  return cv;
}

/** Endpaper: warm laid paper with a faint chain-line pattern. */
export function makeEndpaper({ w = 512, h = 708 } = {}) {
  const cv = canvas(w, h), c = cv.getContext('2d');
  c.fillStyle = '#bfa983'; c.fillRect(0, 0, w, h);
  c.strokeStyle = 'rgba(80,55,30,.10)'; c.lineWidth = 1;
  for (let x = 0; x < w; x += 22) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
  for (let y = 0; y < h; y += 3) { c.globalAlpha = .25; c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
  c.globalAlpha = 1;
  grain(c, w, h, { amount: .2, seed: 23, mode: 'multiply' });
  return cv;
}

/** A printed page: margins, running head, justified grey "text" lines, folio. */
export function makePage({ w = 768, h = 1062, seed = 31 } = {}) {
  const cv = canvas(w, h), c = cv.getContext('2d'), r = rng(seed);
  c.fillStyle = '#e8dcc2'; c.fillRect(0, 0, w, h);
  const g = c.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, 'rgba(120,90,50,.18)'); g.addColorStop(.12, 'rgba(120,90,50,0)');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  const mx = w * .14, top = h * .12, lh = h * .0215;
  c.fillStyle = 'rgba(60,44,30,.55)';
  c.fillRect(w / 2 - 50, h * .07, 100, 4);                       // running head
  let y = top;
  while (y < h * .88) {
    const para = 4 + Math.floor(r() * 6);
    for (let i = 0; i < para && y < h * .88; i++, y += lh) {
      const last = i === para - 1;
      const x0 = mx + (i === 0 ? w * .04 : 0);
      const x1 = last ? mx + (w - 2 * mx) * (.3 + r() * .5) : w - mx;
      let x = x0;
      while (x < x1 - 8) { const ww = 14 + r() * 46; c.fillStyle = `rgba(55,40,28,${.30 + r() * .12})`; c.fillRect(x, y, Math.min(ww, x1 - x), lh * .38); x += ww + 7; }
    }
    y += lh * .6;
  }
  c.fillStyle = 'rgba(60,44,30,.5)'; c.fillRect(w / 2 - 10, h * .93, 20, 4);
  addPaperFibre(c, w, h, seed);
  grain(c, w, h, { amount: .16, seed, mode: 'multiply' });
  return cv;
}

/** Parchment back of a map plate. */
export function makeParchment({ w = 512, h = 708, seed = 41 } = {}) {
  const cv = canvas(w, h), c = cv.getContext('2d');
  c.fillStyle = '#e4d6b9'; c.fillRect(0, 0, w, h);
  addPaperFibre(c, w, h, seed);
  grain(c, w, h, { amount: .25, seed, mode: 'multiply' });
  const g = c.createRadialGradient(w / 2, h / 2, w * .2, w / 2, h / 2, w * .8);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(120,85,45,.3)');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  return cv;
}

/** Page edges (fore-edge / head): fine horizontal leaves. */
export function makeEdges({ w = 64, h = 512, seed = 51 } = {}) {
  const cv = canvas(w, h), c = cv.getContext('2d'), r = rng(seed);
  c.fillStyle = '#d6c7a6'; c.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 1.5) { c.fillStyle = `rgba(90,65,40,${r() * .25})`; c.fillRect(x, 0, .8, h); }
  cloudy(c, w, h, 4, .12, seed, '90,60,30');
  return cv;
}

/** Soft radial sprite (white centre -> transparent). */
export function makeRadial(size = 256, inner = 0, stops = [[0, 1], [1, 0]]) {
  const cv = canvas(size, size), c = cv.getContext('2d');
  const g = c.createRadialGradient(size / 2, size / 2, inner, size / 2, size / 2, size / 2);
  for (const [o, a] of stops) g.addColorStop(o, `rgba(255,255,255,${a})`);
  c.fillStyle = g; c.fillRect(0, 0, size, size);
  return cv;
}

/* =====================================================================
   Material textures for the dioramas (small, 256px, tiling).
   Each returns a canvas used both as colour map and as bump map.
   ===================================================================== */

/** smooth value-noise layer drawn by upscaling a tiny random grid */
function cloudy(ctx, w, h, cells, alpha, seed, dark = '0,0,0', light = '255,248,235') {
  const r = rng(seed), g = canvas(cells, cells), x = g.getContext('2d');
  for (let i = 0; i < cells; i++) for (let j = 0; j < cells; j++) {
    const v = r(); x.fillStyle = v > .5 ? `rgba(${light},${(v - .5) * 2 * alpha})` : `rgba(${dark},${(.5 - v) * 2 * alpha})`; x.fillRect(i, j, 1, 1);
  }
  ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(g, 0, 0, w, h); ctx.drawImage(g, -w / 2, -h / 2, w, h); ctx.drawImage(g, w / 2, h / 2, w, h); ctx.restore();
}

/** stone / marble / plaster: mottled tone, pores, faint veins */
export function makeStone({ color = '#b9ab92', seed = 61, size = 256, veins = 0, pores = 1 } = {}) {
  const cv = canvas(size, size), c = cv.getContext('2d'), r = rng(seed);
  c.fillStyle = color; c.fillRect(0, 0, size, size);
  cloudy(c, size, size, 5, .1, seed);
  cloudy(c, size, size, 32, .1, seed + 1);
  for (let i = 0; i < 900 * pores; i++) {                       // pores & grit
    const x = r() * size, y = r() * size, s = .5 + r() * 1.6;
    c.fillStyle = r() > .35 ? `rgba(40,30,20,${.08 + r() * .14})` : `rgba(255,250,240,${.06 + r() * .1})`;
    c.fillRect(x, y, s, s);
  }
  for (let v = 0; v < veins; v++) {                             // marble veins
    c.strokeStyle = `rgba(90,75,60,${.08 + r() * .08})`; c.lineWidth = .6 + r(); c.beginPath();
    let x = r() * size, y = 0; c.moveTo(x, y);
    while (y < size) { x += (r() - .5) * 18; y += 6 + r() * 10; c.lineTo(x, y); }
    c.stroke();
  }
  grain(c, size, size, { amount: .14, seed: seed + 2, mode: 'overlay' });
  return cv;
}

/** wood: long grain lines + plank seams */
export function makeWood({ color = '#5a4433', seed = 71, size = 256, planks = 4 } = {}) {
  const cv = canvas(size, size), c = cv.getContext('2d'), r = rng(seed);
  c.fillStyle = color; c.fillRect(0, 0, size, size);
  cloudy(c, size, size, 8, .18, seed);
  for (let i = 0; i < 140; i++) {
    const y = r() * size, a = .04 + r() * .12;
    c.strokeStyle = r() > .3 ? `rgba(25,15,8,${a})` : `rgba(255,225,190,${a * .6})`;
    c.lineWidth = .5 + r() * 1.4; c.beginPath(); c.moveTo(0, y);
    for (let x = 0; x <= size; x += 16) c.lineTo(x, y + Math.sin(x * .03 + i) * 2 + (r() - .5) * 1.2);
    c.stroke();
  }
  for (let k = 1; k < planks; k++) { c.fillStyle = 'rgba(15,8,4,.35)'; c.fillRect(0, k * size / planks, size, 1.5); }
  grain(c, size, size, { amount: .12, seed: seed + 3 });
  return cv;
}

/** worn painted metal: dark paint, edge wear, rust & soot blotches */
export function makePaintedMetal({ color = '#2f2a27', seed = 81, size = 256 } = {}) {
  const cv = canvas(size, size), c = cv.getContext('2d'), r = rng(seed);
  c.fillStyle = color; c.fillRect(0, 0, size, size);
  cloudy(c, size, size, 10, .2, seed, '0,0,0', '150,120,95');
  for (let i = 0; i < 60; i++) {                                 // rust / wear blotches
    const x = r() * size, y = r() * size, s = 2 + r() * 10;
    const g = c.createRadialGradient(x, y, 0, x, y, s);
    g.addColorStop(0, r() > .5 ? 'rgba(120,70,40,.35)' : 'rgba(170,160,145,.18)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(x - s, y - s, 2 * s, 2 * s);
  }
  for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(200,190,170,${r() * .08})`; c.fillRect(r() * size, r() * size, 1, 1); }
  grain(c, size, size, { amount: .1, seed: seed + 4 });
  return cv;
}

/** brick: courses of bricks with mortar, tonal variation */
export function makeBrick({ rgb = [139, 102, 85], mortar = '#6e5a4c', rows = 16, cols = 6, vary = 18, seed = 91, size = 256 } = {}) {
  const cv = canvas(size, size), c = cv.getContext('2d'), r = rng(seed);
  c.fillStyle = mortar; c.fillRect(0, 0, size, size);
  const bh = size / rows, bw = size / cols;
  for (let row = 0; row < rows; row++) for (let k = -1; k <= cols; k++) {
    const x = k * bw + (row % 2 ? bw / 2 : 0), y = row * bh;
    const t = (r() - .5) * vary;
    c.fillStyle = `rgb(${rgb[0] + t},${rgb[1] + t * .9},${rgb[2] + t * .8})`;
    c.fillRect(x + 1, y + 1, bw - 2, bh - 2);
  }
  cloudy(c, size, size, 8, .14, seed);
  for (let i = 0; i < 700; i++) { c.fillStyle = `rgba(40,30,20,${r() * .12})`; c.fillRect(r() * size, r() * size, 1.2, 1.2); }
  grain(c, size, size, { amount: .14, seed: seed + 5 });
  return cv;
}

/** paper fibre (pages / plate backs): very soft fibres + warm mottling */
export function addPaperFibre(ctx, w, h, seed = 101) {
  const r = rng(seed);
  cloudy(ctx, w, h, 9, .07, seed, '120,85,45', '255,250,235');
  ctx.save(); ctx.lineWidth = .6;
  for (let i = 0; i < w * h / 900; i++) {
    const x = r() * w, y = r() * h, a = r() * Math.PI, L = 3 + r() * 9;
    ctx.strokeStyle = `rgba(110,80,50,${.04 + r() * .05})`;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); ctx.stroke();
  }
  ctx.restore();
}
