"use client";

import Link from "next/link";
import { useEffect, useRef, useState, use } from "react";
import { io, type Socket } from "socket.io-client";
import QRCode from "qrcode";
import type { SessionState } from "@/lib/session-state";
import CountdownRing from "@/components/CountdownRing";
import Scoreboard from "@/components/Scoreboard";
import Podium from "@/components/Podium";
import VoteBar from "@/components/VoteBar";

export default function HostPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const [state, setState] = useState<SessionState | null>(null);
  const [connected, setConnected] = useState(false);
  const [answeredCount, setAnsweredCount] = useState(0);
  const socketRef = useRef<Socket | null>(null);
  const qrRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const socket = io("/session", {
      path: "/socket",
      transports: process.env.NODE_ENV === "production" ? ["websocket", "polling"] : ["polling"],
      query: { role: "host", sessionId },
    });
    socketRef.current = socket;
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("state", (s: SessionState) => setState(s));
    socket.on("answers-update", (a: { total: number }) => setAnsweredCount(a.total));
    return () => {
      socket.disconnect();
    };
  }, [sessionId]);

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

  if (!state) {
    return <main className="min-h-screen p-10 text-[color:var(--muted-ink)]">جارٍ التحميل…</main>;
  }

  const roster = state.roster ?? [];

  return (
    <main className="min-h-screen px-6 py-10 max-w-5xl mx-auto" dir="rtl">
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

      {state.phase === "LOBBY" && (
        <section className="mt-12">
          <h2 className="text-lg font-semibold">الردهة — {roster.length} طالبًا</h2>
          <ul className="mt-6 flex flex-wrap gap-3" aria-label="المنضمون">
            {roster.map((p) => (
              <li key={p.id} className="px-5 py-3 border border-[color:var(--rule)] rounded-sm sb-enter">
                {p.nickname}
              </li>
            ))}
            {roster.length === 0 && (
              <li className="text-[color:var(--muted-ink)]">شارك الرقم مع الطلاب للانضمام</li>
            )}
          </ul>
          <div className="mt-10">
            <HostBtn onClick={() => hostEmit("start")} disabled={!connected}>
              ابدأ أول سؤال
            </HostBtn>
          </div>
        </section>
      )}

      {state.phase === "QUESTION" && state.question && (
        <section className="mt-12 max-w-2xl mx-auto text-center">
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
              <span className="block mt-1">
                أجاب <span className="font-bold text-[color:var(--foreground)] tabular-nums">{answeredCount}</span> من{" "}
                {roster.length}
              </span>
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
        <section className="mt-12 max-w-2xl mx-auto">
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

      {state.phase === "LEADERBOARD" && !isLast && (
        <section className="mt-12">
          <div className="flex items-center justify-between max-w-xl mx-auto">
            <h2 className="text-lg font-semibold">الترتيب بعد السؤال {state.questionIndex + 1}</h2>
          </div>
          <div className="mt-6" />
          <div className="mt-10 text-center">
            <HostBtn onClick={() => hostEmit("next")}>السؤال التالي</HostBtn>
          </div>
        </section>
      )}

      {/* mounted for the whole session: keeps row positions so each new
          scoreboard animates the rewrite from the previous one */}
      <div className={state.phase === "LEADERBOARD" && !isLast ? "mt-2" : "hidden"}>
        <Scoreboard rows={state.phase === "LEADERBOARD" && !isLast ? state.leaderboard ?? [] : []} />
      </div>

      {state.phase === "LEADERBOARD" && isLast && (
        <section className="mt-16">
          <h2 className="text-center text-2xl font-bold">لوحة النتائج</h2>
          <div className="mt-10">
            <Podium rows={state.leaderboard ?? []} />
          </div>
          <div className="mt-12 text-center">
            <HostBtn onClick={() => hostEmit("end")}>إنهاء وعرض المنصة</HostBtn>
          </div>
        </section>
      )}

      {state.phase === "CLOSED" && (
        <section className="mt-16 text-center">
          <h2 className="text-2xl font-bold">انتهت الجلسة</h2>
          <div className="mt-10">
            <Podium rows={state.leaderboard ?? []} />
          </div>
          <Link
            href={`/results/${sessionId}`}
            className="inline-block mt-10 px-8 py-4 text-lg font-semibold rounded-sm border border-[color:var(--gold)] text-[color:var(--foreground)] hover:bg-[color:var(--wash)]"
          >
            عرض النتائج الكاملة
          </Link>
        </section>
      )}
    </main>
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
