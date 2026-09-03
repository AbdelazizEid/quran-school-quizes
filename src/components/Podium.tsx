"use client";

import { motion, useReducedMotion } from "framer-motion";

type Row = { id: string; nickname: string; totalScore: number };

export default function Podium({ rows }: { rows: Row[] }) {
  const reduced = useReducedMotion();
  const top = rows.slice(0, 3);
  if (top.length === 0) return null;

  const order = top.length === 3 ? [1, 0, 2] : top.length === 2 ? [1, 0] : [0];
  const heights = ["h-24", "h-16", "h-12"];
  const inks = ["text-[color:var(--gold-deep)]", "text-[color:var(--foreground)]", "text-[color:var(--muted-ink)]"];
  const borders = ["border-[color:var(--gold)]", "border-[color:var(--lapis)]", "border-[color:var(--rule)]"];
  // reveal 3rd → 2nd → 1st, Kahoot-style
  const delays = [0.55, 0.28, 0];

  return (
    <div className="flex items-end justify-center gap-3 sm:gap-6" aria-label="منصة الفائزين">
      {order.map((rank) => {
        const p = top[rank];
        const delay = delays[rank] ?? 0;
        return (
          <div key={p.id} className="flex w-24 sm:w-32 flex-col items-center">
            <motion.div
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col items-center"
            >
              {rank === 0 && <Star reduced={reduced} />}
              <p className={`text-lg font-bold ${inks[rank]}`}>{p.nickname}</p>
              <p className="text-sm tabular-nums text-[color:var(--muted-ink)]" dir="ltr">
                {p.totalScore}
              </p>
            </motion.div>
            <motion.div
              initial={reduced ? { opacity: 0 } : { scaleY: 0 }}
              animate={{ scaleY: 1, opacity: 1 }}
              transition={{ delay, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              style={{ transformOrigin: "bottom" }}
              className={`mt-2 w-full ${heights[rank]} border-2 ${borders[rank]} bg-[color:var(--wash)] rounded-t-lg flex items-start justify-center pt-2`}
            >
              <span className="text-2xl font-bold text-[color:var(--gold-deep)]">{rank + 1}</span>
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}

function Star({ reduced }: { reduced: boolean | null }) {
  return (
    <motion.svg
      width="22"
      height="22"
      viewBox="0 0 18 18"
      aria-hidden="true"
      initial={reduced ? { opacity: 0 } : { scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 0.55, duration: 0.5, ease: "easeOut" }}
    >
      <path
        d="M9 1 L10.8 6.6 L16.5 7 L12.2 10.6 L13.7 16.2 L9 13.2 L4.3 16.2 L5.8 10.6 L1.5 7 L7.2 6.6 Z"
        fill="var(--gold)"
      />
    </motion.svg>
  );
}
