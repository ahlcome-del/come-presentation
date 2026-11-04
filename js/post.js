/**
 * Côme Presentation — cinematic grade pass.
 *
 * A transparent full-screen shader rendered over the 3D frame: a warm horizon
 * veil, a soft vignette and fine film grain. It deliberately does not sample the
 * scene (the vendored three.js build has no WebGLRenderTarget), so it is a grade,
 * not a bloom/aberration pass; the PBR, IBL, normal maps and the sky/water
 * shaders carry the photographic detail.
 *
 * Desktop / WebGL2 only. `?nofx` disables it; the scene falls back to a direct
 * render if the pass cannot be created.
 */
import * as THREE from './vendor/three.js';

const vert = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const frag = /* glsl */`
  precision highp float;
  uniform vec2 uRes;
  uniform float uTime;
  uniform float uGrain;
  varying vec2 vUv;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  void main() {
    vec2 p = vUv - .5;
    float edge = smoothstep(.18, .78, length(p) * 1.12);
    float vignette = edge * .16;

    // a low, warm veil around the horizon; cool, nearly black at the top
    float horizon = smoothstep(.04, .32, vUv.y) * (1. - smoothstep(.42, .78, vUv.y));
    vec3 tint = mix(vec3(.018, .014, .011), vec3(.11, .08, .045), horizon);
    float veil = horizon * .055;

    float grain = (hash(vUv * uRes + uTime) - .5) * uGrain;
    float a = clamp(vignette + veil + grain, 0., .24);

    gl_FragColor = vec4(tint, a);
  }
`;

export class CinematicPass {
  constructor(renderer, scene, camera, { reduced = false } = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.reduced = reduced;
    this.time = 0;
    this.enabled = true;

    this.uniforms = {
      uRes: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uGrain: { value: reduced ? 0 : .012 },
    };

    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: vert,
      fragmentShader: frag,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      toneMapped: false,
    });

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    // the overlay vertex shader writes clip space directly; the main camera is enough
    this.quadCamera = camera;
  }

  setSize(width, height, dpr) {
    const w = Math.max(1, Math.round(width * dpr));
    const h = Math.max(1, Math.round(height * dpr));
    this.uniforms.uRes.value.set(w, h);
  }

  render() {
    if (!this.enabled) { this.renderer.render(this.scene, this.camera); return; }
    if (!this.reduced) this.time += 1 / 60;
    this.uniforms.uTime.value = this.time;
    this.renderer.render(this.scene, this.camera);
    const clear = this.renderer.autoClear;
    this.renderer.autoClear = false;
    this.renderer.render(this.quadScene, this.quadCamera);
    this.renderer.autoClear = clear;
  }

  dispose() {
    this.material.dispose();
    this.quad.geometry.dispose();
  }
}
