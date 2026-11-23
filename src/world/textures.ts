import * as THREE from 'three';
import { canvasTexture, rng, speckle, type Rng } from '../render/textures';
import { PAL, hex } from '../render/palette';

/*
  Every world texture is painted on a canvas at load time.
  Textures that get tinted per-building (facades, corrugation) are painted light/neutral
  so material.color does the tinting; ground textures carry their real colors.
*/

const F = {
  bungee: '"Bungee", Impact, sans-serif',
  shade: '"Bungee Shade", "Bungee", Impact, sans-serif',
  rubik: '"Rubik Mono One", Impact, sans-serif',
  marker: '"Permanent Marker", "Comic Sans MS", cursive',
  mono: '"Space Mono", monospace',
};
export const FONTS = F;

function crack(ctx: CanvasRenderingContext2D, r: Rng, x: number, y: number, len: number) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  let a = r() * Math.PI * 2;
  for (let i = 0; i < len; i++) {
    a += (r() - 0.5) * 1.1;
    x += Math.cos(a) * 7;
    y += Math.sin(a) * 7;
    ctx.lineTo(x, y);
  }
  ctx.stroke();
}

export function asphaltTex() {
  return canvasTexture(
    512,
    512,
    (c, w, h) => {
      const r = rng(11);
      c.fillStyle = hex(PAL.asphalt);
      c.fillRect(0, 0, w, h);
      // big soft patches (repaired asphalt)
      for (let i = 0; i < 6; i++) {
        c.fillStyle = r() < 0.5 ? 'rgba(80,70,110,0.35)' : 'rgba(40,32,62,0.35)';
        const pw = 60 + r() * 160,
          ph = 40 + r() * 120;
        c.fillRect(r() * w, r() * h, pw, ph);
      }
      speckle(c, w, h, r, 5000, ['#4c4469', '#2e2944', '#57507a', '#352f4d'], [1, 3]);
      c.strokeStyle = 'rgba(20,12,36,0.7)';
      c.lineWidth = 1.5;
      for (let i = 0; i < 7; i++) crack(c, r, r() * w, r() * h, 8 + r() * 18);
      // oil stains
      for (let i = 0; i < 4; i++) {
        const g = c.createRadialGradient(0, 0, 0, 0, 0, 30);
        g.addColorStop(0, 'rgba(25,15,45,0.55)');
        g.addColorStop(1, 'rgba(25,15,45,0)');
        c.save();
        c.translate(r() * w, r() * h);
        c.scale(1, 0.6);
        c.fillStyle = g;
        c.fillRect(-30, -30, 60, 60);
        c.restore();
      }
    },
    { repeat: [1, 1] },
    'asphalt',
  );
}

export function sidewalkTex() {
  return canvasTexture(
    512,
    512,
    (c, w, h) => {
      const r = rng(21);
      c.fillStyle = hex(PAL.sidewalk);
      c.fillRect(0, 0, w, h);
      // 4 x 4 slabs, each slightly different tone
      const n = 4,
        s = w / n;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          c.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '90,60,120'},${0.04 + r() * 0.07})`;
          c.fillRect(i * s, j * s, s, s);
        }
      speckle(c, w, h, r, 3500, ['#a897ba', '#cbbcd9', '#9a89ad'], [1, 2]);
      c.strokeStyle = '#8c7aa3';
      c.lineWidth = 4;
      for (let i = 0; i <= n; i++) {
        c.beginPath();
        c.moveTo(i * s, 0);
        c.lineTo(i * s, h);
        c.stroke();
        c.beginPath();
        c.moveTo(0, i * s);
        c.lineTo(w, i * s);
        c.stroke();
      }
      // gum spots
      for (let i = 0; i < 14; i++) {
        c.fillStyle = 'rgba(70,55,90,0.5)';
        c.beginPath();
        c.arc(r() * w, r() * h, 2 + r() * 3, 0, Math.PI * 2);
        c.fill();
      }
      c.strokeStyle = 'rgba(60,40,80,0.5)';
      c.lineWidth = 1;
      for (let i = 0; i < 3; i++) crack(c, r, r() * w, r() * h, 6);
    },
    { repeat: [1, 1] },
    'sidewalk',
  );
}

export function plazaTex() {
  return canvasTexture(
    512,
    512,
    (c, w, h) => {
      const r = rng(31);
      c.fillStyle = '#c98a8a';
      c.fillRect(0, 0, w, h);
      const n = 8,
        s = w / n;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          const alt = (i + j) % 2 === 0;
          c.fillStyle = alt ? '#ffb3a7' : '#fff0dc';
          c.fillRect(i * s + 3, j * s + 3, s - 6, s - 6);
          if (alt && (i * 3 + j) % 5 === 0) {
            // inset diamond motif
            c.fillStyle = '#ff8fa0';
            c.beginPath();
            c.moveTo(i * s + s / 2, j * s + 10);
            c.lineTo(i * s + s - 10, j * s + s / 2);
            c.lineTo(i * s + s / 2, j * s + s - 10);
            c.lineTo(i * s + 10, j * s + s / 2);
            c.closePath();
            c.fill();
          }
        }
      speckle(c, w, h, r, 2500, ['rgba(120,60,90,0.25)', 'rgba(255,255,255,0.3)'], [1, 2]);
    },
    { repeat: [1, 1] },
    'plaza',
  );
}

export function dockGroundTex() {
  return canvasTexture(
    512,
    512,
    (c, w, h) => {
      const r = rng(41);
      c.fillStyle = '#9b93ad';
      c.fillRect(0, 0, w, h);
      // big concrete slabs
      c.strokeStyle = '#6f6788';
      c.lineWidth = 3;
      for (let i = 0; i <= 2; i++) {
        c.beginPath();
        c.moveTo((i * w) / 2, 0);
        c.lineTo((i * w) / 2, h);
        c.stroke();
        c.beginPath();
        c.moveTo(0, (i * h) / 2);
        c.lineTo(w, (i * h) / 2);
        c.stroke();
      }
      speckle(c, w, h, r, 4500, ['#857d99', '#aaa2bb', '#7a7290', 'rgba(181,85,43,0.35)'], [1, 3]);
      // stains & tyre marks
      c.strokeStyle = 'rgba(40,30,60,0.25)';
      c.lineWidth = 10;
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        const x = r() * w;
        c.moveTo(x, 0);
        c.bezierCurveTo(x + 80, h * 0.3, x - 60, h * 0.6, x + 30, h);
        c.stroke();
      }
      c.strokeStyle = 'rgba(30,20,50,0.5)';
      c.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) crack(c, r, r() * w, r() * h, 12);
    },
    { repeat: [1, 1] },
    'dockground',
  );
}

export type FacadeStyle = 'grid' | 'ribbon' | 'brick' | 'warehouse' | 'glass';

/** 8 bays x 8 floors. One tile = 32 m wide x 28 m tall (4 m bays, 3.5 m floors). */
export const FACADE_TILE: [number, number] = [32, 28];

export function facadeTex(style: FacadeStyle): { map: THREE.CanvasTexture; lit: THREE.CanvasTexture } {
  const W = 512,
    H = 448,
    bw = W / 8,
    fh = H / 8;
  const litWins: [number, number, number, number][] = [];
  const map = canvasTexture(
    W,
    H,
    (c) => {
      const r = rng(style.length * 977 + 5);
      // wall
      if (style === 'brick') {
        c.fillStyle = '#d8d0d8';
        c.fillRect(0, 0, W, H);
        const bh = 7,
          bwk = 16;
        for (let y = 0; y < H; y += bh) {
          const off = (y / bh) % 2 ? bwk / 2 : 0;
          for (let x = -bwk; x < W; x += bwk) {
            const t = 225 + Math.floor(r() * 30);
            c.fillStyle = `rgb(${t},${t - 8},${t - 4})`;
            c.fillRect(x + off + 1, y + 1, bwk - 2, bh - 2);
          }
        }
      } else if (style === 'warehouse') {
        c.fillStyle = '#ffffff';
        c.fillRect(0, 0, W, H);
        for (let x = 0; x < W; x += 12) {
          c.fillStyle = '#d6d2e2';
          c.fillRect(x, 0, 5, H);
          c.fillStyle = '#efedf6';
          c.fillRect(x + 5, 0, 2, H);
        }
      } else {
        c.fillStyle = '#f6f1ee';
        c.fillRect(0, 0, W, H);
        speckle(c, W, H, r, 1500, ['rgba(120,100,140,0.12)', 'rgba(255,255,255,0.5)'], [1, 3]);
      }
      // floor slabs
      for (let f = 0; f < 8; f++) {
        c.fillStyle = 'rgba(90,70,120,0.28)';
        c.fillRect(0, f * fh + fh - 5, W, 5);
        c.fillStyle = 'rgba(255,255,255,0.55)';
        c.fillRect(0, f * fh + fh - 7, W, 2);
      }
      // pilasters
      if (style === 'grid' || style === 'brick') {
        for (let b = 0; b <= 8; b++) {
          c.fillStyle = 'rgba(90,70,120,0.13)';
          c.fillRect(b * bw - 3, 0, 6, H);
        }
      }
      const glass = '#2b2350';
      const glassHi = '#5a4c9a';
      for (let f = 0; f < 8; f++) {
        for (let b = 0; b < 8; b++) {
          const x0 = b * bw,
            y0 = f * fh;
          if (style === 'warehouse') {
            if (f !== 1) continue; // one high strip of small windows (row 1 from top => upper floor)
            const wx = x0 + 10,
              wy = y0 + 18,
              ww = bw - 20,
              wh = 14;
            c.fillStyle = glass;
            c.fillRect(wx, wy, ww, wh);
            c.fillStyle = glassHi;
            c.fillRect(wx + 3, wy + 2, ww * 0.3, 3);
            litWins.push([wx, wy, ww, wh]);
            continue;
          }
          if (style === 'ribbon') {
            const wy = y0 + 14,
              wh = fh - 26;
            c.fillStyle = glass;
            c.fillRect(x0, wy, bw, wh);
            c.fillStyle = '#e9e3f0';
            c.fillRect(x0, wy, 3, wh);
            c.fillStyle = glassHi;
            c.beginPath();
            c.moveTo(x0 + 10, wy + wh);
            c.lineTo(x0 + 22, wy);
            c.lineTo(x0 + 30, wy);
            c.lineTo(x0 + 18, wy + wh);
            c.fill();
            litWins.push([x0 + 3, wy, bw - 3, wh]);
            continue;
          }
          if (style === 'glass') {
            c.fillStyle = r() < 0.5 ? '#3a2f6e' : '#2b2350';
            c.fillRect(x0 + 2, y0 + 2, bw - 4, fh - 9);
            c.fillStyle = 'rgba(160,140,255,0.25)';
            c.fillRect(x0 + 2, y0 + 2, bw - 4, 6);
            c.strokeStyle = '#d9d2ea';
            c.lineWidth = 2;
            c.strokeRect(x0 + 2, y0 + 2, bw - 4, fh - 9);
            litWins.push([x0 + 3, y0 + 3, bw - 6, fh - 11]);
            continue;
          }
          // grid / brick: punched windows
          const wx = x0 + 13,
            wy = y0 + 12,
            ww = bw - 26,
            wh = fh - 24;
          c.fillStyle = '#ffffff';
          c.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
          c.fillStyle = glass;
          c.fillRect(wx, wy, ww, wh);
          // reflection streak
          c.fillStyle = glassHi;
          c.beginPath();
          c.moveTo(wx + 4, wy + wh);
          c.lineTo(wx + 14, wy);
          c.lineTo(wx + 20, wy);
          c.lineTo(wx + 10, wy + wh);
          c.fill();
          // mullion
          c.fillStyle = '#e7e0ef';
          c.fillRect(wx + ww / 2 - 1, wy, 2, wh);
          // sill
          c.fillStyle = '#cfc4d6';
          c.fillRect(wx - 5, wy + wh + 2, ww + 10, 4);
          // curtains / blinds
          const k = r();
          if (k < 0.2) {
            c.fillStyle = '#c86fa0';
            c.fillRect(wx, wy, ww * 0.3, wh);
            c.fillRect(wx + ww * 0.7, wy, ww * 0.3, wh);
          } else if (k < 0.35) {
            c.fillStyle = 'rgba(230,220,240,0.7)';
            for (let y = wy; y < wy + wh * 0.6; y += 3) c.fillRect(wx, y, ww, 1.5);
          }
          // AC unit / plant
          if (r() < 0.15) {
            c.fillStyle = '#bfb8cc';
            c.fillRect(wx + ww - 12, wy + wh - 9, 14, 10);
            c.fillStyle = '#8a82a0';
            c.fillRect(wx + ww - 10, wy + wh - 7, 10, 1);
            c.fillRect(wx + ww - 10, wy + wh - 4, 10, 1);
          } else if (r() < 0.12) {
            c.fillStyle = '#3fcf6a';
            c.beginPath();
            c.arc(wx + 8, wy + wh - 2, 6, 0, Math.PI * 2);
            c.fill();
          }
          litWins.push([wx, wy, ww, wh]);
        }
      }
    },
    { repeat: [1, 1] },
    `facade-${style}`,
  );
  const lit = canvasTexture(
    W,
    H,
    (c) => {
      const r = rng(style.length * 31 + 99);
      c.fillStyle = '#000000';
      c.fillRect(0, 0, W, H);
      for (const [x, y, w, h] of litWins) {
        const k = r();
        if (k < 0.32) {
          c.fillStyle = k < 0.08 ? '#ff9ad8' : k < 0.14 ? '#8af0ff' : '#ffffff';
          c.fillRect(x, y, w, h);
          // silhouette
          if (r() < 0.25) {
            c.fillStyle = '#000';
            c.beginPath();
            c.arc(x + w * 0.6, y + h * 0.45, h * 0.13, 0, Math.PI * 2);
            c.fill();
            c.fillRect(x + w * 0.6 - h * 0.18, y + h * 0.58, h * 0.36, h * 0.5);
          }
        } else if (k < 0.4) {
          c.fillStyle = '#5a4a3a';
          c.fillRect(x, y, w, h);
        }
      }
    },
    { repeat: [1, 1] },
    `facade-lit-${style}`,
  );
  return { map, lit };
}

export function corrugatedTex() {
  return canvasTexture(
    256,
    256,
    (c, w, h) => {
      const r = rng(51);
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 16) {
        c.fillStyle = '#c9c4da';
        c.fillRect(x, 0, 6, h);
        c.fillStyle = '#e6e2f0';
        c.fillRect(x + 6, 0, 3, h);
      }
      // top/bottom rails
      c.fillStyle = '#b3aec6';
      c.fillRect(0, 0, w, 10);
      c.fillRect(0, h - 10, w, 10);
      // rust + scuffs
      for (let i = 0; i < 25; i++) {
        c.fillStyle = `rgba(150,70,40,${0.15 + r() * 0.25})`;
        c.fillRect(r() * w, r() * h, 2 + r() * 10, 2 + r() * 30);
      }
      speckle(c, w, h, r, 600, ['rgba(80,60,100,0.25)'], [1, 2]);
    },
    { repeat: [1, 1] },
    'corrugated',
  );
}

export function stripeTex(a: number, b: number, n = 8, vertical = true) {
  return canvasTexture(
    128,
    128,
    (c, w, h) => {
      for (let i = 0; i < n; i++) {
        c.fillStyle = hex(i % 2 ? b : a);
        if (vertical) c.fillRect((i * w) / n, 0, w / n + 1, h);
        else c.fillRect(0, (i * h) / n, w, h / n + 1);
      }
      // scallop shading at bottom
      c.fillStyle = 'rgba(30,10,50,0.25)';
      c.fillRect(0, h - 10, w, 10);
    },
    { repeat: [1, 1] },
    `stripe-${a}-${b}-${n}-${vertical}`,
  );
}

export function hazardTex() {
  return canvasTexture(
    128,
    32,
    (c, w, h) => {
      c.fillStyle = hex(PAL.yellow);
      c.fillRect(0, 0, w, h);
      c.fillStyle = hex(PAL.ink);
      for (let x = -h; x < w + h; x += 24) {
        c.beginPath();
        c.moveTo(x, h);
        c.lineTo(x + 12, h);
        c.lineTo(x + 12 + h, 0);
        c.lineTo(x + h, 0);
        c.fill();
      }
    },
    { repeat: [1, 1] },
    'hazard',
  );
}

/** Neon sign: black board, glowing text. Use with MeshBasicMaterial (toneMapped false, color > 1 for bloom). */
export function neonSignTex(text: string, color: number, font = F.bungee, w = 512, h = 128) {
  return canvasTexture(
    w,
    h,
    (c) => {
      c.fillStyle = '#0d0618';
      c.fillRect(0, 0, w, h);
      let fs = h * 0.62;
      c.font = `${fs}px ${font}`;
      while (c.measureText(text).width > w * 0.88 && fs > 10) {
        fs -= 2;
        c.font = `${fs}px ${font}`;
      }
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.shadowColor = hex(color);
      c.shadowBlur = h * 0.18;
      c.strokeStyle = hex(color);
      c.lineWidth = Math.max(3, fs * 0.09);
      c.strokeText(text, w / 2, h / 2 + 2);
      c.shadowBlur = 0;
      c.fillStyle = '#ffffff';
      c.globalAlpha = 0.85;
      c.fillText(text, w / 2, h / 2 + 2);
      c.globalAlpha = 1;
      // tube border
      c.strokeStyle = hex(color);
      c.lineWidth = 4;
      c.shadowColor = hex(color);
      c.shadowBlur = 10;
      c.strokeRect(8, 8, w - 16, h - 16);
    },
    {},
    `neon-${text}-${color}-${w}x${h}`,
  );
}

function blandMascot(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  // Mr. Bland: a perfectly neutral turkey-ish face
  c.fillStyle = '#c9b48f';
  c.strokeStyle = '#5d4630';
  c.lineWidth = s * 0.06;
  // tail fan (in beige shades)
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i - 2) * 0.42;
    c.save();
    c.translate(x, y);
    c.rotate(a + Math.PI / 2);
    c.fillStyle = i % 2 ? '#b89c74' : '#d9c9a8';
    c.beginPath();
    c.ellipse(0, -s * 0.55, s * 0.17, s * 0.42, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.restore();
  }
  c.fillStyle = '#e9dcc0';
  c.beginPath();
  c.arc(x, y, s * 0.42, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  // eyes: two flat dots, mouth: flat line
  c.fillStyle = '#5d4630';
  c.beginPath();
  c.arc(x - s * 0.14, y - s * 0.06, s * 0.05, 0, Math.PI * 2);
  c.arc(x + s * 0.14, y - s * 0.06, s * 0.05, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.moveTo(x - s * 0.13, y + s * 0.14);
  c.lineTo(x + s * 0.13, y + s * 0.14);
  c.stroke();
  // beak
  c.fillStyle = '#d4b27a';
  c.beginPath();
  c.moveTo(x - s * 0.06, y + s * 0.02);
  c.lineTo(x + s * 0.06, y + s * 0.02);
  c.lineTo(x, y + s * 0.1);
  c.closePath();
  c.fill();
  c.stroke();
}

export const SLOGANS = [
  'STAY BEIGE',
  'COLOR IS A PHASE',
  'GRAVY IS MANDATORY',
  'BEIGE IS THE NEW BEIGE',
  'REPORT ALL COLORS',
  'PLEASE REMAIN NEUTRAL',
  'FUN IS NOT ON THE MENU',
  'HAPPY THANKSGIVING OF BEIGE',
  'SATURATION KILLS',
  'MASHED. POTATOES. ONLY.',
];

/** BLANDCO propaganda poster / billboard. */
export function blandPosterTex(slogan: string, w = 512, h = 320) {
  return canvasTexture(
    w,
    h,
    (c) => {
      const r = rng(slogan.length * 7 + w);
      c.fillStyle = '#e9dcc0';
      c.fillRect(0, 0, w, h);
      // subtle paper grain
      speckle(c, w, h, r, 1200, ['rgba(140,110,70,0.12)', 'rgba(255,255,255,0.3)'], [1, 2]);
      c.strokeStyle = '#8a6b4a';
      c.lineWidth = h * 0.03;
      c.strokeRect(h * 0.04, h * 0.04, w - h * 0.08, h - h * 0.08);
      blandMascot(c, h * 0.36, h * 0.5, h * 0.42);
      // slogan
      const tx = h * 0.7,
        tw = w - tx - h * 0.1;
      c.fillStyle = '#6b4f33';
      c.textBaseline = 'middle';
      c.textAlign = 'left';
      const words = slogan.split(' ');
      const lines: string[] = [];
      let fs = h * 0.2;
      const fit = () => {
        lines.length = 0;
        c.font = `${fs}px ${F.rubik}`;
        let cur = '';
        for (const wd of words) {
          const t = cur ? cur + ' ' + wd : wd;
          if (c.measureText(t).width > tw && cur) {
            lines.push(cur);
            cur = wd;
          } else cur = t;
        }
        lines.push(cur);
        return lines.length * fs * 1.1 < h * 0.62 && lines.every((l) => c.measureText(l).width <= tw);
      };
      while (!fit() && fs > 8) fs -= 2;
      const y0 = h * 0.45 - ((lines.length - 1) * fs * 1.1) / 2;
      lines.forEach((l, i) => c.fillText(l, tx, y0 + i * fs * 1.1));
      c.font = `${h * 0.055}px ${F.mono}`;
      c.fillStyle = '#8a6b4a';
      c.fillText('A MESSAGE FROM BLANDCO™  •  REMAIN CALM AND BEIGE', tx, h * 0.84);
      // corner logo
      c.font = `${h * 0.075}px ${F.bungee}`;
      c.textAlign = 'right';
      c.fillStyle = '#6b4f33';
      c.fillText('BLANDCO', w - h * 0.1, h * 0.14);
    },
    {},
    `poster-${slogan}-${w}x${h}`,
  );
}

/** Beige "approved surface" panel that marks graffiti spots. */
export function approvedPanelTex() {
  return canvasTexture(
    512,
    256,
    (c, w, h) => {
      const r = rng(7);
      c.fillStyle = '#e2d4b6';
      c.fillRect(0, 0, w, h);
      speckle(c, w, h, r, 900, ['rgba(140,110,70,0.15)'], [1, 3]);
      // roller strokes
      for (let i = 0; i < 10; i++) {
        c.fillStyle = `rgba(255,250,235,${0.08 + r() * 0.1})`;
        c.fillRect(0, r() * h, w, 10 + r() * 24);
      }
      c.strokeStyle = '#a88d68';
      c.setLineDash([14, 10]);
      c.lineWidth = 5;
      c.strokeRect(12, 12, w - 24, h - 24);
      c.setLineDash([]);
      c.fillStyle = '#a88d68';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = `26px ${F.rubik}`;
      c.fillText('BLANDCO APPROVED SURFACE', w / 2, h / 2 - 22);
      c.font = `17px ${F.mono}`;
      c.fillText('THIS WALL HAS BEEN BEIGED FOR YOUR SAFETY', w / 2, h / 2 + 16);
      c.fillText('NO COLORS • NO FUN • NO EXCEPTIONS', w / 2, h / 2 + 42);
    },
    {},
    'approved-panel',
  );
}

export function shopInteriorTex(seed: number, tint: number) {
  return canvasTexture(
    256,
    128,
    (c, w, h) => {
      const r = rng(seed);
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, hex(tint));
      g.addColorStop(1, '#3a1d4a');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      // light tube
      c.fillStyle = '#fff7e0';
      c.fillRect(10, 6, w - 20, 4);
      // shelves with goods
      for (let s = 0; s < 3; s++) {
        const y = 36 + s * 28;
        c.fillStyle = '#2b1736';
        c.fillRect(8, y, w - 16, 4);
        for (let x = 12; x < w - 16; x += 8 + r() * 10) {
          const ih = 8 + r() * 14;
          c.fillStyle = ['#ff2e88', '#19e3ff', '#ffe11a', '#ff7a1a', '#3dff6e', '#fff8f0', '#8a4bff'][Math.floor(r() * 7)];
          c.fillRect(x, y - ih, 5 + r() * 5, ih);
        }
      }
      // shopkeeper silhouette
      if (r() < 0.7) {
        const x = 40 + r() * (w - 80);
        c.fillStyle = '#1a0d26';
        c.beginPath();
        c.arc(x, h * 0.52, 11, 0, Math.PI * 2);
        c.fill();
        c.fillRect(x - 15, h * 0.6, 30, h * 0.4);
      }
      // window decals
      c.fillStyle = 'rgba(255,255,255,0.55)';
      c.font = `14px ${F.marker}`;
      c.fillText(['OPEN 24/7', 'SALE!!', 'NO BEIGE', 'GRAVY 2 GO', 'EST. 1999'][Math.floor(r() * 5)], 14, h - 10);
      c.fillStyle = 'rgba(255,255,255,0.18)';
      c.beginPath();
      c.moveTo(w * 0.55, 0);
      c.lineTo(w * 0.7, 0);
      c.lineTo(w * 0.5, h);
      c.lineTo(w * 0.35, h);
      c.fill();
    },
    {},
    `shopint-${seed}-${tint}`,
  );
}

export function chainLinkTex() {
  return canvasTexture(
    128,
    128,
    (c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.strokeStyle = '#cfd6e6';
      c.lineWidth = 3;
      const s = 16;
      for (let i = -h; i < w + h; i += s) {
        c.beginPath();
        c.moveTo(i, 0);
        c.lineTo(i + h, h);
        c.stroke();
        c.beginPath();
        c.moveTo(i + h, 0);
        c.lineTo(i, h);
        c.stroke();
      }
    },
    { repeat: [1, 1] },
    'chainlink',
  );
}

export function waterTex() {
  return canvasTexture(
    512,
    512,
    (c, w, h) => {
      const r = rng(61);
      c.fillStyle = '#1b6fa8';
      c.fillRect(0, 0, w, h);
      // banded depth
      for (let i = 0; i < 8; i++) {
        c.fillStyle = i % 2 ? 'rgba(25,227,255,0.10)' : 'rgba(10,30,80,0.10)';
        c.fillRect(0, (i * h) / 8, w, h / 8);
      }
      // wave squiggles
      c.lineCap = 'round';
      for (let i = 0; i < 70; i++) {
        const x = r() * w,
          y = r() * h,
          len = 20 + r() * 50;
        c.strokeStyle = r() < 0.3 ? '#ffffff' : '#7ff0ff';
        c.lineWidth = 2 + r() * 3;
        c.beginPath();
        c.moveTo(x, y);
        c.quadraticCurveTo(x + len / 2, y - 6, x + len, y);
        c.stroke();
      }
    },
    { repeat: [1, 1] },
    'water',
  );
}

export function manholeTex() {
  return canvasTexture(
    128,
    128,
    (c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.fillStyle = '#2a2440';
      c.beginPath();
      c.arc(w / 2, h / 2, 62, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#5a5278';
      c.lineWidth = 4;
      c.beginPath();
      c.arc(w / 2, h / 2, 54, 0, Math.PI * 2);
      c.stroke();
      c.save();
      c.beginPath();
      c.arc(w / 2, h / 2, 50, 0, Math.PI * 2);
      c.clip();
      for (let i = -64; i < 64; i += 10) {
        c.fillRect(w / 2 + i, 0, 4, h);
      }
      c.restore();
      c.fillStyle = '#7d74a0';
      c.font = `14px ${F.mono}`;
      c.textAlign = 'center';
      c.fillText('NGC', w / 2, h / 2 + 5);
    },
    {},
    'manhole',
  );
}

export function bannerTex(text: string) {
  return canvasTexture(
    1024,
    128,
    (c, w, h) => {
      c.fillStyle = '#efe2c4';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#b89c74';
      c.fillRect(0, 0, w, 10);
      c.fillRect(0, h - 10, w, 10);
      c.fillStyle = '#6b4f33';
      c.font = `${h * 0.48}px ${F.rubik}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(text, w / 2, h / 2 + 2);
    },
    {},
    `banner-${text}`,
  );
}

export function plaqueTex() {
  return canvasTexture(
    512,
    192,
    (c, w, h) => {
      c.fillStyle = '#c9b48f';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#6b4f33';
      c.lineWidth = 8;
      c.strokeRect(10, 10, w - 20, h - 20);
      c.fillStyle = '#5d4630';
      c.textAlign = 'center';
      c.font = `34px ${F.rubik}`;
      c.fillText('SIR GOBBLESWORTH', w / 2, 62);
      c.font = `18px ${F.mono}`;
      c.fillText('BELOVED MASCOT OF BLANDCO', w / 2, 102);
      c.fillText('"I HAVE NO STRONG FEELINGS ABOUT THIS"', w / 2, 134);
      c.fillText('BRONZE (PAINTED BEIGE) • EST. 2049', w / 2, 162);
    },
    {},
    'plaque',
  );
}

export function vendingTex(seed: number, tint: number) {
  return canvasTexture(
    128,
    256,
    (c, w, h) => {
      const r = rng(seed);
      c.fillStyle = '#120a20';
      c.fillRect(0, 0, w, h);
      c.fillStyle = hex(tint);
      c.fillRect(6, 6, w - 12, 40);
      c.fillStyle = '#ffffff';
      c.font = `20px ${F.bungee}`;
      c.textAlign = 'center';
      c.fillText(['GRAVY', 'SODA', 'YAMS', 'POP!'][seed % 4], w / 2, 34);
      for (let row = 0; row < 5; row++)
        for (let col = 0; col < 4; col++) {
          c.fillStyle = ['#ff2e88', '#19e3ff', '#ffe11a', '#ff7a1a', '#3dff6e', '#ffffff'][Math.floor(r() * 6)];
          c.fillRect(12 + col * 26, 58 + row * 30, 16, 22);
        }
      c.fillStyle = '#3a2f66';
      c.fillRect(12, h - 44, w - 24, 30);
    },
    {},
    `vend-${seed}-${tint}`,
  );
}

export function busAdTex() {
  return canvasTexture(
    256,
    384,
    (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#ff2e88');
      g.addColorStop(1, '#8a4bff');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#ffe11a';
      c.font = `46px ${F.bungee}`;
      c.textAlign = 'center';
      c.fillText('PIRATE', w / 2, 80);
      c.fillText('RADIO', w / 2, 128);
      c.fillStyle = '#ffffff';
      c.font = `22px ${F.marker}`;
      c.fillText('104.9 FM GOBBLE', w / 2, 170);
      c.fillText('the only station', w / 2, 210);
      c.fillText('BLANDCO hates', w / 2, 236);
      // boombox
      c.fillStyle = '#170b26';
      c.fillRect(48, 270, 160, 80);
      c.fillStyle = '#19e3ff';
      c.beginPath();
      c.arc(88, 312, 24, 0, Math.PI * 2);
      c.arc(168, 312, 24, 0, Math.PI * 2);
      c.fill();
    },
    {},
    'busad',
  );
}
