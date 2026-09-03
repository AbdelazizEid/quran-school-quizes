import { NextRequest, NextResponse } from "next/server";
import { compactSourceEvidence, normalizeManualQuestions, validateQuizDraft } from "@/lib/ai-quiz-draft";
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
      sourceEvidence?: unknown;
    }[];
  };

  // Manual edits pass the same semantic validator as the AI save boundary
  // whenever Question data is being replaced.
  let normalizedQuestions: ReturnType<typeof normalizeManualQuestions> | null = null;
  if (body.questions !== undefined) {
    normalizedQuestions = normalizeManualQuestions(body.questions);
    const effectiveTitle = body.title !== undefined ? body.title.trim() : owned.quiz.title;
    const validation = validateQuizDraft({
      title: effectiveTitle,
      description: body.description ?? owned.quiz.description ?? "",
      questions: normalizedQuestions,
    });
    if (!validation.valid) return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const quiz = await prisma.$transaction(async (tx) => {
    await tx.quiz.update({
      where: { id },
      data: {
        title: body.title?.trim() ?? undefined,
        description: body.description?.trim() ?? undefined,
      },
    });
    if (normalizedQuestions) {
      await tx.question.deleteMany({ where: { quizId: id } });
      for (let i = 0; i < normalizedQuestions.length; i++) {
        const q = normalizedQuestions[i];
        await tx.question.create({
          data: {
            quizId: id,
            kind: q.kind,
            text: q.text,
            timeLimitSec: q.timeLimitSec,
            order: i,
            sourceEvidence:
              body.questions?.[i]?.sourceEvidence == null ? undefined : compactSourceEvidence(body.questions[i].sourceEvidence),
            options:
              q.kind === "INPUT"
                ? undefined
                : { create: q.options.map((o, oi) => ({ text: o.text, isCorrect: o.isCorrect, order: oi })) },
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
