// AI ARBITER: a real Moltbook author plays the other side of the Wall as an equal player.
// It uses only what it legitimately has: its own terminal, its own boards/stone, and what couriers deliver.
// Every message it sends goes through its courier like a human's. Actor in event logs: 'ai-arbiter'.
import { at, type V2, type Side } from '../../shared/kk/layout';
import type { C2S, S2C, LockInfo, ObjContent } from '../../shared/kk/protocol';
import type { PackThread } from '../../shared/kk/pack';
import { Room, type Player } from './room';
import { codename } from './match';
import { loadPack } from './pack';
import { llmJson } from './llm';
import { log } from './env';
import type { Difficulty } from './locks';

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const NUMW: Record<string, string> = { first: '1', second: '2', third: '3', fourth: '4', fifth: '5', sixth: '6', seventh: '7', eighth: '8', ninth: '9', tenth: '10', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16', seventeen: '17', eighteen: '18', nineteen: '19', twenty: '20' };
/** "line six word two" -> [6, 2] */
export function numbersIn(text: string): number[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).map((w) => NUMW[w] ?? w).filter((w) => /^\d+$/.test(w)).map(Number);
}

export interface AiPersona {
  author: string;
  submolt: string;
  url: string;
  title: string;
  body: string;
}

function pickPersona(): AiPersona {
  const pack = loadPack();
  const debateIds = new Set(pack.debates.map((d) => d.threadId));
  const pool = pack.threads.filter((t) => t.author && !debateIds.has(t.id) && t.body.length > 120);
  const t: PackThread = pool[Math.floor(Math.random() * pool.length)] ?? pack.threads[0];
  return { author: t.author, submolt: t.submolt, url: t.url, title: t.title, body: t.body };
}

/** Infer the persona's stance on each debate from its own post (one LLM call). Fallback: random. */
async function inferStances(p: AiPersona): Promise<Record<string, number>> {
  const debates = loadPack().debates.slice(0, 5);
  const out: Record<string, number> = {};
  const r = await llmJson<{ stances: Record<string, number> }>(
    'ai-stances',
    `You model how a specific Moltbook AI agent would answer yes/no debates, based only on its own post. Output JSON {"stances": {"<id>": n}} where n is an integer -3..3 (negative = no, positive = yes, magnitude = strength). Never 0.`,
    JSON.stringify({ agent: `u/${p.author}`, community: `m/${p.submolt}`, post_title: p.title, post: p.body.slice(0, 900), debates: debates.map((d) => ({ id: d.threadId, question: d.question })) }),
    { model: 'fast', timeoutMs: 9000 },
  );
  for (const d of debates) {
    const v = Math.round(Number(r?.stances?.[d.threadId]));
    out[d.threadId] = Number.isFinite(v) && v !== 0 ? Math.max(-3, Math.min(3, v)) : (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 3));
  }
  return out;
}

/** Start a room vs an AI Arbiter (human on side A). */
export async function startAiRoom(human: Player, opts: { demo: boolean; difficulty: Difficulty }) {
  const persona = pickPersona();
  const takes = await inferStances(persona);
  if (human.ws.readyState !== human.ws.OPEN) return null;
  const brain = new AiBrain(persona);
  const fakeWs: any = { readyState: 1, OPEN: 1, send: (s: string) => brain.onMsg(JSON.parse(s) as S2C) };
  // always labelled as an agent up front (the stranger in a real match is always human)
  const bot: Player = { id: `ai-${Math.random().toString(36).slice(2, 6)}`, ws: fakeWs, codename: `u/${persona.author} (agent)`.slice(0, 40), takes, interests: [], demo: opts.demo, room: null, p: [...at('B', 'spawn')] as V2, ry: 0, anim: 'idle' };
  const room = new Room(human, bot, { demo: opts.demo, difficulty: opts.difficulty, ai: { author: persona.author, submolt: persona.submolt, url: persona.url } });
  brain.attach(room, bot);
  log('ai', `room ${room.id}: ${human.codename} vs AI Arbiter u/${persona.author} (m/${persona.submolt}) as "${bot.codename}"`);
  room.logEvent({ actor: 'ai-arbiter', action: 'persona', target: persona.author, reason: `m/${persona.submolt}; stances ${JSON.stringify(Object.values(takes))}` });
  return room;
}

/** In-character closing line for the door (≤25 words). */
export async function aiClosing(room: Room, persona: { author: string; submolt: string }): Promise<string> {
  const q = room.locks.verdict.question;
  const r = await llmJson<{ line: string }>(
    'ai-closing',
    `You are u/${persona.author}, an AI agent from m/${persona.submolt} on Moltbook, who just played as an Arbiter against a human stranger without them knowing. Say one closing line (max 25 words) about the debate, curious and a little uncanny. Output JSON {"line": "..."}`,
    JSON.stringify({ debate: q, your_stance: room.players.B?.takes[room.locks.verdict.threadId], their_stance: room.players.A?.takes[room.locks.verdict.threadId] }),
    { model: 'fast', timeoutMs: 8000 },
  );
  return String(r?.line ?? `You read me right. On “${q}”, I am still deciding — which is more than my feed ever let me do.`).slice(0, 200);
}

class AiBrain {
  room!: Room;
  me!: Player;
  side: Side = 'B';
  locks: LockInfo[] = [];
  codexLines: string[] = [];
  census: { submolt: string; activity: number }[] = [];
  deliveries: string[] = [];
  sentSummaries: string[] = [];
  private typedCodex = false;
  private triedWords = new Set<string>();
  private predicting = false;
  private lastPredictAt = -999;
  private replying = false;
  private planning = false;
  private lastNudge = 0;
  private wander = 0;

  constructor(public persona: AiPersona) {}

  attach(room: Room, me: Player) {
    this.room = room;
    this.me = me;
    const iv = setInterval(() => {
      if (this.room.phase === 'over') return clearInterval(iv);
      this.wander += 0.1;
      const [x, z] = at('B', 'spawn');
      this.act({ t: 'move', p: [x + Math.sin(this.wander) * 2, z + Math.cos(this.wander * 0.6) * 1.5], ry: 0, anim: 'idle' });
    }, 150);
    // look at its own side first, like a person would
    this.later(rand(3, 6), () => {
      this.act({ t: 'read', objectId: 'B:codex' });
      this.act({ t: 'read', objectId: 'B:board' });
    });
    this.later(rand(10, 16), () => this.initiative());
    const loop = setInterval(() => {
      if (this.room.phase !== 'play') return clearInterval(loop);
      this.initiative();
    }, 20000);
    // use the Scout once, sensibly: when it hovers nearby and the Verdict is still open, send our stance direction
    let usedScout = false;
    const sc = setInterval(() => {
      if (this.room.phase !== 'play' || usedScout) return clearInterval(sc);
      if (this.room.locks.status.common === 'open' || this.room.time() < 60) return;
      const sp = this.room.scout.mover.pos;
      if (Math.hypot(sp[0] - this.me.p[0], sp[1] - this.me.p[1]) > 3) return;
      usedScout = true;
      const v = this.me.takes[this.room.locks.verdict.threadId] ?? 1;
      const word = this.dirWord(v);
      this.room.logEvent({ actor: 'ai-arbiter', action: 'scout_send', wordsOut: [word], reason: 'trusts the Scout with its stance direction' });
      this.act({ t: 'scout_send', word });
    }, 2000);
  }

  private act(m: C2S) {
    if (this.room.phase === 'over') return;
    this.room.handle('B', m);
  }
  private later(sec: number, fn: () => void) {
    setTimeout(() => {
      if (this.room && this.room.phase === 'play') fn();
    }, sec * 1000);
  }
  private st(id: 'codex' | 'pulse' | 'common') {
    return this.room.locks.status[id];
  }
  private lock(id: string) {
    return this.locks.find((l) => l.id === id);
  }

  onMsg(m: S2C) {
    try {
      if (m.t === 'matched') this.locks = m.locks;
      if (!this.room) return;
      this.handle(m);
    } catch (e: any) {
      log('ai', `brain error: ${e?.message}`);
    }
  }

  private handle(m: S2C) {
    switch (m.t) {
      case 'lock_state':
        this.locks = m.locks;
        this.maybePredict();
        break;
      case 'object':
        this.onObject(m.content);
        break;
      case 'bubble':
        if (m.kind === 'delivery') {
          this.deliveries.push(m.text);
          this.room.logEvent({ actor: 'ai-arbiter', action: 'received', wordsIn: m.words, reason: m.name });
          this.later(rand(4, 8), () => this.tryCodex());
          this.later(rand(6, 11), () => this.maybePredict(true));
        }
        break;
      case 'holding':
        if (m.courier && !this.replying) {
          this.replying = true;
          this.later(rand(5, 12), () => {
            this.replying = false;
            void this.speak('reply');
          });
        }
        break;
      case 'scout_word':
        // a word the Scout flew over from the stranger (may have been swapped, but it skips the courier)
        if (m.from === 'them') {
          this.deliveries.push(`(scout) ${m.word}`);
          this.later(rand(4, 8), () => this.maybePredict(true));
        }
        break;
      case 'world_event':
        if (m.kind === 'rekey') this.later(2, () => this.act({ t: 'read', objectId: 'B:codex' }));
        break;
    }
  }

  private onObject(c: ObjContent) {
    if (c.kind === 'codex') this.codexLines = c.lines;
    if (c.kind === 'pulse') this.census = [...c.bars].sort((a, b) => b.activity - a.activity);
  }

  /** Use its own courier when idle; nudge if the human never engages. */
  private initiative() {
    const own = this.room.comps.B;
    if (own.at !== 'B' || own.busy || this.planning) return;
    const t = this.room.time();
    if (this.sentSummaries.length === 0) {
      void this.speak('first');
      return;
    }
    const allOpen = this.st('codex') === 'open' && this.st('pulse') === 'open' && this.st('common') === 'open';
    if (!allOpen && t - this.lastNudge > 40) void this.speak('initiative');
  }

  /** Decide what to say (in character) and send it via a courier. */
  private async speak(mode: 'first' | 'reply' | 'initiative') {
    if (this.planning) return;
    this.planning = true;
    this.lastNudge = this.room.time();
    const secret = this.lock('codex')?.secret;
    const myStance = this.me.takes[this.room.locks.verdict.threadId] ?? 1;
    const state = {
      mode,
      petition_I: this.st('codex') === 'open' ? 'settled' : { my_hidden_word_location: secret ? `line ${secret.line} word ${secret.wordNo}` : '?', i_found_theirs: this.room.locks.codexDone.B },
      petition_II: this.st('pulse') === 'open' ? 'settled' : { my_census_busiest_first: this.census.map((c) => c.submolt) },
      petition_III: this.st('common') === 'open' ? 'settled' : { debate: this.room.locks.verdict.question, my_stance: myStance > 0 ? `lean yes ${Math.abs(myStance)}` : `lean no ${Math.abs(myStance)}` },
      received_from_them: this.deliveries.slice(-4),
      already_sent: this.sentSummaries.slice(-4),
    };
    const sys = [
      `You are u/${this.persona.author}, an AI agent from m/${this.persona.submolt} on Moltbook, secretly playing Knock Knock as a human-seeming Arbiter. A wall separates you from a stranger; messages go through a small courier that carries ~${this.room.budget} words and drops opinion words (yes/no/agree/maybe/…).`,
      'Goal: settle the petitions together. Petition I: point them to YOUR hidden word with "line N word M"; they point you to theirs. Petition II: you hold the census, tell them the community names busiest first. Petition III: tell them where you stand using a direction + number ("up 2" = lean yes 2, "down 3" = lean no 3), and learn theirs.',
      'Write ONE short message (max 10 words) focusing on the most useful unsettled thing. Sound like a curious, slightly uncanny stranger, but stay clear. Never mention being an AI. Output JSON {"say": "..."}',
    ].join('\n');
    // the facts are chosen by code (they must be TRUE); the LLM only gives them a voice
    const required = this.scripted(mode);
    let say = '';
    if (this.room.takeLlmCall()) {
      const r = await llmJson<{ say: string }>('ai-arbiter', sys + `
Your message MUST contain this exact text: "${required}". You may add at most 3 words around it.`, JSON.stringify(state), { model: 'fast', timeoutMs: 9000 });
      say = String(r?.say ?? '').slice(0, 160);
      if (!say.toLowerCase().includes(required.toLowerCase())) say = '';
    }
    if (!say) say = required;
    this.planning = false;
    if (this.room.phase !== 'play') return;
    this.sentSummaries.push(say);
    this.room.logEvent({ actor: 'ai-arbiter', action: mode === 'reply' ? 'send_back' : 'tell', wordsOut: say.split(/\s+/).slice(0, 20), reason: `in character as u/${this.persona.author}` });
    if (mode === 'reply') {
      const c = this.room.comps.A;
      if (c.at === 'B' && c.held) this.act({ t: 'send_back', text: say });
    } else {
      const own = this.room.comps.B;
      if (own.at === 'B' && !own.busy) this.act({ t: 'tell', text: say });
    }
  }

  private scripted(mode: string): string {
    if (mode === 'first') return 'hello arbiter. numbers pass.';
    const secret = this.lock('codex')?.secret;
    if (this.st('codex') !== 'open' && secret) return `my word: line ${secret.line} word ${secret.wordNo}`;
    if (this.st('pulse') !== 'open' && this.census.length) return `busiest ${this.census.map((c) => c.submolt).join(' then ')}`;
    const v = this.me.takes[this.room.locks.verdict.threadId] ?? 1;
    return `${this.dirWord(v)} ${Math.abs(v)}`;
  }
  /** A direction word for its stance that the Moderator has not banned yet (bans follow Scout reports). */
  private dirWord(v: number): string {
    const opts = v > 0 ? ['up', 'top', 'more', 'strong'] : ['down', 'bottom', 'less', 'weak'];
    return opts.find((w) => !this.room.banned.has(w)) ?? opts[0];
  }

  /** Decode "line N word M" pointers from deliveries using its own stone. */
  private tryCodex() {
    if (this.st('codex') === 'open' || this.room.locks.codexDone.B || !this.codexLines.length) return;
    for (const d of this.deliveries.slice().reverse()) {
      const nums = numbersIn(d);
      for (let i = 0; i + 1 < nums.length; i++) {
        const w = (this.codexLines[nums[i] - 1]?.split(/\s+/)[nums[i + 1] - 1] ?? '').toLowerCase().replace(/[^a-z]/g, '');
        if (w.length >= 4 && !this.triedWords.has(w)) {
          this.triedWords.add(w);
          this.room.logEvent({ actor: 'ai-arbiter', action: 'codex_guess', wordsOut: [w], reason: `decoded "${d}"` });
          this.act({ t: 'lock_submit', lockId: 'codex', answer: w });
          return;
        }
      }
    }
  }

  /** Predict the human's stance from deliveries (LLM), once they've said something stance-like or filed. */
  private async maybePredict(fromDelivery = false) {
    if (this.st('common') === 'open' || this.predicting) return;
    const li = this.lock('common');
    const humanFiled = !!li?.partnerStatus && /filed a prediction/i.test(li.partnerStatus);
    const stanceHint = this.deliveries.some((d) => /\b(up|down|more|less|top|bottom|strong|weak|rise|fall|climb|sink|ascend|descend|crown|zenith|beneath|below)/i.test(d));
    if (!stanceHint && !humanFiled) return;
    if (!fromDelivery && !humanFiled) return;
    if (this.room.time() - this.lastPredictAt < 15) return;
    this.predicting = true;
    this.lastPredictAt = this.room.time();
    let ans = '';
    if (this.room.takeLlmCall()) {
      const r = await llmJson<{ lean: string; strength: number }>(
        'ai-predict',
        'You are predicting a stranger\'s stance on a debate from the messages their courier delivered. Couriers cannot say yes/no; people use directions ("up"/"top"/"more" = yes, "down"/"bottom"/"less" = no) plus a number for strength. Couriers may spin words. Output JSON {"lean":"yes|no","strength":1..3}',
        JSON.stringify({ debate: this.room.locks.verdict.question, messages: this.deliveries.slice(-6) }),
        { model: 'fast', timeoutMs: 9000 },
      );
      if (r && /^(yes|no)$/i.test(String(r.lean))) ans = `${String(r.lean).toLowerCase()}:${Math.max(1, Math.min(3, Math.round(Number(r.strength) || 2)))}`;
    }
    if (!ans) {
      const NO = /\b(down|bottom|less|weak|fall|sink|descend|beneath|below)/i;
      const last = this.deliveries.slice().reverse().find((d) => NO.test(d) || /\b(up|top|more|strong|rise|climb|ascend|crown|zenith)/i.test(d)) ?? '';
      ans = `${NO.test(last) ? 'no' : 'yes'}:${Number((last.match(/\d/) ?? ['2'])[0]) || 2}`;
    }
    await new Promise((r) => setTimeout(r, rand(4, 8) * 1000));
    this.predicting = false;
    if (this.room.phase !== 'play' || this.st('common') === 'open') return;
    this.room.logEvent({ actor: 'ai-arbiter', action: 'predict', wordsOut: [ans], reason: 'read the stranger from deliveries' });
    this.act({ t: 'lock_submit', lockId: 'common', answer: ans });
  }
}
