import feedparser

FEED_URLS = [
    "http://feeds.reuters.com/reuters/worldNews",
    "http://rss.cnn.com/rss/edition_world.rss"
]

BASE_KEYWORDS = [
    "missile", "military exercise", "border clash", "airstrike",
    "defense system", "warships", "drone strike", "troop movement",
    "airspace violation", "combat drills", "mobilization",
    "iran", "strike", "attack", "conflict", "hezbollah",
    "idf", "nato", "russia", "usa", "israel", "drone",
    "shelling", "airspace", "tensions"
]

HIGH_KEYWORDS = [
    "nuclear", "invasion", "chemical weapon", "intercontinental missile", "world war"
]

def get_news_signal():
    score = 0
    for url in FEED_URLS:
        feed = feedparser.parse(url)
        for entry in feed.entries:
            title = entry.get("title", "") if hasattr(entry, "get") else getattr(entry, "title", "")
            summary = entry.get("summary", "") if hasattr(entry, "get") else getattr(entry, "summary", "")

            # Log raw headline for debugging
            print(f"Title: {title} | Summary: {summary}")

            text = f"{title} {summary}".lower()
            score += sum(1 for word in BASE_KEYWORDS if word.lower() in text)
            score += sum(2 for word in HIGH_KEYWORDS if word.lower() in text)

    return min(score / 10, 1.0)