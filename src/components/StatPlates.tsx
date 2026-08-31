"use client";

import { useReducedMotion } from "framer-motion";
import { useCountUp } from "@/lib/useCountUp";

export type StatItem = {
  label: string;
  value: number | null;
  kind?: "number" | "percent" | "rank";
  tone?: "default" | "gold";
};

const rankWord = (rank: number) =>
  rank === 1 ? "الأول" : rank === 2 ? "الثاني" : rank === 3 ? "الثالث" : `المركز ${rank}`;

export default function StatPlates({ items }: { items: StatItem[] }) {
  return (
    <dl className="grid grid-cols-2 md:grid-cols-4 gap-4" aria-label="الإحصائيات">
      {items.map((item) => (
        <div
          key={item.label}
          className={`border rounded-sm px-5 py-5 text-center ${
            item.tone === "gold"
              ? "border-[color:var(--gold)] bg-[color:var(--wash)]"
              : "border-[color:var(--rule)] bg-[color:var(--background)]"
          }`}
        >
          <dt className="text-sm text-[color:var(--muted-ink)]">{item.label}</dt>
          <dd className="mt-2">
            <StatValue item={item} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function StatValue({ item }: { item: StatItem }) {
  const reduced = useReducedMotion();
  const n = useCountUp(item.value ?? 0, reduced ? 0 : 800);

  if (item.value === null) {
    return (
      <span className="text-3xl font-bold text-[color:var(--muted-ink)]" dir="ltr">
        —
      </span>
    );
  }

  if (item.kind === "rank") {
    const medal =
      item.value === 1
        ? "text-[color:var(--gold-deep)]"
        : item.value === 2
          ? "text-[color:var(--lapis)]"
          : "text-[color:var(--body-ink)]";
    return (
      <span className={`text-2xl md:text-3xl font-bold ${medal}`} dir="rtl">
        {rankWord(item.value)}
      </span>
    );
  }

  return (
    <span
      className={`text-3xl md:text-4xl font-bold tabular-nums ${
        item.tone === "gold" ? "text-[color:var(--gold-deep)]" : "text-[color:var(--lapis)]"
      }`}
      dir="ltr"
    >
      {n}
      {item.kind === "percent" ? "%" : ""}
    </span>
  );
}
