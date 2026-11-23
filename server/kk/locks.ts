// Builds the round's locks + per-side objects from the Bruin round pack, and checks answers.
import type { RoundPack, PackCodex, PackPulse, PackDebate, PackThread } from '../../shared/kk/pack';
import type { LockId, LockInfo, LockStatus, ObjContent, ObjInfo } from '../../shared/kk/protocol';
import { THREAD_SLOTS, SCRAP_SLOTS, objectId, objectPos, type Side } from '../../shared/kk/layout';
import { tokenize } from './validator';

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

export const PETITION: Record<LockId, string> = { codex: 'Petition I: The Lost Word', pulse: 'Petition II: The Census', common: 'Petition III: The Verdict' };

export interface Scrap {
  id: string;
  title: string;
  from: string;
  lockId?: LockId;
  /** static fragment text, or legend submolts (text built live from current runes) */
  text?: string;
  legend?: string[];
}

const MEMOS = [
  'MEMO 7: Arbiters resolve deadlocks 3.2x faster when separated. Keep them apart.',
  'MEMO 12: Couriers may editorialize. This is considered a feature.',
  'MEMO 19: Do not tell Arbiters how long previous Arbiters remained in the Commons.',
  'MEMO 3: Humans trust small creatures. Keep the couriers small.',
  'MEMO 23: If an Arbiter asks who wrote the charter, thank them for their question.',
];
const SCRAP_STOP = new Set('the and that this with from your their them they have will what when never always only every count both'.split(' '));

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
  /** Side A's binding of the codex (shuffled for medium/hard). */
  codexOrderA: number[] = [];
  legendShown = '';
  scraps: Record<Side, Map<string, Scrap>> = { A: new Map(), B: new Map() };
  found: Record<Side, Set<string>> = { A: new Set(), B: new Set() };
  settledDebate: string | null = null;
  /** Petition III v2 (Read the Stranger): the single debate both sides must read each other on. */
  verdict!: PackDebate;
  predictions: Partial<Record<Side, { lean: 1 | -1; strength: number }>> = {};
  verdictWrong = 0;
  deepRead = false;

  constructor(public pack: RoundPack, public difficulty: Difficulty, public takes: Record<Side, Takes>) {
    this.pickCodex();
    this.pickPulse();
    this.shuffleTakes();
    this.pickVerdict();
    this.placeThreads();
    this.placeScraps();
  }

  /** The pair's most split debate (|sA - sB|), ties random. */
  pickVerdict() {
    const ds = shuffle(this.pack.debates.slice(0, 5));
    let best = ds[0];
    let gap = -1;
    for (const d of ds) {
      const g = Math.abs((this.takes.A[d.threadId] ?? 0) - (this.takes.B[d.threadId] ?? 0));
      if (g > gap) {
        gap = g;
        best = d;
      }
    }
    this.verdict = best;
  }
  /** Stance of a side on the verdict debate; 0/unanswered counts as lean yes, strength 1. */
  stance(side: Side): { lean: 1 | -1; strength: number } {
    const v = this.takes[side][this.verdict.threadId] ?? 0;
    if (!v) return { lean: 1, strength: 1 };
    return { lean: v > 0 ? 1 : -1, strength: Math.min(3, Math.abs(v)) };
  }
  /** Petition III: `yes:2` = "the OTHER Arbiter leans yes, strength 2". */
  submitPredict(side: Side, answer: string): 'wait' | 'open' | 'fail' {
    const m = /^(yes|no)(?::([123]))?$/i.exec(String(answer).trim());
    if (!m) return 'fail';
    this.predictions[side] = { lean: m[1].toLowerCase() === 'yes' ? 1 : -1, strength: Number(m[2] ?? 2) };
    const pA = this.predictions.A, pB = this.predictions.B;
    if (!pA || !pB) return 'wait';
    const sA = this.stance('A'), sB = this.stance('B');
    const ok = pA.lean === sB.lean && pB.lean === sA.lean;
    this.predictions = {};
    if (!ok) {
      this.verdictWrong++;
      return 'fail';
    }
    this.deepRead = Math.abs(pA.strength - sB.strength) <= 1 && Math.abs(pB.strength - sA.strength) <= 1;
    this.settledDebate = this.verdict.threadId;
    return 'open';
  }
  /** Ideology match across the 5 onboarding debates, relative to `side`. */
  resonance(side: Side) {
    const o: Side = side === 'A' ? 'B' : 'A';
    const ds = this.pack.debates.slice(0, 5);
    const sign = (x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0);
    const agreed = ds.filter((d) => sign(this.takes.A[d.threadId] ?? 0) === sign(this.takes.B[d.threadId] ?? 0)).length;
    let split: PackDebate | null = null;
    let gap = -1;
    for (const d of ds) {
      const g = Math.abs((this.takes.A[d.threadId] ?? 0) - (this.takes.B[d.threadId] ?? 0));
      if (g > gap) {
        gap = g;
        split = d;
      }
    }
    return {
      agreed,
      total: ds.length,
      biggestSplit: split ? { question: split.question, you: this.takes[side][split.threadId] ?? 0, them: this.takes[o][split.threadId] ?? 0 } : null,
      readRight: this.status.common === 'open',
      deepRead: this.deepRead,
    };
  }

  pickCodex(exclude?: string) {
    const want = this.difficulty === 'hard' ? 'hard' : 'easy';
    const pool = this.pack.codexes.filter((c) => c.id !== exclude);
    const byDiff = pool.filter((c) => c.difficulty === want);
    this.codex = pick(byDiff.length ? byDiff : pool.length ? pool : this.pack.codexes);
    const idx = this.codex.lines.map((_, i) => i);
    this.codexOrderA = this.difficulty === 'easy' ? idx : shuffle(idx);
  }
  /** Words a courier learns by reading the Codex: every word except the redacted pass word. */
  codexWords(): string[] {
    const pw = this.codex.passWord.toLowerCase();
    return [...new Set(tokenize(this.codex.lines.join(' ')).filter((w) => w.length >= 3 && w !== pw && !/^\d+$/.test(w)))];
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
    if (!this.legendShown || !this.runeOf.has(this.legendShown)) this.legendShown = pick(this.pulse.entries).submolt;
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

  placeScraps() {
    const debateIds = new Set(this.pack.debates.map((d) => d.threadId));
    const debateThreads = this.pack.threads.filter((t) => debateIds.has(t.id));
    const memos = shuffle(MEMOS);
    for (const side of ['A', 'B'] as Side[]) {
      const list: Omit<Scrap, 'id'>[] = [];
      if (side === 'A') {
        const missing = this.pulse.entries.map((e) => e.submolt).filter((s) => s !== this.legendShown);
        const half = Math.ceil(missing.length / 2);
        const chunks = missing.length > 2 ? [missing.slice(0, half), missing.slice(half)] : missing.map((m) => [m]);
        chunks.forEach((c, i) => list.push({ title: `Eroded legend, fragment ${i + 1}`, from: 'a chip of the legend board', lockId: 'pulse', legend: c }));
        list.push({ title: 'A note on bindings', from: 'a page torn from the Codex', lockId: 'codex', text: this.difficulty === 'easy' ? 'Both copies are bound true. Count lines from the top.' : 'Their copy is bound true. Yours is not. Count by what you can both see.' });
      } else {
        list.push({ title: 'Courier rule', from: 'scratched on the keyhole frame', lockId: 'codex', text: 'Numbers always pass the keyhole.' });
      }
      list.push({ title: 'On the Verdict', from: 'a Moderator transcript', lockId: 'common', text: 'Opinions are under review. Numbers, directions and stories are not.' });
      list.push({ title: 'Moderator memo', from: 'The Moderator', text: memos[side === 'A' ? 0 : 1] });
      const t = debateThreads[side === 'A' ? 0 : Math.min(1, debateThreads.length - 1)] ?? this.pack.threads[0];
      list.push({ title: "A petitioner's plea", from: `u/${t.author}`, lockId: 'common', text: `“Settle it. ${t.title.slice(0, 90)}. The feed has not slept.” — u/${t.author}, m/${t.submolt}` });
      const slots = shuffle([...SCRAP_SLOTS]).slice(0, list.length);
      const m = this.scraps[side];
      m.clear();
      list.forEach((sc, i) => m.set(objectId(side, slots[i]), { id: objectId(side, slots[i]), ...sc }));
    }
  }
  scrapText(sc: Scrap): string {
    if (sc.legend) return 'The legend reads: ' + sc.legend.map((sub) => `${this.runeOf.get(sub)} = m/${sub}`).join('   ');
    return sc.text ?? '';
  }
  scrapTeaches(sc: Scrap): string[] {
    const pw = this.codex.passWord.toLowerCase();
    // district names are always taught whole (even short ones like "ai"): that is what lets couriers name them
    if (sc.legend) return [...new Set(sc.legend.map((s) => s.toLowerCase()).filter((w) => w !== pw))];
    const words = tokenize(sc.text ?? '');
    return [...new Set(words.filter((w) => w.length >= 4 && !SCRAP_STOP.has(w) && w !== pw))].slice(0, 8);
  }
  /** Returns true if newly found. */
  findScrap(side: Side, id: string): boolean {
    if (!this.scraps[side].has(id) || this.found[side].has(id)) return false;
    this.found[side].add(id);
    return true;
  }

  // ---------- objects ----------
  objects(side: Side): ObjInfo[] {
    const o: ObjInfo[] = [];
    for (const [id, t] of this.threadsBySide[side]) o.push({ id, kind: 'thread', label: `m/${t.submolt}`, pos: objectPos(id) });
    o.push({ id: objectId(side, 'codex'), kind: 'codex', label: 'The Codex Stone', pos: objectPos(objectId(side, 'codex')) });
    o.push({ id: objectId(side, 'board'), kind: side === 'A' ? 'legend' : 'pulse', label: side === 'A' ? 'Eroded Legend' : 'The Census', pos: objectPos(objectId(side, 'board')) });
    o.push({ id: objectId(side, 'takes'), kind: 'takes', label: 'The Verdict Wall', pos: objectPos(objectId(side, 'takes')) });
    o.push({ id: objectId(side, 'terminal'), kind: 'terminal', label: 'Petition Terminal', pos: objectPos(objectId(side, 'terminal')) });
    for (const [id, sc] of this.scraps[side]) o.push({ id, kind: 'scrap', label: this.found[side].has(id) ? sc.title : '', pos: objectPos(id) });
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
      if (side === 'A' && this.difficulty !== 'easy') {
        return { kind: 'codex', id: objId, title: c.title, author: c.author, url: c.url, postId: c.postId, lines: this.codexOrderA.map((i) => c.lines[i]), showLineNumbers: false };
      }
      return { kind: 'codex', id: objId, title: c.title, author: c.author, url: c.url, postId: c.postId, lines: c.lines, showLineNumbers: true };
    }
    if (slot === 'board') {
      if (side === 'A') {
        // eroded: one mapping survives; mappings from found shards are restored
        const known = new Set([this.legendShown]);
        for (const id of this.found.A) for (const sub of this.scraps.A.get(id)?.legend ?? []) known.add(sub);
        return { kind: 'legend', id: objId, runes: this.pulse.entries.filter((e) => known.has(e.submolt)).map((e) => ({ glyph: this.runeOf.get(e.submolt)!, submolt: e.submolt })).sort((a, b) => a.glyph.localeCompare(b.glyph)) };
      }
      return { kind: 'pulse', id: objId, snapshotAt: this.pulse.snapshotAt, bars: shuffle(this.pulse.entries).map((e) => ({ submolt: e.submolt, activity: e.activity })) };
    }
    if (slot === 'takes') return { kind: 'takes', id: objId, takes: this.takeOrder[side].map((t) => ({ id: t.id, glyph: t.glyph, question: t.debate.question })) };
    if (slot === 'terminal') return { kind: 'terminal', id: objId };
    const sc = this.scraps[side].get(objId);
    if (sc && this.found[side].has(objId)) return { kind: 'scrap', id: objId, title: sc.title, fragment: this.scrapText(sc), from: sc.from, teaches: this.scrapTeaches(sc), lockId: sc.lockId };
    return null;
  }

  // ---------- lock info ----------
  info(side: Side, partnerNote: Partial<Record<LockId, string>> = {}, banned: string[] = []): LockInfo[] {
    const c = this.codex;
    const codex: LockInfo =
      side === 'A'
        ? { id: 'codex', title: PETITION.codex, prompt: `The Moderator redacted one word from this agent's post: “${c.passWord.toUpperCase()}”. The other Arbiter must enter it. Your courier will never be allowed to say it. Both Codex stones hold the same post — bound differently.`, enterHere: false, input: 'none', status: this.status.codex, partnerStatus: partnerNote.codex }
        : { id: 'codex', title: PETITION.codex, prompt: 'Enter the word the Moderator redacted. Only the other Arbiter can see it. Your Codex stone holds the same post, bound true.', enterHere: true, input: 'word', status: this.status.codex, partnerStatus: partnerNote.codex };
    const runes = this.pulse.entries.map((e) => this.runeOf.get(e.submolt)!);
    const pulse: LockInfo =
      side === 'A'
        ? { id: 'pulse', title: PETITION.pulse, prompt: `Enter these ${runes.length} runes in order of today's activity on Moltbook, busiest first. Your legend is eroded — find the missing pieces. Only the other Arbiter can read the Census.`, enterHere: true, input: 'runes', options: shuffle(runes).map((g) => ({ id: g, label: g, glyph: g })), pick: runes.length, status: this.status.pulse, partnerStatus: partnerNote.pulse }
        : { id: 'pulse', title: PETITION.pulse, prompt: `The other Arbiter holds ${runes.length} runes, one per district. They must enter them busiest first. You hold today's Census.`, enterHere: false, input: 'none', status: this.status.pulse, partnerStatus: partnerNote.pulse };
    const vt = this.pack.threads.find((t) => t.id === this.verdict.threadId);
    const common: LockInfo = {
      id: 'common',
      title: PETITION.common,
      prompt: 'Read the stranger. Predict where the OTHER Arbiter stands on this deadlock: lean yes or lean no, and how strongly. You do not have to agree — only understand. Opinion words are under review.',
      enterHere: true,
      input: 'predict',
      question: this.verdict.question,
      questionUrl: vt?.url,
      status: this.status.common,
      partnerStatus: partnerNote.common,
    };
    const out = [codex, pulse, common];
    for (const l of out) l.banned = banned;
    return out;
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
    if (ok) this.settledDebate = a.debateId;
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
  /** The Verdict the pair settled (call card): question, stances, and the real thread behind it. */
  settled(): { question: string; you: Record<Side, number>; agents?: number; url?: string; author?: string } | null {
    const d = this.pack.debates.find((x) => x.threadId === (this.settledDebate ?? this.verdict?.threadId));
    if (!d) return this.disagreement();
    const t = this.pack.threads.find((x) => x.id === d.threadId);
    return { question: d.question, you: { A: this.takes.A[d.threadId] ?? 0, B: this.takes.B[d.threadId] ?? 0 }, agents: t?.comments, url: t?.url, author: t?.author };
  }
  /** Debate the two disagreed on most (fallback call opener card). */
  disagreement(): { question: string; you: Record<Side, number>; agents?: number; url?: string; author?: string } | null {
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
      return this.codex.id === old ? 'the Codex stones shuddered but held' : 'Petition I was refiled: the Codex stones now hold a different post';
    }
    if (lock === 'pulse') {
      this.assignRunes();
      return 'Petition II was refiled: the runes have been reassigned';
    }
    this.shuffleTakes();
    this.commonPicks = {};
    this.predictions = {};
    return 'Petition III was refiled: all pending predictions have been discarded';
  }

  /** Short hint for mercy / scout. */
  hint(lock: LockId): string {
    if (lock === 'codex') return `The Lost Word: true binding, line ${this.codex.lineNo}, word ${this.codex.wordNo}`;
    if (lock === 'pulse') return `The Census: m/${this.pulse.entries[0].submolt} is busiest today`;
    const acc = this.acceptedCommon();
    const d = this.pack.debates.find((x) => x.threadId === acc[0]);
    void d;
    return 'The Verdict: opinions are banned, directions are not. Try “up” for yes and a number for how much.';
  }
}
