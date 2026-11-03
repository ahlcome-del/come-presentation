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
import { terrainH, riverZ } from './terrain.js';

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


/* ---------------------------------------------------------------- figures
   proportioned little people (≈ .1 tall): legs, torso, arms, head, period costume, pose.
   three parts per figure → skin / cloth (tinted per instance) / dark (hair, hats, shoes). */
function limb(len, r0, r1, ax = 0, az = 0, x = 0, y = 0, z = 0, seg = 5) {
  return new THREE.CylinderGeometry(r1, r0, len, seg).translate(0, -len / 2, 0).rotateX(ax).rotateZ(az).translate(x, y, z);
}
function figureKind(costume, pose) {
  const skin = [], cloth = [], dark = [];
  const walk = pose === 'walk' ? .38 : 0, hip = .046, sh = .078;
  // legs (hidden under long robes)
  const longRobe = costume === 'toga' || costume === 'gown';
  if (!longRobe) {
    const legMat = costume === 'peasant' || costume === 'sailor' ? cloth : dark;
    legMat.push(limb(.044, .0055, .0045, walk, 0, -.0065, hip, 0), limb(.044, .0055, .0045, -walk, 0, .0065, hip, 0));
    dark.push(box(.011, .006, .016, -.0065 + 0, .003, .003 + Math.sin(walk) * .02), box(.011, .006, .016, .0065, .003, .003 - Math.sin(walk) * .02));
  }
  // torso & costume
  if (costume === 'toga') {
    cloth.push(cyl(.012, .021, .08, 7, 0, .04, 0), box(.03, .05, .006, 0, .058, .008).rotateZ(.5).translate(.004, 0, 0));
  } else if (costume === 'gown') {
    cloth.push(cyl(.01, .024, .07, 8, 0, .035, 0), cyl(.012, .01, .02, 7, 0, .075, 0));
  } else if (costume === 'peasant') {
    cloth.push(cyl(.012, .019, .045, 7, 0, .062, 0));
    dark.push(cyl(.0145, .0145, .004, 7, 0, .052, 0));                           // belt
  } else if (costume === 'sailor') {
    cloth.push(cyl(.012, .015, .035, 7, 0, .064, 0), cyl(.0125, .011, .012, 7, 0, .045, 0));
  } else if (costume === 'frock') {
    dark.push(cyl(.012, .017, .06, 7, 0, .055, 0));                              // long coat
    cloth.push(box(.012, .02, .004, 0, .072, .011));                              // waistcoat / shirt front
  } else {                                                                        // 20th c. overcoat
    cloth.push(cyl(.0125, .016, .052, 7, 0, .06, 0));
  }
  // arms
  const armMat = costume === 'toga' ? skin : costume === 'frock' ? dark : cloth;
  if (pose === 'point') { armMat.push(limb(.034, .004, .0035, -1.25, -.15, .015, sh, 0)); skin.push(ico(.004, 0, .021, sh + .005, .032)); }
  else armMat.push(limb(.034, .004, .0035, -walk * .8, .12, .015, sh, 0));
  if (pose === 'carry') { armMat.push(limb(.03, .004, .0035, 0, -2.6, -.015, sh, 0)); cloth.push(box(.026, .02, .02, -.016, sh + .036, 0)); }
  else armMat.push(limb(.034, .004, .0035, walk * .8, -.12, -.015, sh, 0));
  // head & neck
  skin.push(cyl(.004, .004, .008, 5, 0, .084, 0), ico(.0095, 1, 0, .095, .001, 1, 1.12, 1));
  // headwear
  if (costume === 'peasant') dark.push(cone(.012, .02, 6, 0, .104, -.002));           // hood
  else if (costume === 'sailor') dark.push(cyl(.018, .018, .002, 9, 0, .102, 0), cyl(.008, .01, .008, 7, 0, .106, 0));
  else if (costume === 'frock') dark.push(cyl(.015, .015, .002, 9, 0, .103, 0), cyl(.008, .0085, .018, 7, 0, .112, 0));
  else if (costume === 'coat') dark.push(cyl(.014, .014, .002, 9, 0, .102, 0), cyl(.0085, .0095, .008, 7, 0, .106, 0));
  else if (costume === 'gown') dark.push(cyl(.013, .011, .006, 8, 0, .1, -.002));
  else dark.push(ico(.0098, 0, 0, .098, -.003, 1, .8, 1));                           // hair
  const out = [];
  if (skin.length) out.push([merged(skin), 'skin']);
  if (cloth.length) out.push([merged(cloth), 'cloth', 'cloth']);
  if (dark.length) out.push([merged(dark), 'dark']);
  return { foot: .03, parts: out };
}

/* ---------------------------------------------------------------- trees
   canopies of several displaced icosahedra: lumpy, irregular, never a perfect ball */
function lumpy(r, detail, x, y, z, sx, sy, sz, seed, amt = .22) {
  const g = new THREE.IcosahedronGeometry(r, detail), p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 61 + seed) * Math.sin(v.y * 47 - seed * 1.7) * Math.sin(v.z * 53 + seed * .7) + .5 * Math.sin((v.x + v.z) * 97 + seed);
    v.multiplyScalar(1 + amt * n);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  return g.scale(sx, sy, sz).translate(x, y, z);
}
function treeKind(seed, mobile) {
  const r = rng(seed * 977 + 13), d = mobile ? 0 : 1;
  const trunkH = .12 + r() * .06, lean = (r() - .5) * .12;
  const bark = [cyl(.011, .019, trunkH + .04, 5, 0, (trunkH + .04) / 2, 0).rotateZ(lean)];
  bark.push(cyl(.005, .009, .08, 4).rotateZ(.7 + r() * .4).translate(.03, trunkH, 0), cyl(.005, .009, .07, 4).rotateZ(-.7 - r() * .4).translate(-.03, trunkH + .01, .01));
  const hi = [], lo = [];
  const n = 4 + Math.floor(r() * 3);
  for (let k = 0; k < n; k++) {
    const a = r() * Math.PI * 2, rr = .03 + r() * .05, y = trunkH + .05 + r() * .12;
    const g = lumpy(.055 + r() * .04, d, Math.cos(a) * rr + lean * .3, y, Math.sin(a) * rr, 1, .82 + r() * .3, 1, seed + k);
    (y > trunkH + .1 ? hi : lo).push(g);
  }
  hi.push(lumpy(.07, d, lean * .4, trunkH + .17, 0, 1, .9, 1, seed + 9));
  return { foot: .15, parts: [[merged(bark), 'bark'], [merged(lo), 'foliageDark', 'leaf'], [merged(hi), 'foliage', 'leaf']] };
}
function poplarKind(seed, mobile) {
  const r = rng(seed * 31 + 7), d = mobile ? 0 : 1;
  return { foot: .07, parts: [[merged([cyl(.008, .012, .1, 5, 0, .05, 0)]), 'bark'],
    [merged([lumpy(.05, d, 0, .25, 0, .85, 3.2, .85, seed, .14), lumpy(.035, d, .012, .18, .01, 1, 2, 1, seed + 3, .2)]), 'foliage', 'leaf']] };
}
function pineKind(seed, mobile) {
  const seg = mobile ? 6 : 7, r = rng(seed * 17 + 3);
  const tiers = [];
  for (let k = 0; k < 4; k++) tiers.push(cone(.085 - k * .017, .1, seg, (r() - .5) * .006, .09 + k * .055, (r() - .5) * .006).rotateY(r() * 2));
  return { foot: .1, parts: [[merged([cyl(.008, .012, .12, 5, 0, .06, 0)]), 'bark'], [merged(tiers), 'foliageDark', 'leaf']] };
}

/* ---------------------------------------------------------------- houses
   body, roof with overhang, chimney, door, windows (some lit) */
function houseKind({ w = .2, h = .13, d = .15, roofH = .1, wall = 'limestone', roof = 'terracotta', timber = false, lit = false, storeys = 1 }) {
  const body = [box(w, h, d, 0, h / 2, 0)];
  const roofG = [prism(w + .045, roofH, d + .05).translate(0, h, 0), box(w + .05, .008, d + .055, 0, h + .002, 0)];
  const darkG = [box(.034, .062, .006, -w * .22, .031, d / 2 + .002)];                     // door
  const win = [];
  for (let s = 0; s < storeys; s++) {
    const wy = storeys === 1 ? h * .58 : h * (.32 + s * .4);
    win.push(box(.028, .032, .006, w * .2, wy, d / 2 + .002), box(.028, .032, .006, -w * .2 + (s ? 0 : 1) * 0, wy + (s ? 0 : 1) * 0, -d / 2 - .002));
    if (s) win.push(box(.028, .032, .006, -w * .22, wy, d / 2 + .002));
    win.push(box(.006, .03, .026, w / 2 + .002, wy, 0), box(.006, .03, .026, -w / 2 - .002, wy, 0));
  }
  body.push(box(.03, .1, .03, w * .28, h + roofH * .55, -d * .15));                     // chimney
  roofG.push(box(.038, .012, .038, w * .28, h + roofH * .55 + .055, -d * .15));
  if (timber) for (const x of [-w / 2 + .006, 0, w / 2 - .006]) darkG.push(box(.008, h, .004, x, h / 2, d / 2 + .001));
  if (timber) darkG.push(box(w, .008, .004, 0, h * .55, d / 2 + .001));
  const parts = [[merged(body), wall], [merged(roofG), roof], [merged(darkG), 'dark']];
  parts.push([merged(win), lit ? 'glow' : 'dark']);
  return { foot: Math.max(w, d) * 1.05, parts };
}

/* ---------------------------------------------------------------- prop kinds
   each kind: { parts: [[geometry, materialKey], …], foot: shadow radius, h: height } */
function kinds(mobile) {
  const seg = mobile ? 6 : 8;
  return {
    cypress: { foot: .09, parts: [[merged([cyl(.012, .016, .08, 5, 0, .04, 0)]), 'bark'], [merged([cone(.055, .32, seg, 0, .22, 0), cone(.04, .2, seg, 0, .38, 0)]), 'foliage']] },
    olive: { foot: .16, parts: [[merged([cyl(.014, .022, .14, 5, 0, .07, 0).rotateZ(.12), cyl(.01, .012, .08, 4, .03, .15, 0).rotateZ(-.5)]), 'bark'],
      [merged([ico(.08, 0, -.02, .19, 0, 1.3, .7, 1.1), ico(.06, 0, .07, .2, .03, 1.2, .7, 1), ico(.05, 0, .01, .24, -.05, 1.2, .7, 1.2)]), 'foliage']] },
    tree: treeKind(1, mobile), tree2: treeKind(2, mobile), tree3: treeKind(3, mobile),
    poplar: poplarKind(4, mobile), pine: pineKind(5, mobile),
    topiary: { foot: .07, parts: [[merged([cyl(.04, .045, .05, 8, 0, .025, 0)]), 'stone'], [merged([cone(.045, .2, seg, 0, .15, 0)]), 'foliage']] },
    ...Object.fromEntries(FIG_ERAS.flatMap((c, e) => POSES.map((pose, k) => [`fig${e}${k}`, figureKind(c[k % c.length], pose)]))),
    house: houseKind({}), houseTimber: houseKind({ w: .18, h: .15, d: .15, roofH: .12, roof: 'dark', timber: true, lit: true }),
    brickHouse: houseKind({ w: .17, h: .22, d: .15, roofH: .07, wall: 'brick', roof: 'dark', lit: true, storeys: 2 }),
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
const POSES = ['stand', 'walk', 'point', 'carry'];
const FIG_ERAS = [['toga', 'toga', 'gown', 'toga'], ['peasant', 'peasant', 'gown', 'peasant'], ['sailor', 'sailor', 'peasant', 'sailor'], ['frock', 'frock', 'gown', 'peasant'], ['coat', 'coat', 'gown', 'coat']];
const CLOTH = [
  [0xe6dcc6, 0xd9cdb2, 0xb8613f, 0xcfc3a6, 0x8e6a4e],        // undyed wool & linen, a madder-red cloak
  [0x8a5a3c, 0x6f6a4a, 0x9c4a36, 0x5c5446, 0xa88a5a],        // russet, sage, madder, earth
  [0x3f4c5c, 0xd8ccb2, 0x7a3d2e, 0x5b6470, 0xa58c62],        // indigo, canvas, red
  [0x4a3f36, 0x6a5a48, 0x7e6a54, 0x3a3a3e, 0x8e3f33],        // greys & browns
  [0x5e5850, 0x7a6e5c, 0x42464c, 0x8a7a62, 0x6b3b33],        // overcoats
];
const LEAF = [0xffffff, 0xeef2d6, 0xfff2cc, 0xdfe8c4, 0xf6e2b2];
const F = (e) => POSES.map((_, k) => [`fig${e}${k}`, 2]);
const ERA_SETS = [
  // Antiquité: cypresses & olive groves, figures in togas, amphorae, ruins
  [['cypress', 8], ['olive', 7], ...F(0), ['amphora', 6], ['ruin', 3], ['rock', 3], ['well', 1]],
  // Moyen Âge: village, haystacks, cart, banners, trees
  [['tree', 3], ['tree2', 3], ['poplar', 2], ['house', 3], ['houseTimber', 3], ['haystack', 4], ['cart', 1], ...F(1), ['banner', 3], ['rock', 3], ['well', 1]],
  // Grandes découvertes: harbour — boats, crates, barrels, lamps
  [['boat', 5], ['crate', 7], ['barrel', 7], ...F(2), ['lamp', 2], ['rock', 3], ['cypress', 2], ['pine', 2]],
  // XIXe industriel: gas lamps, terraces, telegraph poles, crates
  [['lamp', 5], ['brickHouse', 4], ['crate', 5], ['barrel', 4], ...F(3), ['pole', 3], ['cart', 1], ['tree3', 2]],
  // XXe: boulevard — lamps, clipped trees, benches, motorcars, flags
  [['lamp', 6], ['topiary', 9], ...F(4), ['car', 2], ['bench', 3], ['banner', 3], ['poplar', 3]],
];

export class Props {
  constructor({ M, stations, groundY, shadowTex, smokeTex, route, mobile = false, seed = 7 }) {
    this.group = new THREE.Group(); this.group.name = 'props';
    this.G = groundY; this.stations = stations; this.mobile = mobile;
    const K = kinds(mobile);
    const tinted = (m, c) => { const x = m.clone(); x.color = new THREE.Color(c); return x; };
    const mats = { ...M, skin: tinted(M.sail, 0xd2a888), cloth: M.sail, foliageDark: tinted(M.foliage, 0xcfd0bf) };
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
            const big = /tree|olive|cypress|poplar|pine|house|House|banner|lamp|pole|topiary/.test(kind);
            if (big && z > S.z + .55) continue;                                   // nothing tall between lens and era
            if (Math.abs(x) < .45 && z > S.z) continue;                                       // the road itself
            // figures gather in small groups
            const fig = /^fig/.test(kind);
            add(kind, x, z, i, (fig ? 1.15 : 1.1) * (.9 + r() * .2));
            if (fig && r() < .6) add(`fig${i}${Math.floor(r() * 4)}`, x + (r() - .5) * .14, z + (r() - .5) * .14, i, 1.1 * (.9 + r() * .2));
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
      const q = r(), tr = ['tree', 'tree2', 'tree3'][Math.floor(r() * 3)];
      const kind = era === 0 ? (q < .5 ? 'cypress' : q < .85 ? 'olive' : 'pine') : era === 4 ? (q < .35 ? 'poplar' : tr) : era === 2 ? (q < .35 ? 'pine' : q < .5 ? 'cypress' : tr) : (q < .15 ? 'cypress' : q < .3 ? 'poplar' : tr);
      add(kind, x, z, -1, .8 + r() * .6);
      if (r() < .5) add(kind, x + (r() - .5) * .5, z + (r() - .5) * .5, -1, .7 + r() * .5);
    }
    // rocks & small ruins
    for (let k = 0; k < 45 * dens; k++) { const z = zStart - r() * (zStart - zEnd), x = sideX(); if (!nearStation(x, z)) add(r() < .8 ? 'rock' : 'ruin', x, z, -1, .8 + r() * .8); }
    // villages: a few houses around a well, between consecutive eras
    for (let i = 0; i < stations.length - 1; i++) {
      const zc = (stations[i].z + stations[i + 1].z) / 2, xc = -Math.sign(stations[i].x) * (3.4 + r() * 1.2);
      const kind = () => (i >= 2 ? (r() < .6 ? 'brickHouse' : 'houseTimber') : (r() < .5 ? 'house' : 'houseTimber'));
      const n = Math.round((4 + r() * 3) * dens);
      for (let k = 0; k < n; k++) add(kind(), xc + (r() - .5) * 1.6, zc + (r() - .5) * 1.4, -1, .9 + r() * .4, (r() - .5) * .6 + (r() < .5 ? 0 : Math.PI / 2));
      add('well', xc, zc, -1, 1);
      for (let k = 0; k < 4; k++) add(`fig${Math.min(4, i + (k & 1))}${Math.floor(r() * 4)}`, xc + (r() - .5) * 1.2, zc + (r() - .5) * 1.2, -1, 1.05);
      this.villages = this.villages || []; this.villages.push(V(xc, G + terrainH(xc, zc), zc));
    }
    // milestones along the road
    if (route) for (let u = .04; u < .98; u += .016) {
      const p = route.getPointAt(u), tg = route.getTangentAt(u), side = (Math.round(u / .016) % 2) ? 1 : -1;
      const x = p.x + -tg.z * .16 * side, z = p.z + tg.x * .16 * side;
      if (z > -4 || nearStation(x, z) && Math.hypot(x - p.x, z - p.z) > 1) continue;
      if (stations.some((S) => Math.abs(x - S.x) < 1.45 && Math.abs(z - S.z) < 1.05)) continue;
      if (Math.round(u / .016) % 3 === 0) add('milestone', x, z, -1, 1, Math.atan2(tg.x, tg.z));
    }
    for (const p of place) p.y = terrainH(p.x, p.z);
    this.place = place;

    /* build the instanced meshes */
    const byKind = {};
    for (const p of place) (byKind[p.kind] = byKind[p.kind] || []).push(p);
    this.meshes = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), col = new THREE.Color(), up = V(0, 1, 0);
    for (const kind in byKind) {
      const list = byKind[kind], spec = K[kind];
      const era = +(kind.match(/^fig(\d)/) || [0, 0])[1];
      for (const [geo, mk, palKey] of spec.parts) {
        const pal = palKey === 'cloth' ? CLOTH[era] : palKey === 'leaf' ? LEAF : null;
        const im = new THREE.InstancedMesh(geo, mats[mk], list.length);
        list.forEach((p, j) => {
          q.setFromAxisAngle(up, p.rot);
          const s = p.s; sc.set(s, s, s);
          m4.compose(pos.set(p.x, G + p.y, p.z), q, sc);
          im.setMatrixAt(j, m4);
          if (pal) col.setHex(pal[Math.floor(Math.abs(Math.sin(p.x * 12.9898 + p.z * 78.233) * 43758.5453) % pal.length)]).multiplyScalar(.75 + p.tint * .3);
          else col.setScalar(p.tint);
          im.setColorAt(j, col);
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
    shadowed.forEach((p, j) => { const f = K[p.kind].foot * p.s * 2.6; m4.compose(pos.set(p.x, G + p.y + .006, p.z), q.identity(), sc.set(f, 1, f)); this.shadows.setMatrixAt(j, m4); });
    this.shadows.userData.list = shadowed; this.shadows.userData.foot = true; this.K = K;
    this.group.add(this.shadows);

    /* river with a small stone bridge where it crosses the road (between eras II and III) */
    const rp = []; for (let k = 0; k <= 40; k++) { const x = -20 + k; rp.push(V(x, 0, riverZ(x))); }
    const river = new THREE.CatmullRomCurve3(rp);
    const wm = M.water.clone(); wm.color = new THREE.Color(0x8c9894); wm.roughness = .72; wm.envMapIntensity = .25;
    const rv = ribbon(river, .16, wm, G - .012); this.group.add(rv);
    const bz = riverZ(0);
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
            m4.compose(pos.set(pl.x, this.G + pl.y + .006, pl.z), q.identity(), sc.set(Math.max(f, 1e-4), 1, Math.max(f, 1e-4)));
          } else {
            q.setFromAxisAngle(up, pl.rot);
            const s = Math.max(1e-4, pl.s * k);
            m4.compose(pos.set(pl.x, this.G + pl.y - (1 - k) * .05, pl.z), q, sc.set(s, s, s));
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
    if (i < n) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Array((n + 1) * 2 * 3).fill(.8), 3));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.renderOrder = 1;
  return m;
}
