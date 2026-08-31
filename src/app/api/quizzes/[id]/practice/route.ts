import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const quiz = await prisma.quiz.findUnique({
    where: { id: params.id },
    include: { questions: { orderBy: { order: "asc" }, include: { options: true } } },
  });
  if (!quiz) return NextResponse.json({ error: "not-found" }, { status: 404 });

  return NextResponse.json({
    quiz: {
      id: quiz.id,
      title: quiz.title,
      questions: quiz.questions.map((q) => ({
        id: q.id,
        kind: q.kind,
        text: q.text,
        timeLimitSec: q.timeLimitSec,
        options: q.options.map((o) => ({ id: o.id, text: o.text })),
      })),
    },
  });
}
