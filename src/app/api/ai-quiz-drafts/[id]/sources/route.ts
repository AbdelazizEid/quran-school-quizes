import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTeacher } from "@/lib/teacher";
import {
  MAX_EXTRACTED_CHARS,
  MAX_SOURCE_FILE_BYTES,
  SourceExtractionError,
  extractPastedText,
  extractUploadedFile,
} from "@/server/ai/extract";

type Params = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const teacher = await getTeacher();
  if (!teacher) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const draft = await prisma.aIQuizDraftConversation.findFirst({ where: { id, teacherId: teacher.id } });
  if (!draft) return NextResponse.json({ error: "not-found" }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid-form" }, { status: 400 });
  }

  try {
    const file = form.get("file");
    if (file instanceof File) {
      const { kind, name, text } = await extractUploadedFile(file);
      const source = await prisma.aIQuizDraftSource.create({
        data: { conversationId: id, kind, name, extractedText: text },
      });
      return NextResponse.json(
        { source: { id: source.id, kind, name, charCount: text.length, createdAt: source.createdAt } },
        { status: 201 },
      );
    }

    const pasted = form.get("text");
    const providedName = form.get("name");
    const text = extractPastedText(pasted);
    const name =
      typeof providedName === "string" && providedName.trim() ? providedName.trim().slice(0, 120) : "نص ملصق";
    const source = await prisma.aIQuizDraftSource.create({
      data: { conversationId: id, kind: "pasted", name, extractedText: text },
    });
    return NextResponse.json(
      { source: { id: source.id, kind: "pasted", name, charCount: text.length, createdAt: source.createdAt } },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof SourceExtractionError) {
      return NextResponse.json(
        { error: error.code, maxFileBytes: MAX_SOURCE_FILE_BYTES, maxExtractedChars: MAX_EXTRACTED_CHARS },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "extraction-failed" }, { status: 400 });
  }
}
