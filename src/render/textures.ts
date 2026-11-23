import * as THREE from 'three';

/** Deterministic PRNG (mulberry32). Use for anything that must look the same on every client. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export type Rng = ReturnType<typeof rng>;
export const pick = <T>(r: Rng, arr: readonly T[]): T => arr[Math.floor(r() * arr.length) % arr.length];
export const range = (r: Rng, a: number, b: number) => a + (b - a) * r();

let maxAniso = 8;
export function setMaxAnisotropy(n: number) {
  maxAniso = n;
}

export interface CanvasTexOpts {
  repeat?: [number, number];
  srgb?: boolean;
  nearest?: boolean;
  mipmaps?: boolean;
}

/** Draw into a canvas and wrap it as a texture. Textures are cached by key when given. */
const texCache = new Map<string, THREE.CanvasTexture>();
export function canvasTexture(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  opts: CanvasTexOpts = {},
  cacheKey?: string,
): THREE.CanvasTexture {
  if (cacheKey) {
    const hit = texCache.get(cacheKey);
    if (hit) return hit;
  }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  if (opts.repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(opts.repeat[0], opts.repeat[1]);
  }
  if (opts.nearest) {
    t.magFilter = THREE.NearestFilter;
  }
  if (opts.mipmaps === false) t.generateMipmaps = false;
  if (cacheKey) texCache.set(cacheKey, t);
  return t;
}

/** Speckle / grime overlay helper for canvas textures. */
export function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, r: Rng, count: number, colors: string[], size = [1, 3]) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(r() * colors.length)];
    const s = size[0] + r() * (size[1] - size[0]);
    ctx.fillRect(r() * w, r() * h, s, s);
  }
}
