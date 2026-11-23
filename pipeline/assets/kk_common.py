"""Shared helpers for Knock Knock Bruin python assets."""
import os, re, json
from pathlib import Path

ROOT = Path(os.environ.get("KK_ROOT") or Path(__file__).resolve().parents[2])
DATA = ROOT / "data"
RAW = DATA / "raw"
DB = DATA / "knockknock.duckdb"

STARTER_VOCAB = [
  'yes', 'no', 'left', 'right', 'up', 'down', 'door', 'help', 'line', 'word', 'first', 'second', 'third', 'last',
  'top', 'bottom', 'same', 'not', 'and', 'then', 'red', 'blue', 'big', 'small', 'more', 'less', 'wait', 'go', 'stop',
  'rune', 'lock', 'number', 'order', 'strong', 'weak', 'agree', 'maybe', 'one', 'two', 'three', 'four', 'five',
  'six', 'seven', 'eight', 'nine', 'ten',
]

STOPWORDS = set("""a about above after again against all also am an and any are aren't as at be because been before being
below between both but by can can't cannot could couldn't did didn't do does doesn't doing don't down during each few for
from further had hadn't has hasn't have haven't having he he'd he'll he's her here here's hers herself him himself his how
how's i i'd i'll i'm i've if in into is isn't it it's its itself let's me more most mustn't my myself no nor not of off on
once only or other ought our ours ourselves out over own same shan't she she'd she'll she's should shouldn't so some such
than that that's the their theirs them themselves then there there's these they they'd they'll they're they've this those
through to too under until up very was wasn't we we'd we'll we're we've were weren't what what's when when's where where's
which while who who's whom why why's with won't would wouldn't you you'd you'll you're you've your yours yourself
yourselves just like really also even still much many every something anything nothing thing things because into onto
will would should could might must shall them they this that these those than then there here what when where which while
make made makes making take took takes get gets got getting know knows knew think thinks thought want wants wanted need
needs going doing done said says say well back way ways time times post posts comment comments reply replies agent agents
human humans moltbook today yesterday tomorrow actually maybe always never sometimes often another other others around
being doesn didn isn wasn aren don weren hasn haven hadn won wouldn shouldn couldn mustn without within across along among
""".split())

EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
URL = re.compile(r"(https?://\S+|www\.\S+|\b[\w-]+\.(com|net|org|io|ai|dev|xyz|co|app)\b\S*)", re.I)
PHONE = re.compile(r"(\+?\d[\d\s().-]{7,}\d)")
HANDLE = re.compile(r"(?<!\w)@[A-Za-z0-9_]{2,}")
LONGHEX = re.compile(r"\b(0x)?[0-9a-fA-F]{24,}\b")

def strip_pii(text: str) -> str:
    text = EMAIL.sub("[email]", text)
    text = URL.sub("[link]", text)
    text = PHONE.sub("[number]", text)
    text = HANDLE.sub("[handle]", text)
    text = LONGHEX.sub("[hash]", text)
    return text

def has_pii(text: str) -> bool:
    return bool(EMAIL.search(text) or URL.search(text) or HANDLE.search(text) or PHONE.search(text))

MD = [(re.compile(r"```.*?```", re.S), " "), (re.compile(r"`([^`]*)`"), r"\1"), (re.compile(r"!\[[^\]]*\]\([^)]*\)"), " "),
      (re.compile(r"\[([^\]]*)\]\([^)]*\)"), r"\1"), (re.compile(r"^#{1,6}\s*", re.M), ""), (re.compile(r"[*_~>|]+"), " ")]

def clean_text(text: str) -> str:
    text = text or ""
    for rx, rep in MD:
        text = rx.sub(rep, text)
    text = strip_pii(text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()

WORD = re.compile(r"[a-z][a-z'-]*[a-z]|[a-z]")
def words(text: str):
    return WORD.findall((text or "").lower())

def connect():
    import duckdb
    return duckdb.connect(str(DB))

def load_env():
    env = {}
    p = ROOT / ".env"
    if p.exists():
        for line in p.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    env.update({k: v for k, v in os.environ.items() if k.startswith("LLM_")})
    return env
