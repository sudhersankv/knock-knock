import * as THREE from 'three';
import { PALETTE } from '../../../shared/kk/layout';

/*
  Shared world shading for Knock Knock.
  - Soft stylized lighting: MeshStandardMaterial, high roughness, no metal.
  - Hand-painted feel: low-frequency world-space noise breaks up flat colors; a faint
    vertical gradient darkens the base of every prop (cheap contact AO).
  - Per-side color restore: each half starts muted (desaturated toward a cool lilac grey)
    and regains saturation as locks open. Side is chosen by the sign of world x.
*/

export const ArtUniforms = {
  uRestoreA: { value: 0 },
  uRestoreB: { value: 0 },
  uMuteTint: { value: new THREE.Color(0x8a8798) },
  uTime: { value: 0 },
};

interface PatchOpts {
  /** paint noise + bottom darkening */
  paint?: boolean;
  /** participate in per-side restore */
  restore?: boolean;
  /** strength of the bottom-darkening (0 disables) */
  baseAO?: number;
}

export function patchWorld(m: THREE.Material, o: PatchOpts = {}) {
  const paint = o.paint ?? true;
  const restore = o.restore ?? true;
  const baseAO = o.baseAO ?? 0.35;
  m.customProgramCacheKey = () => `kk|${paint ? 1 : 0}|${restore ? 1 : 0}|${baseAO.toFixed(2)}`;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, ArtUniforms);
    shader.defines = shader.defines ?? {};
    if (paint) shader.defines.KK_PAINT = '';
    if (restore) shader.defines.KK_RESTORE = '';
    shader.defines.KK_BASEAO = baseAO.toFixed(3);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vKKWorld;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec4 kw = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            kw = instanceMatrix * kw;
          #endif
          vKKWorld = (modelMatrix * kw).xyz;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vKKWorld;
        uniform float uRestoreA, uRestoreB, uTime;
        uniform vec3 uMuteTint;
        float kkHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float kkNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(kkHash(i), kkHash(i + vec2(1,0)), u.x), mix(kkHash(i + vec2(0,1)), kkHash(i + vec2(1,1)), u.x), u.y);
        }
        `,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        #ifdef KK_PAINT
        {
          float n = kkNoise(vKKWorld.xz * 0.45 + vKKWorld.y * 0.3) * 0.6 + kkNoise(vKKWorld.xz * 1.7 + vKKWorld.y) * 0.4;
          diffuseColor.rgb *= 0.9 + 0.2 * n;
          // cool shift in the noise valleys, warm on peaks: painterly temperature variation
          diffuseColor.rgb += vec3(0.02, -0.005, -0.02) * (n - 0.5);
          float ao = mix(1.0 - KK_BASEAO, 1.0, smoothstep(0.0, 0.9, vKKWorld.y));
          diffuseColor.rgb *= ao;
        }
        #endif
        #ifdef KK_RESTORE
        {
          float r = vKKWorld.x < 0.0 ? uRestoreA : uRestoreB;
          vec3 c = diffuseColor.rgb;
          float l = dot(c, vec3(0.299, 0.587, 0.114));
          vec3 muted = mix(vec3(l), uMuteTint * (l * 1.35), 0.35);
          // muted world keeps ~45% of its saturation so it still reads as handcrafted
          diffuseColor.rgb = mix(mix(muted, c, 0.45), c, clamp(r, 0.0, 1.0));
        }
        #endif
        `,
      );
  };
  m.needsUpdate = true;
  return m;
}

/** The one opaque material for merged static world geometry (vertex colored). */
export function worldMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  return patchWorld(m) as THREE.MeshStandardMaterial;
}

/** Unlit glowing material for merged emissive bits (vertex colors may exceed 1 to feed bloom). */
export function glowMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: true });
}

/** Character material: not muted by restore, gentle paint. */
const charCache = new Map<string, THREE.MeshStandardMaterial>();
export function charMat(color: number, rough = 0.8): THREE.MeshStandardMaterial {
  const k = `${color}|${rough}`;
  const hit = charCache.get(k);
  if (hit) return hit;
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
  charCache.set(k, m);
  return m;
}
const glowCache = new Map<string, THREE.MeshBasicMaterial>();
export function glow(color: number, intensity = 2): THREE.MeshBasicMaterial {
  const k = `${color}|${intensity}`;
  const hit = glowCache.get(k);
  if (hit) return hit;
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), toneMapped: false });
  glowCache.set(k, m);
  return m;
}

export const COL = {
  ...PALETTE,
  stoneLight: 0x8c8a9c,
  stoneDark: 0x55546a,
  stoneWarm: 0x857a78,
  wood: 0x7a5540,
  woodDark: 0x553a2e,
  leafTeal: 0x2f8c7c,
  leafMoss: 0x5e8a4e,
  leafDeep: 0x2c5a50,
  water: 0x3fd0c9,
  brass: 0xc8964a,
  iron: 0x4a4a58,
  canvas: 0xd8c8a8,
  flowerPink: 0xff7aa8,
  flowerGold: 0xffc857,
};
