import React, { useEffect } from "react";

export default function BootScreen({ onComplete }) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 4500);
    return () => clearTimeout(timer);
  }, [onComplete]);

  const messages = [
    "Booting WarStock Terminal…",
    "Syncing threat data…",
    "Ready. Press Z to refresh."
  ];

  return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center text-green-400 text-xl font-mono z-50 boot-overlay">
      {messages.map((msg, i) => (
        <p
          key={i}
          className="boot-line"
          style={{ animationDelay: `${i * 1.2}s` }}
        >
          {msg}
        </p>
      ))}
    </div>
  );
}
