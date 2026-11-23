import * as THREE from 'three';
import { PAL } from './palette';

/*
  Toon material: the single shading model for the whole game.

  On top of three's MeshToonMaterial (hard 3-band lighting) it adds:
   - a crisp rim light on the sun side (that "comic" back-light edge)
   - halftone dots inside the core shadow band
   - COLOR RESTORE: world materials start desaturated toward BLANDCO beige and
     get their color back inside the radius of nearby graffiti tags, with a
     glowing paint "wavefront" ring as the radius grows.

  Outlines are not done here: they are a screen-space post pass (see post.ts),
  so they work for every mesh, instanced or not.
*/

export const MAX_TAG_LIGHTS = 32;

/** Uniforms shared by every toon material. Mutate .value, never replace the objects. */
export const WorldUniforms = {
  uTime: { value: 0 },
  uSunDirView: { value: new THREE.Vector3(0, 1, 0) },
  uRimColor: { value: new THREE.Color(PAL.rim) },
  uTags: { value: Array.from({ length: MAX_TAG_LIGHTS }, () => new THREE.Vector4(0, -9999, 0, 0)) },
  uTagCount: { value: 0 },
  /** 0 = city fully beige, 1 = fully colored everywhere. */
  uRestoreBase: { value: 0.0 },
  uBeige: { value: new THREE.Color(PAL.blandBeige) },
  uDotScale: { value: 5.0 },
};

let gradientMap: THREE.DataTexture | null = null;
function toonRamp(): THREE.DataTexture {
  if (gradientMap) return gradientMap;
  // 3 bands: shadow / mid / lit. Values tuned so the shadow band picks up the lavender hemi fill.
  const data = new Uint8Array([105, 105, 105, 255, 190, 190, 190, 255, 255, 255, 255, 255]);
  gradientMap = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.generateMipmaps = false;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

export interface ToonOptions {
  map?: THREE.Texture | null;
  emissive?: number;
  emissiveIntensity?: number;
  emissiveMap?: THREE.Texture | null;
  /** Skip the beige/restore effect (characters, graffiti, UI-ish props). */
  alwaysColor?: boolean;
  /** Rim light strength, 0 disables. */
  rim?: number;
  /** Halftone dots in shadow band. */
  halftone?: boolean;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  vertexColors?: boolean;
  alphaTest?: number;
  flatShading?: boolean;
}

const cache = new Map<string, THREE.MeshToonMaterial>();

/** Cached toon material. Same args return the same material instance (keeps draw-call state changes low). */
export function toon(color: number, opts: ToonOptions = {}): THREE.MeshToonMaterial {
  const cacheable = !opts.map && !opts.emissiveMap && !opts.transparent;
  const key = cacheable ? `${color}|${JSON.stringify(opts)}` : '';
  if (cacheable) {
    const hit = cache.get(key);
    if (hit) return hit;
  }
  const m = new THREE.MeshToonMaterial({
    color,
    gradientMap: toonRamp(),
    map: opts.map ?? null,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    emissiveMap: opts.emissiveMap ?? null,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
    vertexColors: opts.vertexColors ?? false,
    alphaTest: opts.alphaTest ?? 0,
  });
  patchToon(m, {
    alwaysColor: opts.alwaysColor ?? false,
    rim: opts.rim ?? 0.55,
    halftone: opts.halftone ?? true,
  });
  if (cacheable) cache.set(key, m);
  return m;
}

/** Glowing, unlit material for neon / screens / lamps. Feeds the bloom pass. */
export function neon(color: number, intensity = 2.2): THREE.MeshBasicMaterial {
  const key = `neon|${color}|${intensity}`;
  const hit = basicCache.get(key);
  if (hit) return hit;
  const c = new THREE.Color(color).multiplyScalar(intensity);
  const m = new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
  basicCache.set(key, m);
  return m;
}
const basicCache = new Map<string, THREE.MeshBasicMaterial>();

interface PatchFlags {
  alwaysColor: boolean;
  rim: number;
  halftone: boolean;
}

/** Apply the COLOR RIOT shading patch to any MeshToonMaterial (e.g. one loaded from a GLB). */
export function patchToon(m: THREE.MeshToonMaterial, flags: PatchFlags) {
  m.customProgramCacheKey = () => `riot|${flags.alwaysColor ? 1 : 0}|${flags.rim > 0 ? 1 : 0}|${flags.halftone ? 1 : 0}`;
  m.userData.riot = flags;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, WorldUniforms, { uRim: { value: flags.rim } });

    shader.defines = shader.defines ?? {};
    if (!flags.alwaysColor) shader.defines.RIOT_RESTORE = '';
    if (flags.rim > 0) shader.defines.RIOT_RIM = '';
    if (flags.halftone) shader.defines.RIOT_HALFTONE = '';
    shader.defines.MAX_TAG_LIGHTS = String(MAX_TAG_LIGHTS);

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRiotWorld;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec4 rw = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            rw = instanceMatrix * rw;
          #endif
          vRiotWorld = (modelMatrix * rw).xyz;
        }`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vRiotWorld;
        uniform float uTime;
        uniform vec3 uSunDirView;
        uniform vec3 uRimColor;
        uniform float uRim;
        uniform vec4 uTags[MAX_TAG_LIGHTS];
        uniform int uTagCount;
        uniform float uRestoreBase;
        uniform vec3 uBeige;
        uniform float uDotScale;
        float riotRing = 0.0;
        vec3 riotRingColor = vec3(0.0);
        `,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        #ifdef RIOT_RESTORE
        {
          float restore = uRestoreBase;
          for (int i = 0; i < MAX_TAG_LIGHTS; i++) {
            if (i >= uTagCount) break;
            vec4 tg = uTags[i];
            float d = distance(vRiotWorld, tg.xyz);
            float r = tg.w;
            restore = max(restore, 1.0 - smoothstep(r * 0.82, r, d));
            // bright wavefront ring while the radius is still growing
            float ring = (1.0 - smoothstep(0.0, 0.9, abs(d - r))) * step(0.5, r);
            riotRing = max(riotRing, ring);
          }
          vec3 c = diffuseColor.rgb;
          float l = dot(c, vec3(0.299, 0.587, 0.114));
          // BLANDCO beige: keep value structure so shapes still read, kill hue
          vec3 bland = uBeige * (0.42 + 0.78 * l);
          diffuseColor.rgb = mix(bland, c, clamp(restore, 0.0, 1.0));
          riotRingColor = c;
        }
        #endif
        `,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
          vec3 nrm = normalize(normal);
          vec3 vdir = normalize(vViewPosition);
          float ndl = dot(nrm, uSunDirView);
          #ifdef RIOT_HALFTONE
          {
            // screen-space rotated dot grid, dots grow deeper into shadow
            float s = 0.7071;
            vec2 p = mat2(s, -s, s, s) * gl_FragCoord.xy / uDotScale;
            float d = length(fract(p) - 0.5);
            float depth = clamp((0.05 - ndl) * 1.6, 0.0, 1.0);
            float dotMask = 1.0 - smoothstep(depth * 0.48 - 0.04, depth * 0.48 + 0.04, d);
            outgoingLight *= mix(1.0, 0.8, dotMask * step(0.02, depth));
          }
          #endif
          #ifdef RIOT_RIM
          {
            float fres = 1.0 - max(dot(nrm, vdir), 0.0);
            float rimMask = smoothstep(0.62, 0.66, fres) * smoothstep(-0.2, 0.25, ndl);
            outgoingLight += uRimColor * rimMask * uRim * (0.35 + 0.65 * diffuseColor.rgb);
          }
          #endif
          #ifdef RIOT_RESTORE
            outgoingLight += riotRingColor * riotRing * 1.6;
          #endif
        }
        #include <opaque_fragment>`,
      );
  };
  m.needsUpdate = true;
}

/** Convert any loaded/standard material in a hierarchy to the riot toon look (for GLB swaps later). */
export function toonify(root: THREE.Object3D, opts: { alwaysColor?: boolean } = {}) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const convert = (src: THREE.Material) => {
      const s = src as THREE.MeshStandardMaterial;
      const m = new THREE.MeshToonMaterial({
        color: s.color ?? new THREE.Color(0xffffff),
        map: s.map ?? null,
        gradientMap: toonRamp(),
        emissive: s.emissive ?? new THREE.Color(0),
        emissiveMap: s.emissiveMap ?? null,
        transparent: s.transparent,
        alphaTest: s.alphaTest,
      });
      patchToon(m, { alwaysColor: opts.alwaysColor ?? false, rim: 0.55, halftone: true });
      return m;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material);
  });
}

/** Per-frame update of the shared uniforms. */
export function updateWorldUniforms(time: number, camera: THREE.Camera, sunDirWorld: THREE.Vector3) {
  WorldUniforms.uTime.value = time;
  WorldUniforms.uSunDirView.value.copy(sunDirWorld).transformDirection(camera.matrixWorldInverse);
}
