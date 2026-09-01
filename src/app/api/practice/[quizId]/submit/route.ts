import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStudent } from "@/lib/student";

export async function POST(req: NextRequest, { params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;
  const student = await getStudent();
  if (!student) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const studentId = student.id;

  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: { questions: { include: { options: true }, orderBy: { order: "asc" } } },
  });
  if (!quiz) return NextResponse.json({ error: "not-found" }, { status: 404 });

  const body = (await req.json()) as {
    answers?: { questionId: string; chosenOptionId?: string; textAnswer?: string }[];
  };

  const results: { questionId: string; isCorrect: boolean | null; stored: boolean }[] = [];
  for (const a of body.answers ?? []) {
    const question = quiz.questions.find((q) => q.id === a.questionId);
    if (!question) continue;
    let isCorrect: boolean | null = null;
    if (question.kind !== "INPUT") {
      const correct = question.options.find((o) => o.isCorrect);
      isCorrect = correct?.id === a.chosenOptionId;
    }
    await prisma.practiceAnswer.upsert({
      where: {
        studentId_questionId: { studentId, questionId: question.id },
      },
      update: { chosenOptionId: a.chosenOptionId ?? null, textAnswer: a.textAnswer ?? null, isCorrect },
      create: {
        studentId,
        questionId: question.id,
        chosenOptionId: a.chosenOptionId ?? null,
        textAnswer: a.textAnswer ?? null,
        isCorrect,
      },
    });
    results.push({ questionId: question.id, isCorrect, stored: true });
  }

  return NextResponse.json({ results });
}
