/**
 * Côme Presentation — the library at the end of the road.
 *
 * The journey ends where it began: among books. A warm panelled room of walnut shelves
 * (one InstancedMesh for every book), a reading desk with a green banker's lamp, wall
 * sconces with soft halos, a tall night window, a rug, a globe and a rolling ladder.
 * Lamp light is baked into the books' instance colours (no extra real-time lights).
 */
import * as THREE from './vendor/three.js';
import { mergeGeometries } from './vendor/three.js';
import { bake } from './dioramas.js';
import * as TX from './textures.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const cyl = (rt, rb, h, seg, x = 0, y = 0, z = 0) => new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y, z);
const merged = (list) => { const g = mergeGeometries(list.map((x) => bake(x)), false); list.forEach((x) => x.dispose()); return g; };
/** world-scale UVs projected along each face's dominant axis (s = repeats per metre) */
function boxUV(g, s) {
  const P = g.attributes.position, N = g.attributes.normal, uv = new Float32Array(P.count * 2);
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i), nx = Math.abs(N.getX(i)), ny = Math.abs(N.getY(i)), nz = Math.abs(N.getZ(i));
    const [u, v] = ny > nx && ny > nz ? [x, z] : nx > nz ? [z, y] : [x, y];
    uv[i * 2] = u * s; uv[i * 2 + 1] = v * s;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

const LEATHER = [0x7a2e22, 0x5c2a1e, 0x2f4a38, 0x24364a, 0x8a6a3e, 0x3a2a22, 0x6e4a2a, 0x4a1e1e, 0x5a5a3a, 0xa88a5a, 0x2a2420, 0x7e5a3a];

export function buildLibrary({ M, radialTex, mobile, origin }) {
  const group = new THREE.Group(); group.name = 'library'; group.position.copy(origin); group.position.y += .27;   // the room stands on a stone podium
  const r = rng(2024);
  const H = 4.4, BAY = 1.0, SH = 10, D = .34, BACKZ = -3.2, SIDEX = 4.1, FRONTZ = 2.2;
  const shelfY = (k) => .22 + k * .41;
  const tex = (cv, rep = 1) => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 4; return t; };
  const walnut = M.wood.clone(); walnut.color = new THREE.Color(0xb07f58);
  const panel = M.wood.clone(); panel.color = new THREE.Color(0x7a5236);

  // lamps (positions in room space) – used for the halos and the baked light on the books
  const lamps = [];
  const wood = [], panels = [], brass = [];

  /* shelving bays: a list of frames { x, z, rotY } */
  const bays = [];
  for (let i = 0; i < 8; i++) { const x = -SIDEX + BAY / 2 + i * BAY; if (Math.abs(x) > .6) bays.push({ x, z: BACKZ, ry: 0 }); }
  const sideN = mobile ? 3 : 5;
  for (let i = 0; i < sideN; i++) { const z = BACKZ + BAY / 2 + .1 + i * BAY; bays.push({ x: -SIDEX, z, ry: Math.PI / 2 }, { x: SIDEX, z, ry: -Math.PI / 2 }); }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3(), up = V(0, 1, 0);
  const books = [];
  for (const b of bays) {
    const tr = (g) => g.rotateY(b.ry).translate(b.x, 0, b.z);
    wood.push(tr(box(.06, H, D + .04, -BAY / 2, H / 2, 0)), tr(box(.06, H, D + .04, BAY / 2, H / 2, 0)));
    for (let k = 0; k <= SH; k++) wood.push(tr(box(BAY, .035, D, 0, shelfY(k) - .02, 0)));
    wood.push(tr(box(BAY + .08, .12, D + .1, 0, H + .02, .02)), tr(box(BAY + .04, .2, D + .06, 0, .1, .01)));    // cornice, plinth
    panels.push(tr(box(BAY, H, .03, 0, H / 2, -D / 2)));
    // books on every shelf
    for (let k = 0; k < SH; k++) {
      let x = -BAY / 2 + .05;
      while (x < BAY / 2 - .08) {
        if (r() < .06) { x += .04 + r() * .08; continue; }                          // a gap
        const w = .028 + r() * .03, h = .25 + r() * .11, d = .2 + r() * .07;
        const lean = r() < .05 ? (r() < .5 ? -1 : 1) * (.15 + r() * .2) : 0;
        books.push({ b, x: x + w / 2, y: shelfY(k), w, h, d, lean, c: LEATHER[Math.floor(r() * LEATHER.length)], v: .75 + r() * .4 });
        x += w + .002;
      }
    }
  }
  // sconces between back bays + over the side bays, and the desk lamp
  for (const x of [-2.6, -1.1, 1.1, 2.6]) lamps.push({ p: V(x, 2.55, BACKZ + .12), s: 1 });
  for (const z of [-1.6, .4]) { lamps.push({ p: V(-SIDEX + .12, 2.55, z), s: 1 }); lamps.push({ p: V(SIDEX - .12, 2.55, z), s: 1 }); }
  lamps.push({ p: V(.55, 1.05, -1.0), s: 1.6, desk: true });                                      // banker's lamp

  // books: one instanced mesh, lamp light baked into each colour
  const spine = tex(TX.makeSpine());
  const bookMat = new THREE.MeshStandardMaterial({ map: spine, roughness: .78, metalness: 0, envMapIntensity: .3 });
  const bm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, .5, 0), bookMat, books.length);
  const col = new THREE.Color(), wp = V();
  books.forEach((k, j) => {
    q.setFromAxisAngle(up, k.b.ry);
    const lq = new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), k.lean);
    p3.set(k.x, k.y, -D / 2 + .02 + k.d / 2).applyAxisAngle(up, k.b.ry).add(V(k.b.x, 0, k.b.z));
    m4.compose(p3, q.clone().multiply(lq), s3.set(k.w, k.h, k.d));
    bm.setMatrixAt(j, m4);
    wp.copy(p3).y += k.h / 2;
    let L = .45;
    for (const l of lamps) L += l.s * .9 * Math.exp(-wp.distanceToSquared(l.p) / 1.1);
    col.setHex(k.c).multiplyScalar(k.v * Math.min(1.6, L));
    bm.setColorAt(j, col);
  });
  group.add(bm);

  // the tall night window in the middle of the back wall
  const win = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 3.2), new THREE.MeshBasicMaterial({ color: 0x31404c }));
  win.position.set(0, 2.0, BACKZ - .12); group.add(win);
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex, color: 0x6f8090, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  moon.scale.set(1.6, 2.4, 1); moon.position.set(0, 2.6, BACKZ - .1); group.add(moon);
  const extra = [{ h: moon, o: .55 }];
  wood.push(box(.07, 3.3, .08, 0, 2.0, BACKZ - .08), box(1.2, .06, .08, 0, 1.4, BACKZ - .08), box(1.2, .06, .08, 0, 2.6, BACKZ - .08),
    box(.08, 3.4, .14, -.62, 2.0, BACKZ - .06), box(.08, 3.4, .14, .62, 2.0, BACKZ - .06), box(1.32, .1, .16, 0, 3.66, BACKZ - .05), box(1.3, .08, .3, 0, .36, BACKZ));
  panels.push(box(1.2, .4, .03, 0, .18, BACKZ - .1), box(1.4, H - 3.7, .03, 0, 3.7 + (H - 3.7) / 2, BACKZ - .1));

  // floor, ceiling beams
  const floorTex = tex(TX.makeWood({ color: '#4a3424', seed: 181, planks: 8 }), 4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(SIDEX * 2 + .4, FRONTZ - BACKZ + 1.2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: floorTex, bumpMap: floorTex, bumpScale: .8, roughness: .62, envMapIntensity: .4 }));
  floor.position.set(0, .002, (FRONTZ + BACKZ) / 2 + .1); group.add(floor);
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex(TX.makeRug()), roughness: 1 }));
  rug.position.set(0, .006, -.9); group.add(rug);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(SIDEX * 2 + .4, FRONTZ - BACKZ + 1.2).rotateX(Math.PI / 2), panel);
  ceil.geometry = bake(ceil.geometry, false);
  ceil.position.set(0, H + .1, (FRONTZ + BACKZ) / 2 + .1); group.add(ceil);
  for (let z = BACKZ + .6; z < FRONTZ + .3; z += 1.1) wood.push(box(SIDEX * 2, .16, .14, 0, H + .02, z));

  // reading desk, chair, open book, banker's lamp, globe, ladder
  wood.push(box(1.5, .05, .75, .1, .76, -1.0), box(.42, .7, .66, -.4, .38, -1.0), box(.42, .7, .66, .6, .38, -1.0));
  wood.push(box(.42, .04, .42, .05, .46, -.3), box(.42, .5, .04, .05, .72, -.1));
  for (const [x, z] of [[-.13, -.48], [.23, -.48], [-.13, -.12], [.23, -.12]]) wood.push(cyl(.018, .018, .46, 5, x, .23, z));
  wood.push(box(.06, 3.8, .04, 1.62, 1.9, BACKZ + .32).rotateX(0), box(.06, 3.8, .04, 2.02, 1.9, BACKZ + .32));
  for (let y = .3; y < 3.7; y += .32) wood.push(box(.44, .025, .03, 1.82, y, BACKZ + .32));
  brass.push(cyl(.05, .07, .02, 10, .55, .79, -1.0), cyl(.008, .008, .2, 5, .55, .89, -1.0), cyl(.012, .012, .14, 6, .55, .9, -1.0), cyl(.21, .21, .006, 16, 3.0, .8, -1.1),
    cyl(.012, .03, .78, 6, 3.0, .39, -1.1), cyl(.008, .008, .03, 4, 1.82, 3.9, BACKZ + .32));
  for (const l of lamps.slice(0, -1)) brass.push(cyl(.012, .012, .2, 5, l.p.x, l.p.y - .16, l.p.z), box(.08, .14, .03, l.p.x, l.p.y - .3, l.p.z));
  const shade = new THREE.Mesh(bake(new THREE.CylinderGeometry(.06, .14, .07, 14, 1, true, 0, Math.PI).rotateY(-Math.PI / 2).rotateX(-Math.PI / 2).translate(.55, 1.01, -1.0)),
    new THREE.MeshStandardMaterial({ color: 0x1f4a32, roughness: .3, emissive: 0x0d2a1a, emissiveIntensity: .6, side: THREE.DoubleSide, vertexColors: true }));
  group.add(shade);
  const page = new THREE.MeshStandardMaterial({ color: 0xe9dfc8, roughness: .95, emissive: 0x2a1c0c, emissiveIntensity: .5 });
  const openBook = new THREE.Mesh(merged([box(.24, .012, .3, -.12, .79, -1.05).rotateZ(.05), box(.24, .012, .3, .12, .79, -1.05).rotateZ(-.05)]), page);
  openBook.position.x = -.05; group.add(openBook);
  const globe = new THREE.Mesh(new THREE.SphereGeometry(.2, 20, 14), M.sail.clone()); globe.material.color = new THREE.Color(0xcab48a);
  globe.position.set(3.0, 1.0, -1.1); globe.rotation.z = .4; group.add(globe);
  // outside: an ashlar shell with a slate roof — from the road the library reads as a
  // building whose front has been cut away, like the era dioramas
  const shell = [box(.3, H + .5, FRONTZ - BACKZ + .6, -SIDEX - .35, (H + .5) / 2, (FRONTZ + BACKZ) / 2), box(.3, H + .5, FRONTZ - BACKZ + .6, SIDEX + .35, (H + .5) / 2, (FRONTZ + BACKZ) / 2),
    box(SIDEX * 2 + 1, H + .5, .3, 0, (H + .5) / 2, BACKZ - .35)];
  for (const x of [-SIDEX - .35, SIDEX + .35]) shell.push(box(.5, H + .7, .5, x, (H + .7) / 2, FRONTZ + .2), box(.6, .25, .6, x, .12, FRONTZ + .2));    // corner piers
  shell.push(box(SIDEX * 2 + 1.3, .3, FRONTZ - BACKZ + 1.1, 0, H + .55, (FRONTZ + BACKZ) / 2 + .05));                                   // entablature
  const roofS = new THREE.Shape(); roofS.moveTo(-SIDEX - .8, 0); roofS.lineTo(SIDEX + .8, 0); roofS.lineTo(0, 1.5); roofS.closePath();
  const roof = new THREE.ExtrudeGeometry(roofS, { depth: FRONTZ - BACKZ + 1.0, bevelEnabled: false }).translate(0, H + .7, BACKZ - .45);
  // the front: a wall with a tall doorway (doors open inward), pilasters, cornice, pediment
  const FZ = FRONTZ + .35, DW = .8, DH = 2.7, WH = H + .5, side = SIDEX + .6 - DW;
  shell.push(box(side, WH, .3, -(DW + side / 2), WH / 2, FZ), box(side, WH, .3, DW + side / 2, WH / 2, FZ), box(DW * 2, WH - DH, .3, 0, DH + (WH - DH) / 2, FZ));
  shell.push(box(.2, DH + .2, .42, -DW - .1, (DH + .2) / 2, FZ + .02), box(.2, DH + .2, .42, DW + .1, (DH + .2) / 2, FZ + .02), box(DW * 2 + .7, .2, .5, 0, DH + .3, FZ + .04));
  const ped = new THREE.Shape(); ped.moveTo(-DW - .35, 0); ped.lineTo(DW + .35, 0); ped.lineTo(0, .45); ped.closePath();
  shell.push(new THREE.ExtrudeGeometry(ped, { depth: .4, bevelEnabled: false }).translate(0, DH + .4, FZ - .16));
  // podium + three steps up to the threshold, a flagged forecourt down to the road
  const PZ0 = BACKZ - .7, PZ1 = FZ + .5;
  shell.push(box(SIDEX * 2 + 1.5, .27, PZ1 - PZ0, 0, -.135, (PZ0 + PZ1) / 2));
  for (let k = 1; k <= 3; k++) shell.push(box(2.6 + k * .2, .27 - k * .09, .26, 0, -.27 + (.27 - k * .09) / 2, PZ1 + .13 + (k - 1) * .26));
  shell.push(box(.07, .02, .3, 0, .01, FZ));                                                                 // threshold stone
  const flagTex = tex(TX.makeBrick({ rgb: [128, 118, 102], mortar: '#4e463c', rows: 6, cols: 3, vary: 16, seed: 191 }), 3);
  const court = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 6).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: flagTex, bumpMap: flagTex, bumpScale: 1, roughness: .95, envMapIntensity: .2, color: 0x9a8a74 }));
  court.position.set(0, -.262, PZ1 + .78 + 3); group.add(court);
  // dressed limestone in large courses: box-projected UVs keep the blocks the same size on
  // every face (no stretched texture), a darker rusticated plinth and a string course
  for (const sx of [-1, 1]) shell.push(box(side, .1, .4, sx * (DW + side / 2), 3.8, FZ + .03));
  const plinth = [];
  for (const sx of [-1, 1]) plinth.push(box(side - .2, .52, .4, sx * (DW + .1 + (side - .2) / 2), .26, FZ + .04), box(.42, .52, FRONTZ - BACKZ + .9, sx * (SIDEX + .35), .26, (FRONTZ + BACKZ) / 2));
  const stoneTex = tex(TX.makeBrick({ rgb: [178, 166, 144], mortar: '#7c7262', rows: 7, cols: 3, vary: 20, seed: 77, size: 512 }));
  const stone = new THREE.MeshStandardMaterial({ map: stoneTex, bumpMap: stoneTex, bumpScale: 1.6, roughness: .94, vertexColors: true, envMapIntensity: .3, color: 0xd6ccb8 });
  const plinthMat = stone.clone(); plinthMat.color = new THREE.Color(0x9a9080);
  const shellG = boxUV(merged(shell), 1 / 2.7), plinthG = boxUV(merged(plinth), 1 / 2.7);
  group.add(new THREE.Mesh(shellG, stone), new THREE.Mesh(plinthG, plinthMat), new THREE.Mesh(merged([roof]), M.dark));
  wood.push(box(.05, DH - .05, .78, -DW + .05, (DH - .05) / 2, FZ - .55), box(.05, DH - .05, .78, DW - .05, (DH - .05) / 2, FZ - .55));      // open door leaves
  // lanterns either side of the door, lamp posts along the forecourt
  const outside = [];
  for (const x of [-1.35, 1.35]) { outside.push({ p: V(x, 2.25, FZ + .32), s: .8 }); brass.push(box(.03, .03, .2, x, 2.05, FZ + .22), box(.1, .16, .1, x, 2.22, FZ + .32)); }
  for (const z of [PZ1 + 1.6, PZ1 + 3.6, PZ1 + 5.6, PZ1 + 8, PZ1 + 10.5, PZ1 + 13]) for (const x of (z > PZ1 + 6 ? [-.62, .62] : [-1.45, 1.45])) { outside.push({ p: V(x, 1.28, z), s: .6 }); brass.push(cyl(.02, .03, 1.5, 6, x, -.27 + .75, z), box(.09, .13, .09, x, 1.28, z), cyl(.05, .06, .05, 6, x, -.245, z)); }
  outside.forEach((l) => lamps.push(l));
  // tall lit windows either side of the door, and the name carved over it
  const winG = [], mull = [];
  for (const x of [-3.3, -2.05, 2.05, 3.3]) {
    const wg = box(.62, 2.2, .02, x, 2.0, FZ + .16), wu = wg.attributes.uv;
    if (x === -2.05 || x === 3.3) for (let i = 0; i < wu.count; i++) wu.setXY(i, 1 - wu.getX(i), wu.getY(i) * .9 + .05);   // no two windows alike
    winG.push(wg);
    mull.push(box(.05, 2.3, .05, x, 2.0, FZ + .18), box(.66, .05, .05, x, 2.0, FZ + .18), box(.8, .1, .12, x, .86, FZ + .2), box(.78, .14, .12, x, 3.16, FZ + .2));
  }
  // the window glow: a warm gradient with the silhouettes of the shelves and books behind
  const wc = document.createElement('canvas'); wc.width = 128; wc.height = 384; const wx = wc.getContext('2d');
  const gr = wx.createLinearGradient(0, 0, 0, 384); gr.addColorStop(0, '#3a2414'); gr.addColorStop(.45, '#a86a34'); gr.addColorStop(.8, '#d89a56'); gr.addColorStop(1, '#8a5a30');
  wx.fillStyle = gr; wx.fillRect(0, 0, 128, 384);
  const hot = wx.createRadialGradient(70, 250, 4, 70, 250, 120); hot.addColorStop(0, 'rgba(255,214,150,.55)'); hot.addColorStop(1, 'rgba(255,214,150,0)');
  wx.fillStyle = hot; wx.fillRect(0, 0, 128, 384);
  const wr = rng(77);
  for (let sy = 40; sy < 360; sy += 46) {                                       // shelves with rows of book spines
    for (let bx = 6; bx < 122;) { const bw = 4 + wr() * 6, bh = 24 + wr() * 14; wx.fillStyle = `rgba(${40 + wr() * 50},${20 + wr() * 25},${10 + wr() * 15},${.55 + wr() * .3})`; wx.fillRect(bx, sy + 40 - bh, bw - 1, bh); bx += bw; }
    wx.fillStyle = 'rgba(30,18,10,.85)'; wx.fillRect(0, sy + 40, 128, 5);
  }
  wx.fillStyle = 'rgba(30,18,10,.9)'; wx.fillRect(0, 0, 6, 384); wx.fillRect(122, 0, 6, 384);
  const winTex = tex(wc);
  group.add(new THREE.Mesh(mergeGeometries(winG, false), new THREE.MeshStandardMaterial({ color: 0x0c0805, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: .85, roughness: .35, metalness: .1 })), new THREE.Mesh(merged(mull), walnut));
  const pc = document.createElement('canvas'); pc.width = 512; pc.height = 64; const px = pc.getContext('2d');
  px.fillStyle = '#8a7c68'; px.fillRect(0, 0, 512, 64);
  px.font = '600 40px "Source Serif 4", Georgia, serif'; px.textAlign = 'center'; px.textBaseline = 'middle';
  px.fillStyle = 'rgba(255,255,255,.25)'; px.fillText('BIBLIOTHÈQUE', 256, 35); px.fillStyle = '#2e261e'; px.fillText('BIBLIOTHÈQUE', 256, 33);
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.55, .19), new THREE.MeshStandardMaterial({ map: tex(pc), roughness: .9 }));
  plaque.position.set(0, DH + .1, FZ + .158); group.add(plaque);
  group.add(new THREE.Mesh(merged(wood), walnut), new THREE.Mesh(merged(panels), panel), new THREE.Mesh(merged(brass), M.iron));

  // glowing bulbs + soft halos (additive sprites, no real-time lights)
  const bulbs = [];
  lamps.forEach((l) => bulbs.push(new THREE.IcosahedronGeometry(l.desk ? .03 : .045, 1).translate(l.p.x, l.p.y - (l.desk ? .04 : 0), l.p.z)));
  group.add(new THREE.Mesh(merged(bulbs), M.glow));
  const halos = [];
  lamps.forEach((l, i) => {
    const desk = !!l.desk, out = l.s < 1;
    const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex, color: desk ? 0xffb470 : 0xffa860, transparent: true, opacity: desk ? .62 : .42, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    const s = desk ? 1.5 : out ? .9 : 1.15; h.scale.set(s, s, 1); h.position.copy(l.p); if (!desk) h.position.z += l.p.z === BACKZ + .12 ? .12 : 0;
    group.add(h); halos.push({ h, o: h.material.opacity, ph: i * 1.7 });
  });
  // a warm pool of light on the desk and the floor
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: radialTex, color: 0x8a5a2a, transparent: true, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false }));
  pool.position.set(.4, .012, -.75); group.add(pool); extra.push({ h: pool, o: .5 });

  // warm light spilling out of the doorway onto the threshold, steps and forecourt
  const spill = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 4.4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: radialTex, color: 0xb07438, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false }));
  spill.position.set(0, -.255, FRONTZ + 2.4); group.add(spill); extra.push({ h: spill, o: .55 });
  const doorGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex, color: 0xffa458, transparent: true, opacity: .32, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  doorGlow.scale.set(2.6, 3.4, 1); doorGlow.position.set(0, 1.35, FRONTZ + .5); group.add(doorGlow);
  // a soft shaft of light from the tall window, with a few slow dust motes drifting in it
  const shaftM = new THREE.MeshBasicMaterial({ map: radialTex, color: 0x8a6a48, transparent: true, opacity: .16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const shaft = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 3.6), shaftM);
  shaft.position.set(0, 1.7, BACKZ + 1.3); shaft.rotation.x = -.5; group.add(shaft); extra.push({ h: shaft, o: .16 });
  const motes = [], moteN = mobile ? 14 : 26, mr = rng(77);
  for (let i = 0; i < moteN; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex, color: 0xffd9a0, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    const sc = .025 + mr() * .03; m.scale.set(sc, sc, 1);
    group.add(m); motes.push({ m, x: (mr() - .5) * 1.0, y: .6 + mr() * 2.6, z: BACKZ + .6 + mr() * 1.4, ph: mr() * 6.28, sp: .3 + mr() * .5 });
  }
  // k: 0 far away (glows hidden, they ignore fog) → 1 on arrival
  group.userData.flicker = (t, k = 1) => {
    for (const x of halos) { x.h.visible = k > .01; x.h.material.opacity = k * x.o * (.94 + .06 * Math.sin(t * 2.3 + x.ph) * Math.sin(t * 3.7 + x.ph * 2)); }
    for (const x of extra) { x.h.visible = k > .01; x.h.material.opacity = k * x.o; }
    for (const d of motes) {
      d.m.visible = k > .01;
      const u = t * .12 * d.sp + d.ph;
      d.m.position.set(d.x + Math.sin(u) * .12, d.y + Math.sin(u * .7) * .15, d.z + Math.cos(u * .9) * .1);
      d.m.material.opacity = k * .5 * (.6 + .4 * Math.sin(u * 2.1));
    }
    doorGlow.visible = k * (1 - inside) > .01; doorGlow.material.opacity = .32 * k * (1 - inside);
  };
  let inside = 0;
  group.userData.setInside = (v) => { inside = v; };
  group.userData.flicker(0, 0);
  return group;
}
