// OpenAI-compatible chat completions with JSON extraction, timeout, and per-agent single-flight.
import { ENV, log } from './env';

export interface LlmOpts {
  model?: 'fast' | 'strong';
  timeoutMs?: number;
  maxTokens?: number;
}

const inFlight = new Set<string>();
let warned = false;

/** Returns parsed JSON object or null (timeout, busy, bad JSON, no key). Never throws. */
export async function llmJson<T = any>(agentKey: string, system: string, user: string, opts: LlmOpts = {}): Promise<T | null> {
  if (!ENV.llmBase || !ENV.llmKey) {
    if (!warned) log('llm', 'no LLM configured — agents use fallback behaviour');
    warned = true;
    return null;
  }
  if (inFlight.has(agentKey)) return null;
  inFlight.add(agentKey);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 9000);
  const model = opts.model === 'strong' ? ENV.llmStrong : ENV.llmFast;
  try {
    const res = await fetch(`${ENV.llmBase}/chat/completions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ENV.llmKey}` },
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens ?? 1200,
        reasoning_effort: 'low',
        messages: [
          { role: 'system', content: system + '\nReply with exactly one JSON object. No prose, no code fences.' },
          { role: 'user', content: user },
        ],
      }),
    });
    const data: any = await res.json().catch(() => null);
    const content: string | null = data?.choices?.[0]?.message?.content ?? null;
    if (!content) {
      log('llm', `${agentKey}: empty response (${res.status}) ${data?.error?.message?.slice(0, 120) ?? ''}`);
      return null;
    }
    return extractJson<T>(content);
  } catch (e: any) {
    log('llm', `${agentKey}: ${e?.name === 'AbortError' ? 'timeout' : e?.message}`);
    return null;
  } finally {
    clearTimeout(timer);
    inFlight.delete(agentKey);
  }
}

export function extractJson<T>(s: string): T | null {
  const start = s.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(s.slice(start, i + 1)) as T;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
