// Scout: a lantern-carrying bird that flies both sides, searches the live web (Telem) for news about the
// busiest submolts, and trades hints for words. Has its own schedule; nobody commands it.
import { patrol, SIDE_COLOR, type Side, type V2 } from '../../../shared/kk/layout';
import type { ActorState, LockId } from '../../../shared/kk/protocol';
import { Mover, dist } from '../mover';
import { telemSearch } from '../telem';
import type { RoomCtx } from './ctx';

export class Scout {
  id = 'scout';
  name = 'Scout';
  mover: Mover;
  private route: V2[];
  private idx = 0;
  private headline: { text: string; url?: string } | null = null;
  private toldHeadline = new Set<Side>();
  private nextSearch = 8;
  private searching = false;
  private hintGiven = new Set<string>();
  private pauseUntil = 0;

  constructor(private room: RoomCtx) {
    this.route = [...patrol('A'), ...patrol('B').reverse()];
    this.mover = new Mover(this.route[0], 5.5);
  }

  actor(): ActorState {
    const x = this.mover.pos[0];
    const side: Side | 'C' = Math.abs(x) < 2.5 ? 'C' : x < 0 ? 'A' : 'B';
    return { id: this.id, kind: 'scout', side, p: [x, 2.6, this.mover.pos[1]], ry: this.mover.ry, anim: this.mover.moving ? 'walk' : 'idle', name: this.name, color: 0xffc857 };
  }

  tick(dt: number) {
    const t = this.room.time();
    if (t < this.pauseUntil) return;
    if (!this.mover.moving) {
      this.idx = (this.idx + 1) % this.route.length;
      void this.mover.walkTo(this.route[this.idx]);
    }
    this.mover.step(dt);
    if (t >= this.nextSearch && !this.searching) void this.search();
    // meet humans
    for (const side of ['A', 'B'] as Side[]) {
      const h = this.room.humanPos(side);
      if (!h || dist(h, this.mover.pos) > 5) continue;
      if (this.headline && !this.toldHeadline.has(side)) {
        this.toldHeadline.add(side);
        this.pauseUntil = t + 2.5;
        this.room.send(side, { t: 'bubble', actorId: this.id, name: this.name, words: this.headline.text.split(' ').slice(0, 14), text: this.headline.text, kind: 'line' });
        this.room.feed(side, { actor: this.name, action: 'dropped a live headline', reason: 'first to know anything new' });
        this.room.logEvent({ actor: 'scout', action: 'headline', target: side, reason: this.headline.text.slice(0, 120) });
        continue;
      }
      // stuck for a while: trade a hint for one of the companion's learned words
      const stuckLock = this.stuckLock();
      const key = `${side}:${stuckLock}`;
      if (stuckLock && !this.hintGiven.has(key) && t > (this.room.demo ? 100 : 150)) {
        const comp = this.room.companion(side);
        const lost = comp.loseWord();
        this.hintGiven.add(key);
        this.pauseUntil = t + 2.5;
        const hint = this.room.locks.hint(stuckLock);
        const text = lost ? `I'll take “${lost}” off your courier. ${hint}` : `Free hint, kid: ${hint}`;
        this.room.send(side, { t: 'bubble', actorId: this.id, name: this.name, words: text.split(' '), text, kind: 'line' });
        this.room.feed(side, { actor: this.name, action: lost ? `traded a hint for the word “${lost}”` : 'gave a free hint', reason: 'you looked stuck' });
        this.room.logEvent({ actor: 'scout', action: 'trade', target: side, wordsIn: lost ? [lost] : [], reason: hint });
      }
    }
  }

  private stuckLock(): LockId | null {
    const order: LockId[] = ['codex', 'pulse', 'common'];
    return order.find((l) => this.room.locks.status[l] !== 'open') ?? null;
  }

  private async search() {
    this.searching = true;
    this.nextSearch = this.room.time() + 60;
    const entries = this.room.locks.pulse.entries;
    const sub = entries[Math.floor(Math.random() * entries.length)]?.submolt ?? 'agents';
    const q = `Moltbook AI agents ${sub} news`;
    const r = await telemSearch(q);
    if (r && r.title) {
      this.headline = { text: `Hot off the wire: “${r.title.slice(0, 80)}” — m/${sub} is buzzing.`, url: r.url };
    } else {
      // fallback: headline from the busiest submolt's own threads (still real Moltbook data)
      const top = entries[0]?.submolt;
      const th = this.room.locks.pack.threads.find((x) => x.submolt === top);
      this.headline = { text: th ? `Word on the wire: m/${top} is busiest — “${th.title.slice(0, 60)}”` : 'No news today.' };
    }
    this.toldHeadline.clear();
    this.room.logEvent({ actor: 'scout', action: 'search', target: q, reason: r ? 'telem live search' : 'telem unavailable, used pack headline' });
    this.searching = false;
  }
}
void SIDE_COLOR;
