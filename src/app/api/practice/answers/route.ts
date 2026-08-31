import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTeacher } from "@/lib/teacher";

export async function GET(req: NextRequest) {
  const teacher = await getTeacher();
  if (!teacher) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const quizId = new URL(req.url).searchParams.get("quizId");
  const answers = await prisma.practiceAnswer.findMany({
    where: quizId ? { question: { quizId } } : undefined,
    include: {
      question: { select: { id: true, text: true, kind: true, quizId: true, quiz: { select: { title: true } } } },
      student: { select: { id: true, name: true } },
    },
    orderBy: { reviewedAt: { sort: "asc", nulls: "first" } },
  });
  return NextResponse.json({ answers });
}

export async function POST(req: NextRequest) {
  const teacher = await getTeacher();
  if (!teacher) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as { answerId?: string; isCorrect?: boolean; notes?: string };
  if (!body.answerId) return NextResponse.json({ error: "answerId-required" }, { status: 400 });

  const answer = await prisma.practiceAnswer.update({
    where: { id: body.answerId },
    data: {
      isCorrect: body.isCorrect ?? null,
      notes: body.notes ?? null,
      reviewedAt: new Date(),
      scoreById: teacher.id,
    },
  });
  return NextResponse.json({ answer });
}
