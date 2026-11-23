"""A first experiment, separate from the dated final test and live model."""

import hashlib
import json
from collections import Counter
from pathlib import Path

from news_ml import FIXED_SETTINGS, GUIDE_VERSION, RUNS_DIR, fingerprint, keyword_predict, labeled_records, make_pipeline, metrics
from news_store import LABELS, read_articles, read_labels, utc_now, write_json


def apply_groups(records, groups_path=None):
    if groups_path is None:
        return records, {"basis": "Archive near-copy title groups; related events may still cross folds."}
    audit = json.loads(Path(groups_path).read_text(encoding="utf-8"))
    overrides = audit["overrides"]
    if not isinstance(overrides, dict) or set(overrides) - {row["id"] for row in records}:
        raise ValueError("Pilot groups must refer only to currently labeled articles.")
    original_groups = {}
    for row in records:
        if row["id"] in overrides:
            target = overrides[row["id"]]
            if not isinstance(target, str) or not target.strip():
                raise ValueError("Each pilot group needs a nonempty name.")
            previous = original_groups.setdefault(row["story_group"], target)
            if previous != target:
                raise ValueError("An existing copy group cannot be split into different pilot groups.")
    records = [{**row, "story_group": original_groups.get(row["story_group"], row["story_group"])} for row in records]
    return records, audit


def run_pilot(articles_path, labels_path, groups_path=None, output_root=None):
    import joblib
    import numpy as np
    import sklearn
    from sklearn.base import clone
    from sklearn.model_selection import StratifiedGroupKFold

    records = labeled_records(read_articles(articles_path), read_labels(labels_path))
    records, audit = apply_groups(records, groups_path)
    groups_per_class = {label: len({row["story_group"] for row in records if row["label"] == label}) for label in LABELS}
    if any(count < 5 for count in groups_per_class.values()):
        raise ValueError(f"Need at least five separate story groups per class for this pilot: {groups_per_class}")
    # Fix settings before seeing any fold scores. No search or final-test reuse.
    strength, weights = FIXED_SETTINGS
    pipeline = make_pipeline(strength, weights)
    texts = [row["text"] for row in records]
    truth = [row["label"] for row in records]
    groups = [row["story_group"] for row in records]
    splitter = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=42)
    predicted, majority = [None] * len(records), [None] * len(records)
    folds = []
    for index, (training, held_out) in enumerate(splitter.split(texts, truth, groups)):
        train_groups = {groups[i] for i in training}
        test_groups = {groups[i] for i in held_out}
        if train_groups & test_groups:
            raise ValueError("Pilot groups crossed a fold boundary.")
        if set(truth[i] for i in training) != set(LABELS):
            raise ValueError("A fold is missing a training class; gather more separate stories.")
        fitted = clone(pipeline).fit([texts[i] for i in training], [truth[i] for i in training])
        guesses = fitted.predict([texts[i] for i in held_out]).tolist()
        common = Counter(truth[i] for i in training).most_common(1)[0][0]
        for i, guess in zip(held_out, guesses):
            predicted[i], majority[i] = guess, common
        folds.append({
            "fold": index + 1, "train_ids": [records[i]["id"] for i in training],
            "held_out_ids": [records[i]["id"] for i in held_out],
            "train_class_counts": dict(Counter(truth[i] for i in training)),
            "held_out_class_counts": dict(Counter(truth[i] for i in held_out)),
            "macro_f1": metrics([truth[i] for i in held_out], guesses)["macro_f1"],
        })
    reports = {
        "model": metrics(truth, predicted),
        "majority": metrics(truth, majority),
        "keywords": metrics(truth, [keyword_predict(text) for text in texts]),
    }
    fold_scores = [fold["macro_f1"] for fold in folds]
    fitted = clone(pipeline).fit(texts, truth)
    version = "pilot-" + utc_now().replace(":", "").replace(".", "-")
    root = Path(output_root) if output_root else RUNS_DIR.parent / "pilots"
    run = root / version
    run.mkdir(parents=True, exist_ok=False)
    joblib.dump(fitted, run / "model.joblib")
    write_json(run / "dataset.json", records)
    write_json(run / "group_audit.json", audit)
    metadata = {
        "version": version, "created_at": utc_now(), "kind": "pilot", "guide_version": GUIDE_VERSION,
        "sklearn_version": sklearn.__version__, "dataset_hash": fingerprint(records),
        "model_sha256": hashlib.sha256((run / "model.joblib").read_bytes()).hexdigest(),
        "settings": {"C": strength, "class_weight": weights, "ngram_range": [1, 2], "seed": 42},
        "sample_count": len(records), "class_counts": dict(Counter(truth)),
        "story_group_count": len(set(groups)), "groups_per_class": groups_per_class,
        "collection_dates": sorted({row["first_seen_at"][:10] for row in records}),
        "activation_check_passed": False, "test_used": False,
    }
    write_json(run / "metadata.json", metadata)
    report = {
        "kind": "pilot", "reports": reports, "folds": folds,
        "fold_macro_f1_mean": float(np.mean(fold_scores)),
        "fold_macro_f1_std": float(np.std(fold_scores)),
        "activation_check_passed": False,
        "limits": "Five-fold grouped cross-validation on this batch, not a final or future-date test. Topic/event grouping is conservative and manually audited, not exhaustive. Labels remain unchanged. No parameter search.",
        "mistakes": [{**row, "predicted": guess} for row, guess in zip(records, predicted) if row["label"] != guess],
        "held_out_predictions": [{"id": row["id"], "label": row["label"], "predicted": guess} for row, guess in zip(records, predicted)],
    }
    write_json(run / "pilot_report.json", report)
    terms = fitted["tfidf"].get_feature_names_out()
    write_json(run / "top_terms.json", {
        label: [str(terms[i]) for i in coef.argsort()[-15:][::-1]]
        for label, coef in zip(fitted["classifier"].classes_, fitted["classifier"].coef_)
    })
    return run, report
