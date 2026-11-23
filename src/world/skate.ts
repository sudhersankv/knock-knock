import { PAL } from '../render/palette';
import { G, qpCopingZ, type Frame } from './kit';
import { M } from './mats';

/*
  Skate geometry. Convention (matches G.wedge / G.qp):
  local origin = ground at the ENTRY edge, rider approaches from -Z and the piece rises toward +Z.
  Width runs along X, centered.
*/

const C = M.c;
const COPING = () => C(PAL.metal, { rim: 1 });

export function quarterPipe(f: Frame, w: number, h: number, r: number, deck: number, color: number) {
  f.geo(G.qp(w, h, r, deck), C(color), 0, 0, 0, { collide: true });
  const cz = qpCopingZ(h, r);
  // coping pipe + deck trim + side stripe
  f.tube(COPING(), -w / 2, h + 0.06, cz, w / 2, h + 0.06, cz, 0.08, { seg: 8 });
  f.box(C(PAL.ink), w + 0.06, 0.06, deck, 0, h - 0.03, cz + deck / 2);
  for (const sx of [-1, 1]) f.box(C(PAL.white), 0.04, 0.18, cz + deck - 0.2, (sx * (w + 0.04)) / 2, h * 0.45, (cz + deck) / 2);
  // chevrons painted on the transition
  f.rail([
    [-w / 2 + 0.3, h + 0.08, cz],
    [w / 2 - 0.3, h + 0.08, cz],
  ]);
}

export function kicker(f: Frame, w: number, h: number, len: number, color: number, lip = true) {
  f.geo(G.wedge(w, h, len), C(color), 0, 0, 0, { collide: true });
  if (lip) {
    f.box(COPING(), w, 0.04, 0.4, 0, h - 0.02, len - 0.2);
    f.box(M.hazard(), w + 0.02, 0.1, 0.06, 0, h - 0.1, len + 0.02);
  }
  // side triangles accent
  f.box(C(PAL.ink), w + 0.04, 0.06, 0.06, 0, 0, 0);
}

/** Bank / long ramp, with an optional flat landing deck after it. */
export function bank(f: Frame, w: number, h: number, len: number, color: number, deck = 0) {
  f.geo(G.wedge(w, h, len), C(color), 0, 0, 0, { collide: true });
  for (const sx of [-1, 1]) f.tube(COPING(), (sx * w) / 2, 0.02, 0.05, (sx * w) / 2, h + 0.02, len, 0.05, { seg: 6 });
  if (deck > 0) f.box(C(color), w, h, deck, 0, 0, len, { collide: true, tile: [2, 2] });
}

export function stairs(f: Frame, w: number, h: number, len: number, steps: number, color: number, railXs: number[]) {
  const sh = h / steps,
    sd = len / steps;
  const stepMat = C(color);
  const nose = C(PAL.white);
  for (let i = 0; i < steps; i++) {
    f.box(stepMat, w, (i + 1) * sh, sd, 0, 0, i * sd + sd / 2);
    f.box(nose, w + 0.02, 0.04, 0.08, 0, (i + 1) * sh - 0.04, i * sd + 0.04);
  }
  // smooth collision slope
  f.geo(G.wedge(w, h, len), stepMat, 0, 0, 0, { collide: false, cast: false });
  f.solidGeo(G.wedge(w, h, len), 0, 0, 0);
  for (const x of railXs) handrail(f, x, sh, h, sd, len);
}

function handrail(f: Frame, x: number, sh: number, h: number, sd: number, len: number) {
  const metal = C(PAL.yellow, { rim: 1 });
  const H = 0.95;
  const z0 = sd * 0.5,
    z1 = len - sd * 0.5;
  const y0 = sh + H,
    y1 = h + H;
  f.tube(metal, x, y0, z0, x, y1, z1, 0.05, { seg: 8 });
  const posts = Math.max(2, Math.round(len / 2.5));
  for (let i = 0; i <= posts; i++) {
    const t = i / posts;
    const z = z0 + (z1 - z0) * t;
    const yTop = y0 + (y1 - y0) * t;
    const stepTop = Math.min(h, Math.ceil(z / sd) * sh);
    f.tube(metal, x, stepTop, z, x, yTop, z, 0.035, { seg: 6 });
  }
  f.rail([
    [x, y0 + 0.05, z0],
    [x, y1 + 0.05, z1],
  ]);
}

export function halfPipe(f: Frame, w: number, h: number, r: number, flat: number, deck: number, color: number) {
  quarterPipe(f.sub(0, 0, flat / 2, 0), w, h, r, deck, color);
  quarterPipe(f.sub(0, 0, -flat / 2, Math.PI), w, h, r, deck, color);
  // flat bottom paint + center line
  f.box(C(PAL.inkSoft), w, 0.03, flat, 0, 0, 0, { cast: false });
  f.box(C(color), w * 0.9, 0.035, 0.25, 0, 0, 0, { cast: false });
}

/** Box with kickers both ends and a rail down the middle. */
export function funbox(f: Frame, w: number, h: number, len: number, kickLen: number, color: number) {
  f.box(C(color), w, h, len, 0, 0, 0, { collide: true });
  f.box(C(PAL.white), w + 0.06, 0.08, len + 0.06, 0, h - 0.06, 0);
  kicker(f.sub(0, 0, -len / 2 - kickLen, 0), w, h, kickLen, color, false);
  kicker(f.sub(0, 0, len / 2 + kickLen, Math.PI), w, h, kickLen, color, false);
  flatRail(f, 0, -len / 2 - kickLen * 0.3, 0, len / 2 + kickLen * 0.3, h + 0.55, h);
  // edge ledges grindable
  f.rail([
    [-w / 2 + 0.05, h + 0.04, -len / 2 + 0.1],
    [-w / 2 + 0.05, h + 0.04, len / 2 - 0.1],
  ]);
  f.rail([
    [w / 2 - 0.05, h + 0.04, -len / 2 + 0.1],
    [w / 2 - 0.05, h + 0.04, len / 2 - 0.1],
  ]);
}

/** Straight rail on posts from (ax,az) to (bx,bz) at height y above base yb. */
export function flatRail(f: Frame, ax: number, az: number, bx: number, bz: number, y: number, yb = 0, color: number = PAL.cyan) {
  const metal = C(color, { rim: 1 });
  f.tube(metal, ax, y, az, bx, y, bz, 0.05, { seg: 8 });
  const len = Math.hypot(bx - ax, bz - az);
  const posts = Math.max(2, Math.round(len / 3));
  for (let i = 0; i <= posts; i++) {
    const t = i / posts;
    const x = ax + (bx - ax) * t,
      z = az + (bz - az) * t;
    f.tube(metal, x, yb, z, x, y, z, 0.035, { seg: 6 });
  }
  f.rail([
    [ax, y + 0.05, az],
    [bx, y + 0.05, bz],
  ]);
}

/** Sloped rail between two arbitrary local points (y given at each end), on posts down to ground level yb(t). */
export function slopeRail(f: Frame, a: [number, number, number], b: [number, number, number], groundA: number, groundB: number, color: number = PAL.magenta) {
  const metal = C(color, { rim: 1 });
  f.tube(metal, a[0], a[1], a[2], b[0], b[1], b[2], 0.06, { seg: 8 });
  const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const posts = Math.max(2, Math.round(len / 4));
  for (let i = 0; i <= posts; i++) {
    const t = i / posts;
    const x = a[0] + (b[0] - a[0]) * t,
      y = a[1] + (b[1] - a[1]) * t,
      z = a[2] + (b[2] - a[2]) * t;
    const g = groundA + (groundB - groundA) * t;
    if (y - g > 0.3) f.tube(metal, x, g, z, x, y, z, 0.045, { seg: 6 });
  }
  f.rail([
    [a[0], a[1] + 0.06, a[2]],
    [b[0], b[1] + 0.06, b[2]],
  ]);
}

/** Concrete ledge with metal edge, both long top edges grindable. */
export function ledge(f: Frame, len: number, h: number, d: number, color: number) {
  f.box(C(color), len, h, d, 0, 0, 0, { collide: true });
  f.box(COPING(), len + 0.02, 0.05, 0.1, 0, h - 0.04, d / 2 - 0.05);
  f.box(COPING(), len + 0.02, 0.05, 0.1, 0, h - 0.04, -d / 2 + 0.05);
  f.rail([
    [-len / 2 + 0.1, h + 0.02, d / 2 - 0.05],
    [len / 2 - 0.1, h + 0.02, d / 2 - 0.05],
  ]);
  f.rail([
    [-len / 2 + 0.1, h + 0.02, -d / 2 + 0.05],
    [len / 2 - 0.1, h + 0.02, -d / 2 + 0.05],
  ]);
}

/** Circle rail (fountain rim, statue pedestal). */
export function ringRail(f: Frame, r: number, y: number, segs = 24) {
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    pts.push([Math.cos(a) * r, y, Math.sin(a) * r]);
  }
  f.rail(pts);
}
