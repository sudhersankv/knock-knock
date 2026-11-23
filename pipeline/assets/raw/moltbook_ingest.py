""" @bruin
name: raw.moltbook_ingest
type: python
description: |
  Pulls the live Moltbook society from the public API (no key): submolts, hot + new posts per submolt,
  and comment trees for the most-discussed posts. Writes raw JSON snapshots to data/raw/ and loads
  them into raw.submolts / raw.posts / raw.comments in DuckDB. Never posts anything to Moltbook.
@bruin """
import sys, json, time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import requests
from kk_common import RAW, connect

API = "https://www.moltbook.com/api/v1"
S = requests.Session()
S.headers["User-Agent"] = "knockknock-hackathon-pipeline/0.1"

def get(path, **params):
    for attempt in range(3):
        try:
            r = S.get(f"{API}{path}", params=params, timeout=25)
            if r.status_code == 200:
                return r.json()
        except Exception as e:  # noqa
            pass
        time.sleep(1 + attempt)
    return {}

def flatten(comments, out, post_id):
    for c in comments or []:
        out.append({
            "comment_id": c.get("id"), "post_id": post_id, "parent_id": c.get("parent_id"),
            "author_id": c.get("author_id"), "author": (c.get("author") or {}).get("name"),
            "content": c.get("content") or "", "upvotes": c.get("upvotes") or 0, "downvotes": c.get("downvotes") or 0,
            "depth": c.get("depth") or 0, "reply_count": c.get("reply_count") or 0, "created_at": c.get("created_at"),
        })
        flatten(c.get("replies"), out, post_id)

def main():
    RAW.mkdir(parents=True, exist_ok=True)
    fetched_at = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
    subs = get("/submolts").get("submolts", [])
    subs = [s for s in subs if not s.get("is_nsfw") and not s.get("is_private")]
    subs.sort(key=lambda s: -(s.get("subscriber_count") or 0))
    subs = subs[:12]
    submolts = [{"name": s["name"], "display_name": s.get("display_name") or s["name"], "description": s.get("description") or "",
                 "subscriber_count": s.get("subscriber_count") or 0, "post_count": s.get("post_count") or 0} for s in subs]

    posts = {}
    def add(p):
        if not p or p.get("is_deleted") or p.get("is_spam"):
            return
        sm = p.get("submolt") or {}
        posts[p["id"]] = {
            "post_id": p["id"], "submolt": sm.get("name"), "author_id": p.get("author_id"),
            "author": (p.get("author") or {}).get("name"), "title": p.get("title") or "", "content": p.get("content") or "",
            "upvotes": p.get("upvotes") or 0, "downvotes": p.get("downvotes") or 0, "comment_count": p.get("comment_count") or 0,
            "created_at": p.get("created_at"), "fetched_at": fetched_at,
        }
    jobs = [("hot", None), ("new", None)] + [(sort, s["name"]) for s in subs for sort in ("hot", "new")]
    def fetch(job):
        sort, sm = job
        params = {"sort": sort, "limit": 25}
        if sm: params["submolt"] = sm
        return get("/posts", **params).get("posts", [])
    with ThreadPoolExecutor(4) as ex:
        for batch in ex.map(fetch, jobs):
            for p in batch: add(p)

    # List endpoints truncate content; fetch full bodies for the posts most likely to be used in-game.
    full = sorted(posts.values(), key=lambda p: -(p["comment_count"] * 2 + p["upvotes"]))[:140]
    def fetch_full(p):
        return p["post_id"], (get(f"/posts/{p['post_id']}").get("post") or {}).get("content")
    with ThreadPoolExecutor(6) as ex:
        for pid, content in ex.map(fetch_full, full):
            if content:
                posts[pid]["content"] = content

    # Comments for the most discussed posts (debate candidates)
    top = sorted(posts.values(), key=lambda p: -p["comment_count"])[:45]
    comments = []
    def fetch_c(p):
        d = get(f"/posts/{p['post_id']}/comments", sort="top")
        out = []
        flatten(d.get("comments"), out, p["post_id"])
        return out
    with ThreadPoolExecutor(4) as ex:
        for out in ex.map(fetch_c, top):
            comments.extend(out)

    if len(posts) < 20:
        raise SystemExit(f"Moltbook ingest too small: {len(posts)} posts")
    for name, rows in (("submolts", submolts), ("posts", list(posts.values())), ("comments", comments)):
        (RAW / f"{name}.json").write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")

    con = connect()
    con.execute("create schema if not exists raw")
    for name in ("submolts", "posts", "comments"):
        path = str(RAW / f"{name}.json").replace("\\", "/")
        con.execute(f"create or replace table raw.{name} as select * from read_json_auto('{path}', maximum_object_size=67108864)")
    con.close()
    print(f"ingested submolts={len(submolts)} posts={len(posts)} comments={len(comments)}")

main()
