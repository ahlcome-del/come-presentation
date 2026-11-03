/**
 * Côme Presentation — 3D scene (three.js r169, single fixed canvas).
 *
 * ONE continuous journey. The whole scene is a pure function of a single
 * number p ∈ [0,1]; the render loop damps p towards the scroll target, so
 * any scroll jump glides instead of cutting. All objects are created in
 * init() — nothing is created or shown by callbacks.
 *
 *   0.00–0.13  the closed leather book floats, turns, the camera dollies in
 *   0.09–0.24  cover hinges open, pages riffle and curl
 *   0.22–0.36  the open book lies back; five pages lift out, unfold into maps;
 *              the camera flies over the book into the cloud of maps
 *   0.36–0.84  the maps glide ahead to five stations along a route; the camera
 *              travels a CatmullRom spline past each era: its map settles on the
 *              ground, the diorama assembles out of it, opens (cutaway), re-seats
 *   0.86–1.00  the camera rises and pulls back: all eras small along the route
 */
import * as THREE from './vendor/three.js';
import { RoomEnvironment } from './vendor/three.js';
import { PLATES, generateMaps } from './maps.js';
import * as TX from './textures.js';
import { buildDiorama, makeMaterials } from './dioramas.js';

/* =========================================================================
   CONFIG — colours, sizes, timings (scroll ranges in progress units)
   ========================================================================= */
export const CONFIG = {
  colors: {
    bg: 0x191613,
    key: 0xffe0bd,          // warm key light
    rim: 0xa7bed6,          // cool rim light
    spill: 0xffc48a,        // warm light spilling from the open book
    ground: 0x2b2621,
  },
  lights: { key: 2.1, rim: 2.2, hemi: .3, env: .26, exposure: .92 },
  fog: { near: 7, far: 26 },
  dpr: { desktop: 2, mobile: 1.5, min: 1 },
  camera: { fov: 34 },
  parallax: { amount: .018, damping: .06 },
  adaptive: !/[?&]noadapt\b/.test(location.search),   // adaptive DPR (QA can disable)
  book: { restY: -.72, w: 1.3, h: 1.8, t: .3, cover: .032, pages: { desktop: 48, mobile: 24 }, segments: { desktop: 24, mobile: 12 } },
  maps: { desktop: [2048, 1418], mobile: [1280, 886] },
  // scroll ranges (progress units). Station i is closest to the camera at stations.first + i·step
  ranges: {
    turn: [.04, .115],           // book turns to face camera, dolly in
    cover: [.11, .18],          // cover hinge (with slight overshoot)
    riffle: [.15, .245],        // pages riffle one after another
    recline: [.225, .295],       // the open book lies back; the camera flies over it
    bookGone: .5,
    detach: [.232, .29],       // map plates lift out of the book…
    unfold: [.255, .315],         // …and unfold to double width
    plateStagger: .011,
    toStation: [.355, .41],     // each plate glides ahead to hover over its station
    settle: [-.05, -.022],      // …and lies down when the camera arrives (relative to station p)
    assemble: [-.042, -.012],   // the era rises out of its map
    explode: [-.012, .004, .014, .032],  // cutaway while the camera is closest
    stations: { first: .46, step: .085 },
    library: [.86, .97],
  },
  world: {
    groundY: -1.6,
    stations: [[-2.1, -15], [2.1, -22], [-2.1, -29], [2.1, -36], [-2.1, -43]],
    plateScale: 1.05,
  },
  // the cloud of maps between the book and the first era: [x, y, z, rotY, rotZ, scale]
  cluster: {
    wide: [[-.75, .7, -2.6, .38, .02, .5], [1.95, 1.3, -3.7, -.4, -.02, .52], [-.1, 1.75, -5.3, .14, .015, .5], [1.5, .1, -6.1, -.25, .02, .55], [-1.2, .05, -7.4, .3, -.02, .55]],
    portrait: [[-.62, .95, -2.6, .3, .02, .36], [.72, 1.45, -3.7, -.3, -.02, .38], [-.3, 1.95, -5.3, .1, .015, .38], [.55, .2, -6.1, -.2, .02, .4], [-.8, .0, -7.4, .24, -.02, .4]],
  },
  // fog / background / key-light tint per era (very close to the page colour: a mood, not a colour cast)
  atmos: [
    { fog: 0x1d1813, key: 0xffe2b8 },   // Antiquité: warm stone
    { fog: 0x181816, key: 0xe9e2d2 },   // Moyen Âge: grey, cooler
    { fog: 0x151a1b, key: 0xd9e2e4 },   // Grandes découvertes: sea air
    { fog: 0x1c1712, key: 0xffd2a0 },   // XIXe: soot & lamplight
    { fog: 0x1a1816, key: 0xf2e8d8 },   // XXe: pale, electric
  ],
  damping: 4.2,                 // scene progress glides to the scroll target: 1 − e^(−dt·k)
};

/* ---------------- math helpers ---------------- */
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const range = (r, x) => clamp((x - r[0]) / (r[1] - r[0]));
const smooth = (t) => t * t * (3 - 2 * t);
const smootherstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * t * (t * (t * 6 - 15) + 10); };

/** cubic-bezier(x1,y1,x2,y2) solver — same curve as CSS */
export function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t, sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) { const e = sx(t) - x; const d = dx(t); if (Math.abs(e) < 1e-5 || !d) break; t -= e / d; }
    return sy(clamp(t));
  };
}
const EASE = bezier(.28, .11, .32, 1);
const EASE_IO = bezier(.65, 0, .35, 1);
const backOut = (t, s = 1.15) => { t -= 1; return t * t * ((s + 1) * t + s) + 1; };

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _s = new THREE.Vector3(), _s2 = new THREE.Vector3();
const _e = new THREE.Euler();
const _c1 = new THREE.Color();

/* =========================================================================
   Page bend shader (CPU-free): each page is a plane x∈[0,w] hinged at x=0,
   rotated by θ around the spine and curled with curvature k (tip lags).
   ========================================================================= */
function makePageMaterial(map) {
  // paper: matte, faint fibre bump, warm emissive lift = cheap "light passing through" sheen
  const mat = new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: .5, roughness: .93, metalness: 0, envMapIntensity: .4,
    emissive: 0x3a2412, emissiveIntensity: .18, side: THREE.DoubleSide });
  mat.userData.u = { uTheta: { value: 0 }, uK: { value: 0 } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, mat.userData.u);
    sh.vertexShader = 'uniform float uTheta;\nuniform float uK;\n' + sh.vertexShader
      .replace('#include <beginnormal_vertex>', `
        float s_ = position.x;
        float phi_ = uTheta + uK * s_;
        vec3 objectNormal = vec3(-sin(phi_), 0.0, cos(phi_));
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3(tangent.xyz);
        #endif`)
      .replace('#include <begin_vertex>', `
        vec3 transformed;
        if (abs(uK) < 1e-4) {
          transformed = vec3(s_ * cos(uTheta), position.y, s_ * sin(uTheta));
        } else {
          transformed = vec3((sin(uTheta + uK * s_) - sin(uTheta)) / uK, position.y, (cos(uTheta) - cos(uTheta + uK * s_)) / uK);
        }`);
  };
  mat.customProgramCacheKey = () => 'cp-page';
  return mat;
}

/* =========================================================================
   Scene
   ========================================================================= */
export class StoryScene {
  constructor(canvas, { mobile = false, reduced = false, onFrame = null } = {}) {
    this.canvas = canvas; this.mobile = mobile; this.reduced = reduced; this.onFrame = onFrame;
    this.p = 0; this.target = 0; this.time = 0; this.running = false; this.dirty = true;
    this.mouse = new THREE.Vector2(); this.mouseT = new THREE.Vector2();
    this.disposables = [];
    this.dioramas = []; this.platesReady = false;
  }

  /* ---------- setup ---------- */
  async init(onProgress = () => {}) {
    const C = CONFIG;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = C.lights.exposure;
    r.setClearColor(C.colors.bg, 1);
    this.maxDpr = this.mobile ? C.dpr.mobile : C.dpr.desktop;
    this.dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    r.setPixelRatio(this.dpr);
    this.aniso = Math.min(8, r.capabilities.getMaxAnisotropy());

    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(C.colors.bg);
    scene.fog = new THREE.Fog(C.colors.bg, C.fog.near, C.fog.far);

    // PMREM from RoomEnvironment (no HDR file)
    const pmrem = new THREE.PMREMGenerator(r);
    const room = new RoomEnvironment();
    this.envRT = pmrem.fromScene(room, .04);
    scene.environment = this.envRT.texture;
    scene.environmentIntensity = C.lights.env;
    room.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
    pmrem.dispose();
    onProgress(.25);

    // lights: warm key + cool rim + soft hemisphere
    const key = new THREE.DirectionalLight(C.colors.key, C.lights.key); key.position.set(-3.5, 5, 6);
    const rim = new THREE.DirectionalLight(C.colors.rim, C.lights.rim); rim.position.set(4.5, 2.5, -6);
    const hemi = new THREE.HemisphereLight(0xd9c7a6, 0x191613, C.lights.hemi);
    scene.add(key, rim, hemi);
    this.key = key;
    this.spill = new THREE.PointLight(C.colors.spill, 0, 4.5, 1.6);
    this.inner = new THREE.PointLight(C.colors.spill, 0, 2.2, 1.8);
    scene.add(this.spill, this.inner);

    this.camera = new THREE.PerspectiveCamera(C.camera.fov, 1, .05, 90);
    this.look = V3();

    // shared soft textures
    this.radialTex = this.tex(TX.makeRadial(256), false);
    this.shadowTex = this.tex(TX.makeRadial(256, 0, [[0, .85], [.45, .5], [1, 0]]), false);

    this.buildBook();
    onProgress(.6);
    this.buildPlates();
    this.buildGround();
    onProgress(.75);
    this.buildWorld();
    onProgress(.9);

    this.resize();
    window.addEventListener('resize', this._onResize = () => this.resize(), { passive: true });
    if (!this.reduced && matchMedia('(pointer: fine)').matches) {
      window.addEventListener('pointermove', this._onPointer = (e) => {
        this.mouseT.set((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1));
      }, { passive: true });
    }
    document.addEventListener('visibilitychange', this._onVis = () => (document.hidden ? this.stop() : this.start()));
    // warm up every shader / texture upload now (all objects visible once), so no hitch mid-scroll
    const hidden = [];
    scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    this.resize();
    this.renderer.compile(scene, this.camera);
    this.renderer.render(scene, this.camera);          // uploads every texture once
    hidden.forEach((o) => (o.visible = false));
    this.update(0, 0);
    onProgress(1);
  }

  tex(canvas, srgb = true, aniso = true) {
    const t = new THREE.CanvasTexture(canvas);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (aniso) t.anisotropy = this.aniso;
    this.disposables.push(t);
    return t;
  }

  /* ---------- the book ---------- */
  buildBook() {
    const B = CONFIG.book, W = B.w, H = B.h, T = B.t, ct = B.cover;
    const silPath = new Path2D(document.querySelector('#sil path').getAttribute('d'));
    const cover = TX.makeCover(silPath, this.mobile ? { w: 768, h: 1064 } : {});
    const coverMap = this.tex(cover.map), coverBump = this.tex(cover.bump, false);
    const leather = this.tex(TX.makeLeather()), spineTex = this.tex(TX.makeLeather({ w: 256, h: 708, spine: true }));
    const endpaper = this.tex(TX.makeEndpaper()), pageTex = this.tex(TX.makePage(this.mobile ? { w: 512, h: 708 } : {}));
    const edges = this.tex(TX.makeEdges());
    this.parchTex = this.tex(TX.makeParchment());

    // leather: matte grain (bump from the same grain canvas), low env reflection — no lacquer/plastic sheen
    const mLeather = new THREE.MeshStandardMaterial({ map: leather, roughness: .82, metalness: 0, bumpMap: leather, bumpScale: 1.6, envMapIntensity: .35 });
    const mCover = new THREE.MeshStandardMaterial({ map: coverMap, bumpMap: coverBump, bumpScale: 2.6, roughness: .8, envMapIntensity: .35 });
    const mSpine = new THREE.MeshStandardMaterial({ map: spineTex, bumpMap: spineTex, bumpScale: 1.4, roughness: .82, envMapIntensity: .35, side: THREE.DoubleSide });
    const paper = { roughness: .94, metalness: 0, envMapIntensity: .35, emissive: 0x3a2412, emissiveIntensity: .14 };
    const mEnd = new THREE.MeshStandardMaterial({ map: endpaper, bumpMap: endpaper, bumpScale: .5, ...paper });
    const mEdge = new THREE.MeshStandardMaterial({ map: edges, bumpMap: edges, bumpScale: 1.2, color: 0xe6dac0, ...paper });
    const mPageTop = new THREE.MeshStandardMaterial({ map: pageTex, bumpMap: pageTex, bumpScale: .5, ...paper });
    this.mats = { mLeather, mCover, mSpine, mEnd, mEdge, mPageTop };

    const root = this.bookRoot = new THREE.Group();
    const inner = this.bookInner = new THREE.Group();
    root.add(inner); this.scene.add(root);

    // back cover (outer face -z), spine (half cylinder), front cover on a hinge
    const back = new THREE.Mesh(new THREE.BoxGeometry(W, H, ct), [mLeather, mLeather, mLeather, mLeather, mEnd, mLeather]);
    back.position.set(W / 2, 0, -T / 2 + ct / 2); inner.add(back);
    const spine = new THREE.Mesh(new THREE.CylinderGeometry(T / 2, T / 2, H, 18, 1, true, Math.PI, Math.PI), mSpine);
    spine.scale.set(.42, 1, 1); inner.add(spine);
    this.frontPivot = new THREE.Group(); this.frontPivot.position.set(0, 0, T / 2 - ct / 2); inner.add(this.frontPivot);
    const front = new THREE.Mesh(new THREE.BoxGeometry(W, H, ct), [mLeather, mLeather, mLeather, mLeather, mCover, mEnd]);
    front.position.set(W / 2, 0, 0); this.frontPivot.add(front);

    // page blocks: right (unturned) and left (turned, rides on the cover)
    const pw = W - .05, ph = H - .07;
    this.pw = pw; this.ph = ph; this.blockT = T - 2 * ct;
    const blockGeo = new THREE.BoxGeometry(pw, ph, 1);
    this.rightBlock = new THREE.Mesh(blockGeo, [mEdge, mEdge, mEdge, mEdge, mPageTop, mEdge]);
    this.leftBlock = new THREE.Mesh(blockGeo, [mEdge, mEdge, mEdge, mEdge, mEdge, mPageTop]);
    inner.add(this.rightBlock); this.frontPivot.add(this.leftBlock);

    // riffling pages (bent in the vertex shader)
    const N = this.N = this.mobile ? B.pages.mobile : B.pages.desktop;
    const seg = this.mobile ? B.segments.mobile : B.segments.desktop;
    const pageGeo = new THREE.PlaneGeometry(pw, ph, seg, 1).translate(pw / 2, 0, 0);
    this.pages = [];
    this.plateIdx = [.17, .32, .47, .62, .77].map((f) => Math.round(f * N));
    for (let i = 0; i < N; i++) {
      if (this.plateIdx.includes(i)) { this.pages.push(null); continue; }
      const m = new THREE.Mesh(pageGeo, makePageMaterial(pageTex));
      m.frustumCulled = false; m.visible = false; inner.add(m);
      this.pages.push(m);
    }

    // warm light spilling out of the opening book
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.radialTex, color: CONFIG.colors.spill, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.glow.scale.set(3.4, 2.6, 1); this.glow.position.set(0, .1, .45); inner.add(this.glow);
  }

  /* =======================================================================
     WORLD LAYOUT — the book sits at the origin; the journey runs along −z.
     Five "stations" (eras) are placed along a gentle S-curve on a dark
     map-ground; a dashed ink route links them. Everything is created up
     front in init(): nothing is ever lazily created mid-scroll.
     ======================================================================= */
  buildWorld() {
    const C = CONFIG, G = C.world.groundY;
    // stations
    this.stations = C.world.stations.map(([x, z], i) => ({ i, pos: V3(x, G, z) }));
    // the ground: a very large dark sheet with a faint engraved graticule (fades into fog)
    const gtex = this.tex(TX.makeGroundMap(this.mobile ? 512 : 1024));
    gtex.wrapS = gtex.wrapT = THREE.RepeatWrapping; gtex.repeat.set(3, 12);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(36, 144),
      new THREE.MeshStandardMaterial({ map: gtex, color: 0x6e6252, roughness: 1, metalness: 0, envMapIntensity: .2 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, G - .002, -40);
    this.worldGround = ground; this.scene.add(ground);

    // dashed route linking the book to every station (flat ribbon on the ground)
    const pts = [V3(0, G, 2), V3(0, G, -6), ...this.stations.map((s) => s.pos.clone().add(V3(-Math.sign(s.pos.x) * 1.35, 0, 0))), V3(0, G, -58)];
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const n = 400, w = .018, pos = [], uv = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n, p = curve.getPointAt(u), tg = curve.getTangentAt(u);
      const nx = -tg.z, nz = tg.x, l = Math.hypot(nx, nz) || 1;
      pos.push(p.x + nx / l * w, G + .004, p.z + nz / l * w, p.x - nx / l * w, G + .004, p.z - nz / l * w);
      uv.push(u * 180, 0, u * 180, 1);
    }
    const idx = [];
    for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    rg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    rg.setIndex(idx);
    const dash = this.tex(TX.makeDash(), false); dash.wrapS = THREE.RepeatWrapping;
    this.route = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ map: dash, color: 0xb9a888, transparent: true, opacity: .55, depthWrite: false }));
    this.route.renderOrder = 1;
    this.scene.add(this.route);

    // soft contact shadow under each station (on the map sheet)
    this.stationShadows = this.stations.map((s) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 2.9), new THREE.MeshBasicMaterial({ map: this.shadowTex, color: 0x000000, transparent: true, opacity: 0, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.copy(s.pos).y += .008; m.renderOrder = 2;
      this.scene.add(m); return m;
    });

    // all five dioramas, built now (a few ms each) — never created during scroll
    const M = this.dioMats = makeMaterials();
    this.dioramas = this.stations.map((s, i) => {
      const b = buildDiorama(i, M, this.shadowTex);
      b.station = s;
      b.group.position.copy(s.pos).y += .05;
      b.group.visible = false;
      this.scene.add(b.group);
      return b;
    });
  }

  /* ---------- ground disc + soft contact shadow under the book ---------- */
  buildGround() {
    const g = new THREE.Mesh(new THREE.CircleGeometry(3.2, 64), new THREE.MeshBasicMaterial({ map: this.radialTex, color: 0x000000, transparent: true, opacity: .5, depthWrite: false }));
    g.rotation.x = -Math.PI / 2; g.position.y = CONFIG.world.groundY + .006;
    this.groundShadow = g; g.renderOrder = 2;
    this.scene.add(g);
  }

  /* ---------- map plates (two halves: the right half unfolds) ---------- */
  buildPlates() {
    const pw = this.pw, ph = this.ph, th = .004;
    this.plateFront = [];
    const back = new THREE.MeshStandardMaterial({ map: this.parchTex, bumpMap: this.parchTex, bumpScale: .6, roughness: .95, envMapIntensity: .35, emissive: 0x3a2412, emissiveIntensity: .12 });
    const edge = new THREE.MeshStandardMaterial({ color: 0xd8c8a6, roughness: 1, envMapIntensity: .3 });
    const half = (u0) => {
      const g = new THREE.BoxGeometry(pw, ph, th).translate(pw / 2, 0, 0);
      const uv = g.attributes.uv;
      for (let i = 16; i < 20; i++) uv.setX(i, u0 + uv.getX(i) * .5);   // face +z uses vertices 16..19
      return g;
    };
    this.plates = PLATES.map((spec, k) => {
      const front = new THREE.MeshStandardMaterial({ map: this.parchTex, roughness: .93, color: 0xd6cebf, envMapIntensity: .35, emissive: 0x3a2412, emissiveIntensity: .1 });
      this.plateFront.push(front);
      const grp = new THREE.Group(); grp.matrixAutoUpdate = false; grp.visible = false;
      const A = new THREE.Mesh(half(0), [edge, edge, edge, edge, front, back]);
      const hinge = new THREE.Group(); hinge.position.set(pw, 0, -.006);
      const Bm = new THREE.Mesh(half(.5), [edge, edge, edge, edge, front, back]);
      hinge.add(Bm); grp.add(A, hinge);
      A.frustumCulled = Bm.frustumCulled = false;   // matrices are set by hand
      this.scene.add(grp);
      return { grp, hinge, spec, fan: new THREE.Matrix4() };
    });
  }

  /** generate the antique maps (async, idle slices) and swap them onto the plates */
  async loadMaps() {
    const [w, h] = this.mobile ? CONFIG.maps.mobile : CONFIG.maps.desktop;
    await generateMaps({
      width: w, height: h,
      onPlate: (i, cv) => {
        const t = this.tex(cv);
        t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
        this.plateFront[i].map = t; this.plateFront[i].needsUpdate = true;
        this.dirty = true;
      },
    });
    this.platesReady = true;
  }

  /** progress at which the camera is closest to station i */
  stationP(i) { const S = CONFIG.ranges.stations; return S.first + i * S.step; }

  /* =======================================================================
     update(p): everything below is a deterministic function of progress p
     (p is already damped in the render loop, so jumps glide).
     ======================================================================= */
  update(p, t) {
    const R = CONFIG.ranges, B = CONFIG.book, G = CONFIG.world.groundY;
    const W = B.w, T = B.t, ct = B.cover;
    const idle = this.reduced ? 0 : 1;

    /* ----- book pose: float → face camera → open → recline flat (camera flies over it) ----- */
    const turn = EASE(range(R.turn, p));
    const recline = EASE_IO(range(R.recline, p));
    const root = this.bookRoot;
    const heroRotY = .5 + Math.sin(t * .22) * .1 * idle - p * 1.6;
    const floatY = Math.sin(t * .7) * .045 * idle * (1 - turn * .7) * (1 - recline);
    root.position.set(0, floatY + lerp(0, CONFIG.book.restY, recline), lerp(0, -.4, recline));
    root.rotation.set(lerp(lerp(.12 + Math.sin(t * .31) * .025 * idle, -.32, turn), -Math.PI / 2 + .08, recline), lerp(heroRotY, 0, turn), lerp(-.05, 0, turn));
    root.visible = p < R.bookGone;

    /* cover hinge: 0 → 160° with slight overshoot (stays on the spine pivot) */
    const cv = range(R.cover, p);
    const coverPhi = THREE.MathUtils.degToRad(160) * clamp(backOut(cv, .9), 0, 1.04);
    this.frontPivot.rotation.y = -coverPhi;
    this.bookInner.position.x = lerp(-W / 2, -.04, smooth(clamp(cv * 1.15)));

    /* riffle: pages turn one after another, curling as they go */
    const N = this.N, K = this.mobile ? 5 : 8;
    const rr = range(R.riffle, p) * (N + K);
    let lifted = 0, landed = 0;
    const dz = this.blockT / N;
    const fan = [34, 58, 82, 106, 130].map((d) => THREE.MathUtils.degToRad(d));
    const st = this.pageState || (this.pageState = []);
    for (let i = 0; i < N; i++) {
      const f = clamp((rr - i) / K);
      if (f > 0) lifted++;
      if (this.plateIdx.indexOf(i) < 0 && f >= 1) landed++;
      st[i] = f;
    }
    const thickR = Math.max(.002, (N - lifted) * dz), thickL = Math.max(.0001, landed * dz);
    this.rightBlock.scale.z = thickR;
    this.rightBlock.position.set(.01 + this.pw / 2, 0, -T / 2 + ct + thickR / 2);
    this.leftBlock.scale.z = thickL; this.leftBlock.visible = landed > 0;
    this.leftBlock.position.set(.01 + this.pw / 2, 0, -ct / 2 - thickL / 2);
    const zTopR = -T / 2 + ct + thickR;
    _v.set(0, 0, -ct / 2 - thickL).applyAxisAngle(_v2.set(0, 1, 0), -coverPhi).add(this.frontPivot.position);
    const lhx = _v.x, lhz = _v.z;
    root.updateMatrixWorld(true);
    for (let i = 0; i < N; i++) {
      const f = st[i], e = EASE_IO(f);
      const k = this.plateIdx.indexOf(i);
      if (k >= 0) {                                   // the five plates stop in a fan
        _m.makeRotationY(-fan[k] * EASE(f)).setPosition(0, 0, zTopR + .003 + k * .001);
        this.plates[k].fan.multiplyMatrices(this.bookInner.matrixWorld, _m);
        this.plates[k].fanF = f;
        continue;
      }
      const m = this.pages[i];
      m.visible = root.visible && f > 0 && f < 1;
      if (!m.visible) continue;
      const curl = -1.25 * Math.sin(Math.PI * e) * (1 - .3 * e);
      m.material.userData.u.uTheta.value = coverPhi * e;
      m.material.userData.u.uK.value = curl / this.pw;
      m.position.set(lerp(0, lhx, e), 0, lerp(zTopR + .002, lhz, e));
    }

    /* warm light spilling out of the open book — peaks as the camera flies over it */
    const spill = smootherstep(R.cover[0] + .03, R.cover[1] + .03, p) * (1 - smootherstep(R.recline[1] + .02, R.recline[1] + .1, p));
    const over = Math.exp(-Math.pow((p - R.recline[1]) / .04, 2));
    this.glow.material.opacity = spill * (.14 + .1 * over);
    this.glow.getWorldPosition(this.spill.position);
    this.spill.position.y += .5 * recline; this.spill.position.z += .5 * (1 - recline);
    this.spill.intensity = spill * (2.2 + 1.5 * over);
    this.groundShadow.material.opacity = .55 * (1 - turn * .3) * (root.visible ? 1 : 0);

    /* ----- plates, dioramas, atmosphere, camera ----- */
    this.updatePlates(p, t);
    this.updateDioramas(p, t);
    this.updateAtmosphere(p);
    this.updateCamera(p, t);
  }

  /* map plate poses ------------------------------------------------------
     fan (hinged in the book) → lift & unfold into a loose cluster of maps
     hanging in the air ahead of the book (camera flies through it) → each
     plate glides on to "its" station and hovers there as a beacon → when
     the camera arrives it settles flat on the ground and the era rises
     out of it. Poses are blended with smootherstep, never toggled. */
  clusterPose(k) {
    return (this.aspect < .95 ? CONFIG.cluster.portrait : CONFIG.cluster.wide)[k];
  }
  plateMatrix(cx, cy, cz, rx, ry, rz, s, out) {
    _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ'));
    _s.setScalar(s);
    _v.set(cx, cy, cz).sub(_v2.set(this.pw * s, 0, 0).applyQuaternion(_q));   // pose = centre of the unfolded plate
    return out.compose(_v, _q, _s);
  }
  updatePlates(p, t) {
    const R = CONFIG.ranges, G = CONFIG.world.groundY;
    const fl = this.reduced ? 0 : 1;
    const mA = this._mA || (this._mA = new THREE.Matrix4()), mB = this._mB || (this._mB = new THREE.Matrix4());
    this.plates.forEach((pl, k) => {
      const o = k * R.plateStagger;
      const d = EASE(range([R.detach[0] + o, R.detach[1] + o], p));          // leave the book
      const u = EASE(range([R.unfold[0] + o, R.unfold[1] + o], p));          // open to double width
      const sp = this.stationP(k);
      const go = EASE_IO(range([R.toStation[0] + o, R.toStation[1] + o], p)); // fly on to the station
      const settle = EASE_IO(range([sp + R.settle[0], sp + R.settle[1]], p)); // lie down on the ground
      const vis = (pl.fanF || 0) > 0 && p > R.riffle[0];
      pl.grp.visible = vis;
      if (!vis) return;
      pl.hinge.rotation.y = Math.PI * (1 - u);

      // 1) cluster pose (maps hanging in the dark, gentle idle drift)
      const [cx, cy, cz, cry, crz, cs] = this.clusterPose(k);
      const bob = Math.sin(t * .6 + k * 1.7) * .04 * fl;
      this.plateMatrix(cx, cy + bob, cz, Math.sin(t * .4 + k) * .02 * fl, cry, crz, cs, mB);
      let M = d < 1 ? blendMatrix(pl.fan, mB, d, mA) : mA.copy(mB);
      if (d > 0 && d < 1) {                                     // lift on an arc, not a straight line
        M.elements[13] += Math.sin(Math.PI * d) * .9;
        M.elements[14] += Math.sin(Math.PI * d) * .6;
      }

      // 2) hover above the station, tilted towards the arriving camera
      if (go > 0) {
        const s = this.stations[k].pos;
        const sc = CONFIG.world.plateScale;
        const hover = this.plateMatrix(s.x, G + 2.05 + bob, s.z - .55, -.62, 0, 0, sc * .8, this._mH || (this._mH = new THREE.Matrix4()));
        M = blendMatrix(M, hover, go, M);
        if (go < 1) M.elements[13] += Math.sin(Math.PI * go) * 1.4;
        // 3) settle flat on the ground: becomes the map the era stands on
        if (settle > 0) {
          const flat = this.plateMatrix(s.x, G + .004, s.z, -Math.PI / 2, 0, 0, sc, this._mF || (this._mF = new THREE.Matrix4()));
          M = blendMatrix(M, flat, settle, M);
        }
      }
      pl.grp.matrix.copy(M);
      pl.grp.matrixWorldNeedsUpdate = true;
      pl.settle = settle;
    });
  }

  /* dioramas ------------------------------------------------------------- */
  updateDioramas(p, t) {
    const R = CONFIG.ranges;
    let interiorBest = 0;
    const focus = this.focus || (this.focus = []);
    this.dioramas.forEach((d, i) => {
      const sp = this.stationP(i);
      const a = EASE(range([sp + R.assemble[0], sp + R.assemble[1]], p));     // rises & assembles out of its map
      d.group.visible = a > 0.001;
      this.stationShadows[i].material.opacity = .7 * a;
      // cutaway: roof lifts, walls slide apart while the camera is closest
      const e = smootherstep(sp + R.explode[0], sp + R.explode[1], p) * (1 - smootherstep(sp + R.explode[2], sp + R.explode[3], p));
      d.explode = e;
      focus[i] = smootherstep(sp - .03, sp - .008, p) * (1 - smootherstep(sp + .012, sp + .034, p));
      if (!d.group.visible) return;
      const s = Math.max(.001, lerp(.55, 1, a));
      d.group.scale.setScalar(s);
      d.group.position.copy(d.station.pos);
      d.group.position.y += .05 - (1 - a) * .25 + (this.reduced ? 0 : Math.sin(t * .55 + i * 1.3) * .006);
      // turn the model to face the camera's passing line (+ a slow idle sway)
      d.group.rotation.y = -Math.sign(d.station.pos.x) * .38 + (this.reduced ? 0 : Math.sin(t * .18 + i) * .06) + (1 - a) * .6;
      const gather = 1 - a;                                    // parts fly in from an exploded cloud
      for (let j = 0; j < d.parts.length; j++) {
        const pt = d.parts[j];
        pt.obj.position.copy(pt.base).addScaledVector(pt.dir, e + gather * 3.2);
        pt.obj.position.y += gather * (1.1 + (j % 3) * .35);
        if (pt.tilt) pt.obj.rotation.z = pt.tilt * e;
        if (pt.tiltX) pt.obj.rotation.x = pt.tiltX * e;
      }
      if (!this.reduced || e > 0) for (const fn of d.animators) fn(t);
      if (e > interiorBest) {
        interiorBest = e;
        _v.copy(d.interior).multiplyScalar(s).applyAxisAngle(_v2.set(0, 1, 0), d.group.rotation.y).add(d.group.position);
        this.inner.position.copy(_v);
      }
    });
    this.inner.intensity = interiorBest * 2.4;
  }

  /* era atmosphere: fog / background / key light drift between stations */
  updateAtmosphere(p) {
    const A = CONFIG.atmos, C = CONFIG;
    const sp0 = this.stationP(0), step = C.ranges.stations.step;
    const x = clamp((p - sp0 + step * .5) / step, 0, A.length - 1);       // continuous era index
    const i = Math.floor(x), f = smooth(x - i);
    const a = A[i], b = A[Math.min(A.length - 1, i + 1)];
    const into = smootherstep(sp0 - .1, sp0 - .02, p);                     // from neutral book light into the eras
    const fog = this._fog || (this._fog = new THREE.Color());
    fog.setHex(a.fog).lerp(_c1.setHex(b.fog), f);
    fog.lerp(_c1.setHex(C.colors.bg), 1 - into);
    this.scene.fog.color.copy(fog); this.scene.background.copy(fog);
    this.key.color.setHex(a.key).lerp(_c1.setHex(b.key), f).lerp(_c1.setHex(C.colors.key), 1 - into);
    const lib = smootherstep(C.ranges.library[0], C.ranges.library[1], p);
    this.scene.fog.near = lerp(C.fog.near, 16, lib);
    this.scene.fog.far = lerp(C.fog.far, 62, lib);
  }

  /* ---------- camera: one CatmullRom spline for position, one for target ---------- */
  buildCameraPath() {
    const st = this.stations, G = CONFIG.world.groundY;
    const wide = this.aspect >= .95;
    const keys = [];
    const K = (p, pos, look) => keys.push({ p, pos, look });
    // book
    K(0, V3(0, .3, 6.5), V3(0, 0, 0));
    K(.055, V3(0, .38, 6.1), V3(0, 0, 0));
    K(.14, V3(0, 1.9, 7.6), V3(0, -.12, 0));
    K(.215, V3(0, 1.8, 7.0), V3(0, -.12, 0));
    // over the reclining open book, into the cloud of maps
    K(.275, V3(0, 2.25, 4.0), V3(0, .25, -2.6));
    K(.315, V3(.2, 1.55, 1.2), V3(.5, .75, -5));
    K(.355, V3(.35, 1.05, -1.6), V3(.4, .5, -8));
    K(.395, V3(0, .45, -6.4), V3(st[0].pos.x * .5, G + .9, st[0].pos.z));
    // stations
    st.forEach((s, i) => {
      const sp = this.stationP(i), S = s.pos, sg = Math.sign(S.x);
      const nxt = st[i + 1] ? st[i + 1].pos : V3(0, G, S.z - 9);
      K(sp - .03, V3(S.x * .2, G + 2.3, S.z + 6.0), V3(S.x, G + .5, S.z));
      K(sp, V3(S.x * .35, G + 1.7, S.z + 4.55), V3(S.x, G + .42, S.z));
      K(sp + .027, V3(-S.x * .1, G + 2.0, S.z + 2.6), V3(lerp(S.x, nxt.x, .55), G + .45, lerp(S.z, nxt.z, .55)));
    });
    // library: rise and pull back, all eras small in the distance
    const last = st[st.length - 1].pos;
    const mid = (st[0].pos.z + last.z) / 2;
    K(.9, V3(3.2, G + 6.2, last.z + 9), V3(-.6, G + .2, last.z + 1));
    K(1, V3(10.5, G + 9.5, mid + 12), V3(0, G, mid - 1));
    this.camKeys = keys;
    this.camPos = new THREE.CatmullRomCurve3(keys.map((k) => k.pos), false, 'centripetal');
    this.camLook = new THREE.CatmullRomCurve3(keys.map((k) => k.look), false, 'centripetal');
    this._camAspect = this.aspect;
  }
  /** progress → spline parameter (piecewise linear in key index, eased inside each span) */
  camU(p) {
    const ks = this.camKeys, n = ks.length - 1;
    let j = 0; while (j < n - 1 && p > ks[j + 1].p) j++;
    const f = clamp((p - ks[j].p) / (ks[j + 1].p - ks[j].p));
    return (j + f) / n;
  }

  updateCamera(p, t) {
    if (!this.camPos || this._camAspect !== this.aspect) this.buildCameraPath();
    const u = this.camU(p);
    const cam = this.camera;
    const pos = this.camPos.getPoint(u, _v2), look = this.camLook.getPoint(u, _v);
    // portrait: step back along the view ray so subjects fit the narrow frame
    const a = this.aspect;
    const fit = lerp(Math.pow(clamp(.75 / a, 1, 2.4), .9), Math.pow(clamp(.95 / a, 1, 2.4), .85), smootherstep(.2, .32, p));
    pos.sub(look).multiplyScalar(fit).add(look);

    // pointer parallax (1–2 %)
    const P = CONFIG.parallax;
    this.mouse.lerp(this.mouseT, P.damping);
    const dist = pos.distanceTo(look);
    pos.x += this.mouse.x * P.amount * dist * 2.2;
    pos.y += this.mouse.y * P.amount * dist * 1.4;
    cam.position.copy(pos);
    cam.lookAt(look);

    // frame the subject away from the headlines (hero / opening), then centre
    const release = 1 - EASE(range([.22, .3], p));
    const sx = lerp(.2, .17, EASE(range([.06, .14], p))) * release;
    const sy = smooth(range([.08, .14], p)) * release * .13;
    const w0 = this.width, h0 = this.height;
    let ox = 0, oy = 0;
    if (a >= 1) { ox = -w0 * sx; oy = -h0 * sy; }
    else oy = -h0 * lerp(.12, .1, EASE(range([.06, .14], p))) * release;
    oy += h0 * .05 * smootherstep(.9, .98, p);
    if (Math.abs(ox) + Math.abs(oy) > .5) cam.setViewOffset(w0, h0, ox, oy, w0, h0); else cam.clearViewOffset();
  }

  /* ---------- loop ---------- */
  setProgress(p) { this.target = clamp(p); this.dirty = true; }

  start() {
    if (this.running) return;
    this.running = true; this.last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(.05, (now - this.last) / 1000); this.last = now;
      // library: halve the frame rate (the scene is a blurred backdrop)
      if (this.p > .985 && Math.abs(this.target - this.p) < 1e-4 && (this._skip = !this._skip)) return;
      if (!this.reduced) this.time += dt;
      else if (!this.dirty) return;
      // damped progress: any jump in scroll (scrollbar drag, End key, fast wheel) glides
      const d = this.target - this.p;
      if (this.reduced || Math.abs(d) < 1e-5) this.p = this.target;
      else this.p += d * (1 - Math.exp(-dt * CONFIG.damping));
      this.frame();
      this.adapt(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }

  frame() {
    this.update(this.p, this.time);
    this.renderer.render(this.scene, this.camera);
    this.dirty = false;
    if (this.onFrame) this.onFrame(this);
  }

  /** adaptive resolution: drop DPR on slow machines */
  adapt(dt) {
    if (!CONFIG.adaptive) return;
    this._acc = (this._acc || 0) + dt; this._n = (this._n || 0) + 1;
    if (this._n < 90) return;
    const avg = this._acc / this._n; this._acc = 0; this._n = 0;
    // still slow at minimum resolution: ask the UI to drop the costly SVG refraction
    if (avg > 1 / 30 && this.dpr <= CONFIG.dpr.min && !this._slowSent) { this._slowSent = true; window.dispatchEvent(new CustomEvent('cp:slow')); }
    if (avg > 1 / 40 && this.dpr > CONFIG.dpr.min) { this.dpr = Math.max(CONFIG.dpr.min, this.dpr - .25); this.renderer.setPixelRatio(this.dpr); this.resize(); this.frame(); }
  }

  /** screen positions of the era caption anchors (front of each stone base) + focus weight */
  anchors(out = []) {
    this.dioramas.forEach((d, i) => {
      const s = d.group.scale.x;
      _v.set(0, -.1, 1.08 * s).applyAxisAngle(_v2.set(0, 1, 0), d.group.rotation.y).add(d.group.position);
      _v.project(this.camera);
      out[i] = { x: (_v.x * .5 + .5) * this.width, y: (-_v.y * .5 + .5) * this.height, z: _v.z, e: d.group.visible ? (this.focus?.[i] || 0) : 0 };
    });
    return out;
  }

  resize() {
    const w = this.width = window.innerWidth, h = this.height = window.innerHeight;
    this.aspect = w / h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = this.aspect; this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  dispose() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('pointermove', this._onPointer);
    document.removeEventListener('visibilitychange', this._onVis);
    this.scene.traverse((o) => {
      o.geometry?.dispose();
      const m = o.material; (Array.isArray(m) ? m : m ? [m] : []).forEach((x) => x.dispose());
    });
    this.disposables.forEach((t) => t.dispose());
    this.envRT?.dispose();
    this.renderer.dispose();
  }
}

/** interpolate two affine matrices (position lerp, rotation slerp, scale lerp) */
const _pa = new THREE.Vector3(), _pb = new THREE.Vector3(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _sa = new THREE.Vector3(), _sb = new THREE.Vector3();
function blendMatrix(a, b, t, out = new THREE.Matrix4()) {
  a.decompose(_pa, _qa, _sa); b.decompose(_pb, _qb, _sb);
  _pa.lerp(_pb, t); _qa.slerp(_qb, t); _sa.lerp(_sb, t);
  return out.compose(_pa, _qa, _sa);
}
