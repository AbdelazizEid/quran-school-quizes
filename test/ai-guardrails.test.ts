import assert from "node:assert/strict";
import test from "node:test";
import { validateQuizDraft, normalizeManualQuestions } from "../src/lib/ai-quiz-draft";
import {
  DEFAULT_GENERATIONS_PER_HOUR,
  DEFAULT_MAX_CONCURRENT_GENERATIONS,
  DEFAULT_MAX_TOTAL_SOURCE_CHARS,
  acquireGenerationSlot,
  generationsPerHour,
  maxConcurrentGenerations,
  maxTotalSourceChars,
  releaseGenerationSlot,
  retryAfterSeconds,
  totalSourceChars,
} from "../src/server/ai/limits";
import { DeterministicFakeAiQuizProvider, OpenCodeGoAiQuizProvider } from "../src/server/ai/provider";

test("guardrail values come from the environment with sensible defaults", () => {
  assert.equal(generationsPerHour({}), DEFAULT_GENERATIONS_PER_HOUR);
  assert.equal(generationsPerHour({ AI_GENERATIONS_PER_HOUR: "5" }), 5);
  assert.equal(generationsPerHour({ AI_GENERATIONS_PER_HOUR: "zero" }), DEFAULT_GENERATIONS_PER_HOUR);
  assert.equal(generationsPerHour({ AI_GENERATIONS_PER_HOUR: "-3" }), DEFAULT_GENERATIONS_PER_HOUR);

  assert.equal(maxConcurrentGenerations({}), DEFAULT_MAX_CONCURRENT_GENERATIONS);
  assert.equal(maxConcurrentGenerations({ AI_MAX_CONCURRENT_GENERATIONS: "1" }), 1);

  assert.equal(maxTotalSourceChars({}), DEFAULT_MAX_TOTAL_SOURCE_CHARS);
  assert.equal(maxTotalSourceChars({ AI_MAX_TOTAL_SOURCE_CHARS: "60000" }), 60000);
});

test("retry guidance is derived from the oldest counted generation", () => {
  const now = Date.now();
  assert.equal(retryAfterSeconds(new Date(now - 60 * 60 * 1000), now), 1); // window just elapsed
  assert.equal(retryAfterSeconds(new Date(now - 30 * 60 * 1000), now), 30 * 60);
  assert.equal(retryAfterSeconds(new Date(now + 60 * 1000), now), 61 * 60); // future rows still count
});

test("the cross-source cap sums every usable source's extracted text", () => {
  assert.equal(totalSourceChars([]), 0);
  assert.equal(totalSourceChars([{ text: "أب" }, { text: "جد" }]), 4);
  const sources = Array.from({ length: 5 }, () => ({ text: "أ".repeat(60_000) }));
  assert.ok(totalSourceChars(sources) > DEFAULT_MAX_TOTAL_SOURCE_CHARS);
});

test("the concurrent-generation slot is per Teacher and always releasable", () => {
  const teacher = `t-${Date.now()}`;
  const other = `o-${Date.now()}`;
  assert.equal(acquireGenerationSlot(teacher, 2), true);
  assert.equal(acquireGenerationSlot(teacher, 2), true);
  assert.equal(acquireGenerationSlot(teacher, 2), false); // own limit reached
  assert.equal(acquireGenerationSlot(other, 2), true); // other teachers unaffected
  releaseGenerationSlot(teacher);
  assert.equal(acquireGenerationSlot(teacher, 2), true); // freed slot reusable
  releaseGenerationSlot(teacher);
  releaseGenerationSlot(teacher);
  releaseGenerationSlot(teacher); // extra releases are harmless
  releaseGenerationSlot(other);
  assert.equal(acquireGenerationSlot(teacher, 2), true); // fully released
  releaseGenerationSlot(teacher);
});

test("only the real provider is metered; the fake never spends allowance", () => {
  assert.equal(new OpenCodeGoAiQuizProvider({ apiKey: "k", fetch: async () => { throw new Error("unused"); } }).metered, true);
  assert.equal(new DeterministicFakeAiQuizProvider().metered, false);
});

test("partial or malformed AI drafts can never pass the save-boundary validator", () => {
  const valid = {
    kind: "MCQ",
    text: "كم عدد آيات سورة الفاتحة؟",
    timeLimitSec: 20,
    options: [
      { text: "سبع", isCorrect: true },
      { text: "خمس", isCorrect: false },
    ],
  } as const;

  assert.equal(validateQuizDraft({ title: "عنوان", description: "", questions: [valid] }).valid, true);

  const truncated = [
    { questions: [valid] }, // no title
    { title: "عنوان", description: "", questions: [] }, // no questions
    { title: "عنوان", description: "", questions: [{ ...valid, text: "" }] }, // empty text
    { title: "عنوان", description: "", questions: [{ ...valid, kind: "ESSAY" }] }, // bad kind
    { title: "عنوان", description: "", questions: [{ ...valid, timeLimitSec: 4 }] }, // bad time limit
    { title: "عنوان", description: "", questions: [{ ...valid, options: [...valid.options, { text: "ج", isCorrect: false }, { text: "د", isCorrect: false }, { text: "هـ", isCorrect: false }] }] }, // >4 options
    { title: "عنوان", description: "", questions: [{ ...valid, options: [{ text: "سبع", isCorrect: true }, { text: "خمس", isCorrect: true }] }] }, // two correct
    { title: "عنوان", description: "", questions: [{ ...valid, options: [{ text: "سبع", isCorrect: false }, { text: "خمس", isCorrect: false }] }] }, // none correct
    { title: "عنوان", description: "", questions: [{ ...valid, kind: "INPUT" }] }, // INPUT with options
    { title: "عنوان", description: "", questions: [{ ...valid, kind: "TRUE_FALSE" }] }, // TRUE_FALSE with MCQ options
    { title: "عنوان", description: "", questions: "not-an-array" },
    { title: "عنوان", description: "", questions: [{ ...valid, options: [{ text: "", isCorrect: true }, { text: "خمس", isCorrect: false }] }] },
  ];
  for (const draft of truncated) {
    assert.equal(validateQuizDraft(draft as never).valid, false, JSON.stringify(draft));
  }
});

test("manual question input is normalized so the shared validator judges what gets stored", () => {
  // the classic manual shape: TRUE_FALSE with a single صح option
  const normalized = normalizeManualQuestions([
    { kind: "TRUE_FALSE", text: "سورة الفاتحة مكية", options: [{ text: "صح", isCorrect: true }] },
    { kind: "INPUT", text: "اذكر آية تحفظها", options: [{ text: "قديم", isCorrect: false }] },
    { kind: "MCQ", text: "كم عدد سور القرآن؟", options: [{ text: "114", isCorrect: true }, { text: "113", isCorrect: false }] },
  ]);
  assert.equal(validateQuizDraft({ title: "عنوان", description: "", questions: normalized }).valid, true);
  const [tf, input, mcq] = normalized;
  assert.deepEqual(tf.options.map((o) => o.text), ["صح", "خطأ"]);
  assert.deepEqual(input.options, []); // stale INPUT options are dropped, not stored
  assert.equal(mcq.timeLimitSec, 20); // omitted time limit defaults

  // >4 MCQ options are no longer silently truncated — they are rejected
  const tooMany = normalizeManualQuestions([
    { kind: "MCQ", text: "سؤال", options: [1, 2, 3, 4, 5].map((n) => ({ text: `خيار ${n}`, isCorrect: n === 1 })) },
  ]);
  const tooManyResult = validateQuizDraft({ title: "عنوان", description: "", questions: tooMany });
  assert.equal(tooManyResult.valid, false);
  if (!tooManyResult.valid) assert.equal(tooManyResult.error, "too-many-options");

  // junk rows stay invalid instead of crashing the route
  const junk = normalizeManualQuestions([{ kind: "MCQ" }, null, "x"]);
  for (const draft of [
    { title: "عنوان", description: "", questions: junk },
    { title: "", description: "", questions: normalized },
  ]) {
    assert.equal(validateQuizDraft(draft).valid, false);
  }
});
