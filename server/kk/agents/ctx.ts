// What agents can see/do on their room. Implemented by Room.
import type { Side, V2 } from '../../../shared/kk/layout';
import type { Agenda, LockId, S2C, FeedItem } from '../../../shared/kk/protocol';
import type { LockSet } from '../locks';
import type { Companion } from './companion';
import type { AgentStats } from '../../../shared/kk/pack';

export interface RoomCtx {
  id: string;
  round: number;
  demo: boolean;
  /** Solo practice vs an in-process partner bot (tutorial pacing, gentler Moderator). */
  practice: boolean;
  difficulty: string;
  budget: number;
  locks: LockSet;
  stats: AgentStats | null;
  time(): number;
  remaining(): number;
  humanPos(side: Side): V2 | null;
  companion(side: Side): Companion;
  send(side: Side, msg: S2C): void;
  broadcast(msg: S2C): void;
  feed(side: Side | 'both', item: Omit<FeedItem, 't'>): void;
  chamberLine(from: 'gatekeeper' | 'companionA' | 'companionB' | 'scout', display: string, text: string): void;
  setChamberBusy(): void;
  /** Moderator inspection of a courier crossing the chamber; returns the words that survive. */
  inspect(c: Companion, words: string[], from: Side): { words: string[]; reasons: string[] };
  recordTrip(t: { from: Side; said: string; claimed: string[]; sent: string[]; delivered: string[]; reasons: string[]; agenda: Agenda; reply: boolean; auto: boolean }): void;
  worldEvent(kind: 'rekey' | 'budget' | 'mercy' | 'leak' | 'ban' | 'unban', reason: string, extra?: { lockId?: LockId; budget?: number; word?: string }): void;
  /** Live set of words couriers may not use (shared with every courier's Vocab). */
  banned: Set<string>;
  /** Moderator bans one extra word mid-round. */
  banWord(word: string, reason: string): void;
  setBudget(n: number): void;
  lockSnapshot(): void;
  takeLlmCall(): boolean;
  logEvent(e: { actor: string; agenda?: Agenda; action: string; target?: string; wordsIn?: string[]; wordsOut?: string[]; reason: string; caught?: boolean }): void;
  onRelay(fromSide: Side, words: string[]): void;
}
