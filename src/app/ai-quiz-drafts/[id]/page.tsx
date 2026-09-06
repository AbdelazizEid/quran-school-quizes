"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { VALIDATION_ERROR_MESSAGES } from "@/lib/ai-quiz-draft";

type QuestionKind = "MCQ" | "TRUE_FALSE" | "INPUT";
type Option = { text: string; isCorrect: boolean };
type SourceEvidence =
  | { type: "general_knowledge"; label: string }
  | { type: "source"; label: string; documentName: string; excerpt: string; pageSection?: string };
type Question = {
  kind: QuestionKind;
  text: string;
  timeLimitSec: number;
  options: Option[];
  sourceEvidence?: SourceEvidence | null;
};
type Message = { role: "teacher" | "assistant"; content: string; createdAt: string };
type SourcePolicy = "GENERAL_KNOWLEDGE_ONLY" | "SOURCES_ONLY" | "SOURCES_PLUS_GENERAL_KNOWLEDGE";
type SourceMetadata = { id: string; kind: string; name: string; charCount: number };
type Draft = {
  id: string;
  title: string;
  description: string;
  sourcePolicy: SourcePolicy;
  questions: Question[];
  messages: Message[];
  sources: SourceMetadata[];
};
type SavedQuiz = { id: string; title: string };

type GenerationPayload = { draft: Draft; response: { type: string; message?: string } };
type GenerationStreamEvent =
  | { type: "delta"; text: string }
  | { type: "error"; error: string }
  | { type: "done"; draft: Draft; response: { type: string; message?: string } };

async function readGenerationStream(body: ReadableStream<Uint8Array>): Promise<GenerationPayload> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done: GenerationPayload | null = null;
  for (;;) {
    const { done: finished, value } = await reader.read();
    if (finished) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, boundary).trim();
      buffer = buffer.slice(boundary + 2);
      if (!chunk.startsWith("data:")) continue;
      const event = JSON.parse(chunk.slice(5)) as GenerationStreamEvent;
      if (event.type === "error") throw new Error(event.error);
      else if (event.type === "done") done = { draft: event.draft, response: event.response };
    }
  }
  if (!done) throw new Error("provider-failed");
  return done;
}

const policyChoices: { value: SourcePolicy; label: string }[] = [
  { value: "GENERAL_KNOWLEDGE_ONLY", label: "المعرفة العامة فقط" },
  { value: "SOURCES_ONLY", label: "المصادر المرفوعة فقط" },
  { value: "SOURCES_PLUS_GENERAL_KNOWLEDGE", label: "المصادر مع المعرفة العامة" },
];

const kindLabels: Record<QuestionKind, string> = {
  MCQ: "اختيار من متعدد",
  TRUE_FALSE: "صح / خطأ",
  INPUT: "إجابة حرة",
};

const errorLabels: Record<string, string> = {
  "instruction-required": "اكتب رسالتك أولًا.",
  "question-count-invalid": "عدد الأسئلة يجب أن يكون بين 1 و30 سؤالًا. أنقص العدد المطلوب ثم أعد المحاولة.",
  "rate-limited": "لقد بلغت الحد المسموح من عمليات توليد الأسئلة خلال هذه الساعة. انتظر قليلًا ثم أعد المحاولة.",
  "generation-in-progress": "هناك عملية توليد جارية الآن لهذا الحساب. انتظر اكتمالها قبل طلب عملية أخرى.",
  "sources-text-too-large": "إجمالي نصوص المصادر يتجاوز الحد المسموح إرساله. أزل بعض المصادر أو اختصر نصوصها، أو غيّر سياسة المصدر إلى المعرفة العامة فقط.",
  "provider-failed": "تعذّر إعداد المسودة. حاول مرة أخرى.",
  "provider-timeout": "استغرق إعداد المسودة وقتًا طويلًا. حاول مرة أخرى.",
  "provider-authentication": "تعذّر الاتصال بخدمة الذكاء الاصطناعي. حاول مرة أخرى.",
  "provider-rate-limit": "الخدمة مشغولة مؤقتًا. حاول مرة أخرى لاحقًا.",
  "provider-malformed-response": "أعادت الخدمة نتيجة غير صالحة. حاول مرة أخرى.",
  "provider-unavailable": "الخدمة غير متاحة مؤقتًا. حاول مرة أخرى.",
  "provider-not-configured": "خدمة الذكاء الاصطناعي غير مهيأة حاليًا.",
  "draft-required": "اطلب إنشاء الأسئلة أولًا.",
  "invalid-generation-mode": "نوع الطلب غير صالح.",
  "invalid-json": "تعذّر قراءة الطلب. حاول مرة أخرى.",
  "invalid-form": "تعذّر قراءة الملف المرفوع. حاول مرة أخرى.",
  "unsupported-source-policy": "سياسة المصدر غير صالحة.",
  "sources-required": "سياسة المصادر تتطلب مصدرًا واحدًا على الأقل. أضف مصدرًا أو غيّر السياسة إلى المعرفة العامة فقط.",
  "unsupported-source-type": "نوع الملف غير مدعوم. الأنواع المدعومة: PDF أو Word أو نص أو Markdown.",
  "source-too-large": "حجم الملف يتجاوز الحد المسموح (5 ميغابايت). استخدم ملفًا أصغر.",
  "extracted-text-too-large": "النص المستخرج من الملف كبير جدًا. استخدم ملفًا أصغر أو الصق الجزء المطلوب كنص.",
  "extraction-empty": "تعذّر استخراج نص من الملف. الملفات الممسوحة ضوئيًا والصور غير مدعومة.",
  "extraction-failed": "تعذّر قراءة الملف. تأكد من أن الملف سليم ثم حاول مرة أخرى.",
};

function errorMessage(code?: string) {
  if (!code) return "تعذّر تنفيذ الطلب.";
  return errorLabels[code] ?? VALIDATION_ERROR_MESSAGES[code] ?? "تعذّر تنفيذ الطلب.";
}

function QuestionCard({ question, index }: { question: Question; index: number }) {
  return (
    <article className="border border-[color:var(--rule)] rounded-sm px-4 py-3">
      <p className="text-xs text-[color:var(--muted-ink)]">
        سؤال {index + 1} · {kindLabels[question.kind]} · {question.timeLimitSec} ثانية
      </p>
      <p className="mt-1 font-semibold leading-7">{question.text}</p>
      {question.options.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm">
          {question.options.map((option, optionIndex) => (
            <li key={optionIndex} className={option.isCorrect ? "font-semibold text-[color:var(--lapis)]" : ""}>
              {option.isCorrect ? `✓ ${option.text}` : option.text}
            </li>
          ))}
        </ul>
      )}
      {question.kind === "INPUT" && <p className="mt-2 text-sm text-[color:var(--muted-ink)]">سؤال إجابة حرة — للاختبار الذاتي فقط.</p>}
      {question.sourceEvidence && (
        <p className="mt-2 border-s border-[color:var(--gold)] ps-3 text-sm text-[color:var(--muted-ink)]">
          {question.sourceEvidence.type === "source"
            ? `${question.sourceEvidence.label} — ${question.sourceEvidence.documentName}${question.sourceEvidence.pageSection ? ` (${question.sourceEvidence.pageSection})` : ""}: «${question.sourceEvidence.excerpt}»`
            : question.sourceEvidence.label}
        </p>
      )}
    </article>
  );
}

export default function AiQuizDraftPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [input, setInput] = useState("");
  const [questionCount, setQuestionCount] = useState(10);
  const [sourcePolicy, setSourcePolicy] = useState<SourcePolicy>("GENERAL_KNOWLEDGE_ONLY");
  const [sources, setSources] = useState<SourceMetadata[]>([]);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [savingQuiz, setSavingQuiz] = useState(false);
  const [savedQuiz, setSavedQuiz] = useState<SavedQuiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [pastedName, setPastedName] = useState("");
  const [addingSource, setAddingSource] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const generating = pendingMessage !== null;
  const busy = generating || savingQuiz;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/ai-quiz-drafts/${id}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data.draft as Draft;
      })
      .then((data) => {
        if (cancelled) return;
        setDraft({ ...data, sources: data.sources ?? [] });
        setSourcePolicy(data.sourcePolicy);
        setSources(data.sources ?? []);
      })
      .catch((reason: Error) => {
        if (!cancelled) setError(errorMessage(reason.message));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [draft?.messages.length, generating, savedQuiz]);

  async function updateSourcePolicy(policy: SourcePolicy) {
    setSourcePolicy(policy);
    const response = await fetch(`/api/ai-quiz-drafts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourcePolicy: policy }),
    });
    if (!response.ok) setError(errorMessage((await response.json()).error));
  }

  async function postSource(form: FormData) {
    setAddingSource(true);
    setError(null);
    setNotice(null);
    const response = await fetch(`/api/ai-quiz-drafts/${id}/sources`, { method: "POST", body: form });
    const data = await response.json();
    setAddingSource(false);
    if (!response.ok) {
      setError(errorMessage(data.error));
      return false;
    }
    setSources((current) => [...current, data.source]);
    setNotice("تمت إضافة المصدر إلى المسودة.");
    return true;
  }

  async function addSourceFile(file: File | null) {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    await postSource(form);
  }

  async function addPastedSource() {
    const form = new FormData();
    form.append("text", pastedText);
    if (pastedName.trim()) form.append("name", pastedName.trim());
    if (!(await postSource(form))) return;
    setPastedText("");
    setPastedName("");
  }

  async function removeSource(sourceId: string) {
    const response = await fetch(`/api/ai-quiz-drafts/${id}/sources/${sourceId}`, { method: "DELETE" });
    if (!response.ok) {
      setError(errorMessage((await response.json()).error));
      return;
    }
    setSources((current) => current.filter((source) => source.id !== sourceId));
    setNotice("تمت إزالة المصدر من المسودة.");
  }

  async function saveQuiz() {
    setSavingQuiz(true);
    setError(null);
    const response = await fetch(`/api/ai-quiz-drafts/${id}/save`, { method: "POST" });
    const data = await response.json();
    setSavingQuiz(false);
    if (!response.ok) {
      setError(errorMessage(data.error));
      return;
    }
    setSavedQuiz({ id: data.quiz.id, title: data.quiz.title });
  }

  async function send() {
    const instruction = input.trim();
    if (!instruction || busy || savedQuiz) return;
    setInput("");
    setError(null);
    setNotice(null);
    setPendingMessage(instruction);

    try {
      const response = await fetch(`/api/ai-quiz-drafts/${id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction,
          questionCount,
          mode: draft && draft.questions.length > 0 ? "targeted" : "initial",
          stream: true,
        }),
      });
      const contentType = response.headers.get("content-type") ?? "";
      let payload: GenerationPayload | { error: string };
      if (response.ok && contentType.includes("text/event-stream") && response.body) {
        payload = await readGenerationStream(response.body);
      } else {
        payload = await response.json();
      }
      if (!response.ok || "error" in payload) {
        setError(errorMessage("error" in payload ? payload.error : "provider-failed"));
        return;
      }
      setDraft({ ...payload.draft, sources: payload.draft.sources ?? [] });
      setSources(payload.draft.sources ?? []);
      if (payload.response.type === "confirm_save") await saveQuiz();
    } catch (reason) {
      setError(errorMessage(reason instanceof Error && reason.message ? reason.message : "provider-failed"));
    } finally {
      setPendingMessage(null);
    }
  }

  async function discard() {
    const response = await fetch(`/api/ai-quiz-drafts/${id}`, { method: "DELETE" });
    if (response.ok) router.push("/ai-quiz-drafts");
    else setError(errorMessage((await response.json()).error));
  }

  if (loading) return <main className="max-w-3xl mx-auto px-5 py-14">جارٍ تحميل المحادثة…</main>;
  if (!draft) return <main className="max-w-3xl mx-auto px-5 py-14 text-[color:var(--red)]">{error}</main>;

  return (
    <main className="min-h-screen max-w-3xl mx-auto px-4 md:px-6 flex flex-col">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[color:var(--rule)] py-5">
        <div className="min-w-0">
          <Link href="/ai-quiz-drafts" className="text-sm text-[color:var(--lapis)] hover:underline">مسودات الاختبارات</Link>
          <h1 className="mt-1 text-2xl font-bold truncate">{draft.title || "محادثة مسودة اختبار"}</h1>
          {draft.title && <p className="text-xs text-[color:var(--muted-ink)]">محادثة مسودة اختبار</p>}
        </div>
        {!savedQuiz && (
          <button type="button" onClick={discard} className="text-sm text-[color:var(--muted-ink)] underline hover:text-[color:var(--red)]">
            حذف المسودة
          </button>
        )}
      </header>

      <div className="flex-1 py-6 space-y-5" aria-live="polite">
        {draft.messages.length === 0 && !generating && (
          <p className="text-[color:var(--muted-ink)]">
            اكتب طلبك في الرسائل: اطلب أسئلة، عدّلها، وعندما تكون الأسئلة مناسبة اكتب «احفظ الاختبار» ليحفظها المساعد.
          </p>
        )}
        {draft.messages.map((message, index) => (
          <div key={`${message.createdAt}-${index}`} className={message.role === "teacher" ? "flex justify-end" : ""}>
            {message.role === "teacher" ? (
              <p className="max-w-[85%] bg-[color:var(--lapis)]/10 border border-[color:var(--rule)] rounded-sm px-4 py-2.5 leading-7 whitespace-pre-wrap break-words">
                {message.content}
              </p>
            ) : (
              <div>
                <p className="text-xs text-[color:var(--gold-deep)]">المساعد</p>
                <p className="mt-1 leading-7 whitespace-pre-wrap break-words">{message.content}</p>
              </div>
            )}
          </div>
        ))}

        {draft.questions.length > 0 && (
          <section aria-label="الأسئلة الحالية" className="space-y-3">
            <p className="text-sm font-semibold text-[color:var(--muted-ink)]">
              الأسئلة الحالية ({draft.questions.length}) — تُحدَّث مع كل طلب تعديل.
            </p>
            {draft.questions.map((question, index) => (
              <QuestionCard key={index} question={question} index={index} />
            ))}
          </section>
        )}

        {generating && (
          <div>
            {pendingMessage && (
              <div className="flex justify-end">
                <p className="max-w-[85%] bg-[color:var(--lapis)]/10 border border-[color:var(--rule)] rounded-sm px-4 py-2.5 leading-7 whitespace-pre-wrap break-words">
                  {pendingMessage}
                </p>
              </div>
            )}
            <p className="mt-3 text-[color:var(--muted-ink)] animate-pulse" role="status">
              المساعد يكتب…
            </p>
          </div>
        )}

        {savedQuiz && (
          <div role="status" className="border-y-2 border-[color:var(--gold)] py-5">
            <p className="font-semibold">تم حفظ اختبارك ✅</p>
            <p className="mt-1 text-sm text-[color:var(--muted-ink)]">
              حُفظ الاختبار «{savedQuiz.title}» في مكتبة أسئلتك.
            </p>
            <Link
              href={`/quizzes/${savedQuiz.id}`}
              className="mt-3 inline-block bg-[color:var(--foreground)] text-[color:var(--background)] px-5 py-2.5 rounded-sm font-semibold"
            >
              زيارة الاختبار
            </Link>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {(notice || error) && (
        <p className={`border-s ps-4 pb-3 ${error ? "border-[color:var(--red)] text-[color:var(--red)]" : "border-[color:var(--gold)] text-[color:var(--muted-ink)]"}`} role={error ? "alert" : "status"}>{error || notice}</p>
      )}

      <div className="sticky bottom-0 bg-[color:var(--background)] border-t border-[color:var(--rule)] py-4">
        {savedQuiz ? (
          <p className="text-sm text-[color:var(--muted-ink)]">انتهت هذه المحادثة بعد الحفظ. ابدأ مسودة جديدة لاختبار آخر.</p>
        ) : (
          <>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
              className="flex items-end gap-2"
            >
              <textarea
                aria-label="رسالتك"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
                placeholder={draft.questions.length === 0 ? "مثال: أنشئ 10 أسئلة عن آداب تلاوة القرآن" : "مثال: حسّن السؤال الثاني، أو اكتب احفظ الاختبار"}
                rows={2}
                disabled={busy}
                className="min-w-0 grow resize-y border border-[color:var(--rule)] bg-transparent px-4 py-3 outline-none focus:border-[color:var(--lapis)] disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="shrink-0 bg-[color:var(--lapis)] text-[color:var(--background)] px-5 py-3 rounded-sm font-semibold disabled:opacity-50"
              >
                {generating ? "جارٍ الرد…" : "إرسال"}
              </button>
            </form>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              {draft.questions.length > 0 && (
                <button
                  type="button"
                  onClick={() => void saveQuiz()}
                  disabled={savingQuiz}
                  className="bg-[color:var(--foreground)] text-[color:var(--background)] px-4 py-2 rounded-sm font-semibold disabled:opacity-50"
                >
                  {savingQuiz ? "جارٍ الحفظ…" : "حفظ كاختبار"}
                </button>
              )}
              <label htmlFor="question-count" className="flex items-center gap-2 text-[color:var(--muted-ink)]">
                عدد الأسئلة
                <input
                  id="question-count"
                  type="number"
                  min={1}
                  max={30}
                  value={questionCount}
                  onChange={(event) => setQuestionCount(Number(event.target.value) || 1)}
                  className="w-16 border border-[color:var(--rule)] bg-transparent px-2 py-1.5 text-center text-[color:var(--foreground)]"
                />
              </label>
              <label className="flex items-center gap-2 text-[color:var(--muted-ink)]">
                سياسة المصدر
                <select
                  aria-label="سياسة المصدر"
                  value={sourcePolicy}
                  onChange={(event) => void updateSourcePolicy(event.target.value as SourcePolicy)}
                  className="border border-[color:var(--rule)] bg-transparent px-2 py-1.5 text-[color:var(--foreground)]"
                >
                  {policyChoices.map((choice) => (
                    <option key={choice.value} value={choice.value}>{choice.label}</option>
                  ))}
                </select>
              </label>
              <label htmlFor="source-file" className="cursor-pointer text-[color:var(--lapis)] underline font-semibold">
                📎 إضافة ملف
                <input
                  id="source-file"
                  type="file"
                  accept=".pdf,.docx,.txt,.md,.markdown"
                  className="sr-only"
                  onChange={(event) => {
                    void addSourceFile(event.target.files?.[0] ?? null);
                    event.target.value = "";
                  }}
                />
              </label>
              {addingSource && <span className="text-[color:var(--muted-ink)]">جارٍ إضافة المصدر…</span>}
              <details className="min-w-0">
                <summary className="cursor-pointer select-none text-[color:var(--lapis)] underline font-semibold">لصق نص مصدر</summary>
                <div className="mt-2 space-y-2">
                  <input
                    aria-label="اسم المصدر (اختياري)"
                    value={pastedName}
                    onChange={(event) => setPastedName(event.target.value)}
                    placeholder="اسم المصدر (اختياري)"
                    className="w-full border border-[color:var(--rule)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[color:var(--lapis)]"
                  />
                  <textarea
                    aria-label="نص المصدر الملصق"
                    value={pastedText}
                    onChange={(event) => setPastedText(event.target.value)}
                    placeholder="الصق هنا النص الذي تريد استخدامه مصدرًا للأسئلة"
                    rows={3}
                    className="w-full resize-y border border-[color:var(--rule)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[color:var(--lapis)]"
                  />
                  <button
                    type="button"
                    onClick={addPastedSource}
                    disabled={addingSource || !pastedText.trim()}
                    className="border border-[color:var(--lapis)] text-[color:var(--lapis)] px-4 py-2 rounded-sm text-sm font-semibold disabled:opacity-50"
                  >
                    {addingSource ? "جارٍ الإضافة…" : "إضافة النص الملصق"}
                  </button>
                </div>
              </details>
              {sources.length > 0 && (
                <span className="flex flex-wrap items-center gap-2">
                  {sources.map((source) => (
                    <button
                      key={source.id}
                      type="button"
                      onClick={() => void removeSource(source.id)}
                      aria-label={`إزالة المصدر ${source.name}`}
                      className="border border-[color:var(--rule)] px-2 py-1 rounded-sm text-[color:var(--muted-ink)] hover:text-[color:var(--red)]"
                    >
                      ✕ {source.name}
                    </button>
                  ))}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
