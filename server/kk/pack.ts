// Loads data/round_pack.json (written by the Bruin pipeline) and data/agent_stats.json.
// Falls back to a small built-in pack so the server always runs.
import fs from 'node:fs';
import { DATA, log } from './env';
import type { RoundPack, AgentStats } from '../../shared/kk/pack';
import { fallbackPack } from './fallbackPack';

let cached: { pack: RoundPack; mtime: number } | null = null;

function validPack(p: any): p is RoundPack {
  return p && Array.isArray(p.threads) && p.threads.length >= 6 && Array.isArray(p.codexes) && p.codexes.length >= 1 &&
    Array.isArray(p.pulses) && p.pulses.length >= 1 && Array.isArray(p.debates) && p.debates.length >= 5;
}

/** Re-read at each round start (cheap; cached by mtime). */
export function loadPack(): RoundPack {
  const f = DATA('round_pack.json');
  try {
    const st = fs.statSync(f);
    if (cached && cached.mtime === st.mtimeMs) return cached.pack;
    const p = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (validPack(p)) {
      cached = { pack: p, mtime: st.mtimeMs };
      log('pack', `loaded round_pack.json: ${p.threads.length} threads, ${p.codexes.length} codexes, ${p.pulses.length} pulses (generated ${p.generatedAt})`);
      return p;
    }
    log('pack', 'round_pack.json failed shape check — using fallback pack');
  } catch {
    /* missing */
  }
  return fallbackPack();
}

export function loadStats(): AgentStats | null {
  try {
    return JSON.parse(fs.readFileSync(DATA('agent_stats.json'), 'utf8')) as AgentStats;
  } catch {
    return null;
  }
}
