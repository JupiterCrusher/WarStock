import React, { useEffect, useMemo, useState } from "react";
import CrtOptics from "./CrtOptics";
import CrtReticle from "./CrtReticle";
import NewsPanel from "./NewsPanel";
import ScoreMethod, { ScoreSummary } from "./ScoreMethod";
import { ScoreHistory, ScoreTrend, ranges } from "./ScoreHistory";
import { Icon, formatDate, formatTimestamp } from "./dashboard";

const fetchURL = "/api/scores";
const rawScoresURL =
  "https://raw.githubusercontent.com/JupiterCrusher/WarStock/main/backend/scores.json";
const day = 24 * 60 * 60 * 1000;

function normalizeScores(data) {
  if (!Array.isArray(data)) {
    const message = data?.error ? `Scores endpoint error: ${data.error}` : "Scores payload was not an array.";
    throw new Error(message);
  }

  return data
    .filter((score) => Number.isFinite(Date.parse(score?.timestamp)) && Number.isFinite(Number(score.raw_score)))
    .map((score) => ({
      ...score,
      stock_score: Number(score.stock_score),
      news_score: Number(score.news_score),
      raw_score: Number(score.raw_score),
    }))
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

async function loadScores(url, signal) {
  const response = await fetch(url, { cache: "no-store", signal });
  if (!response.ok) throw new Error(`Scores request failed (${response.status})`);

  const text = await response.text();
  if (text.trim().startsWith("<")) throw new Error("Scores endpoint returned HTML instead of JSON.");
  return normalizeScores(JSON.parse(text));
}

function useScoreFeed(refreshKey) {
  const [scores, setScores] = useState([]);
  const [completedKey, setCompletedKey] = useState(-1);
  const [notice, setNotice] = useState("");
  const isLoading = completedKey !== refreshKey;

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    async function refresh() {
      try {
        const data = await loadScores(fetchURL, signal);
        if (signal.aborted) return;
        setScores(data);
        setNotice("");
      } catch (primaryError) {
        if (signal.aborted) return;
        try {
          const data = await loadScores(rawScoresURL, signal);
          if (signal.aborted) return;
          setScores(data);
          setNotice("Using the GitHub backup for score data.");
        } catch (fallbackError) {
          if (signal.aborted) return;
          setNotice("Couldn’t refresh score data. Use Refresh to try again.");
          console.error("Couldn’t load scores", { primaryError, fallbackError });
        }
      } finally {
        if (!signal.aborted) setCompletedKey(refreshKey);
      }
    }

    refresh();
    return () => controller.abort();
  }, [refreshKey]);

  return { scores, isLoading, notice: isLoading ? "" : notice };
}

function downloadScores(scores, format) {
  if (!scores.length) return;
  const csv = format === "csv";
  const content = csv
    ? [
        "timestamp,stock_score,news_score,raw_score",
        ...scores.map((s) => [s.timestamp, s.stock_score, s.news_score, s.raw_score].join(",")),
      ].join("\n")
    : JSON.stringify(scores, null, 2);
  const url = URL.createObjectURL(new Blob([content], { type: csv ? "text/csv" : "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `warstock_scores_${new Date().toISOString().slice(0, 10)}.${format}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function DashboardHeader() {
  return (
    <header className="topbar">
      <div className="topbar-inner frame">
        <div className="brand">
          <span className="brand-mark"><Icon name="pulse" /></span>
          <span>WarStock <span className="brand-type">Terminal</span></span>
        </div>
      </div>
    </header>
  );
}

function TerminalScreen({ children }) {
  return (
    <>
      <CrtOptics />
      <div className="terminal-camera">
        <div className="terminal-room" aria-hidden="true" />
        <div className="terminal-screen">
          <div className="terminal-recess" aria-hidden="true" />
          <div className="terminal-hardware" aria-hidden="true" />
          <div className="terminal-glass">
            <div className="terminal-projection">
              <a className="skip-link" href="#overview">Skip to dashboard</a>
              <div className="terminal-scroll">
                {children}
              </div>
              <CrtReticle />
            </div>
            <div className="terminal-reflection" aria-hidden="true" />
            <div className="terminal-power-light" aria-hidden="true" />
          </div>
        </div>
        <div className="terminal-grain" aria-hidden="true" />
      </div>
    </>
  );
}

export default function App() {
  const [range, setRange] = useState("week");
  const [refreshKey, setRefreshKey] = useState(0);
  const { scores, isLoading, notice } = useScoreFeed(refreshKey);

  const latest = scores.at(-1);
  const latestTime = latest ? Date.parse(latest.timestamp) : null;
  const now = Date.now();
  const isLive = latestTime !== null && now - latestTime <= 2 * 60 * 60 * 1000;
  const archived = latestTime !== null && now - latestTime > day;
  const rangeEnd = archived ? latestTime : now;
  const threshold = rangeEnd - ranges[range].days * day;
  const readings = useMemo(
    () => scores.filter((score) => Date.parse(score.timestamp) >= threshold),
    [scores, threshold]
  );

  const recent = scores.slice(-5);
  const bandAverage = recent.length ? recent.reduce((sum, score) => sum + score.raw_score, 0) / recent.length : null;
  const status = latest ? (isLive ? "Current" : "Delayed") : (isLoading ? "Loading score feed…" : "No score data");
  const refresh = () => {
    if (!isLoading) setRefreshKey((value) => value + 1);
  };
  const exportScores = (format) => downloadScores(readings.slice().reverse(), format);

  return (
    <TerminalScreen>
      <DashboardHeader />
      <main id="overview" className="frame dashboard" tabIndex={-1}>
        <div className="page-heading">
          <div>
            <h1>Signal monitor</h1>
            <p>Experimental index tracking defense stocks and conflict-related news.</p>
          </div>
          <div className="feed-status" role="status">
            <span className={`feed-label ${isLive ? "is-current" : latest ? "is-delayed" : ""}`}>
              <span className="status-dot" aria-hidden="true" />{status}
            </span>
            {latest && <span>Updated <time dateTime={latest.timestamp}>{formatTimestamp(latest.timestamp)}</time></span>}
          </div>
        </div>
        {notice && <p className="notice score-notice" role="status">{notice}</p>}
        <ScoreSummary score={latest} previous={scores.at(-2)} bandAverage={bandAverage} readingCount={recent.length} />
        <div className="primary-grid">
          <ScoreTrend readings={readings} range={range} onRangeChange={setRange} loading={isLoading}
            rangeStart={threshold} rangeEnd={rangeEnd} archiveDate={archived ? formatDate(latestTime) : null} />
          <NewsPanel refreshKey={refreshKey} />
        </div>
        <ScoreHistory key={range} readings={readings} range={range} loading={isLoading} onExport={exportScores} />
        <ScoreMethod bandAverage={bandAverage} />
      </main>
      <footer className="frame footer">
        <p>WarStock Terminal <span aria-hidden="true">·</span> Project by <a href="https://colekreiling.com" target="_blank" rel="noopener noreferrer">Cole Kreiling</a></p>
        <p>Score and news feeds run hourly via GitHub Actions.</p>
        <button className="footer-refresh" type="button" onClick={refresh} disabled={isLoading}>
          <Icon name="refresh" /> {isLoading ? "Refreshing…" : "Refresh feeds"}
        </button>
      </footer>
    </TerminalScreen>
  );
}
