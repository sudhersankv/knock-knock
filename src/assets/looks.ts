import type { CharacterLook, HatStyle } from '../../shared/protocol';
import { CREW_COLORS } from '../../shared/constants';
import { PAL } from '../render/palette';
import { rng, pick } from '../render/textures';

/** Hoodie / jacket colors that read well under dusk light. */
const TOPS = [0xff2e88, 0x19e3ff, 0xffe11a, 0xff7a1a, 0x8a4bff, 0x3dff6e, 0xfff8f0, 0x2b1745, 0x2bb5a8, 0xff4040, 0xc9a2ff, 0x9ff0d0] as const;
const BOTTOMS = [0x2b1745, 0x3a3352, 0x1f2f6e, 0x6e3b1f, 0x4a4266, 0x2bb5a8, 0x8a6b4a, 0x1a1020, 0xc9a2ff, 0xff7a1a] as const;
const SHOES = [0xfff8f0, 0x170b26, 0xff2e88, 0x19e3ff, 0xffe11a, 0x8a4bff, 0xff4040, 0x3dff6e] as const;
const HATS: readonly HatStyle[] = ['cap', 'beanie', 'mohawk', 'buns', 'none'];

/** Deterministic random look. Same seed = same skater on every client. */
export function randomLook(seed: number): CharacterLook {
  const r = rng(seed * 7919 + 17);
  const accent = pick(r, CREW_COLORS);
  let top: number = pick(r, TOPS);
  if (top === accent) top = pick(r, TOPS);
  return {
    skin: pick(r, PAL.skinTones),
    hair: pick(r, PAL.hairColors),
    top,
    bottom: pick(r, BOTTOMS),
    shoes: pick(r, SHOES),
    accent,
    hat: pick(r, HATS),
    seed: seed >>> 0,
  };
}

export interface PresetLook {
  name: string;
  tagline: string;
  look: CharacterLook;
}

/** Six hand-tuned crew members for the lobby picker. */
export const PRESET_LOOKS: PresetLook[] = [
  {
    name: 'NOVA',
    tagline: 'paints faster than BLANDCO can beige',
    look: { skin: 0x9a5f3c, hair: 0xff2e88, top: 0x19e3ff, bottom: 0x2b1745, shoes: 0xfff8f0, accent: 0xff2e88, hat: 'buns', seed: 11 },
  },
  {
    name: 'GRAVY',
    tagline: 'skipped dinner. brought 40 cans.',
    look: { skin: 0xf0b48a, hair: 0x3d2416, top: 0xff7a1a, bottom: 0x1f2f6e, shoes: 0xffe11a, accent: 0xffe11a, hat: 'cap', seed: 22 },
  },
  {
    name: 'DRIP',
    tagline: 'every wall is a canvas. every cop is a critic.',
    look: { skin: 0x6b3f26, hair: 0x19e3ff, top: 0x170b26 as number, bottom: 0x3a3352, shoes: 0x19e3ff, accent: 0x19e3ff, hat: 'mohawk', seed: 33 },
  },
  {
    name: 'PIXIE',
    tagline: 'smallest skates, loudest tags',
    look: { skin: 0xffd2b0, hair: 0xf2c94c, top: 0xc9a2ff, bottom: 0x2bb5a8, shoes: 0xff2e88, accent: 0x8a4bff, hat: 'beanie', seed: 44 },
  },
  {
    name: 'BOLT',
    tagline: 'has never once used the brake',
    look: { skin: 0xc98a5e, hair: 0x1a1020, top: 0xffe11a, bottom: 0x170b26, shoes: 0x170b26, accent: 0x3dff6e, hat: 'none', seed: 55 },
  },
  {
    name: 'MOCHI',
    tagline: 'sprays in perfect circles. scary.',
    look: { skin: 0x4a2a1a, hair: 0xf8f8f8, top: 0xff4040, bottom: 0x4a4266, shoes: 0xfff8f0, accent: 0xfff8f0, hat: 'cap', seed: 66 },
  },
];
