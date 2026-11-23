// Dev viewer for the Knock Knock art pass. Open /art.html
// Keys: WASD move (side-A human), O door, +/- budget, R rekey, C chamber, 1/2 restore A/B, K flash keyhole, H highlight cycle, Q swap side.
// URL: ?still  ?zoom=14  ?yaw=0 (deg, 0 = side-A view)  ?cx=&cz= (camera target)  ?ao=0  ?q=low
import * as THREE from 'three';
import { createStage, setQuality, getQuality } from './stage';
import { buildWorld, CHAMBER_Y } from './world';
import { rigs, loadArt } from './characters';
import { createFx } from './fx';
import { at, CHAMBER, patrol, SIDE_COLOR, type Side } from '../../../shared/kk/layout';
import type { Anim, LockId } from '../../../shared/kk/protocol';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('game') as HTMLCanvasElement;
const stage = createStage(canvas);
await loadArt();
const world = buildWorld(stage);
const fx = createFx(stage.scene);
addEventListener('resize', () => stage.resize(innerWidth, innerHeight));

type Actor = { rig: ReturnType<typeof rigs.human>; x: number; z: number; ry: number; speed: number; anim: Anim; y?: number };
const actors: Actor[] = [];
function add(rig: Actor['rig'], x: number, z: number, ry: number, anim: Anim = 'idle', y = 0): Actor {
  stage.scene.add(rig.root);
  const a = { rig, x, z, ry, speed: 0, anim, y };
  actors.push(a);
  return a;
}
const [sax, saz] = at('A', 'spawn');
const humanA = add(rigs.human(SIDE_COLOR.A, 3), sax + 1.5, saz - 2.5, Math.PI / 2);
const compA = add(rigs.companion(SIDE_COLOR.A, 5), sax + 2.6, saz - 1.0, Math.PI / 2 + 0.4);
const [sbx, sbz] = at('B', 'spawn');
const humanB = add(rigs.human(SIDE_COLOR.B, 8), sbx - 1.5, sbz - 2.5, -Math.PI / 2);
const compB = add(rigs.companion(SIDE_COLOR.B, 9), sbx - 2.6, sbz - 1.0, -Math.PI / 2 - 0.4, 'think');
const gk = add(rigs.gatekeeper(), CHAMBER.gatekeeper[0], CHAMBER.gatekeeper[1], 0, 'idle', CHAMBER_Y + 0.3);
gk.rig.setSilhouette?.(true);
const chA = add(rigs.companion(SIDE_COLOR.A, 15), CHAMBER.companionA[0], CHAMBER.companionA[1], Math.PI, 'idle', CHAMBER_Y + 0.3);
const chB = add(rigs.companion(SIDE_COLOR.B, 16), CHAMBER.companionB[0], CHAMBER.companionB[1], Math.PI, 'think', CHAMBER_Y + 0.3);
chA.rig.setSilhouette?.(true);
chB.rig.setSilhouette?.(true);
const scout = add(rigs.scout(), -10, -10, 0, 'walk');
const route = patrol('A');
let routeI = 0;

// input
const keys = new Set<string>();
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'KeyO') world.setDoorOpen(doorOpen = doorOpen ? 0 : 1);
  if (e.code === 'Equal' || e.code === 'NumpadAdd') world.setBudget((budget = Math.min(7, budget + 1)));
  if (e.code === 'Minus' || e.code === 'NumpadSubtract') world.setBudget((budget = Math.max(3, budget - 1)));
  if (e.code === 'KeyR') world.rekey((['codex', 'pulse', 'common'] as LockId[])[rekeyI++ % 3]);
  if (e.code === 'KeyC') world.setChamberActivity((chamber = chamber ? 0 : 1));
  if (e.code === 'Digit1') world.setRestore('A', (restoreA = restoreA >= 1 ? 0 : restoreA + 0.34));
  if (e.code === 'Digit2') world.setRestore('B', (restoreB = restoreB >= 1 ? 0 : restoreB + 0.34));
  if (e.code === 'KeyK') { world.flashKeyhole('A'); world.flashKeyhole('B'); fx.sparkle(-2.2, 0.8, 0, 0xffc857); }
  if (e.code === 'KeyH') { const ids = ['A:codex', 'A:t1', 'A:board', 'A:takes', 'A:terminal', null]; world.highlight(ids[hi++ % ids.length]); }
  if (e.code === 'KeyL') world.setLockStates({ codex: 'open', pulse: 'waiting', common: 'locked' });
  if (e.code === 'KeyQ') side = side === 'A' ? 'B' : 'A';
  if (e.code === 'KeyG') setQuality(getQuality() === 'high' ? 'low' : 'high');
  if (e.code === 'KeyF') fx.dropDust(humanA.x, humanA.z, SIDE_COLOR.A);
});
addEventListener('keyup', (e) => keys.delete(e.code));
let doorOpen = 0, budget = 5, rekeyI = 0, chamber = Number(params.get('chamber') ?? 1), restoreA = Number(params.get('ra') ?? 0), restoreB = Number(params.get('rb') ?? 0), hi = 0;
let side: Side = (params.get('side') as Side) ?? 'A';
world.setChamberActivity(chamber);
world.setRestore('A', restoreA);
world.setRestore('B', restoreB);
world.setLockStates({ codex: 'open', pulse: 'waiting', common: 'locked' });
world.markRead('A:t2');
if (params.has('hl')) world.highlight(params.get('hl'));
canvas.addEventListener('click', (e) => {
  const id = world.pick((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  world.highlight(id);
  console.log('pick', id);
});

let zoom = Number(params.get('zoom') ?? 16);
addEventListener('wheel', (e) => (zoom = THREE.MathUtils.clamp(zoom + Math.sign(e.deltaY) * 1.2, 10, 40)));
const yawDeg = params.get('yaw');
const target = new THREE.Vector3(humanA.x, 0, humanA.z);
const clock = new THREE.Clock();
let t = 0;
(window as any).__art = { stage, world, fx, actors, setQuality };

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 1 / 20);
  t += dt;
  // player
  const mv = new THREE.Vector2((keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0), (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0));
  const me = side === 'A' ? humanA : humanB;
  if (mv.lengthSq() > 0) {
    mv.normalize();
    // camera looks +x on side A (screen up = +x, screen right = +z); mirrored on B
    const f = side === 'A' ? 1 : -1;
    me.x += mv.y * f * 5.2 * dt;
    me.z += mv.x * f * 5.2 * dt;
    me.ry = Math.atan2(mv.x * f, mv.y * f);
    me.speed = 5.2;
    me.anim = 'walk';
  } else {
    me.speed = 0;
    me.anim = 'idle';
  }
  // companion follows
  const follow = (c: Actor, h: Actor) => {
    const dx = h.x - c.x, dz = h.z - c.z, d = Math.hypot(dx, dz);
    if (d > 1.8) {
      const sp = Math.min(5.5, d * 2);
      c.x += (dx / d) * sp * dt;
      c.z += (dz / d) * sp * dt;
      c.ry = Math.atan2(dx, dz);
      c.speed = sp;
      c.anim = 'walk';
    } else {
      c.speed = 0;
      if (c.anim === 'walk') c.anim = 'idle';
    }
  };
  follow(compA, humanA);
  if (!params.has('still')) {
    // scout patrol
    const [tx, tz] = route[routeI];
    const dx = tx - scout.x, dz = tz - scout.z, d = Math.hypot(dx, dz);
    if (d < 0.3) routeI = (routeI + 1) % route.length;
    else {
      scout.x += (dx / d) * 2.6 * dt;
      scout.z += (dz / d) * 2.6 * dt;
      scout.ry = Math.atan2(dx, dz);
      scout.speed = 2.6;
    }
  }
  for (const a of actors) {
    a.rig.root.position.set(a.x, a.y ?? 0, a.z);
    a.rig.root.rotation.y = a.ry;
    a.rig.update(dt, a.anim, a.speed);
  }
  // camera: 55° down, fixed yaw facing the wall from the player's side
  const cam = stage.camera;
  const tx = params.has('cx') ? Number(params.get('cx')) : me.x;
  const tz = params.has('cz') ? Number(params.get('cz')) : me.z;
  target.lerp(new THREE.Vector3(tx, 0, tz), params.has('cx') ? 1 : 0.1);
  const pitch = THREE.MathUtils.degToRad(55);
  const yaw = yawDeg !== null ? THREE.MathUtils.degToRad(Number(yawDeg)) : side === 'A' ? 0 : Math.PI;
  // yaw 0: camera on -x side looking +x
  const dir = new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw));
  cam.position.copy(target).addScaledVector(dir, Math.cos(pitch) * zoom).add(new THREE.Vector3(0, Math.sin(pitch) * zoom, 0));
  cam.lookAt(target.x, 0.8, target.z);
  world.update(dt, t);
  fx.update(dt);
  stage.render(dt, t);
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 1) { (window as any).__fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
}
let fpsAcc = 0, fpsN = 0;
frame();
