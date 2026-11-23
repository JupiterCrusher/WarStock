"""Run from the repo root: .venv/bin/python backend/ml.py --help."""

import argparse
import json
from collections import Counter
from pathlib import Path

from news_data import collect_news
from news_ml import activate, evaluate, export_labels, train, write_news_snapshot
from news_store import ARTICLES_PATH, LABELS_PATH, read_articles, read_labels


def main():
    parser = argparse.ArgumentParser(description="Collect, label, train, and test WarStock news.")
    parser.add_argument("--articles", type=Path, default=ARTICLES_PATH)
    parser.add_argument("--labels", type=Path, default=LABELS_PATH)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("collect", help="Archive current RSS headlines and update the news panel")
    label = commands.add_parser("label", help="Open a local label server")
    label.add_argument("--port", type=int, default=8765)
    commands.add_parser("status", help="Show archive and label counts")
    export = commands.add_parser("export", help="Export a label sheet without overwriting an existing file")
    export.add_argument("output", type=Path)
    export.add_argument("--limit", type=int)
    training = commands.add_parser("train", help="Train on older news and reserve the final test")
    training.add_argument("--fixed", action="store_true", help="Use the pilot settings and hold out the latest collection date")
    pilot = commands.add_parser("pilot", help="Train a first experiment with grouped cross-validation; cannot activate it")
    pilot.add_argument("--groups", type=Path, help="Optional audited story-group overrides")
    for name in ("evaluate", "activate"):
        command = commands.add_parser(name, help="Use the final test once" if name == "evaluate" else "Enable a model that passed its final test")
        command.add_argument("run", type=Path)
    args = parser.parse_args()
    try:
        if args.command == "collect":
            collection = collect_news(args.articles)
            write_news_snapshot(collection)
            print(json.dumps({key: value for key, value in collection.items() if key != "articles"}, indent=2))
            if collection["status"] == "unavailable":
                raise ValueError("No news could be fetched. The saved archive was kept; retry later.")
        elif args.command == "label":
            from label_server import serve
            serve(args.articles, args.labels, args.port)
        elif args.command == "status":
            articles, labels = read_articles(args.articles), read_labels(args.labels)
            print(json.dumps({"articles": len(articles), "story_groups": len({row['story_group'] for row in articles}),
                              "labels": dict(Counter(entry.get('label') for entry in labels.values())),
                              "collection_dates": len({row['first_seen_at'][:10] for row in articles})}, indent=2))
        elif args.command == "export":
            if args.limit is not None and args.limit <= 0:
                raise ValueError("Limit must be positive")
            count = export_labels(args.articles, args.labels, args.output, args.limit)
            print(f"Exported {count} items to {args.output}")
        elif args.command == "pilot":
            from pilot import run_pilot
            run, report = run_pilot(args.articles, args.labels, args.groups)
            print(f"Saved pilot: {run}")
            for name, result in report["reports"].items():
                print(f"{name}: grouped cross-validation macro F1 {result['macro_f1']:.3f}")
            print("Pilot only. No final test was used; this model cannot be activated.")
        elif args.command == "train":
            run, metadata = train(args.articles, args.labels, fixed=args.fixed)
            print(f"Saved candidate: {run}")
            if metadata["validation"] is not None:
                print(f"Validation macro F1: {metadata['validation']['macro_f1']:.3f}")
            print("Review top_terms.json before running the held-out test with evaluate.")
        elif args.command == "evaluate":
            report = evaluate(args.run)
            for name, result in report["reports"].items():
                print(f"{name}: macro F1 {result['macro_f1']:.3f}")
            print(f"Activation check passed: {report['activation_check_passed']}")
        else:
            result = activate(args.run)
            print(f"Activated experimental model {result['version']}. Run collect to refresh its news output.")
    except (ValueError, OSError, KeyError) as exc:
        parser.exit(1, f"Could not {args.command}: {exc}\n")


if __name__ == "__main__":
    main()
