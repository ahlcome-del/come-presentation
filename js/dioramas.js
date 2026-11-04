/**
 * Five low-poly era dioramas, built from primitives at runtime (no model downloads).
 * Each diorama: a thin circular stone base + a building/vehicle split into "parts".
 * Every part has an explode direction: scene.js moves it by `dir * explode` so the
 * roof lifts and the walls separate, revealing a small lit interior.
 * Local +Z faces the camera.  3–4 materials per diorama.
 */
import * as THREE from './vendor/three.js';
import { mergeGeometries } from './vendor/three.js';
import * as TX from './textures.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _up = new THREE.Vector3();
let _smoke = null;
/** soft, slightly lumpy smoke puff (one small canvas, shared) */
function smokeTex() {
  if (_smoke) return _smoke;
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  for (const [px, py, r, a] of [[32, 34, 26, .55], [24, 28, 14, .35], [41, 27, 13, .35], [30, 40, 15, .3]]) {
    const g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  }
  _smoke = new THREE.CanvasTexture(c); _smoke.colorSpace = THREE.SRGBColorSpace;
  return _smoke;
}
const BASE_TOP = 0.05;

/* ---------------- geometry helpers ---------------- */
const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const cyl = (rt, rb, h, seg, x = 0, y = 0, z = 0) => new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y, z);
const ico = (r, d, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => new THREE.IcosahedronGeometry(r, d).scale(sx, sy, sz).translate(x, y, z);
const cone = (r, h, seg, x = 0, y = 0, z = 0) => new THREE.ConeGeometry(r, h, seg).translate(x, y, z);
function prism(width, height, depth, alongX = false) {
  const s = new THREE.Shape(); s.moveTo(-width / 2, 0); s.lineTo(width / 2, 0); s.lineTo(0, height); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false }).translate(0, 0, -depth / 2);
  if (alongX) g.rotateY(Math.PI / 2);
  return g;
}
/**
 * Bake cheap "ambient occlusion" + tonal variation into vertex colours:
 *  - darker where parts meet the ground (contact AO), lighter towards the top
 *  - each triangle gets a ±4 % tone jitter so no surface is a flat uniform colour
 */
const UV_SCALE = 2.2; // texture tiles per world unit
let _seed = 12345;
const rnd = () => ((_seed = (_seed * 16807) % 2147483647) / 2147483647);
export function bake(geo, ao = true) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const useAO = ao ? (y, t) => .56 + .44 * t * t * (3 - 2 * t) : (y) => (y < 0 ? .78 : 1);
  const pos = g.attributes.position, n = pos.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 3) {
    const jitter = 1 + (rnd() - .5) * .08;
    for (let k = 0; k < 3 && i + k < n; k++) {
      const y = pos.getY(i + k);
      const t = Math.min(1, Math.max(0, (y - .04) / .2));
      const ao = useAO(y, t);
      col.set([ao * jitter, ao * jitter * .99, ao * jitter * .97], (i + k) * 3);
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  // box-projected UVs in object space (per triangle, dominant normal axis):
  // constant texel density on every part, no stretched textures on long walls
  const uv = new Float32Array(n * 2), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i + 2 < n; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    const nx = Math.abs((b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y));
    const ny = Math.abs((b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z));
    const nz = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
    for (let k = 0; k < 3; k++) {
      const x = pos.getX(i + k), y = pos.getY(i + k), z = pos.getZ(i + k);
      const [u, v] = nx >= ny && nx >= nz ? [z, y] : ny >= nz ? [x, z] : [x, y];
      uv[(i + k) * 2] = u * UV_SCALE; uv[(i + k) * 2 + 1] = v * UV_SCALE;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (g !== geo) geo.dispose();
  return g;
}
/**
 * Weathering for masonry (applied on top of bake): damp, mossy greens creeping up from the
 * base, warm ochre stains and darker rain-streaked patches — low-frequency, per triangle,
 * so stone reads as old and lived-in rather than a uniform grey.
 */
const WEATHER = new Set();
const hashN = (x, y, z) => .5 + .5 * Math.sin(x * 11.3 + Math.sin(z * 8.7 + y * 3.1) * 2.2) * Math.sin(z * 9.1 - x * 4.3 + y * 6.7);
function weather(g, { moss = 1, soot = 0 } = {}) {
  const pos = g.attributes.position, col = g.attributes.color, n = pos.count;
  for (let i = 0; i + 2 < n; i += 3) {
    const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3, z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const a = hashN(x, y, z), b2 = hashN(z * 1.7 + 3, y * 2.3, x * 1.3 - 1);
    const low = Math.max(0, Math.min(1, (.2 - (y - BASE_TOP)) / .2));
    const m = moss * low * low * Math.max(0, a - .25) * 1.1;                     // moss / damp at the foot
    const st = Math.max(0, b2 - .55) * 1.4;                                      // ochre stain
    const dk = Math.max(0, a - .7) * 1.2 + soot * Math.max(0, (y - .5)) * .6;    // darker patches / soot
    const r = (1 - m * .28) * (1 + st * .1) * (1 - dk * .22), gg = (1 - m * .1) * (1 + st * .02) * (1 - dk * .2), bb = (1 - m * .36) * (1 - st * .12) * (1 - dk * .16);
    for (let k = 0; k < 3; k++) col.setXYZ(i + k, col.getX(i + k) * r, col.getY(i + k) * gg, col.getZ(i + k) * bb);
  }
  col.needsUpdate = true;
  return g;
}
function merge(geos) {
  const list = geos.map(bake);
  const m = mergeGeometries(list, false);
  list.forEach((g) => g.dispose());
  return m;
}

/* ---------------- shared materials ---------------- */
export function makeMaterials() {
  // small tiling canvases (256px) → colour + bump; generated once, shared by all dioramas
  const T = (cv, rep = 1) => {
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 4; return t;
  };
  const B = (cv, rep = 1) => { const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); return t; };
  const tex = {
    stone: TX.makeStone({ color: '#857a6c', seed: 3 }),
    marble: TX.makeStone({ color: '#d9cfbb', seed: 5, veins: 6, pores: .5 }),
    limestone: TX.makeStone({ color: '#b3a58c', seed: 7, pores: 1.4 }),
    terracotta: TX.makeStone({ color: '#8a5d48', seed: 9, pores: .8 }),
    slate: TX.makeStone({ color: '#4a4039', seed: 11, pores: .6 }),
    wood: TX.makeWood({ color: '#5b4433', seed: 13 }),
    sail: TX.makeStone({ color: '#e0d3b8', seed: 15, pores: .3 }),
    water: TX.makeStone({ color: '#4e5958', seed: 17, pores: .2 }),
    brick: TX.makeBrick({ seed: 19 }),
    ashlar: TX.makeBrick({ rgb: [146, 136, 118], mortar: '#5d564b', rows: 10, cols: 5, vary: 22, seed: 23 }),
    iron: TX.makePaintedMetal({ seed: 21 }),
    foliage: TX.makeStone({ color: '#5a5838', seed: 25, pores: 1.6 }),
    bark: TX.makeWood({ color: '#4a3a2c', seed: 27, planks: 1 }),
  };
  // natural, matte, almost no metalness; env reflections kept low
  const mat = (key, roughness, extra = {}, rep = 1) => new THREE.MeshStandardMaterial({
    map: T(tex[key], rep), bumpMap: B(tex[key], rep), bumpScale: 1.4, roughness, metalness: 0,
    vertexColors: true, flatShading: true, envMapIntensity: .45, ...extra,
  });
  const out = {
    stone: mat('stone', .95),
    marble: mat('marble', .8, { color: 0xf3e6cd }),
    limestone: mat('limestone', .92),
    terracotta: mat('terracotta', .9, { color: 0xd8a07a }),
    dark: mat('slate', .88),
    wood: mat('wood', .86),
    sail: mat('sail', .95, { side: THREE.DoubleSide, bumpScale: .6 }),
    water: mat('water', .42, { envMapIntensity: .7, bumpScale: 2 }, 2),
    brick: mat('brick', .93),
    ashlar: mat('ashlar', .96, { color: 0xcdc3b0, envMapIntensity: .3 }),
    foliage: mat('foliage', .95, { bumpScale: 2.2 }),
    bark: mat('bark', .92),
    iron: mat('iron', .62, { metalness: .25, envMapIntensity: .55 }),
    mirror: new THREE.MeshStandardMaterial({ color: 0xcfc4ae, metalness: 1, roughness: .16, envMapIntensity: .8 }),
    glow: new THREE.MeshStandardMaterial({ color: 0x120a04, emissive: 0xffb56e, emissiveIntensity: 2.4, roughness: 1 }),
    glowSoft: new THREE.MeshStandardMaterial({ color: 0x1a1208, emissive: 0xffc07a, emissiveIntensity: .9, roughness: .6 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x3e4a50, roughness: .18, metalness: .5, envMapIntensity: 1.4, vertexColors: true, flatShading: true }),
    flag: mat('terracotta', .9, { side: THREE.DoubleSide, color: 0xd28a70, bumpScale: .4 }),
    // colour life: dyed cloth, ivy, painted frieze, copper patina, awning canvas
    banner: mat('sail', .95, { side: THREE.DoubleSide, color: 0x9c3a2c, bumpScale: .4 }),
    bannerGold: mat('sail', .95, { side: THREE.DoubleSide, color: 0xc49a4a, bumpScale: .4 }),
    ivy: mat('foliage', .96, { color: 0xb4c290, bumpScale: 2.4 }),
    frieze: mat('limestone', .9, { color: 0x7f97a8 }),
    copper: mat('stone', .8, { color: 0x9fc4b0, envMapIntensity: .5 }),
    awning: mat('sail', .95, { side: THREE.DoubleSide, color: 0xb86a4e, bumpScale: .5 }),
    marbleWarm: mat('marble', .8, { color: 0xf0e4cc }),
    darkCloth: mat('stone', .95, { color: 0x6b5a48 }),
    oliveLeaf: mat('foliage', .96, { color: 0xbfc79a, bumpScale: 2.2 }),
  };
  out.ashlar.color = new THREE.Color(0xe0d0b0);               // warm sandstone, not grey
  out.limestone.color = new THREE.Color(0xf7e8c8);
  for (const [k, w] of [['ashlar', { moss: 1.2 }], ['stone', { moss: 1 }], ['marble', { moss: .8 }], ['limestone', { moss: .6 }], ['brick', { moss: .7, soot: 1 }], ['terracotta', { moss: .3 }]]) { out[k].userData.weather = w; WEATHER.add(out[k]); }
  return out;
}

/** ivy: leafy clumps climbing a wall/tower face, denser near the ground */
function ivyClumps(seed, n, place) {
  let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out = [];
  const stems = Math.max(2, Math.round(n / 10)), base = []; for (let k = 0; k < stems; k++) base.push((k + .2 + r() * .6) / stems);
  for (let i = 0; i < n; i++) {
    // leaves follow a few climbing stems that wander a little and thin out towards the top
    const st = base[i % stems], v = Math.pow(r(), 1.5), u = Math.min(1, Math.max(0, st + Math.sin(v * 9 + st * 20) * .05 + (r() - .5) * .06 * (1 - v * .5)));
    const [x, y, z] = place(u, v, r); out.push(new THREE.IcosahedronGeometry((.008 + r() * .009) * (1.2 - v * .5), 0).translate(x, y, z));
  }
  return out;
}
/** a hanging cloth banner with a soft ripple */
function bannerGeo(w, h, x, yTop, z, waves = 2) {
  const g = new THREE.PlaneGeometry(w, h, 2, 6), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getY(i) / h) * Math.PI * waves) * .004);
  return g.translate(x, yTop - h / 2, z);
}
function pennant(x, y, z, len = .07) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, -.03, 0, len, -.012, 0], 3)); g.computeVertexNormals();
  return g.translate(x + .003, y, z);
}

/* ---------------- builder scaffolding ---------------- */
class Builder {
  constructor(name, shadowTex, baseMat) {
    this.group = new THREE.Group(); this.group.name = name;
    this.parts = []; this.interior = V(0, .3, 0); this.animators = [];
    this.items = [];   // every mesh except the base, in build order: used for the staged assembly
    const base = new THREE.Mesh(bake(new THREE.CylinderGeometry(1, 1.035, .1, 56), false), baseMat);
    this.group.add(base);
    const rim = new THREE.Mesh(bake(new THREE.TorusGeometry(1.0, .006, 4, 72), false), baseMat);
    rim.rotation.x = Math.PI / 2; rim.position.y = BASE_TOP; this.group.add(rim);
    if (shadowTex) {
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 1.75),
        new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: .75, color: 0x000000, polygonOffset: true, polygonOffsetFactor: -2 }));
      sh.rotation.x = -Math.PI / 2; sh.position.y = BASE_TOP + .002; sh.renderOrder = 1;
      this.group.add(sh);
    }
  }
  /** add merged geometry as a part; dir = explode offset (local units) */
  part(geos, mat, dir = V(), { tilt = 0, tiltX = 0, pivot = null, parent = this.group } = {}) {
    const geo = Array.isArray(geos) ? merge(geos) : bake(geos);
    if (WEATHER.has(mat)) weather(geo, mat.userData.weather);
    const mesh = new THREE.Mesh(geo, mat);
    if (pivot) { geo.translate(-pivot.x, -pivot.y, -pivot.z); mesh.position.copy(pivot); }   // hinge for tiltX
    parent.add(mesh);
    const it = { obj: mesh, dir, base: mesh.position.clone(), tilt, tiltX, part: true };
    this.parts.push(it); this.items.push(it);
    return mesh;
  }
  fixed(geos, mat, parent = this.group) {
    const geo = Array.isArray(geos) ? merge(geos) : bake(geos);
    if (WEATHER.has(mat)) weather(geo, mat.userData.weather);
    const mesh = new THREE.Mesh(geo, mat);
    parent.add(mesh);
    this.items.push({ obj: mesh, dir: V(), base: mesh.position.clone(), part: false });
    return mesh;
  }
}

/* ======================= I. Antiquity — temple ======================= */
function antiquity(M, sh) {
  const b = new Builder('antiquity', sh, M.stone);
  const y0 = BASE_TOP;
  b.fixed([box(1.3, .05, .9, 0, y0 + .025, 0), box(1.2, .05, .8, 0, y0 + .075, 0)], M.marble);
  const fy = y0 + .1;                                            // stylobate top
  const column = (x, z) => [
    box(.08, .02, .08, x, fy + .01, z),
    cyl(.032, .038, .46, 8, x, fy + .02 + .23, z),
    box(.09, .03, .09, x, fy + .48 + .015, z),
  ].flat();
  const xs = [-.5, -.3, -.1, .1, .3, .5];
  b.part(xs.flatMap((x) => column(x, .33)), M.marble, V(0, 0, .34));
  b.part(xs.flatMap((x) => column(x, -.33)), M.marble, V(0, 0, -.2));
  b.part([...column(-.5, -.11), ...column(-.5, .11)], M.marble, V(-.26, 0, 0));
  b.part([...column(.5, -.11), ...column(.5, .11)], M.marble, V(.26, 0, 0));
  const ty = fy + .51;                                           // top of capitals
  b.part([box(1.18, .07, .82, 0, ty + .035, 0), box(1.12, .045, .76, 0, ty + .095, 0)], M.marble, V(0, .36, 0));
  // roof: tiles read as ribs, with a ridge tile on top and gutters at the eaves
  const roofG = [prism(1.22, .2, .86).translate(0, ty + .118, 0)];
  for (let i = -4; i <= 4; i++) { const rx = i * .13, ry = ty + .118 + .2 * (1 - Math.abs(rx) / .61); if (i) roofG.push(box(.012, .01, .89, rx, ry + .003, 0)); }
  roofG.push(cyl(.008, .008, .9, 4).rotateX(Math.PI / 2).translate(0, ty + .322, 0));
  roofG.push(box(1.26, .012, .05, 0, ty + .112, .43), box(1.26, .012, .05, 0, ty + .112, -.43));
  b.part(roofG, M.terracotta, V(0, .62, 0), { tilt: .08 });
  // traces of ancient paint: a faded blue frieze with a thin madder fillet
  b.part(box(1.2, .042, .84, 0, ty + .042, 0), M.frieze, V(0, .36, 0));
  b.part([box(1.206, .008, .846, 0, ty + .067, 0), box(1.206, .006, .846, 0, ty + .018, 0)], M.banner, V(0, .36, 0));
  // cella
  const ch = .44, cy = fy + ch / 2;
  b.part(box(.62, ch, .05, 0, cy, -.2), M.marble, V(0, 0, -.06));
  b.part(box(.05, ch, .4, -.31, cy, 0), M.marble, V(-.11, 0, 0));
  b.part(box(.05, ch, .4, .31, cy, 0), M.marble, V(.11, 0, 0));
  b.part([box(.2, ch, .05, -.21, cy, .2), box(.2, ch, .05, .21, cy, .2), box(.22, .12, .05, 0, fy + ch - .06, .2)], M.marble, V(0, 0, .2));
  // interior: statue + two braziers
  b.fixed([box(.1, .06, .1, 0, fy + .03, -.09), cyl(.028, .036, .17, 8, 0, fy + .145, -.09), new THREE.IcosahedronGeometry(.032, 0).translate(0, fy + .26, -.09)], M.marble);
  b.fixed([cyl(.006, .006, .09, 4, -.13, fy + .045, .06), cyl(.006, .006, .09, 4, .13, fy + .045, .06)], M.terracotta);
  b.fixed([new THREE.IcosahedronGeometry(.024, 0).translate(-.13, fy + .1, .06), new THREE.IcosahedronGeometry(.024, 0).translate(.13, fy + .1, .06)], M.glow);
  // ruins on the base
  b.fixed([cyl(.04, .042, .14, 8, .82, y0 + .07, .34), cyl(.04, .042, .07, 8, .7, y0 + .035, .55),
    cyl(.036, .036, .3, 8).rotateZ(Math.PI / 2).rotateY(.6).translate(-.74, y0 + .036, .44)], M.marble);
  // a small forum crowd: toga figures in twos and threes on the steps and the plinth
  const crowd = [], crowdDark = [], seedC = 501;
  let sc2 = seedC; const rc = () => ((sc2 = (sc2 * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 11; i++) {
    const a = -.9 + rc() * 2.0, r0 = .52 + rc() * .3;
    const x = Math.cos(a) * r0 * 1.15, z = .18 + Math.sin(a) * r0 * .55, yy = y0 + .1 + (rc() < .3 ? .05 : 0);
    const h = .036 + rc() * .012, tilt = (rc() - .5) * .08;
    crowd.push(cyl(.006, .011, h * .68, 5, x, yy + h * .34, z), cyl(.0045, .0045, h * .16, 4, x, yy + h * .76, z));
    crowdDark.push(ico(.0062, 0, x, yy + h * .92, z, 1, .9, 1));
  }
  b.part(crowd, M.marbleWarm, V(0, 0, .1));
  b.part(crowdDark, M.darkCloth, V(0, 0, .1));
  // a ruined stoa behind the temple: five columns on a low step, two broken, one capital fallen
  const stoa = [], stoaBroken = [];
  for (let i = 0; i < 5; i++) {
    const sx = -.62 + i * .31, hh = i === 1 ? .3 : i === 3 ? .22 : .42;
    stoa.push(box(.08, .03, .08, sx, y0 + .115, -.66), cyl(.026, .031, hh, 7, sx, y0 + .13 + hh / 2, -.66));
    if (hh > .3) stoa.push(box(.075, .025, .075, sx, y0 + .13 + hh + .012, -.66));
  }
  stoa.push(box(1.3, .035, .16, 0, y0 + .117, -.56), cyl(.031, .031, .09, 7).rotateZ(Math.PI / 2).translate(-.2, y0 + .165, -.44));
  b.fixed(stoa, M.marble);
  const scrub = [];
  { let s3 = 907; const r3 = () => ((s3 = (s3 * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 46; i++) { const a = r3() * Math.PI * 2, rr = .6 + r3() * .36; const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      if (Math.abs(x) < .72 && z > -.5 && z < .55) continue;                 // keep the temple's own footprint clear
      scrub.push(cone(.012 + r3() * .008, .03 + r3() * .03, 4, x, y0 + .015, z)); } }
  b.fixed(scrub, M.oliveLeaf);
  b.fixed(ivyClumps(71, 22, (u, v) => [.62 + u * .26, y0 + .005 + v * .09, .3 + (1 - u) * .3]), M.ivy);
  b.fixed(ivyClumps(73, 12, (u, v) => [-.86 + u * .22, y0 + .005 + v * .05, .34 + u * .2]), M.ivy);
  const olives = [];
  for (const [ox, oz, sc] of [[.78, -.5, 1], [-.8, -.62, .85], [.9, .55, .8], [-.95, .3, .7]]) {
    olives.push(cyl(.012, .018, .14 * sc, 5, ox, y0 + .07 * sc, oz).rotateZ(ox * .06), cyl(.008, .01, .07 * sc, 4, ox + .03 * sc, y0 + .13 * sc, oz).rotateZ(-.5));
  }
  b.fixed(olives, M.bark);
  const canopy = [];
  for (const [ox, oz, sc] of [[.78, -.5, 1], [-.8, -.62, .85], [.9, .55, .8], [-.95, .3, .7]]) {
    canopy.push(ico(.06 * sc, 0, ox - .02 * sc, y0 + .19 * sc, oz, 1.35, .75, 1.15), ico(.045 * sc, 0, ox + .05 * sc, y0 + .2 * sc, oz + .03, 1.2, .7, 1));
  }
  b.fixed(canopy, M.oliveLeaf);
  b.interior.set(0, fy + .25, .05);
  return b;
}

/* ======================= II. Middle Ages — castle ======================= */
function middleAges(M, sh) {
  const b = new Builder('middle-ages', sh, M.stone);
  const y0 = BASE_TOP;
  b.fixed(cyl(.82, .9, .07, 12, 0, y0 + .035, 0), M.stone);
  const gy = y0 + .07, H = .3, half = .52, t = .07;
  const merlons = (x0, x1, z, alongX = true) => {
    const out = []; const n = Math.round(Math.abs(x1 - x0) / .1);
    for (let i = 0; i <= n; i++) {
      const p = x0 + (x1 - x0) * i / n;
      out.push(alongX ? box(.05, .05, t + .01, p, gy + H + .025, z) : box(t + .01, .05, .05, z, gy + H + .025, p));
    }
    return out;
  };
  b.part([box(.42, H, t, -.31, gy + H / 2, half), box(.42, H, t, .31, gy + H / 2, half), box(.2, .1, t, 0, gy + H - .05, half), ...merlons(-.5, .5, half)], M.ashlar, V(0, 0, .38));
  b.part([box(1.04, H, t, 0, gy + H / 2, -half), ...merlons(-.5, .5, -half)], M.ashlar, V(0, 0, -.14));
  b.part([box(t, H, 1.04, -half, gy + H / 2, 0), ...merlons(-.5, .5, -half, false)], M.ashlar, V(-.2, 0, 0));
  b.part([box(t, H, 1.04, half, gy + H / 2, 0), ...merlons(-.5, .5, half, false)], M.ashlar, V(.2, 0, 0));
  b.fixed(box(.16, .2, .02, 0, gy + .1, half - .02), M.dark);           // gate
  b.fixed([box(.2, .22, .008, 0, gy + .105, half + .002)], M.glow);      // warm light inside the gate
  b.fixed([new THREE.IcosahedronGeometry(.009, 0).translate(-.12, gy + .15, half + .012), new THREE.IcosahedronGeometry(.009, 0).translate(.12, gy + .15, half + .012)], M.glow);
  b.fixed([cyl(.003, .003, .05, 4, -.12, gy + .12, half + .01), cyl(.003, .003, .05, 4, .12, gy + .12, half + .01)], M.iron);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = sx * half, z = sz * half, d = V(sx, 0, sz).normalize().multiplyScalar(sz > 0 ? .26 : .16);
    b.part(cyl(.115, .13, .46, 10, x, gy + .23, z), M.ashlar, d);
    b.part(new THREE.ConeGeometry(.155, .26, 10).translate(x, gy + .46 + .13, z), M.dark, d.clone().add(V(0, .3, 0)));
  }
  // keep: four walls + crenellated top + pyramidal roof
  const k = .19, kh = .62, kt = .045;
  b.part(box(2 * k, kh, kt, 0, gy + kh / 2, k), M.ashlar, V(0, 0, .3));
  b.part(box(2 * k, kh, kt, 0, gy + kh / 2, -k), M.ashlar, V(0, 0, -.05));
  b.part(box(kt, kh, 2 * k, -k, gy + kh / 2, 0), M.ashlar, V(-.1, 0, 0));
  b.part(box(kt, kh, 2 * k, k, gy + kh / 2, 0), M.ashlar, V(.1, 0, 0));
  const top = gy + kh;
  const kmer = []; for (let i = -2; i <= 2; i++) { kmer.push(box(.05, .05, .05, i * .09, top + .05, k), box(.05, .05, .05, i * .09, top + .05, -k), box(.05, .05, .05, k, top + .05, i * .09), box(.05, .05, .05, -k, top + .05, i * .09)); }
  b.part([box(2 * k + .04, .05, 2 * k + .04, 0, top + .0, 0), ...kmer], M.ashlar, V(0, .42, 0));
  b.part(new THREE.ConeGeometry(.24, .34, 4).rotateY(Math.PI / 4).translate(0, top + .25, 0), M.dark, V(0, .62, 0), { tilt: .06 });
  // interior: hall floor, hearth, table
  b.fixed([box(2 * k - .06, .015, 2 * k - .06, 0, gy + .3, 0)], M.dark);
  b.fixed([box(.14, .02, .07, .02, gy + .07, -.02), cyl(.006, .006, .06, 4, -.03, gy + .03, -.02), cyl(.006, .006, .06, 4, .07, gy + .03, -.02)], M.dark);
  b.fixed([box(.012, .05, .006, -.07, gy + .44, k + kt / 2 + .002), box(.012, .05, .006, .07, gy + .44, k + kt / 2 + .002), box(.012, .05, .006, 0, gy + .55, k + kt / 2 + .002)], M.glow);
  b.fixed([box(.09, .045, .03, 0, gy + .022, -k + .04), box(.07, .03, .02, 0, gy + .3 + .03, -k + .04)], M.glow);
  // colour life: madder & ochre banners on the keep, pennants on the towers, ivy creeping
  // up the front towers and the curtain wall
  b.part([bannerGeo(.07, .22, -.085, top - .04, k + kt / 2 + .004), bannerGeo(.07, .22, .085, top - .04, k + kt / 2 + .004)], M.banner, V(0, 0, .3));
  b.part([box(.09, .008, .01, -.085, top - .038, k + kt / 2 + .006), box(.09, .008, .01, .085, top - .038, k + kt / 2 + .006)], M.bannerGold, V(0, 0, .3));
  b.part([bannerGeo(.06, .14, -.31, gy + H - .02, half + t / 2 + .004, 1.5), bannerGeo(.06, .14, .31, gy + H - .02, half + t / 2 + .004, 1.5)], M.bannerGold, V(0, 0, .38));
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = sx * half, z = sz * half, d = V(sx, 0, sz).normalize().multiplyScalar(sz > 0 ? .26 : .16).add(V(0, .3, 0)), tip = gy + .46 + .26;
    b.part([cyl(.003, .003, .09, 4, x, tip + .04, z), pennant(x, tip + .08, z)], sx < 0 ? M.banner : M.bannerGold, d);
    if (sz > 0) {
      const a0 = Math.atan2(1, sx * .6);                                  // the side facing the camera
      b.part(ivyClumps(31 + sx * 7, 34, (u, v) => { const a = a0 + (u - .5) * 1.6, rr = .133 - v * .015; return [x + Math.cos(a) * rr, gy + .01 + v * .36, z + Math.sin(a) * rr]; }), M.ivy, V(sx, 0, sz).normalize().multiplyScalar(.26));
    }
  }
  b.part(ivyClumps(53, 30, (u, v) => [-.46 + u * .3, gy + .01 + v * .24, half + t / 2 + .006]), M.ivy, V(0, 0, .38));
  b.part(ivyClumps(59, 16, (u, v) => [.2 + u * .2, gy + .01 + v * .16, half + t / 2 + .006]), M.ivy, V(0, 0, .38));
  b.interior.set(0, gy + .2, 0);
  return b;
}

/* ======================= III. Age of Discovery — galleon ======================= */
function discovery(M, sh) {
  const b = new Builder('discovery', null, M.water);
  const y0 = BASE_TOP;
  // stylised faceted waves
  const waves = new THREE.RingGeometry(.0, .985, 40, 9);
  waves.rotateX(-Math.PI / 2); waves.translate(0, y0 + .005, 0);
  const wpos = waves.attributes.position, orig = wpos.array.slice();
  const wmesh = b.fixed(waves, M.water);
  b.animators.push((t) => {
    for (let i = 0; i < wpos.count; i++) {
      const x = orig[i * 3], z = orig[i * 3 + 2], r = Math.hypot(x, z), edge = Math.min(1, (1 - r) * 8);
      wpos.array[i * 3 + 1] = orig[i * 3 + 1] + edge * .03 * (Math.sin(x * 9 + t * .9) * .6 + Math.sin(z * 7 - t * .7 + x * 3) * .4 + .5);
    }
    wpos.needsUpdate = true; waves.computeVertexNormals();
  });
  // ship assembly (rocks gently)
  const ship = new THREE.Group(); ship.position.y = y0 + .14; b.group.add(ship);
  b.animators.push((t) => { ship.rotation.z = Math.sin(t * .8) * .025; ship.rotation.x = Math.sin(t * .6 + 1) * .02; ship.position.y = y0 + .14 + Math.sin(t * .9) * .008; });
  const s = new THREE.Shape();
  s.moveTo(-.62, .3); s.lineTo(-.58, .08); s.quadraticCurveTo(-.46, -.1, -.1, -.11); s.lineTo(.24, -.11);
  s.quadraticCurveTo(.56, -.08, .72, .2); s.lineTo(.52, .2); s.lineTo(-.3, .19); s.lineTo(-.36, .3); s.closePath();
  const hullHalf = (z0) => new THREE.ExtrudeGeometry(s, { depth: .15, bevelEnabled: false, curveSegments: 6 }).translate(0, 0, z0);
  b.part(hullHalf(-.15), M.wood, V(0, 0, -.06), { parent: ship });
  b.part(hullHalf(0), M.wood, V(0, 0, .34), { parent: ship });
  // painted wales along the hull (ochre and madder strakes)
  b.part([box(1.1, .02, .006, .04, .15, .152), box(.9, .012, .006, .0, .06, .152)], M.bannerGold, V(0, 0, .34), { parent: ship });
  b.part([box(1.1, .02, .006, .04, .15, -.152)], M.bannerGold, V(0, 0, -.06), { parent: ship });
  b.part([box(.26, .03, .006, -.47, .27, .157)], M.banner, V(0, 0, .34), { parent: ship });
  // interior: lower deck, crates, barrels, lantern
  b.fixed([box(.95, .012, .28, -.02, -.02, 0), box(.08, .07, .08, .18, .02, -.04), box(.07, .06, .07, .28, .015, .05), box(.09, .08, .09, -.32, .02, .02),
    cyl(.035, .035, .08, 8, .05, .02, .07), cyl(.035, .035, .08, 8, -.05, .02, -.07)], M.wood, ship);
  b.fixed(new THREE.IcosahedronGeometry(.022, 0).translate(-.12, .07, 0), M.glow, ship);
  // upper works: deck, castles, masts, yards
  const up = [box(.98, .02, .31, -.02, .19, 0), box(.27, .1, .31, -.47, .25, 0), box(.16, .05, .29, .44, .225, 0)];
  const masts = [[-.27, .78], [.04, .92], [.36, .66]];
  for (const [x, h] of masts) {
    up.push(cyl(.012, .016, h, 6, x, .2 + h / 2, 0));
    up.push(cyl(.006, .006, h * .52, 4, x, .2 + h * .78, 0).rotateX(Math.PI / 2).translate(0, 0, 0));
  }
  up.push(cyl(.008, .008, .34, 4).rotateZ(-1.15).translate(.66, .32, 0));   // bowsprit
  const upper = new THREE.Group(); ship.add(upper);
  b.part(up, M.wood, V(0, .3, 0), { parent: upper });
  // sails: curved planes
  const sail = (x, y, w, h, belly = .05) => {
    const g = new THREE.PlaneGeometry(w, h, 4, 3), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const u = p.getX(i) / w + .5, v = p.getY(i) / h + .5; p.setZ(i, belly * Math.sin(Math.PI * u) * (.6 + .4 * Math.sin(Math.PI * v))); }
    g.rotateY(Math.PI / 2); g.translate(x, y, 0); return g;
  };
  const sails = [];
  for (const [x, h] of masts) { sails.push(sail(x + .012, .2 + h * .48, .34, h * .3), sail(x + .012, .2 + h * .8, .26, h * .2)); }
  b.part(sails, M.sail, V(0, .3, 0), { parent: upper });
  b.part(masts.map(([x, h], i) => pennant(x, .2 + h + .005, 0, i === 1 ? .12 : .08)), M.banner, V(0, .3, 0), { parent: upper });
  b.interior.set(-.1, .25, .05);
  return b;
}

/* ======================= IV. Industrial — locomotive, chimney, conference hall ======================= */
function industrial(M, sh) {
  const b = new Builder('industrial', sh, M.stone);
  const y0 = BASE_TOP, rz = .58;
  const rails = [box(1.6, .016, .014, 0, y0 + .02, rz - .05), box(1.6, .016, .014, 0, y0 + .02, rz + .05)];
  for (let x = -.75; x <= .75; x += .09) rails.push(box(.03, .01, .16, x, y0 + .006, rz));
  b.fixed(rails, M.iron);
  // locomotive
  const L = new THREE.Group(); L.position.set(-.18, y0 + .03, rz); b.group.add(L);
  const loco = [
    cyl(.07, .07, .42, 12).rotateZ(Math.PI / 2).translate(.04, .14, 0),
    cyl(.075, .075, .05, 12).rotateZ(Math.PI / 2).translate(.27, .14, 0),
    cyl(.03, .022, .1, 8, .22, .25, 0), cyl(.045, .03, .03, 8, .22, .31, 0),
    cyl(.025, .025, .04, 8, .05, .23, 0),
    box(.15, .17, .16, -.22, .17, 0), box(.19, .016, .2, -.22, .265, 0),
    box(.56, .03, .14, 0, .07, 0),
    box(.2, .1, .14, -.44, .1, 0),
  ];
  for (const x of [-.12, .02, .16]) for (const z of [-.07, .07]) loco.push(cyl(.05, .05, .018, 12).rotateX(Math.PI / 2).translate(x, .05, z));
  b.part(loco, M.iron, V(.1, 0, .12), { parent: L });
  b.fixed(box(.05, .04, .1, -.25, .12, 0), M.glow, L);
  // factory chimney
  b.fixed([cyl(.06, .095, 1.12, 10, -.62, y0 + .56, -.32), cyl(.075, .075, .04, 10, -.62, y0 + 1.1, -.32), cyl(.11, .12, .1, 10, -.62, y0 + .05, -.32)], M.brick);
  b.fixed([cyl(.066, .066, .02, 10, -.62, y0 + .78, -.32), cyl(.075, .075, .02, 10, -.62, y0 + .5, -.32)], M.iron);
  // conference hall
  const hx = .2, hz = -.18, w = .86, d = .58, h = .4, t = .04, gy = y0;
  b.part(box(w, h, t, hx, gy + h / 2, hz - d / 2), M.brick, V(0, 0, -.08));
  b.part([box(w, h, t, hx, gy + h / 2, hz + d / 2)], M.brick, V(0, 0, .36));
  b.part(box(t, h, d, hx - w / 2, gy + h / 2, hz), M.brick, V(-.14, 0, 0));
  b.part(box(t, h, d, hx + w / 2, gy + h / 2, hz), M.brick, V(.14, 0, 0));
  b.part([prism(d + .08, .2, w + .08, true).translate(hx, gy + h, hz), box(w + .06, .02, d + .06, hx, gy + h + .01, hz)], M.iron, V(0, .56, 0), { tilt: .05 });
  // interior: long table, chairs, globe, lamp
  const tin = [box(.48, .018, .14, hx, gy + .12, hz), box(.02, .1, .02, hx - .2, gy + .06, hz), box(.02, .1, .02, hx + .2, gy + .06, hz)];
  for (let i = -2; i <= 2; i++) tin.push(box(.04, .07, .04, hx + i * .09, gy + .035, hz - .12), box(.04, .07, .04, hx + i * .09, gy + .035, hz + .12));
  tin.push(cyl(.006, .01, .07, 6, hx + .32, gy + .035, hz - .14));
  b.fixed(tin, M.wood);
  b.fixed(new THREE.SphereGeometry(.05, 14, 10).translate(hx + .32, gy + .12, hz - .14), M.sail);
  b.fixed([new THREE.IcosahedronGeometry(.022, 0).translate(hx, gy + .3, hz), new THREE.IcosahedronGeometry(.016, 0).translate(hx - .2, gy + .28, hz), new THREE.IcosahedronGeometry(.016, 0).translate(hx + .2, gy + .28, hz)], M.glow);
  // coal smoke drifting from the chimney and the locomotive (soft grey puffs, normal blending)
  const puffs = [];
  const puffMat = (c, o) => new THREE.SpriteMaterial({ map: smokeTex(), color: c, transparent: true, opacity: 0, depthWrite: false });
  for (let i = 0; i < 9; i++) { const sp = new THREE.Sprite(puffMat(0x8a8378, .5)); b.group.add(sp); puffs.push({ sp, ph: i / 9, src: V(-.62, y0 + 1.13, -.32), rise: .5, drift: V(1.1, 0, .3), s0: .1, s1: .55, o: .36 }); }
  for (let i = 0; i < 5; i++) { const sp = new THREE.Sprite(puffMat(0xb8b2a6, .4)); L.add(sp); puffs.push({ sp, ph: i / 5, src: V(.22, .33, 0), rise: .28, drift: V(-.35, 0, 0), s0: .05, s1: .2, o: .32 }); }
  b.animators.push((t, a = 1) => {
    const on = Math.max(0, Math.min(1, (a - .8) / .2));
    for (const q of puffs) {
      const u = (t * .09 + q.ph) % 1, sp = q.sp;
      sp.position.copy(q.src).addScaledVector(q.drift, u * u * .7).add(_up.set(0, q.rise * u, 0));
      const sc = q.s0 + (q.s1 - q.s0) * u; sp.scale.set(sc, sc, 1);
      sp.material.opacity = q.o * on * Math.sin(Math.PI * Math.min(1, u * 1.15)) * (1 - u * .4);
      sp.visible = sp.material.opacity > .003;
    }
  });
  b.fixed(ivyClumps(81, 26, (u, v) => [hx - w / 2 + .02 + u * .3, gy + .005 + v * .22, hz + d / 2 + t / 2 + .006]), M.ivy);
  b.interior.set(hx, gy + .25, hz + .05);
  return b;
}

/* ======================= V. Early 20th c. — art-deco ministry (treaty hall inside) ======================= */
function twentieth(M, sh) {
  const b = new Builder('twentieth', sh, M.stone);
  const y0 = BASE_TOP, L = 1.36, D = .56, H = .34, t = .04, gy = y0 + .03;
  b.fixed([box(L + .2, .03, D + .16, 0, y0 + .015, 0), box(.46, .014, .1, 0, gy + .007, D / 2 + .1), box(.38, .014, .07, 0, gy + .021, D / 2 + .085)], M.limestone);
  // inlaid floor + treaty table + chairs
  const tiles = []; for (let x = -.6; x <= .6; x += .12) for (let z = -.2; z <= .2; z += .1) if ((Math.round(x / .12) + Math.round(z / .1)) % 2 === 0) tiles.push(box(.12, .004, .1, x, gy + .002, z));
  b.fixed(tiles, M.dark);
  const tb = [box(.42, .016, .13, 0, gy + .1, 0), box(.02, .09, .02, -.18, gy + .045, 0), box(.02, .09, .02, .18, gy + .045, 0)];
  for (let i = -2; i <= 2; i++) tb.push(box(.035, .06, .035, i * .08, gy + .03, -.11), box(.035, .06, .035, i * .08, gy + .03, .11));
  b.fixed(tb, M.wood);
  b.fixed(box(.07, .003, .05, 0, gy + .11, 0), M.sail);                                 // the treaty
  // back & end walls with window bands
  const pierRow = (n, len, z, alongX = true) => { const o = []; for (let i = 0; i <= n; i++) { const u = -len / 2 + len * i / n; o.push(alongX ? box(.034, H, t + .012, u, gy + H / 2, z) : box(t + .012, H, .034, z, gy + H / 2, u)); } return o; };
  b.part([box(L, .05, t, 0, gy + .025, -D / 2), box(L, .05, t, 0, gy + H - .025, -D / 2), box(L, .022, t, 0, gy + .18, -D / 2), ...pierRow(10, L, -D / 2)], M.limestone, V(0, 0, -.18));
  b.part(box(L - .02, H - .08, .01, 0, gy + H / 2, -D / 2 + .004), M.glass, V(0, 0, -.18));
  for (const sx of [-1, 1]) {
    b.part([box(t, .05, D, sx * L / 2, gy + .025, 0), box(t, .05, D, sx * L / 2, gy + H - .025, 0), box(t, .022, D, sx * L / 2, gy + .18, 0), ...pierRow(4, D, sx * L / 2, false)], M.limestone, V(sx * .13, 0, 0));
    b.part(box(.01, H - .08, D - .02, sx * (L / 2 - .004), gy + H / 2, 0), M.glass, V(sx * .13, 0, 0));
  }
  // front facade: piers, bands, glazing, central portal with canopy — falls forward to open
  const pv = V(0, gy, D / 2 + t / 2), opt = { tiltX: .95, pivot: pv };
  const front = [box(L, .05, t, 0, gy + .025, D / 2), box(L + .03, .045, t + .03, 0, gy + H - .02, D / 2 + .005), box(L, .022, t, 0, gy + .18, D / 2), ...pierRow(10, L, D / 2)];
  front.push(box(.26, .27, .06, 0, gy + .135, D / 2 + .02), box(.32, .016, .1, 0, gy + .215, D / 2 + .05), box(.05, .14, .07, -.11, gy + H + .05, D / 2 + .01), box(.05, .14, .07, .11, gy + H + .05, D / 2 + .01));
  b.part(front, M.limestone, V(0, 0, .14), opt);
  b.part([box(L - .02, H - .08, .01, 0, gy + H / 2, D / 2 - .004), box(.13, .17, .012, 0, gy + .085, D / 2 + .052)], M.glass, V(0, 0, .14), opt);
  const lit = []; for (const [x, y] of [[-.47, .1], [-.2, .26], [.34, .1], [.47, .26], [-.6, .26], [.2, .1]]) lit.push(box(.09, .06, .006, x, gy + y, D / 2 + .004));
  for (const [x, y] of [[-.33, .26], [.07, .26], [-.07, .1], [.6, .1], [-.6, .1], [.6, .26]]) lit.push(box(.09, .06, .006, x, gy + y, D / 2 + .004));
  b.part(lit, M.glowSoft, V(0, 0, .14), opt);
  // canvas awnings over the ground-floor windows, long red banners either side of the portal
  const aw = []; for (const x of [-.54, -.4, -.27, .27, .4, .54]) aw.push(box(.1, .005, .05).rotateX(.45).translate(x, gy + .152, D / 2 + .032));
  b.part(aw, M.awning, V(0, 0, .14), opt);
  b.part([bannerGeo(.045, .2, -.165, gy + H - .03, D / 2 + .03, 1), bannerGeo(.045, .2, .165, gy + H - .03, D / 2 + .03, 1)], M.banner, V(0, 0, .14), opt);
  // roof slab + stepped central tower (setbacks), fins, flagpoles — the top lifts
  const top = gy + H;
  const tower = [box(L + .04, .025, D + .04, 0, top + .012, 0), box(.52, .14, .38, 0, top + .095, 0), box(.36, .12, .28, 0, top + .225, 0)];
  b.part([box(.2, .1, .18, 0, top + .335, 0), box(.22, .018, .2, 0, top + .392, 0)], M.copper, V(0, .5, 0));     // green copper crown
  for (const x of [-.12, -.06, 0, .06, .12]) tower.push(box(.02, .14, .012, x, top + .225, .146));
  tower.push(cyl(.006, .01, .16, 6, 0, top + .465, 0));
  for (const x of [-.6, .6]) tower.push(cyl(.004, .005, .28, 5, x, top + .15, D / 2 - .04));
  b.part(tower, M.limestone, V(0, .5, 0));
  b.part([box(.44, .09, .01, 0, top + .095, .192), box(.3, .07, .01, 0, top + .225, .142)], M.glass, V(0, .5, 0));
  const flag = (x, y, z) => { const g = new THREE.PlaneGeometry(.1, .065, 4, 1), p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) + .05) * 30) * .007); return g.translate(x + .05, y, z); };
  b.part([flag(-.6, top + .25, D / 2 - .04), flag(.6, top + .25, D / 2 - .04)], M.flag, V(0, .5, 0));
  // forecourt: flagpoles and lamps in front of the steps
  b.fixed([cyl(.005, .007, .46, 5, -.52, gy + .23, D / 2 + .16), cyl(.005, .007, .46, 5, .52, gy + .23, D / 2 + .16), cyl(.02, .024, .02, 8, -.52, gy + .01, D / 2 + .16), cyl(.02, .024, .02, 8, .52, gy + .01, D / 2 + .16),
    cyl(.004, .006, .2, 5, -.3, gy + .1, D / 2 + .2), cyl(.004, .006, .2, 5, .3, gy + .1, D / 2 + .2)], M.iron);
  b.fixed([flag(-.52, gy + .42, D / 2 + .16), flag(.52, gy + .42, D / 2 + .16)], M.banner);
  b.fixed([box(.022, .028, .022, -.3, gy + .21, D / 2 + .2), box(.022, .028, .022, .3, gy + .21, D / 2 + .2)], M.glow);
  // clipped hedges and two small trees in planters along the forecourt
  b.fixed([box(.36, .045, .05, -.5, gy + .022, D / 2 + .1), box(.36, .045, .05, .5, gy + .022, D / 2 + .1),
    new THREE.IcosahedronGeometry(.06, 1).translate(-.7, gy + .16, D / 2 + .08), new THREE.IcosahedronGeometry(.06, 1).translate(.7, gy + .16, D / 2 + .08)], M.ivy);
  b.fixed([box(.07, .05, .07, -.7, gy + .025, D / 2 + .08), box(.07, .05, .07, .7, gy + .025, D / 2 + .08)], M.stone);
  b.fixed([cyl(.006, .008, .07, 5, -.7, gy + .08, D / 2 + .08), cyl(.006, .008, .07, 5, .7, gy + .08, D / 2 + .08)], M.bark);
  // chandeliers in the hall
  const ch = [];
  for (const x of [-.4, 0, .4]) { ch.push(new THREE.IcosahedronGeometry(.026, 0).translate(x, gy + .28, 0)); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; ch.push(new THREE.IcosahedronGeometry(.013, 0).translate(x + Math.cos(a) * .05, gy + .27, Math.sin(a) * .05)); } }
  b.part(ch, M.glow, V(0, .12, 0));
  b.interior.set(0, gy + .2, 0);
  return b;
}

export const DIORAMA_BUILDERS = [antiquity, middleAges, discovery, industrial, twentieth];

/** sort assembly order bottom → top (floors and walls first, roofs last) */
function orderItems(b) {
  const box3 = new THREE.Box3();
  b.group.updateMatrixWorld(true);
  for (const it of b.items) { box3.setFromObject(it.obj); it.y = box3.min.y; it.cy = (box3.min.y + box3.max.y) / 2; }
  b.items.sort((a, c) => a.y - c.y);
  b.items.forEach((it, j) => { it.order = j / Math.max(1, b.items.length - 1); });
}

export function buildDiorama(i, materials, shadowTex) {
  const b = DIORAMA_BUILDERS[i](materials, shadowTex);
  orderItems(b);
  return b;
}
