/**
 * Côme Presentation — 3D scene (three.js r169, single fixed canvas).
 *
 * The whole scene is a pure function of one number: progress p ∈ [0,1]
 * (driven by the GSAP master timeline / ScrollTrigger scrub in main.js).
 *
 *   0.00–0.12  HERO       closed leather book floating, slowly turning
 *   0.12–0.30  OPENING    book faces us, cover hinges 160°, pages riffle
 *   0.30–0.52  MAPS       5 pages detach and unfold into antique map plates
 *   0.52–0.82  DIORAMAS   plates fold & fly to 5 era dioramas; camera glides on an arc
 *   0.82–1.00  LIBRARY    camera pulls back; scene becomes a calm, blurred backdrop
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
  fog: { near: 9, far: 27 },
  dpr: { desktop: 2, mobile: 1.5, min: 1 },
  camera: { fov: 32 },
  parallax: { amount: .018, damping: .06 },
  adaptive: !/[?&]noadapt\b/.test(location.search),   // adaptive DPR (QA can disable)
  book: { w: 1.3, h: 1.8, t: .3, cover: .032, pages: { desktop: 48, mobile: 24 }, segments: { desktop: 24, mobile: 12 } },
  maps: { desktop: [2048, 1418], mobile: [1280, 886] },
  ranges: {
    hero: [0, .12],
    turn: [.12, .205],          // book turns to face camera, dolly in
    cover: [.15, .225],         // cover hinge (with slight overshoot)
    riffle: [.19, .30],         // pages riffle one after another
    detach: [.30, .37],         // plates leave the spine
    unfold: [.335, .405],       // plates unfold to double width
    mapsDrift: [.39, .52],
    bookExit: [.3, .365],
    fold: [.52, .55],
    toBase: [.525, .585],
    rise: [.545, .605],
    visits: { first: .585, step: .0525, count: 5 },  // diorama visit centres
    library: [.82, .95],
  },
  arc: { radius: 9, step: .42, camDist: 5.25, camH: 1.85, lookH: .42 },
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
    this.spill = new THREE.PointLight(C.colors.spill, 0, 4.5, 1.6);
    this.inner = new THREE.PointLight(C.colors.spill, 0, 2.2, 1.8);
    scene.add(this.spill, this.inner);

    this.camera = new THREE.PerspectiveCamera(C.camera.fov, 1, .1, 60);
    this.look = V3();

    // shared soft textures
    this.radialTex = this.tex(TX.makeRadial(256), false);
    this.shadowTex = this.tex(TX.makeRadial(256, 0, [[0, .85], [.45, .5], [1, 0]]), false);

    this.buildBook();
    onProgress(.6);
    this.buildPlates();
    this.buildGround();
    onProgress(.85);

    this.resize();
    window.addEventListener('resize', this._onResize = () => this.resize(), { passive: true });
    if (!this.reduced && matchMedia('(pointer: fine)').matches) {
      window.addEventListener('pointermove', this._onPointer = (e) => {
        this.mouseT.set((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1));
      }, { passive: true });
    }
    document.addEventListener('visibilitychange', this._onVis = () => (document.hidden ? this.stop() : this.start()));
    this.renderer.compile(scene, this.camera);
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

  /* ---------- ground disc + soft contact shadow under the book ---------- */
  buildGround() {
    const g = new THREE.Mesh(new THREE.CircleGeometry(5.5, 64), new THREE.MeshBasicMaterial({ map: this.radialTex, color: CONFIG.colors.ground, transparent: true, opacity: .55, depthWrite: false }));
    g.rotation.x = -Math.PI / 2; g.position.y = -1.6;
    const s = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.2), new THREE.MeshBasicMaterial({ map: this.shadowTex, color: 0x000000, transparent: true, opacity: .6, depthWrite: false }));
    s.rotation.x = -Math.PI / 2; s.position.y = -1.59;
    this.ground = g; this.groundShadow = s;
    this.scene.add(g, s);
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
      // face +z (group 4) uses vertices 16..19
      for (let i = 16; i < 20; i++) uv.setX(i, u0 + uv.getX(i) * .5);
      return g;
    };
    this.plates = PLATES.map((spec, k) => {
      const front = new THREE.MeshStandardMaterial({ map: this.parchTex, roughness: .93, color: 0xcdc5b6, envMapIntensity: .35, emissive: 0x3a2412, emissiveIntensity: .1 });
      this.plateFront.push(front);
      const grp = new THREE.Group(); grp.matrixAutoUpdate = false; grp.visible = false;
      const A = new THREE.Mesh(half(0), [edge, edge, edge, edge, front, back]);
      const hinge = new THREE.Group(); hinge.position.set(pw, 0, -.006);
      const Bm = new THREE.Mesh(half(.5), [edge, edge, edge, edge, front, back]);
      hinge.add(Bm); grp.add(A, hinge);
      this.scene.add(grp);
      return { grp, hinge, spec };
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

  /* ---------- dioramas (lazy) ---------- */
  ensureDioramas() {
    if (this.dioramas.length) return;
    const M = this.dioMats = makeMaterials();
    const A = CONFIG.arc;
    this.arcCenter = V3(0, -.1, -A.radius);
    for (let i = 0; i < 5; i++) {
      const b = buildDiorama(i, M, this.shadowTex);
      const a = (i - 2) * A.step;
      const pos = this.arcPoint(a, A.radius, 0);
      b.angle = a; b.home = pos; b.group.position.copy(pos); b.group.rotation.y = a;
      b.group.scale.setScalar(.001); b.group.visible = false;
      this.scene.add(b.group);
      this.dioramas.push(b);
    }
    this.renderer.compile(this.scene, this.camera);
  }

  arcPoint(a, radius, y, out = V3()) {
    const c = this.arcCenter || V3(0, -.1, -CONFIG.arc.radius);
    return out.set(c.x + Math.sin(a) * radius, c.y + y, c.z + Math.cos(a) * radius);
  }

  /* =======================================================================
     update(p): everything below is a deterministic function of progress
     ======================================================================= */
  update(p, t) {
    const R = CONFIG.ranges, B = CONFIG.book;
    const W = B.w, T = B.t, ct = B.cover;
    const idle = this.reduced ? 0 : 1;

    /* ----- book pose ----- */
    const turn = EASE(range(R.turn, p));
    const exit = EASE_IO(range(R.bookExit, p));
    const root = this.bookRoot;
    const showBook = p < .37;
    root.visible = showBook;
    if (showBook) {
      const heroRotY = .5 + Math.sin(t * .22) * .1 * idle - p * .9;
      root.position.set(0, Math.sin(t * .7) * .045 * idle * (1 - turn * .7), 0);
      root.rotation.set(lerp(.12 + Math.sin(t * .31) * .025 * idle, -.32, turn), lerp(heroRotY, 0, turn), lerp(-.05, 0, turn));
      // exit: sink, recede, tilt away
      root.position.y += -4.2 * exit; root.position.z += -3.5 * exit;
      root.rotation.x += -.9 * exit;
      root.scale.setScalar(1 - .5 * exit);

      /* cover hinge: 0 -> 160° with slight overshoot */
      const cv = range(R.cover, p);
      const coverPhi = THREE.MathUtils.degToRad(160) * clamp(backOut(cv, .9), 0, 1.04);
      this.frontPivot.rotation.y = -coverPhi;
      this.bookInner.position.x = lerp(-W / 2, -.04, smooth(clamp(cv * 1.15)));

      /* riffle */
      const N = this.N, K = this.mobile ? 5 : 8;
      const rr = range(R.riffle, p) * (N + K);
      let lifted = 0, landed = 0;
      const dz = this.blockT / N;
      const fan = [34, 58, 82, 106, 130].map((d) => THREE.MathUtils.degToRad(d));
      this.pageState = [];
      for (let i = 0; i < N; i++) {
        const f = clamp((rr - i) / K);
        if (f > 0) lifted++;
        const isPlate = this.plateIdx.indexOf(i);
        if (isPlate < 0 && f >= 1) landed++;
        this.pageState[i] = f;
      }
      const thickR = Math.max(.002, (N - lifted) * dz), thickL = Math.max(.0001, landed * dz);
      this.rightBlock.scale.z = thickR;
      this.rightBlock.position.set(.01 + this.pw / 2, 0, -T / 2 + ct + thickR / 2);
      this.leftBlock.scale.z = thickL; this.leftBlock.visible = landed > 0;
      this.leftBlock.position.set(.01 + this.pw / 2, 0, -ct / 2 - thickL / 2);
      const zTopR = -T / 2 + ct + thickR;
      // left top hinge (in bookInner space)
      _v.set(.0, 0, -ct / 2 - thickL).applyAxisAngle(_v2.set(0, 1, 0), -coverPhi).add(this.frontPivot.position);
      const leftHinge = _v.clone();

      for (let i = 0; i < N; i++) {
        const f = this.pageState[i], e = EASE_IO(f);
        const plateK = this.plateIdx.indexOf(i);
        if (plateK >= 0) {                                  // plates stop in a fan
          const th = fan[plateK] * EASE(f);
          this.fanPose(plateK, zTopR, th, f);
          continue;
        }
        const m = this.pages[i];
        m.visible = f > 0 && f < 1;
        if (!m.visible) continue;
        const theta = coverPhi * e;
        const curl = -1.25 * Math.sin(Math.PI * e) * (1 - .3 * e);
        m.material.userData.u.uTheta.value = theta;
        m.material.userData.u.uK.value = curl / this.pw;
        m.position.set(lerp(0, leftHinge.x, e), 0, lerp(zTopR + .002, leftHinge.z, e));
      }

      /* light spilling from the opening */
      const spill = smootherstep(.175, .235, p) * (1 - smootherstep(.31, .37, p));
      this.glow.material.opacity = spill * .14;
      this.glow.getWorldPosition(this.spill.position);
      this.spill.position.z += .5;
      this.spill.intensity = spill * 2.2;
    } else {
      this.spill.intensity = 0;
      this.plates.forEach((pl, k) => this.fanPose(k, 0, Math.PI / 2, 1)); // keep matrices valid
    }

    /* ground disc */
    const gF = 1 - smootherstep(.3, .4, p);
    this.ground.visible = this.groundShadow.visible = gF > 0;
    this.ground.material.opacity = .5 * gF;
    this.groundShadow.material.opacity = .55 * gF * (1 - turn * .4);
    this.groundShadow.position.x = root.position.x;

    /* ----- plates: fan -> exploded maps -> dioramas ----- */
    this.updatePlates(p, t);

    /* ----- dioramas ----- */
    if (p > .44 && !this.dioramas.length) this.ensureDioramas();
    if (this.dioramas.length) this.updateDioramas(p, t);

    /* ----- camera ----- */
    this.updateCamera(p, t);
  }

  /** world matrix of plate k while still hinged to the spine (fan) */
  fanPose(k, zTop, theta, f) {
    const pl = this.plates[k];
    if (!pl.fan) pl.fan = new THREE.Matrix4();
    this.bookRoot.updateMatrixWorld(true);
    _m.makeRotationY(-theta).setPosition(0, 0, zTop + .003 + k * .001);
    pl.fan.multiplyMatrices(this.bookInner.matrixWorld, _m);
    pl.fanVisible = f > 0;
  }

  plateLayout() {
    const portrait = this.aspect < .95;
    // [x, y, z, rotY, rotZ, scale] — unfolded plate is 2·pw × ph
    return portrait ? [
      // portrait: headline on top, plates stacked in a loose column below
      [-.4, .12, -.9, .16, -.03, .33], [.42, -.5, -.5, -.14, .02, .33], [-.02, -1.16, .35, 0, 0, .41],
      [-.4, -1.82, -.4, .12, .02, .33], [.4, -2.36, -.8, -.12, -.02, .33],
    ] : [
      // asymmetric: the headline owns the top-left, plates gather centre-right
      [-1.95, -1.0, -.75, .2, .02, .5], [2.4, .78, -1.05, -.22, -.02, .52], [.55, -.22, .5, -.04, 0, .68],
      [.95, 1.16, -1.5, -.06, .015, .44], [2.5, -1.12, -.65, -.2, .02, .5],
    ];
  }

  updatePlates(p, t) {
    const R = CONFIG.ranges, pw = this.pw;
    const L = this.plateLayout();
    this.plates.forEach((pl, k) => {
      const o = k * .008;
      const d = EASE(range([R.detach[0] + o, R.detach[1] + o], p));
      const u = EASE(range([R.unfold[0] + o, R.unfold[1] + o], p));
      const fold = EASE(range([R.fold[0] + o * .5, R.fold[1] + o * .5], p));
      const fly = EASE(range([R.toBase[0] + o, R.toBase[1] + o], p));
      const gone = smootherstep(R.rise[0] + k * .01 + .02, R.rise[0] + k * .01 + .05, p);
      const visible = (pl.fanVisible || d > 0) && gone < 1 && p > R.riffle[0];
      pl.grp.visible = visible;
      if (!visible) return;
      pl.hinge.rotation.y = Math.PI * (1 - u + fold) * (u > 0 || fold > 0 ? 1 : 1);
      if (u <= 0 && fold <= 0) pl.hinge.rotation.y = Math.PI;

      // exploded "maps" pose
      const [x, y, z, ry, rz, s] = L[k];
      const drift = smootherstep(R.mapsDrift[0], R.mapsDrift[1], p);
      const fl = this.reduced ? 0 : 1;
      const mx = x * (1 + .07 * drift), my = y * (1 + .05 * drift) + Math.sin(t * .6 + k * 1.7) * .03 * fl, mz = z + Math.sin(t * .45 + k) * .02 * fl;
      _q.setFromEuler(_e.set(Math.sin(t * .4 + k) * .015 * fl, ry * (1 - .25 * drift), rz));
      _s.setScalar(s);
      _v.set(mx, my, mz).sub(_v2.set(pw, 0, 0).multiplyScalar(s).applyQuaternion(_q));   // centre unfolded plate
      const mapsM = new THREE.Matrix4().compose(_v.clone(), _q.clone(), _s.clone());

      let M;
      if (d < 1 && pl.fan) M = blendMatrix(pl.fan, mapsM, d);
      else M = mapsM;

      if (fly > 0 && this.dioramas.length) {
        const dio = this.dioramas[k];
        const top = dio.group.position;
        _q2.setFromEuler(_e.set(-Math.PI / 2, dio.angle, 0, 'YXZ'));
        const sc = .5 * (1 - gone);
        _s2.setScalar(Math.max(sc, .001));
        _v.set(top.x, top.y + .08 + .4 * (1 - fly), top.z).sub(_v2.set(pw / 2, 0, 0).multiplyScalar(sc).applyQuaternion(_q2));
        const baseM = new THREE.Matrix4().compose(_v.clone(), _q2.clone(), _s2.clone());
        M = blendMatrix(M, baseM, fly);
      }
      pl.grp.matrix.copy(M);
      pl.grp.matrixWorldNeedsUpdate = true;
    });
  }

  updateDioramas(p, t) {
    const R = CONFIG.ranges, Vv = R.visits;
    const lib = EASE(range(R.library, p));
    let interiorBest = 0;
    this.dioramas.forEach((d, i) => {
      const rise = EASE(range([R.rise[0] + i * .01, R.rise[1] + i * .01], p));
      d.group.visible = rise > 0.001;
      if (!d.group.visible) return;
      const c = Vv.first + i * Vv.step;
      const e = smootherstep(c - .03, c - .009, p) * (1 - smootherstep(c + .009, c + .03, p));
      d.explode = e;
      const s = Math.max(.001, backOut(rise, .6)) * lerp(1, .78, lib);
      d.group.scale.setScalar(s);
      const bob = this.reduced ? 0 : Math.sin(t * .55 + i * 1.3) * .03;
      d.group.position.copy(d.home);
      d.group.position.y += bob - (1 - rise) * .6 + lib * .3;
      // drift back in the library
      d.group.position.x += Math.sin(d.angle) * lib * 1.2;
      d.group.position.z += Math.cos(d.angle) * lib * 1.2 - lib * 1.5;
      d.group.rotation.y = d.angle + (this.reduced ? 0 : Math.sin(t * .18 + i) * .12) + e * .18 + lib * .3;
      for (const pt of d.parts) {
        pt.obj.position.copy(pt.base).addScaledVector(pt.dir, e);
        if (pt.tilt) pt.obj.rotation.z = pt.tilt * e;
        if (pt.tiltX) pt.obj.rotation.x = pt.tiltX * e;
      }
      if (!this.reduced || e > 0) for (const a of d.animators) a(t);
      if (e > interiorBest) {
        interiorBest = e;
        _v.copy(d.interior).multiplyScalar(s); _v.applyAxisAngle(_v2.set(0, 1, 0), d.group.rotation.y).add(d.group.position);
        this.inner.position.copy(_v);
      }
    });
    this.inner.intensity = interiorBest * 2.2;
  }

  /* ---------- camera keyframes ---------- */
  camKey(name, out) {
    const a = this.aspect;
    const fitWide = (need) => Math.pow(clamp(need / a, 1, 2.6), .92);
    switch (name) {
      case 'hero': out.pos.set(0, .3, 6.5); out.look.set(0, 0, 0); out.fit = fitWide(.72); break;
      case 'heroPush': out.pos.set(0, .38, 6.1); out.look.set(0, 0, 0); out.fit = fitWide(.72); break;
      case 'open': out.pos.set(0, 1.9, 7.6); out.look.set(0, -.12, 0); out.fit = fitWide(this.aspect < .95 ? .85 : 1.25); break;
      case 'openPush': out.pos.set(0, 1.75, 7.1); out.look.set(0, -.1, 0); out.fit = fitWide(this.aspect < .95 ? .85 : 1.25); break;
      case 'mapsA': out.pos.set(0, .05, 6.4); out.look.set(0, 0, 0); out.fit = fitWide(this.aspect < .95 ? .62 : 1.55); break;
      case 'mapsB': out.pos.set(0, -.02, 5.6); out.look.set(0, -.02, 0); out.fit = fitWide(this.aspect < .95 ? .62 : 1.55); break;
      case 'lib': out.pos.set(0, 5.4, 10.5); out.look.set(0, -.4, -4.2); out.fit = fitWide(1.3); break;
      default: break;
    }
    return out;
  }
  arcCam(angle, out) {
    const A = CONFIG.arc;
    this.arcPoint(angle, A.radius + A.camDist, A.camH, out.pos);
    this.arcPoint(angle, A.radius, A.lookH, out.look);
    out.fit = Math.pow(clamp(.85 / this.aspect, 1, 2.2), .9);
    return out;
  }

  updateCamera(p, t) {
    const R = CONFIG.ranges, Vv = R.visits, A = CONFIG.arc;
    const k0 = this._k0 || (this._k0 = { pos: V3(), look: V3(), fit: 1 });
    const k1 = this._k1 || (this._k1 = { pos: V3(), look: V3(), fit: 1 });
    let w = 0;
    const arcAngle = (pp) => {
      const first = (0 - 2) * A.step;
      if (pp <= Vv.first) return first;
      const kk = (pp - Vv.first) / Vv.step;
      if (kk >= Vv.count - 1) return (Vv.count - 1 - 2) * A.step;
      const i = Math.floor(kk), f = kk - i;
      return (i - 2) * A.step + A.step * smootherstep(.2, .8, f);
    };
    if (p < .12) { this.camKey('hero', k0); this.camKey('heroPush', k1); w = p / .12; }
    else if (p < .21) { this.camKey('heroPush', k0); this.camKey('open', k1); w = EASE(range([.12, .21], p)); }
    else if (p < .30) { this.camKey('open', k0); this.camKey('openPush', k1); w = smooth(range([.21, .30], p)); }
    else if (p < .39) { this.camKey('openPush', k0); this.camKey('mapsA', k1); w = EASE_IO(range([.30, .39], p)); }
    else if (p < .52) { this.camKey('mapsA', k0); this.camKey('mapsB', k1); w = smooth(range([.39, .52], p)); }
    else if (p < Vv.first) { this.camKey('mapsB', k0); this.arcCam(arcAngle(0), k1); w = EASE_IO(range([.52, Vv.first], p)); }
    else if (p < R.library[0]) { this.arcCam(arcAngle(p), k0); k1.pos.copy(k0.pos); k1.look.copy(k0.look); k1.fit = k0.fit; w = 0; }
    else { this.arcCam(arcAngle(1), k0); this.camKey('lib', k1); w = EASE_IO(range(R.library, p)); }

    const cam = this.camera;
    const look = _v.lerpVectors(k0.look, k1.look, w);
    const pos = _v2.lerpVectors(k0.pos, k1.pos, w);
    const fit = lerp(k0.fit, k1.fit, w);
    pos.sub(look).multiplyScalar(fit).add(look);

    // pointer parallax (1–2%)
    const P = CONFIG.parallax;
    this.mouse.lerp(this.mouseT, P.damping);
    const dist = pos.distanceTo(look);
    pos.x += this.mouse.x * P.amount * dist * 2.2;
    pos.y += this.mouse.y * P.amount * dist * 1.4;
    cam.position.copy(pos);
    cam.lookAt(look);

    // hero framing: shift the subject right (desktop) or down (portrait) to leave room for the headline
    // hero: subject right; opening: subject right + lower (headline top-left); centred from .31
    const release = 1 - EASE(range([.255, .315], p));
    const sx = p < .2 ? lerp(.2, .17, EASE(range([.1, .2], p))) : .17 * release;
    const sy = smooth(range([.12, .2], p)) * release * .13;
    const libShift = EASE(range([.86, .97], p));
    const w0 = this.width, h0 = this.height;
    let ox = 0, oy = 0;
    if (this.aspect >= 1) { ox = -w0 * sx; oy = -h0 * sy; }
    else oy = -h0 * (p < .2 ? lerp(.12, .1, EASE(range([.1, .2], p))) : .1 * release);
    oy += h0 * .06 * libShift;
    if (ox || oy) cam.setViewOffset(w0, h0, ox, oy, w0, h0); else cam.clearViewOffset();
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
      if (this.p > .97 && (this._skip = !this._skip)) return;
      if (!this.reduced) this.time += dt;
      else if (!this.dirty) return;
      this.p = this.target;
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

  /** screen positions of the diorama caption anchors (front of each stone base) */
  anchors(out = []) {
    const A = CONFIG.arc;
    this.dioramas.forEach((d, i) => {
      const s = d.group.scale.x;
      _v.set(0, -.08, 1.05 * s).applyAxisAngle(_v2.set(0, 1, 0), d.angle).add(d.group.position);
      _v.project(this.camera);
      out[i] = { x: (_v.x * .5 + .5) * this.width, y: (-_v.y * .5 + .5) * this.height, z: _v.z, e: d.explode || 0 };
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
function blendMatrix(a, b, t) {
  a.decompose(_pa, _qa, _sa); b.decompose(_pb, _qb, _sb);
  _pa.lerp(_pb, t); _qa.slerp(_qb, t); _sa.lerp(_sb, t);
  return new THREE.Matrix4().compose(_pa, _qa, _sa);
}
