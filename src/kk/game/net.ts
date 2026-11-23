import type { C2S, S2C } from '../../../shared/kk/protocol';

type Handler<T extends S2C['t']> = (msg: Extract<S2C, { t: T }>) => void;

export class Net {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<(m: S2C) => void>>();
  private queue: C2S[] = [];
  open = false;
  /** Offset so that serverTime ≈ performance.now()/1000 + offset. */
  timeOffset = 0;
  /** Round seconds remaining, from the latest 'state'. */
  remaining = -1;

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.onopen = () => {
        this.open = true;
        for (const m of this.queue) ws.send(JSON.stringify(m));
        this.queue = [];
        resolve();
      };
      ws.onerror = () => reject(new Error('ws error'));
      ws.onclose = () => {
        this.open = false;
        this.emit({ t: 'toast', text: 'Connection lost. Refresh to rejoin.' });
      };
      ws.onmessage = (ev) => {
        let msg: S2C;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        // NOTE: server 'state.time' is the round's remaining seconds, not a clock; we interpolate on local receive time.
        if (msg.t === 'state') this.remaining = msg.time;
        this.emit(msg);
      };
    });
  }

  send(m: C2S) {
    if (this.mockSink) return this.mockSink(m);
    if (this.ws && this.open) this.ws.send(JSON.stringify(m));
    else this.queue.push(m);
  }

  serverNow() {
    return performance.now() / 1000 + this.timeOffset;
  }

  on<T extends S2C['t']>(t: T, fn: Handler<T>) {
    let s = this.handlers.get(t);
    if (!s) this.handlers.set(t, (s = new Set()));
    s.add(fn as (m: S2C) => void);
  }

  /** Mock mode: route outgoing messages here instead of a socket. */
  mockSink: ((m: C2S) => void) | null = null;
  emit(m: S2C) {
    this.handlers.get(m.t)?.forEach((fn) => fn(m));
  }
}
