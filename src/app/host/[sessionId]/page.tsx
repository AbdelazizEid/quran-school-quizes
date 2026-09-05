"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, use } from "react";
import { io, type Socket } from "socket.io-client";
import QRCode from "qrcode";
import type { SessionState } from "@/lib/session-state";
import CountdownRing from "@/components/CountdownRing";
import { Bubbles, BubblePodium, type BubblePerson, type BubbleTone } from "@/components/Bubbles";
import VoteBar from "@/components/VoteBar";
import Confetti from "@/components/Confetti";
import { sfx } from "@/lib/sfx";

type AnswersUpdate = NonNullable<SessionState["answers"]> & { answered: string[] };

export default function HostPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
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

  const roster = state?.roster ?? [];

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

  const leaderboard = state?.leaderboard ?? [];

  const answeredSet = useMemo(
    () => new Set(answersUpdate?.answered ?? state?.answers?.answered ?? []),
    [answersUpdate, state]
  );
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

  // points ride the correct bubbles only during the reveal
  const pointsByBubble = useMemo(() => {
    if (state?.phase !== "ANSWER_REVIEW" || !state.results) return undefined;
    const out: Record<string, string> = {};
    for (const [id, r] of Object.entries(state.results)) {
      if (r.correct) out[id] = `+${r.points}`;
    }
    return out;
  }, [state]);

  const podiumPhase = state?.phase === "LEADERBOARD" || state?.phase === "CLOSED";

  if (!state) {
    return <main className="min-h-screen p-10 text-[color:var(--muted-ink)]">جارٍ التحميل…</main>;
  }

  return (
    <main className="min-h-screen px-6 py-10 max-w-5xl mx-auto" dir="rtl">
      <Confetti fire={confettiFire} />
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--gold-deep)]" dir="ltr">
            DAR MAKKAH — HOST
          </p>
          <h1 className="mt-2 text-2xl font-bold">{state.quizTitle}</h1>
        </div>
        <div className="text-center">
          <p className="text-xs text-[color:var(--muted-ink)]">رقم الجلسة</p>
          <p className="text-4xl font-bold tracking-[0.15em] text-[color:var(--lapis)]" dir="ltr">
            {state.joinCode}
          </p>
          {state.phase === "LOBBY" && (
            <div className="mt-4 flex flex-col items-center gap-2">
              <canvas ref={qrRef} className="qr border-2 border-[color:var(--gold)] rounded-sm" aria-label="امسح الرمز للانضمام" />
              <p className="text-sm text-[color:var(--muted-ink)]">امسح الرمز أو ادخل الرقم أعلاه</p>
            </div>
          )}
        </div>
      </header>

      {/* the strip lives through the whole session; lobby = scattered, then it docks */}
      <div className="mt-6">
        <Bubbles
          people={roster}
          toneFor={toneFor}
          variant={state.phase === "LOBBY" ? "float" : "strip"}
          orderSeed={state.phase === "LOBBY" ? undefined : state.questionIndex}
          dimmed={podiumPhase}
          pointsByBubble={pointsByBubble}
          ariaLabel={state.phase === "LOBBY" ? "المنضمون" : "طلاب الجلسة"}
        />
      </div>

      {state.phase === "LOBBY" && (
        <section>
          <p className="text-center text-[color:var(--muted-ink)]">
            {roster.length === 0 ? "شارك الرقم مع الطلاب للانضمام" : `الردهة — ${roster.length} طالبًا`}
          </p>
          <div className="mt-8 text-center">
            <HostBtn onClick={() => hostEmit("start")} disabled={!connected || roster.length === 0}>
              ابدأ أول سؤال
            </HostBtn>
          </div>
        </section>
      )}

      {state.phase === "QUESTION" && state.question && (
        <section className="mt-10 max-w-2xl mx-auto text-center">
          <div className="flex items-center justify-center gap-6">
            <CountdownRing
              startedAt={state.phaseStartedAt}
              durationMs={state.question.timeLimitSec * 1000}
              size={96}
              minSizeText="text-3xl"
              sound
            />
            <p className="text-[color:var(--muted-ink)]">
              سؤال {state.questionIndex + 1} / {state.questionCount}
            </p>
          </div>
          <h2 className="mt-8 text-2xl md:text-3xl font-bold leading-relaxed">{state.question.text}</h2>
          <div className="mt-10">
            <HostBtn onClick={() => hostEmit("reveal")} disabled={!connected}>
              اكشف الإجابة
            </HostBtn>
          </div>
        </section>
      )}

      {state.phase === "ANSWER_REVIEW" && state.question && (
        <section className="mt-10 max-w-2xl mx-auto">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[color:var(--muted-ink)]">
              سؤال {state.questionIndex + 1} / {state.questionCount}
            </p>
            <p className="text-sm text-[color:var(--muted-ink)]" dir="ltr">
              {state.answers?.total ?? 0} / {roster.length}
            </p>
          </div>
          <h2 className="mt-4 text-center text-xl md:text-2xl font-bold leading-relaxed">
            {state.question.text}
          </h2>
          <div className="mt-6 grid sm:grid-cols-2 gap-3">
            {state.question.options.map((o) => (
              <div
                key={o.id}
                className={`px-4 py-3 text-center border rounded-sm ${
                  o.isCorrect
                    ? "border-[color:var(--gold)] bg-[color:var(--wash)] font-bold"
                    : "border-[color:var(--rule)] opacity-70"
                }`}
              >
                {o.text}
                <VoteBar
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
        </section>
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
                className="inline-block px-8 py-4 text-lg font-semibold rounded-sm border border-[color:var(--gold)] text-[color:var(--foreground)] hover:bg-[color:var(--wash)]"
              >
                عرض النتائج الكاملة
              </Link>
            </div>
          )}
        </section>
      )}
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
      className="px-8 py-4 text-lg font-semibold rounded-sm bg-[color:var(--foreground)] text-[color:var(--background)] disabled:opacity-50 active:scale-[0.98] transition-transform"
    >
      {children}
    </button>
  );
}
