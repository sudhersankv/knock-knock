// Matchmaking: FIFO queue + match codes (judges join the same room on purpose). Compatibility sets difficulty.
import { Room, sendTo, type Player } from './room';
import type { Difficulty } from './locks';
import { loadPack } from './pack';
import { log } from './env';
import { startPractice } from './practiceBot';

const ADJ = ['Quiet', 'Brave', 'Sleepy', 'Lucky', 'Velvet', 'Rusty', 'Misty', 'Golden', 'Hidden', 'Clever', 'Gentle', 'Wild', 'Silver', 'Hollow', 'Bright', 'Patient'];
const ANIMAL = ['Heron', 'Otter', 'Fox', 'Moth', 'Badger', 'Wren', 'Lynx', 'Newt', 'Raven', 'Hare', 'Gecko', 'Owl', 'Koi', 'Marten', 'Crane', 'Toad'];
export const codename = () => `${ADJ[Math.floor(Math.random() * ADJ.length)]} ${ANIMAL[Math.floor(Math.random() * ANIMAL.length)]}`;

export const INTERESTS = ['music', 'games', 'books', 'film', 'food', 'travel', 'science', 'art', 'sports', 'code', 'nature', 'philosophy'];

const queue: Player[] = [];
const coded = new Map<string, Player>();

/** Doc formula: C = 0.5*avg(1-|sA-sB|/6) + 0.3*Jaccard + 0.2*(#both strength>=2)/5 */
export function compatibility(a: Player, b: Player): number {
  const ids = loadPack().debates.slice(0, 5).map((d) => d.threadId);
  let agree = 0, strong = 0;
  for (const id of ids) {
    const sa = a.takes[id] ?? 0, sb = b.takes[id] ?? 0;
    agree += 1 - Math.abs(sa - sb) / 6;
    if (Math.abs(sa) >= 2 && Math.abs(sb) >= 2) strong++;
  }
  const A = new Set(a.interests), B = new Set(b.interests);
  const inter = [...A].filter((x) => B.has(x)).length;
  const uni = new Set([...A, ...B]).size || 1;
  return 0.5 * (agree / ids.length) + 0.3 * (inter / uni) + 0.2 * (strong / ids.length);
}
const tier = (c: number): Difficulty => (c >= 0.6 ? 'easy' : c >= 0.35 ? 'medium' : 'hard');

export function enqueue(p: Player) {
  dequeue(p);
  if (p.matchCode && p.matchCode.toUpperCase().startsWith('PRACTICE')) {
    startPractice(p);
    return;
  }
  if (p.matchCode) {
    const code = p.matchCode.toUpperCase().slice(0, 12);
    const waiting = coded.get(code);
    if (waiting && waiting !== p && waiting.ws.readyState === waiting.ws.OPEN) {
      coded.delete(code);
      start(waiting, p, true);
    } else {
      coded.set(code, p);
      sendTo(p.ws, { t: 'queued', position: 1, code });
    }
    return;
  }
  const i = queue.findIndex((q) => q !== p && q.ws.readyState === q.ws.OPEN);
  if (i >= 0) {
    const o = queue.splice(i, 1)[0];
    start(o, p, o.demo || p.demo);
  } else {
    queue.push(p);
    sendTo(p.ws, { t: 'queued', position: queue.length });
  }
}

export function dequeue(p: Player) {
  const i = queue.indexOf(p);
  if (i >= 0) queue.splice(i, 1);
  for (const [k, v] of coded) if (v === p) coded.delete(k);
}

function start(a: Player, b: Player, demo: boolean) {
  const c = compatibility(a, b);
  const difficulty = tier(c);
  log('match', `${a.codename} + ${b.codename} compat=${c.toFixed(2)} -> ${difficulty}`);
  new Room(a, b, { demo, difficulty });
}
