from stock_data import get_stock_signal
from news_data import get_news_signal
import json
from math import isfinite
from datetime import datetime
from pathlib import Path

SCORES_PATH = Path("scores.json")   # ⬅️ fixed
ERRORS_PATH = Path("errors.json")   # ⬅️ fixed

# Ensure files exist
SCORES_PATH.parent.mkdir(parents=True, exist_ok=True)
if not SCORES_PATH.exists():
    with open(SCORES_PATH, "w") as f:
        json.dump([], f)
if not ERRORS_PATH.exists():
    with open(ERRORS_PATH, "w") as f:
        json.dump([], f)

def get_timestamp():
    return datetime.utcnow().isoformat() + "Z"

def load_scores():
    with open(SCORES_PATH, "r") as f:
        return json.load(f)

def save_scores(scores):
    with open(SCORES_PATH, "w") as f:
        json.dump(scores, f, indent=2, allow_nan=False)

def append_error(error_type, details):
    entry = {
        "timestamp": get_timestamp(),
        "error_type": error_type,
        "details": details
    }
    with open(ERRORS_PATH, "r") as f:
        errors = json.load(f)
    errors.append(entry)
    with open(ERRORS_PATH, "w") as f:
        json.dump(errors, f, indent=2)

def calculate_moving_average(scores, window=3):
    recent = [s["raw_score"] for s in scores[-window:] if is_valid_number(s.get("raw_score"))]
    return round(sum(recent) / len(recent), 2) if recent else 0

def is_valid_number(value):
    return isinstance(value, (int, float)) and isfinite(value)

def clean_score(value, fallback=0.5):
    return value if is_valid_number(value) else fallback

def previous_score(scores, key, fallback=0.5):
    for score in reversed(scores):
        value = score.get(key)
        if is_valid_number(value):
            return value
    return fallback

def main():
    timestamp = get_timestamp()
    scores = load_scores()

    try:
        stock_score = get_stock_signal()
    except Exception as e:
        append_error("stock_fetch_failed", str(e))
        stock_score = previous_score(scores, "stock_score")
    stock_score = clean_score(stock_score, previous_score(scores, "stock_score"))

    try:
        news_score = get_news_signal()
    except Exception as e:
        append_error("news_fetch_failed", str(e))
        news_score = previous_score(scores, "news_score")
    news_score = clean_score(news_score, previous_score(scores, "news_score"))

    raw_score = round(min((0.8 * stock_score + 0.2 * news_score) * 100, 100), 2)

    scores.append({
        "timestamp": timestamp,
        "stock_score": round(stock_score, 3),
        "news_score": round(news_score, 3),
        "raw_score": raw_score
    })

    final_score = calculate_moving_average(scores)
    print(f"[{timestamp}] Final Score: {final_score}")
    print(f"Saved {len(scores)} score entries.")  # Debug print

    save_scores(scores)

if __name__ == "__main__":
    main()
