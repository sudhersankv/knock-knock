import * as THREE from 'three';
import type { Collider, Stage, World } from '../contracts';
import type { LockId, LockStatus } from '../../../shared/kk/protocol';
import { at, DOOR, KEYHOLE_Y, PALETTE, SIDE_BOUNDS, THREAD_SLOTS, WALL, objectId, type Side, type V2 } from '../../../shared/kk/layout';
import { Batch, G, T } from './batch';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ArtQuality, ArtUniforms, COL, glowMaterial, patchWorld, worldMaterial } from './mats';
import * as P from './props';
import { glyphStrip, glyphTexture, radialTexture, scriptTexture } from './glyphs';
import { buildPropMeshes, props as kkProps, type PropName } from './kaykit';

/** Agents inside the chamber stand on top of the gatehouse: use this as their y. */
export const CHAMBER_Y = 9;
const GATE = { halfZ: 5.2, halfX: 2.6, height: 9 };

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Path network on side A (mirror x for B). Polylines of [x, z].
const PATHS: V2[][] = [
  [[-2.6, 0], [-8, 0], [-13, 0], [-21, 0], [-28, 1]],
  [[-13, 0], [-13, -8]],
  [[-13, 0], [-16, 5], [-19, 12], [-27, 14]],
  [[-6, 2], [-8.5, 11], [-11, 16.5]],
  [[-15, 0], [-20, -3.5], [-26.5, -11.5]],
  [[-21, 0], [-24, 3.5]],
];
const PATH_W = 1.9;

function distSeg(px: number, pz: number, a: V2, b: V2) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - (a[0] + dx * t), pz - (a[1] + dz * t));
}
function distPaths(x: number, z: number) {
  let d = Infinity;
  for (const p of PATHS) for (let i = 0; i < p.length - 1; i++) d = Math.min(d, distSeg(x, z, p[i], p[i + 1]));
  return d;
}

interface Interactable {
  id: string;
  group: THREE.Group;
  marker: number; // index into the instanced markers, -1 = none
  markerBaseY: number;
  radius: number;
  read: boolean;
}

export function buildWorld(stage: Stage): World {
  const root = new THREE.Group();
  root.name = 'kk-world';
  stage.scene.add(root);
  const colliders: Collider[] = [];
  const aoBlobs: { x: number; z: number; r: number; k?: number }[] = [];
  const pools: { x: number; z: number; r: number; color: string }[] = [];
  const opaque = worldMaterial();
  const glowMat = glowMaterial();
  const kinst: { name: PropName; x: number; y?: number; z: number; ry: number; s?: number }[] = [];
  const puddles: { x: number; z: number; r: number }[] = [];
  const magicPools: { x: number; z: number; r: number }[] = [];

  // =============== static decor per side ===============
  for (const side of ['A', 'B'] as Side[]) {
    const sx = side === 'A' ? 1 : -1; // A-space -> world x multiplier
    const r = mulberry(side === 'A' ? 1337 : 4242);
    const b = new Batch(r), gl = new Batch(r);
    const ctx: P.PropCtx = { b, gl, r };
    const placed: { x: number; z: number; r: number }[] = [];
    const anchors: V2[] = (['spawn', 'companionSpawn', 'keyholeApproach', 'terminal', 'codex', 'board', 'takes', ...THREAD_SLOTS] as const).map((k) => at('A', k));
    const free = (x: number, z: number, rad: number, pathPad = 0.4) => {
      if (x > -3.6 - rad || x < SIDE_BOUNDS.minX + rad + 0.6 || Math.abs(z) > SIDE_BOUNDS.maxZ - rad - 0.8) return false;
      if (distPaths(x, z) < PATH_W / 2 + rad + pathPad) return false;
      for (const a of anchors) if (Math.hypot(x - a[0], z - a[1]) < rad + 2.6) return false;
      for (const p of placed) if (Math.hypot(x - p.x, z - p.z) < rad + p.r + 0.3) return false;
      if (x < -29.8 - rad && side === 'A') return false; // water channel strip
      if (Math.hypot(x + 6, z) < 6.5 + rad) return false; // door plaza
      return true;
    };
    // place in A-space, convert to world for the batch
    const put = (fn: (c: P.PropCtx, x: number, z: number, ry: number, s?: number) => number, x: number, z: number, ry: number, s?: number, collide = true, force = false) => {
      const est = 1.0 * (s ?? 1);
      if (!force && !free(x, z, est * 0.8)) return false;
      const rad = fn(ctx, x * sx, z, ry * sx, s);
      placed.push({ x, z, r: rad });
      aoBlobs.push({ x: x * sx, z, r: rad * 1.5 });
      if (collide) colliders.push({ kind: 'circle', x: x * sx, z, r: rad * 0.85 });
      return true;
    };
    /** KayKit prop (CC0) in A-space; falls back to a procedural prop if assets aren't loaded. */
    const kput = (name: PropName, x: number, z: number, ry: number, s = 1, collide = true, force = true, fallback?: (c: P.PropCtx, x: number, z: number, ry: number, s?: number) => number) => {
      const tpl = kkProps.get(name);
      if (!tpl) return fallback ? put(fallback, x, z, ry, s, collide, force) : false;
      const rad = tpl.radius * s;
      if (!force && !free(x, z, rad)) return false;
      kinst.push({ name, x: x * sx, z, ry: side === 'A' ? ry : -ry, s });
      placed.push({ x, z, r: rad });
      aoBlobs.push({ x: x * sx, z, r: rad * 1.7 });
      if (collide) colliders.push({ kind: 'circle', x: x * sx, z, r: rad * 0.85 });
      return true;
    };
    const lampFn = side === 'A' ? P.lamp : P.lantern;
    const lampSpots: [number, number, number][] = [
      [-3.4, 6.6, 0], [-3.4, -7.2, Math.PI], [-10, 1.8, 0], [-17.5, -1.8, Math.PI], [-24.5, 2.0, 0],
      [-14.8, -5.5, -Math.PI / 2], [-17.6, 9.5, Math.PI / 2], [-9.9, 7.5, Math.PI / 2], [-23.2, -8.6, 0], [-23.5, 12.4, Math.PI],
    ];
    for (const [x, z, ry] of lampSpots) {
      put(lampFn, x, z, ry, 1, true, true);
      pools.push(side === 'A' ? { x: x * sx, z, r: 3.4, color: 'rgba(255,205,140,' } : { x: x * sx, z, r: 4.6, color: 'rgba(255,150,60,' });
    }

    // border hedges / walls
    const hz = SIDE_BOUNDS.maxZ + 0.4;
    for (let x = -3.2; x > SIDE_BOUNDS.minX; x -= 4) {
      const len = Math.min(4, x - SIDE_BOUNDS.minX + 0.6);
      for (const zz of [hz, -hz]) {
        if (side === 'A') P.hedge(ctx, (x - len / 2) * sx, zz, 0, len);
        else P.lowWall(ctx, (x - len / 2) * sx, zz, 0, len, COL.stoneWarm);
      }
    }
    for (let z = -hz; z < hz; z += 4) {
      const len = Math.min(4, hz - z);
      if (side === 'A') P.hedge(ctx, (SIDE_BOUNDS.minX - 0.4) * sx, z + len / 2, Math.PI / 2, len);
      else P.lowWall(ctx, (SIDE_BOUNDS.minX - 0.4) * sx, z + len / 2, Math.PI / 2, len, COL.stoneWarm);
    }
    colliders.push({ kind: 'box', minX: side === 'A' ? -60 : 2, maxX: side === 'A' ? -2 : 60, minZ: SIDE_BOUNDS.maxZ, maxZ: 40 });
    colliders.push({ kind: 'box', minX: side === 'A' ? -60 : 2, maxX: side === 'A' ? -2 : 60, minZ: -40, maxZ: -SIDE_BOUNDS.maxZ });
    colliders.push(side === 'A' ? { kind: 'box', minX: -60, maxX: SIDE_BOUNDS.minX, minZ: -40, maxZ: 40 } : { kind: 'box', minX: -SIDE_BOUNDS.minX, maxX: 60, minZ: -40, maxZ: 40 });

    // planters flanking the door plaza
    put(P.planter, -3.6, 9.2, 0, 1.1, true, true);
    put(P.planter, -3.6, -9.6, 0, 1.1, true, true);

    if (side === 'A') {
      // library garden
      for (const [x, z, ry] of [[-10.6, -11.6, 0], [-15.4, -11.6, 0], [-21.6, 7.6, Math.PI / 2], [-29, -4.5, Math.PI / 2], [-29, 5.5, Math.PI / 2]] as const) kput('shelves', x, z, ry, 0.9, true, true, P.bookshelf);
      for (const [x, z, ry] of [[-17.6, -6.8, 0.6], [-22.4, 16.6, -0.4], [-6.5, 15.4, 0.4]] as const) put(P.lectern, x, z, ry, 1, true, true);
      for (const [x, z, ry] of [[-8.6, -2.6, 0], [-19.5, 2.6, Math.PI], [-25, -1.8, 0]] as const) put(P.bench, x, z, ry, 1, true, true);
      kput('table_small_decorated_A', -16.2, -13.2, 0.3, 0.8);
      kput('chair', -15.0, -13.6, -1.2, 0.8, false);
      kput('candle_triple', -26.2, 11.2, 0, 0.9, false);
      kput('trunk_large_A', -28.6, 0.6, Math.PI / 2, 0.8);
      kput('pillar_decorated', -27.8, -17.6, 0, 0.7);
      kput('pillar_decorated', -27.8, 17.6, 0, 0.7);
      for (const [x, z] of [[-12, 6.5], [-24.5, -13.5], [-20.5, 6.8], [-9.5, -6.8], [-26.8, 4.5]] as const) puddles.push({ x: x * sx, z, r: 0.9 + r() * 0.7 });
      for (const [x, z, ry] of [[-6.2, 11.4, 0.2], [-23.5, -6.4, 1.1], [-11.6, -15.2, 0.5], [-30.6, -11.8, 1.5], [-21.4, 18.0, 0]] as const) put(P.flowerBed, x, z, ry, 1, true);
      for (const [x, z] of [[-14.8, 9.8], [-7.6, 6.2], [-25.6, -9.4], [-30.4, 15.6]] as const) put(P.planter, x, z, 0, 0.9, true);
      for (const [x, z, ry] of [[-7.4, -10.2, 0.3], [-14.2, 15.2, -0.2], [-26.5, 8.6, 1.2]] as const) put(P.flowerBed, x, z, ry, 1, true, true);
      P.lowWall(ctx, -10.5 * sx, -16.6, 0, 6);
      colliders.push({ kind: 'box', minX: -13.6, maxX: -7.4, minZ: -17.1, maxZ: -16.1 });
      P.lowWall(ctx, -27 * sx, -17.4, 0, 5);
      // fountain
      fountain(ctx, -18.5, -15.5);
      colliders.push({ kind: 'circle', x: -18.5, z: -15.5, r: 2.2 });
      aoBlobs.push({ x: -18.5, z: -15.5, r: 3.2 });
      placed.push({ x: -18.5, z: -15.5, r: 2.4 });
      // random fill
      let n = 0;
      for (let i = 0; i < 400 && n < 15; i++) if (put(P.tree, -6 - r() * 26, (r() * 2 - 1) * 18, r() * 6, 0.85 + r() * 0.4)) n++;
      n = 0;
      for (let i = 0; i < 400 && n < 26; i++) if (put(P.bush, -5 - r() * 27, (r() * 2 - 1) * 18.5, r() * 6, 0.7 + r() * 0.5, false)) n++;
      n = 0;
      for (let i = 0; i < 200 && n < 8; i++) if (put(P.rock, -5 - r() * 27, (r() * 2 - 1) * 18, r() * 6, 0.6 + r() * 0.6)) n++;
    } else {
      // cluttered workshop
      for (const [x, z, ry] of [[-19.8, -7.2, 0.2], [-22.5, 9.2, -0.3], [-9.6, -12.6, 0.1], [-28.6, -3, Math.PI / 2]] as const) kput(ry > 1 ? 'table_long_decorated_A' : 'table_medium_decorated_A', x, z, ry, 0.9, true, true, P.workbench);
      for (const [x, z, ry] of [[-6.6, -14.2, 0.3], [-27.6, 17.4, 0.1], [-29.6, -15.6, 1], [-12.2, 18.2, 0], [-30.4, 8.6, 1.4]] as const) kput(r() < 0.5 ? 'crates_stacked' : 'box_stacked', x, z, ry, 0.9, true, true, P.crateStack);
      for (const [x, z] of [[-8.2, -8.6], [-8.9, -9.6], [-25.6, -15.8], [-16.2, 17.8], [-16.9, 17.1], [-31.2, 1.6]] as const) kput(r() < 0.6 ? 'barrel_large' : 'barrel_small_stack', x, z, r() * 6, 0.85, true, true, P.barrel);
      kput('keg_decorated', -13.2, -14.6, 0.4, 0.9);
      kput('chest', -26.2, 14.6, -0.4, 0.9);
      kput('sword_shield', -30.8, -6.4, Math.PI / 2, 0.9, false);
      kput('trunk_large_A', -10.6, 15.6, 0.2, 0.85);
      kput('box_large', -17.6, -11.2, 0.5, 0.8);
      kput('stool', -21.2, -6.0, 0, 0.8, false);
      kput('stool', -23.4, 7.8, 0, 0.8, false);
      kput('bottle_A_labeled_green', -9.0, -11.8, 0, 1, false);
      for (const [x, z] of [[-12.5, 4.6], [-22.8, -9.6], [-15.6, 12.2], [-27.4, -0.8]] as const) puddles.push({ x: x * sx, z, r: 0.8 + r() * 0.8 });
      forge(ctx, -30.2 * sx, 12.0);
      colliders.push({ kind: 'circle', x: -30.2 * sx, z: 12.0, r: 1.6 });
      placed.push({ x: -30.2, z: 12.0, r: 1.8 });
      aoBlobs.push({ x: -30.2 * sx, z: 12, r: 2.6 });
      pools.push({ x: -29.2 * sx, z: 12.0, r: 6, color: 'rgba(255,120,40,' });
      put(P.anvil, -24.2, -4.4, 0.4, 1, true, true);
      put(P.cart, -27.8, 5.2, 1.4, 1, true, true);
      put(P.toolRack, -31.6, -9.6, Math.PI / 2, 1, true, true);
      put(P.toolRack, -6.6, 18.6, Math.PI, 1, true, true);
      put(P.gear, -18.5, -15.5, 0.3, 1.1, true, true);
      P.pipeRun(ctx, -14 * sx, -18.9, 0, 12);
      P.pipeRun(ctx, -20 * sx, 18.9, 0, 10);
      let n = 0;
      for (let i = 0; i < 300 && n < 6; i++) if (put(P.pine, -6 - r() * 26, (r() * 2 - 1) * 18, 0, 0.8 + r() * 0.3)) n++;
      n = 0;
      for (let i = 0; i < 400 && n < 16; i++) {
        const k = r();
        const x = -5 - r() * 27, z = (r() * 2 - 1) * 18.5;
        if (k < 0.3 ? kput('barrel_large', x, z, r() * 6, 0.8, true, false, P.barrel) : k < 0.6 ? kput('box_large', x, z, r() * 6, 0.75, true, false, P.crate) : k < 0.8 ? kput('barrel_small_stack', x, z, r() * 6, 0.8, true, false, P.barrel) : put(P.crate, x, z, r() * 6, 0.8 + r() * 0.3)) n++;
      }
      n = 0;
      for (let i = 0; i < 300 && n < 10; i++) if (put(P.bush, -5 - r() * 27, (r() * 2 - 1) * 18.5, r() * 6, 0.6 + r() * 0.4, false)) n++;
    }

    // outer forest beyond the border (no colliders)
    const fr = mulberry(side === 'A' ? 99 : 77);
    const fctx: P.PropCtx = { b, gl, r: fr };
    for (let i = 0; i < 70; i++) {
      const x = -2 - fr() * 52, z = (fr() * 2 - 1) * 40;
      const inside = x > SIDE_BOUNDS.minX - 2.5 && Math.abs(z) < SIDE_BOUNDS.maxZ + 2.5;
      if (inside) continue;
      (fr() < 0.5 ? P.pine : P.tree)(fctx, x * sx, z, 0, 1.1 + fr() * 0.8);
    }

    const m1 = b.build(opaque);
    const m2 = gl.build(glowMat, false);
    if (m1) root.add(m1);
    if (m2) root.add(m2);
  }

  // =============== water channel (side A) ===============
  const waterMat = new THREE.ShaderMaterial({
    uniforms: { uTime: ArtUniforms.uTime, uA: { value: new THREE.Color(0x1f8f9a) }, uB: { value: new THREE.Color(0x5ff0e0) } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform float uTime; uniform vec3 uA,uB; varying vec3 vW;
      void main(){ float a = sin(vW.z*2.3 + uTime*1.6 + sin(vW.x*3.1)*1.5)*0.5+0.5; float b = sin(vW.z*5.1 - uTime*2.2 + vW.x*4.0)*0.5+0.5;
      float s = smoothstep(0.82,0.98,a*b); vec3 c = mix(uA,uB,a*0.55) + vec3(0.9,1.0,0.95)*s*0.9; gl_FragColor = vec4(c,1.0); }`,
  });
  {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 36), waterMat);
    w.rotation.x = -Math.PI / 2;
    w.position.set(-31.6, 0.06, 0);
    root.add(w);
    const fw = new THREE.Mesh(new THREE.CircleGeometry(1.75, 24), waterMat);
    fw.rotation.x = -Math.PI / 2;
    fw.position.set(-18.5, 0.62, -15.5);
    root.add(fw);
    const r = mulberry(5);
    const b = new Batch(r);
    for (const x of [-30.3, -32.9]) for (let z = -18; z < 18; z += 1.2) b.add(G.rbox, T(x, 0.12, z + 0.6, 0, 0.4, 0.28, 1.15), COL.stoneLight, 0.08);
    // little footbridge
    b.add(G.box, T(-31.6, 0.35, 1, 0, 2.8, 0.14, 1.6), COL.wood, 0.05);
    for (const z of [0.25, 1.75]) b.add(G.box, T(-31.6, 0.7, z, 0, 2.8, 0.08, 0.08), COL.woodDark);
    const m = b.build(opaque);
    if (m) root.add(m);
    colliders.push({ kind: 'box', minX: -33, maxX: -30.2, minZ: -18, maxZ: 0.1 });
    colliders.push({ kind: 'box', minX: -33, maxX: -30.2, minZ: 1.9, maxZ: 18 });
  }

  // =============== the wall + gatehouse ===============
  {
    const r = mulberry(7);
    const b = new Batch(r);
    const gl = new Batch(r);
    const H = WALL.height, hx = WALL.halfThickness, L = WALL.halfLength;
    // core
    for (const [z0, z1] of [[-L, -GATE.halfZ], [GATE.halfZ, L]]) {
      b.add(G.box, T(0, H / 2, (z0 + z1) / 2, 0, hx * 2 - 0.1, H, z1 - z0), COL.stoneDark, 0.02, 0.02);
      // facing blocks, both faces
      for (const fx of [-1, 1]) {
        for (let row = 0; row < 8; row++) {
          const y0 = row * (H / 8);
          let z = z0 + (row % 2 ? 0.6 : 0);
          while (z < z1 - 0.05) {
            const w = Math.min(0.9 + r() * 1.1, z1 - z);
            b.add(G.rbox, T(fx * (hx - 0.02), y0 + H / 16, z + w / 2, 0, 0.3, H / 8 - 0.05, w - 0.05), new THREE.Color(COL.stone).lerp(new THREE.Color(row < 2 ? COL.stoneDark : COL.stoneLight), r() * 0.45), 0.05);
            z += w;
          }
        }
        // buttresses
        for (let z = z0 + 3; z < z1 - 1; z += 6.5) b.add(G.rbox, T(fx * (hx + 0.35), H * 0.42, z, 0, 0.9, H * 0.84, 1.1), COL.stoneDark, 0.05);
      }
      // barrier cap: dark slate roof between two crenellated parapets (reads as a wall, not a walkway)
      b.add(G.box, T(0, H + 0.05, (z0 + z1) / 2, 0, hx * 2 - 0.3, 0.2, z1 - z0), 0x2e2a3e, 0.03, 0.03);
      b.add(G.box, T(0, H + 0.45, (z0 + z1) / 2, 0, 1.3, 0.5, z1 - z0 - 0.4, 0, Math.PI / 4), 0x3a3450, 0.03);
      for (const fx of [-1, 1]) {
        b.add(G.rbox, T(fx * (hx - 0.2), H + 0.22, (z0 + z1) / 2, 0, 0.75, 0.45, z1 - z0), COL.stoneLight, 0.03);
        for (let z = z0 + 0.5; z < z1 - 0.3; z += 1.5) {
          if (r() < 0.08) {
            b.add(G.dodec, T(fx * (hx - 0.2), H + 0.55, z, r() * 6, 0.5, 0.35, 0.5), COL.stone, 0.08);
            continue;
          }
          const mh = 0.95 + r() * 0.15;
          b.add(G.rbox, T(fx * (hx - 0.2), H + 0.45 + mh / 2, z, (r() - 0.5) * 0.05, 0.7, mh, 0.85), new THREE.Color(COL.stoneLight).lerp(new THREE.Color(COL.stone), r() * 0.5), 0.06);
          b.add(G.box, T(fx * (hx - 0.2), H + 0.45 + mh + 0.06, z, 0, 0.78, 0.12, 0.93), 0x4a4560, 0.04);
        }
      }
      colliders.push({ kind: 'box', minX: -hx, maxX: hx, minZ: z0, maxZ: z1 });
      for (const fx of [-1, 1]) aoBlobs.push(...Array.from({ length: Math.ceil((z1 - z0) / 2) }, (_, i) => ({ x: fx * (hx + 0.2), z: z0 + i * 2 + 1, r: 2.2, k: 0.55 })));
    }
    // ivy curtains spilling down both faces (thicker on the garden side)
    for (const fx of [-1, 1]) {
      const n = fx < 0 ? 16 : 7;
      for (let i = 0; i < n; i++) {
        const z = (r() < 0.5 ? -1 : 1) * (GATE.halfZ + 1.2 + r() * (L - GATE.halfZ - 2.5));
        const len = 2.5 + r() * 4;
        const wdt = 1.2 + r() * 1.6;
        for (let k = 0; k < 6; k++) {
          const y = H - 0.25 - (k / 5) * len;
          const w = wdt * (1 - k * 0.12) * (0.8 + r() * 0.4);
          b.add(G.ball, T(fx * (hx + 0.12), y, z + (r() - 0.5) * 0.6, r() * 6, 0.45, 1.1, w), new THREE.Color(COL.leafDeep).lerp(new THREE.Color(fx < 0 ? COL.leafTeal : COL.leafMoss), r()), 0.12, 0.12);
        }
      }
    }
    for (const z of [-14, 13]) {
      b.add(G.cyl, T(hx + 0.3, H / 2, z, 0, 0.35, H, 0.35), COL.brass, 0.04);
      b.add(G.cyl, T(hx + 0.3, 2.6, z + 2.5, 0, 0.3, 5.0, 0.3, Math.PI / 2), COL.brass, 0.04);
    }
    // gatehouse pillars
    for (const zs of [-1, 1]) {
      const zc = zs * (DOOR.halfWidth + (GATE.halfZ - DOOR.halfWidth) / 2);
      const zw = GATE.halfZ - DOOR.halfWidth;
      b.add(G.box, T(0, GATE.height / 2, zc, 0, GATE.halfX * 2, GATE.height, zw), COL.stoneDark, 0.02);
      for (const fx of [-1, 1]) {
        for (let row = 0; row < 10; row++) {
          b.add(G.rbox, T(fx * (GATE.halfX + 0.05), row * 0.9 + 0.45, zc + (row % 2 ? 0.15 : -0.15), 0, 0.35, 0.85, zw - 0.25), new THREE.Color(COL.stoneWarm).lerp(new THREE.Color(COL.stoneLight), r() * 0.4), 0.05);
        }
        // pillar caps / lantern brackets
        gl.add(G.ball, T(fx * (GATE.halfX + 0.55), 5.2, zs * (GATE.halfZ - 0.35), 0, 0.42, 0.5, 0.42), 0xffc857, 0, 0, 2.6);
        b.add(G.cone6, T(fx * (GATE.halfX + 0.55), 5.65, zs * (GATE.halfZ - 0.35), 0, 0.6, 0.4, 0.6), COL.iron);
        b.add(G.box, T(fx * (GATE.halfX + 0.3), 5.0, zs * (GATE.halfZ - 0.35), 0, 0.5, 0.1, 0.1), COL.iron);
        pools.push({ x: fx * (GATE.halfX + 1.8), z: zs * (GATE.halfZ - 0.3), r: 4.2, color: 'rgba(255,200,110,' });
      }
      colliders.push({ kind: 'box', minX: -GATE.halfX, maxX: GATE.halfX, minZ: zs < 0 ? -GATE.halfZ : DOOR.halfWidth, maxZ: zs < 0 ? -DOOR.halfWidth : GATE.halfZ });
    }
    // lintel above door
    b.add(G.box, T(0, (DOOR.height + GATE.height) / 2, 0, 0, GATE.halfX * 2, GATE.height - DOOR.height, DOOR.halfWidth * 2), COL.stoneDark);
    for (const fx of [-1, 1]) {
      b.add(G.rbox, T(fx * (GATE.halfX + 0.08), DOOR.height + 0.25, 0, 0, 0.4, 0.5, DOOR.halfWidth * 2 + 0.6), COL.stoneLight, 0.03);
      b.add(G.rbox, T(fx * (GATE.halfX + 0.08), 7.6, 0, 0, 0.3, 2.3, DOOR.halfWidth * 2 + 0.2), new THREE.Color(COL.stone).lerp(new THREE.Color(0x7d6aa0), 0.3), 0.03);
      gl.add(G.box, T(fx * (GATE.halfX + 0.25), DOOR.height + 0.52, 0, 0, 0.05, 0.06, DOOR.halfWidth * 2 + 0.4), 0xffc857, 0, 0, 2.2);
      // keystone
      b.add(G.rbox, T(fx * (GATE.halfX + 0.2), DOOR.height + 0.4, 0, 0, 0.5, 0.9, 0.8), COL.stoneLight);
      // door frame jambs
      for (const zs of [-1, 1]) b.add(G.rbox, T(fx * (GATE.halfX + 0.06), DOOR.height / 2, zs * (DOOR.halfWidth + 0.2), 0, 0.42, DOOR.height, 0.5), COL.stoneLight, 0.04);
    }
    // gatehouse crown
    b.add(G.rbox, T(0, GATE.height + 0.15, 0, 0, GATE.halfX * 2 + 0.5, 0.3, GATE.halfZ * 2 + 0.5), COL.stoneLight, 0.03);
    for (let z = -GATE.halfZ + 0.4; z <= GATE.halfZ - 0.3; z += 1.3) for (const fx of [-1, 1]) b.add(G.rbox, T(fx * (GATE.halfX + 0.05), GATE.height + 0.7, z, 0, 0.5, 0.8, 0.8), COL.stoneLight, 0.06);
    for (const zs of [-1, 1]) for (const fx of [-1, 1]) b.add(G.rbox, T(fx * 1.6, GATE.height + 0.7, zs * (GATE.halfZ + 0.05), 0, 1.0, 0.8, 0.5), COL.stoneLight, 0.06);
    // chamber pavilion on the crown
    const cy = CHAMBER_Y + 0.3;
    for (const zs of [-1, 1]) for (const fx of [-1, 1]) b.add(G.cyl6, T(fx * 1.85, cy + 1.3, zs * 2.6, 0, 0.32, 2.6, 0.32), COL.stoneLight, 0.03);
    for (const zs of [-1, 1]) b.add(G.box, T(0, cy + 2.65, zs * 2.6, 0, 4.0, 0.2, 0.22), COL.stoneLight);
    for (const fx of [-1, 1]) b.add(G.box, T(fx * 1.85, cy + 2.65, 0, 0, 0.22, 0.2, 5.4), COL.stoneLight);
    // floor disc rim
    b.add(G.cyl, T(0, cy - 0.12, 0, 0, 4.2, 0.24, 5.4), COL.stoneDark);
    const m1 = b.build(opaque);
    const m2 = gl.build(glowMat, false);
    if (m1) root.add(m1);
    if (m2) root.add(m2);
  }

  // door leaves (animated)
  const leafMat = opaque;
  const leaves: THREE.Mesh[] = [];
  const doorCollider: Collider = { kind: 'box', minX: -2.05, maxX: 2.05, minZ: -DOOR.halfWidth, maxZ: DOOR.halfWidth };
  colliders.push(doorCollider);
  for (const zs of [-1, 1]) {
    const r = mulberry(zs > 0 ? 31 : 32);
    const b = new Batch(r), gl = new Batch(r);
    const w = DOOR.halfWidth;
    b.add(G.box, T(0, DOOR.height / 2, 0, 0, 4.0, DOOR.height, w), 0x5a3f4a, 0.02);
    for (const fx of [-1, 1]) {
      // planks
      for (let i = 0; i < 5; i++) b.add(G.box, T(fx * 2.0, DOOR.height / 2 - 0.1, -w / 2 + (i + 0.5) * (w / 5), 0, 0.1, DOOR.height - 0.4, w / 5 - 0.05), new THREE.Color(0x6e4b52).lerp(new THREE.Color(0x8a5f5a), r()), 0.05);
      // iron bands + studs
      for (const y of [1.1, 3.0, 4.9]) {
        b.add(G.box, T(fx * 2.07, y, 0, 0, 0.06, 0.28, w - 0.1), COL.iron, 0.02);
        for (let i = 0; i < 4; i++) gl.add(G.ball, T(fx * 2.1, y, -w / 2 + 0.35 + i * ((w - 0.7) / 3), 0, 0.12, 0.12, 0.12), 0xffc857, 0, 0, 1.4);
      }
      // ornate gold arc
      for (let i = 0; i <= 8; i++) {
        const a = (i / 8) * Math.PI * 0.5;
        gl.add(G.box, T(fx * 2.09, 5.6 - Math.sin(a) * 0.9 + 0.2, -zs * (Math.cos(a) * (w - 0.3) - w / 2) , 0, 0.04, 0.12, 0.3), 0xffc857, 0, 0, 1.6);
      }
    }
    const leaf = new THREE.Group();
    const lm = b.build(leafMat)!;
    const lg = gl.build(glowMat, false)!;
    lm.matrixAutoUpdate = true;
    lg.matrixAutoUpdate = true;
    leaf.add(lm, lg);
    leaf.position.set(0, 0, zs * (w / 2));
    root.add(leaf);
    leaves.push(lm);
    (leaf as any).zs = zs;
  }
  const leafGroups = root.children.filter((c) => (c as any).zs !== undefined) as THREE.Group[];

  // keyholes (one per face)
  const keyholes: Record<Side, THREE.Group> = {} as any;
  const keyFlash: Record<Side, number> = { A: 0, B: 0 };
  const keyGlowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.glow).multiplyScalar(3), toneMapped: false });
  const haloMat = new THREE.MeshBasicMaterial({ map: radialTexture(), color: new THREE.Color(0xffc857).multiplyScalar(1.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const keyShape = new THREE.Shape();
  keyShape.absarc(0, 0.12, 0.16, -Math.PI * 0.25, Math.PI * 1.25, false);
  keyShape.lineTo(-0.13, -0.32);
  keyShape.lineTo(0.13, -0.32);
  keyShape.closePath();
  const keyGeo = new THREE.ShapeGeometry(keyShape, 12);
  for (const side of ['A', 'B'] as Side[]) {
    const fx = side === 'A' ? -1 : 1;
    const g = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.CircleGeometry(0.42, 24), new THREE.MeshStandardMaterial({ color: 0x2a2030, roughness: 0.6, metalness: 0.3 }));
    const kh = new THREE.Mesh(keyGeo, keyGlowMat);
    kh.position.z = 0.02;
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), haloMat);
    halo.position.z = 0.04;
    g.add(plate, kh, halo);
    g.position.set(fx * 2.12, KEYHOLE_Y + 0.1, 0);
    g.rotation.y = fx * Math.PI / 2;
    root.add(g);
    keyholes[side] = g;
    // ground glow in front
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), haloMat.clone());
    (pool.material as THREE.MeshBasicMaterial).color.setRGB(0.6, 0.45, 0.15);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(fx * 2.9, 0.03, 0);
    root.add(pool);
  }

  // runes on the lintel (3 per face)
  const LOCKS: LockId[] = ['codex', 'pulse', 'common'];
  const runes: { lock: LockId; mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; spin: number }[] = [];
  const runeState: Record<LockId, LockStatus> = { codex: 'locked', pulse: 'locked', common: 'locked' };
  const runeB = new Batch(mulberry(9)), runeG = new Batch(mulberry(10));
  const doorRunes: THREE.Mesh[] = [];
  const ringGeo = new THREE.TorusGeometry(0.42, 0.08, 8, 24);
  const backGeo = new THREE.CircleGeometry(0.4, 20);
  for (const side of ['A', 'B'] as Side[]) {
    const fx = side === 'A' ? -1 : 1;
    LOCKS.forEach((lock, i) => {
      const z = (i - 1) * 1.75 * (side === 'A' ? 1 : -1);
      runeB.add(ringGeo, T(fx * (GATE.halfX + 0.25), 7.55, z, Math.PI / 2), COL.stoneLight, 0.02, 0);
      const mat = new THREE.MeshBasicMaterial({ map: glyphTexture(11 + i * 7), transparent: true, color: 0x7b5cff, toneMapped: false, depthWrite: false });
      const disc = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.75), mat);
      disc.position.set(fx * (GATE.halfX + 0.27), 7.55, z);
      disc.rotation.y = fx * Math.PI / 2;
      root.add(disc);
      runeG.add(backGeo, T(fx * (GATE.halfX + 0.24), 7.55, z, fx * Math.PI / 2), 0x1a1428, 0, 0);
      runes.push({ lock, mesh: disc, mat, spin: 0 });
      // small twin on the door face, just above the keyhole: in frame for the 55deg game camera
      const mat2 = new THREE.MeshBasicMaterial({ map: mat.map, transparent: true, color: 0x7b5cff, toneMapped: false, depthWrite: false });
      const d2 = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.46), mat2);
      d2.position.set(fx * 2.13, 1.75, (i - 1) * 0.62 * (side === 'A' ? 1 : -1));
      d2.rotation.y = fx * Math.PI / 2;
      root.add(d2);
      doorRunes.push(d2);
      runes.push({ lock, mesh: d2, mat: mat2, spin: 0 });
    });
  }
  {
    const a = runeB.build(opaque, false), b2 = runeG.build(glowMat, false);
    if (a) root.add(a);
    if (b2) root.add(b2);
  }

  // chamber effects: floor glow, haze, lines
  const chamberFloor = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7b5cff).multiplyScalar(0.8), toneMapped: false, transparent: true, opacity: 0.9 }));
  chamberFloor.rotation.x = -Math.PI / 2;
  chamberFloor.scale.set(1.9, 2.5, 1);
  chamberFloor.position.set(0, CHAMBER_Y + 0.31, 0);
  root.add(chamberFloor);
  const hazeMat = new THREE.MeshBasicMaterial({ color: 0x7b5cff, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const haze = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.1, 2.4, 20, 1, true), hazeMat);
  haze.scale.z = 1.3;
  haze.position.set(0, CHAMBER_Y + 1.5, 0);
  root.add(haze);
  const lineGeo = new THREE.BufferGeometry();
  const LINE_N = 24;
  lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LINE_N * 2 * 3), 3));
  const lineMat = new THREE.LineBasicMaterial({ color: new THREE.Color(0xb6a4ff).multiplyScalar(2), transparent: true, opacity: 0, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false });
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  lines.frustumCulled = false;
  root.add(lines);
  // floating keyhole emblem above the chamber
  const emblem = new THREE.Mesh(keyGeo, keyGlowMat);
  emblem.scale.setScalar(2.2);
  emblem.position.set(0, CHAMBER_Y + 3.6, 0);
  root.add(emblem);

  // rekey pulse: purple shock rings expanding on the ground in front of the door (both sides)
  const pulseMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9d84ff).multiplyScalar(2), transparent: true, opacity: 0, toneMapped: false, depthWrite: false, side: THREE.DoubleSide });
  const pulses = (['A', 'B'] as Side[]).map((sd) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.0, 48), pulseMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(sd === 'A' ? -3.2 : 3.2, 0.06, 0);
    m.visible = false;
    root.add(m);
    return m;
  });
  let rekeyT = 0;

  // warm flood light for the door opening (always present, intensity 0 until open: avoids shader recompiles)
  const flood = new THREE.PointLight(0xffc070, 0, 22, 1.6);
  flood.position.set(0, 3, 0);
  root.add(flood);

  // =============== interactables ===============
  const inter: Interactable[] = [];
  const hitboxes: THREE.Mesh[] = [];
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const markerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xa58cff).multiplyScalar(1.25), toneMapped: false });
  const pulseBars: Record<Side, THREE.Mesh[]> = { A: [], B: [] };
  const codexGlyph: THREE.MeshBasicMaterial[] = [];
  const restoreTargets: Record<Side, number> = { A: 0, B: 0 };

  function addInteractable(side: Side, slot: string, kind: string, idx: number) {
    const id = objectId(side, slot as any);
    const [x, z] = at(side, slot as any);
    const fx = side === 'A' ? -1 : 1;
    const ry = fx * Math.PI / 2; // face toward the camera side (away from the wall)
    const r = mulberry(idx * 97 + (side === 'A' ? 1 : 2));
    const b = new Batch(r), gl = new Batch(r);
    let radius = 1;
    let markerY = 2.6;
    const L = (lx: number, ly: number, lz: number, rot = 0, sx = 1, sy = 1, sz = 1) => T(lx, ly, lz, rot, sx, sy, sz);
    if (kind === 'terminal') {
      b.add(G.cyl6, L(0, 0.5, 0, 0, 1.1, 1.0, 1.1), COL.stoneLight, 0.04);
      b.add(G.cyl6, L(0, 0.08, 0, 0, 1.6, 0.16, 1.6), COL.stoneDark);
      b.add(G.box, L(0, 1.1, 0, 0, 1.2, 0.2, 0.9), COL.stone);
      for (let i = 0; i < 3; i++) {
        b.add(G.cyl, T(-0.35 + i * 0.35, 1.32, 0, 0, 0.26, 0.22, 0.26, 0, Math.PI / 2), COL.brass);
        gl.add(G.box, T(-0.35 + i * 0.35, 1.32, 0.13, 0, 0.05, 0.05, 0.02), 0xffc857, 0, 0, 2.5);
      }
      radius = 0.9;
      markerY = 2.2;
    } else if (kind === 'codex') {
      b.add(G.rbox, L(0, 1.7, 0, 0, 2.4, 3.4, 0.6), COL.stoneLight, 0.03);
      b.add(G.rbox, L(0, 0.2, 0, 0, 3.0, 0.4, 1.0), COL.stoneDark);
      b.add(G.cone6, L(0, 3.6, 0, Math.PI / 6, 1.2, 0.6, 0.5), COL.stoneLight);
      radius = 1.6;
      markerY = 4.4;
    } else if (kind === 'legend' || kind === 'pulse') {
      for (const lx of [-1.0, 1.0]) b.add(G.box, L(lx, 1.1, 0, 0, 0.18, 2.2, 0.18), COL.woodDark);
      b.add(G.box, L(0, 1.55, 0, 0, 2.4, 1.5, 0.12), COL.wood, 0.04);
      b.add(G.box, L(0, 2.38, 0, 0, 2.7, 0.14, 0.4), COL.woodDark);
      if (kind === 'pulse') {
        for (let i = 0; i < 4; i++) b.add(G.box, L(-0.75 + i * 0.5, 1.55, 0.07, 0, 0.32, 1.2, 0.02), 0x2a2238);
      }
      radius = 1.3;
      markerY = 3.2;
    } else if (kind === 'takes') {
      for (let i = 0; i < 6; i++) b.add(G.rbox, L(-1.9 + i * 0.76, 0.75, 0, 0, 0.74, 1.5, 0.6), new THREE.Color(COL.stone).lerp(new THREE.Color(COL.stoneLight), r()), 0.05);
      b.add(G.rbox, L(0, 1.6, 0, 0, 4.8, 0.2, 0.75), COL.stoneLight);
      radius = 2.3;
      markerY = 2.8;
    } else {
      // threads: variety
      const v = idx % 3;
      if (v === 0) {
        for (const lx of [-0.65, 0.65]) b.add(G.box, L(lx, 0.95, 0, 0, 0.14, 1.9, 0.14), COL.woodDark);
        b.add(G.box, L(0, 1.35, 0, 0, 1.6, 1.0, 0.08), COL.wood, 0.05);
        b.add(G.cone6, L(0, 2.05, 0, Math.PI / 6, 2.0, 0.45, 0.6), COL.woodDark);
        const notes = [0xfff1c8, 0xffd6e0, 0xd6f5ef, 0xfff1c8];
        for (let i = 0; i < 4; i++) b.add(G.box, T(-0.45 + (i % 2) * 0.85 + r() * 0.1, 1.15 + Math.floor(i / 2) * 0.42, 0.06, 0, 0.5, 0.34, 0.02, 0, (r() - 0.5) * 0.3), notes[i], 0.03, 0);
        markerY = 2.8;
      } else if (v === 1) {
        b.add(G.dodec, L(0, 0.6, 0, 0, 1.6, 1.3, 1.2), COL.stoneLight, 0.04);
        b.add(G.cyl6, L(0, 0.05, 0, 0, 2.0, 0.1, 1.6), COL.stoneDark);
        markerY = 2.2;
      } else {
        b.add(G.rbox, L(0, 0.45, 0, 0, 1.2, 0.9, 1.2), COL.stoneDark);
        b.add(G.cone6, L(0, 1.45, 0, 0, 0.7, 1.2, 0.6), COL.stoneLight);
        b.add(G.ball, L(0, 2.25, 0, 0, 0.6, 0.6, 0.6), COL.stoneLight);
        b.add(G.cone6, L(0.18, 2.6, 0, 0, 0.16, 0.3, 0.16), COL.stoneLight);
        b.add(G.cone6, L(-0.18, 2.6, 0, 0, 0.16, 0.3, 0.16), COL.stoneLight);
        gl.add(G.ball, L(0.12, 2.3, 0.26, 0, 0.1, 0.1, 0.1), 0x9d84ff, 0, 0, 2.5);
        gl.add(G.ball, L(-0.12, 2.3, 0.26, 0, 0.1, 0.1, 0.1), 0x9d84ff, 0, 0, 2.5);
        markerY = 3.3;
      }
      radius = 1.0;
    }
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = ry;
    group.updateMatrix();
    // static geometry goes into two world-wide merged meshes (1 draw call each for ALL interactables)
    const m = b.build(opaque);
    if (m) interOpaque.push(m.geometry.applyMatrix4(group.matrix));
    const g2 = gl.build(glowMat, false);
    if (g2) interGlow.push(g2.geometry.applyMatrix4(group.matrix));
    // emissive faces
    if (kind === 'codex') {
      const mat = new THREE.MeshBasicMaterial({ map: scriptTexture(idx + 3), transparent: true, color: new THREE.Color(0xffc857).multiplyScalar(1.6), toneMapped: false, depthWrite: false });
      const face = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.9), mat);
      face.position.set(0, 1.75, 0.42);
      group.add(face);
      codexGlyph.push(mat);
    }
    if (kind === 'legend') {
      const mat = new THREE.MeshBasicMaterial({ map: glyphStrip([11, 18, 25, 32], 64, 11), transparent: true, color: new THREE.Color(0x9d84ff).multiplyScalar(1.8), toneMapped: false, depthWrite: false });
      const d = new THREE.Mesh(new THREE.PlaneGeometry(0.53 * 4, 0.45), mat);
      d.position.set(-0.8 + 1.5 * 0.53, 1.62, 0.07);
      group.add(d);
    }
    if (kind === 'pulse') {
      for (let i = 0; i < 4; i++) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.26, 1, 0.03), new THREE.MeshBasicMaterial({ color: new THREE.Color([0x2ec4b6, 0xff6b5b, 0xffc857, 0x7b5cff][i]).multiplyScalar(1.5), toneMapped: false }));
        bar.position.set(-0.75 + i * 0.5, 1.0, 0.09);
        group.add(bar);
        pulseBars[side].push(bar);
      }
    }
    if (kind === 'takes') {
      const mat = new THREE.MeshBasicMaterial({ map: glyphStrip([200, 213, 226, 239, 252], 64, 33), transparent: true, color: new THREE.Color(0xffc857).multiplyScalar(1.5), toneMapped: false, depthWrite: false });
      const d = new THREE.Mesh(new THREE.PlaneGeometry(0.76 * 5, 0.5), mat);
      d.position.set(-1.52 + 2 * 0.76, 0.95, 0.42);
      group.add(d);
    }
    root.add(group);
    aoBlobs.push({ x, z, r: radius * 1.6 });
    colliders.push({ kind: 'circle', x, z, r: radius * 0.75 });
    const hb = new THREE.Mesh(new THREE.BoxGeometry(radius * 2 + 0.4, markerY, radius * 2 + 0.4), hitMat);
    hb.position.set(x, markerY / 2, z);
    hb.userData.id = id;
    root.add(hb);
    hitboxes.push(hb);
    const marker = kind !== 'terminal' ? markerCount++ : -1;
    inter.push({ id, group, marker, markerBaseY: markerY, radius, read: false });
  }
  const interOpaque: THREE.BufferGeometry[] = [];
  const interGlow: THREE.BufferGeometry[] = [];
  let markerCount = 0;
  for (const side of ['A', 'B'] as Side[]) {
    addInteractable(side, 'terminal', 'terminal', 0);
    addInteractable(side, 'codex', 'codex', 1);
    addInteractable(side, 'board', side === 'A' ? 'legend' : 'pulse', 2);
    addInteractable(side, 'takes', 'takes', 3);
    THREAD_SLOTS.forEach((s, i) => addInteractable(side, s, 'thread', 4 + i));
  }

  {
    const a = new THREE.Mesh(mergeGeometries(interOpaque, false)!, opaque);
    a.castShadow = a.receiveShadow = true;
    const b2 = new THREE.Mesh(mergeGeometries(interGlow, false)!, glowMat);
    root.add(a, b2);
  }
  // all floating markers: ONE instanced mesh
  const markers = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.3, 0), markerMat, markerCount);
  markers.frustumCulled = false;
  const mkColor = new THREE.Color(1, 1, 1);
  for (let i = 0; i < markerCount; i++) markers.setColorAt(i, mkColor);
  root.add(markers);
  const mkM = new THREE.Matrix4(), mkQ = new THREE.Quaternion(), mkS = new THREE.Vector3(), mkP = new THREE.Vector3(), mkUp = new THREE.Vector3(0, 1, 0);

  // highlight ring
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc857).multiplyScalar(1.6), transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1.0, 48), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  root.add(ring);
  let highlighted: Interactable | null = null;
  const checkTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d')!;
    x.strokeStyle = '#fff';
    x.lineWidth = 9;
    x.lineCap = 'round';
    x.beginPath();
    x.moveTo(14, 34);
    x.lineTo(27, 47);
    x.lineTo(51, 18);
    x.stroke();
    return new THREE.CanvasTexture(c);
  })();

  // =============== KayKit wall dressing + merged prop meshes ===============
  if (kkProps.size) {
    const rr = mulberry(55);
    for (const fx of [-1, 1]) {
      for (const z of [-21, -16, -9.5, 9.5, 16, 21]) {
        kinst.push({ name: 'torch_mounted', x: fx * (WALL.halfThickness + 0.05), y: 2.6, z, ry: fx < 0 ? -Math.PI / 2 : Math.PI / 2, s: 1 });
        pools.push({ x: fx * (WALL.halfThickness + 1.6), z, r: 3.2, color: fx < 0 ? 'rgba(255,190,120,' : 'rgba(255,140,60,' });
      }
      for (const z of [-12.8, 12.8, -19, 19]) kinst.push({ name: fx < 0 ? 'banner_patternA_green' : 'banner_patternB_red', x: fx * (WALL.halfThickness + 0.1), y: 3.4, z, ry: fx < 0 ? -Math.PI / 2 : Math.PI / 2, s: 1.2 });
      for (let i = 0; i < 6; i++) {
        const z = (rr() < 0.5 ? -1 : 1) * (GATE.halfZ + 2 + rr() * 16);
        kinst.push({ name: rr() < 0.5 ? 'rubble_half' : 'rubble_large', x: fx * (WALL.halfThickness + 0.6), z, ry: rr() * 6, s: 0.6 + rr() * 0.3 });
      }
      for (const zs of [-1, 1]) kinst.push({ name: 'pillar_decorated', x: fx * (GATE.halfX + 0.9), z: zs * (GATE.halfZ + 0.6), ry: 0, s: 0.75 });
    }
    for (const m of buildPropMeshes(kinst)) root.add(m);
  }

  // =============== ground ===============
  for (const it of inter) magicPools.push({ x: it.group.position.x, z: it.group.position.z, r: it.radius + 1.6 });
  const ground = paintGround(aoBlobs, pools, puddles, magicPools);
  root.add(ground);
  const far = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), patchWorld(new THREE.MeshStandardMaterial({ color: 0x2c3326, roughness: 1 }), { baseAO: 0, restore: false }));
  far.rotation.x = -Math.PI / 2;
  far.position.y = -0.05;
  far.receiveShadow = true;
  root.add(far);

  // =============== fireflies ===============
  const FF = 90;
  const ffPos = new Float32Array(FF * 3);
  const ffSeed = new Float32Array(FF);
  {
    const r = mulberry(888);
    for (let i = 0; i < FF; i++) {
      const sideX = r() < 0.5 ? -1 : 1;
      ffPos[i * 3] = sideX * (3 + r() * 30);
      ffPos[i * 3 + 1] = 0.6 + r() * 2.5;
      ffPos[i * 3 + 2] = (r() * 2 - 1) * 19;
      ffSeed[i] = r() * 100;
    }
  }
  const ffGeo = new THREE.BufferGeometry();
  ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos.slice(), 3));
  const ffMat = new THREE.PointsMaterial({ size: 0.22, map: radialTexture(), color: new THREE.Color(0xe8ff9a).multiplyScalar(2.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const fireflies = new THREE.Points(ffGeo, ffMat);
  fireflies.frustumCulled = false;
  root.add(fireflies);

  // =============== state + API ===============
  let doorT = 0, doorTarget = 0;
  let budget = 5, budgetShown = 5;
  let chamberLevel = 0, chamberTarget = 0;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let time = 0;
  let codexRewrite = 0;

  const world: World = {
    root,
    colliders,
    update(dt, t) {
      time = t;
      // door
      doorT += (doorTarget - doorT) * Math.min(1, dt * 1.2);
      const e = doorT * doorT * (3 - 2 * doorT);
      for (const g of leafGroups) g.position.z = (g as any).zs * (DOOR.halfWidth / 2 + e * (DOOR.halfWidth + 0.1));
      flood.intensity = e * 60;
      for (const s of ['A', 'B'] as Side[]) {
        keyFlash[s] = Math.max(0, keyFlash[s] - dt * 2.2);
        const g = keyholes[s];
        const sc = (0.75 + (budgetShown - 4) * 0.17) * (1 - e) * (1 + keyFlash[s] * 0.35);
        g.scale.setScalar(Math.max(0.001, sc));
        (g.children[2] as THREE.Mesh).scale.setScalar(1 + keyFlash[s] * 0.5 + Math.sin(t * 2.5) * 0.06);
      }
      budgetShown += (budget - budgetShown) * Math.min(1, dt * 3);
      keyGlowMat.color.setRGB(3, 2.2, 0.9).multiplyScalar(1 + 0.15 * Math.sin(t * 3) + Math.max(keyFlash.A, keyFlash.B) * 0.6);
      if (rekeyT > 0) keyGlowMat.color.lerp(new THREE.Color(1.6, 1.1, 3.2), Math.min(1, rekeyT));
      for (const d of doorRunes) d.visible = e < 0.15;
      if (rekeyT > 0) {
        rekeyT = Math.max(0, rekeyT - dt);
        const k = 1 - rekeyT / 1.6;
        for (const p of pulses) {
          p.visible = rekeyT > 0;
          p.scale.setScalar(0.5 + k * 7);
        }
        pulseMat.opacity = (1 - k) * 0.9;
      }
      // runes
      for (const ru of runes) {
        if (ru.spin > 0) {
          ru.spin = Math.max(0, ru.spin - dt);
          ru.mesh.rotation.z = Math.pow(ru.spin, 2) * 9;
        }
        const st = runeState[ru.lock];
        const k = st === 'open' ? 3.0 : st === 'waiting' ? 1.6 + Math.sin(t * 6) * 0.9 : st === 'failed' ? 1.4 : 0.9;
        const c = st === 'open' ? 0xffc857 : st === 'failed' ? 0xff6b5b : st === 'waiting' ? 0xffd98a : 0x7b5cff;
        ru.mat.color.set(c).multiplyScalar(k);
      }
      // chamber
      chamberLevel += (chamberTarget - chamberLevel) * Math.min(1, dt * 2.5);
      hazeMat.opacity = 0.05 + chamberLevel * 0.25;
      (chamberFloor.material as THREE.MeshBasicMaterial).color.setRGB(0.48, 0.36, 1).multiplyScalar(0.5 + chamberLevel * 1.4 + Math.sin(t * 4) * 0.1 * chamberLevel);
      lineMat.opacity = chamberLevel;
      if (chamberLevel > 0.01) {
        const p = lineGeo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < LINE_N; i++) {
          const a = t * (0.8 + (i % 5) * 0.2) + i * 1.7;
          const a2 = a + 0.9 + Math.sin(t + i) * 0.5;
          const r1 = 0.6 + (i % 3) * 0.45, r2 = 0.6 + ((i + 1) % 3) * 0.45;
          p.setXYZ(i * 2, Math.cos(a) * r1 * 0.9, CHAMBER_Y + 0.6 + (i % 4) * 0.45 + Math.sin(a * 2) * 0.2, Math.sin(a) * r1 * 1.3);
          p.setXYZ(i * 2 + 1, Math.cos(a2) * r2 * 0.9, CHAMBER_Y + 0.8 + ((i + 2) % 4) * 0.45, Math.sin(a2) * r2 * 1.3);
        }
        p.needsUpdate = true;
      }
      emblem.position.y = CHAMBER_Y + 3.6 + Math.sin(t * 1.5) * 0.15;
      emblem.rotation.y = t * 0.6;
      // markers bob
      for (const it of inter) if (it.marker >= 0) {
        const sc = it.read ? 0.7 : 1;
        mkP.set(it.group.position.x, it.markerBaseY + Math.sin(t * 2 + it.markerBaseY * 3) * 0.12, it.group.position.z);
        mkQ.setFromAxisAngle(mkUp, t * 1.4);
        mkS.set(sc, sc * 1.5, sc);
        markers.setMatrixAt(it.marker, mkM.compose(mkP, mkQ, mkS));
      }
      markers.instanceMatrix.needsUpdate = true;
      if (highlighted && ring.visible) {
        const s = highlighted.radius + 0.5 + Math.sin(t * 4) * 0.06;
        ring.scale.set(s, s, 1);
        ringMat.opacity = 0.65 + Math.sin(t * 4) * 0.25;
      }
      // codex rewrite flicker
      if (codexRewrite > 0) {
        codexRewrite = Math.max(0, codexRewrite - dt);
        for (const m of codexGlyph) {
          m.opacity = 0.3 + 0.7 * Math.abs(Math.sin(codexRewrite * 30));
          if (m.map) m.map.offset.y = Math.floor(codexRewrite * 12) * 0.13;
        }
        if (codexRewrite === 0) for (const m of codexGlyph) { m.opacity = 1; if (m.map) m.map.offset.y = 0; }
      }
      // pulse bars breathe
      for (const s of ['A', 'B'] as Side[]) pulseBars[s].forEach((bar, i) => {
        const h = 0.35 + 0.55 * (0.5 + 0.5 * Math.sin(t * 0.7 + i * 1.9));
        bar.scale.y = h * 1.1;
        bar.position.y = 0.88 + bar.scale.y / 2;
      });
      // restore easing
      for (const s of ['A', 'B'] as Side[]) {
        const u = s === 'A' ? ArtUniforms.uRestoreA : ArtUniforms.uRestoreB;
        u.value += (restoreTargets[s] - u.value) * Math.min(1, dt * 1.5);
      }
      // fireflies
      const fp = ffGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < FF; i++) {
        const sd = ffSeed[i];
        fp.setXYZ(i, ffPos[i * 3] + Math.sin(t * 0.3 + sd) * 1.2, ffPos[i * 3 + 1] + Math.sin(t * 0.9 + sd * 2) * 0.4, ffPos[i * 3 + 2] + Math.cos(t * 0.25 + sd) * 1.2);
      }
      fp.needsUpdate = true;
      ffGeo.setDrawRange(0, ArtQuality.level === 'low' ? 30 : FF);
      ffMat.opacity = 0.55 + 0.45 * Math.sin(t * 2.1);
      void dt;
    },
    setDoorOpen(t) {
      doorTarget = THREE.MathUtils.clamp(t, 0, 1);
      const i = colliders.indexOf(doorCollider);
      if (doorTarget >= 0.9 && i >= 0) colliders.splice(i, 1);
      else if (doorTarget < 0.9 && i < 0) colliders.push(doorCollider);
    },
    setBudget(n) {
      budget = n;
    },
    flashKeyhole(side) {
      keyFlash[side] = 1;
    },
    setChamberActivity(level) {
      chamberTarget = THREE.MathUtils.clamp(level, 0, 1);
    },
    rekey(lockId) {
      for (const ru of runes) if (ru.lock === lockId) ru.spin = 1.4;
      rekeyT = 1.6;
      if (lockId === 'codex') codexRewrite = 1.6;
    },
    setLockStates(states) {
      Object.assign(runeState, states);
    },
    setRestore(side, amount) {
      restoreTargets[side] = THREE.MathUtils.clamp(amount, 0, 1);
    },
    highlight(id) {
      highlighted = id ? inter.find((i) => i.id === id) ?? null : null;
      ring.visible = !!highlighted;
      if (highlighted) ring.position.set(highlighted.group.position.x, 0.05, highlighted.group.position.z);
    },
    markRead(id) {
      const it = inter.find((i) => i.id === id);
      if (!it || it.read || it.marker < 0) return;
      it.read = true;
      markers.setColorAt(it.marker, mkColor.setRGB(0.42, 0.4, 0.5));
      markers.instanceColor!.needsUpdate = true;
      const chk = new THREE.Sprite(new THREE.SpriteMaterial({ map: checkTex, color: new THREE.Color(0x2ec4b6).multiplyScalar(1.5), toneMapped: false, depthWrite: false }));
      chk.scale.setScalar(0.5);
      chk.position.set(0.45, 0.25, 0);
      chk.position.set(it.group.position.x + 0.45, it.markerBaseY + 0.25, it.group.position.z);
      root.add(chk);
    },
    pick(nx, ny) {
      ndc.set(nx, ny);
      raycaster.setFromCamera(ndc, stage.camera);
      const hit = raycaster.intersectObjects(hitboxes, false)[0];
      return hit ? (hit.object.userData.id as string) : null;
    },
  };
  void time;
  return world;
}

// --------------------------------------------------------------------------------------------
function forge(c: P.PropCtx, x: number, z: number) {
  const { b, gl } = c;
  b.add(G.rbox, T(x, 0.5, z, 0, 2.4, 1.0, 2.0), COL.stoneDark, 0.05);
  b.add(G.rbox, T(x, 1.05, z, 0, 2.0, 0.2, 1.6), 0x4a3a36, 0.04);
  gl.add(G.box, T(x, 1.17, z, 0, 1.6, 0.06, 1.2), 0xff7a2a, 0, 0, 2.6);
  for (let i = 0; i < 9; i++) gl.add(G.dodec, T(x + (i % 3 - 1) * 0.45, 1.22, z + (Math.floor(i / 3) - 1) * 0.35, i, 0.3, 0.16, 0.3), i % 2 ? 0xffb347 : 0xff5a1f, 0, 0, 3.0);
  b.add(G.cyl6, T(x + (x < 0 ? -0.6 : 0.6), 2.8, z, 0, 0.7, 3.4, 0.7), COL.stoneDark, 0.05);
  b.add(G.cone6, T(x + (x < 0 ? -0.6 : 0.6), 4.7, z, 0, 1.0, 0.5, 1.0), COL.iron);
  b.add(G.cyl6, T(x, 0.5, z + 1.5, 0, 0.6, 1.0, 0.6), 0x3a5060, 0.04);
  gl.add(G.disc, T(x, 1.0, z + 1.5, 0, 0.5, 1, 0.5, -Math.PI / 2), 0x2a6a80, 0, 0, 1.2);
}

function fountain(c: P.PropCtx, x: number, z: number) {
  const { b, gl } = c;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    b.add(G.rbox, T(x + Math.cos(a) * 1.95, 0.32, z + Math.sin(a) * 1.95, -a, 0.5, 0.64, 0.95), COL.stoneLight, 0.06);
  }
  b.add(G.cyl6, T(x, 0.9, z, 0, 0.5, 1.8, 0.5), COL.stoneLight);
  b.add(G.cyl6, T(x, 1.7, z, 0, 1.3, 0.2, 1.3), COL.stoneLight);
  gl.add(G.ball, T(x, 2.0, z, 0, 0.35, 0.35, 0.35), 0x7be0ff, 0, 0, 2.0);
}

/** Paint the hand-made ground: grass/cobbles, flagstone paths, plaza, baked AO and lamp light pools. */
function paintGround(ao: { x: number; z: number; r: number; k?: number }[], pools: { x: number; z: number; r: number; color: string }[], puddles: { x: number; z: number; r: number }[], magic: { x: number; z: number; r: number }[]): THREE.Mesh {
  const W = 120, D = 80, PPM = 26;
  const cw = W * PPM, ch = D * PPM;
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const g = c.getContext('2d')!;
  const X = (x: number) => (x + W / 2) * PPM;
  const Z = (z: number) => (z + D / 2) * PPM;
  const r = mulberry(2024);
  // base: outside forest floor
  g.fillStyle = '#2f3a2a';
  g.fillRect(0, 0, cw, ch);
  // side A: moss lawn; side B: cool cobble yard
  const bx0 = SIDE_BOUNDS.minX - 1, bz = SIDE_BOUNDS.maxZ + 1;
  g.fillStyle = '#62804f';
  g.fillRect(X(bx0), Z(-bz), (-2 - bx0) * PPM, bz * 2 * PPM);
  g.fillStyle = '#665a58';
  g.fillRect(X(2), Z(-bz), (-2 - bx0) * PPM, bz * 2 * PPM);
  // blotches
  for (let i = 0; i < 1600; i++) {
    const x = (r() * 2 - 1) * 58, z = (r() * 2 - 1) * 38;
    const inA = x < -2 && x > bx0 && Math.abs(z) < bz;
    const inB = x > 2 && x < -bx0 && Math.abs(z) < bz;
    const col = inA ? (r() < 0.5 ? 'rgba(120,150,90,0.18)' : 'rgba(40,70,50,0.2)') : inB ? (r() < 0.5 ? 'rgba(120,112,130,0.2)' : 'rgba(60,55,70,0.2)') : (r() < 0.5 ? 'rgba(70,90,60,0.2)' : 'rgba(25,30,30,0.25)');
    g.fillStyle = col;
    g.beginPath();
    g.ellipse(X(x), Z(z), (0.6 + r() * 2.5) * PPM, (0.5 + r() * 2) * PPM, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  // B cobbles everywhere in the yard
  for (let z = -bz; z < bz; z += 0.27) {
    for (let x = 2.1 + (Math.round(z / 0.27) % 2 ? 0.14 : 0); x < -bx0; x += 0.29) {
      const v = 78 + r() * 34;
      const warm = 0.5 + 0.5 * Math.sin(x * 0.35 + z * 0.22);
      g.fillStyle = `rgb(${v + 14 + warm * 12},${v + 4 + warm * 3},${v - 2})`;
      g.beginPath();
      g.ellipse(X(x + r() * 0.04), Z(z + r() * 0.04), 0.125 * PPM, 0.105 * PPM, r(), 0, Math.PI * 2);
      g.fill();
    }
  }
  // grass tufts in A
  g.strokeStyle = 'rgba(150,190,110,0.35)';
  g.lineWidth = 1.5;
  for (let i = 0; i < 5000; i++) {
    const x = bx0 + r() * (-2 - bx0), z = (r() * 2 - 1) * bz;
    g.beginPath();
    g.moveTo(X(x), Z(z));
    g.lineTo(X(x + (r() - 0.5) * 0.1), Z(z - 0.18 - r() * 0.15));
    g.stroke();
  }
  // paths: flagstones (A) and big warm slabs (B). Build a mask, lay a jittered stone grid, keep it inside the mask.
  for (const sideX of [1, -1]) {
    const mask = document.createElement('canvas');
    mask.width = cw;
    mask.height = ch;
    const mg = mask.getContext('2d')!;
    mg.fillStyle = '#fff';
    mg.strokeStyle = '#fff';
    mg.lineCap = 'round';
    mg.lineJoin = 'round';
    mg.lineWidth = PATH_W * PPM;
    for (const p of PATHS) for (let i = 0; i < p.length - 1; i++) {
      const [ax, az] = p[i], [bx, bz] = p[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      for (let s = 0; s <= len; s += 0.25) {
        const k = s / len;
        mg.beginPath();
        mg.arc(X((ax + (bx - ax) * k) * sideX), Z(az + (bz - az) * k), (PATH_W / 2) * PPM, 0, Math.PI * 2);
        mg.fill();
      }
    }
    mg.beginPath();
    mg.arc(X(-4.6 * sideX), Z(0), 4.8 * PPM, 0, Math.PI * 2);
    mg.fill();
    // fill the door tunnel floor (half per side), nothing else under the wall
    mg.fillRect(sideX > 0 ? X(-2.7) : X(0), Z(-3.1), 2.7 * PPM, 6.2 * PPM);
    mg.clearRect(sideX > 0 ? X(0) : 0, 0, sideX > 0 ? cw : X(0), ch);
    mg.clearRect(sideX > 0 ? X(-2.1) : X(0), 0, 2.1 * PPM, Z(-3.1));
    mg.clearRect(sideX > 0 ? X(-2.1) : X(0), Z(3.1), 2.1 * PPM, ch);
    // soft dark rim under the path edge
    g.save();
    g.globalCompositeOperation = 'source-over';
    // re-tint: draw the rim dark by using the mask as alpha
    const rim = document.createElement('canvas');
    rim.width = cw; rim.height = ch;
    const rg = rim.getContext('2d')!;
    rg.fillStyle = 'rgba(24,20,36,1)';
    rg.fillRect(0, 0, cw, ch);
    rg.globalCompositeOperation = 'destination-in';
    rg.filter = 'blur(7px)';
    rg.drawImage(mask, 0, 4);
    g.globalAlpha = 0.45;
    g.drawImage(rim, 0, 0);
    g.restore();
    // stones layer
    const st = document.createElement('canvas');
    st.width = cw; st.height = ch;
    const sg = st.getContext('2d')!;
    sg.fillStyle = sideX > 0 ? '#4a4658' : '#4e4650';
    sg.fillRect(0, 0, cw, ch);
    const cell = sideX > 0 ? 0.38 : 0.48;
    const x0 = sideX > 0 ? -36 : 0, x1 = sideX > 0 ? 0 : 36;
    for (let z = -22; z < 22; z += cell) {
      const rowOff = (Math.round(z / cell) % 2) * cell * 0.5;
      for (let x = x0 + rowOff; x < x1; x += cell) {
        const v = sideX > 0 ? 132 + r() * 26 : 124 + r() * 22;
        const tint = Math.sin(x * 0.4 + z * 0.3) * 8;
        sg.fillStyle = sideX > 0 ? `rgb(${v + 2 + tint},${v - 2 + tint},${v + 16})` : `rgb(${v + 22 + tint},${v + 6},${v - 8 - tint})`;
        const w = cell * (0.86 + r() * 0.08) * PPM, h = cell * (0.84 + r() * 0.1) * PPM;
        const cx = X(x + (r() - 0.5) * 0.06), cz = Z(z + (r() - 0.5) * 0.06);
        const rr = Math.min(w, h) * 0.28;
        sg.beginPath();
        sg.roundRect(cx - w / 2, cz - h / 2, w, h, rr);
        sg.fill();
        // top-left highlight for a little bevel
        sg.fillStyle = 'rgba(255,245,255,0.07)';
        sg.beginPath();
        sg.roundRect(cx - w / 2 + 1, cz - h / 2 + 1, w - 3, h * 0.45, rr);
        sg.fill();
      }
    }
    // worn moss in the cracks on A
    if (sideX > 0) for (let i = 0; i < 900; i++) {
      sg.fillStyle = `rgba(90,130,80,${0.15 + r() * 0.2})`;
      sg.beginPath();
      sg.arc(X(x0 + r() * (x1 - x0)), Z((r() * 2 - 1) * 20), (0.08 + r() * 0.25) * PPM, 0, Math.PI * 2);
      sg.fill();
    }
    sg.globalCompositeOperation = 'destination-in';
    sg.drawImage(mask, 0, 0);
    g.drawImage(st, 0, 0);
  }
  // dark band at the foot of the wall + baked AO blobs
  const blob = (x: number, z: number, rad: number, k: number) => {
    const gr = g.createRadialGradient(X(x), Z(z), 0, X(x), Z(z), rad * PPM);
    gr.addColorStop(0, `rgba(18,14,30,${k})`);
    gr.addColorStop(1, 'rgba(18,14,30,0)');
    g.fillStyle = gr;
    g.fillRect(X(x) - rad * PPM, Z(z) - rad * PPM, rad * 2 * PPM, rad * 2 * PPM);
  };
  for (const a of ao) blob(a.x, a.z, a.r, a.k ?? 0.42);
  // worn darker cart tracks on B, leaves on A
  g.strokeStyle = 'rgba(40,30,30,0.18)';
  g.lineWidth = 0.35 * PPM;
  for (const off of [-0.55, 0.55]) {
    g.beginPath();
    g.moveTo(X(3), Z(off));
    g.bezierCurveTo(X(12), Z(off + 1.5), X(20), Z(off - 1.5), X(30), Z(off + 1));
    g.stroke();
  }
  for (let i = 0; i < 700; i++) {
    const x = bx0 + r() * (-2 - bx0), z = (r() * 2 - 1) * bz;
    g.fillStyle = ['rgba(200,120,60,0.55)', 'rgba(220,170,70,0.5)', 'rgba(170,80,70,0.5)'][Math.floor(r() * 3)];
    g.beginPath();
    g.ellipse(X(x), Z(z), 0.09 * PPM, 0.05 * PPM, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 260; i++) {
    const x = 2 + r() * 32, z = (r() * 2 - 1) * bz;
    g.fillStyle = r() < 0.5 ? 'rgba(150,90,40,0.35)' : 'rgba(60,40,30,0.3)';
    g.beginPath();
    g.ellipse(X(x), Z(z), (0.1 + r() * 0.3) * PPM, (0.05 + r() * 0.1) * PPM, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  for (const p of puddles) {
    g.fillStyle = 'rgba(40,55,90,0.42)';
    g.beginPath();
    g.ellipse(X(p.x), Z(p.z), p.r * PPM, p.r * 0.62 * PPM, 0.3, 0, Math.PI * 2);
    g.fill();
    const gr = g.createRadialGradient(X(p.x - p.r * 0.2), Z(p.z - p.r * 0.1), 0, X(p.x - p.r * 0.2), Z(p.z - p.r * 0.1), p.r * 0.7 * PPM);
    gr.addColorStop(0, 'rgba(255,210,140,0.7)');
    gr.addColorStop(1, 'rgba(255,210,140,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(X(p.x), Z(p.z), p.r * PPM, p.r * 0.62 * PPM, 0.3, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(160,200,255,0.25)';
    g.lineWidth = 2;
    g.stroke();
  }
  for (const m of magic) {
    const gr = g.createRadialGradient(X(m.x), Z(m.z), 0, X(m.x), Z(m.z), m.r * PPM);
    gr.addColorStop(0, 'rgba(150,120,255,0.42)');
    gr.addColorStop(1, 'rgba(150,120,255,0)');
    g.fillStyle = gr;
    g.fillRect(X(m.x) - m.r * PPM, Z(m.z) - m.r * PPM, m.r * 2 * PPM, m.r * 2 * PPM);
  }
  // lamp light pools (warm)
  for (const p of pools) {
    const gr = g.createRadialGradient(X(p.x), Z(p.z), 0, X(p.x), Z(p.z), p.r * PPM);
    gr.addColorStop(0, p.color + '0.45)');
    gr.addColorStop(1, p.color + '0)');
    g.fillStyle = gr;
    g.fillRect(X(p.x) - p.r * PPM, Z(p.z) - p.r * PPM, p.r * 2 * PPM, p.r * 2 * PPM);
  }
  // vignette outside the play area
  for (const sx of [-1, 1]) {
    const gr = g.createLinearGradient(X(sx * 30), 0, X(sx * 44), 0);
    gr.addColorStop(0, 'rgba(20,18,32,0)');
    gr.addColorStop(1, 'rgba(20,18,32,0.7)');
    g.fillStyle = gr;
    g.fillRect(sx < 0 ? 0 : X(30), 0, X(-30), ch);
  }
  for (const sz of [-1, 1]) {
    const gr = g.createLinearGradient(0, Z(sz * 19), 0, Z(sz * 32));
    gr.addColorStop(0, 'rgba(20,18,32,0)');
    gr.addColorStop(1, 'rgba(20,18,32,0.7)');
    g.fillStyle = gr;
    g.fillRect(0, sz < 0 ? 0 : Z(19), cw, Z(-19));
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = patchWorld(new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 }), { baseAO: 0 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat);
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  return m;
}
