import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { isSourcePolicy } from "@/lib/ai-quiz-draft";
import { sourceMetadata } from "@/lib/draft-sources";
import { prisma } from "@/lib/prisma";
import { getTeacher } from "@/lib/teacher";

type Params = { params: Promise<{ id: string }> };

async function ownedDraft(id: string) {
  const teacher = await getTeacher();
  if (!teacher) return null;
  const draft = await prisma.aIQuizDraftConversation.findFirst({
    where: { id, teacherId: teacher.id },
    include: { sources: { orderBy: { createdAt: "asc" } } },
  });
  return draft ? { teacher, draft } : null;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const owned = await ownedDraft(id);
  if (!owned) return NextResponse.json({ error: "not-found" }, { status: 404 });
  const { sources, ...draft } = owned.draft;
  return NextResponse.json({ draft: { ...draft, sources: sourceMetadata(sources) } });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const owned = await ownedDraft(id);
  if (!owned) return NextResponse.json({ error: "not-found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const data: Prisma.AIQuizDraftConversationUpdateInput = {};
  if (body.instruction !== undefined) {
    if (typeof body.instruction !== "string") return NextResponse.json({ error: "invalid-instruction" }, { status: 400 });
    data.instruction = body.instruction.trim();
  }
  for (const field of ["title", "description"] as const) {
    if (body[field] !== undefined) {
      if (typeof body[field] !== "string") return NextResponse.json({ error: `invalid-${field}` }, { status: 400 });
      data[field] = body[field].trim();
    }
  }
  if (body.sourcePolicy !== undefined) {
    if (!isSourcePolicy(body.sourcePolicy)) {
      return NextResponse.json({ error: "unsupported-source-policy" }, { status: 400 });
    }
    data.sourcePolicy = body.sourcePolicy;
  }
  if (body.questions !== undefined) {
    if (!Array.isArray(body.questions)) return NextResponse.json({ error: "invalid-questions" }, { status: 400 });
    data.questions = body.questions as Prisma.InputJsonValue;
  }

  const updated = await prisma.aIQuizDraftConversation.update({
    where: { id },
    data,
    include: { sources: { orderBy: { createdAt: "asc" } } },
  });
  const { sources, ...draft } = updated;
  return NextResponse.json({ draft: { ...draft, sources: sourceMetadata(sources) } });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const owned = await ownedDraft(id);
  if (!owned) return NextResponse.json({ error: "not-found" }, { status: 404 });
  await prisma.aIQuizDraftConversation.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
