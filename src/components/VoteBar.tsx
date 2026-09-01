"use client";

import { useEffect, useState } from "react";

/** Kahoot-style vote column: count on top, fill rises from the baseline on reveal */
export default function VoteBar({ count, total, correct }: { count: number; total: number; correct?: boolean }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  const [h, setH] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setH(pct), 30);
    return () => clearTimeout(t);
  }, [pct]);

  return (
    <div className="mt-3 flex flex-col items-center" aria-label={`${count} إجابة`}>
      <span className="text-lg font-bold tabular-nums" dir="ltr">
        {count}
      </span>
      <div className="mt-1 h-16 w-10 rounded-sm bg-[color:var(--rule)] overflow-hidden flex items-end" aria-hidden="true">
        <div
          className="w-full"
          style={{
            height: `${h}%`,
            background: correct ? "var(--gold)" : "var(--foreground)",
            opacity: correct ? 1 : 0.5,
            transition: "height 700ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        />
      </div>
    </div>
  );
}
