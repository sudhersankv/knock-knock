import * as THREE from 'three';
import type { Fx } from '../contracts';
import { radialTexture } from './glyphs';

/** Pooled soft particles: drop-in dust rings and sparkles. One draw call. */
export function createFx(scene: THREE.Scene): Fx {
  const MAX = 1200;
  const pos = new Float32Array(MAX * 3);
  const col = new Float32Array(MAX * 3);
  const size = new Float32Array(MAX);
  const vel = new Float32Array(MAX * 3);
  const life = new Float32Array(MAX);
  const maxLife = new Float32Array(MAX);
  const baseSize = new Float32Array(MAX);
  const drag = new Float32Array(MAX);
  const grav = new Float32Array(MAX);
  const baseCol = new Float32Array(MAX * 3);
  let head = 0;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: radialTexture() }, uScale: { value: 380 } },
    vertexShader: `attribute float size; attribute vec3 color; varying vec3 vC;
      uniform float uScale;
      void main(){ vC=color; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = size*uScale/max(-mv.z,0.1); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform sampler2D map; varying vec3 vC;
      void main(){ float a = texture2D(map, gl_PointCoord).a; if (a < 0.02) discard; gl_FragColor = vec4(vC*a, a); }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  const c = new THREE.Color();

  function spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, l: number, s: number, color: THREE.Color, dg: number, gv: number) {
    const i = head;
    head = (head + 1) % MAX;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
    life[i] = maxLife[i] = l;
    baseSize[i] = s;
    drag[i] = dg;
    grav[i] = gv;
    baseCol[i * 3] = color.r; baseCol[i * 3 + 1] = color.g; baseCol[i * 3 + 2] = color.b;
  }

  return {
    dropDust(x, z, color) {
      c.set(0xe8dff0).lerp(new THREE.Color(color), 0.3).multiplyScalar(0.9);
      for (let i = 0; i < 90; i++) {
        const a = (i / 48) * Math.PI * 2 + Math.random() * 0.1;
        const sp = 4 + Math.random() * 2.5;
        spawn(x + Math.cos(a) * 0.3, 0.15, z + Math.sin(a) * 0.3, Math.cos(a) * sp, 0.4 + Math.random() * 0.8, Math.sin(a) * sp, 0.8 + Math.random() * 0.4, 1.3 + Math.random() * 0.8, c, 4.0, -0.5);
      }
      c.set(color).multiplyScalar(1.4);
      for (let i = 0; i < 14; i++) spawn(x, 0.3, z, (Math.random() - 0.5) * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2, 0.8, 0.25, c, 1.5, 3);
    },
    sparkle(x, y, z, color) {
      c.set(color).multiplyScalar(1.8);
      for (let i = 0; i < 22; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 0.8 + Math.random() * 2.2;
        spawn(x, y, z, Math.cos(a) * sp, 1 + Math.random() * 2.5, Math.sin(a) * sp, 0.6 + Math.random() * 0.5, 0.18 + Math.random() * 0.15, c, 2, 2.5);
      }
    },
    update(dt) {
      for (let i = 0; i < MAX; i++) {
        if (life[i] <= 0) {
          size[i] = 0;
          continue;
        }
        life[i] -= dt;
        const k = Math.max(0, life[i] / maxLife[i]);
        const d = Math.exp(-drag[i] * dt);
        vel[i * 3] *= d; vel[i * 3 + 1] = vel[i * 3 + 1] * d - grav[i] * dt; vel[i * 3 + 2] *= d;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] = Math.max(0.05, pos[i * 3 + 1] + vel[i * 3 + 1] * dt); pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        size[i] = baseSize[i] * (0.6 + 0.4 * k);
        col[i * 3] = baseCol[i * 3] * k; col[i * 3 + 1] = baseCol[i * 3 + 1] * k; col[i * 3 + 2] = baseCol[i * 3 + 2] * k;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      geo.attributes.size.needsUpdate = true;
    },
  };
}
