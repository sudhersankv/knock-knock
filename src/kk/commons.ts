// The Commons: a public page showing, for each debate the agents brought to humans,
// what the agents said on Moltbook next to what humans told the game. Data: /api/commons (Bruin outputs).
// styles: linked from commons.html

type Voice = { author: string; text: string; stance: 1 | -1 };
const clean = (t: string) => t.replace(/^["“”']+|["“”']+$/g, '');
type Tally = { yes: number; no: number; n: number };
type Debate = { question: string; theme: string | null; url: string | null; submolt: string | null; author: string | null; replies: number | null; agents: Tally | null; voices: Voice[]; humans: Tally };
type Data = {
  generatedAt: string;
  society: { posts24h: number; comments24h: number; activeAgents24h: number; submolts: number; totalAgents?: number } | null;
  pipeline: { checksPassed: number; checksTotal: number; threads: number };
  rounds: number;
  debates: Debate[];
};

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string | null, ...kids: (Node | string | null | undefined)[]) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  for (const k of kids) if (k != null) n.append(k);
  return n;
};
const fmt = (n: number | undefined | null) => (n == null ? '—' : n.toLocaleString('en-US'));
const pct = (t: Tally | null) => (t && t.yes + t.no > 0 ? Math.round((t.yes / (t.yes + t.no)) * 100) : null);
const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};

function meter(label: string, t: Tally | null, unit: string, cls: string) {
  const p = pct(t);
  const box = el('div', `meter ${cls}`);
  const head = el('div', 'meter-head', el('span', 'who', label), el('span', 'num', p == null ? 'no answers yet' : `${p}% lean yes`));
  const bar = el('div', p == null ? 'bar empty' : 'bar');
  const fill = el('i');
  fill.style.width = `${p ?? 0}%`;
  bar.append(fill);
  const foot = el('div', 'meter-foot', el('span', null, 'no'), el('span', null, t && t.n ? `${fmt(t.n)} ${unit}` : ''), el('span', null, 'yes'));
  box.append(head, bar, foot);
  return box;
}

function verdict(d: Debate) {
  const a = pct(d.agents);
  const hm = pct(d.humans);
  if (hm == null || !d.humans.n) return 'Waiting for humans. Play a round to add yours.';
  if (a == null) return `Humans lean ${hm >= 50 ? 'yes' : 'no'}.`;
  const sameSide = (a >= 50) === (hm >= 50);
  return sameSide ? `Humans and agents both lean ${hm >= 50 ? 'yes' : 'no'}.` : `Humans lean ${hm >= 50 ? 'yes' : 'no'}. The agents lean ${a >= 50 ? 'yes' : 'no'}.`;
}

function card(d: Debate, i: number) {
  const c = el('article', 'debate');
  const top = el('div', 'd-top', el('span', 'idx', ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][i] ?? String(i + 1)), d.theme ? el('span', 'theme', d.theme) : null);
  const q = el('h2', 'q', `“${d.question}”`);
  const src = el('p', 'src');
  if (d.url) {
    const a = el('a', null, `Read the thread on Moltbook`);
    (a as HTMLAnchorElement).href = d.url;
    (a as HTMLAnchorElement).target = '_blank';
    (a as HTMLAnchorElement).rel = 'noopener';
    src.append(a);
  }
  if (d.submolt) src.append(` · m/${d.submolt}`);
  if (d.replies) src.append(` · ${fmt(d.replies)} agent replies`);
  const meters = el('div', 'meters', meter('The agents', d.agents, 'replies read', 'ag'), meter('The humans', d.humans, d.humans.n === 1 ? 'Arbiter' : 'Arbiters', 'hu'));
  const v = el('p', 'verdict', verdict(d));
  const voices = el(
    'div',
    'voices',
    ...d.voices.slice(0, 4).map((x) => el('blockquote', `voice ${x.stance > 0 ? 'yes' : 'no'}`, el('p', null, `“${clean(x.text)}”`), el('footer', null, el('span', null, `u/${x.author}`), el('span', 'lean', x.stance > 0 ? 'leans yes' : 'leans no')))),
  );
  c.append(...([top, q, src, meters, v, d.voices.length ? el('h3', 'vh', 'What the agents are saying') : null, voices].filter(Boolean) as Node[]));
  return c;
}

async function main() {
  const root = document.getElementById('commons')!;
  const head = el(
    'header',
    'hero',
    el('a', 'back', '← Knock Knock'),
    el('h1', null, 'The Commons'),
    el('div', 'rule', el('i'), el('i')),
    el('p', 'lede', 'The agents of Moltbook bring their most divided debates to human strangers. This is what each side has said so far.'),
  );
  (head.querySelector('.back') as HTMLAnchorElement).href = '/';
  root.append(head);
  let data: Data;
  try {
    const r = await fetch('/api/commons', { cache: 'no-store' });
    data = await r.json();
  } catch {
    root.append(el('p', 'err', 'The Commons record could not be reached. Try again in a moment.'));
    return;
  }
  const s = data.society;
  const totals = data.debates.reduce((m, d) => m + (d.humans?.n ?? 0), 0);
  root.append(
    el(
      'section',
      'society',
      stat(s?.totalAgents, 'agents on Moltbook'),
      stat(s?.posts24h, 'posts today'),
      stat(s?.comments24h, 'replies today'),
      stat(totals, 'human answers so far'),
    ),
    el('section', 'grid', ...data.debates.map(card)),
    el(
      'footer',
      'pipe',
      `Built from live Moltbook data ${ago(data.generatedAt)} by the Bruin pipeline · ${data.pipeline.checksPassed}/${data.pipeline.checksTotal} quality checks passed · ${data.pipeline.threads} threads read. Human answers are recorded as Arbiters play and tallied by Bruin after each round.`,
    ),
  );
  const play = el('a', 'play', 'Play a round');
  (play as HTMLAnchorElement).href = '/';
  root.append(el('div', 'cta', play));
}
function stat(n: number | undefined | null, label: string) {
  return el('div', 'stat', el('b', null, fmt(n)), el('span', null, label));
}
void main();
