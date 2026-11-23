import * as THREE from 'three';
import type { AnimMode } from '../../shared/protocol';
import { TAG_HOLD_SECONDS } from '../../shared/constants';
import type { CollisionWorld, Rail } from './physics';
import type { Input } from './input';

/*
  Skating controller. Feel targets (Bomb Rush-ish): always rolling, momentum-heavy,
  carving turns instead of instant direction flips, floaty-but-snappy jumps,
  magnetic rails, boost meter refilled by style.
*/

const UP = new THREE.Vector3(0, 1, 0);
const RADIUS = 0.38;
const HEIGHT = 1.75; // capsule total height
const GRAVITY = 26;
const JUMP_V = 9.2;
const AIR_JUMP_V = 7.2;
const MAX_SPEED = 11.5;
const BOOST_SPEED = 17;
const ACCEL = 20;
const COAST_DRAG = 0.9; // per-second exponential when no input
const TURN_RATE = 6.5; // rad/s carve at low speed (reduced at high speed)
const AIR_CONTROL = 7;
const RAIL_SNAP = 1.0;
const SUBSTEPS = 4;

export type PlayerEvent =
  | { type: 'jump'; air: boolean }
  | { type: 'land'; impact: number }
  | { type: 'grindStart' }
  | { type: 'grindEnd' }
  | { type: 'trick'; name: string; points: number }
  | { type: 'tagComplete'; spotId: string }
  | { type: 'boost' };

export interface SprayTarget {
  id: string;
  position: THREE.Vector3;
  normal: THREE.Vector3;
}

export class PlayerController {
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  /** Facing yaw (radians, 0 = +Z). */
  yaw = 0;
  lean = 0;
  grounded = false;
  groundNormal = new THREE.Vector3(0, 1, 0);
  mode: AnimMode = 'idle';
  boost = 1; // 0..1 meter
  boosting = false;
  airJumps = 1;
  trickPending = false;
  sprayProgress = 0;
  sprayTarget: SprayTarget | null = null;
  /** Combo score for the current run of tricks/grinds (shown as pops). */
  combo = 0;

  private grind: { rail: Rail; s: number; dir: 1 | -1 } | null = null;
  private grindCooldown = 0;
  private landTimer = 0;
  private airTime = 0;
  private trickSpinUsed = false;
  private seg = new THREE.Line3();
  private push = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private down = new THREE.Vector3(0, -1, 0);
  private events: PlayerEvent[] = [];

  constructor(private world: CollisionWorld) {}

  spawn(p: THREE.Vector3, yaw = 0) {
    this.position.copy(p);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.grind = null;
    this.mode = 'idle';
  }

  get speed() {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }
  get isGrinding() {
    return !!this.grind;
  }

  /** Drains queued events (jump, land, trick, tag...). */
  drainEvents(): PlayerEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  update(dt: number, input: Input, camYaw: number, sprayCandidate: SprayTarget | null) {
    const ax = input.axis();
    // camera-relative wish direction on the ground plane
    const wish = this.tmp2.set(0, 0, 0);
    if (ax.x || ax.y) {
      const fwd = new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw));
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      wish.addScaledVector(fwd, ax.y).addScaledVector(right, ax.x).normalize();
    }
    const wantJump = input.pressed('Space');
    const wantTrick = input.pressed('KeyC') || input.mousePressed;
    const wantBoost = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const wantSpray = input.isDown('KeyE');

    this.grindCooldown = Math.max(0, this.grindCooldown - dt);
    this.landTimer = Math.max(0, this.landTimer - dt);

    // ---------------- spraying (grounded, near a spot)
    if (wantSpray && sprayCandidate && this.grounded && !this.grind) {
      if (this.sprayTarget?.id !== sprayCandidate.id) this.sprayProgress = 0;
      this.sprayTarget = sprayCandidate;
      this.sprayProgress += dt / TAG_HOLD_SECONDS;
      // brake hard and face the wall
      this.velocity.multiplyScalar(Math.exp(-10 * dt));
      const toWall = this.tmp.copy(sprayCandidate.normal).negate();
      this.yaw = dampAngle(this.yaw, Math.atan2(toWall.x, toWall.z), 12, dt);
      this.mode = 'spray';
      if (this.sprayProgress >= 1) {
        this.events.push({ type: 'tagComplete', spotId: sprayCandidate.id });
        this.sprayProgress = 0;
        this.sprayTarget = null;
      }
      this.integrate(dt, false);
      return;
    }
    this.sprayProgress = Math.max(0, this.sprayProgress - dt * 2);
    if (!wantSpray) this.sprayTarget = null;

    // ---------------- boost
    this.boosting = wantBoost && this.boost > 0.02 && (wish.lengthSq() > 0 || this.speed > 2);
    if (this.boosting) {
      this.boost = Math.max(0, this.boost - dt * 0.28);
      if (input.pressed('ShiftLeft') || input.pressed('ShiftRight')) this.events.push({ type: 'boost' });
    } else {
      this.boost = Math.min(1, this.boost + dt * 0.04);
    }

    // ---------------- grinding
    if (this.grind) {
      this.updateGrind(dt, wantJump, wantTrick);
      return;
    }

    // ---------------- ground / air movement
    const maxSpeed = this.boosting ? BOOST_SPEED : MAX_SPEED;
    const hv = this.tmp.set(this.velocity.x, 0, this.velocity.z);
    let speed = hv.length();

    if (this.grounded) {
      if (wish.lengthSq() > 0) {
        if (speed > 1.5) {
          // carve: rotate heading toward wish
          const heading = Math.atan2(hv.x, hv.z);
          const target = Math.atan2(wish.x, wish.z);
          const diff = wrapAngle(target - heading);
          if (Math.abs(diff) > 2.6 && speed < 6) {
            // hard reverse at low speed: brake
            speed = Math.max(0, speed - ACCEL * 1.5 * dt);
          } else {
            const rate = TURN_RATE * THREE.MathUtils.lerp(1, 0.45, speed / BOOST_SPEED);
            const step = THREE.MathUtils.clamp(diff, -rate * dt, rate * dt);
            const nh = heading + step;
            this.lean = THREE.MathUtils.damp(this.lean, THREE.MathUtils.clamp(diff * 1.4, -1, 1), 8, dt);
            const accel = speed < maxSpeed ? ACCEL * (this.boosting ? 1.6 : 1) : -ACCEL * 0.5;
            speed = Math.max(0, speed + accel * dt * Math.max(0.2, Math.cos(diff)));
            hv.set(Math.sin(nh), 0, Math.cos(nh)).multiplyScalar(speed);
          }
        } else {
          hv.copy(wish).multiplyScalar(speed + ACCEL * dt);
          this.lean = THREE.MathUtils.damp(this.lean, 0, 8, dt);
        }
        if (hv.lengthSq() > 0) {
          if (speed < 1.5 && wish.lengthSq() > 0) hv.copy(wish).multiplyScalar(Math.max(speed, 0) + ACCEL * dt);
        }
      } else {
        speed *= Math.exp(-COAST_DRAG * dt);
        if (speed < 0.3) speed = 0;
        hv.setLength(speed);
        this.lean = THREE.MathUtils.damp(this.lean, 0, 6, dt);
      }
      this.velocity.x = hv.x;
      this.velocity.z = hv.z;
      this.airJumps = 1;

      if (wantJump) {
        // ollie: inherit slope launch (quarter pipes fling you up)
        this.velocity.addScaledVector(this.groundNormal, JUMP_V * 0.35);
        this.velocity.y = Math.max(this.velocity.y, 0) + JUMP_V;
        this.grounded = false;
        this.trickSpinUsed = false;
        this.events.push({ type: 'jump', air: false });
      }
    } else {
      // air: gentle steering, no speed gain beyond cap
      if (wish.lengthSq() > 0) {
        hv.addScaledVector(wish, AIR_CONTROL * dt);
        if (hv.length() > Math.max(speed, MAX_SPEED * 0.6)) hv.setLength(Math.max(speed, MAX_SPEED * 0.6));
        this.velocity.x = hv.x;
        this.velocity.z = hv.z;
      }
      if (this.boosting) {
        // air boost: dash forward along facing
        const f = this.tmp.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
        this.velocity.addScaledVector(f, ACCEL * 0.9 * dt);
        this.velocity.y = Math.max(this.velocity.y, -2); // hover a little
      }
      if (wantJump && this.airJumps > 0) {
        this.airJumps--;
        this.velocity.y = AIR_JUMP_V;
        this.events.push({ type: 'jump', air: true });
      }
      if (wantTrick && !this.trickSpinUsed) {
        this.trickSpinUsed = true;
        this.trickPending = true;
        const names = ['360 SPIN', 'CAN GRAB', 'GRAVY FLIP', 'STUFFING SPIN', 'CRANBERRY CORK', 'DRUMSTICK 540'];
        const name = names[Math.floor(Math.random() * names.length)];
        this.combo += 150;
        this.boost = Math.min(1, this.boost + 0.18);
        this.events.push({ type: 'trick', name, points: 150 });
      }
      this.airTime += dt;
    }

    this.integrate(dt, true);

    // try to snap onto a rail while airborne and falling (or riding off a ledge)
    if (!this.grounded && this.grindCooldown <= 0 && this.velocity.y < 2) {
      const hit = this.world.nearestRail(this.position, RAIL_SNAP);
      if (hit && hit.point.y <= this.position.y + 0.35) this.startGrind(hit.rail, hit.s);
    }

    // facing follows velocity
    const sp = this.speed;
    if (sp > 0.6) this.yaw = dampAngle(this.yaw, Math.atan2(this.velocity.x, this.velocity.z), this.grounded ? 14 : 5, dt);

    // anim mode
    if (this.grounded) {
      if (this.landTimer > 0) this.mode = 'land';
      else this.mode = sp > 0.5 ? 'skate' : 'idle';
    } else this.mode = 'air';
  }

  private startGrind(rail: Rail, s: number) {
    const t = rail.tangentAt(s, this.tmp);
    const along = this.velocity.dot(t);
    this.grind = { rail, s, dir: along >= 0 ? 1 : -1 };
    const hspeed = Math.max(Math.abs(along), this.speed * 0.8, 9);
    this.velocity.copy(t).multiplyScalar(hspeed * this.grind.dir);
    this.airJumps = 1;
    this.events.push({ type: 'grindStart' });
  }

  private updateGrind(dt: number, wantJump: boolean, wantTrick: boolean) {
    const g = this.grind!;
    const t = g.rail.tangentAt(g.s, this.tmp);
    // gravity along the rail slope, light friction, boost pushes
    let v = this.velocity.length();
    v += -GRAVITY * 0.35 * t.y * g.dir * dt;
    if (this.boosting) v += ACCEL * 0.8 * dt;
    v = THREE.MathUtils.clamp(v * Math.exp(-0.05 * dt), 4, BOOST_SPEED + 2);
    g.s += v * g.dir * dt;
    this.combo += Math.round(60 * dt * 10) / 10;
    this.boost = Math.min(1, this.boost + dt * 0.12);

    const tn = g.rail.tangentAt(g.s, this.tmp);
    this.velocity.copy(tn).multiplyScalar(v * g.dir);
    g.rail.pointAt(g.s, this.position);
    this.position.y += 0.02;
    this.yaw = dampAngle(this.yaw, Math.atan2(this.velocity.x, this.velocity.z), 16, dt);
    this.mode = 'grind';
    this.lean = Math.sin(performance.now() * 0.006) * 0.25;

    const atEnd = g.s <= 0 || g.s >= g.rail.length;
    if (wantJump || atEnd) {
      this.grind = null;
      this.grindCooldown = 0.35;
      this.grounded = false;
      this.velocity.y = wantJump ? JUMP_V * 0.95 : Math.max(this.velocity.y, 2.5);
      this.trickSpinUsed = false;
      if (wantJump) this.events.push({ type: 'jump', air: false });
      this.events.push({ type: 'grindEnd' });
    }
    if (wantTrick) {
      this.trickPending = true;
      this.combo += 100;
      this.events.push({ type: 'trick', name: 'RAIL SWITCH', points: 100 });
    }
  }

  /** Gravity + capsule collision, substepped. */
  private integrate(dt: number, gravity: boolean) {
    const h = dt / SUBSTEPS;
    const wasGrounded = this.grounded;
    const preVy = this.velocity.y;
    let groundedAny = false;
    for (let i = 0; i < SUBSTEPS; i++) {
      if (gravity || !this.grounded) this.velocity.y -= GRAVITY * h;
      this.position.addScaledVector(this.velocity, h);

      // capsule: segment from (bottom sphere centre) to (top sphere centre)
      this.seg.start.set(this.position.x, this.position.y + HEIGHT - RADIUS, this.position.z);
      this.seg.end.set(this.position.x, this.position.y + RADIUS, this.position.z);
      this.world.resolveCapsule(this.seg, RADIUS, this.push);
      this.position.add(this.push);

      const pushLen = this.push.length();
      if (pushLen > 1e-5) {
        const n = this.tmp.copy(this.push).divideScalar(pushLen);
        // remove velocity into the surface
        const into = this.velocity.dot(n);
        if (into < 0) this.velocity.addScaledVector(n, -into);
        if (n.y > 0.35) {
          groundedAny = true;
          this.groundNormal.lerp(n, 0.5).normalize();
        }
      }
    }

    // ground probe keeps us glued over small bumps and down slopes
    const origin = this.tmp.set(this.position.x, this.position.y + RADIUS, this.position.z);
    const probeLen = RADIUS + (wasGrounded ? 0.45 : 0.08);
    const hit = this.velocity.y < 3 ? this.world.probe(origin, this.down, probeLen) : null;
    if (hit && hit.face) {
      const n = hit.face.normal.clone();
      if (n.dot(UP) < 0) n.negate();
      if (n.y > 0.35) {
        groundedAny = true;
        this.groundNormal.copy(n);
        // snap down
        const gap = hit.distance - RADIUS;
        if (gap > 0.01) this.position.y -= gap;
        // slide along the surface
        const into = this.velocity.dot(n);
        if (into < 0) this.velocity.addScaledVector(n, -into);
      }
    }

    // launching off the lip of a steep ramp: if we were climbing fast, let go
    if (groundedAny && this.groundNormal.y < 0.55 && this.velocity.y > 6) groundedAny = false;

    if (!groundedAny) this.groundNormal.lerp(UP, 0.1);
    if (groundedAny && !wasGrounded) {
      const impact = Math.max(0, -preVy);
      this.landTimer = impact > 7 ? 0.22 : 0;
      this.airTime = 0;
      if (this.combo > 0) this.combo = 0;
      this.events.push({ type: 'land', impact });
    }
    this.grounded = groundedAny;
  }
}

function wrapAngle(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
export function dampAngle(a: number, b: number, lambda: number, dt: number) {
  return a + wrapAngle(b - a) * (1 - Math.exp(-lambda * dt));
}
