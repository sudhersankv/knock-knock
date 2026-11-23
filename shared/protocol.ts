// Wire protocol. JSON over a single WebSocket at /ws.
// Movement is client-authoritative (co-op, no cheating concerns);
// tags, scores and the match clock are server-authoritative.

export type Vec3 = [number, number, number];

/** Animation modes the character rig understands. */
export type AnimMode = 'idle' | 'skate' | 'air' | 'grind' | 'spray' | 'wallride' | 'land';

export type HatStyle = 'cap' | 'beanie' | 'mohawk' | 'buns' | 'none';

export interface CharacterLook {
  skin: number;
  hair: number;
  top: number;
  bottom: number;
  shoes: number;
  /** Crew color: used on accents, spray can, tag paint. */
  accent: number;
  hat: HatStyle;
  /** Drives small variations (proportions, accessories). */
  seed: number;
}

export interface PlayerInfo {
  id: string;
  name: string;
  look: CharacterLook;
  score: number;
}

/** Compact per-player movement state. */
export interface PlayerState {
  id: string;
  p: Vec3;
  /** Yaw (radians). */
  r: number;
  /** Horizontal speed (m/s), drives the anim blend. */
  v: number;
  /** Vertical velocity (m/s). */
  vy: number;
  a: AnimMode;
  /** Lean (-1..1) for carving. */
  l: number;
}

export interface TagRecord {
  spotId: string;
  by: string;
  /** Seed so every client draws the same graffiti piece. */
  seed: number;
  at: number;
}

export type MatchPhase = 'lobby' | 'running' | 'over';

export interface MatchInfo {
  phase: MatchPhase;
  /** Seconds remaining in the night. */
  timeLeft: number;
}

// ---------- client -> server ----------
export type ClientMsg =
  | { t: 'hello'; name: string; look: CharacterLook }
  | { t: 'state'; s: Omit<PlayerState, 'id'> }
  | { t: 'tag'; spotId: string; pos: Vec3 }
  | { t: 'start' }
  | { t: 'emote'; e: string }
  | { t: 'ping'; c: number };

// ---------- server -> client ----------
export type ServerMsg =
  | { t: 'welcome'; id: string; players: PlayerInfo[]; tags: TagRecord[]; match: MatchInfo }
  | { t: 'join'; player: PlayerInfo }
  | { t: 'leave'; id: string }
  | { t: 'snap'; time: number; states: PlayerState[] }
  | { t: 'tagged'; tag: TagRecord; score: number }
  | { t: 'match'; match: MatchInfo }
  | { t: 'emote'; id: string; e: string }
  | { t: 'pong'; c: number; s: number }
  | { t: 'error'; msg: string };
