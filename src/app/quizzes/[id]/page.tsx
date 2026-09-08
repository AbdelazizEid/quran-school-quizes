"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { validationErrorMessage } from "@/lib/ai-quiz-draft";

type OptionInput = { text: string; isCorrect: boolean };
type SourceEvidence =
  | { type: "general_knowledge"; label: string }
  | { type: "source"; label: string; documentName: string; excerpt: string; pageSection?: string };
type QuestionInput = {
  kind: "MCQ" | "TRUE_FALSE" | "INPUT";
  text: string;
  timeLimitSec: number;
  options: OptionInput[];
  sourceEvidence?: SourceEvidence | null;
};
type QuizForm = { title: string; description: string; questions: QuestionInput[] };

const emptyQuestion = (): QuestionInput => ({
  kind: "MCQ",
  text: "",
  timeLimitSec: 25,
  options: [
    { text: "", isCorrect: true },
    { text: "", isCorrect: false },
  ],
});

export default function QuizEditorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const isNew = params.id === "new";
  const [form, setForm] = useState<QuizForm>({ title: "", description: "", questions: [emptyQuestion()] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) return;
    fetch(`/api/quizzes/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.quiz) return;
        setForm({
          title: data.quiz.title,
          description: data.quiz.description ?? "",
          questions: data.quiz.questions.map((q: Record<string, unknown> & { options: { text: string; isCorrect: boolean }[] }) => ({
            kind: q.kind as QuestionInput["kind"],
            text: q.text as string,
            timeLimitSec: (q.timeLimitSec as number) ?? 25,
            options: (q.options ?? []).map((o) => ({ text: o.text, isCorrect: o.isCorrect })),
            sourceEvidence: (q.sourceEvidence as SourceEvidence | null) ?? null,
          })),
        });
      });
  }, [isNew, params.id]);

  function setQuestion(i: number, patch: Partial<QuestionInput>) {
    setForm((f) => {
      const questions = [...f.questions];
      const current = { ...questions[i], ...patch };
      if (patch.kind === "TRUE_FALSE") {
        current.options = [
          { text: "صح", isCorrect: current.options.some((o) => o.isCorrect && o.text === "صح") },
          { text: "خطأ", isCorrect: false },
        ];
      }
      if (patch.kind === "MCQ" && current.options.length < 2) {
        current.options = [
          { text: "", isCorrect: true },
          { text: "", isCorrect: false },
        ];
      }
      questions[i] = current;
      return { ...f, questions };
    });
  }

  function setOption(qi: number, oi: number, text: string) {
    setForm((f) => {
      const questions = [...f.questions];
      const options = [...questions[qi].options];
      options[oi] = { ...options[oi], text };
      questions[qi] = { ...questions[qi], options };
      return { ...f, questions };
    });
  }

  function markCorrect(qi: number, oi: number) {
    setForm((f) => {
      const questions = [...f.questions];
      const options = questions[qi].options.map((o, i) => ({ ...o, isCorrect: i === oi }));
      questions[qi] = { ...questions[qi], options };
      return { ...f, questions };
    });
  }

  async function save() {
    setError(null);
    if (!form.title.trim()) {
      setError("العنوان مطلوب");
      return;
    }
    const valid = form.questions.every((q) => q.text.trim());
    if (!valid) {
      setError("كل الأسئلة تحتاج نصًا");
      return;
    }
    setSaving(true);
    const res = await fetch(isNew ? "/api/quizzes" : `/api/quizzes/${params.id}`, {
      method: isNew ? "POST" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ? validationErrorMessage(data.error) : "تعذّر الحفظ");
      return;
    }
    router.push("/quizzes");
  }

  return (
    <main className="min-h-screen px-6 py-10 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold">{isNew ? "اختبار جديد" : "تحرير الاختبار"}</h1>

      <section className="mt-8 flex flex-col gap-4">
        <input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="عنوان الاختبار — مثال: سورة الفاتحة"
          className="text-xl font-semibold py-3 px-4 border-2 border-[color:var(--rule)] rounded-sm outline-none focus:border-[color:var(--lapis)]"
        />
        <input
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="وصف (اختياري)"
          className="py-3 px-4 border border-[color:var(--rule)] rounded-sm outline-none focus:border-[color:var(--lapis)]"
        />
      </section>

      {form.questions.map((q, qi) => (
        <section key={qi} className="mt-10 border border-[color:var(--rule)] rounded-sm p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-bold text-[color:var(--muted-ink)]">سؤال {qi + 1}</h2>
            <div className="flex items-center gap-2">
              <select
                value={q.kind}
                onChange={(e) => setQuestion(qi, { kind: e.target.value as QuestionInput["kind"] })}
                className="py-2 px-3 border border-[color:var(--rule)] rounded-sm bg-[color:var(--background)]"
              >
                <option value="MCQ">اختيار من متعدد</option>
                <option value="TRUE_FALSE">صح / خطأ</option>
                <option value="INPUT">إجابة حرة (للاختبار فقط)</option>
              </select>
              <label className="flex items-center gap-2 text-sm">
                <span>الوقت (ث)</span>
                <input
                  type="number"
                  min={5}
                  max={120}
                  value={q.timeLimitSec}
                  onChange={(e) => setQuestion(qi, { timeLimitSec: Number(e.target.value) || 25 })}
                  className="w-16 py-2 px-2 text-center border border-[color:var(--rule)] rounded-sm"
                />
              </label>
              {form.questions.length > 1 && (
                <button
                  onClick={() =>
                    setForm({ ...form, questions: form.questions.filter((_, i) => i !== qi) })
                  }
                  className="text-[color:var(--red)] border border-[color:var(--red)] px-3 py-1.5 rounded-sm text-sm"
                >
                  حذف السؤال
                </button>
              )}
            </div>
          </div>

          <textarea
            value={q.text}
            onChange={(e) => setQuestion(qi, { text: e.target.value })}
            placeholder="نص السؤال"
            rows={2}
            className="mt-4 w-full py-3 px-4 text-lg border-2 border-[color:var(--rule)] rounded-sm outline-none focus:border-[color:var(--lapis)]"
          />

          {q.kind !== "INPUT" && (
            <div className="mt-4 flex flex-col gap-3">
              {(q.kind === "TRUE_FALSE" ? [0, 1] : q.options.map((_, oi) => oi)).map((oi) => (
                <div key={oi} className="flex items-center gap-3">
                  <input
                    type="radio"
                    name={`correct-${qi}`}
                    checked={q.options[oi]?.isCorrect}
                    onChange={() => markCorrect(qi, oi)}
                    aria-label="الإجابة الصحيحة"
                  />
                  <input
                    value={q.options[oi]?.text ?? ""}
                    onChange={(e) => setOption(qi, oi, e.target.value)}
                    readOnly={q.kind === "TRUE_FALSE"}
                    placeholder={`الخيار ${oi + 1}`}
                    className="grow py-2.5 px-4 border border-[color:var(--rule)] rounded-sm outline-none focus:border-[color:var(--lapis)]"
                  />
                </div>
              ))}
              {q.kind === "MCQ" && q.options.length < 4 && (
                <button
                  onClick={() =>
                    setQuestion(qi, {
                      options: [...q.options, { text: "", isCorrect: false }],
                    } as Partial<QuestionInput>)
                  }
                  className="self-start text-sm text-[color:var(--lapis)] underline"
                >
                  + إضافة خيار
                </button>
              )}
            </div>
          )}
          {q.kind === "INPUT" && (
            <p className="mt-4 text-sm text-[color:var(--muted-ink)]">
              تُصحَّح الإجابات الحرة يدويًا من المعلّم بعد الاختبار.
            </p>
          )}
          {q.sourceEvidence && (
            <p className="mt-4 border-s border-[color:var(--gold)] ps-3 text-sm text-[color:var(--muted-ink)]">
              {q.sourceEvidence.type === "source"
                ? `${q.sourceEvidence.label} — ${q.sourceEvidence.documentName}${q.sourceEvidence.pageSection ? ` (${q.sourceEvidence.pageSection})` : ""}: «${q.sourceEvidence.excerpt}»`
                : q.sourceEvidence.label}
            </p>
          )}
        </section>
      ))}

      <div className="mt-8 flex flex-wrap gap-4">
        <button
          onClick={() => setForm({ ...form, questions: [...form.questions, emptyQuestion()] })}
          className="border border-[color:var(--lapis)] text-[color:var(--lapis)] px-6 py-3 rounded-sm font-semibold"
        >
          + سؤال جديد
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="bg-[color:var(--foreground)] text-[color:var(--background)] px-8 py-3 rounded-sm font-semibold disabled:opacity-50"
        >
          {saving ? "جارٍ الحفظ…" : "حفظ"}
        </button>
        <button
          onClick={() => router.push("/quizzes")}
          className="px-6 py-3 rounded-sm border border-[color:var(--rule)]"
        >
          إلغاء
        </button>
      </div>
      {error && <p className="mt-4 text-[color:var(--red)]">{error}</p>}
    </main>
  );
}
