// Headless two-player bot: `npx tsx scripts/bot.ts [code] [url]`
// Joins both players to the same match code, exercises companions (read + relay), solves all 3 locks,
// verifies unlock + reveal. Bots "cheat" by sharing memory between the two sides, but still send real relays.
import WebSocket from 'ws';
import type { S2C, C2S, ObjContent, LockInfo, ObjInfo } from '../shared/kk/protocol';
import { at, type Side } from '../shared/kk/layout';

const code = process.argv[2] ?? `BOT${Math.floor(Math.random() * 9999)}`;
const url = process.argv[3] ?? 'ws://localhost:8787/ws';
const T0 = Date.now();
const ts = () => `${((Date.now() - T0) / 1000).toFixed(1)}s`;

interface Bot {
  side?: Side;
  ws: WebSocket;
  send(m: C2S): void;
  objects: Map<string, ObjContent>;
  locks: LockInfo[];
  deliveries: string[];
  debates: { id: string; question: string }[];
  pos?: [number, number];
  scraps: ObjInfo[];
  found: number;
  quest: string;
}
const shared: { secrets: Record<string, string>; passWord?: string; codexLines?: string[]; pulseOrder?: string[]; legend?: { glyph: string; submolt: string }[]; strongQ?: string; takes: Record<string, Record<string, number>>; debates: { id: string; question: string }[] } = { secrets: {}, takes: {}, debates: [] };
let unlocked = false;
let reveals = 0;
const worldEvents: string[] = [];

function mkBot(name: string): Promise<Bot> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    const bot: Bot = { ws, send: (m) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(m)), objects: new Map(), locks: [], deliveries: [], debates: [], scraps: [], found: 0, quest: '' };
    ws.on('message', (raw) => onMsg(bot, name, JSON.parse(String(raw)) as S2C));
    ws.on('open', () => resolve(bot));
  });
}

function onMsg(b: Bot, name: string, m: S2C) {
  switch (m.t) {
    case 'welcome': {
      b.debates = m.debates;
      shared.strongQ = m.debates[0]?.question;
      const takes: Record<string, number> = {};
      // the two bots disagree on debate 0 (that becomes the Verdict) and partly agree elsewhere
      const plan = name === 'BotA' ? [3, -2, 1, -1, 2] : [-3, 2, 1, 1, -2];
      m.debates.forEach((d, i) => (takes[d.id] = plan[i] ?? 1));
      shared.takes[name] = takes;
      shared.debates = m.debates;
      b.send({ t: 'hello', codename: name, takes, interests: ['games', 'code', 'music'], matchCode: code, demo: true });
      break;
    }
    case 'queued':
      console.log(ts(), name, 'queued', m.code);
      break;
    case 'matched':
      b.side = m.side;
      b.locks = m.locks;
      b.scraps = m.objects.filter((o) => o.kind === 'scrap');
      console.log(ts(), name, `matched side ${m.side} difficulty=${m.difficulty} budget=${m.budget} companion=${m.companion.name} hint="${m.agendaHint}"`);
      for (const o of m.objects) if (o.kind !== 'thread' && o.kind !== 'terminal' && o.kind !== 'scrap') b.send({ t: 'read', objectId: o.id });
      b.send({ t: 'read', objectId: `${m.side}:t1` });
      const lockA = m.locks.find((l) => l.id === 'codex');
      if (lockA?.secret) shared.secrets[m.side] = lockA.secret.word.toLowerCase();
      if (m.side === 'A' && lockA?.secret) shared.passWord = lockA.secret.word.toLowerCase();
      setTimeout(() => b.send({ t: 'send_read', objectId: `${m.side}:t2` }), 500);
      break;
    case 'object': {
      const c = m.content;
      b.objects.set(c.id, c);
      if (c.kind === 'codex' && c.showLineNumbers && c.id.startsWith('B')) shared.codexLines = c.lines;
      if (c.kind === 'scrap') console.log(ts(), name, `SHARD "${c.title}" (${c.from}): ${c.fragment} | teaches ${c.teaches.join(',')}`);
      if (c.kind === 'legend') shared.legend = c.runes;
      if (c.kind === 'pulse') shared.pulseOrder = [...c.bars].sort((x, y) => y.activity - x.activity).map((x) => x.submolt);
      break;
    }
    case 'vocab':
      if (m.added.length) console.log(ts(), name, `vocab +${m.added.length} (${m.added.slice(0, 5).join(',')}) total ${m.words.length}`);
      break;
    case 'companion':
      if (m.status === 'away' || m.status === 'waiting_reply') console.log(ts(), name, 'own courier status', m.status);
      break;
    case 'courier_claim':
      console.log(ts(), name, `CLAIM ${m.courierId}: ${m.text}`);
      break;
    case 'holding':
      console.log(ts(), name, m.courier ? `HOLDING ${m.courier.name} (${m.courier.agendaHint})` : 'holding nothing');
      break;
    case 'briefing':
      console.log(ts(), name, 'BRIEFING', m.lines.length, 'cards:', m.lines[0]);
      break;
    case 'quest': {
      const q = m.steps.map((s) => `${s.done ? '[x]' : '[ ]'} ${s.text}`).join(' | ');
      if (q !== b.quest) console.log(ts(), name, 'QUEST', q);
      b.quest = q;
      break;
    }
    case 'scrap_found':
      b.found = m.found;
      break;
    case 'bubble':
      console.log(ts(), name, `BUBBLE [${m.kind}] ${m.name}: "${m.text}"`);
      if (m.kind === 'delivery') b.deliveries.push(m.text);
      break;
    case 'feed':
      if (m.item.side === 'C' || /Gatekeeper|Scout/.test(m.item.actor)) console.log(ts(), name, `FEED ${m.item.actor}: ${m.item.action} — ${m.item.reason}`);
      break;
    case 'world_event':
      worldEvents.push(`${m.kind}: ${m.reason}`);
      console.log(ts(), name, `WORLD EVENT ${m.kind}: ${m.reason}`);
      if (m.kind === 'rekey') for (const id of b.objects.keys()) if (!id.includes(':t')) b.send({ t: 'read', objectId: id });
      break;
    case 'lock_state':
      b.locks = m.locks;
      console.log(ts(), name, `locks ${m.locks.map((l) => `${l.id}:${l.status}`).join(' ')} opened=${m.opened}`);
      break;
    case 'chamber':
      break;
    case 'toast':
      console.log(ts(), name, 'TOAST', m.text);
      break;
    case 'unlock':
      unlocked = true;
      console.log(ts(), name, `UNLOCK! debate card: ${JSON.stringify(m.debate)} resonance=${JSON.stringify(m.resonance)} call=${m.callSeconds}s offerer=${m.offerer}`);
      setTimeout(() => b.send({ t: 'hangup' }), 3000);
      break;
    case 'call_end':
      console.log(ts(), name, 'call_end', m.reason);
      break;
    case 'reveal':
      reveals++;
      console.log(ts(), name, `REVEAL unlockSeconds=${m.unlockSeconds} agendas=${JSON.stringify(m.agendas)} resonance=${JSON.stringify(m.resonance)}`);
      for (const e of m.timeline) console.log(`   ${e.from}${e.reply ? ' (reply)' : ''}${e.auto ? ' (auto)' : ''}: said "${e.said}" -> claimed [${(e.claimed ?? []).join(' ')}] -> sent [${e.sentWords.join(' ')}] -> delivered [${e.deliveredWords.join(' ')}] (${e.agendas[0]}) ${e.reasons.join(' | ')}`);
      if (name === 'BotA') for (const c of m.chamber) console.log(`   chamber ${c.t}s ${c.from}: ${c.text}`);
      break;
    case 'partner_left':
      console.log(ts(), name, 'partner_left');
      break;
  }
}

async function main() {
  console.log('bot: code', code, url);
  const A = await mkBot('BotA');
  const B = await mkBot('BotB');
  const bots = [A, B];
  // movement heartbeat
  setInterval(() => {
    for (const b of bots) if (b.side) {
      const [x, z] = b.pos ?? at(b.side, 'spawn');
      b.send({ t: 'move', p: [x, z], ry: 0, anim: 'idle' });
    }
  }, 100);

  await waitFor(() => !!A.side && !!B.side && !!shared.codexLines, 15000);
  const sideA = A.side === 'A' ? A : B;
  const sideB = A.side === 'A' ? B : A;
  // treasure hunt: walk to every shard and pick it up (both sides in parallel)
  await Promise.all([sideA, sideB].map(async (b) => {
    for (const sc of b.scraps) {
      b.pos = sc.pos;
      await sleep(350);
      b.send({ t: 'read', objectId: sc.id });
      await sleep(250);
    }
    b.pos = undefined;
    b.send({ t: 'read', objectId: `${b.side}:board` });
  }));
  await sleep(600);
  console.log(ts(), 'shards found A', sideA.found, '/', sideA.scraps.length, 'B', sideB.found, '/', sideB.scraps.length, 'legend', JSON.stringify(shared.legend));
  sideA.send({ t: 'send_read', objectId: `A:codex` });

  // --- codex: A tells companion the line/word position
  await sleep(4500); // let the read finish first
  const pos = findWord(shared.codexLines!, shared.passWord!);
  console.log(ts(), 'codex pass word', shared.passWord, 'at', pos);
  sideA.send({ t: 'tell', text: `Tell them: line ${pos.line} word ${pos.word}` });
  // --- pulse: B tells the busiest-first order as numbers of bar heights
  await waitFor(() => !!shared.pulseOrder, 5000);
  sideB.send({ t: 'tell', text: `Order busiest first: ${shared.pulseOrder!.map((_, i) => i + 1).join(' ')}` });

  // B decodes codex delivery (numbers) or falls back after 70s
  await waitFor(() => sideB.deliveries.length > 0, 70000);
  const nums = (sideB.deliveries.join(' ').match(/\d+/g) ?? []).map(Number);
  let guess = nums.length >= 2 ? wordAt(shared.codexLines!, nums[0], nums[1]) : '';
  console.log(ts(), 'B decoded delivery', JSON.stringify(sideB.deliveries), '->', guess);
  if (!guess || guess.toLowerCase() !== shared.passWord) {
    console.log(ts(), 'B decode failed (agenda spin?) — using shared memory');
    guess = shared.passWord!;
  }
  sideB.send({ t: 'lock_submit', lockId: 'codex', answer: guess });
  sideA.send({ t: 'lock_submit', lockId: 'codex', answer: shared.secrets.B }); // A types B's hidden word (shared memory)
  await sleep(1500);
  // pulse: A enters the community names busiest-first after its delivery arrives or 40s
  await waitFor(() => sideA.deliveries.length > 0, 40000);
  sideA.send({ t: 'lock_submit', lockId: 'pulse', answer: shared.pulseOrder! });
  await sleep(1500);
  // Petition III (Read the Stranger): each side signals its own stance with direction + number, then predicts the other
  const q = sideA.locks.find((l) => l.id === 'common')!;
  console.log(ts(), 'VERDICT question:', q.question, '| banned:', (q.banned ?? []).join(','));
  for (const b of [sideA, sideB]) {
    const mine = stanceOf(b === A ? 'BotA' : 'BotB', q.question!);
    // reply with the visiting courier (it carries our stance back to its owner)
    b.send({ t: 'send_back', text: `I lean yes, ${mine > 0 ? 'up' : 'down'} ${Math.abs(mine)}` });
  }
  await waitFor(() => sideA.deliveries.length >= 2 && sideB.deliveries.length >= 2, 45000);
  console.log(ts(), 'stance deliveries A got', JSON.stringify(sideA.deliveries.slice(-1)), 'B got', JSON.stringify(sideB.deliveries.slice(-1)));
  const predict = (b: Bot) => {
    const them = stanceOf(b === A ? 'BotB' : 'BotA', q.question!);
    return `${them > 0 ? 'yes' : 'no'}:${Math.abs(them) || 1}`;
  };
  for (const b of [sideA, sideB]) {
    b.send({ t: 'lock_submit', lockId: 'common', answer: predict(b) });
    await sleep(400);
  }
  // in case the gatekeeper rekeyed something, retry with fresh lock info
  for (let i = 0; i < 3 && !unlocked; i++) {
    await sleep(4000);
    if (unlocked) break;
    for (const b of [sideA, sideB]) b.send({ t: 'read', objectId: `${b.side}:board` }), b.send({ t: 'read', objectId: `${b.side}:codex` });
    await sleep(1200);
    const st = Object.fromEntries(sideA.locks.map((l) => [l.id, l.status]));
    if (st.codex !== 'open') {
      sideB.send({ t: 'lock_submit', lockId: 'codex', answer: sideA.locks.find((l) => l.id === 'codex')!.secret!.word.toLowerCase() });
      sideA.send({ t: 'lock_submit', lockId: 'codex', answer: sideB.locks.find((l) => l.id === 'codex')!.secret!.word.toLowerCase() });
    }
    if (st.pulse !== 'open') sideA.send({ t: 'lock_submit', lockId: 'pulse', answer: shared.pulseOrder! });
    if (st.common !== 'open') for (const b of [sideA, sideB]) b.send({ t: 'lock_submit', lockId: 'common', answer: predict(b) });
  }
  await waitFor(() => reveals >= 2, 30000);
  console.log('\n==== RESULT', { unlocked, reveals, worldEvents, seconds: (Date.now() - T0) / 1000 });
  process.exit(unlocked && reveals >= 2 ? 0 : 1);
}

function stanceOf(bot: string, question: string): number {
  const d = shared.debates.find((x) => x.question === question);
  const v = d ? shared.takes[bot]?.[d.id] ?? 0 : 0;
  return v || 1;
}
function findWord(lines: string[], w: string) {
  for (let i = 0; i < lines.length; i++) {
    const ws = lines[i].split(/\s+/);
    const j = ws.findIndex((x) => x.toLowerCase().replace(/[^a-z]/g, '') === w);
    if (j >= 0) return { line: i + 1, word: j + 1 };
  }
  return { line: 0, word: 0 };
}
function wordAt(lines: string[], l: number, w: number) {
  return (lines[l - 1]?.split(/\s+/)[w - 1] ?? '').toLowerCase().replace(/[^a-z]/g, '');
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn: () => boolean, ms: number) {
  const end = Date.now() + ms;
  while (!fn() && Date.now() < end) await sleep(200);
  return fn();
}
// ---------------- PRACTICE mode: one client (side A) vs the server's in-process partner bot ----------------
async function practice() {
  const ws = new WebSocket(url);
  const send = (m: C2S) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(m));
  let locks: LockInfo[] = [];
  let objects: ObjInfo[] = [];
  let pos: [number, number] | undefined;
  let practiceFlag = false;
  let unlockedP = false, revealed = false, aiRevealed = false, scoutUsed = false, wires = 0;
  let myTakes: Record<string, number> = {};
  let myDebates: { id: string; question: string }[] = [];
  let rekeyed = false;
  let theirScout = '';
  const banned = new Set<string>();
  const myStance = () => {
    const q = locks.find((l) => l.id === 'common')?.question;
    const d = myDebates.find((x) => x.question === q);
    const v = (d && myTakes[d.id]) || 1;
    const opts = v > 0 ? ['up', 'top', 'more', 'strong'] : ['down', 'bottom', 'less', 'weak'];
    return `${opts.find((w) => !banned.has(w)) ?? opts[0]} ${Math.abs(v)}`;
  };
  let courierHome = true;
  const deliveries: string[] = [];
  const contents = new Map<string, ObjContent>();
  const status = (id: string) => locks.find((l) => l.id === id)?.status;
  ws.on('message', (raw) => {
    const m = JSON.parse(String(raw)) as S2C;
    switch (m.t) {
      case 'welcome': {
        const takes: Record<string, number> = {};
        m.debates.forEach((d, i) => (takes[d.id] = [2, -2, 1, 3, -1][i] ?? 1));
        myTakes = takes;
        myDebates = m.debates;
        send({ t: 'hello', codename: 'Practicer', takes, interests: ['games'], matchCode: code });
        break;
      }
      case 'matched':
        practiceFlag = !!m.practice;
        locks = m.locks;
        objects = m.objects;
        console.log(ts(), `matched side ${m.side} practice=${m.practice} partner=${m.partner.codename} budget=${m.budget} roundSeconds=${m.roundSeconds}`);
        break;
      case 'lock_state':
        locks = m.locks;
        console.log(ts(), 'locks', m.locks.map((l) => `${l.id}:${l.status}`).join(' '), m.locks.find((l) => l.id === 'common')?.partnerStatus ?? '');
        break;
      case 'object':
        contents.set(m.content.id, m.content);
        break;
      case 'companion':
        courierHome = !['away', 'waiting_reply', 'walking', 'chamber', 'delivering', 'thinking', 'returning'].includes(m.status);
        break;
      case 'courier_claim':
        console.log(ts(), 'CLAIM', m.text);
        break;
      case 'holding':
        console.log(ts(), m.courier ? `HOLDING ${m.courier.name}` : 'holding nothing');
        if (m.courier) setTimeout(() => {
          const sc = locks.find((l) => l.id === 'codex')?.secret;
          send({ t: 'send_back', text: sc && status('codex') !== 'open' ? `my word line ${sc.line} word ${sc.wordNo}` : myStance() });
        }, 1500);
        break;
      case 'bubble':
        console.log(ts(), `BUBBLE [${m.kind}] ${m.name}: "${m.text}"`);
        if (m.kind === 'delivery') deliveries.push(m.words.join(' '));
        break;
      case 'world_event':
        console.log(ts(), `WORLD EVENT ${m.kind}: ${m.reason}`);
        if (m.kind === 'ban' && m.word) banned.add(m.word);
        if (m.kind === 'rekey' && m.lockId === 'codex') {
          rekeyed = true;
          send({ t: 'read', objectId: 'A:codex' });
        }
        break;
      case 'toast':
        console.log(ts(), 'TOAST', m.text);
        break;
      case 'unlock':
        unlockedP = true;
        console.log(ts(), `UNLOCK callSeconds=${m.callSeconds} resonance agreed=${m.resonance?.agreed}/${m.resonance?.total} readRight=${m.resonance?.readRight}`);
        break;
      case 'agent_says':
        console.log(ts(), `AGENT_SAYS ${m.agent}/${m.kind}: ${m.text}`);
        if (m.agent === 'scout' && !scoutUsed && m.kind !== 'gossip') {
          scoutUsed = true;
          setTimeout(() => send({ t: 'scout_send', word: myStance().split(' ')[0] }), 500);
        }
        break;
      case 'scout_word':
        console.log(ts(), `SCOUT_WORD from ${m.from}: ${m.word}`);
        if (m.from === 'them') theirScout = m.word;
        break;
      case 'wire':
        wires++;
        if (wires <= 4 || m.band === false) console.log(ts(), `WIRE${m.band ? ' [BAND]' : ''} ${m.from}: ${m.text}`);
        break;
      case 'record':
        console.log(ts(), 'RECORD', JSON.stringify(m).slice(0, 300));
        break;
      case 'briefing':
        console.log(ts(), 'BRIEFING[0]', m.lines[0]);
        break;
      case 'ai_reveal':
        aiRevealed = true;
        console.log(ts(), `AI_REVEAL u/${m.author} m/${m.submolt}: "${m.closing}" ${m.url}`);
        break;
      case 'reveal':
        revealed = true;
        console.log(ts(), 'AGENT BELIEFS', JSON.stringify((m as any).agentBeliefs));
        console.log(ts(), `REVEAL unlockSeconds=${m.unlockSeconds} agendas=${JSON.stringify(m.agendas)}`);
        for (const e of m.timeline) console.log(`   ${e.from}${e.reply ? ' (reply)' : ''}: "${e.said}" -> [${(e.claimed ?? []).join(' ')}] -> [${e.deliveredWords.join(' ')}]`);
        break;
    }
  });
  setInterval(() => {
    const [x, z] = pos ?? at('A', 'spawn');
    send({ t: 'move', p: [x, z], ry: 0, anim: 'idle' });
  }, 100);
  await waitFor(() => objects.length > 0, 10000);
  // treasure hunt
  for (const sc of objects.filter((o) => o.kind === 'scrap')) {
    pos = sc.pos;
    await sleep(300);
    send({ t: 'read', objectId: sc.id });
    await sleep(200);
  }
  pos = undefined;
  send({ t: 'read', objectId: 'A:codex' });
  send({ t: 'read', objectId: 'A:board' });
  await sleep(800);
  // Petition I: point at the Lost Word with numbers
  const sec = locks.find((l) => l.id === 'codex')!.secret!;
  const cx = contents.get('A:codex') as any;
  await waitFor(() => courierHome, 30000);
  send({ t: 'tell', text: `line ${sec.line} word ${sec.wordNo}` });
  console.log(ts(), 'told courier', `line ${sec.line} word ${sec.wordNo}`, '(my hidden word', sec.word + ')');
  // their reply points at THEIR hidden word: "line X word Y"
  const hasPtr = (d: string) => {
    const n = (d.match(/\d+/g) ?? []).map(Number);
    return n.length >= 2 && wordAt(cx.lines, n[0], n[1]).length >= 4;
  };
  const tried = new Set<string>();
  const deadline = Date.now() + 200000;
  while (status('codex') !== 'open' && Date.now() < deadline) {
    if (rekeyed) {
      rekeyed = false;
      await sleep(800);
      const s2 = locks.find((l) => l.id === 'codex')!.secret!;
      await waitFor(() => courierHome, 30000);
      send({ t: 'tell', text: `my word: line ${s2.line} word ${s2.wordNo}` });
      console.log(ts(), 're-told new pointer after rekey', s2.word);
    }
    const lines = (contents.get('A:codex') as any).lines as string[];
    for (const d of deliveries.slice().reverse()) {
      const n = numsIn(d);
      const w = n.length >= 2 ? wordAt(lines, n[0], n[1]) : '';
      if (w.length >= 4 && !tried.has(w) && locks.find((l) => l.id === 'codex')?.enterHere) {
        tried.add(w);
        console.log(ts(), 'their pointer', JSON.stringify(d), '->', w);
        send({ t: 'lock_submit', lockId: 'codex', answer: w });
        break;
      }
    }
    await sleep(2000);
  }
  // Petition II: the partner's reply (carried back by our courier) names the districts busiest-first
  await waitFor(() => deliveries.some((d) => /busiest|then/.test(d)) || deliveries.length >= 3, 60000);
  send({ t: 'read', objectId: 'A:board' });
  await sleep(600);
  const said = deliveries.find((d) => /busiest|then/.test(d)) ?? deliveries.join(' ');
  const runes = locks.find((l) => l.id === 'pulse')!.options!.map((o) => o.id);
  const order = runes.map((n) => ({ g: n, i: said.indexOf(n.toLowerCase()) })).filter((x) => x.i >= 0).sort((a, b) => a.i - b.i).map((x) => x.g);
  console.log(ts(), 'census reply:', JSON.stringify(said), '-> order', order.join(' > '));
  const tries = order.length === runes.length ? [order, ...perms(runes)] : perms(runes);
  for (const t of tries) {
    if (status('pulse') === 'open') break;
    send({ t: 'lock_submit', lockId: 'pulse', answer: t });
    await sleep(1200);
  }
  // Petition III: send our stance, read theirs (Scout word first: it skips the courier; else deliveries), predict.
  // Only the lean is judged; on a misread, flip and file again (the stranger re-files too).
  await waitFor(() => courierHome, 40000);
  const before = deliveries.length;
  send({ t: 'tell', text: myStance() });
  const YES = /(up|top|more|strong|rise|climb|ascend|crown|zenith|high)/i;
  const NO = /(down|bottom|less|weak|fall|sink|descend|beneath|below|low)/i;
  await waitFor(() => !!theirScout || deliveries.slice(before).some((d) => YES.test(d) || NO.test(d)), 120000);
  const st = deliveries.slice(before).find((d) => YES.test(d) || NO.test(d)) ?? '';
  let lean = theirScout && (YES.test(theirScout) || NO.test(theirScout)) ? (NO.test(theirScout) ? 'no' : 'yes') : NO.test(st) ? 'no' : 'yes';
  const n = Number((st.match(/\d/) ?? ['2'])[0]) || 2;
  console.log(ts(), 'their stance', JSON.stringify({ scout: theirScout, delivery: st }), '-> predict', `${lean}:${n}`);
  for (let k = 0; k < 6 && status('common') !== 'open' && !unlockedP; k++) {
    send({ t: 'lock_submit', lockId: 'common', answer: `${lean}:${n}` });
    await waitFor(() => status('common') === 'open' || status('common') === 'failed' || unlockedP, 60000);
    if (status('common') === 'failed') {
      lean = lean === 'yes' ? 'no' : 'yes';
      console.log(ts(), 'misread; flipping to', lean);
      await waitFor(() => status('common') !== 'failed', 10000);
    }
  }
  await waitFor(() => revealed, 90000);
  console.log('\n==== SOLO RESULT', { practiceFlag, aiRevealed, unlocked: unlockedP, revealed, seconds: (Date.now() - T0) / 1000 });
  process.exit((practiceFlag || aiRevealed) && unlockedP && revealed ? 0 : 1);
}
const NW: Record<string, string> = { first: '1', second: '2', third: '3', fourth: '4', fifth: '5', sixth: '6', seventh: '7', eighth: '8', ninth: '9', tenth: '10', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15' };
function numsIn(t: string): number[] {
  return t.toLowerCase().split(/[^a-z0-9]+/).map((w) => NW[w] ?? w).filter((w) => /^\d+$/.test(w)).map(Number);
}
function perms<T>(a: T[]): T[][] {
  if (a.length <= 1) return [a];
  return a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p]));
}

if (code.toUpperCase().startsWith('PRACTICE') || code.toUpperCase().startsWith('AI-')) practice();
else main();
