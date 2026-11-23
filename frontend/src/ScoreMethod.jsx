import React from "react";
import { Icon } from "./dashboard";

const STOCK_WEIGHT = 80;
const NEWS_WEIGHT = 20;

function calcBand(score) {
  return 5 - Math.min(4, Math.max(0, Math.floor(score / 20)));
}

function Contribution({ label, signal, weight, className }) {
  const points = Number.isFinite(signal) ? (signal * weight).toFixed(2) : "—";

  return (
    <div className="metric">
      <dt>{label}</dt>
      <dd className="metric-value">{points} <span>pts</span></dd>
      <dd className="metric-meta weight">
        <span className={`weight-track ${className}`} aria-hidden="true">
          <span style={{ width: `${weight}%` }} />
        </span>
        <span>{weight}% weight</span>
      </dd>
    </div>
  );
}

export function ScoreSummary({ score, previous, bandAverage, readingCount }) {
  const change = score && previous ? Number((score.raw_score - previous.raw_score).toFixed(2)) : null;
  const changeClass = change > 0 ? "change-up" : change < 0 ? "change-down" : "";

  return (
    <dl className="panel metrics" aria-label="Latest score breakdown">
      <div className="metric">
        <dt>Raw score</dt>
        <dd className="metric-value raw-value">{score?.raw_score.toFixed(2) ?? "—"} <span>/ 100</span></dd>
        <dd className="metric-meta">
          {change === null ? "Latest reading" : <><span className={changeClass}>{change > 0 ? "+" : ""}{change.toFixed(2)}</span> vs previous</>}
        </dd>
      </div>
      <div className="metric">
        <dt>Signal band</dt>
        <dd className="metric-value">{bandAverage === null ? "—" : calcBand(bandAverage)} <span>/ 5</span></dd>
        <dd className="metric-meta">
          {bandAverage === null ? "Average of up to 5 readings" : `${readingCount}-reading average · ${bandAverage.toFixed(2)}`}
        </dd>
      </div>
      <Contribution label="Stock contribution" signal={score?.stock_score} weight={STOCK_WEIGHT} className="stock-weight" />
      <Contribution label="News contribution" signal={score?.news_score} weight={NEWS_WEIGHT} className="news-weight" />
    </dl>
  );
}

export default function ScoreMethod({ bandAverage }) {
  return (
    <details className="panel methodology">
      <summary>
        <span className="method-title">How the score works</span>
        <span className="method-preview">Formula, inputs and signal bands</span>
        <Icon name="down" />
      </summary>
      <div className="method-body">
        <p className="formula">Raw score = {STOCK_WEIGHT} × stock signal + {NEWS_WEIGHT} × news signal</p>
        <div className="method-grid">
          <div>
            <h3>Stock signal</h3>
            <p>Take the percent change between the two latest closes for LMT, NOC, RTX, GD and BA. Divide each change by 5, keep it within 0–1 and average the scores for stocks with usable prices. A 2.5% gain scores 0.5.</p>
          </div>
          <div>
            <h3>News signal</h3>
            <p>Scan Google News results for “military conflict,” “defense systems” and “drone strike.” Count each term once if it appears in the headline or snippet. Terms like “airstrike” earn 1 point and terms like “nuclear” earn 2. Divide the average points per article by 5 and cap the signal at 1.</p>
          </div>
          <div>
            <h3>Signal band</h3>
            <p>Average up to five of the latest raw scores. The band starts at 5 and moves to 4, 3, 2 and 1 at averages of 20, 40, 60 and 80.
              {bandAverage !== null && <> Latest average ≈ <strong>{bandAverage.toFixed(2)}</strong>.</>}
            </p>
          </div>
        </div>
        <p>The raw score caps at 100 and rounds to two decimals. The contribution estimates use rounded inputs. Earnings and passing mentions in headlines can move this index. The news classifier runs as a separate experiment.</p>
      </div>
    </details>
  );
}
