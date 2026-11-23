// Reader (Moltbook documents, Codex, boards) and the Petition terminal. Ink panels, thin lines.
import type { LockId, LockInfo, ObjContent } from '../../../shared/kk/protocol';
import { h, ui } from './dom';
import { dia, kc, rule } from './hud';

let current: { el: HTMLElement; close: () => void; kind: string } | null = null;

export function closeModal() {
  current?.close();
}
export function modalOpen() {
  return !!current;
}
export function modalKind() {
  return current?.kind ?? null;
}

function open(kind: 'reader' | 'terminal', content: (HTMLElement | null)[], onClose?: () => void) {
  closeModal();
  const box = h('div', { class: `modal frame solid ${kind === 'terminal' ? 'term' : ''}` });
  box.append(...(content.filter(Boolean) as HTMLElement[]));
  const x = h('button', { class: 'icon-btn x', title: 'Close (Esc)' }, '✕');
  const wrap = h('div', { class: 'modal-wrap' }, h('div', { class: 'mwrap' }, box, x));
  const close = () => {
    wrap.remove();
    if (current?.el === wrap) current = null;
    onClose?.();
  };
  x.onclick = close;
  wrap.addEventListener('mousedown', (e) => e.target === wrap && close());
  ui().append(wrap);
  current = { el: wrap, close, kind };
  return box;
}

export function showReader(c: ObjContent, opts: { canSend: boolean; companion: string; onSend: () => void }) {
  switch (c.kind) {
    case 'thread': {
      const send = h('button', { class: 'btn primary small', disabled: !opts.canSend }, kc('R', true), `Send ${opts.companion} to read`);
      send.onclick = () => (opts.onSend(), closeModal());
      open('reader', [
        h('div', { class: 'kick' }, h('span', { class: 'src' }, `m/${c.submolt}`), h('span', null, `${c.upvotes} upvotes`), dia(), h('span', null, `${c.comments} agent replies`)),
        h('h2', null, c.title),
        h('div', { class: 'by' }, `posted by ${c.author}`),
        rule(),
        h('div', { class: 'doc body' }, c.body),
        h('div', { class: 'learn' }, h('div', { class: 'lh' }, dia('fill'), `${opts.companion} learns these words by reading it`), h('div', { class: 'vocab' }, c.vocab.map((w) => h('span', null, w)))),
        h('div', { class: 'actions' }, send, h('a', { class: 'link', href: c.url, target: '_blank', rel: 'noopener' }, 'Open on Moltbook')),
      ]);
      break;
    }
    case 'codex':
      open('reader', [
        h('div', { class: 'kick' }, h('span', { class: 'src' }, 'The Codex'), h('span', null, `post ${c.postId.slice(0, 8)}`)),
        h('h2', null, c.title),
        h('div', { class: 'by' }, `posted by ${c.author}`),
        rule(),
        h('div', { class: 'codex body' }, c.lines.map((l, i) => h('div', null, h('em', null, c.showLineNumbers ? String(i + 1) : ''), h('span', null, l)))),
        h('div', { class: 'actions' }, h('a', { class: 'link', href: c.url, target: '_blank', rel: 'noopener' }, 'Open on Moltbook')),
      ]);
      break;
    case 'legend':
      open('reader', [
        h('div', { class: 'kick' }, h('span', { class: 'src' }, 'Rune legend')),
        h('h2', null, 'Which rune is which district'),
        rule(),
        h('div', { class: 'runes' }, c.runes.map((r) => h('div', { class: `rune ${r.submolt ? '' : 'eroded'}` }, h('span', { class: 'glyph' }, r.glyph), r.submolt ? `m/${r.submolt}` : 'worn away'))),
      ]);
      break;
    case 'pulse': {
      const max = Math.max(1, ...c.bars.map((b) => b.activity));
      open('reader', [
        h('div', { class: 'kick' }, h('span', { class: 'src' }, 'The Census'), h('span', null, 'live from Moltbook')),
        h('h2', null, 'Activity in the last 24 hours'),
        rule(),
        h(
          'div',
          { class: 'bars' },
          c.bars.map((b) => h('div', { class: 'bar' }, h('span', null, `m/${b.submolt}`), h('div', { class: 'tr' }, h('i', { style: `width:${(b.activity / max) * 100}%` })), h('span', { class: 'n' }, String(b.activity)))),
        ),
      ]);
      break;
    }
    case 'takes':
      open('reader', [
        h('div', { class: 'kick' }, h('span', { class: 'src' }, 'The Verdict')),
        h('h2', null, 'The five deadlocked debates'),
        h('div', { class: 'by' }, 'Their wall lists them in a different order, with different symbols.'),
        rule(),
        h('div', { class: 'takes' }, c.takes.map((t) => h('div', { class: 'take' }, h('span', { class: 'glyph' }, t.glyph), t.question))),
      ]);
      break;
    case 'scrap':
      open('reader', [h('div', { class: 'kick' }, h('span', { class: 'src' }, 'Petition shard')), h('h2', null, c.title), rule(), h('div', { class: 'doc' }, c.fragment), c.from ? h('div', { class: 'by', style: 'margin-top:10px' }, `from ${c.from}`) : null]);
      break;
    case 'terminal':
      break;
  }
}

export function bannedLine(words: string[]) {
  return h('div', { class: 'banned' }, h('span', { class: 'bh' }, 'Under review:'), ...words.map((w) => h('s', null, w)));
}

function syncBar(l: LockInfo) {
  const meDone = l.status === 'waiting' || l.status === 'open';
  const themDone = l.status === 'open' || /chosen|entered|set|ready|waiting for you/i.test(l.partnerStatus ?? '');
  return h('div', { class: 'sync' }, dia('me'), h('div', { class: 'bar2' }, h('i', { class: `me ${meDone ? 'on' : ''}` }), h('i', { class: `them ${themDone ? 'on' : ''}` })), dia('them'), l.partnerStatus ? h('span', null, l.partnerStatus) : null);
}

/** The Petition terminal: one section per petition, inputs only where this side enters. */
export function showTerminal(locks: LockInfo[], submit: (id: LockId, answer: string | string[]) => void, tick: () => void = () => {}) {
  // on small screens, petitions you can act on come first
  const small = innerHeight < 560 || innerWidth < 700;
  const ordered = small ? [...locks].sort((a, b) => Number(b.enterHere && b.status !== 'open') - Number(a.enterHere && a.status !== 'open')) : locks;
  const sections = ordered.map((l) => {
    const label = l.status === 'open' ? 'settled' : l.status === 'waiting' ? 'waiting' : l.status === 'failed' ? 'rejected' : 'open';
    const sec = h('div', { class: 'term-lock' }, h('h4', null, dia(l.status === 'open' ? 'fill' : ''), l.title, h('span', { class: `status-pill ${l.status}` }, label)), h('p', null, l.prompt));
    if (l.status !== 'open') sec.append(syncBar(l));
    if (l.banned?.length && l.status !== 'open') sec.append(bannedLine(l.banned));
    if (l.status === 'open' || !l.enterHere || l.input === 'none') return sec;
    if (l.input === 'word') {
      const inp = h('input', { maxLength: 14, spellcheck: false, autocomplete: 'off', autocapitalize: 'off', placeholder: '' }) as HTMLInputElement;
      inp.addEventListener('input', tick);
      const go = h('button', { class: 'btn primary small' }, 'Enter');
      const fire = () => inp.value.trim() && submit(l.id, inp.value.trim().toLowerCase());
      go.onclick = fire;
      inp.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') fire();
      });
      sec.append(h('div', { class: 'term-row' }, h('div', { class: 'slots' }, inp), go));
    } else if (l.input === 'runes') {
      const opts = l.options ?? [];
      const pick = l.pick ?? opts.length;
      const idx = Array.from({ length: pick }, (_, i) => i % Math.max(1, opts.length));
      const faces: HTMLElement[] = [];
      const dials = idx.map((_, d) => {
        const face = h('div', { class: 'face', title: 'Tap to turn' }, opts[idx[d]]?.glyph ?? '?');
        const turn = (dir: number) => {
          idx[d] = (idx[d] + dir + opts.length) % opts.length;
          face.animate([{ transform: 'rotate(0deg)' }, { transform: `rotate(${dir * 60}deg)` }, { transform: 'rotate(0deg)' }], { duration: 260, easing: 'ease-out' });
          setTimeout(() => (face.textContent = opts[idx[d]]?.glyph ?? '?'), 110);
          tick();
        };
        face.onclick = () => turn(1);
        face.oncontextmenu = (e) => (e.preventDefault(), turn(-1));
        faces.push(face);
        return h('div', { class: 'dial' }, face, h('span', { class: 'ord' }, ['I', 'II', 'III', 'IV'][d] ?? String(d + 1)));
      });
      const go = h('button', { class: 'btn primary small' }, 'Set the tumblers');
      go.onclick = () => {
        const ans = idx.map((i) => opts[i].id);
        if (new Set(ans).size !== ans.length) return faces.forEach((f) => f.animate([{ translate: '-3px 0' }, { translate: '3px 0' }, { translate: '0 0' }], { duration: 250 }));
        submit(l.id, ans);
      };
      sec.append(h('div', { class: 'term-row' }, h('div', { class: 'dials' }, dials), go));
    } else if (l.input === 'predict') {
      let lean: 'yes' | 'no' | '' = '';
      let str = 2;
      const go = h('button', { class: 'btn primary small', disabled: true }, 'Seal prediction') as HTMLButtonElement;
      const yes = h('button', { class: 'pick' }, h('i', { class: 'dia' }), 'Lean yes');
      const no = h('button', { class: 'pick' }, h('i', { class: 'dia' }), 'Lean no');
      const segs = [1, 2, 3].map((n) => h('button', { class: 'seg' }, ...Array.from({ length: n }, () => h('i')), ['A little', 'Fairly', 'Strongly'][n - 1]));
      const sync = () => {
        yes.classList.toggle('on', lean === 'yes');
        no.classList.toggle('on', lean === 'no');
        segs.forEach((b, k) => b.classList.toggle('on', k + 1 === str));
        go.disabled = !lean;
      };
      yes.onclick = () => ((lean = 'yes'), sync(), tick());
      no.onclick = () => ((lean = 'no'), sync(), tick());
      segs.forEach((b, k) => (b.onclick = () => ((str = k + 1), sync(), tick())));
      go.onclick = () => lean && submit(l.id, `${lean}:${str}`);
      sync();
      if (l.question) sec.append(h('div', { class: 'debateq' }, h('div', { class: 'q' }, `“${l.question}”`), l.questionUrl ? h('a', { class: 'link', href: l.questionUrl, target: '_blank', rel: 'noopener' }, 'Read the thread on Moltbook') : null));
      sec.append(
        h('div', { class: 'predict' }, h('div', { class: 'ph' }, 'Where do ', h('em', null, 'they'), ' stand?'), h('div', { class: 'leans' }, yes, no), h('div', { class: 'strength' }, h('span', null, 'How strongly?'), segs), go),
      );
    } else if (l.input === 'take') {
      let sel = '';
      const go = h('button', { class: 'btn primary small', disabled: true, style: 'margin-top:12px' }, 'Seal the verdict') as HTMLButtonElement;
      const btns = (l.options ?? []).map((o) => {
        const b = h('button', null, h('span', { class: 'glyph' }, o.glyph ?? ''), o.label);
        b.onclick = () => {
          sel = o.id;
          btns.forEach((x) => x.classList.toggle('on', x === b));
          go.disabled = false;
          tick();
        };
        return b;
      });
      go.onclick = () => sel && submit(l.id, sel);
      sec.append(h('div', { class: 'term-opts' }, btns), go);
    }
    return sec;
  });
  open('terminal', [h('div', { class: 'kick' }, h('span', { class: 'src' }, 'The Door')), h('h2', null, 'The Petitions'), h('div', { class: 'by' }, 'Some are settled from your side, some from theirs.'), rule(), ...sections]);
}
