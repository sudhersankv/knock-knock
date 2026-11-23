// Straight-line mover with awaitable targets. Agents move server-side; LLM calls never block movement.
import type { V2 } from '../../shared/kk/layout';

export class Mover {
  pos: V2;
  ry = 0;
  speed: number;
  moving = false;
  private target: V2 | null = null;
  private resolve: (() => void) | null = null;
  constructor(pos: V2, speed: number) {
    this.pos = [pos[0], pos[1]];
    this.speed = speed;
  }
  walkTo(t: V2, speed = this.speed): Promise<void> {
    this.cancel();
    this.target = [t[0], t[1]];
    this.speed = speed;
    this.moving = true;
    return new Promise((r) => (this.resolve = r));
  }
  /** Teleport (e.g. into the chamber). */
  place(p: V2) {
    this.cancel();
    this.pos = [p[0], p[1]];
  }
  cancel() {
    this.target = null;
    this.moving = false;
    const r = this.resolve;
    this.resolve = null;
    r?.();
  }
  /** Returns true while moving. */
  step(dt: number): boolean {
    if (!this.target) return false;
    const dx = this.target[0] - this.pos[0];
    const dz = this.target[1] - this.pos[1];
    const d = Math.hypot(dx, dz);
    const s = this.speed * dt;
    if (d <= s || d < 0.05) {
      this.pos = [this.target[0], this.target[1]];
      this.target = null;
      this.moving = false;
      const r = this.resolve;
      this.resolve = null;
      r?.();
      return false;
    }
    this.pos[0] += (dx / d) * s;
    this.pos[1] += (dz / d) * s;
    this.ry = Math.atan2(dx, dz);
    return true;
  }
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export const dist = (a: V2, b: V2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
