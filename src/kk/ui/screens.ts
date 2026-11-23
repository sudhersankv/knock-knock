// Landing → onboarding (5 hot takes + 3 interests) → queue.
import { h, ui } from './dom';
import { dia, rule } from './hud';

export interface LandingResult {
  matchCode?: string;
  demo: boolean;
}

function motes(n = 34) {
  const box = h('div', { class: 'motes' });
  for (let i = 0; i < n; i++) {
    const m = h('i', { class: 'mote' });
    m.style.left = `${Math.random() * 100}%`;
    m.style.top = `${40 + Math.random() * 65}%`;
    m.style.setProperty('--dx', `${(Math.random() - 0.5) * 120}px`);
    m.style.animationDuration = `${6 + Math.random() * 8}s`;
    m.style.animationDelay = `${-Math.random() * 12}s`;
    box.append(m);
  }
  return box;
}

export function showLanding(): Promise<LandingResult> {
  return new Promise((resolve) => {
    const params = new URLSearchParams(location.search);
    const code = h('input', { class: 'field code', placeholder: 'CODE', maxLength: 12, value: params.get('code') ?? '', autocapitalize: 'characters' }) as HTMLInputElement;
    const codeRow = h('div', { class: params.get('code') ? '' : 'hidden' }, code);
    const fold = h('button', { class: 'linkish' }, 'Have a match code?');
    const howBtn = h('button', { class: 'linkish' }, 'How to play');
    howBtn.onclick = () => showHowTo();
    fold.onclick = () => {
      codeRow.classList.toggle('hidden');
      code.focus();
    };
    const age = h('input', { type: 'checkbox' }) as HTMLInputElement;
    const go = h('button', { class: 'btn primary', disabled: true, style: 'font-size:22px; padding:12px 56px 13px' }, 'Knock') as HTMLButtonElement;
    age.addEventListener('change', () => (go.disabled = !age.checked));
    const el = h(
      'div',
      { class: 'screen' },
      motes(),
      h(
        'div',
        { class: 'col' },
        h('div', { class: 'keyhole' }),
        h('h1', { class: 'logo' }, 'Knock Knock', h('small', null, 'A summons to the Commons')),
        h('div', { class: 'rule', style: 'width:min(460px,80vw); color: var(--gold)' }, h('i'), h('i')),
        h('p', { class: 'tagline' }, 'Two strangers. One door. A messenger with its own agenda.'),
        h('div', { style: 'height:6px' }),
        h('label', { class: 'agegate' }, age, 'I’m 18 or older'),
        go,
        h('div', { class: 'row', style: 'display:flex; gap:22px; justify-content:center' }, howBtn, fold),
        codeRow,
        h('p', { class: 'fine' }, 'Voice only after the door opens. Codenames only. Hang up anytime.'),
      ),
    );
    go.addEventListener('click', () => {
      el.remove();
      const c = code.value.trim().toUpperCase();
      resolve({ matchCode: c || undefined, demo: params.has('demo') });
    });
    ui().append(el);
  });
}

export interface Onboarding {
  takes: Record<string, number>;
  interests: string[];
}

export function showOnboarding(debates: { id: string; question: string }[], interests: string[]): Promise<Onboarding> {
  return new Promise((resolve) => {
    const takes: Record<string, number> = {};
    const root = h('div', { class: 'screen' }, motes(18));
    const stageEl = h('div', { class: 'col' });
    root.append(stageEl);
    ui().append(root);
    let i = 0;

    const renderTake = () => {
      stageEl.innerHTML = '';
      if (i >= debates.length) return renderInterests();
      const d = debates[i];
      let stance: 1 | -1 | 0 = 0;
      let strength = 2;
      const yes = h('button', { class: 'btn yes' }, 'Yes');
      const no = h('button', { class: 'btn no' }, 'No');
      const yn = h('div', { class: 'yn' }, yes, no);
      const segs = [1, 2, 3].map((n) => h('button', { class: 'seg' }, ...Array.from({ length: n }, () => h('i')), ['A bit', 'Fairly', 'Very'][n - 1]));
      const next = h('button', { class: 'btn primary small', disabled: true }, i === debates.length - 1 ? 'Done' : 'Next') as HTMLButtonElement;
      const sync = () => {
        yes.classList.toggle('on', stance === 1);
        no.classList.toggle('on', stance === -1);
        yn.classList.toggle('chosen', stance !== 0);
        segs.forEach((b, k) => b.classList.toggle('on', k + 1 === strength));
        next.disabled = stance === 0;
      };
      yes.onclick = () => ((stance = 1), sync());
      no.onclick = () => ((stance = -1), sync());
      segs.forEach((b, k) => (b.onclick = () => ((strength = k + 1), sync())));
      next.onclick = () => {
        takes[d.id] = stance * strength;
        i++;
        renderTake();
      };
      sync();
      stageEl.append(
        h(
          'div',
          { class: 'drop' },
          h(
            'div',
            { class: 'take-card frame solid' },
            h('div', { class: 'top' }, h('span', { class: 'src' }, 'The agents can’t settle these. Where do you stand?'), h('span', { class: 'count' }, `${['I', 'II', 'III', 'IV', 'V'][i] ?? i + 1} of ${['I', 'II', 'III', 'IV', 'V'][debates.length - 1] ?? debates.length}`)),
            h('div', { class: 'q' }, d.question),
            yn,
            h('div', { class: 'strength' }, h('span', null, 'How strongly?'), segs),
            h('div', { class: 'next-row' }, next),
          ),
        ),
        h('p', { class: 'fine' }, 'Real deadlocked debates from Moltbook. The other Arbiter will try to read you.'),
      );
    };

    const renderInterests = () => {
      stageEl.innerHTML = '';
      const picked = new Set<string>();
      const go = h('button', { class: 'btn primary', disabled: true }, 'Find a stranger') as HTMLButtonElement;
      const chips = interests.map((it) => {
        const c = h('button', { class: 'chip' }, it);
        c.onclick = () => {
          if (picked.has(it)) picked.delete(it);
          else if (picked.size < 3) picked.add(it);
          c.classList.toggle('on', picked.has(it));
          go.disabled = picked.size !== 3;
        };
        return c;
      });
      go.onclick = () => {
        root.remove();
        resolve({ takes, interests: [...picked] });
      };
      stageEl.append(h('h2', { class: 'h2' }, 'Three Things You Love'), h('div', { class: 'rule', style: 'width:min(420px,80vw); color: var(--gold)' }, h('i'), h('i')), h('div', { class: 'chips' }, chips), h('div', { style: 'height:8px' }), go);
    };
    if (!debates.length) renderInterests();
    else renderTake();
  });
}

export class QueueScreen {
  el: HTMLElement;
  private doors: HTMLElement[];
  private timer = 0;
  private info: HTMLElement;
  constructor(codename: string) {
    this.doors = Array.from({ length: 7 }, () => h('div', { class: 'd' }));
    this.info = h('p', { class: 'fine', style: 'font-size:16px' }, 'Knocking on doors…');
    this.el = h(
      'div',
      { class: 'screen' },
      motes(20),
      h('div', { class: 'col' }, h('div', { class: 'fine' }, 'Arbiter'), h('div', { class: 'codename' }, dia('me'), codename, dia('me')), rule(), h('div', { class: 'hall' }, this.doors), this.info),
    );
    ui().append(this.el);
    let k = 0;
    this.timer = window.setInterval(() => {
      this.doors.forEach((d, i) => d.classList.toggle('scan', i === k % this.doors.length));
      k++;
    }, 280);
  }
  setInfo(text: string) {
    this.info.textContent = text;
  }
  matched(partner: string): Promise<void> {
    clearInterval(this.timer);
    this.doors.forEach((d) => d.classList.remove('scan'));
    this.doors[3].classList.add('lit');
    this.info.innerHTML = '';
    this.info.append('Another Arbiter answered: ', h('b', { style: 'color: var(--them)' }, partner));
    return new Promise((r) => setTimeout(() => (this.el.remove(), r()), 1400));
  }
  remove() {
    clearInterval(this.timer);
    this.el.remove();
  }
}

/** A single quiet card: goal, 5 rules in order of play, controls. */
export function showHowTo() {
  const rules = [
    ['Explore your side of the Commons.', 'Read Moltbook threads. Pick up petition shards that glint.'],
    ['Send your courier to read.', 'It can only say words it has read. Numbers always pass.'],
    ['Tell your courier a short message.', 'It squeezes through the keyhole and knocks on their side.'],
    ['When their courier knocks, answer it.', 'Read what it carried, then send it back with your reply.'],
    ['Settle the three petitions at the terminal.', 'Opinion words are banned. Invent another way to be understood.'],
  ];
  const keys: [string, string][] = [['W A S D', 'Move'], ['E', 'Read, use, pick up'], ['R', 'Send courier to read'], ['C', 'Hold to talk'], ['Enter', 'Type to your courier'], ['J', 'Journal']];
  const touch: [string, string][] = [['Left stick', 'Move'], ['Gold button', 'Read, use, reply'], ['Mic', 'Hold to talk'], ['Keyboard', 'Type'], ['Book', 'Journal']];
  const close = () => el.remove();
  const el = h(
    'div',
    { class: 'modal-wrap', onclick: (e: Event) => e.target === el && close() },
    h(
      'div',
      { class: 'mwrap' },
      h(
        'div',
        { class: 'modal frame solid howto' },
        h('h2', null, 'How to Play'),
        h('p', { class: 'goal1' }, 'Open the door between you and a stranger by settling three petitions together.'),
        rule(),
        h('ol', { class: 'steps' }, rules.map(([a, b], i) => h('li', null, h('span', { class: 'n' }, ['I', 'II', 'III', 'IV', 'V'][i]), h('div', null, a, h('small', null, b))))),
        h(
          'div',
          { class: 'ctl' },
          h('div', null, h('h4', null, 'Keyboard'), h('dl', null, keys.flatMap(([k, v]) => [h('dt', null, h('span', { class: 'kc wide' }, k)), h('dd', null, v)]))),
          h('div', null, h('h4', null, 'Touch'), h('dl', null, touch.flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)]))),
        ),
        h('div', { style: 'display:flex; justify-content:center; margin-top:18px' }, h('button', { class: 'btn primary', onclick: close }, 'Got it')),
      ),
      h('button', { class: 'icon-btn x', onclick: close }, '✕'),
    ),
  );
  ui().append(el);
}
