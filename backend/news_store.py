"""Small, diffable news archive. Labels stay in a separate local file."""

import hashlib
import json
import re
from datetime import datetime, timezone
from difflib import SequenceMatcher
from html import unescape
from html.parser import HTMLParser
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
ARTICLES_PATH = BACKEND_DIR / "data" / "articles.jsonl"
LABELS_PATH = BACKEND_DIR / "data" / "labels.json"
LABELS = ("background", "threats_buildup", "reported_fighting")
LABEL_NAMES = {
    "background": "Background / other",
    "threats_buildup": "Threats / buildup",
    "reported_fighting": "Reported fighting",
}


def utc_now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def parse_time(value):
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return result.astimezone(timezone.utc) if result.tzinfo else None
    except (ValueError, AttributeError, TypeError):
        return None


class TextParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)


def clean_text(value):
    parser = TextParser()
    parser.feed(str(value or ""))
    return re.sub(r"\s+", " ", unescape(" ".join(parser.parts))).strip()


def title_key(value):
    return re.sub(r"[^\w\s]", "", value.lower()).strip()


def model_parts(article):
    # The publisher is metadata, not a predictor.
    source = article.get("source", "")
    title = article["title"]
    if source and title.endswith(" - " + source):
        title = title[: -len(source) - 3]
    snippet = article.get("snippet", "")
    snippet = snippet.replace(article["title"], " ").replace(title, " ")
    if source:
        snippet = snippet.replace(source, " ")
    return title, re.sub(r"\s+", " ", snippet).strip()


def model_text(article):
    title, snippet = model_parts(article)
    return f"{title} {snippet}".strip()


def atomic_text(path, text):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(text, encoding="utf-8")
    temporary.replace(path)


def write_json(path, value):
    atomic_text(path, json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + "\n")


def read_articles(path=ARTICLES_PATH):
    path = Path(path)
    if not path.exists():
        return []
    rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    if len({row["id"] for row in rows}) != len(rows):
        raise ValueError("The news archive contains duplicate IDs.")
    return rows


def read_labels(path=LABELS_PATH):
    path = Path(path)
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def save_articles(rows, path=ARTICLES_PATH):
    atomic_text(path, "".join(json.dumps(row, ensure_ascii=False, allow_nan=False) + "\n" for row in rows))


def make_article(entry, query, now):
    title = clean_text(entry.get("title", ""))
    if not title:
        return None
    source_info = entry.get("source", {})
    source = clean_text(source_info.get("title", "")) if isinstance(source_info, dict) else ""
    if not source and " - " in title:
        source = title.rsplit(" - ", 1)[1]
    plain_title = title[: -len(source) - 3] if source and title.endswith(" - " + source) else title
    article_id = hashlib.sha256(title_key(plain_title).encode()).hexdigest()[:24]
    published = None
    parsed = entry.get("published_parsed") or entry.get("updated_parsed")
    if parsed:
        try:
            published = datetime(*parsed[:6], tzinfo=timezone.utc)
            if published > parse_time(now):
                published = None
        except (ValueError, TypeError):
            published = None
    return {
        "id": article_id,
        "title": title,
        "snippet": clean_text(entry.get("summary") or entry.get("description", "")),
        "url": entry.get("link", ""),
        "source": source,
        "queries": [query],
        "published_at": published.isoformat().replace("+00:00", "Z") if published else None,
        "first_seen_at": now,
        "story_group": article_id,
    }


def similar_story(left, right):
    # A conservative near-copy check, not an event detector.
    a = parse_time(left.get("published_at") or left["first_seen_at"])
    b = parse_time(right.get("published_at") or right["first_seen_at"])
    if not a or not b or abs((a - b).total_seconds()) > 3 * 86400:
        return False
    one = title_key(model_text({**left, "snippet": ""}))
    two = title_key(model_text({**right, "snippet": ""}))
    words_one, words_two = set(one.split()), set(two.split())
    union = words_one | words_two
    overlap = len(words_one & words_two) / len(union) if union else 0
    return overlap >= 0.65 or SequenceMatcher(None, one, two).ratio() >= 0.86


def merge_articles(existing, incoming):
    by_id = {row["id"]: row for row in existing}
    rows = list(existing)
    added = 0
    for item in incoming:
        if item["id"] in by_id:
            old = by_id[item["id"]]
            old["queries"] = sorted(set(old["queries"] + item["queries"]))
            continue
        matches = [row for row in rows if similar_story(row, item)]
        if matches:
            groups = {row["story_group"] for row in matches}
            group = min(groups)
            # Joining two clusters must update both, or copies could cross splits.
            for row in rows:
                if row["story_group"] in groups:
                    row["story_group"] = group
            item["story_group"] = group
        rows.append(item)
        by_id[item["id"]] = item
        added += 1
    return rows, added
