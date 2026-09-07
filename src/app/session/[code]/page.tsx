"use client";

import { useEffect, useRef, useState, use } from "react";
import { io, type Socket } from "socket.io-client";
import { motion, useReducedMotion } from "framer-motion";
import type { SessionState } from "@/lib/session-state";
import CountdownRing from "@/components/CountdownRing";
import Scoreboard from "@/components/Scoreboard";
import Podium from "@/components/Podium";
import VoteBar from "@/components/VoteBar";
import Confetti from "@/components/Confetti";
import { sfx } from "@/lib/sfx";
import { TILE_COLORS } from "@/lib/tiles";
import { CORRECT_CHEERS, WRONG_PATS, pickOne, streakCheer } from "@/lib/cheer";

type JoinResult = { ok: boolean; participantId?: string; nickname?: string; error?: string };
type AnswerResult = { ok: boolean; correct?: boolean; points?: number; bonus?: number; streak?: number };

export default function StudentSessionPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [state, setState] = useState<SessionState | null>(null);
  const [connected, setConnected] = useState(false);
  const [nickname, setNickname] = useState<string | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<AnswerResult | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [timeUp, setTimeUp] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const startedAtRef = useRef<number>(0);
  const [burst, setBurst] = useState(0);
  const [cheerLine, setCheerLine] = useState("");
  const reduced = useReducedMotion();
  const celebratedForRef = useRef<string | null>(null);
  const joinCountRef = useRef(0);
  const finaleRef = useRef(false);

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

  const shown: AnswerResult | null =
    state?.phase === "ANSWER_REVIEW"
      ? lastResult ??
        (meId && state.results?.[meId] ? ({ ok: true, ...state.results[meId] } as AnswerResult) : null)
      : null;

  useEffect(() => {
    if (state?.phase === "QUESTION" && state.question) {
      startedAtRef.current = Date.now();
      setLastResult(null);
      setPickedId(null);
      setTimeUp(false);
    }
  }, [state?.phase, state?.question?.id]);

  // one celebration per question reveal: cheer copy, chime, confetti
  useEffect(() => {
    if (state?.phase !== "ANSWER_REVIEW") return;
    const key = state.question?.id;
    if (!key || celebratedForRef.current === key) return;
    celebratedForRef.current = key;
    if (shown?.correct) {
      setCheerLine(pickOne(CORRECT_CHEERS));
      sfx.correct();
      setBurst((b) => b + 1);
    } else {
      setCheerLine(pickOne(WRONG_PATS));
      sfx.wrong();
    }
  }, [state?.phase, state?.question?.id, shown]);

  // final podium: fanfare + one golden shower
  useEffect(() => {
    const finale = state?.phase === "CLOSED" || (state?.phase === "LEADERBOARD" && isLast);
    if (!finale || finaleRef.current) return;
    finaleRef.current = true;
    sfx.fanfare();
    setBurst((b) => b + 1);
  }, [state?.phase, isLast]);

  // lobby: a soft pop as each classmate lands
  useEffect(() => {
    const n = state?.roster?.length ?? 0;
    if (n > joinCountRef.current) sfx.join();
    joinCountRef.current = n;
  }, [state?.roster?.length]);

  function pick(optionId: string) {
    if (timeUp) return;
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
      <Confetti fire={burst} />
      <header className="flex items-baseline justify-between text-sm text-[color:var(--muted-ink)]">
        <span>{state.quizTitle}</span>
        {nickname && <span>أنت: {nickname}</span>}
      </header>

      {state.phase === "LOBBY" && (
        <section className="mt-16 text-center">
          <div className="medallion medallion-breathe" />
          <h1 className="mt-6 text-2xl font-bold">في انتظار بدء الجلسة</h1>
          <p className="mt-3 text-[color:var(--muted-ink)]">
            <span
              key={state.roster?.length ?? 0}
              className="sb-enter inline-block tabular-nums font-bold text-xl text-[color:var(--foreground)]"
            >
              {state.roster?.length ?? 0}
            </span>{" "}
            طالبًا في الردهة
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
              sound
              onEnd={() => setTimeUp(true)}
            />
          </div>
          <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-[color:var(--rule)]">
            <div
              className="h-full bg-[color:var(--gold)] transition-all duration-500"
              style={{ width: `${(state.questionIndex / state.questionCount) * 100}%` }}
            />
          </div>
          <motion.div
            key={state.question.id}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            <h1 className="mt-6 text-2xl md:text-3xl font-bold leading-relaxed text-center text-balance">
              {state.question.text}
            </h1>
            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              {state.question.options.map((o, i) => {
                const tile = TILE_COLORS[i % TILE_COLORS.length];
                const picked = pickedId === o.id;
                return (
                  <button
                    key={o.id}
                    onClick={() => pick(o.id)}
                    disabled={timeUp}
                    className={`relative rounded-md px-4 py-6 text-center text-xl font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-40 ${
                      picked ? "outline outline-4 outline-offset-2 outline-white" : "hover:opacity-90"
                    }`}
                    style={{ background: tile }}
                  >
                    {picked && (
                      <span className="absolute -top-2 -start-2 flex h-6 w-6 items-center justify-center rounded-full bg-white shadow">
                        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                          <path
                            d="M2.5 6.5 L5 9 L9.5 3.5"
                            fill="none"
                            stroke={tile}
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                    )}
                    {o.text}
                  </button>
                );
              })}
            </div>
          </motion.div>
          {timeUp ? (
            <p className="mt-8 text-center text-[color:var(--muted-ink)] result-in">
              انتهى الوقت — انتظر كشف النتيجة
            </p>
          ) : pickedId ? (
            <p className="mt-8 text-center text-[color:var(--muted-ink)] result-in">
              يمكنك تغيير إجابتك قبل انتهاء الوقت
            </p>
          ) : null}
        </section>
      )}

      {state.phase === "ANSWER_REVIEW" && state.question && (
        <section className="mt-6">
          <div className="flex items-center justify-between text-sm">
            <span className="text-[color:var(--muted-ink)]">
              سؤال {state.questionIndex + 1} من {state.questionCount}
            </span>
          </div>
          {shown && (
            <motion.div
              className="mt-3 text-center"
              initial={{ opacity: 0, y: 14, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 320, damping: 24 }}
            >
              <p className="flex items-baseline justify-center gap-3">
                <span
                  className="text-2xl font-bold"
                  style={{ color: shown.correct ? "var(--green-deep)" : "var(--red)" }}
                >
                  {shown.correct ? "إجابة صحيحة!" : "إجابة غير صحيحة"}
                </span>
                {shown.correct && (
                  <span className="text-xl font-semibold text-[color:var(--lapis)] tabular-nums" dir="ltr">
                    +{shown.points}
                  </span>
                )}
              </p>
              <p
                className={`mt-0.5 flex flex-wrap items-center justify-center gap-x-3 text-sm font-semibold ${
                  shown.correct ? "text-[color:var(--lapis)]" : "text-[color:var(--muted-ink)]"
                }`}
              >
                <span>{cheerLine}</span>
                {shown.correct && (shown.streak ?? 0) >= 2 && (
                  <span className="inline-flex items-center gap-1.5 text-[color:var(--gold-deep)]">
                    <Spark />
                    {streakCheer(shown.streak ?? 0)} ×{shown.streak} — مكافأة +{shown.bonus}
                  </span>
                )}
              </p>
            </motion.div>
          )}
          <h1 className="mt-5 text-lg md:text-xl font-bold leading-relaxed text-center text-balance">
            {state.question.text}
          </h1>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {state.question.options.map((o) => (
              <div
                key={o.id}
                className={`px-4 py-2.5 rounded-sm border-2 ${
                  o.isCorrect
                    ? "border-[color:var(--green)] bg-[color:var(--green-wash)]"
                    : pickedId === o.id
                      ? "border-[color:var(--red)] opacity-80 result-shake"
                      : "border-[color:var(--rule)] opacity-60"
                }`}
              >
                {o.isCorrect && (
                  <div className="text-xs font-bold tracking-wide text-[color:var(--green-deep)] text-center">
                    الإجابة الصحيحة
                  </div>
                )}
                <div className={`text-center text-base md:text-lg ${o.isCorrect ? "font-bold" : ""}`}>{o.text}</div>
                <VoteBar
                  compact
                  count={state.answers?.counts?.[o.id] ?? 0}
                  total={state.answers?.total ?? 0}
                  correct={o.isCorrect}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {state.phase === "LEADERBOARD" && !isLast && (
        <section className="mt-10">
          <h1 className="text-xl font-bold">لوحة النتائج</h1>
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
          <p className="mt-6 text-xl font-bold text-[color:var(--gold-deep)]">أحسنتم جميعًا!</p>
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
