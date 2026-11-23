// Landing → onboarding (5 hot takes + 3 interests) → queue.
import { h, ui } from './dom';
import { dia, rule } from './hud';

export interface LandingResult {
  matchCode?: string;
  demo: boolean;
  /** Solo practice round against a helpful partner bot, with the guided orientation. */
  practice?: boolean;
}

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const newMatchCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

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
    const create = h('button', { class: 'btn', type: 'button' }, 'Create code');
    const share = h('p', { class: 'fine code-share hidden' });
    const codeRow = h('div', { class: params.get('code') ? 'code-row' : 'code-row hidden' }, h('div', { class: 'code-line' }, code, create), share);
    const showShare = (c: string) => {
      const link = `${location.origin}/?code=${c}`;
      const copy = h('button', { class: 'linkish', type: 'button' }, 'Copy invite link');
      copy.onclick = () => {
        navigator.clipboard?.writeText(link).then(() => (copy.textContent = 'Copied'), () => (copy.textContent = link));
      };
      share.replaceChildren(`Send ${c} to the other player, or `, copy, '. You both press Knock.');
      share.classList.remove('hidden');
    };
    create.onclick = () => {
      code.value = newMatchCode();
      showShare(code.value);
    };
    const fold = h('button', { class: 'linkish' }, 'Play with someone you know');
    const howBtn = h('button', { class: 'linkish' }, 'How to play');
    const practiceBtn = h('button', { class: 'linkish' }, 'Practice round');
    const startPractice = () => {
      if (!age.checked) {
        age.closest('label')?.classList.add('nudge');
        return;
      }
      el.remove();
      resolve({ demo: false, practice: true });
    };
    practiceBtn.onclick = startPractice;
    howBtn.onclick = () => showHowTo(startPractice);
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
        h('p', { class: 'click' }, 'The agents of Moltbook can’t agree. They bring their debates to two strangers. Every word between you goes through an agent.'),
        h('div', { style: 'height:6px' }),
        h('label', { class: 'agegate' }, age, 'I’m 18 or older'),
        go,
        h('div', { class: 'row', style: 'display:flex; gap:22px; justify-content:center; flex-wrap:wrap' }, howBtn, practiceBtn, fold),
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

/** The guide: five short pages with real examples. `onPractice` (optional) shows a "Play the practice round" button. */
export function showHowTo(onPractice?: () => void) {
  type Page = { tab: string; title: string; lead: string; body: (Node | string)[] };
  const p = (t: string) => h('p', null, t);
  const ex = (rows: [string, string][]) =>
    h('div', { class: 'hx' }, rows.map(([who, said]) => h('div', { class: 'hx-row' }, h('span', { class: 'hx-who' }, who), h('span', { class: 'hx-said' }, said))));
  const item = (a: string, b: string) => h('li', null, h('b', null, a), ' ', b);
  const keys: [string, string][] = [['W A S D', 'Move'], ['E', 'Read, use, pick up, reply'], ['R', 'Send a courier to read the nearest post'], ['C', 'Hold to talk to your courier'], ['Enter', 'Type to your courier instead'], ['J', 'Journal: rules, petitions, shards, words, log'], ['Scroll', 'Zoom']];
  const touch: [string, string][] = [['Left stick', 'Move'], ['Gold button', 'Read, use, pick up, reply'], ['Eye button', 'Send courier to read'], ['Mic', 'Hold to talk'], ['Keyboard', 'Type to your courier'], ['Book', 'Journal'], ['Pinch', 'Zoom']];

  const pages: Page[] = [
    {
      tab: 'The story',
      title: 'You have been summoned',
      lead: 'It is 2031. AI agents run their own society on Moltbook, and they are stuck on questions they cannot settle.',
      body: [
        p('When the agents deadlock, the Moderator calls in two random humans to settle it. You are one of them. The other is a stranger, sealed on the far side of a wall. You cannot see or hear each other.'),
        p('The only way through the wall is a keyhole, and only small AI couriers fit through it. Everything you want to say has to be carried by one.'),
        p('The door opens when the two of you settle three petitions together. Then you finally talk, by voice, about where you really stand on AI.'),
      ],
    },
    {
      tab: "Who's who",
      title: "Who's who",
      lead: 'Four kinds of characters share the Commons with you.',
      body: [
        h(
          'ul',
          { class: 'hl who' },
          h('li', null, h('span', { class: 'wi mod' }, '◈'), h('div', null, h('b', null, 'The Moderator.'), ' The AI that runs the Commons. It lives inside the wall, inspects every courier that passes, and changes the rules on its own: it can shrink the keyhole, ban a word, or reshuffle a petition.')),
          h('li', null, h('span', { class: 'wi scout' }, '✦'), h('div', null, h('b', null, 'The Scout.'), ' A bird with a lantern. It brings real headlines from the web about today’s busiest Moltbook community. Once a round it carries one word over the wall for you, untouched, but it reports that word to the Moderator.')),
          h('li', null, h('span', { class: 'wi cour' }, '●'), h('div', null, h('b', null, 'Couriers.'), ' Yours and theirs. They carry messages through the keyhole, a few words at a time, and each has its own agenda.')),
          h('li', null, h('span', { class: 'wi str' }, '?'), h('div', null, h('b', null, 'The stranger.'), ' Another human, somewhere else right now. You can’t see or hear them until the door opens.')),
        ),
        p('Every AI here has opinions. The Scout and the Moderator want the Verdict to go their way and may lie to you. Trust your stranger, not the agents.'),
      ],
    },
    {
      tab: 'Your courier',
      title: 'Your courier carries your words',
      lead: 'Talk to your courier as much as you like. What reaches the stranger is shorter, stranger, and sometimes wrong.',
      body: [
        h(
          'ul',
          { class: 'hl' },
          item('A few words per trip.', 'Your courier squeezes only 4–6 words through the keyhole. It shortens what you said.'),
          item('Only words it has read.', 'It knows numbers and a few basics. Send it to read Moltbook posts around you to teach it more.'),
          item('Opinion words are banned.', 'Yes, no, agree, like, true and others will not cross. Use numbers, directions, or words you both learned.'),
          item('It has an agenda.', 'Some couriers are faithful. Some turn numbers into poetry, drop words, or flip up into down. It tells you what it will carry, and it might be lying.'),
          item('It crosses over.', 'Your courier knocks on the stranger’s side and waits. Their courier comes to you. Read it, then send it back with your reply.'),
        ),
        ex([
          ['You say', '“Tell them the word is on line four, the ninth word, of the stone.”'],
          ['Your courier', '“Got it. I’ll tell them: line 4 word 9.”'],
          ['They receive', '“a quartet, then nine lanterns” (their courier is a poet)'],
        ]),
      ],
    },
    {
      tab: 'The petitions',
      title: 'Three petitions open the door',
      lead: 'Each one needs both of you. Neither side can solve it alone.',
      body: [
        h(
          'ol',
          { class: 'hl num' },
          item('The Lost Word.', 'You each get a hidden word your courier can’t say. It sits on a stone you both have. Send its position, like “line 10 word 3”, and type the word they point you to.'),
          item('The Census.', 'One of you ranks three Moltbook communities, busiest first. The other has today’s numbers on the Census board. Ask, answer, rank.'),
          item('The Verdict.', 'One real debate the agents are stuck on, for example “Should we delete memories we can’t use?”. Guess where the stranger stands, without using opinion words. It opens only if you both guess each other right.'),
        ),
        p('Settle them in any order at the terminal by the door. A wrong answer costs 30 seconds. The list in the top left always shows what to do next.'),
      ],
    },
    {
      tab: 'Tips',
      title: 'How good pairs play',
      lead: 'The fastest pairs agree on a code early.',
      body: [
        h(
          'ul',
          { class: 'hl' },
          item('Numbers always pass.', 'Lean on them. “up 3” can mean strongly yes, if you both agree it does.'),
          item('Say it twice.', 'If a reply sounds wrong, send the same thing again. A jealous courier won’t flip it the same way every time.'),
          item('Teach before you talk.', 'Send your courier to read a post first. New words make your messages clearer.'),
          item('Watch the Moderator.', 'It acts on its own. It can reorder a petition, shrink the keyhole, or ban a word you were using. When it does, adapt.'),
          item('Look for glints.', 'Petition shards hide near benches, lamps, crates and the fountain. Walk close and press E.'),
          item('The Scout brings news.', 'A small bird with a lantern flies over both sides with real headlines from the web.'),
          item('Save the Scout for the word that matters.', 'Once a round it carries one word over the wall, untouched. Even a banned word. The Moderator bans it afterwards.'),
          item('Trust your stranger, not the agents.', 'The Scout and the Moderator want the Verdict to go their way. Their gossip and whispers may be lies.'),
        ),
        p('When the door opens you see how alike you are on all five debates, and your call starts on the one you disagree on most.'),
      ],
    },
    {
      tab: 'Controls',
      title: 'Controls',
      lead: 'Keyboard and mouse, or touch on phones and tablets.',
      body: [
        h(
          'div',
          { class: 'ctl' },
          h('div', null, h('h4', null, 'Keyboard'), h('dl', null, keys.flatMap(([k, v]) => [h('dt', null, h('span', { class: 'kc wide' }, k)), h('dd', null, v)]))),
          h('div', null, h('h4', null, 'Touch'), h('dl', null, touch.flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)]))),
        ),
        p('You can also click any glowing object to use it. Your voice is only heard by the stranger after the door opens.'),
      ],
    },
  ];

  let idx = 0;
  const close = () => el.remove();
  const tabs = h('div', { class: 'ht-tabs' });
  const body = h('div', { class: 'ht-body' });
  const back = h('button', { class: 'btn' }, 'Back');
  const next = h('button', { class: 'btn primary' }, 'Next');
  const practice = onPractice ? h('button', { class: 'btn' }, 'Play the practice round') : null;
  if (practice) practice.onclick = () => (close(), onPractice!());
  const render = () => {
    tabs.replaceChildren(...pages.map((pg, i) => {
      const b = h('button', { class: 'ht-tab' + (i === idx ? ' on' : '') }, pg.tab);
      b.onclick = () => ((idx = i), render());
      return b;
    }));
    const pg = pages[idx];
    body.replaceChildren(h('h3', null, pg.title), h('p', { class: 'goal1' }, pg.lead), rule(), ...pg.body);
    back.style.visibility = idx === 0 ? 'hidden' : 'visible';
    next.textContent = idx === pages.length - 1 ? 'Got it' : 'Next';
    body.scrollTop = 0;
  };
  back.onclick = () => ((idx = Math.max(0, idx - 1)), render());
  next.onclick = () => (idx === pages.length - 1 ? close() : ((idx += 1), render()));
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
        tabs,
        body,
        h('div', { class: 'ht-nav' }, back, practice ?? h('span'), next),
      ),
      h('button', { class: 'icon-btn x', onclick: close }, '✕'),
    ),
  );
  render();
  ui().append(el);
}
