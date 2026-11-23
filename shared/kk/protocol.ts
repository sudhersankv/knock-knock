// KNOCK KNOCK — network protocol (JSON over one WebSocket per player, path /ws).
// Server is authoritative for everything except the human's own position (client sends it, server clamps to side).
import type { Side, V2 } from './layout';

export type LockId = 'codex' | 'pulse' | 'common';
export type LockStatus = 'locked' | 'waiting' | 'open' | 'failed';
export type Agenda = 'faithful' | 'poet' | 'jealous' | 'literalist' | 'gossip';
export type ActorKind = 'human' | 'companion' | 'gatekeeper' | 'scout';
/** Animation state names. Humans: idle|walk|interact|wave. Companions: idle|walk|listen|think|squeeze|deliver|sulk|read. */
export type Anim = 'idle' | 'walk' | 'interact' | 'wave' | 'listen' | 'think' | 'squeeze' | 'deliver' | 'sulk' | 'read';
export type CompanionStatus = 'following' | 'listening' | 'thinking' | 'walking' | 'reading' | 'chamber' | 'returning' | 'delivering';

export interface ActorState {
  id: string;
  kind: ActorKind;
  /** 'C' = inside the chamber (client draws as silhouette behind the keyhole glow). */
  side: Side | 'C';
  p: [number, number, number];
  ry: number;
  anim: Anim;
  name?: string;
  color?: number;
  /** 0..1 squeeze progress for companions passing the keyhole. */
  squeeze?: number;
}

export interface ObjInfo {
  id: string; // "A:t3"
  kind: 'thread' | 'codex' | 'legend' | 'pulse' | 'takes' | 'terminal';
  label: string; // short floating label
  pos: V2;
}

export interface LockInfo {
  id: LockId;
  title: string;
  /** Side-specific text shown at this side's terminal. */
  prompt: string;
  /** True if this side's terminal enters the answer for this lock. */
  enterHere: boolean;
  input: 'word' | 'runes' | 'take' | 'none';
  /** For runes/take inputs: choices shown on this side (ids are side-specific symbols). */
  options?: { id: string; label: string; glyph?: string }[];
  /** For runes: how many to pick, in order. */
  pick?: number;
  status: LockStatus;
  partnerStatus?: string;
}

// ---- object contents (sent on 'read') ----
export type ObjContent =
  | { kind: 'thread'; id: string; title: string; submolt: string; author: string; body: string; url: string; upvotes: number; comments: number; vocab: string[] }
  | { kind: 'codex'; id: string; title: string; author: string; url: string; postId: string; lines: string[]; showLineNumbers: boolean }
  | { kind: 'legend'; id: string; runes: { glyph: string; submolt: string }[] }
  | { kind: 'pulse'; id: string; snapshotAt: string; bars: { submolt: string; activity: number }[] }
  | { kind: 'takes'; id: string; takes: { id: string; glyph: string; question: string }[] }
  | { kind: 'terminal'; id: string };

// ---- client -> server ----
export type C2S =
  | { t: 'hello'; codename?: string; takes: Record<string, number>; interests: string[]; matchCode?: string; demo?: boolean }
  | { t: 'move'; p: V2; ry: number; anim: Anim }
  | { t: 'tell'; text: string } // instruction to your own companion
  | { t: 'send_read'; objectId: string } // send companion to read a thread
  | { t: 'read'; objectId: string } // human opens an object -> server replies 'object'
  | { t: 'lock_submit'; lockId: LockId; answer: string | string[] }
  | { t: 'rtc'; data: unknown }
  | { t: 'hangup' }
  | { t: 'next' }
  | { t: 'report' };

// ---- server -> client ----
export interface RevealEntry {
  t: number;
  from: Side;
  said: string; // what the human told their companion
  sentWords: string[]; // what their companion carried into the chamber
  deliveredWords: string[]; // what the other companion delivered
  agendas: [Agenda, Agenda]; // [sender companion, receiver companion]
  reasons: string[];
}
export interface FeedItem {
  t: number;
  actor: string; // display name e.g. "Gatekeeper", "Your companion (Pip)"
  action: string;
  reason: string;
  side?: Side | 'C';
}

export type S2C =
  | { t: 'welcome'; id: string; codename: string; debates: { id: string; question: string }[]; interests: string[] }
  | { t: 'queued'; position: number; code?: string }
  | {
      t: 'matched';
      roomId: string;
      side: Side;
      codename: string;
      color: number;
      partner: { codename: string; color: number };
      difficulty: 'easy' | 'medium' | 'hard';
      budget: number;
      agendaHint: string;
      companion: { id: string; name: string };
      objects: ObjInfo[];
      locks: LockInfo[];
      vocab: string[];
      roundSeconds: number;
    }
  | { t: 'state'; time: number; actors: ActorState[] }
  | { t: 'object'; content: ObjContent }
  | { t: 'vocab'; words: string[]; added: string[] }
  | { t: 'companion'; status: CompanionStatus; budget: number; vocabCount: number }
  | { t: 'bubble'; actorId: string; name: string; words: string[]; text: string; voice?: string; kind: 'delivery' | 'line' }
  | { t: 'feed'; item: FeedItem }
  | { t: 'chamber'; busy: boolean; talkers: string[] }
  | { t: 'lock_state'; locks: LockInfo[]; opened: number }
  | { t: 'world_event'; kind: 'rekey' | 'budget' | 'mercy' | 'leak'; lockId?: LockId; budget?: number; reason: string }
  | { t: 'unlock'; debate: { question: string; you: number; them: number } | null; callSeconds: number; offerer: boolean }
  | { t: 'rtc'; data: unknown }
  | { t: 'call_end'; reason: string }
  | { t: 'reveal'; timeline: RevealEntry[]; chamber: { t: number; from: string; text: string }[]; agendas: Record<Side, Agenda>; worldEvents: FeedItem[]; unlockSeconds: number | null }
  | { t: 'partner_left' }
  | { t: 'toast'; text: string };

export const STATE_HZ = 15;
