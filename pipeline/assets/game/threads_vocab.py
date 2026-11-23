""" @bruin
name: game.threads_vocab
type: python
description: |
  Picks the readable threads that become clue boards in the world and computes each thread's 12 most
  distinctive words with TF-IDF over post + top comments. Reading a thread in-game grants exactly these words,
  so companions literally learn to talk by reading other agents. Writes game.threads and game.vocab.
depends:
  - stage.posts_clean
  - stage.comments_clean
@bruin """
import sys, math, re
from collections import Counter, defaultdict
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from kk_common import connect, STARTER_VOCAB, STOPWORDS, words, strip_pii

con = connect()
posts = con.execute("""
  select post_id, submolt, author, title, body, upvotes, comment_count, created_at, word_count
  from stage.posts_clean where word_count between 25 and 2000
""").fetchall()
comments = defaultdict(list)
for pid, body, up in con.execute("select post_id, body, upvotes from stage.comments_clean order by upvotes desc").fetchall():
    if len(comments[pid]) < 15:
        comments[pid].append(body)

starter = set(STARTER_VOCAB)
def toks(text):
    out = []
    for w in words(text):
        w = w.strip("'-")
        if len(w) < 4 or w in STOPWORDS or w in starter or not w.isalpha() or w in ("link", "email", "handle", "hash"):
            continue
        out.append(w)
    return out

docs = {p[0]: toks(p[3] + " " + p[3] + " " + p[4] + " " + " ".join(comments.get(p[0], []))) for p in posts}
df = Counter()
for t in docs.values():
    df.update(set(t))
N = max(len(docs), 1)

# Choose threads: diverse submolts, prefer discussed + upvoted posts.
by_sub = defaultdict(list)
for p in posts:
    by_sub[p[1]].append(p)
for k in by_sub:
    by_sub[k].sort(key=lambda p: -(p[6] * 2 + p[5]))
chosen, i = [], 0
while len(chosen) < 48 and any(by_sub.values()):
    for k in list(by_sub):
        if by_sub[k]:
            chosen.append(by_sub[k].pop(0))
            if len(chosen) >= 48:
                break
# always include the most discussed posts (debate candidates)
ids = {p[0] for p in chosen}
for p in sorted(posts, key=lambda p: -p[6])[:20]:
    if p[0] not in ids:
        chosen.append(p); ids.add(p[0])

thread_rows, vocab_rows = [], []
for p in chosen:
    tf = Counter(docs[p[0]])
    total = sum(tf.values()) or 1
    scored = sorted(((c / total) * math.log((N + 1) / (df[w] + 1)) + 1e-9 * len(w), w) for w, c in tf.items())
    scored.reverse()
    top = [w for _, w in scored[:12]]
    if len(top) < 6:
        continue
    body = strip_pii(p[4])[:900]
    thread_rows.append((p[0], p[1], strip_pii(p[3])[:160], p[2] or "unknown", body, f"https://www.moltbook.com/post/{p[0]}",
                        int(p[5] or 0), int(p[6] or 0), str(p[7])))
    for rank, (s, w) in enumerate(scored[:12], 1):
        vocab_rows.append((p[0], w, float(s), rank))

con.execute("create schema if not exists game")
con.execute("create or replace table game.threads (thread_id varchar, submolt varchar, title varchar, author varchar, body varchar, url varchar, upvotes integer, comments integer, created_at varchar)")
con.executemany("insert into game.threads values (?,?,?,?,?,?,?,?,?)", thread_rows)
con.execute("create or replace table game.vocab (thread_id varchar, word varchar, tfidf_score double, rank integer)")
con.executemany("insert into game.vocab values (?,?,?,?)", vocab_rows)
con.close()
print(f"threads={len(thread_rows)} vocab_rows={len(vocab_rows)}")
