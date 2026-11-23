import type { NetApi, NetEvents } from '../contracts';
import type { CharacterLook, ClientMsg, MatchInfo, PlayerInfo, PlayerState, ServerMsg, TagRecord } from '../../shared/protocol';
import { CLIENT_SEND_HZ, MATCH_SECONDS, POINTS } from '../../shared/constants';

type Listeners = { [K in keyof NetEvents]: NetEvents[K][] };

/**
 * WebSocket client. Falls back to an offline single-player simulation
 * (same events, local match clock) when the server can't be reached.
 */
export class Net implements NetApi {
  selfId = '';
  online = false;
  private ws: WebSocket | null = null;
  private listeners: Listeners = { join: [], leave: [], snap: [], tagged: [], match: [], emote: [], disconnect: [] };
  private lastSend = 0;
  private clockOffset = 0; // serverTime - localTime
  private rttBest = Infinity;
  private pingTimer = 0;
  // offline sim
  private offlineScore = 0;
  private offlineTags = new Set<string>();
  private offlineMatch: MatchInfo = { phase: 'running', timeLeft: MATCH_SECONDS };
  private offlineTimer = 0;

  on<K extends keyof NetEvents>(ev: K, cb: NetEvents[K]) {
    (this.listeners[ev] as NetEvents[K][]).push(cb);
  }
  private emit<K extends keyof NetEvents>(ev: K, ...args: Parameters<NetEvents[K]>) {
    for (const cb of this.listeners[ev]) (cb as (...a: Parameters<NetEvents[K]>) => void)(...args);
  }

  serverNow() {
    return Date.now() + this.clockOffset;
  }

  connect(name: string, look: CharacterLook): Promise<{ id: string; players: PlayerInfo[]; tags: TagRecord[]; match: MatchInfo }> {
    return new Promise((resolve) => {
      let settled = false;
      const offline = () => {
        if (settled) return;
        settled = true;
        try {
          this.ws?.close();
        } catch {}
        this.ws = null;
        resolve(this.startOffline(name, look));
      };
      const timer = window.setTimeout(offline, 2500);

      let ws: WebSocket;
      try {
        const proto = location.protocol === 'https:' ? 'wss' : 'ws';
        ws = new WebSocket(`${proto}://${location.host}/ws`);
      } catch {
        clearTimeout(timer);
        offline();
        return;
      }
      this.ws = ws;

      ws.onopen = () => this.raw({ t: 'hello', name, look });
      ws.onerror = () => {
        if (!settled) {
          clearTimeout(timer);
          offline();
        }
      };
      ws.onclose = () => {
        if (!settled) {
          clearTimeout(timer);
          offline();
          return;
        }
        if (this.online) {
          this.online = false;
          window.clearInterval(this.pingTimer);
          this.emit('disconnect');
        }
      };
      ws.onmessage = (ev) => {
        let msg: ServerMsg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.t === 'welcome' && !settled) {
          settled = true;
          clearTimeout(timer);
          this.selfId = msg.id;
          this.online = true;
          this.ping();
          this.pingTimer = window.setInterval(() => this.ping(), 2000);
          resolve({ id: msg.id, players: msg.players, tags: msg.tags, match: msg.match });
          return;
        }
        this.handle(msg);
      };
    });
  }

  private handle(msg: ServerMsg) {
    switch (msg.t) {
      case 'join':
        this.emit('join', msg.player);
        break;
      case 'leave':
        this.emit('leave', msg.id);
        break;
      case 'snap':
        this.emit('snap', msg.time, msg.states);
        break;
      case 'tagged':
        this.emit('tagged', msg.tag, msg.score);
        break;
      case 'match':
        this.emit('match', msg.match);
        break;
      case 'emote':
        this.emit('emote', msg.id, msg.e);
        break;
      case 'pong': {
        const now = Date.now();
        const rtt = now - msg.c;
        // keep the estimate from the lowest-RTT sample (least queueing noise), slowly forgiving
        this.rttBest = Math.min(this.rttBest * 1.05, rtt);
        if (rtt <= this.rttBest * 1.2) this.clockOffset = msg.s + rtt / 2 - now;
        break;
      }
      case 'error':
        console.warn('[net]', msg.msg);
        break;
    }
  }

  private ping() {
    this.raw({ t: 'ping', c: Date.now() });
  }

  private raw(m: ClientMsg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  sendState(s: Omit<PlayerState, 'id'>) {
    if (!this.online) return;
    const now = performance.now();
    if (now - this.lastSend < 1000 / CLIENT_SEND_HZ) return;
    this.lastSend = now;
    // trim floats to keep packets small
    const r2 = (n: number) => Math.round(n * 100) / 100;
    this.raw({ t: 'state', s: { ...s, p: [r2(s.p[0]), r2(s.p[1]), r2(s.p[2])], r: r2(s.r), v: r2(s.v), vy: r2(s.vy), l: r2(s.l) } });
  }

  sendTag(spotId: string, pos: [number, number, number]) {
    if (this.online) {
      this.raw({ t: 'tag', spotId, pos });
      return;
    }
    if (this.offlineMatch.phase !== 'running' || this.offlineTags.has(spotId)) return;
    this.offlineTags.add(spotId);
    this.offlineScore += spotId.startsWith('big') ? POINTS.bigTag : POINTS.tag;
    const tag: TagRecord = { spotId, by: this.selfId, seed: (Math.random() * 2 ** 31) | 0, at: Date.now() };
    // async like a real round trip
    setTimeout(() => this.emit('tagged', tag, this.offlineScore), 0);
  }

  startMatch() {
    if (this.online) this.raw({ t: 'start' });
    else if (this.offlineMatch.phase !== 'running') this.resetOffline();
  }

  emote(e: string) {
    this.raw({ t: 'emote', e });
  }

  private startOffline(name: string, look: CharacterLook) {
    console.info('[net] server unreachable — playing offline');
    this.selfId = 'local';
    this.online = false;
    this.resetOffline();
    window.clearInterval(this.offlineTimer);
    this.offlineTimer = window.setInterval(() => {
      const m = this.offlineMatch;
      if (m.phase !== 'running') return;
      m.timeLeft = Math.max(0, m.timeLeft - 1);
      if (m.timeLeft === 0) {
        m.phase = 'over';
        setTimeout(() => this.resetOffline(), 15000);
      }
      this.emit('match', { ...m });
    }, 1000);
    const me: PlayerInfo = { id: 'local', name, look, score: 0 };
    return { id: 'local', players: [me], tags: [] as TagRecord[], match: { ...this.offlineMatch } };
  }

  private resetOffline() {
    this.offlineScore = 0;
    this.offlineTags.clear();
    this.offlineMatch = { phase: 'running', timeLeft: MATCH_SECONDS };
    this.emit('match', { ...this.offlineMatch });
  }
}
