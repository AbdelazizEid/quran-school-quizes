"use client";

type Row = { id: string; nickname: string; totalScore: number };

export default function Podium({ rows }: { rows: Row[] }) {
  const top = rows.slice(0, 3);
  if (top.length === 0) return null;

  const order = top.length === 3 ? [1, 0, 2] : top.length === 2 ? [1, 0] : [0];
  const heights = ["h-16", "h-24", "h-12"];
  const inks = ["text-[color:var(--gold-deep)]", "text-[color:var(--foreground)]", "text-[color:var(--muted-ink)]"];
  const borders = ["border-[color:var(--gold)]", "border-[color:var(--lapis)]", "border-[color:var(--rule)]"];

  return (
    <div className="flex items-end justify-center gap-3 sm:gap-6" aria-label="منصة الفائزين">
      {order.map((rank) => {
        const p = top[rank];
        return (
          <div key={p.id} className="flex w-24 sm:w-32 flex-col items-center">
            <p className={`text-lg font-bold ${inks[rank]}`}>{p.nickname}</p>
            <p className="text-sm tabular-nums text-[color:var(--muted-ink)]" dir="ltr">
              {p.totalScore}
            </p>
            <div
              className={`mt-2 w-full ${heights[rank]} border-2 ${borders[rank]} bg-[color:var(--wash)] rounded-t-lg flex items-start justify-center pt-2`}
            >
              <span className="text-2xl font-bold text-[color:var(--gold-deep)]">{rank + 1}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
