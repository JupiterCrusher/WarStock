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
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(onComplete, (totalTime + 0.5) * 1000);
    return () => clearTimeout(timer);
  }, [onComplete, totalTime]);

  return (
    <div
      className="fixed inset-0 bg-black flex flex-col items-center justify-center p-4 text-green-400 text-xl sm:text-3xl font-mono z-50 boot-overlay w-full overflow-hidden text-center min-h-[100dvh]"
      style={{ animationDelay: `${totalTime}s` }}
    >
      {messages.map((msg, i) => {
        const typingDuration = `${msg.length * charDuration}s`;
        const delay = `${delays[i]}s`;
        const blinkLoops = i === messages.length - 1 ? 'infinite' : 2;
        return (
          <p
            key={i}
            className="boot-line mx-auto text-center"
            style={{
              "--width": `${msg.length}ch`,
              "--steps": msg.length,
              animation: `typing ${typingDuration} steps(var(--steps)) ${delay} forwards, blink 0.75s step-end ${delay} ${blinkLoops}`
            }}
          >
            {msg}
          </p>
        );
      })}
    </div>
  );
}
