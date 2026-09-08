"use client";

import { useEffect, useRef, useState } from "react";

const TICK_HREF = "/sounds/tick.wav";
const TICK_FROM_SEC = 5; // tick during the final seconds…
const TICK_URGENT_SEC = 3; // …and speed the tick up when the ring turns red

export default function CountdownRing({
  startedAt,
  durationMs,
  size = 72,
  tone = "lapis",
  minSizeText = "text-2xl",
  sound = false,
  onEnd,
  variant = "ring",
  className = "",
}: {
  startedAt: number;
  durationMs: number;
  size?: number;
  tone?: "lapis" | "gold" | "ink";
  minSizeText?: string;
  sound?: boolean;
  onEnd?: () => void;
  /** "bar": full-width depleting bar + big seconds numeral, for the dark host stage */
  variant?: "ring" | "bar";
  className?: string;
}) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, durationMs - (Date.now() - startedAt))
  );

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSecRef = useRef<number | null>(null);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const endedRef = useRef(false);

  // browsers block audio until a gesture happened in the page —
  // prime the element on the first pointerdown, silently
  useEffect(() => {
    if (!sound) return;
    if (!audioRef.current) {
      audioRef.current = new Audio(TICK_HREF);
      audioRef.current.preload = "auto";
    }
    const audio = audioRef.current;
    const unlock = () => {
      audio
        .play()
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
        })
        .catch(() => undefined);
      window.removeEventListener("pointerdown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    return () => window.removeEventListener("pointerdown", unlock);
  }, [sound]);

  useEffect(() => {
    // countdown tick: one per second in the final stretch, faster once urgent
    const tickFor = (left: number) => {
      const sec = Math.ceil(left / 1000);
      const last = lastSecRef.current;
      lastSecRef.current = sec;
      const audio = audioRef.current;
      if (!sound || !audio || last === null || sec >= last || sec < 1 || sec > TICK_FROM_SEC) {
        return;
      }
      audio.playbackRate = sec <= TICK_URGENT_SEC ? 1.45 : 1;
      audio.currentTime = 0;
      audio.play().catch(() => undefined);
    };

    // re-seed the ref so a new question never compares against the old one
    lastSecRef.current = null;
    endedRef.current = false;
    const left0 = Math.max(0, durationMs - (Date.now() - startedAt));
    setRemaining(left0);
    tickFor(left0);
    if (left0 <= 0) {
      endedRef.current = true;
      onEndRef.current?.();
    }
    const iv = setInterval(() => {
      const left = Math.max(0, durationMs - (Date.now() - startedAt));
      setRemaining(left);
      tickFor(left);
      if (left <= 0) {
        clearInterval(iv);
        if (!endedRef.current) {
          endedRef.current = true;
          onEndRef.current?.();
        }
      }
    }, 100);
    return () => clearInterval(iv);
  }, [startedAt, durationMs, sound]);

  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const frac = durationMs > 0 ? remaining / durationMs : 0;
  const urgent = remaining <= 3000;
  const color =
    variant === "bar"
      ? urgent
        ? "var(--red)"
        : "var(--gold-deep)"
      : urgent
        ? "var(--red)"
        : `var(--${tone === "lapis" ? "lapis" : tone === "gold" ? "gold-deep" : "foreground"})`;
  const seconds = Math.ceil(remaining / 1000);

  if (variant === "bar") {
    return (
      <div className={`w-full ${className}`} role="timer" aria-label={`${seconds} ثانية`}>
        <span className="block text-4xl font-bold tabular-nums" style={{ color }} dir="ltr" aria-hidden="true">
          {seconds}
        </span>
        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-[color:var(--rule)]">
          <div
            className="h-full rounded-full"
            style={{
              background: color,
              transform: `scaleX(${frac})`,
              transformOrigin: "right",
              transition: "transform 120ms linear",
            }}
          />
        </div>
      </div>
    );
  }

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
