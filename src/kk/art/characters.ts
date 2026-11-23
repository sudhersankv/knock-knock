import * as THREE from 'three';
import type { Anim } from '../../../shared/kk/protocol';
import type { Rig, RigFactory } from '../contracts';
import { charMat, glow } from './mats';
import { radialTexture } from './glyphs';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { chars, kaykitReady, loadKayKit, teamTexture, WEAPON, type CharName } from './kaykit';

/*
  Procedural character rigs, chunky "arena indie" proportions:
  big head + hands, short legs, bold silhouettes, saturated outfit colors against the muted world.
  All animation is procedural (no clips), driven by update(dt, anim, speed).
*/

const SKIN = [0xf2c9a8, 0xd9a27c, 0xa8704e, 0x7a4a33, 0xf5d7c0];
const HAIR = [0x2b1d1a, 0x5a3a2a, 0xe8c070, 0x1f1f2e, 0xc2553a, 0x8f6fd8];

function rnd(seed: number) {
  let s = seed * 9301 + 49297;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}
function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, parent?: THREE.Object3D) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = false;
  parent?.add(m);
  return m;
}
const capsule = (r: number, l: number) => new THREE.CapsuleGeometry(r, l, 4, 10);
const sph = (r: number) => new THREE.SphereGeometry(r, 16, 12);

/** shared helpers: silhouette material swap + soft blob shadow */
const silMat = new THREE.MeshBasicMaterial({ color: 0x1c1430 });
function makeSilhouette(root: THREE.Object3D) {
  const saved = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  return (on: boolean) => {
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.userData.keepGlow || m.userData.blob) return;
      if (on) {
        if (!saved.has(m)) saved.set(m, m.material);
        m.material = silMat;
      } else if (saved.has(m)) m.material = saved.get(m)!;
    });
  };
}
const blobMat = new THREE.MeshBasicMaterial({ map: radialTexture(), color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false });
function blob(parent: THREE.Object3D, size: number) {
  const b = new THREE.Mesh(new THREE.PlaneGeometry(size, size), blobMat);
  b.rotation.x = -Math.PI / 2;
  b.position.y = 0.02;
  b.userData.blob = true;
  parent.add(b);
  return b;
}

// ---------------------------------------------------------------- draw-call reduction
/** Merge several static meshes into ONE vertex-colored mesh living in `container` space. */
function bakeMeshes(container: THREE.Object3D, parts: THREE.Mesh[], rough = 0.8): THREE.Mesh {
  container.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(container.matrixWorld).invert();
  const rel = new THREE.Matrix4();
  const c = new THREE.Color();
  const geos = parts.map((p) => {
    let g = p.geometry.index ? p.geometry.toNonIndexed() : p.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    g.applyMatrix4(rel.multiplyMatrices(inv, p.matrixWorld));
    c.copy((p.material as THREE.MeshStandardMaterial).color);
    c.r = Math.min(1, c.r); c.g = Math.min(1, c.g); c.b = Math.min(1, c.b);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  });
  for (const p of parts) p.removeFromParent();
  const merged = mergeGeometries(geos, false)!;
  const m = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: 0 }));
  m.castShadow = true;
  container.add(m);
  return m;
}
/** Replace a mesh subtree by a Group (same local transform) holding one baked mesh. */
function bakeTree(node: THREE.Mesh, rough = 0.8): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(node.position);
  g.quaternion.copy(node.quaternion);
  g.scale.copy(node.scale);
  node.parent!.add(g);
  const parts: THREE.Mesh[] = [];
  node.traverse((o) => (o as THREE.Mesh).isMesh && parts.push(o as THREE.Mesh));
  node.updateMatrixWorld(true);
  g.updateMatrixWorld(true);
  const m = bakeMeshes(g, parts, rough);
  m.castShadow = false;
  return g;
}

/**
 * Merge all visible SkinnedMeshes of a KayKit clone that share one skeleton + atlas into ONE skinned mesh
 * (body, arms, legs, head, cape, hat: ~7 draw calls -> 1). Falls back silently if incompatible.
 */
function mergeSkinned(model: THREE.Object3D) {
  const parts: THREE.SkinnedMesh[] = [];
  model.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (m.isSkinnedMesh && m.visible) {
      let vis = true;
      for (let p: THREE.Object3D | null = m; p && p !== model; p = p.parent) if (!p.visible) vis = false;
      if (vis) parts.push(m);
    }
  });
  const mapOf = (m: THREE.SkinnedMesh) => (m.material as THREE.MeshStandardMaterial).map ?? null;
  const first0 = parts.find((p) => !p.userData.keepGlow);
  if (!first0) return;
  const sameBones = (a: THREE.Skeleton, b: THREE.Skeleton) => a === b || (a.bones.length === b.bones.length && a.bones.every((bn, i) => bn === b.bones[i]));
  const same = parts.filter((p) => !p.userData.keepGlow && mapOf(p) === mapOf(first0) && sameBones(p.skeleton, first0.skeleton));
  parts.length = 0;
  parts.push(...same);
  if (parts.length < 2) return;
  const first = parts[0];
  try {
    model.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(first.matrixWorld).invert();
    const geos = parts.map((p) => {
      const g = p.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, p.matrixWorld));
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight'].includes(k)) g.deleteAttribute(k);
      return g.index ? g : g;
    });
    const allIndexed = geos.every((g) => g.index);
    const merged = mergeGeometries(allIndexed ? geos : geos.map((g) => (g.index ? g.toNonIndexed() : g)), false);
    if (!merged) return;
    const sm = new THREE.SkinnedMesh(merged, first.material);
    sm.castShadow = true;
    sm.frustumCulled = false;
    sm.position.copy(first.position);
    sm.quaternion.copy(first.quaternion);
    sm.scale.copy(first.scale);
    first.parent!.add(sm);
    sm.bind(first.skeleton, first.bindMatrix);
    for (const p of parts) p.removeFromParent();
  } catch (e) {
    console.warn('[art] skinned merge skipped', e);
  }
}

// ---------------------------------------------------------------- human
function human(color: number, seed: number): Rig {
  const r = rnd(seed + 3);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const outfit = charMat(color, 0.75);
  const dark = charMat(new THREE.Color(color).multiplyScalar(0.45).getHex(), 0.85);
  const skin = charMat(SKIN[Math.floor(r() * SKIN.length)]);
  const hairM = charMat(HAIR[Math.floor(r() * HAIR.length)], 0.9);
  const pants = charMat([0x2e2a40, 0x3a4a5c, 0x4a3a30, 0x24303a][Math.floor(r() * 4)], 0.9);
  const shoe = charMat(0xf4efe6, 0.7);
  blob(root, 1.3);

  const hips = new THREE.Group();
  hips.position.y = 0.62;
  body.add(hips);
  const legs: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(s * 0.16, 0, 0);
    hips.add(leg);
    mesh(capsule(0.12, 0.32), pants, 0, -0.26, 0, leg);
    const sh = mesh(new THREE.BoxGeometry(0.22, 0.16, 0.34), shoe, 0, -0.55, 0.05, leg);
    sh.geometry.translate(0, 0, 0);
    legs.push(leg);
  }
  const torso = new THREE.Group();
  torso.position.y = 0.62;
  body.add(torso);
  mesh(capsule(0.27, 0.32), outfit, 0, 0.3, 0, torso);
  // jacket hem + belt
  mesh(new THREE.CylinderGeometry(0.3, 0.33, 0.12, 14), dark, 0, 0.05, 0, torso);
  // scarf / collar in accent
  mesh(new THREE.TorusGeometry(0.2, 0.07, 6, 14), dark, 0, 0.62, 0, torso).rotation.x = Math.PI / 2;
  // backpack
  mesh(new THREE.BoxGeometry(0.36, 0.4, 0.2), dark, 0, 0.35, -0.3, torso);
  const arms: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(s * 0.36, 0.55, 0);
    torso.add(arm);
    mesh(capsule(0.09, 0.3), outfit, 0, -0.2, 0, arm);
    mesh(sph(0.11), skin, 0, -0.44, 0, arm);
    arms.push(arm);
  }
  const head = new THREE.Group();
  head.position.y = 0.98;
  torso.add(head);
  mesh(sph(0.3), skin, 0, 0.22, 0, head).scale.set(1, 1.02, 0.95);
  for (const s of [-1, 1]) {
    const e = mesh(sph(0.045), charMat(0x1a1424, 0.4), s * 0.1, 0.24, 0.27, head);
    e.scale.y = 1.4;
  }
  // hair: cap / tuft styles
  const style = Math.floor(r() * 3);
  if (style === 0) {
    mesh(sph(0.32), hairM, 0, 0.3, -0.04, head).scale.set(1, 0.75, 1);
  } else if (style === 1) {
    mesh(sph(0.32), hairM, 0, 0.3, -0.04, head).scale.set(1, 0.7, 1);
    for (let i = 0; i < 3; i++) mesh(new THREE.ConeGeometry(0.1, 0.28, 6), hairM, (i - 1) * 0.12, 0.55, -0.05, head).rotation.z = (i - 1) * -0.4;
  } else {
    // beanie in accent color
    mesh(sph(0.32), dark, 0, 0.32, -0.02, head).scale.set(1.02, 0.7, 1.02);
    mesh(sph(0.08), outfit, 0, 0.56, -0.02, head);
  }
  let t = r() * 10;
  let walk = 0;
  return {
    root,
    update(dt, anim, speed) {
      t += dt;
      const moving = anim === 'walk' || speed > 0.3;
      walk += dt * (moving ? 2 + speed * 1.6 : 0);
      const w = moving ? 1 : 0;
      const sw = Math.sin(walk * 2) * 0.7 * w;
      legs[0].rotation.x = sw;
      legs[1].rotation.x = -sw;
      arms[0].rotation.x = -sw * 0.8;
      arms[1].rotation.x = sw * 0.8;
      arms[0].rotation.z = 0.12;
      arms[1].rotation.z = -0.12;
      body.position.y = moving ? Math.abs(Math.sin(walk * 2)) * 0.07 : Math.sin(t * 2) * 0.012;
      torso.rotation.x = moving ? 0.12 : 0;
      head.rotation.y = moving ? 0 : Math.sin(t * 0.6) * 0.25;
      if (anim === 'wave') {
        arms[1].rotation.z = -2.6 + Math.sin(t * 10) * 0.3;
        arms[1].rotation.x = 0;
      } else if (anim === 'interact') {
        arms[0].rotation.x = arms[1].rotation.x = -1.2 + Math.sin(t * 8) * 0.1;
      }
    },
    dispose() {
      root.removeFromParent();
    },
  };
}

// ---------------------------------------------------------------- companion
function companion(color: number, seed: number): Rig {
  const r = rnd(seed + 11);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const furCols = [0xf4ead8, 0xc9b8ff, 0xffe0b8, 0xb8f0e0, 0xffc8d8];
  const fur = charMat(furCols[Math.floor(r() * furCols.length)], 0.85);
  const accent = charMat(color, 0.6);
  const shadow = blob(root, 0.95);
  // smooth, round "mochi" body (high-segment spheres: no faceting)
  const S = (rad: number) => new THREE.SphereGeometry(rad, 32, 24);
  const torso = mesh(S(0.36), fur, 0, 0.37, 0, body);
  torso.scale.set(1.05, 0.95, 1.0);
  const belly = mesh(S(0.24), charMat(0xfff8ee, 0.9), 0, 0.3, 0.2, body);
  belly.scale.set(1, 0.95, 0.55);
  // big glossy eyes on the FRONT-TOP of the face so they read from a 55deg-down camera
  const eyes: THREE.Object3D[] = [];
  const bodyParts: THREE.Mesh[] = [torso, belly];
  const eyeWhite = charMat(0xffffff, 0.25);
  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x1a1230, roughness: 0.15, metalness: 0 });
  for (const sd of [-1, 1]) {
    const e = mesh(S(0.115), eyeWhite, sd * 0.135, 0.53, 0.25, body);
    e.rotation.set(-0.55, sd * 0.28, 0); // tilt to look up-forward
    const pu = mesh(S(0.088), pupilMat, 0, 0.0, 0.055, e);
    pu.scale.set(1, 1.1, 0.7);
    const hl = mesh(S(0.03), glow(0xffffff, 1.8), 0.03, 0.04, 0.06, pu);
    hl.userData.keepGlow = true;
    const hl2 = mesh(S(0.014), glow(0xffffff, 1.4), -0.03, -0.035, 0.065, pu);
    hl2.userData.keepGlow = true;
    eyes.push(e);
    // blush
    const ck = mesh(S(0.055), charMat(0xff9fb4, 0.8), sd * 0.24, 0.41, 0.25, body);
    ck.scale.set(1, 0.55, 0.3);
    ck.rotation.y = sd * 0.6;
    bodyParts.push(ck);
  }
  // tiny smile
  const smile = mesh(new THREE.TorusGeometry(0.035, 0.012, 6, 12, Math.PI), charMat(0x3a2230, 0.6), 0, 0.44, 0.345, body);
  smile.rotation.set(-0.3, 0, Math.PI);
  bodyParts.push(smile);
  // ear tufts: soft rounded, swept back, accent inner
  const ears: THREE.Object3D[] = [];
  for (const sd of [-1, 1]) {
    const ear = mesh(S(0.1), fur, sd * 0.2, 0.7, -0.04, body);
    ear.scale.set(0.75, 1.7, 0.6);
    ear.rotation.z = -sd * 0.35;
    const inner = mesh(S(0.06), accent, 0, 0.02, 0.05, ear);
    inner.scale.set(0.8, 0.85, 0.5);
    ears.push(ear);
  }
  // fluffy top tuft
  const tuft = mesh(S(0.07), fur, 0, 0.72, 0.05, body);
  tuft.scale.set(1, 1.3, 0.8);
  bodyParts.push(tuft);
  const feet: THREE.Mesh[] = [];
  for (const sd of [-1, 1]) {
    const f = mesh(S(0.08), fur, sd * 0.16, 0.05, 0.12, body);
    f.scale.set(1, 0.55, 1.3);
    feet.push(f);
    bodyParts.push(f);
  }
  // bake: body -> 1 mesh, each eye -> 1, each ear -> 1 (was ~20 meshes)
  bakeMeshes(body, bodyParts, 0.85);
  for (let i = 0; i < 2; i++) eyes[i] = bakeTree(eyes[i] as THREE.Mesh, 0.3);
  for (let i = 0; i < 2; i++) ears[i] = bakeTree(ears[i] as THREE.Mesh, 0.85);
  // tail with glowing tip light in owner color
  const tail = new THREE.Group();
  tail.position.set(0, 0.25, -0.3);
  body.add(tail);
  const tseg = mesh(capsule(0.05, 0.3), fur, 0, 0.12, -0.08, tail);
  tseg.rotation.x = -0.8;
  const tip = mesh(sph(0.1), glow(color, 2.6), 0, 0.3, -0.24, tail);
  tip.userData.keepGlow = true;
  // think dots
  const dots = new THREE.Group();
  dots.position.y = 1.05;
  dots.visible = false;
  root.add(dots);
  for (let i = 0; i < 3; i++) {
    const d = mesh(sph(0.05), glow(0xffffff, 1.4), 0, 0, 0, dots);
    d.castShadow = false;
    d.userData.keepGlow = true;
  }
  // page for reading
  const page = mesh(new THREE.PlaneGeometry(0.28, 0.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff1c8).multiplyScalar(1.8), toneMapped: false, side: THREE.DoubleSide }), 0, 0.38, 0.4, body);
  page.rotation.x = -0.6;
  page.visible = false;
  page.userData.keepGlow = true;
  // squeeze ball
  const ball = mesh(sph(0.22), glow(color, 3), 0, 0.35, 0, root);
  ball.userData.keepGlow = true;
  ball.visible = false;
  ball.castShadow = false;
  let t = r() * 10;
  let squeeze = 0;
  let hopP = 0, earLag = 0, earV = 0, pvx = 0, pvz = 0;
  const wp = new THREE.Vector3(), prev = new THREE.Vector3(), tw = new THREE.Vector3(), tl = new THREE.Vector3();
  const trailPts: THREE.Vector3[] = [];
  const trail: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(sph(0.07 * (1 - i * 0.15)), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.2 - i * 0.35), transparent: true, opacity: 0.7 - i * 0.12, toneMapped: false, depthWrite: false }));
    m.userData.keepGlow = true;
    m.castShadow = false;
    root.add(m);
    trail.push(m);
  }
  return {
    root,
    update(dt, anim, speed) {
      t += dt;
      const moving = anim === 'walk' || speed > 0.3;
      // reset
      body.rotation.set(0, 0, 0);
      body.position.y = 0;
      ears[0].rotation.x = ears[1].rotation.x = 0;
      dots.visible = anim === 'think';
      page.visible = anim === 'read';
      let sq = 1, st = 1;
      if (moving) {
        // hop arc: parabola per hop, squash on contact, stretch at take-off
        hopP += dt * (2.2 + speed * 0.35);
        const p = hopP % 1;
        const h = 4 * p * (1 - p);
        body.position.y = h * 0.26;
        const contact = Math.max(0, 1 - p / 0.12) + Math.max(0, (p - 0.9) / 0.1);
        sq = 1 - contact * 0.2 + h * 0.06;
        st = 1 + contact * 0.14 - h * 0.03;
        body.rotation.x = 0.12 + (p - 0.5) * 0.25;
      } else if (anim === 'listen') {
        ears[0].rotation.z = -0.05;
        ears[1].rotation.z = 0.05;
        body.rotation.x = -0.12;
        sq = 1 + Math.sin(t * 3) * 0.02;
      } else if (anim === 'think') {
        dots.rotation.y = t * 3;
        dots.children.forEach((d, i) => {
          const a = (i / 3) * Math.PI * 2;
          d.position.set(Math.cos(a) * 0.22, Math.sin(t * 6 + i) * 0.05, Math.sin(a) * 0.22);
        });
        body.rotation.z = Math.sin(t * 2) * 0.08;
      } else if (anim === 'deliver') {
        const h = Math.abs(Math.sin(t * 7));
        body.position.y = h * 0.35;
        sq = 1 - (1 - h) * 0.2;
        st = 1 + (1 - h) * 0.15;
      } else if (anim === 'sulk') {
        body.rotation.x = 0.35;
        ears[0].rotation.z = -1.1;
        ears[1].rotation.z = 1.1;
        sq = 0.92;
      } else if (anim === 'read') {
        body.rotation.x = 0.25;
        page.rotation.z = Math.sin(t * 2) * 0.1;
      } else {
        sq = 1 + Math.sin(t * 2.4) * 0.035;
        st = 1 - Math.sin(t * 2.4) * 0.02;
        body.position.y = Math.sin(t * 2.4) * 0.015;
      }
      if (anim !== 'listen' && anim !== 'sulk') {
        ears[0].rotation.z = 0.35 + Math.sin(t * 1.7) * 0.06;
        ears[1].rotation.z = -0.35 - Math.sin(t * 1.7) * 0.06;
      }
      tail.rotation.y = Math.sin(t * (moving ? 10 : 3)) * 0.45;
      // secondary motion: ears lag behind acceleration (spring), tail light leaves a short trail
      root.getWorldPosition(wp);
      if (dt > 0) {
        const vx = (wp.x - prev.x) / dt, vz = (wp.z - prev.z) / dt;
        const ax = (vx - pvx) / dt, az = (vz - pvz) / dt;
        pvx = vx; pvz = vz;
        // forward accel in local space
        const fwd = Math.sin(root.rotation.y) * ax + Math.cos(root.rotation.y) * az;
        earV += (-fwd * 0.004 - earLag) * 60 * dt - earV * 8 * dt;
        earLag = THREE.MathUtils.clamp(earLag + earV * dt, -0.6, 0.6);
      }
      prev.copy(wp);
      ears[0].rotation.x = ears[1].rotation.x = earLag + (moving ? Math.sin(hopP * Math.PI * 2) * 0.15 : 0);
      tip.getWorldPosition(tw);
      trailPts.unshift(tw.clone());
      trailPts.length = Math.min(trailPts.length, trail.length * 2);
      trail.forEach((m, i) => {
        const q = trailPts[Math.min(trailPts.length - 1, (i + 1) * 2)];
        m.visible = moving && squeeze < 0.05;
        if (q) m.position.copy(root.worldToLocal(tl.copy(q)));
      });
      // blink
      const blink = (t % 3.7) < 0.12 ? 0.15 : 1;
      eyes[0].scale.y = eyes[1].scale.y = blink;
      const s = 1 - squeeze;
      body.scale.set(st * s, sq * s, st * s);
      body.visible = s > 0.02;
      ball.visible = squeeze > 0.02;
      ball.scale.setScalar(0.4 + Math.sin(Math.min(1, squeeze) * Math.PI * 0.5) * 0.8);
      shadow.scale.setScalar(Math.max(0.35, s));
    },
    setSqueeze(v) {
      squeeze = THREE.MathUtils.clamp(v, 0, 1);
    },
    setSilhouette: undefined as any,
    dispose() {
      root.removeFromParent();
    },
  } as Rig;
}

// ---------------------------------------------------------------- gatekeeper
function gatekeeper(): Rig {
  const root = new THREE.Group();
  const stone = charMat(0x8a8298, 0.95);
  const robe = charMat(0x4a3d6a, 0.9);
  const trim = glow(0xffc857, 1.8);
  blob(root, 1.6);
  const body = new THREE.Group();
  root.add(body);
  mesh(new THREE.ConeGeometry(0.75, 2.0, 10), robe, 0, 1.0, 0, body);
  mesh(new THREE.CylinderGeometry(0.42, 0.55, 0.6, 10), stone, 0, 1.95, 0, body);
  const hood = mesh(new THREE.ConeGeometry(0.45, 0.9, 10), robe, 0, 2.55, -0.05, body);
  hood.rotation.x = -0.15;
  const face = mesh(sph(0.27), charMat(0x15101f, 0.6), 0, 2.4, 0.12, body);
  face.scale.z = 0.6;
  for (const s of [-1, 1]) mesh(sph(0.05), glow(0xffc857, 3), s * 0.1, 2.42, 0.28, body).userData.keepGlow = true;
  mesh(new THREE.TorusGeometry(0.62, 0.035, 6, 24), trim, 0, 0.12, 0, body).rotation.x = Math.PI / 2;
  // staff with keyhole head
  const staff = new THREE.Group();
  staff.position.set(0.6, 0, 0.2);
  body.add(staff);
  mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.6, 6), stone, 0, 1.3, 0, staff);
  mesh(new THREE.TorusGeometry(0.18, 0.04, 6, 16), trim, 0, 2.75, 0, staff).userData.keepGlow = true;
  const orb = mesh(sph(0.09), glow(0x7b5cff, 3), 0, 2.75, 0, staff);
  orb.userData.keepGlow = true;
  const sil = makeSilhouette(root);
  let t = 0;
  return {
    root,
    update(dt) {
      t += dt;
      body.position.y = Math.sin(t * 1.2) * 0.05;
      staff.rotation.z = Math.sin(t * 0.8) * 0.05;
      orb.scale.setScalar(1 + Math.sin(t * 3) * 0.15);
    },
    setSilhouette: sil,
    dispose() {
      root.removeFromParent();
    },
  };
}

// ---------------------------------------------------------------- scout (lantern bird)
function scout(): Rig {
  const root = new THREE.Group();
  const feather = charMat(0x3d7f9a, 0.8);
  const belly = charMat(0xf1e2c4, 0.85);
  const beakM = charMat(0xffb347, 0.6);
  blob(root, 0.9);
  const body = new THREE.Group();
  root.add(body);
  mesh(sph(0.32), feather, 0, 0.7, 0, body).scale.set(1, 1.1, 1.1);
  mesh(sph(0.22), belly, 0, 0.65, 0.16, body).scale.set(1, 1.2, 0.6);
  const head = new THREE.Group();
  head.position.set(0, 1.08, 0.05);
  body.add(head);
  mesh(sph(0.22), feather, 0, 0, 0, head);
  const beak = mesh(new THREE.ConeGeometry(0.07, 0.22, 6), beakM, 0, -0.02, 0.24, head);
  beak.rotation.x = Math.PI / 2;
  for (const s of [-1, 1]) {
    const e = mesh(sph(0.06), charMat(0xffffff, 0.3), s * 0.1, 0.05, 0.16, head);
    mesh(sph(0.035), charMat(0x15101f, 0.2), 0, 0, 0.035, e);
  }
  // explorer cap
  mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.1, 10), charMat(0xc8964a, 0.8), 0, 0.2, 0, head);
  const wings: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const w = mesh(sph(0.2), feather, s * 0.3, 0.75, -0.02, body);
    w.scale.set(0.35, 0.9, 0.8);
    wings.push(w);
  }
  const legs: THREE.Mesh[] = [];
  for (const s of [-1, 1]) legs.push(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.4, 5), beakM, s * 0.1, 0.2, 0, body));
  // lantern held by a wing
  const lantern = new THREE.Group();
  lantern.position.set(0.42, 0.55, 0.15);
  body.add(lantern);
  mesh(new THREE.BoxGeometry(0.16, 0.04, 0.16), charMat(0xc8964a, 0.5), 0, 0.12, 0, lantern);
  mesh(new THREE.BoxGeometry(0.12, 0.18, 0.12), glow(0xffc857, 3), 0, 0, 0, lantern).userData.keepGlow = true;
  // bake static parts: head subtree -> 1 mesh, torso pieces -> 1 mesh
  {
    const hm: THREE.Mesh[] = [];
    head.traverse((o) => (o as THREE.Mesh).isMesh && hm.push(o as THREE.Mesh));
    bakeMeshes(head, hm, 0.8);
    const bm = body.children.filter((o) => (o as THREE.Mesh).isMesh && !wings.includes(o as THREE.Mesh) && !legs.includes(o as THREE.Mesh)) as THREE.Mesh[];
    bakeMeshes(body, bm, 0.8);
  }
  const sil = makeSilhouette(root);
  let t = 0;
  return {
    root,
    update(dt, anim, speed) {
      t += dt;
      const moving = anim === 'walk' || speed > 0.3;
      const h = moving ? Math.abs(Math.sin(t * 9)) : 0;
      body.position.y = h * 0.14;
      legs[0].rotation.x = moving ? Math.sin(t * 9) * 0.5 : 0;
      legs[1].rotation.x = -legs[0].rotation.x;
      wings[0].rotation.z = moving ? Math.sin(t * 9) * 0.25 : 0.05;
      wings[1].rotation.z = -wings[0].rotation.z;
      head.rotation.y = moving ? 0 : Math.sin(t * 1.3) * 0.6;
      head.rotation.x = moving ? 0.1 : Math.sin(t * 2.7) * 0.08;
      lantern.rotation.z = Math.sin(t * 3) * 0.15;
    },
    setSilhouette: sil,
    dispose() {
      root.removeFromParent();
    },
  };
}

function withSilhouette(rig: Rig): Rig {
  const sil = makeSilhouette(rig.root);
  rig.setSilhouette = sil;
  return rig;
}

// ---------------------------------------------------------------- KayKit skinned characters
/**
 * Preload all GLB characters + props. MUST be awaited before buildWorld() and before creating rigs:
 *   await loadArt(); const world = buildWorld(stage); rigs.human(...)
 * If it hasn't resolved (or failed), rigs fall back to the procedural versions.
 */
export async function loadArt(): Promise<void> {
  try {
    await loadKayKit();
  } catch (e) {
    console.warn('[art] KayKit load failed, using procedural rigs', e);
  }
}

type ClipMap = Map<string, THREE.AnimationAction>;
function setupMixer(model: THREE.Object3D, clips: THREE.AnimationClip[]) {
  const mixer = new THREE.AnimationMixer(model);
  const actions: ClipMap = new Map();
  for (const c of clips) actions.set(c.name, mixer.clipAction(c));
  let current: THREE.AnimationAction | null = null;
  let currentName = '';
  return {
    mixer,
    play(name: string, fade = 0.2, timeScale = 1, once = false) {
      const a = actions.get(name) ?? actions.get('Idle')!;
      a.timeScale = timeScale;
      if (currentName === name) return;
      a.reset();
      a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      a.clampWhenFinished = once;
      a.enabled = true;
      a.setEffectiveWeight(1);
      if (current) a.crossFadeFrom(current, fade, true);
      a.play();
      current = a;
      currentName = name;
    },
    get name() {
      return currentName;
    },
  };
}

function kayHuman(color: number, seed: number): Rig {
  const teal = new THREE.Color(color).getHSL({ h: 0, s: 0, l: 0 }).h > 0.3;
  const pool: CharName[] = teal ? ['Mage', 'Rogue_Hooded'] : ['Knight', 'Barbarian'];
  const name = pool[Math.abs(seed) % pool.length];
  const tpl = chars.get(name)!;
  const root = new THREE.Group();
  const model = cloneSkinned(tpl.scene) as THREE.Group;
  const scale = 1.85 / tpl.height;
  model.scale.setScalar(scale);
  root.add(model);
  blob(root, 1.25);
  model.traverse((o) => {
    if (o !== model && WEAPON.test(o.name)) o.visible = false;
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      const src = m.material as THREE.MeshStandardMaterial;
      const mat = src.clone();
      if (src.map) mat.map = teamTexture(src.map, name, color);
      mat.roughness = 0.75;
      mat.metalness = 0;
      m.material = mat;
      m.castShadow = true;
    }
  });
  if (!/merge=0/.test(location.search)) mergeSkinned(model);
  const anim = setupMixer(model, tpl.clips);
  anim.play('Idle', 0);
  let waveT = 0;
  return {
    root,
    update(dt, a, speed) {
      if (a === 'walk' || speed > 0.4) {
        if (speed > 3.0) anim.play('Running_A', 0.2, THREE.MathUtils.clamp(speed / 5.4, 0.6, 1.5));
        else anim.play('Walking_A', 0.2, THREE.MathUtils.clamp(speed / 1.9, 0.5, 1.6));
      } else if (a === 'interact') anim.play('Interact', 0.2);
      else if (a === 'wave') {
        anim.play('Cheer', 0.2);
        waveT += dt;
      } else anim.play('Idle', 0.25);
      anim.mixer.update(dt);
    },
    dispose() {
      anim.mixer.stopAllAction();
      root.removeFromParent();
    },
  };
}

function kayGatekeeper(): Rig {
  const tpl = chars.get('Skeleton_Mage')!;
  const root = new THREE.Group();
  const model = cloneSkinned(tpl.scene) as THREE.Group;
  model.scale.setScalar(2.5 / tpl.height);
  root.add(model);
  blob(root, 1.6);
  const stone = new THREE.Color(0x8d84a6);
  model.traverse((o) => {
    if (o !== model && WEAPON.test(o.name)) o.visible = false;
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const src = m.material as THREE.MeshStandardMaterial;
    if (/glow|eye/i.test(src.name) || /Eyes/.test(m.name)) {
      m.material = glow(0xffc857, 3);
      m.userData.keepGlow = true;
      return;
    }
    const mat = src.clone();
    if (src.map) mat.map = teamTexture(src.map, 'Skeleton_Mage', 0x7b5cff);
    mat.color = stone;
    mat.roughness = 0.95;
    m.material = mat;
  });
  if (!/merge=0/.test(location.search)) mergeSkinned(model);
  const anim = setupMixer(model, tpl.clips);
  anim.play('Idle_B', 0);
  const sil = makeSilhouette(root);
  return {
    root,
    update(dt, a, speed) {
      if (a === 'walk' || speed > 0.4) anim.play('Walking_D_Skeletons', 0.25, THREE.MathUtils.clamp(speed / 1.6, 0.5, 1.5));
      else if (a === 'think' || a === 'interact') anim.play('Spellcasting', 0.3);
      else if (a === 'wave') anim.play('Spellcast_Raise', 0.25);
      else anim.play('Idle_B', 0.35);
      anim.mixer.update(dt);
    },
    setSilhouette: sil,
    dispose() {
      anim.mixer.stopAllAction();
      root.removeFromParent();
    },
  };
}

export const rigs: RigFactory = {
  human: (c, s) => withSilhouette(kaykitReady() ? kayHuman(c, s) : human(c, s)),
  companion: (c, s) => withSilhouette(companion(c, s)),
  gatekeeper: () => (kaykitReady() ? kayGatekeeper() : gatekeeper()),
  scout,
};
export type { Anim };
