import React, { useEffect, useState } from "react";
import BootScreen from "./BootScreen";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const fetchURL = "/api/scores";
const rawScoresURL =
  "https://raw.githubusercontent.com/JupiterCrusher/WarStock/main/backend/scores.json";

function normalizeScores(data) {
  if (!Array.isArray(data)) {
    const message = data?.error ? `Scores endpoint error: ${data.error}` : "Scores payload was not an array.";
    throw new Error(message);
  }

  return data
    .filter((score) => score?.timestamp && Number.isFinite(Number(score.raw_score)))
    .map((score) => ({
      ...score,
      stock_score: Number(score.stock_score),
      news_score: Number(score.news_score),
      raw_score: Number(score.raw_score),
    }))
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

async function loadScores(url) {
  const response = await fetch(url, { cache: "no-store" });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Scores request failed (${response.status})`);
  }

  try {
    return normalizeScores(JSON.parse(text));
  } catch (error) {
    if (text.trim().startsWith("<")) {
      throw new Error("Scores endpoint returned HTML instead of JSON.");
    }
    throw error;
  }
}

function download(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatTimestamp(iso) {
  const date = new Date(iso);
  return date.toLocaleString();
}

export default function App() {
  const [boot, setBoot] = useState(true);
  const [scores, setScores] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [range, setRange] = useState("week");
  const ranges = { day: 1, week: 7, month: 30, year: 365 };

  const fetchScores = async () => {
    setIsLoading(true);
    setFetchError("");

    try {
      setScores(await loadScores(fetchURL));
    } catch (primaryError) {
      try {
        setScores(await loadScores(rawScoresURL));
        setFetchError(`Using direct GitHub fallback: ${primaryError.message}`);
      } catch (fallbackError) {
        const message = `Fetch failed: ${fallbackError.message}`;
        setFetchError(message);
        console.error(message, { primaryError, fallbackError });
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const handleMouse = (e) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 10;
      const y = (e.clientY / window.innerHeight - 0.5) * 10;
      document.documentElement.style.setProperty("--parallax-x", `${x}px`);
      document.documentElement.style.setProperty("--parallax-y", `${y}px`);
    };
    window.addEventListener("mousemove", handleMouse);
    return () => window.removeEventListener("mousemove", handleMouse);
  }, []);

  useEffect(() => {
    fetchScores();

    const bootTimer = setTimeout(() => setBoot(false), 5600);

    const handleKey = (e) => {
      if (e.key === "z" || e.key === "Z") fetchScores();
      if (e.key === "x" || e.key === "X") exportJSON();
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      clearTimeout(bootTimer);
    };
  }, []);

  const exportJSON = () => {
    const filename = `warstock_scores_${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    download(
      JSON.stringify(filteredScores, null, 2),
      filename,
      "application/json"
    );
  };

  const exportCSV = () => {
    if (!filteredScores.length) return;
    const header = "timestamp,stock_score,news_score,raw_score";
    const rows = filteredScores
      .map((s) => [s.timestamp, s.stock_score, s.news_score, s.raw_score].join(","))
      .join("\n");
    const csv = [header, rows].join("\n");
    const filename = `warstock_scores_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    download(csv, filename, "text/csv");
  };

  const latest = scores[scores.length - 1];
  const previous = scores[scores.length - 2];
  const change =
    latest && previous ? (latest.raw_score - previous.raw_score).toFixed(2) : "0.00";

  const movingAvg =
    scores.slice(-5).reduce((sum, s) => sum + s.raw_score, 0) /
    (scores.slice(-5).length || 1);
  const prevMovingAvg =
    scores.slice(-6, -1).reduce((sum, s) => sum + s.raw_score, 0) /
    (scores.slice(-6, -1).length || 1);
  const calcDefcon = (score) =>
    score >= 80
      ? 1
      : score >= 60
      ? 2
      : score >= 40
      ? 3
      : score >= 20
      ? 4
      : 5;

  const defcon = latest ? calcDefcon(movingAvg) : 5;
  const prevDefcon = previous ? calcDefcon(prevMovingAvg) : defcon;
  const defconChanged = defcon !== prevDefcon;
  const isLive = latest
    ? Date.now() - new Date(latest.timestamp).getTime() <= 2 * 60 * 60 * 1000
    : false;

  const threshold = Date.now() - ranges[range] * 24 * 60 * 60 * 1000;
  const filteredScores = scores
    .filter((s) => new Date(s.timestamp).getTime() >= threshold)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return (
    <div className="relative scanlines parallax bg-black text-green-400 font-mono min-h-screen p-4">
      {boot && <BootScreen onComplete={() => setBoot(false)} />}
      <div className="absolute top-2 right-2">
        <span
          className={`inline-block h-3 w-3 rounded-full animate-pulse ${isLive ? "bg-green-500" : "bg-red-500"}`}
        ></span>
      </div>
      <h1 className="text-xl mb-4 text-center border-b border-green-700 pb-1">
        WARSTOCK TERMINAL ▐ WW3 RISK MONITOR
      </h1>

        {latest && (
          <section className="mb-6 text-center">
            <div
              className={`risk-index text-6xl font-bold text-green-200 ${
                change !== "0.00" ? "animate-scale" : ""
              }`}
            >
              {latest.raw_score}
              <span className="text-green-200/50 text-3xl ml-1">/100</span>
            </div>
            <p
              className={`mt-1 text-lg text-green-300 ${
                defconChanged ? "animate-pulse" : ""
              }`}
            >
              DEFCON {defcon}
            </p>
            <p className="text-sm text-green-400 mt-1">
              STOCK SIGNAL: {latest.stock_score} | NEWS SIGNAL: {latest.news_score}
            </p>
            <p className="text-xs text-green-600">
              Last updated: {formatTimestamp(latest.timestamp)}
            </p>
          </section>
        )}
      {!latest && (
        <section className="mb-6 border border-green-800 p-3 text-center text-green-300">
          {isLoading ? "Loading score feed..." : "No score data is available."}
        </section>
      )}
      {fetchError && (
        <section className="mb-4 border border-yellow-700 bg-yellow-950/40 p-2 text-sm text-yellow-300">
          {fetchError}
        </section>
      )}
      <section className="mb-4 p-2 border-t border-b border-green-800">
        <div className="flex gap-2 mb-2">
        {[
          ["day", "Day"],
          ["week", "Week"],
          ["month", "Month"],
          ["year", "Year"],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setRange(key)}
            className={`px-2 py-1 border border-green-700 ${
              range === key ? "bg-green-600" : "bg-green-800 hover:bg-green-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="bg-green-900/70 p-2">
        <h2 className="text-sm mb-1">RAW SCORE GRAPH</h2>
        {filteredScores.length ? (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={filteredScores.slice().reverse()}>
              <XAxis dataKey="timestamp" tick={false} hide />
              <YAxis domain={[0, 100]} tick={{ fill: "#0f0" }} />
              <Tooltip contentStyle={{ backgroundColor: "#003300", borderColor: "#0f0" }} labelFormatter={formatTimestamp} />
              <Line type="monotone" dataKey="raw_score" stroke="#0f0" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-[200px] items-center justify-center border border-green-800 text-green-500">
            {isLoading ? "Loading graph data..." : `No scores in the selected ${range} range.`}
          </div>
        )}
      </div>
      </section>

      <section className="h-48 overflow-y-auto overflow-x-auto mb-4 border border-green-800 p-2">
        <table className="w-full text-green-500 text-sm font-mono">
          <thead className="sticky top-0 bg-black">
            <tr>
              <th className="px-2 text-left border-b border-green-700">Timestamp</th>
              <th className="px-2 text-left border-b border-green-700">Stock</th>
              <th className="px-2 text-left border-b border-green-700">News</th>
              <th className="px-2 text-left border-b border-green-700">Raw</th>
            </tr>
          </thead>
          <tbody>
            {filteredScores.length ? (
              filteredScores.map((s, i) => (
                <tr key={i} className="whitespace-nowrap">
                  <td className="px-2 py-0.5">{formatTimestamp(s.timestamp)}</td>
                  <td className="px-2 py-0.5">{s.stock_score}</td>
                  <td className="px-2 py-0.5">{s.news_score}</td>
                  <td className="px-2 py-0.5">{s.raw_score}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-2 py-4 text-center text-green-600" colSpan="4">
                  {isLoading ? "Loading rows..." : `No scores in the selected ${range} range.`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="flex gap-2 my-4 p-2 border border-green-800">
        <button
          onClick={fetchScores}
          className="px-2 py-1 bg-green-800 text-green-200 hover:bg-green-700"
        >
          ↻ Refresh
        </button>
        <button
          onClick={exportJSON}
          className="px-2 py-1 bg-green-800 text-green-200 hover:bg-green-700"
        >
          Export JSON
        </button>
        <button
          onClick={exportCSV}
          className="px-2 py-1 bg-green-800 text-green-200 hover:bg-green-700"
        >
          Export CSV
        </button>
      </section>

      <div className="mt-4 border-t border-green-800 pt-2 text-xs text-green-600">
        ↳ press [X] to export history | [Z] to refresh feed
      </div>

      <div className="mt-6">
        <h2 className="text-lg mb-1">About WarStock</h2>
        <p className="text-sm text-green-500">
          WarStock is an experimental terminal that monitors global escalation
          signals by combining defense stock movement with keyword-based news
          parsing. Data updates hourly via GitHub Actions. Built using React,
          Tailwind CSS, and Recharts.
        </p>
      </div>

      <footer className="mt-6 border-t border-green-800 pt-2 text-center text-green-600 text-sm">
        Project by{' '}
        <a href="https://colekreiling.com" target="_blank" rel="noopener noreferrer" className="underline">
          Cole Kreiling
        </a>
      </footer>
    </div>
  );
}
