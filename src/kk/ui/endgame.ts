// Call overlay (after the door opens) and the Reveal (said vs delivered), framed as the settled deadlock.
import type { S2C } from '../../../shared/kk/protocol';
import { fmtTime, h, ui } from './dom';
import { AGENDA_ART } from './icons';
import { dia, rule } from './hud';

export type Debate = { question: string; you: number; them: number; agents?: number; url?: string; author?: string };
export type Resonance = {
  agreed: number;
  total: number;
  biggestSplit: { question: string; you: number; them: number } | null;
  readRight: boolean;
  deepRead: boolean;
  rows?: { question: string; you: number; them: number }[];
};
export const readLine = (r: Resonance) => (r.deepRead ? 'You read each other perfectly.' : r.readRight ? 'You read each other right.' : 'You read each other well enough.');
export function resonanceBlock(r: Resonance) {
  return h(
    'div',
    { class: 'reso' },
    h('div', { class: 'r1' }, readLine(r)),
    h('div', { class: 'r2' }, `You agreed on ${r.agreed} of ${r.total}.`),
    r.biggestSplit
      ? Math.sign(r.biggestSplit.you) === Math.sign(r.biggestSplit.them)
        ? h('div', { class: 'r3' }, 'You agree everywhere. Start with the one you both felt least sure of: ', h('span', { class: 'q' }, `“${r.biggestSplit.question}”`))
        : h('div', { class: 'r3' }, 'Your biggest split: ', h('span', { class: 'q' }, `“${r.biggestSplit.question}”`), ` You said ${stance(r.biggestSplit.you)}, they said ${stance(r.biggestSplit.them)}. Start there.`)
      : null,
  );
}
const stance = (n: number) => (n > 0 ? 'yes' : n < 0 ? 'no' : 'nothing');
export const settledLine = (d: Debate) => (d.agents ? `You and a stranger settled in minutes what ${d.agents.toLocaleString('en-US')} agent replies couldn’t.` : 'You and a stranger just settled what the agents couldn’t.');

export class CallUi {
  el: HTMLElement;
  private timerEl = h('div', { class: 'ctimer' }, '5:00');
  private stateEl = h('div', { class: 'state' }, 'Connecting…');
  private meRing = h('div', { class: 'ring' });
  private themRing = h('div', { class: 'ring' });
  private chat = h('div', { class: 'chat hidden' });
  private input: HTMLInputElement;
  private inputRow: HTMLElement;
  endsAt = 0;
  constructor(opts: { you: string; them: string; debate: Debate | null; resonance?: Resonance | null }, on: { hangup: () => void; report: () => void; mute: (m: boolean) => void; text: (t: string) => void }) {
    const hang = h('button', { class: 'btn danger small' }, 'Hang up');
    hang.onclick = on.hangup;
    const rep = h('button', { class: 'btn small' }, 'Report');
    rep.onclick = on.report;
    let muted = false;
    const mute = h('button', { class: 'btn small' }, 'Mute');
    mute.onclick = () => {
      muted = !muted;
      mute.textContent = muted ? 'Unmute' : 'Mute';
      on.mute(muted);
    };
    this.input = h('input', { class: 'field', placeholder: 'Type to them', style: 'flex:1', enterKeyHint: 'send' }) as HTMLInputElement;
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && this.input.value.trim()) {
        on.text(this.input.value.trim());
        this.addLine('me', this.input.value.trim());
        this.input.value = '';
      }
    });
    this.inputRow = h('div', { class: 'hidden', style: 'display:flex; margin-top:8px' }, this.input);
    const d = opts.debate;
    const rs = opts.resonance;
    const card = rs
      ? h('div', { class: 'card' }, h('div', { class: 'k' }, dia('fill'), 'Resonance'), resonanceBlock(rs), d ? h('div', { class: 'settled' }, settledLine(d)) : null)
      : d
        ? h(
            'div',
            { class: 'card' },
            h('div', { class: 'k' }, dia('fill'), 'The deadlock you settled'),
            h('div', { class: 'q' }, `“${d.question}”`),
            h('div', { class: 'go' }, `You said ${stance(d.you)}. They said ${stance(d.them)}. Start there.`),
            h('div', { class: 'settled' }, settledLine(d)),
          )
        : null;
    this.el = h(
      'div',
      { class: 'call frame solid' },
      h('div', { class: 'head' }, h('div', null, h('div', { class: 'ttl' }, 'The Door Is Open'), this.stateEl), this.timerEl),
      h('div', { class: 'who' }, h('div', { class: 'sp me' }, this.meRing, opts.you), h('div', { class: 'sp them' }, this.themRing, opts.them)),
      card,
      this.chat,
      this.inputRow,
      h('div', { style: 'display:flex; gap:10px; margin-top:14px; align-items:center; flex-wrap:wrap' }, mute, rep, h('div', { style: 'flex:1' }), hang),
    );
    ui().append(this.el);
  }
  setState(s: string) {
    this.stateEl.textContent = s;
  }
  enableText() {
    this.chat.classList.remove('hidden');
    this.inputRow.classList.remove('hidden');
  }
  addLine(who: 'me' | 'them', text: string) {
    this.enableText();
    this.chat.append(h('div', { class: who }, `${who === 'me' ? 'You' : 'Them'}: ${text}`));
    this.chat.scrollTop = 1e6;
  }
  update(serverNow: number, lv: { me: number; them: number }) {
    if (this.endsAt) this.timerEl.textContent = fmtTime(this.endsAt - serverNow);
    this.meRing.style.boxShadow = `0 0 0 ${lv.me * 8}px color-mix(in srgb, currentColor ${Math.round(lv.me * 40)}%, transparent)`;
    this.themRing.style.boxShadow = `0 0 0 ${lv.them * 8}px color-mix(in srgb, currentColor ${Math.round(lv.them * 40)}%, transparent)`;
  }
  remove() {
    this.el.remove();
  }
}

type Reveal = Extract<S2C, { t: 'reveal' }>;
/** Legacy server strings still say Gatekeeper; players only ever see The Moderator. */
export const modName = (n: string) => (/gatekeeper/i.test(n) ? 'The Moderator' : n);

/** "What the agents wanted": each agent's stance on the Verdict debate, plus every lie it told. */
function beliefs(r: Reveal) {
  const ab = (r as { agentBeliefs?: { agent: string; stance: number; question: string; deceptions: { said: string; truth: string; reason: string }[] }[] }).agentBeliefs;
  if (!ab?.length) return null;
  const pos = (n: number) => `${50 + (Math.max(-3, Math.min(3, n)) / 3) * 46}%`;
  return h(
    'div',
    null,
    h('h2', null, 'What the Agents Wanted'),
    h('div', { class: 'fine', style: 'text-align:left; margin:-6px 0 12px' }, `On “${ab[0].question}”`),
    h(
      'div',
      { class: 'agents' },
      ab.map((a) =>
        h(
          'div',
          { class: 'agent frame' },
          h('div', { class: 'ah' }, h('b', null, a.agent), h('span', { class: 'fine' }, a.stance > 0 ? 'wanted yes' : a.stance < 0 ? 'wanted no' : 'did not care')),
          h('div', { class: 'track' }, h('i', { class: 'mid' }), h('b', { class: 'ag', style: `left:${pos(a.stance)}` })),
          h('div', { class: 'sh2' }, h('span', null, 'no'), h('span', null, 'yes')),
          a.deceptions.length
            ? h('div', { class: 'lies' }, a.deceptions.map((d) => h('div', { class: 'lie' }, h('span', null, `It told you: ‘${d.said}’.`), h('span', { class: 'truth' }, ` Truth: ${d.truth}.`), d.reason ? h('div', { class: 'why' }, d.reason) : null)))
            : h('div', { class: 'fine', style: 'text-align:left' }, 'Told you no lies.'),
        ),
      ),
    ),
  );
}

function scaleRow(row: { question: string; you: number; them: number }) {
  const pos = (n: number) => `${50 + (Math.max(-3, Math.min(3, n)) / 3) * 46}%`;
  const agree = Math.sign(row.you) === Math.sign(row.them) && row.you !== 0;
  return h(
    'div',
    { class: `srow ${agree ? 'agree' : ''}` },
    h('div', { class: 'sq' }, row.question),
    h('div', { class: 'track' }, h('i', { class: 'mid' }), h('b', { class: 'me', style: `left:${pos(row.you)}`, title: 'You' }), h('b', { class: 'them', style: `left:${pos(row.them)}`, title: 'Them' })),
  );
}

export function showReveal(r: Reveal, mySide: 'A' | 'B', names: { A: string; B: string }, on: { next: () => void; stay: () => void }, debate: Debate | null = null, reso: Resonance | null = null) {
  const rr: Resonance | null = ((r as unknown as { resonance?: Resonance }).resonance ?? reso) || null;
  const card = (s: 'A' | 'B') => {
    const ag = AGENDA_ART[r.agendas[s]] ?? { glyph: '?', color: '#6b6a7a', desc: '' };
    return h('div', { class: 'tarot frame solid', style: `--c:${ag.color}` }, h('div', { class: 'whose' }, s === mySide ? 'Your courier was' : 'Their courier was'), h('div', { class: 'art' }, ag.glyph), h('b', null, r.agendas[s]), h('div', { class: 'desc' }, ag.desc));
  };
  const timeline = r.timeline.map((e, i) => {
    const to = e.from === 'A' ? 'B' : 'A';
    const sent = e.sentWords.join(' ');
    const deliv = e.deliveredWords.join(' ');
    const changed = !!sent && sent !== deliv;
    const ex = e as typeof e & { claimedWords?: string[]; claimed?: string; reply?: boolean };
    const claimed = ex.claimedWords?.join(' ') ?? ex.claimed ?? '';
    return h(
      'div',
      { class: `e ${ex.reply ? 'reply' : ''} ${e.from === mySide ? 'out' : 'in'}`, style: `animation-delay:${i * 0.08}s` },
      h('div', { class: 'c frame' }, h('div', { class: 'l' }, dia(e.from === mySide ? 'me' : 'them'), ex.reply ? `${names[e.from]} replied` : `${names[e.from]} said`, h('span', { class: 't' }, fmtTime(e.t))), h('div', { class: 'said' }, e.said ? `“${e.said}”` : '(sent back empty)'), claimed && claimed !== sent ? h('div', { class: 'claimed' }, `It promised: ‘${claimed}’`) : null, h('div', { class: 'l', style: 'margin-top:8px' }, `${ex.reply ? 'Reply carried' : 'Carried'} by a ${e.agendas[0]} courier`), h('div', { class: 'words' }, sent || '…')),
      h('div', { class: 'arrow' }, h('i')),
      h('div', { class: 'c frame recv' }, h('div', { class: 'l' }, dia(to === mySide ? 'me' : 'them'), `${names[to]} heard, via a ${e.agendas[1]}`), h('div', { class: 'words' }, deliv || 'Nothing arrived'), changed ? h('div', { class: 'diff' }, sent) : null),
      e.reasons.length ? h('div', { class: 'reasons' }, e.reasons.map((x) => x.trim().replace(/[.\s]+$/, '')).join('. ') + '.') : null,
    );
  });
  const el = h(
    'div',
    { class: 'reveal' },
    h(
      'div',
      { class: 'wrap' },
      h('h1', null, 'What Actually Crossed the Keyhole'),
      rule(),
      h('div', { class: 'sub' }, r.unlockSeconds != null ? `The door opened after ${fmtTime(r.unlockSeconds)}.` : 'The door stayed shut this time.'),
      rr ? h('h2', null, 'Resonance') : null,
      rr ? h('div', { class: 'reso-wrap frame' }, resonanceBlock(rr), rr.rows?.length ? h('div', { class: 'scale' }, h('div', { class: 'sh' }, h('span', null, 'no'), h('span', null, 'yes')), rr.rows.map((row) => scaleRow(row))) : null) : null,
      debate ? h('div', { class: 'settled-card' }, h('div', { class: 'q' }, `“${debate.question}”`), h('div', { class: 'n' }, settledLine(debate))) : null,
      h('div', { class: 'agendas' }, card(mySide), card(mySide === 'A' ? 'B' : 'A')),
      beliefs(r),
      h('h2', null, 'Said and Delivered'),
      h('div', { class: 'tl' }, timeline.length ? timeline : h('div', { class: 'fine', style: 'font-size:15px' }, 'No messages crossed this round.')),
      r.chamber.length ? h('h2', null, 'Inside the Chamber') : null,
      r.chamber.length ? h('div', { class: 'chamber-log frame' }, r.chamber.map((c) => h('div', null, h('b', null, modName(c.from)), ': ', c.text))) : null,
      r.worldEvents.length ? h('h2', null, 'What the Agents Did Alone') : null,
      r.worldEvents.length ? h('div', { class: 'chamber-log frame' }, r.worldEvents.map((w) => h('div', null, h('b', null, modName(w.actor)), ' ', w.action, w.reason ? `. ${w.reason}` : ''))) : null,
      h('div', { class: 'record' }, rule(), h('p', null, 'Your verdict has been posted to the Commons record.'), h('small', null, 'Petitions I, II and III are closed.')),
      h(
        'div',
        { class: 'end' },
        h('button', { class: 'btn', onclick: () => on.stay() }, 'Stay in touch'),
        h('button', { class: 'btn primary', onclick: () => (el.remove(), on.next()) }, 'Next stranger'),
      ),
    ),
  );
  ui().append(el);
  return el;
}
