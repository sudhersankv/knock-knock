// Interfaces between the big modules. Workstreams build against these so they plug together.
import type * as THREE from 'three';
import type { AnimMode, CharacterLook, MatchInfo, PlayerInfo, PlayerState, TagRecord } from '../shared/protocol';

// ---------------------------------------------------------------- world / level
/** World units are meters. +Y up. Ground plane at y = 0. */
export interface RailDef {
  /** Polyline in world space (at least 2 points). Player grinds along the top of it. */
  points: THREE.Vector3[];
}

export interface SpotDef {
  id: string;
  /** Center of the paintable area, on the wall surface (world space). */
  position: THREE.Vector3;
  /** Outward wall normal (horizontal for walls, up for floor pieces). */
  normal: THREE.Vector3;
  /** Width/height of the piece in meters. */
  size: [number, number];
  /** Big pieces need the crew: worth more, bigger color restore radius. */
  big: boolean;
  district: string;
}

export interface Level {
  /** Everything visual. Added to the scene by the game. */
  root: THREE.Group;
  /**
   * World-space meshes used ONLY for collision (merged into a BVH by the game).
   * Can be simplified/invisible. Must include ground, buildings, ramps, props you can't pass through.
   * Ramps/quarter pipes must be real sloped geometry so the player can ride them.
   */
  collision: THREE.Mesh[];
  rails: RailDef[];
  spots: SpotDef[];
  spawns: THREE.Vector3[];
  /** Approx playable bounds (for minimap / kill-plane). */
  bounds: THREE.Box3;
  /** Animate ambient stuff (blimp, flickering signs, traffic lights...). */
  update(dt: number, time: number): void;
}

// ---------------------------------------------------------------- character
export interface AnimInput {
  mode: AnimMode;
  /** Horizontal speed m/s (0..~16). */
  speed: number;
  /** Vertical velocity m/s. */
  vy: number;
  /** -1..1 carve lean (turning). */
  lean: number;
  /** True for one frame when a trick is popped (air spin flourish). */
  trick?: boolean;
}

export interface CharacterRig {
  /** Root group: feet at y=0, faces +Z. Add to scene and set position/rotation.y yourself. */
  root: THREE.Group;
  /** Position of the spray can nozzle (world) for paint particles. */
  getNozzleWorld(out: THREE.Vector3): THREE.Vector3;
  update(dt: number, input: AnimInput): void;
  setLook(look: CharacterLook): void;
  dispose(): void;
}

// ---------------------------------------------------------------- HUD / UI
export interface LobbyResult {
  name: string;
  look: CharacterLook;
}

export interface HudApi {
  /** Shows title/lobby screen; resolves when player hits PLAY. */
  showLobby(defaults: LobbyResult): Promise<LobbyResult>;
  hideLobby(): void;
  setScore(score: number): void;
  setTagProgress(tagged: number, total: number): void;
  setTimer(secondsLeft: number): void;
  /** Hold-to-spray ring. null hides it. */
  setSprayProgress(p: number | null): void;
  /** Context prompt e.g. "HOLD [E] TO TAG". null hides. */
  setPrompt(text: string | null): void;
  /** Big comic pop text (trick names, "TAGGED!"). */
  pop(text: string, color?: number): void;
  /** Feed line (left side): "<b>NOVA</b> tagged THE WATER TOWER". */
  feed(html: string): void;
  setPlayers(players: PlayerInfo[], selfId: string): void;
  setMatch(m: MatchInfo): void;
  /** Off-screen / on-screen marker for spots: screen coords in px, or null to hide. */
  setMarkers(markers: { id: string; x: number; y: number; onScreen: boolean; dist: number; big: boolean; tagged: boolean }[]): void;
  update(dt: number): void;
}

// ---------------------------------------------------------------- network
export interface NetEvents {
  join: (p: PlayerInfo) => void;
  leave: (id: string) => void;
  snap: (time: number, states: PlayerState[]) => void;
  tagged: (tag: TagRecord, score: number) => void;
  match: (m: MatchInfo) => void;
  emote: (id: string, e: string) => void;
  disconnect: () => void;
}

export interface NetApi {
  readonly selfId: string;
  readonly online: boolean;
  /** Connects and sends hello. Falls back to offline single-player if the server is unreachable. */
  connect(name: string, look: CharacterLook): Promise<{ id: string; players: PlayerInfo[]; tags: TagRecord[]; match: MatchInfo }>;
  sendState(s: Omit<PlayerState, 'id'>): void;
  sendTag(spotId: string, pos: [number, number, number]): void;
  startMatch(): void;
  on<K extends keyof NetEvents>(ev: K, cb: NetEvents[K]): void;
  /** Server time estimate in ms (for interpolation). */
  serverNow(): number;
}
