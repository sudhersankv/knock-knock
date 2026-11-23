// Dev page: shows every preset skater with the real render pipeline. Open /viewer.html
import * as THREE from 'three';
import { PAL } from './render/palette';
import { Post, LAYER_NO_OUTLINE } from './render/post';
import { Sky } from './render/sky';
import { toon, updateWorldUniforms, WorldUniforms } from './render/materials';
import { createCharacter } from './assets/character';
import { PRESET_LOOKS } from './assets/looks';
import { canvasTexture } from './render/textures';
import { hex } from './render/palette';
import type { AnimMode } from '../shared/protocol';

WorldUniforms.uRestoreBase.value = 1;
const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.NeutralToneMapping;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(PAL.fog, 30, 120);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 1200);
camera.layers.enable(LAYER_NO_OUTLINE);
const sky = new Sky(200, 9);
scene.add(sky.mesh);
scene.add(new THREE.HemisphereLight(PAL.hemiSky, PAL.hemiGround, 1.25));
const sun = new THREE.DirectionalLight(PAL.sunLight, 2.4);
sun.position.set(8, 12, 16);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12 });
scene.add(sun);

// stage: painted floor disc
const floorTex = canvasTexture(1024, 1024, (ctx, w, h) => {
  ctx.fillStyle = hex(PAL.asphalt);
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = hex(PAL.yellow);
  ctx.lineWidth = 14;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 120 + i * 70, 0, Math.PI * 2);
    ctx.setLineDash([40, 30]);
    ctx.stroke();
  }
});
const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 64), toon(0xffffff, { map: floorTex }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const rigs = PRESET_LOOKS.map((p, i) => {
  const r = createCharacter(p.look);
  const n = PRESET_LOOKS.length;
  r.root.position.set((i - (n - 1) / 2) * 1.9, 0, Math.abs(i - (n - 1) / 2) * -0.6);
  r.root.rotation.y = -((i - (n - 1) / 2) * 0.18);
  scene.add(r.root);
  return r;
});

const post = new Post(renderer, scene, camera);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  post.setSize(innerWidth, innerHeight);
});

let mode: AnimMode = 'idle';
const modes: AnimMode[] = ['idle', 'skate', 'air', 'grind', 'spray', 'wallride'];
const bar = document.getElementById('bar')!;
for (const m of modes) {
  const b = document.createElement('button');
  b.textContent = m.toUpperCase();
  b.onclick = () => {
    mode = m;
    bar.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  };
  if (m === mode) b.classList.add('on');
  bar.appendChild(b);
}
const trickBtn = document.createElement('button');
trickBtn.textContent = 'TRICK!';
let trick = false;
trickBtn.onclick = () => {
  mode = 'air';
  trick = true;
};
bar.appendChild(trickBtn);

const clock = new THREE.Clock();
let t = 0;
let orbit = Number(new URLSearchParams(location.search).get('o') ?? 0);
(window as any).__dbg = { get cam() { return camera.position.toArray(); } };
let dragging = false;
canvas.addEventListener('mousedown', () => (dragging = true));
addEventListener('mouseup', () => (dragging = false));
addEventListener('mousemove', (e) => dragging && (orbit -= e.movementX * 0.006));
const params = new URLSearchParams(location.search);
if (params.get('mode')) mode = params.get('mode') as AnimMode;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 1 / 30);
  t += dt;
  if (!dragging) orbit += dt * 0.08 * (params.has('still') ? 0 : 1);
  const D = Number(params.get('d') ?? 11);
  const fx = Number(params.get('x') ?? 0);
  camera.position.set(fx + Math.sin(orbit) * D, 1.2 + D * 0.13, Math.cos(orbit) * D);
  camera.lookAt(fx, 1.0, 0);
  for (const r of rigs) r.update(dt, { mode, speed: mode === 'skate' ? 9 : 0, vy: mode === 'air' ? Math.sin(t * 2) * 4 : 0, lean: mode === 'skate' ? Math.sin(t) * 0.6 : 0, trick });
  trick = false;
  sky.update(t, camera);
  camera.updateMatrixWorld();
  updateWorldUniforms(t, camera, sky.sunDir);
  post.render(t);
}
frame();
