import * as THREE from 'three';
import { PAL } from '../render/palette';
import { rng, pick, range } from '../render/textures';
import { type Frame, type Kit } from './kit';
import { M } from './mats';
import { FACADE_TILE, type FacadeStyle, FONTS } from './textures';
import { acUnit, antenna, satelliteDish, waterTower } from './props';

const C = M.c;

export type Side = 'n' | 's' | 'e' | 'w'; // n = +z, s = -z, e = +x, w = -x

export interface BuildingSpec {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  h: number;
  color: number;
  style: FacadeStyle;
  /** Base height (sits on another roof, etc). */
  y0?: number;
  trim?: number;
  /** Parapet ring on the roof (blocks movement on roof edges — off for rideable rooftops). */
  parapet?: boolean;
  /** Cornice band near the roof (default on). Off where a spot sits on the upper wall. */
  cornice?: boolean;
  /** Rooftop clutter (AC, antennas, tanks). */
  roofJunk?: boolean;
  fireEscape?: Side;
  shop?: { side: Side; name: string; color: number; awning: [number, number] };
  /** BLANDCO building: stays beige. */
  bland?: boolean;
  seed?: number;
}

export interface BuiltBuilding {
  spec: BuildingSpec;
  /** world-space face info for decals: center on wall, outward normal, width */
  faces: Record<Side, { center: THREE.Vector3; normal: THREE.Vector3; width: number }>;
  flicker: THREE.Material[];
}

export function sideFrame(k: Kit, s: BuildingSpec, side: Side): { f: Frame; width: number } {
  const cx = (s.x0 + s.x1) / 2,
    cz = (s.z0 + s.z1) / 2;
  const w = s.x1 - s.x0,
    d = s.z1 - s.z0;
  const y0 = s.y0 ?? 0;
  // Frame origin at the bottom-center of that face, local +Z = outward normal.
  switch (side) {
    case 'n':
      return { f: k.frame(cx, y0, s.z1, 0), width: w };
    case 's':
      return { f: k.frame(cx, y0, s.z0, Math.PI), width: w };
    case 'e':
      return { f: k.frame(s.x1, y0, cz, Math.PI / 2), width: d };
    case 'w':
      return { f: k.frame(s.x0, y0, cz, -Math.PI / 2), width: d };
  }
}

export function building(k: Kit, s: BuildingSpec): BuiltBuilding {
  const r = rng(s.seed ?? Math.floor(s.x0 * 13 + s.z0 * 7 + s.h * 3));
  const w = s.x1 - s.x0,
    d = s.z1 - s.z0;
  const cx = (s.x0 + s.x1) / 2,
    cz = (s.z0 + s.z1) / 2;
  const y0 = s.y0 ?? 0;
  const W = k.world;
  const flicker: THREE.Material[] = [];

  const body = s.bland ? M.blandFacade(s.style, s.color) : M.facade(s.style, s.color);
  W.box(body, w, s.h, d, cx, y0, cz, { tile: FACADE_TILE, collide: true });

  const trimCol = s.trim ?? (s.bland ? PAL.blandBrown : pick(r, [PAL.white, PAL.inkSoft, PAL.yellow, PAL.cyan, PAL.magenta]));
  const trim = s.bland ? M.beige(trimCol) : C(trimCol);
  // plinth
  W.box(C(s.bland ? PAL.blandBrown : PAL.concreteDark), w + 0.24, 0.7, d + 0.24, cx, y0, cz);
  // cornice band + roof cap
  if (s.cornice !== false) W.box(trim, w + 0.5, 0.45, d + 0.5, cx, y0 + s.h - 0.9, cz);
  W.box(C(PAL.concreteDark), w + 0.1, 0.3, d + 0.1, cx, y0 + s.h, cz, { collide: true });
  // floor bands every 3 floors for rhythm on tall ones
  if (s.h > 16) {
    for (let y = 10.5; y < s.h - 3; y += 10.5) W.box(trim, w + 0.2, 0.22, d + 0.2, cx, y0 + y, cz);
  }
  const roofY = y0 + s.h + 0.3;
  if (s.parapet) {
    const pm = C(PAL.concrete);
    W.box(pm, w + 0.1, 0.9, 0.3, cx, roofY, s.z0 + 0.1, { collide: true });
    W.box(pm, w + 0.1, 0.9, 0.3, cx, roofY, s.z1 - 0.1, { collide: true });
    W.box(pm, 0.3, 0.9, d - 0.5, s.x0 + 0.1, roofY, cz, { collide: true });
    W.box(pm, 0.3, 0.9, d - 0.5, s.x1 - 0.1, roofY, cz, { collide: true });
    W.box(C(PAL.white), w + 0.2, 0.08, 0.4, cx, roofY + 0.9, s.z0 + 0.1);
    W.box(C(PAL.white), w + 0.2, 0.08, 0.4, cx, roofY + 0.9, s.z1 - 0.1);
  }
  if (s.roofJunk) {
    const n = Math.max(1, Math.floor((w * d) / 120));
    for (let i = 0; i < n; i++) {
      const x = range(r, s.x0 + 2, s.x1 - 2),
        z = range(r, s.z0 + 2, s.z1 - 2);
      const kind = r();
      const fr = k.frame(x, roofY, z, Math.floor(r() * 4) * (Math.PI / 2));
      if (kind < 0.45) acUnit(fr);
      else if (kind < 0.6 && w > 8 && d > 8) waterTower(fr, pick(r, [PAL.rust, PAL.teal, PAL.violet]));
      else if (kind < 0.8) antenna(fr, range(r, 3, 7));
      else satelliteDish(fr);
    }
    // stair bulkhead
    if (w > 10 && d > 10) {
      const bx = range(r, s.x0 + 3, s.x1 - 3),
        bz = range(r, s.z0 + 3, s.z1 - 3);
      W.box(C(PAL.concrete), 3, 2.6, 3, bx, roofY, bz, { collide: true });
      W.box(C(PAL.inkSoft), 1.1, 2.0, 0.05, bx, roofY, bz + 1.52);
    }
  }

  const faces = {} as BuiltBuilding['faces'];
  for (const side of ['n', 's', 'e', 'w'] as Side[]) {
    const { f, width } = sideFrame(k, s, side);
    faces[side] = { center: f.point(0, 2.5, 0), normal: f.dir(0, 0, 1), width };
  }

  if (s.fireEscape) {
    const { f, width } = sideFrame(k, s, s.fireEscape);
    fireEscape(f, Math.min(8, width - 2), s.h);
  }
  if (s.shop) {
    const { f, width } = sideFrame(k, s, s.shop.side);
    const fl = shopFront(f, width, s.shop.name, s.shop.color, s.shop.awning, r() < 0.3, s.seed ?? 0);
    if (fl) flicker.push(fl);
  }
  return { spec: s, faces, flicker };
}

/** Fire escape on a face frame (local +z out of wall). */
export function fireEscape(f: Frame, width: number, h: number) {
  const iron = C(PAL.ink, { rim: 0.8 });
  const x0 = -width / 2;
  for (let y = 3.5; y < h - 1.5; y += 3.5) {
    f.box(iron, width, 0.08, 1.2, 0, y, 0.65);
    f.tube(iron, x0, y + 1.0, 1.25, x0 + width, y + 1.0, 1.25, 0.03, { seg: 4 });
    f.tube(iron, x0, y + 1.0, 0.05, x0, y + 1.0, 1.25, 0.03, { seg: 4 });
    f.tube(iron, x0 + width, y + 1.0, 0.05, x0 + width, y + 1.0, 1.25, 0.03, { seg: 4 });
    for (let x = x0; x <= x0 + width + 0.01; x += width / 4) f.tube(iron, x, y, 1.25, x, y + 1.0, 1.25, 0.02, { seg: 4 });
    // ladder down to next level
    if (y > 3.5) {
      f.tube(iron, x0 + width - 0.9, y, 0.95, x0 + width - 2.4, y - 3.5, 0.95, 0.04, { seg: 4 });
      f.tube(iron, x0 + width - 0.9, y, 0.45, x0 + width - 2.4, y - 3.5, 0.45, 0.04, { seg: 4 });
    }
  }
}

/** Shop front on a face frame. Returns a flicker material if the sign should flicker. */
export function shopFront(f: Frame, width: number, name: string, color: number, awning: [number, number], flickers: boolean, seed: number) {
  const sw = Math.min(width - 2, 12);
  // recessed storefront
  f.box(C(PAL.ink), sw + 0.4, 3.4, 0.12, 0, 0.1, 0.02);
  f.box(M.shopInterior(seed, color), sw - 2.4, 2.6, 0.05, -1.1, 0.5, 0.09, { cast: false });
  f.box(C(PAL.white), 0.12, 3.0, 0.16, -1.1 + (sw - 2.4) / 2 + 0.06, 0.3, 0.1);
  // door
  f.box(C(color), 1.6, 2.7, 0.1, sw / 2 - 1.2, 0.1, 0.1);
  f.box(M.glass(), 1.1, 1.6, 0.04, sw / 2 - 1.2, 0.9, 0.17);
  f.box(C(PAL.yellow), 0.1, 0.3, 0.1, sw / 2 - 1.75, 1.3, 0.2);
  // awning (sloped striped)
  f.box(M.stripes(awning[0], awning[1], 10), sw + 0.4, 0.12, 1.6, 0, 3.45, 0.85, { rx: 0.32 });
  f.box(M.stripes(awning[0], awning[1], 10), sw + 0.4, 0.4, 0.04, 0, 3.0, 1.62);
  // sign board above
  f.box(C(PAL.ink), sw * 0.8, 1.1, 0.25, 0, 4.15, 0.12);
  const mat = flickers ? M.neonSignUnique(name, color, FONTS.bungee, 512, 128, 2.2) : M.neonSign(name, color, FONTS.bungee, 512, 128, 2.2);
  f.box(mat, sw * 0.78, 1.0, 0.02, 0, 4.2, 0.26, { noOutline: true, cast: false });
  // little "OPEN" neon in window
  f.box(M.neonSign('OPEN', PAL.magenta, FONTS.marker, 256, 96, 2.4), 1.1, 0.42, 0.02, -sw / 2 + 1.5, 2.3, 0.13, { noOutline: true, cast: false });
  return flickers ? mat : null;
}

/** Billboard on two poles. Local +Z is the face direction. Returns face center world. */
export function billboard(f: Frame, w: number, h: number, bottom: number, mat: THREE.Material, light = true) {
  const steel = C(PAL.metalDark);
  for (const x of [-w * 0.3, w * 0.3]) f.box(steel, 0.35, bottom + h * 0.5, 0.35, x, 0, -0.5);
  f.box(C(PAL.ink), w + 0.5, h + 0.5, 0.35, 0, bottom - 0.25, -0.3);
  f.box(mat, w, h, 0.05, 0, bottom, -0.1, { cast: false });
  // catwalk + lamps
  f.box(steel, w, 0.08, 0.9, 0, bottom - 0.5, 0.2);
  if (light) {
    for (let x = -w / 2 + 1; x <= w / 2 - 1; x += w / 3) {
      f.tube(steel, x, bottom - 0.45, 0.4, x, bottom - 0.2, 1.1, 0.04, { seg: 4 });
      f.box(M.neon(0xfff2d0, 2.2), 0.45, 0.1, 0.25, x, bottom - 0.25, 1.1, { noOutline: true, cast: false });
    }
  }
  return f.point(0, bottom + h / 2, 0);
}
