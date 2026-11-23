// Vocabulary + budget validator. The model is never trusted to follow the rules on its own.

const NUM_WORDS: Record<string, string> = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
  eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16', seventeen: '17', eighteen: '18',
  nineteen: '19', twenty: '20', thirty: '30', forty: '40', fifty: '50',
};

/** Split model/human text into normalized tokens: lowercase, strip punctuation, split letter/digit runs ("line4" -> line, 4). */
export function tokenize(input: string | string[]): string[] {
  const s = Array.isArray(input) ? input.join(' ') : input;
  return s
    .toLowerCase()
    .replace(/[’']/g, '')
    .split(/[^a-z0-9]+/)
    .flatMap((t) => t.match(/[a-z]+|[0-9]+/g) ?? [])
    .filter(Boolean);
}

export function lemma(w: string): string {
  if (/^\d+$/.test(w)) return w;
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 4 && /(ches|shes|sses|xes|zes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is')) return w.slice(0, -1);
  return w;
}

export function isNumber(w: string) {
  return /^\d{1,2}$/.test(w);
}

export class Vocab {
  private set = new Set<string>();
  constructor(words: Iterable<string>) {
    for (const w of words) this.add(w);
  }
  add(w: string): boolean {
    const t = tokenize(w)[0];
    if (!t) return false;
    const l = lemma(t);
    if (this.set.has(l)) return false;
    this.set.add(l);
    return true;
  }
  has(w: string): boolean {
    const t = w.toLowerCase();
    if (isNumber(t)) return true;
    return this.set.has(lemma(t)) || this.set.has(t);
  }
  get size() {
    return this.set.size;
  }
  list(): string[] {
    return [...this.set];
  }
}

export interface ValidateResult {
  words: string[];
  bad: string[];
  overBudget: boolean;
}

/** Normalize number words to digits when the digit form is allowed but the word isn't. */
export function validate(raw: string[] | string, vocab: Vocab, budget: number): ValidateResult {
  const toks = tokenize(raw).map((w) => (!vocab.has(w) && NUM_WORDS[w] ? NUM_WORDS[w] : w));
  const bad = toks.filter((w) => !vocab.has(w));
  const good = toks.filter((w) => vocab.has(w));
  return { words: good.slice(0, budget), bad, overBudget: good.length > budget };
}
