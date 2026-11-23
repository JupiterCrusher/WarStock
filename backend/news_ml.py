"""Train offline; publish only a model that passed its held-out checks."""

import csv
import hashlib
import json
import shutil
from collections import Counter, defaultdict
from datetime import timedelta
from itertools import product
from pathlib import Path

from news_store import (
    BACKEND_DIR, LABELS, LABEL_NAMES, model_text, parse_time,
    read_articles, read_labels, utc_now, write_json,
)

RUNS_DIR = BACKEND_DIR.parent / ".ml" / "runs"
MODEL_DIR = BACKEND_DIR / "models"
NEWS_PATH = BACKEND_DIR / "news.json"
GUIDE_VERSION = "1"
FIXED_SETTINGS = (1.0, "balanced")


def labeled_records(articles, labels):
    records = []
    for article in articles:
        entry = labels.get(article["id"], {})
        label = entry.get("label")
        if label not in LABELS:
            continue
        if entry.get("guide_version") != GUIDE_VERSION:
            raise ValueError("Some labels use an old label guide; review them before training.")
        if not parse_time(article["first_seen_at"]):
            raise ValueError(f"Invalid first-seen time for {article['id']}")
        records.append({
            "id": article["id"], "text": model_text(article), "label": label,
            "story_group": article["story_group"], "first_seen_at": article["first_seen_at"],
        })
    return sorted(records, key=lambda row: (row["first_seen_at"], row["id"]))


def fingerprint(records):
    return hashlib.sha256(json.dumps(records, sort_keys=True).encode()).hexdigest()


def split_records(records, *, fixed=False):
    """Split by collection date; purge near-copy groups that cross a boundary."""
    dates = sorted({row["first_seen_at"][:10] for row in records})
    if fixed:
        if len(dates) < 2:
            raise ValueError("Need labeled news from at least 2 collection dates for a fixed-model test.")
        date_sets = {"train": set(dates[:-1]), "test": {dates[-1]}}
    else:
        if len(dates) < 3:
            raise ValueError("Need labeled news from at least 3 collection dates for a time-based test. Keep collecting and labeling.")
        train_end = min(max(1, int(len(dates) * 0.70)), len(dates) - 2)
        valid_end = min(max(train_end + 1, int(len(dates) * 0.85)), len(dates) - 1)
        date_sets = {
            "train": set(dates[:train_end]),
            "validation": set(dates[train_end:valid_end]),
            "test": set(dates[valid_end:]),
        }
    buckets = {name: [row for row in records if row["first_seen_at"][:10] in days] for name, days in date_sets.items()}
    locations = defaultdict(set)
    for name, bucket in buckets.items():
        for row in bucket:
            locations[row["story_group"]].add(name)
    excluded = {group for group, names in locations.items() if len(names) > 1}
    split = {name: [row for row in bucket if row["story_group"] not in excluded] for name, bucket in buckets.items()}
    for name, bucket in split.items():
        minimum = 20 if name == "train" else 5
        counts = Counter(row["label"] for row in bucket)
        missing = [f"{LABEL_NAMES[label]} ({counts[label]}/{minimum})" for label in LABELS if counts[label] < minimum]
        if missing:
            raise ValueError(f"Need more labels in {name}: {', '.join(missing)}. Dates and story copies stay separate.")
    return split, len(records) - sum(len(bucket) for bucket in split.values())


def keyword_predict(text):
    # Fix these rules before test evaluation; labels never come from this baseline.
    text = text.lower()
    if any(word in text for word in ("airstrike", "air strike", "shelling", "bombing", "border clash", "missile strike", "drone strike", "killed", "attacked", "fighting")):
        return "reported_fighting"
    if any(word in text for word in ("threat", "warning", "troop", "mobilization", "military exercise", "combat drills", "buildup", "build-up")):
        return "threats_buildup"
    return "background"


def metrics(truth, predictions):
    from sklearn.metrics import classification_report, confusion_matrix, f1_score
    return {
        "macro_f1": f1_score(truth, predictions, labels=LABELS, average="macro", zero_division=0),
        "classes": classification_report(truth, predictions, labels=LABELS, output_dict=True, zero_division=0),
        "confusion_matrix": confusion_matrix(truth, predictions, labels=LABELS).tolist(),
        "label_order": list(LABELS),
    }


def make_pipeline(strength, weights):
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import Pipeline

    return Pipeline([
        ("tfidf", TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, max_features=30000)),
        ("classifier", LogisticRegression(C=strength, class_weight=weights, max_iter=1000, random_state=42)),
    ])


def train(articles_path, labels_path, runs_dir=RUNS_DIR, *, fixed=False):
    import joblib
    import sklearn

    records = labeled_records(read_articles(articles_path), read_labels(labels_path))
    if not records:
        raise ValueError("No training labels yet. Label the first headlines in the local label page.")
    data_hash = fingerprint(records)
    runs_dir = Path(runs_dir)
    if (runs_dir.parent / "tested" / f"{data_hash}.json").exists():
        raise ValueError("This dataset's final test has already been used. Collect new news for a new test before tuning again.")
    split, excluded = split_records(records, fixed=fixed)
    x_train = [row["text"] for row in split["train"]]
    y_train = [row["label"] for row in split["train"]]
    x_valid = [row["text"] for row in split.get("validation", [])]
    y_valid = [row["label"] for row in split.get("validation", [])]
    trials = []
    best = None
    options = (FIXED_SETTINGS,) if fixed else product((0.25, 1.0, 4.0), (None, "balanced"))
    for strength, weights in options:
        pipeline = make_pipeline(strength, weights).fit(x_train, y_train)
        settings = {"C": strength, "class_weight": weights}
        if fixed:
            best = (settings, pipeline, None)
            break
        report = metrics(y_valid, pipeline.predict(x_valid))
        settings["macro_f1"] = report["macro_f1"]
        trials.append(settings)
        if best is None or report["macro_f1"] > best[0]["macro_f1"]:
            best = (settings, pipeline, report)
    settings, pipeline, validation = best
    run_id = utc_now().replace(":", "").replace(".", "-")
    run_dir = runs_dir / run_id
    run_dir.mkdir(parents=True, exist_ok=False)
    joblib.dump(pipeline, run_dir / "model.joblib")
    write_json(run_dir / "dataset.json", split)
    metadata = {
        "version": run_id, "created_at": utc_now(), "guide_version": GUIDE_VERSION,
        "dataset_hash": data_hash, "sklearn_version": sklearn.__version__,
        "seed": 42, "settings": settings, "trials": trials,
        "training_mode": "fixed" if fixed else "tuned",
        "validation": validation, "excluded_near_copies": excluded,
        "split_counts": {name: dict(Counter(row["label"] for row in rows)) for name, rows in split.items()},
        "split_dates": {name: [min(row["first_seen_at"] for row in rows), max(row["first_seen_at"] for row in rows)] for name, rows in split.items()},
        "test_used": False,
        "model_sha256": hashlib.sha256((run_dir / "model.joblib").read_bytes()).hexdigest(),
        "split_sha256": hashlib.sha256((run_dir / "dataset.json").read_bytes()).hexdigest(),
    }
    write_json(run_dir / "metadata.json", metadata)
    # A compact list of learned terms makes the first model easy to inspect.
    terms = pipeline["tfidf"].get_feature_names_out()
    classifier = pipeline["classifier"]
    write_json(run_dir / "top_terms.json", {
        label: [str(terms[index]) for index in coef.argsort()[-15:][::-1]]
        for label, coef in zip(classifier.classes_, classifier.coef_)
    })
    return run_dir, metadata


def load_pipeline(directory, filename="model.joblib"):
    # Only load artifacts we trained locally or deliberately committed to this repo.
    import joblib
    import sklearn
    directory = Path(directory)
    metadata = json.loads((directory / "metadata.json").read_text(encoding="utf-8"))
    if metadata["sklearn_version"] != sklearn.__version__:
        raise ValueError("Model and installed scikit-learn versions differ; use the training environment.")
    if hashlib.sha256((directory / filename).read_bytes()).hexdigest() != metadata["model_sha256"]:
        raise ValueError("Model file does not match its recorded hash.")
    return joblib.load(directory / filename), metadata


def evaluate(run_dir):
    run_dir = Path(run_dir)
    pipeline, metadata = load_pipeline(run_dir)
    if metadata.get("kind") == "pilot":
        raise ValueError("A pilot has no dated final test. Use pilot_report.json; collect later news for the final workflow.")
    lock = run_dir.parent.parent / "tested" / f"{metadata['dataset_hash']}.json"
    if lock.exists() or metadata.get("test_used"):
        raise ValueError("This final test has already been used. Read test_report.json; do not tune against it.")
    split = json.loads((run_dir / "dataset.json").read_text(encoding="utf-8"))
    if hashlib.sha256((run_dir / "dataset.json").read_bytes()).hexdigest() != metadata["split_sha256"]:
        raise ValueError("The saved split was edited after training. Use the original snapshot.")
    if not split["test"] or set(row["label"] for row in split["test"]) != set(LABELS):
        raise ValueError("Test snapshot is incomplete.")
    test = split["test"]
    truth = [row["label"] for row in test]
    x_test = [row["text"] for row in test]
    predicted = pipeline.predict(x_test).tolist()
    majority = Counter(row["label"] for row in split["train"]).most_common(1)[0][0]
    reports = {
        "model": metrics(truth, predicted),
        "majority": metrics(truth, [majority] * len(test)),
        "keywords": metrics(truth, [keyword_predict(text) for text in x_test]),
    }
    passed = (
        reports["model"]["macro_f1"] > max(reports["majority"]["macro_f1"], reports["keywords"]["macro_f1"])
        and reports["model"]["classes"]["reported_fighting"]["recall"] >= 0.70
    )
    report = {
        "evaluated_at": utc_now(), "reports": reports, "activation_check_passed": passed,
        "activation_rule": "Macro F1 beats both baselines and reported-fighting recall >= 0.70; experimental, not proof of broad reliability.",
        "mistakes": [{**row, "predicted": pred} for row, pred in zip(test, predicted) if row["label"] != pred],
    }
    write_json(lock, {"run": str(run_dir), "evaluated_at": report["evaluated_at"]})
    write_json(run_dir / "test_report.json", report)
    metadata["test_used"] = True
    write_json(run_dir / "metadata.json", metadata)
    return report


def activate(run_dir, model_dir=MODEL_DIR):
    run_dir, model_dir = Path(run_dir), Path(model_dir)
    _, metadata = load_pipeline(run_dir)
    if metadata.get("kind") == "pilot":
        raise ValueError("A pilot cannot be activated. Train and test with news from later dates first.")
    report = json.loads((run_dir / "test_report.json").read_text(encoding="utf-8"))
    if not metadata.get("test_used") or not report["activation_check_passed"]:
        raise ValueError("This model did not pass the held-out activation check. Keep it offline and collect more news.")
    model_dir.mkdir(parents=True, exist_ok=True)
    # Keep training text and personal label notes out of the public model metadata.
    public_metadata = {key: metadata[key] for key in (
        "version", "created_at", "guide_version", "sklearn_version", "model_sha256", "settings", "split_counts", "split_dates",
    )}
    public_metadata["test"] = report["reports"]
    public_metadata["training_mode"] = metadata.get("training_mode", "tuned")
    public_metadata["experimental"] = True
    public_metadata["activation_check_passed"] = True
    temporary = model_dir / "news.joblib.tmp"
    shutil.copyfile(run_dir / "model.joblib", temporary)
    temporary.replace(model_dir / "news.joblib")
    write_json(model_dir / "metadata.json", public_metadata)
    return public_metadata


def write_news_snapshot(collection, model_dir=MODEL_DIR, output=NEWS_PATH):
    now = parse_time(collection["timestamp"])
    fresh = []
    seen_groups = set()
    for row in sorted(collection["articles"], key=lambda item: item.get("published_at") or item["first_seen_at"], reverse=True):
        date = parse_time(row.get("published_at") or row["first_seen_at"])
        if date and now - timedelta(hours=24) <= date <= now and row["story_group"] not in seen_groups:
            seen_groups.add(row["story_group"])
            fresh.append(row)
    snapshot = {
        "timestamp": collection["timestamp"], "feed_status": collection["status"],
        "feeds": collection["feeds"], "archive_count": collection["total"],
        "window_hours": 24, "story_count": len(fresh), "model_state": "awaiting_training",
        "model_version": None, "class_counts": {}, "class_shares": {}, "articles": [],
    }
    predictions = [None] * len(fresh)
    if (Path(model_dir) / "news.joblib").exists():
        try:
            pipeline, metadata = load_pipeline(model_dir, "news.joblib")
            if not metadata.get("activation_check_passed"):
                raise ValueError("Model has not passed its activation check")
            predictions = pipeline.predict([model_text(row) for row in fresh]).tolist() if fresh else []
            snapshot["model_state"] = "active"
            snapshot["model_version"] = metadata["version"]
            snapshot["test_macro_f1"] = metadata["test"]["model"]["macro_f1"]
            counts = Counter(predictions)
            snapshot["class_counts"] = {label: counts[label] for label in LABELS}
            snapshot["class_shares"] = {label: round(counts[label] / len(fresh), 4) if fresh else None for label in LABELS}
        except Exception as exc:
            snapshot["model_state"] = "error"
            snapshot["model_error"] = str(exc)
    snapshot["articles"] = [
        {"id": row["id"], "title": row["title"], "source": row["source"], "url": row["url"],
         "published_at": row.get("published_at"), "label": label}
        for row, label in list(zip(fresh, predictions))[:30]
    ]
    write_json(output, snapshot)
    return snapshot


def export_labels(articles_path, labels_path, output, limit=None):
    output = Path(output)
    if output.exists():
        raise ValueError(f"Refusing to overwrite {output}. Choose a new file name.")
    rows = read_articles(articles_path)
    labels = read_labels(labels_path)
    if limit:
        rows = rows[:limit]
    output.parent.mkdir(parents=True, exist_ok=True)
    fields = ("id", "title", "snippet", "source", "published_at", "first_seen_at", "story_group", "label", "notes")
    with output.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            item = {field: row.get(field, "") for field in fields}
            item.update({key: labels.get(row["id"], {}).get(key, "") for key in ("label", "notes")})
            # Spreadsheet apps can treat external headlines as formulas.
            writer.writerow({key: "'" + value if isinstance(value, str) and value.startswith(("=", "+", "-", "@")) else value for key, value in item.items()})
    return len(rows)
