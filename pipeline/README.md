# Knock Knock: Bruin pipeline

Bruin builds the game. Every lock in a round comes from live Moltbook data, and Bruin's quality checks prove each lock is real and solvable before a player sees it. Bruin also turns gameplay events into the agents' long-term memory.

```
bash pipeline/run.sh          # full run, about 40 s: Moltbook → DuckDB → locks → checks → data/round_pack.json → stats
bash pipeline/run.sh stats    # about 2 s, after every round: data/events.ndjson → data/agent_stats.json
```

- **Pipeline and storage:** `pipeline/` holds the `knockknock` pipeline. It runs on a DuckDB connection (`duckdb-default`, defined in `/.bruin.yml`) and writes to `data/knockknock.duckdb`.
- **Documentation site:** `pipeline/docs.html` is a self-contained site that Bruin generated, with lineage and code (`bruin docs`).

## Assets

| Asset | Type | What it does |
|---|---|---|
| `raw.moltbook_ingest` | python | Pulls from the public Moltbook API (no key, read-only): about 12 submolts, about 500 hot and new posts, full bodies for the 140 most-used posts, and comment trees (about 4.5k comments). Writes `raw.submolts`, `raw.posts` and `raw.comments`. |
| `raw.submolts_checked` | sql (view) | not_null and unique checks on submolts. |
| `stage.posts_clean` | sql | Dedupes posts and strips markdown, links, emails and @handles. Includes a custom check that no PII survives. |
| `stage.comments_clean` | sql | Cleans comments the same way and keeps reply depth, which is how arguments are detected. |
| `game.threads_vocab` | python | Picks the in-world clue threads and computes each thread's 12 most distinctive words by TF-IDF. Reading a thread in-game grants exactly those words; companions can only speak words they have harvested. |
| `game.codex` | python | **Lock 1, book cipher.** Selects real posts: easy ones are 40–120 words, hard ones 150–300. Each is split into lines of about 8 words. The pass word has 7+ letters, occurs exactly once, and appears in no vocabulary, so a companion can never say it. Players have to send something like "line 4 word 9". |
| `game.pulse` | python | **Lock 2, the live society.** Posts plus comments per submolt over the last 24 h, frozen into snapshots of 3–4 submolts. Adjacent counts must differ by at least 15% so the order is unambiguous. The answer changes as Moltbook changes. |
| `game.debates` | python + LLM | **Lock 3 and onboarding.** Finds the 5 most split threads: many comments relative to upvotes, deep reply chains and downvotes. An LLM rewrites each as a neutral yes/no question. Its keyword is validated against that thread's vocabulary. |
| `game.quality_gate` | sql (view) | 12 custom checks. A failed check fails the run, and the game keeps the last good pack. |
| `game.export_round_pack` | python | Writes `data/round_pack.json` (see `shared/kk/pack.ts`), re-runs every rule and embeds the results in `checks[]`. |
| `stats.events` | python | Loads `data/events.ndjson`, which the game server appends to on every relay, word drop, trade, rekey, budget change and unlock. |
| `stats.agent_stats` | sql | Per-agent behaviour: distortion rate, times caught, trades and world events, keyed by companion agenda and for the Gatekeeper. |
| `stats.pair_stats` | sql | Solve time per room and difficulty, used for the leaderboard. |
| `stats.export_agent_stats` | python | Writes `data/agent_stats.json`, which includes a one-line `memoryLine` per agent. The server puts that line into the agent's prompt in the next round; for example, a companion caught dropping words gets more honest. |

**Check counts:** the full run passes 26 Bruin quality checks plus 11 embedded pack checks, and the stats run passes 4.

The quality gate checks enforce these rules:
- Every thread has a real Moltbook ID.
- There are exactly 5 debates, and each debate keyword is in its thread's vocabulary.
- The codex word occurs exactly once and is unsayable.
- Pulse ranks are distinct and at least 15% apart.
- No PII appears in any text shown to players.

## Bruin Cloud

Team `psychefactory` is authenticated with the API key, stored as `BRUIN_TOKEN` in `.env` and passed as `BRUIN_CLOUD_API_KEY`. Check it with `bash pipeline/cloud.sh status`.

Bruin Cloud runs pipelines from a connected Git repository, and its DuckDB connection is MotherDuck. Putting the same pipeline on Cloud takes these steps:
1. `bash pipeline/cloud.sh connect https://github.com/<you>/<repo>` connects the public submission repo, and Cloud parses `pipeline/`.
2. `bash pipeline/cloud.sh motherduck <token>` registers `duckdb-default` on Cloud.
3. `bash pipeline/cloud.sh run` triggers the run. The run, its assets and the quality checks then show in the Cloud UI.

The game does not depend on Cloud. It always reads the local outputs, so the local run is the fallback.
