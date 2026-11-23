import * as THREE from 'three';
import { LAYER_NO_OUTLINE } from '../render/post';

/*
  One pooled GPU particle system for everything: spray mist, grind sparks,
  landing dust, confetti bursts, paint splats. Ring-buffer allocation, CPU sim,
  soft round sprites with a hard comic edge.
*/
const MAX = 4000;

export interface EmitOpts {
  pos: THREE.Vector3;
  vel?: THREE.Vector3;
  spread?: number;
  color: number | THREE.Color;
  /** HDR multiplier (>1 glows through bloom). */
  glow?: number;
  size?: number;
  life?: number;
  gravity?: number;
  drag?: number;
  count?: number;
}

export class Fx {
  readonly points: THREE.Points;
  private pos = new Float32Array(MAX * 3);
  private vel = new Float32Array(MAX * 3);
  private col = new Float32Array(MAX * 3);
  private size = new Float32Array(MAX);
  private life = new Float32Array(MAX);
  private maxLife = new Float32Array(MAX);
  private grav = new Float32Array(MAX);
  private drag = new Float32Array(MAX);
  private alpha = new Float32Array(MAX);
  private head = 0;
  private geo: THREE.BufferGeometry;
  private c = new THREE.Color();

  constructor() {
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    for (let i = 0; i < MAX; i++) this.pos[i * 3 + 1] = -9999;

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      uniforms: { uScale: { value: window.innerHeight * 0.5 } },
      vertexShader: /* glsl */ `
        attribute float size;
        attribute float alpha;
        attribute vec3 color;
        varying vec3 vColor;
        varying float vAlpha;
        uniform float uScale;
        void main() {
          vColor = color;
          vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float d = length(p);
          if (d > 0.5) discard;
          // comic blob: flat fill with a darker rim
          float rim = smoothstep(0.36, 0.42, d);
          vec3 c = mix(vColor, vColor * 0.45, rim);
          gl_FragColor = vec4(c, vAlpha * (1.0 - smoothstep(0.46, 0.5, d)));
        }
      `,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.layers.set(LAYER_NO_OUTLINE);
    this.points.renderOrder = 10;
    window.addEventListener('resize', () => (mat.uniforms.uScale.value = window.innerHeight * 0.5));
  }

  emit(o: EmitOpts) {
    const n = o.count ?? 1;
    this.c.set(o.color as THREE.ColorRepresentation).multiplyScalar(o.glow ?? 1);
    const spread = o.spread ?? 1;
    for (let k = 0; k < n; k++) {
      const i = this.head;
      this.head = (this.head + 1) % MAX;
      const i3 = i * 3;
      this.pos[i3] = o.pos.x + (Math.random() - 0.5) * 0.1;
      this.pos[i3 + 1] = o.pos.y + (Math.random() - 0.5) * 0.1;
      this.pos[i3 + 2] = o.pos.z + (Math.random() - 0.5) * 0.1;
      const v = o.vel;
      this.vel[i3] = (v?.x ?? 0) + (Math.random() - 0.5) * 2 * spread;
      this.vel[i3 + 1] = (v?.y ?? 0) + (Math.random() - 0.5) * 2 * spread;
      this.vel[i3 + 2] = (v?.z ?? 0) + (Math.random() - 0.5) * 2 * spread;
      this.col[i3] = this.c.r;
      this.col[i3 + 1] = this.c.g;
      this.col[i3 + 2] = this.c.b;
      const life = (o.life ?? 0.8) * (0.7 + Math.random() * 0.6);
      this.life[i] = life;
      this.maxLife[i] = life;
      this.size[i] = (o.size ?? 0.15) * (0.6 + Math.random() * 0.8);
      this.grav[i] = o.gravity ?? 0;
      this.drag[i] = o.drag ?? 1.5;
      this.alpha[i] = 1;
    }
  }

  // ---- presets
  spray(nozzle: THREE.Vector3, dir: THREE.Vector3, color: number) {
    this.emit({ pos: nozzle, vel: dir.clone().multiplyScalar(6), spread: 0.9, color, size: 0.16, life: 0.35, drag: 4, count: 3 });
  }
  sparks(p: THREE.Vector3, vel: THREE.Vector3) {
    this.emit({ pos: p, vel: vel.clone().multiplyScalar(-0.25).add(new THREE.Vector3(0, 2.5, 0)), spread: 2.2, color: 0xffc23d, glow: 3, size: 0.07, life: 0.35, gravity: 14, drag: 1, count: 2 });
  }
  dust(p: THREE.Vector3, amount = 10) {
    this.emit({ pos: p, vel: new THREE.Vector3(0, 0.8, 0), spread: 2.2, color: 0xc9b6e8, size: 0.35, life: 0.6, drag: 3.5, count: amount });
  }
  boostTrail(p: THREE.Vector3, color: number) {
    this.emit({ pos: p, spread: 0.3, color, glow: 2.2, size: 0.22, life: 0.4, drag: 2, count: 2 });
  }
  burst(p: THREE.Vector3, colors: number[], count = 80) {
    for (let i = 0; i < count; i++) {
      this.emit({ pos: p, vel: new THREE.Vector3(0, 4, 0), spread: 7, color: colors[i % colors.length], glow: 1.4, size: 0.22, life: 1.4, gravity: 9, drag: 1.2 });
    }
  }

  update(dt: number) {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const i3 = i * 3;
      if (this.life[i] <= 0) {
        this.pos[i3 + 1] = -9999;
        this.alpha[i] = 0;
        continue;
      }
      const dr = Math.exp(-this.drag[i] * dt);
      this.vel[i3] *= dr;
      this.vel[i3 + 1] = this.vel[i3 + 1] * dr - this.grav[i] * dt;
      this.vel[i3 + 2] *= dr;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const t = this.life[i] / this.maxLife[i];
      this.alpha[i] = Math.min(1, t * 3);
    }
    for (const k of ['position', 'color', 'size', 'alpha']) (this.geo.attributes[k] as THREE.BufferAttribute).needsUpdate = true;
  }
}
