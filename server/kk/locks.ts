// Builds the round's locks + per-side objects from the Bruin round pack, and checks answers.
import type { RoundPack, PackCodex, PackPulse, PackDebate, PackThread } from '../../shared/kk/pack';
import type { LockId, LockInfo, LockStatus, ObjContent, ObjInfo } from '../../shared/kk/protocol';
import { THREAD_SLOTS, objectId, objectPos, type Side } from '../../shared/kk/layout';

export type Difficulty = 'easy' | 'medium' | 'hard';
const RUNES = ['ᚠ', 'ᚢ', 'ᚦ', 'ᚨ', 'ᚱ', 'ᚲ', 'ᚷ', 'ᚹ', 'ᚺ', 'ᚾ', 'ᛁ', 'ᛃ'];
const TAKE_GLYPHS: Record<Side, string[]> = { A: ['☾', '✦', '☀', '♆', '⚘'], B: ['◆', '▲', '●', '■', '✚'] };

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const shuffle = <T,>(a: T[]) => {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

export interface Takes { [threadId: string]: number }

export class LockSet {
  codex!: PackCodex;
  pulse!: PackPulse;
  runeOf = new Map<string, string>(); // submolt -> rune glyph
  takeOrder: Record<Side, { id: string; glyph: string; debate: PackDebate }[]> = { A: [], B: [] };
  status: Record<LockId, LockStatus> = { codex: 'locked', pulse: 'locked', common: 'locked' };
  commonPicks: Partial<Record<Side, { debateId: string; at: number }>> = {};
  threadsBySide: Record<Side, Map<string, PackThread>> = { A: new Map(), B: new Map() };
  opened: LockId[] = [];
  rekeys = 0;

  constructor(public pack: RoundPack, public difficulty: Difficulty, public takes: Record<Side, Takes>) {
    this.pickCodex();
    this.pickPulse();
    this.shuffleTakes();
    this.placeThreads();
  }

  pickCodex(exclude?: string) {
    const want = this.difficulty === 'hard' ? 'hard' : 'easy';
    const pool = this.pack.codexes.filter((c) => c.id !== exclude);
    const byDiff = pool.filter((c) => c.difficulty === want);
    this.codex = pick(byDiff.length ? byDiff : pool.length ? pool : this.pack.codexes);
  }
  pickPulse() {
    const n = this.difficulty === 'hard' ? 4 : 3;
    const p = pick(this.pack.pulses);
    const entries = [...p.entries].sort((a, b) => a.rank - b.rank);
    // choose n with distinct ranks; keep the order unambiguous (pipeline guarantees >=15% gaps for adjacent entries)
    const chosen = entries.length > n ? shuffle(entries).slice(0, n).sort((a, b) => a.rank - b.rank) : entries;
    this.pulse = { ...p, entries: chosen.map((e, i) => ({ ...e, rank: i + 1 })) };
    this.assignRunes();
  }
  assignRunes() {
    const glyphs = shuffle(RUNES);
    this.runeOf.clear();
    this.pulse.entries.forEach((e, i) => this.runeOf.set(e.submolt, glyphs[i]));
  }
  shuffleTakes() {
    for (const side of ['A', 'B'] as Side[]) {
      const order = shuffle(this.pack.debates.slice(0, 5));
      const glyphs = shuffle(TAKE_GLYPHS[side]);
      this.takeOrder[side] = order.map((d, i) => ({ id: `${side}-${glyphs[i]}`, glyph: glyphs[i], debate: d }));
    }
  }
  /** 6 thread boards per side. Debate threads split across sides; the rest from pulse submolts first. */
  placeThreads() {
    const debateIds = new Set(this.pack.debates.map((d) => d.threadId));
    const debates = shuffle(this.pack.threads.filter((t) => debateIds.has(t.id)));
    const pulseSubs = new Set(this.pulse.entries.map((e) => e.submolt));
    const others = shuffle(this.pack.threads.filter((t) => !debateIds.has(t.id) && t.id !== this.codex.postId));
    others.sort((a, b) => Number(pulseSubs.has(b.submolt)) - Number(pulseSubs.has(a.submolt)));
    const sides: Record<Side, PackThread[]> = { A: [], B: [] };
    debates.forEach((t, i) => sides[i % 2 === 0 ? 'A' : 'B'].push(t));
    let k = 0;
    for (const side of ['A', 'B'] as Side[]) {
      while (sides[side].length < THREAD_SLOTS.length && k < others.length) sides[side].push(others[k++]);
      // tiny packs: allow reuse
      let r = 0;
      while (sides[side].length < THREAD_SLOTS.length) sides[side].push(this.pack.threads[r++ % this.pack.threads.length]);
      const m = this.threadsBySide[side];
      m.clear();
      shuffle(sides[side]).forEach((t, i) => m.set(objectId(side, THREAD_SLOTS[i]), t));
    }
  }

  // ---------- objects ----------
  objects(side: Side): ObjInfo[] {
    const o: ObjInfo[] = [];
    for (const [id, t] of this.threadsBySide[side]) o.push({ id, kind: 'thread', label: `m/${t.submolt}`, pos: objectPos(id) });
    o.push({ id: objectId(side, 'codex'), kind: 'codex', label: 'The Codex', pos: objectPos(objectId(side, 'codex')) });
    o.push({ id: objectId(side, 'board'), kind: side === 'A' ? 'legend' : 'pulse', label: side === 'A' ? 'Rune Legend' : 'The Pulse', pos: objectPos(objectId(side, 'board')) });
    o.push({ id: objectId(side, 'takes'), kind: 'takes', label: 'Hot Takes', pos: objectPos(objectId(side, 'takes')) });
    o.push({ id: objectId(side, 'terminal'), kind: 'terminal', label: 'Lock Terminal', pos: objectPos(objectId(side, 'terminal')) });
    return o;
  }
  thread(objId: string): PackThread | undefined {
    const side = objId[0] as Side;
    return this.threadsBySide[side]?.get(objId);
  }
  content(side: Side, objId: string): ObjContent | null {
    if (!objId.startsWith(side + ':')) return null; // visibility: own side only
    const slot = objId.slice(2);
    if (slot.startsWith('t')) {
      const t = this.thread(objId);
      if (!t) return null;
      return { kind: 'thread', id: objId, title: t.title, submolt: t.submolt, author: t.author, body: t.body, url: t.url, upvotes: t.upvotes, comments: t.comments, vocab: t.vocab };
    }
    if (slot === 'codex') {
      const c = this.codex;
      return { kind: 'codex', id: objId, title: c.title, author: c.author, url: c.url, postId: c.postId, lines: c.lines, showLineNumbers: this.difficulty !== 'hard' };
    }
    if (slot === 'board') {
      if (side === 'A') return { kind: 'legend', id: objId, runes: this.pulse.entries.map((e) => ({ glyph: this.runeOf.get(e.submolt)!, submolt: e.submolt })).sort((a, b) => a.glyph.localeCompare(b.glyph)) };
      return { kind: 'pulse', id: objId, snapshotAt: this.pulse.snapshotAt, bars: shuffle(this.pulse.entries).map((e) => ({ submolt: e.submolt, activity: e.activity })) };
    }
    if (slot === 'takes') return { kind: 'takes', id: objId, takes: this.takeOrder[side].map((t) => ({ id: t.id, glyph: t.glyph, question: t.debate.question })) };
    if (slot === 'terminal') return { kind: 'terminal', id: objId };
    return null;
  }

  // ---------- lock info ----------
  info(side: Side, partnerNote: Partial<Record<LockId, string>> = {}): LockInfo[] {
    const c = this.codex;
    const codex: LockInfo =
      side === 'A'
        ? { id: 'codex', title: 'The Codex', prompt: `The other side must enter the passphrase “${c.passWord.toUpperCase()}”. Your companion has never seen this word — find another way to point at it. Both Codex stones show the same post.`, enterHere: false, input: 'none', status: this.status.codex, partnerStatus: partnerNote.codex }
        : { id: 'codex', title: 'The Codex', prompt: 'Enter the passphrase. Only the other side knows it — and both Codex stones show the same Moltbook post.', enterHere: true, input: 'word', status: this.status.codex, partnerStatus: partnerNote.codex };
    const runes = this.pulse.entries.map((e) => this.runeOf.get(e.submolt)!);
    const pulse: LockInfo =
      side === 'A'
        ? { id: 'pulse', title: 'The Pulse', prompt: `Enter these ${runes.length} runes in order of today's Moltbook activity, busiest first. Only the other side can see the Pulse.`, enterHere: true, input: 'runes', options: shuffle(runes).map((g) => ({ id: g, label: g, glyph: g })), pick: runes.length, status: this.status.pulse, partnerStatus: partnerNote.pulse }
        : { id: 'pulse', title: 'The Pulse', prompt: `The other side holds ${runes.length} runes, one per submolt. They must enter them busiest-first. You hold today's activity.`, enterHere: false, input: 'none', status: this.status.pulse, partnerStatus: partnerNote.pulse };
    const common: LockInfo = {
      id: 'common',
      title: 'Common Ground',
      prompt: 'Both of you: choose the hot take you BOTH feel strongest about. Your symbols mean nothing on the other side.',
      enterHere: true,
      input: 'take',
      options: this.takeOrder[side].map((t) => ({ id: t.id, label: t.debate.question, glyph: t.glyph })),
      status: this.status.common,
      partnerStatus: partnerNote.common,
    };
    return [codex, pulse, common];
  }

  // ---------- answers ----------
  checkCodex(answer: string): boolean {
    return answer.trim().toLowerCase().replace(/[^a-z]/g, '') === this.codex.passWord.toLowerCase();
  }
  checkPulse(answer: string[]): boolean {
    const want = this.pulse.entries.map((e) => this.runeOf.get(e.submolt)!);
    return answer.length === want.length && answer.every((g, i) => g === want[i]);
  }
  /** Common ground: records this side's pick; returns 'wait' until both picked (20s window). */
  submitCommon(side: Side, takeId: string, now: number): 'wait' | 'open' | 'fail' {
    const t = this.takeOrder[side].find((x) => x.id === takeId);
    if (!t) return 'fail';
    this.commonPicks[side] = { debateId: t.debate.threadId, at: now };
    const a = this.commonPicks.A;
    const b = this.commonPicks.B;
    if (!a || !b) return 'wait';
    if (Math.abs(a.at - b.at) > 20 && this.difficulty !== 'easy') {
      // stale pick on one side
      const older = a.at < b.at ? 'A' : 'B';
      delete this.commonPicks[older];
      return 'wait';
    }
    const ok = a.debateId === b.debateId && this.acceptedCommon().includes(a.debateId);
    this.commonPicks = {};
    return ok ? 'open' : 'fail';
  }
  acceptedCommon(): string[] {
    const ds = this.pack.debates.slice(0, 5);
    const sA = this.takes.A, sB = this.takes.B;
    const answered = ds.some((d) => sA[d.threadId] !== undefined) && ds.some((d) => sB[d.threadId] !== undefined);
    if (!answered) return ds.map((d) => d.threadId);
    const score = (d: PackDebate) => Math.abs(sA[d.threadId] ?? 0) + Math.abs(sB[d.threadId] ?? 0);
    const max = Math.max(...ds.map(score));
    if (this.difficulty === 'hard') return ds.filter((d) => score(d) === max).map((d) => d.threadId);
    // easy/medium: any take both feel >=2 about, plus the max
    return ds.filter((d) => score(d) === max || (Math.abs(sA[d.threadId] ?? 0) >= 2 && Math.abs(sB[d.threadId] ?? 0) >= 2)).map((d) => d.threadId);
  }
  /** Debate the two disagreed on most (call opener card). */
  disagreement(): { question: string; you: Record<Side, number> } | null {
    const ds = this.pack.debates.slice(0, 5);
    let best: PackDebate | null = null;
    let bestGap = -1;
    for (const d of ds) {
      const g = Math.abs((this.takes.A[d.threadId] ?? 0) - (this.takes.B[d.threadId] ?? 0));
      if (g > bestGap) {
        bestGap = g;
        best = d;
      }
    }
    if (!best) return null;
    return { question: best.question, you: { A: this.takes.A[best.threadId] ?? 0, B: this.takes.B[best.threadId] ?? 0 } };
  }

  /** Gatekeeper rekey. Returns a human-readable description. */
  rekey(lock: LockId): string {
    this.rekeys++;
    if (lock === 'codex') {
      const old = this.codex.id;
      this.pickCodex(old);
      return this.codex.id === old ? 'the Codex shuddered but held' : 'the Codex stones rewrote themselves to a new post';
    }
    if (lock === 'pulse') {
      this.assignRunes();
      return 'the runes reshuffled';
    }
    this.shuffleTakes();
    this.commonPicks = {};
    return 'the hot-take symbols reshuffled on both walls';
  }

  /** Short hint for mercy / scout. */
  hint(lock: LockId): string {
    if (lock === 'codex') return `Codex: line ${this.codex.lineNo}, word ${this.codex.wordNo}`;
    if (lock === 'pulse') return `Pulse: m/${this.pulse.entries[0].submolt} is busiest today`;
    const acc = this.acceptedCommon();
    const d = this.pack.debates.find((x) => x.threadId === acc[0]);
    return `Common Ground: think “${d?.keyword ?? 'memories'}”`;
  }
}
