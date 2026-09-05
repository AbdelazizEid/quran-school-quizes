import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_GLM_BASE_URL,
  DEFAULT_GLM_MODEL,
  AiQuizProviderError,
  DeterministicFakeAiQuizProvider,
  GlmAiQuizProvider,
  getAiQuizProvider,
} from "../src/server/ai/provider";
import { DEFAULT_SOURCE_POLICY } from "../src/lib/ai-quiz-draft";
import type { DraftQuestion } from "../src/lib/ai-quiz-draft";
import type { AiQuizProviderRequest } from "../src/server/ai/provider";

const request: AiQuizProviderRequest = {
  instruction: "أنشئ أسئلة عن سورة الفاتحة لطلاب المرحلة المتوسطة",
  sourcePolicy: DEFAULT_SOURCE_POLICY,
  questionCount: 1,
  difficulty: "medium",
  allowedKinds: ["MCQ", "TRUE_FALSE"],
};

function responseBody() {
  return {
    type: "draft",
    title: "سورة الفاتحة",
    description: "أسئلة عربية للمراجعة",
    questions: [
      {
        kind: "MCQ",
        text: "ما عدد آيات سورة الفاتحة؟",
        timeLimitSec: 20,
        options: [
          { text: "سبع آيات", isCorrect: true },
          { text: "خمس آيات", isCorrect: false },
        ],
      },
    ],
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function chatResponse(body: unknown): Response {
  return jsonResponse({ choices: [{ message: { content: JSON.stringify(body) } }] });
}

test("GLM uses the configured Chat Completions endpoint and returns a structured Arabic draft", async () => {
  let calledUrl = "";
  let calledInit: RequestInit | undefined;
  const provider = new GlmAiQuizProvider({
    apiKey: "test-key",
    fetch: async (input, init) => {
      calledUrl = String(input);
      calledInit = init;
      return chatResponse(responseBody());
    },
  });

  const result = await provider.generate(request);
  const sentBody = JSON.parse(String(calledInit?.body)) as {
    model: string;
    messages: { role: string; content: string }[];
  };

  assert.equal(calledUrl, `${DEFAULT_GLM_BASE_URL}/chat/completions`);
  assert.equal(sentBody.model, DEFAULT_GLM_MODEL);
  assert.match(sentBody.messages[0].content, /العربية/);
  assert(sentBody.messages[1].content.includes(request.instruction));
  assert.equal((calledInit?.headers as Record<string, string>).Authorization, "Bearer test-key");
  assert.deepEqual(result, {
    type: "draft",
    title: "سورة الفاتحة",
    description: "أسئلة عربية للمراجعة",
    questions: [
      {
        kind: "MCQ",
        text: "ما عدد آيات سورة الفاتحة؟",
        timeLimitSec: 20,
        options: [
          { text: "سبع آيات", isCorrect: true },
          { text: "خمس آيات", isCorrect: false },
        ],
        sourceEvidence: { type: "general_knowledge", label: "المعرفة العامة فقط" },
      },
    ],
  });
});

test("GLM reads the chat completion content and structured clarification responses", async () => {
  const provider = new GlmAiQuizProvider({
    apiKey: "test-key",
    fetch: async () => chatResponse({ type: "clarification", message: "ما السورة المطلوبة؟" }),
  });

  assert.deepEqual(await provider.generate(request), {
    type: "clarification",
    message: "ما السورة المطلوبة؟",
  });
});

test("GLM parses a targeted revision against the current draft", async () => {
  const currentQuestion = responseBody().questions[0] as DraftQuestion;
  const targetedRequest: AiQuizProviderRequest = {
    ...request,
    mode: "targeted",
    currentDraft: {
      title: "سورة الفاتحة",
      description: "أسئلة عربية للمراجعة",
      questions: [{ ...currentQuestion, timeLimitSec: 20 }],
    },
  };
  const provider = new GlmAiQuizProvider({
    apiKey: "test-key",
    fetch: async (_input, init) => {
      assert(String(init?.body).includes("سورة الفاتحة"));
      return chatResponse({
        type: "revision",
        message: "اقترحت تحسين السؤال الأول.",
        changes: [
          {
            questionIndex: 0,
            question: {
              ...currentQuestion,
              text: "ما عدد آيات سورة الفاتحة بعد التحسين؟",
              sourceEvidence: null,
            },
          },
        ],
      });
    },
  });

  assert.deepEqual(await provider.generate(targetedRequest), {
    type: "revision",
    message: "اقترحت تحسين السؤال الأول.",
    changes: [
      {
        questionIndex: 0,
        question: {
          kind: "MCQ",
          text: "ما عدد آيات سورة الفاتحة بعد التحسين؟",
          timeLimitSec: 20,
          options: [
            { text: "سبع آيات", isCorrect: true },
            { text: "خمس آيات", isCorrect: false },
          ],
          sourceEvidence: { type: "general_knowledge", label: "المعرفة العامة فقط" },
        },
      },
    ],
  });
});

test("provider failures are classified without exposing the upstream response", async () => {
  for (const [status, code] of [
    [401, "authentication"],
    [429, "rate-limit"],
  ] as const) {
    const provider = new GlmAiQuizProvider({
      apiKey: "test-key",
      fetch: async () => jsonResponse({ secret: "must-not-leak" }, status),
    });

    await assert.rejects(provider.generate(request), (error: unknown) => {
      assert(error instanceof AiQuizProviderError);
      assert.equal(error.code, code);
      assert(!error.message.includes("must-not-leak"));
      return true;
    });
  }
});

test("malformed or non-Arabic model output is rejected", async () => {
  const malformed = new GlmAiQuizProvider({
    apiKey: "test-key",
    fetch: async () => chatResponse("not json"),
  });
  await assert.rejects(malformed.generate(request), { code: "malformed-response" });

  const nonArabic = new GlmAiQuizProvider({
    apiKey: "test-key",
    fetch: async () => chatResponse(JSON.stringify({ ...responseBody(), title: "English title" })),
  });
  await assert.rejects(nonArabic.generate(request), { code: "malformed-response" });
});

test("a provider timeout is retryable and does not make another network call", async () => {
  const provider = new GlmAiQuizProvider({
    apiKey: "test-key",
    timeoutMs: 5,
    fetch: async () => new Promise<Response>(() => undefined),
  });

  await assert.rejects(provider.generate(request), (error: unknown) => {
    assert(error instanceof AiQuizProviderError);
    assert.equal(error.code, "timeout");
    return true;
  });
});

test("the configured provider is opt-in and the deterministic fake is the no-key default", () => {
  assert(getAiQuizProvider({ GLM_API_KEY: "" }) instanceof DeterministicFakeAiQuizProvider);
  assert(getAiQuizProvider({ GLM_API_KEY: "test-key" }) instanceof GlmAiQuizProvider);
});
