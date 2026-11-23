import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LAYER_NO_OUTLINE } from '../render/post';
import type { RailDef, SpotDef } from '../contracts';

/*
  Kit: a static-geometry batcher.
  Everything static in the city is added through a Kit, which bakes transforms and
  merges all geometry per material into one mesh => a few hundred draw calls total.
  Frames give local coordinate systems so props can be authored in local space.
*/

export interface AddOpts {
  cast?: boolean;
  receive?: boolean;
  noOutline?: boolean;
  /** Also add this geometry to the collision soup. */
  collide?: boolean;
}

export interface XformOpts extends AddOpts {
  rx?: number;
  ry?: number;
  rz?: number;
  sx?: number;
  sy?: number;
  sz?: number;
}

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export function T(x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1): THREE.Matrix4 {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

/** Clone, de-index, strip to position/normal/uv, bake transform. */
export function prep(src: THREE.BufferGeometry, m?: THREE.Matrix4): THREE.BufferGeometry {
  const g = src.index ? src.toNonIndexed() : src.clone();
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
  }
  g.morphAttributes = {};
  g.clearGroups();
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) {
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  }
  if (m) g.applyMatrix4(m);
  return g;
}

function posOnly(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = new THREE.BufferGeometry();
  n.setAttribute('position', (g.attributes.position as THREE.BufferAttribute).clone());
  return n;
}

// ------------------------------------------------------------------ geometry cache
const gcache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry) {
  let g = gcache.get(key);
  if (!g) {
    g = make();
    gcache.set(key, g);
  }
  return g;
}

/** Box with UVs scaled to world size / tile size, so textures repeat at a fixed real-world scale. */
export function tiledBox(w: number, h: number, d: number, tu: number, tv: number) {
  return cached(`tb${w}|${h}|${d}|${tu}|${tv}`, () => {
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const dims = [
      [d, h],
      [d, h],
      [w, d],
      [w, d],
      [w, h],
      [w, h],
    ];
    for (let f = 0; f < 6; f++) {
      for (let v = 0; v < 4; v++) {
        const i = f * 4 + v;
        uv.setXY(i, (uv.getX(i) * dims[f][0]) / tu, (uv.getY(i) * dims[f][1]) / tv);
      }
    }
    return g;
  });
}

export const G = {
  box: (w: number, h: number, d: number) => cached(`b${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d)),
  cyl: (rt: number, rb: number, h: number, seg = 12, open = false) =>
    cached(`c${rt}|${rb}|${h}|${seg}|${open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open)),
  sphere: (r: number, ws = 14, hs = 10) => cached(`s${r}|${ws}|${hs}`, () => new THREE.SphereGeometry(r, ws, hs)),
  hemi: (r: number, ws = 14) => cached(`h${r}|${ws}`, () => new THREE.SphereGeometry(r, ws, 6, 0, Math.PI * 2, 0, Math.PI / 2)),
  cone: (r: number, h: number, seg = 12) => cached(`k${r}|${h}|${seg}`, () => new THREE.ConeGeometry(r, h, seg)),
  ico: (r: number, d = 0) => cached(`i${r}|${d}`, () => new THREE.IcosahedronGeometry(r, d)),
  torus: (r: number, t: number, rs = 8, ts = 24, arc = Math.PI * 2) =>
    cached(`t${r}|${t}|${rs}|${ts}|${arc}`, () => new THREE.TorusGeometry(r, t, rs, ts, arc)),
  plane: (w: number, h: number) => cached(`p${w}|${h}`, () => new THREE.PlaneGeometry(w, h)),
  circle: (r: number, seg = 24) => cached(`ci${r}|${seg}`, () => new THREE.CircleGeometry(r, seg)),
  /** Triangular prism ramp: width along X (centered), rises along +Z from y=0 at z=0 to y=h at z=len. */
  wedge: (w: number, h: number, len: number) => cached(`w${w}|${h}|${len}`, () => wedgeGeo(w, h, len)),
  /** Quarter pipe: width along X (centered), flat entry at z=0, curve up to coping height h, deck behind. */
  qp: (w: number, h: number, r: number, deck: number) => cached(`q${w}|${h}|${r}|${deck}`, () => quarterPipeGeo(w, h, r, deck)),
};

function wedgeGeo(w: number, h: number, len: number) {
  const x0 = -w / 2,
    x1 = w / 2;
  // vertices
  const A = [x0, 0, 0],
    B = [x1, 0, 0],
    C = [x1, 0, len],
    D = [x0, 0, len],
    E = [x1, h, len],
    F = [x0, h, len];
  const tris = [
    // slope
    [A, E, B],
    [A, F, E],
    // back
    [D, C, E],
    [D, E, F],
    // bottom
    [A, B, C],
    [A, C, D],
    // sides
    [B, E, C],
    [A, D, F],
  ];
  const slopeLen = Math.hypot(h, len);
  const pos: number[] = [];
  const uv: number[] = [];
  tris.forEach((t, ti) => {
    for (const v of t) {
      pos.push(v[0], v[1], v[2]);
      if (ti < 2) uv.push((v[0] - x0) / 2, (v[2] / len) * (slopeLen / 2));
      else if (ti < 4) uv.push((v[0] - x0) / 2, v[1] / 2);
      else if (ti < 6) uv.push((v[0] - x0) / 2, v[2] / 2);
      else uv.push(v[2] / 2, v[1] / 2);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  // fix winding: ensure outward normals by checking each tri against the centroid
  const p = g.attributes.position as THREE.BufferAttribute;
  const c = new THREE.Vector3(0, h / 3, (len * 2) / 3);
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    d = new THREE.Vector3(),
    n = new THREE.Vector3(),
    m = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    d.fromBufferAttribute(p, i + 2);
    n.subVectors(b, a).cross(m.subVectors(d, a));
    const mid = a.clone().add(b).add(d).divideScalar(3);
    if (n.dot(mid.sub(c)) < 0) {
      // swap b and d
      p.setXYZ(i + 1, d.x, d.y, d.z);
      p.setXYZ(i + 2, b.x, b.y, b.z);
      const uva = g.attributes.uv as THREE.BufferAttribute;
      const u1 = uva.getX(i + 1),
        v1 = uva.getY(i + 1);
      uva.setXY(i + 1, uva.getX(i + 2), uva.getY(i + 2));
      uva.setXY(i + 2, u1, v1);
    }
  }
  g.computeVertexNormals();
  return g;
}

function quarterPipeGeo(w: number, h: number, r: number, deck: number) {
  const tmax = Math.acos(1 - Math.min(h, r) / r);
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  const segs = 14;
  for (let i = 1; i <= segs; i++) {
    const t = (tmax * i) / segs;
    shape.lineTo(r * Math.sin(t), r * (1 - Math.cos(t)));
  }
  const xTop = r * Math.sin(tmax);
  shape.lineTo(xTop + deck, h);
  shape.lineTo(xTop + deck, 0);
  shape.lineTo(0, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false, curveSegments: 1 });
  // shape x -> local +z, extrusion z -> local x (centered)
  g.applyMatrix4(new THREE.Matrix4().makeRotationY(-Math.PI / 2));
  g.applyMatrix4(new THREE.Matrix4().makeTranslation(w / 2, 0, 0));
  // scale UVs (Extrude world UVs are in meters already) down a bit
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2, uv.getY(i) / 2);
  g.computeVertexNormals();
  return g;
}

/** Top-of-coping distance (local z) for a quarter pipe built with G.qp. */
export function qpCopingZ(h: number, r: number) {
  return r * Math.sin(Math.acos(1 - Math.min(h, r) / r));
}

// ------------------------------------------------------------------ Kit
interface Bucket {
  mat: THREE.Material;
  geos: THREE.BufferGeometry[];
  cast: boolean;
  receive: boolean;
  noOutline: boolean;
}

export class Kit {
  readonly root = new THREE.Group();
  readonly rails: RailDef[] = [];
  readonly spots: SpotDef[] = [];
  private buckets = new Map<string, Bucket>();
  private col: THREE.BufferGeometry[] = [];
  readonly world: Frame;

  constructor(name = 'kit') {
    this.root.name = name;
    this.world = new Frame(this, new THREE.Matrix4());
  }

  add(geo: THREE.BufferGeometry, mat: THREE.Material, m: THREE.Matrix4, o: AddOpts = {}) {
    const g = prep(geo, m);
    const cast = o.cast ?? !o.noOutline;
    const receive = o.receive ?? true;
    const noOutline = o.noOutline ?? false;
    const key = `${mat.uuid}|${cast ? 1 : 0}${receive ? 1 : 0}${noOutline ? 1 : 0}`;
    let b = this.buckets.get(key);
    if (!b) {
      b = { mat, geos: [], cast, receive, noOutline };
      this.buckets.set(key, b);
    }
    b.geos.push(g);
    if (o.collide) this.col.push(posOnly(g));
  }

  collide(geo: THREE.BufferGeometry, m: THREE.Matrix4) {
    this.col.push(posOnly(prep(geo, m)));
  }

  frame(x = 0, y = 0, z = 0, ry = 0): Frame {
    return new Frame(this, T(x, y, z, ry));
  }

  /** Merge all buckets into meshes under root. Returns root. */
  finish(): THREE.Group {
    for (const b of this.buckets.values()) {
      if (!b.geos.length) continue;
      // merge in chunks to keep individual buffers sane
      const CH = 2500;
      for (let i = 0; i < b.geos.length; i += CH) {
        const merged = mergeGeometries(b.geos.slice(i, i + CH), false);
        if (!merged) continue;
        merged.computeBoundingSphere();
        merged.computeBoundingBox();
        const mesh = new THREE.Mesh(merged, b.mat);
        mesh.castShadow = b.cast;
        mesh.receiveShadow = b.receive;
        mesh.matrixAutoUpdate = false;
        if (b.noOutline) mesh.layers.set(LAYER_NO_OUTLINE);
        this.root.add(mesh);
      }
      b.geos.length = 0;
    }
    this.buckets.clear();
    return this.root;
  }

  collisionMeshes(): THREE.Mesh[] {
    if (!this.col.length) return [];
    const merged = mergeGeometries(this.col, false);
    this.col = [];
    if (!merged) return [];
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ visible: false }));
    mesh.name = 'collision';
    return [mesh];
  }
}

/** A local coordinate frame inside a Kit. All y arguments named "yb" are the BOTTOM of the shape. */
export class Frame {
  constructor(
    readonly kit: Kit,
    readonly m: THREE.Matrix4,
  ) {}

  sub(x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0): Frame {
    return new Frame(this.kit, this.m.clone().multiply(T(x, y, z, ry, rx, rz)));
  }

  private local(x: number, y: number, z: number, o: XformOpts) {
    return this.m.clone().multiply(T(x, y, z, o.ry ?? 0, o.rx ?? 0, o.rz ?? 0, o.sx ?? 1, o.sy ?? 1, o.sz ?? 1));
  }

  geo(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, o: XformOpts = {}) {
    this.kit.add(geo, mat, this.local(x, y, z, o), o);
  }

  /** Box with its bottom at yb. */
  box(mat: THREE.Material, w: number, h: number, d: number, x: number, yb: number, z: number, o: XformOpts & { tile?: [number, number] } = {}) {
    const geo = o.tile ? tiledBox(w, h, d, o.tile[0], o.tile[1]) : G.box(w, h, d);
    this.kit.add(geo, mat, this.local(x, yb + h / 2, z, o), o);
  }

  /** Cylinder with its bottom at yb. If tipped over (rx/rz set), y is its CENTER instead. */
  cyl(mat: THREE.Material, rt: number, rb: number, h: number, x: number, yb: number, z: number, o: XformOpts & { seg?: number } = {}) {
    const yc = o.rx || o.rz ? yb : yb + h / 2;
    this.kit.add(G.cyl(rt, rb, h, o.seg ?? 12), mat, this.local(x, yc, z, o), o);
  }

  sphere(mat: THREE.Material, r: number, x: number, y: number, z: number, o: XformOpts & { seg?: number } = {}) {
    const s = o.seg ?? 14;
    this.kit.add(G.sphere(r, s, Math.max(6, Math.round(s * 0.7))), mat, this.local(x, y, z, o), o);
  }

  /** Cylinder between two local points. */
  tube(mat: THREE.Material, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number, o: AddOpts & { seg?: number } = {}) {
    const a = new THREE.Vector3(ax, ay, az);
    const b = new THREE.Vector3(bx, by, bz);
    const dir = b.clone().sub(a);
    const len = dir.length();
    if (len < 1e-4) return;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    const lm = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, len, 1));
    this.kit.add(G.cyl(r, r, 1, o.seg ?? 8), mat, this.m.clone().multiply(lm), o);
  }

  /** Collision-only box (bottom at yb). */
  solid(w: number, h: number, d: number, x: number, yb: number, z: number, ry = 0) {
    this.kit.collide(G.box(w, h, d), this.m.clone().multiply(T(x, yb + h / 2, z, ry)));
  }

  solidGeo(geo: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0) {
    this.kit.collide(geo, this.m.clone().multiply(T(x, y, z, ry)));
  }

  point(x: number, y: number, z: number): THREE.Vector3 {
    return new THREE.Vector3(x, y, z).applyMatrix4(this.m);
  }

  dir(x: number, y: number, z: number): THREE.Vector3 {
    return new THREE.Vector3(x, y, z).transformDirection(this.m);
  }

  rail(pts: [number, number, number][]) {
    this.kit.rails.push({ points: pts.map((p) => this.point(p[0], p[1], p[2])) });
  }
}
