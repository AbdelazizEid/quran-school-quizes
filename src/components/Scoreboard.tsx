"use client";

import { useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useCountUp } from "@/lib/useCountUp";

export type ScoreRow = { id: string; nickname: string; totalScore: number };

const rankPlate = [
  "border-[color:var(--gold)] text-[color:var(--gold-deep)]",
  "border-[color:var(--lapis)] text-[color:var(--lapis)]",
  "border-[color:var(--rule)] text-[color:var(--muted-ink)]",
];

const ROW_H = 73; // px, keep in sync with row padding + border

/**
 * The rewrite: after every question the ranked rows keep their identity and
 * slide from their previous position to the new one. The component stays
 * mounted for the whole session; the previous order is remembered in a ref,
 * so each new scoreboard animates the rewrite from the last one.
 */
export default function Scoreboard({
  rows,
  meId,
}: {
  rows: ScoreRow[];
  meId?: string | null;
}) {
  const reduced = useReducedMotion();
  const prevOrder = useRef<string[]>([]);

  const top = rows.slice(0, 3);
  const visible = top.length > 0;
  const order = top.map((r) => r.id);
  const from = prevOrder.current;

  const content = visible ? (
    <div className="border-t border-[color:var(--rule)]" aria-label="أفضل ثلاثة">
      {top.map((row, i) => {
        const prevIdx = from.indexOf(row.id);
        const slide = prevIdx >= 0 ? (prevIdx - i) * ROW_H : null;
        return (
          <motion.div
            key={row.id}
            initial={
              reduced
                ? { opacity: 0 }
                : slide !== null
                  ? { opacity: 1, y: slide }
                  : { opacity: 0, y: 28 }
            }
            animate={{ opacity: 1, y: 0 }}
            transition={
              slide !== null
                ? { type: "spring", stiffness: 260, damping: 26 }
                : { duration: 0.42, ease: [0.16, 1, 0.3, 1], delay: i * 0.08 }
            }
            className="flex items-center gap-4 px-5 py-4 border-b border-[color:var(--rule)]"
          >
            <Row rank={i} row={row} me={row.id === meId} />
          </motion.div>
        );
      })}
    </div>
  ) : null;

  if (visible && from.join("|") !== order.join("|")) {
    prevOrder.current = order;
  }

  const myRank = meId ? rows.findIndex((r) => r.id === meId) : -1;

  return (
    <div className="w-full max-w-xl mx-auto">
      {content}
      {visible && myRank >= 3 && (
        <p className="mt-4 text-center text-[color:var(--muted-ink)]">
          مركزك الحالي:{" "}
          <span className="font-bold text-[color:var(--foreground)] tabular-nums">{myRank + 1}</span>
        </p>
      )}
    </div>
  );
}

function Row({ row, rank, me }: { row: ScoreRow; rank: number; me: boolean }) {
  const score = useCountUp(row.totalScore);
  return (
    <>
      <span
        className={`w-11 h-11 shrink-0 flex items-center justify-center border-2 font-bold text-xl ${
          rankPlate[rank] ?? rankPlate[2]
        }`}
      >
        {rank + 1}
      </span>
      <span className={`truncate text-xl ${rank === 0 ? "font-bold" : "font-semibold"}`}>
        {row.nickname}
        {me && <span className="ms-2 text-sm text-[color:var(--gold-deep)] font-normal">أنت</span>}
      </span>
      <span className="ms-auto text-2xl font-bold tabular-nums" dir="ltr">
        {score}
      </span>
    </>
  );
}
