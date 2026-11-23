// Placeholder art implementing src/kk/contracts.ts with primitives. Swapped for src/kk/art/* by the integrator.
import * as THREE from 'three';
import type { Stage, World, Collider, Rig, RigFactory, Fx } from '../contracts';
import type { Anim, LockId, LockStatus } from '../../../shared/kk/protocol';
import { at, CHAMBER, DOOR, KEYHOLE_Y, PALETTE, SIDE_BOUNDS, THREAD_SLOTS, WALL, type AnchorKey, type Side } from '../../../shared/kk/layout';

export function createStage(canvas: HTMLCanvasElement): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.dusk);
  scene.fog = new THREE.Fog(PALETTE.dusk, 40, 90);
  const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 300);
  scene.add(new THREE.HemisphereLight(0x9a8cff, PALETTE.moss, 1.4));
  const sun = new THREE.DirectionalLight(0xffd9a0, 2.2);
  sun.position.set(-20, 30, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 30, bottom: -30, far: 120 });
  scene.add(sun);
  return {
    renderer,
    scene,
    camera,
    resize(w, h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    render() {
      renderer.render(scene, camera);
    },
  };
}

const std = (c: number, e = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, emissive: e ? c : 0, emissiveIntensity: e });

export function buildWorld(stage: Stage): World {
  const root = new THREE.Group();
  stage.scene.add(root);
  const colliders: Collider[] = [];
  const pickables: THREE.Object3D[] = [];
  const byId = new Map<string, THREE.Mesh>();

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 50), std(PALETTE.stone));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);

  const wallMat = std(0x4a4658);
  const segLen = WALL.halfLength - DOOR.halfWidth;
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(WALL.halfThickness * 2, WALL.height, segLen), wallMat);
    w.position.set(0, WALL.height / 2, s * (DOOR.halfWidth + segLen / 2));
    w.castShadow = w.receiveShadow = true;
    root.add(w);
    colliders.push({ kind: 'box', minX: -WALL.halfThickness, maxX: WALL.halfThickness, minZ: Math.min(s * DOOR.halfWidth, s * WALL.halfLength), maxZ: Math.max(s * DOOR.halfWidth, s * WALL.halfLength) });
  }
  const doorCollider: Collider = { kind: 'box', minX: -WALL.halfThickness, maxX: WALL.halfThickness, minZ: -DOOR.halfWidth, maxZ: DOOR.halfWidth };
  colliders.push(doorCollider);
  const doorMat = std(PALETTE.glow, 0.25);
  const doors: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const d = new THREE.Mesh(new THREE.BoxGeometry(WALL.halfThickness * 2 - 0.2, DOOR.height, DOOR.halfWidth), doorMat);
    d.position.set(0, DOOR.height / 2, s * DOOR.halfWidth / 2);
    root.add(d);
    doors.push(d);
  }
  const keyholes: Record<Side, THREE.Mesh> = {} as never;
  for (const side of ['A', 'B'] as Side[]) {
    const [x, z] = at(side, 'keyhole');
    const k = new THREE.Mesh(new THREE.CircleGeometry(0.35, 20), new THREE.MeshBasicMaterial({ color: PALETTE.glow }));
    k.position.set(x + (side === 'A' ? -0.02 : 0.02), KEYHOLE_Y, z);
    k.rotation.y = side === 'A' ? -Math.PI / 2 : Math.PI / 2;
    root.add(k);
    keyholes[side] = k;
  }
  const chamberGlow = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 5.6), new THREE.MeshBasicMaterial({ color: PALETTE.magic, transparent: true, opacity: 0 }));
  chamberGlow.rotation.x = -Math.PI / 2;
  chamberGlow.position.set(0, WALL.height + 0.05, 0);
  root.add(chamberGlow);

  const runeMats: Record<LockId, THREE.MeshBasicMaterial> = {
    codex: new THREE.MeshBasicMaterial({ color: 0x554466 }),
    pulse: new THREE.MeshBasicMaterial({ color: 0x554466 }),
    common: new THREE.MeshBasicMaterial({ color: 0x554466 }),
  };
  const runes: THREE.Mesh[] = [];
  (['codex', 'pulse', 'common'] as LockId[]).forEach((id, i) => {
    for (const side of ['A', 'B'] as Side[]) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.08, 6, 16), runeMats[id]);
      r.position.set(side === 'A' ? -2.1 : 2.1, 3.5 + i * 0.9, 0);
      r.rotation.y = Math.PI / 2;
      root.add(r);
      runes.push(r);
    }
  });

  // objects
  const addObj = (side: Side, key: AnchorKey, color: number, geo: THREE.BufferGeometry, y: number, r: number) => {
    const [x, z] = at(side, key);
    const m = new THREE.Mesh(geo, std(color, 0.15));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.userData.objectId = `${side}:${key}`;
    root.add(m);
    pickables.push(m);
    byId.set(m.userData.objectId, m);
    colliders.push({ kind: 'circle', x, z, r });
  };
  for (const side of ['A', 'B'] as Side[]) {
    addObj(side, 'codex', 0x8f86a8, new THREE.BoxGeometry(1.6, 2.2, 0.6), 1.1, 1.0);
    addObj(side, 'board', side === 'A' ? PALETTE.magic : PALETTE.teal, new THREE.BoxGeometry(2.4, 1.8, 0.3), 1.2, 1.2);
    addObj(side, 'takes', PALETTE.coral, new THREE.BoxGeometry(3, 2, 0.4), 1, 1.4);
    addObj(side, 'terminal', PALETTE.glow, new THREE.CylinderGeometry(0.5, 0.6, 1.2, 8), 0.6, 0.7);
    for (const t of THREAD_SLOTS) addObj(side, t, 0xb89a6a, new THREE.BoxGeometry(1.4, 1.4, 0.2), 1.0, 0.8);
  }
  // bounds
  for (const s of [-1, 1]) {
    const minX = s < 0 ? SIDE_BOUNDS.minX : -SIDE_BOUNDS.maxX;
    const maxX = s < 0 ? SIDE_BOUNDS.maxX : -SIDE_BOUNDS.minX;
    colliders.push({ kind: 'box', minX: minX - 2, maxX: maxX + 2, minZ: SIDE_BOUNDS.maxZ, maxZ: SIDE_BOUNDS.maxZ + 2 });
    colliders.push({ kind: 'box', minX: minX - 2, maxX: maxX + 2, minZ: SIDE_BOUNDS.minZ - 2, maxZ: SIDE_BOUNDS.minZ });
  }

  let highlighted: THREE.Mesh | null = null;
  const ray = new THREE.Raycaster();
  let doorT = 0;
  let flash: Record<Side, number> = { A: 0, B: 0 };
  let rekeySpin = 0;
  let chamberLevel = 0;
  const restore: Record<Side, number> = { A: 0, B: 0 };

  return {
    root,
    colliders,
    update(dt, time) {
      for (const s of ['A', 'B'] as Side[]) {
        flash[s] = Math.max(0, flash[s] - dt * 2);
        keyholes[s].scale.setScalar(1 + flash[s]);
      }
      if (rekeySpin > 0) {
        rekeySpin = Math.max(0, rekeySpin - dt);
        for (const r of runes) r.rotation.z += dt * 10 * rekeySpin;
      }
      (chamberGlow.material as THREE.MeshBasicMaterial).opacity = chamberLevel * (0.4 + 0.2 * Math.sin(time * 6));
      if (highlighted) (highlighted.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5 + 0.3 * Math.sin(time * 6);
      ground.material.color.setHex(PALETTE.stone).lerp(new THREE.Color(0x8a7fb0), (restore.A + restore.B) / 4);
    },
    setDoorOpen(t) {
      doorT = t;
      doors[0].position.z = -DOOR.halfWidth / 2 - t * DOOR.halfWidth;
      doors[1].position.z = DOOR.halfWidth / 2 + t * DOOR.halfWidth;
      const i = colliders.indexOf(doorCollider);
      if (t >= 0.5 && i >= 0) colliders.splice(i, 1);
      void doorT;
    },
    setBudget(b) {
      for (const s of ['A', 'B'] as Side[]) keyholes[s].geometry = new THREE.CircleGeometry(0.15 + b * 0.05, 20);
    },
    flashKeyhole(side) {
      flash[side] = 1;
    },
    setChamberActivity(l) {
      chamberLevel = l;
    },
    rekey() {
      rekeySpin = 1.5;
    },
    setLockStates(states: Partial<Record<LockId, LockStatus>>) {
      for (const [id, st] of Object.entries(states) as [LockId, LockStatus][]) {
        runeMats[id].color.setHex(st === 'open' ? PALETTE.glow : st === 'waiting' ? PALETTE.magic : st === 'failed' ? PALETTE.coral : 0x554466);
      }
    },
    setRestore(side, amount) {
      restore[side] = amount;
    },
    highlight(id) {
      if (highlighted) (highlighted.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.15;
      highlighted = id ? byId.get(id) ?? null : null;
    },
    markRead(id) {
      const m = byId.get(id);
      if (m) (m.material as THREE.MeshStandardMaterial).color.multiplyScalar(0.6);
    },
    pick(nx, ny) {
      ray.setFromCamera(new THREE.Vector2(nx, ny), stage.camera);
      const hit = ray.intersectObjects(pickables, false)[0];
      return hit ? (hit.object.userData.objectId as string) : null;
    },
  };
}

function capsuleRig(color: number, radius: number, height: number, sphere = false): Rig {
  const root = new THREE.Group();
  const mat = std(color);
  const body = new THREE.Mesh(sphere ? new THREE.SphereGeometry(radius, 16, 12) : new THREE.CylinderGeometry(radius, radius * 0.9, height, 14), mat);
  body.position.y = sphere ? radius : height / 2;
  body.castShadow = true;
  root.add(body);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.3, 8, 6), std(0xffffff));
  nose.position.set(0, body.position.y + (sphere ? 0.1 : height * 0.25), radius * 0.9);
  root.add(nose);
  let t = 0;
  return {
    root,
    update(dt, anim: Anim, speed) {
      t += dt * (2 + speed * 2);
      body.position.y = (sphere ? radius : height / 2) + (speed > 0.2 ? Math.abs(Math.sin(t)) * 0.12 : Math.sin(t) * 0.03);
      body.rotation.z = anim === 'think' ? Math.sin(t * 2) * 0.2 : 0;
    },
    setSqueeze(s) {
      root.scale.setScalar(1 - s * 0.7);
    },
    setSilhouette(on) {
      mat.color.setHex(on ? 0x111018 : color);
    },
    dispose() {
      root.removeFromParent();
    },
  };
}

export const rigs: RigFactory = {
  human: (color) => capsuleRig(color, 0.35, 1.7),
  companion: (color) => capsuleRig(color, 0.4, 0.8, true),
  gatekeeper: () => capsuleRig(0x8f86a8, 0.5, 2.6),
  scout: () => capsuleRig(PALETTE.glow, 0.3, 0.9, true),
};

export function createFx(scene: THREE.Scene): Fx {
  const rings: { m: THREE.Mesh; t: number }[] = [];
  return {
    dropDust(x, z, color) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.6, 24), new THREE.MeshBasicMaterial({ color, transparent: true }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.05, z);
      scene.add(m);
      rings.push({ m, t: 0 });
    },
    sparkle(x, y, z, color) {
      this.dropDust(x, z, color);
      void y;
    },
    update(dt) {
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        r.t += dt;
        r.m.scale.setScalar(1 + r.t * 6);
        (r.m.material as THREE.MeshBasicMaterial).opacity = 1 - r.t;
        if (r.t >= 1) {
          r.m.removeFromParent();
          rings.splice(i, 1);
        }
      }
    },
  };
}
void CHAMBER;
