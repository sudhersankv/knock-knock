import * as THREE from 'three';
import type { Level, SpotDef } from '../contracts';
import { PAL } from '../render/palette';
import { rng, pick, range } from '../render/textures';
import { LAYER_NO_OUTLINE } from '../render/post';
import { makeWallTagTexture } from '../assets/graffiti';
import { G, Kit, T, Frame, prep } from './kit';
import { M } from './mats';
import { FONTS, SLOGANS } from './textures';
import { building, billboard, sideFrame, type BuiltBuilding, type BuildingSpec, type Side } from './buildings';
import * as P from './props';
import { quarterPipe, kicker, bank, stairs, halfPipe, funbox, flatRail, slopeRail, ledge, ringRail } from './skate';
import { turkey, TurkeyBlimp } from './turkey';

/*
  NEO-GOBBLE CITY — Thanksgiving night.

  Layout (meters, +x east, +z north, origin = Sir Gobblesworth statue):
    roads at x = ±45 and z = ±45 (12 m wide) cut the map into a 3x3 grid of blocks.
      west  column  x ∈ [-100, -51]  GRAVY DOCKS       (water beyond x = -100)
      center column x ∈ [-39, 39]    PIE PLAZA         (plaza in the middle block,
                                                         BLANDCO HQ boulevard north,
                                                         "The Pie Pit" skatepark south)
      east  column  x ∈ [51, 110]    CRANBERRY HEIGHTS (rooftop route H1 -> H2 -> H3)
*/

const C = M.c;
const HALF = 110;
const ROADS = [-45, 45];
const ROAD_W = 12;

type Updater = (dt: number, t: number) => void;

interface Ctx {
  k: Kit;
  W: Frame;
  up: Updater[];
  buildings: BuiltBuilding[];
  /** sides that must stay clean of ambient decals: "x0,z0|side" */
  reserved: Set<string>;
  spots: SpotDef[];
  flicker: THREE.Material[];
  extra: THREE.Object3D[];
}

const bkey = (s: BuildingSpec, side: Side) => `${s.x0},${s.z0}|${side}`;

function B(c: Ctx, s: BuildingSpec) {
  const b = building(c.k, s);
  c.buildings.push(b);
  c.flicker.push(...b.flicker);
  if (s.shop) c.reserved.add(bkey(s, s.shop.side));
  if (s.fireEscape) c.reserved.add(bkey(s, s.fireEscape));
  return b;
}

/** Register a graffiti spot + draw the beige "approved surface" panel it will be painted over. */
function spot(c: Ctx, id: string, pos: THREE.Vector3, normal: THREE.Vector3, size: [number, number], big: boolean, district: string) {
  const n = normal.clone().normalize();
  const ry = Math.atan2(n.x, n.z);
  const f = new Frame(c.k, T(pos.x, pos.y, pos.z, ry));
  const pw = size[0] + 0.5,
    ph = size[1] + 0.5;
  f.box(M.approved(), pw, ph, 0.05, 0, -ph / 2, 0.03, { cast: false });
  // corner bolts / frame
  f.box(C(PAL.blandBrown, { alwaysColor: true }), pw + 0.16, 0.1, 0.08, 0, ph / 2, 0.04, { cast: false });
  f.box(C(PAL.blandBrown, { alwaysColor: true }), pw + 0.16, 0.1, 0.08, 0, -ph / 2 - 0.1, 0.04, { cast: false });
  c.spots.push({ id, position: pos.clone().addScaledVector(n, 0.08), normal: n, size, big, district });
}

// ====================================================================== ground & roads
function ground(c: Ctx) {
  const W = c.W;
  // base slab (sidewalk) — also the collision floor
  W.box(M.sidewalk(), 260, 1, 320, 30, -1, 0, { tile: [6, 6], collide: true, cast: false });
  // plaza tiles
  W.box(M.plaza(), 70, 0.02, 70, 0, 0, 0, { tile: [8, 8], cast: false });
  // docks concrete
  W.box(M.dockGround(), 45, 0.015, 220, -77.5, 0, 0, { tile: [16, 16], cast: false });

  // roads: E-W full length, N-S split so they don't z-fight at intersections
  const asphalt = M.asphalt();
  const paint = C(PAL.roadPaint, { rim: 0, halftone: false });
  const white = C(PAL.white, { rim: 0, halftone: false });
  const curb = C(PAL.curb, { rim: 0.3 });
  const segs: [number, number][] = [
    [-160, -51],
    [-39, 39],
    [51, 160],
  ];
  for (const rz of ROADS) {
    // E-W
    W.box(asphalt, 260, 0.03, ROAD_W, 30, 0, rz, { tile: [8, 8], cast: false });
  }
  for (const rx of ROADS)
    for (const [a, b] of segs) W.box(asphalt, ROAD_W, 0.03, b - a, rx, 0, (a + b) / 2, { tile: [8, 8], cast: false });

  const inIntersection = (v: number) => ROADS.some((r) => Math.abs(v - r) < ROAD_W / 2 + 0.5);
  // markings
  for (const r of ROADS) {
    for (let t = -158; t < 158; t += 6) {
      if (!inIntersection(t) && !inIntersection(t + 3)) {
        if (t > -100) W.box(paint, 3, 0.01, 0.22, t + 1.5, 0.03, r, { cast: false }); // E-W dash
        W.box(paint, 0.22, 0.01, 3, r, 0.03, t + 1.5, { cast: false }); // N-S dash
      }
    }
    // edge lines (per segment)
    for (const [a, b] of segs) {
      const len = b - a,
        mid = (a + b) / 2;
      for (const off of [-5.3, 5.3]) {
        W.box(white, 0.15, 0.01, len - 2, r + off, 0.03, mid, { cast: false });
        if (mid > -100 || b > -100) {
          const a2 = Math.max(a, -100);
          W.box(white, b - a2 - 2, 0.01, 0.15, (a2 + b) / 2, 0.03, r + off, { cast: false });
        }
      }
      // curbs
      for (const off of [-6.15, 6.15]) {
        W.box(curb, 0.3, 0.14, len, r + off, 0, mid, { cast: false });
        const a2 = Math.max(a, -100);
        W.box(curb, b - a2, 0.14, 0.3, (a2 + b) / 2, 0, r + off, { cast: false });
      }
    }
  }
  // crosswalks around every intersection
  for (const ix of ROADS)
    for (const iz of ROADS) {
      for (const d of [-1, 1]) {
        const off = d * (ROAD_W / 2 + 1.8);
        for (let s = -5; s <= 5; s += 1.25) {
          W.box(white, 0.65, 0.012, 2.8, ix + s, 0.032, iz + off, { cast: false }); // across N-S road
          W.box(white, 2.8, 0.012, 0.65, ix + off, 0.032, iz + s, { cast: false }); // across E-W road
        }
      }
    }
  // manholes
  const r = rng(404);
  for (let i = 0; i < 14; i++) {
    const onX = r() < 0.5;
    const along = range(r, -95, 105);
    if (inIntersection(along)) continue;
    const road = pick(r, ROADS) + range(r, -3, 3);
    const [x, z] = onX ? [road, along] : [along, road];
    W.geo(G.circle(0.7, 18), M.manhole(), x, 0.04, z, { rx: -Math.PI / 2, cast: false });
  }

  // perimeter walls (invisible)
  W.solid(2, 80, 240, HALF + 1, -1, 0);
  W.solid(240, 80, 2, 0, -1, HALF + 1);
  W.solid(240, 80, 2, 0, -1, -HALF - 1);
}

// ====================================================================== street dressing
function streets(c: Ctx) {
  const W = c.W;
  const r = rng(77);
  const near = (v: number, list: number[], d: number) => list.some((x) => Math.abs(v - x) < d);
  for (const road of ROADS) {
    for (let t = -100; t <= 104; t += 18) {
      if (near(t, ROADS, 9)) continue;
      // N-S road sidewalks
      P.streetLamp(c.k.frame(road - 6.9, 0, t, Math.PI / 2), pick(r, [PAL.windowLit, PAL.magenta, PAL.cyan]));
      P.streetLamp(c.k.frame(road + 6.9, 0, t + 9, -Math.PI / 2), pick(r, [PAL.windowLit, PAL.magenta, PAL.cyan]));
      // E-W road sidewalks (skip into the water)
      if (t > -96) {
        P.streetLamp(c.k.frame(t + 4, 0, road - 6.9, 0), pick(r, [PAL.windowLit, PAL.magenta, PAL.cyan]));
        P.streetLamp(c.k.frame(t + 13, 0, road + 6.9, Math.PI), pick(r, [PAL.windowLit, PAL.magenta, PAL.cyan]));
      }
      if (r() < 0.5) P.hydrant(c.k.frame(road - 7.2, 0, t + 3));
      if (r() < 0.4) P.trashCan(c.k.frame(road + 7.4, 0, t + 5));
      if (r() < 0.35 && t > -96) P.trashCan(c.k.frame(t + 7, 0, road - 7.4));
    }
  }

  // traffic lights at each intersection (two poles, heads face both axes)
  const lensKits = {
    red: new Kit('lens-red'),
    yellow: new Kit('lens-yellow'),
    green: new Kit('lens-green'),
  };
  const head = (f: Frame) => {
    f.box(C(PAL.ink), 0.5, 1.5, 0.35, 0, -0.75, 0);
    f.box(C(PAL.yellow), 0.56, 0.06, 0.4, 0, 0.75, 0);
    const lf = (kit: Kit) => new Frame(kit, f.m);
    lf(lensKits.red).sphere(C(PAL.inkSoft), 0.15, 0, 0.42, 0.18, { seg: 10, noOutline: true });
    lf(lensKits.yellow).sphere(C(PAL.inkSoft), 0.15, 0, 0.0, 0.18, { seg: 10, noOutline: true });
    lf(lensKits.green).sphere(C(PAL.inkSoft), 0.15, 0, -0.42, 0.18, { seg: 10, noOutline: true });
    for (const y of [0.42, 0, -0.42]) f.box(C(PAL.ink), 0.4, 0.06, 0.25, 0, y + 0.17, 0.25);
  };
  for (const ix of ROADS)
    for (const iz of ROADS) {
      for (const d of [-1, 1]) {
        const px = ix + d * 7.2,
          pz = iz + d * 7.2;
        if (px < -99) continue;
        const pole = c.k.frame(px, 0, pz, d > 0 ? Math.PI : 0);
        pole.cyl(C(PAL.metalDark), 0.14, 0.18, 6.6, 0, 0, 0, { seg: 8 });
        pole.tube(C(PAL.metalDark), 0, 6.2, 0, 5.5, 6.2, 0, 0.08);
        head(pole.sub(5.5, 6.0, 0, Math.PI));
        head(pole.sub(0.3, 4.0, 0, -Math.PI / 2));
        pole.box(M.neonSign(d > 0 ? 'GRAVY AVE' : 'PIE ST', PAL.green, FONTS.bungee, 256, 64, 1.6), 1.6, 0.4, 0.04, 0.9, 6.5, 0, { cast: false });
      }
    }
  const lensGroups = Object.fromEntries(
    Object.entries(lensKits).map(([k, kit]) => {
      kit.finish();
      c.extra.push(kit.root);
      return [k, kit.root];
    }),
  ) as Record<'red' | 'yellow' | 'green', THREE.Group>;
  const on = { red: M.neon(PAL.red, 3.2), yellow: M.neon(PAL.yellow, 3.2), green: M.neon(PAL.green, 3.2) };
  const off = { red: C(0x5a1a2a), yellow: C(0x5a4a1a), green: C(0x1a4a2a) };
  const setLight = (which: 'red' | 'yellow' | 'green') => {
    for (const key of ['red', 'yellow', 'green'] as const) {
      lensGroups[key].traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) mesh.material = key === which ? on[key] : off[key];
      });
    }
  };
  let phase = '';
  c.up.push((_dt, t) => {
    const cyc = t % 14;
    const p = cyc < 6 ? 'green' : cyc < 8 ? 'yellow' : 'red';
    if (p !== phase) {
      phase = p;
      setLight(p as 'red');
    }
  });

  // parked cars in the parking lanes
  const carColors = [PAL.magenta, PAL.cyan, PAL.yellow, PAL.orange, PAL.violet, PAL.green, PAL.red, PAL.white, PAL.teal];
  let seed = 1;
  for (const road of ROADS) {
    for (let t = -95; t < 100; t += range(r, 9, 22)) {
      if (near(t, ROADS, 10) || r() < 0.35) continue;
      const side = r() < 0.5 ? -1 : 1;
      P.parkedCar(c.k.frame(road + side * 4.4, 0, t, side > 0 ? 0 : Math.PI), pick(r, carColors), seed++);
    }
    for (let t = -90; t < 100; t += range(r, 10, 24)) {
      if (near(t, ROADS, 10) || r() < 0.4) continue;
      const side = r() < 0.5 ? -1 : 1;
      P.parkedCar(c.k.frame(t, 0, road + side * 4.4, side > 0 ? -Math.PI / 2 : Math.PI / 2), pick(r, carColors), seed++);
    }
  }

  // power lines along Cranberry Heights' west sidewalk, sneakers hanging over the street
  const poleZ = [-100, -72, -30, -4, 22, 62, 95];
  const tops = poleZ.map((z) => P.utilityPole(c.k.frame(53.4, 0, z, 0)));
  for (let i = 0; i < tops.length - 1; i++) {
    for (const dx of [-1.0, 0, 1.0]) {
      // crossarm runs along x, wires run along z
      const a = new THREE.Vector3(tops[i].x + dx, tops[i].y, tops[i].z);
      const b = new THREE.Vector3(tops[i + 1].x + dx, tops[i + 1].y, tops[i + 1].z);
      const pts = P.wire(c.W, a, b, 1.1 + Math.abs(dx) * 0.2);
      if (i === 3 && dx === 0) P.hangingSneakers(c.W, pts[5]);
      if (i === 1 && dx === 1) P.hangingSneakers(c.W, pts[4]);
    }
  }
}

// ====================================================================== PIE PLAZA
function plaza(c: Ctx) {
  const k = c.k,
    W = c.W;
  const D = 'Pie Plaza';

  // --- statue of Sir Gobblesworth
  W.cyl(C(PAL.concrete), 5.5, 5.6, 1.0, 0, 0, 0, { seg: 28, collide: true });
  W.cyl(C(PAL.white), 5.62, 5.62, 0.1, 0, 0.92, 0, { seg: 28 });
  W.cyl(C(PAL.lilac), 3.3, 3.7, 2.3, 0, 1.0, 0, { seg: 24, collide: true });
  W.cyl(C(PAL.yellow), 3.45, 3.45, 0.22, 0, 3.1, 0, { seg: 24 });
  W.box(M.plaque(), 2.6, 1.0, 0.08, 0, 1.6, 3.55, { cast: false });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    W.box(M.neon(i % 2 ? PAL.magenta : PAL.cyan, 2.4), 0.35, 0.12, 0.35, Math.cos(a) * 5.1, 1.0, Math.sin(a) * 5.1, { noOutline: true, cast: false });
  }
  turkey(new Frame(k, T(0, 3.32, 0, 0, 0, 0, 2.3, 2.3, 2.3)), 'statue');
  W.solid(5, 7.5, 4.5, 0, 3.3, 0);
  ringRail(W, 5.48, 1.05, 32);

  // --- fountains
  const waterMat = M.water();
  for (const fx of [-22, 22]) {
    const fz = 16;
    W.cyl(C(PAL.teal), 4.0, 4.25, 0.7, fx, 0, fz, { seg: 28, collide: true });
    W.cyl(C(PAL.white), 4.06, 4.06, 0.09, fx, 0.66, fz, { seg: 28 });
    W.geo(G.circle(3.75, 28), waterMat, fx, 0.72, fz, { rx: -Math.PI / 2, cast: false });
    W.cyl(C(PAL.mint), 0.45, 0.6, 1.5, fx, 0.7, fz, { seg: 12 });
    W.cyl(C(PAL.teal), 1.3, 0.5, 0.4, fx, 2.1, fz, { seg: 16 });
    W.geo(G.circle(1.2, 16), waterMat, fx, 2.48, fz, { rx: -Math.PI / 2, cast: false });
    ringRail(W, 3.96, 0.76, 28);
    // animated spray
    const spray = new THREE.Mesh(
      new THREE.ConeGeometry(0.55, 2.4, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9ff8ff).multiplyScalar(1.3), transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }),
    );
    spray.rotation.x = Math.PI; // wide at the top
    spray.position.set(fx, 3.6, fz);
    spray.layers.set(LAYER_NO_OUTLINE);
    c.extra.push(spray);
    const fall = new THREE.Mesh(
      new THREE.CylinderGeometry(1.25, 1.6, 1.4, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7ff0ff), transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
    );
    fall.position.set(fx, 1.75, fz);
    fall.layers.set(LAYER_NO_OUTLINE);
    c.extra.push(fall);
    const ph = fx * 0.1;
    c.up.push((_dt, t) => {
      spray.scale.set(1 + Math.sin(t * 5 + ph) * 0.08, 1 + Math.sin(t * 3.3 + ph) * 0.15, 1 + Math.cos(t * 5 + ph) * 0.08);
      (fall.material as THREE.MeshBasicMaterial).opacity = 0.3 + Math.sin(t * 7 + ph) * 0.06;
    });
  }

  // --- south terrace with stairs, banks, ledges
  W.box(C(PAL.lilac), 60, 2.4, 12, 0, 0, -33, { collide: true });
  W.box(M.plaza(), 60, 0.02, 12, 0, 2.4, -33, { tile: [8, 8], cast: false });
  W.box(C(PAL.white), 60.1, 0.12, 0.3, 0, 2.3, -27.05);
  stairs(k.frame(0, 0, -21, Math.PI), 12, 2.4, 6, 8, PAL.peach, [-5.7, 0, 5.7]);
  bank(k.frame(-23, 0, -19, Math.PI), 10, 2.4, 8, PAL.magenta);
  bank(k.frame(23, 0, -19, Math.PI), 10, 2.4, 8, PAL.cyan);
  W.rail([
    [-17.8, 2.45, -27.05],
    [-6.3, 2.45, -27.05],
  ]);
  W.rail([
    [6.3, 2.45, -27.05],
    [17.8, 2.45, -27.05],
  ]);
  spot(c, 'plaza-terrace', new THREE.Vector3(-12, 1.2, -27), new THREE.Vector3(0, 0, 1), [9.5, 1.85], false, D);
  W.box(M.poster('PLEASE REMAIN NEUTRAL'), 4.4, 2.0, 0.06, 12, 0.2, -26.97, { cast: false });
  // terrace dressing
  B(c, { x0: -24, x1: -16, z0: -38.5, z1: -33, y0: 2.4, h: 4.2, color: PAL.peach, style: 'grid', trim: PAL.magenta, shop: { side: 'n', name: 'GRAVY BAR', color: PAL.orange, awning: [PAL.orange, PAL.white] }, seed: 9 });
  P.vendingMachine(k.frame(-12, 2.4, -37.5, 0), 1, PAL.magenta);
  P.vendingMachine(k.frame(-10.6, 2.4, -37.5, 0), 2, PAL.cyan);
  P.bench(k.frame(6, 2.4, -31, 0));
  P.bench(k.frame(12, 2.4, -31, 0));
  P.trashCan(k.frame(9, 2.4, -31.5));
  ledge(k.frame(22, 2.4, -34, 0), 8, 0.55, 1.2, PAL.yellow);
  // big neon district sign on the terrace
  const sign = k.frame(0, 2.4, -38.2, 0);
  for (const x of [-5, 5]) sign.box(C(PAL.metalDark), 0.3, 6.2, 0.3, x, 0, 0);
  sign.box(C(PAL.ink), 13, 2.8, 0.4, 0, 5.2, 0);
  sign.box(M.neonSign('PIE PLAZA', PAL.magenta, FONTS.shade, 1024, 220, 2.4), 12.4, 2.5, 0.04, 0, 5.35, 0.22, { noOutline: true, cast: false });

  // --- funbox + kickers in front of the statue
  funbox(k.frame(0, 0, 26, 0), 4, 1.0, 6, 3, PAL.yellow);
  kicker(k.frame(-12, 0, 24, Math.PI * 0.85), 3, 1.1, 2.6, PAL.orange);
  kicker(k.frame(12, 0, 24, -Math.PI * 0.85), 3, 1.1, 2.6, PAL.violet);

  // --- quarter pipes on east/west plaza edges
  quarterPipe(k.frame(-30, 0, 0, -Math.PI / 2), 16, 3, 4, 1.5, PAL.cyan);
  quarterPipe(k.frame(30, 0, 0, Math.PI / 2), 16, 3, 4, 1.5, PAL.magenta);

  // --- planters (grindable)
  let s = 100;
  for (const [x, z] of [
    [-14, -10],
    [14, -10],
    [-14, 6],
    [14, 6],
  ])
    P.planter(k.frame(x, 0, z, 0), 8, s++);

  // --- benches around the statue facing it
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const x = Math.cos(a) * 10,
      z = Math.sin(a) * 10;
    P.bench(k.frame(x, 0, z, Math.atan2(-x, -z)));
    P.trashCan(k.frame(x + Math.cos(a + 1.57) * 1.6, 0, z + Math.sin(a + 1.57) * 1.6));
  }

  // --- billboard towers (spots on the bases)
  for (const sx of [-1, 1]) {
    const x = sx * 32;
    W.box(C(PAL.concreteDark), 5, 3, 5, x, 0, 32, { collide: true, tile: [2, 2] });
    W.box(C(PAL.yellow), 5.2, 0.2, 5.2, x, 2.9, 32);
    billboard(k.frame(x, 3, 32, Math.PI), 10, 5, 4, M.poster(sx < 0 ? 'STAY BEIGE' : 'COLOR IS A PHASE', 768, 384));
    spot(c, sx < 0 ? 'plaza-tower-west' : 'plaza-tower-east', new THREE.Vector3(x, 1.55, 29.5), new THREE.Vector3(0, 0, -1), [4, 2.2], false, D);
  }

  // --- plaza lamps
  for (let t = -28; t <= 28; t += 14) {
    P.streetLamp(k.frame(t, 0, 36.5, Math.PI));
    if (Math.abs(t) > 8) P.streetLamp(k.frame(36.5, 0, t, -Math.PI / 2));
    if (Math.abs(t) > 8) P.streetLamp(k.frame(-36.5, 0, t, Math.PI / 2));
  }
  P.phoneBooth(k.frame(-36.5, 0, 22, Math.PI / 2));
  P.phoneBooth(k.frame(36.5, 0, -14, -Math.PI / 2));
  P.hydrant(k.frame(37.5, 0, 37.5));
  P.hydrant(k.frame(-37.5, 0, -37.5));
}

// ====================================================================== downtown north (BLANDCO HQ boulevard)
function north(c: Ctx) {
  const k = c.k,
    W = c.W;
  const D = 'Pie Plaza';
  B(c, { x0: -38, x1: -24, z0: 52, z1: 70, h: 14, color: PAL.peach, style: 'grid', parapet: true, roofJunk: true, fireEscape: 'w', shop: { side: 's', name: 'GRAVY HUT', color: PAL.orange, awning: [PAL.orange, PAL.white] }, seed: 11 });
  const s2: BuildingSpec = { x0: -24, x1: -10, z0: 52, z1: 70, h: 18, color: PAL.brick, style: 'brick', parapet: true, roofJunk: true, shop: { side: 's', name: 'PIE-O-RAMA', color: PAL.magenta, awning: [PAL.magenta, PAL.white] }, seed: 12 };
  B(c, s2);
  const s3: BuildingSpec = { x0: 10, x1: 24, z0: 52, z1: 70, h: 12, color: PAL.teal, style: 'grid', parapet: true, roofJunk: true, shop: { side: 's', name: 'YAMS 24/7', color: PAL.green, awning: [PAL.green, PAL.yellow] }, seed: 13 };
  B(c, s3);
  B(c, { x0: 24, x1: 38, z0: 52, z1: 70, h: 20, color: PAL.lilac, style: 'ribbon', parapet: true, roofJunk: true, fireEscape: 'e', shop: { side: 's', name: 'DRUMSTIX', color: PAL.cyan, awning: [PAL.cyan, PAL.white] }, seed: 14 });
  // back towers
  B(c, { x0: -38, x1: -16, z0: 74, z1: 108, h: 34, color: PAL.violet, style: 'ribbon', parapet: true, roofJunk: true, seed: 15 });
  B(c, { x0: 16, x1: 38, z0: 74, z1: 108, h: 28, color: PAL.tealDark, style: 'grid', parapet: true, roofJunk: true, seed: 16 });

  // HQ
  const hq: BuildingSpec = { x0: -14, x1: 14, z0: 80, z1: 104, h: 60, color: PAL.blandBeige, style: 'glass', bland: true, parapet: true, seed: 17 };
  B(c, hq);
  c.reserved.add(bkey(hq, 's'));
  const hf = sideFrame(k, hq, 's').f;
  hf.box(M.neonSign('BLANDCO', 0xf3e8d0, FONTS.rubik, 1024, 200, 1.7), 22, 4.2, 0.05, 0, 54, 0.12, { noOutline: true, cast: false });
  hf.box(M.beige(PAL.blandBrown), 6, 4.5, 1.2, 0, 0, 0.6);
  hf.box(M.glass(), 4.6, 3.6, 0.05, 0, 0.2, 1.22);
  hf.box(M.beige(PAL.blandCream), 28.6, 0.6, 3.2, 0, 4.5, 1.6);
  hf.box(M.poster('GRAVY IS MANDATORY', 768, 384), 9, 4.2, 0.06, -8.5 + 17, 0.6, 0.05, { cast: false });
  spot(c, 'big-hq-front', new THREE.Vector3(-8, 2.4, 80), new THREE.Vector3(0, 0, -1), [10, 3.6], true, D);
  // beige boulevard
  W.box(M.beige(0xe2d4b6), 20, 0.022, 28, 0, 0, 66, { cast: false });
  for (let z = 55; z <= 77; z += 7.3)
    for (const x of [-8.5, 8.5]) {
      W.cyl(M.beige(PAL.blandBrown), 0.08, 0.08, 6, x, 0, z, { seg: 6 });
      W.box(M.beige(PAL.blandCream), 0.05, 3, 1.3, x, 2.6, z + 0.7);
      W.box(M.beige(PAL.blandBrown), 0.06, 0.35, 1.3, x, 4.6, z + 0.7);
    }
  flatRail(W, 0, 55, 0, 77, 0.75, 0, PAL.yellow);
  ledge(k.frame(-5, 0, 66, Math.PI / 2), 12, 0.6, 1.4, PAL.concrete);
  ledge(k.frame(5, 0, 66, Math.PI / 2), 12, 0.6, 1.4, PAL.concrete);
  kicker(k.frame(0, 0, 50.5 + 2, 0), 3, 0.9, 2.2, PAL.orange);
  // spots on the shop side walls facing the boulevard
  spot(c, 'north-pieorama-side', new THREE.Vector3(-10, 2.4, 61), new THREE.Vector3(1, 0, 0), [6, 2.8], false, D);
  spot(c, 'north-yams-side', new THREE.Vector3(10, 2.4, 61), new THREE.Vector3(-1, 0, 0), [6, 2.8], false, D);
  c.reserved.add(bkey(s2, 'e'));
  c.reserved.add(bkey(s3, 'w'));
  P.dumpster(k.frame(-8.5, 0, 72, Math.PI / 2), PAL.green);
  P.dumpster(k.frame(8.5, 0, 72.5, -Math.PI / 2), PAL.violet);
}

// ====================================================================== downtown south (The Pie Pit)
function south(c: Ctx) {
  const k = c.k,
    W = c.W;
  const D = 'Pie Plaza';
  W.box(C(PAL.concrete), 76, 0.02, 56, 0, 0, -81, { cast: false, tile: [4, 4] });
  halfPipe(k.frame(8, 0, -72, 0), 18, 3.2, 4, 8, 2, PAL.violet);
  // the pit wall
  W.box(C(PAL.concrete), 24, 4.2, 1, 0, 0, -96.5, { collide: true, tile: [3, 3] });
  W.box(C(PAL.magenta), 24.4, 0.3, 1.3, 0, 4.2, -96.5);
  spot(c, 'big-pit-wall', new THREE.Vector3(0, 2.1, -96), new THREE.Vector3(0, 0, 1), [14, 3.3], true, D);
  // skate ledges + funbox
  ledge(k.frame(-24, 0, -72, Math.PI / 2), 10, 0.6, 1.2, PAL.yellow);
  ledge(k.frame(-31, 0, -72, Math.PI / 2), 10, 0.9, 1.2, PAL.cyan);
  funbox(k.frame(-27.5, 0, -88, Math.PI / 2), 5, 1.2, 5, 3.5, PAL.orange);
  kicker(k.frame(-14, 0, -58, Math.PI), 4, 1.2, 3.2, PAL.green);
  flatRail(W, -20, -62, -32, -62, 0.6, 0, PAL.magenta);
  // stair set up to the skate shop platform
  W.box(C(PAL.lilac), 22, 1.8, 10, 27, 0, -105, { collide: true, tile: [2, 2] });
  W.box(C(PAL.white), 22.1, 0.1, 0.3, 27, 1.72, -100.05);
  stairs(k.frame(27, 0, -94, Math.PI), 8, 1.8, 6, 6, PAL.yellow, [-4.3, 4.3]);
  bank(k.frame(19.5, 0, -94, Math.PI), 4.5, 1.8, 6, PAL.cyan);
  W.rail([
    [16.3, 1.85, -100.05],
    [22.7, 1.85, -100.05],
  ]);
  const shop: BuildingSpec = { x0: 26, x1: 38, z0: -110, z1: -104, y0: 1.8, h: 6, color: PAL.orange, style: 'brick', parapet: true, trim: PAL.ink, shop: { side: 'n', name: 'BOARD ROOM', color: PAL.yellow, awning: [PAL.yellow, PAL.ink] }, seed: 21 };
  B(c, shop);
  spot(c, 'pit-skateshop-side', new THREE.Vector3(26, 1.8 + 2.3, -107), new THREE.Vector3(-1, 0, 0), [4.2, 2.6], false, D);
  c.reserved.add(bkey(shop, 'w'));
  // parking lot
  const lotPaint = C(PAL.white, { rim: 0, halftone: false });
  for (let i = 0; i < 8; i++) W.box(lotPaint, 0.15, 0.01, 5, -36 + i * 3, 0.03, -104, { cast: false });
  const r = rng(5);
  for (let i = 0; i < 7; i++) if (r() < 0.65) P.parkedCar(k.frame(-34.5 + i * 3, 0, -104, 0), pick(r, [PAL.magenta, PAL.cyan, PAL.yellow, PAL.green, PAL.violet]), 50 + i);
  P.busStop(k.frame(-22, 0, -53.6, 0));
  P.streetLamp(k.frame(-14, 0, -104, 0), PAL.magenta);
  P.streetLamp(k.frame(10, 0, -98.5, 0), PAL.cyan);
  for (let i = 0; i < 6; i++) P.cone(k.frame(-6 + i * 1.6, 0, -86 + (i % 2) * 0.6));
  P.barrier(k.frame(-12, 0, -86, 0.3));
  P.dumpster(k.frame(36, 0, -92, -Math.PI / 2), PAL.teal);
  P.bench(k.frame(-6, 0, -92, 0));
  P.bench(k.frame(6, 0, -92, 0));
}

// ====================================================================== GRAVY DOCKS
function container(c: Ctx, x: number, yb: number, z: number, alongX: boolean, color: number) {
  const w = alongX ? 12.2 : 2.44,
    d = alongX ? 2.44 : 12.2;
  c.W.box(M.corrugated(color), w, 2.6, d, x, yb, z, { tile: [2, 2.6], collide: true });
  // door end bars
  const ex = alongX ? x + 6.11 : x,
    ez = alongX ? z : z + 6.11;
  for (const o of [-0.5, 0.5]) {
    if (alongX) c.W.box(C(PAL.inkSoft), 0.05, 2.3, 0.06, ex, yb + 0.15, ez + o);
    else c.W.box(C(PAL.inkSoft), 0.06, 2.3, 0.05, ex + o, yb + 0.15, ez);
  }
  c.W.box(C(PAL.white), alongX ? 2 : 0.04, 0.35, alongX ? 0.04 : 2, x + (alongX ? -3 : (d > w ? 1.23 : 0)), yb + 1.8, z + (alongX ? 1.23 : -3));
}

function docks(c: Ctx) {
  const k = c.k,
    W = c.W;
  const D = 'Gravy Docks';
  const r = rng(303);

  // water + quay
  const water = M.water();
  W.geo(G.plane(400, 600), water, -300, -1.2, 0, { rx: -Math.PI / 2, cast: false, receive: false });
  W.box(C(PAL.concreteDark), 0.8, 3, 260, -100.4, -3, 0, { tile: [3, 3] });
  W.box(M.hazard(), 0.6, 0.04, 220, -100.3, 0, 0, { cast: false });
  W.solid(1.2, 8, 260, -101, -1, 0);
  for (let z = -104; z <= 104; z += 13) P.mooringBollard(k.frame(-99.2, 0, z));
  // quay railing (grindable)
  for (const [a, b] of [
    [-104, -50],
    [-40, 40],
    [50, 104],
  ])
    flatRail(W, -99.6, a, -99.6, b, 1.0, 0, PAL.yellow);
  // floating tires on the quay wall
  for (let z = -98; z <= 98; z += 13) W.geo(G.torus(0.45, 0.16, 6, 12), C(PAL.ink), -100.9, -0.9, z + 6, { ry: Math.PI / 2 });

  // tug boat (bobbing)
  const bk = new Kit('tug');
  const bf = bk.world;
  bf.box(C(PAL.red), 4, 1.6, 10, 0, -1, 0);
  bf.box(C(PAL.white), 4.1, 0.3, 10.1, 0, 0.5, 0);
  bf.geo(G.wedge(4, 1.6, 3), C(PAL.red), 0, -1, 5, {});
  bf.box(C(PAL.white), 3, 2.2, 3.5, 0, 0.8, -1);
  bf.box(M.glass(), 3.05, 0.8, 3.0, 0, 2.0, -1);
  bf.box(C(PAL.yellow), 3.2, 0.2, 3.7, 0, 3.0, -1);
  bf.cyl(C(PAL.ink), 0.45, 0.5, 1.6, 0, 3.0, -2.2, { seg: 10 });
  bf.cyl(C(PAL.red), 0.47, 0.47, 0.35, 0, 4.0, -2.2, { seg: 10 });
  for (const z of [-3.5, 0, 3.5]) bf.geo(G.torus(0.4, 0.15, 6, 10), C(PAL.ink), 2.1, 0, z, { ry: Math.PI / 2 });
  bf.box(M.neonSign('S.S. LEFTOVER', PAL.yellow, FONTS.bungee, 512, 96, 1.4), 0.04, 0.5, 3.4, 2.03, -0.2, 0, { cast: false });
  bk.finish();
  const tug = bk.root;
  tug.position.set(-110, -0.6, 30);
  tug.rotation.y = 0.15;
  tug.traverse((o) => (o.matrixAutoUpdate = true));
  c.extra.push(tug);
  c.up.push((_dt, t) => {
    tug.position.y = -0.6 + Math.sin(t * 0.9) * 0.18;
    tug.rotation.z = Math.sin(t * 0.7) * 0.03;
    tug.rotation.x = Math.sin(t * 0.55) * 0.02;
  });

  // ---- Warehouse 3 (north)
  const w1: BuildingSpec = { x0: -95, x1: -60, z0: 60, z1: 100, h: 12, color: PAL.teal, style: 'warehouse', trim: PAL.yellow, seed: 31 };
  B(c, w1);
  spot(c, 'big-docks-wh3-east', new THREE.Vector3(-60, 3.2, 70), new THREE.Vector3(1, 0, 0), [12, 5], true, D);
  spot(c, 'docks-wh3-south', new THREE.Vector3(-70, 2.5, 60), new THREE.Vector3(0, 0, -1), [7, 3], false, D);
  c.reserved.add(bkey(w1, 'e'));
  c.reserved.add(bkey(w1, 's'));
  const e1 = sideFrame(k, w1, 'e').f; // local x runs -z..+z? (+x local = -z world for east face)
  for (const lx of [-8, -14]) {
    e1.box(M.stripes(PAL.white, 0xc9c4da, 12, false), 4.6, 4.8, 0.08, lx, 0, 0.05);
    e1.box(C(PAL.yellow), 5, 0.3, 0.3, lx, 4.8, 0.15);
  }
  e1.box(C(PAL.concrete), 16, 1.2, 2.2, -11, 0, 1.1, { collide: true });
  e1.box(C(PAL.ink), 16, 0.12, 0.2, -11, 1.1, 2.15);
  e1.box(M.neonSign('GRAVY CO.', PAL.yellow, FONTS.shade, 1024, 200, 2.0), 14, 2.7, 0.05, -2, 8.4, 0.06, { noOutline: true, cast: false });
  // roof skylights
  for (let z = 64; z < 98; z += 8) W.box(M.glass(), 18, 0.4, 3, -77.5, 12.3, z);

  // ---- Warehouse 2 (south) + container staircase up to its roof
  const w2: BuildingSpec = { x0: -100, x1: -86, z0: -100, z1: -60, h: 4.9, color: PAL.orange, style: 'warehouse', trim: PAL.ink, seed: 32 };
  B(c, w2);
  spot(c, 'docks-wh2-north', new THREE.Vector3(-93, 2.4, -60), new THREE.Vector3(0, 0, 1), [6.5, 2.6], false, D);
  c.reserved.add(bkey(w2, 'n'));
  kicker(k.frame(-55.5, 0, -80, -Math.PI / 2), 4.8, 2.6, 5.5, PAL.yellow);
  for (const dz of [-1.22, 1.22]) {
    container(c, -67.1, 0, -80 + dz, true, dz < 0 ? PAL.cyan : PAL.magenta);
    container(c, -79.3, 0, -80 + dz, true, dz < 0 ? PAL.orange : PAL.violet);
    container(c, -79.3, 2.6, -80 + dz, true, dz < 0 ? PAL.green : PAL.red);
  }
  kicker(k.frame(-64, 2.6, -80, -Math.PI / 2), 4.8, 2.6, 6, PAL.cyan);
  W.rail([
    [-99.6, 5.3, -60.3],
    [-86.4, 5.3, -60.3],
  ]);
  slopeRail(W, [-88.5, 6.2, -61], [-88.5, 1.0, -41.5], 0, 0, PAL.yellow);
  for (let z = -96; z < -64; z += 9) P.acUnit(k.frame(-97, 5.2, z));

  // ---- container yard
  const cols = [-62.5, -65, -73, -75.5];
  const rows = [-32, 6, 20, 32];
  const shed = { x0: -75, x1: -62, z0: -22, z1: -8 };
  const ccols = [PAL.orange, PAL.teal, PAL.red, PAL.cyan, PAL.violet, PAL.yellow, PAL.green, PAL.magenta, PAL.rust];
  for (const x of cols)
    for (const z of rows) {
      if (r() < 0.18) continue;
      const hgt = 1 + Math.floor(r() * (x > -66 ? 2 : 3));
      for (let lv = 0; lv < hgt; lv++) container(c, x, lv * 2.6, z, false, pick(r, ccols));
    }
  kicker(k.frame(-55.2, 0, 20, -Math.PI / 2), 4.2, 2.6, 5.4, PAL.magenta);
  B(c, { ...shed, h: 5, color: PAL.brick, style: 'brick', parapet: true, roofJunk: true, trim: PAL.white, seed: 33 });
  spot(c, 'docks-shed-east', new THREE.Vector3(-62, 2.2, -15), new THREE.Vector3(1, 0, 0), [6, 2.8], false, D);
  c.reserved.add(`${shed.x0},${shed.z0}|e`);

  // ---- ship-to-shore crane
  crane(c, -92, 6);

  // ---- dock dressing
  for (let z = -95; z <= 95; z += 19) if (Math.abs(z - 6) > 14) P.palmTree(k.frame(-97.5, 0, z), 600 + z, range(r, 6, 8.5));
  for (let i = 0; i < 14; i++) {
    const x = range(r, -96, -82),
      z = range(r, -55, 55);
    if (Math.abs(z - 6) < 14) continue;
    if (r() < 0.5) P.barrel(k.frame(x, 0, z), pick(r, [PAL.red, PAL.cyan, PAL.yellow, PAL.green]));
    else P.crate(k.frame(x, 0, z, r() * 3));
  }
  for (const [x, z] of [
    [-56, -30],
    [-56, 45 + 9],
    [-58, 58],
  ])
    P.dumpster(k.frame(x, 0, z, Math.PI / 2), PAL.orange);
  P.fence(k.frame(-82, 0, -57, 0), 8);
  // district sign
  const sign = k.frame(-56, 0, -2, Math.PI / 2);
  for (const x of [-5, 5]) sign.box(C(PAL.metalDark), 0.3, 6.5, 0.3, x, 0, 0);
  sign.box(C(PAL.ink), 12.4, 2.6, 0.4, 0, 5.4, 0);
  sign.box(M.neonSign('GRAVY DOCKS', PAL.cyan, FONTS.shade, 1024, 220, 2.4), 12, 2.3, 0.04, 0, 5.55, 0.22, { noOutline: true, cast: false });
}

function crane(c: Ctx, cx: number, cz: number) {
  const k = c.k;
  const f = k.frame(cx, 0, cz, 0);
  const orange = C(PAL.orange);
  const white = C(PAL.white);
  const red = C(PAL.red);
  // portal legs
  for (const x of [-5, 5])
    for (const z of [-8, 8]) {
      f.box(orange, 1.3, 24, 1.3, x, 0, z, { collide: true });
      f.box(C(PAL.ink), 1.8, 1.2, 3, x, 0, z);
    }
  // sill + portal beams
  for (const x of [-5, 5]) {
    f.box(orange, 1.2, 1.6, 17.3, x, 22.4, 0);
    f.box(orange, 0.8, 0.8, 16, x, 8, 0);
    f.tube(orange, x, 9, -7.5, x, 21.5, 7.5, 0.3);
    f.tube(orange, x, 9, 7.5, x, 21.5, -7.5, 0.3);
  }
  for (const z of [-8, 8]) f.box(orange, 11.3, 1.6, 1.2, 0, 22.4, z);
  // boom: two girders with lattice
  for (const z of [-2.5, 2.5]) {
    f.box(white, 76, 1.4, 1.0, -8, 24.0, z);
    for (let x = -45; x < 29; x += 4) f.tube(red, x, 24.1, z, x + 4, 25.3, z, 0.12, { seg: 5 });
  }
  for (let x = -45; x < 30; x += 8) f.box(white, 0.5, 0.5, 5.5, x, 24.2, 0);
  // apex A-frame + stays
  f.tube(orange, -5, 25.4, -2.5, 0, 36, 0, 0.45);
  f.tube(orange, -5, 25.4, 2.5, 0, 36, 0, 0.45);
  f.tube(orange, 5, 25.4, -2.5, 0, 36, 0, 0.45);
  f.tube(orange, 5, 25.4, 2.5, 0, 36, 0, 0.45);
  f.tube(C(PAL.ink), 0, 36, 0, -44, 25.6, 0, 0.1, { seg: 5 });
  f.tube(C(PAL.ink), 0, 36, 0, 28, 25.6, 0, 0.1, { seg: 5 });
  f.sphere(M.neon(PAL.red, 4), 0.45, 0, 36.6, 0, { noOutline: true, cast: false, seg: 8 });
  f.sphere(M.neon(PAL.red, 4), 0.35, -45, 25.8, 0, { noOutline: true, cast: false, seg: 8 });
  f.sphere(M.neon(PAL.red, 4), 0.35, 29, 25.8, 0, { noOutline: true, cast: false, seg: 8 });
  // machinery house
  f.box(white, 9, 4, 7, 4, 25.4, 0);
  f.box(C(PAL.teal), 9.2, 0.4, 7.2, 4, 29.4, 0);
  f.box(M.neonSign('GOBBLE PORT', PAL.orange, FONTS.bungee, 512, 96, 1.8), 8, 1.4, 0.04, 4, 27, 3.52, { cast: false, noOutline: true });
  // operator cab
  f.box(C(PAL.yellow), 3, 2.6, 3, -16, 21, 0);
  f.box(M.glass(), 3.1, 1.2, 3.1, -16, 22.1, 0);
  f.box(M.hazard(), 1.0, 0.25, 17, 5.6, 1.8, 0, { cast: false });
  f.box(M.hazard(), 1.0, 0.25, 17, -5.6, 1.8, 0, { cast: false });

  // trolley + hook (sways)
  const hk = new Kit('crane-hook');
  const hf = hk.world;
  hf.box(C(PAL.yellow), 3.4, 1.0, 5.6, 0, 0, 0);
  for (const z of [-0.6, 0.6]) hf.tube(C(PAL.ink), 0, 0, z, 0, -10, z, 0.05, { seg: 4 });
  hf.box(C(PAL.yellow), 3, 0.8, 6, 0, -11, 0);
  hf.box(C(PAL.orange), 2.44, 2.6, 12.2, 0, -13.8, 0, {});
  hf.box(M.neonSign('GOBBLE LINE', PAL.white, FONTS.rubik, 512, 96, 1.3), 0.04, 0.9, 6, 1.23, -12.6, 0, { cast: false });
  hk.finish();
  const hook = hk.root;
  const pivot = new THREE.Group();
  pivot.position.set(cx - 30, 23.2, cz);
  pivot.add(hook);
  hook.traverse((o) => (o.matrixAutoUpdate = true));
  c.extra.push(pivot);
  c.up.push((_dt, t) => {
    pivot.rotation.z = Math.sin(t * 0.5) * 0.03;
    pivot.rotation.x = Math.sin(t * 0.37) * 0.02;
  });
}

// ====================================================================== CRANBERRY HEIGHTS
function heights(c: Ctx) {
  const k = c.k,
    W = c.W;
  const D = 'Cranberry Heights';

  // --- rooftop route H1 -> H2 -> H3 (roof surface = h + 0.3)
  const h1: BuildingSpec = { x0: 58, x1: 72, z0: -40, z1: -20, h: 5.7, color: PAL.teal, style: 'grid', trim: PAL.yellow, fireEscape: 's', seed: 41 };
  const h2: BuildingSpec = { x0: 74, x1: 88, z0: -40, z1: -20, h: 5.7, color: PAL.brick, style: 'brick', trim: PAL.white, seed: 42 };
  const h3: BuildingSpec = { x0: 88, x1: 104, z0: -40, z1: -20, h: 8.7, color: PAL.violet, style: 'ribbon', trim: PAL.cyan, cornice: false, seed: 43 };
  B(c, h1);
  B(c, h2);
  B(c, h3);
  bank(k.frame(64, 0, -6, Math.PI), 8, 6.0, 14, PAL.magenta);
  flatRail(W, 70.6, -30, 75.4, -30, 6.6, 6.0, PAL.yellow);
  bank(k.frame(80, 6.0, -32, Math.PI / 2), 8, 3.0, 8, PAL.cyan);
  P.acUnit(k.frame(60.5, 6.0, -37));
  P.acUnit(k.frame(69.5, 6.0, -37.5));
  P.antenna(k.frame(70.5, 6.0, -23), 5);
  P.waterTower(k.frame(77.5, 6.0, -37), PAL.rust);
  P.acUnit(k.frame(77, 6.0, -23.5));
  P.antenna(k.frame(102, 9.0, -38), 7);
  P.acUnit(k.frame(92, 9.0, -38));
  P.satelliteDish(k.frame(102.5, 9.0, -22));
  W.rail([
    [58.25, 6.05, -39.6],
    [58.25, 6.05, -20.4],
  ]);
  W.rail([
    [74.3, 6.05, -20.25],
    [87.7, 6.05, -20.25],
  ]);
  W.rail([
    [88.3, 9.05, -39.75],
    [101, 9.05, -39.75],
  ]);
  // rooftop billboard (big spot) facing west
  billboard(k.frame(101.5, 9.0, -30, -Math.PI / 2), 10, 4.5, 0.6, M.poster('SATURATION KILLS', 768, 384));
  spot(c, 'big-heights-rooftop-billboard', new THREE.Vector3(101.57, 11.85, -30), new THREE.Vector3(-1, 0, 0), [9, 4.0], true, D);
  spot(c, 'heights-h3-west', new THREE.Vector3(88, 7.5, -24), new THREE.Vector3(-1, 0, 0), [5.5, 2.4], false, D);
  c.reserved.add(bkey(h3, 'w'));
  // long down-rail from H3 roof to the courtyard
  slopeRail(W, [95, 9.7, -20.6], [95, 1.1, 0], 0, 0, PAL.magenta);

  // --- courtyard
  ledge(k.frame(80, 0, -9, 0), 10, 0.6, 1.2, PAL.yellow);
  kicker(k.frame(88, 0, -2, Math.PI), 3, 1.0, 2.4, PAL.green);
  P.dumpster(k.frame(73.5, 0, -17.5, Math.PI), PAL.magenta);
  P.dumpster(k.frame(106, 0, -17.5, Math.PI), PAL.cyan);
  P.roundTree(k.frame(102, 0, -6), 71);
  P.bench(k.frame(100, 0, -12, -Math.PI / 2));
  // district sign
  const sign = k.frame(54.6, 0, -14, -Math.PI / 2);
  for (const x of [-5.5, 5.5]) sign.box(C(PAL.metalDark), 0.3, 6.5, 0.3, x, 0, 0);
  sign.box(C(PAL.ink), 13.2, 2.6, 0.4, 0, 5.4, 0);
  sign.box(M.neonSign('CRANBERRY HEIGHTS', PAL.red, FONTS.shade, 1024, 200, 2.4), 12.8, 2.3, 0.04, 0, 5.55, 0.22, { noOutline: true, cast: false });

  // --- middle block buildings
  const hb1: BuildingSpec = { x0: 55, x1: 75, z0: 8, z1: 30, h: 16, color: PAL.peach, style: 'grid', parapet: true, roofJunk: true, shop: { side: 'n', name: 'CRANBERRY CLUB', color: PAL.magenta, awning: [PAL.magenta, PAL.ink] }, seed: 44 };
  B(c, hb1);
  spot(c, 'heights-club-west', new THREE.Vector3(55, 2.5, 19), new THREE.Vector3(-1, 0, 0), [7, 3], false, D);
  c.reserved.add(bkey(hb1, 'w'));
  B(c, { x0: 80, x1: 108, z0: 5, z1: 38, h: 24, color: PAL.violet, style: 'brick', parapet: true, roofJunk: true, fireEscape: 'w', seed: 45 });

  // --- north block
  B(c, { x0: 55, x1: 78, z0: 55, z1: 80, h: 20, color: PAL.lilac, style: 'grid', parapet: true, roofJunk: true, fireEscape: 'n', shop: { side: 'w', name: 'NAP DEPOT', color: PAL.violet, awning: [PAL.violet, PAL.white] }, seed: 46 });
  B(c, { x0: 80, x1: 108, z0: 55, z1: 75, h: 14, color: PAL.red, style: 'brick', parapet: true, roofJunk: true, shop: { side: 's', name: 'LEFTOVERS', color: PAL.orange, awning: [PAL.orange, PAL.yellow] }, seed: 47 });
  B(c, { x0: 55, x1: 85, z0: 84, z1: 108, h: 30, color: PAL.teal, style: 'ribbon', parapet: true, roofJunk: true, seed: 48 });
  B(c, { x0: 88, x1: 108, z0: 80, z1: 108, h: 22, color: PAL.cyan, style: 'glass', parapet: true, roofJunk: true, seed: 49 });

  // --- south block
  const hs1: BuildingSpec = { x0: 55, x1: 80, z0: -108, z1: -60, h: 14, color: PAL.mint, style: 'grid', parapet: true, roofJunk: true, shop: { side: 'n', name: 'GOBBLE MART', color: PAL.yellow, awning: [PAL.yellow, PAL.red] }, seed: 50 };
  B(c, hs1);
  spot(c, 'heights-mart-west', new THREE.Vector3(55, 2.5, -80), new THREE.Vector3(-1, 0, 0), [7, 3], false, D);
  c.reserved.add(bkey(hs1, 'w'));
  B(c, { x0: 84, x1: 108, z0: -104, z1: -58, h: 26, color: PAL.magenta, style: 'glass', parapet: true, roofJunk: true, seed: 51 });
  P.vendingMachine(k.frame(57.5, 0, -57.6, 0), 3, PAL.yellow);
  P.phoneBooth(k.frame(60, 0, -57.6, 0));
}

// ====================================================================== backdrop skyline
function backdrop(c: Ctx) {
  const r = rng(909);
  const styles = ['grid', 'ribbon', 'glass', 'brick'] as const;
  const cols = [PAL.violet, PAL.teal, PAL.lilac, PAL.magenta, PAL.tealDark, PAL.peach, PAL.brick];
  const ring = (fn: (t: number) => [number, number], from: number, to: number, depth: [number, number], hRange: [number, number]) => {
    let t = from;
    while (t < to) {
      const w = range(r, 14, 26);
      const [x, z] = fn(t + w / 2);
      const d = range(r, depth[0], depth[1]);
      const h = range(r, hRange[0], hRange[1]);
      const sx = Math.abs(x) > Math.abs(z) ? d : w,
        sz = Math.abs(x) > Math.abs(z) ? w : d;
      c.W.box(M.facade(pick(r, styles), pick(r, cols)), sx, h, sz, x, 0, z, { tile: [32, 28], cast: false });
      c.W.box(C(PAL.concreteDark), sx + 0.4, 0.5, sz + 0.4, x, h, z, { cast: false });
      if (r() < 0.35) c.W.box(M.neon(pick(r, [PAL.magenta, PAL.cyan, PAL.yellow, PAL.red]), 2.6), 0.4, 3, 0.4, x, h + 0.5, z, { noOutline: true, cast: false });
      if (r() < 0.2) c.W.box(M.poster(pick(r, SLOGANS), 768, 384), Math.min(sx, sz) * 0.7, 6, 0.1, x, h + 1, z + (Math.abs(x) > Math.abs(z) ? 0 : -Math.sign(z) * sz * 0.3), { cast: false });
      t += w + range(r, 1, 4);
    }
  };
  ring((t) => [t, 128], -100, 150, [18, 26], [24, 70]);
  ring((t) => [t, -128], -100, 150, [18, 26], [24, 70]);
  ring((t) => [128, t], -115, 115, [18, 26], [24, 80]);
  // far skyline silhouettes
  for (let i = 0; i < 40; i++) {
    const a = range(r, -Math.PI * 0.95, Math.PI * 0.55);
    const d = range(r, 220, 300);
    const x = Math.cos(a) * d + 30,
      z = Math.sin(a) * d;
    if (x < -120) continue;
    const h = range(r, 40, 130);
    c.W.box(M.facade('glass', pick(r, [PAL.violet, PAL.inkSoft, PAL.tealDark])), 22, h, 22, x, 0, z, { tile: [32, 28], cast: false, receive: false });
    if (r() < 0.5) c.W.box(M.neon(pick(r, [PAL.magenta, PAL.cyan, PAL.red]), 3), 0.8, 10, 0.8, x, h, z, { noOutline: true, cast: false });
  }
}

// ====================================================================== ambient decals / posters
function dressing(c: Ctx) {
  const r = rng(1234);
  const tagMats = Array.from({ length: 10 }, (_, i) => M.decal(makeWallTagTexture(i + 1), `walltag-${i + 1}`));
  const farFromSpots = (p: THREE.Vector3, d: number) => c.spots.every((s) => s.position.distanceTo(p) > d + Math.max(s.size[0], s.size[1]) / 2);
  for (const b of c.buildings) {
    if (b.spec.bland || b.spec.h < 4) continue;
    for (const side of ['n', 's', 'e', 'w'] as Side[]) {
      if (c.reserved.has(bkey(b.spec, side))) continue;
      const face = b.faces[side];
      if (face.width < 6) continue;
      const count = r() < 0.6 ? 1 + Math.floor(r() * 3) : 0;
      for (let i = 0; i < count; i++) {
        const along = range(r, -face.width / 2 + 1.6, face.width / 2 - 1.6);
        const size = range(r, 1.1, 2.4);
        const ry = Math.atan2(face.normal.x, face.normal.z);
        const y0 = b.spec.y0 ?? 0;
        const f = new Frame(c.k, T(face.center.x, y0 + range(r, 0.9, 3.2), face.center.z, ry));
        const wp = f.point(along, 0, 0);
        if (!farFromSpots(wp, 2.5)) continue;
        if (r() < 0.22) {
          f.box(M.poster(pick(r, SLOGANS)), 3.0, 1.9, 0.04, along, -0.4, 0.03, { cast: false });
        } else {
          f.geo(G.plane(size, size), pick(r, tagMats), along, 0, 0.035 + i * 0.004, { rz: range(r, -0.15, 0.15), noOutline: true, cast: false });
        }
      }
    }
  }
  // extra tags on the pit wall & terrace & containers sides
  const extra: [number, number, number, number][] = [
    [-9.5, 1.6, -95.97, 0],
    [9.8, 2.2, -95.97, 0],
    [-22, 1.0, -26.97, 0],
    [24.5, 1.1, -26.97, 0],
  ];
  extra.forEach(([x, y, z, ry], i) => c.W.geo(G.plane(2, 2), tagMats[(i * 3) % tagMats.length], x, y, z, { ry, noOutline: true, cast: false }));
}

// ====================================================================== pigeons
function pigeons(c: Ctx) {
  const parts = P.pigeonGeometry().map((g) => prep(g));
  // merge parts manually
  const merged = new THREE.BufferGeometry();
  const pos: number[] = [],
    nor: number[] = [],
    uv: number[] = [];
  for (const g of parts) {
    pos.push(...(g.attributes.position.array as Float32Array));
    nor.push(...(g.attributes.normal.array as Float32Array));
    uv.push(...(g.attributes.uv.array as Float32Array));
  }
  merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const N = 28;
  const mesh = new THREE.InstancedMesh(merged, C(0x9a93c9), N);
  mesh.castShadow = true;
  const r = rng(808);
  const birds = Array.from({ length: N }, () => {
    const a = r() * Math.PI * 2;
    const d = range(r, 6.8, 15);
    let x = Math.cos(a) * d,
      z = Math.sin(a) * d;
    if (r() < 0.25) {
      x = pick(r, [-22, 22]) + range(r, -5.5, 5.5);
      z = 16 + range(r, -5.5, 5.5);
      if (Math.hypot(x - Math.sign(x) * 22, z - 16) < 4.6) x += Math.sign(x) * 5;
    }
    return { x, z, ry: r() * Math.PI * 2, ph: r() * 10, sp: range(r, 1.5, 3.5) };
  });
  const m = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    e = new THREE.Euler(),
    p = new THREE.Vector3(),
    s = new THREE.Vector3(1, 1, 1);
  c.extra.push(mesh);
  c.up.push((_dt, t) => {
    for (let i = 0; i < N; i++) {
      const b = birds[i];
      const peck = Math.pow(Math.max(0, Math.sin(t * b.sp + b.ph)), 6) * 0.6;
      const hop = Math.max(0, Math.sin(t * 0.7 + b.ph * 3)) > 0.995 ? 0.08 : 0;
      e.set(peck, b.ry + Math.sin(t * 0.3 + b.ph) * 0.4, 0, 'YXZ');
      q.setFromEuler(e);
      p.set(b.x, hop, b.z);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
}

// ====================================================================== entry
export function buildLevel(): Level {
  const k = new Kit('neo-gobble-city');
  const c: Ctx = { k, W: k.world, up: [], buildings: [], reserved: new Set(), spots: [], flicker: [], extra: [] };

  ground(c);
  plaza(c);
  north(c);
  south(c);
  docks(c);
  heights(c);
  streets(c);
  backdrop(c);
  dressing(c);
  pigeons(c);

  const root = k.finish();
  for (const o of c.extra) root.add(o);

  const blimp = new TurkeyBlimp();
  root.add(blimp.group);
  c.up.push((dt, t) => blimp.update(dt, t));

  // water scroll (shared texture for quay + fountains)
  const waterMap = (M.water() as THREE.MeshToonMaterial).map!;
  c.up.push((dt) => {
    waterMap.offset.x += dt * 0.012;
    waterMap.offset.y += dt * 0.006;
  });

  // neon sign flicker
  const flick = c.flicker.map((m, i) => ({ m: m as THREE.MeshBasicMaterial, ph: i * 3.7, base: (m as THREE.MeshBasicMaterial).color.r }));
  c.up.push((_dt, t) => {
    for (const f of flick) {
      const n = Math.sin(t * 13 + f.ph) * Math.sin(t * 7.3 + f.ph * 2);
      const off = n > 0.82 || (Math.sin(t * 0.5 + f.ph) > 0.97 && Math.sin(t * 40) > 0);
      f.m.color.setScalar(off ? f.base * 0.15 : f.base);
    }
  });

  const collision = k.collisionMeshes();
  const spawns = [
    new THREE.Vector3(0, 0, 12),
    new THREE.Vector3(3.5, 0, 12.5),
    new THREE.Vector3(-3.5, 0, 12.5),
    new THREE.Vector3(6.5, 0, 14),
    new THREE.Vector3(-6.5, 0, 14),
    new THREE.Vector3(0, 0, 16),
    new THREE.Vector3(3.5, 0, 16.5),
    new THREE.Vector3(-3.5, 0, 16.5),
  ];

  return {
    root,
    collision,
    rails: k.rails,
    spots: c.spots,
    spawns,
    bounds: new THREE.Box3(new THREE.Vector3(-100, -2, -HALF), new THREE.Vector3(HALF, 90, HALF)),
    update(dt: number, time: number) {
      for (const u of c.up) u(dt, time);
    },
  };
}
