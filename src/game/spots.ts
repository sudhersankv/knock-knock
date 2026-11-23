import * as THREE from 'three';
import type { SpotDef } from '../contracts';
import type { TagRecord } from '../../shared/protocol';
import { WorldUniforms, MAX_TAG_LIGHTS, neon } from '../render/materials';
import { LAYER_NO_OUTLINE } from '../render/post';
import { canvasTexture } from '../render/textures';
import { PAL, hex } from '../render/palette';
import { makePieceTexture } from '../assets/graffiti';
import type { Fx } from './fx';

/*
  Graffiti spots.
   untagged: BLANDCO "authorized surface" beige panel + dashed target frame + floating neon spray icon
   tagged:   the crew's piece "paints on" with a wipe reveal, confetti burst, and a color-restore
             wave expands from the wall (WorldUniforms.uTags) bringing the city's color back.
*/

interface SpotRuntime {
  def: SpotDef;
  group: THREE.Group;
  blank: THREE.Mesh;
  marker: THREE.Group;
  piece: THREE.Mesh | null;
  pieceMat: THREE.ShaderMaterial | null;
  reveal: number;
  tagged: boolean;
  lightIndex: number;
  radius: number;
  radiusTarget: number;
}

export class Spots {
  readonly group = new THREE.Group();
  readonly list: SpotRuntime[] = [];
  private byId = new Map<string, SpotRuntime>();
  private taggedCount = 0;
  private restoreBaseTarget = 0;
  private tmp = new THREE.Vector3();

  constructor(defs: SpotDef[], private fx: Fx) {
    const blankTex = blankPanelTexture();
    for (const def of defs) {
      const g = new THREE.Group();
      g.position.copy(def.position).addScaledVector(def.normal, 0.04);
      g.lookAt(this.tmp.copy(g.position).add(def.normal));

      const [w, h] = def.size;
      const blank = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ map: blankTex, transparent: true, polygonOffset: true, polygonOffsetFactor: -2 }),
      );
      blank.layers.set(LAYER_NO_OUTLINE);
      g.add(blank);

      // floating marker: neon diamond + spray-can glyph, bobbing out from the wall
      const marker = new THREE.Group();
      const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(def.big ? 0.55 : 0.38, 0), neon(def.big ? PAL.yellow : PAL.magenta, 2.6));
      diamond.scale.y = 1.5;
      marker.add(diamond);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(def.big ? 0.95 : 0.7, 0.05, 6, 32), neon(PAL.cyan, 2.2));
      marker.add(ring);
      marker.position.set(0, h * 0.5 + 0.9, 0.8);
      marker.traverse((o) => o.layers.set(LAYER_NO_OUTLINE));
      g.add(marker);

      this.group.add(g);
      const rt: SpotRuntime = { def, group: g, blank, marker, piece: null, pieceMat: null, reveal: 0, tagged: false, lightIndex: -1, radius: 0, radiusTarget: 0 };
      this.list.push(rt);
      this.byId.set(def.id, rt);
    }
  }

  get total() {
    return this.list.length;
  }
  get tagged() {
    return this.taggedCount;
  }
  isTagged(id: string) {
    return this.byId.get(id)?.tagged ?? false;
  }

  /** Closest untagged spot the player can spray from here (in front of the wall, within range). */
  candidate(p: THREE.Vector3, range: number): SpotDef | null {
    let best: SpotDef | null = null;
    let bestD = range;
    for (const s of this.list) {
      if (s.tagged) continue;
      const d = this.tmp.copy(p).setY(p.y + 1).sub(s.def.position);
      const front = d.dot(s.def.normal);
      if (front < -0.2) continue;
      const dist = d.length();
      // allow tall walls: compare horizontal distance mostly
      const hd = Math.hypot(d.x, d.z);
      const eff = Math.min(dist, hd + Math.max(0, Math.abs(d.y) - s.def.size[1] * 0.5));
      if (eff < bestD) {
        bestD = eff;
        best = s.def;
      }
    }
    return best;
  }

  /** Apply a tag (from the server or offline). instant=true for tags that existed before we joined. */
  applyTag(tag: TagRecord, taggerName: string, accent: number, instant = false) {
    const s = this.byId.get(tag.spotId);
    if (!s || s.tagged) return;
    s.tagged = true;
    this.taggedCount++;
    const [w, h] = s.def.size;
    const tex = makePieceTexture(taggerName, tag.seed, accent, s.def.big);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      uniforms: { map: { value: tex }, uReveal: { value: instant ? 1.2 : 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map; uniform float uReveal; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
        void main(){
          vec4 c = texture2D(map, vUv);
          // wipe left->right with a wobbly spray edge
          float edge = uReveal * 1.25 - 0.1 + (h(floor(vUv*vec2(40.0,24.0))) - 0.5) * 0.08 + sin(vUv.y*18.0)*0.02;
          float m = step(vUv.x, edge);
          if (c.a * m < 0.02) discard;
          gl_FragColor = vec4(c.rgb, c.a * m);
          #include <colorspace_fragment>
        }`,
    });
    const piece = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.08, h * 1.08), mat);
    piece.position.z = 0.01;
    piece.layers.set(LAYER_NO_OUTLINE);
    s.group.add(piece);
    s.piece = piece;
    s.pieceMat = mat;
    s.reveal = instant ? 1.2 : 0;
    s.marker.visible = false;
    (s.blank.material as THREE.MeshBasicMaterial).opacity = 0.0;
    s.blank.visible = false;

    // color restore light
    s.radiusTarget = s.def.big ? 46 : 28;
    s.radius = instant ? s.radiusTarget : 0;
    s.lightIndex = this.taggedCount - 1;
    if (s.lightIndex < MAX_TAG_LIGHTS) {
      WorldUniforms.uTags.value[s.lightIndex].set(s.def.position.x, s.def.position.y, s.def.position.z, s.radius);
      WorldUniforms.uTagCount.value = Math.min(this.taggedCount, MAX_TAG_LIGHTS);
    }
    this.restoreBaseTarget = (this.taggedCount / Math.max(1, this.total)) * 0.55;
    if (this.taggedCount === this.total) this.restoreBaseTarget = 1;

    if (!instant) {
      const p = s.def.position.clone().addScaledVector(s.def.normal, 0.6);
      this.fx.burst(p, [accent, PAL.yellow, PAL.cyan, PAL.magenta, 0xffffff], s.def.big ? 160 : 90);
    }
  }

  /** Clear everything (new match). */
  reset() {
    for (const s of this.list) {
      if (s.piece) {
        s.group.remove(s.piece);
        s.piece.geometry.dispose();
        s.pieceMat?.dispose();
      }
      s.piece = null;
      s.pieceMat = null;
      s.tagged = false;
      s.marker.visible = true;
      s.blank.visible = true;
      (s.blank.material as THREE.MeshBasicMaterial).opacity = 1;
      s.radius = s.radiusTarget = 0;
    }
    this.taggedCount = 0;
    this.restoreBaseTarget = 0;
    WorldUniforms.uTagCount.value = 0;
  }

  update(dt: number, time: number) {
    WorldUniforms.uRestoreBase.value = THREE.MathUtils.damp(WorldUniforms.uRestoreBase.value, this.restoreBaseTarget, 1.2, dt);
    for (const s of this.list) {
      if (!s.tagged) {
        s.marker.position.y = s.def.size[1] * 0.5 + 0.9 + Math.sin(time * 2.4 + s.def.position.x) * 0.15;
        s.marker.children[0].rotation.y = time * 2;
        s.marker.children[1].rotation.x = Math.PI / 2 + Math.sin(time * 1.7) * 0.4;
        s.marker.children[1].rotation.y = time * 0.8;
        continue;
      }
      if (s.pieceMat && s.reveal < 1.2) {
        s.reveal = Math.min(1.2, s.reveal + dt * 1.4);
        s.pieceMat.uniforms.uReveal.value = s.reveal;
        const pop = 1 + Math.sin(Math.min(1, s.reveal) * Math.PI) * 0.06;
        s.piece!.scale.setScalar(pop);
      }
      if (s.radius < s.radiusTarget) {
        // fast at first, easing out: the wave rushes outward then settles
        s.radius += (s.radiusTarget - s.radius) * (1 - Math.exp(-1.1 * dt)) + dt * 2;
        s.radius = Math.min(s.radius, s.radiusTarget);
        if (s.lightIndex >= 0 && s.lightIndex < MAX_TAG_LIGHTS) WorldUniforms.uTags.value[s.lightIndex].w = s.radius;
      }
    }
  }
}

function blankPanelTexture() {
  return canvasTexture(
    512,
    256,
    (ctx, w, h) => {
      // BLANDCO "authorized surface" panel: beige, smug, begging to be painted over
      ctx.fillStyle = hex(PAL.blandCream);
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = hex(PAL.blandBeige);
      ctx.fillRect(10, 10, w - 20, h - 20);
      ctx.strokeStyle = hex(PAL.magenta);
      ctx.lineWidth = 8;
      ctx.setLineDash([28, 18]);
      ctx.strokeRect(18, 18, w - 36, h - 36);
      ctx.setLineDash([]);
      ctx.fillStyle = hex(PAL.blandBrown);
      ctx.font = '42px "Rubik Mono One", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('BLANDCO', w / 2, h / 2 - 8);
      ctx.font = '22px "Space Mono", monospace';
      ctx.fillText('AUTHORIZED BEIGE SURFACE', w / 2, h / 2 + 30);
      ctx.font = '16px "Space Mono", monospace';
      ctx.fillText('please do not enjoy', w / 2, h / 2 + 60);
    },
    {},
    'spot-blank',
  );
}
