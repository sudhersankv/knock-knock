// Server config from env (.env loaded by `tsx --env-file=.env`). Never log secrets.
import path from 'node:path';
import fs from 'node:fs';

// Minimal .env loader for `npx tsx server/kk/index.ts` without --env-file (e.g. Fly uses real env vars).
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

export const ENV = {
  port: Number(process.env.PORT ?? 8787),
  llmBase: (process.env.LLM_BASE_URL ?? '').replace(/\/+$/, ''),
  llmKey: process.env.LLM_API_KEY ?? '',
  llmFast: process.env.LLM_FAST || 'claude-haiku-4-5',
  llmStrong: process.env.LLM_STRONG || 'claude-sonnet-5-5',
  bandKey: process.env.BAND_API_KEY ?? '',
  telemKey: process.env.TELEM_API_KEY ?? '',
  dataDir: path.resolve(process.cwd(), 'data'),
  distDir: path.resolve(process.cwd(), 'dist'),
};
export const DATA = (f: string) => path.join(ENV.dataDir, f);

const C = { reset: '\x1b[0m', dim: '\x1b[2m' };
export function log(tag: string, ...a: unknown[]) {
  console.log(`${C.dim}[${new Date().toLocaleTimeString()}]${C.reset} [${tag}]`, ...a);
}
