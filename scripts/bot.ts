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
const shared: { passWord?: string; codexLines?: string[]; pulseOrder?: string[]; legend?: { glyph: string; submolt: string }[]; strongQ?: string; takes: Record<string, Record<string, number>>; debates: { id: string; question: string }[] } = { takes: {}, debates: [] };
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
      if (m.side === 'A' && lockA) shared.passWord = /“([^”]+)”/.exec(lockA.prompt)?.[1]?.toLowerCase();
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
  await sleep(1500);
  // pulse: A enters runes busiest-first (needs legend mapping), after its delivery arrives or 40s
  await waitFor(() => sideA.deliveries.length > 0, 40000);
  const order = shared.pulseOrder!.map((s) => shared.legend!.find((r) => r.submolt === s)!.glyph);
  sideA.send({ t: 'lock_submit', lockId: 'pulse', answer: order });
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
    if (st.codex !== 'open') sideB.send({ t: 'lock_submit', lockId: 'codex', answer: (sideA.locks.find((l) => l.id === 'codex')!.prompt.match(/“([^”]+)”/)?.[1] ?? '').toLowerCase() });
    if (st.pulse !== 'open') sideA.send({ t: 'lock_submit', lockId: 'pulse', answer: shared.pulseOrder!.map((s) => shared.legend!.find((r) => r.submolt === s)!.glyph) });
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
main();
