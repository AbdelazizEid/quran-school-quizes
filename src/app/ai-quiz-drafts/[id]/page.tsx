"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
type RevisionChange = { questionIndex: number; question: Question };
type Revision = {
  mode: "targeted" | "new-set";
  instruction: string;
  summary: string;
  baseQuestions: Question[];
  proposedQuestions: Question[];
  changes: RevisionChange[];
  proposedTitle?: string;
  createdAt: string;
};
type SourcePolicy = "GENERAL_KNOWLEDGE_ONLY" | "SOURCES_ONLY" | "SOURCES_PLUS_GENERAL_KNOWLEDGE";
type SourceMetadata = { id: string; kind: string; name: string; charCount: number };
type Draft = {
  id: string;
  title: string;
  description: string;
  instruction: string;
  sourcePolicy: SourcePolicy;
  questions: Question[];
  messages: Message[];
  pendingRevision: Revision | null;
  sources: SourceMetadata[];
};

const policyChoices: { value: SourcePolicy; label: string; hint: string }[] = [
  { value: "GENERAL_KNOWLEDGE_ONLY", label: "المعرفة العامة فقط", hint: "لا تُستخدم ملفات أو مصادر مرفوعة." },
  { value: "SOURCES_ONLY", label: "المصادر المرفوعة فقط", hint: "تُبنى الأسئلة من المصادر المرفوعة وحدها." },
  { value: "SOURCES_PLUS_GENERAL_KNOWLEDGE", label: "المصادر المرفوعة مع المعرفة العامة", hint: "المصادر أولًا، وما زاد يُوسم كمحتوى إضافي." },
];

const policyLabel = (policy: string) => policyChoices.find((choice) => choice.value === policy)?.label ?? policyChoices[0].label;

const kindLabels: Record<string, string> = {
  pdf: "PDF",
  docx: "Word",
  txt: "نص",
  md: "Markdown",
  pasted: "نص ملصق",
};

const errorLabels: Record<string, string> = {
  "instruction-required": "اكتب تعليمات المسودة أولًا.",
  "question-count-invalid": "عدد الأسئلة يجب أن يكون بين 1 و30 سؤالًا. أنقص العدد المطلوب ثم أعد المحاولة.",
  "rate-limited": "لقد بلغت الحد المسموح من عمليات توليد الأسئلة خلال هذه الساعة. انتظر قليلًا ثم أعد المحاولة.",
  "generation-in-progress": "هناك عملية توليد جارية الآن لهذه الحساب. انتظر اكتمالها قبل طلب عملية أخرى.",
  "sources-text-too-large": "إجمالي نصوص المصادر يتجاوز الحد المسموح إرساله. أزل بعض المصادر أو اختصر نصوصها، أو غيّر سياسة المصدر إلى المعرفة العامة فقط.",
  "provider-failed": "تعذّر إعداد المسودة. حاول مرة أخرى.",
  "provider-timeout": "استغرق إعداد المسودة وقتًا طويلًا. حاول مرة أخرى.",
  "provider-authentication": "تعذّر الاتصال بخدمة الذكاء الاصطناعي. حاول مرة أخرى.",
  "provider-rate-limit": "الخدمة مشغولة مؤقتًا. حاول مرة أخرى لاحقًا.",
  "provider-malformed-response": "أعادت الخدمة نتيجة غير صالحة. حاول مرة أخرى.",
  "provider-unavailable": "الخدمة غير متاحة مؤقتًا. حاول مرة أخرى.",
  "provider-not-configured": "خدمة الذكاء الاصطناعي غير مهيأة حاليًا.",
  "draft-required": "أنشئ مسودة أولية قبل طلب مراجعة موجهة.",
  "revision-not-found": "لا توجد مراجعة معلقة حاليًا.",
  "revision-pending": "طبّق المراجعة أو تجاهلها قبل حفظ الاختبار.",
  "invalid-revision-action": "إجراء المراجعة غير صالح.",
  "invalid-generation-mode": "نوع إنشاء المسودة غير صالح.",
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

export default function AiQuizDraftPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [instruction, setInstruction] = useState("");
  const [questionCount, setQuestionCount] = useState(10);
  const [tab, setTab] = useState<"conversation" | "draft">("conversation");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<"targeted" | "new-set" | "initial" | null>(null);
  const [revisionAction, setRevisionAction] = useState<"apply" | "discard" | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourcePolicy, setSourcePolicy] = useState<SourcePolicy>("GENERAL_KNOWLEDGE_ONLY");
  const [sources, setSources] = useState<SourceMetadata[]>([]);
  const [pastedText, setPastedText] = useState("");
  const [pastedName, setPastedName] = useState("");
  const [addingSource, setAddingSource] = useState(false);
  const [removingSourceId, setRemovingSourceId] = useState<string | null>(null);

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
         setDraft({ ...data, sources: data.sources ?? [], pendingRevision: data.pendingRevision ?? null });
        setInstruction(data.instruction);
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

  function updateQuestion(index: number, patch: Partial<Question>) {
    setDraft((current) => {
      if (!current) return current;
      const questions = [...current.questions];
      const question = { ...questions[index], ...patch };
      if (patch.kind === "TRUE_FALSE") {
        const currentCorrect = question.options.find((option) => option.isCorrect)?.text;
        question.options = [
          { text: "صح", isCorrect: currentCorrect === "صح" || !currentCorrect },
          { text: "خطأ", isCorrect: currentCorrect === "خطأ" },
        ];
      }
      if (patch.kind === "INPUT") question.options = [];
      if (patch.kind === "MCQ" && question.options.length < 2) {
        question.options = [
          { text: "", isCorrect: true },
          { text: "", isCorrect: false },
        ];
      }
      questions[index] = question;
      return { ...current, questions };
    });
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    setDraft((current) => {
      if (!current) return current;
      const target = index + direction;
      if (target < 0 || target >= current.questions.length) return current;
      const questions = [...current.questions];
      [questions[index], questions[target]] = [questions[target], questions[index]];
      return { ...current, questions };
    });
  }

  function removeOption(questionIndex: number, optionIndex: number) {
    setDraft((current) => {
      if (!current) return current;
      const question = current.questions[questionIndex];
      const removed = question.options[optionIndex];
      const options = question.options.filter((_, index) => index !== optionIndex);
      if (removed?.isCorrect && options.length > 0) options[0] = { ...options[0], isCorrect: true };
      const questions = [...current.questions];
      questions[questionIndex] = { ...question, options };
      return { ...current, questions };
    });
  }

  function updateOption(questionIndex: number, optionIndex: number, text: string) {
    setDraft((current) => {
      if (!current) return current;
      const questions = [...current.questions];
      const options = [...questions[questionIndex].options];
      options[optionIndex] = { ...options[optionIndex], text };
      questions[questionIndex] = { ...questions[questionIndex], options };
      return { ...current, questions };
    });
  }

  function markCorrect(questionIndex: number, optionIndex: number) {
    setDraft((current) => {
      if (!current) return current;
      const questions = [...current.questions];
      questions[questionIndex] = {
        ...questions[questionIndex],
        options: questions[questionIndex].options.map((option, index) => ({
          ...option,
          isCorrect: index === optionIndex,
        })),
      };
      return { ...current, questions };
    });
  }

  async function patchDraft(showNotice = true) {
    if (!draft) return false;
    const response = await fetch(`/api/ai-quiz-drafts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instruction,
        sourcePolicy,
        title: draft.title,
        description: draft.description,
        questions: draft.questions,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(errorMessage(data.error));
      return false;
    }
    setDraft({ ...data.draft, sources: data.draft.sources ?? [], pendingRevision: data.draft.pendingRevision ?? null });
    setSources(data.draft.sources ?? []);
    if (showNotice) setNotice("تم حفظ تعديلات المسودة.");
    return true;
  }

  async function updateSourcePolicy(policy: SourcePolicy) {
    setSourcePolicy(policy);
    setError(null);
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
    setRemovingSourceId(sourceId);
    setError(null);
    const response = await fetch(`/api/ai-quiz-drafts/${id}/sources/${sourceId}`, { method: "DELETE" });
    setRemovingSourceId(null);
    if (!response.ok) {
      setError(errorMessage((await response.json()).error));
      return;
    }
    setSources((current) => current.filter((source) => source.id !== sourceId));
    setNotice("تمت إزالة المصدر من المسودة.");
  }

  async function generate(mode: "initial" | "targeted" | "new-set") {
    setError(null);
    setNotice(null);
    if (!(await patchDraft(false))) return;
    setGenerating(mode);
    const response = await fetch(`/api/ai-quiz-drafts/${id}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction, questionCount, mode }),
    });
    const data = await response.json();
    setGenerating(null);
    if (!response.ok) {
      setError(errorMessage(data.error));
      return;
    }
    setDraft({ ...data.draft, sources: data.draft.sources ?? [], pendingRevision: data.draft.pendingRevision ?? null });
    setSources(data.draft.sources ?? []);
    if (data.response.type === "clarification") setNotice(data.response.message);
    else if (data.response.type === "revision") setNotice(data.response.message);
    else if (mode === "new-set") setNotice("أُعدّت مجموعة جديدة للمعاينة. طبّقها إذا وافقت عليها.");
    else setNotice("أُعدّت المسودة. راجع الأسئلة ثم احفظها كاختبار.");
    setTab("draft");
  }

  async function updateRevision(action: "apply" | "discard") {
    setError(null);
    setNotice(null);
    setRevisionAction(action);
    if (!(await patchDraft(false))) {
      setRevisionAction(null);
      return;
    }
    const response = await fetch(`/api/ai-quiz-drafts/${id}/revision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await response.json();
    setRevisionAction(null);
    if (!response.ok) {
      setError(errorMessage(data.error));
      return;
    }
    setDraft({ ...data.draft, sources: data.draft.sources ?? [], pendingRevision: data.draft.pendingRevision ?? null });
    setSources(data.draft.sources ?? []);
    if (action === "discard") {
      setNotice("تم تجاهل المراجعة، وبقيت المسودة الحالية دون تغيير.");
    } else if (data.conflictedQuestionIndexes?.length) {
      setNotice("طُبّقت المراجعة، وحُفظت تعديلات المعلّم في الأسئلة المتعارضة.");
    } else {
      setNotice("تم تطبيق المراجعة على المسودة.");
    }
  }

  async function saveAsQuiz() {
    setError(null);
    setNotice(null);
    setSaving(true);
    if (!(await patchDraft(false))) {
      setSaving(false);
      return;
    }
    const response = await fetch(`/api/ai-quiz-drafts/${id}/save`, { method: "POST" });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) {
      setError(errorMessage(data.error));
      return;
    }
    router.push("/quizzes");
  }

  async function discard() {
    const response = await fetch(`/api/ai-quiz-drafts/${id}`, { method: "DELETE" });
    if (response.ok) router.push("/ai-quiz-drafts");
    else setError(errorMessage((await response.json()).error));
  }

  if (loading) return <main className="max-w-5xl mx-auto px-5 py-14">جارٍ تحميل المسودة…</main>;
  if (!draft) return <main className="max-w-5xl mx-auto px-5 py-14 text-[color:var(--red)]">{error}</main>;

  return (
    <main className="min-h-screen max-w-6xl mx-auto px-5 md:px-6 py-8 md:py-12">
      <header className="flex flex-wrap items-start justify-between gap-5 border-b border-[color:var(--rule)] pb-6">
        <div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <Link href="/ai-quiz-drafts" className="text-[color:var(--lapis)] hover:underline">مسودات الاختبارات</Link>
            <button type="button" onClick={discard} className="text-[color:var(--muted-ink)] underline hover:text-[color:var(--red)]">حذف المسودة</button>
          </div>
          <h1 className="mt-2 text-4xl font-bold">محادثة مسودة اختبار</h1>
          <p className="mt-2 text-[color:var(--muted-ink)]">اطلب الأسئلة، راجعها وعدّلها، ثم احفظها كاختبار.</p>
        </div>
        <button type="button" onClick={saveAsQuiz} disabled={saving} className="bg-[color:var(--foreground)] text-[color:var(--background)] px-5 py-2.5 rounded-sm font-semibold disabled:opacity-50">
          {saving ? "جارٍ الحفظ…" : "حفظ كاختبار"}
        </button>
      </header>

      {(notice || error) && (
        <p className={`mt-4 border-s ps-4 ${error ? "border-[color:var(--red)] text-[color:var(--red)]" : "border-[color:var(--gold)] text-[color:var(--muted-ink)]"}`} role={error ? "alert" : "status"}>{error || notice}</p>
      )}

      <div className="mt-5 grid grid-cols-2 gap-2 md:hidden">
        <button type="button" onClick={() => setTab("conversation")} aria-pressed={tab === "conversation"} className={`py-3 border-b-2 font-semibold ${tab === "conversation" ? "border-[color:var(--lapis)] text-[color:var(--lapis)]" : "border-[color:var(--rule)]"}`}>
          المحادثة
        </button>
        <button type="button" onClick={() => setTab("draft")} aria-pressed={tab === "draft"} className={`py-3 border-b-2 font-semibold ${tab === "draft" ? "border-[color:var(--lapis)] text-[color:var(--lapis)]" : "border-[color:var(--rule)]"}`}>
          المسودة
        </button>
      </div>

      <div className="mt-6 grid gap-8 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <section className={tab === "conversation" ? "block" : "hidden md:block"} aria-labelledby="conversation-heading">
          <h2 id="conversation-heading" className="text-2xl font-bold border-b border-[color:var(--rule)] pb-4">المحادثة</h2>

          <div className="mt-5 border-s border-[color:var(--rule)] ps-5 space-y-5" aria-live="polite">
            {draft.messages.length === 0 && <p className="text-[color:var(--muted-ink)]">لم تبدأ المحادثة بعد.</p>}
            {draft.messages.map((message, index) => (
              <div key={`${message.createdAt}-${index}`}>
                <p className="text-xs text-[color:var(--gold-deep)]">{message.role === "teacher" ? "أنت" : "المساعد"}</p>
                <p className="mt-1 leading-7">{message.content}</p>
              </div>
            ))}
          </div>

          <label htmlFor="instruction" className="mt-6 block font-semibold">تعليماتك</label>
          <textarea
            id="instruction"
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            placeholder="مثال: أنشئ أسئلة عن آداب تلاوة القرآن لطلاب المرحلة المتوسطة"
            rows={3}
            className="mt-2 w-full resize-y border border-[color:var(--rule)] bg-transparent px-4 py-3 outline-none focus:border-[color:var(--lapis)]"
          />
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <label className="text-sm">
              <span className="block mb-1 text-[color:var(--muted-ink)]">عدد الأسئلة</span>
              <input type="number" min={1} max={30} value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value) || 1)} className="w-20 border border-[color:var(--rule)] bg-transparent px-3 py-2 text-center" />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => generate(draft.questions.length === 0 ? "initial" : "targeted")}
                disabled={generating !== null}
                className="bg-[color:var(--lapis)] text-[color:var(--background)] px-5 py-3 rounded-sm font-semibold disabled:opacity-50"
              >
                {generating ? "جارٍ إعداد الاقتراح…" : draft.questions.length === 0 ? "أنشئ مسودة الأسئلة" : "اقترح مراجعة موجهة"}
              </button>
              {draft.questions.length > 0 && (
                <button
                  type="button"
                  onClick={() => generate("new-set")}
                  disabled={generating !== null}
                  className="px-2 py-3 text-sm text-[color:var(--lapis)] underline font-semibold disabled:opacity-50"
                >
                  {generating === "new-set" ? "جارٍ إعداد المجموعة…" : "أو اقترح مجموعة جديدة"}
                </button>
              )}
            </div>
          </div>
          <details
            className="mt-6 border-t border-[color:var(--rule)] pt-4"
            open={sources.length > 0 || sourcePolicy !== "GENERAL_KNOWLEDGE_ONLY"}
          >
            <summary className="cursor-pointer select-none font-semibold">
              المصادر وسياسة التوليد
              <span className="ms-2 text-xs font-normal text-[color:var(--muted-ink)]">
                {sources.length > 0 ? `${policyLabel(sourcePolicy)} · ${sources.length} مصدر` : policyLabel(sourcePolicy)}
              </span>
            </summary>
            <fieldset className="mt-4">
              <legend className="text-sm text-[color:var(--muted-ink)]">سياسة المصدر</legend>
              <div className="mt-2 space-y-2">
                {policyChoices.map((choice) => (
                  <label key={choice.value} className="flex cursor-pointer items-start gap-2">
                    <input
                      type="radio"
                      name="source-policy"
                      value={choice.value}
                      checked={sourcePolicy === choice.value}
                      onChange={() => void updateSourcePolicy(choice.value)}
                      className="mt-1"
                    />
                    <span>
                      <span className="block font-semibold">{choice.label}</span>
                      <span className="block text-xs text-[color:var(--muted-ink)]">{choice.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
              {sourcePolicy !== "GENERAL_KNOWLEDGE_ONLY" && sources.length === 0 && (
                <p className="mt-2 text-sm text-[color:var(--gold-deep)]">أضف مصدرًا واحدًا على الأقل حتى تُبنى الأسئلة من المصادر.</p>
              )}
            </fieldset>

            <h3 id="sources-heading" className="mt-5 font-semibold">المصادر المؤقتة</h3>

            <ul className="mt-3 space-y-2" aria-label="قائمة المصادر">
              {sources.length === 0 && <li className="text-sm text-[color:var(--muted-ink)]">لا توجد مصادر مضافة.</li>}
              {sources.map((source) => (
                <li key={source.id} className="flex items-center justify-between gap-3 border border-[color:var(--rule)] px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{source.name}</p>
                    <p className="text-xs text-[color:var(--muted-ink)]">{kindLabels[source.kind] ?? source.kind} · {source.charCount} حرفًا</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeSource(source.id)}
                    disabled={removingSourceId !== null}
                    aria-label={`إزالة المصدر ${source.name}`}
                    className="shrink-0 border border-[color:var(--red)] text-[color:var(--red)] px-3 py-1.5 text-sm rounded-sm disabled:opacity-50"
                  >
                    {removingSourceId === source.id ? "جارٍ الإزالة…" : "إزالة"}
                  </button>
                </li>
              ))}
            </ul>

            <label htmlFor="source-file" className="mt-4 block text-sm font-semibold">إضافة ملف</label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                id="source-file"
                type="file"
                accept=".pdf,.docx,.txt,.md,.markdown"
                onChange={(event) => {
                  void addSourceFile(event.target.files?.[0] ?? null);
                  event.target.value = "";
                }}
                className="text-sm"
              />
              {addingSource && <span className="text-sm text-[color:var(--muted-ink)]">جارٍ إضافة المصدر…</span>}
            </div>

            <label htmlFor="pasted-source-name" className="mt-4 block text-sm font-semibold">لصق نص مصدر</label>
            <input
              id="pasted-source-name"
              value={pastedName}
              onChange={(event) => setPastedName(event.target.value)}
              placeholder="اسم المصدر (اختياري)"
              className="mt-2 w-full border border-[color:var(--rule)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[color:var(--lapis)]"
            />
            <textarea
              aria-label="نص المصدر الملصق"
              value={pastedText}
              onChange={(event) => setPastedText(event.target.value)}
              placeholder="الصق هنا النص الذي تريد استخدامه مصدرًا للأسئلة"
              rows={3}
              className="mt-2 w-full resize-y border border-[color:var(--rule)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[color:var(--lapis)]"
            />
            <button
              type="button"
              onClick={addPastedSource}
              disabled={addingSource || !pastedText.trim()}
              className="mt-2 border border-[color:var(--lapis)] text-[color:var(--lapis)] px-4 py-2 rounded-sm text-sm font-semibold disabled:opacity-50"
            >
              {addingSource ? "جارٍ الإضافة…" : "إضافة النص الملصق"}
            </button>
          </details>
        </section>

        <section className={tab === "draft" ? "block" : "hidden md:block"} aria-labelledby="draft-heading">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[color:var(--rule)] pb-4">
            <div>
              <h2 id="draft-heading" className="text-2xl font-bold">المسودة القابلة للتحرير</h2>
              <p className="mt-1 text-sm text-[color:var(--muted-ink)]">{policyLabel(sourcePolicy)} · {draft.questions.length} أسئلة</p>
            </div>
            <button type="button" onClick={() => patchDraft()} className="text-sm text-[color:var(--lapis)] underline">حفظ تعديلات المسودة</button>
          </div>

          {draft.pendingRevision && (
            <section className="mt-6 border-y-2 border-[color:var(--gold)] py-5" aria-labelledby="revision-heading">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 id="revision-heading" className="text-xl font-bold">معاينة المراجعة المقترحة</h3>
                  <p className="mt-1 text-sm text-[color:var(--muted-ink)]">{draft.pendingRevision.summary}</p>
                </div>
                <span className="text-sm text-[color:var(--gold-deep)]">
                  {draft.pendingRevision.mode === "new-set" ? "مجموعة جديدة" : "مراجعة موجهة"}
                </span>
              </div>
              {draft.pendingRevision.mode === "new-set" && draft.pendingRevision.proposedTitle && (
                <p className="mt-4 text-sm">العنوان المقترح: {draft.pendingRevision.proposedTitle}</p>
              )}
              <ol className="mt-4 space-y-4">
                {draft.pendingRevision.changes.map((change) => {
                  const currentQuestion = draft.questions[change.questionIndex];
                  return (
                    <li key={change.questionIndex} className="border-s border-[color:var(--gold)] ps-4">
                      <p className="font-semibold">سؤال {change.questionIndex + 1}</p>
                      {currentQuestion && <p className="mt-1 text-sm text-[color:var(--muted-ink)]">الحالي: {currentQuestion.text}</p>}
                      <p className="mt-1">المقترح: {change.question.text}</p>
                      {change.question.options.length > 0 && (
                        <p className="mt-1 text-sm text-[color:var(--muted-ink)]">
                          الخيارات: {change.question.options.map((option) => option.text).join(" · ")}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ol>
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => updateRevision("apply")}
                  disabled={revisionAction !== null}
                  className="bg-[color:var(--foreground)] text-[color:var(--background)] px-5 py-2.5 rounded-sm font-semibold disabled:opacity-50"
                >
                  {revisionAction === "apply" ? "جارٍ التطبيق…" : "تطبيق المراجعة"}
                </button>
                <button
                  type="button"
                  onClick={() => updateRevision("discard")}
                  disabled={revisionAction !== null}
                  className="border border-[color:var(--red)] text-[color:var(--red)] px-5 py-2.5 rounded-sm disabled:opacity-50"
                >
                  {revisionAction === "discard" ? "جارٍ التجاهل…" : "تجاهل المراجعة"}
                </button>
              </div>
            </section>
          )}

          <label htmlFor="draft-title" className="mt-5 block font-semibold">عنوان الاختبار</label>
          <input id="draft-title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className="mt-2 w-full border-2 border-[color:var(--rule)] bg-transparent px-4 py-3 text-xl font-semibold outline-none focus:border-[color:var(--lapis)]" />
          <label htmlFor="draft-description" className="mt-4 block text-sm font-semibold">الوصف</label>
          <textarea id="draft-description" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={2} className="mt-2 w-full border border-[color:var(--rule)] bg-transparent px-4 py-3 outline-none focus:border-[color:var(--lapis)]" />

          {draft.questions.length === 0 && <p className="mt-8 text-[color:var(--muted-ink)]">ستظهر الأسئلة هنا بعد التوليد.</p>}
          <div className="mt-6 space-y-6">
            {draft.questions.map((question, questionIndex) => (
              <article key={questionIndex} className="border-t border-[color:var(--rule)] pt-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-bold text-[color:var(--muted-ink)]">سؤال {questionIndex + 1}</h3>
                  <div className="flex items-center gap-2">
                    {questionIndex > 0 && (
                      <button type="button" onClick={() => moveQuestion(questionIndex, -1)} aria-label={`رفع السؤال ${questionIndex + 1}`} className="border border-[color:var(--rule)] px-2 py-1 text-sm">
                        لأعلى
                      </button>
                    )}
                    {questionIndex < draft.questions.length - 1 && (
                      <button type="button" onClick={() => moveQuestion(questionIndex, 1)} aria-label={`خفض السؤال ${questionIndex + 1}`} className="border border-[color:var(--rule)] px-2 py-1 text-sm">
                        لأسفل
                      </button>
                    )}
                    <label className="sr-only" htmlFor={`kind-${questionIndex}`}>نوع السؤال {questionIndex + 1}</label>
                    <select id={`kind-${questionIndex}`} value={question.kind} onChange={(event) => updateQuestion(questionIndex, { kind: event.target.value as QuestionKind })} className="border border-[color:var(--rule)] bg-transparent px-3 py-2">
                      <option value="MCQ">اختيار من متعدد</option>
                      <option value="TRUE_FALSE">صح / خطأ</option>
                      <option value="INPUT">إجابة حرة (للاختبار فقط)</option>
                    </select>
                    {draft.questions.length > 1 && <button type="button" onClick={() => setDraft({ ...draft, questions: draft.questions.filter((_, index) => index !== questionIndex) })} className="text-sm text-[color:var(--red)]">حذف</button>}
                  </div>
                </div>
                <textarea value={question.text} onChange={(event) => updateQuestion(questionIndex, { text: event.target.value })} rows={3} className="mt-3 w-full border border-[color:var(--rule)] bg-transparent px-4 py-3 text-lg outline-none focus:border-[color:var(--lapis)]" aria-label={`نص السؤال ${questionIndex + 1}`} />
                <label className="mt-3 flex items-center gap-2 text-sm text-[color:var(--muted-ink)]">
                  الوقت (ث)
                  <input type="number" min={5} max={120} value={question.timeLimitSec} onChange={(event) => updateQuestion(questionIndex, { timeLimitSec: Number(event.target.value) || 20 })} className="w-16 border border-[color:var(--rule)] bg-transparent px-2 py-1 text-center" />
                </label>
                {question.kind !== "INPUT" && (
                  <div className="mt-4 space-y-2">
                    {question.options.map((option, optionIndex) => (
                      <div key={optionIndex} className="flex items-center gap-2">
                        <input type="radio" name={`correct-${questionIndex}`} checked={option.isCorrect} onChange={() => markCorrect(questionIndex, optionIndex)} aria-label={`الإجابة الصحيحة ${optionIndex + 1}`} />
                        <input value={option.text} readOnly={question.kind === "TRUE_FALSE"} onChange={(event) => updateOption(questionIndex, optionIndex, event.target.value)} placeholder={`الخيار ${optionIndex + 1}`} className="min-w-0 grow border border-[color:var(--rule)] bg-transparent px-3 py-2 outline-none focus:border-[color:var(--lapis)]" />
                        {question.kind === "MCQ" && question.options.length > 2 && <button type="button" onClick={() => removeOption(questionIndex, optionIndex)} className="text-sm text-[color:var(--red)]">حذف</button>}
                      </div>
                    ))}
                    {question.kind === "MCQ" && question.options.length < 4 && <button type="button" onClick={() => updateQuestion(questionIndex, { options: [...question.options, { text: "", isCorrect: false }] })} className="text-sm text-[color:var(--lapis)] underline">+ إضافة خيار</button>}
                  </div>
                )}
                {question.kind === "INPUT" && <p className="mt-3 text-sm text-[color:var(--muted-ink)]">إجابة حرة وتُستخدم في الاختبار فقط.</p>}
                {question.sourceEvidence && (
                  <p className="mt-4 border-s border-[color:var(--gold)] ps-3 text-sm text-[color:var(--muted-ink)]">
                    {question.sourceEvidence.type === "source"
                      ? `${question.sourceEvidence.label} — ${question.sourceEvidence.documentName}${question.sourceEvidence.pageSection ? ` (${question.sourceEvidence.pageSection})` : ""}: «${question.sourceEvidence.excerpt}»`
                      : question.sourceEvidence.label}
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
