import { expect, test } from "@playwright/test";
import { io, type Socket } from "socket.io-client";
import { DEFAULT_GENERATIONS_PER_HOUR } from "../src/server/ai/limits";

const BASE = "http://127.0.0.1:3000";

const instruction = "أنشئ أسئلة عن آداب تلاوة القرآن";

test("draft routes generate Arabic questions, persist edits, validate save, and discard", async ({ request }) => {
  const start = await request.post("/api/ai-quiz-drafts");
  expect(start.status()).toBe(201);
  const created = await start.json();
  const id = created.draft.id as string;
  expect(created.draft.sourcePolicy).toBe("GENERAL_KNOWLEDGE_ONLY");

  const generated = await request.post(`/api/ai-quiz-drafts/${id}/generate`, {
    data: { instruction, questionCount: 3 },
  });
  expect(generated.status()).toBe(200);
  const generatedData = await generated.json();
  expect(generatedData.response.type).toBe("draft");
  expect(generatedData.draft.questions).toHaveLength(3);
  expect(generatedData.draft.questions[0].text).toMatch(/[\u0600-\u06ff]/);
  expect(generatedData.draft.messages).toHaveLength(2);

  const reread = await request.get(`/api/ai-quiz-drafts/${id}`);
  expect(reread.status()).toBe(200);
  expect((await reread.json()).draft.questions).toHaveLength(3);

  const savedTitle = `اختبار محفوظ ${Date.now()}`;
  expect((await request.patch(`/api/ai-quiz-drafts/${id}`, { data: { title: savedTitle } })).status()).toBe(200);
  const saved = await request.post(`/api/ai-quiz-drafts/${id}/save`);
  expect(saved.status()).toBe(201);
  const savedData = await saved.json();
  expect(savedData.quiz.title).toBe(savedTitle);
  expect(savedData.quiz.questions).toHaveLength(3);
  expect(savedData.quiz.questions[0].sourceEvidence.label).toBe("المعرفة العامة فقط");
  expect((await request.get(`/api/ai-quiz-drafts/${id}`)).status()).toBe(404);
  await request.delete(`/api/quizzes/${savedData.quiz.id}`);

  const invalidStart = await request.post("/api/ai-quiz-drafts");
  const invalidId = (await invalidStart.json()).draft.id as string;

  const invalid = {
    title: `مسودة غير صالحة ${Date.now()}`,
    questions: [
      {
        kind: "MCQ",
        text: "سؤال صحيح النص",
        timeLimitSec: 20,
        options: [
          { text: "أ", isCorrect: true },
          { text: "ب", isCorrect: false },
          { text: "ج", isCorrect: false },
          { text: "د", isCorrect: false },
          { text: "هـ", isCorrect: false },
        ],
      },
    ],
  };
  expect((await request.patch(`/api/ai-quiz-drafts/${invalidId}`, { data: invalid })).status()).toBe(200);
  const rejected = await request.post(`/api/ai-quiz-drafts/${invalidId}/save`);
  expect(rejected.status()).toBe(400);
  expect((await rejected.json()).error).toBe("too-many-options");

  const discarded = await request.delete(`/api/ai-quiz-drafts/${invalidId}`);
  expect(discarded.status()).toBe(200);
  expect((await request.get(`/api/ai-quiz-drafts/${invalidId}`)).status()).toBe(404);
  expect((await request.get("/api/ai-quiz-drafts/not-a-real-draft")).status()).toBe(404);
});

test("draft save rejects malformed Question data at the server boundary", async ({ request }) => {
  const cases = [
    { error: "title-required", title: "", question: { kind: "MCQ", text: "سؤال", options: [{ text: "أ", isCorrect: true }, { text: "ب", isCorrect: false }] } },
    { error: "question-text-required", title: "عنوان", question: { kind: "MCQ", text: "", options: [{ text: "أ", isCorrect: true }, { text: "ب", isCorrect: false }] } },
    { error: "invalid-question-kind", title: "عنوان", question: { kind: "OTHER", text: "سؤال", options: [] } },
    { error: "too-many-options", title: "عنوان", question: { kind: "MCQ", text: "سؤال", options: [{ text: "أ", isCorrect: true }, { text: "ب", isCorrect: false }, { text: "ج", isCorrect: false }, { text: "د", isCorrect: false }, { text: "هـ", isCorrect: false }] } },
    { error: "mcq-single-correct-required", title: "عنوان", question: { kind: "MCQ", text: "سؤال", options: [{ text: "أ", isCorrect: false }, { text: "ب", isCorrect: false }] } },
    { error: "mcq-single-correct-required", title: "عنوان", question: { kind: "MCQ", text: "سؤال", options: [{ text: "أ", isCorrect: true }, { text: "ب", isCorrect: true }] } },
    { error: "input-options-not-allowed", title: "عنوان", question: { kind: "INPUT", text: "سؤال", options: [{ text: "خيار", isCorrect: false }] } },
  ];

  for (const invalid of cases) {
    const start = await request.post("/api/ai-quiz-drafts");
    const id = (await start.json()).draft.id as string;
    await request.patch(`/api/ai-quiz-drafts/${id}`, {
      data: { title: invalid.title, questions: [{ ...invalid.question, timeLimitSec: 20 }] },
    });
    const save = await request.post(`/api/ai-quiz-drafts/${id}/save`);
    expect(save.status()).toBe(400);
    expect((await save.json()).error).toBe(invalid.error);
    await request.delete(`/api/ai-quiz-drafts/${id}`);
  }
});

test("targeted revisions are previewed, can be discarded or applied, and preserve direct edits", async ({ request }) => {
  const start = await request.post("/api/ai-quiz-drafts");
  const id = (await start.json()).draft.id as string;
  const generated = await request.post(`/api/ai-quiz-drafts/${id}/generate`, {
    data: { instruction, questionCount: 3, mode: "initial" },
  });
  expect(generated.status()).toBe(200);
  const initial = (await generated.json()).draft;

  const editedQuestions = initial.questions.map((question: Record<string, unknown>, index: number) =>
    index === 1 ? { ...question, text: "تصحيح المعلّم للسؤال الثاني" } : question,
  );
  expect((await request.patch(`/api/ai-quiz-drafts/${id}`, { data: { questions: editedQuestions } })).status()).toBe(200);

  const proposed = await request.post(`/api/ai-quiz-drafts/${id}/generate`, {
    data: { instruction: "حسّن صياغة السؤالين الأول والثالث", mode: "targeted" },
  });
  expect(proposed.status()).toBe(200);
  const proposedData = await proposed.json();
  expect(proposedData.response.type).toBe("revision");
  expect(proposedData.draft.questions[1].text).toBe("تصحيح المعلّم للسؤال الثاني");
  expect(proposedData.draft.pendingRevision.mode).toBe("targeted");
  expect(proposedData.draft.pendingRevision.changes.map((change: { questionIndex: number }) => change.questionIndex)).toEqual([0, 2]);
  expect(proposedData.draft.messages).toHaveLength(4);
  const blockedSave = await request.post(`/api/ai-quiz-drafts/${id}/save`);
  expect(blockedSave.status()).toBe(400);
  expect((await blockedSave.json()).error).toBe("revision-pending");

  const beforeDiscard = await request.get(`/api/ai-quiz-drafts/${id}`);
  expect((await beforeDiscard.json()).draft.pendingRevision).not.toBeNull();
  const discarded = await request.post(`/api/ai-quiz-drafts/${id}/revision`, { data: { action: "discard" } });
  expect(discarded.status()).toBe(200);
  const afterDiscard = (await discarded.json()).draft;
  expect(afterDiscard.pendingRevision).toBeNull();
  expect(afterDiscard.questions[1].text).toBe("تصحيح المعلّم للسؤال الثاني");

  const secondProposal = await request.post(`/api/ai-quiz-drafts/${id}/generate`, {
    data: { instruction: "حسّن صياغة السؤالين الأول والثالث", mode: "targeted" },
  });
  expect(secondProposal.status()).toBe(200);
  const applied = await request.post(`/api/ai-quiz-drafts/${id}/revision`, { data: { action: "apply" } });
  expect(applied.status()).toBe(200);
  const appliedData = await applied.json();
  expect(appliedData.draft.pendingRevision).toBeNull();
  expect(appliedData.draft.questions[0].text).toContain("مراجعة موجهة");
  expect(appliedData.draft.questions[1].text).toBe("تصحيح المعلّم للسؤال الثاني");
  expect(appliedData.draft.questions[2].text).toContain("مراجعة موجهة");

  const staleProposal = await request.post(`/api/ai-quiz-drafts/${id}/generate`, {
    data: { instruction: "حسّن صياغة السؤال الأول", mode: "targeted" },
  });
  expect(staleProposal.status()).toBe(200);
  await request.patch(`/api/ai-quiz-drafts/${id}`, {
    data: { questions: appliedData.draft.questions.map((question: Record<string, unknown>, index: number) => index === 0 ? { ...question, text: "تصحيح أحدث من المعلّم" } : question) },
  });
  const conflictApply = await request.post(`/api/ai-quiz-drafts/${id}/revision`, { data: { action: "apply" } });
  expect(conflictApply.status()).toBe(200);
  const conflictData = await conflictApply.json();
  expect(conflictData.conflictedQuestionIndexes).toEqual([0]);
  expect(conflictData.draft.questions[0].text).toBe("تصحيح أحدث من المعلّم");

  const newSet = await request.post(`/api/ai-quiz-drafts/${id}/generate`, {
    data: { instruction: "أنشئ مجموعة جديدة عن آداب التلاوة", questionCount: 2, mode: "new-set" },
  });
  expect(newSet.status()).toBe(200);
  const newSetData = await newSet.json();
  expect(newSetData.draft.pendingRevision.mode).toBe("new-set");
  expect(newSetData.draft.questions[0].text).toBe("تصحيح أحدث من المعلّم");
  expect((await request.post(`/api/ai-quiz-drafts/${id}/revision`, { data: { action: "discard" } })).status()).toBe(200);
  expect((await request.patch(`/api/ai-quiz-drafts/${id}`, { data: { title: "عنوان حالي" } })).status()).toBe(200);
  const appliedNewSet = await request.post(`/api/ai-quiz-drafts/${id}/generate`, {
    data: { instruction: "أنشئ مجموعة جديدة عن آداب التلاوة", questionCount: 2, mode: "new-set" },
  });
  expect(appliedNewSet.status()).toBe(200);
  const appliedNewSetResponse = await request.post(`/api/ai-quiz-drafts/${id}/revision`, { data: { action: "apply" } });
  expect(appliedNewSetResponse.status()).toBe(200);
  expect((await appliedNewSetResponse.json()).draft.title).toBe("مبادئ القرآن الكريم");
  const afterNewSet = await request.get(`/api/ai-quiz-drafts/${id}`);
  expect((await afterNewSet.json()).draft.questions).toHaveLength(2);
  expect((await request.get("/api/ai-quiz-drafts/not-owned-by-this-teacher")).status()).toBe(404);
  expect((await request.post("/api/ai-quiz-drafts/not-owned-by-this-teacher/revision", { data: { action: "apply" } })).status()).toBe(404);
  expect((await request.delete(`/api/ai-quiz-drafts/${id}`)).status()).toBe(200);
});

test("teacher can review, edit, resume, and explicitly save a prompt-only draft", async ({ page }, testInfo) => {
  const start = await page.request.post("/api/ai-quiz-drafts");
  const id = (await start.json()).draft.id as string;
  await page.goto(`/ai-quiz-drafts/${id}`);
  await expect(page.getByRole("heading", { name: "محادثة مسودة اختبار" })).toBeVisible({ timeout: 15000 });

  const title = `أسئلة التلاوة ${testInfo.project.name}-${testInfo.workerIndex}-${testInfo.repeatEachIndex}-${Date.now()}`;
  await page.getByLabel("تعليماتك").fill(instruction);
  await page.locator('input[type="number"]').fill("2");
  const generation = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().endsWith(`/api/ai-quiz-drafts/${id}/generate`),
  );
  await page.getByRole("button", { name: "أنشئ مسودة الأسئلة" }).click();
  expect((await generation).status()).toBe(200);
   await expect(page.getByText("أُعدّت المسودة. راجع الأسئلة ثم احفظها كاختبار.")).toBeVisible({ timeout: 15000 });
   await expect(page.getByRole("region", { name: "المسودة القابلة للتحرير" }).getByText("المعرفة العامة فقط").first()).toBeVisible();
   await expect(page.getByLabel("نص السؤال 1")).toBeVisible();

   if (testInfo.project.name === "mobile") await page.getByRole("button", { name: "المحادثة" }).click();
   await page.getByLabel("تعليماتك").fill("حسّن صياغة السؤال الأول");
   await page.getByRole("button", { name: "اقترح مراجعة موجهة" }).click();
   await expect(page.getByRole("heading", { name: "معاينة المراجعة المقترحة" })).toBeVisible({ timeout: 15000 });
   await page.getByRole("button", { name: "تجاهل المراجعة" }).click();
   await expect(page.getByRole("heading", { name: "معاينة المراجعة المقترحة" })).toBeHidden();

   if (testInfo.project.name === "mobile") await page.getByRole("button", { name: "المحادثة" }).click();
   await page.getByRole("button", { name: "اقترح مراجعة موجهة" }).click();
   await expect(page.getByRole("heading", { name: "معاينة المراجعة المقترحة" })).toBeVisible({ timeout: 15000 });
   await page.getByRole("button", { name: "تطبيق المراجعة" }).click();
   await expect(page.getByText("تم تطبيق المراجعة على المسودة.")).toBeVisible({ timeout: 15000 });

   if (testInfo.project.name === "mobile") await page.getByRole("button", { name: "المسودة", exact: true }).click();
   await page.getByLabel("نوع السؤال 1").selectOption("INPUT");
   await page.getByRole("button", { name: "خفض السؤال 1" }).click();
   await expect(page.getByLabel("نوع السؤال 2")).toHaveValue("INPUT");
   await page.getByLabel("نوع السؤال 2").selectOption("MCQ");
   const editedQuestion = page.getByRole("article").nth(1);
   await editedQuestion.getByPlaceholder("الخيار 1").fill("إجابة أولى من المعلّم");
   await editedQuestion.getByPlaceholder("الخيار 2").fill("إجابة ثانية من المعلّم");
   await editedQuestion.getByLabel("الإجابة الصحيحة 2").check();

   await page.getByLabel("عنوان الاختبار").fill(title);
  await page.getByLabel("نص السؤال 1").fill("ما السلوك الصحيح عند تلاوة القرآن؟");
  await page.getByRole("button", { name: "حفظ تعديلات المسودة" }).click();
  await expect(page.getByText("تم حفظ تعديلات المسودة.")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("عنوان الاختبار")).toHaveValue(title);
  await expect(page.getByLabel("نص السؤال 1")).toHaveValue("ما السلوك الصحيح عند تلاوة القرآن؟");

  await page.getByRole("button", { name: "حفظ كاختبار" }).click();
  await expect(page.getByRole("heading", { name: "مكتبة الأسئلة" })).toBeVisible();
  await expect(page.getByRole("link", { name: title })).toBeVisible();
});

test("teacher manages temporary sources, source policies, and source-grounded generation", async ({ request }) => {
  const start = await request.post("/api/ai-quiz-drafts");
  const id = (await start.json()).draft.id as string;

  const initialRead = await request.get(`/api/ai-quiz-drafts/${id}`);
  const initialDraft = (await initialRead.json()).draft;
  expect(initialDraft.sourcePolicy).toBe("GENERAL_KNOWLEDGE_ONLY");
  expect(initialDraft.sources).toEqual([]);

  const pasted = await request.post(`/api/ai-quiz-drafts/${id}/sources`, {
    multipart: {
      text: "سورة الفاتحة سبع آيات، أعظم سورة في القرآن الكريم، وتسمى أم الكتاب.",
      name: "ملخص الفاتحة",
    },
  });
  expect(pasted.status()).toBe(201);
  const pastedSource = (await pasted.json()).source;
  expect(pastedSource.kind).toBe("pasted");
  expect(pastedSource.name).toBe("ملخص الفاتحة");

  const txt = await request.post(`/api/ai-quiz-drafts/${id}/sources`, {
    multipart: {
      file: {
        name: "درس-التلاوة.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("أحكام التلاوة: المد الواجب، الغنة، القلقلة.", "utf8"),
      },
    },
  });
  expect(txt.status()).toBe(201);
  expect((await txt.json()).source.kind).toBe("txt");

  const markdown = await request.post(`/api/ai-quiz-drafts/${id}/sources`, {
    multipart: {
      file: {
        name: "خطة-المنهج.md",
        mimeType: "text/markdown",
        buffer: Buffer.from("# الوحدة الأولى\n\nتجويد سورة البقرة.", "utf8"),
      },
    },
  });
  expect(markdown.status()).toBe(201);
  const markdownSource = (await markdown.json()).source;

  const afterAdds = (await (await request.get(`/api/ai-quiz-drafts/${id}`)).json()).draft.sources;
  expect(afterAdds).toHaveLength(3);
  expect(afterAdds.every((source: { charCount: number }) => source.charCount > 0)).toBe(true);

  const unsupported = await request.post(`/api/ai-quiz-drafts/${id}/sources`, {
    multipart: {
      file: {
        name: "صورة.png",
        mimeType: "image/png",
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      },
    },
  });
  expect(unsupported.status()).toBe(400);
  expect((await unsupported.json()).error).toBe("unsupported-source-type");

  const oversized = await request.post(`/api/ai-quiz-drafts/${id}/sources`, {
    multipart: {
      file: {
        name: "ضخم.txt",
        mimeType: "text/plain",
        buffer: Buffer.alloc(5 * 1024 * 1024 + 1, 0x61),
      },
    },
  });
  expect(oversized.status()).toBe(400);
  expect((await oversized.json()).error).toBe("source-too-large");

  const emptyPaste = await request.post(`/api/ai-quiz-drafts/${id}/sources`, {
    multipart: { text: "   " },
  });
  expect(emptyPaste.status()).toBe(400);
  expect((await emptyPaste.json()).error).toBe("extraction-empty");

  const invalidPolicy = await request.patch(`/api/ai-quiz-drafts/${id}`, {
    data: { sourcePolicy: "EVERYTHING_ALLOWED" },
  });
  expect(invalidPolicy.status()).toBe(400);
  expect((await invalidPolicy.json()).error).toBe("unsupported-source-policy");

  expect((await request.delete(`/api/ai-quiz-drafts/${id}/sources/${markdownSource.id}`)).status()).toBe(200);
  expect((await request.delete(`/api/ai-quiz-drafts/${id}/sources/${markdownSource.id}`)).status()).toBe(404);
  expect((await request.delete(`/api/ai-quiz-drafts/${id}/sources/not-a-real-source`)).status()).toBe(404);
  expect((await request.delete(`/api/ai-quiz-drafts/unknown-draft/sources/${pastedSource.id}`)).status()).toBe(404);
  expect((await request.post(`/api/ai-quiz-drafts/unknown-draft/sources`, { multipart: { text: "نص" } })).status()).toBe(404);

  expect((await request.patch(`/api/ai-quiz-drafts/${id}`, { data: { sourcePolicy: "SOURCES_ONLY" } })).status()).toBe(200);
  await request.delete(`/api/ai-quiz-drafts/${id}/sources/${pastedSource.id}`);
  const txtSource = afterAdds.find((source: { kind: string }) => source.kind === "txt");
  await request.delete(`/api/ai-quiz-drafts/${id}/sources/${txtSource.id}`);

  const missingSources = await request.post(`/api/ai-quiz-drafts/${id}/generate`, {
    data: { instruction, questionCount: 2, mode: "initial" },
  });
  expect(missingSources.status()).toBe(400);
  expect((await missingSources.json()).error).toBe("sources-required");

  const restored = await request.post(`/api/ai-quiz-drafts/${id}/sources`, {
    multipart: { text: "سورة الفاتحة سبع آيات، أعظم سورة في القرآن الكريم، وتسمى أم الكتاب." },
  });
  expect(restored.status()).toBe(201);

  const sourceOnly = await request.post(`/api/ai-quiz-drafts/${id}/generate`, {
    data: { instruction, questionCount: 3, mode: "initial" },
  });
  expect(sourceOnly.status()).toBe(200);
  const sourceOnlyData = await sourceOnly.json();
  expect(sourceOnlyData.response.type).toBe("draft");
  for (const question of sourceOnlyData.draft.questions) {
    expect(question.sourceEvidence.type).toBe("source");
    expect(question.sourceEvidence.documentName).toBe("نص ملصق");
    expect(question.sourceEvidence.excerpt).toContain("سورة الفاتحة");
    expect(question.text).toMatch(/[\u0600-\u06ff]/);
    expect(question.text).not.toMatch(/[A-Za-z]/);
  }

  expect(
    (await request.patch(`/api/ai-quiz-drafts/${id}`, { data: { sourcePolicy: "SOURCES_PLUS_GENERAL_KNOWLEDGE" } })).status(),
  ).toBe(200);
  const mixed = await request.post(`/api/ai-quiz-drafts/${id}/generate`, {
    data: { instruction, questionCount: 4, mode: "initial" },
  });
  expect(mixed.status()).toBe(200);
  const mixedQuestions = (await mixed.json()).draft.questions;
  expect(mixedQuestions.some((question: { sourceEvidence: { type: string } }) => question.sourceEvidence.type === "source")).toBe(true);
  const supplemental = mixedQuestions.filter(
    (question: { sourceEvidence: { type: string; label?: string } }) => question.sourceEvidence.type === "general_knowledge",
  );
  expect(supplemental.length).toBeGreaterThan(0);
  for (const question of supplemental) expect(question.sourceEvidence.label).toBe("محتوى إضافي من المعرفة العامة");

  expect((await request.patch(`/api/ai-quiz-drafts/${id}`, { data: { sourcePolicy: "GENERAL_KNOWLEDGE_ONLY" } })).status()).toBe(200);
  const generalKnowledge = await request.post(`/api/ai-quiz-drafts/${id}/generate`, {
    data: { instruction, questionCount: 2, mode: "initial" },
  });
  const generalQuestions = (await generalKnowledge.json()).draft.questions;
  for (const question of generalQuestions) {
    expect(question.sourceEvidence.type).toBe("general_knowledge");
    expect(question.sourceEvidence.label).toBe("المعرفة العامة فقط");
  }

  await request.patch(`/api/ai-quiz-drafts/${id}`, { data: { title: "اختبار المصادر المؤقتة" } });
  const saved = await request.post(`/api/ai-quiz-drafts/${id}/save`);
  expect(saved.status()).toBe(201);
  const savedQuiz = (await saved.json()).quiz;
  expect(savedQuiz.questions[0].sourceEvidence.label).toBe("المعرفة العامة فقط");
  expect((await request.get(`/api/ai-quiz-drafts/${id}`)).status()).toBe(404);
  await request.delete(`/api/quizzes/${savedQuiz.id}`);
});

test("draft page manages sources and switches source policy from the conversation panel", async ({ page }, testInfo) => {
  const start = await page.request.post("/api/ai-quiz-drafts");
  const id = (await start.json()).draft.id as string;
  await page.goto(`/ai-quiz-drafts/${id}`);
  await expect(page.getByRole("heading", { name: "محادثة مسودة اختبار" })).toBeVisible({ timeout: 15000 });
  await page.getByText("المصادر وسياسة التوليد").click();

  const policyGroup = page.getByRole("radio", { name: /المصادر المرفوعة فقط/ });
  const plusPolicy = page.getByRole("radio", { name: /المصادر المرفوعة مع المعرفة العامة/ });
  await expect(page.getByRole("radio", { name: /المعرفة العامة فقط/ })).toBeChecked();
  await expect(page.getByRole("heading", { name: "المصادر المؤقتة" })).toBeVisible();

  await page.getByLabel("نص المصدر الملصق").fill("سورة الفاتحة سبع آيات وتسمى أم الكتاب.");
  await page.getByRole("button", { name: "إضافة النص الملصق" }).click();
  await expect(page.getByText("تمت إضافة المصدر إلى المسودة.")).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("list", { name: "قائمة المصادر" }).getByText("نص ملصق", { exact: true })).toBeVisible();

  await policyGroup.check();
  await page.getByLabel("تعليماتك").fill("أنشئ أسئلة عن المصدر المرفوع");
  await page.locator('input[type="number"]').fill("2");
  await page.getByRole("button", { name: "أنشئ مسودة الأسئلة" }).click();
  await expect(page.getByText("أُعدّت المسودة. راجع الأسئلة ثم احفظها كاختبار.")).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/من المصدر المرفوع/).first()).toBeVisible();

  if (testInfo.project.name === "mobile") await page.getByRole("button", { name: "المحادثة" }).click();
  await page.getByRole("button", { name: "إزالة المصدر نص ملصق" }).click();
  await expect(page.getByText("تمت إزالة المصدر من المسودة.")).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("list", { name: "قائمة المصادر" }).getByText("لا توجد مصادر مضافة.")).toBeVisible();

  await plusPolicy.check();
  await expect(page.getByText("أضف مصدرًا واحدًا على الأقل حتى تُبنى الأسئلة من المصادر.")).toBeVisible();
  await page.getByLabel("تعليماتك").fill("حسّن صياغة السؤال الأول");
  await page.getByRole("button", { name: "اقترح مراجعة موجهة" }).click();
  await expect(page.getByRole("status").filter({ hasText: /سياسة المصادر تتطلب مصدرًا مرفوعًا/ })).toBeVisible({ timeout: 15000 });

  if (testInfo.project.name === "mobile") await page.getByRole("button", { name: "المحادثة" }).click();
  await page.getByRole("radio", { name: /المعرفة العامة فقط/ }).check();
  await page.getByRole("button", { name: "اقترح مراجعة موجهة" }).click();
  await expect(page.getByRole("heading", { name: "معاينة المراجعة المقترحة" })).toBeVisible({ timeout: 15000 });

  if (testInfo.project.name === "mobile") {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  }
  await page.getByRole("button", { name: "حذف المسودة" }).click();
  await expect(page.getByRole("heading", { name: "مسودات الاختبارات" })).toBeVisible();
});

test("mobile draft page provides Conversation and Draft tabs without overflow", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile layout check");
  await page.goto("/ai-quiz-drafts");
  await Promise.all([
    page.waitForURL(/\/ai-quiz-drafts\/[^/]+$/, { timeout: 15000 }),
    page.getByRole("button", { name: "مسودة جديدة" }).click(),
  ]);
  await expect(page.getByRole("button", { name: "المحادثة" })).toBeVisible();
  await expect(page.getByRole("button", { name: "المسودة", exact: true })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByRole("button", { name: "حذف المسودة" }).click();
  await expect(page.getByRole("heading", { name: "مسودات الاختبارات" })).toBeVisible();
});

const pastedSource = "سورة الفاتحة سبع آيات، أعظم سورة في القرآن الكريم، وتسمى أم الكتاب.";

async function startSourceDraft(request: import("@playwright/test").APIRequestContext, title: string) {
  const start = await request.post("/api/ai-quiz-drafts");
  const id = ((await start.json()).draft as { id: string }).id;
  await request.patch(`/api/ai-quiz-drafts/${id}`, { data: { sourcePolicy: "SOURCES_ONLY" } });
  await request.post(`/api/ai-quiz-drafts/${id}/sources`, { multipart: { text: pastedSource, name: "ملخص الفاتحة" } });
  const generated = await request.post(`/api/ai-quiz-drafts/${id}/generate`, {
    data: { instruction, questionCount: 2, mode: "initial" },
  });
  expect(generated.status()).toBe(200);
  await request.patch(`/api/ai-quiz-drafts/${id}`, { data: { title } });
  return id;
}

test("provenance: save stores compact evidence and cleans up only after success; students never see evidence", async ({
  request,
}) => {
  const id = await startSourceDraft(request, `اختبار المصدر ${Date.now()}`);
  const beforeSave = ((await (await request.get(`/api/ai-quiz-drafts/${id}`)).json()).draft as {
    sources: unknown[];
  });
  expect(beforeSave.sources).toHaveLength(1);

  const saved = await request.post(`/api/ai-quiz-drafts/${id}/save`);
  expect(saved.status()).toBe(201);
  const quiz = (await saved.json()).quiz as {
    id: string;
    questions: { sourceEvidence: { type: string; documentName: string; excerpt: string } }[];
  };
  const evidence = quiz.questions[0].sourceEvidence;
  expect(evidence.type).toBe("source");
  expect(evidence.documentName).toBe("ملخص الفاتحة");
  expect(evidence.excerpt.length).toBeGreaterThan(0);
  expect(evidence.excerpt.length).toBeLessThanOrEqual(301);
  // conversation deleted only after the successful save (sources cascade with it)
  expect((await request.get(`/api/ai-quiz-drafts/${id}`)).status()).toBe(404);

  // teacher quiz detail keeps the evidence
  const detail = ((await (await request.get(`/api/quizzes/${quiz.id}`)).json()).quiz as {
    questions: { sourceEvidence: { documentName: string } }[];
  });
  expect(detail.questions[0].sourceEvidence.documentName).toBe("ملخص الفاتحة");

  // Quiz Copy retains compact evidence without any conversation or source-file link
  const copied = await request.post(`/api/quizzes/${quiz.id}/copy`);
  expect(copied.status()).toBe(201);
  const copyId = ((await copied.json()).quiz as { id: string }).id;
  const copyDetail = (await (await request.get(`/api/quizzes/${copyId}`)).json()).quiz as unknown as Record<
    string,
    unknown
  >;
  const copyQuestions = copyDetail.questions as { sourceEvidence: { documentName: string } }[];
  expect(copyQuestions[0].sourceEvidence.documentName).toBe("ملخص الفاتحة");
  expect(JSON.stringify(copyDetail)).not.toContain("AIQuizDraft");
  expect(JSON.stringify(copyDetail)).not.toContain("extractedText");

  // student-facing practice view strips source evidence
  const practice = ((await (await request.get(`/api/quizzes/${quiz.id}/practice`)).json()).quiz as {
    questions: Record<string, unknown>[];
  });
  expect(practice.questions.length).toBeGreaterThan(0);
  for (const question of practice.questions) expect("sourceEvidence" in question).toBe(false);

  // student-facing practice submit returns outcomes only
  const submitted = await request.post(`/api/practice/${quiz.id}/submit`, { data: { answers: [] } });
  expect(submitted.status()).toBe(200);
  expect(JSON.stringify(await submitted.json())).not.toContain("sourceEvidence");

  // student-facing competition state strips source evidence
  const session = await request.post(`/api/quizzes/${quiz.id}/session`);
  expect(session.status()).toBe(201);
  const sessionId = ((await session.json()).session as { id: string }).id;
  const state = await new Promise<Record<string, unknown>>((resolve, reject) => {
    const host: Socket = io(`${BASE}/session`, {
      path: "/socket",
      transports: ["websocket"],
      query: { role: "host", sessionId },
    });
    const fail = setTimeout(() => reject(new Error("no competition state")), 15000);
    host.on("state", (payload: Record<string, unknown>) => {
      if (payload.phase !== "QUESTION" || !payload.question) return;
      clearTimeout(fail);
      host.close();
      resolve(payload);
    });
    host.on("connect", () => host.emit("start"));
  });
  expect("sourceEvidence" in (state.question as object)).toBe(false);

  await request.delete(`/api/quizzes/${quiz.id}`);
  await request.delete(`/api/quizzes/${copyId}`);
});

test("provenance: failed save keeps the draft and its sources; discard deletes them without a Quiz", async ({
  request,
}) => {
  const id = await startSourceDraft(request, `مسودة فاشلة ${Date.now()}`);
  const failedTitle = `عنوان فاشل ${Date.now()}`;
  const invalid = {
    title: failedTitle,
    questions: [
      {
        kind: "MCQ",
        text: "سؤال",
        timeLimitSec: 20,
        options: [
          { text: "أ", isCorrect: true },
          { text: "ب", isCorrect: false },
          { text: "ج", isCorrect: false },
          { text: "د", isCorrect: false },
          { text: "هـ", isCorrect: false },
        ],
      },
    ],
  };
  expect((await request.patch(`/api/ai-quiz-drafts/${id}`, { data: invalid })).status()).toBe(200);

  const failed = await request.post(`/api/ai-quiz-drafts/${id}/save`);
  expect(failed.status()).toBe(400);
  const stillThere = ((await (await request.get(`/api/ai-quiz-drafts/${id}`)).json()).draft as {
    sources: unknown[];
  });
  expect(stillThere.sources).toHaveLength(1);
  const library = ((await (await request.get("/api/quizzes")).json()).quizzes as { title: string }[]);
  expect(library.some((row) => row.title === failedTitle)).toBe(false);

  const discarded = await request.delete(`/api/ai-quiz-drafts/${id}`);
  expect(discarded.status()).toBe(200);
  expect((await request.get(`/api/ai-quiz-drafts/${id}`)).status()).toBe(404);
  const libraryAfter = ((await (await request.get("/api/quizzes")).json()).quizzes as { title: string }[]);
  expect(libraryAfter.some((row) => row.title === failedTitle)).toBe(false);
});

test("teacher sees excerpt and page reference during draft review and on the saved Quiz", async ({ page }, testInfo) => {
  const id = await startSourceDraft(page.request, `اختبار الدليل ${Date.now()}`);
  const draft = ((await (await page.request.get(`/api/ai-quiz-drafts/${id}`)).json()).draft as {
    questions: Record<string, unknown>[];
  });
  await page.request.patch(`/api/ai-quiz-drafts/${id}`, {
    data: {
      questions: draft.questions.map((question: Record<string, unknown>, index: number) =>
        index === 0
          ? { ...question, sourceEvidence: { ...(question.sourceEvidence as object), pageSection: "الصفحة الثالثة" } }
          : question,
      ),
    },
  });

  await page.goto(`/ai-quiz-drafts/${id}`);
  await expect(page.getByRole("heading", { name: "محادثة مسودة اختبار" })).toBeVisible({ timeout: 15000 });
  if (testInfo.project.name === "mobile") await page.getByRole("button", { name: "المسودة", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "المسودة القابلة للتحرير" }).getByText(/ملخص الفاتحة/).first(),
  ).toBeVisible();
  await expect(page.getByText(/الصفحة الثالثة/).first()).toBeVisible();
  await expect(page.getByText(/«سورة الفاتحة سبع آيات/).first()).toBeVisible();

  const title = `اختبار الدليل المحفوظ ${Date.now()}`;
  await page.getByLabel("عنوان الاختبار").fill(title);
  await page.getByRole("button", { name: "حفظ كاختبار" }).click();
  await expect(page.getByRole("heading", { name: "مكتبة الأسئلة" })).toBeVisible({ timeout: 15000 });

  const library = ((await (await page.request.get("/api/quizzes")).json()).quizzes as { id: string; title: string }[]);
  const savedQuiz = library.find((row) => row.title === title);
  expect(savedQuiz).toBeTruthy();
  await page.goto(`/quizzes/${savedQuiz!.id}`);
  await expect(page.getByText(/ملخص الفاتحة/).first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/الصفحة الثالثة/).first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/«سورة الفاتحة سبع آيات/).first()).toBeVisible({ timeout: 15000 });
  await page.request.delete(`/api/quizzes/${savedQuiz!.id}`);
});

test("complete teacher journey: source input, Source Policy, generation, revision, direct edit, Save as Quiz", async ({ page }, testInfo) => {
  const start = await page.request.post("/api/ai-quiz-drafts");
  const id = ((await start.json()).draft as { id: string }).id;
  await page.goto(`/ai-quiz-drafts/${id}`);
  await expect(page.getByRole("heading", { name: "محادثة مسودة اختبار" })).toBeVisible({ timeout: 15000 });

  const title = `رحلة المصدر ${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;

  await page.getByText("المصادر وسياسة التوليد").click();
  await page.getByLabel("نص المصدر الملصق").fill("سورة الفاتحة سبع آيات، وتسمى أم الكتاب، وهي أول سورة في المصحف.");
  await page.getByRole("button", { name: "إضافة النص الملصق" }).click();
  await expect(page.getByText("تمت إضافة المصدر إلى المسودة.")).toBeVisible({ timeout: 15000 });

  await page.getByRole("radio", { name: /المصادر المرفوعة فقط/ }).check();
  await page.getByLabel("تعليماتك").fill("أنشئ أسئلة من المصدر المرفوع عن سورة الفاتحة");
  await page.locator('input[type="number"]').fill("2");
  await page.getByRole("button", { name: "أنشئ مسودة الأسئلة" }).click();
  await expect(page.getByText("أُعدّت المسودة. راجع الأسئلة ثم احفظها كاختبار.")).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("region", { name: "المسودة القابلة للتحرير" }).getByText(/من المصدر المرفوع/).first()).toBeVisible();

  if (testInfo.project.name === "mobile") await page.getByRole("button", { name: "المحادثة" }).click();
  await page.getByLabel("تعليماتك").fill("حسّن صياغة السؤال الثاني");
  await page.getByRole("button", { name: "اقترح مراجعة موجهة" }).click();
  await expect(page.getByRole("heading", { name: "معاينة المراجعة المقترحة" })).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "تطبيق المراجعة" }).click();
  await expect(page.getByText("تم تطبيق المراجعة على المسودة.")).toBeVisible({ timeout: 15000 });

  if (testInfo.project.name === "mobile") await page.getByRole("button", { name: "المسودة", exact: true }).click();
  await page.getByLabel("عنوان الاختبار").fill(title);
  await page.getByLabel("نص السؤال 1").fill("بكم آيةٍ تبدأ سورة الفاتحة؟");
  await page.getByRole("button", { name: "حفظ تعديلات المسودة" }).click();
  await expect(page.getByText("تم حفظ تعديلات المسودة.")).toBeVisible({ timeout: 15000 });

  await page.getByRole("button", { name: "حفظ كاختبار" }).click();
  await expect(page.getByRole("heading", { name: "مكتبة الأسئلة" })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("link", { name: title })).toBeVisible();

  const library = ((await (await page.request.get("/api/quizzes")).json()).quizzes as { id: string; title: string }[]);
  const savedQuiz = library.find((row) => row.title === title);
  expect(savedQuiz).toBeTruthy();
  await page.request.delete(`/api/quizzes/${savedQuiz!.id}`);
});

test("an AI-created Quiz runs in Practice and Competition; INPUT Questions stay Practice-only", async ({ page }) => {
  const request = page.request;

  const start = await request.post("/api/ai-quiz-drafts");
  const id = ((await start.json()).draft as { id: string }).id;
  const generated = await request.post(`/api/ai-quiz-drafts/${id}/generate`, {
    data: { instruction, questionCount: 2, mode: "initial" },
  });
  expect(generated.status()).toBe(200);
  const draft = ((await generated.json()).draft as { questions: { kind: string }[] });
  expect(draft.questions.map((question) => question.kind)).toEqual(["MCQ", "TRUE_FALSE"]);
  await request.patch(`/api/ai-quiz-drafts/${id}`, { data: { title: `اختبار الذكاء ${Date.now()}` } });
  const saved = await request.post(`/api/ai-quiz-drafts/${id}/save`);
  expect(saved.status()).toBe(201);
  const quiz = ((await saved.json()).quiz as { id: string; title: string });

  // Practice track: the student view serves the AI Quiz and auto-grades an MCQ answer
  const practice = ((await (await request.get(`/api/quizzes/${quiz.id}/practice`)).json()).quiz as {
    id: string;
    questions: { id: string; kind: string; options: { id: string }[] }[];
  });
  expect(practice.questions).toHaveLength(2);
  const mcq = practice.questions.find((question) => question.kind === "MCQ")!;
  const detail = ((await (await request.get(`/api/quizzes/${quiz.id}`)).json()).quiz as {
    questions: { id: string; options: { id: string; isCorrect: boolean }[] }[];
  });
  const correct = detail.questions.find((question) => question.id === mcq.id)!.options.find((option) => option.isCorrect)!;
  const submitted = await request.post(`/api/practice/${quiz.id}/submit`, {
    data: { answers: [{ questionId: mcq.id, chosenOptionId: correct.id }] },
  });
  expect(submitted.status()).toBe(200);
  expect((((await submitted.json()).results as { isCorrect: boolean }[])[0]).isCorrect).toBe(true);

  // Competition track: the AI Quiz launches a live session a student can answer
  const sessionResponse = await request.post(`/api/quizzes/${quiz.id}/session`);
  expect(sessionResponse.status()).toBe(201);
  const { session } = ((await sessionResponse.json()) as { session: { id: string; joinCode: string } });

  const host: Socket = io(`${BASE}/session`, { path: "/socket", transports: ["websocket"], query: { role: "host", sessionId: session.id } });
  const student: Socket = io(`${BASE}/session`, { path: "/socket", transports: ["websocket"], query: { role: "student" } });
  try {
    const joined = await new Promise<{ ok: boolean }>((resolve, reject) => {
      const fail = setTimeout(() => reject(new Error("no join ack")), 15000);
      student.on("connect", () =>
        student.emit("join", { code: session.joinCode, nickname: "طالب المسابقة" }, (result: { ok: boolean }) => {
          clearTimeout(fail);
          resolve(result);
        }),
      );
    });
    expect(joined.ok).toBe(true);

    host.emit("start");
    const questionState = await new Promise<{ question: { options: { id: string }[] } }>((resolve, reject) => {
      const fail = setTimeout(() => reject(new Error("no question state")), 15000);
      student.on("state", (payload: { phase: string; question?: unknown }) => {
        if (payload.phase === "QUESTION" && payload.question) {
          clearTimeout(fail);
          resolve(payload as { question: { options: { id: string }[] } });
        }
      });
    });
    expect(questionState.question.options.length).toBeGreaterThanOrEqual(2);

    const answer = await new Promise<{ correct: boolean }>((resolve, reject) => {
      const fail = setTimeout(() => reject(new Error("no answer ack")), 15000);
      student.emit("answer", { optionId: correct.id, timeMs: 1200 }, (result: { correct: boolean }) => {
        clearTimeout(fail);
        resolve(result);
      });
    });
    expect(answer.correct).toBe(true);

    host.emit("reveal");
    const review = await new Promise<void>((resolve, reject) => {
      const fail = setTimeout(() => reject(new Error("no review state")), 15000);
      student.on("state", (payload: { phase: string }) => {
        if (payload.phase === "ANSWER_REVIEW") {
          clearTimeout(fail);
          resolve();
        }
      });
    });
    expect(review).toBeUndefined();
  } finally {
    host.close();
    student.close();
  }

  // An INPUT Question is Practice-only: practice serves it, competition launch refuses it
  const secondStart = await request.post("/api/ai-quiz-drafts");
  const secondId = ((await secondStart.json()).draft as { id: string }).id;
  const secondGenerated = await request.post(`/api/ai-quiz-drafts/${secondId}/generate`, {
    data: { instruction, questionCount: 2, mode: "initial" },
  });
  expect(secondGenerated.status()).toBe(200);
  const secondDraft = ((await secondGenerated.json()).draft as {
    questions: { kind: string; text: string; timeLimitSec: number; options: { text: string; isCorrect: boolean }[]; sourceEvidence?: unknown }[];
  });
  const inputTitle = `اختبار إجابة حرة ${Date.now()}`;
  await request.patch(`/api/ai-quiz-drafts/${secondId}`, {
    data: {
      title: inputTitle,
      questions: secondDraft.questions.map((question, index) =>
        index === 0 ? { ...question, kind: "INPUT" as const, options: [] } : question,
      ),
    },
  });
  const secondSaved = await request.post(`/api/ai-quiz-drafts/${secondId}/save`);
  expect(secondSaved.status()).toBe(201);
  const inputQuiz = ((await secondSaved.json()).quiz as { id: string });

  const inputPractice = ((await (await request.get(`/api/quizzes/${inputQuiz.id}/practice`)).json()).quiz as {
    questions: { kind: string }[];
  });
  expect(inputPractice.questions.some((question) => question.kind === "INPUT")).toBe(true);

  const refused = await request.post(`/api/quizzes/${inputQuiz.id}/session`);
  expect(refused.status()).toBe(400);
  expect((await refused.json()).error).toBe("input-questions-not-allowed-in-competition");

  // the library page explains the refusal in Arabic instead of failing silently
  await page.goto("/quizzes");
  const row = page.locator("li", { hasText: inputTitle });
  await expect(row).toBeVisible({ timeout: 15000 });
  await row.getByRole("button", { name: "ابدأ مسابقة" }).click();
  await expect(page.getByText("هذا الاختبار يحتوي أسئلة إجابة حرة وهي للاختبار الذاتي فقط")).toBeVisible({ timeout: 15000 });

  await request.delete(`/api/quizzes/${quiz.id}`);
  await request.delete(`/api/quizzes/${inputQuiz.id}`);
});

test("rate limit: the per-Teacher hourly allowance refuses generation and explains the wait in Arabic", async ({ page }) => {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const teacher = await prisma.teacher.findUniqueOrThrow({ where: { clerkId: "dev-teacher" } });
  await prisma.aIUsageEvent.deleteMany({ where: { teacherId: teacher.id } });
  try {
    const start = await page.request.post("/api/ai-quiz-drafts");
    const id = ((await start.json()).draft as { id: string }).id;

    await prisma.aIUsageEvent.createMany({
      data: Array.from({ length: DEFAULT_GENERATIONS_PER_HOUR }, () => ({ teacherId: teacher.id })),
    });

    const limited = await page.request.post(`/api/ai-quiz-drafts/${id}/generate`, {
      data: { instruction, questionCount: 1, mode: "initial" },
    });
    expect(limited.status()).toBe(429);
    const limitedBody = (await limited.json()) as { error: string; limit: number; retryAfterSec: number };
    expect(limitedBody.error).toBe("rate-limited");
    expect(limitedBody.limit).toBe(DEFAULT_GENERATIONS_PER_HOUR);
    expect(limitedBody.retryAfterSec).toBeGreaterThan(0);

    // the refused request leaves the draft untouched — no partial data
    const draft = ((await (await page.request.get(`/api/ai-quiz-drafts/${id}`)).json()).draft as {
      questions: unknown[];
      messages: unknown[];
    });
    expect(draft.questions).toHaveLength(0);
    expect(draft.messages).toHaveLength(0);

    // the Teacher-facing page explains the limit in Arabic
    await page.goto(`/ai-quiz-drafts/${id}`);
    await expect(page.getByRole("heading", { name: "محادثة مسودة اختبار" })).toBeVisible({ timeout: 15000 });
    await page.getByLabel("تعليماتك").fill(instruction);
    await page.locator('input[type="number"]').fill("1");
    await page.getByRole("button", { name: "أنشئ مسودة الأسئلة" }).click();
    await expect(page.getByText("لقد بلغت الحد المسموح من عمليات توليد الأسئلة")).toBeVisible({ timeout: 15000 });

    await page.request.delete(`/api/ai-quiz-drafts/${id}`);
  } finally {
    await prisma.aIUsageEvent.deleteMany({ where: { teacherId: teacher.id } });
    await prisma.$disconnect();
  }
});

test("manual Quiz creation and editing share the AI save-boundary validator", async ({ request }) => {
  const validMcq = [
    { text: "أ", isCorrect: true },
    { text: "ب", isCorrect: false },
  ];
  const scenarios: { error: string; title?: string; questions: unknown[] }[] = [
    { error: "title-required", title: "", questions: [{ kind: "MCQ", text: "سؤال", options: validMcq }] },
    { error: "mcq-options-required", questions: [{ kind: "MCQ", text: "سؤال", options: [{ text: "وحيد", isCorrect: true }] }] },
    {
      error: "too-many-options",
      questions: [
        {
          kind: "MCQ",
          text: "سؤال",
          options: [1, 2, 3, 4, 5].map((n) => ({ text: `خيار ${n}`, isCorrect: n === 1 })),
        },
      ],
    },
    { error: "mcq-single-correct-required", questions: [{ kind: "MCQ", text: "سؤال", options: [{ text: "أ", isCorrect: false }, { text: "ب", isCorrect: false }] }] },
    { error: "true-false-options-required", questions: [{ kind: "TRUE_FALSE", text: "سؤال", options: [] }] },
    { error: "question-text-required", questions: [{ kind: "MCQ", text: "   ", options: validMcq }] },
  ];

  for (const scenario of scenarios) {
    const created = await request.post("/api/quizzes", {
      data: { title: scenario.title ?? `يدوي ${Date.now()}-${Math.random()}`, questions: scenario.questions },
    });
    expect(created.status()).toBe(400);
    expect((await created.json()).error).toBe(scenario.error);
  }

  // stale options on an INPUT Question are stripped by normalization, not stored
  const staleInput = await request.post("/api/quizzes", {
    data: {
      title: `حرة نظيفة ${Date.now()}`,
      questions: [{ kind: "INPUT", text: "سؤال", options: validMcq }],
    },
  });
  expect(staleInput.status()).toBe(201);
  const staleQuiz = ((await staleInput.json()).quiz as { id: string; questions: { options: unknown[] }[] });
  expect(staleQuiz.questions[0].options).toHaveLength(0);
  await request.delete(`/api/quizzes/${staleQuiz.id}`);

  // the classic manual shape keeps working: TRUE_FALSE with a single صح option
  const created = await request.post("/api/quizzes", {
    data: {
      title: `صالح ${Date.now()}`,
      questions: [
        { kind: "TRUE_FALSE", text: "سورة الفاتحة مكية", options: [{ text: "صح", isCorrect: true }] },
        { kind: "INPUT", text: "اذكر آية تحفظها" },
      ],
    },
  });
  expect(created.status()).toBe(201);
  const quiz = ((await created.json()).quiz as { id: string; title: string });

  // replacing questions with invalid data is refused and keeps the stored Quiz intact
  const bad = await request.put(`/api/quizzes/${quiz.id}`, {
    data: { title: quiz.title, questions: [{ kind: "MCQ", text: "سؤال", options: [{ text: "أ", isCorrect: true }] }] },
  });
  expect(bad.status()).toBe(400);
  expect((await bad.json()).error).toBe("mcq-options-required");
  const detail = ((await (await request.get(`/api/quizzes/${quiz.id}`)).json()).quiz as { questions: unknown[] });
  expect(detail.questions).toHaveLength(2);

  await request.delete(`/api/quizzes/${quiz.id}`);
});
