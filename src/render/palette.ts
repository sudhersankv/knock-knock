// The one place colors live. Every asset pulls from here so the city reads as one piece.
// Direction: dusk on Thanksgiving night. Hot saturated pops against purple shadows.

export const PAL = {
  // ink
  ink: 0x170b26, // outline + deepest shadow (purple-black, never pure black)
  inkSoft: 0x2b1745,

  // sky / atmosphere
  skyTop: 0x1b0f4a,
  skyMid: 0x7a2bb8,
  skyHorizon: 0xff5e8a,
  skyGlow: 0xffb347,
  sun: 0xfff1a8,
  fog: 0xc65a9a,

  // lighting
  sunLight: 0xffd6a8,
  hemiSky: 0xb7a6ff, // fills shadows: lavender
  hemiGround: 0x5a2a6e, // bounce from below: plum
  rim: 0xffe3f6,

  // signature pops
  magenta: 0xff2e88,
  cyan: 0x19e3ff,
  yellow: 0xffe11a,
  orange: 0xff7a1a,
  violet: 0x8a4bff,
  green: 0x3dff6e,
  red: 0xff4040,
  white: 0xfff8f0,

  // city materials
  asphalt: 0x3a3352,
  asphaltLight: 0x4a4266,
  roadPaint: 0xffe9a8,
  sidewalk: 0xb9a8c9,
  curb: 0xd8c8e0,
  concrete: 0xa99bbd,
  concreteDark: 0x6e6188,
  brick: 0xc8553d,
  brickDark: 0x8e3a2c,
  stucco: 0xf0b6a0,
  teal: 0x2bb5a8,
  tealDark: 0x1a7a7a,
  mint: 0x9ff0d0,
  peach: 0xffb08a,
  lilac: 0xc9a2ff,
  metal: 0x8f9bb3,
  metalDark: 0x4d5670,
  rust: 0xb5552b,
  wood: 0xb87a4b,
  woodDark: 0x7a4a2c,
  glassDay: 0x6fd6ff,
  windowLit: 0xffd36e,
  windowDim: 0x3b2f66,
  leaf: 0x3fcf6a,
  leafDark: 0x1f8a52,
  grassPop: 0x7cff5a,

  // BLANDCO (the villain corp) brand
  blandBeige: 0xd9c9a8,
  blandBrown: 0x8a6b4a,
  blandCream: 0xf3e8d0,

  // character defaults
  skinTones: [0xffd2b0, 0xf0b48a, 0xc98a5e, 0x9a5f3c, 0x6b3f26, 0x4a2a1a],
  hairColors: [0x1a1020, 0x3d2416, 0x8a4b22, 0xf2c94c, 0xff2e88, 0x19e3ff, 0x8a4bff, 0xf8f8f8],
} as const;

export const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
