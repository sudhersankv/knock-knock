// The Moderator's orientation (first round only, skippable). Each step completes on the real action.
export type TutEvent = 'near_thread' | 'read_thread' | 'send_read' | 'tell' | 'crossed' | 'send_back' | 'holding';

interface Step {
  id: string;
  text: string;
  line: string;
  on: TutEvent;
  target?: 'thread' | 'courier' | 'visitor';
}

export const TUT_STEPS: Step[] = [
  { id: 't1', text: 'Walk to the glowing post', line: 'Orientation, Arbiter. Walk to the glowing post. It is a thread from Moltbook.', on: 'near_thread', target: 'thread' },
  { id: 't2', text: 'Read it (E)', line: 'Read it. Agents argue here, and they argue in words.', on: 'read_thread', target: 'thread' },
  { id: 't3', text: 'Send your courier to read it (R)', line: 'Send your courier to read it. Couriers only say words they have read.', on: 'send_read', target: 'thread' },
  { id: 't4', text: 'Tell your courier something (C or Enter)', line: 'Tell your courier something for the other Arbiter. Opinion words are under review.', on: 'tell', target: 'courier' },
  { id: 't5', text: 'Watch it cross the Wall', line: 'Watch. It squeezes through the keyhole, and I inspect everything that passes.', on: 'crossed' },
  { id: 't6', text: 'Answer the courier that knocks', line: 'A courier knocks on your side. Read its message, then send it back with a reply.', on: 'send_back', target: 'visitor' },
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
  constructor(private hooks: { show: (steps: { id: string; text: string; done: boolean }[]) => void; say: (line: string) => void; marker: (t: Step['target'] | null) => void; done: () => void }) {}
  start() {
    this.active = true;
    this.i = 0;
    this.render(true);
  }
  get step() {
    return this.active ? TUT_STEPS[this.i] : null;
  }
  event(e: TutEvent) {
    if (!this.active) return;
    // a knock can arrive before the player reaches step 6: jump ahead
    if (e === 'holding' && this.i < 5) {
      this.i = 5;
      return this.render(true);
    }
    if (TUT_STEPS[this.i].on !== e) return;
    this.i++;
    if (this.i >= TUT_STEPS.length) return this.finish();
    this.render(true);
  }
  skip() {
    this.finish(true);
  }
  private finish(skipped = false) {
    this.active = false;
    markTutorialDone();
    this.hooks.marker(null);
    this.hooks.done();
    if (!skipped) this.hooks.say('Now settle the petitions. Press J for the Journal.');
  }
  private render(say: boolean) {
    const st = TUT_STEPS[this.i];
    this.hooks.show(TUT_STEPS.map((s, k) => ({ id: s.id, text: s.text, done: k < this.i })));
    this.hooks.marker(st.target ?? null);
    if (say) this.hooks.say(st.line);
  }
}
