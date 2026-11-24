// KNOCK KNOCK game server: static client (dist/) + WebSocket /ws.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { ENV, log, DATA } from './env';
import type { C2S } from '../../shared/kk/protocol';
import { sendTo, type Player } from './room';
import { enqueue, dequeue, codename, INTERESTS } from './match';
import { loadPack, loadStats } from './pack';
import { initBand } from './band';
import { logEvent } from './events';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.ico': 'image/x-icon', '.webp': 'image/webp',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/stt' && req.method === 'POST') {
    handleStt(req, res);
    return;
  }
  if (url.pathname === '/api/commons') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(commonsData()));
    return;
  }
  if (url.pathname === '/commons') url.pathname = '/commons.html';
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  let file = path.join(ENV.distDir, decodeURIComponent(url.pathname));
  if (!file.startsWith(ENV.distDir)) {
    res.writeHead(403);
    res.end();
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    const idx = path.join(file, 'index.html');
    file = fs.existsSync(idx) ? idx : path.join(ENV.distDir, 'index.html');
  }
  if (!fs.existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Knock Knock server running. Client not built (run `npm run build`) — in dev use the Vite port.');
    return;
  }
  const ext = path.extname(file);
  res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600' });
  fs.createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({ server, path: '/ws' });
let nextId = 1;

wss.on('connection', (ws) => {
  const p: Player = { id: `p${nextId++}`, ws, codename: codename(), takes: {}, interests: [], demo: false, room: null, p: [0, 0], ry: 0, anim: 'idle' };
  let helloed = false;
  const pack = loadPack();
  sendTo(ws, { t: 'welcome', id: p.id, codename: p.codename, debates: pack.debates.slice(0, 5).map((d) => ({ id: d.threadId, question: d.question })), interests: INTERESTS });

  ws.on('message', (raw) => {
    let m: C2S;
    try {
      m = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'hello') {
      if (p.room) return;
      helloed = true;
      if (m.codename && typeof m.codename === 'string') p.codename = m.codename.replace(/[^\w ]/g, '').slice(0, 24) || p.codename;
      p.takes = {};
      for (const [k, v] of Object.entries(m.takes ?? {})) {
        const n = Math.max(-3, Math.min(3, Math.round(Number(v))));
        if (Number.isFinite(n)) p.takes[k] = n;
      }
      p.interests = Array.isArray(m.interests) ? m.interests.map(String).slice(0, 6) : [];
      p.matchCode = m.matchCode ? String(m.matchCode).replace(/[^\w-]/g, '').slice(0, 12) || undefined : undefined;
      p.demo = !!m.demo || !!p.matchCode;
      // the human-opinions loop: every answered debate becomes a Bruin event ("what humans think")
      const qs = new Map(pack.debates.slice(0, 5).map((d) => [d.threadId, d.question]));
      // Test traffic (scripted bots, demo/film/practice codes) never counts as human opinion.
      const isTest = /^(bot|practicer)/i.test(String(m.codename ?? '')) || /^(sane|bot|prod|film|ai-|practice|kkv|call|test|url|ban)/i.test(p.matchCode ?? '');
      for (const [id, v] of Object.entries(p.takes)) {
        if (isTest || !qs.has(id) || !v) continue;
        logEvent({ roomId: '', round: 0, actor: 'human', action: 'opinion', target: id, reason: qs.get(id)!, stance: v });
      }
      enqueue(p);
      return;
    }
    if (m.t === 'next') {
      if (p.room && p.side) p.room.leave(p.side);
      p.room = null;
      if (helloed) enqueue(p);
      return;
    }
    if (p.room && p.side) p.room.handle(p.side, m);
  });

  ws.on('close', () => {
    dequeue(p);
    if (p.room && p.side) p.room.leave(p.side);
  });
});

server.listen(ENV.port, () => {
  log('server', `Knock Knock listening on :${ENV.port} (ws /ws) | llm fast=${ENV.llmFast} strong=${ENV.llmStrong}`);
  loadPack();
  void initBand();
});


// Push-to-talk transcription: browser posts a short recording, we forward it to Deepgram (key stays server-side).
function handleStt(req: http.IncomingMessage, res: http.ServerResponse) {
  const key = process.env.DEEPGRAM_API_KEY;
  const chunks: Buffer[] = [];
  let size = 0;
  req.on('data', (c: Buffer) => {
    size += c.length;
    if (size > 3_000_000) req.destroy();
    else chunks.push(c);
  });
  req.on('end', async () => {
    const send = (code: number, body: unknown) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (!key) return send(503, { error: 'no stt key' });
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10000);
      const r = await fetch('https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&language=en', {
        method: 'POST',
        signal: ctrl.signal,
        headers: { Authorization: `Token ${key}`, 'Content-Type': String(req.headers['content-type'] || 'audio/webm') },
        body: Buffer.concat(chunks),
      });
      clearTimeout(t);
      const j: any = await r.json().catch(() => null);
      if (!r.ok) return send(502, { error: `stt ${r.status}` });
      send(200, { text: j?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '' });
    } catch {
      send(502, { error: 'stt failed' });
    }
  });
}


// Public Commons page data: each debate with what the agents said (Moltbook replies) and what humans told the game (Bruin stats).
function commonsData() {
  const pack = loadPack() as any;
  const stats = loadStats() as any;
  // Live tally straight from the event log (the same rule the Bruin human_opinions asset applies offline).
  const humans: Record<string, { yes: number; no: number; n: number }> = {};
  try {
    for (const line of fs.readFileSync(DATA('events.ndjson'), 'utf8').split(String.fromCharCode(10))) {
      if (!line.includes('"opinion"')) continue;
      const e = JSON.parse(line);
      if (e.actor !== 'human' || e.action !== 'opinion' || typeof e.stance !== 'number') continue;
      const h = (humans[e.target] ??= { yes: 0, no: 0, n: 0 });
      h.n++;
      if (e.stance > 0) h.yes++;
      else if (e.stance < 0) h.no++;
    }
  } catch {
    for (const x of stats?.humans ?? []) humans[x.threadId] = { yes: x.yes, no: x.no, n: x.n };
  }
  const threads: Record<string, any> = {};
  for (const t of pack.threads ?? []) threads[t.id] = t;
  const checks = pack.checks ?? [];
  return {
    generatedAt: pack.generatedAt,
    society: pack.society ?? null,
    pipeline: { checksPassed: checks.filter((c: any) => c.passed).length, checksTotal: checks.length, threads: (pack.threads ?? []).length },
    rounds: stats?.agents?.reduce((m: number, a: any) => Math.max(m, a.rounds ?? 0), 0) ?? 0,
    debates: (pack.debates ?? []).map((d: any) => {
      const t = threads[d.threadId] ?? {};
      return {
        question: d.question,
        theme: d.theme ?? null,
        url: t.url ?? null,
        submolt: t.submolt ?? null,
        author: t.author ?? null,
        replies: t.comments ?? null,
        agents: d.agentTally ?? (d.voices ? { yes: d.voices.filter((v: any) => v.stance > 0).length, no: d.voices.filter((v: any) => v.stance < 0).length, n: d.voices.length } : null),
        voices: d.voices ?? [],
        humans: humans[d.threadId] ?? { yes: 0, no: 0, n: 0 },
      };
    }),
  };
}
