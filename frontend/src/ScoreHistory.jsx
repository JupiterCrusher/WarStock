import React, { useMemo, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Icon, formatDate, formatTimestamp } from "./dashboard";

export const ranges = {
  day: { days: 1, label: "24H", name: "24 hours" },
  week: { days: 7, label: "7D", name: "7 days" },
  month: { days: 30, label: "30D", name: "30 days" },
  year: { days: 365, label: "1Y", name: "1 year" },
};

const chartDates = {
  day: new Intl.DateTimeFormat(undefined, { hour: "numeric" }).format,
  week: new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format,
  month: new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format,
  year: new Intl.DateTimeFormat(undefined, { month: "short", year: "2-digit" }).format,
};
const hour = 60 * 60 * 1000;
const tickSteps = { day: 4 * hour, week: 24 * hour, month: 120 * hour, year: 1440 * hour };
const scoreTicks = [0, 25, 50, 75, 100];
const axisTick = { fill: "var(--muted)", fontSize: 11, fontFamily: "var(--mono)" };
const maxPlotReadings = 900;
const historyPageSize = 80;

function emptyMessage(loading, range) {
  return loading ? "Loading score data…" : `No scores in this ${ranges[range].name} window.`;
}

function plotReadings(readings) {
  if (readings.length <= maxPlotReadings) return readings;

  const first = readings[0];
  const last = readings.at(-1);
  const start = Date.parse(first.timestamp);
  const bucketCount = (maxPlotReadings - 2) / 2;
  const bucketDuration = Math.max(1, (Date.parse(last.timestamp) - start) / bucketCount);
  const buckets = new Array(bucketCount);

  // Plot actual highs and lows within each time bucket so spikes stay visible.
  for (let index = 1; index < readings.length - 1; index += 1) {
    const reading = readings[index];
    const elapsed = Date.parse(reading.timestamp) - start;
    const bucketIndex = Math.min(bucketCount - 1, Math.floor(elapsed / bucketDuration));
    const bucket = buckets[bucketIndex];
    if (!bucket) {
      buckets[bucketIndex] = { low: index, high: index };
      continue;
    }
    if (reading.raw_score < readings[bucket.low].raw_score) bucket.low = index;
    if (reading.raw_score > readings[bucket.high].raw_score) bucket.high = index;
  }

  const samples = [first];
  buckets.forEach(({ low, high }) => {
    samples.push(readings[Math.min(low, high)]);
    if (low !== high) samples.push(readings[Math.max(low, high)]);
  });
  samples.push(last);
  return samples;
}

export function ScoreTrend({ readings, range, loading, onRangeChange, rangeStart, rangeEnd, archiveDate }) {
  const plot = useMemo(() => plotReadings(readings), [readings]);
  const step = tickSteps[range];
  const intervals = Math.floor((rangeEnd - rangeStart) / step);
  const ticks = Array.from({ length: intervals + 1 }, (_, index) => rangeEnd - (intervals - index) * step);

  return (
    <section className="panel trend-panel" aria-labelledby="trend-heading">
      <div className="panel-heading">
        <div>
          <h2 id="trend-heading">Score trend</h2>
          <p className="panel-note">Raw score over time{archiveDate ? ` · Through ${archiveDate}` : ""}</p>
        </div>
        <div className="range-control" role="group" aria-label="Score time range">
          {Object.entries(ranges).map(([key, { label, name }]) => (
            <button type="button" key={key} aria-label={name} aria-pressed={range === key} onClick={() => onRangeChange(key)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="chart">
        {readings.length ? (
          <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={50}>
            <AreaChart
              accessibilityLayer
              data={plot}
              style={{ cursor: "inherit" }}
              margin={{ top: 9, right: 22, bottom: 1, left: 0 }}
            >
              <defs>
                <linearGradient id="score-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.38} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.025} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--grid)" />
              <XAxis dataKey={(score) => Date.parse(score.timestamp)} type="number" scale="time"
                domain={[rangeStart, rangeEnd]} ticks={ticks} minTickGap={14} interval="preserveStartEnd"
                tick={axisTick} tickFormatter={chartDates[range]} tickMargin={10}
                axisLine={{ stroke: "var(--border)" }} tickLine={false} />
              <YAxis domain={[0, 100]} ticks={scoreTicks} width={34} tick={axisTick} tickMargin={9}
                axisLine={false} tickLine={false} />
              <Tooltip
                labelFormatter={formatTimestamp}
                formatter={(value) => Number(value).toFixed(2)}
                contentStyle={{ background: "var(--raised)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13 }}
                cursor={{ stroke: "var(--muted)", strokeDasharray: "3 4" }}
              />
              <Area name="Raw score" type="linear" dataKey="raw_score"
                stroke="var(--accent)" fill="url(#score-fill)" strokeWidth={2.25}
                dot={readings.length === 1} activeDot={{ r: 4, stroke: "var(--surface)" }}
                isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="empty-state" role="status">{emptyMessage(loading, range)}</p>
        )}
      </div>
    </section>
  );
}

export function ScoreHistory({ readings, range, loading, onExport }) {
  const [selectedPage, setSelectedPage] = useState(0);
  const scrollRef = useRef(null);
  const pageCount = Math.ceil(readings.length / historyPageSize);
  const page = Math.min(selectedPage, Math.max(0, pageCount - 1));
  const end = readings.length - page * historyPageSize;
  const start = Math.max(0, end - historyPageSize);
  const rows = readings.slice(start, end).reverse();
  const pageLabels = useMemo(() => Array.from({ length: pageCount }, (_, index) => {
    const newest = readings[readings.length - 1 - index * historyPageSize];
    const oldest = readings[Math.max(0, readings.length - (index + 1) * historyPageSize)];
    return `${index + 1} · ${formatDate(Date.parse(oldest.timestamp))} – ${formatDate(Date.parse(newest.timestamp))}`;
  }), [readings, pageCount]);

  function showPage(index) {
    setSelectedPage(index);
    scrollRef.current.scrollTop = 0;
  }

  return (
    <section id="history" className="panel history-panel" aria-labelledby="history-heading">
      <div className="panel-heading">
        <div className="history-title">
          <h2 id="history-heading">Score history</h2>
          {readings.length > 0 && <span className="history-count">{readings.length.toLocaleString()} readings</span>}
        </div>
        <div className="export-controls" role="group" aria-label="Export score history">
          <button type="button" className="control" aria-label="Export JSON"
            disabled={!readings.length} onClick={() => onExport("json")}>
            <Icon name="download" /> JSON
          </button>
          <button type="button" className="control" aria-label="Export CSV"
            disabled={!readings.length} onClick={() => onExport("csv")}>
            <Icon name="download" /> CSV
          </button>
        </div>
      </div>
      <div ref={scrollRef} className="history-scroll" role="region" aria-label="Score readings" tabIndex={rows.length > 5 ? 0 : undefined}>
        <table aria-labelledby="history-heading">
          <thead>
            <tr>
              <th scope="col">Timestamp</th>
              <th scope="col">Stock signal</th>
              <th scope="col">News signal</th>
              <th scope="col">Raw score</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((score) => (
              <tr key={score.timestamp}>
                <td><time dateTime={score.timestamp}>{formatTimestamp(score.timestamp)}</time></td>
                <td>{Number.isFinite(score.stock_score) ? score.stock_score : "—"}</td>
                <td>{Number.isFinite(score.news_score) ? score.news_score : "—"}</td>
                <td>{score.raw_score.toFixed(2)}</td>
              </tr>
            )) : (
              <tr><td className="table-empty" colSpan={4}>{emptyMessage(loading, range)}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <div className="history-pages" role="group" aria-label="Browse score history">
          <button type="button" className="control" disabled={page === 0} onClick={() => showPage(page - 1)}>
            Previous
          </button>
          <select className="control" aria-label="Score history page" value={page}
            onChange={(event) => showPage(Number(event.target.value))}>
            {pageLabels.map((label, index) => <option key={index} value={index}>{label}</option>)}
          </select>
          <button type="button" className="control" disabled={page === pageCount - 1} onClick={() => showPage(page + 1)}>
            Next
          </button>
        </div>
      )}
    </section>
  );
}
