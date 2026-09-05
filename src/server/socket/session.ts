import type { Namespace, Socket } from "socket.io";
import { prisma } from "@/lib/prisma";
import { seededShuffle } from "@/lib/shuffle";
import {
  joinByCode,
  startQuestion,
  reviewAnswers,
  showLeaderboard,
  advanceQuestion,
  closeSession,
  submitAnswer,
  participants,
  distribution,
} from "@/lib/session";
import { createPresence } from "./presence";

type SessionNS = Namespace;

const presence = createPresence();

export async function emitState(io: SessionNS, sessionId: string) {
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    include: {
      quiz: { include: { questions: { orderBy: { order: "asc" }, include: { options: true } } } },
    },
  });

  const base = {
    phase: session.phase,
    phaseStartedAt: session.phaseStartedAt.getTime(),
    questionIndex: session.currentQuestionIndex,
    questionCount: session.quiz.questions.length,
    quizTitle: session.quiz.title,
    joinCode: session.joinCode,
  };

  const q = session.quiz.questions[session.currentQuestionIndex];
  let question: object | null = null;
  let answers: { counts: Record<string, number>; total: number } | undefined;
  if (q && (session.phase === "QUESTION" || session.phase === "ANSWER_REVIEW")) {
    const options = seededShuffle(q.options, `${session.id}:${q.id}`).map((o) => ({
      id: o.id,
      text: o.text,
      ...(session.phase === "ANSWER_REVIEW" ? { isCorrect: o.isCorrect } : {}),
    }));
    question = {
      id: q.id,
      kind: q.kind,
      text: q.text,
      timeLimitSec: q.timeLimitSec,
      options,
    };
    answers = await distribution(sessionId, q.id);
  }

  const lb =
    session.phase === "LEADERBOARD" || session.phase === "CLOSED"
      ? await participants(sessionId, "score")
      : undefined;
  const names = await participants(sessionId, "name");

  // per-student outcome of the question under review, so pages that
  // (re)connect after answering can still render their result card
  let results: Record<string, { correct: boolean; points: number; bonus: number; streak: number }> | undefined;
  if (session.phase === "ANSWER_REVIEW" && q) {
    const [rows, parts] = await Promise.all([
      prisma.sessionAnswer.findMany({
        where: { sessionId, questionId: q.id },
        select: { participantId: true, isCorrect: true, points: true },
      }),
      prisma.sessionParticipant.findMany({
        where: { sessionId },
        select: { id: true, streak: true },
      }),
    ]);
    const streaks = new Map(parts.map((p) => [p.id, p.streak]));
    results = {};
    for (const r of rows) {
      const streak = r.isCorrect ? streaks.get(r.participantId) ?? 0 : 0;
      results[r.participantId] = {
        correct: r.isCorrect,
        points: r.points,
        bonus: r.isCorrect ? Math.min(100 * Math.max(0, streak - 1), 500) : 0,
        streak,
      };
    }
  }

  io.to(`session:${sessionId}`).emit("state", {
    ...base,
    question,
    answers,
    results,
    roster: session.phase === "LOBBY" ? names : undefined,
    leaderboard: lb,
  });
  io.to(`host:${sessionId}`).emit("state", {
    ...base,
    question,
    answers,
    // host renders the bubble strip: every participant plus the outcome of
    // the question under review (ADR 0004: identities open at reveal)
    results,
    roster: names,
    leaderboard: lb,
    online: presence.online(sessionId),
  });
}

export function registerSessionHandlers(io: SessionNS, sock: Socket) {
  const { role, sessionId } = sock.handshake.query as Record<string, string | undefined>;

  if (role === "host" && sessionId) {
    sock.join(`host:${sessionId}`);
    sock.join(`session:${sessionId}`);

    sock.on("start", async () => {
      await startQuestion(sessionId);
      await emitState(io, sessionId);
    });
    sock.on("reveal", async () => {
      await reviewAnswers(sessionId);
      await emitState(io, sessionId);
    });
    sock.on("leaderboard", async () => {
      await showLeaderboard(sessionId);
      await emitState(io, sessionId);
    });
    sock.on("next", async () => {
      await advanceQuestion(sessionId);
      await emitState(io, sessionId);
    });
    sock.on("end", async () => {
      await closeSession(sessionId);
      await emitState(io, sessionId);
    });
    setImmediate(() => {
      emitState(io, sessionId).catch(() => undefined);
    });
    return;
  }

  if (role === "student") {
    sock.on("join", async (payload: { code?: string; nickname?: string; participantId?: string }, ack?: (r: unknown) => void) => {
      let resolvedId = payload?.participantId ?? null;

      if (!resolvedId && payload?.code && payload?.nickname) {
        const joined = await joinByCode(payload.code, payload.nickname);
        if (!joined) {
          ack?.({ ok: false, error: "session-not-found" });
          return;
        }
        resolvedId = joined.participant.id;
      }

      if (!resolvedId) {
        ack?.({ ok: false, error: "missing-join-info" });
        return;
      }

      sock.data.participantId = resolvedId;

      const participant = await prisma.sessionParticipant.findUniqueOrThrow({
        where: { id: resolvedId },
      });
      sock.data.sessionId = participant.sessionId;
      sock.join(`session:${participant.sessionId}`);
      presence.arrive(participant.sessionId, resolvedId);
      io.to(`host:${participant.sessionId}`).emit("presence", presence.online(participant.sessionId));
      ack?.({ ok: true, participantId: resolvedId, nickname: participant.nickname });
      setImmediate(() => {
        emitState(io, participant.sessionId).catch(() => undefined);
      });
    });

    sock.on("disconnect", () => {
      const pid = sock.data.participantId as string | undefined;
      const sid = sock.data.sessionId as string | undefined;
      if (!pid || !sid) return;
      if (presence.leave(sid, pid)) {
        io.to(`host:${sid}`).emit("presence", presence.online(sid));
      }
    });

    sock.on("answer", async (payload: { optionId: string | null; timeMs?: number }, ack?: (r: unknown) => void) => {
      const pid = sock.data.participantId as string | undefined;
      if (!pid || !payload) {
        ack?.({ ok: false, error: "not-joined" });
        return;
      }
      const participant = await prisma.sessionParticipant.findUnique({ where: { id: pid } });
      if (!participant) {
        ack?.({ ok: false, error: "not-joined" });
        return;
      }
      const result = await submitAnswer(
        participant.sessionId,
        pid,
        payload.optionId ?? null,
        payload.timeMs ?? 0
      );
      ack?.({ ok: true, ...result });
      const session = await prisma.session.findUnique({
        where: { id: participant.sessionId },
        include: {
          quiz: {
            include: { questions: { orderBy: { order: "asc" }, select: { id: true } } },
          },
        },
      });
      const current = session?.quiz.questions[session.currentQuestionIndex];
      if (session && current) {
        io.to(`host:${session.id}`).emit(
          "answers-update",
          await distribution(session.id, current.id)
        );
      }
    });
    return;
  }

  sock.disconnect(true);
}
