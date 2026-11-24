// Append-only game event log (data/events.ndjson) consumed by the Bruin stats assets.
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { DATA, ENV, log } from './env';

export interface GameEvent {
  ts: string;
  roomId: string;
  round: number;
  actor: string;
  agenda?: string;
  action: string;
  target?: string;
  wordsIn?: string[];
  wordsOut?: string[];
  reason: string;
  unlockSeconds?: number;
  difficulty?: string;
  caught?: boolean;
  /** Human opinion events: the Arbiter's onboarding answer (-3..3). */
  stance?: number;
}

fs.mkdirSync(ENV.dataDir, { recursive: true });

export function logEvent(e: Omit<GameEvent, 'ts'>) {
  const row: GameEvent = { ts: new Date().toISOString(), ...e };
  fs.appendFile(DATA('events.ndjson'), JSON.stringify(row) + '\n', () => {});
}

let statsRunning = false;
/** Kick the Bruin stats pipeline after a round. Non-blocking; failures are ignored. */
export function runStatsPipeline() {
  if (statsRunning) return;
  statsRunning = true;
  try {
    const p = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'pipeline:stats'], {
      cwd: process.cwd(),
      stdio: 'ignore',
      shell: process.platform === 'win32',
    });
    const t = setTimeout(() => p.kill(), 120_000);
    p.on('exit', (code) => {
      clearTimeout(t);
      statsRunning = false;
      log('bruin', `stats pipeline exited ${code}`);
    });
    p.on('error', () => {
      clearTimeout(t);
      statsRunning = false;
    });
  } catch {
    statsRunning = false;
  }
}
