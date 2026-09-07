"use client";

import { useEffect, useState, use } from "react";

type Question = {
  id: string;
  kind: "MCQ" | "TRUE_FALSE" | "INPUT";
  text: string;
  timeLimitSec: number;
  options: { id: string; text: string; isCorrect?: boolean }[];
};

export default function PracticePage({ params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = use(params);
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, { optionId?: string; text?: string }>>({});
  const [done, setDone] = useState(false);
  const [result, setResult] = useState<{ results: { questionId: string; isCorrect: boolean | null }[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/quizzes/${quizId}/practice`)
      .then((r) => r.json())
      .then((data) => {
        setTitle(data.quiz?.title ?? "");
        setQuestions(data.quiz?.questions ?? []);
        setLoading(false);
      });
  }, [quizId]);

  async function submit() {
    const payload = questions.map((q) => ({
      questionId: q.id,
      chosenOptionId: answers[q.id]?.optionId,
      textAnswer: answers[q.id]?.text,
    }));
    const res = await fetch(`/api/practice/${quizId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: payload }),
    });
    const data = await res.json();
    setResult(data);
    setDone(true);
  }

  const answeredAll = questions.every((q) =>
    q.kind === "INPUT" ? !!answers[q.id]?.text?.trim() : !!answers[q.id]?.optionId
  );

  if (loading) return <main className="min-h-screen p-10 text-[color:var(--muted-ink)]">جارٍ التحميل…</main>;

  return (
    <main className="min-h-screen px-6 py-10 max-w-2xl mx-auto">
      <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--gold-deep)]" dir="ltr">
        اختبار
      </p>
      <h1 className="mt-2 text-3xl font-bold">{title}</h1>
      <p className="mt-2 text-[color:var(--muted-ink)]">اختبار ذاتي — أجب ثم أرسل.</p>

      {questions.map((q, qi) => (
        <section key={q.id} className="mt-8 border border-[color:var(--rule)] rounded-sm p-6">
          <h2 className="text-lg font-bold">
            {qi + 1}. {q.text}
            {q.kind === "INPUT" && (
              <span className="ms-2 text-xs text-[color:var(--red)]">تصحيح يدوي من المعلّم</span>
            )}
          </h2>

          {q.kind === "INPUT" ? (
            <textarea
              rows={2}
              value={answers[q.id]?.text ?? ""}
              onChange={(e) => setAnswers({ ...answers, [q.id]: { text: e.target.value } })}
              placeholder="اكتب إجابتك"
              className="mt-4 w-full py-3 px-4 border-2 border-[color:var(--rule)] rounded-sm outline-none focus:border-[color:var(--lapis)]"
            />
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {q.options.map((o) => {
                const selected = answers[q.id]?.optionId === o.id;
                const outcome =
                  result &&
                  (o.isCorrect
                    ? "border-[color:var(--green)] bg-[color:var(--green-wash)] font-bold"
                    : selected
                      ? "border-[color:var(--red)] opacity-70"
                      : "opacity-60");
                return (
                  <button
                    key={o.id}
                    disabled={done}
                    onClick={() => setAnswers({ ...answers, [q.id]: { optionId: o.id } })}
                    className={`py-4 border-2 rounded-sm ${
                      selected ? "border-[color:var(--lapis)] bg-[color:var(--wash)]" : "border-[color:var(--rule)]"
                    } ${outcome ?? ""}`}
                  >
                    {o.text}
                  </button>
                );
              })}
            </div>
          )}
          {done && result && (
            <Outcome qid={q.id} result={result} />
          )}
        </section>
      ))}

      {!done ? (
        <button
          onClick={submit}
          disabled={!answeredAll}
          className="mt-8 bg-[color:var(--foreground)] text-[color:var(--background)] px-8 py-4 text-lg font-semibold rounded-sm disabled:opacity-40"
        >
          إرسال الإجابات
        </button>
      ) : (
        <p className="mt-8 text-[color:var(--muted-ink)]">
          تم الإرسال. ستظهر أسئلة الإجابة الحرة عند المعلّم للتصحيح.
        </p>
      )}
    </main>
  );
}

type PracticeResult = { results: { questionId: string; isCorrect: boolean | null }[] };

function Outcome({ qid, result }: { qid: string; result: PracticeResult }) {
  const r = result.results.find((x) => x.questionId === qid);
  if (!r) return null;
  if (r.isCorrect === null)
    return <p className="mt-3 text-sm text-[color:var(--muted-ink)]">بانتظار تصحيح المعلّم</p>;
  return (
    <p
      className="mt-3 text-sm font-semibold"
      style={{ color: r.isCorrect ? "var(--green-deep)" : "var(--red)" }}
    >
      {r.isCorrect ? "إجابة صحيحة" : "إجابة خاطئة"}
    </p>
  );
}
