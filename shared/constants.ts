// Shared between client and server. Keep free of DOM / three.js imports.

export const NET_PORT = 8787;
/** Server snapshot rate (Hz). */
export const SERVER_TICK_HZ = 20;
/** Client state upload rate (Hz). */
export const CLIENT_SEND_HZ = 20;
/** Remote players are rendered this far in the past for smooth interpolation (ms). */
export const INTERP_DELAY_MS = 120;

export const MAX_PLAYERS = 8;
/** One night = one match. */
export const MATCH_SECONDS = 8 * 60;
/** Seconds a player must hold spray on a spot to finish a tag. */
export const TAG_HOLD_SECONDS = 1.4;
/** Max distance from a spot to be allowed to tag it (validated on the server). */
export const TAG_RANGE = 4.5;

export const POINTS = {
  tag: 500,
  bigTag: 1500,
} as const;

/** Crew colors players can pick in the lobby (hex numbers). */
export const CREW_COLORS = [
  0xff2e88, // hot magenta
  0x19e3ff, // electric cyan
  0xffe11a, // acid yellow
  0xff7a1a, // blaze orange
  0x8a4bff, // ultra violet
  0x3dff6e, // toxic green
  0xff4040, // hydrant red
  0xffffff, // chalk white
] as const;
