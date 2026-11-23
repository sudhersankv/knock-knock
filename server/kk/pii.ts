// Personal-info filter applied to every human instruction before a companion sees it.
const PATTERNS: [string, RegExp][] = [
  ['email', /[\w.+-]+@[\w-]+\.[\w.-]+/i],
  ['phone', /(\+?\d[\d\s().-]{7,}\d)/],
  ['url', /\b(https?:\/\/|www\.)\S+|\b\S+\.(com|net|org|io|ai|gg|me|co|app|dev)\b/i],
  ['handle', /(^|\s)@[a-z0-9_.]{2,}/i],
  ['social', /\b(insta(gram)?|snap(chat)?|discord|tiktok|whatsapp|telegram|twitter|linkedin)\b/i],
  ['address', /\b\d{1,5}\s+\w+(\s\w+)?\s+(st|street|ave|avenue|rd|road|blvd|lane|ln|dr|drive|way)\b/i],
];

export function piiCheck(text: string): { clean: string; blocked: string[] } {
  const blocked: string[] = [];
  let clean = text;
  for (const [name, re] of PATTERNS) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    if (g.test(clean)) {
      blocked.push(name);
      clean = clean.replace(g, ' [blocked] ');
    }
  }
  return { clean: clean.replace(/\s+/g, ' ').trim(), blocked };
}
