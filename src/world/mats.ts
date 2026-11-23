import * as THREE from 'three';
import { toon, neon, type ToonOptions } from '../render/materials';
import { PAL } from '../render/palette';
import * as TX from './textures';

/** Memoized material factory for the city. Keeps one material per (kind, color). */
const memo = new Map<string, THREE.Material>();
function m<T extends THREE.Material>(key: string, make: () => T): T {
  let v = memo.get(key) as T | undefined;
  if (!v) {
    v = make();
    memo.set(key, v);
  }
  return v;
}

export const M = {
  c: (color: number, o: ToonOptions = {}) => toon(color, o),
  neon: (color: number, k = 2.2) => neon(color, k),
  beige: (color: number = PAL.blandBeige) => toon(color, { alwaysColor: true, halftone: false, rim: 0.3 }),

  asphalt: () => m('asphalt', () => toon(0xffffff, { map: TX.asphaltTex(), rim: 0 })),
  sidewalk: () => m('sidewalk', () => toon(0xffffff, { map: TX.sidewalkTex(), rim: 0 })),
  plaza: () => m('plaza', () => toon(0xffffff, { map: TX.plazaTex(), rim: 0 })),
  dockGround: () => m('dockground', () => toon(0xffffff, { map: TX.dockGroundTex(), rim: 0 })),

  facade: (style: TX.FacadeStyle, color: number) =>
    m(`facade-${style}-${color}`, () => {
      const t = TX.facadeTex(style);
      return toon(color, { map: t.map, emissiveMap: t.lit, emissive: PAL.windowLit, emissiveIntensity: 1.7 });
    }),
  blandFacade: (style: TX.FacadeStyle, color: number) =>
    m(`blandfacade-${style}-${color}`, () => {
      const t = TX.facadeTex(style);
      return toon(color, { map: t.map, emissiveMap: t.lit, emissive: 0xfff0d0, emissiveIntensity: 1.2, alwaysColor: true, halftone: false });
    }),
  corrugated: (color: number) => m(`corr-${color}`, () => toon(color, { map: TX.corrugatedTex() })),
  stripes: (a: number, b: number, n = 8, vertical = true) =>
    m(`stripes-${a}-${b}-${n}-${vertical}`, () => toon(0xffffff, { map: TX.stripeTex(a, b, n, vertical) })),
  hazard: () => m('hazard', () => toon(0xffffff, { map: TX.hazardTex() })),

  /** Glowing textured sign. */
  neonSign: (text: string, color: number, font?: string, w = 512, h = 128, k = 2.0) =>
    m(`neonsign-${text}-${color}-${w}-${h}-${k}`, () => {
      const mat = new THREE.MeshBasicMaterial({ map: TX.neonSignTex(text, color, font, w, h), toneMapped: false });
      mat.color.setScalar(k);
      return mat;
    }),
  /** Unique (non-memoized) neon sign material, for flickering. */
  neonSignUnique: (text: string, color: number, font?: string, w = 512, h = 128, k = 2.0) => {
    const mat = new THREE.MeshBasicMaterial({ map: TX.neonSignTex(text, color, font, w, h), toneMapped: false });
    mat.color.setScalar(k);
    return mat;
  },
  poster: (slogan: string, w = 512, h = 320) =>
    m(`poster-${slogan}-${w}-${h}`, () => toon(0xffffff, { map: TX.blandPosterTex(slogan, w, h), alwaysColor: true, halftone: false, rim: 0.2 })),
  approved: () => m('approved', () => toon(0xffffff, { map: TX.approvedPanelTex(), alwaysColor: true, halftone: false, rim: 0 })),
  shopInterior: (seed: number, tint: number) =>
    m(`shopint-${seed}-${tint}`, () => {
      const mat = new THREE.MeshBasicMaterial({ map: TX.shopInteriorTex(seed, tint), toneMapped: false });
      mat.color.setScalar(1.25);
      return mat;
    }),
  chainLink: () =>
    m('chainlink', () => toon(PAL.metal, { map: TX.chainLinkTex(), alphaTest: 0.5, side: THREE.DoubleSide, halftone: false, rim: 0 })),
  water: () =>
    m('water', () => {
      const t = TX.waterTex();
      return toon(0xffffff, { map: t, rim: 0, halftone: false, alwaysColor: true });
    }),
  manhole: () => m('manhole', () => toon(0xffffff, { map: TX.manholeTex(), alphaTest: 0.5, rim: 0, halftone: false })),
  banner: (text: string) =>
    m(`banner-${text}`, () => toon(0xffffff, { map: TX.bannerTex(text), alwaysColor: true, side: THREE.DoubleSide, halftone: false, rim: 0 })),
  plaque: () => m('plaque', () => toon(0xffffff, { map: TX.plaqueTex(), alwaysColor: true, rim: 0, halftone: false })),
  vending: (seed: number, tint: number) =>
    m(`vend-${seed}-${tint}`, () => {
      const mat = new THREE.MeshBasicMaterial({ map: TX.vendingTex(seed, tint), toneMapped: false });
      mat.color.setScalar(1.5);
      return mat;
    }),
  busAd: () =>
    m('busad', () => {
      const mat = new THREE.MeshBasicMaterial({ map: TX.busAdTex(), toneMapped: false });
      mat.color.setScalar(1.3);
      return mat;
    }),
  glass: () => m('glass', () => toon(0x3a2f6e, { rim: 0.9, halftone: false })),
  decal: (tex: THREE.Texture, key: string) =>
    m(`decal-${key}`, () => {
      const mat = toon(0xffffff, { map: tex, alphaTest: 0.45, halftone: false, rim: 0 });
      mat.polygonOffset = true;
      mat.polygonOffsetFactor = -2;
      mat.polygonOffsetUnits = -2;
      return mat;
    }),
};
