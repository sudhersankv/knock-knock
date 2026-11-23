import * as THREE from 'three';
import { PAL } from './render/palette';
import { Post, LAYER_NO_OUTLINE } from './render/post';
import { Sky } from './render/sky';
import { updateWorldUniforms } from './render/materials';
import { setMaxAnisotropy } from './render/textures';
import { buildLevel } from './world/level';
import { createCharacter } from './assets/character';
import { randomLook } from './assets/looks';
import { CollisionWorld } from './game/physics';
import { Input } from './game/input';
import { PlayerController } from './game/player';
import { ChaseCamera } from './game/camera';
import { Fx } from './game/fx';
import { Spots } from './game/spots';
import { Remotes } from './game/remotes';
import { Audio } from './game/audio';
import { Hud } from './ui/hud';
import { Net } from './net/net';
import { TAG_RANGE } from '../shared/constants';
import type { CharacterLook, MatchPhase, PlayerInfo } from '../shared/protocol';
import type { CharacterRig } from './contracts';

// ------------------------------------------------------------------ renderer + scene
const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.05;
setMaxAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(PAL.fog, 90, 360);
const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.layers.enable(LAYER_NO_OUTLINE);

const sky = new Sky();
scene.add(sky.mesh);

const hemi = new THREE.HemisphereLight(PAL.hemiSky, PAL.hemiGround, 1.25);
scene.add(hemi);
const sun = new THREE.DirectionalLight(PAL.sunLight, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera;
sc.left = sc.bottom = -55;
sc.right = sc.top = 55;
sc.near = 1;
sc.far = 260;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.05;
scene.add(sun, sun.target);

const post = new Post(renderer, scene, camera);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  post.setSize(window.innerWidth, window.innerHeight);
});

// ------------------------------------------------------------------ world
// canvas textures draw text: wait for the web fonts or they fall back to Impact
await document.fonts.ready;
await Promise.all(['Bungee', 'Bungee Shade', 'Permanent Marker', 'Rubik Mono One', 'Space Mono'].map((f) => document.fonts.load(`40px "${f}"`).catch(() => null)));
const level = buildLevel();
scene.add(level.root);
const world = new CollisionWorld(level.collision, level.rails);
const fx = new Fx();
scene.add(fx.points);
const spots = new Spots(level.spots, fx);
scene.add(spots.group);
const remotes = new Remotes(scene, fx);

const input = new Input(canvas);
const hud = new Hud();
const net = new Net();
const player = new PlayerController(world);
const chase = new ChaseCamera(camera, world);
const audio = new Audio();

let rig: CharacterRig | null = null;
let myLook: CharacterLook = randomLook((Math.random() * 1e9) | 0);
let state: 'menu' | 'play' = 'menu';
let phase: MatchPhase = 'lobby';
const players = new Map<string, PlayerInfo>();

const center = level.bounds.getCenter(new THREE.Vector3());

function spawnPoint() {
  const s = level.spawns[Math.floor(Math.random() * level.spawns.length)] ?? new THREE.Vector3(0, 2, 0);
  return s.clone();
}

// ------------------------------------------------------------------ lobby -> join
async function boot() {
  let name = 'ROOKIE';
  try {
    name = localStorage.getItem('riot.name') || name;
  } catch {}
  const res = await hud.showLobby({ name, look: myLook });
  myLook = res.look;
  audio.start();
  hud.hideLobby();

  const welcome = await net.connect(res.name, res.look);
  for (const p of welcome.players) players.set(p.id, p);
  for (const p of welcome.players) if (p.id !== net.selfId) remotes.add(p);
  for (const t of welcome.tags) {
    const by = players.get(t.by);
    spots.applyTag(t, by?.name ?? 'CREW', by?.look.accent ?? PAL.magenta, true);
  }
  phase = welcome.match.phase;
  hud.setMatch(welcome.match);
  hud.setTimer(welcome.match.timeLeft);

  rig = createCharacter(myLook);
  scene.add(rig.root);
  const sp = spawnPoint();
  const yaw = Math.atan2(center.x - sp.x, center.z - sp.z);
  player.spawn(sp, yaw);
  chase.snapBehind(yaw);
  input.enabled = true;
  state = 'play';
  joinedAt = time;
  refreshPlayers();
  hud.setTagProgress(spots.tagged, spots.total);
  hud.feed(`<b>${escapeHtml(res.name)}</b> rolled into Neo-Gobble City${net.online ? '' : ' (offline)'}`);
  hud.pop('BRING THE COLOR BACK!', myLook.accent);
}

function refreshPlayers() {
  hud.setPlayers([...players.values()], net.selfId);
  hud.setScore(players.get(net.selfId)?.score ?? 0);
}

net.on('join', (p) => {
  players.set(p.id, p);
  if (p.id !== net.selfId) remotes.add(p);
  hud.feed(`<b style="color:#${p.look.accent.toString(16).padStart(6, '0')}">${escapeHtml(p.name)}</b> joined the crew`);
  refreshPlayers();
});
net.on('leave', (id) => {
  const p = players.get(id);
  players.delete(id);
  remotes.remove(id);
  if (p) hud.feed(`<b>${escapeHtml(p.name)}</b> bailed`);
  refreshPlayers();
});
net.on('snap', (t, states) => remotes.snapshot(t, states, net.selfId));
net.on('tagged', (tag, score) => {
  const by = players.get(tag.by);
  if (by) by.score = score;
  spots.applyTag(tag, by?.name ?? 'CREW', by?.look.accent ?? PAL.magenta);
  hud.setTagProgress(spots.tagged, spots.total);
  const spot = level.spots.find((s) => s.id === tag.spotId);
  const where = spot ? `${spot.district}` : 'somewhere';
  hud.feed(`<b>${escapeHtml(by?.name ?? 'CREW')}</b> tagged ${escapeHtml(where)}${spot?.big ? ' — <b>BIG PIECE!</b>' : ''}`);
  if (tag.by === net.selfId) {
    hud.pop(spot?.big ? 'MASTERPIECE!' : 'TAGGED!', myLook.accent);
    audio.tag(!!spot?.big);
    chase.shake(0.18);
    post.flash = 0.35;
  }
  if (spots.tagged === spots.total) hud.pop('THE CITY IS COLOR AGAIN!', PAL.yellow);
  refreshPlayers();
});
net.on('match', (m) => {
  if (m.phase === 'running' && phase !== 'running') {
    // new night: wipe tags + scores
    spots.reset();
    for (const p of players.values()) p.score = 0;
    hud.setTagProgress(0, spots.total);
    refreshPlayers();
    if (state === 'play' && time - joinedAt > 3) hud.pop('NEW NIGHT!', PAL.cyan);
  }
  phase = m.phase;
  hud.setMatch(m);
  hud.setTimer(m.timeLeft);
});
net.on('disconnect', () => hud.feed('<b>connection lost</b> — refresh to rejoin'));

// ------------------------------------------------------------------ loop
const clock = new THREE.Clock();
let time = 0;
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
let wasGrinding = false;
let joinedAt = 0;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 1 / 30);
  time += dt;

  if (state === 'menu') {
    // attract mode: slow orbit over the plaza
    const a = time * 0.06;
    camera.position.set(center.x + Math.sin(a) * 70, 34 + Math.sin(time * 0.2) * 4, center.z + Math.cos(a) * 70);
    camera.lookAt(center.x, 6, center.z);
    camera.fov = 60;
    camera.updateProjectionMatrix();
  } else if (rig) {
    const rig_ = rig;
    const candidate = phase === 'running' ? spots.candidate(player.position, TAG_RANGE) : null;
    player.update(dt, input, chase.yaw, candidate);

    for (const ev of player.drainEvents()) {
      switch (ev.type) {
        case 'jump':
          if (!ev.air) fx.dust(player.position, 6);
          audio.ollie();
          rig_.update(0, { mode: 'air', speed: player.speed, vy: player.velocity.y, lean: player.lean });
          break;
        case 'land':
          if (ev.impact > 3) audio.land(ev.impact);
          if (ev.impact > 6) {
            fx.dust(player.position, Math.min(30, ev.impact * 2));
            chase.shake(Math.min(0.12, ev.impact * 0.008));
          }
          break;
        case 'trick':
          hud.pop(ev.name, myLook.accent);
          audio.trick();
          break;
        case 'grindStart':
          hud.pop('GRIND!', PAL.yellow);
          break;
        case 'tagComplete':
          net.sendTag(ev.spotId, [player.position.x, player.position.y, player.position.z]);
          break;
        case 'boost':
          chase.shake(0.05);
          audio.boost();
          break;
      }
    }
    if (player.position.y < level.bounds.min.y - 25) {
      const sp = spawnPoint();
      player.spawn(sp, player.yaw);
      hud.pop('RESPAWN', PAL.magenta);
    }

    // rig
    rig_.root.position.copy(player.position);
    rig_.root.rotation.y = player.yaw;
    rig_.update(dt, { mode: player.mode, speed: player.speed, vy: player.velocity.y, lean: player.lean, trick: player.trickPending });
    player.trickPending = false;

    // fx
    if (player.isGrinding) fx.sparks(player.position, player.velocity);
    if (player.isGrinding !== wasGrinding && !player.isGrinding) fx.sparks(player.position, player.velocity);
    wasGrinding = player.isGrinding;
    if (player.boosting) fx.boostTrail(tmpV.copy(player.position).setY(player.position.y + 0.9), myLook.accent);
    if (player.mode === 'spray' && player.sprayTarget) {
      rig_.getNozzleWorld(tmpV);
      fx.spray(tmpV, tmpV2.copy(player.sprayTarget.normal).negate(), myLook.accent);
    }

    // camera + net + hud
    chase.update(dt, input, player.position, player.velocity, player.speed, player.grounded || player.isGrinding);
    net.sendState({
      p: [player.position.x, player.position.y, player.position.z],
      r: player.yaw,
      v: player.speed,
      vy: player.velocity.y,
      a: player.mode,
      l: player.lean,
    });
    hud.setSprayProgress(player.mode === 'spray' ? player.sprayProgress : null);
    hud.setPrompt(candidate && player.mode !== 'spray' ? (candidate.big ? 'HOLD [E] — BIG PIECE' : 'HOLD [E] TO TAG') : null);
    updateMarkers();
    audio.loops(player.mode === 'spray', player.isGrinding, player.speed);
    if (input.pressed('KeyM')) audio.toggleMusic();
    post.speed = THREE.MathUtils.damp(post.speed, THREE.MathUtils.clamp((player.speed - 11) / 6, 0, 1), 5, dt);

    // shadows follow the player
    sun.target.position.copy(player.position);
    sun.position.copy(player.position).addScaledVector(sky.sunDir, 120);
  }

  if (state === 'menu') {
    sun.target.position.copy(center);
    sun.position.copy(center).addScaledVector(sky.sunDir, 120);
  }

  remotes.update(dt, net.serverNow());
  level.update(dt, time);
  spots.update(dt, time);
  fx.update(dt);
  sky.update(time, camera);
  post.flash = THREE.MathUtils.damp(post.flash, 0, 6, dt);
  camera.updateMatrixWorld();
  updateWorldUniforms(time, camera, sky.sunDir);
  hud.update(dt);
  post.render(time);
  input.endFrame(dt);
}

const projV = new THREE.Vector3();
function updateMarkers() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const markers = spots.list.map((s) => {
    projV.copy(s.def.position).setY(s.def.position.y + s.def.size[1] * 0.5 + 1);
    const dist = projV.distanceTo(player.position);
    projV.project(camera);
    const behind = projV.z > 1;
    let x = (projV.x * 0.5 + 0.5) * w;
    let y = (-projV.y * 0.5 + 0.5) * h;
    if (behind) {
      x = w - x;
      y = h - 40;
    }
    const onScreen = !behind && x > 0 && x < w && y > 0 && y < h;
    return { id: s.def.id, x, y, onScreen, dist, big: s.def.big, tagged: s.tagged };
  });
  const off = markers.filter((m) => !m.onScreen && !m.tagged).sort((a, b) => a.dist - b.dist).slice(0, 3);
  hud.setMarkers(markers.filter((m) => (m.onScreen && m.dist < 160) || off.includes(m)));
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

(window as any).__game = { player, chase, spots, net };
frame();
boot().catch((e) => {
  console.error(e);
  hud.feed(`<b>error:</b> ${escapeHtml(String(e))}`);
});
