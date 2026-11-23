import * as THREE from 'three';
import type { CollisionWorld } from './physics';
import type { Input } from './input';

/*
  Third-person chase cam. Mouse orbits; when the mouse is idle and you're moving,
  it swings back behind your direction of travel. FOV kicks with speed,
  spring-arm pulls in when a wall is between camera and player.
*/
export class ChaseCamera {
  yaw = Math.PI;
  pitch = 0.22;
  private dist = 5.6;
  private curDist = 5.6;
  private target = new THREE.Vector3();
  private desired = new THREE.Vector3();
  private dir = new THREE.Vector3();
  private shakeT = 0;
  private shakeAmp = 0;
  sensitivity = 0.0022;

  constructor(readonly camera: THREE.PerspectiveCamera, private world: CollisionWorld) {}

  shake(amp: number) {
    this.shakeAmp = Math.max(this.shakeAmp, amp);
  }

  snapBehind(yaw: number) {
    this.yaw = yaw + Math.PI;
  }

  update(dt: number, input: Input, playerPos: THREE.Vector3, velocity: THREE.Vector3, speed: number, grounded: boolean) {
    this.yaw -= input.mouseDX * this.sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch + input.mouseDY * this.sensitivity, -0.5, 1.15);

    // auto-follow behind travel direction
    if (input.idleMouse > 0.8 && speed > 3) {
      const travelYaw = Math.atan2(velocity.x, velocity.z) + Math.PI;
      const diff = Math.atan2(Math.sin(travelYaw - this.yaw), Math.cos(travelYaw - this.yaw));
      this.yaw += diff * (1 - Math.exp(-1.6 * dt)) * Math.min(1, speed / 8);
      this.pitch = THREE.MathUtils.damp(this.pitch, grounded ? 0.2 : 0.32, 1.5, dt);
    }

    // look target leads slightly in the travel direction
    const lead = Math.min(speed, 16) * 0.06;
    const tgt = this.desired.set(playerPos.x + velocity.x * 0.04 * lead, playerPos.y + 1.55, playerPos.z + velocity.z * 0.04 * lead);
    this.target.x = THREE.MathUtils.damp(this.target.x, tgt.x, 14, dt);
    this.target.z = THREE.MathUtils.damp(this.target.z, tgt.z, 14, dt);
    this.target.y = THREE.MathUtils.damp(this.target.y, tgt.y, grounded ? 10 : 5, dt);

    this.dist = 5.4 + Math.min(speed, 17) * 0.09;
    this.dir.set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));

    // spring arm
    const hit = this.world.probe(this.target, this.dir, this.dist + 0.3);
    const allowed = hit ? Math.max(0.8, hit.distance - 0.35) : this.dist;
    this.curDist = allowed < this.curDist ? allowed : THREE.MathUtils.damp(this.curDist, allowed, 4, dt);

    this.camera.position.copy(this.target).addScaledVector(this.dir, this.curDist);

    // shake
    this.shakeT += dt;
    this.shakeAmp *= Math.exp(-6 * dt);
    if (this.shakeAmp > 0.001) {
      this.camera.position.x += Math.sin(this.shakeT * 53) * this.shakeAmp;
      this.camera.position.y += Math.sin(this.shakeT * 61 + 1.3) * this.shakeAmp;
    }
    this.camera.lookAt(this.target);

    const fov = 68 + Math.min(Math.max(speed - 8, 0), 10) * 1.4;
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, fov, 4, dt);
    this.camera.updateProjectionMatrix();
  }
}
