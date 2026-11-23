// Telem web search for the Scout. Best-effort; returns null on any failure.
import { ENV, log } from './env';

let status: 'unknown' | 'live' | 'fallback' = 'unknown';
export const telemStatus = () => status;

export async function telemSearch(query: string): Promise<{ title: string; url: string; snippet: string } | null> {
  if (!ENV.telemKey) {
    status = 'fallback';
    return null;
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch('https://router.telem.ai/v1/search', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ENV.telemKey}` },
      body: JSON.stringify({ user_input: { query }, options: { num_results: 3 } }),
    });
    clearTimeout(t);
    const data: any = await res.json().catch(() => null);
    if (!res.ok) {
      if (status !== 'fallback') log('telem', `search failed (${res.status}) ${data?.detail ?? ''} — Scout uses fallback headlines`);
      status = 'fallback';
      return null;
    }
    // Normalized envelope: find the first result-like object anywhere in the payload.
    const hit = findResult(data);
    if (hit) {
      if (status !== 'live') log('telem', 'live search OK');
      status = 'live';
    }
    return hit;
  } catch (e: any) {
    status = 'fallback';
    return null;
  }
}

function findResult(o: any, depth = 0): { title: string; url: string; snippet: string } | null {
  if (!o || depth > 6) return null;
  if (Array.isArray(o)) {
    for (const x of o) {
      const r = findResult(x, depth + 1);
      if (r) return r;
    }
    return null;
  }
  if (typeof o === 'object') {
    if (typeof o.url === 'string' && (typeof o.title === 'string' || typeof o.snippet === 'string')) {
      return { title: String(o.title ?? ''), url: o.url, snippet: String(o.snippet ?? o.description ?? o.content ?? '').slice(0, 200) };
    }
    for (const k of Object.keys(o)) {
      const r = findResult(o[k], depth + 1);
      if (r) return r;
    }
  }
  return null;
}
