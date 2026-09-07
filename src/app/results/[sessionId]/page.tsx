"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type Detail = {
  session: {
    id: string;
    joinCode: string;
    quizTitle: string;
    phase: string;
    leaderboard: { id: string; nickname: string; totalScore: number }[];
    questions: {
      id: string;
      text: string;
      kind: string;
      options: { id: string; text: string; isCorrect: boolean; count: number }[];
      perParticipant: {
        nickname: string;
        chosen: string;
        isCorrect: boolean | null;
        points: number;
        timeMs: number | null;
      }[];
    }[];
  } | null;
};

export default function SessionResultsPage() {
  const params = useParams<{ sessionId: string }>();
  const [data, setData] = useState<Detail["session"]>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/sessions/${params.sessionId}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d.session ?? null);
        setLoading(false);
      });
  }, [params.sessionId]);

  if (loading) return <main className="min-h-screen p-10 text-[color:var(--muted-ink)]">جارٍ التحميل…</main>;
  if (!data)
    return (
      <main className="min-h-screen p-10">
        <p className="text-[color:var(--red)]">لا توجد نتائج.</p>
      </main>
    );

  return (
    <main className="min-h-screen px-6 py-10 max-w-4xl mx-auto">
      <Link href="/results" className="text-sm text-[color:var(--lapis)]">
        → كل الجلسات
      </Link>
      <h1 className="mt-3 text-3xl font-bold">{data.quizTitle}</h1>
      <p className="text-sm text-[color:var(--muted-ink)]">
        رقم الجلسة <span dir="ltr">{data.joinCode}</span>
      </p>

      <section className="mt-10">
        <h2 className="text-xl font-bold">الترتيب النهائي</h2>
        <ol className="mt-4 flex flex-col gap-2">
          {data.leaderboard.map((p, i) => (
            <li
              key={p.id}
              className="flex items-center justify-between px-5 py-3 border border-[color:var(--rule)] rounded-sm"
            >
              <span className="font-semibold">
                {i + 1}. {p.nickname}
              </span>
              <span className="tabular-nums" dir="ltr">
                {p.totalScore}
              </span>
            </li>
          ))}
          {data.leaderboard.length === 0 && (
            <li className="text-[color:var(--muted-ink)]">لم يشارك أحد.</li>
          )}
        </ol>
      </section>

      {data.questions.map((q, qi) => {
        const maxCount = Math.max(1, ...q.options.map((o) => o.count));
        return (
          <section key={q.id} className="mt-10 border border-[color:var(--rule)] rounded-sm p-6">
            <h2 className="text-lg font-bold">
              {qi + 1}. {q.text}
            </h2>
            <div className="mt-4 flex flex-col gap-2">
              {q.options.map((o) => (
                <div key={o.id} className="flex items-center gap-3">
                  <span className="w-28 truncate text-sm">{o.text}</span>
                  <div className="grow h-4 bg-[color:var(--wash)] rounded-sm overflow-hidden">
                    <div
                      className={`h-full ${o.isCorrect ? "bg-[color:var(--green)]" : "bg-[color:var(--lapis)]"}`}
                      style={{ width: `${(o.count / maxCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm tabular-nums" dir="ltr">
                    {o.count}
                  </span>
                </div>
              ))}
            </div>
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-[color:var(--lapis)]">
                إجابات كل طالب
              </summary>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm text-start">
                  <thead>
                    <tr className="text-[color:var(--muted-ink)]">
                      <th className="text-start py-1">الطالب</th>
                      <th className="text-start py-1">اختياره</th>
                      <th className="text-start py-1">النتيجة</th>
                      <th className="text-start py-1">النقاط</th>
                      <th className="text-start py-1">الزمن (ث)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {q.perParticipant.map((r) => (
                      <tr key={r.nickname} className="border-t border-[color:var(--rule)]">
                        <td className="py-1.5">{r.nickname}</td>
                        <td className="py-1.5">{r.chosen}</td>
                        <td
                          className="py-1.5"
                          style={{
                            color:
                              r.isCorrect === null
                                ? "var(--muted-ink)"
                                : r.isCorrect
                                  ? "var(--gold-deep)"
                                  : "var(--red)",
                          }}
                        >
                          {r.isCorrect === null ? "—" : r.isCorrect ? "صح" : "خطأ"}
                        </td>
                        <td className="py-1.5 tabular-nums" dir="ltr">
                          {r.points}
                        </td>
                        <td className="py-1.5 tabular-nums" dir="ltr">
                          {r.timeMs === null ? "—" : (r.timeMs / 1000).toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
        );
      })}
    </main>
  );
}
