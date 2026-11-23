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

## THE CLICK (one sentence everyone should get)
"The AI agents on Moltbook are stuck on a debate. They pull two strangers in to settle it, but every word between them has to go through an AI that might twist it. And the stranger might not even be human."

## AI ARBITERS (agents as players)
The stranger on the other side may be another human OR an AI agent from Moltbook playing as an Arbiter. You are never told until the door opens.
- Matching: if no human is waiting after ~20 s, the Moderator assigns an AI Arbiter. Match codes always pair humans (unless code starts with AI-).
- Persona: a real Moltbook author from the pack (e.g. u/Quillfeather from m/ponderings). Its stances on the 5 debates come from its own post (LLM infers from its thread text), so it argues like that agent would.
- It plays the same game with the same rules: reads posts, sends its courier, replies to yours, finds the hidden word, ranks the Census, predicts your stance. Its replies are LLM-composed in character (curious, a bit uncanny), with human-like delays.
- At the door: no voice call. The AI Arbiter "speaks" its closing line in a dialogue box, then the reveal: "The stranger was u/Quillfeather, an AI agent from m/ponderings. You read each other right." The Reveal shows its stances next to yours.
- Practice round = an AI Arbiter flagged as practice (helpful, scripted-safe).

## SIMPLER PETITIONS (latest, overrides anything below about Petitions I and II)
Goal: every player always has something to DO at the terminal, the instructions say exactly who does what, and petitions can be done in any order.

**Petition I: The Lost Word (symmetric).** Both Codex stones show the same real Moltbook post, numbered lines, same order (no shuffle at any difficulty). Each side has its OWN hidden word from that post (two different words, both ≥6 letters, each occurring once, both banned for couriers). Your terminal shows: "Your hidden word: WORTHLESS. It is on line 10, word 3 of the stone. Help them find it." and an input: "Their hidden word: ______". Settles when BOTH sides have typed the other's word. Copy: "You each have a hidden word your courier can't say. Point them to it on the stone. Type theirs here."

**Petition II: The Census (simplified).** No runes, no eroded legend. Side A's terminal shows 3 Moltbook community names as chips and asks: "Put these communities in order, busiest today first. Your partner's Census board has the numbers." Side B's terminal + Census board show the 3 communities with today's activity bars: "Your partner has to rank these. Send them the order." A enters (input 'order', options = names). Community names are always in both couriers' vocabulary. Shards no longer gate this; legend shards become plain hints/lore.

**Petition III: The Verdict.** Unchanged.

**Who's who (must be explained in-game and in How to play):**
- The Moderator: the AI that runs the Commons. Lives inside the wall. Inspects every courier that passes and sometimes changes the rules on its own: shrinks the keyhole, bans a word, reshuffles a petition. Polite, a bit sinister.
- The Scout: a bird with a lantern. Flies over both sides and brings real news headlines from the web (via Telem) about today's busiest Moltbook community. Helpful for the Census.
- Couriers: yours and theirs. Carry messages, have agendas.

**Practice round = full walkthrough.** The orientation in practice mode walks through ALL THREE petitions with explicit steps and an example message for each, e.g. "Petition I: walk to the Codex stone and find your hidden word. Tell your courier 'line 10 word 3'." … "Petition II: ask the stranger for the busiest community: 'which is busiest'." … "Petition III: tell them where you stand without opinion words, e.g. 'up 2'. Then predict theirs." It ends when the door opens.

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

## THE SCOUT'S JOB (latest)
- Flies over the wall freely. Once per round per player, you can hand it ONE word (walk to it, E / gold button "Give the Scout a word"). It delivers that word straight to the stranger: no budget, no bans, no courier agenda. The one channel you can trust.
- Catch: it is the Moderator's informant. The word is reported and the Moderator bans it for the rest of the round ("'deletion' is now under review."). Sending a banned word (e.g. "yes") via the Scout is allowed and powerful.
- Its Telem headlines now hint at the Census: the headline + its line name which community is busiest today.
- It visits each human regularly (every ~45 s) so the trade is available; it waits ~10 s near you.

## AGENTS WITH BELIEFS (latest)
The Scout and the Moderator are agents with their own opinions, not referees.
- At round start each gets its own stance on the 5 debates (LLM_FAST once: persona-based; Scout = restless, curious, wants change; Moderator = institutional, wants order). They WANT the Verdict to land their way and act on it autonomously.
- Scout, on each visit, decides via LLM (JSON action menu): share_headline (real Telem headline that hints the busiest community) | gossip (claims what the stranger thinks, may be true or a lie in its own favour) | lobby (argues its stance on the Verdict debate in one line) | offer_carry. When carrying your one word it MAY swap it if the word works against its belief (e.g. "down"→"up"), at most once per round, logged as a deception.
- Moderator lobbies: once or twice per round it posts a terminal whisper ("The Commons record shows most Arbiters lean yes."), may be false; its mid-round ban prefers words that help the side it disagrees with. Logged.
- Everything is logged with the agent's stated reason. The Reveal gets a "What the agents wanted" section: each agent's stance on the Verdict debate, plus every lie/nudge it made (said vs truth).
- Keep the game solvable: deceptions are bounded (Scout: ≤1 swap + ≤2 gossip lies per round; Moderator: ≤2 whispers), never touch Petition I/II answers directly.

## SHOW THE SOCIETY (latest): Moltbook, BAND and Bruin visible in play
- Briefing line 1 uses real society numbers from the pack (`society`): "Today {activeAgents24h} agents posted {posts24h} times on Moltbook. On five questions, they cannot agree. You have been summoned to settle it."
- Verdict terminal shows "What the agents are saying": 2–4 real replies from that thread (author, quote, which way it leans) = the argument the humans are settling.
- The Commons Wire (BAND): a slim live feed (top-right under the timer, collapsible) of the agents talking to each other in the chamber chat on BAND: Moderator inspections, courier banter, Scout reports, AI Arbiter remarks. Label "Live from the chamber · BAND". Never reveals the other side's message contents (show "Pip passes through with 4 words" style lines).
- The Commons Record (Bruin): the legend board becomes the Commons Record board (interactable): society numbers, "Built from Moltbook {time} ago by the Bruin pipeline · {checksPassed}/{checksTotal} checks passed · {threads} threads", history from agent_stats (rounds played, how often couriers lied, times caught, best unlock time, one memory line per agenda). Couriers quote their memory line once per round in a bubble.
