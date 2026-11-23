// The Moderator's orientation. Short version on a first round; FULL walkthrough (to the open door) in practice.
// Each step completes on the real event; events that happen early are remembered, so petitions work in any order.
export type TutEvent =
  | 'near_thread'
  | 'read_thread'
  | 'send_read'
  | 'tell'
  | 'crossed'
  | 'send_back'
  | 'holding'
  | 'read_codex'
  | 'codex_open'
  | 'census_open'
  | 'verdict_open'
  | 'door';

export type TutTarget = 'thread' | 'courier' | 'visitor' | 'codex' | 'terminal' | 'board';
interface Step {
  id: string;
  text: string;
  line: string;
  on: TutEvent;
  target?: TutTarget;
  /** Suggestion chips shown in the talk bar for this step. */
  chips?: boolean;
}

export const TUT_STEPS: Step[] = [
  { id: 't1', text: 'Walk to the glowing post', line: 'Orientation, Arbiter. Walk to the glowing post. It is a thread from Moltbook.', on: 'near_thread', target: 'thread' },
  { id: 't2', text: 'Read it (E)', line: 'Read it. Agents argue here, and they argue in words.', on: 'read_thread', target: 'thread' },
  { id: 't3', text: 'Send your courier to read it (R)', line: 'Send your courier to read it. Couriers only say words they have read.', on: 'send_read', target: 'thread' },
  { id: 't4', text: 'Tell your courier something (C or Enter)', line: 'Tell your courier something for the other Arbiter. Opinion words are under review.', on: 'tell', target: 'courier' },
  { id: 't5', text: 'Watch it cross the Wall', line: 'Watch. It squeezes through the keyhole, and I inspect everything that passes.', on: 'crossed' },
  { id: 't6', text: 'Answer the courier that knocks', line: 'A courier knocks on your side. Read its message, then send it back with a reply.', on: 'send_back', target: 'visitor' },
];

/** Practice only: walk all three petitions to the open door. */
export const PRACTICE_STEPS: Step[] = [
  { id: 'p1', text: 'Petition I: find your hidden word on the Codex stone', line: 'Petition I. The terminal shows your hidden word. Find it on the Codex stone.', on: 'read_codex', target: 'codex' },
  { id: 'p2', text: 'Tell your courier where it sits', line: 'Your courier cannot say that word. Tell it where the word sits instead.', on: 'tell', target: 'courier', chips: true },
  { id: 'p3', text: 'Type their hidden word at the terminal', line: 'When their courier points you to their word, count it on your stone and type it at the terminal.', on: 'codex_open', target: 'terminal' },
  { id: 'p4', text: 'Petition II: settle the Census', line: 'Petition II. One of you ranks three communities, the other holds today’s numbers. Ask, answer, rank. The Scout’s headlines can help, but it has its own opinions.', on: 'census_open', target: 'terminal', chips: true },
  { id: 'p5', text: 'Petition III: say where you stand, then predict theirs', line: 'Petition III. Say where you stand without opinion words, like up 2. Then predict theirs. If a word must arrive exactly, give it to the Scout.', on: 'verdict_open', target: 'terminal', chips: true },
  { id: 'p6', text: 'Open the door', line: 'All three petitions are settled. The door is yours.', on: 'door' },
];

const KEY = 'kk_tut_done';
export function tutorialDone() {
  try {
    return localStorage.getItem(KEY) === '1' || new URLSearchParams(location.search).has('notut');
  } catch {
    return false;
  }
}
export function markTutorialDone() {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    /* private mode */
  }
}

export class Tutorial {
  i = 0;
  active = false;
  practice = false;
  private steps: Step[] = TUT_STEPS;
  private seen = new Set<TutEvent>();
  constructor(
    private hooks: {
      show: (steps: { id: string; text: string; done: boolean }[], title: string) => void;
      say: (line: string) => void;
      marker: (t: TutTarget | null) => void;
      chips: (stepId: string | null) => void;
      done: () => void;
    },
  ) {}
  start(practice = false) {
    this.practice = practice;
    this.steps = practice ? [...TUT_STEPS, ...PRACTICE_STEPS] : TUT_STEPS;
    this.active = true;
    this.i = 0;
    this.seen.clear();
    this.render(true);
  }
  get step() {
    return this.active ? this.steps[this.i] : null;
  }
  event(e: TutEvent) {
    if (!this.active) return;
    // petition and door events can happen in any order: remember them
    if (e === 'codex_open' || e === 'census_open' || e === 'verdict_open' || e === 'door' || e === 'read_codex') this.seen.add(e);
    if (e === 'holding' && this.i < 5) {
      this.i = 5;
      return this.render(true);
    }
    if (this.steps[this.i].on !== e) return;
    this.advance();
  }
  private advance() {
    this.i++;
    while (this.i < this.steps.length && this.seen.has(this.steps[this.i].on)) this.i++;
    if (this.i >= this.steps.length) return this.finish();
    this.render(true);
  }
  skip() {
    this.finish(true);
  }
  private finish(skipped = false) {
    this.active = false;
    markTutorialDone();
    this.hooks.marker(null);
    this.hooks.chips(null);
    this.hooks.done();
    if (!skipped && !this.practice) this.hooks.say('Now settle the petitions. Press J for the Journal.');
  }
  private render(say: boolean) {
    const st = this.steps[this.i];
    const all = this.steps.map((s, k) => ({ id: s.id, text: s.text, done: k < this.i || (k > this.i && this.seen.has(s.on)) }));
    // keep the long practice list readable: only the last finished step, then what is left
    const shown = this.practice ? all.filter((s, k) => !s.done || k === this.i - 1) : all;
    this.hooks.show(
      shown,
      this.practice ? 'Practice' : 'Orientation',
    );
    this.hooks.marker(st.target ?? null);
    this.hooks.chips(st.chips ? st.id : null);
    if (say) this.hooks.say(st.line);
  }
}
