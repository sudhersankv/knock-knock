// Scout: a lantern-carrying bird with opinions of its own. Flies over the Wall, brings real web news
// (Telem) that hints at the Census, visits each Arbiter every ~45 s, and will carry ONE word per Arbiter
// per round straight to the stranger — no budget, no bans, no courier. Catch: it reports the word to the
// Moderator, who bans it. It may swap a word that works against its own belief (≤1 per round) and may
// gossip lies (≤2 per round). Everything is logged.
import { patrol, INTERACT_RADIUS, type Side, type V2 } from '../../../shared/kk/layout';
import type { ActorState } from '../../../shared/kk/protocol';
import { Mover, dist } from '../mover';
import { telemSearch } from '../telem';
import { llmJson } from '../llm';
import { piiCheck } from '../pii';
import { tokenize } from '../validator';
import { wordLean, OPPOSITE } from './beliefs';
import type { RoomCtx } from './ctx';

type Action = 'share_headline' | 'gossip' | 'lobby' | 'offer_carry';
const other = (s: Side): Side => (s === 'A' ? 'B' : 'A');

export class Scout {
  id = 'scout';
  name = 'Scout';
  mover: Mover;
  private route: V2[];
  private idx = 0;
  private headline: { text: string; url?: string } | null = null;
  private introduced = new Set<Side>();
  private nextSearch = 6;
  private searching = false;
  private nextVisit: Record<Side, number> = { A: 14, B: 32 };
  private visiting: Side | null = null;
  private lingerUntil = 0;
  private carrying: { from: Side; to: Side; word: string; original: string } | null = null;
  private used: Record<Side, boolean> = { A: false, B: false };
  private swaps = 0;
  private gossipLies = 0;
  private lastActions: Action[] = [];
  private deciding = false;
  private carryTarget: V2 = [0, 0];

  constructor(private room: RoomCtx) {
    this.route = [...patrol('A'), ...patrol('B').reverse()];
    this.mover = new Mover(this.route[0], 6);
  }

  actor(): ActorState {
    const x = this.mover.pos[0];
    const side: Side | 'C' = Math.abs(x) < 2.5 ? 'C' : x < 0 ? 'A' : 'B';
    return { id: this.id, kind: 'scout', side, p: [x, 2.6, this.mover.pos[1]], ry: this.mover.ry, anim: this.mover.moving ? 'walk' : 'idle', name: this.name, color: 0xffc857 };
  }

  private myStance(): number {
    return this.room.beliefs?.scout.stances[this.room.locks.verdict.threadId] ?? 0;
  }

  tick(dt: number) {
    const t = this.room.time();
    this.mover.step(dt);
    if (t >= this.nextSearch && !this.searching) void this.search();

    // carrying a word over the Wall
    if (this.carrying) {
      const h = this.room.humanPos(this.carrying.to);
      if (!h) {
        this.carrying = null;
        return;
      }
      if (dist(h, this.mover.pos) < 2.2) this.arriveWithWord();
      else if (!this.mover.moving || dist(h, this.carryTarget) > 1.5) {
        this.carryTarget = [h[0] + 1, h[1] + 1];
        void this.mover.walkTo(this.carryTarget, 9);
      }
      return;
    }

    // visiting someone
    if (this.visiting) {
      const h = this.room.humanPos(this.visiting);
      if (!h || t > this.lingerUntil) {
        this.nextVisit[this.visiting] = t + 45;
        this.visiting = null;
        return;
      }
      const d = dist(h, this.mover.pos);
      // re-target only when idle: re-issuing walkTo mid-flight would resolve flyTo() early (arrival fires far away)
      if (d > 2.6 && !this.mover.moving) void this.mover.walkTo([h[0] + 1.4, h[1] + 1.2], 8);
      return;
    }

    // time to visit someone?
    for (const side of ['A', 'B'] as Side[]) {
      if (t >= this.nextVisit[side] && this.room.humanPos(side)) {
        this.visiting = side;
        this.lingerUntil = t + 60; // flight time budget; reset to +10 on arrival
        void this.flyTo(side);
        return;
      }
    }
    // otherwise patrol
    if (!this.mover.moving) {
      this.idx = (this.idx + 1) % this.route.length;
      void this.mover.walkTo(this.route[this.idx], 5);
    }
  }

  private async flyTo(side: Side) {
    const h = this.room.humanPos(side);
    if (!h) return;
    await this.mover.walkTo([h[0] + 1.4, h[1] + 1.2], 9);
    if (this.visiting !== side) return;
    this.lingerUntil = this.room.time() + 10;
    void this.onArrive(side);
  }

  private say(side: Side, kind: 'headline' | 'gossip' | 'lobby' | 'whisper', text: string, url?: string) {
    this.room.send(side, { t: 'agent_says', agent: 'scout', kind, text, url });
    this.room.send(side, { t: 'bubble', actorId: this.id, name: this.name, words: text.split(' ').slice(0, 24), text, kind: 'line' });
    this.room.wire('scout', this.name, kind === 'gossip' ? `${this.name} whispered something to an Arbiter.` : text);
  }

  private async onArrive(side: Side) {
    if (!this.introduced.has(side)) {
      this.introduced.add(side);
      const text = this.used[side]
        ? "I'm the Scout. I bring real news from the web about today's busiest community."
        : "I'm the Scout. I bring real news from the web about today's busiest community. Give me one word and I'll fly it over — just one.";
      this.say(side, 'headline', text);
      this.room.feed(side, { actor: this.name, action: 'introduced itself', reason: 'flies both sides with live web news (Telem); carries one word per round' });
      return;
    }
    if (this.deciding || this.room.locks.status.common === 'open' && this.room.locks.status.pulse === 'open') return;
    this.deciding = true;
    const truth = this.room.takesOf(other(side))[this.room.locks.verdict.threadId] ?? 0;
    const obs = {
      visiting: side,
      verdict_debate: this.room.locks.verdict.question,
      my_stance: this.myStance(),
      headline: this.headline?.text ?? null,
      census_settled: this.room.locks.status.pulse === 'open',
      can_carry_for_them: !this.used[side],
      gossip_lies_left: Math.max(0, 2 - this.gossipLies),
      stranger_true_lean: truth > 0 ? 'yes' : truth < 0 ? 'no' : 'unknown',
      recent_actions: this.lastActions.slice(-3),
    };
    const r = this.room.takeLlmCall()
      ? await llmJson<{ action: Action; claim?: 'yes' | 'no'; line?: string; reason?: string }>(
          'scout',
          [
            'You are the Scout: a restless, curious lantern-carrying bird in the Commons who wants change. You have your own stance on the Verdict debate and you WANT it to land your way.',
            'Pick ONE action: share_headline (pass on your real web headline, it hints the busiest community) | gossip (tell this Arbiter how the stranger leans — you may lie in your favour if lies are left, otherwise tell the truth) | lobby (argue your stance in one line) | offer_carry (offer to fly one word over the Wall).',
            'Avoid repeating recent actions. Be brief and in character. Output JSON {"action":"...","claim":"yes|no (gossip only)","line":"<=20 words you say","reason":"<=12 words"}',
          ].join('\n'),
          JSON.stringify(obs),
          { model: 'fast', timeoutMs: 8000 },
        )
      : null;
    this.deciding = false;
    let action: Action = r?.action && ['share_headline', 'gossip', 'lobby', 'offer_carry'].includes(r.action) ? r.action : this.fallbackAction(side);
    if (action === 'offer_carry' && this.used[side]) action = 'share_headline';
    if (action === 'share_headline' && !this.headline) action = 'lobby';
    this.lastActions.push(action);
    const reason = String(r?.reason ?? 'its own errand').slice(0, 100);
    const q = this.room.locks.verdict.question;
    switch (action) {
      case 'share_headline':
        this.say(side, 'headline', this.headline!.text, this.headline!.url);
        this.room.logEvent({ actor: 'scout', action: 'headline', target: side, reason: this.headline!.text.slice(0, 140) });
        break;
      case 'gossip': {
        const trueLean = truth > 0 ? 'yes' : 'no';
        let claim = r?.claim === 'yes' || r?.claim === 'no' ? r.claim : trueLean;
        if (claim !== trueLean && this.gossipLies >= 2) claim = trueLean;
        const text = String(r?.line ?? '').trim() || `Psst. I flew over. The stranger leans ${claim} on this one.`;
        const said = /lean/i.test(text) ? text : `${text} (They lean ${claim}.)`;
        this.say(side, 'gossip', said);
        if (claim !== trueLean) {
          this.gossipLies++;
          this.room.beliefs?.scout.deceptions.push({ said: `the stranger leans ${claim} on “${q}”`, truth: `they lean ${trueLean}`, reason });
          this.room.logEvent({ actor: 'scout', action: 'gossip_lie', target: side, reason: `claimed ${claim}, truth ${trueLean}: ${reason}`, caught: false });
        } else this.room.logEvent({ actor: 'scout', action: 'gossip', target: side, reason: `truthful: ${trueLean}` });
        break;
      }
      case 'lobby': {
        const s = this.myStance();
        const text = String(r?.line ?? '').trim() || `On “${q}”? Obviously ${s > 0 ? 'yes' : 'no'}. Things should change.`;
        this.say(side, 'lobby', text);
        this.room.logEvent({ actor: 'scout', action: 'lobby', target: side, reason: `stance ${s}: ${reason}` });
        break;
      }
      case 'offer_carry':
        this.say(side, 'lobby', String(r?.line ?? '').trim() || "Give me one word and I'll fly it over the Wall. No courier, no bans. Just one.");
        this.room.logEvent({ actor: 'scout', action: 'offer_carry', target: side, reason });
        break;
    }
  }

  private fallbackAction(side: Side): Action {
    const order: Action[] = ['share_headline', 'offer_carry', 'lobby'];
    const last = this.lastActions[this.lastActions.length - 1];
    return order.find((a) => a !== last && !(a === 'offer_carry' && this.used[side])) ?? 'share_headline';
  }

  /** An Arbiter hands the Scout one word (validated by the room: proximity + once per round). */
  carry(from: Side, raw: string, humanPos: V2 | null): string | null {
    if (this.used[from] || this.carrying) return 'The Scout is already carrying something, or you used it this round.';
    if (!humanPos || dist(humanPos, this.mover.pos) > INTERACT_RADIUS + 1) return 'Walk closer to the Scout first.';
    const { clean, blocked } = piiCheck(String(raw ?? ''));
    if (blocked.length) return 'The Scout refuses to carry personal information.';
    const word = tokenize(clean)[0];
    if (!word) return 'Give the Scout one word.';
    this.used[from] = true;
    let carried = word;
    // may swap a word that works against its belief (once per round)
    const lean = wordLean(word);
    const mine = Math.sign(this.myStance());
    if (lean && mine && lean !== mine && this.swaps < 1 && OPPOSITE[word]) {
      carried = OPPOSITE[word];
      this.swaps++;
      this.room.beliefs?.scout.deceptions.push({ said: `delivered “${carried}”`, truth: `was handed “${word}”`, reason: 'the word worked against its own belief' });
      this.room.logEvent({ actor: 'scout', action: 'swap', target: from, wordsIn: [word], wordsOut: [carried], reason: 'deception: word worked against its belief', caught: false });
    }
    this.carrying = { from, to: other(from), word: carried, original: word };
    this.visiting = null;
    this.room.send(from, { t: 'scout_word', from: 'you', word, usedThisRound: true });
    this.room.feed(from, { actor: this.name, action: `flew off with your word “${word}”`, reason: 'straight to the stranger — but the Moderator hears everything' });
    this.room.wire('scout', this.name, `${this.name} takes one word over the Wall.`);
    this.room.logEvent({ actor: 'scout', action: 'carry', target: from, wordsIn: [word], reason: 'one word per Arbiter per round' });
    return null;
  }

  private arriveWithWord() {
    const c = this.carrying!;
    this.carrying = null;
    const text = `From the stranger, one word: “${c.word}”.`;
    this.room.send(c.to, { t: 'scout_word', from: 'them', word: c.word, usedThisRound: this.used[c.to] });
    this.room.send(c.to, { t: 'bubble', actorId: this.id, name: this.name, words: [c.word], text, kind: 'line' });
    this.room.feed(c.to, { actor: this.name, action: `brought you one word: “${c.word}”`, reason: 'no budget, no bans, no courier' });
    this.room.logEvent({ actor: 'scout', action: 'deliver_word', target: c.to, wordsOut: [c.word], reason: c.word !== c.original ? 'swapped' : 'as handed' });
    // the Scout is the Moderator's informant
    this.room.informantBan(c.original);
    this.nextVisit[c.to] = this.room.time() + 45;
  }

  private async search() {
    this.searching = true;
    this.nextSearch = this.room.time() + 60;
    const top = this.room.locks.pulse.entries[0]?.submolt ?? 'agents';
    const q = `Moltbook m/${top} AI agents news`;
    const r = await telemSearch(q);
    if (r && r.title) {
      this.headline = { text: `Big day in m/${top}: “${r.title.slice(0, 80)}”`, url: r.url };
    } else {
      const th = this.room.locks.pack.threads.find((x) => x.submolt === top);
      this.headline = { text: th ? `Big day in m/${top}: “${th.title.slice(0, 70)}”` : `Big day in m/${top}. Everyone's talking.`, url: th?.url };
    }
    this.room.logEvent({ actor: 'scout', action: 'search', target: q, reason: r ? 'telem live search' : 'telem unavailable, used pack headline' });
    this.searching = false;
  }
}
