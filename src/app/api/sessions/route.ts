import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTeacher } from "@/lib/teacher";

export async function GET() {
  const teacher = await getTeacher();
  if (!teacher) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sessions = await prisma.session.findMany({
    where: { hostId: teacher.id },
    include: {
      quiz: { select: { title: true } },
      _count: { select: { participants: true, answers: true } },
      participants: { orderBy: { totalScore: "desc" }, take: 1, select: { nickname: true, totalScore: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({
    sessions: sessions.map((s) => ({
      id: s.id,
      joinCode: s.joinCode,
      quizTitle: s.quiz.title,
      phase: s.phase,
      createdAt: s.createdAt,
      closedAt: s.closedAt,
      participantCount: s._count.participants,
      top: s.participants[0] ?? null,
    })),
  });
}
