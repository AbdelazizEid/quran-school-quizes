import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import {
  DEFAULT_QUESTION_COUNT,
  DEFAULT_SOURCE_POLICY,
  MAX_QUESTION_COUNT,
  draftQuestions,
  draftMessages,
  isSourcePolicy,
  validateQuizDraft,
} from "@/lib/ai-quiz-draft";
import { sourceMetadata } from "@/lib/draft-sources";
import { prisma } from "@/lib/prisma";
import { getTeacher } from "@/lib/teacher";
import { AiQuizProviderError, getAiQuizProvider } from "@/server/ai/provider";
import type { AiQuizProvider, AiQuizProviderRequest } from "@/server/ai/provider";
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

type GenerationMode = "initial" | "targeted";

async function ensureWithinUsage(
  teacherId: string,
): Promise<{ error: string; limit?: number; retryAfterSec?: number } | null> {
  const windowStart = new Date(Date.now() - GENERATION_WINDOW_MS);
  const usage = await prisma.aIUsageEvent.findMany({
    where: { teacherId, createdAt: { gte: windowStart } },
    select: { createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  if (usage.length >= generationsPerHour()) {
    return { error: "rate-limited", limit: generationsPerHour(), retryAfterSec: retryAfterSeconds(usage[0].createdAt) };
  }
  await prisma.aIUsageEvent.deleteMany({ where: { createdAt: { lt: windowStart } } });
  return null;
}

type ConversationWithSources = Prisma.AIQuizDraftConversationGetPayload<{ include: typeof sourcesInclude }>;

async function persistGeneration(
  id: string,
  current: ConversationWithSources,
  args: { instruction: string; response: Awaited<ReturnType<AiQuizProvider["generate"]>> },
) {
  const { instruction, response } = args;
  const now = new Date().toISOString();
  const nextMessages = [
    ...draftMessages(current.messages),
    { role: "teacher" as const, content: instruction, createdAt: now },
    {
      role: "assistant" as const,
      content:
        response.type === "draft"
          ? "أعددت مسودة أسئلة عربية للمراجعة."
          : response.message,
      createdAt: now,
    },
  ];

  if (response.type === "draft") {
    const validation = validateQuizDraft({
      title: response.title,
      description: response.description,
      questions: response.questions,
    });
    if (!validation.valid) throw new AiQuizProviderError("malformed-response");
    const updated = await prisma.aIQuizDraftConversation.update({
      where: { id },
      data: {
        instruction,
        title: response.title,
        description: response.description,
        questions: response.questions,
        messages: nextMessages,
      },
      include: sourcesInclude,
    });
    return { draft: { ...updated, sources: sourceMetadata(updated.sources) }, response };
  }

  if (response.type === "revision") {
    const currentQuestions = draftQuestions(current.questions);
    const nextQuestions = currentQuestions.map(
      (question, index) => response.changes.find((change) => change.questionIndex === index)?.question ?? question,
    );
    const validation = validateQuizDraft({
      title: current.title,
      description: current.description,
      questions: nextQuestions,
    });
    if (!validation.valid) throw new AiQuizProviderError("malformed-response");
    const updated = await prisma.aIQuizDraftConversation.update({
      where: { id },
      data: { instruction, questions: nextQuestions, messages: nextMessages },
      include: sourcesInclude,
    });
    return { draft: { ...updated, sources: sourceMetadata(updated.sources) }, response };
  }

  // clarification | unsupported | confirm_save — conversation only, draft untouched
  const updated = await prisma.aIQuizDraftConversation.update({
    where: { id },
    data: { instruction, messages: nextMessages },
    include: sourcesInclude,
  });
  return { draft: { ...updated, sources: sourceMetadata(updated.sources) }, response };
}

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

  let body: { instruction?: unknown; questionCount?: unknown; difficulty?: unknown; mode?: unknown; stream?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const instruction = typeof body.instruction === "string" ? body.instruction.trim() : current.instruction;
  if (!instruction) return NextResponse.json({ error: "instruction-required" }, { status: 400 });

  const currentQuestions = draftQuestions(current.questions);
  if (body.mode !== undefined && body.mode !== "initial" && body.mode !== "targeted") {
    return NextResponse.json({ error: "invalid-generation-mode" }, { status: 400 });
  }
  const mode =
    body.mode === "initial" || body.mode === "targeted"
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

  const provider = getAiQuizProvider();
  const providerRequest: AiQuizProviderRequest = {
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
  };
  const metered = provider.metered;

  if (body.stream === true) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: unknown) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };
        try {
          const limitError = await ensureWithinUsage(teacher.id);
          if (limitError) {
            send({ type: "error", ...limitError });
            return;
          }
          if (metered) {
            await prisma.aIUsageEvent.create({ data: { teacherId: teacher.id } });
          }
          let response;
          try {
            response = provider.generateStreaming
              ? await provider.generateStreaming(providerRequest, (text) => send({ type: "delta", text }))
              : await provider.generate(providerRequest);
          } catch (error) {
            if (error instanceof AiQuizProviderError) {
              send({ type: "error", error: `provider-${error.code}`, retryable: true });
            } else {
              send({ type: "error", error: "provider-failed", retryable: true });
            }
            return;
          }
          let payload;
          try {
            payload = await persistGeneration(id, current, { instruction, response });
          } catch (error) {
            const code = error instanceof AiQuizProviderError ? error.code : "failed";
            send({ type: "error", error: `provider-${code}`, retryable: true });
            return;
          }
          send({ type: "done", ...payload });
        } finally {
          releaseGenerationSlot(teacher.id);
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        // nginx buffers proxied responses by default; this opts this response
        // out so SSE deltas reach the browser as they are produced.
        "X-Accel-Buffering": "no",
      },
    });
  }

  try {
    const limitError = await ensureWithinUsage(teacher.id);
    if (limitError) {
      return NextResponse.json(limitError, { status: 429 });
    }
    if (metered) {
      await prisma.aIUsageEvent.create({ data: { teacherId: teacher.id } });
    }

    let response;
    try {
      response = await provider.generate(providerRequest);
    } catch (error) {
      if (error instanceof AiQuizProviderError) {
        return NextResponse.json({ error: `provider-${error.code}`, retryable: true }, { status: error.status });
      }
      return NextResponse.json({ error: "provider-failed", retryable: true }, { status: 502 });
    }

    const payload = await persistGeneration(id, current, { instruction, response });
    return NextResponse.json(payload);
  } finally {
    releaseGenerationSlot(teacher.id);
  }
}
