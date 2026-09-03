import { NextRequest, NextResponse } from "next/server";
import { normalizeManualQuestions, validateQuizDraft } from "@/lib/ai-quiz-draft";
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

  // The AI save-boundary validator governs manual creation too: normalized
  // input must satisfy the same semantic rules before anything is stored.
  const questions = normalizeManualQuestions(body.questions);
  const validation = validateQuizDraft({ title: body.title, description: body.description ?? "", questions });
  if (!validation.valid) return NextResponse.json({ error: validation.error }, { status: 400 });

  const quiz = await prisma.quiz.create({
    data: {
      title: body.title.trim(),
      description: body.description?.trim() || null,
      authorId: teacher.id,
      questions: {
        create: questions.map((q, i) => ({
          kind: q.kind,
          text: q.text,
          timeLimitSec: q.timeLimitSec,
          order: i,
          options: q.kind === "INPUT" ? undefined : { create: q.options.map((o, oi) => ({ ...o, order: oi })) },
        })),
      },
    },
    include: { questions: { include: { options: true }, orderBy: { order: "asc" } } },
  });
  return NextResponse.json({ quiz }, { status: 201 });
}
