import React from "react";

export const formatDate = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
}).format;

const formatTime = new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format;

export function formatTimestamp(value) {
  const date = new Date(value);
  return `${formatDate(date)} · ${formatTime(date)}`;
}

const iconPaths = {
  pulse: "M2 13h4l2-4 3 9 3-13 3 8h5",
  refresh: "M20 10a8 8 0 1 0 0 4m0-9v5h-5",
  download: "M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4",
  external: "M6 18 18 6M8 6h10v10",
  down: "m6 9 6 6 6-6",
};

export function Icon({ name }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={iconPaths[name]} />
    </svg>
  );
}
