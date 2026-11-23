// KNOCK KNOCK — world layout. Single source of truth for coordinates.
// Used by the client world builder (art), the client game (interaction), and the server (agent movement).
// World units = metres. +Y up. The wall runs along the Z axis at x = 0. Side A is x < 0, side B is x > 0.
// Side B is side A mirrored across x = 0 (negate x).

export type Side = 'A' | 'B';
export type V2 = [number, number]; // [x, z]

export const WALL = { halfThickness: 2, halfLength: 24, height: 7 };
export const DOOR = { halfWidth: 3, height: 6, z: 0 };
/** Each side's playable area (side A; mirror for B). */
export const SIDE_BOUNDS = { minX: -34, maxX: -2.3, minZ: -20, maxZ: 20 };

export const INTERACT_RADIUS = 2.6;
export const HUMAN_SPEED = 5.2;
export const COMPANION_SPEED = 4.2;

/** Side-A anchors. Use at(side, key) to get either side. */
const A_ANCHORS = {
  spawn: [-6, 4] as V2,
  companionSpawn: [-5, 5.5] as V2,
  /** Where a companion stands to squeeze into the keyhole (in front of the door). */
  keyholeApproach: [-2.9, 0.6] as V2,
  /** Keyhole on this side's door face (x, z); height KEYHOLE_Y. */
  keyhole: [-2.05, 0] as V2,
  terminal: [-4.5, -4.8] as V2,
  codex: [-13, -9] as V2,
  /** Side A: rune legend board. Side B: pulse board. */
  board: [-16, 6] as V2,
  /** Common Ground take wall (the 5 debates in this side's shuffled order). */
  takes: [-8.5, 12] as V2,
  /** 6 thread boards (Moltbook posts) that companions/humans can read. */
  t1: [-20, -4] as V2,
  t2: [-24, 4] as V2,
  t3: [-19, 13] as V2,
  t4: [-27, -12] as V2,
  t5: [-11, 17] as V2,
  t6: [-28, 14] as V2,
  /** Sponsor-agent (Scout) patrol loop on this side. */
  patrol: [[-8, -12], [-22, -14], [-30, 0], [-24, 16], [-10, 16], [-12, 0]] as V2[],
};
export type AnchorKey = Exclude<keyof typeof A_ANCHORS, 'patrol'>;
export const KEYHOLE_Y = 0.7;
export const THREAD_SLOTS = ['t1', 't2', 't3', 't4', 't5', 't6'] as const;

export function at(side: Side, key: AnchorKey): V2 {
  const [x, z] = A_ANCHORS[key];
  return side === 'A' ? [x, z] : [-x, z];
}
export function patrol(side: Side): V2[] {
  return A_ANCHORS.patrol.map(([x, z]) => (side === 'A' ? [x, z] : [-x, z]) as V2);
}
/** The chamber is inside the wall, centred on the door. Agents in the chamber stand here. */
export const CHAMBER = {
  companionA: [-0.9, 0.9] as V2,
  companionB: [0.9, 0.9] as V2,
  gatekeeper: [0, -1.2] as V2,
};

/** Object ids. Each side has its own copy: `${side}:${slot}` e.g. "A:codex", "B:t3". */
export type ObjectSlot = 'codex' | 'board' | 'takes' | 'terminal' | (typeof THREAD_SLOTS)[number];
export const objectId = (side: Side, slot: ObjectSlot) => `${side}:${slot}`;
export function objectPos(id: string): V2 {
  const [side, slot] = id.split(':') as [Side, ObjectSlot];
  return at(side, slot as AnchorKey);
}
export function sideOf(x: number): Side {
  return x < 0 ? 'A' : 'B';
}

export const SIDE_COLOR: Record<Side, number> = { A: 0x2ec4b6, B: 0xff6b5b };
export const PALETTE = {
  dusk: 0x1e1b2e,
  stone: 0x6b6a7a,
  moss: 0x5e7d4e,
  teal: 0x2ec4b6,
  coral: 0xff6b5b,
  glow: 0xffc857,
  magic: 0x7b5cff,
};
