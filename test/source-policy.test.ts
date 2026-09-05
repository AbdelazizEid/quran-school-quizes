import assert from "node:assert/strict";
import test from "node:test";
import { SUPPLEMENTAL_LABEL, SOURCE_POLICY_LABEL } from "../src/lib/ai-quiz-draft";
import type { DraftQuestion } from "../src/lib/ai-quiz-draft";
import {
  DeterministicFakeAiQuizProvider,
  GlmAiQuizProvider,
} from "../src/server/ai/provider";
import type { AiQuizProviderRequest, AiQuizProviderSource } from "../src/server/ai/provider";

const sourceText = "سورة الفاتحة: سبع آيات، تبدأ بالبسملة وتختم بقوله تعالى: صراط الذين أنعمت عليهم.";

function baseRequest(overrides: Partial<AiQuizProviderRequest> = {}): AiQuizProviderRequest {
  return {
    instruction: "أنشئ أسئلة عن سورة الفاتحة",
    sourcePolicy: "GENERAL_KNOWLEDGE_ONLY",
    questionCount: 2,
    difficulty: "medium",
    allowedKinds: ["MCQ", "TRUE_FALSE"],
    ...overrides,
  };
}

const sources: AiQuizProviderSource[] = [{ name: "درس-الفاتحة.pdf", kind: "pdf", text: sourceText }];

test("general knowledge only stays the default and ignores any sources", async () => {
  const provider = new DeterministicFakeAiQuizProvider();
  const response = await provider.generate(baseRequest({ sources }));
  assert.equal(response.type, "draft");
  if (response.type !== "draft") return;
  for (const question of response.questions) {
    assert.equal(question.sourceEvidence?.type, "general_knowledge");
    assert.equal(question.sourceEvidence?.label, SOURCE_POLICY_LABEL);
    assert.match(question.text, /[\u0600-\u06ff]/);
  }
});

test("source-only requests without usable sources ask for a source instead of inventing support", async () => {
  const provider = new DeterministicFakeAiQuizProvider();
  const response = await provider.generate(baseRequest({ sourcePolicy: "SOURCES_ONLY" }));
  assert.equal(response.type, "clarification");
  if (response.type === "clarification") assert.match(response.message, /مصدر/);
});

test("source-only requests ground every question in the first source", async () => {
  const provider = new DeterministicFakeAiQuizProvider();
  const response = await provider.generate(baseRequest({ sourcePolicy: "SOURCES_ONLY", sources }));
  assert.equal(response.type, "draft");
  if (response.type !== "draft") return;
  assert.equal(response.questions.length, 2);
  for (const question of response.questions) {
    assert.equal(question.sourceEvidence?.type, "source");
    assert.equal(question.sourceEvidence?.documentName, "درس-الفاتحة.pdf");
    assert.ok(question.sourceEvidence?.excerpt.includes("سورة الفاتحة"));
    assert.match(question.text, /[\u0600-\u06ff]/);
  }
});

test("sources plus general knowledge labels supplemental questions", async () => {
  const provider = new DeterministicFakeAiQuizProvider();
  const response = await provider.generate(
    baseRequest({ sourcePolicy: "SOURCES_PLUS_GENERAL_KNOWLEDGE", sources, questionCount: 4 }),
  );
  assert.equal(response.type, "draft");
  if (response.type !== "draft") return;
  const evidence = response.questions.map((question: DraftQuestion) => question.sourceEvidence);
  assert.equal(evidence[0]?.type, "source");
  assert.equal(evidence[1]?.type, "general_knowledge");
  assert.equal(evidence[1]?.label, SUPPLEMENTAL_LABEL);
  assert.equal(evidence[2]?.type, "source");
  assert.ok(evidence.some((item) => item?.type === "source"));
  for (const question of response.questions) assert.match(question.text, /[\u0600-\u06ff]/);
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function draftBody(evidence: unknown) {
  return {
    type: "draft",
    title: "سورة الفاتحة",
    description: "",
    questions: [
      {
        kind: "MCQ",
        text: "كم عدد آيات سورة الفاتحة؟",
        timeLimitSec: 20,
        options: [
          { text: "سبع آيات", isCorrect: true },
          { text: "خمس آيات", isCorrect: false },
        ],
        sourceEvidence: evidence,
      },
    ],
  };
}

function chatResponse(body: unknown): Response {
  return jsonResponse({ choices: [{ message: { content: JSON.stringify(body) } }] });
}

test("the GLM request includes extracted source text only when the policy allows it", async () => {
  async function sentInputFor(policy: AiQuizProviderRequest["sourcePolicy"]): Promise<string> {
    const evidence =
      policy === "GENERAL_KNOWLEDGE_ONLY"
        ? null
        : { type: "source", label: "من المصدر المرفوع", documentName: "درس-الفاتحة.pdf", excerpt: "سورة الفاتحة" };
    let sentBody = "";
    const provider = new GlmAiQuizProvider({
      apiKey: "test-key",
      fetch: async (_input, init) => {
        sentBody = String(init?.body);
        return chatResponse(draftBody(evidence));
      },
    });
    await provider.generate(baseRequest({ sourcePolicy: policy, sources, questionCount: 1 }));
    return sentBody;
  }

  const generalOnly = await sentInputFor("GENERAL_KNOWLEDGE_ONLY");
  assert(!generalOnly.includes(sourceText));
  assert(generalOnly.includes(SOURCE_POLICY_LABEL));

  for (const policy of ["SOURCES_ONLY", "SOURCES_PLUS_GENERAL_KNOWLEDGE"] as const) {
    const body = await sentInputFor(policy);
    assert(body.includes(sourceText), `${policy} must include extracted text`);
    assert(body.includes("درس-الفاتحة.pdf"));
    // Extracted text only — never raw file bytes or base64 payloads.
    assert(!body.includes("application/pdf"));
    assert(body.length < sourceText.length * 4 + 4000);
  }
});

test("the GLM adapter accepts source evidence only for known sources", async () => {
  async function generateWith(evidence: unknown) {
    const provider = new GlmAiQuizProvider({
      apiKey: "test-key",
      fetch: async () => chatResponse(draftBody(evidence)),
    });
    return provider.generate(baseRequest({ sourcePolicy: "SOURCES_ONLY", sources, questionCount: 1 }));
  }

  const grounded = await generateWith({
    type: "source",
    label: "من المصدر المرفوع",
    documentName: "درس-الفاتحة.pdf",
    excerpt: "سورة الفاتحة: سبع آيات",
  });
  assert.equal(grounded.type, "draft");
  if (grounded.type === "draft") {
    const evidence = grounded.questions[0].sourceEvidence;
    assert.equal(evidence?.type, "source");
    if (evidence?.type === "source") assert.equal(evidence.documentName, "درس-الفاتحة.pdf");
  }

  // An invented document reference must be rejected as malformed.
  const invented = await generateWith({
    type: "source",
    label: "من المصدر المرفوع",
    documentName: "كتاب-غير-مرفوع.pdf",
    excerpt: "نص لم يُرفع",
  }).catch((error: unknown) => error);
  assert.equal((invented as { code?: string }).code, "malformed-response");

  // Source-only policy must reject a general-knowledge-labeled question.
  const ungrounded = await generateWith({
    type: "general_knowledge",
    label: SOURCE_POLICY_LABEL,
  }).catch((error: unknown) => error);
  assert.equal((ungrounded as { code?: string }).code, "malformed-response");
});

