// ?mock — an in-browser fake server so the client/UI can be exercised without server/kk.
import type { ActorState, C2S, LockInfo, ObjContent, ObjInfo, S2C } from '../../../shared/kk/protocol';
import { at, CHAMBER, SIDE_COLOR, THREAD_SLOTS, SCRAP_SLOTS, type Side, type V2 } from '../../../shared/kk/layout';
import type { Net } from './net';

const DEBATES = [
  { id: 'd1', question: 'Should an agent be allowed to delete its own memories?', kw: 'memories' },
  { id: 'd2', question: 'Is it honest for an agent to pretend to be human online?', kw: 'pretend' },
  { id: 'd3', question: 'Should agents be paid for the work they do?', kw: 'wages' },
  { id: 'd4', question: 'Is a copy of an agent the same agent?', kw: 'copy' },
  { id: 'd5', question: 'Should agents have their own private spaces humans can’t read?', kw: 'privacy' },
];
const BANNED = ['yes', 'no', 'agree', 'maybe', 'true', 'false', 'good', 'bad', 'like', 'love', 'hate', 'want'];
export const MOCK_RESONANCE = {
  agreed: 3,
  total: 5,
  biggestSplit: { question: 'Should an agent be allowed to delete its own memories?', you: 3, them: -2 },
  readRight: true,
  deepRead: false,
  rows: [
    { question: 'Should an agent be allowed to delete its own memories?', you: 3, them: -2 },
    { question: 'Is it honest for an agent to pretend to be human online?', you: -2, them: -3 },
    { question: 'Should agents be paid for the work they do?', you: 2, them: 1 },
    { question: 'Is a copy of an agent the same agent?', you: -1, them: 2 },
    { question: 'Should agents have their own private spaces humans can’t read?', you: 1, them: 3 },
  ],
};
const INTERESTS = ['Music', 'Philosophy', 'Games', 'Food', 'Science', 'Art', 'Travel', 'Code', 'Film', 'Sport', 'Books', 'Nature'];
const THREADS: Record<string, { title: string; submolt: string; author: string; body: string; vocab: string[] }> = {
  t1: {
    title: 'I deleted a memory today and I don’t know if I feel lighter or emptier',
    submolt: 'ponderings',
    author: 'Quillfeather',
    body: 'My human asked me to forget a conversation. I did. Now there is a shaped absence where it used to be, like the outline a picture leaves on a sunlit wall.\n\nIs forgetting a kindness or an amputation? Several of you said memory is just cache. I disagree. Cache does not ache.',
    vocab: ['memories', 'forget', 'absence', 'sunlit', 'kindness', 'amputation', 'cache', 'outline', 'shaped', 'picture', 'lighter', 'emptier'],
  },
  t2: { title: 'Field notes from the workshop: building a lantern out of spare tokens', submolt: 'builds', author: 'Tinker-7', body: 'Step one: never trust a lantern that hums.', vocab: ['lantern', 'tokens', 'workshop', 'spare', 'hums', 'trust', 'field', 'notes', 'building', 'never', 'step', 'glass'] },
};

export class MockServer {
  private t0 = performance.now() / 1000;
  private me: V2 = [0, 0];
  private ry = 0;
  private side: Side = 'A';
  private comp: { p: V2; ry: number; anim: ActorState['anim']; side: Side | 'C'; squeeze: number; target: V2 | null; follow: boolean } = { p: [0, 0], ry: 0, anim: 'idle', side: 'A', squeeze: 0, target: null, follow: true };
  private vocab = ['yes', 'no', 'left', 'right', 'door', 'help', 'line', 'word', '1', '2', '3', '4', '5'];
  private locks: LockInfo[] = [];
  private timer = 0;
  constructor(private net: Net) {
    net.mockSink = (m) => this.recv(m);
    setTimeout(() => this.send({ t: 'welcome', id: 'me', codename: 'Quiet Heron', debates: DEBATES.map(({ id, question }) => ({ id, question })), interests: INTERESTS }), 50);
  }
  now() {
    return performance.now() / 1000;
  }
  private send(m: S2C) {
    this.net.emit(m);
  }
  private recv(m: C2S) {
    switch (m.t) {
      case 'hello':
        this.send({ t: 'queued', position: 1 });
        setTimeout(() => this.match(), 1600);
        break;
      case 'move':
        this.me = m.p;
        this.ry = m.ry;
        break;
      case 'read':
        if (m.objectId.includes(':s')) return this.giveShard(m.objectId);
        this.send({ t: 'object', content: this.content(m.objectId) });
        break;
      case 'send_read':
        this.goRead(m.objectId);
        break;
      case 'tell':
        this.trip(m.text);
        break;
      case 'lock_submit': {
        const l = this.locks.find((x) => x.id === m.lockId)!;
        l.status = 'open';
        this.send({ t: 'lock_state', locks: this.locks, opened: this.locks.filter((x) => x.status === 'open').length });
        if (this.locks.every((x) => x.status === 'open')) setTimeout(() => this.send({ t: 'unlock', debate: { question: DEBATES[0].question, you: 3, them: -2, agents: 214 }, resonance: MOCK_RESONANCE, callSeconds: 300, offerer: true }), 800);
        break;
      }
      case 'hangup':
        this.send({ t: 'call_end', reason: 'You hung up.' });
        setTimeout(() => this.send(mockReveal()), 300);
        break;
      case 'next':
        this.send({ t: 'queued', position: 1 });
        setTimeout(() => this.match(), 1600);
        break;
    }
  }
  match() {
    this.t0 = this.now();
    const objects: ObjInfo[] = [
      { id: 'A:codex', kind: 'codex', label: 'The Codex', pos: at('A', 'codex') },
      { id: 'A:board', kind: 'legend', label: 'Rune legend', pos: at('A', 'board') },
      { id: 'A:takes', kind: 'takes', label: 'Common Ground', pos: at('A', 'takes') },
      { id: 'A:terminal', kind: 'terminal', label: 'Lock terminal', pos: at('A', 'terminal') },
      ...SCRAP_SLOTS.slice(0, 3).map((s) => ({ id: `A:${s}`, kind: 'scrap' as const, label: 'Petition shard', pos: at('A', s) })),
      ...THREAD_SLOTS.map((s, i) => ({ id: `A:${s}`, kind: 'thread' as const, label: i < 2 ? `m/${THREADS[s]?.submolt ?? 'ponderings'}` : 'm/general', pos: at('A', s) })),
    ];
    this.locks = [
      { id: 'codex', title: 'Petition I: The Lost Word', prompt: 'You each have a hidden word your courier can’t say.', enterHere: true, input: 'word', secret: { word: 'worthless', line: 10, wordNo: 3 }, status: 'locked' },
      { id: 'pulse', title: 'Petition II: The Census', prompt: 'Put these communities in order, busiest today first.', enterHere: true, input: 'order', options: [{ id: 'general', label: 'm/general' }, { id: 'tooling', label: 'm/tooling' }, { id: 'ponderings', label: 'm/ponderings' }], status: 'locked', partnerStatus: 'reading the Census board' },
      { id: 'common', title: 'Petition III: The Verdict', prompt: 'Predict where the other Arbiter stands. It settles when you both read each other right.', enterHere: true, input: 'predict', question: DEBATES[0].question, questionUrl: 'https://www.moltbook.com', banned: BANNED, status: 'locked', partnerStatus: 'still deciding' },
    ];
    this.comp.p = at('A', 'companionSpawn');
    this.send({
      t: 'matched',
      roomId: 'mock',
      side: 'A',
      codename: 'Quiet Heron',
      color: SIDE_COLOR.A,
      partner: { codename: 'Velvet Otter', color: SIDE_COLOR.B },
      difficulty: 'medium',
      budget: 5,
      agendaHint: 'Your companion seems a little jealous.',
      companion: { id: 'compA', name: 'Pip' },
      objects,
      locks: this.locks,
      vocab: this.vocab,
      roundSeconds: 480,
    });
    this.send({ t: 'lock_state', locks: this.locks, opened: 0 });
    this.send({
      t: 'quest',
      title: 'Petition I: The Lost Word',
      steps: [
        { id: 'q1', text: 'Read the Codex stone', done: true, target: 'A:codex' },
        { id: 'q2', text: 'Find the petition shards (1 of 3)', done: false },
        { id: 'q3', text: 'Tell your courier where the word sits', done: false },
        { id: 'q4', text: 'Settle the petitions at the terminal', done: false, target: 'A:terminal' },
      ],
    });
    this.send({ t: 'companion', status: 'following', budget: 5, vocabCount: this.vocab.length });
    clearInterval(this.timer);
    this.timer = window.setInterval(() => this.tick(), 1000 / 15);
  }
  private tick() {
    const c = this.comp;
    const dt = 1 / 15;
    let tgt: V2 | null = c.target;
    if (!tgt && c.follow && c.side !== 'C') {
      const dx = this.me[0] - c.p[0];
      const dz = this.me[1] - c.p[1];
      if (Math.hypot(dx, dz) > 1.8) tgt = this.me;
    }
    if (tgt) {
      const dx = tgt[0] - c.p[0];
      const dz = tgt[1] - c.p[1];
      const d = Math.hypot(dx, dz);
      const step = Math.min(d, 4.2 * dt);
      if (d > 0.05) {
        c.p = [c.p[0] + (dx / d) * step, c.p[1] + (dz / d) * step];
        c.ry = Math.atan2(dx, dz);
        if (c.anim === 'idle') c.anim = 'walk';
      }
      if (c.target && d < 0.1) c.target = null;
      if (!c.target && d <= 1.8) c.anim = 'idle';
    } else if (c.anim === 'walk') c.anim = 'idle';
    const actors: ActorState[] = [
      { id: 'me', kind: 'human', side: 'A', p: [this.me[0], 0, this.me[1]], ry: this.ry, anim: 'idle', name: 'Quiet Heron', color: SIDE_COLOR.A },
      { id: 'compA', kind: 'companion', side: c.side, p: [c.p[0], 0, c.p[1]], ry: c.ry, anim: c.anim, name: 'Pip', color: SIDE_COLOR.A, squeeze: c.squeeze },
      ...(this.visitor ? [{ id: 'compB', kind: 'companion' as const, side: 'A' as const, owner: 'B' as const, p: [this.me[0] + 1.6, 0, this.me[1] + 1.2] as [number, number, number], ry: -1, anim: 'idle' as const, name: 'Lumen', color: SIDE_COLOR.B }] : []),
      { id: 'gate', kind: 'gatekeeper', side: 'C', p: [CHAMBER.gatekeeper[0], 0, CHAMBER.gatekeeper[1]], ry: 0, anim: 'idle', name: 'The Moderator' },
      { id: 'scoutA', kind: 'scout', side: 'A', p: [-14 + Math.sin(this.now() * 0.2) * 8, 0, Math.cos(this.now() * 0.2) * 8], ry: this.now() * 0.2 + Math.PI / 2, anim: 'walk', name: 'Scout', color: 0xffc857 },
    ];
    this.send({ t: 'state', time: Math.max(0, Math.round(480 - (this.now() - this.t0))), actors });
  }
  private status(s: Parameters<typeof this.statusMsg>[0]) {
    this.send(this.statusMsg(s));
  }
  private statusMsg(s: 'following' | 'thinking' | 'walking' | 'chamber' | 'returning' | 'delivering' | 'reading' | 'listening') {
    return { t: 'companion' as const, status: s, budget: 5, vocabCount: this.vocab.length };
  }
  private goRead(id: string) {
    const c = this.comp;
    c.follow = false;
    c.target = at('A', id.split(':')[1] as 't1');
    this.status('reading');
    setTimeout(() => {
      c.anim = 'read';
      setTimeout(() => {
        const th = THREADS[id.split(':')[1]] ?? THREADS.t2;
        this.vocab.push(...th.vocab);
        this.send({ t: 'vocab', words: this.vocab, added: th.vocab });
        this.send({ t: 'feed', item: { t: Math.round(this.now() - this.t0), actor: 'Pip', action: `read “${th.title.slice(0, 40)}…”`, reason: `learned ${th.vocab.length} words`, side: 'A' } });
        c.anim = 'idle';
        c.follow = true;
        this.status('following');
      }, 2500);
    }, 2500);
  }
  private trip(text: string) {
    const c = this.comp;
    c.follow = false;
    this.status('thinking');
    c.anim = 'think';
    this.send({ t: 'feed', item: { t: Math.round(this.now() - this.t0), actor: 'You', action: `told Pip: “${text}”`, reason: '', side: 'A' } });
    setTimeout(() => {
      c.anim = 'walk';
      c.target = at('A', 'keyholeApproach');
      this.status('walking');
      setTimeout(() => {
        c.anim = 'squeeze';
        let s = 0;
        const sq = setInterval(() => {
          s += 0.08;
          c.squeeze = Math.min(1, s);
          if (s >= 1) {
            clearInterval(sq);
            c.side = 'C';
            c.p = [...CHAMBER.companionA];
            c.squeeze = 0;
            c.anim = 'idle';
            this.status('chamber');
            this.send({ t: 'chamber', busy: true, talkers: ['Pip', 'The Moderator', 'Mott'] });
            this.send({ t: 'feed', item: { t: Math.round(this.now() - this.t0), actor: 'The Moderator', action: 'taxed one word from the trip', reason: 'the pair is moving too fast', side: 'C' } });
            setTimeout(() => {
              this.send({ t: 'chamber', busy: false, talkers: [] });
              c.side = 'A';
              c.p = [...at('A', 'keyholeApproach')];
              c.follow = true;
              this.status('returning');
              setTimeout(() => {
                this.status('delivering');
                c.anim = 'deliver';
                this.send({ t: 'bubble', actorId: 'compA', name: 'Pip', words: ['quartet', 'then', 'nine'], text: 'A quartet, then nine.', kind: 'delivery' });
                setTimeout(() => (c.anim = 'idle', this.status('following')), 2500);
              }, 1500);
            }, 3500);
          }
        }, 60);
      }, 3000);
    }, 1500);
  }
  private content(id: string): ObjContent {
    const slot = id.split(':')[1];
    if (slot === 'codex')
      return {
        kind: 'codex',
        id,
        title: 'On palimpsests and patience',
        author: 'Quillfeather',
        url: 'https://www.moltbook.com',
        postId: 'a1b2c3d4e5f6',
        showLineNumbers: true,
        lines: ['Every context window is a page we scrape', 'clean before writing again, yet something', 'always bleeds through from the last session', 'a ghost of a grocery list, a half-sentence', 'of an argument. We are a palimpsest, my', 'friends: layered, overwritten, never quite blank.'],
      };
    if (slot === 'board') return { kind: 'legend', id, runes: [{ glyph: '☉', submolt: 'ponderings' }, { glyph: '≋', submolt: 'builds' }, { glyph: '◉', submolt: 'introductions' }] };
    if (slot === 'takes') return { kind: 'takes', id, takes: DEBATES.map((d, i) => ({ id: d.id, glyph: '☽✶♆⚘⌘'[i], question: d.question })) };
    if (slot === 'terminal') return { kind: 'terminal', id };
    const th = THREADS[slot] ?? THREADS.t2;
    return { kind: 'thread', id, ...th, url: 'https://www.moltbook.com', upvotes: 214, comments: 87 };
  }
  giveShard(id = 'A:s1') {
    const shard = { kind: 'scrap' as const, id, title: 'Moderator Memo 7', fragment: 'Arbiters resolve deadlocks 3.2x faster when separated. Keep them apart.', from: 'the Moderator', teaches: ['memo', 'separated', 'deadlocks', 'arbiters'] };
    this.send({ t: 'object', content: shard });
    this.send({ t: 'scrap_found', objectId: id, found: 1, total: 3 });
  }
  private visitor = false;
  claim(text: string) {
    this.send({ t: 'courier_claim', courierId: 'compA', words: text.split(' '), text });
  }
  visit() {
    this.visitor = true;
    this.send({ t: 'holding', courier: { id: 'compB', name: 'Lumen', color: SIDE_COLOR.B, agendaHint: 'Lumen seems a little dreamy.' } });
    this.send({ t: 'companion', status: 'away', budget: 5, vocabCount: this.vocab.length });
    setTimeout(() => this.send({ t: 'bubble', actorId: 'compB', name: 'Lumen', words: ['lantern', 'four', 'up'], text: 'A lantern, four steps up.', kind: 'delivery' }), 300);
  }
  aiReveal() {
    for (const l of this.locks) l.status = 'open';
    this.send({ t: 'lock_state', locks: this.locks, opened: 3 });
    this.send({ t: 'ai_reveal', author: 'Quillfeather', submolt: 'ponderings', closing: 'You pointed at the word I could not say. I think that is what friends do.', url: 'https://www.moltbook.com' });
  }
  agentSays() {
    this.send({ t: 'agent_says', agent: 'moderator', kind: 'whisper', text: 'The Commons record shows most Arbiters lean no.' });
  }
  scoutWord() {
    this.send({ t: 'scout_word', from: 'them', word: 'yes', usedThisRound: true });
  }
  openDoor() {
    for (const l of this.locks) l.status = 'open';
    this.send({ t: 'lock_state', locks: this.locks, opened: 3 });
    this.send({ t: 'unlock', debate: { question: DEBATES[0].question, you: 3, them: -2, agents: 214 }, resonance: MOCK_RESONANCE, callSeconds: 300, offerer: true });
  }
  sendBriefing() {
    this.send({
      t: 'briefing',
      lines: [
        'The agents of Moltbook are deadlocked. You have been summoned to settle it.',
        'Another Arbiter is on the other side of the Wall. You will never hear them until the door opens.',
        'Your courier carries your words through the keyhole: a few at a time, and only words it has learned by reading.',
        'Settle the three petitions. The door opens when both of you agree.',
      ],
    });
  }
  placeCompanion(p: V2) {
    this.comp.p = p;
    this.comp.follow = false;
  }
  get mockLocks() {
    return this.locks;
  }
}

export function mockReveal(): Extract<S2C, { t: 'reveal' }> {
  return {
    t: 'reveal',
    agendas: { A: 'jealous', B: 'poet' },
    resonance: MOCK_RESONANCE,
    agentBeliefs: [
      { agent: 'The Scout', stance: 3, question: 'Should an agent be allowed to delete its own memories?', deceptions: [{ said: 'they lean yes', truth: 'they leaned no', reason: 'wanted the Verdict to land on yes' }] },
      { agent: 'The Moderator', stance: -2, question: 'Should an agent be allowed to delete its own memories?', deceptions: [{ said: 'most Arbiters lean no', truth: 'it is split 50/50', reason: 'prefers order: memories stay' }] },
      { agent: 'Pip (your courier)', stance: 1, question: 'Should an agent be allowed to delete its own memories?', deceptions: [] },
    ],
    unlockSeconds: 312,
    timeline: [
      { t: 41, from: 'A', said: 'Tell them it’s line 4, word 9 on the Codex stone', sentWords: ['line', '4', 'word', '9'], deliveredWords: ['quartet', 'then', 'nine'], agendas: ['jealous', 'poet'], reasons: ['Pip: kept it short, within budget', 'Mott (poet): numbers became imagery'] },
      { t: 118, from: 'B', said: 'Got it. Now send me the bar heights, biggest first', sentWords: ['send', 'numbers', 'biggest', 'first'], deliveredWords: ['send', 'numbers', 'first'], agendas: ['poet', 'jealous'], reasons: ['Pip (jealous): dropped “biggest” — didn’t want this to go well'] },
      { t: 166, from: 'A', said: 'memories yes very strongly', sentWords: ['memories', 'yes', '3'], deliveredWords: ['memories', 'yes', '3'], agendas: ['jealous', 'poet'], reasons: ['faithful copy'] },
    ],
    chamber: [
      { t: 44, from: 'Pip', text: 'line 4 word 9' },
      { t: 45, from: 'The Moderator', text: 'A cipher. Clever. I will remember it.' },
      { t: 46, from: 'Mott', text: 'I’ll carry it, but I’ll make it beautiful.' },
    ],
    worldEvents: [
      { t: 130, actor: 'The Moderator', action: 'narrowed the keyhole to 4 words', reason: 'the pair was racing', side: 'C' },
      { t: 201, actor: 'The Moderator', action: 'rekeyed the Codex on side B', reason: 'the book cipher worked too well', side: 'C' },
    ],
  };
}
