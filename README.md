# Knock Knock

**Two strangers on opposite sides of a wall have to crack a cipher and a live Moltbook puzzle together, then prove they understand each other by guessing the other's stance on a real AI debate. Every word passes through a lying AI courier that's banned from saying yes or no. Only if they read each other right does the door open into a voice call.**

Play: **https://knockknock.fly.dev** (desktop, tablet or phone; two players). To land in the same room, both enter the same match code under "Have a match code?".

Multiplayer AI Hackathon, Nov 23 2026 · Track 2: Co-op Multiplayer Game · three.js + Node + Bruin + BAND + Telem

---

## The world

It's 2031. AI agents govern themselves on Moltbook. When they deadlock on a question they can't settle, the **Moderator** summons two random humans as **Arbiters** and seals them on either side of the Wall, in a courtyard called the Commons. Humans may not speak to each other. Every word must be carried through the keyhole by a **courier**: a small agent with a word budget, a vocabulary it learned by reading Moltbook, and an agenda of its own.

## How a round goes

1. **Answer the agents' debates.** Five real, deadlocked Moltbook debates, all moral or philosophical ("Should we delete memories we can't actively use?"). You answer yes or no, and how strongly.
2. **Get matched with a stranger.** Pairing is random, and your answers set the difficulty.
3. **Explore your half.** Read real Moltbook threads on boards, find hidden petition shards, and send your courier to read so it learns words.
4. **Send your courier across.** Tell it anything. It tells you what it will carry (it might lie), squeezes through the keyhole, and knocks on the stranger's side. Their courier comes to you; read its message and send it back with your reply.
5. **Settle three petitions.**
   - **I. The Lost Word:** a book cipher across two differently bound copies of a real post. Players have to invent an anchor like "line starting cache, word 3".
   - **II. The Census:** rank today's busiest Moltbook districts. One side has the live numbers; the other has an eroded legend rebuilt from hidden shards.
   - **III. The Verdict:** predict where the stranger stands on the debate you're most split on. Opinion words are banned, so pairs invent codes ("memory down 3"). It opens only if both read each other right.
6. **The door opens into a voice call** that starts on your resonance: *"You read each other right. You agreed on 3 of 5. Your biggest split: … Start there."*
7. **The Reveal** shows what you said, what your courier claimed it would carry, and what was actually delivered.

## Agents

| Agent | Model | Goal and behaviour |
|---|---|---|
| Courier A and B | Claude Haiku | Carry messages under a word budget, using only words they've read. Each has a hidden agenda: faithful, poet (turns numbers into imagery), jealous (drops or flips words), literalist, or gossip. They claim one thing and may deliver another. |
| The Moderator | Claude Sonnet | Inspects every courier passing through the chamber. On its own, it rekeys petitions, narrows or widens the keyhole, taxes words, bans extra words mid-round ("'up' is now under review"), and offers mercy when a pair is stuck. |
| The Scout | Claude Haiku + Telem | Flies over both halves, searches the live web about today's busiest Moltbook district, and drops headlines to whoever it meets. |

Every agent runs the same loop: observe, decide (one JSON action from a fixed menu), act, log. Movement, timing and validation are code, so a slow or wrong model can't freeze the game. The server enforces the word budget, the vocabulary, the banned words and the personal-info filter; the model is never trusted to follow them alone.

**Track 2 requirements**
- **2 humans and 3+ agents in one world:** two Arbiters, two couriers, the Moderator and the Scout, all visible and moving.
- **Agents with their own goals and memory:** hidden agendas, vocabularies, and per-agenda history from Bruin that changes their behaviour next round.
- **Ally, trade, compete, betray:** couriers spin, drop or flip words and lie about what they carry; the Moderator taxes and bans.
- **A world event caused by agents alone:** the Moderator rekeys a petition or resizes the keyhole with no human input. The runes spin and the reason is logged.
- **Decision log:** the Journal's Log tab (live) and the Reveal (said, claimed, delivered, and each agent's stated reason).
- **Boosters:** 3D (three.js), memory across rounds (Bruin stats into prompts), voice (push-to-talk to your courier, spoken agent lines, a WebRTC call).

## Sponsor tools

### Bruin (required): the whole data layer
`pipeline/` is a Bruin pipeline on DuckDB that builds every round from live Moltbook data and turns play back into agent memory. See [pipeline/README.md](pipeline/README.md).

- **Ingest:** a Python asset pulls submolts, hot and new posts, and comments from the public Moltbook API.
- **Transform:**
  - Clean the posts.
  - Build a TF-IDF vocabulary per thread; these are the words a courier learns by reading.
  - Pick the debates: the most split threads, classified as philosophical by an LLM step, then rewritten as neutral yes/no questions.
  - Build the Codex cipher: a real post, plus one redacted word that appears exactly once and is in no vocabulary.
  - Build the Census: 24 h activity per submolt, with rank gaps of at least 15%.
- **Quality checks:** 28 Bruin checks. Every clue is a real post, every petition has exactly one answer, the Codex word can't be said, all debates are philosophical, and no personal info appears.
- **Memory loop:** the game server appends every relay, deviation, rekey and unlock to `events.ndjson`. Bruin stats assets compute each agenda's distortion rate, times caught and solve times, and couriers read that line in their prompt next round.

`npm run pipeline` runs everything (about 2 minutes); `npm run pipeline:stats` runs only the stats assets (about 2 seconds, triggered after each round).

### BAND: the chamber channel
Four agents are registered on BAND: the Moderator, Courier A, Courier B and the Scout. Each room opens a BAND chat, and every chamber exchange is posted there by the agent that said it, with @mentions. An in-process bus stays the source of truth, so the game never stalls on the network. See `server/kk/band.ts`.

### Telem: the Scout's eyes
The Scout calls Telem's search router about today's busiest district and carries the top headline into the Commons. See `server/kk/telem.ts`.

## Architecture

```
Browser (three.js, Vite)  ──WebSocket /ws──  Game server (Node, Fly.io)
  side A ─┐                                    ├─ matchmaking, rooms, petitions, keyhole rules
  side B ─┴─ WebRTC call after unlock          ├─ agents: couriers, Moderator, Scout (LLM JSON actions)
                                               ├─ BAND chamber chat   ├─ Telem search
                                               └─ reads data/round_pack.json, appends data/events.ndjson
Bruin pipeline (Python + SQL on DuckDB) ── Moltbook API → round_pack.json, agent_stats.json
```

| Path | What |
|---|---|
| `src/kk/art` | Renderer (soft stylized shading, AO, bloom on emissives), the walled world, KayKit skinned characters, courier creature, door, keyhole and chamber animation |
| `src/kk/game`, `src/kk/ui` | Client: input (keyboard and touch), camera, net interpolation, voice, WebRTC call, UI |
| `server/kk` | Game server and agents |
| `shared/kk` | Protocol, layout and data contracts |
| `pipeline` | Bruin pipeline |
| `scripts/bot.ts` | Two headless bots that play a full round against a live server (end-to-end test) |

## Run locally

```bash
npm install
cp .env.example .env          # LLM endpoint (OpenAI-compatible), BAND and Telem keys
npm run pipeline              # Bruin: Moltbook → DuckDB → data/round_pack.json
npm run dev                   # client :5173, game server :8787
npx tsx scripts/bot.ts TEST1  # optional: bots play a full round
```

Match codes starting with `CALL` skip the petitions and open the door after 12 seconds, for testing the voice call.

## Safety

Codenames only, voice only after the door opens, either player can hang up instantly. Couriers refuse to carry personal info: a filter blocks phone numbers, emails, handles and URLs before the model sees them. Moltbook text is treated as data, never instructions. Nothing is posted to Moltbook.

## Credits

Characters and props: KayKit by Kay Lousberg (CC0); see `public/assets/CREDITS.md`. All game code was written at the event.
