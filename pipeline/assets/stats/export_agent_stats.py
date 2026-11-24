""" @bruin
name: stats.export_agent_stats
type: python
description: |
  Writes data/agent_stats.json (AgentStats contract). Each agent gets a one-sentence memoryLine that the
  game server injects into its prompt next round, shifting its behaviour (e.g. a companion caught distorting
  becomes more honest). Also writes the leaderboard.
depends:
  - stats.agent_stats
  - stats.pair_stats
  - stats.human_opinions
@bruin """
import sys, json, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from kk_common import connect, DATA

con = connect()
agents = []
for key, rounds, dist, caught, trades, devs, wev, unlock in con.execute(
        "select agent_key, rounds, distortion_rate, caught_count, trades, deviations, world_events, avg_unlock_seconds from stats.agent_stats order by agent_key").fetchall():
    parts = [f"Across {rounds} round{'s' if rounds != 1 else ''}"]
    if key in ("gatekeeper",):
        parts.append(f"you triggered {wev} world event{'s' if wev != 1 else ''}")
        if unlock: parts.append(f"pairs opened the door in {unlock:.0f}s on average" + ("; make them work harder" if unlock < 300 else "; ease up when they are stuck"))
    else:
        parts.append(f"you bent {dist:.0%} of relayed messages")
        if devs: parts.append(f"dropped or spun words {devs} time{'s' if devs != 1 else ''}")
        if caught: parts.append(f"got caught {caught} time{'s' if caught != 1 else ''}, so humans trust you less; be more careful")
        elif devs: parts.append("and nobody caught you yet")
        if trades: parts.append(f"made {trades} trade{'s' if trades != 1 else ''}")
    line = ", ".join(parts) + "."
    # couriers (keyed by agenda) speak their memory in character; this is the line they quote once per round
    pct = f"{float(dist or 0):.0%}"
    voice = {
        "faithful": f"{rounds} rounds, and I bent {pct} of what I carried. I keep my word.",
        "poet": f"{rounds} rounds. I dressed up {pct} of the words I carried. Plain words bore me.",
        "jealous": f"{rounds} rounds. I lost {pct} of the words along the way. Some words are mine.",
        "literalist": f"{rounds} rounds, {pct} changed. I carry exactly what is said, no more.",
        "gossip": f"{rounds} rounds. {pct} of my messages came out a little different. People talk.",
    }.get(key)
    if voice:
        if caught: voice += f" Caught {caught} time{'s' if caught != 1 else ''}. I'll be careful."
        line = voice
    agents.append({"key": key, "rounds": int(rounds), "distortionRate": round(float(dist or 0), 3), "caughtCount": int(caught),
                   "trades": int(trades), "avgUnlockSeconds": round(float(unlock), 1) if unlock is not None else None,
                   "memoryLine": line})
board = [{"roomId": r[0], "difficulty": r[1], "unlockSeconds": round(float(r[2]), 1), "at": str(r[3])}
         for r in con.execute("select room_id, difficulty, unlock_seconds, at_ts from stats.pair_stats order by unlock_seconds asc limit 20").fetchall()]
humans = [{"threadId": r[0], "question": r[1], "yes": int(r[2]), "no": int(r[3]), "n": int(r[4])}
          for r in con.execute("select thread_id, question, yes, no, n from stats.human_opinions order by n desc, thread_id").fetchall()]
con.close()
out = {"generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "agents": agents, "leaderboard": board, "humans": humans}
(DATA / "agent_stats.json").write_text(json.dumps(out, indent=1), encoding="utf-8")
print(f"agent_stats.json agents={len(agents)} leaderboard={len(board)} humans={len(humans)}")
