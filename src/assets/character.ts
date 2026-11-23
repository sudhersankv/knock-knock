import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CharacterLook } from '../../shared/protocol';
import type { AnimInput, CharacterRig } from '../contracts';
import { toon, neon } from '../render/materials';
import { PAL } from '../render/palette';
import { rng, pick } from '../render/textures';

/*
  Chunky inline-skater, built from smooth primitives and procedurally animated.

  Layout (rest pose, meters, feet on y = 0, facing +Z, character's LEFT is +X):
    ankle 0.20 | knee 0.60 | hip joint 1.00 | hips bone 1.04 | chest 1.30 | neck 1.52 | head top ~1.86

  Hierarchy:
    root (game sets position / rotation.y)
     └ body   (lean roll, grind yaw, trick spin, squash & stretch; pivots at the feet)
        └ hips ─ spine ─ chest ─ neck ─ head ─ eyes
           │             ├ shoulderL ─ elbowL ─ handL
           │             ├ shoulderR ─ elbowR ─ handR (spray can + nozzle)
           │             └ drawstrings (secondary motion)
           ├ thighL ─ kneeL ─ footL (shoe + skate + 4 wheels)
           └ thighR ─ kneeR ─ footR

  Every static part on a bone is merged into ONE mesh per bone (multi-material groups),
  so the whole skater is ~27 meshes.

  Conventions for update():
    input.lean > 0 leans the skater toward their right (-X) — i.e. a right turn.
    During 'wallride' the sign of input.lean picks the wall side (>= 0: wall on the right).
*/

type V3 = [number, number, number];

// ------------------------------------------------------------------ color helpers
const tmpA = new THREE.Color();
const tmpB = new THREE.Color();
function shade(c: number, f: number): number {
  return tmpA.setHex(c).multiplyScalar(f).getHex();
}
function mixHex(a: number, b: number, t: number): number {
  return tmpA.setHex(a).lerp(tmpB.setHex(b), t).getHex();
}
function lum(c: number): number {
  tmpA.setHex(c);
  return tmpA.r * 0.299 + tmpA.g * 0.587 + tmpA.b * 0.114;
}
/** Readable trim color: darken light colors, lighten dark ones. */
function trim(c: number): number {
  return lum(c) > 0.45 ? shade(c, 0.68) : mixHex(c, 0xffffff, 0.28);
}

const M = (c: number) => toon(c, { alwaysColor: true });
const Flat = (c: number) => toon(c, { alwaysColor: true, rim: 0, halftone: false });

// ------------------------------------------------------------------ geometry helpers
const rbox = (w: number, h: number, d: number, r = 0.02) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2) * 0.999);
const cap = (r: number, len: number, radial = 12) => new THREE.CapsuleGeometry(r, len, 4, radial);
const sph = (r: number, ws = 16, hs = 12) => new THREE.SphereGeometry(r, ws, hs);
const cyl = (rt: number, rb: number, h: number, seg = 14) => new THREE.CylinderGeometry(rt, rb, h, seg);
const torus = (r: number, t: number, arc = Math.PI * 2, rs = 8, ts = 22) => new THREE.TorusGeometry(r, t, rs, ts, arc);

const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

function normalizeGeo(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  if (geo !== g) g.dispose();
  for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
  if (!geo.attributes.normal) geo.computeVertexNormals();
  if (!geo.attributes.uv) {
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
  }
  geo.morphAttributes = {};
  geo.clearGroups();
  return geo;
}

/** Collects transformed primitives per material and merges them into one multi-material mesh. */
class MeshBuilder {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();

  add(geo: THREE.BufferGeometry, mat: THREE.Material, p: V3 = [0, 0, 0], r: V3 = [0, 0, 0], s: V3 | number = 1): this {
    const sc = typeof s === 'number' ? [s, s, s] : s;
    _m4.compose(_p.set(p[0], p[1], p[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2])), _s.set(sc[0], sc[1], sc[2]));
    const g = normalizeGeo(geo);
    g.applyMatrix4(_m4);
    const list = this.parts.get(mat);
    if (list) list.push(g);
    else this.parts.set(mat, [g]);
    return this;
  }

  build(name: string): THREE.Mesh {
    const mats = [...this.parts.keys()];
    const merged = mats.map((m) => {
      const list = this.parts.get(m)!;
      const g = list.length === 1 ? list[0] : mergeGeometries(list, false)!;
      if (list.length > 1) list.forEach((x) => x.dispose());
      return g;
    });
    let mesh: THREE.Mesh;
    if (merged.length === 1) {
      mesh = new THREE.Mesh(merged[0], mats[0]);
    } else {
      const g = mergeGeometries(merged, true)!;
      merged.forEach((x) => x.dispose());
      mesh = new THREE.Mesh(g, mats);
    }
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.parts.clear();
    return mesh;
  }
}

function pivot(name: string, parent: THREE.Object3D, p: V3, order: THREE.EulerOrder = 'XYZ'): THREE.Object3D {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.set(p[0], p[1], p[2]);
  o.rotation.order = order;
  parent.add(o);
  return o;
}

// ------------------------------------------------------------------ pose model
const KEYS = [
  'bodyRx', 'bodyRy', 'bodyRz',
  'hipX', 'hipY', 'hipRx', 'hipRy', 'hipRz',
  'spRx', 'spRy', 'spRz', 'chRx', 'chRy', 'chRz',
  'nkRx', 'hdRx', 'hdRy', 'hdRz',
  'lsRx', 'lsRy', 'lsRz', 'leRx', 'lhRx', 'lhRz',
  'rsRx', 'rsRy', 'rsRz', 'reRx', 'rhRx', 'rhRz',
  'ltRx', 'ltRz', 'lkRx', 'lfRx', 'lfRz',
  'rtRx', 'rtRz', 'rkRx', 'rfRx', 'rfRz',
] as const;
type Key = (typeof KEYS)[number];
type Pose = Record<Key, number>;
const newPose = (): Pose => Object.fromEntries(KEYS.map((k) => [k, 0])) as Pose;

const THIGH = 0.4;
const SHIN = 0.4;

/** Bend a leg keeping the skate flat. bend: knee half-angle; swing: + = leg back; abduct: outward. */
function leg(P: Pose, side: 'l' | 'r', bend: number, swing = 0, abduct = 0) {
  const o = side === 'l' ? 1 : -1;
  P[`${side}tRx` as Key] = -bend + swing;
  P[`${side}kRx` as Key] = 2 * bend;
  P[`${side}fRx` as Key] = -bend - swing;
  P[`${side}tRz` as Key] = o * abduct;
  P[`${side}fRz` as Key] = -o * abduct;
}
const dropFor = (bend: number) => (THIGH + SHIN) * (1 - Math.cos(bend));

const smooth01 = (a: number, b: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

// ------------------------------------------------------------------ the rig
interface Bones {
  body: THREE.Object3D;
  hips: THREE.Object3D;
  spine: THREE.Object3D;
  chest: THREE.Object3D;
  neck: THREE.Object3D;
  head: THREE.Object3D;
  eyes: THREE.Object3D;
  shL: THREE.Object3D;
  elL: THREE.Object3D;
  hdL: THREE.Object3D;
  shR: THREE.Object3D;
  elR: THREE.Object3D;
  hdR: THREE.Object3D;
  thL: THREE.Object3D;
  knL: THREE.Object3D;
  ftL: THREE.Object3D;
  thR: THREE.Object3D;
  knR: THREE.Object3D;
  ftR: THREE.Object3D;
  nozzle: THREE.Object3D;
  strings: THREE.Object3D[];
  wheels: THREE.Mesh[];
}

const REST = { hipsY: 1.04 };

export function createCharacter(look: CharacterLook): CharacterRig {
  const root = new THREE.Group();
  root.name = 'skater';

  let bones = buildBody(look);
  root.add(bones.body);

  // ---------------- animation state
  const cur = newPose();
  const tgt = newPose();
  let time = Math.random() * 100;
  let prevMode: AnimInput['mode'] = 'idle';
  let lastVy = 0;
  let stridePhase = 0;
  let wheelSpin = 0;
  let wheelVel = 0;
  let trickT = 0; // counts down
  let trickDir = 1;
  let squash = 0;
  let squashVel = 0;
  let stretch = 0;
  let lookTimer = 1;
  const lookTarget = new THREE.Vector2();
  let shakeTimer = 3 + Math.random() * 3;
  let shakeT = 0;
  let blinkTimer = 2;
  let blinkT = 0;
  const stringSway = [new THREE.Vector2(), new THREE.Vector2()];
  let landT = 0;

  function computeTarget(input: AnimInput, dt: number) {
    const P = tgt;
    for (const k of KEYS) P[k] = 0;
    const speed = Math.max(0, input.speed);
    const s = THREE.MathUtils.clamp(speed / 12, 0, 1);

    // relaxed arms baseline (hoodie is puffy)
    P.lsRz = 0.14;
    P.rsRz = -0.14;
    P.leRx = -0.2;
    P.reRx = -0.25;
    P.rhRx = -0.3;

    switch (input.mode) {
      case 'idle': {
        const breathe = Math.sin(time * 1.7);
        const shift = Math.sin(time * 0.55);
        leg(P, 'l', 0.1 + Math.max(0, shift) * 0.08, 0, 0.06);
        leg(P, 'r', 0.1 + Math.max(0, -shift) * 0.08, 0, 0.06);
        P.hipY = -dropFor(0.1 + Math.abs(shift) * 0.04);
        P.hipX = shift * 0.035;
        P.hipRz = -shift * 0.04;
        P.spRz = shift * 0.03;
        P.chRx = breathe * 0.025;
        P.spRx = 0.04;
        P.lsRz += breathe * 0.02;
        P.rsRz -= breathe * 0.02;
        // look around
        lookTimer -= dt;
        if (lookTimer <= 0) {
          lookTimer = 1.6 + Math.random() * 2.8;
          lookTarget.set((Math.random() - 0.5) * 1.1, (Math.random() - 0.4) * 0.3);
        }
        P.hdRy = lookTarget.x;
        P.hdRx = lookTarget.y;
        P.hdRz = -lookTarget.x * 0.12;
        // occasional can shake
        shakeTimer -= dt;
        if (shakeTimer <= 0) {
          shakeT = 1.0;
          shakeTimer = 4 + Math.random() * 4;
        }
        if (shakeT > 0) {
          shakeT -= dt;
          P.rsRx = -0.75;
          P.rsRz = -0.05;
          P.reRx = -1.45;
          P.rhRx = 0.2 + Math.sin(time * 38) * 0.35;
          P.rhRz = Math.sin(time * 38 + 1) * 0.15;
          P.hdRy = -0.35;
          P.hdRx = 0.2;
        }
        break;
      }

      case 'skate':
      case 'land': {
        const freq = 0.65 + speed * 0.065;
        stridePhase += Math.PI * 2 * freq * dt;
        const A = smooth01(0.4, 3.5, speed) * (1 - s * 0.25);
        const sn = Math.sin(stridePhase);
        const pl = Math.max(0, sn);
        const pr = Math.max(0, -sn);
        const crouch = 0.32 + 0.3 * s;
        const bl = crouch * (1 - 0.55 * pl * A) + 0.06 * pr * A;
        const br = crouch * (1 - 0.55 * pr * A) + 0.06 * pl * A;
        leg(P, 'l', bl, 0.28 * pl * A, 0.06 + 0.4 * pl * A);
        leg(P, 'r', br, 0.28 * pr * A, 0.06 + 0.4 * pr * A);
        P.hipY = -dropFor(Math.max(bl, br)) + Math.abs(Math.cos(stridePhase)) * 0.02 * A;
        P.hipX = -sn * 0.07 * A;
        P.hipRz = sn * 0.06 * A;
        P.hipRy = sn * 0.1 * A;
        P.spRx = 0.22 + 0.38 * s;
        P.chRx = 0.08 + 0.12 * s;
        P.chRy = -sn * 0.16 * A;
        P.spRz = -sn * 0.04 * A;
        // arms: swing opposite to the pushing leg; at speed tuck one arm behind the back like a speed skater
        const sw = 0.55 * A * (1 - s * 0.6);
        P.lsRx = sn * sw - 0.1;
        P.rsRx = -sn * sw - 0.1;
        P.lsRz = 0.2 + pl * 0.25 * A;
        P.rsRz = -0.2 - pr * 0.25 * A;
        P.leRx = -0.35 - Math.max(0, -sn) * 0.4 * A;
        P.reRx = -0.4 - Math.max(0, sn) * 0.4 * A;
        const tuck = smooth01(0.55, 0.95, s);
        P.lsRx = THREE.MathUtils.lerp(P.lsRx, 0.75, tuck);
        P.lsRz = THREE.MathUtils.lerp(P.lsRz, 0.12, tuck);
        P.leRx = THREE.MathUtils.lerp(P.leRx, -0.7, tuck);
        P.rsRx = THREE.MathUtils.lerp(P.rsRx, -sn * 0.7 - 0.1, tuck);
        // lean into the turn, look into it
        P.bodyRz = input.lean * (0.22 + 0.3 * s);
        P.bodyRx = 0.03 * s;
        P.hdRx = -(P.spRx + P.chRx) * 0.75;
        P.hdRy = input.lean * 0.4;
        P.hdRz = -input.lean * 0.15;
        if (input.mode === 'land') {
          leg(P, 'l', 0.75, 0, 0.12);
          leg(P, 'r', 0.75, 0, 0.12);
          P.hipY = -dropFor(0.75);
          P.spRx = 0.55;
          P.lsRz = 0.7;
          P.rsRz = -0.7;
        }
        break;
      }

      case 'air': {
        const falling = smooth01(-1, -6, input.vy);
        const tucked = trickT > 0 ? 1.15 : 0.85 * (1 - falling) + 0.35 * falling;
        leg(P, 'l', tucked, -0.15, 0.12);
        leg(P, 'r', tucked * 0.92, 0.05, 0.12);
        P.hipY = -0.03 + falling * -0.02;
        P.spRx = 0.18 + (trickT > 0 ? 0.25 : 0);
        P.chRx = 0.05;
        const armsOut = trickT > 0 ? 0.55 : 1.15;
        P.lsRz = armsOut + Math.sin(time * 4) * 0.08;
        P.rsRz = -armsOut - Math.sin(time * 4 + 1) * 0.08;
        P.lsRx = -0.35;
        P.rsRx = -0.25;
        P.leRx = -0.45;
        P.reRx = -0.5;
        if (trickT > 0) {
          // grab: right hand reaches toward the right skate
          P.rsRx = -0.9;
          P.rsRz = -0.35;
          P.reRx = -0.5;
        }
        P.hdRx = -0.15 - P.spRx * 0.5;
        P.bodyRz = input.lean * 0.15;
        break;
      }

      case 'grind': {
        const wob = Math.sin(time * 6.2);
        const wob2 = Math.sin(time * 4.7 + 1.3);
        leg(P, 'l', 0.48, 0, 0.24);
        leg(P, 'r', 0.52, 0, 0.24);
        P.hipY = -dropFor(0.52);
        P.bodyRy = 1.25;
        P.bodyRz = wob2 * 0.05;
        P.spRx = 0.18;
        P.chRz = wob * 0.07;
        P.lsRz = 1.25 + wob * 0.18;
        P.rsRz = -1.25 + wob * 0.18;
        P.lsRx = -0.2;
        P.rsRx = -0.2;
        P.leRx = -0.25;
        P.reRx = -0.3;
        P.hdRy = -1.0; // keep looking down the rail
        P.hdRx = -0.05;
        P.hdRz = -wob * 0.05;
        break;
      }

      case 'spray': {
        leg(P, 'l', 0.2, -0.05, 0.16);
        leg(P, 'r', 0.24, 0.1, 0.16);
        P.hipY = -dropFor(0.24);
        P.hipRy = 0.12;
        P.spRx = 0.06;
        P.chRy = -0.22;
        P.chRx = 0.04;
        // right arm out front holding the can at chest height, wrist working the paint
        P.rsRx = -1.42 + Math.sin(time * 2.1) * 0.06;
        P.rsRz = 0.1 + Math.sin(time * 1.7) * 0.18;
        P.reRx = -0.12;
        P.rhRx = 0.0 + Math.sin(time * 27) * 0.09;
        P.rhRz = Math.sin(time * 31) * 0.16;
        // left hand on the hip (twist arm so the elbow flexes inward)
        P.lsRz = 0.55;
        P.lsRy = -1.45;
        P.lsRx = 0.15;
        P.leRx = -1.75;
        P.lhRz = 0.3;
        P.hdRx = 0.06;
        P.hdRy = -0.18;
        P.hdRz = 0.08;
        break;
      }

      case 'wallride': {
        const side = input.lean >= 0 ? 1 : -1; // 1: wall on the right
        leg(P, 'l', 0.45, -0.1, 0.05);
        leg(P, 'r', 0.5, 0.1, 0.05);
        P.hipY = -dropFor(0.5);
        P.bodyRz = -side * 0.42;
        P.spRx = 0.2;
        P.spRz = side * 0.15;
        if (side > 0) {
          P.rsRz = -1.5;
          P.rsRx = -0.2;
          P.reRx = -0.1;
          P.lsRz = 0.9;
          P.lsRx = 0.4;
        } else {
          P.lsRz = 1.5;
          P.lsRx = -0.2;
          P.leRx = -0.1;
          P.rsRz = -0.9;
          P.rsRx = 0.4;
        }
        P.hdRz = side * 0.2;
        P.hdRx = -0.1;
        break;
      }
    }
  }

  function applyPose() {
    const b = bones;
    const P = cur;
    b.body.rotation.set(P.bodyRx, P.bodyRy, P.bodyRz);
    b.hips.position.set(P.hipX, REST.hipsY + P.hipY, 0);
    b.hips.rotation.set(P.hipRx, P.hipRy, P.hipRz);
    b.spine.rotation.set(P.spRx, P.spRy, P.spRz);
    b.chest.rotation.set(P.chRx, P.chRy, P.chRz);
    b.neck.rotation.set(P.nkRx, 0, 0);
    b.head.rotation.set(P.hdRx, P.hdRy, P.hdRz);
    b.shL.rotation.set(P.lsRx, P.lsRy, P.lsRz);
    b.elL.rotation.set(P.leRx, 0, 0);
    b.hdL.rotation.set(P.lhRx, 0, P.lhRz);
    b.shR.rotation.set(P.rsRx, -P.rsRy, P.rsRz);
    b.elR.rotation.set(P.reRx, 0, 0);
    b.hdR.rotation.set(P.rhRx, 0, P.rhRz);
    b.thL.rotation.set(P.ltRx, 0, P.ltRz);
    b.knL.rotation.set(P.lkRx, 0, 0);
    b.ftL.rotation.set(P.lfRx, 0, P.lfRz);
    b.thR.rotation.set(P.rtRx, 0, P.rtRz);
    b.knR.rotation.set(P.rkRx, 0, 0);
    b.ftR.rotation.set(P.rfRx, 0, P.rfRz);
  }

  const update = (dtIn: number, input: AnimInput) => {
    const dt = Math.min(Math.max(dtIn, 0), 0.1);
    time += dt;

    // ---- events
    if (input.mode !== prevMode) {
      if ((prevMode === 'air' && input.mode !== 'air') || input.mode === 'land') {
        const impact = THREE.MathUtils.clamp(-Math.min(lastVy, input.vy) * 0.045, 0.06, 0.32);
        squashVel += impact * 9;
        if (input.mode === 'land') landT = 0.22;
      }
      if (input.mode === 'air' && prevMode !== 'air') {
        squashVel -= 1.2; // pop: quick stretch
      }
      if (prevMode === 'air') trickT = 0;
    }
    if (input.trick && input.mode === 'air' && trickT <= 0) {
      trickT = 0.55;
      trickDir = Math.random() < 0.5 ? 1 : -1;
    }
    prevMode = input.mode;
    if (input.mode !== 'air') lastVy = 0;
    else lastVy = input.vy;

    const mode = landT > 0 && input.mode === 'skate' ? 'land' : input.mode;
    if (landT > 0) landT -= dt;

    computeTarget({ ...input, mode }, dt);

    // ---- blend toward target (exponential damping); snappier for landings / tricks
    const rate = mode === 'land' ? 22 : mode === 'air' ? 10 : mode === 'spray' ? 9 : 12;
    const k = 1 - Math.exp(-rate * dt);
    for (const key of KEYS) cur[key] += (tgt[key] - cur[key]) * k;
    applyPose();

    // ---- trick spin (direct, not damped, so it lands exactly on 0)
    let spin = 0;
    if (trickT > 0) {
      trickT = Math.max(0, trickT - dt);
      spin = easeOutCubic(1 - trickT / 0.55) * Math.PI * 2 * trickDir;
      if (trickT === 0) spin = 0;
    }
    bones.body.rotation.y = cur.bodyRy + spin;

    // ---- squash & stretch
    const accel = -260 * squash - 17 * squashVel;
    squashVel += accel * dt;
    squash += squashVel * dt;
    const targetStretch = input.mode === 'air' ? THREE.MathUtils.clamp(input.vy * 0.012, -0.06, 0.1) : 0;
    stretch += (targetStretch - stretch) * (1 - Math.exp(-10 * dt));
    const sy = THREE.MathUtils.clamp(1 - squash + stretch, 0.7, 1.25);
    const sxz = 1 / Math.sqrt(sy);
    bones.body.scale.set(sxz, sy, sxz);

    // ---- wheels
    const rolling = input.mode === 'skate' || input.mode === 'land' || input.mode === 'wallride';
    const targetWheel = rolling ? input.speed / 0.045 : input.mode === 'grind' ? 0 : wheelVel;
    wheelVel += (targetWheel - wheelVel) * (1 - Math.exp(-(input.mode === 'air' ? 0.6 : 8) * dt));
    wheelSpin += wheelVel * dt;
    for (const w of bones.wheels) w.rotation.x = wheelSpin;

    // ---- drawstrings hang with gravity, lag behind body motion
    const lean = cur.spRx + cur.chRx + cur.bodyRx;
    const flutter = (input.mode === 'skate' || input.mode === 'air' ? Math.min(input.speed / 12, 1) : 0) * 0.18;
    for (let i = 0; i < bones.strings.length; i++) {
      const sway = stringSway[i];
      const tx = -lean + flutter * Math.sin(time * 13 + i * 1.7) - flutter * 1.5;
      const tz = -(cur.bodyRz + cur.chRz) + flutter * 0.5 * Math.sin(time * 11 + i);
      const kk = 1 - Math.exp(-7 * dt);
      sway.x += (tx - sway.x) * kk;
      sway.y += (tz - sway.y) * kk;
      bones.strings[i].rotation.set(sway.x, 0, sway.y);
    }

    // ---- blink
    blinkTimer -= dt;
    if (blinkTimer <= 0) {
      blinkT = 0.13;
      blinkTimer = 1.8 + Math.random() * 3.5;
    }
    if (blinkT > 0) blinkT -= dt;
    bones.eyes.scale.y = blinkT > 0 ? 0.12 : 1;
  };

  const disposeBody = () => {
    bones.body.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose(); // materials are shared/cached, keep them
    });
    root.remove(bones.body);
  };

  applyPose();

  return {
    root,
    getNozzleWorld(out: THREE.Vector3) {
      bones.nozzle.updateWorldMatrix(true, false);
      return bones.nozzle.getWorldPosition(out);
    },
    update,
    setLook(next: CharacterLook) {
      disposeBody();
      bones = buildBody(next);
      root.add(bones.body);
      applyPose();
    },
    dispose() {
      disposeBody();
    },
  };
}

// ======================================================================= model
function buildBody(look: CharacterLook): Bones {
  const r = rng(look.seed * 2654435761 + 1);
  const opts = {
    shades: r() < 0.32,
    bandana: r() < 0.28,
    chain: r() < 0.55,
    patch: r() < 0.65,
    shoulder: 0.96 + r() * 0.12,
    headScale: 0.96 + r() * 0.1,
    smirk: (r() - 0.5) * 0.5,
    wheel: pick(r, [look.accent, 0xfff8f0, PAL.yellow, PAL.cyan, PAL.magenta]),
    pack: pick(r, [look.shoes, look.bottom, PAL.inkSoft, look.accent]),
    can2: pick(r, [PAL.cyan, PAL.yellow, PAL.green, PAL.magenta, PAL.orange]),
  };
  if (opts.pack === look.top) opts.pack = PAL.inkSoft;

  // palette for this skater
  const C = {
    skin: look.skin,
    skinShade: shade(look.skin, 0.82),
    blush: mixHex(look.skin, 0xff5a8a, 0.45),
    hair: look.hair,
    top: look.top,
    topTrim: trim(look.top),
    bottom: look.bottom,
    bottomTrim: trim(look.bottom),
    shoes: look.shoes,
    shoesTrim: trim(look.shoes),
    accent: look.accent,
    accentTrim: trim(look.accent),
    ink: PAL.ink,
    white: PAL.white,
    metal: PAL.metal,
    metalDark: PAL.metalDark,
    glove: lum(look.top) > 0.55 ? PAL.inkSoft : 0x2b2440,
  };

  const body = new THREE.Object3D();
  body.name = 'body';

  // ---------------------------------------------------------------- bones
  const hips = pivot('hips', body, [0, REST.hipsY, 0]);
  const spine = pivot('spine', hips, [0, 0.06, 0]);
  const chest = pivot('chest', spine, [0, 0.2, 0]);
  const neck = pivot('neck', chest, [0, 0.22, 0]);
  const head = pivot('head', neck, [0, 0.08, 0]);
  const sw = 0.25 * opts.shoulder;
  const shL = pivot('shoulderL', chest, [sw, 0.13, -0.005], 'ZYX');
  const elL = pivot('elbowL', shL, [0, -0.3, 0]);
  const hdL = pivot('handL', elL, [0, -0.29, 0]);
  const shR = pivot('shoulderR', chest, [-sw, 0.13, -0.005], 'ZYX');
  const elR = pivot('elbowR', shR, [0, -0.3, 0]);
  const hdR = pivot('handR', elR, [0, -0.29, 0]);
  const thL = pivot('thighL', hips, [0.105, -0.04, 0], 'ZYX');
  const knL = pivot('kneeL', thL, [0, -THIGH, 0]);
  const ftL = pivot('footL', knL, [0, -SHIN, 0]);
  const thR = pivot('thighR', hips, [-0.105, -0.04, 0], 'ZYX');
  const knR = pivot('kneeR', thR, [0, -THIGH, 0]);
  const ftR = pivot('footR', knR, [0, -SHIN, 0]);

  // ---------------------------------------------------------------- hips / pelvis
  {
    const b = new MeshBuilder();
    b.add(sph(0.18, 18, 12), M(C.bottom), [0, -0.03, 0], [0, 0, 0], [1.08, 0.72, 0.82]);
    b.add(torus(0.17, 0.024), M(C.ink), [0, 0.05, 0], [Math.PI / 2, 0, 0], [1.02, 0.8, 1]);
    b.add(rbox(0.07, 0.045, 0.025, 0.008), M(C.metal), [0, 0.05, 0.142]);
    b.add(rbox(0.04, 0.02, 0.028, 0.006), neon(C.accent, 1.6), [0, 0.05, 0.146]);
    // belt loops
    for (const x of [-0.12, 0.12]) b.add(rbox(0.018, 0.05, 0.02, 0.006), M(C.bottomTrim), [x, 0.05, 0.12], [0, x > 0 ? 0.6 : -0.6, 0]);
    if (opts.chain) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.12, 0.05, 0.12),
        new THREE.Vector3(0.18, -0.08, 0.1),
        new THREE.Vector3(0.2, -0.13, 0.0),
        new THREE.Vector3(0.17, -0.06, -0.1),
      ]);
      b.add(new THREE.TubeGeometry(curve, 24, 0.008, 5, false), M(C.metal));
    }
    hips.add(b.build('pelvis'));
  }

  // ---------------------------------------------------------------- torso (hoodie, hood, backpack, headphones)
  {
    const b = new MeshBuilder();
    const zs = 0.74; // torso depth squash
    const prof = [
      [0.0, -0.385], [0.2, -0.385], [0.24, -0.36], [0.255, -0.3], [0.245, -0.18], [0.25, -0.05],
      [0.27, 0.06], [0.268, 0.13], [0.23, 0.2], [0.14, 0.235], [0.06, 0.245], [0.0, 0.246],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    b.add(new THREE.LatheGeometry(prof, 28), M(C.top), [0, 0, 0], [0, 0, 0], [1, 1, zs]);
    // ribbed hem
    b.add(torus(0.232, 0.034, Math.PI * 2, 8, 28), M(C.topTrim), [0, -0.36, 0], [Math.PI / 2, 0, 0], [1, zs, 1]);
    // accent chest stripe: a slightly fatter lathe band
    const band = [[0.272, -0.005], [0.282, 0.0], [0.284, 0.045], [0.276, 0.055]].map(([x, y]) => new THREE.Vector2(x, y));
    b.add(new THREE.LatheGeometry(band, 28), M(C.accent), [0, 0, 0], [0, 0, 0], [1, 1, zs]);
    // kangaroo pocket
    b.add(rbox(0.3, 0.13, 0.05, 0.02), M(C.topTrim), [0, -0.21, 0.172], [-0.12, 0, 0]);
    b.add(rbox(0.31, 0.012, 0.055, 0.004), M(C.accent), [0, -0.143, 0.176], [-0.12, 0, 0]);
    // patch
    if (opts.patch) {
      b.add(cyl(0.045, 0.045, 0.012, 18), M(C.accent), [0.11, 0.11, 0.19], [Math.PI / 2 - 0.25, 0, 0]);
      b.add(cyl(0.026, 0.026, 0.014, 5), M(C.ink), [0.11, 0.11, 0.193], [Math.PI / 2 - 0.25, 0, 0]);
    }
    // hood bunched around the neck + back lump
    b.add(torus(0.12, 0.058, Math.PI * 2, 10, 24), M(C.top), [0, 0.215, -0.02], [Math.PI / 2 + 0.15, 0, 0], [1.05, 1, 0.95]);
    b.add(sph(0.13, 16, 10), M(C.top), [0, 0.19, -0.15], [0.4, 0, 0], [1.25, 0.75, 0.7]);
    b.add(torus(0.1, 0.018, Math.PI * 2, 6, 20), M(C.topTrim), [0, 0.2, -0.17], [0.35, 0, 0], [1.2, 0.85, 1]);
    // backpack
    const pc = opts.pack;
    b.add(rbox(0.3, 0.34, 0.13, 0.045), M(pc), [0, -0.03, -0.255]);
    b.add(rbox(0.23, 0.14, 0.05, 0.02), M(trim(pc)), [0, -0.1, -0.33]);
    b.add(rbox(0.31, 0.03, 0.135, 0.012), M(C.accent), [0, 0.07, -0.255]);
    b.add(rbox(0.04, 0.025, 0.02, 0.006), M(C.metal), [0.07, -0.03, -0.358]);
    // straps over the shoulders
    for (const sx of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(sx * 0.11, 0.1, -0.24),
        new THREE.Vector3(sx * 0.14, 0.215, -0.1),
        new THREE.Vector3(sx * 0.15, 0.2, 0.08),
        new THREE.Vector3(sx * 0.14, 0.05, 0.2),
        new THREE.Vector3(sx * 0.13, -0.1, 0.2),
      ]);
      b.add(new THREE.TubeGeometry(curve, 20, 0.017, 5, false), M(trim(pc)));
      b.add(rbox(0.035, 0.03, 0.02, 0.006), M(C.metal), [sx * 0.135, 0.0, 0.205]);
    }
    // spray cans poking out of the pack
    const cans: [number, number, number][] = [
      [0.075, C.accent, -0.2],
      [-0.07, opts.can2, 0.25],
    ];
    for (const [x, capC, tilt] of cans) {
      b.add(cyl(0.034, 0.034, 0.2, 14), M(C.white), [x, 0.17, -0.25], [0.12, 0, tilt]);
      b.add(cyl(0.0355, 0.0355, 0.06, 14), M(capC), [x - tilt * 0.06, 0.15, -0.247], [0.12, 0, tilt]);
      b.add(cyl(0.031, 0.031, 0.045, 14), M(capC), [x - tilt * 0.12, 0.285, -0.235], [0.12, 0, tilt]);
    }
    // headphones resting around the neck
    b.add(torus(0.115, 0.016, Math.PI, 6, 18), M(C.ink), [0, 0.24, -0.005], [-Math.PI / 2 + 0.15, 0, 0]);
    for (const sx of [-1, 1]) {
      b.add(cyl(0.05, 0.05, 0.04, 18), M(C.ink), [sx * 0.118, 0.245, 0.03], [0.2, 0, Math.PI / 2]);
      b.add(cyl(0.035, 0.035, 0.044, 18), M(C.accent), [sx * 0.118, 0.245, 0.03], [0.2, 0, Math.PI / 2]);
      b.add(torus(0.04, 0.006, Math.PI * 2, 5, 18), neon(C.accent, 2.4), [sx * 0.14, 0.245, 0.03], [0.2, sx * Math.PI / 2, 0]);
    }
    chest.add(b.build('torso'));
  }

  // drawstrings (separate pivots for secondary motion)
  const strings: THREE.Object3D[] = [];
  for (const sx of [-1, 1]) {
    const p = pivot('drawstring', chest, [sx * 0.05, 0.2, 0.17]);
    const b = new MeshBuilder();
    b.add(cyl(0.007, 0.007, 0.15, 6), M(C.white), [0, -0.075, 0]);
    b.add(cyl(0.011, 0.009, 0.03, 8), M(C.accent), [0, -0.16, 0]);
    p.add(b.build('string'));
    strings.push(p);
  }

  // ---------------------------------------------------------------- neck + head
  {
    const b = new MeshBuilder();
    b.add(cyl(0.058, 0.066, 0.13, 14), M(C.skinShade), [0, 0.03, 0.005]);
    if (opts.bandana) {
      b.add(torus(0.075, 0.032, Math.PI * 2, 8, 20), M(C.accent), [0, 0.03, 0.01], [Math.PI / 2, 0, 0]);
      b.add(new THREE.ConeGeometry(0.075, 0.12, 3), M(C.accent), [0, -0.035, 0.075], [Math.PI + 0.35, 0, 0], [1, 1, 0.35]);
      b.add(sph(0.022, 10, 8), M(C.accentTrim), [0, 0.03, -0.085]);
    }
    neck.add(b.build('neck'));
  }

  const eyes = pivot('eyes', head, [0, 0.118, 0.14]);
  {
    const hs = opts.headScale;
    const b = new MeshBuilder();
    // skull + jaw for a softer, more characterful face shape
    b.add(sph(0.15, 24, 18), M(C.skin), [0, 0.1, 0], [0, 0, 0], [0.95 * hs, 1.04 * hs, 1.0 * hs]);
    b.add(sph(0.11, 18, 12), M(C.skin), [0, 0.045, 0.035], [0, 0, 0], [1.08 * hs, 0.85 * hs, 1.0 * hs]);
    // ears
    for (const sx of [-1, 1]) {
      b.add(sph(0.036, 10, 8), M(C.skin), [sx * 0.143 * hs, 0.09, -0.005], [0, 0, 0], [0.45, 1, 0.8]);
      b.add(sph(0.018, 8, 6), M(C.skinShade), [sx * 0.152 * hs, 0.09, 0.0], [0, 0, 0], [0.4, 0.9, 0.7]);
    }
    // nose
    b.add(sph(0.026, 10, 8), M(C.skinShade), [0, 0.078, 0.152 * hs], [0, 0, 0], [0.9, 0.75, 1.05]);
    // brows: bold, angled for attitude
    for (const sx of [-1, 1]) {
      b.add(rbox(0.065, 0.017, 0.02, 0.007), Flat(look.hair === 0xf8f8f8 ? 0x9a9aa8 : shade(look.hair, 0.8)), [sx * 0.058, 0.168, 0.13 * hs], [0, sx * 0.3, sx * 0.16]);
    }
    // mouth: confident smirk
    b.add(torus(0.032, 0.0075, Math.PI, 5, 12), Flat(C.ink), [0.004, 0.037, 0.146 * hs], [0, 0, Math.PI + opts.smirk]);
    // cheeks
    for (const sx of [-1, 1]) b.add(sph(0.024, 10, 8), Flat(C.blush), [sx * 0.09, 0.062, 0.112 * hs], [0, sx * 0.6, 0], [1, 0.6, 0.35]);

    // hair + hats
    const hairM = M(C.hair);
    const hairCap = (thetaLen: number, tilt: number, rad = 0.158) =>
      b.add(new THREE.SphereGeometry(rad * hs, 22, 12, 0, Math.PI * 2, 0, thetaLen), hairM, [0, 0.105, -0.008], [-tilt, 0, 0], [0.98, 1.05, 1.02]);

    switch (look.hat) {
      case 'cap': {
        hairCap(Math.PI * 0.6, 0.45);
        const crown = C.accent === look.top ? C.topTrim : C.accent;
        b.add(new THREE.SphereGeometry(0.165 * hs, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), M(crown), [0, 0.125, -0.005], [-0.18, 0, 0], [1, 1.02, 1.04]);
        b.add(cyl(0.168 * hs, 0.168 * hs, 0.02, 22), M(trim(crown)), [0, 0.127, -0.005], [-0.18, 0, 0]);
        // brim, worn backwards
        b.add(cyl(0.115, 0.115, 0.014, 22), M(trim(crown)), [0, 0.16, -0.19], [-0.32, 0, 0], [1, 1, 0.78]);
        b.add(sph(0.018, 8, 6), M(trim(crown)), [0, 0.29, -0.04]);
        b.add(rbox(0.06, 0.02, 0.012, 0.005), neon(C.white, 1.2), [0, 0.18, 0.148], [0.35, 0, 0]);
        // tufts out the front gap
        for (let i = -1; i <= 1; i++) b.add(new THREE.ConeGeometry(0.03, 0.08, 6), hairM, [i * 0.05, 0.19, 0.12], [1.2, 0, i * 0.3]);
        break;
      }
      case 'beanie': {
        hairCap(Math.PI * 0.62, 0.4);
        b.add(new THREE.SphereGeometry(0.168 * hs, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), M(C.accent), [0, 0.115, -0.01], [-0.12, 0, 0], [1, 1.28, 1]);
        b.add(cyl(0.171 * hs, 0.174 * hs, 0.065, 24), M(C.accentTrim), [0, 0.135, -0.015], [-0.12, 0, 0]);
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          b.add(rbox(0.012, 0.06, 0.01, 0.004), M(shade(C.accentTrim, 0.85)), [Math.sin(a) * 0.174 * hs, 0.135 + Math.cos(a) * 0.02, -0.015 + Math.cos(a) * 0.174 * hs], [-0.12, a, 0]);
        }
        b.add(sph(0.052, 12, 10), M(C.white), [0, 0.345, -0.06]);
        // fringe
        for (let i = -2; i <= 2; i++) b.add(new THREE.ConeGeometry(0.026, 0.07, 6), hairM, [i * 0.035, 0.155, 0.135], [1.9, 0, i * 0.15]);
        break;
      }
      case 'mohawk': {
        // shaved sides: thin dark cap, then a tall crest of spikes
        b.add(new THREE.SphereGeometry(0.153 * hs, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), M(shade(C.hair, 0.55)), [0, 0.105, -0.01], [-0.35, 0, 0]);
        for (let i = 0; i < 7; i++) {
          const t = i / 6;
          const a = -0.9 + t * 2.1; // front -> back over the skull
          const h = 0.1 + Math.sin(t * Math.PI) * 0.07;
          const y = 0.1 + Math.cos(a) * 0.15;
          const z = -Math.sin(a) * 0.15;
          b.add(new THREE.ConeGeometry(0.038, h, 7), hairM, [0, y + Math.cos(a) * h * 0.45, z - Math.sin(a) * h * 0.45], [-a, 0, 0], [0.55, 1, 1.2]);
        }
        break;
      }
      case 'buns': {
        hairCap(Math.PI * 0.62, 0.35);
        for (const sx of [-1, 1]) {
          b.add(sph(0.065, 14, 12), hairM, [sx * 0.105, 0.255, -0.035]);
          b.add(torus(0.045, 0.012, Math.PI * 2, 6, 16), M(C.accent), [sx * 0.092, 0.215, -0.03], [Math.PI / 2 - 0.3, 0, sx * 0.55]);
        }
        for (let i = -2; i <= 2; i++) b.add(new THREE.ConeGeometry(0.028, 0.08, 6), hairM, [i * 0.035, 0.16, 0.135], [2.0, 0, i * 0.18]);
        break;
      }
      case 'none':
      default: {
        hairCap(Math.PI * 0.6, 0.42, 0.16);
        // swept spiky tufts
        const r2 = rng(look.seed + 99);
        for (let i = 0; i < 9; i++) {
          const a = -0.4 + (i / 8) * 1.6;
          const off = (r2() - 0.5) * 0.12;
          b.add(new THREE.ConeGeometry(0.04, 0.11 + r2() * 0.04, 6), hairM, [off, 0.12 + Math.cos(a) * 0.15, Math.sin(-a) * 0.15 + 0.03], [-a - 1.1, 0, off * 3]);
        }
        break;
      }
    }

    if (opts.shades) {
      b.add(rbox(0.24, 0.058, 0.04, 0.02), M(C.ink), [0, 0.12, 0.137 * hs], [0.05, 0, 0]);
      b.add(rbox(0.22, 0.012, 0.01, 0.004), neon(C.accent, 2.6), [0, 0.138, 0.158 * hs], [0.05, 0, 0]);
      for (const sx of [-1, 1]) b.add(rbox(0.008, 0.012, 0.13, 0.003), M(C.ink), [sx * 0.125, 0.125, 0.07]);
    }
    head.add(b.build('head'));

    // eyes on their own mesh so they can blink (hidden under shades but cheap)
    const e = new MeshBuilder();
    for (const sx of [-1, 1]) {
      e.add(sph(0.03, 14, 10), Flat(C.ink), [sx * 0.056, 0, 0.004], [0, sx * 0.35, 0], [0.72, 1.3, 0.4]);
      e.add(sph(0.0085, 8, 6), neon(0xffffff, 1.0), [sx * 0.051 + 0.006, 0.014, 0.018]);
      e.add(sph(0.0045, 6, 4), neon(0xffffff, 1.0), [sx * 0.061 - 0.004, -0.01, 0.017]);
    }
    if (!opts.shades) eyes.add(e.build('eyes'));
    else e.build('eyes').geometry.dispose();
  }

  // ---------------------------------------------------------------- arms
  const buildArm = (side: 1 | -1, sh: THREE.Object3D, el: THREE.Object3D, hd: THREE.Object3D) => {
    {
      const b = new MeshBuilder();
      b.add(sph(0.095, 16, 12), M(C.top), [side * 0.01, -0.02, 0], [0, 0, 0], [1, 1, 0.95]);
      b.add(cap(0.079, 0.17), M(C.top), [0, -0.15, 0]);
      // track-jacket double stripe down the sleeve
      b.add(cyl(0.083, 0.082, 0.03, 16), M(C.accent), [0, -0.12, 0]);
      b.add(cyl(0.082, 0.081, 0.014, 16), M(C.white), [0, -0.155, 0]);
      sh.add(b.build('upperArm'));
    }
    {
      const b = new MeshBuilder();
      b.add(cap(0.073, 0.14), M(C.top), [0, -0.11, 0]);
      b.add(cyl(0.077, 0.068, 0.065, 16), M(C.topTrim), [0, -0.225, 0]);
      b.add(cyl(0.049, 0.049, 0.04, 14), M(C.accent), [0, -0.265, 0]);
      el.add(b.build('forearm'));
    }
    {
      const b = new MeshBuilder();
      const gm = M(C.glove);
      b.add(rbox(0.088, 0.09, 0.055, 0.022), gm, [0, -0.05, 0]);
      b.add(rbox(0.084, 0.055, 0.058, 0.022), gm, [0, -0.1, 0.012], [0.45, 0, 0]);
      b.add(cap(0.017, 0.035, 8), gm, [-side * 0.045, -0.055, 0.028], [0.5, 0, -side * 0.6]);
      // accent knuckle guard
      b.add(rbox(0.07, 0.016, 0.012, 0.005), M(C.accent), [0, -0.088, -0.03], [0.3, 0, 0]);
      if (side === -1) {
        // spray can in the right fist; can axis = hand local +Z (upright when the arm points forward)
        const cz = 0.02;
        b.add(cyl(0.034, 0.034, 0.17, 16), M(C.white), [0, -0.085, cz], [Math.PI / 2, 0, 0]);
        b.add(cyl(0.0355, 0.0355, 0.07, 16), M(C.accent), [0, -0.085, cz - 0.02], [Math.PI / 2, 0, 0]);
        b.add(cyl(0.036, 0.036, 0.012, 16), neon(C.accent, 1.8), [0, -0.085, cz + 0.02], [Math.PI / 2, 0, 0]);
        b.add(new THREE.SphereGeometry(0.034, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M(C.metal), [0, -0.085, cz + 0.085], [Math.PI / 2, 0, 0]);
        b.add(cyl(0.012, 0.012, 0.022, 10), M(C.accent), [0, -0.085, cz + 0.122], [Math.PI / 2, 0, 0]);
        b.add(cyl(0.004, 0.004, 0.012, 6), M(C.ink), [0, -0.097, cz + 0.124], [0, 0, 0]);
      }
      hd.add(b.build('hand'));
    }
  };
  buildArm(1, shL, elL, hdL);
  buildArm(-1, shR, elR, hdR);
  const nozzle = pivot('nozzle', hdR, [0, -0.105, 0.022 + 0.124]);

  // ---------------------------------------------------------------- legs
  const wheels: THREE.Mesh[] = [];
  const buildLeg = (side: 1 | -1, th: THREE.Object3D, kn: THREE.Object3D, ft: THREE.Object3D) => {
    {
      const b = new MeshBuilder();
      b.add(cap(0.108, 0.24), M(C.bottom), [0, -0.19, 0], [0, 0, 0], [1.06, 1, 1]);
      // cargo pocket + flap
      b.add(rbox(0.05, 0.12, 0.13, 0.02), M(C.bottomTrim), [side * 0.098, -0.24, 0.005]);
      b.add(rbox(0.056, 0.03, 0.14, 0.01), M(C.bottomTrim), [side * 0.1, -0.175, 0.005]);
      b.add(rbox(0.012, 0.012, 0.03, 0.004), M(C.accent), [side * 0.128, -0.18, 0.04]);
      th.add(b.build('thigh'));
    }
    {
      const b = new MeshBuilder();
      b.add(cap(0.096, 0.22), M(C.bottom), [0, -0.17, 0]);
      // knee pad
      b.add(rbox(0.13, 0.13, 0.07, 0.03), M(C.ink), [0, -0.015, 0.072]);
      b.add(rbox(0.1, 0.022, 0.012, 0.006), M(C.accent), [0, -0.015, 0.108]);
      // baggy cuff bunching over the skate boot
      b.add(cyl(0.105, 0.125, 0.09, 18), M(C.bottom), [0, -0.33, 0.005]);
      b.add(torus(0.118, 0.016, Math.PI * 2, 6, 20), M(C.bottomTrim), [0, -0.37, 0.005], [Math.PI / 2, 0, 0]);
      kn.add(b.build('shin'));
    }
    {
      const b = new MeshBuilder();
      const zc = 0.05;
      // boot cuff + strap
      b.add(cyl(0.083, 0.09, 0.13, 16), M(C.shoesTrim), [0, 0.06, -0.005]);
      b.add(rbox(0.18, 0.032, 0.185, 0.014), M(C.accent), [0, 0.085, -0.005], [-0.12, 0, 0]);
      b.add(rbox(0.03, 0.04, 0.02, 0.006), M(C.metal), [side * 0.09, 0.085, 0.01]);
      // tongue
      b.add(rbox(0.085, 0.12, 0.035, 0.015), M(mixHex(C.shoes, 0xffffff, 0.2)), [0, 0.065, 0.085], [-0.35, 0, 0]);
      // chunky upper
      b.add(rbox(0.165, 0.13, 0.3, 0.055), M(C.shoes), [0, -0.025, zc]);
      b.add(rbox(0.158, 0.075, 0.09, 0.035), M(C.white === C.shoes ? 0xe8e0f0 : C.white), [0, -0.05, zc + 0.12]);
      // side accent panel (diagonal)
      for (const sx of [-1, 1]) b.add(rbox(0.006, 0.045, 0.19, 0.003), M(C.accent), [sx * 0.083, -0.03, zc - 0.01], [-0.22, 0, 0]);
      // laces
      for (let i = 0; i < 3; i++) b.add(rbox(0.095, 0.012, 0.018, 0.005), M(C.accent), [0, 0.035 - i * 0.012, zc + 0.04 + i * 0.035], [-0.3, 0, 0]);
      // sole
      b.add(rbox(0.178, 0.042, 0.325, 0.016), M(C.white), [0, -0.1, zc]);
      b.add(rbox(0.182, 0.01, 0.33, 0.004), M(C.accent), [0, -0.086, zc]);
      // skate frame: two plates + glowing strip + heel brake
      for (const sx of [-1, 1]) {
        b.add(rbox(0.014, 0.055, 0.34, 0.006), M(C.metalDark), [sx * 0.03, -0.138, zc]);
        b.add(rbox(0.004, 0.009, 0.28, 0.002), neon(C.accent, 2.2), [sx * 0.0385, -0.128, zc]);
      }
      b.add(rbox(0.05, 0.05, 0.06, 0.015), M(C.ink), [0, -0.15, zc - 0.165]);
      ft.add(b.build('skate'));

      // wheels (separate so they can spin)
      for (const wz of [-0.12, -0.04, 0.04, 0.12]) {
        const w = new MeshBuilder();
        w.add(cyl(0.045, 0.045, 0.026, 18), M(opts.wheel), [0, 0, 0], [0, 0, Math.PI / 2]);
        w.add(cyl(0.022, 0.022, 0.032, 10), M(C.metal), [0, 0, 0], [0, 0, Math.PI / 2]);
        w.add(rbox(0.034, 0.008, 0.02, 0.003), M(C.ink), [0, 0.03, 0]);
        const mesh = w.build('wheel');
        mesh.position.set(0, -0.155, zc + wz);
        ft.add(mesh);
        wheels.push(mesh);
      }
    }
  };
  buildLeg(1, thL, knL, ftL);
  buildLeg(-1, thR, knR, ftR);

  return {
    body, hips, spine, chest, neck, head, eyes,
    shL, elL, hdL, shR, elR, hdR,
    thL, knL, ftL, thR, knR, ftR,
    nozzle, strings, wheels,
  };
}
