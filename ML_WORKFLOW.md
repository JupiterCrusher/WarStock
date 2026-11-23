# News model workflow

The classifier learns from labeled headlines and needs a test on news from a
later date before it can go live.

## Label

From the repo root, use the existing Python environment:

```sh
.venv/bin/python backend/ml.py label --port 8766
```

Open `http://127.0.0.1:8766`. Pick a label, skip unclear items, and add optional
notes. Follow [LABEL_GUIDE.md](LABEL_GUIDE.md). Choices save to
`backend/data/labels.json`, which Git ignores. Stop with Ctrl+C. Restarting keeps
your labels; restart after a new collection to load the added headlines.

Tell Codex when the first 100 are labeled. Codex will review counts and notes,
collect more news, and train once the dated splits have enough examples.

## Setup and collection

For a fresh checkout with Python 3.11 or later:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python backend/ml.py collect
.venv/bin/python backend/ml.py status
```

Collection adds unique headlines to `backend/data/articles.jsonl` and writes
`backend/news.json` for the dashboard. Labels and notes remain separate. The
hourly workflow uses the same collector through `backend/main.py` and persists
the news archive along with score output once these changes are pushed.

We use JSON Lines rather than SQLite so scheduled archive changes stay readable
in Git and survive a fresh Actions runner without an extra storage service.
The local label page needs no account or external service.

If a feed fails, the snapshot shows partial or missing coverage. On total
failure the legacy score uses its prior news value; each new score records feed
status and a score version. Missing news is never a zero signal. Polls keep the
original first-seen time, so an old article does not become new training data.
An archive collected today cannot reconstruct news as it was known months ago.

An optional CSV export is available for inspection; use the label page to save
labels. Export refuses to overwrite an existing file:

```sh
.venv/bin/python backend/ml.py export backend/data/first-batch.csv --limit 100
```

## Training and tests (Codex handles these)

A first pilot can run before we have later collection dates:

```sh
.venv/bin/python backend/ml.py pilot
```

The pilot uses fixed TF-IDF/logistic regression settings and five folds of
grouped cross-validation. It fits a fresh text pipeline inside each fold, then
saves an offline model fitted on the whole labeled batch under `.ml/pilots/`.
Each headline's reported guess comes from a fold that did not train on its story
group. Related events can slip past title matching, so review groups before
reading scores. An optional `--groups FILE` accepts a JSON object with an
`overrides` map from labeled article IDs to audited group names.

Pilot scores help find weak labels and features. The pilot file stays offline.
To use its preset settings with two or more labeled collection dates, train a
new candidate with the latest date held out:

```sh
.venv/bin/python backend/ml.py train --fixed
```

This fits one model on earlier dates, with no settings search. The usual
held-out evaluation and activation checks still apply.

To tune settings with three or more dates:

```sh
.venv/bin/python backend/ml.py train
```

This picks from six TF-IDF/logistic regression settings using validation macro
F1. It saves a dated run under `.ml/runs/` with:

- `metadata.json`: settings, dates, class counts, versions, and validation results when tuning.
- `top_terms.json`: phrases that push toward each class.
- `dataset.json`: fixed training/validation/test rows, without personal notes.
- `model.joblib`: fitted pipeline; do not load artifacts from strangers.

Splits follow **first collection date**, roughly 70/15/15 by date count. Groups
of near-copy titles that cross a date boundary are removed. This can change the
row proportions. Automatic title grouping cannot catch every report about the
same event; review similar stories and failure cases before trusting a score.
TF-IDF sees only training text. The final test stays untouched while settings
are chosen. Dates and class counts must pass the minimum checks.

After selecting the candidate, replace RUN_PATH below with its printed path:

```sh
.venv/bin/python backend/ml.py evaluate RUN_PATH
```

Evaluation reports per-class precision/recall, macro F1, confusion matrices,
and mistakes for the model and two baselines: most-common training label and
fixed keyword rules. The old numeric keyword signal has no direct class output;
the new class baseline uses explicit rules fixed before test evaluation.

Each dataset's final test can run once. A record under `.ml/tested/` blocks
repeated evaluation and retraining against that dataset. Do not delete it to
tune against the test; collect new dated news instead. Local files are guardrails,
not a tamper-proof experiment registry. We will inspect class counts and later
news performance; a single good result is not proof of broad reliability.

## Activate and view

```sh
.venv/bin/python backend/ml.py activate RUN_PATH
.venv/bin/python backend/ml.py collect
cd frontend
npm ci
npm run dev -- --host 127.0.0.1
```

Activation requires test macro F1 to beat both baselines and reported-fighting
recall to reach 0.70. It copies the model and safe metadata into
`backend/models/`. The dashboard shows classified headlines and class shares
over a 24-hour window, separate from the stock/keyword score. Shares count
unique collected story groups, not all world news. No probabilities of war or
unverified model confidence appear.

The local Vite server serves the news snapshot at `/api/news`. Vercel uses its
news proxy, with a direct public GitHub fallback. To use the model in the hosted
hourly job, commit the activated model and metadata along with the code changes.

## First release

The fixed model trained on 104 human-labeled headlines from October 1 and was
tested against 108 Codex-labeled headlines from November 23. It scored 0.622
macro F1 and caught 55 of 61 reports of fighting. It caught three of seven
threat or buildup reports. The later sample contains repeat coverage of some
events. See [model metadata](backend/models/metadata.json) for the class counts
and test results.

Run checks from the repo root:

```sh
(cd backend && ../.venv/bin/python -m unittest -v)
(cd frontend && npm run build)
```

Model tests use made-up labeled news in temporary directories. Their scores
verify the machinery; they do not measure real-news accuracy. No test fixture
labels or trained fixture model should enter the real archive or dashboard.
