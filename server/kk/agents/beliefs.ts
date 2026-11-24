// AGENTS WITH BELIEFS: the Scout and the Moderator have their own stances on the round's debates.
import type { PackDebate } from '../../../shared/kk/pack';
import { llmJson } from '../llm';

export interface AgentBelief {
  /** debate threadId -> stance -3..3 (never 0) */
  stances: Record<string, number>;
  deceptions: { said: string; truth: string; reason: string }[];
}
export interface Beliefs {
  scout: AgentBelief;
  moderator: AgentBelief;
}

const rndStance = () => (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 3));
const clamp = (v: unknown) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n !== 0 ? Math.max(-3, Math.min(3, n)) : 0;
};

/** One LLM call for both agents. Fallback: Scout opposes the room average on the verdict debate, Moderator random. */
export async function generateBeliefs(debates: PackDebate[], verdictId: string, roomAvg: number): Promise<Beliefs> {
  const b: Beliefs = { scout: { stances: {}, deceptions: [] }, moderator: { stances: {}, deceptions: [] } };
  const r = await llmJson<{ scout: Record<string, number>; moderator: Record<string, number> }>(
    'beliefs',
    [
      'Two AI agents in a game each hold their own opinion on five yes/no debates from Moltbook.',
      'SCOUT: a restless, curious lantern-carrying bird who wants change and novelty.',
      'MODERATOR: an institutional, procedural governor who wants order and continuity.',
      'Output JSON {"scout": {"<id>": n}, "moderator": {"<id>": n}} with integers -3..3 (negative = no, positive = yes), never 0.',
    ].join('\n'),
    JSON.stringify(debates.map((d) => ({ id: d.threadId, question: d.question }))),
    { model: 'fast', timeoutMs: 9000 },
  );
  for (const d of debates) {
    b.scout.stances[d.threadId] = clamp(r?.scout?.[d.threadId]) || (d.threadId === verdictId ? (roomAvg >= 0 ? -2 : 2) : rndStance());
    b.moderator.stances[d.threadId] = clamp(r?.moderator?.[d.threadId]) || rndStance();
  }
  return b;
}

/** +1 for yes-ish words, -1 for no-ish words, 0 otherwise. */
export function wordLean(w: string): number {
  const x = w.toLowerCase();
  if (['yes', 'up', 'more', 'top', 'strong', 'go', 'agree', 'true', 'good', 'love', 'like', 'support', 'for', 'rise', 'climb'].includes(x)) return 1;
  if (['no', 'down', 'less', 'bottom', 'weak', 'stop', 'disagree', 'false', 'bad', 'hate', 'against', 'fall', 'sink'].includes(x)) return -1;
  return 0;
}
export const OPPOSITE: Record<string, string> = { yes: 'no', no: 'yes', up: 'down', down: 'up', more: 'less', less: 'more', top: 'bottom', bottom: 'top', strong: 'weak', weak: 'strong', go: 'stop', stop: 'go', agree: 'disagree', disagree: 'agree', true: 'false', false: 'true', good: 'bad', bad: 'good', for: 'against', against: 'for', rise: 'fall', fall: 'rise' };
