import assert from "node:assert/strict";
import test from "node:test";
import { type DraftQuestion, type QuestionKind } from "../src/lib/ai-quiz-draft";
import { DeterministicFakeAiQuizProvider } from "../src/server/ai/provider";
import { DEFAULT_SOURCE_POLICY } from "../src/lib/ai-quiz-draft";

function question(text: string): DraftQuestion {
  return {
    kind: "MCQ",
    text,
    timeLimitSec: 20,
    options: [
      { text: "أ", isCorrect: true },
      { text: "ب", isCorrect: false },
    ],
  };
}

function targetedRequest(instruction: string, current: DraftQuestion[]) {
  return {
    instruction,
    sourcePolicy: DEFAULT_SOURCE_POLICY,
    questionCount: current.length,
    difficulty: "medium" as const,
    allowedKinds: ["MCQ", "TRUE_FALSE", "INPUT"] as QuestionKind[],
    mode: "targeted" as const,
    currentDraft: { title: "عنوان", description: "وصف", questions: current },
  };
}

test("the deterministic provider returns a targeted revision from the current draft", async () => {
  const provider = new DeterministicFakeAiQuizProvider();
  const current = [question("السؤال الأول"), question("السؤال الثاني"), question("السؤال الثالث")];
  const response = await provider.generate(targetedRequest("حسّن صياغة السؤالين الأول والثالث", current));

  assert.equal(response.type, "revision");
  if (response.type !== "revision") return;
  assert.deepEqual(response.changes.map((change) => change.questionIndex), [0, 2]);
  assert.equal(response.changes[0].question.text.includes("السؤال الأول"), true);
  assert.equal(response.changes[1].question.text, "السؤال الثالث (مراجعة موجهة)");
});

test("the deterministic provider confirms save only when the draft has questions", async () => {
  const provider = new DeterministicFakeAiQuizProvider();
  const current = [question("السؤال الأول")];

  const confirmed = await provider.generate(targetedRequest("تمام، الأسئلة مناسبة، احفظ الاختبار", current));
  assert.equal(confirmed.type, "confirm_save");
  if (confirmed.type !== "confirm_save") return;
  assert.match(confirmed.message, /[\u0600-\u06ff]/);

  const emptyDraft = await provider.generate(targetedRequest("احفظ الاختبار", []));
  assert.equal(emptyDraft.type, "clarification");

  const noDraftRequest = {
    instruction: "احفظ الاختبار",
    sourcePolicy: DEFAULT_SOURCE_POLICY,
    questionCount: 1,
    difficulty: "medium" as const,
    allowedKinds: ["MCQ" as const],
  };
  const withoutDraft = await provider.generate(noDraftRequest);
  assert.equal(withoutDraft.type, "clarification");
});
