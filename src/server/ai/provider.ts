import {
  SOURCE_POLICY_LABELS,
  generalKnowledgeEvidence,
  sourceEvidence,
  validateQuizDraft,
} from "@/lib/ai-quiz-draft";
import type { DraftQuestion, QuestionKind, SourcePolicy } from "@/lib/ai-quiz-draft";

export const DEFAULT_GLM_MODEL = "glm-5.3-flash";
export const DEFAULT_GLM_BASE_URL = "https://api.z.ai/api/paas/v4";
const DEFAULT_TIMEOUT_MS = 150_000;

export type AiQuizProviderMode = "initial" | "targeted";

/** Extracted text only — original file bytes never reach the provider. */
export type AiQuizProviderSource = {
  name: string;
  kind: string;
  text: string;
};

export type AiQuizProviderRequest = {
  instruction: string;
  sourcePolicy: SourcePolicy;
  sources?: AiQuizProviderSource[];
  questionCount: number;
  difficulty: "easy" | "medium" | "hard";
  allowedKinds: QuestionKind[];
  mode?: AiQuizProviderMode;
  currentDraft?: {
    title: string;
    description: string;
    questions: DraftQuestion[];
  };
};

export type AiQuizProviderResponse =
  | { type: "clarification"; message: string }
  | { type: "draft"; title: string; description: string; questions: DraftQuestion[] }
  | {
      type: "revision";
      message: string;
      changes: { questionIndex: number; question: DraftQuestion }[];
    }
  | { type: "confirm_save"; message: string }
  | { type: "unsupported"; message: string };

export interface AiQuizProvider {
  /** True when a generate call consumes the paid shared allowance. */
  readonly metered: boolean;
  generate(request: AiQuizProviderRequest): Promise<AiQuizProviderResponse>;
  /** Streams raw model output through onDelta; same validation as generate. */
  generateStreaming?(
    request: AiQuizProviderRequest,
    onDelta: (text: string) => void,
  ): Promise<AiQuizProviderResponse>;
}

export type AiQuizProviderErrorCode =
  | "timeout"
  | "authentication"
  | "rate-limit"
  | "malformed-response"
  | "unavailable"
  | "not-configured";

const errorStatus: Record<AiQuizProviderErrorCode, number> = {
  timeout: 504,
  authentication: 502,
  "rate-limit": 429,
  "malformed-response": 502,
  unavailable: 502,
  "not-configured": 503,
};

export class AiQuizProviderError extends Error {
  readonly name = "AiQuizProviderError";
  readonly status: number;

  constructor(readonly code: AiQuizProviderErrorCode) {
    super(`GLM provider ${code}`);
    this.status = errorStatus[code];
  }
}

export type GlmProviderOptions = {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
};

type AiProviderEnvironment = {
  [key: string]: string | undefined;
  GLM_API_KEY?: string;
  GLM_MODEL?: string;
  GLM_BASE_URL?: string;
  GLM_TIMEOUT_MS?: string;
};

const questionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: { type: "string", enum: ["MCQ", "TRUE_FALSE", "INPUT"] },
    text: { type: "string" },
    timeLimitSec: { type: "integer", minimum: 5, maximum: 120 },
    options: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: { type: "string" },
          isCorrect: { type: "boolean" },
        },
        required: ["text", "isCorrect"],
      },
    },
    sourceEvidence: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: {
        type: { type: "string", enum: ["general_knowledge", "source"] },
        label: { type: "string" },
        documentName: { type: ["string", "null"] },
        excerpt: { type: ["string", "null"] },
        pageSection: { type: ["string", "null"] },
      },
      required: ["type", "label", "documentName", "excerpt"],
    },
  },
  required: ["kind", "text", "timeLimitSec", "options", "sourceEvidence"],
} as const;

const responseSchema = {  type: "object",
  additionalProperties: false,
  properties: {
    type: { type: "string", enum: ["clarification", "draft", "revision", "confirm_save", "unsupported"] },
    message: { type: ["string", "null"] },
    title: { type: ["string", "null"] },
    description: { type: ["string", "null"] },
    questions: {
      type: ["array", "null"],
      items: questionSchema,
    },
    changes: {
      type: ["array", "null"],
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          questionIndex: { type: "integer", minimum: 0 },
          question: questionSchema,
        },
        required: ["questionIndex", "question"],
      },
    },
  },
  required: ["type", "message", "title", "description", "questions", "changes"],
} as const;

function policyInstructionLines(policy: SourcePolicy): string[] {
  if (policy === "SOURCES_ONLY") {
    return [
      "لا تخترع آية أو مرجعًا أو Source Evidence. هذا الطلب يستخدم المصادر المرفوعة فقط: لا تستخدم المعرفة العامة إطلاقًا،",
      "وصنّف كل سؤال بـ Source Evidence من نوع source مع excerpt من المصدر وdocumentName باسم المصدر،",
      "وpageSection برقم الصفحة أو اسم القسم من المصدر إن كان متاحًا.",
    ];
  }
  if (policy === "SOURCES_PLUS_GENERAL_KNOWLEDGE") {
    return [
      "لا تخترع آية أو مرجعًا أو Source Evidence. هذا الطلب يستخدم المصادر المرفوعة أولًا ويجوز إكمال الناقص من المعرفة العامة،",
      "وصنّف كل سؤال مبني على المصدر بـ Source Evidence من نوع source مع excerpt وdocumentName،",
      "وpageSection برقم الصفحة أو اسم القسم من المصدر إن كان متاحًا، وكل سؤال من المعرفة العامة بنوع general_knowledge.",
    ];
  }
  return [
    "لا تخترع آية أو مرجعًا أو Source Evidence. هذا الطلب يستخدم المعرفة العامة فقط، ولذلك صنّف كل سؤال بالمعرفة العامة فقط.",
  ];
}

function systemInstructionsFor(policy: SourcePolicy): string {
  return [
    "أنت مساعد لإنشاء AI Quiz Draft Conversation في مدرسة قرآن.",
    "أخرج JSON فقط مطابقًا للمخطط المطلوب، ولا تضف Markdown أو شرحًا خارجه.",
    "كل النصوص الظاهرة للمدرس يجب أن تكون باللغة العربية فقط.",
    ...policyInstructionLines(policy),
    "استخدم clarification فقط إذا كانت التعليمات غير كافية لتحديد النطاق، واستخدم unsupported إذا كان الطلب غير مناسب لإنشاء أسئلة.",
    "استخدم confirm_save فقط إذا طلب المدرس صراحةً حفظ المسودة كاختبار وكانت المسودة الحالية تحتوي أسئلة مكتملة؛ وإذا كان الطلب غامضًا أو لا توجد أسئلة بعد فاستخدم clarification ولا تحفظ أبدًا بدون تأكيد صريح.",
    "في المراجعة الموجهة استخدم revision، وحدد أرقام الأسئلة المتأثرة فقط في changes، وأعد السؤال الكامل لكل تغيير.",
    "في المراجعة الموجهة لا تغيّر الأسئلة غير المذكورة ولا العنوان أو الوصف.",
    'قواعد لكل نوع: في MCQ من خيارين إلى أربعة خيارات بإجابة صحيحة واحدة بالضبط؛ في TRUE_FALSE يجب أن تكون options بالضبط: [{"text":"صح","isCorrect":true},{"text":"خطأ","isCorrect":false}] أو بعكس isCorrect مع بقاء إجابة صحيحة واحدة؛ في INPUT يجب أن تكون options مصفوفة فارغة []؛ وtimeLimitSec عدد صحيح بين 5 و120.',
    // The GLM endpoint does not enforce response_format json_schema, so the
    // contract travels in the prompt; keep it verbatim so output stays parseable.
    "أخرج كائن JSON واحدًا فقط يطابق هذا المخطط حرفيًا (المفاتيح والقيم كما هي، بلا Markdown):",
    JSON.stringify(responseSchema),
  ].join("\n");
}

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function configuredValue(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

function configuredTimeout(value: number | undefined): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS;
}

function configuredTimeoutFromEnv(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function chatCompletionsEndpoint(value: string): string {
  const endpoint = value.replace(/\/+$/, "");
  return endpoint.endsWith("/chat/completions") ? endpoint : `${endpoint}/chat/completions`;
}

function isArabicText(value: string): boolean {
  return /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/.test(value) && !/[A-Za-z]/.test(value);
}

function requiredArabicText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && isArabicText(text) ? text : null;
}

function optionalArabicText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return !text || isArabicText(text) ? text : null;
}

function parseEvidence(value: unknown, request: AiQuizProviderRequest) {
  if (!isRecord(value)) return null;
  if (!requiredArabicText(value.label)) return null;
  if (value.type === "general_knowledge") {
    return generalKnowledgeEvidence(request.sourcePolicy) as unknown;
  }
  if (value.type !== "source") return null;
  const sourceNames = (request.sources ?? []).map((source) => source.name);
  if (
    typeof value.documentName !== "string" ||
    !value.documentName.trim() ||
    (sourceNames.length > 0 && !sourceNames.includes(value.documentName)) ||
    typeof value.excerpt !== "string" ||
    !value.excerpt.trim()
  ) {
    return null;
  }
  return sourceEvidence(value.documentName, value.excerpt, optionalArabicText(value.pageSection) ?? undefined);
}

function parseQuestion(value: unknown, allowedKinds: QuestionKind[], request: AiQuizProviderRequest): DraftQuestion | null {
  if (!isRecord(value) || typeof value.kind !== "string" || !allowedKinds.includes(value.kind as QuestionKind)) return null;
  const text = requiredArabicText(value.text);
  if (!text || typeof value.timeLimitSec !== "number" || !Number.isInteger(value.timeLimitSec)) return null;
  if (!Array.isArray(value.options)) return null;

  const options = value.options.map((option) => {
    if (!isRecord(option)) return null;
    const optionText = requiredArabicText(option.text);
    return optionText && typeof option.isCorrect === "boolean"
      ? { text: optionText, isCorrect: option.isCorrect }
      : null;
  });
  if (options.some((option) => option === null)) return null;

  let evidence: unknown;
  if (value.sourceEvidence === undefined || value.sourceEvidence === null) {
    evidence = generalKnowledgeEvidence(request.sourcePolicy);
  } else {
    evidence = parseEvidence(value.sourceEvidence, request);
    if (!evidence) return null;
  }
  // Source-only requests must be grounded: an unlabeled or general-knowledge
  // question there means the provider ignored the policy, so reject it.
  if (request.sourcePolicy === "SOURCES_ONLY" && (evidence as RecordValue).type !== "source") return null;

  return {
    kind: value.kind as QuestionKind,
    text,
    timeLimitSec: value.timeLimitSec,
    options: options as { text: string; isCorrect: boolean }[],
    sourceEvidence: evidence as DraftQuestion["sourceEvidence"],
  };
}

/** Coerce per-kind option shapes the model may drift on (INPUT must carry no
 * options, TRUE_FALSE is exactly صح/خطأ, MCQ bounded to 4 with one correct)
 * while preserving the evidence payload; hard limits stay with the shared
 * validator. */
function normalizeModelQuestion(question: DraftQuestion): DraftQuestion {
  if (question.kind === "INPUT") return { ...question, options: [] };
  if (question.kind === "TRUE_FALSE") {
    const isTrueCorrect = question.options.find((option) => option.isCorrect)?.text !== "خطأ";
    return {
      ...question,
      options: [
        { text: "صح", isCorrect: isTrueCorrect },
        { text: "خطأ", isCorrect: !isTrueCorrect },
      ],
    };
  }
  if (question.kind === "MCQ") {
    const options = question.options.slice(0, 4).map((option) => ({ ...option, isCorrect: option.isCorrect === true }));
    let firstCorrect = options.findIndex((option) => option.isCorrect);
    if (firstCorrect === -1) {
      options[0] = { ...options[0], isCorrect: true };
      firstCorrect = 0;
    }
    return {
      ...question,
      options: options.map((option, index) => (index === firstCorrect ? option : { ...option, isCorrect: false })),
    };
  }
  return question;
}

function parseRevision(value: RecordValue, request: AiQuizProviderRequest): AiQuizProviderResponse {
  const message = requiredArabicText(value.message);
  const currentQuestions = request.currentDraft?.questions;
  if (!message || !currentQuestions || !Array.isArray(value.changes) || value.changes.length === 0) {
    throw new AiQuizProviderError("malformed-response");
  }

  const seen = new Set<number>();
  const changes: { questionIndex: number; question: DraftQuestion }[] = [];
  for (const change of value.changes) {
    if (!isRecord(change) || typeof change.questionIndex !== "number" || !Number.isInteger(change.questionIndex) || seen.has(change.questionIndex)) {
      throw new AiQuizProviderError("malformed-response");
    }
    const questionIndex = change.questionIndex;
    const question = parseQuestion(change.question, request.allowedKinds, request);
    if (questionIndex < 0 || questionIndex >= currentQuestions.length || !question) {
      throw new AiQuizProviderError("malformed-response");
    }
    if (!validateQuizDraft({ title: "مسودة", description: "", questions: [normalizeModelQuestion(question)] }).valid) {
      throw new AiQuizProviderError("malformed-response");
    }
    seen.add(questionIndex);
    changes.push({ questionIndex, question });
  }

  return { type: "revision", message, changes };
}

function parseProviderResponse(value: unknown, request: AiQuizProviderRequest): AiQuizProviderResponse {
  if (!isRecord(value) || typeof value.type !== "string") throw new AiQuizProviderError("malformed-response");

  if (value.type === "clarification" || value.type === "unsupported" || value.type === "confirm_save") {
    const message = requiredArabicText(value.message);
    if (!message) throw new AiQuizProviderError("malformed-response");
    return { type: value.type, message };
  }

  if (value.type === "revision") return parseRevision(value, request);

  if (value.type !== "draft") throw new AiQuizProviderError("malformed-response");
  const title = requiredArabicText(value.title);
  const description = optionalArabicText(value.description);
  if (!title || description === null || !Array.isArray(value.questions) || value.questions.length !== request.questionCount) {
    throw new AiQuizProviderError("malformed-response");
  }

  const questions = value.questions.map((question) => parseQuestion(question, request.allowedKinds, request));
  if (questions.some((question) => question === null)) throw new AiQuizProviderError("malformed-response");

  // Coerce known kind-shape drift before the shared validator judges the draft.
  const draft = { title, description, questions: (questions as DraftQuestion[]).map(normalizeModelQuestion) };
  if (!validateQuizDraft(draft).valid) throw new AiQuizProviderError("malformed-response");
  return { type: "draft", ...draft };
}

function responseText(payload: unknown): { text: string; refused: boolean } {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) throw new AiQuizProviderError("malformed-response");
  const textParts: string[] = [];
  let refused = false;

  for (const choice of payload.choices) {
    if (!isRecord(choice)) continue;
    if (choice.finish_reason === "sensitive_content_blocked") refused = true;
    if (isRecord(choice.message) && typeof choice.message.content === "string") textParts.push(choice.message.content);
  }

  return { text: textParts.join("\n").trim(), refused };
}

function parseJsonText(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1];
  const candidates = [fenced, trimmed].filter((candidate): candidate is string => Boolean(candidate));
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(trimmed.slice(firstBrace, lastBrace + 1));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next well-known Responses API text shape before failing.
    }
  }
  throw new AiQuizProviderError("malformed-response");
}

function providerErrorForStatus(status: number): AiQuizProviderError {
  if (status === 401 || status === 403) return new AiQuizProviderError("authentication");
  if (status === 408 || status === 504) return new AiQuizProviderError("timeout");
  if (status === 429) return new AiQuizProviderError("rate-limit");
  return new AiQuizProviderError("unavailable");
}

function isAbortError(error: unknown): boolean {
  return isRecord(error) && error.name === "AbortError";
}

function usableSources(request: AiQuizProviderRequest): AiQuizProviderSource[] {
  return (request.sources ?? []).filter((source) => source.text.trim().length > 0);
}

function requestInput(request: AiQuizProviderRequest): string {
  const mode = request.mode ?? (request.currentDraft ? "targeted" : "initial");
  const input = [
    "أنشئ مسودة أسئلة عربية وفق هذه التعليمات:",
    request.instruction,
    `نوع الطلب: ${mode === "targeted" ? "مراجعة موجهة" : "مسودة أولية"}`,
    `عدد الأسئلة المطلوب: ${request.questionCount}`,
    `الصعوبة: ${request.difficulty}`,
    `الأنواع المسموحة: ${request.allowedKinds.join(", ")}`,
    `سياسة المصدر: ${SOURCE_POLICY_LABELS[request.sourcePolicy]}.`,
  ];

  // ponytail: per-source text is bounded at ingest (MAX_EXTRACTED_CHARS) and
  // the total across sources is capped at the route layer
  // (AI_MAX_TOTAL_SOURCE_CHARS) before the request is built.
  const sources = usableSources(request);
  if (request.sourcePolicy !== "GENERAL_KNOWLEDGE_ONLY" && sources.length > 0) {
    input.push("المصادر المرفوعة (النص المستخرج فقط):");
    for (const source of sources) {
      input.push(`[مصدر: ${source.name} — ${source.kind}]\n${source.text}`);
    }
  }

  if (mode === "targeted" && request.currentDraft) {
    input.push(
      "هذه هي المسودة الحالية. اقترح تغييرات على الأسئلة المذكورة فقط، ولا تعدّل بقية الأسئلة:",
      JSON.stringify(request.currentDraft),
    );
  }

  return input.join("\n\n");
}

function requestBody(model: string, request: AiQuizProviderRequest, stream = false): Record<string, unknown> {
  return {
    model,
    messages: [
      { role: "system", content: systemInstructionsFor(request.sourcePolicy) },
      { role: "user", content: requestInput(request) },
    ],
    // Z.AI documents json_object only; the schema contract travels in the
    // system message (see systemInstructionsFor).
    response_format: { type: "json_object" },
    ...(stream ? { stream: true } : {}),
  };
}

/** Extracts content deltas from an OpenAI-compatible SSE body. */
async function* sseContentDeltas(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        const delta = sseLineDelta(line);
        if (delta) yield delta;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function sseLineDelta(line: string): string | null {
  if (!line.startsWith("data:")) return null;
  const payload = line.slice(5).trim();
  if (!payload || payload === "[DONE]") return null;
  try {
    const parsed = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: unknown } }> };
    const content = parsed.choices?.[0]?.delta?.content;
    return typeof content === "string" && content.length > 0 ? content : null;
  } catch {
    return null;
  }
}

export class GlmAiQuizProvider implements AiQuizProvider {
  readonly metered = true;

  private readonly apiKey: string;
  private readonly model: string;
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly fetcher: typeof fetch | undefined;

  constructor(options: GlmProviderOptions = {}) {
    this.apiKey = configuredValue(options.apiKey ?? process.env.GLM_API_KEY, "");
    this.model = configuredValue(options.model ?? process.env.GLM_MODEL, DEFAULT_GLM_MODEL);
    this.endpoint = chatCompletionsEndpoint(
      configuredValue(options.baseUrl ?? process.env.GLM_BASE_URL, DEFAULT_GLM_BASE_URL),
    );
    this.timeoutMs = configuredTimeout(options.timeoutMs ?? configuredTimeoutFromEnv(process.env.GLM_TIMEOUT_MS));
    this.fetcher = options.fetch ?? globalThis.fetch;
  }

  async generate(request: AiQuizProviderRequest): Promise<AiQuizProviderResponse> {
    if (!this.apiKey) throw new AiQuizProviderError("not-configured");
    if (!this.fetcher) throw new AiQuizProviderError("unavailable");

    // ponytail: Promise.race + ref'ed timer, not AbortSignal.timeout — the
    // stdlib signal's timer is unref'ed and never fires on an idle event loop,
    // leaving generate hung; the timeout test pins this.
    const controller = new AbortController();
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const operation = (async () => {
      const response = await this.fetcher!(this.endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody(this.model, request)),
        signal: controller.signal,
      });
      if (!response.ok) throw providerErrorForStatus(response.status);

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new AiQuizProviderError("malformed-response");
      }
      const extracted = responseText(payload);
      if (extracted.refused && !extracted.text) {
        return { type: "unsupported", message: "لا يمكن إعداد هذه المسودة وفق الطلب المتاح." } as const;
      }
      if (!extracted.text) throw new AiQuizProviderError("malformed-response");
      try {
        return parseProviderResponse(parseJsonText(extracted.text), request);
      } catch (error) {
        if (error instanceof AiQuizProviderError && error.code === "malformed-response") {
          console.warn("GLM quiz draft rejected (malformed-response):", extracted.text.slice(0, 1500));
        }
        throw error;
      }
    })();

    try {
      return await Promise.race([
        operation,
        new Promise<AiQuizProviderResponse>((_, reject) => {
          timer = setTimeout(() => {
            timedOut = true;
            controller.abort();
            reject(new AiQuizProviderError("timeout"));
          }, this.timeoutMs);
        }),
      ]);
    } catch (error) {
      if (error instanceof AiQuizProviderError) throw error;
      if (timedOut || isAbortError(error)) throw new AiQuizProviderError("timeout");
      throw new AiQuizProviderError("unavailable");
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // Streaming keeps data flowing so proxies don't idle-kill long generations;
  // the timeout applies per idle gap (no chunk for timeoutMs), not to the
  // total duration.
  async generateStreaming(
    request: AiQuizProviderRequest,
    onDelta: (text: string) => void,
  ): Promise<AiQuizProviderResponse> {
    if (!this.apiKey) throw new AiQuizProviderError("not-configured");
    if (!this.fetcher) throw new AiQuizProviderError("unavailable");

    const controller = new AbortController();
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const armIdleTimer = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
        timer = undefined;
      }, this.timeoutMs);
    };
    armIdleTimer();
    try {
      const response = await this.fetcher!(this.endpoint, {
        method: "POST",
        headers: {
          Accept: "text/event-stream",
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody(this.model, request, true)),
        signal: controller.signal,
      });
      if (!response.ok) throw providerErrorForStatus(response.status);
      if (!response.body) throw new AiQuizProviderError("malformed-response");

      let text = "";
      for await (const delta of sseContentDeltas(response.body)) {
        armIdleTimer();
        text += delta;
        onDelta(delta);
      }
      if (timedOut) throw new AiQuizProviderError("timeout");
      if (!text) throw new AiQuizProviderError("malformed-response");
      try {
        return parseProviderResponse(parseJsonText(text), request);
      } catch (error) {
        if (error instanceof AiQuizProviderError && error.code === "malformed-response") {
          console.warn("GLM quiz draft rejected (malformed-response):", text.slice(0, 1500));
        }
        throw error;
      }
    } catch (error) {
      if (error instanceof AiQuizProviderError) throw error;
      if (timedOut || isAbortError(error)) throw new AiQuizProviderError("timeout");
      throw new AiQuizProviderError("unavailable");
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

function requestedQuestionIndexes(instruction: string, questionCount: number): number[] {
  if (/كل الأسئلة|جميع الأسئلة/.test(instruction)) return Array.from({ length: questionCount }, (_, index) => index);

  const ordinals: Record<string, number> = {
    الأول: 0,
    الأولى: 0,
    الثاني: 1,
    الثانية: 1,
    الثالث: 2,
    الثالثة: 2,
    الرابع: 3,
    الرابعة: 3,
  };
  const normalizedInstruction = instruction.replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
  const indexes = [...normalizedInstruction.matchAll(/الأول|الأولى|الثاني|الثانية|الثالث|الثالثة|الرابع|الرابعة|\d+/g)]
    .map((match) => (match[0] in ordinals ? ordinals[match[0]] : Number(match[0]) - 1))
    .filter((index) => Number.isInteger(index) && index >= 0 && index < questionCount);
  return [...new Set(indexes)];
}

/** Server-side deterministic provider retained for tests and no-key development. */
export class DeterministicFakeAiQuizProvider implements AiQuizProvider {
  readonly metered = false;

  async generate(request: AiQuizProviderRequest): Promise<AiQuizProviderResponse> {
    const sources = (request.sources ?? []).filter((source) => source.text.trim().length > 0);
    const usesSources = request.sourcePolicy === "SOURCES_ONLY" || request.sourcePolicy === "SOURCES_PLUS_GENERAL_KNOWLEDGE";

    if (usesSources && sources.length === 0) {
      return {
        type: "clarification",
        message:
          "سياسة المصادر تتطلب مصدرًا مرفوعًا واحدًا على الأقل. أضف ملفًا أو نصًا ملصقًا، أو غيّر سياسة المصدر إلى المعرفة العامة فقط.",
      };
    }

    if (request.instruction.trim().length < 8) {
      return {
        type: "clarification",
        message: "ما موضوع الأسئلة أو السورة التي تريد أن تتناولها؟",
      };
    }

    if (/احفظ|حفظ الاختبار|سجّل/.test(request.instruction)) {
      const hasDraft = (request.currentDraft?.questions.length ?? 0) > 0;
      return hasDraft
        ? { type: "confirm_save", message: "ممتاز، سأحفظ هذه الأسئلة كاختبار الآن." }
        : { type: "clarification", message: "لا توجد أسئلة بعد. اطلب إنشاء الأسئلة أولًا ثم احفظ الاختبار." };
    }

    if (request.mode === "targeted") {
      const currentQuestions = request.currentDraft?.questions ?? [];
      const indexes = requestedQuestionIndexes(request.instruction, currentQuestions.length);
      if (indexes.length === 0) {
        return { type: "clarification", message: "حدد أرقام الأسئلة التي تريد تغييرها." };
      }

      return {
        type: "revision",
        message: "اقترحت تغيير الأسئلة المطلوبة فقط. راجع المراجعة قبل تطبيقها.",
        changes: indexes.map((questionIndex) => ({
          questionIndex,
          question: {
            ...currentQuestions[questionIndex],
            text: `${currentQuestions[questionIndex].text} (مراجعة موجهة)`,
          },
        })),
      };
    }

    const firstSource = sources[0];
    const firstExcerpt = firstSource
      ? firstSource.text.replace(/\s+/g, " ").trim().slice(0, 160)
      : "";
    const sourceBasedText = firstSource
      ? "وفق المصدر المرفوع، أي العبارات تناسب مادة الاختبار؟"
      : "ما السلوك الأنسب لطالب القرآن؟";
    const evidenceFor = (index: number): DraftQuestion["sourceEvidence"] => {
      if (request.sourcePolicy === "SOURCES_ONLY" && firstSource) {
        return sourceEvidence(firstSource.name, firstExcerpt);
      }
      if (request.sourcePolicy === "SOURCES_PLUS_GENERAL_KNOWLEDGE") {
        return firstSource && index % 2 === 0
          ? sourceEvidence(firstSource.name, firstExcerpt)
          : generalKnowledgeEvidence(request.sourcePolicy);
      }
      return generalKnowledgeEvidence(request.sourcePolicy);
    };

    const questions: DraftQuestion[] = Array.from({ length: request.questionCount }, (_, index) => {
      if (index % 2 === 1) {
        return {
          kind: "TRUE_FALSE",
          text: `القرآن الكريم مصدر هداية للمؤمنين (${index + 1}).`,
          timeLimitSec: 20,
          options: [
            { text: "صح", isCorrect: true },
            { text: "خطأ", isCorrect: false },
          ],
          sourceEvidence: evidenceFor(index),
        };
      }

      return {
        kind: "MCQ",
        text: `${sourceBasedText} (${index + 1})`,
        timeLimitSec: 20,
        options: [
          { text: "المداومة على التلاوة", isCorrect: true },
          { text: "ترك المراجعة", isCorrect: false },
          { text: "إهمال الاستماع", isCorrect: false },
        ],
        sourceEvidence: evidenceFor(index),
      };
    });

    return {
      type: "draft",
      title: "مبادئ القرآن الكريم",
      description: "مسودة عربية للمراجعة قبل حفظها كاختبار.",
      questions,
    };
  }
}

export function getAiQuizProvider(env: AiProviderEnvironment = process.env): AiQuizProvider {
  const apiKey = env.GLM_API_KEY?.trim();
  if (!apiKey) return new DeterministicFakeAiQuizProvider();

  return new GlmAiQuizProvider({
    apiKey,
    model: env.GLM_MODEL,
    baseUrl: env.GLM_BASE_URL,
    timeoutMs: configuredTimeoutFromEnv(env.GLM_TIMEOUT_MS),
  });
}
