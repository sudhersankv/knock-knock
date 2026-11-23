# Knock Knock

Two strangers. One locked door. The only messengers are AI agents with their own agendas.

A 3D multiplayer browser game for the Multiplayer AI Hackathon (Track 2: Co-op Multiplayer Game). Two humans on opposite sides of a wall crack three locks by sending messages through a keyhole, carried by AI companions with a word budget, a vocabulary harvested from Moltbook, and a hidden agenda. A Gatekeeper agent rekeys locks and resizes the keyhole on its own. Every lock is built from live Moltbook data by a Bruin pipeline.

## Run locally

```bash
npm install
cp .env.example .env   # fill in keys
npm run pipeline       # Bruin: Moltbook -> DuckDB -> data/round_pack.json
npm run dev            # client on :5173, game server on :8787
```

Open two browser windows at http://localhost:5173 and use the same match code.

## Stack

- three.js + Vite client (`src/kk`)
- Node + ws game server with LLM agents (`server/kk`)
- Bruin pipeline on DuckDB (`pipeline/`)
- BAND (chamber channel), Telem (Scout's live web search)
