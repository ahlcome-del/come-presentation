/**
 * Côme Presentation — props & landscape along the journey (all procedural, instanced).
 *
 * Small "museum maquette" objects grounded on the map-ground: trees, cypresses and
 * olive trees, figurines, houses and villages, carts, crates, barrels, boats, lamps,
 * banners, milestones, ruins, rocks, low hills, a river with a bridge — plus soft
 * billowing smoke from chimneys (a handful of sprites, never particle snow).
 *
 * Every repeated prop is ONE InstancedMesh per material part, so the whole landscape
 * costs a few dozen draw calls. Station props rise with their era (scale-in with a
 * short stagger); landscape props are always there and simply fade into the fog.
 */
import * as THREE from './vendor/three.js';
import { mergeGeometries } from './vendor/three.js';
import { bake } from './dioramas.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const cyl = (rt, rb, h, seg, x = 0, y = 0, z = 0) => new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y, z);
const cone = (r, h, seg, x = 0, y = 0, z = 0) => new THREE.ConeGeometry(r, h, seg).translate(x, y, z);
const ico = (r, d, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => new THREE.IcosahedronGeometry(r, d).scale(sx, sy, sz).translate(x, y, z);
function prism(w, h, d) {
  const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2);
}
const merged = (list) => { const g = mergeGeometries(list.map((x) => bake(x)), false); list.forEach((x) => x.dispose()); return g; };

/* seeded random */
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/* ---------------------------------------------------------------- prop kinds
   each kind: { parts: [[geometry, materialKey], …], foot: shadow radius, h: height } */
function kinds(mobile) {
  const seg = mobile ? 6 : 8;
  return {
    cypress: { foot: .09, parts: [[merged([cyl(.012, .016, .08, 5, 0, .04, 0)]), 'bark'], [merged([cone(.055, .32, seg, 0, .22, 0), cone(.04, .2, seg, 0, .38, 0)]), 'foliage']] },
    olive: { foot: .16, parts: [[merged([cyl(.014, .022, .14, 5, 0, .07, 0).rotateZ(.12), cyl(.01, .012, .08, 4, .03, .15, 0).rotateZ(-.5)]), 'bark'],
      [merged([ico(.08, 0, -.02, .19, 0, 1.3, .7, 1.1), ico(.06, 0, .07, .2, .03, 1.2, .7, 1), ico(.05, 0, .01, .24, -.05, 1.2, .7, 1.2)]), 'foliage']] },
    tree: { foot: .16, parts: [[merged([cyl(.014, .02, .16, 5, 0, .08, 0)]), 'bark'], [merged([ico(.1, 1, 0, .25, 0, 1, 1.15, 1), ico(.07, 0, .06, .2, .04)]), 'foliage']] },
    topiary: { foot: .07, parts: [[merged([cyl(.04, .045, .05, 8, 0, .025, 0)]), 'stone'], [merged([cone(.045, .2, seg, 0, .15, 0)]), 'foliage']] },
    figure: { foot: .035, parts: [[merged([cone(.022, .07, 6, 0, .035, 0), cyl(.008, .012, .02, 5, 0, .075, 0), ico(.012, 0, 0, .094, 0)]), 'sail']] },
    figureDark: { foot: .035, parts: [[merged([cyl(.012, .02, .07, 6, 0, .035, 0), cyl(.016, .014, .02, 5, 0, .07, 0), ico(.011, 0, 0, .092, 0)]), 'wood']] },
    house: { foot: .2, parts: [[merged([box(.2, .13, .15, 0, .065, 0), box(.03, .05, .03, .06, .17, .03)]), 'limestone'], [merged([prism(.23, .09, .17).translate(0, .13, 0)]), 'terracotta']] },
    brickHouse: { foot: .2, parts: [[merged([box(.16, .2, .14, 0, .1, 0), box(.025, .07, .025, -.05, .24, 0), box(.025, .07, .025, .05, .24, 0)]), 'brick'], [merged([prism(.18, .06, .16).translate(0, .2, 0)]), 'dark']] },
    crate: { foot: .05, parts: [[merged([box(.05, .05, .05, 0, .025, 0), box(.04, .04, .04, .045, .02, .02)]), 'wood']] },
    barrel: { foot: .04, parts: [[merged([cyl(.022, .02, .055, 8, 0, .0275, 0), cyl(.02, .018, .05, 8, .045, .025, -.01)]), 'wood']] },
    cart: { foot: .12, parts: [[merged([box(.16, .02, .09, 0, .05, 0), box(.16, .03, .006, 0, .075, .045), box(.16, .03, .006, 0, .075, -.045), cyl(.004, .004, .14, 4).rotateZ(Math.PI / 2).translate(.15, .045, 0),
      cyl(.035, .035, .008, 10).rotateX(Math.PI / 2).translate(0, .035, .052), cyl(.035, .035, .008, 10).rotateX(Math.PI / 2).translate(0, .035, -.052)]), 'wood'],
      [merged([box(.1, .04, .06, -.01, .08, 0)]), 'limestone']] },
    haystack: { foot: .08, parts: [[merged([cone(.07, .12, 8, 0, .06, 0), cyl(.07, .07, .03, 8, 0, .015, 0)]), 'limestone']] },
    boat: { foot: .12, parts: [[merged([boatHull(), cyl(.004, .004, .14, 4, 0, .1, 0)]), 'wood'], [merged([sailTri()]), 'sail']] },
    lamp: { foot: .04, parts: [[merged([cyl(.006, .009, .26, 5, 0, .13, 0), box(.028, .035, .028, 0, .275, 0), cyl(.016, .016, .02, 6, 0, .008, 0)]), 'iron'], [merged([box(.018, .022, .018, 0, .272, 0)]), 'glow']] },
    banner: { foot: .03, parts: [[merged([cyl(.004, .005, .34, 4, 0, .17, 0)]), 'wood'], [merged([flag()]), 'terracotta']] },
    milestone: { foot: .05, parts: [[merged([box(.035, .06, .03, 0, .03, 0), cyl(.0175, .0175, .03, 8).rotateX(Math.PI / 2).translate(0, .06, 0)]), 'limestone']] },
    ruin: { foot: .1, parts: [[merged([cyl(.035, .038, .16, 8, 0, .08, 0), cyl(.035, .038, .1, 8).rotateZ(Math.PI / 2).translate(.12, .035, .05), box(.1, .03, .1, -.08, .015, -.05)]), 'marble']] },
    amphora: { foot: .025, parts: [[merged([new THREE.LatheGeometry([V(0, 0), V(.008, .002), V(.02, .03), V(.017, .055), V(.007, .065), V(.009, .075), V(0, .076)].map((v) => new THREE.Vector2(v.x, v.y)), 7)]), 'terracotta']] },
    rock: { foot: .08, parts: [[merged([ico(.06, 0, 0, .02, 0, 1.2, .6, 1), ico(.035, 0, .06, .01, .03, 1, .7, 1)]), 'stone']] },
    bench: { foot: .06, parts: [[merged([box(.12, .01, .035, 0, .03, 0), box(.12, .03, .006, 0, .05, -.016), box(.01, .03, .03, -.05, .015, 0), box(.01, .03, .03, .05, .015, 0)]), 'wood']] },
    car: { foot: .1, parts: [[merged([box(.16, .04, .07, 0, .045, 0), box(.08, .04, .065, -.015, .085, 0)]), 'dark'],
      [merged([0, 1, 2, 3].map((k) => cyl(.018, .018, .012, 10).rotateX(Math.PI / 2).translate(k < 2 ? -.05 : .05, .02, k % 2 ? .038 : -.038))), 'iron']] },
    pole: { foot: .03, parts: [[merged([cyl(.004, .006, .32, 4, 0, .16, 0), box(.09, .006, .006, 0, .3, 0)]), 'wood']] },
    well: { foot: .06, parts: [[merged([cyl(.04, .045, .05, 10, 0, .025, 0)]), 'ashlar'], [merged([box(.006, .09, .006, -.035, .07, 0), box(.006, .09, .006, .035, .07, 0), prism(.1, .03, .05).translate(0, .11, 0)]), 'wood']] },
    hill: { foot: 0, parts: [[merged([ico(1, 2, 0, -.2, 0, 1, .42, 1)]), 'earth']] },
  };
}
function boatHull() {
  const s = new THREE.Shape(); s.moveTo(-.09, .04); s.quadraticCurveTo(-.07, 0, 0, 0); s.quadraticCurveTo(.08, 0, .1, .045); s.lineTo(-.09, .04);
  return new THREE.ExtrudeGeometry(s, { depth: .05, bevelEnabled: false, curveSegments: 4 }).translate(0, 0, -.025);
}
function sailTri() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, .05, 0, 0, .17, 0, .07, .06, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 0], 2));
  g.computeVertexNormals(); return g;
}
function flag() {
  const g = new THREE.PlaneGeometry(.08, .1, 3, 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) + .04) * 30) * .006);
  return g.translate(.04, .27, 0);
}

/* ---------------------------------------------------------------- placement */
const ERA_SETS = [
  // Antiquité: cypresses & olive groves, figures in robes, amphorae, ruins
  [['cypress', 8], ['olive', 7], ['figure', 7], ['amphora', 6], ['ruin', 3], ['rock', 3], ['well', 1]],
  // Moyen Âge: village, haystacks, cart, banners, trees
  [['tree', 7], ['house', 5], ['haystack', 4], ['cart', 1], ['figureDark', 6], ['banner', 3], ['rock', 3], ['well', 1]],
  // Grandes découvertes: harbour — boats, crates, barrels, lamps
  [['boat', 5], ['crate', 7], ['barrel', 7], ['figure', 6], ['lamp', 2], ['rock', 3], ['cypress', 2]],
  // XIXe industriel: gas lamps, terraces, telegraph poles, crates
  [['lamp', 5], ['brickHouse', 4], ['crate', 5], ['barrel', 4], ['figureDark', 7], ['pole', 3], ['cart', 1], ['tree', 2]],
  // XXe: boulevard — lamps, clipped trees, benches, motorcars, flags
  [['lamp', 6], ['topiary', 9], ['figureDark', 7], ['car', 2], ['bench', 3], ['banner', 3]],
];

export class Props {
  constructor({ M, stations, groundY, shadowTex, smokeTex, route, mobile = false, seed = 7 }) {
    this.group = new THREE.Group(); this.group.name = 'props';
    this.G = groundY; this.stations = stations; this.mobile = mobile;
    const K = kinds(mobile);
    const earth = M.stone.clone(); earth.color = new THREE.Color(0x9a8b76); earth.flatShading = false;
    const mats = { ...M, earth };
    const r = rng(seed), place = [];
    const dens = mobile ? .6 : 1;
    const G = groundY;
    const add = (kind, x, z, st = -1, s = 1, rot = r() * Math.PI * 2, tint = .85 + r() * .25) => place.push({ kind, x, z, st, s, rot, tint, y: 0 });

    /* station props: irregular ring around each era, outside its map sheet, not in front of the lens */
    stations.forEach((S, i) => {
      for (const [kind, n0] of ERA_SETS[i]) {
        const n = Math.max(1, Math.round(n0 * dens));
        for (let k = 0; k < n; k++) {
          for (let tries = 0; tries < 30; tries++) {
            const a = r() * Math.PI * 2, rad = 1.25 + Math.pow(r(), .8) * 1.8;
            const x = S.x + Math.cos(a) * rad, z = S.z + Math.sin(a) * rad * .85;
            if (Math.abs(x - S.x) < 1.4 && Math.abs(z - S.z) < 1.0) continue;                 // keep the map sheet clear
            const big = /tree|olive|cypress|house|brickHouse|banner|lamp|pole|topiary/.test(kind);
            if (big && z > S.z + .9 && Math.abs(x - S.x * .15) < 1.5) continue;              // nothing tall between lens and era
            if (Math.abs(x) < .45 && z > S.z) continue;                                       // the road itself
            // figures gather in small groups
            const fig = /figure/.test(kind);
            add(kind, x, z, i, (fig ? 1.35 : 1.1) * (.9 + r() * .3));
            if (fig && r() < .6) add(kind, x + (r() - .5) * .14, z + (r() - .5) * .14, i, 1.3 * (.9 + r() * .2));
            break;
          }
        }
      }
    });

    /* landscape between the eras (always present, fades into the fog) */
    const zStart = -7, zEnd = stations[stations.length - 1].z - 9;
    const sideX = () => (r() < .5 ? -1 : 1) * (.9 + Math.pow(r(), 1.2) * 5.5);
    const nearStation = (x, z) => stations.some((S) => Math.hypot(x - S.x, (z - S.z) / .85) < 3.2);
    // trees & cypresses in loose clumps
    for (let k = 0; k < 150 * dens; k++) {
      const z = zStart - r() * (zStart - zEnd), x = sideX();
      if (nearStation(x, z)) continue;
      const era = Math.max(0, Math.min(4, Math.round((-z - 15) / 7)));
      const kind = era === 0 ? (r() < .55 ? 'cypress' : 'olive') : era === 4 ? (r() < .5 ? 'topiary' : 'tree') : (r() < .25 ? 'cypress' : 'tree');
      add(kind, x, z, -1, .8 + r() * .6);
      if (r() < .5) add(kind, x + (r() - .5) * .5, z + (r() - .5) * .5, -1, .7 + r() * .5);
    }
    // rocks & small ruins
    for (let k = 0; k < 45 * dens; k++) { const z = zStart - r() * (zStart - zEnd), x = sideX(); if (!nearStation(x, z)) add(r() < .8 ? 'rock' : 'ruin', x, z, -1, .8 + r() * .8); }
    // villages: a few houses around a well, between consecutive eras
    for (let i = 0; i < stations.length - 1; i++) {
      const zc = (stations[i].z + stations[i + 1].z) / 2, xc = -Math.sign(stations[i].x) * (3.4 + r() * 1.2);
      const kind = i >= 2 ? 'brickHouse' : 'house';
      const n = Math.round((4 + r() * 3) * dens);
      for (let k = 0; k < n; k++) add(kind, xc + (r() - .5) * 1.6, zc + (r() - .5) * 1.4, -1, .9 + r() * .4, (r() - .5) * .6 + (r() < .5 ? 0 : Math.PI / 2));
      add('well', xc, zc, -1, 1);
      for (let k = 0; k < 3; k++) add(i >= 2 ? 'figureDark' : 'figure', xc + (r() - .5) * 1.2, zc + (r() - .5) * 1.2, -1, 1);
      this.villages = this.villages || []; this.villages.push(V(xc, G, zc));
    }
    // milestones along the road
    if (route) for (let u = .04; u < .98; u += .016) {
      const p = route.getPointAt(u), tg = route.getTangentAt(u), side = (Math.round(u / .016) % 2) ? 1 : -1;
      const x = p.x + -tg.z * .16 * side, z = p.z + tg.x * .16 * side;
      if (z > -4 || nearStation(x, z) && Math.hypot(x - p.x, z - p.z) > 1) continue;
      if (stations.some((S) => Math.abs(x - S.x) < 1.45 && Math.abs(z - S.z) < 1.05)) continue;
      if (Math.round(u / .016) % 3 === 0) add('milestone', x, z, -1, 1, Math.atan2(tg.x, tg.z));
    }
    // low hills on the horizon (relief)
    for (let k = 0; k < 16; k++) {
      const z = -10 - r() * 50, x = (r() < .5 ? -1 : 1) * (6.5 + r() * 6);
      add('hill', x, z, -1, 1.6 + r() * 2.2, r() * 3, .9 + r() * .15);
    }
    this.place = place;

    /* build the instanced meshes */
    const byKind = {};
    for (const p of place) (byKind[p.kind] = byKind[p.kind] || []).push(p);
    this.meshes = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), col = new THREE.Color(), up = V(0, 1, 0);
    for (const kind in byKind) {
      const list = byKind[kind], spec = K[kind];
      for (const [geo, mk] of spec.parts) {
        const im = new THREE.InstancedMesh(geo, mats[mk], list.length);
        list.forEach((p, j) => {
          q.setFromAxisAngle(up, p.rot);
          const s = kind === 'hill' ? p.s : p.s;
          sc.set(kind === 'hill' ? s * 1.4 : s, s, s);
          m4.compose(pos.set(p.x, G, p.z), q, sc);
          im.setMatrixAt(j, m4);
          col.setScalar(p.tint); im.setColorAt(j, col);
        });
        im.instanceMatrix.needsUpdate = true;
        im.userData.list = list; im.userData.kind = kind;
        this.group.add(im); this.meshes.push(im);
      }
    }

    /* contact shadows: one instanced soft disc for all props */
    const shadowed = place.filter((p) => K[p.kind].foot > 0);
    const shGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.shadows = new THREE.InstancedMesh(shGeo, new THREE.MeshBasicMaterial({ map: shadowTex, color: 0x000000, transparent: true, opacity: .55, depthWrite: false }), shadowed.length);
    this.shadows.renderOrder = 2;
    shadowed.forEach((p, j) => { const f = K[p.kind].foot * p.s * 2.6; m4.compose(pos.set(p.x, G + .006, p.z), q.identity(), sc.set(f, 1, f)); this.shadows.setMatrixAt(j, m4); });
    this.shadows.userData.list = shadowed; this.shadows.userData.foot = true; this.K = K;
    this.group.add(this.shadows);

    /* river with a small stone bridge where it crosses the road (between eras II and III) */
    const zr = (stations[1].z + stations[2].z) / 2 + .6;
    const rp = []; for (let k = 0; k <= 12; k++) { const x = -14 + k * 28 / 12; rp.push(V(x, G + .005, zr + Math.sin(k * .9) * 1.1 + (k > 6 ? .4 : 0))); }
    const river = new THREE.CatmullRomCurve3(rp);
    this.group.add(ribbon(river, .2, M.water, G + .005));
    const bz = river.getPointAt(.5).z;
    const bridge = new THREE.Mesh(merged([box(.46, .03, .5, 0, .06, 0), box(.46, .05, .02, 0, .1, .24), box(.46, .05, .02, 0, .1, -.24), box(.06, .06, .5, -.2, .03, 0), box(.06, .06, .5, .2, .03, 0)]), M.ashlar);
    bridge.position.set(0, G, bz); bridge.rotation.y = Math.PI / 2; this.group.add(bridge);

    /* smoke: soft billowing puffs from chimneys (a few sprites each) */
    this.smokeTex = smokeTex; this.smokes = [];
  }

  /** add a smoke column; anchor() returns the world position of the chimney top */
  addSmoke(anchor, { n = 7, rise = 1.1, size = .5, opacity = .32, drift = .35, visible = () => 1 } = {}) {
    const sprites = [];
    for (let i = 0; i < n; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTex, color: 0xb8ad9c, transparent: true, depthWrite: false, opacity: 0, fog: true }));
      sp.renderOrder = 3; this.group.add(sp); sprites.push(sp);
    }
    this.smokes.push({ anchor, sprites, n, rise, size, opacity, drift, visible });
  }

  /** p-driven: station props rise with their era; smoke billows (t) */
  update(p, t, stationAssemble) {
    // station props: staggered scale-in following the era assembly value
    if (!this._last) this._last = [];
    const changed = stationAssemble.some((a, i) => Math.abs(a - (this._last[i] ?? -1)) > 1e-4);
    if (changed) {
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), up = V(0, 1, 0);
      for (const im of [...this.meshes, this.shadows]) {
        const list = im.userData.list; let dirty = false;
        list.forEach((pl, j) => {
          if (pl.st < 0) return;
          const a = stationAssemble[pl.st];
          if (Math.abs(a - (this._last[pl.st] ?? -1)) < 1e-4) return;
          const S = this.stations[pl.st];
          const delay = Math.min(.5, Math.hypot(pl.x - S.x, pl.z - S.z) / 3.5 * .5);
          let k = Math.min(1, Math.max(0, (a - delay) / .45)); k = 1 - Math.pow(1 - k, 3);
          if (im.userData.foot) {
            const f = this.K[pl.kind].foot * pl.s * 2.6 * k;
            m4.compose(pos.set(pl.x, this.G + .006, pl.z), q.identity(), sc.set(Math.max(f, 1e-4), 1, Math.max(f, 1e-4)));
          } else {
            q.setFromAxisAngle(up, pl.rot);
            const s = Math.max(1e-4, pl.s * k);
            m4.compose(pos.set(pl.x, this.G - (1 - k) * .05, pl.z), q, sc.set(s, s, s));
          }
          im.setMatrixAt(j, m4); dirty = true;
        });
        if (dirty) im.instanceMatrix.needsUpdate = true;
      }
      this._last = stationAssemble.slice();
    }
    // smoke
    const tt = t, wp = this._wp || (this._wp = new THREE.Vector3());
    for (const s of this.smokes) {
      const vis = s.visible();
      if (vis <= 0.001) { s.sprites.forEach((sp) => (sp.visible = false)); continue; }
      s.anchor(wp);
      s.sprites.forEach((sp, i) => {
        const ph = (tt * .07 + i / s.n) % 1;
        sp.visible = true;
        sp.position.set(wp.x + ph * s.drift + Math.sin(ph * 5 + i) * .04, wp.y + ph * s.rise, wp.z - ph * s.drift * .4);
        const sz = s.size * (.18 + ph * .95);
        sp.scale.set(sz, sz * .85, 1);
        sp.material.rotation = i * 1.7 + ph * .6;
        sp.material.opacity = s.opacity * vis * Math.min(1, ph / .1) * Math.pow(1 - ph, 1.3);
      });
    }
  }
}

/** a flat ribbon mesh along a curve (river) */
function ribbon(curve, w, mat, y) {
  const n = 120, pos = [], uv = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, p = curve.getPointAt(u), tg = curve.getTangentAt(u);
    const nx = -tg.z, nz = tg.x, l = Math.hypot(nx, nz) || 1, ww = w * (.85 + .3 * Math.sin(u * 17));
    pos.push(p.x + nx / l * ww, y, p.z + nz / l * ww, p.x - nx / l * ww, y, p.z - nz / l * ww);
    uv.push(u * 30, 0, u * 30, 1);
    if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Array((n + 1) * 2 * 3).fill(.8), 3));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.renderOrder = 1;
  return m;
}
