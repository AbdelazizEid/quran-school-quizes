"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { seededShuffle } from "@/lib/shuffle";

export type BubblePerson = { id: string; nickname: string; totalScore: number };
export type BubbleTone = "neutral" | "lit" | "correct" | "wrong" | "asleep" | "deflated";

// Lighting speaks the board's language: gold ink emphasis, never a glow.
// A lit bubble is a name the teacher circled in gold chalk (ADR 0004: lit
// says "answered", never "what they picked" until reveal).
const toneFace: Record<BubbleTone, string> = {
  neutral: "border-[color:var(--rule)] bg-[color:var(--background)] text-[color:var(--foreground)]",
  lit: "border-[color:var(--gold)] bg-[color:var(--wash)] text-[color:var(--foreground)] bubble-lit",
  correct:
    "border-[color:var(--green)] bg-[color:var(--green-wash)] text-[color:var(--foreground)] bubble-pop",
  wrong:
    "border-[color:var(--red)] bg-[color:var(--background)] text-[color:var(--foreground)] result-shake",
  asleep: "border-[color:var(--rule)] bg-[color:var(--background)] text-[color:var(--muted-ink)] opacity-60",
  deflated: "border-[color:var(--rule)] bg-transparent text-[color:var(--muted-ink)]",
};

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * One participant's bubble: an ink-drawn orb with the nickname inside.
 * Layers, outside in: flow position (layout animates the converge/re-shuffle
 * moments) → scatter (loose in the lobby, docked in the strip) → idle drift
 * (never frozen, never synchronized) → the drawn circle.
 */
function Bubble({
  person,
  tone,
  variant,
  points,
}: {
  person: BubblePerson;
  tone: BubbleTone;
  variant: "float" | "strip";
  points?: { text: string; delay?: number } | null;
}) {
  const reduced = useReducedMotion();
  const h = useMemo(() => hash(person.id), [person.id]);

  const drift = useMemo(() => {
    const dy = 4 + (h % 5);
    const dx = 3 + ((h >> 3) % 5);
    return {
      dy,
      dx,
      duration: 3.6 + ((h >> 6) % 18) / 10,
      delay: ((h >> 11) % 20) / 10,
    };
  }, [h]);

  const scatter =
    variant === "float"
      ? { x: ((h >> 2) % 60) - 30, y: ((h >> 5) % 36) - 18, rotate: ((h >> 8) % 12) - 6 }
      : { x: 0, y: 0, rotate: 0 };

  const drifting = !reduced;

  return (
    <motion.div layout="position" transition={{ type: "spring", stiffness: 150, damping: 22 }}>
      <motion.div
        animate={{ ...scatter, scale: tone === "deflated" ? 0.88 : 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 22 }}
      >
        <motion.div
          animate={
            drifting
              ? { y: [0, -drift.dy, 0, drift.dy / 2, 0], x: [0, drift.dx, 0, -drift.dx / 2, 0] }
              : { x: 0, y: 0 }
          }
          transition={{ duration: drift.duration, repeat: Infinity, ease: "easeInOut", delay: drift.delay }}
        >
          <motion.div
            layoutId={`podium:${person.id}`}
            transition={{ type: "spring", stiffness: 55, damping: 17 }}
            className={`relative flex h-[72px] w-[72px] items-center justify-center rounded-full border-2 text-center transition-[background-color,border-color,color,opacity] duration-500 ease-out ${toneFace[tone]}`}
          >
            {points && (              <motion.span
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: [0, 1, 1, 1, 0], y: -26 }}
                transition={{ duration: 2.6, ease: "easeOut", delay: points.delay ?? 0.35 }}
                dir="ltr"
                className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm bg-[color:var(--gold)] px-1.5 py-0.5 text-xs font-bold tabular-nums text-[color:var(--background)]"
              >
                {points.text}
              </motion.span>
            )}
            {tone === "correct" && (
              <span className="absolute -top-1.5 -start-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[color:var(--green)] bg-[color:var(--background)]">
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                  <path
                    d="M2.5 6.5 L5 9 L9.5 3.5"
                    fill="none"
                    stroke="var(--green-deep)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            )}
            {tone === "wrong" && (
              <span className="absolute -top-1.5 -start-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[color:var(--red)] bg-[color:var(--background)]">
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                  <path
                    d="M2 2 L8 8 M8 2 L2 8"
                    fill="none"
                    stroke="var(--red)"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            )}
            <span className="max-w-[58px] truncate px-1 text-xs font-semibold leading-snug">
              {person.nickname}
            </span>
          </motion.div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

/**
 * Every participant, all session long. Lobby: scattered across open space.
 * Question phases: docked in the strip under the header, drifting in place.
 * One mounted instance per page so the lobby → strip transition animates.
 */
export function Bubbles({
  people,
  toneFor,
  variant,
  orderSeed,
  dimmed,
  pointsByBubble,
  ariaLabel,
  className = "",
}: {
  people: BubblePerson[];
  toneFor: (p: BubblePerson) => BubbleTone;
  variant: "float" | "strip";
  orderSeed?: number;
  dimmed?: boolean;
  pointsByBubble?: Record<string, { text: string; delay?: number }>;
  ariaLabel: string;
  className?: string;
}) {
  const ordered = useMemo(
    () => (orderSeed === undefined ? people : seededShuffle(people, `strip:${orderSeed}`)),
    [people, orderSeed]
  );

  return (
    <motion.ul
      aria-label={ariaLabel}
      className={`flex list-none flex-wrap items-center justify-center ${
        variant === "float" ? "gap-x-16 gap-y-14 py-14" : "gap-x-3 gap-y-3 py-3"
      } ${dimmed ? "opacity-35" : "opacity-100"} transition-opacity duration-500 ${className}`}
    >
      {ordered.map((p) => (
        <li key={p.id}>
          <Bubble person={p} tone={toneFor(p)} variant={variant} points={pointsByBubble?.[p.id] ?? null} />
        </li>
      ))}
    </motion.ul>
  );
}

/**
 * The top three lifted out of the strip: the strip bubbles themselves fly down
 * (shared layoutId), the rank plate and score land beneath them after they
 * settle. 3rd → 2nd → 1st, star on first.
 */
export function BubblePodium({ rows }: { rows: BubblePerson[] }) {
  const reduced = useReducedMotion();
  const top = rows.slice(0, 3);
  if (top.length === 0) return null;

  const order = top.length === 3 ? [1, 0, 2] : top.length === 2 ? [1, 0] : [0];
  const delays = [0.55, 0.28, 0];
  const plates = [
    "border-[color:var(--gold)] text-[color:var(--gold-deep)]",
    "border-[color:var(--lapis)] text-[color:var(--lapis)]",
    "border-[color:var(--rule)] text-[color:var(--muted-ink)]",
  ];
  const orbSizes = ["h-32 w-32", "h-[108px] w-[108px]", "h-[92px] w-[92px]"];
  const nameWidths = ["max-w-[104px]", "max-w-[84px]", "max-w-[68px]"];
  const nameSizes = ["text-base", "text-sm", "text-sm"];

  return (
    <div className="flex items-end justify-center gap-4 sm:gap-10" aria-label="منصة الفائزين">
      {order.map((rank) => {
        const p = top[rank];
        const delay = 0.9 + (delays[rank] ?? 0);
        return (
          <div key={p.id} className="flex flex-col items-center gap-2">
            {rank === 0 && <Star delay={delay} />}
            <motion.div
              layoutId={reduced ? undefined : `podium:${p.id}`}
              initial={reduced ? { opacity: 0 } : false}
              animate={reduced ? { opacity: 1 } : undefined}
              transition={{ type: "spring", stiffness: 55, damping: 17 }}
              className={`relative flex items-center justify-center rounded-full border-2 bg-[color:var(--wash)] text-center text-[color:var(--foreground)] ${orbSizes[rank]} ${
                plates[rank].split(" ")[0]
              }`}
            >
              <span className={`truncate px-1 font-bold leading-snug ${nameWidths[rank]} ${nameSizes[rank]}`}>
                {p.nickname}
              </span>
            </motion.div>
            <motion.span
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay, duration: 0.45, ease: EASE }}
              className={`flex h-10 w-10 items-center justify-center border-2 bg-[color:var(--background)] text-xl font-bold ${plates[rank]}`}
            >
              {rank + 1}
            </motion.span>
            <motion.span
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: delay + 0.1, duration: 0.45, ease: EASE }}
              className="text-xl font-bold tabular-nums text-[color:var(--foreground)]" dir="ltr"
            >
              {p.totalScore}
            </motion.span>
          </div>
        );
      })}
    </div>
  );
}

function Star({ delay }: { delay: number }) {
  return (
    <motion.svg
      width="22"
      height="22"
      viewBox="0 0 18 18"
      aria-hidden="true"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay, duration: 0.5, ease: "easeOut" }}
    >
      <path
        d="M9 1 L10.8 6.6 L16.5 7 L12.2 10.6 L13.7 16.2 L9 13.2 L4.3 16.2 L5.8 10.6 L1.5 7 L7.2 6.6 Z"
        fill="var(--gold)"
      />
    </motion.svg>
  );
}
