"use client";

import { useEffect, useState } from "react";

export default function CountdownRing({
  startedAt,
  durationMs,
  size = 72,
  tone = "lapis",
  minSizeText = "text-2xl",
}: {
  startedAt: number;
  durationMs: number;
  size?: number;
  tone?: "lapis" | "gold" | "ink";
  minSizeText?: string;
}) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, durationMs - (Date.now() - startedAt))
  );

  useEffect(() => {
    setRemaining(Math.max(0, durationMs - (Date.now() - startedAt)));
    const iv = setInterval(() => {
      const left = Math.max(0, durationMs - (Date.now() - startedAt));
      setRemaining(left);
      if (left <= 0) clearInterval(iv);
    }, 100);
    return () => clearInterval(iv);
  }, [startedAt, durationMs]);

  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const frac = durationMs > 0 ? remaining / durationMs : 0;
  const color = remaining <= 3000 ? "var(--red)" : `var(--${tone === "lapis" ? "lapis" : tone === "gold" ? "gold-deep" : "foreground"})`;
  const seconds = Math.ceil(remaining / 1000);

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      role="timer"
      aria-label={`${seconds}`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--rule)" strokeWidth="3" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
        />
      </svg>
      <span
        className={`absolute inset-0 flex items-center justify-center font-bold tabular-nums ${minSizeText}`}
        style={{ color }}
        dir="ltr"
      >
        {seconds}
      </span>
    </div>
  );
}
