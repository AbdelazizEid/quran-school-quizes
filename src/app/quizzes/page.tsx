"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type QuizRow = {
  id: string;
  title: string;
  description: string | null;
  _count: { questions: number };
};

export default function QuizzesPage() {
  const router = useRouter();
  const [quizzes, setQuizzes] = useState<QuizRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/quizzes");
    const data = await res.json();
    setQuizzes(data.quizzes ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function copyQuiz(id: string) {
    await fetch(`/api/quizzes/${id}/copy`, { method: "POST" });
    load();
  }

  async function removeQuiz(id: string) {
    if (!confirm("حذف الاختبار نهائيًا؟")) return;
    await fetch(`/api/quizzes/${id}`, { method: "DELETE" });
    load();
  }

  async function startSession(id: string) {
    setStarting(id);
    const res = await fetch(`/api/quizzes/${id}/session`, { method: "POST" });
    const data = await res.json();
    setStarting(null);
    if (res.ok) router.push(`/host/${data.session.id}`);
  }

  return (
    <main className="min-h-screen px-6 py-10 max-w-4xl mx-auto">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--gold-deep)]" dir="ltr">
            DAR MAKKAH
          </p>
          <h1 className="mt-2 text-3xl font-bold">مكتبة الأسئلة</h1>
        </div>
        <div className="flex gap-2">
          <Link
            href="/results"
            className="border border-[color:var(--rule)] px-5 py-3 rounded-sm font-semibold"
          >
            النتائج
          </Link>
          <Link
            href="/quizzes/new"
            className="bg-[color:var(--foreground)] text-[color:var(--background)] px-6 py-3 font-semibold rounded-sm"
          >
            اختبار جديد
          </Link>
        </div>
      </header>

      {loading && <p className="mt-10 text-[color:var(--muted-ink)]">جارٍ التحميل…</p>}

      {!loading && quizzes.length === 0 && (
        <p className="mt-10 text-[color:var(--muted-ink)]">لا توجد اختبارات بعد — أنشئ أول اختبار.</p>
      )}

      <ul className="mt-10 flex flex-col gap-4">
        {quizzes.map((q) => (
          <li key={q.id} className="border border-[color:var(--rule)] rounded-sm p-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <Link href={`/quizzes/${q.id}`} className="text-xl font-bold hover:underline">
                {q.title}
              </Link>
              <p className="text-sm text-[color:var(--muted-ink)]">
                {q._count.questions} سؤالًا
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => startSession(q.id)}
                disabled={q._count.questions === 0 || starting === q.id}
                className="bg-[color:var(--foreground)] text-[color:var(--background)] px-5 py-2.5 rounded-sm font-semibold disabled:opacity-40"
              >
                {starting === q.id ? "…" : "ابدأ منافسة"}
              </button>
              <Link
                href={`/practice/${q.id}`}
                className="border border-[color:var(--lapis)] px-5 py-2.5 rounded-sm font-semibold"
              >
                ممارسة
              </Link>
              <Link
                href={`/quizzes/${q.id}`}
                className="border border-[color:var(--rule)] px-5 py-2.5 rounded-sm"
              >
                تحرير
              </Link>
              <button
                onClick={() => copyQuiz(q.id)}
                className="border border-[color:var(--rule)] px-5 py-2.5 rounded-sm"
              >
                نسخ
              </button>
              <button
                onClick={() => removeQuiz(q.id)}
                className="border border-[color:var(--red)] text-[color:var(--red)] px-5 py-2.5 rounded-sm"
              >
                حذف
              </button>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
