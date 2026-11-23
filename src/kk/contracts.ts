// KNOCK KNOCK — client-side contract between the ART module (src/kk/art/*) and the GAME client (src/kk/game/*, src/kk/ui/*).
// Art owns: renderer look, post-processing, world geometry, character/creature rigs, door/keyhole/chamber animation.
// Game owns: input, camera follow, networking, UI overlay, voice, WebRTC, interaction logic.
import type * as THREE from 'three';
import type { Anim, LockId, LockStatus } from '../../shared/kk/protocol';
import type { Side } from '../../shared/kk/layout';

/** Created once by the game: `const stage = createStage(canvas)` (src/kk/art/stage.ts). */
export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  /** Perspective camera, 35° fov. The GAME moves it (follow + zoom); art never moves it. */
  camera: THREE.PerspectiveCamera;
  resize(w: number, h: number): void;
  /** Renders a frame including post (soft AO, gentle bloom on emissives, grade). */
  render(dt: number, time: number): void;
}

export type Collider = { kind: 'circle'; x: number; z: number; r: number } | { kind: 'box'; minX: number; maxX: number; minZ: number; maxZ: number };

/** Built by `buildWorld(stage)` (src/kk/art/world.ts). Adds itself to stage.scene. Uses shared/kk/layout.ts anchors. */
export interface World {
  root: THREE.Group;
  /** Static XZ colliders (walls, wall/door, props, hedges, bounds). Door counts as solid until setDoorOpen(1). */
  colliders: Collider[];
  update(dt: number, time: number): void;
  /** 0 = closed, 1 = fully open (door splits, warm light floods). */
  setDoorOpen(t: number): void;
  /** Keyhole size reflects the word budget (4 small .. 7 big). Animate the change. */
  setBudget(budget: number): void;
  /** Flash the keyhole on a side when a companion squeezes through. */
  flashKeyhole(side: Side): void;
  /** Chamber activity: glowing lines / silhouettes visible above the wall while agents talk. 0..1 */
  setChamberActivity(level: number): void;
  /** Runes on the door spin and reshuffle; codex stone "rewrites" if lockId === 'codex'. */
  rekey(lockId: LockId): void;
  /** Door rune lights per lock: locked (dim), waiting (pulsing), open (bright gold). */
  setLockStates(states: Partial<Record<LockId, LockStatus>>): void;
  /** Color restore: each half starts muted/desaturated; 0..1 per side. Each opened lock raises it. */
  setRestore(side: Side, amount: number): void;
  /** Hover/near highlight of an interactable object id like "A:t3" (outline glow), or null. */
  highlight(objectId: string | null): void;
  /** Mark a thread object as already read by your companion (small check glyph / dimmer). */
  markRead(objectId: string): void;
  /** Objects you can click: returns objectId under the pointer (NDC coords), or null. */
  pick(ndcX: number, ndcY: number): string | null;
}

/** Character rigs (src/kk/art/characters.ts). Feet at y=0, facing +Z. Game sets root.position/rotation.y each frame. */
export interface Rig {
  root: THREE.Object3D;
  /** speed in m/s drives walk cycle. */
  update(dt: number, anim: Anim, speed: number): void;
  /** Companions only: 0..1 squeeze into a glowing ball. */
  setSqueeze?(t: number): void;
  /** Silhouette mode (agents inside the chamber, seen through the glow). */
  setSilhouette?(on: boolean): void;
  dispose(): void;
}
export interface RigFactory {
  human(color: number, seed: number): Rig;
  companion(color: number, seed: number): Rig;
  gatekeeper(): Rig;
  scout(): Rig;
}
/** Drop-in effect: dust ring at a position. Plus a small one-shot particle API. */
export interface Fx {
  dropDust(x: number, z: number, color: number): void;
  sparkle(x: number, y: number, z: number, color: number): void;
  update(dt: number): void;
}
