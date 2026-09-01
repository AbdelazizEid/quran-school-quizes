import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTeacher } from "@/lib/teacher";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const teacher = await getTeacher();
  if (!teacher) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const session = await prisma.session.findFirst({
    where: { id, hostId: teacher.id },
    include: {
      quiz: { include: { questions: { orderBy: { order: "asc" }, include: { options: true } } } },
      participants: { orderBy: { totalScore: "desc" } },
      answers: true,
    },
  });
  if (!session) return NextResponse.json({ error: "not-found" }, { status: 404 });

  const optionById = new Map<string, string>();
  for (const q of session.quiz.questions) {
    for (const o of q.options) optionById.set(o.id, o.text);
  }

  return NextResponse.json({
    session: {
      id: session.id,
      joinCode: session.joinCode,
      quizTitle: session.quiz.title,
      phase: session.phase,
      createdAt: session.createdAt,
      closedAt: session.closedAt,
      leaderboard: session.participants.map((p) => ({
        id: p.id,
        nickname: p.nickname,
        totalScore: p.totalScore,
        streak: p.streak,
      })),
      questions: session.quiz.questions.map((q) => {
        const qAnswers = session.answers.filter((a) => a.questionId === q.id);
        return {
          id: q.id,
          text: q.text,
          kind: q.kind,
          timeLimitSec: q.timeLimitSec,
          options: q.options.map((o) => ({
            id: o.id,
            text: o.text,
            isCorrect: o.isCorrect,
            count: qAnswers.filter((a) => a.chosenOptionId === o.id).length,
          })),
          perParticipant: session.participants.map((p) => {
            const a = qAnswers.find((x) => x.participantId === p.id);
            return {
              nickname: p.nickname,
              chosen: a?.chosenOptionId ? optionById.get(a.chosenOptionId) ?? "—" : "—",
              isCorrect: a?.isCorrect ?? null,
              points: a?.points ?? 0,
              timeMs: a?.timeMs ?? null,
            };
          }),
        };
      }),
    },
  });
}
