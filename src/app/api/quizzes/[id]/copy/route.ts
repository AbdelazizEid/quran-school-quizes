import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTeacher } from "@/lib/teacher";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const teacher = await getTeacher();
  if (!teacher) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const source = await prisma.quiz.findFirst({
    where: { id: params.id },
    include: { questions: { include: { options: true }, orderBy: { order: "asc" } } },
  });
  if (!source) return NextResponse.json({ error: "not-found" }, { status: 404 });

  const copy = await prisma.quiz.create({
    data: {
      title: `${source.title} (نسخة)`,
      description: source.description,
      authorId: teacher.id,
      questions: {
        create: source.questions.map((q) => ({
          kind: q.kind,
          text: q.text,
          timeLimitSec: q.timeLimitSec,
          order: q.order,
          options:
            q.kind === "INPUT"
              ? undefined
              : { create: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect, order: o.order })) },
        })),
      },
    },
    include: { _count: { select: { questions: true } } },
  });

  return NextResponse.json({ quiz: copy }, { status: 201 });
}
