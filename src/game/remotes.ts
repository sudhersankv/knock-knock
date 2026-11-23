import * as THREE from 'three';
import type { PlayerInfo, PlayerState } from '../../shared/protocol';
import { INTERP_DELAY_MS } from '../../shared/constants';
import type { CharacterRig } from '../contracts';
import { createCharacter } from '../assets/character';
import { LAYER_NO_OUTLINE } from '../render/post';
import { canvasTexture } from '../render/textures';
import { hex, PAL } from '../render/palette';
import type { Fx } from './fx';

interface Sample {
  t: number;
  s: PlayerState;
}

class RemotePlayer {
  rig: CharacterRig;
  buf: Sample[] = [];
  label: THREE.Sprite;
  pos = new THREE.Vector3();
  yaw = 0;
  lastMode = 'idle';

  constructor(public info: PlayerInfo, scene: THREE.Scene) {
    this.rig = createCharacter(info.look);
    scene.add(this.rig.root);
    this.label = nameTag(info.name, info.look.accent);
    scene.add(this.label);
  }

  push(t: number, s: PlayerState) {
    this.buf.push({ t, s });
    if (this.buf.length > 40) this.buf.shift();
  }

  update(dt: number, renderT: number, fx: Fx) {
    const b = this.buf;
    if (!b.length) return;
    let a = b[0];
    let c = b[b.length - 1];
    for (let i = 0; i < b.length - 1; i++) {
      if (b[i].t <= renderT && b[i + 1].t >= renderT) {
        a = b[i];
        c = b[i + 1];
        break;
      }
    }
    const span = c.t - a.t;
    const k = span > 0 ? THREE.MathUtils.clamp((renderT - a.t) / span, 0, 1) : 1;
    this.pos.set(
      THREE.MathUtils.lerp(a.s.p[0], c.s.p[0], k),
      THREE.MathUtils.lerp(a.s.p[1], c.s.p[1], k),
      THREE.MathUtils.lerp(a.s.p[2], c.s.p[2], k),
    );
    let dy = c.s.r - a.s.r;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw = a.s.r + dy * k;
    const s = k < 0.5 ? a.s : c.s;

    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.yaw;
    this.rig.update(dt, { mode: s.a, speed: s.v, vy: s.vy, lean: s.l, trick: s.a === 'air' && this.lastMode !== 'air' ? false : undefined });
    this.label.position.set(this.pos.x, this.pos.y + 2.45, this.pos.z);

    if (s.a === 'grind') fx.sparks(this.pos, new THREE.Vector3(Math.sin(this.yaw) * s.v, 0, Math.cos(this.yaw) * s.v));
    if (s.a === 'spray') {
      const n = this.rig.getNozzleWorld(new THREE.Vector3());
      fx.spray(n, new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)), this.info.look.accent);
    }
    this.lastMode = s.a;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.rig.root);
    scene.remove(this.label);
    this.rig.dispose();
    (this.label.material as THREE.SpriteMaterial).map?.dispose();
  }
}

export class Remotes {
  private map = new Map<string, RemotePlayer>();

  constructor(private scene: THREE.Scene, private fx: Fx) {}

  add(info: PlayerInfo) {
    if (this.map.has(info.id)) return;
    this.map.set(info.id, new RemotePlayer(info, this.scene));
  }
  remove(id: string) {
    const r = this.map.get(id);
    if (!r) return;
    r.dispose(this.scene);
    this.map.delete(id);
  }
  snapshot(serverTime: number, states: PlayerState[], selfId: string) {
    for (const s of states) {
      if (s.id === selfId) continue;
      this.map.get(s.id)?.push(serverTime, s);
    }
  }
  update(dt: number, serverNow: number) {
    const renderT = serverNow - INTERP_DELAY_MS;
    for (const r of this.map.values()) r.update(dt, renderT, this.fx);
  }
  positions(): { id: string; pos: THREE.Vector3 }[] {
    return [...this.map.entries()].map(([id, r]) => ({ id, pos: r.pos }));
  }
}

function nameTag(name: string, accent: number): THREE.Sprite {
  const tex = canvasTexture(256, 64, (ctx, w, h) => {
    ctx.font = '30px "Bungee", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tw = Math.min(w - 8, ctx.measureText(name).width + 28);
    ctx.fillStyle = hex(PAL.ink);
    roundRect(ctx, (w - tw) / 2 + 4, 10, tw, 46, 10);
    ctx.fill();
    ctx.fillStyle = hex(accent);
    roundRect(ctx, (w - tw) / 2, 6, tw, 46, 10);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = hex(PAL.ink);
    ctx.stroke();
    ctx.fillStyle = hex(PAL.ink);
    ctx.fillText(name.toUpperCase(), w / 2, 31);
  });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  sp.scale.set(1.6, 0.4, 1);
  sp.layers.set(LAYER_NO_OUTLINE);
  return sp;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
