import * as THREE from 'three';

/** Procedural rune glyph drawn into a 2D context centred at (cx, cy) with radius r. */
export function drawGlyph(ctx: CanvasRenderingContext2D, seed: number, cx: number, cy: number, r: number) {
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  ctx.beginPath();
  const n = 3 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, b = a + (rnd() - 0.5) * 3;
    const r1 = r * (0.2 + rnd() * 0.8), r2 = r * (0.2 + rnd() * 0.8);
    ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    if (rnd() < 0.4) ctx.arc(cx, cy, r2 * 0.6, a, b);
    else ctx.lineTo(cx + Math.cos(b) * r2, cy + Math.sin(b) * r2);
  }
  ctx.stroke();
  if (rnd() < 0.6) {
    ctx.beginPath();
    ctx.arc(cx + (rnd() - 0.5) * r, cy + (rnd() - 0.5) * r, r * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** White-on-transparent glyph texture (use as alphaMap/map on a glowing plane). */
export function glyphTexture(seed: number, size = 128): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  ctx.lineWidth = size * 0.07;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  drawGlyph(ctx, seed, size / 2, size / 2, size * 0.36);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Tablet text: rows of small glyph "words" (looks like an unreadable script). */
export function scriptTexture(seed: number, w = 256, h = 320, rows = 9): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  let k = seed;
  for (let row = 0; row < rows; row++) {
    let x = 18;
    const y = 26 + row * ((h - 40) / rows);
    while (x < w - 24) {
      const len = 2 + ((k * 7) % 4);
      for (let i = 0; i < len && x < w - 20; i++) {
        drawGlyph(ctx, k++, x, y, 7);
        x += 15;
      }
      x += 12;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Soft radial gradient sprite texture (glows, ground light pools, AO blobs). */
let radial: THREE.CanvasTexture | null = null;
export function radialTexture(): THREE.CanvasTexture {
  if (radial) return radial;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  radial = new THREE.CanvasTexture(c);
  return radial;
}

/** Several glyphs side by side in ONE texture (one draw call for a row of plaques). */
export function glyphStrip(seeds: number[], cell = 64, gap = 0): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = seeds.length * (cell + gap);
  c.height = cell;
  const ctx = c.getContext('2d')!;
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  ctx.lineWidth = cell * 0.07;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  seeds.forEach((sd, i) => drawGlyph(ctx, sd, i * (cell + gap) + (cell + gap) / 2, cell / 2, cell * 0.36));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
