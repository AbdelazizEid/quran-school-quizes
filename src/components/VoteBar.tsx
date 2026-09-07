"use client";

import { useEffect, useState } from "react";

/** Kahoot-style vote column: count on top, fill rises from the baseline on reveal.
 *  compact: horizontal inline variant for one-screen student reveals. */
export default function VoteBar({
  count,
  total,
  correct,
  compact,
}: {
  count: number;
  total: number;
  correct?: boolean;
  compact?: boolean;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  const [h, setH] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setH(pct), 30);
    return () => clearTimeout(t);
  }, [pct]);

  const fill = {
    background: correct ? "var(--green)" : "var(--foreground)",
    opacity: correct ? 1 : 0.5,
    transition: "700ms cubic-bezier(0.16, 1, 0.3, 1)",
  } as const;

  if (compact) {
    return (
      <div className="mt-1.5 flex items-center gap-2" aria-label={`${count} إجابة`}>
        <div className="h-1.5 flex-1 rounded-full bg-[color:var(--rule)] overflow-hidden" aria-hidden="true">
          <div className="h-full" style={{ ...fill, width: `${h}%` }} />
        </div>
        <span className="text-sm font-bold tabular-nums leading-none" dir="ltr">
          {count}
        </span>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-col items-center" aria-label={`${count} إجابة`}>
      <span className="text-lg font-bold tabular-nums" dir="ltr">
        {count}
      </span>
      <div className="mt-1 h-16 w-10 rounded-sm bg-[color:var(--rule)] overflow-hidden flex items-end" aria-hidden="true">
        <div className="w-full" style={{ ...fill, height: `${h}%` }} />
      </div>
    </div>
  );
}
