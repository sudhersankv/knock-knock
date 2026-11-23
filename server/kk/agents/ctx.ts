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
  /** Called by a companion that has entered the chamber carrying a message. */
  chamberArrive(c: Companion): void;
  worldEvent(kind: 'rekey' | 'budget' | 'mercy' | 'leak', reason: string, extra?: { lockId?: LockId; budget?: number }): void;
  setBudget(n: number): void;
  lockSnapshot(): void;
  takeLlmCall(): boolean;
  logEvent(e: { actor: string; agenda?: Agenda; action: string; target?: string; wordsIn?: string[]; wordsOut?: string[]; reason: string; caught?: boolean }): void;
  onRelay(fromSide: Side, words: string[]): void;
}
