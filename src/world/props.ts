import * as THREE from 'three';
import { PAL } from '../render/palette';
import { G, type Frame } from './kit';
import { M } from './mats';
import { rng, pick, range } from '../render/textures';

/*
  Street furniture. Every function authors in local space of the given Frame:
  origin on the ground, facing +Z (the "front" faces +Z).
*/

const C = M.c;

export function streetLamp(f: Frame, color: number = PAL.windowLit) {
  const pole = C(PAL.metalDark);
  f.cyl(C(PAL.inkSoft), 0.22, 0.26, 0.5, 0, 0, 0, { seg: 8 });
  f.cyl(pole, 0.09, 0.12, 6.2, 0, 0.5, 0, { seg: 8 });
  f.tube(pole, 0, 6.5, 0, 0, 6.9, 1.4, 0.07);
  f.box(C(PAL.violet), 0.5, 0.25, 0.9, 0, 6.75, 1.6);
  f.box(M.neon(color, 2.6), 0.4, 0.06, 0.75, 0, 6.7, 1.6, { noOutline: true, cast: false });
  // banner on pole
  f.box(C(PAL.magenta), 0.04, 1.2, 0.6, 0.12, 4.2, 0.3);
}

export function bench(f: Frame) {
  const wood = C(PAL.orange);
  const iron = C(PAL.inkSoft);
  for (const x of [-0.85, 0.85]) {
    f.box(iron, 0.12, 0.45, 0.55, x, 0, 0);
    f.box(iron, 0.12, 0.55, 0.08, x, 0.45, -0.25);
  }
  for (let i = 0; i < 3; i++) f.box(wood, 2.1, 0.07, 0.15, 0, 0.45, -0.18 + i * 0.18);
  for (let i = 0; i < 2; i++) f.box(wood, 2.1, 0.14, 0.05, 0, 0.62 + i * 0.2, -0.3);
  f.solid(2.1, 0.55, 0.6, 0, 0, 0);
}

export function hydrant(f: Frame) {
  const red = C(PAL.red);
  f.cyl(red, 0.2, 0.24, 0.65, 0, 0, 0, { seg: 10 });
  f.sphere(red, 0.2, 0, 0.68, 0, { seg: 10 });
  f.cyl(C(PAL.yellow), 0.07, 0.07, 0.5, 0, 0.38, 0, { rz: Math.PI / 2, seg: 8 });
  f.cyl(C(PAL.yellow), 0.05, 0.05, 0.12, 0, 0.82, 0, { seg: 8 });
}

export function trashCan(f: Frame) {
  f.cyl(C(PAL.teal), 0.32, 0.28, 0.9, 0, 0, 0, { seg: 12 });
  f.cyl(C(PAL.tealDark), 0.36, 0.36, 0.08, 0, 0.9, 0, { seg: 12 });
  f.cyl(C(PAL.white), 0.33, 0.29, 0.12, 0, 0.45, 0, { seg: 12 });
  // garbage poking out
  f.sphere(C(PAL.white), 0.12, 0.08, 1.0, 0.05, { seg: 6 });
}

export function dumpster(f: Frame, color: number = PAL.green) {
  const body = C(color);
  f.box(body, 2.0, 1.3, 1.2, 0, 0.15, 0, { collide: true });
  f.box(C(PAL.inkSoft), 2.05, 0.1, 1.25, 0, 1.45, 0, { rx: -0.12 });
  f.box(C(PAL.inkSoft), 2.1, 0.12, 0.08, 0, 1.1, 0.62);
  for (const x of [-0.8, 0.8])
    for (const z of [-0.45, 0.45]) f.cyl(C(PAL.ink), 0.1, 0.1, 0.12, x, 0.1, z, { rz: Math.PI / 2, seg: 8 });
  f.box(C(PAL.white), 0.7, 0.25, 0.02, 0, 0.7, 0.61);
}

export function vendingMachine(f: Frame, seed: number, tint: number) {
  f.box(C(tint), 1.2, 2.0, 0.9, 0, 0, 0, { collide: true });
  f.box(M.vending(seed, tint), 0.95, 1.7, 0.02, 0, 0.18, 0.46, { noOutline: false, cast: false });
  f.box(C(PAL.ink), 0.3, 0.12, 0.05, 0.28, 0.25, 0.47);
  f.box(C(PAL.white), 1.25, 0.12, 0.95, 0, 2.0, 0);
}

export function phoneBooth(f: Frame) {
  const frame = C(PAL.cyan);
  for (const x of [-0.55, 0.55])
    for (const z of [-0.55, 0.55]) f.box(frame, 0.1, 2.3, 0.1, x, 0, z);
  f.box(frame, 1.2, 0.3, 1.2, 0, 2.3, 0);
  f.box(M.neonSign('PHONE', PAL.cyan, undefined, 256, 64, 2.2), 1.0, 0.2, 0.02, 0, 2.35, 0.61, { noOutline: true, cast: false });
  f.box(M.glass(), 1.0, 1.6, 0.04, 0, 0.5, -0.55);
  f.box(M.glass(), 0.04, 1.6, 1.0, -0.55, 0.5, 0);
  f.box(M.glass(), 0.04, 1.6, 1.0, 0.55, 0.5, 0);
  f.box(C(PAL.inkSoft), 0.35, 0.5, 0.15, 0, 1.2, -0.45);
  f.solid(1.2, 2.6, 1.2, 0, 0, 0);
}

export function busStop(f: Frame) {
  const frame = C(PAL.violet);
  f.box(frame, 4.2, 0.12, 1.6, 0, 2.6, 0);
  for (const x of [-2, 2]) f.box(frame, 0.12, 2.6, 0.12, x, 0, -0.65);
  f.box(M.glass(), 3.9, 1.9, 0.05, 0, 0.6, -0.7);
  f.box(M.busAd(), 1.2, 1.8, 0.06, 1.3, 0.6, -0.64, { cast: false });
  f.box(C(PAL.orange), 3.2, 0.1, 0.45, -0.3, 0.5, -0.4);
  f.box(C(PAL.inkSoft), 0.1, 0.5, 0.4, -1.6, 0, -0.4);
  f.box(C(PAL.inkSoft), 0.1, 0.5, 0.4, 1.0, 0, -0.4);
  // sign post
  f.cyl(C(PAL.metalDark), 0.05, 0.05, 2.8, 2.5, 0, 0.6, { seg: 6 });
  f.box(M.neonSign('BUS 26', PAL.yellow, undefined, 256, 128, 1.8), 0.7, 0.45, 0.04, 2.5, 2.4, 0.6, { cast: false });
  f.solid(4.2, 2.7, 0.3, 0, 0, -0.7);
}

export function cone(f: Frame) {
  f.box(C(PAL.orange), 0.45, 0.05, 0.45, 0, 0, 0);
  f.cyl(C(PAL.orange), 0.04, 0.18, 0.7, 0, 0.05, 0, { seg: 10 });
  f.cyl(C(PAL.white), 0.1, 0.13, 0.14, 0, 0.32, 0, { seg: 10 });
}

export function barrier(f: Frame) {
  f.box(M.hazard(), 2.2, 0.35, 0.08, 0, 0.75, 0);
  for (const x of [-0.95, 0.95]) {
    f.box(C(PAL.white), 0.08, 1.1, 0.08, x, 0, 0);
    f.box(C(PAL.white), 0.08, 0.06, 0.6, x, 0, 0);
  }
  f.sphere(M.neon(PAL.orange, 3), 0.08, 0.95, 1.2, 0, { noOutline: true, cast: false, seg: 8 });
  f.solid(2.2, 1.1, 0.3, 0, 0, 0);
}

export function fence(f: Frame, len: number, h = 2.4) {
  const post = C(PAL.metal);
  const n = Math.max(1, Math.round(len / 3));
  for (let i = 0; i <= n; i++) f.cyl(post, 0.05, 0.05, h, -len / 2 + (i * len) / n, 0, 0, { seg: 6 });
  f.tube(post, -len / 2, h, 0, len / 2, h, 0, 0.04);
  f.geo(G.plane(len, h - 0.1), M.chainLink(), 0, h / 2, 0, { cast: false });
  f.solid(len, h, 0.2, 0, 0, 0);
}

export function roundTree(f: Frame, seed: number, scale = 1) {
  const r = rng(seed);
  const s = scale * range(r, 0.85, 1.15);
  f.cyl(C(PAL.woodDark), 0.14 * s, 0.22 * s, 2.4 * s, 0, 0, 0, { seg: 7 });
  const leafA = C(pick(r, [PAL.leaf, PAL.grassPop, PAL.teal]));
  const leafB = C(PAL.leafDark);
  f.geo(G.ico(1.25 * s, 1), leafB, 0, 2.9 * s, 0, { sy: 0.85 });
  f.geo(G.ico(1.0 * s, 1), leafA, 0.4 * s, 3.5 * s, 0.2 * s, { sy: 0.85 });
  f.geo(G.ico(0.8 * s, 1), leafA, -0.45 * s, 3.3 * s, -0.25 * s, { sy: 0.85 });
  f.geo(G.ico(0.65 * s, 1), leafA, 0.05 * s, 4.1 * s, -0.1 * s, { sy: 0.9 });
  f.solid(0.5 * s, 2.4 * s, 0.5 * s, 0, 0, 0);
}

export function palmTree(f: Frame, seed: number, h = 7) {
  const r = rng(seed);
  const trunk = C(PAL.wood);
  const ring = C(PAL.woodDark);
  const lean = range(r, -0.25, 0.25);
  let x = 0,
    y = 0,
    z = 0;
  const segs = 7;
  for (let i = 0; i < segs; i++) {
    const nx = x + lean * 0.35 * (i / segs + 0.3),
      ny = y + h / segs,
      nz = z + lean * 0.15;
    f.tube(i % 2 ? trunk : ring, x, y, z, nx, ny, nz, 0.26 - i * 0.02, { seg: 7 });
    x = nx;
    y = ny;
    z = nz;
  }
  const leaf = C(PAL.leaf);
  const leafDark = C(PAL.leafDark);
  const fronds = 7;
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2 + r();
    // each frond: 3 slabs drooping outward
    let px = x,
      py = y,
      pz = z;
    for (let k = 0; k < 3; k++) {
      const len = 1.3;
      const droop = -0.15 - k * 0.45;
      const nx = px + Math.cos(a) * len,
        nz = pz + Math.sin(a) * len,
        ny = py + droop;
      const mid = new THREE.Vector3((px + nx) / 2, (py + ny) / 2, (pz + nz) / 2);
      f.geo(G.box(1.35, 0.06, 0.55 - k * 0.12), k % 2 ? leafDark : leaf, mid.x, mid.y, mid.z, {
        ry: -a,
        rz: Math.atan2(droop, len),
      });
      px = nx;
      py = ny;
      pz = nz;
    }
  }
  f.sphere(C(PAL.woodDark), 0.22, x + 0.2, y - 0.25, z, { seg: 6 });
  f.sphere(C(PAL.woodDark), 0.2, x - 0.15, y - 0.3, z + 0.15, { seg: 6 });
  f.solid(0.6, h, 0.6, 0, 0, 0);
}

export function parkedCar(f: Frame, color: number, seed: number) {
  const r = rng(seed);
  const body = C(color);
  const dark = C(PAL.inkSoft);
  const style = r();
  // chassis
  f.box(body, 1.95, 0.7, 4.3, 0, 0.32, 0);
  // hood bulge & trunk
  f.box(body, 1.85, 0.12, 1.2, 0, 1.02, 1.4, { rx: 0.06 });
  // cabin
  const cabLen = style < 0.5 ? 2.2 : 2.7;
  f.box(M.glass(), 1.72, 0.66, cabLen, 0, 1.02, -0.25);
  f.box(body, 1.8, 0.14, cabLen - 0.25, 0, 1.68, -0.3);
  f.box(body, 0.1, 0.66, 0.12, 0.84, 1.02, -0.25 + cabLen / 2 - 0.08);
  f.box(body, 0.1, 0.66, 0.12, -0.84, 1.02, -0.25 + cabLen / 2 - 0.08);
  // racing stripe
  f.box(C(style < 0.33 ? PAL.white : style < 0.66 ? PAL.yellow : PAL.ink), 0.45, 0.02, 4.32, 0, 1.03, 0);
  // bumpers
  f.box(dark, 2.0, 0.25, 0.2, 0, 0.3, 2.18);
  f.box(dark, 2.0, 0.25, 0.2, 0, 0.3, -2.18);
  // lights
  for (const x of [-0.7, 0.7]) {
    f.box(M.neon(0xfff2c0, 2.4), 0.36, 0.16, 0.04, x, 0.72, 2.16, { noOutline: true, cast: false });
    f.box(M.neon(PAL.red, 2.4), 0.36, 0.14, 0.04, x, 0.72, -2.16, { noOutline: true, cast: false });
  }
  // wheels
  for (const x of [-0.92, 0.92])
    for (const z of [-1.35, 1.35]) {
      f.cyl(C(PAL.ink), 0.4, 0.4, 0.32, x, 0.4, z, { rz: Math.PI / 2, seg: 14 });
      f.cyl(C(PAL.white), 0.18, 0.18, 0.34, x, 0.4, z, { rz: Math.PI / 2, seg: 10 });
    }
  // roof cargo sometimes
  if (r() < 0.3) {
    f.box(C(PAL.wood), 1.3, 0.3, 1.2, 0, 1.82, -0.4);
    f.box(C(PAL.red), 1.32, 0.05, 0.08, 0, 2.0, -0.4);
  }
  f.solid(2.05, 1.8, 4.5, 0, 0, 0);
}

export function crate(f: Frame, s = 1.2) {
  const w = C(PAL.wood);
  f.box(w, s, s, s, 0, 0, 0, { collide: true });
  const d = C(PAL.woodDark);
  f.box(d, s + 0.04, 0.12, s + 0.04, 0, 0.05, 0);
  f.box(d, s + 0.04, 0.12, s + 0.04, 0, s - 0.17, 0);
  f.box(d, s + 0.04, s * 0.9, 0.1, 0, 0.05, 0, { rz: 0.75 });
}

export function barrel(f: Frame, color: number) {
  f.cyl(C(color), 0.36, 0.36, 1.05, 0, 0, 0, { seg: 12, collide: true });
  f.cyl(C(PAL.inkSoft), 0.375, 0.375, 0.06, 0, 0.25, 0, { seg: 12 });
  f.cyl(C(PAL.inkSoft), 0.375, 0.375, 0.06, 0, 0.75, 0, { seg: 12 });
}

export function acUnit(f: Frame) {
  f.box(C(PAL.metal), 1.6, 1.0, 1.1, 0, 0, 0, { collide: true });
  f.cyl(C(PAL.metalDark), 0.42, 0.42, 0.06, 0, 1.0, 0, { seg: 12 });
  f.box(C(PAL.inkSoft), 0.06, 0.04, 0.8, 0, 1.06, 0);
  f.box(C(PAL.metalDark), 1.5, 0.08, 0.06, 0, 0.3, 0.56);
  f.box(C(PAL.metalDark), 1.5, 0.08, 0.06, 0, 0.5, 0.56);
}

export function waterTower(f: Frame, color: number = PAL.rust) {
  const leg = C(PAL.metalDark);
  for (const [x, z] of [
    [-1.2, -1.2],
    [1.2, -1.2],
    [-1.2, 1.2],
    [1.2, 1.2],
  ])
    f.tube(leg, x, 0, z, x * 0.8, 3.2, z * 0.8, 0.09);
  f.tube(leg, -1.1, 1.4, -1.1, 1.1, 1.4, 1.1, 0.04);
  f.tube(leg, 1.1, 1.4, -1.1, -1.1, 1.4, 1.1, 0.04);
  f.cyl(C(color), 1.5, 1.5, 3.0, 0, 3.2, 0, { seg: 16 });
  for (let i = 0; i < 3; i++) f.cyl(C(PAL.inkSoft), 1.53, 1.53, 0.08, 0, 3.6 + i * 1.0, 0, { seg: 16 });
  f.cyl(C(PAL.woodDark), 0.1, 1.7, 1.1, 0, 6.2, 0, { seg: 16 });
  f.solid(3, 7.3, 3, 0, 0, 0);
}

export function antenna(f: Frame, h = 6) {
  const m = C(PAL.metal);
  f.cyl(m, 0.05, 0.08, h, 0, 0, 0, { seg: 6 });
  for (let i = 1; i <= 3; i++) f.box(m, 1.6 - i * 0.35, 0.05, 0.05, 0, (h * i) / 4, 0);
  f.sphere(M.neon(PAL.red, 3.5), 0.12, 0, h + 0.1, 0, { noOutline: true, cast: false, seg: 8 });
}

export function satelliteDish(f: Frame) {
  f.cyl(C(PAL.metalDark), 0.06, 0.08, 0.8, 0, 0, 0, { seg: 6 });
  f.geo(G.hemi(0.6, 12), C(PAL.white), 0, 1.0, 0, { rx: -2.2, sy: 0.4 });
}

export function planter(f: Frame, len: number, seed: number) {
  // Long concrete planter: top edges are grindable.
  const conc = C(PAL.peach);
  f.box(conc, len, 0.75, 1.8, 0, 0, 0, { collide: true });
  f.box(C(PAL.ink), len - 0.3, 0.05, 1.5, 0, 0.72, 0);
  f.box(C(PAL.white), len + 0.08, 0.08, 1.88, 0, 0.72, 0);
  for (let i = 0; i < Math.floor(len / 3); i++) {
    f.geo(G.ico(0.55, 0), C(PAL.grassPop), -len / 2 + 1.5 + i * 3, 1.0, 0, { sy: 0.7 });
  }
  roundTree(f.sub(0, 0.75, 0), seed, 0.8);
  // grind on the two long top edges
  f.rail([
    [-len / 2 + 0.2, 0.8, 0.9],
    [len / 2 - 0.2, 0.8, 0.9],
  ]);
  f.rail([
    [-len / 2 + 0.2, 0.8, -0.9],
    [len / 2 - 0.2, 0.8, -0.9],
  ]);
}

export function bollard(f: Frame) {
  f.cyl(C(PAL.yellow), 0.16, 0.18, 0.8, 0, 0, 0, { seg: 10 });
  f.cyl(C(PAL.ink), 0.17, 0.17, 0.12, 0, 0.55, 0, { seg: 10 });
  f.geo(G.hemi(0.16, 10), C(PAL.yellow), 0, 0.8, 0, {});
}

export function mooringBollard(f: Frame) {
  f.cyl(C(PAL.inkSoft), 0.3, 0.35, 0.6, 0, 0, 0, { seg: 10 });
  f.cyl(C(PAL.inkSoft), 0.45, 0.45, 0.12, 0, 0.6, 0, { seg: 10 });
}

export function trafficCone(f: Frame) {
  cone(f);
}

/** Utility pole; returns the world-space wire attach point. */
export function utilityPole(f: Frame): THREE.Vector3 {
  const w = C(PAL.woodDark);
  f.cyl(w, 0.16, 0.2, 9, 0, 0, 0, { seg: 7 });
  f.box(w, 2.4, 0.18, 0.18, 0, 8.2, 0);
  f.box(w, 1.6, 0.16, 0.16, 0, 7.4, 0);
  for (const x of [-1.0, 0, 1.0]) f.cyl(C(PAL.white), 0.06, 0.06, 0.18, x, 8.38, 0, { seg: 6 });
  f.cyl(C(PAL.metalDark), 0.35, 0.35, 0.8, 0.3, 6.2, 0.2, { seg: 10 });
  return f.point(0, 8.45, 0);
}

/** Sagging wire between two world points, returns sample points (for hanging sneakers). */
export function wire(f: Frame, a: THREE.Vector3, b: THREE.Vector3, sag = 1.2, segs = 10): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = a.clone().lerp(b, t);
    p.y -= Math.sin(t * Math.PI) * sag;
    pts.push(p);
  }
  const mat = C(PAL.ink, { rim: 0, halftone: false });
  for (let i = 0; i < segs; i++) f.kit.world.tube(mat, pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z, 0.03, { cast: false, seg: 4 });
  return pts;
}

export function hangingSneakers(f: Frame, at: THREE.Vector3) {
  const w = f.kit.world;
  const lace = C(PAL.white);
  for (const dx of [-0.18, 0.18]) {
    w.tube(lace, at.x, at.y, at.z, at.x + dx, at.y - 0.8, at.z, 0.012, { cast: false, seg: 3 });
    w.box(C(PAL.magenta), 0.16, 0.22, 0.4, at.x + dx, at.y - 1.05, at.z);
    w.box(C(PAL.white), 0.18, 0.08, 0.42, at.x + dx, at.y - 1.08, at.z);
  }
}

export function pigeonGeometry(): THREE.BufferGeometry[] {
  // body + head + tail as separate geos (merged by caller)
  const body = new THREE.SphereGeometry(0.14, 8, 6).scale(1, 0.85, 1.35).translate(0, 0.15, 0);
  const head = new THREE.SphereGeometry(0.075, 8, 6).translate(0, 0.3, 0.14);
  const tail = new THREE.BoxGeometry(0.12, 0.03, 0.16).translate(0, 0.15, -0.2);
  const legs = new THREE.CylinderGeometry(0.012, 0.012, 0.08, 4).translate(0, 0.04, 0);
  return [body, head, tail, legs];
}
