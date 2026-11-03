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
const BASE_TOP = 0.05;

/* ---------------- geometry helpers ---------------- */
const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const cyl = (rt, rb, h, seg, x = 0, y = 0, z = 0) => new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y, z);
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
    ashlar: TX.makeBrick({ rgb: [176, 160, 134], mortar: '#7d705f', rows: 8, cols: 4, vary: 26, seed: 23 }),
    iron: TX.makePaintedMetal({ seed: 21 }),
    foliage: TX.makeStone({ color: '#5a5838', seed: 25, pores: 1.6 }),
    bark: TX.makeWood({ color: '#4a3a2c', seed: 27, planks: 1 }),
  };
  // natural, matte, almost no metalness; env reflections kept low
  const mat = (key, roughness, extra = {}, rep = 1) => new THREE.MeshStandardMaterial({
    map: T(tex[key], rep), bumpMap: B(tex[key], rep), bumpScale: 1.4, roughness, metalness: 0,
    vertexColors: true, flatShading: true, envMapIntensity: .45, ...extra,
  });
  return {
    stone: mat('stone', .95),
    marble: mat('marble', .78),
    limestone: mat('limestone', .92),
    terracotta: mat('terracotta', .9),
    dark: mat('slate', .88),
    wood: mat('wood', .86),
    sail: mat('sail', .95, { side: THREE.DoubleSide, bumpScale: .6 }),
    water: mat('water', .42, { envMapIntensity: .7, bumpScale: 2 }, 2),
    brick: mat('brick', .93),
    ashlar: mat('ashlar', .94),
    foliage: mat('foliage', .95, { bumpScale: 2.2 }),
    bark: mat('bark', .92),
    iron: mat('iron', .62, { metalness: .25, envMapIntensity: .55 }),
    mirror: new THREE.MeshStandardMaterial({ color: 0xcfc4ae, metalness: 1, roughness: .16, envMapIntensity: .8 }),
    glow: new THREE.MeshStandardMaterial({ color: 0x120a04, emissive: 0xffb56e, emissiveIntensity: 2.4, roughness: 1 }),
  };
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
    const mesh = new THREE.Mesh(geo, mat);
    if (pivot) { geo.translate(-pivot.x, -pivot.y, -pivot.z); mesh.position.copy(pivot); }   // hinge for tiltX
    parent.add(mesh);
    const it = { obj: mesh, dir, base: mesh.position.clone(), tilt, tiltX, part: true };
    this.parts.push(it); this.items.push(it);
    return mesh;
  }
  fixed(geos, mat, parent = this.group) {
    const mesh = new THREE.Mesh(Array.isArray(geos) ? merge(geos) : bake(geos), mat);
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
  b.part(prism(1.22, .2, .86).translate(0, ty + .118, 0), M.terracotta, V(0, .62, 0), { tilt: .08 });
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
  b.fixed([box(.09, .045, .03, 0, gy + .022, -k + .04), box(.07, .03, .02, 0, gy + .3 + .03, -k + .04)], M.glow);
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
  b.interior.set(hx, gy + .25, hz + .05);
  return b;
}

/* ======================= V. Early 20th c. — hall of mirrors ======================= */
function twentieth(M, sh) {
  const b = new Builder('twentieth', sh, M.stone);
  const y0 = BASE_TOP, L = 1.5, Wd = .58, H = .42, t = .04, gy = y0 + .03;
  b.fixed(box(L + .1, .03, Wd + .1, 0, y0 + .015, 0), M.marble);
  // inlaid floor (stone squares)
  const tiles = []; for (let x = -.66; x <= .66; x += .12) for (let z = -.22; z <= .22; z += .11) if ((Math.round(x / .12) + Math.round(z / .11)) % 2 === 0) tiles.push(box(.12, .004, .11, x, gy + .002, z));
  b.fixed(tiles, M.stone);
  // mirror wall (back) — piers + mirror arches
  const back = [box(L, H, t, 0, gy + H / 2, -Wd / 2), box(L, .06, t + .02, 0, gy + H - .03, -Wd / 2 + .01)];
  const mirrors = [];
  for (let i = -3; i <= 3; i++) {
    mirrors.push(box(.14, .26, .008, i * .2, gy + .17, -Wd / 2 + .024));
    mirrors.push(cyl(.07, .07, .008, 12, 0, 0, 0).rotateX(Math.PI / 2).translate(i * .2, gy + .3, -Wd / 2 + .024));
  }
  const dirBack = V(0, 0, -.22);
  b.part(back, M.marble, dirBack); b.part(mirrors, M.mirror, dirBack.clone());
  // window wall (front) — piers + lit windows
  const piers = [box(L, .06, t, 0, gy + H - .03, Wd / 2), box(L, .05, t, 0, gy + .025, Wd / 2)];
  for (let i = -4; i <= 4; i++) piers.push(box(.06, H, t, i * .2 - (i > 0 ? .0 : 0), gy + H / 2, Wd / 2));
  // the window wall falls forward like a drawbridge to open the gallery
  b.part(piers, M.marble, V(0, 0, .16), { tiltX: 1.2, pivot: V(0, gy, Wd / 2 + t / 2) });
  // end walls
  b.part(box(t, H, Wd, -L / 2, gy + H / 2, 0), M.marble, V(-.16, 0, 0));
  b.part(box(t, H, Wd, L / 2, gy + H / 2, 0), M.marble, V(.16, 0, 0));
  // barrel vault + cornice
  const vault = new THREE.CylinderGeometry(Wd / 2 + .02, Wd / 2 + .02, L + .04, 18, 1, true, -Math.PI / 2, Math.PI).rotateZ(Math.PI / 2).rotateX(Math.PI / 2).translate(0, gy + H, 0);
  const vm = M.marble.clone(); vm.side = THREE.DoubleSide;
  b.part([vault, box(L + .06, .03, Wd + .06, 0, gy + H + .015, 0)], vm, V(0, .62, 0));
  // chandeliers (glow) + treaty table
  const ch = [];
  for (const x of [-.45, 0, .45]) {
    ch.push(new THREE.IcosahedronGeometry(.03, 0).translate(x, gy + .32, 0), cyl(.003, .003, .1, 3, x, gy + .39, 0));
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; ch.push(new THREE.IcosahedronGeometry(.016, 0).translate(x + Math.cos(a) * .06, gy + .3, Math.sin(a) * .06)); }
  }
  b.part(ch, M.glow, V(0, .14, 0));
  b.fixed([box(.26, .016, .1, 0, gy + .1, 0), box(.02, .09, .02, -.1, gy + .045, 0), box(.02, .09, .02, .1, gy + .045, 0)], M.wood);
  b.interior.set(0, gy + .25, 0);
  return b;
}

export const DIORAMA_BUILDERS = [antiquity, middleAges, discovery, industrial, twentieth];

/** sort assembly order bottom → top (floors and walls first, roofs last) */
function orderItems(b) {
  const box3 = new THREE.Box3();
  for (const it of b.items) { it.obj.geometry.computeBoundingBox(); box3.copy(it.obj.geometry.boundingBox); it.y = box3.min.y + it.base.y + (it.obj.parent !== b.group ? it.obj.parent.position.y : 0); it.cy = (box3.min.y + box3.max.y) / 2; }
  b.items.sort((a, c) => a.y - c.y);
  b.items.forEach((it, j) => { it.order = j / Math.max(1, b.items.length - 1); });
}

export function buildDiorama(i, materials, shadowTex) {
  const b = DIORAMA_BUILDERS[i](materials, shadowTex);
  orderItems(b);
  return b;
}
