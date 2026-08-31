"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type SessionRow = {
  id: string;
  joinCode: string;
  quizTitle: string;
  phase: string;
  createdAt: string;
  closedAt: string | null;
  participantCount: number;
  top: { nickname: string; totalScore: number } | null;
};

const phaseLabels: Record<string, string> = {
  LOBBY: "في الردهة",
  QUESTION: "جارية",
  ANSWER_REVIEW: "جارية",
  LEADERBOARD: "جارية",
  CLOSED: "منتهية",
};

export default function ResultsPage() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((data) => {
        setSessions(data.sessions ?? []);
        setLoading(false);
      });
  }, []);

  return (
    <main className="min-h-screen px-6 py-10 max-w-4xl mx-auto">
      <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--gold-deep)]" dir="ltr">
        DAR MAKKAH
      </p>
      <div className="flex items-center justify-between">
        <h1 className="mt-2 text-3xl font-bold">نتائج الجلسات</h1>
        <Link href="/quizzes" className="border border-[color:var(--rule)] px-5 py-2.5 rounded-sm">
          مكتبة الأسئلة
        </Link>
      </div>

      {loading && <p className="mt-10 text-[color:var(--muted-ink)]">جارٍ التحميل…</p>}
      {!loading && sessions.length === 0 && (
        <p className="mt-10 text-[color:var(--muted-ink)]">لا توجد جلسات بعد.</p>
      )}

      <ul className="mt-10 flex flex-col gap-4">
        {sessions.map((s) => (
          <li key={s.id}>
            <Link
              href={`/results/${s.id}`}
              className="flex flex-wrap items-center justify-between gap-3 border border-[color:var(--rule)] rounded-sm p-6 hover:bg-[color:var(--wash)]"
            >
              <div>
                <p className="text-xl font-bold">{s.quizTitle}</p>
                <p className="text-sm text-[color:var(--muted-ink)]">
                  {s.participantCount} طالبًا · {phaseLabels[s.phase] ?? s.phase} ·{" "}
                  <span dir="ltr">{s.joinCode}</span>
                </p>
              </div>
              {s.top && (
                <p className="text-sm">
                  الأول: <span className="font-semibold">{s.top.nickname}</span>{" "}
                  <span className="tabular-nums" dir="ltr">
                    ({s.top.totalScore})
                  </span>
                </p>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
