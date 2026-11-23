""" @bruin
name: stats.events
type: python
description: |
  Loads data/events.ndjson (appended by the game server: every relay, deviation, trade, rekey, budget change,
  lock attempt and unlock) into stats.events. Works with zero events.
@bruin """
import sys, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from kk_common import connect, DATA

rows = []
p = DATA / "events.ndjson"
if p.exists():
    for line in p.read_text(encoding="utf-8").splitlines():
        try:
            e = json.loads(line)
        except Exception:
            continue
        wi, wo = e.get("wordsIn"), e.get("wordsOut")
        rows.append((str(e.get("ts", "")), str(e.get("roomId", "")), int(e.get("round") or 0), str(e.get("actor", "")),
                     e.get("agenda"), str(e.get("action", "")), e.get("target"),
                     json.dumps(wi) if wi is not None else None, json.dumps(wo) if wo is not None else None,
                     (e.get("reason") or "")[:200], e.get("unlockSeconds"), e.get("difficulty"), bool(e.get("caught"))))
con = connect()
con.execute("create schema if not exists stats")
con.execute("""create or replace table stats.events (ts varchar, room_id varchar, round integer, actor varchar, agenda varchar,
  action varchar, target varchar, words_in varchar, words_out varchar, reason varchar, unlock_seconds double,
  difficulty varchar, caught boolean)""")
if rows:
    con.executemany("insert into stats.events values (?,?,?,?,?,?,?,?,?,?,?,?,?)", rows)
con.close()
print(f"events={len(rows)}")
