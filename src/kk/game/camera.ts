// Fixed-yaw three-quarter follow camera: 55° pitch, scroll zoom 12–22, smooth damping.
import * as THREE from 'three';

const PITCH = THREE.MathUtils.degToRad(55);

export class FollowCam {
  target = new THREE.Vector3();
  private look = new THREE.Vector3();
  dist = 19;
  private distNow = 19;
  /** Extra pull-back (unlock / attract shots). */
  override: { target: THREE.Vector3; dist: number } | null = null;
  shake = 0;
  /** Which way the camera looks along X: side A looks +x (camera at -x), side B looks -x. */
  facing: 1 | -1 = 1;

  constructor(private cam: THREE.PerspectiveCamera, el: HTMLElement) {
    cam.fov = 35;
    cam.updateProjectionMatrix();
    el.addEventListener(
      'wheel',
      (e) => {
        this.dist = THREE.MathUtils.clamp(this.dist + Math.sign(e.deltaY) * 1.5, 12, this.maxDist);
      },
      { passive: true },
    );
  }

  /** Portrait screens get a wider zoom range so the courtyard still reads. */
  maxDist = 22;
  fitAspect(aspect: number) {
    this.maxDist = aspect < 1 ? 32 : 22;
    this.dist = aspect < 1 ? 28 : aspect < 1.6 ? 21 : 19;
  }
  zoomBy(d: number) {
    this.dist = THREE.MathUtils.clamp(this.dist + d, 12, this.maxDist);
  }
  snap(p: THREE.Vector3) {
    this.target.copy(p);
    this.look.copy(p);
    this.place(1);
  }

  update(dt: number) {
    this.place(1 - Math.pow(0.9, dt * 60)); // lerp 0.1 per 60 Hz frame
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2);
      this.cam.position.x += (Math.random() - 0.5) * this.shake * 0.4;
      this.cam.position.y += (Math.random() - 0.5) * this.shake * 0.4;
    }
  }

  private place(k: number) {
    const tgt = this.override?.target ?? this.target;
    const dist = this.override?.dist ?? this.dist;
    this.look.lerp(tgt, k);
    this.distNow += (dist - this.distNow) * k * 0.6;
    const d = this.distNow;
    this.cam.position.set(this.look.x - this.facing * Math.cos(PITCH) * d, this.look.y + Math.sin(PITCH) * d, this.look.z);
    this.cam.lookAt(this.look.x, this.look.y + 0.6, this.look.z);
  }
}
