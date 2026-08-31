import { expect, test } from "@playwright/test";
import { io, type Socket } from "socket.io-client";

const BASE = "http://127.0.0.1:3000";

type Opt = { id: string; text: string; isCorrect?: boolean };
type State = {
  phase: string;
  question: { text: string; options: Opt[] } | null;
  answers?: { counts: Record<string, number>; total: number };
  roster?: { id: string; nickname: string }[];
  leaderboard?: { nickname: string; totalScore: number }[];
};

function connect(query: Record<string, string>) {
  return io(`${BASE}/session`, { path: "/socket", transports: ["websocket"], query });
}

function waitPhase(sock: Socket, phase: string, timeoutMs = 10000): Promise<State> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      sock.off("state", handler);
      reject(new Error(`timeout waiting for phase ${phase}`));
    }, timeoutMs);
    function handler(s: State) {
      if (s?.phase === phase) {
        clearTimeout(timer);
        sock.off("state", handler);
        resolve(s);
      }
    }
    sock.on("state", handler);
  });
}

const emitAck = <T>(sock: Socket, event: string, payload: unknown) =>
  new Promise<T>((resolve) => sock.emit(event, payload, resolve as never));

test("live competition: nickname dedupe, hidden answer, stable shuffle, streak bonus, persistence", async ({
  request,
}) => {
  const quiz = (
    await (
      await request.post("/api/quizzes", {
        data: {
          title: `e2e-${Date.now()}`,
          questions: [
            {
              kind: "MCQ",
              text: "كم عدد سور القرآن؟",
              options: [
                { text: "114", isCorrect: true },
                { text: "113", isCorrect: false },
                { text: "115", isCorrect: false },
              ],
            },
            { kind: "TRUE_FALSE", text: "سورة الفاتحة مكية", options: [{ text: "صح", isCorrect: true }] },
          ],
        },
      })
    ).json()
  ).quiz;

  const { session } = await (await request.post(`/api/quizzes/${quiz.id}/session`)).json();
  const detail = await (await request.get(`/api/quizzes/${quiz.id}`)).json();
  const correctIds: (string | undefined)[] = detail.quiz.questions.map(
    (q: { options: { id: string; isCorrect: boolean }[] }) => q.options.find((o) => o.isCorrect)?.id
  );

  const host = connect({ role: "host", sessionId: session.id });
  const s1 = connect({ role: "student" });
  const s2 = connect({ role: "student" });
  try {
    const join1 = await emitAck<{ ok: boolean; nickname: string }>(s1, "join", {
      code: session.joinCode,
      nickname: "أحمد",
    });
    expect(join1.nickname).toBe("أحمد");
    const join2 = await emitAck<{ ok: boolean; nickname: string }>(s2, "join", {
      code: session.joinCode,
      nickname: "أحمد",
    });
    expect(join2.nickname).toBe("أحمد (1)");

    host.emit("start");
    const q1 = await waitPhase(s1, "QUESTION");
    expect(q1.question?.text).toContain("كم عدد");
    expect(q1.question!.options.every((o) => !("isCorrect" in o))).toBe(true);
    const s2q1 = await waitPhase(s2, "QUESTION");
    expect(q1.question!.options.map((o) => o.id)).toEqual(s2q1.question!.options.map((o) => o.id));

    const r1 = await emitAck<{ points: number; streak: number; bonus: number }>(s1, "answer", {
      optionId: correctIds[0],
      timeMs: 1500,
    });
    expect(r1.points).toBeGreaterThan(0);
    expect(r1.streak).toBe(1);
    expect(r1.bonus).toBe(0);

    const firstOpt = s2q1.question!.options[0];
    await emitAck(s2, "answer", { optionId: firstOpt.id, timeMs: 8000 });

    const dup = await emitAck<{ accepted: boolean }>(s1, "answer", { optionId: firstOpt.id, timeMs: 3000 });
    expect(dup.accepted).toBe(false);

    host.emit("reveal");
    const rev = await waitPhase(s1, "ANSWER_REVIEW");
    expect(rev.question!.options.some((o) => o.isCorrect)).toBe(true);
    expect(rev.answers?.total).toBeGreaterThanOrEqual(2);

    host.emit("next");
    const sb = await waitPhase(s1, "LEADERBOARD");
    expect(sb.leaderboard ?? []).toHaveLength(2);

    host.emit("next");
    const q2 = await waitPhase(s2, "QUESTION");
    expect(q2.question?.text).toContain("الفاتحة");
    const sahih = q2.question!.options.find((o) => o.text === "صح")!;

    const r3 = await emitAck<{ correct: boolean }>(s2, "answer", { optionId: sahih.id, timeMs: 2000 });
    expect(r3.correct).toBe(true);
    const r1b = await emitAck<{ correct: boolean; streak: number; bonus: number }>(s1, "answer", {
      optionId: sahih.id,
      timeMs: 2500,
    });
    expect(r1b.correct).toBe(true);
    expect(r1b.streak).toBe(2);
    expect(r1b.bonus).toBe(100);

    host.emit("reveal");
    await waitPhase(s1, "ANSWER_REVIEW");
    host.emit("next");
    await waitPhase(s1, "LEADERBOARD");
    host.emit("next");
    const closed = await waitPhase(s1, "CLOSED");
    expect((closed.leaderboard ?? []).some((p) => p.totalScore > 0)).toBe(true);
  } finally {
    host.close();
    s1.close();
    s2.close();
  }

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const dbSession = await prisma.session.findUnique({
    where: { id: session.id },
    include: { participants: true, answers: true },
  });
  await prisma.$disconnect();
  expect(dbSession?.answers).toHaveLength(4);
  expect(dbSession?.participants.every((p) => p.totalScore >= 0)).toBe(true);
  expect(dbSession?.participants.find((p) => p.nickname === "أحمد")?.streak).toBe(2);

  const results = await (await request.get("/api/sessions")).json();
  expect(results.sessions.find((s: { id: string }) => s.id === session.id)?.participantCount).toBe(2);
});
