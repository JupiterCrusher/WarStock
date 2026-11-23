import feedparser
import requests
from news_store import make_article, merge_articles, read_articles, save_articles, utc_now

FEED_URLS = [
    "https://news.google.com/rss/search?q=military+conflict&hl=en-US&gl=US&ceid=US:en",
    "https://news.google.com/rss/search?q=defense+systems&hl=en-US&gl=US&ceid=US:en",
    "https://news.google.com/rss/search?q=drone+strike&hl=en-US&gl=US&ceid=US:en",
]

HEADERS = {
    "User-Agent": "WarStockBot/1.0 (+https://github.com/JupiterCrusher/WarStock)"
}

BASE_KEYWORDS = [
    "missile", "military exercise", "border clash", "airstrike",
    "defense system", "warships", "drone strike", "troop movement",
    "airspace violation", "combat drills", "mobilization",
    "iran", "strike", "attack", "conflict", "hezbollah",
    "idf", "nato", "russia", "usa", "israel", "drone",
    "shelling", "airspace", "tensions",
    "ukraine", "gaza", "hamas", "palestine", "houthi",
    "taiwan", "korea", "air raid", "bombing", "cyber attack"
]

HIGH_KEYWORDS = [
    "nuclear", "invasion", "chemical weapon", "intercontinental missile", "world war",
    "ballistic missile", "terrorist attack", "full-scale war"
]

def fetch_feed(url: str):
    """Fetch RSS/Atom feed content with a custom user agent."""
    resp = requests.get(url, headers=HEADERS, timeout=10)
    resp.raise_for_status()
    return feedparser.parse(resp.content)


def collect_news(path=None):
    """Fetch once, archive unique text, and report partial or total outages."""
    now = utc_now()
    articles = []
    feeds = []
    for url in FEED_URLS:
        try:
            feed = fetch_feed(url)
            if not feed.entries:
                raise ValueError("Feed returned no items")
            items = [make_article(entry, url, now) for entry in feed.entries]
            items = [item for item in items if item]
            if not items:
                raise ValueError("Feed returned no usable headlines")
            articles.extend(items)
            feeds.append({"query": url, "ok": True, "items": len(items)})
        except Exception as exc:
            feeds.append({"query": url, "ok": False, "error": str(exc)})
    existing = read_articles() if path is None else read_articles(path)
    merged, added = merge_articles(existing, articles)
    if articles:
        if path is None:
            save_articles(merged)
        else:
            save_articles(merged, path)
    current_ids = {item["id"] for item in articles}
    return {
        "timestamp": now,
        "status": "ok" if all(feed["ok"] for feed in feeds) else "partial" if articles else "unavailable",
        "feeds": feeds,
        "added": added,
        "total": len(merged),
        "articles": [row for row in merged if row["id"] in current_ids],
    }


def score_articles(articles):
    if not articles:
        raise ValueError("No news available; a missing feed is not a zero news signal")
    hits = []
    for article in articles:
        text = f"{article['title']} {article.get('snippet', '')}".lower()
        hits.append(sum(word in text for word in BASE_KEYWORDS) + sum(2 for word in HIGH_KEYWORDS if word in text))
    return min(sum(hits) / len(hits) / 5, 1.0)


def get_news_signal():
    total_hits = 0
    entry_count = 0
    fetched_any = False
    for url in FEED_URLS:
        try:
            feed = fetch_feed(url)
        except Exception as exc:
            print(f"Failed to fetch {url}: {exc}")
            continue

        if not feed.entries:
            print(f"No entries retrieved from {url}")
            continue

        fetched_any = True
        for entry in feed.entries:
            title = entry.get("title", "") if hasattr(entry, "get") else getattr(entry, "title", "")
            summary = (
                entry.get("summary")
                if hasattr(entry, "get")
                else getattr(entry, "summary", "")
            )
            if not summary:
                summary = (
                    entry.get("description", "")
                    if hasattr(entry, "get")
                    else getattr(entry, "description", "")
                )

            text = f"{title} {summary}".lower()
            hits = sum(1 for word in BASE_KEYWORDS if word.lower() in text)
            hits += sum(2 for word in HIGH_KEYWORDS if word.lower() in text)
            total_hits += hits
            entry_count += 1

    if not fetched_any or entry_count == 0:
        raise ValueError("All news feeds failed or returned no items")
    else:
        avg_hits = total_hits / entry_count
        final = min(avg_hits / 5, 1.0)

    print(f"News score: {final}")
    return final
