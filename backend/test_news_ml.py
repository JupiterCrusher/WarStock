import csv
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import main
import news_data
import news_ml
import pilot
from news_store import (
    LABELS, make_article, merge_articles, model_text, read_articles,
    save_articles, write_json,
)


def fixture_records():
    rows, labels = [], {}
    for day in range(1, 4):
        for label, phrase in zip(LABELS, ("routine radar contract", "readiness posture alert", "battlezone casualty incident")):
            for index in range(25):
                item_id = f"{day}-{label}-{index}"
                rows.append({
                    "id": item_id, "title": f"{phrase} example{day}{index}", "snippet": "",
                    "source": "Example", "url": "https://example.com/" + item_id, "queries": [],
                    "published_at": f"2026-09-0{day}T08:00:00Z", "first_seen_at": f"2026-09-0{day}T09:00:00Z",
                    "story_group": item_id,
                })
                labels[item_id] = {"label": label, "guide_version": "1", "notes": "Synthetic test fixture"}
    return rows, labels


class NewsArchiveTests(unittest.TestCase):
    def test_duplicate_feed_items_keep_first_seen_and_merge_queries(self):
        entry = {"title": "Radar contract - Publisher", "summary": "<b>Radar contract</b>", "source": {"title": "Publisher"}}
        first = make_article(entry, "feed-one", "2026-09-01T10:00:00Z")
        later = make_article(entry, "feed-two", "2026-09-02T10:00:00Z")
        rows, added = merge_articles([first], [later])
        self.assertEqual(added, 0)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["first_seen_at"], "2026-09-01T10:00:00Z")
        self.assertEqual(rows[0]["queries"], ["feed-one", "feed-two"])

    def test_publisher_does_not_enter_training_text(self):
        item = {"title": "Radar contract - Publisher", "snippet": "Radar contract - Publisher Publisher extra detail", "source": "Publisher"}
        self.assertEqual(model_text(item), "Radar contract extra detail")

    def test_future_publish_date_becomes_unknown(self):
        entry = {"title": "Radar report", "published_parsed": (2030, 1, 1, 0, 0, 0, 0, 0, 0)}
        self.assertIsNone(make_article(entry, "feed", "2026-09-01T10:00:00Z")["published_at"])

    @patch.object(news_data, "fetch_feed")
    def test_total_outage_keeps_archive_and_is_not_zero(self, fetch):
        fetch.side_effect = RuntimeError("offline")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "articles.jsonl"
            rows, _ = fixture_records()
            save_articles(rows[:1], path)
            before = path.read_bytes()
            collection = news_data.collect_news(path)
            self.assertEqual(collection["status"], "unavailable")
            self.assertEqual(collection["articles"], [])
            self.assertEqual(path.read_bytes(), before)
            with self.assertRaises(ValueError):
                news_data.score_articles(collection["articles"])

    @patch.object(news_data, "fetch_feed")
    def test_partial_outage_keeps_usable_unique_items(self, fetch):
        feed = SimpleNamespace(entries=[{"title": "Radar contract", "summary": ""}])
        fetch.side_effect = [feed, RuntimeError("offline"), feed]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "news.jsonl"
            collection = news_data.collect_news(path)
            self.assertEqual(collection["status"], "partial")
            self.assertEqual(collection["added"], 1)
            self.assertEqual(len(collection["articles"]), 1)
            self.assertEqual(len(read_articles(path)), 1)

    def test_near_copy_groups_merge_transitively(self):
        a = make_article({"title": "Troops deploy along the northern border after warning"}, "feed", "2026-09-01T10:00:00Z")
        b = make_article({"title": "Troops deploy along the northern border after warning today"}, "feed", "2026-09-01T10:00:00Z")
        rows, _ = merge_articles([a], [b])
        self.assertEqual(rows[0]["story_group"], rows[1]["story_group"])

    def test_export_never_overwrites_and_escapes_formulas(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            rows, _ = fixture_records()
            rows[0]["title"] = '=HYPERLINK("https://example.com")'
            save_articles(rows[:1], root / "articles.jsonl")
            output = root / "sheet.csv"
            self.assertEqual(news_ml.export_labels(root / "articles.jsonl", root / "labels.json", output), 1)
            with output.open(encoding="utf-8-sig") as stream:
                row = next(csv.DictReader(stream))
            self.assertTrue(row["title"].startswith("'="))
            with self.assertRaises(ValueError):
                news_ml.export_labels(root / "articles.jsonl", root / "labels.json", output)


class ModelSplitTests(unittest.TestCase):
    def test_cross_boundary_copy_groups_are_purged(self):
        rows, labels = fixture_records()
        rows[0]["story_group"] = rows[75]["story_group"] = "same-story"
        records = news_ml.labeled_records(rows, labels)
        split, removed = news_ml.split_records(records)
        self.assertEqual(removed, 2)
        groups = [{row["story_group"] for row in bucket} for bucket in split.values()]
        self.assertFalse(groups[0] & groups[1] or groups[0] & groups[2] or groups[1] & groups[2])

    def test_one_collection_date_cannot_create_a_false_time_test(self):
        rows, labels = fixture_records()
        for row in rows:
            row["first_seen_at"] = "2026-09-01T10:00:00Z"
        with self.assertRaisesRegex(ValueError, "3 collection dates"):
            news_ml.split_records(news_ml.labeled_records(rows, labels))

    def test_class_missing_from_test_blocks_training(self):
        rows, labels = fixture_records()
        records = news_ml.labeled_records(rows, labels)
        records = [row for row in records if not (row["first_seen_at"].startswith("2026-09-03") and row["label"] == "reported_fighting")]
        with self.assertRaisesRegex(ValueError, "reported|Reported"):
            news_ml.split_records(records)

    def test_unclear_labels_do_not_become_training_labels(self):
        rows, labels = fixture_records()
        labels[rows[0]["id"]]["label"] = "review"
        records = news_ml.labeled_records(rows, labels)
        self.assertEqual(len(records), len(rows) - 1)


class ModelPipelineTests(unittest.TestCase):
    def test_single_date_pilot_keeps_groups_together_and_cannot_activate(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            rows, labels = fixture_records()
            for row in rows:
                row["first_seen_at"] = "2026-09-01T10:00:00Z"
            rows[1]["story_group"] = rows[0]["story_group"]
            save_articles(rows, root / "articles.jsonl")
            write_json(root / "labels.json", labels)
            run, report = pilot.run_pilot(root / "articles.jsonl", root / "labels.json", output_root=root / "pilots")
            self.assertEqual(report["kind"], "pilot")
            self.assertFalse(report["activation_check_passed"])
            held_out = [ident for fold in report["folds"] for ident in fold["held_out_ids"]]
            self.assertEqual(len(held_out), len(set(held_out)))
            self.assertEqual(set(held_out), {row["id"] for row in rows})
            groups = {row["id"]: row["story_group"] for row in rows}
            for fold in report["folds"]:
                self.assertFalse({groups[i] for i in fold["train_ids"]} & {groups[i] for i in fold["held_out_ids"]})
            with self.assertRaisesRegex(ValueError, "pilot cannot be activated"):
                news_ml.activate(run, root / "models")
            with self.assertRaisesRegex(ValueError, "pilot has no dated final test"):
                news_ml.evaluate(run)
            self.assertFalse((root / "models").exists())

    def test_pilot_overrides_cannot_split_an_existing_copy_group(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            rows, labels = fixture_records()
            rows[1]["story_group"] = rows[0]["story_group"]
            path = root / "groups.json"
            write_json(path, {"overrides": {rows[0]["id"]: "one", rows[1]["id"]: "two"}})
            with self.assertRaisesRegex(ValueError, "cannot be split"):
                pilot.apply_groups(news_ml.labeled_records(rows, labels), path)

    def test_train_evaluate_activate_and_predict_with_synthetic_data(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            rows, labels = fixture_records()
            articles_path, labels_path = root / "articles.jsonl", root / "labels.json"
            save_articles(rows, articles_path)
            write_json(labels_path, labels)
            runs = root / "runs"
            run, metadata = news_ml.train(articles_path, labels_path, runs)
            self.assertFalse(metadata["test_used"])
            self.assertFalse((run / "test_report.json").exists())
            report = news_ml.evaluate(run)
            self.assertTrue(report["activation_check_passed"])
            with self.assertRaisesRegex(ValueError, "already been used"):
                news_ml.evaluate(run)
            with self.assertRaisesRegex(ValueError, "already been used"):
                news_ml.train(articles_path, labels_path, runs)
            active = root / "models"
            news_ml.activate(run, active)
            collection = {"timestamp": "2026-09-03T12:00:00Z", "status": "partial", "feeds": [], "articles": rows, "total": len(rows)}
            snapshot = news_ml.write_news_snapshot(collection, active, root / "news.json")
            self.assertEqual(snapshot["model_state"], "active")
            self.assertEqual(snapshot["story_count"], 75)
            self.assertEqual(sum(snapshot["class_counts"].values()), 75)
            self.assertEqual(len(snapshot["articles"]), 30)
            self.assertEqual(snapshot["feed_status"], "partial")

    def test_fixed_model_uses_two_dates_and_keeps_test_text_out_of_training(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            rows, labels = fixture_records()
            rows = [row for row in rows if not row["first_seen_at"].startswith("2026-09-03")]
            for row in rows:
                if row["first_seen_at"].startswith("2026-09-02"):
                    row["title"] += " holdoutword"
            articles_path, labels_path = root / "articles.jsonl", root / "labels.json"
            save_articles(rows, articles_path)
            write_json(labels_path, labels)

            run, metadata = news_ml.train(articles_path, labels_path, root / "runs", fixed=True)
            pipeline, _ = news_ml.load_pipeline(run)
            self.assertEqual(set(metadata["split_dates"]), {"train", "test"})
            self.assertEqual(metadata["settings"], {"C": 1.0, "class_weight": "balanced"})
            self.assertNotIn("holdoutword", pipeline["tfidf"].vocabulary_)
            self.assertTrue(news_ml.evaluate(run)["activation_check_passed"])
            self.assertEqual(news_ml.activate(run, root / "models")["training_mode"], "fixed")

    def test_committed_model_loads_with_installed_dependencies(self):
        if not (news_ml.MODEL_DIR / "metadata.json").exists():
            self.skipTest("No model in this checkout")
        pipeline, metadata = news_ml.load_pipeline(news_ml.MODEL_DIR, "news.joblib")
        self.assertTrue(metadata["activation_check_passed"])
        self.assertIn(pipeline.predict(["Defense firm wins radar contract"])[0], LABELS)

    def test_tampered_split_blocks_evaluation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            rows, labels = fixture_records()
            save_articles(rows, root / "articles.jsonl")
            write_json(root / "labels.json", labels)
            run, _ = news_ml.train(root / "articles.jsonl", root / "labels.json", root / "runs")
            path = run / "dataset.json"
            split = json.loads(path.read_text())
            split["test"][0]["label"] = "threats_buildup"
            write_json(path, split)
            with self.assertRaisesRegex(ValueError, "edited after training"):
                news_ml.evaluate(run)

    def test_snapshot_does_not_duplicate_story_groups(self):
        rows, _ = fixture_records()
        rows = rows[-3:]
        rows[0]["story_group"] = rows[1]["story_group"] = "one-story"
        collection = {"timestamp": "2026-09-03T12:00:00Z", "status": "ok", "feeds": [], "articles": rows, "total": 3}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            snapshot = news_ml.write_news_snapshot(collection, root / "missing-model", root / "news.json")
        self.assertEqual(snapshot["story_count"], 2)
        self.assertEqual(snapshot["model_state"], "awaiting_training")
        self.assertEqual(snapshot["class_counts"], {})
        self.assertTrue(all(row["label"] is None for row in snapshot["articles"]))

    @patch.object(main, "get_stock_signal", return_value=0.2)
    @patch.object(main, "collect_news")
    @patch.object(main, "write_news_snapshot")
    def test_hourly_run_uses_previous_signal_during_news_outage(self, snapshot, collect, stock):
        collect.return_value = {"status": "unavailable", "articles": []}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            scores_path, errors_path = root / "scores.json", root / "errors.json"
            write_json(scores_path, [{"stock_score": 0.1, "news_score": 0.7, "raw_score": 22}])
            write_json(errors_path, [])
            with patch.object(main, "SCORES_PATH", scores_path), patch.object(main, "ERRORS_PATH", errors_path):
                main.main()
            latest = json.loads(scores_path.read_text())[-1]
            self.assertEqual(latest["news_score"], 0.7)
            self.assertEqual(latest["news_feed_status"], "unavailable")
            self.assertEqual(json.loads(errors_path.read_text())[0]["error_type"], "news_fetch_failed")


if __name__ == "__main__":
    unittest.main()
