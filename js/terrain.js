/**
 * Côme Presentation — terrain, distant ridges and sky (atmospheric perspective).
 *
 *  - terrainH(x, z): gentle value-noise relief. Flat along the road and under every era,
 *    rising softly into low hills further out. Props use the same function to sit on it.
 *  - three layers of far ridge silhouettes each side (+ one across the end of the road),
 *    each mixed further into the haze colour: layered depth, no blobs.
 *  - a sky dome with a soft horizon glow that follows the era (colours set per frame).
 */
import * as THREE from './vendor/three.js';

/* ---------------- noise ---------------- */
function hash(i, j) { let h = (i * 374761393 + j * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
const fade = (t) => t * t * (3 - 2 * t);
export function vnoise(x, y) {
  const i = Math.floor(x), j = Math.floor(y), fx = fade(x - i), fy = fade(y - j);
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
  return (a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy) * 2 - 1;
}
export function fbm(x, y, oct = 4) { let s = 0, a = .5, f = 1; for (let o = 0; o < oct; o++) { s += a * vnoise(x * f + o * 17.3, y * f - o * 9.1); f *= 2.03; a *= .5; } return s; }
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

let STATIONS = [], RIVER_Z = -25, LIB_Z = -56;
export function setStations(list) { STATIONS = list; if (list.length > 2) RIVER_Z = (list[1].z + list[2].z) / 2 + .6; if (list.length) LIB_Z = list[list.length - 1].z - 20; if (list.length > 2) { HARB.x = list[2].x - 4.15; HARB.z = list[2].z; } }
/** the sea beyond the Antiquity temple: a shallow bay the road turns away from */
export const COAST = { x: -9.4, z: -12.6, rx: 5.2, rz: 4.6 };
/** the harbour basin beside the Discoveries era (water below the quay) */
export const HARB = { x: -6.25, z: -29, rx: 2.05, rz: 2.7 };
export const inBasin = (x, z, m = 0) => Math.abs(x - HARB.x) < HARB.rx + m && Math.abs(z - HARB.z) < HARB.rz + m;
/** the river's centre line (crosses the road between eras II and III) */
export function riverZ(x) { return RIVER_Z + Math.sin(x * .32) * 1.0 + Math.sin(x * .13 + 1) * .8; }

/** height above the ground plane at (x, z) */
export function terrainH(x, z) {
  let dS = 99;
  for (const s of STATIONS) dS = Math.min(dS, Math.hypot(x - s.x, (z - s.z) * 1.1));
  const flat = sstep(3.0, 4.6, dS) * sstep(2.3, 3.3, Math.abs(x));      // 0 on the road and under the eras
  const ripple = .06 * (fbm(x * .55, z * .55, 3) + .35) * flat;
  const hills = sstep(4.2, 11, Math.abs(x)) * (0.55 + fbm(x * .09 + 3, z * .07, 4) * .9) * (.6 + .4 * sstep(4, 14, Math.abs(x)));
  const rm = sstep(.25, 1.1, Math.abs(z - riverZ(x)));                  // carve a shallow river valley
  const lib = sstep(0, 2.5, Math.max(Math.abs(x) - 5.2, z - (LIB_Z + 6.5), (LIB_Z - 4.2) - z));   // level ground under the library
  const hb = sstep(0, .25, Math.max(Math.abs(x - HARB.x) - HARB.rx, Math.abs(z - HARB.z) - HARB.rz));  // sharp quay edge
  const hb2 = sstep(0, 3, Math.max(Math.abs(x - HARB.x) - HARB.rx, Math.abs(z - HARB.z) - HARB.rz));  // hills ease off around it
  const cd = Math.max(Math.abs(x - COAST.x) - COAST.rx, Math.abs(z - COAST.z) - COAST.rz);
  const bayIn = 1 - sstep(0, 1.0, cd);                     // 1 in the water, 0 on land
  const beach = (1 - sstep(1.0, 3.2, cd)) * (1 - bayIn);    // a low sandy shelf just above the water
  const land = (((Math.max(0, hills * 2.6) * hb2 + ripple) * rm - .045 * (1 - rm)) * lib - .01 * (1 - lib)) * hb - .09 * (1 - hb);
  // the sea beyond the first era: water just below the road level, a beach shelf, then the land
  return lerp(land, -.075 + beach * .055, bayIn) ;
}

/* ---------------- ground mesh ---------------- */
export function buildTerrain({ groundY, material, mobile }) {
  const W = 44, L = 160, sx = mobile ? 60 : 88, sz = mobile ? 200 : 300;
  const g = new THREE.PlaneGeometry(W, L, sx, sz).rotateX(-Math.PI / 2).translate(0, 0, -45);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, groundY - .002 + terrainH(p.getX(i), p.getZ(i)));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, material);
  m.receiveShadow = false;
  return m;
}

/* ---------------- far ridges (custom haze shader) ---------------- */
const ridgeMat = (mix) => new THREE.ShaderMaterial({
  uniforms: { uHaze: { value: new THREE.Color() }, uDark: { value: new THREE.Color(0x0d0b09) }, uGlow: { value: new THREE.Color() }, uMix: { value: mix } },
  vertexShader: 'attribute float h; varying float vH; void main(){ vH = h; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
  fragmentShader: `uniform vec3 uHaze; uniform vec3 uDark; uniform vec3 uGlow; uniform float uMix; varying float vH;
    void main(){
      vec3 c = mix(uDark, uHaze, uMix);
      c = mix(c, uHaze, pow(1. - vH, 2.) * .55);              // valley mist at the foot of each ridge
      c += uGlow * .06 * vH * (1. - uMix);                    // faint rim of horizon light on crests
      gl_FragColor = vec4(c, 1.);
      #include <colorspace_fragment>
    }`,
  depthWrite: true, fog: false,
});

function ridgeStrip(points, bottom) {
  // points: [x, yTop, z]; a vertical curtain from `bottom` to yTop
  const pos = [], h = [], idx = [];
  points.forEach(([x, y, z], i) => {
    pos.push(x, bottom, z, x, y, z); h.push(0, 1);
    if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('h', new THREE.Float32BufferAttribute(h, 1));
  g.setIndex(idx);
  return g;
}

export function buildRidges({ groundY }) {
  const group = new THREE.Group(); group.name = 'ridges';
  const layers = [
    { d: 24, base: 2.2, amp: 2.6, f: .045, mix: .35 },
    { d: 36, base: 3.6, amp: 4.0, f: .03, mix: .58 },
    { d: 52, base: 5.5, amp: 6.0, f: .02, mix: .78 },
  ];
  const mats = [];
  layers.forEach((Lr, k) => {
    const mat = ridgeMat(Lr.mix); mats.push(mat);
    for (const side of [-1, 1]) {
      const pts = [];
      for (let z = 30; z >= -130; z -= 2) {
        const n = fbm(z * Lr.f + k * 11 + side * 5, k * 3.1, 4);
        pts.push([side * (Lr.d + fbm(z * .02, side + k, 2) * 4), groundY + Lr.base + n * Lr.amp + Math.abs(n) * 1.2, z]);
      }
      const m = new THREE.Mesh(ridgeStrip(pts, groundY - 3), mat);
      m.frustumCulled = false; m.renderOrder = -1; m.userData.layer = k;
      group.add(m);
    }
    // across the far end
    const pts = [];
    for (let x = -Lr.d - 6; x <= Lr.d + 6; x += 2) {
      const n = fbm(x * Lr.f + k * 7, 4.2 + k, 4);
      pts.push([x, groundY + Lr.base * .8 + n * Lr.amp * .8 + Math.abs(n), -96 - k * 14]);
    }
    const m = new THREE.Mesh(ridgeStrip(pts, groundY - 3), mat);
    m.frustumCulled = false; m.userData.layer = k; group.add(m);
  });
  group.userData.mats = mats;
  return group;
}

/* ---------------- sky dome with horizon glow ---------------- */
export function buildSky() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uHaze: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() }, uTop: { value: new THREE.Color() }, uDir: { value: new THREE.Vector3(0, 0, -1) } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.); gl_Position = p.xyww; }',
    fragmentShader: `uniform vec3 uHaze; uniform vec3 uGlow; uniform vec3 uTop; uniform vec3 uDir; varying vec3 vDir;
      void main(){
        float y = vDir.y;
        float ahead = pow(max(0., dot(normalize(vec3(vDir.x, 0., vDir.z)), uDir)), 3.);
        vec3 sky = mix(uGlow, uTop, smoothstep(.0, .42, y));
        sky = mix(sky, uGlow * 1.25, (1. - smoothstep(0., .16, y)) * ahead * .5);   // brighter where the road leads
        vec3 c = y < 0. ? mix(uHaze, uGlow, exp(y * 14.)) : sky;
        gl_FragColor = vec4(c, 1.);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), mat);
  m.renderOrder = -10; m.frustumCulled = false;
  return m;
}
