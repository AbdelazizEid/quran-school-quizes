import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import {
  applyDraftRevision,
  draftMessages,
  draftQuestions,
  draftRevision,
  validateQuizDraft,
} from "@/lib/ai-quiz-draft";
import { sourceMetadata } from "@/lib/draft-sources";
import { prisma } from "@/lib/prisma";
import { getTeacher } from "@/lib/teacher";

type Params = { params: Promise<{ id: string }> };
type RevisionAction = "apply" | "discard";

const sourcesInclude = { sources: { orderBy: { createdAt: "asc" } } } as const;

async function updateRevision(id: string, action: RevisionAction) {
  const teacher = await getTeacher();
  if (!teacher) return { response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };

  const draft = await prisma.aIQuizDraftConversation.findFirst({ where: { id, teacherId: teacher.id } });
  if (!draft) return { response: NextResponse.json({ error: "not-found" }, { status: 404 }) };

  const revision = draftRevision(draft.pendingRevision);
  if (!revision) return { response: NextResponse.json({ error: "revision-not-found" }, { status: 400 }) };

  const now = new Date().toISOString();
  const messages = draftMessages(draft.messages);
  if (action === "discard") {
    const updated = await prisma.aIQuizDraftConversation.update({
      where: { id },
      data: {
        messages: [
          ...messages,
          { role: "assistant" as const, content: "تم تجاهل المراجعة المقترحة.", createdAt: now },
        ],
        pendingRevision: Prisma.JsonNull,
      },
      include: sourcesInclude,
    });
    return {
      response: NextResponse.json({
        draft: { ...updated, sources: sourceMetadata(updated.sources) },
        revisionDiscarded: true,
      }),
    };
  }

  const result = applyDraftRevision(draftQuestions(draft.questions), revision);
  const validation = validateQuizDraft({ title: draft.title, description: draft.description, questions: result.questions });
  if (!validation.valid) return { response: NextResponse.json({ error: validation.error }, { status: 400 }) };

  const updated = await prisma.aIQuizDraftConversation.update({
    where: { id },
    data: {
      title: revision.mode === "new-set" ? revision.proposedTitle : undefined,
      description: revision.mode === "new-set" ? revision.proposedDescription : undefined,
      questions: result.questions as unknown as Prisma.InputJsonValue,
      messages: [
        ...messages,
        { role: "assistant" as const, content: "تم تطبيق المراجعة التي وافقت عليها.", createdAt: now },
      ],
      pendingRevision: Prisma.JsonNull,
    },
    include: sourcesInclude,
  });
  return {
    response: NextResponse.json({
      draft: { ...updated, sources: sourceMetadata(updated.sources) },
      revisionApplied: true,
      appliedQuestionIndexes: result.appliedQuestionIndexes,
      conflictedQuestionIndexes: result.conflictedQuestionIndexes,
    }),
  };
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  let action: RevisionAction = "apply";
  try {
    const body = (await req.json()) as { action?: unknown };
    if (body.action !== undefined) {
      if (body.action !== "apply" && body.action !== "discard") {
        return NextResponse.json({ error: "invalid-revision-action" }, { status: 400 });
      }
      action = body.action;
    }
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }
  return (await updateRevision(id, action)).response;
}
