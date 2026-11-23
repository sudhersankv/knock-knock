// Remote/server-driven actors: snapshot buffer + interpolation (~100 ms behind) + rigs.
import * as THREE from 'three';
import type { ActorState } from '../../../shared/kk/protocol';
import type { Rig, RigFactory } from '../contracts';
import { CHAMBER_Y } from './art';

const DELAY = 0.1;

interface Snap {
  time: number;
  s: ActorState;
}

export class ActorView {
  rig: Rig;
  snaps: Snap[] = [];
  last: ActorState;
  pos = new THREE.Vector3();
  prev = new THREE.Vector3();
  speed = 0;
  ry = 0;
  dropT = -1; // drop-in animation progress (0..1), -1 = none
  constructor(public id: string, s: ActorState, rigs: RigFactory, seed: number) {
    this.last = s;
    const color = s.color ?? 0xffffff;
    this.rig =
      s.kind === 'human' ? rigs.human(color, seed) : s.kind === 'companion' ? rigs.companion(color, seed) : s.kind === 'gatekeeper' ? rigs.gatekeeper() : rigs.scout();
    this.pos.set(s.p[0], s.p[1], s.p[2]);
    this.prev.copy(this.pos);
    this.ry = s.ry;
  }
}

export class Actors {
  map = new Map<string, ActorView>();
  /** Local human id: its position comes from local prediction, not snapshots. */
  selfId = '';
  constructor(private scene: THREE.Scene, private rigs: RigFactory) {}

  ingest(time: number, actors: ActorState[]) {
    const seen = new Set<string>();
    for (const s of actors) {
      seen.add(s.id);
      if (s.id === this.selfId) continue;
      let a = this.map.get(s.id);
      if (!a) {
        a = new ActorView(s.id, s, this.rigs, hash(s.id));
        this.map.set(s.id, a);
        this.scene.add(a.rig.root);
      }
      a.snaps.push({ time, s });
      if (a.snaps.length > 30) a.snaps.shift();
      a.last = s;
    }
    for (const [id, a] of this.map) {
      if (!seen.has(id) && id !== this.selfId) {
        a.rig.dispose();
        this.map.delete(id);
      }
    }
  }

  clear() {
    for (const a of this.map.values()) a.rig.dispose();
    this.map.clear();
  }

  update(dt: number, serverNow: number) {
    const rt = serverNow - DELAY;
    for (const a of this.map.values()) {
      if (a.id === this.selfId) continue;
      const sn = a.snaps;
      if (!sn.length) continue;
      let s0 = sn[0];
      let s1 = sn[sn.length - 1];
      for (let i = 0; i < sn.length - 1; i++) {
        if (sn[i].time <= rt && sn[i + 1].time >= rt) {
          s0 = sn[i];
          s1 = sn[i + 1];
          break;
        }
      }
      const span = s1.time - s0.time;
      const k = span > 1e-4 ? THREE.MathUtils.clamp((rt - s0.time) / span, 0, 1) : 1;
      a.prev.copy(a.pos);
      a.pos.set(
        THREE.MathUtils.lerp(s0.s.p[0], s1.s.p[0], k),
        THREE.MathUtils.lerp(s0.s.p[1], s1.s.p[1], k),
        THREE.MathUtils.lerp(s0.s.p[2], s1.s.p[2], k),
      );
      a.ry = lerpAngle(s0.s.ry, s1.s.ry, k);
      const v = a.pos.distanceTo(a.prev) / Math.max(dt, 1e-3);
      a.speed = THREE.MathUtils.lerp(a.speed, v, 0.25);
      const s = (k < 0.5 ? s0 : s1).s;
      const root = a.rig.root;
      root.position.copy(a.pos);
      if (a.last.side === 'C') root.position.y += CHAMBER_Y;
      if (a.dropT >= 0) {
        a.dropT = Math.min(1, a.dropT + dt / 0.9);
        root.position.y += 18 * (1 - easeOutBounce(a.dropT));
        if (a.dropT >= 1) a.dropT = -1;
      }
      root.rotation.y = a.ry;
      a.rig.setSilhouette?.(s.side === 'C');
      a.rig.setSqueeze?.(s.squeeze ?? 0);
      a.rig.update(dt, s.anim, a.speed);
    }
  }
}

export function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
export function lerpAngle(a: number, b: number, t: number) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
export function easeOutBounce(x: number) {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
}
