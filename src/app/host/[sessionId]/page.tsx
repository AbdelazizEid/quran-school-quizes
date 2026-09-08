"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, use } from "react";
import { io, type Socket } from "socket.io-client";
import QRCode from "qrcode";
import { motion, useReducedMotion } from "framer-motion";
import type { SessionState } from "@/lib/session-state";
import CountdownRing from "@/components/CountdownRing";
import { Bubbles, BubblePodium, type BubblePerson, type BubbleTone } from "@/components/Bubbles";
import VoteBar from "@/components/VoteBar";
import Confetti from "@/components/Confetti";
import { TILE_COLORS } from "@/lib/tiles";
import { sfx } from "@/lib/sfx";

const SECTION_EASE = [0.16, 1, 0.3, 1] as const;

type AnswersUpdate = NonNullable<SessionState["answers"]> & { answered: string[] };

export default function HostPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const reduced = useReducedMotion();
  const [state, setState] = useState<SessionState | null>(null);
  const [connected, setConnected] = useState(false);
  const [answersUpdate, setAnswersUpdate] = useState<AnswersUpdate | null>(null);
  const [online, setOnline] = useState<string[] | null>(null);
  const [confettiFire, setConfettiFire] = useState(0);
  const socketRef = useRef<Socket | null>(null);
  const qrRef = useRef<HTMLCanvasElement | null>(null);
  const prevRoster = useRef(0);
  const seenRoster = useRef(false);
  const phaseSeen = useRef<string | null>(null);

  useEffect(() => {
    const socket = io("/session", {
      path: "/socket",
      transports: process.env.NODE_ENV === "production" ? ["websocket", "polling"] : ["polling"],
      query: { role: "host", sessionId },
    });
    socketRef.current = socket;
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("state", (s: SessionState) => {
      setState(s);
      if (s.online) setOnline(s.online);
      // fresh state always carries the answers of the current question
      setAnswersUpdate(null);
      if (s.phase === "CLOSED" && phaseSeen.current !== "CLOSED") {
        setConfettiFire((f) => f + 1);
        sfx.fanfare();
        phaseSeen.current = "CLOSED";
      }
    });
    socket.on("answers-update", (a: AnswersUpdate) => setAnswersUpdate(a));
    socket.on("presence", (ids: string[]) => setOnline(ids));
    return () => {
      socket.disconnect();
    };
  }, [sessionId]);

  const roster = useMemo(() => state?.roster ?? [], [state]);

  // a new bubble flies in with a chime (silent before the first user gesture,
  // and on a page refresh where the roster arrives pre-populated)
  useEffect(() => {
    if (seenRoster.current && roster.length > prevRoster.current) sfx.join();
    seenRoster.current = true;
    prevRoster.current = roster.length;
  }, [roster.length]);

  const hostEmit = (event: "start" | "reveal" | "next" | "end") => {
    socketRef.current?.emit(event);
  };

  const isLast = state ? state.questionIndex + 1 >= state.questionCount : false;

  useEffect(() => {
    if (!state?.joinCode || !qrRef.current) return;
    const url = `${window.location.origin}/join?code=${state.joinCode}`;
    qrRef.current.dataset.qrPayload = url;
    QRCode.toCanvas(qrRef.current, url, {
      width: 220,
      margin: 1,
      color: { dark: "#2a1f10", light: "#f8f4ec" },
    }).catch(() => undefined);
  }, [state?.joinCode, state?.phase]);

  const leaderboard = useMemo(() => state?.leaderboard ?? [], [state]);

  const answeredSet = useMemo(
    () => new Set(answersUpdate?.answered ?? state?.answers?.answered ?? []),
    [answersUpdate, state]
  );

  // a blip rides each bubble turning lit (same baseline logic as the join chime:
  // silent on refresh where answers arrive pre-populated)
  const prevAnswered = useRef(0);
  const seenAnswered = useRef(false);
  useEffect(() => {
    const n = answeredSet.size;
    if (seenAnswered.current && n > prevAnswered.current) sfx.answer();
    seenAnswered.current = true;
    prevAnswered.current = n;
  }, [answeredSet]);
  const onlineSet = useMemo(() => (online === null ? null : new Set(online)), [online]);

  const toneFor = (p: BubblePerson): BubbleTone => {
    if (onlineSet && !onlineSet.has(p.id)) return "deflated";
    switch (state?.phase) {
      case "QUESTION":
        return answeredSet.has(p.id) ? "lit" : "neutral";
      case "ANSWER_REVIEW": {
        const r = state.results?.[p.id];
        if (!r) return "asleep";
        return r.correct ? "correct" : "wrong";
      }
      default:
        return "neutral";
    }
  };

  // points land one by one in answering order (first answer first), each with
  // its prize chime — a slow cascade, not a simultaneous pop
  const pointsByBubble = useMemo(() => {
    if (state?.phase !== "ANSWER_REVIEW" || !state.results) return undefined;
    const ordered = Object.entries(state.results)
      .filter(([, r]) => r.correct)
      .sort((a, b) => a[1].timeMs - b[1].timeMs);
    const out: Record<string, { text: string; delay: number }> = {};
    ordered.forEach(([id, r], i) => {
      out[id] = { text: `+${r.points}`, delay: 0.8 + i * 0.7 };
    });
    return out;
  }, [state]);

  const prizeForRef = useRef<string | null>(null);
  useEffect(() => {
    if (state?.phase !== "ANSWER_REVIEW" || !state.results) return;
    const key = state.question?.id;
    if (!key || prizeForRef.current === key) return;
    prizeForRef.current = key;
    Object.values(state.results)
      .filter((r) => r.correct)
      .sort((a, b) => a.timeMs - b.timeMs)
      .forEach((r, i) => window.setTimeout(() => sfx.prize(), (0.8 + i * 0.7) * 1000));
  }, [state]);

  const podiumPhase = state?.phase === "LEADERBOARD" || state?.phase === "CLOSED";

  // the podium bubbles leave the strip so the same orbs (shared layoutId) fly
  // down to the podium and back up on "next"
  const podiumIds = useMemo(() => new Set(leaderboard.slice(0, 3).map((p) => p.id)), [leaderboard]);
  const stripRoster = useMemo(
    () => (podiumPhase ? roster.filter((p) => !podiumIds.has(p.id)) : roster),
    [podiumPhase, roster, podiumIds]
  );

  if (!state) {
    return <main className="min-h-screen p-10 text-[color:var(--muted-ink)]">جارٍ التحميل…</main>;
  }

  return (
    <main className="min-h-screen px-6 py-10" dir="rtl">
      <Confetti fire={confettiFire} />
      <div className="max-w-5xl mx-auto">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--gold-deep)]" dir="ltr">
            DAR MAKKAH — HOST
          </p>
          <h1 className="mt-2 text-2xl font-bold">{state.quizTitle}</h1>
        </div>
        {state.phase !== "LOBBY" && (
          <p className="text-2xl font-bold tracking-[0.15em] text-[color:var(--lapis)]" dir="ltr">
            {state.joinCode}
          </p>
        )}
      </header>

      {/* the strip lives through the whole session; lobby = scattered, then it docks */}
      <div className="mt-6">
        <Bubbles
          people={stripRoster}
          toneFor={toneFor}
          variant={state.phase === "LOBBY" ? "float" : "strip"}
          orderSeed={state.phase === "LOBBY" ? undefined : state.questionIndex}
          dimmed={podiumPhase}
          pointsByBubble={pointsByBubble}
          ariaLabel={state.phase === "LOBBY" ? "المنضمون" : "طلاب الجلسة"}
        />
      </div>

      {state.phase === "LOBBY" && (
        <section className="mt-2 text-center">
          <p className="text-lg font-semibold text-[color:var(--muted-ink)]">امسح الرمز أو ادخل رقم الجلسة</p>
          <div className="mt-10 flex flex-col items-center justify-center gap-10 sm:flex-row">
            <canvas ref={qrRef} className="qr rounded-md border-2 border-[color:var(--gold)] bg-white p-3" aria-label="امسح الرمز للانضمام" />
            <div>
              <p className="text-sm font-semibold text-[color:var(--muted-ink)]">رقم الجلسة</p>
              <p className="mt-2 text-7xl font-bold tracking-[0.1em] text-[color:var(--gold-deep)] md:text-8xl" dir="ltr">
                {state.joinCode}
              </p>
            </div>
          </div>
          <p className="mt-10 text-xl font-bold">
            {roster.length === 0 ? "شارك الرقم مع الطلاب للانضمام" : `${roster.length} طالبًا في الردهة`}
          </p>
          <div className="mt-10">
            <HostBtn onClick={() => hostEmit("start")} disabled={!connected || roster.length === 0}>
              ابدأ أول سؤال
            </HostBtn>
          </div>
        </section>
      )}

      {state.phase === "QUESTION" && state.question && (
        <motion.section
          key={`q-${state.questionIndex}`}
          initial={reduced ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduced ? 0 : 0.25, duration: 0.6, ease: SECTION_EASE }}
          className="mt-8 max-w-4xl mx-auto"
        >
          <div className="rounded-md border border-[color:var(--rule)] bg-[color:var(--background)] px-6 py-6 text-[color:var(--foreground)] md:px-8">
            <div className="flex items-center justify-between text-sm font-bold text-[color:var(--muted-ink)]">
              <span>
                سؤال {state.questionIndex + 1} / {state.questionCount}
              </span>
            </div>
            <h2 className="mt-5 text-3xl font-bold leading-relaxed text-center text-balance md:text-4xl">
              {state.question.text}
            </h2>
          </div>
          <CountdownRing
            variant="bar"
            className="mt-4"
            startedAt={state.phaseStartedAt}
            durationMs={state.question.timeLimitSec * 1000}
            sound
          />
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {state.question.options.map((o, i) => (
              <div
                key={o.id}
                className="rounded-md px-5 py-6 text-center text-xl font-bold text-white shadow-lg md:text-2xl"
                style={{ background: TILE_COLORS[i % TILE_COLORS.length] }}
              >
                {o.text}
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <HostBtn onClick={() => hostEmit("reveal")} disabled={!connected}>
              اكشف الإجابة
            </HostBtn>
          </div>
        </motion.section>
      )}

      {state.phase === "ANSWER_REVIEW" && state.question && (
        <motion.section
          key={`r-${state.questionIndex}`}
          initial={reduced ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduced ? 0 : 0.25, duration: 0.6, ease: SECTION_EASE }}
          className="mt-8 max-w-4xl mx-auto"
        >
          <div className="flex items-center justify-between text-sm font-semibold text-[color:var(--muted-ink)]">
            <span>
              سؤال {state.questionIndex + 1} / {state.questionCount}
            </span>
            <span dir="ltr">
              {state.answers?.total ?? 0} / {roster.length}
            </span>
          </div>
          <div className="mt-3 rounded-md border border-[color:var(--rule)] bg-[color:var(--background)] px-6 py-5 text-center text-[color:var(--foreground)]">
            <h2 className="text-2xl font-bold leading-relaxed text-balance md:text-3xl">{state.question.text}</h2>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {state.question.options.map((o, i) => (
              <div
                key={o.id}
                className={`relative rounded-md px-5 py-5 text-center text-xl font-bold text-white shadow-lg transition-opacity duration-500 md:text-2xl ${
                  o.isCorrect ? "outline outline-4 outline-offset-4 outline-[color:var(--green)]" : "opacity-55"
                }`}
                style={{ background: TILE_COLORS[i % TILE_COLORS.length] }}
              >
                {o.isCorrect && (
                  <span className="absolute -top-3 -start-3 flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--green)] shadow-md">
                    <svg width="18" height="18" viewBox="0 0 12 12" aria-hidden="true">
                      <path
                        d="M2.5 6.5 L5 9 L9.5 3.5"
                        fill="none"
                        stroke="#ffffff"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                )}
                {o.text}
                <VoteBar
                  light
                  count={state.answers?.counts?.[o.id] ?? 0}
                  total={state.answers?.total ?? 0}
                  correct={o.isCorrect}
                />
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <HostBtn onClick={() => hostEmit("next")}>{isLast ? "اعرض لوحة النتائج" : "التالي"}</HostBtn>
          </div>
        </motion.section>
      )}

      {podiumPhase && (
        <section className="mt-10">
          {state.phase === "LEADERBOARD" && !isLast && (
            <h2 className="mb-8 text-center text-lg font-semibold">
              الترتيب بعد السؤال {state.questionIndex + 1}
            </h2>
          )}
          {state.phase === "CLOSED" && (
            <h2 className="mb-8 text-center text-2xl font-bold">انتهت الجلسة</h2>
          )}
          <BubblePodium rows={leaderboard} />
          <AlsoRan rows={leaderboard} />
          {state.phase === "LEADERBOARD" && (
            <div className="mt-10 text-center">
              <HostBtn onClick={() => hostEmit(isLast ? "end" : "next")}>
                {isLast ? "إنهاء وعرض المنصة" : "السؤال التالي"}
              </HostBtn>
            </div>
          )}
          {state.phase === "CLOSED" && (
            <div className="mt-12 text-center">
              <Link
                href={`/results/${sessionId}`}
                className="inline-block rounded-md border-2 border-[color:var(--gold)] px-8 py-4 text-lg font-semibold text-[color:var(--gold-deep)] transition-colors hover:bg-[color:var(--wash)]"
              >
                عرض النتائج الكاملة
              </Link>
            </div>
          )}
        </section>
      )}
      </div>
    </main>
  );
}

function AlsoRan({ rows }: { rows: BubblePerson[] }) {
  const rest = rows.slice(3);
  if (rest.length === 0) return null;
  return (
    <ol className="mx-auto mt-8 max-w-md border-t border-[color:var(--rule)]" aria-label="بقية الترتيب">
      {rest.map((p, i) => (
        <li key={p.id} className="flex items-center gap-3 border-b border-[color:var(--rule)] px-4 py-2.5">
          <span className="w-7 text-sm tabular-nums text-[color:var(--muted-ink)]">{i + 4}</span>
          <span className="truncate font-semibold">{p.nickname}</span>
          <span className="ms-auto tabular-nums" dir="ltr">
            {p.totalScore}
          </span>
        </li>
      ))}
    </ol>
  );
}

function HostBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-md bg-[color:var(--gold)] px-10 py-4 text-xl font-bold text-white shadow-lg transition-transform active:scale-[0.98] disabled:opacity-50"
    >
      {children}
    </button>
  );
}
