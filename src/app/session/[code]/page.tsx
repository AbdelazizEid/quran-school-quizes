"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { motion } from "framer-motion";
import type { SessionState } from "@/lib/session-state";
import { REVIEW_MS, SCOREBOARD_MS, phaseMs } from "@/lib/timing";
import CountdownRing from "@/components/CountdownRing";
import Scoreboard from "@/components/Scoreboard";
import Podium from "@/components/Podium";

type JoinResult = { ok: boolean; participantId?: string; nickname?: string; error?: string };
type AnswerResult = { ok: boolean; correct?: boolean; points?: number; bonus?: number; streak?: number };

export default function StudentSessionPage({ params }: { params: { code: string } }) {
  const { code } = params;
  const [state, setState] = useState<SessionState | null>(null);
  const [connected, setConnected] = useState(false);
  const [nickname, setNickname] = useState<string | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<AnswerResult | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const startedAtRef = useRef<number>(0);
  const answeredRef = useRef(false);

  useEffect(() => {
    const socket = io("/session", {
      path: "/socket",
      transports: process.env.NODE_ENV === "production" ? ["websocket", "polling"] : ["polling"],
      query: { role: "student" },
    });
    socketRef.current = socket;
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("state", (s: SessionState) => setState(s));

    const pid = sessionStorage.getItem(`participant:${code}`);
    socket.on("connect", () => {
      socket.emit(
        "join",
        { code, nickname: "دخول-مباشر", participantId: pid ?? undefined },
        (r: JoinResult) => {
          if (r.ok) {
            setNickname(r.nickname ?? null);
            if (r.participantId) {
              setMeId(r.participantId);
              sessionStorage.setItem(`participant:${code}`, r.participantId);
            }
          }
        }
      );
    });

    return () => {
      socket.disconnect();
    };
  }, [code]);

  const isLast = state ? state.questionIndex + 1 >= state.questionCount : false;

  useEffect(() => {
    if (state?.phase === "QUESTION" && state.question) {
      startedAtRef.current = Date.now();
      answeredRef.current = false;
      setLastResult(null);
      setPickedId(null);
    }
  }, [state?.phase, state?.question?.id]);

  function pick(optionId: string) {
    if (answeredRef.current) return;
    answeredRef.current = true;
    setPickedId(optionId);
    const timeMs = Date.now() - startedAtRef.current;
    socketRef.current?.emit("answer", { optionId, timeMs }, (r: AnswerResult) => {
      setLastResult(r);
    });
  }

  if (!connected && !state) {
    return <Shell><p className="text-[color:var(--muted-ink)]">جارٍ الاتصال…</p></Shell>;
  }

  if (!state) {
    return <Shell><p className="text-[color:var(--red)]">لم يتم العثور على الجلسة.</p></Shell>;
  }

  const scoreboardOn = state.phase === "LEADERBOARD" && !isLast;

  return (
    <Shell>
      <header className="flex items-baseline justify-between text-sm text-[color:var(--muted-ink)]">
        <span>{state.quizTitle}</span>
        {nickname && <span>أنت: {nickname}</span>}
      </header>

      {state.phase === "LOBBY" && (
        <section className="mt-16 text-center">
          <div className="medallion" />
          <h1 className="mt-6 text-2xl font-bold">في انتظار بدء الجلسة</h1>
          <p className="mt-3 text-[color:var(--muted-ink)]">
            {state.roster?.length ?? 0} طالبًا في الردهة
          </p>
          {state.roster && state.roster.length > 0 && (
            <ul className="mt-8 flex flex-wrap justify-center gap-2">
              {state.roster.map((p) => (
                <li key={p.id} className="border border-[color:var(--rule)] px-4 py-2 rounded-sm sb-enter">
                  {p.nickname}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {state.phase === "QUESTION" && state.question && (
        <section className="mt-8">
          <div className="flex items-center justify-between text-sm">
            <span className="text-[color:var(--muted-ink)]">
              سؤال {state.questionIndex + 1} من {state.questionCount}
            </span>
            <CountdownRing
              startedAt={state.phaseStartedAt}
              durationMs={state.question.timeLimitSec * 1000}
              size={64}
            />
          </div>
          <h1 className="mt-6 text-2xl md:text-3xl font-bold leading-relaxed text-center text-balance">
            {state.question.text}
          </h1>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {state.question.options.map((o) => (
              <button
                key={o.id}
                onClick={() => pick(o.id)}
                disabled={answeredRef.current}
                className={`py-6 text-xl border-2 rounded-sm bg-[color:var(--background)] transition-transform active:scale-[0.98] disabled:opacity-40 ${
                  pickedId === o.id
                    ? "border-[color:var(--gold)] bg-[color:var(--wash)]"
                    : "border-[color:var(--lapis)] hover:bg-[color:var(--wash)]"
                }`}
              >
                {o.text}
              </button>
            ))}
          </div>
          {pickedId && (
            <p className="mt-8 text-center text-[color:var(--muted-ink)] result-in">
              تم إرسال إجابتك — انتظر كشف النتيجة
            </p>
          )}
        </section>
      )}

      {state.phase === "ANSWER_REVIEW" && state.question && (
        <section className="mt-8">
          <div className="flex items-center justify-between text-sm">
            <span className="text-[color:var(--muted-ink)]">
              سؤال {state.questionIndex + 1} من {state.questionCount}
            </span>
            <CountdownRing startedAt={state.phaseStartedAt} durationMs={phaseMs(REVIEW_MS)} size={64} tone="gold" />
          </div>
          <h1 className="mt-6 text-2xl md:text-3xl font-bold leading-relaxed text-center text-balance">
            {state.question.text}
          </h1>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {state.question.options.map((o) => (
              <div
                key={o.id}
                className={`py-6 text-xl text-center rounded-sm border-2 ${
                  o.isCorrect
                    ? "border-[color:var(--gold)] bg-[color:var(--wash)] font-bold"
                    : pickedId === o.id
                      ? "border-[color:var(--red)] opacity-80"
                      : "border-[color:var(--rule)] opacity-60"
                }`}
              >
                {o.text}
              </div>
            ))}
          </div>
          {(() => {
            const shown = lastResult ?? (meId && state.results?.[meId] ? { ok: true as const, ...state.results[meId] } : null);
            return shown ? (
            <motion.div
              className="mt-8 text-center"
              initial={{ opacity: 0, y: 14, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 320, damping: 24 }}
            >
                <p
                className="text-2xl font-bold"
                style={{ color: shown.correct ? "var(--gold-deep)" : "var(--red)" }}
              >
                {shown.correct ? "إجابة صحيحة!" : "إجابة غير صحيحة"}
              </p>
              {shown.correct && (
                <p className="mt-2 text-xl font-semibold text-[color:var(--lapis)] tabular-nums" dir="ltr">
                  +{shown.points}
                </p>
              )}
              {shown.correct && (shown.streak ?? 0) >= 2 && (
                <p className="mt-3 inline-flex items-center gap-2 text-[color:var(--gold-deep)] font-semibold">
                  <Spark />
                  سلسلة ×{shown.streak} — مكافأة +{shown.bonus}
                </p>
              )}
            </motion.div>
            ) : null;
          })()}
        </section>
      )}

      {state.phase === "LEADERBOARD" && !isLast && (
        <section className="mt-10">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold">لوحة النتائج</h1>
            <CountdownRing startedAt={state.phaseStartedAt} durationMs={phaseMs(SCOREBOARD_MS)} size={64} tone="gold" />
          </div>
          <p className="mt-2 text-sm text-[color:var(--muted-ink)]">السؤال التالي يبدأ بعد لحظات</p>
        </section>
      )}

      <div className={scoreboardOn ? "mt-6" : "hidden"}>
        <Scoreboard rows={scoreboardOn ? state.leaderboard ?? [] : []} meId={meId} />
      </div>

      {state.phase === "LEADERBOARD" && isLast && (
        <section className="mt-10 text-center">
          <h1 className="text-2xl font-bold">لوحة النتائج</h1>
          <div className="mt-8">
            <Podium rows={state.leaderboard ?? []} />
          </div>
        </section>
      )}

      {state.phase === "CLOSED" && (
        <section className="mt-10 text-center">
          <h1 className="text-2xl font-bold">النتائج النهائية</h1>
          <div className="mt-8">
            <Podium rows={state.leaderboard ?? []} />
          </div>
          <p className="mt-10 text-[color:var(--muted-ink)]">انتهت الجلسة، شكرًا لمشاركتك.</p>
        </section>
      )}
    </Shell>
  );
}

function Spark() {
  return (
    <svg className="sb-spark" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        d="M9 1 L10.8 6.6 L16.5 7 L12.2 10.6 L13.7 16.2 L9 13.2 L4.3 16.2 L5.8 10.6 L1.5 7 L7.2 6.6 Z"
        fill="none"
        stroke="var(--gold)"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen px-5 py-8 max-w-3xl mx-auto">{children}</main>;
}
