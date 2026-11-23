// Dialogue box (Moderator briefing, courier lines), item-get moment, and first-time tip cards.
import { h, ui } from './dom';
import { dia, kc, rule } from './hud';

let open: { close: () => void; advance: () => void; passive?: boolean } | null = null;

/** True when a blocking dialogue (briefing, item-get) is up. Passive lines (claims, tutorial hints) never capture input. */
export function dialogueOpen() {
  return !!open && !open.passive;
}
/** Advance (E / Enter / Space / tap). Returns true if a dialogue consumed it. */
export function dialogueAdvance() {
  if (!open || open.passive) return false;
  open.advance();
  return true;
}

/** Sequential cards in a bottom-center dialogue box. Typewriter per card; advance completes the line, then moves on. */
export function showDialogue(name: string, lines: string[], instant = false, autoCloseMs = 0): Promise<void> {
  open?.close();
  return new Promise((resolve) => {
    let i = 0;
    let typing = false;
    const txt = h('div', { class: 'txt' });
    const pg = h('div', { class: 'pg' });
    const box = h('div', { class: 'dlg frame solid' }, h('div', { class: 'name' }, name), txt, h('div', { class: 'adv' }, '▼'), pg);
    const host = h('div', { class: 'dlg-host' }, box);
    let timer = 0;
    const render = () => {
      txt.innerHTML = '';
      pg.innerHTML = '';
      if (lines.length > 1) lines.forEach((_, k) => pg.append(h('i', { class: k <= i ? 'on' : '' })));
      const line = lines[i];
      if (instant) {
        txt.textContent = line;
        return;
      }
      typing = true;
      [...line].forEach((ch, k) => txt.append(h('span', { class: 'ch', style: `animation-delay:${k * 0.022}s` }, ch)));
      clearTimeout(timer);
      timer = window.setTimeout(() => (typing = false), line.length * 22 + 80);
    };
    const close = () => {
      clearTimeout(timer);
      host.remove();
      open = null;
      resolve();
    };
    const advance = () => {
      if (typing) {
        typing = false;
        txt.querySelectorAll<HTMLElement>('.ch').forEach((c) => (c.style.animationDelay = '0s'));
        return;
      }
      i++;
      if (i >= lines.length) close();
      else render();
    };
    box.addEventListener('click', advance);
    open = { close, advance };
    ui().append(host);
    render();
    if (autoCloseMs) {
      open.passive = true;
      host.classList.add('passive');
      setTimeout(() => open?.close === close && close(), autoCloseMs);
    }
  });
}

export interface ShardInfo {
  title: string;
  fragment: string;
  from: string;
  teaches: string[];
  found: number;
  total: number;
}
/** The "item get" moment for a petition shard. */
export function showItemGet(s: ShardInfo, courier: string): Promise<void> {
  return new Promise((resolve) => {
    const el = h(
      'div',
      { class: 'itemget' },
      h(
        'div',
        { class: 'col' },
        h('div', { class: 'shard' }, h('div', { class: 'halo' }), shardSvg()),
        h('div', { class: 'nm' }, s.title),
        rule(),
        h('div', { class: 'ds' }, s.fragment),
        h('div', { class: 'meta' }, dia('fill'), `Petition shard ${s.found} of ${s.total}`, s.from ? ` from ${s.from}` : ''),
        s.teaches.length ? h('div', { class: 'teach' }, ...s.teaches.slice(0, 10).map((w) => h('span', { class: 'word new' }, w))) : null,
        s.teaches.length ? h('div', { class: 'fine' }, `${courier} learned ${s.teaches.length} new word${s.teaches.length === 1 ? '' : 's'}.`) : null,
        h('div', { class: 'cont' }, kc('E', true), 'Continue'),
      ),
    );
    let ready = false;
    setTimeout(() => (ready = true), 700);
    const close = () => {
      if (!ready) return;
      el.remove();
      open = null;
      resolve();
    };
    el.addEventListener('click', close);
    open = { close, advance: close };
    ui().append(el);
  });
}

function shardSvg() {
  const t = document.createElement('template');
  t.innerHTML = `<svg viewBox="0 0 92 120"><defs><linearGradient id="sg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff8e1"/><stop offset=".45" stop-color="#ffd27a"/><stop offset="1" stop-color="#c98a1b"/></linearGradient></defs>
  <path d="M46 4 L80 44 L58 116 L30 104 L12 50 Z" fill="url(#sg)" stroke="#fff3d0" stroke-width="1.5" stroke-linejoin="round" opacity=".95"/>
  <path d="M46 4 L46 60 L58 116 M46 60 L12 50 M46 60 L80 44" fill="none" stroke="#fff3d0" stroke-width="1" opacity=".7"/>
  <path d="M30 40 h26 M26 52 h30 M30 64 h20" stroke="#7a5310" stroke-width="1.4" opacity=".55"/></svg>`;
  return t.content.firstElementChild as SVGElement;
}

/** First-time contextual tips, each shown once per browser. */
const seen = new Set<string>(JSON.parse(safeGet('kk.tips') ?? '[]'));
function safeGet(k: string) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
export function tipOnce(key: string): boolean {
  if (seen.has(key)) return false;
  seen.add(key);
  try {
    localStorage.setItem('kk.tips', JSON.stringify([...seen]));
  } catch {
    /* private mode */
  }
  return true;
}
export function tipCard(title: string, body: string) {
  return h('div', { class: 'tipcard frame solid' }, h('div', { class: 'hd' }, dia('fill'), title), body);
}

/** The Scout's word: one word that crossed the wall untouched (smaller item-get moment). */
export function showScoutWord(word: string): Promise<void> {
  return new Promise((resolve) => {
    const el = h(
      'div',
      { class: 'itemget scoutget' },
      h(
        'div',
        { class: 'col' },
        h('div', { class: 'feather' }, '✦'),
        h('div', { class: 'meta' }, 'The Scout brings a word from the other side'),
        h('div', { class: 'nm' }, `“${word}”`),
        rule(),
        h('div', { class: 'ds' }, 'It flew over the wall untouched. The Moderator heard it too, and will ban it.'),
        h('div', { class: 'cont' }, kc('E', true), 'Continue'),
      ),
    );
    let ready = false;
    setTimeout(() => (ready = true), 600);
    const close = () => {
      if (!ready) return;
      el.remove();
      open = null;
      resolve();
    };
    el.addEventListener('click', close);
    open = { close, advance: close };
    ui().append(el);
  });
}

/** Door opened on an AI Arbiter: the striking reveal card. */
export function showAiReveal(m: { author: string; submolt: string; closing: string; url?: string }, reso: { readRight: boolean } | null): Promise<void> {
  return new Promise((resolve) => {
    const link = m.url ? h('a', { class: 'link', href: m.url, target: '_blank', rel: 'noopener' }, `Read u/${m.author} on Moltbook`) : null;
    const el = h(
      'div',
      { class: 'itemget aireveal' },
      h(
        'div',
        { class: 'col' },
        h('div', { class: 'meta' }, 'The door is open'),
        h('div', { class: 'nm' }, 'The stranger was ', h('em', null, `u/${m.author}`), ','),
        h('div', { class: 'nm2' }, `an AI agent from m/${m.submolt}.`),
        rule(),
        h('div', { class: 'ds' }, `“${m.closing}”`),
        reso ? h('div', { class: 'meta' }, reso.readRight ? 'You read each other right.' : 'You did not quite read each other.') : null,
        link,
        h('div', { class: 'cont' }, kc('E', true), 'Continue'),
      ),
    );
    let ready = false;
    setTimeout(() => (ready = true), 900);
    const close = () => {
      if (!ready) return;
      el.remove();
      open = null;
      resolve();
    };
    el.addEventListener('click', (e) => (e.target as HTMLElement).tagName !== 'A' && close());
    open = { close, advance: close };
    ui().append(el);
  });
}

/** One-time "who's who" tip cards with a small emblem. */
export function whoTip(who: 'scout' | 'moderator') {
  const t =
    who === 'scout'
      ? ['The Scout', '✦', 'Brings real headlines from the web about today’s busiest community. Once a round it will carry one word over the wall for you, untouched, but the Moderator will ban it.']
      : ['The Moderator', '◈', 'The AI that runs the Commons. It inspects every courier and can change the rules mid-game.'];
  return h('div', { class: 'tipcard frame solid who-tip' }, h('div', { class: 'hd' }, h('span', { class: `wi ${who === 'scout' ? 'scout' : 'mod'}` }, t[1]), t[0]), t[2]);
}
