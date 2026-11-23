import * as THREE from 'three';
import { canvasTexture, rng, pick, range, type Rng } from '../render/textures';
import { PAL, hex } from '../render/palette';

/*
  Graffiti generator. Everything is deterministic from (name, seed) so every client
  paints the exact same piece.

  Piece layer stack (back -> front):
    backdrop cloud/burst -> outer ink -> light cutback outline -> 3D block ->
    ink outline -> fill (gradient + pattern + shines, clipped to letters) ->
    drips -> overspray -> sparkles / arrow / crown / character -> crew signature
*/

const INK = hex(PAL.ink);
const FONT_STACK: Record<string, string> = {
  Bungee: '"Bungee", Impact, sans-serif',
  Rubik: '"Rubik Mono One", Impact, sans-serif',
  Marker: '"Permanent Marker", Impact, cursive',
};
const POPS = [PAL.magenta, PAL.cyan, PAL.yellow, PAL.orange, PAL.violet, PAL.green, PAL.red];

function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rgb(c: number): [number, number, number] {
  return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
}
function css(c: [number, number, number], a = 1) {
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
}
/** k < 1 darkens toward ink, k > 1 lightens toward white. */
function shade(c: number, k: number, a = 1): string {
  const [r, g, b] = rgb(c);
  if (k <= 1) {
    const ink = rgb(PAL.ink);
    return css([ink[0] + (r - ink[0]) * k, ink[1] + (g - ink[1]) * k, ink[2] + (b - ink[2]) * k], a);
  }
  const t = Math.min(1, k - 1);
  return css([r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t], a);
}
function hue(c: number) {
  const [r, g, b] = rgb(c).map((v) => v / 255);
  const mx = Math.max(r, g, b),
    mn = Math.min(r, g, b);
  if (mx === mn) return 0;
  let h = 0;
  if (mx === r) h = (g - b) / (mx - mn);
  else if (mx === g) h = 2 + (b - r) / (mx - mn);
  else h = 4 + (r - g) / (mx - mn);
  return ((h * 60) + 360) % 360;
}
function hueDist(a: number, b: number) {
  const d = Math.abs(hue(a) - hue(b));
  return Math.min(d, 360 - d);
}

interface Glyph {
  ch: string;
  x: number; // center x
  y: number; // baseline-middle y
  rot: number;
  sc: number;
  w: number; // unscaled width
}

function eachGlyph(ctx: CanvasRenderingContext2D, glyphs: Glyph[], dx: number, dy: number, fn: (g: Glyph) => void) {
  for (const g of glyphs) {
    ctx.save();
    ctx.translate(g.x + dx, g.y + dy);
    ctx.rotate(g.rot);
    ctx.scale(g.sc, g.sc);
    fn(g);
    ctx.restore();
  }
}

function star4(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.28;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = r * 0.35;
  ctx.stroke();
  ctx.fillStyle = fill;
  ctx.fill();
}

function drawFace(ctx: CanvasRenderingContext2D, r: Rng, x: number, y: number, s: number, accent: number, second: number) {
  const skin = pick(r, PAL.skinTones);
  ctx.lineJoin = 'round';
  // head
  ctx.lineWidth = s * 0.1;
  ctx.strokeStyle = INK;
  ctx.fillStyle = hex(skin);
  ctx.beginPath();
  ctx.ellipse(x, y, s * 0.5, s * 0.56, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fill();
  // cheek shadow
  ctx.fillStyle = 'rgba(80,20,60,0.18)';
  ctx.beginPath();
  ctx.ellipse(x + s * 0.12, y + s * 0.14, s * 0.36, s * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
  // cap
  ctx.fillStyle = hex(second);
  ctx.beginPath();
  ctx.ellipse(x, y - s * 0.28, s * 0.52, s * 0.34, 0, Math.PI, Math.PI * 2);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + s * 0.32, y - s * 0.27, s * 0.42, s * 0.1, -0.12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fill();
  ctx.fillStyle = hex(accent);
  ctx.beginPath();
  ctx.arc(x - s * 0.05, y - s * 0.48, s * 0.09, 0, Math.PI * 2);
  ctx.fill();
  // eyes
  for (const ex of [-0.18, 0.18]) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(x + ex * s, y + s * 0.0, s * 0.13, s * 0.17, 0, 0, Math.PI * 2);
    ctx.lineWidth = s * 0.05;
    ctx.stroke();
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(x + ex * s + s * 0.04, y + s * 0.03, s * 0.065, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x + ex * s + s * 0.06, y + s * 0.0, s * 0.02, 0, Math.PI * 2);
    ctx.fill();
  }
  // grin
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = INK;
  ctx.lineWidth = s * 0.06;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.25, y + s * 0.24);
  ctx.quadraticCurveTo(x, y + s * 0.5, x + s * 0.27, y + s * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - s * 0.22, y + s * 0.27);
  ctx.lineTo(x + s * 0.24, y + s * 0.24);
  ctx.lineWidth = s * 0.03;
  ctx.stroke();
}

const SIGS = ['RIOT CREW', 'NGC 2049', 'GOBBLE GANG', 'NO BEIGE', "TURKEY'S DONE", 'GRAVY BOYZ', 'PIE SQUAD', 'COLOR OR DIE'];

function drawPiece(ctx: CanvasRenderingContext2D, W: number, H: number, name: string, seed: number, accent: number, big: boolean) {
  const r = rng((seed ^ hashStr(name)) >>> 0);
  let text = (name || 'RIOT').toUpperCase().replace(/[^A-Z0-9!?&]/g, '');
  if (!text) text = 'RIOT';
  text = text.slice(0, big ? 9 : 7);

  const others = POPS.filter((c) => c !== accent && hueDist(c, accent) > 50);
  const second = pick(r, others.length ? others : POPS);
  const third = pick(r, POPS.filter((c) => c !== accent && c !== second));
  const fontKey = pick(r, ['Bungee', 'Bungee', 'Rubik', 'Marker'] as const);
  const font = FONT_STACK[fontKey];
  const cut = r() < 0.6 ? '#ffffff' : shade(third, 1.55);
  const blockCol = shade(second, 0.42);

  // ---------- layout
  const n = text.length;
  const padX = W * 0.09;
  let fs = Math.min(H * 0.5, ((W - padX * 2) / (n * 0.74)) * (fontKey === 'Marker' ? 1.15 : 1));
  ctx.font = `${fs}px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const glyphs: Glyph[] = [];
  const overlap = fontKey === 'Marker' ? 0.92 : 0.84;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const ch = text[i];
    const w = Math.max(ctx.measureText(ch).width, fs * 0.35);
    const sc = range(r, 0.88, 1.2);
    glyphs.push({ ch, x: 0, y: 0, rot: range(r, -0.2, 0.2), sc, w });
    total += w * sc * overlap;
  }
  const fit = Math.min(1, (W - padX * 2) / total);
  fs *= fit;
  ctx.font = `${fs}px ${font}`;
  const wave = range(r, 0.5, 1.4);
  const wavePhase = r() * 6;
  let cx = W / 2 - (total * fit) / 2;
  const baseY = H * 0.52;
  for (let i = 0; i < n; i++) {
    const g = glyphs[i];
    g.w *= fit;
    const adv = g.w * g.sc * overlap;
    g.x = cx + adv / 2;
    g.y = baseY + Math.sin(i * wave + wavePhase) * H * 0.05 + range(r, -1, 1) * H * 0.025;
    cx += adv;
  }
  const left = glyphs[0].x - glyphs[0].w * 0.6;
  const right = glyphs[n - 1].x + glyphs[n - 1].w * 0.6;
  const lw = fs; // reference line weight

  // 3D direction
  const depth = Math.round(range(r, 0.07, 0.12) * fs);
  const dirA = pick(r, [0.6, 0.9, 2.2, 2.5]);
  const ddx = Math.cos(dirA),
    ddy = Math.sin(dirA);

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // ---------- backdrop
  const back = r();
  if (back < 0.45) {
    // bubble cloud
    const circles: [number, number, number][] = [];
    const count = Math.round(8 + n * 1.6);
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      circles.push([left + (right - left) * t + range(r, -1, 1) * fs * 0.15, baseY + range(r, -0.5, 0.5) * fs * 0.6, range(r, 0.42, 0.68) * fs]);
    }
    ctx.fillStyle = INK;
    for (const [x, y, rr] of circles) {
      ctx.beginPath();
      ctx.arc(x, y, rr + lw * 0.06, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = shade(third, 0.55);
    for (const [x, y, rr] of circles) {
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = shade(third, 0.75);
    for (const [x, y, rr] of circles) {
      ctx.beginPath();
      ctx.arc(x - rr * 0.18, y - rr * 0.2, rr * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (back < 0.7) {
    // burst
    const cxB = (left + right) / 2,
      cyB = baseY;
    const rx = (right - left) * 0.58,
      ry = fs * 0.95;
    const spikes = 18 + Math.floor(r() * 10);
    const path = () => {
      ctx.beginPath();
      for (let i = 0; i <= spikes * 2; i++) {
        const a = (i / (spikes * 2)) * Math.PI * 2;
        const k = i % 2 === 0 ? 1 : range(r, 0.62, 0.78);
        ctx.lineTo(cxB + Math.cos(a) * rx * k, cyB + Math.sin(a) * ry * k);
      }
      ctx.closePath();
    };
    path();
    ctx.lineWidth = lw * 0.08;
    ctx.strokeStyle = INK;
    ctx.fillStyle = shade(third, 1.0);
    ctx.fill();
    ctx.stroke();
  }

  // ---------- outer ink + cutback (covers face + 3D block)
  const outlineAll = (width: number, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    for (let d = depth; d >= 0; d -= Math.max(1, Math.floor(depth / 6))) {
      eachGlyph(ctx, glyphs, ddx * d, ddy * d, (g) => ctx.strokeText(g.ch, 0, 0));
    }
    eachGlyph(ctx, glyphs, 0, 0, (g) => ctx.strokeText(g.ch, 0, 0));
  };
  outlineAll((lw * 0.42), INK);
  outlineAll((lw * 0.31), cut);
  outlineAll((lw * 0.2), INK);

  // ---------- 3D block
  ctx.fillStyle = blockCol;
  ctx.strokeStyle = blockCol;
  ctx.lineWidth = lw * 0.1;
  for (let d = depth; d >= 1; d--) {
    eachGlyph(ctx, glyphs, ddx * d, ddy * d, (g) => {
      ctx.strokeText(g.ch, 0, 0);
      ctx.fillText(g.ch, 0, 0);
    });
  }
  // block shading lines
  ctx.strokeStyle = shade(second, 0.25, 0.6);
  ctx.lineWidth = Math.max(1, lw * 0.012);
  eachGlyph(ctx, glyphs, ddx * depth * 0.55, ddy * depth * 0.55, (g) => ctx.strokeText(g.ch, 0, 0));

  // ---------- face ink outline
  ctx.strokeStyle = INK;
  ctx.lineWidth = lw * 0.12;
  eachGlyph(ctx, glyphs, 0, 0, (g) => ctx.strokeText(g.ch, 0, 0));

  // ---------- fill layer (offscreen, so patterns clip to letters)
  const fc = document.createElement('canvas');
  fc.width = W;
  fc.height = H;
  const f = fc.getContext('2d')!;
  f.font = ctx.font;
  f.textAlign = 'center';
  f.textBaseline = 'middle';
  f.lineJoin = 'round';
  const grad = f.createLinearGradient(0, baseY - fs * 0.55, 0, baseY + fs * 0.55);
  grad.addColorStop(0, shade(accent, 1.25));
  grad.addColorStop(0.45, hex(accent));
  grad.addColorStop(0.55, hex(accent));
  grad.addColorStop(1, hex(second));
  f.fillStyle = grad;
  f.strokeStyle = grad;
  f.lineWidth = lw * 0.05;
  eachGlyph(f, glyphs, 0, 0, (g) => {
    f.fillText(g.ch, 0, 0);
    f.strokeText(g.ch, 0, 0);
  });
  f.globalCompositeOperation = 'source-atop';
  const pat = r();
  if (pat < 0.25) {
    // diagonal stripes
    f.strokeStyle = shade(accent, 1.45, 0.75);
    f.lineWidth = fs * 0.07;
    for (let x = -H; x < W + H; x += fs * 0.22) {
      f.beginPath();
      f.moveTo(x, H);
      f.lineTo(x + H, 0);
      f.stroke();
    }
  } else if (pat < 0.5) {
    // bubbles
    for (let i = 0; i < 26; i++) {
      f.fillStyle = shade(second, 1.35, 0.8);
      f.beginPath();
      f.arc(range(r, left, right), baseY + range(r, -0.5, 0.5) * fs, range(r, 0.03, 0.1) * fs, 0, Math.PI * 2);
      f.fill();
    }
  } else if (pat < 0.75) {
    // wavy split: bottom third in third color
    f.fillStyle = hex(third);
    f.beginPath();
    f.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) f.lineTo(x, baseY + fs * 0.18 + Math.sin(x * 0.03 + wavePhase) * fs * 0.06);
    f.lineTo(W, H);
    f.closePath();
    f.fill();
    f.strokeStyle = INK;
    f.lineWidth = fs * 0.025;
    f.beginPath();
    for (let x = 0; x <= W; x += 8) f.lineTo(x, baseY + fs * 0.18 + Math.sin(x * 0.03 + wavePhase) * fs * 0.06);
    f.stroke();
  } else {
    // halftone fade
    const step = fs * 0.075;
    for (let y = baseY - fs * 0.6; y < baseY + fs * 0.6; y += step) {
      const t = (y - (baseY - fs * 0.6)) / (fs * 1.2);
      for (let x = left; x < right; x += step) {
        f.fillStyle = shade(third, 1.0, 0.95);
        f.beginPath();
        f.arc(x + ((Math.round(y / step) % 2) * step) / 2, y, step * 0.45 * t, 0, Math.PI * 2);
        f.fill();
      }
    }
  }
  // shines: white bar + dot on the top-left of every letter
  f.fillStyle = 'rgba(255,255,255,0.95)';
  for (const g of glyphs) {
    f.save();
    f.translate(g.x, g.y);
    f.rotate(g.rot);
    f.scale(g.sc, g.sc);
    const sx = -g.w * 0.28,
      sy = -fs * 0.26;
    f.beginPath();
    f.ellipse(sx, sy, fs * 0.045, fs * 0.11, 0.5, 0, Math.PI * 2);
    f.fill();
    f.beginPath();
    f.arc(sx + fs * 0.05, sy - fs * 0.13, fs * 0.025, 0, Math.PI * 2);
    f.fill();
    f.restore();
  }
  // inner thin dark line for definition
  f.globalCompositeOperation = 'source-over';
  f.strokeStyle = shade(accent, 0.45, 0.5);
  f.lineWidth = Math.max(1, (lw * 0.012));
  eachGlyph(f, glyphs, -fs * 0.01, -fs * 0.01, (g) => f.strokeText(g.ch, 0, 0));
  ctx.drawImage(fc, 0, 0);

  // ---------- drips
  for (const g of glyphs) {
    if (r() > 0.45) continue;
    const dripCount = 1 + Math.floor(r() * 2);
    for (let k = 0; k < dripCount; k++) {
      const x = g.x + range(r, -0.3, 0.3) * g.w;
      const y0 = g.y + fs * 0.3 * g.sc;
      const len = range(r, 0.08, 0.32) * H;
      const y1 = Math.min(H - fs * 0.08, y0 + len);
      const wdr = fs * range(r, 0.035, 0.06);
      ctx.strokeStyle = INK;
      ctx.lineWidth = wdr + fs * 0.04;
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(x, y1, wdr * 0.95 + fs * 0.02, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = hex(second);
      ctx.lineWidth = wdr;
      ctx.beginPath();
      ctx.moveTo(x, y0 - fs * 0.02);
      ctx.lineTo(x, y1);
      ctx.stroke();
      ctx.fillStyle = hex(second);
      ctx.beginPath();
      ctx.arc(x, y1, wdr * 0.95, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.arc(x - wdr * 0.25, y1 - wdr * 0.25, wdr * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---------- overspray mist
  for (let i = 0; i < (big ? 900 : 420); i++) {
    const g = glyphs[Math.floor(r() * n)];
    const a = r() * Math.PI * 2;
    const d = fs * (0.4 + Math.abs(range(r, -1, 1) * range(r, 0, 1)) * 0.7);
    ctx.fillStyle = r() < 0.6 ? shade(accent, 1, 0.45) : shade(second, 1, 0.4);
    ctx.fillRect(g.x + Math.cos(a) * d, g.y + Math.sin(a) * d * 0.8, 1.6, 1.6);
  }

  // ---------- arrow
  if (r() < 0.6) {
    const ax = right - fs * 0.1,
      ay = baseY - fs * 0.25;
    const ex = Math.min(W - fs * 0.25, right + fs * 0.45),
      ey = baseY - fs * 0.85;
    const drawArrow = (col: string, wdt: number) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = wdt;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(ex, ay, ex, ey + fs * 0.15);
      ctx.stroke();
    };
    drawArrow(INK, fs * 0.16);
    drawArrow(hex(third), fs * 0.08);
    // head
    const hs = fs * 0.2;
    ctx.beginPath();
    ctx.moveTo(ex - hs, ey + hs * 0.6);
    ctx.lineTo(ex, ey - hs * 0.5);
    ctx.lineTo(ex + hs, ey + hs * 0.6);
    ctx.closePath();
    ctx.lineWidth = fs * 0.06;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = hex(third);
    ctx.fill();
  }

  // ---------- crown on first letter
  if (r() < 0.3) {
    const g = glyphs[0];
    const x = g.x,
      y = g.y - fs * 0.62 * g.sc,
      s = fs * 0.32;
    ctx.beginPath();
    ctx.moveTo(x - s, y + s * 0.4);
    ctx.lineTo(x - s, y - s * 0.3);
    ctx.lineTo(x - s * 0.5, y + s * 0.05);
    ctx.lineTo(x, y - s * 0.5);
    ctx.lineTo(x + s * 0.5, y + s * 0.05);
    ctx.lineTo(x + s, y - s * 0.3);
    ctx.lineTo(x + s, y + s * 0.4);
    ctx.closePath();
    ctx.lineWidth = fs * 0.05;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = hex(PAL.yellow);
    ctx.fill();
  }

  // ---------- sparkles
  const sparkles = 3 + Math.floor(r() * 4);
  for (let i = 0; i < sparkles; i++) {
    const g = glyphs[Math.floor(r() * n)];
    star4(ctx, g.x + range(r, -0.6, 0.6) * g.w, g.y - fs * range(r, 0.45, 0.75), fs * range(r, 0.07, 0.14), r() < 0.7 ? '#ffffff' : shade(third, 1.4));
  }

  // ---------- character
  if (r() < (big ? 0.55 : 0.25)) {
    const sideLeft = r() < 0.5;
    const s = fs * 0.75;
    const x = sideLeft ? Math.max(s * 0.6, left - s * 0.15) : Math.min(W - s * 0.6, right + s * 0.15);
    drawFace(ctx, r, x, baseY + fs * 0.2, s, accent, second);
  }

  // ---------- crew signature
  ctx.save();
  ctx.translate(right - fs * 0.2, Math.min(H - fs * 0.12, baseY + fs * 0.72));
  ctx.rotate(-0.08);
  ctx.font = `${Math.max(12, fs * 0.17)}px ${FONT_STACK.Marker}`;
  ctx.textAlign = 'right';
  ctx.lineWidth = fs * 0.04;
  ctx.strokeStyle = INK;
  const sig = `${pick(r, SIGS)} '${26 + Math.floor(r() * 3)}`;
  ctx.strokeText(sig, 0, 0);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(sig, 0, 0);
  ctx.restore();
}

/** Full graffiti piece for a tagged spot. Transparent background. */
export function makePieceTexture(name: string, seed: number, accent: number, big: boolean): THREE.CanvasTexture {
  const W = big ? 1024 : 512;
  const H = big ? 512 : 256;
  return canvasTexture(W, H, (ctx) => drawPiece(ctx, W, H, name, seed, accent, big), {}, `piece|${name}|${seed}|${accent}|${big}`);
}

// ------------------------------------------------------------------ ambient tags
const WORDS = ['OK', 'ZAP', 'YO', 'BAM', 'ZOE', 'KR8', 'NEO', 'LUX', 'GOB', 'POW', 'RIZ', 'DUB', 'FLY', 'MOJO', 'JAM'];
const NAMES = ['NOVA', 'KIKI', 'DOOM', 'PIXL', 'TOFU', 'RAZZ', 'BLIP', 'MANGO', 'VEX', 'GLITCH'];

function throwup(ctx: CanvasRenderingContext2D, r: Rng, W: number, H: number) {
  const word = pick(r, WORDS);
  const c1 = pick(r, POPS);
  const c2 = r() < 0.5 ? '#ffffff' : hex(pick(r, POPS));
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(range(r, -0.25, 0.25));
  let fs = H * 0.5;
  ctx.font = `${fs}px ${FONT_STACK.Bungee}`;
  while (ctx.measureText(word).width > W * 0.75) {
    fs -= 4;
    ctx.font = `${fs}px ${FONT_STACK.Bungee}`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = fs * 0.36;
  ctx.strokeText(word, 0, 0);
  ctx.strokeStyle = c2;
  ctx.lineWidth = fs * 0.24;
  ctx.strokeText(word, 0, 0);
  ctx.strokeStyle = INK;
  ctx.lineWidth = fs * 0.1;
  ctx.strokeText(word, 0, 0);
  ctx.fillStyle = hex(c1);
  ctx.fillText(word, 0, 0);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillRect(-ctx.measureText(word).width * 0.4, -fs * 0.3, fs * 0.08, fs * 0.2);
  ctx.restore();
}

function helloSticker(ctx: CanvasRenderingContext2D, r: Rng, W: number, H: number) {
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(range(r, -0.3, 0.3));
  const w = W * 0.78,
    h = H * 0.55;
  const rr = 14;
  const rect = () => {
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, rr);
  };
  rect();
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.save();
  rect();
  ctx.clip();
  ctx.fillStyle = hex(pick(r, [PAL.red, PAL.magenta, PAL.violet]));
  ctx.fillRect(-w / 2, -h / 2, w, h * 0.36);
  ctx.fillRect(-w / 2, h / 2 - h * 0.1, w, h * 0.1);
  ctx.restore();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${h * 0.17}px ${FONT_STACK.Bungee}`;
  ctx.fillText('HELLO', 0, -h * 0.34);
  ctx.font = `${h * 0.08}px "Space Mono", monospace`;
  ctx.fillText('my name is', 0, -h * 0.22);
  ctx.fillStyle = INK;
  ctx.font = `${h * 0.3}px ${FONT_STACK.Marker}`;
  ctx.fillText(pick(r, NAMES), 0, h * 0.12);
  ctx.restore();
}

function eyeSticker(ctx: CanvasRenderingContext2D, r: Rng, W: number, H: number) {
  const x = W / 2,
    y = H / 2,
    s = W * 0.38;
  ctx.fillStyle = hex(pick(r, POPS));
  ctx.strokeStyle = INK;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(x, y, s, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (r() < 0.5) {
    // big eye
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(x, y, s * 0.7, s * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(x + s * 0.08, y, s * 0.26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x + s * 0.16, y - s * 0.08, s * 0.08, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // smiley with X eyes
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    for (const ex of [-0.32, 0.32]) {
      ctx.beginPath();
      ctx.moveTo(x + ex * s - s * 0.12, y - s * 0.3);
      ctx.lineTo(x + ex * s + s * 0.12, y - s * 0.06);
      ctx.moveTo(x + ex * s + s * 0.12, y - s * 0.3);
      ctx.lineTo(x + ex * s - s * 0.12, y - s * 0.06);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(x, y + s * 0.05, s * 0.48, 0.2, Math.PI - 0.2);
    ctx.stroke();
  }
}

function markerTag(ctx: CanvasRenderingContext2D, r: Rng, W: number, H: number) {
  const name = pick(r, NAMES);
  const col = r() < 0.4 ? '#ffffff' : hex(pick(r, POPS));
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(range(r, -0.35, 0.15));
  let fs = H * 0.36;
  ctx.font = `${fs}px ${FONT_STACK.Marker}`;
  while (ctx.measureText(name).width > W * 0.8) {
    fs -= 3;
    ctx.font = `${fs}px ${FONT_STACK.Marker}`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = fs * 0.12;
  ctx.strokeText(name, 0, 0);
  ctx.fillStyle = col;
  ctx.fillText(name, 0, 0);
  // swoosh underline + star
  const tw = ctx.measureText(name).width;
  ctx.strokeStyle = col;
  ctx.lineWidth = fs * 0.07;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-tw * 0.5, fs * 0.45);
  ctx.quadraticCurveTo(0, fs * 0.65, tw * 0.55, fs * 0.25);
  ctx.stroke();
  star4(ctx, tw * 0.55, -fs * 0.45, fs * 0.16, col);
  // drip
  ctx.fillStyle = col;
  ctx.fillRect(-tw * 0.2, fs * 0.2, fs * 0.04, fs * 0.5);
  ctx.restore();
}

function noBeige(ctx: CanvasRenderingContext2D, r: Rng, W: number, H: number) {
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(range(r, -0.2, 0.2));
  const s = W * 0.32;
  ctx.fillStyle = hex(PAL.blandBeige);
  ctx.fillRect(-s * 0.8, -s * 0.8, s * 1.6, s * 1.6);
  ctx.strokeStyle = hex(PAL.red);
  ctx.lineWidth = s * 0.22;
  ctx.beginPath();
  ctx.arc(0, 0, s, 0, Math.PI * 2);
  ctx.moveTo(-s * 0.7, -s * 0.7);
  ctx.lineTo(s * 0.7, s * 0.7);
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.font = `${s * 0.35}px ${FONT_STACK.Rubik}`;
  ctx.textAlign = 'center';
  ctx.fillText('NO BEIGE', 0, s * 1.42);
  ctx.restore();
}

/** Small ambient throwups / stickers / tags to dress walls. Transparent background. */
export function makeWallTagTexture(seed: number): THREE.CanvasTexture {
  return canvasTexture(
    256,
    256,
    (ctx, W, H) => {
      const r = rng(seed * 7919 + 13);
      const kind = seed % 5;
      if (kind === 0) throwup(ctx, r, W, H);
      else if (kind === 1) helloSticker(ctx, r, W, H);
      else if (kind === 2) eyeSticker(ctx, r, W, H);
      else if (kind === 3) markerTag(ctx, r, W, H);
      else noBeige(ctx, r, W, H);
    },
    {},
    `walltag|${seed}`,
  );
}
