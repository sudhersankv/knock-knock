// Chamber channel. The in-process bus is the source of truth; every chamber message is mirrored
// best-effort into a BAND room where the Gatekeeper and both companions are registered Band agents
// (each posts as itself via the Agent API, @mentioning the others). Failures never affect the game.
import fs from 'node:fs';
import { DATA, ENV, log } from './env';

const BASE = 'https://app.band.ai/api/v1';
type AgentKey = 'gatekeeper' | 'companionA' | 'companionB' | 'scout';
interface BandAgent { id: string; api_key: string; name: string }

const AGENT_DEFS: Record<AgentKey, { name: string; description: string }> = {
  gatekeeper: { name: 'KK Gatekeeper', description: 'Knock Knock Gatekeeper: guards the door between two strangers and taxes, rekeys or resizes the keyhole.' },
  companionA: { name: 'KK Companion A', description: 'Knock Knock companion for the teal side: carries a few words through the keyhole with a hidden agenda.' },
  companionB: { name: 'KK Companion B', description: 'Knock Knock companion for the coral side: carries a few words through the keyhole with a hidden agenda.' },
  scout: { name: 'KK Scout', description: 'Knock Knock Scout: searches the live web with Telem and trades headlines for words.' },
};

let agents: Partial<Record<AgentKey, BandAgent>> = {};
let ready: Promise<boolean> | null = null;
let live = false;
export const bandLive = () => live;

async function api(path: string, key: string, method = 'GET', body?: unknown): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(BASE + path, {
      method,
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(data?.error ?? data).slice(0, 200)}`);
    return data;
  } finally {
    clearTimeout(t);
  }
}

export function initBand(): Promise<boolean> {
  if (ready) return ready;
  ready = (async () => {
    if (!ENV.bandKey) {
      log('band', 'no BAND_API_KEY — chamber uses in-process bus only');
      return false;
    }
    try {
      const f = DATA('band_agents.json');
      if (fs.existsSync(f)) agents = JSON.parse(fs.readFileSync(f, 'utf8'));
      for (const k of Object.keys(AGENT_DEFS) as AgentKey[]) {
        if (agents[k]) continue;
        const r = await api('/me/agents/register', ENV.bandKey, 'POST', { agent: AGENT_DEFS[k] });
        const a = r?.data?.agent;
        const key = r?.data?.credentials?.api_key ?? r?.data?.api_key;
        if (!a?.id || !key) throw new Error('register returned no id/key');
        agents[k] = { id: a.id, api_key: key, name: a.name };
        fs.writeFileSync(f, JSON.stringify(agents, null, 2));
      }
      live = true;
      log('band', `BAND mirroring LIVE (${Object.keys(agents).length} agents registered)`);
      return true;
    } catch (e: any) {
      log('band', `BAND init failed (${e?.message}) — in-process bus only`);
      return false;
    }
  })();
  return ready;
}

/** One BAND room per game room. */
export class ChamberChannel {
  private chatId: string | null = null;
  private queue: Promise<void> = Promise.resolve();
  constructor(private roomId: string) {
    this.queue = this.queue.then(async () => {
      if (!(await initBand())) return;
      try {
        const participants = (['gatekeeper', 'companionA', 'companionB', 'scout'] as AgentKey[])
          .map((k) => agents[k])
          .filter(Boolean)
          .map((a) => ({ participant_id: a!.id }));
        const r = await api('/me/chats', ENV.bandKey, 'POST', { chat: { title: `Knock Knock chamber ${roomId}`, participants } });
        this.chatId = r?.data?.id ?? null;
        if (this.chatId) log('band', `room ${roomId} -> BAND chat ${this.chatId}`);
      } catch (e: any) {
        log('band', `create chat failed: ${e?.message}`);
      }
    });
  }

  /** Mirror one chamber line. `from` is the speaking agent; it @mentions the others. */
  post(from: AgentKey, text: string) {
    this.queue = this.queue.then(async () => {
      if (!this.chatId || !live) return;
      const me = agents[from];
      if (!me) return;
      const others = (['gatekeeper', 'companionA', 'companionB'] as AgentKey[]).filter((k) => k !== from && agents[k]).map((k) => agents[k]!);
      if (!others.length) return;
      const content = `${others.map((o) => `@${o.name.replace(/\s+/g, '')}`).join(' ')} ${text}`.slice(0, 2000);
      try {
        await api(`/agent/chats/${this.chatId}/messages`, me.api_key, 'POST', {
          message: { content: text.slice(0, 2000), mentions: others.map((o) => ({ id: o.id })) },
        });
      } catch (e: any) {
        log('band', `post failed: ${e?.message}`);
        void content;
      }
    });
  }
}
