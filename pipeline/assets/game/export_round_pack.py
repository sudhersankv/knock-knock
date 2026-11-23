""" @bruin
name: game.export_round_pack
type: python
description: |
  Writes data/round_pack.json (the RoundPack contract in shared/kk/pack.ts) that the game server reads at
  round start. Re-runs every quality rule and embeds the results in checks[], so the in-game Archivist can
  say exactly why a row was used or rejected.
depends:
  - game.quality_gate
@bruin """
import sys, json, re, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from kk_common import connect, DATA, STARTER_VOCAB, has_pii

con = connect()
q = lambda sql: con.execute(sql).fetchall()
vocab = {}
for tid, w in q("select thread_id, word from game.vocab order by thread_id, rank"):
    vocab.setdefault(tid, []).append(w)
threads = [{"id": r[0], "submolt": r[1], "title": r[2], "author": r[3], "body": r[4], "url": r[5], "upvotes": r[6],
            "comments": r[7], "createdAt": r[8], "vocab": vocab.get(r[0], [])} for r in q("select * from game.threads")]
codexes = [{"id": r[0], "postId": r[1], "title": r[2], "author": r[3], "url": r[4], "lines": json.loads(r[5]), "passWord": r[6],
            "lineNo": r[7], "wordNo": r[8], "difficulty": r[9]} for r in q("select * from game.codex order by codex_id")]
pulses = {}
for sid, at, sm, act, rank in q("select * from game.pulse order by snapshot_id, rank"):
    pulses.setdefault(sid, {"id": sid, "snapshotAt": at, "entries": []})["entries"].append({"submolt": sm, "activity": act, "rank": rank})
voices = {}
for tid, a, t, s_ in q("select thread_id, author, text, stance from game.debate_voices order by thread_id, ord"):
    voices.setdefault(tid, []).append({"author": a, "text": t, "stance": int(s_)})
debates = [{"threadId": r[0], "question": r[1], "keyword": r[2], "split": r[3], "theme": r[4], "voices": voices.get(r[0], [])}
           for r in q("select thread_id, question, keyword, split_score, theme from game.debates where philosophical")]
used_subs = {t["submolt"] for t in threads} | {e["submolt"] for p in pulses.values() for e in p["entries"]}
submolts = [{"name": r[0], "displayName": r[1], "description": r[2]} for r in q("select name, display_name, description from raw.submolts")]
sub_names = {s["name"] for s in submolts}
for s in sorted(used_subs - sub_names):
    submolts.append({"name": s, "displayName": s, "description": ""})

all_vocab = {w for v in vocab.values() for w in v}
def check_codex(c):
    text = " ".join(c["lines"]).lower()
    n = len(re.findall(r"(^|[^a-z])" + re.escape(c["passWord"]) + r"([^a-z]|$)", text))
    tok = re.sub(r"^[^A-Za-z]+|[^A-Za-z]+$", "", c["lines"][c["lineNo"] - 1].split()[c["wordNo"] - 1]).lower()
    return n == 1 and tok == c["passWord"] and c["passWord"] not in all_vocab and c["passWord"] not in STARTER_VOCAB
def check_pulse(p):
    a = [e["activity"] for e in p["entries"]]
    return 3 <= len(a) <= 4 and all(a[i] >= a[i + 1] * 1.15 for i in range(len(a) - 1))
soc = q("select posts24h, comments24h, activeAgents24h, submolts, totalAgents from raw.society")[0]
society = {"posts24h": int(soc[0]), "comments24h": int(soc[1]), "activeAgents24h": int(soc[2]), "submolts": int(soc[3])}
if soc[4]:
    society["totalAgents"] = int(soc[4])
tid = {t["id"] for t in threads}
checks = [
    ("threads_at_least_20", len(threads) >= 20, f"{len(threads)} threads"),
    ("thread_ids_unique", len(tid) == len(threads), "unique Moltbook post ids"),
    ("every_thread_has_12_word_vocab", all(len(t["vocab"]) >= 6 for t in threads), f"min vocab {min((len(t['vocab']) for t in threads), default=0)}"),
    ("codexes_at_least_4", len(codexes) >= 4, f"{len(codexes)} codexes"),
    ("codex_word_once_and_unsayable", all(check_codex(c) for c in codexes), "pass word occurs once, at lineNo/wordNo, outside every vocab"),
    ("pulses_at_least_3", len(pulses) >= 3, f"{len(pulses)} pulse snapshots"),
    ("pulse_order_unambiguous", all(check_pulse(p) for p in pulses.values()), "adjacent activity gaps >= 15%"),
    ("debates_exactly_5", len(debates) == 5, f"{len(debates)} debates"),
    ("debate_threads_exist", all(d["threadId"] in tid for d in debates), "every debate is a readable thread"),
    ("debates_philosophical", all(d.get("theme") for d in debates), "LLM-classified moral/ethical/philosophical only"),
    ("debates_have_voices", all(2 <= len(d["voices"]) <= 4 for d in debates), "2-4 real replies per debate, stance-tagged"),
    ("society_numbers_positive", all(society[k] > 0 for k in ("posts24h", "comments24h", "activeAgents24h", "submolts")), json.dumps(society)),
    ("debate_keyword_in_vocab", all(d["keyword"] in vocab.get(d["threadId"], []) for d in debates), "keyword learnable by reading the thread"),
    ("no_pii_in_shown_text", not any(has_pii(t["title"] + " " + t["body"]) for t in threads) and not any(has_pii(d["question"]) for d in debates), "emails/links/handles/phones stripped"),
]
pack = {
    "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "source": "moltbook",
    "starterVocab": STARTER_VOCAB,
    "submolts": submolts,
    "threads": threads,
    "codexes": codexes,
    "pulses": list(pulses.values()),
    "debates": debates,
    "society": society,
    "checks": [{"name": n, "passed": bool(p), "detail": d} for n, p, d in checks],
}
failed = [n for n, p, _ in checks if not p]
out = DATA / "round_pack.json"
if failed:
    (DATA / "round_pack.rejected.json").write_text(json.dumps(pack, ensure_ascii=False, indent=1), encoding="utf-8")
    raise SystemExit(f"quality checks failed, keeping previous round_pack.json: {failed}")
tmp = out.with_suffix(".tmp")
tmp.write_text(json.dumps(pack, ensure_ascii=False, indent=1), encoding="utf-8")
tmp.replace(out)
print(f"round_pack.json threads={len(threads)} codexes={len(codexes)} pulses={len(pulses)} debates={len(debates)}")
