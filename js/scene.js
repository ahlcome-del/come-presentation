/**
 * Côme Presentation — 3D scene (three.js r169, single fixed canvas).
 *
 * ONE continuous journey. The whole scene is a pure function of a single
 * number p ∈ [0,1]; the render loop damps p towards the scroll target, so
 * any scroll jump glides instead of cutting. All objects are created in
 * init() — nothing is created or shown by callbacks.
 *
 *   0.00–0.046 the closed leather book floats, turns, the camera dollies in
 *   0.044–0.086 cover hinges open
 *   0.082–0.176 pages riffle: each sheet peels by its free edge and settles flat
 *               on the left stack (~150 vh of scroll on desktop: time to read)
 *   0.170–0.214 the open book lies back; the camera flies over it
 *   0.146–0.272 the five plates lift out of the fan, unfold into maps, and glide
 *               on ahead to their station
 *   0.280–0.844 five eras, 0.125 apart (≈ 200 vh of scroll each on desktop): the
 *               map settles, the diorama assembles out of it, opens (cutaway),
 *               re-seats, then the camera moves on
 *   0.872–1.00  the camera pulls back and enters the library
 */
import * as THREE from './vendor/three.js';
import { RoomEnvironment } from './vendor/three.js';
import { PLATES, generateMaps } from './maps.js';
import * as TX from './textures.js';
import { buildDiorama, makeMaterials } from './dioramas.js';
import { Props } from './props.js';
import { buildTerrain, buildRidges, buildSky, setStations } from './terrain.js';
import { buildLibrary } from './library3d.js';

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
  fog: { near: 5.5, far: 23 },
  dpr: { desktop: 2, mobile: 1.5, min: 1 },
  camera: { fov: 34 },
  parallax: { amount: .018, damping: .06 },
  adaptive: !/[?&]noadapt\b/.test(location.search),   // adaptive DPR (QA can disable)
  book: { glow: 0x241d16, restY: -.72, w: 1.3, h: 1.8, t: .3, cover: .032, pages: { desktop: 48, mobile: 24 }, segments: { desktop: 24, mobile: 12 } },
  maps: { desktop: [2048, 1418], mobile: [1280, 886] },
  // scroll ranges (progress units). Station i is closest to the camera at stations.first + i·step
  ranges: {
    turn: [.012, .046],          // book turns to face camera, dolly in
    cover: [.044, .086],         // cover hinge (with slight overshoot)
    riffle: [.082, .176],        // pages riffle one after another (~150 vh on desktop)
    recline: [.170, .214],       // the open book lies back; the camera flies over it
    bookGone: .30,
    detach: [.146, .194],        // map plates lift out of the fan…
    unfold: [.156, .192],        // …and unfold to double width
    plateStagger: .008,
    toStation: [.196, .240],     // each plate glides ahead to hover over its station
    settle: [-.070, -.044],      // …and lies down when the camera arrives (relative to station p)
    assemble: [-.040, -.004],    // the era rises out of its map (staged, bottom → top)
    explode: [-.006, .008, .016, .034],  // cutaway while the camera is closest
    stations: { first: .310, step: .125 },   // 200 vh of scroll between two eras on desktop
    library: [.872, .966],
  },
  world: {
    groundY: -1.6,
    stations: [[-2.1, -15], [2.1, -22], [-2.1, -29], [2.1, -36], [-2.1, -43]],
    plateScale: 1.05,
  },
  // the cloud of maps between the book and the first era: [x, y, z, rotY, rotZ, scale]
  cluster: {
    wide: [[1.6, .4, -2.6, -.36, .02, .6], [2.2, 1.4, -4.0, -.42, -.02, .64], [.62, -.15, -4.6, .08, .015, .6], [1.6, .1, -6.0, -.25, .02, .7], [-1.45, -.25, -6.8, .35, -.02, .7]],
    portrait: [[-.5, -.05, -2.6, .3, .02, .36], [.62, -.3, -3.7, -.3, -.02, .38], [-.35, -.85, -5.3, .1, .015, .4], [.55, -1.0, -6.1, -.2, .02, .42], [-.7, -1.35, -7.4, .24, -.02, .42]],
  },
  // fog / background / key-light tint per era (very close to the page colour: a mood, not a colour cast)
  atmos: [
    { fog: 0x46382a, glow: 0x93683f, top: 0x17120d, key: 0xffd9a8 },   // Antiquité: warm dusk over stone
    { fog: 0x3d382f, glow: 0x7a6b55, top: 0x141310, key: 0xffdfb6 },   // Moyen Âge: grey haze, warm low sun
    { fog: 0x333d3f, glow: 0x6a7d75, top: 0x111517, key: 0xe2e6e2 },   // Grandes découvertes: sea air
    { fog: 0x463527, glow: 0x93603a, top: 0x150f0b, key: 0xffcc96 },   // XIXe: soot & lamplight
    { fog: 0x403a32, glow: 0x83745e, top: 0x14120f, key: 0xf6ead6 },   // XXe: pale, electric
  ],
  damping: 4.2,                 // scene progress glides to the scroll target: 1 − e^(−dt·k)
};

/* ---------------- math helpers ---------------- */
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const range = (r, x) => clamp((x - r[0]) / (r[1] - r[0]));
const smooth = (t) => t * t * (3 - 2 * t);
const smoothstep01 = (a, b, x) => smooth(clamp((x - a) / (b - a)));
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
  constructor(canvas, { mobile = false, reduced = false, lite = false, onFrame = null } = {}) {
    this.canvas = canvas; this.mobile = mobile; this.reduced = reduced; this.lite = lite; this.onFrame = onFrame;
    this.guide = null;
    this.p = 0; this.target = 0; this.time = 0; this.running = false; this.dirty = true;
    this.mouse = new THREE.Vector2(); this.mouseT = new THREE.Vector2();
    this.disposables = [];
    this.dioramas = []; this.platesReady = false;
  }

  /* ---------- setup ---------- */
  async init(onProgress = () => {}) {
    const C = CONFIG;
    // A weak Windows GPU can refuse a WebGL2 high-performance context (or an antialiased
    // one) while still rendering fine without: try down the ladder instead of failing.
    const mk = (o) => new THREE.WebGLRenderer(Object.assign({ canvas: this.canvas, alpha: false }, o));
    let r = null;
    const tries = this.lite
      ? [{ antialias: false, powerPreference: 'low-power' }, { antialias: false, powerPreference: 'default' }]
      : [{ antialias: true, powerPreference: 'high-performance' }, { antialias: false, powerPreference: 'high-performance' },
         { antialias: false, powerPreference: 'default' }, { antialias: false, powerPreference: 'low-power' }];
    for (const o of tries) {
      try { r = mk(o); if (r.getContext()) break; } catch (e) { r = null; }
    }
    if (!r) throw new Error('WebGL context unavailable');
    this.renderer = r;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = C.lights.exposure;
    r.setClearColor(C.colors.bg, 1);
    // one soft shadow map, only around the era in view (desktop; dropped on slow machines)
    this.shadows = !this.mobile && !/[?&]noshadow/.test(location.search);
    if (this.shadows) { r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; }
    this.maxDpr = this.mobile ? C.dpr.mobile : C.dpr.desktop;
    const maxPx = this.mobile ? 2.4e6 : 3.6e6;                      // texture-memory guard (a weak GPU dies above this)
    const dprFit = Math.sqrt(maxPx / Math.max(1, innerWidth * innerHeight));
    this.dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, this.maxDpr, dprFit));
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
    if (this.shadows) {
      key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
      const sc = key.shadow.camera; sc.left = -2.1; sc.right = 2.1; sc.top = 2.1; sc.bottom = -2.1; sc.near = .5; sc.far = 16;
      key.shadow.bias = -.0006; key.shadow.normalBias = .015; key.shadow.radius = 3;
      scene.add(key.target);
    }
    this._keyOff = V3(-5, 4.6, 3.6).normalize().multiplyScalar(8);          // low, raking from the left: shadows fall across the base
    this.spill = new THREE.PointLight(C.colors.spill, 0, 4.5, 1.6);
    this.inner = new THREE.PointLight(C.colors.spill, 0, 2.2, 1.8);
    scene.add(this.spill, this.inner);

    this.camera = new THREE.PerspectiveCamera(C.camera.fov, 1, .08, 150);
    this.look = V3();

    // shared soft textures
    this.radialTex = this.tex(TX.makeRadial(256), false);
    this.shadowTex = this.tex(TX.makeRadial(256, 0, [[0, .85], [.45, .5], [1, 0]]), false);

    this.buildBook();
    onProgress(.6);
    this.buildPlates();
    this.buildScraps();
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
    // decide on shadows now, behind the loader: time a few frames at a busy era; a slow GPU
    // gets the shadow-free shaders compiled here, so nothing recompiles mid-journey
    if (this.shadows && !navigator.webdriver && !/[?&]noadapt/.test(location.search)) {
      const gl = this.renderer.getContext(), px = new Uint8Array(4), times = [];
      this.update(this.stationP(1), 0);
      for (let k = 0; k < 7; k++) {
        const t0 = performance.now();
        this.renderer.render(scene, this.camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        if (k > 1) times.push(performance.now() - t0);
        if (k === 3 && times[0] > 60 && times[1] > 60) break;    // clearly slow: don't keep the loader waiting
      }
      times.sort((a, b) => a - b);
      this.benchMs = times[Math.floor(times.length / 2)];
      if (this.benchMs > 19) {
        this.shadows = false; this.key.castShadow = false; this.renderer.shadowMap.enabled = false;
        scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
        this.renderer.compile(scene, this.camera); this.renderer.render(scene, this.camera);
        hidden.forEach((o) => (o.visible = false));
      }
    }
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
    // the ground: soft noise relief (flat under the road and the eras), engraved map texture
    setStations(this.stations.map((st) => st.pos));
    const gtex = this.tex(TX.makeGroundMap(this.mobile ? 512 : 1024));
    gtex.wrapS = gtex.wrapT = THREE.RepeatWrapping; gtex.repeat.set(4.4, 16);
    const ground = buildTerrain({ groundY: G, mobile: this.mobile,
      material: new THREE.MeshStandardMaterial({ map: gtex, bumpMap: gtex, bumpScale: 1.2, color: 0x9a8a72, roughness: 1, metalness: 0, envMapIntensity: .2 }) });
    // far ridges + sky dome: layered silhouettes fading into the era's haze
    this.ridges = buildRidges({ groundY: G }); this.scene.add(this.ridges);
    this.sky = buildSky(); this.scene.add(this.sky);
    this.worldGround = ground; this.scene.add(ground);

    // dashed route linking the book to every station (flat ribbon on the ground)
    const pts = [V3(0, G, 2), V3(0, G, -6), ...this.stations.map((s) => s.pos.clone().add(V3(-Math.sign(s.pos.x) * 1.35, 0, 0))), V3(0, G, this.stations[this.stations.length - 1].pos.z - 15)];
    const curve = this.routeCurve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const mkRibbon = (w, rep) => {
      const n = 400, pos = [], uv = [], idx = [];
      for (let i = 0; i <= n; i++) {
        const u = i / n, p = curve.getPointAt(u), tg = curve.getTangentAt(u);
        const nx = -tg.z, nz = tg.x, l = Math.hypot(nx, nz) || 1;
        pos.push(p.x + nx / l * w, 0, p.z + nz / l * w, p.x - nx / l * w, 0, p.z - nz / l * w);
        uv.push(u * rep, 0, u * rep, 1);
        if (i < n) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
      return g;
    };
    const roadTex = this.tex(TX.makeRoad()); roadTex.wrapS = THREE.RepeatWrapping;
    this.road = new THREE.Mesh(mkRibbon(.14, 260), new THREE.MeshBasicMaterial({ map: roadTex, color: 0xe0cfb0, transparent: true, opacity: .26, depthWrite: false, fog: true }));
    this.road.position.y = G + .003; this.road.renderOrder = 1; this.scene.add(this.road);
    const n = 400, w = .012, pos = [], uv = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n, p = curve.getPointAt(u), tg = curve.getTangentAt(u);
      const nx = -tg.z, nz = tg.x, l = Math.hypot(nx, nz) || 1;
      pos.push(p.x + nx / l * w, G + .004, p.z + nz / l * w, p.x - nx / l * w, G + .004, p.z - nz / l * w);
      uv.push(u * 180, 0, u * 180, 1);
    }
    const idx = [];
    for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    rg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    rg.setIndex(idx);
    const dash = this.tex(TX.makeDash(), false); dash.wrapS = THREE.RepeatWrapping;
    this.route = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ map: dash, color: 0x5a4a38, transparent: true, opacity: .55, depthWrite: false }));
    this.route.renderOrder = 1;
    this.scene.add(this.route);

    // soft contact shadow under each station (on the map sheet)
    this.stationShadows = this.stations.map((s) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 2.9), new THREE.MeshBasicMaterial({ map: this.shadowTex, color: 0x000000, transparent: true, opacity: 0, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.copy(s.pos).y += .008; m.renderOrder = 2;
      this.scene.add(m); return m;
    });

    // a soft pool of warm light on the ground under each era (museum spotlight, additive)
    this.stationPools = this.stations.map((st, i) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 5.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: this.radialTex, color: CONFIG.atmos[i].key, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.position.copy(st.pos).y += .012; m.renderOrder = 2; this.scene.add(m); return m;
    });
    // all five dioramas, built now (a few ms each) — never created during scroll
    const M = this.dioMats = makeMaterials();
    this.dioramas = this.stations.map((s, i) => {
      const b = buildDiorama(i, M, this.shadowTex);
      b.station = s;
      // roofs & tops: a short, elegant lift with a slight fade (the cutaway reads as intentional)
      for (const it of b.parts) if (it.dir.y > .2) { it.lift = true; it.obj.material = it.obj.material.clone(); it.obj.material.transparent = true; }
      b.group.position.copy(s.pos).y += .05;
      b.group.visible = false;
      this.scene.add(b.group);
      return b;
    });
    this.assembleVals = this.dioramas.map(() => 0);
    if (this.shadows) {
      for (const d of this.dioramas) d.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      ground.receiveShadow = true;
      (this.plates || []).forEach((pl) => pl.grp.traverse((o) => { if (o.isMesh) o.receiveShadow = true; }));
    }

    // props & landscape (instanced) + smoke columns
    const smokeTex = this.tex(TX.makeSmoke(), true, false);
    const props = this.props = new Props({ M, stations: this.stations.map((s) => s.pos), groundY: G, shadowTex: this.shadowTex, smokeTex, route: curve, mobile: this.mobile });
    this.scene.add(props.group);
    const ind = this.dioramas[3];
    const local = (d, x, y, z) => (out) => { d.group.updateMatrixWorld(); return out.set(x, y, z).applyMatrix4(d.group.matrixWorld); };
    props.addSmoke(local(ind, -.62, 1.2, -.32), { n: 8, rise: 1.5, size: .75, opacity: .34, visible: () => this.assembleVals[3] });
    props.addSmoke(local(ind, .04, .44, .58), { n: 5, rise: .6, size: .32, opacity: .26, drift: .5, visible: () => this.assembleVals[3] });
    // the library at the end of the road
    this.libraryZ = this.stations[this.stations.length - 1].pos.z - 20;
    this.library = buildLibrary({ M, radialTex: this.radialTex, mobile: this.mobile, origin: V3(0, G, this.libraryZ) });
    this.scene.add(this.library);
    (props.villages || []).forEach((v) => props.addSmoke((out) => out.set(v.x + .1, v.y + .32, v.z), { n: 4, rise: .7, size: .35, opacity: .18 }));
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

  /** a handful of torn parchment scraps that trail the plates through the maps flight */
  buildScraps() {
    const mat = new THREE.MeshStandardMaterial({ map: this.parchTex, roughness: .96, side: THREE.DoubleSide, emissive: 0x2a1a0e, emissiveIntensity: .18, envMapIntensity: .3 });
    this.scraps = [];
    const r = (i) => ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
    for (let i = 0; i < 7; i++) {
      const w = .18 + r(i + 1) * .22, h = .14 + r(i + 7) * .2;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 2, 2), mat);
      m.rotation.set(r(i + 3) * .8 - .4, r(i + 5) * 6.28, r(i + 9) * .6 - .3);
      m.visible = false; this.scene.add(m);
      this.scraps.push({ m, ph: r(i + 11) * 6.28, sp: .6 + r(i + 13) * .9, rad: .5 + r(i + 17) * 1.2, hgt: .5 + r(i + 19) * .9 });
    }
  }

  /** generate the antique maps (async, idle slices) and swap them onto the plates */
  async loadMaps() {
    let [w, h] = this.mobile ? CONFIG.maps.mobile : CONFIG.maps.desktop;
    if (this.lite) { w = Math.min(w, 1024); h = Math.round(w * 1418 / 2048); }   // weak GPU: half-size maps
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

  /* riffle schedule ------------------------------------------------------
     A sheet is in the air for `dur` units; sheet i starts `gap[i]` after the
     previous one. The gaps are uneven — a hand turning paper is never
     metronomic — but each stays inside (.92 … 1.16) < dur = 1.18, so exactly
     one sheet is turning most of the time, two for a moment at the hand-over,
     never three and never a lull with the book frozen mid-riffle.
     Only every `stride`-th sheet is animated (half of them on desktop): the
     skipped ones are invisible and their thickness is carried by their
     neighbour, so the stacks still add up to the full block. That keeps one
     turn on screen long enough to read as paper rather than a blur, and halves
     the draw calls. Built once, from a fixed formula. */
  makeRiffleSchedule() {
    const N = this.N, stride = this.mobile ? 2 : 4, plates = new Set(this.plateIdx);
    const idx = [], isPlate = [], w = [];
    for (let i = 0; i < N; i++) if (plates.has(i) || i % stride === 0) { idx.push(i); isPlate.push(plates.has(i)); w.push(0); }
    const nNorm = isPlate.filter((x) => !x).length || 1;
    const wNorm = (N - this.plateIdx.length) / nNorm;              // pages a moving sheet stands for
    isPlate.forEach((pl, k) => { w[k] = pl ? 1 : wNorm; });
    const n = idx.length, dur = 1.18, start = new Array(n), gap = new Array(n);
    let t = 0;
    for (let k = 0; k < n; k++) {
      start[k] = t;
      // irregular but bounded: ±12 % around one gap, two incommensurate sines
      gap[k] = clamp(1.04 + .075 * Math.sin(k * 1.7 + .4) + .045 * Math.sin(k * .53 + 1.1), .90, 1.17);
      t += gap[k];
    }
    return { idx, isPlate, w, start, dur, total: start[n - 1] + dur, n, landZ: null };
  }

  /** where each sheet comes to rest: on the free face of the left stack AS IT WAS just
      before that sheet arrived (the stack only grows afterwards, so the sheet is never
      inside it). The left stack rides on the opened cover, so in the book's own frame
      its free face sits at +ct/2 + (leaves already down)·dz. */
  fillLandZ() {
    const sch = this.riffleSchedule, dz = this.blockT / this.N, ct = CONFIG.book.cover;
    let cum = 0;
    sch.landZ = new Array(sch.n);
    sch.landAt = new Array(sch.n);
    for (let q = 0; q < sch.n; q++) {
      if (sch.isPlate[q]) { sch.landZ[q] = 0; sch.landAt[q] = 0; continue; }   // a plate never joins the stack
      sch.landAt[q] = cum;                                            // leaves down before this one
      cum += sch.w[q];
      // the sheet comes to rest on the pile as it is before this sheet joins it, a hair
      // clear of the top; the pile then thickens by this one sheet's worth (a couple of
      // pages: invisible), so no sheet is ever left floating above the stack
      // the pile stands on the opened cover, so its top face is ct/2 + leaves·dz in the
      // book's frame (blockT/2 would float the sheet a couple of centimetres above it)
      sch.landZ[q] = ct / 2 + sch.landAt[q] * dz + .0018;
    }
    return sch.landZ;
  }

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
    root.rotation.set(lerp(lerp(.12 + Math.sin(t * .31) * .025 * idle, -.32, turn), -Math.PI / 2 + .08, recline), lerp(heroRotY, 0, turn) - .3 * turn * (1 - smooth(clamp(range(R.cover, p) * 1.6))), lerp(-.05, 0, turn));
    root.visible = p < R.bookGone;
    // a soft warm halo behind the book: its silhouette reads against the dusk
    if (!this.bookHalo) {
      this.bookHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.radialTex, color: 0xd08a4a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      this.bookHalo.scale.set(4.2, 4.2, 1); this.scene.add(this.bookHalo);
    }
    this.bookHalo.position.set(.1, .05 + floatY, -.8);
    this.bookHalo.material.opacity = .3 * (1 - smootherstep(.09, .145, p)) * (.75 + .25 * turn);
    this.bookHalo.visible = this.bookHalo.material.opacity > .002;

    /* cover hinge: 0 → 160° with slight overshoot (stays on the spine pivot) */
    const cv = range(R.cover, p);
    const coverPhi = THREE.MathUtils.degToRad(180) * clamp(backOut(cv, .9), 0, 1.055);
    this.frontPivot.rotation.y = -coverPhi;
    this.bookInner.position.x = lerp(-W / 2, -.04, smooth(clamp(cv * 1.15)));

    /* riffle: pages turn one after another, curling as they go.
       The schedule is built once (see makeRiffleSchedule): uneven gaps, each page
       in the air a little longer than one gap, so one sheet is turning almost all
       the time and two only at the hand-over. Every page follows the same
       lift → swing → settle curve, and both stacks grow continuously (no step when
       a sheet lands: a sheet only counts once it is lying flat). */
    const N = this.N;
    const sch = this.riffleSchedule || (this.riffleSchedule = this.makeRiffleSchedule());
    const n = sch.n, rr = range(R.riffle, p) * sch.total;
    const dz = this.blockT / N;
    const fan = [34, 58, 82, 106, 130].map((d) => THREE.MathUtils.degToRad(d));
    const st = this.pageState || (this.pageState = []);
    let nL = 0, nP = 0;
    for (let k = 0; k < n; k++) {
      const i = sch.idx[k], f = clamp((rr - sch.start[k]) / sch.dur);
      st[i] = f;
      if (sch.isPlate[k]) nP += sch.w[k] * f;                        // plates vacate their slot
      // the stack rises a beat after the sheet: the descent (g, below) is already
      // underway, so at no point does the stack top catch up with a sheet still in flight
      else nL += sch.w[k] * smootherstep(.80, 1, f);
    }
    const thickR = Math.max(.0012, (N - nL - nP) * dz), thickL = Math.max(.0006, nL * dz);
    sch.landZ || this.fillLandZ();
    this.rightBlock.scale.z = thickR;
    this.rightBlock.position.set(.01 + this.pw / 2, 0, -T / 2 + ct + thickR / 2);
    this.leftBlock.scale.z = thickL; this.leftBlock.visible = thickL > .0015;
    this.leftBlock.position.set(.01 + this.pw / 2, 0, -ct / 2 - thickL / 2);
    const zTopR = -T / 2 + ct + thickR;
    _v.set(0, 0, -ct / 2 - thickL).applyAxisAngle(_v2.set(0, 1, 0), -coverPhi).add(this.frontPivot.position);
    const lhx = _v.x, lhz = _v.z;
    root.updateMatrixWorld(true);
    for (let q = 0; q < n; q++) {
      const i = sch.idx[q], f = st[i];
      const k = sch.isPlate[q] ? this.plateIdx.indexOf(i) : -1;
      if (k >= 0) {                                   // the five plates stop in a fan
        _m.makeRotationY(-fan[k] * EASE(f)).setPosition(0, 0, zTopR + .003 + k * .001);
        this.plates[k].fan.multiplyMatrices(this.bookInner.matrixWorld, _m);
        this.plates[k].fanF = f;
        continue;
      }
      const m = this.pages[i];
      m.visible = root.visible && f > 0 && f < .988;   // from .988 on the block itself carries it
      if (!m.visible) continue;
      // rotation: accelerate out of the hand, decelerate into the stack — zero speed
      // at both ends, so the lift never snaps and the landing never knocks
      const e = smootherstep(0, .84, f);
      // descent: the hinge stays on the right-hand stack while the sheet is still
      // standing and only travels across as the sheet comes flat — the same curve as
      // the stack growth, so a sheet always rests exactly on the leaves beneath it
      const g = smootherstep(.30, .90, f);
      // the free edge leads: the sheet bows up strongly as it peels (peak in the first
      // third of the swing) and is dead flat when it comes down on the stack
      const bow = Math.sin(Math.PI * Math.pow(f, .55)) * (1 - .35 * e);
      m.material.userData.u.uTheta.value = coverPhi * e;
      m.material.userData.u.uK.value = (.95 * bow) / this.pw;
      m.position.set(lerp(0, lhx, g), 0, lerp(zTopR + .0015 + (q % 3) * .0011, sch.landZ[q], g));
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
    this.updateScraps(p, t);
    this.updateDioramas(p, t);
    // the era's surroundings (figures, trees, carts…) gather a little before the building itself,
    // so the approach to every era is never an empty sheet
    const pre = this._pre || (this._pre = []);
    this.assembleVals.forEach((a, i) => { const sp = this.stationP(i); pre[i] = Math.max(a, smootherstep(sp - (i > 0 ? .1 : .085), sp - .03, p)); });
    this.props.update(p, t, pre);
    this.library.visible = p > .70;                                          // fully fogged before that
    this.library.userData.setInside(smootherstep(.945, .975, p));
    this.library.userData.flicker(t, smootherstep(.79, .85, p));
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
  updateScraps(p, t) {
    if (!this.scraps) return;
    const on = smoothstep01(.198, .235, p) * (1 - smoothstep01(.30, .355, p));
    const idle = this.reduced ? 0 : 1;
    for (const q of this.scraps) {
      q.m.visible = on > .01;
      if (!q.m.visible) continue;
      const u = t * .25 * q.sp + q.ph;
      q.m.position.set(Math.sin(u) * q.rad, 1.05 + Math.sin(u * 1.7 + q.ph) * q.hgt * .35, -4 - p * 18 + Math.cos(u * .8) * q.rad * 1.3);
      q.m.rotation.x = (idle ? Math.sin(u * 1.3) * .5 : .2) + .3;
      q.m.rotation.y += (idle ? .012 * q.sp : 0);
      q.m.rotation.z = Math.sin(u * 1.1) * .4;
      q.m.material.opacity = 1;
      q.m.scale.setScalar(.8 + .2 * Math.sin(u * .9));
      if (!q.m.material.transparent) { q.m.material = q.m.material.clone(); q.m.material.transparent = true; }
      q.m.material.opacity = on * .85;
    }
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
      // later eras land and start building right after the previous station, so the next
      // era is already well up as the camera comes round to it (never an empty sheet)
      const settle = EASE_IO(range(k > 0 ? [sp - .096, sp - .072] : [sp + R.settle[0], sp + R.settle[1]], p));
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
        if (go < 1) M.elements[13] += Math.sin(Math.PI * go) * .45;     // a low glide, kept in frame
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
      const a = range(i > 0 ? [sp - .078, sp - .016] : [sp + R.assemble[0], sp + R.assemble[1]], p);  // 0..1 staged assembly
      this.assembleVals[i] = a;
      d.group.visible = a > 0.001;
      this.stationShadows[i].material.opacity = .7 * smooth(clamp((a - .15) / .15));
      this.stationPools[i].material.opacity = .11 * smooth(clamp(a / .4)); this.stationPools[i].visible = a > .001;
      // cutaway: roof lifts, walls slide apart while the camera is closest
      const e = smootherstep(sp + R.explode[0], sp + R.explode[1], p) * (1 - smootherstep(sp + R.explode[2], sp + R.explode[3], p));
      d.explode = e;
      focus[i] = smootherstep(sp - .03, sp - .008, p) * (1 - smootherstep(sp + .012, sp + .034, p));
      if (!d.group.visible) return;
      // the stone base rises out of the map first…
      const a0 = EASE(clamp(a / .22));
      d.group.scale.setScalar(1);
      d.group.position.copy(d.station.pos);
      d.group.position.y += lerp(-.13, .05, a0) + (this.reduced ? 0 : Math.sin(t * .55 + i * 1.3) * .006);
      d.group.rotation.y = -Math.sign(d.station.pos.x) * .38 + (this.reduced ? 0 : Math.sin(t * .18 + i) * .06);
      // …then every piece follows, bottom → top, rising on a short arc from below the map
      for (const it of d.items) {
        const aj = clamp((a - .12 - it.order * .5) / .38);
        const k = aj >= 1 ? 1 : 1 - Math.pow(1 - aj, 3);
        it.obj.visible = aj > 0;
        if (!it.obj.visible) continue;
        const off = 1 - k;
        it.obj.position.copy(it.base).addScaledVector(it.dir, e * (it.lift ? .34 : .8));
        if (it.lift) it.obj.material.opacity = 1 - .32 * e;
        if (off > 0) {
          const bx = it.base.x, bz = it.base.z, l = Math.hypot(bx, bz) || 1;
          it.obj.position.x += bx / l * .22 * off;
          it.obj.position.z += bz / l * .22 * off;
          it.obj.position.y += -.55 * off + Math.sin(Math.PI * k) * .06;
        }
        if (it.tilt) it.obj.rotation.z = it.tilt * e;
        if (it.tiltX) it.obj.rotation.x = it.tiltX * e;
      }
      for (const fn of d.animators) fn(this.reduced ? 3 : t, a);          // reduced motion: a still pose
      if (e > interiorBest) {
        interiorBest = e;
        _v.copy(d.interior).applyAxisAngle(_v2.set(0, 1, 0), d.group.rotation.y).add(d.group.position);
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
    const into = smootherstep(.24, sp0 - .03, p);                           // from the dark study into the open landscape
    const mixC = (key, out) => out.setHex(a[key]).lerp(_c1.setHex(b[key]), f);
    const haze = this._haze || (this._haze = new THREE.Color()), glow = this._glow || (this._glow = new THREE.Color()), top = this._top || (this._top = new THREE.Color());
    mixC('fog', haze).lerp(_c1.setHex(C.colors.bg), 1 - into);
    mixC('glow', glow).lerp(_c1.setHex(C.book.glow), 1 - into);
    mixC('top', top).lerp(_c1.setHex(C.colors.bg), 1 - into);
    this.scene.fog.color.copy(haze); this.scene.background.copy(haze);
    const dark = this._dark || (this._dark = new THREE.Color()); dark.copy(haze).multiplyScalar(.5);
    const su = this.sky.material.uniforms;
    su.uHaze.value.copy(haze); su.uGlow.value.copy(glow); su.uTop.value.copy(top);
    this.camera.getWorldDirection(su.uDir.value); su.uDir.value.y = 0; su.uDir.value.normalize();
    this.sky.position.copy(this.camera.position);
    for (const m of this.ridges.userData.mats) { m.uniforms.uHaze.value.copy(haze); m.uniforms.uGlow.value.copy(glow); m.uniforms.uDark.value.copy(dark); }
    // parallax of the haze layers: the far ridges slide against the near ones as the camera
    // moves (and a touch with the pointer), so the distance reads as air, not a backdrop
    if (this.ridges) {
      const par = -this.camera.position.x * .022 + this.mouse.x * .06;
      const bob = (this.camera.position.y - CONFIG.world.groundY) * -.014 + this.mouse.y * .025;
      for (const m of this.ridges.children) {
        const f = [1.6, 1, .5][m.userData.layer] || .5;      // far layers drift least
        m.position.x = par * f; m.position.y = bob * f;
      }
    }
    this.ridges.visible = into > .01;
    this.key.color.setHex(a.key).lerp(_c1.setHex(b.key), f).lerp(_c1.setHex(C.colors.key), 1 - into);
    // the key light (and its shadow frustum) follows the era in view
    if (this.shadows) {
      const S = this.stations[clamp(Math.round((p - sp0) / step), 0, this.stations.length - 1)].pos;
      _v.set(0, 0, 0).lerp(S, into);
      this.key.target.position.copy(_v); this.key.position.copy(_v).add(this._keyOff);
    }
    const lib = smootherstep(C.ranges.library[0], C.ranges.library[1], p);
    this.scene.fog.near = lerp(C.fog.near, 9, lib);
    this.scene.fog.far = lerp(C.fog.far, 34, lib);
    if (lib > 0) {
      this.scene.fog.color.lerp(_c1.setHex(0x1c140f), lib); this.scene.background.copy(this.scene.fog.color);
      this.key.color.lerp(_c1.setHex(0xffc58e), lib);
    }
  }

  /* ---------- camera: one CatmullRom spline for position, one for target ---------- */
  buildCameraPath() {
    const st = this.stations, G = CONFIG.world.groundY;
    const wide = this.aspect >= .95;
    const keys = [];
    const K = (p, pos, look) => keys.push({ p, pos, look });
    // book
    K(0, V3(0, .3, 6.5), V3(0, 0, 0));
    K(.020, V3(0, .38, 6.1), V3(0, 0, 0));
    K(.095, V3(0, 1.9, 7.6), V3(0, -.12, 0));      // cover open, pages riffle
    K(.180, V3(0, 1.8, 7.0), V3(0, -.12, 0));      // last page down
    // over the reclining open book, into the cloud of maps
    K(.215, V3(0, 2.25, 4.0), V3(0, .25, -2.6));
    K(.245, V3(.3, 1.5, 1.2), V3(.75, .45, -5));
    K(.262, V3(.35, 1.05, -1.6), V3(.4, .5, -8));
    K(.274, V3(0, .45, -6.4), V3(st[0].pos.x * .5, G + .9, st[0].pos.z));
    // stations
    st.forEach((s, i) => {
      const sp = this.stationP(i), S = s.pos, sg = Math.sign(S.x);
      const nxt = st[i + 1] ? st[i + 1].pos : V3(0, G, S.z - 9);
      // portrait, harbour: lean the approach towards the quay so the frame is never a bare disc
      const hl = !wide && i === 2 ? 1.5 : 0;
      K(sp - .03, V3(S.x * .2 - hl * .6, G + 2.05, S.z + 5.3), V3(S.x - hl, G + .5, S.z));
      if (i === 1) K(sp, wide ? V3(S.x * .62, G + 1.5, S.z + 2.85) : V3(S.x * .55, G + 1.78, S.z + 3.55), V3(S.x, G + .42, S.z - .05));   // castle: closer, centred
      else K(sp, V3(S.x * .35, G + 1.62, S.z + 3.15), V3(S.x, G + .4, S.z - .05));
      K(sp + .02, V3(-S.x * .25, G + 2.1, S.z + 3.1), V3(lerp(S.x, nxt.x, .8), G + .45, lerp(S.z, nxt.z, .8)));
      // en route: already well on the way, looking at the next era as it rises
      if (st[i + 1]) K(sp + .045, V3(lerp(S.x, nxt.x, .62) * .3, G + 2.05, nxt.z + 4.35), V3(lerp(S.x, nxt.x, .95), G + .48, lerp(S.z, nxt.z, .95)));
    });
    // library: down the last stretch of road and in through the open end of the room
    const LZ = st[st.length - 1].pos.z - 20;
    K(.9, V3(.25, G + 1.9, LZ + 11.5), V3(0, G + 1.45, LZ));
    K(.955, V3(0, G + 1.62, LZ + 4.6), V3(0, G + 1.5, LZ - 1));               // at the foot of the steps, the doorway framed
    K(1, V3(0, G + 1.66, LZ + 1.7), V3(0, G + 1.5, LZ - 3));                 // through the door, inside
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
    // cinematic settle: as the camera arrives at an era it eases in a little, holds, and a
    // barely-there drift + roll keeps the frame alive (no handheld wobble)
    const near = this.focus ? Math.max(0, ...this.focus) : 0;
    const idle = this.reduced ? 0 : 1;
    if (near > .001) {
      const d2 = pos.distanceTo(look);
      pos.sub(look).multiplyScalar(1 - .045 * near * near).add(look);                    // a gentle push-in on arrival
      pos.y += (.03 * near + Math.sin(t * .37) * .012 * near * idle);
      pos.x += Math.sin(t * .27 + 1.3) * .02 * near * idle;
    }
    cam.position.copy(pos);
    cam.lookAt(look);
    // a whisper of roll (pointer-led, plus a slow breathing turn)
    const roll = (this.mouse.x * .012 + (idle ? Math.sin(t * .19) * .006 : 0)) * (1 - smootherstep(.88, .96, p));
    if (Math.abs(roll) > 1e-5) cam.rotateZ(roll);

    // frame the subject away from the headlines (hero / opening), then centre
    const release = 1 - EASE(range([.205, .268], p));
    const sx = lerp(.2, .17, EASE(range([.03, .085], p))) * release;
    const sy = smooth(range([.05, .10], p)) * release * .13;
    const w0 = this.width, h0 = this.height;
    let ox = 0, oy = 0;
    if (a >= 1) { ox = -w0 * sx; oy = -h0 * sy; }
    else oy = -h0 * lerp(.12, .1, EASE(range([.03, .085], p))) * release;
    oy += h0 * .05 * smootherstep(.9, .98, p);
    if (Math.abs(ox) + Math.abs(oy) > .5) cam.setViewOffset(w0, h0, ox, oy, w0, h0); else cam.clearViewOffset();
  }

  /* ---------- loop ---------- */
  setProgress(p) { this.target = clamp(p); this.dirty = true; }

  /** Optional per-frame target guide (raw scroll target, current p, now) → target. */
  setGuide(fn) { this.guide = fn || null; }

  start() {
    if (this.running) return;
    this.running = true; this.last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(.05, (now - this.last) / 1000); this.last = now;
      // library: halve the frame rate (the scene is a blurred backdrop)
      if (!this.reduced && this.p > .985 && Math.abs(this.target - this.p) < 1e-4 && (this._skip = !this._skip)) return;
      if (!this.reduced) this.time += dt;
      // reduced: no idle clock, but the loop must keep running until p has actually
      // reached the target — otherwise progress freezes one frame after each scroll
      else if (!this.dirty && Math.abs(this.target - this.p) < 1e-5) return;
      // damped progress: any jump in scroll (scrollbar drag, End key, fast wheel) glides.
      // The optional guide lands on each era first when the raw target runs ahead.
      const target = this.guide ? this.guide(this.target, this.p, now) : this.target;
      const d = target - this.p;
      // reduced motion: same damped follow, just a shorter lag (no hard cuts — a jump
      // straight to the target on every wheel tick reads as a stutter, not as calm)
      if (Math.abs(d) < 1e-5) this.p = target;
      else this.p += d * (1 - Math.exp(-dt * (this.reduced ? 11 : CONFIG.damping)));
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
