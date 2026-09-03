import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTeacher } from "@/lib/teacher";
import { createCompetitionSession } from "@/lib/session";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const teacher = await getTeacher();
  if (!teacher) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const quiz = await prisma.quiz.findFirst({
    where: { id, authorId: teacher.id },
    include: { questions: { select: { kind: true } } },
  });
  if (!quiz) return NextResponse.json({ error: "not-found" }, { status: 404 });
  if (quiz.questions.length === 0) {
    return NextResponse.json({ error: "quiz-has-no-questions" }, { status: 400 });
  }
  // INPUT Questions are Practice-only: free-text answers cannot be scored in
  // a live Competition, so launching one must fail loudly, not silently skip.
  if (quiz.questions.some((question) => question.kind === "INPUT")) {
    return NextResponse.json({ error: "input-questions-not-allowed-in-competition" }, { status: 400 });
  }

  const session = await createCompetitionSession(quiz.id, teacher.id);
  return NextResponse.json({ session: { id: session.id, joinCode: session.joinCode } }, { status: 201 });
}
