import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_SOURCE_POLICY,
  compactSourceEvidence,
  isSourcePolicy,
  validateQuizDraft,
} from "@/lib/ai-quiz-draft";
import type { DraftQuestion } from "@/lib/ai-quiz-draft";
import { prisma } from "@/lib/prisma";
import { getTeacher } from "@/lib/teacher";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const teacher = await getTeacher();
  if (!teacher) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const draft = await prisma.aIQuizDraftConversation.findFirst({ where: { id, teacherId: teacher.id } });
  if (!draft) return NextResponse.json({ error: "not-found" }, { status: 404 });
  if (draft.pendingRevision !== null) {
    return NextResponse.json({ error: "revision-pending" }, { status: 400 });
  }

  const validation = validateQuizDraft({
    title: draft.title,
    description: draft.description,
    questions: draft.questions,
  });
  if (!validation.valid) return NextResponse.json({ error: validation.error }, { status: 400 });

  const questions = draft.questions as DraftQuestion[];
  const policy = isSourcePolicy(draft.sourcePolicy) ? draft.sourcePolicy : DEFAULT_SOURCE_POLICY;
  const quiz = await prisma.$transaction(async (tx) => {
    const created = await tx.quiz.create({
      data: {
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        authorId: teacher.id,
        questions: {
          create: questions.map((question, index) => ({
            kind: question.kind,
            text: question.text.trim(),
            timeLimitSec: question.timeLimitSec,
            order: index,
            sourceEvidence: compactSourceEvidence(question.sourceEvidence, policy),
            options:
              question.kind === "INPUT"
                ? undefined
                : { create: question.options.map((option, optionIndex) => ({ ...option, order: optionIndex })) },
          })),
        },
      },
      include: { questions: { include: { options: true }, orderBy: { order: "asc" } } },
    });
    await tx.aIQuizDraftConversation.delete({ where: { id } });
    return created;
  });

  return NextResponse.json({ quiz }, { status: 201 });
}
