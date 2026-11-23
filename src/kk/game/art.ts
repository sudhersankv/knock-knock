// Single art import point (real art). To fall back to placeholder primitives, re-export from './artStub'.
import * as characters from '../art/characters';
export { createStage, setQuality } from '../art/stage';
export { buildWorld, CHAMBER_Y } from '../art/world';
export { createFx } from '../art/fx';
export const rigs = characters.rigs;
/** Async asset preload (skinned GLBs) if the art module provides one. Await before buildWorld. */
export const loadArt: () => Promise<void> = (characters as unknown as { loadArt?: () => Promise<void> }).loadArt ?? (async () => {});
