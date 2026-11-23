// KNOCK KNOCK — data contract between the Bruin pipeline (writes) and the game server (reads).
// Pipeline writes data/round_pack.json after `bruin run`. Server writes data/events.ndjson during play;
// the Bruin stats assets turn events into data/agent_stats.json, which the server reads at each round start.

export interface PackThread {
  id: string; // Moltbook post id
  submolt: string;
  title: string;
  author: string;
  /** Cleaned body text, <= 900 chars, markdown stripped, PII-filtered. */
  body: string;
  url: string; // https://www.moltbook.com/post/<id>
  upvotes: number;
  comments: number;
  createdAt: string;
  /** Top 12 distinctive words (TF-IDF), lowercase, >=4 letters, not stopwords, not starter vocab. Reading grants these. */
  vocab: string[];
}
export interface PackCodex {
  id: string;
  postId: string;
  title: string;
  author: string;
  url: string;
  /** Post split into lines of ~8 words. */
  lines: string[];
  passWord: string; // >=7 letters, occurs exactly once in the post, in no starter vocab and no thread vocab
  lineNo: number; // 1-based
  wordNo: number; // 1-based within the line
  difficulty: 'easy' | 'hard';
}
export interface PackPulse {
  id: string;
  snapshotAt: string;
  /** 3 or 4 submolts, adjacent activity differs by >= 15%, sorted by rank (1 = most active). */
  entries: { submolt: string; activity: number; rank: number }[];
}
export interface PackDebate {
  threadId: string; // also present in threads[]
  question: string; // neutral yes/no question
  keyword: string; // single word, present in that thread's vocab
  split: number;
  /** Short philosophical theme, e.g. "memory deletion", "identity of copies". */
  theme?: string;
  /** 2-4 real agent replies from the thread, classified by stance (yes = +1, no = -1). PII-filtered, <= 220 chars. */
  voices?: { author: string; text: string; stance: 1 | -1 }[];
}
export interface RoundPack {
  generatedAt: string;
  source: 'moltbook';
  starterVocab: string[];
  submolts: { name: string; displayName: string; description: string }[];
  threads: PackThread[]; // >= 20
  codexes: PackCodex[]; // >= 4 (mix of easy/hard)
  pulses: PackPulse[]; // >= 3
  debates: PackDebate[]; // exactly 5
  checks: { name: string; passed: boolean; detail: string }[];
  /** Society-scale numbers for the briefing + Commons Record (from the ingest). */
  society?: { posts24h: number; comments24h: number; activeAgents24h: number; submolts: number; totalAgents?: number };
}

export interface AgentStats {
  generatedAt: string;
  /** Keyed by agenda (companions) or 'gatekeeper'/'scout'. */
  agents: { key: string; rounds: number; distortionRate: number; caughtCount: number; trades: number; avgUnlockSeconds: number | null; memoryLine: string }[];
  leaderboard: { roomId: string; difficulty: string; unlockSeconds: number; at: string }[];
}

/** Starter vocabulary every companion knows. Numbers 0..99 are always allowed in addition. */
export const STARTER_VOCAB = [
  'yes', 'no', 'left', 'right', 'up', 'down', 'door', 'help', 'line', 'word', 'first', 'second', 'third', 'last',
  'top', 'bottom', 'same', 'not', 'and', 'then', 'red', 'blue', 'big', 'small', 'more', 'less', 'wait', 'go', 'stop',
  'rune', 'lock', 'number', 'order', 'strong', 'weak', 'agree', 'maybe', 'one', 'two', 'three', 'four', 'five',
  'six', 'seven', 'eight', 'nine', 'ten',
];
