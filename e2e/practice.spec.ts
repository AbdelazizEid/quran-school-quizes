import { expect, test } from "@playwright/test";

type PQuestion = { id: string; kind: string; options: { id: string }[] };

test("practice: MCQ auto-graded, Input Answer left for teacher review, resubmit upserts", async ({ request }) => {
  const quiz = (
    await (
      await request.post("/api/quizzes", {
        data: {
          title: `practice-${Date.now()}`,
          questions: [
            {
              kind: "MCQ",
              text: "أول سورة في المصحف؟",
              options: [
                { text: "الفاتحة", isCorrect: true },
                { text: "البقرة", isCorrect: false },
              ],
            },
            { kind: "INPUT", text: "اذكر آية تحفظها" },
          ],
        },
      })
    ).json()
  ).quiz;

  const practice = await (await request.get(`/api/quizzes/${quiz.id}/practice`)).json();
  expect(practice.quiz.questions).toHaveLength(2);
  expect("isCorrect" in practice.quiz.questions[0].options[0]).toBe(false);

  const mcq = practice.quiz.questions.find((q: PQuestion) => q.kind === "MCQ");
  const input = practice.quiz.questions.find((q: PQuestion) => q.kind === "INPUT");

  const submitted = await (
    await request.post(`/api/practice/${quiz.id}/submit`, {
      data: {
        answers: [
          { questionId: mcq.id, chosenOptionId: mcq.options[0].id },
          { questionId: input.id, textAnswer: "بسم الله الرحمن الرحيم" },
        ],
      },
    })
  ).json();
  expect(submitted.results.find((r: { questionId: string }) => r.questionId === mcq.id).isCorrect).toBe(true);
  expect(submitted.results.find((r: { questionId: string }) => r.questionId === input.id).isCorrect).toBe(null);

  const resubmitted = await (
    await request.post(`/api/practice/${quiz.id}/submit`, {
      data: { answers: [{ questionId: mcq.id, chosenOptionId: mcq.options[1].id }] },
    })
  ).json();
  expect(resubmitted.results[0].isCorrect).toBe(false);

  const review = await (await request.get(`/api/practice/answers?quizId=${quiz.id}`)).json();
  const pending = review.answers.find((a: { questionId: string }) => a.questionId === input.id);
  expect(pending.isCorrect).toBe(null);

  const marked = await (
    await request.post("/api/practice/answers", { data: { answerId: pending.id, isCorrect: true } })
  ).json();
  expect(marked.answer.isCorrect).toBe(true);
  expect(marked.answer.reviewedAt).toBeTruthy();
});
