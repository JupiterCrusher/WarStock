# WarStock news classifier

Build a model that reads a headline and its RSS snippet, then sorts what the
report describes. Cole will label the data and review hard cases.
Codex will build the tools, run training and tests, explain the steps, and add the tested model to
WarStock. Start small enough to inspect and train on a laptop.

## What we have

Checked this checkout on October 1, 2026:

- `backend/news_data.py` fetches three RSS searches and counts keyword hits.
- `backend/main.py` blends stock and news scores with fixed 80/20 weights.
- `backend/scores.json` has 7,885 rows across 402 dates, from June 6, 2025,
  through July 12, 2026. It stores scores, not the headlines that made them.
- There are no human labels or trained model in this checkout.

The old scores are useful for comparison, but they are not true labels for
conflict news. Training a model to copy those scores would teach it the old
formula. We need to save and label actual news text.

## 1. Collect text we can use

Extend the feed fetcher to save each item before scoring it. Keep:

`id, title, snippet, url, source, query, published_at, first_seen_at, story_group`

Clean HTML and repeated title text from snippets. Preserve the source text for
review, but remove publisher suffixes from model input. Use a stable ID to stop
hourly polls and overlapping searches from adding the same article again.
Group near copies about the same incident so they cannot appear on both sides
of a training/test split.

Use JSON Lines for collection, a local page for labeling, and CSV for export. Collect across dates,
sources, and topics; a large pile about one incident is a poor training set.
Keep feed failures and missing timestamps explicit. The current news function
returns zero when every feed fails; missing news must not look like calm news.

## 2. Agree on labels, then label a pilot

Start with three labels for what the text reports:

| Label | Meaning | Made-up example |
| --- | --- | --- |
| Background / other | Arms business, history, talks, or other text with no reported threat, buildup, or fighting | "Defense firm wins radar contract" |
| Threats / buildup | An explicit threat, troop buildup, or military exercise, without reported fighting | "Government threatens strikes after troop buildup" |
| Reported fighting | Text reports an actual attack, strike, clash, or shelling | "Airstrike hits military base" |

These labels describe reports. They do not prove that an event happened or
measure the chance of future war.

Write a short label guide with rules for quotes, old events, denials, and texts
that mention more than one category. Use the main new claim; send unclear cases
to review instead of guessing. Label only from the text the model will receive.
Keep unclear items and report how often they occur, even if we omit them from
the first training run.

Cole labels the first 100 unique items without seeing keyword scores or model
guesses. Review a sample together and fix unclear rules before labeling more.
Aim for about 1,000 items for the first full experiment, with enough examples of
each class. This is a starting target, not a promise of good results. Audit
counts and errors before deciding whether we need more data or fewer classes.

## 3. Train a small model Cole can explain

Use a scikit-learn pipeline: **TF-IDF → logistic regression**.

- TF-IDF turns words and short phrases into numeric features.
- Logistic regression learns weights that map those features to the labels.
- Codex runs the training and helps Cole inspect which phrases
  push the model toward each class.

Start with single words and two-word phrases. Tune only a few settings, such as
regularization strength and class weights. Keep dependencies, split IDs, label
guide version, and random seed with each run.

This is actual training from labeled examples. A larger text model is a later
experiment if the first model's errors give us a reason to try one.

## 4. Test whether it helps

Reserve older stories for training, a later window for validation, and the
newest window for the final test; aim roughly for 70/15/15. Group story copies
before splitting, and exclude groups that cross the date boundaries. Check
class counts in each set. Gather more data if a class has too few test cases.

Fit TF-IDF only on training text. Use validation data to choose settings. Leave
the final test alone until we choose the model.

Compare three methods on the same test items:

1. Always predict the most common training label.
2. A fixed keyword classifier with an explicit mapping to the three labels.
3. The trained text model.

The current keyword score is a number, so we must define that class mapping
before comparing it with a classifier. Choose any thresholds on validation
data only. Do not use the keyword rules to create the human test labels.

Report macro F1, which gives each class equal weight; precision and recall for
each class; a confusion matrix; class counts; and real mistakes. Check whether
it recognizes new stories rather than learning publisher names or one event.
Keep the model experimental if it does not beat the baselines or misses too
much reported fighting. Check performance again on later collected news.

## 5. Add it to WarStock

Save the fitted text pipeline and a small file with its version and test
results. Load it during the existing hourly Python job; train only when Cole
chooses to retrain, not on every hourly run. Update the workflow's dependency
install and persist the new prediction output.

First show a separate news panel with labels, recent headlines, source links,
class shares for a fixed fresh-news window, and the model version. Count unique
stories and show feed health. Run it beside the old signal before changing the
main score. Keep old and new results distinct so the chart does not join scores
with different meanings.

If we later show model probabilities, test their calibration first. A class
probability concerns the article label; it is not a probability of war. A
0–100 summary of class shares would still be a chosen news index, not a learned
forecast. Give it a name that states what it measures.

## Work in order

1. Build raw-news storage and a CSV export; write the label guide.
2. Cole labels 100 items; review the hard cases and settle the rules.
3. Collect and label more items; build the split and baseline scripts.
4. Codex trains the model and explains the results; review hard cases together.
5. Run the held-out test, save the results, and add the news panel if it helps.

The first deliverable is a clean label sheet and 100 reviewed examples.

## References

- [TF-IDF features](https://scikit-learn.org/stable/modules/generated/sklearn.feature_extraction.text.TfidfVectorizer.html)
- [Logistic regression](https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.LogisticRegression.html)
- [Preventing data leakage](https://scikit-learn.org/stable/common_pitfalls.html)
- [F1 and macro averaging](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.f1_score.html)
