import React, { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const fetchURL =
  "https://raw.githubusercontent.com/JupiterCrusher/WarStock/main/backend/scores.json";

function formatTimestamp(iso) {
  const date = new Date(iso);
  return date.toLocaleString();
}

export default function App() {
  const [scores, setScores] = useState([]);

  useEffect(() => {
    fetch(fetchURL)
      .then((res) => res.json())
      .then((data) => setScores(data))
      .catch((err) => console.error("Fetch failed:", err));
  }, []);

  const latest = scores[scores.length - 1];
  const previous = scores[scores.length - 2];
  const change = latest && previous ? (latest.raw_score - previous.raw_score).toFixed(2) : "0.00";

  return (
    <div className="bg-black text-green-400 font-mono min-h-screen p-4">
      <h1 className="text-2xl mb-2 border-b border-green-700 pb-1">
        WARSTOCK TERMINAL ▐ WW3 RISK MONITOR
      </h1>

      {latest && (
        <div className="mb-4">
          <p className="text-xl">
            RISK INDEX: <span className="text-green-200">{latest.raw_score}</span>
            {change > 0 ? ` ↑ ${change}` : change < 0 ? ` ↓ ${change}` : " ↔ 0.00"}
          </p>
          <p className="text-sm text-green-600">
            DEFCON LEVEL:{" "}
            {latest.raw_score >= 80 ? 1 : latest.raw_score >= 60 ? 2 : latest.raw_score >= 40 ? 3 : latest.raw_score >= 20 ? 4 : 5}
          </p>
          <p className="text-xs text-green-600">Last updated: {formatTimestamp(latest.timestamp)}</p>
        </div>
      )}

      <div className="bg-green-900 p-2 mb-4">
        <h2 className="text-sm mb-1">RAW SCORE GRAPH</h2>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={scores}>
            <XAxis dataKey="timestamp" tick={false} hide />
            <YAxis domain={[0, 100]} tick={{ fill: "#0f0" }} />
            <Tooltip contentStyle={{ backgroundColor: "#003300", borderColor: "#0f0" }} labelFormatter={formatTimestamp} />
            <Line type="monotone" dataKey="raw_score" stroke="#0f0" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {latest && (
        <div className="text-sm">
          <p>STOCK SIGNAL: {latest.stock_score}</p>
          <p>NEWS SIGNAL: {latest.news_score}</p>
        </div>
      )}

      <div className="mt-4 border-t border-green-700 pt-2 text-xs text-green-600">
        ↳ press [X] to export logs | [Z] to refresh feed (non-functional)
      </div>
    </div>
  );
}
