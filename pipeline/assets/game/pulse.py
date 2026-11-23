""" @bruin
name: game.pulse
type: python
description: |
  The Pulse lock: activity per submolt over the last 24 hours (posts + their comments), frozen into snapshots
  of 3-4 submolts whose adjacent counts differ by at least 15% so the order is unambiguous. Falls back to a
  7-day window when the last 24 h is too sparse. The answer changes with the real agent society.
depends:
  - stage.posts_clean
@bruin """
import sys, itertools, random, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from kk_common import connect

con = connect()
def activity(hours):
    return con.execute(f"""
      select submolt, count(*) + sum(comment_count) as activity
      from stage.posts_clean
      where created_at >= (select max(fetched_at) from stage.posts_clean) - interval {hours} hour
      group by submolt having count(*) >= 1 order by activity desc
    """).fetchall()

rows = activity(24)
if len(rows) < 5:
    rows = activity(24 * 7)
rows = [(s, int(a)) for s, a in rows if a > 0]

def ok(combo):
    acts = sorted((a for _, a in combo), reverse=True)
    return all(acts[i] >= acts[i + 1] * 1.15 for i in range(len(acts) - 1))

rng = random.Random(int(time.time() // 3600))
snaps = []
for size in (3, 4):
    combos = [c for c in itertools.combinations(rows[:10], size) if ok(c)]
    rng.shuffle(combos)
    used = []
    for c in combos:
        key = frozenset(s for s, _ in c)
        if any(len(key & u) >= size - 1 for u in used):
            continue
        used.append(key)
        snaps.append(sorted(c, key=lambda x: -x[1]))
        if len(used) >= 3:
            break

snapshot_at = str(con.execute("select max(fetched_at) from stage.posts_clean").fetchone()[0])
con.execute("create schema if not exists game")
con.execute("create or replace table game.pulse (snapshot_id varchar, snapshot_at varchar, submolt varchar, activity_24h integer, rank integer)")
for i, snap in enumerate(snaps):
    for r, (s, a) in enumerate(snap, 1):
        con.execute("insert into game.pulse values (?,?,?,?,?)", [f"pulse-{i+1}", snapshot_at, s, a, r])
con.close()
print(f"pulse snapshots={len(snaps)} from {len(rows)} active submolts")
