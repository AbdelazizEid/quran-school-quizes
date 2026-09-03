import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTeacher } from "@/lib/teacher";

type Params = { params: Promise<{ id: string; sourceId: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id, sourceId } = await params;
  const teacher = await getTeacher();
  if (!teacher) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const draft = await prisma.aIQuizDraftConversation.findFirst({ where: { id, teacherId: teacher.id } });
  if (!draft) return NextResponse.json({ error: "not-found" }, { status: 404 });

  const source = await prisma.aIQuizDraftSource.findFirst({
    where: { id: sourceId, conversationId: id },
  });
  if (!source) return NextResponse.json({ error: "not-found" }, { status: 404 });

  await prisma.aIQuizDraftSource.delete({ where: { id: sourceId } });
  return NextResponse.json({ ok: true });
}
