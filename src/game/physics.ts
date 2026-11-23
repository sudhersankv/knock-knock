import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { RailDef } from '../contracts';

THREE.Mesh.prototype.raycast = acceleratedRaycast;

/*
  Static collision world: every collision mesh from the level merged into one BVH.
  The player is a capsule; collision is resolved by pushing the capsule segment out
  of every nearby triangle (the three-mesh-bvh character-controller technique).
*/
export class CollisionWorld {
  readonly mesh: THREE.Mesh;
  readonly bvh: MeshBVH;
  private ray = new THREE.Raycaster();
  private box = new THREE.Box3();
  private seg = new THREE.Line3();
  private triPt = new THREE.Vector3();
  private capPt = new THREE.Vector3();
  private dir = new THREE.Vector3();
  readonly rails: Rail[];

  constructor(meshes: THREE.Mesh[], rails: RailDef[]) {
    const geos: THREE.BufferGeometry[] = [];
    for (const m of meshes) {
      m.updateMatrixWorld(true);
      let g = m.geometry.clone();
      // level contract says transforms are baked, but be defensive
      if (!m.matrixWorld.equals(new THREE.Matrix4())) g.applyMatrix4(m.matrixWorld);
      g = g.index ? g.toNonIndexed() : g;
      for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
      geos.push(g);
    }
    const merged = mergeGeometries(geos, false) ?? new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2);
    this.bvh = new MeshBVH(merged);
    (merged as any).boundsTree = this.bvh;
    this.mesh = new THREE.Mesh(merged);
    this.ray.firstHitOnly = true;
    this.rails = rails.filter((r) => r.points.length >= 2).map((r) => new Rail(r.points));
  }

  /**
   * Resolve a capsule (segment start = top sphere centre, end = bottom sphere centre) in place.
   * Returns the total push vector applied.
   */
  resolveCapsule(segment: THREE.Line3, radius: number, out: THREE.Vector3): THREE.Vector3 {
    const seg = this.seg.copy(segment);
    const box = this.box.makeEmpty();
    box.expandByPoint(seg.start);
    box.expandByPoint(seg.end);
    box.min.addScalar(-radius);
    box.max.addScalar(radius);
    const triPt = this.triPt;
    const capPt = this.capPt;
    const dir = this.dir;
    this.bvh.shapecast({
      intersectsBounds: (b) => b.intersectsBox(box),
      intersectsTriangle: (tri) => {
        const dist = tri.closestPointToSegment(seg, triPt, capPt);
        if (dist < radius) {
          const depth = radius - dist;
          dir.subVectors(capPt, triPt);
          if (dir.lengthSq() < 1e-10) tri.getNormal(dir);
          else dir.normalize();
          seg.start.addScaledVector(dir, depth);
          seg.end.addScaledVector(dir, depth);
        }
        return false;
      },
    });
    out.subVectors(seg.start, segment.start);
    segment.copy(seg);
    return out;
  }

  /** Downward probe for ground: returns hit distance + normal, or null. */
  probe(origin: THREE.Vector3, dir: THREE.Vector3, far: number): THREE.Intersection | null {
    this.ray.set(origin, dir);
    this.ray.far = far;
    const hit = this.bvh.raycastFirst(this.ray.ray, THREE.DoubleSide, 0, far);
    return (hit as THREE.Intersection) ?? null;
  }

  /** Nearest rail point to p within maxDist. */
  nearestRail(p: THREE.Vector3, maxDist: number): RailHit | null {
    let best: RailHit | null = null;
    for (const rail of this.rails) {
      const h = rail.closest(p);
      if (h.dist < maxDist && (!best || h.dist < best.dist)) best = h;
    }
    return best;
  }
}

export interface RailHit {
  rail: Rail;
  /** Arc length along the rail. */
  s: number;
  point: THREE.Vector3;
  dist: number;
}

/** Polyline with arc-length parameterisation for grinding. */
export class Rail {
  readonly length: number;
  private cum: number[] = [0];
  private tmp = new THREE.Vector3();
  private line = new THREE.Line3();

  constructor(readonly points: THREE.Vector3[]) {
    let L = 0;
    for (let i = 1; i < points.length; i++) {
      L += points[i].distanceTo(points[i - 1]);
      this.cum.push(L);
    }
    this.length = L;
  }

  pointAt(s: number, out: THREE.Vector3): THREE.Vector3 {
    s = THREE.MathUtils.clamp(s, 0, this.length);
    let i = 1;
    while (i < this.points.length - 1 && this.cum[i] < s) i++;
    const a = this.points[i - 1];
    const b = this.points[i];
    const segLen = this.cum[i] - this.cum[i - 1] || 1;
    return out.lerpVectors(a, b, (s - this.cum[i - 1]) / segLen);
  }

  tangentAt(s: number, out: THREE.Vector3): THREE.Vector3 {
    s = THREE.MathUtils.clamp(s, 0, this.length);
    let i = 1;
    while (i < this.points.length - 1 && this.cum[i] < s) i++;
    return out.subVectors(this.points[i], this.points[i - 1]).normalize();
  }

  closest(p: THREE.Vector3): RailHit {
    let best = { s: 0, dist: Infinity, point: new THREE.Vector3() };
    for (let i = 1; i < this.points.length; i++) {
      this.line.set(this.points[i - 1], this.points[i]);
      const t = this.line.closestPointToPointParameter(p, true);
      this.line.at(t, this.tmp);
      const d = this.tmp.distanceTo(p);
      if (d < best.dist) best = { s: this.cum[i - 1] + t * (this.cum[i] - this.cum[i - 1]), dist: d, point: this.tmp.clone() };
    }
    return { rail: this, ...best };
  }
}
