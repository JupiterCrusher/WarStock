import feedparser
import requests

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
        final = 0
    else:
        avg_hits = total_hits / entry_count
        final = min(avg_hits / 5, 1.0)

    print(f"News score: {final}")
    return final
