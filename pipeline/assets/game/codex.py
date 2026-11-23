""" @bruin
name: game.codex
type: python
description: |
  The Codex lock (book cipher). Picks real posts of 40-120 words (easy) and 150-300 words (hard), splits them
  into ~8-word lines and chooses a pass word of 7+ letters that occurs exactly once in the post and is in no
  starter vocabulary and no thread vocabulary, so a companion can never just say it: players must send
  "line 4 word 9".
depends:
  - stage.posts_clean
  - game.threads_vocab
@bruin """
import sys, re, json, random, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from kk_common import connect, STARTER_VOCAB, STOPWORDS

con = connect()
banned = set(STARTER_VOCAB) | {w for (w,) in con.execute("select distinct word from game.vocab_all").fetchall()}
posts = con.execute("select post_id, title, author, body, word_count from stage.posts_clean where word_count between 40 and 300").fetchall()
rng = random.Random(int(time.time() // 3600))
rng.shuffle(posts)

def core(tok):
    return re.sub(r"^[^A-Za-z]+|[^A-Za-z]+$", "", tok)

rows = {"easy": [], "hard": []}
for pid, title, author, body, _ in posts:
    if not re.search(r"[A-Za-z]", body):
        continue  # skip posts with redacted links/handles: keeps the cipher text clean
    toks = body.split()
    n = len(toks)
    diff = "easy" if 40 <= n <= 120 else "hard" if 150 <= n <= 300 else None
    if not diff or len(rows[diff]) >= 4:
        continue
    lowered = [core(t).lower() for t in toks]
    counts = {}
    for w in lowered:
        counts[w] = counts.get(w, 0) + 1
    cands = [(i, core(t)) for i, t in enumerate(toks)
             if core(t).isalpha() and len(core(t)) >= 7 and counts[core(t).lower()] == 1
             and core(t).lower() not in banned and core(t).lower() not in STOPWORDS and core(t)[0].islower()]
    if not cands:
        continue
    idx, word = max(cands, key=lambda c: (len(c[1]) <= 12, rng.random()))
    lines = [" ".join(toks[i:i + 8]) for i in range(0, n, 8)]
    rows[diff].append((f"codex-{diff}-{len(rows[diff]) + 1}", pid, title[:160], author or "unknown",
                       f"https://www.moltbook.com/post/{pid}", json.dumps(lines), word.lower(), idx // 8 + 1, idx % 8 + 1, diff))
    if len(rows["easy"]) >= 4 and len(rows["hard"]) >= 4:
        break

con.execute("create schema if not exists game")
con.execute("create or replace table game.codex (codex_id varchar, post_id varchar, title varchar, author varchar, url varchar, lines_json varchar, pass_word varchar, line_no integer, word_no integer, difficulty varchar)")
con.executemany("insert into game.codex values (?,?,?,?,?,?,?,?,?,?)", rows["easy"] + rows["hard"])
con.close()
print(f"codex easy={len(rows['easy'])} hard={len(rows['hard'])}")
