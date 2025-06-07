import React, { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const fetchURL =
  "https://raw.githubusercontent.com/JupiterCrusher/WarStock/main/backend/scores.json";

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
  const [scores, setScores] = useState([]);
  const [range, setRange] = useState("week");
  const ranges = { week: 7, month: 30, year: 365 };

  const fetchScores = () => {
    fetch(fetchURL)
      .then((res) => res.json())
      .then((data) => setScores(data))
      .catch((err) => console.error("Fetch failed:", err));
  };

  useEffect(() => {
    fetchScores();

    const handleKey = (e) => {
      if (e.key === "z" || e.key === "Z") fetchScores();
      if (e.key === "x" || e.key === "X") exportJSON();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const exportJSON = () => {
    const filename = `warstock_scores_${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    download(JSON.stringify(scores, null, 2), filename, "application/json");
  };

  const exportCSV = () => {
    if (!scores.length) return;
    const header = Object.keys(scores[0]).join(",");
    const rows = scores.map((s) => Object.values(s).join(",")).join("\n");
    const csv = [header, rows].join("\n");
    const filename = `warstock_scores_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    download(csv, filename, "text/csv");
  };

  const latest = scores[scores.length - 1];
  const previous = scores[scores.length - 2];
  const change = latest && previous ? (latest.raw_score - previous.raw_score).toFixed(2) : "0.00";
  const defcon = latest
    ? latest.raw_score >= 80
      ? 1
      : latest.raw_score >= 60
      ? 2
      : latest.raw_score >= 40
      ? 3
      : latest.raw_score >= 20
      ? 4
      : 5
    : 5;
  const defconColor =
    defcon === 1
      ? "text-red-500"
      : defcon === 2
      ? "text-orange-400"
      : defcon === 3
      ? "text-yellow-300"
      : defcon === 4
      ? "text-green-300"
      : "text-blue-300";
  const isLive = latest
    ? Date.now() - new Date(latest.timestamp).getTime() <= 2 * 60 * 60 * 1000
    : false;

  const filteredScores = scores.filter((s) => {
    const threshold = Date.now() - ranges[range] * 24 * 60 * 60 * 1000;
    return new Date(s.timestamp).getTime() >= threshold;
  });

  return (
    <div className="relative scanlines bg-black text-green-400 font-mono min-h-screen p-4">
      <div className="absolute top-2 right-2">
        <span
          className={`inline-block h-3 w-3 rounded-full animate-pulse ${isLive ? "bg-green-500" : "bg-red-500"}`}
        ></span>
      </div>
      <h1 className="text-2xl mb-2 border-b border-green-700 pb-1">
        WARSTOCK TERMINAL ▐ WW3 RISK MONITOR
      </h1>

      {latest && (
        <div className="mb-4">
          <p className="text-xl">
            RISK INDEX: <span className="text-green-200">{latest.raw_score}</span>
            {change > 0 ? ` ↑ ${change}` : change < 0 ? ` ↓ ${change}` : " ↔ 0.00"}
          </p>
          <p className={`text-sm font-bold ${defconColor} ${defcon <= 2 ? "animate-pulse" : ""}`}>DEFCON {defcon}</p>
          <p className="text-xs text-green-600">Last updated: {formatTimestamp(latest.timestamp)}</p>
        </div>
      )}

      <div className="flex gap-2 mb-2">
        {[
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

      <div className="bg-green-900 p-2 mb-4">
        <h2 className="text-sm mb-1">RAW SCORE GRAPH</h2>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={filteredScores}>
            <XAxis dataKey="timestamp" tick={false} hide />
            <YAxis domain={[0, 100]} tick={{ fill: "#0f0" }} />
            <Tooltip contentStyle={{ backgroundColor: "#003300", borderColor: "#0f0" }} labelFormatter={formatTimestamp} />
            <Line type="monotone" dataKey="raw_score" stroke="#0f0" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="h-48 overflow-y-auto mb-4 border border-green-700">
        <table className="w-full text-green-500 text-sm font-mono">
          <thead className="sticky top-0 bg-black">
            <tr>
              <th className="px-2 text-left border-b border-green-700">Time</th>
              <th className="px-2 text-left border-b border-green-700">Stock</th>
              <th className="px-2 text-left border-b border-green-700">News</th>
              <th className="px-2 text-left border-b border-green-700">Raw</th>
            </tr>
          </thead>
          <tbody>
            {filteredScores.map((s, i) => (
              <tr key={i} className="whitespace-nowrap">
                <td className="px-2 py-0.5">{formatTimestamp(s.timestamp)}</td>
                <td className="px-2 py-0.5">{s.stock_score}</td>
                <td className="px-2 py-0.5">{s.news_score}</td>
                <td className="px-2 py-0.5">{s.raw_score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {latest && (
        <div className="text-sm">
          <p>STOCK SIGNAL: {latest.stock_score}</p>
          <p>NEWS SIGNAL: {latest.news_score}</p>
        </div>
      )}

      <div className="flex gap-2 my-4">
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
      </div>

      <div className="mt-4 border-t border-green-700 pt-2 text-xs text-green-600">
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

      <footer className="mt-6 border-t border-green-700 pt-2 text-center text-green-600 text-sm">
        Project by{' '}
        <a href="https://colekreiling.com" target="_blank" rel="noopener noreferrer" className="underline">
          Cole Kreiling
        </a>
      </footer>
    </div>
  );
}
