import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTeacher } from "@/lib/teacher";

export async function GET() {
  const teacher = await getTeacher();
  if (!teacher) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const quizzes = await prisma.quiz.findMany({
    where: { authorId: teacher.id },
    include: { _count: { select: { questions: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ quizzes });
}

type QuestionInput = {
  kind: "MCQ" | "TRUE_FALSE" | "INPUT";
  text: string;
  timeLimitSec?: number;
  options?: { text: string; isCorrect: boolean }[];
};

export async function POST(req: NextRequest) {
  const teacher = await getTeacher();
  if (!teacher) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    title?: string;
    description?: string;
    questions?: QuestionInput[];
  };
  if (!body.title?.trim()) {
    return NextResponse.json({ error: "title-required" }, { status: 400 });
  }

  const quiz = await prisma.quiz.create({
    data: {
      title: body.title.trim(),
      description: body.description?.trim() || null,
      authorId: teacher.id,
      questions: {
        create: (body.questions ?? []).map((q, i) => ({
          kind: q.kind,
          text: q.text,
          timeLimitSec: q.timeLimitSec ?? 20,
          order: i,
          options: q.kind === "INPUT" ? undefined : { create: normalizeOptions(q) },
        })),
      },
    },
    include: { questions: { include: { options: true }, orderBy: { order: "asc" } } },
  });
  return NextResponse.json({ quiz }, { status: 201 });
}

function normalizeOptions(q: QuestionInput) {
  if (q.kind === "TRUE_FALSE") {
    return [
      { text: "صح", isCorrect: q.options?.some((o) => o.isCorrect && o.text === "صح") ?? false, order: 0 },
      { text: "خطأ", isCorrect: q.options?.some((o) => o.isCorrect && o.text === "خطأ") ?? false, order: 1 },
    ];
  }
  return (q.options ?? []).slice(0, 4).map((o, i) => ({ text: o.text, isCorrect: o.isCorrect, order: i }));
}
