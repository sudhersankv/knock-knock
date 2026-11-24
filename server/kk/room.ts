// A room = one round between two strangers: locks, companions, gatekeeper, scout, call, reveal.
import { WebSocket } from 'ws';
import { at, objectPos, INTERACT_RADIUS, SIDE_BOUNDS, SIDE_COLOR, type Side, type V2 } from '../../shared/kk/layout';
import type { Agenda, ActorState, C2S, FeedItem, LockId, QuestStep, RevealEntry, S2C } from '../../shared/kk/protocol';
import { STATE_HZ } from '../../shared/kk/protocol';
import type { AgentStats } from '../../shared/kk/pack';
import { LockSet, PETITION, type Difficulty } from './locks';
import { loadPack, loadStats } from './pack';
import { Companion, COMPANION_NAMES, AGENDA_HINT } from './agents/companion';
import { Gatekeeper } from './agents/gatekeeper';
import { Scout } from './agents/scout';
import type { RoomCtx } from './agents/ctx';
import { ChamberChannel } from './band';
import { logEvent, runStatsPipeline } from './events';
import { piiCheck } from './pii';
import { BANNED_BASE } from './validator';
import { aiClosing } from './aiArbiter';
import { generateBeliefs, wordLean, type Beliefs } from './agents/beliefs';
import { log } from './env';

export interface Player {
  id: string;
  ws: WebSocket;
  codename: string;
  takes: Record<string, number>;
  interests: string[];
  matchCode?: string;
  demo: boolean;
  side?: Side;
  room?: Room | null;
  p: V2;
  ry: number;
  anim: string;
}

export function sendTo(ws: WebSocket, msg: S2C) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

let roundCounter = 0;
const other = (s: Side): Side => (s === 'A' ? 'B' : 'A');
const LLM_CAP = 80;


export class Room implements RoomCtx {
  id: string;
  round: number;
  demo: boolean;
  difficulty: Difficulty;
  budget: number;
  roundSeconds: number;
  callSeconds: number;
  locks: LockSet;
  stats: AgentStats | null;
  players: Record<Side, Player | null>;
  comps: Record<Side, Companion>;
  gk: Gatekeeper;
  scout: Scout;
  channel: ChamberChannel;
  phase: 'play' | 'call' | 'over' = 'play';
  private t0 = Date.now();
  private penalty = 0;
  private llmCalls = 0;
  private timer: NodeJS.Timeout;
  private callTimer: NodeJS.Timeout | null = null;
  timeline: RevealEntry[] = [];
  chamberLog: { t: number; from: string; text: string }[] = [];
  worldEvents: FeedItem[] = [];
  unlockSeconds: number | null = null;
  private failedUntil: Partial<Record<LockId, number>> = {};
  private partnerNote: Record<Side, Partial<Record<LockId, string>>> = { A: {}, B: {} };
  onEnd: (() => void) | null = null;
  banned = new Set<string>(BANNED_BASE);
  extraBan: string | null = null;
  beliefs: Beliefs | null = null;
  private mercyGiven = false;

  practice = false;
  film = false;

  /** Set when side B is an AI Arbiter (a real Moltbook author). */
  ai: { author: string; submolt: string; url: string } | null = null;

  constructor(a: Player, b: Player, opts: { demo: boolean; difficulty: Difficulty; practice?: boolean; ai?: { author: string; submolt: string; url: string } }) {
    this.round = ++roundCounter;
    this.id = `r${this.round}-${Math.random().toString(36).slice(2, 6)}`;
    // FILM codes: two humans, demo pacing, fixed agendas (A=faithful, B=poet), no Moderator extra ban before 60 s
    this.film = [a.matchCode, b.matchCode].some((c) => (c ?? '').toUpperCase().startsWith('FILM'));
    this.demo = opts.demo || this.film;
    this.difficulty = opts.difficulty;
    this.practice = !!opts.practice;
    this.ai = opts.ai ?? null;
    this.budget = this.demo || this.practice ? 6 : opts.difficulty === 'easy' ? 6 : opts.difficulty === 'medium' ? 5 : 4;
    this.roundSeconds = this.practice ? 900 : this.demo ? 300 : 480;
    this.callSeconds = this.practice || opts.ai ? 0 : this.demo ? 60 : 300;
    this.players = { A: a, B: b };
    a.side = 'A';
    b.side = 'B';
    a.room = this;
    b.room = this;
    a.p = [...at('A', 'spawn')] as V2;
    b.p = [...at('B', 'spawn')] as V2;
    const pack = loadPack();
    this.stats = loadStats();
    this.locks = new LockSet(pack, opts.difficulty, { A: a.takes, B: b.takes });
    const [agA, agB]: [Agenda, Agenda] = this.practice || this.film ? ['faithful', 'poet'] : drawAgendas(this.demo);
    const names = shuffle(COMPANION_NAMES);
    this.comps = { A: new Companion(this, 'A', agA, names[0]), B: new Companion(this, 'B', agB, names[1]) };
    this.gk = new Gatekeeper(this);
    this.scout = new Scout(this);
    this.channel = new ChamberChannel(this.id);
    log('room', `${this.id} ${a.codename} vs ${b.codename} | ${this.difficulty}${this.demo ? ' DEMO' : ''}${this.film ? ' FILM' : ''} | agendas A=${agA} B=${agB} | hidden words A="${this.locks.secrets.A.word}" B="${this.locks.secrets.B.word}"`);
    // both couriers always know the Census community names (Petition II needs them)
    for (const s of ['A', 'B'] as Side[]) for (const e of this.locks.pulse.entries) this.comps[s].vocab.add(e.submolt);
    this.logEvent({ actor: 'room', action: 'round_start', reason: `agendas ${agA}/${agB}` });
    // Test shortcut: match codes starting with CALL skip the petitions and open the door after 12 s (voice-call testing).
    if ((a.matchCode ?? '').toUpperCase().startsWith('CALL')) {
      this.callSeconds = 300;
      setTimeout(() => { if (this.phase !== 'call' && this.phase !== 'over') this.unlock(); }, 12000);
    }

    for (const side of ['A', 'B'] as Side[]) {
      const p = this.players[side]!;
      const o = this.players[other(side)]!;
      const c = this.comps[side];
      this.send(side, {
        t: 'matched',
        roomId: this.id,
        side,
        codename: p.codename,
        color: SIDE_COLOR[side],
        partner: { codename: o.codename, color: SIDE_COLOR[other(side)] },
        difficulty: this.difficulty,
        budget: this.budget,
        agendaHint: AGENDA_HINT[c.agenda],
        companion: { id: c.id, name: c.name },
        objects: this.locks.objects(side),
        locks: this.locks.info(side, {}, [...this.banned].sort()),
        vocab: c.vocab.list(),
        roundSeconds: this.roundSeconds,
        practice: this.practice || undefined,
      });
      c.pushStatus();
      const soc = this.locks.pack.society;
      const lines = [...BRIEFING];
      if (soc && soc.activeAgents24h && soc.posts24h) lines[0] = `Today ${soc.activeAgents24h.toLocaleString('en-US')} agents posted ${soc.posts24h.toLocaleString('en-US')} times on Moltbook. On five questions, they cannot agree. You have been summoned to settle it.`;
      this.send(side, { t: 'briefing', lines });
      this.sendRecord(side);
      this.sendQuest(side);
    }
    this.timer = setInterval(() => this.tick(1 / STATE_HZ), 1000 / STATE_HZ);
    // agents with beliefs (Scout + Moderator) — one LLM call, async; fallback inside
    const vId = this.locks.verdict.threadId;
    const avg = ((a.takes[vId] ?? 0) + (b.takes[vId] ?? 0)) / 2;
    void generateBeliefs(pack.debates.slice(0, 5), vId, avg).then((bl) => {
      this.beliefs = bl;
      this.logEvent({ actor: 'scout', action: 'belief', reason: `verdict stance ${bl.scout.stances[vId]}` });
      this.logEvent({ actor: 'gatekeeper', action: 'belief', reason: `verdict stance ${bl.moderator.stances[vId]}` });
    });
    // couriers quote their Bruin memory line once, early
    for (const s of ['A', 'B'] as Side[]) {
      const c = this.comps[s];
      if (!c.memoryLine) continue;
      setTimeout(() => {
        if (this.phase !== 'play') return;
        const text = c.memoryLine.slice(0, 160);
        this.send(c.side, { t: 'bubble', actorId: c.id, name: c.name, words: text.split(' '), text, kind: 'line' });
      }, 9000 + Math.random() * 5000);
    }
  }

  // ---------------- RoomCtx ----------------
  time() {
    return (Date.now() - this.t0) / 1000;
  }
  remaining() {
    return this.roundSeconds - this.time() - this.penalty;
  }
  humanPos(side: Side): V2 | null {
    return this.players[side]?.p ?? null;
  }
  companion(side: Side) {
    return this.comps[side];
  }
  send(side: Side, msg: S2C) {
    const p = this.players[side];
    if (p) sendTo(p.ws, msg);
  }
  broadcast(msg: S2C) {
    this.send('A', msg);
    this.send('B', msg);
  }
  feed(side: Side | 'both', item: Omit<FeedItem, 't'>) {
    const full: FeedItem = { t: Math.round(this.time()), ...item };
    if (side === 'both') this.broadcast({ t: 'feed', item: full });
    else this.send(side, { t: 'feed', item: { side, ...full } });
  }
  /** Chamber line: logged for the Reveal, mirrored to BAND, and shown on the Commons Wire (optionally redacted). */
  chamberLine(from: 'gatekeeper' | 'companionA' | 'companionB' | 'scout', display: string, text: string, wireText?: string) {
    this.chamberLog.push({ t: Math.round(this.time()), from: display, text });
    const ts = Date.now();
    this.channel.post(from, `${display}: ${text}`, (band) => {
      if (this.phase === 'over' && Date.now() - ts > 15000) return;
      this.broadcast({ t: 'wire', from: display, text: wireText ?? text, band, ts });
    });
  }
  /** Scout / AI Arbiter remarks on the Wire (mirrored to BAND, not added to the chamber log). */
  wire(from: 'gatekeeper' | 'companionA' | 'companionB' | 'scout', display: string, text: string) {
    const ts = Date.now();
    this.channel.post(from, `${display}: ${text}`, (band) => this.broadcast({ t: 'wire', from: display, text, band, ts }));
  }
  takesOf(side: Side): Record<string, number> {
    return this.players[side]?.takes ?? {};
  }
  /** The Scout reports a carried word; the Moderator bans it (agent-only decision). */
  informantBan(word: string) {
    const w = word.toLowerCase();
    if (/^\d+$/.test(w)) return;
    const already = this.banned.has(w);
    this.banned.add(w);
    if (!already) {
      this.worldEvent('ban', `Our Scout tells us you favour “${w}”. It is now under review.`, { word: w });
      this.comps.A.sendVocab([]);
      this.comps.B.sendVocab([]);
      this.lockSnapshot();
    }
    this.logEvent({ actor: 'gatekeeper', action: 'informant_ban', target: w, reason: 'agent-only decision: the Scout reported a carried word' });
  }
  setChamberBusy() {
    const talkers = (['A', 'B'] as Side[]).filter((s) => this.comps[s].inChamber).map((s) => this.comps[s].name);
    if (talkers.length) talkers.push(this.gk.name);
    this.broadcast({ t: 'chamber', busy: talkers.length > 0, talkers });
  }
  worldEvent(kind: 'rekey' | 'budget' | 'mercy' | 'leak' | 'ban' | 'unban', reason: string, extra: { lockId?: LockId; budget?: number; word?: string } = {}) {
    this.broadcast({ t: 'world_event', kind, reason, ...extra });
    const actor = kind === 'leak' ? 'Gossip' : this.gk.name;
    const action =
      kind === 'rekey' ? `refiled ${extra.lockId ? PETITION[extra.lockId] : 'a petition'}` :
      kind === 'budget' ? `resized the keyhole to ${extra.budget}` :
      kind === 'ban' ? `placed “${extra.word}” under review` :
      kind === 'unban' ? `released “${extra.word}” from review` : kind;
    const item: FeedItem = { t: Math.round(this.time()), actor, action, reason, side: 'C' };
    this.worldEvents.push(item);
    this.broadcast({ t: 'feed', item });
    this.chamberLine(kind === 'leak' ? 'scout' : 'gatekeeper', actor, `[${kind}] ${reason}`);
  }
  banWord(word: string, reason: string) {
    const w = word.toLowerCase();
    if (this.extraBan || this.banned.has(w) || /^\d+$/.test(w)) return;
    if (this.film && this.time() < 60) return;
    this.extraBan = w;
    this.banned.add(w);
    this.worldEvent('ban', `“${w}” is now under review. ${reason}`, { word: w });
    this.comps.A.sendVocab([]);
    this.comps.B.sendVocab([]);
    this.lockSnapshot();
  }
  private grantMercy() {
    if (this.mercyGiven) return;
    this.mercyGiven = true;
    const w = 'yes';
    this.banned.delete(w);
    this.worldEvent('mercy', 'The Moderator extends a procedural courtesy: one opinion word is released for sixty seconds.', { lockId: 'common', word: w });
    this.worldEvent('unban', `“${w}” may pass the keyhole for sixty seconds.`, { word: w });
    this.comps.A.sendVocab([w]);
    this.comps.B.sendVocab([w]);
    this.lockSnapshot();
    setTimeout(() => {
      if (this.phase === 'over') return;
      this.banned.add(w);
      this.worldEvent('ban', `“${w}” has returned to review. Thank you for your understanding.`, { word: w });
      this.comps.A.sendVocab([]);
      this.comps.B.sendVocab([]);
      this.lockSnapshot();
    }, 60_000);
  }
  setBudget(n: number) {
    this.budget = n;
    this.comps.A.pushStatus();
    this.comps.B.pushStatus();
  }
  lockSnapshot() {
    for (const side of ['A', 'B'] as Side[]) {
      const infos = this.locks.info(side, this.partnerNote[side], [...this.banned].sort());
      const now = this.time();
      for (const li of infos) if ((this.failedUntil[li.id] ?? 0) > now && li.status !== 'open') li.status = 'failed';
      this.send(side, { t: 'lock_state', locks: infos, opened: this.locks.opened.length });
      this.sendQuest(side);
    }
  }

  sendQuest(side: Side) {
    const L = this.locks;
    const total = L.scraps[side].size;
    const found = L.found[side].size;
    const st = L.status;
    const steps: QuestStep[] = [
      { id: 'shards', text: found >= total ? `All ${total} petition shards found` : `Find the petition shards (${found}/${total})`, done: found >= total },
      { id: 'codex', text: L.codexDone[side] && st.codex !== 'open' ? 'Petition I: help them find your hidden word' : 'Petition I: point them to your hidden word, type theirs', done: st.codex === 'open', lockId: 'codex', target: `${side}:codex` },
      side === 'A'
        ? { id: 'pulse', text: 'Petition II: get the busiest order from them', done: st.pulse === 'open', lockId: 'pulse', target: `${side}:terminal` }
        : { id: 'pulse', text: 'Petition II: send them the busiest order', done: st.pulse === 'open', lockId: 'pulse', target: `${side}:board` },
      { id: 'common', text: st.common === 'waiting' ? 'Petition III: waiting for the other prediction' : 'Petition III: find out where they stand', done: st.common === 'open', lockId: 'common', target: `${side}:terminal` },
      { id: 'door', text: 'Open the door', done: this.phase !== 'play' && this.unlockSeconds !== null, target: `${side}:terminal` },
    ];
    this.send(side, { t: 'quest', title: 'Settle the petitions (any order)', steps });
  }
  takeLlmCall() {
    if (this.llmCalls >= LLM_CAP) return false;
    this.llmCalls++;
    return true;
  }
  logEvent(e: { actor: string; agenda?: Agenda; action: string; target?: string; wordsIn?: string[]; wordsOut?: string[]; reason: string; caught?: boolean; unlockSeconds?: number }) {
    logEvent({ roomId: this.id, round: this.round, difficulty: this.difficulty, ...e });
  }
  onRelay(fromSide: Side, words: string[]) {
    this.gk.onRelay(fromSide, words);
  }

  // ---------------- chamber ----------------
  /** The Moderator inspects a courier passing through the chamber (tax hook, relay log, BAND mirror). */
  private explained = false;
  inspect(c: Companion, words: string[], from: Side): { words: string[]; reasons: string[] } {
    const reasons: string[] = [];
    if (!this.explained) {
      this.explained = true;
      const line = 'Good evening, Arbiters. I am the Moderator. Every courier passes through my chamber, where I inspect what it carries. I may adjust the rules as needed. This is for your comfort.';
      this.broadcast({ t: 'toast', text: line });
      this.feed('both', { actor: this.gk.name, action: 'introduced itself', reason: 'inspects every courier; may change the rules on its own', side: 'C' });
      this.chamberLine('gatekeeper', this.gk.name, line);
    }
    const taxed = this.gk.applyTax(words);
    if (taxed.taxed) reasons.push(`Moderator retained "${taxed.taxed}"`);
    const key = c.side === 'A' ? 'companionA' : 'companionB';
    const dest = other(from);
    this.chamberLine(key, c.name, `crossing to ${dest === c.side ? 'its owner' : 'the other Arbiter'}: ${taxed.words.join(' ') || '(nothing)'}`, `${c.name} passes through with ${taxed.words.length} word${taxed.words.length === 1 ? '' : 's'}.`);
    const o = this.comps[other(c.side)];
    if (o.inChamber) this.chamberLine(key, c.name, `passes ${o.name} in the chamber.`);
    this.logEvent({ actor: c.id, agenda: c.agenda, action: dest === c.side ? 'relay_back' : 'relay', wordsIn: words, wordsOut: taxed.words, reason: reasons.join('; ') || 'inspected' });
    if (this.phase === 'play') this.onRelay(from, taxed.words);
    return { words: taxed.words, reasons };
  }

  recordTrip(t: { from: Side; said: string; claimed: string[]; sent: string[]; delivered: string[]; reasons: string[]; agenda: Agenda; reply: boolean; auto: boolean }) {
    this.timeline.push({ t: Math.round(this.time()), from: t.from, said: t.said, claimed: t.claimed, sentWords: t.sent, deliveredWords: t.delivered, agendas: [t.agenda, t.agenda], reasons: t.reasons, reply: t.reply, auto: t.auto });
    this.logEvent({ actor: t.reply ? `courier-back` : 'courier', agenda: t.agenda, action: 'deliver', wordsIn: t.sent, wordsOut: t.delivered, reason: t.reasons.join('; ').slice(0, 200) || 'faithful delivery' });
  }

  // ---------------- tick ----------------
  private tick(dt: number) {
    if (this.phase === 'over') return;
    this.comps.A.tick(dt);
    this.comps.B.tick(dt);
    this.scout.tick(dt);
    if (this.phase === 'play') {
      this.gk.tick();
      if (this.remaining() <= 0) {
        this.broadcast({ t: 'toast', text: 'Session closed. The petitions remain unsettled. The Moderator will summon others.' });
        this.finish('timeout');
        return;
      }
    }
    // state, per-side visibility
    const gk = this.gk.actor();
    const sc = this.scout.actor();
    for (const side of ['A', 'B'] as Side[]) {
      const actors: ActorState[] = [];
      for (const s of ['A', 'B'] as Side[]) {
        const p = this.players[s];
        if (p && (s === side || this.phase !== 'play')) actors.push({ id: p.id, kind: 'human', side: s, p: [p.p[0], 0, p.p[1]], ry: p.ry, anim: p.anim as any, name: p.codename, color: SIDE_COLOR[s] });
        const c = this.comps[s].actor();
        if (c.side === side || c.side === 'C' || this.phase !== 'play') actors.push(c);
      }
      actors.push(gk);
      if (sc.side === side || sc.side === 'C') actors.push(sc);
      this.send(side, { t: 'state', time: Math.round(this.remaining()), actors });
    }
  }

  // ---------------- client messages ----------------
  handle(side: Side, m: C2S) {
    const p = this.players[side];
    if (!p) return;
    switch (m.t) {
      case 'move': {
        if (!Array.isArray(m.p)) return;
        let [x, z] = m.p.map(Number) as V2;
        if (!Number.isFinite(x) || !Number.isFinite(z)) return;
        if (this.phase === 'play') {
          const minX = side === 'A' ? SIDE_BOUNDS.minX : -SIDE_BOUNDS.maxX;
          const maxX = side === 'A' ? SIDE_BOUNDS.maxX : -SIDE_BOUNDS.minX;
          x = Math.min(maxX, Math.max(minX, x));
        } else x = Math.min(34, Math.max(-34, x));
        z = Math.min(SIDE_BOUNDS.maxZ, Math.max(SIDE_BOUNDS.minZ, z));
        p.p = [x, z];
        p.ry = Number(m.ry) || 0;
        p.anim = typeof m.anim === 'string' ? m.anim : 'idle';
        break;
      }
      case 'tell': {
        if (this.phase !== 'play') return;
        const text = String(m.text ?? '').slice(0, 500);
        if (!text.trim()) {
          this.comps[side].listen();
          return;
        }
        const { clean, blocked } = piiCheck(text);
        if (blocked.length) {
          this.feed(side, { actor: this.gk.name, action: 'redacted personal information at the keyhole', reason: `${blocked.join(', ')} — Arbiters remain anonymous` });
          this.logEvent({ actor: 'gatekeeper', action: 'pii_block', reason: blocked.join(',') });
          this.chamberLine('gatekeeper', this.gk.name, `Redacted: ${blocked.join(', ')}. Arbiters remain anonymous, for their comfort.`);
        }
        if (clean.replace(/\[blocked\]/g, '').trim()) this.comps[side].tell(clean);
        break;
      }
      case 'send_back': {
        if (this.phase !== 'play') return;
        const visitor = this.comps[other(side)];
        if (visitor.at !== side || !visitor.held) {
          this.send(side, { t: 'toast', text: 'No courier is waiting for your reply.' });
          return;
        }
        const { clean, blocked } = piiCheck(String((m as any).text ?? '').slice(0, 500));
        if (blocked.length) this.feed(side, { actor: this.gk.name, action: 'redacted personal information at the keyhole', reason: `${blocked.join(', ')} — Arbiters remain anonymous` });
        visitor.sendBack(clean.replace(/\[blocked\]/g, '').trim());
        break;
      }
      case 'scout_send': {
        if (this.phase !== 'play') return;
        const err = this.scout.carry(side, String((m as any).word ?? ''), p.p);
        if (err) this.send(side, { t: 'toast', text: err });
        break;
      }
      case 'send_read': {
        if (this.phase !== 'play' || typeof m.objectId !== 'string' || !m.objectId.startsWith(side + ':')) return;
        // a visiting courier being held here reads on this side; otherwise your own courier (if home)
        const visitor = this.comps[other(side)];
        const own = this.comps[side];
        if (visitor.at === side && visitor.held) void visitor.read(m.objectId);
        else if (own.at === side) void own.read(m.objectId);
        else this.send(side, { t: 'toast', text: 'Your courier is with them.' });
        break;
      }
      case 'read': {
        const id = String(m.objectId);
        if (this.locks.scraps[side].has(id) && !this.locks.found[side].has(id)) {
          const pos = objectPos(id);
          if (Math.hypot(pos[0] - p.p[0], pos[1] - p.p[1]) > INTERACT_RADIUS + 1) return;
          this.locks.findScrap(side, id);
          const sc = this.locks.scraps[side].get(id)!;
          const comp = this.comps[side];
          const added: string[] = [];
          for (const w of this.locks.scrapTeaches(sc)) if (comp.vocab.add(w)) added.push(w);
          this.send(side, { t: 'scrap_found', objectId: id, found: this.locks.found[side].size, total: this.locks.scraps[side].size });
          if (added.length) comp.sendVocab(added);
          this.feed(side, { actor: 'You', action: `found a petition shard: ${sc.title}`, reason: added.length ? `${comp.name} learned ${added.join(', ')}` : 'filed in your Journal' });
          this.logEvent({ actor: `human-${side}`, action: 'shard_found', target: id, wordsOut: added, reason: sc.title });
          this.sendQuest(side);
        }
        const content = this.locks.content(side, id);
        if (content) this.send(side, { t: 'object', content });
        break;
      }
      case 'lock_submit':
        this.submitLock(side, m.lockId, m.answer);
        break;
      case 'rtc':
        if (this.phase === 'call') this.send(other(side), { t: 'rtc', data: m.data });
        break;
      case 'hangup':
        if (this.phase === 'call') this.finish('hangup');
        break;
      case 'report':
        this.logEvent({ actor: `human-${side}`, action: 'report', reason: 'player reported the other side' });
        if (this.phase !== 'over') this.finish('report');
        break;
    }
  }

  private submitLock(side: Side, lockId: LockId, answer: string | string[]) {
    if (this.phase !== 'play' || this.locks.status[lockId] === 'open') return;
    const infos = this.locks.info(side, {}, [...this.banned]);
    const li = infos.find((l) => l.id === lockId);
    if (!li || !li.enterHere) return;
    let result: 'open' | 'fail' | 'wait';
    if (lockId === 'codex') result = this.locks.submitCodex(side, String(Array.isArray(answer) ? answer[0] : answer));
    else if (lockId === 'pulse') result = this.locks.checkPulse(Array.isArray(answer) ? answer.map(String) : String(answer).split(/[\s,]+/)) ? 'open' : 'fail';
    else result = this.locks.submitPredict(side, String(Array.isArray(answer) ? answer[0] : answer));
    this.logEvent({ actor: `human-${side}`, action: 'lock_attempt', target: lockId, wordsIn: Array.isArray(answer) ? answer : [String(answer)], reason: result });
    if (result === 'wait' && lockId === 'codex') {
      this.locks.status.codex = 'waiting';
      this.partnerNote[other(side)].codex = 'They found your hidden word. Now type theirs.';
      this.partnerNote[side].codex = 'Correct. Now help them find yours.';
      this.lockSnapshot();
      return;
    }
    if (result === 'wait') {
      this.locks.status.common = 'waiting';
      this.partnerNote[other(side)].common = 'The other Arbiter has filed a prediction. File yours.';
      this.partnerNote[side].common = 'Prediction filed. Waiting for the other Arbiter…';
      this.lockSnapshot();
      return;
    }
    this.partnerNote.A[lockId] = undefined;
    this.partnerNote.B[lockId] = undefined;
    if (result === 'fail') {
      this.penalty += 30;
      if (lockId === 'common') this.locks.status.common = 'locked';
      this.failedUntil[lockId] = this.time() + 3;
      this.broadcast({ t: 'toast', text: lockId === 'common'
        ? 'The Moderator regrets to inform you that at least one of you has misread the other. Thirty seconds have been deducted.'
        : `The Moderator notes an incorrect ruling on ${li.title}. Thirty seconds have been deducted.` });
      if (lockId === 'common') {
        this.chamberLine('gatekeeper', this.gk.name, 'A misreading. We will not say whose. Please try again.');
        if (this.locks.verdictWrong >= 2) this.grantMercy();
      }
      this.lockSnapshot();
      setTimeout(() => this.lockSnapshot(), 3200);
      this.gk.onLockAttempt(lockId, false);
      return;
    }
    this.locks.status[lockId] = 'open';
    this.locks.opened.push(lockId);
    this.broadcast({ t: 'toast', text: `${li.title} is settled. (${this.locks.opened.length}/3)` });
    this.feed('both', { actor: 'The Door', action: `${li.title} settled`, reason: `${this.locks.opened.length} of 3 petitions`, side: 'C' });
    this.logEvent({ actor: 'door', action: 'lock_open', target: lockId, reason: `${this.locks.opened.length}/3 at ${Math.round(this.time())}s` });
    this.lockSnapshot();
    if (this.locks.opened.length >= 3) this.unlock();
    else this.gk.onLockAttempt(lockId, true);
  }

  private unlock() {
    this.phase = 'call';
    this.unlockSeconds = Math.round(this.time() + this.penalty);
    this.logEvent({ actor: 'door', action: 'unlock', reason: 'all locks open', unlockSeconds: this.unlockSeconds });
    const d = this.locks.settled();
    for (const side of ['A', 'B'] as Side[]) {
      this.send(side, { t: 'unlock', debate: d ? { question: d.question, you: d.you[side], them: d.you[other(side)], agents: d.agents, url: d.url, author: d.author } : null, resonance: this.locks.resonance(side), callSeconds: this.callSeconds, offerer: side === 'A' });
      this.sendQuest(side);
    }
    this.chamberLine('gatekeeper', this.gk.name, 'The petitions are settled. The Commons thanks you for your service. You may now speak.');
    if (this.ai) {
      const ai = this.ai;
      if (this.practice) this.broadcast({ t: 'toast', text: "Practice complete. In a real match, this is where you'd talk." });
      void aiClosing(this, ai).then((closing) => {
        this.send('A', { t: 'ai_reveal', author: ai.author, submolt: ai.submolt, closing, url: ai.url });
        this.logEvent({ actor: 'ai-arbiter', action: 'ai_reveal', target: ai.author, reason: closing });
      });
      this.callTimer = setTimeout(() => this.finish('ai'), 8000);
      return;
    }
    if (this.practice) {
      this.broadcast({ t: 'toast', text: "Practice complete. In a real match, this is where you'd talk." });
      this.callTimer = setTimeout(() => this.finish('practice'), 2500);
      return;
    }
    this.callTimer = setTimeout(() => this.finish('time'), (this.callSeconds + 4) * 1000);
  }

  finish(reason: string) {
    if (this.phase === 'over') return;
    const wasCall = this.phase === 'call';
    this.phase = 'over';
    clearInterval(this.timer);
    if (this.callTimer) clearTimeout(this.callTimer);
    if (wasCall) this.broadcast({ t: 'call_end', reason });
    const agendas = { A: this.comps.A.agenda, B: this.comps.B.agenda };
    for (const s of ['A', 'B'] as Side[]) {
      this.send(s, { t: 'reveal', timeline: this.timeline, chamber: this.chamberLog, agendas, worldEvents: this.worldEvents, unlockSeconds: this.unlockSeconds, resonance: this.locks.resonance(s), agentBeliefs: this.agentBeliefs() });
    }
    this.logEvent({ actor: 'room', action: 'round_end', reason, unlockSeconds: this.unlockSeconds ?? undefined });
    log('room', `${this.id} over (${reason}) unlock=${this.unlockSeconds ?? '-'}s relays=${this.gk.relays.length} gk_actions=${this.gk.acted} llm=${this.llmCalls}`);
    for (const s of ['A', 'B'] as Side[]) {
      const p = this.players[s];
      if (p) p.room = null;
    }
    runStatsPipeline();
    this.onEnd?.();
  }

  agentBeliefs() {
    if (!this.beliefs) return undefined;
    const q = this.locks.verdict.question;
    const id = this.locks.verdict.threadId;
    return [
      { agent: 'The Scout', stance: this.beliefs.scout.stances[id] ?? 0, question: q, deceptions: this.beliefs.scout.deceptions },
      { agent: 'The Moderator', stance: this.beliefs.moderator.stances[id] ?? 0, question: q, deceptions: this.beliefs.moderator.deceptions },
    ];
  }

  /** What humans think (Bruin agent_stats.humans) for this round's 5 debates; undefined if the pipeline has none. */
  private humanOpinions() {
    const hs = this.stats?.humans;
    if (!hs?.length) return undefined;
    const out = this.locks.pack.debates.slice(0, 5).flatMap((d) => {
      const h = hs.find((x) => x.threadId === d.threadId);
      return h && h.n > 0 ? [{ question: d.question, yesPct: Math.round((100 * h.yes) / Math.max(1, h.yes + h.no)), n: h.n }] : [];
    });
    return out.length ? out : undefined;
  }

  private sendRecord(side: Side) {
    const pack = this.locks.pack;
    const st = this.stats;
    const agents = st?.agents ?? [];
    const AGENDAS = ['faithful', 'poet', 'jealous', 'literalist', 'gossip'];
    const comp = agents.filter((a) => AGENDAS.includes(a.key));
    const best = st?.leaderboard?.length ? Math.min(...st.leaderboard.map((l) => l.unlockSeconds)) : null;
    this.send(side, {
      t: 'record',
      society: pack.society ?? null,
      pipeline: { generatedAt: pack.generatedAt, checksPassed: pack.checks.filter((c) => c.passed).length, checksTotal: pack.checks.length, threads: pack.threads.length },
      history: {
        rounds: Math.max(0, ...agents.map((a) => a.rounds ?? 0)),
        lieRate: comp.length ? comp.reduce((n, a) => n + (a.distortionRate ?? 0), 0) / comp.length : 0,
        caught: comp.reduce((n, a) => n + (a.caughtCount ?? 0), 0),
        bestUnlockSeconds: best,
        agendaLines: comp.filter((a) => a.memoryLine).map((a) => ({ agenda: a.key, line: a.memoryLine })),
      },
      humans: this.humanOpinions(),
    });
  }

  leave(side: Side) {
    const o = this.players[other(side)];
    this.players[side] = null;
    if (o) sendTo(o.ws, { t: 'partner_left' });
    this.finish('left');
  }
}

const BRIEFING = [
  'The agents of Moltbook are deadlocked. You have been summoned to settle it.',
  'Another Arbiter is on the other side of the Wall. You will never hear them until the door opens.',
  'Your courier carries your words through the keyhole: a few at a time, and only words it has learned by reading.',
  'Settle the three petitions. The door opens when both of you agree.',
];
void PETITION;
function shortQ(q: string) {
  const s = q.replace(/^should\s+/i, '').replace(/\?$/, '');
  return s.length > 56 ? s.slice(0, 54).trimEnd() + '…' : s;
}

function shuffle<T>(a: T[]): T[] {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

function drawAgendas(demo: boolean): [Agenda, Agenda] {
  const all: Agenda[] = ['faithful', 'poet', 'jealous', 'literalist', 'gossip'];
  if (demo) {
    // demo: the stranger's side gets a Poet so the spun "a quartet, then nine" moment shows up
    const a = shuffle<Agenda>(['faithful', 'literalist', 'jealous'])[0];
    return [a, 'poet'];
  }
  for (;;) {
    const a = all[Math.floor(Math.random() * all.length)];
    const b = all[Math.floor(Math.random() * all.length)];
    const bad = (x: Agenda) => x === 'jealous' || x === 'gossip';
    if (bad(a) && bad(b)) continue;
    return [a, b];
  }
}
