import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { patchWorld } from './mats';

/*
  KayKit (CC0) asset loading: animated characters + dungeon props.
  Everything is preloaded by loadKayKit(); after that, templates are available synchronously.
  Assets live in public/assets/kaykit (served at /assets/kaykit).
*/

export interface CharTemplate {
  scene: THREE.Group;
  clips: THREE.AnimationClip[];
  height: number;
}
export interface PropTemplate {
  geometry: THREE.BufferGeometry; // merged, in prop-local space, feet at y=0
  material: THREE.Material;
  radius: number; // XZ footprint radius
  height: number;
}

export const CHARS = ['Mage', 'Rogue_Hooded', 'Knight', 'Barbarian', 'Skeleton_Mage'] as const;
export type CharName = (typeof CHARS)[number];
export const PROPS = [
  'barrel_large', 'barrel_small_stack', 'box_stacked', 'crates_stacked', 'box_large', 'shelves', 'shelf_large',
  'table_medium_decorated_A', 'table_long_decorated_A', 'table_small_decorated_A', 'torch_lit', 'torch_mounted',
  'banner_patternA_green', 'banner_patternB_red', 'banner_thin_yellow', 'banner_shield_blue', 'keg_decorated',
  'candle_triple', 'pillar', 'pillar_decorated', 'rubble_large', 'rubble_half', 'trunk_large_A', 'sword_shield',
  'stool', 'chair', 'bottle_A_labeled_green', 'column', 'chest', 'wall_broken',
] as const;
export type PropName = (typeof PROPS)[number];

export const chars = new Map<CharName, CharTemplate>();
export const props = new Map<PropName, PropTemplate>();
let loading: Promise<void> | null = null;
export const kaykitReady = () => chars.size > 0;

export function loadKayKit(): Promise<void> {
  if (loading) return loading;
  const loader = new GLTFLoader();
  const base = '/assets/kaykit';
  const jobs: Promise<void>[] = [];
  for (const name of CHARS) {
    jobs.push(
      loader.loadAsync(`${base}/chars/${name}.glb`).then((g) => {
        const scene = g.scene;
        scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            m.castShadow = true;
            m.receiveShadow = false;
            m.frustumCulled = false; // skinned bounds are unreliable
          }
        });
        scene.updateMatrixWorld(true);
        // hide weapons/props for the bbox measure
        scene.traverse((o) => (o.visible = !WEAPON.test(o.name) || o === scene));
        const box = new THREE.Box3().setFromObject(scene, true);
        chars.set(name, { scene, clips: g.animations, height: Math.max(0.5, box.max.y - box.min.y) });
      }),
    );
  }
  for (const name of PROPS) {
    jobs.push(
      loader
        .loadAsync(`${base}/dungeon/${name}.glb`)
        .then((g) => {
          g.scene.updateMatrixWorld(true);
          const geos: THREE.BufferGeometry[] = [];
          let mat: THREE.Material | null = null;
          g.scene.traverse((o) => {
            const m = o as THREE.Mesh;
            if (!m.isMesh) return;
            let geo = m.geometry.clone().applyMatrix4(m.matrixWorld);
            geo = geo.index ? geo.toNonIndexed() : geo;
            for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
            geos.push(geo);
            mat ??= Array.isArray(m.material) ? m.material[0] : m.material;
          });
          if (!geos.length || !mat) return;
          const geometry = mergeGeometries(geos, false)!;
          geometry.computeBoundingBox();
          const bb = geometry.boundingBox!;
          geometry.translate(0, -bb.min.y, 0);
          const src = mat as THREE.MeshStandardMaterial;
          const material = patchWorld(new THREE.MeshStandardMaterial({ map: src.map ?? null, color: src.color ?? new THREE.Color(1, 1, 1), roughness: 0.85, metalness: 0, emissive: src.emissive ?? new THREE.Color(0), emissiveMap: src.emissiveMap ?? null }), { baseAO: 0.25 });
          props.set(name, { geometry, material, radius: Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2, height: bb.max.y - bb.min.y });
        })
        .catch(() => undefined),
    );
  }
  loading = Promise.all(jobs).then(() => undefined);
  return loading;
}

export const WEAPON = /Spellbook|Wand|Staff|Sword|Shield|Axe|Crossbow|Dagger|Knife|Throwable|Mug|Arrow|Quiver|Blade|Spike|Badge|Rectangle|Round/i;

// ---------------------------------------------------------------- team recolor
const tintCache = new Map<string, THREE.Texture>();
/**
 * Recolor a KayKit palette atlas: the outfit's dominant saturated hue (excluding skin/wood hues)
 * is rotated to the team color; everything else (skin, metal, leather) is kept.
 */
export function teamTexture(src: THREE.Texture, key: string, color: number): THREE.Texture {
  const k = `${key}|${color}`;
  const hit = tintCache.get(k);
  if (hit) return hit;
  const img = src.image as HTMLImageElement | ImageBitmap;
  const w = img.width, h = img.height;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.drawImage(img as CanvasImageSource, 0, 0);
  const data = g.getImageData(0, 0, w, h);
  const d = data.data;
  // histogram of hues among saturated, non-skin pixels
  const hist = new Float32Array(36);
  const hsl = new THREE.Color();
  const tmp = { h: 0, s: 0, l: 0 };
  for (let i = 0; i < d.length; i += 4 * 7) {
    hsl.setRGB(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255, THREE.SRGBColorSpace).getHSL(tmp, THREE.SRGBColorSpace);
    if (tmp.s < 0.28 || tmp.l < 0.12 || tmp.l > 0.88) continue;
    const deg = tmp.h * 360;
    if (deg > 8 && deg < 48) continue; // skin / wood / leather
    hist[Math.floor(tmp.h * 36) % 36] += 1;
  }
  let best = 0;
  for (let i = 0; i < 36; i++) if (hist[i] + hist[(i + 1) % 36] > hist[best] + hist[(best + 1) % 36]) best = i;
  const center = (best + 1) / 36;
  const team = new THREE.Color(color);
  const tt = { h: 0, s: 0, l: 0 };
  team.getHSL(tt, THREE.SRGBColorSpace);
  for (let i = 0; i < d.length; i += 4) {
    hsl.setRGB(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255, THREE.SRGBColorSpace).getHSL(tmp, THREE.SRGBColorSpace);
    if (tmp.s < 0.22) continue;
    let dh = Math.abs(tmp.h - center);
    dh = Math.min(dh, 1 - dh);
    if (dh > 0.11) continue;
    hsl.setHSL(tt.h, Math.min(1, tmp.s * 0.5 + tt.s * 0.55), tmp.l, THREE.SRGBColorSpace);
    const out = { r: 0, g: 0, b: 0 };
    hsl.getRGB(out, THREE.SRGBColorSpace);
    d[i] = Math.round(out.r * 255);
    d[i + 1] = Math.round(out.g * 255);
    d[i + 2] = Math.round(out.b * 255);
  }
  g.putImageData(data, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = src.flipY;
  t.magFilter = src.magFilter;
  t.minFilter = src.minFilter;
  t.generateMipmaps = src.generateMipmaps;
  tintCache.set(k, t);
  return t;
}

/** Build one merged mesh per prop type from a list of instances. */
export function buildPropMeshes(instances: { name: PropName; x: number; y?: number; z: number; ry: number; s?: number }[]): THREE.Mesh[] {
  const byName = new Map<PropName, THREE.BufferGeometry[]>();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (const it of instances) {
    const tpl = props.get(it.name);
    if (!tpl) continue;
    const s = it.s ?? 1;
    m.compose(new THREE.Vector3(it.x, it.y ?? 0, it.z), q.setFromAxisAngle(up, it.ry), new THREE.Vector3(s, s, s));
    const g = tpl.geometry.clone().applyMatrix4(m);
    if (!byName.has(it.name)) byName.set(it.name, []);
    byName.get(it.name)!.push(g);
  }
  const out: THREE.Mesh[] = [];
  for (const [name, geos] of byName) {
    const tpl = props.get(name)!;
    const merged = mergeGeometries(geos, false)!;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, tpl.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `kaykit:${name}`;
    out.push(mesh);
  }
  return out;
}
