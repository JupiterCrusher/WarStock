import React from "react";

const STOCK_WEIGHT = 80;
const NEWS_WEIGHT = 20;

export default function ScoreMethod({ score, bandAverage }) {
  const hasSignals = Number.isFinite(score?.stock_score) && Number.isFinite(score?.news_score);

  return (
    <section className="mx-auto mb-6 max-w-3xl border border-green-800 bg-green-950/40" aria-labelledby="score-method-heading">
      <div className="p-3 sm:px-4">
        <h2 id="score-method-heading" className="text-base font-bold text-green-200">How the score works</h2>
        <p className="mt-1 text-sm text-green-300">
          Raw score = {STOCK_WEIGHT} × stock signal + {NEWS_WEIGHT} × news signal
        </p>
        {hasSignals ? (
          <dl className="mt-3 grid grid-cols-2 gap-2 sm:gap-4">
            {[
              ["Stocks", score.stock_score, STOCK_WEIGHT],
              ["News", score.news_score, NEWS_WEIGHT],
            ].map(([label, signal, weight]) => (
              <div key={label} className="border-l border-green-700 pl-2 sm:pl-3">
                <dt className="text-xs text-green-400">{label} · {weight}% weight</dt>
                <dd className="mt-1 text-sm tabular-nums text-green-200">
                  {signal} × {weight} ≈ <strong className="whitespace-nowrap">{(signal * weight).toFixed(2)} pts</strong>
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
      <details className="border-t border-green-800">
        <summary className="cursor-pointer px-3 py-2.5 text-sm text-green-300 hover:bg-green-900/50 focus-visible:outline focus-visible:outline-1 focus-visible:outline-green-400 sm:px-4">
          Scoring rules and signal bands
        </summary>
        <div className="space-y-3 px-3 pb-4 pt-2 text-sm text-green-300 sm:px-4">
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
            <div>
              <h3 className="font-bold text-green-200">Stock signal</h3>
              <p className="mt-1">
                Take the percent change between the two latest closes for LMT, NOC, RTX, GD and BA.
                Divide each change by 5, keep it within 0–1 and average the scores for stocks with usable prices.
                A 2.5% gain scores 0.5.
              </p>
            </div>
            <div>
              <h3 className="font-bold text-green-200">News signal</h3>
              <p className="mt-1">
                Scan Google News results for “military conflict,” “defense systems” and “drone strike.”
                Count each term once if it appears in the headline or snippet.
                Terms like “airstrike” earn 1 point and terms like “nuclear” earn 2.
                Divide the average points per article by 5 and cap the signal at 1.
              </p>
            </div>
          </div>
          <p>
            The raw score caps at 100 and rounds to two decimals. The point estimates use the rounded signals shown on the site.
          </p>
          <div>
            <h3 className="font-bold text-green-200">Signal band</h3>
            <p className="mt-1">
              Average up to five of the latest raw scores. The band starts at 5 and moves to 4, 3, 2 and 1 at averages of 20, 40, 60 and 80.
              {score ? <> Latest average ≈ <strong className="text-green-200">{bandAverage.toFixed(2)}</strong>.</> : null}
            </p>
          </div>
          <p className="text-green-400">Earnings and passing mentions in headlines can move this hobby index.</p>
        </div>
      </details>
    </section>
  );
}
