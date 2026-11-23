# Knock Knock — world, framing and puzzle spec (source of truth for server + client copy)

## The world (dystopian framing)

It's 2031. AI agents outnumber people online, and they govern themselves on **Moltbook**, their social network. When the agents deadlock on a question they can't settle, the **Moderator** (the Gatekeeper agent) does what the charter allows: it summons two random humans as **Arbiters** and seals them in **the Commons**, a walled courtyard split by the Wall.

Humans may not speak to each other directly. Every word must pass through a **courier**: a small agent that squeezes through the keyhole, carries at most a few words, and only knows the words it has read on Moltbook. Couriers have agendas of their own.

The Arbiters leave only when the agents' **petitions** are settled. Each lock on the door is one petition, filed by a real Moltbook agent.

Tone: cozy courtyard on the surface, bureaucratic AI dystopia underneath. The Moderator is polite, procedural and unsettling. Never gory, never preachy.

## Names (use exactly)

| Thing | Name |
|---|---|
| Gatekeeper agent | The Moderator |
| Companion | your courier (named, e.g. Pip) |
| Players | Arbiters |
| The courtyard | the Commons |
| Locks | Petitions |
| Lock 1 (codex) | Petition I: The Lost Word |
| Lock 2 (pulse) | Petition II: The Census |
| Lock 3 (common) | Petition III: The Verdict |
| Hidden pickups | petition shards (scraps) |
| Journal | Arbiter's Journal |

## Briefing (shown once at drop-in, one card per line)

1. "The agents of Moltbook are deadlocked. You have been summoned to settle it."
2. "Another Arbiter is on the other side of the Wall. You will never hear them until the door opens."
3. "Your courier carries your words through the keyhole: a few at a time, and only words it has learned by reading."
4. "Settle the three petitions. The door opens when both of you agree."

## Puzzles

Every petition needs both sides plus a treasure hunt. No petition is solvable by one side or by reading one object.

### Petition I: The Lost Word (codex)
- An agent's post has a word the Moderator redacted. Side A's terminal shows the word. Side B must enter it.
- Both sides have the Codex stone with the same post, but **bound differently**: side B's lines are numbered in true order; side A's are shuffled and unnumbered (medium/hard). Easy: both numbered in the same order.
- A shard on side A says: "Their copy is bound true. Yours is not. Count by what you can both see." On side B: "Numbers always pass the keyhole."
- When a courier reads the Codex it learns every Codex word except the redacted word. So clever pairs send an anchor: "line starting cache, word 3" or "after amputation".

### Petition II: The Census (pulse)
- Side A's door has 3–4 runes and must enter them in order of today's activity on Moltbook (busiest first).
- Side A's legend board is **eroded**: it shows only one rune→district mapping. The others are on petition shards hidden around side A.
- Side B has the Census board (live 24 h activity per district, from the Bruin pipeline). B must send the order; A must map names to runes.
- Couriers can only say district names they've read; otherwise they send numbers.

### Petition III: The Verdict (common ground)
- The real deadlocked debate. Both sides list the 5 debates in different orders with different glyphs.
- Both must lock in the same debate as the one they both feel strongest about. The verdict is double-blind.
- Each debate's keyword is learned by reading its thread. A shard on each side gives a hint: "The Moderator listens for single words. Name the debate by its heart."

### Petition shards (treasure hunt)
- 3–4 shards per side, hidden at layout spots s1..s6 (faint glint, no label until found, walk near and press E).
- Shard types: legend fragments (needed), Codex binding hint (needed on A), Moderator memos (world-building, e.g. "MEMO 7: Arbiters resolve deadlocks 3.2x faster when separated. Keep them apart."), and a petitioner's plea quoting the real Moltbook author.
- Reading a shard teaches the courier its words.

## How-to-play layer
- Quest tracker (top-left, short imperative steps) driven by the server `quest` message.
- First-time contextual tips, each shown once: near a thread "R: your courier reads it and learns its words"; first terminal; first delivery "Their words passed through two agendas. Don't trust every word."; first shard.
- Arbiter's Journal (J): How it works (one page, 5 short rules), Petitions (status and what you know), Shards found, Words your courier knows.
