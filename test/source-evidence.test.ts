import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_EVIDENCE_EXCERPT_CHARS,
  SUPPLEMENTAL_LABEL,
  compactSourceEvidence,
  generalKnowledgeEvidence,
  sourceEvidence,
} from "../src/lib/ai-quiz-draft";
import { GlmAiQuizProvider } from "../src/server/ai/provider";
import type { AiQuizProviderRequest } from "../src/server/ai/provider";

const request: AiQuizProviderRequest = {
  instruction: "أنشئ أسئلة عن سورة الفاتحة",
  sourcePolicy: "SOURCES_ONLY",
  questionCount: 1,
  difficulty: "medium",
  allowedKinds: ["MCQ", "TRUE_FALSE"],
  sources: [{ name: "درس-الفاتحة.pdf", kind: "pdf", text: "سورة الفاتحة سبع آيات." }],
};

function draftWith(evidence: unknown) {
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

function providerReturning(body: unknown) {
  return new GlmAiQuizProvider({
    apiKey: "test-key",
    fetch: async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(body) } }] }), { status: 200 }),
  });
}

test("compact Source Evidence keeps excerpt, document name, and page section, bounded", () => {
  const longExcerpt = "أ".repeat(MAX_EVIDENCE_EXCERPT_CHARS + 50);
  const compacted = compactSourceEvidence(
    {
      type: "source",
      label: " من المصدر المرفوع ",
      documentName: " درس-الفاتحة.pdf ",
      excerpt: `  ${longExcerpt}  `,
      pageSection: " الصفحة الثالثة ",
    },
    "SOURCES_ONLY",
  );

  assert.equal(compacted.type, "source");
  if (compacted.type !== "source") return;
  assert.equal(compacted.label, "من المصدر المرفوع");
  assert.equal(compacted.documentName, "درس-الفاتحة.pdf");
  assert.equal(compacted.excerpt.length, MAX_EVIDENCE_EXCERPT_CHARS + 1); // bound + ellipsis
  assert.ok(compacted.excerpt.endsWith("…"));
  assert.equal(compacted.pageSection, "الصفحة الثالثة");

  const withoutPage = compactSourceEvidence(sourceEvidence("درس.pdf", "نص"), "SOURCES_ONLY");
  assert.equal(withoutPage.type, "source");
  if (withoutPage.type === "source") assert.equal("pageSection" in withoutPage, false);
});

test("compact Source Evidence passes valid supplemental markers through", () => {
  const supplemental = compactSourceEvidence(
    { type: "general_knowledge", label: SUPPLEMENTAL_LABEL },
    "SOURCES_PLUS_GENERAL_KNOWLEDGE",
  );
  assert.deepEqual(supplemental, { type: "general_knowledge", label: SUPPLEMENTAL_LABEL });
});

test("compact Source Evidence falls back to the supplemental marker for missing or invalid evidence", () => {
  for (const policy of ["SOURCES_PLUS_GENERAL_KNOWLEDGE", "GENERAL_KNOWLEDGE_ONLY"] as const) {
    for (const invalid of [undefined, null, "text", {}, { type: "source", label: "x" }, { type: "other" }]) {
      assert.deepEqual(compactSourceEvidence(invalid, policy), generalKnowledgeEvidence(policy));
    }
  }
});

test("the GLM adapter parses a page or section reference on source evidence", async () => {
  const response = await providerReturning(
    draftWith({
      type: "source",
      label: "من المصدر المرفوع",
      documentName: "درس-الفاتحة.pdf",
      excerpt: "سورة الفاتحة سبع آيات",
      pageSection: "صفحة ١",
    }),
  ).generate(request);

  assert.equal(response.type, "draft");
  if (response.type !== "draft") return;
  const evidence = response.questions[0].sourceEvidence;
  assert.equal(evidence?.type, "source");
  if (evidence?.type === "source") {
    assert.equal(evidence.documentName, "درس-الفاتحة.pdf");
    assert.equal(evidence.pageSection, "صفحة ١");
  }
});

test("the adapter drops an invalid page reference but keeps the grounded evidence", async () => {
  const response = await providerReturning(
    draftWith({
      type: "source",
      label: "من المصدر المرفوع",
      documentName: "درس-الفاتحة.pdf",
      excerpt: "سورة الفاتحة سبع آيات",
      pageSection: "page 3",
    }),
  ).generate(request);

  assert.equal(response.type, "draft");
  if (response.type !== "draft") return;
  const evidence = response.questions[0].sourceEvidence;
  assert.equal(evidence?.type, "source");
  if (evidence?.type === "source") assert.equal("pageSection" in evidence, false);
});
