import { prisma } from "@/lib/prisma";
import type { Session, SessionParticipant } from "@prisma/client";

export type Phase = "LOBBY" | "QUESTION" | "ANSWER_REVIEW" | "LEADERBOARD" | "CLOSED";

export async function createCompetitionSession(quizId: string, hostId: string): Promise<Session> {
  const teacher = await prisma.teacher.findUnique({ where: { id: hostId } });
  if (!teacher) throw new Error("host teacher not found");
  for (let attempt = 0; attempt < 8; attempt++) {
    const joinCode = String(Math.floor(Math.random() * 9e6) + 1e6);
    const existing = await prisma.session.findFirst({ where: { joinCode, phase: { not: "CLOSED" } } });
    if (existing) continue;
    return prisma.session.create({
      data: { joinCode, quizId, hostId, phase: "LOBBY" },
    });
  }
  throw new Error("could not allocate a unique join code");
}

export async function joinByCode(
  joinCode: string,
  baseNickname: string,
  studentId?: string | null
): Promise<{ session: Session; participant: SessionParticipant } | null> {
  const session = await prisma.session.findFirst({
    where: { joinCode, phase: { not: "CLOSED" } },
  });
  if (!session) return null;

  const clean = (baseNickname || "").trim().slice(0, 24) || "طالب";
  const taken = await prisma.sessionParticipant.findMany({
    where: { sessionId: session.id },
    select: { nickname: true },
  });
  const names = new Set(taken.map((p) => p.nickname));
  let candidate = clean;
  let idx = 1;
  while (names.has(candidate)) {
    candidate = `${clean} (${idx})`;
    idx++;
  }

  const participant = await prisma.sessionParticipant.create({
    data: { sessionId: session.id, nickname: candidate, studentId: studentId ?? null },
  });
  return { session, participant };
}

export async function startQuestion(sessionId: string) {
  const now = new Date();
  return prisma.session.update({
    where: { id: sessionId },
    data: { phase: "QUESTION", questionStartedAt: now, phaseStartedAt: now },
  });
}

export async function reviewAnswers(sessionId: string) {
  return prisma.session.update({
    where: { id: sessionId },
    data: { phase: "ANSWER_REVIEW", phaseStartedAt: new Date() },
  });
}

export async function showLeaderboard(sessionId: string) {
  return prisma.session.update({
    where: { id: sessionId },
    data: { phase: "LEADERBOARD", phaseStartedAt: new Date() },
  });
}

export async function advanceQuestion(sessionId: string) {
  const s = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    include: { quiz: { include: { _count: { select: { questions: true } } } } },
  });
  if (s.phase === "ANSWER_REVIEW") {
    return showLeaderboard(sessionId);
  }
  const next = s.currentQuestionIndex + 1;
  if (next >= s.quiz._count.questions) {
    return closeSession(sessionId);
  }
  const now = new Date();
  return prisma.session.update({
    where: { id: sessionId },
    data: {
      currentQuestionIndex: next,
      phase: "QUESTION",
      questionStartedAt: now,
      phaseStartedAt: now,
    },
  });
}

export async function closeSession(sessionId: string) {
  return prisma.session.update({
    where: { id: sessionId },
    data: { phase: "CLOSED", closedAt: new Date(), phaseStartedAt: new Date() },
  });
}

export async function submitAnswer(
  sessionId: string,
  participantId: string,
  chosenOptionId: string | null,
  timeMs: number
): Promise<{ accepted: boolean; correct: boolean; points: number }> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      quiz: {
        include: {
          questions: { orderBy: { order: "asc" }, include: { options: true } },
        },
      },
    },
  });
  if (!session || session.phase !== "QUESTION" || !session.questionStartedAt) {
    return { accepted: false, correct: false, points: 0 };
  }

  const question = session.quiz.questions[session.currentQuestionIndex];
  if (!question) return { accepted: false, correct: false, points: 0 };

  // enforce the question time limit server-side (1.5s grace for latency/clock skew)
  const elapsedMs = Date.now() - session.questionStartedAt.getTime();
  if (elapsedMs > question.timeLimitSec * 1000 + 1500) {
    return { accepted: false, correct: false, points: 0 };
  }

  const already = await prisma.sessionAnswer.findFirst({
    where: { sessionId, participantId, questionId: question.id },
  });

  const correctOption = question.options.find((o) => o.isCorrect);
  const correct = correctOption?.id === chosenOptionId;

  const limitMs = question.timeLimitSec * 1000;
  const clampedMs = Math.min(Math.max(timeMs, 0), limitMs);
  const remaining = 1 - clampedMs / limitMs;
  const points = correct ? Math.round(500 + 500 * remaining) : 0;

  // a second pick within the question window overwrites the first answer:
  // last timeMs counts, score adjusts by the points delta
  if (already) {
    await prisma.$transaction([
      prisma.sessionAnswer.update({
        where: { id: already.id },
        data: { chosenOptionId, isCorrect: correct, points, timeMs: clampedMs },
      }),
      prisma.sessionParticipant.update({
        where: { id: participantId },
        data: { totalScore: { decrement: already.points - points } },
      }),
    ]);
    return { accepted: true, correct, points };
  }

  await prisma.$transaction([
    prisma.sessionAnswer.create({
      data: {
        sessionId,
        participantId,
        questionId: question.id,
        chosenOptionId,
        isCorrect: correct,
        points,
        timeMs: clampedMs,
      },
    }),
    prisma.sessionParticipant.update({
      where: { id: participantId },
      data: { totalScore: { increment: points } },
    }),
  ]);

  return { accepted: true, correct, points };
}

export async function distribution(sessionId: string, questionId: string) {
  const answers = await prisma.sessionAnswer.findMany({
    where: { sessionId, questionId },
    select: { chosenOptionId: true, isCorrect: true, participantId: true },
  });
  return {
    counts: answers.reduce<Record<string, number>>((acc, a) => {
      const key = a.chosenOptionId ?? "none";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
    total: answers.length,
    // participantIds who answered, so the host strip can light their bubbles
    // (ADR 0004: who answered is public live; what they picked waits for reveal)
    answered: [...new Set(answers.map((a) => a.participantId))],
  };
}

export async function participants(sessionId: string, order: "name" | "score") {
  return prisma.sessionParticipant.findMany({
    where: { sessionId },
    orderBy: order === "score" ? [{ totalScore: "desc" }, { nickname: "asc" }] : { nickname: "asc" },
    select: { id: true, nickname: true, totalScore: true },
  });
}
