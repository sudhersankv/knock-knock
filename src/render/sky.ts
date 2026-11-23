import * as THREE from 'three';
import { PAL } from './palette';
import { LAYER_NO_OUTLINE } from './post';

/*
  Stylized dusk sky: banded gradient, a big striped retro sun sitting on the horizon,
  flat poster-style cloud bands, and stars that fade in toward the zenith.
  Drawn on a camera-following sphere so it never clips.
*/
export class Sky {
  readonly mesh: THREE.Mesh;
  readonly sunDir = new THREE.Vector3();
  private mat: THREE.ShaderMaterial;

  constructor(sunAzimuthDeg = 215, sunElevationDeg = 7) {
    const az = THREE.MathUtils.degToRad(sunAzimuthDeg);
    const el = THREE.MathUtils.degToRad(sunElevationDeg);
    this.sunDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();

    this.mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: true,
      uniforms: {
        uTop: { value: new THREE.Color(PAL.skyTop) },
        uMid: { value: new THREE.Color(PAL.skyMid) },
        uHorizon: { value: new THREE.Color(PAL.skyHorizon) },
        uGlow: { value: new THREE.Color(PAL.skyGlow) },
        uSun: { value: new THREE.Color(PAL.sun) },
        uSunDir: { value: this.sunDir },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww; // push to far plane
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop, uMid, uHorizon, uGlow, uSun, uSunDir;
        uniform float uTime;
        varying vec3 vDir;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 15731.743); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1,0)), u.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
        }
        float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }

        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;

          // posterized gradient: 3 hard-ish bands, like screen-printed sky
          vec3 col = mix(uHorizon, uMid, smoothstep(0.02, 0.22, h));
          col = mix(col, uTop, smoothstep(0.22, 0.65, h));
          float sunSide = max(dot(normalize(d.xz), normalize(uSunDir.xz)), 0.0);
          col = mix(col, uGlow, (1.0 - smoothstep(0.0, 0.16, h)) * pow(sunSide, 3.0) * 0.9);
          if (h < 0.0) col = mix(uHorizon * 0.85, uMid * 0.6, smoothstep(0.0, -0.3, h));

          // retro striped sun
          float sd = acos(clamp(dot(d, uSunDir), -1.0, 1.0));
          float sunR = 0.16;
          float disc = 1.0 - smoothstep(sunR - 0.004, sunR, sd);
          float rel = (d.y - uSunDir.y) / sunR;               // -1..1 across the disc
          float stripe = step(0.0, sin((rel + 0.2) * 22.0 + uTime * 0.6)) + step(0.25, rel);
          disc *= clamp(stripe, 0.0, 1.0);
          vec3 sunCol = mix(vec3(1.0, 0.35, 0.45), uSun, smoothstep(-1.0, 0.8, rel));
          col = mix(col, sunCol * 1.6, disc);
          col += uGlow * 0.35 * (1.0 - smoothstep(sunR, sunR * 3.5, sd));

          // poster clouds: two horizontal bands, thresholded fbm, flat colors with a lit lip
          vec2 cp = vec2(atan(d.x, d.z) * 3.0, h * 14.0);
          for (int b = 0; b < 2; b++) {
            float fb = float(b);
            float y0 = 0.07 + fb * 0.12;
            float band = 1.0 - smoothstep(0.0, 0.045 + fb * 0.02, abs(h - y0));
            float n = fbm(cp * vec2(2.2 + fb * 0.8, 2.6) + vec2(uTime * (0.01 + fb * 0.006), fb * 7.0));
            float v = n * band;
            float cloud = step(0.42, v);
            float lip = step(0.38, v) - cloud;
            vec3 cc = mix(vec3(0.98, 0.55, 0.62), vec3(0.55, 0.25, 0.65), fb);
            col = mix(col, cc, cloud * 0.95);
            col = mix(col, vec3(1.0, 0.85, 0.6), lip * 0.9 * (0.4 + sunSide));
          }

          // stars toward zenith
          vec2 sp = d.xz / max(d.y, 0.05) * 40.0;
          float star = step(0.995, hash(floor(sp))) * smoothstep(0.35, 0.8, h);
          star *= 0.6 + 0.4 * sin(uTime * 3.0 + hash(floor(sp)) * 40.0);
          col += vec3(star);

          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.layers.set(LAYER_NO_OUTLINE);
    this.mesh.name = 'sky';
  }

  update(time: number, camera: THREE.Camera) {
    this.mat.uniforms.uTime.value = time;
    this.mesh.position.copy(camera.position);
  }
}
