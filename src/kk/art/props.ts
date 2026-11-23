import * as THREE from 'three';
import { Batch, G, T } from './batch';
import { COL } from './mats';

/*
  Prop recipes. Each adds pieces into the opaque batch (b) and glow batch (gl) at (x, z) facing ry,
  and returns its footprint radius (used for colliders + painted ground AO).
*/
export interface PropCtx {
  b: Batch;
  gl: Batch;
  r: () => number;
}
type Prop = (c: PropCtx, x: number, z: number, ry: number, s?: number) => number;

const R = (r: () => number, a: number, b: number) => a + (b - a) * r();
const mix = (a: number, b: number, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), t);
/** rotate local offset (lx, lz) by ry and add to (x, z) */
function off(x: number, z: number, ry: number, lx: number, lz: number): [number, number] {
  const c = Math.cos(ry), s = Math.sin(ry);
  return [x + lx * c + lz * s, z - lx * s + lz * c];
}

export const tree: Prop = ({ b, r }, x, z, _ry, s = 1) => {
  const h = R(r, 2.2, 3.2) * s;
  b.add(G.cyl6, T(x, h / 2, z, 0, 0.32 * s, h, 0.32 * s), COL.woodDark, 0.1);
  b.add(G.cone6, T(x, 0.25, z, r() * 6, 0.75 * s, 0.5, 0.75 * s), COL.woodDark, 0.1); // root flare
  const leaf = [COL.leafTeal, COL.leafMoss, COL.leafDeep][Math.floor(r() * 3)];
  const n = 3 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r();
    const rad = R(r, 0.5, 0.9) * s;
    const sz = R(r, 1.5, 2.2) * s;
    b.add(G.ball, T(x + Math.cos(a) * rad, h + R(r, -0.2, 0.7) * s, z + Math.sin(a) * rad, r() * 6, sz, sz * 0.85, sz), mix(leaf, 0xa6d38a, r() * 0.25), 0.08, 0.08);
  }
  b.add(G.ball, T(x, h + 1.1 * s, z, r() * 6, 1.8 * s, 1.5 * s, 1.8 * s), mix(leaf, 0xb8e39a, 0.18), 0.06, 0.08);
  return 1.0 * s;
};

export const pine: Prop = ({ b, r }, x, z, _ry, s = 1) => {
  b.add(G.cyl6, T(x, 0.6 * s, z, 0, 0.3 * s, 1.2 * s, 0.3 * s), COL.woodDark);
  const leaf = r() < 0.5 ? COL.leafDeep : COL.leafTeal;
  for (let i = 0; i < 3; i++) {
    const w = (2.4 - i * 0.6) * s;
    b.add(G.cone6, T(x, (1.4 + i * 1.0) * s, z, r() * 6, w, 1.7 * s, w), leaf, 0.07, 0.06);
  }
  return 1.1 * s;
};

export const bush: Prop = ({ b, r }, x, z, _ry, s = 1) => {
  const leaf = [COL.leafTeal, COL.leafMoss, COL.leafDeep][Math.floor(r() * 3)];
  for (let i = 0; i < 3; i++) {
    const sz = R(r, 0.8, 1.2) * s;
    b.add(G.ball, T(x + R(r, -0.4, 0.4) * s, sz * 0.38, z + R(r, -0.4, 0.4) * s, r() * 6, sz, sz * 0.8, sz), leaf, 0.1, 0.08);
  }
  if (r() < 0.5) {
    const fc = r() < 0.5 ? COL.flowerPink : COL.flowerGold;
    for (let i = 0; i < 4; i++) b.add(G.ball, T(x + R(r, -0.5, 0.5) * s, 0.75 * s, z + R(r, -0.5, 0.5) * s, 0, 0.16, 0.16, 0.16), fc, 0.1, 0);
  }
  return 0.7 * s;
};

/** Hedge segment along local x, length len. */
export function hedge(c: PropCtx, x: number, z: number, ry: number, len: number) {
  const { b, r } = c;
  const n = Math.max(1, Math.round(len / 1.3));
  for (let i = 0; i < n; i++) {
    const lx = -len / 2 + (i + 0.5) * (len / n);
    const [px, pz] = off(x, z, ry, lx, R(r, -0.1, 0.1));
    const h = R(r, 1.15, 1.45);
    b.add(G.rbox, T(px, h / 2, pz, ry + R(r, -0.05, 0.05), len / n + 0.25, h, 1.2), mix(COL.leafDeep, COL.leafTeal, r() * 0.6), 0.06, 0.07);
    b.add(G.ball, T(px, h, pz, r() * 6, len / n + 0.1, 0.55, 1.1), mix(COL.leafTeal, COL.leafMoss, r()), 0.06, 0.08);
  }
}

/** Low stone wall along local x. */
export function lowWall(c: PropCtx, x: number, z: number, ry: number, len: number, color = COL.stone) {
  const { b, r } = c;
  const n = Math.max(1, Math.round(len / 0.9));
  for (let row = 0; row < 2; row++) {
    let lx = -len / 2 + (row ? 0.3 : 0);
    while (lx < len / 2 - 0.1) {
      const w = Math.min(R(r, 0.6, 1.1), len / 2 - lx);
      const [px, pz] = off(x, z, ry, lx + w / 2, 0);
      b.add(G.rbox, T(px, 0.25 + row * 0.42, pz, ry, w - 0.04, 0.42, 0.7), mix(color, COL.stoneLight, r() * 0.4), 0.07);
      lx += w;
    }
  }
  b.add(G.rbox, T(x, 0.92, z, ry, len + 0.1, 0.16, 0.85), COL.stoneLight, 0.04);
  void n;
}

export const lamp: Prop = ({ b, gl, r }, x, z, ry) => {
  b.add(G.cyl6, T(x, 0.15, z, 0, 0.5, 0.3, 0.5), COL.iron);
  b.add(G.cyl6, T(x, 1.7, z, 0, 0.13, 3.2, 0.13), COL.iron, 0.03);
  const [ax, az] = off(x, z, ry, 0, 0.45);
  b.add(G.box, T((x + ax) / 2, 3.2, (z + az) / 2, ry, 0.08, 0.08, 0.5), COL.iron);
  b.add(G.cone6, T(ax, 3.12, az, 0, 0.45, 0.28, 0.45), COL.iron);
  gl.add(G.ball, T(ax, 2.88, az, 0, 0.32, 0.36, 0.32), 0xffd38a, 0, 0, 2.6);
  b.add(G.cyl6, T(ax, 2.68, az, 0, 0.36, 0.06, 0.36), COL.iron);
  void r;
  return 0.35;
};

export const lantern: Prop = ({ b, gl }, x, z, ry) => {
  // workshop lantern on a wooden pole with a crossbar
  b.add(G.box, T(x, 1.5, z, ry, 0.18, 3.0, 0.18), COL.woodDark);
  const [ax, az] = off(x, z, ry, 0, 0.5);
  b.add(G.box, T((x + ax) / 2, 2.9, (z + az) / 2, ry, 0.1, 0.1, 0.7), COL.woodDark);
  b.add(G.box, T(ax, 2.45, az, ry, 0.34, 0.06, 0.34), COL.brass);
  gl.add(G.box, T(ax, 2.25, az, ry, 0.24, 0.34, 0.24), 0xffb860, 0, 0, 2.4);
  b.add(G.cone6, T(ax, 2.05, az, 0, 0.34, 0.1, 0.34), COL.brass);
  return 0.3;
};

export const bench: Prop = ({ b }, x, z, ry) => {
  b.add(G.box, T(x, 0.45, z, ry, 1.8, 0.1, 0.5), COL.wood, 0.05);
  const [bx, bz] = off(x, z, ry, 0, -0.22);
  b.add(G.box, T(bx, 0.8, bz, ry, 1.8, 0.35, 0.08), COL.wood, 0.05);
  for (const s of [-0.75, 0.75]) {
    const [lx, lz] = off(x, z, ry, s, 0);
    b.add(G.box, T(lx, 0.22, lz, ry, 0.1, 0.45, 0.45), COL.iron);
  }
  return 0.9;
};

export const bookshelf: Prop = ({ b, r }, x, z, ry) => {
  b.add(G.box, T(x, 1.1, z, ry, 1.6, 2.2, 0.5), COL.woodDark, 0.04);
  const books = [0x7b5cff, 0x2ec4b6, 0xff6b5b, 0xffc857, 0x8c5a8a, 0x4a7fb5, 0xd8c8a8];
  for (let row = 0; row < 3; row++) {
    let lx = -0.7;
    while (lx < 0.66) {
      const w = R(r, 0.07, 0.14);
      const h = R(r, 0.38, 0.52);
      const [px, pz] = off(x, z, ry, lx + w / 2, 0.08);
      b.add(G.box, T(px, 0.32 + row * 0.66 + h / 2, pz, ry, w * 0.9, h, 0.36), books[Math.floor(r() * books.length)], 0.12, 0);
      lx += w;
    }
  }
  return 0.9;
};

export const lectern: Prop = ({ b, gl }, x, z, ry) => {
  b.add(G.cyl6, T(x, 0.55, z, 0, 0.25, 1.1, 0.25), COL.woodDark);
  b.add(G.box, T(x, 1.15, z, ry, 0.7, 0.08, 0.55, -0.4), COL.wood);
  const [px, pz] = off(x, z, ry, 0, 0.02);
  gl.add(G.box, T(px, 1.21, pz, ry, 0.5, 0.02, 0.36, -0.4), 0xfff1c8, 0, 0, 1.3);
  return 0.45;
};

export const planter: Prop = ({ b, r }, x, z, ry, s = 1) => {
  b.add(G.cyl6, T(x, 0.35 * s, z, ry, 1.3 * s, 0.7 * s, 1.3 * s), COL.stoneLight, 0.05);
  b.add(G.cyl6, T(x, 0.7 * s, z, ry, 1.15 * s, 0.06, 1.15 * s), COL.woodDark);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * 6.28;
    b.add(G.ball, T(x + Math.cos(a) * 0.3 * s, 0.95 * s, z + Math.sin(a) * 0.3 * s, r() * 6, 0.55 * s, 0.5 * s, 0.55 * s), mix(COL.leafTeal, COL.leafMoss, r()), 0.1);
  }
  const fc = r() < 0.5 ? COL.flowerPink : COL.flowerGold;
  for (let i = 0; i < 5; i++) b.add(G.ball, T(x + R(r, -0.4, 0.4) * s, 1.15 * s, z + R(r, -0.4, 0.4) * s, 0, 0.17, 0.17, 0.17), fc, 0.1, 0);
  return 0.7 * s;
};

export const rock: Prop = ({ b, r }, x, z, ry, s = 1) => {
  b.add(G.dodec, T(x, 0.25 * s, z, ry, R(r, 0.9, 1.3) * s, R(r, 0.6, 0.9) * s, R(r, 0.8, 1.2) * s, r(), r()), mix(COL.stoneDark, COL.stone, r()), 0.08, 0.05);
  return 0.55 * s;
};

export const flowerBed: Prop = ({ b, r }, x, z, ry) => {
  b.add(G.rbox, T(x, 0.12, z, ry, 2.2, 0.24, 1.0), COL.stoneLight, 0.04);
  b.add(G.box, T(x, 0.22, z, ry, 1.95, 0.06, 0.8), 0x4a3a30);
  for (let i = 0; i < 14; i++) {
    const [px, pz] = off(x, z, ry, R(r, -0.85, 0.85), R(r, -0.3, 0.3));
    const fc = [COL.flowerPink, COL.flowerGold, 0xb48cff, 0xffffff][Math.floor(r() * 4)];
    b.add(G.cyl6, T(px, 0.35, pz, 0, 0.04, 0.3, 0.04), COL.leafMoss, 0, 0);
    b.add(G.ball, T(px, 0.52, pz, 0, 0.17, 0.14, 0.17), fc, 0.1, 0);
  }
  return 1.1;
};

// ---------------- workshop props ----------------
export const crate: Prop = ({ b, r }, x, z, ry, s = 1) => {
  const c = mix(COL.wood, 0x9a7050, r() * 0.5);
  b.add(G.rbox, T(x, 0.45 * s, z, ry, 0.9 * s, 0.9 * s, 0.9 * s), c, 0.06);
  for (const lz of [-0.46, 0.46]) {
    const [px, pz] = off(x, z, ry, 0, lz * s);
    b.add(G.box, T(px, 0.45 * s, pz, ry, 0.95 * s, 0.14 * s, 0.03), COL.woodDark, 0.03, 0, 1);
  }
  return 0.6 * s;
};

export const crateStack: Prop = (c, x, z, ry) => {
  crate(c, x, z, ry);
  crate(c, x + 0.95 * Math.cos(ry), z - 0.95 * Math.sin(ry), ry + 0.1, 0.9);
  const { b } = c;
  b.add(G.rbox, T(x + 0.45 * Math.cos(ry), 1.25, z - 0.45 * Math.sin(ry), ry + 0.4, 0.7, 0.7, 0.7), mix(COL.wood, 0xb08860, 0.5), 0.05);
  return 1.2;
};

export const barrel: Prop = ({ b, r }, x, z, ry) => {
  b.add(G.cyl, T(x, 0.5, z, ry, 0.75, 1.0, 0.75), mix(COL.wood, COL.woodDark, r() * 0.5), 0.05);
  b.add(G.cyl, T(x, 0.2, z, ry, 0.79, 0.07, 0.79), COL.iron, 0.02);
  b.add(G.cyl, T(x, 0.8, z, ry, 0.79, 0.07, 0.79), COL.iron, 0.02);
  return 0.45;
};

export const workbench: Prop = ({ b, gl, r }, x, z, ry) => {
  b.add(G.box, T(x, 0.9, z, ry, 2.2, 0.12, 0.9), COL.wood, 0.04);
  for (const [lx, lz] of [[-1, -0.38], [1, -0.38], [-1, 0.38], [1, 0.38]]) {
    const [px, pz] = off(x, z, ry, lx, lz);
    b.add(G.box, T(px, 0.45, pz, ry, 0.12, 0.9, 0.12), COL.woodDark);
  }
  // clutter: vise, gears, a jar glowing with bottled light
  const [vx, vz] = off(x, z, ry, -0.7, 0.1);
  b.add(G.box, T(vx, 1.08, vz, ry, 0.3, 0.25, 0.2), COL.iron);
  const [gx, gz] = off(x, z, ry, 0.2, -0.1);
  b.add(G.cyl6, T(gx, 0.99, gz, ry, 0.45, 0.06, 0.45), COL.brass);
  const [jx, jz] = off(x, z, ry, 0.75, 0.15);
  gl.add(G.cyl6, T(jx, 1.1, jz, 0, 0.18, 0.28, 0.18), r() < 0.5 ? 0x7be0ff : 0xffc857, 0, 0, 1.8);
  return 1.2;
};

export const gear: Prop = ({ b }, x, z, ry, s = 1) => {
  // standing gear monument
  const g = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 14);
  b.add(G.rbox, T(x, 0.3 * s, z, ry, 1.6 * s, 0.6 * s, 0.9 * s), COL.stoneDark);
  b.add(g, T(x, 1.75 * s, z, ry, 2.2 * s, 1, 2.2 * s, Math.PI / 2), COL.brass, 0.05);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const [px, pz] = off(x, z, ry, Math.cos(a) * 1.2 * s, 0);
    b.add(G.box, T(px, 1.75 * s + Math.sin(a) * 1.2 * s, pz, ry, 0.3 * s, 0.3 * s, 0.25, 0, 0), COL.brass, 0.04);
  }
  b.add(G.cyl6, T(x, 1.75 * s, z, ry, 0.5 * s, 0.4, 0.5 * s, Math.PI / 2), COL.iron);
  return 1.3 * s;
};

export const anvil: Prop = ({ b }, x, z, ry) => {
  b.add(G.cyl6, T(x, 0.3, z, ry, 0.55, 0.6, 0.55), COL.woodDark);
  b.add(G.box, T(x, 0.7, z, ry, 0.9, 0.22, 0.38), COL.iron);
  const [hx, hz] = off(x, z, ry, 0.55, 0);
  b.add(G.cone6, T(hx, 0.72, hz, ry, 0.3, 0.5, 0.18, 0, Math.PI / 2), COL.iron);
  return 0.6;
};

export const cart: Prop = ({ b }, x, z, ry) => {
  b.add(G.box, T(x, 0.9, z, ry, 2.0, 0.5, 1.2), COL.wood, 0.04);
  for (const lx of [-0.6, 0.6])
    for (const lz of [-0.66, 0.66]) {
      const [px, pz] = off(x, z, ry, lx, lz);
      b.add(G.cyl, T(px, 0.45, pz, ry, 0.9, 0.12, 0.9, Math.PI / 2), COL.woodDark);
    }
  const [hx, hz] = off(x, z, ry, 1.6, 0);
  b.add(G.box, T(hx, 0.75, hz, ry, 1.4, 0.08, 0.08), COL.woodDark);
  b.add(G.rbox, T(x, 1.35, z, ry, 1.6, 0.45, 1.0), COL.canvas, 0.08);
  return 1.3;
};

export const pipeRun = (c: PropCtx, x: number, z: number, ry: number, len: number) => {
  const { b } = c;
  const [ax, az] = off(x, z, ry, -len / 2, 0);
  const [bx, bz] = off(x, z, ry, len / 2, 0);
  b.add(G.cyl, T(x, 0.35, z, ry, 0.36, len, 0.36, 0, Math.PI / 2), COL.brass, 0.05);
  b.add(G.cyl, T(ax, 0.6, az, ry, 0.36, 0.8, 0.36), COL.brass);
  b.add(G.cyl, T(bx, 0.6, bz, ry, 0.36, 0.8, 0.36), COL.brass);
  for (let i = 0; i <= len; i += 2.5) {
    const [px, pz] = off(x, z, ry, -len / 2 + i, 0);
    b.add(G.box, T(px, 0.2, pz, ry, 0.12, 0.4, 0.5), COL.iron);
  }
};

export const toolRack: Prop = ({ b }, x, z, ry) => {
  b.add(G.box, T(x, 1.2, z, ry, 1.8, 1.8, 0.12), COL.wood);
  for (let i = 0; i < 5; i++) {
    const [px, pz] = off(x, z, ry, -0.7 + i * 0.35, 0.1);
    b.add(G.box, T(px, 1.1, pz, ry, 0.06, 0.9, 0.06), COL.woodDark);
    b.add(G.box, T(px, 1.6, pz, ry, 0.2, 0.14, 0.08), COL.iron);
  }
  return 0.9;
};
