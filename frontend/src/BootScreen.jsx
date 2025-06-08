import React, { useEffect } from "react";

export default function BootScreen({ onComplete }) {
  const messages = [
    "Booting WarStock…",
    "Syncing data…",
    "Press Z to refresh."
  ];

  const charDuration = 0.05; // seconds per character
  const lineDelay = 0.3; // pause between lines
  const delays = [];
  let totalTime = 0;
  for (const msg of messages) {
    delays.push(totalTime);
    totalTime += msg.length * charDuration + lineDelay;
  }

  useEffect(() => {
    const timer = setTimeout(onComplete, (totalTime + 0.5) * 1000);
    return () => clearTimeout(timer);
  }, [onComplete, totalTime]);

  return (
    <div
      className="fixed inset-0 bg-black flex flex-col items-center justify-center text-green-400 text-xl font-mono z-50 boot-overlay"
      style={{ animationDelay: `${totalTime}s` }}
    >
      {messages.map((msg, i) => {
        const typingDuration = `${msg.length * charDuration}s`;
        return (
          <p
            key={i}
            className="boot-line"
            style={{
              animationDelay: `${delays[i]}s`,
              "--width": `${msg.length}ch`,
              "--steps": msg.length,
              animation: `typing ${typingDuration} steps(var(--steps)) forwards, blink 0.75s step-end infinite`
            }}
          >
            {msg}
          </p>
        );
      })}
    </div>
  );
}
