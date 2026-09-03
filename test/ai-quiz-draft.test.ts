import assert from "node:assert/strict";
import test from "node:test";
import {
  applyDraftRevision,
  type DraftQuestion,
  type DraftRevision,
} from "../src/lib/ai-quiz-draft";
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

test("applying a targeted revision changes only its requested Questions", () => {
  const current = [question("السؤال الأول الحالي"), question("السؤال الثاني الحالي")];
  const revision: DraftRevision = {
    mode: "targeted",
    instruction: "غيّر السؤال الأول",
    summary: "تم اقتراح تغيير السؤال الأول.",
    baseQuestions: current,
    proposedQuestions: [question("السؤال الأول بعد المراجعة"), current[1]],
    changes: [{ questionIndex: 0, question: question("السؤال الأول بعد المراجعة") }],
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  const result = applyDraftRevision(current, revision);

  assert.deepEqual(result.questions.map((item) => item.text), ["السؤال الأول بعد المراجعة", "السؤال الثاني الحالي"]);
  assert.deepEqual(result.appliedQuestionIndexes, [0]);
  assert.deepEqual(result.conflictedQuestionIndexes, []);
});

test("a direct edit made after preview wins over a targeted revision", () => {
  const base = [question("السؤال الأول"), question("السؤال الثاني")];
  const current = [question("تصحيح المعلّم للسؤال الأول"), base[1]];
  const revision: DraftRevision = {
    mode: "targeted",
    instruction: "حسّن السؤالين الأول والثاني",
    summary: "تم اقتراح تحسين السؤالين.",
    baseQuestions: base,
    proposedQuestions: [question("السؤال الأول المحسّن"), question("السؤال الثاني المحسّن")],
    changes: [
      { questionIndex: 0, question: question("السؤال الأول المحسّن") },
      { questionIndex: 1, question: question("السؤال الثاني المحسّن") },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  const result = applyDraftRevision(current, revision);

  assert.deepEqual(result.questions.map((item) => item.text), ["تصحيح المعلّم للسؤال الأول", "السؤال الثاني المحسّن"]);
  assert.deepEqual(result.appliedQuestionIndexes, [1]);
  assert.deepEqual(result.conflictedQuestionIndexes, [0]);
});

test("the deterministic provider returns a targeted revision from the current draft", async () => {
  const provider = new DeterministicFakeAiQuizProvider();
  const current = [question("السؤال الأول"), question("السؤال الثاني"), question("السؤال الثالث")];
  const response = await provider.generate({
    instruction: "حسّن صياغة السؤالين الأول والثالث",
    sourcePolicy: DEFAULT_SOURCE_POLICY,
    questionCount: current.length,
    difficulty: "medium",
    allowedKinds: ["MCQ", "TRUE_FALSE", "INPUT"],
    mode: "targeted",
    currentDraft: { title: "عنوان", description: "وصف", questions: current },
  });

  assert.equal(response.type, "revision");
  if (response.type !== "revision") return;
  assert.deepEqual(response.changes.map((change) => change.questionIndex), [0, 2]);
  assert.equal(response.changes[0].question.text.includes("السؤال الأول"), true);
  assert.equal(response.changes[1].question.text, "السؤال الثالث (مراجعة موجهة)");
});
