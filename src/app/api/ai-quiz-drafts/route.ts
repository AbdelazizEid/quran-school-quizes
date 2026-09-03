import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_SOURCE_POLICY } from "@/lib/ai-quiz-draft";
import { prisma } from "@/lib/prisma";
import { getTeacher } from "@/lib/teacher";

export async function GET() {
  const teacher = await getTeacher();
  if (!teacher) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const drafts = await prisma.aIQuizDraftConversation.findMany({
    where: { teacherId: teacher.id },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ drafts });
}

export async function POST(req: NextRequest) {
  const teacher = await getTeacher();
  if (!teacher) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { instruction?: unknown } = {};
  try {
    body = (await req.json()) as { instruction?: unknown };
  } catch {
    // Starting an empty conversation is valid, so an empty body is accepted.
  }

  const draft = await prisma.aIQuizDraftConversation.create({
    data: {
      teacherId: teacher.id,
      instruction: typeof body.instruction === "string" ? body.instruction.trim() : "",
      sourcePolicy: DEFAULT_SOURCE_POLICY,
      title: "",
      description: "",
      questions: [],
      messages: [],
    },
  });
  return NextResponse.json({ draft: { ...draft, sources: [] } }, { status: 201 });
}
