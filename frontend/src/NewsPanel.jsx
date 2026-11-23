import React, { useEffect, useId, useRef, useState } from "react";
import { Icon, formatTimestamp } from "./dashboard";
import "./crt-news-filter.css";

const labels = {
  background: "Background / other",
  threats_buildup: "Threats / buildup",
  reported_fighting: "Reported fighting",
};
const filterOptions = Object.entries({ all: "All labels", ...labels });
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

function NewsFilter({ value, onChange }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const pickerRef = useRef(null);
  const triggerRef = useRef(null);
  const listRef = useRef(null);
  const optionRefs = useRef([]);
  const selectedIndex = filterOptions.findIndex(([key]) => key === value);

  useEffect(() => {
    if (!open) return;

    optionRefs.current[selectedIndex]?.focus({ preventScroll: true });
    listRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });

    function dismissOutside(event) {
      if (!pickerRef.current?.contains(event.target)) setOpen(false);
    }

    document.addEventListener("pointerdown", dismissOutside);
    return () => document.removeEventListener("pointerdown", dismissOutside);
  }, [open, selectedIndex]);

  function dismiss() {
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  }

  function choose(key) {
    dismiss();
    if (key !== value) onChange(key);
  }

  function handleTriggerKey(event) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    if (open) optionRefs.current[selectedIndex]?.focus();
    else setOpen(true);
  }

  function handleListKey(event) {
    if (event.key === "Escape" || (event.key === "Tab" && event.shiftKey)) {
      event.preventDefault();
      dismiss();
      return;
    }

    const index = optionRefs.current.indexOf(event.target);
    if (index < 0) return;

    switch (event.key) {
      case "ArrowDown":
        optionRefs.current[(index + 1) % filterOptions.length]?.focus();
        break;
      case "ArrowUp":
        optionRefs.current[(index + filterOptions.length - 1) % filterOptions.length]?.focus();
        break;
      case "Home":
        optionRefs.current[0]?.focus();
        break;
      case "End":
        optionRefs.current.at(-1)?.focus();
        break;
      case "Enter":
      case " ":
        choose(filterOptions[index][0]);
        break;
      default:
        return;
    }

    event.preventDefault();
  }

  return (
    <div className="news-filter" ref={pickerRef} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <span id={`${id}-label`}>Filter stories</span>
      <div className="news-filter-picker">
        <button type="button" className="news-filter-trigger" ref={triggerRef}
          aria-labelledby={`${id}-label ${id}-value`} aria-haspopup="listbox" aria-expanded={open}
          aria-controls={open ? `${id}-list` : undefined} onClick={() => setOpen(!open)} onKeyDown={handleTriggerKey}>
          <span id={`${id}-value`}>{filterOptions[selectedIndex][1]}</span>
          <Icon name="down" />
        </button>
        {open && (
          <ul id={`${id}-list`} className="news-filter-options" role="listbox"
            aria-labelledby={`${id}-label`} ref={listRef} onKeyDown={handleListKey}
            onMouseDown={(event) => event.preventDefault()}>
            {filterOptions.map(([key, name], index) => (
              <li key={key} role="option" aria-selected={value === key} tabIndex={-1}
                ref={(option) => { optionRefs.current[index] = option; }} onClick={() => choose(key)}>
                {name}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function NewsPanel({ refreshKey }) {
  const [news, setNews] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      try {
        let data;
        try {
          data = await fetchNews("/api/news", controller.signal);
        } catch {
          if (controller.signal.aborted) return;
          data = await fetchNews(fallback, controller.signal);
        }
        if (!controller.signal.aborted) setNews(data);
      } catch {
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
  const visibleArticles = showAll ? articles : articles.slice(0, 3);
  const healthyFeeds = news?.feeds.filter(feed => feed.ok).length || 0;
  const feedNotice = {
    unavailable: "News feeds are unavailable. Coverage may have gaps.",
    partial: "Some feeds are unavailable. Coverage is incomplete.",
  }[news?.feed_status];

  return (
    <section id="news" className="panel news-panel" aria-labelledby="news-heading">
      <div className="panel-heading">
        <h2 id="news-heading">Conflict news</h2>
        {news && <span className={`news-status ${active ? "classifier-active" : ""}`}>
          {active ? "Experimental classifier" : news.model_state === "error" ? "Classifier unavailable" : "Collecting training data"}
        </span>}
      </div>
      {loading && !news && <p className="empty-state" role="status">Loading news…</p>}
      {error && <p className="notice" role="alert">{error} {news ? "Showing the last loaded news." : ""}</p>}
      {news && (
        <>
          <p className="panel-note news-meta">
            <span>{healthyFeeds}/{news.feeds.length} feeds available</span>
            <time dateTime={news.timestamp}>{formatTimestamp(news.timestamp)}</time>
          </p>
          {(stale || feedNotice) && (
            <p className="notice" role="status">{feedNotice} {stale ? "This news snapshot is out of date." : ""}</p>
          )}
          {active && (
            <NewsFilter value={filter} onChange={(key) => {
              setFilter(key);
              setShowAll(false);
            }} />
          )}
          <ul id="headlines" className={`articles ${showAll ? "is-expanded" : ""}`} key={filter} aria-label="Headlines"
            tabIndex={showAll && articles.length > 3 ? 0 : undefined}>
            {visibleArticles.map((article) => {
              const link = safeLink(article.url);
              const sourceSuffix = ` - ${article.source}`;
              const title = article.source && article.title.endsWith(sourceSuffix)
                ? article.title.slice(0, -sourceSuffix.length)
                : article.title;
              return (
                <li key={article.id} className="article">
                  {link ? (
                    <a href={link} target="_blank" rel="noopener noreferrer">
                      <span>{title}</span><Icon name="external" />
                    </a>
                  ) : <p className="article-title">{title}</p>}
                  <p className="article-meta">
                    <span>{article.source || "Source not supplied"}</span>
                    {active && <span className="article-label">{labels[article.label] || "Unclassified"}</span>}
                  </p>
                </li>
              );
            })}
          </ul>
          {!articles.length && <p className="empty-state">{news.feed_status === "unavailable" ? "No fresh news could be retrieved." : "No recent headlines match this view."}</p>}
          <div className="news-actions">
            {articles.length > 3 && (
              <button type="button" aria-expanded={showAll} aria-controls="headlines" onClick={() => setShowAll(!showAll)}>
                {showAll ? "Show fewer headlines" : `Show all ${articles.length} headlines`}
              </button>
            )}
            <details className="news-details">
              <summary>Feed details <Icon name="down" /></summary>
              <div className="news-details-body">
                {active ? (
                  <>
                    <p>Labels describe news coverage only. Shares use all {news.story_count} collected stories from the last {news.window_hours} hours.</p>
                    <dl className="class-shares">
                      {Object.entries(labels).map(([key, name]) => (
                        <div key={key}>
                          <dt>{name}</dt>
                          <dd>{Number.isFinite(news.class_shares?.[key]) ? `${Math.round(news.class_shares[key] * 100)}%` : "—"}</dd>
                        </div>
                      ))}
                    </dl>
                    <p>Model {news.model_version}</p>
                  </>
                ) : (
                  <p>{news.model_state === "error" ? "Headlines are unclassified while the model is unavailable." : "Headlines will show labels once the classifier completes training and testing."}</p>
                )}
                <p>{news.archive_count?.toLocaleString() ?? "—"} articles saved. The feed shows up to 30 recent headlines.</p>
              </div>
            </details>
          </div>
        </>
      )}
    </section>
  );
}
