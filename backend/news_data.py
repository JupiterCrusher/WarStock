import feedparser
import requests
from pathlib import Path

FEED_URLS = [
    "https://feeds.reuters.com/reuters/worldNews",
    "https://rss.cnn.com/rss/edition_world.rss",
]

# Local fallback feed used when online requests fail. This allows the news
# scoring logic to still function in network restricted environments.
FALLBACK_FEED = Path(__file__).with_name("sample_news.xml")

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
    score = 0
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
                summary = entry.get("description", "") if hasattr(entry, "get") else getattr(entry, "description", "")

            # Log raw headline for debugging
            print(f"Title: {title} | Summary: {summary}")

            text = f"{title} {summary}".lower()
            score += sum(1 for word in BASE_KEYWORDS if word.lower() in text)
            score += sum(2 for word in HIGH_KEYWORDS if word.lower() in text)

    # If no online feeds could be fetched and a fallback file exists, parse it
    # so the function can still return a non-zero score during offline usage.
    if score == 0 and not fetched_any and FALLBACK_FEED.exists():
        print(f"Using fallback feed: {FALLBACK_FEED}")
        feed = feedparser.parse(FALLBACK_FEED.read_bytes())
        for entry in feed.entries:
            text = f"{entry.get('title', '')} {entry.get('description', '')}".lower()
            score += sum(1 for word in BASE_KEYWORDS if word.lower() in text)
            score += sum(2 for word in HIGH_KEYWORDS if word.lower() in text)

    final = min(score / 10, 1.0)
    print(f"News score: {final}")
    return final
