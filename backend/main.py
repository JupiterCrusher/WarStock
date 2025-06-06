from stock_data import get_stock_signal
from news_data import get_news_signal
import json
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
        json.dump(scores, f, indent=2)

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
    recent = [s["raw_score"] for s in scores[-window:] if "raw_score" in s]
    return round(sum(recent) / len(recent), 2) if recent else 0

def main():
    timestamp = get_timestamp()
    scores = load_scores()

    try:
        stock_score = get_stock_signal()
    except Exception as e:
        append_error("stock_fetch_failed", str(e))
        stock_score = scores[-1]["stock_score"] if scores else 0.5

    try:
        news_score = get_news_signal()
    except Exception as e:
        append_error("news_fetch_failed", str(e))
        news_score = scores[-1]["news_score"] if scores else 0.5

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