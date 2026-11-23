// Solo PRACTICE mode: an in-process partner bot plays Arbiter B as a patient, helpful stranger.
// It talks to the room only through room.handle('B', ...) like a real client, and reads the room's
// messages through a fake socket. It "cheats" (knows the pass word and the human's stance) but only
// acts after the human has done the thing the tutorial is teaching.
import { at, type V2 } from '../../shared/kk/layout';
import type { C2S, S2C, LockInfo } from '../../shared/kk/protocol';
import { Room, sendTo, type Player } from './room';
import { codename } from './match';
import { loadPack } from './pack';
import { log } from './env';

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function startPractice(human: Player) {
  const brain = new PracticeBrain();
  const fakeWs: any = { readyState: 1, OPEN: 1, send: (s: string) => brain.onMsg(JSON.parse(s) as S2C) };
  const debates = loadPack().debates.slice(0, 5);
  const takes: Record<string, number> = {};
  // a stranger who disagrees with the human on some things (so the Verdict debate has a real split)
  for (const d of debates) {
    const h = human.takes[d.threadId] ?? 0;
    takes[d.threadId] = h ? -Math.sign(h) * (Math.random() < 0.5 ? 2 : 1) : Math.random() < 0.5 ? 2 : -2;
  }
  const bot: Player = { id: `bot-${Math.random().toString(36).slice(2, 6)}`, ws: fakeWs, codename: codename(), takes, interests: human.interests.slice(0, 2), demo: true, room: null, p: [...at('B', 'spawn')] as V2, ry: 0, anim: 'idle' };
  const room = new Room(human, bot, { demo: true, difficulty: 'easy', practice: true });
  brain.attach(room, bot);
  // the bot's courier knows a few friendly words so its first hello survives the keyhole
  for (const w of ['hello', 'arbiter', 'numbers', 'pass', 'opinions', 'friend']) room.comps.B.vocab.add(w);
  // practice is about learning the loop, not vocabulary hunting: the human's courier knows the district names
  for (const e of room.locks.pulse.entries) room.comps.A.vocab.add(e.submolt);
  log('practice', `room ${room.id}: ${human.codename} vs partner bot ${bot.codename}`);
  return room;
}

class PracticeBrain {
  room!: Room;
  me!: Player;
  locks: LockInfo[] = [];
  humanSentNumbers = false;
  humanMentionedStance = false;
  private codexScheduled = false;
  private predictScheduled = false;
  private greeted = false;
  private replying = false;
  private timers: NodeJS.Timeout[] = [];
  private wander = 0;

  attach(room: Room, me: Player) {
    this.room = room;
    this.me = me;
    // wander gently near spawn so the human's courier has someone to walk to
    const iv = setInterval(() => {
      if (this.room.phase === 'over') return clearInterval(iv);
      this.wander += 0.15;
      const [x, z] = at('B', 'spawn');
      this.act({ t: 'move', p: [x + Math.sin(this.wander) * 1.2, z + Math.cos(this.wander * 0.7) * 0.8], ry: 0, anim: 'idle' });
    }, 150);
    this.later(rand(9, 13), () => this.greet());
  }

  private act(m: C2S) {
    if (this.room.phase === 'over') return;
    this.room.handle('B', m);
  }
  private later(sec: number, fn: () => void) {
    this.timers.push(setTimeout(() => {
      if (this.room?.phase !== 'over') fn();
    }, sec * 1000));
  }

  /** The bot sends ITS courier once, early, so the human experiences receiving + send_back. */
  private greet() {
    if (this.greeted) return;
    const c = this.room.comps.B;
    if (c.at !== 'B' || c.busy) return this.later(5, () => this.greet());
    this.greeted = true;
    this.act({ t: 'tell', text: 'hello arbiter, numbers pass, opinions not' });
  }

  onMsg(m: S2C) {
    try {
      this.handleMsg(m);
    } catch (e: any) {
      log('practice', `brain error: ${e?.message}`);
    }
  }
  private handleMsg(m: S2C) {
    if (m.t === 'matched') this.locks = m.locks;
    if (!this.room) return; // messages sent during Room construction
    switch (m.t) {
      case 'matched':
      case 'lock_state':
        this.locks = m.locks;
        this.checkPredict();
        break;
      case 'bubble':
        if (m.kind === 'delivery' && m.actorId === 'comp-A') {
          const nums = (m.words.join(' ').match(/\d+|\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/g) ?? []).length;
          if (nums >= 2) this.humanSentNumbers = true;
          if (/\b(up|down|more|less|top|bottom)\b/.test(m.words.join(' '))) this.humanMentionedStance = true;
          this.maybeEnterCodex();
        }
        break;
      case 'holding':
        if (m.courier && !this.replying) {
          this.replying = true;
          this.later(rand(4, 8), () => this.reply());
        }
        break;
    }
  }

  private status(id: string) {
    return this.room.locks.status[id as 'codex' | 'pulse' | 'common'];
  }

  /** Helpful reply via the human's visiting courier. */
  private reply() {
    this.replying = false;
    const c = this.room.comps.A;
    if (c.at !== 'B' || !c.held) return;
    const parts: string[] = [];
    if (this.status('codex') !== 'open' && !this.humanSentNumbers) parts.push('send line number and word number');
    else if (this.status('pulse') !== 'open') {
      parts.push(`busiest ${this.room.locks.pulse.entries.map((e) => e.submolt).join(' then ')}`);
    } else {
      const v = this.me.takes[this.room.locks.verdict.threadId] ?? 2;
      parts.push(`${v > 0 ? 'up' : 'down'} ${Math.min(3, Math.abs(v)) || 2}`);
    }
    // once the Verdict is the open question (or the human talks stances), always include our stance
    if ((this.humanMentionedStance || (this.status('codex') === 'open' && this.status('pulse') === 'open')) && !parts[0].startsWith('up') && !parts[0].startsWith('down')) {
      const v = this.me.takes[this.room.locks.verdict.threadId] ?? 2;
      parts.push(`${v > 0 ? 'up' : 'down'} ${Math.min(3, Math.abs(v)) || 2}`);
    }
    this.act({ t: 'send_back', text: parts.join(', ') });
  }

  private maybeEnterCodex() {
    if (this.codexScheduled || !this.humanSentNumbers || this.status('codex') === 'open') return;
    this.codexScheduled = true;
    this.later(rand(5, 8), () => {
      this.act({ t: 'lock_submit', lockId: 'codex', answer: this.room.locks.codex.passWord });
    });
  }

  /** Seal our Verdict prediction (correctly) only after the human has sealed theirs. */
  private checkPredict() {
    if (this.predictScheduled || this.status('common') === 'open') return;
    const li = this.locks.find((l) => l.id === 'common');
    if (!li?.partnerStatus || !/filed a prediction/i.test(li.partnerStatus)) return;
    this.predictScheduled = true;
    this.later(rand(4, 7), () => {
      this.predictScheduled = false;
      const s = this.room.locks.stance('A');
      this.act({ t: 'lock_submit', lockId: 'common', answer: `${s.lean > 0 ? 'yes' : 'no'}:${s.strength}` });
    });
  }
}
void sendTo;
