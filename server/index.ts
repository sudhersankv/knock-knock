import { WebSocketServer, WebSocket } from 'ws';
import { NET_PORT, SERVER_TICK_HZ, MAX_PLAYERS, MATCH_SECONDS, TAG_RANGE, POINTS } from '../shared/constants';
import type { ClientMsg, ServerMsg, PlayerInfo, PlayerState, TagRecord, MatchInfo } from '../shared/protocol';

interface Client {
  ws: WebSocket;
  id: string;
  info: PlayerInfo | null;
  state: PlayerState | null;
  lastTagAt: number;
}

const clients = new Map<string, Client>();
let tags: TagRecord[] = [];
const match: MatchInfo = { phase: 'lobby', timeLeft: MATCH_SECONDS };
let overAt = 0;
let nextId = 1;

const C = { reset: '\x1b[0m', mag: '\x1b[35m', cyan: '\x1b[36m', yel: '\x1b[33m', dim: '\x1b[2m', red: '\x1b[31m' };
const log = (color: string, ...a: unknown[]) => console.log(`${C.dim}[${new Date().toLocaleTimeString()}]${C.reset} ${color}${a.join(' ')}${C.reset}`);

function send(ws: WebSocket, msg: ServerMsg) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}
function broadcast(msg: ServerMsg, except?: string) {
  const s = JSON.stringify(msg);
  for (const c of clients.values()) {
    if (!c.info || c.id === except) continue;
    if (c.ws.readyState === WebSocket.OPEN) c.ws.send(s);
  }
}
const players = () => [...clients.values()].filter((c) => c.info).map((c) => c.info!);

function startMatch() {
  if (match.phase === 'running') return;
  tags = [];
  for (const c of clients.values()) if (c.info) c.info.score = 0;
  match.phase = 'running';
  match.timeLeft = MATCH_SECONDS;
  log(C.yel, '>> NIGHT STARTS', `(${MATCH_SECONDS}s)`);
  // Clients treat a lobby/over -> running transition as "new night": clear local tags & scores.
  broadcast({ t: 'match', match });
}

const clean = (s: unknown, max: number) => String(s ?? '').replace(/[<>]/g, '').trim().slice(0, max);

const wss = new WebSocketServer({ port: NET_PORT });
wss.on('listening', () => log(C.cyan, `COLOR RIOT server listening on ws://localhost:${NET_PORT}`));

wss.on('connection', (ws) => {
  const id = 'p' + (nextId++).toString(36);
  const client: Client = { ws, id, info: null, state: null, lastTagAt: 0 };
  clients.set(id, client);

  ws.on('message', (raw) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      send(ws, { t: 'error', msg: 'bad json' });
      return;
    }
    if (!msg || typeof msg !== 'object') return;

    switch (msg.t) {
      case 'hello': {
        if (client.info) return;
        if (players().length >= MAX_PLAYERS) {
          send(ws, { t: 'error', msg: 'room full' });
          ws.close();
          return;
        }
        client.info = { id, name: clean(msg.name, 16) || 'TOY', look: msg.look, score: 0 };
        send(ws, { t: 'welcome', id, players: players(), tags, match });
        broadcast({ t: 'join', player: client.info }, id);
        log(C.mag, `+ ${client.info.name} joined (${id}) — ${players().length} in crew`);
        if (match.phase === 'lobby') startMatch();
        break;
      }
      case 'state': {
        if (!client.info || !msg.s || !Array.isArray(msg.s.p)) return;
        client.state = { ...msg.s, id };
        break;
      }
      case 'tag': {
        if (!client.info || match.phase !== 'running') return;
        const now = Date.now();
        if (now - client.lastTagAt < 600) return;
        if (typeof msg.spotId !== 'string' || tags.some((t) => t.spotId === msg.spotId)) return;
        if (client.state && Array.isArray(msg.pos)) {
          const [x, y, z] = client.state.p;
          const d = Math.hypot(x - msg.pos[0], y - msg.pos[1], z - msg.pos[2]);
          if (d > TAG_RANGE + 6) return; // generous: state lags a bit
        }
        client.lastTagAt = now;
        const tag: TagRecord = { spotId: msg.spotId, by: id, seed: (Math.random() * 2 ** 31) | 0, at: now };
        tags.push(tag);
        client.info.score += msg.spotId.startsWith('big') ? POINTS.bigTag : POINTS.tag;
        broadcast({ t: 'tagged', tag, score: client.info.score });
        log(C.yel, `* ${client.info.name} tagged ${msg.spotId} (${client.info.score})`);
        break;
      }
      case 'start':
        if (match.phase !== 'running') startMatch();
        break;
      case 'emote':
        if (client.info) broadcast({ t: 'emote', id, e: clean(msg.e, 24) }, id);
        break;
      case 'ping':
        send(ws, { t: 'pong', c: msg.c, s: Date.now() });
        break;
    }
  });

  const drop = () => {
    if (!clients.has(id)) return;
    clients.delete(id);
    if (client.info) {
      broadcast({ t: 'leave', id });
      log(C.red, `- ${client.info.name} left — ${players().length} in crew`);
    }
    if (players().length === 0) {
      match.phase = 'lobby';
      match.timeLeft = MATCH_SECONDS;
      tags = [];
    }
  };
  ws.on('close', drop);
  ws.on('error', drop);
});

// snapshots
setInterval(() => {
  const states: PlayerState[] = [];
  for (const c of clients.values()) if (c.info && c.state) states.push(c.state);
  if (states.length) broadcast({ t: 'snap', time: Date.now(), states });
}, 1000 / SERVER_TICK_HZ);

// match clock
setInterval(() => {
  if (match.phase === 'running') {
    match.timeLeft = Math.max(0, match.timeLeft - 1);
    if (match.timeLeft === 0) {
      match.phase = 'over';
      overAt = Date.now();
      log(C.yel, '>> SUNRISE. Final:', players().map((p) => `${p.name}=${p.score}`).join(' '));
    }
    broadcast({ t: 'match', match });
  } else if (match.phase === 'over' && Date.now() - overAt > 15000) {
    match.phase = 'lobby';
    if (players().length) startMatch();
  }
}, 1000);
