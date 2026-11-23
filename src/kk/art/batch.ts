import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/*
  Static geometry batcher: everything that never moves is baked into one vertex-colored mesh
  per material (opaque world + glow), which keeps the draw-call count tiny.
  Each piece gets a slight random tint (hand-placed, not copy-pasted) plus per-vertex
  shading noise so flat faces don't read as CG primitives.
*/

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();

export function T(x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0): THREE.Matrix4 {
  tmpE.set(rx, ry, rz);
  tmpQ.setFromEuler(tmpE);
  tmpS.set(sx, sy, sz);
  tmpP.set(x, y, z);
  return new THREE.Matrix4().compose(tmpP, tmpQ, tmpS);
}

export class Batch {
  private geos: THREE.BufferGeometry[] = [];
  private c = new THREE.Color();
  constructor(private rnd: () => number) {}

  get count() {
    return this.geos.length;
  }

  /** Add geometry (in local space) transformed by m, tinted color. jitter = +-brightness variation. */
  add(geo: THREE.BufferGeometry, m: THREE.Matrix4, color: number | THREE.Color, jitter = 0.06, vnoise = 0.04, intensity = 1) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(m);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    this.c.set(color as THREE.ColorRepresentation);
    const j = 1 + (this.rnd() * 2 - 1) * jitter;
    const pos = g.attributes.position;
    for (let i = 0; i < n; i++) {
      const vn = vnoise ? 1 + (hash3(pos.getX(i), pos.getY(i), pos.getZ(i)) * 2 - 1) * vnoise : 1;
      col[i * 3] = this.c.r * j * vn * intensity;
      col[i * 3 + 1] = this.c.g * j * vn * intensity;
      col[i * 3 + 2] = this.c.b * j * vn * intensity;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.geos.push(g);
  }

  build(material: THREE.Material, shadows = true): THREE.Mesh | null {
    if (!this.geos.length) return null;
    const merged = mergeGeometries(this.geos, false)!;
    merged.computeBoundingSphere();
    for (const g of this.geos) g.dispose();
    this.geos = [];
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    return mesh;
  }
}

function hash3(x: number, y: number, z: number) {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

// ---- shared primitive geometries (unit sized; scale via matrix) ----
export const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  /** rounded-ish box: beveled via a low-res chamfer (cheap) */
  rbox: chamferBox(1, 1, 1, 0.12),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
  cyl6: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
  cone: new THREE.ConeGeometry(0.5, 1, 10),
  cone6: new THREE.ConeGeometry(0.5, 1, 6),
  ball: new THREE.IcosahedronGeometry(0.5, 1),
  ball2: new THREE.IcosahedronGeometry(0.5, 2),
  sphere: new THREE.SphereGeometry(0.5, 14, 10),
  torus: new THREE.TorusGeometry(0.5, 0.08, 6, 20),
  dodec: new THREE.DodecahedronGeometry(0.5, 0),
  plane: new THREE.PlaneGeometry(1, 1),
  disc: new THREE.CircleGeometry(0.5, 20),
};

/** Box with chamfered edges (reads as softer, hand-made stone/wood). */
export function chamferBox(w: number, h: number, d: number, c: number): THREE.BufferGeometry {
  // Build by taking a box with 2 segments and pulling corner vertices in.
  const g = new THREE.BoxGeometry(w, h, d, 1, 1, 1).toNonIndexed();
  // A cheap trick: use an extruded rounded rectangle instead for the vertical sides.
  const shape = new THREE.Shape();
  const x = w / 2 - c, z = d / 2 - c;
  shape.moveTo(-x, -d / 2);
  shape.lineTo(x, -d / 2);
  shape.lineTo(w / 2, -z);
  shape.lineTo(w / 2, z);
  shape.lineTo(x, d / 2);
  shape.lineTo(-x, d / 2);
  shape.lineTo(-w / 2, z);
  shape.lineTo(-w / 2, -z);
  shape.closePath();
  const ex = new THREE.ExtrudeGeometry(shape, { depth: h - c * 2, bevelEnabled: true, bevelThickness: c, bevelSize: c * 0.6, bevelSegments: 1, curveSegments: 1 });
  ex.rotateX(-Math.PI / 2);
  ex.translate(0, -h / 2 + c, 0);
  g.dispose();
  return ex;
}
