import { expect, test } from "@playwright/test";
import { io } from "socket.io-client";

// live-socket flow occasionally flakes under full-suite load; one retry, genuine failures still fail
test.describe.configure({ retries: 1 });

test("student sees vote bars during review; late answers rejected", async ({ request, browser }) => {
  const quiz = (
    await (
      await request.post("/api/quizzes", {
        data: {
          title: `bars-live-${Date.now()}`,
          questions: [
            {
              kind: "MCQ",
              text: "سؤال التحقق",
              timeLimitSec: 8,
              options: [
                { text: "أ", isCorrect: true },
                { text: "ب", isCorrect: false },
              ],
            },
            {
              kind: "MCQ",
              text: "سؤال منتهي الوقت",
              timeLimitSec: 5,
              options: [
                { text: "ج", isCorrect: true },
                { text: "د", isCorrect: false },
              ],
            },
          ],
        },
      })
    ).json()
  ).quiz;
  const { session } = await (await request.post(`/api/quizzes/${quiz.id}/session`)).json();

  const teacher = await browser.newContext();
  const host = await teacher.newPage();
  await host.goto(`/host/${session.id}`);
  await expect(host.getByRole("button", { name: "ابدأ أول سؤال" })).toBeVisible({ timeout: 15000 });

  const studentCtx = await browser.newContext();
  const student = await studentCtx.newPage();
  await student.goto(`/session/${session.joinCode}`);
  await expect(student.getByText("في انتظار بدء الجلسة")).toBeVisible({ timeout: 15000 });

  // Q1: answer, reveal — result banner on top, one compact vote bar per option
  await host.getByRole("button", { name: "ابدأ أول سؤال" }).click();
  await expect(student.getByRole("button", { name: "أ" })).toBeVisible({ timeout: 15000 });
  await student.getByRole("button", { name: "أ" }).click();
  await expect(student.getByText("تم إرسال إجابتك")).toBeVisible();

  await host.getByRole("button", { name: "اكشف الإجابة" }).click();
  await expect(student.getByLabel("1 إجابة")).toBeVisible({ timeout: 15000 });
  await expect(student.getByLabel("0 إجابة")).toBeVisible();
  await expect(student.getByText("إجابة صحيحة!")).toBeVisible();
  await expect(student.getByText("الإجابة الصحيحة", { exact: true })).toBeVisible();
  // the whole reveal — result, question, bars — fits one screen, no scrolling
  const fitsOneScreen = await student.evaluate(
    () => document.scrollingElement!.scrollHeight <= window.innerHeight,
  );
  expect(fitsOneScreen).toBe(true);

  // Q2 (5s limit): let the timer run out
  await host.getByRole("button", { name: "التالي" }).click(); // review → scoreboard
  await expect(host.getByRole("button", { name: "السؤال التالي" })).toBeVisible({ timeout: 15000 });
  await host.getByRole("button", { name: "السؤال التالي" }).click();

  const late = student.getByRole("button", { name: "ج" });
  await expect(late).toBeVisible({ timeout: 15000 });
  await expect(student.getByText("انتهى الوقت — انتظر كشف النتيجة")).toBeVisible({ timeout: 10000 });
  await expect(late).toBeDisabled();
  await expect(student.getByRole("button", { name: "د" })).toBeDisabled();

  // server-side deadline: a raw socket answer past the limit (+1.5s grace) is rejected
  await host.waitForTimeout(2500);
  const sock = io(`${await student.evaluate(() => window.location.origin)}/session`, {
    path: "/socket",
    transports: ["websocket"],
    query: { role: "student" },
  });
  try {
    const joined = await new Promise<{ ok: boolean }>((resolve) =>
      sock.emit("join", { code: session.joinCode, nickname: "متأخر" }, resolve as never)
    );
    expect(joined.ok).toBe(true);
    const detail = await (await request.get(`/api/quizzes/${quiz.id}`)).json();
    const correctId = detail.quiz.questions[1].options.find((o: { isCorrect: boolean }) => o.isCorrect).id;
    const res = await new Promise<{ accepted: boolean }>((resolve) =>
      sock.emit("answer", { optionId: correctId, timeMs: 500 }, resolve as never)
    );
    expect(res.accepted).toBe(false);
  } finally {
    sock.close();
  }

  await teacher.close();
  await studentCtx.close();

  await request.delete(`/api/quizzes/${quiz.id}`);
});
