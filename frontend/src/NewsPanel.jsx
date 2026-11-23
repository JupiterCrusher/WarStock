import React, { useEffect, useState } from "react";

const labels = {
  background: "Background / other",
  threats_buildup: "Threats / buildup",
  reported_fighting: "Reported fighting",
};
const fallback = "https://raw.githubusercontent.com/JupiterCrusher/WarStock/main/backend/news.json";

function safeLink(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

async function fetchNews(url, signal) {
  const response = await fetch(url, { cache: "no-store", signal });
  if (!response.ok) throw new Error("News request failed");
  const data = await response.json();
  if (!data || !Array.isArray(data.articles) || !Array.isArray(data.feeds) || !data.timestamp || !Number.isFinite(Date.parse(data.timestamp))) {
    throw new Error("News payload is invalid");
  }
  return data;
}

export default function NewsPanel({ refreshKey }) {
  const [news, setNews] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      try {
        let data;
        try {
          data = await fetchNews("/api/news", controller.signal);
        } catch (firstError) {
          if (controller.signal.aborted) return;
          data = await fetchNews(fallback, controller.signal);
        }
        if (!controller.signal.aborted) setNews(data);
      } catch (err) {
        if (!controller.signal.aborted) setError("News is unavailable. Try Refresh to check again.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [refreshKey]);

  const active = news?.model_state === "active";
  const stale = news && Date.now() - Date.parse(news.timestamp) > 2 * 60 * 60 * 1000;
  const articles = (news?.articles || []).filter(article => !active || filter === "all" || article.label === filter);
  const healthyFeeds = news?.feeds.filter(feed => feed.ok).length || 0;

  return (
    <section className="mb-6 border border-green-800 p-4" aria-labelledby="news-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="news-heading" className="text-lg text-green-200">CONFLICT NEWS</h2>
        <span className="text-xs text-green-500">{active ? "EXPERIMENTAL CLASSIFIER" : "COLLECTING TRAINING DATA"}</span>
      </div>
      <p className="mt-2 text-xs text-green-500">Labels describe news reports. They do not verify events or predict war.</p>
      {loading && <p className="mt-3 text-sm" role="status">Loading news…</p>}
      {error && <p className="mt-3 text-sm text-yellow-300" role="alert">{error} {news ? "Showing the last loaded news." : ""}</p>}
      {news && (
        <>
          <p className="mt-3 text-xs text-green-500">
            Last checked: {new Date(news.timestamp).toLocaleString()} · {healthyFeeds}/{news.feeds.length} feeds available · {news.archive_count} articles saved
          </p>
          {(stale || news.feed_status !== "ok") && (
            <p className="mt-2 border border-yellow-800 p-2 text-sm text-yellow-300" role="status">
              {news.feed_status === "unavailable" ? "News feeds are unavailable. Missing news does not mean no conflict." : news.feed_status === "partial" ? "Some feeds are unavailable. Coverage is incomplete." : "This news snapshot is out of date."}
              {stale && news.feed_status !== "ok" ? " This snapshot is also out of date." : ""}
            </p>
          )}
          {!active && (
            <p className="my-4 text-sm text-green-300">
              {news.model_state === "error" ? "The news classifier is unavailable. Headlines remain unclassified." : "Headlines are ready to label. The classifier will appear after training and testing."}
            </p>
          )}
          {active && (
            <>
              <p className="mt-3 text-xs text-green-500">{news.story_count} unique stories in the last {news.window_hours} hours · Model {news.model_version}</p>
              <div className="my-3 grid gap-2 sm:grid-cols-3">
                {Object.entries(labels).map(([key, name]) => (
                  <div key={key} className="border border-green-900 bg-green-950/40 p-3">
                    <p className="text-xs text-green-400">{name}</p>
                    <p className="mt-1 text-xl text-green-200">{Number.isFinite(news.class_shares?.[key]) ? `${Math.round(news.class_shares[key] * 100)}%` : "—"}</p>
                    <p className="text-xs text-green-600">Share of collected stories</p>
                  </div>
                ))}
              </div>
              <div className="my-3 flex flex-wrap gap-2" aria-label="Filter news">
                {Object.entries({ all: "All", ...labels }).map(([key, name]) => (
                  <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)} className={`border px-3 py-2 text-xs ${filter === key ? "border-green-400 bg-green-800 text-green-100" : "border-green-800 text-green-400 hover:bg-green-950"}`}>
                    {name}
                  </button>
                ))}
              </div>
            </>
          )}
          <ul className="max-h-80 overflow-y-auto divide-y divide-green-900">
            {articles.map(article => {
              const link = safeLink(article.url);
              return (
                <li key={article.id} className="py-3">
                  {link ? <a href={link} target="_blank" rel="noopener noreferrer" className="text-sm text-green-200 underline decoration-green-800 underline-offset-4 hover:text-white">{article.title}</a> : <p className="text-sm text-green-200">{article.title}</p>}
                  <p className="mt-1 text-xs text-green-500">{article.source || "Source not supplied"} · {active ? labels[article.label] || "Unclassified" : "Awaiting training"}</p>
                </li>
              );
            })}
          </ul>
          {!articles.length && <p className="my-4 text-sm text-green-500">{news.feed_status === "unavailable" ? "No fresh news could be retrieved." : "No stories in this view from the last 24 hours."}</p>}
          {articles.length > 0 && <p className="mt-3 text-xs text-green-600">Showing up to 30 recent stories. Class shares use all collected stories in the window.</p>}
        </>
      )}
    </section>
  );
}
