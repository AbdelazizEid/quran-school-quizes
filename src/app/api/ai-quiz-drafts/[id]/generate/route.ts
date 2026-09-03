import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import {
  DEFAULT_QUESTION_COUNT,
  DEFAULT_SOURCE_POLICY,
  MAX_QUESTION_COUNT,
  applyDraftRevision,
  draftQuestions,
  draftMessages,
  isSourcePolicy,
  validateQuizDraft,
} from "@/lib/ai-quiz-draft";
import type { DraftRevision } from "@/lib/ai-quiz-draft";
import { sourceMetadata } from "@/lib/draft-sources";
import { prisma } from "@/lib/prisma";
import { getTeacher } from "@/lib/teacher";
import { AiQuizProviderError, getAiQuizProvider } from "@/server/ai/provider";
import {
  GENERATION_WINDOW_MS,
  acquireGenerationSlot,
  generationsPerHour,
  maxConcurrentGenerations,
  maxTotalSourceChars,
  releaseGenerationSlot,
  retryAfterSeconds,
  totalSourceChars,
} from "@/server/ai/limits";

type Params = { params: Promise<{ id: string }> };

const sourcesInclude = { sources: { orderBy: { createdAt: "asc" } } } as const;

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const teacher = await getTeacher();
  if (!teacher) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const current = await prisma.aIQuizDraftConversation.findFirst({
    where: { id, teacherId: teacher.id },
    include: sourcesInclude,
  });
  if (!current) return NextResponse.json({ error: "not-found" }, { status: 404 });
  const sourcePolicy = isSourcePolicy(current.sourcePolicy) ? current.sourcePolicy : DEFAULT_SOURCE_POLICY;
  const usableSources = current.sources.filter((source) => source.extractedText.trim().length > 0);
  if (sourcePolicy === "SOURCES_ONLY" && usableSources.length === 0) {
    return NextResponse.json({ error: "sources-required" }, { status: 400 });
  }

  let body: { instruction?: unknown; questionCount?: unknown; difficulty?: unknown; mode?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const instruction = typeof body.instruction === "string" ? body.instruction.trim() : current.instruction;
  if (!instruction) return NextResponse.json({ error: "instruction-required" }, { status: 400 });

  const currentQuestions = draftQuestions(current.questions);
  if (body.mode !== undefined && body.mode !== "initial" && body.mode !== "targeted" && body.mode !== "new-set") {
    return NextResponse.json({ error: "invalid-generation-mode" }, { status: 400 });
  }
  const mode =
    body.mode === "targeted" || body.mode === "new-set"
      ? body.mode
      : body.mode === "initial"
        ? body.mode
        : currentQuestions.length > 0
          ? "targeted"
          : "initial";
  if (mode === "targeted" && currentQuestions.length === 0) {
    return NextResponse.json({ error: "draft-required" }, { status: 400 });
  }

  const questionCount =
    mode === "targeted"
      ? currentQuestions.length
      : body.questionCount === undefined
        ? DEFAULT_QUESTION_COUNT
        : Number(body.questionCount);
  if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > MAX_QUESTION_COUNT) {
    return NextResponse.json({ error: "question-count-invalid", maxQuestionCount: MAX_QUESTION_COUNT }, { status: 400 });
  }
  const difficulty = body.difficulty === "easy" || body.difficulty === "hard" ? body.difficulty : "medium";

  const policySources =
    sourcePolicy === "GENERAL_KNOWLEDGE_ONLY"
      ? []
      : usableSources.map((source) => ({ name: source.name, kind: source.kind, text: source.extractedText }));
  const sourceCharsCap = maxTotalSourceChars();
  if (totalSourceChars(policySources) > sourceCharsCap) {
    return NextResponse.json({ error: "sources-text-too-large", maxTotalSourceChars: sourceCharsCap }, { status: 400 });
  }

  if (!acquireGenerationSlot(teacher.id, maxConcurrentGenerations())) {
    return NextResponse.json({ error: "generation-in-progress" }, { status: 429 });
  }

  try {
    const windowStart = new Date(Date.now() - GENERATION_WINDOW_MS);
    const usage = await prisma.aIUsageEvent.findMany({
      where: { teacherId: teacher.id, createdAt: { gte: windowStart } },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    if (usage.length >= generationsPerHour()) {
      return NextResponse.json(
        {
          error: "rate-limited",
          limit: generationsPerHour(),
          retryAfterSec: retryAfterSeconds(usage[0].createdAt),
        },
        { status: 429 },
      );
    }
    await prisma.aIUsageEvent.deleteMany({ where: { createdAt: { lt: windowStart } } });

    const provider = getAiQuizProvider();
    if (provider.metered) {
      await prisma.aIUsageEvent.create({ data: { teacherId: teacher.id } });
    }

    let response;
    try {
      response = await provider.generate({
        instruction,
        sourcePolicy,
        sources: policySources,
        questionCount,
        difficulty,
        allowedKinds: mode === "targeted" ? ["MCQ", "TRUE_FALSE", "INPUT"] : ["MCQ", "TRUE_FALSE"],
        mode,
        currentDraft:
          mode === "targeted"
            ? { title: current.title, description: current.description, questions: currentQuestions }
            : undefined,
      });
    } catch (error) {
      if (error instanceof AiQuizProviderError) {
        return NextResponse.json({ error: `provider-${error.code}`, retryable: true }, { status: error.status });
      }
      return NextResponse.json({ error: "provider-failed", retryable: true }, { status: 502 });
    }

    const now = new Date().toISOString();
    const messages = draftMessages(current.messages);
    const nextMessages = [
      ...messages,
      { role: "teacher" as const, content: instruction, createdAt: now },
      {
        role: "assistant" as const,
        content:
          response.type === "draft"
            ? mode === "new-set"
              ? "اقترحت مجموعة أسئلة جديدة للمراجعة قبل تطبيقها."
              : "أعددت مسودة أسئلة عربية للمراجعة."
            : response.message,
        createdAt: now,
      },
    ];

    if (response.type !== "draft" && response.type !== "revision") {
      const updated = await prisma.aIQuizDraftConversation.update({
        where: { id },
        data: { instruction, messages: nextMessages, pendingRevision: Prisma.JsonNull },
        include: sourcesInclude,
      });
      return NextResponse.json({ draft: { ...updated, sources: sourceMetadata(updated.sources) }, response });
    }

    if (mode === "targeted") {
      if (response.type !== "revision") {
        return NextResponse.json({ error: "provider-malformed-response", retryable: true }, { status: 502 });
      }
      const revisionWithoutProposal: DraftRevision = {
        mode: "targeted",
        instruction,
        summary: response.message,
        baseQuestions: currentQuestions,
        proposedQuestions: currentQuestions,
        changes: response.changes,
        createdAt: now,
      };
      const proposedQuestions = applyDraftRevision(currentQuestions, revisionWithoutProposal).questions;
      const validation = validateQuizDraft({
        title: current.title,
        description: current.description,
        questions: proposedQuestions,
      });
      if (!validation.valid) return NextResponse.json({ error: "provider-malformed-response", retryable: true }, { status: 502 });

      const revision: DraftRevision = { ...revisionWithoutProposal, proposedQuestions };
      const updated = await prisma.aIQuizDraftConversation.update({
        where: { id },
        data: {
          instruction,
          messages: nextMessages,
          pendingRevision: revision as unknown as Prisma.InputJsonValue,
        },
        include: sourcesInclude,
      });
      return NextResponse.json({ draft: { ...updated, sources: sourceMetadata(updated.sources) }, response });
    }

    if (response.type !== "draft") {
      return NextResponse.json({ error: "provider-malformed-response", retryable: true }, { status: 502 });
    }

    const validation = validateQuizDraft({
      title: response.title,
      description: response.description,
      questions: response.questions,
    });
    if (!validation.valid) return NextResponse.json({ error: "provider-malformed-response", retryable: true }, { status: 502 });

    if (mode === "new-set") {
      const revision: DraftRevision = {
        mode: "new-set",
        instruction,
        summary: "اقترحت مجموعة أسئلة جديدة للمراجعة.",
        baseQuestions: currentQuestions,
        proposedQuestions: response.questions,
        changes: response.questions.map((question, questionIndex) => ({ questionIndex, question })),
        proposedTitle: response.title,
        proposedDescription: response.description,
        createdAt: now,
      };
      const updated = await prisma.aIQuizDraftConversation.update({
        where: { id },
        data: {
          instruction,
          messages: nextMessages,
          pendingRevision: revision as unknown as Prisma.InputJsonValue,
        },
        include: sourcesInclude,
      });
      return NextResponse.json({ draft: { ...updated, sources: sourceMetadata(updated.sources) }, response });
    }

    const updated = await prisma.aIQuizDraftConversation.update({
      where: { id },
      data: {
        instruction,
        title: response.title,
        description: response.description,
        questions: response.questions,
        messages: nextMessages,
        pendingRevision: Prisma.JsonNull,
      },
      include: sourcesInclude,
    });
    return NextResponse.json({ draft: { ...updated, sources: sourceMetadata(updated.sources) }, response });
  } finally {
    releaseGenerationSlot(teacher.id);
  }
}
