import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTeacher } from "@/lib/teacher";

type Params = { params: Promise<{ id: string }> };

async function ownedQuiz(id: string) {
  const teacher = await getTeacher();
  if (!teacher) return null;
  const quiz = await prisma.quiz.findFirst({
    where: { id, authorId: teacher.id },
    include: { questions: { include: { options: true }, orderBy: { order: "asc" } } },
  });
  if (!quiz) return null;
  return { teacher, quiz };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const owned = await ownedQuiz(id);
  if (!owned) return NextResponse.json({ error: "not-found" }, { status: 404 });
  return NextResponse.json({ quiz: owned.quiz });
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const owned = await ownedQuiz(id);
  if (!owned) return NextResponse.json({ error: "not-found" }, { status: 404 });

  const body = (await req.json()) as {
    title?: string;
    description?: string;
    questions?: {
      id?: string;
      kind: "MCQ" | "TRUE_FALSE" | "INPUT";
      text: string;
      timeLimitSec?: number;
      options?: { text: string; isCorrect: boolean }[];
    }[];
  };

  const quiz = await prisma.$transaction(async (tx) => {
    await tx.quiz.update({
      where: { id },
      data: {
        title: body.title?.trim() ?? undefined,
        description: body.description?.trim() ?? undefined,
      },
    });
    if (body.questions) {
      await tx.question.deleteMany({ where: { quizId: id } });
      for (let i = 0; i < body.questions.length; i++) {
        const q = body.questions[i];
        await tx.question.create({
          data: {
            quizId: id,
            kind: q.kind,
            text: q.text,
            timeLimitSec: q.timeLimitSec ?? 20,
            order: i,
            options:
              q.kind === "INPUT"
                ? undefined
                : {
                    create:
                      q.kind === "TRUE_FALSE"
                        ? [
                            { text: "صح", isCorrect: q.options?.some((o) => o.isCorrect && o.text === "صح") ?? false, order: 0 },
                            { text: "خطأ", isCorrect: q.options?.some((o) => o.isCorrect && o.text === "خطأ") ?? false, order: 1 },
                          ]
                        : (q.options ?? []).slice(0, 4).map((o, oi) => ({ text: o.text, isCorrect: o.isCorrect, order: oi })),
                  },
          },
        });
      }
    }
    return tx.quiz.findUniqueOrThrow({
      where: { id },
      include: { questions: { include: { options: true }, orderBy: { order: "asc" } } },
    });
  });

  return NextResponse.json({ quiz });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const owned = await ownedQuiz(id);
  if (!owned) return NextResponse.json({ error: "not-found" }, { status: 404 });
  await prisma.$transaction([
    // sessions reference the quiz without cascade — drop them first
    // (participants and answers cascade from the session)
    prisma.session.deleteMany({ where: { quizId: id } }),
    prisma.quiz.delete({ where: { id } }),
  ]);
  return NextResponse.json({ ok: true });
}
