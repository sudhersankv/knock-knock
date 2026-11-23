import * as THREE from 'three';
import { PAL } from '../render/palette';
import { G, Kit, type Frame } from './kit';
import { M } from './mats';

/*
  Sir Gobblesworth, BLANDCO's mascot turkey. Authored at ~3 m tall (scale with the frame).
  - statue: real turkey colors (it bursts into color when the crew tags near it)
  - blimp: BLANDCO beige, inflated, no legs
*/

export function turkey(f: Frame, kind: 'statue' | 'blimp') {
  const bl = kind === 'blimp';
  const mat = (c: number) => (bl ? M.beige(c) : M.c(c));
  const body = mat(bl ? PAL.blandBeige : 0x8a4b22);
  const bodyDark = mat(bl ? PAL.blandBrown : 0x5e3016);
  const fanCols = bl ? [PAL.blandCream, PAL.blandBeige, 0xc9b48f, PAL.blandBrown] : [PAL.red, PAL.orange, 0xffc83d, 0x8a4b22];
  const fanCols2 = bl ? [PAL.blandBrown, 0xc9b48f] : [0xffe11a, PAL.magenta];

  // body
  f.sphere(body, 1, 0, 1.25, 0, { sx: 1.05, sy: 0.95, sz: 1.15, seg: 18 });
  f.sphere(mat(bl ? PAL.blandCream : 0xb06a32), 0.7, 0, 1.15, 0.55, { sx: 1.0, sy: 1.0, sz: 0.8, seg: 14 });
  // wings
  for (const sx of [-1, 1]) f.sphere(bodyDark, 0.6, sx * 0.92, 1.25, -0.05, { sx: 0.4, sy: 0.85, sz: 1.1, rz: sx * 0.25, seg: 12 });

  // tail fan: back row
  const N = 9;
  for (let i = 0; i < N; i++) {
    const a = ((i / (N - 1)) * 2 - 1) * 1.25;
    const fx = Math.sin(a) * 1.55,
      fy = 1.45 + Math.cos(a) * 1.55;
    f.sphere(mat(fanCols[i % fanCols.length]), 0.5, fx, fy, -0.85, { sx: 0.55, sy: 1.75, sz: 0.12, rz: -a, seg: 12 });
    // feather eye dot
    f.sphere(mat(fanCols2[i % 2]), 0.14, Math.sin(a) * 2.2, 1.45 + Math.cos(a) * 2.2, -0.79, { sz: 0.3, seg: 8 });
  }
  // front row (shorter)
  for (let i = 0; i < N - 2; i++) {
    const a = ((i / (N - 3)) * 2 - 1) * 1.05;
    f.sphere(mat(fanCols[(i + 2) % fanCols.length]), 0.38, Math.sin(a) * 1.05, 1.45 + Math.cos(a) * 1.05, -0.7, {
      sx: 0.55,
      sy: 1.5,
      sz: 0.12,
      rz: -a,
      seg: 10,
    });
  }

  // neck + head
  const skin = mat(bl ? 0xe0cfae : 0xe8a38a);
  f.tube(skin, 0, 1.75, 0.75, 0, 2.45, 0.95, 0.26, { seg: 10 });
  f.sphere(skin, 0.45, 0, 2.6, 1.0, { seg: 14 });
  // googly eyes
  for (const sx of [-1, 1]) {
    f.sphere(mat(PAL.white), 0.17, sx * 0.19, 2.75, 1.33, { seg: 10 });
    f.sphere(mat(PAL.ink), 0.08, sx * 0.19 + (bl ? 0 : sx * 0.03), bl ? 2.75 : 2.78, 1.48, { seg: 8 });
  }
  // beak + snood + wattle
  f.geo(G.cone(0.13, 0.4, 8), mat(bl ? 0xd4b27a : 0xffb83d), 0, 2.55, 1.55, { rx: Math.PI / 2 });
  f.sphere(mat(bl ? 0xc9a58a : PAL.red), 0.13, 0.08, 2.42, 1.45, { sy: 2.3, seg: 8 });
  f.sphere(mat(bl ? 0xc9a58a : PAL.red), 0.16, -0.05, 2.25, 1.25, { sy: 1.8, seg: 8 });

  // pilgrim hat
  const hat = mat(bl ? PAL.blandBrown : PAL.ink);
  f.cyl(hat, 0.58, 0.58, 0.07, 0, 2.95, 0.95, { seg: 16 });
  f.cyl(hat, 0.32, 0.38, 0.62, 0, 3.0, 0.95, { seg: 14 });
  f.cyl(mat(bl ? PAL.blandCream : 0x3d2416), 0.385, 0.385, 0.14, 0, 3.05, 0.95, { seg: 14 });
  f.box(mat(bl ? 0xc9b48f : PAL.yellow), 0.22, 0.18, 0.06, 0, 3.03, 1.33);

  if (!bl) {
    const leg = mat(0xffb83d);
    for (const sx of [-1, 1]) {
      f.tube(leg, sx * 0.38, 0.5, 0.05, sx * 0.4, 0.0, 0.1, 0.09, { seg: 6 });
      for (const a of [-0.5, 0, 0.5]) f.box(leg, 0.08, 0.06, 0.38, sx * 0.4 + Math.sin(a) * 0.15, 0, 0.25, { ry: a });
    }
  }
}

/** Parade blimp: a Group that orbits overhead. Built with its own Kit (merged meshes). */
export class TurkeyBlimp {
  readonly group = new THREE.Group();
  private props: THREE.Object3D[] = [];
  private banner: THREE.Object3D;
  private bob = 0;

  constructor(
    private radius = 90,
    private height = 62,
    private period = 160,
  ) {
    const k = new Kit('blimp');
    const f = k.frame(0, 0, 0, 0).sub(0, 0, 0, 0);
    turkey(f.sub(0, -4, 0, 0, 0, 0), 'blimp');
    // gondola
    const gond = k.frame(0, 0, 0, 0);
    // scale turkey by building the kit then scaling the root group
    gond.box(M.beige(PAL.blandBrown), 0.8, 0.35, 1.4, 0, -3.9, 0.2);
    gond.box(M.neon(0xfff2c0, 2.2), 0.7, 0.08, 1.2, 0, -3.95, 0.2, { noOutline: true, cast: false });
    // fins
    for (const sx of [-1, 1]) gond.box(M.beige(PAL.blandBrown), 0.06, 0.7, 0.9, sx * 0.9, -3.2, -1.1, { rz: sx * 0.5 });
    k.finish();
    const model = k.root;
    model.scale.setScalar(4.2);
    model.position.y = 16;
    this.group.add(model);

    // propellers (own meshes so they can spin)
    for (const sx of [-1, 1]) {
      const pk = new Kit('prop');
      const pf = pk.world;
      pf.box(M.beige(PAL.blandBrown), 0.08, 1.5, 0.12, 0, -0.75, 0);
      pf.box(M.beige(PAL.blandBrown), 1.5, 0.08, 0.12, 0, 0, 0);
      pk.finish();
      pk.root.position.set(sx * 1.6 * 4.2, (-3.75 + 0) * 4.2 + 16, -0.4 * 4.2);
      this.group.add(pk.root);
      this.props.push(pk.root);
    }

    // trailing banner on ropes
    const bk = new Kit('banner');
    const bf = bk.world;
    bf.geo(G.plane(26, 3.2), M.banner('★ STAY BEIGE ★ HAPPY THANKSGIVING OF BEIGE ★ BLANDCO ★'), 0, 0, 0, { ry: Math.PI / 2, cast: false });
    const rope = M.c(PAL.ink);
    bf.tube(rope, 0, 1.6, 13, 0, -0.5, 26, 0.05, { seg: 4 });
    bf.tube(rope, 0, -1.6, 13, 0, -0.5, 26, 0.05, { seg: 4 });
    bk.finish();
    this.banner = bk.root;
    this.banner.position.set(0, 6, -30);
    this.group.add(this.banner);

    // nav lights
    const lk = new Kit('blimp-lights');
    lk.world.sphere(M.neon(PAL.red, 4), 0.5, -6, 8, 0, { noOutline: true, cast: false, seg: 8 });
    lk.world.sphere(M.neon(PAL.green, 4), 0.5, 6, 8, 0, { noOutline: true, cast: false, seg: 8 });
    lk.finish();
    this.group.add(lk.root);

    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.matrixAutoUpdate = true;
    });
    this.group.name = 'turkey-blimp';
  }

  update(dt: number, t: number) {
    const a = (t / this.period) * Math.PI * 2;
    const x = Math.cos(a) * this.radius,
      z = Math.sin(a) * this.radius;
    this.bob += dt;
    this.group.position.set(x, this.height + Math.sin(this.bob * 0.6) * 1.5, z);
    // face along the direction of travel (tangent)
    this.group.rotation.y = -a;
    this.group.rotation.z = Math.sin(this.bob * 0.4) * 0.04;
    for (const p of this.props) p.rotation.z += dt * 9;
    this.banner.rotation.x = Math.sin(this.bob * 1.3) * 0.08;
  }
}
