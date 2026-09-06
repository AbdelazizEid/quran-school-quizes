export const SOURCE_POLICIES = [
  "GENERAL_KNOWLEDGE_ONLY",
  "SOURCES_ONLY",
  "SOURCES_PLUS_GENERAL_KNOWLEDGE",
] as const;

export type SourcePolicy = (typeof SOURCE_POLICIES)[number];

export function isSourcePolicy(value: unknown): value is SourcePolicy {
  return typeof value === "string" && (SOURCE_POLICIES as readonly string[]).includes(value);
}

export const SOURCE_POLICY_LABELS: Record<SourcePolicy, string> = {
  GENERAL_KNOWLEDGE_ONLY: "المعرفة العامة فقط",
  SOURCES_ONLY: "المصادر المرفوعة فقط",
  SOURCES_PLUS_GENERAL_KNOWLEDGE: "المصادر المرفوعة مع المعرفة العامة",
};

export const DEFAULT_SOURCE_POLICY = "GENERAL_KNOWLEDGE_ONLY" as const;
export const SOURCE_POLICY_LABEL = SOURCE_POLICY_LABELS.GENERAL_KNOWLEDGE_ONLY;
export const SUPPLEMENTAL_LABEL = "محتوى إضافي من المعرفة العامة";
export const SOURCE_LABEL = "من المصدر المرفوع";
export const DEFAULT_QUESTION_COUNT = 10;
export const MAX_QUESTION_COUNT = 30;

export type QuestionKind = "MCQ" | "TRUE_FALSE" | "INPUT";

export type DraftOption = {
  text: string;
  isCorrect: boolean;
};

export type SourceEvidence =
  | {
      type: "general_knowledge";
      label: string;
    }
  | {
      type: "source";
      label: string;
      documentName: string;
      excerpt: string;
      pageSection?: string;
    };

export type DraftQuestion = {
  kind: QuestionKind;
  text: string;
  timeLimitSec: number;
  options: DraftOption[];
  sourceEvidence?: SourceEvidence | null;
};

export type DraftMessage = {
  role: "teacher" | "assistant";
  content: string;
  createdAt: string;
};

export type DraftData = {
  title: string;
  description: string;
  questions: unknown;
};

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(error: string): { valid: false; error: string } {
  return { valid: false, error };
}

export function validateQuizDraft(draft: DraftData): { valid: true } | { valid: false; error: string } {
  if (typeof draft.title !== "string" || !draft.title.trim()) return invalid("title-required");
  if (!Array.isArray(draft.questions)) return invalid("questions-required");
  if (draft.questions.length === 0) return invalid("questions-required");
  if (draft.questions.length > MAX_QUESTION_COUNT) return invalid("too-many-questions");

  for (const question of draft.questions) {
    if (!isRecord(question)) return invalid("invalid-question");
    if (!(["MCQ", "TRUE_FALSE", "INPUT"] as string[]).includes(String(question.kind))) {
      return invalid("invalid-question-kind");
    }
    if (typeof question.text !== "string" || !question.text.trim()) {
      return invalid("question-text-required");
    }
    if (
      typeof question.timeLimitSec !== "number" ||
      !Number.isInteger(question.timeLimitSec) ||
      question.timeLimitSec < 5 ||
      question.timeLimitSec > 120
    ) {
      return invalid("invalid-time-limit");
    }

    if (!Array.isArray(question.options)) return invalid("options-required");
    const options = question.options;
    for (const option of options) {
      if (!isRecord(option) || typeof option.text !== "string" || !option.text.trim()) {
        return invalid("option-text-required");
      }
      if (typeof option.isCorrect !== "boolean") return invalid("invalid-option");
    }

    if (question.kind === "MCQ") {
      if (options.length < 2) return invalid("mcq-options-required");
      if (options.length > 4) return invalid("too-many-options");
      if (options.filter((option) => option.isCorrect === true).length !== 1) {
        return invalid("mcq-single-correct-required");
      }
    }

    if (question.kind === "TRUE_FALSE") {
      if (
        options.length !== 2 ||
        options[0].text !== "صح" ||
        options[1].text !== "خطأ" ||
        options.filter((option) => option.isCorrect === true).length !== 1
      ) {
        return invalid("true-false-options-required");
      }
    }

    if (question.kind === "INPUT" && options.length !== 0) {
      return invalid("input-options-not-allowed");
    }
  }

  return { valid: true };
}

export function draftQuestions(value: unknown): DraftQuestion[] {
  return Array.isArray(value) ? (value as DraftQuestion[]) : [];
}

/** Arabic explanations shared by every surface that saves Questions
 * (AI draft save and manual Quiz create/edit). */
export const VALIDATION_ERROR_MESSAGES: Record<string, string> = {
  "title-required": "أضف عنوانًا للاختبار قبل الحفظ.",
  "questions-required": "أضف سؤالًا واحدًا على الأقل.",
  "invalid-question": "بيانات أحد الأسئلة غير صالحة.",
  "invalid-question-kind": "نوع أحد الأسئلة غير صالح.",
  "question-text-required": "كل الأسئلة تحتاج نصًا.",
  "invalid-time-limit": "الوقت يجب أن يكون بين 5 و120 ثانية.",
  "options-required": "كل سؤال اختيار يحتاج إلى خيارات.",
  "option-text-required": "كل الخيارات تحتاج نصًا.",
  "invalid-option": "بيانات أحد الخيارات غير صالحة.",
  "mcq-options-required": "يحتاج سؤال الاختيار من متعدد إلى خيارين على الأقل.",
  "too-many-options": "لا يمكن أن يتجاوز السؤال أربعة خيارات.",
  "mcq-single-correct-required": "يحتاج سؤال الاختيار من متعدد إلى إجابة صحيحة واحدة.",
  "true-false-options-required": "يجب أن يحتوي سؤال صح وخطأ على خيارَي صح وخطأ وإجابة صحيحة واحدة.",
  "input-options-not-allowed": "لا يمكن لسؤال الإجابة الحرة أن يحتوي على خيارات.",
  "too-many-questions": "لا يمكن أن يتجاوز الاختبار 30 سؤالًا.",
};

export function validationErrorMessage(code: string): string {
  return VALIDATION_ERROR_MESSAGES[code] ?? "تعذّر حفظ الاختبار: بيانات الأسئلة غير صالحة.";
}

export type ManualQuestionInput = {
  kind?: unknown;
  text?: unknown;
  timeLimitSec?: unknown;
  options?: unknown;
};

/** Defensively coerce manual Quiz question input into the shape that is
 * actually stored, so the shared semantic validator can judge it. Junk
 * stays junk on purpose — validateQuizDraft rejects it with a 400. */
export function normalizeManualQuestions(questions: unknown): DraftQuestion[] {
  const rows = Array.isArray(questions) ? questions : [];
  return rows.map((row) => {
    const question = (row ?? {}) as ManualQuestionInput;
    const rawOptions = Array.isArray(question.options) ? question.options : [];
    const options = rawOptions.map((option) => {
      const record = (option ?? {}) as { text?: unknown; isCorrect?: unknown };
      return { text: record.text as string, isCorrect: record.isCorrect === true };
    });
    if (question.kind === "INPUT") {
      return { kind: "INPUT", text: question.text as string, timeLimitSec: timeLimitOf(question), options: [] };
    }
    if (question.kind === "TRUE_FALSE") {
      return {
        kind: "TRUE_FALSE",
        text: question.text as string,
        timeLimitSec: timeLimitOf(question),
        options: [
          { text: "صح", isCorrect: options.some((option) => option.isCorrect && option.text === "صح") },
          { text: "خطأ", isCorrect: options.some((option) => option.isCorrect && option.text === "خطأ") },
        ],
      };
    }
    return {
      kind: question.kind as DraftQuestion["kind"],
      text: question.text as string,
      timeLimitSec: timeLimitOf(question),
      options,
    };
  });
}

function timeLimitOf(question: ManualQuestionInput): number {
  return typeof question.timeLimitSec === "number" ? question.timeLimitSec : 20;
}

export function draftMessages(value: unknown): DraftMessage[] {
  return Array.isArray(value) ? (value as DraftMessage[]) : [];
}

export function generalKnowledgeEvidence(policy: SourcePolicy = DEFAULT_SOURCE_POLICY): SourceEvidence {
  return {
    type: "general_knowledge",
    label: policy === "SOURCES_PLUS_GENERAL_KNOWLEDGE" ? SUPPLEMENTAL_LABEL : SOURCE_POLICY_LABEL,
  };
}

export function sourceEvidence(documentName: string, excerpt: string, pageSection?: string): SourceEvidence {
  return pageSection
    ? { type: "source", label: SOURCE_LABEL, documentName, excerpt, pageSection }
    : { type: "source", label: SOURCE_LABEL, documentName, excerpt };
}

export const MAX_EVIDENCE_EXCERPT_CHARS = 300;

/** Compact, shape-checked Source Evidence for saving; anything unusable
 * falls back to the supplemental general-knowledge marker. */
export function compactSourceEvidence(
  evidence: unknown,
  policy: SourcePolicy = DEFAULT_SOURCE_POLICY,
): SourceEvidence {
  if (isRecord(evidence)) {
    if (evidence.type === "general_knowledge" && typeof evidence.label === "string" && evidence.label.trim()) {
      return { type: "general_knowledge", label: evidence.label.trim() };
    }
    if (
      evidence.type === "source" &&
      typeof evidence.label === "string" &&
      evidence.label.trim() &&
      typeof evidence.documentName === "string" &&
      evidence.documentName.trim() &&
      typeof evidence.excerpt === "string" &&
      evidence.excerpt.trim()
    ) {
      const collapsed = evidence.excerpt.replace(/\s+/g, " ").trim();
      const excerpt =
        collapsed.length <= MAX_EVIDENCE_EXCERPT_CHARS
          ? collapsed
          : `${collapsed.slice(0, MAX_EVIDENCE_EXCERPT_CHARS)}…`;
      const pageSection =
        typeof evidence.pageSection === "string" && evidence.pageSection.trim() ? evidence.pageSection.trim() : undefined;
      return sourceEvidence(evidence.documentName.trim(), excerpt, pageSection);
    }
  }
  return generalKnowledgeEvidence(policy);
}
