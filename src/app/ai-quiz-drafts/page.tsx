"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type DraftRow = {
  id: string;
  title: string;
  instruction: string;
  updatedAt: string;
};

export default function AiQuizDraftsPage() {
  const router = useRouter();
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    fetch("/api/ai-quiz-drafts")
      .then((response) => response.json())
      .then((data) => setDrafts(data.drafts ?? []))
      .finally(() => setLoading(false));
  }, []);

  async function startDraft() {
    setStarting(true);
    const response = await fetch("/api/ai-quiz-drafts", { method: "POST" });
    const data = await response.json();
    if (response.ok) router.push(`/ai-quiz-drafts/${data.draft.id}`);
    else setStarting(false);
  }

  return (
    <main className="min-h-screen max-w-5xl mx-auto px-5 md:px-6 py-10 md:py-14">
      <header className="flex flex-wrap items-end justify-between gap-5 border-b border-[color:var(--rule)] pb-6">
        <div>
          <p className="text-xs tracking-[0.3em] text-[color:var(--gold-deep)]">مساعد إعداد الاختبارات</p>
          <h1 className="mt-2 text-4xl font-bold">مسودات الاختبارات</h1>
          <p className="mt-2 text-[color:var(--muted-ink)]">مساحة خاصة قابلة للاستئناف لمراجعة أسئلة الاختبار.</p>
        </div>
        <button
          type="button"
          onClick={startDraft}
          disabled={starting || loading}
          className="bg-[color:var(--foreground)] text-[color:var(--background)] px-6 py-3 rounded-sm font-semibold disabled:opacity-50"
        >
          {starting ? "جارٍ البدء…" : "مسودة جديدة"}
        </button>
      </header>

      {loading && <p className="mt-10 text-[color:var(--muted-ink)]">جارٍ التحميل…</p>}
      {!loading && drafts.length === 0 && (
        <p className="mt-10 text-[color:var(--muted-ink)]">لا توجد مسودات بعد. ابدأ بطلب أسئلة باللغة الطبيعية.</p>
      )}
      {!loading && drafts.length > 0 && (
        <ul className="mt-8 divide-y divide-[color:var(--rule)] border-y border-[color:var(--rule)]">
          {drafts.map((draft) => (
            <li key={draft.id} className="py-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <Link href={`/ai-quiz-drafts/${draft.id}`} className="text-xl font-bold hover:underline">
                  {draft.title || "مسودة بلا عنوان"}
                </Link>
                <p className="mt-1 text-sm text-[color:var(--muted-ink)]">
                  {draft.instruction || "لم تُرسل تعليمات بعد"}
                </p>
              </div>
              <Link
                href={`/ai-quiz-drafts/${draft.id}`}
                className="border border-[color:var(--lapis)] text-[color:var(--lapis)] px-5 py-2.5 rounded-sm font-semibold"
              >
                استئناف
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
