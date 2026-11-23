// Local player motion: WASD on world axes, circle-vs-collider sliding, clamp to own side.
import type { Collider } from '../contracts';
import { HUMAN_SPEED, SIDE_BOUNDS, type Side } from '../../../shared/kk/layout';

export const PLAYER_RADIUS = 0.4;

export function resolve(x: number, z: number, r: number, colliders: Collider[]): [number, number] {
  for (let iter = 0; iter < 3; iter++) {
    for (const c of colliders) {
      if (c.kind === 'circle') {
        const dx = x - c.x;
        const dz = z - c.z;
        const d = Math.hypot(dx, dz);
        const min = c.r + r;
        if (d < min && d > 1e-5) {
          x = c.x + (dx / d) * min;
          z = c.z + (dz / d) * min;
        }
      } else {
        const cx = Math.max(c.minX, Math.min(x, c.maxX));
        const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
        const dx = x - cx;
        const dz = z - cz;
        const d = Math.hypot(dx, dz);
        if (d < r) {
          if (d > 1e-5) {
            x = cx + (dx / d) * r;
            z = cz + (dz / d) * r;
          } else {
            // centre inside box: push out on the shallowest axis
            const pushes = [c.minX - r - x, c.maxX + r - x, c.minZ - r - z, c.maxZ + r - z];
            const abs = pushes.map(Math.abs);
            const i = abs.indexOf(Math.min(...abs));
            if (i < 2) x += pushes[i];
            else z += pushes[i];
          }
        }
      }
    }
  }
  return [x, z];
}

export function clampSide(side: Side, x: number, z: number, open: boolean): [number, number] {
  const minX = side === 'A' ? SIDE_BOUNDS.minX : open ? SIDE_BOUNDS.minX : -SIDE_BOUNDS.maxX;
  const maxX = side === 'A' ? (open ? -SIDE_BOUNDS.minX : SIDE_BOUNDS.maxX) : -SIDE_BOUNDS.minX;
  return [Math.max(minX, Math.min(maxX, x)), Math.max(SIDE_BOUNDS.minZ, Math.min(SIDE_BOUNDS.maxZ, z))];
}

export class Keys {
  private down = new Set<string>();
  enabled = true;
  constructor() {
    addEventListener('keydown', (e) => {
      if (isTyping(e.target)) return;
      this.down.add(e.code);
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());
  }
  has(code: string) {
    return this.enabled && this.down.has(code);
  }
  axis(): [number, number] {
    let x = 0;
    let z = 0;
    if (this.has('KeyW') || this.has('ArrowUp')) z -= 1;
    if (this.has('KeyS') || this.has('ArrowDown')) z += 1;
    if (this.has('KeyA') || this.has('ArrowLeft')) x -= 1;
    if (this.has('KeyD') || this.has('ArrowRight')) x += 1;
    const l = Math.hypot(x, z);
    return l > 0 ? [x / l, z / l] : [0, 0];
  }
}

export function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

export { HUMAN_SPEED };
