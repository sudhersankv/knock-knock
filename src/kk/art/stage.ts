import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { Stage } from '../contracts';
import { PALETTE } from '../../../shared/kk/layout';
import { ArtQuality, ArtUniforms } from './mats';

/*
  Frame: RenderPass -> GTAO (half res, soft) -> bloom (high threshold: only emissives) -> grade/vignette -> output.
  Quality: ?q=low / ?ao=0 at load, or setQuality('high'|'low') at runtime.
*/
export type Quality = 'high' | 'low';
let applyQuality: ((q: Quality) => void) | null = null;
/** Switch quality at runtime (no reload). low = AO off, pixelRatio 1, 1024 shadows, MSAA on, fewer fireflies. */
export function setQuality(level: Quality) {
  ArtQuality.level = level;
  applyQuality?.(level);
}
export function getQuality(): Quality {
  return ArtQuality.level;
}

export function createStage(canvas: HTMLCanvasElement): Stage {
  const params = new URLSearchParams(location.search);
  const initial: Quality = params.get('q') === 'low' ? 'low' : 'high';

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.dusk);
  scene.fog = new THREE.Fog(PALETTE.dusk, 42, 95);

  const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.5, 260);
  camera.position.set(-22, 18, 0);
  camera.lookAt(-8, 0, 0);

  // ---- lighting: warm low key light + violet/moss hemisphere ----
  const hemi = new THREE.HemisphereLight(0x8f84c9, 0x4a5a3c, 1.35);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffd2a0, 2.6);
  key.position.set(-26, 34, 22);
  key.target.position.set(0, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera;
  sc.left = -40; sc.right = 40; sc.top = 32; sc.bottom = -32; sc.near = 5; sc.far = 110;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.04;
  key.shadow.radius = 4;
  scene.add(key, key.target);
  // cool rim from behind the wall so silhouettes separate from the ground
  const rim = new THREE.DirectionalLight(0x9d8cff, 0.55);
  rim.position.set(20, 14, -30);
  scene.add(rim);

  // ---- post ----
  const size = new THREE.Vector2();
  renderer.getDrawingBufferSize(size);
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 0 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  // AO pass is always constructed and toggled with .enabled so quality can change at runtime
  const gtao = new GTAOPass(scene, camera, Math.max(1, Math.floor(size.x / 2)), Math.max(1, Math.floor(size.y / 2)));
  gtao.output = GTAOPass.OUTPUT.Default;
  gtao.blendIntensity = 0.75;
  gtao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.4, thickness: 1.2, scale: 1.0, samples: 12 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 8 });
  composer.addPass(gtao);
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.55, 0.55, 0.92);
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  let lastW = canvas.clientWidth || innerWidth, lastH = canvas.clientHeight || innerHeight;
  function resize(w: number, h: number) {
    lastW = w;
    lastH = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    renderer.getDrawingBufferSize(size);
    gtao.setSize(Math.max(1, Math.floor(size.x / 2)), Math.max(1, Math.floor(size.y / 2)));
    bloom.setSize(size.x / 2, size.y / 2);
    grade.uniforms.uAspect.value = w / h;
  }

  applyQuality = (q: Quality) => {
    const low = q === 'low';
    gtao.enabled = !low && params.get('ao') !== '0';
    renderer.setPixelRatio(Math.min(devicePixelRatio, low ? 1 : 1.5));
    const sm = low ? 1024 : 2048;
    if (key.shadow.mapSize.x !== sm) {
      key.shadow.mapSize.set(sm, sm);
      key.shadow.map?.dispose();
      (key.shadow as { map: unknown }).map = null;
    }
    // MSAA only when AO is off (AO needs a resolvable depth)
    const samples = gtao.enabled ? 0 : 4;
    for (const t of [composer.renderTarget1, composer.renderTarget2]) {
      if (t.samples !== samples) {
        t.samples = samples;
        t.dispose();
      }
    }
    resize(lastW, lastH);
  };
  ArtQuality.level = initial;
  applyQuality(initial);

  return {
    renderer,
    scene,
    camera,
    resize,
    render(_dt: number, time: number) {
      ArtUniforms.uTime.value = time;
      grade.uniforms.uTime.value = time;
      composer.render();
    },
  };
}

const GradeShader = {
  name: 'KKGrade',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uAspect: { value: 1.6 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uAspect;
    varying vec2 vUv;
    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      // lift shadows toward violet, warm the highlights slightly
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, col + vec3(0.035, 0.02, 0.07), 1.0 - smoothstep(0.0, 0.35, l));
      col *= mix(vec3(1.0), vec3(1.04, 1.0, 0.95), smoothstep(0.5, 1.2, l));
      // gentle saturation punch
      col = mix(vec3(l), col, 1.08);
      // soft violet vignette
      vec2 v = (vUv - 0.5) * vec2(uAspect, 1.0);
      float vig = smoothstep(1.05, 0.35, length(v));
      col = mix(col * vec3(0.55, 0.5, 0.75), col, 0.35 + 0.65 * vig);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
