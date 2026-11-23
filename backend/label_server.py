"""A loopback-only label tool. No accounts, uploads, or external assets."""

import json
import secrets
from collections import Counter
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
from urllib.parse import parse_qs, urlparse

from news_ml import GUIDE_VERSION
from news_store import LABELS, model_parts, read_articles, read_labels, utc_now, write_json


def serve(articles_path, labels_path, port=8765):
    token = secrets.token_urlsafe(32)
    articles = read_articles(articles_path)
    by_id = {row["id"]: row for row in articles}
    lock = Lock()
    host = f"127.0.0.1:{port}"

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def respond(self, code, content, kind="application/json"):
            encoded = content.encode() if isinstance(content, str) else json.dumps(content).encode()
            self.send_response(code)
            self.send_header("Content-Type", kind + "; charset=utf-8")
            self.send_header("Content-Length", str(len(encoded)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'")
            self.end_headers()
            self.wfile.write(encoded)

        def check_host(self):
            if self.headers.get("Host") != host:
                self.respond(403, {"error": "Use the local link printed in the terminal."})
                return False
            return True

        def do_GET(self):
            if not self.check_host():
                return
            route = urlparse(self.path)
            if route.path == "/favicon.ico":
                self.send_response(204)
                self.end_headers()
                return
            if route.path == "/":
                page = Path(__file__).with_name("label.html").read_text(encoding="utf-8")
                self.respond(200, page.replace("__LABEL_TOKEN__", token), "text/html")
                return
            if route.path != "/api/next":
                self.respond(404, {"error": "Page not found"})
                return
            params = parse_qs(route.query)
            mode = params.get("mode", ["pending"])[0]
            excluded_ids = set(params.get("exclude", [""])[0].split(","))
            with lock:
                labels = read_labels(labels_path)
                answered_groups = {by_id[item]["story_group"] for item in labels if item in by_id}
                if mode == "review":
                    queue = [row for row in articles if labels.get(row["id"], {}).get("label") == "review"]
                else:
                    queue = [row for row in articles if row["id"] not in labels and row["story_group"] not in answered_groups]
                # Stable hash order mixes feeds and dates without showing model guesses.
                queue.sort(key=lambda row: row["id"])
                queue = [row for row in queue if row["id"] not in excluded_ids]
                item_id = params.get("id", [None])[0]
                item = by_id.get(item_id) if item_id else queue[0] if queue else None
                shown_item = None
                if item:
                    title, snippet = model_parts(item)
                    shown_item = {**item, "input_title": title, "input_snippet": snippet}
                counts = Counter(entry.get("label") for entry in labels.values())
                self.respond(200, {
                    "article": shown_item, "saved": labels.get(item["id"]) if item else None,
                    "progress": {"labeled": sum(counts[label] for label in LABELS), "review": counts["review"],
                                 "remaining": len({row["story_group"] for row in queue}), "total": len(articles),
                                 "counts": {label: counts[label] for label in LABELS}},
                })

        def do_POST(self):
            if not self.check_host():
                return
            if self.path != "/api/label":
                self.respond(404, {"error": "Page not found"})
                return
            if self.headers.get("X-Label-Token") != token or self.headers.get("Origin") not in (None, f"http://{host}"):
                self.respond(403, {"error": "Reload the local label page and try again."})
                return
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 < size <= 8192:
                    raise ValueError("Invalid request size")
                data = json.loads(self.rfile.read(size))
                item_id, label = data["id"], data["label"]
                notes = data.get("notes", "")
                if item_id not in by_id or label not in (*LABELS, "review", None) or not isinstance(notes, str) or len(notes) > 2000:
                    raise ValueError("Unknown article, label, or invalid notes")
                with lock:
                    labels = read_labels(labels_path)
                    if label is None:
                        labels.pop(item_id, None)
                    else:
                        labels[item_id] = {"label": label, "notes": notes, "guide_version": GUIDE_VERSION, "labeled_at": utc_now()}
                    write_json(labels_path, labels)
                self.respond(200, {"saved": True})
            except (ValueError, KeyError, TypeError) as exc:
                self.respond(400, {"error": str(exc)})
            except OSError:
                self.respond(500, {"error": "Could not save. Your choice has not been recorded; check disk access and retry."})

    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Label news at http://{host} — changes save to {labels_path}", flush=True)
    print("Press Ctrl+C to stop. Restart after collecting more news to reload the archive.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
