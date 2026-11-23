import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { TexturePass } from 'three/examples/jsm/postprocessing/TexturePass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { PAL } from './palette';

/** Objects on this layer are drawn but get no ink outline (particles, sky, glows, decals). */
export const LAYER_NO_OUTLINE = 2;

/*
  Frame pipeline
   1. scene        -> rtMain   (color + depth texture, MSAA)
   2. scene normals-> rtNormal (MeshNormalMaterial override, NO_OUTLINE layer hidden)
   3. ink pass:  Sobel on depth + normals => thick purple-black outlines, plus
                 grade (lift shadows to purple, punch saturation), speed lines, vignette
   4. bloom on neon only (high threshold)
   5. output (tone map + sRGB)
*/
export class Post {
  readonly rtMain: THREE.WebGLRenderTarget;
  readonly rtNormal: THREE.WebGLRenderTarget;
  readonly composer: EffectComposer;
  readonly ink: ShaderPass;
  readonly bloom: UnrealBloomPass;
  private normalMat = new THREE.MeshNormalMaterial();
  private size = new THREE.Vector2();

  /** 0..1, speed-line intensity, set by the game from player speed. */
  speed = 0;
  /** 0..1, flash white-ish on big events. */
  flash = 0;

  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene, private camera: THREE.PerspectiveCamera) {
    renderer.getDrawingBufferSize(this.size);
    const { x: w, y: h } = this.size;

    const depth = new THREE.DepthTexture(w, h);
    depth.type = THREE.FloatType;
    // NOTE: MSAA + depthTexture on the same target breaks depth testing in three r187,
    // so color gets MSAA (plain depth renderbuffer) and the outline source (normals) carries the depth texture.
    this.rtMain = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4, depthBuffer: true });
    this.rtNormal = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 0, depthBuffer: true, depthTexture: depth });

    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new TexturePass(this.rtMain.texture));

    this.ink = new ShaderPass(InkShader);
    this.ink.uniforms.tDepth.value = depth;
    this.ink.uniforms.tNormal.value = this.rtNormal.texture;
    this.composer.addPass(this.ink);

    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.75, 0.55, 1.05);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.setSize(window.innerWidth, window.innerHeight);
  }

  setSize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.renderer.getDrawingBufferSize(this.size);
    const { x, y } = this.size;
    this.rtMain.setSize(x, y);
    this.rtNormal.setSize(x, y);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.ink.uniforms.uResolution.value.set(x, y);
    // outline thickness in pixels, scaled a bit with resolution so 1440p still looks chunky
    this.ink.uniforms.uThickness.value = Math.max(1.0, y / 720);
  }

  render(time: number) {
    const r = this.renderer;
    const cam = this.camera;

    r.setRenderTarget(this.rtMain);
    r.render(this.scene, cam);

    // normal pass without outline-less layer and without fog/background
    const bg = this.scene.background;
    const fog = this.scene.fog;
    this.scene.background = null;
    this.scene.fog = null;
    this.scene.overrideMaterial = this.normalMat;
    cam.layers.disable(LAYER_NO_OUTLINE);
    r.setRenderTarget(this.rtNormal);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(this.scene, cam);
    cam.layers.enable(LAYER_NO_OUTLINE);
    this.scene.overrideMaterial = null;
    this.scene.background = bg;
    this.scene.fog = fog;
    r.setRenderTarget(null);

    const u = this.ink.uniforms;
    u.uNear.value = cam.near;
    u.uFar.value = cam.far;
    u.uTime.value = time;
    u.uSpeed.value = this.speed;
    u.uFlash.value = this.flash;
    this.composer.render();
  }
}

const InkShader = {
  name: 'RiotInk',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    tNormal: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uNear: { value: 0.1 },
    uFar: { value: 1000 },
    uThickness: { value: 1.5 },
    uInk: { value: new THREE.Color(PAL.ink) },
    uShadowTint: { value: new THREE.Color(0x3a1f6e) },
    uTime: { value: 0 },
    uSpeed: { value: 0 },
    uFlash: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform sampler2D tNormal;
    uniform vec2 uResolution;
    uniform float uNear, uFar, uThickness, uTime, uSpeed, uFlash;
    uniform vec3 uInk, uShadowTint;
    varying vec2 vUv;

    float linDepth(vec2 uv) {
      float z = texture2D(tDepth, uv).x;
      float ndc = z * 2.0 - 1.0;
      return (2.0 * uNear * uFar) / (uFar + uNear - ndc * (uFar - uNear));
    }
    vec3 nrm(vec2 uv) { return texture2D(tNormal, uv).xyz * 2.0 - 1.0; }

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

    void main() {
      vec2 px = uThickness / uResolution;
      float d0 = linDepth(vUv);
      vec3 n0 = nrm(vUv);
      float nAlpha = texture2D(tNormal, vUv).a;

      // depth edges: relative difference so far objects don't over-ink
      float dEdge = 0.0;
      float nEdge = 0.0;
      vec2 offs[8];
      offs[0] = vec2( 1, 0); offs[1] = vec2(-1, 0); offs[2] = vec2(0,  1); offs[3] = vec2(0, -1);
      offs[4] = vec2( 1, 1); offs[5] = vec2(-1, 1); offs[6] = vec2(1, -1); offs[7] = vec2(-1,-1);
      for (int i = 0; i < 8; i++) {
        vec2 uv = vUv + offs[i] * px;
        float d = linDepth(uv);
        dEdge = max(dEdge, (d - d0) / max(d0, 0.001));
        vec3 n = nrm(uv);
        float a = texture2D(tNormal, uv).a;
        nEdge = max(nEdge, (1.0 - dot(n, n0)) * a * nAlpha);
      }
      // silhouettes against sky (normal alpha 0 vs 1)
      float aEdge = 0.0;
      for (int i = 0; i < 4; i++) aEdge = max(aEdge, abs(texture2D(tNormal, vUv + offs[i] * px).a - nAlpha));

      float fade = 1.0 - smoothstep(60.0, 220.0, d0);        // thin out lines in the far distance
      float edge = smoothstep(0.06, 0.14, dEdge) + smoothstep(0.25, 0.45, nEdge) * fade + aEdge;
      edge = clamp(edge, 0.0, 1.0);

      vec3 col = texture2D(tDiffuse, vUv).rgb;

      // grade: push saturation, tint deep shadows purple instead of grey
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, 1.18);
      col = mix(col, col * 0.6 + uShadowTint * 0.4, (1.0 - smoothstep(0.0, 0.25, l)) * 0.55);

      // ink
      col = mix(col, uInk, edge * mix(1.0, 0.65, 1.0 - fade));

      // speed lines (radial streaks from screen centre)
      if (uSpeed > 0.01) {
        vec2 c = vUv - 0.5;
        c.x *= uResolution.x / uResolution.y;
        float ang = atan(c.y, c.x);
        float r = length(c);
        float streak = hash(vec2(floor(ang * 60.0), floor(uTime * 18.0)));
        float mask = step(0.82, streak) * smoothstep(0.28, 0.75, r);
        col = mix(col, vec3(1.0, 0.97, 0.92), mask * uSpeed * 0.55);
      }

      // vignette (purple, not black)
      vec2 v = vUv - 0.5;
      float vig = smoothstep(0.85, 0.25, length(v * vec2(1.1, 1.25)));
      col = mix(uShadowTint * 0.35, col, mix(0.55, 1.0, vig));

      col += vec3(uFlash);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
