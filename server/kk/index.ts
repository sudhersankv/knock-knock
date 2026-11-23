// KNOCK KNOCK game server: static client (dist/) + WebSocket /ws.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { ENV, log } from './env';
import type { C2S } from '../../shared/kk/protocol';
import { sendTo, type Player } from './room';
import { enqueue, dequeue, codename, INTERESTS } from './match';
import { loadPack } from './pack';
import { initBand } from './band';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.ico': 'image/x-icon', '.webp': 'image/webp',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
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
