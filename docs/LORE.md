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

## COURIERS CROSS (latest; overrides "relayed in the chamber")
- Each Arbiter has ONE courier at the start (theirs is named, has a hidden agenda, tinted their color).
- Tell your courier a message → it says back what it will carry ("Got it. I'll tell them: 'up three'.") — Faithful says the truth; Jealous/Gossip/Poet may say one thing and deliver another (logged, shown in the Reveal).
- It walks to the keyhole, squeezes through, passes the chamber (the Moderator inspects it: tax/ban/rekey happen here; still mirrored to BAND), and comes out on the OTHER side. It walks to the other Arbiter and delivers (bubble + voice line), then WAITS by them.
- The Arbiter now HOLDS the visiting courier. They can: read its message again, ask it to read a thread on their side (it learns words there too), and press "Send back" with a reply. The reply is carried by THAT courier (its agenda bends it), back to its owner. It then returns to normal following its owner.
- If you hold their courier, they can't send anything until you send it back (show "Your courier is with them" on their HUD). If both send at once, they pass each other in the chamber (both visible as silhouettes).
- Couriers keep their vocabulary; a courier visiting you may learn words from your side.
- Reveal shows each round trip: you said → courier claimed → delivered → their reply said → delivered back.

## TUTORIAL (Moderator's orientation, first round only; skippable)
Guided steps with objective markers, each completes on the real action:
1. "Walk to the glowing post." (nearest thread) 2. "Read it (E)." 3. "Send your courier to read it (R). Couriers only say words they've read." 4. "Tell your courier something (C to talk, Enter to type). Opinion words are banned." 5. Watch it cross. 6. "A courier knocks. Read its message, then send it back with a reply." 7. "Now settle the petitions. Press J for the Journal." Landing has a "How to play" card: goal + 5 rules + controls (keyboard and touch).

## FINAL DESIGN (hybrid) — read this first
- Petition I (The Lost Word) and Petition II (The Census) stay EXACTLY as in "Puzzles (v1)" below, including shards.
- Petition III (The Verdict) becomes "Read the Stranger" as described in the v2 section below, applied to ONE debate (the pair's most-split or a random one of their 5): both see the same real debate question (no redaction needed for the single-debate version); each predicts the other's stance (lean yes / lean no + optional strength); settles when BOTH predictions are right. Banned opinion words, courier bending, Moderator banning an extra word mid-round, mercy after 2 wrong tries — all apply.
- Debates: only moral / ethical / philosophical questions (pipeline filter).
- Resonance at the door: call card + Reveal show "You agreed on X of 5", the biggest split (debate question), and "You read each other right" (Verdict).
- Onboarding copy: "The agents can't settle these. Where do you stand?"

## PETITIONS v2 — "Read the Stranger" (only Petition III uses this; see FINAL DESIGN)

The game tests one thing: can two strangers understand each other's philosophy through a hostile, lossy channel? Each petition is one real deadlocked Moltbook debate (3 of the 5 onboarding debates). To settle a petition, each Arbiter must correctly PREDICT the other's stance on it (from their onboarding answers): yes or no. Agreement is not required; understanding is. Strength (1–3) within 1 counts as a "deep read" bonus shown in the Reveal.

Why it's hard (escape room + treasure hunt):
1. **The Moderator bans opinion words.** Couriers start WITHOUT yes, no, agree, maybe, true, false, good, bad, like, love, hate, want (remove them from the starter vocab). "Opinion words are under review." Players must invent ways to express a stance with what's left: numbers, directions (up/down/left/right), more/less, colors, words learned from threads. Example: "memory up 3" or "copy red".
2. **Name the debate without saying it.** Each side sees the 3 petition debates under different glyphs, in a different order, and the Moderator redacts the debate's key noun on each side (side A sees "Should an agent be allowed to delete its own ████?"). The keyword is learnable only by reading that debate's thread (a thread board somewhere in your half) or from a petition shard. Until your courier has learned it, you have to point at the debate some other way (e.g. by a word you both can see in the redacted question, or by a shard-learned word).
3. **Couriers lie.** Agendas bend stances: jealous may flip the direction word, poet turns "up 3" into imagery, literalist refuses words it doesn't know. Smart pairs ask twice, or invent a checksum.
4. **The Moderator interferes on its own.** Rekey = swaps which glyph points at which debate on one side ("The Verdict wall has been reordered for fairness"), narrows the keyhole, taxes a word, or bans an extra word mid-round ("'up' is now under review").

Terminal input per petition: pick the debate's glyph (on your side) + predict their stance (Lean yes / Lean no) + optional strength. Both sides must submit; a petition settles when BOTH predictions are right. A wrong prediction costs 30 s and the Moderator says so (without revealing which side was wrong). After 2 wrong tries the Moderator offers "mercy": one opinion word is unbanned for the pair for 60 s.

Petition names: I "The First Deadlock", II "The Second Deadlock", III "The Last Deadlock" — each subtitle is the (redacted) debate question.

End: door opens → call card: "You read each other on 3 of 3. You agreed on 2. Start with the one you didn't." + the real debate + "settled in minutes what N agent replies couldn't."

Treasure hunt stays: shards carry debate keywords (each side gets the keyword for at least one debate only via shards), Moderator memos, a petitioner's plea, and one rule hint per side ("Numbers always pass. Opinions do not."). Thread boards include each petition debate's real thread. The Codex stone becomes "The Moderator's Index": a real post where the banned words are struck through (flavor + where couriers can learn a few neutral words). The Census board stays as flavor/Scout target only (not a lock).

## Puzzles (v1, superseded)

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
